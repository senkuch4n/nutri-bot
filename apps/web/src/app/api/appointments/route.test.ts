import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";

const { getTenantContext, findMany } = vi.hoisted(() => ({
  getTenantContext: vi.fn(),
  findMany: vi.fn(),
}));
vi.mock("@/lib/tenant-context", () => ({ getTenantContext }));
vi.mock("@nutri-bot/db", () => ({ prisma: { appointment: { findMany } } }));

const scope = { tenantId: "legacy-tenant", agendaId: "legacy-agenda" };
const ctxA = { userId: "u-a", ...scope, professionalId: 1, access: { kind: "member", tenantId: "legacy-tenant", role: "OWNER" } };
const start = "2026-11-20T00:00:00Z";
const end = "2026-11-21T00:00:00Z";
const range = `start=${start}&end=${end}`;
const request = (query: string) => new Request(`http://localhost/api/appointments?${query}`);

function appt(id: string, patient: { name: string | null; phone: string; whatsappJid: string }, payments: { id: string }[] = []) {
  return {
    id,
    patientId: `p-${id}`,
    startsAt: new Date("2026-11-20T13:00:00Z"),
    endsAt: new Date("2026-11-20T13:45:00Z"),
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
  vi.resetAllMocks();
  getTenantContext.mockResolvedValue(ctxA);
  findMany.mockResolvedValue([]);
});

describe("GET /api/appointments", () => {
  it("reads only the session tenant and its primary agenda, preserving range, status, and order", async () => {
    const response = await GET(request(range));
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.json()).toEqual([]);
    expect(getTenantContext).toHaveBeenCalledTimes(1);
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        ...scope,
        startsAt: { gte: new Date(start), lt: new Date(end) },
        status: { in: ["CONFIRMED", "COMPLETED", "NO_SHOW"] },
      },
      orderBy: { startsAt: "asc" },
    }));
  });

  it("HU-025: otro consultorio en el contexto → solo su agenda; tenantId/agendaId de la query se ignoran", async () => {
    getTenantContext.mockResolvedValue({ ...ctxA, tenantId: "tenant-b", agendaId: "agenda-b" });
    const response = await GET(request(`${range}&tenantId=legacy-tenant&agendaId=legacy-agenda`));
    expect(response.status).toBe(200);
    expect(findMany.mock.calls[0]![0].where).toMatchObject({ tenantId: "tenant-b", agendaId: "agenda-b" });
  });

  it("HU-025: sin contexto de consultorio → 401 sin consultar turnos", async () => {
    getTenantContext.mockResolvedValue(null);
    const response = await GET(request(range));
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "unauthorized" });
    expect(findMany).not.toHaveBeenCalled();
  });

  // HU-017b-1: preservar los datos que necesita el panel del turno.
  it("el color del servicio viaja como dato (la pastilla se pinta por estado, no por servicio)", async () => {
    const noShow = { ...appt("n", { name: "Eva", phone: "2", whatsappJid: "2@s" }), status: "NO_SHOW" };
    findMany.mockResolvedValue([appt("a", { name: "Brenda", phone: "3", whatsappJid: "3@s" }), noShow]);
    const events = (await (await GET(request(range))).json()) as Array<Record<string, unknown>>;
    for (const e of events) {
      expect(e).not.toHaveProperty("backgroundColor");
      expect(e).not.toHaveProperty("textColor");
      expect(e.extendedProps).toMatchObject({ serviceColor: "#3366ff" });
    }
  });

  it("título con nombre, teléfono o Sin nombre; pago total y datos de la paciente", async () => {
    findMany.mockResolvedValue([
      appt("a", { name: "Brenda Yebara", phone: "5493515552345", whatsappJid: "5493515552345@s.whatsapp.net" }, [{ id: "pay" }]),
      appt("b", { name: null, phone: "5493510017104", whatsappJid: "5493510017104@s.whatsapp.net" }),
      appt("c", { name: null, phone: "900000017102", whatsappJid: "900000017102@lid" }),
    ]);
    const res = await GET(request(range));
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
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      include: expect.objectContaining({
        payments: { where: { kind: "FULL", status: "APPROVED" }, select: { id: true }, take: 1 },
      }),
    }));
  });

  it("still accepts from/to aliases", async () => {
    const response = await GET(request(`from=${start}&to=${end}`));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([]);
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ startsAt: { gte: new Date(start), lt: new Date(end) } }),
    }));
  });

  it("preserves unauthenticated and invalid-range responses without querying appointments", async () => {
    getTenantContext.mockResolvedValueOnce(null);
    const unauthorized = await GET(request(range));
    expect(unauthorized.status).toBe(401);
    expect(await unauthorized.json()).toEqual({ error: "unauthorized" });
    const invalid = await GET(request("start=invalid"));
    expect(invalid.status).toBe(400);
    expect(await invalid.json()).toEqual({ error: "rango inválido" });
    expect(findMany).not.toHaveBeenCalled();
  });
});
