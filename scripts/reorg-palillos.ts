/**
 * Reorganización de Palillos.
 *
 * En Odoo hay 3 familias mezcladas en el producto PPG `Palillo` (P0014):
 *   - Palillo Desechable            → `Palillo Sin Cepillo` (componente, eje Color de Palillo)
 *   - Palillo Citologico Desechable → `Palillo Citologico Sin Cepillo` (componente, eje Color de Palillo)
 *   - Palillo con Cepillo Balita    → `Palillo con Cepillo` (ensamblado final; ejes Color de Palillo
 *                                     + Color de Cerda de Cepillo + Forma de cepillo nylon)
 * Además se crea `Palillo Citologico con Cepillo` (ensamblado, sin variantes por ahora).
 *
 * BOM: Palillo con Cepillo = 1 × Palillo Sin Cepillo + 1 × Cepillo Nylon (exacto)
 *      Palillo Citologico con Cepillo = 1 × Palillo Citologico Sin Cepillo + 1 × Cepillo Nylon (exacto)
 *
 * Uso:
 *   pnpm exec dotenv -e .env -- pnpm --filter @ppg/db exec tsx ../../scripts/reorg-palillos.ts [--dry]
 *   `--apply` escribe; sin él, sólo reporta. Idempotente.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const APPLY = process.argv.includes("--apply");

// SKUs base nuevos (libres): P0032/P0033/P0034
const SKU_CITOLOGICO = "P0032";
const SKU_CON_CEPILLO = "P0033";
const SKU_CON_CEPILLO_CITO = "P0034";

const ATTR_COLOR = "Color de Palillo";
const ATTR_COLOR_CITO = "Color de Palillo Citologico";
const ATTR_CERDA = "Color de Cerda de Cepillo";
const ATTR_FORMA = "Forma de cepillo nylon";

const PALILLO_ID = 42;

async function main() {
  // Productos y atributos base
  const palilloSin = await prisma.product.findUnique({ where: { id: PALILLO_ID } });
  if (!palilloSin) throw new Error("No existe el producto Palillo (id 42)");
  const cepilloNylon = await prisma.product.findFirst({ where: { nombre: "Cepillo Nylon" } });
  if (!cepilloNylon) throw new Error("No existe Cepillo Nylon");

  const attrs = new Map((await prisma.attribute.findMany()).map((a) => [a.nombre, a.id]));
  for (const n of [ATTR_COLOR, ATTR_CERDA, ATTR_FORMA]) {
    if (!attrs.has(n)) throw new Error(`Falta el atributo "${n}"`);
  }
  let aColorCito: number;
  if (attrs.has(ATTR_COLOR_CITO)) {
    aColorCito = attrs.get(ATTR_COLOR_CITO)!;
  } else if (APPLY) {
    console.log(`  + crear atributo "${ATTR_COLOR_CITO}" (valor Blanco)`);
    aColorCito = (await prisma.attribute.create({ data: { nombre: ATTR_COLOR_CITO } })).id;
    await prisma.attributeValue.create({ data: { attributeId: aColorCito, valor: "Blanco" } });
  } else {
    console.log(`  + se crearía el atributo "${ATTR_COLOR_CITO}" (valor Blanco)`);
    aColorCito = -1;
  }
  const aColor = attrs.get(ATTR_COLOR)!;
  const aCerda = attrs.get(ATTR_CERDA)!;
  const aForma = attrs.get(ATTR_FORMA)!;

  const variants = await prisma.productVariant.findMany({
    where: { productId: PALILLO_ID },
    include: { variantAttributes: { include: { attribute: true, value: true } } },
    orderBy: { sku: "asc" },
  });
  const citologico = variants.find((v) => v.sku === "P0014-0001");
  const conCepillo = variants.filter((v) => ["P0014-0002", "P0014-0003", "P0014-0004", "P0014-0005", "P0014-0006"].includes(v.sku));

  // Si ya se migró (el citológico ya no está en P0014), no repetir.
  const citoExistente = await prisma.product.findUnique({ where: { skuBase: SKU_CITOLOGICO } });
  const yaMigrado = !citologico && !!citoExistente;

  const resumen = {
    renombrar: palilloSin.nombre !== "Palillo Sin Cepillo",
    citologico: !!citologico,
    conCepillo: conCepillo.length,
  };
  console.log("Plan de palillos:");
  console.log(`  renombrar id 42 → "Palillo Sin Cepillo": ${resumen.renombrar}`);
  console.log(`  mover citológico → ${SKU_CITOLOGICO}-0001 (Blanco): ${citologico ? "sí" : "ya migrado"}`);
  console.log(`  mover con cepillo (${conCepillo.map((v) => v.sku).join(", ") || "—"}) → ${SKU_CON_CEPILLO}-000x`);
  console.log(`  crear ${SKU_CON_CEPILLO_CITO} "Palillo Citologico con Cepillo" (sin variantes)`);
  if (!APPLY) { console.log("\n(dry) No se escribió nada. Usa --apply."); return; }

  await prisma.$transaction(async (tx) => {
    // Helper: crear valor de atributo si falta
    const valId = async (attributeId: number, valor: string) => {
      const found = await tx.attributeValue.findUnique({ where: { attributeId_valor: { attributeId, valor } } });
      if (found) return found.id;
      return (await tx.attributeValue.create({ data: { attributeId, valor } })).id;
    };
    const setEjes = async (variantId: number, ejes: { attributeId: number; valueId: number }[]) => {
      await tx.variantAttribute.deleteMany({ where: { variantId } });
      await tx.variantAttribute.createMany({ data: ejes.map((e) => ({ variantId, ...e })) });
    };
    const nombreDe = (valores: string[]) => valores.join(" ");

    // 1) Renombrar producto id 42
    await tx.product.update({ where: { id: PALILLO_ID }, data: { nombre: "Palillo Sin Cepillo" } });
    // Eje solo Color de Palillo
    await tx.productAttributeLine.deleteMany({ where: { productId: PALILLO_ID, attributeId: { not: aColor } } });
    await tx.productAttributeLine.upsert({
      where: { productId_attributeId: { productId: PALILLO_ID, attributeId: aColor } },
      update: {},
      create: { productId: PALILLO_ID, attributeId: aColor, sortOrder: 0 },
    });

    // 2) Palillo Citologico Sin Cepillo — usa "Color de Palillo Citologico"
    let cito = await tx.product.findUnique({ where: { skuBase: SKU_CITOLOGICO } });
    if (!cito) {
      cito = await tx.product.create({
        data: {
          nombre: "Palillo Citologico Sin Cepillo",
          skuBase: SKU_CITOLOGICO,
          categoryId: palilloSin.categoryId,
          uom: palilloSin.uom,
          hasVariants: true,
        },
      });
    }
    // Eje: Color de Palillo Citologico (quitar Color de Palillo si lo tuviera)
    await tx.productAttributeLine.deleteMany({ where: { productId: cito.id, attributeId: aColor } });
    await tx.productAttributeLine.upsert({
      where: { productId_attributeId: { productId: cito.id, attributeId: aColorCito } },
      update: { sortOrder: 0 },
      create: { productId: cito.id, attributeId: aColorCito, sortOrder: 0 },
    });
    const blancoCito = await valId(aColorCito, "Blanco");
    if (citologico) {
      // Reasignar variante citológica y cambiar SKU
      await tx.productVariant.update({
        where: { id: citologico.id },
        data: { productId: cito.id, sku: `${SKU_CITOLOGICO}-0001` },
      });
      await setEjes(citologico.id, [{ attributeId: aColorCito, valueId: blancoCito }]);
      await tx.productVariant.update({ where: { id: citologico.id }, data: { nombre: nombreDe(["Blanco"]) } });
    } else {
      // Ya migrado: asegurar que su variante apunte al atributo nuevo
      const v = await tx.productVariant.findFirst({ where: { productId: cito.id } });
      if (v) {
        const tieneCito = await tx.variantAttribute.findUnique({ where: { variantId_attributeId: { variantId: v.id, attributeId: aColorCito } } });
        if (!tieneCito) await setEjes(v.id, [{ attributeId: aColorCito, valueId: blancoCito }]);
      }
    }

    // 3) Palillo con Cepillo
    let con = await tx.product.findUnique({ where: { skuBase: SKU_CON_CEPILLO } });
    if (!con) {
      con = await tx.product.create({
        data: {
          nombre: "Palillo con Cepillo",
          skuBase: SKU_CON_CEPILLO,
          categoryId: palilloSin.categoryId,
          uom: palilloSin.uom,
          hasVariants: true,
        },
      });
    }
    for (const [i, attributeId] of [aColor, aCerda, aForma].entries()) {
      await tx.productAttributeLine.upsert({
        where: { productId_attributeId: { productId: con.id, attributeId } },
        update: { sortOrder: i },
        create: { productId: con.id, attributeId, sortOrder: i },
      });
    }
    let seq = 0;
    for (const v of conCepillo) {
      seq++;
      const colorPal = v.variantAttributes.find((va) => va.attribute.nombre === ATTR_COLOR)?.value.valor ?? "";
      const colorCerda = v.variantAttributes.find((va) => va.attribute.nombre === ATTR_CERDA)?.value.valor ?? "";
      const forma = v.variantAttributes.find((va) => va.attribute.nombre === ATTR_FORMA)?.value.valor ?? "Balita";
      const ejes = [
        { attributeId: aColor, valueId: await valId(aColor, colorPal) },
        { attributeId: aCerda, valueId: await valId(aCerda, colorCerda) },
        { attributeId: aForma, valueId: await valId(aForma, forma) },
      ];
      await tx.productVariant.update({
        where: { id: v.id },
        data: { productId: con.id, sku: `${SKU_CON_CEPILLO}-${String(seq).padStart(4, "0")}`, nombre: nombreDe([colorPal, colorCerda, forma]) },
      });
      await setEjes(v.id, ejes);
    }

    // BOM de Palillo con Cepillo
    await tx.productComponent.upsert({
      where: { productId_componentId: { productId: con.id, componentId: PALILLO_ID } },
      update: { cantidad: 1, tipo: "exacto" },
      create: { productId: con.id, componentId: PALILLO_ID, cantidad: 1, tipo: "exacto" },
    });
    await tx.productComponent.upsert({
      where: { productId_componentId: { productId: con.id, componentId: cepilloNylon.id } },
      update: { cantidad: 1, tipo: "exacto" },
      create: { productId: con.id, componentId: cepilloNylon.id, cantidad: 1, tipo: "exacto" },
    });

    // 4) Palillo Citologico con Cepillo (sin variantes)
    let conCito = await tx.product.findUnique({ where: { skuBase: SKU_CON_CEPILLO_CITO } });
    if (!conCito) {
      conCito = await tx.product.create({
        data: {
          nombre: "Palillo Citologico con Cepillo",
          skuBase: SKU_CON_CEPILLO_CITO,
          categoryId: palilloSin.categoryId,
          uom: palilloSin.uom,
          hasVariants: true,
        },
      });
    }
    await tx.productAttributeLine.deleteMany({ where: { productId: conCito.id, attributeId: aColor } });
    for (const [i, attributeId] of [aColorCito, aCerda, aForma].entries()) {
      await tx.productAttributeLine.upsert({
        where: { productId_attributeId: { productId: conCito.id, attributeId } },
        update: { sortOrder: i },
        create: { productId: conCito.id, attributeId, sortOrder: i },
      });
    }
    await tx.productComponent.upsert({
      where: { productId_componentId: { productId: conCito.id, componentId: cito.id } },
      update: { cantidad: 1, tipo: "exacto" },
      create: { productId: conCito.id, componentId: cito.id, cantidad: 1, tipo: "exacto" },
    });
    await tx.productComponent.upsert({
      where: { productId_componentId: { productId: conCito.id, componentId: cepilloNylon.id } },
      update: { cantidad: 1, tipo: "exacto" },
      create: { productId: conCito.id, componentId: cepilloNylon.id, cantidad: 1, tipo: "exacto" },
    });

    // 5) Recalcular nombres de las variantes restantes (sin cepillo)
    const restantes = await tx.productVariant.findMany({ where: { productId: PALILLO_ID } });
    for (const v of restantes) {
      const colorPal = (await tx.variantAttribute.findFirst({
        where: { variantId: v.id, attributeId: aColor },
        include: { value: true },
      }))?.value.valor;
      await tx.productVariant.update({ where: { id: v.id }, data: { nombre: colorPal ?? v.nombre } });
    }
  });

  console.log("\nAplicado.");
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
