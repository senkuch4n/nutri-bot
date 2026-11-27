// HU-033 (025c): las consultas del flujo de reserva del bot son del consultorio de la conversación.
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  services: vi.fn(), appointments: vi.fn(), slots: vi.fn(), professional: vi.fn(), tenant: vi.fn(),
}));
vi.mock("@nutri-bot/db", () => ({
  prisma: { service: { findMany: mocks.services }, appointment: { findMany: mocks.appointments } },
}));
vi.mock("@nutri-bot/db/domain", () => ({
  getAvailableSlotsForService: mocks.slots,
  getTenantProfessional: mocks.professional,
}));
vi.mock("./tenant", () => ({ getConversationTenant: mocks.tenant }));

import { cancelableAppointments, listActiveServices, nextAvailableDays, slotsForDay } from "./booking";

describe("booking del bot por consultorio", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.tenant.mockResolvedValue({ tenantId: "tenant-b" });
    mocks.professional.mockResolvedValue({ timezone: "America/Argentina/Buenos_Aires" });
    mocks.services.mockResolvedValue([]);
    mocks.appointments.mockResolvedValue([]);
    mocks.slots.mockResolvedValue([]);
  });

  it("listActiveServices: solo servicios activos del consultorio de la conversación", async () => {
    await listActiveServices();
    expect(mocks.services).toHaveBeenCalledWith({ where: { tenantId: "tenant-b", active: true }, orderBy: { createdAt: "asc" } });
  });

  it("cancelableAppointments: turnos del paciente en el consultorio de la conversación", async () => {
    await cancelableAppointments("pat_b");
    const where = mocks.appointments.mock.calls[0]![0].where;
    expect(where).toMatchObject({ patientId: "pat_b", tenantId: "tenant-b", status: "CONFIRMED" });
  });

  it("nextAvailableDays: zona horaria de la profesional del consultorio y slots del consultorio", async () => {
    mocks.slots.mockResolvedValue([new Date("2026-12-01T13:00:00Z"), new Date("2026-12-01T14:00:00Z"), new Date("2026-12-02T13:00:00Z")]);
    const days = await nextAvailableDays("svc", 6);
    expect(days.map((d) => d.dayKey)).toEqual(["2026-12-01", "2026-12-02"]);
    expect(mocks.professional.mock.calls).toEqual([["tenant-b"]]);
    expect(mocks.slots.mock.calls[0]![0]).toEqual({ tenantId: "tenant-b" });
  });

  it("slotsForDay: el día se arma en la zona de la profesional del consultorio", async () => {
    await slotsForDay("svc", "2026-12-01");
    expect(mocks.professional.mock.calls).toEqual([["tenant-b"]]);
    const [t, range] = mocks.slots.mock.calls[0]!;
    expect(t).toEqual({ tenantId: "tenant-b" });
    expect(range).toEqual({ serviceId: "svc", from: new Date("2026-12-01T03:00:00Z"), to: new Date("2026-12-02T02:59:59Z") });
  });
});
