-- Keep one top-level statement so a later command cannot mask the audit exception
-- during Prisma deploy. PostgreSQL rolls back all work in this statement on error.
DO $migration$
DECLARE conflicts jsonb;
BEGIN
-- The volatile DO block takes a fresh snapshot for the audit query after getting
-- the locks in READ COMMITTED. Do not audit with a stale transaction snapshot.
IF current_setting('transaction_isolation') <> 'read committed' THEN
  RAISE EXCEPTION 'Recipe reference ownership migration requires READ COMMITTED';
END IF;
LOCK TABLE "NutritionPlan", "PlanMeal", "PlanMealItem", "PlanTemplate", "TemplateMeal", "TemplateMealItem", "Recipe"
  IN SHARE ROW EXCLUSIVE MODE;

CREATE SCHEMA recipe_reference_guard;
CREATE VIEW recipe_reference_guard.conflicts AS
  SELECT 'NutritionPlan'::text AS resource, p.id AS resource_id, m.id AS meal_id,
         i.id AS item_id, r.id AS recipe_id, p."tenantId" AS resource_tenant, r."tenantId" AS recipe_tenant
  FROM "PlanMealItem" i JOIN "PlanMeal" m ON m.id = i."mealId"
  JOIN "NutritionPlan" p ON p.id = m."planId" JOIN "Recipe" r ON r.id = i."recipeId"
  WHERE p."tenantId" <> r."tenantId"
  UNION ALL
  SELECT 'PlanTemplate', t.id, m.id, i.id, r.id, t."tenantId", r."tenantId"
  FROM "TemplateMealItem" i JOIN "TemplateMeal" m ON m.id = i."mealId"
  JOIN "PlanTemplate" t ON t.id = m."templateId" JOIN "Recipe" r ON r.id = i."recipeId"
  WHERE t."tenantId" <> r."tenantId";

  SELECT jsonb_agg(jsonb_build_array(resource, resource_id, item_id, recipe_id, resource_tenant, recipe_tenant)
                   ORDER BY resource COLLATE "C", resource_id COLLATE "C", item_id COLLATE "C", recipe_id COLLATE "C")
    INTO conflicts FROM recipe_reference_guard.conflicts;
  IF conflicts IS NOT NULL THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Historical cross-tenant recipe references',
      CONSTRAINT = 'recipe_reference_ownership', DETAIL = conflicts::text;
  END IF;

-- A lock alone would not refresh a Repeatable Read snapshot. Updating one shared row
-- forces stale writers to fail with 40001; Read Committed gets a fresh snapshot for the check.
CREATE TABLE recipe_reference_guard.fence (
  singleton boolean PRIMARY KEY CHECK (singleton), version_bit boolean NOT NULL
);
INSERT INTO recipe_reference_guard.fence VALUES (true, false);

CREATE FUNCTION recipe_reference_guard.check_edge() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE conflict boolean;
BEGIN
  UPDATE recipe_reference_guard.fence SET version_bit = NOT version_bit WHERE singleton;
  IF NOT FOUND THEN RAISE EXCEPTION 'Missing recipe reference ownership fence'; END IF;
  CASE TG_ARGV[0]
    WHEN 'item' THEN
      SELECT EXISTS (SELECT FROM recipe_reference_guard.conflicts
        WHERE resource = TG_ARGV[1] AND item_id = NEW.id) INTO conflict;
    WHEN 'meal' THEN
      SELECT EXISTS (SELECT FROM recipe_reference_guard.conflicts
        WHERE resource = TG_ARGV[1] AND meal_id = NEW.id) INTO conflict;
    WHEN 'resource' THEN
      SELECT EXISTS (SELECT FROM recipe_reference_guard.conflicts
        WHERE resource = TG_ARGV[1] AND resource_id = NEW.id) INTO conflict;
    WHEN 'recipe' THEN
      SELECT EXISTS (SELECT FROM recipe_reference_guard.conflicts WHERE recipe_id = NEW.id) INTO conflict;
  END CASE;
  IF conflict THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Cross-tenant recipe reference',
      CONSTRAINT = 'recipe_reference_ownership';
  END IF;
  RETURN NULL;
END $$;

CREATE TRIGGER recipe_reference_ownership AFTER INSERT ON "PlanMealItem"
  FOR EACH ROW WHEN (NEW."recipeId" IS NOT NULL)
  EXECUTE FUNCTION recipe_reference_guard.check_edge('item', 'NutritionPlan');
CREATE TRIGGER recipe_reference_ownership_update AFTER UPDATE ON "PlanMealItem"
  FOR EACH ROW WHEN (NEW."recipeId" IS NOT NULL AND
    (NEW."recipeId" IS DISTINCT FROM OLD."recipeId" OR NEW."mealId" IS DISTINCT FROM OLD."mealId"))
  EXECUTE FUNCTION recipe_reference_guard.check_edge('item', 'NutritionPlan');
CREATE TRIGGER recipe_reference_ownership AFTER INSERT ON "TemplateMealItem"
  FOR EACH ROW WHEN (NEW."recipeId" IS NOT NULL)
  EXECUTE FUNCTION recipe_reference_guard.check_edge('item', 'PlanTemplate');
CREATE TRIGGER recipe_reference_ownership_update AFTER UPDATE ON "TemplateMealItem"
  FOR EACH ROW WHEN (NEW."recipeId" IS NOT NULL AND
    (NEW."recipeId" IS DISTINCT FROM OLD."recipeId" OR NEW."mealId" IS DISTINCT FROM OLD."mealId"))
  EXECUTE FUNCTION recipe_reference_guard.check_edge('item', 'PlanTemplate');
CREATE TRIGGER recipe_reference_ownership AFTER UPDATE ON "PlanMeal"
  FOR EACH ROW WHEN (NEW."planId" IS DISTINCT FROM OLD."planId")
  EXECUTE FUNCTION recipe_reference_guard.check_edge('meal', 'NutritionPlan');
CREATE TRIGGER recipe_reference_ownership AFTER UPDATE ON "TemplateMeal"
  FOR EACH ROW WHEN (NEW."templateId" IS DISTINCT FROM OLD."templateId")
  EXECUTE FUNCTION recipe_reference_guard.check_edge('meal', 'PlanTemplate');
CREATE TRIGGER recipe_reference_ownership AFTER UPDATE ON "NutritionPlan"
  FOR EACH ROW WHEN (NEW."tenantId" IS DISTINCT FROM OLD."tenantId")
  EXECUTE FUNCTION recipe_reference_guard.check_edge('resource', 'NutritionPlan');
CREATE TRIGGER recipe_reference_ownership AFTER UPDATE ON "PlanTemplate"
  FOR EACH ROW WHEN (NEW."tenantId" IS DISTINCT FROM OLD."tenantId")
  EXECUTE FUNCTION recipe_reference_guard.check_edge('resource', 'PlanTemplate');
CREATE TRIGGER recipe_reference_ownership AFTER UPDATE ON "Recipe"
  FOR EACH ROW WHEN (NEW."tenantId" IS DISTINCT FROM OLD."tenantId")
  EXECUTE FUNCTION recipe_reference_guard.check_edge('recipe');
REVOKE EXECUTE ON FUNCTION recipe_reference_guard.check_edge() FROM PUBLIC;
END $migration$;
