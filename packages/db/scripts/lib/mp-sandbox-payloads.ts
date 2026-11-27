/**
 * HU-029 · 029a (SDD §A.4): armado de los payloads y proyección de las respuestas del script de
 * sandbox de suscripciones de Mercado Pago. Puro (sin red), con tests.
 */
import { redactMercadoPagoResource } from "./mp-sandbox-redact";

export type FrequencyType = "months" | "days";

export type CreateOptions = {
  frequency: number;
  frequencyType: FrequencyType;
  amount: number;
  trial: { frequency: number; frequencyType: FrequencyType } | null;
  cycles: number | null;
  endDate: string | null;
  noEmail: boolean;
  idempotencyKey: string | null;
  externalReference: string | null;
  open: boolean;
};

/**
 * Body local de `POST /preapproval`: el `PreApprovalRequest` del SDK (3.6.1) no declara
 * `auto_recurring.free_trial` en `create`, pero la API lo acepta (es lo que prueba S1).
 */
export type SandboxPreapprovalBody = {
  reason: string;
  external_reference: string;
  back_url: string;
  status: "pending";
  payer_email?: string;
  auto_recurring: {
    frequency: number;
    frequency_type: FrequencyType;
    transaction_amount: number;
    currency_id: "ARS";
    free_trial?: { frequency: number; frequency_type: FrequencyType };
    end_date?: string;
  };
};

export const SANDBOX_REASON = "Numa · prueba sandbox";
export const DEFAULT_AMOUNT_ARS = 60000;

const VALUE_FLAGS = new Set(["--freq", "--unit", "--trial", "--trial-unit", "--amount", "--cycles", "--end-date", "--idem", "--ref"]);
const BOOLEAN_FLAGS = new Set(["--no-email", "--open"]);

function positiveInt(flag: string, raw: string): number {
  if (!/^\d+$/.test(raw) || Number(raw) <= 0) throw new Error(`${flag} tiene que ser un entero positivo (vino "${raw}").`);
  return Number(raw);
}

function frequencyType(flag: string, raw: string): FrequencyType {
  if (raw !== "months" && raw !== "days") throw new Error(`${flag} acepta "months" o "days" (vino "${raw}").`);
  return raw;
}

/** Flags de `create` (SDD §A.4). Tira ante flags desconocidos o valores inválidos. */
export function parseCreateArgs(argv: string[]): CreateOptions {
  const values = new Map<string, string>();
  const flags = new Set<string>();
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (BOOLEAN_FLAGS.has(arg)) {
      flags.add(arg);
    } else if (VALUE_FLAGS.has(arg)) {
      const value = argv[i + 1];
      if (value === undefined || value.startsWith("--")) throw new Error(`${arg} necesita un valor.`);
      values.set(arg, value);
      i++;
    } else {
      throw new Error(`Flag desconocido para create: ${arg}`);
    }
  }

  const trialRaw = values.get("--trial");
  const trialUnit = frequencyType("--trial-unit", values.get("--trial-unit") ?? "days");
  const cycles = values.has("--cycles") ? positiveInt("--cycles", values.get("--cycles")!) : null;
  const endDate = values.get("--end-date") ?? null;
  if (cycles !== null && endDate !== null) throw new Error("Usá --cycles o --end-date, no los dos.");
  if (endDate !== null && Number.isNaN(Date.parse(endDate))) throw new Error(`--end-date no es una fecha ISO (vino "${endDate}").`);

  return {
    frequency: positiveInt("--freq", values.get("--freq") ?? "1"),
    frequencyType: frequencyType("--unit", values.get("--unit") ?? "months"),
    amount: positiveInt("--amount", values.get("--amount") ?? String(DEFAULT_AMOUNT_ARS)),
    trial: trialRaw === undefined ? null : { frequency: positiveInt("--trial", trialRaw), frequencyType: trialUnit },
    cycles,
    endDate,
    noEmail: flags.has("--no-email"),
    idempotencyKey: values.get("--idem") ?? null,
    externalReference: values.get("--ref") ?? null,
    open: flags.has("--open"),
  };
}

function addPeriod(date: Date, amount: number, unit: FrequencyType): Date {
  const out = new Date(date.getTime());
  if (unit === "months") out.setUTCMonth(out.getUTCMonth() + amount);
  else out.setUTCDate(out.getUTCDate() + amount);
  return out;
}

/**
 * `end_date` para que una `preapproval` haga exactamente N cobros (pack, S5): medio período después
 * del último cobro esperado (ahora + prueba + (N-1) períodos). Si MP cuenta distinto, S5 lo muestra.
 */
export function computeEndDate(params: {
  now: Date;
  frequency: number;
  frequencyType: FrequencyType;
  trial: CreateOptions["trial"];
  cycles: number;
}): string {
  const firstCharge = params.trial ? addPeriod(params.now, params.trial.frequency, params.trial.frequencyType) : params.now;
  const lastCharge = addPeriod(firstCharge, params.frequency * (params.cycles - 1), params.frequencyType);
  const halfPeriodMs = params.frequencyType === "months"
    ? params.frequency * 15 * 24 * 60 * 60 * 1000
    : params.frequency * 12 * 60 * 60 * 1000;
  return new Date(lastCharge.getTime() + halfPeriodMs).toISOString();
}

export function makeExternalReference(randomBytes: Uint8Array): string {
  return `sbx_${Buffer.from(randomBytes).toString("hex")}`;
}

export function buildPreapprovalBody(params: {
  opts: CreateOptions;
  externalReference: string;
  backUrl: string;
  payerEmail?: string;
  now: Date;
}): SandboxPreapprovalBody {
  const { opts } = params;
  if (!params.backUrl) throw new Error("Falta MP_SUBS_BACK_URL (URL pública del túnel + /volver).");
  if (!opts.noEmail && !params.payerEmail) throw new Error("Falta MP_SUBS_BUYER_EMAIL (o usá --no-email).");

  const autoRecurring: SandboxPreapprovalBody["auto_recurring"] = {
    frequency: opts.frequency,
    frequency_type: opts.frequencyType,
    transaction_amount: opts.amount,
    currency_id: "ARS",
  };
  if (opts.trial) autoRecurring.free_trial = { frequency: opts.trial.frequency, frequency_type: opts.trial.frequencyType };
  if (opts.endDate) autoRecurring.end_date = opts.endDate;
  else if (opts.cycles !== null) {
    autoRecurring.end_date = computeEndDate({
      now: params.now,
      frequency: opts.frequency,
      frequencyType: opts.frequencyType,
      trial: opts.trial,
      cycles: opts.cycles,
    });
  }

  const body: SandboxPreapprovalBody = {
    reason: SANDBOX_REASON,
    external_reference: params.externalReference,
    back_url: params.backUrl,
    status: "pending",
    auto_recurring: autoRecurring,
  };
  if (!opts.noEmail) body.payer_email = params.payerEmail;
  return body;
}

type Loose = Record<string, unknown>;
const asObject = (value: unknown): Loose => (value !== null && typeof value === "object" ? (value as Loose) : {});

/** Lo que el informe necesita de una `preapproval` (create/get/search/cancel), ya redactado. */
export function projectPreapproval(response: unknown, sellerId: number | string | null): unknown {
  const r = asObject(response);
  const autoRecurring = asObject(r.auto_recurring);
  const freeTrial = autoRecurring.free_trial;
  const collector = r.collector_id;
  return redactMercadoPagoResource({
    id: r.id,
    status: r.status,
    external_reference: r.external_reference,
    reason: r.reason,
    back_url: r.back_url,
    init_point: r.init_point,
    date_created: r.date_created,
    last_modified: r.last_modified,
    next_payment_date: r.next_payment_date,
    auto_recurring: r.auto_recurring,
    // S15: el SDK tipa free_trial como string; la API puede devolver un objeto.
    free_trial_type: freeTrial === null ? "null" : freeTrial === undefined ? "missing" : typeof freeTrial,
    summarized: r.summarized,
    collector_id: collector,
    payer_id: r.payer_id,
    // S13: se compara con los ids completos antes de acortarlos.
    collector_matches_seller: collector === undefined || collector === null || sellerId === null
      ? null
      : String(collector) === String(sellerId),
    http_status: asObject(r.api_response).status,
  });
}

/** `authorized_payments` (Invoice del SDK), S10/S11. */
export function projectInvoice(invoice: unknown): unknown {
  const i = asObject(invoice);
  const payment = asObject(i.payment);
  return redactMercadoPagoResource({
    id: i.id,
    status: i.status,
    type: i.type,
    payment: i.payment === undefined ? undefined : { id: payment.id, status: payment.status, status_detail: payment.status_detail },
    date_created: i.date_created,
    last_modified: i.last_modified,
    debit_date: i.debit_date,
    retry_attempt: i.retry_attempt,
    next_retry_date: i.next_retry_date,
    transaction_amount: i.transaction_amount,
    currency_id: i.currency_id,
    preapproval_id: i.preapproval_id,
  });
}

/** `/v1/payments/{id}` (S12): sin datos del pagador ni de la tarjeta. */
export function projectPayment(payment: unknown): unknown {
  const p = asObject(payment);
  return redactMercadoPagoResource({
    id: p.id,
    status: p.status,
    status_detail: p.status_detail,
    transaction_amount: p.transaction_amount,
    transaction_amount_refunded: p.transaction_amount_refunded,
    currency_id: p.currency_id,
    collector_id: p.collector_id,
    external_reference: p.external_reference,
    metadata: p.metadata,
    point_of_interaction: p.point_of_interaction,
    operation_type: p.operation_type,
    date_approved: p.date_approved,
    date_last_updated: p.date_last_updated,
  });
}

/** Error del SDK (`MercadoPagoError`: status, error, message, causes) o un Error común, redactado. */
export function describeMercadoPagoError(error: unknown): unknown {
  if (error instanceof Error && !("status" in error) && !("cause" in error && error.cause)) {
    return redactMercadoPagoResource({ message: error.message });
  }
  const e = asObject(error);
  const out: Loose = {};
  for (const key of ["name", "status", "error", "message", "cause", "causes"]) if (e[key] !== undefined) out[key] = e[key];
  if (Object.keys(out).length === 0) out.message = String(error);
  return redactMercadoPagoResource(out);
}
