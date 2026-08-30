import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@ppg/db";
import { dec } from "../common/util";
import { PrismaService } from "../prisma/prisma.service";
import type { ResumenItem } from "../ventas/ventas.service";

@Injectable()
export class FabricacionService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: { estado?: string; tipo?: string; search?: string }) {
    const where: Prisma.ManufacturingOrderWhereInput = {
      ...(query.estado ? { estado: query.estado as Prisma.ManufacturingOrderWhereInput["estado"] } : {}),
      ...(query.tipo ? { tipo: query.tipo as Prisma.ManufacturingOrderWhereInput["tipo"] } : {}),
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
      estado: mo.estado,
      fecha: mo.fecha,
      notas: mo.notas,
      generatedFrom: mo.generatedFrom,
      componenteVariantes: mo._count.lines,
    }));
  }

  async get(id: number) {
    const mo = await this.prisma.manufacturingOrder.findUnique({
      where: { id },
      include: {
        variant: { include: { product: true, variantAttributes: { include: { attribute: true, value: true } } } },
        lines: { include: { componentVariant: { include: { product: true } } } },
      },
    });
    if (!mo) throw new NotFoundException("Orden de fabricación no encontrada");
    return {
      ...mo,
      cantidad: dec(mo.cantidad),
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