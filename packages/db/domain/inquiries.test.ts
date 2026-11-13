import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getProfessional: vi.fn(),
  prisma: {
    $transaction: vi.fn(),
    $executeRaw: vi.fn(),
    patientInquiry: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      updateMany: vi.fn(),
      groupBy: vi.fn(),
      count: vi.fn(),
    },
    outboundMessage: { create: vi.fn() },
    professional: { findUnique: vi.fn() },
  },
}));
vi.mock("../index", () => ({ prisma: mocks.prisma }));
vi.mock("./availability", () => ({ getProfessional: mocks.getProfessional }));

import {
  INQUIRY_MESSAGE_MAX,
  countInquiriesByStatus,
  enqueueAfterHoursDigest,
  markInquiryAnswered,
  recordInquiryMessage,
} from "./inquiries";

const TZ = "America/Argentina/Buenos_Aires";
const PRO = {
  id: 1,
  timezone: TZ,
  phoneJid: "5491100000000@s.whatsapp.net",
  afterHoursEnabled: true,
  afterHoursStart: "22:00",
  afterHoursEnd: "09:00",
};
const NIGHT_NOW = new Date("2026-10-03T02:10:00Z"); // 23:10 en BA
const DAY_NOW = new Date("2026-10-03T12:05:00Z"); // 09:05 en BA

function row(id: string, name: string | null, phone: string, receivedAt: Date) {
  return { id, receivedAt, patient: { name, phone } };
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.getProfessional.mockResolvedValue(PRO);
  mocks.prisma.$transaction.mockImplementation((fn: (tx: typeof mocks.prisma) => unknown) => fn(mocks.prisma));
});

describe("enqueueAfterHoursDigest", () => {
  it("dentro de la franja no hace nada", async () => {
    await expect(enqueueAfterHoursDigest({ now: NIGHT_NOW })).resolves.toEqual({ digested: 0, outboundId: null });
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
  });

  it("fuera de la franja con 2 consultas encola UN resumen a phoneJid y las marca", async () => {
    mocks.prisma.patientInquiry.findMany.mockResolvedValue([
      row("i1", "Ana", "5491111111111", new Date("2026-10-03T02:10:00Z")),
      row("i2", "Bruno", "5492222222222", new Date("2026-10-03T04:00:00Z")),
    ]);
    mocks.prisma.outboundMessage.create.mockResolvedValue({ id: "out1" });
    mocks.prisma.patientInquiry.updateMany.mockResolvedValue({ count: 2 });

    await expect(enqueueAfterHoursDigest({ now: DAY_NOW })).resolves.toEqual({ digested: 2, outboundId: "out1" });

    expect(mocks.prisma.outboundMessage.create).toHaveBeenCalledTimes(1);
    const data = mocks.prisma.outboundMessage.create.mock.calls[0]![0].data;
    expect(data.kind).toBe("PROFESSIONAL_ALERT");
    expect(data.toJid).toBe(PRO.phoneJid);
    expect(data.body).toContain("• Ana (23:10)");
    expect(data.body).toContain("• Bruno (01:00)");
    expect(data.body).toContain("2 consultas");
    expect(mocks.prisma.patientInquiry.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ["i1", "i2"] }, digestedAt: null },
      data: { digestedAt: DAY_NOW },
    });
    const where = mocks.prisma.patientInquiry.findMany.mock.calls[0]![0].where;
    expect(where).toMatchObject({ status: "PENDING", receivedAfterHours: true, digestedAt: null, receivedAt: { lte: DAY_NOW } });
    expect(where.patientId).toBeUndefined();
  });

  it("sin consultas no crea ni marca nada", async () => {
    mocks.prisma.patientInquiry.findMany.mockResolvedValue([]);
    await expect(enqueueAfterHoursDigest({ now: DAY_NOW })).resolves.toEqual({ digested: 0, outboundId: null });
    expect(mocks.prisma.outboundMessage.create).not.toHaveBeenCalled();
    expect(mocks.prisma.patientInquiry.updateMany).not.toHaveBeenCalled();
  });

  it("con phoneJid nulo no encola, pero las marca como resumidas", async () => {
    mocks.getProfessional.mockResolvedValue({ ...PRO, phoneJid: null });
    mocks.prisma.patientInquiry.findMany.mockResolvedValue([row("i1", "Ana", "549", NIGHT_NOW)]);
    mocks.prisma.patientInquiry.updateMany.mockResolvedValue({ count: 1 });
    await expect(enqueueAfterHoursDigest({ now: DAY_NOW })).resolves.toEqual({ digested: 1, outboundId: null });
    expect(mocks.prisma.outboundMessage.create).not.toHaveBeenCalled();
    expect(mocks.prisma.patientInquiry.updateMany).toHaveBeenCalledTimes(1);
  });

  it("alertJid reemplaza a phoneJid, y alertJid null no encola", async () => {
    mocks.prisma.patientInquiry.findMany.mockResolvedValue([row("i1", "Ana", "549", NIGHT_NOW)]);
    mocks.prisma.patientInquiry.updateMany.mockResolvedValue({ count: 1 });
    mocks.prisma.outboundMessage.create.mockResolvedValue({ id: "out9" });

    await enqueueAfterHoursDigest({ now: DAY_NOW, alertJid: "5490000000099@s.whatsapp.net" });
    expect(mocks.prisma.outboundMessage.create.mock.calls[0]![0].data.toJid).toBe("5490000000099@s.whatsapp.net");

    mocks.prisma.outboundMessage.create.mockClear();
    await expect(enqueueAfterHoursDigest({ now: DAY_NOW, alertJid: null })).resolves.toEqual({ digested: 1, outboundId: null });
    expect(mocks.prisma.outboundMessage.create).not.toHaveBeenCalled();
  });

  it("scope.patientIds llega al where y config reemplaza la franja", async () => {
    mocks.prisma.patientInquiry.findMany.mockResolvedValue([]);
    // Con config 08:00→10:00, las 09:05 son "de noche" → no consulta nada.
    await enqueueAfterHoursDigest({ now: DAY_NOW, config: { enabled: true, start: "08:00", end: "10:00" } });
    expect(mocks.prisma.patientInquiry.findMany).not.toHaveBeenCalled();

    await enqueueAfterHoursDigest({ now: DAY_NOW, scope: { patientIds: ["p1", "p2"] } });
    expect(mocks.prisma.patientInquiry.findMany.mock.calls[0]![0].where.patientId).toEqual({ in: ["p1", "p2"] });
  });

  it("si updateMany marca menos filas que las leídas, rechaza (la transacción revierte)", async () => {
    mocks.prisma.patientInquiry.findMany.mockResolvedValue([
      row("i1", "Ana", "549", NIGHT_NOW),
      row("i2", "Bruno", "548", NIGHT_NOW),
    ]);
    mocks.prisma.outboundMessage.create.mockResolvedValue({ id: "out1" });
    mocks.prisma.patientInquiry.updateMany.mockResolvedValue({ count: 1 });
    await expect(enqueueAfterHoursDigest({ now: DAY_NOW })).rejects.toThrow();
  });
});

describe("recordInquiryMessage", () => {
  const at = new Date("2026-10-03T02:12:00Z");

  it("con inquiryId de la sesión y UPDATE = 1 la agrega, sin crear", async () => {
    mocks.prisma.$executeRaw.mockResolvedValue(1);
    mocks.prisma.patientInquiry.findUnique.mockResolvedValue({ id: "i1", body: "a\nb" });
    const r = await recordInquiryMessage({ patientId: "p1", text: " b ", at, afterHours: true, inquiryId: "i1" });
    expect(r).toEqual({ inquiry: { id: "i1", body: "a\nb" }, created: false });
    expect(mocks.prisma.patientInquiry.create).not.toHaveBeenCalled();
    // El texto viaja como parámetro, con el salto de línea adelante y ya recortado.
    const values = mocks.prisma.$executeRaw.mock.calls[0]!.slice(1);
    expect(values).toContain("\nb");
    expect(values).toContain("i1");
    expect(values).toContain("p1");
  });

  it("sin inquiryId, de noche, agrega a la consulta nocturna sin resumir", async () => {
    mocks.prisma.patientInquiry.findFirst.mockResolvedValue({ id: "tonight" });
    mocks.prisma.$executeRaw.mockResolvedValue(1);
    mocks.prisma.patientInquiry.findUnique.mockResolvedValue({ id: "tonight" });
    const r = await recordInquiryMessage({ patientId: "p1", text: "otra", at, afterHours: true });
    expect(r.created).toBe(false);
    expect(r.inquiry.id).toBe("tonight");
    expect(mocks.prisma.patientInquiry.findFirst.mock.calls[0]![0].where).toEqual({
      patientId: "p1",
      status: "PENDING",
      receivedAfterHours: true,
      digestedAt: null,
    });
    expect(mocks.prisma.patientInquiry.create).not.toHaveBeenCalled();
  });

  it("de día crea una nueva con receivedAfterHours false y las dos fechas = at", async () => {
    mocks.prisma.patientInquiry.create.mockResolvedValue({ id: "new" });
    const r = await recordInquiryMessage({ patientId: "p1", text: "hola", at, afterHours: false });
    expect(r).toEqual({ inquiry: { id: "new" }, created: true });
    expect(mocks.prisma.patientInquiry.findFirst).not.toHaveBeenCalled();
    expect(mocks.prisma.patientInquiry.create).toHaveBeenCalledWith({
      data: { patientId: "p1", body: "hola", receivedAt: at, lastMessageAt: at, receivedAfterHours: false },
    });
  });

  it("si la de la sesión ya se respondió (UPDATE = 0) crea una nueva", async () => {
    mocks.prisma.$executeRaw.mockResolvedValue(0);
    mocks.prisma.patientInquiry.create.mockResolvedValue({ id: "new" });
    const r = await recordInquiryMessage({ patientId: "p1", text: "hola", at, afterHours: false, inquiryId: "old" });
    expect(r.created).toBe(true);
    expect(mocks.prisma.patientInquiry.create).toHaveBeenCalledTimes(1);
  });

  it("recorta a INQUIRY_MESSAGE_MAX", async () => {
    mocks.prisma.patientInquiry.create.mockResolvedValue({ id: "new" });
    await recordInquiryMessage({ patientId: "p1", text: "x".repeat(5000), at, afterHours: false });
    expect(INQUIRY_MESSAGE_MAX).toBe(4000);
    expect(mocks.prisma.patientInquiry.create.mock.calls[0]![0].data.body).toHaveLength(4000);
  });

  it("texto vacío lanza", async () => {
    await expect(recordInquiryMessage({ patientId: "p1", text: "   ", at, afterHours: false })).rejects.toThrow();
  });
});

describe("markInquiryAnswered", () => {
  it("count 1 → answered", async () => {
    mocks.prisma.patientInquiry.updateMany.mockResolvedValue({ count: 1 });
    const at = new Date();
    await expect(markInquiryAnswered("i1", at)).resolves.toBe("answered");
    expect(mocks.prisma.patientInquiry.updateMany).toHaveBeenCalledWith({
      where: { id: "i1", status: "PENDING" },
      data: { status: "ANSWERED", answeredAt: at },
    });
  });
  it("count 0 con fila → already_answered", async () => {
    mocks.prisma.patientInquiry.updateMany.mockResolvedValue({ count: 0 });
    mocks.prisma.patientInquiry.findUnique.mockResolvedValue({ id: "i1" });
    await expect(markInquiryAnswered("i1")).resolves.toBe("already_answered");
  });
  it("count 0 sin fila → not_found", async () => {
    mocks.prisma.patientInquiry.updateMany.mockResolvedValue({ count: 0 });
    mocks.prisma.patientInquiry.findUnique.mockResolvedValue(null);
    await expect(markInquiryAnswered("i1")).resolves.toBe("not_found");
  });
});

describe("countInquiriesByStatus", () => {
  it("completa con 0 los estados sin filas", async () => {
    mocks.prisma.patientInquiry.groupBy.mockResolvedValue([{ status: "PENDING", _count: { _all: 3 } }]);
    await expect(countInquiriesByStatus()).resolves.toEqual({ PENDING: 3, ANSWERED: 0 });
  });
});
