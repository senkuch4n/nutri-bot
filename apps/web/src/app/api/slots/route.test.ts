// HU-025b-1: /api/slots usa la agenda del consultorio de la sesión (mocks, sin base).
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getTenantContext: vi.fn(),
  getTenantProfessional: vi.fn(),
  getAvailableSlotsForService: vi.fn(),
}));
vi.mock("@/lib/tenant-context", () => ({ getTenantContext: mocks.getTenantContext }));
vi.mock("@nutri-bot/db/domain", () => ({ getTenantProfessional: mocks.getTenantProfessional }));
vi.mock("@/lib/availability", () => ({ getAvailableSlotsForService: mocks.getAvailableSlotsForService }));

import { GET } from "./route";

const ctxA = {
  userId: "u-a", tenantId: "tenant-a", agendaId: "agenda-a", professionalId: 1,
  access: { kind: "member", tenantId: "tenant-a", role: "OWNER" },
};
const req = (q: string) => new Request(`http://localhost/api/slots?${q}`);

beforeEach(() => {
  vi.resetAllMocks();
  mocks.getTenantContext.mockResolvedValue(ctxA);
  mocks.getTenantProfessional.mockResolvedValue({ timezone: "America/Argentina/Buenos_Aires" });
  mocks.getAvailableSlotsForService.mockResolvedValue([new Date("2026-11-24T13:00:00Z")]);
});

describe("GET /api/slots", () => {
  it("consulta la agenda del tenant del contexto e ignora tenantId/agendaId de la query", async () => {
    const res = await GET(req("serviceId=s1&date=2026-11-24&tenantId=tenant-b&agendaId=agenda-b"));
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(await res.json()).toEqual(["2026-11-24T13:00:00.000Z"]);
    expect(mocks.getTenantProfessional).toHaveBeenCalledWith("tenant-a");
    const [t, params] = mocks.getAvailableSlotsForService.mock.calls[0]!;
    expect(t).toMatchObject({ tenantId: "tenant-a" });
    expect(params).toMatchObject({ serviceId: "s1" });
    expect(params).not.toHaveProperty("tenantId");
  });

  it("un servicio de otro consultorio responde igual que uno inexistente ([])", async () => {
    mocks.getAvailableSlotsForService.mockResolvedValue([]);
    const res = await GET(req("serviceId=servicio-de-b&date=2026-11-24"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  it("sin contexto → 401 sin consultar nada", async () => {
    mocks.getTenantContext.mockResolvedValue(null);
    const res = await GET(req("serviceId=s1&date=2026-11-24"));
    expect(res.status).toBe(401);
    expect(mocks.getAvailableSlotsForService).not.toHaveBeenCalled();
    expect(mocks.getTenantProfessional).not.toHaveBeenCalled();
  });

  it("parámetros inválidos → 400", async () => {
    const res = await GET(req("serviceId=s1&date=24-11-2026"));
    expect(res.status).toBe(400);
    expect(mocks.getAvailableSlotsForService).not.toHaveBeenCalled();
  });
});
