-- Run only against a fresh, empty disposable PostgreSQL database, never an app DB:
-- psql -X --dbname=<disposable-db> -f packages/db/scripts/test-conversation-state-ownership.sql
-- Standalone test of the actual migration over a minimal pre-expand catalog.
-- All fixtures and DDL are session-local temp tables; disconnect discards them.
-- Do not use --single-transaction: the included migration owns its transaction.
\set ON_ERROR_STOP on
SET search_path = pg_temp, pg_catalog;
DO $$ BEGIN
  IF EXISTS (
    SELECT FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname !~ '^pg_' AND n.nspname <> 'information_schema'
      AND c.relkind IN ('r', 'p', 'f', 'v', 'm')
  ) THEN
    RAISE EXCEPTION 'Use a fresh disposable database';
  END IF;
END $$;

CREATE TEMP TABLE "Tenant" ("id" text PRIMARY KEY);
CREATE TEMP TABLE "Professional" (
  "id" integer PRIMARY KEY, "tenantId" text REFERENCES "Tenant", UNIQUE ("id", "tenantId")
);
CREATE TEMP TABLE "Agenda" (
  "id" text PRIMARY KEY, "tenantId" text NOT NULL REFERENCES "Tenant", "professionalId" integer NOT NULL,
  "isPrimary" boolean NOT NULL, UNIQUE ("id", "tenantId"),
  FOREIGN KEY ("professionalId", "tenantId") REFERENCES "Professional" ("id", "tenantId")
);
CREATE TEMP TABLE "Patient" (
  "id" text PRIMARY KEY, "tenantId" text REFERENCES "Tenant",
  "whatsappJid" text NOT NULL UNIQUE, UNIQUE ("id", "tenantId")
);
CREATE TEMP TABLE "Appointment" (
  "id" text PRIMARY KEY, "agendaId" text, "tenantId" text, "patientId" text NOT NULL REFERENCES "Patient",
  CHECK (("tenantId" IS NULL) = ("agendaId" IS NULL)),
  FOREIGN KEY ("agendaId", "tenantId") REFERENCES "Agenda" ("id", "tenantId"),
  FOREIGN KEY ("patientId", "tenantId") REFERENCES "Patient" ("id", "tenantId")
);
CREATE TEMP TABLE "ConversationState" (
  "patientJid" text PRIMARY KEY, "step" text NOT NULL DEFAULT 'MENU',
  "context" jsonb NOT NULL DEFAULT '{}', "updatedAt" timestamp(3) NOT NULL
);

INSERT INTO "Tenant" VALUES ('legacy-tenant'), ('fixture-foreign');
INSERT INTO "Professional" VALUES (1, 'legacy-tenant'), (2, 'fixture-foreign');
INSERT INTO "Agenda" VALUES ('legacy-agenda', 'legacy-tenant', 1, true),
  ('other-agenda', 'legacy-tenant', 1, false), ('foreign-agenda', 'fixture-foreign', 2, true);
INSERT INTO "Patient" VALUES
  ('p1', 'legacy-tenant', 'owned@fixture'), ('p2', 'fixture-foreign', 'foreign@fixture'),
  ('p3', 'legacy-tenant', 'nonattendance@fixture'), ('p4', 'legacy-tenant', 'malformed@fixture'),
  ('p5', 'legacy-tenant', 'stale@fixture'), ('p6', 'legacy-tenant', 'exact@fixture'),
  ('p7', 'legacy-tenant', 'unscoped@fixture'), ('p8', 'legacy-tenant', 'other-agenda@fixture'),
  ('p9', NULL, 'unknown-owner@fixture');
INSERT INTO "Appointment" VALUES
  ('a1', 'legacy-agenda', 'legacy-tenant', 'p1'), ('a2', 'foreign-agenda', 'fixture-foreign', 'p2'),
  ('a3', 'legacy-agenda', 'legacy-tenant', 'p3'), ('42', 'legacy-agenda', 'legacy-tenant', 'p4'),
  ('a6', 'legacy-agenda', 'legacy-tenant', 'p6'), ('a7', NULL, NULL, 'p7'),
  ('a8', 'other-agenda', 'legacy-tenant', 'p8'), ('a9', NULL, NULL, 'p9');
INSERT INTO "ConversationState"
SELECT jid, step, payload::jsonb, timestamp '2001-02-03 04:05:06.789'
FROM (VALUES
  ('owned@fixture', 'CONFIRM_ATTENDANCE', '{"apptId":"a1","fixture":true}'),
  ('foreign@fixture', 'CONFIRM_ATTENDANCE', '{"apptId":"a2"}'),
  ('nonattendance@fixture', 'CANCEL_CONFIRM', '{"apptId":"a3"}'),
  ('malformed@fixture', 'CONFIRM_ATTENDANCE', '{"apptId":42}'),
  ('stale@fixture', 'CONFIRM_ATTENDANCE', '{"apptId":"deleted"}'),
  ('EXACT@fixture', 'CONFIRM_ATTENDANCE', '{"apptId":"a6"}'),
  ('unknown@fixture', 'CONFIRM_ATTENDANCE', '{"apptId":"a1"}'),
  ('missing-key@fixture', 'CONFIRM_ATTENDANCE', '{}'),
  ('unscoped@fixture', 'CONFIRM_ATTENDANCE', '{"apptId":"a7"}'),
  ('other-agenda@fixture', 'CONFIRM_ATTENDANCE', '{"apptId":"a8"}'),
  ('unknown-owner@fixture', 'CONFIRM_ATTENDANCE', '{"apptId":"a9"}')
) AS cases(jid, step, payload);
CREATE TEMP TABLE expected AS
SELECT *, CASE WHEN "patientJid" = 'owned@fixture' THEN 'legacy-tenant'::text END AS "tenantId"
FROM "ConversationState";

\ir ../prisma/migrations/20261120121500_conversation_state_ownership/migration.sql

DO $$ BEGIN
  IF EXISTS (TABLE "ConversationState" EXCEPT TABLE expected)
     OR EXISTS (TABLE expected EXCEPT TABLE "ConversationState") THEN
    RAISE EXCEPTION 'Backfill differs from expected ownership or changed a legacy field';
  END IF;
  IF NOT EXISTS (
    SELECT FROM pg_index WHERE indrelid = '"ConversationState"'::regclass AND indisunique AND indisvalid
      AND pg_get_indexdef(indexrelid) LIKE '%("tenantId", "patientJid")'
  ) THEN
    RAISE EXCEPTION 'Missing compound unique index';
  END IF;
  BEGIN
    INSERT INTO "ConversationState" ("patientJid", "updatedAt", "tenantId")
    VALUES ('invalid-owner@fixture', now(), 'nonexistent');
    RAISE EXCEPTION 'Invalid state owner accepted';
  EXCEPTION WHEN foreign_key_violation THEN NULL;
  END;
  BEGIN
    INSERT INTO "ConversationState" ("patientJid", "updatedAt", "tenantId")
    VALUES ('owned@fixture', now(), 'fixture-foreign');
    RAISE EXCEPTION 'Global state key no longer enforced';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;
  BEGIN
    INSERT INTO "Patient" VALUES ('duplicate', 'fixture-foreign', 'owned@fixture');
    RAISE EXCEPTION 'Global patient JID uniqueness no longer enforced';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;
END $$;

-- Old binaries neither supply tenantId nor use it to resolve a conflict.
INSERT INTO "ConversationState" ("patientJid", "step", "updatedAt") VALUES
  ('owned@fixture', 'DORMANT', '2002-01-01'), ('old-writer@fixture', 'DORMANT', '2002-01-01')
ON CONFLICT ("patientJid") DO UPDATE SET "step" = EXCLUDED."step", "updatedAt" = EXCLUDED."updatedAt";
DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM "ConversationState" WHERE "patientJid" = 'old-writer@fixture'
                 AND "tenantId" IS NULL AND "step" = 'DORMANT' AND "updatedAt" = '2002-01-01')
     OR NOT EXISTS (SELECT FROM "ConversationState" WHERE "patientJid" = 'owned@fixture'
                   AND "tenantId" = 'legacy-tenant' AND "step" = 'DORMANT' AND "updatedAt" = '2002-01-01') THEN
    RAISE EXCEPTION 'Legacy upsert changed ownership or did not persist';
  END IF;
END $$;
\echo ConversationState expansion assertions passed
