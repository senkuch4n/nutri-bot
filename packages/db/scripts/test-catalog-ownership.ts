import assert from "node:assert/strict";
import type { Sara2Dataset } from "@nutri-bot/core/sara2";
import { loadSara2Dataset, Sara2LoadAbortedError } from "../domain/foodImport";
import type { PrismaClient } from "../index";

async function main(db: PrismaClient) {
  const legacy = "legacy-tenant", next = "new-tenant";
  const ids = async (tenant: string) => (await db.$queryRaw<{ foodId: string }[]>`
    SELECT "foodId" FROM tenant_visible_foods(${tenant}) ORDER BY "foodId"
  `).map((row) => row.foodId);
  assert.deepEqual(await ids(legacy), ["own", "retired"]);
  assert.deepEqual(await ids(next), ["retired", "shared"]);
  assert.deepEqual(await ids("nonexistent"), []);
  assert.deepEqual(await db.foodVisibilityPreference.findMany(), [{ tenantId: legacy, foodId: "shared", visible: false }]);
  const measure = { foodId: "shared", name: "Taza", nameKey: "taza", order: 0 };
  assert.deepEqual(await db.foodMeasure.findMany({ select: { tenantId: true } }), [{ tenantId: legacy }, { tenantId: legacy }]);
  await db.foodMeasure.create({ data: { ...measure, tenantId: next, grams: 180 } });
  for (const [tenantId, grams] of [[legacy, 100], [next, 180]] as const) {
    const row = await db.foodMeasure.findUniqueOrThrow({ where: { tenantId_foodId_nameKey: { tenantId, foodId: "shared", nameKey: "taza" } } });
    assert.equal(Number(row.grams), grams);
  }
  const own = { name: "New private", group: "OTROS", kcalPer100: 4, proteinPer100: 1, carbsPer100: 0, fatPer100: 0 } as const;
  await db.food.create({ data: { ...own, id: "new-own", tenantId: next } });
  await db.food.create({ data: { ...own, id: "legacy-unowned" } });
  await db.foodMeasure.create({ data: { ...measure, foodId: "legacy-unowned", grams: 10 } });
  await db.food.update({ where: { id: "legacy-unowned" }, data: { tenantId: legacy } });
  await db.foodVisibilityPreference.createMany({ data: [
    { tenantId: next, foodId: "shared", visible: true },
    { tenantId: next, foodId: "retired", visible: true },
  ] });
  assert.deepEqual(await ids(next), ["new-own", "retired", "shared"]);
  assert.deepEqual(await ids(legacy), ["legacy-unowned", "own", "retired"]);
  const customizations = async () => ({
    own: await db.food.findMany({ where: { source: "PROPIO" }, orderBy: { id: "asc" } }),
    measures: await db.foodMeasure.findMany({ orderBy: { id: "asc" } }),
    preferences: await db.foodVisibilityPreference.findMany({ orderBy: [{ tenantId: "asc" }, { foodId: "asc" }] }),
  });
  const before = await customizations();
  const allFoods = await db.food.findMany({ orderBy: { id: "asc" } });
  await assert.rejects(db.foodMeasure.create({ data: { ...measure, tenantId: next, grams: 12 } }), { code: "P2002" });
  await assert.rejects(db.foodMeasure.create({ data: { ...measure, tenantId: next, foodId: "own", grams: 1 } }), /FoodMeasure_food_scope_check/);
  await assert.rejects(db.foodMeasure.update({ where: { id: "legacy-cup" }, data: { foodId: "new-own" } }), /FoodMeasure_food_scope_check/);
  await assert.rejects(db.foodVisibilityPreference.create({ data: { tenantId: next, foodId: "own", visible: false } }), /FoodVisibilityPreference_official_check/);
  await assert.rejects(db.foodVisibilityPreference.create({ data: { tenantId: next, foodId: "missing", visible: false } }), { code: "P2003" });
  await assert.rejects(db.food.update({ where: { id: "own" }, data: { tenantId: next } }), /Food_scope_immutable_check/);
  await assert.rejects(db.food.update({ where: { id: "shared" }, data: { source: "PROPIO", sourceKey: null } }), /Food_scope_immutable_check/);
  await assert.rejects(db.food.create({ data: { ...own, source: "SARA2", sourceKey: "sara2:bad", tenantId: next } }), /Food_official_tenant_check/);
  assert.deepEqual(await customizations(), before);
  assert.deepEqual(await db.food.findMany({ orderBy: { id: "asc" } }), allFoods);
  console.log("Two-tenant visibility, independent measures and rejected writes passed.");

  const shared = { sourceKey: "sara2:shared", name: "Shared updated", group: "FRUTAS", kcalPer100: 80,
    proteinPer100: 4, carbsPer100: 7, fatPer100: 4, fiberPer100: 0.5, alcoholPer100: null,
    sodiumMgPer100: null, addedSugarPer100: null, saturatedFatPer100: null, cholesterolMgPer100: null,
    nutrients: { kcalPublicada: 81 } } as Sara2Dataset["foods"][number];
  const dataset = { foods: [shared] } as Sara2Dataset;
  await assert.rejects(db.$transaction((tx) => loadSara2Dataset(tx, dataset)), Sara2LoadAbortedError);
  assert.deepEqual(await db.food.findMany({ orderBy: { id: "asc" } }), allFoods);
  assert.deepEqual(await db.$transaction((tx) => loadSara2Dataset(tx, dataset, { allowMassDeactivation: true })),
    { total: 1, created: 0, updated: 1, unchanged: 0, deactivated: 1 });
  const updated = await db.food.findUniqueOrThrow({ where: { sourceKey: shared.sourceKey } });
  assert.deepEqual([updated.id, updated.active, updated.catalogActive, Number(updated.kcalPer100), Number(updated.fiberPer100), updated.nutrients],
    ["shared", false, true, 80, 0.5, { kcalPublicada: 81 }]);
  const retired = await db.food.findUniqueOrThrow({ where: { id: "retired" } });
  assert.deepEqual([retired.active, retired.catalogActive], [false, false]);
  assert.deepEqual(await ids(next), ["new-own", "shared"]);
  assert.deepEqual(await ids(legacy), ["legacy-unowned", "own"]);
  const returned = { ...shared, name: "Retired", sourceKey: "sara2:retired" };
  await db.$transaction((tx) => loadSara2Dataset(tx, { ...dataset, foods: [shared, returned] }));
  const reloaded = await db.food.findUniqueOrThrow({ where: { id: "retired" } });
  assert.deepEqual([reloaded.active, reloaded.catalogActive], [false, true]);
  assert.deepEqual(await customizations(), before);
  assert.deepEqual(await ids(next), ["new-own", "retired", "shared"]);
  // Even a legacy-hidden food counts toward the shared catalog removal limit.
  const beforeRemoval = await db.food.findMany({ orderBy: { id: "asc" } });
  await assert.rejects(db.$transaction((tx) => loadSara2Dataset(tx, { ...dataset, foods: [returned] })), Sara2LoadAbortedError);
  assert.deepEqual(await db.food.findMany({ orderBy: { id: "asc" } }), beforeRemoval);
  assert.deepEqual(await customizations(), before);
  // With explicit opt-in, removing a legacy-hidden food does not change legacy counters.
  assert.deepEqual(await db.$transaction((tx) => loadSara2Dataset(tx, { ...dataset, foods: [returned] }, { allowMassDeactivation: true })),
    { total: 1, created: 0, updated: 0, unchanged: 1, deactivated: 0 });
  assert.deepEqual(await ids(next), ["new-own", "retired"]);
  assert.deepEqual(await customizations(), before);
  assert.equal((await db.recipeIngredient.findUniqueOrThrow({ where: { id: "ingredient" } })).foodId, "own");
  assert.equal((await db.planMealItem.findUniqueOrThrow({ where: { id: "item" } })).foodId, "shared");
  console.log("Real SARA2 loader preserved IDs and private data; legacy and canonical availability passed.");
}

void (async () => {
  const { PrismaClient: ScratchClient } = await import(process.argv[2] + "/index.js");
  const db = new ScratchClient() as PrismaClient;
  try { await main(db); } finally { await db.$disconnect(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
