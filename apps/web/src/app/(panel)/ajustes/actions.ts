"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@nutri-bot/db";
import { validateAfterHoursConfig, validateBotAiInfo } from "@nutri-bot/core";
import { getBotAiKeyStatus } from "@/lib/bot-ai";

export type SettingsState = { ok: boolean; error?: string };

const generalSchema = z.object({
  timezone: z.string().trim().min(3),
  currency: z.string().trim().length(3).toUpperCase(),
  phone: z.string().trim().optional().or(z.literal("")),
  acceptedInsurances: z.string().trim().max(500).optional().or(z.literal("")),
  pdfAccentColor: z
    .string()
    .trim()
    .regex(/^#[0-9a-fA-F]{6}$/, "Color inválido")
    .optional()
    .or(z.literal("")),
  pdfFooterText: z.string().trim().max(300).optional().or(z.literal("")),
  // HU-007 (D1): firma del informe antropométrico.
  title: z.string().trim().max(20).optional().or(z.literal("")),
  licenseNumber: z.string().trim().max(40).optional().or(z.literal("")),
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
      phoneJid: digits ? `${digits}@s.whatsapp.net` : null,
      acceptedInsurances: parsed.data.acceptedInsurances || null,
      pdfAccentColor: parsed.data.pdfAccentColor || null,
      pdfFooterText: parsed.data.pdfFooterText || null,
      title: parsed.data.title || null,
      licenseNumber: parsed.data.licenseNumber || null,
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

const ALLOWED_LOGO_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
const MAX_LOGO_BYTES = 2 * 1024 * 1024;

export async function uploadLogoAction(
  _prev: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  const file = formData.get("logo");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "Elegí una imagen" };
  }
  if (!ALLOWED_LOGO_TYPES.has(file.type)) {
    return { ok: false, error: "Formato inválido (usá PNG, JPG o WEBP)" };
  }
  if (file.size > MAX_LOGO_BYTES) {
    return { ok: false, error: "La imagen pesa más de 2 MB" };
  }
  const buffer = Buffer.from(await file.arrayBuffer());
  await prisma.professional.update({
    where: { id: 1 },
    data: { logoData: buffer, logoMimeType: file.type },
  });
  revalidatePath("/ajustes");
  return { ok: true };
}

export async function removeLogoAction(): Promise<void> {
  await prisma.professional.update({
    where: { id: 1 },
    data: { logoData: null, logoMimeType: null },
  });
  revalidatePath("/ajustes");
}

// HU-011 (D1): franja "fuera de horario" de la opción 0 del bot.
// attendFrom = fin de la franja (afterHoursEnd); attendTo = inicio (afterHoursStart).
const afterHoursSchema = z.object({
  afterHoursEnabled: z.enum(["0", "1"]),
  attendFrom: z.string().trim(),
  attendTo: z.string().trim(),
});

export async function saveAfterHoursAction(
  _prev: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  const parsed = afterHoursSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: "Datos inválidos" };
  const { afterHoursEnabled, attendFrom, attendTo } = parsed.data;
  // Las horas se validan aunque la franja esté desactivada, para no guardar basura.
  const error = validateAfterHoursConfig({ start: attendTo, end: attendFrom });
  if (error) return { ok: false, error };
  await prisma.professional.update({
    where: { id: 1 },
    data: {
      afterHoursEnabled: afterHoursEnabled === "1",
      afterHoursStart: attendTo,
      afterHoursEnd: attendFrom,
    },
  });
  revalidatePath("/ajustes");
  return { ok: true };
}

// HU-012 (D10, D11): preguntas con IA del bot (interruptor + "Información para el asistente").
const botAiSchema = z.object({
  botAiEnabled: z.enum(["0", "1"]),
  botAiInfo: z.string(),
});

export async function saveBotAiAction(_prev: SettingsState, formData: FormData): Promise<SettingsState> {
  const parsed = botAiSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: "Datos inválidos." };
  const enabled = parsed.data.botAiEnabled === "1";
  const info = parsed.data.botAiInfo.trim();
  const infoError = validateBotAiInfo(info);
  if (infoError) return { ok: false, error: infoError };
  // Sin clave se puede apagar o guardar el texto, pero no prender.
  const { hasKey, apiKeyEnvName } = getBotAiKeyStatus();
  const current = await prisma.professional.findUnique({ where: { id: 1 }, select: { botAiEnabled: true } });
  if (enabled && !current?.botAiEnabled && !hasKey) {
    return { ok: false, error: `Para activarlo falta cargar ${apiKeyEnvName} en el servidor.` };
  }
  await prisma.professional.update({
    where: { id: 1 },
    data: { botAiEnabled: enabled, botAiInfo: info || null },
  });
  revalidatePath("/ajustes");
  return { ok: true };
}
