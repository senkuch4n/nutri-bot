#!/usr/bin/env bash
# From the repository root: bash packages/db/scripts/test-hu027-enqueue-dedupe.sh
# Requires local Docker, postgres:16-alpine already loaded, and local Prisma/tsx
# with an up-to-date generated client. Never pulls, generates, or uses the repo .env.
set -euo pipefail
umask 077

root=$(cd "$(dirname "$0")/../../.." && pwd -P)
bin="$root/node_modules/.bin"
[[ -x $bin/prisma && -x $bin/tsx ]] || { echo 'Local Prisma and tsx are required.' >&2; exit 2; }
endpoint=$(docker context inspect --format '{{.Endpoints.docker.Host}}' "$(docker context show)")
[[ $endpoint == unix:///* ]] || { echo 'A local Unix socket Docker context is required.' >&2; exit 2; }
local_docker() { env -u DOCKER_CONTEXT -u DOCKER_HOST docker --host "$endpoint" "$@"; }
image=$(local_docker image inspect --format '{{.Id}}' postgres:16-alpine)
[[ $image =~ ^sha256:[0-9a-f]{64}$ ]] || { echo 'No valid local postgres:16-alpine image ID.' >&2; exit 2; }
nonce=$(openssl rand -hex 16)
db="hu027_$nonce"
password=$(openssl rand -hex 24)
scratch=$(mktemp -d /tmp/hu027-enqueue.XXXXXXXXXX)
container=
cleanup() {
  local failed=0
  if [[ -n $container ]]; then local_docker stop -t 1 "$container" >/dev/null || failed=1; fi
  rm -rf -- "$scratch"
  return "$failed"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

mkdir -p "$scratch"/{home,tmp,prisma}
cp "$root/packages/db/prisma/schema.prisma" "$scratch/prisma/"
cp -R "$root/packages/db/prisma/migrations" "$scratch/prisma/"
container=$(local_docker run --pull never --rm -d --name "$db" \
  --tmpfs /var/lib/postgresql/data:rw -p 127.0.0.1::5432 \
  -e POSTGRES_PASSWORD="$password" -e POSTGRES_DB="$db" "$image")
for ((attempt=0; attempt<60; attempt++)); do
  if local_docker exec "$container" pg_isready -h 127.0.0.1 -U postgres -d "$db" >/dev/null; then break; fi
  sleep 0.25
done
((attempt < 60)) || { echo 'Disposable PostgreSQL did not start.' >&2; exit 2; }
binding=$(local_docker port "$container" 5432/tcp)
[[ $binding =~ ^127\.0\.0\.1:[0-9]+$ ]] || { echo 'Unexpected PostgreSQL port binding.' >&2; exit 2; }
version=$(local_docker exec "$container" psql -XAt -v ON_ERROR_STOP=1 -U postgres -d "$db" -c 'SHOW server_version_num')
[[ $version =~ ^16[0-9]{4}$ ]] || { echo 'Expected PostgreSQL 16.' >&2; exit 2; }

# Run outside the worktree with no inherited credentials or datasource overrides.
cd "$scratch"
run_isolated() {
  env -i PATH="$PATH" HOME="$scratch/home" TMPDIR="$scratch/tmp" NODE_ENV=test \
    NO_UPDATE_NOTIFIER=1 PRISMA_HIDE_UPDATE_MESSAGE=1 HU027_DISPOSABLE_NONCE="$nonce" \
    DATABASE_URL="postgresql://postgres:$password@$binding/$db?connection_limit=5" "$@"
}
run_isolated "$bin/prisma" migrate deploy --schema "$scratch/prisma/schema.prisma"
run_isolated "$bin/tsx" "$root/packages/db/scripts/test-hu027-enqueue-dedupe.ts"
