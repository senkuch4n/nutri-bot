// HU-016 (D2, D10): validación de la firma en el servidor y nada de bytes en los logs.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  revalidatePath: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
}));
vi.mock("@/auth", () => ({ auth: mocks.auth }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@nutri-bot/db/domain", () => ({
  updateProfessionalSignature: mocks.update,
  removeProfessionalSignature: mocks.remove,
}));

import { removeSignatureAction, uploadSignatureAction } from "./signature-actions";

const INITIAL = { ok: false };
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 1, 2, 3]);
const JPG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 7, 7]);
const PDF = Buffer.from("%PDF-1.7\n1 0 obj\n<<>>\nendobj\n");

function form(file: File | null): FormData {
  const fd = new FormData();
  if (file) fd.set("signature", file);
  return fd;
}
const file = (bytes: Uint8Array, name: string, type: string) => new File([new Uint8Array(bytes)], name, { type });

describe("uploadSignatureAction", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.auth.mockResolvedValue({ user: { email: "pro@example.test" } });
    mocks.update.mockResolvedValue(undefined);
  });
  afterEach(() => vi.restoreAllMocks());

  it("sin sesión → sesión vencida, sin guardar", async () => {
    mocks.auth.mockResolvedValue(null);
    const r = await uploadSignatureAction(INITIAL, form(file(PNG, "firma.png", "image/png")));
    expect(r).toEqual({ ok: false, error: "Tu sesión venció. Volvé a entrar." });
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("sin archivo o archivo vacío → Elegí una imagen", async () => {
    expect(await uploadSignatureAction(INITIAL, form(null))).toEqual({ ok: false, error: "Elegí una imagen" });
    expect(await uploadSignatureAction(INITIAL, form(file(new Uint8Array(0), "x.png", "image/png")))).toEqual({
      ok: false,
      error: "Elegí una imagen",
    });
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("un PDF disfrazado de PNG → formato inválido", async () => {
    const r = await uploadSignatureAction(INITIAL, form(file(PDF, "firma.png", "image/png")));
    expect(r).toEqual({ ok: false, error: "Formato inválido (usá PNG o JPG)" });
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("más de 1 MB → error de tamaño sin leer el archivo", async () => {
    const big = file(new Uint8Array(1_048_577), "firma.png", "image/png");
    const spy = vi.spyOn(big, "arrayBuffer");
    const r = await uploadSignatureAction(INITIAL, form(big));
    expect(r).toEqual({ ok: false, error: "La imagen pesa más de 1 MB" });
    expect(spy).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("PNG declarado como JPEG → se guarda como PNG (manda el detectado)", async () => {
    const r = await uploadSignatureAction(INITIAL, form(file(PNG, "firma.jpg", "image/jpeg")));
    expect(r).toEqual({ ok: true });
    expect(mocks.update).toHaveBeenCalledTimes(1);
    const arg = mocks.update.mock.calls[0]![0];
    expect(arg.mimeType).toBe("image/png");
    expect(Buffer.from(arg.data).equals(PNG)).toBe(true);
  });

  it("JPEG real → se guarda, revalida /ajustes y devuelve ok", async () => {
    const r = await uploadSignatureAction(INITIAL, form(file(JPG, "firma.jpg", "image/jpeg")));
    expect(r).toEqual({ ok: true });
    expect(mocks.update.mock.calls[0]![0].mimeType).toBe("image/jpeg");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/ajustes");
  });

  it("si la base falla, devuelve el error genérico y no loguea los bytes", async () => {
    const b64 = PNG.toString("base64");
    const err = Object.assign(new Error(`Invalid update: signatureData ${b64}`), { code: "P2000", meta: { data: PNG } });
    mocks.update.mockRejectedValue(err);
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const r = await uploadSignatureAction(INITIAL, form(file(PNG, "firma.png", "image/png")));
    expect(r).toEqual({ ok: false, error: "No se pudo guardar la firma. Probá de nuevo." });
    expect(spy).toHaveBeenCalled();
    for (const call of spy.mock.calls) {
      for (const a of call) {
        expect(Buffer.isBuffer(a)).toBe(false);
        expect(a).not.toBe(err);
        expect(String(a)).not.toContain(b64);
      }
    }
    expect(spy.mock.calls[0]).toEqual(["uploadSignatureAction: no se pudo guardar", "P2000"]);
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });
});

describe("removeSignatureAction", () => {
  beforeEach(() => vi.resetAllMocks());

  it("con sesión quita la firma", async () => {
    mocks.auth.mockResolvedValue({ user: { email: "pro@example.test" } });
    mocks.remove.mockResolvedValue(undefined);
    expect(await removeSignatureAction(INITIAL)).toEqual({ ok: true });
    expect(mocks.remove).toHaveBeenCalledTimes(1);
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/ajustes");
  });

  it("sin sesión no la quita", async () => {
    mocks.auth.mockResolvedValue(null);
    expect(await removeSignatureAction(INITIAL)).toEqual({ ok: false, error: "Tu sesión venció. Volvé a entrar." });
    expect(mocks.remove).not.toHaveBeenCalled();
  });

  it("si la base falla, error genérico", async () => {
    mocks.auth.mockResolvedValue({ user: { email: "pro@example.test" } });
    mocks.remove.mockRejectedValue(Object.assign(new Error("boom"), { code: "P1001" }));
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await removeSignatureAction(INITIAL)).toEqual({ ok: false, error: "No se pudo quitar la firma. Probá de nuevo." });
  });
});
