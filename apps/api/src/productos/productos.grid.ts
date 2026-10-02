import { NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { valoresPermitidosLote } from "../common/valores-permitidos";

export function slugify(valores: string[]): string {
  return valores
    .map((v) =>
      v
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, ""),
    )
    .join("-");
}

export interface GridEje {
  attributeId: number;
  nombre: string;
  valores: { id: number; valor: string }[];
  sortOrder: number;
}

export interface GridVarianteExistente {
  varianteId: number;
  valueIds: number[];
  nombre: string;
  sku: string;
}

export interface Grid {
  ejes: GridEje[];
  existentes: GridVarianteExistente[];
}

/** Clave canónica de una combinación (valueIds en orden de ejes). */
export function comboKey(valueIds: number[]): string {
  return valueIds.join(",");
}

/**
 * Ejes de un producto (atributo + subconjunto de valores permitidos).
 * Ligero: no genera el producto cartesiano. Complejidad O(ejes).
 */
export async function ejesProducto(prisma: PrismaService, productId: number): Promise<GridEje[]> {
  const p = await prisma.product.findUnique({
    where: { id: productId },
    include: {
      attributeLines: {
        include: { attribute: { include: { values: { orderBy: { id: "asc" } } } } },
        orderBy: { sortOrder: "asc" },
      },
    },
  });
  if (!p) throw new NotFoundException("Producto no encontrado");

  const ejeIds = p.attributeLines.map((l) => l.attributeId);
  const permitidos = await valoresPermitidosLote(prisma, productId, ejeIds);

  return p.attributeLines.map((l) => {
    const ids = new Set(permitidos.get(l.attributeId) ?? []);
    return {
      attributeId: l.attributeId,
      nombre: l.attribute.nombre,
      sortOrder: l.sortOrder,
      valores: l.attribute.values.map((v) => ({ id: v.id, valor: v.valor })).filter((v) => ids.has(v.id)),
    };
  });
}

/**
 * Variantes materializadas del producto con sus valueIds alineados al orden de
 * ejes. Acotado por el número de variantes (no por el producto cartesiano).
 */
export async function variantesExistentes(
  prisma: PrismaService,
  productId: number,
  ejes: GridEje[],
): Promise<GridVarianteExistente[]> {
  const variants = await prisma.productVariant.findMany({
    where: { productId },
    select: { id: true, nombre: true, sku: true, variantAttributes: { select: { attributeId: true, valueId: true } } },
  });

  const out: GridVarianteExistente[] = [];
  for (const v of variants) {
    const byAttr = new Map(v.variantAttributes.map((va) => [va.attributeId, va.valueId]));
    if (byAttr.size !== ejes.length) continue;
    const valueIds: number[] = [];
    let ok = true;
    for (const eje of ejes) {
      const vid = byAttr.get(eje.attributeId);
      if (vid === undefined) { ok = false; break; }
      valueIds.push(vid);
    }
    if (!ok) continue;
    out.push({ varianteId: v.id, valueIds, nombre: v.nombre, sku: v.sku });
  }
  return out;
}

/**
 * Grid resumido del producto: ejes + variantes ya materializadas.
 * Ya NO devuelve el producto cartesiano completo.
 */
export async function gridProducto(prisma: PrismaService, productId: number): Promise<Grid> {
  const ejes = await ejesProducto(prisma, productId);
  const existentes = await variantesExistentes(prisma, productId, ejes);
  return { ejes, existentes };
}
