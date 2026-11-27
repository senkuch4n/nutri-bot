#!/usr/bin/env bash
# HU-026: migrate and test signup only in a fresh, disposable Postgres container.
set -euo pipefail
umask 077

root=$(git -C "$(dirname "$0")" rev-parse --show-toplevel)
prisma_cli="$root/node_modules/.bin/prisma"
tsx_cli="$root/node_modules/.bin/tsx"
[[ -x $prisma_cli && -x $tsx_cli ]] || { echo 'Local prisma and tsx CLIs are required.' >&2; exit 2; }
docker image inspect postgres:16-alpine >/dev/null 2>&1 ||
  { echo 'Local postgres:16-alpine image required; this script does not pull.' >&2; exit 3; }

# Keep the tsx IPC socket path below the macOS UNIX socket length limit.
scratch=$(mktemp -d /tmp/hu026.XXXXXXXXXX)
name="hu026-onboarding-$(openssl rand -hex 6)"
container=
cleanup() {
  if [[ -n $container ]]; then docker stop -t 1 "$container" >/dev/null || true; fi
  rm -rf -- "$scratch"
}
trap cleanup EXIT
mkdir -p "$scratch/home" "$scratch/tmp"
cp -R "$root/packages/db/prisma" "$scratch/prisma"
cd "$scratch"
pass=$(openssl rand -hex 18)
container=$(docker run --pull never --rm -d --name "$name" --label hu026.disposable=true \
  --tmpfs /var/lib/postgresql/data:rw -e POSTGRES_PASSWORD="$pass" -e POSTGRES_DB=tenant_onboarding \
  -p 127.0.0.1::5432 postgres:16-alpine)
for attempt in $(seq 1 60); do
  docker exec "$container" pg_isready -h 127.0.0.1 -U postgres -d tenant_onboarding >/dev/null 2>&1 && break
  [[ $attempt != 60 ]] || { echo 'Disposable PostgreSQL did not start.' >&2; exit 2; }
  sleep 0.2
done
binding=$(docker port "$container" 5432/tcp | head -n 1)
[[ $binding =~ ^127\.0\.0\.1:[0-9]+$ ]] || { echo 'Unexpected port binding.' >&2; exit 2; }

unset DIRECT_URL SHADOW_DATABASE_URL NODE_OPTIONS VITEST
export DATABASE_URL="postgresql://postgres:$pass@$binding/tenant_onboarding"
export HOME="$scratch/home" TMPDIR="$scratch/tmp" NO_UPDATE_NOTIFIER=1
export PRISMA_HIDE_UPDATE_MESSAGE=1 TENANT_ONBOARDING_DISPOSABLE=1
"$prisma_cli" migrate deploy --schema "$scratch/prisma/schema.prisma"
"$tsx_cli" --test "$root/packages/db/scripts/tenant-onboarding.integration.ts"
