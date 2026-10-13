// HU-017b-1 (SDD 4.7, 9-1): los turnos del calendario se titulan con el nombre, el teléfono con formato
// o "Sin nombre", y traen lo que necesita el panel del turno.
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), findMany: vi.fn() }));
vi.mock("@/auth", () => ({ auth: mocks.auth }));
vi.mock("@nutri-bot/db", () => ({ prisma: { appointment: { findMany: mocks.findMany } } }));

import { GET } from "./route";

const URL_OK = "http://x/api/appointments?start=2026-10-05T00:00:00Z&end=2026-10-12T00:00:00Z";

function appt(id: string, patient: { name: string | null; phone: string; whatsappJid: string }, payments: { id: string }[] = []) {
  return {
    id,
    patientId: `p-${id}`,
    startsAt: new Date("2026-10-08T13:00:00Z"),
    endsAt: new Date("2026-10-08T13:45:00Z"),
    status: "CONFIRMED",
    priceSnapshot: { toString: () => "15000" },
    googleEventId: null,
    reason: null,
    patient,
    service: { name: "Control", color: "#3366ff" },
    payments,
    consultation: null,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockResolvedValue({ user: { email: "a@b.c" } });
});

describe("GET /api/appointments", () => {
  it("sin sesión → 401", async () => {
    mocks.auth.mockResolvedValue(null);
    const res = await GET(new Request(URL_OK));
    expect(res.status).toBe(401);
    expect(mocks.findMany).not.toHaveBeenCalled();
  });

  it("rango inválido → 400", async () => {
    const res = await GET(new Request("http://x/api/appointments?start=nada&end=2026-10-12"));
    expect(res.status).toBe(400);
  });

  it("título con nombre, teléfono o Sin nombre; pago total y datos de la paciente", async () => {
    mocks.findMany.mockResolvedValue([
      appt("a", { name: "Brenda Yebara", phone: "5493515552345", whatsappJid: "5493515552345@s.whatsapp.net" }, [{ id: "pay" }]),
      appt("b", { name: null, phone: "5493510017104", whatsappJid: "5493510017104@s.whatsapp.net" }),
      appt("c", { name: null, phone: "900000017102", whatsappJid: "900000017102@lid" }),
    ]);
    const res = await GET(new Request(URL_OK));
    expect(res.status).toBe(200);
    const events = (await res.json()) as Array<{ title: string; extendedProps: Record<string, unknown> }>;
    expect(events.map((e) => e.title)).toEqual([
      "Brenda Yebara · Control",
      "+54 9 351 001-7104 · Control",
      "Sin nombre · Control",
    ]);
    expect(events[0]!.extendedProps).toMatchObject({
      hasFullPayment: true,
      patientJid: "5493515552345@s.whatsapp.net",
      patientLabel: "Brenda Yebara",
      price: "15000",
    });
    expect(events[1]!.extendedProps).toMatchObject({ hasFullPayment: false, patientLabel: "+54 9 351 001-7104" });
    expect(events[2]!.extendedProps).toMatchObject({ patientJid: "900000017102@lid", patientLabel: "Sin nombre" });
    expect(mocks.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        include: expect.objectContaining({
          payments: { where: { kind: "FULL", status: "APPROVED" }, select: { id: true }, take: 1 },
        }),
      }),
    );
  });
});
