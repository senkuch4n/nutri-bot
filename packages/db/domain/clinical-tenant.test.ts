// HU-025b-1: diario, informe antropométrico e ISAK filtran por el consultorio de `t` (Prisma mockeado).
import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  diaryEntry: { findMany: vi.fn(), create: vi.fn(), delete: vi.fn() },
  anthropometricReport: { findUnique: vi.fn(), upsert: vi.fn(), update: vi.fn() },
  evolutionEntry: { findFirst: vi.fn(), updateMany: vi.fn(), deleteMany: vi.fn() },
  outboundMessage: { create: vi.fn() },
}));
vi.mock("../index", () => ({ prisma: db, Prisma: { PrismaClientKnownRequestError: class extends Error {} } }));

import { addDiaryEntry, deleteDiaryEntry, listDiaryEntries } from "./diary";
import {
  enqueueAnthropometricReportMessage,
  getAnthropometricReportMeta,
  getAnthropometricReportPdf,
  saveAnthropometricReportPdf,
  saveAnthropometricReportTexts,
} from "./anthropometricReports";
import { deleteIsakStudy, getIsakStudy, getPreviousIsakStudy, updateIsakStudy } from "./isak";

const A = { tenantId: "tenant-a" };
const TEXTS = { girths: "", distribution: "", adiposeMuscle: "", muscleBone: "", waistHip: "", somatotype: "", conclusions: "ok" };

beforeEach(() => vi.resetAllMocks());

describe("diario", () => {
  it("lista solo entradas de pacientes del consultorio", async () => {
    db.diaryEntry.findMany.mockResolvedValue([]);
    await listDiaryEntries(A, "p1");
    expect(db.diaryEntry.findMany.mock.calls[0]![0].where).toEqual({ patientId: "p1", patient: { tenantId: "tenant-a" } });
  });

  it("alta: conecta al paciente por (id, tenantId); un paciente de B no se encuentra", async () => {
    db.diaryEntry.create.mockResolvedValue({ id: "d1" });
    await addDiaryEntry(A, "p1", { note: "hola" });
    const { data } = db.diaryEntry.create.mock.calls[0]![0];
    expect(data.patient).toEqual({ connect: { id_tenantId: { id: "p1", tenantId: "tenant-a" } } });
    expect(data).not.toHaveProperty("patientId");
  });

  it("borrado: filtra por el consultorio del paciente", async () => {
    db.diaryEntry.delete.mockResolvedValue({});
    await deleteDiaryEntry(A, "d1");
    expect(db.diaryEntry.delete.mock.calls[0]![0].where).toEqual({ id: "d1", patient: { tenantId: "tenant-a" } });
  });
});

describe("informe antropométrico", () => {
  const owned = { tenantId: "tenant-a", isakEntry: { tenantId: "tenant-a", study: "ISAK", patient: { tenantId: "tenant-a" } } };

  it("lectura de meta y PDF con el filtro de consultorio; de B → null", async () => {
    db.anthropometricReport.findUnique.mockResolvedValue(null);
    await expect(getAnthropometricReportMeta(A, "e-b")).resolves.toBeNull();
    await expect(getAnthropometricReportPdf(A, "e-b")).resolves.toBeNull();
    for (const [args] of db.anthropometricReport.findUnique.mock.calls) {
      expect(args.where).toEqual({ isakEntryId: "e-b", ...owned });
    }
  });

  it("guardar textos de un estudio de otro consultorio → error sin escribir", async () => {
    db.evolutionEntry.findFirst.mockResolvedValue(null);
    await expect(saveAnthropometricReportTexts(A, { isakEntryId: "e-b", texts: TEXTS })).rejects.toThrow();
    expect(db.evolutionEntry.findFirst.mock.calls[0]![0].where).toEqual({
      id: "e-b", tenantId: "tenant-a", study: "ISAK", patient: { tenantId: "tenant-a" },
    });
    expect(db.anthropometricReport.upsert).not.toHaveBeenCalled();
  });

  it("guardar textos propio: crea con el tenant del contexto", async () => {
    db.evolutionEntry.findFirst.mockResolvedValue({ id: "e1" });
    db.anthropometricReport.upsert.mockResolvedValue({
      id: "r1", isakEntryId: "e1", girthsText: "", distributionText: "", adiposeMuscleText: "", muscleBoneText: "",
      waistHipText: "", somatotypeText: "", conclusionsText: "ok", pdfFileName: null, pdfGeneratedAt: null, pdfSourceKey: null,
    });
    await saveAnthropometricReportTexts(A, { isakEntryId: "e1", texts: TEXTS });
    const args = db.anthropometricReport.upsert.mock.calls[0]![0];
    expect(args.where).toEqual({ isakEntryId: "e1", ...owned });
    expect(args.create).toMatchObject({ isakEntryId: "e1", tenantId: "tenant-a" });
  });

  it("guardar PDF filtra por consultorio", async () => {
    db.anthropometricReport.update.mockResolvedValue({ id: "r1" });
    await saveAnthropometricReportPdf(A, { isakEntryId: "e1", data: Buffer.from("x"), fileName: "f.pdf", sourceKey: "k" });
    expect(db.anthropometricReport.update.mock.calls[0]![0].where).toEqual({ isakEntryId: "e1", ...owned });
  });

  it("encolar el envío escribe el tenant (la FK compuesta rechaza un informe ajeno)", async () => {
    db.outboundMessage.create.mockResolvedValue({ id: "m1" });
    await enqueueAnthropometricReportMessage(A, { reportId: "r1", toJid: "j", caption: "c" });
    expect(db.outboundMessage.create.mock.calls[0]![0].data).toMatchObject({ tenantId: "tenant-a", anthropometricReportId: "r1" });
  });
});

describe("ISAK", () => {
  it("lectura, edición, borrado y anterior filtran por consultorio", async () => {
    db.evolutionEntry.findFirst.mockResolvedValue(null);
    db.evolutionEntry.updateMany.mockResolvedValue({ count: 0 });
    db.evolutionEntry.deleteMany.mockResolvedValue({ count: 0 });
    await expect(getIsakStudy(A, "c-b")).resolves.toBeNull();
    await expect(getPreviousIsakStudy(A, { patientId: "p", before: new Date() })).resolves.toBeNull();
    await expect(updateIsakStudy(A, { consultationId: "c-b", entryId: "e-b", measures: {} as never })).rejects.toThrow();
    await expect(deleteIsakStudy(A, { consultationId: "c-b", entryId: "e-b" })).rejects.toThrow();
    const wheres = [
      db.evolutionEntry.findFirst.mock.calls[0]![0].where,
      db.evolutionEntry.findFirst.mock.calls[1]![0].where,
      db.evolutionEntry.updateMany.mock.calls[0]![0].where,
      db.evolutionEntry.deleteMany.mock.calls[0]![0].where,
    ];
    for (const where of wheres) expect(where).toMatchObject({ study: "ISAK", tenantId: "tenant-a", patient: { tenantId: "tenant-a" } });
  });
});
