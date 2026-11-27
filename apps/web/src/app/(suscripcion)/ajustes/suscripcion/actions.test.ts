// HU-029b (§B.9.4): acciones de Ajustes → Suscripción (sin base ni red). Las puertas son las de §B.6.7.
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  class TenantAccessError extends Error {
    constructor(readonly code: string) {
      super(code);
    }
  }
  return {
    TenantAccessError,
    requireSubscriptionOwnerContext: vi.fn(),
    requireSubscriptionReadContext: vi.fn(),
    redirect: vi.fn((url: string) => {
      throw Object.assign(new Error("NEXT_REDIRECT"), { url });
    }),
    revalidatePath: vi.fn(),
    start: vi.fn(),
    resume: vi.fn(),
    cancel: vi.fn(),
    refresh: vi.fn(),
  };
});
vi.mock("@/lib/tenant-context", () => ({
  TenantAccessError: mocks.TenantAccessError,
  requireSubscriptionOwnerContext: mocks.requireSubscriptionOwnerContext,
  requireSubscriptionReadContext: mocks.requireSubscriptionReadContext,
}));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@nutri-bot/db/domain", () => ({
  startTenantSubscription: mocks.start,
  resumePendingCheckout: mocks.resume,
  cancelTenantSubscription: mocks.cancel,
  refreshTenantSubscription: mocks.refresh,
}));

import { cancelSubscriptionAction, continueCheckoutAction, refreshSubscriptionAction, startSubscriptionAction } from "./actions";

const OWNER = { userId: "owner-1", tenantId: "tenant-a", isOwner: true, onboarding: false, timeZone: "America/Argentina/Buenos_Aires" };
const ONBOARDING = { ...OWNER, tenantId: "clinic-new", onboarding: true };
const MP_URL = "https://www.mercadopago.com.ar/subscriptions/checkout?preapproval_id=x";

async function redirectedTo(run: () => Promise<unknown>): Promise<string | null> {
  const error = await run().then(() => null, (e: unknown) => e);
  return (error as { url?: string } | null)?.url ?? null;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireSubscriptionOwnerContext.mockResolvedValue(OWNER);
  mocks.requireSubscriptionReadContext.mockResolvedValue(OWNER);
  mocks.start.mockResolvedValue({ ok: true, checkoutUrl: MP_URL });
  mocks.resume.mockResolvedValue({ ok: true, checkoutUrl: MP_URL });
  mocks.cancel.mockResolvedValue({ ok: true });
  mocks.refresh.mockResolvedValue({ result: "unchanged", status: "PENDING", authorized: false });
});

describe("puertas", () => {
  it.each(["owner_only", "no_context"])("%s (STAFF o STAFF con suscripción pendiente) → forbidden sin llamar al dominio", async (code) => {
    mocks.requireSubscriptionOwnerContext.mockRejectedValue(new mocks.TenantAccessError(code));
    expect(await startSubscriptionAction({ planId: "p", payerEmail: "ana@example.test" })).toEqual({ error: "forbidden" });
    expect(await continueCheckoutAction()).toEqual({ error: "forbidden" });
    expect(await cancelSubscriptionAction()).toEqual({ error: "forbidden" });
    expect(mocks.start).not.toHaveBeenCalled();
    expect(mocks.resume).not.toHaveBeenCalled();
    expect(mocks.cancel).not.toHaveBeenCalled();
  });

  it("OWNER en onboarding (HU-026) → start/continue/cancel llegan al dominio con su tenantId", async () => {
    mocks.requireSubscriptionOwnerContext.mockResolvedValue(ONBOARDING);
    expect(await redirectedTo(() => startSubscriptionAction({ planId: "p", payerEmail: "ana@example.test" }))).toBe(MP_URL);
    expect(mocks.start).toHaveBeenCalledWith({ tenantId: "clinic-new" }, { userId: "owner-1" }, { planId: "p", restart: false, payerEmail: "ana@example.test" });
    expect(await redirectedTo(() => continueCheckoutAction())).toBe(MP_URL);
    expect(mocks.resume).toHaveBeenCalledWith({ tenantId: "clinic-new" }, { userId: "owner-1" });
    expect(await cancelSubscriptionAction()).toEqual({ ok: true });
    expect(mocks.cancel).toHaveBeenCalledWith({ tenantId: "clinic-new" }, { userId: "owner-1" });
  });

  it("refresh permitido a STAFF (solo lectura)", async () => {
    mocks.requireSubscriptionReadContext.mockResolvedValue({ ...OWNER, isOwner: false });
    mocks.refresh.mockResolvedValue({ result: "applied", status: "TRIALING", authorized: true });
    expect(await refreshSubscriptionAction()).toEqual({ status: "TRIALING", authorized: true });
    expect(mocks.refresh).toHaveBeenCalledWith({ tenantId: "tenant-a" });
  });

  it("refresh sin contexto → status null sin llamar al dominio", async () => {
    mocks.requireSubscriptionReadContext.mockRejectedValue(new mocks.TenantAccessError("no_context"));
    expect(await refreshSubscriptionAction()).toEqual({ status: null, authorized: false });
    expect(mocks.refresh).not.toHaveBeenCalled();
  });
});

describe("startSubscriptionAction", () => {
  it("email inválido → invalid_payer_email sin llamar al dominio", async () => {
    expect(await startSubscriptionAction({ planId: "p", payerEmail: "no-email" })).toEqual({ error: "invalid_payer_email" });
    expect(mocks.start).not.toHaveBeenCalled();
  });

  it("OK → el dominio recibe el email normalizado y redirige a MP", async () => {
    expect(await redirectedTo(() => startSubscriptionAction({ planId: "p", payerEmail: "  Ana@Example.TEST ", restart: true }))).toBe(MP_URL);
    expect(mocks.start).toHaveBeenCalledWith({ tenantId: "tenant-a" }, { userId: "owner-1" }, { planId: "p", restart: true, payerEmail: "ana@example.test" });
  });

  it.each(["payer_email_rejected", "checkout_in_progress", "already_subscribed", "plan_not_offered"])("el dominio devuelve %s → se devuelve igual", async (error) => {
    mocks.start.mockResolvedValue({ ok: false, error });
    expect(await startSubscriptionAction({ planId: "p", payerEmail: "ana@example.test" })).toEqual({ error });
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it.each(["https://evil.example.test/x", "http://www.mercadopago.com.ar/x", "https://mercadopago.com.ar.evil.test/x", "javascript:alert(1)"])(
    "URL con otro host o esquema (%s) → mp_unavailable sin redirigir",
    async (url) => {
      mocks.start.mockResolvedValue({ ok: true, checkoutUrl: url });
      expect(await startSubscriptionAction({ planId: "p", payerEmail: "ana@example.test" })).toEqual({ error: "mp_unavailable" });
      expect(mocks.redirect).not.toHaveBeenCalled();
    },
  );

  it("acepta el checkout de sandbox (sandbox.mercadopago.com.ar)", async () => {
    mocks.start.mockResolvedValue({ ok: true, checkoutUrl: "https://sandbox.mercadopago.com.ar/subscriptions/checkout?x=1" });
    expect(await redirectedTo(() => startSubscriptionAction({ planId: "p", payerEmail: "ana@example.test" }))).toContain("sandbox.mercadopago.com.ar");
  });

  it("la respuesta nunca trae el email", async () => {
    mocks.start.mockResolvedValue({ ok: false, error: "payer_email_rejected" });
    expect(JSON.stringify(await startSubscriptionAction({ planId: "p", payerEmail: "ana@example.test" }))).not.toContain("@");
  });
});

describe("continueCheckoutAction / cancelSubscriptionAction", () => {
  it("continue usa resumePendingCheckout y valida el host", async () => {
    mocks.resume.mockResolvedValue({ ok: true, checkoutUrl: "https://evil.example.test" });
    expect(await continueCheckoutAction()).toEqual({ error: "mp_unavailable" });
    mocks.resume.mockResolvedValue({ ok: false, error: "not_found" });
    expect(await continueCheckoutAction()).toEqual({ error: "not_found" });
  });

  it("cancel ok revalida la pantalla; error se devuelve sin revalidar", async () => {
    expect(await cancelSubscriptionAction()).toEqual({ ok: true });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/ajustes/suscripcion");
    mocks.revalidatePath.mockClear();
    mocks.cancel.mockResolvedValue({ ok: false, error: "cancel_unconfirmed" });
    expect(await cancelSubscriptionAction()).toEqual({ error: "cancel_unconfirmed" });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });
});
