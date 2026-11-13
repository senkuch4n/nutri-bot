# HU-013: Motivo de consulta al reservar

**Como** nutricionista (Lic. Daiana Ponce),
**quiero** que el paciente me escriba el motivo de la consulta cuando reserva un turno,
**para que** pueda preparar el turno antes de que llegue (qué estudios pedir, qué plantilla usar,
si es control, deportivo, pediátrico, etc.).

Origen: `docs/historias-usuario-nutridesk.md`, Épica 52 ("Yo como profesional necesito que el
paciente escriba el motivo de consulta al reservar para poder preparar el turno"). La HU-003
(`docs/hu-consulta-entidad-central.md`, D11) ya dejó decidido que el motivo al reservar **va en el
turno** y no en las notas de la consulta.

---

## Contexto

### Qué existe hoy

**Caminos por los que se crea un turno** (todos terminan en `createAppointment`, de
`packages/db/domain/appointments.ts`):

1. **Bot de WhatsApp, opción 1** (`apps/bot/src/conversation.ts`). Pasos de `ConversationState`:
   `MENU` → `BOOK_SERVICE` (elige servicio) → `BOOK_DAY` (elige día) → `BOOK_SLOT` (elige
   horario) → `BOOK_CONFIRM` (resumen con `messages.confirmBooking` y "sí/no"). Con "sí":
   - servicio sin seña: crea el turno `CONFIRMED`, responde `bookingConfirmed` y encola la alerta
     `PROFESSIONAL_ALERT` "🔔 {paciente} sacó un turno de {servicio} para el {fecha} hs."
     (`messages.professionalNewBookingAlert`);
   - servicio con seña (HU-009): crea el turno `AWAITING_PAYMENT`, responde `depositRequired`
     con el link de Mercado Pago. La alerta a la profesional **no** sale acá: sale cuando el pago
     se aprueba, desde `packages/db/domain/payments.ts` (misma función de texto). Si no paga en
     15 minutos, la reserva se libera (`depositExpired`).

   El contexto de la conversación (`Ctx`) guarda `serviceId`, `dayKey`, `slots`, `startsAt`. No se
   crea nada en la base hasta el "sí". Si el paciente deja de responder 20 minutos
   (`BOT_SESSION_TIMEOUT_MIN`), la conversación vuelve a `DORMANT` y no queda nada reservado.
2. **Panel, "Nuevo turno"** (`apps/web/src/app/(panel)/new-appointment-modal.tsx` →
   `createAppointmentAction` en `apps/web/src/app/(panel)/actions.ts`). Campos: nombre,
   teléfono, servicio, día, horario. `createdBy = PROFESSIONAL`, no hay alerta a la profesional.
3. **No hay más caminos.** No existe reprogramar (ni en el bot ni en el panel). La sincronización
   con Google Calendar (`packages/db/domain/gcal.ts`) es de una sola vía: el sistema crea, mueve o
   borra eventos en Google, nunca importa turnos desde Google. La IA de la HU-012 (opción 5) solo
   tiene tools de lectura (`servicios`, `disponibilidad`, `mis_turnos`, `datos_consultorio`) y no
   reserva.

**Modelo de datos** (`packages/db/prisma/schema.prisma`):

- `Appointment` **no tiene ningún campo de texto libre** salvo `cancelReason` (motivo de
  cancelación, no sirve para esto). No hay `notes`, `reason` ni observaciones.
- `Consultation` (HU-003) tiene `notes` (texto libre de la visita, hasta 4000 caracteres) y
  `appointmentId` único: la consulta se crea al marcar el turno como "Completado"
  (`setAppointmentStatus`). Si se vuelve el turno a "Confirmado" y la consulta está vacía
  (`isConsultationEmpty`, que mira las notas), la consulta se borra.
- `ClinicalRecord` (ficha) tiene `background` y `goals`; `Patient` tiene `notes`. Son datos del
  paciente, no de un turno.
- `Service` ya tiene configuración por servicio que cambia el flujo: `requiresDeposit` (seña) y
  `prepInstructions` (recomendaciones previas, se editan en `/servicios`).

**Dónde ve hoy la profesional un turno:**

- **Detalle del turno** en el calendario (`appointment-detail-sheet.tsx`): paciente, teléfono,
  servicio, fecha, precio, estado y acciones. Solo para `CONFIRMED`, `COMPLETED` y `NO_SHOW`.
- **Ficha del paciente**, sección de turnos (`pacientes/[id]/appointments-section.tsx`): tabla
  fecha / servicio / estado.
- **Consulta clínica** (`pacientes/[id]/consultas/[consultationId]/page.tsx`): encabezado
  "Turno · {servicio} · {hora} hs" y el bloque de notas.
- **Alerta por WhatsApp** de turno nuevo (solo cuando lo saca el paciente).
- **`/avisos`**: el outbox, donde se ve el texto completo de cada mensaje enviado, incluidas las
  alertas a la profesional.
- **Google Calendar**: evento con título "{servicio} — {paciente}" y descripción con paciente,
  teléfono y servicio.
- El **portal del paciente** muestra "Tu próximo turno" (fecha, servicio, precio).

**Flujos del bot que conviven con esto:**

- Regla de silencio: en `DORMANT` el bot ignora todo lo que no sea palabra clave (`isWakeWord`).
- En conversación abierta, **antes** del `switch` por paso, el bot aplica `isExitWord` ("chau",
  "salir", "nada mas"… en cualquier parte del mensaje) y `isWakeWord` + "menu" (vuelve al menú).
  Para texto libre eso es un problema: un motivo como "quiero un plan para el menú de la semana"
  o "chau harinas" se interpretaría como comando. La HU-011 (`AWAIT_INQUIRY`) y la HU-012
  (`AWAIT_QUESTION`) lo resolvieron con comandos **estrictos** (`isExitCommand`,
  `isMenuCommand`: el mensaje entero es el comando) y atendiendo su paso antes de esos chequeos.
- `handleIncomingMedia` responde "solo texto" únicamente en `AWAIT_INQUIRY` y `AWAIT_QUESTION`;
  en cualquier otro paso un audio o una foto sin epígrafe se ignoran. Una foto **con** epígrafe
  llega como texto (`whatsapp.ts` toma el `caption`).

### Qué es lo nuevo

1. Un **campo "motivo de consulta" en el turno** (texto libre, opcional, con largo máximo).
2. Un **paso nuevo en la reserva por el bot** que pide el motivo, después de elegir el horario y
   antes del resumen de confirmación; el resumen lo muestra.
3. Configuración **por servicio** de si se pide o no (p. ej. InBody no).
4. El motivo se puede cargar al crear un turno desde el panel, y la profesional lo puede editar.
5. La profesional lo ve en: detalle del turno, alerta de turno nuevo por WhatsApp, consulta
   clínica de ese turno y turnos de la ficha del paciente.

---

## Criterios de aceptación

```gherkin
Feature: Motivo de consulta al reservar

  Background:
    Given el bot está activo y la conversación del paciente está abierta
    And existe el servicio "Primera consulta" con "Pedir motivo al reservar" activado
    And existe el servicio "InBody" con "Pedir motivo al reservar" desactivado

  # --- Bot: camino feliz ---

  Scenario: El paciente escribe el motivo al reservar un servicio sin seña
    Given el paciente eligió "Primera consulta", un día y un horario
    Then el bot le pide el motivo de la consulta con la opción de escribir "saltear"
    When el paciente escribe "Quiero bajar de peso, tengo hipotiroidismo"
    Then el bot le muestra el resumen del turno con la línea "📝 Motivo: Quiero bajar de peso, tengo hipotiroidismo"
    When el paciente responde "sí"
    Then se crea el turno con ese motivo guardado
    And la alerta de turno nuevo a la profesional incluye el motivo

  Scenario: Servicio con seña
    Given "Primera consulta" requiere seña
    And el paciente escribió el motivo y confirmó con "sí"
    Then se crea el turno en "Esperando pago" con el motivo guardado
    And el paciente recibe el link de pago como hoy
    When Mercado Pago aprueba el pago
    Then la alerta de turno nuevo a la profesional incluye el motivo

  Scenario: Servicio que no pide motivo
    Given el paciente eligió "InBody", un día y un horario
    Then el bot pasa directo al resumen de confirmación, como hoy
    And el turno se crea sin motivo

  # --- Bot: salteo, validaciones y comandos ---

  Scenario Outline: El paciente saltea el motivo
    Given el bot le pidió el motivo
    When el paciente escribe "<texto>"
    Then el bot muestra el resumen sin línea de motivo
    And al confirmar, el turno se crea sin motivo

    Examples:
      | texto       |
      | saltear     |
      | Saltear.    |
      | omitir      |
      | no          |
      | -           |
      | prefiero no |

  Scenario: Motivo demasiado corto
    Given el bot le pidió el motivo
    When el paciente escribe "ok"
    Then el bot le repite el pedido explicando que puede escribir "saltear"
    And sigue esperando el motivo

  Scenario: Motivo demasiado largo
    Given el bot le pidió el motivo
    When el paciente escribe un texto de más de 500 caracteres
    Then el bot le pide que lo resuma en un mensaje más corto
    And no guarda nada todavía

  Scenario: Palabras clave dentro del motivo no se toman como comandos
    Given el bot le pidió el motivo
    When el paciente escribe "Necesito un menú para la semana, chau harinas"
    Then se toma como motivo y el bot muestra el resumen

  Scenario: Comandos estrictos en el paso del motivo
    Given el bot le pidió el motivo
    When el paciente escribe exactamente "menú"
    Then el bot muestra el menú y no se reserva nada
    When el paciente vuelve a reservar y escribe exactamente "salir" al pedirle el motivo
    Then el bot se despide como hoy y no se reserva nada

  Scenario: Audio o foto sin texto en el paso del motivo
    Given el bot le pidió el motivo
    When el paciente manda un audio
    Then el bot le responde que por ahora solo puede guardar texto, y que puede escribir "saltear"
    And sigue esperando el motivo

  Scenario: Foto con epígrafe
    Given el bot le pidió el motivo
    When el paciente manda una foto con el epígrafe "Me pidieron un plan para la diabetes"
    Then se toma el epígrafe como motivo (la foto no se guarda)

  Scenario: Responder "no" en el resumen sigue cancelando la reserva
    Given el paciente escribió el motivo y ve el resumen
    When responde "no"
    Then el bot responde como hoy que no reservó nada
    And no queda ningún turno ni motivo guardado

  Scenario: El horario se ocupa mientras escribe el motivo
    Given el paciente eligió un horario y el bot le pidió el motivo
    And otro paciente reservó ese horario mientras tanto
    When el paciente escribe el motivo y confirma con "sí"
    Then el bot responde como hoy que el horario se acaba de ocupar
    And no se crea el turno

  Scenario: El paciente abandona en el paso del motivo
    Given el bot le pidió el motivo
    When pasan 20 minutos sin respuesta
    Then la conversación vuelve a estar dormida y no se reservó nada
    And un mensaje común posterior sin palabra clave no recibe respuesta

  # --- Panel ---

  Scenario: La profesional carga el motivo al crear un turno desde el panel
    Given la profesional abre "Nuevo turno"
    When completa los datos y escribe "Control mensual" en "Motivo de consulta (opcional)"
    And crea el turno
    Then el turno queda con ese motivo
    And el mensaje de confirmación al paciente no cambia

  Scenario: Ver el motivo en el detalle del turno
    Given un turno con motivo "Quiero bajar de peso"
    When la profesional abre el turno en el calendario
    Then ve la fila "Motivo" con el texto completo

  Scenario: Editar el motivo desde el detalle del turno
    Given un turno confirmado
    When la profesional edita el motivo en el detalle y guarda
    Then el turno queda con el motivo nuevo
    And el paciente no recibe ningún mensaje

  Scenario: Ver el motivo en la consulta clínica
    Given un turno con motivo que se marcó como completado
    When la profesional abre la consulta de ese turno
    Then ve el motivo indicado al reservar, de solo lectura, arriba de las notas
    And las notas de la consulta no se modifican

  Scenario: Volver a confirmado no deja consultas fantasma
    Given un turno con motivo marcado como completado, sin mediciones, plan ni notas
    When la profesional lo vuelve a "Confirmado"
    Then la consulta vacía se borra como hoy (el motivo no cuenta como contenido)
    And el motivo sigue en el turno

  Scenario: Ver el motivo en la ficha del paciente
    Given el paciente tiene turnos con y sin motivo
    When la profesional abre la ficha, sección de turnos
    Then los turnos con motivo lo muestran (recortado, con el texto completo al pasar o tocar)
    And los turnos sin motivo muestran "—"

  Scenario: Turnos existentes
    Given turnos creados antes de esta HU
    Then no tienen motivo y en todos lados se ven igual que hoy (o con "—")

  Scenario: Configurar el servicio
    Given la profesional edita el servicio "InBody" en /servicios
    When desactiva "Pedir motivo al reservar" y guarda
    Then las reservas por el bot de "InBody" no piden motivo
    And la tarjeta del servicio ya no muestra la etiqueta "Pide motivo"

  # --- Privacidad ---

  Scenario: El motivo no sale del sistema hacia terceros
    Given un turno con motivo
    Then el evento de Google Calendar no incluye el motivo
    And la herramienta "mis_turnos" de la IA no devuelve el motivo
```

---

## Datos que se registran

| Dato | Obligatorio | Uso |
|---|---|---|
| `Appointment.reason` (texto, hasta 500 caracteres, `trim`; vacío → null) | No | El motivo que escribió el paciente (bot) o la profesional (panel). Se muestra en el detalle del turno, alerta de turno nuevo, consulta clínica y ficha |
| `Service.asksReason` (booleano, default `true`) | Sí (con default) | Si el bot pide el motivo al reservar ese servicio (D4) |
| Motivo en `ConversationState.context` durante la reserva | — | Temporal, entre el paso del motivo y el "sí". No se crea el turno antes |

Los turnos existentes quedan con `reason = null`. Migración solo aditiva (columna nullable y
columna booleana con default). No se distingue "no se pidió" de "lo salteó" (ver D11).

---

## Diseño UX

### Bot de WhatsApp (mensajes propuestos, textuales)

Paso nuevo **`BOOK_REASON`**, entre `BOOK_SLOT` y `BOOK_CONFIRM`, solo si el servicio tiene
`asksReason`.

**Pedido del motivo** (después de elegir el horario):

```
Contame en pocas palabras el *motivo de la consulta* 📝
(por ejemplo: bajar de peso, control, alimentación deportiva, un estudio que te pidieron).

Así la nutricionista puede preparar tu turno. Si preferís no decirlo ahora, escribí *saltear*.
```

**Muy corto** (menos de 3 letras o números, y no es una palabra de salteo):

```
No llegué a entenderlo 🙈. Contame el motivo en unas palabras, o escribí *saltear* si preferís no decirlo.
```

**Muy largo** (más de 500 caracteres):

```
¡Gracias por el detalle! Es un poco largo para guardarlo 😅. ¿Me lo resumís en un mensaje más corto? Lo demás se lo podés contar a la nutricionista en la consulta.
```

**Audio, sticker, documento o foto sin epígrafe:**

```
Por ahora solo puedo guardar texto. ¿Me lo escribís? 🙏 Si preferís no decirlo, escribí *saltear*.
```

**Resumen de confirmación** (`confirmBooking`, con la línea nueva solo si hay motivo):

```
Confirmás este turno?

📋 *Primera consulta*
🗓️ lunes 12 de octubre, 10:00 hs
💲 $25.000
📝 Motivo: Quiero bajar de peso, tengo hipotiroidismo

Respondé *sí* para confirmar o *no* para cancelar.
```

`bookingConfirmed`, `depositRequired`, recordatorios y confirmación de asistencia **no cambian**
(el motivo no se repite al paciente).

**Alerta de turno nuevo a la profesional** (`professionalNewBookingAlert`, desde
`appointments.ts` y desde `payments.ts`), si hay motivo y D7 se acepta:

```
🔔 Ana Pérez sacó un turno de Primera consulta para el lunes 12 de octubre, 10:00 hs.
📝 Motivo: Quiero bajar de peso, tengo hipotiroidismo
```

Si el motivo pasa de 200 caracteres, se corta en 200 con "…" y se agrega "(completo en el panel)".
Sin motivo, la alerta queda igual que hoy.

**Comandos en `BOOK_REASON`:** solo `isExitCommand` (mensaje entero "salir", "chau", etc.) y
`isMenuCommand` (mensaje entero "menú"). Cualquier otro texto, aunque contenga "menú", "turno" o
"chau", es el motivo. Un dígito suelto ("1") cuenta como "muy corto".

**Palabras de salteo** (mensaje entero, normalizado sin acentos ni signos): `saltear`, `salteo`,
`omitir`, `no`, `-`, `ninguno`, `nada`, `prefiero no`, `paso`.

### Panel web

- **Nuevo turno** (`new-appointment-modal.tsx`): debajo del horario, `Textarea` "Motivo de
  consulta (opcional)", máx. 500 caracteres con contador. Se carga aunque el servicio tenga
  `asksReason` apagado (es ella la que escribe).
- **Detalle del turno** (`appointment-detail-sheet.tsx`): fila nueva "Motivo" en la grilla, con
  el texto completo (respeta saltos de línea) o "—". Botón "Editar" (lápiz) que abre un
  `Textarea` en el lugar con "Guardar" / "Cancelar"; feedback `notify.saved("Motivo guardado")`;
  error "No se pudo guardar el motivo." con `FormError`. Editable en cualquier estado del turno.
- **Consulta clínica**: si la consulta viene de un turno con motivo, un bloque de solo lectura
  "Motivo indicado al reservar" arriba de "Notas". Sin motivo, no se muestra nada.
- **Ficha del paciente → Turnos**: columna "Motivo", recortada a una línea con el texto completo
  en `title`/tooltip; "—" si no hay.
- **`/servicios`**: en el formulario del servicio, switch "Pedir motivo al reservar" (ayuda: "El
  bot le pide al paciente que cuente el motivo antes de confirmar el turno."). En la tarjeta, el
  badge "Pide motivo" junto a "Manda recomendaciones previas".
- **Calendario**: el bloque del turno **no** muestra el motivo (espacio y pantalla compartida).

### Portal del paciente

Sin cambios (ver D9).

---

## Fuera de alcance

- Que el paciente cambie el motivo después de reservar (por el bot o el portal). Si quiere
  agregar algo, usa la opción 0 (HU-011).
- Transcribir audios o guardar fotos/documentos como parte del motivo.
- Motivos predefinidos (lista para elegir con números) o categorías/estadísticas de motivos.
- Juntar varios mensajes seguidos en un solo motivo (se toma el primero; ver D6).
- Copiar el motivo a las notas de la consulta (se muestra desde el turno; ver D8).
- Mandar el motivo a Google Calendar o a la IA de la HU-012.
- Retrasar la alerta de turno nuevo en la franja nocturna (ya quedó fuera en la HU-011).
- Reprogramar turnos (no existe hoy).
- Cargar motivos a turnos viejos de forma masiva.

---

## Notas de implementación

- Migración aditiva: `Appointment.reason String?` y `Service.asksReason Boolean @default(true)`.
  Impacta web y bot: `typecheck` en los dos.
- `createAppointment` recibe `reason?: string | null`; las alertas de `appointments.ts` y
  `payments.ts` usan el mismo texto de `packages/core/src/messages.ts`.
- La validación del texto (salteo, corto, largo, normalización) es pura → `packages/core` con
  tests (p. ej. `parseBookingReason(text) → { kind: "skip" | "ok" | "tooShort" | "tooLong" }`).
  El mismo límite de 500 lo usa el panel (zod).
- En `conversation.ts`, `BOOK_REASON` se atiende **antes** de `isExitWord` y del chequeo
  `isWakeWord && menu`, como `AWAIT_INQUIRY`. `handleIncomingMedia` tiene que contemplar el paso
  nuevo. `Ctx` suma `reason`.
- `isConsultationEmpty` **no** debe considerar el motivo (vive en el turno, no en la consulta).
- `gcal.ts` y `runBotAiTool("mis_turnos")` no tocan el campo.
- Prueba del flujo: script tipo `apps/bot/scripts/test-confirm-attendance.ts`, sin Baileys, con
  datos propios borrados por id y sin mensajes reales (las alertas que encole se borran por id).

---

## Dudas para validar con el usuario

Cada duda trae una recomendación del afinador.

**D1. ¿Obligatorio u opcional?**
**Recomendación: opcional, con salteo explícito** (escribir "saltear", "no", "-", etc.). Si es
obligatorio, el paciente que no quiere contarlo por WhatsApp escribe "x" o "consulta" para pasar,
o abandona la reserva; ella pierde un turno por un dato que puede preguntar en la consulta. El
pedido aclara para qué sirve, así que la mayoría lo va a completar.

**D2. ¿En qué momento del flujo del bot se pide?**
Opciones: (a) después de elegir horario y antes del resumen; (b) al principio, apenas elige la
opción 1; (c) después del "sí" (y de la seña).
**Recomendación: (a).** El paciente ya eligió todo y está comprometido; el resumen muestra el
motivo antes de confirmar; el turno se crea en un solo paso con el motivo (no hay turnos a medio
cargar). (b) agrega fricción antes de saber si hay horario. (c) obliga a pedir el texto después
del link de pago o de "turno confirmado", y si no contesta el turno queda sin motivo.
Costo: unos segundos más entre elegir horario y confirmar, en los que el horario se puede ocupar
(ya pasa hoy durante el "sí/no"; responde `SLOT_TAKEN`).

**D3. Largo máximo y audios/fotos.**
**Recomendación: 500 caracteres** (unas 4–5 líneas de WhatsApp); si se pasa, se le pide que lo
resuma (no se corta en silencio). Mínimo 3 letras/números. Audios, stickers, documentos y fotos
sin epígrafe: se le pide que lo escriba; una foto con epígrafe toma el epígrafe. ¿500 le alcanza
a Daiana o prefiere más?

**D4. ¿Para todos los servicios o configurable por servicio?**
**Recomendación: configurable por servicio** (switch en `/servicios`, encendido por defecto en
todos, incluidos los que ya existen). Ella lo apaga en InBody u otros servicios donde no aporta.
Si prefiere que arranque apagado y lo encienda solo en los que quiere, es cambiar el default.
Hay que confirmar con ella en qué servicios lo quiere.

**D5. ¿Se carga también al reservar desde el panel? ¿Lo puede editar ella después?**
**Recomendación: sí a los dos, opcional en el panel.** Cuando un paciente la llama o le escribe y
ella saca el turno a mano, puede anotar el motivo. Editar desde el detalle del turno le sirve para
completar o corregir (p. ej. lo que el paciente le contó por la opción 0). No se notifica al
paciente.

**D6. ¿El paciente puede cambiarlo después? ¿Qué pasa si manda el motivo en varios mensajes?**
**Recomendación: no puede cambiarlo en esta HU**; si quiere agregar algo, usa la opción 0. Se
toma **el primer mensaje** como motivo; si manda un segundo mensaje enseguida, cae en el resumen y
recibe el "Respondé *sí* para confirmar o *no* para cancelar" de hoy. Como el resumen le muestra
el motivo guardado, sabe qué quedó. Juntar mensajes o permitir corregir en el resumen agrega
estados; se puede hacer en otra HU si pasa seguido.

**D7. Privacidad: ¿el motivo va en la alerta de turno nuevo por WhatsApp?** El motivo puede
tener datos de salud ("tengo diabetes", "estoy embarazada"). La alerta va al número de la
profesional (`Professional.phoneJid`) y queda también en `/avisos`.
**Recomendación: sí, recortado a 200 caracteres.** El paciente ya lo escribió por WhatsApp a ese
mismo número; la alerta no lo expone a nadie nuevo, y es justo donde ella lo necesita para
preparar el turno. Si el número de alertas lo ve alguien más (secretaria, teléfono compartido),
la alternativa es una alerta que solo diga "📝 Dejó motivo de consulta (verlo en el panel)".

**D8. ¿Se copia el motivo a las notas de la consulta clínica al completar el turno?**
**Recomendación: no se copia; se muestra de solo lectura en la consulta, leído del turno.**
Copiarlo duplica el dato, hace que la consulta deje de estar "vacía" (`isConsultationEmpty`) y no
se borre al volver el turno a "Confirmado", y mezcla lo que dijo el paciente con lo que escribe
ella. Es coherente con la D11 de la HU-003.

**D9. ¿Dónde se muestra?**
**Recomendación:** detalle del turno, alerta de turno nuevo (D7), consulta clínica (D8) y tabla
de turnos de la ficha. **No** en el bloque del calendario (espacio, y la pantalla puede estar a la
vista de otros), **no** en Google Calendar (es un tercero y el evento puede estar compartido),
**no** en la tool `mis_turnos` de la IA (mandaría datos de salud al proveedor de IA sin
necesidad), y **no** en el portal del paciente (no le agrega nada; se puede sumar después si se
pide).

**D10. ¿Qué pasa con los turnos existentes?**
**Recomendación:** quedan sin motivo (`null`) y se ven como hoy o con "—". Sin backfill. Ella
puede cargar el motivo a mano desde el detalle si quiere (D5).

**D11. ¿Hace falta distinguir "lo salteó" de "no se le pidió"?** (servicio sin motivo, turno del
panel o turno viejo).
**Recomendación: no.** En los tres casos se ve "—". Distinguirlo agrega un campo y no cambia lo
que ella hace con el turno.

**D12. Tono y textos.** Los mensajes de la sección "Diseño UX" (pedido, corto, largo, solo
texto, línea del resumen y de la alerta) son una propuesta.
**Recomendación:** validarlos con Daiana, en especial los ejemplos del pedido ("bajar de peso,
control, alimentación deportiva, un estudio que te pidieron") y si quiere mencionar que el dato
es confidencial (p. ej. agregar "Solo lo ve la nutricionista.").

## Resoluciones (2026-10-02)

El usuario acepta las recomendaciones de D1 a D12 tal como están escritas arriba: D4 con el switch por servicio **encendido por defecto** en todos (incluidos los existentes) y D7 con el motivo **en la alerta de turno nuevo, recortado a 200 caracteres**.
