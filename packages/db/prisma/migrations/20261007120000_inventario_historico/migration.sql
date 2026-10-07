-- CreateTable
CREATE TABLE "InventarioHistorico" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "sku" TEXT,
    "tipo" TEXT NOT NULL DEFAULT 'descontinuado',
    "cantidad" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "ubicacion" TEXT NOT NULL,
    "notas" TEXT,
    "familiaProductoId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InventarioHistorico_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventarioHistoricoAtributo" (
    "id" SERIAL NOT NULL,
    "itemId" INTEGER NOT NULL,
    "nombre" TEXT NOT NULL,
    "valor" TEXT NOT NULL,

    CONSTRAINT "InventarioHistoricoAtributo_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "InventarioHistorico_ubicacion_idx" ON "InventarioHistorico"("ubicacion");

-- CreateIndex
CREATE INDEX "InventarioHistorico_tipo_idx" ON "InventarioHistorico"("tipo");

-- CreateIndex
CREATE INDEX "InventarioHistorico_familiaProductoId_idx" ON "InventarioHistorico"("familiaProductoId");

-- CreateIndex
CREATE INDEX "InventarioHistoricoAtributo_nombre_idx" ON "InventarioHistoricoAtributo"("nombre");

-- CreateIndex
CREATE UNIQUE INDEX "InventarioHistoricoAtributo_itemId_nombre_key" ON "InventarioHistoricoAtributo"("itemId", "nombre");

-- AddForeignKey
ALTER TABLE "InventarioHistorico" ADD CONSTRAINT "InventarioHistorico_familiaProductoId_fkey" FOREIGN KEY ("familiaProductoId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventarioHistoricoAtributo" ADD CONSTRAINT "InventarioHistoricoAtributo_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "InventarioHistorico"("id") ON DELETE CASCADE ON UPDATE CASCADE;
