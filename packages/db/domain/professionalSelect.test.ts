// HU-016 (D10): getProfessional() no trae los bytes de la firma ni del logo.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";

const mocks = vi.hoisted(() => ({
  prisma: { professional: { findUnique: vi.fn() } },
}));
vi.mock("../index", () => ({ prisma: mocks.prisma }));

import { PROFESSIONAL_SELECT } from "./professionalSelect";
import { getProfessional } from "./availability";

describe("PROFESSIONAL_SELECT", () => {
  it("no pide los bytes de la firma ni del logo", () => {
    expect(PROFESSIONAL_SELECT).not.toHaveProperty("signatureData");
    expect(PROFESSIONAL_SELECT).not.toHaveProperty("logoData");
  });

  it("cubre todas las demás columnas escalares de Professional", () => {
    const model = Prisma.dmmf.datamodel.models.find((m) => m.name === "Professional");
    expect(model).toBeDefined();
    const scalars = model!.fields
      .filter((f) => f.kind === "scalar")
      .map((f) => f.name)
      .filter((n) => n !== "signatureData" && n !== "logoData")
      .sort();
    expect(Object.keys(PROFESSIONAL_SELECT).sort()).toEqual(scalars);
    expect(Object.values(PROFESSIONAL_SELECT).every((v) => v === true)).toBe(true);
  });
});

describe("getProfessional", () => {
  beforeEach(() => vi.resetAllMocks());

  it("consulta con el select explícito", async () => {
    mocks.prisma.professional.findUnique.mockResolvedValue({ id: 1, name: "Daiana Ponce" });
    await expect(getProfessional()).resolves.toEqual({ id: 1, name: "Daiana Ponce" });
    expect(mocks.prisma.professional.findUnique).toHaveBeenCalledWith({ where: { id: 1 }, select: PROFESSIONAL_SELECT });
  });

  it("sin fila sigue tirando el error de siempre", async () => {
    mocks.prisma.professional.findUnique.mockResolvedValue(null);
    await expect(getProfessional()).rejects.toThrow("Falta la ficha de la profesional");
  });
});
