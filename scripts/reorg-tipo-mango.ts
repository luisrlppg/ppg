/**
 * One-off: elimina el atributo `Tipo de Mango` y sincroniza `Pincel` con `Mango`.
 *
 * A) `Tipo de Mango` (Normal/Pelikan) se elimina:
 *    - `Pelikan` es un tipo de ceja → se agrega a `Ceja` y se asigna a VAST-0015 / PIN-0015.
 *    - `Normal`/`Plano` se traducen a `Agujero de Mango` Normal/Plano antes de borrar.
 *    - Se quitan los ejes de Mango y Pincel y se borra el atributo.
 *
 * B) Pincel (= Mango + cerda) hereda `Ceja` y `Agujero de Mango` del Mango equivalente
 *    (misma `Tamaño rosca` + `Altura de Mango`). Si el Mango tiene dos agujeros para la
 *    misma medida (13/35), se crea la variante de Pincel faltante.
 *
 * Uso:
 *   pnpm exec dotenv -e .env -- pnpm --filter @ppg/db exec tsx ../../scripts/reorg-tipo-mango.ts [--dry]
 *   `--apply` escribe; sin él, sólo reporta. Idempotente.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const APPLY = process.argv.includes("--apply");
class Rollback extends Error {}

const MANGO_SKU = "VAST";
const PINCEL_SKU = "PIN";
const ATTR_TIPO = "Tipo de Mango";
const ATTR_CEJA = "Ceja";
const ATTR_AGUJERO = "Agujero de Mango";
const ATTR_ALTURA = "Altura de Mango";
const ATTR_ROSCA = "Tamaño rosca";

function slug(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

interface Cargada {
  id: number;
  sku: string;
  attrs: Map<number, number>;
}

async function main() {
  const mango = await prisma.product.findFirst({ where: { skuBase: MANGO_SKU } });
  const pincel = await prisma.product.findFirst({ where: { skuBase: PINCEL_SKU } });
  if (!mango) throw new Error(`No existe el producto "${MANGO_SKU}"`);
  if (!pincel) throw new Error(`No existe el producto "${PINCEL_SKU}"`);

  const attrRows = await prisma.attribute.findMany({
    where: { nombre: { in: [ATTR_TIPO, ATTR_CEJA, ATTR_AGUJERO, ATTR_ALTURA, ATTR_ROSCA] } },
  });
  const byName = (n: string) => attrRows.find((a) => a.nombre === n);
  const aCeja = byName(ATTR_CEJA);
  const aAgujero = byName(ATTR_AGUJERO);
  const aAltura = byName(ATTR_ALTURA);
  const aRosca = byName(ATTR_ROSCA);
  if (!aCeja || !aAgujero || !aAltura || !aRosca) throw new Error("Faltan atributos base (Ceja/Agujero/Altura/Tamaño rosca)");

  const logs: string[] = [];
  const warns: string[] = [];

  await prisma.$transaction(async (tx) => {
    const load = async (productId: number): Promise<Cargada[]> => {
      const vs = await tx.productVariant.findMany({ where: { productId }, include: { variantAttributes: true } });
      return vs.map((v) => ({ id: v.id, sku: v.sku, attrs: new Map(v.variantAttributes.map((va) => [va.attributeId, va.valueId])) }));
    };
    const valores = async (attributeId: number) =>
      new Map((await tx.attributeValue.findMany({ where: { attributeId } })).map((v) => [v.valor, v.id]));
    const nombreValor = new Map((await tx.attributeValue.findMany()).map((v) => [v.id, v.valor] as const));
    const setAttr = (variantId: number, attributeId: number, valueId: number) =>
      tx.variantAttribute.upsert({
        where: { variantId_attributeId: { variantId, attributeId } },
        update: { valueId },
        create: { variantId, attributeId, valueId },
      });

    // ---- A1: valor Pelikan en Ceja
    let cejaPelikan = await tx.attributeValue.findFirst({ where: { attributeId: aCeja.id, valor: "Pelikan" } });
    if (!cejaPelikan) {
      cejaPelikan = await tx.attributeValue.create({ data: { attributeId: aCeja.id, valor: "Pelikan" } });
      logs.push(`Ceja: valor "Pelikan" creado`);
    }
    const cejaVals = await valores(aCeja.id);
    const agujeroVals = await valores(aAgujero.id);

    const tipo = byName(ATTR_TIPO);
    if (tipo) {
      const tipoRows = await tx.attributeValue.findMany({ where: { attributeId: tipo.id } });
      const tipoName = (id?: number) => tipoRows.find((r) => r.id === id)?.valor;
      const ve = [...(await load(mango.id)), ...(await load(pincel.id))];

      // ---- A2/A3: migrar valores de Tipo
      for (const v of ve) {
        const name = tipoName(v.attrs.get(tipo.id));
        if (name === "Pelikan") {
          if (v.attrs.get(aCeja.id) !== cejaPelikan.id) {
            await setAttr(v.id, aCeja.id, cejaPelikan.id);
            v.attrs.set(aCeja.id, cejaPelikan.id);
            logs.push(`${v.sku}: Ceja=Pelikan`);
          }
        } else if ((name === "Normal" || name === "Plano") && !v.attrs.has(aAgujero.id)) {
          const aid = agujeroVals.get(name);
          if (aid) {
            await setAttr(v.id, aAgujero.id, aid);
            v.attrs.set(aAgujero.id, aid);
            logs.push(`${v.sku}: Agujero de Mango=${name}`);
          }
        }
      }
    }

    // ---- B: sincronizar Pincel desde Mango
    const key = (v: Cargada) => `${v.attrs.get(aRosca.id) ?? "?"}|${v.attrs.get(aAltura.id) ?? "?"}`;
    const mangoVars = await load(mango.id);
    const grupos = new Map<string, { ceja: Set<number>; agujero: Set<number> }>();
    for (const v of mangoVars) {
      if (!v.attrs.has(aRosca.id) || !v.attrs.has(aAltura.id)) continue;
      const k = key(v);
      const g = grupos.get(k) ?? { ceja: new Set<number>(), agujero: new Set<number>() };
      const c = v.attrs.get(aCeja.id);
      const a = v.attrs.get(aAgujero.id);
      if (c) g.ceja.add(c);
      if (a) g.agujero.add(a);
      grupos.set(k, g);
    }

    const pincelVars = await load(pincel.id);
    // B.1 Ceja
    for (const v of pincelVars) {
      if (v.attrs.has(aCeja.id)) continue;
      const g = grupos.get(key(v));
      if (g && g.ceja.size === 1) {
        const cid = [...g.ceja][0];
        await setAttr(v.id, aCeja.id, cid);
        v.attrs.set(aCeja.id, cid);
        logs.push(`${v.sku}: Ceja=${nombreValor.get(cid)}`);
      } else {
        warns.push(`${v.sku}: Ceja pendiente (sin Mango equivalente)`);
      }
    }

    // B.2 Agujero
    const faltanAgujero = pincelVars.filter((v) => !v.attrs.has(aAgujero.id));
    for (const v of faltanAgujero) {
      const k = key(v);
      const g = grupos.get(k);
      if (!g || g.agujero.size === 0) { warns.push(`${v.sku}: Agujero pendiente (sin Mango equivalente)`); continue; }
      if (g.agujero.size === 1) {
        const aid = [...g.agujero][0];
        await setAttr(v.id, aAgujero.id, aid);
        logs.push(`${v.sku}: Agujero de Mango=${nombreValor.get(aid)}`);
        continue;
      }
      // Ambiguo: sólo resolvemos si hay una sola variante de Pincel en esa medida.
      const sameCombo = faltanAgujero.filter((x) => key(x) === k);
      if (sameCombo.length !== 1) {
        warns.push(`${v.sku}: Agujero ambiguo (${g.agujero.size} opciones); pendiente`);
        continue;
      }
      const normalId = agujeroVals.get("Normal");
      const elegido = normalId !== undefined && g.agujero.has(normalId) ? normalId : [...g.agujero][0];
      await setAttr(v.id, aAgujero.id, elegido);
      logs.push(`${v.sku}: Agujero de Mango=${nombreValor.get(elegido)}`);
      // Crear la(s) variante(s) de Pincel faltante(s)
      for (const aid of g.agujero) {
        if (aid === elegido) continue;
        const rosca = v.attrs.get(aRosca.id);
        const altura = v.attrs.get(aAltura.id);
        const skuNueva = `PIN-${slug(nombreValor.get(rosca!) ?? "")}-${slug(nombreValor.get(altura!) ?? "")}-${slug(nombreValor.get(aid) ?? "")}`;
        const existe = await tx.productVariant.findUnique({ where: { sku: skuNueva } });
        if (existe) { logs.push(`${skuNueva}: ya existe`); continue; }
        const nueva = await tx.productVariant.create({ data: { productId: pincel.id, nombre: pincel.nombre, sku: skuNueva } });
        const ceja = v.attrs.get(aCeja.id);
        const pares: [number, number][] = [];
        if (rosca) pares.push([aRosca.id, rosca]);
        if (altura) pares.push([aAltura.id, altura]);
        if (ceja) pares.push([aCeja.id, ceja]);
        pares.push([aAgujero.id, aid]);
        for (const [attributeId, valueId] of pares) {
          await tx.variantAttribute.create({ data: { variantId: nueva.id, attributeId, valueId } });
        }
        logs.push(`${skuNueva}: variante creada (Agujero de Mango=${nombreValor.get(aid)})`);
      }
    }

    // ---- A4: eliminar Tipo de Mango
    if (tipo) {
      const passos = await tx.productPasso.count({ where: { attributeId: tipo.id } });
      if (passos > 0) throw new Error(`Abortado: "${ATTR_TIPO}" está referenciado en ${passos} ProductPasso`);
      const va = await tx.variantAttribute.deleteMany({ where: { attributeId: tipo.id } });
      const pal = await tx.productAttributeLine.deleteMany({ where: { attributeId: tipo.id } });
      const pav = await tx.productAttributeValue.deleteMany({ where: { attributeId: tipo.id } });
      const av = await tx.attributeValue.deleteMany({ where: { attributeId: tipo.id } });
      await tx.attribute.delete({ where: { id: tipo.id } });
      logs.push(`${ATTR_TIPO}: eliminado (${va.count} variantes, ${pal.count} ejes, ${pav.count} permitidos, ${av.count} valores)`);
    } else {
      logs.push(`${ATTR_TIPO}: ya no existe`);
    }

    if (!APPLY) throw new Rollback();
  }, { timeout: 120000, maxWait: 20000 }).catch((e) => { if (!(e instanceof Rollback)) throw e; });

  for (const l of logs) console.log(l);
  if (warns.length) { console.log(`\nPENDIENTES (${warns.length}):`); for (const w of warns) console.log(`  - ${w}`); }
  console.log(APPLY ? "\nAplicado." : "\n(dry-run) Rollback. Usa --apply para aplicar.");
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
