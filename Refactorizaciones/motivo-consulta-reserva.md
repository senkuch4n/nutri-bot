# SDD: HU-013 `motivo-consulta-reserva` (motivo de consulta al reservar)

HU validada: `docs/hu-motivo-consulta-reserva.md`. **Su sección "Resoluciones" (2026-10-02) manda:**
se aceptan D1–D12 según las recomendaciones del afinador. Cómo se aplica cada una:

| Duda | Resolución aplicada en esta SDD |
|---|---|
| D1 | Motivo **opcional** con salteo explícito (`saltear`, `salteo`, `omitir`, `no`, `-`, `ninguno`, `nada`, `prefiero no`, `paso`) |
| D2 | Paso nuevo `BOOK_REASON` **después de `BOOK_SLOT` y antes de `BOOK_CONFIRM`**. El turno se crea en un solo paso con el "sí", como hoy |
| D3 | Máx. **500** caracteres (si se pasa, se pide resumir: no se corta), mín. **3** letras/números. Audio, sticker, documento o foto sin epígrafe: se pide texto. Foto con epígrafe: el epígrafe es el motivo |
| D4 | Columna `Service.asksReason Boolean NOT NULL DEFAULT true`: **encendido en todos, incluidos los servicios existentes**. Switch en `/servicios` |
| D5 | Campo opcional en "Nuevo turno" del panel y edición desde el detalle del turno. No se notifica al paciente |
| D6 | El paciente no puede cambiarlo después. Se toma **el primer mensaje** como motivo |
| D7 | El motivo **va en la alerta de turno nuevo**, **recortado a 200 caracteres** con `…` + ` (completo en el panel)`, en los dos caminos (sin seña en `appointments.ts`, pago aprobado en `payments.ts`) |
| D8 | No se copia a las notas de la consulta: la consulta lo muestra **de solo lectura, leído del turno**. `isConsultationEmpty` no cambia |
| D9 | Se muestra en: detalle del turno, alerta, consulta clínica y tabla de turnos de la ficha. **No** en el bloque del calendario, **no** en Google Calendar (`gcal.ts`), **no** en la tool `mis_turnos` de la IA, **no** en el portal. Con tests que lo cubren |
| D10 | Turnos existentes con `reason = NULL`. Sin backfill |
| D11 | No se distingue "lo salteó" de "no se le pidió": en los dos casos `NULL` y "—" |
| D12 | Textos tal cual la sección "Diseño UX" de la HU (sin el agregado opcional "Solo lo ve la nutricionista.") |

Skills aplicados: `migracion-prisma` (sección 3) y `ui` (sección 7).

Rama: `feat/hu-013-motivo-consulta-reserva`, que sale de `develop` (`4fdc14d`, con la HU-012 mergeada).

> **Verificación del architect (2026-10-02, solo lectura).**
> - `git fetch`: `origin/develop` = `4fdc14d` = `HEAD` de la rama. Ninguna rama remota abierta
>   (`feat/components-front`, `feat/hu-010-*`, `feat/mp-bot`, `fix/hu-012-detalles`, `fix/sara2-only`)
>   toca `packages/db/prisma`, `messages.ts`, los `index.ts` de `core`/`domain`, `appointments.ts`,
>   `payments.ts`, `gcal.ts`, `/servicios`, `new-appointment-modal.tsx`, `appointment-detail-sheet.tsx`,
>   `(panel)/actions.ts` ni `pacientes/[id]/` fuera de `planes/**`.
> - **PR #8** (`fix/hu-012-detalles`, abierto) toca: `apps/bot/src/conversation.ts` (solo el cuerpo de
>   `handleQuestionText`, al final del archivo), `apps/bot/src/workers.ts` y `workers.test.ts` (cron
>   nuevo al final) y `packages/db/domain/botAi.ts`/`botAi.test.ts` (función nueva
>   `clearExpiredAiSessions` y sus tests). Esta HU **no toca** `workers.ts`, `workers.test.ts`,
>   `botAi.ts` ni `botAi.test.ts`, y en `conversation.ts` no toca `handleQuestionText` (ver 2.1).
> - `_prisma_migrations`: la última es `20261003001239_bot_ai_questions`, igual que la última carpeta
>   de `packages/db/prisma/migrations/`. No hay drift aparente.
> - `Professional`: 1 fila, `phoneJid` **nulo** en desarrollo (por eso el script inyecta el destino de
>   la alerta, ver 4.3). `Service`: 9 filas, 6 activas, **ninguna con seña**. `Appointment`: 18 filas.
>   `AvailabilityRule`: 17 (hay disponibilidad cargada: el script puede recorrer la reserva real).
>   `ConversationState`: 3 en `MENU`, 4 en `DORMANT`.
> - `Appointment.patient` **no** tiene `onDelete: Cascade`: el script borra sus turnos (y las consultas
>   de esos turnos) por id antes de borrar sus pacientes.
> - `getConsultation` (domain) ya incluye `appointment` con todos sus escalares: la consulta clínica
>   recibe `appointment.reason` sin cambiar `packages/db/domain/consultations.ts`.
> - `runBotAiTool("mis_turnos")` y `syncGoogleCalendar` arman su salida campo por campo (no esparcen
>   el turno): hoy **ya** no mandarían `reason`. No se tocan; se agregan tests que lo fijan.
> - El portal (`(portal)/portal/page.tsx`) es server component y solo renderiza fecha, servicio y
>   precio del próximo turno. No se toca.
> - `apps/bot/tsconfig.json` incluye solo `src/**` (los scripts no entran en `typecheck`).
>   `npm run test` (raíz) toma todos los `*.test.ts` del monorepo.

---

## 1. Resumen funcional

Cada turno puede tener un **motivo de consulta** (`Appointment.reason`, texto libre opcional de hasta
500 caracteres). Cuando un paciente reserva por WhatsApp un servicio que tiene "Pedir motivo al
reservar" prendido (todos por defecto), después de elegir el horario el bot le pide el motivo, con la
opción de escribir *saltear*. El texto se valida en `packages/core` (salteo, muy corto, muy largo) y
se guarda en el contexto de la conversación; el resumen de confirmación lo muestra en la línea
"📝 Motivo: …", y al responder "sí" el turno se crea **con** el motivo en un solo paso (con o sin
seña). La alerta de turno nuevo a la profesional suma el motivo recortado a 200 caracteres, tanto
cuando el turno queda confirmado en el momento como cuando Mercado Pago aprueba la seña. En el
paso del motivo, solo "menú" o una palabra de salida **como mensaje entero** son comandos; audios y
fotos sin epígrafe reciben un pedido de texto. Desde el panel, la profesional puede cargar el motivo
al crear un turno y verlo o editarlo en el detalle del turno; lo ve de solo lectura en la consulta
clínica de ese turno y en la tabla de turnos de la ficha. En `/servicios` prende o apaga el pedido
por servicio. El motivo no sale hacia Google Calendar, la IA del bot ni el portal.

---

## 2. Workspaces afectados

| Workspace | ¿Se toca? | Qué |
|---|---|---|
| `packages/core` | **Sí** | **Nuevo:** `booking-reason.ts` (límites, normalización, salteo, `parseBookingReason`, validación del panel, recorte para la alerta) y `booking-reason.test.ts`. **Nuevo:** `messages.test.ts` (regresión de `confirmBooking` y `professionalNewBookingAlert`). **Cambian:** `messages.ts` (`confirmBooking` y `professionalNewBookingAlert` suman un parámetro **opcional** `reason`; textos nuevos al final), `index.ts` (+1 línea) |
| `packages/db` | **Sí** | `schema.prisma` (+1 columna en `Appointment`, +1 en `Service`), **1 migración aditiva** `booking_reason`. `domain/appointments.ts`: `createAppointment` suma `reason` y `professionalAlertJid` (opcionales), función nueva `updateAppointmentReason`, error nuevo `InvalidBookingReasonError`. `domain/payments.ts`: 1 línea (pasa `reason` a la alerta). **Nuevos:** `domain/appointments.test.ts`, `domain/gcal-and-ai-privacy.test.ts`. **Cambia:** `domain/payments.test.ts` (casos nuevos al final). `domain/index.ts`: **sin cambios** (ya exporta `./appointments`) |
| `apps/bot` | **Sí** | `src/conversation.ts`: paso `BOOK_REASON`, `Ctx.reason`, `handleBookReason`, `sendBookingSummary`, `handleBookSlot`, `handleBookConfirm`, `handleIncomingMedia`. **Nuevo:** `scripts/test-booking-reason.ts`. `package.json`: script `test:booking-reason` |
| `apps/web` | **Sí** | `(panel)/actions.ts` (`createAppointmentAction` + `saveAppointmentReasonAction` nueva), `new-appointment-modal.tsx`, `appointment-detail-sheet.tsx`, `calendar-client.tsx` (1 línea), `api/appointments/route.ts` (1 línea), `servicios/{actions.ts, service-form.tsx, service-card.tsx, page.tsx}`, `lib/services.ts`, `pacientes/[id]/{page.tsx, appointments-section.tsx}`, **nuevo** `pacientes/[id]/appointment-reason-cell.tsx`, `pacientes/[id]/consultas/[consultationId]/page.tsx` |

Otros: `README.md` (una fila en la tabla de comandos).

**No se tocan:** `packages/db/domain/gcal.ts`, `packages/db/domain/botAi.ts`, `botAi.test.ts`,
`packages/core/src/bot-ai-tools.ts`, `packages/db/domain/consultations.ts`,
`packages/core/src/consultations.ts` (`isConsultationEmpty`), `apps/bot/src/workers.ts`,
`workers.test.ts`, `apps/bot/src/booking.ts`, `whatsapp.ts`, `index.ts`, el portal entero,
`apps/web/src/lib/assistant-tools.ts` (`/asistente`), seeds.

### 2.1 Convivencia con el otro desarrollador y con el PR #8: puntos de posible conflicto

**No tocar** (PRs abiertos de la otra persona): `apps/web/src/app/(panel)/alimentos/**`,
`apps/web/src/app/(panel)/pacientes/[id]/planes/**`, `apps/web/src/app/(panel)/plantillas/**`,
`apps/web/src/components/food-picker.tsx`, `packages/core/src/ai-food-catalog.ts`.

| Archivo compartido | Cambio de esta HU | Riesgo |
|---|---|---|
| `apps/bot/src/conversation.ts` | **PR #8 cambia `handleQuestionText`** (try/catch, al final del archivo). Esta HU cambia: el import de `@nutri-bot/core` (+1 nombre), el comentario de `ConversationOptions.alertJid`, `STEP` (+1), `Ctx` (+1 campo), un bloque nuevo en `handleIncoming` **entre el bloque `AWAIT_QUESTION` y `if (isExitWord(text))`**, la línea `case STEP.BOOK_CONFIRM` del `switch`, `handleBookSlot`, dos funciones nuevas **inmediatamente después de `handleBookSlot`**, `handleBookConfirm` y `handleIncomingMedia`. **Prohibido** tocar `handleQuestionText`, `handoffFromQuestion`, `handleInquiryText` o mover funciones de lugar | **Medio**: mismo archivo, hunks separados. Si el PR #8 se mergea antes, `git merge develop` en la rama y resolver (no debería haber solapamiento de líneas) |
| `apps/bot/src/workers.ts`, `workers.test.ts` | **Ninguno** (PR #8 agrega un cron al final) | Nulo |
| `packages/db/domain/botAi.ts`, `botAi.test.ts` | **Ninguno** (PR #8 agrega `clearExpiredAiSessions`). El test de privacidad de `mis_turnos` va en un archivo nuevo | Nulo |
| `packages/db/prisma/schema.prisma` | +1 línea en `Appointment` (después de `cancelReason`), +1 en `Service` (después de `prepLeadHours`) | **Alto si otra rama migra a la vez.** Antes de crear la migración: `git fetch` y confirmar que `origin/develop` no trae carpetas nuevas en `prisma/migrations/`. Si las trae, **parar** y avisar |
| `packages/core/src/messages.ts` | 2 funciones existentes con parámetro **opcional** nuevo (sin él, el texto es idéntico al de hoy); textos nuevos **al final** | Bajo |
| `packages/core/src/index.ts` | +1 línea al final | Bajo |
| `packages/db/domain/appointments.ts`, `payments.ts`, `payments.test.ts` | Aditivo | Bajo |
| `apps/web/src/app/(panel)/pacientes/[id]/page.tsx` | +1 propiedad en el `map` de la pestaña Turnos | Bajo (la otra persona trabaja en `planes/**`, no en este archivo) |

---

## 3. Esquema (Prisma) y migración: skill `migracion-prisma`

### 3.1 Cambios en `packages/db/prisma/schema.prisma`

En `model Appointment`, inmediatamente después de `cancelReason    String?`:

```prisma
  /// HU-013: motivo de consulta que escribió el paciente al reservar por el bot, o la profesional
  /// en el panel. trim, máx. 500 caracteres (validado en packages/core). null = sin motivo (no se
  /// pidió, lo salteó o turno anterior a la HU-013; D11). No va a Google Calendar, a la IA ni al portal (D9).
  reason          String?
```

En `model Service`, inmediatamente después de `prepLeadHours Int?`:

```prisma
  /// HU-013 (D4): el bot pide el motivo de consulta al reservar este servicio. Prendido por defecto.
  asksReason   Boolean       @default(true)
```

No hay cambios en relaciones, índices ni enums.

### 3.2 Migración

- Nombre: `booking_reason`.
- Antes: `git fetch && git log --oneline HEAD..origin/develop -- packages/db/prisma/migrations` tiene
  que salir vacío. Si no, **parar**: traer `develop` primero y avisar.
- Crear sin aplicar, desde `packages/db`:
  `npx dotenv -e ../../.env -- prisma migrate dev --create-only --name booking_reason`
- **SQL esperado** (el orden de las sentencias puede variar):

```sql
-- AlterTable
ALTER TABLE "Appointment" ADD COLUMN     "reason" TEXT;

-- AlterTable
ALTER TABLE "Service" ADD COLUMN     "asksReason" BOOLEAN NOT NULL DEFAULT true;
```

- Revisión obligatoria del SQL antes de aplicar:
  - `asksReason` es `NOT NULL` **con `DEFAULT true`** en la **misma sentencia** (`Service` tiene 9
    filas; las existentes quedan en `true`, que es la resolución de D4). Si falta el `DEFAULT` o dice
    `false`, parar: el schema está mal.
  - `reason` es `TEXT` nullable, sin default (D10: los turnos existentes quedan en `NULL`).
  - **Ningún** `DROP`, `ALTER COLUMN ... TYPE`, `RENAME` ni sentencias sobre otras tablas. Si
    aparecen, parar.
  - Si `migrate dev --create-only` informa drift u ofrece reset: **parar**, no aceptar, y reportar
    `blocked` con la salida de `npx dotenv -e ../../.env -- prisma migrate status`.
- Aplicar: `npm run db:migrate` (raíz), después `npm run db:generate`.
- Producción: `prisma migrate deploy`. Aditiva, con default, sin backfill. Con el deploy **todos los
  servicios piden motivo** (D4) apenas se reinicia el bot con el código nuevo.

### 3.3 Respaldo (antes de aplicar)

```bash
mkdir -p ~/nutribot-backups
docker compose exec -T db pg_dump -U nutri -d nutribot -Fc > ~/nutribot-backups/pre-hu013-$(date +%Y%m%d-%H%M).dump
ls -lh ~/nutribot-backups/   # que el archivo no pese 0 bytes
```

### 3.4 Prohibido (skill)

`prisma migrate reset`, aceptar el reset que ofrece `migrate dev`, `prisma db push`, pasar
`DATABASE_URL` como `--shadow-database-url`, `prisma migrate diff --from-migrations` contra la base de
desarrollo, y editar una migración ya aplicada (incluidas las de la HU-011 y la HU-012).

---

## 4. Contrato compartido

### 4.1 `packages/core/src/booking-reason.ts` (nuevo, puro). Lo consumen bot, web y `packages/db`

```ts
import { normalize } from "./wake";

/** D3: largo máximo del motivo (String.prototype.length, después de normalizar). Bot y panel. */
export const BOOKING_REASON_MAX = 500;
/** D3: mínimo de letras o números (\p{L}\p{N}) para que el bot lo tome como motivo. Solo bot. */
export const BOOKING_REASON_MIN_ALNUM = 3;
/** D7: largo del motivo dentro de la alerta de turno nuevo. */
export const BOOKING_REASON_ALERT_MAX = 200;

/**
 * D1: palabras de salteo. Se comparan contra el mensaje ENTERO normalizado "como comando"
 * (sin acentos, minúsculas, sin signos ni emojis, espacios colapsados).
 */
export const BOOKING_REASON_SKIP_WORDS: readonly string[] = [
  "saltear", "salteo", "omitir", "no", "ninguno", "nada", "prefiero no", "paso",
];

/**
 * Normaliza un motivo para guardarlo: "\r\n" → "\n"; colapsa 3+ saltos de línea seguidos a 2;
 * trim. Si queda "" → null. NO recorta el largo (eso lo decide quien llama).
 */
export function normalizeBookingReason(text: string | null | undefined): string | null;

/**
 * true si el mensaje entero es un salteo:
 * - su forma "de comando" (normalize de wake.ts + quitar [^\p{L}\p{N}\s] + colapsar espacios + trim)
 *   está en BOOKING_REASON_SKIP_WORDS ("Saltear." → "saltear"; "No!" → "no"; "Prefiero no" → "prefiero no"); o
 * - el mensaje (trim) está formado solo por guiones (-, –, —) y espacios, con al menos un guion
 *   ("-", " - ", "--", "—").
 * "no quiero dieta estricta" → false. "." / "?" / "👍" → false.
 */
export function isBookingReasonSkip(text: string): boolean;

export type BookingReasonParse =
  | { kind: "ok"; reason: string }
  | { kind: "skip" }
  | { kind: "tooShort" }
  | { kind: "tooLong"; length: number };

/**
 * Bot (paso BOOK_REASON). Orden de evaluación:
 * 1. isBookingReasonSkip(text) → { kind: "skip" }
 * 2. r = normalizeBookingReason(text); r === null → { kind: "tooShort" }
 * 3. r.length > BOOKING_REASON_MAX → { kind: "tooLong", length: r.length }
 * 4. cantidad de caracteres \p{L}|\p{N} de r < BOOKING_REASON_MIN_ALNUM → { kind: "tooShort" }
 *    ("ok", "1", "a b", "👍", "?" son tooShort; "abc" es ok)
 * 5. { kind: "ok", reason: r }
 */
export function parseBookingReason(text: string): BookingReasonParse;

/**
 * Panel (crear y editar). Sin mínimo (lo escribe la profesional). undefined/null/""/solo espacios
 * → { ok: true, reason: null }. Más de BOOKING_REASON_MAX después de normalizar →
 * { ok: false, error: "El motivo puede tener hasta 500 caracteres (tenés {n})." } con n = largo normalizado.
 */
export function validateBookingReasonInput(
  raw: string | null | undefined,
): { ok: true; reason: string | null } | { ok: false; error: string };

/**
 * D7: motivo para la alerta. Si Array.from(reason).length <= BOOKING_REASON_ALERT_MAX → reason tal
 * cual. Si no: Array.from(reason).slice(0, 200).join("").trimEnd() + "… (completo en el panel)".
 * (Array.from para no partir un emoji a la mitad.)
 */
export function reasonForAlert(reason: string): string;
```

`packages/core/src/index.ts`: agregar al final `export * from "./booking-reason";`.

### 4.2 `packages/core/src/messages.ts`

**Cambian (parámetro opcional; sin `reason` el texto es byte a byte el de hoy):**

```ts
import { reasonForAlert } from "./booking-reason";   // import nuevo arriba

/** HU-013: línea del motivo (resumen al paciente y alerta). */
export function bookingReasonLine(reason: string): string {
  return `📝 Motivo: ${reason}`;
}

export function confirmBooking(params: {
  serviceName: string;
  startsAt: Date;
  price: number | string;
  tz: string;
  currency: string;
  /** HU-013: motivo ya normalizado. null/undefined/"" → sin línea (texto idéntico al de antes). */
  reason?: string | null;
}): string;
// Con motivo, la línea va inmediatamente después de "💲 …", antes de la línea en blanco:
// `Confirmás este turno?\n\n📋 *${serviceName}*\n🗓️ ${fecha} hs\n💲 ${precio}\n📝 Motivo: ${reason}\n\nRespondé *sí* para confirmar o *no* para cancelar.`

export function professionalNewBookingAlert(params: {
  patientName?: string | null;
  patientPhone: string;
  serviceName: string;
  startsAt: Date;
  tz: string;
  /** HU-013 (D7): null/undefined/"" → texto idéntico al de antes. */
  reason?: string | null;
}): string;
// Con motivo: `${textoDeHoy}\n${bookingReasonLine(reasonForAlert(reason))}`
```

`bookingReasonLine` se declara junto a `confirmBooking` (antes de usarla). Los textos nuevos van **al
final del archivo** (sección 6).

### 4.3 `packages/db/domain/appointments.ts`

```ts
import { isConsultationEmpty, messages, validateBookingReasonInput } from "@nutri-bot/core";

/** HU-013: motivo inválido (más de 500 caracteres). `message` es el texto para el panel. */
export class InvalidBookingReasonError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidBookingReasonError";
  }
}

export async function createAppointment(params: {
  patientId: string;
  serviceId: string;
  startsAt: Date;
  createdBy: Actor;
  notifyPatient?: boolean;
  /** HU-013: motivo de consulta. Se normaliza con validateBookingReasonInput; "" → null.
   *  Si supera 500 → InvalidBookingReasonError ANTES de leer o escribir nada. */
  reason?: string | null;
  /** HU-013, SOLO pruebas: destino de la alerta de turno nuevo. undefined = Professional.phoneJid
   *  (como hoy); null = sin alerta. El bot pasa `opts.alertJid` (undefined en producción). */
  professionalAlertJid?: string | null;
});
```

Cambios dentro de `createAppointment`:

1. Primera línea: `const r = validateBookingReasonInput(params.reason); if (!r.ok) throw new InvalidBookingReasonError(r.error);`
2. `tx.appointment.create({ data: { ...lo de hoy, reason: r.reason } })`. **`needsGoogleSync: true` queda como está.**
3. La alerta: `const alertJid = params.professionalAlertJid !== undefined ? params.professionalAlertJid : pro.phoneJid;`
   y la condición pasa a `!awaitingPayment && params.createdBy === "PATIENT" && alertJid`, con
   `toJid: alertJid` y `body: messages.professionalNewBookingAlert({ ...lo de hoy, reason: appointment.reason })`.
4. La confirmación al paciente (`bookingConfirmed`) **no cambia** (el motivo no se repite al paciente).

Función nueva (la consume **solo web**, va en `domain` para tener un único lugar con la validación y
testearla con prisma mockeado):

```ts
/**
 * HU-013 (D5): la profesional edita el motivo desde el detalle del turno. Cualquier estado.
 * Valida y normaliza con validateBookingReasonInput (inválido → InvalidBookingReasonError sin
 * escribir). Actualiza SOLO `reason`: no toca `needsGoogleSync` (el motivo no va a Google), no
 * encola mensajes, no toca la consulta.
 */
export async function updateAppointmentReason(params: {
  id: string;
  reason: string | null;
}): Promise<{ id: string; patientId: string; reason: string | null }>;
// prisma.appointment.update({ where: { id }, data: { reason }, select: { id: true, patientId: true, reason: true } })
```

`setAppointmentStatus` y `cancelAppointment`: **sin cambios**.

### 4.4 `packages/db/domain/payments.ts`

En `syncMercadoPagoPayment`, en el `createMany` de la alerta `PROFESSIONAL_ALERT`, agregar
`reason: appointment.reason,` a los parámetros de `messages.professionalNewBookingAlert`. El
`include` ya trae los escalares del turno. Nada más cambia (la confirmación al paciente sigue igual).

### 4.5 Privacidad (D9): qué **no** se toca y queda fijado por tests

| Destino | Estado | Cómo se asegura |
|---|---|---|
| Google Calendar (`gcal.ts`) | `summary`/`description` se arman campo por campo; no usan `reason` | Test nuevo (10.3): el `requestBody` de `events.insert` y `events.patch` no contiene el motivo. `updateAppointmentReason` no prende `needsGoogleSync` (test 10.2) |
| IA del bot, tool `mis_turnos` (`botAi.ts` → `appointmentsForAi`) | Mapea `serviceName`, `startsAt`, `status` | Test nuevo (10.3) con un turno mockeado con motivo: `content` no lo contiene |
| Portal | Renderiza fecha, servicio y precio | No se toca. Restricción 12: no agregar `reason` a nada de `(portal)` |
| `/asistente` del panel (`lib/assistant-tools.ts`) | Mapea campos explícitos | No se toca (fuera de alcance) |
| Bloque del calendario | `title` = paciente · servicio | No se toca el `title`; `reason` solo viaja en `extendedProps` para el panel lateral |

### 4.6 `apps/bot/src/conversation.ts` (firmas que cambian o aparecen)

```ts
const STEP = { ...los de hoy, /** HU-013: esperando el motivo de consulta (texto libre). */ BOOK_REASON: "BOOK_REASON" } as const;

type Ctx = { ...los de hoy, /** HU-013: motivo aceptado (parseBookingReason "ok"), entre BOOK_REASON y el "sí". */ reason?: string };

// ConversationOptions.alertJid: solo cambia el comentario →
/** SOLO pruebas: reemplaza Professional.phoneJid como destino de las alertas (opción 0 y, desde la
 *  HU-013, turno nuevo) (null = sin alertas). */

/** Nueva. Paso del motivo (D1–D3). */
async function handleBookReason(jid: string, text: string, ctx: Ctx, send: Send, menuText: string): Promise<void>;

/** Nueva. Resumen de confirmación (lo usan handleBookSlot y handleBookReason). */
async function sendBookingSummary(
  jid: string,
  b: { serviceId: string; startsAt: string; reason?: string },
  send: Send,
): Promise<void>;

/** Cambia: suma `opts` al final. */
async function handleBookConfirm(
  jid: string, text: string, ctx: Ctx, patientId: string, send: Send, menuText: string,
  opts: ConversationOptions,
): Promise<void>;
```

Detalle de la lógica en 6.1.

---

## 5. Rutas, server actions y API (apps/web)

No hay rutas nuevas.

### 5.1 `apps/web/src/app/(panel)/actions.ts`

`createAppointmentAction` (cambia):

- `createSchema` suma `reason: z.string().max(5000).optional()` (tope grueso contra payloads
  enormes; la regla real es la de core).
- Después del `safeParse`: `const r = validateBookingReasonInput(parsed.data.reason); if (!r.ok) return { ok: false, error: r.error };`
- `createAppointment({ ...lo de hoy, reason: r.reason })`.
- En el `catch`: `InvalidBookingReasonError` → `{ ok: false, error: err.message }` (antes del genérico).
- La confirmación al paciente no cambia (createdBy `PROFESSIONAL` sigue sin alerta a la profesional).

Nueva, al final del archivo:

```ts
/** HU-013 (D5): editar el motivo desde el detalle del turno. No avisa al paciente. */
export async function saveAppointmentReasonAction(
  id: string,
  reason: string,
): Promise<ActionResult & { reason?: string | null }>;
```

- `z.object({ id: z.string().min(1), reason: z.string().max(5000) })`; inválido → `{ ok: false, error: "No se pudo guardar el motivo." }`.
- `validateBookingReasonInput(reason)`; `!ok` → `{ ok: false, error }`.
- `updateAppointmentReason({ id, reason: r.reason })`; cualquier error → `{ ok: false, error: "No se pudo guardar el motivo." }`.
- `revalidatePath("/")` y `revalidatePath(`/pacientes/${updated.patientId}`, "layout")` (cubre la
  ficha y la consulta clínica).
- Devuelve `{ ok: true, reason: updated.reason }`.

`apps/web/src/lib/appointments.ts` (re-exporta el dominio): agregar `updateAppointmentReason` e
`InvalidBookingReasonError` a la lista de exports.

### 5.2 `apps/web/src/app/api/appointments/route.ts`

En `extendedProps` agregar `reason: a.reason,` (después de `patientId`). El `title` del evento **no
cambia** (D9: el bloque del calendario no muestra el motivo).

### 5.3 `apps/web/src/app/(panel)/servicios/actions.ts` y `apps/web/src/lib/services.ts`

- `schema` suma `asksReason: z.enum(["0", "1"]).optional()`. **No usar `z.coerce.boolean()`**: con
  `"0"`/`"false"` da `true`.
- En el payload: `asksReason: asksReason !== "0"` (ausente → `true`, que es el default de D4).
- `lib/services.ts`: `createService` y `updateService` aceptan `asksReason: boolean` en `data`
  (interfaz nueva `ReasonFields { asksReason: boolean }` sumada a los tipos de `data`, igual que
  `PrepFields`).

---

## 6. Mensajes del bot (textos exactos)

Nuevos, **al final** de `packages/core/src/messages.ts` (bajo `// --- HU-013: motivo de consulta al reservar ---`):

```ts
export const ASK_BOOKING_REASON = `Contame en pocas palabras el *motivo de la consulta* 📝
(por ejemplo: bajar de peso, control, alimentación deportiva, un estudio que te pidieron).

Así la nutricionista puede preparar tu turno. Si preferís no decirlo ahora, escribí *saltear*.`;

export const BOOKING_REASON_TOO_SHORT = `No llegué a entenderlo 🙈. Contame el motivo en unas palabras, o escribí *saltear* si preferís no decirlo.`;

export const BOOKING_REASON_TOO_LONG = `¡Gracias por el detalle! Es un poco largo para guardarlo 😅. ¿Me lo resumís en un mensaje más corto? Lo demás se lo podés contar a la nutricionista en la consulta.`;

export const BOOKING_REASON_TEXT_ONLY = `Por ahora solo puedo guardar texto. ¿Me lo escribís? 🙏 Si preferís no decirlo, escribí *saltear*.`;
```

Cambian (sección 4.2): `confirmBooking` (línea `📝 Motivo: …` solo si hay motivo) y
`professionalNewBookingAlert` (segunda línea `📝 Motivo: …` recortada a 200 solo si hay motivo).
Ejemplos:

```
Confirmás este turno?

📋 *Primera consulta*
🗓️ lunes 12 de octubre, 10:00 hs
💲 $25.000
📝 Motivo: Quiero bajar de peso, tengo hipotiroidismo

Respondé *sí* para confirmar o *no* para cancelar.
```

```
🔔 Ana Pérez sacó un turno de Primera consulta para el lunes 12 de octubre, 10:00 hs.
📝 Motivo: Quiero bajar de peso, tengo hipotiroidismo
```

**No cambian:** `bookingConfirmed`, `depositRequired`, `depositExpired`, `SLOT_TAKEN`, el "Sin
problema, no reservé nada…" de `handleBookConfirm`, recordatorios, confirmación de asistencia,
recomendaciones previas, `DORMANT_BYE`, menús.

### 6.1 Máquina de estados (cambios en `conversation.ts`)

```
MENU --1--> BOOK_SERVICE --n--> BOOK_DAY --n--> BOOK_SLOT --n-->
   ├─ service.asksReason = false ─────────────────────────────> BOOK_CONFIRM (como hoy)
   └─ service.asksReason = true ──> BOOK_REASON
          ├─ "salir"/"chau"/… (mensaje entero, isExitCommand) ──> DORMANT  + DORMANT_BYE
          ├─ "menú" (mensaje entero, isMenuCommand) ───────────> MENU     + menuText
          ├─ skip ───────────────────────────────────────────────> BOOK_CONFIRM (resumen sin motivo)
          ├─ ok ─────────────────────────────────────────────────> BOOK_CONFIRM (resumen con motivo, ctx.reason)
          ├─ tooShort ──> BOOK_REASON + BOOKING_REASON_TOO_SHORT
          ├─ tooLong ───> BOOK_REASON + BOOKING_REASON_TOO_LONG
          └─ medio sin texto (handleIncomingMedia) ──> BOOK_REASON + BOOKING_REASON_TEXT_ONLY
BOOK_CONFIRM --sí--> createAppointment({ ..., reason: ctx.reason ?? null, professionalAlertJid: opts.alertJid }) → MENU
BOOK_CONFIRM --no--> "Sin problema, no reservé nada…" → MENU (ctx vacío: el motivo se descarta)
```

1. **`handleIncoming`**: bloque nuevo **después del bloque `if (step === STEP.AWAIT_QUESTION) {…}` y
   antes de `if (isExitWord(text))`** (así "chau harinas" o "menú para la semana" son motivo, no
   comandos; mismo patrón que `AWAIT_INQUIRY`):

   ```ts
   // HU-013: paso del motivo. Texto libre: solo comandos estrictos (mensaje entero).
   if (step === STEP.BOOK_REASON) {
     if (isExitCommand(text)) {
       await save(jid, STEP.DORMANT);
       await send(messages.DORMANT_BYE);
       return;
     }
     if (isMenuCommand(text)) {
       await save(jid, STEP.MENU);
       await send(menuText);
       return;
     }
     return handleBookReason(jid, text, ctx, send, menuText);
   }
   ```

   El chequeo de timeout de sesión (arriba) no cambia: después de 20 min sin actividad en
   `BOOK_REASON`, el paso se trata como `DORMANT` y un mensaje sin palabra clave no recibe respuesta.
   El `switch` **no** suma un `case` para `BOOK_REASON` (nunca se llega). La línea del
   `case STEP.BOOK_CONFIRM` pasa a `return handleBookConfirm(jid, text, ctx, patient.id, send, menuText, opts);`.

2. **`handleBookSlot`**: después de resolver `startsAt` y leer el servicio:
   - `service.asksReason === true` → `await save(jid, STEP.BOOK_REASON, { serviceId: ctx.serviceId, startsAt }); await send(messages.ASK_BOOKING_REASON); return;`
   - si no → `return sendBookingSummary(jid, { serviceId: ctx.serviceId, startsAt }, send);`

   (Leer solo el servicio; `getProfessional()` pasa a `sendBookingSummary`.)

3. **`sendBookingSummary`** (nueva, inmediatamente después de `handleBookSlot`): lee `service` y
   `pro` en paralelo (como hoy `handleBookSlot`), `save(jid, STEP.BOOK_CONFIRM, { serviceId, startsAt, ...(b.reason ? { reason: b.reason } : {}) })`
   y manda `messages.confirmBooking({ serviceName, startsAt: new Date(startsAt), price: service.price.toString(), tz: pro.timezone, currency: pro.currency, reason: b.reason ?? null })`.

4. **`handleBookReason`** (nueva, inmediatamente después de `sendBookingSummary`):
   - `!ctx.serviceId || !ctx.startsAt` → `save(jid, STEP.MENU)` + `send(menuText)`.
   - `const r = parseBookingReason(text)`:
     - `skip` → `sendBookingSummary(jid, { serviceId, startsAt }, send)`;
     - `ok` → `sendBookingSummary(jid, { serviceId, startsAt, reason: r.reason }, send)`;
     - `tooShort` → `save(jid, STEP.BOOK_REASON, { serviceId, startsAt })` (renueva la sesión) + `send(messages.BOOKING_REASON_TOO_SHORT)`;
     - `tooLong` → ídem con `messages.BOOKING_REASON_TOO_LONG`. **No** se guarda nada del texto.
   - Un dígito suelto ("1") cae en `tooShort` (D-UX). "sí"/"si" también (2 letras).

5. **`handleBookConfirm`**: en la llamada a `createAppointment` agregar
   `reason: ctx.reason ?? null, professionalAlertJid: opts.alertJid,`. Todo lo demás igual (incluido
   `SLOT_TAKEN` si el horario se ocupó mientras escribía el motivo, y el `save(jid, STEP.MENU)` final
   que vacía el contexto).

6. **`handleIncomingMedia`**: el filtro de pasos suma `STEP.BOOK_REASON`, y la respuesta pasa a
   ```ts
   await send(
     row.step === STEP.AWAIT_QUESTION
       ? messages.AI_TEXT_ONLY
       : row.step === STEP.BOOK_REASON
         ? messages.BOOKING_REASON_TEXT_ONLY
         : messages.INQUIRY_TEXT_ONLY,
   );
   ```
   El resto (sesión vencida → silencio, `save` que renueva) igual. Una foto **con** epígrafe ya llega
   como texto por `extractText` de `whatsapp.ts` (sin cambios): se toma el epígrafe como motivo.

7. Imports nuevos de `@nutri-bot/core`: `parseBookingReason`. (Los de `messages` ya están.)

**Regresión que no puede cambiar:** regla de silencio en `DORMANT`, opción 0 / `AWAIT_INQUIRY`
(HU-011), opción 5 / `AWAIT_QUESTION` (HU-012), seña (HU-009: `AWAITING_PAYMENT` + `depositRequired`
+ alerta recién con el pago aprobado), recomendaciones previas (`prepInstructions`, cron intacto).

---

## 7. UI (skill `ui`): pantallas concretas

Componentes del repo: `Field`, `Textarea`, `Button`, `FormError`, `Badge`, `Card` de
`@/components/ui`; `Switch` y `Label` de `@/components/primitives/*`; `notify` de `@/lib/notify`.
Íconos `lucide-react`. Sin dependencias nuevas.

### 7.1 "Nuevo turno" (`(panel)/new-appointment-modal.tsx`)

- Estado nuevo `const [reason, setReason] = useState("")`.
- Debajo del bloque "Horario" y antes de `<FormError>`:

  ```tsx
  <Field label="Motivo de consulta (opcional)">
    <Textarea
      name="reason"
      rows={3}
      maxLength={BOOKING_REASON_MAX}
      value={reason}
      onChange={(e) => setReason(e.target.value)}
      placeholder="Ej: control mensual, quiere bajar de peso, plan deportivo…"
      aria-describedby="nuevo-turno-motivo-ayuda"
    />
  </Field>
  <div id="nuevo-turno-motivo-ayuda" className="-mt-2 flex justify-between gap-2 text-xs text-muted-foreground">
    <span>No se le manda al paciente.</span>
    <span className="tabular-nums" aria-live="polite">{reason.length}/{BOOKING_REASON_MAX}</span>
  </div>
  ```

- `submit`: `fd.set("reason", reason)`. En éxito, `setReason("")` junto con los otros resets.
- Errores: los devuelve la action (`FormError` existente). La descripción del modal ("El paciente
  recibe la confirmación por WhatsApp.") no cambia.
- Se muestra para cualquier servicio (aunque tenga `asksReason` apagado).

### 7.2 Detalle del turno (`(panel)/appointment-detail-sheet.tsx`)

- `SelectedAppointment` suma `reason: string | null;` (comentario `/** HU-013: motivo de consulta. */`).
- `calendar-client.tsx` (`onEventClick`): `reason: p.reason ?? null,`.
- En `AppointmentBody`, estado nuevo: `editingReason` (bool), `reasonDraft` (string, inicial
  `appt.reason ?? ""`), `reasonError` (string | null) y `const [savingReason, startSavingReason] = useTransition();`.
- En la `<dl>`, después de "Precio":

  ```tsx
  <dt className="text-muted-foreground">Motivo</dt>
  <dd>
    {editingReason ? (
      <form onSubmit={submitReason} className="space-y-2">
        <label htmlFor={`motivo-${appt.id}`} className="sr-only">Motivo de consulta</label>
        <Textarea id={`motivo-${appt.id}`} rows={4} maxLength={BOOKING_REASON_MAX} autoFocus
          value={reasonDraft} onChange={(e) => setReasonDraft(e.target.value)}
          aria-describedby={`motivo-${appt.id}-contador`} />
        <p id={`motivo-${appt.id}-contador`} className="text-right text-xs tabular-nums text-muted-foreground" aria-live="polite">
          {reasonDraft.length}/{BOOKING_REASON_MAX}
        </p>
        <FormError message={reasonError} />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" size="sm" disabled={savingReason} onClick={cancelReasonEdit}>Cancelar</Button>
          <Button type="submit" size="sm" loading={savingReason}>{savingReason ? "Guardando…" : "Guardar"}</Button>
        </div>
      </form>
    ) : (
      <div className="flex items-start gap-1">
        <p className={cn("min-w-0 flex-1 whitespace-pre-wrap break-words", appt.reason ? "font-medium" : "text-muted-foreground")}>
          {appt.reason ?? "—"}
        </p>
        <Button type="button" variant="ghost" size="icon" className="-my-2 h-8 w-8 shrink-0"
          aria-label="Editar motivo" disabled={disabled} onClick={() => { setReasonDraft(appt.reason ?? ""); setReasonError(null); setEditingReason(true); }}>
          <Pencil aria-hidden />
        </Button>
      </div>
    )}
  </dd>
  ```

- `submitReason` (patrón de `ajustes/after-hours-form.tsx`: `onSubmit` + `preventDefault` +
  `startTransition`, **sin** `<form action>` y **sin** `await confirm()` adentro):

  ```ts
  function submitReason(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setReasonError(null);
    startSavingReason(async () => {
      const res = await saveAppointmentReasonAction(appt.id, reasonDraft);
      if (res.ok) {
        notify.saved("Motivo guardado");
        setEditingReason(false);
        onUpdated({ ...appt, reason: res.reason ?? null });
        onChanged();
      } else {
        setReasonError(res.error ?? "No se pudo guardar el motivo.");
      }
    });
  }
  ```

  Con error, lo tipeado **queda** en el `Textarea`. `cancelReasonEdit` vuelve el borrador a
  `appt.reason ?? ""`, limpia el error y cierra la edición.
- `disabled` de los botones de acciones pasa a `busy !== null || savingReason`. El sheet **no** se
  cierra al guardar.
- Editable en `CONFIRMED`, `COMPLETED` y `NO_SHOW` (todos los que muestra el panel).
- `cn` se importa de `@/components/ui`; `Pencil` de `lucide-react`; `BOOKING_REASON_MAX` de
  `@nutri-bot/core`.

### 7.3 Consulta clínica (`pacientes/[id]/consultas/[consultationId]/page.tsx`)

En la columna derecha, **inmediatamente antes** de `<ConsultationNotes …/>`:

```tsx
{appointment?.reason ? (
  <Card title="Motivo indicado al reservar" description="Se edita desde el turno en el calendario.">
    <p className="whitespace-pre-wrap break-words text-sm">{appointment.reason}</p>
  </Card>
) : null}
```

Sin motivo (o consulta sin turno) no se muestra nada. No se toca `ConsultationNotes` ni la
lógica de "consulta vacía".

### 7.4 Ficha del paciente → Turnos (`pacientes/[id]/appointments-section.tsx`)

- `AppointmentRow` suma `/** HU-013: motivo de consulta; null → "—". */ reason: string | null;`.
- `page.tsx` (ficha): en el `map` de la pestaña `turnos`, `reason: a.reason,` (el `include` actual ya
  trae los escalares).
- Columna nueva `<TableHead>Motivo</TableHead>` **entre "Servicio" y "Precio"**; celda
  `<TableCell><AppointmentReasonCell reason={a.reason} /></TableCell>`.
- **Nuevo** `pacientes/[id]/appointment-reason-cell.tsx` (`"use client"`), para que se pueda ver
  completo al pasar el mouse (`title`) y al tocar (expande):

  ```tsx
  export function AppointmentReasonCell({ reason }: { reason: string | null }) {
    const [open, setOpen] = useState(false);
    if (!reason) return <span className="text-muted-foreground">—</span>;
    return (
      <button type="button" title={reason} aria-expanded={open} onClick={() => setOpen((o) => !o)}
        className={cn("block max-w-[16rem] rounded-sm text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          open ? "whitespace-pre-wrap break-words" : "truncate")}>
        <span className="sr-only">{open ? "Contraer motivo: " : "Ver motivo completo: "}</span>
        {reason}
      </button>
    );
  }
  ```

  `AppointmentsSection` sigue siendo server component.

### 7.5 `/servicios`

- `service-form.tsx`: `EditableService` suma `asksReason: boolean;`. Estado
  `const [asksReason, setAsksReason] = useState(editing?.asksReason ?? true);`. Bloque nuevo **después
  del bloque de recomendaciones y antes de "Servicio activo"**:

  ```tsx
  <div className="flex items-start justify-between gap-6 border-t pt-4 sm:col-span-2">
    <div>
      <Label htmlFor={`pide-motivo-${editing?.id ?? "nuevo"}`} className="text-sm font-medium">Pedir motivo al reservar</Label>
      <p id={`pide-motivo-${editing?.id ?? "nuevo"}-desc`} className="mt-1 text-sm text-muted-foreground">
        El bot le pide al paciente que cuente el motivo antes de confirmar el turno.
      </p>
    </div>
    <Switch id={`pide-motivo-${editing?.id ?? "nuevo"}`} checked={asksReason} onCheckedChange={setAsksReason}
      aria-describedby={`pide-motivo-${editing?.id ?? "nuevo"}-desc`} />
    <input type="hidden" name="asksReason" value={asksReason ? "1" : "0"} />
  </div>
  ```

  En el `useEffect` de éxito, si `!editing` además de `formRef.current?.reset()` hacer
  `setAsksReason(true)` (el `reset()` no toca estado controlado). El form sigue con `<form action>`
  (no se cambia el patrón existente de este archivo).
- `service-card.tsx`: la condición del contenedor de badges pasa a
  `service.requiresDeposit || service.prepInstructions || service.asksReason`, y se agrega
  `{service.asksReason ? <Badge tone="neutral">Pide motivo</Badge> : null}` **después** de "Manda
  recomendaciones previas".
- `servicios/page.tsx`: en el mapeo a `EditableService`, `asksReason: s.asksReason,`.
- `new-service-button.tsx`: sin cambios (usa `ServiceForm` sin `editing`).

### 7.6 Lo que **no** cambia en la UI

Bloque del evento en el calendario, `/avisos` (muestra la alerta con el motivo recortado porque es el
texto real del mensaje), portal, `/asistente`.

---

## 8. Archivos

**Nuevos**

- `packages/core/src/booking-reason.ts`, `booking-reason.test.ts`, `messages.test.ts`
- `packages/db/prisma/migrations/<timestamp>_booking_reason/migration.sql` (generado)
- `packages/db/domain/appointments.test.ts`, `gcal-and-ai-privacy.test.ts`
- `apps/bot/scripts/test-booking-reason.ts`
- `apps/web/src/app/(panel)/pacientes/[id]/appointment-reason-cell.tsx`

**Modificados**

- `packages/core/src/messages.ts`, `index.ts` (+1 línea)
- `packages/db/prisma/schema.prisma`, `packages/db/domain/appointments.ts`, `payments.ts`, `payments.test.ts`
- `apps/bot/src/conversation.ts`, `apps/bot/package.json` (script `test:booking-reason`)
- `apps/web/src/app/(panel)/actions.ts`, `new-appointment-modal.tsx`, `appointment-detail-sheet.tsx`, `calendar-client.tsx`
- `apps/web/src/app/api/appointments/route.ts`, `apps/web/src/lib/appointments.ts`, `apps/web/src/lib/services.ts`
- `apps/web/src/app/(panel)/servicios/actions.ts`, `service-form.tsx`, `service-card.tsx`, `page.tsx`
- `apps/web/src/app/(panel)/pacientes/[id]/page.tsx`, `appointments-section.tsx`
- `apps/web/src/app/(panel)/pacientes/[id]/consultas/[consultationId]/page.tsx`
- `README.md`

---

## 9. Checklist atómico

### Preparación

- [ ] `git fetch` y `git log --oneline HEAD..origin/develop`: si `develop` avanzó (p. ej. se mergeó
      el PR #8), mergearlo en la rama antes de empezar. Confirmar que ninguna otra rama trae carpetas
      nuevas en `packages/db/prisma/migrations/`. Si las trae, **parar** y avisar.

### packages/core

- [ ] `booking-reason.ts`: constantes, `normalizeBookingReason`, `isBookingReasonSkip`,
      `parseBookingReason`, `validateBookingReasonInput`, `reasonForAlert` (4.1).
- [ ] `index.ts`: `export * from "./booking-reason";` al final.
- [ ] `messages.ts`: import de `reasonForAlert`; `bookingReasonLine`; `confirmBooking` y
      `professionalNewBookingAlert` con `reason?` (4.2); textos nuevos al final (sección 6).
- [ ] `booking-reason.test.ts` y `messages.test.ts` (10.1). `npm run test` en verde.

### packages/db

- [ ] Respaldo `pg_dump` (3.3).
- [ ] `schema.prisma`: `Appointment.reason` y `Service.asksReason` (3.1).
- [ ] `npx dotenv -e ../../.env -- prisma migrate dev --create-only --name booking_reason` desde
      `packages/db`. Drift u oferta de reset → **parar**, `blocked` con `prisma migrate status`.
- [ ] Revisar `migration.sql` contra 3.2 (`DEFAULT true` en la misma sentencia, sin `DROP`).
- [ ] `npm run db:migrate` y `npm run db:generate` (raíz).
- [ ] `domain/appointments.ts`: `InvalidBookingReasonError`, `createAppointment` (`reason`,
      `professionalAlertJid`), `updateAppointmentReason` (4.3).
- [ ] `domain/payments.ts`: `reason: appointment.reason` en la alerta (4.4).
- [ ] `domain/appointments.test.ts`, casos nuevos en `payments.test.ts`,
      `domain/gcal-and-ai-privacy.test.ts` (10.2, 10.3).
- [ ] `npm run typecheck`: `packages/*`, `apps/web` **y** `apps/bot` en verde (el cambio de schema y
      de `createAppointment` impacta a los dos).

### apps/bot

- [ ] `conversation.ts`: `STEP.BOOK_REASON`, `Ctx.reason`, comentario de `alertJid`, import de
      `parseBookingReason` (4.6).
- [ ] `conversation.ts`: bloque `BOOK_REASON` en `handleIncoming` entre `AWAIT_QUESTION` e
      `isExitWord` (6.1.1); `case STEP.BOOK_CONFIRM` con `opts`.
- [ ] `conversation.ts`: `handleBookSlot` (6.1.2), `sendBookingSummary` y `handleBookReason` justo
      después (6.1.3–4), `handleBookConfirm` (6.1.5), `handleIncomingMedia` (6.1.6). **No tocar
      `handleQuestionText`** (PR #8).
- [ ] `scripts/test-booking-reason.ts` (10.4) y en `package.json`
      `"test:booking-reason": "dotenv -e ../../.env -- tsx scripts/test-booking-reason.ts"`.
- [ ] Con el bot **detenido**: `npm run test:booking-reason --workspace apps/bot` y regresión
      `test:confirm-flow`, `test:after-hours`, `test:bot-ai`.

### apps/web

- [ ] `lib/appointments.ts`: re-exportar `updateAppointmentReason` e `InvalidBookingReasonError`.
- [ ] `(panel)/actions.ts`: `createAppointmentAction` con `reason`; `saveAppointmentReasonAction` al
      final (5.1).
- [ ] `api/appointments/route.ts`: `reason` en `extendedProps` (5.2).
- [ ] `new-appointment-modal.tsx` (7.1).
- [ ] `appointment-detail-sheet.tsx` + `calendar-client.tsx` (7.2).
- [ ] Consulta clínica `page.tsx` (7.3).
- [ ] `appointment-reason-cell.tsx` (nuevo), `appointments-section.tsx`, ficha `page.tsx` (7.4).
- [ ] `lib/services.ts`, `servicios/actions.ts`, `service-form.tsx`, `service-card.tsx`,
      `servicios/page.tsx` (5.3, 7.5).
- [ ] `npm run typecheck` y `npm run test` en verde.

### Repo

- [ ] `README.md`: fila de `npm run test:booking-reason --workspace apps/bot` en la tabla de comandos.
- [ ] Verificación completa (sección 11) volcada en `progress/impl_HU-013.md`.

---

## 10. Tests

Todo con `npm run test` (vitest en todo el monorepo, mocks, **sin base, sin red**).

### 10.1 `packages/core/src/booking-reason.test.ts` y `messages.test.ts`

`booking-reason.test.ts`:

- `normalizeBookingReason`: `"  hola  "` → `"hola"`; `""`, `"   "`, `"\n\n"`, `null`, `undefined` →
  `null`; `"a\r\nb"` → `"a\nb"`; `"a\n\n\n\nb"` → `"a\n\nb"`; `"a\n\nb"` sin cambios.
- `isBookingReasonSkip` / `parseBookingReason` → `skip`: los 6 ejemplos del Gherkin (`"saltear"`,
  `"Saltear."`, `"omitir"`, `"no"`, `"-"`, `"prefiero no"`) y además `"SALTEO"`, `"Ninguno"`,
  `"nada"`, `"paso"`, `"No!"`, `" - "`, `"--"`, `"—"`, `"  saltear  "`.
- `parseBookingReason` → `tooShort`: `"ok"`, `"1"`, `"a b"`, `"?"`, `"."`, `"👍"`, `""`, `"   "`, `"si"`.
- `parseBookingReason` → `ok`: `"Quiero bajar de peso, tengo hipotiroidismo"` (reason idéntico);
  `"Necesito un menú para la semana, chau harinas"`; `"menú para la semana"`; `"no quiero dieta estricta"`
  (no es salteo); `"abc"` (justo el mínimo); `"Me pidieron un plan para la diabetes"`;
  `"  control  "` → reason `"control"`.
- Límite: 500 × `"a"` → `ok`; 501 × `"a"` → `{ kind: "tooLong", length: 501 }`; 500 × `"a"` con
  espacios alrededor → `ok` (trim antes de medir).
- `validateBookingReasonInput`: `undefined`/`null`/`""`/`"  "` → `{ ok: true, reason: null }`;
  `"ok"` → `{ ok: true, reason: "ok" }` (sin mínimo en el panel); `" Control mensual "` →
  `"Control mensual"`; 501 caracteres → `{ ok: false, error: "El motivo puede tener hasta 500 caracteres (tenés 501)." }`.
- `reasonForAlert`: 200 caracteres → igual; 201 → empieza con los primeros 200 y termina en
  `"… (completo en el panel)"`; un texto cuyo carácter 200 sea seguido de espacios → sin espacio
  antes de `"…"`; con un emoji en la posición 200 no deja medio surrogate (el resultado es UTF-16 válido:
  `Array.from(out)` no tiene `"�"` ni surrogates sueltos).

`messages.test.ts` (fecha fija `2026-10-12T13:00:00Z`, tz `America/Argentina/Buenos_Aires`, moneda `ARS`):

- `confirmBooking` **sin** `reason` y con `reason: null` y `reason: ""` → igual al literal de hoy
  (`"Confirmás este turno?\n\n📋 *Primera consulta*\n🗓️ … hs\n💲 …\n\nRespondé *sí* para confirmar o *no* para cancelar."`,
  armado con `formatDateTime`/`formatPrice` para no depender del formato).
- `confirmBooking` con `reason` → contiene `"\n💲 …\n📝 Motivo: Quiero bajar de peso, tengo hipotiroidismo\n\nRespondé"`.
- `professionalNewBookingAlert` sin `reason` → idéntico al texto de hoy; con `reason` corto → texto de
  hoy + `"\n📝 Motivo: …"`; con `reason` de 300 caracteres → contiene `reasonForAlert(reason)` y **no**
  contiene el texto completo.
- `ASK_BOOKING_REASON`, `BOOKING_REASON_TOO_SHORT`, `BOOKING_REASON_TOO_LONG`,
  `BOOKING_REASON_TEXT_ONLY`: contienen `*saltear*` donde corresponde (los 3 primeros que lo
  mencionan y el de solo texto), para que un cambio de texto no se pierda.

### 10.2 `packages/db/domain/appointments.test.ts` (nuevo, prisma mockeado; patrón de `payments.test.ts`)

Mocks: `vi.mock("../index", () => ({ prisma: mocks.prisma, Prisma: { PrismaClientKnownRequestError: class extends Error {} } }))`
con `$transaction: (fn) => fn(mocks.prisma)`, `service.findUniqueOrThrow`, `patient.findUniqueOrThrow`,
`appointment.create`, `appointment.update`; `vi.mock("./availability", …)` con `getProfessional`
(`{ timezone: "America/Argentina/Buenos_Aires", phoneJid: "pro@s.whatsapp.net" }`) y
`checkSlotAvailable` (`true`); `vi.mock("./outbox", …)` con `enqueueMessage`.

- **Guarda el motivo normalizado:** `createAppointment({ …, createdBy: "PATIENT", notifyPatient: false, reason: "  Bajar de peso  " })`
  → `appointment.create` con `data.reason === "Bajar de peso"` y `data.needsGoogleSync === true`.
- **Vacío → null:** `reason: "   "` y sin `reason` → `data.reason === null`.
- **Largo → error sin escribir:** 501 caracteres → rechaza con `InvalidBookingReasonError`;
  `appointment.create`, `service.findUniqueOrThrow` y `enqueueMessage` **no** se llamaron.
- **Alerta con motivo (camino sin seña):** servicio sin seña, `PATIENT`, `create` devuelve
  `{ id, startsAt, reason: "Bajar de peso", status: "CONFIRMED" }` → `enqueueMessage` con
  `kind: "PROFESSIONAL_ALERT"`, `toJid: "pro@s.whatsapp.net"` y `body` que contiene
  `"📝 Motivo: Bajar de peso"`.
- **Alerta sin motivo igual que hoy:** `reason: null` → `body` igual a
  `messages.professionalNewBookingAlert({ …sin reason })`.
- **Override de destino:** `professionalAlertJid: "fake@s.whatsapp.net"` → `toJid` es ese;
  `professionalAlertJid: null` → no hay alerta.
- **Seña:** servicio con `requiresDeposit: true`, `PATIENT`, `reason: "Control"` → `data.status === "AWAITING_PAYMENT"`,
  `data.reason === "Control"`, y **ninguna** llamada a `enqueueMessage`.
- **Panel:** `createdBy: "PROFESSIONAL"`, `reason: "Control mensual"` → `data.reason` guardado,
  `enqueueMessage` llamado **una** vez con `kind: "CONFIRMATION"` y un `body` **sin** `"Motivo"`; ninguna alerta.
- `updateAppointmentReason({ id: "a1", reason: "  Nuevo motivo " })` → `appointment.update` con
  **exactamente** `{ where: { id: "a1" }, data: { reason: "Nuevo motivo" }, select: { id: true, patientId: true, reason: true } }`
  (sin `needsGoogleSync`); `enqueueMessage` no se llamó.
- `updateAppointmentReason({ reason: "" })` → `data: { reason: null }`.
- `updateAppointmentReason` con 501 caracteres → `InvalidBookingReasonError`, `update` no se llamó.

`packages/db/domain/payments.test.ts` (casos nuevos **al final** del `describe("payment reconciliation without database or network")`):

- **Pago aprobado con motivo:** `payment.appointment.reason = "Quiero bajar de peso"` →
  `syncMercadoPagoPayment("123")` → de las 2 llamadas a `outboundMessage.createMany`, la de
  `kind: "PROFESSIONAL_ALERT"` tiene `body` que contiene `"📝 Motivo: Quiero bajar de peso"`; la de
  `kind: "CONFIRMATION"` **no** contiene `"Motivo"`.
- **Pago aprobado sin motivo:** `reason: null` (o ausente) → `body` de la alerta sin `"Motivo"`.
- **Motivo largo:** 300 caracteres → la alerta contiene `"(completo en el panel)"`.

### 10.3 `packages/db/domain/gcal-and-ai-privacy.test.ts` (nuevo, D9)

Mocks: `googleapis` (`google.auth.OAuth2` clase con `setCredentials`; `google.calendar()` devuelve
`{ events: { insert, patch, delete } }`, `insert` resuelve `{ data: { id: "evt" } }`), `../index`
(`appointment.findMany`, `appointment.update`, `professional.update`), `./availability`
(`getProfessional` con `googleRefreshToken: "rt"`, `googleCalendarId: null`, tz, `googleSyncError: null`;
`getAvailableSlotsForService`).

Constante `SECRET = "Tengo diabetes y estoy embarazada (MOTIVO-PRIVADO)"`.

- **Google, alta:** `appointment.findMany` devuelve un turno `CONFIRMED`, `googleEventId: null`,
  `reason: SECRET`, con `patient` y `service` → `syncGoogleCalendar()` → `insert` llamado una vez y
  `JSON.stringify(insert.mock.calls)` **no** contiene `"MOTIVO-PRIVADO"` (ni `SECRET`); sí contiene el
  nombre del servicio (control positivo).
- **Google, cambio:** mismo turno con `googleEventId: "evt"` → `patch` llamado y su JSON no contiene
  `"MOTIVO-PRIVADO"`.
- **IA, `mis_turnos`:** `appointment.findMany` devuelve `[{ …, reason: SECRET, service: { name: "Antropometría" } }]`
  → `runBotAiTool({ name: "mis_turnos", input: {}, patientId: "p1", now })` → `isError === false` y
  `content` **no** contiene `"MOTIVO-PRIVADO"`; contiene `"Antropometría"`.

(Importa `syncGoogleCalendar` de `./gcal` y `runBotAiTool` de `./botAi`; **no** modifica esos archivos
ni `botAi.test.ts`.)

### 10.4 Simulación contra la base, sin WhatsApp: `apps/bot/scripts/test-booking-reason.ts`

Patrón de `test-after-hours-inquiry.ts` / `test-bot-ai-questions.ts`, con estas reglas **obligatorias**:

- **Nunca manda WhatsApp:** respuestas por el callback `send`; alertas de turno nuevo a
  `ALERT_JID = "5490000000099@s.whatsapp.net"` vía `opts.alertJid` (que ahora llega a
  `createAppointment` como `professionalAlertJid`). **Nunca** usa `Professional.phoneJid`. Toda
  llamada directa a `createAppointment` pasa `notifyPatient: false` y `professionalAlertJid: ALERT_JID`.
- **Sin IA:** al inicio `delete process.env.API_KEY_IA_ANTHROPIC; delete process.env.API_KEY_IA_DEEPSEEK;`
  y todas las llamadas pasan `aiProvider: null`.
- **Sin Mercado Pago:** no llama a `createDepositCheckout` ni a `syncMercadoPagoPayment` (el camino
  de pago aprobado lo cubre 10.2).
- **No modifica `Professional`** ni ningún `Service` existente (ni su `asksReason`). Solo lee
  `getProfessional()`.
- **Aborta** si `BotStatus.connected` es `true` ("Pará el bot antes de correr esta prueba"), salvo
  `ALLOW_BOT_RUNNING=1`; y si `pro.botPaused` es `true`.
- **Datos propios** (ids guardados):
  - pacientes `Ana (TEST)` (`5490000000031@s.whatsapp.net`, phone `5490000000031`) y `Bruno (TEST)`
    (`5490000000032@…`), **con nombre** (así "turno" lleva directo al menú);
  - 3 servicios propios (nombres únicos para no chocar con la limpieza de otros scripts, que borra
    `"Antropometría (TEST)"` por nombre):
    `"HU013 Con motivo (TEST)"` (30 min, $25.000, `active: true`, `asksReason: true`),
    `"HU013 Sin motivo (TEST)"` (30 min, $20.000, `active: true`, `asksReason: false`),
    `"HU013 Con seña (TEST)"` (30 min, $25.000, `active: **false**`, `requiresDeposit: true`,
    `depositKind: "FIXED"`, `depositValue: 5000`, `asksReason: true`; inactivo para que nunca aparezca
    en la lista del bot ni dispare un checkout).
  - Cada turno que se crea (por el bot o directo) se anota y se pone `needsGoogleSync: false`
    **por id** apenas se crea (`updateMany({ where: { id: { in: nuevos } } })`).
- **Limpieza previa** (corrida cortada): pacientes con esos jids **y** `name` terminado en `"(TEST)"`
  (si el jid existe con otro nombre → abortar sin borrar); servicios con esos 3 nombres exactos. Si
  alguno de esos servicios tiene turnos de pacientes que **no** son los TEST → abortar sin borrar.
  Borrar, por id y en orden: consultas de los turnos de esos pacientes, pagos de esos turnos, los
  turnos, `conversationState` de los 2 jids, servicios, pacientes.
- **Limpieza final** (`finally`), **por id**, en este orden: `outboundMessage` (ids anotados + búsqueda
  de seguridad `toJid in [ALERT_JID, JID_ANA, JID_BRUNO]` y `createdAt >= startedAt`, que son jids
  falsos); `consultation` (ids creados + `findMany({ where: { appointmentId: { in: <ids de turnos> } } })`);
  `payment` (`appointmentId in <ids de turnos propios>`); `appointment` (ids de
  `findMany({ where: { patientId: { in: <ids TEST> } } })`); `service` (3 ids); `conversationState`
  (los 2 jids, solo si el script creó los pacientes); `patient` (ids). Nada de `deleteMany` con filtros
  que puedan alcanzar datos reales.
- Helper `reachReasonStep(jid, serviceId)`: `say(jid, "menú")` → `say(jid, "1")` → buscar el índice
  del servicio en `listActiveServices()` (`apps/bot/src/booking.ts`) y mandarlo → `"1"` (primer día)
  → `"1"` (primer horario). Si `askDay` no llega (no hay disponibilidad en 21 días) → abortar con
  "No hay disponibilidad cargada en /disponibilidad: no se puede simular la reserva" (no es un fallo
  de la HU). Devuelve la respuesta del último paso.
- Las comparaciones de texto son contra `messages.*` (no literales).

Escenarios (cada uno con `assert` e impresión `✅`/`❌`; al final `N/N` y exit code ≠ 0 si alguno falla):

1. **Pide motivo:** `reachReasonStep(Ana, S_CON)` → respuesta `=== messages.ASK_BOOKING_REASON`;
   paso `BOOK_REASON`; ningún turno nuevo.
2. **Camino feliz sin seña:** `"Quiero bajar de peso, tengo hipotiroidismo"` → respuesta `===
   messages.confirmBooking({ …, reason })` y contiene `"📝 Motivo: Quiero bajar de peso, tengo hipotiroidismo"`;
   paso `BOOK_CONFIRM`. `"sí"` → `messages.bookingConfirmed(...)`; turno de Ana `CONFIRMED` con
   `reason` exacto; **1** alerta a `ALERT_JID` con `"📝 Motivo: Quiero bajar de peso, tengo hipotiroidismo"`
   (borrarla por id); **0** filas de `OutboundMessage` a `JID_ANA`; paso `MENU`; `context` sin `reason`.
3. **Salteo y confirmación:** reach + `"saltear"` → `confirmBooking` sin motivo (no contiene `"📝"`);
   `"sí"` → turno con `reason === null`; la alerta no contiene `"Motivo"`.
4. **Salteos + "no" en el resumen:** para cada uno de `"Saltear."`, `"omitir"`, `"no"`, `"-"`,
   `"prefiero no"`: reach + texto → resumen sin `"📝"`; `"no"` → `"Sin problema, no reservé nada. Escribí *menú* si querés hacer otra cosa."`;
   la cantidad de turnos de Ana no cambió.
5. **Muy corto:** reach + `"ok"` → `BOOKING_REASON_TOO_SHORT`, paso `BOOK_REASON`; `"1"` → ídem.
6. **Muy largo:** `"a".repeat(501)` → `BOOKING_REASON_TOO_LONG`, paso `BOOK_REASON`; `context` sin
   `reason`; `"no"` después cuenta como salteo (resumen sin motivo) → `"no"` → nada reservado.
7. **Palabras clave dentro del motivo:** reach + `"Necesito un menú para la semana, chau harinas"` →
   resumen con esa línea; paso `BOOK_CONFIRM` (no `MENU`, no `DORMANT`). `"no"`.
8. **Comandos estrictos:** reach + `"menú"` → `messages.menu({ withQuestions: false })`, paso `MENU`,
   nada reservado. Reach + `"salir"` → `DORMANT_BYE`, paso `DORMANT`, nada reservado. Reach + `"chau"`
   → ídem.
9. **Medio sin texto:** reach + `handleIncomingMedia(JID_ANA, …)` → `BOOKING_REASON_TEXT_ONLY`, paso
   `BOOK_REASON`. Después `"Me pidieron un plan para la diabetes"` (simula el epígrafe) → resumen con
   ese motivo; `"no"`.
10. **Servicio sin motivo:** reach hasta el horario con `S_SIN` → la respuesta **es** el resumen
    (`confirmBooking` sin motivo), no el pedido; paso `BOOK_CONFIRM`; `"sí"` → turno con `reason === null`.
11. **Horario ocupado mientras escribe:** reach con `S_CON`; leer `startsAt` del `context` de Ana;
    `createAppointment({ patientId: bruno, serviceId: S_CON, startsAt, createdBy: "PROFESSIONAL", notifyPatient: false, professionalAlertJid: ALERT_JID })`
    (anotar id); Ana `"Control"` → resumen; `"sí"` → `SLOT_TAKEN`; los turnos de Ana no cambiaron.
12. **Abandono:** reach; `say(Ana, "Quiero un plan", { now: +21 min })` → **ninguna** respuesta y
    ningún turno; `say(Ana, "hola", { now: +22 min })` → ninguna respuesta.
13. **Motivo largo en la alerta:** reach + motivo de 300 caracteres (frase repetida) → `"sí"` → turno
    con el motivo **completo** (300); la alerta contiene `reasonForAlert(motivo)` y
    `"(completo en el panel)"` y no contiene el motivo completo.
14. **Seña (dominio):** con un horario libre de `getAvailableSlotsForService({ serviceId: S_CON, … })`
    que no esté usado, `createAppointment({ patientId: ana, serviceId: S_SEÑA, startsAt, createdBy: "PATIENT", notifyPatient: false, reason: "Control (TEST)", professionalAlertJid: ALERT_JID })`
    → `status === "AWAITING_PAYMENT"`, `reason === "Control (TEST)"`, **0** alertas nuevas.
15. **Edición desde el panel (dominio):** sobre el turno del escenario 2:
    `updateAppointmentReason({ id, reason: "  Control mensual  " })` → `"Control mensual"`;
    `needsGoogleSync` sigue `false`; **0** `OutboundMessage` nuevas. `reason: ""` → `null`. 501
    caracteres → lanza `InvalidBookingReasonError` y el valor no cambió.
16. **Consulta (D8):** sobre ese turno con motivo `"Control mensual"`:
    `setAppointmentStatus({ id, status: "COMPLETED" })` → consulta creada (anotar id), `notes === null`;
    `setAppointmentStatus({ id, status: "CONFIRMED" })` → `removedEmptyConsultation === true` y el
    turno sigue con `reason === "Control mensual"`.
17. **IA sin motivo (D9):** `runBotAiTool({ name: "mis_turnos", input: {}, patientId: ana.id, now })`
    → `content` no contiene ninguno de los motivos de los turnos de Ana.

---

## 11. Verificación (el implementer la corre antes de declararse `done`)

Desde la raíz, con la base de Docker arriba y **el bot detenido**:

```bash
npm run db:generate
npm run typecheck                                     # packages/*, apps/web y apps/bot en verde
npm run test                                          # vitest: core, domain y bot (sin red)
(cd packages/db && npx dotenv -e ../../.env -- prisma migrate status)   # "Database schema is up to date!"
npm run test:booking-reason --workspace apps/bot      # 17/17 escenarios OK
npm run test:confirm-flow --workspace apps/bot        # regresión sí/no
npm run test:after-hours --workspace apps/bot         # regresión HU-011
npm run test:bot-ai --workspace apps/bot              # regresión HU-012 (sin API real)
./ops/harness/verify.sh
```

Comprobar en solo lectura que no quedaron restos y que los datos reales siguen igual:

```bash
docker compose exec -T db psql -U nutri -d nutribot -c \
 "select count(*) from \"Patient\" where \"whatsappJid\" like '549000000003_@s.whatsapp.net'; \
  select count(*) from \"Service\" where name like 'HU013 %(TEST)'; \
  select count(*) from \"OutboundMessage\" where \"toJid\" = '5490000000099@s.whatsapp.net'; \
  select count(*) filter (where \"asksReason\"), count(*) from \"Service\"; \
  select count(*) filter (where reason is not null) from \"Appointment\"; \
  select \"phoneJid\" is null from \"Professional\";"
# 0, 0, 0, (9, 9), 0 y t: los servicios reales quedaron con asksReason = true (D4),
# ningún turno real tiene motivo (D10) y la fila de la profesional no se tocó.
```

Chequeo manual en el panel (`npm run dev`, sin el bot):

- `/servicios`: cada tarjeta muestra "Pide motivo". Abrir "Editar" de un servicio: el switch "Pedir
  motivo al reservar" está prendido. **No guardar cambios en servicios reales**; para probar el
  switch, crear un servicio "Prueba motivo (TEST)", apagar el switch, guardar, ver que la tarjeta ya
  no muestra el badge, y **después desactivarlo y borrarlo** (o anotarlo en `impl` para que lo borre
  el usuario si la UI no permite borrar).
- "Nuevo turno": el campo "Motivo de consulta (opcional)" con contador `0/500` que sube al tipear y no
  deja pasar de 500. **No crear turnos para pacientes reales**: si se prueba, usar un paciente
  "(TEST)" con un teléfono `54900000000xx` y borrar después por id (el turno encola una confirmación:
  borrar esa fila de `OutboundMessage` por id antes de que corra el bot).
- Detalle de un turno: fila "Motivo" con "—"; el lápiz abre el editor; "Cancelar" lo cierra sin
  cambios. Solo guardar sobre un turno de prueba propio.

Volcar en `progress/impl_HU-013.md` la salida resumida de cada comando, la ruta del `pg_dump` y el SQL
final de la migración.

---

## 12. Restricciones para el implementer (obligatorias)

- **WhatsApp:** ninguna prueba manda mensajes reales. Solo JIDs `54900000000xx`. Toda fila de
  `OutboundMessage` que encole una prueba se borra por id; el bot va detenido durante las pruebas.
  Nunca usar `Professional.phoneJid` como destino en pruebas.
- **Datos de desarrollo:** no borrar ni modificar datos preexistentes. Limpiar solo por los ids
  insertados. No correr `db:seed` ni `seed:demo`. No modificar `Professional` ni ningún servicio,
  paciente o turno existente (incluido su `asksReason` o `reason`). Los turnos de prueba quedan con
  `needsGoogleSync: false`.
- **Migraciones:** skill `migracion-prisma` completo (sección 3). Drift → `blocked`.
- **Otro desarrollador y PR #8:** no tocar los archivos de 2.1; en `conversation.ts`, no tocar
  `handleQuestionText`, `handoffFromQuestion` ni `handleInquiryText`, y no mover funciones. No tocar
  `workers.ts`, `workers.test.ts`, `botAi.ts`, `botAi.test.ts`.
- **Privacidad (D9):** no agregar `reason` a `gcal.ts`, a `runBotAiTool`/`bot-ai-tools.ts`, al portal,
  a `lib/assistant-tools.ts`, al `title` del evento del calendario ni a ningún log. No loguear el
  texto del motivo (ni en el bot ni en el panel).
- **Una sola regla de validación:** límites y normalización solo en `packages/core/src/booking-reason.ts`;
  web y bot no duplican regex ni números mágicos (usar las constantes).
- Texto al paciente: solo los de la sección 6, sin variantes.

---

## 13. Fuera de alcance (no implementar)

- Que el paciente cambie el motivo después de reservar (bot o portal); juntar varios mensajes.
- Transcribir audios o guardar fotos/documentos como motivo.
- Motivos predefinidos, categorías o estadísticas.
- Copiar el motivo a las notas de la consulta.
- Mandar el motivo a Google Calendar, a la IA (bot o `/asistente`) o al portal.
- Retrasar la alerta de turno nuevo en la franja nocturna.
- Reprogramar turnos. Carga masiva de motivos a turnos viejos.
- Limpiar el `context` de conversaciones abandonadas en `BOOK_REASON`/`BOOK_CONFIRM` (ver P3).

---

## 14. Preguntas abiertas

Ninguna bloquea: cada una trae un **default** que esta SDD ya aplica. El orquestador las confirma con
el usuario antes de lanzar el implementer, o las acepta tal cual.

- **P1. Etiqueta del switch en `/servicios`.** El pedido del orquestador dice "Pedir motivo de
  consulta"; la HU validada (Gherkin y Diseño UX) dice "Pedir motivo al reservar". **Default:** "Pedir
  motivo al reservar" (texto validado), con el badge "Pide motivo".
- **P2. Lista de salteo.** La HU fija `saltear, salteo, omitir, no, -, ninguno, nada, prefiero no,
  paso`. Variantes naturales como "saltar", "no gracias" o "prefiero no decirlo" hoy se guardarían
  como motivo (tienen ≥ 3 letras). **Default:** la lista exacta de la HU (es una constante: sumar
  palabras después es un cambio de una línea + test).
- **P3. Motivo en `ConversationState.context` si el paciente abandona.** Entre el paso del motivo y el
  "sí", el texto vive en `context` (D-Datos). Si abandona, queda ahí hasta que vuelva a escribir una
  palabra clave (el `save` del despertar lo vacía). El cron de limpieza del PR #8
  (`clearExpiredAiSessions`) solo mira `AWAIT_QUESTION`. **Default:** no se agrega limpieza en esta HU
  (evita tocar `workers.ts`/`botAi.ts` mientras el PR #8 está abierto; el mismo texto ya está en el
  chat de WhatsApp). Si se quiere, una vez mergeado el PR #8, extender ese cron a `BOOK_REASON` y
  `BOOK_CONFIRM` en un cambio chico aparte.
- **P4. Parámetro de prueba en `createAppointment`.** Para que el script verifique la alerta sin usar
  `Professional.phoneJid` (que además es `null` en desarrollo), `createAppointment` suma
  `professionalAlertJid?` (undefined = comportamiento de hoy). **Default:** así; el bot le pasa
  `opts.alertJid`, que en producción es `undefined`.
- **P5. Cómo se mide el largo.** **Default:** `String.prototype.length` (UTF-16) después de
  normalizar, igual en bot, panel y `maxLength` del `Textarea` (un emoji cuenta 2). El recorte de la
  alerta usa `Array.from` para no partir emojis.
- **P6. Saltos de línea del motivo.** **Default:** se conservan (normalizados a `\n`, máx. una línea en
  blanco seguida) en la base, el resumen, la alerta y el panel (`whitespace-pre-wrap`); en la tabla
  de la ficha se ve en una línea truncada hasta que se toca.
- **P7. Mínimo de 3 en el panel.** **Default:** el panel no exige mínimo (lo escribe la profesional;
  "TCA" o "DBT" son motivos válidos para ella). El mínimo es solo del bot.
- **P8. `reason` en el JSON de `/api/appointments`.** El panel lateral lo necesita, así que viaja en
  `extendedProps` (ruta protegida por auth), aunque el bloque del calendario no lo muestre.
  **Default:** así.
- **P9. Columna "Motivo" en la ficha.** **Default:** entre "Servicio" y "Precio", truncada a 16rem,
  `title` con el texto completo y expandible al tocar (componente cliente chico).
- **P10. Ubicación del bloque en la consulta clínica.** **Default:** tarjeta "Motivo indicado al
  reservar" en la columna derecha, inmediatamente arriba de "Notas" (literal de la HU).

## 15. Resoluciones del usuario (2026-10-02) — tienen prioridad sobre el resto de la SDD

- **P2: lista de salteo ampliada.** A la lista de la HU (`saltear, salteo, omitir, no, -, ninguno,
  nada, prefiero no, paso`) se suman `saltar`, `no gracias`, `prefiero no decirlo`, `no quiero` y
  `después` / `despues`. Mismo criterio de comparación que el resto de la lista (mensaje entero,
  normalizado), con tests para cada una nueva.
- **P3:** no se agrega limpieza en esta HU (default). Se resuelve aparte, después de mergear el PR
  #8, extendiendo su cron a `BOOK_REASON` y `BOOK_CONFIRM`.
- **P1 y P4–P10:** se aceptan los defaults tal como están escritos en la sección 14.
