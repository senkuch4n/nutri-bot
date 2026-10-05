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
