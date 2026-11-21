import { type IsakMeasures } from "@nutri-bot/core";
import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  agenda: { findUnique: vi.fn() },
  professional: { findUnique: vi.fn() },
  consultation: { findUniqueOrThrow: vi.fn() },
  evolutionEntry: { create: vi.fn() },
}));
vi.mock("../index", () => ({ prisma: db, Prisma: { PrismaClientKnownRequestError: class extends Error {
  readonly code: string;
  constructor(message: string, { code }: { code: string }) { super(message); this.code = code; }
} } }));

import { createIsakStudy, IsakStudyExistsError } from "./isak";

const tenantId = "legacy-tenant";
const professional = { timezone: "America/Argentina/Buenos_Aires" };
const consultation = { id: "c1", patientId: "p1", consultedAt: new Date("2020-09-13T01:00:00Z") };
const create = () => createIsakStudy({ consultationId: consultation.id, measures: { weightKg: 70 } as IsakMeasures });

beforeEach(() => {
  vi.resetAllMocks();
  db.agenda.findUnique.mockResolvedValue({ professional });
  db.professional.findUnique.mockResolvedValue(professional);
  db.consultation.findUniqueOrThrow.mockResolvedValue(consultation);
});

describe("creating an ISAK study", () => {
  it("fails closed without the verified agenda", async () => {
    db.agenda.findUnique.mockResolvedValue(null);
    await expect(create()).rejects.toThrow("No se pudo verificar la agenda de la instalación original.");
    expect(db.consultation.findUniqueOrThrow).not.toHaveBeenCalled();
    expect(db.evolutionEntry.create).not.toHaveBeenCalled();
  });

  it.each(["other-tenant", null])("rejects a consultation owned by %s without creating a study", async (owner) => {
    db.consultation.findUniqueOrThrow.mockImplementation(async ({ where }) => {
      if (where.id_tenantId && where.id_tenantId.tenantId !== owner) throw new Error("Record not found");
      return { ...consultation, tenantId: owner };
    });
    await expect(create()).rejects.toThrow("Record not found");
    expect(db.evolutionEntry.create).not.toHaveBeenCalled();
  });

  it("creates the owned study and connects the same-patient, same-tenant consultation at the original local noon", async () => {
    const entry = { id: "e1", patientId: "p1", tenantId, consultationId: "c1" };
    db.evolutionEntry.create.mockResolvedValue(entry);
    await expect(create()).resolves.toEqual(entry);
    expect(db.consultation.findUniqueOrThrow).toHaveBeenCalledWith(expect.objectContaining({
      where: { id_tenantId: { id: "c1", tenantId } },
    }));
    expect(db.evolutionEntry.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      patient: { connect: { id: "p1" } },
      tenantPatient: { connect: { id_tenantId: { id: "p1", tenantId } } },
      consultation: { connect: { id_tenantId: { id: "c1", tenantId }, patientId: "p1" } },
      recordedAt: new Date("2020-09-12T15:00:00Z"), study: "ISAK", note: null, weightKg: 70, heightCm: null,
    }) });
  });

  it("preserves the duplicate-study error", async () => {
    const { Prisma } = await import("../index");
    db.evolutionEntry.create.mockRejectedValue(new Prisma.PrismaClientKnownRequestError("duplicate", {
      code: "P2002", clientVersion: "test",
    }));
    await expect(create()).rejects.toThrow(IsakStudyExistsError);
  });
});
