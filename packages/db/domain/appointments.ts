import { isConsultationEmpty, messages } from "@nutri-bot/core";
import { Prisma, prisma, type Actor, type Appointment, type AppointmentStatus } from "../index";
import { getProfessional, checkSlotAvailable } from "./availability";
import { enqueueMessage } from "./outbox";

export class SlotUnavailableError extends Error {
  constructor() {
    super("El horario elegido ya no está disponible.");
    this.name = "SlotUnavailableError";
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
}) {
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
  if (!awaitingPayment && params.createdBy === "PATIENT" && pro.phoneJid) {
    await enqueueMessage({
      toJid: pro.phoneJid,
      kind: "PROFESSIONAL_ALERT",
      // Sin appointmentId: puede haber varias alertas para un mismo turno.
      body: messages.professionalNewBookingAlert({
        patientName: patient.name,
        patientPhone: patient.phone,
        serviceName: service.name,
        startsAt: appointment.startsAt,
        tz: pro.timezone,
      }),
    });
  }

  return appointment;
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
        include: { consultation: { include: { _count: { select: { evolutionEntries: true } } } } },
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
            hasPlan: c.planId != null,
            notes: c.notes,
          })
        ) {
          // El filtro repite la condición por si alguien cargó algo entre la lectura y el borrado.
          const { count } = await tx.consultation.deleteMany({
            where: { id: c.id, notes: null, planId: null, evolutionEntries: { none: {} } },
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
