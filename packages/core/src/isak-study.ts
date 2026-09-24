import { roundTo } from "./anthropometry";
import {
  DIAGNOSIS_TEXT,
  buildAnthropometricDiagnosis,
  type AnthropometricDiagnosis,
} from "./anthropometric-diagnosis";
import {
  CORMIC_CLASS_LABELS,
  ISAK_MEASURES,
  MANOUVRIER_CLASS_LABELS,
  MUSCLE_BONE_CLASS_LABELS,
  PHANTOM,
  RELATIVE_SPAN_CLASS_LABELS,
  SOMATOTYPE_CATEGORY_LABELS,
  adiposeDistribution,
  classifyCormicIndex,
  classifyManouvrierIndex,
  classifyMuscleBoneIndex,
  classifyRelativeArmSpan,
  classifySomatotype,
  cormicIndex,
  correctedGirthCm,
  durninWomersleyDensity,
  ectomorphy,
  endomorphy,
  fatDistributionIndex,
  kerrAdiposeTissueKg,
  kerrAdiposeZ,
  leeMuscleMassKg,
  manouvrierIndex,
  mesomorphy,
  missingMeasuresNote,
  muscleDistribution,
  phantomZ,
  relativeArmSpan,
  rochaBoneMassKg,
  siriBodyFatPercent,
  somatochartPoint,
  sum6SkinfoldsMm,
  sum8SkinfoldsMm,
  type CormicClass,
  type IsakMeasureGroupKey,
  type IsakMeasureKey,
  type IsakMeasures,
  type ManouvrierClass,
  type MuscleBoneClass,
  type PhantomKey,
  type RelativeSpanClass,
  type SomatotypeCategory,
} from "./isak";
import { formatFixedEs, formatSignedFixedEs, isMinor, type Sex } from "./patient-formula-data";

/**
 * HU-006: el estudio ISAK armado para mostrar. Todo se calcula al vuelo (D18); acá se redondea
 * una sola vez, a lo que se muestra.
 */

// ─── Tipos ──────────────────────────────────────────────────────────────────

/** Valor de un cálculo del estudio. `value` ya redondeado a lo que se muestra. */
export type IsakValue =
  | { status: "ok"; value: number }
  | { status: "missing"; note: string }
  | { status: "not_for_minors" };

/** Igual, con clasificación. */
export type IsakClassified<K extends string> =
  | { status: "ok"; value: number; classKey: K; classLabel: string }
  | { status: "missing"; note: string }
  | { status: "not_for_minors" };

export interface IsakStudyInput {
  measures: IsakMeasures;
  sex: Sex | null;
  /** A la fecha de la consulta; null = sin fecha de nacimiento. */
  ageYears: number | null;
}

export interface IsakMeasureRow {
  key: IsakMeasureKey;
  group: IsakMeasureGroupKey;
  label: string;
  unit: "kg" | "cm" | "mm";
  /** El medido, tal cual (se muestra con 1 decimal). */
  value: number | null;
  /** null solo en heightCm (la talla no tiene Z). Missing → note "Sin dato". */
  z: IsakValue | null;
}

export interface IsakTissue {
  kg: IsakValue;
  percent: IsakValue;
  z: IsakValue;
}

export interface IsakStudyResult {
  minor: boolean;
  /** Para el aviso de la HU-001 (solo sexo y fecha de nacimiento). */
  missingSex: boolean;
  missingBirthDate: boolean;
  /** 21 filas, orden de ISAK_MEASURE_KEYS. */
  measures: IsakMeasureRow[];
  molecular: { fatMass: IsakTissue; fatFreeMass: { kg: IsakValue; percent: IsakValue } };
  tissues: {
    adipose: IsakTissue;
    muscle: IsakTissue;
    bone: IsakTissue;
    residual: IsakTissue & { negative: boolean };
  };
  distribution: {
    /** En %, 2 decimales. */
    adipose: { upper: IsakValue; central: IsakValue; lower: IsakValue };
    /** En %, 2 decimales. */
    muscle: { arm: IsakValue; thigh: IsakValue; calf: IsakValue };
  };
  compositionIndices: {
    /** D8: sin categoría. */
    adiposeMuscle: IsakValue;
    muscleBone: IsakClassified<MuscleBoneClass>;
  };
  /** 1 decimal. */
  adiposity: { sum6: IsakValue; sum8: IsakValue };
  muscularity: {
    correctedArm: { value: IsakValue; z: IsakValue };
    correctedThigh: { value: IsakValue; z: IsakValue };
    correctedCalf: { value: IsakValue; z: IsakValue };
    /** flexionado − relajado, 1 decimal. */
    armDifference: IsakValue;
  };
  proportionality: {
    cormic: IsakClassified<CormicClass>;
    manouvrier: IsakClassified<ManouvrierClass>;
    relativeSpan: IsakClassified<RelativeSpanClass>;
  };
  somatotype: {
    endo: IsakValue;
    meso: IsakValue;
    ecto: IsakValue;
    category: { status: "ok"; key: SomatotypeCategory; label: string } | { status: "missing"; note: string };
    /** x, y a 2 decimales. */
    chart: { status: "ok"; x: number; y: number } | { status: "missing"; note: string };
  };
  health: {
    /** buildAnthropometricDiagnosis con las medidas del estudio (bodyFrame null). La UI usa
     *  solo bmi, waistHipRatio, waistToHeight y conicity. */
    diagnosis: AnthropometricDiagnosis;
    /** 2 decimales, sin rango (D11). */
    fatDistributionIndex: IsakValue;
  };
}

// ─── Textos ─────────────────────────────────────────────────────────────────

export const ISAK_TEXT = {
  cardTitle: "Antropometría ISAK",
  empty: "Todavía no hay un estudio antropométrico ISAK en esta consulta.",
  load: "Cargar antropometría ISAK",
  save: "Guardar estudio",
  saving: "Guardando…",
  saved: "Estudio ISAK guardado",
  deleted: "Estudio ISAK borrado",
  saveError: "No se pudo guardar el estudio. Probá de nuevo.",
  deleteError: "No se pudo borrar el estudio. Probá de nuevo.",
  alreadyExists: "Esta consulta ya tiene un estudio ISAK.",
  discardTitle: "¿Descartar los cambios del estudio?",
  discardDescription: "Se pierden las medidas que cargaste.",
  deleteTitle: "¿Borrar el estudio ISAK de esta consulta?",
  deleteDescription: "No se puede deshacer.",
  deleteLabel: "Borrar estudio",
  viewFull: "Ver estudio completo",
  measurementRow: "Antropometría ISAK",
  measurementRowLink: "ver estudio",
  minorWarning: "Las fórmulas de composición corporal son para adultos.",
  zFootnote: "Z: puntuación contra el Phantom (Ross y Wilson). 0 = proporcional al Phantom",
  adiposeMuscleHint:
    "Cuántos kg de tejido adiposo transporta cada kg de tejido muscular. Cuanto menor, más eficiente el desplazamiento.",
  fatDistributionHint: "Un menor valor implica mayor acumulación de grasa en el tronco.",
  negativeResidual: "El residual dio negativo: revisá las medidas cargadas",
  methods:
    "Métodos: Durnin-Womersley (1974), Kerr (1991), Lee (2000), Rocha (1974), Phantom (Ross y Wilson, 1974), Heath-Carter.",
  comparedWith: (dateLabel: string, days: number) =>
    `Comparado con el estudio del ${dateLabel} (${days} ${days === 1 ? "día" : "días"} antes)`,
  sumsLive: (sum6: number | null, sum8: number | null) => {
    const fmt = (v: number | null) => (v === null ? "—" : `${formatFixedEs(v, 1)} mm`);
    return `Σ 6 pliegues: ${fmt(sum6)} · Σ 8 pliegues: ${fmt(sum8)}`;
  },
} as const;

/** Nombres de las fórmulas en la tabla de composición. */
export const ISAK_METHOD_LABELS = {
  fatMass: "Masa grasa (Durnin-Womersley, 1974)",
  fatFreeMass: "Masa libre de grasa",
  adipose: "Tejido adiposo (Kerr, 1991)",
  muscle: "Tejido muscular (Lee, 2000)",
  bone: "Tejido óseo (Rocha, 1974)",
  residual: "Tejido residual (por diferencia)",
} as const;

// ─── Helpers ────────────────────────────────────────────────────────────────

const NOT_FOR_MINORS = { status: "not_for_minors" } as const;
const missing = (note: string) => ({ status: "missing", note }) as const;
const ok = (value: number): IsakValue => ({ status: "ok", value });

type Blocked = { status: "missing"; note: string } | { status: "not_for_minors" };

interface Requirements {
  keys: readonly IsakMeasureKey[];
  sex?: boolean;
  age?: boolean;
  minorBlocked?: boolean;
}

const SKINFOLDS_6 = [
  "tricepsSkinfoldMm",
  "subscapularSkinfoldMm",
  "supraspinaleSkinfoldMm",
  "abdominalSkinfoldMm",
  "thighSkinfoldMm",
  "calfSkinfoldMm",
] as const satisfies readonly IsakMeasureKey[];
const SKINFOLDS_8 = [...SKINFOLDS_6, "bicepsSkinfoldMm", "iliacCrestSkinfoldMm"] as const;

const TISSUE_MISSING_LABEL = { adipose: "tejido adiposo", muscle: "tejido muscular", bone: "tejido óseo" } as const;
const SOMATO_MISSING_LABEL = { endo: "endomorfia", meso: "mesomorfia", ecto: "ectomorfia" } as const;

function missingDerivedNote(labels: string[]): string {
  return `Sin dato (falta ${labels.join(", ")})`;
}

// ─── buildIsakStudy ─────────────────────────────────────────────────────────

export function buildIsakStudy(input: IsakStudyInput): IsakStudyResult {
  const { measures, sex, ageYears } = input;
  const minor = isMinor(ageYears);

  /** Orden de chequeo: menor → medidas faltantes → sexo → fecha de nacimiento. null = se puede calcular. */
  const check = (req: Requirements): Blocked | null => {
    if (req.minorBlocked && minor) return NOT_FOR_MINORS;
    const absent = req.keys.filter((k) => measures[k] === null);
    if (absent.length > 0) return missing(missingMeasuresNote(absent));
    if (req.sex && sex === null) return missing(DIAGNOSIS_TEXT.missingSex);
    if (req.age && ageYears === null) return missing(DIAGNOSIS_TEXT.missingBirthDate);
    return null;
  };
  /** Valor de una medida ya chequeada. */
  const v = (k: IsakMeasureKey): number => measures[k] as number;
  const blockedTissue = (b: Blocked): IsakTissue => ({ kg: b, percent: b, z: b });
  const zOf = (value: number, key: PhantomKey) => roundTo(phantomZ(value, v("heightCm"), PHANTOM[key]), 2);

  // Medidas con su Z.
  const measureRows: IsakMeasureRow[] = ISAK_MEASURES.map((def) => {
    const value = measures[def.key];
    let z: IsakValue | null = null;
    if (def.key !== "heightCm") {
      z =
        value === null || measures.heightCm === null
          ? missing("Sin dato")
          : ok(zOf(value, def.key as PhantomKey));
    }
    return { key: def.key, group: def.group, label: def.label, unit: def.unit, value, z };
  });

  // Fraccionamiento molecular (Durnin-Womersley + Siri).
  let fatMass: IsakTissue;
  let fatFreeMass: { kg: IsakValue; percent: IsakValue };
  {
    const b = check({
      keys: ["weightKg", "heightCm", "tricepsSkinfoldMm", "subscapularSkinfoldMm", "bicepsSkinfoldMm", "iliacCrestSkinfoldMm"],
      sex: true,
      age: true,
      minorBlocked: true,
    });
    const density =
      b === null
        ? durninWomersleyDensity({
            sex: sex as Sex,
            ageYears: ageYears as number,
            sum4SkinfoldsMm:
              v("bicepsSkinfoldMm") + v("tricepsSkinfoldMm") + v("subscapularSkinfoldMm") + v("iliacCrestSkinfoldMm"),
          })
        : null;
    if (b !== null || density === null) {
      // density null con adulto no pasa (los tramos arrancan en 16/17 y esos ya son menores).
      const blocked = b ?? missing(DIAGNOSIS_TEXT.missingBirthDate);
      fatMass = blockedTissue(blocked);
      fatFreeMass = { kg: blocked, percent: blocked };
    } else {
      const pf = siriBodyFatPercent(density);
      const fatKgExact = (v("weightKg") * pf) / 100;
      const fatKg = roundTo(fatKgExact, 2);
      fatMass = { kg: ok(fatKg), percent: ok(roundTo(pf, 2)), z: ok(zOf(fatKgExact, "fatMassKg")) };
      fatFreeMass = { kg: ok(roundTo(v("weightKg") - fatKg, 2)), percent: ok(roundTo(100 - pf, 2)) };
    }
  }

  // Tejidos.
  const tissueFromKg = (kgR: number, key: PhantomKey, z?: number): IsakTissue => ({
    kg: ok(kgR),
    percent: ok(roundTo((kgR / v("weightKg")) * 100, 2)),
    z: ok(z ?? zOf(kgR, key)),
  });

  let adipose: IsakTissue;
  {
    const b = check({ keys: ["weightKg", "heightCm", ...SKINFOLDS_6], minorBlocked: true });
    if (b !== null) adipose = blockedTissue(b);
    else {
      const sum6 = sum6SkinfoldsMm(measures as Record<(typeof SKINFOLDS_6)[number], number>);
      // D6: el Z adiposo es el Z de Kerr del Σ6, sin pasar por los kg redondeados.
      adipose = tissueFromKg(
        roundTo(kerrAdiposeTissueKg(sum6, v("heightCm")), 2),
        "adiposeTissueKg",
        roundTo(kerrAdiposeZ(sum6, v("heightCm")), 2),
      );
    }
  }

  let muscle: IsakTissue;
  {
    const b = check({
      keys: ["weightKg", "heightCm", "tricepsSkinfoldMm", "thighSkinfoldMm", "calfSkinfoldMm", "armCm", "thighCm", "calfCm"],
      sex: true,
      age: true,
      minorBlocked: true,
    });
    if (b !== null) muscle = blockedTissue(b);
    else {
      const kg = leeMuscleMassKg({
        heightCm: v("heightCm"),
        sex: sex as Sex,
        ageYears: ageYears as number,
        correctedArmCm: correctedGirthCm(v("armCm"), v("tricepsSkinfoldMm")),
        correctedThighCm: correctedGirthCm(v("thighCm"), v("thighSkinfoldMm")),
        correctedCalfCm: correctedGirthCm(v("calfCm"), v("calfSkinfoldMm")),
      });
      muscle = tissueFromKg(roundTo(kg, 2), "muscleTissueKg");
    }
  }

  let bone: IsakTissue;
  {
    const b = check({ keys: ["weightKg", "heightCm", "bistyloidBreadthCm", "femurBreadthCm"], minorBlocked: true });
    if (b !== null) bone = blockedTissue(b);
    else {
      const kg = rochaBoneMassKg({
        heightCm: v("heightCm"),
        bistyloidBreadthCm: v("bistyloidBreadthCm"),
        femurBreadthCm: v("femurBreadthCm"),
      });
      bone = tissueFromKg(roundTo(kg, 2), "boneTissueKg");
    }
  }

  const tissueKg = (t: IsakTissue): number | null => (t.kg.status === "ok" ? t.kg.value : null);
  /** Bloqueo de un valor derivado de tejidos: menor, o "Sin dato (falta tejido …)". */
  const tissuesBlocked = (parts: Array<keyof typeof TISSUE_MISSING_LABEL>): Blocked | null => {
    if (minor) return NOT_FOR_MINORS;
    const all = { adipose, muscle, bone };
    const absent = parts.filter((p) => all[p].kg.status !== "ok");
    if (absent.length === 0) return null;
    return missing(missingDerivedNote(absent.map((p) => TISSUE_MISSING_LABEL[p])));
  };

  let residual: IsakTissue & { negative: boolean };
  {
    const b = tissuesBlocked(["adipose", "muscle", "bone"]);
    if (b !== null) residual = { ...blockedTissue(b), negative: false };
    else {
      const kg = roundTo(v("weightKg") - ((tissueKg(adipose) as number) + (tissueKg(muscle) as number) + (tissueKg(bone) as number)), 2);
      residual = { ...tissueFromKg(kg, "residualTissueKg"), negative: kg < 0 };
    }
  }

  // Distribución.
  const adiposeDist = (() => {
    const b = check({ keys: SKINFOLDS_6 });
    if (b !== null) return { upper: b, central: b, lower: b };
    const d = adiposeDistribution(measures as Record<(typeof SKINFOLDS_6)[number], number>);
    return { upper: ok(roundTo(d.upper * 100, 2)), central: ok(roundTo(d.central * 100, 2)), lower: ok(roundTo(d.lower * 100, 2)) };
  })();

  const correctedReq = {
    arm: ["armCm", "tricepsSkinfoldMm"],
    thigh: ["thighCm", "thighSkinfoldMm"],
    calf: ["calfCm", "calfSkinfoldMm"],
  } as const satisfies Record<string, readonly IsakMeasureKey[]>;
  const correctedExact = (part: keyof typeof correctedReq): number | null => {
    const [girth, skinfold] = correctedReq[part];
    if (measures[girth] === null || measures[skinfold] === null) return null;
    return correctedGirthCm(v(girth), v(skinfold));
  };
  const cArm = correctedExact("arm");
  const cThigh = correctedExact("thigh");
  const cCalf = correctedExact("calf");

  const muscleDist = (() => {
    const b = check({ keys: [...correctedReq.arm, ...correctedReq.thigh, ...correctedReq.calf] });
    if (b !== null || cArm === null || cThigh === null || cCalf === null) {
      const blocked = b ?? missing("Sin dato");
      return { arm: blocked, thigh: blocked, calf: blocked };
    }
    const d = muscleDistribution({ arm: cArm, thigh: cThigh, calf: cCalf });
    return { arm: ok(roundTo(d.arm * 100, 2)), thigh: ok(roundTo(d.thigh * 100, 2)), calf: ok(roundTo(d.calf * 100, 2)) };
  })();

  // Índices de composición.
  const adiposeMuscle: IsakValue = (() => {
    const b = tissuesBlocked(["adipose", "muscle"]);
    if (b !== null) return b;
    return ok(roundTo((tissueKg(adipose) as number) / (tissueKg(muscle) as number), 2));
  })();
  const muscleBone: IsakClassified<MuscleBoneClass> = (() => {
    const b = tissuesBlocked(["muscle", "bone"]);
    if (b !== null) return b;
    const value = roundTo((tissueKg(muscle) as number) / (tissueKg(bone) as number), 2);
    const classKey = classifyMuscleBoneIndex(value);
    return { status: "ok", value, classKey, classLabel: MUSCLE_BONE_CLASS_LABELS[classKey] };
  })();

  // Adiposidad y muscularidad.
  const sum6: IsakValue =
    check({ keys: SKINFOLDS_6 }) ?? ok(roundTo(sum6SkinfoldsMm(measures as Record<(typeof SKINFOLDS_6)[number], number>), 1));
  const sum8: IsakValue =
    check({ keys: SKINFOLDS_8 }) ?? ok(roundTo(sum8SkinfoldsMm(measures as Record<(typeof SKINFOLDS_8)[number], number>), 1));

  const corrected = (
    part: keyof typeof correctedReq,
    exact: number | null,
    key: PhantomKey,
  ): { value: IsakValue; z: IsakValue } => {
    const bValue = check({ keys: correctedReq[part] });
    if (bValue !== null || exact === null) {
      const blocked = bValue ?? missing("Sin dato");
      return { value: blocked, z: blocked };
    }
    const bZ = check({ keys: ["heightCm"] });
    return { value: ok(roundTo(exact, 2)), z: bZ ?? ok(zOf(exact, key)) };
  };

  const armDifference: IsakValue =
    check({ keys: ["armCm", "armFlexedCm"] }) ?? ok(roundTo(v("armFlexedCm") - v("armCm"), 1));

  // Proporcionalidad.
  const classified = <K extends string>(
    keys: readonly IsakMeasureKey[],
    decimals: number,
    compute: () => number,
    classify: (x: number) => K,
    labels: Record<K, string>,
  ): IsakClassified<K> => {
    const b = check({ keys });
    if (b !== null) return b;
    const value = roundTo(compute(), decimals);
    const classKey = classify(value);
    return { status: "ok", value, classKey, classLabel: labels[classKey] };
  };
  const cormic = classified(
    ["sittingHeightCm", "heightCm"],
    2,
    () => cormicIndex(v("sittingHeightCm"), v("heightCm")),
    classifyCormicIndex,
    CORMIC_CLASS_LABELS,
  );
  const manouvrier = classified(
    ["sittingHeightCm", "heightCm"],
    0,
    () => manouvrierIndex(v("sittingHeightCm"), v("heightCm")),
    classifyManouvrierIndex,
    MANOUVRIER_CLASS_LABELS,
  );
  const relativeSpan = classified(
    ["armSpanCm", "heightCm"],
    2,
    () => relativeArmSpan(v("armSpanCm"), v("heightCm")),
    classifyRelativeArmSpan,
    RELATIVE_SPAN_CLASS_LABELS,
  );

  // Somatotipo.
  const endoExact =
    check({ keys: ["tricepsSkinfoldMm", "subscapularSkinfoldMm", "supraspinaleSkinfoldMm", "heightCm"] }) ??
    endomorphy({
      tricepsSkinfoldMm: v("tricepsSkinfoldMm"),
      subscapularSkinfoldMm: v("subscapularSkinfoldMm"),
      supraspinaleSkinfoldMm: v("supraspinaleSkinfoldMm"),
      heightCm: v("heightCm"),
    });
  const mesoExact =
    check({
      keys: ["humerusBreadthCm", "femurBreadthCm", "armFlexedCm", "tricepsSkinfoldMm", "calfCm", "calfSkinfoldMm", "heightCm"],
    }) ??
    mesomorphy({
      humerusBreadthCm: v("humerusBreadthCm"),
      femurBreadthCm: v("femurBreadthCm"),
      armFlexedCm: v("armFlexedCm"),
      tricepsSkinfoldMm: v("tricepsSkinfoldMm"),
      calfCm: v("calfCm"),
      calfSkinfoldMm: v("calfSkinfoldMm"),
      heightCm: v("heightCm"),
    });
  const ectoExact = check({ keys: ["heightCm", "weightKg"] }) ?? ectomorphy(v("heightCm"), v("weightKg"));
  const asValue = (x: number | Blocked): IsakValue => (typeof x === "number" ? ok(roundTo(x, 2)) : x);
  const endo = asValue(endoExact);
  const meso = asValue(mesoExact);
  const ecto = asValue(ectoExact);

  let category: IsakStudyResult["somatotype"]["category"];
  let chart: IsakStudyResult["somatotype"]["chart"];
  if (typeof endoExact === "number" && typeof mesoExact === "number" && typeof ectoExact === "number") {
    const key = classifySomatotype({
      endo: roundTo(endoExact, 2),
      meso: roundTo(mesoExact, 2),
      ecto: roundTo(ectoExact, 2),
    });
    category = { status: "ok", key, label: SOMATOTYPE_CATEGORY_LABELS[key] };
    const point = somatochartPoint({ endo: endoExact, meso: mesoExact, ecto: ectoExact });
    chart = { status: "ok", x: roundTo(point.x, 2), y: roundTo(point.y, 2) };
  } else {
    const absent = (["endo", "meso", "ecto"] as const).filter(
      (c) => typeof { endo: endoExact, meso: mesoExact, ecto: ectoExact }[c] !== "number",
    );
    const note = missingDerivedNote(absent.map((c) => SOMATO_MISSING_LABEL[c]));
    category = missing(note);
    chart = missing(note);
  }

  // Salud: reuso de la HU-004.
  const diagnosis = buildAnthropometricDiagnosis({
    sex,
    ageYears,
    bodyFrame: null,
    weightKg: measures.weightKg,
    heightCm: measures.heightCm,
    waistCm: measures.waistCm,
    hipCm: measures.hipCm,
  });
  const fatDistribution: IsakValue =
    check({ keys: SKINFOLDS_6 }) ??
    ok(roundTo(fatDistributionIndex(measures as Record<(typeof SKINFOLDS_6)[number], number>), 2));

  return {
    minor,
    missingSex: sex === null,
    missingBirthDate: ageYears === null,
    measures: measureRows,
    molecular: { fatMass, fatFreeMass },
    tissues: { adipose, muscle, bone, residual },
    distribution: { adipose: adiposeDist, muscle: muscleDist },
    compositionIndices: { adiposeMuscle, muscleBone },
    adiposity: { sum6, sum8 },
    muscularity: {
      correctedArm: corrected("arm", cArm, "correctedArmCm"),
      correctedThigh: corrected("thigh", cThigh, "correctedThighCm"),
      correctedCalf: corrected("calf", cCalf, "correctedCalfCm"),
      armDifference,
    },
    proportionality: { cormic, manouvrier, relativeSpan },
    somatotype: { endo, meso, ecto, category, chart },
    health: { diagnosis, fatDistributionIndex: fatDistribution },
  };
}

// ─── Resumen, comparación y fechas ──────────────────────────────────────────

/** current − previous redondeado a `decimals`; null si alguno no está ok. */
export function isakDifference(
  current: IsakValue,
  previous: IsakValue | null | undefined,
  decimals: number,
): number | null {
  if (current.status !== "ok" || !previous || previous.status !== "ok") return null;
  return roundTo(current.value - previous.value, decimals);
}

/** Días de calendario entre dos "yyyy-MM-dd" (later − earlier). */
export function daysBetweenDayKeys(earlierDayKey: string, laterDayKey: string): number {
  const toUtc = (key: string) => {
    const [y, m, d] = key.split("-").map(Number) as [number, number, number];
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((toUtc(laterDayKey) - toUtc(earlierDayKey)) / 86_400_000);
}

/** Resumen de la tarjeta de la consulta. Cada línea es null si no tiene nada para mostrar. */
export function buildIsakSummary(
  current: IsakStudyResult,
  previous: { result: IsakStudyResult; dateLabel: string } | null,
): {
  /** "Adiposo 27,02 % · Muscular 47,49 % · Óseo 16,95 % · Residual 8,54 %". Solo las partes ok; null si ninguna (o menor). */
  tissuesLine: string | null;
  /** "Somatotipo 4,03 – 5,69 – 1,92 (Endo-mesomorfo) · IMO 2,80". Sin somatotipo completo se omite
   *  esa parte; sin IMO ok (o menor) se omite " · IMO …". null si no queda nada. */
  somatotypeLine: string | null;
  /** Para el Badge al lado de la línea 2. null si el IMO no está ok. */
  muscleBone: { key: MuscleBoneClass; label: string } | null;
  /** "Σ 6 pliegues 71,0 mm", más " (−9,5 respecto del 05/11/2025)" si el anterior tiene Σ6. null si falta Σ6. */
  sum6Line: string | null;
} {
  const t = current.tissues;
  const tissueParts: string[] = [];
  const pushTissue = (label: string, tissue: IsakTissue) => {
    if (tissue.percent.status === "ok") tissueParts.push(`${label} ${formatFixedEs(tissue.percent.value, 2)} %`);
  };
  pushTissue("Adiposo", t.adipose);
  pushTissue("Muscular", t.muscle);
  pushTissue("Óseo", t.bone);
  pushTissue("Residual", t.residual);

  const s = current.somatotype;
  const somatoParts: string[] = [];
  if (s.endo.status === "ok" && s.meso.status === "ok" && s.ecto.status === "ok" && s.category.status === "ok") {
    somatoParts.push(
      `Somatotipo ${[s.endo.value, s.meso.value, s.ecto.value].map((x) => formatFixedEs(x, 2)).join(" – ")} (${s.category.label})`,
    );
  }
  const imo = current.compositionIndices.muscleBone;
  if (imo.status === "ok") somatoParts.push(`IMO ${formatFixedEs(imo.value, 2)}`);

  let sum6Line: string | null = null;
  const sum6 = current.adiposity.sum6;
  if (sum6.status === "ok") {
    sum6Line = `Σ 6 pliegues ${formatFixedEs(sum6.value, 1)} mm`;
    if (previous) {
      const diff = isakDifference(sum6, previous.result.adiposity.sum6, 1);
      if (diff !== null) sum6Line += ` (${formatSignedFixedEs(diff, 1)} respecto del ${previous.dateLabel})`;
    }
  }

  return {
    tissuesLine: tissueParts.length > 0 ? tissueParts.join(" · ") : null,
    somatotypeLine: somatoParts.length > 0 ? somatoParts.join(" · ") : null,
    muscleBone: imo.status === "ok" ? { key: imo.classKey, label: imo.classLabel } : null,
    sum6Line,
  };
}
