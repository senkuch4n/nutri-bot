"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@nutri-bot/db";
import {
  listFoods,
  addMeal,
  addMealItem,
  deleteMeal,
  getPlan,
  getLatestFormulaMeasurements,
} from "@nutri-bot/db/domain";
import {
  activityLevelOption,
  buildAiFoodCatalog,
  computeAgeYears,
  nutritionGoalLabel,
  selectAiCatalogFoods,
  sexLabel,
} from "@nutri-bot/core";
import { deepseekClient, DEEPSEEK_MODEL } from "@/lib/deepseek";
import { getProfessional } from "@/lib/professional";

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
              ref: z.number().int().positive(),
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
  // HU-018b: el plan nuevo trae comidas por defecto vacías; la IA corre si no hay ningún ítem.
  if (plan.meals.some((meal) => meal.items.length > 0)) {
    return {
      ok: false,
      error: "Este plan ya tiene comidas cargadas. Generá la propuesta en un plan vacío.",
    };
  }

  const [pro, p, clinicalRecord, m, foods] = await Promise.all([
    getProfessional(),
    prisma.patient.findUnique({
      where: { id: patientId },
      select: { birthDate: true, sex: true, activityLevel: true, nutritionGoal: true },
    }),
    prisma.clinicalRecord.findUnique({ where: { patientId } }),
    getLatestFormulaMeasurements(patientId),
    listFoods({ activeOnly: true, source: "SARA2" }),
  ]);

  if (foods.length === 0) {
    return { ok: false, error: "No hay alimentos SARA 2 disponibles. Cargá la base SARA 2 antes de generar un plan." };
  }

  // Formato compacto "ref|nombre|grupo|kcal" (HU-005, D10): con ~1000 alimentos el JSON con ids
  // no entra razonablemente en el pedido. La IA responde con `ref`; acá se traduce al id.
  const catalog = buildAiFoodCatalog(
    selectAiCatalogFoods(foods).map((f) => ({ id: f.id, name: f.name, group: f.group, kcalPer100: Number(f.kcalPer100) })),
  );

  const act = activityLevelOption(p?.activityLevel ?? null);
  const paciente = {
    objetivo: clinicalRecord?.goals ?? null,
    objetivo_nutricional: nutritionGoalLabel(p?.nutritionGoal ?? null),
    sexo: sexLabel(p?.sex ?? null),
    edad_anios: p?.birthDate ? computeAgeYears(p.birthDate, new Date(), pro.timezone) : null,
    actividad_fisica: act ? `${act.label}: ${act.description}` : null,
    factor_actividad: act?.factor ?? null,
    antecedentes: clinicalRecord?.background ?? null,
    peso_kg: m.weightKg?.value ?? null,
    talla_cm: m.heightCm?.value ?? null,
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
            "la lista `alimentos` que te paso, referenciándolos por su número `ref` EXACTO (la primera " +
            "columna de cada línea de `alimentos`) — nunca inventes alimentos ni refs que no estén en la lista. Las cantidades van en gramos. Organizá el plan " +
            "en 3 a 5 comidas (por ejemplo Desayuno, Almuerzo, Merienda, Cena). Respondé ÚNICAMENTE un " +
            'JSON con esta forma exacta, sin texto adicional ni explicaciones: {"meals":[{"name":string,' +
            '"items":[{"ref":number,"quantityGrams":number,"note"?:string}]}]}',
        },
        {
          role: "user",
          content: JSON.stringify({
            paciente,
            formato_alimentos: "ref|nombre|grupo|kcal cada 100 g",
            alimentos: catalog.text,
          }),
        },
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

  // ref inexistente → el ítem se descarta (igual que antes con ids inválidos).
  const proposal = result.data.meals.flatMap((meal) => {
    const validItems = meal.items.flatMap((item) => {
      const foodId = catalog.idsByRef[item.ref - 1];
      return foodId ? [{ ...item, foodId }] : [];
    });
    return validItems.length > 0 ? [{ name: meal.name, items: validItems }] : [];
  });

  if (proposal.length === 0) {
    return { ok: false, error: "La IA no propuso alimentos válidos. Probá de nuevo." };
  }

  // HU-018b (D2): recién con la propuesta validada se reemplazan las comidas vacías del plan
  // (las por defecto), así un error de la IA no deja el plan sin comidas.
  for (const meal of plan.meals) await deleteMeal(meal.id);

  let mealOrder = 0;
  for (const meal of proposal) {
    // La propuesta se carga como comidas "Igual todos los días", como antes de la HU-018b.
    const createdMeal = await addMeal(planId, { name: meal.name, order: mealOrder++, mode: "EVERY_DAY" });
    let itemOrder = 0;
    for (const item of meal.items) {
      await addMealItem(createdMeal.id, {
        foodId: item.foodId,
        quantityGrams: item.quantityGrams,
        notes: item.note || null,
        order: itemOrder++,
        weekday: null,
      });
    }
  }

  revalidatePath(`/pacientes/${patientId}/planes/${planId}`);
  return { ok: true };
}
