import { messages } from "@nutri-bot/core";
import { prisma, type Actor, type AppointmentStatus } from "../index";
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

  const appointment = await prisma.$transaction(async (tx) => {
    const ok = await checkSlotAvailable({ serviceId: params.serviceId, startsAt: params.startsAt });
    if (!ok) throw new SlotUnavailableError();

    return tx.appointment.create({
      data: {
        patientId: params.patientId,
        serviceId: params.serviceId,
        startsAt: params.startsAt,
        endsAt,
        status: "CONFIRMED",
        createdBy: params.createdBy,
        priceSnapshot: service.price,
        needsGoogleSync: true,
      },
    });
  });

  if (params.notifyPatient !== false) {
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
  if (params.createdBy === "PATIENT" && pro.phoneJid) {
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

export async function setAppointmentStatus(params: {
  id: string;
  status: Extract<AppointmentStatus, "COMPLETED" | "NO_SHOW" | "CONFIRMED">;
}) {
  return prisma.appointment.update({ where: { id: params.id }, data: { status: params.status } });
}
