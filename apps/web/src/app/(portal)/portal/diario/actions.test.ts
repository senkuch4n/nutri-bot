// HU-017d-2 (SDD 9-2): actions del diario del portal, con la base y la sesión mockeadas.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PORTAL_DIARY_TEXT as T } from "@nutri-bot/core";

const mocks = vi.hoisted(() => ({
  getPortalPatient: vi.fn(),
  findUnique: vi.fn(),
  addDiaryEntry: vi.fn(),
  deleteDiaryEntry: vi.fn(),
  revalidatePath: vi.fn(),
}));
vi.mock("@/lib/patient-session", () => ({ getPortalPatient: mocks.getPortalPatient }));
vi.mock("@nutri-bot/db", () => ({ prisma: { diaryEntry: { findUnique: mocks.findUnique } } }));
vi.mock("@nutri-bot/db/domain", () => ({
  addDiaryEntry: mocks.addDiaryEntry,
  deleteDiaryEntry: mocks.deleteDiaryEntry,
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));

import { addDiaryEntryAction, deleteDiaryEntryAction } from "./actions";

const MB = 1024 * 1024;
const add = (fields: Record<string, string | File>) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return addDiaryEntryAction({ ok: false }, fd);
};
const photo = (type: string, bytes: number) => new File([new Uint8Array(bytes)], "foto", { type });
const errors: string[] = [];

describe("addDiaryEntryAction", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.getPortalPatient.mockResolvedValue({ id: "pat1" });
    mocks.addDiaryEntry.mockResolvedValue({ id: "d1" });
  });

  it("sin paciente → el link venció, sin guardar", async () => {
    mocks.getPortalPatient.mockResolvedValue(null);
    const r = await add({ note: "Milanesa" });
    errors.push(r.error ?? "");
    expect(r).toEqual({ ok: false, error: T.errorNoAccess });
    expect(mocks.addDiaryEntry).not.toHaveBeenCalled();
  });

  it("vacío → pide texto o foto", async () => {
    const r = await add({ note: "   " });
    errors.push(r.error ?? "");
    expect(r).toEqual({ ok: false, error: T.errorEmpty });
    expect(mocks.addDiaryEntry).not.toHaveBeenCalled();
  });

  it("gif → la foto no se puede usar", async () => {
    const r = await add({ note: "x", photo: photo("image/gif", 10) });
    errors.push(r.error ?? "");
    expect(r).toEqual({ ok: false, error: T.errorPhoto });
  });

  it("3 MB + 1 → la foto no se puede usar", async () => {
    const r = await add({ photo: photo("image/jpeg", 3 * MB + 1) });
    expect(r).toEqual({ ok: false, error: T.errorPhoto });
    expect(mocks.addDiaryEntry).not.toHaveBeenCalled();
  });

  it("solo texto → guarda sin foto y revalida el diario y el inicio", async () => {
    const r = await add({ note: "  Almuerzo: milanesa  " });
    expect(r).toEqual({ ok: true });
    expect(mocks.addDiaryEntry).toHaveBeenCalledWith("pat1", {
      note: "Almuerzo: milanesa",
      photoData: null,
      photoMimeType: null,
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/portal/diario");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/portal");
  });

  it("con foto jpeg → guarda los bytes y el tipo", async () => {
    const r = await add({ photo: photo("image/jpeg", 1234) });
    expect(r).toEqual({ ok: true });
    const [, data] = mocks.addDiaryEntry.mock.calls[0]!;
    expect(data.note).toBeNull();
    expect(data.photoMimeType).toBe("image/jpeg");
    expect(Buffer.isBuffer(data.photoData)).toBe(true);
    expect(data.photoData.length).toBe(1234);
  });

  it("si la base falla → no se pudo guardar, sin tirar", async () => {
    mocks.addDiaryEntry.mockRejectedValue(new Error("db caída"));
    const r = await add({ note: "Milanesa" });
    errors.push(r.error ?? "");
    expect(r).toEqual({ ok: false, error: T.errorSave });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });
});

describe("deleteDiaryEntryAction", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.getPortalPatient.mockResolvedValue({ id: "pat1" });
    mocks.deleteDiaryEntry.mockResolvedValue({});
  });

  it("no existe → ok sin borrar (idempotente)", async () => {
    mocks.findUnique.mockResolvedValue(null);
    expect(await deleteDiaryEntryAction("d1")).toEqual({ ok: true });
    expect(mocks.deleteDiaryEntry).not.toHaveBeenCalled();
  });

  it("de otra paciente → no ok y no borra", async () => {
    mocks.findUnique.mockResolvedValue({ patientId: "otra" });
    const r = await deleteDiaryEntryAction("d1");
    errors.push(r.error ?? "");
    expect(r).toEqual({ ok: false, error: T.deleteError });
    expect(mocks.deleteDiaryEntry).not.toHaveBeenCalled();
  });

  it("propio → borra, revalida y ok", async () => {
    mocks.findUnique.mockResolvedValue({ patientId: "pat1" });
    expect(await deleteDiaryEntryAction("d1")).toEqual({ ok: true });
    expect(mocks.findUnique).toHaveBeenCalledWith({ where: { id: "d1" }, select: { patientId: true } });
    expect(mocks.deleteDiaryEntry).toHaveBeenCalledWith("d1");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/portal/diario");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/portal");
  });

  it("si el delete tira → no ok", async () => {
    mocks.findUnique.mockResolvedValue({ patientId: "pat1" });
    mocks.deleteDiaryEntry.mockRejectedValue(new Error("db caída"));
    expect(await deleteDiaryEntryAction("d1")).toEqual({ ok: false, error: T.deleteError });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("si otra pestaña lo borró entre medio (P2025) → ok", async () => {
    mocks.findUnique.mockResolvedValue({ patientId: "pat1" });
    mocks.deleteDiaryEntry.mockRejectedValue(Object.assign(new Error("not found"), { code: "P2025" }));
    expect(await deleteDiaryEntryAction("d1")).toEqual({ ok: true });
  });

  it("sin paciente → no ok, sin consultar", async () => {
    mocks.getPortalPatient.mockResolvedValue(null);
    const r = await deleteDiaryEntryAction("d1");
    errors.push(r.error ?? "");
    expect(r.ok).toBe(false);
    expect(mocks.findUnique).not.toHaveBeenCalled();
  });

  it("id vacío → no ok", async () => {
    expect(await deleteDiaryEntryAction("")).toEqual({ ok: false });
  });
});

describe("lenguaje de los errores", () => {
  it("ninguno dice sesión ni inválido", () => {
    expect(errors.length).toBeGreaterThan(0);
    for (const e of errors) {
      expect(e.toLowerCase()).not.toContain("sesión");
      expect(e.toLowerCase()).not.toContain("inválido");
    }
  });
});
