/**
 * Exporta el catálogo actual de la BD a ops declarativas (seed reproducible).
 *
 * Genera:
 *   scripts/catalog/seed/catalog.yaml  (categorías, ubicaciones, empaques, productos,
 *                                       atributos+valores, ejes, BOM, pasos, variantes+meta)
 *   scripts/catalog/seed/stock.yaml    (stock por variante+ubicación)
 *
 * Uso:
 *   pnpm exec dotenv -e .env -- pnpm --filter @ppg/db exec tsx ../../scripts/catalog/export-seed.ts [--out scripts/catalog/seed]
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { stringify } from "yaml";
import { PrismaClient } from "@prisma/client";
import type { Op } from "./lib/ops";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const prisma = new PrismaClient();

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const outDir = resolve(ROOT, arg("--out") ?? "scripts/catalog/seed");
  mkdirSync(outDir, { recursive: true });

  const [categories, locations, packagings, attributes, products, stockLevels] = await Promise.all([
    prisma.category.findMany({ orderBy: { nombre: "asc" } }),
    prisma.location.findMany({ orderBy: { nombre: "asc" } }),
    prisma.packaging.findMany({ orderBy: { nombre: "asc" } }),
    prisma.attribute.findMany({ include: { values: { orderBy: { id: "asc" } } }, orderBy: { nombre: "asc" } }),
    prisma.product.findMany({
      orderBy: { id: "asc" },
      include: {
        category: true,
        attributeLines: { include: { attribute: true }, orderBy: { sortOrder: "asc" } },
        attributeValues: true,
        components: { include: { component: true }, orderBy: { id: "asc" } },
        passos: { include: { attribute: true }, orderBy: { sortOrder: "asc" } },
        variants: {
          include: {
            variantAttributes: { include: { attribute: true, value: true } },
            packagings: { include: { packaging: true } },
          },
          orderBy: { sku: "asc" },
        },
      },
    }),
    prisma.stockLevel.findMany({ include: { variant: true, location: true }, orderBy: { id: "asc" } }),
  ]);

  const productName = new Map(products.map((p) => [p.id, p.nombre]));
  const valueName = new Map<number, string>();
  for (const a of attributes) for (const v of a.values) valueName.set(v.id, v.valor);

  const ops: Op[] = [];

  // 1. Categorías / ubicaciones / empaques
  for (const c of categories) ops.push({ op: "category.ensure", nombre: c.nombre });
  for (const l of locations) ops.push({ op: "location.ensure", nombre: l.nombre, ...(String(l.tipo) !== "almacen" ? { tipo: String(l.tipo) as "temporal" } : {}) });
  for (const p of packagings) ops.push({ op: "packaging.ensure", nombre: p.nombre });

  // 2. Productos
  for (const p of products) {
    ops.push({
      op: "product.define",
      nombre: p.nombre,
      sku: p.skuBase,
      ...(String(p.uom) !== "pieza" ? { uom: String(p.uom) as "kg" | "metro" } : {}),
      ...(p.category ? { category: p.category.nombre } : {}),
      ...(Number(p.basePrice) !== 0 ? { basePrice: Number(p.basePrice) } : {}),
      ...(p.hasVariants ? { hasVariants: true } : {}),
      ...(p.vendible ? { vendible: true } : {}),
      ...(p.imagen ? { imagen: p.imagen } : {}),
      ...(!p.activo ? { activo: false } : {}),
    });
  }

  // 3. Atributos + valores
  for (const a of attributes) ops.push({ op: "attr.ensure", name: a.nombre, values: a.values.map((v) => v.valor) });

  // 4. Ejes (+ permitidos)
  for (const p of products) {
    for (const l of p.attributeLines) {
      ops.push({ op: "attr.assignAxis", product: p.nombre, attribute: l.attribute.nombre, sortOrder: l.sortOrder });
    }
    for (const l of p.attributeLines) {
      const vals = p.attributeValues.filter((av) => av.attributeId === l.attributeId).map((av) => valueName.get(av.valueId)).filter((x): x is string => !!x);
      if (vals.length) ops.push({ op: "attr.restrictValues", product: p.nombre, attribute: l.attribute.nombre, values: vals });
    }
  }

  // 5. BOM + pasos
  for (const p of products) {
    if (p.components.length) {
      ops.push({
        op: "bom.set",
        product: p.nombre,
        components: p.components.map((c) => ({ component: c.component.nombre, cantidad: Number(c.cantidad), tipo: String(c.tipo) as "exacto" | "consumible" })),
      });
    }
    if (p.passos.length) {
      ops.push({
        op: "step.set",
        product: p.nombre,
        steps: p.passos.map((s) => ({
          sortOrder: s.sortOrder,
          panel: s.panel,
          pregunta: s.pregunta,
          ...(s.attribute ? { attribute: s.attribute.nombre } : {}),
          ...(s.variantProductId ? { variantProduct: productName.get(s.variantProductId) ?? null } : {}),
        })),
      });
    }
  }

  // 6. Variantes (+ meta + empaques)
  for (const p of products) {
    for (const v of p.variants) {
      ops.push({
        op: "variant.define",
        sku: v.sku,
        product: p.nombre,
        ...(v.nombre !== p.nombre ? { nombre: v.nombre } : {}),
        attrs: Object.fromEntries(v.variantAttributes.map((va) => [va.attribute.nombre, va.value.valor])),
        ...(v.price !== null ? { price: Number(v.price) } : {}),
        ...(Number(v.stockMin) !== 0 ? { min: Number(v.stockMin) } : {}),
        ...(Number(v.stockMax) !== 0 ? { max: Number(v.stockMax) } : {}),
        ...(v.longLead ? { longLead: true } : {}),
        ...(!v.activo ? { activo: false } : {}),
        ...(v.imagen ? { imagen: v.imagen } : {}),
        ...(v.notas ? { notas: v.notas } : {}),
      });
      if (v.packagings.length) {
        ops.push({ op: "packaging.set", sku: v.sku, empaques: v.packagings.map((pk) => ({ nombre: pk.packaging.nombre, cantidad: Number(pk.cantidad) })) });
      }
    }
  }

  // 7. Stock (archivo aparte)
  const stockOps: Op[] = stockLevels
    .filter((s) => Number(s.qty) !== 0)
    .map((s) => ({ op: "stock.set", sku: s.variant.sku, location: s.location.nombre, qty: Number(s.qty) }));

  writeFileSync(join(outDir, "catalog.yaml"), stringify({ version: 1, name: "catalog", description: "Catálogo PPG (generado por export-seed.ts)", ops }));
  writeFileSync(join(outDir, "stock.yaml"), stringify({ version: 1, name: "stock", description: "Stock inicial (generado por export-seed.ts)", ops: stockOps }));

  console.log(`catalog.yaml: ${ops.length} ops (${products.length} productos, ${products.reduce((a, p) => a + p.variants.length, 0)} variantes)`);
  console.log(`stock.yaml:   ${stockOps.length} niveles`);
  console.log(`  ${join(outDir, "catalog.yaml")}`);
  console.log(`  ${join(outDir, "stock.yaml")}`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
