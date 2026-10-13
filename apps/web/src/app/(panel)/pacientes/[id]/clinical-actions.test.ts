// HU-017c-3: borrar una medición desde Historial devuelve el resultado (borrado diferido) y verifica
// que la medición sea del paciente de la URL.
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  revalidatePath: vi.fn(),
  findUnique: vi.fn(),
  deleteEvolutionEntry: vi.fn(),
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@nutri-bot/db", () => ({ prisma: { evolutionEntry: { findUnique: mocks.findUnique } } }));
vi.mock("@nutri-bot/db/domain", () => ({
  FutureConsultationDateError: class extends Error {},
  addEvolutionEntryOnDay: vi.fn(),
  deleteEvolutionEntry: mocks.deleteEvolutionEntry,
}));
vi.mock("@/lib/professional", () => ({ getProfessional: vi.fn() }));

import { deleteEvolutionEntryByIdAction } from "./clinical-actions";

const FAILED = { ok: false, error: "No se pudo borrar la medición." };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.deleteEvolutionEntry.mockResolvedValue(undefined);
});

describe("deleteEvolutionEntryByIdAction", () => {
  it("borra la medición del paciente y revalida la ficha y su consulta", async () => {
    mocks.findUnique.mockResolvedValue({ patientId: "p1", consultationId: "c1" });
    await expect(deleteEvolutionEntryByIdAction("p1", "e1")).resolves.toEqual({ ok: true });
    expect(mocks.deleteEvolutionEntry).toHaveBeenCalledWith("e1");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/pacientes/p1");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/pacientes/p1/consultas/c1");
  });

  it("una medición de otro paciente → error, sin borrar", async () => {
    mocks.findUnique.mockResolvedValue({ patientId: "p2", consultationId: "c9" });
    await expect(deleteEvolutionEntryByIdAction("p1", "e1")).resolves.toEqual(FAILED);
    expect(mocks.deleteEvolutionEntry).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("medición inexistente o ids vacíos → error, sin borrar", async () => {
    mocks.findUnique.mockResolvedValue(null);
    await expect(deleteEvolutionEntryByIdAction("p1", "e1")).resolves.toEqual(FAILED);
    await expect(deleteEvolutionEntryByIdAction("", "e1")).resolves.toEqual(FAILED);
    expect(mocks.deleteEvolutionEntry).not.toHaveBeenCalled();
  });

  it("si el borrado tira → error", async () => {
    mocks.findUnique.mockResolvedValue({ patientId: "p1", consultationId: null });
    mocks.deleteEvolutionEntry.mockRejectedValue(new Error("db"));
    await expect(deleteEvolutionEntryByIdAction("p1", "e1")).resolves.toEqual(FAILED);
  });
});
