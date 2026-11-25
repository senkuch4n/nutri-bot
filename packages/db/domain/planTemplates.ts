import { RECIPE_ITEM_SELECT } from "./recipes";
import { prisma, type MealMode, type Prisma, type Weekday } from "../index";
import { FOOD_REFERENCE_UNAVAILABLE, unavailableFoodReferences } from "./foodReferenceOwnership";
import {
  assertWeekdayMatchesMeal, createDefaultWeeklyMeals, resolveNewMealMode, templateMealScope,
  type TemplateMealScope,
} from "./weeklyMenu";

const templateMealInclude = {
  orderBy: { order: "asc" as const },
  include: {
    items: {
      orderBy: { order: "asc" as const },
      // HU-018c: el ítem de receta trae su receta (macros, micronutrientes, porción, fuente y foto).
      include: { food: true, recipe: { select: RECIPE_ITEM_SELECT } },
    },
  },
};

/** HU-020: borradores primero (orden del enum: DRAFT < PUBLISHED). `status` filtra (la ficha usa PUBLISHED). */
export function listTemplates(params?: { status?: "DRAFT" | "PUBLISHED"; tenantId?: string }) {
  const { status, tenantId } = params ?? {};
  return prisma.planTemplate.findMany({
    ...(status || tenantId !== undefined ? { where: { ...(status && { status }), ...templateOwner(tenantId) } } : {}),
    orderBy: [{ status: "asc" }, { title: "asc" }],
    select: { id: true, title: true, notes: true, status: true, origin: true, reviewedAt: true },
  });
}

function templateOwner(tenantId?: string) {
  return tenantId === undefined ? {} : { tenantId };
}

export function getTemplate(id: string, tenantId?: string) {
  return prisma.planTemplate.findUnique({
    where: { id, ...templateOwner(tenantId) },
    include: { meals: templateMealInclude, sections: { orderBy: { order: "asc" } } },
  });
}

/** HU-020 (T13): un borrador no se aplica a una paciente. */
export class TemplateNotPublishedError extends Error {
  constructor(templateId: string) {
    super(`La plantilla ${templateId} es un borrador`);
    this.name = "TemplateNotPublishedError";
  }
}

/** HU-018b (12-D4): la plantilla nueva trae las mismas comidas por defecto que un plan nuevo. */
export function createTemplate(data: { title: string; notes?: string | null }, tenantId?: string) {
  return prisma.$transaction(async (tx) => {
    const template = await tx.planTemplate.create({ data: { ...data, ...templateOwner(tenantId) } });
    await createDefaultWeeklyMeals(tx, "template", template.id);
    return template;
  });
}

export function updateTemplate(id: string, data: Partial<{ title: string; notes: string | null }>, tenantId?: string) {
  return prisma.planTemplate.update({ where: { id, ...templateOwner(tenantId) }, data });
}

export function deleteTemplate(id: string, tenantId?: string) {
  return prisma.planTemplate.delete({ where: { id, ...templateOwner(tenantId) } });
}

/** HU-018b: mismo default de `mode` que addMeal (PER_DAY si la plantilla ya es semanal). */
/** HU-025 (025b-2 M10): el tenant es obligatorio por tipo (antes, opcional para scripts legacy). */
export async function addTemplateMeal(
  templateId: string,
  data: { name: string; order: number; mode?: MealMode; isOptions?: boolean },
  tenantId: string,
) {
  const { mode, isOptions } = await resolveNewMealMode("template", templateId, data, tenantId);
  const meal = { name: data.name, order: data.order, mode, isOptions };
  // Nested creation enforces ownership on the write, not just on the ordering read.
  return prisma.planTemplate.update({
    where: { id: templateId, tenantId }, data: { meals: { create: meal } }, select: { id: true },
  });
}

export function updateTemplateMeal(mealId: string, data: Partial<{ name: string; order: number }>) {
  return prisma.templateMeal.update({ where: { id: mealId }, data });
}

export function getTemplateMeal(mealId: string, scope: TemplateMealScope) {
  return prisma.templateMeal.findUnique({ where: { id: mealId, ...templateMealScope(scope) }, select: { id: true } });
}

export function deleteTemplateMeal(mealId: string, scope?: TemplateMealScope) {
  return prisma.templateMeal.delete({ where: { id: mealId, ...(scope && templateMealScope(scope)) } });
}

type TemplateItemData = {
  foodId?: string | null;
  customLabel?: string | null;
  quantityGrams?: number | null;
  notes?: string | null;
  order: number;
  /** HU-018b. Default null (todos los días). Se valida con assertWeekdayMatchesMeal. */
  weekday?: Weekday | null;
  /** HU-018d: medida casera (copias de resolveMeasureItem). Las 4 juntas o ninguna. */
  measureQty?: number | string | null;
  measureName?: string | null;
  measurePlural?: string | null;
  measureGrams?: number | string | null;
};

/** HU-025 (025b-2 M10): el alcance (plantilla + tenant) es obligatorio por tipo. */
export async function addTemplateMealItem(mealId: string, data: TemplateItemData, scope: TemplateMealScope) {
  const weekday = data.weekday ?? null;
  await assertWeekdayMatchesMeal("template", mealId, weekday, scope);
  return prisma.$transaction(async (tx) => {
    if (data.foodId != null && (await unavailableFoodReferences(tx, scope.tenantId, [data.foodId])).size > 0) {
      throw new Error(FOOD_REFERENCE_UNAVAILABLE);
    }
    return tx.templateMeal.update({
      where: { id: mealId, ...templateMealScope(scope) },
      data: { items: { create: { ...data, weekday } } }, select: { id: true },
    });
  });
}

export function updateTemplateMealItem(mealId: string, data: Partial<Omit<TemplateItemData, "weekday">>) {
  return prisma.templateMealItem.update({ where: { id: mealId }, data });
}

export function deleteTemplateMealItem(itemId: string, scope?: TemplateMealScope) {
  return prisma.templateMealItem.delete({ where: { id: itemId, ...(scope && { meal: templateMealScope(scope) }) } });
}

export class TemplateApplicationUnavailableError extends Error {
  constructor() {
    super("Plantilla no encontrada");
    this.name = "TemplateApplicationUnavailableError";
  }
}

export class TemplateContainsHistoricalFoodError extends Error {
  constructor() {
    super("Esta plantilla contiene alimentos PROPIO históricos. Para crear un plan nuevo, usá una plantilla con alimentos SARA 2.");
    this.name = "TemplateContainsHistoricalFoodError";
  }
}

const templateCopyInclude = {
  meals: {
    orderBy: templateMealInclude.orderBy,
    include: {
      items: {
        orderBy: templateMealInclude.include.items.orderBy,
        include: { food: { select: { source: true } } },
      },
    },
  },
  sections: { orderBy: { order: "asc" as const } },
} satisfies Prisma.PlanTemplateInclude;

type TemplateCopy = Prisma.PlanTemplateGetPayload<{ include: typeof templateCopyInclude }>;

/** HU-025b-1: sin la sobrecarga sin tenant. Paciente y plantilla tienen que ser del consultorio. */
export async function applyTemplateToPatient(templateId: string, patientId: string, tenantId: string): Promise<{ id: string }> {
  return prisma.$transaction(async (tx) => {
    const patient = await tx.patient.findUnique({ where: { id: patientId, tenantId }, select: { id: true } });
    if (!patient) throw new TemplateApplicationUnavailableError();
    const template = await tx.planTemplate.findUnique({ where: { id: templateId, tenantId }, include: templateCopyInclude });
    if (!template) throw new TemplateApplicationUnavailableError();
    if (template.status === "DRAFT") throw new TemplateNotPublishedError(templateId);

    const items = template.meals.flatMap((meal) => meal.items);
    if (items.some((item) => item.food && item.food.source !== "SARA2")) throw new TemplateContainsHistoricalFoodError();
    if (items.some((item) => item.foodId !== null && !item.food)) throw new TemplateApplicationUnavailableError();
    const recipeIds = [...new Set(items.flatMap((item) => item.recipeId ? [item.recipeId] : []))];
    // Don't hydrate recipe data or create a new link to another tenant's recipe.
    if (recipeIds.length && await tx.recipe.count({ where: { id: { in: recipeIds }, tenantId } }) !== recipeIds.length) {
      throw new TemplateApplicationUnavailableError();
    }
    // The composite patient FK enforces this ownership at write time too.
    return tx.nutritionPlan.create({ data: templatePlanData(template, patientId, tenantId), select: { id: true } });
  }, { isolationLevel: "Serializable" });
}

function templatePlanData(template: TemplateCopy, patientId: string, tenantId?: string): Prisma.NutritionPlanUncheckedCreateInput {
  return {
    patientId,
    ...templateOwner(tenantId),
    title: template.title,
    notes: template.notes,
    status: "DRAFT",
    meals: {
      create: template.meals.map((meal) => ({
        name: meal.name,
        order: meal.order,
        mode: meal.mode,
        isOptions: meal.isOptions,
        items: {
          create: meal.items.map((item) => ({
            foodId: item.foodId,
            customLabel: item.customLabel,
            quantityGrams: item.quantityGrams,
            notes: item.notes,
            order: item.order,
            weekday: item.weekday,
            // HU-018c: las recetas se copian con sus porciones.
            recipeId: item.recipeId,
            portions: item.portions,
            // HU-018d: la medida casera (copia) viaja con el ítem.
            measureQty: item.measureQty,
            measureName: item.measureName,
            measurePlural: item.measurePlural,
            measureGrams: item.measureGrams,
          })),
        },
      })),
    },
    // HU-020 (D9): los textos del plan se copian con su orden.
    sections: {
      create: (template.sections ?? []).map((section) => ({
        title: section.title,
        body: section.body,
        order: section.order,
      })),
    },
  };
}
