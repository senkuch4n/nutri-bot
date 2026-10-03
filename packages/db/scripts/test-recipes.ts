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
import { processImportPage, processRecipePhoto } from "../media/recipe-photo";
import { extractRecipesFromPages } from "@nutri-bot/core/recipe-import";
import {
  chooseImportCandidateAsPhoto,
  deleteUnreviewedDrafts,
  getImportImageBytes,
  listDraftQueue,
  upsertImportedDraft,
} from "../domain/recipeImport";
import { exportPublishedRecipes, importRecipeBundle } from "../domain/recipeTransfer";
import { F1_PAGE } from "../../core/src/recipe-import/__fixtures__/synthetic";
import { updateRecipe } from "../domain/recipes";

const TEST_JID = "5490000018001@s.whatsapp.net";
const TEST_PHONE = "5490000018001";

const created = {
  recipeId: null as string | null,
  patientId: null as string | null,
  planId: null as string | null,
  draftIds: [] as string[],
};

function step(n: number, text: string) {
  console.log(`  ✓ ${n}. ${text}`);
}

async function cleanup() {
  if (created.planId) await prisma.nutritionPlan.delete({ where: { id: created.planId } });
  if (created.patientId) await prisma.patient.delete({ where: { id: created.patientId } });
  if (created.recipeId) await prisma.recipe.delete({ where: { id: created.recipeId } });
  for (const id of created.draftIds) await prisma.recipe.deleteMany({ where: { id } });
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

  // 9 (018a-2). Carga asistida con un borrador SINTÉTICO (fixture de core, receta inventada) y una
  // importKey propia de la prueba, así no choca con ningún borrador real.
  const base = extractRecipesFromPages([F1_PAGE], { file: "Prueba HU-018a-2.pdf" }).drafts[0]!;
  const draft = { ...base, importKey: `prueba-hu-018a-2:${Date.now()}:bolitas` };
  const pagePng = await sharp({ create: { width: 600, height: 840, channels: 3, background: { r: 250, g: 250, b: 245 } } }).png().toBuffer();
  const pageImg = await processImportPage(pagePng);
  const images = [
    { kind: "PAGE" as const, order: 0, data: pageImg.data, thumbData: null, width: pageImg.width, height: pageImg.height },
    { kind: "CANDIDATE" as const, order: 0, data: processed.data, thumbData: processed.thumbData, width: processed.width, height: processed.height },
  ];
  const c1 = await upsertImportedDraft(draft, images);
  created.draftIds.push(c1.id);
  assert.equal(c1.outcome, "created");
  const d1 = await getRecipe(c1.id);
  assert.equal(d1?.status, "DRAFT");
  assert.equal(d1?.origin, "IMPORT");
  assert.ok(d1?.ingredients.every((i) => i.food === null), "el parser no elige alimentos");
  assert.deepEqual(d1?.ingredients.map((i) => i.grams), draft.ingredients.map((i) => (i.noQuantity ? null : i.grams)));
  assert.ok(d1?.import?.pageImageId && d1.import.candidateIds.length === 1);
  assert.equal((await getImportImageBytes(d1.import.pageImageId, "thumb"))?.mimeType, "image/webp");
  assert.ok((await listDraftQueue({ file: "Prueba HU-018a-2.pdf" })).some((q) => q.id === c1.id));
  const again = await upsertImportedDraft(draft, null);
  assert.deepEqual(again, { id: c1.id, outcome: "updated" });
  assert.equal((await getRecipe(c1.id))?.import?.candidateIds.length, 1, "images null conserva las imágenes");
  step(9, "upsertImportedDraft: created → updated (sin alimentos, gramos del texto, imágenes)");

  // 10. Revisado (updateRecipe sobre DRAFT marca reviewedAt) → la extracción ya no lo pisa.
  await updateRecipe(c1.id, {
    name: "Bolitas de mijo (revisada)",
    type: "MAIN_DISH",
    moments: ["LUNCH"],
    tags: [],
    yieldPortions: 8,
    portionHousehold: "3 bolitas",
    portionGrams: null,
    preparation: null,
    tips: null,
    sourceName: "Prueba",
    published: null,
    ingredients: [{ foodId: a.id, label: null, grams: 200, noQuantity: false, household: null, rawText: "Mijo 200g" }],
  });
  assert.equal((await upsertImportedDraft(draft, null)).outcome, "skipped-reviewed");
  assert.equal((await getRecipe(c1.id))?.name, "Bolitas de mijo (revisada)");
  assert.equal(await deleteUnreviewedDrafts([c1.id]), 0, "un borrador revisado no se deshace");
  const photo = await chooseImportCandidateAsPhoto(c1.id, d1.import.candidateIds[0]!, "Foto: prueba");
  assert.equal((await getRecipe(c1.id))?.photo?.id, photo.photoId);
  step(10, "revisado → skipped-reviewed; undo no lo borra; la candidata pasa a foto");

  // 11. Deshacer: un borrador nuevo sin revisar se borra por id.
  const c2 = await upsertImportedDraft({ ...draft, importKey: `${draft.importKey}:2` }, null);
  created.draftIds.push(c2.id);
  assert.equal(c2.outcome, "created");
  assert.equal(await deleteUnreviewedDrafts([c2.id]), 1);
  assert.equal(await prisma.recipe.count({ where: { id: c2.id } }), 0);
  step(11, "deleteUnreviewedDrafts borra solo el id sin revisar");

  // 12. Bundle en seco contra esta base: la receta publicada de la prueba no se escribe.
  const before = await prisma.recipe.count();
  const bundle = await exportPublishedRecipes({ ids: [id] });
  assert.equal(bundle.recipes.length, 1);
  const outcomes = await importRecipeBundle(bundle, { dryRun: true });
  assert.equal(outcomes.length, 1);
  assert.equal(await prisma.recipe.count(), before, "en seco no escribe");
  step(12, `export → import en seco: ${outcomes[0]!.result}, sin escribir`);
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
      const drafts = created.draftIds.length > 0 ? await prisma.recipe.count({ where: { id: { in: created.draftIds } } }) : 0;
      assert.equal(drafts, 0, "los borradores de prueba no se borraron");
      console.log("  ✓ limpieza por id (plan, paciente, receta y borradores de prueba)");
    } catch (err) {
      failed = true;
      console.error("FALLA en la limpieza:", err);
    }
    await prisma.$disconnect();
    if (failed) process.exit(1);
    console.log("OK");
  });
