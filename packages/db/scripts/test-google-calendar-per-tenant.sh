#!/usr/bin/env bash
# HU-028b (§B10.5): migración google_calendar_account con datos tipo producción, traslado del token de la
# instalación original (google-calendar-transfer.ts), probe de dos consultorios
# (google-calendar-per-tenant.integration.ts) y chequeo de drift.
# Solo Postgres descartable: contenedor y red propios, tmpfs, puerto 127.0.0.1 aleatorio, password aleatoria,
# copia del schema y de las migraciones fuera del repo. Nunca carga el .env del repo ni toca la base de desarrollo.
# Nunca hay red real hacia Google: el OAuth usa deps.fetch falso y la sync, deps.events falso.
set -euo pipefail
umask 077

root=$(git -C "$(dirname "$0")" rev-parse --show-toplevel)
source_schema="$root/packages/db/prisma"
prisma_cli="$root/node_modules/.bin/prisma"
tsx_cli="$root/node_modules/.bin/tsx"
transfer="$root/packages/db/scripts/google-calendar-transfer.ts"
target=google_calendar_account
[[ -x $prisma_cli && -x $tsx_cli ]] || { echo 'Local prisma and tsx CLIs are required (npm install).' >&2; exit 2; }
docker info >/dev/null 2>&1 || { echo 'Docker is not available in this environment.' >&2; exit 3; }
docker image inspect postgres:16-alpine >/dev/null 2>&1 ||
  { echo 'Image postgres:16-alpine is not present locally (this probe never pulls).' >&2; exit 3; }
compgen -G "$source_schema/migrations/*_$target" >/dev/null || { echo "Migration $target not found." >&2; exit 2; }

scratch=$(mktemp -d "${TMPDIR:-/tmp}/hu028b-gcal-tenants.XXXXXXXXXX")
name="hu028b-gcal-tenants-$(openssl rand -hex 6)"
container= network=
cleanup() {
  if [[ -n $container ]]; then docker stop -t 1 "$container" >/dev/null 2>&1 || true; fi
  if [[ -n $network ]]; then docker network rm "$network" >/dev/null 2>&1 || true; fi
  rm -rf -- "$scratch"
}
trap cleanup EXIT

# Dos copias: las migraciones anteriores a la de 028b (pre/) y todas (full/).
mkdir -p "$scratch"/{home,tmp,pre/migrations,full}
cp "$source_schema/schema.prisma" "$scratch/pre/"
cp "$source_schema/migrations/migration_lock.toml" "$scratch/pre/migrations/"
for path in "$source_schema"/migrations/*/; do
  migration=$(basename "$path")
  [[ $migration == *_"$target" ]] && break
  cp -R "${path%/}" "$scratch/pre/migrations/"
done
cp "$source_schema/schema.prisma" "$scratch/full/"
cp -R "$source_schema/migrations" "$scratch/full/"

network=$(docker network create --label "hu028b.gcal-tenants=$name" "$name")
pass=$(openssl rand -hex 18)
container=$(docker run --pull never --rm -d --name "$name" --network "$network" --label "hu028b.gcal-tenants=$name" \
  --tmpfs /var/lib/postgresql/data:rw -e POSTGRES_PASSWORD="$pass" -e POSTGRES_DB=gc_tenants \
  -p 127.0.0.1::5432 postgres:16-alpine)
for attempt in $(seq 1 60); do
  docker exec "$container" pg_isready -h 127.0.0.1 -U postgres -d gc_tenants >/dev/null 2>&1 && break
  [[ $attempt != 60 ]] || { echo 'Disposable PostgreSQL did not start.' >&2; exit 2; }
  sleep 0.2
done
binding=$(docker port "$container" 5432/tcp | head -n 1)
[[ $binding =~ ^127\.0\.0\.1:[0-9]+$ ]] || { echo 'Unexpected port binding.' >&2; exit 2; }
docker exec "$container" createdb -U postgres gc_fresh

unset DIRECT_URL SHADOW_DATABASE_URL INTEGRATION_TOKEN_KEY GOOGLE_CALENDAR_OWNER_EMAIL
url() { echo "postgresql://postgres:$pass@$binding/$1"; }
# Toda escritura exige una URL descartable de este probe.
for db in gc_tenants gc_fresh; do
  [[ $(url "$db") =~ ^postgresql://postgres:[a-f0-9]{36}@127\.0\.0\.1:[0-9]+/gc_[a-z_]+$ ]] || exit 2
done
run_env() { env -u NODE_OPTIONS -u INTEGRATION_TOKEN_KEY -u GOOGLE_CALENDAR_OWNER_EMAIL HOME="$scratch/home" TMPDIR="$scratch/tmp" NO_UPDATE_NOTIFIER=1 PRISMA_HIDE_UPDATE_MESSAGE=1 "$@"; }
deploy() { DATABASE_URL=$(url "$1") run_env "$prisma_cli" migrate deploy --schema "$scratch/$2/schema.prisma" >/dev/null; }
psql_db() { local db=$1; shift; docker exec -i "$container" psql -X -q -At -v ON_ERROR_STOP=1 -U postgres -d "$db" "$@"; }
transfer_cli() { DATABASE_URL=$(url gc_tenants) run_env "$@" "$tsx_cli" "$transfer" ${TRANSFER_FLAG:-}; }

echo '1/7 migraciones anteriores a 028b + fixture tipo producción'
deploy gc_tenants pre
psql_db gc_tenants <<'SQL'
INSERT INTO "Professional" (id, "tenantId", name, email, timezone, "phoneJid", "googleRefreshToken", "googleCalendarId", "updatedAt")
VALUES (1, 'legacy-tenant', 'Prof', 'pro@example.test', 'America/Argentina/Buenos_Aires', 'pro@s.whatsapp.net', 'rt-legacy', 'cal-x', now());
INSERT INTO "Agenda" (id, "tenantId", "professionalId", "isPrimary") VALUES ('legacy-agenda', 'legacy-tenant', 1, true);
INSERT INTO "User" (id, email, "googleSubject") VALUES ('gc-owner-a', 'Owner.A@Example.test', 'sub-owner-a');
INSERT INTO "TenantMembership" ("tenantId", "userId", role) VALUES ('legacy-tenant', 'gc-owner-a', 'OWNER');
INSERT INTO "Patient" (id, "tenantId", "whatsappJid", phone, name, "updatedAt")
VALUES ('gc-a-patient', 'legacy-tenant', '5490000000808@s.whatsapp.net', '5490000000808', 'Paciente A', now());
INSERT INTO "Service" (id, "tenantId", name, price, "durationMin", "updatedAt")
VALUES ('gc-a-service', 'legacy-tenant', 'Consulta A', 1000, 30, now());
INSERT INTO "Appointment" (id, "tenantId", "agendaId", "patientId", "serviceId", "createdBy", "priceSnapshot", "startsAt", "endsAt", status,
  "googleEventId", "needsGoogleSync", "updatedAt")
VALUES
  ('gc-a-future-new', 'legacy-tenant', 'legacy-agenda', 'gc-a-patient', 'gc-a-service', 'PATIENT', 1000,
   date_trunc('hour', now()) + interval '3 days 13 hours', date_trunc('hour', now()) + interval '3 days 13 hours 30 minutes', 'CONFIRMED', NULL, true, now()),
  ('gc-a-future-synced', 'legacy-tenant', 'legacy-agenda', 'gc-a-patient', 'gc-a-service', 'PATIENT', 1000,
   date_trunc('hour', now()) + interval '4 days 13 hours', date_trunc('hour', now()) + interval '4 days 13 hours 30 minutes', 'CONFIRMED', 'evt-legacy', false, now()),
  ('gc-a-past', 'legacy-tenant', 'legacy-agenda', 'gc-a-patient', 'gc-a-service', 'PATIENT', 1000,
   date_trunc('hour', now()) - interval '3 days', date_trunc('hour', now()) - interval '3 days' + interval '30 minutes', 'CONFIRMED', 'evt-past', false, now());
SQL
pro_fingerprint() {
  psql_db gc_tenants -c 'SELECT md5(string_agg(id || coalesce("googleRefreshToken", chr(126)) || coalesce("googleCalendarId", chr(126)) || coalesce("googleSyncError", chr(126)), chr(124) ORDER BY id)) FROM "Professional"'
}
pro_before=$(pro_fingerprint)

echo '2/7 aplicar 028b: Professional intacto, tablas nuevas vacías'
deploy gc_tenants full
[[ $(pro_fingerprint) == "$pro_before" ]] || { echo 'Professional cambió con la migración' >&2; exit 1; }
[[ $(psql_db gc_tenants -c 'SELECT (SELECT count(*) FROM "GoogleCalendarAccount") + (SELECT count(*) FROM "GoogleCalendarOAuthState")') == 0 ]] ||
  { echo 'Las tablas nuevas tenían que quedar vacías' >&2; exit 1; }
deploy gc_fresh full
echo '   instalación desde cero (todas las migraciones): OK'

echo '3/7 traslado del token (D6a)'
rows() { psql_db gc_tenants -c 'SELECT count(*) FROM "GoogleCalendarAccount"'; }
if TRANSFER_FLAG=--apply transfer_cli >/dev/null 2>"$scratch/nokey.err"; then echo 'Sin INTEGRATION_TOKEN_KEY el traslado tenía que fallar' >&2; exit 1; fi
grep -qx 'INTEGRATION_TOKEN_KEY inválida o ausente' "$scratch/nokey.err" || { echo 'Mensaje inesperado sin clave' >&2; exit 1; }
[[ $(rows) == 0 ]] || { echo 'Sin clave no tenía que escribir' >&2; exit 1; }
token_key=$(openssl rand -base64 32)
out=$(transfer_cli INTEGRATION_TOKEN_KEY="$token_key")
[[ $out == '{"mode":"dry-run","transferred":1,"alreadyConnected":0,"skipped":0}' ]] || { echo "Dry-run inesperado: $out" >&2; exit 1; }
[[ $(rows) == 0 ]] || { echo 'El dry-run escribió' >&2; exit 1; }
out=$(TRANSFER_FLAG=--apply transfer_cli INTEGRATION_TOKEN_KEY="$token_key" GOOGLE_CALENDAR_OWNER_EMAIL=" owner.a@example.TEST ")
[[ $out == '{"mode":"apply","transferred":1,"alreadyConnected":0,"skipped":0}' ]] || { echo "Apply inesperado: $out" >&2; exit 1; }
[[ $out != *rt-legacy* && $out != *owner* ]] || { echo 'La salida filtró datos' >&2; exit 1; }
[[ $(psql_db gc_tenants -c 'SELECT "tenantId" || chr(124) || "calendarId" || chr(124) || "googleEmail" || chr(124) || "googleSubject" || chr(124) || ("connectedAt" IS NOT NULL) || chr(124) || ("scope" IS NULL) || chr(124) || ("syncError" IS NULL) FROM "GoogleCalendarAccount"') == 'legacy-tenant|cal-x|owner.a@example.test|sub-owner-a|true|true|true' ]] ||
  { echo 'La fila trasladada no es la esperada' >&2; exit 1; }
[[ $(pro_fingerprint) == "$pro_before" ]] || { echo 'El traslado modificó Professional' >&2; exit 1; }
cat > "$scratch/open.ts" <<TS
import { GOOGLE_SECRET_AAD, openSecret } from "$root/packages/db/domain/secretBox";
const key = Buffer.from(process.env.PROBE_TOKEN_KEY!, "base64");
if (openSecret(process.argv[2]!, key, GOOGLE_SECRET_AAD.refreshToken("legacy-tenant")) !== "rt-legacy") throw new Error("no descifra");
TS
enc=$(psql_db gc_tenants -c 'SELECT "refreshTokenEnc" FROM "GoogleCalendarAccount"')
[[ $enc == v1.* && $enc != *rt-legacy* ]] || { echo 'El token no quedó cifrado' >&2; exit 1; }
PROBE_TOKEN_KEY=$token_key run_env "$tsx_cli" "$scratch/open.ts" "$enc"
row_md5() { psql_db gc_tenants -c 'SELECT md5(to_jsonb(g)::text) FROM "GoogleCalendarAccount" g'; }
row_before=$(row_md5)
out=$(TRANSFER_FLAG=--apply transfer_cli INTEGRATION_TOKEN_KEY="$token_key" GOOGLE_CALENDAR_OWNER_EMAIL="owner.a@example.test")
[[ $out == '{"mode":"apply","transferred":0,"alreadyConnected":1,"skipped":0}' ]] || { echo "Segundo apply inesperado: $out" >&2; exit 1; }
[[ $(row_md5) == "$row_before" ]] || { echo 'El segundo apply cambió la fila' >&2; exit 1; }
echo '   sin clave: exit != 0 y 0 filas; dry-run: 0 filas; apply: fila cifrada que abre con el AAD del consultorio; idempotente'

echo '4/7 a 6/7 integración: consultorios A (trasladado) y B'
cd "$root/packages/db"
GCAL_TENANTS_DISPOSABLE=1 DATABASE_URL=$(url gc_tenants) PROBE_TOKEN_KEY="$token_key" VITEST= NODE_ENV=test \
  env -u NODE_OPTIONS HOME="$scratch/home" TMPDIR="$scratch/tmp" \
  "$tsx_cli" --test "$root/packages/db/scripts/google-calendar-per-tenant.integration.ts"

echo '7/7 drift: schema.prisma vs. las bases migradas (solo el contenedor descartable)'
for db in gc_tenants gc_fresh; do
  DATABASE_URL=$(url "$db") run_env "$prisma_cli" migrate diff --from-url "$(url "$db")" \
    --to-schema-datamodel "$scratch/full/schema.prisma" --exit-code >/dev/null ||
    { echo "Drift entre schema.prisma y la base migrada ($db)" >&2; exit 1; }
done
echo 'test-google-calendar-per-tenant: OK'
