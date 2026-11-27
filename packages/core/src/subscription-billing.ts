// HU-029b: suscripción de Arzium con Mercado Pago. Lógica pura (sin base ni red).
// SDD: Refactorizaciones/suscripcion-arzium-mercadopago.md §B.5.1 y §B.7; valores reales de la corrida en
// sandbox del 2026-11-27 (docs/mp-suscripciones-sandbox.md, bloque §B.0 R1–R15).
import { addMonths } from "date-fns";
import { formatPrice } from "./format";

export type BillingMode = "SANDBOX" | "LIVE";
export type BillingPeriodUnit = "DAYS" | "MONTHS";
export type SubscriptionStatusValue = "PENDING" | "TRIALING" | "ACTIVE" | "PAST_DUE" | "CANCELED";
export type SubscriptionCancelOriginValue = "PANEL" | "MERCADO_PAGO";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

// ---- Configuración ----

export type SubscriptionBillingConfig =
  | { status: "disabled" }
  | { status: "misconfigured"; missing: string[] } // nombres de variables, nunca valores
  | { status: "enabled"; mode: BillingMode; collectorUserId: string };

/** Reglas de §B.3. Solo `ARZIUM_SUBSCRIPTIONS_ENABLED === "true"` habilita. No devuelve ni copia secretos:
 *  solo comprueba que no estén vacíos. `live` exige NODE_ENV=production; `sandbox` lo prohíbe. */
export function resolveSubscriptionBillingConfig(env: Record<string, string | undefined>): SubscriptionBillingConfig {
  if (env.ARZIUM_SUBSCRIPTIONS_ENABLED !== "true") return { status: "disabled" };

  const missing: string[] = [];
  const production = env.NODE_ENV === "production";
  const rawMode = env.ARZIUM_MERCADOPAGO_MODE?.trim();
  let mode: BillingMode | null = null;
  if (rawMode === "live" && production) mode = "LIVE";
  else if (rawMode === "sandbox" && !production) mode = "SANDBOX";
  if (!mode) missing.push("ARZIUM_MERCADOPAGO_MODE");

  if (!env.ARZIUM_MERCADOPAGO_ACCESS_TOKEN?.trim()) missing.push("ARZIUM_MERCADOPAGO_ACCESS_TOKEN");
  const collectorUserId = env.ARZIUM_MERCADOPAGO_USER_ID?.trim() ?? "";
  if (!/^\d+$/.test(collectorUserId)) missing.push("ARZIUM_MERCADOPAGO_USER_ID");
  if (!env.ARZIUM_MERCADOPAGO_WEBHOOK_SECRET?.trim()) missing.push("ARZIUM_MERCADOPAGO_WEBHOOK_SECRET");

  if (missing.length > 0 || !mode) return { status: "misconfigured", missing };
  return { status: "enabled", mode, collectorUserId };
}

// ---- Términos de plan ----

/** S5 confirmado (2026-11-27): [1, 3, 6, 12]. */
export const ALLOWED_MONTH_FREQUENCIES: readonly number[] = [1, 3, 6, 12];
/** G4 sin confirmar (2026-11-27): false. Packs fuera hasta que una corrida vea el paso a finished. */
export const PLAN_BILLING_CYCLES_SUPPORTED: boolean = false;
/** S16 (2026-11-27): importe por cobro aceptado por MP en ARS. */
export const MP_MIN_AMOUNT_ARS = 15 as const;
export const MP_MAX_AMOUNT_ARS = 2_000_000 as const;

export type PlanTerms = {
  amount: string; // "60000.00" (Decimal serializado)
  currency: string;
  frequency: number;
  frequencyUnit: BillingPeriodUnit;
  trialLength: number | null;
  trialUnit: BillingPeriodUnit | null;
  billingCycles: number | null;
};

export type PlanTermsError =
  | "invalid_amount"
  | "amount_out_of_range"
  | "invalid_currency"
  | "invalid_frequency"
  | "days_only_in_sandbox"
  | "invalid_trial"
  | "cycles_not_supported"
  | "invalid_cycles";

const isIntIn = (n: unknown, min: number, max: number): boolean =>
  typeof n === "number" && Number.isInteger(n) && n >= min && n <= max;

/** Ver doc de la SDD §B.5.1: importe > 0 con ≤ 2 decimales y en [MP_MIN_AMOUNT_ARS, MP_MAX_AMOUNT_ARS];
 *  ARS; MONTHS ∈ ALLOWED_MONTH_FREQUENCIES; DAYS 1..365 solo en SANDBOX; prueba completa (DAYS 1..90,
 *  MONTHS 1..12); billingCycles solo si PLAN_BILLING_CYCLES_SUPPORTED (1..36). */
export function validatePlanTerms(t: PlanTerms, mode: BillingMode): { ok: true } | { ok: false; error: PlanTermsError } {
  if (typeof t.amount !== "string" || !/^\d+(\.\d{1,2})?$/.test(t.amount) || !(Number(t.amount) > 0)) {
    return { ok: false, error: "invalid_amount" };
  }
  const amount = Number(t.amount);
  if (amount < MP_MIN_AMOUNT_ARS || amount > MP_MAX_AMOUNT_ARS) return { ok: false, error: "amount_out_of_range" };
  if (t.currency !== "ARS") return { ok: false, error: "invalid_currency" };

  if (t.frequencyUnit === "MONTHS") {
    if (!Number.isInteger(t.frequency) || !ALLOWED_MONTH_FREQUENCIES.includes(t.frequency)) {
      return { ok: false, error: "invalid_frequency" };
    }
  } else if (t.frequencyUnit === "DAYS") {
    if (mode !== "SANDBOX") return { ok: false, error: "days_only_in_sandbox" };
    if (!isIntIn(t.frequency, 1, 365)) return { ok: false, error: "invalid_frequency" };
  } else {
    return { ok: false, error: "invalid_frequency" };
  }

  if ((t.trialLength === null) !== (t.trialUnit === null)) return { ok: false, error: "invalid_trial" };
  if (t.trialLength !== null) {
    const max = t.trialUnit === "DAYS" ? 90 : t.trialUnit === "MONTHS" ? 12 : 0;
    if (!isIntIn(t.trialLength, 1, max)) return { ok: false, error: "invalid_trial" };
  }

  if (t.billingCycles !== null) {
    if (!PLAN_BILLING_CYCLES_SUPPORTED) return { ok: false, error: "cycles_not_supported" };
    if (!isIntIn(t.billingCycles, 1, 36)) return { ok: false, error: "invalid_cycles" };
  }
  return { ok: true };
}

/** "60000.00" | 60000 → 6000000. Tira con un valor no numérico o en notación exponencial ("1e3"). */
export function toCents(value: string | number): number {
  let n: number;
  if (typeof value === "number") {
    n = value;
  } else {
    if (typeof value !== "string" || !/^-?\d+(\.\d+)?$/.test(value.trim())) throw new Error("invalid_amount");
    n = Number(value.trim());
  }
  if (!Number.isFinite(n)) throw new Error("invalid_amount");
  return Math.round(n * 100);
}

// ---- Fechas ----

/** MONTHS: date-fns addMonths sobre el instante (clamp a fin de mes); DAYS: + length × 24 h. */
export function addBillingPeriod(from: Date, length: number, unit: BillingPeriodUnit): Date {
  if (unit === "MONTHS") return addMonths(from, length);
  return new Date(from.getTime() + length * DAY_MS);
}

/** null si no hay prueba. DAYS: + n × 24 h. MONTHS: + n × 30 días (S16: MP usa first_invoice_offset 30 para
 *  1 mes), no meses de calendario. */
export function computeTrialEnd(from: Date, trialLength: number | null, trialUnit: BillingPeriodUnit | null): Date | null {
  if (trialLength === null || trialUnit === null) return null;
  const days = trialUnit === "MONTHS" ? trialLength * 30 : trialLength;
  return new Date(from.getTime() + days * DAY_MS);
}

/** S9: MP cuenta la prueba desde la creación (start_date), no desde la autorización. nextPaymentDate si no es
 *  null y es ≤ computeTrialEnd(authorizedAt) + 1 h (sanidad); si no, computeTrialEnd(startDate ?? authorizedAt).
 *  Puede devolver una fecha pasada: es la verdad de MP. */
export function resolveTrialEnd(input: {
  authorizedAt: Date;
  nextPaymentDate: Date | null;
  startDate: Date | null;
  trialLength: number | null;
  trialUnit: BillingPeriodUnit | null;
}): Date | null {
  const cap = computeTrialEnd(input.authorizedAt, input.trialLength, input.trialUnit);
  if (!cap) return null;
  if (input.nextPaymentDate && input.nextPaymentDate.getTime() <= cap.getTime() + HOUR_MS) {
    return input.nextPaymentDate;
  }
  return computeTrialEnd(input.startDate ?? input.authorizedAt, input.trialLength, input.trialUnit);
}

/** DP1 (aceptada 2026-11-27): umbral de 1 hora de prueba perdida. */
export const STALE_CHECKOUT_TRIAL_LOSS_MS: number = 60 * 60 * 1000;

/** S9 / B.0 R5: true si el checkout con prueba ya perdió más de STALE_CHECKOUT_TRIAL_LOSS_MS de prueba. */
export function isCheckoutStale(input: {
  trialGranted: boolean;
  nextPaymentDate: Date | null;
  trialLength: number | null;
  trialUnit: BillingPeriodUnit | null;
  now: Date;
}): boolean {
  if (!input.trialGranted || !input.nextPaymentDate) return false;
  const full = computeTrialEnd(input.now, input.trialLength, input.trialUnit);
  if (!full) return false;
  return full.getTime() - input.nextPaymentDate.getTime() > STALE_CHECKOUT_TRIAL_LOSS_MS;
}

// ---- Email del pagador (G3 refutada → D8a) ----

/** trim + minúsculas; ok si 3..254 caracteres y forma básica de email. No verifica que exista en MP. */
export function normalizePayerEmail(raw: unknown): { ok: true; email: string } | { ok: false } {
  if (typeof raw !== "string") return { ok: false };
  const email = raw.trim().toLowerCase();
  if (email.length < 3 || email.length > 254) return { ok: false };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false };
  return { ok: true, email };
}

// ---- Errores de POST /preapproval (G2, G3, S16) ----

export type PreapprovalCreateErrorKind =
  | "payer_email_required"
  | "payer_email_rejected"
  | "amount_out_of_range"
  | "rejected"
  | "ambiguous";

/** Lee solo `status`/`statusCode` (número) y `message`/`error` (string) del error del SDK. Nunca devuelve ni
 *  copia el mensaje. Ante cualquier duda → "ambiguous" (fail safe: no se reintenta el POST). 408 (timeout del
 *  lado de MP) también es ambiguo. */
export function classifyPreapprovalCreateError(err: unknown): PreapprovalCreateErrorKind {
  if (typeof err !== "object" || err === null) return "ambiguous";
  const e = err as Record<string, unknown>;
  const status = typeof e.status === "number" ? e.status : typeof e.statusCode === "number" ? e.statusCode : null;
  if (status === null || status < 400 || status >= 500 || status === 408) return "ambiguous";
  const texts = [e.message, e.error].filter((v): v is string => typeof v === "string");
  if (status === 400) {
    if (texts.some((t) => t.includes("payer_email is required"))) return "payer_email_required";
    if (texts.some((t) => t.includes("User bad request"))) return "payer_email_rejected";
    if (texts.some((t) => t.startsWith("Cannot pay an amount"))) return "amount_out_of_range";
  }
  return "rejected";
}

// ---- Prueba gratis (D7b + ofertas) ----

export function isTrialEligible(input: {
  planHasTrial: boolean;
  priorTrialUsed: boolean;
  offer: { allowTrial: boolean; used: boolean } | null;
}): boolean {
  if (!input.planHasTrial) return false;
  if (!input.priorTrialUsed) return true;
  return input.offer?.allowTrial === true && !input.offer.used;
}

// ---- Preapproval ----

export type PreapprovalSnapshot = {
  id: string;
  status: string; // crudo, en minúsculas
  collectorId: string | null;
  payerId: string | null;
  externalReference: string | null;
  amount: number | null;
  currency: string | null;
  frequency: number | null;
  frequencyType: string | null; // "days" | "months"
  initPoint: string | null;
  nextPaymentDate: Date | null;
  /** auto_recurring.start_date (S9: la prueba cuenta desde acá). */
  startDate: Date | null;
  /** auto_recurring.free_trial (S15: objeto { frequency, frequency_type, first_invoice_offset }). */
  freeTrial: { frequency: number; frequencyType: string } | null;
  lastModified: Date | null;
};

const asRecord = (v: unknown): Record<string, unknown> | null =>
  typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null;

const idString = (v: unknown): string | null => {
  if (typeof v === "string" && v.trim() !== "") return v.trim();
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return null;
};

const str = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** Fecha ISO de MP → Date; inválida o ausente → null. Exportada para el dominio (date_created). */
export function parseMercadoPagoDate(v: unknown): Date | null {
  if (typeof v !== "string" || v === "") return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Desde el JSON del SDK (unknown). null si falta `id` o `status`. Nunca copia payer_email. */
export function parsePreapproval(raw: unknown): PreapprovalSnapshot | null {
  const r = asRecord(raw);
  if (!r) return null;
  const id = idString(r.id);
  const status = str(r.status);
  if (!id || !status) return null;
  const ar = asRecord(r.auto_recurring);
  const ft = asRecord(ar?.free_trial);
  const ftFrequency = num(ft?.frequency);
  const ftType = str(ft?.frequency_type);
  return {
    id,
    status: status.toLowerCase(),
    collectorId: idString(r.collector_id),
    payerId: idString(r.payer_id),
    externalReference: str(r.external_reference),
    amount: num(ar?.transaction_amount),
    currency: str(ar?.currency_id),
    frequency: num(ar?.frequency),
    frequencyType: str(ar?.frequency_type)?.toLowerCase() ?? null,
    initPoint: str(r.init_point),
    nextPaymentDate: parseMercadoPagoDate(r.next_payment_date),
    startDate: parseMercadoPagoDate(ar?.start_date),
    freeTrial: ftFrequency !== null && ftType ? { frequency: ftFrequency, frequencyType: ftType.toLowerCase() } : null,
    lastModified: parseMercadoPagoDate(r.last_modified),
  };
}

export type PreapprovalMismatch =
  | "collector_mismatch"
  | "reference_mismatch"
  | "amount_mismatch"
  | "currency_mismatch"
  | "frequency_mismatch"
  | "trial_mismatch"
  | "id_mismatch";

const unitToMp = (u: BillingPeriodUnit): "days" | "months" => (u === "DAYS" ? "days" : "months");

/** Orden: id → collector (null aceptado: la consulta ya se hizo con el token de Arzium) → reference →
 *  amount (toCents) → currency → frequency/frequencyType → trial (S15). */
export function checkPreapprovalAgainstSubscription(
  p: PreapprovalSnapshot,
  expected: {
    preapprovalId: string | null;
    externalReference: string;
    collectorUserId: string;
    amount: string;
    currency: string;
    frequency: number;
    frequencyUnit: BillingPeriodUnit;
    trialGranted: boolean;
    trialLength: number | null;
    trialUnit: BillingPeriodUnit | null;
  },
): { ok: true } | { ok: false; reason: PreapprovalMismatch } {
  if (expected.preapprovalId !== null && p.id !== expected.preapprovalId) return { ok: false, reason: "id_mismatch" };
  if (p.collectorId !== null && p.collectorId !== expected.collectorUserId) return { ok: false, reason: "collector_mismatch" };
  if (p.externalReference !== expected.externalReference) return { ok: false, reason: "reference_mismatch" };
  if (p.amount === null || toCents(p.amount) !== toCents(expected.amount)) return { ok: false, reason: "amount_mismatch" };
  if (p.currency !== expected.currency) return { ok: false, reason: "currency_mismatch" };
  if (p.frequency !== expected.frequency || p.frequencyType !== unitToMp(expected.frequencyUnit)) {
    return { ok: false, reason: "frequency_mismatch" };
  }
  if (expected.trialGranted) {
    if (
      !p.freeTrial ||
      expected.trialLength === null ||
      expected.trialUnit === null ||
      p.freeTrial.frequency !== expected.trialLength ||
      p.freeTrial.frequencyType !== unitToMp(expected.trialUnit)
    ) {
      return { ok: false, reason: "trial_mismatch" };
    }
  } else if (p.freeTrial !== null) {
    return { ok: false, reason: "trial_mismatch" };
  }
  return { ok: true };
}

// ---- Estado ----

export type ChargeSummary = { everApproved: boolean; latestOutcome: "approved" | "failed" | null };
export type StatusDecision =
  | { kind: "set"; status: SubscriptionStatusValue; cancelOrigin: SubscriptionCancelOriginValue | null }
  | { kind: "ignore"; reason: "terminated" | "paused" | "unknown_status" };

/** Ver §B.5.1: CANCELED terminal; cancelled/finished → CANCELED (PANEL si se pidió hace poco); pending solo
 *  sostiene PENDING; paused se ignora; authorized → PAST_DUE / ACTIVE / TRIALING / PENDING (X8). */
export function decideSubscriptionStatus(input: {
  current: SubscriptionStatusValue;
  mpStatus: string;
  trialGranted: boolean;
  charges: ChargeSummary;
  cancelRequestedRecently: boolean;
}): StatusDecision {
  if (input.current === "CANCELED") return { kind: "ignore", reason: "terminated" };
  const mp = input.mpStatus.toLowerCase();
  if (mp === "cancelled" || mp === "finished") {
    return { kind: "set", status: "CANCELED", cancelOrigin: input.cancelRequestedRecently ? "PANEL" : "MERCADO_PAGO" };
  }
  if (mp === "pending") {
    return input.current === "PENDING"
      ? { kind: "set", status: "PENDING", cancelOrigin: null }
      : { kind: "ignore", reason: "unknown_status" };
  }
  if (mp === "paused") return { kind: "ignore", reason: "paused" };
  if (mp === "authorized") {
    if (input.charges.latestOutcome === "failed") return { kind: "set", status: "PAST_DUE", cancelOrigin: null };
    if (input.charges.everApproved) return { kind: "set", status: "ACTIVE", cancelOrigin: null };
    if (input.trialGranted) return { kind: "set", status: "TRIALING", cancelOrigin: null };
    return { kind: "set", status: "PENDING", cancelOrigin: null };
  }
  return { kind: "ignore", reason: "unknown_status" };
}

// ---- Textos ----

/** "$ 60.000 por mes" | "$ 150.000 cada 3 meses" | "$ 600.000 por año" | "$ 1.000 cada 2 días" (formatPrice). */
export function formatPlanPrice(t: Pick<PlanTerms, "amount" | "currency" | "frequency" | "frequencyUnit">): string {
  const price = formatPrice(t.amount, t.currency);
  let period: string;
  if (t.frequencyUnit === "MONTHS") {
    period = t.frequency === 1 ? "por mes" : t.frequency === 12 ? "por año" : `cada ${t.frequency} meses`;
  } else {
    period = t.frequency === 1 ? "por día" : `cada ${t.frequency} días`;
  }
  return `${price} ${period}`;
}

/** "7 días" | "1 día" | "1 mes" | "2 meses". */
export function formatTrialLength(length: number, unit: BillingPeriodUnit): string {
  if (unit === "DAYS") return `${length} ${length === 1 ? "día" : "días"}`;
  return `${length} ${length === 1 ? "mes" : "meses"}`;
}

/** §B.7, textos exactos. Mensajes del bot: ninguno (los avisos son de HU-030). */
export const SUBSCRIPTION_TEXT = {
  tabLabel: "Suscripción",
  title: "Suscripción",
  openScreen: "Ver suscripción",
  summaryNone: "Sin suscripción",
  unavailableShort: "No disponible",
  summary: {
    PENDING: "Pendiente",
    TRIALING: "En prueba",
    ACTIVE: "Activa",
    PAST_DUE: "Pago pendiente",
    CANCELED: "Cancelada",
  } satisfies Record<SubscriptionStatusValue, string>,
  /** trialEnd = computeTrialEnd(ahora, prueba) (estimado; coincide con MP porque el checkout se crea al tocar el botón). */
  offerTrial: (trial: string, price: string, trialEnd: string) =>
    `Probá Numa gratis ${trial}. Después, ${price} con Mercado Pago. Si cancelás antes del ${trialEnd}, no se te cobra nada.`,
  offerNoTrial: (price: string) => `Suscribite a Numa por ${price}. El primer cobro se hace al autorizar.`,
  startTrial: "Empezar prueba gratis",
  subscribe: "Suscribirme",
  resubscribe: "Volver a suscribirme",
  confirming: "Estamos confirmando tu suscripción con Mercado Pago. Puede tardar unos segundos.",
  confirmDelayed: "Mercado Pago todavía no nos confirmó la autorización. Si la completaste, se va a ver acá en unos minutos.",
  refresh: "Actualizar",
  pendingCheckout: "Empezaste la suscripción pero no terminaste de autorizarla en Mercado Pago.",
  continueCheckout: "Continuar en Mercado Pago",
  restart: "Empezar de nuevo",
  restartConfirmTitle: "¿Empezar de nuevo?",
  restartConfirmDescription: "Vamos a anular la autorización que quedó a medias en Mercado Pago y crear una nueva.",
  awaitingFirstCharge: "Mercado Pago autorizó la suscripción. Estamos esperando la confirmación del primer cobro.",
  trialing: (trialEnd: string, price: string, firstCharge: string) =>
    `Estás en la prueba gratis hasta el ${trialEnd}. El primer cobro de ${price} es el ${firstCharge}.`,
  active: (price: string, date: string) => `Suscripción activa. Próximo cobro: ${price} el ${date}.`,
  pastDue: (reason: string) =>
    `No pudimos cobrar la suscripción (${reason}). Mercado Pago lo vuelve a intentar. Revisá tu medio de pago en tu cuenta de Mercado Pago.`,
  goToMercadoPago: "Ir a Mercado Pago",
  canceled: (date: string) => `Cancelaste la suscripción el ${date}.`,
  canceledByMercadoPago: (date: string) => `La suscripción se canceló en Mercado Pago el ${date}.`,
  paidUntil: (date: string) => `Pagado hasta el ${date}.`,
  cancel: "Cancelar suscripción",
  cancelConfirmTitle: "¿Cancelar la suscripción?",
  cancelConfirmTrial: (date: string) => `No se te va a cobrar más. La prueba termina el ${date}.`,
  cancelConfirmActive: (date: string) => `No se te va a cobrar más. Tenés acceso pago hasta el ${date}.`,
  cancelConfirmPlain: "No se te va a cobrar más.",
  cancelYes: "Sí, cancelar",
  cancelBack: "Volver",
  unavailable: "La suscripción todavía no está disponible. Te avisamos cuando lo esté.",
  staffOnly: "Solo la dueña del consultorio puede gestionar la suscripción.",
  payerEmailLabel: "Email de tu cuenta de Mercado Pago",
  payerEmailHelp: "Es el email con el que entrás a Mercado Pago. Puede ser distinto del que usás en Numa.",
  restartEmailHelp: "Si te equivocaste de email, corregilo y tocá «Empezar de nuevo».",
  errors: {
    not_available: "La suscripción todavía no está disponible.",
    plan_not_offered: "Ese plan ya no está disponible. Elegí otro.",
    already_subscribed: "Este consultorio ya tiene una suscripción.",
    mp_unavailable: "No pudimos conectar con Mercado Pago. Probá de nuevo en unos minutos.",
    restart_unconfirmed: "No pudimos anular la autorización anterior en Mercado Pago. Probá de nuevo en unos minutos.",
    cancel_unconfirmed: "No pudimos confirmar la cancelación con Mercado Pago. Probá de nuevo; si sigue, escribinos a soporte.",
    nothing_to_cancel: "No hay una suscripción para cancelar.",
    not_found: "No encontramos un checkout pendiente. Empezá de nuevo.",
    forbidden: "Solo la dueña del consultorio puede gestionar la suscripción.",
    invalid_payer_email: "Revisá el email: no parece válido.",
    payer_email_rejected: "Mercado Pago no reconoce ese email. Usá el email con el que entrás a tu cuenta de Mercado Pago.",
    checkout_in_progress: "Estamos preparando tu suscripción en Mercado Pago. Probá de nuevo en unos segundos.",
  },
} as const;

export type SubscriptionErrorCode = keyof typeof SUBSCRIPTION_TEXT.errors;
