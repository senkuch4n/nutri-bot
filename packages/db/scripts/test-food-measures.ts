/**
 * HU-018d (SDD 11.4): medidas caseras contra la base de desarrollo, sin WhatsApp (no encola nada en
 * OutboundMessage) y sin IA.
 *
 * Crea SUS PROPIOS datos y no toca ningún alimento existente: dos alimentos PROPIO inactivos
 * ("Prueba HU-018d arroz", con unitHint "1 taza ≈ 180 g", y "Prueba HU-018d ilegible", con unitHint
 * "porción chica"), un paciente "Prueba HU-018d" con el teléfono ficticio 5490000018004, un plan con
 * las comidas por defecto (createPlan) y una plantilla (createTemplate). Al final (en `finally`) borra
 * SOLO por los ids que insertó: los planes (comidas e ítems en cascada), la plantilla, el paciente y
 * los dos alimentos (sus FoodMeasure en cascada).
 *
 * Imprime los conteos de control antes y después; tienen que dar iguales.
 *
 * Uso: npm run test:food-measures --workspace packages/db
 */
import assert from "node:assert/strict";
import { prisma } from "../index";
import {
  DuplicateFoodMeasureError,
  FoodMeasureNotFoundError,
  createFoodMeasure,
  deleteFoodMeasure,
  listFoodMeasures,
  moveFoodMeasure,
  resolveMeasureItem,
  updateFoodMeasure,
} from "../domain/foodMeasures";
import { addMealItem, createPlan, getPlan } from "../domain/nutritionPlans";
import { addTemplateMealItem, applyTemplateToPatient, createTemplate, getTemplate } from "../domain/planTemplates";
import { copyDay, repeatMealInAllDays, restoreMealSnapshots } from "../domain/weeklyMenu";

const TEST_JID = "5490000018004@s.whatsapp.net";
const TEST_PHONE = "5490000018004";

const created = {
  foodIds: [] as string[],
  patientId: null as string | null,
  planIds: [] as string[],
  templateId: null as string | null,
};

function step(n: number, text: string) {
  console.log(`  ✓ ${n}. ${text}`);
}

async function controlCounts() {
  const [foods, measures, planItems, templateItems, plans, patients] = await Promise.all([
    prisma.food.count(),
    prisma.foodMeasure.count(),
    prisma.planMealItem.count(),
    prisma.templateMealItem.count(),
    prisma.nutritionPlan.count(),
    prisma.patient.count(),
  ]);
  return { foods, measures, planItems, templateItems, plans, patients };
}

async function cleanup() {
  for (const id of created.planIds) await prisma.nutritionPlan.deleteMany({ where: { id } });
  if (created.templateId) await prisma.planTemplate.deleteMany({ where: { id: created.templateId } });
  if (created.patientId) await prisma.patient.deleteMany({ where: { id: created.patientId } });
  for (const id of created.foodIds) await prisma.food.deleteMany({ where: { id } });
}

const n = (d: { toString(): string } | null | undefined) => (d == null ? null : Number(d.toString()));
const measureOf = (i: { measureQty: unknown; measureName: string | null; measurePlural: string | null; measureGrams: unknown; quantityGrams: unknown }) => [
  n(i.measureQty as never),
  i.measureName,
  i.measurePlural,
  n(i.measureGrams as never),
  n(i.quantityGrams as never),
];

async function testFood(name: string, unitHint: string) {
  const food = await prisma.food.create({
    data: {
      name,
      group: "LEGUMBRES_CEREALES",
      source: "PROPIO",
      active: false,
      kcalPer100: 130,
      proteinPer100: 2.7,
      carbsPer100: 28,
      fatPer100: 0.3,
      unitHint,
    },
  });
  created.foodIds.push(food.id);
  return food;
}

async function main() {
  const existing = await prisma.patient.findUnique({ where: { whatsappJid: TEST_JID }, select: { id: true } });
  assert.equal(existing, null, "Ya existe un paciente con el teléfono de prueba: no se toca. Revisalo a mano.");

  const arroz = await testFood("Prueba HU-018d arroz", "1 taza ≈ 180 g");
  await testFood("Prueba HU-018d ilegible", "porción chica");

  const patient = await prisma.patient.create({ data: { whatsappJid: TEST_JID, phone: TEST_PHONE, name: "Prueba HU-018d" } });
  created.patientId = patient.id;
  const plan = await createPlan(patient.id, { title: "Plan de prueba HU-018d" });
  created.planIds.push(plan.id);
  const meals = await prisma.planMeal.findMany({ where: { planId: plan.id }, orderBy: { order: "asc" } });
  const lunch = meals.find((m) => m.name === "Almuerzo")!;
  assert.equal(lunch.mode, "PER_DAY");

  // 1. Alta, duplicado sin mayúsculas ni tildes, segunda medida.
  const taza = await createFoodMeasure(arroz.id, { name: "taza", plural: null, grams: 180 });
  assert.equal(taza.order, 0);
  await assert.rejects(
    createFoodMeasure(arroz.id, { name: "Tazá", plural: null, grams: 160 }),
    (err) => err instanceof DuplicateFoodMeasureError && err.existingName === "taza",
  );
  const cda = await createFoodMeasure(arroz.id, { name: "cda", plural: null, grams: 15 });
  assert.equal(cda.order, 1);
  step(1, "createFoodMeasure taza (order 0) y cda (order 1); «Tazá» → DuplicateFoodMeasureError(«taza»)");

  // 2. Reordenar.
  await moveFoodMeasure(cda.id, "up");
  assert.deepEqual((await listFoodMeasures(arroz.id)).map((m) => m.name), ["cda", "taza"]);
  await moveFoodMeasure(taza.id, "up");
  assert.deepEqual((await listFoodMeasures(arroz.id)).map((m) => m.name), ["taza", "cda"]);
  step(2, "moveFoodMeasure: cda sube y taza vuelve a subir");

  // 3. Resolver la medida para el ítem.
  const fields = await resolveMeasureItem(arroz.id, taza.id, 1.5);
  assert.deepEqual(fields, { measureQty: 1.5, measureName: "taza", measurePlural: "tazas", measureGrams: 180, quantityGrams: 270 });
  await assert.rejects(resolveMeasureItem("otro-alimento", cda.id, 1), (err) => err instanceof FoodMeasureNotFoundError);
  step(3, "resolveMeasureItem 1½ taza → 270 g, plural «tazas»; con otro alimento → not found");

  // 4. Ítem en medida casera en el Almuerzo del lunes.
  const added = await addMealItem(lunch.id, { foodId: arroz.id, order: 0, weekday: "MON", ...fields });
  const full = await getPlan(plan.id);
  const mondayItem = full!.meals.flatMap((m) => m.items).find((i) => i.id === added.id)!;
  assert.deepEqual(measureOf(mondayItem), [1.5, "taza", "tazas", 180, 270]);
  step(4, "addMealItem con medida → getPlan trae los cuatro campos y 270 g");

  // 5. Copiar el lunes al jueves conserva la medida; Deshacer la saca.
  const snapshots = await copyDay("plan", plan.id, { from: "MON", to: ["THU"] });
  const thursday = await prisma.planMealItem.findMany({ where: { mealId: lunch.id, weekday: "THU" } });
  assert.deepEqual(thursday.map(measureOf), [[1.5, "taza", "tazas", 180, 270]]);
  await restoreMealSnapshots("plan", plan.id, snapshots);
  assert.equal(await prisma.planMealItem.count({ where: { mealId: lunch.id, weekday: "THU" } }), 0);
  step(5, "copyDay MON → THU copia la medida; Deshacer la saca");

  // 6. Repetir en todos los días; Deshacer.
  const before = await repeatMealInAllDays("plan", plan.id, lunch.id, "MON");
  const all = await prisma.planMealItem.findMany({ where: { mealId: lunch.id } });
  assert.equal(all.length, 7);
  assert.ok(all.every((i) => i.measureName === "taza" && n(i.quantityGrams) === 270));
  await restoreMealSnapshots("plan", plan.id, [before]);
  const restored = await prisma.planMealItem.findMany({ where: { mealId: lunch.id } });
  assert.deepEqual(restored.map((i) => [i.weekday, ...measureOf(i)]), [["MON", 1.5, "taza", "tazas", 180, 270]]);
  step(6, "repeatMealInAllDays → 7 ítems con medida; Deshacer deja solo el lunes");
  const lunchItemId = restored[0]!.id;

  // 7. Plantilla con medida (comida EVERY_DAY) → aplicar al paciente.
  const template = await createTemplate({ title: "Plantilla de prueba HU-018d", notes: null });
  created.templateId = template.id;
  const tpl = await getTemplate(template.id);
  const tplSnacks = tpl!.meals.find((m) => m.mode === "EVERY_DAY")!;
  const cdaFields = await resolveMeasureItem(arroz.id, cda.id, 1);
  await addTemplateMealItem(tplSnacks.id, { foodId: arroz.id, order: 0, weekday: null, ...cdaFields });
  const applied = await applyTemplateToPatient(template.id, patient.id);
  assert.ok(applied);
  created.planIds.push(applied.id);
  const appliedItems = applied.meals.flatMap((m) => m.items);
  assert.deepEqual(appliedItems.filter((i) => i.measureName).map(measureOf), [[1, "cda", "cdas", 15, 15]]);
  step(7, "plantilla con «1 cda» → el plan aplicado trae la medida (1 cda · 15 g)");

  // 8. Cambiar la medida no toca el ítem (D4).
  await updateFoodMeasure(taza.id, { name: "taza", plural: null, grams: 160 });
  const afterUpdate = await prisma.planMealItem.findUniqueOrThrow({ where: { id: lunchItemId } });
  assert.deepEqual(measureOf(afterUpdate), [1.5, "taza", "tazas", 180, 270]);
  assert.equal((await resolveMeasureItem(arroz.id, taza.id, 1)).quantityGrams, 160, "los nuevos usan 160 g");
  step(8, "updateFoodMeasure taza = 160 g → el ítem sigue en 270 g / 180 por taza");

  // 9. Borrar la medida no toca el ítem (D4).
  await deleteFoodMeasure(taza.id);
  const afterDelete = await prisma.planMealItem.findUniqueOrThrow({ where: { id: lunchItemId } });
  assert.deepEqual(measureOf(afterDelete), [1.5, "taza", "tazas", 180, 270]);
  assert.deepEqual((await listFoodMeasures(arroz.id)).map((m) => m.name), ["cda"]);
  step(9, "deleteFoodMeasure taza → el ítem sigue igual; al alimento le queda «cda»");
}

const before = await controlCounts();
console.log("Conteos de control (antes):", before);
let failed = false;
try {
  await main();
  console.log("OK: flujo de medidas caseras (018d-1a)");
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
