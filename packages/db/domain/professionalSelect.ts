import type { Prisma } from "../index";

/**
 * HU-016 (D10): columnas de Professional que lee getProfessional(). Los bytes de imágenes
 * (signatureData, logoData) se leen solo con professionalAssets.ts; no viajan al bot, al portal
 * ni a la IA. El tenantId es metadata de ownership y no forma parte de esta proyección de
 * compatibilidad. El test exige una decisión explícita para cada columna nueva.
 */
export const PROFESSIONAL_SELECT = {
  id: true, name: true, email: true, phoneJid: true, timezone: true, currency: true,
  acceptedInsurances: true, logoMimeType: true, pdfAccentColor: true, pdfFooterText: true,
  title: true, licenseNumber: true, signatureMimeType: true, reminderLeadHours: true,
  botPaused: true, afterHoursEnabled: true, afterHoursStart: true, afterHoursEnd: true,
  botAiEnabled: true, botAiInfo: true, googleRefreshToken: true, googleCalendarId: true,
  googleSyncError: true, createdAt: true, updatedAt: true,
} satisfies Prisma.ProfessionalSelect;
