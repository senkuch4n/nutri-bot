// HU-022: horarios para reprogramar un turno (prisma mockeado; la lógica de core corre de verdad).
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  prisma: {
    professional: { findUnique: vi.fn(), findUniqueOrThrow: vi.fn() },
    service: { findUnique: vi.fn() },
    availabilityRule: { findMany: vi.fn() },
    availabilityException: { findMany: vi.fn() },
    appointment: { findMany: vi.fn(), findUnique: vi.fn() },
  },
}));

vi.mock("../index", () => ({ prisma: mocks.prisma }));

import { getAvailableSlotsForService, getRescheduleSlots } from "./availability";

const TZ = "America/Argentina/Buenos_Aires"; // UTC−3
const DAY = "2026-11-05"; // jueves
const DAY_START = new Date("2026-11-05T03:00:00Z");
const DAY_END = new Date("2026-11-06T03:00:00Z");
// 08:30 en Buenos Aires: con 120 min de anticipación, lo más temprano es 10:30.
const NOW = new Date("2026-11-05T11:30:00Z");
const OWN = { id: "a1", serviceId: "s1", status: "CONFIRMED", startsAt: new Date("2026-11-05T13:00:00Z") };

const local = (hhmm: string) => new Date(`${DAY}T${hhmm}:00-03:00`);

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("MIN_LEAD_MINUTES", "120");
  mocks.prisma.professional.findUnique.mockResolvedValue({ id: 1, timezone: TZ });
  mocks.prisma.service.findUnique.mockResolvedValue({ id: "s1", durationMin: 60, active: true });
  // Jueves 09:00–14:00 → inicios 09, 10, 11, 12 y 13.
  mocks.prisma.availabilityRule.findMany.mockResolvedValue([
    { weekday: 4, startTime: "09:00", endTime: "14:00", active: true },
  ]);
  mocks.prisma.availabilityException.findMany.mockResolvedValue([]);
  // Otro turno 12:00–13:00 (el propio lo excluye la consulta).
  mocks.prisma.appointment.findMany.mockResolvedValue([{ startsAt: local("12:00"), endsAt: local("13:00") }]);
  mocks.prisma.appointment.findUnique.mockResolvedValue(OWN);
});

describe("getAvailableSlotsForService", () => {
  it("regresión: sin excludeAppointmentId la consulta de ocupados no excluye ningún turno", async () => {
    const slots = await getAvailableSlotsForService({ serviceId: "s1", from: DAY_START, to: DAY_END, now: NOW });
    expect(slots).toEqual([local("11:00"), local("13:00")]);
    const { where } = mocks.prisma.appointment.findMany.mock.calls[0]![0];
    expect(where).toEqual({
      status: { in: ["CONFIRMED", "AWAITING_PAYMENT"] },
      startsAt: { lt: DAY_END },
      endsAt: { gt: DAY_START },
    });
  });

  it("con excludeAppointmentId deja afuera ese turno de los ocupados", async () => {
    await getAvailableSlotsForService({ serviceId: "s1", from: DAY_START, to: DAY_END, now: NOW, excludeAppointmentId: "a1" });
    expect(mocks.prisma.appointment.findMany.mock.calls[0]![0].where.id).toEqual({ not: "a1" });
  });
});

describe("getRescheduleSlots (HU-022)", () => {
  it("S3: inicios libres de ese día para el servicio del turno, sin el propio, con anticipación mínima", async () => {
    const slots = await getRescheduleSlots({ appointmentId: "a1", dayKey: DAY, now: NOW });
    // 09 y 10 caen antes de la anticipación, 12 está ocupado por otro turno.
    expect(slots).toEqual([local("11:00"), local("13:00")]);
    expect(mocks.prisma.service.findUnique).toHaveBeenCalledWith({ where: { id: "s1" } });
    const { where } = mocks.prisma.appointment.findMany.mock.calls[0]![0];
    expect(where).toMatchObject({ id: { not: "a1" }, startsAt: { lt: DAY_END }, endsAt: { gt: DAY_START } });
  });

  it("S3: respeta las excepciones del día (día bloqueado → sin horarios)", async () => {
    mocks.prisma.availabilityException.findMany.mockResolvedValue([
      { date: new Date(`${DAY}T00:00:00Z`), type: "BLOCKED", startTime: null, endTime: null },
    ]);
    await expect(getRescheduleSlots({ appointmentId: "a1", dayKey: DAY, now: NOW })).resolves.toEqual([]);
  });

  it("solo devuelve inicios de ese día, no del siguiente", async () => {
    mocks.prisma.availabilityRule.findMany.mockResolvedValue([
      { weekday: 4, startTime: "09:00", endTime: "14:00", active: true },
      { weekday: 5, startTime: "00:00", endTime: "02:00", active: true },
    ]);
    const slots = await getRescheduleSlots({ appointmentId: "a1", dayKey: DAY, now: NOW });
    expect(slots.every((s) => s < DAY_END)).toBe(true);
  });

  it.each([
    ["COMPLETED", OWN.startsAt],
    ["NO_SHOW", OWN.startsAt],
    ["CANCELLED", OWN.startsAt],
    ["CONFIRMED", new Date("2026-11-05T11:00:00Z")], // ya pasó
  ])("S5: turno %s (%s) → [] sin calcular horarios", async (status, startsAt) => {
    mocks.prisma.appointment.findUnique.mockResolvedValue({ ...OWN, status, startsAt });
    await expect(getRescheduleSlots({ appointmentId: "a1", dayKey: DAY, now: NOW })).resolves.toEqual([]);
    expect(mocks.prisma.appointment.findMany).not.toHaveBeenCalled();
  });

  it("S5: AWAITING_PAYMENT futuro sí se puede reprogramar", async () => {
    mocks.prisma.appointment.findUnique.mockResolvedValue({ ...OWN, status: "AWAITING_PAYMENT" });
    await expect(getRescheduleSlots({ appointmentId: "a1", dayKey: DAY, now: NOW })).resolves.toEqual([
      local("11:00"),
      local("13:00"),
    ]);
  });

  it("turno inexistente → []", async () => {
    mocks.prisma.appointment.findUnique.mockResolvedValue(null);
    await expect(getRescheduleSlots({ appointmentId: "nope", dayKey: DAY, now: NOW })).resolves.toEqual([]);
  });

  it("día inválido → tira", async () => {
    await expect(getRescheduleSlots({ appointmentId: "a1", dayKey: "2026-02-30", now: NOW })).rejects.toThrow("Fecha inválida");
  });
});
