import { prisma, type Prisma } from "../index";
import { resolveLegacySchedulingScope } from "./legacySchedulingScope";

// Historical rows without a tenant are inactive, even for the original installation.
function ownedStateKey(tenantId: string, patientJid: string) {
  return { tenantId_patientJid: { tenantId, patientJid } };
}

export async function findLegacyConversationState(patientJid: string) {
  const { scope: { tenantId } } = await resolveLegacySchedulingScope();
  return prisma.conversationState.findUnique({ where: ownedStateKey(tenantId, patientJid) });
}

// Directory reads do not include first-contact sessions or archived patients.
export async function listLegacyPatientLastContacts(patientJids: string[]) {
  if (patientJids.length === 0) return [];
  const { scope: { tenantId } } = await resolveLegacySchedulingScope();
  const patients = await prisma.patient.findMany({
    where: { tenantId, archivedAt: null, whatsappJid: { in: patientJids } },
    select: { whatsappJid: true },
  });
  if (patients.length === 0) return [];
  return prisma.conversationState.findMany({
    where: { patientJid: { in: patients.map((patient) => patient.whatsappJid) }, tenantId },
    select: { patientJid: true, updatedAt: true },
  });
}

type StateClient = Pick<Prisma.TransactionClient, "conversationState">;
type StatePayload = { step: string; context: Prisma.InputJsonValue };
const STATE_WRITE_FAILED = "No se pudo guardar el estado de conversación en la instalación original.";

function insertLegacyState(db: StateClient, tenantId: string, patientJid: string, state: StatePayload) {
  // PostgreSQL ON CONFLICT DO NOTHING avoids aborting an appointment transaction
  // on a duplicate (tenantId, patientJid) during a concurrent insert.
  return db.conversationState.createMany({ data: { patientJid, tenantId, ...state }, skipDuplicates: true });
}

export async function loadOrInitializeLegacyConversationState(patientJid: string, initialStep: string) {
  const { scope: { tenantId } } = await resolveLegacySchedulingScope();
  const where = ownedStateKey(tenantId, patientJid);
  // Existing sessions keep their inactivity timestamp, including after a racing insert.
  const existing = await prisma.conversationState.findUnique({ where });
  if (existing) return existing;
  await insertLegacyState(prisma, tenantId, patientJid, { step: initialStep, context: {} });
  const stored = await prisma.conversationState.findUnique({ where });
  if (!stored) throw new Error(STATE_WRITE_FAILED);
  return stored;
}

async function saveLegacyState(db: StateClient, tenantId: string, patientJid: string, state: StatePayload) {
  if ((await insertLegacyState(db, tenantId, patientJid, state)).count === 1) return;
  const { count } = await db.conversationState.updateMany({
    where: { patientJid, tenantId },
    data: state,
  });
  if (count !== 1) throw new Error(STATE_WRITE_FAILED);
}

export async function saveLegacyConversationState(patientJid: string, step: string, context: Prisma.InputJsonValue) {
  const { scope: { tenantId } } = await resolveLegacySchedulingScope();
  await saveLegacyState(prisma, tenantId, patientJid, { step, context });
}

// Verify the original installation on the same transaction that owns the appointment write.
// Callers obtain the JID and appointment ID from an appointment verified in this scope.
export async function bindLegacyAppointmentConversationState(tx: Prisma.TransactionClient) {
  const binding = await resolveLegacySchedulingScope(tx);
  const { tenantId } = binding.scope;
  return {
    ...binding,
    resetRescheduledAttendance(patientJid: string, apptId: string) {
      return tx.conversationState.updateMany({
        where: {
          patientJid,
          tenantId,
          step: "CONFIRM_ATTENDANCE",
          context: { path: ["apptId"], equals: apptId },
        },
        data: { step: "DORMANT", context: {} },
      });
    },
    deleteCancelledAppointmentState(patientJid: string, apptId: string, attendancePromptUpdatedAt?: Date) {
      return tx.conversationState.deleteMany({
        where: {
          patientJid,
          tenantId,
          ...(attendancePromptUpdatedAt ? {
            step: "CONFIRM_ATTENDANCE",
            context: { equals: { apptId } },
            updatedAt: attendancePromptUpdatedAt,
          } : {
            step: { in: ["CANCEL_CONFIRM", "CONFIRM_ATTENDANCE"] },
            context: { path: ["apptId"], equals: apptId },
          }),
        },
      });
    },
    upsertAttendancePrompt(patientJid: string, apptId: string) {
      return saveLegacyState(tx, tenantId, patientJid, { step: "CONFIRM_ATTENDANCE", context: { apptId } });
    },
  };
}

/** Steps that retain text supplied by the patient (AI history or booking reason). */
export const SESSION_STEPS_WITH_PATIENT_TEXT = ["AWAIT_QUESTION", "BOOK_REASON", "BOOK_CONFIRM"] as const;

export async function clearExpiredLegacyConversationText(cutoff: Date, jids?: string[]) {
  const { scope: { tenantId } } = await resolveLegacySchedulingScope();
  // The legacy table also holds first-contact sessions with no corresponding Patient.
  const { count } = await prisma.conversationState.updateMany({
    where: {
      tenantId,
      step: { in: [...SESSION_STEPS_WITH_PATIENT_TEXT] },
      updatedAt: { lt: cutoff },
      ...(jids ? { patientJid: { in: jids } } : {}),
    },
    data: { step: "DORMANT", context: {} },
  });
  return count;
}
