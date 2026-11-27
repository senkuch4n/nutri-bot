import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { redactMercadoPagoResource } from "./mp-sandbox-redact";
import { analyzeWebhookRequest, extractWebhookDataIds } from "./mp-sandbox-webhook";

const SECRET = "test-secret";

function sign(dataId: string | null, requestId: string, ts = "1732550400") {
  const manifest = (dataId ? `id:${dataId.toLowerCase()};` : "") + `request-id:${requestId};ts:${ts};`;
  return `ts=${ts},v1=${createHmac("sha256", SECRET).update(manifest).digest("hex")}`;
}

describe("extractWebhookDataIds", () => {
  it("reads data.id (or id) from the query and data.id (or id) from the body", () => {
    expect(extractWebhookDataIds(new URLSearchParams("data.id=ABC123&type=subscription_preapproval"), { data: { id: "ABC123" } }))
      .toEqual({ query: "ABC123", body: "ABC123" });
    expect(extractWebhookDataIds(new URLSearchParams("id=777&topic=payment"), { id: 777 }))
      .toEqual({ query: "777", body: "777" });
    expect(extractWebhookDataIds(new URLSearchParams(""), "not json")).toEqual({ query: null, body: null });
  });
});

describe("analyzeWebhookRequest", () => {
  it("validates the signature with data.id from the query", () => {
    const record = analyzeWebhookRequest({
      method: "POST",
      url: "/?data.id=2C9380847E&type=subscription_preapproval",
      headers: { "x-signature": sign("2C9380847E", "req-1"), "x-request-id": "req-1", "content-type": "application/json" },
      rawBody: JSON.stringify({ type: "subscription_preapproval", action: "updated", data: { id: "2C9380847E" } }),
      secret: SECRET,
    });
    expect(record).toMatchObject({
      method: "POST",
      path: "/",
      query: { "data.id": "2C9380847E", type: "subscription_preapproval" },
      headers: { "x-request-id": "req-1" },
      body: { type: "subscription_preapproval", action: "updated", data: { id: "2C9380847E" } },
      query_data_id: "2C9380847E",
      body_data_id: "2C9380847E",
      signature: { present: true, valid_with_query_id: true, valid_with_body_id: true, valid_with: "query" },
      back_url_preapproval_id: false,
    });
  });

  it("falls back to the body data.id when the query has none, and says so", () => {
    const record = analyzeWebhookRequest({
      method: "POST",
      url: "/",
      headers: { "x-signature": sign("555", "req-2"), "x-request-id": "req-2" },
      rawBody: JSON.stringify({ type: "payment", data: { id: "555" } }),
      secret: SECRET,
    });
    expect(record.signature).toEqual({ present: true, valid_with_query_id: null, valid_with_body_id: true, valid_with: "body" });
  });

  it("reports an invalid or missing signature", () => {
    const bad = analyzeWebhookRequest({
      method: "POST",
      url: "/?data.id=555",
      headers: { "x-signature": sign("555", "req-3").replace(/v1=[0-9a-f]+/, `v1=${"0".repeat(64)}`), "x-request-id": "req-3" },
      rawBody: "{}",
      secret: SECRET,
    });
    expect(bad.signature).toEqual({ present: true, valid_with_query_id: false, valid_with_body_id: null, valid_with: "none" });

    const missing = analyzeWebhookRequest({ method: "POST", url: "/?data.id=555", headers: {}, rawBody: "", secret: SECRET });
    expect(missing.signature).toEqual({ present: false, valid_with_query_id: false, valid_with_body_id: null, valid_with: "none" });
    expect(missing.body).toBeNull();
  });

  it("recognizes the back_url return with ?preapproval_id= (S7) and redacts it for storage", () => {
    const record = analyzeWebhookRequest({
      method: "GET",
      url: "/volver?preapproval_id=2c9380847e9b451c017ea1bd70ba0219",
      headers: {},
      rawBody: "",
      secret: SECRET,
    });
    expect(record.back_url_preapproval_id).toBe(true);
    expect(record.query_data_id).toBeNull();
    expect(redactMercadoPagoResource(record)).toMatchObject({ path: "/volver", query: { preapproval_id: "2c9380…" } });
  });

  it("truncates the data ids when the record is redacted for storage", () => {
    const record = analyzeWebhookRequest({
      method: "POST",
      url: "/?data.id=2c9380847e9b451c017ea1bd70ba0219",
      headers: {},
      rawBody: JSON.stringify({ data: { id: "2c9380847e9b451c017ea1bd70ba0219" } }),
      secret: SECRET,
    });
    const stored = JSON.stringify(redactMercadoPagoResource(record));
    expect(stored).not.toContain("2c9380847e9b451c017ea1bd70ba0219");
    expect(stored).toContain("2c9380…");
  });

  it("keeps a non-JSON body as text", () => {
    const record = analyzeWebhookRequest({ method: "POST", url: "/", headers: {}, rawBody: "topic=payment&id=1", secret: SECRET });
    expect(record.body).toBe("topic=payment&id=1");
  });
});
