import { prisma, type PlanStatus } from "../index";

const mealInclude = {
  orderBy: { order: "asc" as const },
  include: {
    items: {
      orderBy: { order: "asc" as const },
      include: { food: true },
    },
  },
};

export function listPatientPlans(patientId: string) {
  return prisma.nutritionPlan.findMany({
    where: { patientId },
    orderBy: { createdAt: "desc" },
    // HU-003: la primera consulta que indicó el plan ("Indicado en la consulta del dd/MM").
    include: {
      consultations: { select: { id: true, consultedAt: true }, orderBy: { consultedAt: "asc" }, take: 1 },
    },
  });
}

export function getPlan(planId: string) {
  return prisma.nutritionPlan.findUnique({
    where: { id: planId },
    include: { meals: mealInclude },
  });
}

export function createPlan(patientId: string, data: { title: string; notes?: string | null }) {
  return prisma.nutritionPlan.create({ data: { patientId, ...data, status: "DRAFT" } });
}

export function updatePlan(
  planId: string,
  data: Partial<{ title: string; notes: string | null; status: PlanStatus }>,
) {
  return prisma.nutritionPlan.update({ where: { id: planId }, data });
}

export function deletePlan(planId: string) {
  return prisma.nutritionPlan.delete({ where: { id: planId } });
}

export function addMeal(planId: string, data: { name: string; order: number }) {
  return prisma.planMeal.create({ data: { planId, ...data } });
}

export function updateMeal(mealId: string, data: Partial<{ name: string; order: number }>) {
  return prisma.planMeal.update({ where: { id: mealId }, data });
}

export function deleteMeal(mealId: string) {
  return prisma.planMeal.delete({ where: { id: mealId } });
}

type MealItemData = {
  foodId?: string | null;
  customLabel?: string | null;
  quantityGrams?: number | null;
  notes?: string | null;
  order: number;
};

export function addMealItem(mealId: string, data: MealItemData) {
  return prisma.planMealItem.create({ data: { mealId, ...data } });
}

export function updateMealItem(
  itemId: string,
  data: Partial<Omit<MealItemData, "order">> & Partial<Pick<MealItemData, "order">>,
) {
  return prisma.planMealItem.update({ where: { id: itemId }, data });
}

export function deleteMealItem(itemId: string) {
  return prisma.planMealItem.delete({ where: { id: itemId } });
}

export function savePlanPdf(planId: string, data: { data: Buffer; fileName: string }) {
  return prisma.nutritionPlan.update({
    where: { id: planId },
    data: { pdfData: data.data, pdfFileName: data.fileName, pdfGeneratedAt: new Date() },
  });
}

export function enqueuePlanPdfMessage(params: { planId: string; toJid: string; caption: string }) {
  return prisma.outboundMessage.create({
    data: {
      planId: params.planId,
      toJid: params.toJid,
      body: params.caption,
      kind: "PLAN_PDF",
      status: "PENDING",
    },
  });
}
