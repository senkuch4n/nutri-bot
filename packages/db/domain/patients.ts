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

// ---------------------------------------------------------------------------
// HU-019: archivar / desarchivar pacientes.
// ---------------------------------------------------------------------------

export type PendingAppointmentStatus = "CONFIRMED" | "AWAITING_PAYMENT";

const PENDING_STATUSES: PendingAppointmentStatus[] = ["CONFIRMED", "AWAITING_PAYMENT"];

export type ArchivePatientResult =
  | { ok: true; archivedAt: Date }
  | { ok: false; reason: "not_found" }
  | {
      ok: false;
      reason: "pending_appointments";
      /** El pendiente más cercano (startsAt asc). */
      next: { startsAt: Date; status: PendingAppointmentStatus };
      /** Cuántos pendientes más hay además de `next` (0 si es uno solo). */
      moreCount: number;
    };

/** HU-019 (D3, T3). En una transacción: lock de Professional (el de createAppointment), lee la
 *  paciente, busca turnos CONFIRMED/AWAITING_PAYMENT con startsAt >= now; si hay → pending_appointments
 *  sin escribir; si ya estaba archivada → ok con su archivedAt original; si no → archivedAt = now. */
export async function archivePatient(
  patientId: string,
  now: Date = new Date(),
): Promise<ArchivePatientResult> {
  return prisma.$transaction(async (tx): Promise<ArchivePatientResult> => {
    // Mismo lock que createAppointment: archivar y reservar quedan serializados (carrera D3).
    await tx.$queryRaw`SELECT id FROM "Professional" WHERE id = 1 FOR UPDATE`;

    const patient = await tx.patient.findUnique({
      where: { id: patientId },
      select: { id: true, archivedAt: true },
    });
    if (!patient) return { ok: false, reason: "not_found" };

    const pending = await tx.appointment.findMany({
      where: { patientId, status: { in: PENDING_STATUSES }, startsAt: { gte: now } },
      orderBy: { startsAt: "asc" },
      select: { startsAt: true, status: true },
    });
    const next = pending[0];
    if (next) {
      return {
        ok: false,
        reason: "pending_appointments",
        next: { startsAt: next.startsAt, status: next.status as PendingAppointmentStatus },
        moreCount: pending.length - 1,
      };
    }

    // Idempotente: no pisa la fecha original.
    if (patient.archivedAt) return { ok: true, archivedAt: patient.archivedAt };

    await tx.patient.update({ where: { id: patientId }, data: { archivedAt: now } });
    return { ok: true, archivedAt: now };
  });
}

/** HU-019. archivedAt = null (idempotente). count 0 → not_found. */
export async function unarchivePatient(
  patientId: string,
): Promise<{ ok: true } | { ok: false; reason: "not_found" }> {
  const { count } = await prisma.patient.updateMany({
    where: { id: patientId },
    data: { archivedAt: null },
  });
  return count === 0 ? { ok: false, reason: "not_found" } : { ok: true };
}
