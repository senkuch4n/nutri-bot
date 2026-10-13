// HU-017b-2 (SDD 9-2): la línea gris de la tarjeta del servicio.
import { describe, expect, it } from "vitest";
import { formatPrice } from "./format";
import { SERVICE_TEXT, serviceSummaryLine } from "./service-summary";

const base = {
  requiresDeposit: false,
  depositKind: null,
  depositValue: null,
  prepInstructions: null,
  asksReason: false,
  reminders: [],
} as const;

describe("serviceSummaryLine", () => {
  it("todo apagado → Sin recordatorios", () => {
    expect(serviceSummaryLine(base, "ARS")).toBe("Sin recordatorios");
  });

  it("seña por porcentaje", () => {
    expect(serviceSummaryLine({ ...base, requiresDeposit: true, depositKind: "PERCENT", depositValue: 50 }, "ARS")).toBe(
      "Pide seña (50 %)",
    );
  });

  it("seña fija con formatPrice en la moneda de la profesional", () => {
    const line = serviceSummaryLine({ ...base, requiresDeposit: true, depositKind: "FIXED", depositValue: 5000 }, "ARS");
    expect(line).toBe(`Pide seña (${formatPrice(5000, "ARS")})`);
    expect(line).toMatch(/5\.000/);
  });

  it("seña apagada no se menciona aunque tenga tipo y valor guardados", () => {
    expect(serviceSummaryLine({ ...base, depositKind: "PERCENT", depositValue: 50 }, "ARS")).toBe("Sin recordatorios");
  });

  it("todo prendido, en orden y separado por ·", () => {
    expect(
      serviceSummaryLine(
        {
          requiresDeposit: true,
          depositKind: "PERCENT",
          depositValue: 30,
          prepInstructions: "Vení en ayunas",
          asksReason: true,
          reminders: [
            { amount: 3, unit: "DAYS", asksConfirmation: true },
            { amount: 24, unit: "HOURS", asksConfirmation: false },
          ],
        },
        "ARS",
      ),
    ).toBe("Pide seña (30 %) · Manda recomendaciones · Pide motivo · Recordatorios: 3 días (pide confirmar) y 24 h antes");
  });

  it("solo recordatorios", () => {
    expect(serviceSummaryLine({ ...base, reminders: [{ amount: 24, unit: "HOURS", asksConfirmation: false }] }, "ARS")).toBe(
      "Recordatorio: 24 h antes",
    );
  });

  it("recomendaciones en blanco no cuentan", () => {
    expect(serviceSummaryLine({ ...base, prepInstructions: "   ", asksReason: true }, "ARS")).toBe("Pide motivo");
  });
});

describe("SERVICE_TEXT", () => {
  it("contadores", () => {
    expect(SERVICE_TEXT.active(4)).toBe("Activos (4)");
    expect(SERVICE_TEXT.paused(1)).toBe("Pausados (1)");
  });
});
