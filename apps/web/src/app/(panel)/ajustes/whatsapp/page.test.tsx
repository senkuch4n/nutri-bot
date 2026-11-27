import { isValidElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  ctx: vi.fn(), owner: vi.fn(), botStatus: vi.fn(), pro: vi.fn(),
  createMany: vi.fn(), updateMany: vi.fn(), revalidatePath: vi.fn(),
}));
vi.mock("@/lib/tenant-context", () => ({ requirePageContext: mocks.ctx, requireOwnerContext: mocks.owner }));
vi.mock("@/lib/professional", () => ({ getTenantProfessional: mocks.pro }));
vi.mock("@nutri-bot/db", () => ({ prisma: { botStatus: {
  findUnique: mocks.botStatus, createMany: mocks.createMany, updateMany: mocks.updateMany,
} } }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/components/auto-refresh", () => ({ AutoRefresh: () => null }));
vi.mock("@/components/ui", () => ({
  Alert: ({ children }: { children: ReactNode }) => children,
  Button: ({ children }: { children: ReactNode }) => <button>{children}</button>,
  ButtonLink: () => null, PageHeader: () => null,
}));

import WhatsAppStatusPage from "./page";

const owner = { userId: "u", tenantId: "tenant-b", agendaId: "agenda-b", professionalId: 7,
  access: { kind: "member", role: "OWNER" } };
const active = { sessionKey: "secret-generation", connected: false, qr: "current-qr" };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

beforeEach(() => {
  vi.resetAllMocks();
  mocks.ctx.mockResolvedValue(owner);
  mocks.owner.mockResolvedValue(owner);
  mocks.pro.mockResolvedValue({ timezone: "UTC" });
  mocks.botStatus.mockResolvedValue(null);
  mocks.createMany.mockResolvedValue({ count: 0 });
  mocks.updateMany.mockResolvedValue({ count: 0 });
});

function findAction(node: ReactNode): ((data: FormData) => Promise<void>) | undefined {
  if (Array.isArray(node)) return node.map(findAction).find(Boolean);
  if (!isValidElement<{ children?: ReactNode; action?: (data: FormData) => Promise<void> }>(node)) return;
  return node.type === "form" ? node.props.action : findAction(node.props.children);
}

async function action() {
  const submit = findAction(await WhatsAppStatusPage());
  if (!submit) throw new Error("Expected an owner WhatsApp form");
  return submit;
}

it("lee BotStatus por el tenant del contexto, nunca la fila id 1", async () => {
  await WhatsAppStatusPage();
  expect(mocks.botStatus).toHaveBeenCalledWith(expect.objectContaining({ where: { tenantId: "tenant-b" } }));
  expect(mocks.pro).toHaveBeenCalledWith("tenant-b");
});

it("sin contexto no consulta el estado del bot", async () => {
  mocks.ctx.mockRejectedValue(new Error("NEXT_REDIRECT"));
  await expect(WhatsAppStatusPage()).rejects.toThrow("NEXT_REDIRECT");
  expect(mocks.botStatus).not.toHaveBeenCalled();
});

it("muestra Vincular en estado detenido y oculta un QR y conexión residuales", async () => {
  mocks.botStatus.mockResolvedValue({ sessionKey: null, connected: true, qr: "stale-qr" });
  const markup = renderToStaticMarkup(await WhatsAppStatusPage());
  expect(markup).toContain("Vincular WhatsApp");
  expect(markup).toContain("Desconectado");
  expect(markup).not.toContain("stale-qr");
  expect(markup).not.toContain("Desvincular WhatsApp");
});

it("muestra el QR solo durante la vinculación activa y nunca la clave", async () => {
  mocks.botStatus.mockResolvedValue(active);
  const pending = renderToStaticMarkup(await WhatsAppStatusPage());
  expect(pending).toContain("current-qr");
  expect(pending).toContain("Desvincular WhatsApp");
  expect(pending).not.toContain(active.sessionKey);
  mocks.botStatus.mockResolvedValue({ ...active, connected: true });
  const connected = renderToStaticMarkup(await WhatsAppStatusPage());
  expect(connected).not.toContain("current-qr");
  expect(connected).not.toContain(active.sessionKey);
});

it.each([{ kind: "member", role: "STAFF" }, { kind: "support", mode: "ELEVATED" }])(
  "oculta el QR y los controles para %j", async (access) => {
    mocks.ctx.mockResolvedValue({ ...owner, access });
    mocks.botStatus.mockResolvedValue(active);
    const page = await WhatsAppStatusPage();
    expect(findAction(page)).toBeUndefined();
    expect(renderToStaticMarkup(page)).not.toContain("current-qr");
  },
);

it("crea una intención nueva solo para el OWNER de la sesión, sin confiar en el formulario", async () => {
  mocks.createMany.mockResolvedValue({ count: 1 });
  const form = new FormData();
  form.set("tenantId", "tenant-other");
  form.set("sessionKey", "client-key");
  await expect((await action())(form)).resolves.toBeUndefined();
  expect(mocks.owner).toHaveBeenCalledOnce();
  expect(mocks.createMany).toHaveBeenCalledWith({
    data: { tenantId: "tenant-b", sessionKey: expect.stringMatching(uuid) }, skipDuplicates: true,
  });
  expect(mocks.updateMany).not.toHaveBeenCalled();
  expect(mocks.revalidatePath).toHaveBeenCalledWith("/ajustes/whatsapp");
});

it("vincular dos veces no rota la intención ni altera QR o conexión activos", async () => {
  let row = { sessionKey: null as string | null, qr: "stale", connected: true };
  mocks.updateMany.mockImplementation(async ({ where, data }) => {
    if (row.sessionKey !== where.sessionKey) return { count: 0 };
    row = { ...row, ...data };
    return { count: 1 };
  });
  const link = await action();
  await link(new FormData());
  expect(mocks.updateMany).toHaveBeenCalledWith({
    where: { tenantId: "tenant-b", sessionKey: null },
    data: { sessionKey: expect.stringMatching(uuid), qr: null, connected: false },
  });
  const key = row.sessionKey;
  row = { ...row, qr: "fresh", connected: true };
  await link(new FormData());
  expect(row).toEqual({ sessionKey: key, qr: "fresh", connected: true });
});

it("desvincula dentro del tenant autenticado en una escritura condicional", async () => {
  mocks.botStatus.mockResolvedValue(active);
  const form = new FormData();
  form.set("tenantId", "tenant-other");
  await expect((await action())(form)).resolves.toBeUndefined();
  expect(mocks.owner).toHaveBeenCalledOnce();
  expect(mocks.createMany).not.toHaveBeenCalled();
  expect(mocks.updateMany).toHaveBeenCalledWith({
    where: { tenantId: "tenant-b", OR: [{ sessionKey: { not: null } }, { qr: { not: null } }, { connected: true }] },
    data: { sessionKey: null, qr: null, connected: false },
  });
  expect(mocks.revalidatePath).toHaveBeenCalledWith("/ajustes/whatsapp");
});

it.each([null, active])("vuelve a autorizar cada acción antes de escribir (%j)", async (status) => {
  mocks.botStatus.mockResolvedValue(status);
  const submit = await action();
  mocks.owner.mockRejectedValue(new Error("owner_only"));
  await expect(submit(new FormData())).rejects.toThrow("owner_only");
  expect(mocks.createMany).not.toHaveBeenCalled();
  expect(mocks.updateMany).not.toHaveBeenCalled();
  expect(mocks.revalidatePath).not.toHaveBeenCalled();
});
