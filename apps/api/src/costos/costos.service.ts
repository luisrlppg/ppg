import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { dec } from "../common/util";

// v1: costo estándar por producto, capturado a mano. Materiales 100% manuales;
// el resto de conceptos es un formulario fijo. Sin historial ni merma.
// Aún no se enlaza con el precio de venta (ver docs/roadmap.md).

interface MaterialInput {
  nombre: string;
  cantidad: number;
  costoUnitario: number;
  orden?: number;
}

export interface CostoInput {
  precioBase?: number;
  costoCompra?: number | null;
  horasManoObra?: number;
  tarifaManoObra?: number;
  horasMaquina?: number;
  tarifaMaquina?: number;
  costoMolde?: number;
  piezasMolde?: number;
  costoEnsamble?: number;
  costoEmpaque?: number;
  notas?: string | null;
  materiales?: MaterialInput[];
  variantes?: { variantId: number; costoCompra?: number | null }[];
}

interface CostoRow {
  costoCompra: unknown;
  horasManoObra: unknown;
  tarifaManoObra: unknown;
  horasMaquina: unknown;
  tarifaMaquina: unknown;
  costoMolde: unknown;
  piezasMolde: unknown;
  costoEnsamble: unknown;
  costoEmpaque: unknown;
  materiales: { cantidad: unknown; costoUnitario: unknown }[];
}

function r4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

@Injectable()
export class CostosService {
  constructor(private readonly prisma: PrismaService) {}

  // ------------------------------------------------ cálculo del desglose
  private calcular(cost: CostoRow | null) {
    if (!cost) {
      return {
        costoCompra: 0,
        materiales: 0,
        manoObra: 0,
        maquina: 0,
        molde: 0,
        ensamble: 0,
        empaque: 0,
        total: 0,
      };
    }
    const costoCompra = dec(cost.costoCompra);
    const materiales =
      costoCompra +
      cost.materiales.reduce((s, m) => s + dec(m.cantidad) * dec(m.costoUnitario), 0);
    const manoObra = dec(cost.horasManoObra) * dec(cost.tarifaManoObra);
    const maquina = dec(cost.horasMaquina) * dec(cost.tarifaMaquina);
    const piezas = dec(cost.piezasMolde);
    const molde = piezas > 0 ? dec(cost.costoMolde) / piezas : 0;
    const ensamble = dec(cost.costoEnsamble);
    const empaque = dec(cost.costoEmpaque);
    return {
      costoCompra: r4(costoCompra),
      materiales: r4(materiales),
      manoObra: r4(manoObra),
      maquina: r4(maquina),
      molde: r4(molde),
      ensamble: r4(ensamble),
      empaque: r4(empaque),
      total: r4(materiales + manoObra + maquina + molde + ensamble + empaque),
    };
  }

  private referenciaPrecio(product: {
    basePrice: unknown;
    variants: { price: unknown; activo: boolean }[];
  }) {
    const base = dec(product.basePrice);
    const precios = product.variants
      .filter((v) => v.activo)
      .map((v) => dec(v.price ?? product.basePrice));
    const todos = [base, ...precios].filter((p) => p > 0);
    const precio = base > 0 ? base : todos.length ? Math.min(...todos) : 0;
    const precioMin = todos.length ? Math.min(...todos) : 0;
    const precioMax = todos.length ? Math.max(...todos) : 0;
    return { precio, precioMin, precioMax };
  }

  private conMargen(
    ref: { precio: number; precioMin: number; precioMax: number },
    total: number,
  ) {
    const margen = ref.precio > 0 ? r4(ref.precio - total) : null;
    const margenPct =
      ref.precio > 0 ? r4(((ref.precio - total) / ref.precio) * 100) : null;
    return { ...ref, margen, margenPct };
  }

  // ------------------------------------------------------------- listado
  async list(query: { search?: string }) {
    const rows = await this.prisma.product.findMany({
      where: {
        activo: true,
        ...(query.search
          ? {
              OR: [
                { nombre: { contains: query.search, mode: "insensitive" } },
                { skuBase: { contains: query.search, mode: "insensitive" } },
              ],
            }
          : {}),
      },
      orderBy: { nombre: "asc" },
      include: {
        variants: { select: { price: true, activo: true } },
        cost: { include: { materiales: { orderBy: { orden: "asc" } } } },
      },
    });

    return rows.map((p) => {
      const desglose = this.calcular(p.cost as CostoRow | null);
      const ref = this.referenciaPrecio(p);
      return {
        productId: p.id,
        nombre: p.nombre,
        skuBase: p.skuBase,
        uom: p.uom,
        fabricable: p.fabricable,
        comprable: p.comprable,
        tieneReceta: p.cost !== null,
        notas: p.cost?.notas ?? null,
        variantes: p.variants.length,
        precioBase: dec(p.basePrice),
        ...desglose,
        ...this.conMargen(ref, desglose.total),
      };
    });
  }

  // -------------------------------------------------------------- detalle
  async get(productId: number) {
    const p = await this.prisma.product.findUnique({
      where: { id: productId },
      include: {
        variants: { select: { id: true, sku: true, nombre: true, costoCompra: true, price: true, activo: true }, orderBy: { nombre: "asc" } },
        cost: { include: { materiales: { orderBy: { orden: "asc" } } } },
      },
    });
    if (!p) throw new NotFoundException("Producto no encontrado");

    const desglose = this.calcular(p.cost as CostoRow | null);
    const ref = this.referenciaPrecio(p);
    const c = p.cost;
    return {
      productId: p.id,
      nombre: p.nombre,
      skuBase: p.skuBase,
      uom: p.uom,
      fabricable: p.fabricable,
      comprable: p.comprable,
      tieneReceta: c !== null,
      precioBase: dec(p.basePrice),
      receta: {
        costoCompra: c ? dec(c.costoCompra) : 0,
        horasManoObra: c ? dec(c.horasManoObra) : 0,
        tarifaManoObra: c ? dec(c.tarifaManoObra) : 0,
        horasMaquina: c ? dec(c.horasMaquina) : 0,
        tarifaMaquina: c ? dec(c.tarifaMaquina) : 0,
        costoMolde: c ? dec(c.costoMolde) : 0,
        piezasMolde: c ? dec(c.piezasMolde) : 0,
        costoEnsamble: c ? dec(c.costoEnsamble) : 0,
        costoEmpaque: c ? dec(c.costoEmpaque) : 0,
        notas: c?.notas ?? null,
        materiales:
          c?.materiales.map((m) => ({
            nombre: m.nombre,
            cantidad: dec(m.cantidad),
            costoUnitario: dec(m.costoUnitario),
            orden: m.orden,
          })) ?? [],
      },
      variantes: p.variants.map((v) => ({
        variantId: v.id,
        sku: v.sku,
        nombre: v.nombre,
        costoCompra: v.costoCompra === null ? null : dec(v.costoCompra),
      })),
      desglose,
      ...this.conMargen(ref, desglose.total),
    };
  }

  // -------------------------------------------------------------- upsert
  async upsert(productId: number, data: CostoInput, userId?: number) {
    const exists = await this.prisma.product.findUnique({
      where: { id: productId },
      select: { id: true, basePrice: true },
    });
    if (!exists) throw new NotFoundException("Producto no encontrado");

    const campos = {
      costoCompra: data.costoCompra ?? null,
      horasManoObra: data.horasManoObra ?? 0,
      tarifaManoObra: data.tarifaManoObra ?? 0,
      horasMaquina: data.horasMaquina ?? 0,
      tarifaMaquina: data.tarifaMaquina ?? 0,
      costoMolde: data.costoMolde ?? 0,
      piezasMolde: data.piezasMolde ?? 0,
      costoEnsamble: data.costoEnsamble ?? 0,
      costoEmpaque: data.costoEmpaque ?? 0,
      notas: data.notas ?? null,
      updatedById: userId ?? null,
    };
    const materiales = (data.materiales ?? []).filter((m) => m.nombre.trim() !== "");

    await this.prisma.$transaction(async (tx) => {
      const cost = await tx.productCost.upsert({
        where: { productId },
        create: { productId, ...campos },
        update: campos,
      });
      await tx.productCostMaterial.deleteMany({ where: { productCostId: cost.id } });
      if (materiales.length > 0) {
        await tx.productCostMaterial.createMany({
          data: materiales.map((m, i) => ({
            productCostId: cost.id,
            nombre: m.nombre.trim(),
            cantidad: m.cantidad ?? 0,
            costoUnitario: m.costoUnitario ?? 0,
            orden: m.orden ?? i,
          })),
        });
      }
      for (const v of data.variantes ?? []) {
        await tx.productVariant.updateMany({
          where: { id: v.variantId, productId },
          data: { costoCompra: v.costoCompra },
        });
      }
      // El precio base se edita desde aquí, pero sigue registrándose en PriceChange.
      if (data.precioBase !== undefined && dec(exists.basePrice) !== data.precioBase) {
        await tx.product.update({ where: { id: productId }, data: { basePrice: data.precioBase } });
        await tx.priceChange.create({
          data: {
            variantId: null,
            campo: "base",
            precioAnterior: exists.basePrice,
            precioNuevo: data.precioBase,
            source: userId ? "manual" : "api",
            userId: userId ?? null,
          },
        });
      }
    });

    return this.get(productId);
  }

  // -------------------------------------------------------------- eliminar
  async remove(productId: number) {
    const cost = await this.prisma.productCost.findUnique({ where: { productId } });
    if (cost) {
      await this.prisma.productCost.delete({ where: { productId } });
    }
    return this.get(productId);
  }
}
