# HU-019 — Archivar pacientes

**Como** nutricionista que ya no atiende a algunas pacientes (o que tiene contactos cargados por
error o que nunca llegaron a ser pacientes),
**quiero** archivarlas para que dejen de aparecer en mi lista, en el buscador de turnos y en los
comunicados, sin perder nada de su historia,
**para que** mi lista de pacientes muestre solo a quienes atiendo hoy, y pueda recuperar a una
paciente archivada con todo su historial si vuelve.

Origen: pedido de la nutricionista de un "CRUD de pacientes" (borrador del usuario del 2026-10-24).
El alta (PR #44) y la edición ya existen; falta la **baja**. El usuario eligió **archivar** (ocultar
sin borrar) en vez de borrar. Rama: `feat/HU-019-archivar-pacientes`.

---

## 1. Contexto

### 1.1 Qué existe hoy

- **Alta.** Botón «Nuevo paciente» en `/pacientes` (`new-patient-sheet.tsx` +
  `createPatientAction` en `apps/web/src/app/(panel)/pacientes/actions.ts`). Si el teléfono ya es de
  una paciente, no crea nada y ofrece abrir su ficha (`existingId`, texto
  `PATIENT_DIRECTORY_TEXT.phoneTaken`). La paciente nueva de «Nuevo turno»
  (`createAppointmentAction` en `apps/web/src/app/(panel)/actions.ts`) hace lo mismo
  (`existingPatient`).
- **Edición.** «Editar datos» en la ficha (`pacientes/[id]/edit-patient-sheet.tsx`) y «Poner nombre»
  para contactos sin nombre (`setPatientNameAction`).
- **Baja.** No existe. No hay ninguna acción que borre u oculte un `Patient`. `git log` no tiene
  antecedentes de borrado de pacientes; "archivar" solo existe para planes (`ARCHIVED` en enums) y
  recetas (se archivan porque `Restrict` no deja borrarlas).
- **Por qué no se puede borrar.** En `packages/db/prisma/schema.prisma`, `Patient` arrastra en
  cascada (`onDelete: Cascade`) diario, ficha clínica, evolución, consultas, planes, ISAK, consultas
  fuera de horario y preguntas a la IA: borrar se lleva la historia clínica. `Appointment.patient`
  (línea ~413) **no** tiene cascada, así que borrar falla si la paciente tuvo algún turno.
- **Modelo.** `Patient` no tiene hoy ninguna columna de estado (activo/archivado). `whatsappJid` es
  `@unique`: una paciente archivada sigue "ocupando" su número.
- **El bot** encuentra o crea a la paciente por JID en cada mensaje
  (`findOrCreatePatientByJid`, `packages/db/domain/patients.ts`, llamado en
  `apps/bot/src/conversation.ts:170`). El bot hoy no corre en producción (el panel sí: Vercel +
  Neon, `develop` = producción), pero el diseño tiene que contemplarlo.

### 1.2 Lugares que listan o usan pacientes (inventario)

| Lugar | Archivo | Qué hace hoy |
|---|---|---|
| Lista `/pacientes` | `pacientes/page.tsx` + `buildPatientDirectory` (`packages/core/src/patient-directory.ts`) + `patient-directory.tsx` | Trae **todos** los `Patient`; separa "con nombre" y "Por completar" (sin nombre); contador `patientCountLabel` |
| Ficha `/pacientes/[id]` | `pacientes/[id]/page.tsx`, `patient-header.tsx` | Encabezado con nombre, edad, teléfono y «Abrir chat de WhatsApp». No hay menú de acciones sobre la paciente |
| Buscador de «Nuevo turno» | `listAppointmentPatientsAction` (`(panel)/actions.ts`) | Todos los contactos persona |
| Comunicado a todos | `avisos/actions.ts` + `avisos/page.tsx` (`broadcastRecipients`) | Todos los JID persona, sin repetidos |
| Recordatorios / confirmación 3 días antes / indicaciones previas | `packages/db/domain/reminders.ts` | Por turno (`Appointment`), no filtran por paciente |
| Asistente IA `/asistente` | `apps/web/src/lib/assistant-tools.ts` (`buscarPaciente`, `resumenPaciente`) | Busca entre 300 pacientes, sin filtro |
| Consultas fuera de horario `/mensajes` | `mensajes/page.tsx` | Por `PatientInquiry` |
| Portal | `apps/web/src/lib/patient-session.ts` (`getPortalPatient`) + link mágico del bot (opción 4) | Cualquier `Patient` con token válido |
| Bot | `apps/bot/src/conversation.ts` | Atiende a cualquier JID persona |

### 1.3 Qué es lo nuevo

Un estado "archivada" en la paciente, una acción para archivar y otra para desarchivar, y que los
lugares de la tabla anterior respeten ese estado según lo que se defina abajo. Nada se borra.

---

## 2. Criterios de aceptación

> Los escenarios marcados con **[según Dn]** reflejan la **recomendación** de la duda indicada. Si el
> usuario elige otra opción, se reescriben antes de pasar al architect.

```gherkin
Feature: Archivar y desarchivar pacientes

  Background:
    Given la nutricionista está logueada en el panel

  # --- Archivar ---

  Scenario: Archivar una paciente sin turnos pendientes
    Given la paciente "Ana López" no tiene turnos futuros confirmados ni esperando pago
    When abre la ficha de "Ana López", elige "Archivar paciente" y confirma
    Then la paciente queda archivada con la fecha y hora del momento
    And vuelve a la lista de pacientes con el aviso "Ana López quedó archivada" y la opción "Deshacer"
    And "Ana López" ya no aparece en la lista de pacientes
    And su ficha clínica, consultas, evolución, planes, diario y turnos pasados siguen intactos

  Scenario: Deshacer el archivado desde el aviso
    Given acaba de archivar a "Ana López"
    When toca "Deshacer" en el aviso antes de que desaparezca
    Then "Ana López" vuelve a estar activa y aparece en la lista

  Scenario: Cancelar la confirmación
    When elige "Archivar paciente" y en la confirmación toca "Cancelar"
    Then no cambia nada

  Scenario: No se puede archivar con turnos pendientes [según D3]
    Given "Ana López" tiene un turno confirmado el jueves 30/10 a las 10:00
    When elige "Archivar paciente"
    Then ve "Ana tiene un turno el jueves 30/10 a las 10:00. Cancelalo antes de archivarla."
    And un enlace a la pestaña Turnos de su ficha
    And la paciente no se archiva

  Scenario: Un turno que se crea mientras confirma (carrera) [según D3]
    Given la nutricionista abrió la confirmación de archivar a "Ana López"
    And en ese momento se crea un turno futuro para "Ana López"
    When confirma
    Then ve el mismo mensaje de turno pendiente y la paciente no se archiva

  Scenario: Archivar un contacto sin nombre
    Given hay un contacto sin nombre en "Por completar"
    When abre su ficha, elige "Archivar paciente" y confirma
    Then deja de aparecer en "Por completar" y en el contador de la lista

  # --- Ver y recuperar archivadas ---

  Scenario: Ver las archivadas [según D2]
    Given hay 3 pacientes archivadas
    When entra a la lista de pacientes
    Then al final de la lista ve "Archivadas (3)"
    And al tocarlo ve las 3 archivadas, ordenadas por nombre, con la fecha en que se archivaron
    And el buscador también funciona dentro de las archivadas

  Scenario: Ficha de una paciente archivada
    Given "Ana López" está archivada
    When abre su ficha
    Then ve arriba "Paciente archivada el 24/10/2026" con el botón "Desarchivar"
    And puede ver toda su historia como siempre

  Scenario: Desarchivar desde la ficha
    Given "Ana López" está archivada
    When toca "Desarchivar" en su ficha
    Then "Ana López" vuelve a estar activa
    And vuelve a aparecer en la lista, en el buscador de turnos y en los comunicados
    And ve el aviso "Ana López volvió a tu lista de pacientes"

  # --- Dónde no aparece una archivada ---

  Scenario: Fuera del buscador de "Nuevo turno"
    Given "Ana López" está archivada
    When la nutricionista busca "Ana" en "Nuevo turno"
    Then "Ana López" no aparece en los resultados

  Scenario: Fuera de los comunicados a todos [según D5]
    Given hay 10 pacientes activas y 2 archivadas
    When envía un comunicado a todos
    Then se encolan 10 mensajes y la pantalla dice que se envió a 10 pacientes

  Scenario: Fuera del contador de pacientes
    Given hay 10 pacientes activas y 2 archivadas
    Then la lista dice "10 pacientes"

  # --- Alta con el número de una archivada ---

  Scenario: "Nuevo paciente" con el teléfono de una archivada [según D7]
    Given "Ana López" está archivada con el teléfono 11 5555-1234
    When la nutricionista intenta dar de alta un paciente con ese teléfono
    Then no se crea nada
    And ve "Ese número es de Ana López, que está archivada."
    And el botón "Desarchivar y abrir su ficha"
    When toca ese botón
    Then "Ana López" vuelve a estar activa y se abre su ficha

  Scenario: Paciente nueva en "Nuevo turno" con el teléfono de una archivada [según D7]
    Given "Ana López" está archivada con el teléfono 11 5555-1234
    When en "Nuevo turno" carga una paciente nueva con ese teléfono
    Then no se crea el turno
    And ve "Ese número es de Ana López, que está archivada." con la opción de elegirla
    When la elige y guarda el turno
    Then se crea el turno y "Ana López" vuelve a estar activa

  # --- Bot y portal ---

  Scenario: Una archivada escribe al bot [según D4]
    Given "Ana López" está archivada
    When escribe "turno" al bot
    Then el bot la atiende igual que a cualquier paciente, por su nombre
    And no se crea otra paciente con su número
    And sigue archivada mientras no reserve

  Scenario: Una archivada reserva por el bot [según D4]
    Given "Ana López" está archivada
    When reserva un turno por el bot
    Then el turno se crea como siempre
    And "Ana López" vuelve a estar activa

  Scenario: Recordatorios de una archivada [según D3 y D4]
    Given una paciente archivada no puede tener turnos futuros
    Then no recibe recordatorios, pedidos de confirmación ni indicaciones previas
    And si llegara a tener un turno, es porque se desarchivó al crearlo

  Scenario: Una archivada entra al portal [según D6]
    Given "Ana López" está archivada y tiene una sesión del portal abierta
    When entra al portal
    Then lo ve igual que antes (plan, evolución, diario)
```

---

## 3. Datos que se registran

| Dato | Obligatorio | Uso |
|---|---|---|
| Fecha y hora de archivado de la paciente | No (vacío = activa) | Saber si está archivada; mostrar "archivada el …" en la ficha y en la sección Archivadas |
| Motivo del archivado | — | **No se registra** salvo que el usuario lo pida (D8) |

Nada más cambia: archivar no toca turnos, ficha clínica, consultas, planes, evolución ni diario.
Desarchivar vacía la fecha.

---

## 4. Diseño UX

### 4.1 Archivar (ficha de la paciente)

- **Dónde**: en el encabezado de la ficha (`patient-header.tsx`), un botón de menú "Más" (icono `⋯`)
  junto a «Abrir chat de WhatsApp», con la opción **«Archivar paciente»**. No va como botón visible:
  es una acción poco frecuente y no debe competir con lo de todos los días (criterio de la
  HU-017c: una acción clara por pantalla, sin miedo a tocar algo por error). Ver D1.
- **Confirmación** (`useConfirm()`, `components/confirm.tsx`), no destructiva en rojo porque no se
  pierde nada:
  - Título: «¿Archivar a Ana López?»
  - Texto: «Deja de aparecer en tu lista, en "Nuevo turno" y en los comunicados. No se borra nada:
    la encontrás en "Archivadas" y la podés desarchivar cuando quieras.»
  - Botones: «Archivar» / «Cancelar».
  - Sin nombre: «¿Archivar este contacto?» con el teléfono (o «Número oculto»).
- **Después**: vuelve a `/pacientes` con un toast «Ana López quedó archivada» y «Deshacer» (8 s,
  `notify.undo()` de `lib/notify.ts`).
- **Error por turno pendiente** [D3]: en lugar de la confirmación (o al confirmar, si apareció
  después), un aviso: «Ana tiene un turno el jueves 30/10 a las 10:00. Cancelalo antes de
  archivarla.» con el enlace «Ver turnos» (`?tab=turnos`). Si tiene varios, se nombra el próximo y
  «y N más».
- **Error genérico**: «No se pudo archivar. Probá de nuevo.»

### 4.2 Ver y recuperar archivadas (lista)

- En `/pacientes`, al final (debajo de "Por completar"), una fila **«Archivadas (N)»** que lleva a la
  vista de archivadas (por ejemplo `/pacientes?vista=archivadas`). Con N = 0 la fila no se muestra.
  Ver D2.
- La vista de archivadas: mismo listado agrupado, con título «Archivadas», un enlace «Volver a
  pacientes», buscador, y en cada fila el nombre y «Archivada el 24/10/2026». Tocar una fila abre la
  ficha.
- Estado vacío (si se llega por URL sin archivadas): «No tenés pacientes archivadas.»

### 4.3 Ficha de una archivada

- Banner arriba del encabezado: «Paciente archivada el 24/10/2026. No aparece en tu lista ni recibe
  comunicados.» con el botón **«Desarchivar»**.
- La ficha se puede ver y editar como siempre (no es de solo lectura): si la nutricionista carga algo,
  es porque la está atendiendo. Ver D9.
- El menú "Más" muestra «Desarchivar» en lugar de «Archivar paciente».
- Desarchivar no pide confirmación (no tiene riesgo). Toast: «Ana López volvió a tu lista de
  pacientes».

### 4.4 Alta con el número de una archivada

- «Nuevo paciente»: debajo del campo teléfono, «Ese número es de Ana López, que está archivada.» y el
  botón **«Desarchivar y abrir su ficha»** (hoy, con una activa, el sheet ofrece abrir su ficha: se
  mantiene igual para activas).
- «Nuevo turno», paciente nueva: «Ese número es de Ana López, que está archivada.» con la opción de
  elegirla (como hoy con `existingPatient`). Al guardar el turno, se desarchiva sola (D4/D7).

### 4.5 Bot de WhatsApp

**No hay mensajes nuevos.** Con la recomendación de D4, el bot trata a una archivada igual que a
cualquier paciente (la saluda por su nombre con el mensaje de siempre); la paciente no se entera de
que estaba archivada. Si reserva, se desarchiva sin avisarle a ella.

Si el usuario elige en D4 que el bot **ignore** a las archivadas, el mensaje propuesto (una sola vez
por conversación) sería:

> Hola Ana. En este momento no tengo turnos disponibles para vos por acá. Si querés retomar la
> atención, escribile directamente a la Lic. Daiana Ponce.

(No recomendado: obliga a la nutricionista a desarchivar a mano a cada paciente que vuelve.)

---

## 5. Fuera de alcance

- **Borrado definitivo** de pacientes (ni para altas por error): queda como D10, no como alcance.
- Archivar varias pacientes a la vez (selección múltiple).
- Archivar desde la fila de la lista (swipe o menú en la fila): solo desde la ficha (salvo D1).
- Archivado automático por inactividad ("no viene hace un año").
- Ocultar los turnos **pasados** de una archivada en la agenda o en el historial: siguen apareciendo.
- Ocultar sus consultas fuera de horario ya recibidas en `/mensajes`.
- Bloquear el número en WhatsApp o cambiar el comportamiento del bot más allá de D4.
- Registro de quién archivó/desarchivó (hay una sola profesional) o historial de archivados.
- Cancelar turnos automáticamente al archivar (salvo que D3 lo pida).
- Cambios en Google Calendar (con D3 recomendada, una archivada no tiene turnos futuros).

---

## 6. Notas de implementación (mínimas; el detalle es del architect)

- Columna nueva nullable en `Patient` (por ejemplo `archivedAt DateTime?`): migración aditiva, sin
  default ni backfill; todas las pacientes existentes quedan activas. Toca `packages/db`, así que
  aplica la regla de una sola HU con migración en `implementando` a la vez, y en producción hay que
  migrar Neon a mano.
- Archivar/desarchivar y "desarchivar al crear un turno" conviene que vivan en
  `packages/db/domain` (los usan web **y** bot: `createAppointment` es compartido). El chequeo de
  turnos pendientes y el archivado, en la misma transacción (escenario de carrera).
- `findOrCreatePatientByJid` sigue siendo un upsert por JID: una archivada no se duplica ni se
  desarchiva por escribir.
- Filtrar archivadas en: `/pacientes` (y el contador), `listAppointmentPatientsAction`,
  `avisos/actions.ts` **y** `avisos/page.tsx` (el número de destinatarios que muestra), y lo que
  decidan D6/D11 (portal, asistente). `reminders.ts` no necesita filtro si D3 queda como se recomienda
  (no hay turnos futuros de archivadas), pero el architect puede agregar uno defensivo.
- Textos en `packages/core` junto a `PATIENT_DIRECTORY_TEXT` / `PATIENT_SUMMARY_TEXT`.
- Pruebas: datos propios borrados por id; nada de WhatsApp real (AGENTS.md).

---

## 7. Dudas para validar con el usuario

**D1. Dónde está el botón Archivar y con qué confirmación.**
Recomendación: solo en la ficha, dentro de un menú "Más" (`⋯`) del encabezado, con una confirmación
que explica que no se borra nada, y toast con "Deshacer". Alternativas: botón visible en la ficha;
también desde la fila de la lista (más rápido para limpiar contactos basura de "Por completar").

**D2. Cómo se ven y se recuperan las archivadas.**
Recomendación: fila «Archivadas (N)» al final de `/pacientes` que abre una vista propia con buscador;
"Desarchivar" desde el banner de la ficha. Alternativa: un control segmentado «Activas / Archivadas»
arriba de la lista (más visible, pero suma un control a una pantalla que la HU-017c simplificó).

**D3. Qué pasa con los turnos futuros al archivar.**
Recomendación: **no dejar archivar** mientras tenga turnos futuros confirmados o esperando pago;
avisar con la fecha y un enlace a Turnos para cancelarlos primero. Es lo más predecible: no se mandan
mensajes de cancelación sin querer y no quedan recordatorios para alguien "archivada".
Alternativas: (a) cancelarlos en el mismo paso, preguntando si se le avisa a la paciente por
WhatsApp; (b) archivar igual y que los turnos sigan su curso.

**D4. Si una archivada escribe al bot o tiene recordatorios pendientes.**
Recomendación: el bot la atiende normal (sin mensajes nuevos) y **se desarchiva sola cuando reserva
un turno**; solo escribir no la desarchiva. Recordatorios: con D3 no tiene turnos futuros, así que no
hay. Alternativas: se desarchiva con cualquier mensaje; el bot la ignora o le responde el mensaje de
4.5 (no recomendado).

**D5. ¿Recibe comunicados masivos?**
Recomendación: **no**. Es justamente uno de los motivos para archivar (no escribirle a quien ya no
atiende).

**D6. ¿Puede entrar al portal?**
Recomendación: **sí, sin cambios**. Los datos son de ella, el portal es de solo consulta y bloquearlo
suma lógica sin un beneficio claro. Alternativa: el portal le muestra «Tu acceso no está disponible.
Escribile a tu nutricionista.» y el bot no le manda el link (opción 4).

**D7. Alta con el número de una archivada.**
Recomendación: en «Nuevo paciente», ofrecer «Desarchivar y abrir su ficha»; en «Nuevo turno», dejar
elegirla y desarchivarla al crear el turno. Regla única: **crear un turno (panel o bot) desarchiva**.
Alternativa: solo avisar «es de una paciente archivada» y que la desarchive a mano desde la ficha.

**D8. ¿Se registra un motivo al archivar?** («ya no viene», «alta por error», «se mudó»…)
Recomendación: no, para no sumar un paso. Se puede agregar después si hace falta.

**D9. ¿La ficha de una archivada se puede editar?**
Recomendación: sí, igual que una activa, con el banner arriba. Alternativa: solo lectura hasta que
se desarchive.

**D10. ¿Hace falta igual un borrado definitivo para altas por error?**
El usuario prefirió archivar; queda fuera de alcance. Si se quisiera, la propuesta sería: solo para
pacientes **sin ningún turno, consulta, plan, evolución, ficha clínica ni diario**, desde el mismo
menú "Más", con confirmación destructiva. Recomendación: no hacerlo ahora; archivar alcanza para
sacar de la vista un alta errónea.

**D11. ¿El asistente IA (`/asistente`) ve a las archivadas?**
Recomendación: sí, marcadas como archivadas en la respuesta, porque sirve para preguntar por
pacientes antiguas («¿cuándo vino por última vez Ana?»). Alternativa: excluirlas como en el resto.

**D12. Contactos sin nombre ("Por completar") archivados: ¿van a la misma sección «Archivadas»?**
Recomendación: sí, en la misma vista, al final y con el teléfono (o «Número oculto») como título.

## Resolución (2026-10-24)

El usuario validó D1–D12 tal como las recomienda la sección 7.
