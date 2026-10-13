// HU-017b-4 (Q19, D19): cada grupo de Ajustes guarda solo sus columnas. Los tests fijan la `data` exacta
// de cada `update`: General no toca PDF ni firma, y viceversa.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PHONE_INPUT_TEXT, SETTINGS_TEXT } from "@nutri-bot/core";

const mocks = vi.hoisted(() => ({
  revalidatePath: vi.fn(),
  update: vi.fn(),
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@nutri-bot/db", () => ({ prisma: { professional: { update: mocks.update } } }));
vi.mock("@/lib/bot-ai", () => ({ getBotAiKeyStatus: vi.fn() }));

import { saveGeneralSettingsAction, savePdfStyleAction, saveSignatureIdentityAction } from "./actions";

const INITIAL = { ok: false };

function form(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

const GENERAL = {
  timezone: "America/Argentina/Buenos_Aires",
  currency: "ARS",
  phone: "",
  acceptedInsurances: "OSDE, Galeno",
};

function lastData() {
  expect(mocks.update).toHaveBeenCalledTimes(1);
  const arg = mocks.update.mock.calls[0]![0] as { where: unknown; data: Record<string, unknown> };
  expect(arg.where).toEqual({ id: 1 });
  return arg.data;
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.update.mockResolvedValue({ id: 1 });
});

describe("saveGeneralSettingsAction", () => {
  it("guarda solo zona, moneda, teléfono y obras sociales (nada de PDF ni firma)", async () => {
    const res = await saveGeneralSettingsAction(
      INITIAL,
      // Aunque el form trajera campos de otros grupos, no se guardan.
      form({ ...GENERAL, currency: "usd", pdfFooterText: "pisado", title: "Dra.", licenseNumber: "M.P. 1" }),
    );
    expect(res).toEqual({ ok: true });
    expect(lastData()).toEqual({
      timezone: "America/Argentina/Buenos_Aires",
      currency: "USD",
      phoneJid: null,
      acceptedInsurances: "OSDE, Galeno",
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/ajustes");
  });

  it('teléfono "351 555 2345" → phoneJid 5493515552345@s.whatsapp.net', async () => {
    await saveGeneralSettingsAction(INITIAL, form({ ...GENERAL, phone: "351 555 2345" }));
    expect(lastData().phoneJid).toBe("5493515552345@s.whatsapp.net");
  });

  it("el teléfono guardado, mostrado con formato, vuelve igual", async () => {
    await saveGeneralSettingsAction(INITIAL, form({ ...GENERAL, phone: "+54 9 351 555-2345" }));
    expect(lastData().phoneJid).toBe("5493515552345@s.whatsapp.net");
  });

  it("teléfono vacío o con espacios → null", async () => {
    await saveGeneralSettingsAction(INITIAL, form({ ...GENERAL, phone: "   " }));
    expect(lastData().phoneJid).toBeNull();
  });

  it("teléfono inválido → error de PHONE_INPUT_TEXT y no guarda", async () => {
    expect(await saveGeneralSettingsAction(INITIAL, form({ ...GENERAL, phone: "555 2345" }))).toEqual({
      ok: false,
      error: PHONE_INPUT_TEXT.invalid,
    });
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("zona inválida → error y no guarda", async () => {
    expect(await saveGeneralSettingsAction(INITIAL, form({ ...GENERAL, timezone: "Marte/Olympus" }))).toEqual({
      ok: false,
      error: SETTINGS_TEXT.invalidTimezone,
    });
    expect(await saveGeneralSettingsAction(INITIAL, form({ ...GENERAL, timezone: "" }))).toEqual({
      ok: false,
      error: SETTINGS_TEXT.invalidTimezone,
    });
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("moneda inválida → error y no guarda", async () => {
    expect(await saveGeneralSettingsAction(INITIAL, form({ ...GENERAL, currency: "PESOS" }))).toEqual({
      ok: false,
      error: SETTINGS_TEXT.invalidCurrency,
    });
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("obras sociales vacías → null", async () => {
    await saveGeneralSettingsAction(INITIAL, form({ ...GENERAL, acceptedInsurances: "  " }));
    expect(lastData().acceptedInsurances).toBeNull();
  });

  it("si la base falla, devuelve el error inline (no tira)", async () => {
    mocks.update.mockRejectedValueOnce(new Error("db caída"));
    expect(await saveGeneralSettingsAction(INITIAL, form(GENERAL))).toEqual({ ok: false, error: SETTINGS_TEXT.saveError });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });
});

describe("savePdfStyleAction", () => {
  it("guarda solo color y pie (nada de General ni firma)", async () => {
    const res = await savePdfStyleAction(
      INITIAL,
      form({ pdfAccentColor: "#2563eb", pdfFooterText: " Lic. en Nutrición ", ...GENERAL, title: "Dra." }),
    );
    expect(res).toEqual({ ok: true });
    expect(lastData()).toEqual({ pdfAccentColor: "#2563eb", pdfFooterText: "Lic. en Nutrición" });
  });

  it("vacíos → null", async () => {
    await savePdfStyleAction(INITIAL, form({ pdfAccentColor: "", pdfFooterText: "" }));
    expect(lastData()).toEqual({ pdfAccentColor: null, pdfFooterText: null });
  });

  it("color inválido → error y no guarda", async () => {
    expect(await savePdfStyleAction(INITIAL, form({ pdfAccentColor: "azul", pdfFooterText: "" }))).toEqual({
      ok: false,
      error: SETTINGS_TEXT.pdfColorInvalid,
    });
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("pie de más de 300 letras → error", async () => {
    const res = await savePdfStyleAction(INITIAL, form({ pdfAccentColor: "", pdfFooterText: "x".repeat(301) }));
    expect(res).toEqual({ ok: false, error: SETTINGS_TEXT.pdfFooterTooLong });
    expect(mocks.update).not.toHaveBeenCalled();
  });
});

describe("saveSignatureIdentityAction", () => {
  it("guarda solo título y matrícula (nada de General ni PDF)", async () => {
    const res = await saveSignatureIdentityAction(
      INITIAL,
      form({ title: " Lic. ", licenseNumber: "M.P. 852", ...GENERAL, pdfFooterText: "pisado" }),
    );
    expect(res).toEqual({ ok: true });
    expect(lastData()).toEqual({ title: "Lic.", licenseNumber: "M.P. 852" });
  });

  it("vacíos → null", async () => {
    await saveSignatureIdentityAction(INITIAL, form({ title: "", licenseNumber: "" }));
    expect(lastData()).toEqual({ title: null, licenseNumber: null });
  });

  it("título de más de 20 letras → error", async () => {
    expect(await saveSignatureIdentityAction(INITIAL, form({ title: "x".repeat(21), licenseNumber: "" }))).toEqual({
      ok: false,
      error: SETTINGS_TEXT.titleTooLong,
    });
    expect(mocks.update).not.toHaveBeenCalled();
  });
});
