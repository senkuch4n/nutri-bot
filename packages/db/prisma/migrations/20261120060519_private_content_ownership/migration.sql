BEGIN;

ALTER TABLE "PlanTemplate" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "Recipe" ADD COLUMN "tenantId" TEXT;

-- Existing private content belongs to the installation tenant created by T1.
-- Keep the columns optional for writers that do not yet carry tenant context.
UPDATE "PlanTemplate" SET "tenantId" = 'legacy-tenant';
UPDATE "Recipe" SET "tenantId" = 'legacy-tenant';

CREATE INDEX "PlanTemplate_tenantId_idx" ON "PlanTemplate"("tenantId");
CREATE INDEX "Recipe_tenantId_idx" ON "Recipe"("tenantId");

ALTER TABLE "PlanTemplate" ADD CONSTRAINT "PlanTemplate_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "Recipe" ADD CONSTRAINT "Recipe_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

COMMIT;
