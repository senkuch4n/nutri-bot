/**
 * HU-018b: verificación de que la migración `weekly_menu` no pierde ni cambia datos. SOLO LEE.
 *
 *   --snapshot <archivo>  Antes de la migración. Solo $queryRaw con columnas que ya existían.
 *                         Guarda comidas, ítems, totales de hoy, micronutrientes y md5 del PDF.
 *   --compare  <archivo>  Después. Relee con getPlan/getTemplate (cliente regenerado) y verifica
 *                         mismos datos, modo EVERY_DAY / sin opciones / weekday null, totales por día
 *                         y promedio iguales al total de hoy, micronutrientes con pesos y md5 del PDF.
 *
 * El archivo va fuera del repo (p. ej. ~/nutribot-backups/hu018b-snapshot.json).
 * Uso (desde packages/db):
 *   npx dotenv -e ../../.env -- tsx scripts/test-weekly-menu-migration.ts --snapshot <archivo>
 *   npx dotenv -e ../../.env -- tsx scripts/test-weekly-menu-migration.ts --compare <archivo>
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { isDeepStrictEqual } from "node:util";
import {
  WEEKDAYS,
  computeItemMacros,
  computePlanMicronutrients,
  computeWeeklyItemWeights,
  computeWeeklyTotals,
  sumMacros,
  type Macros,
  type MicronutrientPlanItem,
  type WeeklyMenuMeal,
} from "@nutri-bot/core";
import { prisma } from "../index";
import { getPlan } from "../domain/nutritionPlans";
import { getTemplate } from "../domain/planTemplates";

const PATIENT = { birthDate: new Date("1990-01-01T12:00:00Z"), sex: "FEMALE" as const };
const AT = new Date("2026-10-03T15:00:00Z");
const TZ = "America/Argentina/Buenos_Aires";

interface FoodRow {
  kcal: unknown; protein: unknown; carbs: unknown; fat: unknown; fiber: unknown;
  nutrients: unknown; sodium: unknown;
}
interface SnapItem {
  id: string; mealId: string; foodId: string | null; customLabel: string | null;
  quantityGrams: string | null; notes: string | null; order: number;
}
interface SnapMeal { id: string; name: string; order: number }
interface SnapOwner {
  kind: "plan" | "template";
  id: string;
  meals: SnapMeal[];
  items: SnapItem[];
  totals: Macros;
  micronutrients: (number | null)[];
  pdfMd5: string | null;
}

const num = (v: unknown) => (v == null ? null : Number(v));

function itemMacros(quantityGrams: number | null, food: FoodRow | null): Macros | null {
  if (!food || quantityGrams === null) return null;
  return computeItemMacros({
    kcalPer100: Number(food.kcal), proteinPer100: Number(food.protein), carbsPer100: Number(food.carbs),
    fatPer100: Number(food.fat), fiberPer100: Number(food.fiber ?? 0),
  }, quantityGrams);
}

function microItem(quantityGrams: number | null, food: FoodRow | null, weight?: number): MicronutrientPlanItem {
  return {
    quantityGrams,
    food: food ? { nutrients: food.nutrients, sodiumMgPer100: num(food.sodium) } : null,
    ...(weight === undefined ? {} : { weight }),
  };
}

const microAmounts = (items: MicronutrientPlanItem[]) =>
  computePlanMicronutrients(items, PATIENT, AT, TZ).nutrients.map((n) => n.knownAmount);

const byOrder = <T extends { order: number; id: string }>(a: T, b: T) => a.order - b.order || a.id.localeCompare(b.id);

async function snapshot(file: string) {
  const owners: SnapOwner[] = [];
  for (const kind of ["plan", "template"] as const) {
    const ownerRows = kind === "plan"
      ? await prisma.$queryRaw<{ id: string; md5: string | null }[]>`
          SELECT id, md5("pdfData") AS md5 FROM "NutritionPlan" ORDER BY id`
      : await prisma.$queryRaw<{ id: string; md5: string | null }[]>`
          SELECT id, NULL::text AS md5 FROM "PlanTemplate" ORDER BY id`;
    for (const owner of ownerRows) {
      const meals = kind === "plan"
        ? await prisma.$queryRaw<SnapMeal[]>`SELECT id, name, "order" FROM "PlanMeal" WHERE "planId" = ${owner.id}`
        : await prisma.$queryRaw<SnapMeal[]>`SELECT id, name, "order" FROM "TemplateMeal" WHERE "templateId" = ${owner.id}`;
      meals.sort(byOrder);
      type Row = SnapItem & { food_id: string | null } & FoodRow;
      const rows = kind === "plan"
        ? await prisma.$queryRaw<Row[]>`
            SELECT i.id, i."mealId", i."foodId", i."customLabel", i."quantityGrams"::text AS "quantityGrams",
                   i.notes, i."order", f.id AS food_id, f."kcalPer100" AS kcal, f."proteinPer100" AS protein,
                   f."carbsPer100" AS carbs, f."fatPer100" AS fat, f."fiberPer100" AS fiber,
                   f.nutrients, f."sodiumMgPer100" AS sodium
            FROM "PlanMealItem" i JOIN "PlanMeal" m ON m.id = i."mealId"
            LEFT JOIN "Food" f ON f.id = i."foodId" WHERE m."planId" = ${owner.id}`
        : await prisma.$queryRaw<Row[]>`
            SELECT i.id, i."mealId", i."foodId", i."customLabel", i."quantityGrams"::text AS "quantityGrams",
                   i.notes, i."order", f.id AS food_id, f."kcalPer100" AS kcal, f."proteinPer100" AS protein,
                   f."carbsPer100" AS carbs, f."fatPer100" AS fat, f."fiberPer100" AS fiber,
                   f.nutrients, f."sodiumMgPer100" AS sodium
            FROM "TemplateMealItem" i JOIN "TemplateMeal" m ON m.id = i."mealId"
            LEFT JOIN "Food" f ON f.id = i."foodId" WHERE m."templateId" = ${owner.id}`;
      // Mismo orden que getPlan: comida por order, ítem por order.
      const mealIndex = new Map(meals.map((m, i) => [m.id, i]));
      rows.sort((a, b) => mealIndex.get(a.mealId)! - mealIndex.get(b.mealId)! || byOrder(a, b));
      const food = (r: Row) => (r.food_id ? r : null);
      const macros = rows.map((r) => itemMacros(num(r.quantityGrams), food(r))).filter((m): m is Macros => m !== null);
      owners.push({
        kind,
        id: owner.id,
        meals: meals.map((m) => ({ id: m.id, name: m.name, order: Number(m.order) })),
        items: rows.map((r) => ({
          id: r.id, mealId: r.mealId, foodId: r.foodId, customLabel: r.customLabel,
          quantityGrams: r.quantityGrams, notes: r.notes, order: Number(r.order),
        })),
        totals: sumMacros(macros),
        micronutrients: microAmounts(rows.map((r) => microItem(num(r.quantityGrams), food(r)))),
        pdfMd5: owner.md5,
      });
    }
  }
  writeFileSync(file, JSON.stringify({ takenAt: new Date().toISOString(), owners }, null, 2));
  const plans = owners.filter((o) => o.kind === "plan");
  console.log(
    `Snapshot guardado en ${file}: ${plans.length} planes, ${owners.length - plans.length} plantillas, ` +
    `${owners.reduce((s, o) => s + o.items.length, 0)} ítems, ${plans.filter((p) => p.pdfMd5).length} PDF.`,
  );
}

async function compare(file: string) {
  const { owners } = JSON.parse(readFileSync(file, "utf8")) as { owners: SnapOwner[] };
  const diffs: string[] = [];
  const diff = (owner: SnapOwner, what: string, before: unknown, after: unknown) =>
    diffs.push(`${owner.kind} ${owner.id}: ${what}\n  antes:   ${JSON.stringify(before)}\n  después: ${JSON.stringify(after)}`);

  const [planCount, templateCount] = await Promise.all([prisma.nutritionPlan.count(), prisma.planTemplate.count()]);
  const snapPlans = owners.filter((o) => o.kind === "plan").length;
  if (planCount !== snapPlans) diffs.push(`Cantidad de planes: antes ${snapPlans}, después ${planCount}`);
  if (templateCount !== owners.length - snapPlans) {
    diffs.push(`Cantidad de plantillas: antes ${owners.length - snapPlans}, después ${templateCount}`);
  }

  for (const owner of owners) {
    const loaded = owner.kind === "plan" ? await getPlan(owner.id) : await getTemplate(owner.id);
    if (!loaded) { diffs.push(`${owner.kind} ${owner.id}: ya no existe`); continue; }
    const meals = [...loaded.meals].sort(byOrder);

    // 1. Mismas comidas e ítems, mismos campos.
    const mealsNow = meals.map((m) => ({ id: m.id, name: m.name, order: m.order }));
    if (!isDeepStrictEqual(mealsNow, owner.meals)) diff(owner, "comidas", owner.meals, mealsNow);
    const items = meals.flatMap((m) => [...m.items].sort(byOrder));
    const itemsNow = items.map((i) => ({
      id: i.id, mealId: i.mealId, foodId: i.foodId, customLabel: i.customLabel,
      quantityGrams: i.quantityGrams === null ? null : i.quantityGrams.toFixed(2),
      notes: i.notes, order: i.order,
    }));
    if (!isDeepStrictEqual(itemsNow, owner.items)) diff(owner, "ítems", owner.items, itemsNow);

    // 2. Backfill: todo EVERY_DAY, sin opciones, weekday null.
    for (const m of meals) {
      if (m.mode !== "EVERY_DAY" || m.isOptions !== false) diff(owner, `comida ${m.id} modo`, "EVERY_DAY/false", `${m.mode}/${m.isOptions}`);
      for (const i of m.items) if (i.weekday !== null) diff(owner, `ítem ${i.id} weekday`, null, i.weekday);
    }

    // 3. Totales por día y promedio = total de hoy.
    const toFood = (f: (typeof items)[number]["food"]): FoodRow | null => f
      ? { kcal: f.kcalPer100, protein: f.proteinPer100, carbs: f.carbsPer100, fat: f.fatPer100, fiber: f.fiberPer100,
          nutrients: f.nutrients, sodium: f.sodiumMgPer100 }
      : null;
    const weekly: WeeklyMenuMeal[] = meals.map((m) => ({
      id: m.id, mode: m.mode, isOptions: m.isOptions,
      items: [...m.items].sort(byOrder).map((i) => ({
        id: i.id, weekday: i.weekday, macros: itemMacros(num(i.quantityGrams), toFood(i.food)),
      })),
    }));
    const totals = computeWeeklyTotals(weekly);
    if (totals.isWeekly) diff(owner, "isWeekly", false, true);
    for (const day of WEEKDAYS) {
      if (!isDeepStrictEqual(totals.days[day].macros, owner.totals)) diff(owner, `total ${day}`, owner.totals, totals.days[day].macros);
    }
    const expectedAverage = items.length > 0 ? owner.totals : null;
    if (!isDeepStrictEqual(totals.weeklyAverage, expectedAverage)) diff(owner, "promedio semanal", expectedAverage, totals.weeklyAverage);

    // 4. Micronutrientes con pesos (todos 1).
    const weights = computeWeeklyItemWeights(weekly);
    if (Object.values(weights).some((w) => w !== 1)) diff(owner, "pesos", "todos 1", weights);
    const micro = microAmounts(items.map((i) => microItem(num(i.quantityGrams), toFood(i.food), weights[i.id])));
    if (!isDeepStrictEqual(micro, owner.micronutrients)) diff(owner, "micronutrientes", owner.micronutrients, micro);

    // 5. PDF guardado sin cambios.
    if (owner.kind === "plan" && "pdfData" in loaded) {
      const md5 = loaded.pdfData ? createHash("md5").update(loaded.pdfData).digest("hex") : null;
      if (md5 !== owner.pdfMd5) diff(owner, "md5 del PDF", owner.pdfMd5, md5);
    }
  }

  if (diffs.length > 0) {
    console.error(`FALLA — ${diffs.length} diferencias:\n${diffs.join("\n")}`);
    process.exitCode = 1;
    return;
  }
  const plans = owners.filter((o) => o.kind === "plan");
  console.log(
    `OK — ${plans.length} planes, ${owners.length - plans.length} plantillas, ` +
    `${owners.reduce((s, o) => s + o.items.length, 0)} ítems, ${plans.filter((p) => p.pdfMd5).length} PDF sin cambios`,
  );
}

const [mode, file] = process.argv.slice(2);
if ((mode !== "--snapshot" && mode !== "--compare") || !file) {
  console.error("Uso: tsx scripts/test-weekly-menu-migration.ts --snapshot|--compare <archivo>");
  process.exit(2);
}
(mode === "--snapshot" ? snapshot(file) : compare(file))
  .catch((err) => { console.error(err); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
