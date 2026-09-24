import type { IsakMeasures } from "./isak";

/**
 * Casos de la HU-006 (solo números, sin identidad). A y B son exportaciones reales de ISAKMetry
 * sin datos identificatorios; C es sintético.
 */

/** Caso A: masculino, 22 años. */
export const CASE_A: IsakMeasures = {
  weightKg: 61,
  heightCm: 164,
  sittingHeightCm: 83,
  armSpanCm: 166.7,
  tricepsSkinfoldMm: 11,
  subscapularSkinfoldMm: 11,
  bicepsSkinfoldMm: 4,
  iliacCrestSkinfoldMm: 19,
  supraspinaleSkinfoldMm: 16,
  abdominalSkinfoldMm: 16,
  thighSkinfoldMm: 11,
  calfSkinfoldMm: 6,
  armCm: 30.2,
  armFlexedCm: 32,
  waistCm: 73,
  hipCm: 88,
  thighCm: 52,
  calfCm: 34.5,
  humerusBreadthCm: 6.5,
  bistyloidBreadthCm: 5.4,
  femurBreadthCm: 9.7,
};

/** Caso B: masculino, 21 años. */
export const CASE_B: IsakMeasures = {
  weightKg: 67.6,
  heightCm: 164,
  sittingHeightCm: 83,
  armSpanCm: 166.7,
  tricepsSkinfoldMm: 12,
  subscapularSkinfoldMm: 14,
  bicepsSkinfoldMm: 4,
  iliacCrestSkinfoldMm: 30,
  supraspinaleSkinfoldMm: 21.5,
  abdominalSkinfoldMm: 18,
  thighSkinfoldMm: 8,
  calfSkinfoldMm: 7,
  armCm: 32.3,
  armFlexedCm: 33.1,
  waistCm: 82.1,
  hipCm: 94,
  thighCm: 54,
  calfCm: 34,
  humerusBreadthCm: 6.5,
  bistyloidBreadthCm: 5.3,
  femurBreadthCm: 9.6,
};

/** Caso C (sintético): femenino, 35 años. */
export const CASE_C: IsakMeasures = {
  weightKg: 58,
  heightCm: 160,
  sittingHeightCm: 85,
  armSpanCm: 158,
  tricepsSkinfoldMm: 18,
  subscapularSkinfoldMm: 14,
  bicepsSkinfoldMm: 8,
  iliacCrestSkinfoldMm: 16,
  supraspinaleSkinfoldMm: 12,
  abdominalSkinfoldMm: 20,
  thighSkinfoldMm: 24,
  calfSkinfoldMm: 15,
  armCm: 27.5,
  armFlexedCm: 28.4,
  waistCm: 70,
  hipCm: 96,
  thighCm: 52,
  calfCm: 34,
  humerusBreadthCm: 6.0,
  bistyloidBreadthCm: 4.9,
  femurBreadthCm: 8.8,
};
