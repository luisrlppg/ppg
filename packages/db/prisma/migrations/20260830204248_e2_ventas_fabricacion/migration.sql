-- CreateEnum
CREATE TYPE "OrigenPedido" AS ENUM ('interno', 'web');

-- CreateEnum
CREATE TYPE "EstadoVenta" AS ENUM ('abierta', 'despachada', 'cancelada');

-- CreateEnum
CREATE TYPE "EstadoEntrega" AS ENUM ('pendiente', 'parcial', 'entregado');

-- CreateEnum
CREATE TYPE "TipoOF" AS ENUM ('fabricacion', 'ensamble');

-- CreateEnum
CREATE TYPE "EstadoOF" AS ENUM ('borrador', 'confirmada', 'en_progreso', 'hecha', 'cancelada');

-- CreateTable
CREATE TABLE "Partner" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "telefono" TEXT,
    "direccion" TEXT,
    "email" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Partner_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalesOrder" (
    "id" SERIAL NOT NULL,
    "numero" TEXT NOT NULL,
    "partnerId" INTEGER,
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fechaEntregaDeseada" TIMESTAMP(3),
    "estado" "EstadoVenta" NOT NULL DEFAULT 'abierta',
    "origen" "OrigenPedido" NOT NULL DEFAULT 'interno',
    "paymentMethod" TEXT,
    "nombreEnvio" TEXT,
    "telefonoEnvio" TEXT,
    "emailEnvio" TEXT,
    "notas" TEXT,
    "confirmadaAt" TIMESTAMP(3),
    "resumen" JSONB,
    "userId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SalesOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalesOrderLine" (
    "id" SERIAL NOT NULL,
    "orderId" INTEGER NOT NULL,
    "variantId" INTEGER NOT NULL,
    "cantidad" DECIMAL(65,30) NOT NULL,
    "precioUnitario" DECIMAL(65,30) NOT NULL,
    "qtyDelivered" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "estadoEntrega" "EstadoEntrega" NOT NULL DEFAULT 'pendiente',

    CONSTRAINT "SalesOrderLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ManufacturingOrder" (
    "id" SERIAL NOT NULL,
    "numero" TEXT NOT NULL,
    "variantId" INTEGER NOT NULL,
    "cantidad" DECIMAL(65,30) NOT NULL,
    "tipo" "TipoOF" NOT NULL,
    "estado" "EstadoOF" NOT NULL DEFAULT 'confirmada',
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notas" TEXT,
    "generatedFrom" TEXT,
    "finalizadoAt" TIMESTAMP(3),
    "userId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ManufacturingOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ManufacturingOrderLine" (
    "id" SERIAL NOT NULL,
    "orderId" INTEGER NOT NULL,
    "componentVariantId" INTEGER NOT NULL,
    "cantidadRequerida" DECIMAL(65,30) NOT NULL,
    "cantidadReservada" DECIMAL(65,30) NOT NULL DEFAULT 0,

    CONSTRAINT "ManufacturingOrderLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Partner_nombre_idx" ON "Partner"("nombre");

-- CreateIndex
CREATE UNIQUE INDEX "SalesOrder_numero_key" ON "SalesOrder"("numero");

-- CreateIndex
CREATE INDEX "SalesOrder_partnerId_idx" ON "SalesOrder"("partnerId");

-- CreateIndex
CREATE INDEX "SalesOrder_estado_idx" ON "SalesOrder"("estado");

-- CreateIndex
CREATE INDEX "SalesOrder_fecha_idx" ON "SalesOrder"("fecha");

-- CreateIndex
CREATE INDEX "SalesOrderLine_orderId_idx" ON "SalesOrderLine"("orderId");

-- CreateIndex
CREATE INDEX "SalesOrderLine_variantId_idx" ON "SalesOrderLine"("variantId");

-- CreateIndex
CREATE UNIQUE INDEX "ManufacturingOrder_numero_key" ON "ManufacturingOrder"("numero");

-- CreateIndex
CREATE INDEX "ManufacturingOrder_variantId_idx" ON "ManufacturingOrder"("variantId");

-- CreateIndex
CREATE INDEX "ManufacturingOrder_estado_idx" ON "ManufacturingOrder"("estado");

-- CreateIndex
CREATE INDEX "ManufacturingOrderLine_orderId_idx" ON "ManufacturingOrderLine"("orderId");

-- CreateIndex
CREATE INDEX "ManufacturingOrderLine_componentVariantId_idx" ON "ManufacturingOrderLine"("componentVariantId");

-- AddForeignKey
ALTER TABLE "SalesOrder" ADD CONSTRAINT "SalesOrder_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "Partner"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesOrderLine" ADD CONSTRAINT "SalesOrderLine_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "SalesOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesOrderLine" ADD CONSTRAINT "SalesOrderLine_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManufacturingOrder" ADD CONSTRAINT "ManufacturingOrder_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManufacturingOrderLine" ADD CONSTRAINT "ManufacturingOrderLine_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "ManufacturingOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManufacturingOrderLine" ADD CONSTRAINT "ManufacturingOrderLine_componentVariantId_fkey" FOREIGN KEY ("componentVariantId") REFERENCES "ProductVariant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
