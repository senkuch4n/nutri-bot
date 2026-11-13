# HU-018d: Medidas caseras de alimentos sueltos

**Como** nutricionista (Lic. Daiana Ponce),
**quiero** cargar los alimentos del plan en medidas caseras ("1½ tazas de arroz hervido", "2 cdas
de aceite", "1 unidad mediana de manzana") y que el sistema las pase solo a gramos,
**para que** el plan que recibe el paciente se pueda seguir sin balanza y los macros del día sigan
siendo exactos.

Origen: partición de la HU-018 (`docs/hu-plan-recetas-buscador.md`, tabla "Corte propuesto",
fila 018d, y duda D21 "se decide al afinar las medidas caseras"). Épica 21 de
`docs/historias-usuario-nutridesk.md` ("Crudo/cocido, peso bruto/neto y medidas caseras"), en
su segunda historia: "usar medidas caseras (taza, cucharada, unidad mediana) que se conviertan a
gramos para poder darle al paciente indicaciones que pueda seguir sin balanza". Pedido de la
reunión (`hus-last-meet.md`): "poder tener variedad de medidas de las comidas para que mis
pacientes puedan adaptarse a los planes de alimentación. Por ejemplo medidas en gramos, caseras
(2 cucharas, 1 taza, etc.)".

---

## Contexto

### Qué existe hoy

- **`Food`** (HU-005, `packages/db/prisma/schema.prisma`): macros cada 100 g y un campo
  `unitHint` de **texto libre** ("1 taza ≈ 180 g"), máximo 120 caracteres, que **no convierte
  nada**. Solo se ve y se edita en el formulario de alimentos propios (`alimentos/own-food-form.tsx`,
  rotulado "Unidad de referencia · Solo informativo"). No aparece en el editor de comidas, ni en el
  portal, ni en el PDF. Los alimentos SARA 2 lo tienen vacío y **sus datos no se editan** (D3 de la
  HU-005): la ficha de un SARA 2 es de solo lectura. Los alimentos de demostración del seed traen
  `unitHint` con el patrón "N unidad ≈ X g" (algunos en ml: "1 vaso ≈ 200 ml").
- **Ítems del plan y de la plantilla** (`PlanMealItem` / `TemplateMealItem`, HU-018b/c): un
  alimento (`foodId`) con `quantityGrams`, un texto libre (`customLabel`) sin macros, o una receta
  (`recipeId` + `portions`), más `notes` y `weekday`. **No hay medida casera.** Hoy la única forma
  de decirle al paciente "1 taza" es escribirlo en la nota o en la descripción libre.
- **Editor de comidas** (`apps/web/src/components/meals-editor.tsx`, compartido por planes y
  plantillas): bloque "Agregar alimento" con `FoodPicker` + "Cantidad" en gramos
  (`NumberInput unit="g"`) + descripción libre + nota. Los ítems de alimento **no se editan**: se
  quitan y se vuelven a agregar. Los ítems de receta sí tienen un stepper de porciones en el lugar
  (`recipe-picker/portion-stepper.tsx`, pasos de ½).
- **Macros**: se calculan en vivo desde `quantityGrams` (`computeItemMacros` / `sumMacros` en
  `packages/core/src/nutrition.ts`, `apps/web/src/lib/meal-view.ts`), igual que la franja del día
  contra la prescripción (HU-018b), los micronutrientes (HU-010) y el impacto del buscador
  (HU-018c).
- **Recetas** (HU-018a): cada ingrediente (`RecipeIngredient`) tiene `grams` y `household`
  ("1 taza") como **dos campos independientes**. La medida casera es texto; los gramos los escribe
  ella. No hay conversión: si escribe "1 taza" no se completan gramos (D5 de la HU-018: "no se
  inventan gramos"). Ese patrón (texto + gramos, el paciente ve el texto) es el que se reutiliza
  para mostrar, pero acá la novedad es que **la conversión se guarda por alimento** y se calcula.
- **Portal** (`(portal)/portal/plan/portal-day-view.tsx`) y **PDF del plan** (`lib/plan-pdf.tsx`):
  cada ítem de alimento se muestra con su nombre y sus gramos ("Arroz blanco, hervido · 180 g").
- **Copias de ítems**: "Copiar este día a…" y "Repetir en todos los días"
  (`packages/db/domain/weeklyMenu.ts`), aplicar plantilla (`planTemplates.ts`) y el asistente IA
  del plan (`ai-actions.ts`, propone gramos).
- `git log -i --grep=casera` y `--grep=unitHint` no muestran trabajo previo; `grep household`
  solo encuentra el campo de texto de los ingredientes de receta.

### Cómo trabaja ella (material real)

En su plan real (`docs/planes-alimentacion/`, no versionado) las cantidades del paciente están
**en medida casera**, a veces con los gramos entre paréntesis: "1 vaso", "2 unidades",
"1 y 1/2 tazas (cocidas)", "3 cdas cocido o crudo", "2 rebanadas", "1 feta (20 gr) de jamón
cocido", "2 cdas (30 gr) de legumbres", "3/4 taza de legumbres cocidas", "1 cda aceite crudo",
"200 gr tamaño de mano, espesor 2 cm". Conclusiones:

- La medida depende del alimento: "1 cda" de aceite no pesa lo mismo que "1 cda" de legumbres
  cocidas. **La equivalencia es por alimento**, no una tabla genérica de unidades.
- Usa fracciones: ½, ¾, 1½.
- Al paciente le importa la medida; los gramos son referencia (a veces los pone, a veces no).
- Atiende desde los 5 años: a un chico le cambia la cantidad ("½ taza"), no la medida.

### Qué es lo nuevo

1. **Medidas caseras por alimento**: en la ficha de cualquier alimento (SARA 2 o propio), una
   lista "Medidas caseras" con nombre ("taza", "cda", "unidad mediana") y cuánto pesa una
   ("1 taza = 180 g"). En los SARA 2 la composición sigue bloqueada; las medidas son de ella y se
   pueden cargar.
2. **Agregar un alimento en medida casera** en el editor de comidas (planes y plantillas): elegir
   la medida y la cantidad (¼, ½, ¾, 1, 1½…) y ver al instante cuántos gramos son. Los macros se
   calculan con esos gramos, como hoy.
3. **Crear una medida desde el editor**, sin salir del plan, cuando el alimento todavía no tiene
   ninguna.
4. **Cambiar la cantidad de un ítem en medida casera en el lugar** (stepper, como las porciones de
   las recetas).
5. **El paciente ve la medida casera** en el portal y en el PDF ("1½ tazas").
6. **Los `unitHint` que se puedan leer** ("1 taza ≈ 180 g") se convierten en medidas.

---

## Corte propuesto (recomendación)

La HU entera es mediana. Se propone partirla en dos para entregar valor antes:

| Parte | Qué incluye | Schema |
|---|---|---|
| **018d-1 — Medidas caseras en el plan** | Medidas por alimento en la ficha, crear medida desde el editor, agregar alimento en medida casera en planes y plantillas, stepper de cantidad, copias (día, semana, plantilla) que conservan la medida, portal y PDF con la medida, kcal por medida en la ficha, migración de los `unitHint` legibles | Sí (modelo nuevo + columnas en los ítems) |
| **018d-2 — Medidas caseras en las recetas** (opcional) | En el ingrediente de una receta, si el alimento tiene medidas, elegir una y que complete los gramos; en la revisión de la carga asistida, sugerir los gramos cuando la línea trae una medida conocida ("una taza" + alimento con "taza") como sugerencia a confirmar, nunca automática. Carga de una tabla semilla de medidas si ella pasa una (D2) | No (o mínimo) |

**Orden:** 018d-1 primero; 018d-2 solo si ella lo pide después de usar la primera. Los criterios
de abajo son de 018d-1 salvo el último Feature, marcado como 018d-2.

Lo que queda de la épica 21 (crudo ↔ cocido con factor de rendimiento y peso bruto/neto) **no**
entra: ver Fuera de alcance y D12.

---

## Criterios de aceptación

```gherkin
Feature: Medidas caseras de cada alimento

  Background:
    Given la profesional está logueada en el panel

  Scenario: Agregar una medida a un alimento SARA 2
    Given abre la ficha de "Arroz blanco, hervido" (SARA 2)
    And la composición se ve como solo lectura, como hoy
    When en "Medidas caseras" toca "Agregar medida"
    And elige o escribe el nombre "taza"
    And escribe que 1 taza pesa 180 g
    And toca "Guardar"
    Then la lista muestra "1 taza = 180 g · 234 kcal"
    And ve el aviso "Medida guardada"
    And la composición del alimento no cambió

  Scenario: Agregar una medida a un alimento propio
    Given abre la ficha de un alimento propio
    When agrega la medida "feta" de 20 g
    Then la lista muestra "1 feta = 20 g" con sus kcal

  Scenario: Varias medidas en un mismo alimento
    Given "Aceite de oliva" tiene la medida "cda = 10 g"
    When agrega "cdita = 5 g"
    Then la lista muestra las dos, en el orden en que se cargaron
    And la primera de la lista es la que se propone al agregarlo a un plan (ver D13)

  Scenario: Datos inválidos
    When intenta guardar una medida sin nombre
    Then ve "Escribí el nombre de la medida (por ejemplo, taza)"
    When escribe 0 g, un número negativo o más de 2000 g
    Then ve "Escribí cuántos gramos pesa una (entre 0,1 y 2000)"
    When escribe un nombre que ese alimento ya tiene ("Taza" y ya existe "taza")
    Then ve "Este alimento ya tiene la medida «taza»"
    And no se guarda nada

  Scenario: Cambiar o borrar una medida no cambia los planes ya armados
    Given "Arroz blanco, hervido" tiene "1 taza = 180 g"
    And el plan de un paciente tiene "1½ tazas" de arroz (270 g)
    When la profesional cambia la medida a "1 taza = 160 g"
    Then el plan del paciente sigue mostrando "1½ tazas · 270 g" con los mismos macros
    And los ítems que agregue desde ahora usan 160 g por taza
    When borra la medida "taza"
    Then el plan del paciente sigue igual
    And "taza" ya no se ofrece al agregar ese alimento

  Scenario: Plural automático con vista previa
    When escribe el nombre "unidad mediana"
    Then ve la vista previa "2 unidades medianas"
    And si la vista previa no es correcta puede escribir el plural a mano en "¿Se escribe distinto en plural?"


Feature: Agregar un alimento en medida casera al plan

  Background:
    Given la profesional edita el plan de un paciente (o una plantilla)
    And está en "Almuerzo · Martes"

  Scenario: Alimento con medidas: la medida casera es la opción por defecto
    Given "Arroz blanco, hervido" tiene "1 taza = 180 g"
    When en "Agregar alimento" elige "Arroz blanco, hervido"
    Then "Cantidad" pasa a "Medida casera" con la medida "taza" ya elegida y la cantidad 1
    And ve "= 180 g" al lado
    When sube la cantidad a 1½
    Then ve "= 270 g"
    When toca "Agregar al martes"
    Then el ítem aparece como "Arroz blanco, hervido — 1½ tazas" con "270 g" en gris
    And sus macros son los de 270 g
    And la franja del día (kcal, P, C, G contra el objetivo) se actualiza

  Scenario: Pasar a gramos
    Given eligió un alimento que tiene medidas
    When toca "Gramos" en el selector "Medida casera | Gramos"
    Then carga los gramos como hoy
    And el ítem se guarda sin medida casera, como los ítems de siempre

  Scenario: Alimento sin medidas
    Given "Quinoa, cocida" no tiene medidas
    When la elige
    Then "Cantidad" queda en "Gramos", como hoy
    And debajo ve el botón "Agregar una medida casera a este alimento"

  Scenario: Crear una medida sin salir del plan
    Given eligió "Quinoa, cocida", que no tiene medidas
    When toca "Agregar una medida casera a este alimento"
    And en el cuadro escribe "taza" y 185 g y toca "Guardar"
    Then el cuadro se cierra con el aviso "Medida guardada en Quinoa, cocida"
    And "Cantidad" pasa a "Medida casera" con "taza" elegida
    And la medida queda guardada en el alimento para los próximos planes

  Scenario: Cantidades posibles
    When usa el stepper de cantidad
    Then puede elegir entre ¼ y 20, de a ¼
    And se muestra con fracciones: "¼", "½", "¾", "1", "1¼", "1½", "2"

  Scenario: Medida casera sin alimento
    Given no eligió ningún alimento y escribe una descripción libre
    Then el selector "Medida casera | Gramos" no aparece
    And la descripción libre funciona como hoy (sin macros)

  Scenario: Cambiar la cantidad de un ítem ya agregado
    Given el día tiene "Arroz blanco, hervido — 1½ tazas · 270 g"
    When toca "+" en el stepper del ítem
    Then pasa a "2 tazas · 360 g" sin recargar la página
    And los macros del ítem y la franja del día se recalculan
    And si falla el guardado, vuelve a "1½ tazas" y ve "No se pudo cambiar la cantidad. Probá de nuevo."

  Scenario: Las copias conservan la medida
    Given el martes tiene "Arroz blanco, hervido — 1½ tazas"
    When usa "Copiar este día a…" jueves, o "Repetir en todos los días"
    Then en los días copiados el ítem dice "1½ tazas · 270 g"
    Given una plantilla tiene "Aceite de oliva — 1 cda"
    When aplica la plantilla a un paciente
    Then el plan del paciente dice "Aceite de oliva — 1 cda · 10 g"

  Scenario: Los ítems anteriores no cambian
    Given un plan armado antes de esta HU tiene "Banana · 120 g"
    Then se sigue viendo y calculando igual, en gramos


Feature: Lo que ve el paciente

  Scenario: Portal con medida casera
    Given el plan del paciente tiene "Arroz blanco, hervido — 1½ tazas" (270 g) el martes
    When el paciente abre "Mi plan" en el portal, en el martes
    Then ve "Arroz blanco, hervido" y a la derecha "1½ tazas"
    And debajo, en chico y gris, "270 g" (ver D3)

  Scenario: Portal con un ítem en gramos
    Given el plan tiene "Banana · 120 g" sin medida casera
    Then el paciente ve "120 g", como hoy

  Scenario: PDF del plan
    When la profesional genera el PDF del plan
    Then cada ítem con medida casera sale como "1½ tazas (270 g)"
    And los ítems en gramos salen como hoy


Feature: Lo que ya estaba anotado como texto (unitHint)

  Scenario: Convertir las referencias legibles
    Given un alimento propio tiene la referencia "1 taza ≈ 180 g"
    When se aplica esta HU
    Then el alimento tiene la medida "taza = 180 g"

  Scenario: Referencias que no se pueden leer
    Given un alimento propio tiene la referencia "porción chica"
    When abre su ficha
    Then en "Medidas caseras" ve "Tenías anotado: «porción chica». Pasalo a una medida para usarlo en los planes."
    And un botón "Pasar a medida" que abre el cuadro de nueva medida con el nombre prellenado


# 018d-2 (opcional)
Feature: Medidas caseras en los ingredientes de una receta

  Scenario: Elegir una medida del alimento en un ingrediente
    Given edita una receta y un ingrediente tiene el alimento "Aceite de oliva" (con "cda = 10 g")
    When en "Medida casera" elige "2 cdas" de las sugerencias
    Then "Gramos" se completa con 20
    And puede cambiar los gramos a mano

  Scenario: Sugerencia en la revisión de la carga asistida
    Given un borrador tiene la línea "Aceite de oliva 2 cdas" vinculada a "Aceite de oliva"
    Then el ingrediente muestra "¿Usar 20 g (2 cdas)?" para confirmar
    And no se completa ningún gramo sin que ella lo confirme
```

---

## Datos que se registran

**Medida casera de un alimento** (nuevo, uno a muchos con `Food`):

| Dato | Obligatorio | Uso |
|---|---|---|
| Alimento | Sí | A qué alimento pertenece (SARA 2 o propio) |
| Nombre, en singular ("taza", "cda", "unidad mediana") | Sí, máx. ~40 caracteres, único por alimento sin distinguir mayúsculas ni tildes | Lo que se muestra con la cantidad ("1 taza") |
| Plural ("unidades medianas") | No | Solo si el plural automático no sirve (D6) |
| Gramos que pesa una | Sí, > 0 y ≤ 2000, 1 decimal | La conversión |
| Orden | Sí (automático) | La primera se propone al agregar (D13) |

**Ítem del plan y de la plantilla** (columnas nuevas en `PlanMealItem` y `TemplateMealItem`):

| Dato | Obligatorio | Uso |
|---|---|---|
| Cantidad de medidas (¼ a 20, de a ¼) | Solo si el ítem es en medida casera | "1½" |
| Nombre de la medida (copia) y su plural | Ídem | Se copia al agregar, así cambiar o borrar la medida no altera planes ya armados (D4) |
| Gramos por medida (copia) | Ídem | Para recalcular al cambiar la cantidad con el stepper |
| `quantityGrams` (ya existe) | Ídem | Cantidad × gramos por medida. **Todo el cálculo de macros sigue usando este campo**, sin cambios |

`unitHint`: los legibles se convierten en medidas (D9); el campo deja de mostrarse en el
formulario de alimentos propios.

---

## Diseño UX

Principio: ella no maneja bien la computadora. Cada pantalla tiene **una** acción nueva, con
textos en criollo y ejemplos; nada de unidades abreviadas sin explicar.

### Ficha del alimento (`/alimentos/[id]`)

- Tarjeta nueva **"Medidas caseras"**, arriba de "Energía" (es lo que más va a usar). Texto de
  ayuda: "Cuánto pesa una taza, una cucharada o una unidad de este alimento. Se usan para armar
  planes en medidas caseras."
- Lista: "1 taza = 180 g · 234 kcal", con botones "Editar" y "Quitar" (con confirmación: "¿Quitar
  la medida «taza»? Los planes que ya la usan no cambian."). Flechas subir/bajar como en los
  ingredientes de receta.
- Vacía: "Todavía no tiene medidas caseras." + botón grande "Agregar medida".
- Cuadro "Agregar medida": 
  - "Medida" con **chips de sugerencias** para tocar en vez de escribir: taza, taza de té,
    pocillo, vaso, cda (cucharada), cdita (cucharadita), unidad chica, unidad mediana, unidad
    grande, feta, rebanada, plato, porción, puñado, pote, lata. También se puede escribir.
  - "¿Cuántos gramos pesa 1?" con `NumberInput unit="g"` y la ayuda "Para líquidos, 1 ml ≈ 1 g".
  - Vista previa en vivo: "1 taza de Arroz blanco, hervido = 180 g · 234 kcal" y "2 tazas = 360 g".
  - Enlace chico "¿Se escribe distinto en plural?" que abre el campo de plural.
  - Botones "Guardar" / "Cancelar". Errores debajo de cada campo (textos en el Gherkin). Al
    guardar, toast "Medida guardada".
- En los SARA 2 la tarjeta es editable aunque el resto de la ficha sea de solo lectura; un texto
  aclara "Las medidas son tuyas; la composición es de la tabla SARA 2 y no cambia".

### Editor de comidas (planes y plantillas)

- En "Agregar alimento", al elegir un alimento aparece debajo de "Alimento" un **selector
  segmentado "Medida casera | Gramos"** (`SegmentedControl`, ya existe). Default: "Medida
  casera" si el alimento tiene medidas; si no, "Gramos" y el selector no aparece.
- Modo "Medida casera": una fila con **stepper de cantidad** (botones − / + grandes, de a ¼,
  mostrando fracciones), un **desplegable de medida** ("taza (180 g)", "cda (15 g)") y el
  resultado **"= 270 g"** en grande. El botón "Agregar al martes" no cambia.
- Sin medidas: botón secundario "Agregar una medida casera a este alimento" que abre el mismo
  cuadro de la ficha (Modal). Al guardar, vuelve al formulario con la medida elegida.
- El ítem en la lista: nombre del alimento; a la derecha **"1½ tazas"** y debajo, en gris,
  "270 g"; el stepper aparece al lado (mismo componente que las porciones de receta). Macros como
  hoy. Error del stepper: vuelve al valor anterior y toast "No se pudo cambiar la cantidad. Probá
  de nuevo."
- Los ítems en gramos se ven como hoy.

### Portal del paciente (`/portal/plan`)

- Ítem en medida casera: nombre a la izquierda, **"1½ tazas"** a la derecha en el tamaño normal y
  "270 g" debajo en chico y gris (D3). Ítem en gramos: como hoy.

### PDF del plan

- "1½ tazas (270 g)" en la columna de cantidad (D3). Nada más cambia en el documento.

### Bot de WhatsApp

No interviene.

---

## Fuera de alcance

- **Crudo ↔ cocido con factor de rendimiento y peso bruto/neto** (la otra historia de la épica
  21). Hoy crudo y cocido son dos alimentos distintos de SARA 2 y así siguen. Ver D12.
- **Una tabla genérica de unidades** ("1 cda = 15 g para todo"): la equivalencia es siempre por
  alimento.
- **Medidas distintas según la edad del paciente** ("taza chica" para chicos): se ajusta la
  cantidad (½ taza), no la medida. Si hace falta, ella crea "taza chica" en el alimento.
- **Rangos** ("2 o 3 unidades") y **tercios** (⅓ taza): no se cargan como cantidad; si los
  necesita, van en la nota del ítem (D5).
- **Cargar una tabla de medidas de referencia** (atlas fotográfico, tablas de intercambio) sin
  que ella la pase: no se inventan gramos (D2).
- **Asistente IA del plan**: sigue proponiendo gramos.
- **Editar los ítems en gramos en el lugar** (sigue siendo quitar y volver a agregar). Solo los
  ítems en medida casera ganan el stepper.
- **Equivalencias / reemplazos para el paciente** ("1 huevo = 2 cdas de legumbres"): es material
  educativo, otra HU.
- **Medidas en la porción de las recetas** (`portionHousehold` sigue siendo texto) y, salvo que
  se haga 018d-2, en los ingredientes.
- Rediseño visual de estas pantallas (HU-017e).

---

## Notas de implementación

- **Clave del diseño**: el ítem en medida casera guarda igual `quantityGrams` (cantidad × gramos
  por medida). Así `computeItemMacros`, la franja del día, el promedio semanal, los
  micronutrientes y el impacto del buscador de recetas **no cambian**. Lo nuevo es solo cómo se
  carga y cómo se muestra.
- Lógica pura en `packages/core` con sus tests: gramos de una medida, formato de fracciones
  ("1½"), plural (reglas del español + abreviaturas "cda"→"cdas", "cdita"→"cditas"; una palabra
  terminada en vocal suma "s", en consonante "es"; se pluraliza cada palabra del nombre), y el
  parser de `unitHint` ("N <nombre> ≈ X g|ml", ml como g).
- **Todos los lugares que copian ítems** tienen que copiar las columnas nuevas: `copyDay`,
  `repeatMealInAllDays`, `restoreMealSnapshots` (deshacer), `applyTemplateToPatient`, guardar un
  plan como plantilla si existe, y `meal-view.ts`. `grep customLabel` da la lista.
- La migración de `unitHint` va en SQL o en un script idempotente; respaldo con `pg_dump` antes.
  Columnas nuevas nullable en los ítems (sin backfill).
- Zona de imleticio: `meals-editor.tsx`, `alimentos/**`, `plan-pdf.tsx`, `portal-day-view.tsx`.
  Coordinar con la HU-015 (rehace el PDF del plan) y la HU-017e (rediseño de planes/alimentos).
  Toca `schema.prisma`: regla de una sola HU con migración en `implementando` a la vez.
- El detalle técnico lo define el `architect`.

---

## Dudas para validar con el usuario

**D1. De dónde salen las equivalencias (la D21 de la HU-018).** (a) Las carga ella, por alimento;
(b) una tabla de referencia publicada precargada; (c) las dos. **Recomendación:** (a) para 018d-1,
con dos ayudas para que no sea pesado: crear la medida desde el editor sin salir del plan (D7) y
convertir los `unitHint` que ya tenía (D9). Se carga de a poco, a medida que arma planes, y en
pocas semanas los alimentos que más usa ya las tienen. (b) solo si ella tiene una tabla propia
(D2).

**D2. ¿Usa una tabla de medidas caseras de referencia?** Si tiene una (Excel, PDF o la de su
formación) que confíe, se puede precargar como medidas de los SARA 2. **Recomendación:**
preguntárselo; si la tiene, se carga en 018d-2 como semilla revisable. Si no, no se precarga nada:
no se inventan gramos.

**D3. ¿Qué ve el paciente: solo la medida, o la medida con los gramos?** Su plan real a veces
pone "1 feta (20 gr)" y a veces solo "1 vaso". (a) Medida y gramos chicos en gris; (b) solo la
medida; (c) una opción por plan. **Recomendación:** (a): sigue su propia costumbre, al que tiene
balanza le sirve y al que no, no le molesta. (c) agrega una decisión más cada vez que arma un
plan.

**D4. Si cambia o borra una medida, ¿cambian los planes ya armados?** **Recomendación:** no. El
ítem guarda una copia del nombre y los gramos de la medida en el momento de agregarlo. Un plan
que el paciente ya tiene no debería cambiar solo; si quiere corregirlo, quita el ítem y lo vuelve
a agregar.

**D5. Qué cantidades se pueden cargar.** **Recomendación:** de ¼ a 20 en pasos de ¼ (cubre ½,
¾, 1½, que es lo que usa). Tercios (⅓) y rangos ("2 o 3") van en la nota del ítem. Confirmar que
no usa tercios seguido.

**D6. Plural.** "1 taza" / "2 tazas", "1 unidad mediana" / "2 unidades medianas".
**Recomendación:** automático con vista previa al cargar la medida, y un campo de plural opcional
escondido para los casos raros. Así no tiene que escribir dos veces lo mismo.

**D7. Crear una medida desde el editor del plan.** **Recomendación:** sí. Es lo que hace que (a)
de D1 funcione: ella está armando el plan, se da cuenta de que falta "taza" en la quinoa, la
crea ahí y sigue.

**D8. Líquidos en ml.** La medida se guarda siempre en gramos. **Recomendación:** tomar 1 ml ≈ 1 g
(como se hace en la práctica para leche, yogur, jugos) con la ayuda "Para líquidos, 1 ml ≈ 1 g" en
el formulario. El aceite (1 ml ≈ 0,9 g) ella lo carga en gramos si quiere precisión.

**D9. Qué pasa con la "Unidad de referencia" (`unitHint`).** **Recomendación:** convertir en
medidas las que tengan la forma "N nombre ≈ X g/ml"; las que no, mostrarlas en la ficha como
"Tenías anotado: «…»" con un botón para pasarlas a medida; y sacar el campo del formulario de
alimentos propios (las medidas lo reemplazan). Se mantiene la columna en la base por ahora.

**D10. Stepper para cambiar la cantidad de un ítem ya agregado.** Hoy los ítems de alimento no se
editan. **Recomendación:** sí, solo para los ítems en medida casera, con el mismo componente que
las porciones de receta. Pasar de "1 taza" a "1½" es el ajuste más común y quitar y volver a
agregar es engorroso para ella.

**D11. Medidas en los ingredientes de las recetas (018d-2).** **Recomendación:** dejarlo para
después de que use 018d-1. Las recetas ya tienen medida casera y gramos como texto y funcionan;
el beneficio es ahorrar escribir los gramos.

**D12. Crudo/cocido y peso bruto/neto (resto de la épica 21).** **Recomendación:** HU aparte
(018e) si ella lo pide. Hoy elige el alimento cocido o crudo de SARA 2 y el cálculo ya es
correcto; el factor de rendimiento sirve para cargar "60 g de arroz crudo" y mostrar "1 taza
cocida", que es otra conversación.

**D13. Qué medida se propone por defecto.** **Recomendación:** la primera de la lista del
alimento, que ella puede reordenar con las flechas. Sin "marcar como principal": una cosa menos.

**D14. Nombre del selector en el editor.** "Medida casera | Gramos". **Recomendación:** dejarlo
así; confirmar que "medida casera" es como ella lo llama (en su plan escribe "porciones" y
"medidas").

---

## Resoluciones (2026-10-04, modo autónomo del orquestador)

El usuario pidió avanzar todas las HU de forma autónoma; se toman las recomendaciones del afinador.

| Duda | Resolución |
|---|---|
| D1 | (a) las carga ella, con creación desde el editor (D7) y conversión de `unitHint` (D9) |
| D2 | **Pendiente de preguntarle a la nutricionista.** No bloquea 018d-1; si tiene tabla, se carga en 018d-2 como semilla revisable. No se inventan gramos |
| D3 | (a) medida + gramos chicos en gris |
| D4 | El ítem guarda copia del nombre y los gramos de la medida |
| D5 | ¼ a 20 en pasos de ¼; tercios y rangos en la nota |
| D6 | Plural automático con vista previa + campo de plural opcional |
| D7 | Sí, crear medida desde el editor |
| D8 | 1 ml ≈ 1 g con la ayuda en el formulario |
| D9 | Convertir los legibles, mostrar los demás con botón, sacar el campo del formulario; la columna queda |
| D10 | Stepper solo para ítems en medida casera |
| D11 | 018d-2 queda **opcional**, solo si ella la pide después de usar 018d-1 |
| D12 | Crudo/cocido y bruto/neto: HU aparte (018e) solo si ella lo pide |
| D13 | Por defecto, la primera de la lista; reordenable con flechas |
| D14 | "Medida casera | Gramos" |

**Corte aprobado:** se implementa 018d-1. 018d-2 no entra en esta HU.
