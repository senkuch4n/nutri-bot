# impl HU-019: Archivar pacientes

- **Estado:** done
- **Rama:** `feat/HU-019-archivar-pacientes` (al día con `origin/develop`: `git fetch` sin commits nuevos en develop)
- **SDD:** `Refactorizaciones/archivar-pacientes.md` · **HU:** `docs/hu-archivar-pacientes.md`
- **Skills:** `skills/migracion-prisma.md`, `apple-design`, `ui-ux-pro-max`, `web-design-guidelines` (autochequeo)
- **Implementer:** Claude Opus 5.5

## Commits (una tarea = un commit)

| Commit | Tarea |
|---|---|
| `43728a6` | A1: `Patient.archivedAt` + migración `20261024220056_patient_archived_at` |
| `e376a2b` | A2: `archivePatient` / `unarchivePatient` (`domain/patients.ts`) + `patients.test.ts` |
| `865fd64` | A3: `createAppointment` y `setAppointmentStatus` desarchivan + tests |
| `3db589f` | B1: `packages/core/src/patient-archive.ts` + test + export en `index.ts` |
| `6760480` | B2: `archivedAt` obligatorio en `PatientDirectoryInput`, `buildArchivedPatientList` (+ filtro `where: { archivedAt: null }` en los 2 llamadores web, ver desvíos) |
| `92bb88c` | B3 + C5 juntos (como recomienda la SDD): `broadcastRecipients` con firma nueva + `avisos/page.tsx` y `avisos/actions.ts` |
| `17fe479` | C1: `archivePatientAction`, `unarchivePatientAction`, `createPatientAction` con `existingArchived` + tests |
| `16b2f26` | C2: fila «Archivadas (N)», vista `/pacientes?vista=archivadas` (`archived-patient-list.tsx`) |
| `f335c13` | C3: menú «Más» (`patient-archive-controls.tsx`), banner (`archived-banner.tsx`), `patient-header.tsx`, `[id]/page.tsx` |
| `90f55e9` | C4: «Nuevo turno»: aviso de archivada, `existingPatient.archived`, `revalidatePath("/pacientes")` + tests |
| `ac5ca79` | C6: «Nuevo paciente»: botón «Desarchivar y abrir su ficha» |
| `b4afc4b` | C7: asistente IA (`archivada`, `archivada_el`, descripciones de tools) |

Este archivo (`progress/impl_HU-019.md`) queda **sin commitear**: lo decide el orquestador.

## Archivos

**Creados**
- `packages/db/prisma/migrations/20261024220056_patient_archived_at/migration.sql`
- `packages/db/domain/patients.test.ts`
- `packages/core/src/patient-archive.ts`, `packages/core/src/patient-archive.test.ts`
- `apps/web/src/app/(panel)/pacientes/archived-patient-list.tsx`
- `apps/web/src/app/(panel)/pacientes/[id]/patient-archive-controls.tsx`
- `apps/web/src/app/(panel)/pacientes/[id]/archived-banner.tsx`

**Modificados**
- `packages/db/prisma/schema.prisma`
- `packages/db/domain/patients.ts`, `appointments.ts`, `appointments.test.ts`, `appointments-booking.test.ts`
- `packages/core/src/patient-directory.ts` + `.test.ts`, `outbox-text.ts` + `.test.ts`, `index.ts`
- `apps/web/src/app/(panel)/pacientes/page.tsx`, `patient-directory.tsx`, `actions.ts`, `actions.test.ts`, `new-patient-sheet.tsx`
- `apps/web/src/app/(panel)/pacientes/[id]/page.tsx`, `patient-header.tsx`
- `apps/web/src/app/(panel)/actions.ts`, `actions.test.ts`
- `apps/web/src/app/(panel)/avisos/page.tsx`, `actions.ts`, `actions.test.ts`
- `apps/web/src/lib/assistant-tools.ts`, `apps/web/src/app/(panel)/asistente/actions.ts`

**No tocados** (como pide la SDD): `apps/bot/**`, `reminders.ts`, `payments.ts`, `lib/patient-session.ts`, `mensajes/**`, `backlog/**`, `progress/current-*.md`, `new-appointment-modal.tsx` (no hizo falta: `archived` se agrega al tipo pero el modal no lo necesita).

## Migración (dev)

1. Respaldo previo: `docker compose exec -T db pg_dump -U nutri -d nutribot > ~/nutribot-backup-HU019-202610241900.sql` (7,5 MB, fuera del repo).
2. `prisma migrate status` antes: 24 migraciones, "Database schema is up to date!" (sin drift).
3. `prisma migrate dev --create-only --name patient_archived_at` → SQL generado, idéntico al esperado en SDD 4.2:
   ```sql
   -- AlterTable
   ALTER TABLE "Patient" ADD COLUMN     "archivedAt" TIMESTAMP(3);
   ```
4. `npm run db:migrate` (aplicó sin pedir reset) y `npm run db:generate`.
5. `\d "Patient"` → `archivedAt | timestamp(3) without time zone | | |` (nullable). Las 21 pacientes existentes quedan activas (NULL). **No se modificó ni archivó ninguna paciente preexistente.**

## Verificación (sección 10.1)

| Comando | Resultado |
|---|---|
| `npm run db:generate` | Generated Prisma Client (v5.22.0) |
| `prisma migrate status` | Database schema is up to date! (25 migraciones) |
| `npm run typecheck` | limpio en core, db, **bot** y web |
| `npm run test` | 155 archivos, 2414 tests, todos verdes |
| vitest core (`patient-archive`, `patient-directory`, `outbox-text`) + db (`patients`, `appointments`, `appointments-booking`) + web (`pacientes/actions`, `(panel)/actions`, `avisos/actions`) | 9 archivos, 136 tests verdes |
| `npx vitest run apps/bot` | 7 archivos, 50 tests verdes |
| `./ops/harness/verify.sh` | "Arnés OK". Un WARN de recordatorio "Se tocó el bot" (lo dispara el cambio en `packages/db/domain/appointments.ts`, que usa el bot; `apps/bot` no cambió). No se encoló nada en `OutboundMessage`: todos los tests son con mocks |
| `npm run lint --workspace apps/web` | No ESLint warnings or errors |

Recorrido manual en `npm run dev`: **no se hizo** (es opcional en la SDD). No se creó ninguna paciente de prueba en la base de desarrollo; no hay ids que limpiar.

## Contrato compartido (SDD §5): coincide

- `packages/db/domain/patients.ts`: `PendingAppointmentStatus`, `ArchivePatientResult`, `archivePatient(patientId, now?)`, `unarchivePatient(patientId)` con las firmas y el orden exacto de 5.1 (lock `SELECT id FROM "Professional" WHERE id = 1 FOR UPDATE` → `findUnique` → `findMany` de pendientes → idempotencia → `update`). Exportadas por `export * from "./patients"`.
- `appointments.ts`: firmas sin cambios. Después de `tx.appointment.create` se llama `tx.patient.updateMany({ where: { id, archivedAt: { not: null } }, data: { archivedAt: null } })` (helper interno `unarchiveInTx`); `setAppointmentStatus` hace lo mismo con `status === "CONFIRMED" && prev.startsAt >= new Date()`.
- core: `PatientDirectoryInput.archivedAt: Date | null` (obligatorio), `ArchivedPatientInput`, `ArchivedPatientRow`, `buildArchivedPatientList(input, tz)`, `broadcastRecipients(patients: { whatsappJid, archivedAt }[])`, `formatArchivedDate`, `formatPendingAppointment`, `archiveBlockedText`, `PATIENT_ARCHIVE_TEXT` (todas las claves y textos de 5.3; `CONFIRM_DESCRIPTION` interna).
- web: `ArchivePatientActionResult`, `archivePatientAction`, `unarchivePatientAction`, `CreatePatientState.existingArchived`, `CreateAppointmentResult.existingPatient.archived`.

## Desvíos de la SDD y decisiones no obvias

1. **B2 incluye el filtro en los dos llamadores web** (`pacientes/page.tsx` y `listAppointmentPatientsAction`): `where: { archivedAt: null }` + `select.archivedAt` + `archivedAt` en el input. Al hacer `archivedAt` obligatorio, sin esto el commit B2 no compilaba en web. C2 y C4 suman el resto (vista archivadas, aviso de alta, tests).
2. **Contador «Archivadas (N)»**: se calcula con `buildArchivedPatientList(...).length` (no con `rows.length` crudo de la consulta), para que coincida con lo que lista la vista (que descarta canales/grupos).
3. **Banner**: superficie `bg-card` + `shadow-card` (la misma de `GroupedList`) en vez de gris `bg-secondary`: con fondo gris, el botón «Desarchivar» (`variant="secondary"`, gris) quedaba con poco contraste. Es neutro, no rojo, como pide 7.2. Botón tamaño `md` (44 px).
4. **Vista Archivadas**: el «Volver a pacientes» usa el `back` de `PageHeader` (mismo estilo que el «‹ Pacientes» de la ficha). Cada fila muestra `title` y, como descripción, `archivedLabel` (+ teléfono si tiene nombre). Las sin nombre van con el título en gris, como en el resto del panel.
5. **Menú «Más»** queda a la derecha del botón WhatsApp; si el contacto no tiene número (`@lid`), el menú queda solo. `name` se pasa recortado (`trim() || null`); `contactLabel` = teléfono formateado o `HIDDEN_NUMBER_TEXT` (T11).
6. **«Nuevo turno» con una archivada**: además del `FormError` con «Ese número es de Ana López, que está archivada.», el `PatientPicker` sigue mostrando su propio aviso amarillo («Ese número es de Ana López» + «Elegir a Ana»), igual que con una activa. Sin cambios de UI, como dice SDD 7.6. Quedan dos líneas parecidas; si molesta, se puede pasar `archived` a la opción y cambiar el texto del picker.
7. `archivePatientAction` usa el mismo `now` para el chequeo y para el texto bloqueado. `getProfessional()` sale de `@nutri-bot/db/domain`, como ya importaba ese archivo.
8. Tests de `setAppointmentStatus` (T5): se agregaron a `appointments.test.ts` (no había tests de domain para esa función). El mock suma `appointment.findUniqueOrThrow` y `consultation.{create,deleteMany}`.

## Pendiente del usuario: producción (SDD 10.3)

**No se aplicó nada en Neon ni se leyeron credenciales de producción.** Antes de mergear el PR a `develop`:

```bash
cd packages/db && DATABASE_URL="<DATABASE_URL_UNPOOLED de prod>" npx prisma migrate deploy
DATABASE_URL="<DATABASE_URL_UNPOOLED de prod>" npx prisma migrate status
```

La migración es aditiva (columna nullable) y compatible con el código actual de producción. Si se mergea sin migrar, `/pacientes`, «Nuevo turno» y `/avisos` fallan en producción (columna inexistente). Esto tiene que ir en la descripción del PR.

## Bloqueos

Ninguno.
