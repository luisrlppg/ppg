/**
 * Consolidación de atributos/valores (one-off, idempotente, dry-run por defecto).
 *
 * Realiza: splits por producto, merges de atributos, repunts de ejes/pasos,
 * renombres, eliminación de ejes/atributos muertos y normalización de valores
 * (primera letra mayúscula + fusión de colisiones dentro del mismo atributo).
 *
 * Uso:
 *   pnpm exec dotenv -e .env -- pnpm --filter @ppg/db exec tsx ../../scripts/consolidar-atributos.ts
 *   ... -- --apply
 */
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient, Prisma } from "@prisma/client";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const prisma = new PrismaClient();
const APPLY = process.argv.includes("--apply");

function norm(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim().toLowerCase();
}
function cap(s: string): string {
  const t = s.trim();
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : t;
}

const logs: string[] = [];
const warns: string[] = [];
const log = (s: string) => logs.push(s);
const warn = (s: string) => warns.push(s);
class Rollback extends Error {}

type Tx = Prisma.TransactionClient;
async function attrBy(tx: Tx, nombre: string) {
  return tx.attribute.findUnique({ where: { nombre } });
}
async function ensureAttr(tx: Tx, nombre: string) {
  return (await attrBy(tx, nombre)) ?? (await tx.attribute.create({ data: { nombre } }));
}
async function ensureValueByNorm(tx: Tx, attributeId: number, valor: string) {
  const vals = await tx.attributeValue.findMany({ where: { attributeId } });
  const found = vals.find((v) => norm(v.valor) === norm(valor));
  if (found) return found;
  return tx.attributeValue.create({ data: { attributeId, valor: cap(valor) } });
}

/** Mueve los VariantAttribute de un producto desde `originAttr` a `targetAttr`. */
async function moveVariants(tx: Tx, originAttrId: number, productId: number, targetAttrId: number) {
  const vas = await tx.variantAttribute.findMany({
    where: { attributeId: originAttrId, variant: { productId } },
    include: { value: true },
  });
  let n = 0;
  for (const va of vas) {
    const tv = await ensureValueByNorm(tx, targetAttrId, va.value.valor);
    const existing = await tx.variantAttribute.findUnique({
      where: { variantId_attributeId: { variantId: va.variantId, attributeId: targetAttrId } },
    });
    if (existing) {
      await tx.variantAttribute.delete({ where: { id: va.id } });
      await tx.variantAttribute.update({ where: { id: existing.id }, data: { valueId: tv.id } });
    } else {
      await tx.variantAttribute.update({ where: { id: va.id }, data: { attributeId: targetAttrId, valueId: tv.id } });
    }
    n++;
  }
  return n;
}

/** Mueve el eje (ProductAttributeLine) y permitidos de un producto. */
async function moveLine(tx: Tx, originAttrId: number, productId: number, targetAttrId: number) {
  const originLine = await tx.productAttributeLine.findUnique({
    where: { productId_attributeId: { productId, attributeId: originAttrId } },
  });
  if (!originLine) return false;
  const targetLine = await tx.productAttributeLine.findUnique({
    where: { productId_attributeId: { productId, attributeId: targetAttrId } },
  });
  if (targetLine) await tx.productAttributeLine.delete({ where: { id: originLine.id } });
  else await tx.productAttributeLine.update({ where: { id: originLine.id }, data: { attributeId: targetAttrId } });

  const pavs = await tx.productAttributeValue.findMany({ where: { productId, attributeId: originAttrId } });
  for (const pav of pavs) {
    const val = await tx.attributeValue.findUnique({ where: { id: pav.valueId } });
    if (!val) continue;
    const tv = await ensureValueByNorm(tx, targetAttrId, val.valor);
    const dup = await tx.productAttributeValue.findFirst({
      where: { productId, attributeId: targetAttrId, valueId: tv.id },
    });
    if (dup) await tx.productAttributeValue.delete({ where: { id: pav.id } });
    else await tx.productAttributeValue.update({ where: { id: pav.id }, data: { attributeId: targetAttrId, valueId: tv.id } });
  }
  return true;
}

/** Split de un atributo origen hacia un destino para un producto (variantes + eje). */
async function splitForProduct(tx: Tx, originName: string, productName: string, targetName: string, explicit?: string[]) {
  const origin = await attrBy(tx, originName);
  const target = await ensureAttr(tx, targetName);
  const product = await tx.product.findFirst({ where: { nombre: productName } });
  if (!product) { warn(`split ${originName}->${targetName}: producto "${productName}" no existe`); return; }

  if (explicit) for (const v of explicit) await ensureValueByNorm(tx, target.id, v);

  let movedVa = 0, movedLine = false;
  if (origin) {
    movedVa = await moveVariants(tx, origin.id, product.id, target.id);
    movedLine = await moveLine(tx, origin.id, product.id, target.id);
    if (!movedLine) {
      // Asegura el eje en el producto destino (p. ej. Vastago/Agujero).
      const exists = await tx.productAttributeLine.findUnique({
        where: { productId_attributeId: { productId: product.id, attributeId: target.id } },
      });
      if (!exists) await tx.productAttributeLine.create({ data: { productId: product.id, attributeId: target.id, sortOrder: 0 } });
    }
  } else {
    const exists = await tx.productAttributeLine.findUnique({
      where: { productId_attributeId: { productId: product.id, attributeId: target.id } },
    });
    if (!exists) await tx.productAttributeLine.create({ data: { productId: product.id, attributeId: target.id, sortOrder: 0 } });
  }
  log(`split: ${originName} -> ${targetName} (${productName}) [${movedVa} variantes]`);
}

/** Repunta los pasos (ProductPasso) por producto-variante. */
async function movePassosByVarprod(tx: Tx, originName: string, varprodName: string, targetName: string) {
  const origin = await attrBy(tx, originName);
  if (!origin) { log(`repoint paso ya aplicado: ${originName}`); return; }
  const target = await attrBy(tx, targetName) ?? await ensureAttr(tx, targetName);
  const vp = await tx.product.findFirst({ where: { nombre: varprodName } });
  if (!vp) { warn(`repoint paso: no existe varprod "${varprodName}"`); return; }
  const r = await tx.productPasso.updateMany({ where: { attributeId: origin.id, variantProductId: vp.id }, data: { attributeId: target.id } });
  log(`repoint paso: ${originName} -> ${targetName} (${varprodName}) [${r.count}]`);
}

/** Merge completo: mueve todas las referencias de origen a destino. */
async function mergeAttrs(tx: Tx, originName: string, targetName: string) {
  const origin = await attrBy(tx, originName);
  if (!origin) { log(`merge ya aplicado: ${originName}`); return; }
  const target = await ensureAttr(tx, targetName);

  // Variantes
  const vas = await tx.variantAttribute.findMany({ where: { attributeId: origin.id }, include: { value: true } });
  let n = 0;
  for (const va of vas) {
    const tv = await ensureValueByNorm(tx, target.id, va.value.valor);
    const existing = await tx.variantAttribute.findUnique({
      where: { variantId_attributeId: { variantId: va.variantId, attributeId: target.id } },
    });
    if (existing) {
      await tx.variantAttribute.delete({ where: { id: va.id } });
      await tx.variantAttribute.update({ where: { id: existing.id }, data: { valueId: tv.id } });
    } else {
      await tx.variantAttribute.update({ where: { id: va.id }, data: { attributeId: target.id, valueId: tv.id } });
    }
    n++;
  }
  // Ejes
  const lines = await tx.productAttributeLine.findMany({ where: { attributeId: origin.id } });
  for (const l of lines) {
    const dup = await tx.productAttributeLine.findUnique({ where: { productId_attributeId: { productId: l.productId, attributeId: target.id } } });
    if (dup) await tx.productAttributeLine.delete({ where: { id: l.id } });
    else await tx.productAttributeLine.update({ where: { id: l.id }, data: { attributeId: target.id } });
  }
  // Permitidos
  const pavs = await tx.productAttributeValue.findMany({ where: { attributeId: origin.id } });
  for (const p of pavs) {
    const val = await tx.attributeValue.findUnique({ where: { id: p.valueId } });
    if (!val) continue;
    const tv = await ensureValueByNorm(tx, target.id, val.valor);
    const dup = await tx.productAttributeValue.findFirst({ where: { productId: p.productId, attributeId: target.id, valueId: tv.id } });
    if (dup) await tx.productAttributeValue.delete({ where: { id: p.id } });
    else await tx.productAttributeValue.update({ where: { id: p.id }, data: { attributeId: target.id, valueId: tv.id } });
  }
  // Pasos
  await tx.productPasso.updateMany({ where: { attributeId: origin.id }, data: { attributeId: target.id } });
  log(`merge: ${originName} -> ${targetName} [${n} variantes]`);
}

async function removeAxis(tx: Tx, productName: string, attrName: string) {
  const product = await tx.product.findFirst({ where: { nombre: productName } });
  const attr = await attrBy(tx, attrName);
  if (!product || !attr) return;
  const r = await tx.variantAttribute.deleteMany({ where: { attributeId: attr.id, variant: { productId: product.id } } });
  await tx.productAttributeLine.deleteMany({ where: { productId: product.id, attributeId: attr.id } });
  await tx.productAttributeValue.deleteMany({ where: { productId: product.id, attributeId: attr.id } });
  log(`eje eliminado: ${attrName} de ${productName} [${r.count}]`);
}

async function renameAttr(tx: Tx, oldName: string, newName: string) {
  const a = await attrBy(tx, oldName);
  if (!a) { log(`rename ya aplicado: ${oldName}`); return; }
  if (a.nombre === newName) return;
  const conflict = await attrBy(tx, newName);
  if (conflict) { warn(`rename: "${newName}" ya existe; no se renombró "${oldName}"`); return; }
  await tx.attribute.update({ where: { id: a.id }, data: { nombre: newName } });
  log(`rename: ${oldName} -> ${newName}`);
}

async function addValue(tx: Tx, attrName: string, valor: string) {
  const a = await attrBy(tx, attrName);
  if (!a) { warn(`addValue: no existe "${attrName}"`); return; }
  const before = await tx.attributeValue.findMany({ where: { attributeId: a.id } });
  if (before.some((v) => norm(v.valor) === norm(valor))) return;
  await tx.attributeValue.create({ data: { attributeId: a.id, valor: cap(valor) } });
  log(`valor agregado: ${attrName} += ${cap(valor)}`);
}

async function mergeValue(tx: Tx, attrName: string, fromVal: string, toVal: string) {
  const a = await attrBy(tx, attrName);
  if (!a) return;
  const vals = await tx.attributeValue.findMany({ where: { attributeId: a.id } });
  const from = vals.find((v) => norm(v.valor) === norm(fromVal));
  if (!from) return;
  const to = vals.find((v) => norm(v.valor) === norm(toVal));
  if (!to) {
    await tx.attributeValue.update({ where: { id: from.id }, data: { valor: cap(toVal) } });
  } else {
    await tx.variantAttribute.updateMany({ where: { valueId: from.id }, data: { valueId: to.id } });
    await tx.productAttributeValue.updateMany({ where: { valueId: from.id }, data: { valueId: to.id } });
    await tx.attributeValue.delete({ where: { id: from.id } });
  }
  log(`valor fusionado: ${attrName}: ${fromVal} -> ${toVal}`);
}

async function deleteAttr(tx: Tx, name: string) {
  const a = await attrBy(tx, name);
  if (!a) return;
  const cnt = await tx.variantAttribute.count({ where: { attributeId: a.id } });
  if (cnt > 0) { warn(`delete: "${name}" aún tiene ${cnt} variantes; no se borra`); return; }
  await tx.attributeValue.deleteMany({ where: { attributeId: a.id } });
  await tx.productAttributeLine.deleteMany({ where: { attributeId: a.id } });
  await tx.productPasso.updateMany({ where: { attributeId: a.id }, data: { attributeId: null } });
  await tx.attribute.delete({ where: { id: a.id } });
  log(`atributo eliminado: ${name}`);
}

/** Limpia valores huérfanos y elimina el atributo si no tiene referencias. */
async function cleanupAttr(tx: Tx, name: string) {
  const a = await attrBy(tx, name);
  if (!a) return;
  const vals = await tx.attributeValue.findMany({ where: { attributeId: a.id } });
  for (const v of vals) {
    const va = await tx.variantAttribute.count({ where: { valueId: v.id } });
    const pav = await tx.productAttributeValue.count({ where: { valueId: v.id } });
    if (va === 0 && pav === 0) await tx.attributeValue.delete({ where: { id: v.id } });
  }
  const rest = {
    va: await tx.variantAttribute.count({ where: { attributeId: a.id } }),
    line: await tx.productAttributeLine.count({ where: { attributeId: a.id } }),
    passo: await tx.productPasso.count({ where: { attributeId: a.id } }),
    values: await tx.attributeValue.count({ where: { attributeId: a.id } }),
    pav: await tx.productAttributeValue.count({ where: { attributeId: a.id } }),
  };
  if (rest.va + rest.line + rest.passo + rest.values + rest.pav === 0) {
    await tx.attribute.delete({ where: { id: a.id } });
    log(`atributo origen eliminado: ${name}`);
  } else {
    warn(`"${name}" conserva referencias: ${JSON.stringify(rest)}`);
  }
}

/** Normaliza a primera mayúscula y fusiona colisiones dentro de cada atributo. */
async function capitalizeAll(tx: Tx) {
  const attrs = await tx.attribute.findMany();
  let renamed = 0, merged = 0;
  for (const a of attrs) {
    const vals = await tx.attributeValue.findMany({ where: { attributeId: a.id }, orderBy: { id: "asc" } });
    const kept = new Map<string, number>();
    for (const v of vals) {
      const key = norm(cap(v.valor));
      if (kept.has(key)) {
        const keepId = kept.get(key)!;
        await tx.variantAttribute.updateMany({ where: { valueId: v.id }, data: { valueId: keepId } });
        await tx.productAttributeValue.updateMany({ where: { valueId: v.id }, data: { valueId: keepId } });
        await tx.attributeValue.delete({ where: { id: v.id } });
        merged++;
      } else {
        kept.set(key, v.id);
        const nuevo = cap(v.valor);
        if (nuevo !== v.valor) { await tx.attributeValue.update({ where: { id: v.id }, data: { valor: nuevo } }); renamed++; }
      }
    }
  }
  log(`capitalize: ${renamed} renombrados, ${merged} fusionados`);
}

async function main() {
  // --- SPLITS por producto (crean destino y mueven variantes/eje)
  const splits: [string, string, string, string[]?][] = [
    ["Altura", "Botella", "Altura de Botella"],
    ["Altura", "Escurridor", "Altura de Escurridor"],
    ["Altura", "Sobretapa", "Altura de Sobretapa"],
    ["Altura", "Tapa con Pincel", "Altura de Taparrosca"],
    ["Color de cerda", "Pincel", "Color de Cerda de Pincel"],
    ["Color de cerda", "Tapa con Pincel", "Color de Cerda de Pincel"],
    ["Color de cerda", "Cepillo Nylon", "Color de Cerda de Cepillo"],
    ["Color de cerda", "Cerda", "Color de Cerda de Cepillo"],
    ["Color de cerda", "Palillo", "Color de Cerda de Cepillo"],
    ["Color Cepillo", "Rimel Nylon", "Color de Cepillo Nylon"],
    ["Color Cepillo", "Rimel Silicon", "Color de Cepillo Silicon"],
    ["Tamaño", "Caja Cartón", "Tamaño de Caja de Cartón"],
    ["Agujero vastago", "Escurridor", "Agujero de Escurridor"],
    ["Agujero vastago", "Mango", "Agujero de Mango"],
    ["Agujero vastago", "Taparrosca con Pincel", "Agujero de Mango"],
    ["Agujero vastago", "Vastago", "Agujero de Vastago", ["Delineador", "Cepillo Nylon", "Lip Gloss", "Cepillo Silicon"]],
  ];

  const passos: [string, string, string][] = [
    ["Color Cepillo", "Cepillo Nylon", "Color de Cepillo Nylon"],
    ["Color Cepillo", "Cepillo Silicon", "Color de Cepillo Silicon"],
    ["Agujero vastago", "Mango", "Agujero de Mango"],
    ["Forma tapa", "Sobretapa", "Tipo de Sobretapa"],
    ["Forma de cepillo nylon", "Cepillo Silicon", "Forma de cepillo silicon"],
  ];

  const merges: [string, string][] = [
    ["Altura Mango2", "Altura Mango"],
    ["Altura vastago de Rimel Nylon", "Altura Vastago"],
    ["Altura vastago de Taparrosca con Pincel", "Altura Vastago"],
    ["Color de Cerda", "Color de Cerda de Cepillo"],
    ["Color Botella", "Color de Botella"],
    ["Color Vástago", "Color de Vastago"],
    ["Color Sobretapa", "Color de Sobretapa"],
    ["Color Escurridor", "Color de Escurridor"],
    ["Color tapa", "Color de Tapa con Pincel"],
    ["Tipo de Pincel", "Tipo de Mango"],
    ["Altura Taparrosca", "Altura de Taparrosca"],
  ];

  const renames: [string, string][] = [
    ["Forma tapa", "Forma de Taparrosca"],
    ["Tipo de Sobretapa", "Forma de Sobretapa"],
    ["Altura Mango", "Altura de Mango"],
    ["Altura Vastago", "Altura de Vastago"],
    ["Botella", "Capacidad de Botella"],
  ];

  await prisma.$transaction(async (tx) => {
    for (const [o, p, d, ex] of splits) await splitForProduct(tx, o, p, d, ex);
    for (const [o, vp, d] of passos) await movePassosByVarprod(tx, o, vp, d);
    for (const [o, d] of merges) await mergeAttrs(tx, o, d);

    await removeAxis(tx, "Cepillo Nylon", "Tamaño");

    for (const [o, d] of renames) await renameAttr(tx, o, d);
    await addValue(tx, "Forma de Sobretapa", "Yadis");
    await addValue(tx, "Agujero de Mango", "Normal");
    await addValue(tx, "Color de Cerda de Cepillo", "Rosa");
    await addValue(tx, "Color de Cerda de Cepillo", "Verde turquesa");
    await addValue(tx, "Color de Cerda de Cepillo", "Lila");
    await addValue(tx, "Color de Cepillo Silicon", "Blanco");
    await addValue(tx, "Color de Cepillo Silicon", "Negro");
    await addValue(tx, "Color de Cepillo Silicon", "Transparente");
    await mergeValue(tx, "Color de Cerda de Pincel", "Negra", "Negro");

    // Orígenes a limpiar: nombres originales que ya no deben existir
    const origins = [
      "Altura", "Color de cerda", "Color Cepillo", "Tamaño", "Agujero vastago",
      "Altura Mango2", "Altura vastago de Rimel Nylon", "Altura vastago de Taparrosca con Pincel",
      "Color de Cerda", "Color Botella", "Color Vástago", "Color Sobretapa", "Color Escurridor",
      "Color tapa", "Tipo de Pincel", "Altura Taparrosca",
    ];
    for (const o of origins) await cleanupAttr(tx, o);
    await deleteAttr(tx, "Tamaño de vástago");
    await deleteAttr(tx, "Diámetro");

    await capitalizeAll(tx);

    if (!APPLY) throw new Rollback();
  }, { timeout: 180000, maxWait: 20000 }).catch((e) => { if (!(e instanceof Rollback)) throw e; });

  for (const l of logs) console.log(l);
  if (warns.length) { console.log(`\nAVISOS (${warns.length}):`); for (const w of warns) console.log(`  - ${w}`); }
  console.log(APPLY ? "\nAplicado." : "\n(dry-run) Rollback. Usa --apply para aplicar.");
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
