import { describe, expect, it } from "vitest";
import { REDACTED, redactMercadoPagoResource, shortMercadoPagoId } from "./mp-sandbox-redact";

describe("redactMercadoPagoResource", () => {
  it("replaces personal data, card data and tokens with [redacted]", () => {
    const input = {
      payer_email: "test_user_123@testuser.com",
      payer_first_name: "Ana",
      payer_last_name: "Pérez",
      first_name: "Ana",
      last_name: "Pérez",
      identification: { type: "DNI", number: "30111222" },
      phone: { area_code: "11", number: "55556666" },
      card_token_id: "ff8080814c11e237014c1ff593b57b4d",
      card: { first_six_digits: "450995", cardholder: { name: "APRO" } },
      access_token: "APP_USR-123-secret",
      token: "abc",
      secure_email: "x@y.com",
      refresh_token: "TG-123",
      status: "pending",
    };

    expect(redactMercadoPagoResource(input)).toEqual({
      payer_email: REDACTED,
      payer_first_name: REDACTED,
      payer_last_name: REDACTED,
      first_name: REDACTED,
      last_name: REDACTED,
      identification: REDACTED,
      phone: REDACTED,
      card_token_id: REDACTED,
      card: REDACTED,
      access_token: REDACTED,
      token: REDACTED,
      secure_email: REDACTED,
      refresh_token: REDACTED,
      status: "pending",
    });
  });

  it("truncates Mercado Pago ids to 6 characters plus an ellipsis", () => {
    const input = {
      id: "2c9380847e9b451c017ea1bd70ba0219",
      collector_id: 1234567890,
      payer_id: 987654321,
      preapproval_id: "2c9380847e9b451c017ea1bd70ba0219",
      payment: { id: 1319718291 },
      "data.id": "1319718291",
      currency_id: "ARS",
      site_id: "MLA",
      payment_method_id: "account_money",
    };

    expect(redactMercadoPagoResource(input)).toEqual({
      id: "2c9380…",
      collector_id: "123456…",
      payer_id: "987654…",
      preapproval_id: "2c9380…",
      payment: { id: "131971…" },
      "data.id": "131971…",
      currency_id: "ARS",
      site_id: "MLA",
      payment_method_id: "account_money",
    });
  });

  it("redacts nested values inside arrays", () => {
    const input = {
      results: [
        { id: "2c9380847e9b451c017ea1bd70ba0219", payer: { email: "a@b.com", first_name: "Ana" } },
        { id: 1319718291, status: "authorized", tags: ["test_user"] },
      ],
    };

    expect(redactMercadoPagoResource(input)).toEqual({
      results: [
        { id: "2c9380…", payer: { email: REDACTED, first_name: REDACTED } },
        { id: "131971…", status: "authorized", tags: ["test_user"] },
      ],
    });
  });

  it("hides the query of init_point urls (they carry the full preapproval id)", () => {
    const out = redactMercadoPagoResource({
      init_point: "https://www.mercadopago.com.ar/subscriptions/checkout?preapproval_id=2c9380847e9b451c017ea1bd70ba0219",
    });
    expect(out).toEqual({ init_point: "https://www.mercadopago.com.ar/subscriptions/checkout?[redacted]" });
  });

  it("scrubs emails that appear inside free text (error messages)", () => {
    expect(redactMercadoPagoResource({ message: "Cannot operate with payer test_user_1@testuser.com, retry" }))
      .toEqual({ message: "Cannot operate with payer [redacted], retry" });
  });

  it("does not mutate the original value", () => {
    const input = { id: "2c9380847e9b451c017ea1bd70ba0219", payer: { email: "a@b.com" }, list: [{ token: "x" }] };
    const snapshot = structuredClone(input);
    redactMercadoPagoResource(input);
    expect(input).toEqual(snapshot);
  });

  it("returns scalars and null unchanged", () => {
    expect(redactMercadoPagoResource(null)).toBeNull();
    expect(redactMercadoPagoResource("pending")).toBe("pending");
    expect(redactMercadoPagoResource(42)).toBe(42);
  });
});

describe("shortMercadoPagoId", () => {
  it("keeps short values and truncates long ones", () => {
    expect(shortMercadoPagoId("ABC")).toBe("ABC");
    expect(shortMercadoPagoId(1319718291)).toBe("131971…");
  });
});
