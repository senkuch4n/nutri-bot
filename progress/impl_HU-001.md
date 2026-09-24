# impl HU-001 — `datos-paciente-calculos`

**Estado: done**
Rama: `hu-001-datos-paciente-calculos` (sin commits; lo decide el orquestador).
SDD: `Refactorizaciones/datos-paciente-calculos.md`. Checklist 9.1–9.23 completo, con la
excepción documentada de `test:confirm-flow` (ver "Verificación no corrida").

## Archivos tocados

Creados:
- `packages/db/prisma/migrations/20260924022353_patient_formula_data/migration.sql`
- `packages/core/src/patient-formula-data.ts`
- `packages/core/src/patient-formula-data.test.ts` (19 tests)
- `apps/web/src/app/(panel)/pacientes/[id]/formula-data-section.tsx` (server component)
- `apps/web/src/app/(panel)/pacientes/[id]/formula-data-form.tsx` (`"use client"`)

Modificados:
- `packages/db/prisma/schema.prisma`: 4 enums y 4 campos nullable en `Patient`
- `packages/db/domain/patients.ts`: `PatientFormulaDataInput`, `updatePatientFormulaData`
- `packages/db/domain/clinical.ts`: `LatestMeasurement`, `LatestFormulaMeasurements`, `getLatestFormulaMeasurements`
- `packages/core/src/index.ts`: `export * from "./patient-formula-data";`
- `apps/web/src/app/(panel)/pacientes/actions.ts`: `updateFormulaDataAction`
- `apps/web/src/app/(panel)/pacientes/[id]/page.tsx`: `getLatestFormulaMeasurements` en el `Promise.all` y la nueva `Card` entre "Datos" y "Ficha clínica"
- `apps/web/src/app/(panel)/pacientes/[id]/planes/[planId]/ai-actions.ts`: payload `paciente` de la sección 5.3
- `apps/web/src/lib/assistant-tools.ts`: `resumenPaciente` con los campos nuevos; el peso sale de domain
- `apps/web/src/app/(panel)/asistente/actions.ts`: solo la `description` de `resumen_paciente`

Creado y borrado: `packages/db/scripts/test-formula-data.ts` (sección 10.2). Lo corrí y después lo
borré, como indicó el orquestador. La carpeta `packages/db/scripts/` ya no existe.

`apps/bot`: sin cambios; typecheck en verde.

Nota: `AGENTS.md`, `CLAUDE.md`, `backlog.json` y `progress/current.md` figuran como modificados
en el working tree, pero no los toqué yo.

## Migración

`npx dotenv -e ../../.env -- prisma migrate dev --create-only --name patient_formula_data`: se creó
sin drift ni oferta de reset. Antes, `migrate status` daba "9 migrations found… up to date".

SQL revisado antes de aplicar. Solo tiene `CREATE TYPE` y `ADD COLUMN` nullable, sin `NOT NULL`,
`DEFAULT`, `DROP`, `UPDATE` ni otras tablas:

```sql
-- CreateEnum
CREATE TYPE "BiologicalSex" AS ENUM ('FEMALE', 'MALE');
-- CreateEnum
CREATE TYPE "ActivityLevel" AS ENUM ('SEDENTARY', 'LIGHT', 'MODERATE', 'INTENSE', 'VERY_INTENSE');
-- CreateEnum
CREATE TYPE "NutritionGoal" AS ENUM ('LOSE_WEIGHT', 'MAINTAIN', 'GAIN_WEIGHT', 'GAIN_MUSCLE');
-- CreateEnum
CREATE TYPE "BodyFrame" AS ENUM ('SMALL', 'MEDIUM', 'LARGE');
-- AlterTable
ALTER TABLE "Patient" ADD COLUMN     "activityLevel" "ActivityLevel",
ADD COLUMN     "bodyFrame" "BodyFrame",
ADD COLUMN     "nutritionGoal" "NutritionGoal",
ADD COLUMN     "sex" "BiologicalSex";
```

Aplicada con `npm run db:migrate` ("Applying migration `20260924022353_patient_formula_data`…
Your database is now in sync"). Después corrí `npm run db:generate`.

Pacientes existentes (9.6), en solo lectura:
- Antes: `count = 10`.
- Después: `count 10 | sex 0 | activityLevel 0 | nutritionGoal 0 | bodyFrame 0`.

## Verificación (sección 11)

| Comando | Resultado |
|---|---|
| `git branch --show-current` | `hu-001-datos-paciente-calculos` |
| `prisma migrate status` | 10 migrations found, "Database schema is up to date!" |
| `npm run db:generate` | Generated Prisma Client (v5.22.0) |
| `npm run test` | 7 archivos, 49 tests OK (19 nuevos en `patient-formula-data.test.ts`) |
| `npm run typecheck` | core, db, bot y web limpios |
| `tsx scripts/test-formula-data.ts` | `OK`, exit 0. Después: 0 pacientes `test-hu001-%` en la base y 10 pacientes en total |
| `npm run build --workspace apps/web` | exit 0; `/pacientes/[id]` compila (5.91 kB). Los únicos warnings son los de siempre de `jose`/Edge Runtime por next-auth, sin relación con esta HU. El único `next dev` que corría era de otro proyecto (Evidentia-GFD), así que el build no pisó ningún `.next` en uso |
| `select count(*) from "Patient"` | 10, igual que al empezar |
| `./ops/harness/verify.sh` | Todo OK salvo `[FAIL] schema.prisma inválido (npx prisma validate)`. Es un **bug del script**, no del schema (ver abajo) |

### `verify.sh` → falso FAIL en `prisma validate`

La línea 82 de `ops/harness/verify.sh` corre `cd packages/db && npx prisma validate` sin cargar el
`.env` de la raíz. Por eso Prisma falla con `P1012 Environment variable not found: DATABASE_URL`.
Con el env cargado (`npx dotenv -e ../../.env -- prisma validate`) da "The schema at
prisma/schema.prisma is valid". No lo toqué porque es un archivo del arnés. **El orquestador tiene
que corregir el script** (por ejemplo, con `npx dotenv -e ../../.env -- prisma validate`). Si no, el
chequeo va a dar FAIL cada vez que cambie `schema.prisma`.

### Verificación no corrida: `npm run test:confirm-flow --workspace apps/bot`

No la corrí a propósito, por las reglas duras de datos y WhatsApp. El script llama a
`enqueueAttendanceConfirmations()` y a `enqueuePrepInstructions()`, que son los crons reales, sin
filtrar por paciente:
- Si algún turno **real** cae en la ventana de 72 h a 72 h 30 min, esos crons encolan un
  `OutboundMessage` al JID real del paciente.
- También modifican `Appointment.confirmationRequestedAt` y `ConversationState` de ese turno.
- La limpieza del script borra solo lo del paciente de test, así que el mensaje real quedaría en
  cola y el bot lo mandaría la próxima vez que arranque.

Esta HU no toca el bot ni `reminders.ts`, y el typecheck del bot pasa con el schema nuevo. Si el
orquestador o el usuario quieren correrlo igual, antes conviene comprobar en solo lectura que no
haya turnos `CONFIRMED` en esas ventanas. Queda como observación para el arnés: el script no es
seguro contra una base con datos reales.

## Contrato compartido: coincidencia con la SDD

- **Core (4.1):** exporta exactamente estos nombres, con los valores y textos de la SDD:
  - Sexo: `SEX_VALUES`, `Sex`, `SEX_OPTIONS`.
  - Actividad: `ACTIVITY_LEVEL_VALUES`, `ActivityLevel`, `ActivityLevelOption`, `ACTIVITY_LEVELS`.
  - Objetivo: `NUTRITION_GOAL_VALUES`, `NutritionGoal`, `GoalAdjustmentRange`, `NutritionGoalOption`, `NUTRITION_GOALS`.
  - Contextura: `BODY_FRAME_VALUES`, `BodyFrame`, `BodyFrameOption`, `BODY_FRAMES`, `DEFAULT_BODY_FRAME`, `effectiveBodyFrame`.
  - Etiquetas: `sexLabel`, `activityLevelOption`, `nutritionGoalLabel`, `bodyFrameLabel`.
  - Edad: `ADULT_AGE_YEARS`, `computeAgeYears(birthDate, at, timeZone)`, `isMinor`, `MINOR_WARNING_TEXT`.
  - Faltantes: `MissingFormulaDataKey`, `MissingFormulaDataItem`, `FormulaDataPresence`, `getMissingFormulaData`, `missingFormulaDataMessage`.
  - Formato: `formatDecimalEs(value, maxFractionDigits = 3)`.
- **Domain (4.2):**
  - `PatientFormulaDataInput` y `updatePatientFormulaData(patientId, data)` en `patients.ts`, que actualiza solo esos 4 campos.
  - `LatestMeasurement`, `LatestFormulaMeasurements` y `getLatestFormulaMeasurements(patientId)` en `clinical.ts`: 3 `findFirst` en `Promise.all`, con `Decimal` convertido a `number`.
  - `findOrCreatePatient*` no se tocaron.
- **Server action (5.1):** `updateFormulaDataAction(_prev: PatientState, formData)`.
  - zod con `emptyOr(...)` sobre los `*_VALUES` de core; `""` se guarda como `null`.
  - Si falla la validación devuelve `"Datos inválidos"` sin escribir nada.
  - Si sale bien: `revalidatePath(/pacientes/${id})`.
- **Alineación de tipos (3.3):** no hay ningún `as` en las asignaciones core ↔ Prisma. La página
  pasa `patient.sex` etc. directo a las props tipadas con core, y la action pasa los valores de zod
  directo a domain. El typecheck pasa en los dos sentidos.
- **IA (5.3):**
  - El payload `paciente` suma `objetivo_nutricional`, `sexo`, `edad_anios`, `actividad_fisica` y `factor_actividad`. Los nombres existentes no cambiaron y el system prompt tampoco.
  - En el asistente, los campos nuevos van después de `objetivos`, y `ultimo_peso_kg` sale de domain. `lastEntry` sigue igual.

## Decisiones no obvias

- **`ai-actions.ts`:** uso `p?.…` porque `findUnique` puede devolver `null` (la SDD escribe `p.`).
  Si el paciente no existe, los campos nuevos quedan en `null` y no se rompe.
- **Peso y talla con valor 0:** antes, `peso_kg`/`talla_cm` usaban truthiness (0 → `null`). Ahora
  salen de domain, y un 0 se pasa como 0. Es irrelevante en la práctica y coincide con la regla de
  faltantes de core (se decide por `null`).
- **Edad y fechas:** la edad del resumen y de la IA usa `computeAgeYears` de core con
  `pro.timezone`. Las fechas del resumen usan `formatInTimeZone(..., "dd/MM/yyyy")`, como pide la
  SDD. `lib/age.ts` no se tocó (queda como observación fuera de alcance en la SDD).
- **Resumen:** es una `<ul>` con un `<li>` por dato. El separador `·` lleva `aria-hidden`. El título
  "Lo que van a usar las fórmulas" es un `<h3>`, porque `SectionLabel` ya es `<h2>`. Queda separado
  del formulario con `border-t border-line pt-4`, un token que ya existe.
- **Avisos** (faltantes y menor de edad): `<p>` con `bg-amber-50 px-3 py-2 text-sm text-amber-700`,
  el tono del `Badge` amber. No les puse `role="alert"`, porque son estado de la página al cargar y
  no un evento. Así el lector de pantalla no los anuncia en cada render.

## Skills de UI

- **`ui-ux-pro-max`:** consultado antes del JSX (dominio `ux`: feedback de envío, labels y avisos).
  Qué apliqué:
  - Estados visibles del botón (`Guardando…` deshabilitado, `✓ Guardado`, error en rojo).
  - Labels visibles, envolviendo los controles con `Field`.
  - Avisos con HTML semántico, sin `role="alert"` en contenido estático.
  - Jerarquía h2 → h3.
- **`web-design-guidelines`** (autochequeo contra las Vercel Web Interface Guidelines). Correcciones
  aplicadas:
  1. El feedback del guardado ahora vive dentro de un `<span role="status" aria-live="polite">`,
     para que el lector de pantalla anuncie "✓ Guardado" / "Datos inválidos". No cambia el aspecto
     visual respecto de `patient-form.tsx`.
  2. Espacio no separable (` `) entre número y unidad ("66,5 kg", "34 años"), para que el
     número y la unidad no queden en renglones distintos dentro de la fila con wrap.
  3. El separador decorativo `·` lleva `aria-hidden="true"`.

  Observaciones que no corregí, a propósito:
  - `Select`/`inputClass` de `ui.tsx` usan `outline-none` con `focus:ring-2` en lugar de
    `focus-visible`. Es un componente compartido y su rediseño es la HU-002.
  - Las comillas rectas en `"Datos"`/`"Evolución"` son el texto exacto del contrato (sección 6.2) y
    están cubiertas por tests.
  - Las guías piden Title Case, pero la UI está en castellano.
  - "Datos inválidos" es el texto fijado por la HU.

## Prueba contra la base (10.2)

`packages/db/scripts/test-formula-data.ts` hizo lo siguiente:
1. Creó un paciente propio (`test-hu001-<ts>@test.invalid`, phone `000`) y comprobó que los 4
   campos nacen `null`.
2. Guardó FEMALE/LIGHT/LOSE_WEIGHT/MEDIUM y comprobó los valores. Después pasó `bodyFrame: null` y
   comprobó que la contextura queda en `null` y que los otros 3 no cambian.
3. Creó 2 `EvolutionEntry` (10/08: 68 kg, 162 cm; 01/09: 66,5 kg, 29,4 %).
   `getLatestFormulaMeasurements` devolvió peso 66,5 (01/09), talla 162 (10/08) y grasa 29,4
   (01/09).
4. En el `finally`, borró cada `EvolutionEntry` por id y el paciente por id. No usó `deleteMany` ni
   tocó `OutboundMessage`.

Salida: `OK`. Después confirmé en solo lectura que quedan 0 pacientes de test y 10 en total.

No hice la revisión manual en el navegador: no había sesión de `next dev` ni login de NutriBot
disponibles.
