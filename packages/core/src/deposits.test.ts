import { describe, expect, it } from "vitest";
import { computeDepositAmount } from "./deposits";

describe("computeDepositAmount", () => {
  it("calcula una seña fija", () => expect(computeDepositAmount(1000, "FIXED", 250)).toBe(250));
  it("limita una seña fija al precio", () => expect(computeDepositAmount(1000, "FIXED", 1500)).toBe(1000));
  it("calcula una seña porcentual", () => expect(computeDepositAmount(999, "PERCENT", 20)).toBe(199.8));
  it("rounds percentage and fixed deposits to cents", () => {
    expect(computeDepositAmount(10000, "PERCENT", 30)).toBe(3000);
    expect(computeDepositAmount(10000, "FIXED", 2500)).toBe(2500);
    expect(computeDepositAmount(123.45, "PERCENT", 33)).toBe(40.74);
    expect(computeDepositAmount(1000, "FIXED", 12.346)).toBe(12.35);
  });
  it("rejects invalid or non-finite configuration", () => {
    expect(computeDepositAmount(NaN, "FIXED", 100)).toBe(0);
    expect(computeDepositAmount(1000, "FIXED", Infinity)).toBe(0);
    expect(computeDepositAmount(1000, "PERCENT", 101)).toBe(0);
    expect(computeDepositAmount(1000, "INVALID" as any, 30)).toBe(0);
  });
  it("devuelve cero para valores no positivos", () => {
    expect(computeDepositAmount(0, "FIXED", 100)).toBe(0);
    expect(computeDepositAmount(1000, "PERCENT", -1)).toBe(0);
  });
});
