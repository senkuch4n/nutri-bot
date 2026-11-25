// HU-025 (025b-2 M6): el QR de WhatsApp es solo el de la fila BotStatus del consultorio de la sesión.
import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ ctx: vi.fn(), botStatus: vi.fn(), pro: vi.fn() }));
vi.mock("@/lib/tenant-context", () => ({ requirePageContext: mocks.ctx }));
vi.mock("@/lib/professional", () => ({ getTenantProfessional: mocks.pro }));
vi.mock("@nutri-bot/db", () => ({ prisma: { botStatus: { findUnique: mocks.botStatus } } }));
vi.mock("@/components/auto-refresh", () => ({ AutoRefresh: () => null }));
vi.mock("@/components/ui", () => ({ Alert: () => null, ButtonLink: () => null, PageHeader: () => null }));
vi.mock("../../pacientes/[id]/detail-disclosure", () => ({ DetailDisclosure: () => null }));

import WhatsAppStatusPage from "./page";

beforeEach(() => {
  vi.resetAllMocks();
  mocks.ctx.mockResolvedValue({ userId: "u", tenantId: "tenant-b", agendaId: "agenda-b", professionalId: 7 });
  mocks.pro.mockResolvedValue({ timezone: "UTC" });
  mocks.botStatus.mockResolvedValue(null);
});

it("lee BotStatus por el tenant del contexto, nunca la fila id 1", async () => {
  await WhatsAppStatusPage();
  expect(mocks.botStatus).toHaveBeenCalledWith({ where: { tenantId: "tenant-b" } });
  expect(mocks.pro).toHaveBeenCalledWith("tenant-b");
});

it("sin contexto no consulta el estado del bot", async () => {
  mocks.ctx.mockRejectedValue(new Error("NEXT_REDIRECT"));
  await expect(WhatsAppStatusPage()).rejects.toThrow("NEXT_REDIRECT");
  expect(mocks.botStatus).not.toHaveBeenCalled();
});
