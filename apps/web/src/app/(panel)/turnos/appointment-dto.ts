import type { AppointmentListInput, AppointmentListRow } from "@nutri-bot/core";
import type { SelectedAppointment } from "../appointment-detail-sheet";
import type { TurnosAppointment } from "./data";

// De los DTOs de turnos (data.ts) a lo que usan la lista (core) y el detalle. Los comparten /turnos y el Inicio.

/** SDD 7.6: el turno del detalle, con los datos del DTO y lo derivado de la fila (T6, D9). */
export function toSelectedAppointment(dto: TurnosAppointment, row: AppointmentListRow): SelectedAppointment {
  return {
    id: dto.id,
    start: dto.startsAt,
    end: dto.endsAt,
    status: dto.status,
    patientName: dto.patient.name,
    patientPhone: dto.patient.phone,
    serviceName: dto.service.name,
    price: dto.priceSnapshot,
    googleSynced: dto.googleSynced,
    patientId: dto.patient.id,
    consultation: dto.consultation,
    reason: dto.reason,
    patientJid: dto.patient.whatsappJid,
    patientLabel: row.patientLabel,
    hasFullPayment: row.payment.state === "paid" || row.payment.state === "free",
    cancelledBy: dto.cancelledBy,
    cancelReason: dto.cancelReason,
    paymentText: row.paymentText,
    balance: String(row.payment.balance),
    depositAmount: dto.depositAmount ?? undefined,
  };
}

/** La entrada de buildAppointmentListRows (core) para un turno. */
export function toListInput(a: TurnosAppointment): AppointmentListInput {
  return {
    id: a.id,
    startsAt: new Date(a.startsAt),
    status: a.status,
    cancelReason: a.cancelReason,
    price: a.price,
    approvedAmounts: a.approvedAmounts,
    reason: a.reason,
    serviceId: a.service.id,
    serviceName: a.service.name,
    patient: a.patient,
  };
}
