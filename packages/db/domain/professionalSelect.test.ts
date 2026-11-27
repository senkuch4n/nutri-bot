// HU-016 (D10): la profesional que leen web, bot e IA (getTenantProfessional) no trae los bytes de la firma ni del logo.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";

const mocks = vi.hoisted(() => ({
  prisma: { agenda: { findFirst: vi.fn() } },
}));
vi.mock("../index", () => ({ prisma: mocks.prisma }));

import { PROFESSIONAL_SELECT } from "./professionalSelect";
import * as availability from "./availability";
import { getTenantProfessional } from "./tenantScope";

describe("PROFESSIONAL_SELECT", () => {
  it("no pide los bytes de imágenes ni metadata de ownership", () => {
    expect(PROFESSIONAL_SELECT).not.toHaveProperty("signatureData");
    expect(PROFESSIONAL_SELECT).not.toHaveProperty("logoData");
    expect(PROFESSIONAL_SELECT).not.toHaveProperty("tenantId");
  });

  it("HU-028b (D15): no trae ninguna columna de Google", () => {
    expect(Object.keys(PROFESSIONAL_SELECT).filter((k) => k.toLowerCase().startsWith("google"))).toEqual([]);
  });

  it("cubre todas las demás columnas escalares de Professional", () => {
    const model = Prisma.dmmf.datamodel.models.find((m) => m.name === "Professional");
    expect(model).toBeDefined();
    const scalars = model!.fields
      .filter((f) => f.kind === "scalar")
      .map((f) => f.name)
      .filter((n) => n !== "signatureData" && n !== "logoData" && n !== "tenantId")
      // HU-028b, se borran en 028b-2: la conexión de Google vive en GoogleCalendarAccount.
      .filter((n) => n !== "googleRefreshToken" && n !== "googleCalendarId" && n !== "googleSyncError")
      .sort();
    expect(Object.keys(PROFESSIONAL_SELECT).sort()).toEqual(scalars);
    expect(Object.values(PROFESSIONAL_SELECT).every((v) => v === true)).toBe(true);
  });
});

describe("getTenantProfessional", () => {
  beforeEach(() => vi.resetAllMocks());

  it("lee la profesional de la agenda principal del consultorio con el select explícito", async () => {
    mocks.prisma.agenda.findFirst.mockResolvedValue({
      id: "agenda-a", tenantId: "tenant-a", professionalId: 7, professional: { id: 7, name: "Prof A" },
    });
    await expect(getTenantProfessional("tenant-a")).resolves.toEqual({ id: 7, name: "Prof A" });
    expect(mocks.prisma.agenda.findFirst).toHaveBeenCalledWith({
      where: { tenantId: "tenant-a", isPrimary: true },
      select: { id: true, tenantId: true, professionalId: true, professional: { select: PROFESSIONAL_SELECT } },
    });
  });

  it("HU-028c: ya no existe la lectura fija de Professional(1)", () => {
    expect("getProfessional" in availability).toBe(false);
  });
});
