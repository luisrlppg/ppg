import type { PrismaClient } from "@prisma/client";

export interface SnapshotAttr {
  id: number;
  nombre: string;
  values: string[];
}

export interface SnapshotAxis {
  attribute: string;
  sortOrder: number;
  allowedValues: string[] | null; // null = todos los valores del atributo
}

export interface SnapshotVariant {
  id: number;
  sku: string;
  nombre: string;
  activo: boolean;
  stockMin: number;
  stockMax: number;
  costoCompra: number | null;
  prioridad: string;
  attrs: Record<string, string>;
}

export interface SnapshotProduct {
  id: number;
  nombre: string;
  skuBase: string;
  uom: string;
  comprable: boolean;
  fabricable: boolean;
  axes: SnapshotAxis[];
  variants: SnapshotVariant[];
}

export interface CatalogSnapshot {
  generatedAt: string;
  attributes: SnapshotAttr[];
  products: SnapshotProduct[];
}

const num = (d: unknown) => Number(d ?? 0);

export async function buildSnapshot(
  prisma: PrismaClient,
  opts: { productNames?: string[] } = {},
): Promise<CatalogSnapshot> {
  const attributes = await prisma.attribute.findMany({
    include: { values: { orderBy: { id: "asc" } } },
    orderBy: { nombre: "asc" },
  });

  const products = await prisma.product.findMany({
    where: opts.productNames?.length ? { nombre: { in: opts.productNames } } : undefined,
    include: {
      attributeLines: { include: { attribute: true }, orderBy: { sortOrder: "asc" } },
      variants: {
        include: { variantAttributes: { include: { attribute: true, value: true } } },
        orderBy: { sku: "asc" },
      },
    },
    orderBy: { id: "asc" },
  });

  const allowed = await prisma.productAttributeValue.findMany();
  const allowedByPair = new Map<string, string[]>();
  const valueName = new Map<number, string>();
  for (const a of attributes) for (const v of a.values) valueName.set(v.id, v.valor);
  for (const p of allowed) {
    const k = `${p.productId}:${p.attributeId}`;
    const arr = allowedByPair.get(k) ?? [];
    const name = valueName.get(p.valueId);
    if (name) arr.push(name);
    allowedByPair.set(k, arr);
  }

  return {
    generatedAt: new Date().toISOString(),
    attributes: attributes.map((a) => ({ id: a.id, nombre: a.nombre, values: a.values.map((v) => v.valor) })),
    products: products.map((p) => ({
      id: p.id,
      nombre: p.nombre,
      skuBase: p.skuBase,
      uom: p.uom,
      comprable: p.comprable,
      fabricable: p.fabricable,
      axes: p.attributeLines.map((l) => {
        const list = allowedByPair.get(`${p.id}:${l.attributeId}`);
        return { attribute: l.attribute.nombre, sortOrder: l.sortOrder, allowedValues: list && list.length ? list : null };
      }),
      variants: p.variants.map((v) => ({
        id: v.id,
        sku: v.sku,
        nombre: v.nombre,
        activo: v.activo,
        stockMin: num(v.stockMin),
        stockMax: num(v.stockMax),
        costoCompra: v.costoCompra === null ? null : num(v.costoCompra),
        prioridad: v.prioridad,
        attrs: Object.fromEntries(v.variantAttributes.map((va) => [va.attribute.nombre, va.value.valor])),
      })),
    })),
  };
}

export function snapshotToMarkdown(s: CatalogSnapshot): string {
  const out: string[] = [];
  out.push(`# Catálogo PPG`, ``, `Generado: ${s.generatedAt}`, ``);
  out.push(`## Atributos (${s.attributes.length})`, ``);
  out.push(`| Atributo | Valores |`, `|---|---|`);
  for (const a of s.attributes) out.push(`| ${a.nombre} | ${a.values.join(", ") || "—"} |`);
  out.push(``, `## Productos (${s.products.length})`, ``);
  for (const p of s.products) {
    const flags = [p.comprable ? "comprable" : null, p.fabricable ? "fabricable" : null].filter(Boolean);
    out.push(`### ${p.nombre} (${p.skuBase}, ${p.uom})${flags.length ? ` — ${flags.join(", ")}` : ""}`, ``);
    out.push(`Ejes: ${p.axes.map((x) => `${x.attribute}${x.allowedValues ? ` [${x.allowedValues.join("|")}]` : ""}`).join(" · ") || "—"}`, ``);
    out.push(`| SKU | ${p.axes.map((x) => x.attribute).join(" | ")} |`, `|${"---|".repeat(p.axes.length + 1)}`);
    for (const v of p.variants) out.push(`| ${v.sku} | ${p.axes.map((x) => v.attrs[x.attribute] ?? "").join(" | ")} |`);
    out.push(``);
  }
  return out.join("\n");
}
