import { describe, expect, it } from "vitest";
import { computeDepositAmount } from "./deposits";

describe("computeDepositAmount", () => {
  it("calcula una seña fija", () => expect(computeDepositAmount(1000, "FIXED", 250)).toBe(250));
  it("limita una seña fija al precio", () => expect(computeDepositAmount(1000, "FIXED", 1500)).toBe(1000));
  it("calcula una seña porcentual", () => expect(computeDepositAmount(999, "PERCENT", 20)).toBe(199.8));
  it("devuelve cero para valores no positivos", () => {
    expect(computeDepositAmount(0, "FIXED", 100)).toBe(0);
    expect(computeDepositAmount(1000, "PERCENT", -1)).toBe(0);
  });
});
