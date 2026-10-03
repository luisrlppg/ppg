/**
 * Reorg de atributos/valores en uso a partir de `atributos-mapping.csv`.
 *
 * Operaciones:
 *   split  -> mueve valores de un atributo origen hacia un atributo destino por producto,
 *             re-apuntando VariantAttribute, ProductAttributeLine, ProductAttributeValue y ProductPasso.
 *   rename -> renombra un atributo (las referencias quedan intactas).
 *
 * Al final mueve líneas/pasos huérfanos, borra valores sin uso y elimina el atributo
 * origen si queda totalmente vacío. Idempotente. Dry-run por defecto.
 *
 * Uso:
 *   pnpm exec dotenv -e .env -- pnpm --filter @ppg/db exec tsx ../../scripts/reorg-atributos.ts
 *   ... -- --apply
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient, Prisma } from "@prisma/client";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const prisma = new PrismaClient();
const APPLY = process.argv.includes("--apply");

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], field = "", inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') inQ = false;
      else field += c;
    } else if (c === '"') inQ = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else if (c !== "\r") field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows;
}

type Mapping = {
  op: "split" | "rename";
  origen: string;
  productos: string[];
  destino: string;
  valores: string[];
  borrarLinea: boolean;
};

function loadMapping(): Mapping[] {
  const rows = parseCsv(readFileSync(join(ROOT, "scripts", "atributos-mapping.csv"), "utf8").replace(/^\uFEFF/, ""));
  const H = rows[0];
  const iOp = H.indexOf("op"), iOr = H.indexOf("atributoOrigen"), iPr = H.indexOf("producto");
  const iDe = H.indexOf("atributoDestino"), iVa = H.indexOf("valores"), iBo = H.indexOf("borrarOrigenLinea");
  return rows.slice(1).filter((r) => (r[iOp] ?? "").trim()).map((r) => ({
    op: (r[iOp] ?? "").trim() as Mapping["op"],
    origen: (r[iOr] ?? "").trim(),
    productos: (r[iPr] ?? "").split(";").map((s) => s.trim()).filter(Boolean),
    destino: (r[iDe] ?? "").trim(),
    valores: (r[iVa] ?? "").split("|").map((s) => s.trim()).filter(Boolean),
    borrarLinea: (r[iBo] ?? "").trim() === "si",
  }));
}

const logs: string[] = [];
const warns: string[] = [];
const log = (s: string) => logs.push(s);
const warn = (s: string) => warns.push(s);

class Rollback extends Error {}

async function ensureAttribute(tx: Prisma.TransactionClient, nombre: string) {
  const found = await tx.attribute.findUnique({ where: { nombre } });
  if (found) return found;
  return tx.attribute.create({ data: { nombre } });
}
async function ensureValue(tx: Prisma.TransactionClient, attributeId: number, valor: string) {
  return tx.attributeValue.upsert({
    where: { attributeId_valor: { attributeId, valor } },
    update: {},
    create: { attributeId, valor },
  });
}

async function applyRename(tx: Prisma.TransactionClient, m: Mapping) {
  const origin = await tx.attribute.findUnique({ where: { nombre: m.origen } });
  if (!origin) {
    const target = await tx.attribute.findUnique({ where: { nombre: m.destino } });
    if (target) { log(`rename ya aplicado: ${m.origen} -> ${m.destino}`); return; }
    warn(`rename: no existe "${m.origen}"`);
    return;
  }
  const conflict = await tx.attribute.findUnique({ where: { nombre: m.destino } });
  if (conflict && conflict.id !== origin.id) {
    warn(`rename: "${m.destino}" ya existe; no se renombró "${m.origen}"`);
    return;
  }
  await tx.attribute.update({ where: { id: origin.id }, data: { nombre: m.destino } });
  log(`rename: ${m.origen} -> ${m.destino}`);
}

async function applySplit(tx: Prisma.TransactionClient, m: Mapping) {
  const target = await ensureAttribute(tx, m.destino);
  const origin = await tx.attribute.findUnique({ where: { nombre: m.origen } });
  if (!origin) { log(`split ya aplicado: ${m.origen} (destino ${m.destino})`); return; }

  const tvByValor = new Map<string, number>();
  for (const valor of m.valores) tvByValor.set(valor, (await ensureValue(tx, target.id, valor)).id);

  const originValues = await tx.attributeValue.findMany({ where: { attributeId: origin.id, valor: { in: m.valores } } });
  const originValueIdToValor = new Map(originValues.map((v) => [v.id, v.valor]));

  let movedVa = 0, movedLines = 0, movedPav = 0;
  for (const prodName of m.productos) {
    const p = await tx.product.findFirst({ where: { nombre: prodName } });
    if (!p) { warn(`split ${m.destino}: producto "${prodName}" no existe`); continue; }

    const vas = await tx.variantAttribute.findMany({ where: { attributeId: origin.id, variant: { productId: p.id } }, include: { value: true } });
    for (const va of vas) {
      const tvId = tvByValor.get(va.value.valor);
      if (tvId === undefined) { warn(`split ${m.destino}: valor "${va.value.valor}" no está en el mapping`); continue; }
      const existing = await tx.variantAttribute.findUnique({ where: { variantId_attributeId: { variantId: va.variantId, attributeId: target.id } } });
      if (existing) {
        await tx.variantAttribute.delete({ where: { id: va.id } });
        await tx.variantAttribute.update({ where: { id: existing.id }, data: { valueId: tvId } });
      } else {
        await tx.variantAttribute.update({ where: { id: va.id }, data: { attributeId: target.id, valueId: tvId } });
      }
      movedVa++;
    }

    const originLine = await tx.productAttributeLine.findUnique({ where: { productId_attributeId: { productId: p.id, attributeId: origin.id } } });
    const targetLine = await tx.productAttributeLine.findUnique({ where: { productId_attributeId: { productId: p.id, attributeId: target.id } } });
    if (!targetLine) await tx.productAttributeLine.create({ data: { productId: p.id, attributeId: target.id, sortOrder: originLine?.sortOrder ?? 0 } });
    if (m.borrarLinea && originLine) await tx.productAttributeLine.delete({ where: { id: originLine.id } });
    if (!targetLine) movedLines++;

    const pavs = await tx.productAttributeValue.findMany({ where: { productId: p.id, attributeId: origin.id, valueId: { in: [...originValueIdToValor.keys()] } } });
    for (const pav of pavs) {
      const tvId = tvByValor.get(originValueIdToValor.get(pav.valueId) ?? "");
      if (tvId === undefined) continue;
      const dup = await tx.productAttributeValue.findUnique({ where: { productId_attributeId_valueId: { productId: p.id, attributeId: target.id, valueId: tvId } } });
      if (dup) await tx.productAttributeValue.delete({ where: { id: pav.id } });
      else await tx.productAttributeValue.update({ where: { id: pav.id }, data: { attributeId: target.id, valueId: tvId } });
      movedPav++;
    }
  }
  log(`split: ${m.origen} -> ${m.destino} (${movedVa} variantes, ${movedLines} ejes, ${movedPav} permitidos; productos: ${m.productos.join(", ")})`);
}

async function resolveLineTarget(
  tx: Prisma.TransactionClient,
  originAttrId: number,
  originName: string,
  productId: number,
  splitMap: Map<string, string>,
): Promise<string | null> {
  const passo = await tx.productPasso.findFirst({ where: { productId, attributeId: originAttrId } });
  if (passo?.variantProductId) {
    const vp = await tx.product.findUnique({ where: { id: passo.variantProductId } });
    if (vp) {
      const t = splitMap.get(`${originName}||${vp.nombre}`);
      if (t) return t;
    }
  }
  const comps = await tx.productComponent.findMany({ where: { productId } });
  for (const c of comps) {
    const lines = await tx.productAttributeLine.findMany({ where: { productId: c.componentId }, include: { attribute: true } });
    const hit = lines.find((l) => l.attribute.nombre.startsWith(`${originName} de `));
    if (hit) return hit.attribute.nombre;
  }
  return null;
}

async function main() {
  const mapping = loadMapping();
  const splits = mapping.filter((m) => m.op === "split");
  const renames = mapping.filter((m) => m.op === "rename");

  const splitMap = new Map<string, string>();
  for (const m of splits) for (const prod of m.productos) splitMap.set(`${m.origen}||${prod}`, m.destino);
  const touchedOrigins = [...new Set(splits.map((m) => m.origen))];

  await prisma.$transaction(async (tx) => {
    for (const m of renames) await applyRename(tx, m);
    for (const m of splits) await applySplit(tx, m);

    // Mover líneas huérfanas que aún apuntan al origen
    for (const originName of touchedOrigins) {
      const origin = await tx.attribute.findUnique({ where: { nombre: originName } });
      if (!origin) continue;
      const lines = await tx.productAttributeLine.findMany({ where: { attributeId: origin.id }, include: { product: true } });
      for (const line of lines) {
        const targetName = await resolveLineTarget(tx, origin.id, originName, line.productId, splitMap);
        if (targetName) {
          const t = await tx.attribute.findUnique({ where: { nombre: targetName } });
          if (!t) { warn(`línea ${originName}/${line.product.nombre}: destino "${targetName}" no existe`); continue; }
          const dup = await tx.productAttributeLine.findUnique({ where: { productId_attributeId: { productId: line.productId, attributeId: t.id } } });
          if (dup) await tx.productAttributeLine.delete({ where: { id: line.id } });
          else await tx.productAttributeLine.update({ where: { id: line.id }, data: { attributeId: t.id } });
          log(`eje movido: ${line.product.nombre}: ${originName} -> ${t.nombre}`);
        } else {
          const used = await tx.variantAttribute.count({ where: { attributeId: origin.id, variant: { productId: line.productId } } });
          if (used === 0) { await tx.productAttributeLine.delete({ where: { id: line.id } }); log(`eje sin uso eliminado: ${line.product.nombre} / ${originName}`); }
          else warn(`no se pudo mover eje de ${originName} en "${line.product.nombre}" (${used} variantes)`);
        }
      }
    }

    // Re-apuntar pasos (storefront) que referencian el origen
    for (const originName of touchedOrigins) {
      const origin = await tx.attribute.findUnique({ where: { nombre: originName } });
      if (!origin) continue;
      const passos = await tx.productPasso.findMany({ where: { attributeId: origin.id } });
      for (const passo of passos) {
        const vp = passo.variantProductId ? await tx.product.findUnique({ where: { id: passo.variantProductId } }) : null;
        const targetName = vp ? splitMap.get(`${originName}||${vp.nombre}`) : undefined;
        if (!targetName) { warn(`paso ${originName} sin destino (producto ${passo.productId}, variante ${passo.variantProductId})`); continue; }
        const t = await tx.attribute.findUnique({ where: { nombre: targetName } });
        if (!t) { warn(`paso ${originName}: destino "${targetName}" no existe`); continue; }
        await tx.productPasso.update({ where: { id: passo.id }, data: { attributeId: t.id } });
        log(`paso re-apuntado: ${originName} -> ${t.nombre}`);
      }
    }

    // Limpieza de valores y atributo origen
    for (const originName of touchedOrigins) {
      const origin = await tx.attribute.findUnique({ where: { nombre: originName } });
      if (!origin) continue;
      const vals = await tx.attributeValue.findMany({ where: { attributeId: origin.id } });
      for (const val of vals) {
        const va = await tx.variantAttribute.count({ where: { valueId: val.id } });
        const pav = await tx.productAttributeValue.count({ where: { valueId: val.id } });
        if (va === 0 && pav === 0) await tx.attributeValue.delete({ where: { id: val.id } });
      }
      const remaining = {
        va: await tx.variantAttribute.count({ where: { attributeId: origin.id } }),
        line: await tx.productAttributeLine.count({ where: { attributeId: origin.id } }),
        passo: await tx.productPasso.count({ where: { attributeId: origin.id } }),
        values: await tx.attributeValue.count({ where: { attributeId: origin.id } }),
        pav: await tx.productAttributeValue.count({ where: { attributeId: origin.id } }),
      };
      if (remaining.va + remaining.line + remaining.passo + remaining.values + remaining.pav === 0) {
        await tx.attribute.delete({ where: { id: origin.id } });
        log(`atributo origen eliminado: ${originName}`);
      } else {
        warn(`atributo "${originName}" conserva referencias: ${JSON.stringify(remaining)}`);
      }
    }

    if (!APPLY) throw new Rollback();
  }, { timeout: 120000, maxWait: 15000 }).catch((e) => {
    if (!(e instanceof Rollback)) throw e;
  });

  for (const l of logs) console.log(l);
  if (warns.length) {
    console.log(`\nAVISOS (${warns.length}):`);
    for (const w of warns) console.log(`  - ${w}`);
  }
  console.log(APPLY ? "\nAplicado." : "\n(dry-run) Rollback. Usa --apply para aplicar.");
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
