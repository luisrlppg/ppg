import { PrismaService } from "../prisma/prisma.service";

/**
 * Atributos de un producto: propios (ProductAttributeLine directos) + heredados
 * (atributos de los componentes del BOM, recolectados recursivamente).
 */
export async function atributosPorProducto(prisma: PrismaService, productId: number) {
  // Propios: ProductAttributeLine directos al producto
  const propiosLines = await prisma.productAttributeLine.findMany({
    where: { productId },
    include: { attribute: { include: { values: { orderBy: { id: "asc" } } } } },
  });

  // Recolectar componentes del BOM recursivamente
  const componentAttributeIds = new Set<number>();

  async function collectComponentAttributes(pid: number, visited: Set<number> = new Set()) {
    if (visited.has(pid)) return;
    visited.add(pid);

    const components = await prisma.productComponent.findMany({
      where: { productId: pid },
      include: { component: { include: { attributeLines: true } } },
    });

    for (const c of components) {
      for (const line of c.component.attributeLines) {
        componentAttributeIds.add(line.attributeId);
      }
      await collectComponentAttributes(c.componentId, visited);
    }
  }

  await collectComponentAttributes(productId);

  // Heredados: atributos de componentes (que no sean propios ya)
  const propiosIds = new Set(propiosLines.map((l) => l.attributeId));
  const heredadoIds = [...componentAttributeIds].filter((id) => !propiosIds.has(id));

  const heredados = await prisma.attribute.findMany({
    where: { id: { in: heredadoIds } },
    include: { values: { orderBy: { id: "asc" } } },
  });

  return {
    propios: propiosLines.map((l) => ({
      id: l.attribute.id,
      nombre: l.attribute.nombre,
      valores: l.attribute.values,
    })),
    heredados: heredados.map((a) => ({
      id: a.id,
      nombre: a.nombre,
      valores: a.values,
    })),
  };
}
