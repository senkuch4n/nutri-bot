BEGIN;

ALTER TABLE "OutboundMessage" ADD COLUMN "tenantId" TEXT;

-- Existing simple FKs guarantee that present references resolve. Compare all
-- known owners even when another reference has not been assigned a tenant yet.
CREATE TEMP TABLE outbound_owner_backfill ON COMMIT DROP AS
SELECT m.id, owners.first_owner, owners.last_owner, owners.unowned_count,
       m."appointmentId" IS NULL AND m."planId" IS NULL AND m."anthropometricReportId" IS NULL AS unlinked
FROM "OutboundMessage" m
LEFT JOIN "Appointment" a ON a.id = m."appointmentId"
LEFT JOIN "NutritionPlan" p ON p.id = m."planId"
LEFT JOIN "AnthropometricReport" r ON r.id = m."anthropometricReportId"
CROSS JOIN LATERAL (
  SELECT min(owner) AS first_owner, max(owner) AS last_owner,
         count(*) FILTER (WHERE ref IS NOT NULL AND owner IS NULL) AS unowned_count
  FROM (VALUES (m."appointmentId", a."tenantId"), (m."planId", p."tenantId"),
               (m."anthropometricReportId", r."tenantId")) AS refs(ref, owner)
) owners;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM outbound_owner_backfill WHERE first_owner <> last_owner) THEN
    RAISE EXCEPTION 'OutboundMessage has conflicting historical tenant owners';
  END IF;
END $$;

UPDATE "OutboundMessage" m
SET "tenantId" = CASE WHEN b.unlinked THEN 'legacy-tenant' ELSE b.first_owner END
FROM outbound_owner_backfill b
WHERE m.id = b.id AND b.unowned_count = 0;

-- id is already unique; the pair is the target for the same-tenant FK.
CREATE UNIQUE INDEX "Appointment_id_tenantId_key" ON "Appointment"("id", "tenantId");
CREATE INDEX "OutboundMessage_tenantId_idx" ON "OutboundMessage"("tenantId");

ALTER TABLE "OutboundMessage" ADD CONSTRAINT "OutboundMessage_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- PostgreSQL 16 supports a column list on SET NULL; Prisma's relation syntax
-- does not. Preserve tenantId and the other links regardless of trigger order.
ALTER TABLE "OutboundMessage" ADD CONSTRAINT "OutboundMessage_appointmentId_tenantId_fkey"
  FOREIGN KEY ("appointmentId", "tenantId") REFERENCES "Appointment"("id", "tenantId")
  ON DELETE SET NULL ("appointmentId") ON UPDATE NO ACTION;
ALTER TABLE "OutboundMessage" ADD CONSTRAINT "OutboundMessage_planId_tenantId_fkey"
  FOREIGN KEY ("planId", "tenantId") REFERENCES "NutritionPlan"("id", "tenantId")
  ON DELETE SET NULL ("planId") ON UPDATE NO ACTION;
ALTER TABLE "OutboundMessage" ADD CONSTRAINT "OutboundMessage_anthropometricReportId_tenantId_fkey"
  FOREIGN KEY ("anthropometricReportId", "tenantId") REFERENCES "AnthropometricReport"("id", "tenantId")
  ON DELETE SET NULL ("anthropometricReportId") ON UPDATE NO ACTION;

COMMIT;
