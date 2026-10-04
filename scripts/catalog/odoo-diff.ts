/**
 * Compara el crosswalk de Odoo (`mapeo-odoo-ppg.csv`, ya normalizado a nombres PPG)
 * contra el estado actual de PPG y propone operaciones.
 *
 * NO escribe en la base de datos: genera
 *   - docs/odoo-diff-report.md / .csv
 *   - scripts/catalog/ops/odoo-diff-<fecha>.yaml  (para revisar y correr con apply.ts)
 *
 * Uso:
 *   pnpm exec dotenv -e .env -- pnpm --filter @ppg/db exec tsx ../../scripts/catalog/odoo-diff.ts [--crosswalk <csv>] [--out docs]
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { stringify } from "yaml";
import { PrismaClient } from "@prisma/client";
import { buildSnapshot, type CatalogSnapshot } from "./lib/snapshot";
import { readCrosswalk } from "./lib/odoo";
import type { Op } from "./lib/ops";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const prisma = new PrismaClient();

const norm = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim().toLowerCase();

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

interface DiffRow {
  sku: string;
  producto: string;
  tipo: "faltante" | "conflicto" | "valor_nuevo" | "sin_variante" | "sin_producto" | "sin_eje";
  detalle: string;
}

async function main() {
  const crosswalkPath = resolve(ROOT, arg("--crosswalk") ?? "scripts/odoo-migration/mapeo-odoo-ppg.csv");
  const outDir = resolve(ROOT, arg("--out") ?? "docs");
  const opsDir = resolve(ROOT, "scripts/catalog/ops");

  const snap: CatalogSnapshot = await buildSnapshot(prisma);
  const attrValues = new Map(snap.attributes.map((a) => [a.nombre, new Set(a.values)]));
  const productByName = new Map(snap.products.map((p) => [p.nombre, p]));
  const rows = readCrosswalk(crosswalkPath);

  const diffs: DiffRow[] = [];
  const ops: Op[] = [];
  const addedValue = new Set<string>();

  for (const row of rows) {
    const product = productByName.get(row.producto);
    if (!product) { diffs.push({ sku: row.sku, producto: row.producto, tipo: "sin_producto", detalle: "" }); continue; }
    const variant = product.variants.find((v) => v.sku === row.sku);
    if (!variant) { diffs.push({ sku: row.sku, producto: row.producto, tipo: "sin_variante", detalle: "" }); continue; }
    const axes = new Set(product.axes.map((a) => a.attribute));

    for (const [attr, val] of Object.entries(row.attrs)) {
      const values = attrValues.get(attr);
      if (!values) { diffs.push({ sku: row.sku, producto: row.producto, tipo: "sin_eje", detalle: `${attr}=${val}` }); continue; }
      if (!axes.has(attr)) { diffs.push({ sku: row.sku, producto: row.producto, tipo: "sin_eje", detalle: `${attr}=${val}` }); continue; }
      const hasValue = [...values].some((v) => norm(v) === norm(val));
      if (!hasValue) {
        diffs.push({ sku: row.sku, producto: row.producto, tipo: "valor_nuevo", detalle: `${attr}=${val}` });
        const k = `${attr}=${norm(val)}`;
        if (!addedValue.has(k)) { ops.push({ op: "value.add", attribute: attr, value: val }); addedValue.add(k); }
        ops.push({ op: "variant.set", sku: row.sku, attribute: attr, value: val });
        continue;
      }
      const current = variant.attrs[attr];
      if (current === undefined) {
        diffs.push({ sku: row.sku, producto: row.producto, tipo: "faltante", detalle: `${attr}=${val}` });
        ops.push({ op: "variant.set", sku: row.sku, attribute: attr, value: val });
      } else if (norm(current) !== norm(val)) {
        diffs.push({ sku: row.sku, producto: row.producto, tipo: "conflicto", detalle: `${attr}: PPG=${current} / Odoo=${val}` });
      }
    }
  }

  mkdirSync(outDir, { recursive: true });
  mkdirSync(opsDir, { recursive: true });

  const conOps = diffs.filter((d) => d.tipo === "faltante" || d.tipo === "valor_nuevo").length;
  const conflictos = diffs.filter((d) => d.tipo === "conflicto").length;
  const sinMatch = diffs.filter((d) => d.tipo === "sin_variante" || d.tipo === "sin_producto" || d.tipo === "sin_eje").length;

  const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const opsPath = join(opsDir, `odoo-diff-${ts}.yaml`);
  if (ops.length) {
    writeFileSync(opsPath, stringify({ version: 1, name: `odoo-diff-${ts}`, description: "Generado por odoo-diff.ts (revisar antes de aplicar)", ops }));
  }

  const md: string[] = [];
  md.push(`# Odoo ↔ PPG`, ``, `Crosswalk: \`${crosswalkPath}\``, ``, `| tipo | sku | producto | detalle |`, `|---|---|---|---|`);
  for (const d of diffs) md.push(`| ${d.tipo} | ${d.sku} | ${d.producto} | ${d.detalle} |`);
  writeFileSync(join(outDir, "odoo-diff-report.md"), md.join("\n") + "\n");

  const csv = ["tipo,sku,producto,detalle", ...diffs.map((d) => [d.tipo, d.sku, d.producto, d.detalle.replace(/,/g, ";")].join(","))];
  writeFileSync(join(outDir, "odoo-diff-report.csv"), csv.join("\n") + "\n");

  console.log(`Comparados: ${rows.length} SKUs del crosswalk`);
  console.log(`  faltantes/valor nuevo (con op): ${conOps}`);
  console.log(`  conflictos (revisar):           ${conflictos}`);
  console.log(`  sin match/atributo:             ${sinMatch}`);
  console.log(`\n  ${join(outDir, "odoo-diff-report.md")}`);
  console.log(`  ${join(outDir, "odoo-diff-report.csv")}`);
  if (ops.length) console.log(`  ${opsPath}  (${ops.length} ops)`);
  else console.log(`  (sin ops sugeridas)`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
