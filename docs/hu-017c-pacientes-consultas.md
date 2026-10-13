# HU-017c — Rediseño Apple (2/5): pacientes y consultas, simple de usar

**Como** nutricionista que atiende pacientes y que no se lleva bien con la computadora,
**quiero** encontrar a una paciente escribiendo su nombre, ver de un vistazo quién es, cuándo viene,
cómo le fue en la última consulta y qué plan tiene, y que cada pantalla me muestre **una** cosa
clara para hacer,
**para que** pueda usar el sistema durante la consulta sin perderme, sin leer términos de sistema y
sin miedo a borrar algo por error.

Origen: HU madre `docs/hu-rediseno-apple.md` (fila HU-017c de la sección 6, Resoluciones del
2026-10-03, riesgos R1–R3, catálogo de componentes de 5.8). **Foco de usabilidad** decidido por el
usuario el 2026-10-03: tiene prioridad sobre lo estético. El diagnóstico y las propuestas 1 a 6 están
en `progress/current-senkuch4n.md` (2026-10-03). Depende de HU-017a (aprobada y mergeada en `develop`).
Rama: `feat/hu-017c-pacientes`.

> **Afinada sin observar a la nutricionista.** La bitácora pedía mirarla 5 minutos usando la ficha
> antes de afinar, y no se pudo. Esta HU se apoya en el diagnóstico del 2026-10-03 y en las capturas
> de `docs/auditoria-apple/`. Ver **D1**: se recomienda validarlo en el recorrido de la primera
> entrega, antes de seguir con las demás.

---

## 1. Contexto

### 1.1 Qué existe hoy

**Fundaciones (HU-017a, en `develop`).** Tokens Apple (acento azul `#0066CC`, grises fríos, escala
tipográfica Inter con `opsz`, radios, elevación, materiales) en `apps/web/src/lib/design-tokens.ts`.
Motion (`framer-motion`) con `LazyMotion` y presets de springs en `lib/motion.ts`. Primitivos
migrados (Button con press y variantes `tinted`/`plain`/`destructive-tinted`, Sheet arrastrable,
Dialog/AlertDialog con spring, Tabs con indicador que se desliza, Table con press en filas,
`DropdownMenuItem variant="destructive"`). Componentes nuevos **todavía sin usar en pantallas**:
`SegmentedControl` (`components/segmented-control.tsx`), `GroupedList`/`GroupedListRow`
(`components/grouped-list.tsx`) y `Metric` (`components/ui.tsx`). Toast con "Deshacer" de 8 s:
`notify.undo()` en `lib/notify.ts` (lo agregó HU-018b, lo usan el menú semanal y el recetario).
Confirmaciones con `useConfirm()` (`components/confirm.tsx`). Contrato: SDD
`Refactorizaciones/rediseno-apple-fundaciones.md` §6.2–§6.3 y §9.

Con 017a, las pantallas de pacientes ya **tomaron** colores, tipografía y componentes nuevos. Falta
la reorganización propia, que es lo que hace esta HU.

**Lista de pacientes** (`/pacientes`: `page.tsx`, `patients-list.tsx`, `components/data-table.tsx`).

- Una tabla con Nombre, Teléfono y "Próximos turnos". Trae **todos** los `Patient` de la base,
  ordenados por nombre.
- Los contactos que le escribieron al bot y nunca dieron su nombre aparecen como "(sin nombre)", con
  el mismo peso que una paciente real (PA4).
- La columna Teléfono muestra `Patient.phone` crudo, que sale de los dígitos del `whatsappJid`
  (`packages/db/domain/patients.ts:findOrCreatePatientByJid`). En la captura `04-pacientes.jpg` hay
  números como `120363…4680`, `256808996319277` o `93127792677049`. El prefijo `120363…` es el de los
  identificadores de **grupos y canales** de WhatsApp. Los de 14–15 dígitos sin código de país
  parecen identificadores **`@lid`** (WhatsApp oculta el número real). El bot descarta los `@g.us` y
  `status@broadcast` desde el MVP (`apps/bot/src/whatsapp.ts:120`), pero **no** los `@newsletter`
  (canales), y guarda los `@lid` como si fueran teléfonos. Hipótesis a confirmar con una consulta
  de lectura sobre los sufijos de `whatsappJid` (D2, D3).
- "Próximos turnos" cuenta solo los turnos `CONFIRMED` futuros, sin los `AWAITING_PAYMENT`, y muestra
  un número ("1 próximo") en vez de cuándo. Como la mayoría de los pacientes no tiene un turno
  futuro, casi siempre se ve "—".
- El buscador es chico (`max-w-xs`, 36 px), sin autofoco, y busca por nombre o por dígitos del
  teléfono.
- En el celular, la tabla scrollea en horizontal (PA2).

**Ficha del paciente** (`/pacientes/[id]`: `page.tsx`, `patient-tabs.tsx`, `patient-header.tsx`).

- Encabezado sticky con nombre, edad · teléfono crudo · próximo turno, alerta clínica compacta y
  "Abrir chat de WhatsApp" (`https://wa.me/<phone>`: con un `@lid` el enlace no abre ningún chat).
- **Siete pestañas**: Resumen, Consultas, Datos y ficha clínica, Evolución, Planes, Diario, Turnos.
  La activa vive en `?tab=` con `history.replaceState`. Todos los paneles quedan montados
  (`forceMount`) para no perder lo escrito.
- Resumen: tarjeta Evolución (4 KPIs + barras de peso), "Datos para cálculos" (8 filas clave-valor
  con badges grises "Sin cargar", "Sin dato", "Sin cargar, se asume Mediana", "Moderado (×1,55)"),
  "Requerimiento indicado" (kcal + macros) y 4 StatTiles de turnos (totales, completados,
  cancelados, ausencias). No hay una acción principal: hay "Ver evolución completa", "Editar",
  "Ver consulta" y otros enlaces del mismo peso.
- Enlaces que dependen de los valores de `?tab=`: `?tab=consultas` (consulta, redirect al borrar una
  consulta), `?tab=datos` (requerimiento, ISAK, alerta clínica), `PatientTabLink tab="evolucion"` y
  **`?tab=planes` desde `pacientes/[id]/planes/[planId]/page.tsx`, que es zona de imleticio y no se
  puede editar**.

**Consulta** (`/pacientes/[id]/consultas/[consultationId]`). Mediciones, tarjeta ISAK, diagnóstico
antropométrico, requerimiento (calculadora) y, en la columna lateral, Plan indicado, Motivo y Notas.
Al pie, "Borrar consulta". Las acciones destructivas ya pasaron a `destructive-tinted` con 017a, pero
siguen al lado de la acción principal (la tarjeta ISAK tiene 4 botones en fila: CO1, CO2). La
columna lateral no es sticky (CO4). Las notas se guardan con botón (sin autosave: D15 de la madre).

**Antropometría ISAK** (`.../antropometria`, 565 líneas) y su formulario (`isak-form.tsx`). Es una
página larga sin navegación interna, con títulos de sección del mismo tamaño que el cuerpo (A1).
Tiene "Informe PDF", "Editar" y "Borrar estudio" en el encabezado (A2). Las barras z son gris sobre
gris (A3).

**Informe antropométrico** (`.../antropometria/informe`, `report-editor.tsx`). Hasta cuatro avisos
apilados arriba (I1): una instrucción permanente ("Revisá y editá los textos antes de generar el
PDF.") con el mismo peso que los problemas reales. Textos editables con "Restaurar" por campo (I2).
Las acciones son Guardar, Generar PDF, Descargar y **Enviar por WhatsApp** (encola en
`OutboundMessage` al paciente). El PDF (`lib/anthropometric-report-pdf.tsx`) usa
`lib/pdf-theme.ts` (hex de Notion). **Ese archivo lo comparte con el PDF del plan
(`lib/plan-pdf.tsx`, zona de imleticio, 017e) y con el selector de color de `/ajustes`**
(`DEFAULT_PDF_ACCENT`).

### 1.2 Por qué hace falta

La usuaria es una nutricionista que no maneja bien la computadora. El diagnóstico del 2026-10-03:

1. La lista mezcla pacientes con contactos de WhatsApp sin nombre e identificadores largos.
2. Los teléfonos se ven crudos (`5493515552345`).
3. "Próximos turnos" casi siempre dice "—".
4. La ficha tiene 7 pestañas.
5. Hay lenguaje técnico a la vista: "×1,55", "se asume Mediana", "Requerimiento indicado".
6. Hay muchas acciones con el mismo peso.

### 1.3 Qué es lo nuevo

Las seis propuestas aprobadas por el usuario, más el rediseño visual de la fila HU-017c de la madre:

1. **Lista**: un buscador grande con autofoco, el nombre grande y el próximo turno en lenguaje común.
2. **"Por completar"**: una sección aparte para los contactos sin nombre. Los grupos y canales no se
   muestran.
3. **Ficha de 7 a 4 pestañas**: Resumen, Consultas, Plan e Historial.
4. **Resumen nuevo**: quién es, próximo turno, última consulta, plan vigente, tendencia de peso y
   **una sola acción principal**.
5. **Lenguaje simple**, con lo técnico detrás de "Ver detalle".
6. **Confirmación más "Deshacer"** al borrar, y botones grandes con ícono y texto.
7. Visual Apple (madre, fila 017c): lista agrupada en el celular, chrome translúcido en las pestañas,
   métricas grandes, acciones destructivas dentro del menú "…" (D13 de la madre, resuelta), ISAK
   con navegación interna, avisos del informe ordenados, y el PDF del informe con la paleta y la
   tipografía nuevas (D8 de la madre, resuelta).

No cambia la funcionalidad clínica (fórmulas, diagnóstico, ISAK, informe) ni el esquema.

---

## 2. Criterios de aceptación

Los escenarios están agrupados por entrega (ver sección 7). Datos de prueba: los que la
profesional ya tiene cargados, más contactos sin nombre. Las pruebas que escriben usan datos propios
y los borran por id (sección 8).

### 2.1 Entrega 017c-1: lista de pacientes

```gherkin
Feature: Encontrar a una paciente sin esfuerzo

  Background:
    Given la profesional está logueada en el panel
    And hay pacientes con nombre, contactos sin nombre y contactos que no son personas (grupos o canales)

  Scenario: El buscador está listo para escribir
    Given una ventana de escritorio de 1366 x 768
    When la profesional abre "Pacientes"
    Then el cursor ya está en el buscador, sin hacer clic
    And el buscador ocupa el ancho de la lista y mide al menos 44 px de alto, con texto de 17 px
    And el texto de ayuda dice "Buscá por nombre o teléfono"

  Scenario: El buscador no abre el teclado solo en el celular
    Given una pantalla táctil de 390 px de ancho
    When la profesional abre "Pacientes"
    Then el buscador se ve arriba, grande, pero el teclado no se abre hasta que lo toca

  Scenario: Buscar sin acentos ni formato
    Given existe la paciente "María José Gómez" con teléfono +54 9 351 555-2345
    When la profesional escribe "maria jose" o "jose gomez" o "555 2345" o "3515552345"
    Then la paciente aparece en los resultados
    And la lista se filtra mientras escribe, sin apretar Enter

  Scenario: Una búsqueda sin resultados explica qué hacer
    When la profesional escribe un nombre que no existe
    Then ve "No encontramos a «…»" y la sugerencia "Probá con otra parte del nombre o con el teléfono"
    And un botón "Borrar búsqueda" vuelve a mostrar la lista completa y deja el cursor en el buscador

  Scenario: Cada fila se lee de un vistazo
    When la profesional ve la lista
    Then cada paciente muestra el nombre en grande (17 px, semibold) como dato principal
    And debajo, en gris, el próximo turno en lenguaje común y el teléfono con formato
    And toda la fila es tocable (al menos 56 px de alto), responde al presionar y lleva a la ficha

  Scenario Outline: Próximo turno en lenguaje común
    Given la paciente tiene su próximo turno (confirmado o esperando pago) <cuando>
    When la profesional ve su fila
    Then lee "<texto>"

    Examples:
      | cuando                         | texto                                  |
      | hoy a las 16:30                | Hoy, 16:30                             |
      | mañana a las 10:00             | Mañana, 10:00                          |
      | el jueves de esta semana       | Jueves 9 de octubre, 10:00             |
      | dentro de un mes               | Lunes 10 de noviembre, 9:00            |
      | esperando el pago de la seña   | <fecha como arriba> · Falta la seña    |

  Scenario: Sin turno próximo no se ve un guion
    Given la paciente no tiene turnos futuros y tuvo una consulta hace 3 semanas
    When la profesional ve su fila
    Then lee "Sin turno · Última consulta hace 3 semanas" (ver D5)
    And nunca aparece "—" como único contenido

  Scenario: Teléfono con formato
    Given un paciente con teléfono "5493515552345"
    When la profesional ve su fila o su ficha
    Then lee "+54 9 351 555-2345"

  Scenario: Contactos sin nombre van a "Por completar"
    Given hay 4 contactos que escribieron al bot y nunca dieron su nombre
    When la profesional abre "Pacientes" sin buscar
    Then los pacientes con nombre aparecen primero, en orden alfabético
    And al final hay una sección "Por completar (4)" con esos contactos, cerrada por defecto
    And cada uno muestra su teléfono con formato (o "WhatsApp no muestra el número", ver D3) y cuándo escribió por última vez
    And cada uno tiene un botón "Poner nombre"

  Scenario: Poner nombre a un contacto
    When la profesional toca "Poner nombre" en un contacto de "Por completar"
    Then se abre un panel con un solo campo "Nombre y apellido" y el cursor en él
    When escribe "Lucía Pérez" y toca "Guardar"
    Then ve "Listo, Lucía Pérez ya está en tus pacientes"
    And el contacto pasa a la lista principal, en su lugar alfabético
    And no se borran otros datos que el contacto tuviera (fecha de nacimiento, notas)

  Scenario: Los grupos y canales no se muestran
    Given hay contactos cuyo identificador de WhatsApp es de un grupo o de un canal
    When la profesional abre "Pacientes" o busca
    Then esos contactos no aparecen ni en la lista ni en "Por completar"
    And el contador de pacientes no los cuenta

  Scenario: La lista en el celular
    Given una pantalla de 390 px
    When la profesional abre "Pacientes"
    Then ve una lista agrupada (sin tabla y sin scroll horizontal) con nombre, próximo turno y una flecha a la derecha
```

### 2.2 Entrega 017c-2: ficha de 4 pestañas y Resumen

```gherkin
Feature: Ficha del paciente simple

  Background:
    Given la profesional abre la ficha de una paciente con mediciones, consultas, un plan activo y un turno próximo

  Scenario: Cuatro pestañas
    When la profesional abre la ficha
    Then ve cuatro pestañas: "Resumen", "Consultas", "Plan" e "Historial"
    And las cuatro entran en una pantalla de 390 px sin scroll horizontal
    And "Resumen" está abierta

  Scenario: Encabezado de quién es
    When la profesional abre la ficha
    Then ve el nombre en grande, la edad ("34 años") y el teléfono con formato
    And si tiene antecedentes marcados como riesgo, una franja de aviso con "Ver antecedentes"
    And un botón "WhatsApp" (con ícono y texto) que abre el chat en otra pestaña
    And al scrollear, el encabezado y las pestañas quedan arriba sobre un fondo translúcido

  Scenario: Resumen en un vistazo
    When la profesional mira el Resumen
    Then ve, en este orden: la acción principal, "Próximo turno", "Última consulta", "Plan" y "Peso"
    And cada tarjeta se lee con una frase en lenguaje común y lleva a su detalle al tocarla

  Scenario: Una sola acción principal
    When la profesional mira el Resumen
    Then hay un solo botón azul lleno, grande (44 px), con ícono y texto
    And si hoy hay una consulta de esta paciente, dice "Abrir la consulta de hoy" y la abre
    And si no, dice "Nueva consulta" y abre el panel de nueva consulta con la fecha de hoy elegida (ver D8)
    And el resto de las acciones del Resumen son secundarias (grises o de texto)

  Scenario: Peso con tendencia
    Given las dos últimas mediciones de peso son 67,8 kg (11/05) y 61 kg (24/09)
    When la profesional mira la tarjeta "Peso"
    Then ve "61 kg" en grande, "Bajó 6,8 kg desde el 11/05" y un gráfico chico de las últimas mediciones
    And la flecha y el texto de la tendencia no usan rojo ni verde (ver D10)
    And tocar la tarjeta abre "Historial" en "Peso y medidas"

  Scenario: Sin mediciones
    Given la paciente no tiene mediciones
    When la profesional mira la tarjeta "Peso"
    Then lee "Todavía no hay mediciones" y un botón "Cargar peso"

  Scenario: Plan vigente
    Given la paciente tiene el plan activo "Plan otoño", indicado el 24/09
    When la profesional mira la tarjeta "Plan"
    Then lee "Plan otoño · desde el 24/09" y tocarla abre el plan
    And si no tiene plan activo, lee "Sin plan activo" y un botón "Ver planes" que abre la pestaña "Plan"

  Scenario: Última consulta
    Given la última consulta fue hace 12 días y tiene peso, calorías y notas
    When la profesional mira la tarjeta "Última consulta"
    Then lee "Hace 12 días · 24/09" y en una línea qué se registró ("Peso, calorías y notas")
    And tocarla abre esa consulta

  Scenario: Datos del paciente sin lenguaje técnico
    When la profesional abre "Datos de la paciente" en el Resumen
    Then ve edad, sexo, objetivo, actividad física, contextura, antecedentes y objetivos clínicos en lenguaje común
    And no ve multiplicadores ("×1,55") ni frases como "se asume Mediana"
    And lo que falta cargar se lee "Sin cargar", en gris, sin aspecto de botón
    And un "Ver detalle" muestra lo técnico: el factor de actividad, que la contextura sin cargar se toma como mediana, y qué fórmulas usan cada dato

  Scenario: Calorías indicadas en lenguaje común
    Given la última prescripción fue de 1.698 kcal el 24/09
    When la profesional mira el Resumen
    Then lee "Calorías indicadas: 1.698 kcal por día · 24/09"
    And proteínas, grasas y carbohidratos aparecen en "Ver detalle"

  Scenario: Editar datos en un solo lugar
    When la profesional toca "Editar datos" en "Datos de la paciente"
    Then se abre un panel lateral con nombre, fecha de nacimiento, notas, sexo, actividad, objetivo, contextura, antecedentes, objetivos y "Antecedentes de riesgo"
    And al guardar ve "Datos guardados" y el Resumen se actualiza

  Scenario: Faltan datos para calcular
    Given a la paciente le falta el sexo y la actividad física
    When la profesional mira el Resumen
    Then ve un aviso amarillo "Para calcular calorías falta: sexo y actividad física" con el botón "Completar"
    And "Completar" abre el panel de edición

  Scenario: Historial reúne lo que pasó
    When la profesional abre "Historial"
    Then elige entre "Peso y medidas", "Turnos" y "Diario" con un control segmentado
    And "Peso y medidas" tiene la carga de una medición nueva, los gráficos y la tabla de mediciones
    And "Turnos" tiene el historial de turnos con un resumen en palabras ("8 turnos: 6 vino, 1 canceló, 1 no vino")
    And "Diario" tiene lo que la paciente cargó desde el portal
    And si hay entradas del diario de las últimas 24 hs, la pestaña "Historial" y la opción "Diario" lo marcan con un punto y texto para lectores de pantalla

  Scenario: La pestaña Plan
    When la profesional abre "Plan"
    Then ve la lista de planes y la creación de un plan nuevo con el aspecto nuevo
    And la lógica de crear un plan o aplicar una plantilla es la misma de antes

  Scenario Outline: Los enlaces viejos siguen funcionando
    When la profesional entra a la ficha con "?tab=<viejo>"
    Then se abre <nueva>

    Examples:
      | viejo     | nueva                                        |
      | resumen   | Resumen                                      |
      | consultas | Consultas                                    |
      | datos     | Resumen, con "Datos de la paciente" a la vista |
      | evolucion | Historial › Peso y medidas                   |
      | planes    | Plan                                         |
      | diario    | Historial › Diario                           |
      | turnos    | Historial › Turnos                           |

  Scenario: Volver desde un plan
    Given la profesional está en el detalle de un plan (zona de planes, sin cambios)
    When toca "Volver a <paciente>"
    Then vuelve a la ficha en la pestaña "Plan"

  Scenario: Nada escrito se pierde al cambiar de pestaña
    Given la profesional escribió en el formulario de nueva medición
    When cambia a "Consultas" y vuelve a "Historial"
    Then lo escrito sigue ahí

  Scenario: Consultas en lenguaje común
    When la profesional abre "Consultas"
    Then cada consulta muestra la fecha ("Miércoles 24/09"), si fue con turno o sin turno, y qué se registró en palabras
    And el botón "Nueva consulta" está arriba, con ícono y texto
```

### 2.3 Entrega 017c-3: consulta, ISAK y acciones seguras

```gherkin
Feature: Consulta clara y borrados que se pueden deshacer

  Background:
    Given la profesional abre una consulta con mediciones, estudio ISAK, cálculo de calorías y notas

  Scenario: Las acciones destructivas no compiten
    When la profesional mira la tarjeta del estudio ISAK
    Then ve "Ver estudio completo" como acción principal y "Informe" y "Editar" como secundarias, con ícono y texto
    And "Borrar estudio" no está a la vista: está dentro del menú "Más opciones" (botón "…" con nombre accesible)
    And lo mismo pasa con "Borrar consulta", "Borrar cálculo" y "Borrar medición"

  Scenario: Borrar pide confirmación en palabras simples
    When la profesional elige "Borrar estudio" en el menú
    Then ve una confirmación que dice qué se pierde: "Se borra el estudio ISAK de esta consulta y su informe."
    And el botón seguro ("Cancelar") es el que tiene el foco
    And el botón para borrar es rojo y dice "Borrar estudio"

  Scenario: Deshacer después de borrar
    Given la profesional confirmó "Borrar estudio"
    Then el estudio desaparece de la consulta
    And ve un aviso "Estudio borrado" con el botón "Deshacer" durante 8 segundos
    When toca "Deshacer" dentro de esos 8 segundos
    Then el estudio vuelve, con sus medidas y su informe, como estaba
    And ve "Listo, el estudio volvió"

  Scenario Outline: Deshacer en cada borrado
    When la profesional confirma <acción>
    Then ve el aviso "<aviso>" con "Deshacer" durante 8 segundos

    Examples:
      | acción             | aviso              |
      | Borrar consulta    | Consulta borrada   |
      | Borrar cálculo     | Cálculo borrado    |
      | Borrar estudio     | Estudio borrado    |
      | Borrar medición    | Medición borrada   |
      | Quitar plan        | Plan quitado de la consulta |

  Scenario: Si se va antes de que termine el plazo
    Given la profesional borró algo y no tocó "Deshacer"
    When pasan los 8 segundos o navega a otra pantalla del panel
    Then el borrado queda hecho
    And si el borrado falla, ve "No se pudo borrar. Probá de nuevo." y el dato sigue a la vista

  Scenario: Botones grandes con ícono y texto
    When la profesional mira la consulta, la ficha o el estudio ISAK
    Then ningún botón de acción es solo un ícono (salvo cerrar y "Más opciones", que tienen nombre accesible y tooltip)
    And las acciones principales miden 44 px de alto

  Scenario: Orden de la consulta
    When la profesional abre una consulta en una pantalla de 1366 px o más
    Then ve en la columna principal: Mediciones, Estudio ISAK, Diagnóstico y Calorías
    And en la columna lateral: Plan indicado, Motivo y Notas, que la acompañan al scrollear (sticky)

  Scenario: Avisos de la consulta
    Given el turno de la consulta no está marcado como completado
    When la profesional abre la consulta
    Then ve un solo aviso amarillo en palabras simples, con la acción para resolverlo si la hay

  Scenario: Navegar el estudio ISAK
    When la profesional abre "Ver estudio completo"
    Then ve un índice de secciones (Medidas, Composición corporal, Somatotipo, Índices) que lleva a cada una
    And cada sección tiene un título más grande que el texto
    And las barras z muestran con color suave y texto qué lado es "bajo" y qué lado es "alto"

  Scenario: Formulario ISAK cómodo
    When la profesional carga o edita un estudio ISAK
    Then los campos están agrupados por tipo de medida con títulos claros
    And los campos de número miden al menos 44 px de alto con texto de 16 px o más
    And al guardar ve "Estudio guardado"
```

### 2.4 Entrega 017c-4: informe antropométrico y su PDF

```gherkin
Feature: Informe sin avisos de más y PDF con la estética nueva

  Background:
    Given la profesional abre el informe de un estudio ISAK

  Scenario: La instrucción no parece un problema
    When abre el informe
    Then "Revisá los textos antes de generar el PDF" aparece como texto de ayuda bajo el título, no como aviso
    And los avisos de color quedan solo para problemas reales

  Scenario: Los problemas se juntan en un solo bloque
    Given el PDF quedó desactualizado, faltan datos del estudio y falta la matrícula
    When abre el informe
    Then ve un solo bloque "Antes de enviar" con una línea por problema y su botón para resolverlo
    And el menor de edad, si aplica, sigue informado

  Scenario: Qué textos se tocaron
    Given la profesional editó el texto de la conclusión
    When mira ese campo
    Then ve la marca "Editado" junto a "Restaurar el texto original"
    And los campos sin tocar no muestran la marca

  Scenario: Una acción principal
    When la profesional mira las acciones del informe
    Then "Generar PDF" es la acción principal, "Guardar" y "Descargar" son secundarias
    And "Enviar por WhatsApp" pide confirmación con el nombre y el teléfono con formato de la paciente

  Scenario: PDF con la paleta y la tipografía nuevas
    When la profesional genera el PDF del informe
    Then el PDF usa los grises fríos y la escala tipográfica Inter del sistema nuevo
    And el color de acento es el que eligió en Ajustes (o el de por defecto, ver D15)
    And el PDF del plan no cambia
    And los colores de tejidos y las zonas de la silueta se siguen distinguiendo impresos en gris
```

### 2.5 Transversales (todas las entregas)

```gherkin
Feature: Sin regresiones y accesible

  Scenario: Sin cambios de funcionalidad clínica
    When se carga una medición, se calcula el requerimiento, se guarda un estudio ISAK o se genera el informe
    Then los valores calculados y los datos guardados son los mismos que antes de la HU

  Scenario: Zona de imleticio sin cambios de archivo
    When se compara la rama contra develop
    Then no hay cambios en alimentos/**, pacientes/[id]/planes/**, plantillas/**, components/food-picker.tsx ni components/meals-editor.tsx
    And plans-section.tsx solo tiene cambios de presentación (clases, componentes visuales, textos de la lista), no de lógica ni de las acciones de planes/actions

  Scenario: Teclado y lectores de pantalla
    When la profesional usa solo el teclado
    Then puede buscar, abrir una ficha, cambiar de pestaña, abrir el menú "…" y confirmar o cancelar un borrado
    And el toast "Deshacer" es alcanzable con el teclado y se anuncia a los lectores de pantalla

  Scenario: Tres anchos
    When se recorren lista, ficha, consulta, ISAK e informe a 1366, 768 y 390 px
    Then no hay scroll horizontal de página, ni texto cortado sin forma de verlo, ni controles de menos de 44 px en táctil

  Scenario: Movimiento reducido
    Given el sistema tiene "reducir movimiento" activado
    When la profesional cambia de pestaña, abre la sección "Por completar" o borra algo
    Then las transiciones son fundidos cortos, sin desplazamiento ni rebote
```

---

## 3. Datos que se registran

**Ninguno nuevo.** No cambia `schema.prisma` ni hay migraciones.

| Dato | Obligatorio | Uso |
|---|---|---|
| `Patient.name` (existente) | no | "Poner nombre" lo escribe desde "Por completar", con la misma validación de hoy (máx. 120). |
| Lectura de `Patient.whatsappJid` (existente) | — | Clasificar el contacto: persona con teléfono (`@s.whatsapp.net`), persona sin número visible (`@lid`), o no persona (`@g.us`, `@newsletter`, `@broadcast`). Solo lectura. |
| Lectura de turnos, consultas, planes y mediciones (existentes) | — | Próximo turno, última consulta, plan activo y tendencia de peso en la lista y en el Resumen. |

Para mostrar la última consulta y el próximo turno en la lista hacen falta consultas de lectura
nuevas (agregadas por paciente). Las define el `architect`. No escriben.

---

## 4. Diseño UX

Todo lo que sigue usa los tokens y componentes de 017a. Los textos entre comillas son la propuesta
textual.

### 4.1 Lista de pacientes (`/pacientes`)

```
Pacientes                                              (Title 1)
┌──────────────────────────────────────────────────────────────┐
│ 🔍  Buscá por nombre o teléfono                               │  44–48 px, 17 px, ancho completo
└──────────────────────────────────────────────────────────────┘
12 pacientes                                           (footnote)

┌ GroupedList ─────────────────────────────────────────────────┐
│ Brenda Yebara                                              › │  17 px semibold
│ Hoy, 16:30 · +54 9 351 555-2345                              │  14 px gris
├──────────────────────────────────────────────────────────────┤
│ Juan Pérez                                                 › │
│ Sin turno · Última consulta hace 3 semanas · +54 9 351 …     │
└──────────────────────────────────────────────────────────────┘

▸ Por completar (4)                                    (cerrada por defecto)
  Contactos que te escribieron y todavía no tienen nombre.
  ┌──────────────────────────────────────────────────────────┐
  │ +54 9 11 2345-6789 · escribió hace 2 días  [✎ Poner nombre] │
  │ WhatsApp no muestra el número · escribió ayer [✎ Poner nombre] │
  └──────────────────────────────────────────────────────────┘
```

- **Una lista agrupada en todos los anchos**, no una tabla. Hoy la tabla tiene tres columnas, y en
  la lista el próximo turno y el teléfono pasan a una segunda línea. Se va el ordenamiento por
  columnas: el orden es alfabético por nombre.
- **Buscador**: autofoco solo con puntero fino (escritorio, `(pointer: fine)`), para no abrir el
  teclado en el celular (D13). Botón "×" para borrar, de 44 px. Atajo `/` para enfocarlo en
  escritorio (opcional, lo decide el architect). Busca sin tildes ni mayúsculas y por dígitos del
  teléfono sin importar el formato.
- **Contador**: "12 pacientes", o "3 de 12" mientras se busca. No cuenta "Por completar" ni los no
  personas.
- **Durante la búsqueda**, "Por completar" se abre sola si tiene coincidencias (por teléfono), con el
  rótulo "Sin nombre" en cada fila.
- **"Poner nombre"**: Sheet lateral (abajo en el celular) con el título "Poner nombre", el campo
  "Nombre y apellido" y los botones "Guardar" y "Cancelar". Feedback: toast "Listo, {nombre} ya está
  en tus pacientes". El error va inline: "Escribí el nombre" (vacío) o "No se pudo guardar. Probá de
  nuevo."
- **Contactos que no son personas** (grupos, canales, difusiones): no se muestran (D2).
- **Estados vacíos**: "Todavía no hay pacientes", con el texto "Aparecen acá cuando alguien te
  escribe por WhatsApp o cuando cargás un turno." Sin resultados: "No encontramos a «{q}»" +
  "Probá con otra parte del nombre o con el teléfono." + [Borrar búsqueda].
- **Carga**: skeleton de 8 filas de la lista agrupada (actualizar `pacientes/loading.tsx`).

### 4.2 Ficha (`/pacientes/[id]`)

**Encabezado** (sticky, material chrome translúcido con scroll edge, como en la madre F1):

```
‹ Pacientes
Brenda Yebara                                       [💬 WhatsApp ↗]
34 años · +54 9 351 555-2345
⚠ Antecedentes: hipotiroidismo …                    Ver antecedentes
 Resumen   Consultas 2   Plan   Historial •
 ‾‾‾‾‾‾‾
```

- Nombre en Title 1 (28 px). Sin nombre: "Sin nombre" + botón "Poner nombre".
- El teléfono, con formato. Para un `@lid`: "WhatsApp no muestra el número", y el botón WhatsApp no
  se muestra (D3).
- "Próximo turno" sale del encabezado y pasa al Resumen.
- Pestañas: Resumen · Consultas (con contador) · Plan · Historial (con punto si hay diario reciente).
  Los contadores van en texto secundario, sin chip.
- `?tab=` acepta `resumen`, `consultas`, `planes` (la etiqueta dice "Plan", el valor se mantiene por
  el enlace de la zona de imleticio) e `historial`, más los alias viejos de la tabla del escenario
  "Los enlaces viejos siguen funcionando". Subvista de Historial: `?vista=medidas|turnos|diario`
  (nombre a definir por el architect).

**Resumen:**

```
[ ▶ Abrir la consulta de hoy ]      ← único botón filled, lg (44 px)

┌ Próximo turno ──────────┐ ┌ Última consulta ─────────┐
│ Jueves 9 de octubre,    │ │ Hace 12 días · 24/09     │
│ 10:00                   │ │ Peso, calorías y notas  ›│
│ Control · Falta la seña ›│ └──────────────────────────┘
└─────────────────────────┘
┌ Peso ───────────────────┐ ┌ Plan ────────────────────┐
│ 61 kg                   │ │ Plan otoño               │
│ ↓ Bajó 6,8 kg desde 11/05│ │ desde el 24/09          ›│
│ ▁▃▅▂ (mini gráfico)    ›│ └──────────────────────────┘
└─────────────────────────┘

Datos de la paciente                                [✎ Editar datos]
┌ GroupedList ──────────────────────────────────────────────────┐
│ Edad                                               34 años    │
│ Objetivo                                       Bajar de peso  │
│ Actividad física                                    Moderada  │
│ Contextura                                        Sin cargar  │
│ Calorías indicadas                  1.698 kcal por día · 24/09│
│ Antecedentes                         Hipotiroidismo (riesgo)  │
└───────────────────────────────────────────────────────────────┘
  Ver detalle ▾   (factor de actividad 1,55; contextura sin cargar = mediana;
                   peso 61 kg (24/09), talla 164 cm (24/09), grasa sin medir;
                   proteínas / grasas / carbohidratos; qué fórmulas los usan)
```

- Las cuatro tarjetas son tocables completas (press de tarjeta de 017a, chevron) y navegan a su
  detalle: el turno abre el calendario en ese día (o el sheet del turno, si el architect lo
  resuelve fácil); la consulta, su página; el plan, `planes/[id]` (solo un enlace a la zona de
  imleticio); el peso, Historial › Peso y medidas.
- En el celular las tarjetas van en una columna. A 768 px, en dos columnas. A 1366 px, en dos
  columnas con los datos al costado, si entra.
- **Peso** usa `Metric` (`size="lg"`) con `trend.sentiment="neutral"` (D10) y un minigráfico de las
  últimas 8 mediciones (las barras actuales en chico, o una línea: lo decide el architect).
- **Datos de la paciente** reemplaza a "Datos para cálculos", "Requerimiento indicado" y la pestaña
  "Datos y ficha clínica". La edición pasa a un único Sheet "Editar datos" con tres grupos
  (Personales, Para calcular calorías, Ficha clínica). D9 trata si se unifica o se mantienen sheets
  separados.
- Los StatTiles de turnos (totales, completados…) salen del Resumen y pasan a Historial › Turnos,
  como una frase.

**Glosario de lenguaje simple** (propuesta; D11 define el alcance):

| Hoy | Propuesta | Lo técnico va a "Ver detalle" |
|---|---|---|
| Datos para cálculos — "Lo que van a usar las fórmulas." | Datos de la paciente | "Estos datos los usan las fórmulas de calorías." |
| Moderado (×1,55) | Moderada | "Factor de actividad: 1,55" |
| Sin cargar, se asume Mediana | Sin cargar | "Mientras no la cargues, el cálculo usa contextura mediana." |
| Grasa: Sin dato | Grasa: Sin medir | — |
| Badge gris "Sin cargar" (parece botón) | Texto gris "Sin cargar" | — |
| Requerimiento indicado | Calorías indicadas | Proteínas, grasas, carbohidratos en g |
| "Todavía no hay un requerimiento indicado. Se calcula en una consulta." | "Todavía no indicaste calorías. Se calculan dentro de una consulta." | — |
| Paciente sin nombre | Sin nombre + [Poner nombre] | — |
| Consultas: columnas Fecha / Origen / Contenido, badge "Sin turno" | "Miércoles 24/09 · Con turno (Control)" / "Sin turno"; "Se registró: peso, calorías y notas" | — |
| Próximos turnos: "1 próximo" / "—" | "Jueves 9 de octubre, 10:00" / "Sin turno · Última consulta hace 3 semanas" | — |
| Esperando pago (badge) | Falta la seña | — |
| Ausente | No vino | — |
| Historial de turnos (StatTiles) | "8 turnos: 6 vino, 1 canceló, 1 no vino" | — |
| "Revisá y editá los textos antes de generar el PDF." (aviso azul) | Texto de ayuda bajo el título | — |

No se simplifica el **vocabulario clínico** que la nutricionista usa en su profesión (IMC, TMB,
VCT, z, somatotipo, ISAK, OMS) dentro de la calculadora, el diagnóstico, el estudio ISAK y el
informe (D11).

**Historial:**

- Un `SegmentedControl` (tamaño `md`) con "Peso y medidas" | "Turnos" | "Diario".
- **Peso y medidas**: lo que hoy es la pestaña Evolución (formulario de nueva medición, gráficos y
  tabla). La tabla con "Borrar medición" dentro de "…" (en 017c-3).
- **Turnos**: arriba, la frase de resumen. Abajo, la lista (en el celular, una lista agrupada) con
  fecha en lenguaje común, servicio, motivo, estado en palabras (con ícono + texto) y "Ver
  consulta".
- **Diario**: lo de hoy, con el estilo nuevo. Las entradas de las últimas 24 hs se marcan "Nuevo".
- Las tres subvistas siguen montadas (no se pierde lo escrito).

**Plan:** `plans-section.tsx` solo en lo visual: la lista de planes como lista agrupada (título,
estado con ícono + texto: Activo / Borrador / Archivado, "actualizado el …"), y la tarjeta "Nuevo
plan" con `SegmentedControl` en vez del ToggleGroup armado a mano. No se tocan
`createPlanAction`/`applyTemplateAction` (`./planes/actions`, zona de imleticio) ni la lógica.

### 4.3 Consulta

- Encabezado: "Consulta del miércoles 24/09" (Title 1), la paciente y su edad, "Con turno · Control
  · 10:00" o "Sin turno". Acciones: "Cambiar fecha" (si no tiene turno) y "…" (Borrar consulta,
  deshabilitado con su motivo si no se puede borrar).
- Columna principal: Mediciones · Estudio ISAK · Diagnóstico · Calorías ("Requerimiento" pasa a
  llamarse "Calorías y nutrientes"; adentro, la calculadora conserva sus términos clínicos).
- Columna lateral sticky desde xl: Plan indicado · Motivo de la reserva · Notas. Las notas se
  siguen guardando con un botón. Después de guardar, "Guardado a las 10:42" bajo el botón.
- Tarjeta ISAK: [Ver estudio completo] (filled) · [📄 Informe] · [✎ Editar] (gray) · […] → Borrar
  estudio.
- Calorías: [✎ Editar cálculo] · […] → Borrar cálculo.
- Mediciones: cada medición con […] → Borrar medición.
- Plan indicado: [Ver plan] · […] → Quitar plan de esta consulta.

**Confirmaciones** (AlertDialog de 017a; foco en "Cancelar"):

| Acción | Título | Texto | Botón |
|---|---|---|---|
| Borrar consulta | ¿Borrar esta consulta? | Se borra la consulta del 24/09. Solo se puede borrar si no tiene mediciones, cálculo ni plan. | Borrar consulta |
| Borrar estudio | ¿Borrar el estudio ISAK? | Se borran las medidas del estudio y su informe. | Borrar estudio |
| Borrar cálculo | ¿Borrar el cálculo de calorías? | Se borra lo indicado en esta consulta. El Resumen va a mostrar el cálculo anterior, si hay. | Borrar cálculo |
| Borrar medición | ¿Borrar esta medición? | Se borra la medición del 24/09 (peso, cintura…). | Borrar medición |
| Quitar plan | sin confirmación (es reversible) | — | — |

**Deshacer**: `notify.undo()` (8 s, botón de 44 px). Avisos: "Consulta borrada", "Estudio
borrado", "Cálculo borrado", "Medición borrada", "Plan quitado de la consulta". Al deshacer:
"Listo, {la consulta / el estudio / …} volvió". Si deshacer falla: "No se pudo deshacer." (toast de
error). El mecanismo se trata en D12.

**Borrar consulta** hoy redirige a la ficha (`?tab=consultas`). Con "Deshacer", al volver se
restaura y se puede reabrir desde el toast.

### 4.4 Antropometría ISAK (página y formulario)

- Índice sticky de secciones (chips o una lista lateral desde xl): Medidas · Composición ·
  Adiposidad y muscularidad · Proporcionalidad · Somatotipo · Índices de salud. Cada sección con
  título Headline (17 px).
- Encabezado: [📄 Informe] (filled, es lo que sigue después de revisar) · [✎ Editar] · […] →
  Borrar estudio.
- Barras z: color semántico suave, con las etiquetas "bajo" y "alto" a los lados. No dependen
  solo del color.
- Formulario: grupos con título (Básicas, Pliegues, Perímetros, Diámetros, Longitudes, según los
  que existan hoy), inputs numéricos de 44 px con unidad visible y `inputmode="decimal"`. Feedback
  "Estudio guardado".
- Gráficos (somatocarta, barras de tejidos): colores desde los tokens y animación de entrada de
  ≤ 400 ms, desactivada con movimiento reducido (madre 5.7).

### 4.5 Informe

- Bajo el título, la ayuda "Revisá los textos antes de generar el PDF." como texto secundario.
- Un solo bloque de aviso "Antes de enviar" (tono warning), con una fila por problema:
  "El estudio cambió después del último PDF" → [Generar de nuevo];
  "Faltan medidas en el estudio: el PDF va a decir «Sin dato»" → [Completar estudio];
  "Falta tu matrícula o tu firma" → [Ir a Ajustes].
  El aviso de menor de edad queda como info aparte.
- Campos editados: marca "Editado" + "Restaurar el texto original".
- Barra de acciones (sticky abajo en el celular): [Generar PDF] (filled) · [Guardar] ·
  [Descargar] · [Enviar por WhatsApp]. Enviar abre la confirmación "¿Enviar el informe a Brenda
  Yebara? Le llega por WhatsApp al +54 9 351 555-2345." [Enviar] / [Cancelar]. Para un `@lid`, el
  texto omite el número.
- **PDF**: paleta fría (texto `#1D1D1F`, secundario `#636366`, separadores `#E5E5EA`, relleno
  `#F5F5F7`) y escala tipográfica Inter de la madre (5.3, adaptada a puntos). Sin materiales ni
  sombras. El acento sigue saliendo de Ajustes (D15).

---

## 5. Fuera de alcance

- **Esquema y migraciones**: nada en `schema.prisma`. Por eso quedan fuera "Ocultar este contacto"
  o "Archivar paciente" (necesitan un campo nuevo; si se quieren, HU aparte).
- **El bot** (`apps/bot/**`): que deje de crear pacientes para `@newsletter`, y que resuelva el
  número real de los `@lid`. Se recomienda una **tarea directa** aparte (D2, D3).
- **Arreglar el enlace de WhatsApp para `@lid`**: depende de conocer el número. Acá solo se oculta
  el botón (D3).
- **Zona de imleticio**: `alimentos/**`, `pacientes/[id]/planes/**`, `plantillas/**`,
  `components/food-picker.tsx`, `components/meals-editor.tsx`, `lib/plan-pdf.tsx` y su tema. De
  `plans-section.tsx`, todo lo que no sea visual. Eso es HU-017e.
- Cambios en fórmulas, diagnóstico, cálculo ISAK, contenido del informe o validaciones.
- Autosave de notas (D15 de la madre: sin autosave).
- Unir pacientes duplicados, crear pacientes a mano desde la lista, búsqueda global.
- Portal del paciente (HU-017d), agenda, Ajustes y la navegación vertical de Ajustes (HU-017b;
  `impl_HU-017a.md` dice "se rediseña en 017c", pero según la partición es 017b).
- Modo oscuro (HU-017f), transiciones entre páginas.
- Swipe en filas para borrar (D7 de la madre: no).

---

## 6. Notas de implementación (mínimas; el detalle lo escribe el `architect`)

- Todo en `apps/web`. Lógica pura nueva, que puede ir en `packages/core` o en `apps/web/src/lib`
  con su test (lo decide el architect; la madre dejó fuera `packages/**`, ver D11):
  - clasificar un `whatsappJid`: persona / sin número visible / no persona;
  - formatear un teléfono (Argentina con móvil `9`; otros países con `+código` y grupos);
  - fecha en lenguaje común: "Hoy, 16:30", "Mañana", "Jueves 9 de octubre", "hace 3 semanas", en
    la zona horaria de la profesional;
  - resumen de turnos en palabras; "qué se registró" en palabras (hoy `consultationChips`).
- **Ojo con `updatePatientAction`** (`pacientes/actions.ts`): escribe `notes` y `birthDate` en
  `null` si no vienen en el form. "Poner nombre" con un solo campo **borraría** esos datos. Hace
  falta una action que solo toque `name` (o mandar los otros campos tal cual).
- La lista hoy usa `include: _count` sobre turnos `CONFIRMED`. Para mostrar el próximo turno
  (confirmado o esperando pago) y la última consulta sin N+1, el architect elige la consulta
  (posiblemente en `packages/db/domain`; si cambia una firma de `domain`, `typecheck` en web **y**
  bot).
- Los textos que hoy viven en `packages/core` (`REQUIREMENT_TEXT`, `PEDIATRIC_TEXT`,
  `ISAK_REPORT_TEXT`, `missingFormulaDataMessage`, `ACTIVITY_LEVELS`) los usan también otras
  pantallas y algunos son "textos exactos" de HU validadas (HU-004, HU-008 D15). D11 trata si se
  cambian en `core` o se sobrescriben en la UI.
- `?tab=planes` tiene que seguir funcionando (lo usa `planes/[planId]/page.tsx`, que no se toca).
  Mapa de alias del escenario correspondiente. `PatientTabLink` y los `?tab=datos` internos se
  actualizan.
- `pdf-theme.ts` es compartido con `plan-pdf.tsx` y `/ajustes`: el informe necesita su propia
  paleta (o un tema nuevo) sin cambiar `pdfColors` ni `DEFAULT_PDF_ACCENT` hasta 017e (D15). Los
  `.woff` de Inter de `public/fonts` no tienen `opsz`.
- Componentes de 017a a adoptar por primera vez: `GroupedList`, `SegmentedControl`, `Metric`,
  `DropdownMenuItem variant="destructive"`. Si hace falta una prop nueva, que sea **opcional** (R1
  de la madre).
- **WhatsApp**: "Enviar por WhatsApp" del informe encola en `OutboundMessage` al paciente. Ninguna
  verificación lo dispara con un paciente real. Si una prueba lo usa, que sea con un paciente de
  prueba creado por ella y que borre la fila de `OutboundMessage` por id antes de que el bot la
  despache.
- **Datos de desarrollo**: el recorrido es de solo lectura sobre los datos de la usuaria. Probar
  "Poner nombre", borrar y deshacer solo con pacientes, consultas y estudios creados por la prueba,
  borrados por id.
- Verificación por entrega: `typecheck` y `test` de `apps/web` (y `core`/`db` si se tocan),
  recorrido a 1366/768/390 px, reduced motion, teclado, y
  `git diff develop --stat` sin archivos de la zona de imleticio.

---

## 7. Propuesta de corte en entregas

Cuatro PR encadenados a `develop`, cada uno con su revisión. Una sola SDD con cuatro fases (como
018b) o cuatro SDD chicas: lo propone el architect.

| Entrega | Alcance | Por qué en este orden | Tamaño |
|---|---|---|---|
| **017c-1 Lista** | Buscador, filas legibles, próximo turno en lenguaje común, teléfono con formato, "Por completar" + "Poner nombre", ocultar no personas, lista agrupada en todos los anchos, loading. Helpers puros (jid, teléfono, fechas) con tests. | Es lo primero que toca la usuaria. Da los helpers que usan las demás. Es chica y permite **validar el enfoque con la nutricionista** (D1) antes de seguir. | S–M |
| **017c-2 Ficha** | 4 pestañas con alias de URL, encabezado nuevo, Resumen (acción principal, 4 tarjetas, datos de la paciente, lenguaje simple, "Ver detalle"), Sheet "Editar datos", Historial con segmentado (medidas / turnos / diario), Consultas en lenguaje común, Plan (solo visual de `plans-section.tsx`). | El cambio más grande de usabilidad. Depende de los helpers de 017c-1. | L |
| **017c-3 Consulta e ISAK** | Destructivas al menú "…", confirmaciones en palabras simples, mecanismo de "Deshacer" (incluida "Borrar medición" de Historial), botones grandes con ícono y texto, columna lateral sticky, ISAK con índice y títulos, barras z, formulario ISAK, gráficos desde tokens. | Concentra el mecanismo de deshacer en un solo PR para revisarlo junto. | M–L |
| **017c-4 Informe y PDF** | Avisos agrupados, marca "Editado", jerarquía de acciones, confirmación de envío, PDF del informe con paleta y tipografía nuevas (sin tocar el PDF del plan). | Es independiente y toca el PDF, que tiene su propio test (`anthropometric-report-pdf.test.tsx`). | S–M |

Si hay que recortar, 017c-4 puede esperar sin bloquear nada.

---

## 8. Dudas para validar con el usuario

Cada una lleva una recomendación. Ninguna está decidida.

- **D1. La observación de la nutricionista no se hizo.** Todo el foco de usabilidad sale del
  diagnóstico del 2026-10-03, no de verla usar el sistema.
  *Recomendación:* validarlo en el **recorrido de 017c-1** (y otra vez en el de 017c-2) con tres
  tareas cronometradas en su computadora: (1) encontrar a una paciente y abrir su ficha; (2) decir
  cuál fue su último peso; (3) empezar la consulta de hoy, o crear un plan. Anotar dónde duda o
  pregunta, y ajustar 017c-2/3 antes de su SDD si aparece algo. Si no se puede verla, que el
  usuario haga esas tres tareas pensando en voz alta como si fuera ella.

- **D2. Contactos que no son personas** (identificadores `120363…`: grupos y canales).
  ¿Se ocultan del todo, o van a una sección "Otros contactos de WhatsApp" escondida?
  *Recomendación:* **ocultarlos del todo** de la lista, la búsqueda y los contadores, porque no son
  pacientes. Antes de implementar, que el orquestador confirme la hipótesis con una consulta de
  **solo lectura** sobre los sufijos de `Patient.whatsappJid` en la base de desarrollo. Por
  separado, una tarea directa en el bot para no crear `Patient` desde `@newsletter`.

- **D3. Contactos con `@lid`** (WhatsApp no muestra el número: `93127792677049`). Hoy se ven como
  si fueran teléfonos y el botón "Abrir chat de WhatsApp" apunta a `wa.me/<lid>`, que no abre
  ningún chat.
  *Recomendación:* mostrar "WhatsApp no muestra el número" en lugar del número y **ocultar el
  botón WhatsApp** para esos contactos. Que el bot resuelva el número real queda para otra tarea.
  Confirmar con la misma consulta de lectura de D2.

- **D4. "Por completar".** ¿Va cerrada al final de la lista, o arriba para que no se olvide? ¿Entra
  solo "sin nombre" o también "sin fecha de nacimiento"?
  *Recomendación:* **al final, cerrada, con el contador a la vista**, y solo "sin nombre". La
  fecha de nacimiento falta en muchas pacientes reales y llenaría la sección.

- **D5. Qué mostrar cuando no hay turno próximo.**
  *Recomendación:* "Sin turno · Última consulta hace 3 semanas". Si nunca tuvo consulta, "Sin turno
  · Te escribió hace 2 días" (último mensaje o `createdAt`, lo que el architect tenga barato).

- **D6. Formato de teléfono.**
  *Recomendación:* para Argentina, "+54 9 351 555-2345" (código de área de 2 a 4 dígitos según la
  numeración argentina). Para otros países, "+código" y el resto en grupos de 3–4. Sin librerías
  nuevas salvo que el architect justifique `libphonenumber-js`.

- **D7. Dónde va cada una de las 7 pestañas viejas.**
  *Recomendación:* Resumen ← Resumen + Datos y ficha clínica; Consultas ← Consultas; Plan ←
  Planes; Historial ← Evolución + Turnos + Diario (con segmentado). *Alternativa:* poner
  Evolución dentro de Consultas, porque cada medición se guarda en la consulta de ese día (HU-003).
  Se descarta porque la nutricionista busca "el peso" como historia, no por consulta.

- **D8. La acción principal del Resumen.**
  *Recomendación:* "Abrir la consulta de hoy" si ya existe una consulta de hoy (por ejemplo, porque
  se completó el turno). Si no, "Nueva consulta", que abre el panel actual con la fecha de hoy ya
  elegida (no la crea directo: crearla sin confirmar cambiaría el comportamiento).
  *Alternativa:* "Cargar peso". Se descarta porque el peso se carga dentro de la consulta.

- **D9. Edición de datos: ¿un Sheet o tres?** Hoy hay un formulario de datos personales, uno de
  ficha clínica y un Sheet de datos para cálculos, cada uno con su "Guardar".
  *Recomendación:* **un solo Sheet "Editar datos"** con tres grupos y **un** botón "Guardar". Por
  dentro siguen las tres actions actuales, que el architect orquesta. Si eso complica el manejo de
  errores, se acepta un Sheet con tres secciones y un "Guardar" por sección.

- **D10. Color de la tendencia de peso.** `Metric` deja el color a quien llama. Bajar de peso es
  bueno para una paciente con objetivo "bajar", y malo para un chico en crecimiento o para objetivo
  "subir".
  *Recomendación:* **neutral siempre** (gris, flecha y texto "Bajó/Subió X kg desde el dd/MM"). El
  sistema no juzga, juzga la profesional.

- **D11. Alcance del lenguaje simple.**
  (a) ¿Se toca el vocabulario clínico (IMC, TMB, VCT, z, somatotipo)? (b) Algunos textos son
  "exactos" de HU validadas (HU-004, HU-008 D15) y viven en `packages/core`: ¿se cambian ahí o se
  sobrescriben en la UI?
  *Recomendación:* (a) **no**: es el idioma profesional de la nutricionista. Se simplifica lo que
  es lenguaje "de sistema" (multiplicadores, "se asume", "requerimiento indicado", badges). (b)
  Cambiar en `core` solo los textos que se muestran únicamente en estas pantallas, con sus tests.
  Los compartidos con el portal o el PDF se sobrescriben en la UI. El usuario valida el glosario de
  4.2.

- **D12. Cómo funciona "Deshacer" al borrar.** Hoy los borrados son definitivos (incluyen cascadas:
  el estudio ISAK arrastra su informe).
  (a) **Borrado diferido en el cliente**: el dato se oculta al toque y la action de borrar se
  ejecuta recién cuando vencen los 8 s o se cierra el toast. Sin cambios de esquema. Si la pestaña
  se cierra antes, no se borra (falla del lado seguro).
  (b) **Foto y restauración en el servidor** (como el menú semanal de HU-018b): se borra al toque y
  "Deshacer" vuelve a crear desde una foto. Más código, sobre todo por las cascadas.
  (c) Borrado lógico: necesita esquema, queda fuera.
  *Recomendación:* **(a)**, manteniendo la confirmación para consulta, estudio, cálculo y medición.
  "Quitar plan" se deshace volviendo a poner el plan (sin diferir).

- **D13. Autofoco del buscador en el celular.**
  *Recomendación:* autofoco solo con puntero fino (escritorio). En el celular, el teclado tapa la
  mitad de la lista apenas se entra.

- **D14. Qué es un "botón grande".**
  *Recomendación:* las acciones principales de la ficha, la consulta y el estudio miden 44 px
  (`lg`). Las secundarias, 36 px. **Todas con ícono y texto**, sin botones de solo ícono salvo
  cerrar y "…" (con nombre accesible y tooltip).

- **D15. PDF del informe y tema compartido.** `lib/pdf-theme.ts` lo usan el informe, el PDF del
  plan (zona de imleticio) y `/ajustes`.
  *Recomendación:* el informe pasa a una **paleta propia** (grises fríos + escala Inter) **sin
  tocar** `pdfColors` ni `DEFAULT_PDF_ACCENT`, para que el PDF del plan y el valor inicial de
  Ajustes sigan igual hasta 017e. El acento sigue siendo el que la profesional eligió. Si no eligió
  ninguno, el informe usa `#1D1D1F` (neutro, como hoy pero con el gris nuevo), no el azul de la UI.

- **D16. El corte en cuatro entregas** (sección 7).
  *Recomendación:* aceptarlo, en el orden 017c-1 → 2 → 3 → 4, con el recorrido de D1 entre la
  primera y la segunda.

- **D17. ¿Un grupo "Hoy" arriba de la lista** con las pacientes que tienen turno hoy?
  *Recomendación:* **no en esta HU** (el calendario ya lo resuelve, y la acción principal de la
  ficha cubre "la consulta de hoy"). Revisarlo en el recorrido de D1: si la nutricionista entra a
  Pacientes para buscar a quien atiende ahora, se suma en 017c-2.

- **D18. Columna lateral sticky en la consulta** (Plan, Motivo, Notas: CO4 de la madre).
  *Recomendación:* sí, desde 1280 px, y solo si la columna entra en la altura de la ventana. Si es
  más alta, scrollea normal.

---

## Resoluciones (2026-10-04, modo autónomo del orquestador)

El usuario pidió avanzar todas las HU de forma autónoma; se toman las recomendaciones del afinador.

- **D1–D18 aceptadas con su recomendación.**
- **D1:** sin acceso a la nutricionista, el orquestador hace las tres tareas del D1 en el recorrido de 017c-1 y 017c-2
  "como si fuera ella" y anota dónde duda. Queda como pendiente del usuario validarlo con ella.
- **D2/D3, confirmado con consulta de solo lectura (2026-10-04):** `Patient.whatsappJid` en dev: 7
  `@s.whatsapp.net` (con nombre), **5 `@newsletter`** (todos `120363…`, todos sin nombre → no son personas, se
  ocultan), **9 `@lid`** (5 sin nombre, 4 con nombre → "WhatsApp no muestra el número", sin botón WhatsApp). La tarea
  del bot para no crear `Patient` desde `@newsletter` queda como **tarea directa** aparte.
- **D16:** corte aceptado: 017c-1 → 017c-2 → 017c-3 → 017c-4.
