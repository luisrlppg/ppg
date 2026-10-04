-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "fabricable" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "comprable" BOOLEAN NOT NULL DEFAULT false;

-- Backfill: preserva el comportamiento actual.
-- Fabricable = tiene BOM exacto; comprable = no tiene BOM exacto.
UPDATE "Product" SET "fabricable" = true
WHERE id IN (SELECT DISTINCT "productId" FROM "ProductComponent" WHERE "tipo" = 'exacto');

UPDATE "Product" SET "comprable" = true
WHERE id NOT IN (SELECT DISTINCT "productId" FROM "ProductComponent" WHERE "tipo" = 'exacto');
