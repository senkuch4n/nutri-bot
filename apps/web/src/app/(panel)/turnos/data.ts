import "server-only";
import { prisma, type Prisma } from "@nutri-bot/db";
import {
  computeDepositAmount,
  isConsultationEmpty,
  monthRangeInTz,
  type AppointmentStatusLike,
  type DepositKind,
} from "@nutri-bot/core";

// HU-021 (SDD 6.2, T8). Turnos de un mes para /turnos (y del día para el Inicio). Solo lo usa la web (mismo criterio que /pagos):
// no va a packages/db/domain. Devuelve DTOs serializables (sin Date ni Decimal).

export interface TurnosAppointment {
  id: string;
  /** ISO. */
  startsAt: string;
  /** ISO. */
  endsAt: string;
  status: AppointmentStatusLike;
  cancelledBy: "PATIENT" | "PROFESSIONAL" | null;
  cancelReason: string | null;
  reason: string | null;
  /** Number(priceSnapshot). */
  price: number;
  /** priceSnapshot.toString() (para el detalle y el pago). */
  priceSnapshot: string;
  /** Number(amount) de los pagos APPROVED. */
  approvedAmounts: number[];
  /** computeDepositAmount del servicio (como /pagos); null si no tiene seña o da 0. */
  depositAmount: string | null;
  /** Boolean(googleEventId). */
  googleSynced: boolean;
  service: { id: string; name: string };
  patient: { id: string; name: string | null; phone: string; whatsappJid: string; archived: boolean };
  /** isConsultationEmpty, igual que api/appointments. */
  consultation: { id: string; hasContent: boolean } | null;
}

/** Turnos con startsAt ∈ monthRangeInTz(month, tz) = [from, to), TODOS los estados. */
export async function loadTurnosMonth(month: string, tz: string): Promise<TurnosAppointment[]> {
  const { from, to } = monthRangeInTz(month, tz);
  return loadTurnos({ startsAt: { gte: from, lt: to } });
}

/** Turnos con cualquier filtro (lo usa también el Inicio), en orden de inicio; `take` limita la cantidad. */
export async function loadTurnos(where: Prisma.AppointmentWhereInput, take?: number): Promise<TurnosAppointment[]> {
  const rows = await prisma.appointment.findMany({
    where,
    take,
    select: {
      id: true,
      startsAt: true,
      endsAt: true,
      status: true,
      cancelledBy: true,
      cancelReason: true,
      reason: true,
      priceSnapshot: true,
      googleEventId: true,
      patient: { select: { id: true, name: true, phone: true, whatsappJid: true, archivedAt: true } },
      service: { select: { id: true, name: true, requiresDeposit: true, depositKind: true, depositValue: true } },
      payments: { where: { status: "APPROVED" }, select: { amount: true } },
      consultation: {
        select: {
          id: true,
          notes: true,
          planId: true,
          prescription: { select: { id: true } },
          _count: { select: { evolutionEntries: true } },
        },
      },
    },
    orderBy: [{ startsAt: "asc" }, { id: "asc" }],
  });

  return rows.map((a): TurnosAppointment => {
    const price = Number(a.priceSnapshot.toString());
    const deposit =
      a.service.requiresDeposit && a.service.depositKind && a.service.depositValue
        ? computeDepositAmount(price, a.service.depositKind as DepositKind, Number(a.service.depositValue.toString()))
        : 0;
    return {
      id: a.id,
      startsAt: a.startsAt.toISOString(),
      endsAt: a.endsAt.toISOString(),
      status: a.status,
      cancelledBy: a.cancelledBy,
      cancelReason: a.cancelReason,
      reason: a.reason,
      price,
      priceSnapshot: a.priceSnapshot.toString(),
      approvedAmounts: a.payments.map((p) => Number(p.amount.toString())),
      depositAmount: deposit > 0 ? String(deposit) : null,
      googleSynced: Boolean(a.googleEventId),
      service: { id: a.service.id, name: a.service.name },
      patient: {
        id: a.patient.id,
        name: a.patient.name,
        phone: a.patient.phone,
        whatsappJid: a.patient.whatsappJid,
        archived: a.patient.archivedAt !== null,
      },
      consultation: a.consultation
        ? {
            id: a.consultation.id,
            hasContent: !isConsultationEmpty({
              measurementCount: a.consultation._count.evolutionEntries,
              hasPrescription: a.consultation.prescription !== null,
              hasPlan: a.consultation.planId !== null,
              notes: a.consultation.notes,
            }),
          }
        : null,
    };
  });
}
