#!/usr/bin/env bash
# HU-025 (10.3): probe de aislamiento entre consultorios para las funciones de dominio de 025b-1 (M1–M3).
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

scratch=$(mktemp -d "${TMPDIR:-/tmp}/hu025-tenant-isolation.XXXXXXXXXX")
name="hu025-tenant-isolation-$(openssl rand -hex 6)"
container= network=
cleanup() {
  if [[ -n $container ]]; then docker stop -t 1 "$container" >/dev/null 2>&1 || true; fi
  if [[ -n $network ]]; then docker network rm "$network" >/dev/null 2>&1 || true; fi
  rm -rf -- "$scratch"
}
trap cleanup EXIT

mkdir -p "$scratch"/{home,tmp,prisma}
cp "$source_schema/schema.prisma" "$scratch/prisma/"
cp -R "$source_schema/migrations" "$scratch/prisma/"
cd "$scratch"

network=$(docker network create --label "hu025.tenant-isolation=$name" "$name")
pass=$(openssl rand -hex 18)
container=$(docker run --pull never --rm -d --name "$name" --network "$network" --label "hu025.tenant-isolation=$name" \
  --tmpfs /var/lib/postgresql/data:rw -e POSTGRES_PASSWORD="$pass" -e POSTGRES_DB=tenant_isolation \
  -p 127.0.0.1::5432 postgres:16-alpine)
for attempt in $(seq 1 60); do
  docker exec "$container" pg_isready -h 127.0.0.1 -U postgres -d tenant_isolation >/dev/null 2>&1 && break
  [[ $attempt != 60 ]] || { echo 'Disposable PostgreSQL did not start.' >&2; exit 2; }
  sleep 0.2
done
binding=$(docker port "$container" 5432/tcp | head -n 1)
[[ $binding =~ ^127\.0\.0\.1:[0-9]+$ ]] || { echo 'Unexpected port binding.' >&2; exit 2; }

unset DIRECT_URL SHADOW_DATABASE_URL
export DATABASE_URL="postgresql://postgres:$pass@$binding/tenant_isolation"
# Toda escritura exige una URL descartable de este probe.
[[ $DATABASE_URL =~ ^postgresql://postgres:[a-f0-9]{36}@127\.0\.0\.1:[0-9]+/tenant_isolation$ ]] || exit 2

echo '1/2 instalación desde cero (todas las migraciones)'
env -u NODE_OPTIONS HOME="$scratch/home" TMPDIR="$scratch/tmp" NO_UPDATE_NOTIFIER=1 PRISMA_HIDE_UPDATE_MESSAGE=1 \
  "$prisma_cli" migrate deploy --schema "$scratch/prisma/schema.prisma" >/dev/null

echo '2/2 integración: consultorios A y B, cada función de dominio de M1–M3 con { tenantId: A } e ids de B'
cd "$root/packages/db"
TENANT_ISOLATION_DISPOSABLE=1 VITEST= NODE_ENV=test MIN_LEAD_MINUTES=0 env -u NODE_OPTIONS HOME="$scratch/home" \
  "$tsx_cli" --test "$root/packages/db/scripts/tenant-isolation.integration.ts"
echo 'test-tenant-isolation: OK'
