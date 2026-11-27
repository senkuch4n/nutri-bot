BEGIN;

CREATE SEQUENCE botstatus_id_seq AS integer;
ALTER TABLE "BotStatus" ALTER COLUMN "id" SET DEFAULT nextval('botstatus_id_seq');
ALTER SEQUENCE botstatus_id_seq OWNED BY "BotStatus"."id";

-- ALTER TABLE holds the write lock until commit. Keep ID 1 available to the legacy seed
-- even on a fresh database, and leave every existing row and ID untouched.
SELECT setval('botstatus_id_seq', GREATEST(1, COALESCE(MAX("id"), 0)), true)
FROM "BotStatus";

ALTER TABLE "BotStatus" ADD COLUMN "sessionKey" TEXT;

-- Preserve the original installation's existing credentials without enabling any other clinic.
UPDATE "BotStatus" SET "sessionKey" = 'legacy' WHERE "tenantId" = 'legacy-tenant';

COMMIT;
