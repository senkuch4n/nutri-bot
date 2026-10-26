# SDD: HU-021 `lista-turnos` (Lista de turnos con estado y pagos registrados)

- **HU validada:** `docs/hu-lista-turnos.md`. Mandan las "Resoluciones (2026-10-26)" de la §7 (sin
  tarjeta «Por cobrar», D1–D9).
- **Rama:** `feat/HU-021-lista-turnos` (sale de la rama local de `MorphDialog`, commits `92c0395` y
  `10ece48`, que todavía no están en `develop`). PR a `develop` cuando el usuario lo pida.
- **Issue:** https://github.com/senkuch4n/nutri-bot/issues/50.
- **Skills aplicados:** `skills/ui.txt` (pantallas: vista, estructura base, componentes clave → §7).
- **Toca `schema.prisma`:** **no.** Sin migración (ver T3). No hace falta la label `migración`.

> **Verificación del architect (2026-10-26, solo lectura).**
> - Base de desarrollo (`docker compose exec db psql -U nutri -d nutribot`): 13 turnos (5 CONFIRMED,
>   6 COMPLETED, 1 NO_SHOW, 1 CANCELLED por PATIENT con motivo "Reprogramó por trabajo"). **Los 13
>   tienen `bookedAt` NULL** (son del seed). 3 pagos, todos `APPROVED`/`FULL`/`manual`. Ningún turno
>   con precio 0 ni con pagos que superen el precio.
> - Las reservas con seña que se cancelan solas salen **solo** de `packages/db/domain/payments.ts`:
>   `expireStalePendingPayments` (`cancelReason: "Venció el tiempo para pagar la seña"`, línea 211) y
>   el `catch` de `createDepositCheckout` (`"No se pudo generar el checkout de la seña"`, línea 73).
>   Las dos pasan `AWAITING_PAYMENT → CANCELLED` con `cancelledBy: PROFESSIONAL`.
> - `cancelAppointment` (`domain/appointments.ts:140`) solo cancela turnos `CONFIRMED` y el panel la
>   llama sin motivo (`cancelAppointmentAction(appt.id)`). El bot pasa `by: PATIENT`. Ningún otro
>   camino escribe esos dos textos.
> - `expireStalePendingPayments` la corre el bot (`apps/bot/src/workers.ts:23`).
> - `AppointmentDetailSheet` es un `Sheet` de Radix (`@radix-ui/react-dialog`): `SheetTitle` /
>   `SheetDescription` son `Dialog.Title` / `Dialog.Description` y funcionan dentro de cualquier Root de
>   Radix Dialog, incluido `MorphDialog` (también Radix Dialog). `MorphDialogContent` reenvía sus props
>   al `DialogPrimitive.Content` (`onOpenAutoFocus`, `onCloseAutoFocus`) y devuelve el foco al elemento
>   que lo tenía al abrir (o al `origin`).
> - `GroupedListRow` con `onClick` renderiza un `<button>` pero hoy el callback no recibe el evento
>   (`onClick?: () => void`): hace falta para tomar el `origin` de la fila en el celular (C1).
> - `runDeferredDelete` ya hace `router.refresh()` después del commit; el store de borrados diferidos
>   es único en el panel, así que una cancelación pendiente con la misma key se ve igual en `/` y en
>   `/turnos`.
> - Fechas de la HU: el 27/10/2026 es **martes** y el 29/10/2026 es **jueves** (verificado con
>   `date-fns` + locale `es`: `EEE dd/MM` → `"jue 29/10"`). Los tests usan el calendario real, no los
>   días de semana de los ejemplos de la HU.

---

## 1. Resumen funcional

Pantalla nueva `/turnos` del panel (ítem «Turnos» en el grupo «Agenda», debajo de «Calendario») que
lista los turnos de un mes (`?mes=yyyy-MM`, el mes en curso por defecto, se puede ir a meses futuros)
en orden de fecha y hora. Muestra cuatro tarjetas (Totales, Pendientes, Completadas, Canceladas, con
«N sin cerrar» debajo de Totales) que siguen al período y a los filtros. Cada fila tiene el estado
derivado (Pendiente, Sin cerrar, Completado, No vino, Canceló, Esperando seña), paciente, servicio,
fecha, hora, precio, lo registrado como pagado en texto neutro y el motivo de consulta. Desde la fila
se abre el detalle del turno (el mismo del calendario, en `MorphDialog`; en modo lectura si está
cancelado o esperando seña), se registra un pago con el saldo precargado y, en las filas «Sin cerrar»,
se marca «Vino» / «No vino» con «Deshacer». Filtros por estado, pago y servicio, más un buscador por
paciente, todos en la URL. Las reservas que se cancelaron solas por no pagar la seña no se cuentan ni
se muestran salvo con el filtro «Cancelados». No hay datos nuevos, migración ni cambios en el bot.

## 2. Workspaces afectados

| Workspace | ¿Cambia? | Qué |
|---|---|---|
| `packages/core` | **Sí** | Módulo nuevo `appointment-list.ts` (estado de la fila, pagos registrados, saldo, tarjetas, filtros, URL, textos) + test. `deposits.ts` suma las constantes de los motivos de cancelación automáticos. Export en `index.ts`. |
| `packages/db` | **Sí (sin schema)** | `domain/payments.ts` usa las constantes nuevas de core en vez de los literales (mismo valor, sin cambio de comportamiento). **Sin migración.** |
| `apps/web` | **Sí** | Ruta nueva `(panel)/turnos/` (page, loading, data, cliente, tabla, lista del celular, filtros, diálogo de detalle); `appointment-detail-sheet.tsx` (cuerpo exportable, estados nuevos, modo lectura); `calendar-client.tsx` (cancelación diferida a un hook compartido); `pagos/manual-payment-form.tsx` (saldo precargado); `actions.ts` y `pagos/actions.ts` (revalidar `/turnos`); `nav-config.ts`; `grouped-list.tsx` (evento en `onClick`). |
| `apps/bot` | **No (código)** | Ningún archivo de `apps/bot` cambia. Pero el bot corre `expireStalePendingPayments`, que pasa a leer los motivos desde core: **typecheck y tests de `apps/bot` son obligatorios.** |

## 3. Decisiones técnicas

| ID | Decisión | Por qué |
|---|---|---|
| T1 | Toda la derivación (estado de la fila, pagos, saldo, tarjetas, filtros, búsqueda, URL) es **pura y vive en `packages/core/src/appointment-list.ts`**. El cliente de `/turnos` la llama en memoria sobre los turnos del mes. | Testeable con vitest sin base. Un mes son decenas de turnos: filtrar en el cliente es instantáneo y no hace ida y vuelta al servidor por cada filtro. |
| T2 | **Estado de la fila** (`AppointmentRowStatus`): `CONFIRMED` con `startsAt > now` → `upcoming` («Pendiente»); `CONFIRMED` con `startsAt <= now` → `unclosed` («Sin cerrar»); `COMPLETED` → `completed`; `NO_SHOW` → `no_show`; `AWAITING_PAYMENT` → `awaiting_deposit`; `CANCELLED` con motivo automático (T3) → `deposit_unpaid`; otro `CANCELLED` → `cancelled`. | `> now` estricto, igual que `countAgendaDay` y que `isPast = start <= now` del detalle: un turno que empieza exactamente ahora ya es «Sin cerrar». |
| T3 | **Seña vencida sin migración:** `isUnpaidDepositCancellation(cancelReason)` = `cancelReason` es exactamente uno de los dos textos que escribe `payments.ts`. Los textos pasan a constantes exportadas por core (`DEPOSIT_AUTO_CANCEL_REASONS`) y `payments.ts` las usa. Un test fija los valores literales. | Es el único dato que distingue esas filas: `bookedAt` es NULL también en todas las filas del seed (verificado), y `cancelledBy` es `PROFESSIONAL` igual que una cancelación del panel. Hoy ningún otro camino escribe esos textos (el panel cancela sin motivo). Constante compartida = el lector y el escritor no se pueden desincronizar; el test con los literales protege las filas ya guardadas (en desarrollo y en producción). Si en el futuro hiciera falta una marca explícita, eso sí sería una migración (ver §12). |
| T4 | **Pagos registrados**: solo pagos `APPROVED` (la consulta filtra `status: "APPROVED"`). Se suman en **centavos enteros** (`Math.round(x * 100)`) para no comparar floats. Precio 0 → `free` («—»). Suma ≥ precio → `paid` («Pagado»). Suma > 0 → `partial` («Seña pagada · $ X», X = la suma). Si no → `none` («Sin pagos registrados»). `balance = max(0, precio − suma)`. | R8 / D6 / D9. Pago de más → «Pagado», saldo 0. |
| T5 | **«Registrar pago» se ofrece** si el turno es `CONFIRMED` o `COMPLETED` y el estado de pago es `partial` o `none` (`canRegisterAppointmentPayment`). | HU §4.6: mismas condiciones que el detalle + no «Pagado» + precio > 0. |
| T6 | **El detalle abierto desde `/turnos` recibe `hasFullPayment = (estado de pago es paid o free)`**, así su botón «Registrar pago» sigue la misma regla que la fila (T5). El calendario sigue como hoy (`hasFullPayment` = hay un pago `FULL` aprobado). | Coherencia dentro de `/turnos` sin tocar el calendario ni `api/appointments` (fuera de alcance). Ver §12 (diferencia conocida entre pantallas). |
| T7 | **Saldo precargado** (D9): `AppointmentOption` suma `balanceAmount?: string`. Si está, el tipo «Pago completo» arranca con ese monto (editable); «Seña» sigue con `depositAmount`. Sin `balanceAmount` (calendario, `/pagos`) todo sigue igual. | Cambio aditivo y opcional en `ManualPaymentForm`. |
| T8 | **Datos del mes**: un loader de la ruta (`turnos/data.ts`, `server-only`) hace una sola consulta Prisma de los turnos con `startsAt ∈ [1° del mes, 1° del siguiente)` en la zona de la profesional, con paciente, servicio, pagos aprobados y consulta, y devuelve DTOs serializables. **No va a `packages/db/domain`**: solo lo usa la web (mismo criterio que `/pagos`). | AGENTS.md: a `domain` va lo que comparten web y bot. |
| T9 | **`now` lo fija el servidor** (`nowISO` en las props). El cliente deriva los estados con ese instante. Después de cada acción `router.refresh()` trae un `now` nuevo. | Sin desajustes de hidratación; un turno no cambia de «Pendiente» a «Sin cerrar» entre el HTML del servidor y la hidratación. |
| T10 | **Filtros en la URL** (`?mes=&estado=&pago=&servicio=&q=`), con valores en castellano (§5.1). `estado`, `pago` y `servicio` se leen de `useSearchParams()` (la URL es la fuente de verdad); el buscador usa estado local (para no mover el cursor) y escribe la URL en el `onChange`. Se escribe con `replaceUrlInRouter` (`lib/patient-tab-route.ts`), sin navegar. Si la URL cambia desde afuera (p. ej. tocar «Turnos» en la sidebar), un efecto resincroniza el buscador. | Sobreviven a recargar y a volver atrás (escenario «Los filtros sobreviven a recargar») sin pedirle nada al servidor. |
| T11 | **Navegación de mes**: la renderiza el cliente con `Link` cuyo `href` conserva los filtros actuales. El mes en curso se escribe sin `mes` (como `/pagos`); otro mes, `?mes=yyyy-MM`. Mes inválido en la URL → el mes en curso. Se puede ir a meses futuros. | Los `href` armados en el servidor quedarían viejos al cambiar filtros con `replaceState`. |
| T12 | **Tarjetas**: se cuentan sobre las filas **ya filtradas** (estado, pago, servicio y buscador). Totales = upcoming + unclosed + completed + no_show; Pendientes = upcoming; Completadas = completed; Canceladas = cancelled (**nunca** `deposit_unpaid`); caption «N sin cerrar» = unclosed, solo si N > 0. | R6, D4. |
| T13 | **Visibilidad**: con el filtro de estado «Todos», las filas `deposit_unpaid` no aparecen. «Cancelados» = `cancelled` + `deposit_unpaid` (estas con la aclaración «Seña sin pagar»). | D4. |
| T14 | **Detalle reusado**: `appointment-detail-sheet.tsx` separa contenedor y contenido. Se exporta `AppointmentDetailBody` (el cuerpo actual, con una rama de **solo lectura** para `CANCELLED` / `AWAITING_PAYMENT`). `AppointmentDetailSheet` (calendario) queda igual por fuera. `/turnos` usa `AppointmentDetailDialog` (nuevo, `MorphDialog` con `origin` = el botón «Abrir» o la fila del celular). | R7 / D8, HU §6. |
| T15 | **Cancelación con «Deshacer» compartida**: `cancelKey` + `deferredDelete(...)` salen de `calendar-client.tsx` a un hook `useScheduleAppointmentCancel` en `(panel)/appointment-cancel.ts`, usado por el calendario y por `/turnos`. En `/turnos`, mientras la cancelación está pendiente, la fila se muestra como «Canceló» (se pisa `status` a `CANCELLED` antes de derivar); el commit refresca (lo hace `runDeferredDelete`). | La lógica de «Deshacer» no se duplica; la key es la misma en las dos pantallas. |
| T16 | **Detalle con datos frescos**: el cliente guarda `selectedId` (no el objeto). El turno mostrado sale de los DTOs actuales; `onUpdated` del cuerpo guarda un *override* optimista que se descarta cuando cambian los DTOs (llegó el `router.refresh()`). `onChanged` = `router.refresh()`. | Escenario «Cambios hechos en el detalle se ven en la lista» y el panel no queda con datos viejos. |
| T17 | **«Vino» / «No vino» desde la fila** (D7): `setStatusAction(id, "COMPLETED" \| "NO_SHOW")`, sin estado optimista (si falla, la fila no cambia y sale `notify.error`). Éxito → `router.refresh()`, foco al «Abrir» de la fila y `notify.undo(...)`; «Deshacer» → `setStatusAction(id, "CONFIRMED")`. La consulta la crea / borra el dominio como hoy. | Reusa la action y el dominio existentes. |
| T18 | **Revalidación**: `setStatusAction`, `cancelAppointmentAction`, `saveAppointmentReasonAction`, `createAppointmentAction` y `registerManualPaymentAction` suman `revalidatePath("/turnos")`. | HU §6. |
| T19 | **Escritorio / celular** con `useMediaQuery("(min-width: 640px)", true)` (`lib/use-media-query.ts`): ≥ 640 px tabla, < 640 px `GroupedList`. El SSR arranca en tabla (`serverDefault: true`). | HU §4.4/§4.5 (corte en 640 px, no en el `md` de la ficha). |
| T20 | **Fecha y hora de la fila**: `formatInTimeZone(startsAt, tz, "EEE dd/MM", { locale: es })` → «jue 29/10»; hora `formatTime` («10:00», 24 h con cero). Sin año: el período ya lo muestra. | HU §4.4. |
| T21 | **Búsqueda**: se reusa `matchesPatientQuery` (`patient-directory.ts`) con `searchName = normalize(name ?? "")` y `phoneDigits` solo si el JID es `phone` (mismo criterio que la lista de pacientes). | Mismo comportamiento que el buscador de Pacientes (tildes, dígitos, `0` inicial). |

## 4. Esquema

**Sin cambios.** No se toca `schema.prisma` ni se crea migración. Los datos que se leen ya existen
(HU §3): `Appointment.{status, startsAt, endsAt, priceSnapshot, reason, cancelledBy, cancelReason,
googleEventId}`, `Payment.{status, amount}`, `Patient.{name, phone, whatsappJid, archivedAt}`,
`Service.{name, requiresDeposit, depositKind, depositValue}`, `Consultation` (para `hasContent`).
Índices ya existentes que usa la consulta: `Appointment @@index([startsAt])`, `Payment
@@index([appointmentId])`.

## 5. Contrato compartido

### 5.1 `packages/core/src/appointment-list.ts` (nuevo; consumidor: **web**)

```ts
import type { AppointmentStatusLike } from "./patient-summary";

export type AppointmentRowStatus =
  | "upcoming"          // CONFIRMED, startsAt > now
  | "unclosed"          // CONFIRMED, startsAt <= now
  | "completed"         // COMPLETED
  | "no_show"           // NO_SHOW
  | "cancelled"         // CANCELLED de verdad
  | "deposit_unpaid"    // CANCELLED solo por no pagar la seña / falla del checkout (T3)
  | "awaiting_deposit"; // AWAITING_PAYMENT

/** T3. true si cancelReason es exactamente uno de DEPOSIT_AUTO_CANCEL_REASONS. null/otro → false. */
export function isUnpaidDepositCancellation(cancelReason: string | null | undefined): boolean;

/** T2. */
export function appointmentRowStatus(
  a: { status: AppointmentStatusLike; startsAt: Date; cancelReason: string | null },
  now: Date,
): AppointmentRowStatus;

export type AppointmentPaymentState = "free" | "paid" | "partial" | "none";

export interface AppointmentPaymentSummary {
  state: AppointmentPaymentState;
  /** Suma de los pagos aprobados (pesos, 2 decimales). */
  paidTotal: number;
  /** max(0, price − paidTotal). 0 si free o paid. */
  balance: number;
}

/** T4. `approvedAmounts`: montos de los pagos APPROVED del turno (quien llama ya filtró el estado).
 *  Cuentas en centavos enteros. */
export function summarizeAppointmentPayments(
  price: number,
  approvedAmounts: readonly number[],
): AppointmentPaymentSummary;

/** "Pagado" · "Seña pagada · $ 5.000" (formatPrice(paidTotal, currency)) · "Sin pagos registrados" · "—" (free). */
export function appointmentPaymentText(s: AppointmentPaymentSummary, currency: string): string;

/** T5. (CONFIRMED | COMPLETED) && state ∈ {partial, none}. */
export function canRegisterAppointmentPayment(
  status: AppointmentStatusLike,
  s: AppointmentPaymentSummary,
): boolean;

/** Lo que el cliente arma desde el DTO del loader (startsAt ya como Date). */
export interface AppointmentListInput {
  id: string;
  startsAt: Date;
  status: AppointmentStatusLike;
  cancelReason: string | null;
  price: number;
  approvedAmounts: readonly number[];
  reason: string | null;
  serviceId: string;
  serviceName: string;
  patient: { id: string; name: string | null; phone: string; whatsappJid: string; archived: boolean };
}

export interface AppointmentListRow {
  id: string;
  startsAt: Date;
  rowStatus: AppointmentRowStatus;
  /** APPOINTMENT_LIST_TEXT.status[rowStatus]. */
  statusLabel: string;
  /** "Seña sin pagar" solo para deposit_unpaid; si no, null. */
  statusNote: string | null;
  patientId: string;
  /** patientDisplayName(patient). */
  patientLabel: string;
  /** firstName(patient.name) ?? patientLabel (para el toast de "Vino"). */
  patientShortName: string;
  patientArchived: boolean;
  /** Para matchesPatientQuery (T21). */
  searchName: string;
  phoneDigits: string | null;
  serviceId: string;
  serviceName: string;
  /** "jue 29/10" (T20). */
  dateLabel: string;
  /** "10:00". */
  timeLabel: string;
  /** formatPrice(price, currency) o "Sin cargo" si price es 0. */
  priceLabel: string;
  payment: AppointmentPaymentSummary;
  /** appointmentPaymentText(payment, currency). */
  paymentText: string;
  canRegisterPayment: boolean;
  /** rowStatus === "unclosed": la fila ofrece "Vino" / "No vino". */
  canClose: boolean;
  reason: string | null;
}

/** Arma y ordena (startsAt asc, empate por id) TODAS las filas del mes, incluidas deposit_unpaid. */
export function buildAppointmentListRows(
  input: readonly AppointmentListInput[],
  now: Date,
  tz: string,
  currency: string,
): AppointmentListRow[];

export type AppointmentStatusFilter =
  | "all" | "upcoming" | "unclosed" | "completed" | "no_show" | "cancelled" | "awaiting_deposit";
export type AppointmentPaymentFilter = "all" | "paid" | "partial" | "none";

export interface AppointmentListFilters {
  status: AppointmentStatusFilter;
  payment: AppointmentPaymentFilter;
  /** null = todos los servicios. */
  serviceId: string | null;
  /** Texto del buscador, sin recortar. */
  query: string;
}

export const DEFAULT_APPOINTMENT_LIST_FILTERS: AppointmentListFilters; // all, all, null, ""

/** Valores de la URL ↔ filtros. Desconocido o ausente → "all" / null / "".
 *  estado: pendientes | sin-cerrar | completados | no-vino | cancelados | esperando-sena
 *  pago:   pagados | con-sena | sin-pagos
 *  servicio: id del servicio (string no vacío) · q: texto libre */
export function parseAppointmentListFilters(params: {
  estado?: string | null;
  pago?: string | null;
  servicio?: string | null;
  q?: string | null;
}): AppointmentListFilters;

/** Query string de /turnos SIN "?" y sin vacíos, en este orden: mes, estado, pago, servicio, q.
 *  `month` null = mes en curso (no se escribe). Ej.: "mes=2026-11&estado=sin-cerrar". "" si no hay nada. */
export function appointmentListQuery(month: string | null, f: AppointmentListFilters): string;

/** Cantidad de filtros del botón "Filtros": status ≠ all, payment ≠ all, serviceId ≠ null (el buscador no cuenta). */
export function activeAppointmentFilterCount(f: AppointmentListFilters): number;

/** T13 + pago + servicio + matchesPatientQuery. Con status "all", deposit_unpaid no pasa.
 *  "cancelled" deja pasar cancelled y deposit_unpaid. El filtro de pago nunca deja pasar "free". */
export function matchesAppointmentFilters(row: AppointmentListRow, f: AppointmentListFilters): boolean;

export interface AppointmentListCards {
  total: number;
  pending: number;
  completed: number;
  cancelled: number;
  unclosed: number;
}

/** T12, sobre las filas ya filtradas. */
export function countAppointmentCards(rows: readonly Pick<AppointmentListRow, "rowStatus">[]): AppointmentListCards;

export const APPOINTMENT_LIST_TEXT = {
  title: "Turnos",
  description: "Todos tus turnos del mes, con lo que tienen registrado como pagado.",
  newAppointment: "Nuevo turno",
  filters: "Filtros",
  /** aria-label del botón: "Filtros, 1 activo" / "Filtros, 2 activos". El badge visible muestra el número. */
  filtersLabel: (n: number) => (n === 0 ? "Filtros" : n === 1 ? "Filtros, 1 activo" : `Filtros, ${n} activos`),
  clearFilters: "Limpiar filtros",
  status: {
    upcoming: "Pendiente",
    unclosed: "Sin cerrar",
    completed: "Completado",
    no_show: "No vino",
    cancelled: "Canceló",
    deposit_unpaid: "Canceló",
    awaiting_deposit: "Esperando seña",
  },
  depositUnpaidNote: "Seña sin pagar",
  cards: {
    total: "Totales",
    pending: "Pendientes",
    completed: "Completadas",
    cancelled: "Canceladas",
    unclosed: (n: number) => `${n} sin cerrar`,
  },
  payment: {
    paid: "Pagado",
    partial: (amount: string) => `Seña pagada · ${amount}`,
    none: "Sin pagos registrados",
    free: "—",
  },
  free: "Sin cargo",
  archived: "Archivada",
  noReason: "—",
  columns: {
    status: "Estado", patient: "Paciente", service: "Servicio", date: "Fecha", time: "Hora",
    price: "Precio", payment: "Pago", reason: "Motivo", actions: "Acciones",
  },
  filterGroups: { status: "Estado", payment: "Pago", service: "Servicio", allServices: "Todos los servicios" },
  statusFilter: {
    all: "Todos", upcoming: "Pendientes", unclosed: "Sin cerrar", completed: "Completados",
    no_show: "No vino", cancelled: "Cancelados", awaiting_deposit: "Esperando seña",
  },
  paymentFilter: { all: "Todos", paid: "Pagados", partial: "Con seña", none: "Sin pagos registrados" },
  searchLabel: "Buscar turnos por paciente, nombre o teléfono",
  searchPlaceholder: "Buscá por paciente o teléfono",
  /** "No hay turnos en diciembre" (month = monthName). */
  emptyMonth: (month: string) => `No hay turnos en ${month}`,
  noMatches: "Ningún turno coincide con los filtros",
  seeAll: "Ver todos",
  /** "12 turnos" / "1 turno". */
  count: (n: number) => (n === 1 ? "1 turno" : `${n} turnos`),
  /** Caption de la tabla (sr-only): "Turnos de Octubre 2026" (monthTitle). */
  tableCaption: (monthTitle: string) => `Turnos de ${monthTitle}`,
  actions: {
    attended: "Vino",
    noShow: "No vino",
    registerPayment: "Registrar pago",
    open: "Abrir",
    /** aria-label: "Abrir el turno de Carla López, mar 20/10 10:00". */
    openLabel: (patient: string, date: string, time: string) => `Abrir el turno de ${patient}, ${date} ${time}`,
    attendedLabel: (patient: string) => `Marcar que ${patient} vino`,
    noShowLabel: (patient: string) => `Marcar que ${patient} no vino`,
    registerPaymentLabel: (patient: string) => `Registrar pago del turno de ${patient}`,
  },
  toast: {
    /** "Turno de Carla marcado como completado". */
    completed: (name: string) => `Turno de ${name} marcado como completado`,
    error: "No se pudo actualizar el turno.",
  },
  readOnly: {
    payments: "Pagos",
    cancelledBy: "Canceló",
    byPatient: "La paciente",
    byProfessional: "Vos",
    byDepositExpiry: "Se canceló sola: no se pagó la seña",
    cancelReason: "Motivo de cancelación",
    noCancelReason: "Sin motivo",
  },
  monthNav: {
    label: "Mes",
    prev: (title: string) => `Mes anterior: ${title}`,
    next: (title: string) => `Mes siguiente: ${title}`,
  },
} as const;
```

Reglas de implementación:
- `appointmentPaymentText` usa `formatPrice` (con su espacio duro): los tests comparan contra
  `formatPrice(5000, "ARS")`, no contra un literal tipeado.
- El `toast.completed` usa `row.patientShortName` (primer nombre; sin nombre → `patientDisplayName`).
- Para «No vino» desde la fila se reusa `AGENDA_TEXT.sheet.toastNoShow` («Marcado: no vino») y para
  el «Deshacer» exitoso `AGENDA_TEXT.sheet.toastBackToConfirmed` («Volvió a confirmado»), como pide la
  HU §4.9. No se duplican en `APPOINTMENT_LIST_TEXT`.

### 5.2 `packages/core/src/deposits.ts` (modificado; consumidores: **db (bot) y web**)

```ts
/** HU-021 (T3). Motivos con que payments.ts cancela sola una reserva con seña. NO cambiar los textos:
 *  hay filas guardadas con estos valores y appointment-list.ts los usa para reconocerlas. */
export const DEPOSIT_AUTO_CANCEL_REASONS = {
  expired: "Venció el tiempo para pagar la seña",
  checkoutFailed: "No se pudo generar el checkout de la seña",
} as const;
```

`index.ts` suma `export * from "./appointment-list";` (`deposits` ya se exporta).

### 5.3 `packages/db/domain/payments.ts` (modificado; consumidores: bot y web — sin cambio de firma)

- Línea 73 (`createDepositCheckout`, `catch`): `cancelReason: DEPOSIT_AUTO_CANCEL_REASONS.checkoutFailed`.
- Línea 211 (`expireStalePendingPayments`): `cancelReason: DEPOSIT_AUTO_CANCEL_REASONS.expired`.
- Import desde `@nutri-bot/core` (el archivo ya importa de ahí). Nada más cambia: mismos valores en la base.

### 5.4 `apps/web` — tipos compartidos entre calendario y `/turnos`

**`appointment-detail-sheet.tsx`**

```ts
export interface SelectedAppointment {
  // …campos actuales sin cambios, salvo `status`:
  /** HU-021: también CANCELLED y AWAITING_PAYMENT (solo los abre /turnos, en modo lectura). */
  status: AppointmentStatusLike;
  /** HU-021 (opcionales; solo /turnos los manda): */
  cancelledBy?: "PATIENT" | "PROFESSIONAL" | null;
  cancelReason?: string | null;
  /** appointmentPaymentText: se muestra como fila "Pagos" del detalle. */
  paymentText?: string;
  /** D9: saldo (string numérico) para precargar "Registrar pago". */
  balance?: string;
  /** Seña configurada del servicio, para el tipo "Seña" del pago. */
  depositAmount?: string;
}

/** Cuerpo del detalle, sin contenedor. Lo usan AppointmentDetailSheet (calendario) y
 *  AppointmentDetailDialog (/turnos). CANCELLED / AWAITING_PAYMENT → modo lectura (§7.6). */
export function AppointmentDetailBody(props: {
  appt: SelectedAppointment;
  tz: string;
  currency: string;
  onClose: () => void;
  onChanged: () => void;
  onUpdated: (next: SelectedAppointment) => void;
  onCancel: (appt: SelectedAppointment) => void;
}): JSX.Element;
```

- `statusBadge` suma `CANCELLED: { tone: "neutral", icon: CircleSlash }` y
  `AWAITING_PAYMENT: { tone: "warning", icon: Clock }`. El texto del badge: los tres estados actuales
  siguen con `APPOINTMENT_STATUS_TEXT`; `CANCELLED` → `APPOINTMENT_LIST_TEXT.status.cancelled`
  («Canceló») y `AWAITING_PAYMENT` → `APPOINTMENT_LIST_TEXT.status.awaiting_deposit` («Esperando seña»).
- `AppointmentDetailBody` elige entre `ActiveAppointmentBody` (el `AppointmentBody` actual, renombrado)
  y `ReadOnlyAppointmentBody` (nuevo) **antes** de cualquier hook (para no romper el orden de hooks).
- En `ActiveAppointmentBody`: si `appt.paymentText` está, se agrega al `<dl>` una fila «Pagos» debajo de
  «Precio». El `AppointmentPaymentModal` recibe `balanceAmount: appt.balance` y
  `depositAmount: appt.depositAmount` (ambos `undefined` desde el calendario → igual que hoy).
- `AppointmentDetailSheet` mantiene **su firma y su comportamiento** (Sheet no modal) y renderiza
  `AppointmentDetailBody`.

**`pagos/manual-payment-form.tsx`**

```ts
export interface AppointmentOption {
  // …campos actuales…
  /** HU-021 (D9, opcional): saldo; si está, "Pago completo" arranca con este monto (editable). */
  balanceAmount?: string;
}
// defaultAmount(option, kind): kind === "FULL" && option?.balanceAmount → amountFromPrice(option.balanceAmount);
// kind === "DEPOSIT" && option?.depositAmount → igual que hoy; si no → amountFromPrice(option?.priceSnapshot).
```

**`(panel)/appointment-cancel.ts`** (nuevo, `"use client"`)

```ts
/** Key del "Deshacer" de la cancelación de un turno (la misma que usaba calendar-client). */
export function appointmentCancelKey(appointmentId: string): string; // `appointment-cancel:${id}`

/** Agenda la cancelación con "Deshacer" de 8 s: deferredDelete con AGENDA_TEXT.cancel.*,
 *  commit = cancelAppointmentAction(appt.id), guardUnload: true. */
export function useScheduleAppointmentCancel(options?: {
  onCommitted?: () => void;
}): (appt: Pick<SelectedAppointment, "id" | "patientName">) => void;
```

`calendar-client.tsx` pasa a usarlo (`onCommitted: refetch`) y sigue moviendo `lastEventElRef` al título
antes de agendar; reemplaza su `cancelKey` local por `appointmentCancelKey`.

**`components/grouped-list.tsx`**: `onClick?: (event: React.MouseEvent<HTMLButtonElement>) => void`.
Compatible con los llamadores actuales (`() => void` sigue tipando).

## 6. Rutas, server actions y lecturas del panel

### 6.1 Ruta nueva `apps/web/src/app/(panel)/turnos/`

| Archivo | Tipo | Qué hace |
|---|---|---|
| `page.tsx` | Server, `dynamic = "force-dynamic"` | `getProfessional()`, `searchParams` (`mes`); `resolveMonth` (válido → ese mes, también futuro; inválido o ausente → mes en curso). Llama `loadTurnosMonth(month, tz)` y `listServices({ activeOnly: true })` (para «Nuevo turno») y `listServices()` (para el filtro de servicio). Renderiza `TurnosClient`. |
| `loading.tsx` | Server | Esqueleto: encabezado + botones, `‹ mes ›`, 4 tarjetas (grilla 2×2 en celular, 4 columnas desde `sm`), buscador, 6 filas. Mismo estilo que `pagos/loading.tsx`. |
| `data.ts` | `import "server-only"` | `loadTurnosMonth` (§6.2). |
| `turnos-client.tsx` | Client | Estado de la pantalla (§7.1). |
| `appointments-table.tsx` | Client | Tabla de escritorio con acciones por fila (§7.3). |
| `appointments-mobile-list.tsx` | Client | `GroupedList` del celular (§7.4). |
| `turnos-filters.tsx` | Client | Botón «Filtros» + popover / sheet inferior (§7.5). |
| `appointment-detail-dialog.tsx` | Client | `MorphDialog` + `AppointmentDetailBody` (§7.6). |

### 6.2 `turnos/data.ts`

```ts
export interface TurnosAppointment {
  id: string;
  startsAt: string;           // ISO
  endsAt: string;             // ISO
  status: AppointmentStatusLike;
  cancelledBy: "PATIENT" | "PROFESSIONAL" | null;
  cancelReason: string | null;
  reason: string | null;
  price: number;              // Number(priceSnapshot)
  priceSnapshot: string;      // priceSnapshot.toString() (para el detalle y el pago)
  approvedAmounts: number[];  // Number(amount) de los pagos APPROVED
  depositAmount: string | null; // computeDepositAmount del servicio (como /pagos); null si no tiene seña o da 0
  googleSynced: boolean;      // Boolean(googleEventId)
  service: { id: string; name: string };
  patient: { id: string; name: string | null; phone: string; whatsappJid: string; archived: boolean };
  consultation: { id: string; hasContent: boolean } | null; // isConsultationEmpty, igual que api/appointments
}

/** Turnos con startsAt ∈ monthRangeInTz(month, tz) = [from, to), TODOS los estados. */
export async function loadTurnosMonth(month: string, tz: string): Promise<TurnosAppointment[]>;
```

Consulta (una sola):

```ts
prisma.appointment.findMany({
  where: { startsAt: { gte: from, lt: to } },
  select: {
    id: true, startsAt: true, endsAt: true, status: true, cancelledBy: true, cancelReason: true,
    reason: true, priceSnapshot: true, googleEventId: true,
    patient: { select: { id: true, name: true, phone: true, whatsappJid: true, archivedAt: true } },
    service: { select: { id: true, name: true, requiresDeposit: true, depositKind: true, depositValue: true } },
    payments: { where: { status: "APPROVED" }, select: { amount: true } },
    consultation: {
      select: { id: true, notes: true, planId: true, prescription: { select: { id: true } },
                _count: { select: { evolutionEntries: true } } },
    },
  },
  orderBy: [{ startsAt: "asc" }, { id: "asc" }],
});
```

Pacientes archivadas (HU-019): no se filtran; `archived = archivedAt !== null`.

### 6.3 Server actions modificadas (sin cambio de firma)

| Action | Archivo | Cambio |
|---|---|---|
| `setStatusAction` | `(panel)/actions.ts` | + `revalidatePath("/turnos")` después de `revalidatePath("/")`. |
| `cancelAppointmentAction` | `(panel)/actions.ts` | + `revalidatePath("/turnos")`. |
| `saveAppointmentReasonAction` | `(panel)/actions.ts` | + `revalidatePath("/turnos")`. |
| `createAppointmentAction` | `(panel)/actions.ts` | + `revalidatePath("/turnos")`. |
| `registerManualPaymentAction` | `(panel)/pagos/actions.ts` | + `revalidatePath("/turnos")`. |

No hay actions nuevas. No cambia `api/appointments/route.ts`.

### 6.4 Navegación

`components/shell/nav-config.ts`, grupo «Agenda»: `{ href: "/", … Calendario }`, **`{ href: "/turnos",
label: "Turnos", icon: ListChecks }`**, Disponibilidad, Servicios. `isActive` ya funciona
(`pathname.startsWith("/turnos")`). `ListChecks` no se usa en la sidebar (sí en Recetas, fuera del shell).

## 7. Pantallas (skill `ui.txt`)

### 7.1 Vista «Turnos» (`turnos-client.tsx`)

**Props:** `{ appointments: TurnosAppointment[]; month: string; currentMonth: string; nowISO: string;
tz: string; currency: string; todayKey: string; services: ServiceOption[] /* activos, Nuevo turno */;
filterServices: { id: string; name: string }[] }`.

**Estructura base** (dentro del layout del panel, sidebar sin cambios):
1. `PageHeader` `title="Turnos"`, `description` (§5.1), `action` = botón «Filtros» (`TurnosFilters`) +
   `Button` «Nuevo turno» (ícono `Plus`, principal).
2. `<nav aria-label="Mes">` igual a `/pagos` (`navButton`, `ChevronLeft` / `ChevronRight`, `h2
   aria-live="polite"` con `monthTitle(month)`), **sin** deshabilitar el mes siguiente.
3. Tarjetas: contenedor `grid grid-cols-2 gap-4 rounded-xl bg-card p-5 shadow-card sm:grid-cols-4` con
   cuatro `Metric` (`decimals={0}`); «Totales» lleva `caption={cards.unclosed > 0 ? unclosed(n) : undefined}`.
   No son botones.
4. Fila de búsqueda: input `type="search"` (mismo estilo que `payments-table.tsx`, `id="turnos-buscar"`,
   label sr-only `searchLabel`) + contador `count(filtered.length)` a la derecha (`aria-live="polite"`).
5. Lista: `AppointmentsTable` (≥ 640 px) o `AppointmentsMobileList` (< 640 px), T19.
6. Estados vacíos (dentro de una tarjeta `rounded-xl bg-card shadow-card`):
   - Sin filas visibles **y** sin filtros/buscador → `EmptyState icon={CalendarX}
     title={emptyMonth(monthName(month))} action={«Nuevo turno»}`.
   - Con filtros o buscador y 0 filas → `EmptyState icon={SearchX} title={noMatches}
     action={<Button variant="tinted" size="lg">Ver todos</Button>}` que limpia filtros y buscador.
7. `NewAppointmentModal` (mismo componente del calendario; `onCreated={() => router.refresh()}`).
8. `AppointmentPaymentModal` único para «Registrar pago» desde la fila (`payingId`).
9. `AppointmentDetailDialog` único (`selectedId`, `origin`).

**Pipeline de datos (en el cliente, `useMemo`):**
1. `pending = usePendingDeletions()`; para cada DTO, si `pending.has(appointmentCancelKey(id))` →
   `status: "CANCELLED"`, `cancelReason: null` (T15).
2. DTO → `AppointmentListInput` (`startsAt: new Date(iso)`) → `buildAppointmentListRows(inputs, new
   Date(nowISO), tz, currency)`.
3. `filters` = `parseAppointmentListFilters({ estado, pago, servicio })` de `useSearchParams()` +
   `query` local (T10).
4. `filtered = rows.filter((r) => matchesAppointmentFilters(r, filters))`; `cards =
   countAppointmentCards(filtered)`.

**Acciones de la fila** (`closeAppointment(row, status)`, T17):

```ts
setBusyId(row.id);
const res = await setStatusAction(row.id, status);
setBusyId(null);
if (!res.ok) return notify.error(res.error ?? T.toast.error);
router.refresh();
requestAnimationFrame(() => document.getElementById(openButtonId(row.id))?.focus());
notify.undo(
  status === "COMPLETED" ? T.toast.completed(row.patientShortName) : AGENDA_TEXT.sheet.toastNoShow,
  async () => {
    const back = await setStatusAction(row.id, "CONFIRMED");
    if (back.ok) { notify.saved(AGENDA_TEXT.sheet.toastBackToConfirmed); router.refresh(); }
    else notify.error(back.error ?? T.toast.error);
  },
);
```

`openButtonId(id) = \`turno-abrir-${id}\``. Mientras `busyId === row.id`, los botones de esa fila
quedan deshabilitados («Vino» / «No vino» con `loading`).

**Detalle**: `openDetail(id, origin: HTMLElement)` guarda `selectedId` y `origin`. El
`SelectedAppointment` se arma con el DTO + la fila (`toSelectedAppointment`, §7.6); override optimista
de T16. `onCancel` = `useScheduleAppointmentCancel()` (sin `onCommitted`: el refresh ya lo hace
`runDeferredDelete`).

### 7.2 Tarjetas

| Tarjeta | Valor | Caption |
|---|---|---|
| Totales | `cards.total` | `«N sin cerrar»` si `cards.unclosed > 0` |
| Pendientes | `cards.pending` | — |
| Completadas | `cards.completed` | — |
| Canceladas | `cards.cancelled` | — |

### 7.3 Tabla de escritorio (`appointments-table.tsx`)

- Contenedor `overflow-hidden rounded-xl bg-card shadow-card more-contrast:border more-contrast:border-input`,
  `Table` de `components/primitives/table` con `<caption className="sr-only">{tableCaption(monthTitle)}</caption>`.
- Columnas en este orden: Estado · Paciente · Servicio · Fecha · Hora · Precio (`numeric`) · Pago ·
  Motivo · Acciones (header sr-only).
- **Estado**: `Badge` con ícono + `statusLabel` (el color nunca es el único indicador):

  | rowStatus | tone | ícono (lucide) |
  |---|---|---|
  | upcoming | `info` | `CalendarCheck` |
  | unclosed | `warning` | `CalendarClock` |
  | completed | `success` | `CircleCheck` |
  | no_show | `danger` | `UserX` |
  | cancelled / deposit_unpaid | `neutral` | `CircleSlash` |
  | awaiting_deposit | `warning` | `Clock` |

  `deposit_unpaid`: debajo del badge, `text-footnote text-muted-foreground` con `statusNote` («Seña sin pagar»).
- **Paciente**: `patientLabel`; si `patientArchived`, `Badge tone="neutral"` «Archivada» al lado.
- **Fecha** / **Hora**: `dateLabel` / `timeLabel`, `tabular-nums`.
- **Precio**: `priceLabel` (`tabular-nums`; «Sin cargo» en `text-muted-foreground`).
- **Pago**: `paymentText` en `text-foreground` / `text-muted-foreground` (`none` y `free` en gris).
  **Sin** tonos `warning`/`danger` (R8).
- **Motivo**: `AppointmentReasonCell` (`pacientes/[id]/appointment-reason-cell.tsx`, ya muestra «—» si
  es null). Import directo de ese archivo (sin moverlo).
- **Acciones** (`flex justify-end gap-1`, botones `size="sm"`): si `canClose` → «Vino» (`variant="secondary"`,
  ícono `Check`) y «No vino» (`variant="secondary"`, `UserX`); si `canRegisterPayment` → «Registrar pago»
  (`variant="plain"`, `Banknote`); siempre «Abrir» (`variant="plain"`, `id={openButtonId(id)}`, ícono
  `ArrowUpRight`, `aria-label={openLabel(...)}`) → `openDetail(id, event.currentTarget)`. Cada botón con
  su `aria-label` de §5.1.
- La fila entera **no** es clickeable. Orden de tabulación = orden visual.

### 7.4 Lista del celular (`appointments-mobile-list.tsx`)

- `GroupedList` con un `GroupedListRow size="lg"` por fila, `onClick={(e) => openDetail(id, e.currentTarget)}`.
- `label`: `patientLabel` + `<span className="font-normal text-muted-foreground"> · {serviceName}</span>` (truncado).
- `description`: ícono + `statusLabel` (mismo mapa de §7.3, como texto con color, no badge) · `"{dateLabel}, {timeLabel}"`;
  `deposit_unpaid` agrega `· Seña sin pagar`.
- `accessory`: columna alineada a la derecha con `priceLabel` (`text-headline tabular-nums`) y debajo
  `paymentText` (`text-footnote text-muted-foreground`).
- Sin botones en la fila ni motivo (HU §4.5).

### 7.5 Filtros (`turnos-filters.tsx`)

- Botón `Button variant="secondary"` con ícono `SlidersHorizontal`, texto «Filtros» y, si `n > 0`, un
  número en una pastilla (`aria-hidden`); `aria-label={filtersLabel(n)}`.
- ≥ 640 px: `Popover` (`components/primitives/popover`) alineado a la derecha. < 640 px: `Sheet
  side="bottom"` con título «Filtros».
- Contenido: tres grupos con título (`filterGroups.*`):
  - **Estado**: `RadioGroup` con las 7 opciones de `statusFilter`.
  - **Pago**: `RadioGroup` con las 4 opciones de `paymentFilter`.
  - **Servicio**: `Select` («Todos los servicios» + `filterServices`), **solo si `filterServices.length > 1`**.
  - Pie: `Button variant="plain"` «Limpiar filtros» (deja estado/pago/servicio en default; no toca el buscador).
- Cada cambio escribe la URL al instante con `replaceUrlInRouter(\`/turnos${q ? "?" + q : ""}\`)`,
  `q = appointmentListQuery(month === currentMonth ? null : month, nuevosFiltros)`. Sin botón «Aplicar».

### 7.6 Detalle del turno (`appointment-detail-dialog.tsx`)

```tsx
<MorphDialog open={appt !== null} onOpenChange={(o) => { if (!o) onClose(); }} origin={origin}>
  <MorphDialogContent
    className="w-[min(100%,28rem)]"
    onOpenAutoFocus={/* mismo handler del Sheet: foco al [data-appointment-title] */}
  >
    {shown ? <AppointmentDetailBody key={shown.id} appt={shown} … /> : null}
  </MorphDialogContent>
</MorphDialog>
```

- Conserva el último turno mostrado durante la animación de salida (mismo patrón `shown` del Sheet).
- El foco al cerrar vuelve al «Abrir» (o a la fila del celular) que lo abrió: lo hace `MorphDialog`.
- `toSelectedAppointment(dto, row)`: los campos actuales desde el DTO (`start = startsAt`, `end = endsAt`,
  `price = priceSnapshot`, `patientLabel = row.patientLabel`, `patientJid`, `consultation`, …) +
  `hasFullPayment = row.payment.state === "paid" || row.payment.state === "free"` (T6),
  `cancelledBy`, `cancelReason`, `paymentText = row.paymentText`, `balance = String(row.payment.balance)`,
  `depositAmount = dto.depositAmount ?? undefined`.

**Modo lectura** (`ReadOnlyAppointmentBody`, `CANCELLED` / `AWAITING_PAYMENT`):
- Encabezado igual (`SheetTitle data-appointment-title` = `patientLabel`; descripción = servicio · fecha).
- Badge de estado (§5.4).
- `ButtonLink` «Ver ficha» (`AGENDA_TEXT.sheet.seeProfile`) → `/pacientes/<id>`.
- `<dl>`: Precio · Pagos (`paymentText`, o «—» si no vino) · Motivo de consulta (`reason ?? noReason`, solo
  texto) · y si es `CANCELLED`: «Canceló» = `byDepositExpiry` si `isUnpaidDepositCancellation(cancelReason)`,
  si no `byPatient` / `byProfessional` según `cancelledBy`; «Motivo de cancelación» = `cancelReason ??
  noCancelReason`.
- **Sin** botones de estado, recordatorio, editar motivo, cancelar ni «Registrar pago».

### 7.7 «Registrar pago» desde la fila

`AppointmentPaymentModal` (sin cambios de firma) con
`appointment = { id, label: \`${patientLabel} · ${serviceName} · ${appointmentDayTime(startsAt, now, tz)}\`,
priceSnapshot, patientLabel, depositAmount, balanceAmount: String(row.payment.balance) }`.
`onDone` → cerrar + `router.refresh()`. El toast es el que ya da `ManualPaymentForm`.

### 7.8 Bot de WhatsApp y portal

**No intervienen.** Ningún texto de WhatsApp cambia. Las acciones reusadas mantienen sus efectos
(cancelar desde el detalle sigue encolando el aviso a la paciente al vencer el «Deshacer»).

## 8. Archivos

**Crear**
- `packages/core/src/appointment-list.ts` + `appointment-list.test.ts`
- `apps/web/src/app/(panel)/appointment-cancel.ts`
- `apps/web/src/app/(panel)/turnos/page.tsx`, `loading.tsx`, `data.ts`, `data.test.ts`,
  `turnos-client.tsx`, `appointments-table.tsx`, `appointments-mobile-list.tsx`, `turnos-filters.tsx`,
  `appointment-detail-dialog.tsx`

**Modificar**
- `packages/core/src/deposits.ts`, `deposits.test.ts`, `index.ts`
- `packages/db/domain/payments.ts`
- `apps/web/src/app/(panel)/appointment-detail-sheet.tsx`
- `apps/web/src/app/(panel)/calendar-client.tsx`
- `apps/web/src/app/(panel)/pagos/manual-payment-form.tsx`
- `apps/web/src/app/(panel)/actions.ts`, `actions.test.ts`
- `apps/web/src/app/(panel)/pagos/actions.ts`, `pagos/actions.test.ts`
- `apps/web/src/components/grouped-list.tsx`
- `apps/web/src/components/shell/nav-config.ts`

**No tocar:** `packages/db/prisma/**` (schema y migraciones), `packages/db/domain/appointments.ts`,
`apps/bot/**`, `apps/web/src/app/api/appointments/route.ts`, `pagos/page.tsx`, `payments-table.tsx`,
`appointment-payment-modal.tsx` (salvo que el tipado lo pida), `backlog/**`.

## 9. Checklist atómico (una tarea = un commit)

Antes de empezar: estar en `feat/HU-021-lista-turnos` con el working tree limpio de cambios ajenos
(`git add` solo los archivos de la tarea). Test-first donde hay lógica determinística (A1, A2, C2):
escribir el test, verlo fallar (RED), implementar (GREEN). Heurística de ~400 líneas por tarea: es
orientativa, no un tope.

### A. `packages/core`
- [ ] **A1 — Estado de la fila y pagos registrados.** `DEPOSIT_AUTO_CANCEL_REASONS` en `deposits.ts` (+
  caso en `deposits.test.ts` con los literales). En `appointment-list.ts`: `isUnpaidDepositCancellation`,
  `appointmentRowStatus`, `summarizeAppointmentPayments`, `appointmentPaymentText`,
  `canRegisterAppointmentPayment` y `APPOINTMENT_LIST_TEXT`; export en `index.ts`. Tests de §11 (bloques
  1–4). Verificación: `npx vitest run packages/core/src/appointment-list.test.ts packages/core/src/deposits.test.ts` + `npm run typecheck`.
- [ ] **A2 — Filas, filtros, URL y tarjetas.** `buildAppointmentListRows`, filtros
  (`parseAppointmentListFilters`, `appointmentListQuery`, `activeAppointmentFilterCount`,
  `matchesAppointmentFilters`, `DEFAULT_APPOINTMENT_LIST_FILTERS`) y `countAppointmentCards`. Tests de §11
  (bloques 5–8). Misma verificación que A1.

### B. `packages/db`
- [ ] **B1 — Motivos automáticos desde core.** `payments.ts` usa `DEPOSIT_AUTO_CANCEL_REASONS` (§5.3).
  Verificación: `npm run typecheck` + `npx vitest run packages/db/domain/payments.test.ts apps/bot`.

### C. `apps/web`
- [ ] **C1 — Piezas compartidas sin cambio visible.** `appointment-cancel.ts` y `calendar-client.tsx`
  usándolo (T15); `grouped-list.tsx` con el evento en `onClick`. Verificación: `npm run typecheck` +
  `npx vitest run apps/web`.
- [ ] **C2 — Revalidar `/turnos`.** Las 5 actions de §6.3. Tests (RED primero): en
  `(panel)/actions.test.ts` agregar `setAppointmentStatus` y `cancelAppointment` mockeados (`mocks.*`) y
  casos para `setStatusAction`, `cancelAppointmentAction`, `createAppointmentAction` (ya existe: sumar
  la aserción) y `saveAppointmentReasonAction`; en `pagos/actions.test.ts` sumar `/turnos` al caso de
  éxito. Verificación: `npx vitest run "apps/web/src/app/(panel)/actions.test.ts" "apps/web/src/app/(panel)/pagos/actions.test.ts"` + `npm run typecheck`.
- [ ] **C3 — Detalle reusable y saldo precargado.** `appointment-detail-sheet.tsx` (§5.4: status amplio,
  `AppointmentDetailBody`, `ReadOnlyAppointmentBody`, fila «Pagos», `balance` / `depositAmount` al
  modal) y `manual-payment-form.tsx` (`balanceAmount`, T7). El calendario no cambia de comportamiento.
  Verificación: `npm run typecheck` + `npx vitest run apps/web`.
- [ ] **C4 — Ruta `/turnos` de solo lectura + menú.** `data.ts` + `data.test.ts`, `page.tsx`,
  `loading.tsx`, `turnos-client.tsx` (encabezado, mes, tarjetas, buscador, estados vacíos, «Nuevo
  turno»), `appointments-table.tsx` y `appointments-mobile-list.tsx` sin acciones de fila todavía (solo
  «Abrir» deshabilitado o ausente), `nav-config.ts`. Verificación: `npx vitest run "apps/web/src/app/(panel)/turnos/data.test.ts"` + `npm run typecheck`.
- [ ] **C5 — Acciones de la fila y detalle.** `appointment-detail-dialog.tsx`; en el cliente: «Abrir»
  (escritorio y celular, `origin`), override de T16, cancelación diferida (T15), «Vino» / «No vino» con
  «Deshacer» (T17), «Registrar pago» con saldo (§7.7). Verificación: `npm run typecheck` + `npx vitest run apps/web`.
- [ ] **C6 — Filtros.** `turnos-filters.tsx` (popover / sheet), lectura de la URL, buscador con URL,
  «Ver todos», navegación de mes que conserva filtros (T10, T11). Verificación: `npm run typecheck` +
  `npx vitest run packages/core/src/appointment-list.test.ts apps/web`.

### D. Cierre
- [ ] **D1 — Verificación completa** (§10) y `progress/impl_HU-021.md` con resultado y comandos.

## 10. Verificación

### 10.1 Lo que corre el implementer antes de `done` (desde la raíz)

```bash
npm run typecheck                       # TODOS los workspaces: core, db, web Y bot
npm run test                            # vitest de todo el monorepo (mocks, sin base ni red)
npx vitest run packages/core/src/appointment-list.test.ts packages/core/src/deposits.test.ts
npx vitest run packages/db/domain/payments.test.ts
npx vitest run "apps/web/src/app/(panel)/actions.test.ts" "apps/web/src/app/(panel)/pagos/actions.test.ts" "apps/web/src/app/(panel)/turnos/data.test.ts"
npx vitest run apps/bot                 # el bot corre expireStalePendingPayments (payments.ts)
./ops/harness/verify.sh
git diff --stat develop -- packages/db/prisma   # tiene que salir vacío: sin cambios de schema ni migraciones
```

`apps/web` no tiene script `test`: sus tests corren con el vitest de la raíz (`npx vitest run <ruta>`).

Recorrido manual opcional con `npm run dev` (**sin el bot corriendo**), solo mirando: `/turnos` del mes en
curso y del siguiente, filtros, recarga con filtros, abrir detalle (escritorio y celular con el ancho
de la ventana), cerrar con Escape y ver el foco en «Abrir». **No** usar «Cancelar turno», «Enviar
recordatorio» ni «Nuevo turno» sobre pacientes del usuario (encolan WhatsApp reales). «Vino» / «No vino»
/ «Registrar pago» modifican datos: si se prueban, solo sobre un turno de prueba creado para eso (paciente
"Prueba HU-021", número inventado, **sin bot corriendo** y borrando por id las filas de `OutboundMessage`
que haya encolado la creación), y se reporta el id en `progress/impl_HU-021.md` para que el usuario
decida. El implementer **no** borra nada con filtros amplios.

### 10.2 Reglas que valen para el implementer

- **Sin migraciones**: no tocar `schema.prisma`, no correr `prisma migrate` ni `db push`. Si algo
  parece necesitar una columna, parar y reportar `blocked` (ver §12).
- **Datos de dev**: no modificar turnos, pagos ni pacientes preexistentes. Los tests de esta HU son con
  mocks. Cualquier prueba contra la base crea sus filas y las borra **por id** (o en una transacción que
  se revierte).
- **WhatsApp**: ninguna verificación manda mensajes reales; cancelar y recordar desde el detalle
  encolan en `OutboundMessage`: no usarlos con pacientes reales.
- No tocar `backlog/`. Un commit por tarea, solo los archivos de la tarea, Conventional Commits.

## 11. Tests (vitest, todo sin base ni red)

**`packages/core/src/appointment-list.test.ts`** (`tz = "America/Argentina/Buenos_Aires"`,
`now = new Date("2026-10-27T15:00:00Z")` = martes 27/10/2026 12:00 en Argentina).

1. `isUnpaidDepositCancellation`: los dos valores de `DEPOSIT_AUTO_CANCEL_REASONS` → true; `"La paciente
   canceló"`, `""`, `null`, `undefined`, el texto con otra mayúscula o con espacios extra → false.
2. `appointmentRowStatus`: CONFIRMED futuro → `upcoming`; CONFIRMED pasado → `unclosed`; CONFIRMED con
   `startsAt === now` → `unclosed`; COMPLETED → `completed`; NO_SHOW → `no_show`; AWAITING_PAYMENT
   (futuro y pasado) → `awaiting_deposit`; CANCELLED con `"Venció el tiempo para pagar la seña"` y con
   `"No se pudo generar el checkout de la seña"` → `deposit_unpaid`; CANCELLED con otro motivo o null →
   `cancelled`.
3. `summarizeAppointmentPayments`: (20000, []) → none, balance 20000; (20000, [5000]) → partial,
   paidTotal 5000, balance 15000; (20000, [5000, 15000]) → paid, balance 0; (20000, [25000]) → paid,
   balance 0 (pago de más); (0, []) y (0, [100]) → free; decimales: (100.1, [0.1, 100]) → paid (centavos,
   sin error de float); (100, [33.33, 33.33]) → partial, paidTotal 66.66, balance 33.34.
4. `appointmentPaymentText` (`"ARS"`): paid → «Pagado»; partial 5000 → `` `Seña pagada · ${formatPrice(5000, "ARS")}` ``;
   none → «Sin pagos registrados»; free → «—». `canRegisterAppointmentPayment`: CONFIRMED/COMPLETED con
   none o partial → true; con paid o free → false; NO_SHOW, CANCELLED, AWAITING_PAYMENT → false.
5. `buildAppointmentListRows` con la tabla del escenario «Conteo de las tarjetas» (Ana 06/10 COMPLETED,
   Bruno 13/10 NO_SHOW, Carla 20/10 CONFIRMED, Dora 29/10 CONFIRMED, Eva 30/10 AWAITING_PAYMENT, Fabi
   15/10 CANCELLED «La paciente canceló», Hugo 16/10 CANCELLED seña vencida; todas 10:00 en tz):
   orden por fecha (Ana, Bruno, Fabi, Hugo, Carla, Dora, Eva); Dora → `statusLabel` «Pendiente»,
   `dateLabel` «jue 29/10», `timeLabel` «10:00», `priceLabel` = `formatPrice(20000, "ARS")`,
   `paymentText` «Sin pagos registrados», `canRegisterPayment` true, `canClose` false; Carla →
   «Sin cerrar», `canClose` true; Hugo → `statusNote` «Seña sin pagar»; precio 0 → `priceLabel` «Sin
   cargo», `paymentText` «—», `canRegisterPayment` false; empate de hora → por id; `patientShortName` =
   primer nombre o `patientDisplayName` sin nombre; `patientArchived` pasa tal cual; `phoneDigits` null para
   JID `@lid`.
6. `countAppointmentCards` sobre las filas del bloque 5 filtradas con los filtros por defecto → total 4,
   pending 1, completed 1, cancelled 1, unclosed 1 (escenario de la HU). Con status `cancelled` → total
   0, cancelled 1 (Hugo pasa el filtro pero no cuenta en la tarjeta).
7. `matchesAppointmentFilters`: default excluye solo `deposit_unpaid` (Eva sí aparece); `cancelled` →
   Fabi y Hugo; `unclosed` → solo Carla; `awaiting_deposit` → solo Eva; pago `none` excluye `free`; pago
   `partial` / `paid`; `serviceId` filtra por servicio; `query` «car» → Carla (por nombre) y no otras; un
   query de dígitos matchea `phoneDigits`; combinados (AND).
8. URL: `parseAppointmentListFilters({ estado: "sin-cerrar", pago: "sin-pagos", servicio: "s1", q: "car" })`
   → filtros correctos; valores desconocidos (`estado: "x"`, `pago: ""`, `servicio: ""`) → defaults;
   ida y vuelta `parse(appointmentListQuery(...))` para cada valor de estado y pago;
   `appointmentListQuery(null, DEFAULT)` → `""`; `appointmentListQuery("2026-11", DEFAULT)` →
   `"mes=2026-11"`; orden `mes, estado, pago, servicio, q` y `q` codificado (`"ana lópez"`);
   `activeAppointmentFilterCount` (0, 1, 3; el buscador no cuenta). Textos: `cards.unclosed(2)` →
   «2 sin cerrar», `emptyMonth("diciembre")`, `toast.completed("Carla")`, `filtersLabel(0|1|2)`.

**`packages/core/src/deposits.test.ts`**: `DEPOSIT_AUTO_CANCEL_REASONS` igual a los dos literales
exactos (protege las filas ya guardadas).

**`apps/web/src/app/(panel)/turnos/data.test.ts`** (mock de `@nutri-bot/db` con
`prisma.appointment.findMany`, `vi.mock("server-only", () => ({}))`):
- El `where` es `startsAt: { gte: from, lt: to }` de `monthRangeInTz("2026-10", tz)` y **no** filtra
  por estado; `payments.where` es `{ status: "APPROVED" }`; `orderBy` startsAt asc + id asc.
- Mapeo: Decimal → `price` número y `priceSnapshot` string (usar objetos con `toString()` como mock);
  `approvedAmounts`; `archived` desde `archivedAt`; `googleSynced`; `consultation.hasContent` con
  `isConsultationEmpty`; `depositAmount` con seña PERCENT y sin seña (null).

**`apps/web/src/app/(panel)/actions.test.ts`** (agregar `setAppointmentStatus: mocks.setAppointmentStatus`,
`cancelAppointment: mocks.cancelAppointment` y `updateAppointmentReason: mocks.updateAppointmentReason` al
mock de `@/lib/appointments`):
- `setStatusAction` ok → `revalidatePath` con `"/"` y `"/turnos"`; error del dominio → `{ ok:false,
  error: "No se pudo actualizar el turno." }` y sin revalidar.
- `cancelAppointmentAction` ok → `"/"` y `"/turnos"`.
- `saveAppointmentReasonAction` ok → incluye `"/turnos"`.
- `createAppointmentAction` (caso de éxito existente) → también `"/turnos"`.

**`apps/web/src/app/(panel)/pagos/actions.test.ts`**: el caso de éxito también espera `"/turnos"`.

## 12. Dudas técnicas y decisiones para mostrar al usuario

Ninguna bloqueante. No hace falta migración.

- **T3, seña vencida por texto.** Se reconoce por `cancelReason` exacto (constante compartida + test con
  los literales). Alcanza hoy porque ningún otro camino escribe esos textos. La alternativa robusta
  sería una columna explícita (p. ej. `Appointment.autoCancelled Boolean @default(false)` con backfill
  `UPDATE … WHERE "cancelReason" IN (…)`), que **es una migración** y queda fuera de esta HU salvo que
  el usuario la pida.
- **T6, «Registrar pago» en el detalle.** Desde `/turnos` el detalle oculta «Registrar pago» cuando la
  suma de pagos aprobados cubre el precio. Desde el calendario sigue la regla de hoy (hay un pago
  «Pago completo» aprobado). Solo difieren en un caso raro: un «Pago completo» registrado por menos que
  el precio (el calendario ya no ofrece pagar; `/turnos` sí, por el saldo). Unificar el calendario
  queda fuera de alcance.
- **Textos chicos sin pedido explícito en la HU** (se pueden cambiar en `APPOINTMENT_LIST_TEXT` sin
  tocar lógica): en el detalle de lectura, «Canceló: La paciente / Vos / Se canceló sola: no se pagó la
  seña»; la etiqueta «Esperando seña» también en el badge del detalle (el calendario dice «Falta la
  seña», pero nunca muestra esos turnos).
