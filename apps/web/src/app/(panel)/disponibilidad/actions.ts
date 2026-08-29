"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@nutri-bot/db";

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Hora inválida (HH:mm)");

const ruleSchema = z
  .object({
    weekday: z.coerce.number().int().min(0).max(6),
    startTime: hhmm,
    endTime: hhmm,
  })
  .refine((d) => d.startTime < d.endTime, { message: "El inicio debe ser antes del fin" });

export type FormState = { ok: boolean; error?: string };

export async function addRuleAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = ruleSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  await prisma.availabilityRule.create({ data: parsed.data });
  revalidatePath("/disponibilidad");
  return { ok: true };
}

export async function deleteRuleAction(id: string) {
  await prisma.availabilityRule.delete({ where: { id } });
  revalidatePath("/disponibilidad");
}

const exceptionSchema = z
  .object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida"),
    type: z.enum(["BLOCKED", "CUSTOM_HOURS"]),
    startTime: z.union([hhmm, z.literal("")]).optional(),
    endTime: z.union([hhmm, z.literal("")]).optional(),
  })
  .refine((d) => d.type === "BLOCKED" || (d.startTime && d.endTime), {
    message: "Horario especial requiere hora de inicio y fin",
  })
  .refine((d) => !(d.startTime && d.endTime) || d.startTime < d.endTime, {
    message: "El inicio debe ser antes del fin",
  });

export async function addExceptionAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = exceptionSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  const { date, type, startTime, endTime } = parsed.data;
  await prisma.availabilityException.create({
    data: {
      date: new Date(`${date}T00:00:00Z`),
      type,
      startTime: type === "CUSTOM_HOURS" ? startTime || null : startTime || null,
      endTime: type === "CUSTOM_HOURS" ? endTime || null : endTime || null,
      reason: (formData.get("reason") as string)?.trim() || null,
    },
  });
  revalidatePath("/disponibilidad");
  return { ok: true };
}

export async function deleteExceptionAction(id: string) {
  await prisma.availabilityException.delete({ where: { id } });
  revalidatePath("/disponibilidad");
}
