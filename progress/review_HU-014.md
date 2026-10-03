# Review — HU-014 (recordatorios según el tipo de turno)

**Veredicto:** CHANGES_REQUESTED

Revisado contra `docs/hu-recordatorios-por-servicio.md` (con Resoluciones), la SDD
`Refactorizaciones/recordatorios-por-servicio.md` (secciones 1–14) y `CHECKPOINTS.md`, sobre
`git diff HEAD` y los archivos nuevos sin trackear de la rama `feat/hu-014-recordatorios-por-servicio`.

Verificación que corrí yo (2026-10-02):

| Comando | Resultado |
|---|---|
| `npm run typecheck` | core, db, bot y web: 0 errores |
| `npm run test` | 53 files, 1113 passed |
| `prisma migrate status` (packages/db, `.env` raíz) | 20 migraciones, "Database schema is up to date!" |
| `prisma migrate diff --from-schema-datasource … --to-schema-datamodel … --script` (solo lectura) | "-- This is an empty migration." (base = schema) |
| `./ops/harness/verify.sh` | exit 0, "Arnés OK." (WARN informativos: migración nueva, se tocó el bot) |
| psql solo lectura | 0 `OutboundMessage` de jids `549000000%`, 0 servicios `(TEST)`, 0 pacientes de prueba, 0 `PENDING`; `REMINDER/auto:24h/SENT` 1, el resto con `dedupeKey ''`; 0 turnos futuros |

No corrí los scripts del bot (no hacía falta; los leí).

## Checkpoints

### C1 — Arnés
- C1.1 backlog válido, máx. 1 HU activa por responsable: [x] (verify.sh OK)
- C1.2 `progress/current-senkuch4n.md` refleja la HU: [x]
- C1.3 no toca archivos de HU de la otra persona: [x] (ningún archivo del PR #7 ni de la HU-010 en el diff)
- C1.4 `verify.sh` exit 0: [x]

### C2 — Documentos
- C2.1 `docs/hu-recordatorios-por-servicio.md` completa y validada: [x]
- C2.2 SDD con workspaces, checklist y contrato: [x]
- C2.3 firmas y nombres = contrato compartido: [x] (5.1–5.5 y sección 6 coinciden; `RemindersEditor.idPrefix` es una prop extra justificada)

### C3 — Arquitectura
- C3.1 lógica pura en core, base en `domain`, sin duplicar: [x]
- C3.2 schema/domain cambiados → web y bot compilan, consumidores ajustados: [x] (`enqueueDueReminders`/`enqueueAttendanceConfirmations`/`reminderLeadHours` sin consumidores fuera de seeds)
- C3.3 migración coherente, sin destructivos, NOT NULL con default/backfill: [x] (ver Migración abajo)
- C3.4 rutas protegidas: [x] (no hay rutas nuevas; las server actions nuevas viven en `(panel)` bajo el middleware de Auth.js, igual que el resto)
- C3.5 bot en silencio fuera de sesión y textos = SDD: [ ] — los textos coinciden (7.1/7.2, `confirmAttendanceRequest` intacto), pero el encolador puede mandar un **recordatorio duplicado** al paciente después de un cambio de configuración (hallazgo 1)
- C3.6 sin `console.log` de debug ni TODOs: [x]

### C4 — Verificación
- C4.1 typecheck limpio: [x]
- C4.2 lógica nueva de core con tests y `npm run test` verde: [x] (pero falta el caso del hallazgo 1)
- C4.3 flujo del bot simulado sin WhatsApp real, limpieza por id: [x] (`test-service-reminders.ts`, `test-confirm-attendance.ts` adaptado sin perder escenarios; base sin restos)
- C4.4 PDF/documento: [x] no aplica

### C5 — Cierre
- C5.1 `progress/impl_HU-014.md` describe lo tocado: [x]
- C5.2 `progress/review_HU-014.md` con veredicto: [x]
- C5.3 sin scripts sueltos ni datos de prueba en la base: [x] (el dry-run temporal se borró; conteos en 0)

## Cambios requeridos

1. **Recordatorio duplicado al paciente cuando la profesional cambia la configuración de un servicio
   con recordatorios ya enviados (incumple el escenario "Cambio de configuración con turnos ya
   agendados": "los recordatorios que ya se habían mandado no se repiten").**
   - Dónde: `packages/core/src/service-reminders.ts:237-243` (`pickDueReminder`) decide "ya enviado"
     solo por la clave del recordatorio elegido (`autoKeys.has(chosen.key)` / `confirmationSent`).
     No tiene en cuenta que **otro** mensaje automático ya cubrió ese momento. `packages/db/domain/reminders.ts:97-100`
     ni siquiera trae `createdAt` de los mensajes, así que no hay cómo saberlo.
   - Reproducción (lógica pura, con la config que hoy tienen los 9 servicios): turno a las 10:00 del
     jueves, config `[3 días pide confirmar, 24 h]`. El miércoles 10:00 sale `auto:24h` ("mañana").
     El miércoles 14:00 la profesional edita el servicio a `[3 días pide confirmar, 48 h]`. En el
     tick siguiente: candidatos = 3 días (momento lunes) y 48 h (momento martes 10:00); elegido = 48 h;
     `auto:48h` no está en `autoKeys`; está atrasado pero faltan 20 h > 2 h → **se encola un segundo
     "Te recuerdo que tenés turno mañana"**. Lo mismo para todos los turnos de ese servicio que estén
     dentro de las próximas 24 h, y en cualquier reemplazo de un recordatorio ya enviado por uno de
     mayor anticipación (24 h → 25 h, 24 h → 2 días, etc.).
   - Variante con la confirmación: `[3 días pide confirmar, 24 h]` → `[3 días, 24 h pide confirmar]`
     (mover el check, P9) con el pedido ya enviado a las −72 h: a las −60 h el elegido es "3 días" sin
     confirmar, clave `auto:72h` no enviada, atrasado, faltan 60 h → se encola un recordatorio además
     del pedido de confirmación que el paciente ya recibió.
   - Qué cambiar: un recordatorio elegido tiene que considerarse cubierto si ya hay un mensaje
     **automático** del turno (REMINDER `auto:*` o CONFIRMATION_REQUEST, o `confirmationRequestedAt`)
     encolado en o después de su momento; el manual (`manual:*`/`""`) no cuenta (D8). Es coherente con
     la regla de "superados" que ya usa `pickDueReminder` (todo lo que tiene momento ≤ al envío o fue el
     elegido o quedó superado), y no rompe P6 (23 h a las 08:00 y "1 día" a las 09:00 siguen saliendo
     los dos), el escenario 9 (agregar "2 días" a `[7 días]`) ni el bot caído. Implica sumar
     `createdAt` al `select` de `reminders.ts:97-100`, el dato a `SentReminders`, el mismo criterio en
     `reminderStatusItems` (`service-reminders.ts:333-359`, para que la línea del detalle no diga
     "pendiente" de algo que no va a salir), tests en `service-reminders.test.ts` (los dos casos de
     arriba → `null`; P6 y "agregar uno" siguen saliendo) y en `reminders.test.ts`. Es un hueco de la
     SDD (el algoritmo 5.1 paso 5 no lo contempla), no un desvío del implementer: conviene que el
     orquestador anote el ajuste en la SDD.

## Puntos pedidos por el orquestador (sin otros hallazgos bloqueantes)

1. **Idempotencia / duplicados.** Unicidad `(appointmentId, kind, dedupeKey)` en la base: dos ticks o
   dos procesos no pueden crear dos `auto:<h>` ni dos `CONFIRMATION_REQUEST` (`dedupeKey ''`).
   `remindersRunning` evita el solape dentro del proceso (`workers.ts`), también entre el arranque y el
   cron. Los efectos de la confirmación (`confirmationRequestedAt`, `CONFIRM_ATTENDANCE`) solo corren si
   `enqueueMessage` creó la fila (`reminders.ts:139`). Backfill: el `REMINDER` existente pasa a
   `auto:<reminderLeadHours>h` y la confirmación se da por enviada con la fila o
   `confirmationRequestedAt`. D5 con `bookedAt` (`appointments.ts` y `payments.ts`, solo en la
   transición AWAITING_PAYMENT→CONFIRMED), fallback a `createdAt`; regla de bot caído con tolerancia de
   15 min y > 2 h restantes. D6 solo para DAYS en la zona de la profesional, "mismo día calendario"
   (P5), P6 por empate de momentos. Lista vacía → sin candidatos (P2). Sin filtro por `service.active`
   (D9). Horizonte de 15 días suficiente (14 días + corrimiento máximo de ~14 h). Único problema: el
   hallazgo 1.
2. **Migración.** Aditiva: ADD COLUMN ×3 (las NOT NULL con DEFAULT), DROP del índice único viejo (no de
   columnas), CREATE UNIQUE nuevo, `reminderLeadHours` solo se lee. La unicidad nueva es más laxa que la
   vieja (superconjunto de columnas) → no puede fallar con filas existentes; el UPDATE de `dedupeKey`
   la respeta porque había como mucho un REMINDER por turno. Backfill de servicios correcto para
   `reminderLeadHours` <, = y > 72 y sin fila de `Professional` (queda el DEFAULT). Procedimiento:
   `migrate diff --from-schema-datasource … --to-schema-datamodel … --script` solo introspecciona la
   base, sin shadow y sin `--from-migrations`: no viola `AGENTS.md` ni `skills/migracion-prisma.md`
   (precedente HU-005/HU-006). Como antes de generarla `migrate status` estaba limpio y hoy el diff
   base→schema es vacío, el SQL equivale a lo que habría producido `--create-only` y `migrate deploy`
   en producción lo reproduce sin depender de la base de desarrollo (no hay referencias a ids ni datos
   de dev; el backfill usa `Professional.id = 1` como el resto del código).
3. **Confirmación de asistencia.** Mismo `kind`, mismo texto (`messages.confirmAttendanceRequest` sin
   tocar), marca `confirmationRequestedAt`, pone `CONFIRM_ATTENDANCE`; `conversation.ts` y `wake.ts` sin
   cambios, así que el sí/no tardío del PR #12 sigue igual. `test-confirm-attendance.ts` mantiene los 8
   escenarios (sólo cambia el reloj de A/B/D y el assert sobre `res.confirmations`) y suma el guard de
   `BotStatus`.
4. **Botón manual.** Independiente (`manual:<ISO>`), `$transaction` con `SELECT … FOR UPDATE` antes del
   `findFirst` del pendiente, `not_applicable` en turnos pasados/no confirmados con
   "Solo se puede mandar a un turno confirmado que todavía no pasó." vía `FormError` (debajo de los
   botones). **Observación del recorrido: no la considero defecto de esta HU.** En un turno pasado que
   nunca recibió nada, "no se envió" es literalmente cierto y es el estado `skipped` que define la SDD
   (5.1); el caso "reservado después" ya muestra "no aplica, se reservó después". El botón visible en un
   turno pasado devuelve un error claro y no encola nada. Ocultar el botón o cambiar el texto para turnos
   pasados es una mejora (ver Dudas).
5. **Panel.** Validación en el servidor con `validateServiceReminders` (hasta 3, 1 h–14 días, un solo
   "pide confirmar", duplicados), JSON inválido → error, ausente → no se toca. Campo de `/ajustes`
   retirado del form, del zod y del `update`. Las actions nuevas están bajo el mismo middleware que el
   resto del panel.
6. **Script nuevo.** Cumple la regla dura: datos propios (jids 14031/14032, servicios `HU014 … (TEST)`
   inactivos), turnos a +40 días fuera del horizonte del cron, borra por id (y el pre-cleanup aborta si
   el jid es de un paciente real o si un servicio de prueba tiene turnos ajenos), aborta con el bot
   conectado, no llama a Google Calendar ni a Mercado Pago (`needsGoogleSync: false`, sin pagos). El
   desvío (borrar al final de cada escenario) es aceptable: sin proceso del bot no hay consumidor del
   outbox, las filas viven segundos y van a jids inexistentes.
7. **Alcance.** El reporte declara que no se corrió `enqueueServiceReminders` sin `scope`; la base no
   muestra filas nuevas (solo el REMINDER preexistente). No se tocaron archivos del PR #7 ni de la
   HU-010. Cambios en archivos compartidos aditivos. Desvíos: `workers.test.ts` (`.find` → `.filter().at(-1)`
   por los dos crons `*/5`, con un test que fija que son exactamente dos y en ese orden) e `idPrefix`
   (ids únicos con un form por tarjeta): los dos bien.

## Dudas (no bloqueantes)

- Detalle de un turno **pasado** todavía CONFIRMED: podría ocultarse "Enviar recordatorio ahora" (hoy
  responde con error) y/o mostrar la línea como "turno pasado" en vez de la lista de "no se envió". Mejora
  de UX para otra HU o para esta ronda si el orquestador quiere; no cambia lo que recibe el paciente.
- `service-form.tsx`: `showReminderErrors` no se resetea después de guardar una edición con éxito
  (solo en el alta). Sin efecto visible porque con la lista válida no hay errores que mostrar.
- `reminders.ts:139-148`: `appointment.update` y `conversationState.upsert` no van en transacción con el
  encolado (mismo patrón que el código viejo). Si fallan después de crear la fila, el pedido sale pero la
  conversación no queda en `CONFIRM_ATTENDANCE`; el sí/no tardío lo cubre. Preexistente.

---

# Ronda 2 — HU-014

**Veredicto:** APPROVED

Revisado contra la SDD §15, la sección "Ronda 2" de `progress/impl_HU-014.md` y el diff de los 6
archivos tocados en esta ronda.

Verificación que corrí yo (2026-10-03):

| Comando | Resultado |
|---|---|
| `npm run typecheck` | exit 0 (core, db, bot, web) |
| `npm run test` | 53 files, 1124 passed |
| `prisma migrate status` | "Database schema is up to date!" |
| `./ops/harness/verify.sh` | exit 0 |
| psql solo lectura | 0 `OutboundMessage` de jids de prueba, 0 servicios `(TEST)`, 0 `PENDING` |

## Cambio requerido 1 de la ronda 1: resuelto

- `packages/core/src/service-reminders.ts:200`: `SentReminders.autoSentAt`. `:251-252`: el elegido queda
  cubierto si algún aviso automático se encoló en su momento o después.
- `packages/db/domain/reminders.ts:97-127`: el `select` trae `createdAt`. `autoSentAt` junta los REMINDER
  `auto:*`, los CONFIRMATION_REQUEST y `confirmationRequestedAt`. Los manuales (`manual:*`/`""`) quedan
  afuera (D8).
- Caso 1 (24 h → 48 h con `auto:24h` ya enviado): el `auto:24h` se encoló a las −24 h, que es posterior
  al momento de 48 h (−48 h), así que no sale nada. Caso 2 (mover el "pide confirmar"): la confirmación
  a las −72 h cubre el "3 días" sin confirmar (mismo momento) y el de 24 h sigue frenado por
  `confirmationSent` (P9).
- Revisé que no abra otros casos, con este argumento: en cada envío `pickDueReminder` elige el
  candidato de momento más tardío ≤ ahora. Entonces todo recordatorio con momento ≤ al `createdAt` de un
  aviso automático ya fue el elegido o quedó superado. La regla nueva solo formaliza eso entre cambios de
  configuración.
  - P6: "23 h" se encola a las 08:00 y el momento de "1 día" es 09:00, posterior, así que sale.
  - Escenario 9 / agregar uno más cercano al turno: su momento es posterior al último aviso, así que sale.
  - Agregar uno más lejano: lo supera el más cercano que ya se envió (igual que en la ronda 1).
  - Bot caído: no hay avisos previos, sin cambio.
  - D5: no toca el filtro por `bookedAt`.
- Consistencia con el detalle: `reminderStatusItems` (`service-reminders.ts:341-357`) arma el mismo
  `autoSentAt` y llama a `pickDueReminder`. Un recordatorio cubierto siempre tiene su momento ≤ ahora,
  así que cae en "no se envió" y nunca en "pendiente". El aviso que realmente salió aparece como ítem
  "enviado".
- Tests: +7 en core (incluidos los dos casos del review, con su contraprueba sin `autoSentAt`) y +4 en
  `reminders.test.ts`, incluido "un manual posterior no cubre al automático".

## Escenarios 14a/14b del script: OK

`stamp()` (`apps/bot/scripts/test-service-reminders.ts:186-196`) actualiza `createdAt` **por id**. Solo
toca filas de `OutboundMessage` cuyo turno es de un paciente que creó el script (A/B, jids 14031/14032),
así que no puede alcanzar filas reales. Los ids van a `outboundIds` para la limpieza. Turno a +49 días,
fuera del horizonte del cron. Cumple la regla dura de datos y la base quedó sin restos.

## Mejora de UX (turno pasado): OK

`appointment-detail-sheet.tsx`:

- `isPast` está en `:151`. El efecto no consulta la línea si el turno ya pasó (`:153`, `:166`).
- La línea dice "Turno pasado" (`:362`) y el botón manual se oculta (`:401`).
- Los turnos futuros siguen igual. El servidor sigue devolviendo `not_applicable` (P8, sin cambios en
  `enqueueReminderNow`).
- Hidratación: el detalle solo se monta cuando hay un `selected`, que arranca en `null`
  (`calendar-client.tsx:71`), así que el render inicial del servidor no lee el reloj.

## Lo aprobado en la ronda 1

Sin cambios en schema, migración, workers, `/servicios`, `/ajustes`, `outbox.ts`, `appointments.ts`,
`payments.ts` ni `test-confirm-attendance.ts`. Siguen valiendo los checkpoints de la ronda 1. C3.5 pasa a
[x] con este arreglo.

## Dudas (no bloqueantes)

- `isPast` se calcula en el render. Si el detalle queda abierto mientras empieza el turno, no cambia
  hasta el próximo render. El servidor igual bloquea el envío.
- Siguen las dos dudas menores de la ronda 1: `showReminderErrors` en la edición, y el
  update/upsert de la confirmación fuera de transacción (preexistente).
