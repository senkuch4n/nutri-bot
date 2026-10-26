// HU-021 (SDD §11): loader de /turnos, con Prisma mockeado (sin base).
import { beforeEach, describe, expect, it, vi } from "vitest";
import { monthRangeInTz } from "@nutri-bot/core";

const mocks = vi.hoisted(() => ({ findMany: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("@nutri-bot/db", () => ({ prisma: { appointment: { findMany: mocks.findMany } } }));

import { loadTurnosMonth } from "./data";

const tz = "America/Argentina/Buenos_Aires";
const dec = (value: string) => ({ toString: () => value });

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: "a1",
    startsAt: new Date("2026-10-20T13:00:00Z"),
    endsAt: new Date("2026-10-20T14:00:00Z"),
    status: "CONFIRMED",
    cancelledBy: null,
    cancelReason: null,
    reason: "Control mensual",
    priceSnapshot: dec("20000.00"),
    googleEventId: "g-1",
    patient: { id: "p1", name: "Carla López", phone: "5493515550001", whatsappJid: "5493515550001@s.whatsapp.net", archivedAt: null },
    service: { id: "s1", name: "Consulta", requiresDeposit: true, depositKind: "PERCENT", depositValue: dec("25") },
    payments: [{ amount: dec("5000.00") }, { amount: dec("1000.50") }],
    consultation: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.findMany.mockResolvedValue([]);
});

describe("loadTurnosMonth", () => {
  it("queries every status of the month, approved payments only, sorted by start and id", async () => {
    await loadTurnosMonth("2026-10", tz);
    const { from, to } = monthRangeInTz("2026-10", tz);
    const args = mocks.findMany.mock.calls[0]![0];
    expect(args.where).toEqual({ startsAt: { gte: from, lt: to } });
    expect(args.select.payments).toEqual({ where: { status: "APPROVED" }, select: { amount: true } });
    expect(args.orderBy).toEqual([{ startsAt: "asc" }, { id: "asc" }]);
  });

  it("maps the row into a serializable DTO", async () => {
    mocks.findMany.mockResolvedValue([row()]);
    const [dto] = await loadTurnosMonth("2026-10", tz);
    expect(dto).toEqual({
      id: "a1",
      startsAt: "2026-10-20T13:00:00.000Z",
      endsAt: "2026-10-20T14:00:00.000Z",
      status: "CONFIRMED",
      cancelledBy: null,
      cancelReason: null,
      reason: "Control mensual",
      price: 20000,
      priceSnapshot: "20000.00",
      approvedAmounts: [5000, 1000.5],
      depositAmount: "5000",
      googleSynced: true,
      service: { id: "s1", name: "Consulta" },
      patient: { id: "p1", name: "Carla López", phone: "5493515550001", whatsappJid: "5493515550001@s.whatsapp.net", archived: false },
      consultation: null,
    });
  });

  it("maps archived patients, missing deposit, google sync and consultation content", async () => {
    mocks.findMany.mockResolvedValue([
      row({
        id: "a2",
        status: "COMPLETED",
        googleEventId: null,
        payments: [],
        patient: { id: "p2", name: null, phone: "1", whatsappJid: "1@lid", archivedAt: new Date("2026-10-01T00:00:00Z") },
        service: { id: "s2", name: "Antropometría", requiresDeposit: false, depositKind: null, depositValue: null },
        consultation: { id: "c1", notes: null, planId: null, prescription: null, _count: { evolutionEntries: 2 } },
      }),
      row({
        id: "a3",
        status: "CANCELLED",
        cancelledBy: "PROFESSIONAL",
        cancelReason: "Venció el tiempo para pagar la seña",
        consultation: { id: "c2", notes: "  ", planId: null, prescription: null, _count: { evolutionEntries: 0 } },
      }),
    ]);
    const [archived, cancelled] = await loadTurnosMonth("2026-10", tz);
    expect(archived).toMatchObject({
      googleSynced: false,
      approvedAmounts: [],
      depositAmount: null,
      patient: { archived: true, name: null },
      consultation: { id: "c1", hasContent: true },
    });
    expect(cancelled).toMatchObject({
      status: "CANCELLED",
      cancelledBy: "PROFESSIONAL",
      cancelReason: "Venció el tiempo para pagar la seña",
      consultation: { id: "c2", hasContent: false },
    });
  });
});
