# SDD: HU-011 `mensajes-fuera-de-horario` (consultas fuera de horario)

HU validada: `docs/hu-mensajes-fuera-de-horario.md`. **Su sección "Resoluciones" manda:** se aceptan
D1 a D12 tal como las recomendó el afinador. Esta SDD las baja a código. Resumen de lo que eso
implica:

| Duda | Resolución aplicada |
|---|---|
| D1 | Franja **configurable** en `/ajustes` → "Bot de WhatsApp": 3 columnas en `Professional` (activada, inicio, fin), default 22:00–09:00, activada |
| D2 | Misma franja todos los días (sin grilla por día de la semana ni feriados) |
| D3 | De noche el bot pide la consulta y la guarda |
| D4 | De día: alerta inmediata como hoy **y además** captura la consulta (bandeja única) |
| D5 | Un solo WhatsApp de resumen a `phoneJid` al terminar la franja, con nombres y horas, sin el texto |
| D6 | Página nueva `/consultas` en el grupo "Pacientes" de la sidebar, con contador de pendientes |
| D7 | Todo lo de la misma sesión va a la misma consulta, con una sola confirmación. Si vuelve a elegir 0 la misma noche, se agrega a su consulta pendiente |
| D8 | Si el bot espera la consulta y llega algo sin texto, contesta "solo texto". `whatsapp.ts` pasa esos mensajes |
| D9 | Mensajes sin palabra clave: silencio, como hoy |
| D10 | Turnos, recordatorios y demás alertas a la profesional no cambian |
| D11 | "Respondida" la marca ella a mano, sin archivado automático |
| D12 | Sin vencimiento; se borran con el paciente (`onDelete: Cascade`) |

Skills aplicados: `migracion-prisma` (sección 3) y `ui` (sección 7).

Rama: `feat/hu-011-mensajes-fuera-de-horario`, que sale de `develop`. Hoy `develop` y la rama
apuntan al mismo commit (`9b3e441`).

> **Verificación del architect (2026-10-02, base de desarrollo, solo lectura).**
> - `_prisma_migrations`: la última es `20260924121148_pediatric_schofield`, igual que la última
>   carpeta de `packages/db/prisma/migrations/`. No hay drift aparente.
> - `Professional`: **1 fila** (`id = 1`, `timezone = America/Argentina/Buenos_Aires`,
>   `phoneJid` **nulo**, `botPaused = false`). Las 3 columnas nuevas llevan `DEFAULT` en el SQL.
> - `Patient`: 14 filas. `OutboundMessage`: 5 `SENT` y 1 `FAILED`. `ConversationState`: 3 en
>   `MENU` y 4 en `DORMANT`.
> - **Choque de nombres:** "consulta" ya es una entidad del dominio. Existen el modelo
>   `Consultation` (HU-003), `packages/core/src/consultations.ts`,
>   `packages/db/domain/consultations.ts` y las rutas `/pacientes/[id]/consultas/...`. Por eso el
>   modelo nuevo se llama **`PatientInquiry`** (archivos `inquiries.ts` y `after-hours.ts`) y en
>   el código no se usa "consultation" para esto. La ruta `/consultas` y el rótulo "Consultas"
>   salen de la HU validada (ver pregunta P5).
> - `isActive("/pacientes/x/consultas/y", "/consultas")` da `false` (usa `startsWith`), así que
>   el ítem nuevo de la sidebar no se marca como activo en la ficha del paciente.
> - El `.env` de la raíz apunta a `localhost:5433/nutribot`.

---

## 1. Resumen funcional

La profesional define en `/ajustes` → "Bot de WhatsApp" una **franja fuera de horario** (por
defecto de 22:00 a 09:00, en su zona horaria). La franja se puede apagar. Cuando un paciente elige
la **opción 0** del menú dentro de la franja, el bot no encola la alerta inmediata: le contesta
que la nutricionista responde de 9:00 a 22:00 y le pide que escriba su consulta. La conversación
pasa a un paso nuevo, `AWAIT_INQUIRY`. Lo que el paciente escriba en esa sesión (hasta 20 minutos
de inactividad) se guarda en una tabla nueva, `PatientInquiry`. El primer mensaje se confirma y
los siguientes se agregan sin respuesta. Si el paciente vuelve a elegir 0 esa misma noche, el
texto se suma a la misma consulta. Fuera de la franja, la opción 0 sigue mandando el `HANDOFF` y
la alerta inmediata como hoy. Además, el texto que escriba después también se guarda (D4), y si
la conversación empezó de noche y el texto llega ya de día, sale la alerta inmediata. Un cron del
bot corre cada minuto y al arrancar. Fuera de la franja, junta las consultas nocturnas que todavía
no se resumieron y, en una transacción, encola **un solo** `PROFESSIONAL_ALERT` de resumen a
`phoneJid` (si está cargado) y las marca como resumidas. Así el resumen no se repite aunque el
bot se reinicie. En el panel, `/consultas` lista las consultas de la más vieja a la más nueva,
con filtro Pendientes/Respondidas/Todas, link a la ficha y a `wa.me`, y la acción "Marcar como
respondida". La sidebar muestra el contador de pendientes. Si el bot espera la consulta y llega
un audio o una foto, contesta que solo guarda texto.

---

## 2. Workspaces afectados

| Workspace | ¿Se toca? | Qué |
|---|---|---|
| `packages/core` | **Sí** | **Nuevo:** `after-hours.ts` (tipo y default de la franja, validación `HH:mm`, `isWithinAfterHours`, `afterHoursConfigFrom`, `formatClock`) y `after-hours.test.ts`. **Cambian:** `messages.ts` (5 textos nuevos, agregados **al final**), `wake.ts` (`isExitCommand` e `isMenuCommand`, aditivos), `wake.test.ts` (casos nuevos) e `index.ts` (**una línea**: `export * from "./after-hours";`) |
| `packages/db` | **Sí** | `schema.prisma` (enum `InquiryStatus`, modelo `PatientInquiry`, relación inversa en `Patient`, 3 columnas en `Professional`), **1 migración aditiva** `after_hours_inquiries`. **Nuevos:** `domain/inquiries.ts` y `domain/inquiries.test.ts` (prisma mockeado). `domain/index.ts`: **una línea** |
| `apps/bot` | **Sí** | `conversation.ts` (paso `AWAIT_INQUIRY`, opción 0 según la franja, captura, `handleIncomingMedia`, opciones inyectables para pruebas), `whatsapp.ts` (pasa los medios sin texto a un segundo handler), `index.ts` (cablea ese handler), `workers.ts` (cron del resumen y arranque), `workers.test.ts` (mock y casos nuevos). **Nuevo** `scripts/test-after-hours-inquiry.ts` y su script `test:after-hours` en `package.json` |
| `apps/web` | **Sí** | **Nueva** ruta `(panel)/consultas/` (`page.tsx`, `loading.tsx`, `consultas-view.tsx`, `actions.ts`). Sidebar con badge (`nav-config.ts`, `sidebar-content.tsx`, `app-sidebar.tsx`, `mobile-topbar.tsx`), `(panel)/layout.tsx` y `lib/shell.ts` (contador). `/ajustes`: `page.tsx` (bloque nuevo dentro de la tarjeta del bot), `actions.ts` (action nueva, agregada al final) y **nuevo** `after-hours-form.tsx` |

**No se tocan:** portal `(portal)`, `/avisos` (el resumen ya aparece como "Alerta a la
profesional"), `packages/db/domain/appointments.ts` y `payments.ts` (D10), `outbox.ts`,
`booking.ts`, `outbound-payload.ts`, seeds, `tailwind.config.ts`, ficha del paciente (ver 7.5).

### 2.1 Convivencia con la HU-010 (otra persona) y puntos de posible conflicto de merge

**No tocar** (HU-010 en curso): `packages/core/src/plan-micronutrients.ts`,
`micronutrient-recommendations.ts` y sus tests, `apps/web/src/components/plan-micronutrients.tsx`,
todo `apps/web/src/app/(panel)/pacientes/[id]/planes/**` y `packages/db/prisma/seed-hu010.ts`.

Archivos compartidos que esta HU modifica. En todos, el cambio es **mínimo y aditivo** y conviene
avisarle a la otra persona en el PR:

| Archivo | Cambio | Riesgo |
|---|---|---|
| `packages/db/prisma/schema.prisma` | Enum y modelo nuevos **al final del archivo**. Una línea en `Patient` y 3 en `Professional` | **Alto** si la HU-010 también toca el schema. Regla de `AGENTS.md`: **una sola HU con `packages/db` en `implementando` a la vez en todo el equipo**. Antes de crear la migración, traer `develop` y confirmar con la otra persona (Notion) que no hay otra migración en curso |
| `packages/core/src/index.ts` | +1 línea al final | Bajo (conflicto trivial de líneas contiguas) |
| `packages/db/domain/index.ts` | +1 línea al final | Bajo |
| `packages/core/src/messages.ts` | Textos nuevos **al final** del archivo | Bajo |
| `apps/web/src/components/shell/{nav-config.ts,sidebar-content.tsx,app-sidebar.tsx,mobile-topbar.tsx}` | Ítem nuevo y prop opcional `badges` | Medio si la HU-010 agrega ítems a la sidebar |
| `apps/web/src/app/(panel)/layout.tsx`, `apps/web/src/lib/shell.ts` | +1 consulta en el `Promise.all` y una función nueva | Bajo |
| `apps/bot/src/workers.ts`, `workers.test.ts` | Cron nuevo **al final** de `startCron`, mock nuevo | Bajo |

---

## 3. Esquema (Prisma) y migración: skill `migracion-prisma`

### 3.1 Cambios en `packages/db/prisma/schema.prisma`

En `model Professional`, después de `botPaused`:

```prisma
  /// HU-011 (D1): franja "fuera de horario" de la opción 0 del bot. Dentro de la franja, la opción 0
  /// no alerta en el momento: toma la consulta y la resume al terminar la franja.
  afterHoursEnabled  Boolean  @default(true)
  /// Inicio de la franja, "HH:mm" en `timezone` (p. ej. "22:00").
  afterHoursStart    String   @default("22:00")
  /// Fin de la franja, "HH:mm" en `timezone` (p. ej. "09:00"). A esta hora sale el resumen.
  afterHoursEnd      String   @default("09:00")
```

En `model Patient`, después de `consultations Consultation[]`:

```prisma
  inquiries    PatientInquiry[]
```

Al final del archivo:

```prisma
/// HU-011: estado de una consulta dejada por WhatsApp (opción 0 del bot).
enum InquiryStatus {
  PENDING
  ANSWERED
}

/// HU-011: consulta que el paciente le dejó a la profesional por la opción 0 del bot.
/// Una fila por paciente y por sesión (y por noche, ver D7). No es la `Consultation` clínica.
model PatientInquiry {
  id                 String        @id @default(cuid())
  patient            Patient       @relation(fields: [patientId], references: [id], onDelete: Cascade)
  patientId          String
  /// Texto de la consulta. Los mensajes siguientes se concatenan con "\n".
  body               String
  /// Instante del primer mensaje.
  receivedAt         DateTime
  /// Instante del último mensaje agregado.
  lastMessageAt      DateTime
  /// true si el primer mensaje llegó dentro de la franja fuera de horario: entra al resumen.
  receivedAfterHours Boolean
  status             InquiryStatus @default(PENDING)
  answeredAt         DateTime?
  /// Cuándo la procesó el resumen de fin de franja (se haya encolado o no el WhatsApp, según
  /// haya `phoneJid`). null = todavía no se resumió. Solo aplica si `receivedAfterHours`.
  digestedAt         DateTime?
  createdAt          DateTime      @default(now())
  updatedAt          DateTime      @updatedAt

  @@index([status, receivedAt])
  @@index([patientId, status])
}
```

Decisiones:

- `receivedAt` y `lastMessageAt` **no tienen default**. Siempre se escriben con el `at` que recibe
  el dominio, así las pruebas pueden inyectar la hora.
- `digestedAt` cubre el dato "Avisada en el resumen de las 09:00" de la HU y da la
  idempotencia. Se marca también cuando no hay `phoneJid`. Así, si ella carga su WhatsApp a la
  tarde, no le llega un resumen tardío de consultas viejas.
- `MessageKind` **no cambia**: el resumen es un `PROFESSIONAL_ALERT` más.

### 3.2 Migración

- Nombre: `after_hours_inquiries`.
- Crear sin aplicar, desde `packages/db`:
  `npx dotenv -e ../../.env -- prisma migrate dev --create-only --name after_hours_inquiries`
- **SQL esperado** (comparar con el generado; el orden de las sentencias puede variar):

```sql
-- CreateEnum
CREATE TYPE "InquiryStatus" AS ENUM ('PENDING', 'ANSWERED');

-- AlterTable
ALTER TABLE "Professional" ADD COLUMN     "afterHoursEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "afterHoursEnd" TEXT NOT NULL DEFAULT '09:00',
ADD COLUMN     "afterHoursStart" TEXT NOT NULL DEFAULT '22:00';

-- CreateTable
CREATE TABLE "PatientInquiry" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL,
    "lastMessageAt" TIMESTAMP(3) NOT NULL,
    "receivedAfterHours" BOOLEAN NOT NULL,
    "status" "InquiryStatus" NOT NULL DEFAULT 'PENDING',
    "answeredAt" TIMESTAMP(3),
    "digestedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PatientInquiry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PatientInquiry_status_receivedAt_idx" ON "PatientInquiry"("status", "receivedAt");

-- CreateIndex
CREATE INDEX "PatientInquiry_patientId_status_idx" ON "PatientInquiry"("patientId", "status");

-- AddForeignKey
ALTER TABLE "PatientInquiry" ADD CONSTRAINT "PatientInquiry_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;
```

- Revisión obligatoria del SQL antes de aplicar:
  - Las 3 columnas de `Professional` (que tiene 1 fila) son `NOT NULL` **con `DEFAULT`**. Si
    Prisma no generó el `DEFAULT`, parar: el schema está mal.
  - **No** puede haber `DROP` ni `ALTER COLUMN ... TYPE` de nada existente. Si aparece, parar.
  - Si `migrate dev --create-only` informa drift u ofrece reset: **parar**, no aceptar, y reportar
    `blocked` con la salida de `npx dotenv -e ../../.env -- prisma migrate status`.
- Aplicar: `npm run db:migrate` (raíz), después `npm run db:generate`.
- Producción: `prisma migrate deploy`. La migración es aditiva y con defaults, no necesita
  backfill.

### 3.3 Respaldo (antes de aplicar)

Fuera del repo, con el contenedor de desarrollo:

```bash
mkdir -p ~/nutribot-backups
docker compose exec -T db pg_dump -U nutri -d nutribot -Fc > ~/nutribot-backups/pre-hu011-$(date +%Y%m%d-%H%M).dump
ls -lh ~/nutribot-backups/   # que el archivo no pese 0 bytes
```

### 3.4 Prohibido (skill)

`prisma migrate reset`, aceptar el reset que ofrece `migrate dev`, `prisma db push`, pasar
`DATABASE_URL` como `--shadow-database-url`, `prisma migrate diff --from-migrations` contra la base
de desarrollo, y editar una migración ya aplicada.

---

## 4. Contrato compartido

### 4.1 `packages/core/src/after-hours.ts` (nuevo, puro). Lo consumen bot, web y `packages/db`

```ts
/** Franja "fuera de horario" de la opción 0. `start`/`end` en "HH:mm", hora de pared en la tz de la profesional. */
export type AfterHoursConfig = { enabled: boolean; start: string; end: string };

export const DEFAULT_AFTER_HOURS: AfterHoursConfig = { enabled: true, start: "22:00", end: "09:00" };

/** Textos de validación (los usa la server action de /ajustes). */
export const AFTER_HOURS_TEXT = {
  invalidTime: "Usá el formato HH:mm (por ejemplo 09:00).",
  sameTimes: "Elegí dos horarios distintos.",
} as const;

/** true si es exactamente "HH:mm" con HH 00–23 y mm 00–59. "9:00" es inválido. */
export function isValidHhmm(value: string): boolean;

/** null si es válida; si no, uno de los textos de AFTER_HOURS_TEXT. Cruzar medianoche es válido. */
export function validateAfterHoursConfig(input: { start: string; end: string }): string | null;

/**
 * Arma la config desde la fila de Professional. Si `start`/`end` son inválidos o iguales
 * (p. ej. una edición manual en la base) devuelve `enabled: false`, o sea el comportamiento de hoy.
 */
export function afterHoursConfigFrom(pro: {
  afterHoursEnabled: boolean;
  afterHoursStart: string;
  afterHoursEnd: string;
}): AfterHoursConfig;

/**
 * ¿El instante cae dentro de la franja, en la zona `tz`? Compara minutos de pared
 * (formatInTimeZone(instant, tz, "HH:mm") → hhmmToMinutes).
 * - enabled=false, horas inválidas o start===end → false.
 * - start > end (cruza medianoche, caso normal 22:00→09:00): m >= start || m < end.
 * - start < end (p. ej. 13:00→15:00): start <= m < end.
 * Bordes: el inicio está DENTRO (22:00 → true), el fin está FUERA (09:00 → false).
 */
export function isWithinAfterHours(instant: Date, config: AfterHoursConfig, tz: string): boolean;

/** "09:00" → "9:00", "22:00" → "22:00", "00:30" → "0:30". Para los textos del bot. */
export function formatClock(hhmm: string): string;
```

Implementación: usa `formatInTimeZone` y `hhmmToMinutes` de `./time`. No importa nada de `db`.

### 4.2 `packages/core/src/wake.ts` (aditivo). Lo consume el bot

```ts
/**
 * Comando de salida "estricto": el mensaje ENTERO (normalizado, sin signos ni emojis, espacios
 * colapsados) es una de: "salir", "terminar", "cancelar todo", "chau", "listo gracias", "nada mas".
 * Se usa solo en AWAIT_INQUIRY, para que "¿puedo salir a correr?" no cierre la conversación.
 */
export function isExitCommand(text: string): boolean;

/** Ídem para "menu"/"menú": el mensaje entero es "menu". "¿qué menú me conviene?" → false. */
export function isMenuCommand(text: string): boolean;
```

Normalización: `normalize(text).replace(/[^\p{L}\p{N}\s]/gu, "").replace(/\s+/g, " ").trim()`.
`isWakeWord` e `isExitWord` **no cambian**.

### 4.3 `packages/core/src/messages.ts` (textos nuevos, al final del archivo). Ver sección 6

```ts
export function afterHoursHandoff(params: { attendFrom: string; attendTo: string }): string;
export function inquirySavedAfterHours(params: { attendFrom: string }): string;
export const INQUIRY_SAVED_DAY: string;
export const INQUIRY_TEXT_ONLY: string;
export function afterHoursDigest(params: {
  items: { patientName?: string | null; patientPhone: string; receivedAt: Date }[];
  tz: string;
}): string;
```

`attendFrom`/`attendTo` ya vienen formateados con `formatClock` (`attendFrom = formatClock(config.end)`,
`attendTo = formatClock(config.start)`). `afterHoursDigest` respeta el orden de `items` (el dominio
lo pasa por `receivedAt` ascendente) y usa `formatTime(receivedAt, tz)` (`"HH:mm"`).

### 4.4 `packages/db/domain/inquiries.ts` (nuevo, exportado en `domain/index.ts`)

```ts
import type { InquiryStatus, PatientInquiry } from "@prisma/client";
import type { AfterHoursConfig } from "@nutri-bot/core";

/** Tope por mensaje: lo que exceda se recorta (sin aviso al paciente). */
export const INQUIRY_MESSAGE_MAX = 4000;

/**
 * BOT. Registra un mensaje de consulta.
 * 1. Si `inquiryId` (de la sesión) apunta a una consulta PENDING del mismo paciente → la agrega.
 * 2. Si no, y `afterHours` → busca la consulta PENDING más reciente del paciente con
 *    receivedAfterHours=true y digestedAt=null (es "la de esta noche", D7) → la agrega.
 * 3. Si no → crea una nueva { body: text, receivedAt: at, lastMessageAt: at, receivedAfterHours: afterHours }.
 * El agregado es atómico, sin leer y reescribir:
 *   UPDATE "PatientInquiry" SET "body" = "body" || E'\n' || $text, "lastMessageAt" = $at, "updatedAt" = NOW()
 *   WHERE "id" = $id AND "status" = 'PENDING'
 * ($executeRaw con plantilla parametrizada; el UPDATE crudo NO dispara @updatedAt, por eso va explícito).
 * Si el UPDATE afecta 0 filas (la marcaron respondida en el medio), sigue con el paso 2/3.
 * `text` se recorta (trim) y se corta a INQUIRY_MESSAGE_MAX. Texto vacío → lanza Error (el bot no lo llama así).
 */
export async function recordInquiryMessage(params: {
  patientId: string;
  text: string;
  at: Date;
  afterHours: boolean;
  inquiryId?: string | null;
}): Promise<{ inquiry: PatientInquiry; created: boolean }>;

/** WEB. Fila de la lista de /consultas. */
export type InquiryListItem = {
  id: string;
  status: InquiryStatus;
  body: string;
  receivedAt: Date;
  lastMessageAt: Date;
  receivedAfterHours: boolean;
  answeredAt: Date | null;
  patient: { id: string; name: string | null; phone: string };
};

/**
 * WEB. Todas las PENDING + las últimas `answeredLimit` ANSWERED (por answeredAt desc), devueltas
 * juntas ordenadas por receivedAt ASC (de la más vieja a la más nueva).
 */
export async function listInquiries(opts?: { answeredLimit?: number /* default 100 */ }): Promise<InquiryListItem[]>;

/** WEB. Conteo por estado (para los chips del filtro). groupBy por status. */
export async function countInquiriesByStatus(): Promise<{ PENDING: number; ANSWERED: number }>;

/** WEB (shell). Cantidad de PENDING. */
export async function countPendingInquiries(): Promise<number>;

/**
 * WEB. Marca como respondida (status ANSWERED, answeredAt = at). Idempotente.
 * updateMany({ where: { id, status: "PENDING" } }); si count = 0, mira si existe.
 */
export async function markInquiryAnswered(
  id: string,
  at?: Date,
): Promise<"answered" | "already_answered" | "not_found">;

/**
 * BOT (cron cada minuto + runStartupJobs). Resumen de fin de franja, idempotente.
 * - pro = getProfessional(); config = opts.config ?? afterHoursConfigFrom(pro); now = opts.now ?? new Date().
 * - Si isWithinAfterHours(now, config, pro.timezone) → { digested: 0, outboundId: null } (todavía es de noche).
 * - En prisma.$transaction(async (tx) => …):
 *   a. findMany PatientInquiry where { status: PENDING, receivedAfterHours: true, digestedAt: null,
 *      receivedAt: { lte: now }, ...(scope ? { patientId: { in: scope.patientIds } } : {}) },
 *      include patient { name, phone }, orderBy receivedAt asc.
 *   b. 0 filas → { digested: 0, outboundId: null } (noche sin consultas: no se encola nada).
 *   c. alertJid = opts.alertJid !== undefined ? opts.alertJid : pro.phoneJid.
 *      Si hay alertJid → tx.outboundMessage.create({ toJid: alertJid, kind: "PROFESSIONAL_ALERT",
 *      body: messages.afterHoursDigest({ items, tz: pro.timezone }) }).
 *   d. tx.patientInquiry.updateMany({ where: { id: { in: ids }, digestedAt: null }, data: { digestedAt: now } }).
 *      Si count !== ids.length → throw (otra corrida concurrente; la transacción revierte el outbound).
 * - `scope`, `config` y `alertJid` son SOLO para el script de prueba (mismo patrón que
 *   `scope.patientIds` de enqueueAttendanceConfirmations): nunca resume consultas de pacientes reales
 *   ni escribe al número real de la profesional.
 */
export async function enqueueAfterHoursDigest(opts?: {
  now?: Date;
  scope?: { patientIds: string[] };
  config?: AfterHoursConfig;
  alertJid?: string | null;
}): Promise<{ digested: number; outboundId: string | null }>;
```

Los nombres de campo (`afterHoursEnabled`, `afterHoursStart`, `afterHoursEnd`, `receivedAt`,
`lastMessageAt`, `receivedAfterHours`, `status`, `answeredAt`, `digestedAt`) son exactos.

Quién consume qué:

| Función | Bot | Web |
|---|---|---|
| `recordInquiryMessage` | sí | no |
| `enqueueAfterHoursDigest` | sí (cron y arranque) | no |
| `listInquiries`, `countInquiriesByStatus`, `markInquiryAnswered` | no | sí |
| `countPendingInquiries` | no | sí (shell) |
| `afterHoursConfigFrom`, `isWithinAfterHours`, `formatClock` (core) | sí | `validateAfterHoursConfig`, `isValidHhmm` |

### 4.5 `apps/bot/src/conversation.ts` (firmas que cambian)

```ts
/** Opciones inyectables. En producción no se pasan. */
export type ConversationOptions = {
  /** Hora "actual" (default new Date()). Afecta el timeout de sesión, la franja y `at` de la consulta. */
  now?: Date;
  /** SOLO pruebas: reemplaza la franja de Professional. */
  afterHours?: AfterHoursConfig;
  /** SOLO pruebas: reemplaza Professional.phoneJid como destino de las alertas (null = sin alertas). */
  alertJid?: string | null;
};

export async function handleIncoming(
  jid: string,
  text: string,
  send: Send,
  opts?: ConversationOptions,
): Promise<void>;

/** Mensaje entrante sin texto (audio, foto sin epígrafe, sticker, documento…). D8. */
export async function handleIncomingMedia(
  jid: string,
  send: Send,
  opts?: ConversationOptions,
): Promise<void>;
```

`handleIncoming` mantiene el 4.º parámetro opcional, así que `scripts/test-confirm-attendance.ts`
y `index.ts` siguen compilando sin cambios. `handleIncomingMedia` **no** crea pacientes ni estado:
usa `prisma.conversationState.findUnique`, no `loadState`, que hace upsert.

### 4.6 `apps/bot/src/whatsapp.ts`

```ts
export type IncomingHandler = (jid: string, text: string) => Promise<void>;          // sin cambios
export type IncomingMediaHandler = (jid: string) => Promise<void>;                   // nuevo
export async function startWhatsApp(onMessage: IncomingHandler, onMedia?: IncomingMediaHandler): Promise<void>;
```

---

## 5. Rutas, server actions y API (apps/web)

### 5.1 Rutas

| Ruta | Tipo | Qué |
|---|---|---|
| `/consultas` | Nueva, server component (`dynamic = "force-dynamic"`) | Lista de consultas (sección 7.1) |
| `/ajustes` (pestaña "Bot de WhatsApp") | Cambia | Bloque "Horario de consultas" (sección 7.3) |

No hay API routes nuevas. El middleware actual ya protege `/consultas` (matcher genérico).

### 5.2 `apps/web/src/app/(panel)/consultas/actions.ts` (`"use server"`)

```ts
export type InquiryActionState = { ok: boolean; error?: string };

/** Marca respondida. Errores: "not_found" → { ok:false, error:"La consulta ya no existe." }; excepción → { ok:false, error:"No se pudo marcar la consulta. Probá de nuevo." }. */
export async function markInquiryAnsweredAction(id: string): Promise<InquiryActionState>;
```

Valida `id` con `z.string().min(1)`, llama a `markInquiryAnswered(id)`, y si sale bien hace
`revalidatePath("/consultas")` y `revalidatePath("/", "layout")` (este último refresca el contador
de la sidebar). `already_answered` cuenta como `ok: true`.

### 5.3 `apps/web/src/app/(panel)/ajustes/actions.ts` (función nueva al final)

```ts
export async function saveAfterHoursAction(
  _prev: SettingsState,
  formData: FormData,
): Promise<SettingsState>;
```

- Campos del form: `afterHoursEnabled` (`"1"` | `"0"`, de un input hidden), `attendFrom` (= fin de
  la franja, `afterHoursEnd`) y `attendTo` (= inicio de la franja, `afterHoursStart`).
- zod: `z.object({ afterHoursEnabled: z.enum(["0","1"]), attendFrom: z.string().trim(), attendTo: z.string().trim() })`.
- Después: `validateAfterHoursConfig({ start: attendTo, end: attendFrom })`. Si devuelve texto →
  `{ ok: false, error }`. Las horas se validan **aunque la franja esté desactivada**, para no
  guardar basura.
- `prisma.professional.update({ where: { id: 1 }, data: { afterHoursEnabled, afterHoursStart: attendTo, afterHoursEnd: attendFrom } })`,
  `revalidatePath("/ajustes")`, `{ ok: true }`.
- **No se toca** `saveSettingsAction` ni `generalSchema`: el bloque nuevo tiene su propio form.

### 5.4 `apps/web/src/lib/shell.ts`

```ts
/** Pendientes para el badge de la sidebar. Nunca tira: ante error devuelve 0. */
export async function getPendingInquiryCount(): Promise<number>;
```

Usa `countPendingInquiries()` de `@nutri-bot/db/domain` dentro de `try/catch`.

---

## 6. Mensajes del bot (textos exactos)

Todos en `packages/core/src/messages.ts`. `*` es negrita de WhatsApp. `\n\n` separa párrafos.
Con la config por defecto, `attendFrom = "9:00"` y `attendTo = "22:00"`.

| Texto | Cuándo aparece |
|---|---|
| `afterHoursHandoff` | Paciente en `MENU` responde `0` **dentro** de la franja. Reemplaza a `HANDOFF` |
| `inquirySavedAfterHours` | Primer mensaje de texto de la sesión en `AWAIT_INQUIRY`, si **ese** mensaje llega dentro de la franja |
| `INQUIRY_SAVED_DAY` | Primer mensaje de texto de la sesión en `AWAIT_INQUIRY`, si llega **fuera** de la franja (de día o en el cruce) |
| `INQUIRY_TEXT_ONLY` | Llega un mensaje sin texto con la sesión en `AWAIT_INQUIRY` (vigente) |
| `afterHoursDigest` | Va a la profesional (`PROFESSIONAL_ALERT` a `phoneJid`), una vez por noche, al terminar la franja |
| `HANDOFF` (sin cambios) | `0` **fuera** de la franja, o con la franja desactivada |
| `DORMANT_BYE`, `MENU` (sin cambios) | Comando estricto de salida o de menú dentro de `AWAIT_INQUIRY` |

```ts
export function afterHoursHandoff(p: { attendFrom: string; attendTo: string }): string {
  return `🌙 La nutricionista responde consultas de *${p.attendFrom} a ${p.attendTo}*.\n\nSi querés, escribime ahora tu consulta en un mensaje y se la dejo para que la vea a primera hora. 🙂\n\nSi era para un turno, escribí *menú* y lo resolvemos ya mismo.`;
}

export function inquirySavedAfterHours(p: { attendFrom: string }): string {
  return `¡Listo! Le dejé tu consulta a la nutricionista. Te va a responder por acá a partir de las *${p.attendFrom}*. 🙌\n\nSi querés agregar algo más, escribilo ahora.`;
}

// Texto no definido en la HU: ver pregunta P1.
export const INQUIRY_SAVED_DAY = `¡Listo! Le pasé tu consulta a la nutricionista. Te va a responder por acá lo antes posible. 🙌\n\nSi querés agregar algo más, escribilo ahora.`;

export const INQUIRY_TEXT_ONLY = `Por ahora solo puedo guardar mensajes de texto. ¿Me la escribís? 🙏`;

export function afterHoursDigest(p: { items: { patientName?: string | null; patientPhone: string; receivedAt: Date }[]; tz: string }): string {
  const n = p.items.length;
  const head = `🌙 Anoche te dejaron ${n} ${n === 1 ? "consulta" : "consultas"} fuera de horario:`;
  const lines = p.items.map((i) => `• ${i.patientName ?? i.patientPhone} (${formatTime(i.receivedAt, p.tz)})`);
  return `${head}\n${lines.join("\n")}\n\nLas ves completas en el panel → Consultas.`;
}
```

(El código de arriba indica el formato exacto. El implementer puede escribirlo con otro estilo
siempre que el texto resultante sea idéntico.) Si el paciente no tiene nombre se usa
`patient.phone` tal cual, igual que `professionalHandoffAlert`. El texto de la consulta **nunca**
va en el resumen (D5).

### 6.1 Máquina de estados de la conversación (cambios)

Paso nuevo en `STEP`: `AWAIT_INQUIRY: "AWAIT_INQUIRY"`. `Ctx` suma estos campos:

```ts
inquiryId?: string;   // consulta de esta sesión
alerted?: boolean;    // ya se encoló la alerta inmediata en esta sesión
confirmed?: boolean;  // ya se mandó la confirmación en esta sesión
```

Flujo en `handleIncoming(jid, text, send, opts)`:

1. `now = opts?.now ?? new Date()`. El chequeo de timeout pasa a usar
   `now.getTime() - state.updatedAt.getTime()`.
2. `botPaused` → `return` (sin cambios; el escenario "Bot pausado" queda cubierto).
3. `DORMANT`: sin cambios. Un mensaje sin palabra clave no responde ni registra nada (D9).
4. Conversación abierta. Si `step === AWAIT_INQUIRY`:
   - `isExitCommand(text)` → `save(DORMANT)` + `DORMANT_BYE`.
   - `isMenuCommand(text)` → `save(MENU)` + `MENU`.
   - En los demás pasos se mantienen `isExitWord` y `isWakeWord && /\bmenu\b/`, como hoy.
5. `switch`: `case STEP.AWAIT_INQUIRY: return handleInquiryText(...)`.

`handleMenu(jid, text, send, pro, opts)` recibe `pro` y `opts`, y deja de llamar a
`getProfessional()` otra vez. Opción `"0"`:

```
config   = opts.afterHours ?? afterHoursConfigFrom(pro)
alertJid = opts.alertJid !== undefined ? opts.alertJid : pro.phoneJid
if isWithinAfterHours(now, config, pro.timezone):
    send(afterHoursHandoff({ attendFrom: formatClock(config.end), attendTo: formatClock(config.start) }))
    save(jid, AWAIT_INQUIRY, { alerted: false, confirmed: false })        // sin alerta
else:
    send(HANDOFF)                                                        // igual que hoy
    if alertJid: enqueueHandoffAlert(patient, alertJid)                  // igual que hoy
    save(jid, AWAIT_INQUIRY, { alerted: Boolean(alertJid), confirmed: false })   // D4: antes quedaba en MENU
```

`enqueueHandoffAlert` es un helper local de `conversation.ts`. Hace el mismo
`prisma.outboundMessage.create` de hoy, con `professionalHandoffAlert`.

`handleInquiryText(jid, text, ctx, patient, pro, send, opts)`:

```
if /^[0-4]$/.test(text.trim()):  return handleMenu(...)                  // un dígito suelto es una opción del menú (P4)
afterHours = isWithinAfterHours(now, config, pro.timezone)               // según la hora de ESTE mensaje
{ inquiry } = recordInquiryMessage({ patientId, text, at: now, afterHours, inquiryId: ctx.inquiryId })
alerted = ctx.alerted ?? false
if !afterHours && !alerted && !inquiry.receivedAfterHours && alertJid:   // cruce de franja (08:58 → 09:01)
    enqueueHandoffAlert(patient, alertJid); alerted = true
if !ctx.confirmed:
    send(afterHours ? inquirySavedAfterHours({ attendFrom: formatClock(config.end) }) : INQUIRY_SAVED_DAY)
save(jid, AWAIT_INQUIRY, { inquiryId: inquiry.id, alerted, confirmed: true })   // el save renueva updatedAt (sesión de 20 min)
```

- `!inquiry.receivedAfterHours` evita la doble notificación. Si la sesión empezó a las 08:59 con
  una consulta nocturna y el paciente agrega algo a las 09:01, esa consulta ya está (o va a
  estar) en el resumen, así que no sale además una alerta inmediata.
- Mensajes siguientes de la misma sesión: se agregan sin respuesta (D7).
- En una sesión nueva la misma noche (después de `salir` o del timeout), el texto se agrega a
  la consulta de esa noche (paso 2 de `recordInquiryMessage`) y se vuelve a confirmar **una
  vez**, porque `confirmed` vive en la sesión.

`handleIncomingMedia(jid, send, opts)`:

```
pro = getProfessional(); if pro.botPaused return
row = prisma.conversationState.findUnique({ where: { patientJid: jid } })
if !row || row.step !== AWAIT_INQUIRY || now - row.updatedAt > SESSION_TIMEOUT_MS: return   // silencio, como hoy
send(INQUIRY_TEXT_ONLY)
save(jid, AWAIT_INQUIRY, row.context)                                    // renueva la sesión
```

### 6.2 `whatsapp.ts`: qué cuenta como "mensaje sin texto"

En `messages.upsert`, cuando `extractText(m)` devuelve `null`: si `onMedia` está definido y el
contenido normalizado tiene alguna de estas claves, se llama `await onMedia(jid)` dentro del mismo
`try/catch` que `onMessage`:

`audioMessage`, `imageMessage`, `videoMessage`, `documentMessage`,
`documentWithCaptionMessage`, `stickerMessage`, `ptvMessage`.

Todo lo demás (reacciones, `protocolMessage`, ediciones, mensajes sin descifrar) se sigue
ignorando con el log actual. **La reconexión** (`setTimeout(() => void startWhatsApp(onMessage), 3000)`)
tiene que pasar también `onMedia`.

`apps/bot/src/index.ts`:

```ts
await startWhatsApp(
  (jid, text) => handleIncoming(jid, text, (t) => sendText(jid, t)),
  (jid) => handleIncomingMedia(jid, (t) => sendText(jid, t)),
);
```

### 6.3 Cron del resumen (`apps/bot/src/workers.ts`)

- Flag de módulo `digestRunning` y una función `runAfterHoursDigest()`. Si `digestRunning`,
  sale. Si no, llama a `enqueueAfterHoursDigest()` y, si `digested > 0`, hace
  `logger.info({ digested, outboundId }, "Resumen de consultas fuera de horario")`. Ante un error,
  `logger.error({ err }, "Error en el resumen de consultas fuera de horario")`, y en `finally` baja
  el flag.
- `startCron()`: **al final** agrega `cron.schedule("* * * * *", () => runAfterHoursDigest())`.
  Tiene que quedar **último** para que `mocks.schedule.mock.calls[0]` de los tests existentes siga
  siendo la conciliación de pagos.
- `runStartupJobs()`: después del `try` actual, en un **`try/catch` propio**, `await runAfterHoursDigest()`.
  Así, si el bot estuvo caído a las 09:00, el resumen sale al arrancar, y una falla de Google
  Calendar no lo saltea.
- Idempotencia: la garantizan `digestedAt` y la transacción. Con correr cada minuto, el resumen
  sale entre las 09:00 y las 09:01.

---

## 7. UI (skill `ui`): vistas, estructura y componentes

Design system del repo: estilo Notion con shadcn/ui sobre Tailwind 3 (HU-002a). Primitivos en
`apps/web/src/components/primitives/*`, wrappers en `apps/web/src/components/ui.tsx` (`Card`,
`PageHeader`, `Badge`, `Button`, `ButtonLink`, `EmptyState`, `Alert`, `Field`, `Input`,
`FormError`), `DataTable` en `components/data-table.tsx`, toasts con `notify` de `lib/notify.ts`
(sonner, `<Toaster>` ya montado en el layout del panel). Íconos de `lucide-react`.

### 7.1 Vista "Consultas" (nueva): `(panel)/consultas/page.tsx` (server) + `consultas-view.tsx` (cliente)

**Objetivo UX:** a la mañana, ver de un vistazo qué quedó pendiente, leer cada consulta completa,
abrir el chat y marcarla como resuelta.

**Estructura base:** layout del panel (sidebar izquierda colapsable). `PageHeader` con el título
"Consultas" y la descripción "Lo que te dejaron los pacientes por WhatsApp con la opción
*Hablar con la nutricionista*. Respondé desde WhatsApp y marcala como respondida.". Debajo, una
`Card padding="none"` con el título "Consultas por WhatsApp" que contiene la barra de filtros y la
tabla. Mismo patrón que `avisos-view.tsx`.

**Datos (server):** `Promise.all([getProfessional(), listInquiries(), countInquiriesByStatus()])`.
Mapea a filas serializables (sin `Date`; `cell` es función, así que las columnas viven en el
cliente):

```ts
type InquiryRow = {
  id: string;
  status: "PENDING" | "ANSWERED";
  patientId: string;
  patientLabel: string;        // name ?? phone
  phone: string;               // dígitos, para mostrar
  waUrl: string;               // `https://wa.me/${phone.replace(/\D/g, "")}`
  receivedLabel: string;       // formatInTimeZone(receivedAt, tz, "dd/MM · HH:mm")
  receivedSort: number;        // receivedAt.getTime()
  lastMessageLabel: string | null; // "últ. mensaje HH:mm" si lastMessageAt - receivedAt >= 60 s, si no null
  answeredLabel: string | null;    // "Respondida dd/MM · HH:mm"
  afterHours: boolean;
  body: string;
};
```

Si la carga tira, que la agarre el `(panel)/error.tsx` existente. No hace falta `try/catch`
propio.

**Componentes clave (cliente, `ConsultasView`):**

- **Barra de filtros:** `ToggleGroup type="single" variant="outline"` (igual que `/avisos`) con
  `Pendientes (n)`, `Respondidas (n)` y `Todas (n)`. Default **Pendientes**. El filtro es local
  (`useState`) y los conteos salen de `countInquiriesByStatus`. A la derecha, el botón ghost
  "Actualizar" (`router.refresh()`) y `<AutoRefresh seconds={30} />`, para que una consulta
  nueva aparezca sola.
- **`DataTable<InquiryRow>`** con `caption="Consultas de pacientes"`,
  `maxHeightClassName="max-h-[70vh]"` e `initialSort={{ columnId: "recibida", direction: "asc" }}`.
  Columnas:
  1. **Paciente:** `Link` a `/pacientes/[patientId]` con `patientLabel` (font-medium) y, debajo,
     el teléfono en `text-xs text-muted-foreground tabular-nums`.
  2. **Recibida** (`sortValue: receivedSort`): `receivedLabel` y, debajo, `lastMessageLabel` si
     existe. Si `afterHours`, un `Badge tone="info"` "Fuera de horario" con el ícono `Moon`.
  3. **Consulta** (`className: "min-w-72"`): componente `InquiryBody` con
     `whitespace-pre-wrap break-words`. En `< md` recorta con `line-clamp-3` y muestra el botón
     link "Ver más"/"Ver menos" (`md:hidden`, estado local por fila). En `≥ md` el texto va
     completo.
  4. **Estado:** `Badge tone="warning"` "Pendiente" o `Badge tone="success"` "Respondida", con
     `answeredLabel` debajo en `text-xs`.
  5. **Acciones** (sin header): `ButtonLink variant="secondary" size="sm"` "Abrir WhatsApp" (ícono
     `MessageCircle`, `href={waUrl}`, `target="_blank"`, `rel="noopener noreferrer"`,
     `aria-label="Abrir WhatsApp con {patientLabel}"`). Si `status === "PENDING"`, además
     `MarkAnsweredButton`.
- **`MarkAnsweredButton`:** `Button variant="ghost" size="sm"` con el ícono `Check`, el texto
  "Marcar como respondida" y `aria-label="Marcar como respondida la consulta de {patientLabel}"`.
  Usa `useTransition`: `start(async () => { const r = await markInquiryAnsweredAction(id); r.ok ? notify.saved("Consulta marcada como respondida") : notify.error(r.error); })`.
  Muestra `loading={pending}` y el texto "Marcando…". Sin confirmación modal: la acción no
  destruye nada. Si sale bien, la revalidación saca la fila de Pendientes y baja el badge. Si
  falla, toast de error y la fila no cambia.
- **Estados vacíos** (`empty` del `DataTable`, `EmptyState` con el ícono `Inbox`):
  - no hay consultas, o el filtro es Pendientes y no hay ninguna: título "No hay consultas
    pendientes." y la descripción "Las consultas que te dejen fuera de horario por el bot
    aparecen acá." (texto de la HU);
  - filtro Respondidas vacío: "Todavía no marcaste ninguna consulta como respondida.";
  - filtro Todas vacío: el mismo texto que Pendientes.
- **Carga:** `consultas/loading.tsx` con `Skeleton` del encabezado y
  `TableSkeleton bare rows={6} columns={5}`, como `avisos/loading.tsx`.
- **Error:** el de la página lo agarra `(panel)/error.tsx`; los de la acción, con toast.
- **Accesibilidad:** la tabla tiene `caption`, los botones tienen `aria-label` con el nombre del
  paciente y los conteos del filtro van como texto.

### 7.2 Sidebar: ítem "Consultas" con badge de pendientes

- `nav-config.ts`: `NavItem` suma `badge?: "pendingInquiries"`. En el grupo **"Pacientes"**, debajo
  de "Pacientes", va `{ href: "/consultas", label: "Consultas", icon: Inbox, badge: "pendingInquiries" }`.
  Exporta `export type NavBadges = Partial<Record<"pendingInquiries", number>>;`.
- `sidebar-content.tsx`: prop nueva opcional `badges?: NavBadges`. `SidebarLink` recibe
  `count?: number`:
  - expandida: a la derecha del label, un pill `ml-auto rounded-full bg-primary px-1.5 text-[11px] font-medium leading-5 text-primary-foreground tabular-nums`
    con el número (`99+` si pasa de 99), dentro de `panel-sidebar-label` para que se oculte con
    el label al colapsar;
  - colapsada (rail): un punto `absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-primary`;
  - `aria-label` del link: `"Consultas (3 pendientes)"`, o `"Consultas"` si hay 0. Si el count es
    0 o `undefined`, no se renderiza nada.
- `app-sidebar.tsx` y `mobile-topbar.tsx`: prop opcional `badges?: NavBadges` que pasan tal cual
  a `SidebarContent`. No hay indicador en el botón hamburguesa (P8).
- `(panel)/layout.tsx`: suma `getPendingInquiryCount()` al `Promise.all` y pasa
  `badges={{ pendingInquiries }}` a `AppSidebar` y a `MobileTopbar`. Si la consulta falla, devuelve
  0 y el layout no se rompe.

### 7.3 Vista "Ajustes" → pestaña "Bot de WhatsApp" (cambia)

**Estructura:** dentro de la `Card` "Bot de WhatsApp" existente, después de `<BotToggle />`, van
`<Separator className="my-4" />` y `<AfterHoursForm defaults={...} />`. No se agrega una tarjeta
nueva.

**`after-hours-form.tsx` (cliente, form propio, no usa `SettingsFormProvider`):**

- Encabezado `Label`/`p` "Horario de consultas" (`text-sm font-medium`). Debajo, en
  `text-sm text-muted-foreground`: "Fuera de este horario, cuando un paciente elige *Hablar con
  la nutricionista*, el bot le toma la consulta y te la deja para la mañana en vez de avisarte en
  el momento." (la HU usa cursiva para el nombre de la opción).
- Fila `Switch` "Activado" (`id="after-hours-activo"`), controlado con `useState(defaults.enabled)`,
  e `<input type="hidden" name="afterHoursEnabled" value={enabled ? "1" : "0"} />`. Descripción
  bajo el switch: activado → "El bot toma las consultas fuera de horario y te manda un resumen a
  las {attendFrom}."; desactivado → "La opción 0 te avisa en el momento, a cualquier hora."
- Grid `sm:grid-cols-2` con dos `Field` + `Input type="time" required`:
  - "Desde las" → `name="attendFrom"`, `defaultValue={pro.afterHoursEnd}` (09:00);
  - "Hasta las" → `name="attendTo"`, `defaultValue={pro.afterHoursStart}` (22:00).
  Los inputs siguen editables aunque el switch esté apagado, así no se pierde el horario.
- `FormError` inline con `state.error` (p. ej. "Elegí dos horarios distintos.").
- `Button type="submit"` "Guardar horario", con `loading` y el texto "Guardando…".
- `useActionState(saveAfterHoursAction, { ok: false })` +
  `useActionToast(state, { success: "Horario de consultas guardado" })`.
- `page.tsx` pasa `defaults={{ enabled: pro.afterHoursEnabled, attendFrom: pro.afterHoursEnd, attendTo: pro.afterHoursStart }}`.

### 7.4 `/avisos`

Sin cambios. El resumen aparece como "Alerta a la profesional".

### 7.5 Ficha del paciente

**No se toca** en esta HU. D6 resolvió la página general, y la ficha era un "complemento" no
pedido por ningún criterio. Además, esto evita pisar archivos de `pacientes/[id]/` cercanos a la
HU-010.

---

## 8. Archivos

**Nuevos**

- `packages/core/src/after-hours.ts`
- `packages/core/src/after-hours.test.ts`
- `packages/db/prisma/migrations/<timestamp>_after_hours_inquiries/migration.sql` (generado)
- `packages/db/domain/inquiries.ts`
- `packages/db/domain/inquiries.test.ts`
- `apps/bot/scripts/test-after-hours-inquiry.ts`
- `apps/web/src/app/(panel)/consultas/page.tsx`
- `apps/web/src/app/(panel)/consultas/loading.tsx`
- `apps/web/src/app/(panel)/consultas/consultas-view.tsx`
- `apps/web/src/app/(panel)/consultas/actions.ts`
- `apps/web/src/app/(panel)/ajustes/after-hours-form.tsx`

**Modificados**

- `packages/core/src/messages.ts` (al final)
- `packages/core/src/wake.ts`, `wake.test.ts`
- `packages/core/src/index.ts` (+1 línea)
- `packages/db/prisma/schema.prisma`
- `packages/db/domain/index.ts` (+1 línea)
- `apps/bot/src/conversation.ts`, `whatsapp.ts`, `index.ts`, `workers.ts`, `workers.test.ts`
- `apps/bot/package.json` (script `test:after-hours`)
- `apps/web/src/components/shell/nav-config.ts`, `sidebar-content.tsx`, `app-sidebar.tsx`, `mobile-topbar.tsx`
- `apps/web/src/app/(panel)/layout.tsx`, `apps/web/src/lib/shell.ts`
- `apps/web/src/app/(panel)/ajustes/page.tsx`, `actions.ts`

---

## 9. Checklist atómico

### Preparación

- [ ] `git fetch && git merge origin/develop` (o rebase) en la rama de la HU. Confirmar en Notion
      que ninguna otra HU con `packages/db` está en `implementando` (regla de migraciones de
      `AGENTS.md`). Si hay otra, **parar** y avisar.

### packages/core

- [ ] Crear `after-hours.ts` con `AfterHoursConfig`, `DEFAULT_AFTER_HOURS`, `AFTER_HOURS_TEXT`,
      `isValidHhmm`, `validateAfterHoursConfig`, `afterHoursConfigFrom`, `isWithinAfterHours` y
      `formatClock` (sección 4.1).
- [ ] `index.ts`: agregar `export * from "./after-hours";` al final.
- [ ] `wake.ts`: agregar `isExitCommand` e `isMenuCommand` (sección 4.2) sin tocar las funciones
      existentes.
- [ ] `messages.ts`: agregar al final `afterHoursHandoff`, `inquirySavedAfterHours`,
      `INQUIRY_SAVED_DAY`, `INQUIRY_TEXT_ONLY` y `afterHoursDigest` con los textos exactos de la
      sección 6. Importar `formatTime` si hace falta (ya se importa).
- [ ] Escribir `after-hours.test.ts` y los casos nuevos de `wake.test.ts` (sección 10.1).
- [ ] `npm run test` en verde.

### packages/db

- [ ] Respaldo `pg_dump` fuera del repo (sección 3.3).
- [ ] `schema.prisma`: 3 columnas en `Professional`, `inquiries` en `Patient`, enum
      `InquiryStatus` y modelo `PatientInquiry` al final (sección 3.1).
- [ ] `npx dotenv -e ../../.env -- prisma migrate dev --create-only --name after_hours_inquiries`
      desde `packages/db`. Si hay drift o un ofrecimiento de reset: **parar** y reportar
      `blocked` con `prisma migrate status`.
- [ ] Revisar el `migration.sql` contra la sección 3.2: `DEFAULT` en las 3 columnas, sin
      `DROP`.
- [ ] `npm run db:migrate` (raíz) y `npm run db:generate`.
- [ ] Crear `domain/inquiries.ts` (sección 4.4) y exportarlo en `domain/index.ts` (+1 línea al
      final).
- [ ] Crear `domain/inquiries.test.ts` con prisma mockeado (sección 10.2).
- [ ] `npm run typecheck`: tiene que pasar en `packages/db`, `apps/web` **y** `apps/bot`.

### apps/bot

- [ ] `conversation.ts`: `ConversationOptions`, `STEP.AWAIT_INQUIRY`, campos nuevos de `Ctx`, uso
      de `now` en el timeout, comandos estrictos en `AWAIT_INQUIRY`, `handleMenu` con `pro`/`opts`
      y la opción 0 según la franja, helper `enqueueHandoffAlert`, `handleInquiryText` y
      `handleIncomingMedia` (secciones 4.5 y 6.1).
- [ ] `whatsapp.ts`: `IncomingMediaHandler`, segundo parámetro de `startWhatsApp`, lista de claves
      de medios y reconexión que pasa `onMedia` (sección 6.2).
- [ ] `index.ts`: cablear `handleIncomingMedia`.
- [ ] `workers.ts`: `runAfterHoursDigest` con flag, cron **al final** de `startCron` y llamada en
      `runStartupJobs` con su propio `try/catch` (sección 6.3).
- [ ] `workers.test.ts`: agregar `enqueueAfterHoursDigest: mocks.digest` al mock de
      `@nutri-bot/db/domain` y los casos de la sección 10.3.
- [ ] Crear `scripts/test-after-hours-inquiry.ts` (sección 10.4) y el script
      `"test:after-hours": "dotenv -e ../../.env -- tsx scripts/test-after-hours-inquiry.ts"` en
      `apps/bot/package.json`.
- [ ] Con el bot **detenido**: `npm run test:after-hours --workspace apps/bot` y
      `npm run test:confirm-flow --workspace apps/bot` (regresión).

### apps/web

- [ ] `lib/shell.ts`: `getPendingInquiryCount()`.
- [ ] `nav-config.ts`: `badge` en `NavItem`, `NavBadges`, ítem "Consultas" en el grupo
      "Pacientes".
- [ ] `sidebar-content.tsx`: prop `badges` y pill/punto/`aria-label` (sección 7.2).
- [ ] `app-sidebar.tsx` y `mobile-topbar.tsx`: prop `badges` que se pasa a `SidebarContent`.
- [ ] `(panel)/layout.tsx`: contador en el `Promise.all` y `badges` a los dos componentes.
- [ ] `(panel)/consultas/actions.ts`: `markInquiryAnsweredAction` (sección 5.2).
- [ ] `(panel)/consultas/page.tsx`, `consultas-view.tsx` y `loading.tsx` (sección 7.1).
- [ ] `(panel)/ajustes/actions.ts`: `saveAfterHoursAction` al final (sección 5.3).
- [ ] `(panel)/ajustes/after-hours-form.tsx` y el bloque en `page.tsx` (sección 7.3).
- [ ] `npm run typecheck` y `npm run test` en verde.

### Cierre

- [ ] Correr toda la verificación de la sección 11 y volcarla en `progress/impl_HU-011.md`.

---

## 10. Tests

Todos corren con `npm run test` (vitest en todo el monorepo, sin base ni red).

### 10.1 `packages/core/src/after-hours.test.ts`

Con `tz = "America/Argentina/Buenos_Aires"` (UTC−3, sin horario de verano) y config 22:00→09:00:

- `isWithinAfterHours`, cruzando la medianoche (los instantes en UTC se convierten a la hora
  local):
  - 15:30 → false;
  - 21:59 → false;
  - **22:00 → true** (borde de inicio adentro);
  - 23:10 → true;
  - 00:00 → true;
  - 08:59 → true;
  - **09:00 → false** (borde de fin afuera).
- Franja en el mismo día, 13:00→15:00: 12:59 → false; 13:00 → true; 14:59 → true; 15:00 → false.
- `enabled: false` → false a las 23:10.
- `start === end` → false.
- `start: "25:00"` → false.
- Zona horaria: el instante `2026-10-02T13:30:00Z` da **false** en Buenos Aires (10:30) y **true**
  en `Asia/Tokyo` (22:30), con la misma config.
- `isValidHhmm`:
  - "09:00", "00:00" y "23:59" → true;
  - "9:00", "24:00", "12:60", "" y "ab:cd" → false.
- `validateAfterHoursConfig`:
  - `{22:00, 09:00}` → null;
  - `{09:00, 09:00}` → "Elegí dos horarios distintos.";
  - `{25:00, 09:00}` → `AFTER_HOURS_TEXT.invalidTime`.
- `afterHoursConfigFrom`: una fila válida se pasa tal cual; una fila con `afterHoursStart: "xx"`
  da `enabled: false`.
- `formatClock`: "09:00" → "9:00", "22:00" → "22:00", "00:30" → "0:30".
- Textos (`messages`):
  - `afterHoursHandoff({ attendFrom: "9:00", attendTo: "22:00" })` contiene
    `"*9:00 a 22:00*"` y `"escribí *menú*"`;
  - `inquirySavedAfterHours({ attendFrom: "8:30" })` contiene `"*8:30*"`;
  - `afterHoursDigest` con 1 item dice `"1 consulta fuera de horario:"` (singular);
  - con 3 items dice `"3 consultas"` y respeta el orden;
  - un ítem sin nombre muestra el teléfono;
  - la hora va en la tz (un instante 02:10Z da `"(23:10)"` en BA);
  - termina en `"Las ves completas en el panel → Consultas."`;
  - no incluye ningún `body` (el tipo ni lo recibe, pero se chequea que el texto tenga exactamente
    `items.length` líneas con "•").

### 10.1b `packages/core/src/wake.test.ts` (casos nuevos)

- `isExitCommand`:
  - "salir", "Salir!", " chau ", "Listo, gracias" y "nada más" → true;
  - "¿Puedo salir a correr?" y "chau, una cosa más: ¿el yogur?" → false.
- `isMenuCommand`:
  - "menú", "MENU" y "menu." → true;
  - "¿qué menú me conviene para la cena?" → false.

### 10.2 `packages/db/domain/inquiries.test.ts` (prisma mockeado, patrón de `payments.test.ts`)

Mock de `../index` con `prisma.{ $transaction, $executeRaw, patientInquiry.{ findFirst, findMany, findUnique, create, updateMany, groupBy, count }, outboundMessage.create, professional.findUnique }`.
`$transaction` mockeado como `(fn) => fn(mocks.prisma)`. Si `getProfessional` se importa de
`./availability`, mockearlo con `vi.mock("./availability", …)`.

- `enqueueAfterHoursDigest`:
  - con `now` dentro de la franja → no llama a `$transaction` y devuelve `{ digested: 0, outboundId: null }`;
  - afuera con 2 consultas → **un** `outboundMessage.create` con `kind: "PROFESSIONAL_ALERT"`,
    `toJid` = `phoneJid` y un body con los dos nombres. Además, `updateMany` con los 2 ids y
    `digestedAt: null` en el `where`;
  - afuera con 0 → ni create ni updateMany;
  - `phoneJid` nulo → sin create, pero con `updateMany` (quedan resumidas);
  - `alertJid` en opts reemplaza a `phoneJid`; `alertJid: null` → sin create;
  - `scope.patientIds` llega al `where` del `findMany`;
  - `updateMany` devuelve un count distinto de la cantidad de ids → la promesa rechaza.
- `recordInquiryMessage`:
  - con `inquiryId` y `$executeRaw` = 1 → `created: false`, sin `create`;
  - sin `inquiryId`, `afterHours: true` y una consulta nocturna sin resumir → la agrega;
  - `afterHours: false` → `create` con `receivedAfterHours: false`, `receivedAt` y
    `lastMessageAt` = `at`;
  - `$executeRaw` = 0 (respondida en el medio) → crea una nueva;
  - un texto de 5000 caracteres se guarda con 4000.
- `markInquiryAnswered`:
  - `updateMany` count 1 → `"answered"`;
  - count 0 con la fila existente → `"already_answered"`;
  - count 0 sin fila → `"not_found"`.

### 10.3 `apps/bot/src/workers.test.ts` (casos nuevos)

- Agregar `digest: vi.fn()` a `mocks` y `enqueueAfterHoursDigest: mocks.digest` al mock de
  domain.
- El **último** `schedule` es `"* * * * *"` y al ejecutarlo llama a `enqueueAfterHoursDigest` una
  vez.
- Si `enqueueAfterHoursDigest` rechaza → el tick resuelve sin tirar y se llama a `logger.error`.
  El siguiente tick vuelve a llamarlo (el flag se libera).
- Los 4 tests existentes siguen pasando sin cambios. `calls[0]` sigue siendo la conciliación.

### 10.4 Prueba contra la base, sin WhatsApp: `apps/bot/scripts/test-after-hours-inquiry.ts`

Patrón de `test-confirm-attendance.ts`, con estas reglas **obligatorias**:

- **Nunca** manda WhatsApp: las respuestas al paciente se capturan con el callback `send`. Las
  alertas van a un JID falso, `ALERT_JID = "5490000000099@s.whatsapp.net"`, con
  `opts.alertJid`. El script **nunca** usa `Professional.phoneJid`.
- **No modifica `Professional`.** La franja se inyecta con `opts.afterHours` / `config` y la hora
  con `opts.now` / `now`. El escenario "bot pausado" no se cubre acá, porque exigiría tocar
  `botPaused`. Lo cubre la lectura del `return` temprano, que no cambia.
- **Aborta al inicio** si `BotStatus.connected` es `true`, con el mensaje "Pará el bot antes de
  correr esta prueba (encola alertas de prueba)", salvo que se pase `ALLOW_BOT_RUNNING=1`. Aun
  así, cada fila de `OutboundMessage` que encola se borra **por id** apenas se verifica.
- Datos propios:
  - pacientes `Ana (TEST)` con jid `5490000000011@s.whatsapp.net` y `Bruno (TEST)` con
    `5490000000012@s.whatsapp.net`, con nombre cargado;
  - se guardan `patientIds`, `inquiryIds` y `outboundIds`.
- Limpieza previa (una corrida anterior que se cortó): solo pacientes con **esos jids y
  `name` terminado en "(TEST)"**. Si existe un paciente con ese jid y otro nombre, el script
  aborta sin borrar.
- Limpieza final (`finally`), **por id**:
  - `outboundMessage.deleteMany({ where: { id: { in: outboundIds } } })`, más una búsqueda de
    seguridad `findMany({ where: { toJid: ALERT_JID, createdAt: { gte: startedAt } } })` cuyos
    ids también se borran;
  - `patientInquiry.deleteMany({ where: { id: { in: inquiryIds } } })`;
  - `conversationState.deleteMany({ where: { patientJid: { in: [jidAna, jidBruno] } } })`;
  - `patient.deleteMany({ where: { id: { in: patientIds } } })`.
  - **Nada** de `deleteMany({ where: { patientId } })` sobre tablas que pudieran tener datos
    reales.
- Horas: `base = new Date()`, `tz = pro.timezone` (solo lectura) y
  `hm(d) = formatInTimeZone(d, tz, "HH:mm")`. Las configs se arman alrededor de `base`, así el
  timeout de sesión (que compara con `updatedAt` real) no se dispara:
  - `NIGHT = { enabled: true, start: hm(base − 60 min), end: hm(base + 60 min) }`: `base` cae
    adentro;
  - `DAY = { enabled: true, start: hm(base + 60 min), end: hm(base − 60 min) }`: `base` cae afuera;
  - `CROSS = { enabled: true, start: hm(base − 60 min), end: hm(base + 2 min) }`: `base` adentro y
    `base + 3 min` afuera.

Escenarios (cada uno con `assert` e impresión `✅`/`❌`; los textos se comparan contra
`messages.*`):

1. **Día (D4):** Ana en `MENU` ("menú") → `0` con `DAY` → responde `HANDOFF`, hay 1
   `OutboundMessage` a `ALERT_JID` con `professionalHandoffAlert` y `step = AWAIT_INQUIRY`. Se
   borra por id. Después, "¿Puedo cambiar la merienda?" → se crea una consulta con
   `receivedAfterHours = false`, la respuesta es `INQUIRY_SAVED_DAY` y no hay alerta nueva.
2. **Noche, opción 0:** "menú" → `0` con `NIGHT` → la respuesta es
   `afterHoursHandoff(...)` y **no** hay outbound nuevo a `ALERT_JID`.
3. **Noche, primer mensaje:** "¿Puedo cambiar la merienda por una fruta?" → se crea una consulta
   **nueva**, PENDING, con `receivedAfterHours = true` y `receivedAt = base`. La respuesta es
   `inquirySavedAfterHours(...)` y no hay alerta.
4. **Noche, segundo mensaje** (`now = base + 2 min`): "y otra cosa: ¿el yogur puede ser
   descremado?" → la misma consulta tiene el body `"…fruta?\ny otra cosa: …"`, `lastMessageAt`
   actualizado y **ninguna** respuesta.
5. **Comandos estrictos:** "¿Puedo salir a correr?" → se agrega a la consulta y el paso sigue en
   `AWAIT_INQUIRY`.
6. **Medios:** `handleIncomingMedia` en `AWAIT_INQUIRY` → `INQUIRY_TEXT_ONLY`. Después de
   "salir" (→ `DORMANT_BYE`), `handleIncomingMedia` no responde nada.
7. **Misma noche, sesión nueva (D7):** "menú" → `0` → texto → se agrega a **la misma** consulta
   (Ana tiene 1 sola consulta nocturna) y se confirma otra vez.
8. **Cruce de franja:** Bruno "menú" → `0` con `CROSS` y `now = base` → texto nocturno, sin
   alerta. Texto con `now = base + 3 min` → consulta con `receivedAfterHours = false`, 1 alerta a
   `ALERT_JID` y la respuesta `INQUIRY_SAVED_DAY`. Se borra por id.
9. **Resumen:**
   - `enqueueAfterHoursDigest({ now: base, config: NIGHT, scope, alertJid: ALERT_JID })` → 0 (es
     de noche);
   - con `config: DAY` → `digested = 1` (la de Ana) y 1 outbound con "Ana (TEST)". Se borra por
     id;
   - otra vez → `{ digested: 0, outboundId: null }` (idempotente).
10. **Noche sin consultas:** el resumen con `scope: { patientIds: [bruno.id] }` y `DAY` →
    `digested 0`, porque la de Bruno es diurna.
11. **Sin WhatsApp de alertas:** se crea una consulta nocturna de Bruno con `recordInquiryMessage`
    directo (`afterHours: true`). El resumen con `alertJid: null` → `digested 1`,
    `outboundId null` y `digestedAt` cargado.
12. **Marcar respondida:** con `countPendingInquiries()` antes,
    `markInquiryAnswered(consultaDeAna)` → `"answered"` y el conteo baja en 1. Una segunda vez →
    `"already_answered"`.

---

## 11. Verificación (el implementer la corre antes de declararse `done`)

Desde la raíz, con la base de Docker arriba y **el bot detenido**:

```bash
npm run db:generate
npm run typecheck                                     # packages/* y apps/web + apps/bot, todos en verde
npm run test                                          # vitest: core, domain y bot
(cd packages/db && npx dotenv -e ../../.env -- prisma migrate status)   # "Database schema is up to date!"
npm run test:after-hours --workspace apps/bot         # 12/12 escenarios OK
npm run test:confirm-flow --workspace apps/bot        # regresión del flujo sí/no
./ops/harness/verify.sh
```

Después de las pruebas, comprobar en solo lectura que no quedaron restos:

```bash
docker compose exec -T db psql -U nutri -d nutribot -c \
 "select count(*) from \"Patient\" where \"whatsappJid\" like '549000000001_@s.whatsapp.net'; \
  select count(*) from \"OutboundMessage\" where \"toJid\" = '5490000000099@s.whatsapp.net';"
# ambos 0
```

Chequeo manual en el panel (`npm run dev`, sin el bot):

- `/ajustes?tab=whatsapp`: aparece "Horario de consultas" con 09:00 y 22:00 y el switch activado.
  Guardar con dos horas iguales muestra "Elegí dos horarios distintos." inline. Guardar
  08:30/21:00 muestra el toast "Horario de consultas guardado". **Volver a dejar 09:00/22:00**:
  es la fila real de la profesional y no puede quedar modificada.
- `/consultas`: sin datos, muestra el estado vacío con el texto de la HU y la sidebar no muestra
  badge. Para ver la lista con datos, el recorrido lo hace el orquestador con datos propios
  (creados con `recordInquiryMessage` sobre un paciente `(TEST)` y borrados por id).

Volcar en `progress/impl_HU-011.md` la salida resumida de cada comando, la ruta del `pg_dump` y
el SQL final de la migración.

---

## 12. Restricciones para el implementer (obligatorias)

- **WhatsApp:** ninguna prueba manda mensajes reales. Solo JIDs `54900000000xx`. Toda fila de
  `OutboundMessage` encolada por una prueba se borra por id antes de que el bot pueda despacharla:
  el bot va detenido durante las pruebas.
- **Datos de desarrollo:** no borrar ni modificar datos preexistentes. Limpiar solo por los ids
  insertados. No correr `db:seed` ni `seed:demo`. No modificar la fila de `Professional` salvo
  para verificar el form de `/ajustes` a mano, y dejarla como estaba.
- **Migraciones:** skill `migracion-prisma` completo (sección 3). Si hay drift: `blocked`.
- **HU-010:** no tocar los archivos listados en 2.1. En los compartidos, solo cambios aditivos.
- Texto al paciente: solo los de la sección 6, sin variantes.

---

## 13. Fuera de alcance (no implementar)

- Guardar audios, fotos o documentos (solo el aviso de D8).
- Responder desde el panel, o detectar sola la respuesta por WhatsApp (`fromMe`).
- "Volver a pendiente" o "deshacer" una consulta respondida (P9).
- Diferir las alertas de turno nuevo, cancelación o pago (D10).
- Franjas por día de la semana o feriados (D2).
- Sección de consultas en la ficha del paciente (7.5).
- Indicador en el botón hamburguesa del topbar móvil (P8).
- Respuestas automáticas con IA.

---

## 14. Preguntas abiertas

Ninguna bloquea: cada una tiene un **default** que esta SDD ya aplica. El orquestador las
confirma con el usuario antes de lanzar el implementer, o las acepta tal cual.

- **P1. Texto de confirmación de día (`INQUIRY_SAVED_DAY`).** La HU no lo define. D4 pide capturar
  la consulta también de día, pero solo trae el texto nocturno ("a partir de las 9:00"), que de
  día queda mal. **Default:** "¡Listo! Le pasé tu consulta a la nutricionista. Te va a responder
  por acá lo antes posible. 🙌\n\nSi querés agregar algo más, escribilo ahora." Lo mismo vale
  para el cruce de franja (texto a las 09:01). Hay que validar el tono con Daiana.
- **P2. `HANDOFF` de día no invita a escribir la consulta.** El escenario 1 exige "el mensaje de
  derivación actual", así que no se cambia. Pero con D4, lo que el paciente escriba después se
  guarda aunque el bot no se lo haya pedido. **Default:** `HANDOFF` sin cambios. La alternativa
  sería sumarle "Si querés, contame acá tu consulta", pero eso contradice el Gherkin.
- **P3. Comandos de salida y "menú" estrictos dentro de `AWAIT_INQUIRY`.** La HU dice que
  `salir`/`chau` y `menú` funcionan "como hoy". Hoy detectan la palabra **en cualquier parte**
  del mensaje, así que "¿Puedo salir a correr?" cerraría la conversación y la consulta se
  perdería, y "¿qué menú me conviene?" volvería al menú. **Default:** solo dentro de
  `AWAIT_INQUIRY`, el mensaje tiene que ser **entero** el comando (`isExitCommand` e
  `isMenuCommand`). En los demás pasos no cambia nada.
- **P4. Un dígito suelto 0–4 en `AWAIT_INQUIRY` se toma como opción del menú**, no como texto de
  consulta. Cubre al paciente que eligió 0 y después quiere sacar un turno con "1". **Default:
  sí.**
- **P5. Choque de vocabulario "Consultas".** En la ficha del paciente, "Consultas" ya son las
  consultas clínicas (HU-003, `/pacientes/[id]/consultas/...`). La HU valida `/consultas` y el
  rótulo "Consultas" para la bandeja de WhatsApp, y el resumen dice "panel → Consultas".
  **Default:** se respeta lo validado (ruta `/consultas`, ítem "Consultas" y título "Consultas",
  con la tarjeta "Consultas por WhatsApp"). La alternativa es renombrar a "Mensajes" o "Consultas
  por WhatsApp" en la sidebar y en el texto del resumen.
- **P6. Mensajes agregados después del resumen.** Si una sesión empieza a las 08:59 y el paciente
  agrega texto a las 09:02, después de que salió el resumen, ese agregado no genera otra alerta.
  Se ve en el panel (`lastMessageAt`). **Default:** aceptado.
- **P7. Número de alertas igual al del bot (D5).** Si `phoneJid` es el mismo número vinculado al
  bot, el resumen se lo manda a sí mismo. Hoy la base de desarrollo tiene `phoneJid` nulo. Es una
  verificación de configuración en producción, no de código.
- **P8. Topbar móvil:** el badge se ve dentro del menú lateral, pero no en el botón hamburguesa.
  **Default:** sin indicador en la hamburguesa.
- **P9. Sin "deshacer" al marcar respondida.** D11 no lo pide. Un click por error deja la consulta
  en "Respondidas", donde se sigue viendo. **Default:** fuera de alcance.

## 15. Resoluciones del usuario (2026-10-02) — tienen prioridad sobre el resto de la SDD

- **P1–P4, P6–P9:** se aceptan los defaults tal como están escritos en la sección 14.
- **P5: la bandeja se llama "Mensajes", no "Consultas".** Ruta `(panel)/mensajes/` (archivos
  `page.tsx`, `loading.tsx`, `mensajes-view.tsx`, `actions.ts`), ítem "Mensajes" en la sidebar
  (mismo badge de pendientes), título de la vista "Mensajes" y tarjeta "Mensajes por WhatsApp".
  El texto del resumen de las 09:00 dice "panel → Mensajes". Donde esta SDD dice `/consultas`,
  `consultas-view.tsx` o "Consultas" para la bandeja, leer `/mensajes`, `mensajes-view.tsx` y
  "Mensajes". El modelo sigue siendo `PatientInquiry` y las funciones de dominio no cambian de
  nombre.
