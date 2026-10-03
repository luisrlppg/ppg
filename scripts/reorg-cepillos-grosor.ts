/**
 * Reorganización del eje de grosor del Cepillo Nylon.
 *
 * El grosor de cerda deja de ser eje y se mueve a `ProductVariant.notas`
 * (formato `grosor: N"`, y en los Recto `medida · grosor: 5"`). El grosor se
 * codifica en la FORMA:
 *   - 5"    → forma default (la que ya tiene)
 *   - 5.75" → forma "… Prosa"
 *   - 4"    → "Bala Barradas" / "Pino Barradas"
 *   - 3"    → Citologico
 * Ejes finales del Cepillo Nylon: Forma + Color.
 *
 * Uso:
 *   pnpm exec dotenv -e .env -- pnpm --filter @ppg/db exec tsx ../../scripts/reorg-cepillos-grosor.ts [--dry]
 *   `--apply` escribe; sin él, sólo reporta.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const APPLY = process.argv.includes("--apply");

const FORMA = "Forma de cepillo nylon";
const COLOR = "Color de Cerda de Cepillo";
const GROSOR = "Grosor cerda";

/** SKU → forma destino (ya resuelta), o null para no cambiarla. */
const FORMA_DESTINO: Record<string, string> = {
  "CNI-0002": "Bala Barradas",
  "CNI-0013": "Pino Barradas",
  "CNI-0011": "Cacahuate Prosa",
};
/** Medidas (nota) de los Recto; el resto sólo lleva el grosor. */
const MEDIDAS: Record<string, string> = {
  "CNI-0021": "5x27.5",
  "CNI-0022": "8.75x22.25",
  "CNI-0023": "8x23",
  "CNI-0024": "8x23",
  "CNI-0025": "6x12",
  "CNI-0026": "Mini",
};
/** Grosor por defecto cuando la variante ya no lo tiene como atributo. */
const GROSOR_DEFECTO: Record<string, string> = {
  "Bala Barradas": '4"',
  "Pino Barradas": '4"',
  Citologico: '3"',
  "Bala Prosa": '5.75"',
  "Balita Prosa": '5.75"',
  "Pino Prosa": '5.75"',
  "Cacahuate Prosa": '5.75"',
  Balita: '5"',
};
const FORMAS_RECTO = new Set(["Recto Chico", "Recto XG", "Recto Grande", "Recto Mediano", "Recto Mini"]);
const grosorDe = (forma: string, grosorAttr: string): string => {
  if (grosorAttr) return grosorAttr;
  if (FORMAS_RECTO.has(forma)) return '5"';
  return GROSOR_DEFECTO[forma] ?? '5"';
};

async function main() {
  const nylon = await prisma.product.findFirstOrThrow({ where: { nombre: "Cepillo Nylon" } });
  const attrs = new Map((await prisma.attribute.findMany()).map((a) => [a.nombre, a.id]));
  if (!attrs.has(FORMA) || !attrs.has(COLOR)) throw new Error("Faltan atributos de cepillo");
  const aForma = attrs.get(FORMA)!;
  const aColor = attrs.get(COLOR)!;
  const aGrosor = attrs.get(GROSOR);

  const variants = await prisma.productVariant.findMany({
    where: { productId: nylon.id },
    include: { variantAttributes: { include: { attribute: true, value: true } } },
  });

  await prisma.$transaction(async (tx) => {
    const ensureForma = async (valor: string): Promise<number> => {
      const found = await tx.attributeValue.findUnique({ where: { attributeId_valor: { attributeId: aForma, valor } } });
      if (found) return found.id;
      console.log(`  + valor nuevo  Forma de cepillo nylon = ${valor}`);
      if (!APPLY) return -1;
      return (await tx.attributeValue.create({ data: { attributeId: aForma, valor } })).id;
    };

    const formaIdPorValor = new Map<string, number>();
    for (const forma of Object.values(FORMA_DESTINO)) {
      if (!formaIdPorValor.has(forma)) formaIdPorValor.set(forma, await ensureForma(forma));
    }

    for (const v of variants) {
      let forma = "", color = "", grosor = "";
      let colorId = 0;
      for (const va of v.variantAttributes) {
        if (va.attribute.nombre === FORMA) forma = va.value.valor;
        else if (va.attribute.nombre === COLOR) { color = va.value.valor; colorId = va.valueId; }
        else if (va.attribute.nombre === GROSOR) grosor = va.value.valor;
      }
      const nuevaForma = FORMA_DESTINO[v.sku] ?? forma;
      const notaGrosor = grosorDe(nuevaForma, grosor);
      const nota = MEDIDAS[v.sku] ? `${MEDIDAS[v.sku]} · grosor: ${notaGrosor}` : `grosor: ${notaGrosor}`;

      const deseado = `forma=${nuevaForma} color=${color || "-"} nota="${nota}"`;
      if (nuevaForma === forma && !grosor && v.notas === nota) { console.log(`  = ${v.sku} sin cambios`); continue; }
      console.log(`  ~ ${v.sku}: ${deseado}`);
      if (!APPLY) continue;

      const formaId = formaIdPorValor.get(nuevaForma) ?? (await ensureForma(nuevaForma));
      const desired: { attributeId: number; valueId: number }[] = [{ attributeId: aForma, valueId: formaId }];
      if (colorId) desired.push({ attributeId: aColor, valueId: colorId });

      await tx.variantAttribute.deleteMany({ where: { variantId: v.id, attributeId: { in: [aForma, aColor, ...(aGrosor ? [aGrosor] : [])] } } });
      await tx.variantAttribute.createMany({ data: desired.map((d) => ({ variantId: v.id, ...d })) });

      const nombre = [color, nuevaForma].filter(Boolean).join(" ");
      await tx.productVariant.update({ where: { id: v.id }, data: { notas: nota, nombre } });
    }

    // Quitar el eje Grosor del producto
    if (aGrosor) {
      if (APPLY) {
        const del = await tx.productAttributeLine.deleteMany({ where: { productId: nylon.id, attributeId: aGrosor } });
        console.log(`  - eje Grosor cerda quitado: ${del.count}`);
      } else {
        const n = await tx.productAttributeLine.count({ where: { productId: nylon.id, attributeId: aGrosor } });
        console.log(`  - eje Grosor cerda a quitar: ${n}`);
      }
    }

    // Borrar valores de Forma huérfanos (sin variante que los use y sin permitidos)
    const usados = new Set((await tx.variantAttribute.findMany({ where: { attributeId: aForma }, select: { valueId: true } })).map((r) => r.valueId));
    const permitidos = new Set((await tx.productAttributeValue.findMany({ where: { attributeId: aForma }, select: { valueId: true } })).map((r) => r.valueId));
    const valores = await tx.attributeValue.findMany({ where: { attributeId: aForma } });
    for (const val of valores) {
      if (usados.has(val.id) || permitidos.has(val.id)) continue;
      console.log(`  - borrar valor huérfano: ${val.valor}`);
      if (APPLY) await tx.attributeValue.delete({ where: { id: val.id } });
    }
  });

  console.log(APPLY ? "\nAplicado." : "\n(dry) No se escribió nada. Usa --apply.");
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
