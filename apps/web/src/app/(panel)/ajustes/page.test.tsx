// HU-025 (025b-2 M11, 7.2.1): la pestaña Equipo solo la ve la responsable (OWNER).
import { beforeEach, describe, expect, it, vi } from "vitest";
import { isValidElement, type ReactElement } from "react";

const mocks = vi.hoisted(() => ({ ctx: vi.fn(), members: vi.fn(), botStatus: vi.fn(), logo: vi.fn() }));
const Null = vi.hoisted(() => () => null);
vi.mock("@/lib/tenant-context", () => ({ requirePageContext: mocks.ctx }));
vi.mock("@nutri-bot/db", () => ({ prisma: { botStatus: { findUnique: mocks.botStatus }, professional: { findUnique: mocks.logo } } }));
vi.mock("@nutri-bot/db/domain", () => ({
  listTenantMembers: mocks.members,
  getMercadoPagoConnectionView: vi.fn().mockResolvedValue({ status: "not_connected", hasActiveDepositServices: false, pendingDepositCount: 0 }),
}));
vi.mock("@/lib/professional", () => ({
  getTenantProfessional: vi.fn().mockResolvedValue({
    timezone: "UTC", currency: "ARS", phoneJid: null, acceptedInsurances: null, googleRefreshToken: null, googleCalendarId: null,
    botPaused: false, botAiEnabled: false, botAiInfo: null, afterHoursEnabled: false, afterHoursStart: "22:00", afterHoursEnd: "09:00",
    title: null, name: "Pro", licenseNumber: null, pdfAccentColor: null, pdfFooterText: null, logoMimeType: null, updatedAt: new Date(0),
  }),
}));
vi.mock("@/auth", () => ({ signIn: vi.fn() }));
vi.mock("@/lib/bot-ai", () => ({ getBotAiKeyStatus: () => ({ hasKey: false, apiKeyEnvName: "X" }) }));
vi.mock("@/components/grouped-list", () => ({ GroupedList: Null, GroupedListRow: Null }));
vi.mock("@/components/ui", () => ({ Alert: Null, Button: Null, ButtonLink: Null }));
vi.mock("../pacientes/[id]/detail-disclosure", () => ({ DetailDisclosure: Null }));
vi.mock("./after-hours-form", () => ({ AfterHoursForm: Null }));
vi.mock("./ajustes-tabs", () => ({ AjustesTabs: Null }));
vi.mock("./bot-ai-form", () => ({ BotAiForm: Null }));
vi.mock("./bot-toggle", () => ({ BotToggle: Null }));
vi.mock("./general-form", () => ({ GeneralForm: Null }));
vi.mock("./google-calendar-form", () => ({ GoogleCalendarForm: Null, GoogleDisconnectButton: Null }));
vi.mock("./logo-form", () => ({ LogoForm: Null }));
vi.mock("./mercadopago-section", () => ({ MercadoPagoCallbackBanner: Null, MercadoPagoConnectButton: Null, MercadoPagoDisconnectButton: Null }));
vi.mock("./pdf-style-form", () => ({ PdfStyleForm: Null }));
vi.mock("./signature-form", () => ({ SignatureForm: Null }));
vi.mock("./signature-identity-form", () => ({ SignatureIdentityForm: Null }));
vi.mock("./team-section", () => ({ TeamSection: Null }));

import AjustesPage from "./page";

const ctx = (role: "OWNER" | "STAFF") => ({
  userId: "u-1", tenantId: "tenant-a", agendaId: "agenda-a", professionalId: 1,
  access: { kind: "member", tenantId: "tenant-a", role },
});

type TabsProps = { tabs: string[]; panels: Record<string, unknown>; summaries: Record<string, string> };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.botStatus.mockResolvedValue(null);
  mocks.logo.mockResolvedValue(null);
  mocks.members.mockResolvedValue([
    { userId: "u-1", email: "owner@example.test", role: "OWNER", createdAt: new Date("2026-11-01T12:00:00Z") },
    { userId: "u-2", email: "staff@example.test", role: "STAFF", createdAt: new Date("2026-11-02T12:00:00Z") },
  ]);
});

describe("Ajustes → Equipo", () => {
  it("OWNER: ve la pestaña con los miembros de su consultorio y la fila propia marcada", async () => {
    mocks.ctx.mockResolvedValue(ctx("OWNER"));
    const el = (await AjustesPage()) as ReactElement<TabsProps>;
    expect(el.props.tabs).toContain("equipo");
    expect(mocks.members).toHaveBeenCalledWith("tenant-a");
    expect(el.props.summaries.equipo).toBe("2 personas");
    const team = el.props.panels.equipo as ReactElement<{ members: { userId: string; isSelf: boolean; sinceLabel: string }[] }>;
    expect(isValidElement(team)).toBe(true);
    expect(team.props.members).toEqual([
      expect.objectContaining({ userId: "u-1", isSelf: true, sinceLabel: "01/11/2026" }),
      expect.objectContaining({ userId: "u-2", isSelf: false, sinceLabel: "02/11/2026" }),
    ]);
  });

  it("STAFF: no ve la pestaña ni se leen los miembros", async () => {
    mocks.ctx.mockResolvedValue(ctx("STAFF"));
    const el = (await AjustesPage()) as ReactElement<TabsProps>;
    expect(el.props.tabs).not.toContain("equipo");
    expect(el.props.panels.equipo).toBeUndefined();
    expect(mocks.members).not.toHaveBeenCalled();
  });

  it("el estado de WhatsApp es el de la fila BotStatus del consultorio", async () => {
    mocks.ctx.mockResolvedValue(ctx("STAFF"));
    await AjustesPage();
    expect(mocks.botStatus).toHaveBeenCalledWith({ where: { tenantId: "tenant-a" } });
  });
});
