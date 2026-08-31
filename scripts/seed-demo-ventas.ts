import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/**
 * seed-demo-ventas.ts — Siembra datos de demostración para probar el flujo
 * de VENTAS → OFs recursivas (E2 §7.4/§7.5).
 *
 * Crea (idempotente):
 *   1. Variante única real de Vástago   (VAST-STD) sin stock
 *   2. Variante única real de Cerda      (CERD-STD, kg) con stock
 *   3. Variante única real de Pincel     (PIN-STD, ensamble: Vástago exacto + Cerda consumible) sin stock
 *   4. Variante combo de Taparrosca con Pincel materializada SIN stock
 *
 * Con stock insuficiente, al confirmar la venta el neteo genera OFs en cascada
 * y pendientes de compra.
 */

async function crearVarianteUnica(productId: number, sku: string, nombre: string, opts: { stockMin?: number; stockMax?: number; stock?: number; uom?: string } = {}) {
  let v = await prisma.productVariant.findUnique({ where: { sku } });
  if (!v) {
    v = await prisma.productVariant.create({
      data: { productId, nombre, sku, stockMin: opts.stockMin ?? 0, stockMax: opts.stockMax ?? 0, activo: true },
    });
    console.log(`- ${sku} creada`);
  } else {
    console.log(`- ${sku} ya existía`);
  }
  if (opts.stock) {
    const admin = await prisma.user.findUnique({ where: { username: "admin" } });
    const almacen = await prisma.location.findUnique({ where: { nombre: "Almacén principal" } });
    if (almacen) {
      const level = await prisma.stockLevel.findUnique({
        where: { variantId_locationId: { variantId: v.id, locationId: almacen.id } },
      });
      if (!level || Number(level.qty) <= 0) {
        await prisma.stockLevel.upsert({
          where: { variantId_locationId: { variantId: v.id, locationId: almacen.id } },
          update: { qty: { increment: opts.stock } },
          create: { variantId: v.id, locationId: almacen.id, qty: opts.stock },
        });
        await prisma.stockMove.create({
          data: { variantId: v.id, locationId: almacen.id, qty: opts.stock, motivo: "apertura", ref: "seed-demo-ventas", userId: admin?.id ?? null },
        });
        console.log(`- ${sku} stock +${opts.stock}`);
      }
    }
  }
  return v;
}

async function main() {
  console.log("=== Seed demo ventas → OFs recursivas ===\n");

  const vastago = await prisma.product.findUnique({ where: { skuBase: "VAST" } });
  const cerda = await prisma.product.findUnique({ where: { skuBase: "CERD" } });
  const pincel = await prisma.product.findUnique({ where: { skuBase: "PIN" } });
  const taparrosca = await prisma.product.findUnique({ where: { skuBase: "TP" } });
  if (!vastago || !cerda || !pincel || !taparrosca) {
    console.error("ERROR: faltan productos base. Ejecuta `pnpm db:seed` primero.");
    process.exit(1);
  }

  // 1. Variantes únicas (productos sin ejes → resolveComponentVariant usa findFirst)
  await crearVarianteUnica(vastago.id, "VAST-STD", "Vástago estándar", { stockMin: 0, stockMax: 0 });
  await crearVarianteUnica(cerda.id, "CERD-STD", "Cerda estándar", { stock: 20 });
  await crearVarianteUnica(pincel.id, "PIN-STD", "Pincel estándar", { stockMin: 0, stockMax: 0 });

  // 4. Materializar combo Taparrosca: TP-10mm-10mm-plano-hexagonal-negro (valueIds 20,23,31,33,37)
  let combo = await prisma.productVariant.findFirst({ where: { productId: taparrosca.id, sku: "TP-10mm-10mm-plano-hexagonal-negro" } });
  if (!combo) {
    combo = await prisma.productVariant.create({
      data: {
        productId: taparrosca.id,
        nombre: "10mm 10mm Plano Hexagonal Negro",
        sku: "TP-10mm-10mm-plano-hexagonal-negro",
        activo: true,
        variantAttributes: {
          create: [
            { attributeId: 4, valueId: 20 },
            { attributeId: 5, valueId: 23 },
            { attributeId: 6, valueId: 31 },
            { attributeId: 7, valueId: 33 },
            { attributeId: 8, valueId: 37 },
          ],
        },
      },
    });
    console.log("- Combo Taparrosca TP-10mm-10mm-plano-hexagonal-negro creado (sin stock)");
  } else {
    console.log("- Combo Taparrosca ya existía");
  }

  console.log("\n=== Listo para la prueba ===");
  console.log("Vende la Taparrosca combo (variantId " + combo.id + ") con configuración y confirma la venta.");
  console.log("Esperado: neteo + OFs en cascada (ensamble taparrosca, fabricacion pincel) + compra de vástago.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
