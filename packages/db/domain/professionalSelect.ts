import type { Prisma } from "../index";

/**
 * HU-016 (D10): columnas de Professional que lee getProfessional(). Todas las escalares MENOS los
 * bytes de imágenes (signatureData, logoData): no viajan al bot, al portal ni a la IA. Las imágenes
 * se leen solo con las funciones de professionalAssets.ts. Si se agrega una columna a Professional,
 * sumarla acá (el test lo exige).
 */
export const PROFESSIONAL_SELECT = {
  id: true, name: true, email: true, phoneJid: true, timezone: true, currency: true,
  acceptedInsurances: true, logoMimeType: true, pdfAccentColor: true, pdfFooterText: true,
  title: true, licenseNumber: true, signatureMimeType: true, reminderLeadHours: true,
  botPaused: true, afterHoursEnabled: true, afterHoursStart: true, afterHoursEnd: true,
  botAiEnabled: true, botAiInfo: true, googleRefreshToken: true, googleCalendarId: true,
  googleSyncError: true, createdAt: true, updatedAt: true,
} satisfies Prisma.ProfessionalSelect;
