#!/usr/bin/env bash
# HU-028c (§C8.5): migración ai_usage_per_tenant con datos tipo producción, fail closed ante preguntas de
# pacientes sin consultorio, probe de dos consultorios (bot-ai-per-tenant.integration.ts), script ai-limits y
# chequeo de drift.
# Solo Postgres descartable: contenedor y red propios, tmpfs, puerto 127.0.0.1 aleatorio, password aleatoria,
# copia del schema y de las migraciones fuera del repo. Nunca carga el .env del repo ni toca la base de desarrollo.
# Nunca llama a un proveedor de IA real ni manda WhatsApp.
set -euo pipefail
umask 077

root=$(git -C "$(dirname "$0")" rev-parse --show-toplevel)
source_schema="$root/packages/db/prisma"
prisma_cli="$root/node_modules/.bin/prisma"
tsx_cli="$root/node_modules/.bin/tsx"
ai_limits="$root/packages/db/scripts/ai-limits.ts"
target=ai_usage_per_tenant
[[ -x $prisma_cli && -x $tsx_cli ]] || { echo 'Local prisma and tsx CLIs are required (npm install).' >&2; exit 2; }
docker info >/dev/null 2>&1 || { echo 'Docker is not available in this environment.' >&2; exit 3; }
docker image inspect postgres:16-alpine >/dev/null 2>&1 ||
  { echo 'Image postgres:16-alpine is not present locally (this probe never pulls).' >&2; exit 3; }
compgen -G "$source_schema/migrations/*_$target" >/dev/null || { echo "Migration $target not found." >&2; exit 2; }

scratch=$(mktemp -d "${TMPDIR:-/tmp}/hu028c-ai-tenants.XXXXXXXXXX")
name="hu028c-ai-tenants-$(openssl rand -hex 6)"
container= network=
cleanup() {
  if [[ -n $container ]]; then docker stop -t 1 "$container" >/dev/null 2>&1 || true; fi
  if [[ -n $network ]]; then docker network rm "$network" >/dev/null 2>&1 || true; fi
  rm -rf -- "$scratch"
}
trap cleanup EXIT

# Dos copias: las migraciones anteriores a la de 028c (pre/) y todas (full/).
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

network=$(docker network create --label "hu028c.ai-tenants=$name" "$name")
pass=$(openssl rand -hex 18)
container=$(docker run --pull never --rm -d --name "$name" --network "$network" --label "hu028c.ai-tenants=$name" \
  --tmpfs /var/lib/postgresql/data:rw -e POSTGRES_PASSWORD="$pass" -e POSTGRES_DB=ai_tenants \
  -p 127.0.0.1::5432 postgres:16-alpine)
for attempt in $(seq 1 60); do
  docker exec "$container" pg_isready -h 127.0.0.1 -U postgres -d ai_tenants >/dev/null 2>&1 && break
  [[ $attempt != 60 ]] || { echo 'Disposable PostgreSQL did not start.' >&2; exit 2; }
  sleep 0.2
done
binding=$(docker port "$container" 5432/tcp | head -n 1)
[[ $binding =~ ^127\.0\.0\.1:[0-9]+$ ]] || { echo 'Unexpected port binding.' >&2; exit 2; }
docker exec "$container" createdb -U postgres ai_fresh
docker exec "$container" createdb -U postgres ai_orphan

unset DIRECT_URL SHADOW_DATABASE_URL
url() { echo "postgresql://postgres:$pass@$binding/$1"; }
# Toda escritura exige una URL descartable de este probe.
for db in ai_tenants ai_fresh ai_orphan; do
  [[ $(url "$db") =~ ^postgresql://postgres:[a-f0-9]{36}@127\.0\.0\.1:[0-9]+/ai_[a-z_]+$ ]] || exit 2
done
run_env() {
  env -u NODE_OPTIONS -u API_KEY_IA_ANTHROPIC -u API_KEY_IA_DEEPSEEK HOME="$scratch/home" TMPDIR="$scratch/tmp" \
    NO_UPDATE_NOTIFIER=1 PRISMA_HIDE_UPDATE_MESSAGE=1 "$@"
}
deploy() { DATABASE_URL=$(url "$1") run_env "$prisma_cli" migrate deploy --schema "$scratch/$2/schema.prisma"; }
psql_db() { local db=$1; shift; docker exec -i "$container" psql -X -q -At -v ON_ERROR_STOP=1 -U postgres -d "$db" "$@"; }
limits_cli() { DATABASE_URL=$(url ai_tenants) run_env "$tsx_cli" "$ai_limits" "$@"; }

fixture_a() {
  psql_db "$1" <<'SQL'
INSERT INTO "Professional" (id, "tenantId", name, email, timezone, "botAiInfo", "updatedAt")
VALUES (1, 'legacy-tenant', 'Prof A', 'pro-a@example.test', 'America/Argentina/Buenos_Aires', 'Info de A', now());
INSERT INTO "Agenda" (id, "tenantId", "professionalId", "isPrimary") VALUES ('legacy-agenda', 'legacy-tenant', 1, true);
INSERT INTO "Patient" (id, "tenantId", "whatsappJid", phone, name, "updatedAt")
VALUES ('ai-a-patient', 'legacy-tenant', '5490000000818@s.whatsapp.net', '5490000000818', 'Paciente A', now());
INSERT INTO "Service" (id, "tenantId", name, price, "durationMin", active, "updatedAt")
VALUES ('ai-a-service', 'legacy-tenant', 'Servicio A', 1000, 30, true, now());
INSERT INTO "Appointment" (id, "tenantId", "agendaId", "patientId", "serviceId", "createdBy", "priceSnapshot", "startsAt", "endsAt", status, "updatedAt")
VALUES ('ai-a-future', 'legacy-tenant', 'legacy-agenda', 'ai-a-patient', 'ai-a-service', 'PATIENT', 1000,
  date_trunc('hour', now()) + interval '3 days 13 hours', date_trunc('hour', now()) + interval '3 days 13 hours 30 minutes', 'CONFIRMED', now());
INSERT INTO "BotAiQuestion" (id, "patientId", "askedAt", question, answer, outcome, provider, model, "inputTokens", "outputTokens")
VALUES
  ('ai-q1', 'ai-a-patient', now() - interval '2 days', '¿Cuánto sale?', 'Sale $ 1.000.', 'ANSWERED', 'deepseek', 'deepseek-chat', 100, 20),
  ('ai-q2', 'ai-a-patient', now() - interval '1 day', '¿Atienden sábados?', NULL, 'LIMIT_PATIENT', 'deepseek', 'deepseek-chat', 0, 0);
SQL
}
# md5 de las preguntas sin la columna nueva: la migración no puede cambiar nada más que agregar tenantId.
questions_md5() {
  psql_db ai_tenants -c "SELECT md5(string_agg((to_jsonb(q) - 'tenantId')::text, chr(124) ORDER BY id)) FROM \"BotAiQuestion\" q"
}

echo '1/6 migraciones anteriores a 028c + fixture tipo producción'
deploy ai_tenants pre >/dev/null
fixture_a ai_tenants
q_before=$(questions_md5)

echo '2/6 aplicar 028c: backfill a legacy-tenant, mismas filas, NOT NULL, tablas nuevas vacías'
deploy ai_tenants full >/dev/null
[[ $(questions_md5) == "$q_before" ]] || { echo 'BotAiQuestion cambió con la migración' >&2; exit 1; }
[[ $(psql_db ai_tenants -c 'SELECT string_agg("tenantId" || chr(58) || count, chr(44)) FROM (SELECT "tenantId", count(*)::text AS count FROM "BotAiQuestion" GROUP BY 1) t') == 'legacy-tenant:2' ]] ||
  { echo 'El backfill no dejó las 2 preguntas en legacy-tenant' >&2; exit 1; }
[[ $(psql_db ai_tenants -c "SELECT is_nullable FROM information_schema.columns WHERE table_name = 'BotAiQuestion' AND column_name = 'tenantId'") == NO ]] ||
  { echo 'BotAiQuestion.tenantId tenía que quedar NOT NULL' >&2; exit 1; }
[[ $(psql_db ai_tenants -c 'SELECT (SELECT count(*) FROM "TenantAiSettings") + (SELECT count(*) FROM "PanelAiUsage")') == 0 ]] ||
  { echo 'Las tablas nuevas tenían que quedar vacías' >&2; exit 1; }
deploy ai_fresh full >/dev/null
echo '   md5 de las preguntas igual; instalación desde cero (todas las migraciones): OK'

echo '3/6 fail closed: una pregunta de un paciente sin consultorio corta la migración'
deploy ai_orphan pre >/dev/null
psql_db ai_orphan <<'SQL'
INSERT INTO "Patient" (id, "tenantId", "whatsappJid", phone, name, "updatedAt")
VALUES ('ai-orphan', NULL, '5490000000828@s.whatsapp.net', '5490000000828', 'Sin consultorio', now());
INSERT INTO "BotAiQuestion" (id, "patientId", "askedAt", question, outcome, provider, model)
VALUES ('ai-orphan-q', 'ai-orphan', now(), '¿Hola?', 'ANSWERED', 'deepseek', 'deepseek-chat');
SQL
if deploy ai_orphan full >"$scratch/orphan.out" 2>&1; then echo 'La migración tenía que fallar con un paciente sin tenant' >&2; exit 1; fi
# Prisma informa el error de la sentencia siguiente ("current transaction is aborted"); el RAISE de la migración
# queda en el log del servidor descartable.
docker logs "$container" >"$scratch/server.log" 2>&1
grep -q 'ERROR:  HU-028c: hay preguntas de la IA del bot de pacientes sin tenantId' "$scratch/server.log" ||
  { echo 'Falta el mensaje HU-028c en el error' >&2; cat "$scratch/orphan.out" >&2; exit 1; }
grep -q '20261127190208_ai_usage_per_tenant\|ai_usage_per_tenant' "$scratch/orphan.out" ||
  { echo 'El error no es de la migración ai_usage_per_tenant' >&2; exit 1; }
[[ $(psql_db ai_orphan -c "SELECT count(*) FROM information_schema.columns WHERE table_name = 'BotAiQuestion' AND column_name = 'tenantId'") == 0 ]] ||
  { echo 'La transacción tenía que revertirse (columna creada)' >&2; exit 1; }
[[ $(psql_db ai_orphan -c "SELECT count(*) FROM information_schema.tables WHERE table_name IN ('TenantAiSettings', 'PanelAiUsage')") == 0 ]] ||
  { echo 'La transacción tenía que revertirse (tablas creadas)' >&2; exit 1; }
[[ $(psql_db ai_orphan -c 'SELECT count(*) FROM "BotAiQuestion"') == 1 ]] || { echo 'No se tenía que borrar la pregunta' >&2; exit 1; }
echo '   migrate deploy falla con "HU-028c:" (log del servidor), sin columna ni tablas nuevas, la pregunta sigue'

echo '4/6 consultorio B sintético + ai-limits'
psql_db ai_tenants <<'SQL'
INSERT INTO "Tenant" (id) VALUES ('ai-b');
INSERT INTO "Professional" (id, "tenantId", name, email, timezone, "botAiInfo", "updatedAt")
VALUES (702, 'ai-b', 'Prof B', 'pro-b@example.test', 'America/Argentina/Buenos_Aires', 'Info de B', now());
INSERT INTO "Agenda" (id, "tenantId", "professionalId", "isPrimary") VALUES ('ai-b-agenda', 'ai-b', 702, true);
INSERT INTO "Patient" (id, "tenantId", "whatsappJid", phone, name, "updatedAt")
VALUES ('ai-b-patient', 'ai-b', '5490000000919@s.whatsapp.net', '5490000000919', 'Paciente B', now());
INSERT INTO "Service" (id, "tenantId", name, price, "durationMin", active, "updatedAt")
VALUES ('ai-b-service', 'ai-b', 'Servicio B', 2000, 30, true, now());
INSERT INTO "Appointment" (id, "tenantId", "agendaId", "patientId", "serviceId", "createdBy", "priceSnapshot", "startsAt", "endsAt", status, "updatedAt")
VALUES ('ai-b-future', 'ai-b', 'ai-b-agenda', 'ai-b-patient', 'ai-b-service', 'PATIENT', 2000,
  date_trunc('hour', now()) + interval '5 days 13 hours', date_trunc('hour', now()) + interval '5 days 13 hours 30 minutes', 'CONFIRMED', now());
SQL
out=$(limits_cli show --tenant ai-b)
[[ $out == '{"tenantId":"ai-b","botDailyPerPatient":null,"botDailyPerTenant":null}' ]] || { echo "show inesperado: $out" >&2; exit 1; }
out=$(limits_cli set --tenant ai-b --per-tenant 5)
[[ $out == '{"mode":"dry-run","tenantId":"ai-b","before":{"botDailyPerPatient":null,"botDailyPerTenant":null},"after":{"botDailyPerPatient":null,"botDailyPerTenant":5}}' ]] ||
  { echo "dry-run inesperado: $out" >&2; exit 1; }
[[ $(psql_db ai_tenants -c 'SELECT count(*) FROM "TenantAiSettings"') == 0 ]] || { echo 'El dry-run escribió' >&2; exit 1; }
out=$(limits_cli set --tenant ai-b --per-tenant 5 --apply)
[[ $out == '{"mode":"apply","tenantId":"ai-b","before":{"botDailyPerPatient":null,"botDailyPerTenant":null},"after":{"botDailyPerPatient":null,"botDailyPerTenant":5}}' ]] ||
  { echo "apply inesperado: $out" >&2; exit 1; }
if limits_cli show --tenant no-existe >/dev/null 2>"$scratch/nf.err"; then echo 'Un tenant inexistente tenía que fallar' >&2; exit 1; fi
grep -qx 'tenant_not_found' "$scratch/nf.err" || { echo 'Mensaje inesperado para tenant inexistente' >&2; exit 1; }
[[ $(psql_db ai_tenants -c 'SELECT "tenantId" || chr(124) || coalesce("botDailyPerPatient"::text, chr(126)) || chr(124) || "botDailyPerTenant" FROM "TenantAiSettings"') == 'ai-b|~|5' ]] ||
  { echo 'ai-limits --apply no dejó la fila esperada' >&2; exit 1; }
echo '   show/dry-run sin escribir; --apply: B = {null, 5}; A sin fila; tenant inexistente: tenant_not_found'

echo '5/6 integración: consultorios A y B'
cd "$root/packages/db"
AI_TENANTS_DISPOSABLE=1 DATABASE_URL=$(url ai_tenants) VITEST= NODE_ENV=test \
  env -u NODE_OPTIONS -u API_KEY_IA_ANTHROPIC -u API_KEY_IA_DEEPSEEK HOME="$scratch/home" TMPDIR="$scratch/tmp" \
  "$tsx_cli" --test "$root/packages/db/scripts/bot-ai-per-tenant.integration.ts"

echo '6/6 drift: schema.prisma vs. las bases migradas (solo el contenedor descartable)'
for db in ai_tenants ai_fresh; do
  DATABASE_URL=$(url "$db") run_env "$prisma_cli" migrate diff --from-url "$(url "$db")" \
    --to-schema-datamodel "$scratch/full/schema.prisma" --exit-code >/dev/null ||
    { echo "Drift entre schema.prisma y la base migrada ($db)" >&2; exit 1; }
done
echo 'test-bot-ai-per-tenant: OK'
