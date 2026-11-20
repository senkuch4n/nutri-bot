#!/usr/bin/env bash
# Verify the scheduling ownership expansion using only a disposable local database.
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
scratch=$(mktemp -d "$root/.git-scheduling-test.XXXXXX")
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
  if [[ "$name" < "$foundation" || "$name" == "$foundation" ]]; then cp -R "${path%/}" "$scratch/migrations/"; fi
done
export POSTGRES_PASSWORD
POSTGRES_PASSWORD=$(openssl rand -hex 18)
container=$(d run --pull=never --rm --detach --publish '127.0.0.1::5432' \
  --tmpfs /var/lib/postgresql/data:rw --env POSTGRES_PASSWORD \
  --env POSTGRES_DB=hu024_scheduling postgres:16-alpine)
for attempt in $(seq 1 50); do
  if d exec "$container" pg_isready -h 127.0.0.1 -U postgres -d hu024_scheduling >/dev/null 2>&1; then break; fi
  [ "$attempt" -lt 50 ] || { echo 'Postgres did not become ready.' >&2; exit 1; }
  sleep 0.2
done
binding=$(d port "$container" 5432/tcp)
[[ "$binding" =~ ^127\.0\.0\.1:[0-9]+$ ]] || exit 2
cd "$scratch"
export DATABASE_URL="postgresql://postgres:$POSTGRES_PASSWORD@$binding/hu024_scheduling"
unset DIRECT_URL SHADOW_DATABASE_URL
migrate() { "$prisma" migrate deploy --schema "$scratch/schema.prisma"; }
psql_in() {
  local database=$1
  shift
  d exec -i "$container" psql -X -q -v ON_ERROR_STOP=1 -U postgres -d "$database" "$@"
}
psql() { psql_in hu024_scheduling "$@"; }
migrate
psql <<'SQL'
INSERT INTO "Professional" (id, name, email, "updatedAt", "tenantId") VALUES (1, 'Synthetic legacy', 'fixture@example.invalid', now(), 'legacy-tenant');
INSERT INTO "Agenda" (id, "tenantId", "professionalId", "isPrimary") VALUES ('legacy-agenda', 'legacy-tenant', 1, true);
INSERT INTO "Patient" (id, "whatsappJid", phone, "updatedAt") VALUES ('p1', 'fixture@example.invalid', '0000', now());
INSERT INTO "Service" (id, name, price, "durationMin", "updatedAt") VALUES ('s1', 'Synthetic service', 100, 60, now());
INSERT INTO "AvailabilityRule" (id, weekday, "startTime", "endTime") VALUES ('ar1', 1, '09:00', '18:00');
INSERT INTO "AvailabilityException" (id, date, type) VALUES ('ex1', '2026-12-02', 'BLOCKED');
INSERT INTO "Appointment" (id, "patientId", "serviceId", "startsAt", "endsAt", "createdBy", "priceSnapshot", "updatedAt") VALUES ('a1', 'p1', 's1', '2026-12-01 09:00', '2026-12-01 10:00', 'PROFESSIONAL', 100, now());
INSERT INTO "Payment" (id, "appointmentId", kind, amount, "updatedAt") VALUES ('pay1', 'a1', 'DEPOSIT', 20, now());
SQL
legacy_snapshot() {
  psql -At <<'SQL'
SELECT jsonb_build_object(
  'appointments', (SELECT jsonb_agg(to_jsonb(a) - 'tenantId' - 'agendaId' ORDER BY a.id) FROM "Appointment" a),
  'patients', (SELECT jsonb_agg(to_jsonb(p) - 'tenantId' ORDER BY p.id) FROM "Patient" p),
  'services', (SELECT jsonb_agg(to_jsonb(s) - 'tenantId' ORDER BY s.id) FROM "Service" s),
  'rules', (SELECT jsonb_agg(to_jsonb(r) - 'agendaId' ORDER BY r.id) FROM "AvailabilityRule" r),
  'exceptions', (SELECT jsonb_agg(to_jsonb(e) - 'agendaId' ORDER BY e.id) FROM "AvailabilityException" e),
  'payments', (SELECT jsonb_agg(to_jsonb(p) ORDER BY p.id) FROM "Payment" p)
);
SQL
}
legacy_before=$(legacy_snapshot)
d exec "$container" createdb -U postgres --template=hu024_scheduling hu024_no_agenda
psql_in hu024_no_agenda -c 'DELETE FROM "Agenda" WHERE id = '\''legacy-agenda'\'';'
for path in "$schema"/migrations/*_scheduling_ownership/; do
  if [ -d "$path" ]; then cp -R "${path%/}" "$scratch/migrations/"; fi
done
migrate
[ "$(legacy_snapshot)" = "$legacy_before" ] || { echo 'Preexisting scheduling columns or rows changed.' >&2; exit 1; }
psql <<'SQL'
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM "Appointment" a
    JOIN "Patient" p ON p.id = a."patientId" AND p."tenantId" = a."tenantId"
    JOIN "Service" s ON s.id = a."serviceId" AND s."tenantId" = a."tenantId"
    JOIN "Agenda" g ON g.id = a."agendaId" AND g."tenantId" = a."tenantId"
    JOIN "Payment" pay ON pay."appointmentId" = a.id
    WHERE a.id = 'a1' AND p.id = 'p1' AND s.id = 's1' AND g.id = 'legacy-agenda'
      AND a."tenantId" = 'legacy-tenant' AND pay.id = 'pay1' AND pay.amount = 20
  ) OR NOT EXISTS (SELECT 1 FROM "AvailabilityRule" WHERE id = 'ar1' AND "agendaId" = 'legacy-agenda')
    OR NOT EXISTS (SELECT 1 FROM "AvailabilityException" WHERE id = 'ex1' AND "agendaId" = 'legacy-agenda') THEN
    RAISE EXCEPTION 'Scheduling ownership migration did not preserve and scope all legacy rows';
  END IF;
END $$;
INSERT INTO "Tenant" (id) VALUES ('other-tenant');
INSERT INTO "Professional" (id, "tenantId", name, email, "updatedAt") VALUES (2, 'other-tenant', 'Other profile', 'other@example.invalid', now());
INSERT INTO "Agenda" (id, "tenantId", "professionalId", "isPrimary") VALUES ('other-agenda', 'other-tenant', 2, true);
INSERT INTO "Patient" (id, "tenantId", "whatsappJid", phone, "updatedAt") VALUES ('p2', 'other-tenant', 'other@example.invalid', '0001', now());
INSERT INTO "Service" (id, "tenantId", name, price, "durationMin", "updatedAt") VALUES ('s2', 'other-tenant', 'Other service', 100, 60, now());
DO $$ BEGIN
  BEGIN
    UPDATE "Appointment" SET "patientId" = 'p2' WHERE id = 'a1';
    RAISE EXCEPTION 'Appointment accepted a cross-tenant patient';
  EXCEPTION WHEN foreign_key_violation THEN NULL; END;
  BEGIN
    UPDATE "Appointment" SET "serviceId" = 's2' WHERE id = 'a1';
    RAISE EXCEPTION 'Appointment accepted a cross-tenant service';
  EXCEPTION WHEN foreign_key_violation THEN NULL; END;
  BEGIN
    UPDATE "Appointment" SET "agendaId" = 'other-agenda' WHERE id = 'a1';
    RAISE EXCEPTION 'Appointment accepted a cross-tenant agenda';
  EXCEPTION WHEN foreign_key_violation THEN NULL; END;
  BEGIN
    UPDATE "Appointment" SET "agendaId" = NULL WHERE id = 'a1';
    RAISE EXCEPTION 'Appointment accepted incomplete ownership';
  EXCEPTION WHEN check_violation THEN NULL; END;
  IF NOT EXISTS (SELECT 1 FROM "Appointment" WHERE id='a1' AND "patientId"='p1' AND "serviceId"='s1' AND "agendaId"='legacy-agenda') THEN
    RAISE EXCEPTION 'Rejected writes did not preserve the booking';
  END IF;
END $$;
-- Former app binaries still insert without ownership keys during expansion.
INSERT INTO "Patient" (id, "whatsappJid", phone, "updatedAt") VALUES ('legacy-patient', 'legacy-write@example.invalid', '0002', now());
INSERT INTO "Service" (id, name, price, "durationMin", "updatedAt") VALUES ('legacy-service', 'Legacy writer service', 100, 60, now());
INSERT INTO "AvailabilityRule" (id, weekday, "startTime", "endTime") VALUES ('legacy-rule', 2, '09:00', '18:00');
INSERT INTO "AvailabilityException" (id, date, type) VALUES ('legacy-exception', '2026-12-03', 'BLOCKED');
INSERT INTO "Appointment" (id, "patientId", "serviceId", "startsAt", "endsAt", "createdBy", "priceSnapshot", "updatedAt") VALUES ('legacy-write', 'legacy-patient', 'legacy-service', '2026-12-02 09:00', '2026-12-02 10:00', 'PROFESSIONAL', 100, now());
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM "Appointment" WHERE id = 'legacy-write' AND "tenantId" IS NULL AND "agendaId" IS NULL)
     OR NOT EXISTS (SELECT 1 FROM "Patient" WHERE id = 'legacy-patient' AND "tenantId" IS NULL)
     OR NOT EXISTS (SELECT 1 FROM "Service" WHERE id = 'legacy-service' AND "tenantId" IS NULL)
     OR NOT EXISTS (SELECT 1 FROM "AvailabilityRule" WHERE id = 'legacy-rule' AND "agendaId" IS NULL)
     OR NOT EXISTS (SELECT 1 FROM "AvailabilityException" WHERE id = 'legacy-exception' AND "agendaId" IS NULL) THEN
    RAISE EXCEPTION 'Legacy writes were not preserved as unowned during expansion';
  END IF;
END $$;
SQL
d exec "$container" createdb -U postgres hu024_scheduling_fresh
DATABASE_URL="postgresql://postgres:$POSTGRES_PASSWORD@$binding/hu024_scheduling_fresh" migrate
psql_in hu024_scheduling_fresh <<'SQL'
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM "Appointment" WHERE "tenantId" IS NOT NULL)
     OR (SELECT count(*) FROM "Tenant") <> 1 OR EXISTS (SELECT 1 FROM "Agenda") THEN
    RAISE EXCEPTION 'Unexpected ownership records on a fresh installation';
  END IF;
END $$;
SQL
# Run the failing SQL through psql to retain the original error instead of Prisma's aborted-transaction summary.
if missing_agenda=$(psql_in hu024_no_agenda < "$scratch"/migrations/*_scheduling_ownership/migration.sql 2>&1); then
  echo 'Migration accepted existing scheduling data without the original agenda.' >&2
  exit 1
fi
if ! grep -F 'Scheduling ownership requires the original primary agenda for existing scheduling data' <<< "$missing_agenda" >/dev/null; then
  printf 'Migration failed for an unexpected reason:\n%s\n' "$missing_agenda" >&2
  exit 1
fi
psql_in hu024_no_agenda <<'SQL'
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'Appointment' AND column_name = 'tenantId')
     OR NOT EXISTS (SELECT 1 FROM "Appointment" WHERE id = 'a1') THEN
    RAISE EXCEPTION 'Failed migration did not roll back scheduling schema and records';
  END IF;
END $$;
SQL
printf 'Scheduling expansion passed upgrade, legacy writes, clean install and missing-agenda rollback in disposable PostgreSQL.\n'
