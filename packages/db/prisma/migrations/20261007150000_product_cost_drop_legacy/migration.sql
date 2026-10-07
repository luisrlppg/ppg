-- AlterTable: quita los campos fijos legacy (ya migrados a "ProductCostValor" en
-- 20261007140000_product_cost_valores).
ALTER TABLE "ProductCost"
    DROP COLUMN "costoCompra",
    DROP COLUMN "horasManoObra",
    DROP COLUMN "tarifaManoObra",
    DROP COLUMN "horasMaquina",
    DROP COLUMN "tarifaMaquina",
    DROP COLUMN "costoMolde",
    DROP COLUMN "piezasMolde",
    DROP COLUMN "costoEnsamble",
    DROP COLUMN "costoEmpaque";

-- DropTable
DROP TABLE "ProductCostMaterial";
