/**
 * HU-018a (SDD 11.4): recorre el recetario contra la base de desarrollo, sin WhatsApp (no encola nada
 * en OutboundMessage) y sin IA.
 *
 * Crea SUS PROPIOS datos: una receta MANUAL (con 2 alimentos SARA 2 existentes, que solo se leen,
 * un c.n. y un texto libre), un paciente "Prueba HU-018a" con teléfono ficticio 5490000018001 y un
 * plan ACTIVE con una comida y un PlanMealItem de receta (insertado con prisma directo: el dominio
 * de ítems de receta es de 018c). Al final (en `finally`) borra SOLO por los ids que insertó: el
 * plan (comidas e ítems en cascada), el paciente y la receta (ingredientes y foto en cascada).
 *
 * No corre dentro de una transacción que se revierte porque las operaciones de domain abren sus
 * propias transacciones sobre el cliente global.
 *
 * Uso: npm run test:recipes --workspace packages/db
 */
import assert from "node:assert/strict";
import sharp from "sharp";
import { computeRecipeMacros, type FoodGroupKey } from "@nutri-bot/core";
import { prisma } from "../index";
import {
  RecipeNotPublishableError,
  RecipeStatusError,
  archiveRecipe,
  createRecipe,
  deleteDraftRecipe,
  getRecipe,
  getRecipePhotoBytes,
  getRecipeUsage,
  listRecipeCards,
  patientCanSeeRecipePhoto,
  setRecipePhoto,
  unarchiveRecipe,
  type RecipeInput,
} from "../domain/recipes";
import { processRecipePhoto } from "../media/recipe-photo";

const TEST_JID = "5490000018001@s.whatsapp.net";
const TEST_PHONE = "5490000018001";

const created = { recipeId: null as string | null, patientId: null as string | null, planId: null as string | null };

function step(n: number, text: string) {
  console.log(`  ✓ ${n}. ${text}`);
}

async function cleanup() {
  if (created.planId) await prisma.nutritionPlan.delete({ where: { id: created.planId } });
  if (created.patientId) await prisma.patient.delete({ where: { id: created.patientId } });
  if (created.recipeId) await prisma.recipe.delete({ where: { id: created.recipeId } });
}

async function main() {
  const existing = await prisma.patient.findUnique({ where: { whatsappJid: TEST_JID }, select: { id: true } });
  assert.equal(existing, null, "Ya existe un paciente con el teléfono de prueba: no se toca. Revisalo a mano.");

  const foods = await prisma.food.findMany({
    where: { source: "SARA2", active: true, fatPer100: { lt: 5 } },
    orderBy: { name: "asc" },
    take: 2,
    select: { id: true, name: true, group: true, kcalPer100: true, proteinPer100: true, carbsPer100: true, fatPer100: true, fiberPer100: true },
  });
  assert.equal(foods.length, 2, "Hacen falta 2 alimentos SARA 2 en la base");
  const [a, b] = foods as [(typeof foods)[0], (typeof foods)[0]];

  const input: RecipeInput = {
    name: "Prueba HU-018a albóndigas",
    type: "MAIN_DISH",
    moments: ["LUNCH", "DINNER"],
    tags: ["VEGETARIAN"],
    yieldPortions: 4,
    portionHousehold: "2 albóndigas",
    portionGrams: null,
    preparation: "Mezclar y hornear.",
    tips: null,
    sourceName: null,
    published: null,
    ingredients: [
      { foodId: a.id, label: null, grams: 300, noQuantity: false, household: "1 taza", rawText: null },
      { foodId: b.id, label: null, grams: 150.5, noQuantity: false, household: null, rawText: null },
      { foodId: b.id, label: "Perejil", grams: null, noQuantity: true, household: null, rawText: null },
      { foodId: null, label: "Pan rallado", grams: 40, noQuantity: false, household: null, rawText: null },
    ],
  };

  // 1. Inválida → issues; válida → PUBLISHED
  const invalid = await createRecipe({ ...input, name: " ", moments: [] }).catch((e) => e);
  assert.ok(invalid instanceof RecipeNotPublishableError);
  assert.deepEqual(invalid.issues.map((i: { field: string }) => i.field), ["name", "moments"]);
  const { id } = await createRecipe(input);
  created.recipeId = id;
  const detail = await getRecipe(id);
  assert.equal(detail?.status, "PUBLISHED");
  assert.equal(detail?.ingredients.length, 4);
  assert.equal(detail?.ingredients[2]?.grams, null, "el c.n. no guarda gramos");
  step(1, "createRecipe inválida da issues; válida queda PUBLISHED");

  // 2. perPortion = core con los macros leídos
  const expected = computeRecipeMacros(
    [
      { label: null, grams: 300, noQuantity: false, food: { ...macros(a), name: a.name, group: a.group as FoodGroupKey } },
      { label: null, grams: 150.5, noQuantity: false, food: { ...macros(b), name: b.name, group: b.group as FoodGroupKey } },
      { label: "Perejil", grams: null, noQuantity: true, food: { ...macros(b), name: b.name, group: b.group as FoodGroupKey } },
      { label: "Pan rallado", grams: 40, noQuantity: false, food: null },
    ],
    4,
  ).perPortion;
  const card = (await listRecipeCards({ status: "PUBLISHED" })).find((c) => c.id === id);
  assert.ok(card);
  assert.deepEqual(card.perPortion, expected);
  assert.equal(card.macrosIncomplete, true, "texto libre → macros incompletos");
  assert.ok(card.searchText.includes("pan rallado") && card.searchText.includes("vegetariana"));
  step(2, `listRecipeCards: perPortion = core (${expected?.kcal} kcal)`);

  // 3. Foto: procesada con sharp, bytes WebP, id nuevo al reemplazar
  const jpeg = await sharp({ create: { width: 1600, height: 1200, channels: 3, background: { r: 220, g: 140, b: 60 } } }).jpeg().toBuffer();
  const processed = await processRecipePhoto(jpeg);
  const first = await setRecipePhoto(id, { ...processed, credit: "Foto: prueba" });
  for (const size of ["full", "thumb"] as const) {
    const bytes = await getRecipePhotoBytes(first.photoId, size);
    assert.ok(bytes);
    assert.equal((await sharp(bytes.data).metadata()).format, "webp");
  }
  const second = await setRecipePhoto(id, { ...processed, credit: null });
  assert.notEqual(second.photoId, first.photoId);
  assert.equal(await getRecipePhotoBytes(first.photoId, "full"), null);
  step(3, "setRecipePhoto → WebP full/thumb; al reemplazar cambia el id");

  // Paciente + plan ACTIVE con un ítem de receta (1,5 porciones)
  const patient = await prisma.patient.create({ data: { whatsappJid: TEST_JID, phone: TEST_PHONE, name: "Prueba HU-018a" } });
  created.patientId = patient.id;
  const plan = await prisma.nutritionPlan.create({
    data: {
      patientId: patient.id,
      title: "Plan de prueba HU-018a",
      status: "ACTIVE",
      meals: { create: [{ name: "Almuerzo", order: 0, items: { create: [{ order: 0, recipeId: id, portions: 1.5 }] } }] },
    },
  });
  created.planId = plan.id;

  // 4. Uso
  assert.deepEqual(await getRecipeUsage(id), { plans: 1, templates: 0 });
  step(4, "getRecipeUsage = { plans: 1, templates: 0 }");

  // 5. deleteDraftRecipe sobre PUBLISHED falla
  assert.ok((await deleteDraftRecipe(id).catch((e) => e)) instanceof RecipeStatusError);
  step(5, "deleteDraftRecipe sobre PUBLISHED → RecipeStatusError");

  // 6. Borrar con el ítem presente falla por la FK (Restrict)
  const fk = await prisma.recipe.delete({ where: { id } }).catch((e) => e);
  assert.equal((fk as { code?: string }).code, "P2003", "esperaba P2003 (Restrict)");
  assert.ok(await prisma.recipe.findUnique({ where: { id }, select: { id: true } }));
  step(6, "borrar la receta usada en un plan falla por FK (P2003)");

  // 7. Portal
  assert.equal(await patientCanSeeRecipePhoto(patient.id, second.photoId), true);
  assert.equal(await patientCanSeeRecipePhoto("paciente-inventado-hu018a", second.photoId), false);
  await prisma.nutritionPlan.update({ where: { id: plan.id }, data: { status: "ARCHIVED" } });
  assert.equal(await patientCanSeeRecipePhoto(patient.id, second.photoId), false);
  step(7, "patientCanSeeRecipePhoto: true con plan ACTIVE; false archivado o con otro paciente");

  // 8. Archivar y volver a publicar
  await archiveRecipe(id);
  assert.equal((await getRecipe(id))?.status, "ARCHIVED");
  assert.ok(!(await listRecipeCards({ status: "PUBLISHED" })).some((c) => c.id === id));
  assert.ok((await archiveRecipe(id).catch((e) => e)) instanceof RecipeStatusError);
  await unarchiveRecipe(id);
  assert.equal((await getRecipe(id))?.status, "PUBLISHED");
  step(8, "archiveRecipe / unarchiveRecipe");
}

function macros(f: { kcalPer100: unknown; proteinPer100: unknown; carbsPer100: unknown; fatPer100: unknown; fiberPer100: unknown }) {
  return {
    kcalPer100: Number(f.kcalPer100),
    proteinPer100: Number(f.proteinPer100),
    carbsPer100: Number(f.carbsPer100),
    fatPer100: Number(f.fatPer100),
    fiberPer100: Number(f.fiberPer100 ?? 0),
  };
}

let failed = false;
console.log("HU-018a: flujo de recetas contra la base de desarrollo");
main()
  .catch((err) => {
    failed = true;
    console.error("FALLA:", err);
  })
  .finally(async () => {
    try {
      await cleanup();
      const left = created.recipeId ? await prisma.recipe.count({ where: { id: created.recipeId } }) : 0;
      assert.equal(left, 0, "la receta de prueba no se borró");
      console.log("  ✓ limpieza por id (plan, paciente, receta)");
    } catch (err) {
      failed = true;
      console.error("FALLA en la limpieza:", err);
    }
    await prisma.$disconnect();
    if (failed) process.exit(1);
    console.log("OK");
  });
