/**
 * HU-018b (SDD 10.4): recorre el menú semanal contra la base de desarrollo, sin WhatsApp (esta HU no
 * encola nada en OutboundMessage) y sin IA.
 *
 * Crea SUS PROPIOS paciente ("Prueba HU-018b", teléfono ficticio 5490000018018), plan y plantilla, y
 * al final (en `finally`) los borra SOLO por los ids que insertó: la plantilla, los planes creados y
 * el paciente (las comidas e ítems caen en cascada desde esos ids). Nunca usa deleteMany por filtro.
 * Lee alimentos SARA 2 existentes para tener macros, pero no los modifica.
 *
 * No corre dentro de una transacción que se revierte porque las operaciones de domain abren sus
 * propias transacciones sobre el cliente global.
 *
 * Uso (desde packages/db):
 *   npx dotenv -e ../../.env -- tsx scripts/test-weekly-menu.ts
 */
import assert from "node:assert/strict";
import {
  WEEKDAYS,
  computeItemMacros,
  computeWeeklyTotals,
  type Weekday,
  type WeeklyMenuMeal,
} from "@nutri-bot/core";
import { prisma } from "../index";
import {
  addMeal,
  addMealItem,
  createPlan,
  getPlan,
  getPlanTarget,
} from "../domain/nutritionPlans";
import {
  addTemplateMealItem,
  applyTemplateToPatient,
  createTemplate,
  getTemplate,
} from "../domain/planTemplates";
import {
  MealModeError,
  MealWeekdayMismatchError,
  copyDay,
  moveMeal,
  nextItemOrder,
  renameMeal,
  repeatMealInAllDays,
  restoreMealSnapshots,
  setMealMode,
  setMealOptions,
} from "../domain/weeklyMenu";

const TEST_JID = "5490000018018@s.whatsapp.net";
const TEST_PHONE = "5490000018018";

const created = { patientId: null as string | null, planIds: [] as string[], templateId: null as string | null };

type LoadedPlan = NonNullable<Awaited<ReturnType<typeof getPlan>>>;
type LoadedMeal = LoadedPlan["meals"][number];

function toWeekly(meals: LoadedMeal[]): WeeklyMenuMeal[] {
  return meals.map((meal) => ({
    id: meal.id,
    mode: meal.mode,
    isOptions: meal.isOptions,
    items: meal.items.map((item) => ({
      id: item.id,
      weekday: item.weekday,
      macros:
        item.food && item.quantityGrams !== null
          ? computeItemMacros(
              {
                kcalPer100: Number(item.food.kcalPer100),
                proteinPer100: Number(item.food.proteinPer100),
                carbsPer100: Number(item.food.carbsPer100),
                fatPer100: Number(item.food.fatPer100),
                fiberPer100: Number(item.food.fiberPer100 ?? 0),
              },
              Number(item.quantityGrams),
            )
          : null,
    })),
  }));
}

async function loadPlan(planId: string): Promise<LoadedPlan> {
  const plan = await getPlan(planId);
  assert.ok(plan, "el plan existe");
  return plan;
}

function mealNamed(plan: { meals: LoadedMeal[] }, name: string): LoadedMeal {
  const meal = plan.meals.find((m) => m.name === name);
  assert.ok(meal, `existe la comida ${name}`);
  return meal;
}

function itemsOn(meal: LoadedMeal, day: Weekday | null) {
  return meal.items.filter((item) => item.weekday === day);
}

let step = 0;
function ok(message: string) {
  console.log(`  ✓ ${++step}. ${message}`);
}

async function addItem(mealId: string, weekday: Weekday | null, foodId: string, grams: number) {
  const order = await nextItemOrder("plan", mealId, weekday);
  return addMealItem(mealId, { foodId, quantityGrams: grams, order, weekday });
}

async function main() {
  const existing = await prisma.patient.findUnique({ where: { whatsappJid: TEST_JID } });
  if (existing) {
    throw new Error(
      `Ya existe un paciente con el jid de prueba (${existing.id}), quizás de una corrida anterior. ` +
        "Borralo a mano desde el panel antes de volver a correr: este script no borra lo que no creó.",
    );
  }

  const foods = await prisma.food.findMany({
    where: { source: "SARA2", active: true, kcalPer100: { gt: 0 } },
    orderBy: { name: "asc" },
    take: 4,
    select: { id: true, name: true },
  });
  assert.ok(foods.length >= 3, "hay al menos 3 alimentos SARA 2 activos para la prueba");
  const [f1, f2, f3, f4 = foods[0]!] = foods as [typeof foods[0], typeof foods[0], typeof foods[0], typeof foods[0]?];

  const patient = await prisma.patient.create({
    data: { whatsappJid: TEST_JID, phone: TEST_PHONE, name: "Prueba HU-018b" },
  });
  created.patientId = patient.id;

  // 1. Plan nuevo con comidas por defecto.
  const newPlan = await createPlan(patient.id, { title: "Plan prueba HU-018b" });
  created.planIds.push(newPlan.id);
  let plan = await loadPlan(newPlan.id);
  assert.deepEqual(
    plan.meals.map((m) => [m.name, m.mode, m.isOptions]),
    [
      ["Desayuno", "PER_DAY", false],
      ["Almuerzo", "PER_DAY", false],
      ["Merienda", "PER_DAY", false],
      ["Cena", "PER_DAY", false],
      ["Colaciones", "EVERY_DAY", true],
    ],
  );
  ok("createPlan trae Desayuno…Cena 'Cambia cada día' y Colaciones con opciones");

  // 2. Plantilla nueva con las mismas comidas.
  const newTemplate = await createTemplate({ title: "Plantilla prueba HU-018b", notes: null });
  created.templateId = newTemplate.id;
  const template0 = await getTemplate(newTemplate.id);
  assert.equal(template0?.meals.length, 5);
  assert.equal(template0?.meals[4]?.isOptions, true);
  ok("createTemplate trae las mismas 5 comidas");

  // 3. Agregar ítems el lunes. Un PER_DAY sin día → MealWeekdayMismatchError.
  const desayunoId = mealNamed(plan, "Desayuno").id;
  const almuerzoId = mealNamed(plan, "Almuerzo").id;
  const colacionesId = mealNamed(plan, "Colaciones").id;
  await addItem(desayunoId, "MON", f1.id, 200);
  await addItem(desayunoId, "MON", f2.id, 50);
  await addItem(almuerzoId, "MON", f3.id, 150);
  await assert.rejects(addItem(desayunoId, null, f1.id, 10), MealWeekdayMismatchError);
  await assert.rejects(addItem(colacionesId, "MON", f1.id, 10), MealWeekdayMismatchError);
  plan = await loadPlan(plan.id);
  assert.deepEqual(itemsOn(mealNamed(plan, "Desayuno"), "MON").map((i) => i.order), [0, 1]);
  let totals = computeWeeklyTotals(toWeekly(plan.meals));
  assert.equal(totals.isWeekly, true);
  assert.deepEqual(totals.loadedDays, ["MON"]);
  assert.ok(totals.days.MON.macros.kcal > 0);
  ok("ítems del lunes con order correlativo; el día sin weekday se rechaza");

  // 4. Copiar lunes a martes y miércoles, y deshacer.
  const mondayKcal = totals.days.MON.macros.kcal;
  const copyUndo = await copyDay("plan", plan.id, { from: "MON", to: ["TUE", "WED"] });
  plan = await loadPlan(plan.id);
  totals = computeWeeklyTotals(toWeekly(plan.meals));
  assert.deepEqual(totals.loadedDays, ["MON", "TUE", "WED"]);
  assert.equal(totals.days.TUE.macros.kcal, mondayKcal);
  assert.equal(itemsOn(mealNamed(plan, "Desayuno"), "WED").length, 2);
  assert.equal(copyUndo.length, 4, "una foto por comida PER_DAY");
  await restoreMealSnapshots("plan", plan.id, copyUndo);
  plan = await loadPlan(plan.id);
  totals = computeWeeklyTotals(toWeekly(plan.meals));
  assert.deepEqual(totals.loadedDays, ["MON"]);
  assert.equal(totals.days.MON.macros.kcal, mondayKcal);
  ok("copyDay MON → TUE, WED y Deshacer deja martes y miércoles vacíos");

  // 5. Repetir el desayuno del lunes en todos los días.
  const repeatUndo = await repeatMealInAllDays("plan", plan.id, desayunoId, "MON");
  plan = await loadPlan(plan.id);
  const desayuno = mealNamed(plan, "Desayuno");
  assert.equal(desayuno.mode, "PER_DAY");
  for (const day of WEEKDAYS) assert.equal(itemsOn(desayuno, day).length, 2, `desayuno del ${day}`);
  assert.equal(repeatUndo.items.length, 2);
  ok("repeatMealInAllDays: los 7 días con el desayuno del lunes, sigue PER_DAY");

  // 6. Modo: PER_DAY → EVERY_DAY (conserva el miércoles) → PER_DAY, y deshacer.
  await addItem(desayunoId, "WED", f4.id, 30);
  const toEveryUndo = await setMealMode("plan", plan.id, desayunoId, { mode: "EVERY_DAY", keepWeekday: "WED" });
  plan = await loadPlan(plan.id);
  let d = mealNamed(plan, "Desayuno");
  assert.equal(d.mode, "EVERY_DAY");
  assert.equal(d.items.length, 3);
  assert.ok(d.items.every((i) => i.weekday === null));
  const toPerUndo = await setMealMode("plan", plan.id, desayunoId, { mode: "PER_DAY" });
  plan = await loadPlan(plan.id);
  d = mealNamed(plan, "Desayuno");
  assert.equal(d.mode, "PER_DAY");
  assert.equal(d.items.length, 21);
  assert.equal(toPerUndo.mode, "EVERY_DAY");
  await restoreMealSnapshots("plan", plan.id, [toEveryUndo]);
  plan = await loadPlan(plan.id);
  d = mealNamed(plan, "Desayuno");
  assert.equal(d.mode, "PER_DAY");
  assert.equal(d.items.length, 15, "7 × 2 + el ítem extra del miércoles");
  assert.equal(itemsOn(d, "WED").length, 3);
  ok("setMealMode en los dos sentidos y Deshacer vuelve a la foto anterior");

  // 7. Opciones: 3 colaciones, promedio al día; opciones en PER_DAY → MealModeError.
  await addItem(colacionesId, null, f1.id, 100);
  await addItem(colacionesId, null, f2.id, 100);
  await addItem(colacionesId, null, f3.id, 100);
  await assert.rejects(setMealOptions("plan", plan.id, desayunoId, true), MealModeError);
  await setMealOptions("plan", plan.id, colacionesId, false);
  plan = await loadPlan(plan.id);
  const withoutOptions = computeWeeklyTotals(toWeekly(plan.meals)).days.THU.macros.kcal;
  await setMealOptions("plan", plan.id, colacionesId, true);
  plan = await loadPlan(plan.id);
  totals = computeWeeklyTotals(toWeekly(plan.meals));
  const colacionesKcal = toWeekly(plan.meals)
    .find((m) => m.id === colacionesId)!
    .items.map((i) => i.macros!.kcal);
  const average = Math.round((colacionesKcal.reduce((a, b) => a + b, 0) / 3) * 10) / 10;
  // Jueves: sin comidas PER_DAY salvo el desayuno; con opciones suma el promedio, sin opciones la suma.
  assert.ok(totals.days.THU.macros.kcal < withoutOptions, "con opciones el día suma el promedio, no la suma");
  assert.ok(Math.abs(totals.days.THU.macros.kcal - (withoutOptions - colacionesKcal.reduce((a, b) => a + b, 0) + average)) < 0.2);
  ok("setMealOptions: la comida de opciones suma el promedio al día");

  // 8. Renombrar y mover.
  await renameMeal("plan", plan.id, almuerzoId, "  Almuerzo liviano  ");
  await moveMeal("plan", plan.id, almuerzoId, "up");
  plan = await loadPlan(plan.id);
  assert.deepEqual(plan.meals.slice(0, 2).map((m) => m.name), ["Almuerzo liviano", "Desayuno"]);
  await moveMeal("plan", plan.id, plan.meals[0]!.id, "up"); // borde: no hace nada
  plan = await loadPlan(plan.id);
  assert.equal(plan.meals[0]!.name, "Almuerzo liviano");
  ok("renameMeal (trim) y moveMeal, con el borde sin cambios");

  // 9. Comida nueva en un plan semanal hereda PER_DAY (12-D3).
  const extra = await addMeal(plan.id, { name: "Pre entreno", order: plan.meals.length });
  assert.equal(extra.mode, "PER_DAY");
  ok("addMeal en un plan semanal crea la comida 'Cambia cada día'");

  // 10. Plantilla semanal aplicada al paciente: copia modos, días e ítems.
  const template = await getTemplate(newTemplate.id);
  const tDesayuno = template!.meals.find((m) => m.name === "Desayuno")!;
  const tColaciones = template!.meals.find((m) => m.name === "Colaciones")!;
  await addTemplateMealItem(tDesayuno.id, { foodId: f1.id, quantityGrams: 120, order: 0, weekday: "TUE" });
  await addTemplateMealItem(tColaciones.id, { foodId: f2.id, quantityGrams: 80, order: 0, weekday: null });
  await assert.rejects(
    addTemplateMealItem(tDesayuno.id, { foodId: f1.id, quantityGrams: 1, order: 1, weekday: null }),
    MealWeekdayMismatchError,
  );
  const applied = await applyTemplateToPatient(newTemplate.id, patient.id);
  assert.ok(applied);
  created.planIds.push(applied.id);
  assert.deepEqual(
    applied.meals.map((m) => [m.name, m.mode, m.isOptions]),
    template!.meals.map((m) => [m.name, m.mode, m.isOptions]),
  );
  const aDesayuno = applied.meals.find((m) => m.name === "Desayuno")!;
  assert.deepEqual(aDesayuno.items.map((i) => i.weekday), ["TUE"]);
  assert.deepEqual(applied.meals.find((m) => m.name === "Colaciones")!.items.map((i) => i.weekday), [null]);
  assert.equal(applied.meals.length, 5, "no agrega comidas por defecto: es copia exacta");
  ok("applyTemplateToPatient copia modos, opciones, días e ítems");

  // 11. Objetivo: el paciente de prueba no tiene consultas.
  assert.equal(await getPlanTarget(plan.id), null);
  ok("getPlanTarget = null (sin prescripción)");

  // 12. Totales finales sobre lo leído.
  plan = await loadPlan(plan.id);
  totals = computeWeeklyTotals(toWeekly(plan.meals));
  assert.deepEqual(totals.loadedDays, [...WEEKDAYS]);
  assert.ok(totals.weeklyAverage && totals.weeklyAverage.kcal > 0);
  ok(`computeWeeklyTotals: 7 días cargados, promedio ${totals.weeklyAverage!.kcal} kcal`);
}

async function cleanup(): Promise<void> {
  // Solo por los ids que insertó este script.
  if (created.templateId) await prisma.planTemplate.delete({ where: { id: created.templateId } }).catch(() => {});
  for (const id of created.planIds) await prisma.nutritionPlan.delete({ where: { id } }).catch(() => {});
  if (created.patientId) await prisma.patient.delete({ where: { id: created.patientId } }).catch(() => {});

  // Verificación: no quedó nada de lo creado.
  const left = await Promise.all([
    created.templateId ? prisma.planTemplate.count({ where: { id: created.templateId } }) : 0,
    created.planIds.length ? prisma.nutritionPlan.count({ where: { id: { in: created.planIds } } }) : 0,
    created.patientId ? prisma.patient.count({ where: { id: created.patientId } }) : 0,
  ]);
  if (left.some((n) => n > 0)) throw new Error(`Limpieza incompleta: ${JSON.stringify(left)}`);
}

let failed = false;
main()
  .catch((err) => {
    failed = true;
    console.error("FALLA:", err);
  })
  .finally(async () => {
    try {
      await cleanup();
    } catch (err) {
      failed = true;
      console.error("FALLA en la limpieza:", err);
    }
    await prisma.$disconnect();
    if (failed) process.exit(1);
    console.log("OK");
  });
