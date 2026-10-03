import { prisma, type MealMode, type Weekday } from "../index";
import { getPlan } from "./nutritionPlans";
import { assertWeekdayMatchesMeal, resolveNewMealMode } from "./weeklyMenu";

const templateMealInclude = {
  orderBy: { order: "asc" as const },
  include: {
    items: {
      orderBy: { order: "asc" as const },
      include: { food: true },
    },
  },
};

export function listTemplates() {
  return prisma.planTemplate.findMany({ orderBy: { title: "asc" } });
}

export function getTemplate(id: string) {
  return prisma.planTemplate.findUnique({ where: { id }, include: { meals: templateMealInclude } });
}

export function createTemplate(data: { title: string; notes?: string | null }) {
  return prisma.planTemplate.create({ data });
}

export function updateTemplate(id: string, data: Partial<{ title: string; notes: string | null }>) {
  return prisma.planTemplate.update({ where: { id }, data });
}

export function deleteTemplate(id: string) {
  return prisma.planTemplate.delete({ where: { id } });
}

/** HU-018b: mismo default de `mode` que addMeal (PER_DAY si la plantilla ya es semanal). */
export async function addTemplateMeal(
  templateId: string,
  data: { name: string; order: number; mode?: MealMode; isOptions?: boolean },
) {
  const { mode, isOptions } = await resolveNewMealMode("template", templateId, data);
  return prisma.templateMeal.create({ data: { templateId, name: data.name, order: data.order, mode, isOptions } });
}

export function updateTemplateMeal(mealId: string, data: Partial<{ name: string; order: number }>) {
  return prisma.templateMeal.update({ where: { id: mealId }, data });
}

export function deleteTemplateMeal(mealId: string) {
  return prisma.templateMeal.delete({ where: { id: mealId } });
}

type TemplateItemData = {
  foodId?: string | null;
  customLabel?: string | null;
  quantityGrams?: number | null;
  notes?: string | null;
  order: number;
  /** HU-018b. Default null (todos los días). Se valida con assertWeekdayMatchesMeal. */
  weekday?: Weekday | null;
};

export async function addTemplateMealItem(mealId: string, data: TemplateItemData) {
  const weekday = data.weekday ?? null;
  await assertWeekdayMatchesMeal("template", mealId, weekday);
  return prisma.templateMealItem.create({ data: { mealId, ...data, weekday } });
}

export function updateTemplateMealItem(mealId: string, data: Partial<Omit<TemplateItemData, "weekday">>) {
  return prisma.templateMealItem.update({ where: { id: mealId }, data });
}

export function deleteTemplateMealItem(itemId: string) {
  return prisma.templateMealItem.delete({ where: { id: itemId } });
}

export async function applyTemplateToPatient(templateId: string, patientId: string) {
  const template = await getTemplate(templateId);
  if (!template) throw new Error(`Plantilla no encontrada: ${templateId}`);

  const plan = await prisma.$transaction(async (tx) => {
    return tx.nutritionPlan.create({
      data: {
        patientId,
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
              })),
            },
          })),
        },
      },
    });
  });

  return getPlan(plan.id);
}
