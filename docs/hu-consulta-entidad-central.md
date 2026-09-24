# HU-003: La consulta como entidad central

**Como** profesional (nutricionista),
**quiero** que cada turno atendido genere una **consulta** que agrupe las mediciones, el
requerimiento calculado, el plan indicado y las notas de esa visita,
**para que** pueda ver cada visita completa en un solo lugar y comparar una consulta con la
anterior.

Origen: Épica 30 de `docs/historias-usuario-nutridesk.md` (Ronda 2). El usuario decidió
reestructurar **antes** de la calculadora. Es la base de:

| HU | Qué cuelga de la consulta |
|---|---|
| HU-004 (épicas 18/19) | La prescripción (TMB, GET, VCT, macros) **con fecha, por consulta** |
| HU-006 (épicas 44/45, y 9/31) | Antropometría ISAK completa, composición corporal y somatotipo, como estudios de la consulta |
| HU-007 (épica 46) | El informe que compara **la consulta actual con la anterior** |
| HU-008 (épica 56) | Pediatría: la **edad a la fecha de la consulta** decide qué referencias usar |

---

## Contexto

### Qué existe hoy

- **`Appointment`** (`packages/db/prisma/schema.prisma`), con los estados `CONFIRMED`,
  `AWAITING_PAYMENT`, `CANCELLED`, `COMPLETED` y `NO_SHOW`. El estado lo cambia **solo el panel**:
  en el panel lateral del turno del calendario (`apps/web/src/app/(panel)/appointment-detail-sheet.tsx`)
  están "Marcar completado", "No asistió" y "Volver a confirmado", que llaman a `setStatusAction`
  (`(panel)/actions.ts`) y este a `setAppointmentStatus` (`packages/db/domain/appointments.ts`),
  un `update` del estado y nada más. El bot no cambia el estado a `COMPLETED` ni hay un cron que
  complete los turnos pasados: **un turno pasado que nadie marcó sigue `CONFIRMED`**.
- **`EvolutionEntry`**: una fila por medición, colgada **del paciente** (`patientId`,
  `recordedAt`). Mezcla en la misma fila la antropometría (peso, talla, 5 perímetros, 3 pliegues)
  y la bioimpedancia (grasa, músculo, agua, grasa visceral, masa ósea, metabolismo basal) más una
  nota. No tiene relación con ningún turno. Se crea desde la pestaña **Evolución** de la ficha
  (`evolution-form.tsx` → `addEvolutionEntryAction` en `clinical-actions.ts` →
  `addEvolutionEntry` en `packages/db/domain/clinical.ts`). La fecha se elige a mano (día, sin
  hora) y se guarda a las 12:00. **No se pueden editar**, solo borrar.
- Quién lee `EvolutionEntry` hoy: la ficha (Resumen, Evolución y gráficos por tipo de estudio),
  `getLatestFormulaMeasurements` (datos para fórmulas de la HU-001), el detalle del plan (último
  peso), el portal (`/portal` y `/portal/evolucion`) y el asistente con IA (`assistant-tools.ts`).
- **`NutritionPlan`**: cuelga del paciente, con estado `DRAFT` / `ACTIVE` / `ARCHIVED`. No sabe en
  qué visita se indicó.
- **`ClinicalRecord`** (antecedentes, objetivos, marca de riesgo) y los datos para cálculos de la
  HU-001 en `Patient` (sexo, actividad, objetivo, contextura): son **del paciente, valor actual**.
  No son de una visita.
- **`DiaryEntry`**: lo carga el paciente desde el portal. No es parte de una visita.
- **Ficha del paciente** (`apps/web/src/app/(panel)/pacientes/[id]`, HU-002b): encabezado fijo y
  seis pestañas (Resumen, Datos y ficha clínica, Evolución, Planes, Diario, Turnos).
  `patient-tabs.tsx` ya tiene el comentario `// HU-003 suma { value: "consultas", label: "Consultas" } acá`.
- **Base de desarrollo**: tiene datos reales cargados a mano (10 pacientes, turnos y mediciones en
  `EvolutionEntry`). Ningún dato existente se puede perder ni cambiar de valor.
- La nutricionista hace InBody (bioimpedancia) y antropometría ISAK, a veces **en la misma
  visita**. Atiende desde los 5 años.

### Qué es lo nuevo

1. Una entidad **Consulta** (una visita del paciente, en una fecha), que puede venir **de un
   turno** o **no** (visita que no pasó por el calendario, o una medición cargada a mano).
2. Al **marcar un turno como completado** se crea su consulta automáticamente (una sola por
   turno).
3. Las **mediciones** (las `EvolutionEntry` de hoy) y el **plan indicado** pasan a poder
   pertenecer a una consulta. La consulta tiene además **notas** propias.
4. Una pestaña **Consultas** en la ficha, con la lista de visitas y el detalle de cada una.
5. Las mediciones existentes se asocian a consultas **sin tocar sus valores** (ver D1).

Lo que **no** cambia: la pestaña Evolución (gráficos y tabla con todas las mediciones), el
portal, el asistente y los datos de la HU-001 siguen leyendo las mismas mediciones y muestran lo
mismo que hoy.

---

## Criterios de aceptación

```gherkin
Feature: La consulta como entidad central

  Background:
    Given la profesional está logueada en el panel
    And existe la paciente "Ana"

  # --- Consulta desde un turno ---

  Scenario: Marcar un turno como completado crea su consulta
    Given "Ana" tiene un turno "Control (InBody)" el 12/09 a las 10:00 en estado "Confirmado"
    When la profesional abre el turno en el calendario y toca "Marcar completado"
    Then el turno queda "Completado"
    And se crea una consulta de "Ana" con fecha 12/09, vinculada a ese turno
    And el panel lateral del turno muestra el botón "Abrir consulta"

  Scenario: Un turno tiene como mucho una consulta
    Given el turno de "Ana" del 12/09 ya tiene su consulta
    When la profesional lo vuelve a confirmado y lo marca completado otra vez
    Then "Ana" sigue teniendo una sola consulta del 12/09 vinculada a ese turno

  Scenario: Volver a confirmado un turno cuya consulta está vacía
    Given el turno de "Ana" del 12/09 está completado y su consulta no tiene mediciones, plan ni notas
    When la profesional toca "Volver a confirmado"
    Then el turno queda "Confirmado"
    And la consulta vacía se elimina

  Scenario: Volver a confirmado un turno cuya consulta tiene contenido
    Given el turno de "Ana" del 12/09 está completado y su consulta tiene una medición
    When la profesional toca "Volver a confirmado"
    Then el turno queda "Confirmado"
    And la consulta y su medición se conservan
    And la consulta muestra el aviso "El turno de esta consulta ya no figura como completado"

  Scenario: "No asistió" no crea consulta
    Given "Ana" tiene un turno confirmado el 12/09
    When la profesional toca "No asistió"
    Then el turno queda "No asistió"
    And no se crea ninguna consulta

  Scenario: Abrir la consulta desde el calendario y desde la pestaña Turnos
    Given el turno de "Ana" del 12/09 está completado
    When la profesional toca "Abrir consulta" en el panel lateral del turno
    Then ve el detalle de la consulta del 12/09 de "Ana"
    And en la pestaña "Turnos" de "Ana" el turno del 12/09 tiene el enlace "Ver consulta"

  # --- Consulta sin turno ---

  Scenario: Crear una consulta sin turno
    Given "Ana" no tiene turno el 15/09
    When la profesional va a la pestaña "Consultas" de "Ana", toca "Nueva consulta"
    And deja la fecha 15/09 y confirma
    Then se crea una consulta de "Ana" del 15/09 marcada "Sin turno"
    And se abre su detalle

  Scenario: No se puede crear una consulta con fecha futura
    When la profesional intenta crear una consulta sin turno con fecha de mañana
    Then no se crea nada
    And ve "La fecha de la consulta no puede ser futura"

  Scenario: Cambiar la fecha de una consulta sin turno
    Given "Ana" tiene una consulta sin turno del 15/09
    When la profesional cambia su fecha a 14/09 y guarda
    Then la consulta queda con fecha 14/09
    And sus mediciones quedan con fecha 14/09

  Scenario: La fecha de una consulta de turno no se edita a mano
    Given la consulta del 12/09 de "Ana" viene de un turno
    When la profesional abre su detalle
    Then la fecha se muestra sin opción de editar, con el texto "Fecha del turno"

  # --- Contenido de la consulta ---

  Scenario: InBody y antropometría en la misma consulta
    Given "Ana" tiene la consulta del 12/09 abierta
    When la profesional agrega una medición con peso 66,5 kg y datos de bioimpedancia
    And agrega otra medición con talla, perímetros y pliegues
    Then la consulta del 12/09 muestra las dos mediciones
    And las agrupa en "Bioimpedancia" y "Antropometría"
    And las dos mediciones tienen fecha 12/09

  Scenario: Notas de la consulta
    Given "Ana" tiene la consulta del 12/09 abierta
    When la profesional escribe en "Notas" "Refiere mejor adherencia; baja picoteo nocturno"
    And toca "Guardar notas"
    Then ve "Notas guardadas"
    And al volver a abrir la consulta la nota sigue ahí

  Scenario: Crear un plan desde la consulta
    Given "Ana" tiene la consulta del 12/09 abierta y sin plan
    When la profesional toca "Crear plan" en la sección "Plan indicado"
    Then se crea un plan borrador de "Ana" vinculado a la consulta del 12/09
    And se abre el editor del plan

  Scenario: Indicar un plan que ya existe
    Given "Ana" tiene el plan activo "Plan septiembre"
    And tiene la consulta del 26/09 sin plan
    When la profesional elige "Plan septiembre" en "Indicar un plan existente"
    Then la consulta del 26/09 muestra "Plan septiembre" como plan indicado
    And la consulta del 12/09 también lo sigue mostrando si ya lo tenía

  Scenario: Quitar el plan indicado
    Given la consulta del 26/09 tiene indicado "Plan septiembre"
    When la profesional toca "Quitar" en "Plan indicado"
    Then la consulta queda sin plan indicado
    And el plan "Plan septiembre" sigue existiendo sin cambios

  Scenario: Edad a la fecha de la consulta
    Given "Ana" nació el 20/09/2014
    When la profesional abre la consulta del 12/09/2026
    Then el encabezado muestra "11 años" (edad al 12/09/2026, no la de hoy)

  # --- Lista de consultas ---

  Scenario: Pestaña Consultas
    Given "Ana" tiene consultas el 12/08 (turno "Primera consulta + antropometría")
          y el 15/09 (sin turno)
    When la profesional abre la pestaña "Consultas"
    Then ve primero la del 15/09 y después la del 12/08
    And cada fila muestra fecha, origen ("Primera consulta + antropometría" o "Sin turno")
        y qué contiene ("Antropometría", "Bioimpedancia", "Plan", "Notas")
    And la pestaña muestra la cantidad de consultas

  Scenario: Paciente sin consultas
    Given "Luis" no tiene consultas
    When la profesional abre la pestaña "Consultas" de "Luis"
    Then ve "Todavía no hay consultas" y el botón "Nueva consulta"

  # --- Mediciones cargadas desde Evolución ---

  Scenario: Medición cargada desde Evolución en un día con consulta
    Given "Ana" tiene una consulta el 12/09
    When la profesional agrega desde la pestaña "Evolución" una medición con fecha 12/09
    Then la medición queda en la consulta del 12/09

  Scenario: Medición cargada desde Evolución en un día sin consulta
    Given "Ana" no tiene consulta el 20/09
    When la profesional agrega desde la pestaña "Evolución" una medición con fecha 20/09
    Then se crea una consulta "Sin turno" del 20/09 con esa medición

  # --- Borrado ---

  Scenario: Borrar una medición no borra la consulta
    Given la consulta del 12/09 tiene dos mediciones
    When la profesional borra una de ellas
    Then la consulta sigue existiendo con la otra medición

  Scenario: Eliminar una consulta vacía sin turno
    Given "Ana" tiene una consulta sin turno del 15/09 sin mediciones, plan ni notas
    When la profesional toca "Eliminar consulta" y confirma
    Then la consulta se elimina

  Scenario: No se puede eliminar una consulta con mediciones o plan
    Given la consulta del 12/09 tiene una medición
    When la profesional intenta eliminarla
    Then no se elimina nada
    And ve "Para eliminar la consulta primero borrá sus mediciones y quitá el plan indicado"

  # --- Datos existentes ---

  Scenario: Las mediciones existentes quedan intactas
    Given antes de esta HU "Ana" tenía 4 mediciones cargadas en "Evolución"
    When se aplica la migración
    Then "Ana" sigue teniendo las mismas 4 mediciones con los mismos valores, fechas y notas
    And la pestaña "Evolución" y el portal muestran exactamente lo mismo que antes
    And cada medición aparece dentro de una consulta de su fecha

  Scenario: Mediciones existentes del mismo día y turnos completados
    Given antes de esta HU "Ana" tenía una medición del 10/08 y un turno completado el 10/08
    And una medición del 01/09 sin turno ese día
    When se aplica la migración
    Then existe una consulta del 10/08 vinculada al turno, con la medición del 10/08
    And existe una consulta "Sin turno" del 01/09 con la medición del 01/09

  Scenario: Turnos completados antes de esta HU sin mediciones
    Given antes de esta HU "Luis" tenía un turno completado el 05/08 y ninguna medición ese día
    When se aplica la migración
    Then existe una consulta vacía de "Luis" del 05/08 vinculada a ese turno

  Scenario: Los planes existentes no se tocan
    Given antes de esta HU "Ana" tenía dos planes
    When se aplica la migración
    Then los dos planes siguen igual y sin consulta vinculada

  # --- Otros canales ---

  Scenario: El bot y el portal no cambian
    When un turno se marca completado y se crea su consulta
    Then no se encola ningún mensaje de WhatsApp
    And el portal del paciente no muestra consultas
```

---

## Datos que se registran

**Consulta** (nueva):

| Dato | Obligatorio | Uso |
|---|---|---|
| Paciente | Sí | Dueño de la consulta |
| Fecha de la consulta | Sí | Orden cronológico, "consulta anterior" (HU-007), edad a la fecha (HU-008). Si viene de un turno, es la fecha/hora de inicio del turno; si no, un día elegido a mano (no futuro) |
| Turno | No (única por turno) | Origen de la consulta. Vacío = "Sin turno". Desde el turno se ven el servicio (tipo de visita) y el precio; los pagos siguen colgando del turno |
| Notas | No (texto libre, hasta 4000 caracteres) | Lo que pasó en la visita: motivo, observaciones, indicaciones |
| Plan indicado | No | El plan que se le indicó al paciente en esa visita (puede ser uno nuevo o uno que ya tenía) |
| Creada / actualizada | Automático | Auditoría |

**Cambios en lo que ya existe:**

| Dato | Dónde | Uso |
|---|---|---|
| Consulta a la que pertenece | Cada medición (`EvolutionEntry`) | Agrupar las mediciones por visita. Una consulta puede tener **varias** mediciones (InBody y antropometría en la misma visita) |

**Lugar para las HU siguientes** (no se registra nada de esto en la HU-003):

| HU | Lo que va a colgar de la consulta |
|---|---|
| HU-004 | Prescripción: fórmula de TMB elegida, TMB, factor de actividad, GET, ajuste por objetivo, VCT y macros, **más los datos de entrada que se usaron** (peso, sexo, actividad, etc.), porque los de `Patient` son el valor actual y cambian |
| HU-006 | Estudio antropométrico ISAK y estudio de bioimpedancia, con sus cálculos |
| HU-007 | Informe: consulta actual contra la consulta anterior del mismo paciente que tenga antropometría |
| HU-008 | Nada propio: usa la edad a la fecha de la consulta |

---

## Diseño UX

Sigue el sistema de diseño nuevo, al estilo Notion (`Refactorizaciones/rediseno-ui-*.md`):
tarjetas (`Card`), `Badge`, `Sheet`, el diálogo de confirmación (`useConfirm`) y los avisos
(`notify`). Sin colores nuevos.

### Ficha del paciente: pestaña "Consultas"

- Va **entre "Resumen" y "Datos y ficha clínica"** (es lo que más se va a usar durante la
  visita), con el contador de consultas como las otras pestañas (ver D7). URL `?tab=consultas`.
- Arriba a la derecha, botón **"Nueva consulta"**: abre un `Sheet` con la fecha (hoy por
  defecto, no futura) y "Crear consulta". Al crear: aviso "Consulta creada" y se abre el detalle.
- Lista, de la más reciente a la más vieja. Cada fila:
  - fecha (`dd/MM/yyyy`) y, si viene de un turno, la hora;
  - origen: el nombre del servicio del turno (p. ej. "Control (InBody)") o `Badge` neutro "Sin
    turno";
  - chips de contenido: "Antropometría", "Bioimpedancia", "Plan", "Notas" (solo los que tiene);
    si no tiene nada, "Sin registros" en gris;
  - toda la fila es un enlace al detalle.
- Estado vacío: "Todavía no hay consultas. Se crean solas al marcar un turno como completado, o
  podés crear una a mano." + botón "Nueva consulta".

### Detalle de la consulta

Página propia `/pacientes/[id]/consultas/[consultaId]`, como el detalle de un plan
(`/pacientes/[id]/planes/[planId]`), para poder enlazarla desde el calendario. Volver lleva a la
ficha en `?tab=consultas`.

1. **Encabezado**: "Consulta del 12/09/2026", nombre del paciente, **edad a la fecha de la
   consulta**, y el origen: "Turno · Control (InBody) · 10:00 hs" o "Sin turno". Si el turno ya
   no está completado, aviso amarillo: "El turno de esta consulta ya no figura como completado."
   Fecha: en las consultas sin turno se edita (con el mismo `Sheet` de "Nueva consulta"); en las
   de turno se muestra con la etiqueta "Fecha del turno", sin edición.
2. **Mediciones**: las mediciones de la consulta, agrupadas en "Antropometría" (peso, talla,
   perímetros, pliegues, IMC e ICC calculados como en Evolución) y "Bioimpedancia", con la nota
   de cada medición. Botón **"Agregar medición"**: el mismo formulario de Evolución (peso,
   "Agregar medidas antropométricas", "Agregar datos de bioimpedancia", nota) **sin el campo de
   fecha**, que toma la de la consulta. Cada medición se puede borrar con confirmación ("¿Borrar
   esta medición?", como hoy). Vacío: "Sin mediciones en esta consulta."
3. **Plan indicado**: si hay, título del plan, estado (`Badge`) y enlace "Abrir plan", más
   "Quitar". Si no hay: botones **"Crear plan"** (crea un borrador vinculado y abre el editor) e
   **"Indicar un plan existente"** (select con los planes del paciente, activos primero).
4. **Notas**: textarea y botón "Guardar notas" → aviso "Notas guardadas"; si falla, error en línea
   "No se pudieron guardar las notas." Si se sale con cambios sin guardar, no se pierde nada del
   resto, pero la nota escrita sí (igual que los otros formularios de hoy).
5. **Eliminar consulta** (al pie, botón `danger` chico): solo habilitado si no tiene mediciones
   ni plan indicado. Pide confirmación: "¿Eliminar esta consulta? Se borran sus notas. No se puede
   deshacer." Si viene de un turno, el turno queda como está. Deshabilitado con ayuda: "Para
   eliminar la consulta primero borrá sus mediciones y quitá el plan indicado."

No se muestra ninguna sección "Requerimiento" vacía ni un "próximamente": la agrega la HU-004 en
este mismo detalle, entre "Mediciones" y "Plan indicado" (ver D6).

### Panel lateral del turno (calendario)

- En un turno **Completado**: botón **"Abrir consulta"** (secundario, con ícono) arriba de
  "Volver a confirmado".
- "Marcar completado": el aviso pasa a "Turno completado. Se creó su consulta." (o "Turno
  completado." si la consulta ya existía).
- "Volver a confirmado" en un turno cuya consulta tiene contenido: pide confirmación antes:
  "¿Volver el turno a confirmado? La consulta del 12/09 tiene mediciones o notas y se conserva."
  Si la consulta está vacía, no pide nada y la consulta se elimina.

### Otras pestañas

- **Turnos**: los turnos completados con consulta tienen el enlace "Ver consulta".
- **Evolución**: queda como hoy (formulario, gráficos y tabla con todas las mediciones). Lo único
  que cambia: al agregar una medición, se guarda en la consulta de esa fecha o crea una "Sin
  turno" (aviso "Medición agregada a la consulta del 20/09"), y en la tabla cada medición tiene
  un enlace a su consulta.
- **Planes**: los planes vinculados muestran "Indicado en la consulta del 12/09".
- **Resumen**: sin cambios.

### Bot y portal

- **El bot no cambia**: no manda ningún mensaje nuevo ni pregunta nada. No hay textos de
  WhatsApp nuevos en esta HU.
- **El portal no cambia**: `/portal/evolucion` sigue mostrando las mediciones como hoy; el
  paciente no ve consultas ni notas.

---

## Fuera de alcance

- Calculadora de requerimiento y prescripción (HU-004). Acá solo queda el lugar.
- Separar `EvolutionEntry` en estudios por tipo, antropometría ISAK completa, bilaterales,
  composición corporal y somatotipo (HU-006, épicas 9, 31, 44 y 45). Las mediciones siguen siendo
  las de hoy, con los mismos campos.
- Informe antropométrico y la comparación con la consulta anterior (HU-007).
- Referencias pediátricas (HU-008). Acá solo se muestra la edad a la fecha.
- Editar una medición existente (hoy no se puede; sigue sin poderse).
- Mover una medición de una consulta a otra.
- Completar automáticamente los turnos pasados que siguen "Confirmado", o crear consultas para
  ellos.
- Tipo de consulta propio (primera vez / control) distinto del servicio del turno.
- Mostrar consultas o notas en el portal del paciente, o mandarlas por WhatsApp.
- Adjuntos por consulta (laboratorios, PDF de InBody: épicas 35 y 37).
- Snapshot en la consulta de los datos del paciente (sexo, actividad, objetivo, contextura,
  ficha clínica). Si hacen falta, los guarda la prescripción de la HU-004.
- Cambios en el asistente con IA y en la propuesta de plan con IA (siguen leyendo lo mismo).
- Pagos: siguen colgando del turno.

---

## Notas de implementación

- La creación (y la eliminación de la consulta vacía) al cambiar el estado del turno va en
  `setAppointmentStatus` de `packages/db/domain/appointments.ts`, en la misma transacción que el
  cambio de estado, no en la server action: así cualquier camino futuro (bot, cron) hace lo mismo.
  Tiene que ser idempotente (una consulta por turno, garantizado por la base).
- Las operaciones nuevas (crear, buscar-o-crear por fecha, vincular plan, notas, eliminar) van en
  `packages/db/domain`. Cambian `schema.prisma` y `domain`: **typecheck en `apps/web` y
  `apps/bot`**.
- `addEvolutionEntry` pasa a recibir la consulta (o buscarla/crearla por fecha). "Misma fecha" es
  el mismo **día en la zona horaria de la profesional**; hoy `recordedAt` se guarda a las 12:00
  hora del server, ojo al comparar.
- **Migración de datos (ver D1):** solo agrega tablas, columnas nulables y filas nuevas; no cambia
  ningún valor de medición, turno ni plan. Tiene que ser reversible sin pérdida (sacar la columna
  y la tabla devuelve la base al estado anterior). Antes de aplicarla en la base de desarrollo,
  contar por paciente las mediciones y los turnos completados y verificar después que los
  números cierran; no borrar ni reescribir filas existentes. Nunca `migrate reset`.
- `useConfirm`: nunca `await confirm()` dentro de `<form action>` ni de `startTransition` (deadlock
  en React 19, ver `progress/review_HU-002b.md`).
- Si alguna prueba escribe en la base, limpia solo por los ids que creó.

---

## Dudas para validar con el usuario

Cada duda tiene la recomendación del afinador, para que el orquestador la resuelva en modo
autónomo.

**D1. ¿Qué pasa con las mediciones existentes?** Opciones: (a) quedan sueltas, sin consulta, y
la profesional las asocia a mano; (b) la migración crea las consultas y las asocia sola; (c) no se
tocan y la pestaña Consultas solo muestra lo nuevo.
**Recomendación: (b).** La migración, para cada paciente, agrupa sus mediciones por día (zona de
la profesional) y crea una consulta por día; si ese día el paciente tiene **exactamente un** turno
completado, la vincula a ese turno; si no, queda "Sin turno". Solo agrega filas y completa la
columna nueva; no cambia valores, fechas ni notas. Con (a) o (c), la HU-007 no podría comparar
con la historia anterior y habría dos clases de mediciones para siempre.

**D2. ¿Los turnos completados antes de esta HU generan su consulta?** Si no, "cada turno
atendido tiene su consulta" solo vale hacia adelante.
**Recomendación: sí**, en la misma migración, aunque quede vacía (se ve "Sin registros"). Da un
historial de visitas completo desde el primer día.

**D3. ¿Qué pasa con la consulta al volver un turno completado a confirmado?**
**Recomendación:** si la consulta está vacía (sin mediciones, plan ni notas) se elimina; si tiene
algo, se conserva vinculada al turno con el aviso "ya no figura como completado", y se pide
confirmación antes de revertir. Nunca se borran datos cargados por un cambio de estado.

**D4. ¿Una medición cargada desde la pestaña Evolución crea o usa una consulta?** Alternativa:
dejar las mediciones de Evolución sueltas.
**Recomendación:** que use la consulta de esa fecha o cree una "Sin turno". Así toda medición
nueva pertenece a una consulta, y la profesional puede seguir cargando como hoy si le resulta más
cómodo.

**D5. ¿Puede haber dos consultas del mismo paciente el mismo día?** (p. ej. un turno completado
y una consulta a mano del mismo día, o dos turnos ese día).
**Recomendación:** permitirlo (no poner una restricción única por día). "Nueva consulta" con una
fecha que ya tiene consulta avisa "Ya hay una consulta de ese día" y ofrece abrirla, sin
bloquear. Para la búsqueda por fecha desde Evolución (D4) y la migración (D1), si hay más de una
ese día se usa la vinculada a un turno, y si no, la más reciente.

**D6. ¿Se muestra ya un lugar vacío para el requerimiento ("próximamente")?**
**Recomendación: no.** La HU-003 deja la entidad; la HU-004 agrega la sección al detalle. Un
bloque vacío en la UI promete algo que todavía no existe.

**D7. ¿Dónde va la pestaña "Consultas"?** El comentario de la HU-002 solo dice que se suma.
**Recomendación:** segunda, después de "Resumen". Pasan a ser 7 pestañas: a 768 px ya scrollean
dentro de la barra (HU-002b), así que entra sin cambios de diseño.

**D8. ¿La relación con el plan es "un plan por consulta" o "la consulta indica un plan"?** Un
mismo plan puede seguir vigente varias visitas.
**Recomendación:** la consulta **apunta** a un plan (varias consultas pueden indicar el mismo
plan; una consulta indica como mucho uno). Los planes existentes quedan sin consulta; no se
intenta adivinar en qué visita se indicaron.

**D9. ¿La fecha de una consulta de turno se puede editar?**
**Recomendación: no**, es la del turno. Si el turno está mal, se corrige el turno. En las
consultas sin turno se edita, y sus mediciones se mueven con ella a la fecha nueva (cambio de
`recordedAt` de mediciones **creadas en la consulta**, lo que no afecta los datos de antes de la
HU salvo que la profesional lo haga a mano).

**D10. ¿Se puede crear a mano una consulta vinculada a un turno** (p. ej. un turno pasado que
quedó "Confirmado")?
**Recomendación: no en esta HU.** El camino es marcar el turno como completado desde el
calendario, que ya crea la consulta. Evita dos formas de hacer lo mismo.

**D11. ¿Se guardan notas por separado para "motivo", "indicaciones" y "conclusiones"?** El
informe de la HU-007 tiene "Conclusiones" y la épica 52 pide el motivo al reservar.
**Recomendación:** un solo campo "Notas" ahora. Las conclusiones del informe las define la
HU-007 y el motivo al reservar la épica 52 (va en el turno).

---

## Resoluciones (validadas por el orquestador en modo autónomo, autorizado por el usuario, 2026-09-24)

Se aceptan **todas las recomendaciones** del afinador (D1–D11), con estas precisiones:
- **D1 (b):** la migración crea consultas y vincula las mediciones existentes. Tiene que ser
  **solo aditiva**: `INSERT` de consultas nuevas y `UPDATE` únicamente de la columna nueva
  (`consultationId` o equivalente) de `EvolutionEntry`. No cambia ningún otro valor, fecha ni nota,
  no borra nada y, si se corre de nuevo, no duplica nada (idempotente). La zona horaria para
  agrupar por día es la de `Professional.timezone`.
- **D2:** sí, los turnos COMPLETED anteriores generan su consulta en la misma migración.
- **D3:** la consulta vacía se elimina al revertir; si tiene contenido, se conserva y se pide
  confirmación antes de revertir, con `useConfirm` fuera de la transición.
- **D4, D5, D6, D7, D8, D9, D10, D11:** según la recomendación.
