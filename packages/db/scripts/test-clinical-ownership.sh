#!/usr/bin/env bash
# Verify clinical ownership using only a disposable local database.
set -euo pipefail
export LC_ALL=C
root=$(git -C "$(dirname "$0")" rev-parse --show-toplevel)
prisma="$root/node_modules/.bin/prisma"
schema="$root/packages/db/prisma"
base=20261120050343_integration_ownership
host=unix:///Users/leonel/.docker/run/docker.sock
[ "$(docker context inspect "$(docker context show)" --format '{{.Endpoints.docker.Host}}')" = "$host" ] || {
  echo 'The approved local Docker Unix socket is required.' >&2; exit 2;
}
d() { docker --host "$host" "$@"; }
[ -x "$prisma" ] || { echo 'Install the worktree dependencies first.' >&2; exit 2; }
scratch=$(mktemp -d /tmp/hu024-clinical.XXXXXX)
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
  --env POSTGRES_DB=hu024_clinical postgres:16-alpine)
for attempt in $(seq 1 50); do
  if d exec "$container" pg_isready -h 127.0.0.1 -U postgres -d hu024_clinical >/dev/null 2>&1; then break; fi
  [ "$attempt" -lt 50 ] || { echo 'Postgres did not become ready.' >&2; exit 1; }
  sleep 0.2
done
binding=$(d port "$container" 5432/tcp)
[[ "$binding" =~ ^127\.0\.0\.1:[0-9]+$ ]] || exit 2
cd "$scratch"
export DATABASE_URL="postgresql://postgres:$POSTGRES_PASSWORD@$binding/hu024_clinical"
unset DIRECT_URL SHADOW_DATABASE_URL
migrate() { "$prisma" migrate deploy --schema "$scratch/schema.prisma"; }
psql_in() {
  local database=$1
  shift
  d exec -i "$container" psql -X -q -v ON_ERROR_STOP=1 -U postgres -d "$database" "$@"
}
psql() { psql_in hu024_clinical "$@"; }
expect_owners() {
  local actual
  actual=$(psql_in "$1" -At <<'SQL'
SELECT jsonb_build_array(
  (SELECT jsonb_object_agg(id, "tenantId") FROM "Consultation"),
  (SELECT jsonb_object_agg(id, "tenantId") FROM "EvolutionEntry"),
  (SELECT jsonb_object_agg(id, "tenantId") FROM "NutritionPlan"),
  (SELECT jsonb_object_agg(id, "tenantId") FROM "AnthropometricReport")
);
SQL
  ) || return
  [ "$actual" = "$2" ] || { printf 'Wrong clinical owners: %s\n' "$actual" >&2; return 1; }
}
fixtures() {
  psql_in "$1" <<'SQL'
INSERT INTO "Tenant" (id) VALUES ('clinic-a'), ('clinic-b');
INSERT INTO "Patient" (id, "whatsappJid", phone, "tenantId", "updatedAt") VALUES
  ('a', 'synthetic-a', 'synthetic', 'clinic-a', now()),
  ('b', 'synthetic-b', 'synthetic', 'clinic-b', now()),
  ('u', 'synthetic-u', 'synthetic', NULL, now());
INSERT INTO "NutritionPlan" (id, "patientId", title, "pdfData", "updatedAt")
  SELECT id, id, 'Fixture', decode('af01', 'hex'), now() FROM "Patient";
INSERT INTO "Consultation" (id, "patientId", "planId", "consultedAt", notes, "updatedAt")
  SELECT id, id, id, now(), 'Fixture', now() FROM "Patient";
INSERT INTO "EvolutionEntry" (id, "patientId", "consultationId", "recordedAt", study, "weightKg")
  SELECT id, id, id, now(), 'ISAK', 70.12 FROM "Patient";
INSERT INTO "AnthropometricReport" (id, "isakEntryId", "pdfData", "pdfSourceKey", "updatedAt")
  SELECT id, id, decode('fe02', 'hex'), 'synthetic-key', now() FROM "EvolutionEntry";
-- Keep owned and unowned alternate anchors free of reports for FK tests.
INSERT INTO "EvolutionEntry" (id, "patientId", "recordedAt") VALUES
  ('b-alt', 'b', now()), ('u-alt', 'u', now());
SQL
}
snapshot() {
  psql -At <<'SQL'
SELECT jsonb_build_array(
  (SELECT jsonb_agg(to_jsonb(c) - 'tenantId' ORDER BY id) FROM "Consultation" c),
  (SELECT jsonb_agg(to_jsonb(e) - 'tenantId' ORDER BY id) FROM "EvolutionEntry" e),
  (SELECT jsonb_agg(to_jsonb(p) - 'tenantId' ORDER BY id) FROM "NutritionPlan" p),
  (SELECT jsonb_agg(to_jsonb(r) - 'tenantId' ORDER BY id) FROM "AnthropometricReport" r)
);
SQL
}
migrate
fixtures hu024_clinical
before=$(snapshot)
for path in "$schema"/migrations/*_clinical_ownership/; do
  if [ -d "$path" ]; then cp -R "${path%/}" "$scratch/migrations/"; fi
done
migrate
owned='{"a": "clinic-a", "b": "clinic-b", "u": null}'
expect_owners hu024_clinical "[$owned, {\"a\": \"clinic-a\", \"b\": \"clinic-b\", \"u\": null, \"b-alt\": \"clinic-b\", \"u-alt\": null}, $owned, $owned]"
psql <<'SQL'
DO $$ DECLARE
  rel text;
  anchor text;
  target text;
  violated text;
BEGIN
  FOR rel, anchor IN VALUES ('Consultation', 'patientId'), ('EvolutionEntry', 'patientId'),
    ('NutritionPlan', 'patientId'), ('AnthropometricReport', 'isakEntryId') LOOP
    FOREACH target IN ARRAY CASE WHEN anchor = 'isakEntryId' THEN ARRAY['b-alt', 'u-alt'] ELSE ARRAY['b', 'u'] END LOOP
      BEGIN
        EXECUTE format('UPDATE %I SET %I = $1 WHERE id = %L', rel, anchor, 'a') USING target;
        RAISE EXCEPTION '% accepted wrong ownership anchor %', rel, target;
      EXCEPTION WHEN foreign_key_violation THEN
        GET STACKED DIAGNOSTICS violated = CONSTRAINT_NAME;
        IF violated <> rel || '_' || anchor || '_tenantId_fkey' THEN RAISE; END IF;
      END;
    END LOOP;
  END LOOP;
END $$;
SQL
[ "$(snapshot)" = "$before" ] || { echo 'Preexisting clinical rows or columns changed.' >&2; exit 1; }
expect_owners hu024_clinical "[$owned, {\"a\": \"clinic-a\", \"b\": \"clinic-b\", \"u\": null, \"b-alt\": \"clinic-b\", \"u-alt\": null}, $owned, $owned]"
psql <<'SQL'
DELETE FROM "EvolutionEntry" WHERE id = 'a';
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM "AnthropometricReport" WHERE id = 'a') THEN
    RAISE EXCEPTION 'Entry cascade did not delete its owned report';
  END IF;
END $$;
DELETE FROM "Patient" WHERE id IN ('b', 'u');
SQL
expect_owners hu024_clinical '[{"a": "clinic-a"}, null, {"a": "clinic-a"}, null]'
d exec "$container" createdb -U postgres hu024_clinical_fresh
DATABASE_URL="postgresql://postgres:$POSTGRES_PASSWORD@$binding/hu024_clinical_fresh" migrate
expect_owners hu024_clinical_fresh '[null, null, null, null]'
fixtures hu024_clinical_fresh
unowned='{"a": null, "b": null, "u": null}'
expect_owners hu024_clinical_fresh "[$unowned, {\"a\": null, \"b\": null, \"u\": null, \"b-alt\": null, \"u-alt\": null}, $unowned, $unowned]"
printf 'Clinical expansion passed upgrade, constraints, cascades, legacy writes and clean install in disposable PostgreSQL.\n'
