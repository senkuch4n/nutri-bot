#!/usr/bin/env bash
# Upgrade and clean install on synthetic, disposable PostgreSQL only.
set -euo pipefail
export LC_ALL=C
root=$(git -C "$(dirname "$0")" rev-parse --show-toplevel)
prisma="$root/node_modules/.bin/prisma"
schema="$root/packages/db/prisma"
d() { docker --host unix:///Users/leonel/.docker/run/docker.sock "$@"; }
scratch=$(mktemp -d "${TMPDIR:-/tmp}/hu024-catalog.XXXXXX")
container=
cleanup() {
  if [ -n "$container" ]; then d stop -t 1 "$container" >/dev/null; fi
  rm -rf -- "$scratch"
}
trap cleanup EXIT
mkdir "$scratch/migrations"
awk '/provider = "prisma-client-js"/ { print "  output = \"./client\"" } { print }' "$schema/schema.prisma" > "$scratch/schema.prisma"
cp "$schema/migrations/migration_lock.toml" "$scratch/migrations/"
base=20261120051949_outbound_ownership
for path in "$schema"/migrations/*/; do
  name=$(basename "$path")
  if [[ "$name" < "$base" || "$name" == "$base" ]]; then cp -R "${path%/}" "$scratch/migrations/"; fi
done
export POSTGRES_PASSWORD
POSTGRES_PASSWORD=$(openssl rand -hex 18)
container=$(d run --pull=never --rm --detach --publish '127.0.0.1::5432' \
  --tmpfs /var/lib/postgresql/data:rw --env POSTGRES_PASSWORD --env POSTGRES_DB=catalog_upgrade postgres:16-alpine)
for attempt in $(seq 1 50); do
  if d exec "$container" pg_isready -h 127.0.0.1 -U postgres -d catalog_upgrade >/dev/null 2>&1; then break; fi
  [ "$attempt" -lt 50 ] || { echo 'Postgres did not become ready.' >&2; exit 1; }
  sleep 0.2
done
binding=$(d port "$container" 5432/tcp)
[[ "$binding" =~ ^127\.0\.0\.1:[0-9]+$ ]] || exit 2
url() { printf 'postgresql://postgres:%s@%s/%s' "$POSTGRES_PASSWORD" "$binding" "$1"; }
cd "$scratch"
unset DIRECT_URL SHADOW_DATABASE_URL
migrate() {
  local output
  output=$(DATABASE_URL=$(url "$1") "$prisma" migrate deploy --schema schema.prisma 2>&1) || { printf '%s\n' "$output" >&2; return 1; }
}
psql_in() {
  local db=$1; shift
  d exec -i "$container" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d "$db" "$@"
}
upgrade() { psql_in catalog_upgrade "$@"; }
snapshot() {
  upgrade -c 'SELECT jsonb_build_array(
    (SELECT jsonb_agg(to_jsonb(f) - ARRAY['\''tenantId'\'', '\''catalogActive'\''] ORDER BY id) FROM "Food" f),
    (SELECT jsonb_agg(to_jsonb(m) - '\''tenantId'\'' ORDER BY id) FROM "FoodMeasure" m),
    (SELECT jsonb_agg(r ORDER BY id) FROM "RecipeIngredient" r),
    (SELECT jsonb_agg(i ORDER BY id) FROM "PlanMealItem" i))'
}
migrate catalog_upgrade
upgrade <<'SQL'
INSERT INTO "Tenant" (id) VALUES ('new-tenant');
INSERT INTO "Food" (id,name,"group",source,"sourceKey",active,"kcalPer100","proteinPer100","carbsPer100","fatPer100","updatedAt") VALUES
 ('shared','Shared','FRUTAS','SARA2','sara2:shared',false,18,2,2,1,now()),
 ('retired','Retired','FRUTAS','SARA2','sara2:retired',true,18,2,2,1,now()),
 ('own','Private','OTROS','PROPIO',NULL,true,18,2,2,1,now());
INSERT INTO "FoodMeasure" (id,"foodId",name,"nameKey",grams,"order","updatedAt") VALUES
 ('legacy-cup','shared','Taza','taza',100,0,now()), ('legacy-private','own','Unidad','unidad',120,0,now());
INSERT INTO "Recipe" (id,name,"updatedAt") VALUES ('recipe','Synthetic',now());
INSERT INTO "RecipeIngredient" (id,"recipeId","foodId","order") VALUES ('ingredient','recipe','own',0);
INSERT INTO "Patient" (id,"whatsappJid",phone,"tenantId","updatedAt") VALUES ('patient','synthetic','synthetic','legacy-tenant',now());
INSERT INTO "NutritionPlan" (id,"patientId","tenantId",title,"updatedAt") VALUES ('plan','patient','legacy-tenant','Synthetic',now());
INSERT INTO "PlanMeal" (id,"planId",name,"order") VALUES ('meal','plan','Synthetic',0);
INSERT INTO "PlanMealItem" (id,"mealId","foodId","order") VALUES ('item','meal','shared',0);
SQL
before=$(snapshot)
for path in "$schema"/migrations/*_catalog_ownership/; do
  if [ -d "$path" ]; then cp -R "${path%/}" "$scratch/migrations/"; fi
done
migrate catalog_upgrade
[ "$(snapshot)" = "$before" ] || { echo 'Upgrade changed preexisting columns or references.' >&2; exit 1; }
[ "$(upgrade -c 'SELECT "tenantId" FROM "Food" WHERE id = '\''own'\''')" = legacy-tenant ] || { echo 'Wrong private food owner.' >&2; exit 1; }
ln -s "$root/node_modules" node_modules
PRISMA_GENERATE_SKIP_AUTOINSTALL=1 DATABASE_URL=$(url catalog_upgrade) "$prisma" generate --schema schema.prisma >/dev/null
DATABASE_URL=$(url catalog_upgrade) "$root/node_modules/.bin/tsx" "$root/packages/db/scripts/test-catalog-ownership.ts" "$scratch/client"
d exec "$container" createdb -U postgres catalog_fresh
migrate catalog_fresh
psql_in catalog_fresh <<'SQL'
INSERT INTO "Food" (id,name,"group","kcalPer100","proteinPer100","carbsPer100","fatPer100","updatedAt")
 VALUES ('legacy','Legacy','OTROS',0,0,0,0,now());
INSERT INTO "FoodMeasure" (id,"foodId",name,"nameKey",grams,"order","updatedAt")
 VALUES ('measure','legacy','Taza','taza',100,0,now());
DO $$ BEGIN
  IF (SELECT "tenantId" FROM "Food" WHERE id = 'legacy') IS NOT NULL OR
     (SELECT "tenantId" FROM "FoodMeasure" WHERE id = 'measure') IS DISTINCT FROM 'legacy-tenant' THEN
    RAISE EXCEPTION 'Legacy insert changed on clean install';
  END IF;
END $$;
SQL
printf 'Catalog upgrade preserved old rows and references; clean install and legacy writes passed.\n'
