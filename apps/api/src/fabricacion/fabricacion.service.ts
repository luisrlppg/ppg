import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@ppg/db";
import { dec } from "../common/util";
import { PrismaService } from "../prisma/prisma.service";
import { InventarioService } from "../inventario/inventario.service";
import { PlanificacionService } from "./planificacion.service";
import type { ResumenItem } from "../ventas/ventas.service";

/** Fila del panel de necesidades (faltante por mínimo o por ventas). */
export interface NecesidadItem {
  variantId: number;
  sku: string;
  nombre: string;
  productoId: number;
  producto: string;
  uom: string;
  valoracion: { attribute: string; valor: string }[];
  stockActual: number;
  stockMin: number;
  stockMax: number;
  objetivo: number;
  necesidad: number;
  tipo?: "fabricacion" | "ensamble";
  ensamble: boolean;
  pedidos: string[];
}

export interface Necesidades {
  porMinimo: NecesidadItem[];
  porVentas: NecesidadItem[];
  porComprar: NecesidadItem[];
}

@Injectable()
export class FabricacionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly planificacion: PlanificacionService,
    private readonly inventario: InventarioService,
  ) {}

  // ------------------------------------------------ Panel de necesidades
  /**
   * Faltantes vivos para el panel de Fabricación: por mínimo (fabricables bajo
   * stock objetivo) y por ventas (explosión neta BOM de las ventas abiertas
   * confirmadas, con pool compartido de stock). Incluye ensambles como ítems
   * "a armar". `porComprar` son los no fabricables faltantes.
   */
  async necesidades(): Promise<Necesidades> {
    const [porMinimo, ventas] = await Promise.all([
      this.necesidadesPorMinimo(),
      this.necesidadesPorVentas(),
    ]);
    return { porMinimo, porVentas: ventas.porVentas, porComprar: ventas.porComprar };
  }

  private async necesidadesPorMinimo(): Promise<NecesidadItem[]> {
    const variants = await this.prisma.productVariant.findMany({
      where: { activo: true, product: { activo: true, fabricable: true }, stockMin: { gt: 0 } },
      include: {
        product: { include: { components: { where: { tipo: "exacto" }, select: { id: true } } } },
        stockLevels: true,
        variantAttributes: { include: { attribute: true, value: true } },
      },
    });
    const out: NecesidadItem[] = [];
    for (const v of variants) {
      const actual = v.stockLevels.reduce((a, l) => a + dec(l.qty), 0);
      const min = dec(v.stockMin);
      const max = dec(v.stockMax);
      const objetivo = max > 0 ? max : min;
      if (actual >= objetivo) continue;
      const tipo = v.product.components.length > 1 ? "ensamble" : "fabricacion";
      out.push({
        variantId: v.id,
        sku: v.sku,
        nombre: v.nombre,
        productoId: v.productId,
        producto: v.product.nombre,
        uom: v.product.uom,
        valoracion: v.variantAttributes
          .map((va) => ({ attribute: va.attribute.nombre, valor: va.value.valor }))
          .sort((a, b) => a.attribute.localeCompare(b.attribute)),
        stockActual: actual,
        stockMin: min,
        stockMax: max,
        objetivo,
        necesidad: objetivo - actual,
        tipo,
        ensamble: tipo === "ensamble",
        pedidos: [],
      });
    }
    return out.sort((a, b) => b.necesidad - a.necesidad);
  }

  private async necesidadesPorVentas(): Promise<{ porVentas: NecesidadItem[]; porComprar: NecesidadItem[] }> {
    const orders = await this.prisma.salesOrder.findMany({
      where: { estado: "abierta", confirmadaAt: { not: null } },
      include: { lines: true },
    });
    if (orders.length === 0) return { porVentas: [], porComprar: [] };

    const numeroPorLinea = new Map<number, string>();
    const demandas: { variantId: number; cantidad: number; salesOrderLineId: number }[] = [];
    for (const o of orders) {
      for (const l of o.lines) {
        numeroPorLinea.set(l.id, o.numero);
        demandas.push({
          variantId: l.variantId,
          cantidad: dec(l.cantidad) - dec(l.qtyDelivered),
          salesOrderLineId: l.id,
        });
      }
    }

    const desglose = await this.planificacion.desglosar(this.prisma, demandas);
    const variantIds = [...new Set(desglose.lineas.map((l) => l.variantId))];
    const variantesInfo = variantIds.length
      ? await this.prisma.productVariant.findMany({
          where: { id: { in: variantIds } },
          select: {
            id: true,
            productId: true,
            variantAttributes: { include: { attribute: true, value: true } },
          },
        })
      : [];
    const infoPorVariante = new Map(
      variantesInfo.map((v) => [
        v.id,
        {
          productoId: v.productId,
          valoracion: v.variantAttributes
            .map((va) => ({ attribute: va.attribute.nombre, valor: va.value.valor }))
            .sort((a, b) => a.attribute.localeCompare(b.attribute)),
        },
      ]),
    );
    const porVentas: NecesidadItem[] = [];
    const porComprar: NecesidadItem[] = [];
    for (const l of desglose.lineas) {
      if (l.faltante <= 0) continue;
      const pedido = l.salesOrderLineId != null ? numeroPorLinea.get(l.salesOrderLineId) : undefined;
      const info = infoPorVariante.get(l.variantId);
      const item: NecesidadItem = {
        variantId: l.variantId,
        sku: l.sku,
        nombre: l.nombre,
        productoId: info?.productoId ?? 0,
        producto: l.producto,
        uom: l.uom,
        valoracion: info?.valoracion ?? [],
        stockActual: l.stockActual,
        stockMin: 0,
        stockMax: 0,
        objetivo: 0,
        necesidad: l.faltante,
        tipo: l.tipo,
        ensamble: l.tipo === "ensamble",
        pedidos: pedido ? [pedido] : [],
      };
      if (l.fabricable) porVentas.push(item);
      else porComprar.push(item);
    }
    const ordenar = (a: NecesidadItem, b: NecesidadItem) => a.producto.localeCompare(b.producto) || a.nombre.localeCompare(b.nombre);
    return { porVentas: porVentas.sort(ordenar), porComprar: porComprar.sort(ordenar) };
  }

  /**
   * Registra producción de una hoja fabricable: entrada de stock en la ubicación
   * elegida (motivo `produccion`) y dispara el monitor. No crea reportes.
   */
  async registrarProduccion(data: { variantId: number; cantidad: number; locationId: number }, userId?: number) {
    if (!(data.cantidad > 0)) throw new BadRequestException("La cantidad debe ser mayor a 0");
    const variant = await this.prisma.productVariant.findUnique({
      where: { id: data.variantId },
      include: { product: { include: { components: { where: { tipo: "exacto" }, select: { id: true } } } } },
    });
    if (!variant) throw new NotFoundException("Variante no encontrada");
    if (!variant.product.fabricable) {
      throw new BadRequestException(`"${variant.product.nombre}" no está marcado como fabricable.`);
    }
    if (variant.product.components.length > 1) {
      throw new BadRequestException(`"${variant.nombre}" es un ensamble (se arma contra pedido); no se ingresa a stock.`);
    }
    return this.inventario.movimiento({
      variantId: data.variantId,
      locationId: data.locationId,
      motivo: "produccion",
      cantidad: data.cantidad,
      ref: "Producción manual",
      userId,
    });
  }

  /** Pendientes de compra agregados: suma los faltantes "comprar" de todas las
   *  ventas confirmadas y no canceladas. */
  async faltantes() {
    const orders = await this.prisma.salesOrder.findMany({
      where: { estado: { not: "cancelada" }, confirmadaAt: { not: null }, resumen: { not: Prisma.DbNull } },
      select: { numero: true, resumen: true },
    });
    const agg = new Map<number, { variantId: number; sku: string; nombre: string; producto: string; cantidad: number; pedidos: Set<string> }>();
    for (const o of orders) {
      const r = (o.resumen ?? { comprar: [] }) as { comprar?: ResumenItem[] };
      for (const item of r.comprar ?? []) {
        const cur = agg.get(item.variantId) ?? {
          variantId: item.variantId,
          sku: item.sku,
          nombre: item.nombre,
          producto: item.producto,
          cantidad: 0,
          pedidos: new Set<string>(),
        };
        cur.cantidad += item.cantidad;
        cur.pedidos.add(o.numero);
        agg.set(item.variantId, cur);
      }
    }
    return [...agg.values()]
      .map((a) => ({ ...a, pedidos: [...a.pedidos] }))
      .sort((a, b) => a.nombre.localeCompare(b.nombre));
  }
}
