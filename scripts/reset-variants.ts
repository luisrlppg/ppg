import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function reset() {
  console.log("=== Limpiando variantes y relaciones ===");

  await prisma.stockMove.deleteMany({});
  console.log("- StockMove: OK");

  await prisma.stockLevel.deleteMany({});
  console.log("- StockLevel: OK");

  await prisma.variantPackaging.deleteMany({});
  console.log("- VariantPackaging: OK");

  await prisma.priceChange.deleteMany({});
  console.log("- PriceChange: OK");

  await prisma.manufacturingOrderLine.deleteMany({});
  console.log("- ManufacturingOrderLine: OK");

  await prisma.manufacturingOrder.deleteMany({});
  console.log("- ManufacturingOrder: OK");

  await prisma.productionReportLine.deleteMany({});
  console.log("- ProductionReportLine: OK");

  await prisma.productionReport.deleteMany({});
  console.log("- ProductionReport: OK");

  await prisma.salesOrderLine.deleteMany({});
  console.log("- SalesOrderLine: OK");

  await prisma.salesOrder.deleteMany({});
  console.log("- SalesOrder: OK");

  await prisma.variantAttribute.deleteMany({});
  console.log("- VariantAttribute: OK");

  await prisma.productVariant.deleteMany({});
  console.log("- ProductVariant: OK");

  await prisma.productAttributeLine.deleteMany({});
  console.log("- ProductAttributeLine: OK");

  await prisma.productPasso.deleteMany({});
  console.log("- ProductPasso: OK");

  await prisma.productComponent.deleteMany({});
  console.log("- ProductComponent: OK");

  console.log("\n=== Limpiando TODOS los atributos y valores (se recrearán desde seed) ===");

  await prisma.attributeValue.deleteMany({});
  console.log("- AttributeValue: ELIMINADOS");

  await prisma.attribute.deleteMany({});
  console.log("- Attribute: ELIMINADOS");

  console.log("\n=== Reset completo ===");
}

reset()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
