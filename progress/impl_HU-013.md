# impl HU-013 — motivo de consulta al reservar

Estado: **done**

SDD: `Refactorizaciones/motivo-consulta-reserva.md` (sección 15 con prioridad). HU: `docs/hu-motivo-consulta-reserva.md`.

## Preparación

- `git fetch`: `origin/develop` avanzó a `6ab8f14` (PR #9 `fix/sara2-only`: alimentos, planes,
  plantillas, food-picker, ai-food-catalog, vitest.config). **No se mergeó**: el merge crea un commit y
  el orquestador pidió no commitear; además ninguno de esos archivos coincide con los de esta HU ni
  toca `packages/db/prisma`. Queda para el orquestador (`git merge origin/develop` antes del PR).
- Ninguna rama remota (`feat/components-front`, `feat/hu-010-*`, `feat/mp-bot`, `fix/hu-012-detalles`,
  `develop`) trae cambios en `packages/db/prisma`.
- Bot: no hay proceso corriendo (`pgrep` vacío).

## Bloques


### Bloque 1: packages/core — hecho

- Nuevo `packages/core/src/booking-reason.ts` (contrato 4.1 exacto: `BOOKING_REASON_MAX`,
  `BOOKING_REASON_MIN_ALNUM`, `BOOKING_REASON_ALERT_MAX`, `BOOKING_REASON_SKIP_WORDS`,
  `normalizeBookingReason`, `isBookingReasonSkip`, `BookingReasonParse`, `parseBookingReason`,
  `validateBookingReasonInput`, `reasonForAlert`).
  - **P2 (sección 15):** la lista de salteo suma `saltar`, `no gracias`, `prefiero no decirlo`,
    `no quiero`, `despues`. "después" va sin acento en la constante porque la comparación es contra
    la forma normalizada (sin acentos), así "después", "Despues" y "DESPUÉS!" son salteo.
- `messages.ts`: import de `reasonForAlert`, `bookingReasonLine`, `confirmBooking` y
  `professionalNewBookingAlert` con `reason?` opcional (sin él, texto byte a byte igual), 4 textos
  nuevos al final (sección 6, literales).
- `index.ts`: `export * from "./booking-reason";` al final.
- Tests: `booking-reason.test.ts` (70 casos, incluye cada palabra nueva de P2 con variantes de
  mayúsculas/signos/acentos, y negativos como "no quiero dieta estricta", "después de las fiestas
  engordé", "saltar comidas") y `messages.test.ts` (6). `npx vitest run` de los dos: 76/76 OK.

### Bloque 2: packages/db — hecho

- Respaldo: `~/nutribot-backups/pre-hu013-20261002-2217.dump` (281K, no vacío).
- `schema.prisma`: `Appointment.reason String?` (después de `cancelReason`) y
  `Service.asksReason Boolean @default(true)` (después de `prepLeadHours`), con sus comentarios.
- `prisma migrate dev --create-only --name booking_reason` (desde `packages/db` con
  `npx dotenv -e ../../.env --`): sin drift ni oferta de reset. Migración
  `packages/db/prisma/migrations/20261003011808_booking_reason/migration.sql`, SQL final (idéntico al
  esperado en 3.2, sin editar):
  ```sql
  -- AlterTable
  ALTER TABLE "Appointment" ADD COLUMN     "reason" TEXT;

  -- AlterTable
  ALTER TABLE "Service" ADD COLUMN     "asksReason" BOOLEAN NOT NULL DEFAULT true;
  ```
- `npm run db:migrate` → "Your database is now in sync with your schema."; `npm run db:generate` OK;
  `prisma migrate status` → "19 migrations found … Database schema is up to date!".
- `domain/appointments.ts`: `InvalidBookingReasonError`; `createAppointment` con `reason?` y
  `professionalAlertJid?` (validación como primera línea, antes de leer la base; `reason: r.reason`
  en el create; `needsGoogleSync: true` intacto; alerta con `alertJid` y `reason: appointment.reason`);
  `updateAppointmentReason` nueva (ubicada justo después de `createAppointment`). Confirmación al
  paciente sin cambios.
- `domain/payments.ts`: `reason: appointment.reason` en la alerta del pago aprobado (1 línea).
- Tests nuevos: `domain/appointments.test.ts` (12), `domain/gcal-and-ai-privacy.test.ts` (3; no toca
  `gcal.ts`/`botAi.ts`/`botAi.test.ts`), 3 casos nuevos al final de `payments.test.ts`.
  `npx vitest run packages/db/domain`: 6 archivos, 74/74 OK.
- `npm run typecheck` (core, db, bot, web): verde.

### Bloque 3: apps/bot — hecho

- `src/conversation.ts` (hunks separados; **sin tocar** `handleQuestionText`, `handoffFromQuestion`,
  `handleInquiryText`, ni mover funciones): import de `parseBookingReason`; comentario de
  `ConversationOptions.alertJid`; `STEP.BOOK_REASON`; `Ctx.reason`; bloque `BOOK_REASON` en
  `handleIncoming` entre `AWAIT_QUESTION` e `isExitWord` (solo `isExitCommand`/`isMenuCommand` como
  mensaje entero); `case STEP.BOOK_CONFIRM` con `opts`; `handleBookSlot` (lee solo el servicio; si
  `asksReason` → `BOOK_REASON` + `ASK_BOOKING_REASON`, si no → `sendBookingSummary`);
  `sendBookingSummary` y `handleBookReason` nuevas justo después de `handleBookSlot`;
  `handleBookConfirm` con `opts` y `reason: ctx.reason ?? null, professionalAlertJid: opts.alertJid`;
  `handleIncomingMedia` acepta `BOOK_REASON` y responde `BOOKING_REASON_TEXT_ONLY`.
  No se loguea el motivo en ningún lado.
- Nuevo `scripts/test-booking-reason.ts` + script `test:booking-reason` en `apps/bot/package.json`.
  Sigue todas las reglas de 10.4: alertas a `ALERT_JID` falso por `opts.alertJid`/`professionalAlertJid`;
  sin IA (claves borradas antes de la primera llamada a `getBotAiRuntime`, que es perezoso, y
  `aiProvider: null`); sin Mercado Pago (el servicio con seña está inactivo y solo se usa desde el
  dominio, sin `createDepositCheckout`); aborta si `BotStatus.connected` o `botPaused`; crea sus 2
  pacientes y 3 servicios `HU013 … (TEST)` y borra todo por id; cada turno creado se pasa a
  `needsGoogleSync: false` por id inmediatamente después de cada mensaje/llamada (así nunca llega a
  Google Calendar; además el bot está detenido y es el único que corre el sync).
  El escenario 4 recorre, además de los 5 salteos de la SDD, los 5 nuevos de P2 (`saltar`,
  `no gracias`, `prefiero no decirlo`, `no quiero`, `después`).
- Salida: **17/17 escenarios OK**, "Datos de prueba borrados (por id)."

### Bloque 4: apps/web — hecho

Skills: `ui-ux-pro-max` (consultas: errores junto al campo con `aria-describedby`, botón de solo
ícono con `aria-label`), `ui-styling` y `web-design-guidelines` como autochequeo (abajo). Se siguió
el JSX de la sección 7 de la SDD; sin dependencias nuevas.

- `lib/appointments.ts`: re-exporta `updateAppointmentReason` e `InvalidBookingReasonError`.
- `(panel)/actions.ts`: `createSchema.reason` (`max(5000)` opcional) + `validateBookingReasonInput`
  antes de crear, `reason: r.reason` a `createAppointment`, `InvalidBookingReasonError` en el catch;
  `saveAppointmentReasonAction(id, reason)` nueva al final (5.1, `revalidatePath("/")` y
  `revalidatePath("/pacientes/<id>", "layout")`).
- `api/appointments/route.ts`: `reason` en `extendedProps` (el `title` no cambia).
- `new-appointment-modal.tsx`: campo "Motivo de consulta (opcional)" con contador `n/500`,
  `maxLength`, ayuda "No se le manda al paciente.", reset al crear.
- `appointment-detail-sheet.tsx` + `calendar-client.tsx`: `SelectedAppointment.reason`; fila "Motivo"
  con "—" o el texto (`whitespace-pre-wrap break-words`), lápiz con `aria-label="Editar motivo"`,
  editor inline con `onSubmit` + `preventDefault` + `useTransition` (sin `<form action>` ni
  `await confirm()`), contador, error que conserva lo tipeado, "Cancelar" restaura. `disabled` de las
  acciones suma `savingReason`. El sheet no se cierra al guardar.
- Consulta clínica: tarjeta "Motivo indicado al reservar" de solo lectura arriba de Notas, solo si
  el turno tiene motivo.
- Ficha → Turnos: columna "Motivo" entre Servicio y Precio con el nuevo
  `pacientes/[id]/appointment-reason-cell.tsx` (truncado 16rem, `title`, expande al tocar,
  `aria-expanded`, foco visible). `AppointmentsSection` sigue siendo server component.
- `/servicios`: `lib/services.ts` (`ReasonFields`), `actions.ts` (`asksReason: z.enum(["0","1"])`,
  ausente → true), `service-form.tsx` (switch "Pedir motivo al reservar" con `Label`/descripción e
  input oculto; `setAsksReason(true)` tras crear), `service-card.tsx` (badge "Pide motivo"),
  `page.tsx` (`asksReason` al `EditableService`).
- No se tocó: portal, `/asistente`, `gcal.ts`, `botAi.ts`, `bot-ai-tools.ts`, título del evento del
  calendario, ni los archivos de la otra persona (`alimentos/**`, `planes/**`, `plantillas/**`,
  `food-picker.tsx`, `ai-food-catalog.ts`, HU-010) ni los del PR #8 (`workers*.ts`, `botAi*.ts`,
  `handleQuestionText`).

Autochequeo `web-design-guidelines` (reglas de vercel-labs, descargadas): botón de ícono con
`aria-label` e ícono `aria-hidden` OK; controles con label (Field envuelve, `sr-only` + `htmlFor`
en el editor, `Label htmlFor` en el switch) OK; foco visible (`focus-visible:ring-2` en la celda) OK;
placeholder y "Guardando…" con `…` OK; contenido largo con `truncate`/`break-words` y `min-w-0` OK;
`autoFocus` solo en el único campo del editor inline (desktop). Sin hallazgos que requieran cambio.

### Bloque 5: verificación — hecho

| Comando | Resultado |
|---|---|
| `npm run db:generate` | OK |
| `npm run typecheck` | core, db, bot y web limpios |
| `npm run test` | **49 archivos, 962/962** (868 previos + 94 nuevos: 70 `booking-reason`, 6 `messages`, 12 `appointments`, 3 `gcal-and-ai-privacy`, 3 `payments`) |
| `prisma migrate status` | "Database schema is up to date!" (19 migraciones) |
| `npm run test:booking-reason --workspace apps/bot` | **17/17 escenarios OK**, datos borrados por id |
| `npm run test:confirm-flow --workspace apps/bot` | 5/5 OK |
| `npm run test:after-hours --workspace apps/bot` | 12/12 OK |
| `npm run test:bot-ai --workspace apps/bot` | 18/18 OK |
| `npm run lint --workspace apps/web` | sin errores; 1 warning preexistente (`ajustes/logo-form.tsx` alt) ajeno a la HU |
| `./ops/harness/verify.sh` | "Arnés OK." (WARN informativos: migración nueva y bot tocado, ambos revisados) |

Base de desarrollo, solo lectura, antes / después de todo (migración + 4 simulaciones):

- Conteos Appointment|Patient|Service|OutboundMessage|ConversationState|Consultation|Payment:
  `18|14|9|6|7|20|3` → `18|14|9|6|7|20|3`.
- md5 de `Service` sin `asksReason`: `d405108c…` = `d405108c…` (los 9 servicios reales intactos:
  precio, seña, activo, recomendaciones, etc.).
- md5 de `Appointment` sin `reason`: `26eeb403…` = `26eeb403…`; md5 de `Patient`: `8a431f3e…` =
  `8a431f3e…`; md5 de `Professional`: `498116da…` = `498116da…`.
- Chequeo de la SDD (11): pacientes `549000000003_` = 0; servicios `HU013 %(TEST)` = 0;
  `OutboundMessage` a `5490000000099@…` = 0; `asksReason` = (9, 9) (por el DEFAULT de la migración,
  D4); turnos con motivo = 0 (D10); `Professional.phoneJid is null` = t.

## Contrato compartido

Las firmas coinciden con la sección 4 de la SDD: `booking-reason.ts` (constantes, tipos y 5
funciones), `bookingReasonLine`, `confirmBooking`/`professionalNewBookingAlert` con `reason?`,
`InvalidBookingReasonError`, `createAppointment` con `reason?`/`professionalAlertJid?`,
`updateAppointmentReason({ id, reason }) → { id, patientId, reason }`, `STEP.BOOK_REASON`,
`Ctx.reason`, `handleBookReason`, `sendBookingSummary`, `handleBookConfirm(..., opts)`,
`saveAppointmentReasonAction(id, reason)`. Única extensión: `BOOKING_REASON_SKIP_WORDS` suma las 5
palabras de la resolución P2 (sección 15, prioridad sobre 4.1).

## Decisiones no obvias

- `develop` no se mergeó (ver Preparación): pendiente para el orquestador antes del PR; no hay
  solapamiento de archivos.
- `updateAppointmentReason` quedó justo después de `createAppointment` en `domain/appointments.ts`
  (la SDD no fijaba ubicación).
- El script anota los turnos y apaga `needsGoogleSync` después de **cada** mensaje simulado, no solo
  al final, para que ningún turno de prueba quede marcado para Google aunque se corte la corrida.
- El escenario 14 usa el último horario libre del servicio activo `HU013 Con motivo` para el servicio
  inactivo con seña (`checkSlotAvailable` no exige servicio activo; `getAvailableSlotsForService` sí).
- P3: sin limpieza del `context` en esta HU (resolución del usuario).

## Recorrido visual

Pendiente del orquestador (sección 11, "Chequeo manual en el panel"). No se crearon servicios ni
turnos desde la UI.

## Archivos

Nuevos: `packages/core/src/booking-reason.ts`, `booking-reason.test.ts`, `messages.test.ts`;
`packages/db/prisma/migrations/20261003011808_booking_reason/migration.sql`;
`packages/db/domain/appointments.test.ts`, `gcal-and-ai-privacy.test.ts`;
`apps/bot/scripts/test-booking-reason.ts`;
`apps/web/src/app/(panel)/pacientes/[id]/appointment-reason-cell.tsx`.

Modificados: `packages/core/src/{messages,index}.ts`; `packages/db/prisma/schema.prisma`;
`packages/db/domain/{appointments,payments,payments.test}.ts`; `apps/bot/src/conversation.ts`;
`apps/bot/package.json`; `apps/web/src/app/(panel)/{actions.ts,new-appointment-modal.tsx,appointment-detail-sheet.tsx,calendar-client.tsx}`;
`apps/web/src/app/(panel)/servicios/{actions.ts,service-form.tsx,service-card.tsx,page.tsx}`;
`apps/web/src/app/(panel)/pacientes/[id]/{page.tsx,appointments-section.tsx,consultas/[consultationId]/page.tsx}`;
`apps/web/src/app/api/appointments/route.ts`; `apps/web/src/lib/{appointments,services}.ts`;
`README.md`. Sin commits.
