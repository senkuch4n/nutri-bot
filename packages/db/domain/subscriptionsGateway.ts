// HU-029b (SDD §B.5.2): cliente de la API de suscripciones de Mercado Pago con la cuenta de cobro de
// Arzium (D3a). Es el ÚNICO archivo que lee ARZIUM_MERCADOPAGO_ACCESS_TOKEN: nunca va a la base, a logs ni
// al navegador. No importa mercadopagoAccount.ts ni getMercadoPagoCredentials (las cuentas de señas de los
// consultorios son otra cosa).
//
// Reintentos: ninguno, ni del SDK ni propios (maxRetries: 0 en todas las llamadas). MP ignora
// X-Idempotency-Key en POST /preapproval (S4 refutado), así que un POST repetido a ciegas puede crear una
// segunda preapproval; la deduplicación es la de subscriptions.ts (lease + búsqueda por referencia). Las
// lecturas tampoco reintentan para que búsqueda + creación entren en el lease de 45 s.
// Los errores del SDK se re-tiran tal cual, sin loguearlos (pueden traer headers): los llamadores solo
// loguean códigos.
import { MercadoPagoConfig, Invoice, Payment, PreApproval } from "mercadopago";
import { resolveSubscriptionBillingConfig } from "@nutri-bot/core";

export type ArziumPreapprovalCreate = {
  reason: string;
  external_reference: string;
  back_url: string;
  status: "pending";
  /** Obligatorio (G3 refutada, 2026-11-27); normalizado con normalizePayerEmail. */
  payer_email: string;
  auto_recurring: {
    frequency: number;
    frequency_type: "days" | "months";
    transaction_amount: number;
    currency_id: string;
    free_trial?: { frequency: number; frequency_type: "days" | "months" };
    /** Solo packs (G4). Nunca mientras PLAN_BILLING_CYCLES_SUPPORTED = false. */
    end_date?: string;
  };
};

export type ArziumMercadoPagoGateway = {
  /** idempotencyKey va en X-Idempotency-Key, pero MP la IGNORA en POST /preapproval (S4 refutado). El
   *  gateway nunca reintenta un POST. */
  createPreapproval(body: ArziumPreapprovalCreate, idempotencyKey: string): Promise<unknown>;
  getPreapproval(id: string): Promise<unknown>;
  /** PUT { status: "cancelled" }. */
  cancelPreapproval(id: string): Promise<unknown>;
  /** S2 confirmado. Todas las preapproval con esa referencia, en cualquier status (results[]). */
  searchPreapprovalsByReference(externalReference: string): Promise<unknown[]>;
  // 029c:
  getAuthorizedPayment(id: string): Promise<unknown>;
  searchAuthorizedPayments(preapprovalId: string): Promise<unknown[]>;
  getPayment(id: string): Promise<unknown>;
};

export class SubscriptionBillingUnavailableError extends Error {
  readonly code: "disabled" | "misconfigured";
  constructor(code: "disabled" | "misconfigured") {
    super(`subscription_billing:${code}`);
    this.name = "SubscriptionBillingUnavailableError";
    this.code = code;
  }
}

const TIMEOUT_MS = 10_000;

/** Lanza SubscriptionBillingUnavailableError si la config no es "enabled". */
export function createArziumMercadoPagoGateway(
  env: Record<string, string | undefined> = process.env,
): ArziumMercadoPagoGateway {
  const config = resolveSubscriptionBillingConfig(env);
  if (config.status !== "enabled") throw new SubscriptionBillingUnavailableError(config.status);
  const accessToken = env.ARZIUM_MERCADOPAGO_ACCESS_TOKEN!.trim();

  // Un MercadoPagoConfig nuevo por llamada: el SDK (3.x) mezcla los requestOptions en `config.options`
  // y los deja puestos para las llamadas siguientes (p. ej. la idempotency key del create).
  const client = (extra?: { idempotencyKey?: string }) =>
    new MercadoPagoConfig({ accessToken, options: { timeout: TIMEOUT_MS, maxRetries: 0, ...extra } });

  return {
    async createPreapproval(body, idempotencyKey) {
      // Cast local documentado: el `PreApprovalRequest` del SDK no declara auto_recurring.free_trial.
      return new PreApproval(client({ idempotencyKey })).create({
        body: body as unknown as Parameters<PreApproval["create"]>[0]["body"],
      });
    },
    async getPreapproval(id) {
      return new PreApproval(client()).get({ id });
    },
    async cancelPreapproval(id) {
      return new PreApproval(client()).update({ id, body: { status: "cancelled" } });
    },
    async searchPreapprovalsByReference(externalReference) {
      const response = await new PreApproval(client()).search({ options: { external_reference: externalReference } });
      return Array.isArray(response.results) ? (response.results as unknown[]) : [];
    },
    async getAuthorizedPayment(id) {
      return new Invoice(client()).get({ id });
    },
    async searchAuthorizedPayments(preapprovalId) {
      const response = await new Invoice(client()).search({ options: { preapproval_id: preapprovalId } });
      return Array.isArray(response.results) ? (response.results as unknown[]) : [];
    },
    async getPayment(id) {
      return new Payment(client()).get({ id });
    },
  };
}
