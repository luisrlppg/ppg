import { PrismaClient, SeccionProduccion, Turno } from "@prisma/client";

const prisma = new PrismaClient();

/**
 * seed-demo.ts — Siembra datos de demostración para el flujo E3 (Producción/Reportes).
 *
 * Idempotente: si las variantes ya existen las deja y solo garantiza el stock mínimo.
 * Crea (por upsert):
 *   1. Variante real Vástago 10mm   -> para reportar PRODUCCIÓN (tipo final)
 *   2. Variante real Cerda Negra     -> con stock para reportar CONSUMO (tipo consumo)
 *   3. OF en_progreso para fabricar vástagos -> para probar la ejecución de OF (§8.5)
 *
 * No borra reportes ni ventas existentes. Solo agrega lo que haga falta.
 */

async function main() {
  console.log("=== Seed demo E3 (producción/reportes) ===\n");

  const vastago = await prisma.product.findUnique({ where: { skuBase: "VAST" } });
  const cerda = await prisma.product.findUnique({ where: { skuBase: "CERD" } });
  if (!vastago || !cerda) {
    console.error("ERROR: faltan productos base. Ejecuta `pnpm db:seed` primero.");
    process.exit(1);
  }

  const admin = await prisma.user.findUnique({ where: { username: "admin" } });
  const adminId = admin?.id ?? null;

  const almacen = await prisma.location.findUnique({ where: { nombre: "Almacén principal" } });
  if (!almacen) {
    console.error("ERROR: falta 'Almacén principal'. Ejecuta `pnpm db:seed` primero.");
    process.exit(1);
  }

  // ---------------------------------------------------------------
  // 1. Variante real: Vástago 10mm
  // ---------------------------------------------------------------
  const attrAltura = await prisma.attribute.findUnique({ where: { nombre: "Altura vastago" } });
  const altura10 = attrAltura
    ? await prisma.attributeValue.findFirst({ where: { attributeId: attrAltura.id, valor: "10mm" } })
    : null;

  let vVastago = await prisma.productVariant.findUnique({ where: { sku: "VAST-10MM" } });
  if (!vVastago) {
    vVastago = await prisma.productVariant.create({
      data: {
        productId: vastago.id,
        nombre: "Vástago 10mm",
        sku: "VAST-10MM",
        stockMin: 100,
        stockMax: 2000,
        activo: true,
        variantAttributes: attrAltura && altura10
          ? { create: { attributeId: attrAltura.id, valueId: altura10.id } }
          : undefined,
      },
    });
    console.log("- Vástago 10mm creado (variante real)");
  } else {
    console.log("- Vástago 10mm ya existía");
  }

  // Stock inicial del vástago (en almacén) si no tiene nada
  const sVastago = await prisma.stockLevel.findUnique({
    where: { variantId_locationId: { variantId: vVastago.id, locationId: almacen.id } },
  });
  if (!sVastago || Number(sVastago.qty) <= 0) {
    const qty = 500;
    await prisma.stockLevel.upsert({
      where: { variantId_locationId: { variantId: vVastago.id, locationId: almacen.id } },
      update: { qty: { increment: qty } },
      create: { variantId: vVastago.id, locationId: almacen.id, qty },
    });
    await prisma.stockMove.create({
      data: { variantId: vVastago.id, locationId: almacen.id, qty, motivo: "apertura", ref: "seed-demo", userId: adminId },
    });
    console.log(`- Stock inicial Vástago 10mm: +${qty} en Almacén principal`);
  }

  // ---------------------------------------------------------------
  // 2. Variante real: Cerda Negra (consumible, uom=kg)
  // ---------------------------------------------------------------
  const attrColorCerda = await prisma.attribute.findUnique({ where: { nombre: "Color de cerda" } });
  const negro = attrColorCerda
    ? await prisma.attributeValue.findFirst({ where: { attributeId: attrColorCerda.id, valor: "Negro" } })
    : null;

  let vCerda = await prisma.productVariant.findUnique({ where: { sku: "CERD-NEGRO" } });
  if (!vCerda) {
    vCerda = await prisma.productVariant.create({
      data: {
        productId: cerda.id,
        nombre: "Cerda Negra",
        sku: "CERD-NEGRO",
        stockMin: 20,
        stockMax: 500,
        activo: true,
        variantAttributes: attrColorCerda && negro
          ? { create: { attributeId: attrColorCerda.id, valueId: negro.id } }
          : undefined,
      },
    });
    console.log("- Cerda Negra creada (variante real, uom=kg)");
  } else {
    console.log("- Cerda Negra ya existía");
  }

  // Stock inicial de cerda (para poder consumir en reporte)
  const sCerda = await prisma.stockLevel.findUnique({
    where: { variantId_locationId: { variantId: vCerda.id, locationId: almacen.id } },
  });
  const cerdaAInicial = sCerda ? Number(sCerda.qty) : 0;
  if (cerdaAInicial < 100) {
    const faltante = 100 - cerdaAInicial;
    await prisma.stockLevel.upsert({
      where: { variantId_locationId: { variantId: vCerda.id, locationId: almacen.id } },
      update: { qty: { increment: faltante } },
      create: { variantId: vCerda.id, locationId: almacen.id, qty: faltante },
    });
    await prisma.stockMove.create({
      data: { variantId: vCerda.id, locationId: almacen.id, qty: faltante, motivo: "apertura", ref: "seed-demo", userId: adminId },
    });
    console.log(`- Stock Cerda Negra ajustado: +${faltante} (total 100 kg)`);
  }

  // ---------------------------------------------------------------
  // 3. OF en_progreso para fabricar vástagos (prueba ejecución de OF §8.5)
  // ---------------------------------------------------------------
  const numeroOF = "OF-DEMO-1";
  const ofExistente = await prisma.manufacturingOrder.findFirst({ where: { numero: numeroOF } });
  if (ofExistente) {
    console.log(`- ${numeroOF} ya existía`);
  } else {
    await prisma.manufacturingOrder.create({
      data: {
        numero: numeroOF,
        variantId: vVastago.id,
        cantidad: 200,
        tipo: "fabricacion",
        estado: "en_progreso",
        notas: "OF de demostración para probar el flujo de reportes (E3)",
        generatedFrom: "seed-demo",
        userId: adminId,
        lines: {
          create: [{ componentVariantId: vVastago.id, cantidadRequerida: 200 }],
        },
      },
    });
    console.log(`- ${numeroOF} creada (en_progreso) para Vástago 10mm`);
  }

  console.log("\n=== Seed demo E3 listo ===");
  console.log("\nPara probar el flujo desde /reportes:");
  console.log("  1. Reporte del día: busca 'Vástago 10mm' (tipo final, sección maquina1) y 'Cerda Negra' (tipo consumo).");
  console.log("  2. Enlaza la OF " + numeroOF + " al reporte.");
  console.log("  3. Acepta el reporte: la OF pasará a 'hecha', el vástago entrará a 'Recibo de Producción', la cerda restará.");
  console.log("  4. Ubicar: asigna el lote del Recibo a un compartimento.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
