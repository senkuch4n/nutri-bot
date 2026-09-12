import { describe, expect, it } from "vitest";
import { computeBmi, computeWaistHipRatio } from "./anthropometry";

describe("anthropometry", () => {
  it("calcula el IMC y redondea a un decimal", () => {
    expect(computeBmi(70, 175)).toBe(22.9);
  });

  it("devuelve null para el IMC con datos faltantes", () => {
    expect(computeBmi(null, 175)).toBeNull();
  });

  it("calcula el índice cintura/cadera y redondea a dos decimales", () => {
    expect(computeWaistHipRatio(80, 100)).toBe(0.8);
  });

  it("devuelve null para el índice cintura/cadera con datos faltantes", () => {
    expect(computeWaistHipRatio(80, undefined)).toBeNull();
  });
});
