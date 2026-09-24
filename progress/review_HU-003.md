# Review — HU-003

**Veredicto:** APPROVED

Primer intento. Rama `hu-003-consulta-entidad-central`, cambios sin commitear. Revisé contra
`Refactorizaciones/consulta-entidad-central.md` (SDD) y las "Resoluciones" de
`docs/hu-consulta-entidad-central.md`. Todos los comandos y consultas los corrí yo. Las consultas a
la base fueron `BEGIN READ ONLY … ROLLBACK`.

## Verificación propia

| Comando | Resultado |
|---|---|
| `npm run typecheck` | core, db, bot y web en verde (exit 0) |
| `npm run test` | 8 archivos, 92 tests OK (36 en `consultations.test.ts`) |
| `./ops/harness/verify.sh` | exit 0, "Arnés OK" (solo el WARN esperado de migración nueva) |
| `prisma migrate status` | 11 migraciones, "Database schema is up to date!"; `consultation_entity` terminada, sin rollback |

No corrí `test-consultations.ts` ni `test:confirm-flow` porque escriben en la base y esta revisión
es de solo lectura. Leí el script completo (ver C4).

### Migración y backfill (solo lectura, sobre la base de desarrollo)
- SQL generado (`migrations/20260924072056_consultation_entity/migration.sql`, líneas 1-44):
  igual a SDD §3.2. 1 `ADD COLUMN` nullable, 1 `CREATE TABLE`, 4 índices y 4 FKs. No hay `DROP`,
  `ALTER TYPE` ni cambios en otras columnas. Los `NOT NULL` están todos en la tabla nueva.
- Backfill (líneas 47-117): copia textual de SDD §3.3. Solo hace `INSERT … ON CONFLICT DO NOTHING`
  / `NOT EXISTS` y `UPDATE` de `consultationId` con `IS NULL`. No tiene `DELETE`.
- Conteos: 10 pacientes, 15 mediciones, 16 turnos, 6 `COMPLETED`, 5 planes y 4 `OutboundMessage`.
  Hay **18 consultas** (6 de turno y 12 sin turno), las 18 con id `mig003_`: ninguna quedó de las
  pruebas.
- **15/15** `EvolutionEntry` tienen `consultationId`.
- 0 mediciones vinculadas a otro paciente o a otro día local (`America/Argentina/Buenos_Aires`,
  tomado de `Professional`).
- Regla D1: 3 mediciones caen en días con exactamente un turno `COMPLETED` y las 3 quedaron en la
  consulta de ese turno. Ninguna medición de otro día quedó en una consulta de turno.
- 0 turnos `COMPLETED` sin consulta. Toda consulta de turno tiene `consultedAt = startsAt` y el
  mismo paciente.
- 0 consultas con `planId` o `notes` (no se inventó contenido). No hay duplicados "Sin turno" por
  paciente y día.
- Huellas md5 **idénticas** a las documentadas por el implementer antes de migrar: evo
  `c2cc8553…`, appt `af17f5fb…`, plan `d9cec6d3…`, patient `41e046be…`. Ningún valor viejo cambió.
- Idempotencia, verificada en seco: el paso 1 insertaría 0 filas y los pasos 2 y 3 no tienen
  mediciones sueltas sobre las que actuar (0).
- No queda nada de las pruebas: no hay paciente `test-hu003%` ni servicio `HU-003`.

## Checkpoints
- C1 backlog válido, 1 HU activa (HU-003 `en_revision`, `intentos_revision` 0): [x]
- C1 `progress/current.md` refleja la HU en curso (líneas 73-75): [x]
- C1 `verify.sh` exit 0: [x]
- C2 `docs/hu-consulta-entidad-central.md` completa, con Resoluciones: [x]
- C2 SDD con workspaces, checklist atómico y contrato compartido: [x]
- C2 firmas y nombres del diff = contrato: [x]. core §4.1, domain §4.2-4.5 y actions §5.2 coinciden.
  El único agregado es el tipo auxiliar `SetAppointmentStatusResult` (`packages/db/domain/appointments.ts:133`).
- C3 lógica pura en core y operaciones de base en `packages/db/domain`, sin duplicar: [x]. El
  alta y la baja de la consulta al cambiar el estado del turno viven solo en `setAppointmentStatus`
  (`appointments.ts:147-208`), en una transacción. La action (`(panel)/actions.ts:78-93`) solo la
  llama.
- C3 web y bot compilan, con todos los consumidores ajustados: [x]. El bot no llama a
  `setAppointmentStatus` ni a `addEvolutionEntry`, y ningún camino del bot pone o saca `COMPLETED`
  (revisé con grep `conversation.ts`, `reminders.ts`, `payments.ts` y `gcal.ts`). `addEvolutionEntry`
  se eliminó y su único consumidor se migró.
- C3 migración coherente, aditiva, sin `NOT NULL` sobre tablas con filas: [x]
- C3 rutas nuevas protegidas y portal solo con datos propios: [x]. El matcher de
  `middleware.ts` cubre `/pacientes/**`. El detalle hace `notFound()` si
  `consultation.patientId !== id` (`consultas/[consultationId]/page.tsx:37`). Todas las actions de
  `consultation-actions.ts` verifican que la consulta pertenezca al paciente (`belongsToPatient`,
  líneas 46-49), y la de borrar una medición verifica además `entry.consultationId` (línea 227).
  `(portal)` no se tocó.
- C3 bot en silencio, sin textos nuevos: [x]. `apps/bot` sin diff, y no se encola nada en
  `OutboundMessage`.
- C3 sin `console.log` de debug ni TODOs: [x]. Los `console.log` del script de prueba son la salida
  esperada.
- C4 `npm run typecheck` limpio: [x]
- C4 lógica nueva de core con tests y `npm run test` en verde: [x]. Cubre todos los casos de §10.1,
  incluidos el borde nocturno en ART y el `2026-02-30`.
- C4 flujo del bot simulado sin WhatsApp real: [x] (N/A: el flujo del bot no cambió). Script
  `packages/db/scripts/test-consultations.ts`: los turnos se crean con `prisma.appointment.create`
  directo, sin `createAppointment` (líneas 71-87). Comprueba que no haya `OutboundMessage` (líneas
  227-232). En el `finally` (líneas 235-251) borra **solo por ids propios**, y el `findMany` de
  apoyo filtra por `appointmentId in` de sus turnos. No usa filtros por `patientId`, fecha ni
  nombre. El servicio de prueba se crea con `active: false`.
- C4 PDF o documento: [x] (N/A)
- C5 `progress/impl_HU-003.md` existe y describe lo tocado: [x]
- C5 `progress/review_HU-003.md` con el veredicto: [x]
- C5 sin scripts sueltos ni datos de prueba en la base: [x]. El script es un entregable de la SDD
  (§8 "Crear") y en la base no quedan restos.

### Puntos especiales pedidos
- **`useConfirm`:** los tres `await confirm()` nuevos están en handlers de evento, antes de
  cualquier transición:
  - `appointment-detail-sheet.tsx:179-190` (`backToConfirmed`, después `run`, sin `startTransition`);
  - `consultation-measurements.tsx:185-196`;
  - `delete-consultation-button.tsx:26-38`.

  Ninguno está dentro de `<form action>` ni de `startTransition`.
- **UI:** usa solo `@/components/ui`, los primitivos (`sheet`, `separator`, `skeleton`),
  `DataTable` (solo en componentes cliente) y tokens semánticos (`text-link`,
  `text-muted-foreground`). No hay colores de paleta cruda ni tokens `LEGACY`, y
  `tailwind.config.ts` no se tocó.
- **Fechas y zonas:** `todayKey` se calcula con `dayKeyInTz` en el server (`page.tsx`) y se usa
  como `max` en los dos formularios. Las altas de medición usan `dayKeyToNoonUtc(…, tz)`, y el día
  de la consulta sale de `dayRangeUtc` en la zona de la profesional.

## Cambios requeridos (si CHANGES_REQUESTED)
Ninguno.

## Dudas (no bloqueantes)
- `consultation-measurements.tsx:130`: los títulos de grupo "Antropometría" y "Bioimpedancia" son
  un `<h3>` propio en lugar del `SectionLabel` que pide la SDD §7.3.1. La diferencia es visual
  menor; conviene mirarla en el recorrido.
- `consultations-section.tsx:73`: el botón "Nueva consulta" del encabezado de la Card aparece solo
  si hay consultas (decisión 6 del implementer). La SDD §7.1 lo pone siempre en `actions`. Con la
  lista vacía, el botón sigue estando en el `EmptyState`, así que el escenario de la HU (línea 201)
  se cumple.
- `setAppointmentStatus` (`appointments.ts:195-207`), ante un `P2002`, reintenta la transacción
  completa en vez de hacer solo el `findUnique` que describe la SDD §4.4. El resultado es
  equivalente y deja el estado aplicado. Lo acepto.
- El recorrido del orquestador (`progress/recorrido_HU-003.md`) dejó sin verificar en el navegador
  los pasos 2-12 de §12, que son los que escriben en la base. El script de dominio y los tests de
  core cubren la lógica, pero no el comportamiento de la UI: el panel que queda abierto al
  completar un turno, el aviso D5 con "Crear igual" y los toasts dinámicos. Conviene que el
  usuario los recorra con un paciente de prueba antes de mergear.
- `apps/bot/scripts/test-confirm-attendance.ts:26` borra con `deleteMany({ where: { patientId } })`.
  Es código previo a esta HU y está fuera del diff, pero contradice la regla de limpiar por id de
  `AGENTS.md`. Queda anotado para una tarea aparte.
