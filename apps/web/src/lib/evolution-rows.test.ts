// R7 (017c-4): `hasReport` solo viene si la consulta trajo `anthropometricReport`.
import { describe, expect, it } from "vitest";
import type { EvolutionEntry } from "@nutri-bot/db";
import { toEvolutionRow } from "./evolution-rows";

const entry = {
  id: "e1",
  patientId: "p1",
  consultationId: "c1",
  recordedAt: new Date("2026-10-03T13:00:00Z"),
  study: "ISAK",
  note: null,
  basalMetabolicRateKcal: null,
} as unknown as EvolutionEntry;

describe("toEvolutionRow · hasReport", () => {
  it("con informe → true", () => {
    expect(toEvolutionRow({ ...entry, anthropometricReport: { id: "r1" } }, "America/Argentina/Cordoba").hasReport).toBe(true);
  });

  it("sin informe → false", () => {
    expect(toEvolutionRow({ ...entry, anthropometricReport: null }, "America/Argentina/Cordoba").hasReport).toBe(false);
  });

  it("si la consulta no trajo la relación, no se sabe (undefined)", () => {
    const row = toEvolutionRow(entry, "America/Argentina/Cordoba");
    expect(row.hasReport).toBeUndefined();
    expect("hasReport" in row).toBe(false);
  });
});
