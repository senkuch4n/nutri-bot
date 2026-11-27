// HU-025 (025b-2 M11, 7.2.1): la pestaña Equipo solo la ve la responsable (OWNER).
// HU-028a (D4b): los botones de Mercado Pago (conectar, reconectar, desconectar) también.
// HU-028b (D4b): y los de Google Calendar (conectar, reconectar, desconectar, opciones avanzadas).
import { beforeEach, describe, expect, it, vi } from "vitest";
import { isValidElement, type ReactElement } from "react";

const mocks = vi.hoisted(() => ({ ctx: vi.fn(), members: vi.fn(), botStatus: vi.fn(), logo: vi.fn(), mpView: vi.fn(), gcView: vi.fn(), subView: vi.fn() }));
const Null = vi.hoisted(() => () => null);
const MP = vi.hoisted(() => ({
  MercadoPagoCallbackBanner: () => null,
  MercadoPagoConnectButton: () => null,
  MercadoPagoDisconnectButton: () => null,
}));
vi.mock("@/lib/tenant-context", () => ({ requirePageContext: mocks.ctx }));
vi.mock("@nutri-bot/db", () => ({ prisma: { botStatus: { findUnique: mocks.botStatus }, professional: { findUnique: mocks.logo } } }));
const GC = vi.hoisted(() => ({
  GoogleCalendarCallbackBanner: () => null,
  GoogleCalendarConnectButton: () => null,
  GoogleCalendarForm: () => null,
  GoogleDisconnectButton: () => null,
}));
const UI = vi.hoisted(() => ({
  GroupedList: () => null,
  GroupedListRow: () => null,
  Alert: () => null,
  DetailDisclosure: () => null,
}));
vi.mock("@nutri-bot/db/domain", () => ({
  listTenantMembers: mocks.members,
  getMercadoPagoConnectionView: mocks.mpView,
  getTenantSubscriptionView: mocks.subView,
}));
vi.mock("@nutri-bot/db/domain/googleCalendar", () => ({ getGoogleCalendarConnectionView: mocks.gcView }));
vi.mock("@/lib/professional", () => ({
  getTenantProfessional: vi.fn().mockResolvedValue({
    timezone: "UTC", currency: "ARS", phoneJid: null, acceptedInsurances: null,
    botPaused: false, botAiEnabled: false, botAiInfo: null, afterHoursEnabled: false, afterHoursStart: "22:00", afterHoursEnd: "09:00",
    title: null, name: "Pro", licenseNumber: null, pdfAccentColor: null, pdfFooterText: null, logoMimeType: null, updatedAt: new Date(0),
  }),
}));
vi.mock("@/lib/bot-ai", () => ({ getBotAiKeyStatus: () => ({ hasKey: false, apiKeyEnvName: "X" }) }));
vi.mock("@/components/grouped-list", () => ({ GroupedList: UI.GroupedList, GroupedListRow: UI.GroupedListRow }));
vi.mock("@/components/ui", () => ({ Alert: UI.Alert, Button: Null, ButtonLink: Null }));
vi.mock("../pacientes/[id]/detail-disclosure", () => ({ DetailDisclosure: UI.DetailDisclosure }));
vi.mock("./after-hours-form", () => ({ AfterHoursForm: Null }));
vi.mock("./ajustes-tabs", () => ({ AjustesTabs: Null }));
vi.mock("./bot-ai-form", () => ({ BotAiForm: Null }));
vi.mock("./bot-toggle", () => ({ BotToggle: Null }));
vi.mock("./general-form", () => ({ GeneralForm: Null }));
vi.mock("./google-calendar-form", () => GC);
vi.mock("./logo-form", () => ({ LogoForm: Null }));
vi.mock("./mercadopago-section", () => MP);
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

const MP_VIEW = { status: "not_connected", hasActiveDepositServices: false, pendingDepositCount: 0 };
const GC_VIEW = { status: "not_connected", googleEmail: null, calendarId: null, syncError: null, connectedAt: null };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.mpView.mockResolvedValue(MP_VIEW);
  mocks.gcView.mockResolvedValue(GC_VIEW);
  mocks.subView.mockResolvedValue({ availability: "unavailable", plans: [], trialUsed: false, subscription: null });
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

/** Tipos de los elementos de un árbol de React (sin renderizar). */
function elementTypes(node: unknown, out: unknown[] = []): unknown[] {
  if (Array.isArray(node)) node.forEach((n) => elementTypes(n, out));
  else if (isValidElement(node)) {
    out.push(node.type);
    const props = node.props as Record<string, unknown>;
    for (const value of Object.values(props)) elementTypes(value, out);
  }
  return out;
}

describe("Ajustes → Mercado Pago (HU-028a)", () => {
  const connected = {
    ...MP_VIEW, status: "connected", userId: "555", nickname: "VENDEDOR", email: "v@example.test", liveMode: true,
    connectedAt: new Date(0), errorCode: null,
  };

  it.each([
    ["not_connected", MP_VIEW, [MP.MercadoPagoConnectButton]],
    ["connected", connected, [MP.MercadoPagoConnectButton, MP.MercadoPagoDisconnectButton]],
    ["needs_reconnect", { ...connected, status: "needs_reconnect", errorCode: "revoked" }, [MP.MercadoPagoConnectButton, MP.MercadoPagoDisconnectButton]],
  ])("OWNER ve los botones (%s)", async (_status, view, expected) => {
    mocks.ctx.mockResolvedValue(ctx("OWNER"));
    mocks.mpView.mockResolvedValue(view);
    const el = (await AjustesPage()) as ReactElement<TabsProps>;
    const types = elementTypes(el.props.panels.mercadopago);
    for (const type of expected) expect(types).toContain(type);
    expect(types).toContain(MP.MercadoPagoCallbackBanner);
  });

  it.each([
    ["not_connected", MP_VIEW],
    ["connected", connected],
    ["needs_reconnect", { ...connected, status: "needs_reconnect", errorCode: "revoked" }],
  ])("STAFF ve el estado y los datos, sin botones (%s)", async (_status, view) => {
    mocks.ctx.mockResolvedValue(ctx("STAFF"));
    mocks.mpView.mockResolvedValue(view);
    const el = (await AjustesPage()) as ReactElement<TabsProps>;
    const types = elementTypes(el.props.panels.mercadopago);
    expect(types).not.toContain(MP.MercadoPagoConnectButton);
    expect(types).not.toContain(MP.MercadoPagoDisconnectButton);
    expect(types).toContain(MP.MercadoPagoCallbackBanner);
    expect(el.props.panels.mercadopago).toBeTruthy();
  });
});

/** Elementos de un árbol de React (sin renderizar), con sus props. */
function elements(node: unknown, out: ReactElement<Record<string, unknown>>[] = []): ReactElement<Record<string, unknown>>[] {
  if (Array.isArray(node)) node.forEach((n) => elements(n, out));
  else if (isValidElement(node)) {
    out.push(node as ReactElement<Record<string, unknown>>);
    for (const value of Object.values(node.props as Record<string, unknown>)) elements(value, out);
  }
  return out;
}

/** Texto plano de un nodo (strings anidados). */
function text(node: unknown): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(text).join("");
  if (isValidElement(node)) return text((node.props as { children?: unknown }).children);
  return "";
}

describe("Ajustes → Google Calendar (HU-028b)", () => {
  const connected = {
    status: "connected", googleEmail: "daiana@example.test", calendarId: "cal-x", syncError: null, connectedAt: new Date(0),
  };

  async function googlePanel(role: "OWNER" | "STAFF", view: object) {
    mocks.ctx.mockResolvedValue(ctx(role));
    mocks.gcView.mockResolvedValue(view);
    const el = (await AjustesPage()) as ReactElement<TabsProps>;
    expect(mocks.gcView).toHaveBeenCalledWith(ctx(role));
    return { el, all: elements(el.props.panels.google) };
  }

  it("OWNER conectado: Reconectar, Desconectar, Opciones avanzadas y la fila Cuenta con el email", async () => {
    const { el, all } = await googlePanel("OWNER", connected);
    const types = all.map((e) => e.type);
    const connect = all.filter((e) => e.type === GC.GoogleCalendarConnectButton);
    expect(connect).toHaveLength(1);
    expect(connect[0]!.props).toMatchObject({ reconnect: true, variant: "secondary" });
    expect(types).toContain(GC.GoogleDisconnectButton);
    expect(types).toContain(GC.GoogleCalendarCallbackBanner);
    const advanced = all.find((e) => e.type === UI.DetailDisclosure && e.props.label === "Opciones avanzadas");
    expect(advanced).toBeDefined();
    expect(all.find((e) => e.type === GC.GoogleCalendarForm)?.props.defaultId).toBe("cal-x");
    const account = all.find((e) => e.type === UI.GroupedListRow && e.props.label === "Cuenta");
    expect(account).toBeDefined();
    expect(text(account!.props.value)).toBe("daiana@example.test");
    expect(elements(account!.props.value)[0]!.props.translate).toBe("no");
    expect(el.props.summaries.google).toBe("Conectado");
  });

  it("STAFF conectado: ve estado, cuenta y calendario, sin botones ni Opciones avanzadas", async () => {
    const { all } = await googlePanel("STAFF", connected);
    const types = all.map((e) => e.type);
    expect(types).not.toContain(GC.GoogleCalendarConnectButton);
    expect(types).not.toContain(GC.GoogleDisconnectButton);
    expect(types).not.toContain(GC.GoogleCalendarForm);
    expect(all.some((e) => e.type === UI.DetailDisclosure && e.props.label === "Opciones avanzadas")).toBe(false);
    const labels = all.filter((e) => e.type === UI.GroupedListRow).map((e) => e.props.label);
    expect(labels).toEqual(["Estado", "Cuenta", "Calendario"]);
  });

  it("OWNER sin conectar: botón Conectar habilitado, sin Desconectar ni fila Cuenta", async () => {
    const { all } = await googlePanel("OWNER", GC_VIEW);
    const connect = all.filter((e) => e.type === GC.GoogleCalendarConnectButton);
    expect(connect).toHaveLength(1);
    expect(connect[0]!.props).toEqual({ disabled: false });
    expect(all.map((e) => e.type)).not.toContain(GC.GoogleDisconnectButton);
    expect(all.filter((e) => e.type === UI.GroupedListRow).map((e) => e.props.label)).toEqual(["Estado"]);
  });

  it("not_configured: aviso y botón deshabilitado", async () => {
    const { all } = await googlePanel("OWNER", { ...GC_VIEW, status: "not_configured" });
    expect(all.find((e) => e.type === GC.GoogleCalendarConnectButton)?.props).toEqual({ disabled: true });
    const alerts = all.filter((e) => e.type === UI.Alert);
    expect(alerts.map((a) => [a.props.tone, text(a.props.children)])).toEqual([
      ["warning", "La conexión con Google Calendar no está configurada en el servidor."],
    ]);
  });

  it("syncError: alerta de error con el detalle técnico", async () => {
    const { all } = await googlePanel("OWNER", { ...connected, syncError: "Google Calendar respondió con error (status 401, invalid_grant)" });
    const alert = all.find((e) => e.type === UI.Alert && e.props.tone === "danger");
    expect(alert).toBeDefined();
    expect(text(alert!.props.children)).toContain("Google dejó de aceptar la conexión");
    const detail = elements(alert!.props.children).find((e) => e.type === UI.DetailDisclosure);
    expect(text(detail!.props.children)).toBe("Google Calendar respondió con error (status 401, invalid_grant)");
  });
});

// HU-029b (§B.6.3): pestaña Suscripción para todos los miembros, con el estado corto y el enlace a la pantalla.
describe("Ajustes → Suscripción", () => {
  it.each(["OWNER", "STAFF"] as const)("%s ve la pestaña (después de Mercado Pago) con el resumen", async (role) => {
    mocks.ctx.mockResolvedValue(ctx(role));
    mocks.subView.mockResolvedValue({
      availability: "enabled", plans: [], trialUsed: false,
      subscription: { status: "TRIALING", authorized: true },
    });
    const el = (await AjustesPage()) as ReactElement<TabsProps>;
    expect(el.props.tabs).toContain("suscripcion");
    expect(el.props.tabs.indexOf("suscripcion")).toBe(el.props.tabs.indexOf("mercadopago") + 1);
    expect(el.props.summaries.suscripcion).toBe("En prueba");
    expect(isValidElement(el.props.panels.suscripcion)).toBe(true);
    expect(mocks.subView).toHaveBeenCalledWith({ tenantId: "tenant-a" }, { userId: "u-1" });
  });

  it.each([
    ["cobro apagado", { availability: "unavailable", plans: [], trialUsed: false, subscription: null }, "No disponible"],
    ["sin suscripción", { availability: "enabled", plans: [], trialUsed: false, subscription: null }, "Sin suscripción"],
    ["checkout abandonado", { availability: "enabled", plans: [], trialUsed: false, subscription: { status: "CANCELED", authorized: false } }, "Sin suscripción"],
    ["cancelada", { availability: "enabled", plans: [], trialUsed: false, subscription: { status: "CANCELED", authorized: true } }, "Cancelada"],
    ["pendiente", { availability: "enabled", plans: [], trialUsed: false, subscription: { status: "PENDING", authorized: false } }, "Pendiente"],
  ])("%s → %s", async (_n, view, summary) => {
    mocks.ctx.mockResolvedValue(ctx("OWNER"));
    mocks.subView.mockResolvedValue(view);
    const el = (await AjustesPage()) as ReactElement<TabsProps>;
    expect(el.props.summaries.suscripcion).toBe(summary);
  });
});
