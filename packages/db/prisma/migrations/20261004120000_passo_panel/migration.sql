-- ProductPasso: agrupar pasos en paneles y retirar isQtyStep (no usado)
ALTER TABLE "ProductPasso" ADD COLUMN "panel" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "ProductPasso" DROP COLUMN "isQtyStep";
