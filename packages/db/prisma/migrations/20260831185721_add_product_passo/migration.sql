/*
  Warnings:

  - You are about to drop the column `createdAt` on the `ManufacturingOrder` table. All the data in the column will be lost.
  - You are about to drop the column `updatedAt` on the `ManufacturingOrder` table. All the data in the column will be lost.

*/
-- AlterEnum
ALTER TYPE "Uom" ADD VALUE 'kg';

-- DropForeignKey
ALTER TABLE "ManufacturingOrder" DROP CONSTRAINT "ManufacturingOrder_salesOrderLineId_fkey";

-- AlterTable
ALTER TABLE "ManufacturingOrder" DROP COLUMN "createdAt",
DROP COLUMN "updatedAt";

-- CreateTable
CREATE TABLE "ProductPasso" (
    "id" SERIAL NOT NULL,
    "productId" INTEGER NOT NULL,
    "variantProductId" INTEGER,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "pregunta" TEXT NOT NULL,
    "attributeId" INTEGER,
    "isQtyStep" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "ProductPasso_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProductPasso_productId_idx" ON "ProductPasso"("productId");

-- AddForeignKey
ALTER TABLE "ProductPasso" ADD CONSTRAINT "ProductPasso_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductPasso" ADD CONSTRAINT "ProductPasso_attributeId_fkey" FOREIGN KEY ("attributeId") REFERENCES "Attribute"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManufacturingOrder" ADD CONSTRAINT "ManufacturingOrder_salesOrderLineId_fkey" FOREIGN KEY ("salesOrderLineId") REFERENCES "SalesOrderLine"("id") ON DELETE SET NULL ON UPDATE CASCADE;
