-- DropForeignKey
ALTER TABLE "ManufacturingOrder" DROP CONSTRAINT "ManufacturingOrder_salesOrderLineId_fkey";

-- DropForeignKey
ALTER TABLE "ManufacturingOrder" DROP CONSTRAINT "ManufacturingOrder_variantId_fkey";

-- DropForeignKey
ALTER TABLE "ManufacturingOrderLine" DROP CONSTRAINT "ManufacturingOrderLine_componentVariantId_fkey";

-- DropForeignKey
ALTER TABLE "ManufacturingOrderLine" DROP CONSTRAINT "ManufacturingOrderLine_orderId_fkey";

-- DropForeignKey
ALTER TABLE "ProductionReport" DROP CONSTRAINT "ProductionReport_manufacturingOrderId_fkey";

-- AlterTable
ALTER TABLE "ProductionReport" DROP COLUMN "manufacturingOrderId";

-- DropTable
DROP TABLE "ManufacturingOrder";

-- DropTable
DROP TABLE "ManufacturingOrderLine";

-- DropEnum
DROP TYPE "EstadoOF";

-- DropEnum
DROP TYPE "OrigenOF";

-- DropEnum
DROP TYPE "TipoOF";
