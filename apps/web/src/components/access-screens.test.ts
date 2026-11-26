// HU-025a2 (9.1): pantallas de /inicio por estado y por razón (render a HTML, sin base ni red).
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AccessDenial } from "@nutri-bot/core";

const mocks = vi.hoisted(() => ({
  getTenantAccess: vi.fn(),
  isPublicOnboardingEnabled: vi.fn(() => false),
  submitOnboardingClinicAction: vi.fn(),
  signIn: vi.fn(),
  signOut: vi.fn(),
  redirect: vi.fn((url: string) => {
    throw Object.assign(new Error("NEXT_REDIRECT"), { url });
  }),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/auth", () => ({ signIn: mocks.signIn, signOut: mocks.signOut }));
vi.mock("@/app/inicio/actions", () => ({ submitOnboardingClinicAction: mocks.submitOnboardingClinicAction }));
vi.mock("@/lib/onboarding-server", () => ({ isPublicOnboardingEnabled: mocks.isPublicOnboardingEnabled }));
vi.mock("@/lib/tenant-context", () => ({ getTenantAccess: mocks.getTenantAccess }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));

import { AccessGateScreen } from "./access-gate-screen";
import { LoginScreen } from "./login-screen";
import { NoAccessScreen } from "./no-access-screen";

const html = (el: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(el);
const noAccess = (reason: AccessDenial, email: string | null = "carla@example.test") =>
  html(createElement(NoAccessScreen, { reason, email }));
const PENDING = "Ya registramos tu pedido; vas a poder entrar cuando te den acceso.";

describe("LoginScreen", () => {
  it("ya no habla de una lista de acceso", () => {
    const out = html(createElement(LoginScreen));
    expect(out).toContain("Entrá con tu cuenta de Google.");
    expect(out).toContain("El acceso a cada consultorio lo da su responsable.");
    expect(out).toContain("Entrar con Google");
    expect(out).not.toMatch(/lista de acceso|autorizada/);
  });
});

describe("aviso tras un rechazo del login (6.1 paso 1)", () => {
  it("con ?error= (sin sesión) el login muestra el aviso genérico, sin el código", async () => {
    mocks.getTenantAccess.mockResolvedValue({ ok: false, reason: "unauthenticated", email: null });
    const out = html(await AccessGateScreen({ signInError: "AccessDenied" }));
    expect(out).toContain("No pudimos iniciar sesión con esa cuenta de Google.");
    expect(out).not.toContain("AccessDenied");
    expect(out).toContain("Entrar con Google");
  });
  it("sin ?error= no hay aviso", async () => {
    mocks.getTenantAccess.mockResolvedValue({ ok: false, reason: "unauthenticated", email: null });
    expect(html(await AccessGateScreen())).not.toContain("No pudimos iniciar sesión");
  });
});

describe("NoAccessScreen", () => {
  it("identidad pendiente: título h1, email de la sesión, pedido registrado y las dos acciones", () => {
    const out = noAccess("no_membership");
    expect(out).toContain("<h1");
    expect(out).toMatch(/<h1[^>]*>Tu cuenta no tiene acceso a ningún consultorio\.<\/h1>/);
    expect(out).toMatch(/Iniciaste sesión como <strong[^>]*break-all[^>]*>carla@example\.test<\/strong>\./);
    expect(out).toContain("pedile a la responsable que te dé acceso.");
    expect(out).toContain(PENDING);
    expect(out).toContain("Usar otra cuenta");
    expect(out).toMatch(/<a[^>]*href="\/"[^>]*>Reintentar<\/a>/);
  });

  it.each<AccessDenial>(["unlinked", "tenant_not_enabled"])("%s: mismo aviso, sin la nota de pedido", (reason) => {
    const out = noAccess(reason);
    expect(out).toContain("Tu cuenta no tiene acceso a ningún consultorio.");
    expect(out).toContain("carla@example.test");
    expect(out).not.toContain(PENDING);
  });

  it("más de una membresía (D7): aviso propio", () => {
    const out = noAccess("multiple_memberships");
    expect(out).toMatch(/<h1[^>]*>Tu cuenta tiene acceso a más de un consultorio\.<\/h1>/);
    expect(out).toContain("Por ahora Numa no permite elegir. Escribinos a soporte para resolverlo.");
    expect(out).not.toContain(PENDING);
  });

  it("sin email en la sesión no muestra la línea de la cuenta", () => {
    expect(noAccess("no_membership", null)).not.toContain("Iniciaste sesión como");
  });

  it("no revela otros consultorios ni ids", () => {
    const out = noAccess("tenant_not_enabled");
    expect(out).not.toMatch(/legacy|tenant/i);
  });
});

describe("AccessGateScreen (/inicio y /login)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("con acceso → redirect al panel", async () => {
    mocks.getTenantAccess.mockResolvedValue({ ok: true, ctx: {} });
    await expect(AccessGateScreen()).rejects.toMatchObject({ url: "/" });
  });

  it("sin sesión → LoginScreen", async () => {
    mocks.getTenantAccess.mockResolvedValue({ ok: false, reason: "unauthenticated", email: null });
    const out = html(await AccessGateScreen());
    expect(out).toContain("Ingresá al panel");
    expect(out).not.toContain("Tu cuenta no tiene acceso");
  });

  it("con sesión y sin acceso → NoAccessScreen con la razón y el email", async () => {
    mocks.isPublicOnboardingEnabled.mockReturnValue(false);
    mocks.getTenantAccess.mockResolvedValue({ ok: false, reason: "no_membership", email: "carla@example.test" });
    const out = html(await AccessGateScreen());
    expect(out).toContain("Tu cuenta no tiene acceso a ningún consultorio.");
    expect(out).toContain("carla@example.test");
    expect(out).toContain(PENDING);
    expect(out).not.toContain("Configurá tu consultorio");
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("HU-026: titular con suscripción pendiente → OnboardingPendingScreen", async () => {
    mocks.getTenantAccess.mockResolvedValue({
      ok: false,
      reason: "onboarding_pending",
      clinicName: "Consultorio del Sur",
      email: "carla@example.test",
    });
    const out = html(await AccessGateScreen());
    expect(out).toContain("Consultorio del Sur");
    expect(out).toContain("Suscripción pendiente");
    expect(out).toContain('href="/ajustes/suscripcion"');
  });

  it("HU-026: titular con alta incompleta → retoma OnboardingSignupForm", async () => {
    mocks.isPublicOnboardingEnabled.mockReturnValue(false);
    mocks.getTenantAccess.mockResolvedValue({
      ok: false,
      reason: "onboarding_setup",
      clinicName: "Consultorio del Sur",
      email: "carla@example.test",
    });
    const out = html(await AccessGateScreen());
    expect(out).toContain("Configurá tu consultorio");
    expect(out).toContain('name="professionalName"');
  });

  it("HU-026: no_membership con alta pública habilitada → OnboardingSignupForm", async () => {
    mocks.isPublicOnboardingEnabled.mockReturnValue(true);
    mocks.getTenantAccess.mockResolvedValue({ ok: false, reason: "no_membership", email: "carla@example.test" });
    const out = html(await AccessGateScreen());
    expect(out).toContain("Configurá tu consultorio");
    expect(out).not.toContain("Tu cuenta no tiene acceso");
  });
});

describe("Usar otra cuenta", () => {
  it("cierra la sesión sin redirigir y abre el selector de cuentas de Google", async () => {
    const tree = NoAccessScreen({ reason: "no_membership", email: null });
    const action = findFormAction(tree);
    await action();
    expect(mocks.signOut).toHaveBeenCalledWith({ redirect: false });
    expect(mocks.signIn).toHaveBeenCalledWith("google", { redirectTo: "/" }, { prompt: "select_account consent" });
    expect(mocks.signOut.mock.invocationCallOrder[0]!).toBeLessThan(mocks.signIn.mock.invocationCallOrder[0]!);
  });
});

// Recorre el árbol de elementos (sin renderizar) hasta el primer <form action={fn}>.
function findFormAction(node: unknown): () => Promise<void> {
  const stack = [node];
  while (stack.length) {
    const n = stack.pop() as { type?: unknown; props?: { action?: unknown; children?: unknown } } | null;
    if (!n || typeof n !== "object") continue;
    if (Array.isArray(n)) { stack.push(...n); continue; }
    if (n.type === "form" && typeof n.props?.action === "function") return n.props.action as () => Promise<void>;
    if (typeof n.type === "function" && n.props) {
      stack.push((n.type as (p: unknown) => unknown)(n.props));
      continue;
    }
    if (n.props?.children !== undefined) stack.push(n.props.children);
  }
  throw new Error("form action not found");
}
