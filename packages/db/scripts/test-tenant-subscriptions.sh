#!/usr/bin/env bash
# HU-029b (§B.9.3): migración tenant_subscriptions con datos tipo producción, probe de suscripciones
# (tenant-subscriptions.integration.ts) y chequeo de drift.
# Solo Postgres descartable: contenedor y red propios, tmpfs, puerto 127.0.0.1 aleatorio, password aleatoria,
# copia del schema y de las migraciones fuera del repo. Nunca carga el .env del repo ni toca la base de desarrollo.
set -euo pipefail
umask 077

root=$(git -C "$(dirname "$0")" rev-parse --show-toplevel)
source_schema="$root/packages/db/prisma"
prisma_cli="$root/node_modules/.bin/prisma"
tsx_cli="$root/node_modules/.bin/tsx"
target=tenant_subscriptions
[[ -x $prisma_cli && -x $tsx_cli ]] || { echo 'Local prisma and tsx CLIs are required (npm install).' >&2; exit 2; }
docker info >/dev/null 2>&1 || { echo 'Docker is not available in this environment.' >&2; exit 3; }
docker image inspect postgres:16-alpine >/dev/null 2>&1 ||
  { echo 'Image postgres:16-alpine is not present locally (this probe never pulls).' >&2; exit 3; }
compgen -G "$source_schema/migrations/*_$target" >/dev/null || { echo "Migration $target not found." >&2; exit 2; }

scratch=$(mktemp -d "${TMPDIR:-/tmp}/hu029b-subs.XXXXXXXXXX")
name="hu029b-subs-$(openssl rand -hex 6)"
container= network=
cleanup() {
  if [[ -n $container ]]; then docker stop -t 1 "$container" >/dev/null 2>&1 || true; fi
  if [[ -n $network ]]; then docker network rm "$network" >/dev/null 2>&1 || true; fi
  rm -rf -- "$scratch"
}
trap cleanup EXIT

# Dos copias: las migraciones anteriores a tenant_subscriptions (pre/) y todas (full/).
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

network=$(docker network create --label "hu029b.subs=$name" "$name")
pass=$(openssl rand -hex 18)
container=$(docker run --pull never --rm -d --name "$name" --network "$network" --label "hu029b.subs=$name" \
  --tmpfs /var/lib/postgresql/data:rw -e POSTGRES_PASSWORD="$pass" -e POSTGRES_DB=subs_probe \
  -p 127.0.0.1::5432 postgres:16-alpine)
for attempt in $(seq 1 60); do
  docker exec "$container" pg_isready -h 127.0.0.1 -U postgres -d subs_probe >/dev/null 2>&1 && break
  [[ $attempt != 60 ]] || { echo 'Disposable PostgreSQL did not start.' >&2; exit 2; }
  sleep 0.2
done
binding=$(docker port "$container" 5432/tcp | head -n 1)
[[ $binding =~ ^127\.0\.0\.1:[0-9]+$ ]] || { echo 'Unexpected port binding.' >&2; exit 2; }
docker exec "$container" createdb -U postgres subs_migration

unset DIRECT_URL SHADOW_DATABASE_URL
url() { echo "postgresql://postgres:$pass@$binding/$1"; }
for db in subs_probe subs_migration; do
  [[ $(url "$db") =~ ^postgresql://postgres:[a-f0-9]{36}@127\.0\.0\.1:[0-9]+/subs_[a-z_]+$ ]] || exit 2
done
run_env() { env -u NODE_OPTIONS HOME="$scratch/home" TMPDIR="$scratch/tmp" NO_UPDATE_NOTIFIER=1 PRISMA_HIDE_UPDATE_MESSAGE=1 "$@"; }
deploy() { DATABASE_URL=$(url "$1") run_env "$prisma_cli" migrate deploy --schema "$scratch/$2/schema.prisma" >/dev/null; }
psql_db() { local db=$1; shift; docker exec -i "$container" psql -X -q -At -v ON_ERROR_STOP=1 -U postgres -d "$db" "$@"; }

echo '1/4 migraciones anteriores a tenant_subscriptions + fixture tipo producción'
deploy subs_migration pre
psql_db subs_migration <<'SQL'
INSERT INTO "Professional" (id, "tenantId", name, email, timezone, "phoneJid", "updatedAt")
VALUES (1, 'legacy-tenant', 'Prof', 'pro@example.test', 'America/Argentina/Buenos_Aires', 'pro@s.whatsapp.net', now());
INSERT INTO "Agenda" (id, "tenantId", "professionalId", "isPrimary") VALUES ('legacy-agenda', 'legacy-tenant', 1, true);
INSERT INTO "User" (id, email, "googleSubject") VALUES ('legacy-owner', 'owner@example.test', 'sub-legacy-owner');
INSERT INTO "TenantMembership" ("tenantId", "userId", role) VALUES ('legacy-tenant', 'legacy-owner', 'OWNER');
INSERT INTO "MercadoPagoAccount" (id, "tenantId", "userId", nickname, "liveMode", "accessTokenEnc", "refreshTokenEnc", scope,
  "expiresAt", "connectedAt", "createdAt", "updatedAt")
VALUES (1, 'legacy-tenant', '3003', 'VENDEDOR', true, 'v1.a.b.c', 'v1.d.e.f', 'offline_access payments read write',
  now() + interval '150 days', now() - interval '20 days', now() - interval '30 days', now());
SQL
fingerprint() {
  psql_db "$1" <<'SQL'
SELECT md5(coalesce((SELECT jsonb_agg(t ORDER BY id)::text FROM "MercadoPagoAccount" t), '')) || ':' ||
       md5(coalesce((SELECT jsonb_agg(t ORDER BY id)::text FROM "Tenant" t), '')) || ':' ||
       md5(coalesce((SELECT jsonb_agg(t ORDER BY "tenantId", "userId")::text FROM "TenantMembership" t), ''));
SQL
}
before=$(fingerprint subs_migration)

echo '2/4 aplicar tenant_subscriptions sobre la fixture y verificar'
deploy subs_migration full
[[ $(fingerprint subs_migration) == "$before" ]] || { echo 'Cambiaron filas previas (MercadoPagoAccount, Tenant o TenantMembership)' >&2; exit 1; }
plans=$(psql_db subs_migration -c "SELECT string_agg(mode || ':' || code || ':' || amount || ':' || \"trialLength\" || ':' || \"trialUnit\" || ':' || \"isDefault\", ',' ORDER BY mode::text) FROM \"SubscriptionPlan\"")
[[ $plans == 'LIVE:mensual:60000.00:7:DAYS:true,SANDBOX:mensual:60000.00:7:DAYS:true' ]] || { echo "Planes sembrados inesperados: $plans" >&2; exit 1; }
indexes=$(psql_db subs_migration -c "SELECT string_agg(indexname, ',' ORDER BY indexname) FROM pg_indexes WHERE indexname IN ('TenantSubscription_open_per_tenant_key', 'SubscriptionPlan_default_per_mode_key')")
[[ $indexes == 'SubscriptionPlan_default_per_mode_key,TenantSubscription_open_per_tenant_key' ]] || { echo "Faltan índices parciales: $indexes" >&2; exit 1; }
checks=$(psql_db subs_migration -c "SELECT count(*) FROM pg_constraint WHERE conname LIKE 'TenantSubscription_payer_email%'")
[[ $checks == 2 ]] || { echo 'Faltan los CHECK del email transitorio' >&2; exit 1; }
echo '   filas previas idénticas, 2 planes sembrados (60000.00 / 7 días), índices parciales y CHECK presentes'

echo '3/4 integración: consultorios A, B y C con gateway falso'
deploy subs_probe full
cd "$root/packages/db"
SUBS_DISPOSABLE=1 DATABASE_URL=$(url subs_probe) VITEST= NODE_ENV=test env -u NODE_OPTIONS HOME="$scratch/home" \
  "$tsx_cli" --test "$root/packages/db/scripts/tenant-subscriptions.integration.ts"

echo '4/4 drift: schema.prisma vs. la base migrada (solo el contenedor descartable)'
for db in subs_probe subs_migration; do
  DATABASE_URL=$(url "$db") run_env "$prisma_cli" migrate diff --from-url "$(url "$db")" \
    --to-schema-datamodel "$scratch/full/schema.prisma" --exit-code >/dev/null ||
    { echo "Drift entre schema.prisma y la base migrada ($db)" >&2; exit 1; }
done
echo 'test-tenant-subscriptions: OK'
