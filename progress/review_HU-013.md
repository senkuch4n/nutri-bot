# Review — HU-013 (motivo de consulta al reservar)

**Veredicto:** APPROVED

Revisado contra `docs/hu-motivo-consulta-reserva.md`, `Refactorizaciones/motivo-consulta-reserva.md`
(sección 15 prioritaria: P2 lista ampliada, P3 sin limpieza) y el diff real (`git diff HEAD` + nuevos
sin trackear). Revisor: Opus, 2026-10-02.

## Verificación corrida por el reviewer

- `npm run typecheck`: core, db, bot y web limpios (exit 0).
- `npm run test`: 49 archivos, 962 tests OK (exit 0). Incluye `booking-reason.test.ts` (70),
  `messages.test.ts` (6), `domain/appointments.test.ts` (12), `domain/gcal-and-ai-privacy.test.ts` (3),
  `domain/payments.test.ts` (20, 3 nuevos).
- `./ops/harness/verify.sh`: exit 0 ("Arnés OK"; solo los WARN de recordatorio de migración y bot, revisados abajo).
- Consultas de solo lectura a la base de desarrollo: 0 pacientes `549000000003_`, 0 servicios
  `HU013 %(TEST)`/"Prueba motivo", 0 `OutboundMessage` a `5490000000099`, `Service.asksReason` 9/9 en true,
  0 turnos con `reason`, `Professional.phoneJid` sigue nulo, migración `20261003011808_booking_reason`
  aplicada y es la última. No corrí el script de simulación (no hacía falta); lo leí completo.

## Puntos pedidos por el orquestador

1. **Privacidad (D7, D9).** Alerta con motivo recortado en los dos caminos:
   `packages/db/domain/appointments.ts:94` (sin seña) y `packages/db/domain/payments.ts:131` (pago
   aprobado), los dos vía `professionalNewBookingAlert` → `bookingReasonLine(reasonForAlert(...))`
   (`packages/core/src/messages.ts:218`). `reasonForAlert` usa `Array.from` (no parte emojis), test
   explícito de surrogates en `booking-reason.test.ts`. `gcal.ts`, `botAi.ts`, `bot-ai-tools.ts`, el portal
   y `assistant-tools.ts` no se tocaron y no mencionan `reason`. El `title` del evento en
   `api/appointments/route.ts` no cambió; `reason` solo va en `extendedProps` (ruta del panel, detrás del
   middleware de auth). Tests reales: `gcal-and-ai-privacy.test.ts` arma turnos con un SECRET y verifica
   que ni `events.insert` ni `events.patch` ni `mis_turnos` lo contienen, con control positivo (nombre del
   servicio presente); `payments.test.ts` cubre motivo, sin motivo y recorte en el camino de pago, y que la
   confirmación al paciente no lleva "Motivo".
2. **Bot.** `BOOK_REASON` solo si `service.asksReason` (`conversation.ts:451-457`); bloque en
   `handleIncoming` entre `AWAIT_QUESTION` e `isExitWord` con comandos estrictos (`:238-251`); `parseBookingReason`
   con la lista ampliada de P2 (`booking-reason.ts:20-34`, comparación sobre el mensaje entero
   normalizado y tests de cada palabra nueva, incluidos los falsos positivos "no quiero dieta estricta",
   "después de las fiestas engordé", "saltar comidas"); 500 máx./3 mín.; medios sin texto →
   `BOOKING_REASON_TEXT_ONLY` en `handleIncomingMedia` (`:765-783`), y la foto con epígrafe llega como texto
   (sin cambios en `whatsapp.ts`); línea `📝 Motivo:` en el resumen. Seña: el `reason` se guarda con
   `AWAITING_PAYMENT` y la alerta sigue esperando el pago aprobado. Opción 0, opción 5,
   `handleQuestionText` y `handleInquiryText` sin cambios. Silencio: el timeout de sesión vuelve
   `BOOK_REASON` a `DORMANT` antes del bloque nuevo, y `handleIncomingMedia` respeta el timeout.
3. **Panel.** Campo opcional en "Nuevo turno" con contador y sin mínimo; edición en el detalle con
   `onSubmit` + `preventDefault` + `startTransition`, sin `<form action>` ni `await confirm()`
   (`appointment-detail-sheet.tsx:146-160`); `AppointmentBody` está keyed por id. Switch en `/servicios`
   con input oculto "0"/"1" y `z.enum` (no `coerce.boolean`). La tarjeta de la consulta es de solo lectura,
   no toca `ConsultationNotes` ni `isConsultationEmpty`. Columna "Motivo" en la ficha. Las dos server
   actions validan en el servidor (`zod max(5000)` + `validateBookingReasonInput`, y el dominio vuelve a
   validar); la autorización es la misma que el resto del panel (middleware).
4. **Migración.** `ADD COLUMN "reason" TEXT` y `ADD COLUMN "asksReason" BOOLEAN NOT NULL DEFAULT true`, sin
   DROP ni cambios de tipo; coherente con `schema.prisma`.
5. **`professionalAlertJid` (P4).** `undefined` → `pro.phoneJid` (`appointments.ts:81-82`), igual que
   antes. En producción `apps/bot/src/index.ts:20` llama a `handleIncoming` sin `alertJid`, así que llega
   `undefined`. La única llamada de la web (`(panel)/actions.ts:44`) no pasa el parámetro y ninguna action
   lo toma de la entrada del cliente.
6. **Script `apps/bot/scripts/test-booking-reason.ts`.** Crea sus propios pacientes y 3 servicios
   "HU013 … (TEST)"; no hace update de `Professional` ni de servicios existentes; todos los `deleteMany`
   son por ids anotados o por jids falsos `54900000000xx`; las alertas van a `ALERT_JID` falso y se
   borran por id; IA apagada (claves borradas + `aiProvider: null`); no llama a MP (el servicio con seña
   está inactivo y se usa solo desde el dominio) ni a Google (`needsGoogleSync: false` por id); aborta si el
   bot está conectado o pausado; la limpieza final corre en `finally`.
7. **Alcance.** No se tocaron alimentos/planes/plantillas/`food-picker.tsx`/`ai-food-catalog.ts`/HU-010, ni
   `workers.ts`, `workers.test.ts`, `botAi.ts`, `botAi.test.ts`, ni `handleQuestionText`. Los cambios en
   archivos compartidos son aditivos (parámetros opcionales; sin `reason` los textos quedan idénticos, y
   `messages.test.ts` lo fija byte a byte).

## Checkpoints

### C1 — El arnés está sano
- [x] `backlog/` válido; senkuch4n tiene solo HU-013 activa (`en_revision`); HU-010 activa es de imleticio.
- [x] `progress/current-senkuch4n.md` refleja la HU en curso.
- [x] El diff no toca archivos de HU de la otra persona.
- [x] `./ops/harness/verify.sh` exit 0.

### C2 — Cadena de documentos
- [x] `docs/hu-motivo-consulta-reserva.md` completa, con Resoluciones.
- [x] `Refactorizaciones/motivo-consulta-reserva.md` con workspaces, checklist y contrato compartido.
- [x] Firmas y nombres del diff = contrato (4.1–4.6, 5.1–5.3), más la lista de salteo de la sección 15.

### C3 — Arquitectura
- [x] Reglas puras en `packages/core/src/booking-reason.ts`; validación y escritura compartidas en
      `packages/db/domain/appointments.ts`; web y bot no duplican límites (usan las constantes).
- [x] Cambio de schema/domain: web y bot compilan; consumidores ajustados (bot, actions, route, servicios, ficha).
- [x] Migración aditiva, `NOT NULL` con `DEFAULT true` en la misma sentencia, sin pasos destructivos.
- [x] Sin rutas nuevas; las actions nuevas o cambiadas están bajo el middleware del panel; el portal no se tocó.
- [x] El bot sigue en silencio fuera de sesión (timeout → DORMANT, también para medios); textos = sección 6 de la SDD.
- [x] Sin `console.log` de debug ni TODOs en el código de producción (los `console.log` están solo en el script de prueba).

### C4 — Verificación real
- [x] `npm run typecheck` limpio (corrido por el reviewer).
- [x] Lógica nueva de core con tests; `npm run test` 962/962.
- [x] Flujo del bot simulado sin WhatsApp real; limpieza por id (script leído; la base no tiene restos).
- [x] No aplica PDF/documento.

### C5 — Cierre
- [x] `progress/impl_HU-013.md` existe y describe lo tocado.
- [x] `progress/review_HU-013.md` con veredicto final (este archivo).
- [x] Sin scripts sueltos (el script nuevo está registrado en `package.json` y en el README) y sin datos de prueba en la base.

## Cambios requeridos

Ninguno.

## Dudas (no bloqueantes)

- `apps/bot/src/conversation.ts:451` y `sendBookingSummary` (`:467`) leen el servicio dos veces cuando no
  pide motivo. Es una consulta extra por reserva; la SDD lo plantea así.
- `apps/bot/scripts/test-booking-reason.ts:129-133` (limpieza previa) borra `OutboundMessage` a
  `5490000000031/32/99` sin filtrar por fecha. `test-after-hours-inquiry.ts` y
  `test-bot-ai-questions.ts` usan los mismos jids. Como son jids falsos y solo de prueba no hay riesgo
  para datos reales, pero una corrida puede borrar restos de otra prueba.
- Si el horario se ocupa mientras el paciente escribe el motivo (`SLOT_TAKEN`), el motivo se descarta y
  el paciente tiene que volver a escribirlo. Es lo que pide la SDD (6.1.5); lo dejo anotado como posible mejora de UX.
- P3 (el motivo queda en `ConversationState.context` si el paciente abandona) queda pendiente para después del PR #8, como resolvió el usuario.
- `origin/develop` tiene 3 commits que la rama no tiene (PR #9 `fix/sara2-only`). No es de esta HU, pero hay que mergearlo antes del PR.
