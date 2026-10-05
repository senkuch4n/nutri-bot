# Review — HU-017b (entrega 017b-1)

**Veredicto:** APPROVED

Diff revisado: `git diff feat/hu-017c4-informe...HEAD` (commits 57a44a7 → 29bb915), sin los archivos del arnés.
Verificación propia (2026-10-04): `npm run typecheck` exit 0 (core, db, bot, web); `npm run test` 116 archivos /
1921 tests en verde; `./ops/harness/verify.sh` "Arnés OK", exit 0. No levanté el bot ni escribí en la base.

## Checkpoints
- C1 backlog válido, 1 HU activa por responsable: [x] verify.sh "backlog/ válido (30 HU; senkuch4n: HU-017b)".
- C1 `progress/current-senkuch4n.md` refleja la HU: [x] últimas líneas: 017b-1 → `en_revision`.
- C1 no toca HU de la otra persona: [x] el diff solo trae `backlog/HU-017b.json`, docs/SDD/progress de HU-017b.
- C1 verify.sh exit 0: [x].
- C2 `docs/hu-017b-agenda-gestion.md` completa: [x].
- C2 `Refactorizaciones/017b-agenda-gestion.md` con workspaces, checklist y contrato: [x].
- C2 firmas = contrato: [x] `parsePhoneInput`/`PHONE_INPUT_TEXT` (packages/core/src/phone-input.ts), todo 4.2 en
  packages/core/src/agenda.ts (textos de `AGENDA_TEXT` exactos), 4.3 en apps/web/src/lib/calendar-route.ts,
  `CreateAppointmentResult`/`AppointmentPatientOption`/`listAppointmentPatientsAction` (actions.ts:31-34, 118-169),
  `PaymentFormState` con `kind`/`amount` (pagos/actions.ts:7), `hasGuardedPending` + opciones `guardUnload`/
  `errorMessage`/`onCommitted` opcionales (deferred-delete.ts), `PendingUnloadGuard(): null`, `SelectedAppointment`
  con `patientJid`/`patientLabel`/`hasFullPayment`.
- C3 lógica pura en core, nada duplicado: [x] teléfono y textos en core; ruteo/mecanismo en `apps/web/src/lib` con test.
- C3 schema/domain: [x] no se tocaron `packages/db/**`, `schema.prisma` ni migraciones; igual el bot compila (typecheck
  del bot limpio, core cambió).
- C3 migraciones: [x] no aplica (no hay).
- C3 rutas protegidas / portal: [x] `/api/appointments` sigue con 401 sin sesión (route.ts:7-8, con test); las server
  actions nuevas viven bajo `(panel)` y quedan detrás del middleware de Auth.js, igual que las existentes. Portal no
  tocado.
- C3 bot en silencio / textos: [x] `apps/bot/**` y `messages.ts` sin cambios (T4); lo que se encola es lo de hoy.
- C3 sin console.log ni TODOs: [x] grep sobre los .ts/.tsx del diff, vacío.
- C4 typecheck limpio: [x].
- C4 core con tests y `npm run test` pasa: [x] `phone-input.test.ts` y `agenda.test.ts` cubren los casos de 9-1.
- C4 flujo del bot simulado sin WhatsApp real: [x] el bot no se tocó; la verificación en runtime del implementer se
  hizo con el bot apagado, JID inventados y limpieza por id (conteos iguales antes y después, impl §Verificación).
- C4 PDF/documento: [x] no aplica.
- C5 `progress/impl_HU-017b.md` describe lo tocado: [x].
- C5 `progress/review_HU-017b.md` con veredicto: [x] (este archivo).
- C5 sin scripts sueltos ni datos de prueba: [x] `git status` solo muestra los archivos ajenos que ya estaban sin
  trackear; el implementer reporta conteos 21|22|12|20|6 iguales a los de antes.

## Puntos pedidos por el orquestador

- **WhatsApp, cancelación diferida.**
  - Durante el plazo no se encola nada: `scheduleCancel` (calendar-client.tsx:245-259) solo llama a
    `deferredDelete`; `cancelAppointmentAction` corre recién en `commit`, que dispara `onAutoClose`/`onDismiss` del
    toast (deferred-delete.ts, `useDeferredDelete`). Con "Deshacer", `undo` borra la entrada sin llamar a commit.
  - Al vencer encola una sola vez: el store resuelve cada entrada una vez (`entry.result` cacheado, `state !==
    "pending"` → SKIPPED; el flag `settled` atiende un solo callback del toast). Además, si llegaran dos entradas
    para el mismo turno, `cancelAppointment` no encola si el turno ya no está `CONFIRMED`, y la cola tiene unicidad.
  - Doble clic: "Cancelar turno" pasa por `useConfirm` (AlertDialog modal) y llama a `onCancel` una sola vez
    (appointment-detail-sheet.tsx:308-318); después el evento queda oculto y no se puede volver a abrir. "Crear
    turno" queda deshabilitado con `loading`/`!ready`, y Enter en el buscador hace `preventDefault`
    (patient-picker.tsx:121-124).
  - Aviso al cerrar: `PendingUnloadGuard` (components/pending-unload-guard.tsx) con `useSyncExternalStore` sobre
    `hasGuardedPending()`, que cuenta `pending` y `committing`; está montado una vez en `(panel)/layout.tsx:64`, así
    el aviso sigue aunque se navegue a otra página del panel. Tests de `hasGuardedPending` y de `subscribe` en
    deferred-delete.test.ts.
- **`createAppointmentAction`.** Con `patientId` hace solo `findUnique` y no llama a `findOrCreatePatient` ni escribe
  `Patient` (actions.ts:66-75); el test fija que `update`/`upsert`/`findOrCreatePatient` no se llaman. Paciente nueva
  con un JID existente → `existingPatient` sin crear nada (actions.ts:80-91, con test).
- **Teléfono en core.** `parsePhoneInput` implementa las reglas de 4.1 en orden. Probé a mano los casos del test con
  "+54 0351 15 …" y "0054 9 …". Los tests cubren todos los casos de 9-1.
- **Servidor → cliente.** `page.tsx` pasa solo datos (strings, arrays, objetos planos). `layout.tsx` monta un
  componente cliente sin props. `actions.ts` exporta solo funciones async y `export type`. La URL se escribe con
  `replaceUrlInRouter` (`replaceState(null, …)`). En `apps/web/src` no hay ningún `history.state` en código (solo en
  comentarios y en un test de guarda).
- **domain / bot.** `packages/db/domain` no se tocó; el bot compila.
- **Zona de imleticio.** El grep de 10.2 sobre el diff da vacío (alimentos, plantillas, planes, food-picker,
  meals-editor, plan-pdf, pdf-theme).

## Dudas (no bloqueantes)
- `apps/web/src/app/globals.css`: se borraron las reglas `.fc .fc-button-primary*` y `.fc-toolbar-title`, como pide la
  SDD (4.4). Pero `apps/web/src/app/(panel)/dev-diseno/_sections/calendar.tsx:90` todavía usa `headerToolbar`, así que
  la demo de `/dev-diseno` (solo en desarrollo) queda con los botones de FullCalendar sin estilo. Se puede revisar en
  017b-2.
- `todayKey` viene del servidor y no se actualiza: con la pestaña abierta después de medianoche, la URL canónica y
  "Hoy"/"Mañana" de "Nuevo turno" usan el día anterior hasta recargar. Ya pasaba antes con el resumen; es menor.
- `parsePhoneInput("54 9 351 15 555 2345")` (sin "+", con 9 y con 15) devuelve `invalid`. La SDD no lo contempla
  y la vista previa evita el error. Es un caso borde para anotar.
- `createAppointmentAction` (paciente nueva): entre `findUnique` por JID y `findOrCreatePatient` (upsert) hay una
  ventana en la que, si otra vía crea la misma paciente, el upsert le pondría el nombre tipeado. Es muy improbable
  (una sola usuaria) y queda tal como lo pide la SDD (4.6, sin tocar domain).
- No se hicieron las capturas antes/después (0.4 y 7.1, `docs/auditoria-apple/017b/`). El implementer lo declara y
  la SDD no las commitea. Las cubre en parte el recorrido del orquestador.
- `?fecha=X` sin vista se reescribe a `?fecha=X&vista=dia`, cuando 10.1 decía "la URL queda igual". Coincide con el
  contrato de `calendarRouteQuery` (Q2) y lo que se ve es lo mismo: es correcto.
- Foco inicial del panel en "Editar motivo": ya está anotado como R1 para 017b-2.

---

# Review — HU-017b (entrega 017b-2: disponibilidad y servicios, con R1–R3)

**Veredicto:** APPROVED

Diff revisado: `git diff feat/hu-017b-agenda...HEAD` (commits 8cea11c → affa97d), sin los archivos del arnés.
`feat/hu-017b-agenda` es ancestro de HEAD. Verificación propia (2026-10-04): `npm run typecheck` exit 0 (core, db,
**bot** y web); `npm run test` 120 archivos / 1988 tests en verde; `./ops/harness/verify.sh` "Arnés OK", exit 0 (el
WARN "Se tocó el bot" sale porque cambió core; `apps/bot/**` no está en el diff). No levanté el bot ni escribí en la
base.

## Checkpoints
- C1 backlog válido, 1 HU activa por responsable: [x] verify.sh "backlog/ válido (30 HU; senkuch4n: HU-017b)".
- C1 `progress/current-senkuch4n.md` refleja la HU: [x] última línea: 017b-2 → `en_revision`.
- C1 no toca HU de la otra persona: [x] solo `backlog/HU-017b.json` y progress de HU-017b; el grep de zona de
  imleticio (alimentos, planes, plantillas, food-picker, meals-editor, plan-pdf, pdf-theme) da vacío.
- C1 verify.sh exit 0: [x].
- C2 HU completa: [x] `docs/hu-017b-agenda-gestion.md` (escenarios de 017b-2 en líneas 365-431).
- C2 SDD con workspaces, checklist y contrato: [x] sección 017b-2 + "Decisiones" + "Agregados a 017b-2".
- C2 firmas = contrato: [x] `availability-text.ts` (todo 4.1, textos de `AVAILABILITY_TEXT` exactos; `formatClock`
  reexportado de `after-hours`, mismo binding; `exceptionDayLabel` es un export aditivo), `service-summary.ts` (4.2,
  `SERVICE_TEXT` exacto), `disponibilidad/actions.ts` (`FormState` con `field`, `updateRuleAction` nueva,
  `deleteRuleAction`/`deleteExceptionAction` → `Promise<FormState>`, `addExceptionAction` con `kind`),
  `toggleServiceAction(id, active): Promise<{ ok; error? }>` (servicios/actions.ts:105), `updateService` con
  `active?` (lib/services.ts:70). Keys diferidas `rule:<id>`/`exception:<id>` sin `guardUnload` (view.tsx:27-33,
  75-80, 96-101).
- C3 lógica pura en core: [x] textos, superposición, excepciones y resumen en core con tests; nada duplicado.
- C3 schema/domain: [x] sin cambios en `packages/db/**` ni `schema.prisma` (T1/T3); el bot compila.
- C3 migraciones: [x] no aplica.
- C3 rutas protegidas / portal: [x] no hay rutas nuevas; las actions viven bajo `(panel)` detrás del middleware de
  Auth.js como las existentes. Portal no tocado.
- C3 bot en silencio / textos: [x] `apps/bot/**` y `messages.ts` sin cambios (T4). Lo que lee el bot
  (`packages/db/domain/availability.ts:28-44`: reglas `active: true`, todas las excepciones con
  `type/startTime/endTime`) sigue igual: las columnas escritas son las mismas y `closed_range` (BLOCKED con horas) ya
  lo soportaba `core/slots.ts:65`.
- C3 sin console.log ni TODOs: [x] grep sobre las líneas agregadas, vacío.
- C4 typecheck limpio: [x].
- C4 core con tests y `npm run test` pasa: [x] `availability-text.test.ts`, `service-summary.test.ts`, `phone-input`
  (+2 casos R3).
- C4 flujo del bot simulado: [x] no aplica (el flujo del bot no cambia).
- C4 PDF/documento: [x] no aplica.
- C5 `progress/impl_HU-017b.md` sección 017b-2: [x].
- C5 `progress/review_HU-017b.md` con veredicto: [x] esta sección.
- C5 sin scripts ni datos de prueba: [x] el implementer declara limpieza por id con conteos y md5 de
  `AvailabilityRule`/`Service` iguales antes y después; no hay scripts nuevos en el diff.

## Puntos pedidos por el orquestador
- **Superposición solo contra activas:** `overlapState` (disponibilidad/actions.ts:52-59) busca
  `{ weekday, active: true }` y usa `findOverlap` con `excludeId` al editar (línea 87). La página lista solo activas
  (page.tsx:13-17). Test en actions.test.ts:65-69.
- **Editar/borrar no toca reglas ajenas:** `updateRuleAction` verifica `{ id, active: true }` (línea 84) y hace
  `update({ where: { id } })` con solo `weekday/startTime/endTime` (88-91); `deleteRuleAction` es
  `deleteMany({ where: { id, active: true } })` (107): por id, nunca con filtro amplio, y una inactiva no se puede
  borrar aunque llegue su id. `deleteExceptionAction` es `deleteMany({ where: { id } })` (171). Tests 98-110 y 133-142.
- **Q17:** `active` salió del schema de zod (servicios/actions.ts:19-22); `updateService(id, payload)` sin `active`
  (92); `requiresDeposit` y `asksReason` con `z.enum(["0","1"])`; el form manda hidden `"0"/"1"`
  (service-form.tsx:375, 461) y `prepInstructions=""` con el switch apagado (439). Tests que fijan que ni un
  `active=true` de un cliente viejo llega a `updateService` (servicios/actions.test.ts:46-62).
- **Pausar con Deshacer:** optimista con rollback si falla (service-card.tsx:67-91); `notify.undo` (8 s) llama a la
  misma action con `true`, con rollback y toast de error si falla. Pausar es inmediato, como dice la SDD 4.5.
- **Guardia de cambios:** `ServiceSheet` intercepta `onOpenChange(false)` con `useConfirm` ("¿Salir sin guardar?",
  "Seguir editando" como `cancelLabel`) (service-form.tsx:95-105) y `useUnsavedChangesGuard(open && dirty)` cubre
  links y recarga (85). "Hay cambios" compara un snapshot del `FormData` contra el del montaje, con chequeo después de
  clics para switches y recordatorios (231-242, 281-284). `cancelLabel?` en el hook es aditivo y los otros dos
  consumidores (report-editor, recipe-form) no cambian.
- **Props serializables:** `disponibilidad/page.tsx` y `servicios/page.tsx` pasan solo strings, números, booleanos y
  arrays planos (`reminders` ya parseados, `price`/`depositValue` como string). Íconos y callbacks se definen en
  cliente (T9a).
- **R1:** `onOpenAutoFocus` enfoca el `SheetTitle` con `data-appointment-title` y `tabIndex=-1`
  (appointment-detail-sheet.tsx:133-140, 347-353). **R2:** demo con `CalendarToolbar` y `headerToolbar={false}`
  (dev-diseno/_sections/calendar.tsx). **R3:** `parsePhoneInput` trata ≥12 dígitos con "54" como "+54"
  (phone-input.ts:77-82), con tests.

## Dudas (no bloqueantes)
- **Bug preexistente fuera del diff, importante para el bot:** `packages/db/domain/availability.ts:40` calcula el día
  de una excepción con `dayKeyInTz(e.date, tz)`, pero `date` se guarda a medianoche UTC (disponibilidad/actions.ts:150,
  igual que antes de esta HU). En Argentina (UTC-3) eso da el día **anterior**: comprobado,
  `formatInTimeZone(2027-03-15T00:00Z, "America/Argentina/Buenos_Aires")` → `2027-03-14`. El panel muestra el 15
  (page.tsx:29, `toISOString().slice(0,10)`) y el bot aplicaría la excepción el 14. Está así desde el MVP (06f5dd9) y
  la SDD prohíbe tocar domain (T3), así que no bloquea. Pero ahora la pantalla invita a cargar excepciones: conviene
  una tarea aparte (p. ej. `e.date.toISOString().slice(0,10)` en domain, con test) antes de que la usuaria cargue un
  feriado real.
- El chequeo de superposición del servidor cuenta también un horario con borrado pendiente (oculto en el cliente
  durante los 8 s). Si se borra 9–13 y enseguida se agrega 10–12, sale "Se superpone con el horario de 9:00 a 13:00"
  aunque no se vea. Falla del lado seguro; menor.
- `addRuleAction` no envuelve `availabilityRule.create` en try/catch (actions.ts:71): un error de base va al error
  boundary en vez de quedar inline. Igual que antes de la HU.
- El tipo de excepción es una lista de radios de 44 px en vez de `SegmentedControl` (6-2). Está justificado en el
  reporte (no entra legible a 390 px) y cumple el escenario de la HU.
- En `exception-sheet.tsx:141,153` los `defaultValue` de Desde/Hasta dependen de `kind`, pero al pasar de "un rato" a
  "otro horario" los inputs ya montados conservan 14:00–16:00. Es cosmético.
- Pausar, reanudar con el switch y volver a pausar deja dos toasts con "Deshacer" vivos; el primero reactivaría el
  servicio. Es un caso raro e inofensivo (reactivar es idempotente).

---

# Review — HU-017b (entrega 017b-3: mensajes, pagos y avisos, con R4–R6)

**Veredicto:** CHANGES_REQUESTED

Diff revisado: `git diff feat/hu-017b2-disponibilidad...HEAD` (8 commits, `1a626da`..`d45a06c`). Sin contar los
archivos del arnés son 31 archivos, todos de la tabla 7-3 más los que pedían R4–R6 (`ui.tsx` `Metric`, `notify.ts`).
Corrí los comandos yo: `npm run typecheck` da exit 0 (core, db, bot, web), `npm run test` da 124 archivos y 2029 tests
en verde, y `./ops/harness/verify.sh` da "Arnés OK". Consulté la base de desarrollo en solo lectura: hay 0 pacientes y
0 turnos `hu017b3*`, `PatientInquiry` en 0, `Payment` en 6, `OutboundMessage` en 12 y 0 filas `AD_HOC`.

## Checkpoints
- C1 backlog válido, una sola HU activa por responsable: [x] (`HU-017b` `en_revision`, senkuch4n).
- C1 bitácora: [x]. C1 nada de la otra persona: [x]. C1 verify.sh: [x] (exit 0).
- C2 HU: [x]. C2 SDD: [x]. C2 firmas iguales al contrato: [x]. Coinciden `month-range`, `outbox-text`,
  `payment-text`, `onUndone?` y `MESSAGE_KIND_TEXT satisfies Record<MessageKind, string>` (`avisos/page.tsx:19`).
- C3 lógica pura en core: [x]. C3 schema/domain: [x] (no cambian; bot y web compilan).
- C3 migraciones: [x] (no hay ninguna). C3 rutas nuevas: [x] (no hay; las páginas siguen dentro de `(panel)`).
- C3 bot en silencio: [x] (`messages.ts` y `apps/bot` no cambian). C3 sin `console.log` ni TODO: [x].
- C4 typecheck: [x]. C4 tests de core y `npm run test`: [x]. C4 simulación del bot: [x] (no aplica). C4 PDF: [x] (no aplica).
- C5 `impl` describe lo tocado: [x]. C5 veredicto: [x] (esta sección).
- C5 sin datos ni scripts de prueba: [x] (verificado en la base, en solo lectura).

## Puntos pedidos por el orquestador
- **D14, comunicado diferido:** [x]
  - Nada se encola durante el plazo. `send()` solo programa la entrada (`broadcast-form.tsx:59-86`) y la action corre
    dentro de `commit`, recién en `onExpire` (`deferred-delete.ts:253-262`).
  - Al vencer encola una sola vez por destinatario. El store resuelve cada entrada una vez (`entry.result`,
    `deferred-delete.ts:89`), `settled` evita el doble `onAutoClose`/`onDismiss` y `broadcastRecipients` deduplica.
  - Doble clic en "Enviar a N": el contenido del AlertDialog tiene `data-[state=closed]:pointer-events-none`
    (`primitives/alert-dialog.tsx:86`), así que el segundo clic no llega mientras se cierra.
  - Remount: la key lleva `randomUUID` y solo se programa con el clic. Si el formulario se desmonta, el commit sale
    igual y una sola vez.
  - "Deshacer" devuelve el texto (`onUndone`, líneas 81-84, sin pisar algo nuevo) y hay test de que no corre si el
    undo llegó tarde.
  - El aviso al cerrar usa `guardUnload: true` y `PendingUnloadGuard` sigue en `(panel)/layout.tsx:64`.
- **D13, solo personas en el envío real:** [x]. `actions.ts:24` filtra con `broadcastRecipients` antes del
  `createMany`, y la página cuenta con la misma función (`page.tsx:40`). El test verifica que no se encolan
  `@newsletter`, `@g.us` ni `@broadcast` y que `@lid` sí.
- **D16, "Ya respondí" diferido:** [ ]. Ver hallazgo 1. Lo demás está bien: sin action nueva, la key es
  `inquiry-answered:<id>`, "Todas" ya no está, las pendientes van de la más vieja a la más nueva y no se escribe nada
  durante 8 s.
- **D12, mes en la zona de la profesional:** [x]. `monthKeyInTz`/`monthRangeInTz` con `fromZonedTime`. Un `?mes=`
  inválido o futuro cae al mes en curso (`pagos/page.tsx:32-36`), "›" está deshabilitado en el mes en curso y se usa
  `to − 1 ms` porque domain filtra con `lte`. Los tests cubren el 31/10 a las 23:30 en Argentina y el cruce de año.
- **D9, pago manual:** [x]. Toma los estados `CONFIRMED` y `COMPLETED` en ±7 días (`page.tsx:60`), precarga el precio
  al elegir el turno, carga la seña configurada al elegir "Seña" y el form se monta solo con el modal abierto, así
  que el precargado arranca fresco. La action no filtra por estado, así que acepta los `COMPLETED`.
- **"Reintentar" de la cola:** [x]. El botón por fila sigue sin confirmación, como antes. "Reintentar los N" pide
  confirmación con "Se vuelven a mandar por WhatsApp.".
- **Props de servidor a cliente:** [x]. `BroadcastForm` recibe solo `patientCount`, y el `sendAction` falso se define
  en `dev-diseno/broadcast-demo.tsx` ("use client"). `MessageRow`, `InquiryRow`, `PaymentRow` y `AppointmentOption`
  son planos (strings, números, booleanos).
- **R4:** [x] (`disponibilidad/actions.ts:72-76` + test). **R5:** [x] (`key={kind}` en `exception-sheet.tsx:135`, con
  `defaultValue` por tipo). **R6:** [x] (`id: service-paused:<id>` y `dismiss` al reanudar, `service-card.tsx:78-93`).

## Cambios requeridos
1. **"Ya respondí" con doble clic: "Deshacer" no deshace.**
   - Dónde: `apps/web/src/app/(panel)/mensajes/mensajes-view.tsx:92-100` (`markAnswered`) y `226-229` (el botón).
   - Qué pasa: la tarjeta sale con `AnimatePresence mode="popLayout"` (`:154-163`). Mientras dura el `exit`, el
     `m.li` sigue en el DOM y se puede clicar, porque Motion no le pone `pointer-events: none`. Un doble clic sobre
     "Ya respondí", algo habitual en este público, llama dos veces a `deferred(...)` con la misma key: quedan dos
     entradas en el store y aparecen dos toasts "Marcada como respondida".
   - Por qué importa: si ella toca "Deshacer" en el toast de arriba, ve "Listo, sigue pendiente", pero la otra entrada
     sigue pendiente. La tarjeta no vuelve (la key sigue en `pendingKeys`) y a los 8 s la consulta queda `ANSWERED`.
     La pantalla le dice algo que no pasa (D16).
   - Qué se espera: que un segundo pedido para una key que ya está pendiente sea un no-op, o que la tarjeta que está
     saliendo no reciba clics. Y un test que lo fije.
   - Aclaración: en el comunicado esto no pasa gracias al `pointer-events-none` del diálogo.

## Dudas (no bloqueantes)
- `broadcast-form.tsx:59-86`: `send()` no vuelve a validar que `text` tenga al menos 3 caracteres. Hoy lo cubre el
  `pointer-events-none` del diálogo. Si el diálogo cambia, una segunda llamada programaría un comunicado vacío que
  falla a los 8 s con "No se pudo mandar el comunicado.". Una guarda local daría defensa en profundidad.
- Si navega a otra pantalla del panel durante el plazo y toca "Deshacer", no se manda nada, como corresponde. Pero
  el texto se pierde, porque el formulario ya se desmontó. Es un caso borde y alcanza con anotarlo.
- `pagos/page.tsx:107-110`: los pagos `PENDING` (pendientes "ahora") aparecen en la lista de cualquier mes, también al
  mirar septiembre. Coincide con "Señas esperando pago no depende del mes", pero conviene que el recorrido confirme
  que no confunde.
- `retryMessageAction` (`avisos/actions.ts:39-45`, de antes, no cambió): pasa la fila a `PENDING` sin chequear que
  siga `FAILED`. No es de esta entrega.
- El "Guardando…" colgado de "Registrar pago" con `next start` que reporta el implementer es anterior a esta entrega
  (lo reprodujo sobre `c0bfca7`). Conviene una tarea aparte.
