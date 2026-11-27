// HU-029b (G2, S4 refutado): MP ignora X-Idempotency-Key en POST /preapproval, así que el gateway nunca puede
// repetir un POST a ciegas. Se prueba el SDK real de `mercadopago` (sin mockearlo) con un fetch falso: sin red.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createArziumMercadoPagoGateway, type ArziumPreapprovalCreate } from "./subscriptionsGateway";

const ENV = {
  ARZIUM_SUBSCRIPTIONS_ENABLED: "true",
  ARZIUM_MERCADOPAGO_MODE: "sandbox",
  ARZIUM_MERCADOPAGO_ACCESS_TOKEN: "TEST-gateway-token",
  ARZIUM_MERCADOPAGO_USER_ID: "424242",
  ARZIUM_MERCADOPAGO_WEBHOOK_SECRET: "whsec",
  NODE_ENV: "test",
};

const BODY: ArziumPreapprovalCreate = {
  reason: "Plan mensual",
  external_reference: "sub_0123456789abcdef0123456789abcdef",
  back_url: "https://numa.example.test/ajustes/suscripcion?mp=volver",
  status: "pending",
  payer_email: "ana@example.test",
  auto_recurring: {
    frequency: 1,
    frequency_type: "months",
    transaction_amount: 60000,
    currency_id: "ARS",
    free_trial: { frequency: 7, frequency_type: "days" },
  },
};

const originalFetch = globalThis.fetch;
let fetchMock: ReturnType<typeof vi.fn>;

const headerOf = (init: RequestInit | undefined, name: string) =>
  new Headers(init?.headers as ConstructorParameters<typeof Headers>[0]).get(name);

beforeEach(() => {
  fetchMock = vi.fn(async () =>
    new Response(JSON.stringify({ message: "internal_error", status: 500 }), {
      status: 500,
      headers: { "content-type": "application/json" },
    }));
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("createArziumMercadoPagoGateway: sin reintentos en POST /preapproval (G2)", () => {
  it("un 500 en createPreapproval tira después de exactamente 1 llamada HTTP (el SDK no reintenta)", async () => {
    const gateway = createArziumMercadoPagoGateway(ENV);
    await expect(gateway.createPreapproval(BODY, "sub-1")).rejects.toMatchObject({ status: 500 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]! as [string, RequestInit];
    expect(url).toMatch(/\/preapproval\/?$/);
    expect(init.method).toBe("POST");
    expect(headerOf(init, "X-Idempotency-Key")).toBe("sub-1");
  });

  it("una segunda llamada no reusa la X-Idempotency-Key de la primera (config nueva por llamada)", async () => {
    const gateway = createArziumMercadoPagoGateway(ENV);
    await expect(gateway.createPreapproval(BODY, "sub-1")).rejects.toBeDefined();
    await expect(gateway.createPreapproval(BODY, "sub-2")).rejects.toBeDefined();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const keys = fetchMock.mock.calls.map(([, init]) => headerOf(init as RequestInit, "X-Idempotency-Key"));
    expect(keys).toEqual(["sub-1", "sub-2"]);
  });

  it("una lectura posterior tampoco hereda la key ni reintenta", async () => {
    const gateway = createArziumMercadoPagoGateway(ENV);
    await expect(gateway.createPreapproval(BODY, "sub-1")).rejects.toBeDefined();
    await expect(gateway.getPreapproval("pre-1")).rejects.toBeDefined();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [, getInit] = fetchMock.mock.calls[1]! as [string, RequestInit];
    expect(getInit.method).toBe("GET");
    expect(headerOf(getInit, "X-Idempotency-Key")).toBeNull();
  });

  it("con el cobro apagado no crea cliente ni llama a la red", () => {
    expect(() => createArziumMercadoPagoGateway({})).toThrow("subscription_billing:disabled");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
