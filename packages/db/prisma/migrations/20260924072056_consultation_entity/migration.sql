-- AlterTable
ALTER TABLE "EvolutionEntry" ADD COLUMN     "consultationId" TEXT;

-- CreateTable
CREATE TABLE "Consultation" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "appointmentId" TEXT,
    "consultedAt" TIMESTAMP(3) NOT NULL,
    "notes" TEXT,
    "planId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Consultation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Consultation_appointmentId_key" ON "Consultation"("appointmentId");

-- CreateIndex
CREATE INDEX "Consultation_patientId_consultedAt_idx" ON "Consultation"("patientId", "consultedAt");

-- CreateIndex
CREATE INDEX "Consultation_planId_idx" ON "Consultation"("planId");

-- CreateIndex
CREATE INDEX "EvolutionEntry_consultationId_idx" ON "EvolutionEntry"("consultationId");

-- AddForeignKey
ALTER TABLE "EvolutionEntry" ADD CONSTRAINT "EvolutionEntry_consultationId_fkey" FOREIGN KEY ("consultationId") REFERENCES "Consultation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Consultation" ADD CONSTRAINT "Consultation_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Consultation" ADD CONSTRAINT "Consultation_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Consultation" ADD CONSTRAINT "Consultation_planId_fkey" FOREIGN KEY ("planId") REFERENCES "NutritionPlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- ─── Backfill HU-003 (D1/D2) ─────────────────────────────────────────────────
-- Solo INSERT en "Consultation" y UPDATE de "EvolutionEntry"."consultationId".
-- Idempotente: ids determinísticos + ON CONFLICT / NOT EXISTS + "consultationId" IS NULL.

-- 1) D2: una consulta por turno COMPLETED que todavía no tenga.
INSERT INTO "Consultation" ("id", "patientId", "appointmentId", "consultedAt", "createdAt", "updatedAt")
SELECT 'mig003_' || md5('appt:' || a."id"), a."patientId", a."id", a."startsAt", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Appointment" a
WHERE a."status" = 'COMPLETED'
  AND NOT EXISTS (SELECT 1 FROM "Consultation" c WHERE c."appointmentId" = a."id")
ON CONFLICT ("id") DO NOTHING;

-- 2) D1: consultas "Sin turno" para los días con mediciones sueltas que no tienen
--    exactamente un turno COMPLETED ese día.
WITH tz AS (
  SELECT COALESCE((SELECT "timezone" FROM "Professional" WHERE "id" = 1), 'America/Argentina/Buenos_Aires') AS name
),
evo_days AS (
  SELECT DISTINCT e."patientId", (e."recordedAt" AT TIME ZONE 'UTC' AT TIME ZONE tz.name)::date AS day
  FROM "EvolutionEntry" e CROSS JOIN tz
  WHERE e."consultationId" IS NULL
),
single_appt_days AS (
  SELECT a."patientId", (a."startsAt" AT TIME ZONE 'UTC' AT TIME ZONE tz.name)::date AS day
  FROM "Appointment" a CROSS JOIN tz
  WHERE a."status" = 'COMPLETED'
  GROUP BY 1, 2
  HAVING count(*) = 1
)
INSERT INTO "Consultation" ("id", "patientId", "appointmentId", "consultedAt", "createdAt", "updatedAt")
SELECT 'mig003_' || md5('day:' || d."patientId" || ':' || d.day::text),
       d."patientId",
       NULL,
       ((d.day + time '12:00') AT TIME ZONE tz.name) AT TIME ZONE 'UTC',
       CURRENT_TIMESTAMP,
       CURRENT_TIMESTAMP
FROM evo_days d
CROSS JOIN tz
WHERE NOT EXISTS (
  SELECT 1 FROM single_appt_days s WHERE s."patientId" = d."patientId" AND s.day = d.day
)
ON CONFLICT ("id") DO NOTHING;

-- 3) D1: vincular cada medición suelta con su consulta.
WITH tz AS (
  SELECT COALESCE((SELECT "timezone" FROM "Professional" WHERE "id" = 1), 'America/Argentina/Buenos_Aires') AS name
),
entries AS (
  SELECT e."id", e."patientId", (e."recordedAt" AT TIME ZONE 'UTC' AT TIME ZONE tz.name)::date AS day
  FROM "EvolutionEntry" e CROSS JOIN tz
  WHERE e."consultationId" IS NULL
),
single_appt AS (
  SELECT a."patientId", (a."startsAt" AT TIME ZONE 'UTC' AT TIME ZONE tz.name)::date AS day, min(a."id") AS appointment_id
  FROM "Appointment" a CROSS JOIN tz
  WHERE a."status" = 'COMPLETED'
  GROUP BY 1, 2
  HAVING count(*) = 1
),
target AS (
  SELECT en."id" AS entry_id,
         COALESCE(c."id", 'mig003_' || md5('day:' || en."patientId" || ':' || en.day::text)) AS consultation_id
  FROM entries en
  LEFT JOIN single_appt sa ON sa."patientId" = en."patientId" AND sa.day = en.day
  LEFT JOIN "Consultation" c ON c."appointmentId" = sa.appointment_id
)
UPDATE "EvolutionEntry" e
SET "consultationId" = t.consultation_id
FROM target t
WHERE e."id" = t.entry_id
  AND e."consultationId" IS NULL
  AND EXISTS (SELECT 1 FROM "Consultation" c2 WHERE c2."id" = t.consultation_id);
