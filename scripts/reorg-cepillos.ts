/**
 * Reorganización de Cepillos (Nylon y Silicon).
 *
 * Objetivo:
 *   - Cepillo Nylon se identifica por FORMA + GROSOR CERDA + COLOR.
 *     Se eliminan los ejes `Estado` y `Medidas`; sólo sobrevive stock "Nuevo".
 *   - Cepillo Silicon se identifica por FORMA (se elimina `Estado`).
 *   - Las medidas del "Cepillo Recto" se convierten en formas con nombre propio.
 *   - Se borran del catálogo los atributos `Medidas` y `Estado`.
 *
 * Uso:
 *   pnpm exec dotenv -e .env -- pnpm --filter @ppg/db exec tsx ../../scripts/reorg-cepillos.ts [--dry]
 *   `--apply` escribe; sin él, sólo reporta.
 */
import { PrismaClient, Prisma } from "@prisma/client";

const prisma = new PrismaClient();
const APPLY = process.argv.includes("--apply");

const FORMA_NYLON = "Forma de cepillo nylon";
const FORMA_SILICON = "Forma de cepillo silicon";
const COLOR = "Color de Cerda de Cepillo";
const GROSOR = "Grosor cerda";
const ESTADO = "Estado";
const MEDIDAS = "Medidas";

/** SKU → atributos destino de Cepillo Nylon (sin Estado ni Medidas). */
const NYLON: Record<string, { forma: string; grosor?: string; color?: string }> = {
  "CNI-0002": { forma: "Bala", grosor: '4"', color: "Negro" },
  "CNI-0003": { forma: "Bala", grosor: '5"', color: "Negro" },
  "CNI-0004": { forma: "Bala", grosor: '5"', color: "Transparente" },
  "CNI-0005": { forma: "Bala Prosa" },
  "CNI-0007": { forma: "Balita", color: "Negro" },
  "CNI-0008": { forma: "Balita", color: "Transparente" },
  "CNI-0009": { forma: "Balita Prosa" },
  "CNI-0010": { forma: "Cacahuate", grosor: '5"', color: "Negro" },
  "CNI-0011": { forma: "Cacahuate", grosor: '5.75"', color: "Negro" },
  "CNI-0012": { forma: "Citologico", grosor: '3"', color: "Transparente" },
  "CNI-0013": { forma: "Pino", grosor: '4"', color: "Negro" },
  "CNI-0016": { forma: "Pino mini", grosor: '5"', color: "Negro" },
  "CNI-0017": { forma: "Pino", grosor: '5"', color: "Transparente" },
  "CNI-0018": { forma: "Pino delgado", grosor: '5"', color: "Negro" },
  "CNI-0019": { forma: "Pino Prosa", color: "Negro" },
  "CNI-0020": { forma: "Pino Prosa", color: "Transparente" },
  "CNI-0021": { forma: "Recto Chico", color: "Negro" },
  "CNI-0022": { forma: "Recto XG", color: "Negro" },
  "CNI-0023": { forma: "Recto Grande", color: "Negro" },
  "CNI-0024": { forma: "Recto Grande", color: "Transparente" },
  "CNI-0025": { forma: "Recto Mediano", color: "Negro" },
  "CNI-0026": { forma: "Recto Mini", color: "Negro" },
};
/** Variantes a eliminar (estado viejo / muestra desconocida / stock 0). */
const NYLON_DELETE = ["CNI-0001", "CNI-0006", "CNI-0014", "CNI-0015"];
/** Cepillo Silicon: variante a eliminar (Peine reciclado). */
const SILICON_DELETE = ["CSI-0003"];

interface Desired { attrId: number; valueId: number }

async function main() {
  const nylon = await prisma.product.findFirstOrThrow({ where: { nombre: "Cepillo Nylon" } });
  const silicon = await prisma.product.findFirstOrThrow({ where: { nombre: "Cepillo Silicon" } });

  const attrs = new Map<string, number>();
  for (const a of await prisma.attribute.findMany()) attrs.set(a.nombre, a.id);
  for (const name of [FORMA_NYLON, FORMA_SILICON, COLOR, GROSOR, ESTADO, MEDIDAS]) {
    if (!attrs.has(name)) throw new Error(`Falta el atributo "${name}"`);
  }
  const aFormaN = attrs.get(FORMA_NYLON)!;
  const aColor = attrs.get(COLOR)!;
  const aGrosor = attrs.get(GROSOR)!;
  const aEstado = attrs.get(ESTADO)!;
  const aMedidas = attrs.get(MEDIDAS)!;

  const variants = await prisma.productVariant.findMany({
    where: { productId: { in: [nylon.id, silicon.id] } },
    select: { id: true, sku: true, productId: true },
  });
  const bySku = new Map(variants.map((v) => [v.sku, v]));
  const siliconIds = variants.filter((v) => v.productId === silicon.id).map((v) => v.id);

  const nylonAttrIds = [aFormaN, aColor, aGrosor, aEstado, aMedidas];

  await prisma.$transaction(async (tx) => {
    // 1) Crear AttributeValues faltantes (formas y grosor 3")
    const ensure = async (attrId: number, valor: string): Promise<number> => {
      const found = await tx.attributeValue.findUnique({ where: { attributeId_valor: { attributeId: attrId, valor } } });
      if (found) return found.id;
      if (!APPLY) { console.log(`  + valor nuevo  ${attrName(attrId)} = ${valor}`); return -1; }
      const created = await tx.attributeValue.create({ data: { attributeId: attrId, valor } });
      console.log(`  + valor nuevo  ${attrName(attrId)} = ${valor}`);
      return created.id;
    };
    const attrName = (id: number) => [...attrs.entries()].find(([, v]) => v === id)?.[0] ?? String(id);

    const formaIds = new Map<string, number>();
    for (const t of Object.values(NYLON)) {
      if (!formaIds.has(t.forma)) formaIds.set(t.forma, await ensure(aFormaN, t.forma));
    }

    // 2) Reasignar atributos de Cepillo Nylon
    for (const [sku, t] of Object.entries(NYLON)) {
      const v = bySku.get(sku);
      if (!v) { console.log(`  ! variante ${sku} no existe`); continue; }
      const desired: Desired[] = [{ attrId: aFormaN, valueId: formaIds.get(t.forma)! }];
      if (t.color) {
        const cv = await tx.attributeValue.findUnique({ where: { attributeId_valor: { attributeId: aColor, valor: t.color } } });
        if (!cv) throw new Error(`Falta valor de color "${t.color}"`);
        desired.push({ attrId: aColor, valueId: cv.id });
      }
      if (t.grosor) {
        const gv = await ensure(aGrosor, t.grosor);
        desired.push({ attrId: aGrosor, valueId: gv });
      }
      if (!APPLY) {
        console.log(`  ~ ${sku}: forma=${t.forma}${t.grosor ? ` grosor=${t.grosor}` : ""}${t.color ? ` color=${t.color}` : ""}`);
        continue;
      }
      await tx.variantAttribute.deleteMany({ where: { variantId: v.id, attributeId: { in: nylonAttrIds } } });
      await tx.variantAttribute.createMany({ data: desired.map((d) => ({ variantId: v.id, attributeId: d.attrId, valueId: d.valueId })) });
    }

    // 3) Quitar Estado de Cepillo Silicon
    if (APPLY) {
      const del = await tx.variantAttribute.deleteMany({ where: { variantId: { in: siliconIds }, attributeId: aEstado } });
      console.log(`  ~ Cepillo Silicon: ${del.count} valores de Estado eliminados`);
    } else {
      const n = await tx.variantAttribute.count({ where: { variantId: { in: siliconIds }, attributeId: aEstado } });
      console.log(`  ~ Cepillo Silicon: ${n} valores de Estado se eliminarían`);
    }

    // 4) Eliminar variantes obsoletas
    for (const sku of [...NYLON_DELETE, ...SILICON_DELETE]) {
      const v = bySku.get(sku);
      if (!v) { console.log(`  ! variante a eliminar ${sku} no existe`); continue; }
      const agg = await tx.stockLevel.aggregate({ where: { variantId: v.id }, _sum: { qty: true } });
      const stock = Number(agg._sum.qty ?? 0);
      console.log(`  - eliminar ${sku} (stock ${stock})`);
      if (!APPLY) continue;
      await tx.stockMove.deleteMany({ where: { variantId: v.id } });
      await tx.stockLevel.deleteMany({ where: { variantId: v.id } });
      await tx.variantAttribute.deleteMany({ where: { variantId: v.id } });
      await tx.productVariant.delete({ where: { id: v.id } });
    }

    // 5) Quitar ejes Estado y Medidas de los productos
    if (APPLY) {
      const del = await tx.productAttributeLine.deleteMany({ where: { attributeId: { in: [aEstado, aMedidas] } } });
      console.log(`  - ejes Estado/Medidas eliminados: ${del.count}`);
    } else {
      const n = await tx.productAttributeLine.count({ where: { attributeId: { in: [aEstado, aMedidas] } } });
      console.log(`  - ejes Estado/Medidas a eliminar: ${n}`);
    }

    // 6) Borrar atributos del catálogo si quedan sin uso
    for (const [name, id] of [[MEDIDAS, aMedidas], [ESTADO, aEstado]] as const) {
      const usaVA = await tx.variantAttribute.count({ where: { attributeId: id } });
      const usaLine = await tx.productAttributeLine.count({ where: { attributeId: id } });
      const usaPAV = await tx.productAttributeValue.count({ where: { attributeId: id } });
      const usaPasso = await tx.productPasso.count({ where: { attributeId: id } });
      if (APPLY && usaVA === 0 && usaLine === 0 && usaPAV === 0 && usaPasso === 0) {
        await tx.attributeValue.deleteMany({ where: { attributeId: id } });
        await tx.attribute.delete({ where: { id } });
        console.log(`  - atributo "${name}" borrado del catálogo`);
      } else {
        console.log(`  - atributo "${name}": usos restantes (VA:${usaVA} line:${usaLine} PAV:${usaPAV} passo:${usaPasso})`);
      }
    }
  });

  console.log(APPLY ? "\nAplicado." : "\n(dry) No se escribió nada. Usa --apply.");
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
