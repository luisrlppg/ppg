-- CreateEnum
CREATE TYPE "Prioridad" AS ENUM ('alta', 'media', 'baja');

-- AlterTable
ALTER TABLE "ProductVariant" ADD COLUMN "prioridad" "Prioridad" NOT NULL DEFAULT 'baja';

-- CreateIndex
CREATE INDEX "ProductVariant_prioridad_idx" ON "ProductVariant"("prioridad");
