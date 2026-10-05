import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { OrigenOF, Prisma } from "@ppg/db";
import { dec } from "../common/util";
import { PrismaService } from "../prisma/prisma.service";
import { MonitorService } from "../monitor/monitor.service";
import { PlanificacionService } from "./planificacion.service";
import type { ResumenItem } from "../ventas/ventas.service";

type ObjetivoReposicion = "minimo" | "maximo";

@Injectable()
export class FabricacionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly planificacion: PlanificacionService,
    private readonly monitor: MonitorService,
  ) {}

  async list(query: { estado?: string; tipo?: string; origen?: string; search?: string }) {
    const where: Prisma.ManufacturingOrderWhereInput = {
      ...(query.estado ? { estado: query.estado as Prisma.ManufacturingOrderWhereInput["estado"] } : {}),
      ...(query.tipo ? { tipo: query.tipo as Prisma.ManufacturingOrderWhereInput["tipo"] } : {}),
      ...(query.origen ? { origen: query.origen as Prisma.ManufacturingOrderWhereInput["origen"] } : {}),
      ...(query.search
        ? {
            OR: [
              { numero: { contains: query.search, mode: "insensitive" } },
              { variant: { sku: { contains: query.search, mode: "insensitive" } } },
              { variant: { nombre: { contains: query.search, mode: "insensitive" } } },
              { variant: { product: { nombre: { contains: query.search, mode: "insensitive" } } } },
            ],
          }
        : {}),
    };
    const rows = await this.prisma.manufacturingOrder.findMany({
      where,
      orderBy: { id: "desc" },
      include: {
        variant: { include: { product: true } },
        salesOrderLine: { include: { order: { include: { partner: true } } } },
        _count: { select: { lines: true } },
      },
    });
    return rows.map((mo) => ({
      id: mo.id,
      numero: mo.numero,
      sku: mo.variant.sku,
      nombre: mo.variant.nombre,
      producto: mo.variant.product.nombre,
      uom: mo.variant.product.uom,
      cantidad: dec(mo.cantidad),
      tipo: mo.tipo,
      origen: mo.origen,
      estado: mo.estado,
      fecha: mo.fecha,
      notas: mo.notas,
      generatedFrom: mo.generatedFrom,
      venta: mo.salesOrderLine?.order.numero ?? null,
      cliente: mo.salesOrderLine?.order.partner?.nombre ?? null,
      componenteVariantes: mo._count.lines,
    }));
  }

  async get(id: number) {
    const mo = await this.prisma.manufacturingOrder.findUnique({
      where: { id },
      include: {
        variant: { include: { product: true, variantAttributes: { include: { attribute: true, value: true } } } },
        salesOrderLine: { include: { order: { include: { partner: true } } } },
        lines: { include: { componentVariant: { include: { product: true } } } },
      },
    });
    if (!mo) throw new NotFoundException("Orden de fabricación no encontrada");
    return {
      ...mo,
      cantidad: dec(mo.cantidad),
      venta: mo.salesOrderLine?.order.numero ?? null,
      cliente: mo.salesOrderLine?.order.partner?.nombre ?? null,
      lines: mo.lines.map((l) => ({
        id: l.id,
        variantId: l.componentVariantId,
        sku: l.componentVariant.sku,
        nombre: l.componentVariant.nombre,
        producto: l.componentVariant.product.nombre,
        uom: l.componentVariant.product.uom,
        cantidadRequerida: dec(l.cantidadRequerida),
        cantidadReservada: dec(l.cantidadReservada),
      })),
    };
  }

  async iniciar(id: number, userId?: number) {
    const mo = await this.prisma.manufacturingOrder.findUnique({ where: { id } });
    if (!mo) throw new NotFoundException("Orden de fabricación no encontrada");
    if (!["borrador", "confirmada"].includes(mo.estado)) {
      throw new BadRequestException(`No se puede iniciar una orden en estado "${mo.estado}"`);
    }
    return this.prisma.manufacturingOrder.update({
      where: { id },
      data: { estado: "en_progreso", userId: userId ?? undefined },
    });
  }

  async cancelar(id: number) {
    const mo = await this.prisma.manufacturingOrder.findUnique({ where: { id } });
    if (!mo) throw new NotFoundException("Orden de fabricación no encontrada");
    if (mo.estado === "hecha" || mo.estado === "cancelada") {
      throw new BadRequestException(`Una orden "${mo.estado}" no se puede cancelar`);
    }
    return this.prisma.manufacturingOrder.update({ where: { id }, data: { estado: "cancelada" } });
  }

  // --------------------------------------------------------- Concluir OF
  private turnoActual(): "matutino" | "vespertino" | "nocturno" {
    const h = new Date().getHours();
    if (h >= 6 && h < 14) return "matutino";
    if (h >= 14 && h < 22) return "vespertino";
    return "nocturno";
  }

  /** Descuenta una variante de sus ubicaciones (prefiere "Almacén principal"). */
  private async consumir(
    tx: Prisma.TransactionClient,
    variantId: number,
    cantidad: number,
    ref: string,
    userId?: number,
  ) {
    const levels = await tx.stockLevel.findMany({ where: { variantId } });
    const preferido = await tx.location.findFirst({ where: { nombre: "Almacén principal" } });
    levels.sort(
      (a, b) =>
        Number(a.locationId === (preferido?.id ?? null) ? 0 : 1) -
        Number(b.locationId === (preferido?.id ?? null) ? 0 : 1),
    );
    const total = levels.reduce((a, l) => a + dec(l.qty), 0);
    if (total < cantidad) {
      throw new BadRequestException(`Stock insuficiente de un componente (hay ${total} y se consumen ${cantidad})`);
    }
    let restante = cantidad;
    for (const level of levels) {
      if (restante <= 0) break;
      const usar = Math.min(restante, dec(level.qty));
      await tx.stockLevel.update({ where: { id: level.id }, data: { qty: { decrement: usar } } });
      await tx.stockMove.create({
        data: { variantId, locationId: level.locationId, qty: -usar, motivo: "consumo", ref, userId },
      });
      restante -= usar;
    }
  }

  /**
   * Concluye una OF (desde Fabricación), sin depender de reportes de producción.
   * - `fabricacion` (hoja): genera un reporte **interno aplicado** con una línea `final`
   *   → entrada a "Recibo de Producción" (motivo `produccion`) para el flujo Ubicar.
   * - `ensamble`: valida y **descuenta los componentes** exactos (motivo `consumo`).
   *   No da entrada al ensamble (siempre se arma contra pedido).
   */
  async concluir(id: number, userId?: number) {
    const notificar: number[] = [];
    await this.prisma.$transaction(async (tx) => {
      const mo = await tx.manufacturingOrder.findUnique({
        where: { id },
        include: { lines: true, variant: { include: { product: true } } },
      });
      if (!mo) throw new NotFoundException("Orden de fabricación no encontrada");
      if (!["confirmada", "en_progreso"].includes(mo.estado)) {
        throw new BadRequestException(`No se puede concluir una orden en estado "${mo.estado}"`);
      }

      if (mo.tipo === "ensamble") {
        for (const line of mo.lines) {
          const ok = dec(line.cantidadRequerida);
          if (ok <= 0) continue;
          await this.consumir(tx, line.componentVariantId, ok, mo.numero, userId);
          notificar.push(line.componentVariantId);
        }
      } else {
        const recibo = await tx.location.findFirst({ where: { nombre: "Recibo de Producción" } });
        if (!recibo) throw new BadRequestException("Falta la ubicación 'Recibo de Producción'");
        const cantidad = dec(mo.cantidad);
        const report = await tx.productionReport.create({
          data: {
            numero: `PEND-${Date.now()}-${mo.id}`,
            turno: this.turnoActual(),
            interno: true,
            estado: "aplicado",
            aplicadoAt: new Date(),
            manufacturingOrderId: mo.id,
            notas: `Concluida desde ${mo.numero}`,
            userId: userId ?? null,
          },
        });
        await tx.productionReport.update({ where: { id: report.id }, data: { numero: `RPT-${String(report.id).padStart(4, "0")}` } });
        await tx.productionReportLine.create({
          data: { reportId: report.id, variantId: mo.variantId, seccion: "fabricacion", tipo: "final", ok: cantidad, qtyAplicada: cantidad },
        });
        const level = await tx.stockLevel.findUnique({
          where: { variantId_locationId: { variantId: mo.variantId, locationId: recibo.id } },
        });
        if (level) {
          await tx.stockLevel.update({ where: { id: level.id }, data: { qty: { increment: cantidad } } });
        } else {
          await tx.stockLevel.create({ data: { variantId: mo.variantId, locationId: recibo.id, qty: cantidad } });
        }
        await tx.stockMove.create({
          data: { variantId: mo.variantId, locationId: recibo.id, qty: cantidad, motivo: "produccion", ref: mo.numero, userId },
        });
        notificar.push(mo.variantId);
      }

      await tx.manufacturingOrder.update({
        where: { id },
        data: { estado: "hecha", finalizadoAt: new Date() },
      });
    });

    const canales: string[] = [];
    for (const vid of [...new Set(notificar)]) {
      const res = await this.monitor.afterStockChange(vid);
      if (res.notificado) canales.push(...res.canales);
    }
    return { ok: true, canales: [...new Set(canales)] };
  }

  // --------------------------------------------------- Alta manual de OF
  /** Crea manualmente una OF para una variante fabricable (exactamente N). */
  async crearManual(data: { variantId: number; cantidad: number; notas?: string }, userId?: number) {
    if (!(data.cantidad > 0)) throw new BadRequestException("La cantidad debe ser mayor a 0");
    return this.prisma.$transaction(async (tx) => {
      const variant = await tx.productVariant.findUnique({
        where: { id: data.variantId },
        include: { product: { include: { components: { where: { tipo: "exacto" } } } } },
      });
      if (!variant) throw new NotFoundException("Variante no encontrada");
      if (!variant.product.fabricable) {
        throw new BadRequestException(`"${variant.product.nombre}" no está marcado como fabricable (es de compra).`);
      }
      const plan = await this.planificacion.planificar(
        tx,
        [{ variantId: data.variantId, cantidad: data.cantidad }],
        { netearRaiz: false },
      );
      const creadas = await this.planificacion.crearOFs(tx, plan, {
        origen: "manual",
        generatedFrom: "Manual",
        userId: userId ?? null,
        notas: data.notas ?? null,
      });
      return { creadas };
    });
  }

  // ------------------------------------------- Reposición por mín/máx
  private async candidatosReposicion(tx: Prisma.TransactionClient, objetivo: ObjetivoReposicion) {
    const variants = await tx.productVariant.findMany({
      where: { activo: true, product: { activo: true, fabricable: true }, stockMin: { gt: 0 } },
      include: {
        product: { include: { components: { where: { tipo: "exacto" } } } },
        stockLevels: true,
      },
    });
    const out: { variantId: number; cantidad: number }[] = [];
    for (const v of variants) {
      const actual = v.stockLevels.reduce((a, l) => a + dec(l.qty), 0);
      const min = dec(v.stockMin);
      const max = dec(v.stockMax);
      const target = objetivo === "minimo" ? min : max > 0 ? max : min;
      if (actual < target) out.push({ variantId: v.id, cantidad: target - actual });
    }
    return out;
  }

  /** Previsualiza cuántas OFs se crearían con la reposición (no escribe). */
  async previewReponer(objetivo: ObjetivoReposicion) {
    return this.prisma.$transaction(async (tx) => {
      const demandas = await this.candidatosReposicion(tx, objetivo);
      if (demandas.length === 0) return { variantes: 0, ofs: 0, detalle: [] };
      const plan = await this.planificacion.planificar(tx, demandas, { netearRaiz: false });
      return {
        variantes: demandas.length,
        ofs: plan.fabricar.length,
        detalle: plan.fabricar.map((f) => ({ variantId: f.variantId, sku: f.sku, producto: f.producto, nombre: f.nombre, cantidad: f.cantidad, tipo: f.tipo })),
      };
    });
  }

  /** Crea OFs en cascada para cubrir el objetivo (mínimo o máximo). Sin dedupe. */
  async reponer(objetivo: ObjetivoReposicion, userId?: number) {
    return this.prisma.$transaction(async (tx) => {
      const demandas = await this.candidatosReposicion(tx, objetivo);
      if (demandas.length === 0) return { creadas: 0, detalle: [] };
      const plan = await this.planificacion.planificar(tx, demandas, { netearRaiz: false });
      const origen: OrigenOF = objetivo === "minimo" ? "reposicion_minimo" : "reposicion_maximo";
      const creadas = await this.planificacion.crearOFs(tx, plan, {
        origen,
        generatedFrom: objetivo === "minimo" ? "Reposición (mínimo)" : "Reposición (máximo)",
        userId: userId ?? null,
      });
      return { creadas: creadas.length, detalle: creadas };
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