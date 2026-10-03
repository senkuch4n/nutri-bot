import { isConsultationEmpty, messages, validateBookingReasonInput } from "@nutri-bot/core";
import { Prisma, prisma, type Actor, type Appointment, type AppointmentStatus } from "../index";
import { getProfessional, checkSlotAvailable } from "./availability";
import { enqueueMessage } from "./outbox";

export class SlotUnavailableError extends Error {
  constructor() {
    super("El horario elegido ya no está disponible.");
    this.name = "SlotUnavailableError";
  }
}

/** HU-013: motivo inválido (más de 500 caracteres). `message` es el texto para el panel. */
export class InvalidBookingReasonError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidBookingReasonError";
  }
}

/** Crea un turno confirmado, revalidando el horario, y encola la confirmación. */
export async function createAppointment(params: {
  patientId: string;
  serviceId: string;
  startsAt: Date;
  createdBy: Actor;
  /** false cuando el bot ya respondió la confirmación en vivo. */
  notifyPatient?: boolean;
  /** HU-013: motivo de consulta. Se normaliza con validateBookingReasonInput; "" → null.
   *  Si supera 500 → InvalidBookingReasonError ANTES de leer o escribir nada. */
  reason?: string | null;
  /** HU-013, SOLO pruebas: destino de la alerta de turno nuevo. undefined = Professional.phoneJid
   *  (como hoy); null = sin alerta. El bot pasa `opts.alertJid` (undefined en producción). */
  professionalAlertJid?: string | null;
}) {
  const r = validateBookingReasonInput(params.reason);
  if (!r.ok) throw new InvalidBookingReasonError(r.error);

  const [pro, service, patient] = await Promise.all([
    getProfessional(),
    prisma.service.findUniqueOrThrow({ where: { id: params.serviceId } }),
    prisma.patient.findUniqueOrThrow({ where: { id: params.patientId } }),
  ]);

  const endsAt = new Date(params.startsAt.getTime() + service.durationMin * 60_000);
  const awaitingPayment = params.createdBy === "PATIENT" && service.requiresDeposit;

  const appointment = await prisma.$transaction(async (tx) => {
    const ok = await checkSlotAvailable({ serviceId: params.serviceId, startsAt: params.startsAt });
    if (!ok) throw new SlotUnavailableError();

    return tx.appointment.create({
      data: {
        patientId: params.patientId,
        serviceId: params.serviceId,
        startsAt: params.startsAt,
        endsAt,
        status: awaitingPayment ? "AWAITING_PAYMENT" : "CONFIRMED",
        createdBy: params.createdBy,
        priceSnapshot: service.price,
        needsGoogleSync: true,
        reason: r.reason,
      },
    });
  });

  if (!awaitingPayment && params.notifyPatient !== false) {
    await enqueueMessage({
      toJid: patient.whatsappJid,
      kind: "CONFIRMATION",
      appointmentId: appointment.id,
      body: messages.bookingConfirmed({
        serviceName: service.name,
        startsAt: appointment.startsAt,
        tz: pro.timezone,
      }),
    });
  }

  // Aviso a la profesional cuando el turno lo saca el paciente.
  const alertJid =
    params.professionalAlertJid !== undefined ? params.professionalAlertJid : pro.phoneJid;
  if (!awaitingPayment && params.createdBy === "PATIENT" && alertJid) {
    await enqueueMessage({
      toJid: alertJid,
      kind: "PROFESSIONAL_ALERT",
      // Sin appointmentId: puede haber varias alertas para un mismo turno.
      body: messages.professionalNewBookingAlert({
        patientName: patient.name,
        patientPhone: patient.phone,
        serviceName: service.name,
        startsAt: appointment.startsAt,
        tz: pro.timezone,
        reason: appointment.reason,
      }),
    });
  }

  return appointment;
}

/**
 * HU-013 (D5): la profesional edita el motivo desde el detalle del turno. Cualquier estado.
 * Valida y normaliza con validateBookingReasonInput (inválido → InvalidBookingReasonError sin
 * escribir). Actualiza SOLO `reason`: no toca `needsGoogleSync` (el motivo no va a Google), no
 * encola mensajes, no toca la consulta.
 */
export async function updateAppointmentReason(params: {
  id: string;
  reason: string | null;
}): Promise<{ id: string; patientId: string; reason: string | null }> {
  const r = validateBookingReasonInput(params.reason);
  if (!r.ok) throw new InvalidBookingReasonError(r.error);
  return prisma.appointment.update({
    where: { id: params.id },
    data: { reason: r.reason },
    select: { id: true, patientId: true, reason: true },
  });
}

export async function cancelAppointment(params: {
  id: string;
  by: Actor;
  reason?: string;
  /** false cuando el bot ya respondió la cancelación en vivo. */
  notifyPatient?: boolean;
}) {
  const pro = await getProfessional();
  const appt = await prisma.appointment.findUniqueOrThrow({
    where: { id: params.id },
    include: { patient: true, service: true },
  });
  if (appt.status !== "CONFIRMED") return appt;

  const updated = await prisma.appointment.update({
    where: { id: params.id },
    data: {
      status: "CANCELLED",
      cancelledBy: params.by,
      cancelReason: params.reason ?? null,
      needsGoogleSync: true,
    },
  });

  if (params.by === "PROFESSIONAL" && params.notifyPatient !== false) {
    await enqueueMessage({
      toJid: appt.patient.whatsappJid,
      kind: "CANCELLATION",
      appointmentId: appt.id,
      body: messages.cancelDone({
        serviceName: appt.service.name,
        startsAt: appt.startsAt,
        tz: pro.timezone,
      }),
    });
  } else if (pro.phoneJid) {
    await enqueueMessage({
      toJid: pro.phoneJid,
      kind: "PROFESSIONAL_ALERT",
      body: messages.professionalCancelAlert({
        patientName: appt.patient.name,
        patientPhone: appt.patient.phone,
        serviceName: appt.service.name,
        startsAt: appt.startsAt,
        tz: pro.timezone,
      }),
    });
  }

  return updated;
}

export type SetAppointmentStatusResult = {
  appointment: Appointment;
  /** Solo si el estado nuevo es COMPLETED. */
  consultation: { id: string; created: boolean } | null;
  /** true si al salir de COMPLETED se borró la consulta vacía. */
  removedEmptyConsultation: boolean;
};

/**
 * Cambia el estado de un turno y mantiene su consulta (HU-003), en una transacción:
 * - a COMPLETED: crea la consulta del turno si no tiene (una por turno, `appointmentId` único).
 * - de COMPLETED a otro estado: borra la consulta solo si está vacía; si tiene contenido, la conserva (D3).
 * Cualquier camino (web, bot o cron) que complete o descomplete un turno tiene que pasar por acá.
 */
export async function setAppointmentStatus(params: {
  id: string;
  status: Extract<AppointmentStatus, "COMPLETED" | "NO_SHOW" | "CONFIRMED">;
}): Promise<SetAppointmentStatusResult> {
  const run = () =>
    prisma.$transaction(async (tx): Promise<SetAppointmentStatusResult> => {
      const prev = await tx.appointment.findUniqueOrThrow({
        where: { id: params.id },
        include: {
          consultation: {
            include: {
              _count: { select: { evolutionEntries: true } },
              prescription: { select: { id: true } },
            },
          },
        },
      });
      const appointment = await tx.appointment.update({
        where: { id: params.id },
        data: { status: params.status },
      });

      let consultation: SetAppointmentStatusResult["consultation"] = null;
      let removedEmptyConsultation = false;

      if (params.status === "COMPLETED") {
        if (prev.consultation) {
          consultation = { id: prev.consultation.id, created: false };
        } else {
          const created = await tx.consultation.create({
            data: { patientId: prev.patientId, appointmentId: prev.id, consultedAt: prev.startsAt },
          });
          consultation = { id: created.id, created: true };
        }
      } else if (prev.status === "COMPLETED" && prev.consultation) {
        const c = prev.consultation;
        if (
          isConsultationEmpty({
            measurementCount: c._count.evolutionEntries,
            hasPrescription: c.prescription != null,
            hasPlan: c.planId != null,
            notes: c.notes,
          })
        ) {
          // El filtro repite la condición por si alguien cargó algo entre la lectura y el borrado.
          const { count } = await tx.consultation.deleteMany({
            where: {
              id: c.id,
              notes: null,
              planId: null,
              evolutionEntries: { none: {} },
              prescription: { is: null },
            },
          });
          removedEmptyConsultation = count === 1;
        }
      }

      return { appointment, consultation, removedEmptyConsultation };
    });

  try {
    return await run();
  } catch (err) {
    // Carrera: otro request creó la consulta del turno entre la lectura y el create. La
    // transacción se revirtió entera; al reintentar, la consulta ya existe (created: false).
    if (
      params.status === "COMPLETED" &&
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      return run();
    }
    throw err;
  }
}
