// HU-016 (sección 16, P4): el logo acepta solo PNG o JPG, validado por magic bytes en el servidor.
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  revalidatePath: vi.fn(),
  update: vi.fn(),
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@nutri-bot/db", () => ({ prisma: { professional: { update: mocks.update } } }));
vi.mock("@/lib/bot-ai", () => ({ getBotAiKeyStatus: vi.fn() }));

import { uploadLogoAction } from "./actions";

const INITIAL = { ok: false };
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
const JPG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);
const WEBP = Buffer.from("RIFF\x24\x00\x00\x00WEBPVP8 ", "latin1");

function form(bytes: Uint8Array | null, name = "logo.png", type = "image/png"): FormData {
  const fd = new FormData();
  if (bytes) fd.set("logo", new File([new Uint8Array(bytes)], name, { type }));
  return fd;
}

describe("uploadLogoAction (P4)", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.update.mockResolvedValue({ id: 1 });
  });

  it("WEBP se rechaza aunque el navegador diga image/webp", async () => {
    expect(await uploadLogoAction(INITIAL, form(WEBP, "logo.webp", "image/webp"))).toEqual({
      ok: false,
      error: "Formato inválido (usá PNG o JPG)",
    });
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("un WEBP renombrado a .png también se rechaza (magic bytes)", async () => {
    expect((await uploadLogoAction(INITIAL, form(WEBP, "logo.png", "image/png"))).ok).toBe(false);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("sin archivo o vacío → Elegí una imagen", async () => {
    expect(await uploadLogoAction(INITIAL, form(null))).toEqual({ ok: false, error: "Elegí una imagen" });
    expect(await uploadLogoAction(INITIAL, form(new Uint8Array(0)))).toEqual({ ok: false, error: "Elegí una imagen" });
  });

  it("más de 2 MB → error de tamaño", async () => {
    expect(await uploadLogoAction(INITIAL, form(new Uint8Array(2 * 1024 * 1024 + 1)))).toEqual({
      ok: false,
      error: "La imagen pesa más de 2 MB",
    });
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("PNG declarado como JPEG → se guarda con el tipo detectado", async () => {
    expect(await uploadLogoAction(INITIAL, form(PNG, "logo.jpg", "image/jpeg"))).toEqual({ ok: true });
    const arg = mocks.update.mock.calls[0]![0];
    expect(arg.data.logoMimeType).toBe("image/png");
    expect(arg.select).toEqual({ id: true });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/ajustes");
  });

  it("JPEG real → ok", async () => {
    expect(await uploadLogoAction(INITIAL, form(JPG, "logo.jpg", "image/jpeg"))).toEqual({ ok: true });
    expect(mocks.update.mock.calls[0]![0].data.logoMimeType).toBe("image/jpeg");
  });
});
