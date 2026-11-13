// HU-017b-3 (SDD 8-3 B, 9-3): el comunicado solo le llega a personas (D13). Todo mockeado: no hay base.
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  revalidatePath: vi.fn(),
  findMany: vi.fn(),
  createMany: vi.fn(),
  updateMany: vi.fn(),
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@nutri-bot/db", () => ({
  prisma: {
    patient: { findMany: mocks.findMany },
    outboundMessage: { createMany: mocks.createMany, updateMany: mocks.updateMany },
  },
}));

import { broadcastMessageAction, retryMessageAction } from "./actions";

function form(body: string): FormData {
  const fd = new FormData();
  fd.set("body", body);
  return fd;
}

const PEOPLE = [
  { whatsappJid: "5493510000001@s.whatsapp.net", archivedAt: null },
  { whatsappJid: "120363000000000001@newsletter", archivedAt: null },
  { whatsappJid: "123456789@lid", archivedAt: null },
  { whatsappJid: "1203630000-1600000000@g.us", archivedAt: null },
  { whatsappJid: "status@broadcast", archivedAt: null },
  { whatsappJid: "5493510000002@s.whatsapp.net", archivedAt: null },
];

beforeEach(() => {
  vi.clearAllMocks();
  mocks.createMany.mockResolvedValue({ count: 0 });
});

describe("broadcastMessageAction", () => {
  it("encola solo para personas (sin canales, grupos ni difusiones) y sent = cantidad filtrada", async () => {
    mocks.findMany.mockResolvedValue(PEOPLE);
    const res = await broadcastMessageAction({ ok: false }, form("  Vacaciones del 10 al 20  "));
    expect(res).toEqual({ ok: true, sent: 3 });
    expect(mocks.createMany).toHaveBeenCalledTimes(1);
    const data = mocks.createMany.mock.calls[0]![0].data as Array<{ toJid: string; body: string; kind: string }>;
    expect(data.map((d) => d.toJid)).toEqual([
      "5493510000001@s.whatsapp.net",
      "123456789@lid",
      "5493510000002@s.whatsapp.net",
    ]);
    expect(data.every((d) => d.kind === "AD_HOC" && d.body === "Vacaciones del 10 al 20")).toBe(true);
    expect(data.some((d) => /@(newsletter|g\.us|broadcast)$/.test(d.toJid))).toBe(false);
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/avisos");
  });

  it("HU-019 (D5): pide solo activas y descarta archivadas → 10 activas + 2 archivadas = 10", async () => {
    const ARCH = new Date("2026-10-24T15:00:00Z");
    const actives = Array.from({ length: 10 }, (_, i) => ({
      whatsappJid: `54935100001${String(i).padStart(2, "0")}@s.whatsapp.net`,
      archivedAt: null,
    }));
    mocks.findMany.mockResolvedValue([
      ...actives,
      { whatsappJid: "5493519999901@s.whatsapp.net", archivedAt: ARCH },
      { whatsappJid: "5493519999902@s.whatsapp.net", archivedAt: ARCH },
    ]);
    const res = await broadcastMessageAction({ ok: false }, form("Vacaciones del 10 al 20"));
    expect(mocks.findMany).toHaveBeenCalledWith({
      where: { archivedAt: null },
      select: { whatsappJid: true, archivedAt: true },
    });
    expect(res).toEqual({ ok: true, sent: 10 });
    const data = mocks.createMany.mock.calls[0]![0].data as Array<{ toJid: string }>;
    expect(data.map((d) => d.toJid)).toEqual(actives.map((a) => a.whatsappJid));
  });

  it("deduplica el mismo JID", async () => {
    mocks.findMany.mockResolvedValue([PEOPLE[0], PEOPLE[0]]);
    const res = await broadcastMessageAction({ ok: false }, form("Hola a todas"));
    expect(res).toEqual({ ok: true, sent: 1 });
  });

  it("sin destinatarios persona → error y no encola nada", async () => {
    mocks.findMany.mockResolvedValue([
      { whatsappJid: "1@newsletter", archivedAt: null },
      { whatsappJid: "2@g.us", archivedAt: null },
    ]);
    const res = await broadcastMessageAction({ ok: false }, form("Hola a todas"));
    expect(res.ok).toBe(false);
    expect(res.error).toBe("Todavía no hay pacientes con WhatsApp para mandarles el aviso.");
    expect(mocks.createMany).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("sin pacientes → error y no encola nada", async () => {
    mocks.findMany.mockResolvedValue([]);
    const res = await broadcastMessageAction({ ok: false }, form("Hola a todas"));
    expect(res.ok).toBe(false);
    expect(mocks.createMany).not.toHaveBeenCalled();
  });

  it("texto muy corto → error de validación sin leer pacientes", async () => {
    const res = await broadcastMessageAction({ ok: false }, form("ok"));
    expect(res).toEqual({ ok: false, error: "Escribí un mensaje" });
    expect(mocks.findMany).not.toHaveBeenCalled();
    expect(mocks.createMany).not.toHaveBeenCalled();
  });

  it("si la base falla al encolar → mensaje claro", async () => {
    mocks.findMany.mockResolvedValue(PEOPLE);
    mocks.createMany.mockRejectedValue(new Error("db"));
    const res = await broadcastMessageAction({ ok: false }, form("Hola a todas"));
    expect(res).toEqual({ ok: false, error: "No se pudo mandar el comunicado. Probá de nuevo." });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });
});

describe("retryMessageAction", () => {
  it("solo vuelve a PENDING una fila que sigue FAILED, por id", async () => {
    mocks.updateMany.mockResolvedValue({ count: 1 });
    await retryMessageAction("m1");
    expect(mocks.updateMany).toHaveBeenCalledWith({
      where: { id: "m1", status: "FAILED" },
      data: { status: "PENDING", lastError: null },
    });
  });
});
