"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@nutri-bot/db";

const schema = z.object({
  id: z.string().min(1),
  name: z.string().trim().max(120).optional().or(z.literal("")),
  notes: z.string().trim().max(2000).optional().or(z.literal("")),
});

export type PatientState = { ok: boolean; error?: string };

export async function updatePatientAction(
  _prev: PatientState,
  formData: FormData,
): Promise<PatientState> {
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: "Datos inválidos" };
  await prisma.patient.update({
    where: { id: parsed.data.id },
    data: { name: parsed.data.name || null, notes: parsed.data.notes || null },
  });
  revalidatePath(`/pacientes/${parsed.data.id}`);
  revalidatePath("/pacientes");
  return { ok: true };
}
