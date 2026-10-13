# HU-017b — Rediseño Apple (3/5): agenda y gestión, simple de usar

**Como** nutricionista que organiza su agenda, cobra y se comunica con sus pacientes desde el panel,
y que no se lleva bien con la computadora,
**quiero** ver mis turnos del día de un vistazo, sacar un turno eligiendo a la paciente de una lista
en vez de escribir su teléfono, cambiar mi horario sin miedo a romper algo, y que los mensajes, los
pagos, los avisos y los ajustes me hablen en palabras simples y con una sola cosa clara para hacer,
**para que** pueda manejar la agenda y el bot sin perderme, sin términos de sistema y sin mandarle
por error un WhatsApp a una paciente (o a todas).

Origen: HU madre `docs/hu-rediseno-apple.md` (fila HU-017b de la sección 6, hallazgos C1–C9, D-1–D-5,
SV1–SV4, ME1–ME4, PG1–PG3, AV1–AV4, AS1–AS4, AJ1–AJ5, riesgos R1 y R10, catálogo de componentes de
5.8, Resoluciones del 2026-10-03). Mismo **foco de usabilidad** que HU-017c (prioridad sobre lo
estético). Reutiliza los patrones de 017c (`docs/hu-017c-pacientes-consultas.md`,
`Refactorizaciones/017c-pacientes-consultas.md`). Depende de HU-017a (en `develop`) y de HU-017c
(aprobada; rama encadenada). Rama: `feat/hu-017b-agenda` (sale de `feat/hu-017c4-informe`).

> **Afinada sin observar a la nutricionista**, como 017c. Se apoya en la auditoría de la madre, en
> el código actual y en los patrones validados en 017c. Ver **D1**.

---

## 1. Contexto

### 1.1 Qué existe hoy

**Fundaciones (HU-017a) y patrones de HU-017c, ya disponibles en la rama:**

| Pieza | Dónde | Para qué sirve acá |
|---|---|---|
| Tokens Apple, Motion, primitivos con press, Sheet arrastrable, Dialog con spring | `lib/design-tokens.ts`, `lib/motion.ts`, `components/primitives/*` | Base visual. Las pantallas de 017b ya los tomaron con 017a; falta la reorganización propia. |
| `SegmentedControl` | `components/segmented-control.tsx` | Selector de vista del calendario y filtros de Mensajes, Pagos y Avisos (hoy son `ToggleGroup` con borde: T5 de la madre). |
| `GroupedList` / `GroupedListRow` (con `size="lg"` de 017c-1) | `components/grouped-list.tsx` | Ajustes, horario semanal, excepciones, listas en el celular. |
| `Metric` | `components/ui.tsx` | Totales de Pagos. |
| `MoreActionsMenu` (botón "…" de 44 px con nombre accesible) | `components/more-actions-menu.tsx` | Acciones destructivas o poco frecuentes. |
| Borrado diferido con "Deshacer" (8 s; si se cierra la pestaña antes, no pasa nada) | `lib/deferred-delete.ts` + `notify.undo(…, { onExpire })` | Cancelar turno, borrar bloque/excepción, comunicado, "Ya respondí". |
| `useConfirm()` (foco en el botón seguro) | `components/confirm.tsx` | Confirmaciones en palabras simples. |
| Helpers de core | `formatPhone` (`phone-format.ts`), `classifyWhatsappJid` / `isPersonJid` / `whatsappChatUrl` / `HIDDEN_NUMBER_TEXT` (`whatsapp-contact.ts`), `formatAppointmentWhen` / `formatTimeAgo` (`relative-date.ts`), `matchesPatientQuery` / `buildPatientDirectory` (`patient-directory.ts`), `APPOINTMENT_STATUS_TEXT` ("Vino", "No vino", "Canceló", "Falta la seña"; `patient-summary.ts`) | Teléfonos con formato, contactos `@lid` sin botón de WhatsApp, fechas en lenguaje común, buscador de pacientes en "Nuevo turno", estados del turno con las mismas palabras que la ficha. |
| Deep link `/?fecha=yyyy-MM-dd` (Q7, entregado en 017c-2) | `(calendario)/page.tsx` valida con `isValidDayKey` y pasa `focusDate` a `CalendarClient` → `initialDate` de FullCalendar | **Abre la semana** que contiene esa fecha, en vista Semana. No abre el día ni cambia de vista. La tarjeta "Próximo turno" de la ficha enlaza ahí. |

**Calendario** (`/`: `(calendario)/page.tsx`, `calendar-client.tsx`, `new-appointment-modal.tsx`,
`appointment-detail-sheet.tsx`, `actions.ts`, `api/appointments/route.ts`).

- FullCalendar con la barra de herramientas propia de la librería (`prev,next today` · título ·
  `Mes/Semana/Día`), vista inicial **Semana** en todos los anchos. En 390 px son 7 columnas
  ilegibles y la barra se parte en tres renglones (C2, C3).
- Las horas fuera de atención se pintan en gris lleno y dominan la grilla (C1).
- Franja de resumen: "Turnos hoy" y "Esta semana" cuentan **solo** turnos `CONFIRMED` (a la tarde,
  con 5 pacientes atendidas, dice "Turnos hoy 1"). "Próximo turno" muestra `patient.name ??
  patient.phone` (teléfono crudo).
- Los eventos (`/api/appointments`) se titulan `name ?? phone` (crudo, y para un `@lid` es un número
  que no es un teléfono). Se ven `CONFIRMED`, `COMPLETED` y `NO_SHOW`; los `AWAITING_PAYMENT` no
  (vencen a los 15 min: `expireStalePendingPayments`).
- **Sheet del turno** (no modal, bien resuelto: C6). Muestra paciente, teléfono crudo, servicio,
  fecha, precio, motivo (editar con un botón **solo ícono**), estado de recordatorios. Acciones:
  "Marcar completado", "No asistió", "Enviar recordatorio ahora", y **"Cancelar turno" rojo lleno a
  todo el ancho** (C8). La confirmación de cancelar dice "No se puede deshacer" y **encola el aviso
  de cancelación por WhatsApp al paciente**. No hay enlace a la ficha de la paciente ni botón de
  WhatsApp. El badge dice "No asistió"; la ficha (017c) dice "No vino".
- **"Nuevo turno"** (modal): Nombre + "Teléfono / WhatsApp" con placeholder `549XXXXXXXXXX` y la
  ayuda "Solo números, con código de país", Servicio, Día (input nativo) y horarios como toggles.
  Problemas reales para esta usuaria:
  - Para una paciente que **ya existe** hay que volver a escribir su teléfono exacto.
    `findOrCreatePatient` (`packages/db/domain/patients.ts`) hace `upsert` por `whatsappJid`: si el
    teléfono coincide, **le reemplaza el nombre** por lo que se tipeó ("María" pisa "María José
    Gómez"). Si se escribe sin `549` (p. ej. `3515552345`), crea **otra** paciente con un JID que no
    es de WhatsApp y la confirmación del bot no le llega a nadie.
  - Una paciente `@lid` (WhatsApp no muestra su número: 9 en la base de desarrollo) no se puede
    agendar desde el panel sin duplicarla.
  - Si se toca una franja vacía de la grilla, se pasa solo el **día**, no la hora.
- `?fecha=` existe (ver tabla de arriba), pero el calendario no escribe la fecha ni la vista en la
  URL: al recargar o al volver atrás desde la ficha, vuelve a hoy en Semana.

**Disponibilidad** (`/disponibilidad`: `view.tsx`, `schedule.tsx`, `exceptions.tsx`, `actions.ts`).

- Grilla semanal de 7 columnas (`min-w-[560px]`: en el celular scrollea en horizontal). Se agrega un
  bloque tocando una franja vacía (la única pista es el hover: D-2) o con "Bloque de horario".
- **No se puede editar un bloque**: solo agregar o borrar. Para cambiar 9–13 por 9–14 hay que borrar
  y crear.
- Se pueden crear bloques superpuestos (15–19 y 16–20 el mismo día); se dibujan encima y la × del de
  abajo queda tapada (D-1). El servidor no lo impide.
- **Borrar un bloque o una excepción es un clic en una × de 24 px, sin confirmación y sin
  deshacer** (D-3). El bot calcula los horarios libres con estas reglas en el momento
  (`packages/db/domain/availability.ts`).
- Excepciones: lista con **todas**, también las pasadas. El formulario pide "Tipo: Bloquear (día u
  horario) / Horario especial" y horas opcionales; la regla se explica en un párrafo al pie
  ("Bloquear sin horas = día completo…"). Una excepción es un solo día (unas vacaciones de dos
  semanas son 14 cargas).
- La descripción de la página muestra la zona horaria en formato técnico
  (`America/Argentina/Buenos_Aires`).

**Servicios** (`/servicios`: `page.tsx`, `service-card.tsx`, `service-form.tsx`,
`reminders-editor.tsx`, `new-service-button.tsx`).

- Tarjetas con hasta 4 badges cada una (SV1), precio con el mismo peso que la duración (SV2), switch
  "Activo" que salta la tarjeta de sección sin transición (SV3). Apagar el switch **saca el servicio
  del menú del bot al instante**, sin aviso.
- El formulario (Sheet) mezcla checkboxes y switches, y tiene un checkbox "Servicio activo"
  duplicado con el switch de la tarjeta. Ojo: `saveServiceAction` hace `active: parsed.active ??
  true`; si ese checkbox desaparece del form sin más, **guardar un servicio pausado lo reactiva**.

**Mensajes** (`/mensajes`: `mensajes-view.tsx`, HU-011). Bandeja de lo que dejan los pacientes con la
opción "Hablar con la nutricionista". Tabla de 5 columnas dentro de una tarjeta que repite el título
(ME4), filtro Pendientes / Respondidas / Todas (ME1), "Abrir WhatsApp" con `wa.me/<phone>` (para un
`@lid` no abre ningún chat) y "Marcar como respondida" (sin deshacer; no existe la acción inversa).
La fila desaparece de golpe (ME2). Se actualiza sola cada 30 s, más un botón "Actualizar".

**Pagos** (`/pagos`: `page.tsx`, `payments-table.tsx`, `manual-payment-*.tsx`).

- Tres StatTiles (Cobrado este mes, Pendiente de confirmar, Pagos del mes) y una tabla de 8 columnas
  con buscador, segmentado y **dos `<select>`** (medio y tipo) en una sola barra (PG2).
- Solo muestra el **mes en curso**; no hay forma de ver septiembre. El mes se calcula con la hora
  del servidor (`new Date(now.getFullYear(), now.getMonth(), 1)`), no con la zona horaria de la
  profesional.
- "Registrar pago" (modal): un `<select>` con turnos **`CONFIRMED`** de ±7 días. Un turno ya marcado
  como completado (lo normal si cobra al terminar la consulta) **no aparece**. El monto arranca
  vacío aunque el precio del turno (`priceSnapshot`) ya llega al formulario y no se usa.
- Lenguaje: "Acreditado", "Pendiente de confirmar", "Manual", "Total".

**Avisos** (`/avisos`: `avisos-view.tsx`, `broadcast-form.tsx`, `actions.ts`).

- Arriba, "Comunicado a todos los pacientes" (textarea + "Enviar a los N pacientes", botón negro
  igual a cualquier "Guardar": AV1). La confirmación dice "No se puede deshacer". **N es
  `prisma.patient.count()` y el envío va a todos los `Patient`**, incluidos los 5 `@newsletter`
  (canales de WhatsApp, no personas) que 017c ya oculta de la lista de pacientes. El número que ve
  en Avisos no coincide con el de Pacientes.
- Abajo, "Cola de mensajes": tabla con estado, tipo, destinatario (**dígitos crudos del JID**, sin
  nombre), mensaje, error técnico (`lastError` tal cual), fecha, "Reintentar" y "Reintentar N
  fallidos". El mapa de tipos (`kindLabel`) cubre 5 de los 10 valores de `MessageKind`: `PLAN_PDF`,
  `PAYMENT_LINK`, `CONFIRMATION_REQUEST`, `PREP_INSTRUCTIONS` y `ANTHROPOMETRIC_REPORT_PDF` **se ven
  con el nombre interno en inglés**.
- "En vivo / Pausar" con punto animado; se refresca cada 8 s.
- `AvisosView` tiene `readOnly` y `BroadcastForm` tiene `sendAction` inyectable "para la página de
  prueba" (no hay ninguna página que los use hoy en esta rama). Útiles para verificar sin enviar.

**Asistente** (`/asistente`: `assistant-chat.tsx`, `actions.ts`). Chat con IA (DeepSeek) que **solo
lee**: buscar paciente, resumen de paciente, turnos entre fechas, facturación. Estado vacío en una
caja grande (AS3), burbujas que aparecen de golpe (AS1), textarea fijo en una barra con borde (AS2).
La conversación vive en memoria y se pierde al cambiar de página. El aviso de que es IA está solo en
el subtítulo (AS4).

**Ajustes** (`/ajustes` y `/ajustes/whatsapp`).

- Pestañas verticales (General, Bot de WhatsApp, Google Calendar, PDF) con barrita negra (AJ1).
- **Un solo `<form>` oculto** (`SettingsFormProvider`) junta los campos de General, Firma y matrícula
  y Estilo del PDF, que viven en pestañas distintas: "Guardar ajustes" en General **también guarda
  lo que se tipeó en PDF**, y viceversa. Los switches (bot activo) aplican al instante; el resto,
  con botón (AJ2).
- Lenguaje técnico a la vista: "Formato IANA, ej: America/Argentina/Buenos_Aires", "Código ISO de 3
  letras", `549XXXXXXXXXX`, "'primary' o el ID de otro calendario tuyo", "Falta configurar la clave
  de la IA en el servidor (`DEEPSEEK_API_KEY`)", y en `/ajustes/whatsapp` "Verificá que el proceso
  esté corriendo (`npm run dev:bot`)".
- Selectores de archivo nativos para firma y logo (AJ3). "Quitar" el logo no pide confirmación (la
  firma sí).
- "Estilo del PDF: Color y pie de página del PDF del plan": desde 017c-4 el color también se usa en
  el informe antropométrico.
- Cuando el bot está desconectado, "Ver QR y vinculación" es un botón secundario chico (AJ5).

### 1.2 Por qué hace falta

1. En el celular el calendario no se puede leer, y en la notebook el gris tapa lo importante.
2. Sacar un turno obliga a tipear un teléfono con formato técnico, y un error renombra o duplica a
   una paciente, o hace que la confirmación no llegue.
3. Hay acciones que mandan WhatsApp o cambian lo que ofrece el bot con un solo clic o con un botón
   igual a "Guardar": cancelar turno, comunicado a todas, pausar un servicio, borrar un bloque.
4. Lenguaje técnico y nombres internos a la vista (IANA, ISO, `primary`, `PLAN_PDF`, `npm run`).
5. Muchas acciones con el mismo peso y filtros que no hacen falta.

### 1.3 Qué es lo nuevo

1. **Calendario usable en cualquier ancho**: barra propia en un renglón (‹ Hoy › + título +
   segmentado Día/Semana/Mes), vista Día en el celular, horas fuera de atención livianas, **deep
   link `?fecha=` que abre ese día en vista Día** y la URL que acompaña lo que se ve.
2. **Sheet del turno simple**: estado y acciones en palabras ("Vino a la consulta", "No vino"),
   "Ver ficha", WhatsApp, teléfono con formato, "Cancelar turno" con mesura, **confirmación +
   Deshacer** (el aviso al paciente sale recién cuando vence el plazo).
3. **"Nuevo turno" eligiendo a la paciente** de una lista con buscador; paciente nueva con teléfono
   en formato libre y vista previa de a dónde llega la confirmación; el horario tocado en la grilla
   queda elegido.
4. **Disponibilidad como lista por día**, con bloques que se editan, sin superposiciones, y borrados
   con confirmación + Deshacer. Excepciones en palabras ("No atiendo todo el día" / "No atiendo un
   rato" / "Atiendo en otro horario") y solo las próximas a la vista.
5. **Servicios** con el precio destacado, una línea de resumen en vez de badges, transición
   activo ↔ pausado y "Deshacer" al pausar.
6. **Mensajes, Pagos y Avisos** como listas en lenguaje simple: "Ya respondí" con Deshacer, pagos por
   mes, comunicado con vista previa, confirmación + Deshacer y solo a personas, cola con nombres y
   tipos en castellano.
7. **Asistente** con sugerencias tocables y un composer que crece.
8. **Ajustes** como listas agrupadas (estilo Ajustes de iOS), cada grupo guarda lo suyo, sin jerga
   técnica, selector de archivo propio, y el estado del WhatsApp con la acción obvia cuando está
   desconectado.

No cambia el esquema, ni el bot, ni los textos que manda el bot. Ver Fuera de alcance.

---

## 2. Criterios de aceptación

Agrupados por entrega (sección 7). Las pruebas que escriben usan datos propios y los borran por id;
**ninguna prueba manda WhatsApp a números reales** (sección 6).

### 2.1 Entrega 017b-1: calendario, turno y nuevo turno

```gherkin
Feature: Agenda del día de un vistazo

  Background:
    Given la profesional está logueada en el panel
    And hay turnos confirmados, completados y "no vino" esta semana

  Scenario: Barra del calendario en un renglón
    When la profesional abre "Calendario" en 1366, 768 o 390 px
    Then ve en un solo renglón: "‹", "Hoy", "›", el título del período y un control segmentado "Día | Semana | Mes"
    And cada control mide al menos 44 px de alto en pantallas táctiles
    And "‹" y "›" tienen nombre accesible ("Día anterior" / "Semana anterior" / "Mes anterior" y sus "siguiente")

  Scenario: Vista según el dispositivo
    Given una pantalla de 390 px
    When la profesional abre "Calendario" sin "?vista="
    Then ve la vista "Día" de hoy, con los turnos legibles (nombre y servicio)
    Given una ventana de 1366 px
    When la profesional abre "Calendario" sin "?vista="
    Then ve la vista "Semana"

  Scenario: El horario de atención se ve primero
    When la profesional mira la vista Semana o Día
    Then las horas dentro del horario de atención se ven en blanco
    And las horas fuera de atención tienen un tono apenas distinto, más liviano que los bloques de turnos
    And los turnos se distinguen por el color del servicio como hoy

  Scenario: Abrir el calendario en un día desde la ficha
    Given la paciente tiene un turno el jueves 9 de octubre a las 10:00
    When la profesional toca la tarjeta "Próximo turno" de su ficha
    Then se abre "/?fecha=2026-10-09"
    And el calendario muestra la vista "Día" del jueves 9 de octubre, en cualquier ancho
    And el turno de las 10:00 está a la vista sin scrollear

  Scenario Outline: Fechas inválidas en la URL
    When la profesional entra a "/?fecha=<valor>"
    Then el calendario abre en hoy, en la vista que corresponde al ancho, sin mensaje de error

    Examples:
      | valor      |
      | 2026-13-40 |
      | mañana     |
      |            |

  Scenario: La URL acompaña lo que se ve
    Given la profesional está en la vista Día del 9 de octubre
    When recarga la página o vuelve con "Atrás" desde la ficha de una paciente
    Then sigue viendo la vista Día del 9 de octubre
    And moverse entre días o semanas no agrega entradas al historial del navegador

  Scenario: Resumen del día en palabras
    Given hoy hay 6 turnos: 4 vinieron, 1 no vino y 1 todavía no llegó
    When la profesional mira la franja de resumen
    Then lee "Hoy: 6 turnos · queda 1" y "Esta semana: 18 turnos" (ver D8)
    And "Próximo turno" dice "Hoy, 16:30 · Brenda Yebara · Control" con el nombre, o el teléfono con formato si no tiene nombre

  Scenario: Turnos con nombre o teléfono con formato
    Given un turno de una paciente sin nombre con teléfono "5493515552345"
    When la profesional lo ve en el calendario
    Then el turno dice "+54 9 351 555-2345 · Control"
    And si la paciente es un contacto que no muestra el número, dice "Sin nombre · Control"

  # --- Sheet del turno ---

  Scenario: Detalle del turno confirmado
    When la profesional toca un turno confirmado
    Then se abre el panel del turno sin tapar el calendario (como hoy)
    And ve el nombre en grande, "Jueves 9 de octubre, 10:00", el servicio, el precio y el estado "Confirmado" con ícono y texto
    And ve el teléfono con formato y los botones "Ver ficha" y "WhatsApp", con ícono y texto
    And para un contacto que no muestra el número ve "WhatsApp no muestra el número" y no ve el botón "WhatsApp"
    And la acción principal es "Vino a la consulta" (azul, 44 px); "No vino" y "Enviar recordatorio" son secundarias

  Scenario: Marcar que vino
    When la profesional toca "Vino a la consulta"
    Then el estado pasa a "Vino" y ve "Listo. Se creó su consulta." (o "Listo." si ya existía)
    And la acción principal pasa a ser "Abrir la consulta"

  Scenario: Motivo editable con texto
    When la profesional mira el motivo del turno
    Then hay un botón "Editar motivo" con ícono y texto (no solo un lápiz)

  Scenario: Cancelar un turno con confirmación y Deshacer
    When la profesional toca "Cancelar turno"
    Then ve "¿Cancelar el turno de Brenda Yebara?" con el texto "Le avisamos por WhatsApp que se canceló el turno del jueves 9 de octubre a las 10:00."
    And el botón seguro ("Volver") tiene el foco y el botón rojo dice "Cancelar turno"
    When confirma
    Then el turno desaparece del calendario al instante
    And ve "Turno cancelado. Le avisamos a Brenda en unos segundos." con "Deshacer" durante 8 segundos
    When toca "Deshacer" dentro de esos 8 segundos
    Then el turno vuelve al calendario, no se cancela y no se encola ningún WhatsApp
    And ve "Listo, el turno sigue en pie"

  Scenario: Si nadie toca Deshacer
    Given la profesional confirmó "Cancelar turno"
    When pasan los 8 segundos o cierra el aviso
    Then el turno queda cancelado y se encola el aviso de cancelación, igual que hoy
    And si falla, ve "No se pudo cancelar el turno. Probá de nuevo." y el turno vuelve a verse

  Scenario: Cancelar no compite con la acción principal
    When la profesional mira el panel de un turno confirmado
    Then "Cancelar turno" está al final, separado, como texto rojo (no un botón rojo lleno) (ver D6)

  Scenario: Estados con las mismas palabras que la ficha
    When la profesional ve un turno completado o ausente en el calendario, su panel o la leyenda
    Then lee "Vino" o "No vino" (no "Completado" ni "No asistió")
    And el botón para volver atrás dice "Volver a confirmado"

  # --- Nuevo turno ---

  Scenario: Nuevo turno para una paciente que ya existe
    When la profesional toca "Nuevo turno"
    Then lo primero que ve es "¿Para quién?" con un buscador ("Buscá por nombre o teléfono") y el cursor en él (con puntero fino)
    When escribe "brenda" y elige "Brenda Yebara"
    Then la paciente queda elegida, con su teléfono con formato y "Cambiar"
    And al crear el turno no se modifica el nombre ni el teléfono de Brenda

  Scenario: Nuevo turno para una paciente nueva
    When la profesional busca un nombre que no existe y toca "Paciente nueva"
    Then ve dos campos: "Nombre y apellido" y "WhatsApp"
    When escribe "351 555 2345" en "WhatsApp"
    Then debajo lee "La confirmación le llega al +54 9 351 555-2345" (ver D4)
    And si el número ya es de una paciente, ve "Ese número es de María José Gómez" con el botón "Elegir a María José"

  Scenario: Elegir servicio, día y hora
    Given la paciente ya está elegida
    When elige el servicio "Control" y el día
    Then ve los horarios libres como botones de al menos 44 px, con la hora en grande
    And los atajos "Hoy" y "Mañana" junto al selector de día
    And el botón "Crear turno" está deshabilitado hasta que haya horario, con el texto "Elegí un horario"

  Scenario: El horario tocado en la grilla queda elegido
    Given la vista Semana
    When la profesional toca la franja del martes a las 15:00 y elige un servicio que tiene ese horario libre
    Then el turno nuevo arranca con el martes y las 15:00 ya elegidos

  Scenario: Aviso de WhatsApp al crear
    When la profesional está por crear el turno
    Then lee "Le mandamos la confirmación por WhatsApp" junto al botón "Crear turno"
    And al crear ve "Turno creado para Brenda Yebara, jueves 9 de octubre, 10:00"

  Scenario: Registrar un pago desde el turno (ver D9)
    Given un turno confirmado o completado sin pago total registrado
    When la profesional toca "Registrar pago" en el panel del turno
    Then se abre "Registrar pago" con ese turno ya elegido y el precio del turno como monto
```

### 2.2 Entrega 017b-2: disponibilidad y servicios

```gherkin
Feature: Cambiar mi horario y mis servicios sin miedo

  Background:
    Given la profesional atiende lunes de 9 a 13 y de 15 a 19, y miércoles de 9 a 13

  Scenario: Horario semanal como lista por día
    When la profesional abre "Disponibilidad"
    Then ve una lista con los siete días, de lunes a domingo
    And cada día dice sus horarios en palabras: "Lunes: de 9:00 a 13:00 y de 15:00 a 19:00", o "No atendés" si no tiene
    And cada día tiene "Agregar horario"
    And no hay scroll horizontal en 390 px

  Scenario: Agregar un horario
    When toca "Agregar horario" en el martes
    Then se abre un panel con "Desde" y "Hasta" (inputs de 44 px) y el martes elegido
    When elige de 9:00 a 13:00 y toca "Guardar"
    Then ve "Listo, el martes atendés de 9:00 a 13:00" y el martes lo muestra

  Scenario: Editar un horario
    When toca el horario "de 15:00 a 19:00" del lunes
    Then se abre el mismo panel con esas horas, el botón "Guardar" y "Borrar este horario"
    When cambia "Hasta" a 20:00 y guarda
    Then el lunes dice "de 9:00 a 13:00 y de 15:00 a 20:00"

  Scenario: Horarios que se superponen
    When intenta guardar el lunes de 12:00 a 16:00
    Then ve, junto a los campos, "Se superpone con el horario de 9:00 a 13:00. Cambiá las horas o editá ese horario."
    And no se guarda nada
    And si ya había horarios superpuestos cargados de antes, el día los marca con "Se superponen" y un enlace para editarlos

  Scenario: Borrar un horario con confirmación y Deshacer
    When elige "Borrar este horario" en el lunes de 15:00 a 19:00
    Then ve "¿Borrar el horario del lunes de 15:00 a 19:00?" con el texto "El bot deja de ofrecer turnos en ese horario. Los turnos ya dados no se cancelan."
    When confirma
    Then el horario desaparece y ve "Horario borrado" con "Deshacer" durante 8 segundos
    And si toca "Deshacer", el horario vuelve como estaba

  Scenario: Excepciones en palabras
    When la profesional toca "Agregar excepción"
    Then elige entre "No atiendo todo el día", "No atiendo un rato" y "Atiendo en otro horario"
    And solo ve "Desde" y "Hasta" si eligió una de las dos últimas
    And el campo "Motivo (opcional)" tiene el ejemplo "Feriado, congreso…"

  Scenario: Solo las excepciones que vienen
    Given hay 3 excepciones pasadas y 2 próximas
    When la profesional mira "Excepciones"
    Then ve las 2 próximas, la más cercana primero, con fecha en palabras ("Lunes 12 de octubre · No atendés · Feriado")
    And debajo "Pasadas (3)", cerrado

  Scenario: Borrar una excepción
    When elige "Borrar" en una excepción
    Then ve la confirmación con la fecha en palabras y, al confirmar, "Excepción borrada" con "Deshacer" durante 8 segundos

  # --- Servicios ---

  Scenario: Tarjeta de servicio clara
    When la profesional abre "Servicios"
    Then cada servicio muestra el nombre, el precio en grande y la duración ("45 min")
    And en una sola línea gris lo que hace el bot: "Pide seña · Manda recomendaciones · Pide motivo · Recordatorio 24 h antes"
    And un botón "Editar" con ícono y texto

  Scenario: Pausar un servicio
    When la profesional apaga "Lo ofrece el bot" en un servicio
    Then la tarjeta se ve pasar a la sección "Pausados" (sin desaparecer de golpe)
    And ve "Servicio pausado: el bot ya no lo ofrece" con "Deshacer" durante 8 segundos
    When toca "Deshacer"
    Then el servicio vuelve a "Activos" y el bot lo vuelve a ofrecer

  Scenario: Formulario del servicio por partes
    When la profesional edita un servicio
    Then el formulario está dividido en grupos con título: "Datos", "Seña", "Antes del turno", "Recordatorios" y "Al reservar"
    And todos los sí/no son switches (no checkboxes)
    And el precio muestra la moneda y la duración muestra "min"
    And guardar un servicio pausado no lo vuelve a activar

  Scenario: Salir con cambios sin guardar
    Given la profesional cambió el precio en el formulario
    When intenta cerrar el panel
    Then ve "¿Salir sin guardar?" con "Seguir editando" como opción segura
```

### 2.3 Entrega 017b-3: mensajes, pagos y avisos

```gherkin
Feature: Bandejas en palabras simples

  # --- Mensajes ---

  Scenario: Mensajes como lista
    Given hay 3 consultas pendientes
    When la profesional abre "Mensajes"
    Then ve un segmentado "Pendientes (3) | Respondidas"
    And cada consulta muestra el nombre (o "Sin nombre" y el teléfono con formato), cuándo llegó ("Hoy, 22:40" o "hace 2 días"), "Fuera de horario" si aplica y el mensaje completo
    And los botones "Responder por WhatsApp" (con ícono y texto, abre el chat) y "Ya respondí"
    And en 390 px no hay tabla ni scroll horizontal

  Scenario: Contacto que no muestra el número
    Given una consulta de un contacto que no muestra el número
    Then en lugar de "Responder por WhatsApp" lee "Respondé desde tu WhatsApp: este contacto no muestra el número"

  Scenario: Ya respondí, con Deshacer
    When la profesional toca "Ya respondí"
    Then la consulta se ve salir hacia "Respondidas"
    And ve "Marcada como respondida" con "Deshacer" durante 8 segundos
    And el contador de Mensajes de la barra lateral baja cuando vence el plazo
    When toca "Deshacer" a tiempo
    Then la consulta vuelve a "Pendientes" sin haber cambiado en la base

  Scenario: Orden de las consultas
    Then las pendientes van de la más vieja a la más nueva (se atienden en orden)
    And las respondidas, de la más nueva a la más vieja

  # --- Pagos ---

  Scenario: Totales del mes en grande
    When la profesional abre "Pagos"
    Then ve "Cobrado en octubre" con el monto en grande, "Señas esperando pago" y "Cantidad de pagos"
    And el mes se calcula con la zona horaria de la profesional

  Scenario: Ver otro mes
    When toca "‹" junto a "Octubre 2026"
    Then ve los totales y los pagos de septiembre 2026
    And "›" está deshabilitado en el mes en curso

  Scenario: Lista de pagos
    When mira la lista
    Then cada pago muestra paciente, servicio y fecha del turno, el monto en grande a la derecha, y en gris "Seña · Mercado Pago" o "Pago completo · Efectivo o transferencia"
    And el estado se lee "Cobrado" o "Esperando pago", con ícono y texto
    And la barra tiene solo el buscador y un segmentado "Todos | Esperando pago | Cobrados" (ver D11)

  Scenario: Registrar un pago a mano
    When toca "Registrar pago"
    Then elige el turno de una lista que incluye los turnos confirmados y los que ya vinieron de los últimos y próximos 7 días
    And al elegir el turno, el monto se completa con el precio del turno y se puede cambiar
    And el tipo se elige con un segmentado "Pago completo | Seña"
    And al guardar ve "Pago registrado: $ 15.000 de Brenda Yebara"

  # --- Avisos ---

  Scenario: Una acción principal: el comunicado
    When la profesional abre "Avisos"
    Then arriba ve "Mandar un aviso a todas tus pacientes" con el campo de texto
    And abajo "Mensajes que mandó el bot"

  Scenario: Comunicado solo a personas
    Given hay 12 pacientes con WhatsApp y 5 contactos que son canales o grupos
    When la profesional mira el comunicado
    Then lee "Le llega a 12 pacientes por WhatsApp" (sin contar canales ni grupos) (ver D13)
    And el envío no encola mensajes para canales ni grupos

  Scenario: Revisar antes de enviar
    When escribe el aviso y toca "Revisar y enviar"
    Then ve una confirmación con el texto tal como le va a llegar a las pacientes, "Le llega a 12 pacientes" y el botón "Enviar a 12 pacientes"
    And el botón seguro ("Volver a editar") tiene el foco

  Scenario: Deshacer el comunicado
    When confirma el envío
    Then ve "Comunicado listo para enviar a 12 pacientes" con "Deshacer" durante 8 segundos
    And durante esos 8 segundos no hay nada en la cola de mensajes
    When toca "Deshacer"
    Then no se encola nada, el texto vuelve al campo y ve "Listo, no se mandó"
    And si deja vencer el plazo, se encolan los 12 mensajes y el campo se vacía

  Scenario: Cola de mensajes en palabras
    When mira "Mensajes que mandó el bot"
    Then cada fila dice para quién (nombre, o teléfono con formato, o "Vos" si es un aviso para la profesional), qué tipo de mensaje en castellano, cuándo, y el estado "Por enviar", "Enviado" o "No se envió" con ícono y texto
    And ningún tipo aparece con su nombre interno (PLAN_PDF, PAYMENT_LINK…)
    And si no se envió, lee "No se pudo enviar" y un "Ver detalle" con el error técnico

  Scenario: Reintentar sigue pidiendo confirmación
    Given hay 2 mensajes que no se enviaron
    When toca "Reintentar los 2"
    Then ve la confirmación "Se vuelven a mandar por WhatsApp" antes de hacer nada
```

### 2.4 Entrega 017b-4: asistente y ajustes

```gherkin
Feature: Asistente y ajustes sin jerga

  # --- Asistente ---

  Scenario: Empezar con una sugerencia
    When la profesional abre "Asistente" sin conversación
    Then ve tres sugerencias tocables: "¿Qué turnos tengo mañana?", "¿Cuánto cobré este mes?" y "Contame de una paciente"
    When toca "¿Qué turnos tengo mañana?"
    Then la pregunta se manda y aparece como su mensaje

  Scenario: Conversación
    When manda una pregunta
    Then su mensaje aparece a la derecha y "Pensando…" a la izquierda
    And la respuesta reemplaza a "Pensando…" con una entrada suave (fundido con movimiento reducido)
    And el campo de texto crece hasta 5 líneas y queda fijo abajo en el celular

  Scenario: El aviso de IA queda a la vista
    When la profesional usa el asistente
    Then debajo del campo lee "Responde una IA con tus datos. Revisá lo importante en la ficha."

  Scenario: Empezar de nuevo
    Given hay una conversación
    When toca "Nueva conversación"
    Then la conversación se borra sin confirmación (no se guarda en ningún lado)

  # --- Ajustes ---

  Scenario: Ajustes como listas agrupadas
    When la profesional abre "Ajustes" en 1366 px
    Then ve a la izquierda las secciones "General", "Bot de WhatsApp", "Google Calendar" e "Informes en PDF", con la activa marcada con fondo y color
    And cada sección es una o varias listas agrupadas: etiqueta a la izquierda, valor o control a la derecha

  Scenario: Ajustes en el celular
    Given una pantalla de 390 px
    When abre "Ajustes"
    Then ve la lista de secciones; al tocar una, entra a esa sección con "‹ Ajustes" para volver (ver D20)

  Scenario: Cada grupo guarda lo suyo
    Given la profesional cambió la moneda en "General" y el pie de página en "Informes en PDF" sin guardar
    When toca "Guardar" en "General"
    Then se guarda solo la moneda y ve "Guardado"
    And el pie de página sigue sin guardar, y la sección "Informes en PDF" lo marca con "Cambios sin guardar"

  Scenario: Zona horaria y moneda sin jerga
    When mira "General"
    Then la zona horaria se elige de una lista con nombres comunes ("Argentina (Buenos Aires, Córdoba…)") y "Otra…"
    And la moneda se elige de una lista ("Pesos argentinos (ARS)", "Dólares (USD)"…)
    And no ve las palabras "IANA" ni "ISO"

  Scenario: Tu WhatsApp con vista previa
    When escribe "351 555 2345" en "Tu WhatsApp (para avisarte)"
    Then debajo lee "Te avisamos al +54 9 351 555-2345"

  Scenario: Bot desconectado
    Given el bot está desconectado
    When abre "Ajustes" o "Bot de WhatsApp"
    Then ve arriba un aviso rojo "WhatsApp desconectado: el bot no está respondiendo" con el botón principal "Conectar WhatsApp"
    And en la página de vinculación ve los pasos con números grandes y el código QR de al menos 264 px

  Scenario: El bot no arrancó
    Given el bot no está corriendo y no hay código QR
    When la profesional abre la página de vinculación
    Then lee "El bot no está funcionando. Avisale a quien te instaló el sistema."
    And los detalles técnicos están detrás de "Ver detalle técnico"

  Scenario: Sin claves ni identificadores a la vista
    When la profesional recorre "Bot de WhatsApp" y "Google Calendar"
    Then no ve nombres de variables de entorno, comandos ni identificadores técnicos fuera de un "Ver detalle técnico"
    And el calendario de Google dice "Tu calendario principal" salvo que haya elegido otro en "Opciones avanzadas"

  Scenario: Subir firma o logo con selector propio
    When toca "Elegir imagen" en "Firma" o "Logo"
    Then se abre el selector de archivos del sistema
    And al elegir una imagen ve la vista previa y el nombre del archivo antes de "Subir"
    And no ve el texto del navegador "Seleccionar archivo · Sin archivos seleccionados"

  Scenario: Quitar el logo pide confirmación
    When toca "Quitar" en el logo
    Then ve "¿Quitar el logo?" con "Los PDF nuevos salen sin logo." antes de quitarlo

  Scenario: Color del PDF explicado
    When mira "Informes en PDF"
    Then el color dice "Se usa en el PDF del plan y en el informe antropométrico"
```

### 2.5 Transversales (todas las entregas)

```gherkin
Feature: Sin regresiones, sin WhatsApp por error y accesible

  Scenario: Sin cambios en lo que hace el bot
    When se crea, cancela o completa un turno, se cambia el horario, se pausa un servicio o se registra un pago
    Then los datos guardados y los mensajes que encola el bot son los mismos que antes de la HU (salvo el momento del envío por "Deshacer")
    And ningún texto que manda el bot cambia

  Scenario: Zona de imleticio sin cambios de archivo
    When se compara la rama contra develop
    Then no hay cambios en alimentos/**, pacientes/[id]/planes/**, plantillas/**, components/food-picker.tsx ni components/meals-editor.tsx
    And lib/pdf-theme.ts no cambia sus exports (DEFAULT_PDF_ACCENT incluido)

  Scenario: Botones grandes con ícono y texto
    When se recorren las pantallas de esta HU
    Then ningún botón de acción es solo un ícono, salvo cerrar, "‹ ›" del calendario y "…", que tienen nombre accesible y tooltip
    And las acciones principales miden 44 px de alto
    And cada pantalla tiene un solo botón azul lleno

  Scenario: Teclado y lectores de pantalla
    When la profesional usa solo el teclado
    Then puede cambiar de vista y de día en el calendario, abrir un turno, crear uno, cancelar y deshacer, editar un horario, pausar un servicio, marcar un mensaje y enviar (o deshacer) un comunicado
    And el toast "Deshacer" es alcanzable con el teclado y se anuncia

  Scenario: Tres anchos
    When se recorren todas las pantallas de esta HU a 1366, 768 y 390 px
    Then no hay scroll horizontal de página, ni texto cortado sin forma de verlo, ni controles táctiles de menos de 44 px

  Scenario: Movimiento reducido
    Given el sistema tiene "reducir movimiento" activado
    When la profesional cambia de vista, pausa un servicio, marca un mensaje o abre un panel
    Then las transiciones son fundidos cortos, sin desplazamiento ni rebote
```

---

## 3. Datos que se registran

**Ninguno nuevo.** No cambia `schema.prisma` ni hay migraciones. Lo que cambia es **cómo** se escriben
algunos campos existentes:

| Dato | Obligatorio | Uso / cambio |
|---|---|---|
| `Appointment` (crear) | — | "Nuevo turno" puede recibir el **id** de una paciente existente en vez de nombre + teléfono. En ese caso no se toca `Patient.name` (hoy el `upsert` lo pisa). Paciente nueva: igual que hoy, con el teléfono normalizado (D4). |
| `Appointment.status` → `CANCELLED` | — | Igual que hoy, pero la action corre recién cuando vence el "Deshacer" (8 s). El aviso por WhatsApp se encola en ese momento. |
| `AvailabilityRule.startTime` / `endTime` | sí | **Editar** un bloque existente (hoy solo se crea o se borra). Validación nueva: no superponerse con otro bloque del mismo día (D10). |
| `AvailabilityRule` / `AvailabilityException` (borrar) | — | Igual que hoy, diferido 8 s con "Deshacer" y con confirmación. |
| `Service.active` | — | Igual que hoy; "Deshacer" llama a la misma action con el valor anterior. |
| `PatientInquiry.status` → `ANSWERED` | — | Igual que hoy, diferido 8 s con "Deshacer". |
| `Payment` (manual) | — | Igual que hoy; la lista de turnos suma los `COMPLETED` (D9). |
| `OutboundMessage` (comunicado) | — | Igual que hoy, diferido 8 s con "Deshacer", y **solo para contactos persona** (`isPersonJid`, D13). |
| `Professional` (ajustes) | — | Mismos campos; cada grupo guarda solo los suyos (D19). |
| Lecturas nuevas | — | Turnos de hoy por estado (resumen), pagos por mes elegido, nombre del paciente por `toJid` en la cola de avisos, pacientes para el buscador de "Nuevo turno". Solo lectura. |

---

## 4. Diseño UX

Usa los tokens y componentes de 017a y los patrones de 017c. Los textos entre comillas son la
propuesta textual.

### 4.0 Reglas comunes (heredadas de 017c)

- **Una sola acción principal** (botón azul lleno, `lg`, 44 px) por pantalla o panel. El resto,
  `gray`/`tinted`/`plain`.
- **Ícono + texto** en todo botón de acción. Solo ícono: cerrar, "‹ ›" y "…" (nombre accesible +
  tooltip).
- **Confirmación + Deshacer** para lo que borra o lo que le llega a pacientes. Política:

  | Acción | Confirmación | Deshacer (8 s) | Mecanismo |
  |---|---|---|---|
  | Cancelar turno | sí | sí | diferido (la action y el WhatsApp salen al vencer) |
  | Comunicado a todas | sí, con vista previa | sí | diferido |
  | Borrar horario / excepción | sí | sí | diferido |
  | Pausar servicio | no | sí | inmediato + revertir con la misma action |
  | Ya respondí (mensaje) | no | sí | diferido |
  | Quitar logo / firma | sí | no (como la firma hoy) | — |
  | Reintentar mensajes fallidos | sí (como hoy) | no | — |
  | Vino / No vino / Volver a confirmado | no (como hoy, salvo el caso de D3 de HU-003) | no (se vuelve con "Volver a confirmado") | — |

- **Lenguaje simple**: teléfonos con `formatPhone`; contactos `@lid` con `HIDDEN_NUMBER_TEXT` y sin
  botón de WhatsApp (`whatsappChatUrl` devuelve `null`); fechas con `formatAppointmentWhen` /
  `formatTimeAgo`; estados del turno con `APPOINTMENT_STATUS_TEXT`.
- **Listas agrupadas** en el celular en vez de tablas.

### 4.1 Calendario (`/`)

```
Calendario                                                   [ + Nuevo turno ]   ← único filled
Hoy: 6 turnos · queda 1   ·   Esta semana: 18 turnos   ·   Próximo: Hoy, 16:30 · Brenda Yebara · Control

[‹] [Hoy] [›]   Jueves 9 de octubre                     ( Día | Semana | Mes )
┌──────────────────────────────────────────────────────────────────────────────┐
│ 09:00 │ ▌Brenda Yebara · Control                                             │
│ 10:00 │                                                                      │
│  …    │ (fuera de horario: tono muy suave, no gris lleno)                    │
└──────────────────────────────────────────────────────────────────────────────┘
Servicios ● Control ● Antropometría      Estados ● Vino ● No vino
```

- **Barra propia** sobre la API de FullCalendar (`prev`, `next`, `today`, `changeView`, `gotoDate`;
  R10 de la madre). `headerToolbar={false}`. Título en Title 3: "Jueves 9 de octubre" (Día), "6 – 12
  de octubre" (Semana), "Octubre 2026" (Mes). En 390 px el título va en su propio renglón **arriba**
  de los controles si no entra (dos renglones prolijos, no tres partidos), y el segmentado ocupa el
  ancho.
- **Vista por defecto**: Día por debajo de 768 px, Semana desde 768 px (D14 de la madre, resuelta).
  `?vista=dia|semana|mes` la fija.
- **URL**: `?fecha=yyyy-MM-dd&vista=…` con `history.replaceState(null, …)` (el patrón de
  `lib/patient-tab-route.ts` que corrigió la ronda 2 de 017c-2). `?fecha=` sin `?vista=` abre **Día**
  (es lo que pide la ficha). Fecha inválida → hoy, sin error.
- **Horas fuera de atención**: un tinte muy suave (`fill` con baja opacidad o rayado fino), más
  liviano que los bloques de turno. Lo dentro de horario, blanco.
- **Eventos**: "Nombre · Servicio" o "+54 9 351 555-2345 · Servicio" o "Sin nombre · Servicio"
  (`@lid`). Se arma en `/api/appointments`.
- **Resumen**: "Hoy: N turnos · quedan M" (N = confirmados + vinieron + no vino de hoy; M =
  confirmados de hoy que todavía no empezaron) (D8). "Próximo: Hoy, 16:30 · Brenda Yebara · Control".
  Sin turnos: "Sin turnos próximos".
- **Carga**: una barra de progreso indeterminada fina (no un parpadeo: C5) o el skeleton de
  `loading.tsx` actualizado.
- **Swipe de semana en el celular**: fuera (D7 de la madre, opcional; ver D23).

**Panel del turno** (Sheet no modal, como hoy):

```
Brenda Yebara                                        (Title 2)
Control · Jueves 9 de octubre, 10:00                 (secundario)
● Confirmado                                          (ícono + texto)

[ 👤 Ver ficha ]  [ 💬 WhatsApp ↗ ]                    (gray)
+54 9 351 555-2345
Precio        $ 15.000
Motivo        Quiere bajar de peso        [✎ Editar motivo]
Recordatorios Se manda mañana a las 10:00

[ ✓ Vino a la consulta ]                              ← filled, lg
[ ✕ No vino ]  [ 🔔 Enviar recordatorio ]  [ $ Registrar pago ]   (gray / plain)
────────────────────────────────────
Cancelar turno                                        (texto rojo, plain destructive)
Le avisamos por WhatsApp.
```

- Estado "Vino": acción principal "Abrir la consulta"; secundaria "Volver a confirmado". "No vino":
  solo "Volver a confirmado".
- Textos: "Listo. Se creó su consulta." / "Listo." (vino); "Marcado: no vino" (no vino); "Volvió a
  confirmado"; "Recordatorio en camino" / "Ya hay un recordatorio por salir" (enviar ahora).
- **Cancelar** (D5, D6): confirmación "¿Cancelar el turno de {nombre}?" / "Le avisamos por WhatsApp
  que se canceló el turno del {jueves 9 de octubre a las 10:00}." / [Volver] [Cancelar turno].
  Toast: "Turno cancelado. Le avisamos a {nombre de pila} en unos segundos." + "Deshacer". Al
  deshacer: "Listo, el turno sigue en pie". Error: "No se pudo cancelar el turno. Probá de nuevo."
  Key del borrado diferido: `appointment-cancel:<id>`; el evento se oculta de la grilla mientras está
  pendiente.
- **Registrar pago** (D9): abre el modal de Pagos con el turno elegido.

**Nuevo turno** (Modal; en el celular, sheet inferior de 017a):

```
Nuevo turno
1  ¿Para quién?
   [🔍 Buscá por nombre o teléfono            ]
   Brenda Yebara · +54 9 351 555-2345
   Juan Pérez · Sin turno
   [+ Paciente nueva]
2  Servicio      [ Control (45 min)        ▾ ]
3  Día           [Hoy] [Mañana] [ 09/10/2026 📅 ]
   Horario       [09:00] [09:45] [10:30] [11:15] …     (botones de 44 px)
   Motivo (opcional)  …                               "No se le manda a la paciente."
                                   Le mandamos la confirmación por WhatsApp.
                                              [Cancelar]  [ Crear turno ]
```

- Buscador: `matchesPatientQuery` (sin tildes, por dígitos), solo contactos persona (`isPersonJid`),
  hasta 8 resultados, con el próximo turno en gris si tiene. Autofoco solo con puntero fino (D13 de
  017c).
- "Paciente nueva": "Nombre y apellido" + "WhatsApp" con `inputmode="tel"`, formato libre; debajo,
  la vista previa "La confirmación le llega al {formatPhone}". Si el número normalizado coincide con
  una paciente existente: "Ese número es de {nombre}" + [Elegir a {nombre}] (no se renombra).
  Errores inline: "Escribí el nombre", "Revisá el número: tiene que tener código de área".
- Al tocar una franja de la grilla: día y hora preelegidos; si la hora no está libre para el servicio
  elegido, queda solo el día y se lee "A las 15:00 no hay lugar para Control. Elegí otro horario."
- Error de horario tomado: "Ese horario se ocupó recién. Elegí otro." (hoy: "Ese horario ya no está
  disponible. Elegí otro.", se mantiene si el architect prefiere no tocarlo).
- Éxito: "Turno creado para {nombre}, {jueves 9 de octubre, 10:00}".

### 4.2 Disponibilidad (`/disponibilidad`)

```
Disponibilidad                                         [ + Agregar excepción ]   ← filled
Tu horario de todas las semanas y los días especiales.

Horario de todas las semanas
┌ GroupedList ────────────────────────────────────────────────────────┐
│ Lunes      de 9:00 a 13:00  ›   de 15:00 a 19:00  ›   [+ Agregar horario] │
│ Martes     No atendés                               [+ Agregar horario] │
│ Miércoles  de 9:00 a 13:00  ›                       [+ Agregar horario] │
│ …                                                                    │
└──────────────────────────────────────────────────────────────────────┘

Días especiales
┌ GroupedList ────────────────────────────────────────────────────────┐
│ ⊘ Lunes 12 de octubre · No atendés · Feriado                   [ … ] │
│ ◷ Viernes 16 de octubre · Atendés de 14:00 a 18:00             [ … ] │
└──────────────────────────────────────────────────────────────────────┘
▸ Pasadas (3)
```

- **Lista por día en todos los anchos** (D10). Cada horario es un chip/fila tocable (44 px) que abre
  el panel de edición. Desde 1280 px, las dos listas pueden ir lado a lado (horario 2/3,
  excepciones 1/3, como hoy).
- Panel "Horario del {lunes}": Día (segmentado o select), "Desde", "Hasta" (inputs de hora de 44 px,
  nativos), [Guardar] y, si es edición, "Borrar este horario" como texto rojo abajo. Validación
  inline de superposición. Toast: "Listo, el {martes} atendés de 9:00 a 13:00".
- Confirmación de borrar horario: "¿Borrar el horario del {lunes} de 15:00 a 19:00?" / "El bot deja de
  ofrecer turnos en ese horario. Los turnos ya dados no se cancelan." / [Volver] [Borrar horario].
  Toast "Horario borrado" + Deshacer → "Listo, el horario volvió".
- Excepción: segmentado de tres opciones (BLOCKED sin horas / BLOCKED con horas / CUSTOM_HOURS),
  "Fecha", "Desde/Hasta" solo si aplica, "Motivo (opcional)". El
  párrafo explicativo del pie se va: la opción ya dice qué hace. Menú "…" de cada excepción:
  "Borrar". Confirmación "¿Borrar el día especial del {lunes 12 de octubre}?" / "El bot vuelve a usar
  tu horario de todas las semanas ese día." Toast "Excepción borrada" + Deshacer.
- La zona horaria sale de la descripción (se ve en Ajustes).

### 4.3 Servicios (`/servicios`)

```
Servicios                                             [ + Nuevo servicio ]   ← filled
Lo que el bot les ofrece a tus pacientes.

Activos (4)
┌───────────────────────────────┐
│ ● Control                     │
│ $ 15.000          45 min      │   precio en Title 3
│ Pide seña · Recordatorio 24 h │   una línea gris (footnote)
│ [✎ Editar]   Lo ofrece el bot ◉│
└───────────────────────────────┘
Pausados (1)
```

- Switch "Lo ofrece el bot". Al apagar: la tarjeta se desliza a "Pausados" (spring layout de la
  madre), toast "Servicio pausado: el bot ya no lo ofrece" + Deshacer ("Listo, el bot lo vuelve a
  ofrecer"). Al prender: "El bot ya lo ofrece", sin Deshacer.
- Resumen en una línea (de lo que esté activo): "Pide seña ({50 %|$ 5.000})", "Manda
  recomendaciones", "Pide motivo", y el resumen de recordatorios de `serviceRemindersSummary`.
- Formulario por grupos (GroupedList con títulos): **Datos** (nombre, precio con moneda, duración en
  min, color, descripción) · **Seña** (switch "Pide seña para reservar por WhatsApp" + tipo
  segmentado "Porcentaje | Monto fijo" + valor) · **Antes del turno** (switch "Mandar recomendaciones"
  + texto + horas antes) · **Recordatorios** (editor actual con el estilo nuevo) · **Al reservar**
  (switch "Pedir motivo"). El "Servicio activo" del form se reemplaza por el switch de la tarjeta;
  el form manda el valor actual tal cual (no reactiva).
- Guardia de cambios sin guardar con `use-unsaved-changes-guard` (ya existe, 018a).

### 4.4 Mensajes (`/mensajes`)

```
Mensajes                                    Se actualiza sola · [↻ Actualizar ahora] (plain)
Lo que te dejaron con "Hablar con la nutricionista". Respondé desde WhatsApp.

( Pendientes (3) | Respondidas )

┌ Brenda Yebara ─────────────────────── Hoy, 22:40 · ☾ Fuera de horario ┐
│ Hola, quería saber si puedo cambiar el turno del jueves…              │
│ [💬 Responder por WhatsApp ↗]   [✓ Ya respondí]                         │
└───────────────────────────────────────────────────────────────────────┘
```

- Tarjetas (o filas grandes de lista agrupada) sin tabla en todos los anchos. El título de la tarjeta
  contenedora se va (ME4).
- "Responder por WhatsApp" es la acción de cada tarjeta (tinted); "Ya respondí", gray. Con Deshacer
  diferido (D16): key `inquiry-answered:<id>`; la tarjeta sale con animación hacia la pestaña
  "Respondidas" (madre §7). Toast "Marcada como respondida" → "Listo, sigue pendiente".
- Respondidas: "Respondida {hace 2 días}" en gris, sin botones salvo "Abrir WhatsApp" (plain).
- Vacíos: "No tenés mensajes pendientes." / "Acá aparecen las consultas que te dejan con «Hablar con
  la nutricionista»."

### 4.5 Pagos (`/pagos`)

```
Pagos                                                   [ + Registrar pago ]   ← filled
[‹]  Octubre 2026  [›]

 Cobrado en octubre        Señas esperando pago       Cantidad de pagos
 $ 245.000                 $ 0                         17
                           ninguna                     12 Mercado Pago · 5 efectivo o transferencia

[🔍 Paciente o servicio        ]   ( Todos | Esperando pago | Cobrados )      17 pagos

┌ GroupedList ──────────────────────────────────────────────────────┐
│ Brenda Yebara · Control                              $ 15.000     │
│ Turno: jueves 9 de octubre · ✓ Cobrado · Pago completo · Efectivo │
└───────────────────────────────────────────────────────────────────┘
```

- `Metric` para los tres totales. `?mes=yyyy-MM` (D12), límites del mes en la zona horaria de la
  profesional. "Señas esperando pago" sigue siendo "pendientes ahora" (no depende del mes).
- Lista agrupada en todos los anchos (o tabla desde 1280 px si el architect lo prefiere, sin los dos
  selects). Glosario: Acreditado → "Cobrado"; Pendiente → "Esperando pago"; Total → "Pago completo";
  Manual → "Efectivo o transferencia".
- "Registrar pago": "Turno" (select con "Brenda Yebara · Control · jueves 9/10, 10:00 · Vino"),
  "Tipo" (segmentado "Pago completo | Seña"), "Monto" con moneda, precargado con el precio del turno
  al elegirlo (si es seña y el servicio tiene seña configurada, el architect puede precargar la
  seña). Sin turnos: "No hay turnos para asociar. Tiene que haber un turno de la última semana o de
  la próxima."

### 4.6 Avisos (`/avisos`)

```
Avisos
Mandá un aviso a todas tus pacientes y mirá qué mensajes mandó el bot.

Mandar un aviso a todas tus pacientes
┌──────────────────────────────────────────────────────────────┐
│ Ej: La semana que viene estoy de vacaciones, retomo el lunes 22.│
└──────────────────────────────────────────────────────────────┘
Le llega a 12 pacientes por WhatsApp.                  [ 📤 Revisar y enviar ]  ← filled

Mensajes que mandó el bot        ● Se actualiza sola · 0 por enviar   [Pausar]
( Todos | Por enviar | Enviados | No se enviaron (1) )
┌ GroupedList ──────────────────────────────────────────────────────┐
│ ✓ Enviado · Recordatorio de turno · Brenda Yebara      hoy, 10:02 │
│   "Hola Brenda, te recordamos tu turno de mañana…"                │
│ ⚠ No se envió · Comunicado · +54 9 11 2345-6789        ayer, 18:30 │
│   No se pudo enviar. Ver detalle ▾                 [↻ Reintentar] │
└───────────────────────────────────────────────────────────────────┘
```

- **Comunicado** (D13, D14): botón "Revisar y enviar" (filled; el alcance masivo se comunica en la
  confirmación, no con un color raro). Confirmación con el texto en una burbuja tipo WhatsApp, "Le
  llega a {N} pacientes por WhatsApp." / [Volver a editar] [Enviar a {N} pacientes]. Toast diferido:
  "Comunicado listo para enviar a {N} pacientes" + Deshacer → "Listo, no se mandó" (el texto vuelve
  al campo). Al vencer: se encola y el campo se vacía; "Comunicado en camino a {N} pacientes".
- N = contactos persona (`isPersonJid`), igual que la lista de Pacientes de 017c (incluye los `@lid`:
  el bot sí puede mandarles).
- **Tipos en castellano** (tabla completa de `MessageKind`):

  | Valor | Texto |
  |---|---|
  | `CONFIRMATION` | Confirmación de turno |
  | `CONFIRMATION_REQUEST` | Pedido de confirmación |
  | `CANCELLATION` | Cancelación de turno |
  | `REMINDER` | Recordatorio de turno |
  | `PREP_INSTRUCTIONS` | Recomendaciones antes del turno |
  | `PAYMENT_LINK` | Link de pago de la seña |
  | `PLAN_PDF` | Plan de alimentación (PDF) |
  | `ANTHROPOMETRIC_REPORT_PDF` | Informe antropométrico (PDF) |
  | `PROFESSIONAL_ALERT` | Aviso para vos |
  | `AD_HOC` | Comunicado |

- Destinatario: nombre del paciente por `toJid` (lectura), o teléfono con formato, o "Vos" si es el
  `phoneJid` de la profesional, o `HIDDEN_NUMBER_TEXT`.
- Error: "No se pudo enviar." + "Ver detalle" con `lastError` (D15).
- "Reintentar" por fila y "Reintentar los {N}" (con confirmación, como hoy).
- Se conservan `readOnly` y `sendAction` (sirven para verificar sin enviar).

### 4.7 Asistente (`/asistente`)

- Encabezado: "Asistente" + "Preguntale por tu agenda, tus pacientes o lo que cobraste." y, a la
  derecha, "Nueva conversación" (plain, solo si hay mensajes).
- Vacío: tres sugerencias como botones tinted grandes (44 px). "Contame de una paciente" pone "Contame
  de " en el campo y deja el cursor al final (no se manda).
- Burbujas: usuaria a la derecha (tint), asistente a la izquierda (fill). Entrada de la respuesta con
  fundido + desplazamiento corto (madre AS1); con movimiento reducido, solo fundido.
- Composer: textarea que crece (1 a 5 líneas), material de barra; botón "Preguntar" con ícono y texto.
  Ayuda: "Enter manda · Shift + Enter, salto de línea". Aviso fijo: "Responde una IA con tus datos.
  Revisá lo importante en la ficha." (AS4).
- Error: "No pude responder. Probá de nuevo." (inline, con el mensaje de la usuaria conservado).

### 4.8 Ajustes (`/ajustes`, `/ajustes/whatsapp`)

Secciones (≥ 1024 px, índice lateral con el ítem activo en `tint-soft` + texto tint, sin barrita;
< 1024 px, lista de secciones con navegación hacia adentro, D20):

**General**

```
Tus datos
┌──────────────────────────────────────────────────────────┐
│ Zona horaria             Argentina (Buenos Aires…)     ▾ │
│ Moneda                   Pesos argentinos (ARS)        ▾ │
│ Tu WhatsApp (para avisarte)  [351 555 2345          ]    │
│                          Te avisamos al +54 9 351 555-2345│
│ Obras sociales           [OSDE, Swiss Medical…      ]    │
└──────────────────────────────────────────────────────────┘
Los recordatorios se configuran en cada servicio ›         [ Guardar ]
```

**Bot de WhatsApp**

```
⚠ WhatsApp desconectado: el bot no está respondiendo.        [ Conectar WhatsApp ]   (solo si está desconectado)
┌──────────────────────────────────────────────────────────┐
│ Conexión                 ● Conectado                  ›  │  (abre la vinculación)
│ Bot activo                                          ◉    │  "Responde solo cuando escriben turno, menú…"
└──────────────────────────────────────────────────────────┘
Horario de consultas
┌──────────────────────────────────────────────────────────┐
│ Tomar consultas fuera de horario                    ◉    │
│ Atendés consultas de     [09:00]  a  [22:00]             │
└──────────────────────────────────────────────────────────┘
"Fuera de ese horario, el bot toma la consulta y te manda un resumen a las 09:00."   [ Guardar ]
Preguntas con IA
┌──────────────────────────────────────────────────────────┐
│ Responder preguntas con IA                          ◉    │
│ Información para el asistente  [ … ]   1.240 / 2.000     │
└──────────────────────────────────────────────────────────┘
```

- Sin clave de IA: "Esta opción todavía no está disponible. Avisale a quien te instaló el sistema." +
  "Ver detalle técnico" (nombre de la variable).
- "Atendés consultas de X a Y" reemplaza "Desde las / Hasta las" (que hoy es al revés de lo que se
  lee: `attendFrom` = fin de la franja fuera de horario). Mismos campos.

**Google Calendar**: estado (Conectado / Sin conectar) con ícono + texto, [Conectar Google Calendar] o
[Reconectar] + "Desconectar" (plain, con confirmación "¿Desconectar Google Calendar? Los turnos nuevos
dejan de aparecer en tu calendario de Google."). "Calendario: Tu calendario principal" y "Opciones
avanzadas ▸" con el campo del ID. Error de sincronización: "Google dejó de aceptar la conexión.
Reconectá para que los turnos sigan apareciendo." + "Ver detalle técnico".

**Informes en PDF** (antes "PDF"): Firma y matrícula · Firma (imagen) · Logo · Color y pie de página.
Selector de archivo propio: botón "Elegir imagen" (gray) + nombre del archivo + vista previa antes de
"Subir". "Quitar" el logo con confirmación. Color: "Se usa en el PDF del plan y en el informe
antropométrico." Pie: ejemplo sin "NutriBot".

**Guardado** (D19): cada grupo con campos de texto tiene su "Guardar" y guarda **solo** sus campos;
los switches aplican al instante (como hoy). Si una sección tiene cambios sin guardar, su ítem del
índice muestra un punto + "Cambios sin guardar" (texto para lectores de pantalla).

**Vinculación** (`/ajustes/whatsapp`): "‹ Ajustes"; estado grande; pasos con números de 28 px ("Abrí
WhatsApp en tu teléfono", "Tocá **Dispositivos vinculados** → **Vincular un dispositivo**", "Apuntá
la cámara a este código"); QR ≥ 264 px; "Se actualiza sola". Conectado: "Listo, tu WhatsApp está
conectado." + [Volver a Ajustes]. Sin QR: "El bot no está funcionando. Avisale a quien te instaló el
sistema." + "Ver detalle técnico" (`npm run dev:bot`).

### 4.9 Carga y estados vacíos

Actualizar los `loading.tsx` de las 8 rutas al layout nuevo (lista agrupada, barra del calendario).
Cada estado vacío con ícono, título en palabras y, si hay, una acción (`tinted`).

---

## 5. Fuera de alcance

- **Esquema y migraciones**: nada en `schema.prisma`.
- **El bot** (`apps/bot/**`) y **los textos que manda** (confirmación, cancelación, recordatorios).
- **`packages/db/domain`**: no se cambian firmas. Lo nuevo (crear turno con id de paciente, editar
  bloque, pagos por mes) va en actions/páginas de `apps/web` o, si el architect necesita `domain`,
  solo agregando funciones (typecheck en web **y** bot).
- **Zona de imleticio**: `alimentos/**`, `pacientes/[id]/planes/**`, `plantillas/**`,
  `components/food-picker.tsx`, `components/meals-editor.tsx`, `lib/plan-pdf.tsx`; `lib/pdf-theme.ts`
  sin cambiar exports (`DEFAULT_PDF_ACCENT` lo usa Ajustes y se queda).
- **Recetas** (`/recetas`, HU-018a, ya nació con el sistema nuevo), `/dev-diseno`, login, shell y
  sidebar (017a), pacientes y consultas (017c), portal (017d).
- **Vacaciones como rango de días** (una excepción por día, varias de una vez): ver D17.
- Arrastrar turnos para reprogramar, swipe de semana en el celular (D23), turnos `AWAITING_PAYMENT`
  en el calendario, `?turno=<id>` para abrir el panel de un turno por URL.
- Reemplazar FullCalendar o los inputs nativos de fecha/hora por selectores propios.
- Guardar las conversaciones del asistente; cambiar el proveedor de IA o qué datos le llegan.
- Elegir el calendario de Google de una lista (necesita la API de Google).
- Avisar "tenés 3 turnos en ese horario" al borrar un bloque (lectura extra; si interesa, después).
- Modo oscuro (017f), transiciones entre páginas.

---

## 6. Notas de implementación (mínimas; el detalle lo escribe el `architect`)

- Todo en `apps/web`. Lógica pura nueva en `packages/core` con test (como T2 de 017c): normalizar un
  teléfono escrito a mano (D4), texto del horario de un día ("de 9:00 a 13:00 y de 15:00 a 19:00"),
  detectar superposición de bloques, etiquetas de `MessageKind`, resumen de una línea del servicio,
  rango de un mes en una zona horaria.
- **Borrado diferido** (`lib/deferred-delete.ts`): se usa para cancelar turno, borrar horario y
  excepción, "Ya respondí" y el comunicado (que no es un borrado: el "commit" es encolar). Keys
  nuevas: `appointment-cancel:<id>`, `rule:<id>`, `exception:<id>`, `inquiry-answered:<id>`,
  `broadcast:<nonce>`. Si hace falta generalizar el nombre del store, prop opcional (R1 de la madre).
  Evaluar un aviso `beforeunload` mientras haya pendientes de cancelación o comunicado (si se cierra
  la pestaña, **no** se cancela ni se manda; D5, D14).
- `deleteRuleAction` / `deleteExceptionAction` hoy no devuelven resultado: el commit necesita
  `{ ok, error }`.
- `cancelAppointmentAction` ya devuelve `ActionResult`. `markInquiryAnsweredAction` también.
- **Crear turno con paciente existente**: `createAppointmentAction` acepta `patientId` (y entonces no
  llama a `findOrCreatePatient`, para no pisar el nombre). Paciente nueva: teléfono normalizado antes
  de `findOrCreatePatient`.
- **Servicio**: si el form deja de tener "Servicio activo", mandar el valor actual en un hidden (hoy
  `active ?? true` reactivaría).
- **Ajustes**: `SettingsFormProvider` junta 8 campos de 3 secciones en un solo form. Para guardar por
  grupo, separar la action o mandar los campos de los otros grupos con su valor guardado. El
  architect elige.
- **Calendario**: `headerToolbar={false}` + barra propia con `calRef.current.getApi()`. Vista inicial
  por ancho sin desajuste de hidratación (el ancho no se conoce en el servidor: definir el criterio,
  p. ej. `?vista=` o montar FullCalendar después de medir). Escribir `?fecha`/`?vista` con
  `replaceState(null, …)` como `lib/patient-tab-route.ts`.
- `/api/appointments`: título con `formatPhone` / `HIDDEN_NUMBER_TEXT` y estado; los colores de estado
  ya salen de tokens.
- **Avisos**: el conteo y el envío del comunicado filtran con `isPersonJid` (en la action de
  `apps/web`, no en `domain`). La cola necesita el nombre por `toJid` (una consulta `in` sobre
  `Patient.whatsappJid` de los 100 mensajes).
- **Pagos**: `listApprovedPaymentsInRange` ya recibe el rango; solo cambia cómo se calcula.
  `registerManualPayment` no mira el estado del turno: sumar `COMPLETED` es cambiar el `where` de la
  página.
- Componentes a adoptar: `SegmentedControl` (calendario, mensajes, pagos, avisos, tipo de excepción,
  seña, tipo de pago), `GroupedList`, `Metric`, `MoreActionsMenu`, `useConfirm`, `notify.undo`,
  `use-unsaved-changes-guard`.
- **WhatsApp — regla dura** (AGENTS.md): crear turno, cancelar, "Enviar recordatorio", "Reintentar",
  el comunicado y "Vino a la consulta" (no manda, pero cambia estado) **no se aprietan sobre datos
  reales**. Para probarlos: con el bot **apagado**, con un paciente de prueba creado por la prueba
  (JID inventado), y borrando por id las filas de `OutboundMessage`, `Appointment` y `Patient` que
  creó, antes de prender el bot. El comunicado se prueba con `sendAction` inyectado o con
  `readOnly`, nunca con la action real sobre la base de la usuaria (le llegaría a todas).
- **Datos de desarrollo**: recorrido de solo lectura sobre los datos de la usuaria. Editar/borrar
  horarios, excepciones y servicios solo sobre filas creadas por la prueba (ojo: un horario de prueba
  cambia los turnos que ofrece el bot mientras existe; hacerlo con el bot apagado).
- Verificación por entrega: `typecheck` y `test` de `apps/web` (y `core` si se toca), recorrido a
  1366/768/390 px, teclado, movimiento reducido, `git diff develop --stat` sin la zona de imleticio.

---

## 7. Propuesta de corte en entregas

Cuatro PR encadenados, cada uno con su revisión. Una SDD con cuatro fases (como 017c) o cuatro chicas:
lo propone el architect.

| Entrega | Alcance | Por qué en este orden | Tamaño |
|---|---|---|---|
| **017b-1 Calendario y turno** | Barra propia + segmentado, vista Día en el celular, horas fuera de atención livianas, `?fecha=` abre Día + URL que acompaña (cierra Q7), resumen en palabras, eventos con nombre/teléfono, panel del turno (acciones en palabras, Ver ficha, WhatsApp, cancelar con confirmación + Deshacer), "Nuevo turno" con buscador de pacientes y teléfono normalizado, horario preelegido, "Registrar pago" desde el turno. | Es la pantalla de inicio y la que más se usa después de la ficha. Cierra el pendiente de 017c. Permite el recorrido de D1. | L |
| **017b-2 Disponibilidad y servicios** | Lista por día, editar bloque, sin superposiciones, borrar con confirmación + Deshacer, excepciones en palabras y pasadas ocultas; servicios con precio destacado, resumen en una línea, pausar con Deshacer y transición, form por grupos, guardia de cambios. | Las dos pantallas que cambian lo que ofrece el bot: se revisan juntas. | M |
| **017b-3 Mensajes, pagos y avisos** | Mensajes como lista con "Ya respondí" + Deshacer; pagos por mes, lista, glosario, registrar pago con monto precargado y turnos completados; avisos con comunicado revisado, Deshacer y solo personas, cola con nombres, tipos en castellano y error simple. | Las bandejas que leen y escriben la cola del bot: un solo PR para revisar las reglas de WhatsApp. | M |
| **017b-4 Asistente y ajustes** | Sugerencias, composer, aviso de IA; ajustes en listas agrupadas, guardado por grupo, zona horaria y moneda en listas, sin jerga, selector de archivo propio, bot desconectado, vinculación. | Independiente; se usa poco. Puede esperar sin bloquear nada. | M |

---

## 8. Dudas para validar con el usuario

Cada una lleva una recomendación. Ninguna está decidida.

- **D1. La observación de la nutricionista no se hizo** (igual que en 017c).
  *Recomendación:* en el recorrido de 017b-1, tres tareas "como si fuera ella": (1) decir qué turnos
  tiene mañana; (2) sacarle un turno a una paciente que ya existe; (3) cancelar un turno (de prueba)
  y deshacerlo. Anotar dónde duda y ajustar 017b-2/3 antes de su SDD. Queda pendiente validarlo con
  ella.

- **D2. Deep link y URL del calendario.** ¿`?fecha=` abre la vista Día? ¿El calendario escribe la
  fecha y la vista en la URL al navegar?
  *Recomendación:* **sí a las dos**. `?fecha=` sin `?vista=` abre Día (es lo que espera quien viene
  de "Próximo turno"), y `?fecha`/`?vista` se actualizan con `replaceState` para que recargar o
  volver atrás deje el mismo día. Abrir el panel de un turno por URL (`?turno=`) queda fuera.

- **D3. ¿Recordar la última vista elegida** (Día/Semana/Mes) entre visitas?
  *Recomendación:* **no**: por defecto según el ancho (Día en el celular, Semana en la notebook),
  siempre igual. Para esta usuaria es más predecible que una vista que "cambia sola". La URL
  conserva la elección mientras navega.

- **D4. "Nuevo turno": buscar paciente y normalizar el teléfono.** Hoy se tipea nombre + teléfono
  `549…` y un error renombra o duplica a la paciente.
  *Recomendación:* (a) **elegir a la paciente de una lista** con buscador; si ya existe, no se toca
  su nombre. (b) Paciente nueva con teléfono en formato libre: si tiene 10 dígitos (código de área +
  número argentino) se completa `549`; si empieza con `54` sin el `9` del celular, se agrega; con
  `+` y otro código de país, se respeta. Siempre con la vista previa "La confirmación le llega al
  …" para que ella vea a dónde va. Helper en `core` con tests. Si el número ya es de otra paciente,
  se ofrece elegirla.

- **D5. Cancelar turno con "Deshacer".** La cancelación encola un WhatsApp al paciente.
  *Recomendación:* **confirmación + Deshacer diferido** (la cancelación y el WhatsApp salen recién a
  los 8 s). Riesgo: si cierra la pestaña antes, el turno **no** se cancela (falla del lado seguro,
  pero ella cree que lo canceló). Mitigación: aviso del navegador "Hay cambios por terminar" si
  intenta cerrar con una cancelación pendiente, y el toast lo dice ("Le avisamos … en unos
  segundos").

- **D6. ¿Dónde va "Cancelar turno"?** (a) visible al final del panel como texto rojo; (b) dentro del
  menú "…" (como los borrados de 017c).
  *Recomendación:* **(a)**. Cancelar es frecuente (la paciente avisa que no viene) y el panel ya es
  el contexto del turno; esconderlo le costaría encontrarlo. Va separado y sin relleno rojo, así no
  compite con "Vino a la consulta".

- **D7. Palabras del estado del turno.** Hoy: "Marcar completado", "No asistió", "Completado".
  *Recomendación:* las de la ficha (017c): estado "Vino" / "No vino"; botones "Vino a la consulta" /
  "No vino"; leyenda "Vino" / "No vino".

- **D8. Resumen del calendario.** Hoy "Turnos hoy" cuenta solo los confirmados (baja a medida que
  atiende).
  *Recomendación:* "Hoy: N turnos · quedan M" (N incluye los que vinieron y los que no; M, los
  confirmados que todavía no empezaron) y "Esta semana: N turnos" con el mismo criterio.

- **D9. Pagos desde el turno y turnos completados.** El pago manual no deja elegir un turno ya
  marcado "Vino", y el monto arranca vacío.
  *Recomendación:* **sí a las tres**: "Registrar pago" en el panel del turno, la lista de turnos del
  pago manual suma los `COMPLETED`, y el monto se precarga con el precio del turno. Es cambiar un
  filtro y un valor inicial, sin tocar `domain`.

- **D10. Disponibilidad: lista por día o grilla.** Y: ¿se pueden editar bloques? ¿Se impiden las
  superposiciones?
  *Recomendación:* **lista por día en todos los anchos** (como la lista de pacientes de 017c), con
  bloques que **se editan** tocándolos (action nueva en `apps/web`, sin esquema) y **superposición
  bloqueada** con un mensaje que dice con qué choca. Las superposiciones que ya existan se marcan
  "Se superponen" para que las arregle. *Alternativa:* conservar la grilla en escritorio con carriles
  lado a lado; se descarta porque la grilla es justamente lo que confunde (gris, × chicas, hover
  como única pista).

- **D11. Pagos: filtros de medio y tipo.**
  *Recomendación:* **sacarlos de la barra**: con menos de 50 pagos por mes no hacen falta, y el medio
  y el tipo se leen en cada fila. Queda buscador + segmentado. *Alternativa:* moverlos a "Más
  filtros", cerrado.

- **D12. Pagos de otros meses.** Hoy solo se ve el mes en curso, y el mes se calcula con la hora del
  servidor.
  *Recomendación:* **navegación por mes** (‹ Octubre 2026 ›, `?mes=`) y corregir el cálculo a la zona
  horaria de la profesional. Solo lectura.

- **D13. ¿A quién le llega el comunicado?** Hoy a todos los `Patient`, incluidos los 5 canales de
  WhatsApp (`@newsletter`), y el número no coincide con Pacientes.
  *Recomendación:* **solo contactos persona** (`isPersonJid`: teléfonos y `@lid`), el mismo criterio
  y el mismo número que la lista de Pacientes. Es un cambio de comportamiento chico y del lado
  seguro.

- **D14. Comunicado con "Deshacer".**
  *Recomendación:* **confirmación con vista previa + Deshacer diferido** (nada se encola durante 8 s).
  Mismo riesgo y mitigación que D5. Es la acción más grave del panel (le llega a todas): vale la
  segunda red.

- **D15. Errores técnicos en la cola de avisos** (`lastError` en inglés del proveedor).
  *Recomendación:* "No se pudo enviar." a la vista y el error técnico detrás de "Ver detalle" (útil
  para quien le da soporte).

- **D16. "Ya respondí" con Deshacer.** No existe la acción inversa (volver a pendiente).
  *Recomendación:* **diferido** (se marca a los 8 s), sin action nueva. Sacar el filtro "Todas" y
  dejar "Pendientes | Respondidas".

- **D17. Vacaciones (varios días seguidos).** Hoy son N excepciones cargadas una por una.
  *Recomendación:* **HU aparte** (o tarea directa): mostrar y borrar un rango como una sola fila pide
  pensar cómo se agrupan. En esta HU, la excepción se carga más fácil pero sigue siendo de un día.

- **D18. Pausar un servicio.** Hoy el switch "Activo" lo saca del bot sin aviso.
  *Recomendación:* switch **"Lo ofrece el bot"**, secciones "Activos" / "Pausados", y toast con
  Deshacer al pausar (sin confirmación: se revierte con la misma action).

- **D19. Ajustes: un formulario o uno por grupo.** Hoy "Guardar ajustes" de General también guarda lo
  tipeado en PDF.
  *Recomendación:* **cada grupo guarda solo lo suyo**, con su botón, y un punto "Cambios sin guardar"
  en la sección que quedó a medias. *Alternativa:* un solo botón fijo abajo "Guardar cambios" que
  guarda todo y aparece solo cuando hay cambios; se descarta porque mezcla secciones que ella no
  está mirando.

- **D20. Ajustes en el celular.** Hoy son pestañas horizontales que no entran a 390 px.
  *Recomendación:* lista de secciones con navegación hacia adentro ("‹ Ajustes"), como en el iPhone,
  usando `?tab=`.

- **D21. Zona horaria y moneda.** Hoy texto libre con formato técnico (un error rompe todos los
  horarios del bot).
  *Recomendación:* **listas**: zonas de Argentina con nombres comunes primero, más "Otra…" que abre
  la lista completa; monedas ARS, USD, EUR, UYU, CLP, más "Otra…". Mismo dato guardado.

- **D22. Textos técnicos para soporte** (`npm run dev:bot`, `DEEPSEEK_API_KEY`, `primary`, errores de
  Google).
  *Recomendación:* frase en palabras simples ("Avisale a quien te instaló el sistema") y lo técnico
  detrás de "Ver detalle técnico", sin borrarlo.

- **D23. Swipe para cambiar de día o semana en el celular** (opcional en la madre, D7).
  *Recomendación:* **fuera**: FullCalendar no lo trae, pelea con el scroll vertical de la grilla y
  "‹ ›" de 44 px alcanza.

- **D24. El corte en cuatro entregas** (sección 7).
  *Recomendación:* aceptarlo en el orden 017b-1 → 2 → 3 → 4, con el recorrido de D1 después de la
  primera.

---

## Resoluciones (2026-10-04, modo autónomo del orquestador)

El usuario pidió avanzar todas las HU de forma autónoma; se toman las recomendaciones del afinador.

- **D1–D24 aceptadas con su recomendación.**
- **D1:** el orquestador hace las tres tareas en el recorrido de 017b-1 "como si fuera ella" (el turno de prueba se crea
  y se borra por id, sin WhatsApp real: verificar que la cancelación de prueba no deje filas en `OutboundMessage`).
  Queda pendiente del usuario validarlo con la nutricionista.
- **D5/D14:** diferido + aviso del navegador al cerrar con algo pendiente, como se recomienda.
- **D17 (vacaciones por rango):** queda como idea para una HU o tarea aparte; no se abre ahora.
- **D24:** corte aceptado: 017b-1 → 017b-2 → 017b-3 → 017b-4, ramas encadenadas como en 017c.
