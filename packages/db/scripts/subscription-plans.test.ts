// HU-029b (§B.5.8): argumentos del script de planes. Sin base.
import { describe, expect, it } from "vitest";
import { SubscriptionPlansScriptError, parseArgs } from "./subscription-plans";

const create = (...extra: string[]) => [
  "create", "--mode", "live", "--code", "anual-2027", "--name", "Plan anual", "--amount", "600000", "--frequency", "12", "--unit", "months", ...extra,
];

describe("subscription-plans parseArgs", () => {
  it("create válido normaliza el importe y arma los términos", () => {
    expect(parseArgs(create("--default"))).toEqual({
      name: "create",
      mode: "LIVE",
      code: "anual-2027",
      planName: "Plan anual",
      terms: { amount: "600000.00", currency: "ARS", frequency: 12, frequencyUnit: "MONTHS", trialLength: null, trialUnit: null, billingCycles: null },
      isPublic: true,
      isDefault: true,
    });
  });

  it("promo privada con 1 mes de prueba", () => {
    const cmd = parseArgs([
      "create", "--mode", "sandbox", "--code", "mensual-promo", "--name", "Plan mensual", "--amount", "60000",
      "--frequency", "1", "--unit", "months", "--trial", "1", "--trial-unit", "months", "--private",
    ]);
    expect(cmd).toMatchObject({ isPublic: false, terms: { trialLength: 1, trialUnit: "MONTHS" } });
  });

  it.each([
    [create("--cycles", "1"), "Plan inválido: cycles_not_supported."],
    [create().map((a) => (a === "600000" ? "14" : a)), "Plan inválido: amount_out_of_range."],
    [create().map((a) => (a === "12" ? "5" : a)), "Plan inválido: invalid_frequency."],
    [create("--trial", "7"), "--trial y --trial-unit van juntos."],
    [create().map((a) => (a === "months" ? "days" : a)), "Plan inválido: days_only_in_sandbox."],
    [create().map((a) => (a === "anual-2027" ? "Anual" : a)), "--code: minúsculas, números y guiones (máx. 40)."],
  ])("%j → %s", (argv, message) => {
    expect(() => parseArgs(argv)).toThrow(new SubscriptionPlansScriptError(message));
  });

  it("offer con vencimiento y prueba", () => {
    expect(parseArgs(["offer", "--tenant", "t-1", "--mode", "live", "--code", "mensual", "--allow-trial", "--expires", "2027-12-31"])).toEqual({
      name: "offer", tenantId: "t-1", mode: "LIVE", code: "mensual", allowTrial: true,
      expiresAt: new Date("2027-12-31T23:59:59-03:00"), note: null,
    });
  });

  it("comando o flags desconocidos → uso", () => {
    expect(() => parseArgs(["borrar"])).toThrow(SubscriptionPlansScriptError);
    expect(() => parseArgs(["list", "--mode", "prod"])).toThrow("--mode tiene que ser live o sandbox.");
    expect(() => parseArgs(["deactivate", "--mode", "live"])).toThrow(SubscriptionPlansScriptError);
    expect(parseArgs(["list"])).toEqual({ name: "list", mode: null });
  });
});
