-- CreateTable
CREATE TABLE "ProductCost" (
    "id" SERIAL NOT NULL,
    "productId" INTEGER NOT NULL,
    "costoCompra" DECIMAL(65,30),
    "horasManoObra" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "tarifaManoObra" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "horasMaquina" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "tarifaMaquina" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "costoMolde" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "piezasMolde" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "costoEnsamble" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "costoEmpaque" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "notas" TEXT,
    "updatedById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductCost_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductCostMaterial" (
    "id" SERIAL NOT NULL,
    "productCostId" INTEGER NOT NULL,
    "nombre" TEXT NOT NULL,
    "cantidad" DECIMAL(65,30) NOT NULL DEFAULT 1,
    "costoUnitario" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "orden" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ProductCostMaterial_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProductCost_productId_key" ON "ProductCost"("productId");

-- CreateIndex
CREATE INDEX "ProductCostMaterial_productCostId_idx" ON "ProductCostMaterial"("productCostId");

-- AddForeignKey
ALTER TABLE "ProductCost" ADD CONSTRAINT "ProductCost_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductCostMaterial" ADD CONSTRAINT "ProductCostMaterial_productCostId_fkey" FOREIGN KEY ("productCostId") REFERENCES "ProductCost"("id") ON DELETE CASCADE ON UPDATE CASCADE;
