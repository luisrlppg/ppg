/**
 * One-off: completa los ejes `Color de Vastago` y `Punta` de las variantes de
 * `Vastago` que quedaron incompletas porque su valor no se podía derivar de la
 * información migrada de Odoo. Refleja la captura manual revisada por el equipo.
 *
 * Uso:
 *   pnpm exec dotenv -e .env -- pnpm --filter @ppg/db exec tsx ../../scripts/completar-vastago.ts [--dry]
 *   `--apply` escribe; sin él, sólo reporta. Idempotente.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const APPLY = process.argv.includes("--apply");
class Rollback extends Error {}

const PRODUCTO_SKU = "VST";
const ATTR_COLOR = "Color de Vastago";
const ATTR_PUNTA = "Punta";

/** Valores finales (manual) por SKU. */
const COMPLETAR: Record<string, { color?: string; punta?: string }> = {
  "VST-0001": { color: "Blanco", punta: "Delineador" },
  "VST-0002": { color: "Blanco", punta: "Delineador" },
  "VST-0009": { punta: "Nylon" },
  "VST-0010": { color: "Negro", punta: "Delineador" },
  "VST-0011": { punta: "Gloss" },
  "VST-0012": { punta: "Gloss" },
  "VST-0013": { color: "Blanco", punta: "Delineador" },
  "VST-0015": { color: "Blanco", punta: "Delineador" },
  "VST-0016": { punta: "Nylon" },
  "VST-0017": { punta: "Nylon" },
};

async function main() {
  const product = await prisma.product.findFirst({ where: { skuBase: PRODUCTO_SKU } });
  if (!product) throw new Error(`No existe el producto con skuBase "${PRODUCTO_SKU}"`);

  const attrColor = await prisma.attribute.findUnique({ where: { nombre: ATTR_COLOR } });
  const attrPunta = await prisma.attribute.findUnique({ where: { nombre: ATTR_PUNTA } });
  if (!attrColor) throw new Error(`No existe el atributo "${ATTR_COLOR}"`);
  if (!attrPunta) throw new Error(`No existe el atributo "${ATTR_PUNTA}"`);

  const plans: { variantId: number; sku: string; attrNombre: string; attrId: number; valor: string }[] = [];
  const logs: string[] = [];
  const warns: string[] = [];

  const variantes = await prisma.productVariant.findMany({
    where: { productId: product.id, sku: { in: Object.keys(COMPLETAR) } },
    include: { variantAttributes: { include: { attribute: true, value: true } } },
  });
  const porSku = new Map(variantes.map((v) => [v.sku, v]));

  for (const [sku, valores] of Object.entries(COMPLETAR)) {
    const v = porSku.get(sku);
    if (!v) { warns.push(`${sku}: no existe`); continue; }
    const actual = new Map(v.variantAttributes.map((va) => [va.attribute.nombre, va.value.valor]));

    const pares = [
      { attrNombre: ATTR_COLOR, attrId: attrColor.id, valor: valores.color },
      { attrNombre: ATTR_PUNTA, attrId: attrPunta.id, valor: valores.punta },
    ];
    for (const p of pares) {
      if (p.valor === undefined) continue;
      if (actual.get(p.attrNombre) === p.valor) continue;
      const valueId = (await prisma.attributeValue.findFirst({ where: { attributeId: p.attrId, valor: p.valor } }))?.id;
      if (!valueId) { warns.push(`${sku}: no existe el valor "${p.valor}" en "${p.attrNombre}"`); continue; }
      plans.push({ variantId: v.id, sku, attrNombre: p.attrNombre, attrId: p.attrId, valor: p.valor });
      logs.push(`${sku}: ${p.attrNombre} = ${p.valor}`);
    }
  }

  await prisma.$transaction(async (tx) => {
    for (const p of plans) {
      const valueId = (await tx.attributeValue.findFirst({ where: { attributeId: p.attrId, valor: p.valor } }))!.id;
      await tx.variantAttribute.upsert({
        where: { variantId_attributeId: { variantId: p.variantId, attributeId: p.attrId } },
        update: { valueId },
        create: { variantId: p.variantId, attributeId: p.attrId, valueId },
      });
    }
    if (!APPLY) throw new Rollback();
  }, { timeout: 60000, maxWait: 10000 }).catch((e) => { if (!(e instanceof Rollback)) throw e; });

  for (const l of logs) console.log(l);
  console.log(`\n${plans.length} cambio(s)${plans.length === 0 ? " (ya estaba todo)": ""}.`);
  if (warns.length) { console.log(`\nAVISOS (${warns.length}):`); for (const w of warns) console.log(`  - ${w}`); }
  console.log(APPLY ? "\nAplicado." : "\n(dry-run) Rollback. Usa --apply para aplicar.");
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
