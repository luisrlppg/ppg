/**
 * Carga las notas internas de las variantes de Cepillo Nylon:
 *   - grosor de cerda (`grosor: N"`)
 *   - medidas de los "Recto" (`medida · grosor: 5"`)
 * Idempotente.
 *
 * Uso:
 *   pnpm exec dotenv -e .env -- pnpm --filter @ppg/db exec tsx ../../scripts/seed-cepillos-notas.ts [--dry]
 *   `--apply` escribe; sin él, sólo reporta.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const APPLY = process.argv.includes("--apply");

const NOTAS: Record<string, string> = {
  // Recto: medida · grosor
  "CNI-0021": "5x27.5 · grosor: 5\"",
  "CNI-0022": "8.75x22.25 · grosor: 5\"",
  "CNI-0023": "8x23 · grosor: 5\"",
  "CNI-0024": "8x23 · grosor: 5\"",
  "CNI-0025": "6x12 · grosor: 5\"",
  "CNI-0026": "Mini · grosor: 5\"",
  // Bala
  "CNI-0002": "grosor: 4\"",
  "CNI-0003": "grosor: 5\"",
  "CNI-0004": "grosor: 5\"",
  "CNI-0005": "grosor: 5.75\"",
  // Balita
  "CNI-0007": "grosor: 5\"",
  "CNI-0008": "grosor: 5\"",
  "CNI-0009": "grosor: 5.75\"",
  // Cacahuate
  "CNI-0010": "grosor: 5\"",
  "CNI-0011": "grosor: 5.75\"",
  // Citologico
  "CNI-0012": "grosor: 3\"",
  // Pino
  "CNI-0013": "grosor: 4\"",
  "CNI-0016": "grosor: 5\"",
  "CNI-0017": "grosor: 5\"",
  "CNI-0018": "grosor: 5\"",
  "CNI-0019": "grosor: 5.75\"",
  "CNI-0020": "grosor: 5.75\"",
};

async function main() {
  for (const [sku, nota] of Object.entries(NOTAS)) {
    const v = await prisma.productVariant.findUnique({ where: { sku } });
    if (!v) { console.log(`  ! ${sku} no existe`); continue; }
    if (v.notas === nota) { console.log(`  = ${sku} ya tiene "${nota}"`); continue; }
    console.log(`  ~ ${sku}: notas = "${nota}"`);
    if (APPLY) await prisma.productVariant.update({ where: { id: v.id }, data: { notas: nota } });
  }
  console.log(APPLY ? "\nAplicado." : "\n(dry) No se escribió nada. Usa --apply.");
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
