# SDD: HU-019 `archivar-pacientes` (Archivar pacientes)

- **HU validada:** `docs/hu-archivar-pacientes.md`. Manda la "Resolución (2026-10-24)": D1–D12
  aceptadas **tal como las recomienda la sección 7**.
- **Rama:** `feat/HU-019-archivar-pacientes` (sale de `develop`). PR a `develop`.
- **Skills aplicados:** `skills/migracion-prisma.md` (migración aditiva) y `skills/ui.txt` (pantallas:
  vista, estructura base, componentes clave → sección 7).
- **Toca `schema.prisma`:** sí. Regla del equipo: una sola HU con migración en `implementando` a la
  vez; traer `develop` antes de crear la migración.

> **Verificación del architect (2026-10-24, solo lectura).**
> - Base de desarrollo (`docker compose exec db psql -U nutri -d nutribot`): `Patient` tiene 21 filas
>   y no tiene ninguna columna de estado. Última migración aplicada: `20261004174348_food_measures`,
>   que es también la última carpeta de `packages/db/prisma/migrations/` (24 migraciones). Sin drift
>   a la vista.
> - `Appointment_patientId_fkey` es `ON DELETE RESTRICT`; el resto de las relaciones de `Patient`
>   son `CASCADE`. Confirma que borrar no es opción (HU §1.1).
> - `createAppointment` (`packages/db/domain/appointments.ts:22`) ya serializa todas las reservas con
>   `SELECT id FROM "Professional" WHERE id = 1 FOR UPDATE` dentro de su transacción. Esta SDD usa
>   **el mismo lock** para archivar (escenario de carrera, D3).
> - Únicos creadores de `Appointment` en código de producción: `createAppointment` (web y bot). Los
>   demás `appointment.create` son scripts de prueba y seeds.
> - `setAppointmentStatus(..., "CONFIRMED")` puede volver un turno a `CONFIRMED`; se cubre (T5).
> - El pago de seña (`payments.ts`) pasa `AWAITING_PAYMENT → CONFIRMED`; como `AWAITING_PAYMENT`
>   futuro ya bloquea el archivado, no hace falta tocar `payments.ts`.
> - `?tab=turnos` ya existe: `lib/patient-tab-route.ts` lo lleva a Historial › Turnos.
> - Los mocks de `$transaction` en `packages/db/domain/appointments.test.ts` y
>   `appointments-booking.test.ts` pasan el mismo objeto `prisma` como `tx`, y ese objeto **no** tiene
>   `patient.updateMany`: hay que agregarlo (checklist A3).
> - Producción: Vercel + Neon, `develop` = producción, el build de Vercel **no** migra (sección 10).

---

## 1. Resumen funcional

La nutricionista puede archivar una paciente desde el menú "Más" (`⋯`) de su ficha: queda marcada con
la fecha y hora (`Patient.archivedAt`) y deja de aparecer en la lista de `/pacientes` (y su contador),
en el buscador de "Nuevo turno" y en los comunicados a todos; nada se borra. No se puede archivar a
quien tiene un turno futuro confirmado o esperando seña (se avisa con la fecha y un enlace a Turnos),
y el chequeo va en la misma transacción y bajo el mismo lock que las reservas. Las archivadas se ven
en "Archivadas (N)" al final de la lista (vista `/pacientes?vista=archivadas`, con buscador), su ficha
muestra un banner con "Desarchivar" y se puede seguir editando. Crear un turno (panel o bot)
desarchiva sola a la paciente; escribirle al bot no. El alta con el número de una archivada ofrece
"Desarchivar y abrir su ficha" (Nuevo paciente) o elegirla (Nuevo turno). El portal no cambia y el
asistente IA las ve marcadas como archivadas.

## 2. Workspaces afectados

| Workspace | ¿Cambia? | Qué |
|---|---|---|
| `packages/db` | **Sí** | `schema.prisma` (`Patient.archivedAt`), migración `patient_archived_at`, `domain/patients.ts` (archivar/desarchivar), `domain/appointments.ts` (`createAppointment` y `setAppointmentStatus` desarchivan). Tests con mocks. |
| `packages/core` | **Sí** | `patient-directory.ts` (`PatientDirectoryInput.archivedAt` obligatorio, `buildArchivedPatientList`), `outbox-text.ts` (`broadcastRecipients` cambia de firma), módulo nuevo `patient-archive.ts` (textos y formato). Tests vitest. |
| `apps/web` | **Sí** | `/pacientes` (lista + vista archivadas), ficha (menú "Más", banner), `pacientes/actions.ts`, `(panel)/actions.ts` (Nuevo turno), `avisos/{page,actions}.ts`, `lib/assistant-tools.ts`, `asistente/actions.ts` (descripción de tools), `new-patient-sheet.tsx`, `new-appointment-modal.tsx`. |
| `apps/bot` | **No (código)** | Ningún archivo de `apps/bot/src` cambia: la reserva desarchiva dentro de `createAppointment` (domain). Pero el tipo `Patient` y `createAppointment` cambian por debajo: **typecheck y tests de `apps/bot` son obligatorios.** |

## 3. Decisiones técnicas

| ID | Decisión | Por qué |
|---|---|---|
| T1 | Estado = **`Patient.archivedAt DateTime?`**. `null` = activa. Sin booleano aparte, sin motivo (D8). | Una sola fuente; la fecha se muestra en banner y lista (HU §3). |
| T2 | **Pendiente** = turno con `status IN (CONFIRMED, AWAITING_PAYMENT)` y `startsAt >= now`. Mismo criterio que `nextAppointment` de la lista y el Resumen de la ficha. | Coherente con lo que ya muestra el panel como "próximo turno". |
| T3 | `archivePatient` corre en una transacción que toma **`SELECT id FROM "Professional" WHERE id = 1 FOR UPDATE`** (el lock de `createAppointment`), busca pendientes y recién después escribe. | Carrera D3: archivar y reservar quedan serializados. Si reserva primero → archivar ve el turno y falla. Si archiva primero → la reserva desarchiva (regla D4/D7). |
| T4 | **Crear un turno desarchiva**: dentro de la transacción de `createAppointment`, después del `appointment.create`, `tx.patient.updateMany({ where: { id, archivedAt: { not: null } }, data: { archivedAt: null } })`. Vale para panel y bot, `CONFIRMED` y `AWAITING_PAYMENT`. | Regla única de D7; el bot no se toca. |
| T5 | `setAppointmentStatus` con `status = "CONFIRMED"` y `startsAt >= now` también desarchiva (mismo `updateMany`, dentro de su transacción). | Mantiene el invariante "una archivada no tiene turnos pendientes" aunque se revierta un estado. Defensivo, costo mínimo. |
| T6 | **`reminders.ts` no se filtra por archivadas.** | Por T3–T5 una archivada no tiene turnos pendientes. Un filtro "defensivo" haría que, si el invariante fallara, una paciente con turno real no reciba recordatorio: es peor que lo que evita. |
| T7 | `findOrCreatePatientByJid` y `findOrCreatePatient` **no cambian**: el upsert por JID no toca `archivedAt` (escribir no desarchiva, D4; no se duplica el número). | D4. |
| T8 | El filtro "activa" vive en **dos capas**: (a) la consulta (`where: { archivedAt: null }`, por rendimiento) y (b) la regla en core: `PatientDirectoryInput.archivedAt` es **obligatorio** y `buildPatientDirectory` descarta archivadas; `broadcastRecipients` recibe `{ whatsappJid, archivedAt }[]` y descarta archivadas. Al ser obligatorios, `tsc` señala cualquier llamador que se olvide. | Testeable en vitest y a prueba de olvidos (lista, buscador de turnos, avisos page **y** action). |
| T9 | Portal (`getPortalPatient`, D6), `/mensajes`, agenda/calendario, Google Calendar, recordatorios, planes, informes: **sin cambios**. | D6 y HU §5. |
| T10 | Asistente IA (D11): ve archivadas; `buscarPaciente` agrega `archivada: boolean`, `resumenPaciente` agrega `archivada_el: string \| null`. | D11. |
| T11 | Sin nombre y sin número visible (`@lid`): se usa la constante existente `HIDDEN_NUMBER_TEXT` ("WhatsApp no muestra el número"), igual que "Por completar" y el encabezado de la ficha. | La HU dice «Número oculto» como referencia; se mantiene el texto que el panel ya usa para el mismo caso. Si el usuario quiere «Número oculto» literal, es un cambio de constante. |
| T12 | El "aviso de turno pendiente" reusa `useConfirm()` (no destructivo): `confirmLabel = "Ver turnos"`, `cancelLabel = "Cerrar"`; si confirma → `router.push(/pacientes/<id>?tab=turnos)`. | Sin componente nuevo; mismo patrón de diálogo del panel. |
| T13 | Desarchivar no pide confirmación; es idempotente. Archivar una ya archivada devuelve `ok` con la fecha original (no la pisa). | HU §4.3; doble clic sin efectos raros. |
| T14 | La vista de archivadas es la misma ruta con query: `/pacientes?vista=archivadas`. | HU §4.2; sin ruta nueva ni layout nuevo. |

## 4. Esquema

### 4.1 `packages/db/prisma/schema.prisma`

En `model Patient`, después de `bodyFrame`:

```prisma
  /** HU-019: null = activa; con fecha = archivada (no aparece en la lista, "Nuevo turno" ni comunicados). */
  archivedAt    DateTime?
```

Sin `@default`, sin índice (≈ decenas/cientos de filas; los filtros son triviales).

### 4.2 Migración

- Nombre: **`patient_archived_at`** → carpeta `packages/db/prisma/migrations/<timestamp>_patient_archived_at/`.
- Crear con (desde `packages/db`):
  `npx dotenv -e ../../.env -- prisma migrate dev --create-only --name patient_archived_at`
- SQL esperado (único statement; si Prisma genera algo más, **parar**):

```sql
-- AlterTable
ALTER TABLE "Patient" ADD COLUMN     "archivedAt" TIMESTAMP(3);
```

- **Filas existentes:** columna nullable, sin default ni backfill → todas quedan activas (`NULL`).
  Es compatible hacia atrás: el código viejo (producción actual) sigue andando con la columna nueva.

## 5. Contrato compartido

### 5.1 `packages/db/domain/patients.ts` (nuevo; consumidor: web. El bot no lo llama)

```ts
export type PendingAppointmentStatus = "CONFIRMED" | "AWAITING_PAYMENT";

export type ArchivePatientResult =
  | { ok: true; archivedAt: Date }
  | { ok: false; reason: "not_found" }
  | {
      ok: false;
      reason: "pending_appointments";
      /** El pendiente más cercano (startsAt asc). */
      next: { startsAt: Date; status: PendingAppointmentStatus };
      /** Cuántos pendientes más hay además de `next` (0 si es uno solo). */
      moreCount: number;
    };

/** HU-019 (D3, T3). En una transacción: lock de Professional (el de createAppointment), lee la
 *  paciente, busca turnos CONFIRMED/AWAITING_PAYMENT con startsAt >= now; si hay → pending_appointments
 *  sin escribir; si ya estaba archivada → ok con su archivedAt original; si no → archivedAt = now. */
export async function archivePatient(patientId: string, now?: Date): Promise<ArchivePatientResult>;

/** HU-019. archivedAt = null (idempotente). count 0 → not_found. */
export async function unarchivePatient(
  patientId: string,
): Promise<{ ok: true } | { ok: false; reason: "not_found" }>;
```

Implementación de `archivePatient` (orden exacto dentro de `prisma.$transaction(async (tx) => …)`):
1. ``await tx.$queryRaw`SELECT id FROM "Professional" WHERE id = 1 FOR UPDATE` ``
2. `tx.patient.findUnique({ where: { id }, select: { id: true, archivedAt: true } })` → `null` ⇒ `not_found`.
3. `tx.appointment.findMany({ where: { patientId: id, status: { in: ["CONFIRMED","AWAITING_PAYMENT"] }, startsAt: { gte: now } }, orderBy: { startsAt: "asc" }, select: { startsAt: true, status: true } })` → si hay ⇒ `pending_appointments` con `next = [0]`, `moreCount = length - 1`.
4. Si `archivedAt` ya tiene valor ⇒ `{ ok: true, archivedAt }` (sin escribir).
5. `tx.patient.update({ where: { id }, data: { archivedAt: now } })` ⇒ `{ ok: true, archivedAt: now }`.

`unarchivePatient`: `prisma.patient.updateMany({ where: { id }, data: { archivedAt: null } })`.

Ambas se exportan solas por `export * from "./patients"` en `domain/index.ts`.

### 5.2 `packages/db/domain/appointments.ts` (modificado; consumidores: **web y bot**)

- `createAppointment(params)`: **firma y retorno sin cambios.** Dentro de la transacción, después de
  `tx.appointment.create(...)` y antes del `return`:
  `await tx.patient.updateMany({ where: { id: params.patientId, archivedAt: { not: null } }, data: { archivedAt: null } });`
  (el `return` de la transacción sigue siendo el appointment).
- `setAppointmentStatus(params)`: **firma sin cambios.** Dentro de la transacción, si
  `params.status === "CONFIRMED" && prev.startsAt >= new Date()`, el mismo `updateMany` con
  `id: prev.patientId`.

### 5.3 `packages/core`

**`patient-directory.ts` (modificado)**

```ts
export interface PatientDirectoryInput {
  // …campos actuales sin cambios…
  /** HU-019: null = activa. Las archivadas se descartan (T8). Obligatorio a propósito. */
  archivedAt: Date | null;
}
// buildPatientDirectory: firma igual; `if (p.archivedAt) continue;` junto al descarte de not_person.

export interface ArchivedPatientInput {
  id: string;
  name: string | null;
  phone: string;
  whatsappJid: string;
  archivedAt: Date;
}

export interface ArchivedPatientRow
  extends Pick<PatientDirectoryRow, "id" | "name" | "contactKind" | "phoneLabel" | "phoneDigits" | "searchName"> {
  /** name ?? phoneLabel ?? HIDDEN_NUMBER_TEXT. */
  title: string;
  /** PATIENT_ARCHIVE_TEXT.archivedOn(formatArchivedDate(archivedAt, tz)) → "Archivada el 24/10/2026". */
  archivedLabel: string;
}

/** HU-019 (D2, D12). Descarta not_person. Orden: primero con nombre (mismo collator que
 *  buildPatientDirectory, empate por id); después sin nombre, por archivedAt desc (empate por id).
 *  Las filas sirven para matchesPatientQuery. */
export function buildArchivedPatientList(
  input: readonly ArchivedPatientInput[],
  tz: string,
): ArchivedPatientRow[];
```

`matchesPatientQuery` y `patientCountLabel`: sin cambios.

**`outbox-text.ts` (firma modificada; consumidor: web, `avisos/page.tsx` y `avisos/actions.ts`)**

```ts
/** Destinatarios del comunicado: sin archivadas (D5), solo isPersonJid, sin repetidos, en el orden de entrada. */
export function broadcastRecipients(
  patients: readonly { whatsappJid: string; archivedAt: Date | null }[],
): string[];
```

**`patient-archive.ts` (nuevo; exportado desde `packages/core/src/index.ts`)**

```ts
/** "24/10/2026" en tz. */
export function formatArchivedDate(instant: Date, tz: string): string;

/** "jueves 30/10 a las 10:00" (otro año que now: "jueves 30/10/2027 a las 10:00"), en tz, minúscula. */
export function formatPendingAppointment(startsAt: Date, now: Date, tz: string): string;

/** Texto del aviso de turno pendiente (D3):
 *  name con valor, moreCount 0: "Ana tiene un turno el jueves 30/10 a las 10:00. Cancelalo antes de archivarla."
 *  name con valor, moreCount n≥1: "Ana tiene un turno el jueves 30/10 a las 10:00 y n más. Cancelalos antes de archivarla."
 *  name null: "Este contacto tiene un turno el … Cancelalo antes de archivarlo." (y "… y n más. Cancelalos antes de archivarlo.")
 *  "Ana" = firstName(name) de agenda.ts. */
export function archiveBlockedText(p: {
  name: string | null;
  startsAt: Date;
  moreCount: number;
  now: Date;
  tz: string;
}): string;

export const PATIENT_ARCHIVE_TEXT = {
  menuArchive: "Archivar paciente",
  menuUnarchive: "Desarchivar",
  confirmTitle: (name: string | null) => (name ? `¿Archivar a ${name}?` : "¿Archivar este contacto?"),
  confirmDescription:
    "Deja de aparecer en tu lista, en \"Nuevo turno\" y en los comunicados. No se borra nada: la encontrás en \"Archivadas\" y la podés desarchivar cuando quieras.",
  /** Sin nombre: el contacto (phoneLabel ?? HIDDEN_NUMBER_TEXT) + ". " + el mismo texto de confirmDescription. */
  confirmDescriptionUnnamed: (contactLabel: string) => `${contactLabel}. ${CONFIRM_DESCRIPTION}`,
  confirmLabel: "Archivar",
  cancel: "Cancelar",
  archived: (name: string | null) => (name ? `${name} quedó archivada` : "El contacto quedó archivado"),
  unarchived: (name: string | null) =>
    name ? `${name} volvió a tu lista de pacientes` : "El contacto volvió a tu lista de pacientes",
  blockedTitle: "Tiene un turno pendiente",
  seeAppointments: "Ver turnos",
  close: "Cerrar",
  archiveError: "No se pudo archivar. Probá de nuevo.",
  unarchiveError: "No se pudo desarchivar. Probá de nuevo.",
  banner: (dateLabel: string) =>
    `Paciente archivada el ${dateLabel}. No aparece en tu lista ni recibe comunicados.`,
  unarchiveButton: "Desarchivar",
  archivedSection: (n: number) => `Archivadas (${n})`,
  archivedTitle: "Archivadas",
  backToPatients: "Volver a pacientes",
  archivedOn: (dateLabel: string) => `Archivada el ${dateLabel}`,
  archivedEmpty: "No tenés pacientes archivadas.",
  archivedSearchLabel: "Buscar entre las archivadas por nombre o teléfono",
  archivedSearchPlaceholder: "Buscá entre las archivadas",
  phoneTakenArchived: (label: string) => `Ese número es de ${label}, que está archivada.`,
  unarchiveAndOpen: "Desarchivar y abrir su ficha",
} as const;
```

(`CONFIRM_DESCRIPTION` es una constante interna del módulo con el texto de `confirmDescription`, que se
usa en las dos claves para no repetir el string.)

Textos exactos que salen de la HU: confirmación (§4.1), toast de archivado/desarchivado, aviso de turno
pendiente, banner (§4.3), "Archivadas (N)", "Archivada el …", estado vacío (§4.2), aviso de alta
(§4.4). **Ningún texto de WhatsApp cambia.**

## 6. Rutas, server actions y lecturas del panel

### 6.1 Inventario de lugares que leen pacientes (HU §1.2) y qué hace cada uno

| Lugar | Archivo | Cambio |
|---|---|---|
| Lista `/pacientes` + contador | `pacientes/page.tsx` | Activas: `where: { archivedAt: null }`, `select` agrega `archivedAt`, se pasa a `PatientDirectoryInput`. Además lee las archivadas (`where: { archivedAt: { not: null } }`, `select { id, name, phone, whatsappJid, archivedAt }`) → `buildArchivedPatientList` → `archivedCount = rows.length` (o la lista entera si `vista=archivadas`). |
| Vista archivadas | `pacientes/page.tsx` con `searchParams.vista === "archivadas"` | Renderiza `ArchivedPatientList` (nuevo) en vez de `PatientDirectory`. Sin `NewPatientSheet`. |
| Ficha | `pacientes/[id]/page.tsx` | Lee `patient.archivedAt` (ya viene por `include`). Calcula `pendingBlockedText` con los turnos que ya trae (`appts` filtrados por T2) usando `archiveBlockedText`, o `null`. Pasa `archivedAt`, `archivedLabel` y `pendingBlockedText` al encabezado. |
| Buscador de "Nuevo turno" | `(panel)/actions.ts#listAppointmentPatientsAction` | `where: { archivedAt: null }`, `select.archivedAt`, `archivedAt` en el input. |
| Alta en "Nuevo turno" | `(panel)/actions.ts#createAppointmentAction` | `taken` selecciona `archivedAt`; si archivada → `error = PATIENT_ARCHIVE_TEXT.phoneTakenArchived(label)` y `existingPatient.archived = true`. Con `patientId` (la eligió) no cambia: `createAppointment` desarchiva (T4). Agrega `revalidatePath("/pacientes")`. |
| Comunicado (cantidad) | `avisos/page.tsx` | `findMany({ where: { archivedAt: null }, select: { whatsappJid: true, archivedAt: true } })` → `broadcastRecipients(patients)`. (La segunda consulta de esa página, que busca nombres por JID para el historial de envíos, **no** se filtra.) |
| Comunicado (envío) | `avisos/actions.ts#broadcastMessageAction` | Igual que la página: `where: { archivedAt: null }`, `select { whatsappJid, archivedAt }`, `broadcastRecipients(patients)`. |
| Asistente IA | `lib/assistant-tools.ts` | `buscarPaciente`: agrega `archivada: p.archivedAt !== null` a cada resultado. `resumenPaciente`: agrega `archivada_el: patient.archivedAt ? formatArchivedDate(patient.archivedAt, pro.timezone) : null`. Sin filtro (D11). |
| Asistente IA (tools) | `asistente/actions.ts` | Descripción de `buscar_paciente`: "Busca pacientes por nombre o teléfono, incluidas las archivadas. Devuelve id, nombre, teléfono y si está archivada." Agregar a `resumen_paciente` que informa `archivada_el`. |
| Alta "Nuevo paciente" | `pacientes/actions.ts#createPatientAction` | `taken` selecciona `archivedAt`; si archivada → `existingId`, `existingArchived: true`, `fieldErrors.phone = PATIENT_ARCHIVE_TEXT.phoneTakenArchived(patientDisplayName(taken))`. Activa: igual que hoy. |
| Portal | `lib/patient-session.ts` | **Sin cambios** (D6). |
| `/mensajes` | `mensajes/page.tsx` | **Sin cambios** (HU §5). |
| Recordatorios | `packages/db/domain/reminders.ts` | **Sin cambios** (T6). |
| Bot | `apps/bot/src/conversation.ts` | **Sin cambios** (T4, T7). |
| Ficha › planes, informes, consultas, IA del plan | `pacientes/[id]/**` (por id) | **Sin cambios** (D9: la ficha de una archivada se edita igual). |

### 6.2 Server actions nuevas o modificadas (`apps/web/src/app/(panel)/pacientes/actions.ts`)

```ts
export type ArchivePatientActionResult =
  | { ok: true; name: string | null }          // name recortado o null (para el toast)
  | { ok: false; error: string; blocked?: true }; // blocked: error = archiveBlockedText(...)

/** HU-019. Llama archivePatient(id). pending_appointments → { ok:false, blocked:true, error: archiveBlockedText }.
 *  not_found / excepción → { ok:false, error: archiveError }. ok → revalidatePath("/pacientes"),
 *  revalidatePath(`/pacientes/${id}`), revalidatePath("/avisos"). */
export async function archivePatientAction(patientId: string): Promise<ArchivePatientActionResult>;

/** HU-019. Llama unarchivePatient(id). not_found / excepción → { ok:false, error: unarchiveError }.
 *  ok → mismos revalidatePath. */
export async function unarchivePatientAction(
  patientId: string,
): Promise<{ ok: true; name: string | null } | { ok: false; error: string }>;
```

Para el `name` del resultado y el texto bloqueado, la action lee `prisma.patient.findUnique({ where: { id }, select: { name: true } })` (y el timezone con `getProfessional()` para formatear). Validar que `patientId` sea string no vacío.

`CreatePatientState` agrega `existingArchived?: boolean`.
`CreateAppointmentResult.existingPatient` agrega `archived: boolean`.

## 7. Pantallas (skill `ui.txt`)

**7.1 Ficha — encabezado con menú "Más"** (`pacientes/[id]/patient-header.tsx` + nuevo cliente
`patient-archive-controls.tsx`).
- Estructura: igual que hoy; a la derecha, junto a «WhatsApp», `MoreActionsMenu` (`components/more-actions-menu.tsx`, label "Más opciones de la paciente").
- Ítems: activa → «Archivar paciente» (ícono `Archive`, **no** `destructive`); archivada → «Desarchivar» (ícono `ArchiveRestore`).
- Archivar: si `pendingBlockedText` ≠ null → aviso (T12) sin llamar a la action. Si no → `useConfirm({ title, description, confirmLabel: "Archivar", cancelLabel: "Cancelar", destructive: false })` → `archivePatientAction`. `blocked` → aviso (T12) con el texto devuelto. Error → `notify.error(error)`. OK → `router.push("/pacientes")` y `notify.undo(PATIENT_ARCHIVE_TEXT.archived(name), async () => { const r = await unarchivePatientAction(id); r.ok ? router.refresh() : notify.error(r.error) })`.
- Desarchivar (menú): sin confirmación → `unarchivePatientAction` → `notify.saved(unarchived(name))` + `router.refresh()`.

**7.2 Ficha — banner de archivada** (nuevo cliente `archived-banner.tsx`, arriba de `PatientHeader`
dentro del `header` de `PatientTabs`).
- Caja neutra (tokens del sistema, no rojo), texto `banner(archivedLabel)` y botón «Desarchivar» (`Button variant="secondary"`), mismo flujo que el ítem del menú.

**7.3 Lista `/pacientes` — fila «Archivadas (N)»** (`patient-directory.tsx`).
- Prop nueva **opcional** `archivedCount?: number` (default 0). Con N > 0, al final (debajo de "Por completar"), un `GroupedList` con un `GroupedListRow href="/pacientes?vista=archivadas" label={archivedSection(N)}`.
- Se muestra también cuando no hay activas (en el early return del estado vacío) y cuando hay búsqueda sin resultados no se oculta (es navegación, no resultado).

**7.4 Vista Archivadas** (nuevo cliente `archived-patient-list.tsx`, servido por `pacientes/page.tsx`).
- Estructura: enlace "‹ Volver a pacientes" (mismo estilo que el "‹ Pacientes" de la ficha), `PageHeader title="Archivadas"`, buscador (mismo input que `PatientDirectory`, sin el atajo "/" ni autofoco obligatorios), contador `patientCountLabel`.
- `GroupedList` de `GroupedListRow` con `href=/pacientes/<id>`, `label = row.title`, `description = row.archivedLabel`. Filtro con `matchesPatientQuery`.
- Vacío: `EmptyState` con `archivedEmpty`. Sin resultados: el mismo `noResultsTitle` de la lista.

**7.5 «Nuevo paciente»** (`new-patient-sheet.tsx`). Si `state.existingArchived`: en lugar del link «Ver su ficha», botón `unarchiveAndOpen` → `unarchivePatientAction(existingId)` → ok: `router.push(/pacientes/<id>)` + `notify.saved(unarchived(name))` y cierra el sheet; error: `notify.error`.

**7.6 «Nuevo turno»** (`new-appointment-modal.tsx`). Sin cambios de UI: el error ya muestra `res.error` (ahora el texto de archivada) y la opción "Elegir a …" se suma con el mismo código que hoy. Al guardar con `patientId`, el turno se crea y la paciente se desarchiva (T4).

## 8. Archivos

**Crear**
- `packages/db/prisma/migrations/<ts>_patient_archived_at/migration.sql`
- `packages/db/domain/patients.test.ts`
- `packages/core/src/patient-archive.ts` + `patient-archive.test.ts`
- `apps/web/src/app/(panel)/pacientes/[id]/patient-archive-controls.tsx`
- `apps/web/src/app/(panel)/pacientes/[id]/archived-banner.tsx`
- `apps/web/src/app/(panel)/pacientes/archived-patient-list.tsx`

**Modificar**
- `packages/db/prisma/schema.prisma`
- `packages/db/domain/patients.ts`, `appointments.ts`, `appointments.test.ts`, `appointments-booking.test.ts`
- `packages/core/src/patient-directory.ts` + `.test.ts`, `outbox-text.ts` + `.test.ts`, `index.ts`
- `apps/web/src/app/(panel)/pacientes/page.tsx`, `patient-directory.tsx`, `actions.ts`, `actions.test.ts`, `new-patient-sheet.tsx`
- `apps/web/src/app/(panel)/pacientes/[id]/page.tsx`, `patient-header.tsx`
- `apps/web/src/app/(panel)/actions.ts`, `actions.test.ts`
- `apps/web/src/app/(panel)/avisos/page.tsx`, `actions.ts`, `actions.test.ts`
- `apps/web/src/lib/assistant-tools.ts`, `apps/web/src/app/(panel)/asistente/actions.ts`

**No tocar:** `apps/bot/**`, `packages/db/domain/reminders.ts`, `payments.ts`, `lib/patient-session.ts`, `mensajes/**`, `backlog/**`.

## 9. Checklist atómico (una tarea = un commit)

Antes de empezar: `git fetch && git rebase origin/develop` (la rama no debe tener migraciones ajenas
sin traer). Confirmar que ninguna otra HU con migración está en `implementando`.

### A. `packages/db`
- [ ] **A1 — Esquema y migración.** Respaldo: `docker compose exec -T db pg_dump -U nutri -d nutribot > ~/nutribot-backup-HU019-$(date +%Y%m%d%H%M).sql` (fuera del repo). Agregar `archivedAt DateTime?` a `Patient`. Desde `packages/db`: `npx dotenv -e ../../.env -- prisma migrate status` (si hay drift, **parar** y reportar `blocked`); `npx dotenv -e ../../.env -- prisma migrate dev --create-only --name patient_archived_at`; revisar que el SQL sea solo el `ADD COLUMN` de 4.2; `npm run db:migrate` (raíz); `npm run db:generate`. Commit: schema + carpeta de migración.
- [ ] **A2 — `archivePatient` / `unarchivePatient`** en `domain/patients.ts` (5.1) + `domain/patients.test.ts` (casos en sección 11).
- [ ] **A3 — Reservar desarchiva.** `createAppointment` y `setAppointmentStatus` (5.2). Agregar `patient: { …, updateMany: vi.fn() }` a los mocks de `appointments.test.ts` y `appointments-booking.test.ts`, con casos nuevos (sección 11).

### B. `packages/core`
- [ ] **B1 — `patient-archive.ts`** (formato, `archiveBlockedText`, `PATIENT_ARCHIVE_TEXT`) + test + export en `index.ts`.
- [ ] **B2 — Directorio.** `archivedAt` obligatorio en `PatientDirectoryInput`, descarte en `buildPatientDirectory`, `buildArchivedPatientList`. Actualizar el helper `input()` del test (`archivedAt: null`) y agregar casos.
- [ ] **B3 — `broadcastRecipients`** con la firma nueva + tests. (Este commit deja `apps/web` sin compilar hasta C5: hacer C5 inmediatamente después, o juntar B3 + C5 en un commit si el implementer prefiere que cada commit compile; recomendado juntarlos.)

### C. `apps/web`
- [ ] **C1 — Server actions de archivo** (`archivePatientAction`, `unarchivePatientAction`) + `createPatientAction` con `existingArchived` + tests en `pacientes/actions.test.ts` (agregar `archivePatient`/`unarchivePatient` al mock de `@nutri-bot/db/domain`).
- [ ] **C2 — Lista y vista Archivadas.** `pacientes/page.tsx` (consultas 6.1, `searchParams`), `patient-directory.tsx` (`archivedCount`), `archived-patient-list.tsx`.
- [ ] **C3 — Ficha.** `patient-archive-controls.tsx`, `archived-banner.tsx`, `patient-header.tsx`, `[id]/page.tsx`.
- [ ] **C4 — "Nuevo turno".** `listAppointmentPatientsAction` y `createAppointmentAction` (6.1) + tests en `(panel)/actions.test.ts`; `new-appointment-modal.tsx` solo si hace falta tipar `archived`.
- [ ] **C5 — Avisos.** `avisos/page.tsx` y `avisos/actions.ts` con el filtro y la firma nueva + test en `avisos/actions.test.ts` (ver B3).
- [ ] **C6 — «Nuevo paciente» con archivada.** `new-patient-sheet.tsx` (7.5).
- [ ] **C7 — Asistente IA.** `assistant-tools.ts` y descripciones en `asistente/actions.ts`.

### D. Cierre
- [ ] **D1 — Verificación completa** (sección 10) y `progress/impl_HU-019.md` con resultado, comandos y el recordatorio de migrar Neon.

## 10. Verificación

### 10.1 Lo que corre el implementer antes de `done` (desde la raíz)

```bash
npm run db:generate
(cd packages/db && npx dotenv -e ../../.env -- prisma migrate status)   # "Database schema is up to date"
npm run typecheck                       # TODOS los workspaces: core, db, web Y bot
npm run test                            # vitest de todo el monorepo (mocks, sin base ni red)
npx vitest run packages/core/src/patient-archive.test.ts packages/core/src/patient-directory.test.ts packages/core/src/outbox-text.test.ts
npx vitest run packages/db/domain/patients.test.ts packages/db/domain/appointments.test.ts packages/db/domain/appointments-booking.test.ts
npx vitest run "apps/web/src/app/(panel)/pacientes/actions.test.ts" "apps/web/src/app/(panel)/actions.test.ts" "apps/web/src/app/(panel)/avisos/actions.test.ts"
npx vitest run apps/bot                 # el bot usa createAppointment: sus tests tienen que seguir verdes
./ops/harness/verify.sh
docker compose exec -T db psql -U nutri -d nutribot -c '\d "Patient"'   # aparece archivedAt timestamp(3), nullable
```

Recorrido manual opcional en `npm run dev` (sin bot corriendo): **solo con una paciente de prueba
creada para eso** con «Nuevo paciente» (nombre "Prueba HU-019", número inventado), nunca con datos del
usuario. Archivar, ver "Archivadas (1)", desarchivar, "Deshacer". **No** usar "Enviar comunicado" (encola
mensajes reales). Al final la paciente de prueba queda archivada o se reporta su id en
`progress/impl_HU-019.md` para que el usuario decida: el implementer **no** la borra con filtros amplios.

### 10.2 Reglas que valen para el implementer

- **Migraciones:** solo `--create-only` + `npm run db:migrate`; nunca `migrate reset`, nunca aceptar el
  reset por drift, nunca `db push`, nunca `DATABASE_URL` como shadow ni `migrate diff --from-migrations`
  contra ella. `pg_dump` antes de aplicar. Drift → `blocked`.
- **Datos de dev:** no modificar ni archivar pacientes preexistentes. Cualquier prueba contra la base
  crea sus filas y las borra **por id** (o transacción que se revierte).
- **WhatsApp:** ninguna verificación encola en `OutboundMessage` a números reales; los tests de avisos
  y de `createAppointment` son con mocks. No correr el bot con el número real para esta HU.
- No tocar `backlog/`. Un commit por tarea, solo los archivos de la tarea.

### 10.3 Despliegue (producción = `develop` en Vercel + Neon)

El build de Vercel **no** migra. La migración es aditiva y compatible con el código viejo, así que el
orden es:
1. **Antes del merge a `develop`**, el usuario aplica la migración en Neon con la URL *unpooled* de
   producción (los valores de producción no los lee el agente; el comando lo corre el usuario):
   `cd packages/db && DATABASE_URL="<DATABASE_URL_UNPOOLED de prod>" npx prisma migrate deploy`
   (sin `dotenv`, para no tomar el `.env` local; `schema.prisma` solo lee `DATABASE_URL`)
   y confirma con `prisma migrate status` contra Neon.
2. Merge del PR a `develop` → Vercel publica.
3. Si se mergeara sin migrar, el panel en producción falla en `/pacientes`, "Nuevo turno" y `/avisos`
   (columna inexistente): migrar Neon de inmediato con el paso 1.

Dejarlo escrito en la descripción del PR.

## 11. Tests (vitest, todo con mocks)

**`packages/core/src/patient-archive.test.ts`**
- `formatArchivedDate`: "24/10/2026" en `America/Argentina/Buenos_Aires`; un instante 01:30 UTC del 25/10 da "24/10/2026" (zona, no UTC).
- `formatPendingAppointment`: mismo año → "jueves 30/10 a las 10:00"; otro año → "… 30/10/2027 a las …".
- `archiveBlockedText`: con nombre y `moreCount` 0 → texto exacto de la HU ("Ana tiene un turno el jueves 30/10 a las 10:00. Cancelalo antes de archivarla."); `moreCount` 2 → "… y 2 más. Cancelalos antes de archivarla."; `name` null → "Este contacto … archivarlo."; nombre compuesto usa el primer nombre.
- `PATIENT_ARCHIVE_TEXT`: `confirmTitle("Ana López")`, `confirmTitle(null)`, `archived`, `unarchived`, `banner`, `archivedSection(3)`, `phoneTakenArchived` exactos.

**`packages/core/src/patient-directory.test.ts`**
- `buildPatientDirectory` descarta archivadas (con y sin nombre); las activas no cambian.
- `buildArchivedPatientList`: orden con nombre alfabético, sin nombre al final por `archivedAt` desc; `title` = nombre / teléfono formateado / `HIDDEN_NUMBER_TEXT` para `@lid`; descarta `@newsletter`; `archivedLabel` "Archivada el dd/MM/yyyy"; las filas pasan por `matchesPatientQuery` (nombre y dígitos).

**`packages/core/src/outbox-text.test.ts`**
- `broadcastRecipients` descarta archivadas; mantiene sin repetidos y solo personas (casos actuales adaptados a la firma nueva); 10 activas + 2 archivadas → 10.

**`packages/db/domain/patients.test.ts`** (mock de `../index` con `$transaction` que pasa `tx`)
- Sin pendientes → `update` con `archivedAt: now`, devuelve `ok`; el `$queryRaw` del lock se llama **antes** del `findMany` de turnos.
- Con un `CONFIRMED` futuro → `pending_appointments`, `moreCount 0`, **sin** `update`.
- Con 3 pendientes (incluye `AWAITING_PAYMENT`) → `next` = el más cercano, `moreCount 2`.
- El `findMany` filtra `status in [CONFIRMED, AWAITING_PAYMENT]` y `startsAt gte now` (aserción sobre el `where`).
- Ya archivada → `ok` con la fecha original, sin `update`.
- Paciente inexistente → `not_found`.
- `unarchivePatient`: `updateMany` con `archivedAt: null`; count 0 → `not_found`.

**`packages/db/domain/appointments.test.ts` / `appointments-booking.test.ts`**
- `createAppointment` llama `tx.patient.updateMany({ where: { id, archivedAt: { not: null } }, data: { archivedAt: null } })` para `PROFESSIONAL` y para `PATIENT` (incluido el caso con seña `AWAITING_PAYMENT`).
- Si el horario no está disponible (`SlotUnavailableError`) **no** se llama a `updateMany`.
- `setAppointmentStatus` a `CONFIRMED` con turno futuro → `updateMany`; con turno pasado o a `COMPLETED`/`NO_SHOW` → no.

**`apps/web/src/app/(panel)/pacientes/actions.test.ts`**
- `archivePatientAction`: ok → `revalidatePath` de `/pacientes`, `/pacientes/<id>`, `/avisos`; `pending_appointments` → `{ ok:false, blocked:true, error }` con el texto de `archiveBlockedText`; `not_found`/excepción → `archiveError`; id vacío → error sin llamar al domain.
- `unarchivePatientAction`: ok y error.
- `createPatientAction` con teléfono de una archivada → no crea, `existingArchived: true`, `fieldErrors.phone` = `phoneTakenArchived`; con una activa → igual que hoy (`existingArchived` ausente o false).

**`apps/web/src/app/(panel)/actions.test.ts`**
- `listAppointmentPatientsAction` pide `where: { archivedAt: null }` y no devuelve archivadas (si el mock las devuelve igual, core las descarta).
- `createAppointmentAction` con número de una archivada → `error = phoneTakenArchived(label)`, `existingPatient.archived = true`, no crea turno.

**`apps/web/src/app/(panel)/avisos/actions.test.ts`**
- `broadcastMessageAction`: `findMany` con `where: { archivedAt: null }`; con mock que devuelve 10 activas + 2 archivadas → `createMany` con 10 filas y `sent: 10`.

## 12. Dudas técnicas

Ninguna bloqueante. Decisiones que el orquestador puede querer mostrar al usuario: T6 (sin filtro
defensivo en recordatorios), T11 (`HIDDEN_NUMBER_TEXT` en lugar de «Número oculto») y el orden de
despliegue de 10.3 (migrar Neon **antes** del merge).
