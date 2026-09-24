import type { ActivityLevel, BiologicalSex, BodyFrame, NutritionGoal } from "@prisma/client";
import { prisma } from "../index";

/** Normaliza un teléfono a JID de WhatsApp: solo dígitos + sufijo. */
export function phoneToJid(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  return `${digits}@s.whatsapp.net`;
}

export function jidToPhone(jid: string): string {
  return jid.split("@")[0] ?? jid;
}

export async function findOrCreatePatient(params: { phone: string; name?: string }) {
  const whatsappJid = phoneToJid(params.phone);
  const digits = whatsappJid.split("@")[0]!;
  return prisma.patient.upsert({
    where: { whatsappJid },
    update: params.name ? { name: params.name } : {},
    create: { whatsappJid, phone: digits, name: params.name ?? null },
  });
}

export async function findOrCreatePatientByJid(jid: string) {
  const digits = jidToPhone(jid);
  return prisma.patient.upsert({
    where: { whatsappJid: jid },
    update: {},
    create: { whatsappJid: jid, phone: digits },
  });
}

export interface PatientFormulaDataInput {
  sex: BiologicalSex | null;
  activityLevel: ActivityLevel | null;
  nutritionGoal: NutritionGoal | null;
  bodyFrame: BodyFrame | null;
}

/** Sobrescribe los 4 datos para cálculos (null borra). Solo toca esos 4 campos del paciente. */
export function updatePatientFormulaData(patientId: string, data: PatientFormulaDataInput) {
  return prisma.patient.update({
    where: { id: patientId },
    data: {
      sex: data.sex,
      activityLevel: data.activityLevel,
      nutritionGoal: data.nutritionGoal,
      bodyFrame: data.bodyFrame,
    },
  });
}
