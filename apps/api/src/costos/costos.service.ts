import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@ppg/db";
import { PrismaService } from "../prisma/prisma.service";
import { dec } from "../common/util";
import { CostosCalc, FuenteCosto, ValorInput } from "./costos.calc";
import { clavesFormula, evaluarFormula } from "./costos.formula";

/** Costo estándar por producto, con fórmula y valores configurables.
 *  El costo total se calcula (nunca se captura); el precio base se administra
 *  aquí y se registra en `PriceChange`. Ver docs/data-model.md §Costos. */

export interface ValorCostoInput {
  clave: string;
  etiqueta?: string;
  fuente: FuenteCosto;
  valor?: number | null;
  opciones?: Record<string, unknown> | null;
  orden?: number;
}

export interface CostoInput {
  precioBase?: number;
  formula?: string | null;
  notas?: string | null;
  valores?: ValorCostoInput[];
}

function r4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

@Injectable()
export class CostosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly calc: CostosCalc,
  ) {}

  // ------------------------------------------------- referencia de precio
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
    const margenPct = ref.precio > 0 ? r4(((ref.precio - total) / ref.precio) * 100) : null;
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
        cost: true,
      },
    });

    const cache = new Map<number, Awaited<ReturnType<CostosCalc["calcularProducto"]>>>();
    const out = [];
    for (const p of rows) {
      const calc = p.cost
        ? await this.calc.calcularProducto(p.id, new Set(), cache)
        : { total: 0, avisos: [] as string[] };
      const ref = this.referenciaPrecio(p);
      out.push({
        productId: p.id,
        nombre: p.nombre,
        skuBase: p.skuBase,
        uom: p.uom,
        fabricable: p.fabricable,
        comprable: p.comprable,
        tieneReceta: p.cost !== null,
        tieneFormula: !!p.cost?.formula,
        notas: p.cost?.notas ?? null,
        variantes: p.variants.length,
        precioBase: dec(p.basePrice),
        total: calc.total,
        avisos: calc.avisos,
        ...this.conMargen(ref, calc.total),
      });
    }
    return out;
  }

  // -------------------------------------------------------------- detalle
  async get(productId: number) {
    const p = await this.prisma.product.findUnique({
      where: { id: productId },
      include: {
        variants: {
          select: { id: true, sku: true, nombre: true, costoCompra: true, price: true, activo: true },
          orderBy: { nombre: "asc" },
        },
        components: { include: { component: { select: { id: true, nombre: true, skuBase: true } } } },
        cost: { include: { valores: { orderBy: { orden: "asc" } } } },
      },
    });
    if (!p) throw new NotFoundException("Producto no encontrado");

    const costo = p.cost
      ? await this.calc.calcularProducto(productId)
      : { formula: null, valores: [], total: 0, avisos: [] as string[] };
    const ref = this.referenciaPrecio(p);
    return {
      productId: p.id,
      nombre: p.nombre,
      skuBase: p.skuBase,
      uom: p.uom,
      fabricable: p.fabricable,
      comprable: p.comprable,
      tieneReceta: p.cost !== null,
      formula: p.cost?.formula ?? null,
      notas: p.cost?.notas ?? null,
      precioBase: dec(p.basePrice),
      valores: costo.valores,
      total: costo.total,
      avisos: costo.avisos,
      variantes: p.variants.map((v) => ({
        variantId: v.id,
        sku: v.sku,
        nombre: v.nombre,
        costoCompra: v.costoCompra === null ? null : dec(v.costoCompra),
      })),
      componentes: p.components.map((c) => ({
        componentId: c.componentId,
        nombre: c.component.nombre,
        skuBase: c.component.skuBase,
        tipo: c.tipo,
        cantidad: dec(c.cantidad),
      })),
      ...this.conMargen(ref, costo.total),
    };
  }

  // --------------------------------------------------- validar y normalizar
  private normalizarValores(valores: ValorCostoInput[]): {
    clave: string;
    etiqueta: string;
    fuente: FuenteCosto;
    valor: number | null;
    opciones: Record<string, unknown> | null;
    orden: number;
  }[] {
    const vistos = new Set<string>();
    const out = [];
    const fuentesValidas: FuenteCosto[] = ["manual", "bom", "variante", "formula"];
    for (const [i, v] of valores.entries()) {
      const clave = (v.clave ?? "").trim();
      if (!clave) continue;
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(clave)) {
        throw new BadRequestException(`La clave "${clave}" no es válida (usa letras, números y _)`);
      }
      if (vistos.has(clave)) throw new BadRequestException(`La clave "${clave}" está repetida`);
      vistos.add(clave);
      if (!fuentesValidas.includes(v.fuente)) {
        throw new BadRequestException(`Fuente no válida en "${clave}"`);
      }
      out.push({
        clave,
        etiqueta: (v.etiqueta ?? "").trim() || clave,
        fuente: v.fuente,
        valor: v.fuente === "manual" ? (v.valor ?? 0) : null,
        opciones: v.opciones ?? null,
        orden: v.orden ?? i,
      });
    }
    return out;
  }

  private validarFormula(formula: string | null | undefined, claves: Set<string>) {
    if (!formula || formula.trim() === "") return null;
    const f = formula.trim();
    try {
      const usadas = clavesFormula(f);
      const faltantes = usadas.filter((k) => !claves.has(k));
      if (faltantes.length) {
        throw new BadRequestException(`La fórmula usa claves no definidas: ${faltantes.join(", ")}`);
      }
      const entorno = Object.fromEntries([...claves].map((k) => [k, 1]));
      evaluarFormula(f, entorno);
    } catch (e) {
      if (e instanceof BadRequestException) throw e;
      throw new BadRequestException(`Fórmula inválida: ${(e as Error).message}`);
    }
    return f;
  }

  // -------------------------------------------------------------- preview
  async preview(productId: number, data: CostoInput) {
    await this.verificarProducto(productId);
    const valores = this.normalizarValores(data.valores ?? []);
    const claves = new Set(valores.map((v) => v.clave));
    const formula = this.validarFormula(data.formula, claves);
    const res = await this.calc.calcular(productId, valores as ValorInput[], formula);
    return { ...res, ...this.conMargen(await this.referenciaDeProducto(productId), res.total) };
  }

  // -------------------------------------------------------------- upsert
  async upsert(productId: number, data: CostoInput, userId?: number) {
    const exists = await this.verificarProducto(productId);
    const valores = this.normalizarValores(data.valores ?? []);
    const claves = new Set(valores.map((v) => v.clave));
    const formula = this.validarFormula(data.formula, claves);
    const notas = data.notas ?? null;

    await this.prisma.$transaction(async (tx) => {
      const cost = await tx.productCost.upsert({
        where: { productId },
        create: { productId, formula, notas, updatedById: userId ?? null },
        update: { formula, notas, updatedById: userId ?? null },
      });
      await tx.productCostValor.deleteMany({ where: { productCostId: cost.id } });
      if (valores.length > 0) {
        await tx.productCostValor.createMany({
          data: valores.map((v) => ({
            productCostId: cost.id,
            clave: v.clave,
            etiqueta: v.etiqueta,
            fuente: v.fuente,
            valor: v.valor,
            opciones: (v.opciones ?? undefined) as Prisma.InputJsonValue | undefined,
            orden: v.orden,
          })),
        });
      }
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

  // -------------------------------------------------------------- helpers
  private async verificarProducto(productId: number) {
    const exists = await this.prisma.product.findUnique({
      where: { id: productId },
      select: { id: true, basePrice: true },
    });
    if (!exists) throw new NotFoundException("Producto no encontrado");
    return exists;
  }

  private async referenciaDeProducto(productId: number) {
    const p = await this.prisma.product.findUnique({
      where: { id: productId },
      include: { variants: { select: { price: true, activo: true } } },
    });
    if (!p) throw new NotFoundException("Producto no encontrado");
    return this.referenciaPrecio(p);
  }
}
