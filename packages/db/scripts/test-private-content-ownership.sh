#!/usr/bin/env bash
# Upgrade and clean install with synthetic rows in isolated PostgreSQL only.
set -euo pipefail
export LC_ALL=C
root=$(git -C "$(dirname "$0")" rev-parse --show-toplevel)
prisma="$root/node_modules/.bin/prisma"
schema="$root/packages/db/prisma"
d() { docker --host unix:///Users/leonel/.docker/run/docker.sock "$@"; }
[ -x "$prisma" ] || { echo 'Install the worktree dependencies first.' >&2; exit 2; }
scratch=$(mktemp -d "${TMPDIR:-/tmp}/hu024-private-content.XXXXXX")
container=
cleanup() {
  if [ -n "$container" ]; then d stop -t 1 "$container" >/dev/null; fi
  rm -rf -- "$scratch"
}
trap cleanup EXIT
mkdir "$scratch/migrations"
cp "$schema/schema.prisma" "$scratch/schema.prisma"
cp "$schema/migrations/migration_lock.toml" "$scratch/migrations/"
base=20261120053254_catalog_ownership
for path in "$schema"/migrations/*/; do
  name=$(basename "$path")
  if [[ "$name" < "$base" || "$name" == "$base" ]]; then cp -R "${path%/}" "$scratch/migrations/"; fi
done
export POSTGRES_PASSWORD
POSTGRES_PASSWORD=$(openssl rand -hex 18)
container=$(d run --pull=never --rm --detach --publish '127.0.0.1::5432' \
  --tmpfs /var/lib/postgresql/data:rw --env POSTGRES_PASSWORD --env POSTGRES_DB=private_upgrade postgres:16-alpine)
for attempt in $(seq 1 50); do
  if d exec "$container" pg_isready -h 127.0.0.1 -U postgres -d private_upgrade >/dev/null 2>&1; then break; fi
  [ "$attempt" -lt 50 ] || { echo 'Postgres did not become ready.' >&2; exit 1; }
  sleep 0.2
done
binding=$(d port "$container" 5432/tcp)
[[ "$binding" =~ ^127\.0\.0\.1:[0-9]+$ ]] || exit 2
cd "$scratch"
unset DIRECT_URL SHADOW_DATABASE_URL
url() { printf 'postgresql://postgres:%s@%s/%s' "$POSTGRES_PASSWORD" "$binding" "$1"; }
migrate() {
  local output
  output=$(DATABASE_URL=$(url "$1") "$prisma" migrate deploy --schema schema.prisma 2>&1) || { printf '%s\n' "$output" >&2; return 1; }
}
psql_in() {
  local db=$1; shift
  d exec -i "$container" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d "$db" "$@"
}
upgrade() { psql_in private_upgrade "$@"; }
fail() { printf '%s\n' "$1" >&2; exit 1; }
snapshot() {
  upgrade <<'SQL'
SELECT jsonb_build_array(
  (SELECT jsonb_agg(to_jsonb(r) - 'tenantId' ORDER BY id) FROM "Recipe" r),
  (SELECT jsonb_agg(to_jsonb(t) - 'tenantId' ORDER BY id) FROM "PlanTemplate" t),
  (SELECT jsonb_agg(i ORDER BY id) FROM "RecipeIngredient" i),
  (SELECT jsonb_agg(p ORDER BY id) FROM "RecipePhoto" p),
  (SELECT jsonb_agg(i ORDER BY id) FROM "RecipeImportImage" i),
  (SELECT jsonb_agg(s ORDER BY id) FROM "PlanTemplateSection" s),
  (SELECT jsonb_agg(m ORDER BY id) FROM "TemplateMeal" m),
  (SELECT jsonb_agg(i ORDER BY id) FROM "TemplateMealItem" i),
  (SELECT jsonb_agg(m ORDER BY id) FROM "PlanMeal" m),
  (SELECT jsonb_agg(i ORDER BY id) FROM "PlanMealItem" i),
  (SELECT jsonb_agg(f ORDER BY id) FROM "Food" f));
SQL
}

migrate private_upgrade
upgrade <<'SQL'
INSERT INTO "Tenant" (id) VALUES ('other');
INSERT INTO "Food" (id,name,"group",source,"sourceKey","catalogActive","kcalPer100","proteinPer100","carbsPer100","fatPer100","updatedAt") VALUES
  ('retired','Synthetic official','OTROS','SARA2','sara2:fixture',false,1,2,3,4,now()),
  ('own','Synthetic private','OTROS','PROPIO',NULL,true,2,3,4,5,now());
UPDATE "Food" SET "tenantId" = 'legacy-tenant' WHERE id = 'own';
INSERT INTO "Recipe" (id,name,status,origin,"importKey","importPage","importRawText","importHints","reviewedAt","updatedAt") VALUES
  ('recipe','Imported recipe','DRAFT','IMPORT','recipe:fixture',7,'Synthetic text','{"notes":["fixture"]}',now(),now()),
  ('manual-recipe','Manual recipe','PUBLISHED','MANUAL',NULL,NULL,NULL,NULL,NULL,now());
INSERT INTO "RecipeIngredient" (id,"recipeId","foodId","order",grams) VALUES ('ingredient','recipe','own',2,123.45);
INSERT INTO "RecipePhoto" (id,"recipeId",data,"thumbData","byteSize",credit) VALUES ('photo','recipe','\x0123','\x45',2,'Synthetic');
INSERT INTO "RecipeImportImage" (id,"recipeId",kind,"order",data,"thumbData",width,height) VALUES
  ('page','recipe','PAGE',0,'\x1234',NULL,800,1000), ('candidate','recipe','CANDIDATE',1,'\x5678','\x9a',1200,900);
INSERT INTO "PlanTemplate" (id,title,status,origin,"importKey","importHints","reviewedAt","updatedAt") VALUES
  ('template','Imported template','DRAFT','IMPORT','pdf-sha256:fixture','[{"note":"fixture"}]',now(),now()),
  ('manual-template','Manual template','PUBLISHED','MANUAL',NULL,NULL,NULL,now());
INSERT INTO "PlanTemplateSection" (id,"templateId",title,body,"order","updatedAt") VALUES ('section','template','Synthetic','Body',3,now());
INSERT INTO "TemplateMeal" (id,"templateId",name,"order") VALUES ('tm','template','Synthetic',0);
INSERT INTO "TemplateMealItem" (id,"mealId","foodId","recipeId","order",portions) VALUES
  ('ti-recipe','tm',NULL,'recipe',0,1.5), ('ti-food','tm','retired',NULL,1,NULL);
INSERT INTO "Patient" (id,"whatsappJid",phone,"tenantId","updatedAt") VALUES ('patient','synthetic','synthetic','legacy-tenant',now());
INSERT INTO "NutritionPlan" (id,"patientId","tenantId",title,"updatedAt") VALUES ('plan','patient','legacy-tenant','Synthetic',now());
INSERT INTO "PlanMeal" (id,"planId",name,"order") VALUES ('pm','plan','Synthetic',0);
INSERT INTO "PlanMealItem" (id,"mealId","foodId","recipeId","order",portions) VALUES
  ('pi-recipe','pm',NULL,'recipe',0,2.5), ('pi-food','pm','retired',NULL,1,NULL);
SQL
before=$(snapshot)
for path in "$schema"/migrations/*_private_content_ownership/; do
  if [ -d "$path" ]; then cp -R "${path%/}" "$scratch/migrations/"; fi
done
migrate private_upgrade
owners=$(upgrade -c 'SELECT jsonb_build_array((SELECT jsonb_object_agg(id,"tenantId") FROM "Recipe"), (SELECT jsonb_object_agg(id,"tenantId") FROM "PlanTemplate"))')
[ "$owners" = '[{"recipe": "legacy-tenant", "manual-recipe": "legacy-tenant"}, {"template": "legacy-tenant", "manual-template": "legacy-tenant"}]' ] || fail "Wrong backfilled owners: $owners"
upgrade <<'SQL'
DO $$ DECLARE
  model text;
  label_col text;
  owned_id text;
  import_key text;
  violated text;
BEGIN
  FOR model, label_col, owned_id, import_key IN VALUES
    ('Recipe','name','recipe','recipe:fixture'), ('PlanTemplate','title','template','pdf-sha256:fixture')
  LOOP
    BEGIN
      EXECUTE format('UPDATE %I SET "tenantId" = ''unknown'' WHERE id = $1', model) USING owned_id;
      RAISE EXCEPTION '% accepted an unknown tenant', model;
    EXCEPTION WHEN foreign_key_violation THEN
      GET STACKED DIAGNOSTICS violated = CONSTRAINT_NAME;
      IF violated <> model || '_tenantId_fkey' THEN RAISE; END IF;
    END;
    BEGIN
      EXECUTE format('INSERT INTO %I (id,%I,"updatedAt","tenantId","importKey") VALUES (''duplicate'',''Synthetic'',now(),''other'',$1)', model, label_col)
        USING import_key;
      RAISE EXCEPTION '% lost global importKey uniqueness', model;
    EXCEPTION WHEN unique_violation THEN
      GET STACKED DIAGNOSTICS violated = CONSTRAINT_NAME;
      IF violated <> model || '_importKey_key' THEN RAISE; END IF;
    END;
  END LOOP;
END $$;
SQL
[ "$(snapshot)" = "$before" ] || fail 'Upgrade or rejected writes changed preexisting columns, rows or references.'
[ "$(upgrade -c 'SELECT jsonb_build_array((SELECT jsonb_object_agg(id,"tenantId") FROM "Recipe"), (SELECT jsonb_object_agg(id,"tenantId") FROM "PlanTemplate"))')" = "$owners" ] || fail 'Rejected writes changed owners.'
upgrade <<'SQL'
DO $$ DECLARE violated text;
BEGIN
  BEGIN
    DELETE FROM "Recipe" WHERE id = 'recipe';
    RAISE EXCEPTION 'A meal referenced a deleted recipe';
  EXCEPTION WHEN foreign_key_violation THEN
    GET STACKED DIAGNOSTICS violated = CONSTRAINT_NAME;
    IF violated NOT IN ('PlanMealItem_recipeId_fkey', 'TemplateMealItem_recipeId_fkey') THEN RAISE; END IF;
  END;
END $$;
SQL
[ "$(snapshot)" = "$before" ] || fail 'Rejected recipe deletion changed descendants.'
upgrade <<'SQL'
DELETE FROM "PlanTemplate" WHERE id = 'template';
DO $$ BEGIN
  IF EXISTS (SELECT FROM "PlanTemplateSection" WHERE id = 'section') OR
     EXISTS (SELECT FROM "TemplateMeal" WHERE id = 'tm') OR
     EXISTS (SELECT FROM "TemplateMealItem" WHERE "mealId" = 'tm') OR
     NOT EXISTS (SELECT FROM "Recipe" WHERE id = 'recipe') THEN
    RAISE EXCEPTION 'Template deletion changed its legacy cascade';
  END IF;
END $$;
DELETE FROM "PlanMealItem" WHERE id = 'pi-recipe';
DELETE FROM "Recipe" WHERE id = 'recipe';
DO $$ BEGIN
  IF EXISTS (SELECT FROM "RecipeIngredient" WHERE id = 'ingredient') OR
     EXISTS (SELECT FROM "RecipePhoto" WHERE id = 'photo') OR
     EXISTS (SELECT FROM "RecipeImportImage" WHERE "recipeId" = 'recipe') OR
     NOT EXISTS (SELECT FROM "Food" WHERE id = 'own') OR
     NOT EXISTS (SELECT FROM "PlanMealItem" WHERE id = 'pi-food' AND "foodId" = 'retired') THEN
    RAISE EXCEPTION 'Recipe deletion changed its legacy cascade or unrelated references';
  END IF;
END $$;
SQL

d exec "$container" createdb -U postgres private_fresh
migrate private_fresh
[ "$(psql_in private_fresh -c 'SELECT (SELECT count(*) FROM "Recipe") + (SELECT count(*) FROM "PlanTemplate")')" = 0 ] || fail 'Clean install created private roots.'
for db in private_upgrade private_fresh; do
  psql_in "$db" <<'SQL'
INSERT INTO "Tenant" (id) VALUES ('other') ON CONFLICT (id) DO NOTHING;
INSERT INTO "Recipe" (id,name,"updatedAt","tenantId") VALUES
  ('scope-a','Same recipe',now(),'legacy-tenant'), ('scope-b','Same recipe',now(),'other');
INSERT INTO "PlanTemplate" (id,title,"updatedAt","tenantId") VALUES
  ('scope-a','Same template',now(),'legacy-tenant'), ('scope-b','Same template',now(),'other');
INSERT INTO "Recipe" (id,name,"updatedAt","importKey") VALUES ('legacy','Legacy',now(),'recipe:legacy')
  ON CONFLICT ("importKey") DO UPDATE SET name = EXCLUDED.name;
INSERT INTO "PlanTemplate" (id,title,"updatedAt","importKey") VALUES ('legacy','Legacy',now(),'pdf-sha256:legacy')
  ON CONFLICT ("importKey") DO UPDATE SET title = EXCLUDED.title;
INSERT INTO "Recipe" (id,name,"updatedAt","importKey") VALUES ('repeat-recipe','Updated',now(),'recipe:legacy')
  ON CONFLICT ("importKey") DO UPDATE SET name = EXCLUDED.name;
INSERT INTO "PlanTemplate" (id,title,"updatedAt","importKey") VALUES ('repeat-template','Updated',now(),'pdf-sha256:legacy')
  ON CONFLICT ("importKey") DO UPDATE SET title = EXCLUDED.title;
SQL
  [ "$(psql_in "$db" -c "SELECT jsonb_build_array(
    (SELECT jsonb_object_agg(id, jsonb_build_array(\"tenantId\", name)) FROM \"Recipe\" WHERE id LIKE 'scope-%' OR \"importKey\" = 'recipe:legacy'),
    (SELECT jsonb_object_agg(id, jsonb_build_array(\"tenantId\", title)) FROM \"PlanTemplate\" WHERE id LIKE 'scope-%' OR \"importKey\" = 'pdf-sha256:legacy'))")" = \
    '[{"legacy": [null, "Updated"], "scope-a": ["legacy-tenant", "Same recipe"], "scope-b": ["other", "Same recipe"]}, {"legacy": [null, "Updated"], "scope-a": ["legacy-tenant", "Same template"], "scope-b": ["other", "Same template"]}]' ] || fail "Wrong scoped or legacy import rows in $db."
done
printf 'Private content root ownership passed upgrade, preservation, constraints, deletion, legacy imports and clean install in disposable PostgreSQL.\n'
