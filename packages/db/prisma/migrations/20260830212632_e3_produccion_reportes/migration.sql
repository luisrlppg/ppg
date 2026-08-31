-- CreateEnum
CREATE TYPE "Turno" AS ENUM ('matutino', 'vespertino', 'nocturno');

-- CreateEnum
CREATE TYPE "SeccionProduccion" AS ENUM ('maquina1', 'maquina2', 'maquina3', 'ensamble', 'ensartado', 'pegado', 'perforado');

-- CreateEnum
CREATE TYPE "TipoLineaReporte" AS ENUM ('final', 'consumo');

-- CreateEnum
CREATE TYPE "EstadoReporte" AS ENUM ('pendiente', 'aplicado', 'cancelado');

-- AlterEnum
ALTER TYPE "MotivoStock" ADD VALUE 'ubicacion';

-- CreateTable
CREATE TABLE "ProductionReport" (
    "id" SERIAL NOT NULL,
    "numero" TEXT NOT NULL,
    "turno" "Turno" NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "personas" INTEGER NOT NULL DEFAULT 1,
    "horasTrabajadas" DECIMAL(65,30),
    "notas" TEXT,
    "estado" "EstadoReporte" NOT NULL DEFAULT 'pendiente',
    "aplicadoAt" TIMESTAMP(3),
    "userId" INTEGER,
    "manufacturingOrderId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductionReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductionReportLine" (
    "id" SERIAL NOT NULL,
    "reportId" INTEGER NOT NULL,
    "variantId" INTEGER NOT NULL,
    "seccion" "SeccionProduccion" NOT NULL,
    "tipo" "TipoLineaReporte" NOT NULL,
    "ok" DECIMAL(65,30) NOT NULL,
    "qtyAplicada" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "qtyUbicada" DECIMAL(65,30) NOT NULL DEFAULT 0,

    CONSTRAINT "ProductionReportLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProductionReport_numero_key" ON "ProductionReport"("numero");

-- CreateIndex
CREATE INDEX "ProductionReport_estado_idx" ON "ProductionReport"("estado");

-- CreateIndex
CREATE INDEX "ProductionReport_fecha_idx" ON "ProductionReport"("fecha");

-- CreateIndex
CREATE INDEX "ProductionReport_turno_idx" ON "ProductionReport"("turno");

-- CreateIndex
CREATE INDEX "ProductionReportLine_reportId_idx" ON "ProductionReportLine"("reportId");

-- CreateIndex
CREATE INDEX "ProductionReportLine_variantId_idx" ON "ProductionReportLine"("variantId");

-- AddForeignKey
ALTER TABLE "ProductionReport" ADD CONSTRAINT "ProductionReport_manufacturingOrderId_fkey" FOREIGN KEY ("manufacturingOrderId") REFERENCES "ManufacturingOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionReportLine" ADD CONSTRAINT "ProductionReportLine_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "ProductionReport"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionReportLine" ADD CONSTRAINT "ProductionReportLine_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
