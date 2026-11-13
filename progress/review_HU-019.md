# Review — HU-019

**Veredicto:** APPROVED

Revisado: `git diff develop...HEAD` (commits `43728a6`..`b4afc4b`, más `4567f83`/`d9d5de6` del arnés),
contra `Refactorizaciones/archivar-pacientes.md`, `docs/hu-archivar-pacientes.md` (D1–D12 según §7) y
`CHECKPOINTS.md`. Comandos corridos por el reviewer (no se tocó la base):

- `npm run typecheck` → exit 0 (core, db, bot, web).
- `npm run test` → 155 archivos, 2414 tests, exit 0.
- `./ops/harness/verify.sh` → "Arnés OK", exit 0 (solo el WARN informativo "Se tocó el bot", disparado por `packages/db/domain/appointments.ts`; `apps/bot/**` no cambia).

## Puntos de atención pedidos

**Carrera D3 / lock.** `packages/db/domain/patients.ts:76-107`: `archivePatient` corre dentro de
`prisma.$transaction`, toma `SELECT id FROM "Professional" WHERE id = 1 FOR UPDATE` (el mismo lock que
`createAppointment`, `appointments.ts:59-60`) **antes** de leer la paciente y los pendientes; con
pendientes devuelve `pending_appointments` sin escribir; idempotente (no pisa `archivedAt`). Orden
exacto de SDD 5.1. El test `patients.test.ts` verifica lock → findMany y el SQL del lock.

**Reservar desarchiva (web y bot).** `appointments.ts:22-27` (`unarchiveInTx`, `updateMany` con
`archivedAt: { not: null }`), llamado dentro de la transacción después de `tx.appointment.create`
(`appointments.ts:81-83`), así que vale para `PROFESSIONAL`, `PATIENT` y `AWAITING_PAYMENT`, y no corre
si `checkSlotAvailable` tira `SlotUnavailableError`. `setAppointmentStatus` desarchiva solo con
`CONFIRMED` y `prev.startsAt >= now` (`appointments.ts:227-231`). Firmas sin cambios: bot compila y sus
tests pasan. No hay otros creadores de `Appointment` ni otros caminos a `CONFIRMED` en código de
producción salvo `payments.ts` (`AWAITING_PAYMENT → CONFIRMED`, ya cubierto porque `AWAITING_PAYMENT`
futuro bloquea el archivado y la reserva con seña ya desarchivó).

**Filtro en todos los listados.** Inventario de `prisma.patient.findMany` en web/db/bot:
- Lista `/pacientes`: `pacientes/page.tsx:34` (`where: { archivedAt: null }`) + descarte en core (`patient-directory.ts:81`).
- Buscador de Nuevo turno: `(panel)/actions.ts:131-132`, `archivedAt` en el input (`:163`).
- `/avisos` page: `avisos/page.tsx:37` + `broadcastRecipients(patients)`; la consulta de nombres del historial (`:49`) sin filtrar, como pide la SDD.
- `/avisos` action: `avisos/actions.ts:21-28`.
- Asistente IA: sin filtro (D11), `archivada` / `archivada_el` en `lib/assistant-tools.ts:26-28,52`.
- `mensajes/page.tsx:37` (por ids, sin cambios, HU §5).
`archivedAt` obligatorio en `PatientDirectoryInput` y `broadcastRecipients` con la firma nueva: `tsc` obliga a los llamadores.

**Portal y recordatorios sin cambios (T6, T9).** El diff no toca `lib/patient-session.ts`,
`packages/db/domain/reminders.ts`, `payments.ts`, `mensajes/**` ni `apps/bot/**`.

**Migración.** `20261024220056_patient_archived_at/migration.sql`: un único
`ALTER TABLE "Patient" ADD COLUMN "archivedAt" TIMESTAMP(3);`, nullable, sin default ni backfill
(filas existentes quedan activas), coherente con `schema.prisma:71-72`. Nada destructivo. Compatible con
el código de producción actual (el cliente viejo no conoce la columna y no la necesita).

**Tests con mocks.** `patients.test.ts`, `appointments.test.ts`, `appointments-booking.test.ts`,
tests de core y de las tres actions de web: todos con `vi.mock`, sin base ni red. Cubren los casos de
SDD §11 (lock antes de findMany, `moreCount`, idempotencia, `not_found`, desarchivar en reserva con y
sin seña, no desarchivar con slot ocupado, T5 futuro/pasado, 10 activas + 2 archivadas → 10, alta con
archivada en Nuevo paciente y Nuevo turno).

## Desvíos declarados por el implementer

1. Filtro en los llamadores web dentro de B2: necesario para que el commit compile. Aceptable.
2. Contador «Archivadas (N)» con `buildArchivedPatientList(...).length` (`pacientes/page.tsx:75`): coincide con lo que muestra la vista. Aceptable (mejor que el `rows.length` crudo).
3. Banner `bg-card` + `shadow-card` en lugar de gris: sigue neutro, no rojo (SDD 7.2). Aceptable.
4. `PageHeader back` para «Volver a pacientes», teléfono en la descripción de filas con nombre. Aceptable.
5. Menú «Más» junto a WhatsApp, solo cuando no hay número. Aceptable.
6. Nuevo turno muestra el `FormError` de archivada y además el aviso propio del picker: SDD 7.6 dice "sin cambios de UI". Aceptable; ver dudas.
7–8. Mismo `now` en chequeo y texto; tests de `setAppointmentStatus` en `appointments.test.ts`. Aceptables.

## Checkpoints

### C1 — El arnés está sano
- backlog válido, 1 HU activa por responsable: [x] (verify.sh: "senkuch4n: HU-019")
- `progress/current-senkuch4n.md` refleja la HU: [x]
- No toca archivos de HU de la otra persona: [x]
- `verify.sh` exit 0: [x]

### C2 — Cadena de documentos
- `docs/hu-archivar-pacientes.md` completa con dudas validadas: [x] ("Resolución (2026-10-24)")
- `Refactorizaciones/archivar-pacientes.md` con workspaces, checklist y contrato: [x]
- Firmas y nombres coinciden con el Contrato compartido: [x] (`patients.ts:57-120`, `patient-directory.ts` `ArchivedPatientInput/Row`, `buildArchivedPatientList`, `outbox-text.ts:65-67`, `patient-archive.ts` con todas las claves y textos de 5.3, `pacientes/actions.ts` `ArchivePatientActionResult`/`archivePatientAction`/`unarchivePatientAction`/`existingArchived`, `(panel)/actions.ts:35` `existingPatient.archived`)

### C3 — Arquitectura
- Lógica pura en core, operaciones compartidas en `packages/db/domain`: [x]
- Schema/domain cambiado → web y bot compilan, consumidores ajustados: [x]
- Migración coherente, no destructiva, nullable: [x]
- Rutas del panel protegidas por auth / portal sin cambios: [x] (`?vista=archivadas` y las server actions viven bajo el matcher de `middleware.ts`; mismo patrón que el resto de `(panel)`; portal intacto)
- Bot en silencio y textos según SDD: [x] (ningún texto de WhatsApp cambia; `apps/bot/src` intacto)
- Sin `console.log` de debug ni TODOs: [x]

### C4 — Verificación real
- `npm run typecheck` limpio: [x]
- Lógica nueva de core con tests y `npm run test` verde: [x] (`patient-archive.test.ts`, `patient-directory.test.ts`, `outbox-text.test.ts`)
- Flujo del bot: [x] N/A en código del bot; `createAppointment` cubierto con mocks y tests de `apps/bot` verdes. Sin encolados reales.
- PDF/documento: [x] N/A

### C5 — Cierre
- `progress/impl_HU-019.md` existe y describe lo tocado: [x] (sin commitear; lo decide el orquestador)
- `progress/review_HU-019.md` con veredicto: [x]
- Sin scripts sueltos ni datos de prueba: [x] (el implementer declara que no creó pacientes de prueba; no hay scripts nuevos en el diff)

## Cambios requeridos

Ninguno.

## Dudas (no bloqueantes)

- La rama incluye `4567f83` ("Arnés: el lock pasa de Notion a issues de GitHub", toca `AGENTS.md` y `CLAUDE.md`), que no está en `develop` y no es parte de la HU. Va a viajar en el mismo PR: conviene mencionarlo en la descripción o separarlo en un PR propio.
- Nuevo turno con número de archivada: se ven dos avisos parecidos (el `FormError` "…que está archivada." y el aviso del `PatientPicker` "Ese número es de Ana López / Elegir a Ana"). Cumple SDD 7.6; si molesta, pasar `archived` al picker en una tarea directa.
- `pendingBlockedText` se calcula al cargar la ficha (`pacientes/[id]/page.tsx:87-92`): si el turno se cancela en otra pestaña, el aviso sigue saliendo hasta refrescar. Es el diseño de la SDD (7.1); el chequeo autoritativo sigue en el servidor.
- T11: sin número visible se usa `HIDDEN_NUMBER_TEXT` ("WhatsApp no muestra el número") y no el literal «Número oculto» de la HU. Ya lo marcó la SDD como decisión para el usuario.
- Producción: migrar Neon **antes** del merge (SDD 10.3); tiene que ir en la descripción del PR.
