-- AlterEnum
ALTER TYPE "TipoLineaReporte" ADD VALUE 'informativo';

-- AlterTable
ALTER TABLE "ProductionReportLine" ALTER COLUMN "variantId" DROP NOT NULL,
ADD COLUMN     "productoTexto" TEXT;
