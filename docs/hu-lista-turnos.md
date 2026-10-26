# HU-021 — Lista de turnos con estado y pagos registrados

**Como** nutricionista que atiende varios turnos por semana y cobra parte en efectivo o
transferencia,
**quiero** una pantalla «Turnos» con todos los turnos de un período en forma de lista, con su
estado, su precio y los pagos que tienen registrados,
**para que** de un vistazo sepa cuántos turnos me quedan, cuáles quedaron sin cerrar y qué turnos
todavía no tienen ningún pago cargado, y pueda cargarlo desde ahí.

Origen: pedido del usuario (2026-10-26), tomando como referencia la pantalla «Citas» de otro
producto (Melon Mind): título, botones «Filtros» / vista lista-grilla / «+ Nueva cita», cinco
tarjetas (Totales, Pendientes, Completadas, Canceladas, Por cobrar) y una tabla con Estado,
Paciente, Fecha, Hora, Precio, Pago, Nota y «Abrir ↗» por fila. Se adapta **solo esa sección**; el
menú lateral de NutriBot no cambia salvo el ítem nuevo. La tarjeta «Por cobrar» queda fuera de esta
HU (ver §5 y §7). Issue: https://github.com/senkuch4n/nutri-bot/issues/50. Rama:
`feat/HU-021-lista-turnos`.

---

## 1. Contexto

### 1.1 Qué existe hoy

- **Calendario (`/`).** `apps/web/src/app/(panel)/(calendario)/page.tsx` + `calendar-client.tsx`:
  vista de agenda (día/semana) con FullCalendar, que trae los turnos de
  `apps/web/src/app/api/appointments/route.ts` (solo `CONFIRMED`, `COMPLETED`, `NO_SHOW`). Arriba
  muestra «N turnos / quedan M» del día y de la semana con `countAgendaDay`
  (`packages/core/src/agenda.ts`): total = CONFIRMED + COMPLETED + NO_SHOW; quedan = CONFIRMED con
  inicio futuro; CANCELLED y AWAITING_PAYMENT no cuentan. **No hay ninguna vista en lista de
  todos los turnos** ni un lugar que muestre a la vez estado y pagos de cada turno.
- **Detalle del turno.** `appointment-detail-sheet.tsx`: panel lateral (Sheet no modal) que abre el
  calendario al tocar un turno. Desde ahí se marca **«Completado»** y **«No vino»**, se vuelve a
  «Confirmado», se envía un recordatorio, se edita el motivo (HU-013), se cancela (con «Deshacer»,
  que agenda `calendar-client.tsx`) y se **registra un pago** (`AppointmentPaymentModal`, visible
  si el turno es CONFIRMED o COMPLETED y no tiene un pago total aprobado). Hoy solo admite turnos
  `CONFIRMED | COMPLETED | NO_SHOW` (tipo `SelectedAppointment`): **no sabe mostrar un turno
  CANCELLED ni AWAITING_PAYMENT**.
- **Cambio de estado.** `setStatusAction` (`apps/web/src/app/(panel)/actions.ts`) →
  `setAppointmentStatus` (`packages/db/domain/appointments.ts`). Pasar a COMPLETED crea la consulta
  del turno (HU-003); salir de COMPLETED borra la consulta solo si está vacía. Volver un turno futuro
  a CONFIRMED desarchiva a la paciente (HU-019). Hoy revalida `/` y la ficha, no otras rutas. **No
  existe ningún cierre automático**: un turno CONFIRMED pasado queda CONFIRMED para siempre si nadie
  lo marca.
- **Pagos (`/pagos`).** `pagos/page.tsx`: navegación por mes (`?mes=yyyy-MM`, no deja ir a meses
  futuros), tres métricas (cobrado en el mes, señas pendientes, cantidad de pagos) y una lista de
  **pagos** (`payments-table.tsx`, filas de `GroupedList` con buscador y control segmentado).
  «Registrar pago» (`manual-payment-dialog.tsx` + `manual-payment-form.tsx`) solo ofrece turnos
  CONFIRMED/COMPLETED de ±7 días. Un turno sin ningún `Payment` **no aparece en ninguna parte de
  Pagos**.
- **Registrar pago de un turno ya elegido.** `appointment-payment-modal.tsx` ya hace exactamente
  «pago manual con el turno preseleccionado» (reusa `ManualPaymentForm` con
  `defaultAppointmentId`). El monto se precarga con el **precio completo** del turno (o la seña si
  se elige «Seña»), no con el saldo.
- **Modelo.** `Appointment` (`packages/db/prisma/schema.prisma`) tiene `status`
  (`CONFIRMED | AWAITING_PAYMENT | CANCELLED | COMPLETED | NO_SHOW`), `priceSnapshot`, `reason`
  (motivo de consulta, HU-013), `cancelledBy`, `cancelReason`, `bookedAt` y `payments[]`.
  `Payment` tiene `kind` (DEPOSIT/FULL), `amount`, `status` (solo APPROVED es plata cobrada),
  `provider` (`mercadopago` | `manual`). **No hay ningún campo «nota» del turno**: el único texto
  libre es `reason`.
- **Reservas con seña.** Nacen AWAITING_PAYMENT; si en 15 minutos no se paga,
  `expireStalePendingPayments` (`packages/db/domain/payments.ts`) las pasa a **CANCELLED** con
  `cancelledBy: PROFESSIONAL` y `cancelReason: "Venció el tiempo para pagar la seña"` (también
  `"No se pudo generar el checkout de la seña"` si falla Mercado Pago). O sea: casi no hay
  AWAITING_PAYMENT vivos, pero sí CANCELLED que nunca fueron una reserva en firme.
- **Textos de estado.** `APPOINTMENT_STATUS_TEXT` (`packages/core/src/patient-summary.ts`):
  Confirmado, Falta la seña, Vino, Canceló, No vino. La tabla de turnos de la ficha
  (`pacientes/[id]/appointments-section.tsx`) ya los usa, con íconos por estado y el motivo en
  `AppointmentReasonCell` (truncado, se expande al tocarlo).
- **Motivo (HU-013, D9).** Se muestra en el detalle del turno, la alerta de turno nuevo, la
  consulta y la **tabla de turnos de la ficha**. **No** en el bloque del calendario («la pantalla
  puede estar a la vista de otros»), ni en Google Calendar, la IA o el portal.
- **Nuevo turno.** `new-appointment-modal.tsx` (HU-017b-1): modal en escritorio, sheet inferior en el
  celular.
- **MorphDialog.** `components/primitives/morph-dialog.tsx` (commit `92c0395`, ya en esta rama):
  diálogo con animación FLIP desde el elemento que lo abre; lo usa Disponibilidad (`10ece48`).
- **Navegación.** `components/shell/nav-config.ts`, grupo «Agenda»: Calendario, Disponibilidad,
  Servicios. Pagos está en «Gestión».
- **Componentes.** Hay `components/data-table.tsx` (tablas de evolución, plantillas, alimentos),
  `grouped-list.tsx`, `segmented-control.tsx`, `Metric` y `EmptyState` (`components/ui`).

### 1.2 Qué es lo nuevo

Una pantalla `/turnos` del panel que lista **turnos** (no pagos) de un período, con cuatro
tarjetas de resumen, filtros, el estado de cada turno, su precio y **lo que tiene registrado como
pagado**, y acceso a las acciones que ya existen (nuevo turno, detalle, registrar pago, marcar vino /
no vino). Complementa a Pagos, no la duplica: no repite «cobrado en el mes» ni lista pagos. **No
calcula deuda**: la columna Pago describe lo registrado, sin decir que algo «se debe».

### 1.3 Reglas ya decididas por el usuario

| # | Regla |
|---|---|
| R1 | La pantalla se llama **«Turnos»** (nunca «Citas»). |
| R2 | Complementa a `/pagos`; no repite la tarjeta «cobrado en el mes». |
| R3 | **Pendientes** = turnos CONFIRMED con inicio futuro. Los AWAITING_PAYMENT no cuentan, pero aparecen en la lista con la etiqueta «Esperando seña». |
| R4 | Un turno CONFIRMED ya pasado no es pendiente: la fila lleva el aviso **«Sin cerrar»**, que invita a marcarlo «Vino» o «No vino». |
| R5 | Hay **cuatro tarjetas**: Totales, Pendientes, Completadas y Canceladas. **No hay tarjeta «Por cobrar»** (queda como mejora futura, §5). |
| R6 | Las tarjetas respetan el período y los filtros activos. |
| R7 | «Nuevo turno» reusa `new-appointment-modal.tsx`; «Abrir» reusa `appointment-detail-sheet.tsx` (abierto con `MorphDialog`); «Registrar pago» abre el pago manual existente con el turno preseleccionado. |
| R8 | La columna **Pago** dice solo lo registrado, con texto neutro: «Pagado», «Seña pagada · $X» o «Sin pagos registrados». Nunca «Cobro pendiente» ni otra palabra que suponga una deuda. |

---

## 2. Criterios de aceptación

> Fechas de ejemplo: hoy es el lunes 27/10/2026, 12:00, zona de la profesional. Las decisiones que
> antes eran dudas están resueltas en §7.

```gherkin
Feature: Lista de turnos con estado y pagos registrados

  Background:
    Given la nutricionista está logueada en el panel

  # --- Navegación y período ---

  Scenario: Entrar a Turnos
    When toca "Turnos" en el grupo "Agenda" del menú lateral
    Then ve la pantalla "Turnos" con el período "Octubre 2026"
    And ve las tarjetas "Totales", "Pendientes", "Completadas" y "Canceladas"
    And no ve ninguna tarjeta de montos
    And ve la lista de turnos de octubre ordenada por fecha y hora, del más viejo al más nuevo

  Scenario: Cambiar de mes, incluidos meses futuros
    Given está viendo "Octubre 2026"
    When toca "Mes siguiente"
    Then ve "Noviembre 2026" con sus turnos y sus tarjetas
    And la dirección de la página cambia a "/turnos?mes=2026-11"

  Scenario: Período sin turnos
    Given no hay ningún turno en diciembre de 2026
    When va a "Diciembre 2026"
    Then las cuatro tarjetas muestran 0
    And ve "No hay turnos en diciembre" con el botón "Nuevo turno"

  # --- Tarjetas ---

  Scenario: Conteo de las tarjetas
    Given en octubre hay estos turnos:
      | paciente | inicio        | estado           | motivo de cancelación               |
      | Ana      | 06/10 10:00   | COMPLETED        |                                     |
      | Bruno    | 13/10 10:00   | NO_SHOW          |                                     |
      | Carla    | 20/10 10:00   | CONFIRMED        |                                     |
      | Dora     | 29/10 10:00   | CONFIRMED        |                                     |
      | Eva      | 30/10 10:00   | AWAITING_PAYMENT |                                     |
      | Fabi     | 15/10 10:00   | CANCELLED        | La paciente canceló                 |
      | Hugo     | 16/10 10:00   | CANCELLED        | Venció el tiempo para pagar la seña |
    Then "Totales" muestra 4
    And "Pendientes" muestra 1
    And "Completadas" muestra 1
    And "Canceladas" muestra 1
    And debajo de "Totales" se lee "1 sin cerrar"

  Scenario: Las reservas con seña vencida no se muestran por defecto
    Given el turno de Hugo se canceló solo porque no pagó la seña a tiempo
    Then no aparece en la lista ni en "Canceladas"
    When filtra por el estado "Cancelados"
    Then ve el turno de Hugo con el estado "Canceló" y la aclaración "Seña sin pagar"

  Scenario: Las tarjetas siguen a los filtros
    Given en octubre hay turnos de los servicios "Consulta" y "Antropometría"
    When filtra por el servicio "Antropometría"
    Then la lista y las cuatro tarjetas cuentan solo los turnos de "Antropometría"

  # --- Filas ---

  Scenario: Fila de un turno futuro confirmado
    Given Dora tiene un turno CONFIRMED el miércoles 29/10 a las 10:00, "Consulta", 20.000, sin pagos
    Then su fila muestra el estado "Pendiente", "Dora", "Consulta", "mié 29/10", "10:00", "$ 20.000"
    And en Pago muestra "Sin pagos registrados"
    And muestra "Registrar pago" y "Abrir"

  Scenario: Fila de un turno confirmado que ya pasó
    Given Carla tiene un turno CONFIRMED el lunes 20/10 a las 10:00
    Then su fila muestra el estado "Sin cerrar"
    And ofrece "Vino" y "No vino"

  Scenario: Fila de una reserva esperando la seña
    Given Eva reservó por el bot un turno con seña y todavía no la pagó
    Then su fila muestra el estado "Esperando seña"
    And no cuenta en "Pendientes" ni en "Totales"

  Scenario: Columna Pago, solo lo registrado
    Then una fila muestra en Pago, contando solo pagos aprobados:
      | pagos aprobados del turno            | Pago                  |
      | suman el precio o más                | Pagado                |
      | suman más de 0 y menos que el precio | Seña pagada · $ suma  |
      | ninguno                              | Sin pagos registrados |
    And un pago de Mercado Pago que no está aprobado no cuenta
    And el texto de Pago no usa colores de advertencia ni de error

  Scenario: Turno sin cargo
    Given un turno con precio 0
    Then la columna Precio muestra "Sin cargo"
    And la columna Pago muestra "—"
    And no ofrece "Registrar pago"

  Scenario: Motivo de la fila
    Given el turno de Carla tiene el motivo "Control mensual, bajar de peso"
    Then la columna "Motivo" muestra el texto truncado en una línea
    And al tocarlo se ve completo
    And un turno sin motivo muestra "—"

  # --- Acciones ---

  Scenario: Nuevo turno desde la lista
    When toca "Nuevo turno"
    Then se abre el mismo "Nuevo turno" del calendario
    When crea un turno para el 31/10
    Then el turno aparece en la lista y las tarjetas se actualizan

  Scenario: Abrir el detalle de un turno
    When toca "Abrir" en la fila de Dora
    Then se abre el detalle del turno, animado desde la fila
    And puede hacer ahí todo lo que hace desde el calendario
    When lo cierra
    Then vuelve a la lista en el mismo lugar, con el foco en "Abrir" de la fila de Dora

  Scenario: Cambios hechos en el detalle se ven en la lista
    Given abrió el detalle de Carla
    When marca "Completado" y cierra
    Then la fila de Carla muestra "Completado" y "Completadas" sube en 1

  Scenario: Abrir un turno cancelado o esperando seña
    When toca "Abrir" en la fila de Fabi (cancelado)
    Then ve el detalle en modo lectura: paciente, servicio, fecha, precio, pagos, quién canceló y el motivo de cancelación
    And un enlace a la ficha de la paciente
    And no ve acciones de cambio de estado ni "Registrar pago"

  Scenario: Cerrar un turno desde la fila
    Given la fila de Carla dice "Sin cerrar"
    When toca "Vino"
    Then el turno queda COMPLETED y se crea su consulta como cuando se marca desde el calendario
    And ve el aviso "Turno de Carla marcado como completado" con "Deshacer"
    And "Completadas" sube en 1
    When toca "Deshacer"
    Then el turno vuelve a CONFIRMED y la fila vuelve a "Sin cerrar"

  Scenario: Marcar ausente desde la fila
    Given la fila de Carla dice "Sin cerrar"
    When toca "No vino"
    Then el turno queda NO_SHOW y la fila muestra "No vino"
    And ve el aviso con "Deshacer"

  Scenario: Registrar un pago con el saldo precargado
    Given el turno de Carla cuesta 20.000 y tiene una seña aprobada de 5.000
    And su fila muestra "Seña pagada · $ 5.000"
    When toca "Registrar pago" en la fila
    Then se abre "Registrar pago" con el turno de Carla ya elegido
    And el monto precargado es $ 15.000, editable
    When confirma
    Then la fila muestra "Pagado"
    And el pago aparece en /pagos en el mes en curso

  Scenario: Registrar pago en un turno ya pagado
    Given la fila de Ana muestra "Pagado"
    Then la fila no ofrece "Registrar pago"

  Scenario: Error al guardar una acción
    Given falla la conexión con la base
    When toca "Vino" en una fila
    Then ve "No se pudo actualizar el turno." y la fila no cambia

  # --- Filtros ---

  Scenario: Filtrar por estado
    When abre "Filtros" y elige el estado "Sin cerrar"
    Then ve solo los turnos CONFIRMED que ya pasaron
    And el botón "Filtros" indica que hay 1 filtro activo

  Scenario: Filtrar por pago
    When elige el filtro de pago "Sin pagos registrados"
    Then ve solo las filas cuyo Pago dice "Sin pagos registrados"

  Scenario: Buscar por paciente
    When escribe "car" en el buscador
    Then ve solo los turnos de pacientes cuyo nombre o teléfono contiene "car"

  Scenario: Limpiar filtros
    Given hay filtros activos y ninguna fila coincide
    Then ve "Ningún turno coincide con los filtros" y el botón "Ver todos"
    When lo toca
    Then se quitan los filtros y vuelve a ver todos los turnos del período

  Scenario: Los filtros sobreviven a recargar
    Given filtró por "Sin cerrar" en octubre
    When recarga la página o vuelve desde la ficha de una paciente
    Then sigue viendo octubre filtrado por "Sin cerrar"

  # --- Celular ---

  Scenario: Lista en el celular
    Given la pantalla mide menos de 640 px de ancho
    Then cada turno se ve como una fila de lista (no una tabla)
    And la fila muestra paciente, estado, fecha y hora, y a la derecha el precio y el texto de Pago
    And tocar la fila abre el detalle del turno
```

---

## 3. Datos que se registran

Esta HU **no registra datos nuevos** ni toca `schema.prisma`. Lee lo que ya existe y escribe solo a
través de acciones que ya existen.

| Dato | Obligatorio | Uso |
|---|---|---|
| Estado del turno (`Appointment.status`) | Sí (ya existe) | Estado de la fila, tarjetas, filtros; se cambia con `setStatusAction` |
| Precio al reservar (`priceSnapshot`) | Sí (ya existe) | Columna Precio; saldo precargado en «Registrar pago» |
| Pagos aprobados del turno (`Payment` con `status = APPROVED`) | — (ya existe) | Columna Pago; saldo precargado en «Registrar pago» |
| Pago manual nuevo | Lo carga la profesional | Igual que hoy (`registerManualPayment`): `provider = manual`, `status = APPROVED` |
| Motivo de consulta (`Appointment.reason`) | No (ya existe) | Columna «Motivo» |
| Motivo de cancelación (`cancelReason`) | No (ya existe) | Detalle de solo lectura; separar las señas vencidas de las cancelaciones reales |

---

## 4. Diseño UX

### 4.1 Ubicación en el menú

`nav-config.ts`, grupo **«Agenda»**, justo debajo de «Calendario»: Calendario, **Turnos**,
Disponibilidad, Servicios. Ruta `/turnos`. Ícono de lucide que no repita los de la sidebar
(Calendario usa `CalendarDays`, Disponibilidad `Clock`); propuesta: `ListChecks`. El resto de la
sidebar no cambia. (Va en «Agenda» y no en «Gestión» porque la pantalla es de turnos; los pagos son
una columna, no el tema.)

### 4.2 Encabezado

- `PageHeader` con título «Turnos» y descripción corta: «Todos tus turnos del mes, con lo que
  tienen registrado como pagado.»
- A la derecha: **«Filtros»** (con contador si hay filtros activos) y **«Nuevo turno»** (botón
  principal). Sin selector lista/grilla.
- Debajo, la navegación de mes igual a Pagos (flechas + «Octubre 2026»), con `?mes=yyyy-MM`.
  A diferencia de Pagos, **deja ir a meses futuros**.

### 4.3 Tarjetas

Una fila de cuatro `Metric` con el mismo estilo que las métricas de Pagos:

| Tarjeta | Qué cuenta (dentro del período y los filtros) |
|---|---|
| Totales | Reservas en firme: CONFIRMED + COMPLETED + NO_SHOW, igual que «N turnos» del calendario |
| Pendientes | CONFIRMED con inicio futuro (R3) |
| Completadas | COMPLETED |
| Canceladas | CANCELLED, sin las reservas que se cancelaron solas por no pagar la seña o por fallar el checkout |

Debajo de «Totales», un caption con los que necesitan atención: «2 sin cerrar» (solo si hay).
No hay tarjeta propia para «No vino» (se ve con el filtro). Las tarjetas **no** son botones.

En el celular: grilla de 2 columnas.

### 4.4 Lista (escritorio, ≥ 640 px)

Tabla con columnas:

| Columna | Contenido |
|---|---|
| Estado | Pill con ícono: «Pendiente» (CONFIRMED futuro), «Sin cerrar» (CONFIRMED pasado, tono advertencia), «Completado», «No vino», «Canceló», «Esperando seña». Mismos íconos que la tabla de la ficha |
| Paciente | `patientDisplayName`; si está archivada (HU-019), marca «Archivada» en gris |
| Servicio | Nombre del servicio (no está en la referencia; se agrega porque la profesional tiene varios) |
| Fecha | Formato del producto, p. ej. «mié 29/10» |
| Hora | 24 h, «10:00» (el producto no usa AM/PM) |
| Precio | `priceSnapshot` con `formatPrice`; 0 → «Sin cargo» |
| Pago | Texto neutro (R8): «Pagado», «Seña pagada · $X» o «Sin pagos registrados»; «—» si el precio es 0. Sin tonos de advertencia |
| Motivo | `AppointmentReasonCell` (truncado, se expande al tocar) |
| Acciones | «Registrar pago» (ver 4.6), «Abrir ↗». En filas «Sin cerrar», además «Vino» / «No vino» |

- Orden: fecha y hora ascendente (como una agenda).
- Toda la fila no es clickeable en escritorio (para no chocar con los botones); «Abrir» sí.
- Teclado: los controles de la fila en orden de tabulación; al cerrar el detalle, el foco vuelve
  a «Abrir» de esa fila.

### 4.5 Lista (celular, < 640 px)

Filas de `GroupedList`, como Pagos:

- **Título:** paciente · servicio.
- **Descripción:** pill de estado · «mié 29/10, 10:00».
- **Accesorio:** precio arriba y el texto de Pago abajo.
- Tocar la fila abre el detalle. «Vino» / «No vino» y «Registrar pago» se hacen desde el detalle
  (no hay botones en la fila del celular).
- El motivo no se muestra en la fila del celular (está en el detalle).

### 4.6 «Registrar pago» desde la fila

- Se ofrece en las mismas condiciones que en el detalle (turno CONFIRMED o COMPLETED) y solo si la
  fila **no** dice «Pagado» ni el precio es 0.
- Abre el pago manual existente (`AppointmentPaymentModal` / `ManualPaymentForm`) con el turno
  preseleccionado y el monto precargado con el **saldo**: precio − pagos aprobados, tipo «Total»,
  editable.
- Al guardar, la fila y el detalle se actualizan, y el pago aparece en `/pagos`.

### 4.7 Filtros

Botón «Filtros» que abre un popover (sheet inferior en el celular) con:

- **Estado:** Todos · Pendientes · Sin cerrar · Completados · No vino · Cancelados · Esperando seña.
  «Cancelados» incluye las reservas con seña vencida, marcadas «Seña sin pagar».
- **Pago:** Todos · Pagados · Con seña · Sin pagos registrados.
- **Servicio:** lista de servicios (solo se muestra si hay más de uno).
- «Limpiar filtros».

Aparte, siempre visible arriba de la lista: buscador por paciente (nombre o teléfono), como en Pagos.

Los filtros viven en la URL (`?mes=…&estado=…&pago=…&servicio=…&q=…`) para que sobrevivan a
recargar y a volver atrás.

### 4.8 Detalle («Abrir»)

- Reusa `AppointmentDetailSheet` dentro de `MorphDialog`, que anima desde la fila (R7).
- Las acciones del detalle (completado, no vino, volver a confirmado, recordatorio, motivo,
  cancelar con «Deshacer», registrar pago) funcionan igual que desde el calendario y al terminar
  refrescan la lista y las tarjetas.
- Turnos CANCELLED y AWAITING_PAYMENT: el mismo detalle en **modo lectura** (paciente, servicio,
  fecha, precio, pagos registrados, quién canceló y por qué) con enlace a la ficha de la paciente,
  sin acciones de estado ni «Registrar pago».

### 4.9 Feedback y errores

| Situación | Feedback |
|---|---|
| «Vino» desde la fila | Toast «Turno de {paciente} marcado como completado» + «Deshacer» (vuelve a CONFIRMED) |
| «No vino» desde la fila | Toast con el texto que ya usa el detalle (`AGENDA_TEXT.sheet.toastNoShow`) + «Deshacer» |
| Pago registrado | El mismo toast que hoy da `AppointmentPaymentModal` |
| Error de una acción | Toast de error con el texto de la action («No se pudo actualizar el turno.»); la fila no cambia |
| Cargando | `loading.tsx` con esqueleto de tarjetas y filas (como `/pagos`) |
| Error al cargar la página | `error.tsx` del panel |
| Período vacío | `EmptyState` «No hay turnos en {mes}» + «Nuevo turno» |
| Filtros sin resultados | `EmptyState` «Ningún turno coincide con los filtros» + «Ver todos» |

### 4.10 Bot de WhatsApp y portal

**No intervienen.** Esta HU no manda mensajes ni cambia el portal. Las acciones reusadas mantienen
sus efectos actuales (p. ej. cancelar desde el detalle sigue avisándole a la paciente como hoy).

---

## 5. Fuera de alcance

- **Tarjeta «Por cobrar» (posible mejora futura).** Cálculo ya definido: suma de
  `priceSnapshot − pagos APPROVED`, cuando es mayor que 0, de los turnos que **ya ocurrieron** y no
  están CANCELLED ni NO_SHOW, **sin limitarse al período** visible. Se deja afuera porque no se sabe
  si la nutricionista registra en el panel lo que cobra en la consulta: si no lo hace, el número
  mostraría deudas que no existen. Se revisa después de un mes de uso, mirando cuántos turnos
  pasados tienen pagos registrados, o preguntándole a ella.
- Cualquier texto o filtro que hable de «deuda», «cobro pendiente» o «por cobrar».
- **Vista grilla** (tarjetas por turno). El calendario ya es la vista visual.
- Otras secciones de la referencia: «Inicio», «Finanzas», «Registrar gasto», «Agendar cita» y
  «Nuevo paciente» en la sidebar, selector de cuenta. Solo se agrega el ítem «Turnos».
- Cambios en `/pagos` (sigue igual).
- Cerrar automáticamente los turnos pasados (marcarlos completados solos).
- Acciones masivas (marcar varios como completados, registrar varios pagos).
- Reclamar pagos por WhatsApp o mandar link de pago de Mercado Pago desde la lista.
- Editar el precio de un turno o hacer descuentos.
- Exportar a Excel/CSV o imprimir.
- Un campo «nota interna» nuevo (se muestra el motivo de consulta que ya existe).
- Saldo por paciente en la ficha y «saldo a favor» (épica 51 de
  `docs/historias-usuario-nutridesk.md`).
- Rango de fechas libre (desde/hasta), vista por semana o período «Todo».

---

## 6. Notas de implementación (mínimas; el detalle es del architect)

- **Cálculos puros en `packages/core`** con tests: clasificar el estado visible de un turno
  (Pendiente / Sin cerrar / Esperando seña / …) a partir de `status`, `startsAt` y `now`; el texto
  de Pago y el saldo a precargar a partir del precio y los pagos aprobados; contar las tarjetas;
  reconocer las reservas con seña vencida. Bordes: pago de más, precio 0, pagos no aprobados, turno
  que empieza exactamente ahora.
- Las señas vencidas hoy solo se distinguen por `cancelReason` (texto) o por `bookedAt` nulo, que
  también es nulo en filas creadas por seeds/scripts. El architect elige el criterio; si hace falta
  una marca explícita, eso sería una migración y se vuelve a consultar.
- La consulta del período trae turnos con paciente, servicio y pagos APPROVED. Si solo la usa la
  web, puede vivir en la página como en Pagos; si se reusa, va a `packages/db/domain`.
- `setStatusAction`, `registerManualPaymentAction` y la cancelación hoy revalidan `/` (y la ficha):
  hay que sumar `/turnos`.
- `AppointmentDetailSheet` hoy es un `Sheet` no modal pensado para convivir con el calendario y
  recibe `onCancel` (el «Deshacer» de la cancelación lo agenda `calendar-client.tsx`). Usarlo en
  `MorphDialog` implica separar el contenido del contenedor y mover esa lógica a algo compartido.
  `SelectedAppointment.status` no admite CANCELLED ni AWAITING_PAYMENT: el modo lectura amplía ese
  tipo.
- «Registrar pago»: `AppointmentPaymentModal` ya es el pago manual con el turno preseleccionado.
  Para precargar el saldo hay que pasarle un monto inicial a `ManualPaymentForm` (hoy usa
  `priceSnapshot`).
- Respetar HU-019: los turnos pasados de pacientes archivadas aparecen; una archivada no puede tener
  turnos futuros.
- Moneda y formatos: `formatPrice` con `pro.currency`, fechas en `pro.timezone` (usar los
  helpers de `packages/core`, como `appointmentDayTime`).
- No toca `schema.prisma`.

---

## 7. Resoluciones (2026-10-26, validadas por el usuario)

No quedan dudas abiertas.

**Por cobrar.** Se saca la tarjeta «Por cobrar» y todo cálculo de deuda. Quedan cuatro tarjetas
(Totales, Pendientes, Completadas, Canceladas), todas según el período activo. «Por cobrar» pasa a
Fuera de alcance como mejora futura, con su cálculo y el motivo (§5).

**D1. Columna «Nota».** Se muestra el **motivo de consulta** (`Appointment.reason`) con el título
«Motivo», truncado y expandible como en la ficha, solo en escritorio. Sin migración ni campo nuevo.

**D2. Filtros.** Buscador por paciente siempre visible + «Filtros» con Estado, Pago y Servicio
(este último solo si hay más de uno). Las tarjetas no son clickeables.

**D3. Período.** Mes en curso por defecto, flechas de mes como en Pagos, y se puede ir a meses
futuros. Sin rango libre, vista semanal ni período «Todo».

**D4. «Totales» y señas vencidas.** «Totales» = CONFIRMED + COMPLETED + NO_SHOW (igual que el
calendario), sin cancelados ni esperando seña. Las reservas que se cancelaron solas porque no se
pagó la seña (o falló el checkout) no cuentan en «Canceladas» y solo se ven con el filtro
«Cancelados», marcadas «Seña sin pagar». No hay tarjeta para «No vino».

**D5. Vista grilla.** Fuera de alcance.

**D6. Columna «Pago».** Solo lo registrado, con texto neutro: «Pagado», «Seña pagada · $X» o «Sin
pagos registrados» (y «—» si el precio es 0). Nunca «Cobro pendiente». Cada fila tiene la acción
«Registrar pago».

**D7. «Vino» / «No vino» desde la fila.** Sí, en filas «Sin cerrar» de escritorio, con toast y
«Deshacer» (vuelve a CONFIRMED). «Vino» crea la consulta del turno igual que hoy. En el celular,
desde el detalle.

**D8. «Abrir» en turnos cancelados o esperando seña.** El mismo detalle en modo lectura, con enlace
a la ficha de la paciente y sin acciones de estado.

**D9. Monto precargado en «Registrar pago».** Se precarga el **saldo** (precio − pagos aprobados),
tipo «Total», editable.
