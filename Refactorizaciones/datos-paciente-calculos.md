# SDD — HU-001 `datos-paciente-calculos`

HU validada: `docs/hu-datos-paciente-calculos.md`. **Su sección "Resoluciones" manda**; esta SDD
ya la incorpora (4 objetivos, contextura no bloqueante con Mediana asumida, aviso para menores
de 18, datos nuevos también para la IA).

Skill aplicado: `migracion-prisma`.

---

## 1. Resumen funcional

La ficha del paciente del panel (`/pacientes/[id]`) suma una tarjeta **"Datos para cálculos"**
entre "Datos" y "Ficha clínica". Permite cargar cuatro datos de lista cerrada que se guardan en el
paciente y se sobrescriben al cambiar: sexo (para fórmulas), nivel de actividad física, objetivo
nutricional (4 opciones) y contextura. La tarjeta muestra también un resumen de solo lectura con lo
que van a usar las fórmulas: edad (sale de `birthDate`), último peso, última talla y último % de
grasa (cada uno de "Evolución", con su fecha) y la contextura (si falta, "se asume Mediana"). Hay un
aviso de datos faltantes (sin contar contextura ni % de grasa) y otro aviso si el paciente es menor
de 18 años. Las constantes de dominio (factores de actividad, objetivos con sus rangos de ajuste,
ajuste de contextura) y la lógica de "qué falta" van a `packages/core` con tests, para que las
reuse la calculadora (Épica 18). La propuesta de plan con IA y el asistente reciben además sexo,
edad, actividad y objetivo. **Esta HU no calcula TMB, GET ni VCT.**

---

## 2. Workspaces afectados

| Workspace | ¿Se toca? | Qué |
|---|---|---|
| `packages/db` | **Sí** | 4 enums y 4 columnas nullable en `Patient`, 1 migración, 2 funciones nuevas en `domain/`, 1 script de prueba |
| `packages/core` | **Sí** | Archivo nuevo `patient-formula-data.ts` y su test, más el export en `index.ts` |
| `apps/web` | **Sí** | Server action, tarjeta nueva en la ficha, payload de la IA (plan y asistente) |
| `apps/bot` | **No** (solo tiene que compilar) | Ningún cambio de código. Si `typecheck` del bot falla por el schema, se corrige lo mínimo y se anota en `progress/impl_HU-001.md` |

Portal del paciente: **no se toca**.

---

## 3. Esquema (Prisma)

### 3.1 Cambios en `packages/db/prisma/schema.prisma`

Los datos van en **`Patient`**, no en `ClinicalRecord`: `ClinicalRecord` no existe para todos los
pacientes y hay que crearlo con upsert. `Patient` existe siempre, y así la lectura es directa.

Enums nuevos (agregarlos cerca de los otros enums; los nombres de valor son exactos):

```prisma
enum BiologicalSex {
  FEMALE
  MALE
}

enum ActivityLevel {
  SEDENTARY
  LIGHT
  MODERATE
  INTENSE
  VERY_INTENSE
}

enum NutritionGoal {
  LOSE_WEIGHT
  MAINTAIN
  GAIN_WEIGHT
  GAIN_MUSCLE
}

enum BodyFrame {
  SMALL
  MEDIUM
  LARGE
}
```

Campos nuevos en `model Patient` (después de `notes`), **todos nullable y sin `@default`**:

```prisma
  sex           BiologicalSex?
  activityLevel ActivityLevel?
  nutritionGoal NutritionGoal?
  bodyFrame     BodyFrame?
```

No se modifica ningún otro modelo. No hay índices nuevos.

### 3.2 Migración

- Nombre: **`patient_formula_data`** (carpeta `<timestamp>_patient_formula_data`).
- SQL esperado (el implementer lo compara con lo que genera Prisma antes de aplicar):
  - 4 × `CREATE TYPE "..." AS ENUM (...)`.
  - 1 × `ALTER TABLE "Patient" ADD COLUMN "sex" "BiologicalSex", ADD COLUMN "activityLevel" "ActivityLevel", ADD COLUMN "nutritionGoal" "NutritionGoal", ADD COLUMN "bodyFrame" "BodyFrame";`
    (o cuatro `ALTER TABLE`). **Sin `NOT NULL`, sin `DEFAULT`, sin `DROP`, sin `UPDATE`.**
- **Filas existentes:** la base de desarrollo tiene 10 pacientes (contados en solo lectura el
  2026-09-23). Quedan con los 4 campos en `NULL`. No hay backfill ni datos por defecto inventados.
  `prisma migrate status` al momento de esta SDD: "Database schema is up to date!" (9 migraciones).
- Si el SQL generado trae cualquier cosa fuera de lo de arriba (p. ej. un `DROP` o cambios en otras
  tablas, que indican drift), **parar y reportar `blocked`** con la salida de
  `npx dotenv -e ../../.env -- prisma migrate status`.

### 3.3 Alineación de tipos entre core y Prisma

`packages/core` no depende de Prisma. Define sus propias uniones de strings **con los mismos
valores** que los enums de arriba. La alineación la controla `typecheck` en los dos sentidos:
- web → Prisma: la server action valida con `z.enum(SEX_VALUES)` (de core) y le pasa el resultado a
  Prisma. Si core tiene un valor que Prisma no tiene, no compila.
- Prisma → core: la página le pasa `patient.sex` (tipo Prisma) a funciones de core tipadas con
  `Sex | null`. Si Prisma tiene un valor que core no tiene, no compila.

No usar `as` para esquivar ninguna de esas dos asignaciones.

---

## 4. Contrato compartido

### 4.1 `packages/core/src/patient-formula-data.ts` (nuevo), reexportado desde `packages/core/src/index.ts`

Consumidores: **web** (ficha, server action, IA). Más adelante, la calculadora (Épica 18). **Bot:
ninguno.**

```ts
// ── Sexo ──
export const SEX_VALUES = ["FEMALE", "MALE"] as const;
export type Sex = (typeof SEX_VALUES)[number];
export const SEX_OPTIONS: ReadonlyArray<{ value: Sex; label: string }>;
//   FEMALE → "Femenino", MALE → "Masculino"

// ── Actividad física ──
export const ACTIVITY_LEVEL_VALUES = ["SEDENTARY", "LIGHT", "MODERATE", "INTENSE", "VERY_INTENSE"] as const;
export type ActivityLevel = (typeof ACTIVITY_LEVEL_VALUES)[number];
export interface ActivityLevelOption { value: ActivityLevel; label: string; factor: number; description: string }
export const ACTIVITY_LEVELS: ReadonlyArray<ActivityLevelOption>;
//   SEDENTARY    "Sedentario"  1.2   "Poco o ningún ejercicio, trabajo de oficina"
//   LIGHT        "Ligero"      1.375 "Ejercicio ligero 1-3 días/semana"
//   MODERATE     "Moderado"    1.55  "Ejercicio moderado 3-5 días/semana"
//   INTENSE      "Intenso"     1.725 "Ejercicio intenso 6-7 días/semana"
//   VERY_INTENSE "Muy intenso" 1.9   "Ejercicio muy intenso + trabajo físico/entrenamiento doble"
//   (textos copiados de docs/FORMULAS CALORICAS.docx, sección 2)

// ── Objetivo nutricional ──
export const NUTRITION_GOAL_VALUES = ["LOSE_WEIGHT", "MAINTAIN", "GAIN_WEIGHT", "GAIN_MUSCLE"] as const;
export type NutritionGoal = (typeof NUTRITION_GOAL_VALUES)[number];
export interface GoalAdjustmentRange { label: string; minPercent: number; maxPercent: number }
export interface NutritionGoalOption { value: NutritionGoal; label: string; adjustmentRanges: ReadonlyArray<GoalAdjustmentRange> }
export const NUTRITION_GOALS: ReadonlyArray<NutritionGoalOption>;
//   LOSE_WEIGHT "Bajar de peso":
//       { label: "Déficit moderado", minPercent: -25, maxPercent: -15 },
//       { label: "Déficit agresivo (con supervisión)", minPercent: -30, maxPercent: -25 }
//   MAINTAIN    "Mantener":            { label: "Mantenimiento", minPercent: 0, maxPercent: 0 }
//   GAIN_WEIGHT "Subir de peso":       { label: "Superávit", minPercent: 10, maxPercent: 20 }
//   GAIN_MUSCLE "Ganar masa muscular": { label: "Superávit", minPercent: 10, maxPercent: 20 }
//   (sección 3 del documento de fórmulas. Esta HU solo los define; los usa la Épica 18, D3)

// ── Contextura ──
export const BODY_FRAME_VALUES = ["SMALL", "MEDIUM", "LARGE"] as const;
export type BodyFrame = (typeof BODY_FRAME_VALUES)[number];
export interface BodyFrameOption { value: BodyFrame; label: string; hamwiAdjustmentPercent: number }
export const BODY_FRAMES: ReadonlyArray<BodyFrameOption>;
//   SMALL "Pequeña" -10 · MEDIUM "Mediana" 0 · LARGE "Grande" 10
export const DEFAULT_BODY_FRAME: BodyFrame; // "MEDIUM"
export function effectiveBodyFrame(frame: BodyFrame | null): BodyFrame; // null → "MEDIUM"

// ── Etiquetas (null si value es null) ──
export function sexLabel(value: Sex | null): string | null;
export function activityLevelOption(value: ActivityLevel | null): ActivityLevelOption | null;
export function nutritionGoalLabel(value: NutritionGoal | null): string | null;
export function bodyFrameLabel(value: BodyFrame | null): string | null;

// ── Edad ──
export const ADULT_AGE_YEARS = 18;
/**
 * Edad en años cumplidos. `birthDate` viene de una columna @db.Date: Prisma la devuelve como
 * medianoche UTC, así que el día de nacimiento se lee con getUTCFullYear/getUTCMonth/getUTCDate.
 * El "hoy" se toma en `timeZone` (con formatInTimeZone(at, timeZone, "yyyy-MM-dd")).
 */
export function computeAgeYears(birthDate: Date, at: Date, timeZone: string): number;
export function isMinor(ageYears: number | null): boolean; // null → false; < 18 → true
export const MINOR_WARNING_TEXT = "Las fórmulas son para adultos.";

// ── Qué falta ──
export type MissingFormulaDataKey =
  | "sex" | "activityLevel" | "nutritionGoal" | "birthDate" | "weight" | "height";
export interface MissingFormulaDataItem { key: MissingFormulaDataKey; label: string }
export interface FormulaDataPresence {
  sex: Sex | null;
  activityLevel: ActivityLevel | null;
  nutritionGoal: NutritionGoal | null;
  hasBirthDate: boolean;
  weightKg: number | null;
  heightCm: number | null;
  // bodyFrame y bodyFatPercent a propósito NO están: no son faltantes bloqueantes.
}
/** Devuelve los faltantes en este orden fijo:
 *  sex "sexo", activityLevel "actividad física", nutritionGoal "objetivo",
 *  birthDate "fecha de nacimiento", weight "peso", height "talla". */
export function getMissingFormulaData(input: FormulaDataPresence): MissingFormulaDataItem[];
/** null si la lista está vacía. Si no, el texto exacto de la sección 6.2. */
export function missingFormulaDataMessage(items: ReadonlyArray<MissingFormulaDataItem>): string | null;

// ── Números en formato es-AR ──
/** 66.5 → "66,5"; 162 → "162"; 1.375 → "1,375". Intl es-AR, maximumFractionDigits por defecto 3. */
export function formatDecimalEs(value: number, maxFractionDigits?: number): string;
```

### 4.2 `packages/db/domain` (nuevas funciones)

Consumidores: **solo web**. El bot no las usa, pero compila `domain/` y tiene que seguir pasando
`typecheck`.

`packages/db/domain/patients.ts`:

```ts
import type { BiologicalSex, ActivityLevel, NutritionGoal, BodyFrame } from "@prisma/client";

export interface PatientFormulaDataInput {
  sex: BiologicalSex | null;
  activityLevel: ActivityLevel | null;
  nutritionGoal: NutritionGoal | null;
  bodyFrame: BodyFrame | null;
}

/** Sobrescribe los 4 campos (null borra). Solo toca esos 4 campos del paciente `patientId`. */
export function updatePatientFormulaData(patientId: string, data: PatientFormulaDataInput):
  Promise<Patient>; // prisma.patient.update({ where: { id: patientId }, data })
```

`packages/db/domain/clinical.ts`:

```ts
export interface LatestMeasurement { value: number; recordedAt: Date }
export interface LatestFormulaMeasurements {
  weightKg: LatestMeasurement | null;
  heightCm: LatestMeasurement | null;
  bodyFatPercent: LatestMeasurement | null;
}
/** Último valor no nulo de cada medida, cada uno por separado (pueden ser de fechas distintas).
 *  3 × prisma.evolutionEntry.findFirst({ where: { patientId, <campo>: { not: null } },
 *  orderBy: { recordedAt: "desc" } }) en Promise.all. Los Decimal se pasan a number. */
export function getLatestFormulaMeasurements(patientId: string): Promise<LatestFormulaMeasurements>;
```

Esta función reemplaza las consultas "última medición con X" que hoy están duplicadas en
`ai-actions.ts` y `assistant-tools.ts` (nota de implementación de la HU).

Las funciones existentes `findOrCreatePatient` y `findOrCreatePatientByJid` **no cambian**: los
pacientes nuevos nacen con los 4 campos en `NULL` porque no tienen default.

---

## 5. Rutas / server actions / API

### 5.1 Server action nueva: `updateFormulaDataAction`

- Archivo: `apps/web/src/app/(panel)/pacientes/actions.ts` (al lado de `updatePatientAction`).
- Firma: `export async function updateFormulaDataAction(_prev: PatientState, formData: FormData): Promise<PatientState>`
  (reusa `PatientState = { ok: boolean; error?: string }`).
- Campos del form (`name` exactos): `id`, `sex`, `activityLevel`, `nutritionGoal`, `bodyFrame`.
- zod:
  ```ts
  const emptyOr = <T extends readonly [string, ...string[]]>(values: T) =>
    z.union([z.enum(values), z.literal("")]);
  const formulaDataSchema = z.object({
    id: z.string().min(1),
    sex: emptyOr(SEX_VALUES),
    activityLevel: emptyOr(ACTIVITY_LEVEL_VALUES),
    nutritionGoal: emptyOr(NUTRITION_GOAL_VALUES),
    bodyFrame: emptyOr(BODY_FRAME_VALUES),
  });
  ```
  Los 4 campos son **requeridos** en el FormData (los `<select>` siempre los mandan); `""` significa
  "Sin cargar" y se guarda como `null`. Si falta un campo o viene un valor fuera de la lista, se
  devuelve `{ ok: false, error: "Datos inválidos" }` **sin escribir nada**.
- OK: `await updatePatientFormulaData(id, {...})`, `revalidatePath(\`/pacientes/${id}\`)` y
  `return { ok: true }`.
- Auth: el archivo vive en `(panel)` como las demás actions de pacientes; no se agrega nada nuevo
  (misma protección que `updatePatientAction`).

### 5.2 Página `/pacientes/[id]` (`page.tsx`)

- Suma `getLatestFormulaMeasurements(id)` al `Promise.all` existente.
- Arma los props de la tarjeta (sección 6) y la ubica **entre la `Card` "Datos" y la `Card`
  "Ficha clínica"**.
- No se agregan rutas ni endpoints.

### 5.3 IA (D8)

**Propuesta de plan**: `apps/web/src/app/(panel)/pacientes/[id]/planes/[planId]/ai-actions.ts`
- Reemplazar los dos `findFirst` de peso y talla por `getLatestFormulaMeasurements(patientId)`.
- Sumar `prisma.patient.findUnique({ where: { id: patientId }, select: { birthDate, sex, activityLevel, nutritionGoal } })`
  y `getProfessional()` (de `@/lib/professional`, para la zona horaria de la edad).
- El objeto `paciente` que se manda queda así (campos nuevos marcados; **no renombrar los
  existentes**):
  ```ts
  const paciente = {
    objetivo: clinicalRecord?.goals ?? null,                     // existente (texto libre)
    objetivo_nutricional: nutritionGoalLabel(p.nutritionGoal),   // NUEVO, p. ej. "Bajar de peso"
    sexo: sexLabel(p.sex),                                       // NUEVO, "Femenino" | "Masculino" | null
    edad_anios: p.birthDate ? computeAgeYears(p.birthDate, new Date(), pro.timezone) : null, // NUEVO
    actividad_fisica: act ? `${act.label}: ${act.description}` : null, // NUEVO
    factor_actividad: act?.factor ?? null,                       // NUEVO
    antecedentes: clinicalRecord?.background ?? null,            // existente
    peso_kg: m.weightKg?.value ?? null,                          // existente, ahora desde domain
    talla_cm: m.heightCm?.value ?? null,                         // existente, ahora desde domain
    instrucciones_adicionales: instructions || null,             // existente
  };
  ```
  (`act = activityLevelOption(p.activityLevel)`; `m` = resultado de `getLatestFormulaMeasurements`).
- El system prompt **no cambia**.

**Asistente**: `apps/web/src/lib/assistant-tools.ts` → `resumenPaciente`
- Reemplazar el `findFirst` de `lastWeightEntry` por `getLatestFormulaMeasurements(patientId)`
  (`lastEntry`, el último registro de cualquier tipo, queda como está).
- Sumar al objeto de retorno, después de `objetivos`:
  `sexo`, `edad_anios`, `actividad_fisica`, `factor_actividad`, `objetivo_nutricional` (mismos
  valores que arriba; `patient` ya se lee completo). `ultimo_peso_kg` pasa a salir de
  `m.weightKg?.value ?? null`.
- `apps/web/src/app/(panel)/asistente/actions.ts`: cambiar solo la `description` de la tool
  `resumen_paciente` a:
  `"Ficha clínica, sexo, edad, actividad física, objetivo nutricional, último peso registrado, plan activo y próximo turno de un paciente puntual, dado su id."`

---

## 6. UI (panel) — tarjeta "Datos para cálculos"

Componentes: **solo los de `apps/web/src/components/ui.tsx`** (`Card`, `SectionLabel`, `Field`,
`Select`, `Button`, `Badge`) y las clases/tokens que ya usan las otras tarjetas. Nada de rediseño
(eso es la HU-002).

### 6.1 Estructura

`page.tsx`:
```tsx
<Card>
  <SectionLabel>Datos para cálculos</SectionLabel>
  <FormulaDataSection ...props />
</Card>
```

`formula-data-section.tsx` (**server component**, sin `"use client"`) recibe props ya
serializables:
```ts
{
  patientId: string;
  values: { sex: Sex | null; activityLevel: ActivityLevel | null; nutritionGoal: NutritionGoal | null; bodyFrame: BodyFrame | null };
  ageYears: number | null;
  weight: { value: number; dateLabel: string } | null;
  height: { value: number; dateLabel: string } | null;
  bodyFat: { value: number; dateLabel: string } | null;
}
```
`dateLabel` = `formatInTimeZone(recordedAt, pro.timezone, "dd/MM/yyyy")` (no usar `formatDate` de
core, que devuelve "lunes 1 de septiembre"). `ageYears` = `computeAgeYears(patient.birthDate, new Date(), pro.timezone)` o `null`.

Orden del contenido:
1. **Aviso de faltantes** (si `missingFormulaDataMessage(...)` no es `null`): un `<p>` o `<div>`
   con tono de advertencia, **no de error**. Usar las mismas clases de color que el `Badge` `amber`
   (`bg-amber-50 text-amber-700`), con `px-3 py-2 text-sm`. `input` para `getMissingFormulaData`:
   `{ ...values, hasBirthDate: ageYears !== null, weightKg: weight?.value ?? null, heightCm: height?.value ?? null }`.
2. **Aviso de menor de edad** (si `isMinor(ageYears)`): mismo estilo, texto `MINOR_WARNING_TEXT`.
3. **Formulario** `<FormulaDataForm patientId values />` (client, sección 6.3).
4. **Resumen** "Lo que van a usar las fórmulas" (sección 6.4).

### 6.2 Texto exacto del aviso de faltantes

`missingFormulaDataMessage(items)`:
- Primera oración: `Faltan datos para los cálculos: ` + las `label` unidas con `", "` + `.`
- Después, en este orden y solo si aplica, separadas por un espacio:
  - si falta `birthDate`: `La fecha de nacimiento se carga en "Datos".`
  - si faltan `weight` **y** `height`: `El peso y la talla se cargan en "Evolución".`
  - si falta solo `weight`: `El peso se carga en "Evolución".`
  - si falta solo `height`: `La talla se carga en "Evolución".`
- Sexo, actividad y objetivo se cargan en esta misma tarjeta: no llevan oración de ubicación.

Ejemplos (van tal cual como casos de test):
- Paciente preexistente con fecha de nacimiento y peso y talla: `Faltan datos para los cálculos: sexo, actividad física, objetivo.`
- Paciente preexistente sin nada: `Faltan datos para los cálculos: sexo, actividad física, objetivo, fecha de nacimiento, peso, talla. La fecha de nacimiento se carga en "Datos". El peso y la talla se cargan en "Evolución".`
- Con los 4 datos cargados, sin fecha de nacimiento ni talla: `Faltan datos para los cálculos: fecha de nacimiento, talla. La fecha de nacimiento se carga en "Datos". La talla se carga en "Evolución".`

(El Gherkin original listaba "contextura" como faltante; D5 lo reemplaza: **la contextura nunca
aparece en el aviso**.)

### 6.3 Formulario (`formula-data-form.tsx`, `"use client"`)

Mismo patrón que `patient-form.tsx`: `useActionState(updateFormulaDataAction, { ok: false })`,
`<input type="hidden" name="id">`, grilla `grid gap-4 sm:grid-cols-2`.

| `Field` label | hint | `Select name` | Opciones (`value` → texto) |
|---|---|---|---|
| `Sexo (para fórmulas)` | `Sexo biológico, lo usan las fórmulas de TMB y peso ideal.` | `sex` | `""` → `Sin cargar`; `SEX_OPTIONS` → `label` |
| `Actividad física` | — | `activityLevel` | `""` → `Sin cargar`; `ACTIVITY_LEVELS` → `` `${label} (×${formatDecimalEs(factor)}) — ${description}` `` p. ej. `Ligero (×1,375) — Ejercicio ligero 1-3 días/semana` |
| `Objetivo` | — | `nutritionGoal` | `""` → `Sin cargar`; `NUTRITION_GOALS` → `label` (Bajar de peso / Mantener / Subir de peso / Ganar masa muscular) |
| `Contextura` | `Ajusta el peso ideal de Hamwi. Si no se carga, se asume Mediana.` | `bodyFrame` | `""` → `Sin cargar`; `BODY_FRAMES` → `label` |

Cada `Select` usa `defaultValue={values.x ?? ""}`. Botón `Guardar` / `Guardando…` mientras
procesa; `✓ Guardado` (`text-leaf-deep`) si ok; el `state.error` en rojo (`text-red-600`) si
falla. Las clases son las de `patient-form.tsx`.

### 6.4 Resumen de solo lectura

Título chico (`text-sm font-medium text-ink`): `Lo que van a usar las fórmulas`. Debajo, una fila
`flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-ink-soft` con ítems separados por ` · `:

| Ítem | Con dato | Sin dato |
|---|---|---|
| Edad | `Edad 34 años` | `Edad` + `<Badge>Sin cargar</Badge>` |
| Peso | `Peso 66,5 kg (01/09/2026)` | `Peso` + `<Badge>Sin cargar</Badge>` |
| Talla | `Talla 162 cm (10/08/2026)` | `Talla` + `<Badge>Sin cargar</Badge>` |
| Grasa | `Grasa 29,4 % (01/09/2026)` | `Grasa` + `<Badge>Sin dato</Badge>` |
| Contextura | `Contextura Mediana` | `Contextura` + `<Badge>Sin cargar, se asume Mediana</Badge>` |

Números con `formatDecimalEs`. Los `Badge` van con el tono por defecto (`slate`, gris).

---

## 7. Mensajes del bot

**Ninguno.** El bot no pregunta ni muestra estos datos. No se agregan ni cambian textos de
WhatsApp.

---

## 8. Archivos y flujo

Crear:
- `packages/db/prisma/migrations/<timestamp>_patient_formula_data/migration.sql` (generado por Prisma)
- `packages/core/src/patient-formula-data.ts`
- `packages/core/src/patient-formula-data.test.ts`
- `packages/db/scripts/test-formula-data.ts` (prueba contra la base, sección 10)
- `apps/web/src/app/(panel)/pacientes/[id]/formula-data-section.tsx`
- `apps/web/src/app/(panel)/pacientes/[id]/formula-data-form.tsx`

Modificar:
- `packages/db/prisma/schema.prisma`
- `packages/db/domain/patients.ts` (`updatePatientFormulaData`)
- `packages/db/domain/clinical.ts` (`getLatestFormulaMeasurements`)
- `packages/core/src/index.ts` (`export * from "./patient-formula-data";`)
- `apps/web/src/app/(panel)/pacientes/actions.ts` (`updateFormulaDataAction`)
- `apps/web/src/app/(panel)/pacientes/[id]/page.tsx`
- `apps/web/src/app/(panel)/pacientes/[id]/planes/[planId]/ai-actions.ts`
- `apps/web/src/lib/assistant-tools.ts`
- `apps/web/src/app/(panel)/asistente/actions.ts` (solo la `description` de `resumen_paciente`)

**No tocar:** `apps/bot/**` (salvo lo que exija `typecheck`), `packages/db/domain/patients.ts` →
`findOrCreatePatient*`, `apps/web/src/lib/age.ts` y la página del plan que lo usa,
`clinical-record-form.tsx` (el objetivo en texto libre sigue igual), portal, seeds.

Flujo: la profesional elige en los selects → `updateFormulaDataAction` (zod con valores de core) →
`updatePatientFormulaData` (domain) → `revalidatePath` → `page.tsx` vuelve a leer `patient` y
`getLatestFormulaMeasurements` → `FormulaDataSection` recalcula faltantes y edad con core.

---

## 9. Checklist atómico

Antes de empezar: confirmar que estás en la rama de feature que creó el orquestador (`git branch
--show-current` ≠ `main`). Si estás en `main`, reportar `blocked`.

### packages/db — esquema y migración (skill `migracion-prisma`)
- [ ] 9.1 `schema.prisma`: agregar los 4 enums (sección 3.1).
- [ ] 9.2 `schema.prisma`: agregar `sex`, `activityLevel`, `nutritionGoal`, `bodyFrame` nullable,
      sin default, en `Patient`.
- [ ] 9.3 Desde `packages/db`: `npx dotenv -e ../../.env -- prisma migrate dev --create-only --name patient_formula_data`.
      Si Prisma ofrece reset o reporta drift: **cancelar**, correr
      `npx dotenv -e ../../.env -- prisma migrate status` y reportar `blocked`.
- [ ] 9.4 Leer el `migration.sql` y compararlo con la sección 3.2 (solo `CREATE TYPE` y
      `ADD COLUMN` nullable). Pegar el SQL en `progress/impl_HU-001.md`.
- [ ] 9.5 Desde la raíz: `npm run db:migrate` y después `npm run db:generate`.
- [ ] 9.6 Confirmar en solo lectura que los pacientes existentes siguen intactos:
      `docker compose exec -T db psql -U nutri -d nutribot -c 'select count(*), count("sex"), count("activityLevel"), count("nutritionGoal"), count("bodyFrame") from "Patient";'`
      → mismo total que antes y `0` en las cuatro columnas nuevas (si nadie cargó datos todavía).

### packages/core
- [ ] 9.7 Crear `patient-formula-data.ts` con exactamente el contrato de la sección 4.1.
- [ ] 9.8 Exportarlo desde `packages/core/src/index.ts`.
- [ ] 9.9 Crear `patient-formula-data.test.ts` con los casos de la sección 10.1.
- [ ] 9.10 `npm run test` en verde.

### packages/db — domain
- [ ] 9.11 `domain/patients.ts`: `PatientFormulaDataInput` y `updatePatientFormulaData`.
- [ ] 9.12 `domain/clinical.ts`: `LatestMeasurement`, `LatestFormulaMeasurements` y
      `getLatestFormulaMeasurements`.
- [ ] 9.13 `npm run typecheck --workspace packages/db` y `--workspace apps/bot` en verde.

### apps/web
- [ ] 9.14 `pacientes/actions.ts`: `updateFormulaDataAction` (sección 5.1).
- [ ] 9.15 `formula-data-form.tsx` (sección 6.3).
- [ ] 9.16 `formula-data-section.tsx` (secciones 6.1, 6.2 y 6.4).
- [ ] 9.17 `page.tsx`: sumar `getLatestFormulaMeasurements`, armar los props y ubicar la `Card`
      entre "Datos" y "Ficha clínica".
- [ ] 9.18 `ai-actions.ts`: payload de la sección 5.3 y los `findFirst` reemplazados por domain.
- [ ] 9.19 `assistant-tools.ts`: campos nuevos en `resumenPaciente` y peso desde domain.
- [ ] 9.20 `asistente/actions.ts`: `description` nueva de `resumen_paciente`.
- [ ] 9.21 `npm run typecheck` (todos los workspaces) en verde.

### Prueba contra la base
- [ ] 9.22 Crear `packages/db/scripts/test-formula-data.ts` (sección 10.2) y correrlo.

### Cierre
- [ ] 9.23 Correr la verificación completa (sección 11) y escribir `progress/impl_HU-001.md`.

---

## 10. Tests

### 10.1 vitest — `packages/core/src/patient-formula-data.test.ts`

Constantes:
- `ACTIVITY_LEVELS` tiene 5 opciones con factores `[1.2, 1.375, 1.55, 1.725, 1.9]`, en ese orden, y
  la descripción de `LIGHT` es `"Ejercicio ligero 1-3 días/semana"`.
- `NUTRITION_GOALS` tiene los 4 valores en orden; `GAIN_MUSCLE` → `"Ganar masa muscular"`;
  `LOSE_WEIGHT` tiene 2 rangos (-25/-15 y -30/-25); `MAINTAIN` tiene 0/0.
- `BODY_FRAMES`: `SMALL` -10, `MEDIUM` 0, `LARGE` 10.
- `SEX_VALUES`, `ACTIVITY_LEVEL_VALUES`, `NUTRITION_GOAL_VALUES` y `BODY_FRAME_VALUES` coinciden con
  los `value` de sus listas de opciones.

Etiquetas y contextura:
- `effectiveBodyFrame(null)` → `"MEDIUM"`; `effectiveBodyFrame("LARGE")` → `"LARGE"`.
- `sexLabel(null)` → `null`; `sexLabel("FEMALE")` → `"Femenino"`;
  `activityLevelOption("MODERATE")?.factor` → `1.55`; `nutritionGoalLabel("GAIN_WEIGHT")` →
  `"Subir de peso"`; `bodyFrameLabel("SMALL")` → `"Pequeña"`.

Edad (`timeZone = "America/Argentina/Buenos_Aires"`, `birthDate = new Date("1990-09-23T00:00:00Z")`
como la devuelve Prisma para `@db.Date`):
- `at = 2026-09-23T15:00:00Z` (cumpleaños) → `36`.
- `at = 2026-09-22T15:00:00Z` (día anterior) → `35`.
- `at = 2026-09-23T02:00:00Z` (en Buenos Aires todavía es 22/09 a las 23:00) → `35`.
- 29/02: `birthDate 2000-02-29`, `at 2026-02-28T15:00:00Z` → `25`; `at 2026-03-01T15:00:00Z` → `26`.
- `isMinor(17)` → `true`; `isMinor(18)` → `false`; `isMinor(null)` → `false`.

Faltantes:
- Todo cargado → `[]` y `missingFormulaDataMessage([])` → `null`.
- Preexistente sin nada (`hasBirthDate: false`, peso y talla `null`) → las 6 keys en el orden
  `sex, activityLevel, nutritionGoal, birthDate, weight, height`, y el mensaje exacto de la sección 6.2.
- Preexistente con fecha, peso y talla → mensaje `Faltan datos para los cálculos: sexo, actividad física, objetivo.`
- Sin fecha y sin talla → mensaje exacto de la sección 6.2 (tercer ejemplo).
- Solo falta el peso → termina en `El peso se carga en "Evolución".`
- `weightKg: 0`: se considera cargado (el faltante se decide por `null`, no por falsy).
- El tipo `FormulaDataPresence` no tiene `bodyFrame` ni `bodyFatPercent`: se cubre con un caso
  "sin contextura ni grasa, el resto completo → `[]`" armando el input desde un objeto que además
  tenga esas propiedades en `null` (via variable intermedia, para que TS no marque exceso de propiedades).

Formato:
- `formatDecimalEs(66.5)` → `"66,5"`; `formatDecimalEs(162)` → `"162"`;
  `formatDecimalEs(1.375)` → `"1,375"`; `formatDecimalEs(29.4)` → `"29,4"`.

### 10.2 Prueba contra la base — `packages/db/scripts/test-formula-data.ts`

Script `tsx` que usa **solo sus propios datos**:
1. Crea un paciente propio con `prisma.patient.create` y un `whatsappJid` imposible
   (`test-hu001-${Date.now()}@test.invalid`, `phone: "000"`), y guarda su `id`.
2. Chequea que los 4 campos nuevos nacen en `null`.
3. `updatePatientFormulaData(id, { sex: "FEMALE", activityLevel: "LIGHT", nutritionGoal: "LOSE_WEIGHT", bodyFrame: "MEDIUM" })`,
   relee y chequea. Después `bodyFrame: null` → chequea que queda `null` y que los otros 3 no
   cambiaron.
4. Crea 2 `EvolutionEntry` del paciente propio (10/08: peso 68, talla 162; 01/09: peso 66.5, grasa
   29.4, sin talla) y guarda sus `id`. `getLatestFormulaMeasurements(id)` tiene que devolver peso
   66.5 (01/09), talla 162 (10/08) y grasa 29.4 (01/09).
5. En `finally`: `prisma.evolutionEntry.delete` **por cada id creado** y
   `prisma.patient.delete({ where: { id } })`. **Prohibido `deleteMany` con filtros amplios** (por
   `patientId`, por fecha, etc.) y prohibido tocar pacientes que el script no creó.
6. Imprime `OK` o tira error (exit code ≠ 0).

Correr desde `packages/db`: `npx dotenv -e ../../.env -- tsx scripts/test-formula-data.ts`.
Este script no toca `OutboundMessage` ni el bot.

---

## 11. Verificación (el implementer la corre antes de declararse `done`)

Desde la raíz del repo:

```bash
git branch --show-current                     # distinto de main
(cd packages/db && npx dotenv -e ../../.env -- prisma migrate status)   # "up to date"
npm run db:generate
npm run test                                  # vitest de packages/core, incluye el test nuevo
npm run typecheck                             # core, db, web y bot en verde
(cd packages/db && npx dotenv -e ../../.env -- tsx scripts/test-formula-data.ts)  # imprime OK
npm run build --workspace apps/web            # detecta problemas de límites server/client
npm run test:confirm-flow --workspace apps/bot   # el bot sigue andando con el schema nuevo (no manda WhatsApp real; limpia por id)
docker compose exec -T db psql -U nutri -d nutribot -c 'select count(*) from "Patient";'  # mismo total que antes de empezar
./ops/harness/verify.sh
```

Pegar la salida resumida de cada comando en `progress/impl_HU-001.md`. Si `npm run dev` y un
login están disponibles, además revisar a mano la ficha de un paciente **creado para la prueba y
borrado por id después** (no editar pacientes existentes).

---

## 12. Restricciones para el implementer (obligatorias)

1. **Campos nuevos nullable y sin default.** Los pacientes existentes de la base de desarrollo
   **no se tocan**: ni backfill, ni `UPDATE`, ni edición desde la UI durante las pruebas.
2. **Pruebas contra la base: solo con datos propios, borrados por id.** Nunca `deleteMany` con
   filtros amplios. No correr `db:seed` ni `seed:demo`.
3. **Prisma:** prohibidos `prisma migrate reset`, aceptar el reset por drift, `prisma db push` y
   editar una migración ya aplicada. Si hay drift → `blocked` con la salida de `migrate status`.
4. **Bot:** no se toca salvo lo que exija `typecheck`. **Ninguna verificación manda mensajes reales
   de WhatsApp.** No encolar en `OutboundMessage`.
5. **UI:** solo los componentes actuales de `apps/web/src/components/ui.tsx`. El rediseño es la
   HU-002.
6. **Rama:** trabajo en la rama de feature que crea el orquestador. No commitear en `main`. No
   tocar `backlog.json`.
7. Todo dato de dominio (factores, etiquetas, rangos, ±10 %) sale de `packages/core`: nada
   hardcodeado en los componentes ni en la server action.

---

## 13. Observaciones fuera de alcance (no implementar)

- `apps/web/src/lib/age.ts` (`calculateAge`) lee la `birthDate` `@db.Date` con getters locales. En
  una zona UTC-3 puede restar un año el día del cumpleaños. La ficha nueva y la IA usan
  `computeAgeYears` de core, que no tiene ese problema; la página del plan sigue usando
  `calculateAge`. Unificarlo es un cambio directo aparte, fuera de esta HU.

Sin dudas técnicas bloqueantes.
