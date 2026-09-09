import { PrismaService } from "../prisma/prisma.service";
import { valoresPermitidosLote } from "../common/valores-permitidos";

/**
 * Atributos de un producto: propios (ProductAttributeLine directos) + heredados
 * (atributos de los componentes del BOM, recolectados recursivamente).
 * Cada atributo expone `valores` (catálogo completo) y `permitidos`
 * (los valueIds válidos para el producto = los "ejes").
 */
export async function atributosPorProducto(prisma: PrismaService, productId: number) {
  // Propios: ProductAttributeLine directos al producto
  const propiosLines = await prisma.productAttributeLine.findMany({
    where: { productId },
    include: { attribute: { include: { values: { orderBy: { id: "asc" } } } } },
  });
  const propiosIds = propiosLines.map((l) => l.attributeId);

  // Recolectar componentes del BOM recursivamente (atributo -> productos componente)
  const componentAttributeLines = new Map<number, number[]>();

  async function collectComponentAttributes(pid: number, visited: Set<number> = new Set()) {
    if (visited.has(pid)) return;
    visited.add(pid);

    const components = await prisma.productComponent.findMany({
      where: { productId: pid },
      include: { component: { include: { attributeLines: true } } },
    });

    for (const c of components) {
      for (const line of c.component.attributeLines) {
        const list = componentAttributeLines.get(line.attributeId) ?? [];
        list.push(c.componentId);
        componentAttributeLines.set(line.attributeId, list);
      }
      await collectComponentAttributes(c.componentId, visited);
    }
  }

  await collectComponentAttributes(productId);

  // Heredados: atributos de componentes (que no sean propios ya)
  const heredadoIds = [...componentAttributeLines.keys()].filter((id) => !propiosIds.includes(id));

  // Propios: permitidos de todos los ejes en un solo lote.
  const propiosPermitidos = await valoresPermitidosLote(prisma, productId, propiosIds);
  const propios = propiosLines.map((l) => ({
    id: l.attribute.id,
    nombre: l.attribute.nombre,
    valores: l.attribute.values,
    permitidos: propiosPermitidos.get(l.attributeId) ?? [],
  }));

  // Heredados: unión de los permitidos de los componentes que comparten el atributo.
  const porComponente = new Map<number, number[]>();
  for (const [attributeId, pids] of componentAttributeLines) {
    for (const pid of pids) {
      const arr = porComponente.get(pid) ?? [];
      arr.push(attributeId);
      porComponente.set(pid, arr);
    }
  }
  const unionPorAtributo = new Map<number, Set<number>>();
  for (const [pid, attrs] of porComponente) {
    const lote = await valoresPermitidosLote(prisma, pid, attrs);
    for (const a of attrs) {
      const set = unionPorAtributo.get(a) ?? new Set<number>();
      for (const v of lote.get(a) ?? []) set.add(v);
      unionPorAtributo.set(a, set);
    }
  }

  const heredadosBase = await prisma.attribute.findMany({
    where: { id: { in: heredadoIds } },
    include: { values: { orderBy: { id: "asc" } } },
  });

  const heredados = heredadosBase.map((a) => {
    let set = unionPorAtributo.get(a.id);
    if (!set || set.size === 0) {
      // Ningún componente restringido: se asumen todos los valores.
      set = new Set(a.values.map((v) => v.id));
    }
    return { id: a.id, nombre: a.nombre, valores: a.values, permitidos: [...set] };
  });

  return { propios, heredados };
}