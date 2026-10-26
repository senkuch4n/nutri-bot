// HU-021 (SDD 5.1). Lista de turnos del panel (/turnos): estado visible de cada fila, lo registrado
// como pagado, filtros, URL y tarjetas. Todo puro: el cliente lo deriva en memoria sobre el mes.
import { DEPOSIT_AUTO_CANCEL_REASONS } from "./deposits";
import { formatPrice } from "./format";
import type { AppointmentStatusLike } from "./patient-summary";

export type AppointmentRowStatus =
  | "upcoming" // CONFIRMED, startsAt > now
  | "unclosed" // CONFIRMED, startsAt <= now
  | "completed" // COMPLETED
  | "no_show" // NO_SHOW
  | "cancelled" // CANCELLED de verdad
  | "deposit_unpaid" // CANCELLED solo por no pagar la seña / falla del checkout (T3)
  | "awaiting_deposit"; // AWAITING_PAYMENT

const AUTO_CANCEL_REASONS: ReadonlySet<string> = new Set(Object.values(DEPOSIT_AUTO_CANCEL_REASONS));

/** T3. true si cancelReason es exactamente uno de DEPOSIT_AUTO_CANCEL_REASONS. null/otro → false. */
export function isUnpaidDepositCancellation(cancelReason: string | null | undefined): boolean {
  return typeof cancelReason === "string" && AUTO_CANCEL_REASONS.has(cancelReason);
}

/** T2. */
export function appointmentRowStatus(
  a: { status: AppointmentStatusLike; startsAt: Date; cancelReason: string | null },
  now: Date,
): AppointmentRowStatus {
  switch (a.status) {
    case "CONFIRMED":
      return a.startsAt.getTime() > now.getTime() ? "upcoming" : "unclosed";
    case "COMPLETED":
      return "completed";
    case "NO_SHOW":
      return "no_show";
    case "AWAITING_PAYMENT":
      return "awaiting_deposit";
    case "CANCELLED":
      return isUnpaidDepositCancellation(a.cancelReason) ? "deposit_unpaid" : "cancelled";
  }
}

export type AppointmentPaymentState = "free" | "paid" | "partial" | "none";

export interface AppointmentPaymentSummary {
  state: AppointmentPaymentState;
  /** Suma de los pagos aprobados (pesos, 2 decimales). */
  paidTotal: number;
  /** max(0, price − paidTotal). 0 si free o paid. */
  balance: number;
}

const toCents = (amount: number) => Math.round(amount * 100);

/** T4. `approvedAmounts`: montos de los pagos APPROVED del turno (quien llama ya filtró el estado).
 *  Cuentas en centavos enteros. */
export function summarizeAppointmentPayments(
  price: number,
  approvedAmounts: readonly number[],
): AppointmentPaymentSummary {
  const priceCents = toCents(price);
  const paidCents = approvedAmounts.reduce((sum, amount) => sum + toCents(amount), 0);
  const paidTotal = paidCents / 100;
  if (priceCents <= 0) return { state: "free", paidTotal, balance: 0 };
  if (paidCents >= priceCents) return { state: "paid", paidTotal, balance: 0 };
  return { state: paidCents > 0 ? "partial" : "none", paidTotal, balance: (priceCents - paidCents) / 100 };
}

/** "Pagado" · "Seña pagada · $ 5.000" (formatPrice(paidTotal, currency)) · "Sin pagos registrados" · "—" (free). */
export function appointmentPaymentText(s: AppointmentPaymentSummary, currency: string): string {
  switch (s.state) {
    case "paid":
      return APPOINTMENT_LIST_TEXT.payment.paid;
    case "partial":
      return APPOINTMENT_LIST_TEXT.payment.partial(formatPrice(s.paidTotal, currency));
    case "none":
      return APPOINTMENT_LIST_TEXT.payment.none;
    case "free":
      return APPOINTMENT_LIST_TEXT.payment.free;
  }
}

/** T5. (CONFIRMED | COMPLETED) && state ∈ {partial, none}. */
export function canRegisterAppointmentPayment(
  status: AppointmentStatusLike,
  s: AppointmentPaymentSummary,
): boolean {
  return (status === "CONFIRMED" || status === "COMPLETED") && (s.state === "partial" || s.state === "none");
}

export const APPOINTMENT_LIST_TEXT = {
  title: "Turnos",
  description: "Todos tus turnos del mes, con lo que tienen registrado como pagado.",
  newAppointment: "Nuevo turno",
  filters: "Filtros",
  /** aria-label del botón: "Filtros, 1 activo" / "Filtros, 2 activos". El badge visible muestra el número. */
  filtersLabel: (n: number) => (n === 0 ? "Filtros" : n === 1 ? "Filtros, 1 activo" : `Filtros, ${n} activos`),
  clearFilters: "Limpiar filtros",
  status: {
    upcoming: "Pendiente",
    unclosed: "Sin cerrar",
    completed: "Completado",
    no_show: "No vino",
    cancelled: "Canceló",
    deposit_unpaid: "Canceló",
    awaiting_deposit: "Esperando seña",
  },
  depositUnpaidNote: "Seña sin pagar",
  cards: {
    total: "Totales",
    pending: "Pendientes",
    completed: "Completadas",
    cancelled: "Canceladas",
    unclosed: (n: number) => `${n} sin cerrar`,
  },
  payment: {
    paid: "Pagado",
    partial: (amount: string) => `Seña pagada · ${amount}`,
    none: "Sin pagos registrados",
    free: "—",
  },
  free: "Sin cargo",
  archived: "Archivada",
  noReason: "—",
  columns: {
    status: "Estado",
    patient: "Paciente",
    service: "Servicio",
    date: "Fecha",
    time: "Hora",
    price: "Precio",
    payment: "Pago",
    reason: "Motivo",
    actions: "Acciones",
  },
  filterGroups: { status: "Estado", payment: "Pago", service: "Servicio", allServices: "Todos los servicios" },
  statusFilter: {
    all: "Todos",
    upcoming: "Pendientes",
    unclosed: "Sin cerrar",
    completed: "Completados",
    no_show: "No vino",
    cancelled: "Cancelados",
    awaiting_deposit: "Esperando seña",
  },
  paymentFilter: { all: "Todos", paid: "Pagados", partial: "Con seña", none: "Sin pagos registrados" },
  searchLabel: "Buscar turnos por paciente, nombre o teléfono",
  searchPlaceholder: "Buscá por paciente o teléfono",
  /** "No hay turnos en diciembre" (month = monthName). */
  emptyMonth: (month: string) => `No hay turnos en ${month}`,
  noMatches: "Ningún turno coincide con los filtros",
  seeAll: "Ver todos",
  /** "12 turnos" / "1 turno". */
  count: (n: number) => (n === 1 ? "1 turno" : `${n} turnos`),
  /** Caption de la tabla (sr-only): "Turnos de Octubre 2026" (monthTitle). */
  tableCaption: (monthTitle: string) => `Turnos de ${monthTitle}`,
  actions: {
    attended: "Vino",
    noShow: "No vino",
    registerPayment: "Registrar pago",
    open: "Abrir",
    /** aria-label: "Abrir el turno de Carla López, mar 20/10 10:00". */
    openLabel: (patient: string, date: string, time: string) => `Abrir el turno de ${patient}, ${date} ${time}`,
    attendedLabel: (patient: string) => `Marcar que ${patient} vino`,
    noShowLabel: (patient: string) => `Marcar que ${patient} no vino`,
    registerPaymentLabel: (patient: string) => `Registrar pago del turno de ${patient}`,
  },
  toast: {
    /** "Turno de Carla marcado como completado". */
    completed: (name: string) => `Turno de ${name} marcado como completado`,
    error: "No se pudo actualizar el turno.",
  },
  readOnly: {
    payments: "Pagos",
    cancelledBy: "Canceló",
    byPatient: "La paciente",
    byProfessional: "Vos",
    byDepositExpiry: "Se canceló sola: no se pagó la seña",
    cancelReason: "Motivo de cancelación",
    noCancelReason: "Sin motivo",
  },
  monthNav: {
    label: "Mes",
    prev: (title: string) => `Mes anterior: ${title}`,
    next: (title: string) => `Mes siguiente: ${title}`,
  },
} as const;
