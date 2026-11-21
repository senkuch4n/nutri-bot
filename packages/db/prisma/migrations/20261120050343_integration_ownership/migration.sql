-- Keep expansion and backfill atomic. Legacy writers still omit tenantId.
BEGIN;
-- AlterTable
ALTER TABLE "BotStatus" ADD COLUMN     "tenantId" TEXT;

-- AlterTable
ALTER TABLE "MercadoPagoAccount" ADD COLUMN     "tenantId" TEXT;

-- AlterTable
ALTER TABLE "MercadoPagoOAuthState" ADD COLUMN     "tenantId" TEXT;

-- All existing integration rows came from the installation represented by the seeded tenant.
UPDATE "BotStatus" SET "tenantId" = 'legacy-tenant';
UPDATE "MercadoPagoAccount" SET "tenantId" = 'legacy-tenant';
UPDATE "MercadoPagoOAuthState" SET "tenantId" = 'legacy-tenant';

-- CreateIndex
CREATE UNIQUE INDEX "BotStatus_tenantId_key" ON "BotStatus"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "MercadoPagoAccount_tenantId_key" ON "MercadoPagoAccount"("tenantId");

-- CreateIndex
CREATE INDEX "MercadoPagoOAuthState_tenantId_idx" ON "MercadoPagoOAuthState"("tenantId");

-- AddForeignKey
ALTER TABLE "MercadoPagoAccount" ADD CONSTRAINT "MercadoPagoAccount_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MercadoPagoOAuthState" ADD CONSTRAINT "MercadoPagoOAuthState_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BotStatus" ADD CONSTRAINT "BotStatus_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

COMMIT;
