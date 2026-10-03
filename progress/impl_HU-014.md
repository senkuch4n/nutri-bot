# Implementación HU-014 `recordatorios-por-servicio`

Estado: **done** (todos los pasos del checklist 0–7; sin commits)
SDD: `Refactorizaciones/recordatorios-por-servicio.md` · HU: `docs/hu-recordatorios-por-servicio.md`
Rama: `feat/hu-014-recordatorios-por-servicio` (sin commits del implementer: lo decide el orquestador).

## Paso 0 — Preparación (hecho)

- Rama correcta. `git fetch origin`; `git diff --name-only HEAD origin/develop -- packages/db/prisma` → vacío;
  `git log HEAD..origin/develop -- packages/db/prisma` → vacío. `origin/develop` = `2e221b7`.
- `prisma migrate status` → "19 migrations found … Database schema is up to date!".
- Bot apagado: ningún proceso `apps/bot`; `BotStatus.connected = f`.
- Respaldo: `~/nutribot-backups/pre-hu014-20261002-2329.dump` (287939 bytes).
- Solo lectura, antes: 0 turnos futuros. `OutboundMessage`: 1 REMINDER SENT, 2 CONFIRMATION SENT,
  1 CANCELLATION, 1 PLAN_PDF, 1 ANTHROPOMETRIC_REPORT_PDF FAILED. 0 grupos `(appointmentId, kind)`
  repetidos → la unicidad nueva `(appointmentId, kind, dedupeKey)` no puede fallar.
- Conteos/hashes antes (columnas preexistentes):

```
 Appointment                    |    18 | f7cd101b3ae59faca903bee09554f6ec
 Patient                        |    14 | c9e713622a8b8c660b1a8d6cc5fda498
 Service(sin reminders)         |     9 | 4660c0449c3aea64c4f052c7cb0f6087
 OutboundMessage(sin dedupeKey) |     6 | 27f1cf9ae225568e6c730d75bb958304
 ConversationState              |     7 | c2f8ced0934a7686e3584a01226c1389
 Professional                   |     1 | ed49bdc29e6ff123039b1296d5630cec
```

## Paso 1 — Esquema y migración con backfill (hecho)

- `schema.prisma`: `Service.reminders` (Json, default = DEFAULT_SERVICE_REMINDERS), `Appointment.bookedAt`,
  `OutboundMessage.dedupeKey` (default ""), `@@unique([appointmentId, kind, dedupeKey])`, comentario
  "SIN USO" en `reminderLeadHours`. Nada más.
- **Desvío de herramienta (precedente HU-005/HU-006):** `prisma migrate dev --create-only` se negó
  ("Prisma Migrate has detected that the environment is non-interactive"), por el aviso del índice
  único nuevo. Generé el SQL con `prisma migrate diff --from-schema-datasource prisma/schema.prisma
  --to-schema-datamodel prisma/schema.prisma --script` (solo lectura, **sin** `--from-migrations` ni
  shadow), creé `prisma/migrations/20261003023029_service_reminders/` a mano y le agregué al final el
  backfill de la SDD 4.2 tal cual.
- SQL generado = el de 4.2 (orden distinto: el `DROP INDEX` va primero). Único `DROP`: el índice viejo
  `OutboundMessage_appointmentId_kind_key`. Ningún `DROP COLUMN/TABLE`, `reminderLeadHours` solo se lee.
  NOT NULL nuevas con DEFAULT.
- Ensayo previo: todo el SQL dentro de `BEGIN … ROLLBACK` en psql → `UPDATE 9` / `UPDATE 1` / `UPDATE 18`,
  resultados esperados, revertido.
- Aplicada con `npm run db:migrate` ("Your database is now in sync", sin drift ni oferta de reset);
  `npm run db:generate` ok. `migrate status`: "Database schema is up to date!" (20 migraciones).
- Verificación 1.6 (solo lectura):
  - Service: 9/9 con `[{"unit":"DAYS","amount":3,"asksConfirmation":true},{"unit":"HOURS","amount":24,"asksConfirmation":false}]`.
  - OutboundMessage: `REMINDER | auto:24h | 1`; el resto (`CONFIRMATION` 2, `CANCELLATION` 1, `PLAN_PDF` 1,
    `ANTHROPOMETRIC_REPORT_PDF` 1) con `''`.
  - Appointment no AWAITING_PAYMENT con `bookedAt` nulo: 0.
  - Índices: `OutboundMessage_appointmentId_kind_dedupeKey_key UNIQUE ("appointmentId", kind, "dedupeKey")`; el viejo ya no está.
  - Hashes de las columnas preexistentes después de migrar: **idénticos** a los del paso 0 (las 6 tablas).
- 1.7: `npm run typecheck` verde (core, db, bot, web); `npm run test` → 50 files, 1007 tests passed.

## Paso 2 — Lógica pura `packages/core` (hecho)

- Nuevo `src/service-reminders.ts` con el contrato 5.1 (mismos nombres y firmas). Nuevo
  `src/service-reminders.test.ts` (72 tests, casos de 10.1 + bordes extra).
- `src/index.ts`: +1 línea al final `export * from "./service-reminders";`.
- `src/messages.ts`: `reminderMessage` con `when` obligatorio y primera línea
  `⏰ ${hi}Te recuerdo que tenés turno ${when}:`. `confirmAttendanceRequest` sin cambios.
- `src/messages.test.ts`: 3 casos al final (texto exacto, sin nombre, regresión literal de
  `confirmAttendanceRequest`).
- 2.5: `domain/reminders.ts` (viejo) pasa `when: relativeDayPhrase(new Date(), …)` en
  `enqueueDueReminders` y `enqueueReminderNow` para compilar.
- Decisiones: validación devuelve **un error por fila** (forma → entero → rango → duplicado →
  segunda confirmación). En `reminderStatusItems`, los ítems extra (claves `auto:` fuera de la config
  y manuales) van juntos en orden de `createdAt`. Una clave `auto:72h` no cuenta como confirmación
  enviada (el de "pide confirmar" se mira solo por `CONFIRMATION_REQUEST`/`confirmationRequestedAt`).
- Verificación: `npm run typecheck` verde (4 workspaces); `npm run test` → 51 files, **1082** passed.

## Paso 3 — Dominio nuevo conviviendo con el viejo `packages/db/domain` (hecho)

- `outbox.ts`: `enqueueMessage({ …, dedupeKey? })` → `Promise<boolean>` (true creó / false P2002). Nuevo `outbox.test.ts` (5).
- `appointments.ts`: `bookedAt: awaitingPayment ? null : new Date()` en `createAppointment`. +3 casos al final de `appointments.test.ts`.
- `payments.ts`: `bookedAt: new Date()` en el `updateMany` AWAITING_PAYMENT → CONFIRMED. +1 caso al final de `payments.test.ts`.
- `reminders.ts`: nuevas `enqueueServiceReminders`, `ServiceRemindersResult`, `getAppointmentReminderStatus`;
  `enqueueReminderNow(appointmentId, opts?) → Promise<ReminderNowResult>` (transacción + `SELECT … FOR UPDATE`,
  freno `already_pending`, `not_applicable`). Las viejas siguen (se borran en el paso 5).
- Nuevo `reminders.test.ts` (17 casos de 10.3).
- Decisiones: `enqueueReminderNow` usa `tx.appointment.findUnique` y tira `Error("Turno inexistente…")` si no
  existe (mismo efecto que `findUniqueOrThrow`); crea con `tx.outboundMessage.create` (no `enqueueMessage`,
  que usa el cliente global, fuera de la transacción). En `enqueueServiceReminders`, "fallaron todos" =
  todos los turnos a los que `pickDueReminder` les eligió algo fallaron (si nada era elegible, no tira).
- Verificación: typecheck 0 errores (4 workspaces); `npm run test` → 53 files, **1108** passed.

## Paso 4 — El bot pasa al encolador nuevo `apps/bot` (hecho)

- `src/workers.ts`: nueva `runServiceReminders()` (guard `remindersRunning`, logs "Recordatorios encolados" /
  "Confirmaciones de asistencia encoladas" con `{ n }`, `catch` → "Error encolando recordatorios"). En `startCron`
  el `*/15` de `enqueueDueReminders` pasa a `cron.schedule("*/5 * * * *", () => runServiceReminders())` en la misma
  posición y se borra el `*/30` de confirmaciones. `runStartupJobs` llama `await runServiceReminders()` en lugar de las
  dos viejas. Conciliación sigue primera; resumen fuera de horario sigue último.
- `src/workers.test.ts`: mock con `enqueueServiceReminders` (+ `enqueuePrepInstructions`/`syncGoogleCalendar` como mocks
  con nombre); 5 tests nuevos (cron `*/5` llama una vez, sin `*/30`, no se solapa, error logueado sin tirar,
  `runStartupJobs`). **Ajuste mínimo a 2 tests existentes** de la limpieza de sesiones: ahora hay dos crons `*/5`
  (recordatorios primero, limpieza después), así que `.find(c => c[0] === "*/5 * * * *")` pasó a
  `.filter(...).at(-1)`; el test nuevo verifica que son exactamente dos.
- `scripts/test-confirm-attendance.ts`: cambios de 10.5 (import, servicio con `reminders: [72 HOURS pide confirmar]`,
  turnos A/B/D a 72 h − {2, 1.5, 1} min con `bookedAt` = ahora − 24 h, asserts sobre `res.confirmations`, guard de
  `BotStatus.connected`). Resto sin cambios.
- `scripts/test-service-reminders.ts` nuevo (10.6) + script `test:service-reminders` en `apps/bot/package.json`.
  Decisiones: cada escenario crea sus turnos y al terminar borra **por id** sus `OutboundMessage` y turnos (así un
  escenario no ve los turnos de otro del mismo paciente; la idempotencia necesita que la fila exista durante el
  escenario). Escenario 10 usa el paciente B (14032) por el estado de conversación. Para el texto del 13
  ("(enviado)") la fila propia de `CONFIRMATION_REQUEST` se marca `SENT` por id (simula el despacho con el bot apagado).
  En 11 se agrega `not_applicable` con el turno ya empezado.
- Verificación (bot apagado: sin proceso, `BotStatus.connected = f`):
  - `npm run test:service-reminders --workspace apps/bot` → **15 OK, 0 con error** (escenarios 1–13, con 5a/5b y 10/10b).
  - `npm run test:confirm-flow --workspace apps/bot` → **8/8 escenarios OK** (sí, no, tardío silencioso, "no sé si llego",
    "Sí!" tardío, recomendaciones).
  - Restos: `OutboundMessage toJid LIKE '549000000%'` 0; `Service LIKE '%(TEST)%'` 0; `Patient` de prueba 0;
    `ConversationState` de prueba 0.
  - typecheck 0 errores; `npm run test` → 53 files, **1113** passed. Hashes de la base = los del paso 0.

## Paso 5 — Retirar lo viejo (hecho)

- 5.1 grep previo: `enqueueDueReminders`/`enqueueAttendanceConfirmations` solo en sus definiciones (y el comentario de la nueva).
- 5.2 Borradas de `reminders.ts` junto con el comentario huérfano "Pide confirmar asistencia…". `EnqueueScope` y
  `enqueuePrepInstructions` quedan (cuerpo de `enqueuePrepInstructions` idéntico a HEAD, verificado con diff).
- 5.3 typecheck 0 errores; `npm run test` → 53 files, 1113 passed.

## Paso 6 — Panel `apps/web` (hecho)

- `lib/services.ts`: `RemindersFields { reminders?: ServiceReminder[] }` en `createService`/`updateService`; se escribe
  como literal plano `{ amount, unit, asksConfirmation }`; `undefined` = no se toca.
- `servicios/actions.ts`: campo `reminders: z.string().optional()`; `JSON.parse` en try/catch (→ `SERVICE_REMINDERS_TEXT.invalid`),
  `validateServiceReminders` (errores → `{ ok: false, error: errors[0].message, reminderErrors }`). `ServiceFormState` suma `reminderErrors?`.
- `servicios/reminders-editor.tsx` (nuevo): `RemindersEditor` (props `initial`, `serverErrors`, `showErrors`, `resetKey` + `idPrefix`
  para ids únicos de accesibilidad, porque hay un form por tarjeta). Filas controladas, `role="group"` con `aria-label`, número
  `w-24` con `aria-invalid`/`aria-describedby`, select días/horas, checkbox "Pide confirmar (sí/no)" (marcar uno desmarca los demás),
  quitar (ghost icon, `Trash2`), "Agregar recordatorio" deshabilitado en 3 con `title`, nota gris con lista vacía, input oculto
  `reminders` (JSON). Errores por fila al hacer blur o tras intento de envío; error de lista debajo del bloque.
- `servicios/service-form.tsx`: pasa a `onSubmit` + `preventDefault` + `startTransition(() => action(formData))` (sigue
  `useActionState`); si la lista es inválida no despacha y enfoca el primer número con error. Bloque entre "recomendaciones" y
  "Pedir motivo". El alta, al crear, resetea el editor a `DEFAULT_SERVICE_REMINDERS` (`resetKey`). Sin `confirm()`.
  `EditableService.reminders: ServiceReminder[]`.
- `servicios/service-card.tsx`: el `div` de badges se renderiza siempre, con `Badge tone="neutral"` = `serviceRemindersSummary`.
  `servicios/page.tsx`: `reminders: parseServiceReminders(s.reminders)`.
- `/ajustes`: fuera el campo "Aviso previo del recordatorio (horas)" y `reminderLeadHours` de `SettingsDefaults`, del schema zod
  y del `update`; en su lugar "Los recordatorios se configuran en [cada servicio](/servicios)." (`next/link`) al lado del
  WhatsApp (llena la celda, sin hueco). `NumberInput` ya no se usaba en ese archivo: import quitado. Descripción de la tarjeta:
  "Zona horaria, moneda y datos que usa el bot."
- `(panel)/actions.ts`: `sendReminderNowAction` → `ActionResult & { result?: "queued" | "already_pending" }` (`not_applicable` →
  "Solo se puede mandar a un turno confirmado que todavía no pasó."); nueva `getAppointmentRemindersAction`.
- `appointment-detail-sheet.tsx`: fila "Recordatorios" al final del `<dl>` solo si `CONFIRMED` (useEffect con `appt.id`,
  `appt.status`, `remindersVersion`, guard de desmontaje; `…` cargando, `—` si falla; `aria-live="polite"`); toasts
  "Recordatorio encolado." / "Ya hay un recordatorio pendiente de envío para este turno."; error con `FormError`.
- Skills: `ui-ux-pro-max` (búsqueda UX: errores inline con aria-describedby, validación en blur), `ui-styling`,
  `web-design-guidelines` (autochequeo). Hallazgo del autochequeo corregido: ids de filas con contador de módulo podían
  diferir entre servidor y cliente → contador por instancia (`useRef`).
- Verificación: typecheck 0 errores; `npm run lint --workspace apps/web` → solo el warning preexistente de
  `ajustes/logo-form.tsx:29` (alt), ninguno en archivos de esta HU; `npm run test` 1113 passed.
- 6.8 (recorrido manual en el navegador): **no lo hice**; lo hace el orquestador.

## Paso 7 — Cierre: verificación final (bot apagado: sin proceso, `BotStatus.connected = f`)

| Verificación | Resultado |
|---|---|
| `npm run db:generate` | ok |
| `npm run typecheck` (core, db, web, bot) | 0 errores |
| `npm run test` | 53 files, **1113 passed** (1007 previos + 106 nuevos) |
| `npm run lint --workspace apps/web` | solo warning preexistente `ajustes/logo-form.tsx:29` |
| `test:service-reminders` (nuevo) | 15 OK, 0 con error |
| `test:confirm-flow` (adaptado) | 8/8 OK |
| `test:booking-reason` | 17/17 OK |
| `test:bot-ai` | 18/18 OK |
| `test:after-hours` | 12/12 OK |
| `prisma migrate status` | "Database schema is up to date!" (sin drift) |
| `./ops/harness/verify.sh` | "Arnés OK." (WARN informativos: migración nueva; se tocó el bot) |

**Restos de pruebas (solo lectura):** `OutboundMessage toJid LIKE '549000000%'` 0 · `Service LIKE '%(TEST)%'` 0 ·
`Patient` de prueba 0 · `ConversationState` de prueba 0 · `OutboundMessage PENDING` total 0.

**Conteos/hashes después (columnas preexistentes): idénticos al paso 0.**

```
 Appointment                    |    18 | f7cd101b3ae59faca903bee09554f6ec
 Patient                        |    14 | c9e713622a8b8c660b1a8d6cc5fda498
 Service(sin reminders)         |     9 | 4660c0449c3aea64c4f052c7cb0f6087
 OutboundMessage(sin dedupeKey) |     6 | 27f1cf9ae225568e6c730d75bb958304
 ConversationState              |     7 | c2f8ced0934a7686e3584a01226c1389
 Professional                   |     1 | ed49bdc29e6ff123039b1296d5630cec
```
(Las únicas escrituras sobre datos existentes fueron las del backfill: `Service.reminders` ×9, `OutboundMessage.dedupeKey`
del único REMINDER → `auto:24h`, `Appointment.bookedAt` ×18 = `createdAt`.)

**Dry-run sobre turnos reales (solo lectura, script temporal ya borrado):** simulé `pickDueReminder` con la config real
de cada servicio en todos los ticks de 5 min de los próximos 15 días, sin encolar nada:
```
now=2026-10-03T02:48:24.854Z tz=America/Argentina/Buenos_Aires turnos futuros (cualquier estado)=0
Encolaría AHORA (primer tick): 0
```
Antes de la migración también había 0 turnos futuros (paso 0). Ningún turno real queda con un recordatorio o confirmación
por (re)enviar. No corrí `enqueueServiceReminders` sin `scope`, no arranqué el bot, ni llamé a Google Calendar / Mercado Pago.

## Contrato compartido

Firmas idénticas a la SDD 5.1–5.5 y sección 6: `ReminderUnit`, `ServiceReminder`, constantes (`SERVICE_REMINDERS_MAX`,
`REMINDER_MIN_HOURS`, `REMINDER_MAX_HOURS`, `REMINDER_ON_TIME_TOLERANCE_MS`, `REMINDER_LATE_MIN_REMAINING_MS`,
`REMINDER_QUIET_START/END`, `DEFAULT_SERVICE_REMINDERS`, `SERVICE_REMINDERS_TEXT`), `ServiceReminderError`,
`reminderLeadInHours`, `reminderDedupeKey`, `sortServiceReminders`, `validateServiceReminders`, `parseServiceReminders`,
`reminderMoment`, `SentReminders`, `DueReminder`, `pickDueReminder`, `relativeDayPhrase`, `formatReminderLead`,
`serviceRemindersSummary`, `ReminderItemState`, `ReminderStatusItem`, `reminderStatusItems`, `reminderStatusText`;
`messages.reminderMessage({ …, when })`; `enqueueMessage(… dedupeKey?) → Promise<boolean>`; `ServiceRemindersResult`,
`enqueueServiceReminders(opts?)`, `ReminderNowResult`, `enqueueReminderNow(id, opts?)`, `getAppointmentReminderStatus(id, opts?)`;
`sendReminderNowAction`, `getAppointmentRemindersAction`, `ServiceFormState.reminderErrors`. `DEFAULT_SERVICE_REMINDERS`
coincide con el `@default` de `Service.reminders` (revisado a mano y con test).

## Desvíos de la SDD (con motivo)

1. **Migración creada con `migrate diff --from-schema-datasource … --script`** en vez de `migrate dev --create-only`
   (este se niega en entorno no interactivo por el aviso del índice único). Mismo precedente que HU-005/HU-006; es
   solo lectura, sin shadow ni `--from-migrations`. SQL generado = el de 4.2 + backfill tal cual; ensayado en
   `BEGIN … ROLLBACK` antes de aplicarlo con `npm run db:migrate`.
2. **`workers.test.ts`:** 2 tests existentes de la limpieza de sesiones usaban `.find(*/5)`; con el cron nuevo de
   recordatorios (también `*/5`, declarado antes) pasaron a `.filter(*/5).at(-1)`. Mismo comportamiento verificado.
3. **`RemindersEditor`** suma la prop `idPrefix` (ids únicos con varios forms en la página).
4. **Script nuevo:** los `OutboundMessage` se borran por id al final de cada escenario (no inmediatamente), porque la
   idempotencia que se prueba depende de que la fila exista; turnos a > 40 días y bot apagado. El escenario 13 marca su
   propia fila de confirmación como `SENT` (por id) para obtener "(enviado)".
5. **No hay commits** (orden del orquestador; la SDD pedía uno por paso).
6. **6.8 (recorrido manual del panel en el navegador)** no lo hice: lo hace el orquestador.

## Archivos

Nuevos: `packages/db/prisma/migrations/20261003023029_service_reminders/migration.sql`,
`packages/core/src/service-reminders.ts`, `packages/core/src/service-reminders.test.ts`,
`packages/db/domain/outbox.test.ts`, `packages/db/domain/reminders.test.ts`,
`apps/bot/scripts/test-service-reminders.ts`, `apps/web/src/app/(panel)/servicios/reminders-editor.tsx`.

Modificados: `packages/db/prisma/schema.prisma`, `packages/core/src/{index.ts,messages.ts,messages.test.ts}`,
`packages/db/domain/{outbox.ts,reminders.ts,appointments.ts,appointments.test.ts,payments.ts,payments.test.ts}`,
`apps/bot/{package.json,src/workers.ts,src/workers.test.ts,scripts/test-confirm-attendance.ts}`,
`apps/web/src/lib/services.ts`, `apps/web/src/app/(panel)/{actions.ts,appointment-detail-sheet.tsx}`,
`apps/web/src/app/(panel)/servicios/{actions.ts,page.tsx,service-card.tsx,service-form.tsx}`,
`apps/web/src/app/(panel)/ajustes/{actions.ts,page.tsx,settings-form.tsx}`.

No tocados (verificado): `conversation.ts`, `wake.ts`, `enqueuePrepInstructions` (cuerpo idéntico), `runAfterHoursDigest`,
`runSessionTextCleanup`, `runBotAiPurge`, `seed*.ts`, `.env.example`, archivos del PR #7, `backlog/`. Respaldo:
`~/nutribot-backups/pre-hu014-20261002-2329.dump`. Para los commits: `git add` solo los archivos listados (hay archivos ajenos
sin trackear en el working tree).

---

## Ronda 2 (intento 1 de 2) — `review_HU-014.md` "Cambios requeridos" + SDD §15

Estado: **done**. Sin cambios de schema ni migraciones (no hacían falta). Sin commits.

### 1. Cambio requerido 1: no repetir un aviso ya enviado si cambia la config del servicio

- `packages/core/src/service-reminders.ts`:
  - `SentReminders` suma **`autoSentAt: readonly Date[]`** (obligatorio): cuándo se encoló cada mensaje **automático**
    del turno (`createdAt` de los REMINDER `auto:*` y de los CONFIRMATION_REQUEST, más `confirmationRequestedAt`).
    Los manuales (`manual:*` / `""`) no van (D8).
  - `pickDueReminder`, paso 5: además de "ya enviado" por clave o por confirmación, el elegido queda **cubierto** (→ `null`)
    si algún `autoSentAt` es ≥ su momento (SDD §15).
  - `reminderStatusItems`: arma el mismo `autoSentAt` (desde `messages` + `confirmationRequestedAt`) y se lo pasa a
    `pickDueReminder`. Un recordatorio cubierto ya no aparece como "pendiente": como su momento ya pasó, queda "no se envió"
    (y el aviso que realmente salió figura como ítem "enviado").
- `packages/db/domain/reminders.ts` (`enqueueServiceReminders`): `createdAt` en el `select` de `messages`; arma `autoSentAt`
  (REMINDER `auto:*` + CONFIRMATION_REQUEST + `confirmationRequestedAt`). `getAppointmentReminderStatus` ya traía `createdAt`.
- Tests core (`service-reminders.test.ts`, +7):
  - Caso 1 del review: config `[3 días pide confirmar, 24 h]`, `auto:24h` enviado el miércoles 10:00, la config pasa a
    `[3 días pide confirmar, 48 h]`, a las −20 h ⇒ `null`. El mismo caso sin `autoSentAt` da `auto:48h`, o sea que el test
    reproduce el bug.
  - Caso 2 del review: el "pide confirmar" pasa de 3 días a 24 h con el pedido ya enviado a −72 h ⇒ `null` a −60 h y a −24 h.
  - Siguen saliendo: P6 (turno 07:00: "23 h" a las 08:00 y después "1 día" a las 09:00), "agregar uno" (`[7 días]` enviado +
    "2 días"), un manual no cubre al automático, bot caído.
  - `reminderStatusItems` con el cambio de config ⇒ "3 días antes, pide confirmar (enviado) · 48 h antes (no se envió) ·
    24 h antes (enviado)".
  - Los literales `sent` existentes suman `autoSentAt: []`.
- Tests dominio (`reminders.test.ts`, +4):
  - `select` con `createdAt`.
  - Cambio 24 h → 48 h ⇒ no encola.
  - Mover el "pide confirmar" con solo `confirmationRequestedAt` ⇒ no encola a −60 h.
  - Un manual posterior al momento no cubre al automático.
  - El mock de mensajes ahora lleva `createdAt`.
- `apps/bot/scripts/test-service-reminders.ts`:
  - **Estampado de `createdAt`:** el reloj es inyectado, pero `createdAt` lo pone la base con la hora real, que siempre queda
    antes de los momentos a +40 días. Sin esto la regla de "cubierto" nunca se ejercitaría en el script. Por eso, después de
    cada corrida (`runA`/`runB`/`manualA`), las filas nuevas del paciente de prueba pasan a `createdAt = now` simulado.
    Se actualizan **por id** y son filas propias del script.
  - Escenario nuevo **14** (servicio `HU014 Cambio sobre enviado (TEST)`, paciente B, turno a +49 días):
    - 14a: confirmación a −72 h y `auto:24h` a −24 h; la config pasa a 48 h ⇒ 0 a −20 h y a −3 h; queda una sola `auto:24h`
      y la línea de estado no dice "pendiente".
    - 14b: pedido de confirmación enviado; se mueve el "pide confirmar" a 24 h ⇒ 0 a −60 h y a −24 h; ningún REMINDER y un
      solo CONFIRMATION_REQUEST.
  - Limpieza por id como el resto. El `ConversationState` del jid de prueba B se borra entre 14a y 14b.

### 2. Mejora de UX (decisión del usuario): turno pasado

- `apps/web/src/app/(panel)/appointment-detail-sheet.tsx`:
  - `isPast = start ≤ ahora`.
  - Con el turno pasado: no se muestra "Enviar recordatorio ahora", la fila "Recordatorios" dice **"Turno pasado"**
    (`text-muted-foreground`) y no se consulta `getAppointmentRemindersAction`.
  - El servidor sigue devolviendo `not_applicable` (P8).
  - El cuerpo del detalle solo se renderiza en el cliente (`selected` arranca en `null` en `calendar-client.tsx`), así que
    leer el reloj en el render no genera desajustes de hidratación.
- Skills: `ui-styling` y `web-design-guidelines` (guías recién descargadas). Sin hallazgos en lo nuevo: la fila está en una
  región `aria-live="polite"` y el botón oculto no deja una acción muerta.

### Verificación (bot apagado: `BotStatus.connected = f`)

| Verificación | Resultado |
|---|---|
| `npm run typecheck` | 0 errores (core, db, web, bot) |
| `npm run test` | 53 files, **1124 passed** (1113 de la ronda 1 + 11) |
| `npm run lint --workspace apps/web` | solo el warning preexistente `ajustes/logo-form.tsx:29` |
| `test:service-reminders` | **17 OK, 0 con error** (15 previos + 14a/14b) |
| `test:confirm-flow` | 8/8 |
| `test:booking-reason` | 17/17 |
| `test:bot-ai` | 18/18 |
| `test:after-hours` | 12/12 |
| `prisma migrate status` | up to date |
| `./ops/harness/verify.sh` | "Arnés OK." (mismos WARN informativos) |

- **Base, solo lectura:**
  - Hashes de las 6 tablas: idénticos a los del paso 0.
  - Sin restos: `OutboundMessage` de prueba 0, servicios `(TEST)` 0, pacientes de prueba 0, `ConversationState` de prueba 0.
  - `OutboundMessage` PENDING total: 0.
- No corrí `enqueueServiceReminders` sin `scope` ni arranqué el bot.

**Archivos tocados en la ronda 2:** `packages/core/src/service-reminders.ts`, `packages/core/src/service-reminders.test.ts`,
`packages/db/domain/reminders.ts`, `packages/db/domain/reminders.test.ts`, `apps/bot/scripts/test-service-reminders.ts`,
`apps/web/src/app/(panel)/appointment-detail-sheet.tsx`.

**Contrato:** el único cambio de firma respecto de la 5.1 es `SentReminders.autoSentAt`, según la §15. Sus consumidores
(`reminders.ts`, `reminderStatusItems`, tests) están actualizados.

**Dudas del review sin tocar** (no las pidió el orquestador):
- `showReminderErrors` no se resetea después de editar con éxito. No tiene efecto visible.
- `update`/`upsert` de la confirmación fuera de transacción. Es preexistente.
