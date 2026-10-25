/**
 * HU-020 (SDD 5.7): plantillas importadas de PDF (borradores) y su revisión desde el panel.
 * Ninguna función toca una plantilla PUBLISHED ni un borrador ya revisado al reimportar, y nada borra
 * por un filtro amplio: el deshacer borra solo los ids de su corrida que siguen sin revisar.
 */
import { normalizePortions, parseTemplateHints, type TemplateImportHint } from "@nutri-bot/core";
import type { PlanImportDraft, PlanImportItem, RecipeMatchCandidate } from "@nutri-bot/core/plan-import";
import { Prisma, prisma, type Weekday } from "../index";
import { appendToSection } from "./planSections";
import { MealWeekdayMismatchError, RecipeNotAvailableError } from "./weeklyMenu";

export type UpsertTemplateOutcome = "created" | "updated" | "skipped-reviewed" | "skipped-published";

/** Publicar con líneas "Texto sin ubicar" pendientes. */
export class TemplateNotPublishableError extends Error {
  unplaced: number;
  constructor(unplaced: number) {
    super(`Quedan ${unplaced} líneas sin ubicar`);
    this.name = "TemplateNotPublishableError";
    this.unplaced = unplaced;
  }
}

/** El aviso no existe, la plantilla no es un borrador, o el ítem no es de esa plantilla. */
export class TemplateHintNotFoundError extends Error {
  constructor(message = "El aviso ya no está.") {
    super(message);
    this.name = "TemplateHintNotFoundError";
  }
}

/** Recetas PUBLISHED para el parser (id, name). */
export async function listRecipesForPlanMatching(): Promise<RecipeMatchCandidate[]> {
  return prisma.recipe.findMany({
    where: { status: "PUBLISHED" },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
}

/** Datos de un ítem importado: nunca alimento, gramos ni medida casera. */
function itemData(item: PlanImportItem, order: number) {
  const base = {
    order,
    foodId: null,
    quantityGrams: null,
    measureQty: null,
    measureName: null,
    measurePlural: null,
    measureGrams: null,
  };
  return item.kind === "TEXT"
    ? { ...base, customLabel: item.label, notes: item.notes, weekday: item.weekday, recipeId: null, portions: null }
    : { ...base, customLabel: null, notes: null, weekday: null, recipeId: item.recipeId, portions: item.portions };
}

/** Comidas para un create anidado + cómo encontrar cada ref después (comida, día, orden). */
function mealsCreate(draft: PlanImportDraft) {
  const refs: { ref: string; mealOrder: number; weekday: Weekday | null; order: number }[] = [];
  const create = draft.meals.map((meal, mealOrder) => {
    const counters = new Map<string, number>();
    return {
      name: meal.name,
      order: mealOrder,
      mode: meal.mode,
      isOptions: meal.isOptions,
      items: {
        create: meal.items.map((item) => {
          const dayKey = item.weekday ?? "-";
          const order = counters.get(dayKey) ?? 0;
          counters.set(dayKey, order + 1);
          refs.push({ ref: item.ref, mealOrder, weekday: item.weekday, order });
          return itemData(item, order);
        }),
      },
    };
  });
  return { create, refs };
}

const createdInclude = {
  meals: { select: { order: true, items: { select: { id: true, weekday: true, order: true } } } },
} as const;

type CreatedMeals = { meals: { order: number; items: { id: string; weekday: Weekday | null; order: number }[] }[] };

/** A cada RECIPE_SUGGESTION le agrega el id real del ítem que se creó con su itemRef. */
function resolveHintItems(
  hints: readonly TemplateImportHint[],
  refs: ReturnType<typeof mealsCreate>["refs"],
  created: CreatedMeals,
): TemplateImportHint[] {
  const idByRef = new Map<string, string>();
  for (const r of refs) {
    const meal = created.meals.find((m) => m.order === r.mealOrder);
    const item = meal?.items.find((i) => i.weekday === r.weekday && i.order === r.order);
    if (item) idByRef.set(r.ref, item.id);
  }
  return hints.map((h) => {
    if (h.kind !== "RECIPE_SUGGESTION") return h;
    const itemId = idByRef.get(h.itemRef);
    return itemId ? { ...h, itemId } : h;
  });
}

const sectionsCreate = (draft: PlanImportDraft) =>
  draft.sections.map((s, order) => ({ title: s.title, body: s.body, order }));

const asJson = (hints: readonly TemplateImportHint[]) => hints as unknown as Prisma.InputJsonValue;

/**
 * Por importKey. No existe → crea DRAFT + IMPORT con comidas, ítems, secciones e importHints (con
 * itemId en cada RECIPE_SUGGESTION), en una transacción. PUBLISHED → "skipped-published". DRAFT con
 * reviewedAt → "skipped-reviewed". DRAFT sin revisar → se pisa (updateMany con guarda + recrear).
 */
export async function upsertImportedTemplate(
  draft: PlanImportDraft,
): Promise<{ id: string; outcome: UpsertTemplateOutcome }> {
  const existing = await prisma.planTemplate.findUnique({
    where: { importKey: draft.importKey },
    select: { id: true, status: true, reviewedAt: true },
  });
  if (existing?.status === "PUBLISHED") return { id: existing.id, outcome: "skipped-published" };
  if (existing && existing.reviewedAt !== null) return { id: existing.id, outcome: "skipped-reviewed" };

  const { create: meals, refs } = mealsCreate(draft);

  if (!existing) {
    return prisma.$transaction(async (tx) => {
      const created = (await tx.planTemplate.create({
        data: {
          title: draft.title,
          status: "DRAFT",
          origin: "IMPORT",
          importKey: draft.importKey,
          importHints: asJson(draft.hints),
          meals: { create: meals },
          sections: { create: sectionsCreate(draft) },
        },
        select: { id: true, ...createdInclude },
      })) as { id: string } & CreatedMeals;
      await tx.planTemplate.update({
        where: { id: created.id },
        data: { importHints: asJson(resolveHintItems(draft.hints, refs, created)) },
      });
      return { id: created.id, outcome: "created" as const };
    });
  }

  const id = existing.id;
  return prisma.$transaction(async (tx) => {
    const guard = await tx.planTemplate.updateMany({
      where: { id, status: "DRAFT", reviewedAt: null },
      data: { title: draft.title, importHints: asJson(draft.hints) },
    });
    if (guard.count === 0) return { id, outcome: "skipped-reviewed" as const };
    await tx.templateMeal.deleteMany({ where: { templateId: id } });
    await tx.planTemplateSection.deleteMany({ where: { templateId: id } });
    const created = (await tx.planTemplate.update({
      where: { id },
      data: { meals: { create: meals }, sections: { create: sectionsCreate(draft) } },
      select: { id: true, ...createdInclude },
    })) as { id: string } & CreatedMeals;
    await tx.planTemplate.update({
      where: { id },
      data: { importHints: asJson(resolveHintItems(draft.hints, refs, created)) },
    });
    return { id, outcome: "updated" as const };
  });
}

/** Deshacer una corrida: borra SOLO los ids dados que sigan DRAFT + IMPORT + reviewedAt null. */
export async function deleteUnreviewedTemplateDrafts(ids: readonly string[]): Promise<number> {
  const unique = [...new Set(ids.filter((id) => typeof id === "string" && id !== ""))];
  if (unique.length === 0) return 0;
  const res = await prisma.planTemplate.deleteMany({
    where: { id: { in: unique }, status: "DRAFT", origin: "IMPORT", reviewedAt: null },
  });
  return res.count;
}

type Db = Prisma.TransactionClient | typeof prisma;

async function markReviewedIn(db: Db, templateId: string): Promise<void> {
  await db.planTemplate.updateMany({
    where: { id: templateId, status: "DRAFT", origin: "IMPORT", reviewedAt: null },
    data: { reviewedAt: new Date() },
  });
}

/** T10. No-op salvo DRAFT + IMPORT + reviewedAt null. */
export async function markTemplateReviewed(templateId: string): Promise<void> {
  await markReviewedIn(prisma, templateId);
}

/** T12. Exige 0 avisos UNPLACED. */
export async function publishTemplate(templateId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const t = await tx.planTemplate.findUnique({
      where: { id: templateId },
      select: { status: true, importHints: true, reviewedAt: true },
    });
    if (!t) throw new TemplateHintNotFoundError("La plantilla no existe.");
    if (t.status === "PUBLISHED") return;
    const unplaced = parseTemplateHints(t.importHints).filter((h) => h.kind === "UNPLACED").length;
    if (unplaced > 0) throw new TemplateNotPublishableError(unplaced);
    await tx.planTemplate.update({
      where: { id: templateId },
      data: { status: "PUBLISHED", importHints: Prisma.DbNull, reviewedAt: t.reviewedAt ?? new Date() },
    });
  });
}

/** Lee los avisos de un borrador dentro de la transacción; si no es borrador o no está el aviso, lanza. */
async function loadDraftHint(tx: Prisma.TransactionClient, templateId: string, hintId: string) {
  const t = await tx.planTemplate.findUnique({ where: { id: templateId }, select: { status: true, importHints: true } });
  if (!t || t.status !== "DRAFT") throw new TemplateHintNotFoundError();
  const hints = parseTemplateHints(t.importHints);
  const hint = hints.find((h) => h.id === hintId);
  if (!hint) throw new TemplateHintNotFoundError();
  return { hints, hint };
}

async function saveWithout(tx: Prisma.TransactionClient, templateId: string, hints: TemplateImportHint[], hintId: string) {
  await tx.planTemplate.update({
    where: { id: templateId },
    data: { importHints: asJson(hints.filter((h) => h.id !== hintId)) },
  });
  await markReviewedIn(tx, templateId);
}

/** Saca el aviso (cualquier tipo; para RECIPE_SUGGESTION es "Dejar como texto"). */
export async function dismissTemplateHint(templateId: string, hintId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const { hints } = await loadDraftHint(tx, templateId, hintId);
    await saveWithout(tx, templateId, hints, hintId);
  });
}

/** T19. "Mover a…" de un aviso UNPLACED: a una comida (ítem de texto) o a un texto del plan. */
export async function resolveUnplacedHint(
  templateId: string,
  hintId: string,
  target: { kind: "meal"; mealId: string; weekday: Weekday | null } | { kind: "section"; sectionId: string | null },
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const { hints, hint } = await loadDraftHint(tx, templateId, hintId);
    if (hint.kind !== "UNPLACED") throw new TemplateHintNotFoundError();
    if (target.kind === "meal") {
      const meal = await tx.templateMeal.findFirst({
        where: { id: target.mealId, templateId },
        select: { id: true, mode: true },
      });
      if (!meal) throw new TemplateHintNotFoundError("La comida no es de esta plantilla.");
      if (meal.mode === "EVERY_DAY" && target.weekday !== null) {
        throw new MealWeekdayMismatchError("Una comida igual todos los días no lleva día.");
      }
      if (meal.mode === "PER_DAY" && target.weekday === null) {
        throw new MealWeekdayMismatchError("Una comida que cambia cada día necesita el día.");
      }
      const last = await tx.templateMealItem.findFirst({
        where: { mealId: meal.id, weekday: target.weekday },
        orderBy: { order: "desc" },
        select: { order: true },
      });
      await tx.templateMealItem.create({
        data: {
          mealId: meal.id,
          customLabel: hint.text,
          weekday: target.weekday,
          order: last ? last.order + 1 : 0,
          foodId: null,
          quantityGrams: null,
          notes: null,
        },
      });
    } else {
      await appendToSection(tx, "template", templateId, target.sectionId, hint.text);
    }
    await saveWithout(tx, templateId, hints, hintId);
  });
}

/**
 * "Vincular": el ítem del aviso pasa a ser la receta con `portions` (misma comida, día y orden).
 * La receta tiene que seguir PUBLISHED. Verifica que el ítem sea de esta plantilla.
 */
export async function linkHintRecipe(templateId: string, hintId: string, portions: number): Promise<void> {
  const value = normalizePortions(portions);
  if (value === null) throw new RangeError("Las porciones van de ½ en ½, entre ½ y 4.");
  await prisma.$transaction(async (tx) => {
    const { hints, hint } = await loadDraftHint(tx, templateId, hintId);
    if (hint.kind !== "RECIPE_SUGGESTION" || !hint.itemId) throw new TemplateHintNotFoundError();
    const item = await tx.templateMealItem.findUnique({
      where: { id: hint.itemId },
      select: { id: true, meal: { select: { templateId: true } } },
    });
    if (!item || item.meal.templateId !== templateId) throw new TemplateHintNotFoundError();
    const recipe = await tx.recipe.findUnique({ where: { id: hint.recipeId }, select: { status: true } });
    if (recipe?.status !== "PUBLISHED") throw new RecipeNotAvailableError();
    await tx.templateMealItem.update({
      where: { id: item.id },
      data: {
        recipeId: hint.recipeId,
        portions: value,
        customLabel: null,
        foodId: null,
        quantityGrams: null,
        measureQty: null,
        measureName: null,
        measurePlural: null,
        measureGrams: null,
      },
    });
    await saveWithout(tx, templateId, hints, hintId);
  });
}
