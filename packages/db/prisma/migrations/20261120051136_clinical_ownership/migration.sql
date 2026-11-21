BEGIN;

-- Keep patient ownership stable through backfill and FK validation.
LOCK TABLE "Patient" IN SHARE ROW EXCLUSIVE MODE;

-- AlterTable
ALTER TABLE "AnthropometricReport" ADD COLUMN     "tenantId" TEXT;

-- AlterTable
ALTER TABLE "Consultation" ADD COLUMN     "tenantId" TEXT;

-- AlterTable
ALTER TABLE "EvolutionEntry" ADD COLUMN     "tenantId" TEXT;

-- AlterTable
ALTER TABLE "NutritionPlan" ADD COLUMN     "tenantId" TEXT;

-- Copy only known owners; reports inherit from entries after entry backfill.
UPDATE "Consultation" AS child
SET "tenantId" = parent."tenantId"
FROM "Patient" AS parent
WHERE child."patientId" = parent.id AND parent."tenantId" IS NOT NULL;

UPDATE "EvolutionEntry" AS child
SET "tenantId" = parent."tenantId"
FROM "Patient" AS parent
WHERE child."patientId" = parent.id AND parent."tenantId" IS NOT NULL;

UPDATE "NutritionPlan" AS child
SET "tenantId" = parent."tenantId"
FROM "Patient" AS parent
WHERE child."patientId" = parent.id AND parent."tenantId" IS NOT NULL;

UPDATE "AnthropometricReport" AS child
SET "tenantId" = parent."tenantId"
FROM "EvolutionEntry" AS parent
WHERE child."isakEntryId" = parent.id AND parent."tenantId" IS NOT NULL;

-- Composite targets contain the existing primary key, so cannot duplicate IDs.
CREATE UNIQUE INDEX "AnthropometricReport_id_tenantId_key" ON "AnthropometricReport"("id", "tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "Consultation_id_tenantId_key" ON "Consultation"("id", "tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "EvolutionEntry_id_tenantId_key" ON "EvolutionEntry"("id", "tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "NutritionPlan_id_tenantId_key" ON "NutritionPlan"("id", "tenantId");

-- AddForeignKey
ALTER TABLE "EvolutionEntry" ADD CONSTRAINT "EvolutionEntry_patientId_tenantId_fkey" FOREIGN KEY ("patientId", "tenantId") REFERENCES "Patient"("id", "tenantId") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "AnthropometricReport" ADD CONSTRAINT "AnthropometricReport_isakEntryId_tenantId_fkey" FOREIGN KEY ("isakEntryId", "tenantId") REFERENCES "EvolutionEntry"("id", "tenantId") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "Consultation" ADD CONSTRAINT "Consultation_patientId_tenantId_fkey" FOREIGN KEY ("patientId", "tenantId") REFERENCES "Patient"("id", "tenantId") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "NutritionPlan" ADD CONSTRAINT "NutritionPlan_patientId_tenantId_fkey" FOREIGN KEY ("patientId", "tenantId") REFERENCES "Patient"("id", "tenantId") ON DELETE CASCADE ON UPDATE NO ACTION;

COMMIT;
