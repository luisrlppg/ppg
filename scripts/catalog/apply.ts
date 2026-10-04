/**
 * Motor genérico de operaciones de catálogo (ops declarativas en YAML).
 *
 * Uso:
 *   pnpm exec dotenv -e .env -- pnpm --filter @ppg/db exec tsx ../../scripts/catalog/apply.ts --file scripts/catalog/ops/mi-caso.yaml
 *   ... -- --apply   (sin --apply es dry-run: no escribe)
 *
 * Idempotente y transaccional. Ver docs/CATALOG-OPS.md.
 */
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";
import { loadOpsFile } from "./lib/ops";
import { applyOps, type EngineResult } from "./lib/engine";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const prisma = new PrismaClient();
const APPLY = process.argv.includes("--apply");
class Rollback extends Error {}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const file = arg("--file");
  if (!file) throw new Error("Falta --file <ruta-ops.yaml>");
  const filePath = isAbsolute(file) ? file : resolve(ROOT, file);
  const parsed = loadOpsFile(filePath);

  console.log(`Ops: ${parsed.name} (${parsed.ops.length} operaciones)${parsed.description ? ` — ${parsed.description}` : ""}`);
  if (!APPLY) console.log("(dry-run) No se escribirá nada. Usa --apply para aplicar.");
  console.log("Backup recomendado: pnpm db:backup  (o `ppg backup [nombre]`)\n");

  const result: EngineResult = { logs: [], warns: [] };
  await prisma
    .$transaction(async (tx) => {
      const r = await applyOps(tx, parsed.ops);
      result.logs.push(...r.logs);
      result.warns.push(...r.warns);
      if (!APPLY) throw new Rollback();
    }, { timeout: 120000, maxWait: 20000 })
    .catch((e) => { if (!(e instanceof Rollback)) throw e; });

  for (const l of result.logs) console.log(l);
  const warns = result.warns;
  if (warns.length) {
    console.log(`\nPENDIENTES/AVISOS (${warns.length}):`);
    for (const w of warns) console.log(`  - ${w}`);
  }
  console.log(APPLY ? "\nAplicado." : "\n(dry-run) Rollback. Usa --apply para aplicar.");
}

main().catch((e) => { console.error(`ERROR: ${(e as Error).message}`); process.exit(1); }).finally(() => prisma.$disconnect());
