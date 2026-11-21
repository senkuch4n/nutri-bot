#!/usr/bin/env bash
# End-to-end Prisma deploy/recovery against synthetic data only. Never uses the repo .env.
set -euo pipefail
umask 077

allocate_scratch() {
  local scratch_root=${HU024_SCRATCH_ROOT:-} physical
  # Keep a sentinel so command substitution cannot strip newlines from the path.
  if [[ $scratch_root != /* || $scratch_root == / ]] ||
     ! physical=$(cd -P -- "$scratch_root" 2>/dev/null && printf '%s.' "$PWD") ||
     [[ $physical != "$scratch_root." ]]; then
    printf '%s\n' 'HU024_SCRATCH_ROOT must name an existing absolute physical canonical directory other than /' >&2
    return 2
  fi
  mktemp -d "$scratch_root/hu024-prisma.XXXXXXXXXX"
}

if [[ $# == 1 && $1 == --check-scratch ]]; then
  allocate_scratch
  exit 0
elif [[ $# != 0 ]]; then
  printf 'Usage: HU024_SCRATCH_ROOT=/absolute/physical/directory bash %s [--check-scratch]\n' "$0" >&2
  exit 2
fi

: "${DOCKER_HOST:?Select the authorized disposable Docker socket explicitly}"
[[ -z ${DOCKER_CONTEXT:-} && $DOCKER_HOST = unix:///Users/leonel/.docker/run/docker.sock ]]
cd "$(dirname "$0")/../../.."
root=$PWD
source packages/db/scripts/test-recipe-reference-ownership.sh
cli=$root/node_modules/.bin/prisma
[[ -x $cli ]] || { echo 'Local Prisma CLI is required' >&2; exit 2; }
key=20261120121300_recipe_reference_ownership
work=$(allocate_scratch)
printf 'Evidence (restricted scratch): %s\n' "$work"
mkdir "$work"/{home,tmp,migrations}
cp packages/db/prisma/schema.prisma "$work/schema.prisma"
cp packages/db/prisma/migrations/migration_lock.toml "$work/migrations/"
for dir in packages/db/prisma/migrations/*/; do
  name=$(basename "$dir")
  if [[ "$name" < "$base" || "$name" == "$base" ]]; then cp -R "$dir" "$work/migrations/$name"; fi
done
cd "$work"
# Keep Docker's original client configuration; isolate Prisma's HOME, dotenv and caches.
prisma() {
  env -u NODE_OPTIONS -u NODE_COMPILE_CACHE HOME="$work/home" TMPDIR="$work/tmp" NO_UPDATE_NOTIFIER=1 \
    "$cli" migrate "$@" --schema "$work/schema.prisma"
}
name="hu024-prisma-$(uuidgen | tr '[:upper:]' '[:lower:]')"
container= network=
trap 'if [[ -n "$container" ]]; then docker stop -t 1 "$container" >/dev/null; fi; if [[ -n "$network" ]]; then docker network rm "$network" >/dev/null; fi' EXIT
network=$(docker network create --label "hu024.prisma=$name" "$name")
pass=$(openssl rand -hex 18)
container=$(docker run --pull never --rm -d --name "$name" --network "$network" --label "hu024.prisma=$name" \
  --tmpfs /var/lib/postgresql/data:rw -e POSTGRES_PASSWORD="$pass" -p 127.0.0.1::5432 postgres:16-alpine)
for attempt in {1..60}; do
  docker exec "$container" pg_isready -h 127.0.0.1 -U postgres >/dev/null 2>&1 && break
  [[ "$attempt" != 60 ]] || exit 2
  sleep .2
done
port=$(docker port "$container" 5432/tcp)
export DATABASE_URL="postgresql://postgres:$pass@127.0.0.1:${port##*:}/postgres?schema=public"
prisma deploy > baseline.stdout 2> baseline.stderr
printf 'baseline deploy: exit 0\n'
psql_db() { psql_in postgres "$@"; }
fixture postgres
psql_db <<'SQL'
INSERT INTO "PlanMealItem" (id,"mealId","recipeId","order") VALUES ('valid-pb','b','rb',0), ('bad-pa','a','rb',2);
INSERT INTO "TemplateMealItem" (id,"mealId","recipeId","order") VALUES ('valid-tb','b','rb',0), ('bad-tb','b','ra',2);
SQL
snap() {
  local phase=$1
  docker exec "$container" pg_dump -U postgres -a -T public._prisma_migrations postgres | grep -v '^\\restrict\|^\\unrestrict' > "$phase.rows"
  docker exec "$container" pg_dump -U postgres -s -T public._prisma_migrations postgres | grep -v '^\\' > "$phase.ddl"
  psql_db -c 'SELECT row_to_json(m) FROM (SELECT * FROM "_prisma_migrations" ORDER BY started_at,id) m' > "$phase.history"
}
state() {
  psql_db -c "SELECT started_at IS NOT NULL,finished_at IS NOT NULL,rolled_back_at IS NOT NULL,logs IS NULL,applied_steps_count FROM \"_prisma_migrations\" WHERE migration_name='$key' ORDER BY started_at"
}
earlier_history() {
  psql_db -c "SELECT row_to_json(m) FROM (SELECT * FROM \"_prisma_migrations\" WHERE migration_name <> '$key' ORDER BY started_at,id) m"
}
snap before
cp -R "$root/packages/db/prisma/migrations/$key" migrations/
rc=0
prisma deploy > failed.stdout 2> failed.stderr || rc=$?
printf 'conflicted deploy: exit %s\n' "$rc"
[[ $rc = 1 ]]
snap failed
cmp before.rows failed.rows
cmp before.ddl failed.ddl
earlier_history > failed-earlier.history
cmp before.history failed-earlier.history
printf 'functional rows/DDL and earlier history identical after failure\n'
failed=$(state)
printf 'failure registry (started|finished|rolled back|logs NULL|steps): %s\n' "$failed"
expected='[["NutritionPlan", "pa", "bad-pa", "rb", "legacy-tenant", "b"], ["PlanTemplate", "tb", "bad-tb", "ra", "b", "legacy-tenant"]]'
if ! grep -Fx 'ERROR: Historical cross-tenant recipe references' failed.stderr || ! grep -Fx "DETAIL: $expected" failed.stderr; then
  printf 'Prisma stderr lost the historical conflict diagnostic:\n' >&2
  grep '^Error' failed.stderr >&2 || true
  exit 1
fi
grep -Fx 'Error: P3018' failed.stderr
grep -Fx 'Database error code: 23514' failed.stderr
[[ $failed = 't|f|f|f|0' ]]
failed_attempt() {
  psql_db -c "SELECT row_to_json(m)::jsonb - 'rolled_back_at' FROM \"_prisma_migrations\" m WHERE migration_name='$key' AND finished_at IS NULL"
}
failed_attempt > failed-attempt.json
psql_db -c "SELECT logs FROM \"_prisma_migrations\" WHERE migration_name='$key'" > failed-registry.log
grep -Fxq 'ERROR: Historical cross-tenant recipe references' failed-registry.log
grep -Fxq "DETAIL: $expected" failed-registry.log
# Reconcile only after verifying rollback and the exact failed state.
prisma resolve --rolled-back "$key" > resolve.stdout 2> resolve.stderr
printf 'resolve --rolled-back: exit 0\n'
snap resolved
cmp failed.rows resolved.rows
cmp failed.ddl resolved.ddl
earlier_history > resolved-earlier.history
cmp before.history resolved-earlier.history
resolved=$(state)
[[ $resolved = 't|f|t|f|0' ]]
failed_attempt > resolved-attempt.json
cmp failed-attempt.json resolved-attempt.json
printf 'resolved registry: %s\n' "$resolved"
# Fixture-only repair: exactly these two edges, no owner updates. Check the full expected row delta.
psql_db <<'SQL'
BEGIN;
UPDATE "PlanMealItem" SET "recipeId"='ra' WHERE id='bad-pa' AND "recipeId"='rb';
UPDATE "TemplateMealItem" SET "recipeId"='rb' WHERE id='bad-tb' AND "recipeId"='ra';
COMMIT;
SQL
snap repaired
cmp resolved.ddl repaired.ddl
cmp resolved.history repaired.history
# The full data dump includes all COPY rows. Compare as a multiset because updates can move rows physically.
awk -F '\t' 'BEGIN {OFS="\t"} $1=="bad-pa" {for(i=2;i<=NF;i++) if($i=="rb") $i="ra"} $1=="bad-tb" {for(i=2;i<=NF;i++) if($i=="ra") $i="rb"} {print}' resolved.rows | sort > expected-repaired.sorted
sort repaired.rows > repaired.sorted
cmp expected-repaired.sorted repaired.sorted
prisma deploy > retry.stdout 2> retry.stderr
printf 'retry deploy: exit 0\n'
snap success
# The migration adds the private fence row; compare all pre-existing functional data separately.
docker exec "$container" pg_dump -U postgres -a -T public._prisma_migrations -N recipe_reference_guard postgres | grep -v '^\\restrict\|^\\unrestrict' > success-functional.rows
cmp repaired.rows success-functional.rows
earlier_history > success-earlier.history
cmp before.history success-earlier.history
success=$(state)
[[ $success = "$resolved"$'\nt|t|f|t|1' ]]
failed_attempt > retry-failed-attempt.json
cmp failed-attempt.json retry-failed-attempt.json
printf 'retry registry:\n%s\n' "$success"
[[ $(psql_db -c 'SELECT count(*) FROM recipe_reference_guard.conflicts') = 0 ]]
psql_db <<'SQL'
DO $$ DECLARE rule text;
BEGIN
  BEGIN
    UPDATE "PlanMealItem" SET "recipeId"='rb' WHERE id='pi';
    RAISE EXCEPTION 'accepted cross-tenant plan write';
  EXCEPTION WHEN check_violation THEN
    GET STACKED DIAGNOSTICS rule = CONSTRAINT_NAME;
    IF rule <> 'recipe_reference_ownership' THEN RAISE; END IF;
  END;
  BEGIN
    UPDATE "TemplateMealItem" SET "recipeId"='ra' WHERE id='valid-tb';
    RAISE EXCEPTION 'accepted cross-tenant template write';
  EXCEPTION WHEN check_violation THEN
    GET STACKED DIAGNOSTICS rule = CONSTRAINT_NAME;
    IF rule <> 'recipe_reference_ownership' THEN RAISE; END IF;
  END;
END $$;
SQL
snap final
cmp success.rows final.rows
cmp success.ddl final.ddl
cmp success.history final.history
printf 'only the two fixture edges repaired; retry preserves functional rows; both cross-writes rejected without changes\n'
