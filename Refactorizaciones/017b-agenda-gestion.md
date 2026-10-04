# SDD: HU-017b `017b-agenda-gestion` (Rediseño Apple 3/5: agenda y gestión, simple de usar)

- **HU validada:** `docs/hu-017b-agenda-gestion.md`. Manda su sección **"Resoluciones" (2026-10-04)**:
  D1–D24 aceptadas con su recomendación; D1 lo hace el orquestador en el recorrido de 017b-1; D5/D14
  diferidos con aviso del navegador al cerrar; D17 queda fuera; corte **017b-1 → 017b-2 → 017b-3 →
  017b-4**, ramas encadenadas como en 017c.
- **Depende de:** HU-017a (en `develop`) y HU-017c (aprobada). Reutiliza el contrato de UI de 017a
  (`Refactorizaciones/rediseno-apple-fundaciones.md`) y los patrones de 017c
  (`Refactorizaciones/017c-pacientes-consultas.md`): `lib/deferred-delete.ts`, `MoreActionsMenu`,
  `GroupedListRow size="lg"`, `useMediaQuery`, `replaceUrlInRouter`, helpers de core.
- **Rama de 017b-1:** `feat/hu-017b-agenda` (sale de `feat/hu-017c4-informe`, ya contiene todo 017c).
  Ramas de las demás entregas: Q20.
- **Skill aplicado:** `skills/ui.txt` (bajar los objetivos UX a pantallas: vista, estructura base,
  componentes clave). Está en la sección 6 de cada entrega ("Pantallas").
- **Nivel de detalle:** 017b-1 está detallada para implementarse ya. 017b-2, 017b-3 y 017b-4 traen
  contrato, archivos y checklist. Antes de lanzar cada una, el orquestador relee su sección, las Q que
  le tocan y lo que haya dejado el recorrido de D1 (se agrega al final, como en 017c).

> **Verificación del architect (2026-10-04, solo lectura).**
> - **Base de desarrollo** (Postgres en Docker, `nutri`/`nutribot`, puerto 5433): `Patient` tiene
>   7 `@s.whatsapp.net` (todos con nombre), **5 `@newsletter`** (sin nombre) y **9 `@lid`** (4 con
>   nombre). `Appointment`: 10 `CONFIRMED`, 6 `COMPLETED`, 1 `NO_SHOW`, 5 `CANCELLED`.
>   `AvailabilityException`: 0 filas. `OutboundMessage`: 12 filas, una `ANTHROPOMETRIC_REPORT_PDF`
>   `FAILED` (sirve para ver "No se envió" en 017b-3 sin crear nada).
> - **`AvailabilityRule` tiene 16 filas y solo 7 están `active = true`.** El bot
>   (`packages/db/domain/availability.ts:28`) y el calendario (`(calendario)/page.tsx:41`) filtran
>   `active: true`, pero `/disponibilidad/page.tsx:16` lista **todas**. Las "superposiciones" que se ven
>   hoy (lunes 15–19 y 16–20, lunes 9–13 dos veces) son filas inactivas mezcladas con activas. Entre
>   las activas no hay superposiciones. Ver Q16 (017b-2).
> - **Migraciones:** la base tiene aplicada `20261004174348_food_measures`, que no está en esta rama
>   (viene de 018d). `prisma migrate status` la va a marcar. **No es de esta HU y no se toca** (nada de
>   `migrate dev`, `reset` ni `resolve`). **Ninguna entrega de 017b necesita migración** (T1).
> - **`Professional.botPaused` no frena la cola de salida.** `apps/bot/src/workers.ts:33` despacha
>   `OutboundMessage` cada `pollIntervalMs` aunque el bot esté pausado; `botPaused` solo calla las
>   respuestas (`conversation.ts:168`). Toda verificación que cree turnos, cancele o encole tiene que
>   hacerse con **el proceso del bot apagado** (T8, 10.3).
> - `cancelAppointment` (domain) con un turno que ya no está `CONFIRMED` devuelve el turno sin encolar
>   nada y sin tirar error: un commit diferido tardío es inofensivo. Con `by: "PROFESSIONAL"` encola
>   `CANCELLATION` al paciente (`OutboundMessage` único por `[appointmentId, kind, dedupeKey]`).
> - `findOrCreatePatient` (domain) hace `upsert` por `whatsappJid` y **pisa `name`** si viene. Su único
>   consumidor es `createAppointmentAction` (`apps/web/src/app/(panel)/actions.ts:40`). El bot usa
>   `findOrCreatePatientByJid`. 017b-1 deja de llamar a `findOrCreatePatient` con un nombre cuando la
>   paciente ya existe, **sin tocar `domain`** (4.6 de 017b-1).
> - El modal "Nuevo turno" usa `select` de FullCalendar para tocar una franja: en pantallas táctiles
>   FullCalendar 6 exige mantener apretado (`selectLongPressDelay`, 1 s). `dateClick` (plugin de
>   interacción, ya cargado) responde a un toque. Ver Q4.
> - FullCalendar 6.1 con `timeZone` con nombre (luxon3): los `Date` de `view.currentStart` y
>   `getDate()` no se deben formatear con la zona del proceso. `calendar.formatIso(date, true)` da el
>   "yyyy-MM-dd" en la zona del calendario. Ver 4.4 de 017b-1.
> - `notify.undo` + `useDeferredDelete` (017c-3): el commit corre en `onAutoClose`/`onDismiss` de
>   sonner; el `<Toaster />` del panel no tiene botón de cerrar (solo vence o se desliza). El store ya
>   tiene `releaseAfterMs` (10 s).
> - `saveServiceAction` usa `z.coerce.boolean()` para `active` y `requiresDeposit`: con un hidden
>   `"0"`/`"false"` da `true`. Ver Q17 (017b-2).
> - `ajustes-tabs.tsx` ya usa `replaceState(null, …)`; `?tab=pdf` lo enlaza el editor del informe
>   (017c-4): el valor `pdf` se conserva en 017b-4.
> - No hay ningún uso de `window.history.state` en `apps/web/src`.

---

## 0. Decisiones que valen para las cuatro entregas

| ID | Decisión | Por qué |
|---|---|---|
| T1 | **Sin migración ni cambios en `schema.prisma`** en ninguna entrega. Todo lo nuevo escribe campos que ya existen (`Appointment`, `AvailabilityRule.startTime/endTime`, `Service.active`, `PatientInquiry.status`, `Payment`, `OutboundMessage`, `Professional`). El "Deshacer" es diferido en el cliente: no necesita columnas. La validación de superposición va en la action. Los pagos por mes y los nombres de la cola son lecturas. | HU §3 y §5. Si en algún momento apareciera la necesidad (p. ej. guardar las conversaciones del asistente), es otra HU. |
| T2 | **Lógica pura en `packages/core`**, en módulos nuevos con su `*.test.ts`: teléfono escrito a mano y textos/títulos de la agenda (017b-1); textos del horario y superposición, excepciones, resumen del servicio (017b-2); rango de un mes en una zona, textos de la cola y de pagos, destinatarios del comunicado (017b-3); listas de zonas horarias y monedas (017b-4). Lo que es solo ruteo o mecanismo de la UI (`calendar-route.ts`, `deferred-delete.ts`) va en `apps/web/src/lib/` con test. | AGENTS.md "Dónde va la lógica"; T2 de 017c. |
| T3 | **`packages/db/domain` no cambia.** Ninguna firma se toca y no se agregan funciones: las consultas nuevas son solo de la web y van en la página o en la action (HU §5). Igual se corre `typecheck` en **los 4 workspaces** en cada entrega, porque core cambia y el bot importa core. | AGENTS.md: un cambio en core o domain impacta web y bot. |
| T4 | **Textos del bot sin cambios.** Ningún texto de `packages/core/src/messages.ts` ni lo que se encola cambia. Los textos nuevos del panel van en constantes de core (`AGENDA_TEXT`, `PHONE_INPUT_TEXT`, `AVAILABILITY_TEXT`, `OUTBOX_TEXT`, `PAYMENT_TEXT`) o en la UI. | HU §2.5 "Sin cambios en lo que hace el bot". |
| T5 | **Componentes de 017a/017c:** `SegmentedControl`, `GroupedList`/`GroupedListRow`, `Metric`, `MoreActionsMenu`, `useConfirm`, `notify.undo`, `useDeferredDelete`, `useUnsavedChangesGuard`, `Sheet` (`side={compact ? "bottom" : "right"}`, patrón de `edit-patient-sheet.tsx`). Las props nuevas son **opcionales** y con default igual a lo de hoy. No se cambian firmas de `ui.tsx`, primitivos, `grouped-list.tsx`, `segmented-control.tsx` ni de core existente. | R1 de la madre. |
| T6 | **Zona de imleticio sin cambios de archivo:** `alimentos/**`, `pacientes/[id]/planes/**`, `plantillas/**`, `components/food-picker.tsx`, `components/meals-editor.tsx`, `lib/plan-pdf.tsx`; `lib/pdf-theme.ts` sin cambiar exports (`DEFAULT_PDF_ACCENT` lo sigue usando Ajustes). | HU §2.5 y §5. |
| T7 | **Movimiento:** solo `m.*` de `motion/react` (LazyMotion `strict`) y presets de `lib/motion.ts`; animar solo `opacity`/`transform`; con movimiento reducido, fundido corto. | 017a §18. |
| T8 | **WhatsApp y datos:** nada de lo diferido encola en `OutboundMessage` durante el plazo (cancelar turno, comunicado). Las verificaciones que crean, cancelan o encolan van con **el proceso del bot apagado**, con pacientes y turnos de prueba creados por id (JID inventado), y borran **por id** las filas de `OutboundMessage`, `Payment`, `Consultation`, `Appointment` y `Patient` que crearon. El comunicado real **nunca** se aprieta sobre la base de la usuaria (le llegaría a todas). El recorrido sobre datos reales es de solo lectura. | AGENTS.md, reglas duras; HU §6. |
| T9 | **Lecciones de 017c:** (a) el servidor nunca pasa funciones ni componentes (íconos incluidos) como props a un componente cliente: los íconos y callbacks se definen del lado cliente; (b) la URL se cambia con `replaceUrlInRouter` (`lib/patient-tab-route.ts`, `replaceState(null, …)`) o con el router de Next, nunca con `window.history.state`; (c) `"use server"` exporta solo funciones async y `export type`; (d) cada entrega se verifica en runtime con `next start` en un puerto libre, además de los builds de webpack y Turbopack. | Revisión de 017c-2 y R7 de 017c. |
| T10 | **Aviso del navegador al cerrar:** mientras haya una cancelación de turno o un comunicado pendiente (o enviándose), `beforeunload` avisa. Si igual se cierra o se recarga, **no** se cancela ni se manda (falla del lado seguro, D5/D14). El texto del diálogo lo pone el navegador (no se puede personalizar). Los borrados de horarios, excepciones y "Ya respondí" **no** activan el aviso (son reversibles y no le llegan a nadie). | Resolución D5/D14. |

---

# Entrega 017b-1: calendario, turno y nuevo turno (detallada)

## 1-1. Resumen funcional

El calendario (`/`) pasa a tener una **barra propia** (‹ Hoy › + título del período + segmentado
"Día | Semana | Mes", controles de 44 px con nombre accesible), abre en **Día** debajo de 768 px y en
**Semana** desde 768 px, pinta las horas fuera de atención con un **tinte muy suave**, y la **URL
acompaña lo que se ve** (`?fecha=yyyy-MM-dd&vista=dia|semana|mes`, con `replaceState`, sin sumar
entradas al historial): recargar o volver desde la ficha deja el mismo día y la misma vista. **`?fecha=`
sin `?vista=` abre ese día en vista Día** (lo que pide la tarjeta "Próximo turno" de la ficha), con el
primer turno del día a la vista; una fecha inválida abre hoy, sin error. La franja de resumen habla en
palabras ("Hoy: 6 turnos · queda 1", "Esta semana: 18 turnos", "Próximo: Hoy, 16:30 · Brenda Yebara ·
Control"), y los turnos se titulan con el nombre, el teléfono con formato o "Sin nombre". El **panel del
turno** muestra el estado y las acciones en las palabras de la ficha ("Vino a la consulta" como acción
principal, "No vino", "Volver a confirmado"), "Ver ficha", "WhatsApp" (no para los `@lid`), "Editar
motivo" con texto, "Registrar pago" con el turno y el precio ya puestos, y **"Cancelar turno" como
texto rojo al final, con confirmación y "Deshacer" de 8 s**: el turno se oculta al instante y la
cancelación y el WhatsApp salen recién al vencer el plazo; si se cierra la pestaña antes, el navegador
avisa y, si igual se cierra, el turno sigue en pie. **"Nuevo turno"** arranca con "¿Para quién?" y un
buscador de pacientes (no se toca el nombre de una paciente existente); la paciente nueva se carga con
el teléfono en formato libre, con la vista previa "La confirmación le llega al +54 9 …" y el aviso si
ese número ya es de otra paciente; el horario tocado en la grilla queda elegido.

## 2-1. Workspaces afectados

| Workspace | ¿Se toca? | Detalle |
|---|---|---|
| `packages/core` | **sí** | 2 módulos nuevos (`phone-input.ts`, `agenda.ts`) + tests + `export *` en `index.ts`. Solo agrega exports. |
| `packages/db` | **no** | Ni schema ni `domain/`. |
| `apps/web` | **sí** | Calendario (página, cliente, barra nueva, loading), panel del turno, nuevo turno (+ buscador), `actions.ts` del panel (+ test nuevo), `/api/appointments`, `lib/calendar-route.ts` (+ test), `lib/deferred-delete.ts` (+ test), aviso al cerrar (componente nuevo + layout del panel), formulario de pago manual y su action, `globals.css` (solo reglas `.fc`). |
| `apps/bot` | **no** | No importa nada nuevo. Se corre su `typecheck` porque core cambia. |

## 3-1. Esquema

**No cambia. Sin migración.** Lee `Appointment` (con `patient`, `service`, `consultation`, `payments`),
`Patient`, `Service`, `AvailabilityRule` (`active: true`). Escribe lo mismo que hoy: `Patient` (solo al
crear una paciente nueva), `Appointment` (crear, estado, motivo, cancelar), `Payment` (pago manual),
`OutboundMessage` (lo que ya encolan `createAppointment`, `cancelAppointment` y `enqueueReminderNow`,
sin cambios).

## 4-1. Contrato compartido

### 4.1 `packages/core/src/phone-input.ts` (nuevo)

Consumidores: `apps/web` (nuevo turno en 017b-1; "Tu WhatsApp" de Ajustes en 017b-4). El bot no lo usa.

```ts
export type PhoneInputResult =
  | { ok: true; digits: string }            // número internacional solo dígitos, listo para phoneToJid
  | { ok: false; error: "empty" | "invalid" };

/** Normaliza un teléfono escrito a mano (D4). Reglas, en orden:
 *  1. Sin dígitos (vacío, espacios, letras) → { ok: false, error: "empty" }.
 *  2. Internacional explícito: empieza con "+" o los dígitos empiezan con "00" (se sacan los "00").
 *     - Si el código es "54": nacional = lo que sigue; si empieza con "9" se saca; se aplica
 *       quitarTroncal y quitar15 (abajo); si queda un nacional argentino válido → "549" + nacional;
 *       si no → "invalid".
 *     - Otro código de país: se respeta tal cual si tiene entre 8 y 15 dígitos; si no → "invalid".
 *  3. Sin "+" (se asume Argentina):
 *     - 13 dígitos que empiezan con "549" y nacional válido → igual.
 *     - 12 dígitos que empiezan con "54" y nacional válido (fijo sin el 9) → "549" + nacional.
 *     - Si no: quitarTroncal (un "0" adelante) y quitar15; si queda un nacional válido → "549" + nacional.
 *     - Cualquier otra cosa → "invalid" (un número de otro país se escribe con "+": Q8).
 *  Nacional argentino válido: 10 dígitos que empiezan con "11", "2" o "3".
 *  quitar15: si el nacional tiene 12 dígitos y después del código de área (2 dígitos si "11"; 3 si
 *  está en AR_AREA_CODES_3; si no, 4) vienen "15", se sacan esos dos dígitos. */
export function parsePhoneInput(raw: string): PhoneInputResult;

export const PHONE_INPUT_TEXT = {
  empty: "Escribí el número de WhatsApp",
  invalid: "Revisá el número: tiene que tener código de área",
  foreignHint: "Si es de otro país, empezá con +",
  /** formatted = formatPhone(digits). */
  confirmationPreview: (formatted: string) => `La confirmación le llega al ${formatted}`,
} as const;
```

Usa `AR_AREA_CODES_3` de `phone-format.ts` (ya exportado). La vista previa siempre es
`formatPhone(result.digits)`.

### 4.2 `packages/core/src/agenda.ts` (nuevo)

Consumidores: `apps/web` (página y cliente del calendario, `/api/appointments`, panel del turno, nuevo
turno, actions). Reutiliza `formatPhone`, `classifyWhatsappJid`, `capitalizeFirst`,
`formatAppointmentWhen`, `AppointmentStatusLike`, `dayKeyInTz`, `formatInTimeZone`.

```ts
export type CalendarView = "dia" | "semana" | "mes";

/** Nombre a mostrar de una paciente: name recortado; si no tiene (null o solo espacios) y el JID es
 *  "phone" → formatPhone(phone); si no ("hidden", "not_person") → "Sin nombre". */
export function patientDisplayName(p: { name: string | null; phone: string; whatsappJid: string }): string;

/** "Brenda Yebara · Control", "+54 9 351 555-2345 · Control", "Sin nombre · Control". */
export function appointmentEventTitle(
  p: { name: string | null; phone: string; whatsappJid: string },
  serviceName: string,
): string;

/** Primera palabra del nombre recortado ("María José Gómez" → "María"); null si no hay nombre. */
export function firstName(name: string | null): string | null;

/** "jueves 8 de octubre, 10:00" (minúscula, para el medio de una frase; hora "H:mm").
 *  Si el año del turno no es el de `now` (en tz): "lunes 4 de enero de 2027, 9:00". */
export function appointmentDayTime(startsAt: Date, now: Date, tz: string): string;

/** "jueves 8 de octubre a las 10:00"; con la hora 1 → "a la 1:30"; mismo criterio de año. */
export function appointmentDayAtTime(startsAt: Date, now: Date, tz: string): string;

export interface AgendaDayCount { total: number; remaining: number }

/** total = CONFIRMED + COMPLETED + NO_SHOW; remaining = CONFIRMED con startsAt > now.
 *  CANCELLED y AWAITING_PAYMENT no cuentan. (D8) */
export function countAgendaDay(
  appts: readonly { status: AppointmentStatusLike; startsAt: Date }[],
  now: Date,
): AgendaDayCount;

/** "Hoy: 6 turnos · queda 1" · "Hoy: 6 turnos · quedan 2" · "Hoy: 6 turnos · no queda ninguno" ·
 *  "Hoy: 1 turno · queda 1" · total 0 → "Hoy: sin turnos". (Q11) */
export function todaySummaryText(c: AgendaDayCount): string;

/** "Esta semana: 18 turnos" · "Esta semana: 1 turno" · "Esta semana: sin turnos". */
export function weekSummaryText(total: number): string;

/** "Hoy, 16:30 · Brenda Yebara · Control" (formatAppointmentWhen + patientDisplayName + servicio). */
export function nextAppointmentText(
  a: { startsAt: Date; patient: { name: string | null; phone: string; whatsappJid: string }; serviceName: string },
  now: Date,
  tz: string,
): string;

/** Título del período, a partir de dayKeys de la zona del calendario (sin depender de la zona del
 *  proceso). endKeyExclusive = el día siguiente al último visible del período (view.currentEnd).
 *  - dia: "Jueves 8 de octubre"; otro año que todayKey: "Lunes 4 de enero de 2027".
 *  - semana: mismo mes "5 – 11 de octubre"; meses distintos "28 de septiembre – 4 de octubre";
 *    años distintos "28 de diciembre de 2026 – 3 de enero de 2027"; los dos en un año que no es el de
 *    todayKey: "5 – 11 de octubre de 2027". Separador " – " (raya corta con espacios).
 *  - mes: "Octubre 2026" (siempre con año). */
export function calendarPeriodTitle(
  view: CalendarView,
  startKey: string,
  endKeyExclusive: string,
  todayKey: string,
): string;

/** Nombres accesibles de ‹ ›: dia → "Día anterior"/"Día siguiente"; semana → "Semana anterior"/
 *  "Semana siguiente"; mes → "Mes anterior"/"Mes siguiente". */
export function calendarNavLabels(view: CalendarView): { prev: string; next: string };

/** Textos exactos del calendario, el panel del turno y "Nuevo turno" (solo panel). */
export const AGENDA_TEXT: {
  views: Record<CalendarView, string>;            // "Día", "Semana", "Mes"
  today: "Hoy";
  viewSelectorLabel: "Vista del calendario";
  next: "Próximo";
  noNext: "Sin turnos próximos";
  legendServices: "Servicios";
  legendStates: "Estados";
  loading: "Cargando turnos";
  loadError: "No se pudieron cargar los turnos.";
  sheet: {
    seeProfile: "Ver ficha";
    whatsapp: "WhatsApp";
    completed: "Vino a la consulta";
    noShow: "No vino";
    backToConfirmed: "Volver a confirmado";
    openConsultation: "Abrir la consulta";
    sendReminder: "Enviar recordatorio";
    registerPayment: "Registrar pago";
    editReason: "Editar motivo";
    noReason: "Sin motivo";
    price: "Precio";
    reason: "Motivo";
    reminders: "Recordatorios";
    pastAppointment: "Turno pasado";
    inGoogle: "En Google Calendar";
    cancel: "Cancelar turno";
    cancelHint: "Le avisamos por WhatsApp.";
    toastCompletedCreated: "Listo. Se creó su consulta.";
    toastCompleted: "Listo.";
    toastNoShow: "Marcado: no vino";
    toastBackToConfirmed: "Volvió a confirmado";
    toastReminderQueued: "Recordatorio en camino";
    toastReminderPending: "Ya hay un recordatorio por salir";
    toastReasonSaved: "Motivo guardado";
    backToConfirmedTitle: "¿Volver el turno a confirmado?";   // se conserva el texto de HU-003 (D3)
  };
  cancel: {
    title: (patient: string) => string;           // `¿Cancelar el turno de ${patient}?`
    description: (when: string) => string;        // `Le avisamos por WhatsApp que se canceló el turno del ${when}.` (when = appointmentDayAtTime)
    confirm: "Cancelar turno";
    back: "Volver";
    scheduled: (first: string | null) => string;  // `Turno cancelado. Le avisamos a ${first} en unos segundos.` · sin nombre: "Turno cancelado. Le avisamos en unos segundos."
    undone: "Listo, el turno sigue en pie";
    error: "No se pudo cancelar el turno. Probá de nuevo.";
  };
  create: {
    title: "Nuevo turno";
    who: "¿Para quién?";
    searchLabel: "Buscar paciente por nombre o teléfono";
    searchPlaceholder: "Buscá por nombre o teléfono";
    noResults: (q: string) => string;             // `No encontramos a «${q}»`
    newPatient: "Paciente nueva";
    change: "Cambiar";
    nameLabel: "Nombre y apellido";
    phoneLabel: "WhatsApp";
    nameRequired: "Escribí el nombre";
    existing: (name: string) => string;           // `Ese número es de ${name}`
    chooseExisting: (first: string) => string;    // `Elegir a ${first}`
    service: "Servicio";
    servicePlaceholder: "Elegí un servicio";
    day: "Día";
    tomorrow: "Mañana";
    time: "Horario";
    pickServiceFirst: "Elegí un servicio para ver los horarios.";
    loadingSlots: "Buscando horarios…";
    noSlots: "No hay horarios libres ese día.";
    slotNotFree: (hhmm: string, service: string) => string; // `A las ${hhmm} no hay lugar para ${service}. Elegí otro horario.`
    choosePatient: "Elegí para quién es";
    chooseTime: "Elegí un horario";
    reasonLabel: "Motivo (opcional)";
    reasonHint: "No se le manda a la paciente.";
    whatsappNotice: "Le mandamos la confirmación por WhatsApp.";
    submit: "Crear turno";
    submitting: "Creando…";
    cancel: "Cancelar";
    created: (patient: string, when: string) => string;   // `Turno creado para ${patient}, ${when}` (when = appointmentDayTime)
    slotGone: "Ese horario se ocupó recién. Elegí otro.";
    patientGone: "Esa paciente ya no está. Elegila de nuevo.";
    serviceRequired: "Elegí un servicio";
    genericError: "No se pudo crear el turno. Probá de nuevo.";
  };
};
```

Los estados del turno se leen con `APPOINTMENT_STATUS_TEXT` (`patient-summary.ts`, ya existe):
"Confirmado", "Vino", "No vino".

### 4.3 `apps/web/src/lib/calendar-route.ts` (nuevo, puro, con test)

```ts
import type { CalendarView } from "@nutri-bot/core";

export const CALENDAR_VIEWS: readonly CalendarView[];               // ["dia", "semana", "mes"]
export type FcViewType = "timeGridDay" | "timeGridWeek" | "dayGridMonth";
export const FC_VIEW: Record<CalendarView, FcViewType>;
export function calendarViewFromFc(type: string): CalendarView;     // desconocido → "semana"

/** Por ancho (D3, sin recordar la última elegida): wide (≥ 768 px) → "semana"; si no → "dia". */
export function defaultCalendarView(wide: boolean): CalendarView;

/** ?fecha= y ?vista= → lo que hay que mostrar.
 *  dayKey: fecha si isValidDayKey(fecha); si no, todayKey (sin error).
 *  view: vista si es una de CALENDAR_VIEWS; si no, "dia" si la fecha era válida (D2); si no,
 *  defaultCalendarView(wide). */
export function resolveCalendarRoute(
  params: { fecha: string | null; vista: string | null },
  ctx: { todayKey: string; wide: boolean },
): { view: CalendarView; dayKey: string };

/** Query canónica (Q2):
 *  - dayKey === todayKey y view === defaultCalendarView(wide) → vacía (URL "/");
 *  - dayKey === todayKey → solo vista;
 *  - otro día → fecha y vista, siempre las dos (sin vista, ?fecha= abriría Día).
 *  Propiedad: resolveCalendarRoute(query(state)) devuelve state. */
export function calendarRouteQuery(
  state: { view: CalendarView; dayKey: string },
  ctx: { todayKey: string; wide: boolean },
): URLSearchParams;

/** href con fecha/vista canónicas; conserva los demás parámetros y el hash. */
export function calendarHref(
  href: string,
  state: { view: CalendarView; dayKey: string },
  ctx: { todayKey: string; wide: boolean },
): string;
```

La URL se escribe con `replaceUrlInRouter` de `lib/patient-tab-route.ts` (se importa, no se mueve).

### 4.4 Calendario: comportamiento del cliente (`calendar-client.tsx`)

- **Props desde el servidor (solo datos, T9a):** `tz`, `currency`, `todayKey`, `services`
  (`{ id, name, durationMin }[]`), `legend` (`{ name, color }[]`), `summary` (`{ todayText: string;
  weekText: string; nextText: string | null }`), `businessHours`, `slotMin`, `slotMax`. Sale `focusDate`
  (lo reemplaza la lectura de la URL en el cliente, Q3).
- **Montaje sin desajuste de hidratación (Q1):** FullCalendar se monta **recién en el cliente**,
  después de conocer el ancho. Hasta entonces se muestra el esqueleto de la grilla (el mismo de
  `loading.tsx`, dentro de la tarjeta), con la barra ya dibujada (el título vacío con su alto
  reservado). Al montar: `wide = matchMedia("(min-width: 768px)").matches` (se guarda en un ref y **no**
  se recalcula al cambiar el tamaño, Q15); `{ view, dayKey } = resolveCalendarRoute(useSearchParams(),
  { todayKey, wide })`; `initialView = FC_VIEW[view]`, `initialDate = dayKey`.
- **URL que acompaña (D2):** en `datesSet` (FullCalendar lo llama en la carga y en cada navegación):
  `dayKey = api.formatIso(api.getDate(), true)`, `view = calendarViewFromFc(arg.view.type)` →
  `replaceUrlInRouter(calendarHref(window.location.href, { view, dayKey }, { todayKey, wide }))`.
  Nunca dentro de un updater de `setState`. Se guarda la última query escrita en un ref.
- **Cambios de URL desde afuera:** un efecto mira `useSearchParams().toString()`; si es distinto de la
  última query escrita (p. ej. el ítem "Calendario" de la sidebar lleva a `/` estando en el
  calendario), resuelve de nuevo y llama `changeView`/`gotoDate`. Sin esto, la vista no reacciona; con
  esto, sin loop (la query propia se ignora).
- **Título del período:** también en `datesSet`: `calendarPeriodTitle(view,
  api.formatIso(arg.view.currentStart, true), api.formatIso(arg.view.currentEnd, true), todayKey)`.
- **Deep link con turno a la vista (Q5):** si al montar había `?fecha=` válida y la vista es Día, en
  el primer `eventsSet` con eventos de ese día se hace `scrollIntoView({ block: "center", behavior:
  reducedMotion ? "auto" : "smooth" })` del primer evento, **una sola vez** y solo si no está ya en la
  ventana.
- **Barra propia (`calendar-toolbar.tsx`, nuevo):** `headerToolbar={false}`. Recibe del cliente
  `view`, `title`, `onPrev`, `onNext`, `onToday`, `onViewChange` (cliente → cliente). ‹ y ›:
  `Button` de primitivos `variant="ghost" size="icon-lg"` (44 px) con `aria-label` de
  `calendarNavLabels(view)` y `Tooltip` con el mismo texto; "Hoy": `secondary`, alto 44 px; título:
  `<h2 tabIndex={-1}>` en `text-title-3`, `aria-live="polite"`; vista: `SegmentedControl size="lg"`
  con `aria-label="Vista del calendario"` y las opciones de `AGENDA_TEXT.views`. Disposición: desde
  640 px un renglón (‹ Hoy › · título · segmentado a la derecha); debajo de 640 px dos renglones: el
  título arriba y debajo ‹ Hoy › + segmentado `fullWidth` (Q14).
- **Horas fuera de atención (C1):** `.fc .fc-non-business { background: hsl(var(--muted) / 0.45); }`
  en `globals.css` (hoy `hsl(var(--muted))` lleno). Tiene que verse más liviano que cualquier bloque de
  turno; si en la revisión visual no alcanza, bajar la opacidad (no rayar). Las reglas `.fc
  .fc-toolbar-title` y `.fc .fc-button-primary*` quedan sin uso y se borran.
- **Tocar una franja (Q4):** `selectable` sale; `dateClick={onDateClick}`. En vistas de horas
  (`!arg.allDay`) abre "Nuevo turno" con `initialDate = dayKey` y `initialStart = arg.date` (ISO); en
  Mes, solo el día. Se cierra el panel del turno si estaba abierto.
- **Turno con cancelación pendiente:** `usePendingDeletions()`; un efecto, y también el handler de
  `eventsSet`, recorren `api.getEvents()` y hacen `ev.setProp("display", pending.has(
  \`appointment-cancel:${ev.id}\`) ? "none" : "auto")` **solo si el valor cambia** (evita el loop de
  `eventsSet`). Q6.
- **Cancelar (lo dispara el panel, lo agenda el cliente):** `scheduleCancel(appt)` en el cliente
  (prop del panel, cliente → cliente) llama a `useDeferredDelete()` con:
  `key: \`appointment-cancel:${appt.id}\``, `message: AGENDA_TEXT.cancel.scheduled(firstName(appt.patientName))`,
  `undoneMessage: AGENDA_TEXT.cancel.undone`, `commit: () => cancelAppointmentAction(appt.id)`,
  `guardUnload: true`, `errorMessage: AGENDA_TEXT.cancel.error`, `onCommitted: refetch`.
- **Leyenda:** "Servicios" con el color de cada servicio; "Estados": "Vino" (`bg-success`) y "No vino"
  (`bg-destructive`) con `APPOINTMENT_STATUS_TEXT`. Los colores de estado de los eventos quedan como
  hoy (Q22).
- **Carga:** la barra fina actual (`role="status"`, `aria-label={AGENDA_TEXT.loading}`) se conserva.
- `PageHeader`: título "Calendario", sin descripción, acción "Nuevo turno" (`primary`, ícono `Plus`;
  el único botón azul lleno de la pantalla).
- **Franja de resumen:** un `<dl aria-label="Resumen de turnos">` con `summary.todayText`,
  `summary.weekText` y "Próximo: {nextText}" (o `AGENDA_TEXT.noNext`). En 390 px se apila (sin
  `truncate` que esconda el nombre: puede ir en dos líneas).

### 4.5 `(calendario)/page.tsx` (servidor)

- Ya no lee `searchParams` (lo hace el cliente, Q3). Sigue `force-dynamic`.
- Consultas (en paralelo): servicios activos, reglas activas (como hoy), **turnos de hoy** (`status in
  [CONFIRMED, COMPLETED, NO_SHOW]`, `startsAt` entre el inicio y el fin del día en `tz`, `select:
  { status, startsAt }`), **conteo de la semana** (mismos estados, lunes 00:00 a lunes siguiente en
  `tz`, Q23), **próximo turno** (`CONFIRMED`, `startsAt >= now`, como hoy, con `patient` y `service`).
- `summary.todayText = todaySummaryText(countAgendaDay(hoy, now))`, `summary.weekText =
  weekSummaryText(semana)`, `summary.nextText = next ? nextAppointmentText(...) : null`.
- `todayKey = formatInTimeZone(now, tz, "yyyy-MM-dd")`.

### 4.6 Actions (`apps/web/src/app/(panel)/actions.ts`, `"use server"`)

```ts
export type ActionResult = { ok: boolean; error?: string };                       // igual

export type CreateAppointmentResult = ActionResult & {
  /** Solo cuando se pidió una paciente nueva con un número que ya es de otra (Q10). */
  existingPatient?: { id: string; name: string | null; label: string };         // label = patientDisplayName
};

/** FormData:
 *  - Paciente existente: patientId.
 *  - Paciente nueva (sin patientId): patientName, patientPhone (formato libre).
 *  - Siempre: serviceId, startsAt (ISO), reason (opcional).
 *  Paciente existente: prisma.patient.findUnique({ id }) → si no existe o su JID es "not_person" →
 *    { ok: false, error: AGENDA_TEXT.create.patientGone }. NO llama a findOrCreatePatient ni
 *    escribe Patient (no se toca el nombre: D4a).
 *  Paciente nueva: name.trim() ≥ 2 (si no, nameRequired); parsePhoneInput(patientPhone) (si no,
 *    PHONE_INPUT_TEXT[error]); jid = phoneToJid(digits); si ya existe un Patient con ese JID →
 *    { ok: false, error: AGENDA_TEXT.create.existing(label), existingPatient } SIN crear nada; si
 *    no → findOrCreatePatient({ phone: digits, name }).
 *  Después: createAppointment({ patientId, serviceId, startsAt, createdBy: "PROFESSIONAL", reason }).
 *  Errores: InvalidBookingReasonError → su mensaje; SlotUnavailableError → AGENDA_TEXT.create.slotGone;
 *  otro → AGENDA_TEXT.create.genericError. revalidatePath("/"). */
export async function createAppointmentAction(_prev: ActionResult, formData: FormData): Promise<CreateAppointmentResult>;

/** Pacientes para el buscador de "Nuevo turno" (lectura; Q7). Solo contactos persona, con nombre
 *  primero (orden de buildPatientDirectory) y después los sin nombre. statusLine = próximo turno o
 *  "Sin turno" (sin consultas ni ConversationState: no hacen falta acá). */
export type AppointmentPatientOption = Pick<
  PatientDirectoryRow,
  "id" | "name" | "contactKind" | "phoneLabel" | "phoneDigits" | "searchName" | "statusLine"
>;
export async function listAppointmentPatientsAction(): Promise<AppointmentPatientOption[]>;

// Sin cambios de firma: cancelAppointmentAction, sendReminderNowAction, getAppointmentRemindersAction,
// setStatusAction, saveAppointmentReasonAction.
```

`listAppointmentPatientsAction` arma `PatientDirectoryInput[]` con la misma consulta de
`pacientes/page.tsx` sin `consultations` ni `conversationState` (`lastConsultationAt: null`,
`lastContactAt: null`) y llama a `buildPatientDirectory(inputs, now, tz)`; devuelve
`[...named, ...unnamed]` recortados a los campos del tipo.

**Pago manual** (`pagos/actions.ts`, `pagos/manual-payment-form.tsx`):

```ts
export type PaymentFormState = { ok: boolean; error?: string; kind?: "DEPOSIT" | "FULL"; amount?: number };
/** Igual que hoy + try/catch: si registerManualPayment tira → { ok: false, error: "No se pudo
 *  registrar el pago. Probá de nuevo." }. En éxito devuelve kind y amount, y revalida "/pagos" y "/". */
export async function registerManualPaymentAction(_prev: PaymentFormState, formData: FormData): Promise<PaymentFormState>;

export interface AppointmentOption {
  id: string; label: string; priceSnapshot: string;
  /** Opcional (017b-1): para el toast "Pago registrado: $ 15.000 de Brenda Yebara". */
  patientLabel?: string;
}
// ManualPaymentForm: props nuevas opcionales
//   defaultAppointmentId?: string   → turno elegido al abrir (si no, el primero, como hoy)
//   currency?: string               → para el toast con monto
//   onDone?: (r: { kind: "DEPOSIT" | "FULL"; amount: number }) => void   (hoy `onDone?: () => void`; el
//                                     parámetro nuevo es ignorable por el consumidor actual)
// Monto controlado: arranca en el precio del turno elegido (String(Number(priceSnapshot)), "15000") y
// se reemplaza al cambiar de turno; se puede editar. Toast: patientLabel && currency ?
// `Pago registrado: ${formatPrice(amount, currency)} de ${patientLabel}` : "Pago registrado".
```

`pagos/page.tsx` y `manual-payment-dialog.tsx` **no** se tocan en 017b-1 (los cambios de Pagos son de
017b-3; las props nuevas son opcionales).

### 4.7 `/api/appointments` (GET, `route.ts`)

Mismo `where` y orden. `include` suma `payments: { where: { kind: "FULL", status: "APPROVED" },
select: { id: true }, take: 1 }`. Cada evento:

- `title: appointmentEventTitle(a.patient, a.service.name)`.
- `extendedProps` suma `patientJid: a.patient.whatsappJid`, `patientLabel:
  patientDisplayName(a.patient)` y `hasFullPayment: a.payments.length > 0`. El resto igual.

`SelectedAppointment` (`appointment-detail-sheet.tsx`) suma `patientJid: string`, `patientLabel:
string`, `hasFullPayment: boolean`.

### 4.8 `lib/deferred-delete.ts` (agregados, sin romper 017c)

```ts
export interface DeferredDeleteStore {
  // schedule: el entry suma `guardUnload?: boolean` (default false).
  schedule(entry: { key: string; commit: () => Promise<CommitResult>; guardUnload?: boolean }): string;
  // … lo de hoy …
  /** true si hay alguna entrada con guardUnload en estado "pending" o "committing". */
  hasGuardedPending(): boolean;
}

export type DeferredDeleteOptions = {
  // … lo de hoy (key, message, undoneMessage, commit, afterSchedule?, undoneAction?) …
  /** Avisa con beforeunload mientras esté pendiente o enviándose (T10). */
  guardUnload?: boolean;
  /** Toast si el commit falla. Default UNDO_TEXT.deleteError. */
  errorMessage?: string;
  /** Corre después de un commit exitoso (además de router.refresh()). P. ej. refetch del calendario. */
  onCommitted?: () => void;
};
```

`subscribe` avisa también cuando cambia lo que devuelve `hasGuardedPending()` (los cambios de estado
ya llaman a `recompute`; asegurar que `pending → committing → done/borrado` notifique).

### 4.9 `components/pending-unload-guard.tsx` (nuevo, `"use client"`)

```ts
/** Sin props. useSyncExternalStore(deferredDeletes.subscribe, () => deferredDeletes.hasGuardedPending(),
 *  () => false); mientras sea true, registra `beforeunload` (preventDefault + returnValue = "").
 *  No intercepta navegación interna: el plazo sigue corriendo dentro del panel. */
export function PendingUnloadGuard(): null;
```

Se monta una vez en `app/(panel)/layout.tsx`, junto al `<Toaster />` (componente cliente sin props
desde un server component: permitido).

### 4.10 Rutas, server actions y API

| Ruta / pieza | Cambio |
|---|---|
| `/` (`(calendario)/page.tsx`) | Acepta `?fecha=yyyy-MM-dd` y `?vista=dia|semana|mes` (los lee el cliente). Resumen nuevo. Auth: la del layout del panel, como hoy. |
| `GET /api/appointments` | Título nuevo y tres `extendedProps` más (4.7). Sigue exigiendo sesión (401 sin ella). |
| `GET /api/slots` | Sin cambios. |
| `createAppointmentAction` | Contrato de 4.6. |
| `listAppointmentPatientsAction` | Nueva (lectura). |
| `registerManualPaymentAction` | Devuelve `kind`/`amount`, try/catch, revalida `/`. |

### 4.11 Mensajes del bot

**Ninguno cambia.** Lo que se encola es lo de hoy: `CONFIRMATION` al crear (`createAppointment`),
`CANCELLATION` al cancelar (ahora **8 s después**, al vencer el "Deshacer"), `REMINDER` manual. El
"Deshacer" no encola nada.

## 5-1. Diseño (lo que implementa el implementer)

### 5.1 Panel del turno (`appointment-detail-sheet.tsx`)

Sigue siendo el `Sheet` **no modal** de hoy (C6), mismo comportamiento de foco y de clics en el
calendario.

```
{patientLabel}                                       SheetTitle (Title 2)
{Servicio} · {Jueves 8 de octubre, 10:00}            SheetDescription (capitalizeFirst(appointmentDayTime))
[● Confirmado]  En Google Calendar                   Badge con ícono + APPOINTMENT_STATUS_TEXT

[👤 Ver ficha]  [💬 WhatsApp ↗]                       secondary; WhatsApp solo si whatsappChatUrl ≠ null
+54 9 351 555-2345 | WhatsApp no muestra el número
Precio        $ 15.000
Motivo        Quiere bajar de peso
              [✎ Editar motivo]                      plain, sm, ícono + texto
Recordatorios Se manda mañana a las 10:00            (solo CONFIRMED; "Turno pasado" si ya pasó)

[✓ Vino a la consulta]                               primary lg w-full (único azul lleno)
[✕ No vino] [🔔 Enviar recordatorio] [$ Registrar pago]   secondary; recordatorio solo si no pasó
──────────
Cancelar turno                                       ghost + text-destructive (no relleno rojo)
Le avisamos por WhatsApp.                            footnote
```

- Badge: `CONFIRMED` → `tone="info"` + `CalendarCheck`; `COMPLETED` → `success` + `Check`; `NO_SHOW` →
  `danger` + `UserX`; texto `APPOINTMENT_STATUS_TEXT[status]`.
- "Ver ficha": `ButtonLink` a `/pacientes/${patientId}` (`User`). "WhatsApp": `<a target="_blank"
  rel="noopener noreferrer">` con `MessageCircle` + `ExternalLink` y el texto "WhatsApp". Para un
  `hidden`: sin botón, y la línea del teléfono dice `HIDDEN_NUMBER_TEXT`.
- Estado `COMPLETED`: principal "Abrir la consulta" (`ButtonLink primary lg`, `ClipboardList`) si hay
  consulta; secundaria "Volver a confirmado" (con la confirmación de D3 de HU-003 si la consulta
  tiene contenido, como hoy). "Registrar pago" también en `COMPLETED`. `NO_SHOW`: solo "Volver a
  confirmado" (`secondary`).
- Toasts: `toastCompletedCreated` / `toastCompleted` (según `consultation.created`), `toastNoShow`,
  `toastBackToConfirmed`, `toastReminderQueued` / `toastReminderPending`, `toastReasonSaved`.
- "Vino a la consulta" deja el panel abierto y lo actualiza (como hoy `markCompleted`).
- **"Registrar pago" (D9, Q12):** visible si `status ∈ {CONFIRMED, COMPLETED}` y `!hasFullPayment`.
  Abre `appointment-payment-modal.tsx` (nuevo): `Modal` "Registrar pago" con `ManualPaymentForm`
  (`appointments=[{ id, label: \`${patientLabel} · ${serviceName} · ${appointmentDayTime}\`,
  priceSnapshot: price, patientLabel }]`, `defaultAppointmentId=id`, `currency`). Al terminar: cierra,
  `onChanged()` (refetch) y, si `kind === "FULL"`, `onUpdated({ ...appt, hasFullPayment: true })`.
- **"Cancelar turno" (D5, D6):** `confirm({ title: AGENDA_TEXT.cancel.title(patientLabel),
  description: AGENDA_TEXT.cancel.description(appointmentDayAtTime(start, now, tz)), confirmLabel:
  "Cancelar turno", cancelLabel: "Volver" })` (destructivo por defecto; el foco va a "Volver" por
  `ConfirmProvider`). Si confirma: `onClose()` y `onCancel(appt)` (prop nueva, la implementa el
  cliente: 4.4). El foco, como el evento queda oculto, va al título de la barra (`h2 tabIndex=-1`):
  `onCloseAutoFocus` ya cae al default si `returnFocusRef` no está conectado; el cliente enfoca el
  título en ese caso.

### 5.2 Nuevo turno (`new-appointment-modal.tsx` + `patient-picker.tsx` nuevo)

Contenedor: `Modal` desde 640 px; debajo, `Sheet side="bottom"` (patrón `useMediaQuery("(max-width:
639px)")` de 017c). Título "Nuevo turno". Se quita la descripción vieja (el aviso va junto al botón).

```
1  ¿Para quién?
   [🔍 Buscá por nombre o teléfono            ]       autofoco solo con puntero fino
   Prueba Brenda 017b                                  fila 44 px: nombre + (phoneLabel | HIDDEN) · statusLine
   Juan Pérez · Sin turno
   [+ Paciente nueva]                                  tinted
   — elegida —
   Prueba Brenda 017b · +54 9 351 001-7101   [Cambiar]
2  Servicio      [ Control (45 min)        ▾ ]
3  Día           [Hoy] [Mañana] [ 08/10/2026 📅 ]       atajos secondary 44 px + input date nativo
   Horario       [9:00] [9:45] [10:30] …               botones 44 px, hora en text-headline
   Motivo (opcional)  …                                "No se le manda a la paciente."
                         Le mandamos la confirmación por WhatsApp.
                                       [Cancelar]  [ Crear turno ]
```

- **Buscador (`patient-picker.tsx`):** al abrir el modal se llama una vez a
  `listAppointmentPatientsAction()` (estado "Cargando pacientes…" corto; error → "No se pudieron
  cargar las pacientes." + "Probar de nuevo"). Filtra con `matchesPatientQuery(row, q)`, hasta 8
  resultados; con `q` vacío muestra las 8 primeras con nombre. Patrón combobox accesible
  (`role="combobox"`, `aria-expanded`, `aria-controls`, `aria-activedescendant`; ↑/↓ mueven, Enter
  elige, Esc borra la búsqueda). Autofoco con `matchMedia("(pointer: fine)")` (D13 de 017c). Sin
  coincidencias: `AGENDA_TEXT.create.noResults(q)` + "Paciente nueva".
- **Elegida:** fila con `name ?? "Sin nombre"`, `phoneLabel ?? HIDDEN_NUMBER_TEXT` y "Cambiar" (`plain`),
  que vuelve al buscador con el foco adentro. Se manda `patientId`.
- **Paciente nueva:** "Nombre y apellido" (`autoComplete="name"`) + "WhatsApp" (`inputMode="tel"`,
  `autoComplete="tel"`, sin placeholder técnico) con la ayuda fija `PHONE_INPUT_TEXT.foreignHint`.
  Debajo, en vivo (`aria-live="polite"`): si `parsePhoneInput(v).ok` →
  `PHONE_INPUT_TEXT.confirmationPreview(formatPhone(digits))`; si además `digits` es el
  `phoneDigits` de una opción `phone` → `AGENDA_TEXT.create.existing(label)` + botón
  `chooseExisting(firstName ?? label)` que la elige (pasa a "Elegida"). Error inline solo al
  intentar crear (o al salir del campo con algo escrito): `nameRequired`, `PHONE_INPUT_TEXT.invalid`/`empty`.
  Se manda `patientName` + `patientPhone` (lo escrito; la action normaliza).
- **Servicio:** `Select` nativo como hoy ("Control (45 min)"); `servicePlaceholder`.
- **Día:** "Hoy" y "Mañana" calculados en `tz` (`todayKey` y el siguiente); input `type="date"`.
- **Horarios:** como hoy (`/api/slots`), pero con botones de 44 px (`ToggleGroup` o radio group con
  `role="radiogroup"`), hora `H:mm` en `text-headline`. **Horario preelegido (Q4):** si vino
  `initialStart` y está en la lista de slots (comparando `getTime()`), queda elegido; si no y hay
  servicio elegido, se lee `slotNotFree(hh:mm, servicio)` arriba de la lista y queda solo el día.
  `initialStart` se aplica una vez (al primer resultado de slots del día inicial con servicio).
- **Botón:** deshabilitado hasta tener paciente (o nueva con nombre y teléfono válido) y horario; el
  texto dice lo que falta: `choosePatient` → `chooseTime` → `submit`. A su izquierda,
  `whatsappNotice` en `text-footnote`.
- **Respuesta:** `ok` → `notify.saved(AGENDA_TEXT.create.created(label, appointmentDayTime(slot, now,
  tz)))`, refetch, cerrar y limpiar. `existingPatient` → mostrar el mismo aviso con "Elegir a …"
  (sin borrar lo escrito). Otro error → `FormError` y, si fue `slotGone`, volver a pedir los slots.

### 5.3 Estados, carga y vacíos

- `loading.tsx` del calendario: encabezado, franja de resumen de una línea, barra (dos bloques de
  44 px a los lados y el título en el medio; en < 640 px el título arriba) y la grilla.
- Sin turnos en el período: FullCalendar muestra la grilla vacía (no hay estado vacío aparte).
- Error al cargar eventos: `notify.error(AGENDA_TEXT.loadError)` como hoy.

## 6-1. Pantallas (skill `ui`)

| Vista | Estructura base | Componentes clave |
|---|---|---|
| Calendario, 1366 px | `PageHeader` (Calendario + "Nuevo turno") · franja de resumen · tarjeta con barra propia en un renglón y FullCalendar en Semana · leyenda. Panel del turno a la derecha, no modal. | `PageHeader`, `Button` (primary), `<dl>` resumen, `CalendarToolbar` (‹ Hoy ›, `h2`, `SegmentedControl lg`), FullCalendar `timeGridWeek`, `Tooltip`. |
| Calendario, 768 px | Igual, Semana, barra en un renglón. | Ídem. |
| Calendario, 390 px | Resumen apilado · barra en dos renglones (título arriba; ‹ Hoy › + segmentado a lo ancho) · FullCalendar en Día. | Ídem, `SegmentedControl fullWidth`. |
| Panel del turno | `Sheet` derecho no modal (a lo ancho en 390 px): encabezado · Ver ficha/WhatsApp · datos · acción principal · secundarias · separador · Cancelar. | `SheetHeader`, `Badge` con ícono, `ButtonLink`, `Button` (primary lg, secondary, ghost destructivo), `useConfirm` (AlertDialog), toast con "Deshacer". |
| Registrar pago (desde el turno) | `Modal` con el turno ya elegido y el monto precargado. | `Modal`, `ManualPaymentForm` (`Select`, `Input`), toast. |
| Nuevo turno, escritorio | `Modal` con 3 pasos numerados. | Combobox de pacientes, `Field`/`Input` (nueva), `Select` servicio, atajos Hoy/Mañana + `input date`, radio group de horarios 44 px, `Textarea`, `Button`. |
| Nuevo turno, 390 px | `Sheet` inferior arrastrable, mismo contenido en una columna. | Ídem; botones a lo ancho. |

## 7-1. Archivos y flujo

### 7.1 Flujo de cancelar con "Deshacer"

1. Panel → "Cancelar turno" → `useConfirm` (foco en "Volver").
2. Confirma → el panel se cierra → `CalendarClient.scheduleCancel(appt)` → `useDeferredDelete` →
   `deferredDeletes.schedule({ key: "appointment-cancel:<id>", commit, guardUnload: true })` → el evento
   se oculta (`setProp("display", "none")`) → toast "Turno cancelado. Le avisamos a {nombre} en unos
   segundos." + "Deshacer" (8 s) → `PendingUnloadGuard` registra `beforeunload`.
3. a) "Deshacer" → `undo` → el evento vuelve → "Listo, el turno sigue en pie". **Nada en la base.**
   b) Vence / se desliza → `commit` → `cancelAppointmentAction(id)` → `cancelAppointment` (domain:
   `CANCELLED` + `CANCELLATION` en la cola) → `router.refresh()` (resumen) + `onCommitted` (refetch de
   eventos). Falla → `notify.error(AGENDA_TEXT.cancel.error)` y el evento vuelve.
   c) Se cierra o recarga la pestaña → aviso del navegador; si sale igual, no se cancela.

### 7.2 Archivos

| Archivo | Acción |
|---|---|
| `packages/core/src/phone-input.ts` / `.test.ts` | nuevo |
| `packages/core/src/agenda.ts` / `.test.ts` | nuevo |
| `packages/core/src/index.ts` | + `export * from "./phone-input"`, `export * from "./agenda"` |
| `apps/web/src/lib/calendar-route.ts` / `.test.ts` | nuevo |
| `apps/web/src/lib/deferred-delete.ts` / `.test.ts` | agregados de 4.8 + tests |
| `apps/web/src/components/pending-unload-guard.tsx` | nuevo |
| `apps/web/src/app/(panel)/layout.tsx` | monta `<PendingUnloadGuard />` (una línea + import) |
| `apps/web/src/app/(panel)/actions.ts` | 4.6 |
| `apps/web/src/app/(panel)/actions.test.ts` | nuevo (9-1) |
| `apps/web/src/app/api/appointments/route.ts` | 4.7 |
| `apps/web/src/app/api/appointments/route.test.ts` | nuevo (9-1) |
| `apps/web/src/app/(panel)/pagos/actions.ts` | 4.6 (pago) |
| `apps/web/src/app/(panel)/pagos/actions.test.ts` | nuevo (9-1) |
| `apps/web/src/app/(panel)/pagos/manual-payment-form.tsx` | props opcionales y monto precargado |
| `apps/web/src/app/(panel)/(calendario)/page.tsx` | 4.5 |
| `apps/web/src/app/(panel)/(calendario)/loading.tsx` | 5.3 |
| `apps/web/src/app/(panel)/calendar-client.tsx` | 4.4 |
| `apps/web/src/app/(panel)/calendar-toolbar.tsx` | nuevo |
| `apps/web/src/app/(panel)/appointment-detail-sheet.tsx` | 5.1 |
| `apps/web/src/app/(panel)/appointment-payment-modal.tsx` | nuevo |
| `apps/web/src/app/(panel)/new-appointment-modal.tsx` | 5.2 |
| `apps/web/src/app/(panel)/patient-picker.tsx` | nuevo |
| `apps/web/src/app/globals.css` | solo el bloque `.fc` (non-business y reglas de botones sin uso) |

No se tocan: `pacientes/**` (el enlace de la ficha ya existe), `pagos/page.tsx`,
`pagos/manual-payment-dialog.tsx`, `packages/db/**`, `apps/bot/**`, zona de imleticio.

## 8-1. Checklist atómico (un commit por fase)

> Cada paso termina con el `typecheck` del workspace que toca en verde. `git add` solo de los
> archivos de la fase: el árbol tiene archivos ajenos sin trackear (`.mcp.json`,
> `docker-compose.prod.yml`, `hus-last-meet.md`, `apps/bot/.whatsapp-auth.vieja*/`,
> `docs/auditoria-apple/017a/`) que **no** se agregan. Trailer `Co-Authored-By` del implementer.

### Fase 0: preflight (sin commit)

- [ ] 0.1 `git status` y `git log -1` en `feat/hu-017b-agenda`; confirmar que contiene
      `feat/hu-017c4-informe` (`git merge-base --is-ancestor feat/hu-017c4-informe HEAD`).
- [ ] 0.2 `npm run db:generate` (no toca la base). Nada de `prisma migrate`.
- [ ] 0.3 Ver si hay un `next dev` del usuario corriendo (`lsof -iTCP -sTCP:LISTEN | grep node`): si
      lo hay, no se hace build en `apps/web/.next` (10.1).
- [ ] 0.4 Capturas **antes** (solo lectura): `/` a 1366×768, 768×1024 y 390×844, y el panel de un turno
      → `docs/auditoria-apple/017b/antes/` (no se commitean salvo pedido).
- [ ] 0.5 Abrir `progress/impl_HU-017b.md` con una sección "017b-1".

### Fase 1: core (commit `HU-017b-1: teléfono escrito a mano y textos de la agenda (core)`)

- [ ] 1.1 `phone-input.ts` + test (9-1). `npx vitest run packages/core/src/phone-input.test.ts`.
- [ ] 1.2 `agenda.ts` + test (9-1).
- [ ] 1.3 `index.ts` con los 2 `export *`. `npm run typecheck --workspace packages/core` y
      `npm run typecheck --workspace apps/bot`.

### Fase 2: mecanismos de web (commit `HU-017b-1: URL del calendario y aviso al cerrar con algo pendiente`)

- [ ] 2.1 `lib/calendar-route.ts` + test.
- [ ] 2.2 `lib/deferred-delete.ts`: `guardUnload`, `hasGuardedPending`, `errorMessage`,
      `onCommitted` + tests nuevos; los tests de 017c siguen verdes sin cambiar sus aserciones.
- [ ] 2.3 `components/pending-unload-guard.tsx` y montarlo en `(panel)/layout.tsx`.
- [ ] 2.4 `npm run typecheck --workspace apps/web` y `npm run test`.

### Fase 3: servidor (commit `HU-017b-1: crear turno sin pisar pacientes y eventos con nombre o teléfono`)

- [ ] 3.1 `actions.ts`: `createAppointmentAction` (4.6) y `listAppointmentPatientsAction`.
- [ ] 3.2 `actions.test.ts` (9-1).
- [ ] 3.3 `api/appointments/route.ts` (4.7) + `route.test.ts`.
- [ ] 3.4 `pagos/actions.ts` (4.6) + `pagos/actions.test.ts`; `manual-payment-form.tsx` con las props
      opcionales y el monto precargado (en `/pagos` se ve igual salvo el monto precargado).
- [ ] 3.5 `npm run typecheck --workspace apps/web`, `npm run test`.

### Fase 4: calendario (commit `HU-017b-1: barra propia, vista Día en el celular y ?fecha= que abre el día`)

- [ ] 4.1 `(calendario)/page.tsx` (4.5).
- [ ] 4.2 `calendar-toolbar.tsx` (4.4).
- [ ] 4.3 `calendar-client.tsx`: montaje en cliente, `resolveCalendarRoute`, `datesSet` → título y
      URL, efecto de URL externa, `dateClick`, ocultar pendientes, scroll al primer turno, leyenda,
      resumen, `scheduleCancel`.
- [ ] 4.4 `globals.css` (bloque `.fc`).
- [ ] 4.5 `(calendario)/loading.tsx`.
- [ ] 4.6 `npm run typecheck --workspace apps/web`, `npm run lint --workspace apps/web`.

### Fase 5: panel del turno (commit `HU-017b-1: panel del turno en palabras, cancelar con Deshacer y registrar pago`)

- [ ] 5.1 `appointment-detail-sheet.tsx` (5.1) con `SelectedAppointment` ampliado.
- [ ] 5.2 Cancelar: confirmación + `onCancel` → `scheduleCancel` del cliente; foco al título.
- [ ] 5.3 `appointment-payment-modal.tsx` + "Registrar pago".
- [ ] 5.4 `npm run typecheck --workspace apps/web`, `npm run lint --workspace apps/web`.

### Fase 6: nuevo turno (commit `HU-017b-1: nuevo turno eligiendo a la paciente`)

- [ ] 6.1 `patient-picker.tsx` (combobox, carga perezosa, paciente nueva con vista previa y aviso de
      número existente).
- [ ] 6.2 `new-appointment-modal.tsx` (Modal/Sheet, pasos, atajos, horarios 44 px, horario
      preelegido, botón que dice lo que falta, toast).
- [ ] 6.3 `npm run typecheck --workspace apps/web`, `npm run lint --workspace apps/web`, `npm run test`.

### Fase 7: verificación y cierre (commit `HU-017b-1: implementación y verificación`, solo `progress/impl_HU-017b.md`)

- [ ] 7.1 Todo 10-1 en verde, anotado en `progress/impl_HU-017b.md` (archivos, comandos y salida
      resumida, desvíos, capturas después en `docs/auditoria-apple/017b/despues/`).
- [ ] 7.2 Devolver `done -> progress/impl_HU-017b.md`.

## 9-1. Tests (vitest, `npm run test` desde la raíz)

Fixtures de fecha: `tz = "America/Argentina/Buenos_Aires"`, `now = 2026-10-05T13:00:00Z` (lunes 5 de
octubre de 2026, 10:00 en Argentina). En 2026 el 8 de octubre es **jueves** (los ejemplos de la HU con
"jueves 9 de octubre" son de 2025).

**`phone-input.test.ts`** (todas con `ok: true` y los `digits` indicados, salvo las marcadas)
- `"351 555 2345"`, `"3515552345"`, `"0351 555-2345"`, `"0351 15 555 2345"`, `"351 15 555 2345"`,
  `"(351) 555-2345"` → `"5493515552345"`.
- `"11 2345 6789"`, `"011 15 2345 6789"`, `"11 15 2345-6789"` → `"5491123456789"`.
- `"2954 12 3456"`, `"02954 15 12 3456"` → `"5492954123456"`.
- `"5493515552345"`, `"+54 9 351 555-2345"`, `"+54 351 555 2345"`, `"543515552345"`,
  `"0054 9 351 555 2345"`, `"+54 0351 15 555 2345"` → `"5493515552345"`.
- `"+598 99 123 456"` → `"59899123456"`; `"+1 555 123 4567"` → `"15551234567"`;
  `"+34 612 34 56 78"` → `"34612345678"`.
- `invalid`: `"59899123456"` (otro país sin +), `"555 2345"`, `"351 555 234"` (9 nacionales),
  `"+54 9 935 155 5234"` (nacional que no empieza con 11/2/3), `"+12"`, `"+1234567890123456"` (16).
- `empty`: `""`, `"   "`, `"abc"`.
- Integración con la vista previa: `formatPhone(parse("351 555 2345").digits)` →
  `"+54 9 351 555-2345"`.

**`agenda.test.ts`**
- `patientDisplayName`: `{ name: "  Brenda Yebara ", … }` → `"Brenda Yebara"`; sin nombre +
  `"5493515552345@s.whatsapp.net"` → `"+54 9 351 555-2345"`; `name: "   "` + teléfono → con formato;
  sin nombre + `"93127792677049@lid"` → `"Sin nombre"`; sin nombre + `@newsletter` → `"Sin nombre"`.
- `appointmentEventTitle(sin nombre phone, "Control")` → `"+54 9 351 555-2345 · Control"`; `@lid` →
  `"Sin nombre · Control"`.
- `firstName("María José Gómez")` → `"María"`; `"  Ana "` → `"Ana"`; `null` y `"  "` → `null`.
- `appointmentDayTime(2026-10-08T13:00Z)` → `"jueves 8 de octubre, 10:00"`;
  `2027-01-04T12:00Z` → `"lunes 4 de enero de 2027, 9:00"`; turno de hoy → `"lunes 5 de octubre, 16:30"`
  (no "Hoy": es para frases absolutas).
- `appointmentDayAtTime(2026-10-08T13:00Z)` → `"jueves 8 de octubre a las 10:00"`; 1:30 local
  (`2026-10-08T04:30Z`) → `"jueves 8 de octubre a la 1:30"`; 0:15 local → `"… a las 0:15"`.
- `countAgendaDay`: 4 `COMPLETED` + 1 `NO_SHOW` + 1 `CONFIRMED` a las 16:30 → `{ total: 6, remaining: 1 }`;
  un `CONFIRMED` a las 8:00 (ya pasó) cuenta en `total` y no en `remaining`; `CANCELLED` y
  `AWAITING_PAYMENT` no cuentan; `CONFIRMED` exactamente en `now` → no queda.
- `todaySummaryText`: `{6,1}` → `"Hoy: 6 turnos · queda 1"`; `{6,2}` → `"Hoy: 6 turnos · quedan 2"`;
  `{6,0}` → `"Hoy: 6 turnos · no queda ninguno"`; `{1,1}` → `"Hoy: 1 turno · queda 1"`; `{0,0}` →
  `"Hoy: sin turnos"`.
- `weekSummaryText`: 18 → `"Esta semana: 18 turnos"`; 1 → `"Esta semana: 1 turno"`; 0 →
  `"Esta semana: sin turnos"`.
- `nextAppointmentText` (hoy 16:30, "Brenda Yebara", "Control") → `"Hoy, 16:30 · Brenda Yebara · Control"`;
  mañana sin nombre → `"Mañana, 10:00 · +54 9 351 555-2345 · Control"`.
- `calendarPeriodTitle` (todayKey `"2026-10-05"`): `("dia","2026-10-08","2026-10-09")` →
  `"Jueves 8 de octubre"`; `("dia","2027-01-04","2027-01-05")` → `"Lunes 4 de enero de 2027"`;
  `("semana","2026-10-05","2026-10-12")` → `"5 – 11 de octubre"`;
  `("semana","2026-09-28","2026-10-05")` → `"28 de septiembre – 4 de octubre"`;
  `("semana","2026-12-28","2027-01-04")` → `"28 de diciembre de 2026 – 3 de enero de 2027"`;
  `("semana","2027-10-04","2027-10-11")` → `"4 – 10 de octubre de 2027"`;
  `("mes","2026-10-01","2026-11-01")` → `"Octubre 2026"`.
- `calendarNavLabels`: las tres vistas.
- `AGENDA_TEXT.cancel.title("Brenda Yebara")`, `.description(...)`, `.scheduled("Brenda")`,
  `.scheduled(null)`, `create.created(...)`, `create.slotNotFree("15:00", "Control")`: textos exactos.

**`apps/web/src/lib/calendar-route.test.ts`** (`todayKey = "2026-10-05"`)
- Sin parámetros: `wide: false` → `{ dia, 2026-10-05 }`; `wide: true` → `{ semana, … }`.
- `fecha: "2026-10-08"`, sin vista → `{ dia, 2026-10-08 }` con `wide` true y false.
- `fecha` `"2026-13-40"`, `"mañana"`, `""`, `"2026-02-30"` → hoy y vista por ancho.
- `vista: "mes"` → mes; `vista: "MES"` y `"xyz"` → se ignoran.
- `calendarRouteQuery`: hoy + vista por defecto → `""`; hoy + `mes` (wide) → `"vista=mes"`; otro día +
  `semana` → `"fecha=2026-10-08&vista=semana"`; otro día + `dia` → `"fecha=2026-10-08&vista=dia"`.
- Ida y vuelta: para cada vista × {hoy, otro día} × {wide, no wide}, `resolve(query(s)) === s`.
- `calendarHref("http://x/?foo=1#h", …)` conserva `foo` y `#h`; quita `fecha`/`vista` viejos.

**`apps/web/src/lib/deferred-delete.test.ts`** (agregados)
- `schedule({ …, guardUnload: true })` → `hasGuardedPending()` true; tras `undo` → false.
- Durante `committing` → true; tras commit exitoso → false (aunque la key siga oculta por
  `releaseAfterMs`); tras commit fallido → false.
- Una entrada sin `guardUnload` no cuenta; dos entradas, una con y otra sin, se resuelven por separado.
- `subscribe` avisa en cada transición.

**`apps/web/src/app/(panel)/actions.test.ts`** (mocks: `@nutri-bot/db`, `@nutri-bot/db/domain`,
`@/lib/appointments`, `@/lib/patients`, `next/cache`; patrón de `pacientes/actions.test.ts`)
- Con `patientId` de una paciente `phone`: llama a `createAppointment` con ese `patientId` y
  `createdBy: "PROFESSIONAL"`; **no** llama a `findOrCreatePatient` ni a `prisma.patient.update`/`upsert`;
  `{ ok: true }`; revalida `/`.
- Con `patientId` inexistente o de un `@newsletter` → `patientGone`, sin `createAppointment`.
- Paciente nueva `"Lucía Pérez"` + `"351 555 2345"` sin JID existente → `findOrCreatePatient({ phone:
  "5493515552345", name: "Lucía Pérez" })`.
- Paciente nueva con un número que ya existe → `{ ok: false, error: "Ese número es de María José
  Gómez", existingPatient: { id, name, label } }`, sin `findOrCreatePatient` ni `createAppointment`.
- Teléfono `"555 2345"` → `PHONE_INPUT_TEXT.invalid`; nombre `" "` → `nameRequired`; sin `serviceId`
  → `serviceRequired`.
- `SlotUnavailableError` → `slotGone`; `InvalidBookingReasonError("…")` → su mensaje; otro error →
  `genericError`.
- `listAppointmentPatientsAction`: descarta `@newsletter`, pone los con nombre antes que los sin
  nombre y devuelve solo los campos de `AppointmentPatientOption`.

**`apps/web/src/app/api/appointments/route.test.ts`** (mocks de `@/auth` y `@nutri-bot/db`)
- Sin sesión → 401. Rango inválido → 400.
- Título con nombre, con teléfono formateado y "Sin nombre · …" para `@lid`; `hasFullPayment` true
  cuando viene un pago; `patientJid` y `patientLabel` presentes.

**`apps/web/src/app/(panel)/pagos/actions.test.ts`**
- Éxito → `{ ok: true, kind: "FULL", amount: 15000 }`; revalida `/pagos` y `/`.
- `registerManualPayment` que tira → `{ ok: false, error: "No se pudo registrar el pago. Probá de nuevo." }`.
- Monto `0` o vacío → `"Datos inválidos"` (como hoy), sin llamar a domain.

## 10-1. Verificación (antes de declararse `done`)

### 10.1 Comandos (desde la raíz)

```bash
npm run db:generate
npm run typecheck                     # core, db, web y bot en verde (T3: core cambió)
npm run test                          # vitest de todo el monorepo (sin base ni red)
npm run lint --workspace apps/web     # sin warnings nuevos (el de ajustes/logo-form.tsx es previo)
./ops/harness/verify.sh               # "Arnés OK"
```

**Builds (webpack y Turbopack) en una copia** (nunca en `apps/web/.next` si el usuario tiene `next
dev` levantado):

```bash
SCR=<scratchpad>/build-017b1 && rm -rf "$SCR" && mkdir -p "$SCR"
rsync -a --exclude node_modules --exclude .next --exclude .git ./ "$SCR/"
cp -c -R node_modules "$SCR/node_modules"
cp -c -R apps/web/node_modules "$SCR/apps/web/node_modules" 2>/dev/null || true
cp .env "$SCR/.env"
cd "$SCR" && npm run build --workspace apps/web          # next build (webpack): exit 0
cd "$SCR/apps/web" && npx next build --turbopack         # "Compiled successfully", exit 0
```

Ninguno de los dos puede mostrar "Only async functions are allowed to be exported in a "use server"
file" ni "useSearchParams() should be wrapped in a suspense boundary" (si apareciera, envolver
`CalendarClient` en `<Suspense>` con el esqueleto).

**Runtime con `next start`** (sobre el build de webpack de la copia, puerto libre):

```bash
PORT=3197; lsof -iTCP:$PORT -sTCP:LISTEN && echo "ocupado: elegir otro"   # tiene que no imprimir nada
cd "$SCR/apps/web" && npx next start -p $PORT     # en segundo plano, log a $SCR/start.log
```

Con la cookie de sesión de Auth.js generada en local con el `AUTH_SECRET` (método de
`progress/impl_HU-017c.md`, "Runtime, contra next start") y Chromium headless (`playwright-core`):

- Pedir con recarga: `/`, `/?fecha=<mañana>`, `/?fecha=2026-13-40`, `/?fecha=ma%C3%B1ana`, `/?fecha=`,
  `/?vista=mes`, `/?fecha=<mañana>&vista=semana`, y `GET /api/appointments?start=…&end=…` (200, JSON
  con `patientLabel`). Todas 200 y sin el error boundary.
- **Log del servidor:** sin "cannot be passed to Client Components", sin "Functions cannot be passed",
  sin errores.
- **Consola del navegador:** sin errores de JS y **sin avisos de hidratación** ("A tree hydrated but
  some attributes…", "Hydration failed") a 1366 y a 390 px.
- A 390 px sin parámetros: vista Día (el segmentado marca "Día"); a 1366 px: Semana.
- `/?fecha=<mañana>` a 1366 px: vista Día de mañana; la URL queda igual.
- Tocar › en Día: la URL pasa a `?fecha=<pasado mañana>&vista=dia` y `history.length` no cambia.
- Flujo de cancelar con datos de prueba (los de 10.3, con el bot apagado): confirmar → el evento se
  oculta → durante el plazo `select count(*) from "OutboundMessage" where "appointmentId"='<id>'` = 0
  y el turno sigue `CONFIRMED` → "Deshacer" → vuelve, 0 filas; repetir y dejar vencer → `CANCELLED` + 1
  fila `CANCELLATION` → **borrarla por id en el acto**; repetir y recargar antes de los 8 s →
  `beforeunload` registrado (`page.on("dialog")` lo ve) → aceptar → el turno sigue `CONFIRMED`, 0
  filas; con `context.setOffline(true)` antes de que venza → "No se pudo cancelar el turno. Probá de
  nuevo." y el evento vuelve.
- Matar el `next start` y borrar la copia al terminar.

### 10.2 Alcance del diff

```bash
git diff feat/hu-017c4-informe --stat                                               # solo archivos de 7.2
git diff origin/develop --name-only | grep -E 'app/\(panel\)/(alimentos|plantillas)/|pacientes/\[id\]/planes/|components/(food-picker|meals-editor)\.tsx|lib/plan-pdf\.tsx$'   # → vacío
git diff origin/develop -- apps/web/src/lib/pdf-theme.ts | grep -E '^[-+]export' # → vacío (017c ya lo dejó así)
git diff feat/hu-017c4-informe --name-only | grep -E '^(apps/bot|packages/db|backlog)/'   # → vacío
git diff feat/hu-017c4-informe --name-only | grep -E 'schema\.prisma|/migrations/'       # → vacío
git diff feat/hu-017c4-informe -- packages/core/src/messages.ts                          # → vacío (T4)
```

### 10.3 Recorrido en Chrome (orquestador)

Con el `npm run dev` del usuario (o `next start` de la copia), logueado. Anchos: 1366×768, 768×1024 y
390×844 (emulación táctil en 390).

**Precondición dura: el bot apagado.** `pgrep -fl "apps/bot|dev:bot"` → vacío. Si está corriendo,
parar y pedirle al usuario que lo apague: `botPaused` no frena la cola (ver la verificación del
architect). El bot se vuelve a prender recién después del paso de limpieza.

**Datos de prueba (se crean y se borran por id; JID inventados).**

```bash
# 0) Foto de los conteos de antes (se compara al final):
docker compose exec -T db psql -U nutri -d nutribot -At -c "select (select count(*) from \"Patient\"), (select count(*) from \"Appointment\"), (select count(*) from \"OutboundMessage\"), (select count(*) from \"Consultation\"), (select count(*) from \"Payment\");"
# 1) Los JID de prueba no existen (tiene que dar 0):
docker compose exec -T db psql -U nutri -d nutribot -At -c "select count(*) from \"Patient\" where \"whatsappJid\" in ('5493510017101@s.whatsapp.net','900000017102@lid','5493510017104@s.whatsapp.net','5493510017103@s.whatsapp.net');"
# 2) Pacientes:
docker compose exec -T db psql -U nutri -d nutribot -c "insert into \"Patient\" (id, \"whatsappJid\", phone, name, \"createdAt\", \"updatedAt\") values
 ('hu017b1-brenda',     '5493510017101@s.whatsapp.net', '5493510017101', 'Prueba Brenda 017b', now(), now()),
 ('hu017b1-lid',        '900000017102@lid',             '900000017102',  null, now(), now()),
 ('hu017b1-sin-nombre', '5493510017104@s.whatsapp.net', '5493510017104', null, now(), now());"
# 3) Turnos de mañana (10:00, 11:30 y 13:00 en Argentina) con el primer servicio activo. Antes, mirar
#    que esas horas estén libres de turnos reales; si no, cambiar las horas. needsGoogleSync=false y
#    confirmationRequestedAt=now() para que ni la sincronización ni el pedido de confirmación los tomen.
docker compose exec -T db psql -U nutri -d nutribot -c "
with s as (select id, price, \"durationMin\" from \"Service\" where active order by name limit 1),
d as (select date_trunc('day', now() at time zone 'America/Argentina/Buenos_Aires') + interval '1 day' as dia)
insert into \"Appointment\" (id, \"patientId\", \"serviceId\", \"startsAt\", \"endsAt\", status, \"createdBy\", \"priceSnapshot\", \"needsGoogleSync\", \"bookedAt\", \"confirmationRequestedAt\", \"createdAt\", \"updatedAt\")
select v.id, v.pid, s.id,
  ((d.dia + v.h) at time zone 'America/Argentina/Buenos_Aires') at time zone 'UTC',
  ((d.dia + v.h + make_interval(mins => s.\"durationMin\")) at time zone 'America/Argentina/Buenos_Aires') at time zone 'UTC',
  'CONFIRMED', 'PROFESSIONAL', s.price, false, now(), now(), now(), now()
from s, d, (values ('hu017b1-turno-a','hu017b1-brenda', interval '10 hours'),
                   ('hu017b1-turno-b','hu017b1-lid',    interval '11 hours 30 minutes'),
                   ('hu017b1-turno-c','hu017b1-sin-nombre', interval '13 hours')) as v(id, pid, h);"
# 4) Limpieza (SOLO por id; agregar a las listas los ids que cree la UI, anotados en cada paso):
docker compose exec -T db psql -U nutri -d nutribot -c "
delete from \"Consultation\"    where \"appointmentId\" in ('hu017b1-turno-a','hu017b1-turno-b','hu017b1-turno-c' /*, ids de turnos creados por la UI */);
delete from \"OutboundMessage\" where \"appointmentId\" in ('hu017b1-turno-a','hu017b1-turno-b','hu017b1-turno-c' /*, ids de turnos creados por la UI */);
delete from \"Payment\"         where \"appointmentId\" in ('hu017b1-turno-a','hu017b1-turno-b','hu017b1-turno-c' /*, … */);
delete from \"Appointment\"     where id in ('hu017b1-turno-a','hu017b1-turno-b','hu017b1-turno-c' /*, … */);
delete from \"Patient\"         where id in ('hu017b1-brenda','hu017b1-lid','hu017b1-sin-nombre' /*, id de la paciente nueva */);"
```

Cada vez que la UI cree algo (turno nuevo, paciente nueva, mensaje en la cola, consulta, pago), anotar
su id con un `select … where "patientId" = '<id de prueba>'` o `where "appointmentId" = '<id de
prueba>'` y sumarlo a la limpieza. Si la UI encola un `CONFIRMATION` o un `CANCELLATION`, borrar esa
fila **por id en el momento**.

Pasos:
1. **1366×768**, `/`: barra en un renglón (‹ Hoy › · "5 – 11 de octubre" o el que toque · Día |
   Semana | Mes); vista Semana; las horas fuera de atención con un tinte suave, más liviano que los
   turnos. ‹ y › tienen nombre accesible "Semana anterior/siguiente" y tooltip.
2. Resumen: comparar "Hoy: N turnos · …" y "Esta semana: N turnos" con un `select` de conteo de hoy y
   de la semana (estados `CONFIRMED`, `COMPLETED`, `NO_SHOW`); "Próximo: …" con nombre o teléfono con
   formato.
3. Mañana se ven "Prueba Brenda 017b · {servicio}", "Sin nombre · {servicio}" (el `@lid`) y
   "+54 9 351 001-7104 · {servicio}".
4. **Panel del turno A:** nombre en grande, "{Servicio} · {Día d de mes}, 10:00", "Confirmado" con
   ícono, "Ver ficha" y "WhatsApp" con ícono y texto, "+54 9 351 001-7101", "Editar motivo" con texto,
   "Vino a la consulta" azul de 44 px, "Cancelar turno" como texto rojo al final. **No** tocar
   "WhatsApp" más que para ver el `href` (`wa.me/5493510017101`), ni "Enviar recordatorio".
   Panel del turno B (`@lid`): "WhatsApp no muestra el número" y sin botón "WhatsApp".
5. **Cancelar con Deshacer (turno A):** "Cancelar turno" → "¿Cancelar el turno de Prueba Brenda 017b?"
   con "Le avisamos por WhatsApp que se canceló el turno del {día} a las 10:00.", el foco en "Volver".
   Confirmar → el turno desaparece al instante; toast "Turno cancelado. Le avisamos a Prueba en unos
   segundos." con "Deshacer". En esos 8 s: `select status from "Appointment" where id='hu017b1-turno-a'`
   → `CONFIRMED` y `select count(*) from "OutboundMessage" where "appointmentId"='hu017b1-turno-a'` →
   0. "Deshacer" → vuelve, "Listo, el turno sigue en pie"; 10 s después sigue `CONFIRMED` y 0 filas.
6. **Aviso al cerrar:** cancelar el turno A otra vez y, antes de los 8 s, recargar → el navegador
   pregunta si salir; salir → el turno sigue en pie y 0 filas.
7. **Dejar vencer:** cancelar el turno C y no tocar nada → a los 8 s se va; `CANCELLED` y 1 fila
   `CANCELLATION` `PENDING` → **borrarla por id ya** (`delete from "OutboundMessage" where id='<id>'`).
8. **Vino / pago (turno A):** "Vino a la consulta" → "Listo. Se creó su consulta.", estado "Vino",
   principal "Abrir la consulta", secundaria "Volver a confirmado". "Registrar pago" → modal con el
   turno elegido y el monto = precio → guardar → "Pago registrado: $ … de Prueba Brenda 017b"; el
   botón "Registrar pago" desaparece. (Consulta y pago se borran en la limpieza.) "Volver a
   confirmado" → "Volvió a confirmado".
9. **Deep link:** abrir la ficha de "Prueba Brenda 017b" → tarjeta "Próximo turno" → `/?fecha=<mañana>`
   → vista **Día** de mañana, título "{Día} d de {mes}", el turno a la vista sin scrollear. Repetir a
   390 px.
10. `/?fecha=2026-13-40`, `/?fecha=mañana`, `/?fecha=` → hoy, vista por ancho, sin mensaje de error.
11. **URL que acompaña:** en Día de mañana tocar › dos veces y ‹ una → la URL cambia
    (`?fecha=…&vista=dia`) y `history.length` es el mismo; recargar → mismo día y vista; "Ver ficha"
    desde un turno y "Atrás" → mismo día y vista. El ítem "Calendario" de la sidebar → hoy.
12. **Nuevo turno, paciente existente:** "Nuevo turno" → "¿Para quién?" con el cursor en el buscador
    (1366). Escribir "brenda 017" → elegir "Prueba Brenda 017b" → queda elegida con "+54 9 351
    001-7101" y "Cambiar". Elegir el servicio, "Mañana", un horario libre → "Le mandamos la
    confirmación por WhatsApp." junto a "Crear turno" → crear → "Turno creado para Prueba Brenda
    017b, {día}, {hora}". Anotar el id del turno nuevo y **borrar su `CONFIRMATION` por id ya**.
    `select name, phone from "Patient" where id='hu017b1-brenda'` → sin cambios.
13. **Nuevo turno, paciente nueva:** buscar "Prueba Nueva" → "Paciente nueva" → escribir "351 001
    7101" → "La confirmación le llega al +54 9 351 001-7101" y "Ese número es de Prueba Brenda 017b" +
    "Elegir a Prueba". Cambiar a "0351 15 001 7103" → "+54 9 351 001-7103", sin aviso. Nombre "Prueba
    Nueva 017b", servicio, horario → crear. Anotar el id de la paciente nueva
    (`whatsappJid = '5493510017103@s.whatsapp.net'`) y del turno; **borrar el `CONFIRMATION` por id**.
14. **Horario preelegido:** en Semana tocar una franja libre de mañana dentro del horario de atención
    → "Nuevo turno" con ese día; elegir un servicio que tenga ese horario → queda elegido. Tocar una
    franja fuera de atención → "A las {hh:mm} no hay lugar para {servicio}. Elegí otro horario."
    Cerrar sin crear.
15. **390 px táctil:** vista Día; barra en dos renglones (título arriba); ‹ › y "Hoy" de 44 px; el
    segmentado a lo ancho; el panel del turno a lo ancho; "Nuevo turno" como sheet inferior; el
    teclado **no** se abre solo; tocar una franja (sin mantener) abre "Nuevo turno". Sin scroll
    horizontal (`document.documentElement.scrollWidth <= innerWidth`).
16. **Teclado:** Tab hasta el segmentado, flechas cambian de vista; ‹ › con Enter; Tab a un turno y
    Enter abre el panel; Esc lo cierra y el foco vuelve al turno; "Cancelar turno" → confirmación
    (foco en "Volver") → confirmar → el foco queda en el título → el toast "Deshacer" se alcanza con
    Tab (o `Alt+T`) y se anuncia.
17. **Movimiento reducido:** el thumb del segmentado aparece sin deslizar; el scroll al turno es
    instantáneo.
18. **Limpieza:** correr el bloque 4 con todos los ids anotados; repetir el paso 0 → mismos conteos que
    antes. Recién ahí se puede volver a prender el bot.

**Las tres tareas de D1** (Resolución D1: el orquestador las hace "como si fuera ella", pensando en
voz alta, y anota tiempos y dudas en `progress/recorrido_HU-017b.md`):
- **T1. Decir qué turnos tiene mañana** (1366 y 390 px, sobre los datos reales, solo mirar).
  Cronometrar desde que se abre "Calendario" hasta poder decir la lista. Meta: < 15 s, sin abrir
  ningún turno.
- **T2. Sacarle un turno a una paciente que ya existe** (con "Prueba Brenda 017b", paso 12).
  Cronometrar desde "Nuevo turno" hasta el toast. Meta: < 45 s, sin escribir el teléfono.
- **T3. Cancelar un turno y deshacerlo** (turno A, paso 5). Verificar que no quedó **ninguna** fila en
  `OutboundMessage` para ese turno.
- Anotar cada duda o término que haría preguntar a la nutricionista; si cambia algo de 017b-2 o
  017b-3, agregarlo al final de esta SDD antes de lanzar esa entrega. Queda pendiente del usuario
  repetirlo con ella.

## 11-1. Restricciones para el implementer

- **Datos de la base de desarrollo, regla dura (AGENTS.md):** ninguna verificación borra ni modifica
  datos de negocio preexistentes. Una prueba que escribe limpia **solo por los ids que ella misma
  insertó**, nunca con un filtro amplio. Los tests de vitest usan mocks. No correr `db:seed`/
  `seed:demo`. No `prisma migrate` de ningún tipo.
- **WhatsApp, nunca mensajes reales (AGENTS.md):** el runtime que crea, cancela o encola corre **con el
  proceso del bot apagado** (`botPaused` no alcanza), con los pacientes de prueba de 10.3 (JID
  inventados), y borra por id cada fila de `OutboundMessage` que se encole, en el momento. No se
  aprieta "Enviar recordatorio" ni el botón "WhatsApp" (solo se mira el `href`). No se abre WhatsApp
  Web.
- No tocar la zona de imleticio (T6), ni `apps/bot/**`, `packages/db/**`, `backlog/**`.
- No cambiar firmas existentes de `ui.tsx`, primitivos, `grouped-list.tsx`, `segmented-control.tsx`,
  `deferred-delete.ts` (solo agregar opcionales) ni de core.
- T9: nada de funciones/componentes como props de servidor a cliente; `replaceUrlInRouter`, nunca
  `window.history.state`; `"use server"` solo async y `export type`.
- No correr `next build` en `apps/web/.next` con el `next dev` del usuario levantado (10.1).

---

# Entrega 017b-2: disponibilidad y servicios

## 1-2. Resumen funcional

`/disponibilidad` pasa a ser **una lista por día** (lunes a domingo, en todos los anchos, sin scroll
horizontal) con los horarios en palabras ("Lunes: de 9:00 a 13:00 y de 15:00 a 19:00" o "No
atendés"), "Agregar horario" en cada día, **horarios que se editan** tocándolos (panel con "Desde",
"Hasta", "Guardar" y "Borrar este horario"), **superposiciones bloqueadas** con un mensaje que dice
con qué chocan, y borrados con confirmación + "Deshacer". Las excepciones se cargan en palabras ("No
atiendo todo el día" / "No atiendo un rato" / "Atiendo en otro horario"), se ven solo las próximas y
las pasadas quedan en "Pasadas (N)", cerrado. `/servicios` muestra el **precio destacado**, la
duración, **una línea gris** con lo que hace el bot y "Editar"; el switch "Lo ofrece el bot" mueve la
tarjeta a "Pausados" con transición y toast con "Deshacer"; el formulario va por grupos con switches,
**no reactiva un servicio pausado al guardar** y avisa al salir con cambios.

## 2-2. Workspaces afectados

`packages/core` **sí** (`availability-text.ts`, `service-summary.ts` + tests); `packages/db` **no**;
`apps/web` **sí** (`disponibilidad/**`, `servicios/**`, `lib/services.ts`); `apps/bot` **no** (lee las
reglas en el momento con `domain/availability.ts`, que no cambia; typecheck igual).

## 3-2. Esquema

**No cambia.** Editar un bloque es `update` de `startTime`/`endTime`/`weekday` (columnas existentes).

## 4-2. Contrato

### 4.1 `packages/core/src/availability-text.ts` (nuevo)

```ts
export interface TimeRange { id?: string; startTime: string; endTime: string }   // "HH:mm"
export const WEEKDAY_ORDER: readonly number[];                 // [1, 2, 3, 4, 5, 6, 0] (lunes primero)
export const WEEKDAY_NAMES: Readonly<Record<number, string>>;  // 0 → "Domingo" … 6 → "Sábado"
export function formatClock(hhmm: string): string;             // "09:00" → "9:00"
export function timeRangePhrase(r: TimeRange): string;         // "de 9:00 a 13:00"
/** Ordenados por inicio: "de 9:00 a 13:00", "de 9:00 a 13:00 y de 15:00 a 19:00",
 *  "de 8:00 a 10:00, de 11:00 a 13:00 y de 15:00 a 19:00"; [] → "No atendés". */
export function dayScheduleText(ranges: readonly TimeRange[]): string;
/** Primer rango de `others` (mismo día; sin el de excludeId) que se superpone con candidate:
 *  a.start < b.end && b.start < a.end (que se toquen en el borde no es superposición). null si ninguno. */
export function findOverlap(candidate: TimeRange, others: readonly TimeRange[], excludeId?: string): TimeRange | null;
/** Ids de los rangos que se superponen con algún otro (para marcar "Se superponen"). */
export function overlappingRangeIds(ranges: readonly (TimeRange & { id: string })[]): Set<string>;

export type ExceptionKind = "closed_day" | "closed_range" | "custom_hours";
export function exceptionKindOf(e: { type: "BLOCKED" | "CUSTOM_HOURS"; startTime: string | null; endTime: string | null }): ExceptionKind;
/** kind → columnas: closed_day → BLOCKED sin horas; closed_range → BLOCKED con horas; custom_hours → CUSTOM_HOURS con horas. */
export function exceptionFields(kind: ExceptionKind, startTime: string | null, endTime: string | null):
  { type: "BLOCKED" | "CUSTOM_HOURS"; startTime: string | null; endTime: string | null };
/** "Lunes 12 de octubre · No atendés · Feriado" · "… · No atendés de 14:00 a 16:00" ·
 *  "… · Atendés de 14:00 a 18:00"; sin motivo, sin el último tramo; año si no es el de todayKey. */
export function exceptionLine(
  e: { dayKey: string; type: "BLOCKED" | "CUSTOM_HOURS"; startTime: string | null; endTime: string | null; reason: string | null },
  todayKey: string,
): string;
/** upcoming: dayKey >= todayKey, ascendente; past: dayKey < todayKey, descendente. */
export function splitExceptions<T extends { dayKey: string }>(list: readonly T[], todayKey: string): { upcoming: T[]; past: T[] };

export const AVAILABILITY_TEXT: {
  weeklyTitle: "Horario de todas las semanas";
  exceptionsTitle: "Días especiales";
  addRange: "Agregar horario";
  addException: "Agregar excepción";
  from: "Desde"; to: "Hasta"; save: "Guardar";
  deleteRange: "Borrar este horario";
  overlapsBadge: "Se superponen";
  overlap: (r: TimeRange) => string;              // `Se superpone con el horario ${timeRangePhrase(r)}. Cambiá las horas o editá ese horario.`
  startBeforeEnd: "La hora de inicio tiene que ser antes que la de fin";
  saved: (day: string, r: TimeRange) => string;   // `Listo, el ${day minúscula} atendés ${timeRangePhrase(r)}`
  deleteTitle: (day: string, r: TimeRange) => string;   // `¿Borrar el horario del ${day minúscula} ${timeRangePhrase(r)}?`
  deleteDescription: "El bot deja de ofrecer turnos en ese horario. Los turnos ya dados no se cancelan.";
  deleteConfirm: "Borrar horario";
  deleted: "Horario borrado"; deletedUndone: "Listo, el horario volvió";
  exceptionKinds: Record<ExceptionKind, string>;  // "No atiendo todo el día", "No atiendo un rato", "Atiendo en otro horario"
  reasonLabel: "Motivo (opcional)"; reasonPlaceholder: "Feriado, congreso…";
  exceptionDeleteTitle: (dayLabel: string) => string;   // `¿Borrar el día especial del ${dayLabel}?`
  exceptionDeleteDescription: "El bot vuelve a usar tu horario de todas las semanas ese día.";
  exceptionDeleted: "Excepción borrada"; exceptionUndone: "Listo, la excepción volvió";
  past: (n: number) => string;                    // `Pasadas (${n})`
};
```

### 4.2 `packages/core/src/service-summary.ts` (nuevo)

```ts
/** Una línea con lo que hace el bot, solo lo activo, separado por " · ":
 *  "Pide seña (50 %)" | "Pide seña ($ 5.000)" (formatPrice) · "Manda recomendaciones" (si prepInstructions)
 *  · "Pide motivo" (si asksReason) · serviceRemindersSummary(reminders) (si hay recordatorios).
 *  Nada activo → "Sin recordatorios". */
export function serviceSummaryLine(
  s: { requiresDeposit: boolean; depositKind: "FIXED" | "PERCENT" | null; depositValue: number | null;
       prepInstructions: string | null; asksReason: boolean; reminders: readonly ServiceReminder[] },
  currency: string,
): string;
export const SERVICE_TEXT: { offeredByBot: "Lo ofrece el bot"; active: (n: number) => string /* "Activos (4)" */;
  paused: (n: number) => string; pausedToast: "Servicio pausado: el bot ya no lo ofrece";
  pausedUndone: "Listo, el bot lo vuelve a ofrecer"; resumed: "El bot ya lo ofrece"; edit: "Editar";
  groups: { data: "Datos"; deposit: "Seña"; beforeAppointment: "Antes del turno"; reminders: "Recordatorios"; onBooking: "Al reservar" };
  leaveTitle: "¿Salir sin guardar?"; leaveDescription: "Los cambios que hiciste se pierden."; keepEditing: "Seguir editando"; leave: "Salir sin guardar" };
```

### 4.3 Actions (`disponibilidad/actions.ts`)

```ts
export type FormState = { ok: boolean; error?: string; field?: "startTime" | "endTime" };   // field: para mostrar el error junto al campo
/** + superposición contra las reglas ACTIVAS del mismo weekday (findOverlap) → { ok:false, error: AVAILABILITY_TEXT.overlap(r), field: "startTime" }. */
export async function addRuleAction(_prev: FormState, fd: FormData): Promise<FormState>;
/** Nuevo. fd: id, weekday, startTime, endTime. Valida como add, excluyendo el propio id. Solo actualiza esas 3 columnas. Inexistente → "Ese horario ya no está. Recargá la página." */
export async function updateRuleAction(_prev: FormState, fd: FormData): Promise<FormState>;
/** Ahora devuelve resultado (para el commit diferido). Ya borrado (P2025) → { ok: true }. */
export async function deleteRuleAction(id: string): Promise<FormState>;
/** fd: date, kind ("closed_day" | "closed_range" | "custom_hours"), startTime?, endTime?, reason? → exceptionFields(kind,…). */
export async function addExceptionAction(_prev: FormState, fd: FormData): Promise<FormState>;
export async function deleteExceptionAction(id: string): Promise<FormState>;
```

`disponibilidad/page.tsx` lee solo `availabilityRule.findMany({ where: { active: true } })` (Q16).
Borrados diferidos: keys `rule:<id>` y `exception:<id>`, sin `guardUnload` (T10).

### 4.4 Servicios

- `toggleServiceAction(id, active): Promise<{ ok: boolean; error?: string }>` (hoy `void`). "Deshacer"
  llama a la misma action con `true`.
- `saveServiceAction`: el campo `active` **sale** del schema; en edición `updateService` no toca
  `active`; al crear, `active` queda en el default (`true`). Los switches mandan `"0"`/`"1"`:
  `requiresDeposit: z.enum(["0","1"]).optional()` (como `asksReason`); "Mandar recomendaciones"
  apagado manda `prepInstructions` vacío (Q17).
- `lib/services.ts`: `updateService(id, data)` con `active?: boolean` (opcional; si no viene no se
  toca).
- Formulario: `useUnsavedChangesGuard(dirty, …)` + interceptar el cierre del `Sheet` con `useConfirm`
  (`SERVICE_TEXT.leaveTitle`, "Seguir editando" como opción segura).

### 4.5 Mensajes del bot

Ninguno cambia. Ojo de comportamiento (no de texto): editar un horario o pausar un servicio cambia lo
que el bot ofrece **al instante** (como hoy); borrar un horario o una excepción, **8 s después**.

## 6-2. Pantallas (skill `ui`)

| Vista | Estructura base | Componentes clave |
|---|---|---|
| Disponibilidad (todas los anchos) | `PageHeader` ("Agregar excepción" filled) · "Horario de todas las semanas" (lista de 7 días) · "Días especiales" (próximas) · disclosure "Pasadas (N)". Desde 1280 px, dos columnas 2/3–1/3. | `GroupedList`/`GroupedListRow size="lg"`, chips de horario tocables 44 px, `Button tinted` "Agregar horario", `Badge` "Se superponen", `MoreActionsMenu` en excepciones. |
| Panel "Horario del lunes" | `Sheet` (derecho; inferior en < 640 px). | `SegmentedControl`/`Select` de día, `Input type="time"` 44 px, error inline, `Button primary lg`, "Borrar este horario" (ghost destructivo), `useConfirm`, toast con "Deshacer". |
| Panel "Agregar excepción" | `Sheet`. | `SegmentedControl` de 3 opciones, `Input type="date"`, Desde/Hasta condicionales, `Input` motivo. |
| Servicios | `PageHeader` ("Nuevo servicio") · "Activos (N)" · "Pausados (N)", grilla de tarjetas. | `Card`, precio `text-title-3`, línea `text-footnote`, `Switch` "Lo ofrece el bot", `Button` "Editar", `m.div layout` para la transición. |
| Formulario de servicio | `Sheet` con grupos titulados. | `GroupedList` por grupo, `Switch`, `SegmentedControl` "Porcentaje | Monto fijo", `Input` con moneda/"min", editor de recordatorios, guardia de cambios. |

## 7-2. Archivos

core: `availability-text.ts`, `service-summary.ts` (+ tests, `index.ts`). web: `disponibilidad/page.tsx`,
`view.tsx`, `schedule.tsx` (lista por día), `exceptions.tsx`, `actions.ts` (+ `actions.test.ts`),
`range-sheet.tsx` (nuevo), `exception-sheet.tsx` (nuevo), `loading.tsx`; `servicios/page.tsx`,
`service-card.tsx`, `service-form.tsx`, `reminders-editor.tsx` (solo estilo), `new-service-button.tsx`,
`actions.ts` (+ `actions.test.ts`), `loading.tsx`; `lib/services.ts`.

## 8-2. Checklist (un commit por fase)

- [ ] **A** core: `availability-text.ts` y `service-summary.ts` + tests; typecheck core y bot. Commit
  `HU-017b-2: textos del horario, superposición y resumen del servicio (core)`.
- [ ] **B** actions de disponibilidad y servicios (4.3, 4.4) + tests con mocks (superposición en add y
  update, `deleteRuleAction` con resultado, `saveServiceAction` sin tocar `active`, booleanos `"0"`). Commit
  `HU-017b-2: actions de horario y servicio listas (editar, sin superposición, sin reactivar)`.
- [ ] **C** disponibilidad: lista por día, panel de horario, borrado diferido, "Se superponen". Commit.
- [ ] **D** excepciones en palabras, próximas/pasadas, borrado diferido. Commit.
- [ ] **E** servicios: tarjeta, switch con transición y "Deshacer", formulario por grupos, guardia.
  Commit.
- [ ] **F** verificación 10-2 y `progress/impl_HU-017b.md` (sección 017b-2). Commit.

## 9-2. Tests

- `availability-text.test.ts`: `dayScheduleText` con 0, 1, 2 y 3 rangos (desordenados de entrada);
  `findOverlap` (12–16 vs 9–13 → choca; 13–15 vs 9–13 → no, se tocan; excludeId); `overlappingRangeIds`;
  `exceptionKindOf`/`exceptionFields` ida y vuelta; `exceptionLine` de los tres tipos, con y sin motivo,
  otro año; `splitExceptions` con hoy incluido en próximas.
- `service-summary.test.ts`: seña porcentaje y fija, todo apagado, recordatorios.
- `disponibilidad/actions.test.ts` y `servicios/actions.test.ts` (mocks): los casos de B.

## 10-2. Verificación

Comandos de 10.1/10.2 de 017b-1 (diff contra la rama de 017b-1). Runtime con `next start` (páginas
`/disponibilidad` y `/servicios`, logs sin "cannot be passed"). Recorrido (orquestador), **con el bot
apagado** (un horario de prueba cambia lo que ofrece el bot): sobre filas creadas por la prueba (un
horario de domingo 7:00–8:00, una excepción de prueba en una fecha futura, un servicio "Prueba 017b-2"
pausable), editar, superponer (mensaje junto a los campos y nada guardado), borrar con confirmación y
"Deshacer", dejar vencer (verificar con `select` por id), pausar/reanudar con "Deshacer", guardar el
servicio pausado (sigue pausado), salir con cambios. Las reglas reales solo se miran. Limpieza por id.
Tres anchos, teclado, movimiento reducido. Volver a mirar que las 9 reglas inactivas siguen igual en
la base (no se tocan).

---

# Entrega 017b-3: mensajes, pagos y avisos

## 1-3. Resumen funcional

**Mensajes**: tarjetas (sin tabla) con "Pendientes (N) | Respondidas", nombre o "Sin nombre" +
teléfono con formato, "Hoy, 22:40"/"hace 2 días", "Fuera de horario", el mensaje completo,
"Responder por WhatsApp" (o el texto para los `@lid`) y "Ya respondí" con **"Deshacer" diferido**
(nada cambia en la base durante 8 s); pendientes de la más vieja a la más nueva. **Pagos**: totales con
`Metric` ("Cobrado en octubre", "Señas esperando pago", "Cantidad de pagos"), navegación por mes
(`?mes=yyyy-MM`, límites en la zona de la profesional, "›" deshabilitado en el mes en curso), lista con
glosario simple, buscador + segmentado "Todos | Esperando pago | Cobrados" (sin los dos `select`), y
"Registrar pago" con turnos confirmados **y los que ya vinieron** (±7 días), monto precargado y tipo
en segmentado. **Avisos**: el comunicado arriba ("Revisar y enviar" → vista previa → **"Deshacer"
diferido**: nada en la cola durante 8 s, aviso del navegador al cerrar) y **solo a personas**
(`isPersonJid`, el mismo número que Pacientes); la cola como lista con destinatario en palabras
("Vos", nombre, teléfono con formato), tipo en castellano (los 10 de `MessageKind`), estado con ícono
y texto, y el error técnico detrás de "Ver detalle".

## 2-3. Workspaces afectados

`packages/core` **sí** (`month-range.ts`, `outbox-text.ts`, `payment-text.ts` + tests); `packages/db`
**no** (`listApprovedPaymentsInRange`, `listInquiries`, `markInquiryAnswered` sin cambios); `apps/web`
**sí** (`mensajes/**`, `pagos/**`, `avisos/**`, `lib/deferred-delete.ts` si suma `onUndone`); `apps/bot`
**no** (consume la cola igual; typecheck igual).

## 3-3. Esquema

**No cambia.**

## 4-3. Contrato

### 4.1 core

```ts
// month-range.ts
export function isValidMonthKey(key: string): boolean;                     // "2026-10"
export function monthKeyInTz(now: Date, tz: string): string;
export function monthRangeInTz(monthKey: string, tz: string): { from: Date; to: Date };   // [1° 00:00, 1° del siguiente 00:00) en tz
export function shiftMonthKey(monthKey: string, delta: number): string;
export function monthTitle(monthKey: string): string;                     // "Octubre 2026"
export function monthName(monthKey: string): string;                      // "octubre"

// outbox-text.ts
export type MessageKindLike = "CONFIRMATION" | "CONFIRMATION_REQUEST" | "CANCELLATION" | "REMINDER" |
  "PREP_INSTRUCTIONS" | "PAYMENT_LINK" | "PLAN_PDF" | "ANTHROPOMETRIC_REPORT_PDF" | "PROFESSIONAL_ALERT" | "AD_HOC";
export const MESSAGE_KIND_TEXT: Record<MessageKindLike, string>;          // tabla de la HU §4.6, exacta
export const OUTBOX_STATUS_TEXT: { PENDING: "Por enviar"; SENT: "Enviado"; FAILED: "No se envió" };
/** "Vos" si toJid === professionalJid; si no, nombre del paciente; si no, formatPhone (phone) o HIDDEN_NUMBER_TEXT. */
export function outboxRecipientLabel(m: { toJid: string; patientName: string | null; professionalJid: string | null }): string;
/** Destinatarios del comunicado: solo isPersonJid, sin repetidos, en el orden de entrada. (D13) */
export function broadcastRecipients(jids: readonly string[]): string[];
export const OUTBOX_TEXT: { /* textos del comunicado y la cola: "Mandar un aviso a todas tus pacientes",
  reach: (n) => `Le llega a ${n} pacientes por WhatsApp`, review: "Revisar y enviar", backToEdit: "Volver a editar",
  send: (n) => `Enviar a ${n} pacientes`, scheduled: (n) => `Comunicado listo para enviar a ${n} pacientes`,
  undone: "Listo, no se mandó", committed: (n) => `Comunicado en camino a ${n} pacientes`,
  error: "No se pudo mandar el comunicado. Probá de nuevo.", queueTitle: "Mensajes que mandó el bot",
  notSent: "No se pudo enviar.", seeDetail: "Ver detalle", retryAll: (n) => `Reintentar los ${n}`,
  retryDescription: "Se vuelven a mandar por WhatsApp." … */ };

// payment-text.ts
export const PAYMENT_TEXT: { kind: { FULL: "Pago completo"; DEPOSIT: "Seña" }; status: { APPROVED: "Cobrado"; PENDING: "Esperando pago" };
  provider: (p: string) => string /* "manual" → "Efectivo o transferencia"; resto → "Mercado Pago" */;
  collectedIn: (month: string) => string /* `Cobrado en ${month}` */; pendingDeposits: "Señas esperando pago"; count: "Cantidad de pagos";
  registered: (amount: string, patient: string) => string /* `Pago registrado: ${amount} de ${patient}` */;
  noAppointments: "No hay turnos para asociar. Tiene que haber un turno de la última semana o de la próxima." };
```

En `apps/web`, el uso de `MESSAGE_KIND_TEXT` va con `satisfies Record<MessageKind, string>` (tipo de
Prisma) para que un valor nuevo del enum rompa el typecheck.

### 4.2 web

- `avisos/actions.ts`: `broadcastMessageAction` filtra con `broadcastRecipients(patients.map(p =>
  p.whatsappJid))`; sin destinatarios → error; `sent` = cantidad filtrada. La página cuenta igual.
- `BroadcastForm`: confirmación con la burbuja del texto; al confirmar, `useDeferredDelete` con `key:
  \`broadcast:${crypto.randomUUID()}\``, `guardUnload: true`, `commit: () => sendAction({ ok: false },
  fd)`, `errorMessage: OUTBOX_TEXT.error`, `onCommitted` → toast `committed(n)`, y **`onUndone`**
  (agregado opcional a `DeferredDeleteOptions`: corre después de un "Deshacer" exitoso) que devuelve
  el texto al campo. El campo se vacía al programar. `sendAction` sigue siendo una prop **opcional
  definida del lado cliente** (Q18).
- `mensajes-view.tsx`: "Ya respondí" → `useDeferredDelete` con `key: \`inquiry-answered:${id}\``,
  `commit: () => markInquiryAnsweredAction(id)`, sin action nueva; la tarjeta sale con animación; se
  saca "Todas".
- `pagos/page.tsx`: `?mes=` (inválido o futuro → mes en curso), `monthRangeInTz`; turnos del pago
  manual con `status in [CONFIRMED, COMPLETED]`; `AppointmentOption.patientLabel` y `currency` (props
  de 017b-1).
- `avisos/page.tsx`: nombres por `prisma.patient.findMany({ where: { whatsappJid: { in: jids } },
  select: { whatsappJid, name, phone } })` sobre los 100 mensajes; `professionalJid =
  pro.phoneJid`.

### 4.3 Mensajes del bot

Ninguno cambia. Cambios de comportamiento: el comunicado se encola **8 s después** de confirmar y
**sin** canales, grupos ni difusiones (D13); "Ya respondí" se escribe 8 s después.

## 6-3. Pantallas (skill `ui`)

| Vista | Estructura base | Componentes clave |
|---|---|---|
| Mensajes | `PageHeader` + "Se actualiza sola · Actualizar ahora" · segmentado · tarjetas. | `SegmentedControl`, `Card`/fila grande, `Button tinted` "Responder por WhatsApp", `Button secondary` "Ya respondí", toast "Deshacer", `EmptyState`. |
| Pagos | `PageHeader` ("Registrar pago") · ‹ Mes › · 3 `Metric` · buscador + segmentado · lista agrupada. | `Metric`, `SegmentedControl`, `GroupedList`, `Modal` de pago con segmentado "Pago completo | Seña". |
| Avisos | `PageHeader` · comunicado (textarea + alcance + "Revisar y enviar") · "Mensajes que mandó el bot" con estado en vivo, segmentado y lista. | `Textarea`, `useConfirm` con vista previa (o `AlertDialog` propio con burbuja), toast "Deshacer", `GroupedList`, disclosure "Ver detalle", `Button` "Reintentar". |

## 7-3. Archivos

core: `month-range.ts`, `outbox-text.ts`, `payment-text.ts` (+ tests, `index.ts`). web:
`mensajes/mensajes-view.tsx`, `mensajes/page.tsx`, `mensajes/loading.tsx`; `pagos/page.tsx`,
`payments-table.tsx` (pasa a lista), `manual-payment-dialog.tsx`, `manual-payment-form.tsx`,
`loading.tsx`; `avisos/page.tsx`, `avisos-view.tsx`, `broadcast-form.tsx`, `actions.ts` (+ test),
`loading.tsx`; `lib/deferred-delete.ts` (`onUndone`, + test); si se acepta Q18,
`app/(panel)/dev-diseno/broadcast-demo.tsx` (cliente).

## 8-3. Checklist (un commit por fase)

- [ ] **A** core (`month-range`, `outbox-text`, `payment-text`) + tests. Commit.
- [ ] **B** `broadcastMessageAction` con `broadcastRecipients` + test con mocks (no encola
  `@newsletter`/`@g.us`, `sent` correcto, sin destinatarios → error); `onUndone` en `deferred-delete` +
  test. Commit `HU-017b-3: comunicado solo a personas y Deshacer que devuelve el texto`.
- [ ] **C** Mensajes. Commit.
- [ ] **D** Pagos (mes, lista, glosario, registrar pago con completados). Commit.
- [ ] **E** Avisos (comunicado diferido con vista previa, cola en palabras). Commit.
- [ ] **F** verificación 10-3 y `progress/impl_HU-017b.md` (sección 017b-3). Commit.

## 9-3. Tests

- `month-range.test.ts`: octubre en Buenos Aires → `[2026-10-01T03:00Z, 2026-11-01T03:00Z)`; diciembre
  → enero del año siguiente; `shiftMonthKey` cruzando año; `monthKeyInTz` a las 23:30 del 31 en
  Argentina (ya es otro mes en UTC) → el mes local.
- `outbox-text.test.ts`: los 10 tipos; `outboxRecipientLabel` ("Vos", nombre, teléfono, `@lid`);
  `broadcastRecipients` (descarta newsletter, grupos y broadcast; deduplica).
- `payment-text.test.ts`: glosario y `registered`.
- `avisos/actions.test.ts`: los casos de B.
- `deferred-delete.test.ts`: `onUndone` solo corre si el undo llegó a tiempo.

## 10-3. Verificación

Comandos de 10.1/10.2. Runtime con `next start`. **El comunicado real nunca se manda contra la base de
la usuaria** (le llegaría a todas, T8):
- En el runtime y en el recorrido, sobre la action real, **solo el camino "Deshacer"**: confirmar →
  durante los 8 s y después de "Deshacer", `select count(*) from "OutboundMessage" where kind='AD_HOC'
  and "createdAt" > '<t0>'` → 0; el texto vuelve al campo; recargar durante el plazo → aviso del
  navegador y 0 filas.
- El camino "vencer" se verifica con el test de la action (mocks) y, si se acepta Q18, en la demo de
  `/dev-diseno` con `sendAction` falso del lado cliente (toast "Comunicado en camino a N pacientes" y
  campo vacío, sin base).
- "Ya respondí": sobre una consulta de prueba (`PatientInquiry` de un paciente de prueba, creados por
  id), "Deshacer" (sigue `PENDING` en la base) y vencer (`ANSWERED`, el contador de la sidebar baja).
- Pagos: navegar meses (solo lectura); registrar un pago sobre un turno de prueba `COMPLETED` (bot
  apagado), borrar por id.
- Cola: ver la fila `ANTHROPOMETRIC_REPORT_PDF` `FAILED` real como "No se envió · Informe
  antropométrico (PDF)" con "Ver detalle"; **no** apretar "Reintentar" sobre filas reales.

---

# Entrega 017b-4: asistente y ajustes

## 1-4. Resumen funcional

**Asistente**: tres sugerencias tocables, burbujas con entrada suave, "Pensando…", composer que crece
hasta 5 líneas y queda fijo abajo en el celular, aviso fijo "Responde una IA con tus datos. Revisá lo
importante en la ficha.", "Nueva conversación" sin confirmación. **Ajustes**: secciones "General",
"Bot de WhatsApp", "Google Calendar" e "Informes en PDF" como listas agrupadas (índice lateral desde
1024 px; lista con navegación hacia adentro en el celular, "‹ Ajustes"), **cada grupo guarda solo lo
suyo** con "Cambios sin guardar" en la sección que quedó a medias, zona horaria y moneda en listas,
"Tu WhatsApp" con la vista previa de D4, sin jerga técnica (lo técnico detrás de "Ver detalle técnico"),
selector de archivo propio con vista previa, "Quitar" el logo con confirmación, y el estado del
WhatsApp con "Conectar WhatsApp" como acción principal cuando está desconectado; la vinculación con
pasos grandes y QR ≥ 264 px.

## 2-4. Workspaces afectados

`packages/core` **sí** (`settings-options.ts` + test; usa `parsePhoneInput` de 017b-1); `packages/db`
**no**; `apps/web` **sí** (`asistente/**`, `ajustes/**`); `apps/bot` **no** (lee `Professional` igual;
typecheck igual).

## 3-4. Esquema

**No cambia.** Mismos campos de `Professional`.

## 4-4. Contrato

### 4.1 core: `settings-options.ts` (nuevo)

```ts
export interface Option { value: string; label: string }
/** Zonas de Argentina primero, con nombres comunes:
 *  "America/Argentina/Buenos_Aires" → "Argentina (Buenos Aires, Córdoba, Rosario…)", y las demás zonas
 *  argentinas con sus provincias; después Uruguay, Chile, Paraguay, España. "Otra…" la arma la UI con
 *  Intl.supportedValuesOf("timeZone"). */
export const TIMEZONE_OPTIONS: readonly Option[];
export const CURRENCY_OPTIONS: readonly Option[];   // "Pesos argentinos (ARS)", "Dólares (USD)", "Euros (EUR)", "Pesos uruguayos (UYU)", "Pesos chilenos (CLP)"
/** Etiqueta para un valor guardado: la de la lista o, si no está, el valor tal cual. */
export function timezoneLabel(tz: string): string;
export function currencyLabel(code: string): string;
export const SETTINGS_TEXT: { /* "Te avisamos al …", "Cambios sin guardar", "Ver detalle técnico",
  "Avisale a quien te instaló el sistema", textos de bot desconectado, Google, logo… */ };
```

### 4.2 web: actions de Ajustes (Q19)

```ts
/** Reemplazan a saveSettingsAction (único consumidor: settings-form). Cada una actualiza SOLO sus columnas. */
export async function saveGeneralSettingsAction(_prev: SettingsState, fd: FormData): Promise<SettingsState>;   // timezone, currency, phone (parsePhoneInput; vacío → phoneJid null), acceptedInsurances
export async function savePdfStyleAction(_prev: SettingsState, fd: FormData): Promise<SettingsState>;         // pdfAccentColor, pdfFooterText
export async function saveSignatureIdentityAction(_prev: SettingsState, fd: FormData): Promise<SettingsState>; // title, licenseNumber
```

`SettingsFormProvider` y el form oculto `ajustes-generales` se van; cada grupo es su `<form>`. `?tab=`
sigue con `general | whatsapp | google | pdf` (el editor del informe enlaza `?tab=pdf`); la etiqueta
de `pdf` pasa a "Informes en PDF". `replaceState(null, …)` como hoy. Las demás actions (bot activo,
fuera de horario, IA, Google, logo, firma) no cambian de firma. `DEFAULT_PDF_ACCENT` se sigue
importando de `lib/pdf-theme.ts` (T6). Asistente: `askAssistantAction` sin cambios.

### 4.3 Mensajes del bot

Ninguno cambia.

## 6-4. Pantallas (skill `ui`)

| Vista | Estructura base | Componentes clave |
|---|---|---|
| Asistente | Encabezado + "Nueva conversación" · conversación · composer fijo abajo (material de barra). | Botones `tinted` 44 px de sugerencia, burbujas `m.div`, `Textarea` autoajustable 1–5 líneas, `Button` "Preguntar", texto de aviso. |
| Ajustes ≥ 1024 px | Índice lateral (activo `tint-soft`) + sección con listas agrupadas. | `GroupedList`, `Select` de zona/moneda, `Input` con vista previa, `Switch`, `Button` "Guardar" por grupo, punto "Cambios sin guardar", disclosure "Ver detalle técnico", `Alert` rojo + "Conectar WhatsApp". |
| Ajustes 390 px | Lista de secciones → sección con "‹ Ajustes". | `GroupedListRow` con chevron, `?tab=`. |
| Informes en PDF | Firma y matrícula · Firma · Logo · Color y pie. | Selector propio ("Elegir imagen" + nombre + vista previa + "Subir"), `useConfirm` "¿Quitar el logo?". |
| Vinculación | "‹ Ajustes" · estado · pasos numerados 28 px · QR ≥ 264 px. | Pasos, imagen QR, `AutoRefresh`, "Ver detalle técnico". |

## 7-4. Archivos

core: `settings-options.ts` (+ test, `index.ts`). web: `asistente/assistant-chat.tsx`, `asistente/page.tsx`;
`ajustes/page.tsx`, `ajustes-tabs.tsx`, `settings-form.tsx` (se parte en `general-form.tsx`,
`pdf-style-form.tsx`, `signature-identity-form.tsx`), `actions.ts` (+ `actions.test.ts`),
`after-hours-form.tsx`, `bot-ai-form.tsx`, `bot-toggle.tsx`, `google-calendar-form.tsx`,
`logo-form.tsx`, `signature-form.tsx`, `loading.tsx`, `whatsapp/**`. **No** se toca
`lib/pdf-theme.ts`.

## 8-4. Checklist (un commit por fase)

- [ ] **A** core `settings-options.ts` + test. Commit.
- [ ] **B** las 3 actions de guardado por grupo + test con mocks que fija la `data` exacta de cada
  `update` (General no toca PDF ni firma, y viceversa); "Tu WhatsApp" con `parsePhoneInput`. Commit.
- [ ] **C** Ajustes: índice/lista, grupos, "Cambios sin guardar", listas de zona y moneda, sin jerga,
  selector de archivo propio, "Quitar logo" con confirmación, bot desconectado, vinculación. Commit.
- [ ] **D** Asistente. Commit.
- [ ] **E** verificación 10-4 y `progress/impl_HU-017b.md` (sección 017b-4). Commit.

## 9-4. Tests

- `settings-options.test.ts`: la zona por defecto tiene etiqueta; `timezoneLabel` de una zona fuera de
  la lista devuelve el valor; las monedas.
- `ajustes/actions.test.ts`: `data` exacta de cada action; zona inválida → error; teléfono "351 555
  2345" → `phoneJid "5493515552345@s.whatsapp.net"`; vacío → `null`; inválido → `PHONE_INPUT_TEXT.invalid`.
- Los tests existentes de logo y firma siguen verdes sin cambios.

## 10-4. Verificación

Comandos de 10.1/10.2, más `git diff origin/develop -- apps/web/src/lib/pdf-theme.ts` → vacío. Runtime
con `next start` (`/ajustes` con cada `?tab=`, `/ajustes/whatsapp`, `/asistente`). Recorrido: "Cada
grupo guarda lo suyo" **guardando el mismo valor que ya tiene** la usuaria (o cambiándolo y
devolviéndolo, anotando el valor original antes); no se desconecta Google, no se pausa el bot, no se
sube ni se quita el logo o la firma reales (el selector se prueba hasta la vista previa y se cancela).
El asistente se prueba con una pregunta de solo lectura si hay clave de IA; si no, el estado "no
disponible".

---

## 11. Riesgos y rollback

| # | Riesgo | Mitigación |
|---|---|---|
| R-1 | La cancelación diferida no se ejecuta (pestaña cerrada) y ella cree que avisó a la paciente. | Aviso del navegador mientras esté pendiente (T10); el toast dice "en unos segundos"; el turno reaparece al volver. Falla del lado seguro elegida en D5. |
| R-2 | Un turno o un comunicado sale dos veces (doble commit). | El store resuelve cada entrada una sola vez (017c-3); `cancelAppointment` no encola si el turno ya no está `CONFIRMED`; la cola tiene unicidad por `[appointmentId, kind, dedupeKey]` para la cancelación. |
| R-3 | Desajuste de hidratación por la vista inicial según el ancho. | FullCalendar se monta solo en el cliente (Q1); el runtime verifica la consola limpia a 1366 y 390 px. |
| R-4 | Props viejas en el "Atrás" (el router de Next cachea la página con la URL original). | El cliente lee la URL con `useSearchParams` (Q3), no props del servidor; paso 11 del recorrido. |
| R-5 | `findOrCreatePatient` pisa el nombre o duplica una paciente. | Con `patientId` no se llama; con un número existente se devuelve `existingPatient` sin escribir (4.6); tests que lo fijan. |
| R-6 | Un número mal normalizado manda la confirmación a otra persona. | Vista previa siempre visible; sin "+" solo Argentina (Q8); tests de `parsePhoneInput`. |
| R-7 | El comunicado llega a canales/grupos o a todas por una prueba. | `broadcastRecipients` con test; nunca se aprieta el comunicado real sobre la base de la usuaria (10-3). |
| R-8 | Turbopack/webpack rechazan exports o props de servidor a cliente. | Builds de los dos y runtime con `next start` en cada entrega (T9d). |
| R-9 | Turnos fuera de `slotMinTime`/`slotMaxTime` (antes de la primera regla activa −1 h) no se ven. | Comportamiento previo, no cambia en esta HU. Si el recorrido encuentra uno, se anota como tarea aparte. |
| R-10 | Editar o pausar cambia al instante lo que ofrece el bot. | Igual que hoy; las pruebas con datos de prueba van con el bot apagado. |

**Rollback:** sin datos ni migraciones. Cada entrega es un PR; cada fase, un commit revertible. Los
módulos nuevos de core quedan sin uso si se revierte la UI y no molestan.

---

## 12. Dudas técnicas (cada una con recomendación; ninguna bloquea 017b-1)

| # | Duda | Recomendación (default del implementer) |
|---|---|---|
| Q1 | Vista inicial por ancho sin desajuste de hidratación: el servidor no conoce el ancho. | **Montar FullCalendar solo en el cliente**, después de leer `matchMedia("(min-width: 768px)")`, con el esqueleto de la grilla mientras tanto (un cuadro). FullCalendar ya renderiza vacío en el servidor; montarlo después no cambia lo que se ve y evita el `changeView` posterior. |
| Q2 | ¿Qué se escribe en la URL? | Regla de `calendarRouteQuery`: hoy + vista por defecto → `/` limpio (recargar mañana muestra mañana, no ayer); hoy con otra vista → solo `?vista=`; otro día → `?fecha=` y `?vista=` siempre juntos. Así `?fecha=` solo (lo de la ficha) sigue significando "Día". |
| Q3 | ¿El cliente lee `fecha`/`vista` de props del servidor o de la URL? | **De la URL** (`useSearchParams`), una vez al montar y cuando cambie desde afuera. Con `replaceState(null, …)`, el "Atrás" de Next puede restaurar la página con props del render original (`/` sin parámetros); la URL del navegador es la verdad. |
| Q4 | Tocar una franja en el celular: `select` exige mantener apretado 1 s. | Cambiar a **`dateClick`** (responde a un toque) y sacar `selectable`. Arrastrar para elegir un rango no se usa (el servicio define la duración). |
| Q5 | "El turno de las 10:00 a la vista sin scrollear" con `height="auto"` (la página es la que scrollea). | Con `?fecha=` en Día, `scrollIntoView` del primer turno del día, una sola vez y solo si no está a la vista. Sin `?turno=` (fuera de alcance). |
| Q6 | Ocultar el turno con cancelación pendiente sin que FullCalendar vuelva a pedir eventos. | `ev.setProp("display", "none" | "auto")` desde un efecto sobre `usePendingDeletions()` y desde `eventsSet`, solo cuando cambia. No usar un `eventClassNames` que cambie de identidad en cada render (el comentario de "referencias estables" del archivo). |
| Q7 | Pacientes del buscador: ¿prop de la página o carga al abrir? | **Carga perezosa** con `listAppointmentPatientsAction` al abrir "Nuevo turno": el calendario es la pantalla de inicio y no necesita la lista; además queda fresca después de crear una paciente. |
| Q8 | Número sin "+" que no es argentino ("59899123456"). | **Inválido**, con la ayuda fija "Si es de otro país, empezá con +". Adivinar el país convierte un error de tipeo argentino de 11 dígitos en un número de Portugal. |
| Q9 | "+54 351 …" o "54351…" sin el 9. | Agregar el 9 (D4): WhatsApp en Argentina usa el 9 de móvil; un fijo con WhatsApp es raro y la vista previa lo muestra. |
| Q10 | "Paciente nueva" con un número que ya existe, del lado del servidor (si el cliente no lo detectó). | Devolver `existingPatient` **sin escribir nada** (ni renombrar ni usarla en silencio): la UI muestra "Ese número es de …" + "Elegir a …". Puede ser otra persona con el mismo WhatsApp (un familiar); que decida ella. |
| Q11 | "Hoy: 6 turnos · quedan 0". | "Hoy: 6 turnos · no queda ninguno". Sin turnos: "Hoy: sin turnos". |
| Q12 | "Registrar pago" desde el turno: ¿cuándo se muestra y con qué formulario? | En `CONFIRMED` y `COMPLETED` sin pago `FULL` `APPROVED`; con el `ManualPaymentForm` de Pagos (props opcionales nuevas). La lista de Pagos con completados es de 017b-3. |
| Q13 | Aviso al cerrar: ¿qué lo dispara y dónde vive? | `guardUnload` en la entrada diferida (cancelar turno y comunicado), activo en `pending` y `committing`; un solo `PendingUnloadGuard` en el layout del panel. El texto del diálogo es el del navegador. |
| Q14 | La HU pide "un renglón" también en 390 px, pero su §4.1 acepta dos renglones si no entra. | **Dos renglones debajo de 640 px** (título arriba; controles abajo, segmentado a lo ancho). En 390 px ‹ Hoy › + título + segmentado de 44 px no entran en un renglón legible. |
| Q15 | ¿La vista cambia sola al cambiar el ancho (rotar la tablet)? | **No**: solo al cargar (D3, predecible). La usuaria cambia con el segmentado. |
| Q16 | `/disponibilidad` lista las 9 reglas inactivas como si valieran (el bot y el calendario las ignoran). | En 017b-2, **listar y validar solo las activas**, igual que el bot. Las inactivas no se muestran, no se borran ni se reactivan (no hay forma de crearlas desde el panel; vienen de cargas viejas). Si el usuario quiere limpiarlas, tarea aparte con su permiso. |
| Q17 | Booleanos del form de servicio con `z.coerce.boolean()` ("0" → true) y `active ?? true`. | Sacar `active` del form (en edición no se toca); `requiresDeposit` como `"0"`/`"1"` con `z.enum`, igual que `asksReason`. Tests que fijan que guardar un servicio pausado no lo reactiva. |
| Q18 | ¿Cómo se prueba el camino "vencer" del comunicado sin mandarlo a nadie? | Una demo en `/dev-diseno` (que ya existe solo en desarrollo) con `BroadcastForm` y un `sendAction` falso **definido en un componente cliente** (no pasado desde el servidor, T9a). Más el test de la action con mocks. |
| Q19 | Ajustes por grupo: ¿partir la action o mandar los campos de los otros grupos con su valor guardado? | **Partir en 3 actions** que tocan solo sus columnas. Mandar los demás campos "con el valor guardado" vuelve a pisar lo que se tipeó en otra sección si el formulario se arma mal, que es justo el bug de hoy. |
| Q20 | Ramas de 017b-2, 017b-3 y 017b-4. | Encadenadas como 017c (Q6 de 017c): `feat/hu-017b2-disponibilidad` desde `feat/hu-017b-agenda`, `feat/hu-017b3-bandejas`, `feat/hu-017b4-ajustes`; los PR se mergean en orden y, al mergearse uno, el siguiente se rebasea. |
| Q21 | ¿El `CANCELLATION` diferido puede chocar con una cancelación del paciente por el bot en esos 8 s? | No hace falta nada: si el bot ya canceló, `cancelAppointment` ve el turno `CANCELLED`, no encola y devuelve ok; el panel refresca. |
| Q22 | Colores de los eventos: hoy `COMPLETED`/`NO_SHOW` pisan el color del servicio. | **Dejarlo** (la HU dice "como hoy"); la leyenda explica "Vino"/"No vino". |
| Q23 | "Esta semana": ¿lunes a domingo o los próximos 7 días? | Lunes a domingo en la zona de la profesional (como hoy), mismos estados que "Hoy". |
| Q24 | ¿"Próximo" incluye turnos que esperan la seña? | No (como hoy, solo `CONFIRMED`): esos turnos no se ven en el calendario y vencen a los 15 min. |

---

## Decisiones (2026-10-04, modo autónomo del orquestador)

- SDD aprobada. **Q1–Q24 aceptadas con su recomendación** (Q20: ramas encadenadas `feat/hu-017b-agenda` (017b-1) →
  `feat/hu-017b2-disponibilidad` → `feat/hu-017b3-bandejas` → `feat/hu-017b4-ajustes`).
- Precondición dura confirmada el 2026-10-04: el proceso del bot **no** está corriendo (`BotStatus.connected = false`
  desde el 2026-10-03). Nadie lo levanta durante esta HU.
- Implementer: Opus; skills ui-ux-pro-max, apple-design, web-design-guidelines. Reviewer: Opus.
