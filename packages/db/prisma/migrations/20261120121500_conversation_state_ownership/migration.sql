BEGIN;

-- Keep the global JID primary key and allow old writers to omit ownership.
ALTER TABLE "ConversationState" ADD COLUMN "tenantId" TEXT;

-- Match the persisted original scheduling binding. The existing agenda FKs
-- prove the tenant and professional relationship; no fallback to JID alone.
UPDATE "ConversationState" AS state
SET "tenantId" = agenda."tenantId"
FROM "Agenda" AS agenda
JOIN "Appointment" AS appt
  ON appt."agendaId" = agenda."id" AND appt."tenantId" = agenda."tenantId"
JOIN "Patient" AS patient
  ON patient."id" = appt."patientId" AND patient."tenantId" = appt."tenantId"
WHERE agenda."id" = 'legacy-agenda'
  AND agenda."tenantId" = 'legacy-tenant'
  AND agenda."isPrimary"
  AND agenda."professionalId" = 1
  AND state."step" COLLATE "C" = 'CONFIRM_ATTENDANCE'
  AND jsonb_typeof(state."context" -> 'apptId') = 'string'
  AND (state."context" ->> 'apptId') COLLATE "C" = appt."id"
  AND state."patientJid" COLLATE "C" = patient."whatsappJid";

CREATE UNIQUE INDEX "ConversationState_tenantId_patientJid_key"
  ON "ConversationState"("tenantId", "patientJid");

ALTER TABLE "ConversationState" ADD CONSTRAINT "ConversationState_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

COMMIT;
