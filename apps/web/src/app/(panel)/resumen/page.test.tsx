// HU-025 (025b-2 M9): el Inicio arma todo con el consultorio del contexto.
import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  ctx: vi.fn(), professional: vi.fn(), displayName: vi.fn(), listServices: vi.fn(), loadTurnos: vi.fn(),
}));
vi.mock("@/lib/tenant-context", () => ({ requirePageContext: mocks.ctx }));
vi.mock("@nutri-bot/db/domain", () => ({ getTenantProfessional: mocks.professional }));
vi.mock("@/lib/shell", () => ({ getProfessionalDisplayName: mocks.displayName }));
vi.mock("@/lib/services", () => ({ listServices: mocks.listServices }));
vi.mock("../turnos/data", () => ({ loadTurnos: mocks.loadTurnos }));
vi.mock("./home-client", () => ({ HomeClient: () => null }));

import HomePage from "./page";

const CTX_B = { userId: "u-b", tenantId: "tenant-b", agendaId: "agenda-b", professionalId: 7 };

beforeEach(() => {
  vi.resetAllMocks();
  mocks.ctx.mockResolvedValue(CTX_B);
  mocks.professional.mockResolvedValue({ timezone: "UTC", currency: "ARS" });
  mocks.displayName.mockResolvedValue("Profesional B");
  mocks.listServices.mockResolvedValue([]);
  mocks.loadTurnos.mockResolvedValue([]);
});

it("profesional, nombre, servicios y turnos salen del tenant del contexto", async () => {
  const el = await HomePage();
  expect(mocks.professional).toHaveBeenCalledWith("tenant-b");
  expect(mocks.displayName).toHaveBeenCalledWith("tenant-b");
  expect(mocks.listServices).toHaveBeenCalledWith(CTX_B, { activeOnly: true });
  expect(mocks.loadTurnos).toHaveBeenCalledTimes(3);
  for (const call of mocks.loadTurnos.mock.calls) expect(call[0]).toBe(CTX_B);
  expect((el as { props: { greetingName: string } }).props.greetingName).toBe("Profesional");
});

it("sin contexto no lee nada", async () => {
  mocks.ctx.mockRejectedValue(new Error("NEXT_REDIRECT"));
  await expect(HomePage()).rejects.toThrow("NEXT_REDIRECT");
  expect(mocks.professional).not.toHaveBeenCalled();
  expect(mocks.loadTurnos).not.toHaveBeenCalled();
});
