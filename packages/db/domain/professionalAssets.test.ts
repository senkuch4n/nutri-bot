// HU-016: lectura y escritura de la firma; armado de las imágenes de los PDF.
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  prisma: {
    professional: { findUnique: vi.fn(), findUniqueOrThrow: vi.fn(), update: vi.fn() },
    agenda: { findFirst: vi.fn() },
  },
}));
vi.mock("../index", () => ({ prisma: mocks.prisma }));

import {
  getProfessionalPdfAssets,
  getProfessionalSignatureImage,
  removeProfessionalSignature,
  updateProfessionalSignature,
} from "./professionalAssets";

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
const JPG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 9]);

// HU-025: la profesional es la de la agenda principal del consultorio recibido.
const T = { tenantId: "legacy-tenant" };
const KEY = { id_tenantId: { id: 1, tenantId: "legacy-tenant" } };

beforeEach(() => {
  vi.resetAllMocks();
  mocks.prisma.agenda.findFirst.mockImplementation(async ({ where }: { where: { tenantId: string } }) => (
    where.tenantId === "legacy-tenant"
      ? { id: "legacy-agenda", tenantId: "legacy-tenant", professionalId: 1, professional: { id: 1 } }
      : where.tenantId === "tenant-b"
        ? { id: "agenda-b", tenantId: "tenant-b", professionalId: 7, professional: { id: 7 } }
        : null));
});

describe("updateProfessionalSignature", () => {
  it("guarda bytes y MIME sin devolver la fila", async () => {
    mocks.prisma.professional.update.mockResolvedValue({ id: 1 });
    await expect(updateProfessionalSignature(T, { data: PNG, mimeType: "image/png" })).resolves.toBeUndefined();
    expect(mocks.prisma.professional.update).toHaveBeenCalledWith({
      where: KEY,
      data: { signatureData: PNG, signatureMimeType: "image/png" },
      select: { id: true },
    });
  });
});

describe("removeProfessionalSignature", () => {
  it("pone las dos columnas en null", async () => {
    mocks.prisma.professional.update.mockResolvedValue({ id: 1 });
    await expect(removeProfessionalSignature(T)).resolves.toBeUndefined();
    expect(mocks.prisma.professional.update).toHaveBeenCalledWith({
      where: KEY,
      data: { signatureData: null, signatureMimeType: null },
      select: { id: true },
    });
  });
});

describe("getProfessionalSignatureImage", () => {
  it("con las dos columnas devuelve la imagen; el select pide solo esas dos", async () => {
    mocks.prisma.professional.findUnique.mockResolvedValue({ signatureData: PNG, signatureMimeType: "image/png" });
    await expect(getProfessionalSignatureImage(T)).resolves.toEqual({ data: PNG, mimeType: "image/png" });
    expect(mocks.prisma.professional.findUnique).toHaveBeenCalledWith({
      where: KEY,
      select: { signatureData: true, signatureMimeType: true },
    });
  });

  it.each([
    ["sin bytes", { signatureData: null, signatureMimeType: "image/png" }],
    ["sin MIME", { signatureData: PNG, signatureMimeType: null }],
    ["sin fila", null],
  ])("%s → null", async (_label, row) => {
    mocks.prisma.professional.findUnique.mockResolvedValue(row);
    await expect(getProfessionalSignatureImage(T)).resolves.toBeNull();
  });
});

describe("getProfessionalPdfAssets", () => {
  const base = {
    name: "Daiana Ponce",
    title: "Lic.",
    licenseNumber: "M.P. 852",
    pdfAccentColor: "#3c7a24",
    pdfFooterText: null,
  };

  it("arma logo y firma cuando están completos", async () => {
    mocks.prisma.professional.findUniqueOrThrow.mockResolvedValue({
      ...base,
      logoData: JPG,
      logoMimeType: "image/jpeg",
      signatureData: PNG,
      signatureMimeType: "image/png",
    });
    await expect(getProfessionalPdfAssets(T)).resolves.toEqual({
      ...base,
      logo: { data: JPG, mimeType: "image/jpeg" },
      signature: { data: PNG, mimeType: "image/png" },
    });
    const arg = mocks.prisma.professional.findUniqueOrThrow.mock.calls[0]![0];
    expect(arg.where).toEqual(KEY);
    expect(Object.keys(arg.select).sort()).toEqual(
      [
        "licenseNumber",
        "logoData",
        "logoMimeType",
        "name",
        "pdfAccentColor",
        "pdfFooterText",
        "signatureData",
        "signatureMimeType",
        "title",
      ].sort(),
    );
  });

  it("logo o firma en null si falta el byte o el MIME", async () => {
    mocks.prisma.professional.findUniqueOrThrow.mockResolvedValue({
      ...base,
      logoData: JPG,
      logoMimeType: null,
      signatureData: null,
      signatureMimeType: "image/png",
    });
    const r = await getProfessionalPdfAssets(T);
    expect(r.logo).toBeNull();
    expect(r.signature).toBeNull();
    expect(r.name).toBe("Daiana Ponce");
  });
});

describe("HU-025: activos del consultorio", () => {
  it("otro consultorio escribe y lee la profesional de su agenda principal", async () => {
    mocks.prisma.professional.update.mockResolvedValue({ id: 7 });
    mocks.prisma.professional.findUnique.mockResolvedValue(null);
    await updateProfessionalSignature({ tenantId: "tenant-b" }, { data: PNG, mimeType: "image/png" });
    await getProfessionalSignatureImage({ tenantId: "tenant-b" });
    const key = { id_tenantId: { id: 7, tenantId: "tenant-b" } };
    expect(mocks.prisma.professional.update.mock.calls[0]![0].where).toEqual(key);
    expect(mocks.prisma.professional.findUnique.mock.calls[0]![0].where).toEqual(key);
  });

  it("un consultorio sin agenda principal no lee ni escribe nada", async () => {
    await expect(removeProfessionalSignature({ tenantId: "sin-agenda" })).rejects.toThrow("tenant_scope");
    await expect(getProfessionalPdfAssets({ tenantId: "sin-agenda" })).rejects.toThrow("tenant_scope");
    expect(mocks.prisma.professional.update).not.toHaveBeenCalled();
    expect(mocks.prisma.professional.findUniqueOrThrow).not.toHaveBeenCalled();
  });
});
