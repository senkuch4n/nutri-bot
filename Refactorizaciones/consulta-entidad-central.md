# SDD: HU-003 `consulta-entidad-central`

HU validada: `docs/hu-consulta-entidad-central.md`. **Su sección "Resoluciones" manda.** Se
aceptan D1 a D11 tal como las recomendó el afinador. Esta SDD las baja a código.

Skills aplicados: `migracion-prisma` (con backfill de datos, sección 3) y `ui` (sección 7).

Rama: `hu-003-consulta-entidad-central`. **No se commitea.** El orquestador hace el recorrido
en el navegador (sección 12).

---

## 1. Resumen funcional

Se crea la entidad **Consulta** (`Consultation`), que representa una visita del paciente en una
fecha. Puede venir de un turno (como mucho una por turno, lo garantiza un índice único) o no
("Sin turno"). Agrupa las mediciones de ese día (`EvolutionEntry.consultationId`), unas notas
libres y opcionalmente un plan indicado, que es un puntero a un `NutritionPlan` existente.
Cuando un turno pasa a `COMPLETED`, `setAppointmentStatus` crea su consulta en la misma
transacción. Cuando sale de `COMPLETED`, borra la consulta si está vacía y la conserva si tiene
contenido. La ficha suma la pestaña **Consultas**, en segundo lugar. Hay una página de detalle
`/pacientes/[id]/consultas/[consultationId]` con encabezado (edad a la fecha de la consulta),
mediciones agrupadas en Antropometría y Bioimpedancia, plan indicado, notas y "Eliminar
consulta". Las mediciones cargadas desde Evolución caen en la consulta de ese día o crean una
"Sin turno". Una migración aditiva e idempotente crea las consultas de los turnos `COMPLETED` y
de los días con mediciones que ya existen, y vincula cada medición. No cambia ningún valor. El
bot y el portal no cambian.

---

## 2. Workspaces afectados

| Workspace | ¿Se toca? | Qué |
|---|---|---|
| `packages/db` | **Sí** | Modelo `Consultation`, columna `EvolutionEntry.consultationId`, back-relations, 1 migración con backfill, `domain/consultations.ts` (nuevo), cambios en `domain/appointments.ts` (`setAppointmentStatus`), `domain/clinical.ts` (alta de medición) y `domain/nutritionPlans.ts` (`listPatientPlans` incluye la consulta), 1 script de prueba |
| `packages/core` | **Sí** | `src/consultations.ts` (nuevo, puro) + `src/consultations.test.ts` + export en `src/index.ts` |
| `apps/web` | **Sí** | Pestaña Consultas, página de detalle, server actions, panel del turno, API del calendario, Evolución, Turnos y Planes |
| `apps/bot` | **No** (solo tiene que compilar) | El bot nunca pone un turno en `COMPLETED` ni lo saca de ese estado (ver 4.4). Sin cambios de código ni textos nuevos. `typecheck` del bot tiene que pasar |

Portal del paciente (`(portal)`): **no se toca**. Sigue leyendo `EvolutionEntry` directo, y la
columna nueva es nullable.

`tailwind.config.ts`: **no se toca**. No hay colores nuevos.

---

## 3. Esquema (Prisma) y migración

### 3.1 Cambios en `packages/db/prisma/schema.prisma`

Modelo nuevo. Va después de `EvolutionEntry`:

```prisma
/// Una visita del paciente (HU-003). Viene de un turno (appointmentId, único) o es "Sin turno".
/// Extensiones futuras cuelgan de acá: prescripción (HU-004), estudios ISAK / bioimpedancia (HU-006).
model Consultation {
  id            String          @id @default(cuid())
  patientId     String
  patient       Patient         @relation(fields: [patientId], references: [id], onDelete: Cascade)
  appointmentId String?         @unique
  appointment   Appointment?    @relation(fields: [appointmentId], references: [id], onDelete: SetNull)
  /// Turno: = Appointment.startsAt. Sin turno: el día elegido a las 12:00 en Professional.timezone.
  consultedAt   DateTime
  notes         String?
  planId        String?
  plan          NutritionPlan?  @relation(fields: [planId], references: [id], onDelete: SetNull)
  createdAt     DateTime        @default(now())
  updatedAt     DateTime        @updatedAt

  evolutionEntries EvolutionEntry[]

  @@index([patientId, consultedAt])
  @@index([planId])
}
```

Cambios en modelos existentes. **Solo se agregan campos.** No se renombra ni se borra nada:

```prisma
model Patient {
  // ... todo igual, más:
  consultations Consultation[]
}

model Appointment {
  // ... todo igual, más:
  consultation Consultation?
}

model NutritionPlan {
  // ... todo igual, más:
  consultations Consultation[]
}

model EvolutionEntry {
  // ... todo igual, más (después de `note`):
  consultationId String?
  consultation   Consultation? @relation(fields: [consultationId], references: [id], onDelete: SetNull)

  @@index([patientId, recordedAt])   // ya existe
  @@index([consultationId])           // nuevo
}
```

Decisiones:
- **`consultationId` es nullable a propósito.** El backfill lo completa para todas las filas.
  Todo alta nueva pasa por una consulta (4.2). Queda nullable para que la migración sea
  reversible y para no romper `seed-demo.ts`, que crea `EvolutionEntry` directo.
- **`onDelete: SetNull` en `EvolutionEntry.consultationId`**, no `Restrict`. La regla "no se borra
  una consulta con mediciones" la hace cumplir el dominio (`deleteConsultation`). Con `Restrict`,
  el borrado en cascada de un paciente podría fallar. Con `SetNull`, un borrado inesperado de una
  consulta nunca borra una medición.
- **`Consultation.planId` con `SetNull`**: si se borra un plan, las consultas que lo indicaban
  quedan sin plan (D8). Varias consultas pueden apuntar al mismo plan. No hay `@unique`.
- **Sin `@@unique([patientId, día])`** (D5: se permiten dos consultas el mismo día).
- **`Appointment` sin cascade hacia la consulta** (`SetNull`): hoy nadie borra turnos salvo el
  script del bot, y ese script solo borra turnos que no tienen consulta.

### 3.2 Migración

- Nombre: **`consultation_entity`**. Se crea desde `packages/db` con
  `npx dotenv -e ../../.env -- prisma migrate dev --create-only --name consultation_entity`.
- Estado previo, visto en solo lectura el 2026-09-24: `prisma migrate status` da "Database schema
  is up to date!" con 10 migraciones. Si no da eso, el implementer para y reporta `blocked`.
- **SQL que tiene que generar Prisma.** El implementer lo compara antes de tocar nada. El orden
  de los statements puede variar.

```sql
-- AlterTable
ALTER TABLE "EvolutionEntry" ADD COLUMN "consultationId" TEXT;

-- CreateTable
CREATE TABLE "Consultation" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "appointmentId" TEXT,
    "consultedAt" TIMESTAMP(3) NOT NULL,
    "notes" TEXT,
    "planId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Consultation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Consultation_appointmentId_key" ON "Consultation"("appointmentId");
CREATE INDEX "Consultation_patientId_consultedAt_idx" ON "Consultation"("patientId", "consultedAt");
CREATE INDEX "Consultation_planId_idx" ON "Consultation"("planId");
CREATE INDEX "EvolutionEntry_consultationId_idx" ON "EvolutionEntry"("consultationId");

-- AddForeignKey (x4)
ALTER TABLE "EvolutionEntry" ADD CONSTRAINT "EvolutionEntry_consultationId_fkey" FOREIGN KEY ("consultationId") REFERENCES "Consultation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Consultation" ADD CONSTRAINT "Consultation_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Consultation" ADD CONSTRAINT "Consultation_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Consultation" ADD CONSTRAINT "Consultation_planId_fkey" FOREIGN KEY ("planId") REFERENCES "NutritionPlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;
```

  Los `NOT NULL` están todos en una tabla **nueva y vacía**. La única columna que se agrega a una
  tabla con filas es `consultationId`, que es nullable y sin default. **Si aparece cualquier
  `DROP`, cualquier cambio en otra tabla o columna, o un `ALTER TYPE`, hay drift: parar y
  reportar `blocked`** con la salida de `prisma migrate status`.

### 3.3 Backfill (D1 y D2): SQL exacto, al final de `migration.sql`

El implementer lo **agrega a mano** después del SQL generado, sin tocar lo generado. Reglas que
cumple:
- Solo `INSERT INTO "Consultation"` y `UPDATE "EvolutionEntry" SET "consultationId"`. Ningún otro
  valor cambia. No hay `DELETE`.
- **Idempotente.** Los ids son determinísticos (`'mig003_' || md5(...)`), se usan
  `ON CONFLICT ("id") DO NOTHING` y `NOT EXISTS`, y el `UPDATE` solo toca filas con
  `"consultationId" IS NULL`. Correrlo dos veces inserta 0 filas y actualiza 0 filas.
- **Día en la zona de la profesional.** `recordedAt` y `startsAt` son `timestamp without time
  zone` guardados en UTC. El día local es
  `(col AT TIME ZONE 'UTC' AT TIME ZONE <tz>)::date`. La zona sale de `Professional.timezone`
  (fila `id = 1`), con `'America/Argentina/Buenos_Aires'` si no hay fila.
- Regla D1: si ese día el paciente tiene **exactamente un** turno `COMPLETED`, la medición va a la
  consulta de ese turno. Si no, va a una consulta "Sin turno" del día, una sola por
  paciente y día, con `consultedAt` = el día a las 12:00 locales.

```sql
-- ─── Backfill HU-003 (D1/D2) ─────────────────────────────────────────────────
-- Solo INSERT en "Consultation" y UPDATE de "EvolutionEntry"."consultationId".
-- Idempotente: ids determinísticos + ON CONFLICT / NOT EXISTS + "consultationId" IS NULL.

-- 1) D2: una consulta por turno COMPLETED que todavía no tenga.
INSERT INTO "Consultation" ("id", "patientId", "appointmentId", "consultedAt", "createdAt", "updatedAt")
SELECT 'mig003_' || md5('appt:' || a."id"), a."patientId", a."id", a."startsAt", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Appointment" a
WHERE a."status" = 'COMPLETED'
  AND NOT EXISTS (SELECT 1 FROM "Consultation" c WHERE c."appointmentId" = a."id")
ON CONFLICT ("id") DO NOTHING;

-- 2) D1: consultas "Sin turno" para los días con mediciones sueltas que no tienen
--    exactamente un turno COMPLETED ese día.
WITH tz AS (
  SELECT COALESCE((SELECT "timezone" FROM "Professional" WHERE "id" = 1), 'America/Argentina/Buenos_Aires') AS name
),
evo_days AS (
  SELECT DISTINCT e."patientId", (e."recordedAt" AT TIME ZONE 'UTC' AT TIME ZONE tz.name)::date AS day
  FROM "EvolutionEntry" e CROSS JOIN tz
  WHERE e."consultationId" IS NULL
),
single_appt_days AS (
  SELECT a."patientId", (a."startsAt" AT TIME ZONE 'UTC' AT TIME ZONE tz.name)::date AS day
  FROM "Appointment" a CROSS JOIN tz
  WHERE a."status" = 'COMPLETED'
  GROUP BY 1, 2
  HAVING count(*) = 1
)
INSERT INTO "Consultation" ("id", "patientId", "appointmentId", "consultedAt", "createdAt", "updatedAt")
SELECT 'mig003_' || md5('day:' || d."patientId" || ':' || d.day::text),
       d."patientId",
       NULL,
       ((d.day + time '12:00') AT TIME ZONE tz.name) AT TIME ZONE 'UTC',
       CURRENT_TIMESTAMP,
       CURRENT_TIMESTAMP
FROM evo_days d
CROSS JOIN tz
WHERE NOT EXISTS (
  SELECT 1 FROM single_appt_days s WHERE s."patientId" = d."patientId" AND s.day = d.day
)
ON CONFLICT ("id") DO NOTHING;

-- 3) D1: vincular cada medición suelta con su consulta.
WITH tz AS (
  SELECT COALESCE((SELECT "timezone" FROM "Professional" WHERE "id" = 1), 'America/Argentina/Buenos_Aires') AS name
),
entries AS (
  SELECT e."id", e."patientId", (e."recordedAt" AT TIME ZONE 'UTC' AT TIME ZONE tz.name)::date AS day
  FROM "EvolutionEntry" e CROSS JOIN tz
  WHERE e."consultationId" IS NULL
),
single_appt AS (
  SELECT a."patientId", (a."startsAt" AT TIME ZONE 'UTC' AT TIME ZONE tz.name)::date AS day, min(a."id") AS appointment_id
  FROM "Appointment" a CROSS JOIN tz
  WHERE a."status" = 'COMPLETED'
  GROUP BY 1, 2
  HAVING count(*) = 1
),
target AS (
  SELECT en."id" AS entry_id,
         COALESCE(c."id", 'mig003_' || md5('day:' || en."patientId" || ':' || en.day::text)) AS consultation_id
  FROM entries en
  LEFT JOIN single_appt sa ON sa."patientId" = en."patientId" AND sa.day = en.day
  LEFT JOIN "Consultation" c ON c."appointmentId" = sa.appointment_id
)
UPDATE "EvolutionEntry" e
SET "consultationId" = t.consultation_id
FROM target t
WHERE e."id" = t.entry_id
  AND e."consultationId" IS NULL
  AND EXISTS (SELECT 1 FROM "Consultation" c2 WHERE c2."id" = t.consultation_id);
```

Los planes existentes **no se tocan** (D8). Ninguna consulta migrada tiene `planId` ni `notes`.

**Reversión.** Está documentada y **no se ejecuta**. Esto devuelve la base al estado anterior sin
perder datos de antes de la HU:
`ALTER TABLE "EvolutionEntry" DROP COLUMN "consultationId"; DROP TABLE "Consultation";`

### 3.4 Verificación del backfill (solo lectura, antes y después)

Todo con `docker compose exec -T db psql -U nutri -d nutribot -v ON_ERROR_STOP=1`. El implementer
pega las salidas en `progress/impl_HU-003.md`.

**A. Antes de aplicar** (en `BEGIN READ ONLY; ... ROLLBACK;`):

```sql
-- A1. Conteos
SELECT (SELECT count(*) FROM "Patient") AS patients,
       (SELECT count(*) FROM "EvolutionEntry") AS entries,
       (SELECT count(*) FROM "Appointment") AS appts,
       (SELECT count(*) FROM "Appointment" WHERE "status" = 'COMPLETED') AS completed,
       (SELECT count(*) FROM "NutritionPlan") AS plans;
SELECT "patientId", count(*) FROM "EvolutionEntry" GROUP BY 1 ORDER BY 1;

-- A2. Huellas de los valores (se repiten igual en C2)
SELECT md5(string_agg(ROW(e."id", e."patientId", e."recordedAt", e."weightKg", e."heightCm", e."waistCm", e."hipCm",
  e."armCm", e."thighCm", e."calfCm", e."tricepsSkinfoldMm", e."subscapularSkinfoldMm", e."abdominalSkinfoldMm",
  e."bodyFatPercent", e."muscleMassKg", e."bodyWaterPercent", e."visceralFatLevel", e."boneMassKg",
  e."basalMetabolicRateKcal", e."note", e."createdAt")::text, E'\n' ORDER BY e."id")) AS evo_hash
FROM "EvolutionEntry" e;
SELECT md5(string_agg(a::text, E'\n' ORDER BY a."id")) AS appt_hash FROM "Appointment" a;
SELECT md5(string_agg(p::text, E'\n' ORDER BY p."id")) AS plan_hash FROM "NutritionPlan" p;
SELECT md5(string_agg(p::text, E'\n' ORDER BY p."id")) AS patient_hash FROM "Patient" p;

-- A3. Pronóstico de consultas que va a crear el backfill
WITH tz AS (SELECT COALESCE((SELECT "timezone" FROM "Professional" WHERE "id" = 1), 'America/Argentina/Buenos_Aires') AS name),
evo_days AS (SELECT DISTINCT e."patientId", (e."recordedAt" AT TIME ZONE 'UTC' AT TIME ZONE tz.name)::date AS day FROM "EvolutionEntry" e CROSS JOIN tz),
appt_days AS (SELECT a."patientId", (a."startsAt" AT TIME ZONE 'UTC' AT TIME ZONE tz.name)::date AS day, count(*) AS n
              FROM "Appointment" a CROSS JOIN tz WHERE a."status" = 'COMPLETED' GROUP BY 1, 2)
SELECT (SELECT count(*) FROM "Appointment" WHERE "status" = 'COMPLETED') AS de_turno,
       (SELECT count(*) FROM evo_days d LEFT JOIN appt_days ad USING ("patientId", day) WHERE COALESCE(ad.n, 0) <> 1) AS sin_turno;
```

Valores esperados en la base de desarrollo, contados por el architect el 2026-09-24 en solo
lectura: 10 pacientes, 15 mediciones (5 pacientes, 15 días distintos, todas a las 15:00 UTC),
6 turnos `COMPLETED`, 5 planes. 3 de esos días tienen exactamente un turno completado. Pronóstico:
**de_turno = 6, sin_turno = 12, total 18**. Si los números del implementer difieren, porque el
usuario cargó datos después, vale el pronóstico A3 del momento.

**B. Aplicar:** `npm run db:migrate` (desde la raíz). Después, `npm run db:generate`.

**C. Después de aplicar** (en `BEGIN READ ONLY; ... ROLLBACK;`):

```sql
-- C1. Mismos conteos que A1 (patients, entries, appts, completed, plans) y mismo desglose por paciente.
-- C2. Mismas 4 huellas que A2 (la de EvolutionEntry con la misma lista explícita de columnas, sin consultationId).
-- C3. Consultas creadas = pronóstico A3
SELECT count(*) FILTER (WHERE "appointmentId" IS NOT NULL) AS de_turno,
       count(*) FILTER (WHERE "appointmentId" IS NULL) AS sin_turno,
       count(*) AS total
FROM "Consultation";
-- C4. Ninguna medición suelta
SELECT count(*) AS sueltas FROM "EvolutionEntry" WHERE "consultationId" IS NULL;                -- 0
-- C5. Todo turno COMPLETED tiene su consulta
SELECT count(*) FROM "Appointment" a WHERE a."status" = 'COMPLETED'
  AND NOT EXISTS (SELECT 1 FROM "Consultation" c WHERE c."appointmentId" = a."id");              -- 0
-- C6. Coherencia: misma persona y mismo día local entre medición y consulta
WITH tz AS (SELECT COALESCE((SELECT "timezone" FROM "Professional" WHERE "id" = 1), 'America/Argentina/Buenos_Aires') AS name)
SELECT count(*) FROM "EvolutionEntry" e JOIN "Consultation" c ON c."id" = e."consultationId" CROSS JOIN tz
WHERE c."patientId" <> e."patientId"
   OR (c."consultedAt" AT TIME ZONE 'UTC' AT TIME ZONE tz.name)::date
   <> (e."recordedAt" AT TIME ZONE 'UTC' AT TIME ZONE tz.name)::date;                             -- 0
-- C7. Sin duplicados "Sin turno" por paciente y día
WITH tz AS (SELECT COALESCE((SELECT "timezone" FROM "Professional" WHERE "id" = 1), 'America/Argentina/Buenos_Aires') AS name)
SELECT c."patientId", (c."consultedAt" AT TIME ZONE 'UTC' AT TIME ZONE tz.name)::date AS day, count(*)
FROM "Consultation" c CROSS JOIN tz WHERE c."appointmentId" IS NULL
GROUP BY 1, 2 HAVING count(*) > 1;                                                               -- 0 filas
-- C8. Nada inventado
SELECT count(*) FROM "Consultation" WHERE "planId" IS NOT NULL OR "notes" IS NOT NULL;           -- 0
```

**D. Idempotencia.** Guardar el bloque 3.3 en un archivo del scratchpad y correrlo **dentro de
una transacción que se revierte**:
`BEGIN; \i <archivo>; ROLLBACK;`. Tiene que mostrar `INSERT 0 0`, `INSERT 0 0` y `UPDATE 0`.
Esta es la única escritura de la verificación y se revierte.

### 3.5 Lugar para las HU siguientes (no se implementa nada)

| HU | Cómo encaja en este modelo |
|---|---|
| HU-004 | Modelo nuevo `Prescription` con `consultationId` (FK a `Consultation`, `onDelete: Cascade` o `Restrict`, lo decide su SDD). Guarda fórmula, TMB, factor, GET, ajuste, VCT, macros y **los datos de entrada que se usaron**. Su sección va en el detalle, entre "Mediciones" y "Plan indicado". Al sumarla, `isConsultationEmpty` / `canDeleteConsultation` de core pasan a considerarla |
| HU-006 | `AnthropometryStudy` / `BioimpedanceStudy` (o como los llame su SDD) con `consultationId`. `EvolutionEntry` queda como está o se migra. La decisión es de la HU-006. `measurementKinds` de core es el punto de corte actual entre los dos grupos |
| HU-007 | "Consulta anterior" = la consulta del mismo paciente con el `consultedAt` inmediatamente menor que tenga antropometría. Usa el índice `(patientId, consultedAt)`. No hace falta ninguna columna nueva |
| HU-008 | Edad a la fecha = `computeAgeYears(patient.birthDate, consultation.consultedAt, tz)`. Ya se usa en el encabezado del detalle |

---

## 4. Contrato compartido

### 4.1 `packages/core/src/consultations.ts` (nuevo), reexportado en `src/index.ts`

Puro: sin Prisma ni red. Consumidores: **web** (lista, detalle, API del calendario, actions) y
**db/domain** (reglas de vacía/borrable y fechas). **Bot: ninguno.**

```ts
import { addDays } from "date-fns"; // ya es dependencia de core (time.ts)
import { wallTimeToUtc, dayKeyInTz } from "./time";

export const ANTHROPOMETRY_MEASURE_KEYS = [
  "heightCm", "waistCm", "hipCm", "armCm", "thighCm", "calfCm",
  "tricepsSkinfoldMm", "subscapularSkinfoldMm", "abdominalSkinfoldMm",
] as const;
export const BIOIMPEDANCE_MEASURE_KEYS = [
  "bodyFatPercent", "muscleMassKg", "bodyWaterPercent", "visceralFatLevel", "boneMassKg", "basalMetabolicRateKcal",
] as const;
export type AnthropometryMeasureKey = (typeof ANTHROPOMETRY_MEASURE_KEYS)[number];
export type BioimpedanceMeasureKey = (typeof BIOIMPEDANCE_MEASURE_KEYS)[number];
export type MeasurementValues = { weightKg: number | null } &
  Record<AnthropometryMeasureKey | BioimpedanceMeasureKey, number | null>;

/**
 * A qué grupo(s) del detalle pertenece una medición.
 * bioimpedance = algún campo de BIOIMPEDANCE_MEASURE_KEYS no nulo.
 * anthropometry = algún campo de ANTHROPOMETRY_MEASURE_KEYS no nulo, o si no es de bioimpedancia
 *   (una medición con solo peso y/o nota va a Antropometría). Toda medición cae en al menos un grupo.
 * El peso se muestra en Antropometría si la medición está ahí; si no, en Bioimpedancia.
 */
export function measurementKinds(m: MeasurementValues): { anthropometry: boolean; bioimpedance: boolean };

export type ConsultationChip = "Antropometría" | "Bioimpedancia" | "Plan" | "Notas";
/** Chips en ese orden fijo, solo los que aplican. `notes` con solo espacios no cuenta. */
export function consultationChips(input: {
  measurements: MeasurementValues[];
  hasPlan: boolean;
  notes: string | null;
}): ConsultationChip[];

/** Vacía (D3, al revertir un turno): sin mediciones, sin plan y sin notas (trim). */
export function isConsultationEmpty(input: { measurementCount: number; hasPlan: boolean; notes: string | null }): boolean;
/** Borrable a mano: sin mediciones y sin plan. Las notas se borran con ella, previa confirmación. */
export function canDeleteConsultation(input: { measurementCount: number; hasPlan: boolean }): boolean;

export const CONSULTATION_NOTES_MAX = 4000;

/** Textos que comparten web y domain. Exactos, sin punto final salvo donde está. */
export const CONSULTATION_TEXT = {
  futureDate: "La fecha de la consulta no puede ser futura",
  futureMeasurementDate: "La fecha de la medición no puede ser futura",
  notDeletable: "Para eliminar la consulta primero borrá sus mediciones y quitá el plan indicado",
  sameDayExists: "Ya hay una consulta de ese día",
  appointmentNotCompleted: "El turno de esta consulta ya no figura como completado.",
} as const;

/** "yyyy-MM-dd" válido de calendario (rechaza "2026-02-30"). */
export function isValidDayKey(dayKey: string): boolean;
/** true si dayKey > hoy en `tz` (compara con dayKeyInTz(now, tz)). */
export function isFutureDayKey(dayKey: string, now: Date, tz: string): boolean;
/** Instante UTC del día a las 12:00 en `tz` = wallTimeToUtc(dayKey, "12:00", tz). Misma convención que las mediciones de hoy. */
export function dayKeyToNoonUtc(dayKey: string, tz: string): Date;
/** [inicio del día, inicio del día siguiente) en `tz`, como instantes UTC. */
export function dayRangeUtc(dayKey: string, tz: string): { start: Date; end: Date };

/**
 * D5: entre varias consultas del mismo día, la vinculada a un turno (si hay varias, la de
 * `consultedAt` más reciente); si ninguna tiene turno, la de `createdAt` más reciente. [] → null.
 */
export function pickConsultationForDay<
  T extends { appointmentId: string | null; consultedAt: Date; createdAt: Date },
>(candidates: readonly T[]): T | null;
```

La edad a la fecha **no** es una función nueva. Se usa `computeAgeYears(birthDate, at, tz)`, que
ya está en `patient-formula-data.ts`.

### 4.2 `packages/db/domain/consultations.ts` (nuevo), exportado en `domain/index.ts`

Consumidores: **web**. El bot **no** las llama hoy, pero van en `domain` para que cualquier camino
futuro (bot o cron) use la misma regla. La zona sale de `getProfessional()` (`./availability`).

```ts
import type { Consultation, EvolutionEntry, NutritionPlan, Appointment, Service, Patient, Prisma } from "@prisma/client";

export class ConsultationNotDeletableError extends Error {}        // message = CONSULTATION_TEXT.notDeletable
export class FutureConsultationDateError extends Error {}          // message = CONSULTATION_TEXT.futureDate
export class AppointmentConsultationDateError extends Error {}     // "La fecha de una consulta de turno no se edita"
export class ConsultationPlanMismatchError extends Error {}        // el plan es de otro paciente

export type ConsultationWithRelations = Consultation & {
  appointment: (Appointment & { service: Service }) | null;
  plan: Pick<NutritionPlan, "id" | "title" | "status"> | null;
  evolutionEntries: EvolutionEntry[];              // orderBy createdAt asc
};

/** Lista de la pestaña. orderBy consultedAt desc, createdAt desc. */
export function listPatientConsultations(patientId: string): Promise<ConsultationWithRelations[]>;

/** Detalle. null si no existe. Incluye patient (para nombre y birthDate). */
export function getConsultation(consultationId: string): Promise<(ConsultationWithRelations & { patient: Patient }) | null>;

/** Consultas del paciente en ese día local (para el aviso D5 de "Nueva consulta"). */
export function listConsultationsOnDay(patientId: string, dayKey: string): Promise<Consultation[]>;

/** "Nueva consulta" (sin turno). Valida día (isValidDayKey) y no futuro → FutureConsultationDateError.
 *  consultedAt = dayKeyToNoonUtc(dayKey, tz). No bloquea si ya hay otra ese día (D5). */
export function createManualConsultation(params: { patientId: string; dayKey: string }): Promise<Consultation>;

/** D9: solo sin turno (si appointmentId != null → AppointmentConsultationDateError). No futuro.
 *  En UNA transacción: consultedAt = noon(dayKey) y recordedAt = noon(dayKey) para TODAS sus mediciones. */
export function updateManualConsultationDate(params: { consultationId: string; dayKey: string }): Promise<Consultation>;

/** Notas: trim; "" → null. El largo (≤ CONSULTATION_NOTES_MAX) lo valida la action. */
export function saveConsultationNotes(params: { consultationId: string; notes: string | null }): Promise<Consultation>;

/** D8: indicar (planId) o quitar (null). Si planId es de otro paciente → ConsultationPlanMismatchError.
 *  Nunca modifica el plan. */
export function setConsultationPlan(params: { consultationId: string; planId: string | null }): Promise<Consultation>;

/** "Crear plan": en una transacción crea NutritionPlan DRAFT del paciente con
 *  title = `Plan del ${formatInTimeZone(consultedAt, tz, "dd/MM/yyyy")}` y lo vincula. Devuelve el plan. */
export function createPlanForConsultation(params: { consultationId: string }): Promise<NutritionPlan>;

/** Borrado a mano. Si !canDeleteConsultation → ConsultationNotDeletableError.
 *  Borra con deleteMany({ where: { id, planId: null, evolutionEntries: { none: {} } } }) (a prueba de carreras);
 *  si count = 0 → ConsultationNotDeletableError. El turno no se toca. */
export function deleteConsultation(consultationId: string): Promise<void>;

/** D4/D5: dentro de `tx`, busca las consultas del paciente en dayRangeUtc(dayKey, tz) y elige con
 *  pickConsultationForDay; si no hay, crea una sin turno (consultedAt = noon). */
export function findOrCreateConsultationForDay(
  tx: Prisma.TransactionClient,
  params: { patientId: string; dayKey: string; tz: string },
): Promise<{ consultation: Consultation; created: boolean }>;
```

### 4.3 `packages/db/domain/clinical.ts` (cambia)

- Se exporta el tipo de las medidas, igual al `data` actual pero sin `recordedAt`:
  ```ts
  export type EvolutionMeasures = {
    weightKg?: number | null; note?: string | null; heightCm?: number | null; waistCm?: number | null;
    hipCm?: number | null; armCm?: number | null; thighCm?: number | null; calfCm?: number | null;
    tricepsSkinfoldMm?: number | null; subscapularSkinfoldMm?: number | null; abdominalSkinfoldMm?: number | null;
    bodyFatPercent?: number | null; muscleMassKg?: number | null; bodyWaterPercent?: number | null;
    visceralFatLevel?: number | null; boneMassKg?: number | null; basalMetabolicRateKcal?: number | null;
  };
  ```
- **Se elimina `addEvolutionEntry(patientId, data)`.** Su único consumidor es
  `clinical-actions.ts`. Así ninguna medición nueva queda fuera de una consulta, y el typecheck
  avisa si algún consumidor quedó sin actualizar. En su lugar:
  ```ts
  /** Desde Evolución (D4). dayKey "yyyy-MM-dd". Día futuro → FutureConsultationDateError con
   *  message CONSULTATION_TEXT.futureMeasurementDate. En UNA transacción: findOrCreateConsultationForDay + create
   *  con recordedAt = dayKeyToNoonUtc(dayKey, tz) y consultationId. */
  export function addEvolutionEntryOnDay(
    patientId: string, dayKey: string, measures: EvolutionMeasures,
  ): Promise<{ entry: EvolutionEntry; consultation: Consultation; consultationCreated: boolean }>;

  /** Desde el detalle de la consulta. patientId sale de la consulta.
   *  recordedAt = dayKeyToNoonUtc(dayKeyInTz(consultation.consultedAt, tz), tz). */
  export function addEvolutionEntryToConsultation(
    consultationId: string, measures: EvolutionMeasures,
  ): Promise<EvolutionEntry>;
  ```
- `deleteEvolutionEntry(id)`, `listEvolutionEntries` y `getLatestFormulaMeasurements`: **sin
  cambios**. Borrar una medición no borra la consulta.
- Cambio de comportamiento chico en Evolución, que el implementer tiene que anotar: hoy la fecha
  se guarda como `new Date(\`${day}T12:00:00\`)` en hora del server. Pasa a
  `dayKeyToNoonUtc(day, Professional.timezone)`. Con el server en ART da el mismo instante.
  Además, ya no se aceptan fechas futuras.

### 4.4 `packages/db/domain/appointments.ts`: `setAppointmentStatus` (cambia la firma del retorno)

```ts
export async function setAppointmentStatus(params: {
  id: string;
  status: Extract<AppointmentStatus, "COMPLETED" | "NO_SHOW" | "CONFIRMED">;
}): Promise<{
  appointment: Appointment;
  /** Solo si el estado nuevo es COMPLETED. */
  consultation: { id: string; created: boolean } | null;
  /** true si al salir de COMPLETED se borró la consulta vacía. */
  removedEmptyConsultation: boolean;
}>;
```

Lógica, en **un** `prisma.$transaction(async (tx) => …)`:
1. `tx.appointment.findUniqueOrThrow({ where: { id }, include: { consultation: { include: { _count: { select: { evolutionEntries: true } } } } } })` → `prev`.
2. `tx.appointment.update({ where: { id }, data: { status } })`. Igual que hoy: no toca
   `needsGoogleSync`.
3. Si `status === "COMPLETED"`: si `prev.consultation` existe → `{ id, created: false }`. Si no,
   `tx.consultation.create({ data: { patientId: prev.patientId, appointmentId: id, consultedAt: prev.startsAt } })`
   → `{ id, created: true }`. El `@unique` de `appointmentId` garantiza que no haya dos. Si el
   create tira `P2002` por una carrera, el error sale de la transacción y se reintenta **una vez**
   fuera de ella, con `findUnique({ where: { appointmentId } })`.
4. Si `prev.status === "COMPLETED" && status !== "COMPLETED" && prev.consultation`: si
   `isConsultationEmpty({ measurementCount, hasPlan: planId != null, notes })`, borrar con
   `tx.consultation.deleteMany({ where: { id, notes: null, planId: null, evolutionEntries: { none: {} } } })`.
   El filtro repite la condición a propósito, por si alguien cargó algo entre la lectura y el
   borrado. `removedEmptyConsultation = count === 1`. Si tiene contenido, **no se toca** (D3).

Consumidores:
- **web**: `setStatusAction` en `(panel)/actions.ts`, a través de `@/lib/appointments`, que la
  reexporta.
- **bot**: **ninguno**. Revisado: `apps/bot/src/conversation.ts` solo actualiza
  `confirmationResponse` y llama a `cancelAppointment`, que solo actúa si el turno está
  `CONFIRMED`. `reminders.ts`, `payments.ts` y `gcal.ts` solo pasan por `CONFIRMED`,
  `CANCELLED`, `AWAITING_PAYMENT` o sync. Ningún camino del bot pone ni saca `COMPLETED`, así que
  no hay otro lugar donde crear o quitar la consulta. Si en el futuro el bot o un cron completan
  turnos, **tienen que** llamar a `setAppointmentStatus`.
- No hay reprogramación de turnos (nadie actualiza `startsAt`). Si se agrega, tiene que
  actualizar `Consultation.consultedAt`. Queda anotado como extensión futura.

### 4.5 `packages/db/domain/nutritionPlans.ts`

`listPatientPlans(patientId)` suma
`include: { consultations: { select: { id: true, consultedAt: true }, orderBy: { consultedAt: "asc" }, take: 1 } }`.
Devuelve más datos que antes, así que ningún consumidor se rompe. Sirve para mostrar
"Indicado en la consulta del dd/MM", con la **primera** consulta que lo indicó. `createPlan`,
`deletePlan` y el resto quedan **sin cambios**.

---

## 5. Rutas, server actions y API (apps/web)

### 5.1 Rutas

| Ruta | Tipo | Nuevo/cambia |
|---|---|---|
| `/pacientes/[id]?tab=consultas` | pestaña de la ficha | nueva |
| `/pacientes/[id]/consultas/[consultationId]` | página (server) + `loading.tsx` | nueva. `notFound()` si no existe o si `consultation.patientId !== id` |
| `GET /api/appointments` | route handler | cambia: suma `patientId` y `consultation` a `extendedProps` |

### 5.2 Server actions nuevas: `apps/web/src/app/(panel)/pacientes/[id]/consultation-actions.ts` (`"use server"`)

Todas validan con zod, **cargan la consulta y verifican `consultation.patientId === patientId`**
antes de operar (si no coincide: `{ ok: false, error: "Datos inválidos" }`), y hacen
`revalidatePath(\`/pacientes/${patientId}\`)` y
`revalidatePath(\`/pacientes/${patientId}/consultas/${consultationId}\`)`.

```ts
export type ConsultationFormState = { ok: boolean; error?: string; consultationId?: string; existingConsultationId?: string };

createConsultationAction(_prev, formData: { patientId; day; force?: "1" }): Promise<ConsultationFormState>
  // día inválido → "Fecha inválida"; futuro → CONSULTATION_TEXT.futureDate
  // si force !== "1" y listConsultationsOnDay() no vacío → { ok:false, error: CONSULTATION_TEXT.sameDayExists, existingConsultationId: pickConsultationForDay(...)!.id }
  // ok → { ok: true, consultationId }  (el cliente navega; no redirect en la action, para poder mostrar el toast)
updateConsultationDateAction(_prev, formData: { patientId; consultationId; day }): Promise<ConsultationFormState>
saveConsultationNotesAction(_prev, formData: { patientId; consultationId; notes }): Promise<ActionState>
  // notes.max(CONSULTATION_NOTES_MAX); error genérico → "No se pudieron guardar las notas."
setConsultationPlanAction(_prev, formData: { patientId; consultationId; planId }): Promise<ActionState>
clearConsultationPlanAction(patientId: string, consultationId: string): Promise<ActionState>
createPlanForConsultationAction(patientId: string, consultationId: string): Promise<void>
  // redirect(`/pacientes/${patientId}/planes/${plan.id}`)
addConsultationMeasurementAction(_prev, formData: { patientId; consultationId; ...medidas; note }): Promise<ActionState>
deleteConsultationMeasurementAction(patientId: string, consultationId: string, entryId: string): Promise<ActionState>
  // además verifica entry.consultationId === consultationId
deleteConsultationAction(patientId: string, consultationId: string): Promise<ActionState>
  // ConsultationNotDeletableError → { ok:false, error: CONSULTATION_TEXT.notDeletable }; ok → redirect(`/pacientes/${patientId}?tab=consultas`)
```

**Parseo de medidas compartido.** `MEASURE_FIELDS`, `optionalMeasure` y `parseMeasure` salen de
`clinical-actions.ts` y pasan a un módulo **sin** `"use server"`:
`apps/web/src/app/(panel)/pacientes/[id]/measure-form-data.ts`. Exporta
`parseMeasuresFromForm(data: Record<string, string | undefined>): { ok: true; measures: EvolutionMeasures } | { ok: false; error: "Alguna medida es inválida" }`.
Lo usan `addEvolutionEntryAction` y `addConsultationMeasurementAction`.

### 5.3 Server actions que cambian

- `(panel)/actions.ts` → `setStatusAction(id, status)` devuelve
  `Promise<ActionResult & { consultation?: { id: string; created: boolean } | null }>` con los
  datos de `setAppointmentStatus`. Mismo error de siempre ("No se pudo actualizar el turno.").
  Además de `revalidatePath("/")`, si hay consulta, `revalidatePath(\`/pacientes/${patientId}\`)`.
  El `patientId` sale de `result.appointment.patientId`.
- `pacientes/[id]/clinical-actions.ts` → `addEvolutionEntryAction`:
  - `recordedAt` del form se valida con `isValidDayKey`.
  - Llama a `addEvolutionEntryOnDay(patientId, recordedAt, measures)`.
  - Captura `FutureConsultationDateError` y devuelve su `message`
    ("La fecha de la medición no puede ser futura").
  - Devuelve `ActionState & { message?: string }`, con
    `message = \`Medición agregada a la consulta del ${formatInTimeZone(consultation.consultedAt, tz, "dd/MM")}\``.
  - Revalida la ficha y el detalle de esa consulta.
  - `ActionState` se extiende con `message?: string`. Es opcional, así que los otros usos no
    cambian.
- `deleteEvolutionEntryAction`: suma `revalidatePath` del detalle de la consulta de esa medición.
  Para eso lee `consultationId` antes de borrar.

### 5.4 `GET /api/appointments`

`include` suma:

```ts
consultation: { select: { id: true, notes: true, planId: true, _count: { select: { evolutionEntries: true } } } }
```

`extendedProps` suma:

```ts
patientId: a.patientId,
consultation: a.consultation
  ? { id: a.consultation.id,
      hasContent: !isConsultationEmpty({ measurementCount: a.consultation._count.evolutionEntries,
                                         hasPlan: a.consultation.planId !== null, notes: a.consultation.notes }) }
  : null,
```

---

## 6. Mensajes del bot

**Ninguno.** Esta HU no agrega ni cambia textos de WhatsApp, no encola en `OutboundMessage` y no
toca `apps/bot/src`. Crear o quitar una consulta no dispara ningún mensaje.

---

## 7. UI (skill `ui`): vistas, estructura y componentes

Sistema de diseño actual: `@/components/ui` (`Card`, `PageHeader`, `Button`, `ButtonLink`,
`Badge`, `Alert`, `EmptyState`, `Field`, `Input`, `Select`, `Textarea`, `FormError`,
`Quantity`, `SectionLabel`), `@/components/primitives/*` (`sheet`, `separator`, `table`,
`skeleton`), `@/components/data-table` (`DataTable`, **solo en componentes cliente**),
`@/components/confirm` (`useConfirm`), `@/lib/notify` (`notify`, `useActionToast`). **Sin colores
ni tokens nuevos.** Íconos de `lucide-react`.

**Regla dura (React 19):** nunca `await confirm()` dentro de `<form action>` ni de
`startTransition`. Se confirma en el handler del evento y, solo si da `true`, se llama a la action
(con `startTransition` si hace falta el `pending`). El patrón a copiar es
`planes/[planId]/delete-plan-button.tsx`.

### 7.1 Pestaña "Consultas" (ficha)

- **Nombre:** `ConsultationsSection` (`pacientes/[id]/consultations-section.tsx`, `"use client"`).
- **Pestañas:** `PATIENT_TABS` pasa a 7. `{ value: "consultas", label: "Consultas" }` va
  **segunda**, entre `resumen` y `datos`. Se borra el comentario `// HU-003 suma …` y los
  comentarios "seis pestañas" pasan a "siete". `counts.consultas = consultations.length`.
- **Estructura:** un `Card title="Consultas" padding="none"` con
  `actions={<NewConsultationButton … />}`, que es el botón primario "Nueva consulta" (ícono `Plus`).
  Adentro:
  - `DataTable` con `rowHref={(c) => \`/pacientes/${patientId}/consultas/${c.id}\`}`,
    `initialSort={{ columnId: "fecha", direction: "desc" }}` y `caption="Consultas"`.
  - Columnas:
    1. **Fecha**: `dd/MM/yyyy` y, si tiene turno, ` · HH:mm hs`. `tabular-nums`. `sortValue` =
       `consultedAt`.
    2. **Origen**: el nombre del servicio del turno, o `<Badge tone="neutral">Sin turno</Badge>`.
    3. **Contenido**: un `Badge tone="neutral"` por cada chip de `consultationChips(...)`. Si no
       hay ninguno, `<span className="text-muted-foreground">Sin registros</span>`.
- **Vacío:** `EmptyState` con `icon={Stethoscope}`, `title="Todavía no hay consultas"`,
  `description="Se crean solas al marcar un turno como completado, o podés crear una a mano."`
  y `action={<NewConsultationButton />}`.
- **Fila (tipo):**
  `ConsultationRow { id; consultedAtISO; dateLabel; timeLabel: string | null; originLabel: string | null; chips: ConsultationChip[] }`.
  Se arma en el server (`page.tsx`) con `formatInTimeZone(…, pro.timezone, …)`.

### 7.2 Sheet "Nueva consulta" / "Cambiar fecha"

- **Nombre:** `ConsultationDateSheet` (`pacientes/[id]/consultation-date-sheet.tsx`, cliente).
  `NewConsultationButton` es un envoltorio que lo abre en modo `"create"`.
- **Props:**
  `{ mode: "create"; patientId; todayKey } | { mode: "edit"; patientId; consultationId; todayKey; currentDayKey }`,
  más `trigger: ReactNode`.
- **Estructura:** `Sheet` controlado (`open` en estado local), con `SheetContent side="right"
  className="w-full sm:max-w-sm"` y `SheetHeader`:
  - `SheetTitle`: "Nueva consulta" / "Cambiar fecha".
  - `SheetDescription`: "Consulta sin turno. La fecha no puede ser futura." / "Las mediciones de
    la consulta pasan a esta fecha."

  Adentro, un `<form action>` con `useActionState` (`createConsultationAction` o
  `updateConsultationDateAction`):
  - `Field label="Fecha"` → `Input type="date" name="day" max={todayKey}` y
    `defaultValue={todayKey | currentDayKey}` (required).
  - `Button type="submit"` "Crear consulta" / "Guardar fecha". `FormError` para el error en línea
    (incluido "La fecha de la consulta no puede ser futura").
  - D5, cuando vuelve `existingConsultationId`: `Alert tone="warning" title="Ya hay una consulta
    de ese día"` con `ButtonLink variant="secondary" size="sm"` "Abrir consulta" (a la existente)
    y `Button type="submit" name="force" value="1" variant="ghost" size="sm"` "Crear igual".
- **Después de guardar:** en un `useEffect` sobre `state`, si `state.ok`:
  - create → `notify.saved("Consulta creada")` y
    `router.push(\`/pacientes/${patientId}/consultas/${state.consultationId}\`)`.
  - edit → `notify.saved("Fecha actualizada")` y se cierra el sheet.
- **`todayKey`** = `dayKeyInTz(new Date(), pro.timezone)`, calculado en el server. **No** usar
  `new Date().toISOString().slice(0, 10)`: después de las 21:00 en ART ya da el día siguiente.

### 7.3 Detalle de la consulta

- **Nombre:** `ConsultationPage`
  (`pacientes/[id]/consultas/[consultationId]/page.tsx`, server, `dynamic = "force-dynamic"`) +
  `loading.tsx`, copiado de `planes/[planId]/loading.tsx`.
- **Datos:** `getConsultation`, `getProfessional`, `listPatientPlans(id)` (para el select) y el
  mapeo de mediciones a `EvolutionRow` con `toEvolutionRow` (7.7).
- **Estructura:**
  1. `PageHeader`:
     - `title="Consulta del dd/MM/yyyy"`.
     - `description`: nombre del paciente (o su teléfono) + ` · N años` si hay `birthDate`, con
       la edad de `computeAgeYears(birthDate, consultedAt, tz)`.
     - `back={{ href: \`/pacientes/${id}?tab=consultas\`, label: \`Volver a ${nombre}\` }}`.
     - `action`: solo si es sin turno, `ConsultationDateSheet mode="edit"` con un trigger
       `Button variant="secondary" size="sm"` (ícono `CalendarDays`) "Cambiar fecha".
  2. Debajo, una fila de origen (`div flex gap-2 text-sm`):
     - Con turno: `Turno · {servicio} · HH:mm hs` y, en `text-muted-foreground`, "Fecha del
       turno" (sin edición).
     - Sin turno: `<Badge tone="neutral">Sin turno</Badge>`.
  3. Si tiene turno y `appointment.status !== "COMPLETED"`:
     `<Alert tone="warning">{CONSULTATION_TEXT.appointmentNotCompleted}</Alert>`.
  4. Grilla `grid gap-8 xl:grid-cols-[minmax(0,1fr)_22rem] xl:items-start`, como el plan.
     - Columna principal: **Mediciones** (7.3.1).
     - Columna lateral: **Plan indicado** (7.3.2) y **Notas** (7.3.3).

     No hay sección "Requerimiento" ni "próximamente" (D6). La HU-004 la inserta entre Mediciones
     y Plan indicado.
  5. Al pie, `Separator` y `DeleteConsultationButton` (7.3.4).

#### 7.3.1 Mediciones: `ConsultationMeasurements` (`consultas/[consultationId]/consultation-measurements.tsx`, cliente)

- `Card title="Mediciones"` con `actions`: `Button variant="secondary" size="sm"` "Agregar
  medición" (ícono `Plus`), que muestra u oculta el formulario arriba de la lista.
- **Formulario:** `ConsultationMeasurementForm`. Reusa los campos de `EvolutionForm` **sin
  "Fecha"**: peso, nota, "Agregar medidas antropométricas" y "Agregar datos de bioimpedancia".
  Para no duplicar, se extrae `MeasurementFields` (7.7). Usa `useActionState` con
  `addConsultationMeasurementAction` y `useActionToast(state, { success: "Medición agregada" })`,
  y se resetea al guardar (`key` que cambia).
- **Lista.** Grupos con `measurementKinds` (core):
  - `SectionLabel` "Antropometría". Por cada medición del grupo, un bloque `rounded-lg border
    p-4` con un `dl` en grilla (`grid-cols-2 sm:grid-cols-4`) de los valores no nulos: Peso,
    Talla, IMC (`computeBmi`), Cintura, Cadera, ICC (`computeWaistHipRatio`, 2 decimales),
    Brazo, Muslo, Pantorrilla y pliegues. Todos con `Quantity` y las etiquetas de
    `PERIMETER_MEASURES` / `SKINFOLD_MEASURES`. Si hay nota, abajo en `text-sm
    text-muted-foreground`.
  - `SectionLabel` "Bioimpedancia", igual, con `BIOIMPEDANCE_METRICS`. El peso aparece acá solo
    si la medición no está en Antropometría.
  - Un grupo sin mediciones no se muestra. Si no hay ninguna medición:
    `EmptyState title="Sin mediciones en esta consulta."`.
  - Borrar: un `Button variant="ghost" size="icon"` (ícono `Trash2`,
    `aria-label="Borrar esta medición"`) por bloque. Un `onClick` async hace `await confirm({
    title: "¿Borrar esta medición?", description: "No se puede deshacer.", confirmLabel: "Borrar
    medición" })` y, **fuera de la transición**, llama a `deleteConsultationMeasurementAction`
    dentro de `startTransition`. Toast `notify.saved("Medición borrada")`. Si una medición cae
    en los dos grupos, se borra desde cualquiera de los dos.

#### 7.3.2 Plan indicado: `ConsultationPlan` (`consultation-plan.tsx`, cliente)

- `Card title="Plan indicado"`.
- **Con plan:**
  - Título en `font-medium` y `Badge` de estado (Borrador/Activo/Archivado, mismos tonos que
    `plans-section.tsx`).
  - `ButtonLink variant="secondary" size="sm"` "Abrir plan" → `/pacientes/[id]/planes/[planId]`.
  - `Button variant="ghost" size="sm"` "Quitar". Llama a `clearConsultationPlanAction` en
    `startTransition`, sin confirmación, y avisa con `notify.saved("Plan quitado de la consulta")`.
- **Sin plan:**
  - `Button` primario "Crear plan" → `createPlanForConsultationAction` (en `startTransition`;
    redirige al editor).
  - Debajo, "Indicar un plan existente": un `<form action>` con `useActionState` y
    `setConsultationPlanAction`. Adentro, `Field label="Indicar un plan existente"` →
    `Select name="planId"` con los planes del paciente, primero los `ACTIVE`, después `DRAFT`,
    después `ARCHIVED`, y dentro de cada grupo por `createdAt` desc. Label:
    `\`${title} · ${estado}\``. Cierra con `Button type="submit" variant="secondary"` "Indicar".
  - Si el paciente no tiene planes, en lugar del form va
    `<p className="text-sm text-muted-foreground">El paciente todavía no tiene planes.</p>`.

#### 7.3.3 Notas: `ConsultationNotes` (`consultation-notes.tsx`, cliente)

- `Card title="Notas"`. Un `<form action>` con `useActionState` y `saveConsultationNotesAction`.
  Adentro, `Textarea name="notes" rows={6} maxLength={4000} defaultValue={notes ?? ""}` y
  `Button type="submit"` "Guardar notas".
- `useActionToast(state, { success: "Notas guardadas" })`. Si falla, error en línea con
  `FormError` ("No se pudieron guardar las notas.").

#### 7.3.4 Eliminar consulta: `DeleteConsultationButton` (`delete-consultation-button.tsx`, cliente)

- `Button variant="danger" size="sm"` "Eliminar consulta".
- `disabled={!canDelete}`, calculado con `canDeleteConsultation` en el server. Deshabilitado,
  debajo va `<p className="text-xs text-muted-foreground">` con `CONSULTATION_TEXT.notDeletable`
  + ".".
- Habilitado: `await confirm({ title: "¿Eliminar esta consulta?", description: "Se borran sus
  notas. No se puede deshacer.", confirmLabel: "Eliminar consulta" })`. Si da `true`,
  `deleteConsultationAction` en `startTransition`. Si la action devuelve error, se muestra con
  `notify.error`.

### 7.4 Panel lateral del turno (calendario)

Archivos: `appointment-detail-sheet.tsx` y `calendar-client.tsx`.

- `SelectedAppointment` suma `patientId: string` y
  `consultation: { id: string; hasContent: boolean } | null`. `calendar-client.tsx` los copia de
  `extendedProps` en `onEventClick`.
- Prop nueva del sheet: `onUpdated: (next: SelectedAppointment) => void`. En `calendar-client`
  es `setSelected`.
- **"Marcar completado":** llama a `setStatusAction(appt.id, "COMPLETED")`.
  - Si `ok`: toast `"Turno completado. Se creó su consulta."` si `res.consultation?.created`, o
    `"Turno completado."` si no.
  - Después, `onChanged()` (refetch) y
    `onUpdated({ ...appt, status: "COMPLETED", consultation: { id: res.consultation.id, hasContent: … } })`.
    `hasContent` = `false` si `created`; si no, se conserva el que ya tenía.
  - **El panel queda abierto** y muestra "Abrir consulta" (lo pide el escenario 1). Las otras
    acciones siguen cerrando el panel, como hoy.
  - Para esto, `run()` pasa a aceptar `success: string | ((res) => string)` y una opción
    `keepOpen`.
- **Estado COMPLETED:** arriba de "Volver a confirmado" va, si `appt.consultation`,
  `ButtonLink variant="secondary" className="w-full justify-start"
  href={\`/pacientes/${appt.patientId}/consultas/${appt.consultation.id}\`}` con ícono
  `ClipboardList` y el texto "Abrir consulta".
- **"Volver a confirmado":** si `appt.status === "COMPLETED" && appt.consultation?.hasContent`,
  primero hay que confirmar, **en el handler y fuera de cualquier transición**:
  `await confirm({ title: "¿Volver el turno a confirmado?", description: \`La consulta del
  ${formatInTimeZone(new Date(appt.start), tz, "dd/MM")} tiene mediciones o notas y se
  conserva.\`, confirmLabel: "Volver a confirmado", cancelLabel: "Cancelar", destructive: false
  })`. Si no hay contenido, no se pide nada. El toast sigue siendo "Turno vuelto a confirmado".
  Aunque `hasContent` esté desactualizado, no se pierde nada: el dominio nunca borra una
  consulta con contenido.
- "No asistió" no cambia (no crea consulta).

### 7.5 Pestaña "Turnos"

`AppointmentRow` suma `consultationHref: string | null`. `page.tsx` suma
`consultation: { select: { id: true } }` al `include` de `appointments`. Nueva columna al final,
`TableHead` "Consulta" (sin texto visible si no hay: `—` en `text-muted-foreground`). Con
consulta: `Link` con clases de link (`text-link underline-offset-4 hover:underline`) "Ver
consulta". Es un server component, así que se siguen usando los primitivos de tabla.

### 7.6 Pestaña "Planes"

`PlanRow` suma `consultationLabel: string | null`, con el formato
`"Indicado en la consulta del dd/MM"` a partir de la primera consulta de `listPatientPlans`. En la
columna "Título", debajo del título, va
`<p className="text-xs text-muted-foreground">{consultationLabel}</p>` si existe.

### 7.7 Pestaña "Evolución" y piezas compartidas

- **`apps/web/src/lib/evolution-rows.ts`** (nuevo, server-safe): se extrae el mapeo
  `EvolutionEntry → EvolutionRow` que hoy está en línea en `page.tsx`, como
  `toEvolutionRow(e, tz)`. Lo usan la ficha y el detalle.
- `EvolutionRow` (`evolution-types.ts`) suma `consultationId: string | null`.
- `EvolutionTable` suma una columna "Consulta", antes de "acciones". Si hay consulta, un `Link`
  con `aria-label="Ver la consulta del dd/MM/yyyy"` y el texto "Ver"
  (`/pacientes/${patientId}/consultas/${e.consultationId}`). El borrado de la tabla queda como
  hoy.
- `EvolutionForm`:
  - Prop nueva `todayKey`. `Input type="date" name="recordedAt" defaultValue={todayKey}
    max={todayKey}`.
  - Toast: `useActionToast(state, { success: state.message ?? "Medición agregada" })`, que da
    "Medición agregada a la consulta del 20/09".
  - Los 18 `name` no cambian.
  - Se extrae `MeasurementFields` (`pacientes/[id]/measurement-fields.tsx`, cliente): el peso,
    la nota, los dos toggles y las dos grillas de medidas, con los mismos `name`, `step`, `min` y
    `placeholder`. `EvolutionForm` lo usa con el campo Fecha adelante.
    `ConsultationMeasurementForm` lo usa sin fecha.
- `EvolutionSection` pasa `todayKey`. Gráficos y Resumen: **sin cambios**.

---

## 8. Archivos

**Crear**
- `packages/core/src/consultations.ts`, `packages/core/src/consultations.test.ts`
- `packages/db/prisma/migrations/<timestamp>_consultation_entity/migration.sql` (generado + backfill 3.3)
- `packages/db/domain/consultations.ts`
- `packages/db/scripts/test-consultations.ts`
- `apps/web/src/lib/evolution-rows.ts`
- `apps/web/src/app/(panel)/pacientes/[id]/consultation-actions.ts`
- `apps/web/src/app/(panel)/pacientes/[id]/measure-form-data.ts`
- `apps/web/src/app/(panel)/pacientes/[id]/measurement-fields.tsx`
- `apps/web/src/app/(panel)/pacientes/[id]/consultations-section.tsx`
- `apps/web/src/app/(panel)/pacientes/[id]/consultation-date-sheet.tsx`
- `apps/web/src/app/(panel)/pacientes/[id]/consultas/[consultationId]/page.tsx`
- `apps/web/src/app/(panel)/pacientes/[id]/consultas/[consultationId]/loading.tsx`
- `apps/web/src/app/(panel)/pacientes/[id]/consultas/[consultationId]/consultation-measurements.tsx`
- `apps/web/src/app/(panel)/pacientes/[id]/consultas/[consultationId]/consultation-plan.tsx`
- `apps/web/src/app/(panel)/pacientes/[id]/consultas/[consultationId]/consultation-notes.tsx`
- `apps/web/src/app/(panel)/pacientes/[id]/consultas/[consultationId]/delete-consultation-button.tsx`

**Modificar**
- `packages/core/src/index.ts`
- `packages/db/prisma/schema.prisma`
- `packages/db/domain/index.ts`, `appointments.ts`, `clinical.ts`, `nutritionPlans.ts`
- `apps/web/src/app/(panel)/actions.ts`
- `apps/web/src/app/(panel)/appointment-detail-sheet.tsx`, `calendar-client.tsx`
- `apps/web/src/app/api/appointments/route.ts`
- `apps/web/src/app/(panel)/pacientes/[id]/page.tsx`, `patient-tabs.tsx`, `clinical-actions.ts`,
  `evolution-form.tsx`, `evolution-section.tsx`, `evolution-table.tsx`, `evolution-types.ts`,
  `appointments-section.tsx`, `plans-section.tsx`

**No tocar:** `apps/bot/**`, `(portal)/**`, `lib/assistant-tools.ts`, `tailwind.config.ts`,
`backlog.json`, migraciones ya aplicadas y `seed*.ts`.

---

## 9. Checklist atómico

### packages/core
- [ ] 1.1 Crear `src/consultations.ts` con todo lo de 4.1.
- [ ] 1.2 Crear `src/consultations.test.ts` con los casos de 10.1.
- [ ] 1.3 `export * from "./consultations";` en `src/index.ts`. Verificar que no choque con otros
      nombres exportados.
- [ ] 1.4 `npm run test` y `npm run typecheck --workspace packages/core` en verde.

### packages/db
- [ ] 2.1 `prisma migrate status` → "up to date". Si no, `blocked`.
- [ ] 2.2 Correr y guardar las consultas A1, A2 y A3 (3.4) en `progress/impl_HU-003.md`.
- [ ] 2.3 Editar `schema.prisma` (3.1).
- [ ] 2.4 `npx dotenv -e ../../.env -- prisma migrate dev --create-only --name consultation_entity`
      (desde `packages/db`).
- [ ] 2.5 Comparar el SQL generado con 3.2. Si hay algo distinto (`DROP`, otras tablas), parar y
      reportar `blocked`.
- [ ] 2.6 Agregar el bloque de backfill 3.3 **al final** de `migration.sql`, textual.
- [ ] 2.7 `npm run db:migrate` (raíz) → aplica. Si ofrece reset o detecta drift: **no aceptar**,
      `blocked`.
- [ ] 2.8 `npm run db:generate`.
- [ ] 2.9 Correr C1 a C8 y la prueba de idempotencia D (3.4). Pegar las salidas.
- [ ] 2.10 `domain/consultations.ts` con todo lo de 4.2. Exportarlo en `domain/index.ts`.
- [ ] 2.11 `domain/clinical.ts`: `EvolutionMeasures`, `addEvolutionEntryOnDay`,
      `addEvolutionEntryToConsultation`, y eliminar `addEvolutionEntry` (4.3).
- [ ] 2.12 `domain/appointments.ts`: `setAppointmentStatus` transaccional con el retorno nuevo
      (4.4).
- [ ] 2.13 `domain/nutritionPlans.ts`: `listPatientPlans` con `consultations` (4.5).
- [ ] 2.14 `npm run typecheck --workspace packages/db`.
- [ ] 2.15 Crear y correr `scripts/test-consultations.ts` (10.2).

### apps/web
- [ ] 3.1 `lib/evolution-rows.ts` (`toEvolutionRow`) y `EvolutionRow.consultationId`.
- [ ] 3.2 `measure-form-data.ts` (extraer el parseo). `clinical-actions.ts` usa
      `addEvolutionEntryOnDay`, devuelve `message` y revalida el detalle.
- [ ] 3.3 `measurement-fields.tsx`. `EvolutionForm` lo usa, con `todayKey`/`max` y el toast
      dinámico.
- [ ] 3.4 `EvolutionTable`: columna "Consulta". `EvolutionSection`: pasa `todayKey`.
- [ ] 3.5 `consultation-actions.ts` (5.2), con el chequeo de `patientId` en cada action.
- [ ] 3.6 `consultation-date-sheet.tsx` (+ `NewConsultationButton`) (7.2).
- [ ] 3.7 `consultations-section.tsx` (7.1).
- [ ] 3.8 `patient-tabs.tsx`: 7 pestañas, `consultas` segunda. Actualizar los comentarios.
- [ ] 3.9 `pacientes/[id]/page.tsx`: cargar `listPatientConsultations`, `todayKey` y la consulta
      de cada turno. Panel `consultas`, `counts.consultas`, `toEvolutionRow`.
- [ ] 3.10 `appointments-section.tsx`: columna "Consulta" / "Ver consulta" (7.5).
- [ ] 3.11 `plans-section.tsx`: "Indicado en la consulta del dd/MM" (7.6).
- [ ] 3.12 Detalle: `page.tsx` + `loading.tsx` (7.3).
- [ ] 3.13 `consultation-measurements.tsx` + `ConsultationMeasurementForm` (7.3.1).
- [ ] 3.14 `consultation-plan.tsx` (7.3.2).
- [ ] 3.15 `consultation-notes.tsx` (7.3.3).
- [ ] 3.16 `delete-consultation-button.tsx` (7.3.4).
- [ ] 3.17 `api/appointments/route.ts`: `patientId` + `consultation` (5.4).
- [ ] 3.18 `actions.ts`: `setStatusAction` con el retorno nuevo (5.3).
- [ ] 3.19 `calendar-client.tsx` + `appointment-detail-sheet.tsx` (7.4). Revisar que ningún
      `await confirm()` quede dentro de una transición o de un form action.
- [ ] 3.20 `npm run typecheck` (todos los workspaces, **incluido `apps/bot`**).

### apps/bot
- [ ] 4.1 Sin cambios de código. Confirmar que `npm run typecheck --workspace apps/bot` pasa.
- [ ] 4.2 `npm run test:confirm-flow --workspace apps/bot` (no manda WhatsApp real; limpia por
      id).

---

## 10. Tests

### 10.1 `packages/core/src/consultations.test.ts` (vitest)

Constante de apoyo: `const TZ = "America/Argentina/Buenos_Aires"` y un helper `m(partial)` que
completa `MeasurementValues` con `null`.

- `measurementKinds`:
  - Peso 66,5 + grasa y músculo → `{ anthropometry: false, bioimpedance: true }`.
  - Talla + cintura + pliegue → `{ anthropometry: true, bioimpedance: false }`.
  - Solo peso → `{ anthropometry: true, bioimpedance: false }`.
  - Todo `null` (solo nota) → `{ anthropometry: true, bioimpedance: false }`.
  - Talla + grasa → `{ anthropometry: true, bioimpedance: true }`.
- `consultationChips`:
  - Las dos mediciones de arriba + plan + notas → `["Antropometría","Bioimpedancia","Plan","Notas"]`,
    en ese orden.
  - Sin nada → `[]`.
  - `notes: "   "` → no suma "Notas".
- `isConsultationEmpty`:
  - `(0, false, null)` → `true`.
  - `(0, false, "  ")` → `true`.
  - `(0, false, "x")` → `false`.
  - `(1, false, null)` → `false`.
  - `(0, true, null)` → `false`.
- `canDeleteConsultation`:
  - `(0, false)` → `true`.
  - `(1, false)` → `false`.
  - `(0, true)` → `false`.
- `isValidDayKey`:
  - `"2026-09-12"` → `true`.
  - `"2026-02-30"`, `"12/09/2026"` y `""` → `false`.
- `isFutureDayKey`:
  - `now = 2026-09-24T23:30:00-03:00` (UTC 2026-09-25T02:30Z), `"2026-09-25"` → `true`.
  - Con el mismo `now`, `"2026-09-24"` → `false`. Es el caso de la noche en ART.
  - `"2026-09-23"` → `false`.
- `dayKeyToNoonUtc("2026-09-12", TZ).toISOString()` → `"2026-09-12T15:00:00.000Z"`.
- `dayRangeUtc("2026-09-12", TZ)` → `start` `2026-09-12T03:00:00.000Z`, `end`
  `2026-09-13T03:00:00.000Z`.
- `pickConsultationForDay`:
  - `[]` → `null`.
  - Una sin turno más reciente y una con turno → la de turno.
  - Dos sin turno → la de `createdAt` mayor.
  - Dos con turno → la de `consultedAt` mayor.
- Edad a la fecha (HU-008, escenario "11 años"): `computeAgeYears(new Date("2014-09-20"), new
  Date("2026-09-12T13:00:00Z"), TZ)` → `11`, y con `2026-09-20T13:00:00Z` → `12`. Va en este
  archivo porque documenta el uso por consulta.

### 10.2 Prueba contra la base: `packages/db/scripts/test-consultations.ts`

Script `tsx` con `node:assert/strict`. Usa **solo datos propios**, que guarda en arrays de ids.
Todo lo que crea lo borra por id en `finally`.
1. Crea un paciente (`whatsappJid: \`test-hu003-${Date.now()}@test.invalid\``, `phone: "000"`,
   `birthDate: 2014-09-20`) y un servicio (`name: "HU-003 (TEST)"`, `price: 0`, `durationMin: 30`).
2. Crea 3 turnos con **`prisma.appointment.create` directo** (A, B y C), con `status:
   "CONFIRMED"`, `createdBy: "PROFESSIONAL"`, `priceSnapshot: 0`, `needsGoogleSync: false` y
   fechas pasadas en días distintos. **No usar `createAppointment`, que encola WhatsApp.**
3. `setAppointmentStatus(A, COMPLETED)` → `created: true`. Otra vez `COMPLETED` →
   `created: false`, mismo id. `count({ where: { appointmentId: A } }) === 1`.
4. `setAppointmentStatus(A, CONFIRMED)` → `removedEmptyConsultation: true` y la consulta ya no
   existe.
5. `COMPLETED` otra vez (id nuevo), `addEvolutionEntryToConsultation(id, { weightKg: 66.5,
   bodyFatPercent: 29.4 })`, después `CONFIRMED` → la consulta y la medición siguen. Otra vez
   `COMPLETED` → **mismo** id de consulta.
6. `setAppointmentStatus(B, NO_SHOW)` → `consultation: null`, y no hay consulta con
   `appointmentId: B`.
7. `createManualConsultation({ dayKey: <mañana en tz> })` → tira `FutureConsultationDateError`.
   `createManualConsultation({ dayKey: "2026-09-15" })` → ok.
   `addEvolutionEntryToConsultation` sobre ella, después `updateManualConsultationDate(…, "2026-09-14")`
   → `consultedAt` y el `recordedAt` de la medición quedan en `2026-09-14T15:00:00Z`.
   `updateManualConsultationDate` sobre la consulta de A → tira
   `AppointmentConsultationDateError`.
8. `addEvolutionEntryOnDay(patient, "2026-09-14", …)` → `consultationCreated: false` y
   `consultation.id` = la manual. `addEvolutionEntryOnDay(patient, "2026-09-20", …)` →
   `consultationCreated: true`.
9. `createPlanForConsultation` sobre la consulta del 20/09 → plan `DRAFT` vinculado.
   `setConsultationPlan({ planId: null })` → el plan sigue existiendo con el mismo `updatedAt`.
   `setConsultationPlan` con el plan en otra consulta → ok (dos consultas apuntando al mismo
   plan).
10. `deleteConsultation` sobre una consulta con medición → tira `ConsultationNotDeletableError`.
    `createManualConsultation("2026-09-10")` + `saveConsultationNotes("x")` + `deleteConsultation`
    → ok.
11. `prisma.outboundMessage.count({ where: { appointmentId: { in: [A, B, C] } } }) === 0`.
12. `finally`, en este orden y **cada uno por id**:
    - `evolutionEntry.deleteMany({ where: { id: { in: entryIds } } })`
    - `consultation.deleteMany({ where: { id: { in: consultationIds } } })`
    - `nutritionPlan.deleteMany({ where: { id: { in: planIds } } })`
    - `appointment.deleteMany({ where: { id: { in: [A, B, C] } } })`
    - `service.delete({ where: { id } })` y `patient.delete({ where: { id } })`

    `consultationIds` junta todos los ids que devolvió el dominio. Por seguridad suma
    `consultation.findMany({ where: { appointmentId: { in: [A,B,C] } } })`, que es un filtro por
    ids propios. **Prohibidos** los filtros amplios (`patientId`, fechas, nombres).
13. Imprime `OK` o sale con código ≠ 0.

Correr desde `packages/db`: `npx dotenv -e ../../.env -- tsx scripts/test-consultations.ts`.

---

## 11. Verificación (el implementer la corre antes de declararse `done`)

Desde la raíz:

```bash
git branch --show-current                                               # hu-003-consulta-entidad-central
(cd packages/db && npx dotenv -e ../../.env -- prisma migrate status)   # "up to date", 11 migraciones
npm run db:generate
npm run test                                                            # vitest core, incluye consultations.test.ts
npm run typecheck                                                       # core, db, web y bot en verde
(cd packages/db && npx dotenv -e ../../.env -- tsx scripts/test-consultations.ts)   # OK
npm run test:confirm-flow --workspace apps/bot                          # sin WhatsApp real, limpia por id
# 3.4 C1–C8 de nuevo al final: mismos números que después de migrar (el script no dejó restos)
docker compose exec -T db psql -U nutri -d nutribot -c 'select count(*) from "Consultation";'   # = total de C3
./ops/harness/verify.sh
```

**Prohibido en esta HU:**
- `next build`, levantar otro `next dev` (el del usuario está en el puerto 3000),
  `prisma migrate reset`, aceptar el reset por drift, `prisma db push`, editar una migración ya
  aplicada, `db:seed` / `seed:demo`, y editar o borrar datos existentes desde la UI.
- No commitear. No tocar `backlog.json`.

Las salidas resumidas van a `progress/impl_HU-003.md`, incluidos A1–A3, C1–C8 y D.

---

## 12. Recorrido en el navegador (lo hace el orquestador, en `localhost:3000`)

Usar un paciente de prueba **creado para esto** (p. ej. "Prueba HU-003") y un turno propio
creado desde el calendario. Ojo: crear un turno desde el panel encola una confirmación de
WhatsApp. Si el bot está corriendo, conviene hacerlo con el bot detenido y borrar esa fila de
`OutboundMessage` por id, o reusar un turno propio. No editar pacientes reales. Al terminar,
borrar lo creado por id.

1. Ficha de un paciente real con mediciones → pestaña **Consultas**, segunda, con contador. Tiene
   que listar las consultas migradas, de la más nueva a la más vieja, con origen y chips. Abrir
   Evolución: gráficos y tabla iguales a antes, más la columna "Consulta". No borrar nada.
2. Calendario → turno propio confirmado → "Marcar completado".
   - Toast "Turno completado. Se creó su consulta.".
   - El panel sigue abierto con "Abrir consulta".
3. "Abrir consulta" → detalle:
   - Título "Consulta del dd/MM/yyyy", edad y "Turno · servicio · HH:mm hs".
   - "Fecha del turno", sin botón "Cambiar fecha".
   - Sin sección "Requerimiento".
4. "Agregar medición" (peso + bioimpedancia) y otra (talla, perímetros, pliegues):
   - Aparecen los grupos "Bioimpedancia" y "Antropometría".
   - Borrar una → confirmación "¿Borrar esta medición?" → la consulta sigue.
5. Notas → "Guardar notas" → toast "Notas guardadas" → recargar → siguen ahí.
6. Plan:
   - "Crear plan" → abre el editor. Volver → aparece en "Plan indicado".
   - "Quitar". "Indicar un plan existente" → aparece.
   - En la pestaña Planes aparece "Indicado en la consulta del dd/MM".
7. "Eliminar consulta":
   - Con mediciones o plan: deshabilitado, con el texto de ayuda.
   - Sin nada: confirmación y vuelve a `?tab=consultas`.
8. Calendario → el mismo turno completado con una consulta con contenido → "Volver a confirmado".
   - Pide confirmación "¿Volver el turno a confirmado?".
   - En el detalle aparece el aviso amarillo.
   - Marcar completado de nuevo → toast "Turno completado." y la misma consulta (una sola en la
     lista).
9. Turno completado con la consulta vacía → "Volver a confirmado":
   - No pide confirmación.
   - La consulta desaparece de la lista.
10. "No asistió" en otro turno propio → no aparece ninguna consulta.
11. Consultas → "Nueva consulta":
    - Fecha de mañana → error "La fecha de la consulta no puede ser futura".
    - Hoy → toast "Consulta creada" y se abre el detalle con el badge "Sin turno".
    - "Cambiar fecha" a ayer → cambia la fecha, y sus mediciones también.
    - Otra "Nueva consulta" con la misma fecha → aviso "Ya hay una consulta de ese día", con
      "Abrir consulta" y "Crear igual".
12. Evolución:
    - Medición con fecha de un día que ya tiene consulta → toast "Medición agregada a la
      consulta del dd/MM", y queda en esa consulta.
    - Un día sin consulta → se crea una "Sin turno".
    - El `max` del date no deja elegir mañana.
13. Turnos → el turno completado muestra "Ver consulta".
14. Paciente de prueba sin consultas → "Todavía no hay consultas" + "Nueva consulta".
15. Pestañas a 768 px: las 7 scrollean dentro de la barra.
16. Portal del paciente: `/portal/evolucion` sin cambios, sin consultas ni notas.
17. `OutboundMessage`: ninguna fila nueva por completar o revertir turnos.

---

## 13. Restricciones para el implementer (obligatorias)

1. **Datos de desarrollo:** ningún dato de negocio preexistente se borra ni cambia de valor. La
   única escritura sobre datos existentes es el backfill 3.3, que solo hace `INSERT` de
   consultas y `UPDATE` de `consultationId`. Las pruebas usan datos propios y limpian por id.
2. **Prisma:** siguen las prohibiciones de 11. Si hay drift, `blocked` con la salida de
   `migrate status`.
3. **WhatsApp:** ninguna verificación manda mensajes reales. El script no usa
   `createAppointment` ni `cancelAppointment` y comprueba que no se encoló nada.
4. **Dominio compartido:** crear o quitar la consulta al cambiar el estado vive **solo** en
   `setAppointmentStatus` (`packages/db/domain`), no en la server action.
5. **`useConfirm`:** nunca `await confirm()` dentro de `<form action>` ni de `startTransition`.
6. **UI:** solo el sistema de diseño actual. Sin colores ni tokens nuevos. `tailwind.config.ts`
   no se toca (si por algún motivo hiciera falta, avisar en `progress/impl_HU-003.md`).
7. **Rama** `hu-003-consulta-entidad-central`, sin commitear, sin tocar `backlog.json`.

## 14. Fuera de alcance / extensiones futuras (no implementar)

- Todo lo de "Fuera de alcance" de la HU y la tabla 3.5.
- Reprogramar turnos: si se agrega, tiene que actualizar `Consultation.consultedAt`.
- Confirmación al borrar desde la tabla de Evolución: hoy no la tiene y la HU no la pide.
- Unificar `lib/age.ts` (`calculateAge`) con `computeAgeYears`: ya está anotado en la SDD de la
  HU-001.

Sin dudas técnicas bloqueantes.
