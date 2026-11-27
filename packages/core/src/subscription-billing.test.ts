// HU-029b (SDD §B.9.1): lógica pura de la suscripción de Arzium. Sin base ni red.
import { describe, expect, it } from "vitest";
import {
  ALLOWED_MONTH_FREQUENCIES,
  MP_MAX_AMOUNT_ARS,
  MP_MIN_AMOUNT_ARS,
  PLAN_BILLING_CYCLES_SUPPORTED,
  STALE_CHECKOUT_TRIAL_LOSS_MS,
  SUBSCRIPTION_TEXT,
  addBillingPeriod,
  checkPreapprovalAgainstSubscription,
  classifyPreapprovalCreateError,
  computeTrialEnd,
  decideSubscriptionStatus,
  formatPlanPrice,
  formatTrialLength,
  isCheckoutStale,
  isTrialEligible,
  normalizePayerEmail,
  parsePreapproval,
  resolveSubscriptionBillingConfig,
  resolveTrialEnd,
  toCents,
  validatePlanTerms,
  type PlanTerms,
  type PreapprovalSnapshot,
} from "./subscription-billing";

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

describe("resolveSubscriptionBillingConfig", () => {
  const full = {
    ARZIUM_SUBSCRIPTIONS_ENABLED: "true",
    ARZIUM_MERCADOPAGO_MODE: "sandbox",
    ARZIUM_MERCADOPAGO_ACCESS_TOKEN: "TEST-secret-token-value",
    ARZIUM_MERCADOPAGO_USER_ID: "123456789",
    ARZIUM_MERCADOPAGO_WEBHOOK_SECRET: "webhook-secret-value",
    NODE_ENV: "development",
  };

  it("sin ENABLED (o distinto de \"true\") → disabled", () => {
    expect(resolveSubscriptionBillingConfig({})).toEqual({ status: "disabled" });
    expect(resolveSubscriptionBillingConfig({ ...full, ARZIUM_SUBSCRIPTIONS_ENABLED: "TRUE" })).toEqual({ status: "disabled" });
    expect(resolveSubscriptionBillingConfig({ ...full, ARZIUM_SUBSCRIPTIONS_ENABLED: "false" })).toEqual({ status: "disabled" });
    expect(resolveSubscriptionBillingConfig({ ...full, ARZIUM_SUBSCRIPTIONS_ENABLED: undefined })).toEqual({ status: "disabled" });
  });

  it("ENABLED=true con todo → enabled con modo y cobrador", () => {
    expect(resolveSubscriptionBillingConfig(full)).toEqual({ status: "enabled", mode: "SANDBOX", collectorUserId: "123456789" });
    expect(resolveSubscriptionBillingConfig({ ...full, ARZIUM_MERCADOPAGO_MODE: "live", NODE_ENV: "production" })).toEqual({
      status: "enabled",
      mode: "LIVE",
      collectorUserId: "123456789",
    });
  });

  it.each([
    ["ARZIUM_MERCADOPAGO_ACCESS_TOKEN"],
    ["ARZIUM_MERCADOPAGO_WEBHOOK_SECRET"],
    ["ARZIUM_MERCADOPAGO_USER_ID"],
    ["ARZIUM_MERCADOPAGO_MODE"],
  ])("falta %s → misconfigured con ese nombre", (name) => {
    expect(resolveSubscriptionBillingConfig({ ...full, [name]: "" })).toEqual({ status: "misconfigured", missing: [name] });
    expect(resolveSubscriptionBillingConfig({ ...full, [name]: undefined })).toEqual({ status: "misconfigured", missing: [name] });
  });

  it("varias faltantes → todas, en orden fijo", () => {
    expect(resolveSubscriptionBillingConfig({ ARZIUM_SUBSCRIPTIONS_ENABLED: "true" })).toEqual({
      status: "misconfigured",
      missing: [
        "ARZIUM_MERCADOPAGO_MODE",
        "ARZIUM_MERCADOPAGO_ACCESS_TOKEN",
        "ARZIUM_MERCADOPAGO_USER_ID",
        "ARZIUM_MERCADOPAGO_WEBHOOK_SECRET",
      ],
    });
  });

  it("USER_ID con letras → misconfigured", () => {
    expect(resolveSubscriptionBillingConfig({ ...full, ARZIUM_MERCADOPAGO_USER_ID: "12ab" })).toEqual({
      status: "misconfigured",
      missing: ["ARZIUM_MERCADOPAGO_USER_ID"],
    });
  });

  it("live fuera de producción y sandbox en producción → misconfigured (MODE)", () => {
    expect(resolveSubscriptionBillingConfig({ ...full, ARZIUM_MERCADOPAGO_MODE: "live", NODE_ENV: "development" })).toEqual({
      status: "misconfigured",
      missing: ["ARZIUM_MERCADOPAGO_MODE"],
    });
    expect(resolveSubscriptionBillingConfig({ ...full, NODE_ENV: "production" })).toEqual({
      status: "misconfigured",
      missing: ["ARZIUM_MERCADOPAGO_MODE"],
    });
    expect(resolveSubscriptionBillingConfig({ ...full, ARZIUM_MERCADOPAGO_MODE: "prod" })).toEqual({
      status: "misconfigured",
      missing: ["ARZIUM_MERCADOPAGO_MODE"],
    });
  });

  it("nunca aparece un valor en missing", () => {
    const r = resolveSubscriptionBillingConfig({ ...full, ARZIUM_MERCADOPAGO_USER_ID: "abc", NODE_ENV: "production" });
    const text = JSON.stringify(r);
    expect(text).not.toContain("TEST-secret-token-value");
    expect(text).not.toContain("webhook-secret-value");
    expect(text).not.toContain("abc\"");
  });
});

describe("validatePlanTerms", () => {
  const monthly: PlanTerms = {
    amount: "60000.00",
    currency: "ARS",
    frequency: 1,
    frequencyUnit: "MONTHS",
    trialLength: 7,
    trialUnit: "DAYS",
    billingCycles: null,
  };

  it("constantes de la corrida en sandbox (S5, G4, S16)", () => {
    expect(ALLOWED_MONTH_FREQUENCIES).toEqual([1, 3, 6, 12]);
    expect(PLAN_BILLING_CYCLES_SUPPORTED).toBe(false);
    expect(MP_MIN_AMOUNT_ARS).toBe(15);
    expect(MP_MAX_AMOUNT_ARS).toBe(2_000_000);
  });

  it("el mensual sembrado es válido en los dos modos", () => {
    expect(validatePlanTerms(monthly, "LIVE")).toEqual({ ok: true });
    expect(validatePlanTerms(monthly, "SANDBOX")).toEqual({ ok: true });
  });

  it.each([3, 6, 12])("%i meses ok", (frequency) => {
    expect(validatePlanTerms({ ...monthly, frequency }, "LIVE")).toEqual({ ok: true });
  });

  it("anual de 600000.00 ok", () => {
    expect(validatePlanTerms({ ...monthly, amount: "600000.00", frequency: 12, trialLength: null, trialUnit: null }, "LIVE")).toEqual({ ok: true });
  });

  it.each(["0", "-1", "1.005", "abc", "", "1e3"])("importe %j → invalid_amount", (amount) => {
    expect(validatePlanTerms({ ...monthly, amount }, "LIVE")).toEqual({ ok: false, error: "invalid_amount" });
  });

  it.each(["14.99", "2000000.01"])("importe %s → amount_out_of_range (S16)", (amount) => {
    expect(validatePlanTerms({ ...monthly, amount }, "LIVE")).toEqual({ ok: false, error: "amount_out_of_range" });
  });

  it.each(["15.00", "2000000.00"])("importe %s (borde) ok", (amount) => {
    expect(validatePlanTerms({ ...monthly, amount }, "LIVE")).toEqual({ ok: true });
  });

  it("USD → invalid_currency", () => {
    expect(validatePlanTerms({ ...monthly, currency: "USD" }, "LIVE")).toEqual({ ok: false, error: "invalid_currency" });
  });

  it("5 meses → invalid_frequency; 0 y 1.5 también", () => {
    expect(validatePlanTerms({ ...monthly, frequency: 5 }, "LIVE")).toEqual({ ok: false, error: "invalid_frequency" });
    expect(validatePlanTerms({ ...monthly, frequency: 0 }, "LIVE")).toEqual({ ok: false, error: "invalid_frequency" });
    expect(validatePlanTerms({ ...monthly, frequency: 1.5 }, "LIVE")).toEqual({ ok: false, error: "invalid_frequency" });
  });

  it("DAYS como período: solo SANDBOX y 1..365", () => {
    const daily = { ...monthly, frequency: 1, frequencyUnit: "DAYS" as const };
    expect(validatePlanTerms(daily, "LIVE")).toEqual({ ok: false, error: "days_only_in_sandbox" });
    expect(validatePlanTerms(daily, "SANDBOX")).toEqual({ ok: true });
    expect(validatePlanTerms({ ...daily, frequency: 366 }, "SANDBOX")).toEqual({ ok: false, error: "invalid_frequency" });
  });

  it("prueba con un solo campo, 0 o fuera de rango → invalid_trial", () => {
    expect(validatePlanTerms({ ...monthly, trialUnit: null }, "LIVE")).toEqual({ ok: false, error: "invalid_trial" });
    expect(validatePlanTerms({ ...monthly, trialLength: null }, "LIVE")).toEqual({ ok: false, error: "invalid_trial" });
    expect(validatePlanTerms({ ...monthly, trialLength: 0 }, "LIVE")).toEqual({ ok: false, error: "invalid_trial" });
    expect(validatePlanTerms({ ...monthly, trialLength: 91 }, "LIVE")).toEqual({ ok: false, error: "invalid_trial" });
    expect(validatePlanTerms({ ...monthly, trialLength: 13, trialUnit: "MONTHS" }, "LIVE")).toEqual({ ok: false, error: "invalid_trial" });
    expect(validatePlanTerms({ ...monthly, trialLength: 1, trialUnit: "MONTHS" }, "LIVE")).toEqual({ ok: true });
  });

  it("billingCycles: 1 → cycles_not_supported (G4 sin confirmar)", () => {
    expect(validatePlanTerms({ ...monthly, billingCycles: 1 }, "LIVE")).toEqual({ ok: false, error: "cycles_not_supported" });
  });
});

describe("toCents", () => {
  it("convierte Decimal serializado y número", () => {
    expect(toCents("60000.00")).toBe(6_000_000);
    expect(toCents(60000)).toBe(6_000_000);
    expect(toCents("0.10")).toBe(10);
    expect(toCents(0.1)).toBe(10);
  });
  it("notación exponencial y valores no numéricos tiran", () => {
    expect(() => toCents("1e3")).toThrow();
    expect(() => toCents("abc")).toThrow();
    expect(() => toCents(Number.NaN)).toThrow();
  });
});

describe("fechas", () => {
  it("addBillingPeriod: meses con clamp a fin de mes, 12 meses, días = 24 h", () => {
    expect(addBillingPeriod(new Date(2027, 0, 31, 12), 1, "MONTHS")).toEqual(new Date(2027, 1, 28, 12));
    expect(addBillingPeriod(new Date(2028, 0, 31, 12), 1, "MONTHS")).toEqual(new Date(2028, 1, 29, 12));
    expect(addBillingPeriod(new Date(2027, 2, 15, 12), 12, "MONTHS")).toEqual(new Date(2028, 2, 15, 12));
    const from = new Date("2027-03-10T14:00:00Z");
    expect(addBillingPeriod(from, 7, "DAYS").getTime() - from.getTime()).toBe(168 * HOUR);
  });

  it("computeTrialEnd: 7 días = +168 h; meses de 30 días (como MP); sin prueba → null", () => {
    const from = new Date("2027-01-31T12:00:00Z");
    expect(computeTrialEnd(from, 7, "DAYS")!.getTime() - from.getTime()).toBe(168 * HOUR);
    expect(computeTrialEnd(from, 1, "MONTHS")).toEqual(new Date("2027-03-02T12:00:00Z"));
    expect(computeTrialEnd(from, 2, "MONTHS")!.getTime() - from.getTime()).toBe(60 * DAY);
    expect(computeTrialEnd(from, null, null)).toBeNull();
  });

  describe("resolveTrialEnd (S9: la prueba corre desde la creación)", () => {
    const created = new Date("2027-04-01T14:31:30Z");
    const authorizedAt = new Date("2027-04-01T14:36:00Z");
    const trial = { trialLength: 7, trialUnit: "DAYS" as const };

    it("devuelve el next_payment_date de MP (creación + 7 d), no autorización + 7 d", () => {
      const npd = new Date(created.getTime() + 7 * DAY);
      expect(resolveTrialEnd({ authorizedAt, nextPaymentDate: npd, startDate: created, ...trial })).toEqual(npd);
    });
    it("sin nextPaymentDate → startDate + 7 d", () => {
      expect(resolveTrialEnd({ authorizedAt, nextPaymentDate: null, startDate: created, ...trial })).toEqual(new Date(created.getTime() + 7 * DAY));
    });
    it("sin startDate → authorizedAt + 7 d", () => {
      expect(resolveTrialEnd({ authorizedAt, nextPaymentDate: null, startDate: null, ...trial })).toEqual(new Date(authorizedAt.getTime() + 7 * DAY));
    });
    it("nextPaymentDate más allá de autorización + 7 d + 1 h → respaldo", () => {
      const tooFar = new Date(authorizedAt.getTime() + 7 * DAY + HOUR + 1000);
      expect(resolveTrialEnd({ authorizedAt, nextPaymentDate: tooFar, startDate: created, ...trial })).toEqual(new Date(created.getTime() + 7 * DAY));
    });
    it("nextPaymentDate pasada (autorizó 10 días después de crear) → la devuelve igual", () => {
      const late = new Date(created.getTime() + 10 * DAY);
      const npd = new Date(created.getTime() + 7 * DAY);
      expect(resolveTrialEnd({ authorizedAt: late, nextPaymentDate: npd, startDate: created, ...trial })).toEqual(npd);
    });
    it("sin prueba → null", () => {
      expect(resolveTrialEnd({ authorizedAt, nextPaymentDate: new Date(), startDate: created, trialLength: null, trialUnit: null })).toBeNull();
    });
  });

  describe("isCheckoutStale (DP1: umbral de 1 h)", () => {
    const now = new Date("2027-04-03T10:00:00Z");
    const trial = { trialGranted: true, trialLength: 7, trialUnit: "DAYS" as const, now };
    const fullEnd = now.getTime() + 7 * DAY;

    it("umbral = 1 h", () => {
      expect(STALE_CHECKOUT_TRIAL_LOSS_MS).toBe(HOUR);
    });
    it("pérdida de 59 min → false; 61 min → true", () => {
      expect(isCheckoutStale({ ...trial, nextPaymentDate: new Date(fullEnd - 59 * 60 * 1000) })).toBe(false);
      expect(isCheckoutStale({ ...trial, nextPaymentDate: new Date(fullEnd - 61 * 60 * 1000) })).toBe(true);
    });
    it("sin prueba o sin nextPaymentDate → false", () => {
      expect(isCheckoutStale({ ...trial, trialGranted: false, nextPaymentDate: new Date(fullEnd - 2 * DAY) })).toBe(false);
      expect(isCheckoutStale({ ...trial, nextPaymentDate: null })).toBe(false);
    });
  });
});

describe("normalizePayerEmail", () => {
  it("trim + minúsculas", () => {
    expect(normalizePayerEmail("  Ana@Mail.COM ")).toEqual({ ok: true, email: "ana@mail.com" });
  });
  it.each([
    ["vacío", ""],
    ["sin @", "ana.mail.com"],
    ["sin punto en el dominio", "ana@mail"],
    ["espacios internos", "ana maria@mail.com"],
    ["255 caracteres", `${"a".repeat(245)}@mail.com.a`],
    ["no string", 42],
    ["null", null],
  ])("%s → { ok: false }", (_name, raw) => {
    expect(normalizePayerEmail(raw)).toEqual({ ok: false });
  });
  it("254 caracteres → ok", () => {
    const email = `${"a".repeat(244)}@mail.com`;
    expect(email.length).toBe(253);
    expect(normalizePayerEmail(`${email}a`).ok).toBe(true);
  });
});

describe("classifyPreapprovalCreateError", () => {
  it.each([
    [{ status: 400, message: "payer_email is required" }, "payer_email_required"],
    [{ status: 400, message: "User bad request" }, "payer_email_rejected"],
    [{ statusCode: 400, error: "User bad request" }, "payer_email_rejected"],
    [{ status: 400, message: "Cannot pay an amount lower than $ 15.00" }, "amount_out_of_range"],
    [{ status: 404, message: "x" }, "rejected"],
    [{ status: 400, message: "otra cosa" }, "rejected"],
    [{ status: 500 }, "ambiguous"],
    [{ status: 503, message: "User bad request" }, "ambiguous"],
    [{ status: 408 }, "ambiguous"],
    [new Error("timeout"), "ambiguous"],
    ["x", "ambiguous"],
    [null, "ambiguous"],
    [{}, "ambiguous"],
    [{ status: "400", message: "User bad request" }, "ambiguous"],
  ])("%j → %s", (err, kind) => {
    expect(classifyPreapprovalCreateError(err)).toBe(kind);
  });
});

describe("isTrialEligible", () => {
  it.each([
    ["plan sin prueba", { planHasTrial: false, priorTrialUsed: false, offer: null }, false],
    ["primera vez", { planHasTrial: true, priorTrialUsed: false, offer: null }, true],
    ["usada sin oferta", { planHasTrial: true, priorTrialUsed: true, offer: null }, false],
    ["usada con oferta allowTrial sin usar", { planHasTrial: true, priorTrialUsed: true, offer: { allowTrial: true, used: false } }, true],
    ["oferta usada", { planHasTrial: true, priorTrialUsed: true, offer: { allowTrial: true, used: true } }, false],
    ["oferta sin allowTrial", { planHasTrial: true, priorTrialUsed: true, offer: { allowTrial: false, used: false } }, false],
  ])("%s → %s", (_name, input, expected) => {
    expect(isTrialEligible(input)).toBe(expected);
  });
});

// Forma real de la corrida en sandbox (docs/mp-suscripciones-sandbox.md, S15), con datos ficticios.
const sdkPreapproval = {
  id: "2c9380849abc",
  status: "Pending",
  collector_id: 123456789,
  payer_id: 987654321,
  payer_email: "comprador@example.test",
  external_reference: "sub_0123456789abcdef0123456789abcdef",
  init_point: "https://www.mercadopago.com.ar/subscriptions/checkout?preapproval_id=2c9380849abc",
  next_payment_date: "2027-04-08T14:31:30.000-04:00",
  date_created: "2027-04-01T14:31:30.000-04:00",
  last_modified: "2027-04-01T14:31:31.000-04:00",
  auto_recurring: {
    frequency: 1,
    frequency_type: "months",
    transaction_amount: 60000,
    currency_id: "ARS",
    start_date: "2027-04-01T14:31:30.000-04:00",
    free_trial: { frequency: 7, frequency_type: "days", first_invoice_offset: 7 },
  },
};

describe("parsePreapproval", () => {
  it("respuesta completa del SDK", () => {
    expect(parsePreapproval(sdkPreapproval)).toEqual({
      id: "2c9380849abc",
      status: "pending",
      collectorId: "123456789",
      payerId: "987654321",
      externalReference: "sub_0123456789abcdef0123456789abcdef",
      amount: 60000,
      currency: "ARS",
      frequency: 1,
      frequencyType: "months",
      initPoint: "https://www.mercadopago.com.ar/subscriptions/checkout?preapproval_id=2c9380849abc",
      nextPaymentDate: new Date("2027-04-08T14:31:30.000-04:00"),
      startDate: new Date("2027-04-01T14:31:30.000-04:00"),
      freeTrial: { frequency: 7, frequencyType: "days" },
      lastModified: new Date("2027-04-01T14:31:31.000-04:00"),
    } satisfies PreapprovalSnapshot);
  });
  it("payer_email nunca aparece en el resultado", () => {
    expect(JSON.stringify(parsePreapproval(sdkPreapproval))).not.toContain("comprador@example.test");
  });
  it("sin id o sin status → null; no objeto → null", () => {
    expect(parsePreapproval({ ...sdkPreapproval, id: undefined })).toBeNull();
    expect(parsePreapproval({ ...sdkPreapproval, status: undefined })).toBeNull();
    expect(parsePreapproval(null)).toBeNull();
    expect(parsePreapproval("x")).toBeNull();
  });
  it("free_trial string u otra forma → freeTrial null; sin auto_recurring → campos null", () => {
    expect(parsePreapproval({ ...sdkPreapproval, auto_recurring: { ...sdkPreapproval.auto_recurring, free_trial: "7 days" } })!.freeTrial).toBeNull();
    const bare = parsePreapproval({ id: "x1", status: "authorized" })!;
    expect(bare).toMatchObject({ amount: null, currency: null, frequency: null, frequencyType: null, freeTrial: null, startDate: null, collectorId: null });
  });
  it("fechas inválidas → null", () => {
    expect(parsePreapproval({ ...sdkPreapproval, next_payment_date: "no-date" })!.nextPaymentDate).toBeNull();
  });
});

describe("checkPreapprovalAgainstSubscription", () => {
  const snapshot = parsePreapproval(sdkPreapproval)!;
  const expected = {
    preapprovalId: null,
    externalReference: "sub_0123456789abcdef0123456789abcdef",
    collectorUserId: "123456789",
    amount: "60000.00",
    currency: "ARS",
    frequency: 1,
    frequencyUnit: "MONTHS" as const,
    trialGranted: true,
    trialLength: 7,
    trialUnit: "DAYS" as const,
  };

  it("ok (60000 vs \"60000.00\")", () => {
    expect(checkPreapprovalAgainstSubscription(snapshot, expected)).toEqual({ ok: true });
    expect(checkPreapprovalAgainstSubscription(snapshot, { ...expected, preapprovalId: "2c9380849abc" })).toEqual({ ok: true });
  });
  it("collectorId null aceptado", () => {
    expect(checkPreapprovalAgainstSubscription({ ...snapshot, collectorId: null }, expected)).toEqual({ ok: true });
  });
  it.each([
    ["id_mismatch", { ...expected, preapprovalId: "otro" }, snapshot],
    ["collector_mismatch", expected, { ...snapshot, collectorId: "555" }],
    ["reference_mismatch", expected, { ...snapshot, externalReference: "sub_otra" }],
    ["reference_mismatch", expected, { ...snapshot, externalReference: null }],
    ["amount_mismatch", expected, { ...snapshot, amount: 59999.99 }],
    ["amount_mismatch", expected, { ...snapshot, amount: null }],
    ["currency_mismatch", expected, { ...snapshot, currency: "USD" }],
    ["frequency_mismatch", expected, { ...snapshot, frequency: 3 }],
    ["frequency_mismatch", expected, { ...snapshot, frequencyType: "days" }],
    ["trial_mismatch", expected, { ...snapshot, freeTrial: null }],
    ["trial_mismatch", expected, { ...snapshot, freeTrial: { frequency: 8, frequencyType: "days" } }],
    ["trial_mismatch", expected, { ...snapshot, freeTrial: { frequency: 7, frequencyType: "months" } }],
    ["trial_mismatch", { ...expected, trialGranted: false }, snapshot],
  ] as const)("%s", (reason, exp, snap) => {
    expect(checkPreapprovalAgainstSubscription(snap as PreapprovalSnapshot, exp)).toEqual({ ok: false, reason });
  });
  it("sin prueba pedida y sin free_trial → ok", () => {
    expect(
      checkPreapprovalAgainstSubscription({ ...snapshot, freeTrial: null }, { ...expected, trialGranted: false }),
    ).toEqual({ ok: true });
  });
  it("orden: id antes que collector", () => {
    expect(
      checkPreapprovalAgainstSubscription({ ...snapshot, collectorId: "555" }, { ...expected, preapprovalId: "otro" }),
    ).toEqual({ ok: false, reason: "id_mismatch" });
  });
});

describe("decideSubscriptionStatus", () => {
  const none = { everApproved: false, latestOutcome: null } as const;
  const base = { current: "PENDING" as const, trialGranted: true, charges: none, cancelRequestedRecently: false };

  it("CANCELED es terminal (también ante authorized)", () => {
    expect(decideSubscriptionStatus({ ...base, current: "CANCELED", mpStatus: "authorized" })).toEqual({ kind: "ignore", reason: "terminated" });
    expect(decideSubscriptionStatus({ ...base, current: "CANCELED", mpStatus: "cancelled" })).toEqual({ kind: "ignore", reason: "terminated" });
  });
  it("cancelled/finished → CANCELED con origen PANEL o MERCADO_PAGO", () => {
    expect(decideSubscriptionStatus({ ...base, current: "TRIALING", mpStatus: "cancelled", cancelRequestedRecently: true })).toEqual({
      kind: "set", status: "CANCELED", cancelOrigin: "PANEL",
    });
    expect(decideSubscriptionStatus({ ...base, current: "TRIALING", mpStatus: "cancelled" })).toEqual({
      kind: "set", status: "CANCELED", cancelOrigin: "MERCADO_PAGO",
    });
    expect(decideSubscriptionStatus({ ...base, current: "ACTIVE", mpStatus: "finished" })).toEqual({
      kind: "set", status: "CANCELED", cancelOrigin: "MERCADO_PAGO",
    });
  });
  it("pending: PENDING si current es PENDING; si no, ignore unknown_status", () => {
    expect(decideSubscriptionStatus({ ...base, mpStatus: "pending" })).toEqual({ kind: "set", status: "PENDING", cancelOrigin: null });
    expect(decideSubscriptionStatus({ ...base, current: "TRIALING", mpStatus: "pending" })).toEqual({ kind: "ignore", reason: "unknown_status" });
  });
  it("paused → ignore paused", () => {
    expect(decideSubscriptionStatus({ ...base, current: "TRIALING", mpStatus: "paused" })).toEqual({ kind: "ignore", reason: "paused" });
  });
  it("authorized: failed → PAST_DUE; everApproved → ACTIVE; prueba → TRIALING; si no → PENDING (X8)", () => {
    expect(decideSubscriptionStatus({ ...base, mpStatus: "authorized", charges: { everApproved: true, latestOutcome: "failed" } })).toEqual({
      kind: "set", status: "PAST_DUE", cancelOrigin: null,
    });
    expect(decideSubscriptionStatus({ ...base, mpStatus: "authorized", charges: { everApproved: true, latestOutcome: "approved" } })).toEqual({
      kind: "set", status: "ACTIVE", cancelOrigin: null,
    });
    expect(decideSubscriptionStatus({ ...base, mpStatus: "authorized" })).toEqual({ kind: "set", status: "TRIALING", cancelOrigin: null });
    expect(decideSubscriptionStatus({ ...base, trialGranted: false, mpStatus: "authorized" })).toEqual({ kind: "set", status: "PENDING", cancelOrigin: null });
  });
  it("otro status → ignore unknown_status", () => {
    expect(decideSubscriptionStatus({ ...base, mpStatus: "weird" })).toEqual({ kind: "ignore", reason: "unknown_status" });
  });
});

describe("formatPlanPrice / formatTrialLength", () => {
  // formatPrice (es-AR) separa el símbolo con un espacio duro: "$ 60.000".
  const nb = " ";
  it.each([
    [{ amount: "60000.00", currency: "ARS", frequency: 1, frequencyUnit: "MONTHS" as const }, `$${nb}60.000 por mes`],
    [{ amount: "150000.00", currency: "ARS", frequency: 3, frequencyUnit: "MONTHS" as const }, `$${nb}150.000 cada 3 meses`],
    [{ amount: "600000.00", currency: "ARS", frequency: 12, frequencyUnit: "MONTHS" as const }, `$${nb}600.000 por año`],
    [{ amount: "1000.00", currency: "ARS", frequency: 2, frequencyUnit: "DAYS" as const }, `$${nb}1.000 cada 2 días`],
    [{ amount: "1000.00", currency: "ARS", frequency: 1, frequencyUnit: "DAYS" as const }, `$${nb}1.000 por día`],
  ])("%j → %s", (terms, text) => {
    expect(formatPlanPrice(terms)).toBe(text);
  });
  it.each([
    [7, "DAYS", "7 días"],
    [1, "DAYS", "1 día"],
    [1, "MONTHS", "1 mes"],
    [2, "MONTHS", "2 meses"],
  ] as const)("%i %s → %s", (n, unit, text) => {
    expect(formatTrialLength(n, unit)).toBe(text);
  });
});

describe("SUBSCRIPTION_TEXT (§B.7)", () => {
  it("textos fijos", () => {
    expect(SUBSCRIPTION_TEXT.tabLabel).toBe("Suscripción");
    expect(SUBSCRIPTION_TEXT.title).toBe("Suscripción");
    expect(SUBSCRIPTION_TEXT.summary).toEqual({
      PENDING: "Pendiente", TRIALING: "En prueba", ACTIVE: "Activa", PAST_DUE: "Pago pendiente", CANCELED: "Cancelada",
    });
    expect(SUBSCRIPTION_TEXT.payerEmailLabel).toBe("Email de tu cuenta de Mercado Pago");
    expect(SUBSCRIPTION_TEXT.payerEmailHelp).toBe("Es el email con el que entrás a Mercado Pago. Puede ser distinto del que usás en Numa.");
    expect(SUBSCRIPTION_TEXT.restartEmailHelp).toBe("Si te equivocaste de email, corregilo y tocá «Empezar de nuevo».");
    expect(SUBSCRIPTION_TEXT.unavailable).toBe("La suscripción todavía no está disponible. Te avisamos cuando lo esté.");
    expect(SUBSCRIPTION_TEXT.staffOnly).toBe("Solo la dueña del consultorio puede gestionar la suscripción.");
  });
  // B.0 R6: el aviso de "cobro de validación" no existe (la validación de tarjeta es un pago de $0). El nombre se
  // arma por partes para que el grep de la verificación (§B.9.6) no encuentre la clave en ningún lado.
  it("no existe el aviso de cobro de validación (B.0 R6)", () => {
    expect(["validation", "Charge"].join("") in SUBSCRIPTION_TEXT).toBe(false);
    expect(JSON.stringify(SUBSCRIPTION_TEXT)).not.toMatch(/validaci[oó]n/i);
  });
  it("errores nuevos de la corrida", () => {
    expect(SUBSCRIPTION_TEXT.errors.invalid_payer_email).toBe("Revisá el email: no parece válido.");
    expect(SUBSCRIPTION_TEXT.errors.payer_email_rejected).toBe(
      "Mercado Pago no reconoce ese email. Usá el email con el que entrás a tu cuenta de Mercado Pago.",
    );
    expect(SUBSCRIPTION_TEXT.errors.checkout_in_progress).toBe(
      "Estamos preparando tu suscripción en Mercado Pago. Probá de nuevo en unos segundos.",
    );
  });
  it("funciones de texto con datos", () => {
    expect(SUBSCRIPTION_TEXT.offerTrial("7 días", "$60.000 por mes", "jueves 8 de abril")).toBe(
      "Probá Numa gratis 7 días. Después, $60.000 por mes con Mercado Pago. Si cancelás antes del jueves 8 de abril, no se te cobra nada.",
    );
    expect(SUBSCRIPTION_TEXT.offerNoTrial("$60.000 por mes")).toBe("Suscribite a Numa por $60.000 por mes. El primer cobro se hace al autorizar.");
    expect(SUBSCRIPTION_TEXT.trialing("jueves 8 de abril", "$60.000", "jueves 8 de abril")).toBe(
      "Estás en la prueba gratis hasta el jueves 8 de abril. El primer cobro de $60.000 es el jueves 8 de abril.",
    );
    expect(SUBSCRIPTION_TEXT.active("$60.000", "lunes 3 de mayo")).toBe("Suscripción activa. Próximo cobro: $60.000 el lunes 3 de mayo.");
    expect(SUBSCRIPTION_TEXT.pastDue("tarjeta rechazada")).toBe(
      "No pudimos cobrar la suscripción (tarjeta rechazada). Mercado Pago lo vuelve a intentar. Revisá tu medio de pago en tu cuenta de Mercado Pago.",
    );
    expect(SUBSCRIPTION_TEXT.canceled("lunes 3 de mayo")).toBe("Cancelaste la suscripción el lunes 3 de mayo.");
    expect(SUBSCRIPTION_TEXT.canceledByMercadoPago("lunes 3 de mayo")).toBe("La suscripción se canceló en Mercado Pago el lunes 3 de mayo.");
    expect(SUBSCRIPTION_TEXT.paidUntil("lunes 3 de mayo")).toBe("Pagado hasta el lunes 3 de mayo.");
    expect(SUBSCRIPTION_TEXT.cancelConfirmTrial("jueves 8 de abril")).toBe("No se te va a cobrar más. La prueba termina el jueves 8 de abril.");
    expect(SUBSCRIPTION_TEXT.cancelConfirmActive("lunes 3 de mayo")).toBe("No se te va a cobrar más. Tenés acceso pago hasta el lunes 3 de mayo.");
  });
  it("todos los errores del dominio y de las acciones tienen texto", () => {
    expect(Object.keys(SUBSCRIPTION_TEXT.errors).sort()).toEqual(
      [
        "already_subscribed", "cancel_unconfirmed", "checkout_in_progress", "forbidden", "invalid_payer_email",
        "mp_unavailable", "not_available", "not_found", "nothing_to_cancel", "payer_email_rejected",
        "plan_not_offered", "restart_unconfirmed",
      ].sort(),
    );
  });
});
