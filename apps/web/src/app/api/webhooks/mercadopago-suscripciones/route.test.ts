// HU-029b (§B.6.5, §B.9.4): webhook de suscripciones de Arzium. Firma con ARZIUM_MERCADOPAGO_WEBHOOK_SECRET
// (aplicación de MP de Arzium); el cuerpo solo dice QUÉ consultar. Sin base ni red.
import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { verifyMercadoPagoSignature } from "../../../../../../../packages/db/domain/mercadopago-signature";

const mocks = vi.hoisted(() => ({
  handle: vi.fn(),
  verify: vi.fn(),
  after: vi.fn(),
  callbacks: [] as Array<() => Promise<void>>,
}));
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  after: mocks.after,
}));
vi.mock("@nutri-bot/db/domain", () => ({
  handleSubscriptionWebhook: mocks.handle,
  verifyMercadoPagoSignature: mocks.verify,
}));
import { GET, POST } from "./route";

const secret = "arzium-webhook-secret";
const BASE = "http://localhost/api/webhooks/mercadopago-suscripciones";

function signedHeaders(dataId: string | null, s = secret) {
  const manifest = (dataId ? `id:${dataId.toLowerCase()};` : "") + "request-id:req-1;ts:1704908010;";
  const hash = createHmac("sha256", s).update(manifest).digest("hex");
  return { "x-signature": `ts=1704908010,v1=${hash}`, "x-request-id": "req-1" };
}

function post(query: string, body: unknown, headers: Record<string, string>) {
  return new Request(`${BASE}?${query}`, { method: "POST", headers, body: JSON.stringify(body) });
}

describe("webhook de suscripciones de Arzium", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.callbacks.length = 0;
    mocks.verify.mockImplementation(verifyMercadoPagoSignature);
    mocks.after.mockImplementation((cb) => mocks.callbacks.push(cb));
    mocks.handle.mockResolvedValue("processed");
    vi.stubEnv("ARZIUM_MERCADOPAGO_WEBHOOK_SECRET", secret);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("sin secreto → 503 sin verificar ni procesar", async () => {
    vi.stubEnv("ARZIUM_MERCADOPAGO_WEBHOOK_SECRET", "");
    const res = await POST(post("data.id=pre1&type=subscription_preapproval", {}, signedHeaders("pre1")));
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "unconfigured" });
    expect(mocks.after).not.toHaveBeenCalled();
  });

  it("firma válida (data.id de la query, S6) → 200 y after() llama con { topic, resourceId, requestId }", async () => {
    const res = await POST(post("data.id=2c9380849abc&type=subscription_preapproval", { type: "subscription_preapproval", data: { id: "otro" } }, signedHeaders("2c9380849abc")));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(mocks.handle).not.toHaveBeenCalled();
    expect(mocks.callbacks).toHaveLength(1);
    await mocks.callbacks[0]!();
    expect(mocks.handle).toHaveBeenCalledWith({ topic: "subscription_preapproval", resourceId: "2c9380849abc", requestId: "req-1" });
  });

  it("topic: query.type ?? query.topic ?? body.type", async () => {
    await POST(post("data.id=p1&topic=payment", { type: "x" }, signedHeaders("p1")));
    await POST(post("data.id=p1", { type: "subscription_authorized_payment" }, signedHeaders("p1")));
    await GET(new Request(`${BASE}?data.id=p1`, { headers: signedHeaders("p1") }));
    for (const cb of mocks.callbacks) await cb();
    expect(mocks.handle.mock.calls.map(([n]) => n.topic)).toEqual(["payment", "subscription_authorized_payment", null]);
  });

  it("respaldo: sin data.id en la query, en un POST se toma del cuerpo (leído una sola vez)", async () => {
    const req = post("type=subscription_preapproval", { data: { id: "pre9" } }, signedHeaders("pre9"));
    const readBody = vi.spyOn(req, "json");
    expect((await POST(req)).status).toBe(200);
    await mocks.callbacks[0]!();
    expect(readBody).toHaveBeenCalledTimes(1);
    expect(mocks.handle).toHaveBeenCalledWith({ topic: "subscription_preapproval", resourceId: "pre9", requestId: "req-1" });
  });

  it.each([
    ["firma inválida", "data.id=p1&type=subscription_preapproval", signedHeaders("p1", "otro-secreto")],
    ["sin firma", "data.id=p1&type=subscription_preapproval", {}],
    ["data.id duplicado", "data.id=p1&data.id=p2&type=subscription_preapproval", signedHeaders("p1")],
    ["data.id inválido", "data.id=p1%3Bx&type=subscription_preapproval", signedHeaders("p1;x")],
    ["data.id demasiado largo", `data.id=${"a".repeat(65)}`, signedHeaders("a".repeat(65))],
    ["sin data.id", "type=subscription_preapproval", signedHeaders(null)],
  ])("%s → 401 invalid_signature y handleSubscriptionWebhook no se llama", async (_n, query, headers) => {
    const res = await POST(post(query, {}, headers as Record<string, string>));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "invalid_signature" });
    expect(mocks.after).not.toHaveBeenCalled();
    expect(mocks.handle).not.toHaveBeenCalled();
  });

  it("un error al procesar se loguea con código fijo, nunca el cuerpo ni headers", async () => {
    mocks.handle.mockRejectedValue(new Error("payer@example.test Bearer TEST"));
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    await POST(post("data.id=p1&type=subscription_preapproval", { payer_email: "payer@example.test" }, signedHeaders("p1")));
    await mocks.callbacks[0]!();
    expect(error.mock.calls).toEqual([["[subscriptions] webhook_failed"]]);
    expect(JSON.stringify([...warn.mock.calls, ...log.mock.calls])).not.toMatch(/payer|Bearer|x-signature/);
  });
});
