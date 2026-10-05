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
