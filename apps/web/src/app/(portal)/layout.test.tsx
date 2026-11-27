// HU-033 (025c): el layout del portal usa el consultorio de la sesión; sin sesión, el de la instalación de
// WhatsApp (LEGACY_TENANT_ID, el único número que manda links hoy; HU-027 lo cambia).
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ session: vi.fn(), contact: vi.fn(), title: vi.fn() }));
vi.mock("@/lib/patient-session", () => ({ getPortalSession: mocks.session }));
vi.mock("@/lib/shell", () => ({ getProfessionalPortalContact: mocks.contact, getPortalDocumentTitle: mocks.title }));
vi.mock("@nutri-bot/db/domain", () => ({ LEGACY_TENANT_ID: "legacy-tenant" }));
vi.mock("@/components/confirm", () => ({ ConfirmProvider: () => null }));
vi.mock("@/components/pending-unload-guard", () => ({ PendingUnloadGuard: () => null }));
vi.mock("@/components/portal/portal-access", () => ({ PortalAccessGate: () => null, PortalAccessScreen: () => null }));
vi.mock("@/components/primitives/sonner", () => ({ Toaster: () => null }));
vi.mock("@/components/shell/portal-header", () => ({ PortalHeader: () => null }));
vi.mock("@/components/shell/portal-nav", () => ({ PortalNav: () => null }));

import PortalLayout, { generateMetadata } from "./layout";

const SESSION_B = { patient: { id: "pat_b", tenantId: "tenant-b" }, tenantId: "tenant-b" };

describe("layout del portal por consultorio", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.contact.mockResolvedValue({ name: "Lic. Ana", whatsappUrl: null });
    mocks.title.mockResolvedValue("Tu espacio");
  });

  it("con sesión → nombre y WhatsApp del consultorio de la sesión", async () => {
    mocks.session.mockResolvedValue(SESSION_B);
    await PortalLayout({ children: null });
    expect(mocks.contact.mock.calls).toEqual([["tenant-b"]]);
  });

  it("sin sesión → pantalla de acceso con el consultorio de la instalación de WhatsApp", async () => {
    mocks.session.mockResolvedValue(null);
    await PortalLayout({ children: null });
    expect(mocks.contact.mock.calls).toEqual([["legacy-tenant"]]);
  });

  it("el título de la pestaña sigue la misma regla", async () => {
    mocks.session.mockResolvedValue(SESSION_B);
    await generateMetadata();
    mocks.session.mockResolvedValue(null);
    await generateMetadata();
    expect(mocks.title.mock.calls).toEqual([["tenant-b"], ["legacy-tenant"]]);
  });
});
