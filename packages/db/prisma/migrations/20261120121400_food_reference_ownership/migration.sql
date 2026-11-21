-- One top-level statement: preserve the actual audit error in a failed deploy,
-- and roll back the guard DDL with it. No clinical or catalog row is rewritten.
DO $migration$
DECLARE conflicts jsonb;
BEGIN
  IF current_setting('transaction_isolation') <> 'read committed' THEN
    RAISE EXCEPTION 'Food reference ownership migration requires READ COMMITTED';
  END IF;
  -- The audit gets a fresh READ COMMITTED snapshot after excluding writers.
  LOCK TABLE "NutritionPlan", "PlanMeal", "PlanMealItem", "PlanTemplate", "TemplateMeal",
    "TemplateMealItem", "Recipe", "RecipeIngredient", "Food" IN SHARE ROW EXCLUSIVE MODE;

  CREATE SCHEMA food_reference_guard;
  CREATE VIEW food_reference_guard.conflicts AS
    SELECT 'NutritionPlan'::text AS resource, p.id AS resource_id, m.id AS meal_id,
           i.id AS item_id, f.id AS food_id, p."tenantId" AS resource_tenant, f."tenantId" AS food_tenant
    FROM "PlanMealItem" i JOIN "PlanMeal" m ON m.id = i."mealId"
    JOIN "NutritionPlan" p ON p.id = m."planId" JOIN "Food" f ON f.id = i."foodId"
    WHERE f.source = 'PROPIO' AND p."tenantId" <> f."tenantId"
    UNION ALL
    SELECT 'PlanTemplate', t.id, m.id, i.id, f.id, t."tenantId", f."tenantId"
    FROM "TemplateMealItem" i JOIN "TemplateMeal" m ON m.id = i."mealId"
    JOIN "PlanTemplate" t ON t.id = m."templateId" JOIN "Food" f ON f.id = i."foodId"
    WHERE f.source = 'PROPIO' AND t."tenantId" <> f."tenantId"
    UNION ALL
    SELECT 'Recipe', r.id, NULL::text, i.id, f.id, r."tenantId", f."tenantId"
    FROM "RecipeIngredient" i JOIN "Recipe" r ON r.id = i."recipeId"
    JOIN "Food" f ON f.id = i."foodId"
    WHERE f.source = 'PROPIO' AND r."tenantId" <> f."tenantId";

  SELECT jsonb_agg(jsonb_build_array(resource, resource_id, item_id, food_id, resource_tenant, food_tenant)
                   ORDER BY resource COLLATE "C", resource_id COLLATE "C", item_id COLLATE "C", food_id COLLATE "C")
    INTO conflicts FROM food_reference_guard.conflicts;
  IF conflicts IS NOT NULL THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Historical cross-tenant food references',
      CONSTRAINT = 'food_reference_ownership', DETAIL = conflicts::text;
  END IF;

  -- A versioned row, not just a lock: concurrent changes invalidate stale RR
  -- writers (40001). At READ COMMITTED the next query sees the committed winner.
  CREATE TABLE food_reference_guard.fence (
    singleton boolean PRIMARY KEY CHECK (singleton), version_bit boolean NOT NULL
  );
  INSERT INTO food_reference_guard.fence VALUES (true, false);

  CREATE FUNCTION food_reference_guard.check_edge() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $check$
  DECLARE conflicts jsonb;
  BEGIN
    UPDATE food_reference_guard.fence SET version_bit = NOT version_bit WHERE singleton;
    IF NOT FOUND THEN RAISE EXCEPTION 'Missing food reference ownership fence'; END IF;

    SELECT jsonb_agg(jsonb_build_array(resource, resource_id, item_id, food_id, resource_tenant, food_tenant)
                     ORDER BY resource COLLATE "C", resource_id COLLATE "C", item_id COLLATE "C", food_id COLLATE "C")
      INTO conflicts FROM (
        SELECT * FROM food_reference_guard.conflicts WHERE TG_ARGV[0] = 'food' AND food_id = NEW.id
        UNION ALL
        SELECT * FROM food_reference_guard.conflicts WHERE TG_ARGV[0] = 'item' AND resource = TG_ARGV[1] AND item_id = NEW.id
        UNION ALL
        SELECT * FROM food_reference_guard.conflicts WHERE TG_ARGV[0] = 'meal' AND resource = TG_ARGV[1] AND meal_id = NEW.id
        UNION ALL
        SELECT * FROM food_reference_guard.conflicts WHERE TG_ARGV[0] = 'resource' AND resource = TG_ARGV[1] AND resource_id = NEW.id
      ) affected;
    IF conflicts IS NOT NULL THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Cross-tenant food reference',
        CONSTRAINT = 'food_reference_ownership', DETAIL = conflicts::text;
    END IF;
    RETURN NULL;
  END $check$;

  CREATE TRIGGER food_reference_ownership AFTER INSERT ON "PlanMealItem"
    FOR EACH ROW WHEN (NEW."foodId" IS NOT NULL)
    EXECUTE FUNCTION food_reference_guard.check_edge('item', 'NutritionPlan');
  CREATE TRIGGER food_reference_ownership_update AFTER UPDATE ON "PlanMealItem"
    FOR EACH ROW WHEN (NEW."foodId" IS NOT NULL AND
      (NEW."foodId" IS DISTINCT FROM OLD."foodId" OR NEW."mealId" IS DISTINCT FROM OLD."mealId"))
    EXECUTE FUNCTION food_reference_guard.check_edge('item', 'NutritionPlan');
  CREATE TRIGGER food_reference_ownership AFTER INSERT ON "TemplateMealItem"
    FOR EACH ROW WHEN (NEW."foodId" IS NOT NULL)
    EXECUTE FUNCTION food_reference_guard.check_edge('item', 'PlanTemplate');
  CREATE TRIGGER food_reference_ownership_update AFTER UPDATE ON "TemplateMealItem"
    FOR EACH ROW WHEN (NEW."foodId" IS NOT NULL AND
      (NEW."foodId" IS DISTINCT FROM OLD."foodId" OR NEW."mealId" IS DISTINCT FROM OLD."mealId"))
    EXECUTE FUNCTION food_reference_guard.check_edge('item', 'PlanTemplate');
  CREATE TRIGGER food_reference_ownership AFTER INSERT ON "RecipeIngredient"
    FOR EACH ROW WHEN (NEW."foodId" IS NOT NULL)
    EXECUTE FUNCTION food_reference_guard.check_edge('item', 'Recipe');
  CREATE TRIGGER food_reference_ownership_update AFTER UPDATE ON "RecipeIngredient"
    FOR EACH ROW WHEN (NEW."foodId" IS NOT NULL AND
      (NEW."foodId" IS DISTINCT FROM OLD."foodId" OR NEW."recipeId" IS DISTINCT FROM OLD."recipeId"))
    EXECUTE FUNCTION food_reference_guard.check_edge('item', 'Recipe');
  CREATE TRIGGER food_reference_ownership AFTER UPDATE ON "PlanMeal"
    FOR EACH ROW WHEN (NEW."planId" IS DISTINCT FROM OLD."planId")
    EXECUTE FUNCTION food_reference_guard.check_edge('meal', 'NutritionPlan');
  CREATE TRIGGER food_reference_ownership AFTER UPDATE ON "TemplateMeal"
    FOR EACH ROW WHEN (NEW."templateId" IS DISTINCT FROM OLD."templateId")
    EXECUTE FUNCTION food_reference_guard.check_edge('meal', 'PlanTemplate');
  CREATE TRIGGER food_reference_ownership AFTER UPDATE ON "NutritionPlan"
    FOR EACH ROW WHEN (NEW."tenantId" IS DISTINCT FROM OLD."tenantId")
    EXECUTE FUNCTION food_reference_guard.check_edge('resource', 'NutritionPlan');
  CREATE TRIGGER food_reference_ownership AFTER UPDATE ON "PlanTemplate"
    FOR EACH ROW WHEN (NEW."tenantId" IS DISTINCT FROM OLD."tenantId")
    EXECUTE FUNCTION food_reference_guard.check_edge('resource', 'PlanTemplate');
  CREATE TRIGGER food_reference_ownership AFTER UPDATE ON "Recipe"
    FOR EACH ROW WHEN (NEW."tenantId" IS DISTINCT FROM OLD."tenantId")
    EXECUTE FUNCTION food_reference_guard.check_edge('resource', 'Recipe');
  CREATE TRIGGER food_reference_ownership AFTER UPDATE ON "Food"
    FOR EACH ROW WHEN (NEW."tenantId" IS DISTINCT FROM OLD."tenantId" OR NEW.source IS DISTINCT FROM OLD.source)
    EXECUTE FUNCTION food_reference_guard.check_edge('food');

  REVOKE EXECUTE ON FUNCTION food_reference_guard.check_edge() FROM PUBLIC;
END $migration$;
