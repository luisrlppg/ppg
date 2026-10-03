-- AlterTable
ALTER TABLE "Partner" ADD COLUMN "empresa" TEXT;

-- CreateIndex
CREATE INDEX "Partner_empresa_idx" ON "Partner"("empresa");
