# HU-011: Consultas fuera de horario (la opción 0 de noche queda en espera hasta la mañana)

**Como** nutricionista (Lic. Daiana Ponce),
**quiero** que, cuando un paciente pide hablar conmigo (opción 0 del bot) después de las 22:00,
el bot no me avise en ese momento: que le tome la consulta y la guarde hasta las 09:00,
**para que** no me escriban de noche por consultas particulares y a la mañana pueda ver en una
lista todo lo que quedó pendiente.

Origen: `hus-last-meet.md`, de la reunión con la nutricionista. El texto del borrador es: "si el
bot de WhatsApp recibe un mensaje pasadas las 22:00 con la opción 0, el mensaje se encola para
que la nutricionista lo pueda ver después cuando esté activa (09:00)". No corresponde a ninguna
épica de `docs/historias-usuario-nutridesk.md`. Lo más cercano es la épica 6, de comunicación
masiva, que va en la otra dirección (de la profesional a los pacientes).

---

## Contexto

### Qué existe hoy

- **Opción 0 del menú** (`apps/bot/src/conversation.ts`, `handleMenu`). Si el paciente responde
  `0`:
  1. El bot le contesta `messages.HANDOFF` (`packages/core/src/messages.ts`): "Perfecto, le aviso
     a la nutricionista y te va a responder por acá lo antes posible. 🙂"
  2. Si en `/ajustes` está cargado "Tu WhatsApp (para las alertas)" (`Professional.phoneJid`),
     encola en `OutboundMessage` un mensaje `kind = PROFESSIONAL_ALERT` dirigido a ese número:
     "🔔 {nombre o teléfono} quiere hablar con vos por WhatsApp." El consumidor del outbox
     (`apps/bot/src/workers.ts`) lo manda en segundos, **a cualquier hora**.
  3. La conversación vuelve al paso `MENU`.
- **No existe un "modo humano" ni un handoff real.** El bot no registra el texto de la consulta ni
  se silencia para ese paciente. Como queda en `MENU`, si el paciente escribe su consulta
  enseguida ("Hola, quería preguntarte si…"), el bot le contesta `NOT_UNDERSTOOD`. Eso sigue
  pasando hasta que vence la sesión, a los 20 minutos (`BOT_SESSION_TIMEOUT_MIN`), y la
  conversación vuelve a `DORMANT`.
- **Dónde ve hoy la profesional esos mensajes: solo en WhatsApp.** Le llega la alerta a su número
  y responde desde su teléfono, en el chat con el paciente. El bot es un dispositivo vinculado
  (Baileys) del número de WhatsApp, y ese número puede ser el personal de ella. En ese caso el
  paciente le escribe a ella directamente y el bot solo "escucha".
- **No se guardan mensajes entrantes en la base.** No hay un modelo de mensajes recibidos,
  conversaciones ni bandeja de entrada. `ConversationState` guarda solo el paso y el contexto del
  menú por `patientJid`. `OutboundMessage` es solo la cola de salida. En el panel, `/avisos`
  muestra ese outbox (pendientes, enviados y fallidos), y ahí figuran las alertas como "Alerta a
  la profesional".
- **El bot no puede impedir que el paciente le escriba al número.** Si el número es el personal
  de ella, cualquier mensaje entra a su WhatsApp igual, de día o de noche. El bot solo puede
  controlar tres cosas:
  1. qué contesta;
  2. si le manda o no la alerta;
  3. qué guarda.

  Los mensajes sin palabra clave (`isWakeWord`: menú, turno, reservar, etc.) el bot los ignora
  por diseño. Para el bot, esos son "mensajes comunes de los contactos de la profesional".
- **Zona horaria:** la toma de `Professional.timezone` (por defecto
  `America/Argentina/Buenos_Aires`, editable en `/ajustes` → General). Los helpers ya existen en
  `packages/core/src/time.ts`: `dayKeyInTz`, `weekdayInTz`, `wallTimeToUtc` y `hhmmToMinutes`.
- **Horarios ya configurables:**
  - `AvailabilityRule`: franjas semanales de **atención de turnos**, en `/disponibilidad`.
  - `AvailabilityException`: feriados, días libres y horarios especiales.

  Las dos son de agenda: definen cuándo se pueden sacar turnos, no cuándo se puede escribir. No
  sirven tal cual para el "horario de mensajes". La franja 22:00–09:00 no coincide con el
  horario de consultorio, y usarlas haría que una consulta a las 14:00 de un día sin turnos
  quedara en espera.
- **Otras alertas nocturnas a la profesional** (`PROFESSIONAL_ALERT`), que hoy también salen a
  cualquier hora:
  - turno nuevo que saca el paciente (`packages/db/domain/appointments.ts`);
  - cancelación por parte del paciente (`appointments.ts`);
  - pago acreditado (`packages/db/domain/payments.ts`).
- **Interruptor global:** con `Professional.botPaused`, el bot no responde nada. No sirve para
  esto porque apaga también los turnos.

### Qué es lo nuevo

1. Una **franja de "fuera de horario" para consultas** (por defecto 22:00–09:00, en la zona
   horaria de la profesional).
2. Dentro de esa franja, la opción 0 cambia de comportamiento:
   - el bot **no** encola la alerta inmediata;
   - le dice al paciente que la nutricionista responde a partir de las 09:00;
   - **le pide que deje escrita su consulta**;
   - **guarda en la base** lo que el paciente escriba.
3. Un **resumen a las 09:00** (fin de la franja) para la profesional, con las consultas que
   quedaron de la noche.
4. Una **lista de consultas** en el panel, para verlas y marcarlas como respondidas.

Fuera de la franja, la opción 0 sigue igual que hoy.

---

## Criterios de aceptación

```gherkin
Feature: Consultas a la nutricionista fuera de horario

  Background:
    Given la franja fuera de horario de consultas es de 22:00 a 09:00 en la zona horaria de la profesional
    And la profesional tiene cargado su WhatsApp para alertas
    And el paciente "Ana" ya tiene nombre y está en el menú del bot

  Scenario: Opción 0 dentro del horario (comportamiento actual, sin cambios)
    Given son las 15:30
    When Ana responde "0"
    Then el bot le responde el mensaje de derivación actual
    And se encola de inmediato una alerta a la profesional "Ana quiere hablar con vos por WhatsApp"
    And no se registra ninguna consulta fuera de horario

  Scenario: Opción 0 fuera de horario: el bot pide la consulta y no alerta
    Given son las 23:10
    When Ana responde "0"
    Then el bot le responde el mensaje de "fuera de horario" que pide escribir la consulta
    And no se encola ninguna alerta a la profesional
    And la conversación de Ana queda esperando el texto de la consulta

  Scenario: El paciente deja su consulta de noche
    Given son las 23:10 y el bot le pidió a Ana que escriba su consulta
    When Ana escribe "¿Puedo cambiar la merienda por una fruta?"
    Then se registra una consulta pendiente de Ana con ese texto y la hora de recepción
    And el bot le confirma que la nutricionista la va a ver a partir de las 09:00
    And no se encola ninguna alerta a la profesional

  Scenario: El paciente manda varios mensajes seguidos
    Given Ana ya dejó una consulta a las 23:10 y su sesión con el bot sigue abierta
    When a las 23:12 escribe "y otra cosa: ¿el yogur puede ser descremado?"
    Then el texto se agrega a la misma consulta pendiente de Ana
    And el bot no vuelve a mandar la confirmación

  Scenario: Al empezar el horario se avisa a la profesional
    Given durante la noche quedaron consultas pendientes de Ana y de Bruno
    When llegan las 09:00
    Then se encola una sola alerta a la profesional con la cantidad de consultas y los nombres
    And la alerta se envía una única vez por noche, aunque el bot se reinicie

  Scenario: Noche sin consultas
    Given durante la noche nadie dejó consultas
    When llegan las 09:00
    Then no se encola ninguna alerta

  Scenario: La profesional ve y resuelve las consultas en el panel
    Given hay consultas pendientes
    When la profesional entra a la lista de consultas del panel
    Then ve cada consulta con paciente, teléfono, hora de recepción y texto completo, de la más vieja a la más nueva
    And puede abrir el chat de WhatsApp del paciente desde la consulta
    When marca la consulta de Ana como respondida
    Then la consulta deja de figurar entre las pendientes
    And el contador de pendientes de la barra lateral baja en uno

  Scenario: El resto del menú funciona de noche
    Given son las 23:10
    When Ana elige "1" (sacar turno), "2" (cancelar), "3" (precios) o "4" (portal)
    Then el bot responde igual que de día

  Scenario: Mensajes sin palabra clave de noche
    Given son las 23:10 y la conversación de Ana está dormida
    When Ana escribe "hola, una consulta" (sin palabra clave)
    Then el bot no responde nada, igual que hoy
    And no se registra ninguna consulta

  Scenario: Cruce de la franja durante la conversación
    Given Ana eligió "0" a las 08:58 y el bot le pidió la consulta
    When escribe su consulta a las 09:01
    Then la consulta igual se registra como pendiente
    And se encola la alerta inmediata a la profesional, como en horario de atención

  Scenario: Bot pausado
    Given la profesional pausó el bot desde /ajustes
    When Ana escribe a las 23:10
    Then el bot no responde ni registra nada, igual que hoy

  Scenario: Sin WhatsApp de alertas cargado
    Given la profesional no tiene cargado su WhatsApp para alertas
    When llegan las 09:00 con consultas pendientes
    Then no se encola ninguna alerta
    And las consultas igual se ven en la lista del panel
```

---

## Datos que se registran

Un registro por consulta fuera de horario. El nombre del modelo lo define el `architect`.

| Dato | Obligatorio | Uso |
|---|---|---|
| Paciente | Sí | Mostrar nombre y teléfono, y armar el link al chat |
| Texto de la consulta | Sí | Lo que escribió el paciente. Si manda varios mensajes en la misma sesión, se concatenan con salto de línea |
| Recibida (fecha y hora del primer mensaje) | Sí | Orden de la lista; la hora se muestra en la zona horaria de la profesional |
| Último mensaje agregado (fecha y hora) | Sí | Saber si siguió escribiendo |
| Estado: pendiente / respondida | Sí | Filtrar la lista y alimentar el contador de la barra lateral |
| Respondida (fecha y hora) | No | Se completa al marcarla como respondida |
| Avisada en el resumen de las 09:00 | Sí | Que el resumen no se repita (idempotencia ante reinicios del bot) |

Configuración de la profesional (si D1 se resuelve como "configurable"):

| Dato | Obligatorio | Uso |
|---|---|---|
| Inicio de la franja fuera de horario (`HH:mm`) | Sí, default `22:00` | Desde cuándo la opción 0 deja de alertar |
| Fin de la franja (`HH:mm`) | Sí, default `09:00` | Cuándo se manda el resumen y se vuelve a alertar en el momento |
| Franja activa (sí/no) | Sí, default sí | Poder apagar la función sin perder el horario |

---

## Diseño UX

### Bot de WhatsApp (mensajes propuestos, textuales)

Opción 0 fuera de horario (reemplaza a `HANDOFF` solo dentro de la franja):

> 🌙 La nutricionista responde consultas de *9:00 a 22:00*.
>
> Si querés, escribime ahora tu consulta en un mensaje y se la dejo para que la vea a primera hora. 🙂
>
> Si era para un turno, escribí *menú* y lo resolvemos ya mismo.

Confirmación después del primer mensaje de la consulta:

> ¡Listo! Le dejé tu consulta a la nutricionista. Te va a responder por acá a partir de las *9:00*. 🙌
>
> Si querés agregar algo más, escribilo ahora.

Los mensajes siguientes de la misma sesión se agregan sin respuesta del bot (ver D7). Las
palabras de salida (`salir`, `chau`…) cierran la conversación con el `DORMANT_BYE` de siempre, y
`menú` vuelve al menú, como hoy.

El horario que se muestra sale de la configuración y no va escrito a mano. Si la franja es
configurable (D1), el texto usa los valores cargados.

Resumen a la profesional a las 09:00 (`PROFESSIONAL_ALERT`, a `phoneJid`):

> 🌙 Anoche te dejaron 3 consultas fuera de horario:
> • Ana Gómez (23:10)
> • Bruno Díaz (00:42)
> • +54 9 11 5555-1234 (07:15)
>
> Las ves completas en el panel → Consultas.

Si el paciente no tiene nombre se usa el teléfono, igual que en las alertas actuales. El texto
completo de cada consulta no va en el resumen (ver D5).

### Panel web

- **Nueva página `/consultas`** en la barra lateral, grupo "Pacientes" o "Gestión" (ver D6), con
  un ícono de bandeja y un **contador de pendientes** al lado del ítem (badge). El contador se
  calcula en el shell, como hoy `getBotShellStatus`, sin romper el layout si la consulta falla.
- Lista (patrón `DataTable` de `/avisos`), de la más vieja a la más nueva:
  - filtro Pendientes / Respondidas / Todas, con Pendientes por defecto;
  - columnas: paciente (link a su ficha), recibida (fecha y hora local), texto (completo, con
    saltos de línea; en mobile, recortado con "ver más");
  - acciones:
    - "Abrir WhatsApp": link `https://wa.me/<teléfono>`, que abre el chat en el teléfono o en
      WhatsApp Web;
    - "Marcar como respondida".
- Estado vacío: "No hay consultas pendientes. Las consultas que te dejen fuera de horario por el
  bot aparecen acá."
- Feedback: toast "Consulta marcada como respondida". Si falla, un toast de error y la fila no
  cambia.
- `/avisos` sigue mostrando el resumen de las 09:00 como "Alerta a la profesional"; no se toca.

### `/ajustes` → pestaña "Bot de WhatsApp" (si D1 = configurable)

- Bloque "Horario de consultas", con este texto: "Fuera de este horario, cuando un paciente elige
  *Hablar con la nutricionista*, el bot le toma la consulta y te la deja para la mañana en vez de
  avisarte en el momento."
  - Interruptor "Activado".
  - Dos inputs de hora: "Desde las" (fin de la franja, por defecto 09:00) y "Hasta las" (inicio,
    por defecto 22:00).
- Validación: horas `HH:mm` válidas y distintas. Una franja que cruza la medianoche (22:00→09:00)
  es el caso normal y es válida. Error inline: "Elegí dos horarios distintos."

---

## Fuera de alcance

- **Bloquear de verdad los mensajes al número.** WhatsApp no lo permite. Si el número es el
  personal de ella, los mensajes entran igual y el bot solo controla qué responde, qué alerta y
  qué guarda.
- Registrar mensajes **sin palabra clave** o fuera del flujo de la opción 0. El bot sigue en
  silencio ante los mensajes comunes (ver D9).
- Audios, fotos, stickers y documentos dentro de la consulta: hoy `whatsapp.ts` descarta lo que no
  tiene texto (ver D8).
- Responderle al paciente **desde el panel**. Ella responde desde WhatsApp, como hoy. No hay
  bandeja bidireccional ni historial de chat.
- Retrasar las **otras** alertas nocturnas (turno nuevo, cancelación, pago) o los mensajes
  automáticos a pacientes (recordatorios, confirmaciones), salvo que D10 diga lo contrario.
- Capturar la consulta también **en horario de atención** (ver D4).
- Feriados y vacaciones con horario de consultas distinto (ver D2).
- Respuestas automáticas con IA a la consulta (es otra HU del mismo `hus-last-meet.md`).

---

## Notas de implementación

Mínimas; el detalle lo escribe el `architect`.

- **Esquema.** Lleva un modelo nuevo para las consultas. Si D1 = configurable, suma también tres
  columnas en `Professional`, con default para que la migración no rompa la fila existente. Al
  tocar `schema.prisma` hay que correr `typecheck` en web **y** bot.
- **`packages/core`.** La lógica "¿este instante cae dentro de la franja?" va como función pura,
  con tests: franja que cruza la medianoche, bordes exactos 22:00 y 09:00, y zona horaria. Ahí
  van también los textos nuevos, en `messages.ts`, junto a `HANDOFF`.
- **`apps/bot/src/conversation.ts`.**
  - Hace falta un paso nuevo en `STEP`, por ejemplo uno que espere la consulta.
  - La opción 0 decide según la franja.
  - El registro de la consulta va en `packages/db/domain`. Lo usa el bot, y el panel lo lee y lo
    actualiza.
  - El timeout de sesión de 20 minutos ya define hasta cuándo se agregan mensajes a la misma
    consulta.
- **Resumen de las 09:00.** Un cron del bot (`workers.ts`) chequea si terminó la franja y hay
  consultas sin avisar, encola un `PROFESSIONAL_ALERT` y marca las consultas como avisadas, todo
  en una transacción. También tiene que correr en `runStartupJobs`, por si el bot estuvo caído a
  las 09:00.
- **Pruebas.** Un script tipo `apps/bot/scripts/test-confirm-attendance.ts` que simule la
  conversación con la hora inyectada, sin Baileys. Crea su paciente, `ConversationState`,
  consultas y filas de `OutboundMessage`, y los borra **por id**. Nunca manda WhatsApp real.

---

## Dudas para validar con el usuario

Cada duda trae una recomendación del afinador.

**D1. ¿La franja 22:00–09:00 es fija o configurable desde `/ajustes`?**
**Recomendación:** configurable en `/ajustes` → "Bot de WhatsApp", con default 22:00–09:00 y un
interruptor para apagarla. Son tres columnas y dos inputs, y evita un deploy si ella decide
cambiar a 21:00 o a 08:30. Una sola franja para todos los días (ver D2).

**D2. ¿Fines de semana y feriados?** ¿El sábado y el domingo, o un feriado, son "fuera de
horario" todo el día, o rige la misma franja nocturna?
**Recomendación:** en esta HU, la misma franja todos los días, incluidos fines de semana y
feriados. Que el fin de semana entero cuente como fuera de horario (con el resumen el lunes a las
09:00) es razonable, pero suma una grilla por día de la semana y la relación con
`AvailabilityException`. Si ella lo pide, que sea una HU aparte. Hay que preguntarle a Daiana si
el sábado y el domingo responde consultas.

**D3. ¿Qué responde el bot de noche?** ¿Que le diga al paciente que deje la consulta (propuesta
de este documento), o solo "la nutricionista responde de 9 a 22" sin tomar nada?
**Recomendación:** pedir y guardar la consulta, con los textos de la sección "Diseño UX". Es lo
que pide el criterio del borrador ("el mensaje se encola para que lo vea después") y es lo que
hace útil la lista. Hay que validar el tono y los emojis de los textos con Daiana.

**D4. ¿La captura de la consulta también de día?** Hoy, de día, el paciente elige 0, el bot le
dice "le aviso", y si el paciente escribe su consulta en los 20 minutos siguientes el bot le
contesta "no entendí". Es un defecto actual.
**Recomendación:** de día, mantener la alerta inmediata (sin cambios en lo que recibe ella),
pero tomar la consulta igual que de noche, que también va a la lista. Así se arregla el "no
entendí" y la lista queda como bandeja única. Si se prefiere tocar solo la noche, la alternativa
mínima es que, de día, después del 0 el bot no conteste "no entendí" durante la sesión.

**D5. Aviso de las 09:00: ¿cómo y con qué contenido?**
Opciones:
(a) un solo WhatsApp de resumen a `phoneJid`, con nombres y horas (propuesta);
(b) un WhatsApp por consulta, con el texto completo;
(c) sin WhatsApp, solo el contador en el panel.
**Recomendación:** (a). Un solo mensaje, sin el texto de las consultas, para no repetir datos
clínicos en otro chat; el texto completo está en el panel. Ojo: si `phoneJid` es el mismo número
del bot, el mensaje se lo manda a sí mismo. Hay que confirmar qué número tiene cargado hoy en
"Tu WhatsApp (para las alertas)".

**D6. ¿Dónde vive la lista en el panel?**
**Recomendación:** una página nueva, `/consultas`, en el grupo "Pacientes" de la barra lateral,
con contador de pendientes. Las alternativas son una pestaña dentro de `/avisos` (pero esa es la
cola de salida, y mezclaría entrantes con salientes) o una sección en la ficha de cada paciente.
Esta última suma bien como complemento, pero no reemplaza a la lista general.

**D7. Varios mensajes del mismo paciente.**
**Recomendación:** todo lo que escriba dentro de la misma sesión del bot (hasta 20 minutos de
inactividad, o hasta que diga "salir") se agrega a la **misma** consulta, y el bot confirma solo
el primero. Si vuelve a elegir 0 más tarde, en la misma noche, se agrega a su consulta pendiente
si existe, en vez de crear otra. Así la lista tiene una fila por paciente y por noche.

**D8. Audios y fotos.** Muchos pacientes mandan audios. Hoy el bot los descarta sin avisar.
**Recomendación:** fuera de alcance guardar el audio. Sí conviene que, si el bot está esperando la
consulta y llega algo sin texto, responda: "Por ahora solo puedo guardar mensajes de texto.
¿Me la escribís? 🙏". Eso requiere que `whatsapp.ts` pase al handler los mensajes sin texto (hoy
los corta antes). A validar si entra en esta HU.

**D9. Mensajes que le llegan directo, sin pasar por la opción 0.** Si el paciente escribe de
noche "hola, una duda" (sin palabra clave), el bot no responde y el mensaje queda en el WhatsApp
de ella, como hoy.
**Recomendación:** dejarlo así en esta HU. El bot no puede bloquearlos, y contestarle a todo
mensaje nocturno rompería la regla de "silencio ante mensajes comunes" (el número puede ser el
personal de ella, con familia y amigos). Si ella quiere un aviso automático para cualquier
mensaje nocturno de un paciente conocido, es otra HU. Hay que confirmar con Daiana que lo que
le molesta es la alerta del bot y no los mensajes directos.

**D10. Turnos, confirmaciones y otras alertas de noche.**
**Recomendación:** el menú (sacar o cancelar turno, precios, portal) sigue funcionando de noche,
y los recordatorios y pedidos de confirmación a pacientes siguen como están. Hay que decidir
aparte si las **alertas a la profesional** por turno nuevo, cancelación o pago acreditado también
esperan a las 09:00. Se recomienda dejarlas inmediatas en esta HU: son informativas y la
profesional puede silenciar el chat de alertas. Si se quiere, que sumen una línea al resumen de
las 09:00 en una HU posterior.

**D11. ¿Qué significa "respondida" y quién la marca?**
**Recomendación:** la marca ella a mano desde la lista. El sistema no puede saber si le
respondió por WhatsApp desde el teléfono, porque el bot ignora los mensajes `fromMe`. Sin
archivado automático: las respondidas quedan visibles con el filtro "Respondidas".

**D12. Privacidad y retención.** Las consultas pueden tener datos de salud y quedan guardadas en
la base, cosa que hoy no pasa con ningún mensaje entrante.
**Recomendación:** guardarlas sin vencimiento, como el resto de la ficha, y que se borren junto
con el paciente (cascade). A confirmar con el usuario.

## Resoluciones (2026-10-02)

El usuario acepta las recomendaciones de D1 a D12 tal como están escritas arriba.
