/**
 * Cierre de la migración de mín/máx: crea el producto PVC y agrega la "forma"
 * a las variantes Pino del Cepillo Nylon. Idempotente, dry-run por defecto.
 *
 * Uso:
 *   pnpm exec dotenv -e .env -- pnpm --filter @ppg/db exec tsx ../../scripts/finalizar-minmax.ts
 *   ... -- --apply
 */
import { PrismaClient, Prisma } from "@prisma/client";

const prisma = new PrismaClient();
const APPLY = process.argv.includes("--apply");

const logs: string[] = [];
const warns: string[] = [];
const log = (s: string) => logs.push(s);
const warn = (s: string) => warns.push(s);
class Rollback extends Error {}

type Tx = Prisma.TransactionClient;

async function ensureAttr(tx: Tx, nombre: string) {
  return (await tx.attribute.findUnique({ where: { nombre } })) ?? (await tx.attribute.create({ data: { nombre } }));
}
async function ensureValue(tx: Tx, attributeId: number, valor: string) {
  return tx.attributeValue.upsert({
    where: { attributeId_valor: { attributeId, valor } },
    update: {},
    create: { attributeId, valor },
  });
}
async function ensureLine(tx: Tx, productId: number, attributeId: number, sortOrder = 0) {
  const line = await tx.productAttributeLine.findUnique({ where: { productId_attributeId: { productId, attributeId } } });
  if (!line) await tx.productAttributeLine.create({ data: { productId, attributeId, sortOrder } });
}

async function main() {
  await prisma.$transaction(async (tx) => {
    // ---------------------------------------------------------------- PVC
    const catOtros = await tx.category.findFirst({ where: { nombre: "Otros" } });
    let pvc = await tx.product.findFirst({ where: { nombre: "PVC" } });
    if (!pvc) {
      pvc = await tx.product.create({
        data: { nombre: "PVC", skuBase: "PVC", uom: "kg", hasVariants: true, categoryId: catOtros?.id ?? null },
      });
      log("producto PVC creado");
    } else {
      if (pvc.uom !== "kg" || pvc.skuBase !== "PVC") {
        pvc = await tx.product.update({ where: { id: pvc.id }, data: { uom: "kg", skuBase: "PVC", hasVariants: true } });
      }
    }

    const colorAttr = await ensureAttr(tx, "Color de PVC");
    await ensureLine(tx, pvc.id, colorAttr.id, 0);

    for (const [valor, min, max] of [
      ["Violeta", 1000, 2500],
      ["Transparente", 500, 1500],
    ] as const) {
      const av = await ensureValue(tx, colorAttr.id, valor);
      const va = await tx.variantAttribute.findFirst({
        where: { attributeId: colorAttr.id, valueId: av.id, variant: { productId: pvc.id } },
      });
      let variantId: number;
      if (va) variantId = va.variantId;
      else {
        const sku = `PVC-${valor.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-")}`;
        const exist = await tx.productVariant.findUnique({ where: { sku } });
        const created = exist ?? (await tx.productVariant.create({
          data: {
            productId: pvc.id,
            nombre: "PVC",
            sku,
            variantAttributes: { create: [{ attributeId: colorAttr.id, valueId: av.id }] },
          },
        }));
        variantId = created.id;
        log(`variante PVC creada: ${valor} -> ${sku}`);
      }
      await tx.productVariant.update({ where: { id: variantId }, data: { stockMin: min, stockMax: max } });
      log(`PVC ${valor}: ${min}/${max}`);
    }

    // ------------------------------------------------- Cepillo Pino -> forma
    const forma = await ensureAttr(tx, "Forma de cepillo nylon");
    const vPino = await ensureValue(tx, forma.id, "Pino");
    const vMini = await ensureValue(tx, forma.id, "Pino mini");
    const vDelg = await ensureValue(tx, forma.id, "Pino delgado");

    const cni = await tx.product.findFirst({ where: { nombre: "Cepillo Nylon" } });
    if (!cni) { warn("Cepillo Nylon no existe"); }
    else {
      await ensureLine(tx, cni.id, forma.id, 90);
      const assign: [string, number][] = [
        ["CNI-0013", vPino.id], ["CNI-0014", vPino.id], ["CNI-0015", vPino.id],
        ["CNI-0017", vPino.id], ["CNI-0019", vPino.id], ["CNI-0020", vPino.id],
        ["CNI-0016", vMini.id], ["CNI-0018", vDelg.id],
      ];
      for (const [sku, valueId] of assign) {
        const v = await tx.productVariant.findUnique({ where: { sku } });
        if (!v) { warn(`forma: sku ${sku} no existe`); continue; }
        const existing = await tx.variantAttribute.findUnique({ where: { variantId_attributeId: { variantId: v.id, attributeId: forma.id } } });
        if (existing) await tx.variantAttribute.update({ where: { id: existing.id }, data: { valueId } });
        else await tx.variantAttribute.create({ data: { variantId: v.id, attributeId: forma.id, valueId } });
        const val = await tx.attributeValue.findUnique({ where: { id: valueId } });
        log(`forma: ${sku} -> ${val?.valor}`);
      }
    }

    if (!APPLY) throw new Rollback();
  }, { timeout: 120000, maxWait: 15000 }).catch((e) => { if (!(e instanceof Rollback)) throw e; });

  for (const l of logs) console.log(l);
  if (warns.length) { console.log(`\nAVISOS (${warns.length}):`); for (const w of warns) console.log(`  - ${w}`); }
  console.log(APPLY ? "\nAplicado." : "\n(dry-run) Rollback. Usa --apply para aplicar.");
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
