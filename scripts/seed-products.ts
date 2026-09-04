import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function setupProducts() {
  console.log("=== Configurando estructura de productos (sin variantes) ===\n");

  // ------------------------------------------------------------------
  // 1. Buscar productos existentes
  // ------------------------------------------------------------------
  const vastago = await prisma.product.findUnique({ where: { skuBase: "VAST" } });
  const pincel = await prisma.product.findUnique({ where: { skuBase: "PIN" } });
  const taparroscaConPincel = await prisma.product.findUnique({ where: { skuBase: "TP" } });
  const taparrosca = await prisma.product.findUnique({ where: { skuBase: "TPR" } });
  const cerda = await prisma.product.findUnique({ where: { skuBase: "CERD" } });

  if (!vastago || !pincel || !taparroscaConPincel || !taparrosca || !cerda) {
    console.error("ERROR: No se encontraron todos los productos. Ejecuta el seed primero.");
    console.log({ vastago: !!vastago, pincel: !!pincel, taparroscaConPincel: !!taparroscaConPincel, taparrosca: !!taparrosca, cerda: !!cerda });
    process.exit(1);
  }
  console.log("Productos encontrados:");
  console.log(`  Vástago:  ID=${vastago.id}`);
  console.log(`  Pincel:   ID=${pincel.id}`);
  console.log(`  Taparrosca: ID=${taparrosca.id}`);
  console.log(`  Taparrosca con Pincel: ID=${taparroscaConPincel.id}`);
  console.log(`  Cerda:    ID=${cerda.id}`);

  // ------------------------------------------------------------------
  // 2. Buscar atributos por nombre
  // ------------------------------------------------------------------
  const attrTamanoRosca = await prisma.attribute.findUnique({ where: { nombre: "Tamaño rosca" } });
  const attrAlturaVastago = await prisma.attribute.findUnique({ where: { nombre: "Altura vastago" } });
  const attrAgujeroVastago = await prisma.attribute.findUnique({ where: { nombre: "Agujero vastago" } });
  const attrFormaTapa = await prisma.attribute.findUnique({ where: { nombre: "Forma tapa" } });
  const attrColorTapa = await prisma.attribute.findUnique({ where: { nombre: "Color tapa" } });
  const attrColorCerda = await prisma.attribute.findUnique({ where: { nombre: "Color de cerda" } });

  console.log("\nAtributos encontrados:");
  console.log(`  Tamaño rosca:   ID=${attrTamanoRosca?.id}`);
  console.log(`  Altura vastago: ID=${attrAlturaVastago?.id}`);
  console.log(`  Agujero vastago: ID=${attrAgujeroVastago?.id}`);
  console.log(`  Forma tapa:    ID=${attrFormaTapa?.id}`);
  console.log(`  Color tapa:    ID=${attrColorTapa?.id}`);
  console.log(`  Color de cerda: ID=${attrColorCerda?.id}`);

  if (!attrTamanoRosca || !attrAlturaVastago || !attrAgujeroVastago || !attrFormaTapa || !attrColorTapa || !attrColorCerda) {
    console.error("ERROR: Faltan atributos. Ejecuta el seed primero.");
    process.exit(1);
  }

  // ------------------------------------------------------------------
  // 3. Configurar ProductAttributeLine (ejes) para Taparrosca
  // ------------------------------------------------------------------
  console.log("\n=== Configurando ejes (ProductAttributeLine) ===");

  // Eliminar ejes existentes de Taparrosca con Pincel
  await prisma.productAttributeLine.deleteMany({ where: { productId: taparroscaConPincel.id } });
  console.log("- Limpiados ejes existentes de Taparrosca con Pincel");

  // Ejes de Taparrosca con Pincel: los 5 atributos nuevos
  const taparroscaAxes = [
    { productId: taparroscaConPincel.id, attributeId: attrTamanoRosca.id, sortOrder: 1 },
    { productId: taparroscaConPincel.id, attributeId: attrAlturaVastago.id, sortOrder: 2 },
    { productId: taparroscaConPincel.id, attributeId: attrAgujeroVastago.id, sortOrder: 3 },
    { productId: taparroscaConPincel.id, attributeId: attrFormaTapa.id, sortOrder: 4 },
    { productId: taparroscaConPincel.id, attributeId: attrColorTapa.id, sortOrder: 5 },
  ];
  for (const axis of taparroscaAxes) {
    await prisma.productAttributeLine.upsert({
      where: { productId_attributeId: { productId: axis.productId, attributeId: axis.attributeId } },
      update: {},
      create: axis,
    });
  }
  console.log("- Ejes de Taparrosca con Pincel creados (5 atributos)");

  // ------------------------------------------------------------------
  // 4. Configurar ProductPasso (pasos guiados para storefront)
  // ------------------------------------------------------------------
  console.log("\n=== Configurando passos (ProductPasso) ===");

  await prisma.productPasso.deleteMany({ where: { productId: taparroscaConPincel.id } });

  const passos = [
    {
      productId: taparroscaConPincel.id,
      variantProductId: vastago.id,
      sortOrder: 1,
      pregunta: "¿Qué tamaño de rosca necesitas?",
      attributeId: attrTamanoRosca.id,
      isQtyStep: false,
    },
    {
      productId: taparroscaConPincel.id,
      variantProductId: vastago.id,
      sortOrder: 2,
      pregunta: "¿Qué altura de vastago prefieres?",
      attributeId: attrAlturaVastago.id,
      isQtyStep: false,
    },
    {
      productId: taparroscaConPincel.id,
      variantProductId: vastago.id,
      sortOrder: 3,
      pregunta: "¿Qué tipo de agujero tiene el vastago?",
      attributeId: attrAgujeroVastago.id,
      isQtyStep: false,
    },
    {
      productId: taparroscaConPincel.id,
      variantProductId: pincel.id,
      sortOrder: 4,
      pregunta: "¿Qué forma de tapa prefieres?",
      attributeId: attrFormaTapa.id,
      isQtyStep: false,
    },
    {
      productId: taparroscaConPincel.id,
      variantProductId: taparroscaConPincel.id,
      sortOrder: 5,
      pregunta: "¿De qué color quieres la tapa?",
      attributeId: attrColorTapa.id,
      isQtyStep: false,
    },
    {
      productId: taparroscaConPincel.id,
      variantProductId: taparroscaConPincel.id,
      sortOrder: 6,
      pregunta: "¿Cuántas unidades necesitas?",
      attributeId: null,
      isQtyStep: true,
    },
  ];

  for (const passo of passos) {
    await prisma.productPasso.create({ data: passo });
  }
  console.log("- 6 passos creados para Taparrosca con Pincel");

  // ------------------------------------------------------------------
  // 5. Configurar ProductComponent (BOM)
  // ------------------------------------------------------------------
  console.log("\n=== Configurando BOM (ProductComponent) ===");

  await prisma.productComponent.deleteMany({ where: { productId: vastago.id } });
  await prisma.productComponent.deleteMany({ where: { productId: taparrosca.id } });
  await prisma.productComponent.deleteMany({ where: { productId: pincel.id } });
  await prisma.productComponent.deleteMany({ where: { productId: taparroscaConPincel.id } });
  console.log("- Limpiado BOM existente");

  // Vástago: sin componentes (producto base)
  console.log("- Vástago: sin BOM (producto base)");

  // Taparrosca (tapa): sin componentes (producto base)
  console.log("- Taparrosca: sin BOM (producto base)");

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

  // Taparrosca con Pincel: Pincel (exacto) + Taparrosca (exacto)
  await prisma.productComponent.upsert({
    where: { productId_componentId: { productId: taparroscaConPincel.id, componentId: pincel.id } },
    update: {},
    create: { productId: taparroscaConPincel.id, componentId: pincel.id, cantidad: 1, tipo: "exacto" },
  });
  await prisma.productComponent.upsert({
    where: { productId_componentId: { productId: taparroscaConPincel.id, componentId: taparrosca.id } },
    update: {},
    create: { productId: taparroscaConPincel.id, componentId: taparrosca.id, cantidad: 1, tipo: "exacto" },
  });
  console.log("- Taparrosca con Pincel: Pincel (exacto) + Taparrosca (exacto)");

  console.log("\n=== Estructura de productos configurada ===");
  console.log("Ahora puedes materializar variantes manualmente desde el admin.");

  // ======================================================================
  // BTVPE: Productos tipo envase para rimel, delineador, lip gloss
  // ======================================================================
  console.log("\n\n=== Configurando productos BTVPE ===");

  // ------------------------------------------------------------------
  // B.1 Buscar componentes BTVPE
  // ------------------------------------------------------------------
  const botella = await prisma.product.findUnique({ where: { skuBase: "BOT" } });
  const vastagoBtvpe = await prisma.product.findUnique({ where: { skuBase: "VST" } });
  const sobretapa = await prisma.product.findUnique({ where: { skuBase: "STP" } });
  const escurridor = await prisma.product.findUnique({ where: { skuBase: "ESC" } });
  const cepilloSilicon = await prisma.product.findUnique({ where: { skuBase: "CSI" } });
  const cepilloNylon = await prisma.product.findUnique({ where: { skuBase: "CNI" } });
  const delineador = await prisma.product.findUnique({ where: { skuBase: "DPL" } });
  const tratamientoNoche = await prisma.product.findUnique({ where: { skuBase: "TRN" } });
  const lipGloss = await prisma.product.findUnique({ where: { skuBase: "LGL" } });

  // Productos BTVPE vendidos
  const btvpeS = await prisma.product.findUnique({ where: { skuBase: "BTVPE-S" } });
  const btvpeN = await prisma.product.findUnique({ where: { skuBase: "BTVPE-N" } });
  const btvpeD = await prisma.product.findUnique({ where: { skuBase: "BTVPE-D" } });
  const btvpeTN = await prisma.product.findUnique({ where: { skuBase: "BTVPE-TN" } });
  const btvpeLG = await prisma.product.findUnique({ where: { skuBase: "BTVPE-LG" } });

  console.log("\nComponentes BTVPE encontrados:");
  console.log(`  Botella: ID=${botella?.id}`);
  console.log(`  Vástago: ID=${vastagoBtvpe?.id}`);
  console.log(`  Sobretapa: ID=${sobretapa?.id}`);
  console.log(`  Escurridor: ID=${escurridor?.id}`);
  console.log(`  Cepillo Silicon: ID=${cepilloSilicon?.id}`);
  console.log(`  Cepillo Nylon: ID=${cepilloNylon?.id}`);
  console.log(`  Delineador: ID=${delineador?.id}`);
  console.log(`  Tratamiento Noche: ID=${tratamientoNoche?.id}`);
  console.log(`  Lip Gloss: ID=${lipGloss?.id}`);

  console.log("\nProductos BTVPE vendidos:");
  console.log(`  BTVPE-S (Rimel Silicon): ID=${btvpeS?.id}`);
  console.log(`  BTVPE-N (Rimel Nylon): ID=${btvpeN?.id}`);
  console.log(`  BTVPE-D (Delineador): ID=${btvpeD?.id}`);
  console.log(`  BTVPE-TN (Tratamiento Noche): ID=${btvpeTN?.id}`);
  console.log(`  BTVPE-LG (Lip Gloss): ID=${btvpeLG?.id}`);

  if (!botella || !vastagoBtvpe || !sobretapa || !escurridor || !cepilloSilicon || !cepilloNylon || !delineador || !tratamientoNoche || !lipGloss || !btvpeS || !btvpeN || !btvpeD || !btvpeTN || !btvpeLG) {
    console.error("ERROR: Faltan productos BTVPE. Ejecuta el seed primero.");
    process.exit(1);
  }

  // ------------------------------------------------------------------
  // B.2 Buscar atributos BTVPE
  // ------------------------------------------------------------------
  const attrBotella = await prisma.attribute.findUnique({ where: { nombre: "Botella" } });
  const attrForma = await prisma.attribute.findUnique({ where: { nombre: "Forma" } });
  const attrDiametro = await prisma.attribute.findUnique({ where: { nombre: "Diámetro" } });
  const attrColorBotella = await prisma.attribute.findUnique({ where: { nombre: "Color Botella" } });
  const attrColorVastago = await prisma.attribute.findUnique({ where: { nombre: "Color Vástago" } });
  const attrColorSobretapa = await prisma.attribute.findUnique({ where: { nombre: "Color Sobretapa" } });
  const attrColorEscurridor = await prisma.attribute.findUnique({ where: { nombre: "Color Escurridor" } });
  const attrColorCepillo = await prisma.attribute.findUnique({ where: { nombre: "Color Cepillo" } });

  console.log("\nAtributos BTVPE encontrados:");
  console.log(`  Botella: ID=${attrBotella?.id}`);
  console.log(`  Forma: ID=${attrForma?.id}`);
  console.log(`  Diámetro: ID=${attrDiametro?.id}`);
  console.log(`  Color Botella: ID=${attrColorBotella?.id}`);
  console.log(`  Color Vástago: ID=${attrColorVastago?.id}`);
  console.log(`  Color Sobretapa: ID=${attrColorSobretapa?.id}`);
  console.log(`  Color Escurridor: ID=${attrColorEscurridor?.id}`);
  console.log(`  Color Cepillo: ID=${attrColorCepillo?.id}`);

  if (!attrBotella || !attrForma || !attrDiametro || !attrColorBotella || !attrColorVastago || !attrColorSobretapa || !attrColorEscurridor || !attrColorCepillo) {
    console.error("ERROR: Faltan atributos BTVPE. Ejecuta el seed primero.");
    process.exit(1);
  }

  // ------------------------------------------------------------------
  // B.3 Configurar BOM (ProductComponent) para cada BTVPE
  // ------------------------------------------------------------------
  console.log("\n=== Configurando BOM BTVPE ===");

  const btvpeProducts = [btvpeS, btvpeN, btvpeD, btvpeTN, btvpeLG];
  const btvpePunts = [cepilloSilicon, cepilloNylon, delineador, tratamientoNoche, lipGloss];
  const btvpeNames = ["BTVPE-S", "BTVPE-N", "BTVPE-D", "BTVPE-TN", "BTVPE-LG"];

  for (let i = 0; i < btvpeProducts.length; i++) {
    const product = btvpeProducts[i];
    const punta = btvpePunts[i];
    const name = btvpeNames[i];

    await prisma.productComponent.deleteMany({ where: { productId: product.id } });

    const allComponents = [
      { componentId: vastagoBtvpe.id, cantidad: 1, tipo: "exacto" as const },
      { componentId: botella.id, cantidad: 1, tipo: "exacto" as const },
      { componentId: sobretapa.id, cantidad: 1, tipo: "exacto" as const },
      { componentId: escurridor.id, cantidad: 1, tipo: "exacto" as const },
      { componentId: punta.id, cantidad: 1, tipo: "exacto" as const },
    ];

    for (const comp of allComponents) {
      await prisma.productComponent.upsert({
        where: { productId_componentId: { productId: product.id, componentId: comp.componentId } },
        update: {},
        create: { productId: product.id, componentId: comp.componentId, cantidad: comp.cantidad, tipo: comp.tipo },
      });
    }
    console.log(`- ${name}: Vástago + Botella + Sobretapa + Escurridor + Punta`);
  }

  // ------------------------------------------------------------------
  // B.4 Configurar ejes (ProductAttributeLine) de COMPONENTES
  // (necesarios para que resolveComponentVariant iguale color por componente)
  // ------------------------------------------------------------------
  console.log("\n=== Configurando ejes de componentes BTVPE ===");

  const componentAxes: { productId: number; attributeId: number; sortOrder: number }[] = [];
  const pushComp = (p: typeof botella, axes: number[]) => {
    if (!p) return;
    axes.forEach((attributeId, i) => componentAxes.push({ productId: p.id, attributeId, sortOrder: i + 1 }));
  };

  // Botella: capacidad + color + rosca (el escurridor se casa por rosca)
  pushComp(botella, [attrBotella.id, attrColorBotella.id, attrTamanoRosca.id]);
  // Vástago: rosca + altura + color
  pushComp(vastagoBtvpe, [attrTamanoRosca.id, attrAlturaVastago.id, attrColorVastago.id]);
  // Sobretapa: rosca (diámetro) + forma tapa + color
  pushComp(sobretapa, [attrTamanoRosca.id, attrFormaTapa.id, attrColorSobretapa.id]);
  // Escurridor: rosca + color
  pushComp(escurridor, [attrTamanoRosca.id, attrColorEscurridor.id]);
  // Cepillos: forma + color
  pushComp(cepilloSilicon, [attrForma.id, attrColorCepillo.id]);
  pushComp(cepilloNylon, [attrForma.id, attrColorCepillo.id]);

  for (const axis of componentAxes) {
    await prisma.productAttributeLine.upsert({
      where: { productId_attributeId: { productId: axis.productId, attributeId: axis.attributeId } },
      update: {},
      create: axis,
    });
  }
  console.log("- Ejes de componentes configurados (Botella, Vástago, Sobretapa, Escurridor, Cepillos)");

  // ------------------------------------------------------------------
  // B.5 Configurar ejes (ProductAttributeLine) de los BTVPE (grid)
  // ------------------------------------------------------------------
  console.log("\n=== Configurando ejes BTVPE ===");

  const commonBtpeAxes = [
    attrBotella.id,              // Botella (capacidad)
    attrColorBotella.id,         // Color botella
    attrTamanoRosca.id,          // Tamaño rosca (derivado, no paso)
    attrAlturaVastago.id,        // Altura vástago
    attrColorVastago.id,         // Color vástago
    attrFormaTapa.id,            // Forma tapa (sobretapa)
    attrColorSobretapa.id,       // Color sobretapa
    attrColorEscurridor.id,      // Color escurridor
  ];

  const btvpeAxes: { productId: number; name: string; axes: number[] }[] = [
    { productId: btvpeS.id, name: "BTVPE-S", axes: [attrForma.id, attrColorCepillo.id, ...commonBtpeAxes] },
    { productId: btvpeN.id, name: "BTVPE-N", axes: [attrForma.id, attrColorCepillo.id, ...commonBtpeAxes] },
    { productId: btvpeD.id, name: "BTVPE-D", axes: [...commonBtpeAxes] },
    { productId: btvpeTN.id, name: "BTVPE-TN", axes: [...commonBtpeAxes] },
    { productId: btvpeLG.id, name: "BTVPE-LG", axes: [attrDiametro.id, ...commonBtpeAxes] },
  ];

  for (const b of btvpeAxes) {
    await prisma.productAttributeLine.deleteMany({ where: { productId: b.productId } });
    for (let i = 0; i < b.axes.length; i++) {
      const attributeId = b.axes[i];
      await prisma.productAttributeLine.upsert({
        where: { productId_attributeId: { productId: b.productId, attributeId } },
        update: {},
        create: { productId: b.productId, attributeId, sortOrder: i + 1 },
      });
    }
  }
  console.log("- Ejes de BTVPE configurados (grid)");

  // ------------------------------------------------------------------
  // B.6 Configurar pasos guiados (ProductPasso) para cada BTVPE
  // Pares [característica, color] consecutivos por componente.
  // ------------------------------------------------------------------
  console.log("\n=== Configurando pasos guiados BTVPE ===");

  const pasosComponente = (p: { id: number }, c: { id: number }, s: number, pre: string, attrId: number, attrColor?: number, colorPregunta?: string, colorColor?: { id: number }) => {
    const passos = [
      { productId: p.id, variantProductId: c.id, sortOrder: s, pregunta: pre, attributeId: attrId, isQtyStep: false },
    ];
    if (attrColor && colorColor) {
      passos.push({ productId: p.id, variantProductId: colorColor.id, sortOrder: s + 1, pregunta: colorPregunta ?? `¿De qué color quieres este componente?`, attributeId: attrColor, isQtyStep: false });
    }
    return passos;
  };

  // --- BTVPE-S (Rimel Silicon): cepillo silicon forma+color, botella, vástago, tapa, escurridor
  await prisma.productPasso.deleteMany({ where: { productId: btvpeS.id } });
  const btvpeSPassos = [
    ...pasosComponente(btvpeS, cepilloSilicon, 1, "¿Qué forma de cepillo prefieres?", attrForma.id, attrColorCepillo.id, "¿De qué color quieres el cepillo?", cepilloSilicon),
    ...pasosComponente(btvpeS, botella, 3, "¿Qué botella prefieres?", attrBotella.id, attrColorBotella.id, "¿De qué color quieres la botella?", botella),
    ...pasosComponente(btvpeS, vastagoBtvpe, 5, "¿Qué altura de vástago prefieres?", attrAlturaVastago.id, attrColorVastago.id, "¿De qué color quieres el vástago?", vastagoBtvpe),
    ...pasosComponente(btvpeS, sobretapa, 7, "¿Qué forma de tapa prefieres?", attrFormaTapa.id, attrColorSobretapa.id, "¿De qué color quieres la tapa?", sobretapa),
    { productId: btvpeS.id, variantProductId: escurridor.id, sortOrder: 9, pregunta: "¿De qué color quieres el escurridor?", attributeId: attrColorEscurridor.id, isQtyStep: false },
    { productId: btvpeS.id, variantProductId: btvpeS.id, sortOrder: 10, pregunta: "¿Cuántas unidades necesitas?", attributeId: null, isQtyStep: true },
  ];
  for (const passo of btvpeSPassos) {
    await prisma.productPasso.create({ data: passo });
  }
  console.log("- BTVPE-S: pasos configurados (cepillo, botella, vástago, tapa, escurridor)");

  // --- BTVPE-N (Rimel Nylon): cepillo nylon forma+color, botella, vástago, tapa, escurridor
  await prisma.productPasso.deleteMany({ where: { productId: btvpeN.id } });
  const btvpeNPassos = [
    ...pasosComponente(btvpeN, cepilloNylon, 1, "¿Qué forma de cepillo prefieres?", attrForma.id, attrColorCepillo.id, "¿De qué color quieres el cepillo?", cepilloNylon),
    ...pasosComponente(btvpeN, botella, 3, "¿Qué botella prefieres?", attrBotella.id, attrColorBotella.id, "¿De qué color quieres la botella?", botella),
    ...pasosComponente(btvpeN, vastagoBtvpe, 5, "¿Qué altura de vástago prefieres?", attrAlturaVastago.id, attrColorVastago.id, "¿De qué color quieres el vástago?", vastagoBtvpe),
    ...pasosComponente(btvpeN, sobretapa, 7, "¿Qué forma de tapa prefieres?", attrFormaTapa.id, attrColorSobretapa.id, "¿De qué color quieres la tapa?", sobretapa),
    { productId: btvpeN.id, variantProductId: escurridor.id, sortOrder: 9, pregunta: "¿De qué color quieres el escurridor?", attributeId: attrColorEscurridor.id, isQtyStep: false },
    { productId: btvpeN.id, variantProductId: btvpeN.id, sortOrder: 10, pregunta: "¿Cuántas unidades necesitas?", attributeId: null, isQtyStep: true },
  ];
  for (const passo of btvpeNPassos) {
    await prisma.productPasso.create({ data: passo });
  }
  console.log("- BTVPE-N: pasos configurados (cepillo, botella, vástago, tapa, escurridor)");

  // --- BTVPE-D (Delineador): sin punta en wizard; botella, vástago, tapa, escurridor
  await prisma.productPasso.deleteMany({ where: { productId: btvpeD.id } });
  const btvpeDPassos = [
    ...pasosComponente(btvpeD, botella, 1, "¿Qué botella prefieres?", attrBotella.id, attrColorBotella.id, "¿De qué color quieres la botella?", botella),
    ...pasosComponente(btvpeD, vastagoBtvpe, 3, "¿Qué altura de vástago prefieres?", attrAlturaVastago.id, attrColorVastago.id, "¿De qué color quieres el vástago?", vastagoBtvpe),
    ...pasosComponente(btvpeD, sobretapa, 5, "¿Qué forma de tapa prefieres?", attrFormaTapa.id, attrColorSobretapa.id, "¿De qué color quieres la tapa?", sobretapa),
    { productId: btvpeD.id, variantProductId: escurridor.id, sortOrder: 7, pregunta: "¿De qué color quieres el escurridor?", attributeId: attrColorEscurridor.id, isQtyStep: false },
    { productId: btvpeD.id, variantProductId: btvpeD.id, sortOrder: 8, pregunta: "¿Cuántas unidades necesitas?", attributeId: null, isQtyStep: true },
  ];
  for (const passo of btvpeDPassos) {
    await prisma.productPasso.create({ data: passo });
  }
  console.log("- BTVPE-D: pasos configurados (botella, vástago, tapa, escurridor)");

  // --- BTVPE-TN (Tratamiento Noche): igual que BTVPE-D
  await prisma.productPasso.deleteMany({ where: { productId: btvpeTN.id } });
  const btvpeTNPassos = [
    ...pasosComponente(btvpeTN, botella, 1, "¿Qué botella prefieres?", attrBotella.id, attrColorBotella.id, "¿De qué color quieres la botella?", botella),
    ...pasosComponente(btvpeTN, vastagoBtvpe, 3, "¿Qué altura de vástago prefieres?", attrAlturaVastago.id, attrColorVastago.id, "¿De qué color quieres el vástago?", vastagoBtvpe),
    ...pasosComponente(btvpeTN, sobretapa, 5, "¿Qué forma de tapa prefieres?", attrFormaTapa.id, attrColorSobretapa.id, "¿De qué color quieres la tapa?", sobretapa),
    { productId: btvpeTN.id, variantProductId: escurridor.id, sortOrder: 7, pregunta: "¿De qué color quieres el escurridor?", attributeId: attrColorEscurridor.id, isQtyStep: false },
    { productId: btvpeTN.id, variantProductId: btvpeTN.id, sortOrder: 8, pregunta: "¿Cuántas unidades necesitas?", attributeId: null, isQtyStep: true },
  ];
  for (const passo of btvpeTNPassos) {
    await prisma.productPasso.create({ data: passo });
  }
  console.log("- BTVPE-TN: pasos configurados (botella, vástago, tapa, escurridor)");

  // --- BTVPE-LG (Lip Gloss): punta diámetro (sin color), botella, vástago, tapa, escurridor
  await prisma.productPasso.deleteMany({ where: { productId: btvpeLG.id } });
  const btvpeLGPassos = [
    { productId: btvpeLG.id, variantProductId: lipGloss.id, sortOrder: 1, pregunta: "¿Qué diámetro de punta prefieres?", attributeId: attrDiametro.id, isQtyStep: false },
    ...pasosComponente(btvpeLG, botella, 2, "¿Qué botella prefieres?", attrBotella.id, attrColorBotella.id, "¿De qué color quieres la botella?", botella),
    ...pasosComponente(btvpeLG, vastagoBtvpe, 4, "¿Qué altura de vástago prefieres?", attrAlturaVastago.id, attrColorVastago.id, "¿De qué color quieres el vástago?", vastagoBtvpe),
    ...pasosComponente(btvpeLG, sobretapa, 6, "¿Qué forma de tapa prefieres?", attrFormaTapa.id, attrColorSobretapa.id, "¿De qué color quieres la tapa?", sobretapa),
    { productId: btvpeLG.id, variantProductId: escurridor.id, sortOrder: 8, pregunta: "¿De qué color quieres el escurridor?", attributeId: attrColorEscurridor.id, isQtyStep: false },
    { productId: btvpeLG.id, variantProductId: btvpeLG.id, sortOrder: 9, pregunta: "¿Cuántas unidades necesitas?", attributeId: null, isQtyStep: true },
  ];
  for (const passo of btvpeLGPassos) {
    await prisma.productPasso.create({ data: passo });
  }
  console.log("- BTVPE-LG: pasos configurados (punta, botella, vástago, tapa, escurridor)");

  console.log("\n=== Productos BTVPE configurados ===");
}

setupProducts()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
