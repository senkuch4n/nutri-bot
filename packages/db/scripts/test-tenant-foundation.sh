#!/usr/bin/env bash
# Exercise the tenant foundation migration on a disposable Postgres instance only.
set -euo pipefail
export LC_ALL=C
root=$(git -C "$(dirname "$0")" rev-parse --show-toplevel)
prisma="$root/node_modules/.bin/prisma"
schema="$root/packages/db/prisma"
foundation=20261120042923_tenant_foundation
context=$(docker context show)
host=$(docker context inspect "$context" --format '{{.Endpoints.docker.Host}}')
case "$host" in unix://*) ;; *) echo 'A local Docker Unix socket is required.' >&2; exit 2;; esac
d() { docker --host "$host" "$@"; }
[ -x "$prisma" ] || { echo 'Install the worktree dependencies first.' >&2; exit 2; }
scratch=$(mktemp -d "$root/.git-tenant-test.XXXXXX")
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
  if [[ "$name" < "$foundation" ]]; then cp -R "${path%/}" "$scratch/migrations/"; fi
done
export POSTGRES_PASSWORD
POSTGRES_PASSWORD=$(openssl rand -hex 18)
container=$(d run --pull=never --rm --detach --publish '127.0.0.1::5432' \
  --tmpfs /var/lib/postgresql/data:rw --env POSTGRES_PASSWORD \
  --env POSTGRES_DB=hu024_foundation postgres:16-alpine)
for attempt in $(seq 1 50); do
  if d exec "$container" pg_isready -h 127.0.0.1 -U postgres -d hu024_foundation >/dev/null 2>&1; then break; fi
  [ "$attempt" -lt 50 ] || { echo 'Postgres did not become ready.' >&2; exit 1; }
  sleep 0.2
done
binding=$(d port "$container" 5432/tcp)
[[ "$binding" =~ ^127\.0\.0\.1:[0-9]+$ ]] || exit 2
cd "$scratch"
export DATABASE_URL="postgresql://postgres:$POSTGRES_PASSWORD@$binding/hu024_foundation"
unset DIRECT_URL SHADOW_DATABASE_URL
migrate() { "$prisma" migrate deploy --schema "$scratch/schema.prisma"; }
psql() { d exec -i "$container" psql -X -q -v ON_ERROR_STOP=1 -U postgres -d hu024_foundation "$@"; }
migrate
psql <<'SQL'
INSERT INTO "Professional" ("id", "name", "email", "timezone", "googleRefreshToken", "signatureData", "updatedAt")
VALUES (42, 'Legacy fixture', 'legacy@example.invalid', 'America/Argentina/Cordoba',
        'synthetic-calendar-value', decode('cafe', 'hex'), TIMESTAMP '2026-01-02 03:04:05');
INSERT INTO "Patient" (id, "whatsappJid", phone, name, "updatedAt")
VALUES ('patient-fixture', 'synthetic-patient@example.invalid', '0000', 'Synthetic patient', CURRENT_TIMESTAMP);
INSERT INTO "DiaryEntry" (id, "patientId", note)
VALUES ('diary-fixture', 'patient-fixture', 'Synthetic linked entry');
INSERT INTO "MercadoPagoAccount" (id, "userId", "accessTokenEnc", "updatedAt")
VALUES (1, 'synthetic-payee', 'synthetic-encrypted-value', CURRENT_TIMESTAMP);
SQL
legacy_snapshot() {
  psql -At <<'SQL'
SELECT jsonb_build_object(
  'profiles', (SELECT jsonb_agg(to_jsonb(p) - 'tenantId' ORDER BY p.id) FROM "Professional" p),
  'patients', (SELECT jsonb_agg(to_jsonb(p) ORDER BY p.id) FROM "Patient" p),
  'diary', (SELECT jsonb_agg(to_jsonb(d) ORDER BY d.id) FROM "DiaryEntry" d),
  'accounts', (SELECT jsonb_agg(to_jsonb(a) ORDER BY a.id) FROM "MercadoPagoAccount" a)
);
SQL
}
legacy_before=$(legacy_snapshot)
if [ -d "$schema/migrations/$foundation" ]; then cp -R "$schema/migrations/$foundation" "$scratch/migrations/"; fi
migrate
[ "$(legacy_snapshot)" = "$legacy_before" ] || { echo 'Legacy columns or related rows changed.' >&2; exit 1; }
psql <<'SQL'
DO $$ BEGIN
  IF (SELECT count(*) FROM "Tenant") <> 1 OR NOT EXISTS (
    SELECT 1 FROM "Professional" p
    JOIN "Agenda" a ON a."professionalId" = p.id AND a."tenantId" = p."tenantId"
    JOIN "Tenant" t ON t.id = p."tenantId"
    WHERE p.id = 42 AND p.name = 'Legacy fixture' AND a."isPrimary"
  ) THEN RAISE EXCEPTION 'Legacy ownership or primary agenda was not preserved'; END IF;
  IF EXISTS (SELECT 1 FROM "User") OR EXISTS (SELECT 1 FROM "TenantMembership") THEN
    RAISE EXCEPTION 'Migration granted access based on legacy professional data';
  END IF;
END $$;
INSERT INTO "Tenant" (id) VALUES ('other-tenant');
INSERT INTO "User" (id, email) VALUES ('independent-user', 'member@example.invalid');
INSERT INTO "TenantMembership" ("tenantId", "userId", role) VALUES ('other-tenant', 'independent-user', 'STAFF');
INSERT INTO "Professional" (id, name, email, "updatedAt", "tenantId")
SELECT 43, 'Future fixture', 'future@example.invalid', CURRENT_TIMESTAMP, "tenantId" FROM "Professional" WHERE id = 42;
INSERT INTO "Agenda" (id, "tenantId", "professionalId", "isPrimary")
SELECT 'future-agenda', "tenantId", 43, false FROM "Professional" WHERE id = 42;
DO $$ BEGIN
  BEGIN
    INSERT INTO "Agenda" (id, "tenantId", "professionalId", "isPrimary") VALUES ('crossed', 'other-tenant', 42, true);
    RAISE EXCEPTION 'Cross-tenant agenda accepted';
  EXCEPTION WHEN foreign_key_violation THEN NULL; END;
  BEGIN
    INSERT INTO "Agenda" (id, "tenantId", "professionalId", "isPrimary")
    SELECT 'duplicate-primary', "tenantId", 43, true FROM "Professional" WHERE id = 42;
    RAISE EXCEPTION 'Second primary agenda accepted';
  EXCEPTION WHEN unique_violation THEN NULL; END;
  IF NOT EXISTS (SELECT 1 FROM "Agenda" WHERE id = 'future-agenda') OR EXISTS (
    SELECT 1 FROM "Agenda" WHERE id IN ('crossed', 'duplicate-primary')
  ) THEN RAISE EXCEPTION 'Accepted or rejected rows differ from the contract'; END IF;
END $$;
SQL
d exec "$container" createdb -U postgres hu024_fresh
DATABASE_URL="postgresql://postgres:$POSTGRES_PASSWORD@$binding/hu024_fresh" migrate
d exec -i "$container" psql -X -q -v ON_ERROR_STOP=1 -U postgres -d hu024_fresh <<'SQL'
DO $$ BEGIN
  IF (SELECT count(*) FROM "Tenant") <> 1 OR EXISTS (SELECT 1 FROM "Professional")
     OR EXISTS (SELECT 1 FROM "Agenda") OR EXISTS (SELECT 1 FROM "User") THEN
    RAISE EXCEPTION 'A fresh install did not create exactly one unassigned tenant';
  END IF;
END $$;
SQL
printf 'Tenant foundation migration passed on upgrade and fresh install against disposable PostgreSQL.\n'
