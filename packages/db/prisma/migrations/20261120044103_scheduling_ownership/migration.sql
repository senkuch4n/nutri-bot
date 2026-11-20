-- The existing primary keys and legacy global JID constraint guarantee uniqueness at expansion.
BEGIN;
-- AlterTable
ALTER TABLE "Appointment" ADD COLUMN     "agendaId" TEXT,
ADD COLUMN     "tenantId" TEXT;

-- AlterTable
ALTER TABLE "AvailabilityException" ADD COLUMN     "agendaId" TEXT;

-- AlterTable
ALTER TABLE "AvailabilityRule" ADD COLUMN     "agendaId" TEXT;

-- AlterTable
ALTER TABLE "Patient" ADD COLUMN     "tenantId" TEXT;

-- AlterTable
ALTER TABLE "Service" ADD COLUMN     "tenantId" TEXT;

-- Backfill only the original installation; a missing initial agenda is not an invitation to guess.
DO $$ BEGIN
  IF (EXISTS (SELECT 1 FROM "Appointment") OR EXISTS (SELECT 1 FROM "AvailabilityRule")
      OR EXISTS (SELECT 1 FROM "AvailabilityException")) AND NOT EXISTS (
    SELECT 1 FROM "Agenda" WHERE "id" = 'legacy-agenda' AND "tenantId" = 'legacy-tenant' AND "isPrimary"
  ) THEN
    RAISE EXCEPTION 'Scheduling ownership requires the original primary agenda for existing scheduling data';
  END IF;
END $$;

UPDATE "Patient" SET "tenantId" = 'legacy-tenant';
UPDATE "Service" SET "tenantId" = 'legacy-tenant';
UPDATE "AvailabilityRule" SET "agendaId" = 'legacy-agenda';
UPDATE "AvailabilityException" SET "agendaId" = 'legacy-agenda';
UPDATE "Appointment" SET "tenantId" = 'legacy-tenant', "agendaId" = 'legacy-agenda';

-- CreateIndex
CREATE UNIQUE INDEX "Agenda_id_tenantId_key" ON "Agenda"("id", "tenantId");

-- CreateIndex
CREATE INDEX "Appointment_tenantId_agendaId_startsAt_idx" ON "Appointment"("tenantId", "agendaId", "startsAt");

-- CreateIndex
CREATE INDEX "AvailabilityException_agendaId_date_idx" ON "AvailabilityException"("agendaId", "date");

-- CreateIndex
CREATE INDEX "AvailabilityRule_agendaId_weekday_idx" ON "AvailabilityRule"("agendaId", "weekday");

-- CreateIndex
CREATE UNIQUE INDEX "Patient_id_tenantId_key" ON "Patient"("id", "tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "Patient_tenantId_whatsappJid_key" ON "Patient"("tenantId", "whatsappJid");

-- CreateIndex
CREATE INDEX "Service_tenantId_idx" ON "Service"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "Service_id_tenantId_key" ON "Service"("id", "tenantId");

-- AddForeignKey
ALTER TABLE "Patient" ADD CONSTRAINT "Patient_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "Service" ADD CONSTRAINT "Service_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "AvailabilityRule" ADD CONSTRAINT "AvailabilityRule_agendaId_fkey" FOREIGN KEY ("agendaId") REFERENCES "Agenda"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "AvailabilityException" ADD CONSTRAINT "AvailabilityException_agendaId_fkey" FOREIGN KEY ("agendaId") REFERENCES "Agenda"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_agendaId_tenantId_fkey" FOREIGN KEY ("agendaId", "tenantId") REFERENCES "Agenda"("id", "tenantId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_patientId_tenantId_fkey" FOREIGN KEY ("patientId", "tenantId") REFERENCES "Patient"("id", "tenantId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_serviceId_tenantId_fkey" FOREIGN KEY ("serviceId", "tenantId") REFERENCES "Service"("id", "tenantId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- Keep legacy writes possible, without allowing an owned appointment to have an incomplete scope.
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_scheduling_scope_pair_check"
  CHECK (("tenantId" IS NULL) = ("agendaId" IS NULL));

COMMIT;
