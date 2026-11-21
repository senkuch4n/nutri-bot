#!/usr/bin/env bash
# Standalone probe: no mounts, ports, host scratch, or project database.
set -euo pipefail
export LC_ALL=C
unset DOCKER_CONTEXT
export DOCKER_HOST=unix:///Users/leonel/.docker/run/docker.sock
cd "$(dirname "$0")/../prisma/migrations"
name="hu024-food-$(uuidgen | tr '[:upper:]' '[:lower:]')"
container= network=
trap 'if [[ -n "$container" ]]; then docker stop -t 1 "$container" >/dev/null; fi; if [[ -n "$network" ]]; then docker network rm "$network" >/dev/null; fi' EXIT
network=$(docker network create --internal --label "hu024.food=$name" "$name")
container=$(docker run --pull never --rm -d --name "$name" --network "$network" --label "hu024.food=$name" \
  --tmpfs /var/lib/postgresql/data:rw -e POSTGRES_HOST_AUTH_METHOD=trust postgres:16-alpine -c listen_addresses='')
for attempt in {1..60}; do
  [[ "$(docker exec "$container" ps -o pid,comm | grep -c '^ *1 postgres' || true)" = 1 ]] &&
    docker exec "$container" pg_isready -U postgres >/dev/null 2>&1 && break
  [[ "$attempt" != 60 ]] || exit 2
  sleep .2
done
sql() { docker exec -i "$container" psql -XqAt -v ON_ERROR_STOP=1 -U postgres -d "$1"; }
base=20261120121216_legacy_identity_binding
for file in */migration.sql; do
  key=${file%/*}
  [[ "$key" > "$base" ]] || sql postgres < "$file"
done
candidate() {
  local file=20261120121400_food_reference_ownership/migration.sql
  # Before the migration exists, run the assertions against the unchanged ancestor.
  [[ ! -f "$file" ]] || sql postgres < "$file"
}

sql postgres <<'SQL'
INSERT INTO "Tenant" (id) VALUES ('b');
INSERT INTO "Patient" (id,"whatsappJid",phone,"tenantId","updatedAt") VALUES ('a','a','a','legacy-tenant',now()), ('b','b','b','b',now());
INSERT INTO "NutritionPlan" (id,"patientId","tenantId",title,"updatedAt") VALUES ('pa','a','legacy-tenant','fixture',now()), ('pb','b','b','fixture',now()), ('pn','b',NULL,'fixture',now());
INSERT INTO "PlanTemplate" (id,"tenantId",title,"updatedAt") VALUES ('ta','legacy-tenant','fixture',now()), ('tb','b','b',now()), ('tn',NULL,'fixture',now());
INSERT INTO "Recipe" (id,"tenantId",name,"updatedAt") VALUES ('ra','legacy-tenant','fixture',now()), ('rb','b','b',now()), ('rn',NULL,'fixture',now());
INSERT INTO "PlanMeal" (id,"planId",name,"order") VALUES ('a','pa','fixture',0), ('b','pb','fixture',0), ('n','pn','fixture',0);
INSERT INTO "TemplateMeal" (id,"templateId",name,"order") VALUES ('a','ta','fixture',0), ('b','tb','fixture',0), ('n','tn','fixture',0);
INSERT INTO "Food" (id,name,"group",source,"sourceKey","tenantId",active,"catalogActive","kcalPer100","proteinPer100","carbsPer100","fatPer100","updatedAt")
SELECT id,id,'OTROS',source::"FoodSource",CASE WHEN source = 'SARA2' THEN 'sara2:' || id END,tenant,active,catalog,0,0,0,0,now() FROM (VALUES
  ('fa','PROPIO','legacy-tenant',false,true), ('fb','PROPIO','b',true,true), ('fn','PROPIO',NULL,true,true),
  ('assignable','PROPIO',NULL,true,true), ('race','PROPIO',NULL,true,true),
  ('hidden','SARA2',NULL,false,true), ('retired','SARA2',NULL,false,false)
) fixture(id,source,tenant,active,catalog);
INSERT INTO "FoodVisibilityPreference" ("tenantId","foodId",visible) VALUES ('b','hidden',false);
INSERT INTO "PlanMealItem" (id,"mealId","foodId","order") VALUES ('pi','a','fb',0), ('unknown','n','fa',1), ('official','b','retired',2);
INSERT INTO "TemplateMealItem" (id,"mealId","foodId","order") VALUES ('ti','a','fb',0), ('unknown','n','fa',1), ('official','b','hidden',2);
INSERT INTO "RecipeIngredient" (id,"recipeId","foodId","order") VALUES ('ri','ra','fb',0), ('unknown','rn','fa',1), ('official','rb','retired',2);
SQL
# Full synthetic row and functional DDL snapshots, held in memory.
dump() { docker exec "$container" pg_dump -U postgres "$1" postgres | grep -v '^\\'; }
before=$(dump --data-only) schema_before=$(dump --schema-only)
if output=$(candidate 2>&1); then echo 'Historical known-owner food conflicts were accepted' >&2; exit 1; else code=$?; fi
expected='DETAIL:  [["NutritionPlan", "pa", "pi", "fb", "legacy-tenant", "b"], ["PlanTemplate", "ta", "ti", "fb", "legacy-tenant", "b"], ["Recipe", "ra", "ri", "fb", "legacy-tenant", "b"]]'
[[ "$code" = 3 && "$(printf '%s\n' "$output" | grep -E '^(ERROR|DETAIL):')" = $'ERROR:  Historical cross-tenant food references\n'"$expected" ]] || {
  printf '%s\n' "$output" >&2; exit 1;
}
[[ "$(dump --data-only)" = "$before" && "$(dump --schema-only)" = "$schema_before" ]]
printf 'Historical conflict: psql exit %s; rows and DDL unchanged.\n%s\n' "$code" "$expected"

# Deliberate fixture-only repair. Exclude only the new guard schema from row comparisons.
sql postgres <<'SQL'
UPDATE "PlanMealItem" SET "foodId" = 'fa' WHERE id = 'pi';
UPDATE "TemplateMealItem" SET "foodId" = 'fa' WHERE id = 'ti';
UPDATE "RecipeIngredient" SET "foodId" = 'fa' WHERE id = 'ri';
SQL
rows() { docker exec "$container" pg_dump -U postgres --data-only --schema=public postgres | grep -v '^\\'; }
before=$(rows)
candidate
[[ "$(rows)" = "$before" ]]
sql postgres <<'SQL'
INSERT INTO "PlanMealItem" (id,"mealId","foodId","order") VALUES ('own-b','b','fb',0), ('legacy','b','fn',1);
INSERT INTO "TemplateMealItem" (id,"mealId","foodId","order") VALUES ('own-b','b','fb',0);
INSERT INTO "PlanMealItem" (id,"mealId","foodId","order") VALUES ('shared','b','hidden',3);
INSERT INTO "TemplateMealItem" (id,"mealId","foodId","order") VALUES ('shared','b','retired',3);
INSERT INTO "RecipeIngredient" (id,"recipeId","foodId","order") VALUES ('shared','ra','hidden',3);
INSERT INTO "RecipeIngredient" (id,"recipeId","foodId","order") VALUES ('own-b','rb','fb',0), ('legacy','rb','fn',1), ('assignable','ra','assignable',1);
UPDATE "Food" SET "tenantId" = 'legacy-tenant' WHERE id = 'assignable';
UPDATE "Food" SET id = 'new-official' WHERE id = 'retired';
DO $$ BEGIN
  IF (SELECT "foodId" FROM "PlanMealItem" WHERE id = 'official') IS DISTINCT FROM 'new-official' OR
     (SELECT "foodId" FROM "RecipeIngredient" WHERE id = 'official') IS DISTINCT FROM 'new-official' THEN
    RAISE EXCEPTION 'Missing Food ID cascade';
  END IF;
END $$;
DELETE FROM "Food" WHERE id IN ('new-official','hidden');
DO $$ BEGIN
  IF (SELECT count(*) FROM (
      SELECT id, "foodId" FROM "PlanMealItem" UNION ALL SELECT id, "foodId" FROM "TemplateMealItem"
      UNION ALL SELECT id, "foodId" FROM "RecipeIngredient") items WHERE id = 'official' AND "foodId" IS NULL) <> 3 THEN
    RAISE EXCEPTION 'Missing Food ON DELETE SET NULL';
  END IF;
END $$;
SQL
before=$(dump --data-only)
sql postgres <<'SQL'
DO $$ DECLARE test record; message text; constraint_name text; details text; expected jsonb;
BEGIN
  FOR test IN SELECT * FROM (VALUES
    ($q$INSERT INTO "PlanMealItem" (id,"mealId","foodId","order") VALUES ('cross','b','fa',0)$q$, 'NutritionPlan','pb','cross','fa','b','legacy-tenant'),
    ($q$INSERT INTO "TemplateMealItem" (id,"mealId","foodId","order") VALUES ('cross','b','fa',0)$q$, 'PlanTemplate','tb','cross','fa','b','legacy-tenant'),
    ($q$INSERT INTO "RecipeIngredient" (id,"recipeId","foodId","order") VALUES ('cross','rb','fa',0)$q$, 'Recipe','rb','cross','fa','b','legacy-tenant'),
    ($q$UPDATE "PlanMealItem" SET "foodId" = 'fb' WHERE id = 'pi'$q$, 'NutritionPlan','pa','pi','fb','legacy-tenant','b'),
    ($q$UPDATE "TemplateMealItem" SET "foodId" = 'fb' WHERE id = 'ti'$q$, 'PlanTemplate','ta','ti','fb','legacy-tenant','b'),
    ($q$UPDATE "RecipeIngredient" SET "foodId" = 'fb' WHERE id = 'ri'$q$, 'Recipe','ra','ri','fb','legacy-tenant','b'),
    ($q$UPDATE "PlanMealItem" SET "mealId" = 'b' WHERE id = 'pi'$q$, 'NutritionPlan','pb','pi','fa','b','legacy-tenant'),
    ($q$UPDATE "TemplateMealItem" SET "mealId" = 'b' WHERE id = 'ti'$q$, 'PlanTemplate','tb','ti','fa','b','legacy-tenant'),
    ($q$UPDATE "RecipeIngredient" SET "recipeId" = 'rb' WHERE id = 'ri'$q$, 'Recipe','rb','ri','fa','b','legacy-tenant'),
    ($q$UPDATE "PlanMeal" SET "planId" = 'pb' WHERE id = 'a'$q$, 'NutritionPlan','pb','pi','fa','b','legacy-tenant'),
    ($q$UPDATE "TemplateMeal" SET "templateId" = 'tb' WHERE id = 'a'$q$, 'PlanTemplate','tb','ti','fa','b','legacy-tenant'),
    ($q$UPDATE "NutritionPlan" SET "tenantId" = 'b' WHERE id = 'pn'$q$, 'NutritionPlan','pn','unknown','fa','b','legacy-tenant'),
    ($q$UPDATE "PlanTemplate" SET "tenantId" = 'b' WHERE id = 'tn'$q$, 'PlanTemplate','tn','unknown','fa','b','legacy-tenant'),
    ($q$UPDATE "Recipe" SET "tenantId" = 'b' WHERE id = 'rn'$q$, 'Recipe','rn','unknown','fa','b','legacy-tenant'),
    ($q$UPDATE "Food" SET "tenantId" = 'legacy-tenant' WHERE id = 'fn'$q$, 'NutritionPlan','pb','legacy','fn','b','legacy-tenant')
  ) AS cases(stmt, resource, resource_id, item, food, owner, food_owner) LOOP
    BEGIN
      EXECUTE test.stmt;
      RAISE EXCEPTION 'Expected rejection: %', test.stmt;
    EXCEPTION WHEN check_violation THEN
      GET STACKED DIAGNOSTICS message = MESSAGE_TEXT, constraint_name = CONSTRAINT_NAME, details = PG_EXCEPTION_DETAIL;
      expected := jsonb_build_array(jsonb_build_array(test.resource,test.resource_id,test.item,test.food,test.owner,test.food_owner));
      IF test.food = 'fn' THEN
        expected := expected || '[["Recipe", "rb", "legacy", "fn", "b", "legacy-tenant"]]'::jsonb;
      END IF;
      IF message <> 'Cross-tenant food reference' OR constraint_name <> 'food_reference_ownership' OR
         details::jsonb IS DISTINCT FROM expected THEN
        RAISE EXCEPTION 'Wrong diagnostic for %: % % %', test.stmt, message, constraint_name, details;
      END IF;
    END;
  END LOOP;
  BEGIN
    UPDATE "Food" SET "tenantId" = 'b' WHERE id = 'fa';
    RAISE EXCEPTION 'Expected catalog immutability';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM <> 'Food_scope_immutable_check' THEN RAISE; END IF;
  END;
END $$;
SQL
[[ "$(dump --data-only)" = "$before" ]]
echo '15 ownership rejections with exact diagnostics; catalog immutability and rollback preserved.'

# psql starts a second, synchronous local session after the first fixes its RR snapshot.
sql postgres <<'SQL'
BEGIN ISOLATION LEVEL REPEATABLE READ;
DO $$ BEGIN
  IF EXISTS (SELECT FROM "PlanMealItem" WHERE id = 'race') THEN RAISE EXCEPTION 'Race fixture already exists'; END IF;
END $$;
\! psql -XqAt -v ON_ERROR_STOP=1 -U postgres -d postgres -c 'INSERT INTO "PlanMealItem" (id,"mealId","foodId","order") VALUES ($$race$$,$$b$$,$$race$$,0)'
DO $$ BEGIN
  BEGIN
    UPDATE "Food" SET "tenantId" = 'legacy-tenant' WHERE id = 'race';
    RAISE EXCEPTION 'Stale snapshot bypass';
  EXCEPTION WHEN serialization_failure THEN NULL;
  END;
END $$;
ROLLBACK;
DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM "PlanMealItem" i JOIN "Food" f ON f.id = i."foodId" WHERE i.id = 'race' AND f."tenantId" IS NULL) THEN
    RAISE EXCEPTION 'Race winner reference or legacy owner not preserved';
  END IF;
END $$;
SQL
echo 'Stale Repeatable Read writer rejected with 40001; committed reference preserved.'
