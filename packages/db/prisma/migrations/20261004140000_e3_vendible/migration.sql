-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "vendible" BOOLEAN NOT NULL DEFAULT false;

-- Backfill: los productos que hoy tienen pasos guiados ya se venden en el modal de Ventas.
UPDATE "Product" SET "vendible" = true
WHERE id IN (SELECT DISTINCT "productId" FROM "ProductPasso");

-- AlterTable
ALTER TABLE "ProductVariant" DROP COLUMN "published";
