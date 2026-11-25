// HU-014: enqueueMessage con dedupeKey y resultado booleano (prisma mockeado).
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  class PrismaClientKnownRequestError extends Error {
    code: string;
    constructor(message: string, opts: { code: string }) {
      super(message);
      this.code = opts.code;
    }
  }
  return {
    PrismaClientKnownRequestError,
    prisma: { outboundMessage: { create: vi.fn() } },
  };
});

vi.mock("../index", () => ({
  prisma: mocks.prisma,
  Prisma: { PrismaClientKnownRequestError: mocks.PrismaClientKnownRequestError },
}));

import { enqueueMessage } from "./outbox";

const T = { tenantId: "legacy-tenant" };
const base = { toJid: "5490000000099@s.whatsapp.net", body: "hola", kind: "REMINDER" as const, appointmentId: "a1" };

describe("enqueueMessage (HU-014)", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.prisma.outboundMessage.create.mockResolvedValue({ id: "m1" });
  });

  it("sin dedupeKey crea con '' y devuelve true", async () => {
    await expect(enqueueMessage(T, base)).resolves.toBe(true);
    expect(mocks.prisma.outboundMessage.create).toHaveBeenCalledWith({
      data: { tenantId: "legacy-tenant", toJid: base.toJid, body: "hola", kind: "REMINDER", appointmentId: "a1", dedupeKey: "" },
    });
  });

  it("con dedupeKey lo guarda", async () => {
    await expect(enqueueMessage(T, { ...base, dedupeKey: "auto:24h" })).resolves.toBe(true);
    expect(mocks.prisma.outboundMessage.create.mock.calls[0]![0].data.dedupeKey).toBe("auto:24h");
  });

  it("sin appointmentId guarda null", async () => {
    await enqueueMessage(T, { toJid: base.toJid, body: "x", kind: "PROFESSIONAL_ALERT" });
    expect(mocks.prisma.outboundMessage.create.mock.calls[0]![0].data.appointmentId).toBeNull();
  });

  it("guarda el consultorio de una alerta profesional sin vincularla ni deduplicarla por turno", async () => {
    const alert = { toJid: base.toJid, body: "x", kind: "PROFESSIONAL_ALERT" as const };
    await expect(enqueueMessage(T, alert)).resolves.toBe(true);
    await expect(enqueueMessage(T, alert)).resolves.toBe(true);
    expect(mocks.prisma.outboundMessage.create).toHaveBeenCalledTimes(2);
    expect(mocks.prisma.outboundMessage.create).toHaveBeenLastCalledWith({
      data: { tenantId: "legacy-tenant", toJid: alert.toJid, body: "x", kind: "PROFESSIONAL_ALERT", appointmentId: null, dedupeKey: "" },
    });
  });

  it("P2002 → false, no tira", async () => {
    mocks.prisma.outboundMessage.create.mockRejectedValue(
      new mocks.PrismaClientKnownRequestError("dup", { code: "P2002" }),
    );
    await expect(enqueueMessage(T, base)).resolves.toBe(false);
  });

  it.each([[1, true], [0, false]] as const)("transactional insert with count %s returns %s", async (count, created) => {
    const createMany = vi.fn().mockResolvedValue({ count });
    const tx = { outboundMessage: { createMany } } as unknown as NonNullable<Parameters<typeof enqueueMessage>[2]>;
    await expect(enqueueMessage(T, base, tx)).resolves.toBe(created);
    expect(createMany).toHaveBeenCalledTimes(1);
    expect(createMany).toHaveBeenCalledWith({
      data: [{ tenantId: "legacy-tenant", ...base, dedupeKey: "" }], skipDuplicates: true,
    });
    expect(mocks.prisma.outboundMessage.create).not.toHaveBeenCalled();
  });

  it("otro error → tira", async () => {
    mocks.prisma.outboundMessage.create.mockRejectedValue(new Error("db caída"));
    await expect(enqueueMessage(T, base)).rejects.toThrow("db caída");
    mocks.prisma.outboundMessage.create.mockRejectedValue(
      new mocks.PrismaClientKnownRequestError("fk", { code: "P2003" }),
    );
    await expect(enqueueMessage(T, base)).rejects.toThrow("fk");
  });

  it("HU-025: el tenant es siempre el recibido; sin tenant no encola", async () => {
    await enqueueMessage({ tenantId: "tenant-b" }, base);
    expect(mocks.prisma.outboundMessage.create.mock.calls[0]![0].data.tenantId).toBe("tenant-b");
    await expect(enqueueMessage({ tenantId: "" }, base)).rejects.toThrow("falta el consultorio");
    expect(mocks.prisma.outboundMessage.create).toHaveBeenCalledTimes(1);
  });
});
