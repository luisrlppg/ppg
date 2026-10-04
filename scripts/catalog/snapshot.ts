/**
 * Snapshot del catálogo PPG (solo lectura).
 *
 * Vuelca atributos/valores, ejes por producto y variantes con sus valores a
 * `docs/catalog-snapshot.json` + `docs/catalog-snapshot.md` para que otra IA
 * (o un humano) vea el estado canónico sin consultar IDs.
 *
 * Uso:
 *   pnpm exec dotenv -e .env -- pnpm --filter @ppg/db exec tsx ../../scripts/catalog/snapshot.ts [--out docs] [--products Mango,Pincel]
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";
import { buildSnapshot, snapshotToMarkdown } from "./lib/snapshot";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const prisma = new PrismaClient();

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const outDir = resolve(ROOT, arg("--out") ?? "docs");
  const products = arg("--products")?.split(",").map((s) => s.trim()).filter(Boolean);
  const snap = await buildSnapshot(prisma, { productNames: products });
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, "catalog-snapshot.json"), JSON.stringify(snap, null, 2) + "\n");
  writeFileSync(join(outDir, "catalog-snapshot.md"), snapshotToMarkdown(snap) + "\n");
  console.log(`Snapshot: ${snap.attributes.length} atributos, ${snap.products.length} productos`);
  console.log(`  ${join(outDir, "catalog-snapshot.json")}`);
  console.log(`  ${join(outDir, "catalog-snapshot.md")}`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
