# impl HU-003 `consulta-entidad-central`

**Estado: done.** Rama `hu-003-consulta-entidad-central`, sin commitear, `backlog.json` sin tocar.

## Restricciones de la SDD §13 (copiadas)

1. **Datos de desarrollo:** ningún dato de negocio preexistente se borra ni cambia de valor. La única escritura sobre datos existentes es el backfill 3.3, que solo hace `INSERT` de consultas y `UPDATE` de `consultationId`. Las pruebas usan datos propios y limpian por id.
2. **Prisma:** siguen las prohibiciones de 11. Si hay drift, `blocked` con la salida de `migrate status`.
3. **WhatsApp:** ninguna verificación manda mensajes reales. El script no usa `createAppointment` ni `cancelAppointment` y comprueba que no se encoló nada.
4. **Dominio compartido:** crear o quitar la consulta al cambiar el estado vive **solo** en `setAppointmentStatus` (`packages/db/domain`), no en la server action.
5. **`useConfirm`:** nunca `await confirm()` dentro de `<form action>` ni de `startTransition`.
6. **UI:** solo el sistema de diseño actual. Sin colores ni tokens nuevos. `tailwind.config.ts` no se toca.
7. **Rama** `hu-003-consulta-entidad-central`, sin commitear, sin tocar `backlog.json`.

Todas se cumplieron. `tailwind.config.ts`, `apps/bot/**`, `(portal)/**`, `seed*.ts` y migraciones previas: sin tocar.

## Respaldo previo a la migración

`pg_dump` → `/private/tmp/claude-501/-Users-joelmiguelserrudo-Documents-Projects-Nutri-Bot/95bd3b1f-af2d-449f-b816-a2a22d5cd1a4/scratchpad/backup-antes-HU-003.sql`
Tamaño: **71198 bytes, 1474 líneas** (exit 0, no vacío). No se restauró.

## Migración `20260924072056_consultation_entity`

- `migrate status` antes: "10 migrations found … Database schema is up to date!".
- SQL generado por Prisma: **idéntico** a SDD §3.2 (1 `ADD COLUMN` nullable, `CREATE TABLE "Consultation"`, 4 índices, 4 FKs). Sin `DROP`, sin `ALTER TYPE`, sin cambios en otras columnas.
- Backfill §3.3 agregado al final, **textual** (copiado con `sed` de las líneas 181–252 de la SDD).
- Ensayo previo (decisión propia, sin efecto): corrí todo `migration.sql` dentro de `BEGIN; … ROLLBACK;` para detectar errores de SQL antes de que Prisma registrara una migración fallida. Dio `INSERT 0 6`, `INSERT 0 12`, `UPDATE 15` y se revirtió (verificado: la tabla no existía después).
- Aplicada con `npm run db:migrate` (sin drift ni ofrecimiento de reset) + `npm run db:generate`.
- `migrate status` después: "11 migrations found … up to date".

### A. Antes (BEGIN READ ONLY … ROLLBACK)

```
BEGIN
 patients | entries | appts | completed | plans 
----------+---------+-------+-----------+-------
       10 |      15 |    16 |         6 |     5
(1 row)

         patientId         | count 
---------------------------+-------
 cmtyq7tys0000xnwszq8d9maa |     3
 cmtyq7tzm0017xnwskwm1ttlb |     5
 cmtyq7u00002cxnws8pfz9e2p |     2
 cmtyq7u07003dxnwssti9gv8c |     2
 cmtyq7u0b003sxnws1tn1wgir |     3
(5 rows)

             evo_hash             
----------------------------------
 c2cc8553800957219695c1cbdb8be79c
(1 row)

            appt_hash             
----------------------------------
 af17f5fb307fa754d6ec2041666e06f4
(1 row)

            plan_hash             
----------------------------------
 d9cec6d3115cd23a8ec0a4de2ae349ae
(1 row)

           patient_hash           
----------------------------------
 41e046bef051c0453e989628737597e2
(1 row)

 de_turno | sin_turno 
----------+-----------
        6 |        12
(1 row)

ROLLBACK
```

Pronóstico A3 = 6 + 12 = 18, igual al del architect.

### C. Después (BEGIN READ ONLY … ROLLBACK)

```
BEGIN
 patients | entries | appts | completed | plans 
----------+---------+-------+-----------+-------
       10 |      15 |    16 |         6 |     5
(1 row)

         patientId         | count 
---------------------------+-------
 cmtyq7tys0000xnwszq8d9maa |     3
 cmtyq7tzm0017xnwskwm1ttlb |     5
 cmtyq7u00002cxnws8pfz9e2p |     2
 cmtyq7u07003dxnwssti9gv8c |     2
 cmtyq7u0b003sxnws1tn1wgir |     3
(5 rows)

             evo_hash             
----------------------------------
 c2cc8553800957219695c1cbdb8be79c
(1 row)

            appt_hash             
----------------------------------
 af17f5fb307fa754d6ec2041666e06f4
(1 row)

            plan_hash             
----------------------------------
 d9cec6d3115cd23a8ec0a4de2ae349ae
(1 row)

           patient_hash           
----------------------------------
 41e046bef051c0453e989628737597e2
(1 row)

 de_turno | sin_turno | total 
----------+-----------+-------
        6 |        12 |    18
(1 row)

 sueltas 
---------
       0
(1 row)

 completed_sin_consulta 
------------------------
                      0
(1 row)

 incoherentes 
--------------
            0
(1 row)

 patientId | day | count 
-----------+-----+-------
(0 rows)

 inventadas 
------------
          0
(1 row)

ROLLBACK
```

- C1: mismos conteos (10/15/16/6/5) y mismo desglose por paciente.
- C2: las 4 huellas **idénticas** a A2 (evo `c2cc8553…`, appt `af17f5fb…`, plan `d9cec6d3…`, patient `41e046be…`).
- C3: 6 de turno + 12 sin turno = 18 = pronóstico. C4 = 0, C5 = 0, C6 = 0, C7 = 0 filas, C8 = 0.

### D. Idempotencia (bloque 3.3 dentro de BEGIN … ROLLBACK)

```
BEGIN
INSERT 0 0
INSERT 0 0
UPDATE 0
ROLLBACK
```

### Al final de todo (después de los scripts de prueba)

C1–C8 se volvieron a correr: salida **byte a byte idéntica** a la post-migración (`diff` vacío). `select count(*) from "Consultation"` = **18**. Los scripts no dejaron restos.

## Archivos

**Creados**
- `packages/core/src/consultations.ts`, `packages/core/src/consultations.test.ts`
- `packages/db/prisma/migrations/20260924072056_consultation_entity/migration.sql`
- `packages/db/domain/consultations.ts`
- `packages/db/scripts/test-consultations.ts` (la SDD lo lista en "Crear": se conserva)
- `apps/web/src/lib/evolution-rows.ts`
- `apps/web/src/app/(panel)/pacientes/[id]/consultation-actions.ts`, `measure-form-data.ts`, `measurement-fields.tsx`, `consultations-section.tsx`, `consultation-date-sheet.tsx`
- `apps/web/src/app/(panel)/pacientes/[id]/consultas/[consultationId]/page.tsx`, `loading.tsx`, `consultation-measurements.tsx`, `consultation-plan.tsx`, `consultation-notes.tsx`, `delete-consultation-button.tsx`

**Modificados**
- `packages/core/src/index.ts`
- `packages/db/prisma/schema.prisma` (+28 líneas, solo agregados; **no** usé el resultado de `prisma format`, que reformateaba todo el archivo)
- `packages/db/domain/index.ts`, `appointments.ts`, `clinical.ts`, `nutritionPlans.ts`
- `apps/web/src/app/(panel)/actions.ts`, `appointment-detail-sheet.tsx`, `calendar-client.tsx`
- `apps/web/src/app/api/appointments/route.ts`
- `apps/web/src/app/(panel)/pacientes/[id]/page.tsx`, `patient-tabs.tsx`, `clinical-actions.ts`, `evolution-form.tsx`, `evolution-section.tsx`, `evolution-table.tsx`, `evolution-types.ts`, `appointments-section.tsx`, `plans-section.tsx`

Páginas temporales para el recorrido: **ninguna** (la SDD no pide ninguna). Scripts sueltos: ninguno; los SQL de verificación quedaron solo en el scratchpad y los que copié al contenedor (`/tmp/*.sql`) los borré.

## Verificación (§11)

| Comando | Resultado |
|---|---|
| `git branch --show-current` | `hu-003-consulta-entidad-central` |
| `prisma migrate status` | 11 migraciones, up to date |
| `npm run db:generate` | OK |
| `npm run test` | 8 archivos, **92 tests OK** (36 nuevos en `consultations.test.ts`) |
| `npm run typecheck` | core, db, **bot** y web limpios |
| `tsx scripts/test-consultations.ts` | 9 pasos `ok` + `OK` |
| `npm run test:confirm-flow --workspace apps/bot` | 5/5 escenarios OK (usa su jid de prueba `5490000000001`, limpia lo suyo) |
| C1–C8 de nuevo | idénticos; `Consultation` = 18 |
| `./ops/harness/verify.sh` | "Arnés OK" (solo el WARN esperado de "hay migraciones nuevas") |

No se levantó `next dev`, ni el bot, ni `next build`. No se corrieron seeds.

Salida del script de dominio:
```
ok  COMPLETED crea la consulta y es idempotente
ok  CONFIRMED con consulta vacía la borra
ok  CONFIRMED con contenido la conserva y COMPLETED reusa la misma
ok  NO_SHOW no crea consulta
ok  createManualConsultation / updateManualConsultationDate
ok  addEvolutionEntryOnDay
ok  createPlanForConsultation / setConsultationPlan
ok  deleteConsultation
ok  sin OutboundMessage de estos turnos
OK
```

## Contrato compartido (§4): confirmación

- **core** (§4.1): `ANTHROPOMETRY_MEASURE_KEYS`, `BIOIMPEDANCE_MEASURE_KEYS`, `AnthropometryMeasureKey`, `BioimpedanceMeasureKey`, `MeasurementValues`, `measurementKinds`, `ConsultationChip`, `consultationChips`, `isConsultationEmpty`, `canDeleteConsultation`, `CONSULTATION_NOTES_MAX`, `CONSULTATION_TEXT` (textos exactos), `isValidDayKey`, `isFutureDayKey`, `dayKeyToNoonUtc`, `dayRangeUtc`, `pickConsultationForDay`: nombres y firmas **iguales** a la SDD. Sin choques de nombres en `index.ts`.
- **db/domain** (§4.2): las 4 clases de error, `ConsultationWithRelations`, `listPatientConsultations`, `getConsultation`, `listConsultationsOnDay`, `createManualConsultation`, `updateManualConsultationDate`, `saveConsultationNotes`, `setConsultationPlan`, `createPlanForConsultation`, `deleteConsultation`, `findOrCreateConsultationForDay`: firmas iguales.
- **clinical** (§4.3): `EvolutionMeasures`, `addEvolutionEntryOnDay`, `addEvolutionEntryToConsultation` iguales. `addEvolutionEntry` **eliminada** (su único consumidor se migró).
- **appointments** (§4.4): `setAppointmentStatus` con el retorno `{ appointment, consultation, removedEmptyConsultation }` (tipo exportado como `SetAppointmentStatusResult`, nombre auxiliar extra).
- **nutritionPlans** (§4.5): `listPatientPlans` con `include.consultations` (select id/consultedAt, asc, take 1).
- **web** (§5): actions con los nombres de §5.2; `ConsultationFormState` igual; `setStatusAction` devuelve `ActionResult & { consultation? }`; `ActionState` suma `message?`; API suma `patientId` y `consultation: { id, hasContent } | null`.

## Decisiones no obvias

1. **Reintento por P2002 en `setAppointmentStatus`:** la SDD dice reintentar una vez "con `findUnique({ where: { appointmentId } })`". Como el `P2002` revierte **toda** la transacción (incluido el `update` del estado), reintento la transacción completa una vez: en el segundo intento la consulta ya existe y devuelve `created: false`. Así el estado queda aplicado.
2. **Cambio de comportamiento en Evolución (§4.3, anotado):** la fecha antes era `new Date(\`${day}T12:00:00\`)` en hora del server; ahora `dayKeyToNoonUtc(day, Professional.timezone)` (mismo instante con el server en ART). Las fechas futuras se rechazan con "La fecha de la medición no puede ser futura". El `max` del date y el default usan `todayKey` en la zona de la profesional (antes era `toISOString()`, UTC).
3. **`deleteEvolutionEntryAction`:** además de leer `consultationId` para revalidar el detalle, ahora verifica que la medición sea del `patientId` del form antes de borrar (endurecimiento; con datos válidos se comporta igual).
4. **`parseMeasuresFromForm`** también arma `note` (trim, vacío → null). `addEvolutionEntryAction` conserva el zod previo (note ≤ 2000 → "Datos inválidos").
5. **`MeasurementFields`** recibe `leading` (campo Fecha) y `submit` (botón), para que la fila superior mantenga exactamente la grilla de antes en Evolución (`10rem 9rem 1fr auto`) y una sin fecha en el detalle. Los 18 `name`, `step`, `min` y `placeholder` son los mismos.
6. **Pestaña Consultas:** el botón "Nueva consulta" del encabezado de la Card se muestra solo si hay consultas; en el estado vacío va solo el del `EmptyState` (evita dos botones iguales en pantalla).
7. **Sheet de fecha:** el formulario se remonta al abrir (sin error ni aviso viejo). Cuando vuelve `existingConsultationId`, el aviso D5 reemplaza al error en línea (mismo texto, no se repite). "Abrir consulta" del aviso cierra el sheet.
8. **Panel del turno:** "Marcar completado" usa `run(..., success: (res) => …, { keepOpen: true, onSuccess })` y llama a `onUpdated` (=`setSelected`). "Volver a confirmado" pide `confirm` en el handler, **antes** de `run` y fuera de cualquier transición. Revisé todos los `await confirm()` nuevos (panel del turno, borrar medición, eliminar consulta): ninguno está dentro de `<form action>` ni de `startTransition`.
9. **Servicio de prueba** del script creado con `active: false`, para que no aparezca en el menú del bot si está corriendo.
10. **"Abrir plan"** usa el ícono `ClipboardList` (es un link interno; `ExternalLink` sugería otra pestaña).
11. `setStatusAction` revalida `/pacientes/[id]` cuando hay consulta **o** cuando se borró una vacía (así la pestaña no muestra una consulta que ya no existe).

## Skills de UI

- `ui-ux-pro-max`: consultado antes del JSX (feedback de envío con loading, errores en línea, confirmación de acciones destructivas, estado deshabilitado con explicación).
- `ui-styling`: aplicado sobre los componentes existentes (`Card`, `DataTable`, `Sheet`, `Badge`, `Alert`, tokens semánticos). Sin tokens ni colores nuevos.
- `web-design-guidelines` (autochequeo): corregí `aria-controls` en "Agregar medición" y `break-words` en nota y título del plan. Resto OK: botones de ícono con `aria-label`, íconos `aria-hidden`, jerarquía h1/h2/h3, estados de carga con "…", `tabular-nums` en fechas, links para navegar, confirmación en acciones destructivas, borrar consulta deshabilitado con texto de ayuda enlazado por `aria-describedby`.

## Pendiente para el orquestador

- Recorrido §12 en `localhost:3000` (no lo hice: no se levanta `next dev`).
