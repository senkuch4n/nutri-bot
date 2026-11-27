// HU-029b (§B.6.7 punto 4): /ajustes/suscripcion con el shell del panel (operativa) o con un layout mínimo
// (OWNER en onboarding de HU-026: sin sidebar ni estado del bot). El (panel)/layout usa el mismo PanelShell.
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ sub: vi.fn(), access: vi.fn(), page: vi.fn(), shell: vi.fn() }));
vi.mock("@/lib/tenant-context", () => ({
  requireSubscriptionPageContext: mocks.sub,
  getTenantAccess: mocks.access,
  requirePageContext: mocks.page,
}));
vi.mock("@/components/shell/panel-shell", () => ({
  PanelShell: ({ tenantId, children }: { tenantId: string; children: React.ReactNode }) => {
    mocks.shell(tenantId);
    return <div data-shell={tenantId}>{children}</div>;
  },
}));
vi.mock("@/components/shell/sign-out-button", () => ({ SignOutButton: () => <button type="submit">Cerrar sesión</button> }));
vi.mock("@/components/confirm", () => ({ ConfirmProvider: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
vi.mock("@/components/primitives/sonner", () => ({ Toaster: () => <div data-toaster="" /> }));

import SubscriptionLayout from "./layout";
import PanelLayout from "../(panel)/layout";

const base = { userId: "u1", tenantId: "clinic-new", isOwner: true, timeZone: "America/Montevideo" };

describe("(suscripcion)/layout", () => {
  beforeEach(() => vi.clearAllMocks());

  it("OWNER en onboarding → layout mínimo con el nombre del consultorio, sin el shell del panel", async () => {
    mocks.sub.mockResolvedValue({ ...base, onboarding: true });
    mocks.access.mockResolvedValue({ ok: false, reason: "onboarding_pending", clinicName: "Consultorio Nuevo", email: null, ...base });
    const out = renderToStaticMarkup(await SubscriptionLayout({ children: <p>contenido</p> }));
    expect(out).toContain("contenido");
    expect(out).toContain("Consultorio Nuevo");
    expect(out).toContain("Cerrar sesión");
    expect(out).toContain("data-toaster");
    expect(out).not.toContain("data-shell");
    expect(mocks.shell).not.toHaveBeenCalled();
  });

  it("operativa → shell del panel con el tenant del contexto", async () => {
    mocks.sub.mockResolvedValue({ ...base, tenantId: "legacy-tenant", onboarding: false });
    const out = renderToStaticMarkup(await SubscriptionLayout({ children: <p>contenido</p> }));
    expect(out).toContain('data-shell="legacy-tenant"');
    expect(mocks.access).not.toHaveBeenCalled();
  });

  it("sin acceso → la puerta redirige (no renderiza nada)", async () => {
    mocks.sub.mockRejectedValue(new Error("NEXT_REDIRECT"));
    await expect(SubscriptionLayout({ children: null })).rejects.toThrow("NEXT_REDIRECT");
    expect(mocks.shell).not.toHaveBeenCalled();
  });
});

describe("(panel)/layout después de extraer PanelShell", () => {
  it("usa requirePageContext y el mismo PanelShell con su tenant", async () => {
    mocks.page.mockResolvedValue({ tenantId: "legacy-tenant" });
    const out = renderToStaticMarkup(await PanelLayout({ children: <p>panel</p> }));
    expect(out).toBe('<div data-shell="legacy-tenant"><p>panel</p></div>');
  });
});
