"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@nutri-bot/db";

export type SettingsState = { ok: boolean; error?: string };

const generalSchema = z.object({
  timezone: z.string().trim().min(3),
  currency: z.string().trim().length(3).toUpperCase(),
  reminderLeadHours: z.coerce.number().int().min(1).max(168),
  phone: z.string().trim().optional().or(z.literal("")),
});

export async function saveSettingsAction(
  _prev: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  const parsed = generalSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }
  try {
    Intl.DateTimeFormat("en-US", { timeZone: parsed.data.timezone });
  } catch {
    return { ok: false, error: "Zona horaria inválida (ej: America/Argentina/Buenos_Aires)" };
  }

  const digits = (parsed.data.phone ?? "").replace(/\D/g, "");

  await prisma.professional.update({
    where: { id: 1 },
    data: {
      timezone: parsed.data.timezone,
      currency: parsed.data.currency,
      reminderLeadHours: parsed.data.reminderLeadHours,
      phoneJid: digits ? `${digits}@s.whatsapp.net` : null,
    },
  });

  revalidatePath("/ajustes");
  return { ok: true };
}

const gcalSchema = z.object({ calendarId: z.string().trim().optional().or(z.literal("")) });

export async function saveGoogleCalendarIdAction(
  _prev: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  const parsed = gcalSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: "Datos inválidos" };
  await prisma.professional.update({
    where: { id: 1 },
    data: { googleCalendarId: parsed.data.calendarId || null },
  });
  revalidatePath("/ajustes");
  return { ok: true };
}

export async function disconnectGoogleAction() {
  await prisma.professional.update({
    where: { id: 1 },
    data: { googleRefreshToken: null, googleSyncError: null },
  });
  revalidatePath("/ajustes");
}

export async function setBotPausedAction(paused: boolean) {
  await prisma.professional.update({ where: { id: 1 }, data: { botPaused: paused } });
  revalidatePath("/ajustes");
}
