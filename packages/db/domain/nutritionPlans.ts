import { RECIPE_ITEM_SELECT } from "./recipes";
import { prisma, type MealMode, type PlanStatus, type Weekday } from "../index";
import { assertWeekdayMatchesMeal, createDefaultWeeklyMeals, resolveNewMealMode } from "./weeklyMenu";

const mealInclude = {
  orderBy: { order: "asc" as const },
  include: {
    items: {
      orderBy: { order: "asc" as const },
      // HU-018c: el ítem de receta trae su receta (macros, micronutrientes, porción, fuente y foto).
      include: { food: true, recipe: { select: RECIPE_ITEM_SELECT } },
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

/** HU-018b: crea el plan DRAFT con las comidas por defecto (DEFAULT_WEEKLY_MEALS), en una transacción. */
export function createPlan(patientId: string, data: { title: string; notes?: string | null }) {
  return prisma.$transaction(async (tx) => {
    const plan = await tx.nutritionPlan.create({ data: { patientId, ...data, status: "DRAFT" } });
    await createDefaultWeeklyMeals(tx, "plan", plan.id);
    return plan;
  });
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

/**
 * HU-018b: `mode` por defecto PER_DAY si el plan ya tiene alguna comida PER_DAY; si no, EVERY_DAY
 * (así un plan migrado no se vuelve semanal sin querer). isOptions solo con EVERY_DAY.
 */
export async function addMeal(
  planId: string,
  data: { name: string; order: number; mode?: MealMode; isOptions?: boolean },
) {
  const { mode, isOptions } = await resolveNewMealMode("plan", planId, data);
  return prisma.planMeal.create({ data: { planId, name: data.name, order: data.order, mode, isOptions } });
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
  /** HU-018b. Default null (todos los días). Se valida con assertWeekdayMatchesMeal. */
  weekday?: Weekday | null;
  /** HU-018d: medida casera (copias de resolveMeasureItem). Las 4 juntas o ninguna. */
  measureQty?: number | string | null;
  measureName?: string | null;
  measurePlural?: string | null;
  measureGrams?: number | string | null;
};

export async function addMealItem(mealId: string, data: MealItemData) {
  const weekday = data.weekday ?? null;
  await assertWeekdayMatchesMeal("plan", mealId, weekday);
  return prisma.planMealItem.create({ data: { mealId, ...data, weekday } });
}

export function updateMealItem(
  itemId: string,
  data: Partial<Omit<MealItemData, "order" | "weekday">> & Partial<Pick<MealItemData, "order">>,
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

// ─── Objetivo del plan (HU-018b, D7) ─────────────────────────────────────────────

export interface PlanTarget {
  /** prescribedVctKcal */
  kcal: number;
  /** proteinG */
  protein: number;
  /** carbG */
  carbs: number;
  /** fatG */
  fat: number;
  consultationId: string;
  consultedAt: Date;
  /** PLAN_CONSULTATION = de una consulta que indicó este plan; LATEST = la más reciente del paciente. */
  source: "PLAN_CONSULTATION" | "LATEST";
}

const prescriptionOrder = [
  { consultation: { consultedAt: "desc" as const } },
  { consultation: { createdAt: "desc" as const } },
];
const prescriptionSelect = {
  prescribedVctKcal: true,
  proteinG: true,
  carbG: true,
  fatG: true,
  consultation: { select: { id: true, consultedAt: true } },
} as const;

/**
 * Prescripción de referencia del plan (D7): entre las consultas con planId = plan.id que tengan
 * prescripción, la de consultedAt más reciente (desempate createdAt desc). Si no hay, la
 * prescripción más reciente del paciente (mismo orden que listLatestPrescriptions). Si no hay
 * ninguna, null.
 */
export async function getPlanTarget(planId: string): Promise<PlanTarget | null> {
  const plan = await prisma.nutritionPlan.findUnique({ where: { id: planId }, select: { patientId: true } });
  if (!plan) return null;
  const fromPlan = await prisma.nutritionPrescription.findFirst({
    where: { consultation: { planId } },
    orderBy: prescriptionOrder,
    select: prescriptionSelect,
  });
  const found = fromPlan ?? await prisma.nutritionPrescription.findFirst({
    where: { consultation: { patientId: plan.patientId } },
    orderBy: prescriptionOrder,
    select: prescriptionSelect,
  });
  if (!found) return null;
  return {
    kcal: found.prescribedVctKcal,
    protein: found.proteinG,
    carbs: found.carbG,
    fat: found.fatG,
    consultationId: found.consultation.id,
    consultedAt: found.consultation.consultedAt,
    source: fromPlan ? "PLAN_CONSULTATION" : "LATEST",
  };
}

/** La consulta más reciente con planId = plan.id, o null (link "Calculá el requerimiento…"). */
export async function getPlanConsultationId(planId: string): Promise<string | null> {
  const consultation = await prisma.consultation.findFirst({
    where: { planId },
    orderBy: [{ consultedAt: "desc" }, { createdAt: "desc" }],
    select: { id: true },
  });
  return consultation?.id ?? null;
}
