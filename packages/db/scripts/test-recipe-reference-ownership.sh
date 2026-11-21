#!/usr/bin/env bash
# Disposable synthetic PostgreSQL only; inherits an explicitly selected DOCKER_HOST.
set -euo pipefail
export LC_ALL=C
base=20261120121216_legacy_identity_binding
psql_in() { docker exec -i "$container" psql -XqAt -v ON_ERROR_STOP=1 -U postgres -d "$@"; }
migrate() {
  local file key
  for file in */migration.sql; do
    key=${file%/*}
    if [[ "$key" < "$base" || "$key" == "$base" ]]; then psql_in "$1" < "$file"; fi
  done
}
candidate() {
  local file
  for file in *_recipe_reference_ownership/migration.sql; do
    if [[ -f "$file" ]]; then psql_in "$1" < "$file"; return; fi
  done
  return 0 # RED before the candidate exists: the historical conflict is accepted.
}
fixture() {
  psql_in "$1" <<'SQL'
INSERT INTO "Tenant" (id) VALUES ('b');
INSERT INTO "Patient" (id,"whatsappJid",phone,"tenantId","updatedAt") VALUES ('a','a','a','legacy-tenant',now()), ('b','b','b','b',now());
INSERT INTO "NutritionPlan" (id,"patientId","tenantId",title,"updatedAt") VALUES ('pa','a','legacy-tenant','fixture',now()), ('pb','b','b','fixture',now()), ('pn','b',NULL,'fixture',now());
INSERT INTO "PlanTemplate" (id,"tenantId",title,"updatedAt") VALUES ('ta','legacy-tenant','fixture',now()), ('tb','b','fixture',now()), ('tn',NULL,'fixture',now());
INSERT INTO "Recipe" (id,"tenantId",name,"updatedAt") VALUES ('ra','legacy-tenant','fixture',now()), ('rb','b','fixture',now()), ('rn',NULL,'fixture',now());
INSERT INTO "PlanMeal" (id,"planId",name,"order") VALUES ('a','pa','fixture',0), ('b','pb','fixture',0), ('n','pn','fixture',0);
INSERT INTO "TemplateMeal" (id,"templateId",name,"order") VALUES ('a','ta','fixture',0), ('b','tb','fixture',0), ('n','tn','fixture',0);
INSERT INTO "PlanMealItem" (id,"mealId","recipeId","order") VALUES ('pi','a','ra',0), ('pin','n','ra',0), ('pirn','a','rn',1);
INSERT INTO "TemplateMealItem" (id,"mealId","recipeId","order") VALUES ('ti','a','ra',0), ('tin','n','ra',0), ('tirn','a','rn',1);
SQL
}
snapshot() {
  psql_in "$1" <<'SQL'
SELECT jsonb_build_array(
  (SELECT jsonb_agg(p ORDER BY id) FROM "NutritionPlan" p), (SELECT jsonb_agg(t ORDER BY id) FROM "PlanTemplate" t),
  (SELECT jsonb_agg(m ORDER BY id) FROM "PlanMeal" m), (SELECT jsonb_agg(m ORDER BY id) FROM "TemplateMeal" m),
  (SELECT jsonb_agg(i ORDER BY id) FROM "PlanMealItem" i), (SELECT jsonb_agg(i ORDER BY id) FROM "TemplateMealItem" i),
  (SELECT jsonb_agg(r ORDER BY id) FROM "Recipe" r));
SQL
}
ddl() { docker exec "$container" pg_dump -U postgres -s "$1" | grep -v '^\\'; }
# The Prisma probe sources the same baseline and fixture helpers.
if [[ "${BASH_SOURCE[0]}" != "$0" ]]; then return; fi
cd "$(dirname "$0")/../prisma/migrations"
name="hu024-recipe-$(uuidgen | tr '[:upper:]' '[:lower:]')"
container= network=
trap 'if [[ -n "$container" ]]; then docker stop -t 1 "$container" >/dev/null; fi; if [[ -n "$network" ]]; then docker network rm "$network" >/dev/null; fi' EXIT
network=$(docker network create --internal --label "hu024.recipe=$name" "$name")
container=$(docker run --pull never --rm -d --name "$name" --network "$network" --label "hu024.recipe=$name" \
  --tmpfs /var/lib/postgresql/data:rw -e POSTGRES_HOST_AUTH_METHOD=trust postgres:16-alpine -c listen_addresses=127.0.0.1)
for attempt in {1..60}; do
  docker exec "$container" pg_isready -h 127.0.0.1 -U postgres >/dev/null 2>&1 && break
  [[ "$attempt" != 60 ]] || exit 2
  sleep .2
done
for db in upgrade fresh; do docker exec "$container" createdb -U postgres "$db"; migrate "$db"; done
fixture upgrade
psql_in upgrade <<'SQL'
UPDATE "PlanMealItem" SET "recipeId" = 'rb' WHERE id = 'pi';
UPDATE "TemplateMealItem" SET "recipeId" = 'rb' WHERE id = 'ti';
SQL
before=$(snapshot upgrade)
schema_before=$(ddl upgrade)
if output=$(candidate upgrade 2>&1); then echo 'Historical known-owner conflicts were accepted' >&2; exit 1; else code=$?; fi
[[ "$code" = 3 ]]
expected='DETAIL:  [["NutritionPlan", "pa", "pi", "rb", "legacy-tenant", "b"], ["PlanTemplate", "ta", "ti", "rb", "legacy-tenant", "b"]]'
[[ "$(printf '%s\n' "$output" | grep -E '^(ERROR|DETAIL):')" = $'ERROR:  Historical cross-tenant recipe references\n'"$expected" ]] || {
  printf '%s\n' "$output" >&2; exit 1;
}
[[ "$(snapshot upgrade)" = "$before" && "$(ddl upgrade)" = "$schema_before" ]]
printf 'Conflict rejected (psql exit %s); rows and DDL unchanged.\n%s\n' "$code" "$expected"
# Fixture-only, independently chosen repair; the migration never writes these rows.
psql_in upgrade <<'SQL'
UPDATE "PlanMealItem" SET "recipeId" = 'ra' WHERE id = 'pi';
UPDATE "TemplateMealItem" SET "recipeId" = 'ra' WHERE id = 'ti';
SQL
before=$(snapshot upgrade)
candidate upgrade
[[ "$(snapshot upgrade)" = "$before" ]]
candidate fresh
fixture fresh
for db in upgrade fresh; do
  psql_in "$db" <<'SQL'
INSERT INTO "PlanMealItem" (id,"mealId","recipeId","order") VALUES ('own-b','b','rb',0), ('uncertain','n','rb',1);
INSERT INTO "TemplateMealItem" (id,"mealId","recipeId","order") VALUES ('own-b','b','rb',0), ('uncertain','n','rb',1);
SQL
  before=$(snapshot "$db")
  psql_in "$db" <<'SQL'
DO $$ DECLARE stmt text; rule text;
BEGIN
  FOREACH stmt IN ARRAY ARRAY[
    $q$INSERT INTO "PlanMealItem" (id,"mealId","recipeId","order") VALUES ('cross','a','rb',0)$q$,
    $q$INSERT INTO "TemplateMealItem" (id,"mealId","recipeId","order") VALUES ('cross','b','ra',0)$q$,
    $q$UPDATE "PlanMealItem" SET "recipeId" = 'rb' WHERE id = 'pi'$q$,
    $q$UPDATE "TemplateMealItem" SET "recipeId" = 'rb' WHERE id = 'ti'$q$,
    $q$UPDATE "PlanMealItem" SET "mealId" = 'b' WHERE id = 'pi'$q$,
    $q$UPDATE "TemplateMealItem" SET "mealId" = 'b' WHERE id = 'ti'$q$,
    $q$UPDATE "PlanMeal" SET "planId" = 'pb' WHERE id = 'a'$q$,
    $q$UPDATE "TemplateMeal" SET "templateId" = 'tb' WHERE id = 'a'$q$,
    $q$UPDATE "NutritionPlan" SET "tenantId" = 'b' WHERE id = 'pn'$q$,
    $q$UPDATE "PlanTemplate" SET "tenantId" = 'b' WHERE id = 'tn'$q$,
    $q$UPDATE "Recipe" SET "tenantId" = 'b' WHERE id = 'rn'$q$
  ] LOOP
    BEGIN
      EXECUTE stmt;
      RAISE EXCEPTION 'Accepted: %', stmt;
    EXCEPTION WHEN check_violation THEN
      GET STACKED DIAGNOSTICS rule = CONSTRAINT_NAME;
      IF rule <> 'recipe_reference_ownership' THEN RAISE; END IF;
    END;
  END LOOP;
END $$;
SQL
  [[ "$(snapshot "$db")" = "$before" ]]
  psql_in "$db" <<'SQL'
DO $$ BEGIN
  BEGIN
    DELETE FROM "Recipe" WHERE id = 'ra';
    RAISE EXCEPTION 'Recipe deletion lost RESTRICT';
  EXCEPTION WHEN foreign_key_violation THEN NULL;
  END;
END $$;
UPDATE "Recipe" SET id = 'renamed' WHERE id = 'ra';
DELETE FROM "NutritionPlan" WHERE id = 'pa';
DELETE FROM "PlanTemplate" WHERE id = 'ta';
DO $$ BEGIN
  IF EXISTS (SELECT FROM "PlanMealItem" WHERE id = 'pi') OR EXISTS (SELECT FROM "TemplateMealItem" WHERE id = 'ti') OR
     NOT EXISTS (SELECT FROM "PlanMealItem" WHERE id = 'pin' AND "recipeId" = 'renamed') OR
     NOT EXISTS (SELECT FROM "TemplateMealItem" WHERE id = 'tin' AND "recipeId" = 'renamed') THEN
    RAISE EXCEPTION 'Legacy cascade changed';
  END IF;
END $$;
SQL
  printf '%s: own and NULL writes, 11 rejected mutations with unchanged snapshot, RESTRICT and cascades passed.\n' "$db"
done
# Establish an old snapshot, then commit a recipe edge in another session before reassignment.
psql_in fresh <<'SQL'
CREATE EXTENSION dblink;
BEGIN ISOLATION LEVEL REPEATABLE READ;
DO $$ BEGIN
  PERFORM id FROM "Recipe" WHERE id = 'rn';
  PERFORM dblink_exec('dbname=fresh', $q$INSERT INTO "PlanMealItem" (id,"mealId","recipeId","order") VALUES ('race','b','rn',0)$q$);
  BEGIN
    UPDATE "Recipe" SET "tenantId" = 'legacy-tenant' WHERE id = 'rn';
    RAISE EXCEPTION 'Stale transaction accepted a concurrent cross-tenant edge';
  EXCEPTION WHEN serialization_failure THEN NULL;
  END;
END $$;
ROLLBACK;
DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM "PlanMealItem" i JOIN "Recipe" r ON r.id = i."recipeId" WHERE i.id = 'race' AND r."tenantId" IS NULL) THEN
    RAISE EXCEPTION 'Unexpected race result';
  END IF;
END $$;
SQL
printf 'REPEATABLE READ stale-owner write rejected with SQLSTATE 40001.\n'
psql_in fresh <<'SQL'
INSERT INTO "Recipe" (id,name,"updatedAt") VALUES ('rn2','fixture',now());
BEGIN ISOLATION LEVEL READ COMMITTED;
DO $$ DECLARE rule text;
BEGIN
  PERFORM id FROM "Recipe" WHERE id = 'rn2';
  PERFORM dblink_exec('dbname=fresh', $q$INSERT INTO "TemplateMealItem" (id,"mealId","recipeId","order") VALUES ('race','b','rn2',0)$q$);
  BEGIN
    UPDATE "Recipe" SET "tenantId" = 'legacy-tenant' WHERE id = 'rn2';
    RAISE EXCEPTION 'Read Committed did not check the newly committed edge';
  EXCEPTION WHEN check_violation THEN
    GET STACKED DIAGNOSTICS rule = CONSTRAINT_NAME;
    IF rule <> 'recipe_reference_ownership' THEN RAISE; END IF;
  END;
END $$;
ROLLBACK;
SQL
printf 'READ COMMITTED owner write checked the newly committed edge (SQLSTATE 23514).\n'
