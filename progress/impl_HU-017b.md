# Implementación HU-017b

## 017b-1: calendario, turno y nuevo turno (incluido el deep link `?fecha=`)

- **Estado:** done
- **Rama:** `feat/hu-017b-agenda` (contiene `feat/hu-017c4-informe`, verificado con `merge-base --is-ancestor`)
- **Modelo:** Opus. **Skills:** `apple-design` y `ui-ux-pro-max` antes del JSX; `web-design-guidelines` como autochequeo final.
- **Sin migración ni cambios en `schema.prisma`, `packages/db/**`, `apps/bot/**`, `backlog/**` ni en la zona de imleticio.** `messages.ts` sin cambios (T4).

### Commits (uno por fase, trailer `Co-Authored-By: Claude Opus 5.5`)

| Commit | Fase |
|---|---|
| `57a44a7` | 1. core: `phone-input.ts`, `agenda.ts` + tests, `index.ts` |
| `46adf67` | 2. `lib/calendar-route.ts` + test, `deferred-delete.ts` (`guardUnload`, `hasGuardedPending`, `errorMessage`, `onCommitted`) + tests, `PendingUnloadGuard` en el layout del panel |
| `e219ca5` | 3. `createAppointmentAction` (4.6) y `listAppointmentPatientsAction` + `actions.test.ts`; `/api/appointments` (4.7) + `route.test.ts`; pago manual (action + test + form) |
| `22f5c06` | 4. página del calendario (4.5), `calendar-toolbar.tsx`, `calendar-client.tsx`, `loading.tsx`, `globals.css` (bloque `.fc`) |
| `e0737dd` | 5. panel del turno (5.1), cancelar con "Deshacer", `appointment-payment-modal.tsx` |
| `1151a7c` | 6. `patient-picker.tsx` y `new-appointment-modal.tsx` (5.2) |
| `0ecf1da` | Arreglos de la verificación en runtime (abajo, "Hallazgos") |

El commit de la fase 7 es solo este archivo.

### Archivos tocados

Todos son de la tabla 7.2 de la SDD: `packages/core/src/{phone-input,agenda}.ts` (+ tests) e `index.ts`;
`apps/web/src/lib/{calendar-route,deferred-delete}.ts` (+ tests); `components/pending-unload-guard.tsx`;
`app/(panel)/{layout,actions,actions.test,calendar-client,calendar-toolbar,appointment-detail-sheet,appointment-payment-modal,new-appointment-modal,patient-picker}.tsx|ts`;
`app/(panel)/(calendario)/{page,loading}.tsx`; `app/(panel)/pagos/{actions,actions.test,manual-payment-form}`;
`app/api/appointments/{route,route.test}.ts`; `app/globals.css` (solo `.fc`).
No se tocaron `pagos/page.tsx`, `pagos/manual-payment-dialog.tsx` ni `pacientes/**`.

### Contrato compartido

Las firmas coinciden con la sección 4 de la SDD: `parsePhoneInput`, `PHONE_INPUT_TEXT`, `CalendarView`,
`patientDisplayName`, `appointmentEventTitle`, `firstName`, `appointmentDayTime`, `appointmentDayAtTime`,
`AgendaDayCount`, `countAgendaDay`, `todaySummaryText`, `weekSummaryText`, `nextAppointmentText`,
`calendarPeriodTitle`, `calendarNavLabels` y `AGENDA_TEXT` (textos exactos); `CALENDAR_VIEWS`, `FcViewType`,
`FC_VIEW`, `calendarViewFromFc`, `defaultCalendarView`, `resolveCalendarRoute`, `calendarRouteQuery` y `calendarHref`;
`DeferredDeleteStore.hasGuardedPending` y `DeferredDeleteOptions.{guardUnload,errorMessage,onCommitted}`, todos
opcionales; `PendingUnloadGuard(): null`; `CreateAppointmentResult`, `AppointmentPatientOption` y
`listAppointmentPatientsAction`; `PaymentFormState.{kind,amount}`; `AppointmentOption.patientLabel?`; props opcionales
de `ManualPaymentForm` (`defaultAppointmentId`, `currency`, `onDone(r)`); `SelectedAppointment` con `patientJid`,
`patientLabel` y `hasFullPayment`. Las acciones `cancelAppointmentAction`, `sendReminderNowAction`,
`getAppointmentRemindersAction`, `setStatusAction` y `saveAppointmentReasonAction` no cambian de firma.

### Decisiones no obvias

- **El montaje lee `window.location.search` (no `useSearchParams`).** Es la misma URL, y así el valor es el del
  navegador en ese momento (Q3). `useSearchParams().toString()` se sigue usando para detectar cambios de URL que vienen
  de afuera, como el ítem "Calendario" de la sidebar. La query que escribe el calendario se guarda en un ref y se ignora.
- **Esos cambios externos se aplican con `changeView(tipo)` y después `gotoDate(día)`, en dos llamadas.** Con
  `changeView(tipo, día)`, FullCalendar 6 dejaba como fecha actual el inicio de la semana: lo encontró el runtime (abajo).
- **`?fecha=X` (sin vista) se reescribe a `?fecha=X&vista=dia`.** Es la regla canónica de `calendarRouteQuery`: otro día
  lleva siempre fecha y vista. 10.1 dice "la URL queda igual", pero eso choca con el contrato y manda el contrato. Lo que
  se ve no cambia: es el mismo día en vista Día.
- **El foco después de cancelar va al título `h2`.** `scheduleCancel` apunta `lastEventElRef` al título antes de que el
  panel se cierre, y `onCloseAutoFocus` del panel lo enfoca. Al título se le dio un anillo de foco visible (autochequeo).
- **"Volver a confirmado" cierra el panel, como antes.** "Vino a la consulta" lo deja abierto, como dice la SDD.
- **El "Registrar pago" del panel se dibuja dentro del árbol de React del panel**, así interactuar con el modal no
  cuenta como clic afuera del panel no modal. El efecto de `ManualPaymentForm` depende solo de `state` y lee
  `onDone`/`currency` de un ref, porque el diálogo de `/pagos` pasa un callback inline.
- **"Nuevo turno" usa los primitivos `Dialog`/`Sheet` en vez de `Modal`.** Hace falta `onOpenAutoFocus`: el buscador
  recibe el foco solo con puntero fino, y en el celular el foco va al contenedor, así el teclado no se abre solo.
  `onEscapeKeyDown` evita que Esc cierre el modal cuando hay texto en el buscador (ese Esc borra la búsqueda).
- **"Paciente nueva" toma lo que había en el buscador:** con letras va al nombre; si son solo dígitos, al teléfono.
  Si el servidor devuelve `existingPatient` y la lista no la tenía, se agrega a las opciones para que aparezca el aviso
  "Ese número es de …" con "Elegir a …".
- **El tinte de las horas fuera de atención quedó en `hsl(var(--muted) / 0.45)`.** Se borraron las reglas sin uso
  `.fc-toolbar-title` y `.fc-button-primary*`.
- **Autochequeo `web-design-guidelines`:** se agregó el foco visible del título. El botón "Crear turno" queda
  deshabilitado, con un texto que dice lo que falta, y los textos exactos de `AGENDA_TEXT` se conservan: las dos cosas
  las pide la SDD aunque la guía general diga otra cosa.

### Verificación

**Comandos (desde la raíz):**
- `npm run db:generate` OK. Sin `prisma migrate` de ningún tipo.
- `npm run typecheck`: core, db, bot y web en verde.
- `npm run test`: 116 archivos, 1921 tests en verde. Los nuevos: `phone-input` (28), `agenda` (21), `calendar-route`
  (13), `deferred-delete` (+5, sin tocar las aserciones de 017c), `actions` (9), `api/appointments/route` (3) y
  `pagos/actions` (4).
- `npm run lint --workspace apps/web`: solo el warning previo de `ajustes/logo-form.tsx`.
- `./ops/harness/verify.sh`: "Arnés OK". El aviso "Se tocó el bot" es porque cambió core. El bot no se tocó: está
  apagado y no se levantó.

**Builds en una copia del scratchpad** (el dev server de :3100 no se tocó y sigue respondiendo 200):
- `next build` (webpack): exit 0.
- `next build --turbopack`: "Compiled successfully", exit 0.
- Ninguno de los dos mostró "Only async functions…", "useSearchParams() should be wrapped…" ni "cannot be passed".

**Runtime:** `next start -p 3197` sobre el build de webpack, con una cookie de Auth.js generada en local y Chromium
headless (`playwright-core` en el scratchpad).
- Con recarga, todas en 200 y sin "Algo salió mal": `/`, `/?fecha=<mañana>`, `/?fecha=2026-13-40`,
  `/?fecha=ma%C3%B1ana`, `/?fecha=`, `/?vista=mes`, `/?fecha=<mañana>&vista=semana`, `/pagos` y `/pacientes`.
- `GET /api/appointments` respondió 200 con `patientLabel`, `patientJid` y `hasFullPayment`.
- El log del servidor quedó sin "cannot be passed", sin "Functions cannot" y sin errores. La consola del navegador quedó
  sin avisos de hidratación ni errores, a 1366 y a 390 px. El único error fue el esperado de la prueba sin red.
- **1366 px:** abre en Semana con el título "28 de septiembre – 4 de octubre". `?fecha=<mañana>` abre Día, "Lunes 5 de
  octubre", con el primer turno a la vista. › lleva a `?fecha=<pasado>&vista=dia` sin cambiar `history.length`;
  recargar conserva el día y la vista. El link "Calendario" de la sidebar vuelve a `/` y a hoy. ‹ › miden 44 px y
  tienen aria-label.
- **390 px táctil:** abre en Día. La barra va en dos renglones (el título arriba). "Hoy" mide 44 px. No hay scroll
  horizontal. El panel del turno ocupa los 390 px. "Nuevo turno" sale como sheet inferior y el foco no cae en el input.
  Un toque en una franja abre "Nuevo turno".
- **Flujos con datos de prueba** (con el bot apagado, verificado con `pgrep`; `BotStatus.connected = f`):
  - **Panel del turno A:** se leen el nombre, "Antropometría · Lunes 5 de octubre, 10:00", "Confirmado", "Ver ficha",
    "WhatsApp" (`href` = `https://wa.me/5493510017101`, no se apretó), "+54 9 351 001-7101", "Editar motivo",
    "Vino a la consulta" de 44 px y "Cancelar turno" con "Le avisamos por WhatsApp.".
  - **Turno B (`@lid`):** "WhatsApp no muestra el número" y ningún enlace de WhatsApp. El turno C se titula
    "+54 9 351 001-7104 · …".
  - **Cancelar y deshacer:** la confirmación dice "¿Cancelar el turno de Prueba Brenda 017b?" y "…del lunes 5 de octubre a
    las 10:00.", con el foco en "Volver". El turno se oculta, el toast dice "…Le avisamos a Prueba en unos segundos." y
    el foco queda en el título. Durante el plazo el turno sigue `CONFIRMED` y hay 0 filas. Con "Deshacer" el turno
    vuelve y sale "Listo, el turno sigue en pie"; 10 s después sigue `CONFIRMED` con 0 filas.
  - **Recargar durante el plazo:** Playwright vio el diálogo `beforeunload`. El turno siguió `CONFIRMED`, con 0 filas.
  - **Dejar vencer el turno C:** pasó a `CANCELLED` y encoló 1 `CANCELLATION` `PENDING`, que **se borró por id en el
    acto** (`cmuuhdd9s000178ercsop39df`).
  - **Sin red al vencer:** sale "No se pudo cancelar el turno. Probá de nuevo." y el turno vuelve; sigue `CONFIRMED`,
    con 0 filas.
  - **Vino y pago:** "Vino a la consulta" muestra "Listo. Se creó su consulta." y aparece "Abrir la consulta".
    "Registrar pago" trae el monto precargado (40000). El toast dice "Pago registrado: $ 40.000 de Prueba Brenda 017b"
    y el botón desaparece. "Volver a confirmado" muestra "Volvió a confirmado".
  - **"Ver ficha" y "Atrás":** vuelve al mismo día y la misma vista.
  - **Nuevo turno, paciente existente:** el foco está en el buscador. El botón dice "Elegí para quién es". Al escribir
    "brenda 017" + Enter queda elegida, con su teléfono y "Cambiar". Con servicio, "Mañana" y horario, el toast dice
    "Turno creado para Prueba Brenda 017b, lunes 5 de octubre, 19:30". Su `CONFIRMATION` se borró por id. La paciente
    no cambió de nombre.
  - **Nuevo turno, paciente nueva:** escribir "351 001 7101" muestra la vista previa más "Ese número es de Prueba
    Brenda 017b" y "Elegir a Prueba". Con "0351 15 001 7103" muestra "+54 9 351 001-7103", sin aviso. Se creó la
    paciente "Prueba Nueva 017b" con su turno, y su `CONFIRMATION` se borró por id.
  - **Horario preelegido:** tocar las 9:00 de mañana en Semana deja "Mañana" y "9:00" elegidos. Tocar las 14:00 muestra
    "A las 14:00 no hay lugar para Antropometría. Elegí otro horario.".
  - **Teclado:** con Esc el panel se cierra y el foco vuelve al turno.
- **Limpieza solo por id.** Se borraron: el pago `cmuuhdsvt000678er7uqjmybw`; los turnos `hu017b1-turno-a/b/c`,
  `cmuuhdy22000a78erw9j4eyq4` y `cmuuhe0a8000g78erutr1qd1n`; y las pacientes `hu017b1-brenda/lid/sin-nombre` y
  `cmuuhe09m000d78erc4lodwde`. La consulta del turno A se borró sola al volverlo a confirmado (estaba vacía). Los
  conteos `Patient|Appointment|OutboundMessage|Consultation|Payment` quedaron en **21|22|12|20|6**, igual que antes.
  Ninguna `OutboundMessage` de prueba llegó a quedar en la cola. No se tocó Google Calendar: los turnos de prueba se
  insertaron con `needsGoogleSync=false`, y la sincronización de los creados por la UI la hace el bot, que estaba
  apagado; esos turnos se borraron.
- Se mató el `next start` y se borraron la copia, la cookie y `playwright-core` del scratchpad.

**Alcance del diff (10.2):** sin archivos de la zona de imleticio, de `apps/bot`, de `packages/db`, de `schema.prisma`
ni de migraciones, y `messages.ts` sin cambios. Comparado con `feat/hu-017c4-informe`, el diff también muestra
`backlog/`, `docs/` y `progress/current-*`, pero son de los commits del orquestador anteriores a esta entrega
(`d733361` y los previos). Mis commits no los tocan.

### Hallazgos de la verificación en runtime (arreglados en `0ecf1da`)

1. Con el calendario en Día de otro día, el link "Calendario" de la sidebar dejaba la URL en
   `?fecha=<lunes>&vista=semana`, en vez de `/`. La causa era `changeView(tipo, día)` (decisiones, arriba). Retestado:
   ahora da `/` y hoy.
2. El título `h2` no tenía foco visible (`outline-none`). Ahora tiene un anillo de foco (`focus-visible:outline-ring`).

### Pendiente / no hecho

- **No se hicieron las capturas antes y después** (0.4 y 7.1, `docs/auditoria-apple/017b/`). La verificación se hizo
  en runtime con aserciones sobre el DOM. Las capturas y las tres tareas de D1 quedan para el recorrido del orquestador
  (10.3).

---

## 017b-2: disponibilidad y servicios (con los agregados R1–R3)

- **Estado:** done
- **Rama:** `feat/hu-017b2-disponibilidad` (contiene `feat/hu-017b-agenda`, verificado con `merge-base --is-ancestor`). Sin push.
- **Modelo:** Opus. **Skills:** `ui-ux-pro-max` y `apple-design` antes del JSX; `web-design-guidelines` como autochequeo.
- **Sin migración ni cambios en `schema.prisma`, `packages/db/**`, `apps/bot/**`, `backlog/**` ni en la zona de imleticio.**
  `messages.ts` sin cambios (T4). El bot estuvo apagado todo el tiempo y no se levantó.

### Commits (uno por fase, trailer `Co-Authored-By: Claude Opus 5.5`)

| Commit | Fase |
|---|---|
| `8cea11c` | A. core: `availability-text.ts`, `service-summary.ts` + tests, `index.ts`. R3 en `phone-input.ts` + test |
| `cbeee44` | B. actions de disponibilidad (4.3) y servicios (4.4), `lib/services.ts`, tests con mocks |
| `0061b73` | C. disponibilidad: lista por día, `range-sheet.tsx`, borrado diferido `rule:<id>`, `loading.tsx` |
| `daa32e2` | D. excepciones en palabras, próximas y "Pasadas (N)", `exception-sheet.tsx`, borrado diferido `exception:<id>` |
| `af19946` | E. servicios: tarjeta, switch con transición y "Deshacer", formulario por grupos, guardia de cambios, `loading.tsx` |
| `2fb83cd` | R1 (foco inicial en el título del panel del turno) y R2 (demo del calendario con la barra propia) |
| `295245a` | Arreglos de la verificación en runtime (abajo, "Hallazgos") |

El commit de la fase F es solo este archivo.

### Archivos tocados

Los de la tabla 7-2: `packages/core/src/{availability-text,service-summary}.ts` (+ tests) e `index.ts`;
`disponibilidad/{page,view,schedule,exceptions,actions,actions.test,range-sheet,exception-sheet,loading}`;
`servicios/{page,service-card,service-form,reminders-editor,new-service-button,actions,actions.test,loading}`;
`lib/services.ts`. Además, por los agregados: `packages/core/src/phone-input.ts` (+ test, R3),
`(panel)/appointment-detail-sheet.tsx` (R1) y `(panel)/dev-diseno/_sections/calendar.tsx` (R2). Y
`lib/use-unsaved-changes-guard.ts`: se le agregó `cancelLabel?` opcional (ver "Decisiones").

### Contrato compartido

Las firmas coinciden con la sección 4 de 017b-2:
- `availability-text.ts`: `TimeRange`, `WEEKDAY_ORDER`, `WEEKDAY_NAMES`, `formatClock`, `timeRangePhrase`, `dayScheduleText`,
  `findOverlap`, `overlappingRangeIds`, `ExceptionKind`, `exceptionKindOf`, `exceptionFields`, `exceptionLine`,
  `splitExceptions` y `AVAILABILITY_TEXT` con los textos exactos. Un export de más, aditivo: `exceptionDayLabel(dayKey, todayKey)`
  ("Lunes 12 de octubre", con año si no es el de hoy). Lo usan `exceptionLine`, la confirmación de borrado y el nombre del menú "…".
- `service-summary.ts`: `serviceSummaryLine(s, currency)` y `SERVICE_TEXT` exactos.
- Actions: `FormState = { ok; error?; field? }`, `addRuleAction`, `updateRuleAction` (nueva), `deleteRuleAction(id): Promise<FormState>`,
  `addExceptionAction` (con `kind`), `deleteExceptionAction(id): Promise<FormState>`; `toggleServiceAction(id, active):
  Promise<{ ok; error? }>`; `saveServiceAction` sin `active` y con `requiresDeposit: z.enum(["0","1"])`; `updateService(id, data)`
  con `active?: boolean`.
- Keys diferidas `rule:<id>` y `exception:<id>`, sin `guardUnload` (T10).

### Decisiones no obvias

- **`formatClock` ya existía** en `after-hours.ts` (textos del bot), con la misma regla. `availability-text.ts` reexporta ese
  mismo binding (`export { formatClock } from "./after-hours"`) en vez de duplicar la función: el contrato queda completo y
  `export *` desde `index.ts` no choca.
- **Q16, del lado del servidor también:** `updateRuleAction` busca la regla con `active: true` (una inactiva da "Ese horario ya
  no está. Recargá la página.") y `deleteRuleAction` borra con `deleteMany({ where: { id, active: true } })`. Así ninguna
  regla inactiva se puede editar ni borrar desde el panel, aunque llegue su id. Los borrados usan `deleteMany` por id para
  que "ya borrado" dé `{ ok: true }` sin depender del código P2025.
- **Q17:** sin `active` en el form. "Pide seña" y "Pedir motivo" mandan `"0"`/`"1"` en un hidden. "Mandar recomendaciones"
  apagado manda `prepInstructions=""`. Los tests fijan que editar no le pasa `active` a `updateService`, ni siquiera si un
  cliente viejo manda `active=true`.
- **Tipo de excepción como lista de radios de 44 px, no `SegmentedControl`.** Las tres opciones son frases largas ("Atiendo en
  otro horario") y en un segmentado no entran legibles en 390 px ni en el panel de 448 px. El SDD (6-2) pedía segmentado. El
  de "Porcentaje | Monto fijo" sí es `SegmentedControl`.
- **Día del panel de horario como `Select` nativo** (6-2 permite `SegmentedControl`/`Select`). Siete opciones en un
  segmentado no entran en 390 px.
- **Los horarios se ven como botones "de 9:00 a 13:00 ›"** (no la frase entera en un renglón). Para lectores de pantalla cada
  día tiene un texto oculto con la frase completa (`dayScheduleText`). Cada botón dice "Editar el horario del lunes de 9:00 a
  13:00". Si un día tiene horarios que se pisan, aparece el badge "Se superponen" y esos botones se resaltan en ámbar. Con
  las reglas activas de hoy no aparece ninguno.
- **Error de superposición:** un solo mensaje debajo de "Desde" y "Hasta" (`role="alert"`). Los dos campos quedan con
  `aria-invalid` y `aria-describedby`, y el foco va a `field` ("startTime").
- **Horas propuestas al agregar:** 9:00–13:00 si el día está vacío; si no, desde el fin del último horario y 4 h más.
- **Al borrar un horario desde su panel**, el foco va al "Agregar horario" de ese día, porque el botón del horario ya no está.
  Se verificó en runtime.
- **Servicios: la tarjeta pasa de sección con `layoutId` de Motion** dentro de un `LayoutGroup`. Con movimiento reducido,
  `MotionConfig reducedMotion="user"` anula el desplazamiento. El valor del switch es optimista hasta que llega la página
  revalidada. Si la action falla, vuelve atrás con un toast de error. El foco sigue al switch en su lugar nuevo (verificado
  con teclado).
- **Guardia del formulario de servicio:** `ServiceSheet` (en `service-form.tsx`) intercepta el cierre (X, Esc, tocar afuera)
  con `useConfirm` ("¿Salir sin guardar?", "Seguir editando" / "Salir sin guardar"). Usa `useUnsavedChangesGuard` para
  links y recargas. "Hay cambios" se calcula comparando un snapshot del `FormData` con el del montaje. Para mostrar "Seguir
  editando" se agregó `cancelLabel?` **opcional** al hook: es aditivo y los consumidores actuales no cambian.
- **Recordatorios:** además del estilo, el "Pide confirmar (sí/no)" pasó de checkbox a `Switch`, porque la HU pide "todos los
  sí/no son switches". El título "Recordatorios" lo pone el grupo.
- **La tarjeta de servicio no muestra la descripción** (4.3 de la HU no la incluye). Sigue en el formulario.
- **R1:** el `SheetTitle` del panel del turno es enfocable (`tabIndex=-1`, con anillo `focus-visible`) y `onOpenAutoFocus` lo
  enfoca. **R2:** la demo usa `CalendarToolbar` con `calendarPeriodTitle`, y `headerToolbar={false}`. **R3:** sin "+", 12 o
  más dígitos que empiezan con "54" se tratan como "+54" (se sacan el 9, el troncal y el 15) solo si queda un nacional
  válido. Un nacional argentino nunca empieza con 54. Los tests anteriores siguen pasando.

### Verificación

**Comandos (desde la raíz):**
- `npm run typecheck`: core, db, bot y web en verde.
- `npm run test`: 120 archivos, 1988 tests en verde. Los nuevos: `availability-text` (25), `service-summary` (8),
  `phone-input` (+2), `disponibilidad/actions` (21) y `servicios/actions` (11).
- `npm run lint --workspace apps/web`: solo el warning previo de `ajustes/logo-form.tsx`.
- `./ops/harness/verify.sh`: "Arnés OK". El aviso "Se tocó el bot" sale porque cambió core. El bot no se tocó ni se levantó.

**Builds en una copia del scratchpad.** El dev server de :3100 no se tocó y sigue respondiendo 200.
- `next build` (webpack): exit 0. El único aviso es el previo de `jose`/Edge.
- `next build --turbopack`: "Compiled successfully", exit 0.
- Ninguno de los dos mostró "Only async functions…", "cannot be passed" ni "useSearchParams() should be wrapped…".

**Runtime:** `next start -p 3197` sobre el build de webpack, con una cookie de Auth.js generada en local y Chromium headless.
- `/disponibilidad` y `/servicios` a 1366, 768 y 390 px: 200, sin "Algo salió mal" y sin scroll horizontal (después del
  arreglo de abajo). Consola sin errores ni avisos de hidratación, y log del servidor sin "cannot be passed" ni errores.
- Disponibilidad muestra los 7 días y **solo las 9 reglas activas**: lunes 9–13 y 16–20, sin el 15–19 inactivo. No sale
  "Se superponen". Los botones de horario miden 44 px y ninguno queda por debajo de 36 px.
- A 390 px, con movimiento reducido, el panel de horario sale desde abajo a lo ancho, con los inputs de hora de 44 px. Las
  filas de tipo de excepción miden 44 px. El formulario de servicio sale desde abajo, sin scroll horizontal.
- **Flujos con datos de prueba** (bot apagado, `BotStatus` sin cambios):
  - **Horario:** "Agregar horario el domingo" abre "Horario del domingo" con 9:00–13:00. Al guardar 7:00–8:00 sale "Listo,
    el domingo atendés de 7:00 a 8:00" y se crea la regla `cmuuitevh…` (primera corrida) / `cmuuivoei0003pyvwri01y6gt`.
    Al editarla a 7:00–9:00, la base dice 07:00|09:00. Agregar 8:00–10:00 el domingo muestra "Se superpone con el horario
    de 7:00 a 9:00. Cambiá las horas o editá ese horario.", el foco queda en "Desde" y sigue habiendo una sola regla de
    domingo.
  - **Borrar horario:** la confirmación dice "¿Borrar el horario del domingo de 7:00 a 9:00?" con el texto de la HU y el foco
    en "Volver". Al confirmar, el horario desaparece, sale "Horario borrado" y el foco va a "Agregar horario el domingo".
    Con "Deshacer" sale "Listo, el horario volvió" y 10 s después la fila sigue en la base. Dejándolo vencer: durante el
    plazo la fila sigue (1); al vencer, 0. No hubo diálogo `beforeunload` (T10).
  - **Excepción:** con "No atiendo todo el día" no aparecen las horas; con "No atiendo un rato" sí. Se guardó el 2027-03-15
    14:00–16:00 "Prueba 017b-2" como `BLOCKED|14:00|16:00`, y la fila dice "Lunes 15 de marzo de 2027 · No atendés de
    14:00 a 16:00 · Prueba 017b-2". Al borrarla desde "…", la confirmación dice "¿Borrar el día especial del lunes 15 de
    marzo de 2027?". "Deshacer" la trae de vuelta (sigue en la base después de 10 s). Dejándola vencer, la base da 0.
  - **Servicio:** el formulario tiene los grupos Datos, Seña, Antes del turno, Recordatorios y Al reservar, sin checkboxes
    visibles. Los 5 `input[type=checkbox]` son los inputs ocultos sin `name` que Radix pone para los switches. Se creó
    "Prueba 017b-2" con `active=t`. Al pausarlo con el switch, pasa a "Pausados" con `active=f` y sale el toast. "Deshacer"
    lo deja en `active=t` con "Listo, el bot lo vuelve a ofrecer". Pausarlo con teclado (Espacio) deja el foco en el switch.
    Editando el pausado, cambiar el precio y apretar X muestra "¿Salir sin guardar?" con "Seguir editando" enfocado. "Seguir
    editando" conserva el 1500, y al guardar queda **`active=f`, precio 1500** (el pausado sigue pausado). Cerrar sin
    cambios no pregunta nada. "Pide seña" prendido al 50 % guarda `t|PERCENT|50` y la tarjeta dice "Pide seña (50 %)".
    Apagado guarda `f|null|null`.
  - **R1:** al abrir un turno del calendario, el foco queda en el título (`data-appointment-title`, "Maria López"). **R2:**
    `/dev-diseno` no existe en `next start` (solo en desarrollo), así que se verificó con typecheck y builds.
- **Limpieza solo por id:** las reglas `cmuuitevh0000pyvwzlzznavi` y `cmuuivoei0003pyvwri01y6gt` y la excepción de la segunda
  corrida las borró la propia UI al vencer (verificado por id). Borradas a mano por id: las excepciones
  `cmuuiu31v0001pyvwtn9mtt75` y `cmuuiv78f0002pyvw2toptsj0` (de la corrida que se cortó por el selector del toast) y el
  servicio `cmuuiwy7w0005pyvw3nd4k2i6`, que no tenía turnos. Nada encoló en `OutboundMessage`: 12 filas antes y después.
- **Datos preexistentes intactos.** `AvailabilityRule`: 17 filas, 9 activas y 8 inactivas. El orquestador dijo "16 (9
  inactivas)", pero la base tenía esto ya antes de empezar. `AvailabilityException`: 0. `Service`: 9, 6 activos. Los md5
  de todas las filas de `AvailabilityRule` y `Service` son iguales antes y después (`aa04b62d…` y `cada3172…`).
- Se mató el `next start` y se borraron la copia, la cookie y `playwright-core` del scratchpad.

**Alcance del diff** (contra `feat/hu-017b-agenda`): 28 archivos, todos de arriba. El grep de 10.2 da vacío: nada de la zona de
imleticio, `pdf-theme`, `apps/bot`, `packages/db`, `backlog`, `schema.prisma` ni migraciones, y `messages.ts` sin cambios.

### Hallazgos de la verificación en runtime (arreglados en `295245a`)

1. `/servicios` a 390 px tenía scroll horizontal (444 px). Lo causaba el nombre truncado de "Primera consulta + InBody + plan
   alimentario", que estiraba el ítem de la grilla (`min-width: auto`). Se arregló con `min-w-0` en el ítem. Retestado: 390.
2. En el celular, el formulario de servicio enfocaba y seleccionaba "Nombre" al abrir, y eso abre el teclado. Ahora, en <
   640 px, el foco va al panel (mismo patrón que "Nuevo turno").

### Pendiente / no hecho

- No hay capturas antes/después en `docs/auditoria-apple/017b/`. La verificación se hizo con aserciones sobre el DOM y
  capturas de control en el scratchpad, ya borradas. Quedan para el recorrido del orquestador.
- La transición de la tarjeta entre secciones y el arrastre del sheet inferior con cambios sin guardar no se miraron cuadro a
  cuadro. Si al arrastrar hacia abajo un formulario con cambios el panel no vuelve a su lugar después de "Seguir editando",
  es un detalle del primitivo `Sheet`.

---

## 017b-3: mensajes, pagos y avisos (con los agregados R4–R6)

- **Estado:** done
- **Rama:** `feat/hu-017b3-bandejas` (sale de `feat/hu-017b2-disponibilidad`, contiene `c0bfca7`). No se pusheó.
- **Modelo:** Opus. **Skills:** `ui-ux-pro-max` y `apple-design` antes del JSX. `web-design-guidelines` como autochequeo
  manual: no hubo red para bajar la guía, así que se revisó contra sus reglas conocidas. De ahí salió un cambio: el
  placeholder del buscador volvió a terminar en "…" y se le agregó `spellCheck={false}`.
- **Sin migración ni cambios en `schema.prisma`, `packages/db/**`, `apps/bot/**`, `backlog/**` ni en la zona de imleticio.**
  `messages.ts` no cambió (T4). El bot estuvo apagado todo el tiempo (`pgrep` vacío, `BotStatus.connected = f`) y no se levantó.

### Commits (uno por fase, con el trailer `Co-Authored-By: Claude Opus 5.5`)

| Commit | Fase |
|---|---|
| `1a626da` | A. core: `month-range.ts`, `outbox-text.ts`, `payment-text.ts` + tests, `index.ts` |
| `28c86fb` | B. `broadcastMessageAction` con `broadcastRecipients` + `avisos/actions.test.ts`; `onUndone` en `deferred-delete` + tests |
| `4bf67ce` | C. Mensajes: tarjetas, "Pendientes (N) \| Respondidas", "Ya respondí" diferido, `loading.tsx` |
| `9c5bdab` | D. Pagos: `?mes=`, `Metric`, lista agrupada con glosario, buscador + segmentado, registrar pago con turnos `COMPLETED`, `loading.tsx` |
| `d0e7631` | E. Avisos: comunicado diferido con vista previa, la cola en palabras, `loading.tsx`, demo de `/dev-diseno` (Q18) |
| `dde7851` | R4, R5 y R6 |

El commit de la fase F lleva este archivo y el placeholder del buscador de Pagos.

### Archivos tocados

Son los de la tabla 7-3: `packages/core/src/{month-range,outbox-text,payment-text}.ts` (+ tests) e `index.ts`;
`mensajes/{page,mensajes-view,loading}`; `pagos/{page,payments-table,manual-payment-dialog,manual-payment-form,loading}`;
`avisos/{page,avisos-view,broadcast-form,actions,actions.test,loading}`; `lib/deferred-delete.ts` (+ test);
`dev-diseno/broadcast-demo.tsx` (nuevo, cliente) y `dev-diseno/page.tsx` (agrega la sección).

Además:
- `components/ui.tsx`: `Metric` suma dos props opcionales, `valueText?` y `caption?`.
- R4: `disponibilidad/actions.ts` y su test.
- R5: `disponibilidad/exception-sheet.tsx`.
- R6: `lib/notify.ts` (suma `undo(..., { id? })` y `dismiss(id)`) y `servicios/service-card.tsx`.

`mensajes/actions.ts` no cambió.

### Contrato compartido

Las firmas coinciden con la sección 4.1 de 017b-3:
- `isValidMonthKey`, `monthKeyInTz`, `monthRangeInTz` (intervalo `[from, to)`), `shiftMonthKey`, `monthTitle` y `monthName`.
- `MessageKindLike` y `MESSAGE_KIND_TEXT` con la tabla exacta de la HU §4.6.
- `OUTBOX_STATUS_TEXT`, `outboxRecipientLabel({ toJid, patientName, professionalJid })` y `broadcastRecipients(jids)`.
- `OUTBOX_TEXT`: las claves del contrato, más otras de la cola (filtros, "Se actualiza sola", vacíos, `retryAllTitle`, etc.).
  Los textos con número usan el singular cuando n = 1 ("1 paciente").
- `PAYMENT_TEXT` con los textos exactos.

En web:
- `MESSAGE_KIND_TEXT satisfies Record<MessageKind, string>` (en `avisos/page.tsx`).
- `DeferredDeleteOptions.onUndone?` es opcional.
- `BroadcastForm({ patientCount, sendAction? })` conserva su firma. El `sendAction` de la demo se define del lado cliente.
- Las keys diferidas son `inquiry-answered:<id>` (sin `guardUnload`) y `broadcast:<uuid>` (con `guardUnload: true`).

### Decisiones no obvias

- **`useDeferredDelete` ahora delega en `runDeferredDelete(opts, { store, notify, router })`.** Es un export nuevo y puro,
  con las dependencias inyectadas. El comportamiento es el mismo y así se puede testear `onUndone` en node, sin React ni
  sonner. `onUndone` solo corre si el "Deshacer" llegó a tiempo: si el toast ya había vencido, o si `store.undo` devuelve
  false, no corre.
- **El comunicado** vacía el campo al programar. "Deshacer" lo devuelve, y si el envío falla también vuelve. En los dos
  casos solo se repone si el campo sigue vacío, para no pisar algo nuevo que haya escrito. La vista previa es un
  `AlertDialog` propio: `useConfirm` acepta solo texto y la burbuja no entra ahí. El foco va a "Volver a editar".
  `broadcastMessageAction` ahora envuelve el `createMany` en try/catch y devuelve `OUTBOX_TEXT.error`. Sin destinatarios
  responde "Todavía no hay pacientes con WhatsApp para mandarles el aviso.".
- **Mensajes:** durante los 8 s, la consulta se muestra en "Respondidas" con "Respondida recién", aunque en la base sigue
  `PENDING` ("se ve salir hacia Respondidas"). La tarjeta sale hacia la derecha con `springs.quick`; con movimiento
  reducido, solo un fundido. La página lee además `Patient.whatsappJid` con una consulta propia de la web, porque
  `listInquiries` no lo trae y domain no se toca (T3). Con eso sabe si el contacto es `@lid`: sin botón y con el texto de
  la HU. "Recibida": "Hoy, 22:40", "Ayer, 9:15" o "Hace 2 días". Se sacaron "Todas" y la prop `counts`.
- **Pagos:**
  - `listApprovedPaymentsInRange` filtra con `lte`, así que la página le pasa `to − 1 ms` para que el rango quede
    `[1°, 1° del siguiente)`.
  - La flecha "‹" es un `Link` a `?mes=`. La flecha "›" del mes en curso es un `<button disabled>`, y volver al mes en
    curso lleva a `/pagos` limpio.
  - `Metric` necesitaba mostrar montos con moneda y el renglón gris, de ahí `valueText?` y `caption?`.
  - En "Registrar pago" el tipo se elige con un segmentado (hidden `kind`). Al elegir "Seña", se precarga la seña del
    servicio (`computeDepositAmount`) si está configurada; si no, el precio.
  - Las opciones dicen "Brenda · Control · jueves 9 de octubre, 10:00 · Vino" (`appointmentDayTime` +
    `APPOINTMENT_STATUS_TEXT`).
  - Los nombres sin `name` usan `patientDisplayName`.
- **Avisos, cola:**
  - En el celular, el filtro es un `Select` nativo de 44 px: "Todos | Por enviar | Enviados | No se enviaron (1)" no
    entra legible en un segmentado de 390 px. Desde 640 px es `SegmentedControl`.
  - "Ver detalle" reutiliza `DetailDisclosure` de 017c-2.
  - "Reintentar" por fila sigue sin confirmación, como hoy. "Reintentar los N" pide confirmación con "Se vuelven a
    mandar por WhatsApp.".
  - `outboxRecipientLabel` compara el JID sin el sufijo de dispositivo (`:7`).
- **R6:** el toast de "pausado" usa el id `service-paused:<id>`. Si se vuelve a pausar, sonner reemplaza el toast
  anterior, y al reanudar con el switch se cierra. **R5:** el bloque Desde/Hasta lleva `key={kind}`. **R4:**
  `addRuleAction` envuelve el `create` y devuelve `SAVE_ERROR` sin revalidar.

### Verificación

**Comandos (desde la raíz):**
- `npm run typecheck`: core, db, bot y web en verde.
- `npm run test`: 124 archivos y 2029 tests, todos en verde. Los nuevos son `month-range` (17), `outbox-text` (10),
  `payment-text` (2), `avisos/actions` (6), `deferred-delete` (+5, por `onUndone`) y `disponibilidad/actions` (+1, R4).
- `npm run lint --workspace apps/web`: solo el warning previo de `ajustes/logo-form.tsx`.
- `./ops/harness/verify.sh`: "Arnés OK". El aviso "Se tocó el bot" sale porque cambió core; el bot no se tocó.

**Builds en una copia del scratchpad** (el dev server de :3100 no se tocó y sigue respondiendo 200):
- `next build` (webpack) terminó con exit 0.
- `next build --turbopack` dio "Compiled successfully" y exit 0.
- Ninguno de los dos mostró "Only async functions…", "cannot be passed" ni "useSearchParams() should be wrapped…".

**Runtime:** `next start -p 3197` sobre el build de webpack, con una cookie de Auth.js generada en local y Chromium headless
(`playwright-core` del caché de npx, sin instalar nada).
- **Pedidos con `curl`:** `/mensajes`, `/pagos`, `/pagos?mes=2026-09`, `/pagos?mes=2027-05` (futuro, cae al mes en curso),
  `/pagos?mes=xx`, `/avisos`, `/disponibilidad`, `/servicios` y `/` respondieron 200. En el HTML no aparece "Algo salió
  mal" ni "cannot be passed", y el log del servidor quedó sin errores.
- **Anchos:** `/mensajes`, `/pagos`, `/avisos` y `/disponibilidad` no tienen scroll horizontal a 1366, 768 ni 390 px. La
  consola no mostró errores ni avisos de hidratación.
- **Controles chicos:** mi chequeo marcó los segmentos de `SegmentedControl` (36 px visibles) y los "Agregar horario" de
  017b-2. En los dos casos el área táctil la amplía la utilidad `touch-target` (`::after`), igual que en las entregas
  aprobadas.
- **Mensajes**, con una paciente y una `@lid` de prueba y dos `PatientInquiry` creadas por id (con `digestedAt=now()`
  para que el resumen nocturno del bot no las tome):
  - "Pendientes (2) | Respondidas"; la más vieja va primero.
  - La tarjeta muestra "Hace 2 días", "Fuera de horario" y "+54 9 351 001-7301". "Responder por WhatsApp" tiene
    `href=https://wa.me/5493510017301`; no se apretó.
  - La `@lid` dice "Sin nombre", "WhatsApp no muestra el número" y "Respondé desde tu WhatsApp: este contacto no muestra
    el número", sin enlace.
  - **"Ya respondí":** la tarjeta sale, queda "Pendientes (1)" y en la base sigue `PENDING`. Con "Deshacer" vuelve y sale
    "Listo, sigue pendiente"; 10 s después sigue `PENDING`.
  - **Dejarlo vencer:** pasa a `ANSWERED` y el contador de la barra lateral baja de 2 a 1. En "Respondidas" se lee
    "Respondida hoy" con "Abrir WhatsApp" y sin "Ya respondí".
- **Pagos**, con un turno de prueba `COMPLETED` de ayer:
  - "›" está deshabilitado en octubre. "‹" lleva a `?mes=2026-09`, con "Septiembre 2026" y "Cobrado en septiembre", y
    "›" vuelve a `/pagos`.
  - "Registrar pago" lista "Prueba Brenda 017b3 · Antropometría · domingo 4 de octubre, 10:00 · Vino", con el monto
    precargado en 40000. "Seña" precarga 19999.73, que es la seña FIXED real del servicio.
  - El toast dice "Pago registrado: $ 40.000 de Prueba Brenda 017b3". La fila dice "Turno: domingo 4 de octubre, 10:00 ·
    Cobrado · Pago completo · Efectivo o transferencia" con "$ 40.000". El filtro "Esperando pago" la oculta.
- **Avisos.** Solo se probó el camino "Deshacer" sobre la action real. Como red de seguridad, Playwright abortaba todo
  POST con `next-action` en `/avisos`. Se abortaron 0: la action nunca llegó a correr.
  - El alcance decía "Le llega a 18 pacientes por WhatsApp." (16 reales + las 2 de prueba). Los 5 `@newsletter` no
    cuentan.
  - Sin texto aparece "Escribí el aviso antes de revisarlo." y no se abre la vista previa.
  - La vista previa muestra la burbuja con el texto, "Le llega a 18 pacientes por WhatsApp" y "Enviar a 18 pacientes",
    con el foco en "Volver a editar". "Volver a editar" conserva el texto.
  - Al enviar, el campo se vacía y sale "Comunicado listo para enviar a 18 pacientes". Durante el plazo, el conteo de
    `AD_HOC` posteriores a t0 da 0.
  - Con "Deshacer" sale "Listo, no se mandó" y el texto vuelve. 10 s después, el conteo sigue en 0.
  - **Recargar durante el plazo:** Playwright vio el diálogo `beforeunload`. Al aceptarlo, la página recargó y 10 s
    después el conteo seguía en 0.
- **Camino "vencer" (Q18):** se probó en `/dev-diseno#comunicado` del dev server de :3100, solo lectura, con el
  `sendAction` falso del lado cliente y los POST de actions abortados (0). Salió "Comunicado en camino a 12 pacientes", el
  campo quedó vacío y corrió 1 envío falso. También lo cubre `avisos/actions.test.ts`: no encola `@newsletter`, `@g.us` ni
  `@broadcast`, `sent` es correcto y sin destinatarios da error.
- **Cola:** la fila real `ANTHROPOMETRIC_REPORT_PDF` `FAILED` se lee "No se envió · Informe antropométrico (PDF) ·
  Brenda Yebara" con "No se pudo enviar.". "Ver detalle" muestra el `lastError`. Ningún nombre interno de tipo queda a la
  vista. "Reintentar el mensaje" pide confirmación con "Se vuelven a mandar por WhatsApp."; se apretó "Volver" y la fila
  siguió `FAILED`.
- **R5 en runtime:** "No atiendo un rato" pone 14:00 y "Atiendo en otro horario" pasa a 09:00. R4 y R6 se cubren con
  test y con el código: R6 no se probó en runtime para no tocar el `Service.active` real.
- **Conteos** `Patient|Appointment|OutboundMessage|Consultation|Payment|PatientInquiry`: **21|22|12|20|6|0** antes y
  después. `OutboundMessage` se mantuvo en 12 filas todo el tiempo, sin ninguna fila `AD_HOC` nueva. Ninguna prueba
  encoló nada.
- **Limpieza, solo por id:**
  - Pacientes `hu017b3-pac` y `hu017b3-lid`, consultas `hu017b3-inq-a` y `hu017b3-inq-b`, turno `hu017b3-turno` y turno
    auxiliar `hu017b3-turno2` (abajo).
  - Los pagos de prueba, cada uno por su id: `cmuukfz5f…`, `cmuukhqb7…`, `cmuukivxy…`, `cmuukj694…`, `cmuukj8x5…`,
    `cmuukk4rw…`, `cmuukkuz2…`, `cmuuklqr1…`, `cmuukmmox…`, `cmuukngzt…`, `cmuukntr2…`, `cmuuknuy6…`, `cmuuko7pl…`, y los
    `cmuukqs6s…`–`cmuuksx12…` de la comparación con la línea base.
  - Se mató el `next start` y se borraron la copia, la cookie y los scripts del scratchpad.

**Alcance del diff** (contra `c0bfca7`): son 31 archivos, todos los de arriba. El grep de 10.2 no encuentra nada de la zona
de imleticio, `pdf-theme`, `apps/bot`, `packages/db`, `backlog`, `schema.prisma` ni migraciones.

### Hallazgo preexistente (no es de esta entrega)

- **"Registrar pago" a veces queda en "Guardando…".** Con `next start` y Chromium headless pasa más o menos 1 de cada 2
  veces: el pago se crea en la base, pero la UI nunca recibe el resultado. No sale el toast y el diálogo no se cierra. Lo
  reproduje igual sobre un build de la línea base `c0bfca7` (017b-2), con un turno `CONFIRMED` de prueba
  (`hu017b3-turno2`, borrado). No lo introduce 017b-3. Puede ser algo del modo `output: standalone` con `next start` (el
  log avisa que no es compatible) o de la action que revalida `/pagos` y `/`. Conviene una tarea aparte para mirarlo con el
  servidor standalone real. Por eso el runtime creó más pagos de prueba de los necesarios; todos se borraron por id.

### Pendiente / no hecho

- No hay capturas antes/después en `docs/auditoria-apple/017b/`: quedan para el recorrido del orquestador.
- R6 (un toast vivo por servicio) no se recorrió en runtime, para no cambiar `Service.active` de un servicio real.

---

## Ronda 2 (017b-3)

- **Estado:** done. Responde al `CHANGES_REQUESTED` de `progress/review_HU-017b.md` (sección 017b-3, cambio 1) y a las
  dudas que se podían resolver con poco.
- **Bloqueante, el doble clic en "Ya respondí":** el arreglo va en el hook compartido, así cubre todos los diferidos.
  - `DeferredDeleteStore` suma `isScheduled(key)`: da true si la key tiene una entrada "pending" o "committing". Una
    entrada "done" no cuenta.
  - `runDeferredDelete` ahora devuelve `boolean`. Si la key ya está programada, no hace nada y devuelve `false`: no hay
    segunda entrada ni segundo toast.
  - Con eso, "Deshacer" cancela lo único que hay pendiente para esa consulta.
  - La key de un ítem ya borrado ("done", oculta hasta que se libera) se puede volver a programar, como necesita
    `prescriptionDeletionKey` de 017c-4. Los consumidores de 017c no cambian: la firma solo pasa de `void` a `boolean`.
- **Mismo patrón en los otros diferidos:**
  - Cancelar turno, horarios y excepciones: quedan cubiertos por el hook.
  - Comunicado: la key lleva un uuid, así que el hook no alcanza. `send()` tiene un `scheduledRef` (uno por vista previa,
    se rearma al volver a abrirla) y ahora valida de nuevo que el texto tenga 3 caracteres o más y que haya destinatarios
    (era una duda no bloqueante).
  - Pausar un servicio: ya usaba un toast único por servicio (R6). Un segundo clic en el switch reanuda, que es lo
    esperado.
- **Dudas baratas resueltas:**
  - `retryMessageAction` ahora usa `updateMany({ where: { id, status: "FAILED" } })`: una fila que ya se envió no se
    vuelve a mandar. Tiene test.
  - Guarda en `send()` del comunicado (arriba).
- **Dudas que quedan anotadas, sin cambio:**
  - Si navega a otra pantalla durante el plazo y después toca "Deshacer", el texto del comunicado se pierde. No se manda
    nada, como corresponde.
  - Los pagos `PENDING` aparecen en cualquier mes ("Señas esperando pago" es lo pendiente ahora). Queda para que lo
    confirme el recorrido.
  - El "Guardando…" de "Registrar pago" ya existía antes de esta entrega: es una tarea aparte.
- **Tests:** se agregaron 4 en `deferred-delete.test.ts`:
  - El segundo pedido no hace nada y sale un solo toast.
  - "Deshacer" después de un doble clic deja la key libre y nunca hace commit.
  - Con el commit en curso también bloquea; cuando termina, se puede volver a programar.
  - Keys distintas no se bloquean entre sí.

  Y 1 en `avisos/actions.test.ts` (`retryMessageAction`).
- **Verificación:**
  - `npm run typecheck`: los 4 workspaces en verde.
  - `npm run test`: 124 archivos y 2034 tests en verde.
  - Lint de web: solo el warning previo de `logo-form.tsx`.
  - `verify.sh`: "Arnés OK".
  - Builds en una copia del scratchpad: `next build --turbopack` dio "Compiled successfully" (exit 0) y `next build`
    exit 0, sin "cannot be passed" ni "Only async".
  - El dev server de :3100 no se tocó.
- **Runtime:** `next start -p 3197` con Chromium headless. El bot siguió apagado (`pgrep` vacío, `connected = f`).
  - Usé una paciente y una `PatientInquiry` de prueba, creadas y borradas por id.
  - `/mensajes`, `/pagos` y `/avisos` cargaron sin el error boundary.
  - **Doble clic con movimiento normal y con movimiento reducido:** salió un solo toast "Marcada como respondida". Con
    "Deshacer" la tarjeta volvió y 10 s después seguía `PENDING`. La consola quedó limpia.
  - **A 390 px táctil:** sin scroll horizontal. Después de un doble clic y dejarlo vencer, la consulta quedó `ANSWERED`.
  - No se probó el comunicado contra la base: en `/avisos` las actions se abortaban por red.
  - Los conteos `Patient|Appointment|OutboundMessage|Payment|PatientInquiry|AD_HOC` quedaron en **21|22|12|6|0|0**,
    antes y después.
  - Se borraron la copia, la cookie y el script.
