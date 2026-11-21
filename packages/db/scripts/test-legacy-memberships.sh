#!/usr/bin/env bash
# Disposable PostgreSQL only; no repository .env or development database.
set -euo pipefail
root=$(git -C "$(dirname "$0")" rev-parse --show-toplevel)
d() { docker --host unix:///Users/leonel/.docker/run/docker.sock "$@"; }
scratch=$(mktemp -d "${TMPDIR:-/tmp}/hu024-memberships.XXXXXX")
container=
cleanup() {
  if [ -n "$container" ]; then d stop -t 1 "$container" >/dev/null; fi
  rm -rf -- "$scratch"
}
trap cleanup EXIT
cd "$scratch"
source_schema="$root/packages/db/prisma"
mkdir -p prisma/migrations
cp "$source_schema/schema.prisma" prisma/
cp "$source_schema/migrations/migration_lock.toml" prisma/migrations/
for path in "$source_schema"/migrations/*/; do
  [[ "$path" == *_legacy_identity_binding/ ]] || cp -R "${path%/}" prisma/migrations/
done
export POSTGRES_PASSWORD DATABASE_URL
POSTGRES_PASSWORD=$(openssl rand -hex 18)
container=$(d run --pull=never --rm --detach --publish '127.0.0.1::5432' \
  --tmpfs /var/lib/postgresql/data:rw --env POSTGRES_PASSWORD --env POSTGRES_DB=memberships postgres:16-alpine)
for attempt in $(seq 1 50); do
  if d exec "$container" pg_isready -h 127.0.0.1 -U postgres -d memberships >/dev/null 2>&1; then break; fi
  [ "$attempt" -lt 50 ] || exit 1
  sleep 0.2
done
binding=$(d port "$container" 5432/tcp)
[[ "$binding" =~ ^127\.0\.0\.1:[0-9]+$ ]] || exit 2
DATABASE_URL="postgresql://postgres:$POSTGRES_PASSWORD@$binding/memberships"
unset DIRECT_URL SHADOW_DATABASE_URL
prisma="$root/node_modules/.bin/prisma"
# Seed the pre-migration database to check the upgrade, not just a fresh install.
"$prisma" migrate deploy --schema prisma/schema.prisma >/dev/null
d exec -i "$container" psql -X -q -v ON_ERROR_STOP=1 -U postgres -d memberships <<'SQL'
INSERT INTO "User" (id,email) VALUES ('existing',' Owner@Example.test '), ('unlisted','unlisted@example.test');
INSERT INTO "Tenant" (id) VALUES ('other-tenant');
INSERT INTO "TenantMembership" ("tenantId","userId",role) VALUES ('other-tenant','existing','STAFF');
SQL
for path in "$source_schema"/migrations/*_legacy_identity_binding; do
  if [ -d "$path" ]; then cp -R "$path" prisma/migrations/; fi
done
"$prisma" migrate deploy --schema prisma/schema.prisma >/dev/null
LEGACY_MEMBERSHIPS_DISPOSABLE=1 VITEST= "$root/node_modules/.bin/tsx" --test "$root/packages/db/scripts/legacy-memberships.test.ts"
