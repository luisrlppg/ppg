import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { MotivoStock } from "@ppg/db";
import { dec } from "../common/util";
import { PrismaService } from "../prisma/prisma.service";
import { MonitorService } from "../monitor/monitor.service";
import { ProductosService } from "../productos/productos.service";
import { ensamblar, EnsambleParams } from "./inventario.ensamble";

@Injectable()
export class InventarioService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly monitor: MonitorService,
    private readonly productos: ProductosService,
  ) {}

  // ------------------------------------------------------------ Ubicaciones
  ubicaciones() {
    return this.prisma.location.findMany({ orderBy: { id: "asc" } });
  }

  crearUbicacion(nombre: string, tipo: string) {
    return this.prisma.location.create({
      data: { nombre: nombre.trim(), tipo: tipo === "temporal" ? "temporal" : "almacen" },
    });
  }

  async editarUbicacion(id: number, data: { nombre?: string; tipo?: string }) {
    const exists = await this.prisma.location.findUnique({ where: { id } });
    if (!exists) throw new NotFoundException("Ubicación no encontrada");
    return this.prisma.location.update({
      where: { id },
      data: {
        ...(data.nombre !== undefined ? { nombre: data.nombre.trim() } : {}),
        ...(data.tipo !== undefined ? { tipo: data.tipo === "temporal" ? "temporal" : "almacen" } : {}),
      },
    });
  }

  // -------------------------------------------------------------- Existencia
  async existencia() {
    const variants = await this.prisma.productVariant.findMany({
      where: { activo: true },
      include: {
        product: { select: { id: true, nombre: true, uom: true, activo: true } },
        stockLevels: { include: { location: true } },
      },
      orderBy: { nombre: "asc" },
    });
    return variants
      .filter((v) => v.product.activo)
      .map((v) => {
        const porUbicacion = Object.fromEntries(
          v.stockLevels.map((l) => [l.locationId, { location: l.location.nombre, qty: dec(l.qty) }]),
        );
        const total = v.stockLevels.reduce((a, l) => a + dec(l.qty), 0);
        return {
          variantId: v.id,
          sku: v.sku,
          nombre: v.nombre,
          productoId: v.productId,
          producto: v.product.nombre,
          uom: v.product.uom,
          stockActual: total,
          stockMin: dec(v.stockMin),
          stockMax: dec(v.stockMax),
          longLead: v.longLead,
          publicado: v.published,
          estado: total <= dec(v.stockMin) && dec(v.stockMin) > 0 ? (v.longLead ? "critico" : "bajo") : "normal",
          porUbicacion,
        };
      });
  }

  async existenciaDe(variantId: number) {
    const v = await this.prisma.productVariant.findUnique({
      where: { id: variantId },
      include: {
        product: { include: { category: true } },
        stockLevels: { include: { location: true } },
        packagings: { include: { packaging: true } },
      },
    });
    if (!v) throw new NotFoundException("Variante no encontrada");
    return {
      variantId: v.id,
      sku: v.sku,
      nombre: v.nombre,
      producto: v.product.nombre,
      uom: v.product.uom,
      stockMin: dec(v.stockMin),
      stockMax: dec(v.stockMax),
      longLead: v.longLead,
      stockActual: v.stockLevels.reduce((a, l) => a + dec(l.qty), 0),
      packagings: v.packagings.map((p) => ({ packagingId: p.packagingId, nombre: p.packaging.nombre, cantidad: dec(p.cantidad) })),
      porUbicacion: v.stockLevels.map((l) => ({ locationId: l.locationId, location: l.location.nombre, qty: dec(l.qty) })),
      movimientos: await this.prisma.stockMove.findMany({
        where: { variantId: v.id },
        orderBy: { createdAt: "desc" },
        take: 20,
      }),
    };
  }

  movimientos(query: { variantId?: number; limit?: number }) {
    return this.prisma.stockMove.findMany({
      where: query.variantId ? { variantId: query.variantId } : undefined,
      orderBy: { createdAt: "desc" },
      take: Math.min(query.limit ?? 100, 500),
      include: { variant: { select: { sku: true, nombre: true } }, location: { select: { nombre: true } } },
    });
  }

  // --------------------------------------------------- Movimiento directo
  async movimiento(
    params: {
      variantId: number;
      locationId: number;
      motivo: MotivoStock;
      cantidad: number;
      ref?: string;
      userId?: number;
    },
  ): Promise<{ resultado: { antes: number; despues: number; notificado: string[] } }> {
    const { variantId, locationId } = params;
    if (params.cantidad === 0) throw new BadRequestException("La cantidad debe ser distinta de 0");

    const location = await this.prisma.location.findUnique({ where: { id: locationId } });
    if (!location) throw new NotFoundException("Ubicación no encontrada");

    const existing = await this.prisma.stockLevel.findUnique({
      where: { variantId_locationId: { variantId, locationId } },
    });
    const actual = existing ? dec(existing.qty) : 0;
    const despues = actual + params.cantidad;
    if (despues < 0) {
      throw new BadRequestException(
        `Stock insuficiente en "${location.nombre}": hay ${actual} y se intentan ${-params.cantidad}`,
      );
    }

    const sfx = await this.prisma.$transaction(async (tx) => {
      await tx.stockLevel.upsert({
        where: { variantId_locationId: { variantId, locationId } },
        update: { qty: { increment: params.cantidad } },
        create: { variantId, locationId, qty: params.cantidad },
      });
      return tx.stockMove.create({
        data: {
          variantId,
          locationId,
          qty: params.cantidad,
          motivo: params.motivo,
          ref: params.ref ?? null,
          userId: params.userId ?? null,
        },
      });
    });

    const notificado = await this.monitor.afterStockChange(variantId);
    return { resultado: { antes: actual, despues, notificado: notificado.canales } };
  }

  // ------------------------------------------------------------- Transferir
  async mover(params: {
    variantId: number;
    fromLocationId: number;
    toLocationId: number;
    cantidad: number;
    ref?: string;
    userId?: number;
  }) {
    const { variantId, fromLocationId, toLocationId, cantidad } = params;
    if (fromLocationId === toLocationId) throw new BadRequestException("Origen y destino son la misma ubicación");
    if (cantidad <= 0) throw new BadRequestException("La cantidad debe ser mayor a 0");

    const from = await this.prisma.location.findUnique({ where: { id: fromLocationId } });
    const to = await this.prisma.location.findUnique({ where: { id: toLocationId } });
    if (!from) throw new NotFoundException("Ubicación origen no encontrada");
    if (!to) throw new NotFoundException("Ubicación destino no encontrada");

    return this.prisma.$transaction(async (tx) => {
      const level = await tx.stockLevel.findUnique({
        where: { variantId_locationId: { variantId, locationId: fromLocationId } },
      });
      const actual = level ? dec(level.qty) : 0;
      if (actual < cantidad) {
        throw new BadRequestException(
          `Stock insuficiente en "${from.nombre}": hay ${actual} y se quieren mover ${cantidad}`,
        );
      }
      await tx.stockLevel.update({
        where: { variantId_locationId: { variantId, locationId: fromLocationId } },
        data: { qty: { decrement: cantidad } },
      });
      await tx.stockLevel.upsert({
        where: { variantId_locationId: { variantId, locationId: toLocationId } },
        update: { qty: { increment: cantidad } },
        create: { variantId, locationId: toLocationId, qty: cantidad },
      });
      const ref = params.ref ?? `transferencia ${cantidad} a "${to.nombre}"`;
      await tx.stockMove.createMany({
        data: [
          { variantId, locationId: fromLocationId, qty: -cantidad, motivo: "transferencia", ref, userId: params.userId ?? null },
          { variantId, locationId: toLocationId, qty: cantidad, motivo: "transferencia", ref, userId: params.userId ?? null },
        ],
      });
    });

    const notificado = await this.monitor.afterStockChange(variantId);
    return { ok: true, notificado: notificado.canales };
  }

  // ------------------------------------------------------- Ensamble con BOM
  /**
   * Registra un ensamble de un combo (producto con BOM). Consume los
   * componentes EXACTOS resolviendo la variante correcta por atributos
   * (multi-nivel) y suma el producto terminado a la ubicación indicada.
   */
  async ensamble(params: EnsambleParams) {
    return ensamblar(
      {
        prisma: this.prisma,
        resolveComponentVariant: (p, c) => this.productos.resolveComponentVariant(p, c),
        afterStockChange: (v) => this.monitor.afterStockChange(v),
      },
      params,
    );
  }

  // ------------------------------------------------------------- Export CSV
  async exportarCSV(): Promise<string> {
    const rows = await this.existencia();
    const sep = ",";
    const esc = (v: number | string) => `"${String(v).replace(/"/g, '""')}"`;
    const head = ["sku", "producto", "variante", "uom", "stock_actual", "stock_min", "stock_max", "estado", "long_lead"];
    const lines = [
      head.join(sep),
      ...rows.map((r) =>
        [r.sku, r.producto, r.nombre, r.uom, r.stockActual, r.stockMin, r.stockMax, r.estado, r.longLead]
          .map((v) => esc(v as number | string))
          .join(sep),
      ),
    ];
    return "\uFEFF" + lines.join("\r\n");
  }
}