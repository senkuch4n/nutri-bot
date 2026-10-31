// HU-021 (SDD 5.1). Lista de turnos del panel (/turnos): estado visible de cada fila, lo registrado
// como pagado, filtros, URL y tarjetas. Todo puro: el cliente lo deriva en memoria sobre el mes.
import { firstName, patientDisplayName } from "./agenda";
import { DEPOSIT_AUTO_CANCEL_REASONS } from "./deposits";
import { formatPrice } from "./format";
import { matchesPatientQuery } from "./patient-directory";
import type { AppointmentStatusLike } from "./patient-summary";
import { formatInTimeZone } from "./time";
import { normalize } from "./wake";
import { classifyWhatsappJid } from "./whatsapp-contact";

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

/** "Pago completado" · "Seña pagada · $ 5.000" (formatPrice(paidTotal, currency)) · "Sin pagos registrados" · "—" (free). */
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

/** Lo que el cliente arma desde el DTO del loader (startsAt ya como Date). */
export interface AppointmentListInput {
  id: string;
  startsAt: Date;
  status: AppointmentStatusLike;
  cancelReason: string | null;
  price: number;
  approvedAmounts: readonly number[];
  reason: string | null;
  serviceId: string;
  serviceName: string;
  patient: { id: string; name: string | null; phone: string; whatsappJid: string; archived: boolean };
}

export interface AppointmentListRow {
  id: string;
  startsAt: Date;
  rowStatus: AppointmentRowStatus;
  /** APPOINTMENT_LIST_TEXT.status[rowStatus]. */
  statusLabel: string;
  /** "Seña sin pagar" solo para deposit_unpaid; si no, null. */
  statusNote: string | null;
  patientId: string;
  /** patientDisplayName(patient). */
  patientLabel: string;
  /** firstName(patient.name) ?? patientLabel (para el toast de "Vino"). */
  patientShortName: string;
  patientArchived: boolean;
  /** Para matchesPatientQuery (T21). */
  searchName: string;
  phoneDigits: string | null;
  serviceId: string;
  serviceName: string;
  /** "29 Oct" (día + mes corto, zona de la profesional). */
  dateLabel: string;
  /** "8:00" / "17:30" (24 h, sin cero adelante). */
  timeLabel: string;
  /** formatPrice(price, currency) o "—" si price es 0. */
  priceLabel: string;
  payment: AppointmentPaymentSummary;
  /** appointmentPaymentText(payment, currency). */
  paymentText: string;
  canRegisterPayment: boolean;
  /** rowStatus === "unclosed": la fila ofrece "Vino" / "No vino". */
  canClose: boolean;
  reason: string | null;
}

const SHORT_MONTHS = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"] as const;

/** "23 Oct": día sin cero + mes corto, en la zona de la profesional. */
function shortDayMonth(instant: Date, tz: string): string {
  const [day, month] = formatInTimeZone(instant, tz, "d M").split(" ");
  return `${day} ${SHORT_MONTHS[Number(month) - 1]}`;
}

/** Arma y ordena (startsAt asc, empate por id) TODAS las filas del mes, incluidas deposit_unpaid. */
export function buildAppointmentListRows(
  input: readonly AppointmentListInput[],
  now: Date,
  tz: string,
  currency: string,
): AppointmentListRow[] {
  const rows = input.map((a): AppointmentListRow => {
    const rowStatus = appointmentRowStatus(a, now);
    const payment = summarizeAppointmentPayments(a.price, a.approvedAmounts);
    const patientLabel = patientDisplayName(a.patient);
    const name = a.patient.name?.trim() || null;
    return {
      id: a.id,
      startsAt: a.startsAt,
      rowStatus,
      statusLabel: APPOINTMENT_LIST_TEXT.status[rowStatus],
      statusNote: rowStatus === "deposit_unpaid" ? APPOINTMENT_LIST_TEXT.depositUnpaidNote : null,
      patientId: a.patient.id,
      patientLabel,
      patientShortName: firstName(a.patient.name) ?? patientLabel,
      patientArchived: a.patient.archived,
      searchName: normalize(name ?? ""),
      phoneDigits: classifyWhatsappJid(a.patient.whatsappJid) === "phone" ? a.patient.phone.replace(/\D/g, "") : null,
      serviceId: a.serviceId,
      serviceName: a.serviceName,
      dateLabel: shortDayMonth(a.startsAt, tz),
      timeLabel: formatInTimeZone(a.startsAt, tz, "H:mm"),
      priceLabel: payment.state === "free" ? APPOINTMENT_LIST_TEXT.free : formatPrice(a.price, currency),
      payment,
      paymentText: appointmentPaymentText(payment, currency),
      canRegisterPayment: canRegisterAppointmentPayment(a.status, payment),
      canClose: rowStatus === "unclosed",
      reason: a.reason,
    };
  });
  return rows.sort(
    (x, y) => x.startsAt.getTime() - y.startsAt.getTime() || (x.id < y.id ? -1 : x.id > y.id ? 1 : 0),
  );
}

export type AppointmentStatusFilter =
  | "all"
  | "upcoming"
  | "unclosed"
  | "completed"
  | "no_show"
  | "cancelled"
  | "awaiting_deposit";
export type AppointmentPaymentFilter = "all" | "paid" | "partial" | "none";

export interface AppointmentListFilters {
  status: AppointmentStatusFilter;
  payment: AppointmentPaymentFilter;
  /** null = todos los servicios. */
  serviceId: string | null;
  /** Texto del buscador, sin recortar. */
  query: string;
}

export const DEFAULT_APPOINTMENT_LIST_FILTERS: AppointmentListFilters = {
  status: "all",
  payment: "all",
  serviceId: null,
  query: "",
};

const STATUS_URL: Record<Exclude<AppointmentStatusFilter, "all">, string> = {
  upcoming: "pendientes",
  unclosed: "sin-cerrar",
  completed: "completados",
  no_show: "no-vino",
  cancelled: "cancelados",
  awaiting_deposit: "esperando-sena",
};

const PAYMENT_URL: Record<Exclude<AppointmentPaymentFilter, "all">, string> = {
  paid: "pagados",
  partial: "con-sena",
  none: "sin-pagos",
};

function fromUrl<K extends string>(map: Record<K, string>, value: string | null | undefined): K | null {
  if (!value) return null;
  const hit = (Object.keys(map) as K[]).find((k) => map[k] === value);
  return hit ?? null;
}

/** Valores de la URL ↔ filtros. Desconocido o ausente → "all" / null / "".
 *  estado: pendientes | sin-cerrar | completados | no-vino | cancelados | esperando-sena
 *  pago:   pagados | con-sena | sin-pagos
 *  servicio: id del servicio (string no vacío) · q: texto libre */
export function parseAppointmentListFilters(params: {
  estado?: string | null;
  pago?: string | null;
  servicio?: string | null;
  q?: string | null;
}): AppointmentListFilters {
  return {
    status: fromUrl(STATUS_URL, params.estado) ?? "all",
    payment: fromUrl(PAYMENT_URL, params.pago) ?? "all",
    serviceId: params.servicio ? params.servicio : null,
    query: params.q ?? "",
  };
}

/** Query string de /turnos SIN "?" y sin vacíos, en este orden: mes, estado, pago, servicio, q.
 *  `month` null = mes en curso (no se escribe). Ej.: "mes=2026-11&estado=sin-cerrar". "" si no hay nada. */
export function appointmentListQuery(month: string | null, f: AppointmentListFilters): string {
  const params = new URLSearchParams();
  if (month) params.set("mes", month);
  if (f.status !== "all") params.set("estado", STATUS_URL[f.status]);
  if (f.payment !== "all") params.set("pago", PAYMENT_URL[f.payment]);
  if (f.serviceId) params.set("servicio", f.serviceId);
  if (f.query.trim()) params.set("q", f.query);
  return params.toString();
}

/** Cantidad de filtros del botón "Filtros": status ≠ all, payment ≠ all, serviceId ≠ null (el buscador no cuenta). */
export function activeAppointmentFilterCount(f: AppointmentListFilters): number {
  return (f.status !== "all" ? 1 : 0) + (f.payment !== "all" ? 1 : 0) + (f.serviceId !== null ? 1 : 0);
}

function matchesStatus(rowStatus: AppointmentRowStatus, status: AppointmentStatusFilter): boolean {
  if (status === "all") return rowStatus !== "deposit_unpaid";
  if (status === "cancelled") return rowStatus === "cancelled" || rowStatus === "deposit_unpaid";
  return rowStatus === status;
}

/** T13 + pago + servicio + matchesPatientQuery. Con status "all", deposit_unpaid no pasa.
 *  "cancelled" deja pasar cancelled y deposit_unpaid. El filtro de pago nunca deja pasar "free". */
export function matchesAppointmentFilters(row: AppointmentListRow, f: AppointmentListFilters): boolean {
  if (!matchesStatus(row.rowStatus, f.status)) return false;
  if (f.payment !== "all" && row.payment.state !== f.payment) return false;
  if (f.serviceId !== null && row.serviceId !== f.serviceId) return false;
  return matchesPatientQuery(row, f.query);
}

export interface AppointmentListCards {
  total: number;
  pending: number;
  completed: number;
  cancelled: number;
  unclosed: number;
}

/** T12, sobre las filas ya filtradas. */
export function countAppointmentCards(
  rows: readonly Pick<AppointmentListRow, "rowStatus">[],
): AppointmentListCards {
  const cards: AppointmentListCards = { total: 0, pending: 0, completed: 0, cancelled: 0, unclosed: 0 };
  for (const { rowStatus } of rows) {
    if (rowStatus === "upcoming" || rowStatus === "unclosed" || rowStatus === "completed" || rowStatus === "no_show") {
      cards.total += 1;
    }
    if (rowStatus === "upcoming") cards.pending += 1;
    if (rowStatus === "unclosed") cards.unclosed += 1;
    if (rowStatus === "completed") cards.completed += 1;
    if (rowStatus === "cancelled") cards.cancelled += 1;
  }
  return cards;
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
    paid: "Pago completado",
    partial: (amount: string) => `Seña pagada · ${amount}`,
    none: "Sin pagos registrados",
    free: "—",
  },
  /** Precio de un turno sin cargo (como «Nota» vacía). */
  free: "—",
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
    reason: "Nota",
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
    /** aria-label: "Abrir el turno de Carla López, 20 Oct 10:00". */
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
