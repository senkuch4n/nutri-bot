# HU-018: Menú semanal armado con recetas (buscador estilo Google Shopping)

**Como** nutricionista,
**quiero** tener mis recetarios (platos, colaciones, guarniciones, desayunos) cargados en el
sistema, con sus macros calculados por porción y la porción expresada en gramos o en medidas
caseras; armar el plan como **menú semanal** (lunes a domingo, como lo entrego hoy); y poder
buscar recetas por ingrediente desde una comida de un día, viendo la foto y cuánto suma cada
receta a los macros de ese día del paciente,
**para que** pueda armar los planes de alimentación lo más rápido y cómodo posible, sin hacer
cuentas ni copiar desde los PDF.

> **Estado:** dudas D1–D22 respondidas por el usuario el 2026-10-03. D1 cambió el alcance (menú
> semanal) y D3 (atribución). Ver "Resoluciones (2026-10-03)" y "Dudas nuevas" al final. El cuerpo
> ya está ajustado a esas resoluciones. **No validada todavía.**

Origen: pedido del usuario del 2026-10-03 (borrador en `backlog/HU-018.json`). Cubre la épica 22
(recetas y preparaciones) de `docs/historias-usuario-nutridesk.md`, parte de la 21 (medidas
caseras) y de la 23 (plan contra objetivo), y las pseudo-HU de la última reunión
(`hus-last-meet.md`): "elegir los macronutrientes diarios" (EP-057 en el tablero), "listado de
recetarios", "variedad de medidas (gramos, caseras)" y "recetarios de viandas con
recomendaciones de conservación" (EP-058). Ver D22 sobre esa numeración.

Pedido explícito del usuario: diseño con la skill **ui-ux-pro-max** (aplicada a mano, ver
"Diseño UX") y alineado con el rediseño estilo Apple (HU-017).

---

## Contexto

### Qué existe hoy

- **Planes** (`NutritionPlan` → `PlanMeal` → `PlanMealItem`, en `packages/db/prisma/schema.prisma`).
  Cada comida tiene un `name` de texto libre ("Desayuno", "Almuerzo"…) y un orden. Cada ítem es
  un alimento (`foodId`) con `quantityGrams`, o un texto libre (`customLabel`) sin macros, más
  `notes`. **No existe el concepto de receta**: un plato de varios ingredientes hoy se carga como
  varios alimentos sueltos o como texto libre sin macros.
- **Plantillas** (`PlanTemplate` → `TemplateMeal` → `TemplateMealItem`) con la misma forma, y
  `applyTemplateToPatient` (`packages/db/domain/planTemplates.ts`) que copia una plantilla a un
  plan.
- **Base de alimentos SARA 2 + propios** (HU-005): `Food` con macros cada 100 g, kcal por
  Atwater, `unitHint` (texto libre tipo "1 taza ≈ 180 g", sin conversión) y nutrientes extra.
  El editor de comidas (`apps/web/src/components/meals-editor.tsx`, compartido por planes y
  plantillas) elige alimentos con `food-picker.tsx` (combobox con búsqueda, `searchFoods` de
  `packages/core`, sin tildes).
- **Macros del plan**: se calculan en vivo (`computeItemMacros` / `sumMacros`,
  `packages/core/src/nutrition.ts`; `apps/web/src/lib/meal-view.ts`), sin foto. La página del plan
  (`pacientes/[id]/planes/[planId]/page.tsx`) muestra una franja fija `MacroTotals` con
  **totales absolutos** (kcal, P, C, G, fibra), **sin compararlos con ningún objetivo**. Debajo,
  los micronutrientes contra recomendaciones (HU-010).
- **Objetivo del paciente ("macros diarios")**: la calculadora de requerimiento (HU-004) guarda
  una `NutritionPrescription` **por consulta**, con VCT prescripto (`prescribedVctKcal`), modo de
  macros (`PERCENT_OF_VCT` o `PROTEIN_PER_KG`), porcentajes y **gramos** (`proteinG`, `carbG`,
  `fatG`). O sea: **elegir los macros diarios del paciente ya existe** (EP-057 está cubierta en lo
  que es elegirlos). Lo que no existe es usarlos al armar el plan. El vínculo plan ↔ objetivo es
  indirecto: `Consultation.planId` (la consulta que indicó el plan) y
  `Consultation.prescription`.
- **Medidas caseras**: no existen como dato. Solo el `unitHint` de texto. `grep` de
  "casera/household" en `apps/` y `packages/` no encuentra lógica.
- **Portal** (`(portal)/portal/plan/plan-view.tsx`) y **PDF del plan** (`lib/plan-pdf.tsx`)
  listan cada ítem con su nombre y sus gramos; el portal muestra además los totales.
- **Asistente IA del plan** (`ai-actions.ts`): propone alimentos del catálogo, no recetas.
- **Imágenes**: el sistema ya guarda binarios en la base (`Professional.logoData`,
  `signatureData`, `DiaryEntry.photoData`). No hay almacenamiento de archivos aparte.
- `git log --all -i --grep=receta` no muestra trabajo previo sobre recetas.

### La zona es de imleticio (Leo)

`pacientes/[id]/planes/**`, `plantillas/**`, `alimentos/**`, `food-picker.tsx` y
`meals-editor.tsx` son zona de imleticio:

- **PR #7** ("estandarizar el uso de alimentos SARA2") y la **HU-017a** (fundaciones del rediseño
  Apple: tokens, Motion, primitivos `Sheet`, `ToggleGroup`, `Skeleton`, sonner, `.touch-target`)
  **ya están mergeados en `develop`** (merges `e89a555` y `45d3075`). El modelo de planes no
  cambió con ellos (`PlanMeal`: `name` + `order`).
- **HU-015** (de Leo): el PDF/Word del plan con la plantilla de la nutricionista y textos
  editables. Va a rehacer `lib/plan-pdf.tsx`. **El menú semanal de esta HU cambia lo que la
  HU-015 imprime** (ver "Coordinación con Leo" en Notas de implementación).
- **HU-017e** (rediseño Apple 5/5) es justamente "planes, alimentos y plantillas (+ PDF del plan)".

Esta HU **cambia el modelo y el editor de planes** (menú semanal) y agrega piezas en esa zona
(buscador, ítem de receta, franja del objetivo). Se parte para que lo que no choca vaya aparte
(ver "Corte propuesto").

### Lo que trajo el usuario: recetarios y una plantilla real de plan

Material local en `docs/recetarios/` y `docs/planes-alimentacion/` (en `.gitignore`, no se
versiona). Muestreo hecho con `pdftotext`, lectura de páginas y la estructura de los PPTX.

**Recetarios PDF (29 archivos).** Todos tienen **capa de texto** (no son escaneos), así que el
texto se puede extraer. Lo que trae cada receta:

| Dato | Qué tan seguido aparece | Cómo viene |
|---|---|---|
| Nombre | Siempre | Título grande, a veces partido en dos renglones ("Albóndigas / de lentejas") |
| Ingredientes | Casi siempre (las colaciones e ideas de mate/picoteo a veces son párrafos) | Mezcla de **gramos** y **medidas caseras** en la misma línea: "Lentejas 500g", "Puré de calabaza una taza (son 300g en crudo aprox.)", "Harina integral 100 g (3/4 de taza)", "Aceite de oliva 50cc (¾ de pocillo de café)", "Huevo una unidad", "Una cebolla y morrón picados", "Perejil c.n." (cantidad necesaria). Muchos ingredientes **no tienen gramos** |
| Rendimiento | Casi siempre | "Rinde para 8 personas aprox.", "14 unidades", "8 unidades grandes aprox", o nada |
| Porción | A veces | En medida casera: "¾ albóndigas", "1/4 de tarta", "3 unidades", "una taza", "media palta", "40 g (una tajada gruesa)" |
| Procedimiento | Casi siempre | Pasos numerados o con viñetas |
| Tips / conservación | A veces | "Pueden congelar por 3 meses", "acompañar con ensalada", reemplazos sin TACC |
| **Macros** | **Pocas**: solo en algunos (p. ej. "Almuerzos y cenas 2", "almuerzos y cenas 4", "Mate 3", "Galletitas") | "TABLA NUTRICIONAL porción ¾ albóndigas: Calorías 262 · Hidratos 31,12 · Proteínas 23,87 · Grasas 1,87 · Fibra 11,12". En el resto, nada. No dicen de qué tabla salen |
| **Imagen** | Casi siempre | Foto del plato **incrustada en un diseño** (recortada en curvas, con fondos y dibujos) y con **marca de agua** del autor encima ("Nutriarte") |
| Categoría / momento | Por archivo, no por receta | El nombre del archivo: "Almuerzos y cenas", "Desayunos y meriendas", "Colaciones", "Guarnis de verdura", "Ensaladas completas", "Picoteo", "Mate", "Galletitas", "Panes y pizzas", "Fiestas" |

- **Cantidad**: unas **250–300 recetas** (contando los títulos "Procedimiento/Preparación";
  hay archivos repetidos en versión color y "byn"), más ~30 ideas de colación en formato párrafo.
- **Formato poco homogéneo**: al menos cinco diagramaciones distintas (columnas, recuadros,
  viñetas "×", "॰", ">", "+"), títulos partidos, ingredientes que mezclan dos alimentos en una
  línea, gramos que a veces son en crudo y a veces en cocido.
- **No son todos recetarios**: "Reemplazos" (guía de reemplazos de harinas, endulzantes, huevo y
  lácteos) y "Conservación de verduras en el freezer" (guía para viandas) son material educativo,
  no recetas. El segundo es el que pide la pseudo-HU de viandas (EP-058).
- **Autoría y derechos**: varios PDF dicen en la primera página **"PROHIBIDA LA REVENTA Y/O
  COMERCIALIZACIÓN DEL MATERIAL"**, llevan la marca **Nutriarte** como marca de agua y el pie de
  la autora (otra nutricionista, con su matrícula). Ver D3.

**PPTX (5 archivos, 4,6 a 67 MB).** "BOX II almuerzos y cenas", "BOX de comidas (desayunos y
meriendas) — Nutrispace", "Box de platos — Nutrispace", "Imágenes desayunos Nutraweb",
"Imágenes platos Nutraweb". Son **bancos de imágenes**: 11 a 19 diapositivas con 69 a 141
imágenes (PNG recortados de platos y desayunos vistos desde arriba, sin fondo) y casi sin texto
(algunos rótulos como "Pollo grillado con arvejas, zanahorias y espárragos", o "Carbohidratos /
Proteína / Vegetales" para armar platos). **No traen ingredientes, cantidades ni macros.** Sirven
como fotos genéricas de platos (si la licencia lo permite, D3), no como recetas.

**Plantilla real de plan** (un PDF de 15 páginas de una paciente; acá solo la estructura, sin
datos de la persona):

1. Portada: "Plan nutricional", nombre, fecha y el objetivo en una frase.
2. **Recomendaciones** generales (texto: cantidad de comidas, proteínas en cada comida,
   hidratación, actividad física…).
3. **Alimentos de consumo diario** por grupo, cada uno con su **porción diaria en medida casera**:
   "1 vaso", "2 unidades", "1 porción diaria (200 g, tamaño de la mano, espesor 2 cm)",
   "1 y 1/2 tazas (cocidas)", "3 cdas cocido o crudo", "1 papa mediana", "2 rebanadas",
   "2 cdas diarias", "8 vasos o 2 l", "C/N", con la lista de alimentos de ese grupo y cómo
   prepararlos.
4. **Alimentos de consumo ocasional** (listas por grupo, sin cantidades).
5. **Desayuno y merienda**: una regla de armado ("infusión + pan integral + proteína + fruta") y
   **un menú por día de la semana** (lunes a domingo, a veces dos semanas), cada día una
   combinación ("Té + tostada integral + queso untable + banana") con los grupos que aporta.
6. **Almuerzo y cena**: la regla del plato ("½ verduras, ¼ proteínas, ¼ cereales + 1 cda de
   aceite crudo") y **un menú por día**, con preparaciones por nombre ("Guiso de lentejas",
   "Albóndigas + fideos + verduras", "Tarta de jamón y queso", "Canastitas de pollo").
7. **Colaciones opcionales**: lista de opciones con porción casera, varias son **recetas de los
   recetarios** ("Crumble de manzana (1 porción)", "Budín de banana (1 porción)", "Pepas
   saludables (3 unidades)", "Pizza dulce (2 unidades)").
8. **Reemplazos / equivalencias** en medida casera ("1 huevo = 2 cdas de legumbres cocidas = 1
   feta de jamón cocido", "1 vaso de leche = 7 cdas de queso untable = 2 fetas de queso tybo").
9. Pie con nombre y matrícula de la profesional en cada página.

Conclusiones que importan para esta HU:

- **Al paciente le entrega medidas caseras y nombres de preparaciones, no gramos ni macros.**
  Los macros los usa ella para armar.
- **El plan real es un menú semanal**: el desayuno tiene 7 combinaciones, una por día de la
  semana; almuerzo y cena también. Las colaciones, en cambio, son **las mismas todos los días**
  y son una **lista de opciones** ("elegí una"). El modelo actual tiene una sola lista de ítems
  por comida y los suma. Resuelto en D1: esta HU pasa el plan a menú semanal.
- Las recetas aparecen en el plan **por nombre y porción casera** ("Budín de banana, 1 porción").

### Qué es lo nuevo

1. **Recetario**: una entidad "Receta" con nombre, foto, tipo, momentos del día, rendimiento,
   porción (en medida casera y, si se sabe, en gramos), ingredientes vinculados a alimentos de la
   base con sus gramos y su medida casera, preparación, conservación, etiquetas y fuente. Sus
   **macros por porción se calculan** desde los ingredientes (SARA 2 / propios), con Atwater.
2. **Pantalla de recetas** en el panel: grilla con foto, buscador, alta/edición.
3. **Carga asistida** de los recetarios: extracción del texto a **borradores** que se revisan uno
   por uno antes de publicarse (no se inventan gramos).
4. **Menú semanal**: el plan (y la plantilla) tiene sus comidas, y cada comida es **"cambia cada
   día"** (un contenido por día, lunes a domingo) o **"igual todos los días"** (un solo contenido,
   que puede ser una lista de opciones, como las colaciones). Acciones "Copiar este día a…" y
   "Repetir en todos los días". Los planes y plantillas existentes pasan a "igual todos los días"
   sin perder nada.
5. **Buscador estilo Google Shopping** desde una comida de un día ("Desayuno · Martes"): buscar
   por ingrediente o nombre, grilla de tarjetas con foto, filtros en chips, y en cada tarjeta
   **cuánto suma a los macros de ese día**; agregar en un toque, en ese día o en varios.
6. **Ítem de receta** en el plan (y en plantillas): "N porciones" de una receta, con sus macros.
7. **Objetivo a la vista** mientras se arma el plan: kcal, proteínas, carbohidratos y grasas
   **del día que se edita** contra la prescripción del paciente, y un resumen de la semana con el
   promedio diario.

### Corte propuesto (recomendación)

Con el menú semanal (D1 = c) la HU queda en cuatro partes:

| Parte | Qué incluye | Zona | Schema |
|---|---|---|---|
| **018a — Recetario** | Modelo `Recipe` + ingredientes, pantalla `/recetas` (grilla, ficha, alta/edición, foto), macros por porción calculados, carga asistida de borradores y revisión, etiquetas (incluida "apta vianda" con su nota de conservación) | Nueva (`recetas/**`, `packages/core`, `packages/db`). No toca la zona de Leo | Sí |
| **018b — Menú semanal** | Comidas "cambia cada día" / "igual todos los días", lista de opciones, editor por día (pestañas Lun–Dom + vista Semana), "Copiar este día a…", "Repetir en todos los días", totales por día y promedio semanal contra el objetivo, migración de planes y plantillas existentes, aplicar plantilla, portal por día, PDF mínimo por día, asistente IA y micronutrientes adaptados | Zona de Leo (`planes/**`, `meals-editor.tsx`, `plantillas/**`, `meal-view.ts`, `plan-pdf.tsx`, `plan-view.tsx`, `ai-actions.ts`) | Sí |
| **018c — Buscador de recetas con impacto por día** | Botón "Agregar receta" en cada comida de cada día, buscador (Sheet) con grilla, chips, impacto en los macros del día, agregar en uno o varios días, deshacer, ítem de receta en planes y plantillas, receta completa en portal (con fuente) y en el PDF (una línea) | Zona de Leo + componentes nuevos `recipe-*` | Sí (chico: el ítem de receta) |
| **018d — Medidas caseras de alimentos sueltos** | Equivalencias por alimento ("1 taza de arroz cocido = X g") para cargar ítems sueltos en medida casera (resto de la épica 21) | `Food`, editor de comidas | Sí. **Queda para después**, con su propia afinación (D21) |

**Orden recomendado: 018b → 018a → 018c → (018d más adelante).**

- **018b primero** porque cambia el modelo que la HU-015 de Leo está por imprimir: cuanto antes
  esté, menos retrabajo para él. Además aporta valor solo: ya con alimentos sueltos y texto libre
  ella puede armar su menú semanal como lo entrega hoy.
- **018a después**: no depende de 018b. Como las dos tocan `schema.prisma`, no pueden estar en
  `implementando` a la vez (regla del equipo), pero mientras 018b se implementa, 018a puede
  afinarse, tener su SDD y adelantar el script de extracción (que no toca el schema) y la
  selección de las ~40 recetas iniciales (D6).
- **018c al final**: necesita las dos anteriores.
- En 018a y 018c la medida casera **de la receta** (porción e ingredientes) ya se cubre como
  texto + gramos, que es lo que necesita el pedido; 018d no bloquea nada.

Esta HU (el documento) cubre 018a, 018b y 018c. 018d se afina aparte.

---

## Criterios de aceptación

### 018a — Recetario

```gherkin
Feature: Recetas con macros calculados

  Background:
    Given la nutricionista está logueada en el panel

  Scenario: Crear una receta
    When entra a "Recetas" y toca "Nueva receta"
    And carga el nombre "Albóndigas de lentejas", el tipo "Plato principal"
      y los momentos "Almuerzo" y "Cena"
    And carga el rendimiento "8 porciones"
    And carga la porción "¾ albóndigas" (medida casera) y, si quiere, sus gramos
    And agrega los ingredientes "Lentejas, secas, crudas" 500 g,
      "Zapallo, hervido" 300 g con la medida casera "1 taza",
      "Arroz blanco, hervido" 70 g y "Perejil" sin cantidad (c.n.)
    And guarda
    Then la receta queda creada como "Publicada"
    And ve las kcal, proteínas, carbohidratos, grasas y fibra de 1 porción
      (la suma de los ingredientes dividida por el rendimiento)
    And ve el desglose de kcal por Atwater de esa porción

  Scenario: Los macros salen de los ingredientes
    Given una receta con ingredientes vinculados a alimentos de la base
    When cambia los gramos de un ingrediente
    Then los macros por porción se recalculan mientras escribe
    And no hay ningún campo para cargar los macros de la receta a mano (ver D4)

  Scenario: Ingrediente sin cantidad
    Given un ingrediente cargado como "c.n." (cantidad necesaria)
    Then no suma macros
    And la ficha avisa "1 ingrediente sin cantidad: no suma a los macros"
    And si ese ingrediente es de los grupos Aceites, Grasas o Azúcares,
      el aviso dice "Perejil y aceite sin cantidad: el aceite puede sumar muchas kcal"

  Scenario: Ingrediente que no está en la base
    Given un ingrediente que no coincide con ningún alimento
    When lo carga como texto libre
    Then queda en la receta como texto, sin macros
    And la receta avisa "Hay ingredientes sin alimento asociado: los macros están incompletos"
    And puede crear el alimento propio desde ahí (abre "Nuevo alimento" en otra pestaña)

  Scenario: Foto de la receta
    When sube una foto JPG, PNG o WebP de hasta el tamaño máximo (ver D18)
    Then la tarjeta y la ficha la muestran recortada al mismo formato (4:3)
    And si no sube foto, la tarjeta muestra una ilustración neutra según el tipo de receta
    And si el archivo no es una imagen o es muy pesado ve
      "La foto tiene que ser JPG, PNG o WebP y pesar menos de X MB." junto al campo

  Scenario: Editar una receta usada en planes
    Given una receta que usan 3 planes y 1 plantilla
    When cambia sus ingredientes y toca "Guardar"
    Then antes de guardar ve "Esta receta está en 3 planes y 1 plantilla. Sus totales van a cambiar."
    And puede confirmar o cancelar (ver D10)

  Scenario: Archivar una receta
    Given una receta publicada
    When toca "Archivar"
    Then deja de aparecer en el buscador del plan
    And los planes que ya la tienen la siguen mostrando con sus macros
    And se puede volver a publicar

  Scenario: Fuente y atribución
    Given una receta cargada desde un recetario de terceros
    Then tiene la fuente (p. ej. "Nutriarte — Recetario almuerzos y cenas 2")
    And la ficha la muestra como "Fuente: …"
    And en todo lugar donde el paciente ve la receta (portal, PDF) aparece "Fuente: …" (D3 = b)
    And la fuente es obligatoria para publicar una receta que vino de la carga asistida
```

```gherkin
Feature: Lista de recetas

  Scenario: Grilla con buscador
    When entra a "Recetas"
    Then ve las recetas publicadas en una grilla de tarjetas con foto, nombre,
      porción en medida casera y kcal por porción
    And arriba un buscador "Buscar por nombre o ingrediente"
    And chips de Tipo, Momento y Etiquetas
    And un contador "Mostrando 24 de 186 recetas"

  Scenario: Buscar por ingrediente sin tildes
    When escribe "limon"
    Then aparecen las recetas cuyo nombre o algún ingrediente contiene "limón"

  Scenario: Borradores aparte
    Given hay recetas en borrador
    Then se ven en una pestaña "Para revisar (N)", no mezcladas con las publicadas
```

```gherkin
Feature: Carga asistida de los recetarios

  Background:
    Given los recetarios PDF del usuario (material local, no versionado)

  Scenario: Extraer borradores
    When se corre la extracción sobre un recetario (ver D5)
    Then cada receta encontrada queda como "Borrador" con:
      nombre, rendimiento y porción como texto, cada renglón de ingrediente como texto crudo,
      la preparación, los tips, la fuente (archivo y autor) y la página
    And la foto del plato si se pudo recortar (según D3)
    And si el recetario trae tabla nutricional, sus valores quedan como "publicado por la fuente"
    And no se inventa ningún gramo ni se elige ningún alimento sin revisión

  Scenario: Repetir la extracción no duplica
    Given un recetario ya extraído
    When se corre otra vez
    Then no se crean borradores duplicados (la clave es archivo + página + nombre)
    And no se tocan las recetas ya publicadas

  Scenario: Revisar un borrador
    Given un borrador "Albóndigas de lentejas"
    When la profesional lo abre
    Then ve a la izquierda la página original (o su texto) y a la derecha el formulario
    And cada ingrediente crudo trae un alimento sugerido ("Lentejas 500g" → "Lentejas, secas, crudas", 500 g)
      que puede aceptar, cambiar o dejar como texto libre
    And los gramos sugeridos salen solo de lo que dice el texto (500g, 300g, "100 g (3/4 de taza)");
      si el texto solo trae medida casera ("una taza"), el gramo queda vacío y marcado
    When completa lo que falta y toca "Publicar"
    Then la receta pasa a "Publicada" y aparece en el buscador

  Scenario: Diferencia con la tabla del recetario
    Given un borrador con tabla nutricional publicada (262 kcal por porción)
    When los macros calculados desde los ingredientes difieren más de 10 %
    Then ve "El recetario dice 262 kcal; con los ingredientes da 305 kcal" como aviso
    And no bloquea la publicación (ver D4)

  Scenario: Material que no es receta
    Given "Reemplazos" o "Conservación de verduras en el freezer"
    Then no se extraen como recetas (ver D20)
```

```gherkin
Feature: Viandas (EP-058)

  Scenario: Receta apta para vianda
    When marca una receta con la etiqueta "Apta vianda / freezer"
    Then puede cargar una nota de conservación ("Se congela hasta 3 meses. Descongelar en heladera.")
    And el chip "Apta vianda" filtra por esa etiqueta en la lista y en el buscador del plan
```

### 018b — Menú semanal

Vocabulario: una **comida** del plan (Desayuno, Almuerzo, Colaciones…) tiene un **modo**:
**"Cambia cada día"** (un contenido por día, de lunes a domingo) o **"Igual todos los días"**
(un solo contenido). Una comida "igual todos los días" puede marcarse como **"Opciones (elige
una)"**: su contenido es una lista de alternativas, no una suma (las colaciones del plan real).

```gherkin
Feature: Plan como menú semanal

  Background:
    Given la nutricionista está en un plan del paciente "Ana" (datos inventados)

  Scenario: Plan nuevo
    When crea un plan
    Then el plan trae las comidas Desayuno, Almuerzo, Merienda y Cena en modo "Cambia cada día"
      y Colaciones en modo "Igual todos los días" con "Opciones (elige una)", como el plan real
    And las puede renombrar, borrar, reordenar o agregar otras, y cambiar el modo de cada una

  Scenario: Editar un día
    Given el plan tiene comidas "Cambia cada día"
    When toca la pestaña "Martes"
    Then ve las comidas del martes con sus ítems
    And las comidas "Igual todos los días" se ven también, marcadas "Todos los días",
      y editarlas cambia los 7 días
    And la franja de arriba muestra los totales del martes contra el objetivo

  Scenario: Varios ítems en una comida de un día se suman
    Given el desayuno del martes tiene "Té", "Tostada integral 2 rebanadas" y "Queso untable 2 cdas"
    Then los macros del desayuno del martes son la suma de los tres

  Scenario: Copiar un día a otros
    Given el lunes está armado
    When toca "Copiar este día a…" y elige "Martes" y "Miércoles"
    Then el contenido de las comidas "Cambia cada día" del lunes reemplaza al de martes y miércoles
    And si martes o miércoles tenían ítems, antes de copiar ve
      "Martes y miércoles ya tienen comidas. Se van a reemplazar."
    And después de copiar ve "Lunes copiado a martes y miércoles · Deshacer"
    And las comidas "Igual todos los días" no cambian

  Scenario: Repetir una comida en todos los días
    Given el desayuno del lunes está armado
    When toca "Repetir en todos los días" en el desayuno del lunes
    Then el desayuno de los otros 6 días queda igual al del lunes, con el mismo aviso y "Deshacer"
    And la comida sigue en modo "Cambia cada día" (cada día se puede cambiar después)

  Scenario: Pasar una comida de "Igual todos los días" a "Cambia cada día"
    Given la comida "Almuerzo" está en "Igual todos los días" con 3 ítems
    When cambia su modo a "Cambia cada día"
    Then los 7 días quedan con esos mismos 3 ítems, para empezar a variarlos

  Scenario: Pasar una comida de "Cambia cada día" a "Igual todos los días"
    Given el desayuno tiene contenidos distintos según el día
    When cambia su modo a "Igual todos los días"
    Then le pregunta qué día conservar (por defecto, el lunes)
    And avisa "Se van a borrar los desayunos de los otros días"
    And después del cambio puede "Deshacer"

  Scenario: Comida con opciones
    Given la comida "Colaciones" es "Igual todos los días" con "Opciones (elige una)"
    And tiene "Budín de banana 1 porción" (180 kcal), "Fruta 1 unidad" (80 kcal) y "Huevo duro 1" (70 kcal)
    Then se muestra como lista de opciones ("Elegí una")
    And al total del día suma lo que diga N1 (recomendación: el promedio, 110 kcal)
    And al lado del total de la comida se ve "Opciones: 70 a 180 kcal"
```

```gherkin
Feature: Objetivo por día y resumen de la semana

  Scenario: Franja del día contra el objetivo
    Given la prescripción de referencia del plan es 1.800 kcal, 110 g P, 200 g C, 60 g G (D7)
    When la nutricionista está en la pestaña "Martes"
    Then la franja fija de arriba muestra, para kcal, proteínas, carbohidratos y grasas,
      "lleva / objetivo" del martes (p. ej. "1.240 / 1.800 kcal") y una barra de progreso
    And cada valor dice con texto "Falta X", "En objetivo" (±5 %) o "Se pasa X" (no solo con color)
    And un texto chico dice de dónde sale el objetivo: "Objetivo: consulta del 12/09/2026"
    And el objetivo es el mismo para los 7 días

  Scenario: Vista de la semana
    When toca "Semana"
    Then ve una tabla con una fila por comida y una columna por día, con el nombre de lo que hay
      en cada celda (las comidas "Todos los días" ocupan la fila entera)
    And abajo, por día: kcal y estado ("En objetivo", "Falta 300 kcal", "Se pasa 15 g G")
    And el "Promedio diario de la semana" de kcal, P, C y G contra el objetivo
    And tocar una celda lleva a ese día con esa comida a la vista

  Scenario: Día vacío
    Given el jueves no tiene ninguna comida "Cambia cada día" cargada
    Then la vista de la semana lo marca "Sin cargar" y no lo cuenta en el promedio
    And la pestaña "Jueves" ofrece "Copiar otro día acá"

  Scenario: Paciente sin requerimiento calculado
    Given el paciente no tiene ninguna prescripción
    Then la franja muestra solo los totales del día
    And un aviso "Calculá el requerimiento para ver cuánto falta" con un enlace a la consulta

  Scenario: Micronutrientes
    Then la sección de micronutrientes (HU-010) usa el promedio diario de la semana
      (los días sin cargar no cuentan)
```

```gherkin
Feature: Planes y plantillas existentes, plantillas y portal

  Scenario: Migración sin pérdida
    Given un plan creado antes de esta HU con sus comidas e ítems
    When se aplica la migración
    Then cada comida queda en modo "Igual todos los días", sin opciones,
      con los mismos ítems, gramos, notas y orden
    And los totales de cada día son iguales a los totales que el plan tenía antes
    And el PDF ya generado (guardado) no cambia
    And lo mismo pasa con las plantillas

  Scenario: Plantillas semanales
    Given una plantilla
    Then se edita igual que un plan (pestañas por día, modos, opciones), sin objetivo
    When se aplica la plantilla a un paciente
    Then el plan nuevo copia comidas, modos, días e ítems tal cual

  Scenario: Asistente IA del plan
    When la nutricionista pide una propuesta al asistente IA
    Then la propuesta se carga como comidas "Igual todos los días" (como funciona hoy)
    And después ella puede pasarlas a "Cambia cada día" y variarlas

  Scenario: Portal del paciente
    Given un plan activo con comidas por día
    When el paciente lo abre en el portal
    Then ve la pestaña del día de hoy seleccionada (zona horaria de la profesional)
    And puede pasar a los otros días
    And las comidas "Todos los días" se ven en todos los días; las de opciones dicen "Elegí una"
    And un plan migrado ("todo igual todos los días") se ve sin pestañas, como hoy

  Scenario: PDF del plan (mínimo, hasta la HU-015)
    When se genera el PDF de un plan semanal
    Then primero salen las comidas "Todos los días" (y las de opciones como lista "Elegí una")
    And después cada comida "Cambia cada día" con sus 7 días (Lunes: …, Martes: …),
      como en la plantilla real
    And un plan migrado sale igual que hoy
```

### 018c — Buscador de recetas con impacto por día

```gherkin
Feature: Buscar recetas desde una comida de un día

  Background:
    Given el plan está en la pestaña "Martes" y tiene la comida "Desayuno" ("Cambia cada día")
    And hay recetas publicadas

  Scenario: Abrir el buscador
    When toca "Agregar receta" en el desayuno del martes
    Then se abre el buscador titulado "Agregar a Desayuno · Martes"
    And el chip de momento "Desayuno y merienda" ya viene marcado (D11), y se puede quitar
    And la fila "Agregar en:" tiene marcado solo "Martes"
    And el cursor está en el campo de búsqueda
    And sin escribir nada ya ve las recetas de ese momento

  Scenario: Abrir desde una comida "Todos los días"
    When toca "Agregar receta" en "Colaciones" ("Igual todos los días")
    Then el título es "Agregar a Colaciones · Todos los días"
    And no aparece la fila de días
    And el impacto se calcula sobre el promedio de la semana

  Scenario: Buscar por ingrediente
    When escribe "avena"
    Then en menos de un segundo ve una grilla de tarjetas de recetas
      cuyo nombre, ingredientes o etiquetas contienen "avena" (sin importar tildes ni mayúsculas)
    And cada tarjeta muestra: foto, nombre, porción en medida casera ("1 porción = 2 panqueques"),
      kcal y P / C / G de 1 porción
    And el impacto en el martes: "Suma 14 % de las kcal del martes"
    And una señal de encaje con texto: "Entra en lo que falta" o "Se pasa en grasas (+8 g)" (D14)

  Scenario: Filtrar con chips
    When toca el chip de tipo "Colación"
    Then la grilla muestra solo colaciones, sin recargar la página
    And el chip queda marcado (aria-pressed) y el contador se actualiza
    And "Quitar filtros" vuelve a mostrar todo

  Scenario: Sin resultados
    When escribe "quinoa" y no hay recetas que coincidan
    Then ve "No hay recetas con «quinoa»." con sugerencias:
      "Probá con otro ingrediente", el botón "Quitar filtros" (si hay filtros) y "Crear receta"

  Scenario: Ver el detalle antes de agregar
    When toca la foto o el nombre de una tarjeta
    Then ve el detalle: foto grande, ingredientes con gramos y medida casera, preparación,
      fuente y el mismo impacto en el día
    And el botón "Agregar a Desayuno · Martes"
```

```gherkin
Feature: Agregar una receta a la comida

  Scenario: Agregar en un toque
    When toca "Agregar" en la tarjeta "Panqueques de avena y banana"
    Then se agrega 1 porción al desayuno del martes sin cerrar el buscador
    And el botón pasa a "Agregada" con un control "− 1 porción +"
    And la franja del martes se actualiza ("1.240 → 1.495 / 1.800 kcal")
    And aparece el aviso "Panqueques agregados a Desayuno (martes). Deshacer" durante unos segundos

  Scenario: Agregar en varios días a la vez
    Given en "Agregar en:" marca también "Jueves" y "Sábado"
    When toca "Agregar"
    Then se agrega 1 porción al desayuno del martes, del jueves y del sábado
    And el aviso dice "Panqueques agregados a Desayuno (martes, jueves y sábado). Deshacer"
    And la señal de encaje de la tarjeta evalúa cada día marcado y muestra el peor
      ("Se pasa en grasas el jueves (+8 g)")
    And la franja sigue mostrando el martes

  Scenario: Deshacer
    Given acaba de agregar una receta (en uno o varios días)
    When toca "Deshacer"
    Then se quitan todos los ítems que agregó esa acción y los totales vuelven a como estaban

  Scenario: Cambiar porciones
    Given la receta ya está en la comida
    When toca "+" en la tarjeta o en el ítem de la comida
    Then pasa a 1½ porciones (pasos de ½, D9) y los macros se recalculan
    And si se agregó en varios días, el "+" de la tarjeta cambia solo el día que se está editando

  Scenario: Cerrar el buscador
    When toca "Listo" o cierra el panel
    Then vuelve al martes, con el desayuno mostrando
      "Panqueques de avena y banana · 1 porción (2 panqueques) · 255 kcal"

  Scenario: Error al agregar
    Given falla el guardado
    Then la tarjeta vuelve a "Agregar" y muestra junto al botón "No se pudo agregar. Probá de nuevo."
    And los totales no cambian
```

```gherkin
Feature: La receta en el resto del sistema

  Scenario: Micronutrientes
    Given un plan con una receta
    Then la sección de micronutrientes (HU-010) suma los de sus ingredientes por las porciones

  Scenario: Plantillas
    Given una plantilla
    Then también puede agregar recetas con el mismo buscador, sin objetivo ni porcentajes (D17)
    And al aplicar la plantilla a un paciente, las recetas se copian con sus porciones y sus días

  Scenario: Portal del paciente (D3 = b, D19)
    Given un plan activo con una receta
    When el paciente lo ve en el portal
    Then ve el nombre de la receta y su porción en medida casera ("1 porción: ¾ albóndigas")
    And al tocar "Ver receta" ve la foto, los ingredientes en medida casera (y gramos),
      la preparación, los tips y "Fuente: …" — también en las recetas de terceros
    And no ve los macros

  Scenario: PDF del plan
    When se genera el PDF
    Then la receta sale como una línea: nombre + porción en medida casera + "Fuente: …" si es de terceros
    And el detalle de las recetas en el PDF (anexo con preparación) lo define la HU-015

  Scenario: Planes existentes
    Given planes y plantillas sin recetas
    Then se ven igual que después de 018b
```


---

## Datos que se registran

### Receta (018a)

| Dato | Obligatorio | Uso |
|---|---|---|
| Nombre | Sí | Búsqueda, tarjeta, plan, portal, PDF |
| Estado: Borrador / Publicada / Archivada | Sí | Solo las publicadas aparecen en el buscador |
| Tipo (uno): Plato principal, Guarnición, Ensalada, Colación, Desayuno y merienda, Panes y masas, Dulces y postres (ver D12) | Sí | Chip de filtro, ilustración sin foto |
| Momentos del día (varios): Desayuno, Almuerzo, Merienda, Cena, Colación | Sí, al menos uno | Chip de momento preseleccionado desde la comida |
| Rendimiento (número de porciones) | Sí para publicar | Divide la suma de ingredientes |
| Porción en medida casera (texto: "¾ albóndigas", "1/4 de tarta", "1 taza") | Sí para publicar | Lo que ve el paciente |
| Gramos de una porción | No | Referencia; el paciente no lo ve (ver D9) |
| Ingredientes (lista ordenada) | Al menos uno | Macros, búsqueda por ingrediente |
| Preparación (texto) | No | Detalle; portal según D19 |
| Tips / conservación (texto) | No | Detalle; viandas (EP-058) |
| Etiquetas: Sin TACC, Vegetariana, Apta vianda / freezer (ver D12) | No | Chips |
| Foto (binario + tipo) | No | Tarjeta y detalle (D3, D18) |
| Fuente / autor (texto) y archivo + página de origen | No (sí si viene de la carga asistida) | Atribución, derechos (D3), carga repetible |
| Macros publicados por la fuente (kcal, P, C, G, fibra por porción) | No | Solo para comparar con el cálculo (D4) |
| Macros por porción | Calculado, no se guarda a mano | Tarjeta, plan (D10) |

### Ingrediente de la receta (018a)

| Dato | Obligatorio | Uso |
|---|---|---|
| Alimento (SARA 2 o propio) | No (si falta, es texto libre sin macros) | Macros, búsqueda por ingrediente |
| Texto del ingrediente ("Puré de calabaza") | Sí si no hay alimento | Lo que se lee en la receta |
| Gramos | No ("c.n." = sin cantidad) | Macros |
| Medida casera (texto: "1 taza", "2 cdas", "una unidad") | No | Lo que se lee en la receta |
| Texto crudo de origen | Solo carga asistida | Revisión |
| Orden | Sí | Mostrar |

### Menú semanal en el plan y en la plantilla (018b)

| Dato | Obligatorio | Uso |
|---|---|---|
| Modo de la comida: "Cambia cada día" / "Igual todos los días" | Sí, default "Igual todos los días" para lo migrado | Editor, totales, portal, PDF |
| "Opciones (elige una)" en la comida | No, solo con "Igual todos los días" | Lista de alternativas; cómo suma al día (N1) |
| Día del ítem (lunes a domingo) | Sí en comidas "Cambia cada día"; vacío en "Igual todos los días" | Qué se come cada día |

Los ítems siguen siendo alimento, texto libre o (018c) receta. La semana es de 7 días fijos,
lunes a domingo.

### Ítem de receta en el plan y en la plantilla (018c)

| Dato | Obligatorio | Uso |
|---|---|---|
| Receta | Sí | Nombre, porción, macros |
| Porciones (½, 1, 1½…) | Sí, default 1 | Multiplica los macros (D9) |
| Notas | No | Como hoy en los ítems |
| Orden | Sí | Como hoy |

Los ítems de alimento y de texto libre siguen como hoy.

---

## Diseño UX

### Principios para esta usuaria

La nutricionista no maneja bien la computadora. Todo lo de abajo prioriza: **una acción principal
por pantalla, objetivos grandes, texto en vez de íconos sueltos, nada que dependa del hover, y
deshacer en lugar de confirmar**. Se usan los tokens y primitivos del rediseño Apple (HU-017a:
`apps/web/src/lib/design-tokens.ts`, `components/primitives/*`, skill `apple-design`), no colores
ni componentes nuevos.

### Recomendaciones de ui-ux-pro-max (búsqueda → qué se aplica)

| Búsqueda (dominio) | Resultado | Aplicación en esta HU |
|---|---|---|
| "search results grid filters" (ux) | *No Results*: mostrar sugerencias, no "0 resultados". *Autocomplete*: resultados mientras escribe, con debounce | La grilla se actualiza al escribir (debounce corto), sin botón "Buscar". Estado vacío con sugerencias y "Crear receta" |
| "empty state search" (ux) | *Empty States*: mensaje útil + acción | Sin recetas cargadas: "Todavía no hay recetas. Cargá la primera" con botón. Buscador vacío: recetas del momento + chips de ingredientes sugeridos ("avena", "huevo", "banana", "pollo") |
| "touch target size" (ux) | 44 pt en iOS; en web mínimo 24 px (WCAG 2.2), separación ≥ 8 px | Usamos 44 px (utilidad `.touch-target` y botón `lg` `h-11` de 017a): "Agregar", chips, "−/+" y "Listo". `gap-2` como mínimo entre objetivos |
| "filter chips selected state" (ux) | *Chip Collection Reflow*: los chips se envuelven a la línea siguiente, no se cortan. *Compact Control Semantics*: `<button aria-pressed>` | Chips en `flex-wrap`, nunca en un carrusel horizontal. Chip marcado = `ToggleGroupItem` encendido de 017a (`primary-soft` + texto tint) |
| "image lazy loading aspect ratio" (ux) | Lazy load de lo que está bajo el pliegue; WebP; imágenes que no desbordan | Fotos con `loading="lazy"` salvo la primera fila; servidas en WebP y en el tamaño de la tarjeta |
| "loading skeleton" (ux) | Skeleton estable con `aria-busy`; reservar el espacio (*Content Jumping*: `aspect-ratio` para medios) | Tarjetas con `aspect-ratio: 4/3` reservado; skeleton de tarjetas mientras carga (el `Skeleton` de 017a, estático con reduced motion) |
| "progress toward target" (chart) | Para 3+ KPI contra objetivo: **bullet chart / barra de progreso** en grilla; número y objetivo **en texto al lado**; el color solo no alcanza | La franja del día: 4 barras (kcal, P, C, G) con "lleva / objetivo" y "Falta / En objetivo / Se pasa" en texto, con ícono |
| "next image remote optimization" (stack nextjs) | `next/image` con ancho y alto; no `<img>` suelto | Fotos de recetas con `next/image` (el architect resuelve cómo se sirven los binarios de la base) |
| "sheet dialog drawer" (stack shadcn) | *Sheet* para paneles laterales; lado explícito | El buscador es un `Sheet` `side="right"` ancho en escritorio; en el celular ocupa toda la pantalla (`side="bottom"` con grabber, como define 017a) |
| "toggle group command search" (stack shadcn) | *Command* para búsqueda tipo paleta | **No se usa** `Command` acá: es para listas de texto con teclado; esto es una grilla con fotos. `Command`/combobox queda para alimentos sueltos (`food-picker`, como hoy) |
| "healthcare clinic nutrition" (product) | *Calorie & Nutrition Counter*: colores por macro + progreso | Se toma la idea (un color fijo por macro, siempre el mismo en barra, tarjeta y detalle) pero con la paleta `chartPalette` de 017a, no la verde/naranja/amarilla que sugiere |
| "e-commerce product search" (product) | Estilo "Vibrant & Block-based" | **Descartado**: choca con el rediseño Apple. De Google Shopping se toma la estructura (buscador + chips + grilla con foto + dato clave en la tarjeta), no el estilo |
| Reglas de `quick-reference.md` | `undo-support`, `loading-buttons`, `hover-vs-tap`, `color-not-only`, `number-tabular`, `progressive-disclosure`, `reduced-motion` | Deshacer en vez de confirmar al agregar; botón deshabilitado con spinner mientras guarda; nada solo en hover; estados con texto; `tabular-nums` en todos los números; filtros secundarios plegados; animaciones con reduced motion |

### 1. Plan como menú semanal (`/pacientes/[id]/planes/[planId]`), zona de Leo (018b)

Disposición (escritorio; en el celular, una columna):

```
┌──────────────────────────────────────────────────────────────────────┐
│ Plan de octubre                                                      │
│ ( Semana ) ( Lun ) ( Mar● ) ( Mié ) ( Jue ) ( Vie ) ( Sáb ) ( Dom )  │ ← control segmentado, 44 px
│ ┌ Martes ─────────────────────────────────────────────────────────┐  │ ← franja fija (translúcida)
│ │ Energía 1.240 de 1.800 kcal ▓▓▓▓▓▓▓░░ Faltan 560 kcal            │  │
│ │ Proteínas 70 de 110 g ▓▓▓▓▓░░ Faltan 40 g   Carbohidratos …  Grasas … │
│ │ Objetivo: consulta del 12/09/2026 · Promedio semanal: 1.690 kcal │  │
│ └─────────────────────────────────────────────────────────────────┘  │
│ [ Copiar este día a… ]                                               │
│ ┌ Desayuno · Martes ───────────────────────── 255 kcal ┐             │
│ │ [foto] Panqueques de avena y banana · 1 porción …  − 1 +  Quitar   │
│ │ [ 🔍 Agregar receta ]  [ Agregar alimento ]   ⋯ Repetir en todos los días │
│ └──────────────────────────────────────────────────────┘             │
│ ┌ Colaciones · Todos los días · Elegí una ───── 70 a 180 kcal ┐     │
│ │ Budín de banana · Fruta · Huevo duro                              │
│ └─────────────────────────────────────────────────────────────┘     │
└──────────────────────────────────────────────────────────────────────┘
```

- **Selector de día**: control segmentado de 017a (`ToggleGroup`, estado encendido con
  `primary-soft`), 8 segmentos de 44 px: "Semana" y Lun…Dom. Al abrir el plan se selecciona el
  **lunes** (o "Semana" si el plan está vacío). Un punto chico marca los días "sin cargar". Si el
  plan no tiene ninguna comida "Cambia cada día" (planes migrados), el selector no aparece y el
  plan se ve como hoy.
- **Franja del día** (reemplaza la `MacroTotals` fija cuando hay objetivo): título con el día
  ("Martes"), 4 celdas grandes — Energía, Proteínas, Carbohidratos, Grasas — con el número
  grande (`metric-md`, `tabular-nums`), "de 1.800 kcal", una barra con marca en el objetivo, y el
  estado con ícono + texto: "Faltan 560 kcal", "En objetivo", "Se pasa 12 g". Fibra como dato
  chico. Debajo, en `footnote`: "Objetivo: consulta del 12/09/2026 · Promedio semanal: 1.690 kcal".
  - "En objetivo" = dentro de ±5 % (D14).
  - Con el buscador abierto, al pasar el cursor o el foco por una tarjeta, la barra muestra en
    tono claro lo que sumaría esa receta (vista previa); también con teclado.
- **Cada comida** es una tarjeta con su nombre, el día ("· Martes") o la marca "Todos los días"
  (y "Elegí una" si es de opciones), y su total (o el rango "70 a 180 kcal" si es de opciones).
  Al pie, **"Agregar receta"** (primario, 018c) y "Agregar alimento" (secundario, el
  `food-picker`). Lo demás va en un menú "⋯" de la comida: "Repetir en todos los días",
  "Cambiar a Igual todos los días / Cambia cada día", "Opciones (elige una)", "Renombrar",
  "Borrar". Así queda una sola acción principal visible por comida.
- **"Copiar este día a…"**: botón secundario arriba de las comidas. Abre un diálogo con los
  otros 6 días como casillas grandes ("Martes ya tiene comidas: se van a reemplazar" al lado de
  los que tienen contenido) y "Copiar". Después, toast con "Deshacer" (no se pide confirmación
  extra: `undo-support`).
- **Vista "Semana"**: tabla de solo lectura, filas = comidas, columnas = días (en el celular,
  una lista por día). Cada celda con los nombres cortos de lo que hay; las comidas "Todos los
  días" en una fila combinada. Al pie, una fila por día con kcal y estado en texto, y el
  "Promedio diario" contra el objetivo. Tocar una celda lleva a ese día. Es la vista para
  revisar de un vistazo, no para editar.
- **Ítem de receta** (018c) dentro de la comida: miniatura de la foto (48 px), nombre, porción
  casera ("1 porción · ¾ albóndigas"), kcal y P/C/G en chico, control "− 1 +" de 44 px y
  "Quitar". Etiqueta "Receta".
- **Plantillas** (`/plantillas/[id]`): el mismo editor, sin franja de objetivo (solo totales del
  día y promedio).

### 2. Buscador "Agregar a Desayuno · Martes" (Sheet, 018c)

Disposición en escritorio (panel derecho de ~2/3 del ancho; el plan queda atrás, sin scrim fuerte
para que se vea la franja del día — o la franja se repite arriba del panel, decide el architect):

```
┌──────────────────────────────────────────────────────────────┐
│ Agregar a Desayuno · Martes                         [ Listo ]│  ← encabezado translúcido (material bar)
│ ┌──────────────────────────────────────────────────────────┐ │
│ │ 🔍  Buscar por ingrediente o nombre: avena, pollo…        │ │  ← input grande (h-12), foco al abrir
│ └──────────────────────────────────────────────────────────┘ │
│ Agregar en: (Lun) (Mar●) (Mié) (Jue) (Vie) (Sáb) (Dom)        │  ← días, solo en "Cambia cada día"
│ Momento: [Desayuno y merienda ✕]                              │
│ Tipo:    (Todas) (Colaciones) (Platos) (Guarniciones) …       │  ← chips que se envuelven
│ [Más filtros ▾]  (Sin TACC, Vegetariana, Apta vianda)          │  ← plegado
│ Mostrando 12 recetas                                          │
│ ┌────────────┐ ┌────────────┐ ┌────────────┐                  │
│ │   foto 4:3 │ │   foto 4:3 │ │   foto 4:3 │                  │
│ │ Panqueques │ │ Budín de   │ │ Galletitas │                  │
│ │ de avena   │ │ banana     │ │ de manzana │                  │
│ │ 1 porción: │ │ 1 porción  │ │ 3 unidades │                  │
│ │ 2 panqueq. │ │            │ │            │                  │
│ │ 255 kcal   │ │ 180 kcal   │ │ 150 kcal   │                  │
│ │ P 12·C 30·G 8              │ │            │                  │
│ │ 14 % del martes │ …      │ │ …          │                  │
│ │ ✓ Entra en lo que falta   │ │ ⚠ Se pasa en grasas (+8 g)    │
│ │ [  Agregar  ]│ [ Agregar ]│ │ [ Agregar ]│                  │
│ └────────────┘ └────────────┘ └────────────┘                  │
└──────────────────────────────────────────────────────────────┘
```

- **Grilla**: 3 columnas en el panel de escritorio, 2 en tablet, 1 en celular. Tarjetas
  `rounded-xl` con `shadow-card`, foto arriba (4:3, reservada), contenido con jerarquía:
  nombre (`headline`, hasta 2 renglones), porción casera (`subheadline`), kcal grande
  (`title-3`, `tabular-nums`), P/C/G en una línea con el color fijo de cada macro + la letra
  (no solo color), "14 % de las kcal del martes" y la señal de encaje con ícono + texto.
- **"Agregar en:"** (solo si la comida es "Cambia cada día"): fila de 7 chips de día
  multiselección, con el día que se está editando ya marcado. Si se marcan varios, el botón de
  la tarjeta dice "Agregar en 3 días" y la señal de encaje muestra el peor día. Para una comida
  "Todos los días" la fila no aparece y el impacto es sobre el promedio semanal.
- **"Agregar"**: botón `lg` de 44 px a todo el ancho de la tarjeta. Al tocar: respuesta en el
  press (escala 0,97, 017a), spinner y deshabilitado mientras guarda, luego "Agregada ✓" con
  "− 1 porción +". Toast (sonner de 017a) "Panqueques agregados a Desayuno (martes) · Deshacer".
- **Detalle** (al tocar foto o nombre): `Dialog` con foto grande, porción, ingredientes en dos
  columnas (medida casera + gramos), preparación plegable, fuente, el mismo bloque de impacto y
  "Agregar a Desayuno · Martes". Se cierra volviendo a la grilla en el mismo lugar del scroll.
- **Teclado**: el input tiene el foco al abrir; Tab recorre chips y tarjetas en orden; Enter en
  una tarjeta abre el detalle; Escape cierra el panel. Foco visible siempre.
- **Estados**:
  - Cargando: 6 tarjetas skeleton.
  - Sin resultados: "No hay recetas con «quinoa»." + "Probá con otro ingrediente" + chips de
    ingredientes sugeridos + "Quitar filtros" (si hay) + "Crear receta".
  - Sin recetas en el sistema: "Todavía no hay recetas cargadas." + "Ir a Recetas".
  - Error de carga: "No se pudieron cargar las recetas." + "Reintentar".
  - Sin objetivo: la tarjeta muestra solo los macros; el aviso de la franja explica por qué.
- **Movimiento**: el Sheet entra y sale por el mismo lado con el spring `standard` de 017a; en
  el celular se puede cerrar arrastrando (grabber). Con `prefers-reduced-motion`, fundido.
  La barra del día anima el cambio de valor (spring sin rebote); con reduced motion, salta.

### 3. Recetas (`/recetas`, nueva, 018a)

- Entrada en la barra lateral, grupo de nutrición, junto a "Alimentos" y "Plantillas": "Recetas".
- Encabezado "Recetas", botón primario "Nueva receta". Pestañas "Publicadas" / "Para revisar (N)"
  / "Archivadas".
- Misma grilla y chips que el buscador (componente compartido), sin el bloque de impacto: la
  tarjeta muestra kcal y P/C/G por porción.
- **Ficha / formulario** (`/recetas/[id]`, `/recetas/nueva`) en una columna, de arriba abajo:
  1. Foto (zona grande "Tocá para subir una foto", vista previa al instante).
  2. Nombre, Tipo (selector), Momentos (chips multiselección).
  3. Rendimiento ("Rinde [ 8 ] porciones") y Porción ("1 porción es [ ¾ albóndigas ]",
     "pesa [   ] g (opcional)").
  4. Ingredientes: una fila por ingrediente con el buscador de alimentos (el `food-picker`),
     gramos y medida casera; "Agregar ingrediente" grande al final; "Sin cantidad (c.n.)" como
     casilla.
  5. Tarjeta fija al costado (abajo en el celular): "1 porción aporta" kcal grande + P/C/G +
     desglose Atwater (reusar `food-energy-card` / `kcal-breakdown-popover`) + avisos de
     ingredientes sin cantidad o sin alimento.
  6. Preparación, Tips / conservación, Etiquetas, Fuente — plegados bajo "Más datos"
     (progressive disclosure).
  7. "Guardar" (primario) / "Archivar" (secundario). Errores junto al campo.
- **Revisión de borradores**: en escritorio, dos columnas: a la izquierda el texto o la imagen
  de la página de origen, a la derecha el formulario precargado. Cada ingrediente sugerido tiene
  "✓ Aceptar" / "Cambiar". Arriba: "Borrador 3 de 40 · Saltar · Publicar y seguir". Esta
  pantalla la puede usar Joel para hacer la carga, no necesariamente ella (D6).

### 4. Portal y PDF (018b y 018c)

- Portal (`plan-view.tsx`, 018b): el mismo selector de días (Lun…Dom, con **hoy** seleccionado)
  arriba del plan; cada comida del día y las de "Todos los días"; las de opciones con "Elegí
  una". Sin selector si el plan es todo "Igual todos los días". Los totales que hoy muestra el
  portal pasan a ser los del día seleccionado.
- Portal (018c): la receta como un ítem con miniatura, nombre y "1 porción: ¾ albóndigas"; "Ver
  receta" abre un sheet con foto, ingredientes (medida casera y gramos), preparación, tips y
  "Fuente: …", también para recetas de terceros (D3 = b).
- PDF (`plan-pdf.tsx`): versión mínima y legible hasta que la HU-015 lo rehaga: comidas "Todos
  los días" primero; después cada comida "Cambia cada día" con sus 7 días ("Lunes: …"), como la
  plantilla real. La receta, una línea: nombre + porción casera + "Fuente: …".

### Bot de WhatsApp

No interviene.

---

## Fuera de alcance

- **Menú de más de una semana** (la plantilla real a veces trae dos semanas de desayunos): la
  semana es de 7 días fijos. Una segunda semana iría en otra HU.
- **Fechas reales en el menú** (el "martes 14"): los días son días de la semana, sin calendario.
- **Equivalencias / reemplazos generales** ("1 huevo = 2 cdas de legumbres", épica 24) y las
  secciones de texto del plan real (recomendaciones, alimentos de consumo diario y ocasional):
  son de la HU-015 / otra HU.
- **Medidas caseras de alimentos sueltos** con conversión a gramos (018d, D21). En 018a/b/c la
  medida casera es texto al lado de los gramos.
- **Crudo/cocido y factor de rendimiento** (épica 21, primera historia): los gramos del
  ingrediente se toman tal cual, del alimento crudo o cocido que se elija.
- **Objetivo por comida** (reparto del VCT por desayuno, almuerzo…, épica 23) y ranking de
  recetas por encaje con ese reparto.
- **Recetas en el asistente IA del plan** (`ai-actions.ts`) y menú semanal generado con IA
  (épica 40): en 018b el asistente solo se adapta para cargar su propuesta como "Igual todos los
  días".
- **Rediseño del PDF del plan** y la plantilla de la nutricionista (HU-015 de Leo). 018b deja
  solo una versión mínima por día.
- **Rediseño general de la pantalla del plan** (HU-017e); acá solo se agregan las piezas nuevas.
- **Guías educativas** ("Reemplazos", "Conservación de verduras en el freezer") como contenido
  del sistema (D20).
- **Bancos de imágenes PPTX como recetas**: no traen recetas; sus imágenes se pueden usar como
  fotos de recetas (D3 = b, con atribución).
- **Lista de compras** desde las recetas (épica 29).
- Compartir o vender recetarios a otros profesionales.
- Cualquier mensaje de WhatsApp.

---

## Notas de implementación (mínimas; el detalle lo escribe el architect)

- **Schema** (018a): `Recipe`, `RecipeIngredient` (FK a `Food` nullable, sin cascada, como
  `PlanMealItem`), etiquetas y momentos (enum o tabla, a criterio del architect).
  **018b**: una forma simple y aditiva (la decide el architect) es agregar a `PlanMeal` y
  `TemplateMeal` un modo (`EVERY_DAY` / `PER_DAY`, default `EVERY_DAY`) y la marca de opciones
  (default `false`), y a `PlanMealItem` y `TemplateMealItem` un día de la semana nullable
  (`null` = todos los días). Así la migración de lo existente es solo el default: **ningún dato
  se mueve** y los totales quedan iguales. Las funciones de totales (`meal-view.ts`, `sumMacros`)
  pasan a calcular por día. `applyTemplateToPatient` copia modo, opciones y día.
  **018c**: el ítem de receta en `PlanMealItem` y `TemplateMealItem` (FK `recipeId` nullable +
  `portions`). Migraciones aditivas, sin `NOT NULL` sin default. Una sola HU con migración en
  `implementando` a la vez (regla del equipo): 018a y 018b no se implementan en paralelo.
- **Macros de la receta**: función pura en `packages/core` (suma de `computeItemMacros` de los
  ingredientes / rendimiento × porciones), con tests. Reusar Atwater y `searchFoods` (normalización
  sin tildes) para buscar por ingrediente. Micronutrientes: extender `computePlanMicronutrients`
  para expandir la receta a sus ingredientes.
- **Búsqueda**: con ~300 recetas se puede filtrar en el cliente como `food-picker`, o en el
  servidor; lo decide el architect. Tiene que responder en < 1 s.
- **Fotos**: hoy los binarios van a la base (logo, firma, diario). Para ~300 fotos conviene
  guardarlas ya redimensionadas (p. ej. WebP ~800 px) y servirlas con una ruta con caché; lo
  decide el architect (D18).
- **Carga asistida**: script en el repo (tipo `foodImport.ts` de la HU-005) que lee los PDF
  locales con `pdftotext`, separa recetas y escribe borradores **por id propio** (clave archivo +
  página + nombre). El texto de terceros **no se versiona** en el repo (D3): el script lee de
  `docs/recetarios/` (gitignored). Si se usa IA para estructurar, va sin datos de pacientes (D5).
- **Objetivo del día**: `packages/db/domain` (lo usa solo web hoy, pero sigue la regla) con la
  prescripción de la consulta vinculada al plan o la más reciente (D7).
- **Totales por día**: lógica pura en `packages/core` (dado un plan con modos, opciones y días,
  devolver totales de cada día y el promedio de los días cargados; las opciones según N1), con
  tests. La usan el editor, el portal, el PDF y los micronutrientes.
- **Zona de Leo**: 018b reescribe buena parte de `meals-editor.tsx` y toca
  `planes/[planId]/{page,actions,ai-actions}.tsx`, `plantillas/**`, `meal-view.ts`,
  `plan-pdf.tsx`, `(portal)/portal/plan/**` y `packages/db/domain/{nutritionPlans,planTemplates}.ts`.
  018c agrega el buscador en componentes nuevos (`components/recipe-*`) y en la zona solo "monta
  el botón y el Sheet". Base de datos de desarrollo y WhatsApp: reglas de `AGENTS.md`.

### Coordinación con Leo (punto explícito)

- El PR #7 y la HU-017a ya están en `develop`: D15 y D16 quedan resueltas por dependencia (no hay
  que esperar nada para arrancar).
- **El menú semanal cambia lo que la HU-015 imprime**: el PDF/Word del plan deja de ser "una lista
  de comidas" y pasa a "comidas de todos los días + comidas por día de la semana (+ opciones)",
  que es justamente la estructura de la plantilla real de la nutricionista. Antes de arrancar
  018b hay que acordar con Leo:
  1. que la HU-015 se construya sobre el modelo semanal (o que espere a 018b para la parte del
     PDF);
  2. que el PDF mínimo de 018b es provisional y la HU-015 lo reemplaza;
  3. quién implementa 018b (ver N2) y el orden de merge;
  4. que la HU-017e (rediseño de planes) parta del editor semanal, no del actual.

---

## Dudas originales (respondidas el 2026-10-03)

Se conservan como estaban planteadas, para el registro. **Lo que vale es la sección
"Resoluciones (2026-10-03)"**, que está al final y ya está aplicada al resto del documento. En
estas dudas, "018b" quiere decir el buscador (hoy 018c) y "018c", las medidas caseras (hoy 018d).

**D1. ¿Las recetas de una comida se suman o son opciones?** En la plantilla real, el desayuno
tiene 7 alternativas (una por día) y las colaciones son "opciones". Hoy el sistema **suma** todos
los ítems de una comida. Si ella agrega 7 desayunos, el día da 7 desayunos.
- (a) Se suman, como hoy: una comida = lo que se come en esa comida. Las alternativas, en otra HU.
- (b) Cada comida puede marcarse "es una lista de opciones": los macros del día toman una opción
  (la primera, el promedio o la mayor).
- (c) Menú semanal: comidas por día de la semana.
- **Recomendación: (a) en 018b**, y abrir una HU aparte para (b)/(c) coordinada con la HU-015 de
  Leo (que rehace el plan que se entrega). Preguntarle a la nutricionista si arma el plan
  "un día tipo" (suma) o "opciones" (lista).

**D2. Corte.** 018a (recetario), 018b (buscador en el plan), 018c (medidas caseras de alimentos
sueltos, aparte). **Recomendación: aprobar 018a y 018b con esta HU; 018c se afina después.**

**D3. Derechos de los recetarios de terceros y sus imágenes.** Varios PDF dicen "PROHIBIDA LA
REVENTA Y/O COMERCIALIZACIÓN DEL MATERIAL", llevan marca de agua (Nutriarte) y el nombre y
matrícula de otra nutricionista; los PPTX son packs de imágenes de Nutrispace y Nutraweb. Cargarlos
en el sistema y mostrarlos a pacientes en el portal o el PDF puede exceder la licencia con la que
ella los compró. Opciones:
- (a) Recetas de terceros **solo de uso interno** (ella las usa para armar); al paciente solo le
  llega nombre + porción casera, con "Fuente: …"; nada de foto, ingredientes ni preparación de
  terceros. Fotos: las que ella saque o las de packs cuya licencia confirme.
- (b) Mostrar todo al paciente con atribución, si ella confirma que su licencia lo permite
  (idealmente por escrito del autor/proveedor).
- (c) Cargar solo recetas propias de ella.
- **Recomendación: (a) hasta que ella confirme la licencia de cada proveedor** (Nutriarte,
  Nutrispace, Nutraweb). El texto extraído y las imágenes **no se versionan** en el repo en
  ningún caso. Si el sistema algún día se ofrece a otros profesionales, estas recetas no van.

**D4. ¿Macros calculados o copiados del recetario?** Solo unos pocos recetarios traen tabla
nutricional y no dicen con qué tabla de composición la hicieron.
- (a) Calcular siempre desde los ingredientes con SARA 2 / propios; guardar la tabla del
  recetario solo para comparar y avisar si difiere más de 10 %.
- (b) Usar la del recetario cuando exista.
- **Recomendación: (a)**: es coherente con el resto del sistema (Atwater, SARA 2) y permite
  micronutrientes.

**D5. ¿Cómo se cargan los recetarios?**
- (a) A mano, receta por receta, en el formulario.
- (b) Carga asistida: un script extrae el texto de los PDF a borradores (nombre, rinde, porción,
  ingredientes crudos, preparación, página) y la revisión sugiere el alimento y los gramos que
  diga el texto; una persona confirma cada receta.
- (c) Como (b), pero usando IA para separar mejor ingredientes y cantidades (sin datos de
  pacientes; el texto de terceros sale a un proveedor externo).
- **Recomendación: (b)**, y (c) solo si (b) deja demasiado trabajo manual. Ningún gramo se
  inventa: si el texto dice "una taza" sin gramos, queda vacío hasta que alguien lo complete.

**D6. ¿Cuánto se carga al principio y quién revisa?** Son ~250–300 recetas con ~8 ingredientes
cada una (~2.000 ingredientes para mapear).
- (a) Todo de entrada. (b) Una primera tanda de las que ella más usa (p. ej. las colaciones y
  desayunos que aparecen en su plan real: budín de banana, crumble, pepas, panqueques, pizza
  dulce) y el resto a demanda. 
- **Recomendación: (b), ~40 recetas, revisadas por Joel** con la pantalla de revisión y validadas
  con ella; el resto quedan como borradores para cuando las necesite. Confirmar también cómo
  llegan a producción (correr la extracción contra producción o cargarlas allá con la pantalla).

**D7. ¿De dónde sale el "objetivo del día" del plan?** La prescripción es por consulta.
- (a) La de la consulta que indicó el plan (`Consultation.planId`); si no hay, la más reciente del
  paciente; si no hay ninguna, sin objetivo.
- (b) Siempre la más reciente.
- (c) Que ella elija en el plan contra cuál comparar.
- **Recomendación: (a)**, mostrando siempre "Objetivo: consulta del dd/mm/aaaa" para que se sepa
  cuál es.

**D8. ¿Dónde vive el buscador?**
- (a) Panel lateral ancho (Sheet) sobre el plan; pantalla completa en el celular.
- (b) Página propia (`…/planes/[planId]/recetas?comida=…`) con "Volver al plan".
- **Recomendación: (a)**: no pierde de vista el plan ni la franja del día, y agrega varias recetas
  sin ir y volver.

**D9. Porciones.** ¿Se pueden poner porciones fraccionarias? ¿Y gramos en vez de porciones?
- **Recomendación: porciones en pasos de ½ (½, 1, 1½… hasta 4)**, sin gramos en el ítem de
  receta (el paciente sigue la medida casera). Los gramos de una porción son opcionales en la
  receta, solo como referencia.

**D10. Si se edita una receta, ¿cambian los planes que ya la tienen?** Hoy los alimentos se
calculan en vivo: editar uno cambia todos los planes.
- (a) En vivo, con el aviso "esta receta está en N planes" antes de guardar (como HU-005).
- (b) Foto de los macros al agregarla al plan.
- **Recomendación: (a)**, por coherencia; la foto de macros para planes entregados es un tema
  general de planes, no de recetas.

**D11. ¿Cómo sabe el buscador si la comida es desayuno, almuerzo…?** El nombre de la comida es
texto libre.
- (a) Inferirlo del nombre ("desayuno", "merienda", "almuerzo", "cena", "colación"; sin tildes ni
  mayúsculas) y preseleccionar el chip, que se puede quitar.
- (b) Agregar un campo "momento" a cada comida.
- **Recomendación: (a)**: no cambia el modelo de comidas (zona de Leo). Si el nombre no
  coincide, el buscador abre sin chip de momento.

**D12. Tipos y etiquetas.** Propuesta: Tipo = Plato principal, Guarnición, Ensalada, Colación,
Desayuno y merienda, Panes y masas, Dulces y postres. Etiquetas = Sin TACC, Vegetariana, Apta
vianda / freezer. ¿Faltan (p. ej. "Para el mate", "Picoteo / fiestas", "Sin lactosa", "Vegana")?
**Recomendación: arrancar con esa lista y que ella la corrija**; que sean valores fijos (no
editables por ella) en esta HU.

**D13. ¿El buscador también muestra alimentos sueltos?** **Recomendación: no.** Los alimentos
sueltos siguen con "Agregar alimento" (el `food-picker`). El buscador con fotos es para recetas.

**D14. Señal de encaje y tolerancia.** ¿Cuándo una receta "entra" o "se pasa"?
**Recomendación**: comparar el total del día **después** de agregarla contra el objetivo:
"Se pasa en X" si algún macro o las kcal superan el objetivo en más de 5 %; si no, "Entra en lo
que falta". "En objetivo" en la franja = ±5 %. Sin ordenar resultados por encaje (por ahora el
orden es por relevancia de la búsqueda).

**D15. Coordinación con Leo.** 018b toca su zona (PR #7 abierto, HU-015 en curso, y la HU-017e
la va a rediseñar). **Recomendación**: 018a arranca ya (no toca su zona); 018b arranca **después
del merge del PR #7**, avisándole a Leo qué archivos se tocan; en el PDF solo una línea por
receta y el formato final lo define la HU-015. Confirmar con él si la HU-015 ya cambia el modelo
de comidas (por D1).

**D16. Dependencia del rediseño Apple.** El buscador usa `Sheet`, `ToggleGroup`, `Skeleton`,
sonner, Motion y `.touch-target` de la HU-017a (PR #20, aprobada, sin mergear).
**Recomendación**: 018a y 018b se construyen sobre `develop` con la 017a ya mergeada, directo en
el estilo nuevo.

**D17. Recetas en plantillas.** **Recomendación: sí** (es el mismo editor), sin franja de
objetivo porque la plantilla no tiene paciente; al aplicarla, las recetas se copian.

**D18. Fotos.** Tamaño máximo de subida y si ella va a sacar fotos desde el celular.
**Recomendación**: hasta 5 MB al subir (se guardan reducidas), JPG/PNG/WebP, y que se pueda
subir desde el celular. Sin foto, ilustración por tipo.

**D19. ¿El paciente ve la receta completa en el portal?** **Recomendación**: sí para las recetas
propias de ella (ingredientes en medida casera + preparación, sin macros); para las de terceros,
según D3.

**D20. Viandas y material educativo (EP-058).** La pseudo-HU pide "recomendaciones de cómo
conservar" al usar viandas. **Recomendación**: en 018a, etiqueta "Apta vianda / freezer" + nota
de conservación por receta. La guía general "Conservación de verduras en el freezer" (y
"Reemplazos") como material para el paciente queda fuera: si se quiere, es una HU de "material
educativo adjunto al plan".

**D21. Medidas caseras de alimentos sueltos (018c).** ¿De dónde salen las equivalencias
("1 taza de arroz cocido = X g", "1 cda de aceite = X g")? (a) Las carga ella por alimento;
(b) una tabla de referencia publicada. **Recomendación**: decidirlo al afinar 018c; no bloquea
018a/b.

**D22. Numeración de épicas.** `docs/historias-usuario-nutridesk.md` llega hasta la épica 56; la
EP-057 (macros diarios) y la EP-058 (viandas) solo están en el tablero. **Recomendación**:
agregarlas al archivo de épicas como 57 y 58, con estado "cubierta por HU-018" (57 parcial: ya la
cubría la HU-004 en lo de elegir los macros).

---

## Resoluciones (2026-10-03)

Respuestas del usuario, ya aplicadas en el Gherkin, los datos, la UX, el corte y las notas.

| Duda | Resolución | Ajuste en la HU |
|---|---|---|
| **D1** | **(c) Menú semanal** (no la recomendación). El plan se arma por día de la semana, como el plan real | Nueva parte **018b — Menú semanal**: comidas "Cambia cada día" / "Igual todos los días", "Opciones (elige una)", pestañas Lun–Dom + vista Semana, "Copiar este día a…", "Repetir en todos los días", franja del día + promedio semanal, migración sin pérdida (todo pasa a "Igual todos los días"), plantillas, portal por día, PDF mínimo por día. El buscador pasa a 018c y agrega en un día o en varios |
| **D2** | Aceptada, ajustada por D1 | Corte: **018a** recetario, **018b** menú semanal, **018c** buscador con impacto por día, **018d** medidas caseras (después). **Orden: 018b → 018a → 018c**, ver "Corte propuesto" |
| **D3** | **(b) Todo con atribución** | El paciente ve las recetas de terceros completas (foto, ingredientes, preparación) con "Fuente: …" en el portal y en el PDF. Las imágenes de los PPTX se pueden usar como fotos, con atribución. **Condición asumida por el usuario, registrada fuera del sistema:** la nutricionista (Lic. Daiana Ponce) confirma que su licencia de cada proveedor (Nutriarte, Nutrispace, Nutraweb y la autora de los recetarios) permite compartir ese material con sus pacientes. El sistema no guarda ni verifica esa confirmación. **El texto extraído y las imágenes no se versionan en el repo**: siguen como material local (`docs/recetarios/`, en `.gitignore`) y como datos en la base o el storage |
| D4 | Aceptada: macros calculados desde los ingredientes; la tabla del recetario solo para comparar (aviso si difiere > 10 %) | Sin cambios |
| D5 | Aceptada: carga asistida (script → borradores → revisión); IA solo si hace falta, sin datos de pacientes | Sin cambios |
| D6 | Aceptada: primera tanda de ~40 recetas (las que usa en sus planes), revisadas por Joel y validadas con ella; el resto como borradores. Cómo llegan a producción se define en la SDD de 018a | Sin cambios |
| D7 | Aceptada: objetivo = prescripción de la consulta que indicó el plan; si no hay, la más reciente; con "Objetivo: consulta del …" | El mismo objetivo para los 7 días |
| D8 | Aceptada: buscador en Sheet (pantalla completa en el celular) | Título "Agregar a Desayuno · Martes" y fila "Agregar en:" con los días |
| D9 | Aceptada: porciones en pasos de ½, sin gramos en el ítem de receta | Sin cambios |
| D10 | Aceptada: macros en vivo, con aviso "esta receta está en N planes" al editarla | Sin cambios |
| D11 | Aceptada: momento inferido del nombre de la comida | Sin cambios (el modo semanal no cambia esto) |
| D12 | Aceptada: tipos y etiquetas propuestos, fijos; ella los corrige al validar | Sin cambios |
| D13 | Aceptada: el buscador muestra solo recetas | Sin cambios |
| D14 | Aceptada: encaje = total **del día** después de agregar vs objetivo, ±5 %; sin ordenar por encaje | Con varios días marcados, se muestra el peor día. En comidas "Todos los días", contra el promedio semanal |
| D15 | Resuelta por dependencia: el PR #7 ya está en `develop` | Queda el punto de coordinación con Leo por el menú semanal y la HU-015 (ver Notas de implementación y N2) |
| D16 | Resuelta por dependencia: la HU-017a ya está en `develop` | Se construye directo con sus primitivos |
| D17 | Aceptada: recetas en plantillas | Las plantillas también son semanales; al aplicarlas se copian modo, días e ítems |
| D18 | Aceptada: fotos de hasta 5 MB al subir, JPG/PNG/WebP, guardadas reducidas; se pueden subir desde el celular | Sin cambios |
| D19 | Aceptada, ampliada por D3 = b: el paciente ve la receta completa (sin macros), propia o de terceros, con fuente | Ver portal en UX §4 |
| D20 | Aceptada: etiqueta "Apta vianda / freezer" + nota de conservación por receta; las guías educativas quedan fuera | Sin cambios |
| D21 | Aceptada: se decide al afinar las medidas caseras | Ahora es **018d** |
| D22 | Aceptada: agregar las épicas 57 y 58 al archivo de épicas, como cubiertas por la HU-018 (la 57, parcial: ya la cubría la HU-004) | Lo hace el orquestador |

---

## Dudas nuevas (por el menú semanal)

Solo dos; lo demás del menú semanal se resolvió con defaults (anotados en el Gherkin y la UX):
plan nuevo con Desayuno/Almuerzo/Merienda/Cena por día y Colaciones con opciones, semana fija de
7 días, el plan abre en el lunes y el portal en el día de hoy, copiar reemplaza con "Deshacer",
pasar a "Igual todos los días" pregunta qué día conservar, días sin cargar fuera del promedio,
micronutrientes sobre el promedio semanal y el asistente IA carga "Igual todos los días".

**N1. ¿Cómo suma al día una comida de opciones ("Elegí una", como las colaciones)?**
- (a) Suma el **promedio** de las opciones, y al lado se ve el rango ("70 a 180 kcal").
- (b) **No suma**: el total del día no la incluye y se muestra aparte ("+ colación: 70 a
  180 kcal"), porque en el plan real las colaciones son "opcionales, si tiene apetito".
- (c) Suma la opción con **más kcal** (el peor caso).
- **Recomendación: (a)**: el total del día queda cerca de lo que el paciente come en promedio y
  el rango deja ver los extremos. Si ella prefiere ver el día "sin colación", es (b).

**N2. ¿Quién implementa 018b (menú semanal)?** Reescribe el editor de planes y plantillas,
el portal y el PDF mínimo, que son zona de Leo, y condiciona su HU-015.
- (a) Joel (este orquestador), avisándole a Leo antes de arrancar. Leo revisa el PR y la HU-015
  se construye sobre el modelo nuevo.
- (b) Leo, como paso previo a su HU-015 (Joel sigue con 018a mientras tanto).
- (c) Repartido: Joel hace el modelo y el editor; Leo, el portal y el PDF dentro de la HU-015.
- **Recomendación: (a)**, como ya decía la nota del backlog ("la hacemos nosotros avisándole"):
  una sola persona cambia el modelo de punta a punta y el PR lo revisa justo quien más lo va a
  usar. Si Leo ya está metido en la HU-015, (b) evita que él trabaje sobre un modelo que cambia
  abajo suyo. (c) parte una migración entre dos personas y es la opción más riesgosa.

### Respuestas a las dudas nuevas (2026-10-03)

- **N1 = (a)**: una comida de opciones suma el **promedio** de sus opciones al total del día y muestra el rango
  al lado ("70 a 180 kcal").
- **N2 = (a)**: la 018b la hace Joel (senkuch4n), avisándole a Leo antes de arrancar. Leo revisa el PR y su
  HU-015 se construye sobre el modelo nuevo. Orden: **018b → 018a → 018c**; 018d después.

**HU validada por el usuario el 2026-10-03.**
