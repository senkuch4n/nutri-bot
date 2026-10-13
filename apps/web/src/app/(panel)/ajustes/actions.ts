"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@nutri-bot/db";
import {
  PHONE_INPUT_TEXT,
  SETTINGS_TEXT,
  isCurrencyCode,
  logoImageSizeError,
  parsePhoneInput,
  validateAfterHoursConfig,
  validateBotAiInfo,
  validateLogoImage,
} from "@nutri-bot/core";
import { getBotAiKeyStatus } from "@/lib/bot-ai";

export type SettingsState = { ok: boolean; error?: string };

// HU-017b-4 (Q19, D19): cada grupo de Ajustes guarda SOLO sus columnas. Antes un solo form juntaba
// General, Firma y matrícula y Estilo del PDF, y guardar uno pisaba lo tipeado en los otros.

const generalSchema = z.object({
  timezone: z.string().trim().min(1, SETTINGS_TEXT.invalidTimezone),
  currency: z
    .string()
    .trim()
    .refine(isCurrencyCode, SETTINGS_TEXT.invalidCurrency)
    .transform((c) => c.toUpperCase()),
  phone: z.string().optional().default(""),
  acceptedInsurances: z.string().trim().max(500, SETTINGS_TEXT.insurancesTooLong).optional().default(""),
});

function isValidTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** General: zona horaria, moneda, "Tu WhatsApp" (con parsePhoneInput: vacío → null) y obras sociales. */
export async function saveGeneralSettingsAction(_prev: SettingsState, formData: FormData): Promise<SettingsState> {
  const parsed = generalSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? SETTINGS_TEXT.saveError };
  const { timezone, currency, phone, acceptedInsurances } = parsed.data;
  if (!isValidTimezone(timezone)) return { ok: false, error: SETTINGS_TEXT.invalidTimezone };

  let phoneJid: string | null = null;
  const phoneResult = parsePhoneInput(phone);
  if (phoneResult.ok) phoneJid = `${phoneResult.digits}@s.whatsapp.net`;
  else if (phoneResult.error === "invalid") return { ok: false, error: PHONE_INPUT_TEXT.invalid };

  try {
    await prisma.professional.update({
      where: { id: 1 },
      data: { timezone, currency, phoneJid, acceptedInsurances: acceptedInsurances || null },
      select: { id: true },
    });
  } catch {
    return { ok: false, error: SETTINGS_TEXT.saveError };
  }
  revalidatePath("/ajustes");
  return { ok: true };
}

const pdfStyleSchema = z.object({
  pdfAccentColor: z
    .string()
    .trim()
    .regex(/^#[0-9a-fA-F]{6}$/, SETTINGS_TEXT.pdfColorInvalid)
    .optional()
    .or(z.literal("")),
  pdfFooterText: z.string().trim().max(300, SETTINGS_TEXT.pdfFooterTooLong).optional().or(z.literal("")),
});

/** Informes en PDF → Color y pie de página. */
export async function savePdfStyleAction(_prev: SettingsState, formData: FormData): Promise<SettingsState> {
  const parsed = pdfStyleSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? SETTINGS_TEXT.saveError };
  try {
    await prisma.professional.update({
      where: { id: 1 },
      data: {
        pdfAccentColor: parsed.data.pdfAccentColor || null,
        pdfFooterText: parsed.data.pdfFooterText || null,
      },
      select: { id: true },
    });
  } catch {
    return { ok: false, error: SETTINGS_TEXT.saveError };
  }
  revalidatePath("/ajustes");
  return { ok: true };
}

// HU-007 (D1), HU-016: título y matrícula (firma del informe y portal).
const signatureIdentitySchema = z.object({
  title: z.string().trim().max(20, SETTINGS_TEXT.titleTooLong).optional().or(z.literal("")),
  licenseNumber: z.string().trim().max(40, SETTINGS_TEXT.licenseTooLong).optional().or(z.literal("")),
});

/** Informes en PDF → Firma y matrícula (título y matrícula). */
export async function saveSignatureIdentityAction(_prev: SettingsState, formData: FormData): Promise<SettingsState> {
  const parsed = signatureIdentitySchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? SETTINGS_TEXT.saveError };
  try {
    await prisma.professional.update({
      where: { id: 1 },
      data: { title: parsed.data.title || null, licenseNumber: parsed.data.licenseNumber || null },
      select: { id: true },
    });
  } catch {
    return { ok: false, error: SETTINGS_TEXT.saveError };
  }
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
    select: { id: true },
  });
  revalidatePath("/ajustes");
  return { ok: true };
}

export async function disconnectGoogleAction() {
  await prisma.professional.update({
    where: { id: 1 },
    data: { googleRefreshToken: null, googleSyncError: null },
    select: { id: true },
  });
  revalidatePath("/ajustes");
}

export async function setBotPausedAction(paused: boolean) {
  await prisma.professional.update({ where: { id: 1 }, data: { botPaused: paused }, select: { id: true } });
  revalidatePath("/ajustes");
}

// HU-016 (sección 16, P4): el logo acepta solo PNG o JPG (lo que react-pdf dibuja), validado en el
// servidor por magic bytes con el mismo helper que la firma. Se ignoran file.type y file.name.
export async function uploadLogoAction(
  _prev: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  const file = formData.get("logo");
  if (!(file instanceof File)) {
    return { ok: false, error: "Elegí una imagen" };
  }
  const sizeError = logoImageSizeError(file.size);
  if (sizeError) return { ok: false, error: sizeError };
  const buffer = Buffer.from(await file.arrayBuffer());
  const check = validateLogoImage(buffer);
  if (!check.ok) return { ok: false, error: check.error };
  await prisma.professional.update({
    where: { id: 1 },
    data: { logoData: buffer, logoMimeType: check.mimeType },
    select: { id: true },
  });
  revalidatePath("/ajustes");
  return { ok: true };
}

export async function removeLogoAction(): Promise<void> {
  await prisma.professional.update({
    where: { id: 1 },
    data: { logoData: null, logoMimeType: null },
    select: { id: true },
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
    select: { id: true },
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
    select: { id: true },
  });
  revalidatePath("/ajustes");
  return { ok: true };
}
