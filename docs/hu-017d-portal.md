# HU-017d — Rediseño Apple (4/5): portal del paciente, simple desde el celular

**Como** paciente de la nutricionista (una persona adulta, o la mamá o el papá de un chico de 5 años
en adelante) que abre el portal desde el celular con el link que le mandó el bot,
**quiero** ver de un vistazo cuándo es mi próximo turno y qué tengo que comer hoy, y anotar lo que
comí con una foto en dos toques,
**para que** seguir el plan me resulte fácil, sin números raros, sin palabras técnicas y sin
sentir que estoy usando "un sistema".

Origen: HU madre `docs/hu-rediseno-apple.md` (fila HU-017d de la sección 6, auditoría 2.3 y 3.14,
hallazgos PO1–PO11 y P1–P7, Resoluciones del 2026-10-03, riesgos R4, R5 y R12, catálogo 5.8).
Depende de HU-017a (shell del portal ya migrado). Reutiliza patrones de HU-017c y HU-017b: lenguaje
simple, botones grandes con ícono y texto, helpers de fechas de `packages/core`, borrado diferido
con "Deshacer". Rama: `feat/hu-017d-portal`, encadenada sobre 017b-4 (ya trae 017a, 017c y 017b).

> **La usuaria es la paciente, no la nutricionista.** Prioridades, en orden: (1) celular,
> (2) lenguaje muy simple, apto para leerle a un chico, (3) nada de datos técnicos: ni macros, ni
> kcal, ni medidas de laboratorio. El portal entra con un link firmado, sin login de Google.

---

## 1. Contexto

### 1.1 Qué existe hoy

**Acceso** (`apps/web/src/middleware.ts`, `lib/patient-session.ts`, `(portal)/portal/login/route.ts`).

- El matcher del middleware de Auth.js **excluye** `/portal` (arreglo `b2c814f`): el portal no pide
  Google.
- La paciente escribe "portal" (u opción 4 del menú) y el bot le manda un link firmado que **vale 15
  minutos** (`messages.portalLink` en `packages/core/src/messages.ts:27`). Al abrirlo,
  `/portal/login?token=…` deja una cookie `patient_session` de **30 días** con `path: "/portal"`.
- Si el token no sirve (vencido o adulterado), `/portal/login` redirige a `/portal?error=invalid`,
  pero **el layout ignora `error`**: la paciente ve el mismo texto genérico que si nunca hubiera
  tenido link ("Para entrar necesitás un link de acceso…"). No se entera de que el link venció.

**Shell** (HU-017a, ya migrado). `(portal)/layout.tsx` con `theme-portal` (fondo agrupado cálido
`#FBFAF7`), `PortalHeader` (material translúcido con scroll edge, marca "Numa" + nombre de la
profesional, pestañas arriba desde 768 px y **"Salir" siempre visible arriba a la derecha**),
`PortalNav` abajo en el celular (tab bar con material, activo optimista, press), Toaster arriba al
centro. Contenido en `max-w-2xl`. P1–P4 y P6–P7 de la madre ya están resueltos. **Falta P5**:
"Salir" ocupa el lugar más visible del header (decisión dejada para 017d en la SDD de fundaciones,
`Refactorizaciones/rediseno-apple-fundaciones.md:785`).

**Inicio** (`portal/page.tsx`).

- "Hola, María López 👋" a 24 px, con nombre y apellido; debajo "Este es tu espacio con
  {firma}" (`professionalSignature`, con matrícula). Si la profesional no cargó nombre, queda
  "Este es tu espacio con Nutricionista." (PO5).
- Cinco tarjetas del mismo peso (PO2): **Tu próximo turno** (solo turnos `CONFIRMED`; uno que
  espera la seña, `AWAITING_PAYMENT`, no aparece), **Tu plan vigente**, **Tu evolución** (último
  peso), **Diario alimentario** y **Obras sociales** (badges).
- La fecha del turno sale de `formatDateTime(...) + " hs"`, no de `formatAppointmentWhen` (017c),
  así que no dice "Mañana, 10:00".
- Cada tarjeta tiene un botón secundario "Ver plan >", "Ver evolución >", "Abrir diario >"; la
  tarjeta en sí no es tocable (PO3).

**Evolución** (`portal/evolucion/page.tsx`).

- Tarjeta "Peso" con el gráfico (`EvolutionChart`, desde 2 pesos) y tarjeta "Historial" con
  **todos** los `EvolutionEntry` de la paciente.
- Las filas sin peso (estudios ISAK, bioimpedancia, mediciones solo de pliegues) aparecen igual:
  una fecha sin nada al lado.
- **Cada fila muestra `EvolutionEntry.note`.** En el panel ese campo se llama "Nota" y su
  placeholder es "Observaciones de la consulta…" (`measurement-fields.tsx:34-38`). Es texto clínico
  que la nutricionista escribe para ella, y hoy la paciente lo lee en el portal sin que nadie se lo
  haya avisado a la profesional. Ver **D2**.

**Plan** (`portal/plan/page.tsx`, `plan-view.tsx`, `portal-day-view.tsx`).

- Título y notas del plan, botón lleno "Descargar PDF" (si el plan tiene PDF).
- Plan semanal (HU-018b): `DaySelector` Lun…Dom con hoy elegido (zona de la profesional), **franja
  de totales del día** (`MacroTotals`: Energía en kcal, Proteínas, Carbohidratos, Grasas, Fibra),
  y una `Card` por comida con la marca "Todos los días" y "Elegí una" en las de opciones.
- Plan no semanal: `MacroTotals` "Total del plan" + una `Card` por comida.
- Cada ítem: nombre a la izquierda y gramos a la derecha con hasta un decimal (`Quantity
  decimals={1}`: "120 g", pero "37,5 g" si el gramaje no es entero).
- Los totales en kcal y gramos de macronutrientes los decidió HU-018b ("los totales que hoy muestra
  el portal pasan a ser los del día seleccionado", `docs/hu-plan-recetas-buscador.md` UX §4). Para
  esta usuaria son datos técnicos. Ver **D1**.

**Diario** (`portal/diario/page.tsx`, `diary-form.tsx`, `actions.ts`).

- Formulario siempre abierto arriba: "¿Qué comiste?" (textarea) y "Foto (opcional)" con el
  `<input type="file">` nativo ("Seleccionar archivo · Sin archivos seleccionados", PO6), sin
  miniatura. Límite del servidor: JPG/PNG/WEBP de hasta **3 MB** (`actions.ts:10-11`); una foto
  común de celular suele pesar más (ver **D10**).
- Al guardar, toast "Registro guardado", el formulario se limpia y el registro aparece de golpe en
  la lista (PO7).
- Lista "Tus registros": una tarjeta por registro, fecha y hora (`formatDateTime`), nota, foto
  (`/portal/diario/photo/[id]`) y un botón **"Borrar" que borra al toque, sin confirmación ni
  deshacer**.
- `listDiaryEntries` (`packages/db/domain/diary.ts`) trae los registros **con los bytes de la
  foto** aunque la página solo necesite saber si hay foto.

**Estados.** `loading.tsx` (skeleton de una columna), `error.tsx` ("Algo salió mal", Reintentar /
Volver al inicio), pantalla "Portal del paciente" sin sesión (en el layout).

**Rutas que no son pantallas y no cambian:** `/portal/login`, `/portal/logout` (POST),
`/portal/plan/pdf`, `/portal/diario/photo/[id]`, `/portal/recetas/fotos/[photoId]` (HU-018a).

### 1.2 Qué dejaron listo 017a, 017c y 017b

| Pieza | Dónde | Uso en 017d |
|---|---|---|
| `Sheet` con `side="bottom"` (grabber, `max-h-[90dvh]`, esquinas de 22 px, safe area) y arrastre para cerrar | `components/primitives/sheet.tsx`, `use-dismiss-drag.ts`, `lib/dismiss-drag.ts` | "Anotar comida", "Ver receta", foto ampliada. En el inferior se arrastra desde el grabber o el encabezado (`handleOnly`). **No tiene detents** (ver D12) |
| `GroupedList` / `GroupedListRow` | `components/grouped-list.tsx` | Historial de evolución, registros del diario |
| `Metric` | `components/ui.tsx:183` | Último peso (y altura, D4) |
| `Card`, `EmptyState`, `Button` (`lg` 44 px, `tinted`, `plain`), press en CSS | `components/ui.tsx`, `primitives/button.tsx` | Todo |
| Fechas en lenguaje común: `formatAppointmentWhen` ("Hoy, 16:30", "Mañana, 10:00", "Jueves 9 de octubre, 10:00"), `formatTimeAgo` ("hace 3 semanas") | `packages/core/src/relative-date.ts` | Turno, último peso, días del diario |
| `firstName`, `formatShortDate`, `weightTrend` (texto neutral "Bajó/Subió X kg desde el dd/MM", D10 de 017c) | `packages/core/src/agenda.ts`, `patient-summary.ts` | Saludo, evolución |
| Borrado diferido + toast "Deshacer" de 8 s, con `isScheduled` contra el doble toque | `lib/deferred-delete.ts`, `lib/notify.ts` (`notify.undo`) | Borrar un registro del diario |
| `useConfirm`, `useUnsavedChangesGuard`, `PendingUnloadGuard` | `components/confirm.tsx`, `lib/use-unsaved-changes-guard.ts`, `components/pending-unload-guard.tsx` | Salir del portal, cerrar "Anotar comida" con texto escrito, borrado pendiente al cerrar la pestaña |
| Escala tipográfica (`large-title` 34/41 pensado para el saludo del portal; Body 17/24 en el portal) | `lib/design-tokens.ts`, SDD de fundaciones §308 | Saludo, textos |

**Lecciones de runtime de 017c y 017b** (`progress/review_HU-017c.md`, `progress/review_HU-017b.md`,
bitácora), que valen igual acá:

- No pasar íconos de lucide como **función** de un server component a un componente cliente (rompió
  la ficha en runtime y el build no lo detectó). Pasar el elemento ya renderizado o el nombre.
- No usar `window.history.replaceState(window.history.state, …)` para estado en la URL: Next no se
  entera y se pierde después de una server action.
- En archivos `"use server"`, nada de re-exportar tipos (Turbopack rompe).
- Hidratación: "hoy", "ayer" y la hora se calculan en el servidor con la zona de la profesional, no
  con `new Date()` en el render del cliente.
- Doble toque: un segundo "Borrar" sobre el mismo registro mientras corre el "Deshacer" no hace nada.
- El recorrido del orquestador en navegador encuentra cosas que `typecheck` y `test` no ven: hay que
  hacerlo a 390 px y en Safari de iOS (o simulador).

### 1.3 Qué traen 018c-2 y 018d al portal (todavía no están en esta rama)

Las ramas `feat/hu-018c2-detalle-receta` (aprobada) y `feat/hu-018d-medidas-caseras` (018d-1
aprobada) **no están en `develop` ni en esta rama**. Cuando se mergeen, cambian estos archivos del
portal:

| Archivo | Qué agregan |
|---|---|
| `portal/plan/page.tsx` | Trae el ítem de receta (`RECIPE_ITEM_SELECT`) y el detalle de las recetas del plan sin macros (`listPlanRecipePreviews` → `toPortalRecipeMap`), y pasa `portalMealsForClient(meals)` |
| `portal/plan/plan-view.tsx` | Prop `recipes` |
| `portal/plan/portal-day-view.tsx` | `PortalRecipeItem`: miniatura de 48 px, nombre, "1 porción: ¾ albóndigas" (`recipePortionText`), "Fuente: …" y el botón secundario **"Ver receta"** a todo el ancho en el celular. En los alimentos con medida casera (018d): **"1½ tazas"** a la derecha en tamaño normal y **"270 g"** debajo, chico y gris (`measureAmountText` + `formatGrams`); los ítems en gramos siguen con `Quantity` |
| `portal/plan/portal-recipe-sheet.tsx` (nuevo) | Sheet `side="right"`, pantalla completa en el celular, encabezado con material, `RecipeDetailBody` con `showMacros={false}` y la preparación abierta |

Los dos conservan `MacroTotals` en el portal. Cómo convive 017d con esto: sección 4.3, D1, D13 y D14.

### 1.4 Por qué hace falta

- El portal se ve "migrado" (017a le dio colores, materiales y tab bar), pero sigue organizado como
  una web: todo pesa lo mismo, cada sección se abre con un botón chico dentro de una tarjeta y el
  diario es un formulario de escritorio.
- Muestra datos técnicos (kcal y gramos de proteínas, carbohidratos, grasas y fibra) a una usuaria que puede
  ser un chico de 5 años con sus padres.
- Muestra notas clínicas que no fueron escritas para la paciente (D2).
- Subir una foto desde el celular es justo lo que más falla: input nativo, sin miniatura, y un
  límite de 3 MB que las fotos de cámara superan.
- Borrar un registro del diario es inmediato y sin vuelta atrás.
- Es donde más rinden los gestos (D7 de la madre): hoy no hay ningún sheet en el portal.

### 1.5 Qué es lo nuevo

1. **Inicio con jerarquía**: saludo grande con el nombre de pila, el próximo turno destacado y en
   lenguaje común, tarjetas enteras tocables, acceso directo a "Anotar comida".
2. **Plan para leer en el celular**: sin macros ni kcal, cantidades en lenguaje de cocina (cuando
   018d esté), recetas en un sheet inferior que se cierra arrastrando.
3. **Diario como en una app**: "Anotar comida" en un sheet inferior, "Sacar foto" / "Elegir de la
   galería" con miniatura, foto achicada en el celular antes de subirla, el registro nuevo entra en
   la lista con transición, registros agrupados por día y "Borrar" con "Deshacer".
4. **Evolución tranquila**: último peso como número grande, gráfico, historial solo con lo que la
   paciente entiende, sin notas clínicas.
5. **Pantallas de acceso claras**: "Este link ya venció" distinto de "No tenés link", y "Salir" fuera
   del header.

---

## 2. Criterios de aceptación

Los textos entre comillas son la propuesta textual (sección 4). Se agrupan por entrega (sección 7).

### 2.1 Entrega 017d-1: acceso, inicio y evolución

```gherkin
Feature: Portal — acceso e inicio

  Background:
    Given la paciente abre el portal desde un celular de 390 px de ancho

  Scenario: Link vencido
    Given la paciente toca un link del portal que tiene más de 15 minutos
    When se abre el portal
    Then ve "Este link ya venció"
    And ve "Por seguridad, cada link dura 15 minutos. Escribí portal por WhatsApp y te mandamos uno nuevo."
    And no ve el texto de "Para entrar necesitás un link"

  Scenario: Sin link
    Given la paciente entra a /portal sin sesión y sin token
    Then ve "Para entrar necesitás un link" y cómo pedirlo por WhatsApp

  Scenario: Saludo con el nombre de pila
    Given la paciente se llama "María Laura López"
    When abre el inicio
    Then ve "Hola, María 👋" en el título grande
    And debajo ve "Tu espacio con Lic. Daiana Ponce"

  Scenario: Saludo sin nombre
    Given la paciente no tiene nombre cargado
    Then ve "Hola 👋"
    And si la profesional tampoco tiene nombre, ve "Tu espacio con tu nutricionista"

  Scenario: Próximo turno en lenguaje común
    Given la paciente tiene un turno confirmado mañana a las 10:00 (zona de la profesional)
    When abre el inicio
    Then la primera tarjeta, la más destacada, dice "Tu próximo turno" y "Mañana, 10:00"
    And debajo el nombre del servicio y el precio

  Scenario: Turno que espera la seña (D6)
    Given la paciente tiene un turno reservado que todavía espera la seña
    And no tiene ningún turno confirmado antes de ese
    Then la tarjeta muestra el turno con "Falta pagar la seña para confirmarlo"
    And no hay botón de pago en el portal

  Scenario: Sin turnos próximos
    Given la paciente no tiene turnos futuros
    Then la tarjeta dice "No tenés turnos próximos" y "Escribile a tu nutricionista por WhatsApp para sacar uno."
    And si el número de WhatsApp de la profesional es un teléfono, hay un botón "Escribir por WhatsApp" (D7)

  Scenario Outline: Tarjetas enteras tocables
    When la paciente toca cualquier parte de la tarjeta <tarjeta>
    Then la tarjeta responde al toque (escala y tono) en el mismo momento
    And navega a <destino>

    Examples:
      | tarjeta         | destino           |
      | Tu plan         | /portal/plan      |
      | Tu evolución    | /portal/evolucion |

  Scenario: Diario desde el inicio
    Given la paciente anotó 2 comidas hoy
    Then la tarjeta del diario dice "Hoy anotaste 2 comidas"
    And tiene el botón "Anotar comida"
    # En 017d-1 el botón lleva a /portal/diario; desde 017d-2 abre el sheet directamente.

  Scenario: Salir del portal
    When la paciente toca "Salir del portal" al final del inicio
    Then ve "¿Salir del portal?" y "Para volver a entrar vas a tener que pedir un link nuevo por WhatsApp."
    And con "Salir" se cierra la sesión (mismo POST de hoy) y con "Cancelar" no pasa nada
    And el header del portal ya no muestra "Salir"

Feature: Portal — evolución

  Scenario: Último peso como número grande
    Given la paciente tiene pesos registrados, el último de 62,4 kg hace 3 semanas
    When abre "Tu evolución"
    Then ve "62,4 kg" como número grande y "Último registro: hace 3 semanas"
    And el cambio, si lo hay, se dice en palabras neutras y sin colores de bien o mal (D3)

  Scenario: Gráfico de peso
    Given hay 2 o más pesos
    Then ve el gráfico de peso con los colores del sistema
    And con "reducir movimiento" el gráfico aparece sin animación de crecimiento

  Scenario: Un solo peso
    Given hay un solo peso
    Then ve el número grande y "Cuando haya más registros, vas a ver cómo cambia."

  Scenario: Historial sin notas clínicas (D2, D5)
    Given la nutricionista registró mediciones con nota, y estudios sin peso
    When la paciente mira el historial
    Then ve una fila por registro con peso (o altura, D4): fecha y valor
    And no ve las notas de las mediciones
    And no ve filas vacías de estudios que no tienen peso ni altura

  Scenario: Sin registros
    Given la paciente no tiene mediciones
    Then ve "Todavía no hay registros" y "Cuando tu nutricionista te pese, lo vas a ver acá."
```

### 2.2 Entrega 017d-2: diario

```gherkin
Feature: Portal — diario

  Background:
    Given la paciente abre "Tu diario" en un celular de 390 px

  Scenario: Anotar comida en un sheet que se arrastra
    When toca "Anotar comida"
    Then se abre desde abajo un panel con un agarre arriba, título "Anotar comida"
    And el fondo se oscurece (sin achicarse, D5 de la madre)
    And al tocar el campo "¿Qué comiste?" el navegador no hace zoom (texto de 17 px)

  Scenario: Foto desde la cámara o la galería
    When toca "Sacar foto"
    Then se abre la cámara del celular
    When toca "Elegir de la galería"
    Then se abre la galería
    And después de elegir, ve una miniatura de la foto con "Quitar foto"

  Scenario: Foto grande del celular (D10)
    Given la paciente saca una foto de 5 MB con la cámara
    When la guarda
    Then el celular la achica antes de mandarla y el registro se guarda con la foto
    And no ve "La foto pesa más de 3 MB"

  Scenario: Guardar
    Given escribió "Almuerzo: milanesa con ensalada" y eligió una foto
    When toca "Guardar"
    Then el botón muestra "Guardando…" y no se puede tocar dos veces
    And el panel se cierra, aparece "¡Listo! Ya lo anotaste."
    And el registro nuevo entra arriba de la lista, bajo "Hoy", con una transición (no aparece de golpe)

  Scenario: Nada para guardar
    When toca "Guardar" sin texto ni foto
    Then ve debajo del campo "Escribí qué comiste o agregá una foto."
    And el panel sigue abierto

  Scenario: Error al guardar
    Given falla la conexión
    When toca "Guardar"
    Then ve "No se pudo guardar. Probá de nuevo."
    And lo que escribió y la foto siguen ahí

  Scenario: Cerrar con algo escrito
    Given escribió algo o eligió una foto
    When arrastra el panel hacia abajo, toca afuera o toca la X
    Then ve "¿Descartar lo que anotaste?" con "Descartar" y "Seguir anotando"
    And sin nada escrito, el panel se cierra sin preguntar

  Scenario: Arrastre que sigue al dedo
    When arrastra el panel desde el agarre hacia abajo
    Then el panel sigue al dedo
    And si lo suelta con un movimiento rápido o pasada la mitad, se cierra; si no, vuelve a su lugar

  Scenario: Registros agrupados por día
    Given hay registros de hoy, de ayer y del jueves 2 de octubre
    Then la lista tiene los grupos "Hoy", "Ayer" y "Jueves 2 de octubre"
    And cada registro muestra la hora ("13:40"), el texto y una miniatura de la foto

  Scenario: Ver la foto grande
    When toca la miniatura de un registro
    Then la foto se abre grande en un panel que se cierra arrastrando hacia abajo o con la X

  Scenario: Borrar con Deshacer (D11)
    When toca "Borrar" en un registro
    Then el registro sale de la lista al instante
    And aparece "Borraste el registro." con "Deshacer" durante 8 segundos
    And si toca "Deshacer", el registro vuelve a su lugar y no se borra
    And si no, se borra cuando se cierra el aviso
    And un segundo toque en "Borrar" del mismo registro mientras está el aviso no hace nada

  Scenario: Diario vacío
    Given la paciente no anotó nada nunca
    Then ve "Todavía no anotaste nada" y el botón "Anotar comida"
```

### 2.3 Entrega 017d-3: plan

```gherkin
Feature: Portal — plan

  Background:
    Given la paciente tiene un plan activo y abre "Tu plan" en un celular de 390 px

  Scenario: Sin datos técnicos (D1)
    Then no ve kcal, proteínas, carbohidratos, grasas ni fibra en ninguna parte del plan
    And no ve los macros de ninguna receta

  Scenario: Hoy primero
    Given el plan es semanal y hoy es martes
    Then el selector de días tiene el martes elegido y marcado "Hoy"
    And debajo dice "Martes" y las comidas de ese día

  Scenario: Comidas legibles
    Then cada comida es una tarjeta con su nombre como título
    And cada alimento en gramos dice el nombre a la izquierda y "120 g" a la derecha, sin ceros decimales de más (D15)
    And las comidas "Todos los días" lo dicen en texto, sin badge gris
    And las de opciones dicen "Elegí una de estas opciones"

  Scenario: Día sin comidas
    Given el jueves no tiene comidas
    When elige el jueves
    Then ve "El jueves no tiene comidas cargadas. Mirá otro día o preguntale a tu nutricionista."

  Scenario: Descargar el PDF
    Given el plan tiene PDF
    Then ve "Descargar plan (PDF)" debajo del título, como botón secundario de 44 px
    And descarga el mismo archivo que hoy

  Scenario: Plan no semanal
    Given el plan es igual todos los días
    Then no ve selector de días y ve las comidas una debajo de la otra

  Scenario: Sin plan
    Given la paciente no tiene plan activo
    Then ve "Todavía no tenés un plan." y "Cuando tu nutricionista te lo comparta, lo vas a ver acá."

  # --- Con 018c-2 y 018d en la rama (sección 4.3, D14) ---

  Scenario: Receta en el plan
    Given el martes tiene la receta "Albóndigas de lentejas", 1 porción "¾ albóndigas", de una fuente externa
    Then ve la miniatura, el nombre, "1 porción: ¾ albóndigas" y "Fuente: …"
    And toda la fila es tocable y dice "Ver receta" con una flecha (D13)

  Scenario: Ver receta en un sheet inferior
    When toca la receta
    Then se abre desde abajo un panel con agarre, foto, ingredientes en medida casera, preparación, tips y "Fuente: …"
    And no ve macros ni kcal
    And lo cierra arrastrando hacia abajo, tocando afuera o con la X
    And en una pantalla de 768 px o más el panel se abre desde la derecha

  Scenario: Alimento en medida casera
    Given el martes tiene "Arroz blanco, hervido — 1½ tazas" (270 g)
    Then ve "Arroz blanco, hervido" a la izquierda, "1½ tazas" a la derecha en el tamaño del texto
    And "270 g" debajo, chico y gris (D3 de 018d)
    And con un nombre largo, el nombre baja de renglón y la cantidad no se corta ni se superpone
```

### 2.4 Transversales (todas las entregas)

```gherkin
Feature: Portal sin regresiones y accesible

  Scenario: Sin cambios de datos
    When la paciente anota, borra o mira su plan
    Then lo que se guarda (texto, foto, fecha) y quién lo puede ver son los mismos que antes
    And la nutricionista ve los registros del diario como hoy en la ficha

  Scenario: Zona de imleticio sin cambios de archivo
    When se compara la rama contra develop
    Then no hay cambios en alimentos/**, pacientes/[id]/planes/**, plantillas/**,
         components/food-picker.tsx, components/meals-editor.tsx, lib/meal-view.ts ni lib/plan-pdf.tsx
    And components/weekly-menu/day-selector.tsx y components/macro-totals.tsx no cambian su aspecto en el editor del plan

  Scenario: Tres anchos
    When se recorren inicio, plan, evolución y diario a 390, 768 y 1366 px
    Then no hay scroll horizontal, ni texto cortado, ni controles de menos de 44 x 44 px

  Scenario: Safari de iOS
    When se recorre el portal en Safari de iOS (o su simulador)
    Then ningún campo hace zoom al tocarlo
    And el contenido pasa por debajo del header y de la tab bar sin saltos con la barra del navegador
    And los sheets se arrastran sin que la página de atrás scrollee

  Scenario: Teclado y lectores de pantalla
    When se usa solo el teclado o VoiceOver
    Then se puede abrir y cerrar cada sheet (Escape incluido), anotar una comida y borrar un registro
    And cada sheet tiene título y el foco vuelve a lo que lo abrió
    And el aviso "Deshacer" se anuncia y es alcanzable

  Scenario: Movimiento reducido, transparencia y contraste
    Given "reducir movimiento" está activado
    Then los sheets aparecen con un fundido corto y el registro nuevo entra sin desplazarse
    Given "reducir transparencia" o "aumentar contraste" está activado
    Then el header y la tab bar son sólidos

  Scenario: Lenguaje
    When se lee cualquier texto del portal
    Then no aparecen palabras de sistema ("registro guardado", "sesión", "token", "inválido", "kcal", "macros")
    And los errores dicen qué pasó y qué hacer, en una frase
```

---

## 3. Datos que se registran

**Ninguno nuevo.** No cambia `schema.prisma` ni hay migraciones.

| Dato | Obligatorio | Uso |
|---|---|---|
| `DiaryEntry.note` (existente) | no (texto o foto) | Igual que hoy |
| `DiaryEntry.photoData` / `photoMimeType` (existentes) | no | Igual que hoy. Si se acepta D10, la foto llega **achicada** desde el celular (otro tamaño de bytes, misma forma: JPG/PNG/WEBP, ≤ 3 MB) |
| Lectura de turnos `CONFIRMED` y `AWAITING_PAYMENT` futuros | — | Tarjeta del próximo turno (D6) |
| Lectura de `EvolutionEntry.weightKg` / `heightCm` / `recordedAt` | — | Evolución. `note` deja de mostrarse (D2) |
| Lectura de `DiaryEntry.createdAt` de hoy (conteo) | — | "Hoy anotaste N comidas" (D17) |
| Lectura de `Professional.phoneJid` | — | Botón "Escribir por WhatsApp" (D7), solo si es `@s.whatsapp.net` |

---

## 4. Diseño UX

Todo con los tokens y componentes de 017a. Texto del cuerpo a 17 px (Body del portal), títulos con
la escala de la madre, botones de 44 px como mínimo y siempre con texto (ícono opcional). Se le habla
de "vos", en frases cortas, de manera que una mamá se lo pueda leer a un chico.

### 4.1 Acceso y shell

- **Sin link** (layout, sin sesión ni `error`): igual que hoy, con el título "Para entrar necesitás
  un link" y el texto "Escribile *portal* a tu nutricionista por WhatsApp y te mandamos uno."
- **Link vencido** (`/portal?error=invalid`): ícono de reloj, "Este link ya venció", "Por
  seguridad, cada link dura 15 minutos. Escribí *portal* por WhatsApp y te mandamos uno nuevo." Con
  el botón "Escribir por WhatsApp" si vale D7.
- **Header**: marca y nombre de la profesional; en ≥ 768 px, las pestañas. **Sin "Salir"** (D9).
- **Tab bar**: sin cambios (017a).
- `loading.tsx`: skeleton con la forma del inicio nuevo (título grande + tarjeta destacada + 3
  tarjetas). `error.tsx`: igual, con textos ya simples.

### 4.2 Inicio (`/portal`)

De arriba hacia abajo:

1. **Saludo** en `large-title`: "Hola, María 👋" (nombre de pila con `firstName`; sin nombre,
   "Hola 👋"). Debajo, en secundario: "Tu espacio con {firma}" (con matrícula, como hoy) o "Tu
   espacio con tu nutricionista" si no hay nombre.
2. **Tu próximo turno** (tarjeta destacada; no navega): etiqueta "Tu próximo turno", fecha en
   `title-2` con `formatAppointmentWhen` ("Mañana, 10:00"), debajo "{servicio} · {precio}". Si
   espera la seña: "Falta pagar la seña para confirmarlo" en tono de aviso (ícono + texto). Vacío:
   "No tenés turnos próximos." + "Escribile a tu nutricionista por WhatsApp para sacar uno." +
   botón `tinted` "Escribir por WhatsApp" (D7).
3. **Tu plan** (tarjeta tocable con flecha): título del plan y "Mirá qué comer hoy". Sin plan:
   "Todavía no tenés un plan." (no tocable).
4. **Tu diario** (tarjeta con botón): "¿Qué comiste hoy?" y, si hay, "Hoy anotaste 2 comidas"
   (singular "1 comida"). Botón lleno "Anotar comida" (abre el sheet desde 017d-2).
5. **Tu evolución** (tarjeta tocable con flecha): "Tu último peso", `Metric` "62,4 kg", "hace 3
   semanas". Sin peso: "Cuando tu nutricionista te pese, lo vas a ver acá."
6. **Obras sociales** (solo si hay): título "Obras sociales que atiende", lista simple.
7. **"Salir del portal"** (`plain`, gris, al final, 44 px) → `useConfirm`: "¿Salir del portal?",
   "Para volver a entrar vas a tener que pedir un link nuevo por WhatsApp.", "Salir" / "Cancelar".

Las tarjetas tocables son un único `<Link>` con press de tarjeta (escala 0,985), flecha a la derecha
y nombre accesible ("Tu plan: {título}"). Sin botones adentro, salvo la del diario.

### 4.3 Plan (`/portal/plan`)

- Título del plan (`title-1`) y notas del plan en Body secundario (como hoy).
- "Descargar plan (PDF)" `tinted`, 44 px, ancho completo en el celular (D16).
- **Semanal**: `DaySelector` como hoy, con la palabra "Hoy" bajo el día actual (sin cambiar el
  componente para el editor: con un prop opcional o un envoltorio del portal). Debajo, en
  `title-3`, el día elegido ("Martes"). Cambiar de día hace un fundido corto del contenido.
- **Sin `MacroTotals`** en ninguno de los dos modos (D1).
- **Comidas**: una `Card` por comida, título Headline. "Todos los días" en texto secundario al lado
  del título (sin badge). Opciones: "Elegí una de estas opciones" arriba de la lista.
- **Fila de alimento**: nombre a la izquierda (puede ocupar dos renglones); a la derecha la
  cantidad, alineada arriba:
  - en gramos: "120 g" o "37,5 g", como hoy (D15);
  - en medida casera (018d): "1½ tazas" en Body y "270 g" debajo en Footnote secundario.
  La columna derecha no se encoge (`shrink-0`) y el nombre hace `break-words`. Se prueba con
  "Queso untable descremado tipo crema" + "2 cucharadas soperas".
- **Fila de receta** (018c-2): toda la fila es un botón (D13): miniatura de 48 px con radio 8,
  nombre, "1 porción: ¾ albóndigas", "Fuente: …" y a la derecha "Ver receta" + flecha
  (`RECIPE_PICKER_TEXT.viewRecipe`). Alto mínimo 64 px.
- **Sheet de receta**: `side="bottom"` en < 768 px (grabber, hasta 90 % de la pantalla, contenido
  con scroll propio), `side="right"` en ≥ 768 px como en 018c-2. Mismo contenido que 018c-2
  (`RecipeDetailBody`, `showMacros={false}`, preparación abierta). El título va en el encabezado
  arrastrable.
- **Cómo convive con 018c-2 y 018d** (D14):
  - 017d **no cambia** los datos que arman `page.tsx` en esas ramas (`listPlanRecipePreviews`,
    `portalMealsForClient`, `PortalRecipeView`), ni `RecipeDetailBody`, `recipePortionText`,
    `measureAmountText`, `formatGrams` ni `RECIPE_PICKER_TEXT`. Solo cambia la **presentación** de
    `plan-view.tsx`, `portal-day-view.tsx` y `portal-recipe-sheet.tsx`.
  - Recomendación: 017d-3 se implementa **después** de que 018c-2 y 018d-1 estén en `develop` (y
    rebasada esta rama), así la revisión ve el resultado final una sola vez.
  - Si 017d-3 tiene que ir antes: deja la fila con tres zonas fijas (contenido a la izquierda,
    cantidad a la derecha con texto principal + secundario opcional, acción "Ver receta" en toda la
    fila) y quien mergee 018c-2/018d resuelve los conflictos de esos tres archivos con los datos de
    018 y la presentación de 017d. El criterio "Receta en el plan" y "Alimento en medida casera"
    se verifican en el recorrido de esa integración.

### 4.4 Evolución (`/portal/evolucion`)

- Título "Tu evolución".
- **Último peso**: `Metric` (número de 34–48 px, "kg" en secundario), "Último registro: hace 3
  semanas". Cambio respecto del anterior en texto neutral (D3).
- **Altura** (D4): si hay altura registrada, segundo `Metric` al lado ("1,32 m"), con su fecha.
- **Gráfico de peso**: como hoy, desde 2 pesos, colores de los tokens; un solo peso: "Cuando haya
  más registros, vas a ver cómo cambia."
- **Historial**: `GroupedList` con una fila por registro con peso o altura: fecha ("12 de
  septiembre") a la izquierda; "62,4 kg" (y "1,32 m") a la derecha. Sin notas (D2), sin filas
  vacías (D5). Más nuevo arriba.

### 4.5 Diario (`/portal/diario`)

- Título "Tu diario". Debajo: "Anotá lo que comés, con foto si querés. Tu nutricionista lo ve."
- Botón lleno, ancho completo, "Anotar comida" (ícono lápiz).
- **Sheet "Anotar comida"** (`side="bottom"` en < 768 px, centrado o lateral en ≥ 768 px):
  - "¿Qué comiste?" textarea de 17 px, 3 renglones, placeholder "Ej: almuerzo, milanesa con
    ensalada y una fruta".
  - Foto: dos botones `tinted` de 44 px lado a lado, "Sacar foto" (cámara; `capture`) y "Elegir de
    la galería". En ≥ 768 px, uno solo: "Elegir foto". Con foto: miniatura de 96 px con radio 12 y
    "Quitar foto".
  - "Guardar" lleno, ancho completo, abajo, por encima del teclado y de la safe area. "Guardando…"
    mientras manda.
  - Errores debajo del campo, en una frase: "Escribí qué comiste o agregá una foto.", "Esa foto no
    se puede usar. Probá con otra.", "No se pudo guardar. Probá de nuevo."
  - Al guardar: se cierra, toast "¡Listo! Ya lo anotaste.", el registro entra arriba con
    transición de lista (spring sin rebote; con movimiento reducido, fundido).
  - Cerrar con contenido: "¿Descartar lo que anotaste?" / "Descartar" / "Seguir anotando".
  - El sheet también se abre desde el inicio (`/portal/diario?anotar=1` o equivalente que defina el
    architect, sin `replaceState` con `window.history.state`).
- **Lista**: grupos por día con encabezado ("Hoy", "Ayer", "Jueves 2 de octubre", con año si no es
  el actual). Cada registro: hora "13:40", texto, miniatura de 64 px tocable (abre la foto grande
  en un sheet inferior) y "Borrar" (`plain`, rojo, 44 px) a la derecha de la hora.
- **Borrar**: borrado diferido de 017c/017b. "Borraste el registro." + "Deshacer" (8 s). Error del
  borrado: "No se pudo borrar. Probá de nuevo." y el registro vuelve.
- Vacío: `EmptyState` "Todavía no anotaste nada" + "Anotar comida".

### 4.6 Bot de WhatsApp

**No cambia.** El texto del link (`messages.portalLink`, "válido por 15 minutos") ya coincide con la
pantalla de link vencido. El botón "Escribir por WhatsApp" (D7) abre `https://wa.me/<número>` sin
texto prellenado; el bot contesta como a cualquier mensaje.

---

## 5. Fuera de alcance

- **Esquema, migraciones y `apps/bot/**`.** Nada de campos nuevos (por eso no hay "ocultar el peso a
  esta paciente" configurable por la profesional: si se quiere, HU aparte).
- **Funciones nuevas del portal**: sacar o cancelar turnos, pagar la seña, editar un registro del
  diario, comentarios de la profesional en el diario, lista de compras, favoritos, notificaciones,
  instalar como app (PWA), varias pacientes en una misma sesión (familias).
- **Zona de imleticio**: `alimentos/**`, `pacientes/[id]/planes/**`, `plantillas/**`,
  `components/food-picker.tsx`, `components/meals-editor.tsx`, `lib/meal-view.ts`, `lib/plan-pdf.tsx`
  (el PDF del plan sigue igual) y la presentación de `DaySelector` y `MacroTotals` en el editor.
- **Lo propio de 018c-2 y 018d**: datos de recetas, medidas caseras, `RecipeDetailBody`, textos de
  `RECIPE_PICKER_TEXT`. 017d solo cambia cómo se ven en el portal.
- **Gestos descartados por la madre (D7)**: swipe en filas para borrar, swipe entre pestañas o días,
  pull to refresh. Fondo que se achica al abrir un sheet (D5 de la madre).
- Detents (media altura / completa) en los sheets, salvo D12.
- Modo oscuro (HU-017f), transiciones entre páginas.
- El panel (la ficha muestra el diario como hoy).

---

## 6. Notas de implementación (mínimas; el detalle lo escribe el `architect`)

- Todo en `apps/web/src/app/(portal)/**` y, si hace falta, componentes nuevos del portal en
  `apps/web/src/components/portal/` (o donde diga el architect). Lógica pura con test: agrupar
  registros del diario por día en la zona de la profesional, filtrar filas del historial, texto del
  cambio de peso neutral para el portal, saludo y firma con sus casos vacíos. Si va en
  `packages/core`, reutilizar `relative-date.ts`/`patient-summary.ts` antes de crear funciones.
- **Consultas**: el diario no debería traer los bytes de las fotos para la lista (hoy
  `listDiaryEntries` los trae). Si se cambia `packages/db/domain/diary.ts`, `typecheck` en web
  **y** bot (lo usa también el panel). Alternativa: un `select` en la página del portal.
- **Fotos (D10)**: achicar en el cliente (canvas/`createImageBitmap`, lado mayor ~1600 px, JPEG) antes
  de mandar; el servidor mantiene su validación de tipo y 3 MB. Contemplar fotos HEIC de iPhone
  (Safari suele entregar JPEG con `accept` de imagen) y la orientación EXIF.
- **Sheets**: `Sheet` de 017a con `side` según el ancho (`use-media-query.ts`); el gesto ya está
  resuelto en `use-dismiss-drag`. Guardia de cambios con `useUnsavedChangesGuard` sobre el
  `onOpenChange(false)` (patrón `ServiceSheet` de 017b). Foco al título al abrir (patrón R1 de 017b).
- **Borrado diferido**: `useDeferredDelete` con una key por registro; `PendingUnloadGuard` para el
  cierre de pestaña. La action `deleteDiaryEntryAction` se queda igual (verifica que el registro sea
  de la paciente).
- **Next**: `getPortalPatient` se llama en el layout y en cada página; no agregar más consultas por
  render que las necesarias. Los cálculos de "hoy" en el servidor con `pro.timezone`.
- **Archivos compartidos con 018c-2/018d** (`plan/page.tsx`, `plan-view.tsx`, `portal-day-view.tsx`,
  `portal-recipe-sheet.tsx`): ver 4.3 y D14. Avisar a imleticio en el PR que se tocó la presentación
  del portal del plan (la HU de 018 lo listaba como zona suya; la madre y el orquestador lo asignan a
  017d en lo visual).
- **Datos de desarrollo**: el recorrido de inicio, plan y evolución es de solo lectura (se puede
  entrar como una paciente existente generando su token con `createPatientToken`, sin escribir).
  Anotar, borrar y deshacer se prueban solo con **una paciente de prueba creada por la prueba**, y
  sus registros se borran por id al final. Nada de `deleteMany` por `patientId`.
- **WhatsApp**: ninguna verificación manda mensajes. El botón "Escribir por WhatsApp" se verifica
  mirando el `href`, sin tocarlo con un número real.
- **Verificación por entrega**: `typecheck` y `test` de `apps/web` (y `core`/`db` si se tocan);
  recorrido a 390/768/1366 px; Safari de iOS o simulador (zoom de inputs, sheets, materiales,
  cámara/galería si se puede); reduced motion, reduced transparency, más contraste; teclado;
  `git diff develop --stat` sin archivos de la zona de imleticio.

---

## 7. Propuesta de corte en entregas

Tres PR encadenados, cada uno con su revisión. Una SDD con tres fases.

| Entrega | Alcance | Por qué en este orden | Tamaño |
|---|---|---|---|
| **017d-1 Acceso, inicio y evolución** | Link vencido, "Salir" al final del inicio, saludo grande, próximo turno destacado (y con seña pendiente), tarjetas tocables, conteo del diario, botón WhatsApp, loading; evolución con `Metric`, altura, historial sin notas ni filas vacías. Helpers con test. | Es lo primero que ve la paciente y no depende de 018. Cierra los temas de privacidad (D2) cuanto antes. | M |
| **017d-2 Diario** | Sheet "Anotar comida" arrastrable, cámara/galería, miniatura, compresión, guardia de descarte, alta con transición, grupos por día, foto grande en sheet, borrar con "Deshacer", consulta sin bytes. | Concentra los gestos y el formulario; es donde más se nota "app". | M–L |
| **017d-3 Plan** | Sin macros, "Hoy", filas legibles, gramos sin decimales, PDF `tinted`; con 018c-2/018d: fila de receta tocable, sheet de receta inferior, medida casera. | Depende de que 018c-2 y 018d-1 estén en `develop` (D14). | S–M |

Si 018c-2/018d se demoran, 017d-1 y 017d-2 se mergean igual y 017d-3 espera.

---

## 8. Dudas para validar con el usuario

Cada una con una recomendación. Ninguna está decidida.

- **D1. Totales de kcal y macros en el portal.** HU-018b decidió que el portal muestre la franja
  de totales del día (Energía, Proteínas, Carbohidratos, Grasas, Fibra). El pedido de 017d dice
  "nada de datos técnicos". Sacarlos **revierte** una decisión validada de 018b.
  *Recomendación:* **sacar la franja del portal para todas las pacientes** (también en el plan no
  semanal). La profesional los sigue viendo en el panel y el PDF no cambia. *Alternativa:* dejar
  solo las kcal del día, plegadas bajo "Ver detalle". Se descarta porque para un chico no aportan
  y para un adulto que cuenta calorías es mejor que lo hable con la nutricionista.

- **D2. Notas de las mediciones visibles para la paciente.** Hoy el historial del portal muestra
  `EvolutionEntry.note`, que en el panel es "Observaciones de la consulta…".
  *Recomendación:* **dejar de mostrarlas** en el portal desde 017d-1. Si la profesional quiere
  dejarle un mensaje a la paciente, eso es otra función (HU aparte). Avisarle a la nutricionista que
  hasta ahora se veían.

- **D3. Peso y su cambio, sobre todo en chicos.** El portal lo atienden chicos de 5 años en
  adelante con sus padres. Mostrar "Bajó 2 kg" puede leerse como juicio.
  *Recomendación:* mostrar el peso a todas, **sin colores ni flechas de bien o mal**, con el cambio
  en palabras neutras ("2 kg menos que el 3 de agosto"). Para menores de 18 (por `birthDate`),
  **no mostrar el cambio**, solo el último valor y el gráfico. Preguntarle a la nutricionista si
  prefiere ocultar el peso a los chicos (si dice que sí, es HU aparte con un ajuste por paciente).

- **D4. Altura en Evolución.** Hoy no se muestra. En chicos es lo que más importa ver crecer.
  *Recomendación:* sí, como segundo número y en el historial, cuando haya alguna altura registrada.
  Sin gráfico de altura en esta HU.

- **D5. Filas del historial.** ¿Qué registros aparecen?
  *Recomendación:* solo los que tienen peso o altura. Los estudios de pliegues y bioimpedancia no
  aparecen (no hay nada que la paciente entienda sin la profesional).

- **D6. Turno que espera la seña.** Hoy el inicio no lo muestra.
  *Recomendación:* mostrarlo si es el próximo, con "Falta pagar la seña para confirmarlo", **sin
  botón de pago** (el pago sigue por el bot). Si hay uno confirmado antes, se muestra el confirmado.

- **D7. Botón "Escribir por WhatsApp".** Útil en "No tenés turnos" y en "Link vencido".
  `Professional.phoneJid` puede ser un `@lid` o estar vacío.
  *Recomendación:* sí, solo si `phoneJid` es `@s.whatsapp.net` (teléfono real), abriendo
  `wa.me/<número>` sin texto. Si no, solo el texto.

- **D8. Pantalla de link vencido.** *Recomendación:* sí, distinta de "sin link", usando el
  `?error=invalid` que ya manda `/portal/login`. No se puede distinguir "vencido" de "adulterado";
  los dos muestran "Este link ya venció".

- **D9. Dónde va "Salir"** (P5 de la madre). *Recomendación:* sacarlo del header y ponerlo al final
  del inicio como "Salir del portal", con confirmación (volver a entrar exige pedir un link). Igual
  en celular y escritorio.

- **D10. Fotos del celular de más de 3 MB.** Las fotos de cámara suelen pesar 2–6 MB y hoy dan
  "La foto pesa más de 3 MB".
  *Recomendación:* **achicarlas en el celular** antes de mandarlas (lado mayor ~1600 px, JPEG),
  sin cambiar el límite del servidor. *Alternativa:* subir el límite (el servidor acepta hasta 6 MB
  por action): se descarta porque guarda bytes de más en la base y tarda más con datos móviles.

- **D11. Borrar un registro del diario.** Hoy borra al toque, sin confirmar ni deshacer.
  *Recomendación:* "Borrar" visible + **"Deshacer" de 8 s, sin confirmación** (es un registro
  propio y chico; la confirmación suma un paso que la paciente no necesita). *Alternativa:*
  confirmación como en el panel.

- **D12. Altura de los sheets.** La madre proponía detents (media altura y completa); el `Sheet` de
  017a no los tiene.
  *Recomendación:* **sin detents**: una sola altura que se ajusta al contenido hasta el 90 % de la
  pantalla, con scroll adentro. En ≥ 768 px, "Ver receta" desde la derecha (como 018c-2) y "Anotar
  comida" centrado o desde la derecha, lo que el architect resuelva con menos código.

- **D13. "Ver receta": botón o fila entera.** 018c-2 puso un botón secundario a todo el ancho debajo
  de cada receta.
  *Recomendación:* **la fila entera tocable** con "Ver receta" y flecha a la derecha: es un objetivo
  más grande y deja la lista más limpia. El texto sigue siendo `RECIPE_PICKER_TEXT.viewRecipe`.

- **D14. Orden con 018c-2 y 018d.** Comparten tres archivos del portal del plan.
  *Recomendación:* mergear 018c-2 y 018d-1 a `develop` antes de arrancar 017d-3, rebasar esta rama
  y hacer el plan una sola vez. Si 018 se demora, 017d-3 espera (017d-1 y 017d-2 no dependen).

- **D15. Decimales en los gramos.** Hoy un alimento en gramos puede decir "37,5 g" (hasta un
  decimal).
  `formatGrams` de 018d también deja hasta un decimal ("270 g", "37,5 g").
  *Recomendación:* **dejarlo como está** (hasta un decimal, sin ceros de más) y usar el mismo
  formato en los ítems en gramos y en los gramos secundarios de las medidas caseras, para que el plan
  coincida con el PDF y con lo que dice la nutricionista. *Alternativa:* redondear a gramos enteros
  solo en el portal ("38 g"); se descarta porque la cantidad deja de coincidir con el PDF.

- **D16. "Descargar PDF".** Hoy es el botón lleno más visible del plan.
  *Recomendación:* `tinted`, debajo del título, con el texto "Descargar plan (PDF)". Lo principal de
  la pantalla es leer el plan.

- **D17. "Hoy anotaste N comidas" en el inicio.** *Recomendación:* sí; es una consulta de conteo
  barata y le da a la paciente una devolución inmediata. Sin metas ni rachas.

- **D18. Corte en tres entregas** (sección 7). *Recomendación:* aceptarlo, en el orden 017d-1 →
  017d-2 → 017d-3.

- **D19. Validación con la usuaria real.** No hay acceso a pacientes.
  *Recomendación:* en el recorrido de cada entrega, que el usuario haga en un celular real tres
  tareas como si fuera la mamá de una paciente de 8 años: (1) decir cuándo es el próximo turno;
  (2) decir qué come hoy en el almuerzo; (3) anotar la merienda con una foto. Anotar dónde duda.

- **D20. Fondo cálido del portal.** La SDD de fundaciones dejó para 017d revisar si `#FBFAF7` se
  distingue de las tarjetas blancas (Q4). *Recomendación:* mantenerlo y revisarlo en el recorrido de
  017d-1 a 390 px con brillo bajo; si las tarjetas se pierden, subir un punto la sombra de nivel 1
  solo en el portal.

---

## Resoluciones (2026-10-05, modo autónomo del orquestador)

El usuario pidió avanzar todas las HU de forma autónoma; se toman las recomendaciones del afinador.

- **D1–D20 aceptadas con su recomendación, salvo D14.**
- **D14 (cambia):** para no esperar los merges de #26/#27/#28, la rama de **017d-3** se arma desde la de 017d-2 con un
  `git merge feat/hu-018d-medidas-caseras` (que trae 018c-1, 018c-2 y 018d; todas ramas de senkuch4n). El PR de 017d-3
  se mergea después de #28. Si para entonces ya están en `develop`, se rebasea y el merge desaparece.
- **D19:** pendiente del usuario: las tres tareas en un celular real con la paciente (o él como paciente).
- **D18:** corte aceptado: 017d-1 → 017d-2 → 017d-3, ramas encadenadas.
