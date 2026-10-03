/**
 * HU-018c (SDD 11.4): ítems de receta en el menú semanal contra la base de desarrollo, sin WhatsApp
 * (no encola nada en OutboundMessage) y sin IA.
 *
 * Crea SUS PROPIOS datos: una receta MANUAL publicada "Prueba HU-018c" (2 alimentos SARA 2 que ya
 * existen, que solo se leen), un paciente "Prueba HU-018c" con el teléfono ficticio 5490000018003,
 * un plan con las comidas por defecto (createPlan) y una plantilla (createTemplate). Al final (en
 * `finally`) borra SOLO por los ids que insertó, en este orden por el Restrict de la receta: los
 * planes (comidas e ítems en cascada), la plantilla, el paciente y la receta.
 *
 * Imprime los conteos de control antes y después; tienen que dar iguales.
 *
 * Uso: npm run test:recipe-picker --workspace packages/db
 */
import assert from "node:assert/strict";
import sharp from "sharp";
import { computeRecipeMacros, recipeItemMacros, scaleMacros, type FoodGroupKey, type Weekday } from "@nutri-bot/core";
import { prisma } from "../index";
import {
  archiveRecipe,
  createRecipe,
  getRecipePreview,
  getRecipeUsage,
  listPlanRecipePreviews,
  patientCanSeeRecipePhoto,
  setRecipePhoto,
} from "../domain/recipes";
import { createPlan, getPlan, updatePlan } from "../domain/nutritionPlans";
import { applyTemplateToPatient, createTemplate, getTemplate } from "../domain/planTemplates";
import {
  RecipeNotAvailableError,
  addRecipeItems,
  copyDay,
  removeMenuItems,
  restoreMealSnapshots,
  setRecipeItemPortions,
} from "../domain/weeklyMenu";
import { processRecipePhoto } from "../media/recipe-photo";

const TEST_JID = "5490000018003@s.whatsapp.net";
const TEST_PHONE = "5490000018003";

const created = {
  recipeId: null as string | null,
  patientId: null as string | null,
  planIds: [] as string[],
  templateId: null as string | null,
};

function step(n: number, text: string) {
  console.log(`  ✓ ${n}. ${text}`);
}

async function controlCounts() {
  const [recipes, planItems, templateItems, plans] = await Promise.all([
    prisma.recipe.count(),
    prisma.planMealItem.count(),
    prisma.templateMealItem.count(),
    prisma.nutritionPlan.count(),
  ]);
  return { recipes, planItems, templateItems, plans };
}

async function cleanup() {
  for (const id of created.planIds) await prisma.nutritionPlan.deleteMany({ where: { id } });
  if (created.templateId) await prisma.planTemplate.deleteMany({ where: { id: created.templateId } });
  if (created.patientId) await prisma.patient.deleteMany({ where: { id: created.patientId } });
  if (created.recipeId) await prisma.recipe.deleteMany({ where: { id: created.recipeId } });
}

const n = (d: { toString(): string } | null | undefined) => (d == null ? null : Number(d.toString()));

async function main() {
  const existing = await prisma.patient.findUnique({ where: { whatsappJid: TEST_JID }, select: { id: true } });
  assert.equal(existing, null, "Ya existe un paciente con el teléfono de prueba: no se toca. Revisalo a mano.");

  const foods = await prisma.food.findMany({
    where: { source: "SARA2", active: true, fatPer100: { lt: 5 } },
    orderBy: { name: "asc" },
    take: 2,
    select: { id: true },
  });
  assert.equal(foods.length, 2, "Hacen falta 2 alimentos SARA 2 en la base");

  const { id: recipeId } = await createRecipe({
    name: "Prueba HU-018c",
    type: "BREAKFAST",
    moments: ["BREAKFAST", "AFTERNOON_SNACK"],
    tags: [],
    yieldPortions: 4,
    portionHousehold: "2 panqueques",
    portionGrams: null,
    preparation: "Mezclar y cocinar.",
    tips: null,
    sourceName: "Prueba",
    published: null,
    ingredients: [
      { foodId: foods[0]!.id, label: null, grams: 200, noQuantity: false, household: "1 taza", rawText: null },
      { foodId: foods[1]!.id, label: null, grams: 120, noQuantity: false, household: null, rawText: null },
    ],
  });
  created.recipeId = recipeId;

  const patient = await prisma.patient.create({ data: { whatsappJid: TEST_JID, phone: TEST_PHONE, name: "Prueba HU-018c" } });
  created.patientId = patient.id;
  const plan = await createPlan(patient.id, { title: "Plan de prueba HU-018c" });
  created.planIds.push(plan.id);
  await updatePlan(plan.id, { status: "ACTIVE" });
  const meals = await prisma.planMeal.findMany({ where: { planId: plan.id }, orderBy: { order: "asc" } });
  const breakfast = meals.find((m) => m.name === "Desayuno")!;
  const snacks = meals.find((m) => m.name === "Colaciones")!;
  assert.equal(breakfast.mode, "PER_DAY");
  assert.ok(snacks.isOptions && snacks.mode === "EVERY_DAY");

  // 1. Agregar en lunes y miércoles.
  const added = await addRecipeItems("plan", plan.id, { mealId: breakfast.id, recipeId, weekdays: ["WED", "MON"] });
  assert.equal(added.itemIds.length, 2);
  const rows = await prisma.planMealItem.findMany({ where: { id: { in: added.itemIds } }, orderBy: { weekday: "asc" } });
  assert.deepEqual(rows.map((r) => [r.weekday, r.recipeId, n(r.portions), r.foodId, r.quantityGrams]), [
    ["MON", recipeId, 1, null, null],
    ["WED", recipeId, 1, null, null],
  ]);
  assert.equal(rows.find((r) => r.weekday === "MON")!.id, added.itemIds[0], "ids en orden de la semana");
  step(1, "addRecipeItems en Desayuno [MON, WED] → 2 ítems de receta con 1 porción");

  // 2. Porciones del lunes a 1,5; getPlan trae la receta y los macros salen de core.
  const mondayId = added.itemIds[0]!;
  await setRecipeItemPortions("plan", plan.id, mondayId, 1.5);
  const full = await getPlan(plan.id);
  const monday = full!.meals.flatMap((m) => m.items).find((i) => i.id === mondayId)!;
  assert.equal(n(monday.portions), 1.5);
  assert.ok(monday.recipe, "getPlan incluye la receta");
  assert.equal(monday.recipe.ingredients.length, 2);
  assert.equal(monday.recipe.sourceName, "Prueba");
  const perPortion = computeRecipeMacros(
    monday.recipe.ingredients.map((i) => ({
      label: i.label,
      grams: n(i.grams),
      noQuantity: i.noQuantity,
      food: i.food
        ? {
            name: i.food.name,
            group: i.food.group as FoodGroupKey,
            kcalPer100: n(i.food.kcalPer100)!,
            proteinPer100: n(i.food.proteinPer100)!,
            carbsPer100: n(i.food.carbsPer100)!,
            fatPer100: n(i.food.fatPer100)!,
            fiberPer100: n(i.food.fiberPer100) ?? 0,
          }
        : null,
    })),
    n(monday.recipe.yieldPortions),
  ).perPortion;
  assert.ok(perPortion && perPortion.kcal > 0);
  assert.deepEqual(recipeItemMacros(perPortion, 1.5), scaleMacros(perPortion, 1.5));
  await assert.rejects(setRecipeItemPortions("plan", "otro-plan", mondayId, 2), { name: "MealOwnershipError" });
  step(2, `setRecipeItemPortions a 1,5 y getPlan con la receta (${perPortion.kcal} kcal por porción)`);

  // 3. Copiar el lunes al viernes conserva la receta y sus porciones; Deshacer la saca.
  const snapshots = await copyDay("plan", plan.id, { from: "MON", to: ["FRI"] });
  const friday = await prisma.planMealItem.findMany({ where: { mealId: breakfast.id, weekday: "FRI" } });
  assert.deepEqual(friday.map((i) => [i.recipeId, n(i.portions)]), [[recipeId, 1.5]]);
  await restoreMealSnapshots("plan", plan.id, snapshots);
  assert.equal(await prisma.planMealItem.count({ where: { mealId: breakfast.id, weekday: "FRI" } }), 0);
  const restored = await prisma.planMealItem.findMany({ where: { mealId: breakfast.id }, orderBy: { weekday: "asc" } });
  assert.deepEqual(restored.map((i) => [i.weekday, i.recipeId, n(i.portions)]), [["MON", recipeId, 1.5], ["WED", recipeId, 1]]);
  step(3, "copyDay MON → FRI copia la receta con 1,5; Deshacer la saca y deja lunes y miércoles como estaban");

  // 4. Uso.
  assert.deepEqual(await getRecipeUsage(recipeId), { plans: 1, templates: 0 });
  step(4, "getRecipeUsage = 1 plan, 0 plantillas");

  // 5. Foto visible en el portal con el plan ACTIVE.
  const jpeg = await sharp({ create: { width: 800, height: 600, channels: 3, background: { r: 200, g: 160, b: 90 } } }).jpeg().toBuffer();
  const { photoId } = await setRecipePhoto(recipeId, { ...(await processRecipePhoto(jpeg)), credit: null });
  assert.equal(await patientCanSeeRecipePhoto(patient.id, photoId), true);
  step(5, "patientCanSeeRecipePhoto = true con el plan ACTIVE");

  // 6. Colaciones (EVERY_DAY, opciones).
  const snack = await addRecipeItems("plan", plan.id, { mealId: snacks.id, recipeId, weekdays: null });
  assert.equal(snack.itemIds.length, 1);
  const snackRow = await prisma.planMealItem.findUniqueOrThrow({ where: { id: snack.itemIds[0]! } });
  assert.equal(snackRow.weekday, null);
  await assert.rejects(addRecipeItems("plan", plan.id, { mealId: snacks.id, recipeId, weekdays: ["MON"] }), { name: "MealWeekdayMismatchError" });
  step(6, "addRecipeItems en Colaciones (EVERY_DAY) con null → 1 ítem sin día");

  // 7. Plantilla: agregar la receta y aplicarla al paciente.
  const template = await createTemplate({ title: "Plantilla de prueba HU-018c", notes: null });
  created.templateId = template.id;
  const tpl = await getTemplate(template.id);
  const tplBreakfast = tpl!.meals.find((m) => m.name === "Desayuno")!;
  await addRecipeItems("template", template.id, { mealId: tplBreakfast.id, recipeId, portions: 2, weekdays: ["THU"] });
  const applied = await applyTemplateToPatient(template.id, patient.id);
  assert.ok(applied);
  created.planIds.push(applied.id);
  const appliedItems = applied.meals.flatMap((m) => m.items.map((i) => ({ meal: m.name, ...i })));
  assert.deepEqual(
    appliedItems.filter((i) => i.recipeId).map((i) => [i.meal, i.weekday, i.recipeId, n(i.portions), i.recipe?.name]),
    [["Desayuno", "THU" as Weekday, recipeId, 2, "Prueba HU-018c"]],
  );
  assert.deepEqual(await getRecipeUsage(recipeId), { plans: 2, templates: 1 });
  step(7, "plantilla con la receta (2 porciones, jueves) → el plan aplicado la trae igual");

  // 8. Quitar: solo los ids del dueño. (restoreMealSnapshots recrea los ítems, así que los ids del
  //    paso 1 se vuelven a leer.)
  const breakfastIds = (await prisma.planMealItem.findMany({ where: { mealId: breakfast.id }, select: { id: true } })).map((i) => i.id);
  assert.equal(breakfastIds.length, 2);
  assert.equal(await removeMenuItems("plan", plan.id, breakfastIds), 2);
  const otherPlanItem = appliedItems.find((i) => i.recipeId)!.id;
  assert.equal(await removeMenuItems("plan", plan.id, [otherPlanItem]), 0, "un ítem de otro plan no se borra");
  assert.equal(await prisma.planMealItem.count({ where: { id: otherPlanItem } }), 1);
  step(8, "removeMenuItems borra los 2 del desayuno; con el id de otro plan, 0");

  // 9. Archivar: no se agrega más, pero el plan la sigue mostrando.
  await archiveRecipe(recipeId);
  await assert.rejects(
    addRecipeItems("plan", plan.id, { mealId: breakfast.id, recipeId, weekdays: ["TUE"] }),
    (err) => err instanceof RecipeNotAvailableError,
  );
  const after = await getPlan(plan.id);
  const stillThere = after!.meals.flatMap((m) => m.items).find((i) => i.id === snack.itemIds[0]);
  assert.equal(stillThere?.recipe?.status, "ARCHIVED");
  step(9, "archiveRecipe → addRecipeItems da RecipeNotAvailableError y el plan sigue mostrando el ítem");

  // 10. (018c-2) Detalle: una receta archivada se sigue viendo en el plan, cada plan la lista una sola
  //     vez (el aplicado la tiene en Desayuno), sin datos de importación ni bytes. Un borrador no se
  //     muestra. (Se pasa a DRAFT la receta de ESTE script, que se borra por id en el finally.)
  const preview = await getRecipePreview(recipeId);
  assert.ok(preview);
  assert.equal(preview.status, "ARCHIVED");
  assert.equal(preview.photo?.id, photoId);
  assert.equal(preview.sourceName, "Prueba");
  assert.ok(preview.ingredients.length >= 2 && preview.ingredients.every((i) => i.name.length > 0));
  assert.doesNotMatch(JSON.stringify(preview), /rawText|importHints|published/);
  assert.ok(preview.perPortion && Math.abs(preview.perPortion.kcal - perPortion.kcal) < 0.05);
  const planPreviews = await listPlanRecipePreviews(plan.id);
  assert.deepEqual(planPreviews.map((r) => r.id), [recipeId]);
  assert.deepEqual((await listPlanRecipePreviews(applied.id)).map((r) => r.id), [recipeId]);
  await prisma.recipe.update({ where: { id: recipeId }, data: { status: "DRAFT" } });
  assert.equal(await getRecipePreview(recipeId), null);
  assert.deepEqual(await listPlanRecipePreviews(plan.id), []);
  step(10, "getRecipePreview / listPlanRecipePreviews: archivada visible, sin repetir, sin importación; borrador → null");
}

const before = await controlCounts();
console.log("Conteos de control (antes):", before);
let failed = false;
try {
  await main();
  console.log("OK: flujo de ítems de receta (018c)");
} catch (err) {
  failed = true;
  console.error("FALLÓ:", err);
} finally {
  await cleanup();
  const afterCounts = await controlCounts();
  console.log("Conteos de control (después):", afterCounts);
  try {
    assert.deepEqual(afterCounts, before, "los conteos de control tienen que dar iguales");
  } catch (err) {
    failed = true;
    console.error(err);
  }
  await prisma.$disconnect();
  if (failed) process.exitCode = 1;
}
