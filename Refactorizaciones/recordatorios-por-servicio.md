# SDD: HU-014 `recordatorios-por-servicio` (recordatorios según el tipo de turno)

HU validada: `docs/hu-recordatorios-por-servicio.md`. **Su sección "Resoluciones" (2026-10-02) manda**
por encima de los escenarios Gherkin que se escribieron antes de resolverla. Cómo se aplica cada duda:

| Duda | Resolución aplicada en esta SDD |
|---|---|
| D1 | Lista **por servicio** de 0 a **3** recordatorios. Cada uno: número entero + unidad **días/horas**. Rango **1 h a 14 días** (336 h). Columna `Service.reminders` (JSONB) |
| D2 (b) | La confirmación de asistencia (Épica 8) **pasa a ser un recordatorio más**: cada recordatorio tiene el check **"Pide confirmar (sí/no)"**, **máximo uno por servicio**. El que lo tiene manda el `CONFIRMATION_REQUEST` de siempre (mismo texto, mismo `CONFIRM_ATTENDANCE`, mismo sí/no tardío) **en lugar** de un `REMINDER`. Desaparece el 72 h fijo del código |
| D3 | La migración no adivina por nombre: **todos** los servicios (activos o no) quedan como hoy |
| D4 (a) | Se quita el campo "Aviso previo del recordatorio (horas)" de `/ajustes`. `Professional.reminderLeadHours` **queda en la base sin uso** (su valor solo se usa en el backfill). Se borra en otra HU |
| D5 (a) | Reserva tardía (el momento del recordatorio es anterior a la reserva en firme): **se saltea**. Con seña, la "reserva en firme" es la aprobación del pago (columna nueva `Appointment.bookedAt`). Bot caído: al volver se manda **solo el más cercano al turno** de los atrasados, **solo si faltan más de 2 h** |
| D6 (c) | Solo los recordatorios **en días**: si su hora cae entre las **22:00 y las 09:00** (zona de la profesional) se corre a las **09:00 del mismo día calendario**. Franja **fija**, propia de los recordatorios (no usa `afterHoursStart/End` de la HU-011). Los de horas salen exactos |
| D7 (a) | Recordatorio y recomendaciones previas siguen siendo **dos mensajes**. `enqueuePrepInstructions` no se toca |
| D8 (a) | "Enviar recordatorio ahora" es **independiente**: siempre encola, no bloquea ni reemplaza a los automáticos, con **freno a doble clic** si ya hay uno manual pendiente. **Más una línea de estado** en el detalle del turno |
| D9 | Se usa la configuración **vigente al momento de enviar**. Un servicio **desactivado** sigue mandando los recordatorios de sus turnos |
| D10 (a) | Texto de hoy + "tenés turno {hoy / mañana / pasado mañana / en una semana / en N días}" |

Skills aplicados: `refactor` (secciones 1, 2 y 9: diagnóstico, radio de impacto, checklist sin romper
en el medio), `migracion-prisma` (sección 4 y paso 1 del checklist) y `ui` (sección 8).

Rama: `feat/hu-014-recordatorios-por-servicio`, que sale de `develop` (`2e221b7`).

> **Verificación del architect (2026-10-02, solo lectura).**
> - `git fetch`: `origin/develop` = `2e221b7` = `HEAD` de la rama (ningún commit de diferencia).
> - **PR #7** (`feat/hu-010-fix-ai-sara2`, abierto, de la otra persona) toca solo `alimentos/**`,
>   `pacientes/[id]/planes/**`, `plantillas/**`, `components/food-picker.tsx`, `lib/food-policy.test.ts`,
>   `lib/meal-view.test.ts`, `apps/web/vitest.config.ts` y `packages/core/src/ai-food-catalog*.ts`.
>   **No trae migraciones** ni toca `schema.prisma`, `messages.ts`, `core/src/index.ts`,
>   `domain/*`, `workers.ts`, `/servicios`, `/ajustes` ni el detalle del turno. Esta HU no toca
>   ninguno de sus archivos.
> - `_prisma_migrations`: la última aplicada es `20261003011808_booking_reason`, igual que la última
>   carpeta de `packages/db/prisma/migrations/`. Sin drift aparente.
> - `Professional`: 1 fila, `reminderLeadHours = 24`, `timezone = America/Argentina/Buenos_Aires`,
>   `phoneJid` nulo. `Service`: 9 filas (6 activas), **ninguna con seña**, todas las activas con
>   `prepLeadHours = 24`. `Appointment`: 18 filas, **ninguna futura**. `OutboundMessage`: 1 `REMINDER`
>   (SENT, con turno), 0 `CONFIRMATION_REQUEST`.
> - Índice real: `"OutboundMessage_appointmentId_kind_key" UNIQUE ("appointmentId", kind)`. La FK
>   `OutboundMessage.appointmentId` es `ON DELETE SET NULL` (los scripts borran primero los mensajes
>   por id, después los turnos).
> - Ningún código usa la clave compuesta `appointmentId_kind` (`findUnique`/`upsert`): cambiarla no
>   rompe consultas. `payments.ts` usa `createMany({ skipDuplicates: true })` para `CONFIRMATION`,
>   `PROFESSIONAL_ALERT` y `CANCELLATION`: con `dedupeKey` default `""` la semántica no cambia.
> - Consumidores de lo que se retira: `enqueueDueReminders` y `enqueueAttendanceConfirmations` →
>   `apps/bot/src/workers.ts`, `apps/bot/src/workers.test.ts` (mock),
>   `apps/bot/scripts/test-confirm-attendance.ts`. `reminderLeadHours` → `ajustes/{settings-form.tsx,
>   actions.ts, page.tsx}`, `packages/db/prisma/seed.ts` (se deja: escribir una columna sin uso no rompe).
>   `enqueueReminderNow` → `apps/web/src/app/(panel)/actions.ts`. `messages.reminderMessage` → solo
>   `domain/reminders.ts`. `messages.confirmAttendanceRequest` → solo `domain/reminders.ts`.
> - `apps/bot/tsconfig.json` incluye solo `src/**` (los scripts no entran en `typecheck`).
>   `npm run test` (raíz) corre vitest sobre todos los `*.test.ts` del monorepo; CI corre
>   `db:generate`, `verify.sh`, `typecheck` y `test`.
> - Conflictos HU ↔ Resoluciones detectados (manda la Resolución, ver sección 12): el escenario
>   "Migración sin cambio de comportamiento" dice "24 horas antes" solamente; "Un servicio sin
>   recordatorios" dice que la confirmación sigue; el diseño UX dice que un servicio nuevo arranca con
>   "24 horas". Con D2 (b) los tres cambian.

---

## 1. Diagnóstico (skill `refactor`)

### Qué hace hoy

| Pieza | Comportamiento actual | Qué limita |
|---|---|---|
| `enqueueDueReminders(windowMinutes = 20)` (`domain/reminders.ts`) | Busca turnos `CONFIRMED` con `startsAt ∈ [now + reminderLeadHours, +20 min)` sin ningún `REMINDER` y encola uno | Un solo valor global (`Professional.reminderLeadHours`). **Ventana fija**: si el turno se reservó tarde o el bot estuvo caído en esos 20 min, el recordatorio no sale nunca. Texto con fecha absoluta, sin "mañana" |
| `enqueueAttendanceConfirmations(windowMinutes = 30, scope)` | Turnos `CONFIRMED` con `startsAt ∈ [now + 72 h, +30 min)` sin `CONFIRMATION_REQUEST`: encola el pedido, marca `confirmationRequestedAt`, pone la conversación en `CONFIRM_ATTENDANCE` (pisando la que hubiera) | 72 h **fijo en el código**. Misma ventana fija. Los efectos laterales (estado de conversación) corren aunque `enqueueMessage` se haya tragado un `P2002` |
| `enqueueReminderNow(appointmentId)` | Encola un `REMINDER` | Por la unicidad `(appointmentId, kind)`: si ya hubo recordatorio **no encola nada** y el panel dice "Recordatorio encolado."; si se usa antes, **anula** el automático |
| `OutboundMessage @@unique([appointmentId, kind])` | Idempotencia de todos los mensajes ligados a un turno | **Imposible** guardar dos `REMINDER` para el mismo turno (lo que pide "2 días + 24 h") |
| `enqueueMessage` (`domain/outbox.ts`) | Crea la fila; se traga `P2002` y devuelve `void` | El llamador no sabe si encoló o no |
| Crons (`apps/bot/src/workers.ts`) | Recordatorios cada 15 min, confirmaciones cada 30 min, recomendaciones cada 15 min. `runStartupJobs` corre las tres | Dos crons para lo que pasa a ser un solo concepto |
| `/ajustes` → "Aviso previo del recordatorio (horas)" | Edita `reminderLeadHours` (1–168) | Configuración global, no por servicio |
| Momento de reserva | Solo `Appointment.createdAt` | Para un turno con seña, `createdAt` es el inicio de la reserva, no la aprobación del pago (D5) |

### Qué cambia

1. La configuración pasa a `Service.reminders` (lista validada en `packages/core`).
2. Un solo encolador, `enqueueServiceReminders`, decide **qué recordatorio corresponde ahora** para
   cada turno con una función pura (`pickDueReminder`), sin ventana fija: "su momento ya llegó, no se
   reservó después de ese momento y no se envió", con la regla del bot caído.
3. La identidad de cada recordatorio enviado vive en `OutboundMessage.dedupeKey` (columna nueva) y la
   unicidad pasa a `(appointmentId, kind, dedupeKey)`. Todos los demás `kind` usan `dedupeKey = ""`:
   su idempotencia queda **idéntica**.
4. El pedido de confirmación queda como "el recordatorio que pide confirmar": mismo mensaje, mismos
   efectos, misma conversación; solo cambia **cuándo** sale.
5. El manual deja de compartir clave con los automáticos (`dedupeKey = "manual:<ISO>"`) y tiene freno
   propio.

### Lo que NO cambia (y no se puede romper)

- `apps/bot/src/conversation.ts` **no se toca**: `CONFIRM_ATTENDANCE`, `handleConfirmAttendance`,
  `lateAttendanceAnswer` (`packages/core/src/wake.ts`), la regla de silencio ante mensajes comunes, el
  paso del motivo de la HU-013.
- `messages.confirmAttendanceRequest`, `attendanceConfirmedThanks`, `attendanceDeclinedNotice`:
  textos idénticos.
- `enqueuePrepInstructions` (recomendaciones previas, también para reservas tardías): sin cambios.
- `runAfterHoursDigest` (HU-011), `runSessionTextCleanup`/`clearExpiredSessionText` (HU-012/013),
  `runBotAiPurge`: sin cambios. La conciliación de pagos sigue siendo el **primer** `cron.schedule` y
  el resumen fuera de horario el **último** (los tests miran `calls[0]` y `calls.at(-1)`).
- La seña (HU-009): un turno `AWAITING_PAYMENT` no recibe nada; al aprobarse pasa a `CONFIRMED` como
  hoy y además se sella `bookedAt`.

---

## 2. Radio de impacto (lista exacta de archivos)

| Workspace | Archivo | Cambio |
|---|---|---|
| `packages/db` | `prisma/schema.prisma` | +`Service.reminders`, +`Appointment.bookedAt`, +`OutboundMessage.dedupeKey`, unicidad nueva, comentario en `reminderLeadHours` |
| `packages/db` | `prisma/migrations/<timestamp>_service_reminders/migration.sql` | **Nuevo** (generado con `--create-only` + backfill a mano) |
| `packages/core` | `src/service-reminders.ts` | **Nuevo**: tipos, límites, validación, momento, selección, frase relativa, textos de estado |
| `packages/core` | `src/service-reminders.test.ts` | **Nuevo** |
| `packages/core` | `src/messages.ts` | `reminderMessage` suma el parámetro **obligatorio** `when` y cambia la primera línea |
| `packages/core` | `src/messages.test.ts` | Casos nuevos al final (`reminderMessage`, regresión de `confirmAttendanceRequest`) |
| `packages/core` | `src/index.ts` | +1 línea `export * from "./service-reminders";` (al final) |
| `packages/db` | `domain/outbox.ts` | `enqueueMessage` acepta `dedupeKey?` y devuelve `Promise<boolean>` |
| `packages/db` | `domain/reminders.ts` | **Nuevas** `enqueueServiceReminders`, `getAppointmentReminderStatus`; `enqueueReminderNow` cambia firma; **se borran** `enqueueDueReminders` y `enqueueAttendanceConfirmations` (paso 5); `enqueuePrepInstructions` y `EnqueueScope` sin cambios |
| `packages/db` | `domain/reminders.test.ts` | **Nuevo** (prisma mockeado) |
| `packages/db` | `domain/outbox.test.ts` | **Nuevo** (prisma mockeado) |
| `packages/db` | `domain/appointments.ts` | `createAppointment` sella `bookedAt` (1 línea) |
| `packages/db` | `domain/appointments.test.ts` | Casos nuevos al final |
| `packages/db` | `domain/payments.ts` | La aprobación de la seña sella `bookedAt` (1 campo en el `updateMany`) |
| `packages/db` | `domain/payments.test.ts` | Caso nuevo al final |
| `packages/db` | `domain/index.ts` | **Sin cambios** (ya exporta `./reminders` y `./outbox`) |
| `apps/bot` | `src/workers.ts` | Un cron `*/5` con `runServiceReminders` reemplaza los dos crons viejos; `runStartupJobs` lo llama |
| `apps/bot` | `src/workers.test.ts` | Mock actualizado + tests del cron nuevo |
| `apps/bot` | `scripts/test-confirm-attendance.ts` | Usa `enqueueServiceReminders`; su servicio de prueba configura "72 h, pide confirmar"; guard de bot conectado |
| `apps/bot` | `scripts/test-service-reminders.ts` | **Nuevo** (simulación contra la base, relojes inyectados) |
| `apps/bot` | `package.json` | +script `test:service-reminders` |
| `apps/web` | `src/lib/services.ts` | `createService`/`updateService` aceptan `reminders` |
| `apps/web` | `src/app/(panel)/servicios/actions.ts` | Parseo y validación de `reminders`; `ServiceFormState.reminderErrors` |
| `apps/web` | `src/app/(panel)/servicios/reminders-editor.tsx` | **Nuevo** (editor de la lista) |
| `apps/web` | `src/app/(panel)/servicios/service-form.tsx` | Bloque "Recordatorios"; pasa al patrón `onSubmit` + `startTransition`; `EditableService.reminders` |
| `apps/web` | `src/app/(panel)/servicios/service-card.tsx` | Badge con el resumen |
| `apps/web` | `src/app/(panel)/servicios/page.tsx` | Pasa `reminders` parseados |
| `apps/web` | `src/app/(panel)/ajustes/settings-form.tsx` | Se quita el campo; línea con link a `/servicios` |
| `apps/web` | `src/app/(panel)/ajustes/actions.ts` | Se quita `reminderLeadHours` del schema y del `update` |
| `apps/web` | `src/app/(panel)/ajustes/page.tsx` | Se quita `reminderLeadHours` de `defaults`; descripción de la tarjeta |
| `apps/web` | `src/app/(panel)/actions.ts` | `sendReminderNowAction` usa el resultado; **nueva** `getAppointmentRemindersAction` |
| `apps/web` | `src/app/(panel)/appointment-detail-sheet.tsx` | Línea "Recordatorios" + feedback del botón |

**No se tocan:** `apps/bot/src/conversation.ts`, `packages/core/src/wake.ts`, `apps/bot/src/booking.ts`,
`domain/inquiries.ts`, `domain/botAi.ts`, `domain/gcal.ts`, `(panel)/avisos/**`, `calendar-client.tsx`,
`api/appointments/route.ts`, `packages/db/prisma/seed*.ts`, `.env.example`, ni ningún archivo del PR #7.

---

## 3. Workspaces afectados

| Workspace | ¿Se toca? | Resumen |
|---|---|---|
| `packages/db` | **Sí** | Schema + 1 migración con backfill; `outbox.ts`, `reminders.ts`, `appointments.ts`, `payments.ts` y sus tests |
| `packages/core` | **Sí** | Módulo puro nuevo `service-reminders.ts` con tests; `messages.ts` (`reminderMessage`) |
| `apps/bot` | **Sí** | `workers.ts` (+test), 1 script nuevo, 1 script actualizado, `package.json` |
| `apps/web` | **Sí** | `/servicios`, `/ajustes`, detalle del turno, `(panel)/actions.ts`, `lib/services.ts` |

Como cambian el schema y `packages/db/domain`, el `typecheck` tiene que pasar en **los dos** procesos.

---

## 4. Esquema (skill `migracion-prisma`)

### 4.1 Cambios en `schema.prisma`

```prisma
model Professional {
  // ...
  /// HU-014 (D4): SIN USO. Los recordatorios se configuran por servicio (`Service.reminders`).
  /// Solo lo leyó el backfill de la migración `service_reminders`. Se borra en otra migración.
  reminderLeadHours  Int      @default(24)
  // ...
}

model Service {
  // ... (después de asksReason)
  /// HU-014: recordatorios por WhatsApp antes del turno. Lista JSON de 0 a 3
  /// `{ amount: number, unit: "HOURS" | "DAYS", asksConfirmation: boolean }`, ordenada de mayor a
  /// menor anticipación. Validada con `validateServiceReminders` (packages/core) al guardar y leída
  /// con `parseServiceReminders`. Máximo uno con `asksConfirmation` (ese manda el pedido de
  /// confirmación de asistencia en vez del recordatorio). `[]` = el servicio no manda recordatorios.
  /// El default tiene que coincidir con DEFAULT_SERVICE_REMINDERS de packages/core.
  reminders    Json          @default("[{\"amount\":3,\"unit\":\"DAYS\",\"asksConfirmation\":true},{\"amount\":24,\"unit\":\"HOURS\",\"asksConfirmation\":false}]")
  // ...
}

model Appointment {
  // ... (después de confirmationResponse)
  /// HU-014 (D5): momento en que el turno quedó reservado en firme: al crearse si nace CONFIRMED,
  /// al aprobarse la seña si nació AWAITING_PAYMENT. null = turno con seña sin pagar, o fila creada
  /// por fuera de `createAppointment` (seeds/scripts): se usa `createdAt`. Los recordatorios cuyo
  /// momento es anterior a este instante no se mandan.
  bookedAt        DateTime?
  // ...
}

model OutboundMessage {
  // ... (después de anthropometricReportId)
  /// HU-014: distingue varios mensajes del mismo `kind` para el mismo turno. "" para todo lo que no
  /// es un recordatorio (y para los mensajes anteriores a la HU-014), así la unicidad de los otros
  /// kinds queda igual que antes. REMINDER automático: "auto:<horas>h" (p. ej. "auto:48h").
  /// REMINDER manual ("Enviar recordatorio ahora"): "manual:<ISO del encolado>".
  dedupeKey     String        @default("")
  // ...

  // Evita duplicar confirmaciones / recordatorios para un mismo turno (HU-014: + dedupeKey).
  @@unique([appointmentId, kind, dedupeKey])
  @@index([status, createdAt])
}
```

Se elige **JSONB en `Service`** (y no una tabla `ServiceReminder`) porque la lista es corta (≤ 3), se
lee siempre junto con el servicio, se guarda entera con el form y su forma la valida `packages/core`.
Se elige **una columna en `OutboundMessage`** (y no una tabla de "envíos") porque el registro de
qué se mandó ya es la fila del outbox (turno, tipo, cuándo, estado), es lo que muestra `/avisos`, y la
unicidad en la base da la idempotencia también ante reinicios y crons solapados.

### 4.2 Migración

Nombre: **`service_reminders`**. Desde `packages/db`:
`npx dotenv -e ../../.env -- prisma migrate dev --create-only --name service_reminders`.

SQL esperado (lo generado por Prisma + el bloque de backfill **agregado a mano al final**):

```sql
-- AlterTable
ALTER TABLE "Appointment" ADD COLUMN     "bookedAt" TIMESTAMP(3);

-- DropIndex
DROP INDEX "OutboundMessage_appointmentId_kind_key";

-- AlterTable
ALTER TABLE "OutboundMessage" ADD COLUMN     "dedupeKey" TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "Service" ADD COLUMN     "reminders" JSONB NOT NULL DEFAULT '[{"amount":3,"unit":"DAYS","asksConfirmation":true},{"amount":24,"unit":"HOURS","asksConfirmation":false}]';

-- CreateIndex
CREATE UNIQUE INDEX "OutboundMessage_appointmentId_kind_dedupeKey_key" ON "OutboundMessage"("appointmentId", "kind", "dedupeKey");

-- ── HU-014: backfill (agregado a mano) ────────────────────────────────────────────────────────
-- 1) Cada servicio (activo o no) queda como hoy: pedido de confirmación 3 días antes + recordatorio
--    `reminderLeadHours` antes. Si reminderLeadHours = 72 quedaría duplicado con los 3 días: queda
--    solo el que pide confirmar. Sin fila de Professional (base nueva) vale el DEFAULT de la columna.
UPDATE "Service" s
SET "reminders" = CASE
  WHEN p."reminderLeadHours" = 72 THEN
    '[{"amount":3,"unit":"DAYS","asksConfirmation":true}]'::jsonb
  WHEN p."reminderLeadHours" > 72 THEN jsonb_build_array(
    jsonb_build_object('amount', p."reminderLeadHours", 'unit', 'HOURS', 'asksConfirmation', false),
    jsonb_build_object('amount', 3, 'unit', 'DAYS', 'asksConfirmation', true))
  ELSE jsonb_build_array(
    jsonb_build_object('amount', 3, 'unit', 'DAYS', 'asksConfirmation', true),
    jsonb_build_object('amount', p."reminderLeadHours", 'unit', 'HOURS', 'asksConfirmation', false))
END
FROM "Professional" p
WHERE p."id" = 1;

-- 2) Los REMINDER ya encolados (automáticos o del botón, hoy indistinguibles) cuentan como el
--    recordatorio automático de `reminderLeadHours`: así ningún turno lo vuelve a recibir.
--    Los CONFIRMATION_REQUEST ya encolados no necesitan nada: quedan con dedupeKey '' y el código
--    nuevo considera enviado el pedido de confirmación si existe cualquier fila CONFIRMATION_REQUEST
--    del turno o si `confirmationRequestedAt` no es null.
UPDATE "OutboundMessage"
SET "dedupeKey" = 'auto:' || COALESCE((SELECT "reminderLeadHours" FROM "Professional" WHERE "id" = 1), 24) || 'h'
WHERE "kind" = 'REMINDER' AND "appointmentId" IS NOT NULL;

-- 3) Reserva en firme de los turnos existentes: createdAt, o la aprobación de la seña si es posterior.
--    Los AWAITING_PAYMENT quedan en NULL (se sella al aprobarse el pago).
UPDATE "Appointment" a
SET "bookedAt" = GREATEST(a."createdAt", COALESCE((
  SELECT MIN(p."paidAt") FROM "Payment" p
  WHERE p."appointmentId" = a."id" AND p."kind" = 'DEPOSIT' AND p."status" = 'APPROVED'
), a."createdAt"))
WHERE a."status" <> 'AWAITING_PAYMENT';
```

Revisión del SQL antes de aplicar (paso 1.6 del checklist):
- `DROP INDEX` es el índice único viejo, **no** una columna ni una tabla: es esperado. Si Prisma
  genera cualquier `DROP COLUMN`/`DROP TABLE`, o toca `reminderLeadHours`, **parar**.
- Las columnas `NOT NULL` nuevas (`dedupeKey`, `reminders`) tienen `DEFAULT`: Postgres llena las
  filas existentes. Las `UPDATE` corren en la misma migración (misma transacción de `migrate`), así
  que `migrate deploy` en producción deja todo consistente en un paso.
- Si el `DEFAULT` JSON que genera Prisma sale con otro orden de claves o espacios, es equivalente
  (JSONB normaliza); no editarlo.

### 4.3 Efecto en datos existentes

- **Desarrollo (hoy):** 9 servicios → `[3 días pide confirmar, 24 h]`. 1 `REMINDER` → `dedupeKey =
  'auto:24h'`. 18 turnos → `bookedAt = createdAt`. Ningún turno futuro: no sale nada al arrancar.
- **Producción (primer arranque del bot con el código nuevo):** un turno futuro que ya recibió su
  recordatorio o su pedido de confirmación **no** lo recibe de nuevo (backfill 2 y
  `confirmationRequestedAt`). Un turno futuro que **perdió** alguno por la ventana fija vieja, sin
  haberse reservado tarde (p. ej. el bot estuvo caído), entra en la regla del bot caído: recibe solo
  el más cercano al turno si faltan más de 2 h. Es el comportamiento que pide la HU (escenario "El bot
  estuvo apagado"); se avisa en el PR.

---

## 5. Contrato compartido

### 5.1 `packages/core/src/service-reminders.ts` (nuevo, puro, sin base ni red)

Consumidores: `packages/db/domain/reminders.ts` (bot y web), `apps/web` (`/servicios`, detalle del
turno). Usa `dayKeyInTz`, `wallTimeToUtc`, `hhmmToMinutes`, `formatInTimeZone` de `./time`.

```ts
export type ReminderUnit = "HOURS" | "DAYS";

/** Un recordatorio de la lista de un servicio (forma de cada elemento de `Service.reminders`). */
export interface ServiceReminder {
  amount: number;            // entero ≥ 1
  unit: ReminderUnit;
  asksConfirmation: boolean; // true = manda el pedido de confirmación (sí/no) en vez del recordatorio
}

export const SERVICE_REMINDERS_MAX = 3;
export const REMINDER_MIN_HOURS = 1;
export const REMINDER_MAX_HOURS = 336;                       // 14 días
/** Un recordatorio se considera "a tiempo" hasta 15 min después de su momento (cron cada 5 min). */
export const REMINDER_ON_TIME_TOLERANCE_MS = 15 * 60_000;
/** D5: un recordatorio atrasado (bot caído) solo sale si al turno le faltan MÁS de 2 h. */
export const REMINDER_LATE_MIN_REMAINING_MS = 2 * 3_600_000;
/** D6: franja fija para los recordatorios en días (no es la de la HU-011). */
export const REMINDER_QUIET_START = "22:00";
export const REMINDER_QUIET_END = "09:00";
/** Lo que reciben hoy todos los turnos. Default del form de servicio nuevo y de la columna. */
export const DEFAULT_SERVICE_REMINDERS: readonly ServiceReminder[] = [
  { amount: 3, unit: "DAYS", asksConfirmation: true },
  { amount: 24, unit: "HOURS", asksConfirmation: false },
];

export const SERVICE_REMINDERS_TEXT = {
  tooMany: "Hasta 3 recordatorios por servicio.",
  outOfRange: "Entre 1 hora y 14 días.",
  duplicate: "Ya hay un recordatorio con esa anticipación.",
  notInteger: "Ingresá un número entero.",
  oneConfirmation: "Solo un recordatorio puede pedir confirmación.",
  invalid: "Los recordatorios no tienen un formato válido.",
} as const;

export interface ServiceReminderError {
  /** Índice de la fila (en el orden recibido); null = error de la lista entera. */
  index: number | null;
  message: string;
}

/** Anticipación en horas: DAYS → amount × 24. */
export function reminderLeadInHours(r: Pick<ServiceReminder, "amount" | "unit">): number;

/** Clave del recordatorio automático en OutboundMessage.dedupeKey: `auto:${reminderLeadInHours(r)}h`. */
export function reminderDedupeKey(r: Pick<ServiceReminder, "amount" | "unit">): string;

/** Copia ordenada de mayor a menor anticipación (empate imposible en una lista válida). */
export function sortServiceReminders(list: readonly ServiceReminder[]): ServiceReminder[];

/**
 * Valida lo que manda el form (`unknown`: viene de JSON.parse). Reglas, en este orden:
 * 1. No es un array → [{ index: null, invalid }].
 * 2. Más de 3 elementos → [{ index: null, tooMany }] (no sigue).
 * 3. Por fila: no es objeto, `unit` no es "HOURS"/"DAYS" o `asksConfirmation` no es boolean →
 *    { index, invalid }; `amount` no es entero finito (null, "", NaN, 1.5) → { index, notInteger };
 *    lead < 1 h o > 336 h (DAYS: amount 1–14; HOURS: amount 1–336) → { index, outOfRange }.
 * 4. Entre filas válidas: misma anticipación en horas que una fila anterior (2 días = 48 h) →
 *    { index: <la posterior>, duplicate }; una segunda (o más) con asksConfirmation →
 *    { index: <la posterior>, oneConfirmation }.
 * ok → `reminders` normalizados ({ amount, unit, asksConfirmation }, sin otras claves) y ordenados
 * con sortServiceReminders. La lista vacía es válida.
 */
export function validateServiceReminders(
  input: unknown,
): { ok: true; reminders: ServiceReminder[] } | { ok: false; errors: ServiceReminderError[] };

/**
 * Lectura tolerante de `Service.reminders` (Json de Prisma). Nunca tira: si `validateServiceReminders`
 * da ok devuelve eso; si no, se queda con las filas individualmente válidas, descarta duplicados por
 * anticipación (la primera gana), deja asksConfirmation solo en la primera que lo tenga, recorta a 3
 * y ordena. No array → [].
 */
export function parseServiceReminders(json: unknown): ServiceReminder[];

/**
 * Momento del recordatorio para un turno, en UTC:
 * - HOURS: startsAt − amount h exactas.
 * - DAYS: misma hora de pared que el turno, `amount` días calendario antes, en `tz` (respeta cambios
 *   de horario). Si esa hora de pared es ≥ 22:00 o < 09:00, se corre a las 09:00 del MISMO día
 *   calendario (D6). Ej.: turno jueves 08:00, 2 días → martes 09:00; turno sábado 23:00, 1 día →
 *   viernes 09:00.
 */
export function reminderMoment(startsAt: Date, r: ServiceReminder, tz: string): Date;

export interface SentReminders {
  /** dedupeKey de los REMINDER automáticos ya encolados del turno (cualquier status). */
  autoKeys: ReadonlySet<string>;
  /** Hay un CONFIRMATION_REQUEST del turno o confirmationRequestedAt no es null. */
  confirmationSent: boolean;
}

export interface DueReminder {
  reminder: ServiceReminder;
  moment: Date;
  /** reminderDedupeKey(reminder) (también para el que pide confirmar; solo informativo en ese caso). */
  key: string;
}

/**
 * ¿Qué recordatorio hay que encolar AHORA para este turno? (null = ninguno). Algoritmo:
 * 1. startsAt ≤ now → null.
 * 2. Candidatos = recordatorios con moment ≤ now y moment ≥ bookedAt (D5 a: los que "ya habían
 *    pasado al reservar" no existen para este turno).
 * 3. Sin candidatos → null.
 * 4. Elegido = el de moment más tardío (empate: el de menor anticipación en horas). Los anteriores
 *    quedan superados y no se mandan nunca (bot caído: "solo el más cercano al turno").
 * 5. Si el elegido ya se envió (asksConfirmation ? sent.confirmationSent : sent.autoKeys.has(key)) → null.
 * 6. Atrasado (now − moment > REMINDER_ON_TIME_TOLERANCE_MS) y startsAt − now ≤
 *    REMINDER_LATE_MIN_REMAINING_MS → null.
 * 7. → elegido.
 */
export function pickDueReminder(p: {
  startsAt: Date;
  bookedAt: Date;
  reminders: readonly ServiceReminder[];
  tz: string;
  now: Date;
  sent: SentReminders;
}): DueReminder | null;

/**
 * Diferencia en días calendario (en `tz`) entre `now` y `startsAt`:
 * ≤ 0 → "hoy", 1 → "mañana", 2 → "pasado mañana", 7 → "en una semana", otro N → `en ${N} días`.
 */
export function relativeDayPhrase(now: Date, startsAt: Date, tz: string): string;

/** "1 día", "3 días", "1 h", "24 h" (según la unidad configurada). */
export function formatReminderLead(r: Pick<ServiceReminder, "amount" | "unit">): string;

/**
 * Badge de la tarjeta del servicio:
 * [] → "Sin recordatorios"
 * 1 → "Recordatorio: 7 días antes"
 * 2+ → "Recordatorios: 3 días (pide confirmar) y 24 h antes" / "Recordatorios: 7 días, 2 días y 24 h antes"
 * (orden de mayor a menor; "(pide confirmar)" detrás del que lo tiene).
 */
export function serviceRemindersSummary(list: readonly ServiceReminder[]): string;

export type ReminderItemState = "sent" | "queued" | "failed" | "pending" | "skipped" | "not_applicable";
export interface ReminderStatusItem { label: string; state: ReminderItemState }

/**
 * Estado de los recordatorios de un turno (línea del detalle, D8). Un ítem por recordatorio de la
 * config vigente, en su orden, con label `${formatReminderLead(r)} antes` + ", pide confirmar" si
 * corresponde. Estado:
 * - Hay mensaje (CONFIRMATION_REQUEST para el que pide confirmar; REMINDER con su dedupeKey para los
 *   demás): SENT → "sent", PENDING → "queued", FAILED → "failed".
 * - Pide confirmar sin mensaje pero `confirmationRequestedAt` no null → "sent".
 * - Sin mensaje: moment < bookedAt → "not_applicable"; es el que devuelve pickDueReminder → "pending";
 *   moment > now → "pending"; si no → "skipped".
 * Después, un ítem por cada REMINDER automático enviado cuya clave ya no está en la config
 * (label desde las horas de la clave: múltiplo de 24 y ≥ 48 → "N días antes"; si no → "N h antes"),
 * y uno por cada REMINDER manual (dedupeKey "manual:…" o "" — este último solo puede venir de un
 * panel viejo) con label "Manual", en orden de createdAt.
 */
export function reminderStatusItems(p: {
  startsAt: Date;
  bookedAt: Date;
  reminders: readonly ServiceReminder[];
  tz: string;
  now: Date;
  confirmationRequestedAt: Date | null;
  messages: readonly {
    kind: "REMINDER" | "CONFIRMATION_REQUEST";
    dedupeKey: string;
    status: "PENDING" | "SENT" | "FAILED";
    createdAt: Date;
  }[];
}): ReminderStatusItem[];

/**
 * Texto de la línea del detalle: ítems unidos por " · ", cada uno `${label} (${estado})` con
 * sent → "enviado", queued → "en cola", failed → "falló el envío", pending → "pendiente",
 * skipped → "no se envió", not_applicable → "no aplica, se reservó después".
 * Sin ítems → "Sin recordatorios".
 * Ej.: "3 días antes, pide confirmar (enviado) · 24 h antes (pendiente)".
 */
export function reminderStatusText(items: readonly ReminderStatusItem[]): string;
```

### 5.2 `packages/core/src/messages.ts`

```ts
export function reminderMessage(params: {
  patientName?: string | null;
  serviceName: string;
  startsAt: Date;
  tz: string;
  /** HU-014 (D10): relativeDayPhrase(now, startsAt, tz). Obligatorio. */
  when: string;
}): string
```

Texto exacto (ver 7.1). `confirmAttendanceRequest` y los demás textos **no cambian**.

### 5.3 `packages/db/domain/outbox.ts`

```ts
/** Devuelve true si creó la fila; false si ya existía (P2002 en (appointmentId, kind, dedupeKey)). */
export async function enqueueMessage(params: {
  toJid: string;
  body: string;
  kind: MessageKind;
  appointmentId?: string | null;
  /** HU-014. Default "" (lo de siempre para todo lo que no es un recordatorio). */
  dedupeKey?: string;
}): Promise<boolean>
```

Cambio de retorno `void` → `boolean`: aditivo, los llamadores existentes (`appointments.ts`,
`reminders.ts`, etc.) lo ignoran sin cambios.

### 5.4 `packages/db/domain/reminders.ts`

```ts
export interface EnqueueScope { patientIds?: string[] }   // sin cambios

export interface ServiceRemindersResult {
  /** REMINDER automáticos encolados en esta corrida. */
  reminders: number;
  /** CONFIRMATION_REQUEST encolados en esta corrida. */
  confirmations: number;
}

/**
 * HU-014. Reemplaza a enqueueDueReminders + enqueueAttendanceConfirmations. Idempotente.
 * Consumidores: bot (workers.ts: cron y arranque) y scripts de prueba.
 */
export async function enqueueServiceReminders(opts?: {
  now?: Date;            // default new Date(); los scripts inyectan el reloj
  scope?: EnqueueScope;  // pruebas: limita a estos pacientes
}): Promise<ServiceRemindersResult>
```

Implementación:
1. `pro = await getProfessional()`; `now = opts.now ?? new Date()`.
2. `prisma.appointment.findMany({ where: { status: "CONFIRMED", startsAt: { gt: now, lte: now + 15 días },
   ...(scope.patientIds ? { patientId: { in } } : {}) }, include: { patient: true, service: true,
   messages: { where: { kind: { in: ["REMINDER", "CONFIRMATION_REQUEST"] } }, select: { kind: true,
   dedupeKey: true } } } })`. **Sin filtro por `service.active`** (D9). 15 días = 14 días de máximo +
   margen del corrimiento de D6.
3. Por turno: `reminders = parseServiceReminders(appt.service.reminders)`;
   `pick = pickDueReminder({ startsAt, bookedAt: appt.bookedAt ?? appt.createdAt, reminders, tz:
   pro.timezone, now, sent: { autoKeys: Set(REMINDER con dedupeKey que empieza con "auto:"),
   confirmationSent: some CONFIRMATION_REQUEST || appt.confirmationRequestedAt !== null } })`.
4. `pick.reminder.asksConfirmation`:
   - `created = await enqueueMessage({ toJid, kind: "CONFIRMATION_REQUEST", appointmentId, body:
     messages.confirmAttendanceRequest({ serviceName, startsAt, tz }) })` (sin `dedupeKey`: "").
   - **Solo si `created`**: `appointment.update({ confirmationRequestedAt: now })` y
     `conversationState.upsert` con `step: "CONFIRM_ATTENDANCE", context: { apptId }` (create y
     update), **exactamente** como hoy. `confirmations++`.
5. Si no: `created = await enqueueMessage({ toJid, kind: "REMINDER", appointmentId, dedupeKey:
   pick.key, body: messages.reminderMessage({ patientName, serviceName, startsAt, tz, when:
   relativeDayPhrase(now, startsAt, tz) }) })`; si `created`, `reminders++`.
6. Un error en un turno no corta los demás: `try/catch` por turno, se re-lanza al final solo si
   fallaron todos (el cron loguea). (Hoy un error corta la corrida entera; esto es más robusto y no
   cambia nada visible.)

```ts
export type ReminderNowResult = "queued" | "already_pending" | "not_applicable";

/**
 * Recordatorio manual (D8 a). Independiente de los automáticos: dedupeKey `manual:${now.toISOString()}`.
 * Consumidor: web (sendReminderNowAction).
 * - Turno inexistente → tira (como hoy, findUniqueOrThrow).
 * - status ≠ CONFIRMED o startsAt ≤ now → "not_applicable" (no encola).
 * - Ya hay un REMINDER del turno con status PENDING y dedupeKey que empieza con "manual:" → "already_pending".
 * - Si no, crea el REMINDER (texto de reminderMessage con when = relativeDayPhrase(now, …)) → "queued".
 * Todo dentro de prisma.$transaction, con
 * `SELECT id FROM "Appointment" WHERE id = ${appointmentId} FOR UPDATE` primero (patrón de
 * payments.ts) para que dos clics simultáneos no encolen dos.
 */
export async function enqueueReminderNow(
  appointmentId: string,
  opts?: { now?: Date },
): Promise<ReminderNowResult>

/**
 * Estado de los recordatorios de un turno para el detalle del panel. Consumidor: web.
 * Lee el turno con service y messages (kind REMINDER/CONFIRMATION_REQUEST: kind, dedupeKey, status,
 * createdAt) y devuelve reminderStatusItems(...) con la config vigente del servicio.
 * Turno inexistente → [].
 */
export async function getAppointmentReminderStatus(
  appointmentId: string,
  opts?: { now?: Date },
): Promise<ReminderStatusItem[]>
```

`enqueuePrepInstructions` **no cambia**. `enqueueDueReminders` y `enqueueAttendanceConfirmations` se
**borran** en el paso 5 del checklist (después de migrar a sus consumidores).

### 5.5 `packages/db/domain/appointments.ts` y `payments.ts`

- `createAppointment`: en `tx.appointment.create({ data })` sumar
  `bookedAt: awaitingPayment ? null : new Date()`. Nada más.
- `payments.ts` (aprobación de la seña, `tx.appointment.updateMany` de `AWAITING_PAYMENT` →
  `CONFIRMED`): `data: { status: "CONFIRMED", needsGoogleSync: true, bookedAt: new Date() }`.
- `setAppointmentStatus` (volver a `CONFIRMED` desde completado/no asistió) **no** toca `bookedAt`.

---

## 6. Rutas, server actions y API del panel

| Lugar | Cambio |
|---|---|
| `servicios/actions.ts` → `saveServiceAction` | Campo nuevo `reminders: z.string().optional()` en el schema zod (JSON del editor). Si viene: `JSON.parse` en `try/catch` (falla → `{ ok: false, error: SERVICE_REMINDERS_TEXT.invalid }`) y `validateServiceReminders`; con errores → `{ ok: false, error: errors[0].message, reminderErrors: errors }`; ok → `payload.reminders = r.reminders`. Si no viene (cliente viejo): al crear no se pasa (vale el default de la columna), al editar no se toca. `ServiceFormState = { ok: boolean; error?: string; reminderErrors?: ServiceReminderError[] }` |
| `lib/services.ts` | `interface RemindersFields { reminders?: ServiceReminder[] }` sumado a `createService`/`updateService`. Se escribe como `reminders.map((r) => ({ amount: r.amount, unit: r.unit, asksConfirmation: r.asksConfirmation }))` (literal plano, asignable a `Prisma.InputJsonValue`); `undefined` = no se toca |
| `ajustes/actions.ts` → `saveSettingsAction` | Se quita `reminderLeadHours` del `generalSchema` y del `data` del `update`. (Un form viejo que todavía lo mande no rompe: zod descarta claves desconocidas.) |
| `(panel)/actions.ts` → `sendReminderNowAction(id)` | Retorno `ActionResult & { result?: "queued" \| "already_pending" }`. `queued` → `{ ok: true, result: "queued" }`; `already_pending` → `{ ok: true, result: "already_pending" }`; `not_applicable` → `{ ok: false, error: "Solo se puede mandar a un turno confirmado que todavía no pasó." }`; excepción → `{ ok: false, error: "No se pudo encolar el recordatorio." }` (como hoy). `revalidatePath("/avisos")` como hoy |
| `(panel)/actions.ts` → **nueva** `getAppointmentRemindersAction(id: string)` | `Promise<{ ok: true; text: string } \| { ok: false }>`: `reminderStatusText(await getAppointmentReminderStatus(id))`; excepción → `{ ok: false }`. Solo lectura |

No hay rutas ni APIs nuevas. `/avisos` no cambia (cada `REMINDER` ya es una fila "Recordatorio").

---

## 7. Mensajes del bot

### 7.1 Recordatorio (`REMINDER`, automático y manual)

Sale cuando `pickDueReminder` elige un recordatorio sin "pide confirmar" (cron) o con el botón.
No cambia el estado de la conversación del paciente (como hoy).

```
⏰ Hola {nombre}! Te recuerdo que tenés turno {when}:

📋 {servicio}
🗓️ {formatDateTime(startsAt, tz)} hs

Si no podés asistir, escribí *menú* y elegí la opción 2 para cancelar.
```

Código exacto:

```ts
const hi = params.patientName ? `Hola ${params.patientName}! ` : "";
return `⏰ ${hi}Te recuerdo que tenés turno ${params.when}:

📋 ${params.serviceName}
🗓️ ${formatDateTime(params.startsAt, params.tz)} hs

Si no podés asistir, escribí *menú* y elegí la opción 2 para cancelar.`;
```

Sin nombre: `⏰ Te recuerdo que tenés turno mañana:` … `{when}` ∈ `hoy` / `mañana` /
`pasado mañana` / `en una semana` / `en N días`, calculado al **encolar** (con el reloj inyectado).

### 7.2 Pedido de confirmación (`CONFIRMATION_REQUEST`)

**Texto sin cambios** (`messages.confirmAttendanceRequest`). Sale cuando `pickDueReminder` elige el
recordatorio con "pide confirmar". Al encolarse, como hoy: `confirmationRequestedAt = now` y la
conversación pasa a `CONFIRM_ATTENDANCE` con `{ apptId }`. Las respuestas (sí → gracias, no → cancela
y avisa, sí/no tardío claro → vale, otro texto tardío → silencio) siguen en `conversation.ts`, que no
se toca.

### 7.3 Textos del panel (no son del bot)

| Dónde | Texto |
|---|---|
| Detalle, botón OK | `Recordatorio encolado.` (toast `notify.info`, como hoy) |
| Detalle, freno | `Ya hay un recordatorio pendiente de envío para este turno.` (toast `notify.info`) |
| Detalle, turno no aplicable | `Solo se puede mandar a un turno confirmado que todavía no pasó.` (`FormError`) |
| Detalle, línea | `reminderStatusText(...)`, p. ej. `3 días antes, pide confirmar (enviado) · 24 h antes (pendiente)` |
| `/servicios` ayuda | `El bot le recuerda el turno al paciente por WhatsApp. Podés poner hasta 3.` |
| `/servicios` ayuda confirmar | `El que pide confirmar le pregunta al paciente si va a venir (sí/no). Si responde que no, el turno se cancela solo.` |
| `/servicios` lista vacía | `Los turnos de este servicio no van a recibir recordatorios.` |
| `/servicios` errores | los de `SERVICE_REMINDERS_TEXT` |
| `/servicios` tarjeta | `serviceRemindersSummary(...)` |
| `/ajustes` | `Los recordatorios se configuran en cada servicio.` con link "cada servicio" → `/servicios` |

---

## 8. UI (skill `ui`)

### 8.1 `/servicios` → form (`service-form.tsx` + nuevo `reminders-editor.tsx`)

- **Patrón de envío:** el form pasa de `<form action={action}>` a `onSubmit` + `preventDefault` +
  `startTransition(() => action(formData))` (como `ajustes/after-hours-form.tsx`), para que React 19
  no resetee lo tipeado cuando vuelve un error. Se mantiene `useActionState(saveServiceAction)`; el
  `useEffect` de éxito sigue reseteando a mano el form de alta (`formRef.reset()`,
  `setAsksReason(true)`) y además vuelve el editor a `DEFAULT_SERVICE_REMINDERS`. Ningún
  `await confirm()` en el envío.
- **Ubicación:** bloque nuevo con `border-t pt-4 sm:col-span-2` **entre** "Mandar recomendaciones
  antes del turno" y "Pedir motivo al reservar".
- **`RemindersEditor`** (cliente, `servicios/reminders-editor.tsx`):
  - Props: `{ initial: readonly ServiceReminder[]; serverErrors?: ServiceReminderError[]; showErrors: boolean; resetKey: number }`
    (o equivalente; lo importante: estado controlado y errores por fila).
  - Estado: filas `{ id: string; amount: string; unit: ReminderUnit; asksConfirmation: boolean }`
    (id local con `crypto.randomUUID()` o contador, solo para `key`).
  - Título `Recordatorios` (`text-sm font-medium`) + las dos líneas de ayuda de 7.3 en
    `text-sm text-muted-foreground`.
  - Cada fila (`div role="group" aria-label="Recordatorio {n}"`), en una línea que hace wrap en
    mobile: `Input type="number" min=1 step=1 inputMode="numeric"` (`w-24`,
    `aria-label="Anticipación del recordatorio {n}"`) + `Select` nativo del repo con
    `días`/`horas` (`aria-label="Unidad del recordatorio {n}"`) + texto `antes` + checkbox nativo
    (`h-4 w-4 accent-primary`, como el resto del form) con label `Pide confirmar (sí/no)` + botón
    `variant="ghost" size="icon"` con `Trash2` y `aria-label="Quitar recordatorio {n}"`.
  - **Máximo un "pide confirmar" por construcción:** marcar uno desmarca los demás.
  - Botón `variant="secondary" size="sm"` con `Plus` "Agregar recordatorio": agrega
    `{ amount: "", unit: "DAYS", asksConfirmation: false }` y enfoca su número; **deshabilitado** con 3
    filas (con `title="Hasta 3 recordatorios por servicio."`).
  - Lista vacía: nota gris de 7.3.
  - Input oculto `name="reminders"` con
    `JSON.stringify(rows.map(r => ({ amount: r.amount.trim() === "" ? null : Number(r.amount), unit: r.unit, asksConfirmation: r.asksConfirmation })))`.
  - **Errores junto al campo:** se calcula `validateServiceReminders(payload)` en cada render. Los
    errores de una fila se muestran debajo de ella (`text-sm text-destructive`, con `id` enlazado por
    `aria-describedby` y `aria-invalid` en el número) cuando la fila fue tocada (blur del número) o
    después de un intento de envío; los de `index: null` debajo del bloque. Si al enviar la lista es
    inválida, el `onSubmit` del form **no** despacha la action y enfoca el primer número con error.
    Si igual vuelven `state.reminderErrors` del servidor, se muestran con la misma ubicación.
- `EditableService` suma `reminders: ServiceReminder[]`. Servicio nuevo: `DEFAULT_SERVICE_REMINDERS`
  (ver pregunta P1).

### 8.2 `/servicios` → tarjeta (`service-card.tsx`)

- Siempre un `Badge tone="neutral"` con `serviceRemindersSummary(service.reminders)` en el grupo de
  badges (el `div` de badges pasa a renderizarse siempre, porque este badge siempre existe).
- `page.tsx`: `reminders: parseServiceReminders(s.reminders)` en `toView`.

### 8.3 `/ajustes`

- `settings-form.tsx`: se borra el `Field` "Aviso previo del recordatorio (horas)" y la clave
  `reminderLeadHours` de `SettingsDefaults`. En su lugar,
  `<p className="text-sm text-muted-foreground">Los recordatorios se configuran en <Link href="/servicios" className="underline underline-offset-2">cada servicio</Link>.</p>`
  (`next/link`), en la misma grilla. Si queda un hueco feo en la grilla de 2 columnas, ponerlo
  `sm:col-span-2`. `NumberInput` deja de usarse en ese archivo: quitar el import si no queda otro uso.
- `page.tsx`: sin `reminderLeadHours` en `defaults`; la descripción de la tarjeta "General" pasa a
  `Zona horaria, moneda y datos que usa el bot.`

### 8.4 Detalle del turno (`appointment-detail-sheet.tsx`)

- En el `<dl>`, **solo si `appt.status === "CONFIRMED"`**, una fila nueva al final (después de
  "Motivo"): `<dt>Recordatorios</dt><dd className="text-sm">{texto}</dd>`. El texto se carga con
  `getAppointmentRemindersAction(appt.id)` en un `useEffect` (dependencias `appt.id`, `appt.status` y
  un contador `remindersVersion`), con guard de desmontaje; mientras carga, `…` en
  `text-muted-foreground`; si `ok: false`, `—`.
- `sendReminder()`: `res.ok && res.result === "queued"` → `notify.info("Recordatorio encolado.")` y
  `remindersVersion++`; `res.ok && res.result === "already_pending"` →
  `notify.info("Ya hay un recordatorio pendiente de envío para este turno.")`; `!res.ok` →
  `setError(res.error ?? "No se pudo encolar el recordatorio.")`. El botón ya se deshabilita mientras
  `busy === "reminder"`.
- `SelectedAppointment` **no cambia** (no se toca `calendar-client.tsx` ni la API de eventos).

---

## 9. Checklist atómico (orden que no rompe el sistema en el medio)

Cada paso termina con el sistema andando (web y bot compilan, tests verdes). Marcar `[x]` y anotar
en `progress/impl_HU-014.md` lo que se corrió en cada verificación.

### Paso 0 — Preparación (solo lectura + respaldo)

- [ ] 0.1 `git status`: estar en `feat/hu-014-recordatorios-por-servicio`. No mezclar en los commits
      los archivos ajenos sin trackear (`.mcp.json`, `apps/bot/.whatsapp-auth.vieja*/`,
      `docker-compose.prod.yml`, `hus-last-meet.md`, etc.): `git add` solo los de esta HU.
- [ ] 0.2 `git fetch origin` y `git log --oneline HEAD..origin/develop -- packages/db/prisma`: tiene
      que salir **vacío** (develop no trae otra migración). Si trae algo: parar y avisar.
- [ ] 0.3 Desde `packages/db`: `npx dotenv -e ../../.env -- prisma migrate status` → "Database schema
      is up to date" con `20261003011808_booking_reason` como última. Si reporta drift o pendientes:
      **parar** (`blocked`), no resolverlo.
- [ ] 0.4 Respaldo **fuera del repo**:
      `mkdir -p ~/nutribot-backups && docker compose exec -T db pg_dump -U nutri -d nutribot -Fc > ~/nutribot-backups/pre-hu014-$(date +%Y%m%d-%H%M).dump`
      y verificar que el archivo pese más de 0 bytes.

### Paso 1 — Esquema y migración con backfill (`packages/db`)

- [ ] 1.1 Editar `schema.prisma` según 4.1 (los 3 campos, la unicidad nueva y el comentario de
      `reminderLeadHours`). No tocar nada más.
- [ ] 1.2 Desde `packages/db`: `npx dotenv -e ../../.env -- prisma migrate dev --create-only --name service_reminders`.
      Si Prisma ofrece **reset** por drift: responder que **no**, parar y avisar.
- [ ] 1.3 Leer el `migration.sql` generado: tiene que coincidir con la parte generada de 4.2
      (ADD COLUMN ×3, DROP INDEX del índice viejo, CREATE UNIQUE INDEX nuevo). Ningún
      `DROP COLUMN`/`DROP TABLE`.
- [ ] 1.4 Agregar **al final** el bloque de backfill de 4.2 (los tres `UPDATE`), sin tocar lo generado.
- [ ] 1.5 Aplicar: `npm run db:migrate` (raíz). Después `npm run db:generate`.
- [ ] 1.6 Verificar en solo lectura (`docker compose exec -T db psql -U nutri -d nutribot -c "…"`):
      - `SELECT name, reminders FROM "Service";` → todas con `[3 DAYS true, 24 HOURS false]`.
      - `SELECT kind, "dedupeKey", count(*) FROM "OutboundMessage" GROUP BY 1,2;` → `REMINDER`
        con `auto:24h`; el resto con `''`.
      - `SELECT count(*) FILTER (WHERE "bookedAt" IS NULL) FROM "Appointment" WHERE status <> 'AWAITING_PAYMENT';` → 0.
      - `\d "OutboundMessage"` → índice único `(appointmentId, kind, dedupeKey)` y sin el viejo.
- [ ] 1.7 `npm run typecheck` (los 4 workspaces) y `npm run test`: verdes **sin tocar código** (el
      código viejo sigue funcionando: `enqueueMessage` crea con `dedupeKey = ""`, el cron viejo
      filtra `none: { kind: "REMINDER" }`).
- [ ] 1.8 Commit: `HU-014: modelo de recordatorios por servicio (migración con backfill)`.

### Paso 2 — Lógica pura (`packages/core`)

- [ ] 2.1 Crear `src/service-reminders.ts` con el contrato de 5.1.
- [ ] 2.2 Crear `src/service-reminders.test.ts` con los casos de 10.1.
- [ ] 2.3 `src/index.ts`: agregar al final `export * from "./service-reminders";`.
- [ ] 2.4 `src/messages.ts`: `reminderMessage` con `when` obligatorio y el texto de 7.1.
- [ ] 2.5 Adaptar **en el mismo paso** los dos llamadores viejos de `reminderMessage` en
      `domain/reminders.ts` (`enqueueDueReminders` y `enqueueReminderNow`) pasando
      `when: relativeDayPhrase(new Date(), appt.startsAt, pro.timezone)`, para que compile.
- [ ] 2.6 `src/messages.test.ts`: casos de 10.2.
- [ ] 2.7 Verificar: `npm run test` y `npm run typecheck` verdes.
- [ ] 2.8 Commit.

### Paso 3 — Dominio nuevo conviviendo con el viejo (`packages/db/domain`)

- [ ] 3.1 `outbox.ts`: `dedupeKey?` y retorno `boolean` (5.3). Test nuevo `outbox.test.ts` (10.3).
- [ ] 3.2 `appointments.ts`: `bookedAt` en `createAppointment` (5.5). Casos nuevos en
      `appointments.test.ts`.
- [ ] 3.3 `payments.ts`: `bookedAt` en la aprobación (5.5). Caso nuevo en `payments.test.ts`.
- [ ] 3.4 `reminders.ts`: agregar `enqueueServiceReminders` y `getAppointmentReminderStatus`
      (5.4); reemplazar `enqueueReminderNow` por la versión nueva (retorna `ReminderNowResult`; el
      web actual la llama con `await` e ignora el valor: compila). **No** borrar todavía
      `enqueueDueReminders` ni `enqueueAttendanceConfirmations`.
- [ ] 3.5 `reminders.test.ts` nuevo (10.3).
- [ ] 3.6 Verificar: `npm run test`, `npm run typecheck` (web y bot incluidos).
- [ ] 3.7 Commit.

### Paso 4 — El bot pasa al encolador nuevo (`apps/bot`)

- [ ] 4.1 `workers.ts`: agregar `runServiceReminders()` (guard `remindersRunning` como
      `runAfterHoursDigest`; loguea `"Recordatorios encolados"` con `{ n: reminders }` y
      `"Confirmaciones de asistencia encoladas"` con `{ n: confirmations }` si son > 0; `catch` →
      `logger.error({ err }, "Error encolando recordatorios")`). En `startCron`, **reemplazar** el
      cron `*/15` de `enqueueDueReminders` por `cron.schedule("*/5 * * * *", () => runServiceReminders())`
      en la misma posición y **borrar** el cron `*/30` de `enqueueAttendanceConfirmations`. En
      `runStartupJobs`, reemplazar las dos llamadas por `await runServiceReminders();`. Imports
      actualizados. El primer `schedule` sigue siendo la conciliación de pagos y el último el
      resumen fuera de horario.
- [ ] 4.2 `workers.test.ts`: en el `vi.mock("@nutri-bot/db/domain")` reemplazar
      `enqueueDueReminders`/`enqueueAttendanceConfirmations` por `enqueueServiceReminders:
      mocks.serviceReminders`; tests de 10.4.
- [ ] 4.3 `scripts/test-confirm-attendance.ts`: cambios de 10.5.
- [ ] 4.4 `scripts/test-service-reminders.ts` nuevo (10.6) y en `apps/bot/package.json`:
      `"test:service-reminders": "dotenv -e ../../.env -- tsx scripts/test-service-reminders.ts"`.
- [ ] 4.5 Verificar: `npm run test`, `npm run typecheck`, `npm run test:confirm-flow --workspace apps/bot`,
      `npm run test:service-reminders --workspace apps/bot` (con el bot **apagado**). Después de cada
      script, confirmar en solo lectura que no quedó nada suyo:
      `SELECT count(*) FROM "OutboundMessage" WHERE "toJid" LIKE '549000000%';` → 0 y
      `SELECT count(*) FROM "Service" WHERE name LIKE '%(TEST)%';` → 0.
- [ ] 4.6 Commit.

### Paso 5 — Retirar lo viejo (`packages/db/domain`)

- [ ] 5.1 `grep -rn "enqueueDueReminders\|enqueueAttendanceConfirmations" apps packages --include='*.ts' --include='*.tsx'`
      → solo sus definiciones en `reminders.ts`.
- [ ] 5.2 Borrarlas de `reminders.ts` (y el comentario huérfano "Pide confirmar asistencia a los
      turnos que empiezan en ~3 días"). `EnqueueScope` y `enqueuePrepInstructions` quedan.
- [ ] 5.3 Verificar: `npm run typecheck`, `npm run test`.
- [ ] 5.4 Commit.

### Paso 6 — Panel (`apps/web`)

- [ ] 6.1 `lib/services.ts`: `RemindersFields` (sección 6).
- [ ] 6.2 `servicios/actions.ts`: parseo + validación + `reminderErrors` (sección 6).
- [ ] 6.3 `servicios/reminders-editor.tsx` nuevo y `service-form.tsx` (8.1).
- [ ] 6.4 `servicios/service-card.tsx` y `servicios/page.tsx` (8.2).
- [ ] 6.5 `ajustes/settings-form.tsx`, `ajustes/actions.ts`, `ajustes/page.tsx` (8.3).
- [ ] 6.6 `(panel)/actions.ts`: `sendReminderNowAction` con resultado y
      `getAppointmentRemindersAction` (sección 6).
- [ ] 6.7 `appointment-detail-sheet.tsx` (8.4).
- [ ] 6.8 Verificar: `npm run typecheck`, `npm run test`; con `npm run dev`, a mano en el navegador
      (sin bot corriendo, ver 11): editar un servicio **de prueba creado para esto** (no los reales),
      probar agregar/quitar, tope de 3, duplicado (2 días + 48 h), fuera de rango (0 h, 15 días),
      dos "pide confirmar" (se desmarca el otro), lista vacía (nota gris), guardar y ver el badge;
      `/ajustes` sin el campo y con el link; detalle de un turno de prueba: línea de estado y botón
      dos veces seguidas (segundo toast "Ya hay…"). Borrar por id lo creado (servicio, turno,
      `OutboundMessage`) al terminar.
- [ ] 6.9 Commit.

### Paso 7 — Cierre

- [ ] 7.1 Correr toda la verificación de la sección 11.
- [ ] 7.2 `progress/impl_HU-014.md` con archivos, salida de cada verificación y desvíos de esta SDD.

---

## 10. Tests

### 10.1 `packages/core/src/service-reminders.test.ts` (vitest, puros)

Zona por defecto `TZ = "America/Argentina/Buenos_Aires"` (UTC−3, sin horario de verano). Fechas de
la HU (2026: 13/10 es martes, 15/10 jueves).

- **`reminderLeadInHours` / `reminderDedupeKey`:** 2 DAYS → 48 / `"auto:48h"`; 24 HOURS → 24 / `"auto:24h"`.
- **`validateServiceReminders`:**
  - `[]` → ok `[]`.
  - `[24 h, 3 días pide confirmar]` → ok, ordenado `[3 días, 24 h]`, sin claves extra.
  - 4 elementos → `[{ index: null, tooMany }]`.
  - `0` h, `337` h, `15` días, `0` días → `outOfRange` con su índice; `1` h y `14` días → ok.
  - `amount` `null`, `""`, `1.5`, `"3"` (string) → `notInteger`.
  - `unit: "WEEKS"`, fila `null`, `asksConfirmation: "si"` → `invalid`.
  - `[2 días, 48 h]` → `{ index: 1, duplicate }`.
  - dos con `asksConfirmation` → `{ index: 1, oneConfirmation }`.
  - no array (`{}`, `"x"`, `null`) → `[{ index: null, invalid }]`.
- **`parseServiceReminders`:** JSON válido → igual que validate; basura (`null`, `{}`) → `[]`; lista
  con una fila inválida y dos válidas → las dos válidas; duplicados → queda el primero; dos que piden
  confirmar → solo el primero lo conserva; 5 válidas → 3. Nunca tira.
- **`DEFAULT_SERVICE_REMINDERS`:** igual a `[3 DAYS true, 24 HOURS false]` (y el implementer revisa a
  mano que coincida con el `@default` del schema).
- **`reminderMoment`:**
  - 24 HOURS, turno `2026-10-15T13:00Z` (jueves 10:00) → `2026-10-14T13:00Z`.
  - 7 DAYS, turno `2026-10-13T20:00Z` (martes 17:00) → `2026-10-06T20:00Z`.
  - 2 DAYS, turno `2026-10-15T11:00Z` (jueves 08:00) → `2026-10-13T12:00Z` (martes 09:00, corrido).
  - 1 DAYS, turno `2026-10-18T02:00Z` (sábado 17/10 23:00) → `2026-10-16T12:00Z` (viernes 09:00, mismo día).
  - Bordes de la franja: hora de pared 21:59 → no se corre; 22:00 → se corre; 08:59 → se corre;
    09:00 → no se corre.
  - 2 HOURS con turno a las 08:00 → 06:00 exactas (las horas no se corren).
  - Horario de verano, `tz = "Europe/Madrid"`: 3 DAYS, turno `2026-10-27T09:00Z` (martes 10:00 CET)
    → `2026-10-24T08:00Z` (sábado 10:00 CEST), no `…T09:00Z`.
- **`pickDueReminder`** (bookedAt muy anterior salvo que se diga; sent vacío salvo que se diga):
  - Control 7 días, turno martes 13/10 17:00: `now` = momento + 1 min → 7 días; `now` = momento − 1 min → null.
  - Primera (2 días + 24 h), turno jueves 15/10 10:00: a las 10:01 del martes → 2 días; a las 10:01
    del miércoles con `autoKeys = {"auto:48h"}` → 24 h; mismo `now` con `{"auto:48h","auto:24h"}` → null.
  - Idempotencia: el elegido ya en `autoKeys` → null.
  - Reserva tardía: bookedAt = turno − 46 h; `now` = turno − 46 h + 1 min → null; `now` = turno − 24 h + 1 min → 24 h.
  - Reserva con menos anticipación que todos: bookedAt = turno − 20 h → null en `now` = turno − 19 h y turno − 1 h.
  - Bot caído: bookedAt = turno − 5 días; `now` = turno − 20 h (los dos atrasados) → 24 h (solo el
    más cercano); `now` = turno − 90 min (atrasado, faltan < 2 h) → null; `now` = turno − 2 h − 1 min
    con 24 h atrasado → 24 h; exactamente 2 h → null.
  - Dentro de la tolerancia: recordatorio de 1 h, `now` = momento + 10 min (faltan 50 min) → sale;
    `now` = momento + 16 min → null.
  - Seña: bookedAt (aprobación) después del momento de 2 días → 2 días nunca; 24 h sí.
  - Turno ya empezado (`startsAt ≤ now`) → null. Lista vacía → null.
  - Pide confirmar: 3 días pide confirmar, `now` en su momento → elegido con `asksConfirmation`;
    con `confirmationSent: true` → null.
  - Corrimiento D6: 2 días, turno jueves 08:00; `now` = martes 08:30 → null; martes 09:01 → 2 días.
  - Empate de momentos (turno 08:00, "1 día" corrido a 09:00 y "23 h") → el de 23 h.
- **`relativeDayPhrase`:** mismo día → "hoy"; +1 → "mañana"; +2 → "pasado mañana"; +7 → "en una
  semana"; +3 → "en 3 días"; +14 → "en 14 días"; borde de medianoche en la zona: `now =
  2026-10-14T02:30Z` (13/10 23:30 ART), turno `2026-10-14T13:00Z` → "mañana" (en UTC sería "hoy");
  turno en el pasado → "hoy".
- **`formatReminderLead` / `serviceRemindersSummary`:** "1 día", "3 días", "1 h", "24 h"; `[]` →
  "Sin recordatorios"; `[7 días]` → "Recordatorio: 7 días antes"; `[3 días pide confirmar, 24 h]` →
  "Recordatorios: 3 días (pide confirmar) y 24 h antes"; tres → "Recordatorios: 7 días, 2 días y 24 h antes".
- **`reminderStatusItems` / `reminderStatusText`:** config `[3 días pide confirmar, 24 h]` con
  `CONFIRMATION_REQUEST` SENT y `now` antes del momento de 24 h → "3 días antes, pide confirmar
  (enviado) · 24 h antes (pendiente)"; REMINDER `auto:24h` PENDING → "en cola"; FAILED → "falló el
  envío"; `confirmationRequestedAt` sin fila → "enviado"; momento anterior a bookedAt → "no aplica, se
  reservó después"; momento pasado sin enviar y no elegible → "no se envió"; REMINDER `auto:168h` SENT
  que ya no está en la config → ítem "7 días antes (enviado)"; REMINDER `manual:…` → ítem "Manual";
  config vacía sin mensajes → "Sin recordatorios".

### 10.2 `packages/core/src/messages.test.ts` (casos nuevos al final)

- `reminderMessage` con nombre y `when: "mañana"` → igual, carácter por carácter, al bloque de 7.1
  con los valores puestos (usar `formatDateTime` para la línea de fecha).
- Sin nombre → empieza con `⏰ Te recuerdo que tenés turno en una semana:`.
- Regresión: `confirmAttendanceRequest` sigue igual al texto de hoy (literal).

### 10.3 `packages/db/domain` (vitest, prisma mockeado como en `appointments.test.ts`)

`outbox.test.ts`:
- crea con `dedupeKey: ""` si no se pasa y con el valor si se pasa; devuelve `true`.
- `P2002` → devuelve `false`, no tira. Otro error → tira.

`reminders.test.ts` (mocks: `../index` con `prisma.{appointment.findMany, appointment.findUnique,
appointment.update, conversationState.upsert, outboundMessage.findFirst, outboundMessage.create,
$transaction, $queryRaw}`, `./availability` → `getProfessional`, `./outbox` → `enqueueMessage`):
- `enqueueServiceReminders`:
  - el `where` del `findMany` tiene `status: "CONFIRMED"`, `startsAt: { gt: now, lte: now + 15 d }`,
    **no** filtra por `service.active`, y aplica `scope.patientIds` si viene.
  - turno con `[24 h]` en su momento → `enqueueMessage` con `kind: "REMINDER"`, `dedupeKey: "auto:24h"`
    y body con "tenés turno mañana"; resultado `{ reminders: 1, confirmations: 0 }`.
  - turno con `[3 días pide confirmar]` en su momento → `enqueueMessage` con `kind:
    "CONFIRMATION_REQUEST"` y el body de `confirmAttendanceRequest`; `appointment.update` con
    `confirmationRequestedAt: now`; `conversationState.upsert` con `CONFIRM_ATTENDANCE` y `{ apptId }`.
  - si `enqueueMessage` devuelve `false` → ni `update` ni `upsert`, y no cuenta.
  - turno con `messages` que ya tienen `auto:24h` → no encola.
  - `confirmationRequestedAt` no null sin fila → no encola la confirmación.
  - `bookedAt: null` → usa `createdAt` (reserva tardía según `createdAt` → no encola).
  - `service.reminders` basura → no tira, no encola.
  - un turno cuyo `enqueueMessage` tira no impide que se encole el siguiente.
- `enqueueReminderNow`:
  - turno `CANCELLED` o pasado → `"not_applicable"`, sin `create`.
  - `findFirst` devuelve un manual pendiente → `"already_pending"`, sin `create`.
  - si no → `create` con `kind: "REMINDER"`, `dedupeKey: "manual:<now ISO>"`, body con la frase; `"queued"`.
  - se ejecuta dentro de `$transaction` y el `$queryRaw` (FOR UPDATE) corre antes del `findFirst`.
- `getAppointmentReminderStatus`: turno inexistente → `[]`; turno con mensajes → los ítems esperados
  (alcanza un caso; el detalle está en core).

`appointments.test.ts` (al final): `createAppointment` sin seña → `data.bookedAt` es un `Date`; con
seña (paciente + `requiresDeposit`) → `data.bookedAt === null`.

`payments.test.ts` (al final): al aprobar la seña, el `appointment.updateMany` lleva
`data.bookedAt` instancia de `Date` además de `status: "CONFIRMED"` y `needsGoogleSync: true`.

### 10.4 `apps/bot/src/workers.test.ts`

- Mock actualizado (sin `enqueueDueReminders`/`enqueueAttendanceConfirmations`; con
  `enqueueServiceReminders`).
- Hay un `schedule` con `"*/5 * * * *"` cuyo callback llama a `enqueueServiceReminders` una vez.
- Ningún `schedule` con `"*/30 * * * *"` (el cron viejo de confirmaciones desapareció).
- `runServiceReminders` no se solapa (misma técnica que "skips overlapping ticks") y un rechazo se
  loguea con `logger.error` sin tirar.
- Los tests existentes siguen pasando: el primero es la conciliación y el último el resumen.
- `runStartupJobs` llama a `enqueueServiceReminders` (mock de `syncGoogleCalendar` y
  `enqueuePrepInstructions` resueltos).

### 10.5 `apps/bot/scripts/test-confirm-attendance.ts` (actualizar, mismo flujo)

- Import: `enqueueServiceReminders` en lugar de `enqueueAttendanceConfirmations`.
- Al crear el servicio de prueba: `reminders: [{ amount: 72, unit: "HOURS", asksConfirmation: true }]`
  (en **horas**: no lo afecta el corrimiento nocturno, así el script no depende de la hora a la que
  se corre).
- Turnos A/B/D: `startsAt = Date.now() + 72 h − {2, 1.5, 1} min` (su momento ya llegó y está dentro
  de la tolerancia) y `bookedAt: new Date(Date.now() − 24 h)`.
- Llamadas: `await enqueueServiceReminders({ scope: { patientIds: [patient.id] } })`; los asserts
  pasan a `res.confirmations` (A: `>= 1`; B: `=== 1`, "no re-encola A"). El resto de los escenarios
  (sí, no, tardío, recomendaciones) **sin cambios**.
- Guard nuevo al principio (antes de crear nada): si `BotStatus.connected` es `true`, abortar con
  "Pará el bot antes de correr esta prueba (o ALLOW_BOT_RUNNING=1 si BotStatus quedó colgado)".
- La limpieza existente queda como está (borra por el paciente y el servicio que crea el propio
  script).

### 10.6 `apps/bot/scripts/test-service-reminders.ts` (nuevo)

Simula el encolado contra la base de desarrollo **sin Baileys**, con relojes inyectados.

Reglas (encabezado del archivo, como `test-booking-reason.ts`):
- **Nunca manda WhatsApp.** Aborta si `BotStatus.connected` es `true` (salvo `ALLOW_BOT_RUNNING=1`,
  para un `BotStatus` colgado): con el consumidor del outbox corriendo, cualquier fila `PENDING` se
  despacharía. Además, cada `OutboundMessage` que encola se borra **por id** apenas se verifica.
- **Fechas lejanas:** `T0` = 12:00 (zona de la profesional) del día `hoy + 40`. Todos los turnos
  caen entre `T0` y `T0 + 12 días`, fuera del horizonte de 15 días del cron real: aunque el bot
  arrancara durante la prueba, no los ve.
- **Datos propios:** jids `5490000014031@s.whatsapp.net`, `…14032…` (no compartidos con otros
  scripts); servicios `HU014 … (TEST)` creados con **`active: false`** (no aparecen en el menú del
  bot y, de paso, cubren D9: desactivado sigue mandando) y `reminders` explícitos; turnos creados con
  `prisma.appointment.create` con `status`, `bookedAt` y `needsGoogleSync: false` explícitos. Se
  guardan todos los ids en `Set`s.
- **Limpieza solo por id**, en `finally` y también al principio (restos de una corrida anterior,
  buscados por nombre exacto de servicio **y** jid de prueba, como `test-booking-reason.ts`):
  `OutboundMessage` (ids propios + los de `appointmentId in <turnos propios>`) → `ConversationState`
  de los jids de prueba → `Appointment` → `Service` → `Patient`. **No** lee ni escribe la fila de
  `Professional` (solo `getProfessional()` para la zona) ni ningún servicio, paciente o turno real.
- Todas las llamadas: `enqueueServiceReminders({ now, scope: { patientIds } })` y
  `enqueueReminderNow(id, { now })`, `getAppointmentReminderStatus(id, { now })`.

Escenarios (cada uno imprime ✅/❌ como `test-confirm-attendance.ts`):
1. **Control 7 días** (`[7 DAYS]`), turno `T0 + 7 d` a las 17:00, bookedAt `T0 − 5 d`: en el
   momento + 1 min → 1 `REMINDER` `auto:168h` con "en una semana"; segunda corrida con el mismo `now`
   → 0 (idempotente); en turno − 24 h → 0.
2. **Primera** (`[2 DAYS, 24 HOURS]`), turno a las 10:00: en 2 días + 1 min → "pasado mañana"
   (`auto:48h`); en 24 h + 1 min → "mañana" (`auto:24h`); hay exactamente 2 filas `REMINDER` del turno.
3. **Reserva tardía** (bookedAt = turno − 46 h): en turno − 46 h + 1 min → 0; en turno − 24 h + 1 min → 1 (`auto:24h`).
4. **Menos anticipación que todos** (bookedAt = turno − 20 h): turno − 19 h y turno − 1 h → 0.
5. **Bot caído** (bookedAt = turno − 5 d): primera corrida en turno − 20 h → 1 fila, `auto:24h`, y no
   existe `auto:48h`. Otro turno igual: primera corrida en turno − 90 min → 0.
6. **No confirmados:** turno `CANCELLED` y turno `AWAITING_PAYMENT` en el momento → 0.
7. **Seña:** turno `AWAITING_PAYMENT`; se actualiza **por id** a `CONFIRMED` con `bookedAt` posterior
   al momento de 2 días (simula la aprobación); en 2 días + 1 h → 0; en 24 h + 1 min → 1.
8. **Corrimiento D6** (`[2 DAYS]`, turno a las 08:00): martes 08:30 → 0; martes 09:01 → 1.
9. **Cambio de configuración:** turno `[7 DAYS]` a `T0 + 10 d` ya con su `auto:168h`; se actualiza
   **por id** el servicio de prueba a `[7 DAYS, 2 DAYS]`; en 2 días + 1 min → 1 (`auto:48h`) y
   sigue habiendo una sola `auto:168h`.
10. **Pide confirmar** (`[3 DAYS pide confirmar, 24 HOURS]`): en 3 días + 1 min → `confirmations: 1`,
    `CONFIRMATION_REQUEST` del turno, `confirmationRequestedAt` no nulo, `ConversationState` del jid
    en `CONFIRM_ATTENDANCE` con ese `apptId`; segunda corrida → 0; en 24 h + 1 min → `reminders: 1`.
11. **Manual:** `enqueueReminderNow` → `"queued"`; otra vez → `"already_pending"` (sigue habiendo 1
    manual); se marca esa fila `SENT` **por id**; otra vez → `"queued"`. Después, el automático de
    24 h del mismo turno sale igual en su momento.
12. **Sin recordatorios** (`[]`): en turno − 24 h → 0.
13. **Estado:** `getAppointmentReminderStatus` del turno del escenario 10 a mitad de camino → texto
    `"3 días antes, pide confirmar (enviado) · 24 h antes (pendiente)"` (vía `reminderStatusText`).

---

## 11. Verificación (lo que corre el implementer antes de `done`)

Desde la raíz, con el **bot apagado** (`npm run dev:bot` no corriendo):

```bash
npm run db:generate
npm run typecheck                                       # core, db, web y bot
npm run test                                            # vitest de todo el monorepo
npm run test:confirm-flow --workspace apps/bot          # Épica 8 + sí/no tardío + recomendaciones
npm run test:service-reminders --workspace apps/bot     # HU-014
npm run test:booking-reason --workspace apps/bot        # regresión HU-013 (createAppointment/payments tocados)
(cd packages/db && npx dotenv -e ../../.env -- prisma migrate status)   # "up to date", sin drift
./ops/harness/verify.sh
```

Más, en solo lectura, que no quedó nada de las pruebas:

```bash
docker compose exec -T db psql -U nutri -d nutribot -c "SELECT count(*) FROM \"OutboundMessage\" WHERE \"toJid\" LIKE '549000000%';"
docker compose exec -T db psql -U nutri -d nutribot -c "SELECT count(*) FROM \"Service\" WHERE name LIKE '%(TEST)%';"
docker compose exec -T db psql -U nutri -d nutribot -c "SELECT count(*) FROM \"Patient\" WHERE \"whatsappJid\" LIKE '549000000%';"
```

(los tres en 0), y la prueba manual del panel del paso 6.8.

---

## 12. Restricciones para el implementer

- **Datos de la base de desarrollo (regla dura de `AGENTS.md`):** ningún agente borra ni modifica
  datos de negocio preexistentes. Las pruebas limpian **solo por los ids que insertaron**; nada de
  `deleteMany` con filtros amplios sobre datos reales. No tocar la fila de `Professional` ni los
  servicios reales (la prueba manual del panel usa un servicio creado para eso y lo borra por id).
  No correr `db:seed` / `seed:demo`. La única escritura sobre datos existentes permitida es la de la
  migración (backfill de 4.2), después del `pg_dump`.
- **WhatsApp: nunca mensajes reales.** Scripts sin Baileys; con el bot apagado; toda fila de
  `OutboundMessage` que encolen se borra por id. Los scripts abortan si `BotStatus.connected`.
- **Migraciones:** prohibido `prisma migrate reset` (y aceptar el reset que ofrece `migrate dev`),
  `prisma db push`, pasar `DATABASE_URL` como `--shadow-database-url` y `prisma migrate diff
  --from-migrations` contra la base de desarrollo. Si hay drift: `blocked` con la salida de
  `migrate status`. No editar migraciones ya aplicadas.
- **No tocar:** `apps/bot/src/conversation.ts`, `packages/core/src/wake.ts`,
  `enqueuePrepInstructions`, `runAfterHoursDigest`, `runSessionTextCleanup`, `runBotAiPurge`,
  `backlog/`, y ningún archivo del PR #7 (`alimentos/**`, `planes/**`, `plantillas/**`,
  `food-picker.tsx`, `ai-food-catalog*.ts`, `food-policy.test.ts`, `meal-view.test.ts`,
  `apps/web/vitest.config.ts`). En archivos compartidos (`messages.ts`, `core/src/index.ts`,
  `workers.ts`, `(panel)/actions.ts`, tests existentes), cambios mínimos y aditivos.
- **Sin dependencias nuevas.** UI con los componentes del repo (`@/components/ui`,
  `@/components/primitives/*`, `lucide-react`).
- **Commits:** solo los archivos de esta HU (`git add` por archivo; hay archivos ajenos sin trackear
  en el working tree). Trailer `Co-Authored-By` del agente. Nada a `main` ni a `develop`.
- **Resultado:** `progress/impl_HU-014.md` con archivos tocados, salida resumida de cada
  verificación y cualquier desvío de esta SDD (con el motivo).

---

## 13. Preguntas técnicas (ninguna bloquea; se implementa el default si nadie dice otra cosa)

| # | Pregunta | Default que implementa esta SDD |
|---|---|---|
| P1 | El diseño UX de la HU dice que un servicio **nuevo** arranca con "24 horas"; con D2 (b), eso lo dejaría sin pedido de confirmación, distinto de los existentes | Arranca con `DEFAULT_SERVICE_REMINDERS` = "3 días, pide confirmar" + "24 h" (igual que la migración y el default de la columna) |
| P2 | El escenario "Un servicio sin recordatorios" dice que la confirmación sigue funcionando (eso era D2 (a)). Con D2 (b), lista vacía = tampoco hay pedido de confirmación | Lista vacía = **ningún** mensaje previo (ni recordatorio ni confirmación). Las recomendaciones previas siguen igual. La ayuda del editor explica qué hace "pide confirmar" |
| P3 | El escenario "Migración sin cambio de comportamiento" dice que cada servicio queda con "24 horas antes" solamente | Manda la Resolución: "3 días, pide confirmar" + "`reminderLeadHours` h" |
| P4 | ¿El pedido de confirmación suma la frase relativa ("¿Vas a poder venir a tu turno de pasado mañana?")? | **No**: texto idéntico al de hoy (no se toca lo que arregló el PR #12 ni su script) |
| P5 | D6 dice "09:00 del mismo día". Para una hora de pared entre 22:00 y 23:59, eso **adelanta** el envío ~13–15 h (en vez de pasarlo a las 09:00 del día siguiente) | Mismo día calendario: así la frase ("pasado mañana") coincide con la anticipación configurada. Solo afecta turnos de 22:00 en adelante, que hoy no existen |
| P6 | El corrimiento puede hacer que un recordatorio en días salga después de uno en horas del mismo servicio (p. ej. turno 07:00: "1 día" → 09:00 del día anterior, "23 h" → 08:00) | Se acepta: salen los dos, en ese orden. Con momentos iguales sale solo el de menor anticipación |
| P7 | La frase se calcula al **encolar**. Si WhatsApp estuvo desconectado y el mensaje sale mucho después, puede quedar desactualizada | Se acepta (los recordatorios en días nunca se encolan de noche; los de horas se mandan en segundos con el bot conectado) |
| P8 | "Enviar recordatorio ahora" sobre un turno ya pasado: hoy encola igual | Se bloquea (`not_applicable`, "Solo se puede mandar a un turno confirmado que todavía no pasó."): con la frase relativa no tiene sentido |
| P9 | Si la profesional cambia **cuál** recordatorio pide confirmar después de que un turno ya recibió la confirmación, el nuevo no se manda (ni como recordatorio común) | Se acepta: un turno recibe como máximo un pedido de confirmación |
| P10 | `packages/db/prisma/seed.ts` y `.env.example` (`REMINDER_LEAD_HOURS`) siguen escribiendo una columna sin uso | No se tocan en esta HU; se limpian junto con la migración que borre `reminderLeadHours` |

## 14. Resoluciones del usuario (2026-10-02)

- **P1–P10:** se aceptan los defaults tal como están escritos en la sección 13.
