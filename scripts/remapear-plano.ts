/**
 * One-off: "Tipo de Mango = Plano" no existe; es un agujero.
 * Para Mango y Pincel: mueve Plano -> Agujero de Mango=Plano y deja Tipo=Normal.
 * Agrega el eje `Agujero de Mango` a Pincel y elimina el valor `Plano` de `Tipo de Mango`.
 * Idempotente, dry-run por defecto.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const APPLY = process.argv.includes("--apply");
class Rollback extends Error {}

async function main() {
  const logs: string[] = [];
  const warns: string[] = [];

  await prisma.$transaction(async (tx) => {
    const tipo = await tx.attribute.findUnique({ where: { nombre: "Tipo de Mango" } });
    const agujero = await tx.attribute.findUnique({ where: { nombre: "Agujero de Mango" } });
    if (!tipo || !agujero) throw new Error("No existen Tipo de Mango / Agujero de Mango");

    const vPlano = await tx.attributeValue.findFirst({ where: { attributeId: tipo.id, valor: "Plano" } });
    const vNormal = await tx.attributeValue.findFirst({ where: { attributeId: tipo.id, valor: "Normal" } });
    const vAgujeroPlano = await tx.attributeValue.findFirst({ where: { attributeId: agujero.id, valor: "Plano" } });
    if (!vAgujeroPlano) throw new Error("No existe Agujero de Mango = Plano");

    for (const nombre of ["Mango", "Pincel"]) {
      const p = await tx.product.findFirst({ where: { nombre } });
      if (!p) { warns.push(`Producto "${nombre}" no existe`); continue; }

      const line = await tx.productAttributeLine.findUnique({
        where: { productId_attributeId: { productId: p.id, attributeId: agujero.id } },
      });
      if (!line) {
        await tx.productAttributeLine.create({ data: { productId: p.id, attributeId: agujero.id, sortOrder: 0 } });
        logs.push(`eje "Agujero de Mango" agregado a ${nombre}`);
      }

      if (vPlano && vNormal) {
        const vas = await tx.variantAttribute.findMany({
          where: { attributeId: tipo.id, valueId: vPlano.id, variant: { productId: p.id } },
        });
        for (const va of vas) {
          await tx.variantAttribute.upsert({
            where: { variantId_attributeId: { variantId: va.variantId, attributeId: agujero.id } },
            update: { valueId: vAgujeroPlano.id },
            create: { variantId: va.variantId, attributeId: agujero.id, valueId: vAgujeroPlano.id },
          });
          await tx.variantAttribute.update({ where: { id: va.id }, data: { valueId: vNormal.id } });
          logs.push(`${nombre}: variante ${va.variantId} -> Tipo=Normal + Agujero=Plano`);
        }
      }
    }

    if (vPlano) {
      const used = await tx.variantAttribute.count({ where: { valueId: vPlano.id } });
      if (used === 0) {
        await tx.attributeValue.delete({ where: { id: vPlano.id } });
        logs.push("valor 'Plano' eliminado de Tipo de Mango");
      } else {
        warns.push(`Tipo de Mango = Plano sigue usado en ${used} variante(s)`);
      }
    }

    if (!APPLY) throw new Rollback();
  }, { timeout: 60000, maxWait: 10000 }).catch((e) => { if (!(e instanceof Rollback)) throw e; });

  for (const l of logs) console.log(l);
  if (warns.length) { console.log(`\nAVISOS (${warns.length}):`); for (const w of warns) console.log(`  - ${w}`); }
  console.log(APPLY ? "\nAplicado." : "\n(dry-run) Rollback. Usa --apply para aplicar.");
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
