import { PrismaService } from "../prisma/prisma.service";

/**
 * Valores permitidos de un atributo para un producto (los "ejes" = atributo +
 * subconjunto de valores). Si no hay filas en ProductAttributeValue para el
 * par (producto, atributo), se asume que todos los valores son válidos
 * (fallback / comportamiento original).
 */
export async function valoresPermitidos(
  prisma: PrismaService,
  productId: number,
  attributeId: number,
): Promise<number[]> {
  const filas = await prisma.productAttributeValue.findMany({
    where: { productId, attributeId },
    select: { valueId: true },
  });
  if (filas.length > 0) {
    return filas.map((f) => f.valueId);
  }
  const values = await prisma.attributeValue.findMany({
    where: { attributeId },
    select: { id: true },
    orderBy: { id: "asc" },
  });
  return values.map((v) => v.id);
}

/** Igual que `valoresPermitidos` pero con detalle { id, valor }. */
export async function valoresPermitidosDetalle(
  prisma: PrismaService,
  productId: number,
  attributeId: number,
): Promise<{ id: number; valor: string }[]> {
  const ids = await valoresPermitidos(prisma, productId, attributeId);
  return prisma.attributeValue.findMany({
    where: { id: { in: ids } },
    orderBy: { id: "asc" },
    select: { id: true, valor: true },
  });
}

/**
 * Versión por lote de `valoresPermitidos` para varios atributos a la vez
 * (evita el N+1: 1-2 queries sin importar cuántos atributos).
 * Devuelve Map<attributeId, valueIds permitidos>.
 */
export async function valoresPermitidosLote(
  prisma: PrismaService,
  productId: number,
  attributeIds: number[],
): Promise<Map<number, number[]>> {
  const map = new Map<number, number[]>();
  if (attributeIds.length === 0) return map;

  const filas = await prisma.productAttributeValue.findMany({
    where: { productId, attributeId: { in: attributeIds } },
    select: { attributeId: true, valueId: true },
  });
  const conRestriccion = new Set<number>();
  for (const f of filas) {
    const arr = map.get(f.attributeId) ?? [];
    arr.push(f.valueId);
    map.set(f.attributeId, arr);
    conRestriccion.add(f.attributeId);
  }

  const sinRestriccion = attributeIds.filter((id) => !conRestriccion.has(id));
  if (sinRestriccion.length > 0) {
    const vals = await prisma.attributeValue.findMany({
      where: { attributeId: { in: sinRestriccion } },
      orderBy: { id: "asc" },
      select: { attributeId: true, id: true },
    });
    for (const v of vals) {
      const arr = map.get(v.attributeId) ?? [];
      arr.push(v.id);
      map.set(v.attributeId, arr);
    }
  }
  return map;
}