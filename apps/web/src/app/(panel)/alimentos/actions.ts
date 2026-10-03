"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { FOOD_GROUP_VALUES, OWN_FOOD_ISSUE_MESSAGES, validateOwnFoodMacros } from "@nutri-bot/core";
import {
  DuplicateOwnFoodNameError,
  FoodNotEditableError,
  InvalidOwnFoodError,
  applyAtwaterKcal,
  findFoodNameConflicts,
  getFood,
  setFoodActive,
  updateOwnFood,
  type OwnFoodInput,
} from "@nutri-bot/db/domain";

export type OwnFoodState = {
  ok: boolean;
  error?: string;
  /** Advertencia no bloqueante (nombre igual a un SARA 2, D12): el form muestra "Guardar igual". */
  saraDuplicate?: { id: string; name: string };
  foodId?: string;
};

/** Vacío → null; si no, número en [0, max]. */
const optionalNumber = (max: number) =>
  z.preprocess(
    (v) => (v === undefined || v === null || (typeof v === "string" && v.trim() === "") ? null : Number(v)),
    z.number().min(0).max(max).nullable(),
  );

const optionalText = (max: number) =>
  z.preprocess(
    (v) => (typeof v === "string" && v.trim() !== "" ? v.trim() : null),
    z.string().max(max).nullable(),
  );

const ownFoodSchema = z.object({
  name: z.string().trim().min(2).max(200),
  group: z.enum(FOOD_GROUP_VALUES),
  reference: optionalText(120),
  proteinPer100: optionalNumber(100),
  carbsPer100: optionalNumber(100),
  fatPer100: optionalNumber(100),
  fiberPer100: optionalNumber(100),
  alcoholPer100: optionalNumber(100),
  addedSugarPer100: optionalNumber(100),
  saturatedFatPer100: optionalNumber(100),
  sodiumMgPer100: optionalNumber(100000),
  cholesterolMgPer100: optionalNumber(10000),
  unitHint: optionalText(120),
  confirmSaraDuplicate: z.literal("1").optional(),
});

const OUT_OF_RANGE = "Revisá los datos: hay valores fuera de rango.";

type Parsed =
  | { ok: true; input: OwnFoodInput; confirmSaraDuplicate: boolean }
  | { ok: false; state: OwnFoodState };

function parseOwnFood(formData: FormData): Parsed {
  const parsed = ownFoodSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, state: { ok: false, error: OUT_OF_RANGE } };
  const d = parsed.data;
  const issues = validateOwnFoodMacros({
    protein: d.proteinPer100,
    carbs: d.carbsPer100,
    fat: d.fatPer100,
    fiber: d.fiberPer100,
    alcohol: d.alcoholPer100,
  });
  const first = issues[0];
  if (first) return { ok: false, state: { ok: false, error: OWN_FOOD_ISSUE_MESSAGES[first] } };
  return {
    ok: true,
    confirmSaraDuplicate: d.confirmSaraDuplicate === "1",
    input: {
      name: d.name,
      group: d.group,
      reference: d.reference,
      proteinPer100: d.proteinPer100 as number,
      carbsPer100: d.carbsPer100 as number,
      fatPer100: d.fatPer100 as number,
      fiberPer100: d.fiberPer100,
      alcoholPer100: d.alcoholPer100,
      sodiumMgPer100: d.sodiumMgPer100,
      addedSugarPer100: d.addedSugarPer100,
      saturatedFatPer100: d.saturatedFatPer100,
      cholesterolMgPer100: d.cholesterolMgPer100,
      unitHint: d.unitHint,
    },
  };
}

function errorState(err: unknown): OwnFoodState {
  if (err instanceof DuplicateOwnFoodNameError) return { ok: false, error: "Ya tenés un alimento propio con ese nombre." };
  if (err instanceof FoodNotEditableError) {
    return { ok: false, error: "Los alimentos de SARA 2 no se editan." };
  }
  if (err instanceof InvalidOwnFoodError) {
    const first = err.issues[0];
    return { ok: false, error: first ? OWN_FOOD_ISSUE_MESSAGES[first] : OUT_OF_RANGE };
  }
  throw err;
}

export async function createOwnFoodAction(): Promise<OwnFoodState> {
  return { ok: false, error: "La creación de alimentos propios ya no está disponible. Usá la base SARA 2." };
}

export async function updateOwnFoodAction(
  id: string,
  _prev: OwnFoodState,
  formData: FormData,
): Promise<OwnFoodState> {
  const parsed = parseOwnFood(formData);
  if (!parsed.ok) return parsed.state;
  if (!parsed.confirmSaraDuplicate) {
    const [{ own, sara }, current] = await Promise.all([findFoodNameConflicts(parsed.input.name, id), getFood(id)]);
    if (own) return { ok: false, error: "Ya tenés un alimento propio con ese nombre." };
    // Solo se advierte si cambió el nombre: un propio viejo homónimo de un SARA 2 no pregunta cada vez.
    if (sara && current?.name.trim() !== parsed.input.name) return { ok: false, saraDuplicate: sara };
  }
  try {
    await updateOwnFood(id, parsed.input);
  } catch (err) {
    return errorState(err);
  }
  revalidatePath("/alimentos");
  revalidatePath(`/alimentos/${id}`);
  return { ok: true };
}

export async function setFoodActiveAction(id: string, active: boolean): Promise<void> {
  await setFoodActive(id, active);
  revalidatePath("/alimentos");
  revalidatePath(`/alimentos/${id}`);
}

export async function applyAtwaterKcalAction(id: string): Promise<void> {
  await applyAtwaterKcal(id);
  revalidatePath("/alimentos");
  revalidatePath(`/alimentos/${id}`);
}
