import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function setupProducts() {
  console.log("=== Configurando estructura de productos (sin variantes) ===\n");

  // ------------------------------------------------------------------
  // 1. Buscar productos existentes
  // ------------------------------------------------------------------
  const vastago = await prisma.product.findUnique({ where: { skuBase: "VAST" } });
  const pincel = await prisma.product.findUnique({ where: { skuBase: "PIN" } });
  const taparrosca = await prisma.product.findUnique({ where: { skuBase: "TP" } });
  const cerda = await prisma.product.findUnique({ where: { skuBase: "CERD" } });

  if (!vastago || !pincel || !taparrosca || !cerda) {
    console.error("ERROR: No se encontraron todos los productos. Ejecuta el seed primero.");
    console.log({ vastago: !!vastago, pincel: !!pincel, taparrosca: !!taparrosca, cerda: !!cerda });
    process.exit(1);
  }
  console.log("Productos encontrados:");
  console.log(`  Vástago:  ID=${vastago.id}`);
  console.log(`  Pincel:   ID=${pincel.id}`);
  console.log(`  Taparrosca: ID=${taparrosca.id}`);
  console.log(`  Cerda:    ID=${cerda.id}`);

  // ------------------------------------------------------------------
  // 2. Buscar atributos por nombre
  // ------------------------------------------------------------------
  const attrTamanoRosca = await prisma.attribute.findUnique({ where: { nombre: "Tamaño rosca" } });
  const attrAlturaVastago = await prisma.attribute.findUnique({ where: { nombre: "Altura vastago" } });
  const attrAgujeroVastago = await prisma.attribute.findUnique({ where: { nombre: "Agujero vastago" } });
  const attrFormaTapa = await prisma.attribute.findUnique({ where: { nombre: "Forma tapa" } });
  const attrColorTapa = await prisma.attribute.findUnique({ where: { nombre: "Color tapa" } });

  console.log("\nAtributos encontrados:");
  console.log(`  Tamaño rosca:   ID=${attrTamanoRosca?.id}`);
  console.log(`  Altura vastago: ID=${attrAlturaVastago?.id}`);
  console.log(`  Agujero vastago: ID=${attrAgujeroVastago?.id}`);
  console.log(`  Forma tapa:    ID=${attrFormaTapa?.id}`);
  console.log(`  Color tapa:    ID=${attrColorTapa?.id}`);

  if (!attrTamanoRosca || !attrAlturaVastago || !attrAgujeroVastago || !attrFormaTapa || !attrColorTapa) {
    console.error("ERROR: Faltan atributos. Ejecuta el seed primero.");
    process.exit(1);
  }

  // ------------------------------------------------------------------
  // 3. Configurar ProductAttributeLine (ejes) para Taparrosca
  // ------------------------------------------------------------------
  console.log("\n=== Configurando ejes (ProductAttributeLine) ===");

  // Eliminar ejes existentes de Taparrosca
  await prisma.productAttributeLine.deleteMany({ where: { productId: taparrosca.id } });
  console.log("- Limpiados ejes existentes de Taparrosca");

  // Ejes de Taparrosca: los 5 atributos nuevos
  const taparroscaAxes = [
    { productId: taparrosca.id, attributeId: attrTamanoRosca.id, sortOrder: 1 },
    { productId: taparrosca.id, attributeId: attrAlturaVastago.id, sortOrder: 2 },
    { productId: taparrosca.id, attributeId: attrAgujeroVastago.id, sortOrder: 3 },
    { productId: taparrosca.id, attributeId: attrFormaTapa.id, sortOrder: 4 },
    { productId: taparrosca.id, attributeId: attrColorTapa.id, sortOrder: 5 },
  ];
  for (const axis of taparroscaAxes) {
    await prisma.productAttributeLine.upsert({
      where: { productId_attributeId: { productId: axis.productId, attributeId: axis.attributeId } },
      update: {},
      create: axis,
    });
  }
  console.log("- Ejes de Taparrosca creados (5 atributos)");

  // ------------------------------------------------------------------
  // 4. Configurar ProductPasso (pasos guiados para storefront)
  // ------------------------------------------------------------------
  console.log("\n=== Configurando passos (ProductPasso) ===");

  await prisma.productPasso.deleteMany({ where: { productId: taparrosca.id } });

  const passos = [
    {
      productId: taparrosca.id,
      variantProductId: vastago.id,
      sortOrder: 1,
      pregunta: "¿Qué tamaño de rosca necesitas?",
      attributeId: attrTamanoRosca.id,
      isQtyStep: false,
    },
    {
      productId: taparrosca.id,
      variantProductId: vastago.id,
      sortOrder: 2,
      pregunta: "¿Qué altura de vastago prefieres?",
      attributeId: attrAlturaVastago.id,
      isQtyStep: false,
    },
    {
      productId: taparrosca.id,
      variantProductId: vastago.id,
      sortOrder: 3,
      pregunta: "¿Qué tipo de agujero tiene el vastago?",
      attributeId: attrAgujeroVastago.id,
      isQtyStep: false,
    },
    {
      productId: taparrosca.id,
      variantProductId: pincel.id,
      sortOrder: 4,
      pregunta: "¿Qué forma de tapa prefieres?",
      attributeId: attrFormaTapa.id,
      isQtyStep: false,
    },
    {
      productId: taparrosca.id,
      variantProductId: taparrosca.id,
      sortOrder: 5,
      pregunta: "¿De qué color quieres la tapa?",
      attributeId: attrColorTapa.id,
      isQtyStep: false,
    },
    {
      productId: taparrosca.id,
      variantProductId: taparrosca.id,
      sortOrder: 6,
      pregunta: "¿Cuántas unidades necesitas?",
      attributeId: null,
      isQtyStep: true,
    },
  ];

  for (const passo of passos) {
    await prisma.productPasso.create({ data: passo });
  }
  console.log("- 6 passos creados para Taparrosca");

  // ------------------------------------------------------------------
  // 5. Configurar ProductComponent (BOM)
  // ------------------------------------------------------------------
  console.log("\n=== Configurando BOM (ProductComponent) ===");

  await prisma.productComponent.deleteMany({ where: { productId: vastago.id } });
  await prisma.productComponent.deleteMany({ where: { productId: pincel.id } });
  await prisma.productComponent.deleteMany({ where: { productId: taparrosca.id } });
  console.log("- Limpiado BOM existente");

  // Vástago: sin componentes (producto base)
  console.log("- Vástago: sin BOM (producto base)");

  // Pincel: Vástago (componente exacto) + Cerda (consumible)
  await prisma.productComponent.upsert({
    where: { productId_componentId: { productId: pincel.id, componentId: vastago.id } },
    update: {},
    create: { productId: pincel.id, componentId: vastago.id, cantidad: 1, tipo: "exacto" },
  });
  await prisma.productComponent.upsert({
    where: { productId_componentId: { productId: pincel.id, componentId: cerda.id } },
    update: {},
    create: { productId: pincel.id, componentId: cerda.id, cantidad: 1, tipo: "consumible" },
  });
  console.log("- Pincel: Vástago (exacto) + Cerda (consumible)");

  // Taparrosca: Pincel (exacto) + Vástago (exacto)
  await prisma.productComponent.upsert({
    where: { productId_componentId: { productId: taparrosca.id, componentId: pincel.id } },
    update: {},
    create: { productId: taparrosca.id, componentId: pincel.id, cantidad: 1, tipo: "exacto" },
  });
  await prisma.productComponent.upsert({
    where: { productId_componentId: { productId: taparrosca.id, componentId: vastago.id } },
    update: {},
    create: { productId: taparrosca.id, componentId: vastago.id, cantidad: 1, tipo: "exacto" },
  });
  console.log("- Taparrosca: Pincel (exacto) + Vástago (exacto)");

  console.log("\n=== Estructura de productos configurada ===");
  console.log("Ahora puedes materializar variantes manualmente desde el admin.");
}

setupProducts()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
