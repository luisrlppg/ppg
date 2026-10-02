-- CreateEnum
CREATE TYPE "OrigenOF" AS ENUM ('venta', 'manual', 'reposicion_minimo', 'reposicion_maximo');

-- AlterTable
ALTER TABLE "ManufacturingOrder" ADD COLUMN "origen" "OrigenOF" NOT NULL DEFAULT 'venta';
