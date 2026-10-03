import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { verifyMercadoPagoSignature } from "../../../../../../../packages/db/domain/mercadopago-signature";

const mocks = vi.hoisted(() => ({
  handle: vi.fn(),
  verify: vi.fn(),
  sync: vi.fn(),
  fetch: vi.fn(),
  after: vi.fn(),
  callbacks: [] as Array<() => Promise<void>>,
}));
vi.mock("next/server", async (importOriginal) => ({
  ...await importOriginal<typeof import("next/server")>(),
  after: mocks.after,
}));
vi.mock("@nutri-bot/db/domain", () => ({
  handleMercadoPagoWebhook: mocks.handle,
  verifyMercadoPagoSignature: mocks.verify,
  syncMercadoPagoPayment: mocks.sync,
}));
import { GET, POST } from "./route";

describe("Mercado Pago webhook HTTP boundary", () => {
  const secret = "http-test-secret";
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.callbacks.length = 0;
    mocks.verify.mockImplementation(verifyMercadoPagoSignature);
    vi.stubGlobal("fetch", mocks.fetch);
    mocks.after.mockImplementation((callback) => mocks.callbacks.push(callback));
    vi.stubEnv("MERCADOPAGO_WEBHOOK_SECRET", secret);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });
  function request(signed = true, query = "data.id=123", method = "POST") {
    const dataId = new URLSearchParams(query).get("data.id");
    const manifest = (dataId ? `id:${dataId.toLowerCase()};` : "") + "request-id:request;ts:1704908010;";
    const hash = createHmac("sha256", secret).update(manifest).digest("hex");
    return new Request(`http://localhost/api/webhooks/mercadopago?${query}`, {
      method, headers: signed ? { "x-signature": `ts=1704908010,v1=${hash}`, "x-request-id": "request" } : {},
      ...(method === "POST" ? { body: JSON.stringify({ type: "payment", data: { id: "untrusted-body-id" } }) } : {}),
    });
  }
  async function finishResponse() {
    expect(mocks.callbacks).toHaveLength(1);
    await mocks.callbacks[0]!();
  }
  it("acknowledges without an Auth.js session and defers processing using only the URL id", async () => {
    const req = request();
    const readBody = vi.spyOn(req, "json");
    const response = await POST(req);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(mocks.verify).toHaveBeenCalledWith(expect.objectContaining({ dataId: "123", secret }));
    expect(readBody).not.toHaveBeenCalled();
    expect(mocks.handle).not.toHaveBeenCalled();
    expect(mocks.after).toHaveBeenCalledTimes(1);
    await finishResponse();
    expect(readBody).toHaveBeenCalledTimes(1);
    expect(mocks.handle).toHaveBeenCalledWith({ "data.id": "123", type: "payment" });
  });
  it("accepts a modern signed payment notification and processes its payment after responding", async () => {
    const req = new Request("http://localhost/api/webhooks/mercadopago?data.id=123&type=payment", {
      method: "POST",
      headers: request(true, "data.id=123&type=payment").headers,
      body: JSON.stringify({ id: 456, live_mode: true, type: "payment", action: "payment.updated", api_version: "v1", data: { id: "123" } }),
    });
    const response = await POST(req);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(mocks.handle).not.toHaveBeenCalled();
    await finishResponse();
    expect(mocks.handle).toHaveBeenCalledTimes(1);
    expect(mocks.handle).toHaveBeenCalledWith({ "data.id": "123", type: "payment" });
  });
  it.each([false, true])("acknowledges and ignores legacy merchant_order IPN without processing (header present: %s)", async (withSignature) => {
    const req = new Request("http://localhost/api/webhooks/mercadopago?id=456&topic=merchant_order", {
      method: "POST",
      headers: withSignature ? { "x-signature": `ts=1704908010,v1=${"0".repeat(64)}`, "x-request-id": "request" } : {},
      body: JSON.stringify({ resource: "https://api.mercadolibre.com/merchant_orders/456", topic: "merchant_order" }),
    });
    const readBody = vi.spyOn(req, "json");
    const response = await POST(req);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, ignored: "legacy_ipn" });
    expect(readBody).not.toHaveBeenCalled();
    expect(mocks.verify).not.toHaveBeenCalled();
    expect(mocks.handle).not.toHaveBeenCalled();
    expect(mocks.sync).not.toHaveBeenCalled();
    expect(mocks.fetch).not.toHaveBeenCalled();
    expect(mocks.after).not.toHaveBeenCalled();
  });
  it("acknowledges legacy GET retries even without a Webhook secret", async () => {
    vi.stubEnv("MERCADOPAGO_WEBHOOK_SECRET", undefined);
    const response = await GET(request(false, "id=123&topic=merchant_order", "GET"));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, ignored: "legacy_ipn" });
    expect(mocks.verify).not.toHaveBeenCalled();
    expect(mocks.handle).not.toHaveBeenCalled();
    expect(mocks.sync).not.toHaveBeenCalled();
    expect(mocks.after).not.toHaveBeenCalled();
  });
  it.each([
    "id=123&topic=merchant_order&data.id=456",
    "id=123&topic=merchant_order&data.id=",
    "id=123&topic=merchant_order&data.id=456&data.id=789",
  ])("never bypasses modern signature rejection using legacy parameters (%s)", async (query) => {
    const response = await POST(request(false, query));
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "invalid_signature" });
    expect(mocks.handle).not.toHaveBeenCalled();
    expect(mocks.sync).not.toHaveBeenCalled();
    expect(mocks.after).not.toHaveBeenCalled();
  });
  it.each([
    "", "topic=merchant_order", "id=123", "id=&topic=merchant_order",
    "id=123&topic=payment", "id=123&topic=merchant_order&topic=payment",
    "id=123&id=456&topic=merchant_order",
  ])("rejects unknown or ambiguous unsigned requests (%s)", async (query) => {
    expect((await POST(request(false, query))).status).toBe(401);
    expect(mocks.handle).not.toHaveBeenCalled();
    expect(mocks.sync).not.toHaveBeenCalled();
    expect(mocks.after).not.toHaveBeenCalled();
  });
  it("returns 200 while reconciliation remains unresolved", async () => {
    let resolve!: () => void;
    mocks.handle.mockReturnValue(new Promise<void>((done) => { resolve = done; }));
    const response = await POST(request(true, "data.id=123&type=payment"));
    expect(response.status).toBe(200);
    expect(mocks.handle).not.toHaveBeenCalled();
    const processing = finishResponse();
    expect(mocks.handle).toHaveBeenCalledTimes(1);
    expect(response.status).toBe(200);
    resolve();
    await processing;
  });
  it("does not wait for a slow request body before acknowledging", async () => {
    const req = request();
    let resolve!: (body: unknown) => void;
    const readBody = vi.spyOn(req, "json").mockReturnValue(new Promise((done) => { resolve = done; }));
    expect((await POST(req)).status).toBe(200);
    expect(readBody).not.toHaveBeenCalled();
    const processing = finishResponse();
    expect(readBody).toHaveBeenCalledTimes(1);
    expect(mocks.handle).not.toHaveBeenCalled();
    resolve({ type: "payment" });
    await processing;
    expect(mocks.handle).toHaveBeenCalledTimes(1);
  });
  it("rejects unsigned requests before processing", async () => {
    expect((await POST(request(false))).status).toBe(401);
    expect(mocks.handle).not.toHaveBeenCalled();
    expect(mocks.after).not.toHaveBeenCalled();
  });
  it("rejects an invalid signature without scheduling processing", async () => {
    const req = request();
    req.headers.set("x-signature", `ts=1704908010,v1=${"0".repeat(64)}`);
    expect((await POST(req)).status).toBe(401);
    expect(mocks.verify).toHaveBeenCalled();
    expect(mocks.handle).not.toHaveBeenCalled();
    expect(mocks.after).not.toHaveBeenCalled();
  });
  it("rejects duplicate URL ids", async () => {
    expect((await POST(request(true, "data.id=123&data.id=456"))).status).toBe(401);
    expect(mocks.handle).not.toHaveBeenCalled();
    expect(mocks.after).not.toHaveBeenCalled();
  });
  it("fails closed when the secret is missing", async () => {
    delete process.env.MERCADOPAGO_WEBHOOK_SECRET;
    expect((await POST(request())).status).toBe(503);
    expect(mocks.after).not.toHaveBeenCalled();
  });
  it("logs post-response failures without changing the acknowledged 200", async () => {
    mocks.handle.mockRejectedValue(new Error("provider unavailable"));
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const response = await POST(request(true, "data.id=123&type=payment"));
    expect(response.status).toBe(200);
    await expect(finishResponse()).resolves.toBeUndefined();
    expect(response.status).toBe(200);
    expect(error).toHaveBeenCalledTimes(1);
  });
  it.each(["", "data.id=", "data.id=not-a-payment", "data.id=123&type=merchant_order"])("acknowledges valid notifications with no processable payment (%s)", async (query) => {
    const req = request(true, query);
    const readBody = vi.spyOn(req, "json");
    expect((await POST(req)).status).toBe(200);
    expect(readBody).not.toHaveBeenCalled();
    expect(mocks.handle).not.toHaveBeenCalled();
    expect(mocks.after).not.toHaveBeenCalled();
  });
  it("contains malformed bodies after responding", async () => {
    const req = request();
    vi.spyOn(req, "json").mockRejectedValue(new SyntaxError("Invalid JSON"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect((await POST(req)).status).toBe(200);
    await expect(finishResponse()).resolves.toBeUndefined();
    expect(mocks.handle).not.toHaveBeenCalled();
  });
  it("also defers signed GET payment notifications", async () => {
    expect((await GET(request(true, "data.id=123&type=payment", "GET"))).status).toBe(200);
    expect(mocks.handle).not.toHaveBeenCalled();
    await finishResponse();
    expect(mocks.handle).toHaveBeenCalledWith({ "data.id": "123", type: "payment" });
  });
});
