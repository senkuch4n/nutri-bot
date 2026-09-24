/**
 * Textos de faltantes compartidos por el diagnóstico de adultos (HU-004, `DIAGNOSIS_TEXT`) y el
 * pediátrico (HU-008, `growth-reference.ts`). Viven acá para que `growth-reference.ts` no importe
 * `anthropometric-diagnosis.ts`, que a su vez lo importa a él (evita el ciclo). Mismos valores.
 */
export const DIAGNOSIS_MISSING_TEXT = {
  missingWeight: "Sin dato (falta peso)",
  missingHeight: "Sin dato (falta talla)",
  missingSex: "Falta sexo",
  missingBirthDate: "Falta fecha de nacimiento",
} as const;
