#!/usr/bin/env bash
# Exercise only synthetic outbox rows in a disposable local PostgreSQL instance.
set -euo pipefail
export LC_ALL=C
root=$(git -C "$(dirname "$0")" rev-parse --show-toplevel)
prisma="$root/node_modules/.bin/prisma"
schema="$root/packages/db/prisma"
host=unix:///Users/leonel/.docker/run/docker.sock
d() { docker --host "$host" "$@"; }
[ -x "$prisma" ] || { echo 'Install the worktree dependencies first.' >&2; exit 2; }
scratch=$(mktemp -d /tmp/hu024-outbound.XXXXXX)
container=
cleanup() {
  if [ -n "$container" ]; then d stop "$container" >/dev/null; fi
  rm -rf -- "$scratch"
}
trap cleanup EXIT
mkdir "$scratch/migrations"
cp "$schema/schema.prisma" "$scratch/schema.prisma"
cp "$schema/migrations/migration_lock.toml" "$scratch/migrations/"
base=20261120051136_clinical_ownership
for path in "$schema"/migrations/*/; do
  name=$(basename "$path")
  if [[ "$name" < "$base" || "$name" == "$base" ]]; then cp -R "${path%/}" "$scratch/migrations/"; fi
done
export POSTGRES_PASSWORD
POSTGRES_PASSWORD=$(openssl rand -hex 18)
container=$(d run --pull=never --rm --detach --publish '127.0.0.1::5432' \
  --tmpfs /var/lib/postgresql/data:rw --env POSTGRES_PASSWORD \
  --env POSTGRES_DB=outbound_upgrade postgres:16-alpine)
for attempt in $(seq 1 50); do
  if d exec "$container" pg_isready -h 127.0.0.1 -U postgres -d outbound_upgrade >/dev/null 2>&1; then break; fi
  [ "$attempt" -lt 50 ] || { echo 'Postgres did not become ready.' >&2; exit 1; }
  sleep 0.2
done
binding=$(d port "$container" 5432/tcp)
[[ "$binding" =~ ^127\.0\.0\.1:[0-9]+$ ]] || exit 2
cd "$scratch"
unset DIRECT_URL SHADOW_DATABASE_URL
migrate() {
  local output
  output=$(DATABASE_URL="postgresql://postgres:$POSTGRES_PASSWORD@$binding/$1" \
    "$prisma" migrate deploy --schema "$scratch/schema.prisma" 2>&1) || { printf '%s\n' "$output" >&2; return 1; }
}
psql_in() {
  local database=$1; shift
  d exec -i "$container" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d "$database" "$@"
}
upgrade() { psql_in outbound_upgrade "$@"; }
snapshot() { psql_in "$1" -c 'SELECT jsonb_agg(to_jsonb(m) - '\''tenantId'\'' ORDER BY id) FROM "OutboundMessage" m'; }
fail() { printf '%s\n' "$1" >&2; exit 1; }

migrate outbound_upgrade
upgrade <<'SQL'
INSERT INTO "Tenant" (id) VALUES ('a'), ('b');
INSERT INTO "Professional" (id, "tenantId", name, email, "updatedAt") VALUES
  (2, 'a', 'Synthetic A', 'a@example.invalid', now()), (3, 'b', 'Synthetic B', 'b@example.invalid', now());
INSERT INTO "Agenda" (id, "tenantId", "professionalId") VALUES ('a', 'a', 2), ('b', 'b', 3);
INSERT INTO "Patient" (id, "whatsappJid", phone, "tenantId", "updatedAt") VALUES
  ('a', 'synthetic-a', 'synthetic', 'a', now()), ('b', 'synthetic-b', 'synthetic', 'b', now()),
  ('u', 'synthetic-u', 'synthetic', NULL, now());
INSERT INTO "Service" (id, "tenantId", name, price, "durationMin", "updatedAt")
  SELECT id, "tenantId", 'Synthetic', 1, 30, now() FROM "Patient";
INSERT INTO "Appointment" (id, "patientId", "serviceId", "tenantId", "agendaId", "startsAt", "endsAt", "createdBy", "priceSnapshot", "updatedAt")
  SELECT id, id, id, "tenantId", "tenantId", now(), now() + interval '30 min', 'PROFESSIONAL', 1, now() FROM "Patient";
INSERT INTO "NutritionPlan" (id, "patientId", "tenantId", title, "updatedAt")
  SELECT id, id, "tenantId", 'Synthetic', now() FROM "Patient";
INSERT INTO "EvolutionEntry" (id, "patientId", "tenantId", "recordedAt")
  SELECT id, id, "tenantId", now() FROM "Patient";
INSERT INTO "AnthropometricReport" (id, "isakEntryId", "tenantId", "updatedAt")
  SELECT id, id, "tenantId", now() FROM "EvolutionEntry";
INSERT INTO "OutboundMessage" (id, "toJid", body, kind, status, attempts, "lastError", "appointmentId", "planId", "anthropometricReportId", "dedupeKey", "sentAt")
  SELECT id, 'synthetic', 'Fixture', 'AD_HOC', 'SENT', 2, 'Fixture error', appt, plan, report, id, now()
  FROM (VALUES ('all-a','a','a','a'),('appt','b',NULL,NULL),('plan',NULL,'b',NULL),
    ('report',NULL,NULL,'b'),('none',NULL,NULL,NULL),('missing','a','u','a'),('unowned','u','u','u')) f(id, appt, plan, report);
SQL
before=$(snapshot outbound_upgrade)
d exec "$container" createdb -U postgres -T outbound_upgrade outbound_conflict
psql_in outbound_conflict <<'SQL'
INSERT INTO "OutboundMessage" (id, "toJid", body, kind, "appointmentId", "planId", "anthropometricReportId")
VALUES ('conflict', 'synthetic', 'Fixture', 'AD_HOC', 'a', 'b', 'u');
SQL
conflict_before=$(snapshot outbound_conflict)
for path in "$schema"/migrations/*_outbound_ownership/; do
  if [ -d "$path" ]; then cp -R "${path%/}" "$scratch/migrations/"; fi
done
migrate outbound_upgrade
owners=$(upgrade -c 'SELECT jsonb_object_agg(id, "tenantId") FROM "OutboundMessage"')
[ "$owners" = '{"appt": "b", "none": "legacy-tenant", "plan": "b", "all-a": "a", "report": "b", "missing": null, "unowned": null}' ] || fail "Wrong outbox owners: $owners"
upgrade <<'SQL'
DO $$ DECLARE
  col text;
  target text;
  violated text;
BEGIN
  FOREACH col IN ARRAY ARRAY['appointmentId', 'planId', 'anthropometricReportId'] LOOP
    FOREACH target IN ARRAY ARRAY['b', 'u'] LOOP
      BEGIN
        EXECUTE format('UPDATE "OutboundMessage" SET %I = $1 WHERE id = ''all-a''', col) USING target;
        RAISE EXCEPTION 'Accepted wrong owner on %', col;
      EXCEPTION WHEN foreign_key_violation THEN
        GET STACKED DIAGNOSTICS violated = CONSTRAINT_NAME;
        IF violated <> 'OutboundMessage_' || col || '_tenantId_fkey' THEN RAISE; END IF;
      END;
    END LOOP;
  END LOOP;
  BEGIN
    UPDATE "OutboundMessage" SET "tenantId" = 'unknown' WHERE id = 'none';
    RAISE EXCEPTION 'Accepted nonexistent direct tenant';
  EXCEPTION WHEN foreign_key_violation THEN
    GET STACKED DIAGNOSTICS violated = CONSTRAINT_NAME;
    IF violated <> 'OutboundMessage_tenantId_fkey' THEN RAISE; END IF;
  END;
  BEGIN
    INSERT INTO "OutboundMessage" (id, "toJid", body, kind, "appointmentId", "dedupeKey")
      VALUES ('duplicate', 'synthetic', 'Fixture', 'AD_HOC', 'a', 'all-a');
    RAISE EXCEPTION 'Accepted duplicate legacy message';
  EXCEPTION WHEN unique_violation THEN
    GET STACKED DIAGNOSTICS violated = CONSTRAINT_NAME;
    IF violated <> 'OutboundMessage_appointmentId_kind_dedupeKey_key' THEN RAISE; END IF;
  END;
END $$;
SQL
[ "$(snapshot outbound_upgrade)" = "$before" ] || fail 'Preexisting outbox data or columns changed.'
[ "$(upgrade -c 'SELECT jsonb_object_agg(id, "tenantId") FROM "OutboundMessage"')" = "$owners" ] || fail 'Rejected writes changed outbox owners.'
upgrade <<'SQL'
INSERT INTO "OutboundMessage" (id, "toJid", body, kind, "appointmentId", "planId", "anthropometricReportId")
  VALUES ('legacy', 'synthetic', 'Fixture', 'AD_HOC', 'a', 'b', 'u');
DELETE FROM "Appointment" WHERE id = 'a';
DELETE FROM "NutritionPlan" WHERE id = 'a';
DELETE FROM "AnthropometricReport" WHERE id = 'a';
SQL
[ "$(upgrade -c 'SELECT jsonb_build_array("tenantId", "appointmentId", "planId", "anthropometricReportId") FROM "OutboundMessage" WHERE id IN ('\''all-a'\'', '\''legacy'\'') ORDER BY id')" = $'["a", null, null, null]\n[null, null, "b", "u"]' ] || fail 'Deletion or legacy insert changed ownership or unrelated references.'

if conflict=$(migrate outbound_conflict 2>&1); then fail 'Accepted conflicting historical owners.'; fi
[[ "$conflict" == *'current transaction is aborted'* || "$conflict" == *'OutboundMessage has conflicting historical tenant owners'* ]] || fail "$conflict"
# Prisma can report the transaction-aborted error instead of the first SQL error.
# Replay with stop-on-error to assert the precise rejection reason.
conflict_exit=0
conflict=$(psql_in outbound_conflict < "$scratch"/migrations/*_outbound_ownership/migration.sql 2>&1) || conflict_exit=$?
[ "$conflict_exit" = 3 ] && [ "$conflict" = $'ERROR:  OutboundMessage has conflicting historical tenant owners\nCONTEXT:  PL/pgSQL function inline_code_block line 3 at RAISE' ] || fail "$conflict"
[ "$(snapshot outbound_conflict)" = "$conflict_before" ] || fail 'Failed migration changed historical rows.'
[ "$(psql_in outbound_conflict -c "SELECT count(*) FROM information_schema.columns WHERE table_name = 'OutboundMessage' AND column_name = 'tenantId'")" = 0 ] || fail 'Failed migration left an ownership column.'

d exec "$container" createdb -U postgres outbound_fresh
migrate outbound_fresh
[ "$(psql_in outbound_fresh -c 'SELECT count(*) FROM "OutboundMessage"')" = 0 ] || fail 'Clean install created messages.'
psql_in outbound_fresh <<'SQL'
INSERT INTO "OutboundMessage" (id, "toJid", body, kind) VALUES ('legacy', 'synthetic', 'Fixture', 'AD_HOC');
INSERT INTO "OutboundMessage" (id, "toJid", body, kind, "tenantId") VALUES ('owned', 'synthetic', 'Fixture', 'AD_HOC', 'legacy-tenant');
SQL
[ "$(psql_in outbound_fresh -c 'SELECT jsonb_object_agg(id, "tenantId") FROM "OutboundMessage"')" = '{"owned": "legacy-tenant", "legacy": null}' ] || fail 'Wrong owners on clean install.'
printf 'Outbox expansion passed upgrade, conflicts, constraints, deletion, legacy writes and clean install in disposable PostgreSQL.\n'
