# HU-014: Recordatorios según el tipo de turno

**Como** nutricionista (Lic. Daiana Ponce),
**quiero** que la cantidad de recordatorios y su anticipación dependan del servicio del turno (por
ejemplo, un control: 1 semana antes; una primera consulta: 2 días antes y 24 hs antes),
**para que** falten menos pacientes sin mandarles más mensajes de los necesarios.

Origen: `docs/historias-usuario-nutridesk.md`, Épica 50 ("Recordatorios según el tipo de turno").
Notas de la épica: "hoy hay un solo `reminderLeadHours` y una confirmación 3 días antes (Épica 8).
Configurable por servicio."

---

## Contexto

### Qué existe hoy

Antes de cada turno, el bot puede mandar **tres mensajes automáticos**, cada uno con su propio
cron en `apps/bot/src/workers.ts` y su propia función en `packages/db/domain/reminders.ts`. Los
tres usan solo los turnos `CONFIRMED`.

| Mensaje | `MessageKind` | Cuándo sale | Configuración | Función / cron |
|---|---|---|---|---|
| **Recordatorio** | `REMINDER` | `Professional.reminderLeadHours` antes (default 24, rango 1–168) | **Una sola para todos los servicios**, en `/ajustes` ("Aviso previo del recordatorio (horas)") | `enqueueDueReminders`, cada 15 min, ventana de 20 min |
| **Pedido de confirmación de asistencia** (Épica 8) | `CONFIRMATION_REQUEST` | 72 h antes, valor **fijo en el código** | Ninguna | `enqueueAttendanceConfirmations`, cada 30 min, ventana de 30 min |
| **Recomendaciones previas** | `PREP_INSTRUCTIONS` | `Service.prepLeadHours` antes (1–168 h) | **Por servicio**, en `/servicios` (checkbox "Mandar recomendaciones antes del turno" + texto + "Horas antes") | `enqueuePrepInstructions`, cada 15 min |

Además, `runStartupJobs` corre las tres funciones al arrancar el bot.

**Textos actuales** (`packages/core/src/messages.ts`):

- `reminderMessage`: "⏰ Hola {nombre}! Te recuerdo tu turno: 📋 {servicio} 🗓️ {fecha y hora} hs.
  Si no podés asistir, escribí *menú* y elegí la opción 2 para cancelar." No dice "mañana" ni
  "en una semana": pone la fecha absoluta.
- `confirmAttendanceRequest`: "¿Vas a poder venir a tu turno? 📋 {servicio} 🗓️ {fecha} hs.
  Respondé *sí* si vas a venir o *no* si no vas a poder." Al encolarlo, además se marca
  `Appointment.confirmationRequestedAt` y se pone la conversación del paciente en
  `CONFIRM_ATTENDANCE` (pisando la conversación que tuviera abierta). Con "sí" se guarda
  `confirmationResponse = true`; con "no" se **cancela el turno** (`cancelAppointment`, por el
  paciente) y se le avisa que se liberó. Desde el PR #12 (`5ec7660`) un "sí"/"no" tardío (pasados
  los 20 min de sesión) sigue valiendo si el mensaje entero es una respuesta clara
  (`lateAttendanceAnswer` en `packages/core/src/wake.ts`). Si el paciente **no responde**, no
  pasa nada (la parte de la Épica 8 que avisa a la profesional no está hecha), y la respuesta
  tampoco se muestra en el panel (`confirmationResponse` no se lee en `apps/web`).
- `prepInstructionsMessage`: "📋 Recordatorio para tu turno de {servicio} 🗓️ {fecha} hs. Antes de
  venir: {recomendaciones}".

**Cómo se evita duplicar.** `OutboundMessage` tiene `@@unique([appointmentId, kind])`: **un turno
puede tener como mucho un mensaje de cada tipo**. Los crons además filtran
`messages: { none: { kind } }`, y `enqueueMessage` se traga en silencio el error de unicidad
(`P2002`). Consecuencia directa para esta HU: **hoy es imposible guardar dos `REMINDER` para el
mismo turno**, que es justamente lo que pide la primera consulta (2 días y 24 hs). El modelo de
datos tiene que cambiar.

**Turnos reservados con poca anticipación.** El recordatorio y el pedido de confirmación usan una
ventana fija ("el turno empieza entre ahora+N h y ahora+N h+20/30 min"): si el turno se reservó
cuando ese momento ya había pasado, **ese mensaje no sale nunca**. Lo mismo si el bot estuvo
apagado durante la ventana. Las recomendaciones previas, en cambio, ya se corrigieron
(`38169b9`): salen para todo turno futuro que ya entró en sus `prepLeadHours` y no las recibió,
aunque se haya reservado tarde.

**Botón "Enviar recordatorio ahora"** (detalle del turno en el calendario,
`appointment-detail-sheet.tsx` → `sendReminderNowAction` → `enqueueReminderNow`): encola un
`REMINDER` con el mismo texto. Por la restricción única tiene dos efectos laterales hoy:

1. Si el turno ya tenía su recordatorio automático, el botón **no manda nada** pero el panel dice
   "Recordatorio encolado." (el error de unicidad se ignora).
2. Si se usa antes del automático, el automático **ya no sale** (el cron ve que hay un `REMINDER`).

**Servicios cargados hoy** (consultado en solo lectura en la base de desarrollo, 2026-10-02):

| Servicio | Activo | Recomendaciones previas |
|---|---|---|
| Primera consulta + Antropometría | sí | 24 h |
| Primera consulta + InBody + plan alimentario | sí | 24 h |
| Control + Antropometría | sí | 24 h |
| Control + InBody | sí | 24 h |
| Antropometría | sí | 24 h |
| InBody | sí | 24 h |
| Primera consulta, Consulta de seguimiento, Antropometría (duplicado) | no | — |

No hay un "tipo de consulta" (control / primera consulta) como dato: es parte del nombre del
servicio. Por eso la configuración va **por servicio**, como pide la épica, y no por "tipo".
`reminderLeadHours` está en 24. Hoy, para cualquier servicio activo, un paciente recibe: pedido
de confirmación a las 72 h, y a las 24 h el recordatorio **y** las recomendaciones (dos mensajes
casi juntos).

**Configuración por servicio de referencia.** El form de `/servicios` (`service-form.tsx`) ya
tiene dos opciones por servicio que cambian lo que hace el bot: recomendaciones previas
(`prepInstructions` + `prepLeadHours`) y, desde la HU-013, "pedir motivo de consulta"
(`asksReason`, con su badge en `service-card.tsx`).

**Franja fuera de horario (HU-011).** `Professional.afterHoursStart/End` (22:00–09:00) solo cambia
el comportamiento de la opción 0 del bot (consultas a la profesional). Ningún mensaje saliente
automático la respeta hoy: los recordatorios salen N horas exactas antes del turno, a cualquier
hora.

**Reprogramar** no existe (ni en el bot ni en el panel, confirmado en la HU-013). Un turno se
cancela y se saca otro. Los turnos con seña (HU-009) nacen `AWAITING_PAYMENT` y pasan a
`CONFIRMED` al pagarse; los crons solo miran `CONFIRMED`.

### Qué es lo nuevo

1. Cada servicio define **su propia lista de recordatorios** (por ejemplo, "7 días antes" o "2
   días antes" + "24 h antes"), en `/servicios`.
2. Un turno puede recibir **más de un recordatorio**, cada uno una sola vez.
3. Una regla explícita para los recordatorios cuyo momento **ya pasó** cuando se reservó el turno
   (o mientras el bot estaba apagado).
4. El texto del recordatorio dice **cuándo es** en lenguaje natural ("mañana", "pasado mañana",
   "en una semana").
5. Definir qué pasa con `Professional.reminderLeadHours`, con el pedido de confirmación de 3 días
   y con el botón "Enviar recordatorio ahora" (ver Dudas D1–D9).

---

## Criterios de aceptación

Los escenarios se escriben con las **recomendaciones** de la sección Dudas. Si el usuario elige
otra opción, el escenario afectado se ajusta al validar.

```gherkin
Feature: Recordatorios configurables por servicio

  Background:
    Given la zona horaria de la profesional es America/Argentina/Buenos_Aires
    And el servicio "Control + InBody" tiene un recordatorio "7 días antes"
    And el servicio "Primera consulta + Antropometría" tiene los recordatorios "2 días antes" y "24 horas antes"

  Scenario: Configurar los recordatorios de un servicio
    Given estoy editando el servicio "Control + InBody" en /servicios
    When cambio sus recordatorios a "7 días antes" y guardo
    Then el servicio queda con un único recordatorio de 7 días
    And la tarjeta del servicio muestra "Recordatorio: 7 días antes"

  Scenario: Un servicio sin recordatorios
    Given estoy editando el servicio "InBody"
    When quito todos sus recordatorios y guardo
    Then los turnos de "InBody" no reciben ningún recordatorio automático
    And el pedido de confirmación de asistencia y las recomendaciones previas siguen funcionando como antes

  Scenario: Validaciones del formulario
    Given estoy editando un servicio
    When cargo dos recordatorios con la misma anticipación
    Or cargo una anticipación fuera de rango (menos de 1 hora o más de 14 días)
    Or cargo más de 3 recordatorios
    Then el formulario no se guarda y muestra el error junto al campo

  Scenario: Control, un solo recordatorio una semana antes
    Given un paciente tiene un turno CONFIRMED de "Control + InBody" el martes 13/10 a las 17:00
    And el turno se reservó el 01/10
    When llega el momento del recordatorio de 7 días
    Then el bot le manda un único recordatorio que dice que el turno es "en una semana"
    And no le manda ningún recordatorio 24 horas antes

  Scenario: Primera consulta, dos recordatorios
    Given un paciente tiene un turno CONFIRMED de "Primera consulta + Antropometría" el jueves 15/10 a las 10:00
    And el turno se reservó el 01/10
    When llega el momento del recordatorio de 2 días
    Then recibe un recordatorio que dice que el turno es "pasado mañana"
    When llega el momento del recordatorio de 24 horas
    Then recibe otro recordatorio que dice que el turno es "mañana"
    And en /avisos figuran los dos recordatorios del turno

  Scenario: Cada recordatorio sale una sola vez
    Given un turno ya recibió su recordatorio de 2 días
    When el cron vuelve a correr (o el bot se reinicia) dentro de la misma ventana
    Then no se encola un segundo recordatorio de 2 días para ese turno

  Scenario: Turno reservado cuando el momento de un recordatorio ya pasó
    Given el servicio "Primera consulta + Antropometría" tiene recordatorios a 2 días y a 24 horas
    And un paciente reserva hoy a las 12:00 un turno para pasado mañana a las 10:00 (faltan 46 horas)
    Then el recordatorio de 2 días no se manda (su momento ya había pasado al reservar)
    And el recordatorio de 24 horas sale normalmente

  Scenario: Turno reservado con menos anticipación que todos los recordatorios
    Given un paciente reserva hoy un turno de "Primera consulta + Antropometría" para mañana a las 9:00
    Then no recibe ningún recordatorio automático
    And la confirmación de la reserva (que ya incluye fecha y hora) es su único aviso

  Scenario: El bot estuvo apagado en el momento de un recordatorio
    Given un turno existía antes del momento de su recordatorio de 24 horas
    And el bot estuvo apagado cuando llegó ese momento
    When el bot vuelve a arrancar y faltan más de 2 horas para el turno
    Then manda el recordatorio pendiente
    But si para entonces ya corresponde un recordatorio posterior del mismo turno, manda solo el más cercano al turno

  Scenario: Turno cancelado o que no está confirmado
    Given un turno fue cancelado (por el paciente, por la profesional o por un "no" a la confirmación)
    Or el turno está AWAITING_PAYMENT
    When llega el momento de un recordatorio
    Then no se manda

  Scenario: Turno con seña que se paga después del momento de un recordatorio
    Given un turno con seña se reservó cuando su recordatorio de 2 días todavía no había llegado
    And el pago se aprobó (el turno pasó a CONFIRMED) después de ese momento
    Then ese recordatorio no se manda
    And los recordatorios posteriores salen normalmente

  Scenario: Servicio desactivado
    Given un servicio se desactiva en /servicios
    And tiene turnos futuros CONFIRMED
    Then esos turnos siguen recibiendo sus recordatorios

  Scenario: Cambio de configuración con turnos ya agendados
    Given un turno de "Control + InBody" para dentro de 10 días
    When cambio los recordatorios del servicio a "2 días antes"
    Then ese turno recibe el recordatorio de 2 días (se usa la configuración vigente al momento de enviar)
    And los recordatorios que ya se habían mandado no se repiten

  Scenario: Recordatorios de días a un horario razonable
    Given un recordatorio está configurado en días ("2 días antes")
    And el turno es el jueves a las 8:00
    Then el recordatorio sale el martes a la misma hora del turno, salvo que caiga entre las 22:00 y las 09:00
    And en ese caso sale el martes a las 09:00

  Scenario: Migración sin cambio de comportamiento
    Given antes de esta HU reminderLeadHours era 24
    When se aplica la migración
    Then cada servicio existente (activo o no) queda con un recordatorio "24 horas antes"
    And los turnos ya agendados siguen recibiendo el mismo recordatorio que antes
    And un turno que ya había recibido su recordatorio antes de la migración no lo recibe de nuevo

  Scenario: Enviar recordatorio ahora
    Given un turno CONFIRMED de "Primera consulta + Antropometría" para dentro de 3 días
    When la profesional toca "Enviar recordatorio ahora" en el detalle del turno
    Then se encola un recordatorio inmediato, aunque el turno ya hubiera recibido otros
    And los recordatorios automáticos pendientes del turno siguen saliendo en su momento
    And el panel dice "Recordatorio encolado."

  Scenario: Enviar recordatorio ahora dos veces seguidas
    Given la profesional ya tocó "Enviar recordatorio ahora" y ese mensaje sigue pendiente en la cola
    When lo vuelve a tocar
    Then no se encola un segundo mensaje
    And el panel dice "Ya hay un recordatorio pendiente de envío para este turno."
```

---

## Datos que se registran

| Dato | Obligatorio | Uso |
|---|---|---|
| Recordatorios del servicio: lista de 0 a 3 anticipaciones, cada una con valor + unidad (horas / días) | No (lista vacía = el servicio no manda recordatorios) | Decidir cuándo sale cada recordatorio de los turnos de ese servicio |
| Por cada recordatorio enviado: turno, qué recordatorio de la lista era (su anticipación), fecha de encolado | Sí, cuando se envía | Idempotencia (no mandar dos veces el mismo) y mostrarlo en `/avisos` y en el detalle del turno |
| Recordatorio manual ("Enviar recordatorio ahora") | Sí, cuando se usa | Distinguirlo de los automáticos para que no los bloquee |
| `Professional.reminderLeadHours` | — | Deja de usarse para enviar (ver D4). Su valor solo se usa en la migración |

No se guarda nada del paciente: los recordatorios son mensajes salientes con datos que ya existen
(nombre, servicio, fecha).

---

## Diseño UX

### Panel: `/servicios` (form de alta/edición del servicio)

Bloque nuevo **"Recordatorios"**, debajo de "Mandar recomendaciones antes del turno" (mismo
estilo que ese bloque):

- Texto de ayuda: "El bot le recuerda el turno al paciente por WhatsApp. Podés poner hasta 3."
- Una fila por recordatorio: `NumberInput` (valor) + selector de unidad (**días** / **horas**) +
  botón de quitar. Botón "Agregar recordatorio" (se deshabilita al llegar a 3).
- Servicio nuevo: arranca con un recordatorio "24 horas" (ver D4).
- Si la lista queda vacía: nota gris "Los turnos de este servicio no van a recibir
  recordatorios."
- Errores (junto al campo): "Ya hay un recordatorio con esa anticipación.", "Entre 1 hora y 14
  días.", "Hasta 3 recordatorios por servicio."
- `service-card.tsx`: un badge con la lista, p. ej. "Recordatorios: 2 días y 24 h antes" o "Sin
  recordatorios".

### Panel: `/ajustes`

Se quita el campo "Aviso previo del recordatorio (horas)" y en su lugar queda una línea:
"Los recordatorios se configuran en cada servicio" con link a `/servicios` (ver D4).

### Panel: detalle del turno

- "Enviar recordatorio ahora" se mantiene. Feedback: "Recordatorio encolado." o, si ya hay uno
  manual pendiente, "Ya hay un recordatorio pendiente de envío para este turno." (hoy el botón
  dice "encolado" aunque no encole nada).
- Opcional (ver D8): una línea "Recordatorios: 2 días antes (enviado) · 24 h antes (pendiente)".

### Panel: `/avisos`

Sin cambios de diseño: cada recordatorio enviado aparece como una fila "Recordatorio". Si un
turno tiene dos, aparecen dos filas.

### Bot de WhatsApp (mensajes propuestos, textuales)

Se mantiene el texto actual y se agrega **cuándo es**, calculado por la diferencia de días de
calendario (en la zona horaria de la profesional) entre el envío y el turno, no por la
anticipación configurada:

| Diferencia de días | Frase |
|---|---|
| 0 | "hoy" |
| 1 | "mañana" |
| 2 | "pasado mañana" |
| 7 | "en una semana" |
| otro N | "en N días" |

Texto propuesto:

```
⏰ Hola {nombre}! Te recuerdo que tenés turno {frase}:

📋 {servicio}
🗓️ {fecha y hora} hs

Si no podés asistir, escribí *menú* y elegí la opción 2 para cancelar.
```

Ejemplos:

```
⏰ Hola Ana! Te recuerdo que tenés turno en una semana:

📋 Control + InBody
🗓️ martes 13/10 17:00 hs

Si no podés asistir, escribí *menú* y elegí la opción 2 para cancelar.
```

```
⏰ Hola Ana! Te recuerdo que tenés turno mañana:

📋 Primera consulta + Antropometría
🗓️ jueves 15/10 10:00 hs

Si no podés asistir, escribí *menú* y elegí la opción 2 para cancelar.
```

(El formato exacto de la fecha es el de `formatDateTime` que ya usa el bot; los ejemplos son
ilustrativos.) Si el paciente no tiene nombre cargado, se omite "Hola {nombre}! " como hoy. El
botón "Enviar recordatorio ahora" usa el mismo texto, con la frase calculada en el momento.

---

## Fuera de alcance

- La parte pendiente de la Épica 8: avisar a la profesional cuando el paciente **no responde** al
  pedido de confirmación, y mostrar la respuesta (sí/no) en el panel.
- Unificar el recordatorio de 24 h con las recomendaciones previas en un solo mensaje (ver D7:
  hoy salen dos mensajes casi juntos y esta HU no lo cambia, salvo que el usuario lo pida).
- Reprogramar turnos (no existe). Si se agrega en el futuro, tendrá que recalcular qué
  recordatorios faltan.
- Textos de recordatorio distintos por servicio (texto libre por servicio).
- Recordatorios por otros canales (mail, SMS) o al portal del paciente.
- Que el paciente elija si quiere o no recordatorios.
- Recordatorios que no sean de turnos (p. ej. "hace 30 días que no venís").
- Cambiar los crons de las recomendaciones previas o del pedido de confirmación, salvo lo que
  resulte de D2.

---

## Notas de implementación

Mínimas; el detalle lo define el `architect`.

- La restricción `@@unique([appointmentId, kind])` de `OutboundMessage` impide más de un
  `REMINDER` por turno. Hace falta otra forma de identificar "qué recordatorio" se mandó (p. ej.
  una tabla de envíos por turno + anticipación, o una clave extra en `OutboundMessage`), sin
  romper la idempotencia de los otros `kind`. Ojo: `enqueueMessage` se traga el `P2002`; el
  recordatorio manual no debería depender de eso para decidir qué mostrar en el panel.
- La lógica de "qué recordatorio corresponde ahora" (anticipación en horas/días, corrimiento fuera
  de 22–09, regla de reserva tardía y de bot caído, frase "mañana/pasado mañana") es pura y va en
  `packages/core` con tests. El texto va en `packages/core/src/messages.ts`.
- Conviene que el nuevo `enqueueDueReminders` no use una ventana fija de 20 min (como hoy) sino el
  criterio "momento del recordatorio ya llegó y no se envió", al estilo de `enqueuePrepInstructions`
  después de `38169b9`, con las reglas de los escenarios para no mandar recordatorios viejos.
- Para la regla "el momento ya había pasado al reservar" sirve `Appointment.createdAt`; para los
  turnos con seña, el momento en que el turno pasó a `CONFIRMED` (hoy no se guarda; ver D5).
- Migración: backfill de cada servicio con `Professional.reminderLeadHours` y marcar como ya
  enviado el recordatorio de los turnos que tengan hoy un `OutboundMessage` `REMINDER`, para que
  no se repita.
- Toca web (`/servicios`, `/ajustes`, detalle del turno, `/avisos`) y bot (`workers.ts`), más
  `packages/db/domain/reminders.ts` y el schema: typecheck de los dos procesos.
- La prueba del cron va con un script tipo `apps/bot/scripts/test-confirm-attendance.ts`
  (acotado con `EnqueueScope.patientIds`, datos propios borrados por id, sin WhatsApp real).

---

## Dudas para validar con el usuario

**D1. Forma de la configuración por servicio.**
Opciones: (a) un solo recordatorio por servicio; (b) dos campos fijos ("primer aviso" y "segundo
aviso"); (c) una lista de hasta 3, cada uno en días u horas.
**Recomendación: (c)**, hasta 3, con unidad días u horas, rango 1 hora a 14 días. Cubre "1 semana"
y "2 días + 24 h" sin convertir a mano 168 h, y el tope evita "molestar de más". (Hoy el máximo de
`reminderLeadHours` es 168 h = 7 días; 14 días da algo de margen.)

**D2. Relación con el pedido de confirmación de asistencia (72 h, Épica 8).**
Hoy, para cualquier servicio, el paciente recibe la confirmación a las 72 h. Con la config del
borrador, una primera consulta recibiría: confirmación (72 h) + recordatorio (48 h) + recordatorio
y recomendaciones (24 h) = 4 mensajes. Opciones:
- (a) **Independientes**: la confirmación sigue fija a 72 h para todos, los recordatorios son
  aparte. Es el cambio más chico, pero suma mensajes.
- (b) **La confirmación pasa a ser un recordatorio más del servicio**: cada recordatorio de la
  lista tiene un check "pedir que confirme (sí/no)" (máximo uno por servicio). La migración deja
  cada servicio como hoy (confirmación 3 días + recordatorio 24 h). Así la profesional puede
  configurar, p. ej., primera consulta = "2 días, pide confirmación" + "24 h"; control = "7 días,
  pide confirmación".
- (c) El primer recordatorio de cada servicio siempre pide confirmación y se elimina la de 72 h.
**Recomendación: (b)**. Es lo que mejor cumple "sin molestar de más" y no pierde la Épica 8, que
ya funciona (con el sí/no tardío del PR #12). Si el usuario prefiere el cambio mínimo, (a), y la
unificación queda para otra HU. Pregunta asociada: con (b), ¿confirmar 7 días antes tiene sentido
para un control, o el control debería ser "7 días" (recordatorio) + "3 días, pide confirmación"?

**D3. Valores iniciales de los servicios reales.** El borrador habla de "control" y "primera
consulta", pero los servicios reales son combos ("Control + InBody", "Primera consulta +
Antropometría", etc.) y hay servicios sueltos ("Antropometría", "InBody").
**Recomendación:** la migración no adivina por el nombre: deja todos en "24 h" (como hoy) y la
profesional configura cada uno en `/servicios`. Confirmar: ¿qué recordatorios quiere para
"Antropometría" e "InBody" sueltos? ¿Los "Control + …" van solo con 7 días (sin el de 24 h)?

**D4. Qué pasa con `Professional.reminderLeadHours` y el campo de `/ajustes`.**
Opciones: (a) se elimina el campo de `/ajustes` y la migración copia su valor (hoy 24) a todos los
servicios; (b) queda como "valor por defecto" para servicios sin configuración; (c) queda como
valor inicial de los servicios nuevos.
**Recomendación: (a)**: una sola fuente de verdad (el servicio); un servicio nuevo arranca con
"24 h" en el form. Con (b), "lista vacía" sería ambiguo (¿sin recordatorios o usar el default?).
La columna se puede dejar en la base sin uso y borrarla en otra migración.

**D5. Turno reservado (o confirmado por pago) cuando el momento de un recordatorio ya pasó.**
Opciones: (a) se saltea ese recordatorio; (b) se manda igual en cuanto se pueda; (c) se manda
solo el más cercano al turno de los que quedaron atrás.
**Recomendación: (a)** para reservas tardías: la confirmación de la reserva ya trae fecha y hora,
y un "te recuerdo tu turno" cinco minutos después de reservar molesta. Para turnos con seña, el
"momento de reserva" es cuando se aprobó el pago. Distinto es el **bot caído**: el turno ya
existía y el recordatorio se perdió; ahí recomiendo mandarlo al volver, solo el más cercano al
turno y solo si faltan más de 2 horas. ¿Está bien ese margen de 2 horas?

**D6. A qué hora salen los recordatorios.**
Opciones: (a) siempre N horas/días exactos antes del turno (como hoy); (b) los de "días" salen a
una hora fija (p. ej. 10:00) N días antes; (c) exactos, pero si caen entre las 22:00 y las 09:00
se corren a las 09:00 del mismo día.
**Recomendación: (c)**, solo para los configurados en **días**; los de **horas** salen exactos
(si la profesional pone "2 horas antes" es porque lo quiere a esa hora). Hoy los turnos son en
horario de atención, así que el corrimiento casi nunca aplica. Pregunta asociada: ¿se usa la
franja de la HU-011 (`afterHoursStart/End`, editable en `/ajustes`) o una fija 22–09 propia de
los recordatorios? Recomiendo **fija**: la franja de la HU-011 es de la opción 0 y se puede
apagar, y mezclar los dos conceptos confunde.

**D7. Recordatorio de 24 h y recomendaciones previas de 24 h.**
Hoy todos los servicios activos mandan las dos cosas a las 24 h: dos mensajes casi juntos.
Opciones: (a) dejarlo como está; (b) si un recordatorio y las recomendaciones caen dentro de la
misma hora, mandar un solo mensaje con las dos cosas.
**Recomendación: (a)** en esta HU, para no agrandarla; anotarlo como mejora siguiente. Si para la
profesional es molesto, (b) se suma acá.

**D8. Botón "Enviar recordatorio ahora".**
Hoy no manda nada si ya hubo recordatorio (y muestra "encolado" igual) y, si se usa antes, cancela
el automático. Opciones: (a) el manual es independiente: siempre envía y no afecta a los
automáticos (con freno a doble clic si hay uno manual pendiente); (b) el manual cuenta como "el
próximo automático" y lo reemplaza.
**Recomendación: (a)**. Pregunta asociada: ¿se quiere ver en el detalle del turno qué
recordatorios salieron y cuáles faltan? Recomiendo **sí**, una línea simple, porque con varios por
turno ya no es obvio.

**D9. Cambios de configuración y servicios inactivos.**
Recomendación: (a) los turnos ya agendados usan la configuración **vigente al momento de enviar**
(no se congela al reservar), sin repetir los ya enviados; (b) un servicio desactivado sigue
mandando los recordatorios de sus turnos futuros (el turno sigue en pie). Confirmar ambas.

**D10. Texto del recordatorio.**
Propuesta en "Diseño UX": mismo texto de hoy + "tenés turno {hoy / mañana / pasado mañana / en
una semana / en N días}". Opciones: (a) eso; (b) textos distintos para el primer y el último
recordatorio (p. ej. el de una semana más "informativo" y el de 24 h con "te esperamos"); (c)
dejar el texto actual sin la frase.
**Recomendación: (a)**. ¿La profesional quiere ajustar el tono o agregar algo (dirección,
"traé ropa cómoda", etc.)? Lo específico de cada estudio ya va en las recomendaciones previas.

## Resoluciones (2026-10-02)

El usuario acepta las recomendaciones de D1 a D10 tal como están escritas arriba: D2 (b) la confirmación de asistencia pasa a ser un recordatorio más del servicio con "pide confirmar (sí/no)", máximo uno por servicio, y la migración deja cada servicio como hoy (3 días con confirmación + 24 h); D5 (a) reservas tardías se saltean y, con el bot caído, se manda solo el más cercano si faltan más de 2 h; D7 (a) recordatorio y recomendaciones siguen siendo dos mensajes.
