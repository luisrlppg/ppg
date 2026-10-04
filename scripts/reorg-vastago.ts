/**
 * One-off: simplifica los ejes de `Vastago`.
 *
 * 1) Elimina por completo el atributo `Agujero de Vastago` (lo sustituye `Punta`):
 *    borra sus VariantAttribute, el ProductAttributeLine de Vastago, sus valores y el atributo.
 * 2) `Tipo de Vastago` se queda sólo con `Normal` y `Mod-prosa`:
 *    - VST-0010 (Tipo=Delineador): se le pone Punta=Delineador y Tipo=Normal; conserva su stock.
 *    - Variantes sin Tipo → Normal.
 *    - VST-0014 / VST-0021 / VST-0022 / VST-0023 (Externo/Casquillo/Sin rosca): se eliminan
 *      junto con su stock (StockLevel/StockMove de apertura Odoo).
 *    - Se borran los valores Casquillo, Delineador, Externo y Sin rosca.
 *
 * Uso:
 *   pnpm exec dotenv -e .env -- pnpm --filter @ppg/db exec tsx ../../scripts/reorg-vastago.ts [--dry]
 *   `--apply` escribe; sin él, sólo reporta. Idempotente.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const APPLY = process.argv.includes("--apply");
class Rollback extends Error {}

const PRODUCTO_SKU = "VST";
const ATTR_AGUJERO = "Agujero de Vastago";
const ATTR_TIPO = "Tipo de Vastago";
const ATTR_PUNTA = "Punta";
const TIPO_BORRAR = ["Casquillo", "Delineador", "Externo", "Sin rosca"];
const VARIANTES_BORRAR = ["VST-0014", "VST-0021", "VST-0022", "VST-0023"];
const VST_DELINEADOR_SKU = "VST-0010";

async function main() {
  const product = await prisma.product.findFirst({ where: { skuBase: PRODUCTO_SKU } });
  if (!product) throw new Error(`No existe el producto con skuBase "${PRODUCTO_SKU}"`);

  const attrTipo = await prisma.attribute.findUnique({ where: { nombre: ATTR_TIPO } });
  const attrPunta = await prisma.attribute.findUnique({ where: { nombre: ATTR_PUNTA } });
  if (!attrTipo) throw new Error(`No existe el atributo "${ATTR_TIPO}"`);
  if (!attrPunta) throw new Error(`No existe el atributo "${ATTR_PUNTA}"`);

  const logs: string[] = [];
  const warns: string[] = [];

  await prisma.$transaction(async (tx) => {
    // --- A. Eliminar `Agujero de Vastago` ---
    const attrAgujero = await tx.attribute.findUnique({ where: { nombre: ATTR_AGUJERO } });
    if (attrAgujero) {
      const passos = await tx.productPasso.count({ where: { attributeId: attrAgujero.id } });
      const otros = await tx.productAttributeLine.count({
        where: { attributeId: attrAgujero.id, productId: { not: product.id } },
      });
      if (passos > 0 || otros > 0) {
        throw new Error(`Abortado: "${ATTR_AGUJERO}" sigue referenciado (${passos} passo(s), ${otros} otro(s) producto(s))`);
      }
      const va = await tx.variantAttribute.deleteMany({ where: { attributeId: attrAgujero.id } });
      const pal = await tx.productAttributeLine.deleteMany({ where: { productId: product.id, attributeId: attrAgujero.id } });
      const pav = await tx.productAttributeValue.deleteMany({ where: { attributeId: attrAgujero.id } });
      const av = await tx.attributeValue.deleteMany({ where: { attributeId: attrAgujero.id } });
      await tx.attribute.delete({ where: { id: attrAgujero.id } });
      logs.push(`${ATTR_AGUJERO}: ${va.count} variante(s), ${pal.count} eje, ${pav.count} permitidos, ${av.count} valores; atributo eliminado`);
    } else {
      logs.push(`${ATTR_AGUJERO}: ya no existe`);
    }

    // --- B. Simplificar `Tipo de Vastago` ---
    const valores = await tx.attributeValue.findMany({ where: { attributeId: attrTipo.id } });
    const porValor = new Map(valores.map((v) => [v.valor, v.id]));
    const normalId = porValor.get("Normal");
    if (!normalId) throw new Error(`No existe el valor "Normal" en "${ATTR_TIPO}"`);

    // B.1 VST-0010: Punta=Delineador + Tipo=Normal (conserva stock)
    const vstDelineador = await tx.productVariant.findFirst({ where: { productId: product.id, sku: VST_DELINEADOR_SKU } });
    if (vstDelineador) {
      const puntaDelineador = await tx.attributeValue.findFirst({ where: { attributeId: attrPunta.id, valor: "Delineador" } });
      if (!puntaDelineador) throw new Error(`No existe el valor "Delineador" en "${ATTR_PUNTA}"`);
      await tx.variantAttribute.upsert({
        where: { variantId_attributeId: { variantId: vstDelineador.id, attributeId: attrPunta.id } },
        update: { valueId: puntaDelineador.id },
        create: { variantId: vstDelineador.id, attributeId: attrPunta.id, valueId: puntaDelineador.id },
      });
      await tx.variantAttribute.upsert({
        where: { variantId_attributeId: { variantId: vstDelineador.id, attributeId: attrTipo.id } },
        update: { valueId: normalId },
        create: { variantId: vstDelineador.id, attributeId: attrTipo.id, valueId: normalId },
      });
      logs.push(`${VST_DELINEADOR_SKU}: Punta=Delineador + Tipo=Normal (stock conservado)`);
    } else {
      logs.push(`${VST_DELINEADOR_SKU}: ya no existe`);
    }

    // B.2 Variantes sin Tipo -> Normal
    const variantes = await tx.productVariant.findMany({
      where: { productId: product.id },
      include: { variantAttributes: { select: { attributeId: true } } },
    });
    let aNormal = 0;
    for (const v of variantes) {
      if (VARIANTES_BORRAR.includes(v.sku)) continue;
      if (v.variantAttributes.some((va) => va.attributeId === attrTipo.id)) continue;
      await tx.variantAttribute.create({ data: { variantId: v.id, attributeId: attrTipo.id, valueId: normalId } });
      aNormal++;
    }
    logs.push(`Tipo=Normal asignado a ${aNormal} variante(s) sin tipo`);

    // B.3 Eliminar variantes Externo/Casquillo/Sin rosca (con su stock)
    for (const sku of VARIANTES_BORRAR) {
      const v = await tx.productVariant.findFirst({ where: { productId: product.id, sku } });
      if (!v) { logs.push(`${sku}: ya no existe`); continue; }
      const [ventas, ofs, lineasOF, reportes, precios] = await Promise.all([
        tx.salesOrderLine.count({ where: { variantId: v.id } }),
        tx.manufacturingOrder.count({ where: { variantId: v.id } }),
        tx.manufacturingOrderLine.count({ where: { componentVariantId: v.id } }),
        tx.productionReportLine.count({ where: { variantId: v.id } }),
        tx.priceChange.count({ where: { variantId: v.id } }),
      ]);
      if (ventas + ofs + lineasOF + reportes + precios > 0) {
        throw new Error(`Abortado: ${sku} tiene historial (${ventas} ventas, ${ofs} OFs, ${lineasOF} usos, ${reportes} reportes, ${precios} precios)`);
      }
      const sm = await tx.stockMove.deleteMany({ where: { variantId: v.id } });
      const sl = await tx.stockLevel.deleteMany({ where: { variantId: v.id } });
      const vpk = await tx.variantPackaging.deleteMany({ where: { variantId: v.id } });
      const vat = await tx.variantAttribute.deleteMany({ where: { variantId: v.id } });
      await tx.productVariant.delete({ where: { id: v.id } });
      logs.push(`${sku}: eliminada (${sl.count} stock, ${sm.count} movs, ${vat.count} attrs, ${vpk.count} empaques)`);
    }

    // B.4 Borrar valores de Tipo ya sin uso
    for (const valor of TIPO_BORRAR) {
      const av = await tx.attributeValue.findFirst({ where: { attributeId: attrTipo.id, valor } });
      if (!av) { logs.push(`Tipo=${valor}: ya no existe`); continue; }
      const usos = await tx.variantAttribute.count({ where: { valueId: av.id } });
      if (usos > 0) { warns.push(`Tipo=${valor}: aún usado en ${usos} variante(s); no se borra`); continue; }
      await tx.attributeValue.delete({ where: { id: av.id } });
      logs.push(`Tipo=${valor}: valor eliminado`);
    }

    if (!APPLY) throw new Rollback();
  }, { timeout: 120000, maxWait: 20000 }).catch((e) => { if (!(e instanceof Rollback)) throw e; });

  for (const l of logs) console.log(l);
  if (warns.length) { console.log(`\nAVISOS (${warns.length}):`); for (const w of warns) console.log(`  - ${w}`); }
  console.log(APPLY ? "\nAplicado." : "\n(dry-run) Rollback. Usa --apply para aplicar.");
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
