-- Solo para un PostgreSQL 16 descartable y vacío, con autorización separada.
-- Desde la raíz: psql -X --dbname=<base-descartable> -f packages/db/scripts/test-jid-scope-contraction.sql
-- No usar --single-transaction: las migraciones incluidas manejan sus transacciones.
-- La prueba de expansión configura search_path y crea tablas temporales de sesión.
\ir test-conversation-state-ownership.sql
-- The expansion fixture declares UNIQUE inline; 0_init uses a standalone index.
-- Reproduce the real catalog so DROP INDEX exercises the actual migration contract.
ALTER TABLE "Patient" DROP CONSTRAINT "Patient_whatsappJid_key";
CREATE UNIQUE INDEX "Patient_whatsappJid_key" ON "Patient" ("whatsappJid");
CREATE UNIQUE INDEX "Patient_tenantId_whatsappJid_key" ON "Patient" ("tenantId", "whatsappJid");
CREATE TEMP TABLE states_before AS SELECT to_jsonb(s) AS row FROM "ConversationState" s;
CREATE TEMP TABLE patients_before AS SELECT to_jsonb(p) AS row FROM "Patient" p;
CREATE TEMP TABLE appointments_before AS SELECT to_jsonb(a) AS row FROM "Appointment" a;

\ir ../prisma/migrations/20261120121600_jid_scope_contraction/migration.sql

DO $$ BEGIN
  IF (SELECT jsonb_agg(row ORDER BY row) FROM states_before) IS DISTINCT FROM
     (SELECT jsonb_agg(row ORDER BY row) FROM (SELECT to_jsonb(s) - 'id' AS row FROM "ConversationState" s) q)
     OR (SELECT jsonb_agg(row ORDER BY row) FROM patients_before) IS DISTINCT FROM
        (SELECT jsonb_agg(to_jsonb(p) ORDER BY to_jsonb(p)) FROM "Patient" p)
     OR (SELECT jsonb_agg(row ORDER BY row) FROM appointments_before) IS DISTINCT FROM
        (SELECT jsonb_agg(to_jsonb(a) ORDER BY to_jsonb(a)) FROM "Appointment" a) THEN
    RAISE EXCEPTION 'La contracción cambió campos, dueños o referencias anteriores';
  END IF;
  IF (SELECT count(DISTINCT "id") FROM "ConversationState") <> (SELECT count(*) FROM states_before) THEN
    RAISE EXCEPTION 'No se generaron UUID distintos para todas las filas históricas';
  END IF;
END $$;

-- El mismo JID convive con dos dueños y una fila histórica sin dueño.
INSERT INTO "Patient" VALUES
  ('p10', 'legacy-tenant', 'unknown-owner@fixture'), ('p11', 'fixture-foreign', 'unknown-owner@fixture');
INSERT INTO "ConversationState" ("patientJid", "tenantId", "step", "context", "updatedAt") VALUES
  ('unknown-owner@fixture', 'legacy-tenant', 'MENU', '{}', '2026-01-01'),
  ('unknown-owner@fixture', 'fixture-foreign', 'BOOK_REASON', '{"serviceId":"foreign"}', '2026-01-01');

DO $$
DECLARE
  owner text;
  rejected_constraint text;
BEGIN
  FOREACH owner IN ARRAY ARRAY[NULL::text, 'legacy-tenant', 'fixture-foreign'] LOOP
    BEGIN
      INSERT INTO "Patient" VALUES ('duplicate-patient', owner, 'unknown-owner@fixture');
      RAISE EXCEPTION 'Se aceptó un paciente duplicado para %', owner;
    EXCEPTION WHEN unique_violation THEN
      GET STACKED DIAGNOSTICS rejected_constraint = CONSTRAINT_NAME;
      IF rejected_constraint IS DISTINCT FROM (CASE WHEN owner IS NULL
        THEN 'Patient_unowned_whatsappJid_key' ELSE 'Patient_tenantId_whatsappJid_key' END)
      THEN RAISE; END IF;
    END;
    BEGIN
      INSERT INTO "ConversationState" ("patientJid", "tenantId", "updatedAt") VALUES ('unknown-owner@fixture', owner, now());
      RAISE EXCEPTION 'Se aceptó un estado duplicado para %', owner;
    EXCEPTION WHEN unique_violation THEN
      GET STACKED DIAGNOSTICS rejected_constraint = CONSTRAINT_NAME;
      IF rejected_constraint IS DISTINCT FROM (CASE WHEN owner IS NULL
        THEN 'ConversationState_unowned_patientJid_key' ELSE 'ConversationState_tenantId_patientJid_key' END)
      THEN RAISE; END IF;
    END;
  END LOOP;
  IF (SELECT count(*) FROM "Patient" WHERE "whatsappJid" = 'unknown-owner@fixture') <> 3
     OR (SELECT count(*) FROM "ConversationState" WHERE "patientJid" = 'unknown-owner@fixture') <> 3 THEN
    RAISE EXCEPTION 'Los rechazos cambiaron el conteo de filas';
  END IF;
END $$;
\echo Contracción de JID: aserciones aprobadas
