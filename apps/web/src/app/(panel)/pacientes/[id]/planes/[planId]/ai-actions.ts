"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@nutri-bot/db";
import { listFoods, addMeal, addMealItem, getPlan } from "@nutri-bot/db/domain";
import { deepseekClient, DEEPSEEK_MODEL } from "@/lib/deepseek";

export type AiPlanState = { ok: boolean; error?: string };

const requestSchema = z.object({
  planId: z.string().min(1),
  patientId: z.string().min(1),
  instructions: z.string().trim().max(500).optional().or(z.literal("")),
});

const aiResponseSchema = z.object({
  meals: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(60),
        items: z
          .array(
            z.object({
              foodId: z.string().min(1),
              quantityGrams: z.number().positive().max(2000),
              note: z.string().trim().max(200).optional(),
            }),
          )
          .min(1)
          .max(12),
      }),
    )
    .min(1)
    .max(8),
});

export async function generateAiPlanAction(
  _prev: AiPlanState,
  formData: FormData,
): Promise<AiPlanState> {
  const parsed = requestSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: "Datos inválidos" };
  const { planId, patientId, instructions } = parsed.data;

  const plan = await getPlan(planId);
  if (!plan) return { ok: false, error: "Plan no encontrado" };
  if (plan.meals.length > 0) {
    return {
      ok: false,
      error: "Este plan ya tiene comidas cargadas. Generá la propuesta en un plan vacío.",
    };
  }

  const [clinicalRecord, latestWeightEntry, latestHeightEntry, foods] = await Promise.all([
    prisma.clinicalRecord.findUnique({ where: { patientId } }),
    prisma.evolutionEntry.findFirst({
      where: { patientId, weightKg: { not: null } },
      orderBy: { recordedAt: "desc" },
    }),
    prisma.evolutionEntry.findFirst({
      where: { patientId, heightCm: { not: null } },
      orderBy: { recordedAt: "desc" },
    }),
    listFoods({ activeOnly: true }),
  ]);

  if (foods.length === 0) {
    return { ok: false, error: "Todavía no hay alimentos cargados en la base." };
  }

  const foodCatalog = foods.map((f) => ({
    id: f.id,
    nombre: f.name,
    grupo: f.group,
    kcalPer100g: Number(f.kcalPer100),
  }));

  const paciente = {
    objetivo: clinicalRecord?.goals ?? null,
    antecedentes: clinicalRecord?.background ?? null,
    peso_kg: latestWeightEntry?.weightKg ? Number(latestWeightEntry.weightKg) : null,
    talla_cm: latestHeightEntry?.heightCm ? Number(latestHeightEntry.heightCm) : null,
    instrucciones_adicionales: instructions || null,
  };

  let raw: string | null;
  try {
    const completion = await deepseekClient().chat.completions.create({
      model: DEEPSEEK_MODEL,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "Sos un asistente de nutrición que arma un borrador de plan alimenticio para que una " +
            "nutricionista humana lo revise y ajuste antes de enviarlo. SOLO podés usar alimentos de " +
            "la lista `alimentos` que te paso, referenciándolos por su `id` EXACTO — nunca inventes " +
            "alimentos ni ids que no estén en la lista. Las cantidades van en gramos. Organizá el plan " +
            "en 3 a 5 comidas (por ejemplo Desayuno, Almuerzo, Merienda, Cena). Respondé ÚNICAMENTE un " +
            'JSON con esta forma exacta, sin texto adicional ni explicaciones: {"meals":[{"name":string,' +
            '"items":[{"foodId":string,"quantityGrams":number,"note"?:string}]}]}',
        },
        { role: "user", content: JSON.stringify({ paciente, alimentos: foodCatalog }) },
      ],
    });
    raw = completion.choices[0]?.message?.content ?? null;
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Error consultando a la IA" };
  }

  if (!raw) return { ok: false, error: "La IA no devolvió una respuesta" };

  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return { ok: false, error: "La respuesta de la IA no fue un JSON válido" };
  }

  const result = aiResponseSchema.safeParse(json);
  if (!result.success) {
    return { ok: false, error: "La respuesta de la IA no tuvo el formato esperado" };
  }

  const validFoodIds = new Set(foods.map((f) => f.id));
  let mealOrder = 0;
  for (const meal of result.data.meals) {
    const validItems = meal.items.filter((item) => validFoodIds.has(item.foodId));
    if (validItems.length === 0) continue;
    const createdMeal = await addMeal(planId, { name: meal.name, order: mealOrder++ });
    let itemOrder = 0;
    for (const item of validItems) {
      await addMealItem(createdMeal.id, {
        foodId: item.foodId,
        quantityGrams: item.quantityGrams,
        notes: item.note || null,
        order: itemOrder++,
      });
    }
  }

  if (mealOrder === 0) {
    return { ok: false, error: "La IA no propuso alimentos válidos. Probá de nuevo." };
  }

  revalidatePath(`/pacientes/${patientId}/planes/${planId}`);
  return { ok: true };
}
