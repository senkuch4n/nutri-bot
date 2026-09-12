import { prisma } from "../index";
import { getPlan } from "./nutritionPlans";

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

export function addTemplateMeal(templateId: string, data: { name: string; order: number }) {
  return prisma.templateMeal.create({ data: { templateId, ...data } });
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
};

export function addTemplateMealItem(mealId: string, data: TemplateItemData) {
  return prisma.templateMealItem.create({ data: { mealId, ...data } });
}

export function updateTemplateMealItem(mealId: string, data: Partial<TemplateItemData>) {
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
            items: {
              create: meal.items.map((item) => ({
                foodId: item.foodId,
                customLabel: item.customLabel,
                quantityGrams: item.quantityGrams,
                notes: item.notes,
                order: item.order,
              })),
            },
          })),
        },
      },
    });
  });

  return getPlan(plan.id);
}
