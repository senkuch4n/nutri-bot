#!/usr/bin/env bash
# Verify integration ownership using only a disposable local database.
set -euo pipefail
export LC_ALL=C
root=$(git -C "$(dirname "$0")" rev-parse --show-toplevel)
prisma="$root/node_modules/.bin/prisma"
schema="$root/packages/db/prisma"
base=20261120044103_scheduling_ownership
host=unix:///Users/leonel/.docker/run/docker.sock
[ "$(docker context inspect "$(docker context show)" --format '{{.Endpoints.docker.Host}}')" = "$host" ] || {
  echo 'The approved local Docker Unix socket is required.' >&2; exit 2;
}
d() { docker --host "$host" "$@"; }
[ -x "$prisma" ] || { echo 'Install the worktree dependencies first.' >&2; exit 2; }
scratch=$(mktemp -d /tmp/hu024-integration.XXXXXX)
container=
cleanup() {
  if [ -n "$container" ]; then d stop "$container" >/dev/null; fi
  rm -rf -- "$scratch"
}
trap cleanup EXIT
mkdir "$scratch/migrations"
cp "$schema/schema.prisma" "$scratch/schema.prisma"
cp "$schema/migrations/migration_lock.toml" "$scratch/migrations/"
for path in "$schema"/migrations/*/; do
  name=$(basename "$path")
  if [[ "$name" < "$base" || "$name" == "$base" ]]; then cp -R "${path%/}" "$scratch/migrations/"; fi
done
export POSTGRES_PASSWORD
POSTGRES_PASSWORD=$(openssl rand -hex 18)
container=$(d run --pull=never --rm --detach --publish '127.0.0.1::5432' \
  --tmpfs /var/lib/postgresql/data:rw --env POSTGRES_PASSWORD \
  --env POSTGRES_DB=hu024_integrations postgres:16-alpine)
for attempt in $(seq 1 50); do
  if d exec "$container" pg_isready -h 127.0.0.1 -U postgres -d hu024_integrations >/dev/null 2>&1; then break; fi
  [ "$attempt" -lt 50 ] || { echo 'Postgres did not become ready.' >&2; exit 1; }
  sleep 0.2
done
binding=$(d port "$container" 5432/tcp)
[[ "$binding" =~ ^127\.0\.0\.1:[0-9]+$ ]] || exit 2
cd "$scratch"
export DATABASE_URL="postgresql://postgres:$POSTGRES_PASSWORD@$binding/hu024_integrations"
unset DIRECT_URL SHADOW_DATABASE_URL
migrate() { "$prisma" migrate deploy --schema "$scratch/schema.prisma"; }
psql_in() {
  local database=$1
  shift
  d exec -i "$container" psql -X -q -v ON_ERROR_STOP=1 -U postgres -d "$database" "$@"
}
psql() { psql_in hu024_integrations "$@"; }
migrate
psql <<'SQL'
INSERT INTO "MercadoPagoAccount" (id, "userId", nickname, email, "liveMode", "accessTokenEnc", "refreshTokenEnc", scope,
  "expiresAt", "connectedAt", "refreshedAt", "errorCode", "errorAt", "errorNotifiedAt", "missingAlertAt", "createdAt", "updatedAt")
VALUES (1, '123', 'Fixture', 'fixture@example.invalid', false, 'synthetic-access', 'synthetic-refresh', 'fixture-scope',
  '2026-01-09', '2026-01-01', '2026-01-02', 'fixture-error', '2026-01-03', '2026-01-04', '2026-01-05', '2026-01-01', '2026-01-05');
INSERT INTO "BotStatus" (id, connected, qr, "lastConnectedAt", "updatedAt")
VALUES (1, true, 'synthetic-qr', '2026-01-02', '2026-01-03');
INSERT INTO "MercadoPagoOAuthState" (id, "stateHash", "codeVerifierEnc", "sessionEmail", "expiresAt", "createdAt")
VALUES ('state1', 'hash1', 'synthetic-pkce-1', 'fixture@example.invalid', '2026-01-02', '2026-01-01'),
       ('state2', 'hash2', 'synthetic-pkce-2', 'fixture@example.invalid', '2026-01-04', '2026-01-03');
SQL
snapshot() {
  psql -At <<'SQL'
SELECT jsonb_build_array(
  (SELECT jsonb_agg(to_jsonb(a) - 'tenantId' ORDER BY id) FROM "MercadoPagoAccount" a),
  (SELECT jsonb_agg(to_jsonb(b) - 'tenantId' ORDER BY id) FROM "BotStatus" b),
  (SELECT jsonb_agg(to_jsonb(s) - 'tenantId' ORDER BY id) FROM "MercadoPagoOAuthState" s)
);
SQL
}
before=$(snapshot)
for path in "$schema"/migrations/*_integration_ownership/; do
  if [ -d "$path" ]; then cp -R "${path%/}" "$scratch/migrations/"; fi
done
migrate
psql <<'SQL'
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM "MercadoPagoAccount" WHERE "tenantId" IS DISTINCT FROM 'legacy-tenant')
    OR EXISTS (SELECT 1 FROM "BotStatus" WHERE "tenantId" IS DISTINCT FROM 'legacy-tenant')
    OR EXISTS (SELECT 1 FROM "MercadoPagoOAuthState" WHERE "tenantId" IS DISTINCT FROM 'legacy-tenant') THEN
    RAISE EXCEPTION 'Integration ownership did not backfill the seeded tenant';
  END IF;
END $$;
DO $$ DECLARE
  rel text;
  constraint_name text;
  wrong_owners bigint;
BEGIN
  FOREACH rel IN ARRAY ARRAY['MercadoPagoAccount', 'BotStatus', 'MercadoPagoOAuthState'] LOOP
    BEGIN
      EXECUTE format('UPDATE %I SET "tenantId" = %L', rel, 'missing-tenant');
      RAISE EXCEPTION '% accepted missing ownership target', rel;
    EXCEPTION WHEN foreign_key_violation THEN
      GET STACKED DIAGNOSTICS constraint_name = CONSTRAINT_NAME;
      IF constraint_name <> rel || '_tenantId_fkey' THEN RAISE; END IF;
    END;
    EXECUTE format('SELECT count(*) FROM %I WHERE "tenantId" IS DISTINCT FROM %L', rel, 'legacy-tenant') INTO wrong_owners;
    IF wrong_owners <> 0 THEN RAISE EXCEPTION '% changed ownership after a rejected write', rel; END IF;
  END LOOP;
END $$;
SQL
[ "$(snapshot)" = "$before" ] || { echo 'Preexisting integration columns or rows changed.' >&2; exit 1; }
psql <<'SQL'
INSERT INTO "Tenant" (id) VALUES ('other-tenant');
INSERT INTO "MercadoPagoAccount" (id, "tenantId", "updatedAt") VALUES (2, 'other-tenant', now());
INSERT INTO "BotStatus" (id, "tenantId", "updatedAt") VALUES (2, 'other-tenant', now());
INSERT INTO "MercadoPagoOAuthState" (id, "tenantId", "stateHash", "codeVerifierEnc", "sessionEmail", "expiresAt")
VALUES ('other-state', 'other-tenant', 'other-hash', 'synthetic-pkce', 'fixture@example.invalid', now());
DO $$ DECLARE constraint_name text;
BEGIN
  BEGIN
    INSERT INTO "MercadoPagoAccount" (id, "tenantId", "updatedAt") VALUES (3, 'other-tenant', now());
    RAISE EXCEPTION 'Accepted duplicate account ownership';
  EXCEPTION WHEN unique_violation THEN
    GET STACKED DIAGNOSTICS constraint_name = CONSTRAINT_NAME;
    IF constraint_name <> 'MercadoPagoAccount_tenantId_key' THEN RAISE; END IF;
  END;
  BEGIN
    INSERT INTO "BotStatus" (id, "tenantId", "updatedAt") VALUES (3, 'other-tenant', now());
    RAISE EXCEPTION 'Accepted duplicate bot status ownership';
  EXCEPTION WHEN unique_violation THEN
    GET STACKED DIAGNOSTICS constraint_name = CONSTRAINT_NAME;
    IF constraint_name <> 'BotStatus_tenantId_key' THEN RAISE; END IF;
  END;
  BEGIN
    INSERT INTO "MercadoPagoOAuthState" (id, "tenantId", "stateHash", "codeVerifierEnc", "sessionEmail", "expiresAt")
    VALUES ('duplicate-state', 'other-tenant', 'hash1', 'synthetic-pkce', 'fixture@example.invalid', now());
    RAISE EXCEPTION 'Accepted duplicate global OAuth hash';
  EXCEPTION WHEN unique_violation THEN
    GET STACKED DIAGNOSTICS constraint_name = CONSTRAINT_NAME;
    IF constraint_name <> 'MercadoPagoOAuthState_stateHash_key' THEN RAISE; END IF;
  END;
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public'
    AND tablename = 'MercadoPagoOAuthState' AND indexname = 'MercadoPagoOAuthState_tenantId_idx'
    AND indexdef LIKE '%("tenantId")') THEN
    RAISE EXCEPTION 'Missing OAuth ownership index';
  END IF;
END $$;
-- Legacy id=1 upserts retain explicit ownership on upgrade.
INSERT INTO "MercadoPagoAccount" ("updatedAt") VALUES (now()) ON CONFLICT (id) DO UPDATE SET "updatedAt" = EXCLUDED."updatedAt";
INSERT INTO "BotStatus" ("updatedAt") VALUES (now()) ON CONFLICT (id) DO UPDATE SET "updatedAt" = EXCLUDED."updatedAt";
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM "MercadoPagoAccount" WHERE id = 1 AND "tenantId" = 'legacy-tenant')
    OR NOT EXISTS (SELECT 1 FROM "BotStatus" WHERE id = 1 AND "tenantId" = 'legacy-tenant')
    OR (SELECT count(*) FROM "MercadoPagoAccount") <> 2 OR (SELECT count(*) FROM "BotStatus") <> 2
    OR (SELECT count(*) FROM "MercadoPagoOAuthState") <> 3 THEN
    RAISE EXCEPTION 'Rejected writes or legacy upserts did not preserve integration ownership';
  END IF;
END $$;
SQL
d exec "$container" createdb -U postgres hu024_integrations_fresh
DATABASE_URL="postgresql://postgres:$POSTGRES_PASSWORD@$binding/hu024_integrations_fresh" migrate
psql_in hu024_integrations_fresh <<'SQL'
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM "MercadoPagoAccount") OR EXISTS (SELECT 1 FROM "BotStatus")
    OR EXISTS (SELECT 1 FROM "MercadoPagoOAuthState") THEN
    RAISE EXCEPTION 'Fresh migration created integration rows';
  END IF;
END $$;
INSERT INTO "MercadoPagoAccount" ("updatedAt") VALUES (now()) ON CONFLICT (id) DO NOTHING;
INSERT INTO "BotStatus" ("updatedAt") VALUES (now()) ON CONFLICT (id) DO NOTHING;
INSERT INTO "MercadoPagoOAuthState" (id, "stateHash", "codeVerifierEnc", "sessionEmail", "expiresAt")
VALUES ('legacy-state', 'legacy-hash', 'synthetic-pkce', 'fixture@example.invalid', now());
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM "MercadoPagoAccount" WHERE id = 1 AND "tenantId" IS NULL)
    OR NOT EXISTS (SELECT 1 FROM "BotStatus" WHERE id = 1 AND "tenantId" IS NULL)
    OR NOT EXISTS (SELECT 1 FROM "MercadoPagoOAuthState" WHERE id = 'legacy-state' AND "tenantId" IS NULL) THEN
    RAISE EXCEPTION 'Legacy writers cannot insert unowned rows';
  END IF;
END $$;
SQL
printf 'Integration expansion passed upgrade, constraints, legacy writes and clean install in disposable PostgreSQL.\n'
