import { ISAK_MEASURES, type IsakMeasureKey, type IsakMeasures } from "./isak";

/**
 * HU-006 (D20): validación de la carga del estudio ISAK. La usan el formulario (en el cliente,
 * para el error en línea) y la server action (la que manda).
 */

const SKINFOLD_RANGE = { min: 1, max: 80 };
const GIRTH_RANGE = { min: 10, max: 200 };
const BREADTH_RANGE = { min: 2, max: 20 };

/** Rangos inclusivos en los dos extremos. */
export const ISAK_RANGES: Record<IsakMeasureKey, { min: number; max: number }> = {
  weightKg: { min: 10, max: 300 },
  heightCm: { min: 50, max: 230 },
  sittingHeightCm: { min: 30, max: 130 },
  armSpanCm: { min: 50, max: 250 },
  tricepsSkinfoldMm: SKINFOLD_RANGE,
  subscapularSkinfoldMm: SKINFOLD_RANGE,
  bicepsSkinfoldMm: SKINFOLD_RANGE,
  iliacCrestSkinfoldMm: SKINFOLD_RANGE,
  supraspinaleSkinfoldMm: SKINFOLD_RANGE,
  abdominalSkinfoldMm: SKINFOLD_RANGE,
  thighSkinfoldMm: SKINFOLD_RANGE,
  calfSkinfoldMm: SKINFOLD_RANGE,
  armCm: GIRTH_RANGE,
  armFlexedCm: GIRTH_RANGE,
  waistCm: GIRTH_RANGE,
  hipCm: GIRTH_RANGE,
  thighCm: GIRTH_RANGE,
  calfCm: GIRTH_RANGE,
  humerusBreadthCm: BREADTH_RANGE,
  bistyloidBreadthCm: BREADTH_RANGE,
  femurBreadthCm: BREADTH_RANGE,
};

export const ISAK_FORM_TEXT = {
  requiredWeight: "La masa corporal es obligatoria para el estudio ISAK",
  requiredHeight: "La talla es obligatoria para el estudio ISAK",
  invalidNumber: "Revisá el valor: usá un número con hasta 1 decimal",
  sittingAboveHeight: "La talla sentado no puede ser mayor que la talla",
  range: {
    weightKg: "Revisá el valor: la masa corporal va de 10 a 300 kg",
    heightCm: "Revisá el valor: la talla va de 50 a 230 cm",
    sittingHeightCm: "Revisá el valor: la talla sentado va de 30 a 130 cm",
    armSpanCm: "Revisá el valor: la envergadura va de 50 a 250 cm",
    skinfolds: "Revisá el valor: los pliegues van de 1 a 80 mm",
    girths: "Revisá el valor: los perímetros van de 10 a 200 cm",
    breadths: "Revisá el valor: los diámetros van de 2 a 20 cm",
  },
} as const;

const NUMBER_RE = /^\d+(?:[.,]\d)?$/;

/** "" / espacios / undefined → null. Acepta coma o punto y hasta 1 decimal ("11", "11,5", "11.5").
 *  Cualquier otra cosa (letras, 2 decimales, negativos, miles) → undefined (inválido). */
export function parseIsakNumber(raw: string | null | undefined): number | null | undefined {
  if (raw == null) return null;
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  if (!NUMBER_RE.test(trimmed)) return undefined;
  return Number(trimmed.replace(",", "."));
}

export type IsakFieldErrors = Partial<Record<IsakMeasureKey, string>>;

function rangeMessage(key: IsakMeasureKey): string {
  const def = ISAK_MEASURES.find((d) => d.key === key)!;
  switch (key) {
    case "weightKg":
    case "heightCm":
    case "sittingHeightCm":
    case "armSpanCm":
      return ISAK_FORM_TEXT.range[key];
    default:
      return ISAK_FORM_TEXT.range[def.group as "skinfolds" | "girths" | "breadths"];
  }
}

/** Valida los 21 campos crudos (FormData). Un error por campo, en este orden de prioridad:
 *  formato → obligatorio (masa, talla) → rango → talla sentado > talla (con la talla válida; el error
 *  va en sittingHeightCm y le gana a su error de rango). ok → las 21 medidas como números o null (masa y talla no null). */
export function validateIsakForm(
  raw: Partial<Record<IsakMeasureKey, string | null | undefined>>,
):
  | { ok: true; measures: IsakMeasures & { weightKg: number; heightCm: number } }
  | { ok: false; errors: IsakFieldErrors } {
  const errors: IsakFieldErrors = {};
  const measures = {} as IsakMeasures;
  for (const { key } of ISAK_MEASURES) {
    const parsed = parseIsakNumber(raw[key]);
    measures[key] = parsed ?? null;
    if (parsed === undefined) {
      errors[key] = ISAK_FORM_TEXT.invalidNumber;
    } else if (parsed === null) {
      if (key === "weightKg") errors[key] = ISAK_FORM_TEXT.requiredWeight;
      if (key === "heightCm") errors[key] = ISAK_FORM_TEXT.requiredHeight;
    } else {
      const range = ISAK_RANGES[key];
      if (parsed < range.min || parsed > range.max) errors[key] = rangeMessage(key);
    }
  }
  const sitting = measures.sittingHeightCm;
  const height = measures.heightCm;
  // Con una talla válida, "talla sentado > talla" le gana al error de rango de la talla sentado:
  // es el mensaje del escenario de la HU (164 / 170, y 170 también está fuera de 30–130).
  const sittingFormatOk = errors.sittingHeightCm !== ISAK_FORM_TEXT.invalidNumber;
  if (sitting !== null && height !== null && sittingFormatOk && !errors.heightCm && sitting > height) {
    errors.sittingHeightCm = ISAK_FORM_TEXT.sittingAboveHeight;
  }
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, measures: measures as IsakMeasures & { weightKg: number; heightCm: number } };
}
