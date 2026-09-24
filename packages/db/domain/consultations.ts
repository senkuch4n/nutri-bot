import {
  CONSULTATION_TEXT,
  canDeleteConsultation,
  dayKeyToNoonUtc,
  dayRangeUtc,
  formatInTimeZone,
  isFutureDayKey,
  isValidDayKey,
  pickConsultationForDay,
} from "@nutri-bot/core";
import {
  prisma,
  type Appointment,
  type Consultation,
  type EvolutionEntry,
  type NutritionPlan,
  type Patient,
  type Prisma,
  type Service,
} from "../index";
import { getProfessional } from "./availability";

// La consulta como entidad central (HU-003). Web la usa hoy; el bot no, pero cualquier camino
// futuro que cree o toque consultas tiene que pasar por acá para respetar las mismas reglas.

export class ConsultationNotDeletableError extends Error {
  constructor() {
    super(CONSULTATION_TEXT.notDeletable);
    this.name = "ConsultationNotDeletableError";
  }
}

export class FutureConsultationDateError extends Error {
  constructor(message: string = CONSULTATION_TEXT.futureDate) {
    super(message);
    this.name = "FutureConsultationDateError";
  }
}

export class AppointmentConsultationDateError extends Error {
  constructor() {
    super("La fecha de una consulta de turno no se edita");
    this.name = "AppointmentConsultationDateError";
  }
}

export class ConsultationPlanMismatchError extends Error {
  constructor() {
    super("El plan no es de este paciente");
    this.name = "ConsultationPlanMismatchError";
  }
}

export type ConsultationWithRelations = Consultation & {
  appointment: (Appointment & { service: Service }) | null;
  plan: Pick<NutritionPlan, "id" | "title" | "status"> | null;
  evolutionEntries: EvolutionEntry[];
};

const consultationInclude = {
  appointment: { include: { service: true } },
  plan: { select: { id: true, title: true, status: true } },
  evolutionEntries: { orderBy: { createdAt: "asc" } },
} satisfies Prisma.ConsultationInclude;

function assertValidDayKey(dayKey: string) {
  if (!isValidDayKey(dayKey)) throw new Error("Fecha inválida");
}

/** Lista de la pestaña. orderBy consultedAt desc, createdAt desc. */
export function listPatientConsultations(patientId: string): Promise<ConsultationWithRelations[]> {
  return prisma.consultation.findMany({
    where: { patientId },
    include: consultationInclude,
    orderBy: [{ consultedAt: "desc" }, { createdAt: "desc" }],
  });
}

/** Detalle. null si no existe. Incluye patient (para nombre y birthDate). */
export function getConsultation(
  consultationId: string,
): Promise<(ConsultationWithRelations & { patient: Patient }) | null> {
  return prisma.consultation.findUnique({
    where: { id: consultationId },
    include: { ...consultationInclude, patient: true },
  });
}

/** Consultas del paciente en ese día local (para el aviso D5 de "Nueva consulta"). */
export async function listConsultationsOnDay(patientId: string, dayKey: string): Promise<Consultation[]> {
  assertValidDayKey(dayKey);
  const pro = await getProfessional();
  const { start, end } = dayRangeUtc(dayKey, pro.timezone);
  return prisma.consultation.findMany({
    where: { patientId, consultedAt: { gte: start, lt: end } },
    orderBy: [{ consultedAt: "desc" }, { createdAt: "desc" }],
  });
}

/** "Nueva consulta" (sin turno). Valida día y no futuro. No bloquea si ya hay otra ese día (D5). */
export async function createManualConsultation(params: {
  patientId: string;
  dayKey: string;
}): Promise<Consultation> {
  assertValidDayKey(params.dayKey);
  const pro = await getProfessional();
  if (isFutureDayKey(params.dayKey, new Date(), pro.timezone)) throw new FutureConsultationDateError();
  return prisma.consultation.create({
    data: { patientId: params.patientId, consultedAt: dayKeyToNoonUtc(params.dayKey, pro.timezone) },
  });
}

/** D9: solo sin turno. No futuro. En una transacción mueve la consulta y todas sus mediciones al día nuevo. */
export async function updateManualConsultationDate(params: {
  consultationId: string;
  dayKey: string;
}): Promise<Consultation> {
  assertValidDayKey(params.dayKey);
  const pro = await getProfessional();
  if (isFutureDayKey(params.dayKey, new Date(), pro.timezone)) throw new FutureConsultationDateError();
  const noon = dayKeyToNoonUtc(params.dayKey, pro.timezone);
  return prisma.$transaction(async (tx) => {
    const current = await tx.consultation.findUniqueOrThrow({ where: { id: params.consultationId } });
    if (current.appointmentId != null) throw new AppointmentConsultationDateError();
    const updated = await tx.consultation.update({
      where: { id: params.consultationId },
      data: { consultedAt: noon },
    });
    await tx.evolutionEntry.updateMany({
      where: { consultationId: params.consultationId },
      data: { recordedAt: noon },
    });
    return updated;
  });
}

/** Notas: trim; "" → null. El largo (≤ CONSULTATION_NOTES_MAX) lo valida la action. */
export function saveConsultationNotes(params: {
  consultationId: string;
  notes: string | null;
}): Promise<Consultation> {
  const trimmed = params.notes?.trim() ?? "";
  return prisma.consultation.update({
    where: { id: params.consultationId },
    data: { notes: trimmed === "" ? null : trimmed },
  });
}

/** D8: indicar (planId) o quitar (null). Si el plan es de otro paciente → ConsultationPlanMismatchError.
 *  Nunca modifica el plan. */
export async function setConsultationPlan(params: {
  consultationId: string;
  planId: string | null;
}): Promise<Consultation> {
  if (params.planId != null) {
    const [consultation, plan] = await Promise.all([
      prisma.consultation.findUniqueOrThrow({ where: { id: params.consultationId }, select: { patientId: true } }),
      prisma.nutritionPlan.findUnique({ where: { id: params.planId }, select: { patientId: true } }),
    ]);
    if (!plan || plan.patientId !== consultation.patientId) throw new ConsultationPlanMismatchError();
  }
  return prisma.consultation.update({
    where: { id: params.consultationId },
    data: { planId: params.planId },
  });
}

/** "Crear plan": en una transacción crea un NutritionPlan DRAFT del paciente y lo vincula. Devuelve el plan. */
export async function createPlanForConsultation(params: { consultationId: string }): Promise<NutritionPlan> {
  const pro = await getProfessional();
  return prisma.$transaction(async (tx) => {
    const consultation = await tx.consultation.findUniqueOrThrow({ where: { id: params.consultationId } });
    const plan = await tx.nutritionPlan.create({
      data: {
        patientId: consultation.patientId,
        title: `Plan del ${formatInTimeZone(consultation.consultedAt, pro.timezone, "dd/MM/yyyy")}`,
        status: "DRAFT",
      },
    });
    await tx.consultation.update({ where: { id: consultation.id }, data: { planId: plan.id } });
    return plan;
  });
}

/** Borrado a mano: solo sin mediciones y sin plan. El turno no se toca. */
export async function deleteConsultation(consultationId: string): Promise<void> {
  const consultation = await prisma.consultation.findUnique({
    where: { id: consultationId },
    select: { planId: true, _count: { select: { evolutionEntries: true } } },
  });
  if (!consultation) throw new Error("La consulta no existe");
  if (
    !canDeleteConsultation({
      measurementCount: consultation._count.evolutionEntries,
      hasPlan: consultation.planId != null,
    })
  ) {
    throw new ConsultationNotDeletableError();
  }
  // El filtro repite la regla: si alguien cargó algo entre la lectura y el borrado, no se borra.
  const { count } = await prisma.consultation.deleteMany({
    where: { id: consultationId, planId: null, evolutionEntries: { none: {} } },
  });
  if (count === 0) throw new ConsultationNotDeletableError();
}

/** D4/D5: dentro de `tx`, la consulta del paciente en ese día (pickConsultationForDay) o una nueva sin turno. */
export async function findOrCreateConsultationForDay(
  tx: Prisma.TransactionClient,
  params: { patientId: string; dayKey: string; tz: string },
): Promise<{ consultation: Consultation; created: boolean }> {
  const { start, end } = dayRangeUtc(params.dayKey, params.tz);
  const candidates = await tx.consultation.findMany({
    where: { patientId: params.patientId, consultedAt: { gte: start, lt: end } },
  });
  const existing = pickConsultationForDay(candidates);
  if (existing) return { consultation: existing, created: false };
  const consultation = await tx.consultation.create({
    data: { patientId: params.patientId, consultedAt: dayKeyToNoonUtc(params.dayKey, params.tz) },
  });
  return { consultation, created: true };
}
