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
  type NutritionPrescription,
  type Patient,
  type Prisma,
  type Service,
} from "../index";
import { resolveTenantSchedulingContext, type SchedulingContext, type TenantRef } from "./tenantScope";
import { createDefaultWeeklyMeals } from "./weeklyMenu";

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
  prescription: NutritionPrescription | null;
};

const consultationInclude = {
  appointment: { include: { service: true } },
  plan: { select: { id: true, title: true, status: true, tenantId: true, patientId: true } },
  evolutionEntries: { orderBy: { createdAt: "asc" } },
  prescription: true,
} satisfies Prisma.ConsultationInclude;

function assertValidDayKey(dayKey: string) {
  if (!isValidDayKey(dayKey)) throw new Error("Fecha inválida");
}

function ownedConsultationWhere(tenantId: string) {
  return { tenantId, patient: { tenantId } };
}

function visibleConsultation<T extends Prisma.ConsultationGetPayload<{ include: typeof consultationInclude }>>(
  consultation: T,
  tenantId: string,
) {
  const { appointment, plan, patientId } = consultation;
  const belongsToPatient = (row: { tenantId: string | null; patientId: string }) =>
    row.tenantId === tenantId && row.patientId === patientId;
  // These legacy links don't enforce that the linked row belongs to the consultation's patient.
  // Fail closed on incompatible to-one links, including their IDs on the consultation itself.
  if (appointment && (!belongsToPatient(appointment) || appointment.service.tenantId !== tenantId)) return null;
  if (plan && !belongsToPatient(plan)) return null;
  // NutritionPrescription inherits ownership solely from this consultation.
  return {
    ...consultation,
    plan: plan && { id: plan.id, title: plan.title, status: plan.status },
    evolutionEntries: consultation.evolutionEntries.filter(belongsToPatient),
  };
}

/** Lista de la pestaña. orderBy consultedAt desc, createdAt desc. */
export async function listPatientConsultations(t: TenantRef, patientId: string): Promise<ConsultationWithRelations[]> {
  const { scope: { tenantId } } = await resolveTenantSchedulingContext(prisma, t.tenantId);
  const rows = await prisma.consultation.findMany({
    where: { patientId, ...ownedConsultationWhere(tenantId) },
    include: consultationInclude,
    orderBy: [{ consultedAt: "desc" }, { createdAt: "desc" }],
  });
  return rows.map((row) => visibleConsultation(row, tenantId)).filter((row) => row !== null);
}

/** Detalle. null si no existe. Incluye patient (para nombre y birthDate). */
export async function getConsultation(
  t: TenantRef,
  consultationId: string,
): Promise<(ConsultationWithRelations & { patient: Patient }) | null> {
  const { scope: { tenantId } } = await resolveTenantSchedulingContext(prisma, t.tenantId);
  const row = await prisma.consultation.findUnique({
    where: { id: consultationId, ...ownedConsultationWhere(tenantId) },
    include: { ...consultationInclude, patient: true },
  });
  return row && row.patient.tenantId === tenantId ? visibleConsultation(row, tenantId) : null;
}

/** Consultas del paciente en ese día local (para el aviso D5 de "Nueva consulta"). */
export async function listConsultationsOnDay(t: TenantRef, patientId: string, dayKey: string): Promise<Consultation[]> {
  assertValidDayKey(dayKey);
  const { scope: { tenantId }, professional: { timezone } } = await resolveTenantSchedulingContext(prisma, t.tenantId);
  const { start, end } = dayRangeUtc(dayKey, timezone);
  return prisma.consultation.findMany({
    where: { patientId, tenantId, consultedAt: { gte: start, lt: end } },
    orderBy: [{ consultedAt: "desc" }, { createdAt: "desc" }],
  });
}

/** "Nueva consulta" (sin turno). Valida día y no futuro. No bloquea si ya hay otra ese día (D5). */
export async function createManualConsultation(t: TenantRef, params: {
  patientId: string;
  dayKey: string;
}): Promise<Consultation> {
  assertValidDayKey(params.dayKey);
  const { scope: { tenantId }, professional: { timezone } } = await resolveTenantSchedulingContext(prisma, t.tenantId);
  if (isFutureDayKey(params.dayKey, new Date(), timezone)) throw new FutureConsultationDateError();
  const { id: patientId } = await prisma.patient.findUniqueOrThrow({
    where: { id_tenantId: { id: params.patientId, tenantId } },
    select: { id: true },
  });
  return createUnscheduledConsultation(prisma, { patientId, tenantId, consultedAt: dayKeyToNoonUtc(params.dayKey, timezone) });
}

/** D9: solo sin turno. No futuro. En una transacción mueve la consulta y todas sus mediciones al día nuevo. */
export async function updateManualConsultationDate(t: TenantRef, params: {
  consultationId: string;
  dayKey: string;
}): Promise<Consultation> {
  assertValidDayKey(params.dayKey);
  return prisma.$transaction(async (tx) => {
    const { scope: { tenantId }, professional: { timezone } } = await resolveTenantSchedulingContext(tx, t.tenantId);
    if (isFutureDayKey(params.dayKey, new Date(), timezone)) throw new FutureConsultationDateError();
    const noon = dayKeyToNoonUtc(params.dayKey, timezone);
    const consultationId = params.consultationId;
    const where = { id_tenantId: { id: consultationId, tenantId } };
    const { appointmentId, patientId } = await tx.consultation.findUniqueOrThrow({ where });
    if (appointmentId != null) throw new AppointmentConsultationDateError();
    const incompatible = await tx.evolutionEntry.findFirst({
      where: {
        consultationId,
        OR: [{ patientId: { not: patientId } }, { tenantId: { not: tenantId } }, { tenantId: null }],
      },
      select: { id: true },
    });
    if (incompatible) throw new Error("Las mediciones no coinciden con el paciente y consultorio de la consulta");
    const updated = await tx.consultation.update({
      where: { ...where, patientId, AND: { appointmentId: null } },
      data: { consultedAt: noon },
    });
    // Repeat ownership at write time: a linked entry may appear after the preflight read.
    await tx.evolutionEntry.updateMany({
      where: { consultationId, tenantId, patientId },
      data: { recordedAt: noon },
    });
    return updated;
  });
}

/** Notas: trim; "" → null. El largo (≤ CONSULTATION_NOTES_MAX) lo valida la action. */
export async function saveConsultationNotes(t: TenantRef, params: {
  consultationId: string;
  notes: string | null;
}): Promise<Consultation> {
  const { scope: { tenantId } } = await resolveTenantSchedulingContext(prisma, t.tenantId);
  const trimmed = params.notes?.trim() ?? "";
  return prisma.consultation.update({
    where: { id: params.consultationId, ...ownedConsultationWhere(tenantId) },
    data: { notes: trimmed === "" ? null : trimmed },
  });
}

/** D8: indicar un plan del mismo consultorio y paciente, o quitarlo (null). Nunca modifica el plan. */
export async function setConsultationPlan(t: TenantRef, params: {
  consultationId: string;
  planId: string | null;
}): Promise<Consultation> {
  const { scope: { tenantId } } = await resolveTenantSchedulingContext(prisma, t.tenantId);
  const where = { id_tenantId: { id: params.consultationId, tenantId } };
  if (params.planId == null) {
    return prisma.consultation.update({ where, data: { planId: null } });
  }
  const { patientId } = await prisma.consultation.findUniqueOrThrow({ where, select: { patientId: true } });
  const planWhere = { id_tenantId: { id: params.planId, tenantId }, patientId };
  const plan = await prisma.nutritionPlan.findUnique({ where: planWhere, select: { id: true } });
  if (!plan) throw new ConsultationPlanMismatchError();
  return prisma.consultation.update({
    where: { ...where, patientId },
    data: { plan: { connect: planWhere } },
  });
}

/** "Crear plan": en una transacción crea un NutritionPlan DRAFT del paciente y lo vincula. Devuelve el plan. */
export async function createPlanForConsultation(t: TenantRef, params: { consultationId: string }): Promise<NutritionPlan> {
  return prisma.$transaction(async (tx) => {
    const { scope: { tenantId }, professional } = await resolveTenantSchedulingContext(tx, t.tenantId);
    const where = { id_tenantId: { id: params.consultationId, tenantId } };
    const { patientId, consultedAt } = await tx.consultation.findUniqueOrThrow({
      where,
      select: { patientId: true, consultedAt: true },
    });
    const plan = await tx.nutritionPlan.create({
      data: {
        patientId,
        tenantId,
        title: `Plan del ${formatInTimeZone(consultedAt, professional.timezone, "dd/MM/yyyy")}`,
        status: "DRAFT",
      },
    });
    // HU-018b: el plan nuevo trae Desayuno…Cena "Cambia cada día" y Colaciones con opciones.
    await createDefaultWeeklyMeals(tx, "plan", plan.id);
    await tx.consultation.update({ where: { ...where, patientId }, data: { planId: plan.id } });
    return plan;
  });
}

/** Borrado a mano: solo sin mediciones, sin prescripción y sin plan. El turno no se toca. */
export async function deleteConsultation(t: TenantRef, consultationId: string): Promise<void> {
  const { scope: { tenantId } } = await resolveTenantSchedulingContext(prisma, t.tenantId);
  const where = { id: consultationId, ...ownedConsultationWhere(tenantId) };
  const consultation = await prisma.consultation.findUnique({
    where,
    select: {
      planId: true,
      prescription: { select: { id: true } },
      _count: { select: { evolutionEntries: true } },
    },
  });
  if (!consultation) throw new Error("La consulta no existe");
  if (
    !canDeleteConsultation({
      measurementCount: consultation._count.evolutionEntries,
      hasPrescription: consultation.prescription !== null,
      hasPlan: consultation.planId != null,
    })
  ) {
    throw new ConsultationNotDeletableError();
  }
  // El filtro repite la regla: si alguien cargó algo entre la lectura y el borrado, no se borra.
  const { count } = await prisma.consultation.deleteMany({
    where: { ...where, planId: null, evolutionEntries: { none: {} }, prescription: { is: null } },
  });
  if (count === 0) throw new ConsultationNotDeletableError();
}

function createUnscheduledConsultation(
  db: Pick<Prisma.TransactionClient, "consultation">,
  data: { patientId: string; tenantId: string; consultedAt: Date },
): Promise<Consultation> {
  // El par activa la FK tenantPatient además de conservar el vínculo legacy al paciente.
  return db.consultation.create({ data });
}

/** D4/D5: con el contexto verificado en `tx`, elige la consulta propia del día o crea una sin turno. */
export async function findOrCreateConsultationForDay(
  tx: Prisma.TransactionClient,
  params: { patientId: string; dayKey: string },
  { scope: { tenantId }, professional: { timezone } }: SchedulingContext,
): Promise<{ consultation: Consultation; created: boolean }> {
  const { id: patientId } = await tx.patient.findUniqueOrThrow({
    where: { id_tenantId: { id: params.patientId, tenantId } },
    select: { id: true },
  });
  const { start, end } = dayRangeUtc(params.dayKey, timezone);
  const candidates = await tx.consultation.findMany({
    where: { patientId, tenantId, consultedAt: { gte: start, lt: end } },
  });
  const existing = pickConsultationForDay(candidates);
  if (existing) return { consultation: existing, created: false };
  const consultation = await createUnscheduledConsultation(tx, {
    patientId, tenantId, consultedAt: dayKeyToNoonUtc(params.dayKey, timezone),
  });
  return { consultation, created: true };
}
