# HU-020 — Importar planes alimentarios desde PDF

**Como** nutricionista que ya tiene planes armados en PDF (hechos en Canva) y los reutiliza con
otras pacientes,
**quiero** que esos PDF se conviertan en plantillas del sistema sin cargar cada comida a mano,
y poder revisarlas antes de usarlas,
**para que** pueda empezar a armar planes en el programa con lo que ya tengo, sin perder horas
copiando.

Origen: pedido literal de la nutricionista (2026-10-25): *"¿Podría compartirte planes ya listos
pero en formato pdf para que se adapten al programa o no habría forma? Porque la carga de cada uno
me llevaría bastante tiempo y lo mismo con las recetas."* Issue #48. Rama
`feat/HU-020-importar-planes-pdf`. Responsable: senkuch4n.

> **Estado:** afinada, **pendiente de validación**. Las decisiones de fondo quedan como dudas
> D1–D16, cada una con una recomendación.

---

## 1. Contexto

### 1.1 Qué existe hoy

**Recetas: ya tienen carga asistida desde PDF (HU-018a-2).** Para recetas este pedido no suma
alcance nuevo.

- Scripts `packages/db/scripts/recipes/{extract,export,import,undo}.ts` (`npm run recipes:*`
  en `packages/db`) y el parser puro `packages/core/src/recipe-import/` (`extract.ts`,
  `ingredient-line.ts`, `food-suggest.ts`, `bundle.ts`). Sin IA y sin inventar gramos.
- `recipes:extract` lee los PDF de `docs/recetarios/` con poppler y crea **borradores**
  (`Recipe.status = DRAFT`, `origin = IMPORT`) con `importKey` (idempotencia), `importRawText`,
  `importHints` y `reviewedAt` (desde la primera revisión, la extracción no pisa el borrador).
  Guarda la corrida en un JSON y `recipes:undo` borra solo los borradores de esa corrida que
  siguen sin revisar.
- Revisión en el panel: `/recetas/revisar/[id]` (`review-screen.tsx`), con la página original al
  lado.
- **Quién revisa:** Joel, **en desarrollo** (SDD `Refactorizaciones/recetario.md`, D6 y 12-D8).
  Las publicadas pasan a producción con un bundle (`recipes:export` → `recipes:import:prod`),
  porque si Joel entrara al panel de producción con su cuenta de Google cambiaría el token de
  Google Calendar de la profesional.
- Lo que no hay para recetas: que **ella** suba un PDF desde el panel. Queda como D15, no como
  alcance.

**Planes: no hay importación.** Lo que hay:

- `NutritionPlan → PlanMeal → PlanMealItem` y `PlanTemplate → TemplateMeal → TemplateMealItem`
  (`packages/db/prisma/schema.prisma`, ~l. 623–776). Las dos tienen la misma forma:
  - Comida: `name` libre, `order`, `mode` (`EVERY_DAY` "Igual todos los días" / `PER_DAY`
    "Cambia cada día", HU-018b) e `isOptions` ("Opciones, elige una", solo con `EVERY_DAY`).
  - Ítem: alimento (`foodId` + `quantityGrams`, o medida casera `measureQty/measureName/…`,
    HU-018d), receta (`recipeId` + `portions` de ½ en ½ entre 0,5 y 4, HU-018c) o **texto libre**
    (`customLabel`, sin macros). Más `notes` y `weekday` (`MON…SUN`, en comidas `PER_DAY`).
  - **La semana es una sola y fija** (enum `Weekday`, lunes a domingo). No hay "semana 2".
- `PlanTemplate` tiene solo `title` y `notes` (máx. 2.000 caracteres, validado en
  `plantillas/actions.ts`). **No tiene estado borrador**: toda plantilla aparece al aplicar.
  `NutritionPlan` sí tiene `status` (`DRAFT/ACTIVE/ARCHIVED`), pero es de la paciente.
- `applyTemplateToPatient` (`packages/db/domain/planTemplates.ts`) crea un plan `DRAFT` copiando
  `title`, `notes`, comidas e ítems (incluidas recetas y medidas caseras).
- **Texto libre del plan:** el único lugar es `notes` (plan y plantilla). El portal
  (`(portal)/portal/plan/plan-view.tsx`) lo muestra debajo del título y el PDF
  (`apps/web/src/lib/plan-pdf.tsx`) lo imprime como "Notas". No hay secciones de
  recomendaciones, porciones diarias ni reemplazos. La HU-015 (de imleticio, PDF/Word del plan
  con la plantilla de la nutricionista y **textos editables**) es la que iba a sumar textos al
  PDF: no tiene `backlog/` ni issue todavía (ver D9 y 1.4).
- IA en el sistema: el asistente del plan del panel usa DeepSeek (`apps/web/src/lib/deepseek.ts`);
  el bot, Anthropic o DeepSeek (`apps/bot/src/ai/`). La carga de recetas se hizo **sin IA**.
- El panel se publica en **Vercel** (commits "Deploy en Vercel"): no hay poppler (`pdftotext`)
  en ese entorno, cosa que pesa en D3.

### 1.2 Lo que trae el PDF de ejemplo

`docs/planes-alimentacion/` (en `.gitignore`) tiene **un** plan de ejemplo: exportado de Canva,
15 páginas, con capa de texto (`pdftotext -layout` lo lee entero, ~13.000 caracteres). **Es el
plan de una paciente real**: en la portada están su nombre y la fecha, y el nombre también está
en el nombre del archivo. Acá solo se describe la estructura.

| Pág. | Sección | Cómo viene | ¿Entra en el modelo actual? |
|---|---|---|---|
| 1 | **Portada** | "Plan nutricional", nombre y fecha de la paciente, objetivo en una frase ("Para mejorar el metabolismo y la composición corporal") | El objetivo sirve como título. Nombre y fecha **no se guardan** (D12) |
| 1 | **Recomendaciones** | ~8 párrafos (~2.300 caracteres): cantidad de comidas, proteínas, hidratos, verduras, grasas, ambiente, actividad física, hidratación | No: `notes` tiene tope de 2.000 (D9) |
| 2–3 | **Alimentos de consumo diario** | ~12 grupos, cada uno con **porción diaria en medida casera** ("1 vaso", "2 unidades", "1 porción diaria 300 gr (200 gr tamaño de mano…)", "1 y 1/2 tazas (cocidas)", "3 cdas cocido o crudo / 1 papa mediana", "2 cdas diarias", "8 vasos o 2 lts al día", "C/N") y la lista de alimentos sugeridos y cómo prepararlos. Diagramado en **dos columnas** | No hay dónde (D9) |
| 4 | **Consumo ocasional** | 7 grupos con listas, sin cantidades | No hay dónde (D9) |
| 5–8 | **Desayuno y merienda** | Una regla de armado ("Infusión + pan integral + proteína + fruta") y **dos tandas de lunes a domingo**, sin rótulo que las distinga. Cada día: una línea "Té + tostada integral + queso untable descremado + banana no madura" y una línea de macros cualitativa ("Hidratos de carbono (fibra), proteínas y grasas saludables"). Algunas con "opcional: …" | Comida `PER_DAY`, pero solo para **una** tanda (D6) |
| 9–12 | **Almuerzo y cena** | La regla del plato (almuerzo: ½ verduras, ¼ proteínas, ¼ cereales + 1 cda de aceite; cena: ½ verduras, ½ proteína) y **dos tandas de lunes a domingo**. Cada día "Almuerzo: … / Cena: …" o "Almuerzo y Cena: …", con preparaciones por nombre ("Tarta de jamón y queso", "Guiso de lentejas", "Canastitas de pollo y verduras") y paréntesis con "+" adentro ("ensalada ( repollo + zanahoria + brócoli)"). Misma línea de macros | Dos comidas `PER_DAY`, una tanda (D6). La regla del plato no tiene lugar (D9) |
| 13 | **Colaciones opcionales** | 9 opciones, algunas con porción casera; varias son **recetas de los recetarios**: "Budín de banana (1 porción)", "Pizza dulce (2 unidades)", "Pepas saludables (3 unidades)" | Comida `EVERY_DAY` + `isOptions`. Recetas: D8 |
| 14–15 | **Reemplazos** | Equivalencias en medida casera y gramos de proteína ("1 huevo = 2 cdas (30 gr) de legumbres cocidas", "si no incluyo 2 cdas de aceite, 5 cdas de semillas o 100 g de palta") | No hay dónde (D9) |
| todas | Pie | Nombre y matrícula de la profesional | Ya están en `Professional` (HU de matrícula y firma): se descarta |

**Conclusión que manda en esta HU: el plan en PDF es cualitativo y el modelo es cuantitativo.**
Casi no hay gramos por alimento: cada comida es una combinación escrita en lenguaje natural, y las
cantidades viven en otra sección ("Alimentos de consumo diario"), como porción **diaria por grupo**,
no por comida. El modelo, en cambio, es una lista de ítems con alimento + gramos (o receta +
porciones) que suma macros. Si cada combinación se carga como texto libre, la plantilla queda
fiel al PDF pero **sin macros** (la franja del día va a dar 0). Si se parte en alimentos, haría
falta inventar gramos, cosa que esta HU no hace. Además, un tercio del PDF (recomendaciones,
consumo diario, ocasional, reemplazos) es texto que hoy **no tiene lugar** en el modelo.

### 1.3 Qué es lo nuevo

1. Un **importador** que lee un plan PDF con este formato y arma una **plantilla en borrador**
   (D1, D2): comidas por día como texto libre, colaciones como lista de opciones, recetas
   vinculadas solo cuando no hay duda, y las secciones de texto en un lugar nuevo (D9).
2. **Estado borrador para plantillas** (no existe hoy): un borrador no se ofrece al aplicar
   plantilla a una paciente hasta que ella lo publica.
3. **Revisión** del borrador en el panel, con lo que el importador no supo ubicar a la vista.
4. **Secciones de texto** de la plantilla (y del plan al aplicarla), si se aprueba D9.
5. Idempotencia y deshacer, como en recetas; ningún dato de la paciente del PDF en la base.

### 1.4 Cruces con otras HU

| HU | De quién | Qué comparte |
|---|---|---|
| **HU-017e** (rediseño Apple 5/5: planes, alimentos y plantillas + PDF del plan), `no_afinada` | imleticio | **Las mismas pantallas:** `/plantillas` (lista: chip "Borrador", acción "Importar"), `/plantillas/[id]` (aviso de borrador, "Publicar", secciones de texto), `meals-editor.tsx` (ítems de texto largo), `plan-view.tsx` del portal y `plan-pdf.tsx` (secciones). Si 017e se hace antes, esta HU se monta sobre su diseño; si se hace después, 017e rediseña también lo que agregue esta. Avisarle a Leo antes de arquitectura |
| **HU-015** (PDF/Word del plan con la plantilla de la nutricionista y textos editables) | imleticio | Los "textos editables" del PDF son, casi seguro, las mismas recomendaciones, porciones diarias y reemplazos. Si cada HU inventa su lugar, quedan dos. Ver D9 |
| HU-018a/c (recetas) | senkuch4n | Vincular colaciones con recetas publicadas (D8). Reuso de `foodSearchText`, del patrón de corridas y del deshacer |
| HU-018b (menú semanal) | senkuch4n | `PER_DAY`, `isOptions`, una sola semana (D6) |

---

## 2. Criterios de aceptación

> Escritos con las recomendaciones de las dudas. Si una duda se resuelve distinto, se ajustan.

```gherkin
Feature: Importar un plan alimentario en PDF como plantilla en borrador

  Background:
    Given un plan en PDF con el formato del plan de ejemplo (Canva, con capa de texto)
    And recetas publicadas en el recetario, entre ellas "Budín de banana" con porción "1 porción"

  Scenario: El PDF se convierte en una plantilla borrador
    When se importa el PDF
    Then existe una plantilla nueva en estado "Borrador"
    And su título sale del objetivo de la portada ("Para mejorar el metabolismo y la composición corporal")
    And no aparece en "Aplicar plantilla" de ninguna paciente
    And en /plantillas se ve con el chip "Borrador" y el texto "Importada de PDF"

  Scenario: Menús por día de la semana
    When se importa el PDF
    Then la plantilla tiene una comida "Desayuno y merienda" con modo "Cambia cada día"
    And el lunes tiene un ítem de texto "Té + tostada integral + queso untable descremado + banana no madura"
    And el ítem no tiene alimento, ni gramos, ni medida casera
    And la línea de macros cualitativa del día queda como nota del ítem

  Scenario: "Almuerzo: … / Cena: …" y "Almuerzo y Cena: …"
    When se importa un día con "Almuerzo: Bife de pollo + arroz + zucchini asado + tomate" y "Cena: Bife de pollo + zucchini asado + tomate"
    Then la comida "Almuerzo" de ese día tiene el primer texto y la comida "Cena" el segundo
    When se importa un día con "Almuerzo y Cena: Tarta de jamón y queso + verduras asadas (zucchini + tomate + pimiento)"
    Then el mismo texto queda en "Almuerzo" y en "Cena" de ese día

  Scenario: Dos tandas de lunes a domingo en la misma sección
    Given la sección "Desayuno y merienda" trae dos tandas de lunes a domingo sin rótulo
    When se importa el PDF
    Then la plantilla tiene "Desayuno y merienda (1)" y "Desayuno y merienda (2)", cada una con sus 7 días
    And la revisión avisa "Este PDF trae dos tandas de días: revisá los nombres de las comidas"

  Scenario: Colaciones como lista de opciones
    When se importa la sección "Colaciones opcionales"
    Then la plantilla tiene una comida "Colaciones" con modo "Igual todos los días" y "Opciones (elige una)"
    And tiene un ítem por opción, en el orden del PDF

  Scenario: Una opción que es una receta publicada, sin dudas
    When se importa "Budín de banana (1 porción)"
    Then el ítem es la receta "Budín de banana" con 1 porción
    And suma los macros de la receta

  Scenario: Una opción que se parece a una receta pero la cantidad no es en porciones
    When se importa "Pizza dulce (2 unidades)" y existe la receta publicada "Pizza dulce" con porción "1 unidad"
    Then el ítem queda como texto "Pizza dulce (2 unidades)"
    And la revisión propone "¿Es la receta Pizza dulce?" sin vincularla sola

  Scenario: Nunca se inventan gramos
    When se importa cualquier PDF
    Then ningún ítem creado tiene gramos ni medida casera que no estén escritos en el PDF
    And ningún ítem de texto se vincula a un alimento de la base

  Scenario: Las secciones de texto no se pierden
    When se importa el PDF
    Then la plantilla tiene las secciones "Recomendaciones", "Alimentos de consumo diario", "Alimentos de consumo ocasional", "Cómo armar el plato" y "Reemplazos", con el texto del PDF
    And al aplicar la plantilla a una paciente el plan nuevo tiene una copia de esas secciones
    And el portal y el PDF del plan las muestran

  Scenario: Lo que el importador no entiende queda a la vista
    Given una línea del PDF que no encaja en ninguna sección conocida
    When se importa el PDF
    Then la línea aparece en "Texto sin ubicar" de la revisión, con la página de origen
    And la plantilla no se puede publicar mientras "Texto sin ubicar" tenga contenido

  Scenario: Los datos de la paciente del PDF no se guardan
    When se importa el PDF
    Then ni el nombre, ni la fecha de la portada, ni el nombre del archivo quedan en la base
    And si el nombre de la portada aparece en otra parte del texto, se reemplaza por "[paciente]" y la revisión lo avisa
    And la consola del importador muestra solo contadores, nunca texto del plan

  Scenario: Revisar y publicar
    Given una plantilla borrador importada
    When la profesional corrige lo que haga falta y toca "Publicar plantilla"
    Then la plantilla pasa a "Publicada" y aparece en "Aplicar plantilla"

  Scenario: Importar dos veces el mismo PDF no duplica
    Given el PDF ya se importó
    When se vuelve a importar el mismo archivo
    Then no se crea otra plantilla
    And el aviso dice "Este PDF ya se importó: <título de la plantilla>"
    And si el borrador ya se había revisado, no se pisa

  Scenario: Deshacer una importación
    Given una corrida de importación que creó plantillas borrador
    When se deshace esa corrida
    Then se borran solo las plantillas de esa corrida que siguen en borrador y sin revisar
    And ninguna plantilla publicada ni revisada se toca

  Scenario: PDF que no tiene el formato esperado
    Given un PDF sin capa de texto (escaneado) o sin secciones reconocibles
    When se intenta importar
    Then no se crea ninguna plantilla
    And el aviso dice "No pude leer el plan de este PDF. Cargalo a mano o pasáselo a Joel."

  Scenario: Las plantillas existentes no cambian
    Given plantillas cargadas antes de esta HU
    When se aplica la migración
    Then quedan "Publicadas" y se siguen ofreciendo al aplicar plantilla, sin cambios
```

---

## 3. Datos que se registran

| Dato | Obligatorio | Uso |
|---|---|---|
| `PlanTemplate.status` (`DRAFT` / `PUBLISHED`) | Sí, default `PUBLISHED` para las existentes | Un borrador no se ofrece al aplicar plantilla |
| `PlanTemplate.origin` (`MANUAL` / `IMPORT`) | Sí, default `MANUAL` | Chip "Importada de PDF"; filtro del deshacer |
| `PlanTemplate.importKey` | Solo importadas, único | Hash del **contenido** del PDF (no del nombre del archivo, que trae el nombre de la paciente). Idempotencia |
| `PlanTemplate.reviewedAt` | No | Primera vez que se guardó desde la revisión: desde ahí una reimportación no pisa |
| `PlanTemplate.importHints` (JSON) | No | Avisos del parser para la revisión: dos tandas, recetas propuestas, nombre reemplazado, texto sin ubicar (con página). Se vacía al publicar |
| Secciones de texto de la plantilla (título, texto, orden) | No | Recomendaciones, consumo diario y ocasional, regla del plato, reemplazos. Se copian al plan al aplicar (D9) |
| Secciones de texto del plan | No | Copia de las de la plantilla; las ve el portal y el PDF (D9) |
| Ítems de comida | — | Los que ya existen: `customLabel` (texto, máx. a definir por el architect: hay líneas de ~130 caracteres), `notes` (línea de macros cualitativa), `weekday`, `recipeId` + `portions` |

**No se guarda:** el PDF, su texto crudo, el nombre del archivo, ni el nombre o la fecha de la
portada (D12). A diferencia de recetas (`importRawText`), acá el crudo tiene datos de una
paciente.

---

## 4. Diseño UX

Todo vive en `/plantillas` y `/plantillas/[id]`, **zona de imleticio** (ver 1.4).

### 4.1 Cómo llega el PDF (según D3)

- **Recomendado para esta HU (script, D3-a):** ella le pasa los PDF a Joel; Joel corre el
  importador; las plantillas aparecen en el panel de **producción** como borradores, para que las
  revise **ella** (D4). En el panel no hay botón de subida.
- **Si se elige subida desde el panel (D3-b):** botón secundario "Importar desde PDF" en
  `/plantillas`, al lado de "Nueva plantilla". Abre un `Sheet` con un selector de archivo (solo
  PDF, hasta 10 MB), el texto "Se arma una plantilla en borrador para que la revises. No se
  guarda el PDF." y un botón "Importar". Mientras procesa: "Leyendo el plan…". Errores:
  "Este archivo no es un PDF", "No pude leer el plan de este PDF. Cargalo a mano o pasáselo a
  Joel.", "Este PDF ya se importó: <título>" con un enlace a esa plantilla.

### 4.2 Lista de plantillas

- Las borradores arriba, con chip "Borrador" (tono de aviso) y, debajo del título,
  "Importada de PDF · sin revisar" o "· revisada".
- El diálogo "Aplicar plantilla" de la ficha de la paciente **no** las lista.

### 4.3 Revisión: la misma pantalla de la plantilla

No se hace una pantalla de revisión aparte (como `/recetas/revisar`): un borrador importado se
revisa en `/plantillas/[id]`, con el editor de comidas de siempre, más:

- **Banner de borrador** arriba: "Borrador importado de PDF. Revisalo y publicalo para poder
  aplicarlo a tus pacientes." + botón primario "Publicar plantilla". Deshabilitado mientras haya
  texto sin ubicar, con el motivo debajo: "Quedan 3 líneas sin ubicar".
- **Avisos del importador** (lista plegable debajo del banner), uno por renglón, cada uno con
  "Listo" para descartarlo:
  - "Este PDF trae dos tandas de días en Desayuno y merienda: revisá los nombres de las comidas."
  - "¿'Pizza dulce (2 unidades)' es la receta Pizza dulce?" → "Vincular" (abre el selector de
    porciones de la receta) / "Dejar como texto".
  - "Reemplacé el nombre de la paciente por [paciente] en 1 lugar." (D12)
- **Texto sin ubicar**: tarjeta con las líneas y su página ("pág. 7"). Cada línea: "Mover a…"
  (comida y día, o sección de texto) o "Descartar".
- **Macros:** como los ítems son texto, la franja del día da 0. En una plantilla sin ningún ítem
  con alimento o receta, la franja dice "Plantilla sin cantidades: los macros aparecen cuando
  agregás alimentos o recetas" en vez de ceros (D10).
- Ítems de texto largos: en el editor se ven en dos renglones como máximo, completos al tocar.

### 4.4 Secciones de texto (si D9 = nuevo lugar)

- En la plantilla (y en el plan de la paciente), debajo de las comidas, bloque "Textos del plan"
  con una tarjeta por sección: título editable, texto editable (multilínea), reordenar, borrar,
  "Agregar sección".
- Portal: debajo del menú, cada sección como un bloque plegable con su título.
- PDF del plan: cada sección con su título, después de las comidas. El diseño fino es de HU-015 /
  HU-017e.

### 4.5 Bot de WhatsApp

No interviene.

---

## 5. Fuera de alcance

- **Recetas:** ya están (HU-018a-2). Nada nuevo, salvo lo que se decida en D15.
- **Convertir el plan cualitativo en cuantitativo:** partir las combinaciones en alimentos con
  gramos, calcular macros de un PDF o "completar" cantidades desde la tabla de consumo diario.
- Importar a un **plan de una paciente** directo (recomendación D1: solo plantillas).
- Más de una semana en el modelo (`Weekday` sigue siendo lunes a domingo; ver D6).
- PDF escaneados (sin capa de texto) y OCR. Formatos distintos del de ejemplo, Word, imágenes
  (D14).
- Reconstruir el diseño de Canva (colores, fotos, tipografías) en el portal o en el PDF.
- Importar en lote desde el panel, o desde WhatsApp.
- Rediseño visual de `/plantillas` (es de HU-017e).

---

## 6. Notas de implementación (mínimas; el detalle es del architect)

- **Parser puro en `packages/core`** (p. ej. `plan-import/`), con tests contra un fixture
  **anonimizado** (escrito a mano con la estructura del ejemplo, sin el nombre de la paciente),
  como `recipe-import/__fixtures__`. Reconoce encabezados de sección (el PDF los trae con letras
  espaciadas: "D E S AY U N O Y M E R I E N DA"), nombres de día, "Almuerzo:", "Cena:",
  "Almuerzo y Cena:", la línea de macros cualitativa y el pie con la matrícula.
- La sección "Alimentos de consumo diario" viene en **dos columnas**: con `-layout` las columnas
  se mezclan por renglón. Probablemente haga falta `-bbox` (como `recipes:extract`) para separar
  columnas.
- Vincular recetas: comparar con `foodSearchText` (sin tildes ni mayúsculas) contra recetas
  `PUBLISHED`; vincular solo si el nombre coincide **exacto** y la cantidad es "N porción(es)"
  con N en los pasos válidos (0,5–4) o no hay cantidad (→ 1 porción). Todo lo demás, aviso.
- `importKey` = hash del contenido del PDF. El patrón de corrida + deshacer se copia de
  `recipes:extract --write` / `recipes:undo` (`deleteUnreviewedDrafts`).
- Si es script contra producción (D3-a): mismo cuidado que `recipes:import:prod` (seco por
  defecto, `--write` pide `SI`, `pg_dump` antes, `DATABASE_URL` por entorno).
- Toca `schema.prisma` (estado de plantilla, campos de importación y, si D9, secciones):
  **label `migración`**. Las plantillas existentes quedan `PUBLISHED` / `MANUAL` por default.
- `applyTemplateToPatient` copia las secciones nuevas y filtra (o rechaza) plantillas `DRAFT`.
- Zona de imleticio (`plantillas/**`, `meals-editor.tsx`, `plan-view.tsx`, `plan-pdf.tsx`): avisar
  a Leo antes de la SDD.

---

## 7. Dudas para validar con el usuario

**D1. ¿Cada PDF se convierte en plantilla o en plan de una paciente?**
Recomendación: **plantilla**. Son planes de pacientes que ella reutiliza con otras; una plantilla
se aplica a cualquier paciente (y ahí se adapta) y no exige elegir paciente al importar. Además,
el PDF trae datos de una paciente que no queremos atar a nadie. Alternativa: plan de una paciente
elegida al importar (útil si quiere "pasar al sistema" el plan vigente de una paciente puntual;
se puede sumar después aplicando la plantilla).

**D2. ¿Hace falta el estado "Borrador" en las plantillas?**
Hoy no existe: toda plantilla se ofrece al aplicar. Recomendación: **sí**, `DRAFT/PUBLISHED` con
las existentes en `PUBLISHED`. Sin eso, una plantilla a medio revisar se puede aplicar por error.
Alternativa más barata: sin estado, el título empieza con "[Revisar]" y ella lo borra al terminar
(no impide aplicarla).

**D3. ¿Cómo llega el PDF al sistema?**
- (a) **Script de Joel**, como en recetas: ella le pasa los PDF, Joel corre el importador y las
  plantillas aparecen como borradores en producción.
- (b) **Subida desde el panel**: ella sube el PDF y en segundos tiene el borrador.

Recomendación: **(a) en esta HU**, con el parser en `packages/core` para que (b) sea una HU chica
después. Motivos: hay un solo PDF de ejemplo y no sabemos si sus otros planes tienen el mismo
formato (D14); el panel corre en Vercel, donde no hay `pdftotext` (habría que leer el PDF con
una librería JS y probarla con sus archivos); y un error del parser en manos de Joel se corrige
antes de que ella lo vea. Si ella va a importar seguido (no solo una tanda inicial), conviene (b)
desde el principio.

**D4. ¿Quién revisa: ella o Joel?**
En recetas revisa Joel en desarrollo y pasa a producción con un bundle. Acá recomiendo que
**revise ella, en producción**: es su contenido clínico, ella sabe si "(1)" y "(2)" son semanas o
desayuno vs. merienda (D6), y la revisión es en la pantalla de plantilla que ya usa. El script
escribe directo los borradores en producción (por túnel, como `recipes:import:prod`). Alternativa:
como en recetas (Joel revisa en desarrollo, bundle a producción); más trabajo para Joel y él no
sabe resolver las dudas clínicas.

**D5. ¿Cómo se carga cada combinación del menú por día?**
- (a) **Una línea por comida y día**: un ítem de texto con la combinación entera ("Té + tostada
  integral + queso untable descremado + banana no madura").
- (b) **Partida por "+"**: un ítem de texto por componente ("Té", "tostada integral", …).

Recomendación: **(a)**. Respeta cómo lo escribe ella y cómo lo lee la paciente; partir por "+"
rompe los paréntesis ("ensalada ( repollo + zanahoria + brócoli)") y los "opcional: …", y no
suma nada porque sin gramos no hay macros en ninguno de los dos casos. (b) solo ayudaría si
después quiere reemplazar componentes por alimentos con gramos uno por uno; eso lo puede hacer a
mano en el editor.

**D6. ¿Qué son las dos tandas de lunes a domingo de cada sección?**
El PDF de ejemplo tiene dos tandas en "Desayuno y merienda" y dos en "Almuerzo y cena", sin
rótulo. Puede ser semana 1 / semana 2 (rotar), desayuno / merienda, o "opción A / opción B" del
día. El modelo tiene una sola semana. **Esto se lo tiene que contestar ella.** Recomendación
mientras tanto: el importador crea comidas separadas ("Desayuno y merienda (1)" y "(2)",
"Almuerzo (1)", "Cena (1)", "Almuerzo (2)"…) y avisa en la revisión, para que ella las renombre
("Desayuno" / "Merienda", o "Semana 1" / "Semana 2"). Alternativas: dos plantillas, una por
tanda; o sumar semanas al modelo (cambio grande que toca todo lo de HU-018b: editor, portal,
PDF, totales; sería su propia HU).

**D7. ¿"Desayuno y merienda" es una comida o dos?**
En el PDF es una sola sección para las dos. Recomendación: **una comida "Desayuno y merienda"**,
como lo escribe ella (ojo con D6: si las tandas son desayuno y merienda, se resuelve
renombrando). Alternativa: duplicar el contenido en "Desayuno" y "Merienda".

**D8. ¿Cómo se vinculan las colaciones (y otras preparaciones) con recetas del recetario?**
Recomendación: vincular **solo** las opciones de colación cuyo nombre coincide exacto con una
receta publicada y cuya cantidad es "N porción(es)" (o no tiene); el resto queda como texto con
un aviso "¿Es la receta X?" que ella confirma eligiendo las porciones. Nunca se convierten
"unidades" a porciones solas. Las preparaciones dentro de una combinación del menú ("Mate cebado +
budín de banana") **no** se vinculan: quedan en el texto. Alternativa: no vincular nada al
importar y que ella lo haga en la revisión.

**D9. ¿Dónde van las recomendaciones, el consumo diario y ocasional, la regla del plato y los
reemplazos?**
Son ~6 páginas de las 15 y hoy no tienen lugar: `notes` tiene tope de 2.000 caracteres y solo las
recomendaciones ya ocupan ~2.300.
- (a) **Secciones de texto** nuevas en plantilla y plan (título + texto + orden), copiadas al
  aplicar, visibles en portal y PDF.
- (b) Todo a `notes`, subiendo el tope (un único bloque largo, sin títulos en el portal ni en el
  PDF).
- (c) Estructurar "Alimentos de consumo diario" como tabla (grupo · porción diaria · alimentos)
  y los reemplazos como equivalencias; el resto, secciones de texto.

Recomendación: **(a)**, y (c) más adelante si ella lo pide. **Antes de cerrarla hay que hablar con
Leo:** los "textos editables" de su HU-015 probablemente sean esto mismo, y conviene un solo
lugar. Si la HU-015 ya definió dónde viven, esta HU usa eso.

**D10. ¿Qué se muestra en los macros de una plantilla sin cantidades?**
Recomendación: en vez de ceros, el texto "Plantilla sin cantidades: los macros aparecen cuando
agregás alimentos o recetas". Alternativa: dejar la franja como está (da 0, puede confundir).

**D11. ¿Qué pasa con la línea de macros cualitativa de cada día ("Hidratos de carbono (fibra),
proteínas y grasas saludables")?**
Recomendación: queda como **nota del ítem** (se ve en portal y PDF, como la escribió ella).
Alternativa: descartarla (es casi igual en todos los días y agrega ruido).

**D12. Datos de la paciente que trae el PDF.**
Recomendación: el importador descarta el nombre y la fecha de la portada, usa un hash del
contenido como clave (no el nombre del archivo), no guarda el PDF ni el texto crudo, reemplaza
el nombre por "[paciente]" si aparece en otra parte y lo avisa, y por consola solo muestra
contadores. Los PDF quedan donde están hoy (`docs/planes-alimentacion/`, fuera de git) y Joel los
borra de su máquina después de importarlos. Pregunta abierta: ¿hay otros datos personales en
otros planes (peso, diagnóstico, edad) que haya que buscar y sacar? Con un solo ejemplo no se
sabe (D14).

**D13. ¿Con IA o sin IA?**
Las recetas se hicieron sin IA. Para este formato recomiendo **sin IA**: la estructura es muy
regular (encabezados de sección, días, "Almuerzo:", "Cena:", "+"), el resultado es predecible y
testeable, y no sale texto con datos de una paciente hacia un tercero (DeepSeek/Anthropic). La IA
sí ayudaría si sus otros planes tienen formatos distintos (D14); en ese caso sería una HU
aparte, con el nombre de la paciente quitado **antes** de mandar el texto y sin que la IA invente
cantidades.

**D14. ¿Cuántos planes son y tienen todos este formato?**
Hay un solo PDF de ejemplo. Antes de la SDD conviene que ella pase 3 a 5 más (de épocas
distintas): si el formato cambia (otras secciones, otro diseño de Canva, Word, escaneos), cambia
el parser y quizá D3 y D13. La cantidad también define D3: para una tanda inicial de 10–20 alcanza
el script; si va a importar todas las semanas, conviene la subida desde el panel.

**D15. ¿Hace falta que ella pueda subir recetarios PDF desde el panel?**
Ella dijo "lo mismo con las recetas". Las recetas ya tienen carga asistida, pero la corre Joel.
Recomendación: **no en esta HU**; preguntarle si tiene recetarios nuevos que no estén en
`docs/recetarios/` y, si son pocos, que se los pase a Joel. Si van a ser frecuentes, una HU
aparte para la subida desde el panel (recetas y planes juntos, reusando D3-b).

**D16. ¿Cómo se deshace una importación?**
Recomendación: (1) un borrador importado se puede borrar desde la plantilla con el botón
"Eliminar" que ya existe; (2) el script guarda la corrida y un `undo` borra solo las plantillas
de esa corrida que siguen en borrador **sin revisar** (como `recipes:undo`). Una plantilla
publicada no se deshace sola: se borra a mano. Alternativa: solo (1).

---

## Resoluciones (validadas por el usuario, 2026-10-25)

- **D1–D5, D8, D10, D11, D13, D16:** como la recomendación. Plantilla (no plan de paciente), estado
  `DRAFT/PUBLISHED` en plantillas, script de Joel contra producción, revisa ella en producción, una
  línea de texto por comida y día, recetas vinculadas solo por nombre exacto, aviso en vez de macros
  en cero, la línea de macros cualitativa como nota del ítem, sin IA, deshacer como en recetas.
- **D7: desayuno y merienda son dos comidas distintas.** El importador nunca crea una comida
  "Desayuno y merienda": la sección combinada se reparte en comidas "Desayuno" y "Merienda".
- **D6 (provisoria, hasta que responda la nutricionista):** cada tanda de lunes a domingo se carga
  como comidas numeradas: "Desayuno (1)", "Merienda (1)", "Desayuno (2)", "Merienda (2)",
  "Almuerzo (1)", "Cena (1)", "Almuerzo (2)", "Cena (2)". La revisión muestra un aviso para que ella
  renombre o borre. Combinado con D7: en la sección "Desayuno y merienda" el contenido de cada día
  va **igual** en Desayuno y en Merienda de esa tanda (el PDF no los distingue), y el aviso lo dice.
  Cuando ella confirme qué son las tandas, se ajusta el mapeo del parser (sin migración).
- **D9: (a) secciones de texto** nuevas en plantilla y plan (título + texto + orden), copiadas al
  aplicar, visibles en portal y PDF. Se avisa a Leo en el issue #48 para que la HU-015 use las
  mismas secciones.
- **D12, D14, D15: pendientes** (la nutricionista va a pasar más PDF). Mientras tanto se prepara el
  sistema con el ejemplo: el parser se diseña por secciones reconocidas y deja **avisos** (no
  falla) ante secciones o formatos desconocidos, y el descarte de datos personales se hace en un
  solo lugar, para ajustarlo cuando lleguen los planes nuevos sin rehacer la HU.
