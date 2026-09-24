# HU-005: Base de alimentos argentina (SARA 2)

**Como** profesional (nutricionista),
**quiero** tener cargados los alimentos de la tabla oficial SARA 2, con sus kcal desglosadas por
Atwater (CHO × 4 + P × 4 + G × 9, más alcohol × 7), y poder sumar mis alimentos propios marcados
con su fuente,
**para que** pueda armar planes con datos argentinos oficiales sin cargar alimentos a mano, y
explicarle al paciente de dónde salen las calorías.

Origen: épica 20 de `docs/historias-usuario-nutridesk.md`. Fuente de datos:
`docs/tabla-composicion-quimica-alimentos-argentina_ennys2__.pdf` (SARA 2: Tabla de composición
química de alimentos para Argentina. Compilación para ENNyS 2. Ministerio de Salud de la Nación,
2022, 142 páginas).

---

## Contexto

### Qué existe hoy

- **Modelo `Food`** (`packages/db/prisma/schema.prisma`): `name`, `group` (enum `FoodGroup`),
  `kcalPer100` `Decimal(6,2)`, `proteinPer100`, `carbsPer100`, `fatPer100` `Decimal(5,2)`,
  `fiberPer100` (nullable), `unitHint` (texto libre, p. ej. "1 taza ≈ 180 g"), `active`. No
  guarda la fuente ni ningún micronutriente.
- **Enum `FoodGroup`**: 10 valores (`CEREALES`, `LACTEOS`, `CARNES_Y_HUEVOS`, `FRUTAS`,
  `VERDURAS`, `LEGUMBRES`, `GRASAS`, `AZUCARES_Y_DULCES`, `BEBIDAS`, `OTROS`). Las etiquetas están
  en `apps/web/src/lib/food-groups.ts`.
- **Los 90 alimentos de la base de desarrollo** son los de `packages/db/prisma/seed.ts` (el seed
  los crea solo si la tabla está vacía). Son genéricos ("Arroz blanco cocido", "Leche entera"…)
  con kcal cargadas a mano, que **no siempre cumplen Atwater**. Por ejemplo, "Arroz blanco
  cocido" tiene 130 kcal y por macros da 2,7 × 4 + 28 × 4 + 0,3 × 9 = 125,5. Algunos los usan
  planes y plantillas reales (`PlanMealItem.foodId`, `TemplateMealItem.foodId`, FK nullable sin
  cascada).
- **Los planes no guardan una foto de los macros.** `apps/web/src/lib/meal-view.ts` y
  `computeItemMacros` (`packages/core/src/nutrition.ts`) calculan en el momento con los valores
  **actuales** del `Food`. Editar un alimento cambia los totales de todos los planes que lo usan,
  incluidos los ya entregados.
- **Pantalla `/alimentos`** (rediseñada en la HU-002d): tabla (`DataTable`) con búsqueda por
  nombre, filtro por grupo, columnas Alimento / Grupo / Energía / Proteínas / Carbohidratos /
  Grasas y la marca "Inactivo". `/alimentos/nuevo` y `/alimentos/[id]` usan el mismo `FoodForm`,
  donde las kcal **se cargan a mano**. Se puede activar o desactivar, pero no borrar.
- **Selector de alimentos del editor de comidas** (`apps/web/src/components/meals-editor.tsx`,
  que usan planes y plantillas): un `<select>` nativo con `<optgroup>` por grupo. Con 90
  alimentos funciona; **con ~1000 no se puede usar**.
- **Asistente IA del plan** (`ai-actions.ts`): le manda al modelo **todo** el catálogo activo
  (id, nombre, grupo, kcal).
- **Dominio** (`packages/db/domain/foods.ts`): `listFoods`, `createFood`, `updateFood`.
- `git log` no muestra trabajo previo sobre SARA ni sobre una importación de alimentos.

### Cómo es la tabla SARA 2 (visto con `pdftotext -layout`)

- 26 tablas por grupo, siguiendo las Guías Alimentarias. Cada una tiene una parte **"A"**
  (macronutrientes: kcal, agua, proteínas, lípidos, colesterol, perfil de ácidos grasos, CHO
  disponibles, CHO totales, azúcar total, azúcar agregado, fibra, alcohol) y una **"B"** (cenizas,
  sodio, potasio, calcio, cobre, fósforo, hierro, magnesio, zinc, niacina, folato EFD, ácido
  fólico, vitamina A RAE, retinol, tiamina, riboflavina, B12, C y D). Todo es **cada 100 g de
  porción comestible**. En total son 39 componentes.
- Las kcal están calculadas con **4 kcal/g para CHO disponibles, 4 para proteínas, 9 para
  lípidos y 7 para alcohol** (sección "Valor energético"). La fibra no suma kcal. Es la regla de
  la nutricionista, con el alcohol agregado.
- En SARA 2, "carbohidratos" quiere decir **CHO disponibles** (totales menos fibra), igual que el
  rotulado nutricional argentino. Los CHO totales se informan aparte, solo para comparar.
- **Crudo y cocido son filas distintas** ("Arroz blanco, crudo" / "Arroz blanco, hervido"). A
  veces las dos tienen los mismos valores.
- **Celda vacía no es cero:** la tabla dice que se dejó en blanco cuando no se pudo estimar un
  nutriente que podría ser significativo. El cero asumido es otro caso.
- Irregularidades del PDF que la importación tiene que tolerar:
  - hay nombres que ocupan dos renglones, a veces con guion ("Yogur descremado con frutas y ce-"
    / "reales") y a veces con los números entre los dos pedazos ("Sal dietética o modificada,
    PRO-" / números / "MEDIO");
  - los títulos no son uniformes: "Tabla 5A" sin punto, la parte B de yogures también se titula
    "5A", la B de azúcares dice "Tabla 16.B", la tabla 19 (sales) aparece solo como 19.A, 13.A se
    repite sin "(continuación)", y hay títulos en mayúsculas;
  - la tabla 26 (suplementos) no viene cada 100 g: viene por gramo, por mililitro o cada 100
    unidades (comprimidos, gotas), según lo que diga entre paréntesis.
- La propia SARA 2 verificó que **la suma de macronutrientes quedara entre 97 y 103 g** (agua +
  proteínas + lípidos + CHO disponibles + fibra + cenizas + alcohol). Las cenizas están en la
  parte B, así que esa validación necesita las dos partes del alimento.

### Qué es lo nuevo

1. **Importación de SARA 2 desde el PDF**, con validaciones (suma de macros y kcal por Atwater) y
   un **reporte** de las filas que no se pudieron leer o no pasaron la validación. Esas filas no
   se inventan ni se corrigen a mano.
2. **Fuente del alimento**: "SARA 2" o "Propio".
3. **Los 26 grupos de SARA 2** reemplazan a los 10 grupos actuales. Se agrega "Otros" para
   alimentos propios que no entran en ninguno (ver D2).
4. **Nutrientes nuevos**: columnas para sodio, azúcar agregado, grasas saturadas, colesterol y
   alcohol, y el resto de los 39 aparte (ver D4).
5. **Kcal por Atwater con desglose**, en la ficha del alimento y por porción.
6. **Alimentos propios** con kcal calculadas a partir de los macros (ya no se cargan a mano).
7. **Selector de alimentos con búsqueda** en el editor de comidas, porque con ~1000 alimentos el
   `<select>` actual no se puede usar.

---

## Criterios de aceptación

```gherkin
Feature: Importación de la tabla SARA 2

  Background:
    Given el PDF "docs/tabla-composicion-quimica-alimentos-argentina_ennys2__.pdf"

  Scenario: Se importan los alimentos que pasan las validaciones
    When se corre la importación de SARA 2
    Then cada fila legible de las tablas 1 a 25 queda como un alimento con fuente "SARA 2"
    And su grupo es el de la tabla de la que salió
    And sus valores son los de la tabla, cada 100 g
    And su nombre es el nombre completo de la tabla, uniendo los que ocupan dos renglones
    And no queda ningún alimento con un nombre partido ("ce-", "MEDIO" sueltos)

  Scenario: Crudo y cocido quedan como alimentos separados
    Given la tabla tiene "Arroz blanco, crudo" y "Arroz blanco, hervido"
    When se corre la importación
    Then existen los dos alimentos, cada uno con sus propios valores
    And no se relacionan entre sí (el factor de rendimiento es de la épica 21)

  Scenario: Validación de la suma de macronutrientes
    Given una fila donde agua + proteínas + lípidos + CHO disponibles + fibra + cenizas + alcohol
      queda fuera del rango de 97 a 103 g
    When se corre la importación
    Then esa fila no se importa
    And aparece en el reporte con su nombre, su tabla, su página y el motivo "suma de macros = X g"

  Scenario: Validación de las kcal por Atwater
    Given una fila donde las kcal publicadas difieren de
      4 × CHO disponibles + 4 × proteínas + 9 × lípidos + 7 × alcohol
      más que la tolerancia acordada (ver D6)
    When se corre la importación
    Then esa fila no se importa
    And aparece en el reporte con las kcal publicadas, las calculadas y la diferencia

  Scenario: Filas que no se pueden leer
    Given una fila donde no se puede determinar el nombre o la cantidad de columnas no cierra
    Or una fila de la parte A que no tiene su pareja en la parte B, o al revés
    When se corre la importación
    Then esa fila no se importa ni se completa con valores inventados
    And aparece en el reporte con el texto crudo del renglón y el motivo

  Scenario: Celdas vacías
    Given una fila con un nutriente en blanco en la tabla
    When se importa
    Then ese nutriente queda como "sin dato" (null), no como 0
    And un 0 de la tabla queda como 0

  Scenario: Suplementos
    When se corre la importación
    Then las filas de la tabla 26 (suplementos) no se importan
    And el reporte las lista como "excluidas: no vienen cada 100 g" (ver D7)

  Scenario: Resumen de la importación
    When termina la importación
    Then el reporte dice cuántas filas se leyeron por tabla, cuántas se importaron,
      cuántas se rechazaron y por qué
    And si se rechazó más del 5 % de las filas, la importación se considera fallida
      y hay que revisar el lector antes de cargar nada (ver D6)

  Scenario: La importación se puede repetir sin duplicar
    Given SARA 2 ya se importó
    When se corre la importación otra vez
    Then no se crea ningún alimento duplicado
    And los alimentos SARA 2 conservan su id (los planes que los usan no se rompen)
    And no se modifica ni se borra ningún alimento "Propio"

  Scenario: La importación no toca a los alimentos que ya existen
    Given la base tiene los 90 alimentos cargados a mano, usados por planes y plantillas
    When se corre la importación
    Then los 90 siguen existiendo con el mismo id, nombre, macros y kcal
    And ningún plan ni plantilla cambia sus totales
```

```gherkin
Feature: Migración de los alimentos existentes

  Scenario: Los alimentos existentes pasan a ser "Propio"
    Given un alimento que existía antes de esta HU
    When se aplica la migración
    Then su fuente es "Propio"
    And conserva id, nombre, kcal, macros, fibra, unidad de referencia y estado activo
    And su grupo pasa al grupo nuevo según la tabla de equivalencias (ver D2)

  Scenario: Kcal cargadas a mano que no cumplen Atwater
    Given el alimento propio "Arroz blanco cocido" con 130 kcal y macros que dan 125,5 kcal
    When la profesional abre su ficha
    Then ve un aviso "Las kcal cargadas (130) no coinciden con el cálculo por macros (125,5)"
    And un botón "Usar 125,5 kcal"
    And las kcal no cambian hasta que ella lo confirme (ver D1)
```

```gherkin
Feature: Lista de alimentos

  Scenario: Filtrar por fuente y por grupo
    Given hay alimentos SARA 2 y propios
    When la profesional entra a "/alimentos"
    Then ve un filtro de fuente: "Todas", "SARA 2", "Propios"
    And el filtro de grupo ofrece los grupos nuevos
    And cada fila muestra la fuente con una etiqueta ("SARA 2" o "Propio")

  Scenario: Búsqueda que ignora tildes y mayúsculas
    When busca "limon"
    Then encuentra "Limón, crudo"

  Scenario: Lista larga
    Given hay alrededor de 1000 alimentos
    Then la lista sigue siendo usable: la búsqueda responde sin demoras visibles
      y la tabla pagina o virtualiza (lo decide el architect)
```

```gherkin
Feature: Ficha de un alimento

  Scenario: Desglose de kcal cada 100 g
    Given el alimento "Arroz blanco, hervido"
    When la profesional abre su ficha
    Then ve las kcal cada 100 g y su desglose:
      "Proteínas 2,4 g × 4 = 9,6 kcal", "Carbohidratos 28,6 g × 4 = 114,4 kcal",
      "Grasas 0,2 g × 9 = 1,8 kcal", total 125,8 kcal (la tabla publica 126) (y "Alcohol X g × 7" solo si tiene alcohol)
    And el total del desglose coincide con las kcal que se muestran

  Scenario: Desglose de una porción
    Given la ficha de un alimento
    When la profesional escribe 150 g en "Calcular porción"
    Then ve kcal y macros de 150 g con el mismo desglose

  Scenario: Otros nutrientes
    When abre la ficha de un alimento SARA 2
    Then ve sodio, azúcar agregado, grasas saturadas, colesterol y fibra
    And en una sección plegable "Más nutrientes" ve el resto de los 39, con su unidad
    And los que no tienen dato dicen "Sin dato", distinto de 0

  Scenario: Un alimento SARA 2 no se edita
    Given un alimento con fuente "SARA 2"
    When la profesional abre su ficha
    Then los valores se ven en modo lectura, sin formulario de edición
    And ve la leyenda "Dato oficial de SARA 2 (Ministerio de Salud, 2022)"
    And puede "Desactivar" / "Activar"
    And puede "Duplicar como propio" (ver D3)

  Scenario: Duplicar un alimento SARA 2 como propio
    Given la ficha de "Queso cremoso"
    When la profesional toca "Duplicar como propio"
    Then se abre el formulario de alimento nuevo con todos los valores precargados,
      el nombre "Queso cremoso (copia)" y la fuente "Propio"
    And al guardar queda un alimento nuevo; el original de SARA 2 no cambia
```

```gherkin
Feature: Alimentos propios

  Scenario: Crear un alimento propio
    When la profesional crea un alimento en "/alimentos/nuevo"
    Then carga nombre, grupo, proteínas, carbohidratos disponibles y grasas (obligatorios)
    And opcionalmente fibra, sodio, azúcar agregado, grasas saturadas, colesterol, alcohol,
      referencia (p. ej. "Rótulo Granix, 2026") y unidad de referencia
    And no carga las kcal: se calculan solas mientras escribe, con el desglose a la vista
    And al guardar queda con fuente "Propio"

  Scenario: Editar un alimento propio
    Given un alimento propio
    When la profesional cambia sus macros y guarda
    Then las kcal se recalculan por Atwater
    And ve el aviso "Cambiar este alimento cambia los totales de los planes que lo usan (N planes, M plantillas)"
      antes de guardar, si lo usa algún plan o plantilla

  Scenario: Macros imposibles
    When carga proteínas + carbohidratos + grasas + fibra + alcohol mayor a 100 g
    Then no se guarda y ve "Los nutrientes suman más de 100 g cada 100 g de alimento."
```

```gherkin
Feature: Elegir alimentos al armar un plan o una plantilla

  Scenario: Selector con búsqueda
    Given el editor de comidas de un plan o una plantilla
    When la profesional escribe "arroz" en "Agregar alimento"
    Then ve los alimentos activos que coinciden (sin importar tildes), con su grupo y su fuente
    And puede elegir uno con el teclado o con el mouse
    And sigue existiendo la opción "Alimento libre / sin macros"

  Scenario: Desglose por porción en el plan
    Given un plan con "Arroz blanco, hervido" 150 g
    When la profesional pasa el mouse o toca las kcal del ítem
    Then ve el desglose "P 14,4 kcal · CHO 171,6 kcal · G 2,7 kcal" de esa porción (ver D11)

  Scenario: Planes existentes
    Given un plan que usa alimentos que ahora son "Propio"
    When se abre después de la migración
    Then muestra los mismos alimentos, cantidades y totales que antes
```

```gherkin
Feature: Asistente IA del plan

  Scenario: Catálogo con SARA 2
    Given hay alimentos SARA 2 y propios activos
    When la profesional pide una propuesta de plan al asistente
    Then el asistente puede proponer alimentos de las dos fuentes
    And el pedido al modelo sigue funcionando con ~1000 alimentos (ver D10)
```

---

## Grupos de alimentos (los 26 de SARA 2 + "Otros")

| # | Etiqueta | Tabla SARA 2 |
|---|---|---|
| 1 | Verduras | 1 |
| 2 | Frutas | 2 |
| 3 | Legumbres, cereales, papa, choclo, batata, pan y pastas | 3 |
| 4 | Leche y postres de leche | 4 |
| 5 | Yogures | 5 |
| 6 | Quesos | 6 |
| 7 | Carnes | 7 |
| 8 | Huevos | 8 |
| 9 | Pescados y mariscos | 9 |
| 10 | Aceites | 10 |
| 11 | Frutas secas y semillas | 11 |
| 12 | Azúcares, mermeladas y dulces | 12 |
| 13 | Golosinas y chocolates | 13 |
| 14 | Grasas | 14 |
| 15 | Snacks salados | 15 |
| 16 | Aderezos | 16 |
| 17 | Caldos y sopas industriales | 17 |
| 18 | Postres industriales y helados | 18 |
| 19 | Sales | 19 |
| 20 | Bebidas con azúcar | 20 |
| 21 | Bebidas sin azúcar | 21 |
| 22 | Bebidas alcohólicas y energizantes | 22 |
| 23 | Bebidas de frutas naturales sin azúcar agregada | 23 |
| 24 | Infusiones | 24 |
| 25 | Comidas rápidas | 25 |
| 26 | Suplementos nutricionales | 26 (sin importar, ver D7) |
| 27 | Otros | — (solo propios, ver D2) |

Las etiquetas se pueden acortar en la tabla (p. ej. "Cereales, papa, pan y pastas") con el
nombre completo en un tooltip. Lo resuelve el diseño.

---

## Datos que se registran

### En cada alimento

| Dato | Obligatorio | Uso |
|---|---|---|
| Nombre | Sí | Búsqueda, planes, PDF |
| Grupo (27 valores) | Sí | Filtro, selector, asistente IA |
| Fuente: SARA 2 / Propio | Sí | Etiqueta, reglas de edición, filtro |
| Referencia (texto libre) | No, solo propios | Marca, rótulo, de dónde sacó el dato (D13) |
| Clave de origen SARA 2 | Solo SARA 2, única | Que la importación sea repetible sin duplicar (D14) |
| Kcal cada 100 g | Sí | Totales del plan. Atwater, ver D5 |
| Proteínas (g) | Sí | Macros, Atwater |
| Carbohidratos disponibles (g) | Sí | Macros, Atwater. Es el `carbsPer100` actual, con el significado aclarado |
| Grasas totales (g) | Sí | Macros, Atwater |
| Fibra alimentaria (g) | No | Totales del plan (ya existe) |
| Alcohol (g) | No (0 si no se carga) | Atwater × 7 |
| Sodio (mg) | No | Épicas 25 y 26 |
| Azúcar agregado (g) | No | Épica 25 |
| Grasas saturadas (g) | No | Épica 26 |
| Colesterol (mg) | No | Épica 26 |
| Resto de los 39 componentes | No | Épica 26. Guardados aparte, ver D4 |
| Unidad de referencia (`unitHint`) | No | Ya existe. Los SARA 2 quedan vacíos (las medidas caseras son de la épica 21) |
| Activo | Sí | Ya existe |

"Sin dato" (null) y 0 son distintos en todos los nutrientes opcionales.

### De la importación (no son datos de negocio)

| Dato | Uso |
|---|---|
| Archivo intermedio con las filas leídas del PDF (versionado) | Revisar el resultado y cargarlo en cualquier base sin volver a leer el PDF (D14) |
| Reporte de filas rechazadas y excluidas (versionado) | Revisión humana. Esas filas no se cargan |

---

## Diseño UX

Sistema de diseño nuevo, estilo Notion (el de la HU-002): tipografía sobria, `DataTable`,
`Badge`, `Card`, `Alert` y `Quantity` que ya existen. Nada de colores nuevos para la fuente: usar
los tonos de `Badge` que ya hay.

### `/alimentos` (lista)

- Encabezado "Alimentos", botón primario "Nuevo alimento".
- Barra de filtros: buscador ("Buscar alimento…"), selector de **Fuente** (Todas / SARA 2 /
  Propios), selector de **Grupo**, y un interruptor "Mostrar inactivos" (hoy la lista trae todos;
  con 1000 conviene ocultar los inactivos por defecto).
- Columnas: Alimento (nombre + `Badge` "Inactivo" si corresponde), Fuente (`Badge` neutral
  "SARA 2" / `Badge` de otro tono "Propio"), Grupo, Energía (kcal), Proteínas, Carbohidratos,
  Grasas. Cada 100 g, como hoy.
- Contador: "Mostrando 42 de 1.012 alimentos".
- Vacío por filtro: el `EmptyState` actual ("No hay alimentos que coincidan").

### `/alimentos/[id]` (ficha)

- Encabezado: nombre, debajo "Grupo · Fuente". A la derecha, Activo/Inactivo y
  "Desactivar"/"Activar". En SARA 2 también "Duplicar como propio".
- **Tarjeta "Energía"**: kcal cada 100 g en grande y el desglose en filas (nutriente, gramos,
  factor, kcal), con el total abajo. Debajo, "Calcular porción": campo en gramos que recalcula
  kcal, macros y desglose.
- **Tarjeta "Nutrientes principales"**: proteínas, carbohidratos disponibles, grasas (y
  saturadas), fibra, azúcar agregado, sodio, colesterol, alcohol si > 0.
- **Sección plegable "Más nutrientes"** (solo si hay datos): el resto, agrupado en "Grasas"
  (mono, poli, trans, linoleico, ALA, araquidónico, EPA, DHA), "Carbohidratos" (totales, azúcar
  total), "Minerales" y "Vitaminas", cada uno con su unidad (mg, µg). "Sin dato" en gris.
- **SARA 2**: todo en lectura. `Alert` informativo: "Dato oficial de SARA 2 (Ministerio de Salud,
  2022). No se puede editar: si necesitás otros valores, duplicalo como propio."
- **Propio**: formulario de edición. Si el alimento viene de antes y sus kcal no cumplen Atwater,
  `Alert` de advertencia con "Usar X kcal".
- Si lo usan planes o plantillas: "Lo usan N planes y M plantillas". Al guardar cambios en un
  propio en uso, confirmación: "Cambiar este alimento cambia los totales de los planes que lo
  usan, incluidos los ya entregados. ¿Guardar igual?"

### `/alimentos/nuevo` (propio)

- Campos: Nombre, Grupo, Referencia (opcional, placeholder "Ej.: rótulo de la marca"),
  Proteínas, Carbohidratos disponibles (ayuda: "Los del rótulo argentino: sin la fibra"), Grasas
  totales, y un bloque "Opcionales" con Grasas saturadas, Fibra, Azúcar agregado, Sodio,
  Colesterol, Alcohol, y la Unidad de referencia.
- Kcal: **no es un campo**. Se ve un recuadro en vivo: "= 125,5 kcal cada 100 g" con el desglose.
- Errores: "Completá proteínas, carbohidratos y grasas." / "Los nutrientes suman más de 100 g
  cada 100 g de alimento." / "Ya tenés un alimento propio con ese nombre." (solo advertencia
  frente a SARA 2, bloqueo frente a otro propio, ver D12).
- Al guardar: vuelve a la ficha con un toast "Alimento guardado".

### Editor de comidas (planes y plantillas)

- "Agregar alimento" pasa a ser un **combobox con búsqueda**: al escribir, lista hasta ~20
  resultados con nombre, grupo en gris y `Badge` de fuente. Teclado: flechas, Enter, Esc.
  Primera opción fija: "Alimento libre / sin macros".
- Sin resultados: "No hay alimentos que coincidan. Podés agregarlo como alimento libre o crearlo
  en Alimentos."
- En cada ítem, las kcal muestran el desglose de la porción al pasar el mouse o al tocarlas
  (D11).

### Bot y portal

No cambian. El portal no muestra kcal hoy y esta HU no lo agrega (es la pregunta abierta 5 de la
épica). El PDF del plan sigue igual; los nombres de los alimentos SARA 2 salen como vienen en la
tabla.

---

## Fuera de alcance

- **Épica 21**: relación crudo ↔ cocido, factor de rendimiento, peso bruto/neto y medidas
  caseras. Acá crudo y cocido son dos alimentos sin relación.
- **Épica 22**: recetas y preparaciones.
- **Épica 23**: plan contra objetivo (adecuación, reparto por comida).
- **Épica 24**: intercambios y equivalencias.
- **Épica 25**: alertas por patología y marcas de gluten o alergias en los alimentos.
- **Épica 26**: micronutrientes del plan contra recomendaciones. Acá se **guardan** y se
  **muestran en la ficha del alimento**, pero no se suman en el plan.
- Importar desde la UI o subir un archivo: la importación la corre quien desarrolla, con un
  script.
- Tabla 26 (suplementos), ver D7.
- Fusionar o reemplazar los 90 alimentos viejos por sus equivalentes SARA 2, o reasignar los
  ítems de planes y plantillas a otro alimento.
- Congelar los valores del alimento en cada ítem del plan (foto de macros). Se deja anotado
  porque el problema existe desde antes, pero no lo agrava esta HU (D3).
- Mostrar los colores de procedencia del dato de SARA 2 (Argenfoods, USDA…): en el PDF son
  colores de celda y `pdftotext` no los ve.
- Actualizar a una versión futura de SARA.

---

## Notas de implementación

Mínimas; el detalle es del `architect`.

- Toca `schema.prisma` (enum de grupos, fuente, columnas nuevas, micronutrientes) → impacta a
  `apps/web` **y** `apps/bot` (el bot no usa `Food` hoy, pero comparte el cliente). Correr
  `typecheck` en todo.
- **Cambiar el enum con filas existentes:** la migración tiene que mapear los valores viejos en
  el mismo SQL (no puede soltar el enum y perder el grupo de los 90). Revisar el SQL antes de
  aplicarlo. Nunca `migrate reset`.
- Precisión: `Decimal(5,2)` no alcanza para el sodio de la sal (~38.000 mg cada 100 g) ni para
  otros minerales. Revisar las escalas.
- `seed.ts` usa los grupos viejos: hay que actualizarlo aunque no se corra.
- La lectura del PDF y las validaciones (suma de macros, Atwater, unir nombres partidos, emparejar
  A con B) son lógica pura → `packages/core` con tests, usando renglones de muestra reales del
  PDF (incluidos los casos raros de "Contexto").
- El cálculo de Atwater (con alcohol) y el desglose → `packages/core/src/nutrition.ts`, al lado
  de `computeItemMacros`. Lo usan la ficha, el formulario de propios, el editor de comidas y la
  importación.
- La importación escribe en la base de desarrollo: solo crea o actualiza alimentos con fuente
  SARA 2, identificados por su clave de origen. Nunca `deleteMany` ni toca propios.
- Que el combobox reciba la lista de alimentos ya filtrada en el servidor o que filtre en el
  cliente (~1000 filas livianas) lo decide el architect.

---

## Dudas para validar con el usuario

Cada duda tiene la recomendación del afinador, para que el orquestador la resuelva en modo
autónomo.

**D1. Qué pasa con los 90 alimentos existentes.**
**Recomendación:** se conservan todos, con el mismo id, como fuente **"Propio"**, activos como
estaban. **No se recalculan sus kcal automáticamente**: si se recalcularan, cambiarían en
silencio los totales de planes reales (p. ej. arroz 130 → 125,5 kcal). En su ficha se muestra el
aviso de "no coinciden con el cálculo por macros" con el botón "Usar X kcal", para que ella
decida uno por uno. A partir de que edite un propio y guarde, las kcal pasan a ser siempre
Atwater.

**D2. Cómo pasar los 10 grupos viejos a los nuevos.** Varios grupos viejos se reparten en
varios nuevos (Lácteos → leche, yogures y quesos). La migración mapea **por grupo viejo** en
SQL, sin mirar nombres (un mapeo por nombre puede fallar en producción, donde los alimentos
pueden ser otros). **Recomendación:**

| Grupo viejo | Grupo nuevo |
|---|---|
| Cereales | Legumbres, cereales, papa, choclo, batata, pan y pastas |
| Legumbres | Legumbres, cereales, papa, choclo, batata, pan y pastas |
| Lácteos | Leche y postres de leche |
| Carnes y huevos | Carnes |
| Frutas | Frutas |
| Verduras | Verduras |
| Grasas | Aceites |
| Azúcares y dulces | Azúcares, mermeladas y dulces |
| Bebidas | Bebidas sin azúcar |
| Otros | **Otros** (grupo 27, que se conserva solo para propios) |

Con los 90 del seed quedan mal agrupados, entre otros: yogures y quesos (en "Leche"), huevo,
clara, merluza y atún (en "Carnes"), palta, nueces y semillas (en "Aceites"), papa y batata (en
"Verduras"; en SARA 2 van con cereales), chocolate, alfajor, helado y flan (en "Azúcares"),
gaseosa, cerveza y vino (en "Bebidas sin azúcar"). Como el grupo solo sirve para filtrar y
agrupar, **no rompe nada**. Ella los reubica editándolos. Para facilitarlo, la ficha de un
propio migrado podría mostrar "Revisá el grupo: se asignó automáticamente". **Alternativa
descartada:** mapear por nombre en la migración.

**D3. ¿Un alimento SARA 2 se puede editar?**
**Recomendación: no, solo desactivar/activar y "Duplicar como propio".** Motivos: (a) es el dato
oficial y su valor está en no tocarlo; (b) como los planes calculan con los valores actuales,
editarlo cambiaría planes ya entregados; (c) la importación repetible lo pisaría. Si ella
necesita otros valores (una marca, un rótulo), duplica y edita la copia.

**D4. Dónde guardar los nutrientes.**
**Recomendación:**
- **Columnas** (se filtran, se suman o se validan): kcal, proteínas, CHO disponibles, grasas,
  fibra (ya existen), y nuevas: **alcohol** (lo necesita Atwater), **sodio**, **azúcar
  agregado**, **grasas saturadas** y **colesterol**. Todas nullable salvo los macros de hoy.
- **Todo lo demás** (agua, cenizas, CHO totales, azúcar total, mono, poli, trans, linoleico,
  ALA, araquidónico, EPA, DHA, potasio, calcio, cobre, fósforo, hierro, magnesio, zinc, niacina,
  folato EFD, ácido fólico, vitamina A RAE, retinol, B1, B2, B12, C, D) en **una columna JSON**
  en `Food`, con claves fijas definidas en `packages/core` (clave → etiqueta, unidad, sección),
  guardando `null` cuando no hay dato.
- **Por qué JSON y no una tabla aparte:** hoy solo se muestran en la ficha; la épica 26 los va a
  sumar por plan en memoria (pocos alimentos por plan), no con consultas SQL. Una tabla
  `FoodNutrient` (una fila por nutriente, ~35.000 filas) agrega joins sin beneficio ahora. Si la
  épica 26 necesita consultar por nutriente, se promueve a columna el que haga falta.

**D5. Qué kcal se guardan para los alimentos SARA 2: las publicadas o las calculadas.** Las
publicadas salen de los datos sin redondear, y recalcularlas con los macros redondeados a un
decimal puede dar 1 o 2 kcal de diferencia. Esa diferencia hace que el desglose no sume el total
que se muestra.
**Recomendación: guardar las calculadas por Atwater** (4 × CHO disp. + 4 × P + 9 × G + 7 ×
alcohol) sobre los valores guardados, así hay **una sola regla en todo el sistema** (la de la
nutricionista, que pide la épica) y el desglose siempre cierra. Las publicadas se guardan en el
JSON (`kcalPublicada`) para trazabilidad y se usan en la validación de D6.

**D6. Tolerancias de la validación y qué hacer con las filas que fallan.**
**Recomendación:**
- Suma de macros: **entre 97 y 103 g**, el mismo criterio que usó SARA 2.
- Atwater: |kcal publicadas − calculadas| ≤ **máx(2 kcal, 3 %)**. Cubre el redondeo de la tabla
  (kcal enteras, macros con un decimal).
- La fila que falla **no se importa** y va al reporte (la decisión del usuario fue no inventar).
  Si después falta un alimento importante, ella lo carga como propio o se corrige el lector.
- **Freno de seguridad:** si se rechaza más del 5 % de las filas, es casi seguro un problema del
  lector (columnas corridas), no de la tabla. En ese caso no se carga nada hasta revisarlo.
- Otras verificaciones de la tabla (saturadas + mono + poli < lípidos; azúcar agregado ≤ azúcar
  total ≤ CHO disponibles) conviene hacerlas como **advertencia en el reporte**, sin rechazar la
  fila.

**D7. Tabla 26 (suplementos).** Sus valores vienen por gramo, por mililitro o cada 100 unidades,
no cada 100 g de alimento, y `computeItemMacros` supone gramos.
**Recomendación: no importarla en esta HU** y listarla en el reporte como excluida. El grupo
"Suplementos nutricionales" queda disponible para propios. Los suplementos que vienen por gramo o
mililitro (Ensure, Glucerna…) se pueden sumar cuando la épica 21 traiga las unidades.

**D8. Celda vacía contra cero.**
**Recomendación:** celda vacía → `null` ("Sin dato"); cero → 0. En los macros obligatorios
(proteínas, CHO disponibles, grasas) una celda vacía hace que se **rechace la fila** con el
motivo "falta un macro", porque sin ellos no hay Atwater.

**D9. ¿El selector con búsqueda entra en esta HU?** No es parte literal de la épica, pero sin él
los ~1000 alimentos dejan el editor de comidas inutilizable.
**Recomendación: sí, entra**, en el editor de planes y plantillas (es un solo componente,
`meals-editor.tsx`). Sin filtros avanzados: búsqueda por nombre sin tildes y el grupo como
información.

**D10. Asistente IA con ~1000 alimentos.** Hoy le manda el catálogo entero. Con 10 veces más
alimentos, el pedido crece mucho (costo y límite de contexto).
**Recomendación:** mandar todos los activos en formato compacto (id, nombre, grupo abreviado,
kcal) y que el architect mida el tamaño. Si pasa un umbral razonable, excluir los grupos que
casi nunca van en un plan (comidas rápidas, golosinas, bebidas alcohólicas, snacks, sales,
suplementos). Mejorar la selección de alimentos del asistente queda fuera de esta HU.

**D11. Desglose de kcal por porción en el plan.** La épica pide verlo "de cada porción".
**Recomendación:** tooltip/popover sobre las kcal de cada ítem (no una línea más en cada ítem,
que recarga el editor), más el "Calcular porción" en la ficha del alimento. El PDF del plan no
cambia.

**D12. Nombres repetidos entre SARA 2 y propios** (p. ej. "Yogur descremado" propio y "Yogur
descremado" de SARA 2).
**Recomendación:** se permiten; los distingue la etiqueta de fuente en la lista y en el selector.
Al crear un propio con el nombre de otro **propio**, se bloquea ("Ya tenés un alimento propio con
ese nombre"); si coincide con uno de SARA 2, solo una advertencia. Desactivar en bloque los 90
viejos queda fuera de alcance (ella decide de a uno).

**D13. Detalle de la fuente de un propio.** El borrador dice "Propio" o "SARA 2".
**Recomendación:** la fuente es un enum de dos valores (`SARA2`, `PROPIO`) más un texto libre
opcional "Referencia" solo para propios (marca, rótulo, fecha). No se crea un catálogo de
fuentes.

**D14. Cómo se corre la importación y cómo llega a producción.**
**Recomendación:** en dos pasos.
1. **Lector (script de desarrollo):** lee el PDF con `pdftotext -layout`, valida y escribe un
   archivo de datos versionado (p. ej. JSON) + el reporte.
2. **Cargador:** toma ese archivo y hace upsert por **clave de origen** (número de tabla + nombre
   normalizado, única). Es idempotente, no toca propios y no borra: si un alimento SARA 2 dejó de
   estar en el archivo, se desactiva, no se borra.

Así producción no necesita `pdftotext`, el resultado del PDF se puede revisar en el diff, y la
carga es la misma en desarrollo y en producción. Si el cargador corre como paso de deploy o a
mano lo decide el architect (no dentro de una migración de Prisma, para no mezclar esquema con
~1000 filas de datos).

**D15. Carbohidratos: disponibles contra totales.** `carbsPer100` pasa a significar
explícitamente **CHO disponibles** (SARA 2 y rótulo argentino). Los 90 viejos pueden tener CHO
totales cargados.
**Recomendación:** no tocarlos (D1). Aclararlo en la etiqueta del formulario y en la ficha
("Carbohidratos disponibles"); en la lista y en los planes sigue diciendo "Carbohidratos".

**D16. ¿Se muestran por defecto los alimentos inactivos en `/alimentos`?** Hoy sí.
**Recomendación:** no. Se ocultan por defecto y se ven con el interruptor "Mostrar inactivos",
porque con 1000 alimentos la lista se llena de los que ella desactive.

---

## Resoluciones (validadas por el orquestador en modo autónomo, autorizado por el usuario, 2026-09-24)

Se aceptan **todas las recomendaciones** del afinador (D1–D16) tal como están escritas arriba. En
particular: los 90 alimentos existentes se conservan con su id como "Propio" (D1); los grupos se
mapean por grupo viejo en SQL (D2); SARA 2 no se edita, solo se activa/desactiva o se duplica
como propio (D3); kcal por Atwater (D5); la tabla 26 (suplementos) queda afuera (D7); el selector
con búsqueda entra (D9); la carga es en dos pasos, lector a JSON versionado y cargador
idempotente por clave de origen, fuera de las migraciones de Prisma (D14).
