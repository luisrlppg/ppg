import { NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

function slugify(valores: string[]): string {
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

export interface MaterializableCombo {
  valueIds: number[];
  valoracion: string[];
  varianteId: number | null;
  nombre: string;
  sku: string;
}

export interface Grid {
  ejes: { attributeId: number; nombre: string; valores: { id: number; valor: string }[]; sortOrder: number }[];
  combinaciones: MaterializableCombo[];
}

/**
 * Calcula el grid cartesiano de combinaciones posibles para un producto,
 * marcando cuáles ya tienen variante materializada.
 */
export async function gridProducto(prisma: PrismaService, productId: number): Promise<Grid> {
  const p = await prisma.product.findUnique({
    where: { id: productId },
    include: {
      attributeLines: { include: { attribute: { include: { values: { orderBy: { id: "asc" } } } } }, orderBy: { sortOrder: "asc" } },
      variants: { include: { variantAttributes: { include: { value: true } } } },
    },
  });
  if (!p) throw new NotFoundException("Producto no encontrado");

  const ejes = p.attributeLines.map((l) => ({
    attributeId: l.attributeId,
    nombre: l.attribute.nombre,
    sortOrder: l.sortOrder,
    valores: l.attribute.values.map((v) => ({ id: v.id, valor: v.valor })),
  }));

  const existing = p.variants.filter((v) => v.variantAttributes.length === ejes.length);
  const combinaciones: MaterializableCombo[] = [];

  const cartesian: number[][] = ejes.reduce<number[][]>(
    (acc, eje) => {
      if (acc.length === 0) return eje.valores.map((v) => [v.id]);
      const out: number[][] = [];
      for (const prefix of acc) for (const v of eje.valores) out.push([...prefix, v.id]);
      return out;
    },
    [],
  );

  const valorById = new Map<number, string>();
  for (const e of ejes) for (const v of e.valores) valorById.set(v.id, v.valor);

  for (const valueIds of cartesian) {
    const match = existing.find((v) => {
      const set = new Set(v.variantAttributes.map((va) => va.valueId));
      return valueIds.length === set.size && valueIds.every((vid) => set.has(vid));
    });
    const valoracion = valueIds.map((id) => valorById.get(id) ?? id.toString());
    combinaciones.push({
      valueIds,
      valoracion,
      varianteId: match ? match.id : null,
      nombre: valoracion.join(" "),
      sku: `${p.skuBase}-${slugify(valoracion)}`,
    });
  }

  return { ejes, combinaciones };
}
