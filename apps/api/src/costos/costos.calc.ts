import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { dec } from "../common/util";
import { evaluarFormula } from "./costos.formula";

export type FuenteCosto = "manual" | "bom" | "variante" | "formula";

export interface ValorInput {
  clave: string;
  etiqueta: string;
  fuente: FuenteCosto;
  valor?: number | null;
  opciones?: Record<string, unknown> | null;
  orden?: number;
}

export interface ValorResuelto extends ValorInput {
  valorResuelto: number;
  detalle?: string;
  error?: string;
}

export interface CostoCalculado {
  formula: string | null;
  valores: ValorResuelto[];
  total: number;
  avisos: string[];
}

/** Profundidad máxima de recursión BOM (además de la detección de ciclos). */
const MAX_PROFUNDIDAD = 20;

function optNum(o: Record<string, unknown> | null | undefined, k: string): number | undefined {
  const v = o?.[k];
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}
function optStr(o: Record<string, unknown> | null | undefined, k: string): string | undefined {
  const v = o?.[k];
  return typeof v === "string" && v.trim() !== "" ? v : undefined;
}

/**
 * Resuelve el costo estándar de un producto a partir de su fórmula y sus
 * valores. Los valores tipo `bom` jalan el costo de los componentes (recursivo),
 * `variante` toma el costo de compra de una variante y `formula` evalúa una
 * sub-expresión sobre los valores ya resueltos.
 */
@Injectable()
export class CostosCalc {
  constructor(private readonly prisma: PrismaService) {}

  private r4(n: number): number {
    return Math.round(n * 10000) / 10000;
  }

  async calcularProducto(
    productId: number,
    camino: Set<number> = new Set(),
    cache?: Map<number, CostoCalculado>,
  ): Promise<CostoCalculado> {
    const enCache = cache?.get(productId);
    if (enCache) return enCache;
    const cost = await this.prisma.productCost.findUnique({
      where: { productId },
      include: { valores: { orderBy: { orden: "asc" } } },
    });
    if (!cost) return { formula: null, valores: [], total: 0, avisos: [] };
    const valores: ValorInput[] = cost.valores.map((v) => ({
      clave: v.clave,
      etiqueta: v.etiqueta,
      fuente: v.fuente as FuenteCosto,
      valor: v.valor === null ? null : dec(v.valor),
      opciones: (v.opciones as Record<string, unknown> | null) ?? null,
      orden: v.orden,
    }));
    const r = await this.calcular(productId, valores, cost.formula, camino, cache);
    cache?.set(productId, r);
    return r;
  }

  /** Evalúa una configuración (guardada o en borrador) sin persistir. */
  async calcular(
    productId: number,
    valores: ValorInput[],
    formula: string | null,
    camino: Set<number> = new Set(),
    cache?: Map<number, CostoCalculado>,
  ): Promise<CostoCalculado> {
    const avisos: string[] = [];
    if (camino.has(productId)) {
      return {
        formula,
        valores: [],
        total: 0,
        avisos: [`Ciclo en el BOM detectado (producto ${productId} ya está en la cadena).`],
      };
    }
    if (camino.size >= MAX_PROFUNDIDAD) {
      return { formula, valores: [], total: 0, avisos: ["Se excedió la profundidad máxima del BOM."] };
    }
    const siguiente = new Set(camino);
    siguiente.add(productId);

    const entorno: Record<string, number> = {};
    const resueltos: ValorResuelto[] = [];
    const clavesVistas = new Set<string>();
    for (const v of valores) {
      if (clavesVistas.has(v.clave)) {
        avisos.push(`La clave "${v.clave}" está repetida.`);
      }
      clavesVistas.add(v.clave);
      const r = await this.resolverValor(productId, v, entorno, siguiente, avisos, cache);
      entorno[v.clave] = r.valorResuelto;
      resueltos.push(r);
    }

    let total = 0;
    if (formula && formula.trim() !== "") {
      try {
        total = this.r4(evaluarFormula(formula, entorno));
      } catch (e) {
        avisos.push((e as Error).message);
        total = 0;
      }
    } else {
      total = this.r4(valores.reduce((s, v) => s + (entorno[v.clave] ?? 0), 0));
    }
    return { formula, valores: resueltos, total, avisos };
  }

  private async resolverValor(
    productId: number,
    v: ValorInput,
    entorno: Record<string, number>,
    camino: Set<number>,
    avisos: string[],
    cache?: Map<number, CostoCalculado>,
  ): Promise<ValorResuelto> {
    const base: ValorResuelto = { ...v, valorResuelto: 0 };
    try {
      switch (v.fuente) {
        case "manual":
          base.valorResuelto = v.valor ?? 0;
          break;
        case "variante": {
          const variantId = optNum(v.opciones, "variantId");
          if (!variantId) {
            base.error = "Falta elegir la variante.";
            break;
          }
          const variant = await this.prisma.productVariant.findUnique({
            where: { id: variantId },
            select: { costoCompra: true },
          });
          base.valorResuelto = variant?.costoCompra ? dec(variant.costoCompra) : 0;
          if (!variant?.costoCompra) base.detalle = "La variante no tiene costo de compra.";
          break;
        }
        case "formula": {
          const expresion = optStr(v.opciones, "expresion");
          if (!expresion) {
            base.error = "Falta la sub-expresión.";
            break;
          }
          base.valorResuelto = this.r4(evaluarFormula(expresion, entorno));
          break;
        }
        case "bom": {
          const tipo = optStr(v.opciones, "tipo");
          const componenteId = optNum(v.opciones, "componenteId");
          const merma = optNum(v.opciones, "mermaPct") ?? 0;
          const componentes = await this.prisma.productComponent.findMany({
            where: {
              productId,
              ...(tipo ? { tipo: tipo as never } : {}),
              ...(componenteId ? { componentId: componenteId } : {}),
            },
          });
          if (componentes.length === 0) {
            base.detalle = "Sin componentes en el BOM para este filtro.";
          }
          let suma = 0;
          for (const c of componentes) {
            const costo = await this.calcularProducto(c.componentId, camino, cache);
            if (costo.avisos.length) avisos.push(...costo.avisos);
            suma += dec(c.cantidad) * costo.total;
          }
          base.valorResuelto = this.r4(suma * (1 + merma));
          base.detalle = `${componentes.length} componente(s)${merma ? ` · merma ${(merma * 100).toFixed(2)}%` : ""}`;
          break;
        }
        default:
          base.error = `Fuente desconocida "${v.fuente}".`;
      }
    } catch (e) {
      base.error = (e as Error).message;
      base.valorResuelto = 0;
    }
    return base;
  }
}
