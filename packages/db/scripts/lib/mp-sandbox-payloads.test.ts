import { describe, expect, it } from "vitest";
import {
  buildPreapprovalBody,
  computeEndDate,
  describeMercadoPagoError,
  makeExternalReference,
  parseCreateArgs,
  projectInvoice,
  projectPayment,
  projectPreapproval,
} from "./mp-sandbox-payloads";

const NOW = new Date("2026-11-25T12:00:00.000Z");

describe("parseCreateArgs", () => {
  it("uses the defaults of the SDD (monthly, $60.000, no trial)", () => {
    expect(parseCreateArgs([])).toEqual({
      frequency: 1,
      frequencyType: "months",
      amount: 60000,
      trial: null,
      cycles: null,
      endDate: null,
      noEmail: false,
      idempotencyKey: null,
      externalReference: null,
      open: false,
    });
  });

  it("parses every flag of the create subcommand", () => {
    expect(parseCreateArgs([
      "--freq", "3", "--unit", "months", "--trial", "7", "--trial-unit", "days", "--amount", "150000",
      "--cycles", "1", "--no-email", "--idem", "k-1", "--ref", "sbx_abc", "--open",
    ])).toEqual({
      frequency: 3,
      frequencyType: "months",
      amount: 150000,
      trial: { frequency: 7, frequencyType: "days" },
      cycles: 1,
      endDate: null,
      noEmail: true,
      idempotencyKey: "k-1",
      externalReference: "sbx_abc",
      open: true,
    });
  });

  it("defaults the trial unit to days and accepts an explicit end date", () => {
    const opts = parseCreateArgs(["--trial", "1", "--end-date", "2027-02-01T00:00:00.000Z"]);
    expect(opts.trial).toEqual({ frequency: 1, frequencyType: "days" });
    expect(opts.endDate).toBe("2027-02-01T00:00:00.000Z");
  });

  it("rejects invalid values and unknown flags", () => {
    expect(() => parseCreateArgs(["--unit", "weeks"])).toThrow(/--unit/);
    expect(() => parseCreateArgs(["--trial-unit", "years", "--trial", "1"])).toThrow(/--trial-unit/);
    expect(() => parseCreateArgs(["--freq", "0"])).toThrow(/--freq/);
    expect(() => parseCreateArgs(["--amount", "abc"])).toThrow(/--amount/);
    expect(() => parseCreateArgs(["--freq"])).toThrow(/--freq/);
    expect(() => parseCreateArgs(["--colour", "red"])).toThrow(/--colour/);
    expect(() => parseCreateArgs(["--cycles", "2", "--end-date", "2027-01-01"])).toThrow(/--cycles/);
    expect(() => parseCreateArgs(["--end-date", "mañana"])).toThrow(/--end-date/);
  });
});

describe("computeEndDate", () => {
  it("lands half a period after the last of N monthly charges (with trial)", () => {
    // 7 days of trial → first charge 2026-12-02; 3 charges → last 2027-02-02; + 15 days.
    expect(computeEndDate({ now: NOW, frequency: 1, frequencyType: "months", trial: { frequency: 7, frequencyType: "days" }, cycles: 3 }))
      .toBe("2027-02-17T12:00:00.000Z");
  });

  it("handles a single-charge pack with no trial", () => {
    expect(computeEndDate({ now: NOW, frequency: 3, frequencyType: "months", trial: null, cycles: 1 }))
      .toBe("2027-01-09T12:00:00.000Z");
  });

  it("handles daily frequency and a trial in months", () => {
    expect(computeEndDate({ now: NOW, frequency: 1, frequencyType: "days", trial: { frequency: 1, frequencyType: "months" }, cycles: 2 }))
      .toBe("2026-12-27T00:00:00.000Z");
  });
});

describe("makeExternalReference", () => {
  it("builds sbx_<hex> from the given bytes", () => {
    expect(makeExternalReference(Buffer.from([0xde, 0xad, 0xbe, 0xef]))).toBe("sbx_deadbeef");
  });
});

describe("buildPreapprovalBody", () => {
  it("builds a pending preapproval without plan, with free_trial and payer_email", () => {
    const opts = parseCreateArgs(["--trial", "7", "--trial-unit", "days"]);
    expect(buildPreapprovalBody({ opts, externalReference: "sbx_1", backUrl: "https://t.example/volver", payerEmail: "buyer@test", now: NOW }))
      .toEqual({
        reason: "Numa · prueba sandbox",
        external_reference: "sbx_1",
        back_url: "https://t.example/volver",
        status: "pending",
        payer_email: "buyer@test",
        auto_recurring: {
          frequency: 1,
          frequency_type: "months",
          transaction_amount: 60000,
          currency_id: "ARS",
          free_trial: { frequency: 7, frequency_type: "days" },
        },
      });
  });

  it("omits payer_email with --no-email and adds end_date with --cycles", () => {
    const opts = parseCreateArgs(["--freq", "3", "--cycles", "1", "--no-email"]);
    const body = buildPreapprovalBody({ opts, externalReference: "sbx_2", backUrl: "https://t.example/volver", payerEmail: "buyer@test", now: NOW });
    expect(body).not.toHaveProperty("payer_email");
    expect(body.auto_recurring).toEqual({
      frequency: 3,
      frequency_type: "months",
      transaction_amount: 60000,
      currency_id: "ARS",
      end_date: "2027-01-09T12:00:00.000Z",
    });
    expect(body).not.toHaveProperty("preapproval_plan_id");
  });

  it("uses an explicit --end-date as is", () => {
    const opts = parseCreateArgs(["--end-date", "2027-02-01T00:00:00.000Z", "--no-email"]);
    const body = buildPreapprovalBody({ opts, externalReference: "sbx_3", backUrl: "https://t.example/volver", now: NOW });
    expect(body.auto_recurring.end_date).toBe("2027-02-01T00:00:00.000Z");
  });

  it("requires a buyer email unless --no-email, and an https back_url", () => {
    const opts = parseCreateArgs([]);
    expect(() => buildPreapprovalBody({ opts, externalReference: "sbx_4", backUrl: "https://t.example/volver", now: NOW }))
      .toThrow(/MP_SUBS_BUYER_EMAIL/);
    expect(() => buildPreapprovalBody({ opts: parseCreateArgs(["--no-email"]), externalReference: "sbx_4", backUrl: "", now: NOW }))
      .toThrow(/MP_SUBS_BACK_URL/);
  });
});

describe("projectPreapproval", () => {
  const response = {
    id: "2c9380847e9b451c017ea1bd70ba0219",
    status: "pending",
    external_reference: "sbx_1",
    init_point: "https://www.mercadopago.com.ar/subscriptions/checkout?preapproval_id=2c9380847e9b451c017ea1bd70ba0219",
    next_payment_date: "2026-12-02T12:00:00.000-04:00",
    auto_recurring: { frequency: 1, frequency_type: "months", transaction_amount: 60000, currency_id: "ARS", free_trial: { frequency: 7, frequency_type: "days" } },
    collector_id: 1234567890,
    payer_id: 987654321,
    payer_email: "buyer@test",
    payer_first_name: "Ana",
    api_response: { status: 201, headers: ["x", ["y"]] },
  };

  it("keeps the fields the report needs, redacted, and compares the collector to the seller", () => {
    expect(projectPreapproval(response, 1234567890)).toEqual({
      id: "2c9380…",
      status: "pending",
      external_reference: "sbx_1",
      init_point: "https://www.mercadopago.com.ar/subscriptions/checkout?[redacted]",
      next_payment_date: "2026-12-02T12:00:00.000-04:00",
      date_created: undefined,
      last_modified: undefined,
      reason: undefined,
      back_url: undefined,
      auto_recurring: { frequency: 1, frequency_type: "months", transaction_amount: 60000, currency_id: "ARS", free_trial: { frequency: 7, frequency_type: "days" } },
      free_trial_type: "object",
      summarized: undefined,
      collector_id: "123456…",
      payer_id: "987654…",
      collector_matches_seller: true,
      http_status: 201,
    });
  });

  it("reports a missing collector and the free_trial type when it is a string", () => {
    const out = projectPreapproval({ ...response, collector_id: undefined, auto_recurring: { free_trial: "7 days" } }, 1234567890) as Record<string, unknown>;
    expect(out.collector_matches_seller).toBeNull();
    expect(out.free_trial_type).toBe("string");
  });
});

describe("projectInvoice / projectPayment", () => {
  it("projects an authorized payment with its payment", () => {
    expect(projectInvoice({
      id: 6114264375,
      status: "recycling",
      type: "scheduled",
      payment: { id: 1319718291, status: "rejected", status_detail: "cc_rejected_other_reason" },
      debit_date: "2026-12-02T12:00:00.000-04:00",
      retry_attempt: 2,
      next_retry_date: "2026-12-05T12:00:00.000-04:00",
      transaction_amount: 60000,
      currency_id: "ARS",
      preapproval_id: "2c9380847e9b451c017ea1bd70ba0219",
      payer_id: 987654321,
    })).toEqual({
      id: "611426…",
      status: "recycling",
      type: "scheduled",
      payment: { id: "131971…", status: "rejected", status_detail: "cc_rejected_other_reason" },
      debit_date: "2026-12-02T12:00:00.000-04:00",
      date_created: undefined,
      last_modified: undefined,
      retry_attempt: 2,
      next_retry_date: "2026-12-05T12:00:00.000-04:00",
      transaction_amount: 60000,
      currency_id: "ARS",
      preapproval_id: "2c9380…",
    });
  });

  it("projects a payment without payer data", () => {
    const out = projectPayment({
      id: 1319718291,
      status: "approved",
      status_detail: "partially_refunded",
      transaction_amount: 60000,
      transaction_amount_refunded: 10000,
      currency_id: "ARS",
      collector_id: 1234567890,
      external_reference: "sbx_1",
      metadata: { preapproval_id: "2c9380847e9b451c017ea1bd70ba0219" },
      point_of_interaction: { type: "SUBSCRIPTIONS", business_info: { unit: "online_payments" } },
      operation_type: "recurring_payment",
      payer: { email: "buyer@test", identification: { number: "1" } },
      card: { last_four_digits: "1234" },
    });
    expect(out).toEqual({
      id: "131971…",
      status: "approved",
      status_detail: "partially_refunded",
      transaction_amount: 60000,
      transaction_amount_refunded: 10000,
      currency_id: "ARS",
      collector_id: "123456…",
      external_reference: "sbx_1",
      metadata: { preapproval_id: "2c9380…" },
      point_of_interaction: { type: "SUBSCRIPTIONS", business_info: { unit: "online_payments" } },
      operation_type: "recurring_payment",
      date_approved: undefined,
      date_last_updated: undefined,
    });
    expect(JSON.stringify(out)).not.toContain("buyer@test");
  });
});

describe("describeMercadoPagoError", () => {
  it("keeps status, error and message and redacts the cause", () => {
    expect(describeMercadoPagoError({
      status: 400,
      error: "bad_request",
      message: "Invalid free_trial",
      cause: [{ code: "x", description: "payer_email a@b.com", payer_email: "a@b.com" }],
    })).toEqual({
      status: 400,
      error: "bad_request",
      message: "Invalid free_trial",
      cause: [{ code: "x", description: "payer_email [redacted]", payer_email: "[redacted]" }],
    });
  });

  it("describes an SDK MercadoPagoError (Error subclass with status and causes)", () => {
    class FakeMpError extends Error {
      readonly status = 400;
      readonly error = "bad_request";
      readonly causes = [{ code: "1", description: "payer_email a@b.com is invalid" }];
      constructor() {
        super("Invalid payer_email");
        this.name = "MPBadRequestError";
      }
    }
    expect(describeMercadoPagoError(new FakeMpError())).toEqual({
      name: "MPBadRequestError",
      status: 400,
      error: "bad_request",
      message: "Invalid payer_email",
      causes: [{ code: "1", description: "payer_email [redacted] is invalid" }],
    });
  });

  it("describes a plain Error", () => {
    expect(describeMercadoPagoError(new Error("timeout"))).toEqual({ message: "timeout" });
  });
});
