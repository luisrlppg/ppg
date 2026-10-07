-- CreateEnum
CREATE TYPE "FuenteCostoValor" AS ENUM ('manual', 'bom', 'variante', 'formula');

-- AlterTable
ALTER TABLE "ProductCost" ADD COLUMN "formula" TEXT;

-- CreateTable
CREATE TABLE "ProductCostValor" (
    "id" SERIAL NOT NULL,
    "productCostId" INTEGER NOT NULL,
    "clave" TEXT NOT NULL,
    "etiqueta" TEXT NOT NULL,
    "fuente" "FuenteCostoValor" NOT NULL DEFAULT 'manual',
    "valor" DECIMAL(65,30),
    "opciones" JSONB,
    "orden" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ProductCostValor_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProductCostValor_productCostId_clave_key" ON "ProductCostValor"("productCostId", "clave");

-- CreateIndex
CREATE INDEX "ProductCostValor_productCostId_idx" ON "ProductCostValor"("productCostId");

-- AddForeignKey
ALTER TABLE "ProductCostValor" ADD CONSTRAINT "ProductCostValor_productCostId_fkey" FOREIGN KEY ("productCostId") REFERENCES "ProductCost"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Migración de datos: recetas legacy -> valores + fórmula equivalente.
-- El precio base vive en "Product.basePrice", no aquí.
-- ---------------------------------------------------------------------------

-- Valores fijos (siempre presentes) para conservar el total clásico.
INSERT INTO "ProductCostValor" ("productCostId", "clave", "etiqueta", "fuente", "valor", "orden")
SELECT pc.id, x.clave, x.etiqueta, 'manual', x.valor, x.orden
FROM "ProductCost" pc
CROSS JOIN LATERAL (
    VALUES
        ('precio_compra', 'Precio de compra', COALESCE(pc."costoCompra", 0)::numeric, 0),
        ('mano_obra', 'Mano de obra', (pc."horasManoObra" * pc."tarifaManoObra")::numeric, 1),
        ('maquina', 'Máquina', (pc."horasMaquina" * pc."tarifaMaquina")::numeric, 2),
        ('molde', 'Molde', (CASE WHEN pc."piezasMolde" > 0 THEN pc."costoMolde" / pc."piezasMolde" ELSE 0 END)::numeric, 3),
        ('ensamble', 'Ensamble', pc."costoEnsamble"::numeric, 4),
        ('empaque', 'Empaque', pc."costoEmpaque"::numeric, 5)
) AS x(clave, etiqueta, valor, orden);

-- Un valor por material legacy (cantidad × costo unitario).
INSERT INTO "ProductCostValor" ("productCostId", "clave", "etiqueta", "fuente", "valor", "orden")
SELECT m."productCostId",
       'material_' || sub.rn,
       m.nombre,
       'manual',
       (m.cantidad * m."costoUnitario")::numeric,
       100 + sub.rn
FROM "ProductCostMaterial" m
JOIN (
    SELECT id, row_number() OVER (PARTITION BY "productCostId" ORDER BY "orden", id) AS rn
    FROM "ProductCostMaterial"
) sub ON sub.id = m.id;

-- Fórmula = suma clásica de todos los valores migrados.
UPDATE "ProductCost" pc
SET "formula" = 'precio_compra + mano_obra + maquina + molde + ensamble + empaque' ||
    COALESCE((
        SELECT string_agg(' + material_' || sub.rn, '' ORDER BY sub.rn)
        FROM (
            SELECT row_number() OVER (ORDER BY m."orden", m.id) AS rn
            FROM "ProductCostMaterial" m
            WHERE m."productCostId" = pc.id
        ) sub
    ), '')
WHERE EXISTS (SELECT 1 FROM "ProductCostValor" v WHERE v."productCostId" = pc.id);
