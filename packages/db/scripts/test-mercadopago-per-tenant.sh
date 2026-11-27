#!/usr/bin/env bash
# HU-028a (§11.4): migración mercadopago_account_per_tenant con datos tipo producción, probe de dos
# consultorios (mercadopago-per-tenant.integration.ts) y chequeo de drift.
# Solo Postgres descartable: contenedor y red propios, tmpfs, puerto 127.0.0.1 aleatorio, password aleatoria,
# copia del schema y de las migraciones fuera del repo. Nunca carga el .env del repo ni toca la base de desarrollo.
# Usa el contexto de Docker del entorno (`docker` a secas, o DOCKER_HOST/DOCKER_CONTEXT si están definidos).
set -euo pipefail
umask 077

root=$(git -C "$(dirname "$0")" rev-parse --show-toplevel)
source_schema="$root/packages/db/prisma"
prisma_cli="$root/node_modules/.bin/prisma"
tsx_cli="$root/node_modules/.bin/tsx"
target=mercadopago_account_per_tenant
[[ -x $prisma_cli && -x $tsx_cli ]] || { echo 'Local prisma and tsx CLIs are required (npm install).' >&2; exit 2; }
docker info >/dev/null 2>&1 || { echo 'Docker is not available in this environment.' >&2; exit 3; }
docker image inspect postgres:16-alpine >/dev/null 2>&1 ||
  { echo 'Image postgres:16-alpine is not present locally (this probe never pulls).' >&2; exit 3; }
compgen -G "$source_schema/migrations/*_$target" >/dev/null || { echo "Migration $target not found." >&2; exit 2; }

scratch=$(mktemp -d "${TMPDIR:-/tmp}/hu028a-mp-tenants.XXXXXXXXXX")
name="hu028a-mp-tenants-$(openssl rand -hex 6)"
container= network=
cleanup() {
  if [[ -n $container ]]; then docker stop -t 1 "$container" >/dev/null 2>&1 || true; fi
  if [[ -n $network ]]; then docker network rm "$network" >/dev/null 2>&1 || true; fi
  rm -rf -- "$scratch"
}
trap cleanup EXIT

# Dos copias: las migraciones anteriores a la de 028a (pre/) y todas (full/).
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

network=$(docker network create --label "hu028a.mp-tenants=$name" "$name")
pass=$(openssl rand -hex 18)
container=$(docker run --pull never --rm -d --name "$name" --network "$network" --label "hu028a.mp-tenants=$name" \
  --tmpfs /var/lib/postgresql/data:rw -e POSTGRES_PASSWORD="$pass" -e POSTGRES_DB=mp_tenants \
  -p 127.0.0.1::5432 postgres:16-alpine)
for attempt in $(seq 1 60); do
  docker exec "$container" pg_isready -h 127.0.0.1 -U postgres -d mp_tenants >/dev/null 2>&1 && break
  [[ $attempt != 60 ]] || { echo 'Disposable PostgreSQL did not start.' >&2; exit 2; }
  sleep 0.2
done
binding=$(docker port "$container" 5432/tcp | head -n 1)
[[ $binding =~ ^127\.0\.0\.1:[0-9]+$ ]] || { echo 'Unexpected port binding.' >&2; exit 2; }
for db in mp_migration mp_null; do docker exec "$container" createdb -U postgres "$db"; done

unset DIRECT_URL SHADOW_DATABASE_URL
url() { echo "postgresql://postgres:$pass@$binding/$1"; }
# Toda escritura exige una URL descartable de este probe.
for db in mp_tenants mp_migration mp_null; do
  [[ $(url "$db") =~ ^postgresql://postgres:[a-f0-9]{36}@127\.0\.0\.1:[0-9]+/mp_[a-z_]+$ ]] || exit 2
done
run_env() { env -u NODE_OPTIONS HOME="$scratch/home" TMPDIR="$scratch/tmp" NO_UPDATE_NOTIFIER=1 PRISMA_HIDE_UPDATE_MESSAGE=1 "$@"; }
deploy() { DATABASE_URL=$(url "$1") run_env "$prisma_cli" migrate deploy --schema "$scratch/$2/schema.prisma" >/dev/null; }
psql_db() { local db=$1; shift; docker exec -i "$container" psql -X -q -At -v ON_ERROR_STOP=1 -U postgres -d "$db" "$@"; }

echo '1/6 migraciones anteriores a 028a + fixture tipo producción'
deploy mp_migration pre
token_key=$(openssl rand -base64 32)
cat > "$scratch/seal.ts" <<TS
import { SECRET_AAD, sealSecret } from "$root/packages/db/domain/secretBox";
const key = Buffer.from(process.env.PROBE_TOKEN_KEY!, "base64");
console.log(sealSecret("APP_USR-probe-access", key, SECRET_AAD.accessToken));
console.log(sealSecret("TG-probe-refresh", key, SECRET_AAD.refreshToken));
TS
sealed=$(PROBE_TOKEN_KEY=$token_key run_env "$tsx_cli" "$scratch/seal.ts")
access_enc=$(sed -n 1p <<<"$sealed")
refresh_enc=$(sed -n 2p <<<"$sealed")
psql_db mp_migration -v access="$access_enc" -v refresh="$refresh_enc" <<'SQL'
INSERT INTO "Professional" (id, "tenantId", name, email, timezone, "phoneJid", "updatedAt")
VALUES (1, 'legacy-tenant', 'Prof', 'pro@example.test', 'America/Argentina/Buenos_Aires', 'pro@s.whatsapp.net', now());
INSERT INTO "Agenda" (id, "tenantId", "professionalId", "isPrimary") VALUES ('legacy-agenda', 'legacy-tenant', 1, true);
INSERT INTO "Patient" (id, "tenantId", "whatsappJid", phone, name, "updatedAt")
VALUES ('pat', 'legacy-tenant', '5490000000707@s.whatsapp.net', '5490000000707', 'Paciente', now());
INSERT INTO "Service" (id, "tenantId", name, price, "durationMin", "requiresDeposit", "depositKind", "depositValue", "updatedAt")
VALUES ('svc', 'legacy-tenant', 'Consulta', 1000, 30, true, 'FIXED', 500, now());
INSERT INTO "Appointment" (id, "tenantId", "agendaId", "patientId", "serviceId", "createdBy", "priceSnapshot", "startsAt", "endsAt", status, "updatedAt")
VALUES ('appt', 'legacy-tenant', 'legacy-agenda', 'pat', 'svc', 'PATIENT', 1000, now() + interval '3 days', now() + interval '3 days 30 minutes', 'AWAITING_PAYMENT', now());
INSERT INTO "Payment" (id, "appointmentId", kind, amount, status, provider, "mercadopagoUserId", "updatedAt")
VALUES ('pay', 'appt', 'DEPOSIT', 500, 'PENDING', 'mercadopago', '3003', now());
INSERT INTO "MercadoPagoAccount" (id, "tenantId", "userId", nickname, email, "liveMode", "accessTokenEnc", "refreshTokenEnc", scope,
  "expiresAt", "connectedAt", "refreshedAt", "createdAt", "updatedAt")
VALUES (1, 'legacy-tenant', '3003', 'VENDEDOR', 'v@example.test', true, :'access', :'refresh', 'offline_access payments read write',
  now() + interval '150 days', now() - interval '20 days', now() - interval '20 days', now() - interval '30 days', now());
INSERT INTO "MercadoPagoOAuthState" (id, "tenantId", "stateHash", "codeVerifierEnc", "sessionEmail", "expiresAt")
VALUES ('st-en-vuelo', 'legacy-tenant', 'hash-en-vuelo', 'v1.x.y.z', 'pro@example.test', now() + interval '5 minutes');
SQL
fingerprint() {
  psql_db "$1" <<'SQL'
SELECT jsonb_build_object('id', id, 'tenantId', "tenantId", 'userId', "userId", 'expiresAt', "expiresAt", 'liveMode', "liveMode",
  'access', md5("accessTokenEnc"), 'refresh', md5("refreshTokenEnc"), 'connectedAt', "connectedAt")::text
FROM "MercadoPagoAccount" ORDER BY id;
SQL
}
before=$(fingerprint mp_migration)
payment_before=$(psql_db mp_migration -c "SELECT \"mercadopagoUserId\" || ':' || status FROM \"Payment\" WHERE id = 'pay'")

echo '2/6 aplicar 028a sobre la fixture y verificar'
deploy mp_migration full
after=$(fingerprint mp_migration)
[[ $before == "$after" ]] || { echo "La fila de MercadoPagoAccount cambió: $before -> $after" >&2; exit 1; }
[[ $(psql_db mp_migration -c "SELECT \"mercadopagoUserId\" || ':' || status FROM \"Payment\" WHERE id = 'pay'") == "$payment_before" ]] ||
  { echo 'Payment.mercadopagoUserId cambió' >&2; exit 1; }
[[ $(psql_db mp_migration -c 'SELECT count(*) FROM "MercadoPagoOAuthState"') == 0 ]] || { echo 'Quedaron states en vuelo' >&2; exit 1; }
[[ $(psql_db mp_migration -c "SELECT nextval('\"MercadoPagoAccount_id_seq\"')") == 2 ]] || { echo 'nextval tenía que ser 2' >&2; exit 1; }
[[ $(psql_db mp_migration -c "SELECT string_agg(table_name || '.' || is_nullable, ',' ORDER BY table_name) FROM information_schema.columns
  WHERE column_name = 'tenantId' AND table_name IN ('MercadoPagoAccount', 'MercadoPagoOAuthState')") == 'MercadoPagoAccount.NO,MercadoPagoOAuthState.NO' ]] ||
  { echo 'tenantId tenía que quedar NOT NULL' >&2; exit 1; }
cat > "$scratch/open.ts" <<TS
import { SECRET_AAD, openSecret } from "$root/packages/db/domain/secretBox";
const key = Buffer.from(process.env.PROBE_TOKEN_KEY!, "base64");
const [access, refresh] = process.argv.slice(2);
if (openSecret(access!, key, SECRET_AAD.accessToken) !== "APP_USR-probe-access") throw new Error("access no descifra");
if (openSecret(refresh!, key, SECRET_AAD.refreshToken) !== "TG-probe-refresh") throw new Error("refresh no descifra");
TS
stored=$(psql_db mp_migration -c 'SELECT "accessTokenEnc" || chr(10) || "refreshTokenEnc" FROM "MercadoPagoAccount" WHERE id = 1')
PROBE_TOKEN_KEY=$token_key run_env "$tsx_cli" "$scratch/open.ts" "$(sed -n 1p <<<"$stored")" "$(sed -n 2p <<<"$stored")"
echo '   fila id = 1 intacta (md5 de los tokens, userId, expiresAt), descifra igual, nextval = 2, states = 0'

echo '3/6 variante: una fila sin tenantId aborta la migración y la tabla queda igual'
deploy mp_null pre
psql_db mp_null <<'SQL'
INSERT INTO "MercadoPagoAccount" (id, "userId", "updatedAt") VALUES (1, '4004', now());
SQL
null_before=$(fingerprint mp_null)
if deploy mp_null full 2>/dev/null; then echo 'La migración tenía que abortar con una fila sin tenantId' >&2; exit 1; fi
[[ $(fingerprint mp_null) == "$null_before" ]] || { echo 'La tabla cambió tras el abort' >&2; exit 1; }
[[ $(psql_db mp_null -c "SELECT is_nullable FROM information_schema.columns WHERE table_name = 'MercadoPagoAccount' AND column_name = 'tenantId'") == YES ]] ||
  { echo 'El abort no revirtió la migración' >&2; exit 1; }

echo '4/6 instalación desde cero (todas las migraciones)'
deploy mp_tenants full

echo '5/6 integración: consultorios A y B, cada uno con su cuenta'
cd "$root/packages/db"
MP_TENANTS_DISPOSABLE=1 DATABASE_URL=$(url mp_tenants) VITEST= NODE_ENV=test env -u NODE_OPTIONS HOME="$scratch/home" \
  "$tsx_cli" --test "$root/packages/db/scripts/mercadopago-per-tenant.integration.ts"

echo '6/6 drift: schema.prisma vs. la base migrada (solo el contenedor descartable)'
for db in mp_tenants mp_migration; do
  DATABASE_URL=$(url "$db") run_env "$prisma_cli" migrate diff --from-url "$(url "$db")" \
    --to-schema-datamodel "$scratch/full/schema.prisma" --exit-code >/dev/null ||
    { echo "Drift entre schema.prisma y la base migrada ($db)" >&2; exit 1; }
done
echo 'test-mercadopago-per-tenant: OK'
