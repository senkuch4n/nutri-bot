// HU-029b (§B.9.4): Ajustes → Suscripción. Se renderiza el HTML real de la página (server + componentes
// cliente) con el dominio, la sesión y las acciones mockeados.
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SUBSCRIPTION_TEXT as T } from "@nutri-bot/core";
import type { TenantSubscriptionView } from "@nutri-bot/db/domain";

const mocks = vi.hoisted(() => ({ ctx: vi.fn(), view: vi.fn(), auth: vi.fn() }));
vi.mock("@/lib/tenant-context", () => ({ requireSubscriptionPageContext: mocks.ctx }));
vi.mock("@/auth", () => ({ auth: mocks.auth }));
vi.mock("@nutri-bot/db/domain", () => ({ getTenantSubscriptionView: mocks.view }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), replace: vi.fn() }) }));
vi.mock("next/link", () => ({ default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a> }));
vi.mock("@/components/confirm", () => ({ useConfirm: () => async () => false }));
vi.mock("./actions", () => ({
  startSubscriptionAction: vi.fn(),
  continueCheckoutAction: vi.fn(),
  cancelSubscriptionAction: vi.fn(),
  refreshSubscriptionAction: vi.fn(),
}));

import SubscriptionPage from "./page";

const OWNER = { userId: "owner-1", tenantId: "tenant-a", isOwner: true, onboarding: false, timeZone: "America/Argentina/Buenos_Aires" };
const STAFF = { ...OWNER, userId: "staff-1", isOwner: false };
const LOGIN = "titular@example.test";
const MP_EMAIL = "cuenta.mp@example.test";
const monthly = {
  planId: "plan_mensual_live", name: "Plan mensual", priceText: "$ 60.000 por mes", trialText: "7 días",
  trialEligible: true, isDefault: true, trialLength: 7, trialUnit: "DAYS" as const,
};
const annual = {
  planId: "plan-anual", name: "Plan anual", priceText: "$ 600.000 por año", trialText: null,
  trialEligible: false, isDefault: false, trialLength: null, trialUnit: null,
};
const sub = (over: Partial<NonNullable<TenantSubscriptionView["subscription"]>>): TenantSubscriptionView["subscription"] => ({
  id: "sub-1", status: "PENDING", planName: "Plan mensual", priceText: "$ 60.000 por mes", authorized: false,
  trialEndsAt: null, nextPaymentDate: null, canceledAt: null, cancelOrigin: null, hasCheckout: true,
  planId: "plan_mensual_live", checkoutPayerEmail: null, ...over,
});
const view = (over: Partial<TenantSubscriptionView> = {}): TenantSubscriptionView => ({
  availability: "enabled", plans: [monthly], trialUsed: false, subscription: null, ...over,
});

async function html(params: Record<string, string> = {}) {
  return renderToStaticMarkup(await SubscriptionPage({ searchParams: Promise.resolve(params) }));
}
const decode = (s: string) => s.replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">");

beforeEach(() => {
  vi.clearAllMocks();
  mocks.ctx.mockResolvedValue(OWNER);
  mocks.auth.mockResolvedValue({ user: { email: LOGIN } });
  mocks.view.mockResolvedValue(view());
});

describe("página /ajustes/suscripcion", () => {
  it("lee la vista con el tenant y el usuario del contexto", async () => {
    await html();
    expect(mocks.view).toHaveBeenCalledWith({ tenantId: "tenant-a" }, { userId: "owner-1" });
  });

  it("P1 con 1 plan: tarjeta única sin radio, oferta con prueba, campo de email precargado con el de la login", async () => {
    const out = decode(await html());
    expect(out).toContain(T.payerEmailLabel);
    expect(out).toContain(T.payerEmailHelp);
    expect(out).toMatch(new RegExp(`<input[^>]*type="email"[^>]*value="${LOGIN}"`));
    expect(out).not.toContain('type="radio"');
    expect(out).toContain("Probá Numa gratis 7 días. Después, $ 60.000 por mes con Mercado Pago. Si cancelás antes del");
    expect(out).toContain(T.startTrial);
    expect(out).not.toMatch(/validaci[oó]n/i); // B.0 R6: sin aviso de cobro de validación
  });

  it("P1 con 2 planes: radio cards con el default preseleccionado", async () => {
    mocks.view.mockResolvedValue(view({ plans: [monthly, annual] }));
    const out = decode(await html());
    expect(out.match(/type="radio"/g)).toHaveLength(2);
    const radios = out.match(/<input[^>]*type="radio"[^>]*>/g)!;
    expect(radios.find((r) => r.includes('value="plan_mensual_live"'))).toMatch(/checked/);
    expect(radios.find((r) => r.includes('value="plan-anual"'))).not.toMatch(/checked/);
    expect(out).toContain("Plan anual");
    expect(out).toContain("<fieldset");
  });

  it("P3: PENDING sin autorizar con el campo precargado con checkoutPayerEmail", async () => {
    mocks.view.mockResolvedValue(view({ subscription: sub({ checkoutPayerEmail: MP_EMAIL }) }));
    const out = decode(await html());
    expect(out).toContain(T.pendingCheckout);
    expect(out).toContain(T.continueCheckout);
    expect(out).toContain(T.restart);
    expect(out).toContain(T.restartEmailHelp);
    expect(out).toMatch(new RegExp(`<input[^>]*type="email"[^>]*value="${MP_EMAIL}"`));
  });

  it("?mp=volver con PENDING → P2 (confirmando)", async () => {
    mocks.view.mockResolvedValue(view({ subscription: sub({ checkoutPayerEmail: MP_EMAIL }) }));
    const out = decode(await html({ mp: "volver" }));
    expect(out).toContain(T.confirming);
    expect(out).not.toContain(T.continueCheckout);
  });

  it("P4: PENDING autorizada → esperando el primer cobro + cancelar", async () => {
    mocks.view.mockResolvedValue(view({ subscription: sub({ authorized: true, hasCheckout: false }) }));
    const out = decode(await html());
    expect(out).toContain(T.awaitingFirstCharge);
    expect(out).toContain(T.cancel);
    expect(out).not.toContain('type="email"');
  });

  it("P5: TRIALING con fechas formateadas en la zona del consultorio", async () => {
    const end = new Date("2027-04-08T15:00:00Z");
    mocks.view.mockResolvedValue(view({ subscription: sub({ status: "TRIALING", authorized: true, hasCheckout: false, trialEndsAt: end, nextPaymentDate: end }) }));
    const out = decode(await html());
    expect(out).toContain("Estás en la prueba gratis hasta el jueves 8 de abril. El primer cobro de $ 60.000 por mes es el jueves 8 de abril.");
    expect(out).toContain(T.summary.TRIALING);
    expect(out).toContain(T.cancel);
  });

  it("P8: CANCELED (baja real) con la lista de planes, el campo y «Volver a suscribirme»", async () => {
    mocks.view.mockResolvedValue(view({
      subscription: sub({ status: "CANCELED", authorized: true, hasCheckout: false, canceledAt: new Date("2027-05-03T15:00:00Z"), cancelOrigin: "PANEL" }),
      trialUsed: true, plans: [{ ...monthly, trialEligible: false }],
    }));
    const out = decode(await html());
    expect(out).toContain("Cancelaste la suscripción el lunes 3 de mayo.");
    expect(out).toContain(T.resubscribe);
    expect(out).toContain(T.payerEmailLabel);
    expect(out).toContain(T.offerNoTrial("$ 60.000 por mes"));
  });

  it("CANCELED desde Mercado Pago usa su texto", async () => {
    mocks.view.mockResolvedValue(view({
      subscription: sub({ status: "CANCELED", authorized: true, canceledAt: new Date("2027-05-03T15:00:00Z"), cancelOrigin: "MERCADO_PAGO" }),
    }));
    expect(decode(await html())).toContain("La suscripción se canceló en Mercado Pago el lunes 3 de mayo.");
  });

  it("P9: no disponible", async () => {
    mocks.view.mockResolvedValue({ availability: "unavailable", plans: [], trialUsed: false, subscription: null });
    const out = decode(await html());
    expect(out).toContain(T.unavailable);
    expect(out).not.toContain("<form");
    expect(out).not.toContain("<button");
  });

  it("P10: STAFF ve el estado sin botones, radio ni campo, y sin el email de la titular en el HTML", async () => {
    mocks.ctx.mockResolvedValue(STAFF);
    mocks.view.mockResolvedValue(view({ plans: [monthly, annual], subscription: sub({ checkoutPayerEmail: MP_EMAIL }) }));
    const out = decode(await html());
    expect(out).toContain(T.pendingCheckout);
    expect(out).toContain(T.staffOnly);
    expect(out).not.toContain("<button");
    expect(out).not.toContain('type="radio"');
    expect(out).not.toContain('type="email"');
    expect(out).not.toContain(MP_EMAIL);
    expect(out).not.toContain(LOGIN);
    expect(mocks.auth).not.toHaveBeenCalled();
  });

  it("nunca aparece un id ni una URL de Mercado Pago en el HTML", async () => {
    mocks.view.mockResolvedValue(view({ subscription: sub({ checkoutPayerEmail: MP_EMAIL }) }));
    const out = await html();
    expect(out).not.toMatch(/preapproval|mercadopago\.com\.ar\/subscriptions|sub_[0-9a-f]{8}/);
  });

  it("onboarding (HU-026): «‹ Inicio» en vez de «‹ Ajustes»", async () => {
    mocks.ctx.mockResolvedValue({ ...OWNER, onboarding: true });
    const out = await html();
    expect(out).toContain('href="/inicio"');
    expect(out).not.toContain('href="/ajustes?tab=suscripcion"');
    mocks.ctx.mockResolvedValue(OWNER);
    expect(await html()).toContain('href="/ajustes?tab=suscripcion"');
  });
});
