-- HU-028c: IA por consultorio. BotAiQuestion.tenantId (backfill desde el paciente), topes por
-- consultorio y registro de consumo del panel. No borra ni cambia ninguna fila existente salvo el backfill.
BEGIN;

-- Fail closed: una pregunta de un paciente sin consultorio no se puede atribuir. No se adopta ni se borra.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "BotAiQuestion" q JOIN "Patient" p ON p."id" = q."patientId" WHERE p."tenantId" IS NULL
  ) THEN
    RAISE EXCEPTION 'HU-028c: hay preguntas de la IA del bot de pacientes sin tenantId; resolver a mano antes de migrar';
  END IF;
END $$;

-- AlterTable: nullable → backfill → NOT NULL.
ALTER TABLE "BotAiQuestion" ADD COLUMN "tenantId" TEXT;
-- Producción: un solo tenant, todas quedan en 'legacy-tenant' (el tenant de sus pacientes desde HU-024).
UPDATE "BotAiQuestion" q SET "tenantId" = p."tenantId" FROM "Patient" p WHERE p."id" = q."patientId";
ALTER TABLE "BotAiQuestion" ALTER COLUMN "tenantId" SET NOT NULL;

-- CreateIndex
CREATE INDEX "BotAiQuestion_tenantId_askedAt_idx" ON "BotAiQuestion"("tenantId", "askedAt");

-- AddForeignKey (compuesta: la pregunta queda en el consultorio de su paciente)
ALTER TABLE "BotAiQuestion" ADD CONSTRAINT "BotAiQuestion_patientId_tenantId_fkey"
  FOREIGN KEY ("patientId", "tenantId") REFERENCES "Patient"("id", "tenantId") ON DELETE CASCADE ON UPDATE RESTRICT;

-- CreateEnum
CREATE TYPE "PanelAiFeature" AS ENUM ('ASSISTANT', 'PLAN_AI');

-- CreateEnum
CREATE TYPE "PanelAiOutcome" AS ENUM ('OK', 'INVALID_RESPONSE', 'TOOL_LIMIT', 'ERROR');

-- CreateTable
CREATE TABLE "TenantAiSettings" (
    "tenantId" TEXT NOT NULL,
    "botDailyPerPatient" INTEGER,
    "botDailyPerTenant" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TenantAiSettings_pkey" PRIMARY KEY ("tenantId")
);

-- Prisma no modela CHECK (no genera drift; mismo patrón que food_sara2/catalog_ownership).
ALTER TABLE "TenantAiSettings" ADD CONSTRAINT "TenantAiSettings_limits_check"
  CHECK (("botDailyPerPatient" IS NULL OR "botDailyPerPatient" BETWEEN 0 AND 100000)
     AND ("botDailyPerTenant" IS NULL OR "botDailyPerTenant" BETWEEN 0 AND 100000));

-- AddForeignKey
ALTER TABLE "TenantAiSettings" ADD CONSTRAINT "TenantAiSettings_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- CreateTable
CREATE TABLE "PanelAiUsage" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "feature" "PanelAiFeature" NOT NULL,
    "usedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "calls" INTEGER NOT NULL DEFAULT 0,
    "outcome" "PanelAiOutcome" NOT NULL,
    "errorCode" TEXT,

    CONSTRAINT "PanelAiUsage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PanelAiUsage_tenantId_usedAt_idx" ON "PanelAiUsage"("tenantId", "usedAt");

-- AddForeignKey
ALTER TABLE "PanelAiUsage" ADD CONSTRAINT "PanelAiUsage_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

COMMIT;
