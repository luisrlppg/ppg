import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { MotivoStock } from "@ppg/db";
import { dec } from "../common/util";
import { PrismaService } from "../prisma/prisma.service";
import { MonitorService } from "../monitor/monitor.service";
import { ProductosService } from "../productos/productos.service";

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
  async ensamble(params: {
    variantId: number;
    cantidad: number;
    locationId: number;
    ref?: string;
    userId?: number;
  }) {
    const { variantId, cantidad } = params;
    if (cantidad <= 0) throw new BadRequestException("La cantidad debe ser mayor a 0");

    const combo = await this.prisma.productVariant.findUnique({
      where: { id: variantId },
      include: {
        product: { include: { components: { include: { component: true } } } },
        variantAttributes: true,
      },
    });
    if (!combo) throw new NotFoundException("Variante no encontrada");

    const componentes = combo.product.components.filter((c) => c.tipo === "exacto");
    if (componentes.length === 0) {
      throw new BadRequestException(
        `${combo.product.nombre} no tiene componentes "exacto" en su BOM; no se puede ensamblar.`,
      );
    }

    // Expande el BOM a hojas exactas (multi-nivel).
    const leaves: { variantId: number; sku: string; nombre: string; cantidad: number }[] = [];
    const visite = new Set<string>();
    const expandir = async (productId: number, attr: { attributeId: number; valueId: number }[], factor: number) => {
      const key = `${productId}:${attr.map((a) => a.valueId).join(",")}`;
      if (visite.has(key)) throw new BadRequestException("BOM con dependencia circular");
      visite.add(key);
      try {
        const product = await this.prisma.product.findUnique({
          where: { id: productId },
          include: {
            components: { include: { component: true } },
            variants: { include: { variantAttributes: true } },
          },
        });
        if (!product) return;

        if (product.components.length === 0 || product.components.every((c) => c.tipo === "consumible")) {
          // Hoja: consumir una variante.
          const comboOf = {
            productId: combo.productId,
            variantAttributes: combo.variantAttributes,
          };
          if (productId === combo.productId) {
            throw new BadRequestException("BOM circular: el producto se usa a sí mismo");
          }
          const resolved = await this.productos.resolveComponentVariant(productId, comboOf);
          if (resolved) {
            leaves.push({ variantId: resolved.id, sku: resolved.sku, nombre: resolved.nombre, cantidad: factor });
          } else {
            throw new BadRequestException(
              `No se encontró variante del componente "${product.nombre}" compatible con este combo`,
            );
          }
          return;
        }

        for (const c of product.components) {
          if (c.tipo !== "exacto") continue;
          await expandir(c.componentId, attr, factor * dec(c.cantidad));
        }
      } finally {
        // Solo se detecta ciclo si el nodo reaparece en la MISMA ruta.
        visite.delete(key);
      }
    };

    const comboAttrs = combo.variantAttributes.map((a) => ({ attributeId: a.attributeId, valueId: a.valueId }));
    await expandir(combo.productId, comboAttrs, cantidad);

    // Hojas duplicadas (misma variante en varias ramas) se suman.
    const totals = new Map<number, { sku: string; nombre: string; cantidad: number }>();
    for (const l of leaves) {
      const t = totals.get(l.variantId);
      if (t) t.cantidad += l.cantidad;
      else totals.set(l.variantId, { sku: l.sku, nombre: l.nombre, cantidad: l.cantidad });
    }

    const location = await this.prisma.location.findUnique({ where: { id: params.locationId } });
    if (!location) throw new NotFoundException("Ubicación no encontrada");

    const movimiento = await this.prisma.$transaction(async (tx) => {
      // 1) Verificar y consumir cada hoja.
      const detalle: { variantId: number; sku: string; nombre: string; requerido: number; disponible: number }[] = [];
      for (const [variantId, t] of totals) {
        const levels = await tx.stockLevel.findMany({ where: { variantId } });
        const disponible = levels.reduce((a, l) => a + dec(l.qty), 0);
        if (disponible < t.cantidad) {
          throw new BadRequestException(
            `Stock insuficiente de "${t.nombre}" (${t.sku}): se requieren ${t.cantidad} y hay ${disponible}`,
          );
        }
        detalle.push({ variantId, sku: t.sku, nombre: t.nombre, requerido: t.cantidad, disponible });
        // Consume de las ubicaciones disponibles.
        let restante = t.cantidad;
        for (const level of levels) {
          if (restante <= 0) break;
          const usar = Math.min(restante, dec(level.qty));
          await tx.stockLevel.update({
            where: { variantId_locationId: { variantId, locationId: level.locationId } },
            data: { qty: { decrement: usar } },
          });
          await tx.stockMove.create({
            data: {
              variantId,
              locationId: level.locationId,
              qty: -usar,
              motivo: "ensamble",
              ref: params.ref ?? `ensamble de ${combo.sku}`,
              userId: params.userId ?? null,
            },
          });
          restante -= usar;
        }
      }

      // 2) Sumar el producto terminado.
      await tx.stockLevel.upsert({
        where: { variantId_locationId: { variantId, locationId: params.locationId } },
        update: { qty: { increment: cantidad } },
        create: { variantId, locationId: params.locationId, qty: cantidad },
      });
      const move = await tx.stockMove.create({
        data: {
          variantId,
          locationId: params.locationId,
          qty: cantidad,
          motivo: "ensamble",
          ref: params.ref ?? null,
          userId: params.userId ?? null,
        },
      });
      return { move, detalle };
    });

    const notificados: string[] = [];
    for (const d of totals.keys()) {
      const r = await this.monitor.afterStockChange(d);
      if (r.notificado) notificados.push(...r.canales);
    }
    const fi = await this.monitor.afterStockChange(variantId);
    if (fi.notificado) notificados.push(...fi.canales);

    return { detalle: movimiento.detalle, notificado: [...new Set(notificados)] };
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