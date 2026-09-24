export interface EvolutionRow {
  id: string;
  /** Consulta a la que pertenece la medición (HU-003). null solo en filas viejas sin vincular. */
  consultationId: string | null;
  recordedAtISO: string;
  /** "lunes 1 de septiembre" */
  recordedAtLabel: string;
  /** "dd/MM/yyyy" (calculado en el server con el huso de la profesional) */
  recordedAtShortLabel: string;
  weightKg: number | null;
  heightCm: number | null;
  waistCm: number | null;
  hipCm: number | null;
  armCm: number | null;
  thighCm: number | null;
  calfCm: number | null;
  tricepsSkinfoldMm: number | null;
  subscapularSkinfoldMm: number | null;
  abdominalSkinfoldMm: number | null;
  // HU-006: perfil restringido ISAK (la pestaña Evolución no las grafica: épica 9).
  sittingHeightCm: number | null;
  armSpanCm: number | null;
  bicepsSkinfoldMm: number | null;
  iliacCrestSkinfoldMm: number | null;
  supraspinaleSkinfoldMm: number | null;
  thighSkinfoldMm: number | null;
  calfSkinfoldMm: number | null;
  armFlexedCm: number | null;
  humerusBreadthCm: number | null;
  bistyloidBreadthCm: number | null;
  femurBreadthCm: number | null;
  bodyFatPercent: number | null;
  muscleMassKg: number | null;
  bodyWaterPercent: number | null;
  visceralFatLevel: number | null;
  boneMassKg: number | null;
  basalMetabolicRateKcal: number | null;
  note: string | null;
  /** HU-006: "ISAK" = la fila es el estudio antropométrico ISAK de la consulta. */
  study: "ISAK" | null;
}

export const PERIMETER_MEASURES = [
  { key: "waistCm", label: "Cintura" },
  { key: "hipCm", label: "Cadera" },
  { key: "armCm", label: "Brazo relajado" },
  { key: "thighCm", label: "Muslo medio" },
  { key: "calfCm", label: "Pierna (pantorrilla)" },
] as const satisfies readonly { key: keyof EvolutionRow; label: string }[];

export const SKINFOLD_MEASURES = [
  { key: "tricepsSkinfoldMm", label: "Tricipital" },
  { key: "subscapularSkinfoldMm", label: "Subescapular" },
  { key: "abdominalSkinfoldMm", label: "Abdominal" },
] as const satisfies readonly { key: keyof EvolutionRow; label: string }[];

/** Métricas de bioimpedancia con su unidad (7.5.1). `unit` vacío = nivel, sin unidad en los ticks. */
export const BIOIMPEDANCE_METRICS = [
  { key: "bodyFatPercent", label: "Grasa corporal", unit: "%", decimals: 1 },
  { key: "muscleMassKg", label: "Masa muscular", unit: "kg", decimals: 1 },
  { key: "bodyWaterPercent", label: "Agua corporal", unit: "%", decimals: 1 },
  { key: "visceralFatLevel", label: "Grasa visceral (nivel)", unit: "", decimals: 1 },
  { key: "boneMassKg", label: "Masa ósea", unit: "kg", decimals: 1 },
  { key: "basalMetabolicRateKcal", label: "Metabolismo basal", unit: "kcal", decimals: 0 },
] as const satisfies readonly { key: keyof EvolutionRow; label: string; unit: string; decimals: number }[];

export const BIOIMPEDANCE_FIELDS = BIOIMPEDANCE_METRICS.map((m) => m.key);

export function hasAnyValue(
  entries: readonly EvolutionRow[],
  fields: readonly (keyof EvolutionRow)[],
): boolean {
  return entries.some((e) => fields.some((f) => e[f] !== null));
}
