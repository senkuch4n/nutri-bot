const roundToOne = (value: number) => Math.round(value * 10) / 10;
const roundToTwo = (value: number) => Math.round(value * 100) / 100;

/** IMC = peso(kg) / altura(m)^2. Redondeado a 1 decimal. */
export function computeBmi(
  weightKg: number | null | undefined,
  heightCm: number | null | undefined,
): number | null {
  if (weightKg == null || heightCm == null || weightKg <= 0 || heightCm <= 0) return null;
  const heightM = heightCm / 100;
  return roundToOne(weightKg / (heightM * heightM));
}

/** Índice cintura/cadera. Redondeado a 2 decimales. */
export function computeWaistHipRatio(
  waistCm: number | null | undefined,
  hipCm: number | null | undefined,
): number | null {
  if (waistCm == null || hipCm == null || waistCm <= 0 || hipCm <= 0) return null;
  return roundToTwo(waistCm / hipCm);
}
