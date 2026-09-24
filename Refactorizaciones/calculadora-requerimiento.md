# SDD: HU-004 `calculadora-requerimiento` (épicas 18 y 19)

HU validada: `docs/hu-calculadora-requerimiento.md`. **Su sección "Resoluciones" manda:** se
aceptan D1 a D14 tal como las recomendó el afinador. Esta SDD las baja a código.

Skills aplicados: `migracion-prisma` (sección 3) y `ui` (sección 7).

Rama: `hu-004-calculadora-requerimiento` (sale de la de HU-003, ya en la rama actual). **No se
commitea.** El orquestador hace el recorrido (sección 12).

> **Fe de erratas de la HU (técnica, no de negocio).** En el escenario "Sugerencia de peso ajustado
> en obesidad" la HU dice "Peso actual: 157,4 % del peso ideal (Devine)". La cuenta da
> 118 / 74,99212598 × 100 = **157,34985… → 157,3 %** (con el Devine redondeado, 118 / 75 = 157,33,
> también 157,3). El test y la UI usan **157,3 %**. Todos los demás números de la HU se
> comprobaron y coinciden (sección 10).

---

> **Decisión del orquestador (modo autónomo), manda sobre el resto de la SDD:** las kcal se
> muestran **con separador de miles es-AR** ("1.481 kcal"), igual que el total del PDF de la
> HU-002d. **No se crea `formatKcalEs`:** se usa `formatMacroAmount(valor, "kcal")` de
> `packages/core/src/nutrition.ts`. Donde la HU o esta SDD digan "1481 kcal", léase "1.481 kcal".
> Los tests se ajustan a eso.

## 1. Resumen funcional

El detalle de la consulta suma dos tarjetas, debajo de "Mediciones": **"Diagnóstico
antropométrico"**, que se calcula en cada render con las mediciones de la consulta (o las últimas
anteriores, nunca posteriores), y muestra IMC con clasificación OMS, riesgo por cintura, ICC por
sexo, cintura/talla, índice de conicidad, % de grasa de Deurenberg, peso ideal por 5 fórmulas, %
del peso ideal (Devine) y la sugerencia de peso ajustado (> 130 %). No se guarda. Y
**"Requerimiento"**, una calculadora TMB (4 fórmulas) → GET → VCT → macros que se recalcula al
instante en el cliente con `packages/core` y guarda **una prescripción por consulta**
(`NutritionPrescription`, modelo nuevo). La prescripción guarda una foto de los datos de entrada y
los gramos objetivo de P/G/C, que va a usar la épica 23. El servidor recalcula todo con
`packages/core` y solo confía en el "VCT indicado". Lo que se elige en la calculadora no cambia al
paciente. La lista de consultas suma el chip "Requerimiento". Una prescripción cuenta para
"consulta vacía" y "se puede eliminar". La pestaña Resumen suma la tarjeta "Requerimiento
indicado". A los menores de 18 (a la fecha de la consulta) solo se les muestra el aviso y el IMC
sin clasificar. El bot y el portal no cambian.

---

## 2. Workspaces afectados

| Workspace | ¿Se toca? | Qué |
|---|---|---|
| `packages/core` | **Sí** | `anthropometry.ts` (se amplía), `patient-formula-data.ts` (`key` y `shortLabel` en los rangos de ajuste), `consultations.ts` (prescripción en chips, vacía y borrable, texto de no borrable), **nuevos**: `formula-measurements.ts`, `anthropometric-diagnosis.ts`, `energy-requirement.ts`, cada uno con su `*.test.ts`. Exports en `src/index.ts` |
| `packages/db` | **Sí** | Modelo `NutritionPrescription` + 5 enums + back-relation en `Consultation`, 1 migración aditiva, `domain/prescriptions.ts` (nuevo), cambios en `domain/clinical.ts`, `domain/consultations.ts` y `domain/appointments.ts`, 1 script de prueba |
| `apps/web` | **Sí** | Detalle de la consulta (2 tarjetas), server actions nuevas, lista de consultas (chip), Resumen (tarjeta), `FormulaDataSheet` (prop `trigger`), `updateFormulaDataAction` (revalidación), `GET /api/appointments` |
| `apps/bot` | **No** (solo tiene que compilar) | No usa consultas ni prescripciones. Consume `@nutri-bot/db` y `@nutri-bot/core`, que cambian: `npm run typecheck` tiene que pasar en el bot |

El portal del paciente (`(portal)`) **no se toca**: no lee `NutritionPrescription`.
`tailwind.config.ts` **no se toca**: no hay colores ni tokens nuevos.

---

## 3. Esquema (Prisma) y migración: skill `migracion-prisma`

### 3.1 Cambios en `packages/db/prisma/schema.prisma`

Enums nuevos, junto a los de HU-001 (`BiologicalSex` … `BodyFrame`):

```prisma
enum BmrFormula {
  MIFFLIN_ST_JEOR
  HARRIS_BENEDICT
  KATCH_MCARDLE
  CUNNINGHAM
}

enum WeightBasis {
  ACTUAL
  ADJUSTED
}

enum BodyFatSource {
  MEASURED    // bioimpedancia (EvolutionEntry.bodyFatPercent)
  DEURENBERG  // estimado
}

enum AdjustmentRange {
  MODERATE_DEFICIT
  AGGRESSIVE_DEFICIT
  MAINTENANCE
  SURPLUS
}

enum MacroMode {
  PERCENT_OF_VCT
  PROTEIN_PER_KG
}
```

Modelo nuevo, después de `Consultation`:

```prisma
/// Prescripción energética de una consulta (HU-004). Una por consulta; editar la reemplaza.
/// Guarda una foto de los datos de entrada: los del paciente cambian, esta fila no.
/// Los kcal y gramos se guardan redondeados tal como se muestran.
model NutritionPrescription {
  id             String       @id @default(cuid())
  consultationId String       @unique
  consultation   Consultation @relation(fields: [consultationId], references: [id], onDelete: Cascade)

  // Foto de los datos de entrada
  sex                 BiologicalSex
  ageYears            Int
  heightCm            Decimal        @db.Decimal(5, 2)
  actualWeightKg      Decimal        @db.Decimal(5, 2)
  idealWeightDevineKg Decimal        @db.Decimal(5, 2)
  weightBasis         WeightBasis
  weightUsedKg        Decimal        @db.Decimal(5, 2)
  bodyFatPercent      Decimal?       @db.Decimal(4, 1)
  bodyFatSource       BodyFatSource?
  bodyFatRecordedAt   DateTime?      // solo si bodyFatSource = MEASURED

  // TMB
  bmrFormula            BmrFormula
  bmrKcal               Int
  bmrMifflinStJeorKcal  Int
  bmrHarrisBenedictKcal Int
  bmrKatchMcArdleKcal   Int?
  bmrCunninghamKcal     Int?

  // GET y VCT
  activityLevel        ActivityLevel
  activityFactor       Decimal         @db.Decimal(4, 3)
  totalExpenditureKcal Int
  nutritionGoal        NutritionGoal
  adjustmentRange      AdjustmentRange
  adjustmentPercent    Int
  calculatedVctKcal    Int
  prescribedVctKcal    Int

  // Macros (sobre prescribedVctKcal). Los gramos los usa la épica 23.
  macroMode      MacroMode
  proteinPercent Decimal   @db.Decimal(4, 1)
  fatPercent     Decimal   @db.Decimal(4, 1)
  carbPercent    Decimal   @db.Decimal(4, 1)
  proteinGPerKg  Decimal?  @db.Decimal(3, 1)  // solo si macroMode = PROTEIN_PER_KG
  proteinG       Int
  fatG           Int
  carbG          Int

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}
```

En `model Consultation` se agrega **solo** la back-relation (sin columna):

```prisma
  prescription NutritionPrescription?
```

`onDelete: Cascade`: la prescripción no existe sin su consulta. Borrar una consulta con
prescripción ya está impedido por `canDeleteConsultation` y por el filtro de
`deleteConsultation`/`setAppointmentStatus` (4.3 y 4.5). La cascada solo actúa cuando se borra el
paciente, igual que el resto de su historia clínica.

### 3.2 Migración

1. Respaldo **antes** de crear o aplicar nada (sale al scratchpad del implementer, nunca al repo):
   ```bash
   docker compose exec -T db pg_dump -U nutri -d nutribot -Fc > "$SCRATCHPAD/nutribot-pre-hu004.dump"
   ls -la "$SCRATCHPAD/nutribot-pre-hu004.dump"   # tamaño > 0
   ```
2. `(cd packages/db && npx dotenv -e ../../.env -- prisma migrate status)` → "up to date", 11
   migraciones. **Si hay drift: `blocked`** con esa salida. No resolverlo.
3. `(cd packages/db && npx dotenv -e ../../.env -- prisma migrate dev --create-only --name nutrition_prescription)`
4. Revisar `packages/db/prisma/migrations/<ts>_nutrition_prescription/migration.sql`. Tiene que
   contener **solo**:
   - 5 × `CREATE TYPE "BmrFormula" | "WeightBasis" | "BodyFatSource" | "AdjustmentRange" | "MacroMode" AS ENUM (...)`
   - `CREATE TABLE "NutritionPrescription" (...)`
   - `CREATE UNIQUE INDEX "NutritionPrescription_consultationId_key" ...`
   - `ALTER TABLE "NutritionPrescription" ADD CONSTRAINT ..._consultationId_fkey ... ON DELETE CASCADE ON UPDATE CASCADE`

   **Nada de `DROP`, `ALTER TABLE` sobre tablas existentes, `ALTER TYPE` sobre enums existentes
   ni `ALTER COLUMN`.** Las columnas `NOT NULL` están en una tabla nueva y vacía: no necesitan
   default ni backfill. Ninguna consulta existente recibe una prescripción. Si aparece otra
   cosa: parar y reportar `blocked`.
5. Aplicar: `npm run db:migrate` (raíz). Después, `npm run db:generate`.
6. Verificación de solo lectura:
   ```bash
   docker compose exec -T db psql -U nutri -d nutribot -c 'select count(*) from "NutritionPrescription";'  # 0
   docker compose exec -T db psql -U nutri -d nutribot -c 'select count(*) from "Consultation";'           # igual que antes (hoy 18)
   (cd packages/db && npx dotenv -e ../../.env -- prisma migrate status)                                  # up to date, 12
   ```

**Prohibido:** `prisma migrate reset`, aceptar el reset por drift, `prisma db push`, editar una
migración ya aplicada, y `db:seed`/`seed:demo`.

> **Para el orquestador:** después de `db:generate`, el `next dev` del usuario (puerto 3000)
> **tiene que reiniciarse** para tomar el cliente de Prisma nuevo. El implementer no lo reinicia ni
> levanta otro. Lo hace el orquestador (o se lo pide al usuario) antes del recorrido.

---

## 4. Contrato compartido

Convenciones para todo `packages/core`:
- Peso en **kg**, talla en **cm**, cintura y cadera en **cm**, edad en **años cumplidos a la fecha
  de la consulta**, % como número de 0 a 100 (29,4 % = `29.4`), energía en **kcal/día**.
- Las funciones de fórmula devuelven el valor **exacto** (sin redondear). El redondeo es solo
  para mostrar o guardar, con `roundTo` (4.1): kcal a entero, kg y % a 1 decimal, índices a 2.
- **Las clasificaciones usan el valor ya redondeado a lo que se muestra** (IMC 1 decimal; ICC,
  cintura/talla y conicidad 2 decimales). Así, un IMC que se muestra "25,0" siempre dice
  "Sobrepeso". La cintura se clasifica con el valor medido (cm, tal cual).
- Núcleo sin Prisma: los valores de los enums de core coinciden con los de Prisma. La alineación
  la controla el `typecheck` de `apps/web` y `packages/db`.

### 4.1 `packages/core/src/anthropometry.ts` (se amplía; `computeBmi` y `computeWaistHipRatio` no cambian)

```ts
import type { BodyFrame, Sex } from "./patient-formula-data";

/** Math.round(value * 10^d) / 10^d. */
export function roundTo(value: number, decimals: number): number;

/** IMC exacto, sin redondear: peso(kg) / (talla(cm)/100)². Para Deurenberg y clasificar. */
export function bmiExact(weightKg: number, heightCm: number): number;

// ── IMC (OMS) ──
export type BmiClass = "UNDERWEIGHT" | "NORMAL" | "OVERWEIGHT" | "OBESITY_I" | "OBESITY_II" | "OBESITY_III";
export const BMI_CLASS_LABELS: Record<BmiClass, string>;
// "Bajo peso", "Normal", "Sobrepeso", "Obesidad grado I", "Obesidad grado II", "Obesidad grado III"
export const BMI_HEALTHY_RANGE_TEXT = "18,5–24,9";
/** `bmi` redondeado a 1 decimal. < 18.5, < 25, < 30, < 35, < 40, resto. */
export function classifyBmi(bmi: number): BmiClass;

// ── Cintura (riesgo cardiometabólico) ──
export type WaistRisk = "NO_RISK" | "ELEVATED" | "VERY_ELEVATED";
export const WAIST_RISK_LABELS: Record<WaistRisk, string>;
// "Sin riesgo aumentado", "Riesgo elevado", "Riesgo muy elevado"
export const WAIST_RISK_THRESHOLDS_CM: Record<Sex, { elevated: number; veryElevated: number }>;
// MALE { 94, 102 }, FEMALE { 80, 88 }. Comparación >=.
export function classifyWaist(sex: Sex, waistCm: number): WaistRisk;

// ── ICC (D3: umbrales OMS por sexo) ──
export type WaistHipRisk = "NO_RISK" | "INCREASED";
export const WAIST_HIP_RISK_LABELS: Record<WaistHipRisk, string>;   // "Sin riesgo aumentado", "Riesgo aumentado"
export const WAIST_HIP_RISK_THRESHOLD: Record<Sex, number>;         // MALE 0.90, FEMALE 0.85. Comparación > (estricto).
/** `ratio` redondeado a 2 decimales. */
export function classifyWaistHipRatio(sex: Sex, ratio: number): WaistHipRisk;
/** "riesgo aumentado > 0,85 en mujeres" / "riesgo aumentado > 0,9 en hombres" (formatDecimalEs). */
export function waistHipThresholdText(sex: Sex): string;

// ── Índices de salud (D6, rangos de ISAKMetry) ──
export type HealthyRangeClass = "HEALTHY" | "OUT_OF_RANGE";
export const HEALTHY_RANGE_LABELS: Record<HealthyRangeClass, string>; // "En rango saludable", "Fuera del rango saludable"
export const WAIST_TO_HEIGHT_HEALTHY_MAX = 0.5;   // saludable si < 0,50 (texto "<0,50")
export const CONICITY_HEALTHY_MAX = 1.4;          // saludable si < 1,40 (texto "<1,4")
/** cintura(cm) / talla(cm), exacto. */
export function waistToHeightRatio(waistCm: number, heightCm: number): number;
/** (cintura(cm)/100) / (0.109 × √(peso(kg) / (talla(cm)/100))), exacto. */
export function conicityIndex(waistCm: number, weightKg: number, heightCm: number): number;
/** value redondeado a 2 decimales; HEALTHY si value < max. */
export function classifyHealthyBelow(value: number, max: number): HealthyRangeClass;

// ── % de grasa estimado ──
/** Deurenberg: 1.20·IMC + 0.23·edad − 10.8·(MALE ? 1 : 0) − 5.4. `bmi` exacto (bmiExact). */
export function deurenbergBodyFatPercent(p: { bmi: number; ageYears: number; sex: Sex }): number;

// ── Peso ideal (kg, exacto) ──
export type IdealWeightFormula = "DEVINE" | "HAMWI" | "BROCA" | "BROCA_BRUGSCH" | "LORENTZ";
export const IDEAL_WEIGHT_FORMULA_LABELS: Record<IdealWeightFormula, string>;
// "Devine", "Hamwi", "Broca", "Broca-Brugsch", "Lorentz"
/** MALE 50 / FEMALE 45.5 + 2.3 × (talla − 152.4) / 2.54 */
export function devineIdealWeightKg(sex: Sex, heightCm: number): number;
/** MALE 48 + 2.7 × (talla/2.54 − 60) / FEMALE 45.5 + 2.2 × (talla/2.54 − 60), × (1 + hamwiAdjustmentPercent/100)
 *  de BODY_FRAMES (Pequeña −10, Mediana 0, Grande +10). Sin duplicar la constante. */
export function hamwiIdealWeightKg(sex: Sex, heightCm: number, bodyFrame: BodyFrame): number;
/** talla − 100 */
export function brocaIdealWeightKg(heightCm: number): number;
/** (talla − 100) × (MALE 0.90 / FEMALE 0.85) */
export function brocaBrugschIdealWeightKg(sex: Sex, heightCm: number): number;
/** (talla − 100) − (talla − 150) / (MALE 4 / FEMALE 2.5) */
export function lorentzIdealWeightKg(sex: Sex, heightCm: number): number;

// ── Peso ajustado (D2) ──
export const ADJUSTED_WEIGHT_THRESHOLD_PERCENT = 130;
/** ideal + 0.25 × (actual − ideal) */
export function adjustedWeightKg(actualKg: number, idealKg: number): number;
/** actual / ideal × 100 */
export function percentOfIdealWeight(actualKg: number, idealKg: number): number;
/** true si roundTo(percentOfIdealWeight, 1) > ADJUSTED_WEIGHT_THRESHOLD_PERCENT (estricto). */
export function shouldSuggestAdjustedWeight(actualKg: number, idealKg: number): boolean;
```

### 4.2 `packages/core/src/patient-formula-data.ts` (cambio aditivo)

```ts
export const ADJUSTMENT_RANGE_VALUES = ["MODERATE_DEFICIT", "AGGRESSIVE_DEFICIT", "MAINTENANCE", "SURPLUS"] as const;
export type AdjustmentRangeKey = (typeof ADJUSTMENT_RANGE_VALUES)[number];

export interface GoalAdjustmentRange {
  key: AdjustmentRangeKey;   // NUEVO
  label: string;             // sin cambios ("Déficit agresivo (con supervisión)")
  shortLabel: string;        // NUEVO: "Déficit moderado" | "Déficit agresivo" | "Mantenimiento" | "Superávit"
  minPercent: number;
  maxPercent: number;
}
```

`NUTRITION_GOALS`: LOSE_WEIGHT → `[MODERATE_DEFICIT (−25/−15), AGGRESSIVE_DEFICIT (−30/−25)]`;
MAINTAIN → `[MAINTENANCE (0/0)]`; GAIN_WEIGHT y GAIN_MUSCLE → `[SURPLUS (10/20)]`. Los números no
cambian. Se agrega:

```ts
/** Rango del objetivo con esa key, o null si no le corresponde (p. ej. SURPLUS en LOSE_WEIGHT). */
export function goalAdjustmentRange(goal: NutritionGoal, key: AdjustmentRangeKey): GoalAdjustmentRange | null;

/** −20 → "−20 %" (U+2212), 15 → "+15 %", 0 → "0 %". */
export function formatSignedPercentEs(value: number): string;
/** −119 → "−119" (U+2212), 50 → "+50", 0 → "0". Enteros, sin separador de miles. */
export function formatSignedIntEs(value: number): string;
/** 1481.15 → "1481". Math.round, es-AR sin separador de miles (useGrouping: false). */
export function formatKcalEs(value: number): string;
```

> **Por qué `formatKcalEs`:** `Intl.NumberFormat("es-AR")` en Node da "1.481", y la HU pide
> "1481 kcal". Todas las kcal de la HU (TMB, GET, VCT, macros, diferencias) se muestran con
> `formatKcalEs`/`formatSignedIntEs`, **no** con `Quantity` ni `formatDecimalEs`.

### 4.3 `packages/core/src/consultations.ts` (cambia la firma: suma `hasPrescription`)

```ts
export type ConsultationChip = "Antropometría" | "Bioimpedancia" | "Requerimiento" | "Plan" | "Notas";
// Orden fijo: Antropometría, Bioimpedancia, Requerimiento, Plan, Notas.

export function consultationChips(input: {
  measurements: MeasurementValues[];
  hasPrescription: boolean;   // NUEVO
  hasPlan: boolean;
  notes: string | null;
}): ConsultationChip[];

/** Vacía: sin mediciones, sin prescripción, sin plan y sin notas (trim). */
export function isConsultationEmpty(input: {
  measurementCount: number;
  hasPrescription: boolean;   // NUEVO
  hasPlan: boolean;
  notes: string | null;
}): boolean;

/** Borrable a mano: sin mediciones, sin prescripción y sin plan. */
export function canDeleteConsultation(input: {
  measurementCount: number;
  hasPrescription: boolean;   // NUEVO
  hasPlan: boolean;
}): boolean;

CONSULTATION_TEXT.notDeletable =
  "Para eliminar la consulta primero borrá sus mediciones, la prescripción y quitá el plan indicado";
```

Consumidores que hay que ajustar (todos): `packages/db/domain/consultations.ts`
(`deleteConsultation`), `packages/db/domain/appointments.ts` (`setAppointmentStatus`),
`apps/web/src/app/api/appointments/route.ts`, `apps/web/.../pacientes/[id]/page.tsx` (chips),
`apps/web/.../consultas/[consultationId]/page.tsx` (`canDelete`), `consultations.test.ts`.

### 4.4 `packages/core/src/formula-measurements.ts` (nuevo): D4, qué medición usa cada dato

```ts
export const FORMULA_MEASURE_KEYS = [
  "weightKg", "heightCm", "waistCm", "hipCm", "bodyFatPercent", "basalMetabolicRateKcal",
] as const;
export type FormulaMeasureKey = (typeof FORMULA_MEASURE_KEYS)[number];

export type FormulaMeasurementEntry = {
  consultationId: string | null;
  recordedAt: Date;
  createdAt: Date;
} & Record<FormulaMeasureKey, number | null>;

export interface SourcedMeasurement {
  value: number;
  recordedAt: Date;
  consultationId: string | null;
}
export type FormulaMeasurements = Record<FormulaMeasureKey, SourcedMeasurement | null>;

/**
 * Para cada clave, el primer valor no nulo en este orden:
 *   1) entradas con consultationId === `consultationId` (si no es null), por createdAt desc;
 *   2) el resto, por recordedAt desc y después createdAt desc.
 * No filtra por fecha: quien llama ya pasó solo las entradas con recordedAt < tope (4.7).
 */
export function pickFormulaMeasurements(
  entries: readonly FormulaMeasurementEntry[],
  consultationId: string | null,
): FormulaMeasurements;
```

### 4.5 `packages/core/src/anthropometric-diagnosis.ts` (nuevo)

```ts
import type { BodyFrame, Sex } from "./patient-formula-data";

export interface DiagnosisInput {
  sex: Sex | null;
  ageYears: number | null;      // a la fecha de la consulta; null = sin fecha de nacimiento
  bodyFrame: BodyFrame | null;  // null → Mediana asumida (effectiveBodyFrame)
  weightKg: number | null;
  heightCm: number | null;
  waistCm: number | null;
  hipCm: number | null;
}

/** Fila de un indicador. `value` ya redondeado a lo que se muestra. */
export type DiagnosisRow<K extends string> =
  | { status: "classified"; value: number; classKey: K; classLabel: string }
  | { status: "unclassified"; value: number; note: string | null }   // p. ej. note "Falta sexo"
  | { status: "missing"; note: string };                             // p. ej. "Sin dato (falta cadera)"

export interface IdealWeightRow {
  formula: IdealWeightFormula;
  label: string;          // "Devine" | "Hamwi (contextura Mediana, asumida)" | "Hamwi (contextura Pequeña)" | "Broca" | ...
  valueKg: number | null; // redondeado a 1 decimal; null si falta sexo
  note: string | null;    // "Falta sexo" cuando valueKg es null
}

export interface AnthropometricDiagnosis {
  minor: boolean;                                   // isMinor(ageYears)
  /** true si faltan peso y talla a la vez: la UI muestra solo el texto de vacío. */
  noMeasurements: boolean;
  bmi: DiagnosisRow<BmiClass>;                      // menor → "unclassified" con note null
  // Todo lo que sigue es null si minor:
  waist: DiagnosisRow<WaistRisk> | null;
  waistHipRatio: (DiagnosisRow<WaistHipRisk> & { thresholdText: string | null }) | null;
  waistToHeight: DiagnosisRow<HealthyRangeClass> | null;
  conicity: DiagnosisRow<HealthyRangeClass> | null;
  estimatedBodyFat: { status: "ok"; value: number } | { status: "missing"; note: string } | null;
  idealWeights: IdealWeightRow[] | null;            // 5 filas en el orden Devine, Hamwi, Broca, Broca-Brugsch, Lorentz; null si falta talla
  /** % del peso ideal de Devine (1 decimal). null si falta peso, talla o sexo. */
  percentOfIdealDevine: number | null;
  /** Aviso de peso ajustado. null si no corresponde. */
  adjustedWeightSuggestion: { adjustedKg: number /* 1 decimal */; thresholdPercent: number } | null;
}

export function buildAnthropometricDiagnosis(input: DiagnosisInput): AnthropometricDiagnosis;

/** Textos exactos de faltantes. */
export const DIAGNOSIS_TEXT = {
  missingWeight: "Sin dato (falta peso)",
  missingHeight: "Sin dato (falta talla)",
  missingWaist: "Sin dato (falta cintura)",
  missingHip: "Sin dato (falta cadera)",
  missingSex: "Falta sexo",
  missingBirthDate: "Falta fecha de nacimiento",
  noMeasurements: "Cargá peso y talla en Mediciones para ver el diagnóstico.",
  adjustedWeightAlert: (adjustedKg: number) =>
    `El peso actual supera el 130 % del peso ideal. Se sugiere calcular con peso ajustado: ${formatDecimalEs(adjustedKg, 1)} kg.`,
  percentOfIdeal: (percent: number) => `Peso actual: ${formatDecimalEs(percent, 1)} % del peso ideal (Devine)`,
} as const;
```

Reglas de cada fila (en este orden de prioridad del `note`):
- **IMC**: falta peso → `missing` "Sin dato (falta peso)"; falta talla → "Sin dato (falta talla)".
  Si no, `value = roundTo(bmiExact, 1)`; menor → `unclassified` (note null); si no, `classified`
  con `classifyBmi(value)`. El IMC **no** necesita sexo.
- **Cintura**: falta cintura → `missing`; falta sexo → `unclassified` "Falta sexo"; si no,
  `classified`. `value` = cintura en cm tal cual.
- **ICC**: falta cintura → "Sin dato (falta cintura)"; falta cadera → "Sin dato (falta cadera)";
  falta sexo → `unclassified` "Falta sexo"; si no, `classified` con
  `computeWaistHipRatio` (2 decimales) y `thresholdText = waistHipThresholdText(sex)`.
- **Cintura/talla** y **conicidad**: no necesitan sexo. Falta cintura/talla (y peso, para
  conicidad) → `missing` con la primera que falte (cintura, peso, talla); si no, `classified`.
- **Deurenberg**: falta peso o talla → `missing` con ese texto; falta sexo → "Falta sexo"; falta
  edad → "Falta fecha de nacimiento"; si no, `ok` con `roundTo(deurenberg(bmiExact), 1)`.
- **Peso ideal**: falta talla → `idealWeights = null`. Broca siempre tiene valor. Devine, Hamwi,
  Broca-Brugsch y Lorentz sin sexo → `valueKg null`, note "Falta sexo". Hamwi con
  `effectiveBodyFrame(bodyFrame)`: label "Hamwi (contextura Mediana, asumida)" si `bodyFrame` es
  null; si no, "Hamwi (contextura Pequeña|Mediana|Grande)".
- **% del ideal y peso ajustado**: con Devine. `adjustedWeightSuggestion` solo si
  `shouldSuggestAdjustedWeight`.

### 4.6 `packages/core/src/energy-requirement.ts` (nuevo): la calculadora

```ts
import type { ActivityLevel, AdjustmentRangeKey, NutritionGoal, Sex } from "./patient-formula-data";

// ── TMB (kcal/día, exactas) ──
export const BMR_FORMULA_VALUES = ["MIFFLIN_ST_JEOR", "HARRIS_BENEDICT", "KATCH_MCARDLE", "CUNNINGHAM"] as const;
export type BmrFormula = (typeof BMR_FORMULA_VALUES)[number];
export const BMR_FORMULAS: ReadonlyArray<{ value: BmrFormula; label: string; needsBodyFat: boolean }>;
// "Mifflin-St Jeor" false, "Harris-Benedict" false, "Katch-McArdle" true, "Cunningham" true
export const DEFAULT_BMR_FORMULA: BmrFormula = "MIFFLIN_ST_JEOR";

export interface BmrPersonInput { sex: Sex; weightKg: number; heightCm: number; ageYears: number }
/** 10·peso + 6.25·talla − 5·edad + (MALE 5 / FEMALE −161) */
export function mifflinStJeorBmr(p: BmrPersonInput): number;
/** MALE 88.362 + 13.397·peso + 4.799·talla − 5.677·edad / FEMALE 447.593 + 9.247·peso + 3.098·talla − 4.330·edad */
export function harrisBenedictBmr(p: BmrPersonInput): number;
/** peso × (1 − %grasa/100) */
export function leanBodyMassKg(weightKg: number, bodyFatPercent: number): number;
/** 370 + 21.6 × masa magra */
export function katchMcArdleBmr(leanMassKg: number): number;
/** 500 + 22 × masa magra */
export function cunninghamBmr(leanMassKg: number): number;

/** TMB × factor */
export function totalEnergyExpenditure(bmrKcal: number, activityFactor: number): number;
/** GET × (1 + ajuste/100) */
export function applyGoalAdjustment(totalExpenditureKcal: number, adjustmentPercent: number): number;

// ── Ajuste por objetivo (D9) ──
/** Punto medio redondeado "hacia afuera": sign × Math.round(|(min+max)/2|).
 *  MODERATE_DEFICIT −20, AGGRESSIVE_DEFICIT −28, MAINTENANCE 0, SURPLUS 15. */
export function defaultAdjustmentPercent(range: GoalAdjustmentRange): number;
/** "Déficit moderado (−15 a −25 %)", "Déficit agresivo (−25 a −30 %)", "Superávit (+10 a +20 %)",
 *  "Mantenimiento (0 %)". Los extremos van del más cercano a 0 al más lejano. */
export function adjustmentRangeOptionLabel(range: GoalAdjustmentRange): string;

// ── Macros ──
export const KCAL_PER_GRAM = { protein: 4, fat: 9, carb: 4 } as const;
export const MACRO_REFERENCE = {
  proteinPercent: { min: 15, max: 25 },
  fatPercent: { min: 20, max: 35 },
  carbPercent: { min: 45, max: 60 },
  proteinGPerKg: { min: 1.2, max: 2.2 },
} as const;
export const MACRO_INPUT_BOUNDS = { percent: { min: 0, max: 100 }, proteinGPerKg: { min: 0.5, max: 4 } } as const;
export const PRESCRIBED_VCT_BOUNDS = { min: 800, max: 6000 } as const;
export const DEFAULT_MACRO_PERCENTS = { proteinPercent: 20, fatPercent: 30, carbPercent: 50 } as const;
export const DEFAULT_PROTEIN_G_PER_KG = 1.6;   // arranque en GAIN_MUSCLE (D9)

export type MacroMode = "PERCENT_OF_VCT" | "PROTEIN_PER_KG";
export type MacroChoices =
  | { mode: "PERCENT_OF_VCT"; proteinPercent: number; fatPercent: number; carbPercent: number }
  | { mode: "PROTEIN_PER_KG"; proteinGPerKg: number; fatPercent: number };

export type MacroKey = "protein" | "fat" | "carb";
export interface MacroLine {
  key: MacroKey;
  label: "Proteínas" | "Grasas" | "Carbohidratos";
  percent: number;      // exactos
  kcal: number;
  grams: number;
  gramsPerKg: number;   // sobre `weightKg` (el peso usado en las fórmulas, D12)
}
export interface MacroBreakdown {
  lines: [MacroLine, MacroLine, MacroLine];   // P, G, C
  percentSum: number;                         // exacto; en g/kg es 100 salvo carbohidratos negativos
  errors: string[];                           // bloqueantes (REQUIREMENT_TEXT)
  warnings: string[];                         // fuera de referencia, no bloquean
}
/**
 * % del VCT: kcal = VCT × %/100; g = kcal / kcal-por-gramo.
 * g/kg: proteína g = g/kg × weightKg, kcal = g × 4; grasas kcal = VCT × %/100;
 *       carbohidratos kcal = VCT − proteína − grasas; los % se derivan (kcal / VCT × 100).
 * Warnings: en % del VCT, cada macro con roundTo(percent, 1) fuera de MACRO_REFERENCE (bordes incluidos);
 *           en g/kg, la proteína se compara por g/kg (1,2–2,2) y no por %; grasas y carbohidratos por %.
 */
export function computeMacros(p: { prescribedVctKcal: number; weightKg: number; macros: MacroChoices }): MacroBreakdown;

// ── Calculadora completa ──
export type WeightBasis = "ACTUAL" | "ADJUSTED";
export type BodyFatSource = "MEASURED" | "DEURENBERG";

/** Datos de entrada que no elige la profesional (salen del paciente y de las mediciones, D4). Adulto. */
export interface RequirementContext {
  sex: Sex;
  ageYears: number;
  heightCm: number;
  actualWeightKg: number;
  measuredBodyFatPercent: number | null;
}

/** Lo que elige en la calculadora. Los null son "todavía no eligió" (bloquean guardar). */
export interface RequirementDraft {
  bmrFormula: BmrFormula;
  weightBasis: WeightBasis;
  bodyFatSource: BodyFatSource | null;
  activityLevel: ActivityLevel | null;
  nutritionGoal: NutritionGoal | null;
  adjustmentRange: AdjustmentRangeKey | null;
  adjustmentPercent: number | null;
  prescribedVctKcal: number | null;
  macros: MacroChoices;
}
/** Igual que el draft, sin null salvo bodyFatSource. Es lo que valida zod en el servidor. */
export type PrescriptionChoices = Omit<RequirementDraft,
  "activityLevel" | "nutritionGoal" | "adjustmentRange" | "adjustmentPercent" | "prescribedVctKcal"> & {
  activityLevel: ActivityLevel;
  nutritionGoal: NutritionGoal;
  adjustmentRange: AdjustmentRangeKey;
  adjustmentPercent: number;
  prescribedVctKcal: number;
};

export interface RequirementCalculation {
  idealWeightDevineKg: number;           // exactos, todos
  adjustedWeightKg: number;
  suggestAdjustedWeight: boolean;
  weightUsedKg: number;                  // actual o ajustado según weightBasis
  bodyFatPercent: number | null;         // el de bodyFatSource: medido, Deurenberg o null
  deurenbergBodyFatPercent: number;      // siempre (el botón "Usar el estimado" lo muestra)
  bmrByFormula: Record<BmrFormula, number | null>;   // Mifflin/HB con weightUsedKg; Katch/Cunningham con la masa magra del PESO ACTUAL
  bmrKcal: number | null;                // de la elegida
  activityFactor: number | null;
  totalExpenditureKcal: number | null;
  calculatedVctKcal: number | null;
  macros: MacroBreakdown | null;         // null si prescribedVctKcal es null
  errors: string[];                      // todos los bloqueantes, textos de REQUIREMENT_TEXT
  warnings: string[];                    // = macros?.warnings ?? []
}
export function calculateRequirement(ctx: RequirementContext, draft: RequirementDraft): RequirementCalculation;

/** Valores tal como se guardan (redondeados). Nombres = columnas de NutritionPrescription. */
export interface PrescriptionSnapshot {
  sex: Sex; ageYears: number; heightCm: number; actualWeightKg: number;
  idealWeightDevineKg: number;        // roundTo 2
  weightBasis: WeightBasis;
  weightUsedKg: number;               // roundTo 2
  bodyFatPercent: number | null;      // roundTo 1
  bodyFatSource: BodyFatSource | null;
  bmrFormula: BmrFormula;
  bmrKcal: number;                    // Math.round
  bmrMifflinStJeorKcal: number; bmrHarrisBenedictKcal: number;
  bmrKatchMcArdleKcal: number | null; bmrCunninghamKcal: number | null;
  activityLevel: ActivityLevel; activityFactor: number; totalExpenditureKcal: number;
  nutritionGoal: NutritionGoal; adjustmentRange: AdjustmentRangeKey; adjustmentPercent: number;
  calculatedVctKcal: number; prescribedVctKcal: number;
  macroMode: MacroMode;
  proteinPercent: number; fatPercent: number; carbPercent: number;   // roundTo 1 (en % del VCT, los ingresados)
  proteinGPerKg: number | null;
  proteinG: number; fatG: number; carbG: number;                     // Math.round
}
/** calculateRequirement + errores → { ok: false, errors }. */
export function buildPrescriptionSnapshot(ctx: RequirementContext, choices: PrescriptionChoices):
  | { ok: true; snapshot: PrescriptionSnapshot }
  | { ok: false; errors: string[] };

// ── Valores iniciales de la calculadora (D1, D9, D12) ──
export interface ReferencePrescription {   // lo mínimo de la prescripción anterior del paciente
  bmrFormula: BmrFormula;
  adjustmentRange: AdjustmentRangeKey;
  adjustmentPercent: number;
  macroMode: MacroMode;
  proteinPercent: number; fatPercent: number; carbPercent: number;
  proteinGPerKg: number | null;
}
/**
 * - bmrFormula: la de `reference` (D1); si necesita % de grasa y no hay medido, Mifflin.
 * - weightBasis: ADJUSTED si suggestAdjustedWeight, si no ACTUAL.
 * - bodyFatSource: MEASURED si hay % medido, si no null.
 * - activityLevel / nutritionGoal: los del paciente (pueden ser null, D10).
 * - adjustmentRange: si el objetivo tiene un solo rango, ese; si tiene varios (bajar) y la
 *   referencia usó uno de ellos, ese; si no, el primero (MODERATE_DEFICIT). null si no hay objetivo.
 * - adjustmentPercent: el de la referencia si el rango coincide; si no defaultAdjustmentPercent.
 * - prescribedVctKcal: null (la UI lo iguala al calculado redondeado mientras no lo toquen, 7.3).
 * - macros: los de la referencia; si no hay, GAIN_MUSCLE → { PROTEIN_PER_KG, 1.6, fat 30 };
 *   el resto → { PERCENT_OF_VCT, 20/30/50 }.
 */
export function initialRequirementDraft(p: {
  ctx: RequirementContext;
  patientActivityLevel: ActivityLevel | null;
  patientNutritionGoal: NutritionGoal | null;
  reference: ReferencePrescription | null;
}): RequirementDraft;

/** Borrador desde una prescripción guardada ("Editar"). bodyFatSource MEASURED sin medido hoy → null. */
export function draftFromPrescription(p: PrescriptionSnapshot, ctx: RequirementContext): RequirementDraft;

/** Bloqueantes para el requerimiento: getMissingFormulaData filtrado a sex, birthDate, weight, height
 *  (actividad y objetivo NO bloquean: se eligen en la calculadora). */
export function getRequirementBlockingMissing(input: FormulaDataPresence): MissingFormulaDataItem[];

// ── Textos exactos ──
export const REQUIREMENT_TEXT = {
  activityMissing: "Elegí el nivel de actividad",
  goalMissing: "Elegí el objetivo",
  rangeMissing: "Elegí el tipo de ajuste",
  adjustmentMissing: "Ingresá el ajuste",
  adjustmentNotInteger: "El ajuste tiene que ser un número entero",
  /** "El ajuste para déficit moderado va de −15 % a −25 %" (shortLabel en minúscula inicial; extremos de cerca de 0 a lejos) */
  adjustmentOutOfRange: (range: GoalAdjustmentRange) => string,
  bodyFatNeeded: "La fórmula elegida necesita el % de grasa",
  vctMissing: "Ingresá el VCT indicado",
  vctOutOfRange: "El VCT indicado va de 800 a 6000 kcal",
  vctNotInteger: "El VCT indicado tiene que ser un número entero",
  percentOutOfBounds: "Cada porcentaje va de 0 a 100 %",
  percentDecimals: "Los porcentajes admiten un decimal",
  /** "Los porcentajes suman 95 %; tienen que sumar 100 %" (suma con roundTo 1 y formatDecimalEs) */
  percentSum: (sum: number) => string,
  proteinGPerKgOutOfBounds: "La proteína va de 0,5 a 4 g/kg",
  negativeCarbs: "Proteínas y grasas superan el VCT indicado: los carbohidratos quedan en negativo",
  /** "Carbohidratos 41,3 %: fuera del rango de referencia (45–60 %)" */
  macroPercentWarning: (label: string, percent: number, min: number, max: number) => string,
  /** "Proteínas 2,5 g/kg: fuera del rango de referencia (1,2–2,2 g/kg)" */
  proteinGPerKgWarning: (gPerKg: number) => string,
  saved: "Prescripción guardada",
  deleted: "Prescripción borrada",
  invalid: "Datos inválidos",
  emptyInConsultation: "Todavía no hay un requerimiento indicado en esta consulta.",
  emptyInSummary: "Todavía no hay un requerimiento indicado. Se calcula en una consulta.",
  noBodyFat: "Sin % de grasa medido",
  deleteConfirmTitle: "¿Borrar la prescripción de esta consulta?",
  deleteConfirmDescription: "No se puede deshacer.",
} as const;

// ── Textos de resumen (tarjetas "Requerimiento" y "Requerimiento indicado") ──
/** "VCT 1481 kcal · P 74 g · G 49 g · C 185 g" */
export function prescriptionHeadline(p: Pick<PrescriptionSnapshot, "prescribedVctKcal" | "proteinG" | "fatG" | "carbG">): string;
/** "Mifflin-St Jeor · TMB 1347 kcal · Ligero ×1,375 · GET 1851 kcal · Déficit moderado −20 %"
 *  (con MAINTENANCE el último tramo es "Mantenimiento", sin %). */
export function prescriptionFormulaLine(p: PrescriptionSnapshot): string;
/** "Peso usado: 66,5 kg (actual)" | "Peso usado: 85,7 kg (ajustado; ideal Devine 75,0 kg)" (kg con 1 decimal fijo). */
export function prescriptionWeightLine(p: PrescriptionSnapshot): string;
/** Diferencia del VCT indicado con la prescripción anterior:
 *  "−119 kcal respecto del 12/08/2026" | "+50 kcal respecto del …" | "Igual que el 12/08/2026". */
export function prescriptionDiffText(currentKcal: number, previousKcal: number, previousDateLabel: string): string;
```

Reglas de `calculateRequirement` (el orden de `errors` es este):
1. `idealWeightDevineKg`, `adjustedWeightKg`, `suggestAdjustedWeight` (4.1) con `actualWeightKg`.
2. `weightUsedKg` = actual o ajustado.
3. `bodyFatPercent`: MEASURED → `measuredBodyFatPercent` (null si no hay); DEURENBERG →
   `deurenbergBodyFatPercent({ bmi: bmiExact(actual, talla), ageYears, sex })`; null → null.
4. `bmrByFormula`: Mifflin y Harris-Benedict con `weightUsedKg`; Katch-McArdle y Cunningham con
   `leanBodyMassKg(actualWeightKg, bodyFatPercent)` (**siempre peso actual**, HU); null si no hay
   `bodyFatPercent`. Si la elegida da null → error `bodyFatNeeded`.
5. Actividad null → `activityMissing`. Objetivo null → `goalMissing`. Rango null o que no es del
   objetivo (`goalAdjustmentRange`) → `rangeMissing`. Ajuste null → `adjustmentMissing`; no entero →
   `adjustmentNotInteger`; fuera de `[minPercent, maxPercent]` (bordes incluidos) →
   `adjustmentOutOfRange(range)`. Con MAINTENANCE el ajuste tiene que ser 0.
6. GET = TMB × factor; VCT calculado = GET × (1 + ajuste/100), con los valores exactos.
7. VCT indicado null → `vctMissing`; no entero → `vctNotInteger`; fuera de 800–6000 → `vctOutOfRange`.
8. Si hay VCT indicado: `computeMacros` sobre él con `weightUsedKg`, y se suman sus `errors`.
   Primero los límites de cada input (`percentOutOfBounds`, `percentDecimals`,
   `proteinGPerKgOutOfBounds`), después `percentSum` (% del VCT, si `roundTo(sum, 1) !== 100`) o
   `negativeCarbs` (g/kg, si kcal de carbohidratos < 0).

### 4.7 `packages/db/domain/clinical.ts` (cambia)

```ts
import type { FormulaMeasurements } from "@nutri-bot/core";

/**
 * D4. Entradas del paciente con recordedAt < `until` (o todas si until es null), elegidas con
 * pickFormulaMeasurements(entries, consultationId). Un solo findMany (select de las 6 medidas +
 * consultationId, recordedAt, createdAt), Decimal → number.
 */
export async function getFormulaMeasurementsAsOf(params: {
  patientId: string;
  consultationId: string | null;
  until: Date | null;
}): Promise<FormulaMeasurements>;
```

`getLatestFormulaMeasurements(patientId)` **conserva su firma y su tipo de retorno**
(`LatestFormulaMeasurements`), y pasa a delegar en
`getFormulaMeasurementsAsOf({ patientId, consultationId: null, until: null })`, mapeando
`weightKg`, `heightCm` y `bodyFatPercent` a `{ value, recordedAt }`. La consumen web (Resumen, IA,
asistente). El bot no.

Tope de una consulta: `until = dayRangeUtc(dayKeyInTz(consultation.consultedAt, tz), tz).end`
(inicio del día siguiente en la zona de la profesional). Así entran las del mismo día y nunca las
posteriores.

### 4.8 `packages/db/domain/prescriptions.ts` (nuevo), exportado en `domain/index.ts`

```ts
import type { NutritionPrescription } from "../index";
import type { PrescriptionChoices, ReferencePrescription, RequirementContext, SourcedMeasurement } from "@nutri-bot/core";

export class InvalidPrescriptionError extends Error {
  constructor(public readonly reasons: string[]) { super(REQUIREMENT_TEXT.invalid); this.name = "InvalidPrescriptionError"; }
}

/** Contexto de la calculadora para una consulta: paciente, edad a la fecha, mediciones D4.
 *  `ctx` es null si falta algo bloqueante (sexo, fecha de nacimiento, peso, talla) o si es menor. */
export async function getRequirementContextForConsultation(consultationId: string): Promise<{
  ctx: RequirementContext | null;
  ageYears: number | null;
  measurements: FormulaMeasurements;
  patient: Pick<Patient, "id" | "sex" | "birthDate" | "activityLevel" | "nutritionGoal" | "bodyFrame">;
  consultedAt: Date;
}>;

/** Prescripción anterior de referencia (D1, D9, D12): la de la consulta del paciente con
 *  consultedAt más reciente que sea <= la de esta consulta, excluyendo esta; desempate
 *  createdAt desc de la consulta. null si no hay. Decimal → number. */
export async function getReferencePrescription(params: {
  patientId: string;
  consultationId: string;
  consultedAt: Date;
}): Promise<ReferencePrescription | null>;

/**
 * Crea o reemplaza (upsert por consultationId) la prescripción. Recalcula todo con
 * buildPrescriptionSnapshot usando getRequirementContextForConsultation; del cliente solo toma
 * `choices`. Tira InvalidPrescriptionError si ctx es null o si el snapshot tiene errores.
 * bodyFatRecordedAt = measurements.bodyFatPercent.recordedAt si bodyFatSource = MEASURED, si no null.
 * No toca Patient (D10).
 */
export async function saveConsultationPrescription(params: {
  consultationId: string;
  choices: PrescriptionChoices;
}): Promise<NutritionPrescription>;

/** Borra la prescripción de la consulta (deleteMany por consultationId). Idempotente. */
export async function deleteConsultationPrescription(consultationId: string): Promise<void>;

/** Las `take` prescripciones más recientes del paciente, por consultation.consultedAt desc y
 *  consultation.createdAt desc, con { consultation: { id, consultedAt } }. Resumen usa take: 2. */
export async function listLatestPrescriptions(
  patientId: string,
  take: number,
): Promise<Array<NutritionPrescription & { consultation: { id: string; consultedAt: Date } }>>;

/** NutritionPrescription (Decimal) → PrescriptionSnapshot (number). Lo usan web y los tests. */
export function toPrescriptionSnapshot(p: NutritionPrescription): PrescriptionSnapshot;
```

Consumidor: **solo web**. El bot no lo importa.

### 4.9 `packages/db/domain/consultations.ts` (cambia)

- `consultationInclude` suma `prescription: true`, y `ConsultationWithRelations` suma
  `prescription: NutritionPrescription | null`. Lo reciben `listPatientConsultations` y
  `getConsultation` (solo web).
- `deleteConsultation`: el `select` suma `prescription: { select: { id: true } }`;
  `canDeleteConsultation` recibe `hasPrescription: consultation.prescription !== null`; el
  `deleteMany` de guarda suma `prescription: { is: null }` al `where`.

### 4.10 `packages/db/domain/appointments.ts` → `setAppointmentStatus` (sin cambio de firma)

- El `include` de `prev.consultation` suma `prescription: { select: { id: true } }`.
- `isConsultationEmpty` recibe `hasPrescription: c.prescription != null`.
- El `deleteMany` de guarda suma `prescription: { is: null }`.

Volver un turno a confirmado **nunca** se lleva una prescripción. Lo usa web (panel del turno). El
bot no llama `setAppointmentStatus` (verificado: `grep` en `apps/bot` vacío), pero compila contra
este archivo.

---

## 5. Rutas, server actions y API (apps/web)

### 5.1 Rutas

No hay rutas nuevas. Cambian:
- `/pacientes/[id]/consultas/[consultationId]`: dos tarjetas nuevas (7.2 y 7.3).
- `/pacientes/[id]` (pestaña Resumen): tarjeta nueva (7.4). Pestaña Consultas: chip (7.5).

### 5.2 Server actions nuevas: `apps/web/src/app/(panel)/pacientes/[id]/prescription-actions.ts` (`"use server"`)

```ts
import type { ActionState } from "./clinical-actions";

/** Recibe un objeto plano (no FormData): lo llama el cliente desde un onClick + startTransition. */
export async function savePrescriptionAction(input: unknown): Promise<ActionState>;
export async function deletePrescriptionAction(patientId: string, consultationId: string): Promise<ActionState>;
```

`savePrescriptionAction`:
1. `prescriptionSchema.safeParse(input)` (zod):
   ```ts
   z.object({
     patientId: idSchema, consultationId: idSchema,
     bmrFormula: z.enum(BMR_FORMULA_VALUES),
     weightBasis: z.enum(["ACTUAL", "ADJUSTED"]),
     bodyFatSource: z.enum(["MEASURED", "DEURENBERG"]).nullable(),
     activityLevel: z.enum(ACTIVITY_LEVEL_VALUES),
     nutritionGoal: z.enum(NUTRITION_GOAL_VALUES),
     adjustmentRange: z.enum(ADJUSTMENT_RANGE_VALUES),
     adjustmentPercent: z.number().int().min(-100).max(100),
     prescribedVctKcal: z.number().int(),
     macros: z.discriminatedUnion("mode", [
       z.object({ mode: z.literal("PERCENT_OF_VCT"), proteinPercent: z.number(), fatPercent: z.number(), carbPercent: z.number() }),
       z.object({ mode: z.literal("PROTEIN_PER_KG"), proteinGPerKg: z.number(), fatPercent: z.number() }),
     ]),
   })
   ```
   Falla → `{ ok: false, error: "Datos inválidos" }`.
2. `belongsToPatient(patientId, consultationId)` (se importa o se replica el helper de
   `consultation-actions.ts`: mejor exportarlo desde un archivo sin `"use server"`, p. ej.
   `apps/web/src/lib/consultation-guard.ts`, y usarlo en los dos archivos). No → "Datos inválidos".
3. `saveConsultationPrescription({ consultationId, choices })`. `InvalidPrescriptionError` →
   "Datos inválidos". Otro error → "No se pudo guardar la prescripción.".
4. `revalidatePath(/pacientes/${patientId})` y `revalidatePath(/pacientes/${patientId}/consultas/${consultationId})`.
   `{ ok: true }`.

Los rangos (ajuste, VCT, macros, sumas) **no** se duplican en zod: los valida
`buildPrescriptionSnapshot` en el dominio. zod solo valida forma y enums.

`deletePrescriptionAction`: ids válidos + `belongsToPatient` → `deleteConsultationPrescription` →
mismas revalidaciones → `{ ok: true }`. Error → "No se pudo borrar la prescripción.".

### 5.3 Server actions que cambian

- `apps/web/src/app/(panel)/pacientes/actions.ts` → `updateFormulaDataAction`: además de lo que
  hace, `revalidatePath(`/pacientes/${id}`, "layout")`. Así, cuando se completa desde el `Sheet`
  del detalle de la consulta, la consulta se refresca.
- `consultation-actions.ts` → `deleteConsultationAction`: sin cambios de código (el texto viene de
  `CONSULTATION_TEXT.notDeletable`, que cambia en core).

### 5.4 `GET /api/appointments` (`apps/web/src/app/api/appointments/route.ts`)

El `select` de `consultation` suma `prescription: { select: { id: true } }` y `hasContent` pasa
`hasPrescription: a.consultation.prescription !== null`.

---

## 6. Mensajes del bot

**Ninguno.** No hay textos de WhatsApp nuevos ni cambios en `apps/bot`. Guardar o borrar una
prescripción no encola nada en `OutboundMessage`.

---

## 7. UI (skill `ui`): vistas, estructura y componentes

Solo el sistema de diseño actual (`@/components/ui`, `@/components/primitives/*`,
`NumberInput`, `DataTable`, `useConfirm`, `notify`). Sin colores nuevos. Números con
`formatDecimalEs`/`Quantity`, salvo **kcal, que van con `formatKcalEs`** (4.2). Tonos de `Badge`
por clave (el mapa vive en web, core no sabe de tonos):

| Indicador | `success` | `warning` | `danger` |
|---|---|---|---|
| IMC | NORMAL | UNDERWEIGHT, OVERWEIGHT | OBESITY_I, OBESITY_II, OBESITY_III |
| Cintura | NO_RISK | ELEVATED | VERY_ELEVATED |
| ICC | NO_RISK | INCREASED | — |
| Cintura/talla, conicidad | HEALTHY | OUT_OF_RANGE | — |

**AdequacyBar: no aplica en esta HU.** Compara un valor con un objetivo (plan contra objetivo), y
eso es la épica 23, que va a usar los gramos que se guardan acá. Los macros fuera de rango de
referencia se muestran con `Alert warning`, como pide la HU.

### 7.1 Detalle de la consulta: estructura general (`consultas/[consultationId]/page.tsx`)

Columna principal (`div.space-y-6`, reemplaza el `<ConsultationMeasurements>` suelto):
1. `ConsultationMeasurements` (sin cambios).
2. `AnthropometricDiagnosisCard` (7.2).
3. `RequirementSection` (7.3), **solo si no es menor**.

La columna lateral (Plan indicado, Notas) no cambia. `canDelete` suma
`hasPrescription: consultation.prescription !== null`.

Datos que arma la página (server). Se suman al `Promise.all` que ya existe, más las lecturas que
dependen de la consulta:
- `getRequirementContextForConsultation(consultationId)` → `ctx`, `ageYears`, `measurements`,
  `patient`.
- `buildAnthropometricDiagnosis({ sex, ageYears, bodyFrame, weightKg: m.weightKg?.value ?? null, … })`.
- `getReferencePrescription(...)` (solo si `ctx` no es null y no hay prescripción).
- Etiquetas de fecha `dd/MM/yyyy` (`formatInTimeZone`) de cada `SourcedMeasurement`. Un valor
  "viene de otra consulta" si `consultationId !== consultation.id`.

### 7.2 Vista "Diagnóstico antropométrico": `AnthropometricDiagnosisCard` (`consultas/[consultationId]/anthropometric-diagnosis.tsx`, **server component**)

- **Estructura:** `Card title="Diagnóstico antropométrico"` con `description`:
  - todos los datos usados son de esta consulta → "Con la medición del {dd/MM/yyyy de la consulta}";
  - alguno viene de otra → "Algunos datos son de mediciones anteriores: se indica la fecha al lado.".
- **Menor** (`diagnosis.minor`): `Alert tone="info"` con `MINOR_WARNING_TEXT` y debajo solo la
  fila IMC con el número, sin `Badge`. Nada más.
- **Sin mediciones** (`noMeasurements`): solo el texto `DIAGNOSIS_TEXT.noMeasurements` en
  `text-sm text-muted-foreground`.
- **Indicadores**: `<dl className="divide-y text-sm">` (mismo patrón que `FormulaDataSection`), una
  fila por indicador: `dt` con el nombre; `dd` con `Quantity` (valor + unidad) + `Badge` con el
  tono de la tabla + texto gris chico con el rango o la fuente. Si el valor viene de otra
  consulta, al lado del valor en gris "(12/09/2026)". Filas y textos:
  | Fila (`dt`) | Valor | Badge / texto gris |
  |---|---|---|
  | IMC | `25,3` (kg/m², sin unidad visible) | Badge clase · gris "18,5–24,9" |
  | Cintura | `82 cm` | Badge riesgo |
  | Índice cintura/cadera | `0,82` | Badge · gris `thresholdText` |
  | Cintura/talla | `0,51` | Badge · gris "<0,50" |
  | Índice de conicidad | `1,17` | Badge · gris "<1,4" |
  | % de grasa estimado | `32,8 %` | gris "Deurenberg, estimación poblacional" · si hay % medido (D4): "medido: 29,4 % (bioimpedancia 12/09/2026)" |
  - `missing` → en el `dd` solo el `note` en gris ("Sin dato (falta cadera)").
  - `unclassified` con note → valor + note en gris ("Falta sexo"), sin Badge.
- **Peso ideal**: `SectionLabel` "Peso ideal" + `Table` de primitives (server, 2 columnas
  "Fórmula" / "Peso ideal", números a la derecha con `Quantity unit="kg"`). Sin sexo: la celda
  dice "Falta sexo". Debajo, si `percentOfIdealDevine` no es null:
  `DIAGNOSIS_TEXT.percentOfIdeal(...)` en `text-sm`. Sin talla: la sección muestra
  "Sin dato (falta talla)".
- **Aviso de peso ajustado**: `Alert tone="warning"` con `DIAGNOSIS_TEXT.adjustedWeightAlert(...)`,
  al final de la tarjeta.
- No hay acciones ni formularios en esta tarjeta.

### 7.3 Vista "Requerimiento": `RequirementSection` (`consultas/[consultationId]/requirement-section.tsx`, **cliente**)

Props (todas serializables, Decimal ya convertido):
```ts
{
  patientId: string;
  consultationId: string;
  blockingMessage: string | null;        // missingFormulaDataMessage(getRequirementBlockingMissing(...))
  missingSex: boolean;                    // muestra el Sheet de "Completar datos para cálculos"
  missingBirthDate: boolean;              // muestra ButtonLink "Ir a Datos" → /pacientes/{id}?tab=datos
  formulaValues: FormulaDataValues;       // para el Sheet (sex, activityLevel, nutritionGoal, bodyFrame del paciente)
  calculator: CalculatorProps | null;     // null si blockingMessage
  prescription: PrescriptionSnapshot | null;
  bodyFatDateLabel: string | null;        // fecha de bodyFatRecordedAt guardada, para el resumen
}
```
Estado local `mode: "view" | "edit"` (arranca `"view"`). Tres estados visuales, todos dentro de
`Card title="Requerimiento"`:

**1. Sin prescripción** (`prescription === null && mode === "view"`)
- `p.text-sm.text-muted-foreground`: `REQUIREMENT_TEXT.emptyInConsultation`.
- Si `blockingMessage`: `Alert tone="warning"` con el mensaje (p. ej. "Faltan datos para los
  cálculos: fecha de nacimiento. La fecha de nacimiento se carga en "Datos".") y debajo:
  - si `missingSex`: `FormulaDataSheet` con `trigger` = `Button variant="secondary" size="sm"`
    "Completar datos para cálculos", conteniendo `FormulaDataForm` (lo de HU-001, sin cambios);
  - si `missingBirthDate`: `ButtonLink variant="secondary" size="sm"` "Ir a Datos".
  - Peso y talla faltantes: el mensaje ya dice dónde se cargan (Mediciones está arriba en la
    misma página). Sin enlace extra.
- `Button` "Calcular requerimiento" (`Calculator` de lucide), `disabled={calculator === null}`.
  Click → `mode = "edit"`.

**2. Calculando** (`mode === "edit"`): `RequirementCalculator` (`requirement-calculator.tsx`,
cliente) dentro de la misma tarjeta. Pasos numerados (`ol`, cada paso con un `SectionLabel`
"1. Peso para las fórmulas", etc.). Todo se recalcula en cada cambio con
`calculateRequirement(ctx, draft)` (sin botón calcular). Estado: `draft: RequirementDraft`
(inicial = `initialRequirementDraft` o `draftFromPrescription` si se está editando) y
`vctTouched: boolean` (false al abrir una prescripción nueva, true al editar una guardada).

`CalculatorProps`:
```ts
{
  ctx: RequirementContext;
  initialDraft: RequirementDraft;
  editing: boolean;
  measuredBodyFat: { percent: number; dateLabel: string } | null;
  measuredBmr: { kcal: number; dateLabel: string } | null;   // basalMetabolicRateKcal D4 (D8)
  patientActivityLevel: ActivityLevel | null;
  patientNutritionGoal: NutritionGoal | null;
}
```

1. **Peso para las fórmulas**: `ToggleGroup type="single" variant="outline"` (mismo estilo que
   `plans-section.tsx`) con "Actual (66,5 kg)" / "Ajustado (57,3 kg)" (`formatDecimalEs(x, 1)`).
   Si `suggestAdjustedWeight`, debajo en gris "Sugerido: supera el 130 % del peso ideal".
2. **TMB**: `RadioGroup` (primitives) + `Table` de primitives, 4 filas: radio · fórmula · kcal
   (`formatKcalEs`) · dato que usa, en gris ("con 66,5 kg", o para Katch-McArdle/Cunningham
   "con 29,4 % de grasa (bioimpedancia 12/09/2026)" / "con 37,9 % de grasa (estimado, Deurenberg)"
   + `Badge neutral` "estimado"). Sin % de grasa: fila deshabilitada (radio `disabled`, texto
   `REQUIREMENT_TEXT.noBodyFat`) y, una sola vez debajo de la tabla, `Button variant="ghost" size="sm"`
   "Usar el estimado de Deurenberg" → `bodyFatSource = "DEURENBERG"`. Si `measuredBmr`: debajo,
   `p.text-sm.text-muted-foreground` "Medido por bioimpedancia: 1450 kcal" (+ " (dd/MM/yyyy)" si es
   de otra consulta). No es seleccionable (D8).
3. **Actividad**: `Field label="Actividad física"` + `Select` con opción vacía "Elegí…" y las 5 de
   `ACTIVITY_LEVELS` como `"Ligero (×1,375) — Ejercicio ligero 1-3 días/semana"`. Si difiere de
   `patientActivityLevel` (y este no es null): hint gris "Distinto del dato del paciente
   (Moderado)". Resultado a la derecha: "GET 1851 kcal".
4. **Objetivo**: `Select` "Objetivo" (4 de `NUTRITION_GOALS`, opción vacía "Elegí…", mismo hint
   "Distinto del dato del paciente (…)"). Si el objetivo tiene más de un rango: `Select` "Tipo de
   ajuste" con `adjustmentRangeOptionLabel`. Si el rango no es MAINTENANCE: `NumberInput unit="%"`
   "Ajuste" (`step=1`), hint "Entre −15 % y −25 %" y, si es agresivo, además el `label` del rango
   ("con supervisión"). Al cambiar objetivo o rango, el ajuste se resetea a
   `defaultAdjustmentPercent`. Resultado: "VCT calculado 1481 kcal".
5. **VCT indicado**: `NumberInput unit="kcal"` (`step=1`). Mientras `vctTouched` sea false, su
   valor sigue a `Math.round(calculatedVctKcal)` (D7). Al tipear, `vctTouched = true`. Si difiere
   del calculado redondeado: gris "Difiere del calculado en +19 kcal" (`formatSignedIntEs`) +
   `Button variant="ghost" size="sm"` "Volver al calculado" (pone `vctTouched = false`).
6. **Macros**: `ToggleGroup` "Porcentajes del VCT" / "Proteína en g/kg".
   - % del VCT: 3 × `NumberInput unit="%"` (Proteínas hint "15–25 %", Grasas "20–35 %",
     Carbohidratos "45–60 %"), y "Suma: 100 %" en vivo.
   - g/kg: `NumberInput unit="g/kg"` "Proteínas" (hint "1,2–2,2 g/kg"), `NumberInput unit="%"`
     "Grasas", y "Carbohidratos: el resto".
   - Tabla resultado: **`DataTable`** (cliente, sin `sortValue`, sin `rowHref`), columnas
     "Macro" / "%" / "kcal" / "g por día" / `g/kg` (el header dice "g/kg de peso ajustado" si
     `weightBasis === "ADJUSTED"`), las 4 numéricas a la derecha. % y g/kg a 1 decimal; kcal y g
     enteros.
   - Cada `warning` → `Alert tone="warning"` (no bloquea).
- **Errores**: cada `errors[i]` se muestra en línea con `FormError` al pie. Hay errores → "Guardar
  prescripción" `disabled`.
- **Pie**: `Button` "Guardar prescripción" (`loading`, texto "Guardando…") y `Button
  variant="ghost"` "Cancelar" (→ `mode = "view"`, descarta el borrador sin confirmar). Guardar =
  `onClick` → `startTransition(async () => { const res = await savePrescriptionAction({...draft,
  patientId, consultationId}); ... })`. `ok` → `notify.saved(REQUIREMENT_TEXT.saved)` y
  `mode = "view"`. Error → `FormError` con `res.error` ("Datos inválidos") en rojo.
  **No se usa `<form action>`.**

**3. Con prescripción** (`prescription !== null && mode === "view"`): resumen de solo lectura
(`PrescriptionSummary`, en el mismo archivo o `prescription-summary.tsx`, cliente porque usa
`DataTable`):
- `p.text-2xl.font-semibold.tabular-nums` "VCT 1481 kcal". Si `prescribedVctKcal !==
  calculatedVctKcal`, gris "(calculado 1481 kcal)".
- `p.text-sm` `prescriptionFormulaLine` y `prescriptionWeightLine`. Si usó Katch-McArdle o
  Cunningham, además "con 29,4 % de grasa (bioimpedancia 12/09/2026)" o "(estimado, Deurenberg)".
- `DataTable` de macros: "Macro" / "%" / "g por día" / "g/kg".
- `card actions`: `Button variant="secondary" size="sm"` "Editar" (→ `mode = "edit"` con
  `draftFromPrescription`) y `Button variant="danger" size="sm"` "Borrar prescripción".
  Borrar: `handleDelete` **async, fuera de toda transición**: `const ok = await confirm({ title:
  REQUIREMENT_TEXT.deleteConfirmTitle, description: REQUIREMENT_TEXT.deleteConfirmDescription,
  confirmLabel: "Borrar prescripción" })`; si ok → `startTransition(async () => { const res = await
  deletePrescriptionAction(...); res.ok ? notify.saved(REQUIREMENT_TEXT.deleted) :
  notify.error(res.error) })`. Mismo patrón que `DeleteConsultationButton`.

**"Editar"**: necesita `calculator` no nulo. Si hoy faltan datos bloqueantes (p. ej. se borró el
sexo), "Editar" queda `disabled` y se muestra el `blockingMessage`. El borrador arranca con lo
guardado; peso, talla, edad y % medido vienen de las mediciones D4 actuales de esa consulta (para
una consulta ya cerrada son las mismas).

### 7.4 Vista "Requerimiento indicado" (Resumen): `RequirementSummaryCard` (`pacientes/[id]/requirement-summary-card.tsx`, **server component**)

- **Estructura:** en la columna derecha del grid del Resumen, debajo de `FormulaDataSection`
  (envolver las dos en un `div.space-y-6`). `Card title="Requerimiento indicado"`.
- **Con prescripción** (`listLatestPrescriptions(id, 2)`, la primera):
  - "1481 kcal · 12/09/2026" (`text-lg font-semibold`, kcal con `formatKcalEs`).
  - `<dl>` de 3 filas: Proteínas `74 g`, Grasas `49 g`, Carbohidratos `185 g`.
  - Si hay segunda: gris `prescriptionDiffText(1481, 1600, "12/08/2026")` →
    "−119 kcal respecto del 12/08/2026".
  - `ButtonLink variant="secondary" size="sm"` "Ver consulta" →
    `/pacientes/{id}/consultas/{consultationId}`.
- **Vacío**: `REQUIREMENT_TEXT.emptyInSummary` + `ButtonLink variant="ghost" size="sm"` "Consultas"
  → `/pacientes/{id}?tab=consultas`.
- Sin gráfico (D11).

### 7.5 Lista de consultas (`consultations-section.tsx`)

Sin cambios de componente: el chip "Requerimiento" sale de `consultationChips` (`Badge neutral`,
como el resto). En `page.tsx` de la ficha: `hasPrescription: c.prescription !== null`.

### 7.6 `FormulaDataSheet` (cambio chico)

`FormulaDataSheet({ children, trigger }: { children: ReactNode; trigger?: ReactNode })`: si viene
`trigger` se usa como hijo de `SheetTrigger asChild`; si no, el botón "Editar" actual. El Resumen
no cambia.

---

## 8. Archivos

**Crear**
- `packages/core/src/formula-measurements.ts` + `.test.ts`
- `packages/core/src/anthropometric-diagnosis.ts` + `.test.ts`
- `packages/core/src/energy-requirement.ts` + `.test.ts`
- `packages/db/prisma/migrations/<ts>_nutrition_prescription/migration.sql` (generada)
- `packages/db/domain/prescriptions.ts`
- `packages/db/scripts/test-prescriptions.ts`
- `apps/web/src/lib/consultation-guard.ts` (`belongsToPatient`, sin `"use server"`)
- `apps/web/src/app/(panel)/pacientes/[id]/prescription-actions.ts`
- `apps/web/src/app/(panel)/pacientes/[id]/requirement-summary-card.tsx`
- `apps/web/src/app/(panel)/pacientes/[id]/consultas/[consultationId]/anthropometric-diagnosis.tsx`
- `apps/web/src/app/(panel)/pacientes/[id]/consultas/[consultationId]/requirement-section.tsx`
- `apps/web/src/app/(panel)/pacientes/[id]/consultas/[consultationId]/requirement-calculator.tsx`
- `apps/web/src/app/(panel)/pacientes/[id]/consultas/[consultationId]/prescription-summary.tsx` (opcional; puede ir dentro de `requirement-section.tsx`)

**Modificar**
- `packages/core/src/anthropometry.ts` (+ `anthropometry.test.ts`)
- `packages/core/src/patient-formula-data.ts` (+ `.test.ts`)
- `packages/core/src/consultations.ts` (+ `consultations.test.ts`)
- `packages/core/src/index.ts`
- `packages/db/prisma/schema.prisma`
- `packages/db/domain/clinical.ts`, `consultations.ts`, `appointments.ts`, `index.ts`
- `apps/web/src/app/(panel)/pacientes/[id]/consultas/[consultationId]/page.tsx`
- `apps/web/src/app/(panel)/pacientes/[id]/page.tsx`
- `apps/web/src/app/(panel)/pacientes/[id]/consultation-actions.ts` (usa `consultation-guard.ts`)
- `apps/web/src/app/(panel)/pacientes/[id]/formula-data-sheet.tsx`
- `apps/web/src/app/(panel)/pacientes/actions.ts`
- `apps/web/src/app/api/appointments/route.ts`

**No tocar:** `apps/bot/**`, `apps/web/src/app/(portal)/**`, `tailwind.config.ts`,
`backlog.json`, migraciones ya aplicadas.

---

## 9. Checklist atómico

### packages/core
- [ ] `anthropometry.ts`: `roundTo`, `bmiExact`, clasificaciones (IMC, cintura, ICC,
      cintura/talla, conicidad) con sus constantes y labels, `waistHipThresholdText`,
      `deurenbergBodyFatPercent`, las 5 de peso ideal, `adjustedWeightKg`, `percentOfIdealWeight`,
      `shouldSuggestAdjustedWeight`, `ADJUSTED_WEIGHT_THRESHOLD_PERCENT`. Hamwi usa `BODY_FRAMES`.
- [ ] `patient-formula-data.ts`: `ADJUSTMENT_RANGE_VALUES`, `key` y `shortLabel` en los 5 rangos,
      `goalAdjustmentRange`, `formatSignedPercentEs`, `formatSignedIntEs`, `formatKcalEs`.
- [ ] `consultations.ts`: chip "Requerimiento", `hasPrescription` en las 3 funciones, texto nuevo
      de `notDeletable`.
- [ ] `formula-measurements.ts`: `pickFormulaMeasurements` y tipos.
- [ ] `anthropometric-diagnosis.ts`: `buildAnthropometricDiagnosis`, `DIAGNOSIS_TEXT`.
- [ ] `energy-requirement.ts`: todo lo de 4.6.
- [ ] `index.ts`: `export * from` los tres módulos nuevos. Verificar que no haya nombres
      duplicados entre módulos (p. ej. `BmrFormula` solo en `energy-requirement.ts`).
- [ ] Tests (sección 10) y `npm run test` en verde.

### packages/db
- [ ] `pg_dump` al scratchpad (3.2 paso 1).
- [ ] `schema.prisma`: 5 enums, `NutritionPrescription`, back-relation en `Consultation`.
- [ ] `migrate status` → `migrate dev --create-only --name nutrition_prescription` → revisar SQL
      (3.2 paso 4) → `npm run db:migrate` → `npm run db:generate`.
- [ ] `domain/clinical.ts`: `getFormulaMeasurementsAsOf`; `getLatestFormulaMeasurements` delega
      sin cambiar su firma.
- [ ] `domain/prescriptions.ts` (4.8) + export en `domain/index.ts`.
- [ ] `domain/consultations.ts`: include `prescription`, `deleteConsultation` (4.9).
- [ ] `domain/appointments.ts`: `setAppointmentStatus` (4.10).
- [ ] `scripts/test-prescriptions.ts` (10.4) → `OK`.
- [ ] `npm run typecheck` (db).

### apps/web
- [ ] `lib/consultation-guard.ts` y `consultation-actions.ts` usándolo.
- [ ] `prescription-actions.ts` (5.2).
- [ ] `pacientes/actions.ts`: revalidación `"layout"` (5.3).
- [ ] `api/appointments/route.ts` (5.4).
- [ ] `formula-data-sheet.tsx`: prop `trigger` (7.6).
- [ ] `anthropometric-diagnosis.tsx` (7.2).
- [ ] `requirement-calculator.tsx`, `requirement-section.tsx` y el resumen (7.3). `useConfirm`
      fuera de transición.
- [ ] `consultas/[consultationId]/page.tsx`: datos (7.1), tarjetas, `canDelete` con
      prescripción, ocultar Requerimiento a menores.
- [ ] `pacientes/[id]/page.tsx`: chips con `hasPrescription`, `listLatestPrescriptions`,
      `RequirementSummaryCard` (7.4).
- [ ] `npm run typecheck` (web).

### apps/bot
- [ ] Sin cambios de código. `npm run typecheck` del bot en verde.
- [ ] `npm run test:confirm-flow --workspace apps/bot` en verde (regresión de `setAppointmentStatus`/core; sin WhatsApp real).

---

## 10. Tests

Cada valor de referencia va en el test **con la cuenta en un comentario**. Comparar exactos con
`toBeCloseTo(x, 6)` y mostrados con `toBe` sobre `roundTo`/`formatKcalEs`.

### 10.1 `packages/core/src/anthropometry.test.ts` (ampliar)

Ana = FEMALE, 34 años, 66,5 kg, 162 cm, cintura 82, cadera 100. Luis = MALE, 45 años, 118 kg,
180 cm, cintura 110.

| Caso | Cuenta (comentario) | Esperado |
|---|---|---|
| `bmiExact(66.5, 162)` | 66,5 / 1,62² = 66,5 / 2,6244 = 25,33912… | `roundTo(…,1)` = 25.3 |
| `bmiExact(118, 180)` | 118 / 3,24 = 36,41975… | 36.4 |
| `classifyBmi` bordes | 18.4→UNDERWEIGHT, 18.5→NORMAL, 24.9→NORMAL, 25.0→OVERWEIGHT, 29.9/30.0, 34.9/35.0, 39.9/40.0 | clase de cada lado |
| `classifyWaist` | F: 79.9→NO_RISK, 80→ELEVATED, 87.9→ELEVATED, 88→VERY; M: 93.9, 94, 101.9, 102 | ídem |
| Ana cintura 82 | F ≥ 80 y < 88 | ELEVATED |
| Luis cintura 110 | M ≥ 102 | VERY_ELEVATED |
| `classifyWaistHipRatio` | F: 0.85→NO_RISK, 0.86→INCREASED; M: 0.90→NO_RISK, 0.91→INCREASED; Ana 82/100 = 0,82 → NO_RISK | |
| `waistToHeightRatio(82,162)` | 82/162 = 0,50617… → 0,51 | OUT_OF_RANGE; 0.49→HEALTHY, 0.50→OUT_OF_RANGE |
| `conicityIndex(82, 66.5, 162)` | 0,82 / (0,109·√(66,5/1,62)) = 0,82 / (0,109·6,40702) = 0,82 / 0,698365 = 1,17418… | 1.17 HEALTHY |
| `conicityIndex(110, 118, 180)` | 1,10 / (0,109·√(118/1,8)) = 1,10 / (0,109·8,09664) = 1,10 / 0,882534 = 1,24641… | 1.25 HEALTHY; 1.40→OUT_OF_RANGE |
| `deurenbergBodyFatPercent` Ana | 1,2·25,33912 + 0,23·34 − 0 − 5,4 = 30,40695 + 7,82 − 5,4 = 32,82695 | 32.8 |
| Deurenberg Luis | 1,2·36,41975 + 0,23·45 − 10,8 − 5,4 = 43,70370 + 10,35 − 16,2 = 37,85370 | 37.9 |
| `devineIdealWeightKg(F,162)` | 45,5 + 2,3·(162−152,4)/2,54 = 45,5 + 2,3·9,6/2,54 = 45,5 + 8,69291 = 54,19291 | 54.2 |
| `devineIdealWeightKg(M,180)` | 50 + 2,3·27,6/2,54 = 50 + 24,99213 = 74,99213 | 75.0 |
| `hamwiIdealWeightKg(F,162,MEDIUM)` | 45,5 + 2,2·(162/2,54 − 60) = 45,5 + 2,2·3,77953 = 53,81496 | 53.8 |
| Hamwi F 162 SMALL / LARGE | 53,81496·0,9 = 48,43346 / ·1,1 = 59,19646 | 48.4 / 59.2 |
| `hamwiIdealWeightKg(M,180,MEDIUM)` | 48 + 2,7·(70,86614 − 60) = 48 + 29,33858 = 77,33858 | 77.3 |
| `brocaIdealWeightKg(162)` | 162 − 100 | 62 |
| `brocaBrugschIdealWeightKg` | F 162: 62·0,85 = 52,7 · M 180: 80·0,9 = 72 | 52.7 / 72.0 |
| `lorentzIdealWeightKg` | F 162: 62 − 12/2,5 = 57,2 · M 180: 80 − 30/4 = 72,5 | 57.2 / 72.5 |
| `percentOfIdealWeight` Ana | 66,5 / 54,19291 ·100 = 122,70977 | 122.7; `shouldSuggest` false |
| `percentOfIdealWeight` Luis | 118 / 74,99213 ·100 = 157,34985 | **157.3**; `shouldSuggest` true |
| `adjustedWeightKg` Luis | 74,99213 + 0,25·(118 − 74,99213) = 74,99213 + 10,75197 = 85,74409 | 85.7 |
| `adjustedWeightKg` Ana | 54,19291 + 0,25·12,30709 = 57,26969 | 57.3 |
| Umbral 130 | actual/ideal = 130,0 → false; 130,1 → true | estricto |

### 10.2 `packages/core/src/energy-requirement.test.ts`

Contexto Ana: `{ sex: FEMALE, ageYears: 34, heightCm: 162, actualWeightKg: 66.5, measuredBodyFatPercent: 29.4 }`.
Borrador base: Mifflin, ACTUAL, MEASURED, LIGHT, LOSE_WEIGHT, MODERATE_DEFICIT, −20, VCT 1481,
PERCENT_OF_VCT 20/30/50.

| Caso | Cuenta (comentario) | Esperado |
|---|---|---|
| `mifflinStJeorBmr` Ana | 10·66,5 + 6,25·162 − 5·34 − 161 = 665 + 1012,5 − 170 − 161 = 1346,5 | 1346.5 → `formatKcalEs` "1347" |
| `harrisBenedictBmr` Ana | 447,593 + 9,247·66,5 + 3,098·162 − 4,330·34 = 447,593 + 614,9255 + 501,876 − 147,22 = 1417,1745 | "1417" |
| `leanBodyMassKg(66.5, 29.4)` | 66,5·0,706 = 46,949 | 46.949 |
| `katchMcArdleBmr` | 370 + 21,6·46,949 = 370 + 1014,0984 = 1384,0984 | "1384" |
| `cunninghamBmr` | 500 + 22·46,949 = 500 + 1032,878 = 1532,878 | "1533" |
| Mifflin M (Luis, actual) | 10·118 + 6,25·180 − 5·45 + 5 = 1180 + 1125 − 225 + 5 = 2085 | 2085 |
| Harris-Benedict M con 85,74409 | 88,362 + 13,397·85,74409 + 4,799·180 − 5,677·45 = 88,362 + 1148,7236 + 863,82 − 255,465 = 1845,4306 | "1845" |
| GET Ana | 1346,5 · 1,375 = 1851,4375 | "1851" |
| VCT −20 % | 1851,4375 · 0,8 = 1481,15 | "1481" |
| VCT −15 % (editar) | 1851,4375 · 0,85 = 1573,72188 | "1574" |
| Macros 20/30/50 sobre 1481 (peso 66,5) | P: 1481·0,2 = 296,2 kcal / 4 = 74,05 g / 66,5 = 1,1135 g/kg · G: 444,3 / 9 = 49,367 g / 66,5 = 0,7424 · C: 740,5 / 4 = 185,125 g / 66,5 = 2,7838 | 296/74/1,1 · 444/49/0,7 · 741/185/2,8; sin warnings |
| Suma 20/30/45 | 95 | error "Los porcentajes suman 95 %; tienen que sumar 100 %" |
| g/kg 1,6 + grasas 30 % | P: 1,6·66,5 = 106,4 g · 4 = 425,6 kcal · /1481 = 28,737 % · G: 444,3 kcal, 49,367 g · C: 1481 − 425,6 − 444,3 = 611,1 kcal / 4 = 152,775 g · /1481 = 41,263 % | 106 g (426 kcal, 28,7 %), 49 g (444, 30 %), 153 g (611, 41,3 %); **un solo** warning "Carbohidratos 41,3 %: fuera del rango de referencia (45–60 %)" (la proteína se juzga por g/kg: 1,6 está en 1,2–2,2); sin errores |
| g/kg con carbohidratos negativos | 4 g/kg · 66,5 = 266 g = 1064 kcal; grasas 35 % de 1481 = 518,35; 1481 − 1064 − 518,35 = −101,35 | error `negativeCarbs` |
| Ajuste −35 en moderado | fuera de [−25, −15] | error "El ajuste para déficit moderado va de −15 % a −25 %" |
| Ajuste −25 en moderado y en agresivo | borde incluido en los dos | sin error |
| SURPLUS en LOSE_WEIGHT | rango no pertenece | `rangeMissing` |
| VCT 799 / 6001 / 1481,5 | | `vctOutOfRange` / `vctOutOfRange` / `vctNotInteger` |
| Katch elegido con `bodyFatSource` null | | `bmrByFormula.KATCH_MCARDLE` null + `bodyFatNeeded` |
| Luis ADJUSTED | weightUsed 85,74409; Mifflin = 857,4409 + 1125 − 225 + 5 = 1762,4409; Katch con DEURENBERG: magra = 118·(1 − 0,3785370) = 73,33263 → 370 + 21,6·73,33263 = 1953,9848 | Mifflin "1762"; Katch "1954" (usa peso **actual**); `suggestAdjustedWeight` true |
| `defaultAdjustmentPercent` | (−25 − 15)/2 = −20; (−30 − 25)/2 = −27,5 → −28; 0; 15 | −20, −28, 0, 15 |
| `adjustmentRangeOptionLabel` | | "Déficit moderado (−15 a −25 %)", "Déficit agresivo (−25 a −30 %)", "Superávit (+10 a +20 %)", "Mantenimiento (0 %)" |
| `initialRequirementDraft` | sin referencia, Ana → Mifflin, ACTUAL, MEASURED, LIGHT, LOSE_WEIGHT, MODERATE_DEFICIT, −20, 20/30/50; Luis → ADJUSTED; GAIN_MUSCLE → PROTEIN_PER_KG 1,6 / 30; referencia con KATCH y sin % medido → Mifflin; referencia AGGRESSIVE −27 y objetivo bajar → AGGRESSIVE −27; objetivo null → rango null | |
| `buildPrescriptionSnapshot` Ana | todo lo anterior | `bmrKcal` 1347, `bmrMifflinStJeorKcal` 1347, `bmrHarrisBenedictKcal` 1417, `bmrKatchMcArdleKcal` 1384, `bmrCunninghamKcal` 1533, `totalExpenditureKcal` 1851, `calculatedVctKcal` 1481, `prescribedVctKcal` 1481, `proteinG` 74, `fatG` 49, `carbG` 185, `weightUsedKg` 66.5, `idealWeightDevineKg` 54.19, `activityFactor` 1.375; con errores → `{ ok: false }` |
| `prescriptionHeadline` | | "VCT 1481 kcal · P 74 g · G 49 g · C 185 g" |
| `prescriptionFormulaLine` | | "Mifflin-St Jeor · TMB 1347 kcal · Ligero ×1,375 · GET 1851 kcal · Déficit moderado −20 %" |
| `prescriptionWeightLine` | | "Peso usado: 66,5 kg (actual)"; Luis: "Peso usado: 85,7 kg (ajustado; ideal Devine 75,0 kg)" |
| `prescriptionDiffText(1481, 1600, "12/08/2026")` | 1481 − 1600 = −119 | "−119 kcal respecto del 12/08/2026"; (1600,1600) → "Igual que el 12/08/2026" |
| `getRequirementBlockingMissing` | sin actividad ni objetivo → []; sin fecha → [birthDate] y el mensaje "Faltan datos para los cálculos: fecha de nacimiento. La fecha de nacimiento se carga en "Datos"." | |

`patient-formula-data.test.ts`: los rangos tienen `key` y `shortLabel` esperados;
`goalAdjustmentRange`; `formatSignedPercentEs(-20)` = "−20 %" (U+2212), `formatSignedIntEs(-119)`
= "−119", `formatKcalEs(1481.15)` = "1481", `formatKcalEs(6000)` = "6000".

### 10.3 `anthropometric-diagnosis.test.ts` y `formula-measurements.test.ts`

- Ana completa (bodyFrame null) → IMC 25.3 OVERWEIGHT; cintura 82 ELEVATED; ICC 0.82 NO_RISK con
  `thresholdText` "riesgo aumentado > 0,85 en mujeres"; cintura/talla 0.51; conicidad 1.17;
  Deurenberg 32.8; pesos ideales 54.2 / 53.8 (label "Hamwi (contextura Mediana, asumida)") / 62.0
  / 52.7 / 57.2; `percentOfIdealDevine` 122.7; `adjustedWeightSuggestion` null.
- Luis sin cadera → IMC 36.4 OBESITY_II; cintura VERY_ELEVATED; ICC `missing` "Sin dato (falta
  cadera)"; Devine 75.0; 157.3; sugerencia `adjustedKg` 85.7;
  `DIAGNOSIS_TEXT.adjustedWeightAlert(85.7)` = "El peso actual supera el 130 % del peso ideal. Se
  sugiere calcular con peso ajustado: 85,7 kg.".
- Ana sin sexo → IMC clasificado; Broca 62.0; Devine/Hamwi/Brugsch/Lorentz `note` "Falta sexo";
  cintura e ICC `unclassified` "Falta sexo"; Deurenberg `missing` "Falta sexo";
  `percentOfIdealDevine` null; cintura/talla y conicidad sí.
- Sin fecha de nacimiento → Deurenberg "Falta fecha de nacimiento"; `minor` false.
- Menor (12 años) → `minor` true, IMC `unclassified`, todo lo demás null.
- Sin peso ni talla → `noMeasurements` true.
- `pickFormulaMeasurements`: la de la consulta gana aunque haya otra más nueva de otra consulta
  del mismo día; sin valor en la consulta → la más reciente por `recordedAt`; empate de
  `recordedAt` → `createdAt` desc; cada clave elige por separado (peso de una entrada, talla de
  otra); `consultationId` null → orden puro por `recordedAt`.

`consultations.test.ts`: casos nuevos con `hasPrescription` en las 3 funciones; el orden de
chips con "Requerimiento"; el texto nuevo de `notDeletable`.

### 10.4 Prueba contra la base: `packages/db/scripts/test-prescriptions.ts`

Script `tsx` con `node:assert/strict`, mismo patrón que `test-consultations.ts`. **Solo datos
propios**, ids en arrays, borrado por id en `finally`.
1. Paciente propio: `whatsappJid: test-hu004-${Date.now()}@test.invalid`, `phone: "000"`, `name:
   "Prueba HU-004 (TEST)"`, `birthDate: 1992-03-20`, `sex: FEMALE`, `activityLevel: LIGHT`,
   `nutritionGoal: LOSE_WEIGHT`. Servicio propio inactivo. Un menor propio (`birthDate:
   2014-01-10`, `sex: MALE`).
2. `createManualConsultation("2026-09-12")` + `addEvolutionEntryToConsultation({ weightKg: 66.5,
   heightCm: 162, waistCm: 82, hipCm: 100, bodyFatPercent: 29.4 })`.
3. `createManualConsultation("2026-09-20")` + medición `{ weightKg: 60 }` (posterior).
   `createManualConsultation("2026-09-22")` sin mediciones.
4. `getFormulaMeasurementsAsOf` para la del 12/09 → peso 66.5 (no 60); para la del 22/09 → peso
   60 de la del 20/09, talla 162 de la del 12/09.
5. `saveConsultationPrescription` (12/09, borrador base de 10.2) → fila con `prescribedVctKcal`
   1481, `bmrKcal` 1347, `proteinG` 74, `fatG` 49, `carbG` 185, `activityLevel` LIGHT,
   `bodyFatRecordedAt` = recordedAt de la medición.
6. `prisma.patient.update` (su propio paciente) `activityLevel: MODERATE` → la fila sigue LIGHT y
   1481.
7. Guardar de nuevo con −15 → `count({ where: { consultationId } }) === 1` y `calculatedVctKcal`
   1574.
8. −35 → tira `InvalidPrescriptionError`; la fila sigue con 1574. VCT 7000 → tira. Katch con
   `bodyFatSource: null` → tira.
9. `deleteConsultation(12/09)` → `ConsultationNotDeletableError` (tiene mediciones y prescripción).
   Consulta manual `2026-09-15` solo con prescripción → `deleteConsultation` tira.
10. Turno propio (`prisma.appointment.create` directo, **no** `createAppointment`) →
    `setAppointmentStatus(COMPLETED)` → guardar prescripción en su consulta (sin mediciones: se
    usan las del 12/09 porque el turno es posterior; elegir una fecha de turno ≥ 12/09 y ≤ hoy) →
    `setAppointmentStatus(CONFIRMED)` → `removedEmptyConsultation: false` y la consulta sigue.
11. Consulta del menor con medición → `getRequirementContextForConsultation` da `ctx: null` y
    `saveConsultationPrescription` tira.
12. `deleteConsultationPrescription(12/09)` → no hay fila.
13. `listLatestPrescriptions` ordena por fecha de consulta desc.
14. `prisma.outboundMessage.count({ where: { appointmentId: { in: appointmentIds } } }) === 0`.
15. `finally`, en orden y **cada uno por id**: `nutritionPrescription.deleteMany({ id: { in } })`
    (juntando los ids que devolvió el dominio y `findMany({ where: { consultationId: { in:
    consultationIds } } })`), `evolutionEntry`, `consultation`, `appointment`, `service`,
    `patient`. **Prohibidos** los filtros amplios (`patientId`, fechas, nombres).
16. Imprime `OK` o sale con código ≠ 0.

Correr desde `packages/db`: `npx dotenv -e ../../.env -- tsx scripts/test-prescriptions.ts`.

---

## 11. Verificación (el implementer la corre antes de declararse `done`)

Desde la raíz:

```bash
git branch --show-current                                               # hu-004-calculadora-requerimiento
ls -la "$SCRATCHPAD/nutribot-pre-hu004.dump"                            # respaldo previo existe
(cd packages/db && npx dotenv -e ../../.env -- prisma migrate status)   # up to date, 12 migraciones
cat packages/db/prisma/migrations/*_nutrition_prescription/migration.sql | grep -Ei 'drop|alter table "(consultation|patient|evolutionentry)"'   # sin salida
npm run db:generate
npm run test                                                            # vitest core en verde
npm run typecheck                                                       # core, db, web y bot en verde
(cd packages/db && npx dotenv -e ../../.env -- tsx scripts/test-prescriptions.ts)   # OK
npm run test:confirm-flow --workspace apps/bot                          # sin WhatsApp real, limpia por id
docker compose exec -T db psql -U nutri -d nutribot -c 'select count(*) from "NutritionPrescription";'   # 0 (el script no dejó restos)
docker compose exec -T db psql -U nutri -d nutribot -c 'select count(*) from "Consultation";'            # igual que antes de empezar (hoy 18)
./ops/harness/verify.sh
```

**Prohibido en esta HU:** `next build`; levantar otro `next dev` (el del usuario está en el
3000); `prisma migrate reset`; aceptar el reset por drift; `prisma db push`; editar una migración
aplicada; `db:seed`/`seed:demo`; escribir en la base fuera de la migración y del script de 10.4;
editar datos desde la UI. No commitear. No tocar `backlog.json`.

Salidas resumidas en `progress/impl_HU-004.md`, incluidos el SQL de la migración y el aviso
"**hay que reiniciar el `next dev` del usuario**".

---

## 12. Recorrido en el navegador (lo hace el orquestador, en `localhost:3000`)

**Antes:** reiniciar el `next dev` del usuario (cliente de Prisma nuevo, sección 3.2).

### 12.1 Solo lectura: paciente real "Juan Pérez" (`cmtyq7tzm0017xnwskwm1ttlb`)

Datos reales (leídos en psql): sin sexo, actividad, objetivo ni contextura; nacido el 15/05/1995.
Mediciones: 01/08 (68 kg, 178 cm), 20/08 (grasa 20,0 %), 22/08 (70 kg), 09/09 (71,5 kg),
12/09 (grasa 18,5 %). Ninguna cintura ni cadera. **No tocar ningún botón que guarde:** ni el
Sheet de datos, ni mediciones, ni notas.

1. Ficha → **Resumen**: la tarjeta "Requerimiento indicado" dice "Todavía no hay un requerimiento
   indicado. Se calcula en una consulta." con el enlace "Consultas". "Datos para cálculos" igual
   que antes.
2. **Consultas**: 5 consultas, ninguna con chip "Requerimiento". "Eliminar consulta" sigue
   deshabilitado en las que tienen mediciones, con el texto nuevo "Para eliminar la consulta
   primero borrá sus mediciones, la prescripción y quitá el plan indicado."
3. Consulta del **12/09/2026** (`mig003_4edfe6f670d33c5f3975b535153e47b0`), 31 años:
   - "Diagnóstico antropométrico", descripción "Algunos datos son de mediciones anteriores…".
   - IMC **22,6** "Normal" (71,5 / 1,78² = 22,5666), con "(09/09/2026)" en el peso usado y el
     rango "18,5–24,9". Cintura, ICC, cintura/talla y conicidad: "Sin dato (falta cintura)".
   - % de grasa estimado: "Falta sexo", con "medido: 18,5 % (bioimpedancia 12/09/2026)".
   - Peso ideal: Broca **78,0 kg**; Devine, Hamwi, Broca-Brugsch y Lorentz: "Falta sexo". Sin
     línea de "% del peso ideal" ni aviso de peso ajustado.
   - "Requerimiento": "Todavía no hay un requerimiento indicado en esta consulta.", aviso
     "Faltan datos para los cálculos: sexo." con el botón "Completar datos para cálculos"
     (abrirlo y **cerrarlo sin guardar**), y "Calcular requerimiento" deshabilitado.
4. Consulta del **09/09/2026**: IMC 22,6 con peso propio; el % medido que muestra es **20,0 %
   (20/08/2026)**, no el 18,5 % del 12/09 (nunca uno posterior, D4).
5. Consulta del **20/08/2026**: IMC **21,5** (68 / 3,1684 = 21,4619) con peso y talla
   "(01/08/2026)".
6. Consulta del **01/08/2026** (turno): descripción "Con la medición del 01/08/2026", IMC 21,5,
   Broca 78,0.
7. Portal del paciente (si hay sesión de prueba): sin kcal ni macros.

### 12.2 Pasos que escriben (solo con un paciente de prueba propio, borrado por id al final)

Crear el paciente por SQL con id fijo (no hay alta de pacientes en el panel):
```sql
insert into "Patient"(id,"whatsappJid",phone,name,"birthDate",sex,"activityLevel","nutritionGoal","updatedAt")
values ('hu004_walk_ana','hu004-walk@test.invalid','000','Prueba HU-004 Ana','1992-03-20','FEMALE','LIGHT','LOSE_WEIGHT',now());
```
8. Ficha → Consultas → "Nueva consulta" 12/09/2026 → "Agregar medición": 66,5 kg, 162 cm,
   cintura 82, cadera 100, grasa 29,4 %.
9. Diagnóstico: IMC 25,3 Sobrepeso · cintura 82 Riesgo elevado · ICC 0,82 Sin riesgo aumentado ·
   cintura/talla 0,51 · conicidad 1,17 · grasa 32,8 % (medido: 29,4 %) · Devine 54,2, Hamwi
   (contextura Mediana, asumida) 53,8, Broca 62,0, Broca-Brugsch 52,7, Lorentz 57,2 · "Peso
   actual: 122,7 % del peso ideal (Devine)" · sin aviso de peso ajustado.
10. "Calcular requerimiento": "Actual (66,5 kg)" preseleccionado / "Ajustado (57,3 kg)"; TMB
    1347 / 1417 / 1384 / 1533, Mifflin elegida, "con 29,4 % de grasa (bioimpedancia
    12/09/2026)"; "Ligero (×1,375)"; "Bajar de peso", "Déficit moderado (−15 a −25 %)", −20 →
    GET 1851, VCT calculado 1481, VCT indicado 1481; macros 20/30/50 → 296/74/1,1 · 444/49/0,7 ·
    741/185/2,8.
11. Ajuste −35 → "El ajuste para déficit moderado va de −15 % a −25 %" y "Guardar" deshabilitado.
    Macros 20/30/45 → "Los porcentajes suman 95 %; tienen que sumar 100 %". g/kg 1,6 + 30 % →
    106/153 g y el aviso de carbohidratos 41,3 %, con "Guardar" habilitado. Volver a 20/30/50.
12. VCT indicado 1500 → "Difiere del calculado en +19 kcal" → "Volver al calculado".
13. "Guardar prescripción" → toast "Prescripción guardada"; resumen "VCT 1481 kcal", la línea de
    fórmula, "Peso usado: 66,5 kg (actual)" y la tabla. Lista: chip "Requerimiento". Resumen:
    "1481 kcal · 12/09/2026".
14. "Datos para cálculos" → actividad "Moderado" → volver a la consulta: sigue "Ligero ×1,375" y
    1481. "Editar" → aparece "Distinto del dato del paciente (Moderado)"; ajuste −15 → guardar
    → VCT 1574, una sola prescripción.
15. "Eliminar consulta" deshabilitado con el texto nuevo. "Borrar prescripción" → confirmación
    "¿Borrar la prescripción de esta consulta?" → la tarjeta vuelve al estado vacío y el chip
    desaparece.
16. `select count(*) from "OutboundMessage" where "toJid" = 'hu004-walk@test.invalid';` → 0.

Limpieza (por id propio; la cascada se lleva consultas, mediciones y prescripciones de **ese**
paciente):
```sql
delete from "Patient" where id = 'hu004_walk_ana';
```

Opcional, mismo patrón: "Prueba HU-004 Luis" (MALE, 45 años, SEDENTARY, LOSE_WEIGHT, 118 kg, 180
cm, cintura 110, sin grasa) para ver IMC 36,4 Obesidad grado II, 157,3 %, el aviso 85,7 kg,
"Ajustado" preseleccionado, Katch-McArdle y Cunningham con "Sin % de grasa medido" y el botón
"Usar el estimado de Deurenberg".

---

## 13. Restricciones para el implementer (obligatorias)

1. **Datos de desarrollo:** ningún dato de negocio preexistente se borra ni cambia. Las únicas
   escrituras son la migración (aditiva) y el script de 10.4, que limpia por id.
2. **Prisma:** `pg_dump` antes; `--create-only` y revisar SQL; nada de `migrate reset`, `db push`
   ni aceptar el reset por drift. Drift → `blocked` con `migrate status`.
3. **WhatsApp:** nada. El script no usa `createAppointment` y comprueba que no se encoló nada.
4. **Lógica:** fórmulas, clasificaciones, validaciones y textos en `packages/core`; carga y
   guardado en `packages/db/domain`. La web no recalcula nada por su cuenta ni duplica rangos.
5. **`useConfirm`:** nunca `await confirm()` dentro de `<form action>` ni de `startTransition`.
6. **UI:** solo el sistema de diseño actual. `tailwind.config.ts` no se toca.
7. **No** correr `next build` ni levantar otro `next dev`. Avisar en `progress/impl_HU-004.md` que
   el `next dev` del usuario necesita reiniciarse (lo hace el orquestador).
8. **Rama** `hu-004-calculadora-requerimiento`, sin commitear, sin tocar `backlog.json`.

## 14. Fuera de alcance (no implementar)

Todo lo de "Fuera de alcance" de la HU. En particular: pediatría (HU-008), plan contra objetivo y
`AdequacyBar` de macros (épica 23, que va a leer `proteinG`/`fatG`/`carbG`), gráfico del VCT,
guardar el diagnóstico, TMB del InBody seleccionable, varias prescripciones por consulta y
configurar umbrales desde el panel.
