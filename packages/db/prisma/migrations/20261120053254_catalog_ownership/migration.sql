BEGIN;

ALTER TABLE "Food" ADD COLUMN "catalogActive" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "tenantId" TEXT;
ALTER TABLE "FoodMeasure" ADD COLUMN "tenantId" TEXT NOT NULL DEFAULT 'legacy-tenant';
CREATE TABLE "FoodVisibilityPreference" (
  "tenantId" TEXT NOT NULL,
  "foodId" TEXT NOT NULL,
  "visible" BOOLEAN NOT NULL,
  CONSTRAINT "FoodVisibilityPreference_pkey" PRIMARY KEY ("tenantId", "foodId")
);

UPDATE "Food" SET "tenantId" = 'legacy-tenant' WHERE "source" = 'PROPIO';
-- Legacy active mixed hidden and retired. Preserve it verbatim; let the next
-- authoritative import reconcile catalogActive without rewriting preferences.
INSERT INTO "FoodVisibilityPreference" ("tenantId", "foodId", "visible")
SELECT 'legacy-tenant', "id", false FROM "Food" WHERE "source" = 'SARA2' AND NOT "active";

CREATE INDEX "FoodVisibilityPreference_foodId_idx" ON "FoodVisibilityPreference" ("foodId");
CREATE INDEX "Food_tenantId_idx" ON "Food" ("tenantId");
CREATE UNIQUE INDEX "FoodMeasure_tenantId_foodId_nameKey_key" ON "FoodMeasure" ("tenantId", "foodId", "nameKey");
-- Replace only the former global name uniqueness, after the scoped index exists.
DROP INDEX "FoodMeasure_foodId_nameKey_key";

ALTER TABLE "Food" ADD CONSTRAINT "Food_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT "Food_official_tenant_check" CHECK ("source" <> 'SARA2' OR "tenantId" IS NULL);
ALTER TABLE "FoodVisibilityPreference" ADD CONSTRAINT "FoodVisibilityPreference_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT "FoodVisibilityPreference_foodId_fkey" FOREIGN KEY ("foodId") REFERENCES "Food"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FoodMeasure" ADD CONSTRAINT "FoodMeasure_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- Match scope at the write boundary; the ordinary FKs cover missing rows and cascades.
CREATE FUNCTION check_food_personalization_scope() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  food_source "FoodSource";
  food_tenant text;
BEGIN
  SELECT "source", "tenantId" INTO food_source, food_tenant
    FROM "Food" WHERE "id" = NEW."foodId" FOR KEY SHARE;
  IF NOT FOUND THEN
    RAISE foreign_key_violation USING MESSAGE = 'Food not found', CONSTRAINT = TG_TABLE_NAME || '_foodId_fkey';
  END IF;
  IF TG_TABLE_NAME = 'FoodVisibilityPreference' AND food_source = 'PROPIO' THEN
    RAISE check_violation USING MESSAGE = 'FoodVisibilityPreference_official_check';
  ELSIF TG_TABLE_NAME = 'FoodMeasure' AND food_source = 'PROPIO'
    AND NEW."tenantId" <> coalesce(food_tenant, 'legacy-tenant') THEN
    RAISE check_violation USING MESSAGE = 'FoodMeasure_food_scope_check';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "FoodVisibilityPreference_check_scope" BEFORE INSERT OR UPDATE OF "foodId", "tenantId"
  ON "FoodVisibilityPreference" FOR EACH ROW EXECUTE FUNCTION check_food_personalization_scope();
CREATE TRIGGER "FoodMeasure_check_scope" BEFORE INSERT OR UPDATE OF "foodId", "tenantId"
  ON "FoodMeasure" FOR EACH ROW EXECUTE FUNCTION check_food_personalization_scope();

-- Scope cannot change under dependent rows, including concurrent inserts. The
-- only exception makes implicit legacy scope explicit without changing it.
CREATE FUNCTION preserve_food_scope() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."source" IS DISTINCT FROM OLD."source" OR (
    NEW."tenantId" IS DISTINCT FROM OLD."tenantId" AND NOT (
      OLD."source" = 'PROPIO' AND OLD."tenantId" IS NULL AND NEW."tenantId" = 'legacy-tenant'
    )
  ) THEN
    RAISE check_violation USING MESSAGE = 'Food_scope_immutable_check';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "Food_preserve_scope" BEFORE UPDATE OF "source", "tenantId"
  ON "Food" FOR EACH ROW EXECUTE FUNCTION preserve_food_scope();

-- Parameterized view for future scoped consumers; not an authorization check.
CREATE FUNCTION tenant_visible_foods(scope_id text) RETURNS TABLE ("foodId" text) LANGUAGE sql STABLE AS $$
  SELECT food."id"
  FROM "Tenant" tenant
  CROSS JOIN "Food" food
  LEFT JOIN "FoodVisibilityPreference" pref ON pref."foodId" = food."id" AND pref."tenantId" = tenant."id"
  WHERE tenant."id" = scope_id AND (
    (food."source" = 'SARA2' AND food."catalogActive" AND coalesce(pref."visible", true))
    OR (food."source" = 'PROPIO' AND food."tenantId" = tenant."id" AND food."active")
  );
$$;

COMMIT;
