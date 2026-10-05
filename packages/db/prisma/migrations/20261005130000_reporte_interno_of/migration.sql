-- AlterEnum
ALTER TYPE "SeccionProduccion" ADD VALUE 'fabricacion';

-- AlterTable
ALTER TABLE "ProductionReport" ADD COLUMN     "interno" BOOLEAN NOT NULL DEFAULT false;
