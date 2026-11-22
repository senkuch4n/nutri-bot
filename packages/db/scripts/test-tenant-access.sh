#!/usr/bin/env bash
# HU-025 (10.3): probe de tenant_access_identity, registerGoogleIdentity y scripts/tenant-access.ts.
# Solo Postgres descartable: contenedor y red propios, tmpfs, puerto 127.0.0.1 aleatorio, password aleatoria,
# copia del schema fuera del repo. Nunca carga el .env del repo ni toca la base de desarrollo.
# Usa el contexto de Docker del entorno (`docker` a secas, o DOCKER_HOST/DOCKER_CONTEXT si están definidos).
set -euo pipefail
umask 077

root=$(git -C "$(dirname "$0")" rev-parse --show-toplevel)
source_schema="$root/packages/db/prisma"
prisma_cli="$root/node_modules/.bin/prisma"
tsx_cli="$root/node_modules/.bin/tsx"
[[ -x $prisma_cli && -x $tsx_cli ]] || { echo 'Local prisma and tsx CLIs are required (npm install).' >&2; exit 2; }
docker info >/dev/null 2>&1 || { echo 'Docker is not available in this environment.' >&2; exit 3; }
docker image inspect postgres:16-alpine >/dev/null 2>&1 ||
  { echo 'Image postgres:16-alpine is not present locally (this probe never pulls).' >&2; exit 3; }

new_migration=$(cd "$source_schema/migrations" && ls -d *_tenant_access_identity 2>/dev/null | head -n 1)
[[ -n $new_migration ]] || { echo 'Migration *_tenant_access_identity not found.' >&2; exit 2; }

scratch=$(mktemp -d "${TMPDIR:-/tmp}/hu025-tenant-access.XXXXXXXXXX")
name="hu025-tenant-access-$(openssl rand -hex 6)"
container= network=
cleanup() {
  if [[ -n $container ]]; then docker stop -t 1 "$container" >/dev/null 2>&1 || true; fi
  if [[ -n $network ]]; then docker network rm "$network" >/dev/null 2>&1 || true; fi
  rm -rf -- "$scratch"
}
trap cleanup EXIT

mkdir -p "$scratch"/{home,tmp,prisma/migrations}
cp "$source_schema/schema.prisma" "$scratch/prisma/"
cp "$source_schema/migrations/migration_lock.toml" "$scratch/prisma/migrations/"
for path in "$source_schema"/migrations/*/; do
  [[ $(basename "$path") == "$new_migration" ]] || cp -R "${path%/}" "$scratch/prisma/migrations/"
done
cd "$scratch"

network=$(docker network create --label "hu025.tenant-access=$name" "$name")
pass=$(openssl rand -hex 18)
container=$(docker run --pull never --rm -d --name "$name" --network "$network" --label "hu025.tenant-access=$name" \
  --tmpfs /var/lib/postgresql/data:rw -e POSTGRES_PASSWORD="$pass" -e POSTGRES_DB=tenant_access \
  -p 127.0.0.1::5432 postgres:16-alpine)
for attempt in $(seq 1 60); do
  docker exec "$container" pg_isready -h 127.0.0.1 -U postgres -d tenant_access >/dev/null 2>&1 && break
  [[ $attempt != 60 ]] || { echo 'Disposable PostgreSQL did not start.' >&2; exit 2; }
  sleep 0.2
done
binding=$(docker port "$container" 5432/tcp | head -n 1)
[[ $binding =~ ^127\.0\.0\.1:[0-9]+$ ]] || { echo 'Unexpected port binding.' >&2; exit 2; }

unset DIRECT_URL SHADOW_DATABASE_URL
export DATABASE_URL="postgresql://postgres:$pass@$binding/tenant_access"
# Toda escritura exige una URL descartable de este probe.
[[ $DATABASE_URL =~ ^postgresql://postgres:[a-f0-9]{36}@127\.0\.0\.1:[0-9]+/tenant_access$ ]] || exit 2

prisma() {
  env -u NODE_OPTIONS HOME="$scratch/home" TMPDIR="$scratch/tmp" NO_UPDATE_NOTIFIER=1 \
    PRISMA_HIDE_UPDATE_MESSAGE=1 "$prisma_cli" migrate deploy --schema "$scratch/prisma/schema.prisma" >/dev/null
}
psql_db() { docker exec -i "$container" psql -X -q -v ON_ERROR_STOP=1 -U postgres -d "$1"; }

echo '1/4 upgrade: migraciones previas + fixture'
prisma
psql_db tenant_access <<'SQL'
-- Desde cero no hay profesional, así que la fundación no creó legacy-agenda: se la agrega acá.
INSERT INTO "Professional" (id, name, email, "tenantId", "updatedAt")
  VALUES (1, 'Prof Legacy', 'legacy-prof@example.test', 'legacy-tenant', now());
INSERT INTO "Agenda" (id, "tenantId", "professionalId", "isPrimary") VALUES ('legacy-agenda', 'legacy-tenant', 1, true);
INSERT INTO "Tenant" (id) VALUES ('tenant-b'), ('tenant-no-agenda');
INSERT INTO "Professional" (id, name, email, "tenantId", "updatedAt")
  VALUES (2, 'Prof B', 'b-prof@example.test', 'tenant-b', now());
INSERT INTO "Agenda" (id, "tenantId", "professionalId", "isPrimary") VALUES ('agenda-b', 'tenant-b', 2, true);
-- Identidades previas a la migración nueva.
INSERT INTO "User" (id, email, "googleSubject") VALUES
  ('hist', ' Hist@Example.test ', NULL),
  ('bound-b', 'bound@example.test', '100000000000000000001');
INSERT INTO "TenantMembership" ("tenantId", "userId", role) VALUES ('tenant-b', 'bound-b', 'STAFF');
SQL

echo "2/4 upgrade: aplica $new_migration"
cp -R "$source_schema/migrations/$new_migration" "$scratch/prisma/migrations/"
prisma

echo '3/4 instalación desde cero (todas las migraciones)'
psql_db tenant_access <<<'CREATE DATABASE fresh;'
DATABASE_URL="postgresql://postgres:$pass@$binding/fresh" prisma
fresh_columns=$(docker exec "$container" psql -X -At -U postgres -d fresh -c "SELECT string_agg(table_name || '.' || column_name || ':' || is_nullable, ',' ORDER BY table_name, column_name) FROM information_schema.columns WHERE (table_name = 'User' AND column_name IN ('createdAt','lastSignInAt')) OR (table_name = 'TenantMembership' AND column_name = 'createdAt')")
[[ $fresh_columns == 'TenantMembership.createdAt:NO,User.createdAt:NO,User.lastSignInAt:YES' ]] ||
  { echo "Fresh install columns mismatch: $fresh_columns" >&2; exit 1; }

echo '4/4 integración (registerGoogleIdentity + tenant-access)'
cd "$root/packages/db"
TENANT_ACCESS_DISPOSABLE=1 VITEST= env -u NODE_OPTIONS HOME="$scratch/home" \
  "$tsx_cli" --test "$root/packages/db/scripts/tenant-access.integration.ts"
echo 'test-tenant-access: OK'
