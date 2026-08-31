-- E3: SalesOrderLine.configuracion + ManufacturingOrder.configuracion + salesOrderLineId
BEGIN;

ALTER TABLE "SalesOrderLine" ADD COLUMN "configuracion" JSONB;

ALTER TABLE "ManufacturingOrder" ADD COLUMN "configuracion" JSONB;
ALTER TABLE "ManufacturingOrder" ADD COLUMN "salesOrderLineId" INTEGER;
ALTER TABLE "ManufacturingOrder" ADD CONSTRAINT "ManufacturingOrder_salesOrderLineId_fkey"
  FOREIGN KEY ("salesOrderLineId") REFERENCES "SalesOrderLine"("id") ON DELETE SET NULL;

CREATE INDEX "ManufacturingOrder_salesOrderLineId_idx" ON "ManufacturingOrder"("salesOrderLineId");

COMMIT;
