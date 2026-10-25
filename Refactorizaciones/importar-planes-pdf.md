# SDD: HU-020 `importar-planes-pdf` (Importar planes alimentarios desde PDF como plantillas)

- **HU validada:** `docs/hu-importar-planes-pdf.md`. **Manda la sección final "Resoluciones
  (2026-10-25)"** sobre el cuerpo de la HU:
  - D1–D5, D8, D10, D11, D13, D16 = la recomendación (plantilla, `DRAFT/PUBLISHED`, script de Joel
    contra producción, revisa ella en producción, una línea de texto por comida y día, receta solo por
    nombre exacto, aviso en vez de macros en cero, línea de macros como nota del ítem, sin IA, deshacer
    como en recetas).
  - **D7:** nunca se crea una comida "Desayuno y merienda": la sección se reparte en **Desayuno** y
    **Merienda** (mismo contenido en las dos, con aviso).
  - **D6 (provisoria):** cada tanda de lunes a domingo → comidas numeradas `Desayuno (1)`,
    `Merienda (1)`, `Desayuno (2)`, `Merienda (2)`, `Almuerzo (1)`, `Cena (1)`, `Almuerzo (2)`,
    `Cena (2)`. El mapeo vive **en un solo archivo** (`meal-mapping.ts`) y se cambia sin migración.
  - **D9 = (a):** secciones de texto nuevas en plantilla **y** plan, copiadas al aplicar, visibles en
    portal y PDF.
  - **D12, D14, D15 pendientes:** el parser trabaja por secciones reconocidas, deja **avisos** (no
    falla) ante lo desconocido, y el descarte de datos personales vive en **un solo archivo**
    (`personal-data.ts`).
  - Los escenarios Gherkin que dicen "Desayuno y merienda (1)/(2)" o una comida "Desayuno y merienda"
    quedan **reemplazados** por D6/D7 (ver 3, T3).
- **Rama:** `feat/HU-020-importar-planes-pdf` (sale de `develop`). PR a `develop`.
- **Skills aplicados:** `skills/migracion-prisma.md` (migración aditiva, sección 4) y `skills/ui.txt`
  (pantallas: vista, estructura base, componentes clave → sección 7).
- **Toca `schema.prisma`:** sí (issue #48 ya tiene la label `migración`). Una sola HU con migración en
  `implementando` a la vez en el equipo; traer `develop` antes de crear la migración.

> **Verificación del architect (2026-10-25, solo lectura).**
> - Base de desarrollo (`docker compose exec db psql -U nutri -d nutribot`): `PlanTemplate` tiene
>   **0 filas**, `NutritionPlan` 11. Última migración aplicada `20261024220056_patient_archived_at`,
>   que es también la última carpeta de `packages/db/prisma/migrations/`. Sin drift a la vista.
>   Producción (Neon) puede tener plantillas: por eso el default `PUBLISHED` en el mismo SQL.
> - `TemplateMealItem.customLabel` es `text` sin tope en la base; el formulario manual
>   (`food-measures/add-food-form.tsx`) tampoco pone `maxLength`.
> - El PDF de ejemplo (`docs/planes-alimentacion/`, en `.gitignore`) se miró con `pdftotext` **solo
>   para la estructura** (no se copió nada al repo; el archivo temporal se borró):
>   - Encabezados de sección a veces con letras espaciadas y agrupadas de forma irregular
>     ("D E S AY U N O Y M E R I E N DA", "R E C O M E N DAC I O N E S") y a veces normales
>     ("ALIMENTOS DE CONSUMO OCASIONAL", "ALMUERZO Y CENA", "COLACIONES OPCIONALES",
>     "REEMPLAZO (Alimentos ricos en proteínas)"). En `-bbox` cada letra es una "palabra" con huecos
>     de ~0,1 × la altura: el encabezado entero queda en **un tramo** de `buildLines`.
>   - El encabezado se repite en cada página de la sección; en la misma línea, separado por un hueco
>     grande, va el pie "Lic. … M.P …" de la profesional.
>   - La portada trae en **un tramo** "Nombre, Apellido dd/mm/aa" a la derecha de "PLAN NUTRICIONAL";
>     debajo, el objetivo ("Para mejorar …").
>   - Días en mayúsculas en su propia línea (`LUNES` … `DOMINGO`, con y sin tilde). Desayuno: combinación
>     en 1–2 renglones + línea de macros en 1–2 renglones. Almuerzo y cena: `Almuerzo:` / `Cena:` /
>     `Almuerzo y Cena:` (a veces sin espacio después de `:` o con espacio antes) + macros.
>   - Antes del primer día de cada sección de menú está la regla de armado ("Plato de Almuerzo : ½
>     verduras…", "Infusiones (1 taza) … + Pan integral …").
>   - Colaciones: rótulo decorativo "OPCIONES / DE COLACIONES" y una opción por renglón.
>   - "Alimentos de consumo diario" y "Reemplazos": dos columnas (subtítulos a la izquierda y a la
>     derecha en la misma línea).
> - Consumidores de plantillas y planes revisados (sección 6.1): panel (`/plantillas`, ficha de
>   paciente, plan), portal (`portal/plan`), `plan-pdf.tsx`, asistente IA del panel
>   (`lib/assistant-tools.ts`: solo lee `NutritionPlan.title`), IA del plan (`ai-actions.ts`: solo
>   comidas de un plan vacío) y bot (`apps/bot/src` **no** lee `NutritionPlan` ni `PlanTemplate`;
>   `domain/botAi.ts` lo dice explícitamente). Ninguna IA lee notas, plantillas ni secciones.
> - Producción: Vercel + Neon, `develop` = producción, el build de Vercel **no** migra (10.3).

---

## 1. Resumen funcional

Joel corre un script (`plans:import`) sobre los PDF de planes que le pasa la nutricionista
(`docs/planes-alimentacion/`, fuera de git). Un parser puro de `packages/core` (sin IA) lee el texto
con `pdftotext -bbox`, reconoce las secciones del formato Canva de ejemplo y arma una **plantilla en
borrador**: comidas por día como ítems de texto (una línea por comida y día, con la línea de macros
cualitativa como nota), Desayuno y Merienda por separado con el mismo contenido (D7), cada tanda de
lunes a domingo como comidas numeradas (D6), las colaciones como "Opciones (elige una)" con las recetas
publicadas vinculadas solo si el nombre coincide exacto y la cantidad está en porciones (D8), y las
recomendaciones, consumo diario y ocasional, regla del plato y reemplazos como **secciones de texto**
(D9). Lo que no entiende queda como aviso o "Texto sin ubicar" con su página. Antes de guardar, descarta
el nombre y la fecha de la portada y el pie de la profesional, reemplaza el nombre por `[paciente]` si
aparece en otra parte, y no guarda ni el PDF, ni su texto crudo, ni el nombre del archivo; la clave de
idempotencia es el hash del contenido. El script corre en seco por defecto, con `--write` pide `SI`,
escribe en la base de `DATABASE_URL` (producción: Neon, por entorno), guarda la corrida y `plans:undo`
borra solo los borradores de esa corrida que siguen sin revisar. En el panel, `/plantillas` muestra el
chip "Borrador", el borrador se revisa en `/plantillas/[id]` (banner con "Publicar plantilla", avisos
con "Listo", "Texto sin ubicar" con "Mover a…"/"Descartar", "Vincular" receta) y no se ofrece en
"Aplicar plantilla" hasta publicarlo. Plantillas y planes ganan un bloque "Textos del plan" editable;
`applyTemplateToPatient` copia las secciones y rechaza borradores; el portal y el PDF las muestran. Una
plantilla (o plan) con ítems pero sin ninguna cantidad muestra un aviso en vez de macros en cero (D10).

## 2. Workspaces afectados

| Workspace | ¿Cambia? | Qué |
|---|---|---|
| `packages/db` | **Sí** | `schema.prisma` (enums `TemplateStatus`/`TemplateOrigin`, campos de importación en `PlanTemplate`, modelos `PlanTemplateSection` y `PlanSection`), migración `plan_template_import`, `domain/planTemplates.ts` (listar por estado, secciones en `getTemplate`, `applyTemplateToPatient` copia secciones y rechaza borradores), `domain/nutritionPlans.ts` (`getPlan` trae secciones), nuevos `domain/planSections.ts` y `domain/planTemplateImport.ts`, scripts `scripts/plans/{import,undo}.ts` y 4 scripts npm. Tests con mocks. |
| `packages/core` | **Sí** | Subpaquete nuevo `@nutri-bot/core/plan-import` (parser puro + fixture anonimizado + tests). Módulo nuevo `plan-templates.ts` (tipos de avisos, textos, límites y validación de secciones, `hasQuantifiedItems`) exportado desde el índice. Refactor sin cambio de comportamiento: `buildLines`/`makeSeg`/`median` salen de `recipe-import/extract.ts` a `sara2/lines.ts` para reusarlos. |
| `apps/web` | **Sí** | `/plantillas` (chip, orden), `/plantillas/[id]` (banner, publicar, avisos, texto sin ubicar, vincular receta, textos del plan), plan de la paciente (textos del plan), ficha (aplicar solo publicadas), acciones nuevas, `meals-editor.tsx` (texto largo plegado, aviso D10), portal `plan-view.tsx`/`page.tsx`, `plan-pdf.tsx`, `revalidate-menu-owner.ts`. |
| `apps/bot` | **No (código)** | Ningún archivo de `apps/bot/src` cambia (no lee plantillas ni planes; el PDF que manda ya viene generado en `pdfData`). Pero cambian los tipos de Prisma (`PlanTemplate`, `NutritionPlan`): **`typecheck` y tests de `apps/bot` son obligatorios.** |

## 3. Decisiones técnicas

| ID | Decisión | Por qué |
|---|---|---|
| T1 | **Estado y origen como enums nuevos** `TemplateStatus { DRAFT PUBLISHED }` y `TemplateOrigin { MANUAL IMPORT }`, con default `PUBLISHED`/`MANUAL`. No se reusa `RecipeStatus` (tiene `ARCHIVED`) ni `RecipeOrigin` (otra entidad). | Las existentes y las que crea el formulario manual quedan publicadas sin tocar `createTemplate`. Agregar un enum nuevo no es destructivo. |
| T2 | **`importKey` = `"pdf-sha256:" + sha256(bytes del PDF)` en hex** (64 caracteres). El hash lo calcula el **script** (`node:crypto`); core solo lo formatea (`planImportKey`) para no meter `node:crypto` en un paquete que también usa el navegador. Sin `importFile`, `importPage` ni `importRawText` (D12). | El nombre del archivo trae el nombre de la paciente. Reexportar el mismo plan desde Canva da otro hash → otro borrador (aceptado: se borra con "Eliminar" o `plans:undo`). |
| T3 | **D6/D7 en `plan-import/meal-mapping.ts`**: `MENU_SECTION_MEALS` dice qué comidas genera cada sección de menú y `mealNameFor(sectionKey, mealKey, tanda, totalTandas)` arma el nombre. Con **una sola tanda** el nombre va **sin número** ("Desayuno"); con 2+ tandas, "Desayuno (1)", "Desayuno (2)". Orden final de las comidas: por sección y tanda tal como en la resolución (`Desayuno (1)`, `Merienda (1)`, `Desayuno (2)`, `Merienda (2)`, `Almuerzo (1)`, `Cena (1)`, `Almuerzo (2)`, `Cena (2)`, `Colaciones`). Cada día de la sección Desayuno y merienda crea **el mismo ítem en Desayuno y en Merienda** de esa tanda. | Cuando la nutricionista conteste qué son las tandas, se cambia solo este archivo y sus tests. |
| T4 | **Datos personales en `plan-import/personal-data.ts`** (único lugar): reglas declarativas `PERSONAL_DATA_RULES` + `stripPersonalData()`. Hoy: (a) tramo de portada `Nombre[, Apellido] dd/mm/aa(aa)` → se descarta y sus palabras son el "nombre de portada"; (b) cualquier otra línea de la portada que no sea el título "Plan nutricional" ni el objetivo → se **descarta** (solo se cuenta, sin texto; aviso `COVER_LINES_DROPPED`); (c) en la portada, líneas que empiezan con `peso|edad|talla|altura|diagn[oó]stico|dni|tel[eé]fono|fecha|paciente` → descartadas (preparado para D12/D14); (d) tramos del pie de la profesional (`/\bLic\.?\s/i` o `/\bM\.?\s?[PN]\.?\s*\d+/i`) en cualquier página → descartados en silencio (ya están en `Professional`); (e) cada palabra del nombre de portada (≥ 3 letras) que aparezca **con mayúscula inicial** como palabra entera en el resto del texto → `[paciente]`, aviso `PATIENT_NAME_REPLACED` con la cantidad. | Con un solo PDF no sabemos qué más trae (D12/D14): agregar una regla es sumar una entrada y un test. La mayúscula inicial evita pisar "clara de huevo" si la paciente se llama Clara; cualquier reemplazo igual se avisa para que lo revise. |
| T5 | **Secciones reconocidas en `plan-import/sections.ts`** (`KNOWN_SECTIONS`). Un tramo es encabezado si, sin espacios y con `plainText`, coincide con una clave conocida. Solo un **encabezado al tope de la página** (primer tramo no descartado, en el 20 % superior) que **no** es conocido y "parece encabezado" (`isHeadingLike`: sin minúsculas, 1–8 palabras, o letras espaciadas) abre una sección desconocida: aviso `UNKNOWN_SECTION` y sus líneas van a "Texto sin ubicar". Un encabezado desconocido **en medio** de una sección de texto queda como subtítulo del texto; en una sección de menú, va a "Texto sin ubicar". Página sin encabezado → continúa la sección anterior. | "Avisos en vez de fallas": un plan con una sección nueva se importa igual y ella decide. |
| T6 | **Columnas**: en secciones de texto los tramos se ordenan por columna (izquierda = `x0 < width/2`; luego derecha), y dentro de cada columna por `y`. En secciones de menú se usa el orden por `y` (la combinación y su línea de macros comparten columna). | Resuelve "Alimentos de consumo diario" y "Reemplazos" en dos columnas sin `-layout`. |
| T7 | **Se reusa la geometría de recetas**: `median`, `makeSeg` y `buildLines` (con sus tipos `Word`, `Seg`, `Line`) **se mueven** de `recipe-import/extract.ts` a `packages/core/src/sara2/lines.ts` (junto a `bbox.ts`), se exportan, y `extract.ts` los importa. Se agrega `pageLines(page: BboxPage): Line[]` (lo que hoy hace `extractPage` en sus primeras líneas: filtra vacías, calcula `h`/`yc`, descarta rotadas, tolerancia `0,5 × mediana`). Cero cambio de comportamiento: los tests de `recipe-import` tienen que seguir verdes sin tocarlos. También se reusan `parseBboxXhtml` (`sara2/bbox.ts`), `normalizePdfText` y `plainText` (`recipe-import/text.ts`), `foodSearchText` (`food-search.ts`), `normalizePortions` (`recipes.ts`), `WEEKDAYS`/`Weekday`/`MealMode` (`weekly-menu.ts`). | Pedido explícito: no duplicar helpers. |
| T8 | **Recetas (D8) en `plan-import/recipe-match.ts`**, solo para las opciones de **Colaciones** (las combinaciones del menú nunca se vinculan). Opción `^(nombre)\s*(?:\((cantidad)\))?\s*$`: si `foodSearchText(nombre) === foodSearchText(receta.name)` de una receta `PUBLISHED`: sin cantidad → receta con 1 porción; cantidad `N porción(es)` (N con coma, punto, `½` o `1/2`) y `normalizePortions(N) !== null` → receta con N porciones; otra cantidad ("2 unidades") o texto después del paréntesis ("Panqueques (2 unidades) con fruta") → **ítem de texto** + aviso `RECIPE_SUGGESTION`. Si hay 2+ recetas publicadas con el mismo nombre normalizado → texto + aviso (no se elige sola). | Nunca se convierten unidades en porciones (HU). |
| T9 | **En seco no hay base**: el parser recibe `recipes: []` y el reporte dice "recetas: se resuelven con --write". Con `--write`, el script lee las recetas publicadas **de la base destino** (`listRecipesForPlanMatching`) y recién ahí parsea. | Mismo criterio que `recipes:extract` (en seco no importa el cliente de Prisma). |
| T10 | **`reviewedAt`** se marca la primera vez que se cambia algo del borrador desde el panel: `markTemplateReviewed(templateId)` (no-op salvo `DRAFT` + `IMPORT` + `reviewedAt null`). Se llama desde un único helper web `touchTemplate(templateId)` (marca + `revalidatePath`) que usan `plantillas/actions.ts`, las acciones de importación y de secciones, y la rama `template` de `revalidateMenuOwner` (que cubre `weekly-menu-actions`, `recipe-picker-actions` y `food-measure-actions`). Abrir la página **no** marca. | Una reimportación no pisa lo que ella tocó (escenario de la HU), con un solo punto de enganche. |
| T11 | **`importHints`** = `TemplateImportHint[]` (JSON). Se **vacía al publicar**. Cada aviso tiene `id` estable (`h1`, `h2`, …, lo pone el parser). Los avisos de receta llevan `itemRef` del parser y el dominio les agrega `itemId` al crear los ítems. Lectura siempre por `parseTemplateHints(json)` (core), que descarta entradas mal formadas. El texto de "Texto sin ubicar" se guarda en el aviso **ya filtrado por `personal-data.ts`**. | Lo que queda en la base pasó por el filtro; no hay texto crudo. |
| T12 | **Publicar** (`publishTemplate`) exige 0 avisos `UNPLACED`; si no, `TemplateNotPublishableError(unplaced)`. Pone `status = PUBLISHED`, `importHints = null` y `reviewedAt ??= now`. No hay "despublicar" (fuera de alcance). | HU: no se publica con texto sin ubicar. |
| T13 | **Aplicar**: `listTemplates({ status: "PUBLISHED" })` en la ficha de la paciente; `applyTemplateToPatient` **rechaza** un `DRAFT` con `TemplateNotPublishedError` (defensa si alguien manda el id a mano) y `applyTemplateAction` lo traduce a texto. | HU: "no aparece en Aplicar plantilla". |
| T14 | **Secciones de texto (D9)**: dos tablas hermanas `PlanTemplateSection` y `PlanSection` (`title`, `body`, `order`), igual que `TemplateMeal`/`PlanMeal`. Límites en core: título 1–80, cuerpo 1–20.000 caracteres (las recomendaciones del ejemplo son ~2.300). Máximo 30 secciones por dueño. `notes` no cambia (sigue con su tope de 2.000 en plantillas y 4.000 en planes). | HU-015 (Leo) va a usar estas mismas secciones; dejarlo en el issue #48. |
| T15 | **Largo de ítem importado**: `PLAN_IMPORT_LABEL_MAX = 500` caracteres. Una combinación más larga no se corta: va completa a "Texto sin ubicar" con su página. Notas (línea de macros) hasta 300; si es más larga, se corta en 300 (es texto repetitivo, no clínico). | Nada se pierde en silencio; 500 cubre con holgura las líneas de ~130–160 del ejemplo. |
| T16 | **Consola solo con contadores** (D12): el script nunca imprime nombres de archivo, títulos ni texto. Los PDF se identifican como "PDF 1 de N". "Ya importado" se imprime como `ya importado (plantilla <id>)` — **no** el título (desvío consciente del Gherkin "Este PDF ya se importó: <título>", cuyo texto queda en core como `PLAN_IMPORT_TEXT.alreadyImported(title)` para la futura subida desde el panel, D3-b). El reporte detallado va a `docs/planes-alimentacion/_importacion/reporte.md` (carpeta ya ignorada) con el contenido **ya filtrado**; la corrida `corrida-<ISO>.json` lleva solo ids, `importKey` y resultado. | Lo que sale por consola puede terminar en un log o en un chat. |
| T17 | **"No pude leer el plan"**: `parsePlanPdf` devuelve `{ ok: false, reason: "NO_TEXT" }` si el PDF tiene < 20 palabras con texto, y `{ ok: false, reason: "NO_MENU" }` si no reconoce ninguna sección de menú (Desayuno y merienda, Almuerzo y cena, Colaciones). No se crea nada y el script cuenta `PLAN_IMPORT_TEXT.notReadable`. | Escenario "PDF que no tiene el formato esperado". |
| T18 | **D10**: `hasQuantifiedItems(meals)` (core) = algún ítem con `foodId` o receta. Si la plantilla **o el plan** tiene ≥ 1 ítem y ninguno cuantificado, `MealsEditor` muestra en lugar de `DayTargetStrip` un `Alert` informativo con `PLAN_IMPORT_TEXT.noQuantities(kind)`. Sin ítems (plan nuevo con comidas vacías) se ve como hoy. | El plan aplicado desde una plantilla importada tiene el mismo problema; el cambio es el mismo componente. |
| T19 | **Hints de "Mover a…"**: a comida → crea un ítem de texto (`customLabel` = texto del aviso) en la comida elegida (y el día, si es `PER_DAY`) con `nextItemOrder`; a sección → agrega el texto al final del cuerpo (`\n\n` + texto) de la sección elegida o crea una sección nueva "Texto importado". En los dos casos el aviso se borra en la misma transacción. | HU 4.3. |

## 4. Esquema

### 4.1 `packages/db/prisma/schema.prisma`

```prisma
/// HU-020: estado de una plantilla. Solo PUBLISHED se ofrece en "Aplicar plantilla".
enum TemplateStatus {
  DRAFT
  PUBLISHED
}

/// HU-020: MANUAL = creada en el panel. IMPORT = vino de plans:import (PDF).
enum TemplateOrigin {
  MANUAL
  IMPORT
}

model PlanTemplate {
  id          String         @id @default(cuid())
  title       String
  notes       String?
  /// HU-020. Default PUBLISHED: las existentes y las creadas a mano se siguen ofreciendo.
  status      TemplateStatus @default(PUBLISHED)
  origin      TemplateOrigin @default(MANUAL)
  /// HU-020 (D12): "pdf-sha256:<hex>" del contenido del PDF (planImportKey de core). Nunca el nombre
  /// del archivo. Hace idempotente la importación. No se guarda el PDF ni su texto.
  importKey   String?        @unique
  /// HU-020: TemplateImportHint[] de core (avisos para la revisión). Se vacía al publicar.
  importHints Json?
  /// HU-020: primera vez que se cambió el borrador desde el panel. Desde ahí la importación no lo pisa.
  reviewedAt  DateTime?
  createdAt   DateTime       @default(now())
  updatedAt   DateTime       @updatedAt
  meals       TemplateMeal[]
  sections    PlanTemplateSection[]

  @@index([status, title])
}

/// HU-020 (D9): textos de la plantilla (recomendaciones, consumo diario, reemplazos…). Se copian al plan.
model PlanTemplateSection {
  id         String       @id @default(cuid())
  template   PlanTemplate @relation(fields: [templateId], references: [id], onDelete: Cascade)
  templateId String
  /// 1..80 (PLAN_SECTION_LIMITS de core).
  title      String
  /// 1..20000. Texto plano con saltos de línea.
  body       String
  order      Int
  createdAt  DateTime     @default(now())
  updatedAt  DateTime     @updatedAt

  @@index([templateId, order])
}

/// HU-020 (D9): textos del plan de la paciente. Copia de los de la plantilla al aplicarla; editables.
model PlanSection {
  id        String        @id @default(cuid())
  plan      NutritionPlan @relation(fields: [planId], references: [id], onDelete: Cascade)
  planId    String
  title     String
  body      String
  order     Int
  createdAt DateTime      @default(now())
  updatedAt DateTime      @updatedAt

  @@index([planId, order])
}
```

En `NutritionPlan` agregar la relación `sections PlanSection[]` (sin columnas nuevas).

### 4.2 Migración

- Nombre: **`plan_template_import`** (desde `packages/db`:
  `npx dotenv -e ../../.env -- prisma migrate dev --create-only --name plan_template_import`).
- SQL esperado (revisarlo antes de aplicar, skill `migracion-prisma`):
  - `CREATE TYPE "TemplateStatus" AS ENUM ('DRAFT', 'PUBLISHED');`
  - `CREATE TYPE "TemplateOrigin" AS ENUM ('MANUAL', 'IMPORT');`
  - `ALTER TABLE "PlanTemplate" ADD COLUMN "status" "TemplateStatus" NOT NULL DEFAULT 'PUBLISHED', ADD COLUMN "origin" "TemplateOrigin" NOT NULL DEFAULT 'MANUAL', ADD COLUMN "importKey" TEXT, ADD COLUMN "importHints" JSONB, ADD COLUMN "reviewedAt" TIMESTAMP(3);`
  - `CREATE UNIQUE INDEX "PlanTemplate_importKey_key" …`, `CREATE INDEX "PlanTemplate_status_title_idx" …`
  - `CREATE TABLE "PlanTemplateSection"` y `"PlanSection"` con sus índices y FK `ON DELETE CASCADE`.
- **Filas existentes:** las dos columnas `NOT NULL` tienen `DEFAULT` en el mismo `ALTER` → todas las
  plantillas existentes quedan `PUBLISHED`/`MANUAL` (escenario "Las plantillas existentes no cambian").
  No hace falta backfill.
- **Parar si** el SQL trae `DROP`, cambio de tipo o toca otras tablas.
- Aditiva y compatible con el código viejo (el código actual no lee las columnas nuevas): por eso se
  migra Neon **antes** del merge (10.3).

## 5. Contrato compartido

### 5.1 `packages/core/src/plan-templates.ts` (nuevo; exportado desde `src/index.ts`; consumidores: web y db)

```ts
import type { Weekday } from "./weekly-menu";

export type TemplateStatusKey = "DRAFT" | "PUBLISHED";
export type TemplateOriginKey = "MANUAL" | "IMPORT";

export type MenuSectionKey = "BREAKFAST_SNACK" | "LUNCH_DINNER";

export type TemplateImportHint =
  | { id: string; kind: "TANDAS"; section: MenuSectionKey; count: number }
  | { id: string; kind: "BREAKFAST_SNACK_SAME_CONTENT" }
  | { id: string; kind: "RECIPE_SUGGESTION"; label: string; recipeId: string; recipeName: string;
      itemRef: string; itemId?: string }
  | { id: string; kind: "PATIENT_NAME_REPLACED"; count: number }
  | { id: string; kind: "COVER_LINES_DROPPED"; count: number }
  | { id: string; kind: "UNKNOWN_SECTION"; heading: string; page: number }
  | { id: string; kind: "MISSING_DAYS"; mealName: string; days: Weekday[] }
  | { id: string; kind: "UNPLACED"; text: string; page: number };

/** Lee el JSON de PlanTemplate.importHints. null/no-array → []. Descarta entradas mal formadas. */
export function parseTemplateHints(json: unknown): TemplateImportHint[];
export function unplacedCount(hints: readonly TemplateImportHint[]): number;
export function canPublishTemplate(hints: readonly TemplateImportHint[]): boolean; // unplacedCount === 0
/** Texto de cada aviso (no aplica a UNPLACED, que se muestra en su tarjeta). */
export function templateHintText(hint: TemplateImportHint): string;

export const PLAN_SECTION_LIMITS = { titleMax: 80, bodyMax: 20000, maxPerOwner: 30 } as const;
export function validatePlanSectionInput(input: { title: string; body: string }):
  | { ok: true; value: { title: string; body: string } }   // trim; body conserva saltos de línea
  | { ok: false; error: "TITLE_REQUIRED" | "TITLE_TOO_LONG" | "BODY_REQUIRED" | "BODY_TOO_LONG" };

/** D10: algún ítem con alimento (foodId) o receta. */
export function hasQuantifiedItems(
  meals: readonly { items: readonly { foodId: string | null; recipe?: unknown | null; recipeId?: string | null }[] }[],
): boolean;
export function hasAnyItem(meals: readonly { items: readonly unknown[] }[]): boolean;

export const PLAN_IMPORT_TEXT = { /* textos exactos, ver 5.1.1 */ };
export const PLAN_SECTION_TEXT = { /* textos exactos, ver 5.1.1 */ };
```

#### 5.1.1 Textos exactos (en `PLAN_IMPORT_TEXT` / `PLAN_SECTION_TEXT`)

| Clave | Texto |
|---|---|
| `draftChip` | `Borrador` |
| `importedUnreviewed` / `importedReviewed` | `Importada de PDF · sin revisar` / `Importada de PDF · revisada` |
| `banner` | `Borrador importado de PDF. Revisalo y publicalo para poder aplicarlo a tus pacientes.` |
| `publishButton` / `publishing` | `Publicar plantilla` / `Publicando…` |
| `publishBlocked(n)` | `Quedan ${n} línea${n === 1 ? "" : "s"} sin ubicar` |
| `published` (toast) | `Plantilla publicada. Ya podés aplicarla a tus pacientes.` |
| `hintsTitle(n)` | `Avisos del importador (${n})` |
| `hintDone` | `Listo` |
| `tandas(sectionLabel, count)` | `Este PDF trae ${count === 2 ? "dos" : count} tandas de días en ${sectionLabel}: revisá los nombres de las comidas.` (`sectionLabel`: `Desayuno y merienda` / `Almuerzo y cena`) |
| `breakfastSnackSame` | `El PDF no distingue el desayuno de la merienda: cargué lo mismo en Desayuno y en Merienda. Borrá o cambiá lo que no corresponda.` |
| `recipeSuggestion(label, recipe)` | `¿'${label}' es la receta ${recipe}?` — botones `Vincular` / `Dejar como texto` |
| `linkTitle(recipe)` / `linkConfirm` | `Vincular ${recipe}` / `Vincular` |
| `nameReplaced(n)` | `Reemplacé el nombre de la paciente por [paciente] en ${n} lugar${n === 1 ? "" : "es"}.` |
| `coverDropped(n)` | `Descarté ${n} línea${n === 1 ? "" : "s"} de la portada que no supe ubicar (pueden ser datos de la paciente).` |
| `unknownSection(h, p)` | `No reconocí la sección «${h}» (pág. ${p}): sus líneas quedaron en «Texto sin ubicar».` |
| `missingDays(meal, days)` | `${meal}: el PDF no trae ${lista de días en minúscula unidos con ", " y " y "}.` |
| `unplacedTitle` / `unplacedPage(p)` | `Texto sin ubicar` / `pág. ${p}` |
| `moveTo` / `discard` | `Mover a…` / `Descartar` |
| `moveToMeal` / `moveToSection` / `newSectionTitle` | `A una comida` / `A un texto del plan` / `Texto importado` |
| `noQuantities("template")` | `Plantilla sin cantidades: los macros aparecen cuando agregás alimentos o recetas.` |
| `noQuantities("plan")` | `Plan sin cantidades: los macros aparecen cuando agregás alimentos o recetas.` |
| `draftNotApplicable` | `Esta plantilla es un borrador: publicala antes de aplicarla.` |
| `notReadable` | `No pude leer el plan de este PDF. Cargalo a mano o pasáselo a Joel.` |
| `alreadyImported(title)` | `Este PDF ya se importó: ${title}` (solo para la futura subida desde el panel, T16) |
| `defaultTitle` | `Plan importado de PDF` (si la portada no trae objetivo; sin aviso propio: ella ve el título en la revisión) |
| `showMore` / `showLess` | `Ver completo` / `Ver menos` |
| `PLAN_SECTION_TEXT.cardTitle` | `Textos del plan` |
| `PLAN_SECTION_TEXT.cardDescription("template")` | `Recomendaciones, porciones y reemplazos. Se copian al plan cuando aplicás la plantilla.` |
| `PLAN_SECTION_TEXT.cardDescription("plan")` | `Recomendaciones, porciones y reemplazos. Tu paciente los ve en el portal y en el PDF.` |
| `add` / `save` / `delete` / `moveUp` / `moveDown` | `Agregar texto` / `Guardar` / `Borrar` / `Subir` / `Bajar` |
| `titleLabel` / `bodyLabel` | `Título` / `Texto` |
| `deleteConfirm(title)` | `¿Borrar «${title}»? No se puede deshacer.` |
| `errors.*` | `TITLE_REQUIRED`: `Poné un título.` · `TITLE_TOO_LONG`: `El título puede tener hasta 80 caracteres.` · `BODY_REQUIRED`: `Escribí el texto.` · `BODY_TOO_LONG`: `El texto puede tener hasta 20.000 caracteres.` · `tooMany`: `Llegaste al máximo de 30 textos.` · `generic`: `No se pudo guardar. Probá de nuevo.` |
| `empty` | `Todavía no hay textos. Sumá recomendaciones, porciones diarias o reemplazos.` |

### 5.2 `packages/core/src/plan-import/` (nuevo subpaquete `@nutri-bot/core/plan-import`; consumidor: `packages/db/scripts/plans/import.ts` y `domain/planTemplateImport.ts` solo por tipos)

Agregar en `packages/core/package.json` → `exports`: `"./plan-import": "./src/plan-import/index.ts"`.
**No** se exporta desde `src/index.ts` (no entra al bundle del cliente).

```ts
// index.ts
export * from "./types";
export * from "./sections";
export * from "./personal-data";
export * from "./meal-mapping";
export * from "./menu";
export * from "./recipe-match";
export * from "./parse";

// types.ts
import type { MealMode, Weekday } from "../weekly-menu";
import type { TemplateImportHint } from "../plan-templates";

export interface RecipeMatchCandidate { id: string; name: string }

export type PlanImportItem =
  | { kind: "TEXT"; ref: string; weekday: Weekday | null; label: string; notes: string | null }
  | { kind: "RECIPE"; ref: string; weekday: null; recipeId: string; portions: number };

export interface PlanImportMeal {
  /** "BREAKFAST:1", "SNACK:1", "LUNCH:2", "OPTIONS" (estable para tests). */
  key: string;
  name: string;
  mode: MealMode;
  isOptions: boolean;
  /** order dentro de (meal, weekday) = índice en este array filtrado por weekday. */
  items: PlanImportItem[];
}

export interface PlanImportStats {
  pages: number; meals: number; textItems: number; recipeItems: number; recipeSuggestions: number;
  sections: number; unplaced: number; redactions: number; coverLinesDropped: number; footerSegments: number;
}

export interface PlanImportDraft {
  importKey: string;
  title: string;              // objetivo de la portada, o PLAN_IMPORT_TEXT.defaultTitle; máx. 140
  meals: PlanImportMeal[];
  sections: { title: string; body: string }[];
  hints: TemplateImportHint[];
  stats: PlanImportStats;
}

export type PlanImportResult =
  | { ok: true; draft: PlanImportDraft }
  | { ok: false; reason: "NO_TEXT" | "NO_MENU" };

// parse.ts
/** "pdf-sha256:<hex>". Lanza si sha256Hex no es /^[0-9a-f]{64}$/. */
export function planImportKey(sha256Hex: string): string;
/** pages = parseBboxXhtml(pdftotext -bbox). Puro: sin base, sin red, sin fs. */
export function parsePlanPdf(
  pages: readonly BboxPage[],
  ctx: { importKey: string; recipes: readonly RecipeMatchCandidate[] },
): PlanImportResult;
export const PLAN_IMPORT_LABEL_MAX = 500;
export const PLAN_IMPORT_NOTE_MAX = 300;
```

Funciones públicas de cada módulo (todas puras, todas con test):

| Archivo | Exporta | Qué hace |
|---|---|---|
| `sections.ts` | `type PlanSectionKey = "COVER" \| "RECOMMENDATIONS" \| "DAILY_FOODS" \| "OCCASIONAL_FOODS" \| "BREAKFAST_SNACK" \| "LUNCH_DINNER" \| "SNACKS" \| "REPLACEMENTS"`; `KNOWN_SECTIONS: ReadonlyArray<{ key; match: (compact: string) => boolean; kind: "cover" \| "text" \| "menu" \| "options"; textTitle: string \| null }>`; `matchSectionHeading(segText): PlanSectionKey \| null`; `isHeadingLike(segText): boolean`; `DECORATIVE_LABELS: readonly string[]`; `PLATE_RULE_TITLE = "Cómo armar el plato"` | `compact` = `plainText(t).replace(/ /g, "")`. Claves: `plannutricional`→COVER; `recomendaciones`→RECOMMENDATIONS ("Recomendaciones"); `alimentosdeconsumodiario`→DAILY_FOODS ("Alimentos de consumo diario"); `alimentosdeconsumoocasional`→OCCASIONAL_FOODS ("Alimentos de consumo ocasional"); `desayunoymerienda`→BREAKFAST_SNACK; `almuerzoycena`→LUNCH_DINNER; `colacionesopcionales` o `colaciones`→SNACKS; empieza con `reemplazo`→REPLACEMENTS ("Reemplazos"; el renglón del encabezado, p. ej. "REEMPLAZO (Alimentos ricos en proteínas)", se agrega como subtítulo dentro del cuerpo). `DECORATIVE_LABELS` (comparados con `plainText`): `opciones`, `de colaciones`, `opciones de colaciones`. |
| `personal-data.ts` | `PERSONAL_DATA_RULES`; `stripPersonalData(lines: readonly ImportLine[]): { lines: ImportLine[]; coverName: string[]; redactions: number; coverLinesDropped: number; footerSegments: number }`; `isProfessionalFooter(text): boolean`; `COVER_NAME_DATE_RE` | Reglas T4. `ImportLine = { page: number; section: PlanSectionKey \| "UNKNOWN" \| null; text: string; x0: number; y0: number; h: number; column: 0 \| 1; isPageTopHeading: boolean }` (definido en `types.ts`). **Es el único archivo que conoce datos personales**: comentario de cabecera "D12/D14 pendientes: agregar reglas acá". |
| `meal-mapping.ts` | `MENU_SECTION_MEALS: Record<MenuSectionKey, readonly { mealKey: "BREAKFAST" \| "SNACK" \| "LUNCH" \| "DINNER"; baseName: string }[]>`; `mealNameFor(baseName, tanda, totalTandas): string`; `LUNCH_DINNER_LABELS` | T3. BREAKFAST_SNACK → `[{BREAKFAST,"Desayuno"},{SNACK,"Merienda"}]`; LUNCH_DINNER → `[{LUNCH,"Almuerzo"},{DINNER,"Cena"}]`. `LUNCH_DINNER_LABELS`: regex `/^\s*(almuerzo\s+y\s+cena\|almuerzo\|cena)\s*:\s*/i` → `["LUNCH","DINNER"]`/`["LUNCH"]`/`["DINNER"]`. `OPTIONS_MEAL_NAME = "Colaciones"`. |
| `menu.ts` | `parseWeekdayLine(text): { day: Weekday; rest: string } \| null`; `isQualitativeMacroLine(text): boolean`; `normalizeCombo(text): string`; `splitTandas(...)` (interno exportado para test) | Día: `plainText` empieza con `lunes\|martes\|miercoles\|jueves\|viernes\|sabado\|domingo` seguido de fin, `:` o espacio; `rest` = lo que siga (si la línea trae contenido). Macros: todas las palabras de `plainText` ∈ {hidratos, de, carbono, carbonos, fibra, fibras, proteinas, proteina, y, e, grasas, saludables, vitaminas, minerales, alimentaria} y al menos una de {hidratos, proteinas, proteina, grasas}. `normalizeCombo`: `normalizePdfText` + `s.replace(/\s*\+\s*/g, " + ")` + trim (no toca paréntesis). **Tanda nueva** cuando el día leído no es posterior al último día de la tanda actual. |
| `recipe-match.ts` | `parseOptionLine(text): { name: string; qty: string \| null; rest: string }`; `parsePortionQty(qty): number \| null`; `matchRecipeOption(text, recipes): { kind: "RECIPE"; recipeId; portions } \| { kind: "TEXT"; suggestion: RecipeMatchCandidate \| null }` | T8. `parsePortionQty`: `/^(\d+(?:[.,]\d+)?\|½\|\d+\s*½\|\d+\/\d+)\s*porci[oó]n(?:es)?$/i` → número → `normalizePortions`. |
| `parse.ts` | `parsePlanPdf`, `planImportKey`, constantes | Orquesta (ver 5.2.1). |

#### 5.2.1 Algoritmo de `parsePlanPdf` (orden fijo)

1. `pageLines(page)` (`sara2/lines.ts`) por página → por cada tramo (`seg`) un `ImportLine` con
   `column = seg.x0 < page.width / 2 ? 0 : 1` e `isPageTopHeading` (primer tramo de la página que no es
   pie de la profesional y está en el 20 % superior).
   Si el total de palabras con texto < 20 → `{ ok:false, reason:"NO_TEXT" }`.
2. **Asignar sección**: recorriendo páginas en orden, un tramo con `matchSectionHeading` cambia la
   sección actual (y no se agrega como contenido, salvo REPLACEMENTS, ver tabla). Un
   `isPageTopHeading` + `isHeadingLike` desconocido → sección `"UNKNOWN"` + aviso `UNKNOWN_SECTION`.
   Antes de la primera sección reconocida en la página 1 → `COVER`. Página 2+ antes de cualquier
   sección reconocida → `"UNKNOWN"` (sin aviso de encabezado; sus líneas son `UNPLACED`).
3. `stripPersonalData(lines)` (T4). Todo lo que sigue trabaja sobre su salida.
4. **Portada**: título = primer tramo de COVER que empieza con `para ` (o, si no hay, el tramo más largo
   que no sea "Plan nutricional"), `normalizePdfText`, máx. 140; si no hay → `defaultTitle`.
5. **Secciones de texto** (RECOMMENDATIONS, DAILY_FOODS, OCCASIONAL_FOODS, REPLACEMENTS): orden T6;
   renglones consecutivos se unen con espacio; un hueco vertical > 1,5 × `h` entre renglones de la misma
   columna, un cambio de columna o un `isHeadingLike` (subtítulo) arrancan párrafo nuevo (`\n\n`; el
   subtítulo va en su propio renglón). Una sección por clave, en el orden de `KNOWN_SECTIONS`, solo si
   tiene texto. Cuerpo > 20.000 → se corta en 20.000 y aviso `UNPLACED` con el resto (pág. de origen
   del primer renglón cortado).
6. **Secciones de menú** (BREAKFAST_SNACK, LUNCH_DINNER), orden por `y`:
   - Renglones antes del primer día → "regla del plato": se agregan a la sección
     `PLATE_RULE_TITLE` bajo un subtítulo `Desayuno y merienda` / `Almuerzo y cena`.
   - Después de un día: BREAKFAST_SNACK junta los renglones que no son de macros en **una** combinación
     (`normalizeCombo`); LUNCH_DINNER abre una etiqueta nueva con cada `LUNCH_DINNER_LABELS` y le suma los
     renglones siguientes que no son de macros ni otra etiqueta. Renglones de macros consecutivos → una
     nota (`normalizePdfText`, máx. 300). Un renglón en LUNCH_DINNER sin etiqueta antes → `UNPLACED`.
     `DECORATIVE_LABELS` se ignoran.
   - Cada combinación → un `TEXT` por comida destino del mapeo (T3), `weekday` = el día, `notes` = la
     nota del día. Combinación > `PLAN_IMPORT_LABEL_MAX` → `UNPLACED` (completa).
   - Por sección: `count` tandas ≥ 2 → aviso `TANDAS`. BREAKFAST_SNACK con algún día cargado → aviso
     `BREAKFAST_SNACK_SAME_CONTENT` (una vez). Una tanda con días faltantes → `MISSING_DAYS` por comida.
7. **SNACKS**: cada renglón (ignorando `DECORATIVE_LABELS`; un renglón que empieza en minúscula o
   sigue a uno que termina en `+` se une al anterior) → `matchRecipeOption`. Comida `"Colaciones"`,
   `EVERY_DAY`, `isOptions: true`, `weekday: null`, orden del PDF. Sugerencia → aviso `RECIPE_SUGGESTION`
   con `itemRef` del ítem de texto.
8. Ninguna sección de menú con al menos un ítem → `{ ok:false, reason:"NO_MENU" }`.
9. Sección `"UNKNOWN"` → un `UNPLACED` por renglón (con `page`).
10. `hints` con ids `h1…hn` en orden de aparición; `stats` (todos los contadores).

**Garantías (con test):** ningún `PlanImportItem` tiene gramos ni medida (el tipo no los tiene) ni
`foodId`; ningún texto de salida contiene una palabra del nombre de portada con mayúscula inicial; el
tramo "Nombre, Apellido dd/mm/aa" y el pie "Lic. … M.P …" no aparecen en ningún campo de salida.

### 5.3 `packages/core/src/sara2/lines.ts` (nuevo, por movimiento; consumidores: `recipe-import/extract.ts` y `plan-import`)

```ts
export interface Word extends BboxWord { h: number; yc: number }
export interface Seg { words: Word[]; x0: number; x1: number; y0: number; y1: number; yc: number; h: number; text: string }
export interface Line extends Seg { segs: Seg[] }
export function median(values: readonly number[]): number;
export function makeSeg(words: Word[]): Seg;
export function buildLines(words: Word[], tolerance: number): Line[];
/** Palabras con texto, sin rotadas (isRotated), tolerancia 0,5 × mediana de alto (fallback 10). */
export function pageLines(page: BboxPage): Line[];
export function isRotated(w: BboxWord): boolean;
```

Mover el código tal cual (incluido `isRotated`). `extract.ts` importa de `../sara2/lines`. `makeSeg`
usa `normalizePdfText` de `recipe-import/text.ts`: importarlo desde ahí (no copiarlo).

### 5.4 `packages/db/domain/planTemplates.ts` (modificado; consumidor: web; scripts de prueba de db)

```ts
export function listTemplates(params?: { status?: "DRAFT" | "PUBLISHED" }): Promise<{
  id: string; title: string; notes: string | null; status: TemplateStatus; origin: TemplateOrigin; reviewedAt: Date | null;
}[]>;   // where: status si viene; orderBy: [{ status: "asc" }, { title: "asc" }] (DRAFT primero: orden del enum)
export function getTemplate(id: string);   // + include: { sections: { orderBy: { order: "asc" } } }
export class TemplateNotPublishedError extends Error {}   // name = "TemplateNotPublishedError"
/** Rechaza DRAFT (TemplateNotPublishedError). Copia title, notes, comidas, ítems y secciones (title, body, order). */
export async function applyTemplateToPatient(templateId: string, patientId: string);
```

`createTemplate`, `updateTemplate`, `deleteTemplate` y el resto no cambian de firma.

### 5.5 `packages/db/domain/nutritionPlans.ts` (modificado; consumidor: web)

- `getPlan` agrega `sections: { orderBy: { order: "asc" } }` al `include`.
- Sin otros cambios.

### 5.6 `packages/db/domain/planSections.ts` (nuevo; consumidor: web; `index.ts` lo exporta)

```ts
import type { MealOwnerKind } from "./weeklyMenu";
export class PlanSectionNotFoundError extends Error {}
export class PlanSectionLimitError extends Error {}          // > PLAN_SECTION_LIMITS.maxPerOwner
export class PlanSectionInvalidError extends Error { code: "TITLE_REQUIRED" | "TITLE_TOO_LONG" | "BODY_REQUIRED" | "BODY_TOO_LONG" }

export function listSections(kind: MealOwnerKind, ownerId: string): Promise<{ id: string; title: string; body: string; order: number }[]>;
export function addSection(kind: MealOwnerKind, ownerId: string, input: { title: string; body: string }): Promise<{ id: string }>; // order = max+1
export function updateSection(kind: MealOwnerKind, ownerId: string, sectionId: string, input: { title: string; body: string }): Promise<void>;
export function deleteSection(kind: MealOwnerKind, ownerId: string, sectionId: string): Promise<void>;
export function moveSection(kind: MealOwnerKind, ownerId: string, sectionId: string, direction: -1 | 1): Promise<void>; // intercambia order con la vecina; en el borde no hace nada
/** Para "Mover a…" (T19). sectionId null → crea "Texto importado". Usa tx si se pasa. */
export function appendToSection(tx: Prisma.TransactionClient, kind: MealOwnerKind, ownerId: string, sectionId: string | null, text: string): Promise<{ id: string }>;
```

- `kind = "template"` → `planTemplateSection` con `templateId`; `"plan"` → `planSection` con `planId`.
- Toda escritura valida con `validatePlanSectionInput` (core) y filtra por **`{ id: sectionId, <ownerField>: ownerId }`**
  (`updateMany`/`deleteMany`); `count === 0` → `PlanSectionNotFoundError`. Nunca borra por un filtro amplio.
- `appendToSection` corta el cuerpo resultante en 20.000 (si no entra, lanza `PlanSectionInvalidError("BODY_TOO_LONG")`).

### 5.7 `packages/db/domain/planTemplateImport.ts` (nuevo; consumidores: script `plans:import`/`plans:undo` y web; `index.ts` lo exporta)

```ts
import type { PlanImportDraft, RecipeMatchCandidate } from "@nutri-bot/core/plan-import";
import type { TemplateImportHint } from "@nutri-bot/core";

export type UpsertTemplateOutcome = "created" | "updated" | "skipped-reviewed" | "skipped-published";

/** Recetas PUBLISHED para el parser (id, name). */
export function listRecipesForPlanMatching(): Promise<RecipeMatchCandidate[]>;

/**
 * Por importKey. No existe → crea DRAFT + IMPORT con comidas, ítems, secciones e importHints (a cada
 * RECIPE_SUGGESTION le agrega itemId = id real del ítem creado con ese itemRef), todo en una transacción.
 * Existe PUBLISHED → "skipped-published". DRAFT con reviewedAt → "skipped-reviewed". DRAFT sin revisar →
 * en una transacción: updateMany({ where: { id, status: "DRAFT", reviewedAt: null }, data: { title, importHints } })
 * (count 0 → "skipped-reviewed"), luego templateMeal.deleteMany({ where: { templateId: id } }) y
 * planTemplateSection.deleteMany({ where: { templateId: id } }) y se recrean. Nunca toca otra plantilla.
 */
export function upsertImportedTemplate(draft: PlanImportDraft): Promise<{ id: string; outcome: UpsertTemplateOutcome }>;

/** Deshacer una corrida: borra SOLO los ids dados que sigan DRAFT + IMPORT + reviewedAt null. Devuelve cuántos. */
export function deleteUnreviewedTemplateDrafts(ids: readonly string[]): Promise<number>;

/** T10. updateMany where { id, status: "DRAFT", origin: "IMPORT", reviewedAt: null } → reviewedAt = now. */
export function markTemplateReviewed(templateId: string): Promise<void>;

export class TemplateNotPublishableError extends Error { unplaced: number }
export class TemplateHintNotFoundError extends Error {}

/** T12. */
export function publishTemplate(templateId: string): Promise<void>;
/** Saca el aviso (cualquier tipo; para RECIPE_SUGGESTION es "Dejar como texto"). */
export function dismissTemplateHint(templateId: string, hintId: string): Promise<void>;
/** T19. target meal: el weekday tiene que coincidir con el modo de la comida (assertWeekdayMatchesMeal). */
export function resolveUnplacedHint(
  templateId: string,
  hintId: string,
  target: { kind: "meal"; mealId: string; weekday: Weekday | null } | { kind: "section"; sectionId: string | null },
): Promise<void>;
/**
 * "Vincular": el ítem del aviso (itemId) pasa a ser receta con `portions` (normalizePortions, si no
 * → RangeError), customLabel/foodId/quantityGrams/medida = null, misma comida, día y orden. La receta tiene
 * que seguir PUBLISHED (si no, RecipeNotAvailableError de weeklyMenu.ts). Verifica item.meal.templateId.
 */
export function linkHintRecipe(templateId: string, hintId: string, portions: number): Promise<void>;
```

- Las funciones de avisos leen `importHints` con `parseTemplateHints`, modifican y escriben dentro de
  una `$transaction` interactiva (lectura + escritura), y además llaman a `markTemplateReviewed` en la
  misma transacción (T10). Solo operan si la plantilla está en `DRAFT`; si no,
  `TemplateHintNotFoundError`.
- Datos de los ítems creados: `TEXT` → `{ customLabel: label, notes, weekday, order }`; `RECIPE` →
  `{ recipeId, portions, weekday: null, order }`; `foodId`, `quantityGrams` y medida siempre `null`.

### 5.8 Scripts (`packages/db/scripts/plans/`) y `package.json` de `packages/db`

```json
"plans:import": "dotenv -e ../../.env -- tsx scripts/plans/import.ts",
"plans:import:prod": "tsx scripts/plans/import.ts",
"plans:undo": "dotenv -e ../../.env -- tsx scripts/plans/undo.ts",
"plans:undo:prod": "tsx scripts/plans/undo.ts"
```

`scripts/plans/import.ts` (estructura de `scripts/recipes/extract.ts`; reusar su forma de `run`,
`argValues`, `hasFlag` y `confirmWrite` — **copiar** esas 4 funciones chicas sería duplicar: moverlas
a `packages/db/scripts/lib/cli.ts` y que `recipes/extract.ts`, `recipes/import.ts` y `plans/*`
las importen; `target(url)` de `recipes/import.ts` también va ahí como `describeDbTarget`):

- Lee `docs/planes-alimentacion/*.pdf` (o `--file <nombre>`, repetible). Sale con error si no existe la
  carpeta o si `--file` no encuentra nada (mensaje sin el nombre).
- Por PDF: `sha256` de los bytes → `planImportKey`; `pdftotext -bbox` → `parseBboxXhtml` →
  `parsePlanPdf(pages, { importKey, recipes })`.
- **En seco (default):** `recipes = []`, no importa `../../index` ni el dominio. Escribe
  `docs/planes-alimentacion/_importacion/reporte.md` (por PDF: "PDF n", título, comidas con días e ítems,
  secciones con su largo, avisos) y por consola **solo**:
  `PDF: N leídos · M sin formato reconocible` / `Comidas: … · ítems de texto … · recetas … · sugerencias …` /
  `Secciones: … · texto sin ubicar: … · nombres reemplazados: … · líneas de portada descartadas: …` /
  `Reporte: docs/planes-alimentacion/_importacion/reporte.md` / `En seco: no se tocó la base.`
- **`--write`:** `confirmWrite` (exige `DATABASE_URL`; imprime solo `host:port/db`; pide `SI` salvo
  `--yes`). Carga recetas con `listRecipesForPlanMatching`, parsea, `upsertImportedTemplate` por PDF.
  Imprime `PDF n de N: creado (plantilla <id>)` / `actualizado (plantilla <id>)` /
  `ya importado (plantilla <id>)` / `ya revisado: no se pisa (plantilla <id>)` /
  `sin formato reconocible: no se creó nada`, y al final los contadores y
  `Corrida: docs/planes-alimentacion/_importacion/corrida-<ISO>.json (para deshacer: plans:undo)`.
  La corrida: `{ startedAt, target: "host:port/db", createdIds, outcomes: [{ importKey, id, outcome }] }`
  (sin nombres de archivo ni títulos). Se escribe en un `finally` como en recetas.
- Nunca imprime texto del plan, título ni nombre de archivo (T16).

`scripts/plans/undo.ts <corrida.json>`: como `recipes/undo.ts` con `deleteUnreviewedTemplateDrafts`.
Mensaje: `Corrida con N plantillas creadas: B borradas. N−B quedan (revisadas, publicadas o borradas antes).`

## 6. Rutas, server actions y lecturas

### 6.1 Inventario de consumidores y qué cambia

| Lugar | Lee | Cambio |
|---|---|---|
| `(panel)/plantillas/page.tsx` + `templates-table.tsx` | `listTemplates()` | Pasa `status`, `origin`, `reviewedAt`; chip y subtítulo (7.1). Orden por defecto: borradores arriba (`sortValue` = `${status === "DRAFT" ? 0 : 1} ${title}`). |
| `(panel)/plantillas/[id]/page.tsx` | `getTemplate` | Banner, avisos, texto sin ubicar, textos del plan (7.2). Descripción del header: `Plantilla · Borrador · N comidas` si es borrador. Texto del `Card` "Datos de la plantilla": `El título, las notas y los textos se copian al plan cuando la aplicás a un paciente.` |
| `(panel)/pacientes/[id]/page.tsx` → `plans-section.tsx` | `listTemplates()` | **`listTemplates({ status: "PUBLISHED" })`**. `plans-section.tsx` no cambia. |
| `(panel)/pacientes/[id]/planes/actions.ts` (`applyTemplateAction`) | `getTemplate` + `applyTemplateToPatient` | Si `template.status === "DRAFT"` → `{ ok:false, error: PLAN_IMPORT_TEXT.draftNotApplicable }`; además captura `TemplateNotPublishedError` con el mismo texto. |
| `(panel)/pacientes/[id]/planes/[planId]/page.tsx` | `getPlan` | Agrega `<PlanSectionsEditor kind="plan" …>` debajo de `PlanMicronutrientsSection`. |
| `(panel)/pacientes/[id]/planes/[planId]/actions.ts` (`buildAndSavePdf`) | `getPlan` | Pasa `sections: plan.sections.map(({ title, body }) => ({ title, body }))` a `renderPlanPdf`. |
| `(portal)/portal/plan/page.tsx` | `prisma.nutritionPlan.findFirst` | `include.sections: { orderBy: { order: "asc" }, select: { id, title, body } }`; pasa `sections` a `PortalPlanView`. |
| `(portal)/portal/plan/plan-view.tsx` | props | Prop nueva `sections?: { id: string; title: string; body: string }[]`; render 7.4. |
| `lib/plan-pdf.tsx` | `PlanPdfInput` | Campo nuevo `sections?: { title: string; body: string }[]` (opcional: `plan-pdf.test.tsx` actual no cambia); render 7.5. |
| `components/meals-editor.tsx` | `MealView[]` | D10 (T18) y texto largo plegado (7.3). Nada más. |
| `lib/revalidate-menu-owner.ts` | — | Rama `template`: `await markTemplateReviewed(ownerId)` antes de `revalidatePath`. |
| `lib/assistant-tools.ts`, `asistente/*`, `planes/[planId]/ai-actions.ts` | título del plan / comidas de un plan vacío | **Sin cambios.** El asistente no lee plantillas, notas ni secciones; la IA del plan sigue mirando solo `meals` (un plan con secciones y sin ítems sigue mostrando "Armar con IA", y la IA no toca las secciones). |
| `apps/bot/src/**`, `domain/botAi.ts` | — | **Sin cambios.** El bot no lee planes ni plantillas; manda el `pdfData` ya generado. |
| Scripts de prueba de db (`test-weekly-menu.ts`, `test-recipe-picker.ts`, `test-food-measures.ts`) | `createTemplate` / `applyTemplateToPatient` | Sin cambios: `createTemplate` crea `PUBLISHED` por default. |

### 6.2 Server actions nuevas

**`apps/web/src/lib/touch-template.ts`** (`server-only`, no es "use server"):
`export async function touchTemplate(templateId: string): Promise<void>` → `markTemplateReviewed` +
`revalidatePath("/plantillas")` + `revalidatePath(\`/plantillas/${templateId}\`)`. Reemplaza los
`revalidatePath(\`/plantillas/${templateId}\`)` de `plantillas/actions.ts` en `updateTemplateAction`,
`addTemplateMealAction`, `deleteTemplateMealAction`, `addTemplateMealItemAction` (incluida la rama
`measure === "gone"`) y `deleteTemplateMealItemAction`.

**`apps/web/src/app/(panel)/plantillas/import-actions.ts`** ("use server", solo funciones async; los
tipos en `apps/web/src/components/template-import/types.ts`). Todas: `hasPanelSession()` (de
`recetas/recipe-save.ts`) o `{ ok:false, error: sesión vencida }`; zod; log solo con `errorCode(err)`;
devuelven `TemplateImportActionResult = { ok: true } | { ok: false; error: string }`; al terminar
`touchTemplate`.

| Action | Input (zod) | Domain | Errores → texto |
|---|---|---|---|
| `publishTemplateAction` | `{ templateId }` | `publishTemplate` | `TemplateNotPublishableError` → `publishBlocked(n)`; otro → `PLAN_SECTION_TEXT.errors.generic` |
| `dismissTemplateHintAction` | `{ templateId, hintId }` | `dismissTemplateHint` | `TemplateHintNotFoundError` → revalidar y `ok:true` (ya no estaba) |
| `resolveUnplacedHintAction` | `{ templateId, hintId, target: { kind:"meal", mealId, weekday: WEEKDAYS \| null } \| { kind:"section", sectionId: string \| null } }` | `resolveUnplacedHint` | `MealWeekdayMismatchError` → `generic`; `PlanSectionInvalidError` → su texto |
| `linkHintRecipeAction` | `{ templateId, hintId, portions: number().min(0.5).max(4).multipleOf(0.5) }` | `linkHintRecipe` | `RecipeNotAvailableError` → `RECIPE_PICKER_TEXT` existente de receta no disponible (reusar, no crear) |

**`apps/web/src/app/(panel)/plan-section-actions.ts`** ("use server"; mismo patrón que
`weekly-menu-actions.ts`: `kind: "plan" | "template"`, `ownerId`):
`addPlanSectionAction({ kind, ownerId, title, body })`, `updatePlanSectionAction({ kind, ownerId, sectionId, title, body })`,
`deletePlanSectionAction({ kind, ownerId, sectionId })`, `movePlanSectionAction({ kind, ownerId, sectionId, direction })`.
Devuelven `PlanSectionActionResult = { ok: true; id?: string } | { ok: false; error: string; field?: "title" | "body" }`
(tipos en `components/plan-sections/types.ts`). Revalidan con `revalidateMenuOwner(kind, ownerId)`
(que ya marca la plantilla como revisada) y, si `kind === "plan"`, también `revalidatePath("/portal/plan")`.

## 7. Pantallas (skill `ui.txt`: vista, estructura, componentes clave)

Todo con los componentes que ya hay (`components/ui.tsx`: `Card`, `Alert`, `Badge`, `Button`, `Field`,
`Input`, `Textarea`; `components/primitives/{dialog,sheet,dropdown-menu,alert-dialog}`;
`stepper-control.tsx`; `confirm.tsx`; toasts `sonner`). Sin rediseño (es de HU-017e).

### 7.1 Lista de plantillas (`/plantillas`)
- **Estructura:** igual que hoy (PageHeader + Card con DataTable).
- **Componentes:** celda "Plantilla": título + `Badge tone="warning"` `Borrador` si es borrador; si
  `origin === "IMPORT"`, debajo en `text-footnote text-muted-foreground` `Importada de PDF · sin revisar`
  / `· revisada` (según `reviewedAt`; si ya está publicada, solo `Importada de PDF`). Borradores arriba.

### 7.2 Revisión del borrador (`/plantillas/[id]`, misma pantalla)
- **Estructura:** PageHeader (con `Eliminar` de siempre) → si `DRAFT`: bloque de revisión arriba del
  grid → grid de siempre (MealsEditor | "Datos de la plantilla") → Card "Textos del plan" debajo del
  MealsEditor (columna izquierda).
- **Componentes del bloque de revisión** (`components/template-import/template-review.tsx`, client):
  - `Alert tone="warning"` con `banner` + botón primario `Publicar plantilla`
    (`publishTemplateAction`; `loading`; deshabilitado si `unplacedCount > 0`, con `publishBlocked(n)`
    debajo en `aria-describedby`). Al publicar: toast `published` y la página se revalida (el bloque
    desaparece).
  - `<details open>` "Avisos del importador (n)": un renglón por aviso (excepto `UNPLACED`) con
    `templateHintText` y botón ghost `Listo` (`dismissTemplateHintAction`). Para `RECIPE_SUGGESTION`:
    `Vincular` (abre `Dialog` con `linkTitle`, `StepperControl` de porciones 0,5–4 con `formatPortions`,
    default 1, botón `Vincular` → `linkHintRecipeAction`) y `Dejar como texto` (= `dismiss`).
  - Card "Texto sin ubicar" (solo si hay): lista con el texto (`whitespace-pre-line`, `line-clamp-3` +
    `Ver completo`) y `pág. n`; acciones `Mover a…` (`DropdownMenu` → `A una comida` abre `Dialog` con
    `Select` de comida y, si la comida es `PER_DAY`, `Select` de día; `A un texto del plan` abre
    `Dialog` con `Select` de secciones + opción `Texto importado (nuevo)`) y `Descartar` (con `confirm`).
  - Si no es borrador: nada de esto se renderiza.

### 7.3 Editor de comidas (`components/meals-editor.tsx`, plan y plantilla)
- **D10:** si `hasAnyItem(meals) && !hasQuantifiedItems(meals)` → en lugar de `DayTargetStrip` (mismo
  contenedor sticky) un `Alert tone="info"` con `noQuantities(kind)`. El resto igual.
- **Texto largo:** en el `<li>` de ítem de texto (no receta ni medida), el `<p>` del nombre con
  `line-clamp-2`; si el texto supera ~120 caracteres, un botón link `Ver completo` / `Ver menos` que
  alterna el clamp (estado local por ítem; `aria-expanded`). Sin cambios en recetas ni medidas.

### 7.4 Textos del plan (panel: plantilla y plan)
- **Vista:** Card `Textos del plan` con `cardDescription(kind)`
  (`components/plan-sections/plan-sections-editor.tsx`, client; props `{ kind, ownerId, sections }`).
- **Componentes:** lista de tarjetas (título en `text-headline`, cuerpo con `whitespace-pre-line` y
  `line-clamp-4` + `Ver completo`); por tarjeta un `MoreActionsMenu` (`components/more-actions-menu.tsx`)
  con `Editar`, `Subir`, `Bajar`, `Borrar` (`confirm` con `deleteConfirm`). `Editar` y `Agregar texto`
  abren un `Sheet` con `Field` `Título` (`Input`, `maxLength 80`) y `Field` `Texto` (`Textarea`,
  `rows 12`, `maxLength 20000`, contador), botón `Guardar`, errores por campo. Vacío: `EmptyState` con
  `empty` y botón `Agregar texto`. Con 30, el botón se deshabilita con `tooMany`.

### 7.5 Portal y PDF
- **Portal (`plan-view.tsx`):** debajo del menú (después del bloque de días/comidas, antes de lo que
  haya al final), si hay secciones: un `<details>` por sección (estilo del `<details>` de
  `components/recipes/recipe-detail-body.tsx`), `summary` = título (`text-headline`), cuerpo
  `whitespace-pre-line text-body`. Cerradas por defecto.
- **PDF (`plan-pdf.tsx`):** después de `totals` y antes de `Notas`: por sección, `View` con título
  (estilo `notesTitle`, `minPresenceAhead={40}`) y `Text` con el cuerpo (estilo `notes`, se permite
  cortar entre páginas: **sin** `wrap={false}`). Provisional hasta HU-015/HU-017e.

### 7.6 Zona de imleticio (HU-017e / HU-015) — cruce mínimo

HU-017e (`no_afinada`) y HU-015 (sin backlog) son de Leo y tocan las mismas pantallas. Para cruzarse lo
menos posible:
- **Archivos de su zona que esta HU toca (cambios chicos, comentados `HU-020`):**
  `(panel)/plantillas/page.tsx`, `plantillas/templates-table.tsx`, `plantillas/[id]/page.tsx`,
  `components/meals-editor.tsx` (solo el bloque del strip y el `<li>` de texto),
  `(portal)/portal/plan/plan-view.tsx` (solo el bloque de secciones), `lib/plan-pdf.tsx` (solo el bloque
  de secciones), `pacientes/[id]/planes/[planId]/page.tsx` (una línea: el editor de secciones).
- **Todo lo nuevo va en archivos nuevos** que 017e puede restilar sin conflicto:
  `components/template-import/*`, `components/plan-sections/*`, `plantillas/import-actions.ts`,
  `(panel)/plan-section-actions.ts`, `lib/touch-template.ts`.
- **HU-015:** debe usar `PlanSection`/`PlanTemplateSection` para sus "textos editables" (no crear otro
  lugar). El orquestador lo deja escrito en el issue #48 y en el PR.

## 8. Archivos

| Archivo | Acción |
|---|---|
| `packages/db/prisma/schema.prisma` | Modificar (4.1) |
| `packages/db/prisma/migrations/<ts>_plan_template_import/migration.sql` | Crear (`--create-only`, revisar) |
| `packages/core/src/sara2/lines.ts` (+ `lines.test.ts`) | Crear (movido de `extract.ts`) |
| `packages/core/src/recipe-import/extract.ts` | Modificar: importa de `../sara2/lines` |
| `packages/core/src/plan-templates.ts` (+ `.test.ts`) | Crear; exportar en `src/index.ts` |
| `packages/core/src/plan-import/{index,types,sections,personal-data,meal-mapping,menu,recipe-match,parse}.ts` | Crear |
| `packages/core/src/plan-import/__fixtures__/synthetic-plan.ts` | Crear (fixture **inventado**, 11) |
| `packages/core/src/plan-import/{sections,personal-data,meal-mapping,menu,recipe-match,parse}.test.ts` | Crear |
| `packages/core/package.json` | `exports["./plan-import"]` |
| `packages/db/domain/planTemplates.ts` (+ `planTemplates.test.ts`) | Modificar |
| `packages/db/domain/nutritionPlans.ts` | Modificar (`getPlan`) |
| `packages/db/domain/planSections.ts` (+ `.test.ts`) | Crear |
| `packages/db/domain/planTemplateImport.ts` (+ `.test.ts`) | Crear |
| `packages/db/domain/index.ts` | Exportar los dos nuevos |
| `packages/db/domain/weeklyMenu.test.ts` | Ajustar mock de `planTemplate.findUnique` (`status`, `sections: []`) |
| `packages/db/scripts/lib/cli.ts` | Crear (`run`, `argValues`, `hasFlag`, `confirmWrite`, `describeDbTarget` movidos) |
| `packages/db/scripts/recipes/{extract,import}.ts` | Modificar: importan de `../lib/cli` |
| `packages/db/scripts/plans/{import,undo}.ts` | Crear |
| `packages/db/package.json` | 4 scripts npm |
| `apps/web/src/lib/touch-template.ts` | Crear |
| `apps/web/src/lib/revalidate-menu-owner.ts` | Modificar |
| `apps/web/src/app/(panel)/plantillas/actions.ts` | Modificar (`touchTemplate`) |
| `apps/web/src/app/(panel)/plantillas/import-actions.ts` (+ `.test.ts`) | Crear |
| `apps/web/src/app/(panel)/plan-section-actions.ts` (+ `.test.ts`) | Crear |
| `apps/web/src/components/template-import/{types.ts,template-review.tsx,link-recipe-dialog.tsx,move-unplaced-dialog.tsx}` | Crear |
| `apps/web/src/components/plan-sections/{types.ts,plan-sections-editor.tsx,section-sheet.tsx}` (+ `plan-sections-editor.test.tsx`) | Crear |
| `apps/web/src/app/(panel)/plantillas/{page.tsx,templates-table.tsx}` | Modificar |
| `apps/web/src/app/(panel)/plantillas/[id]/page.tsx` | Modificar |
| `apps/web/src/app/(panel)/pacientes/[id]/page.tsx` | Modificar (`listTemplates({ status: "PUBLISHED" })`) |
| `apps/web/src/app/(panel)/pacientes/[id]/planes/actions.ts` | Modificar (`applyTemplateAction`) |
| `apps/web/src/app/(panel)/pacientes/[id]/planes/[planId]/{page,actions}.ts(x)` | Modificar |
| `apps/web/src/components/meals-editor.tsx` | Modificar (7.3) |
| `apps/web/src/app/(portal)/portal/plan/{page,plan-view}.tsx` | Modificar |
| `apps/web/src/lib/plan-pdf.tsx` (+ `plan-pdf.test.tsx`) | Modificar |

**No se crea ni se modifica:** nada en `apps/bot/`, `backlog/`, `docs/planes-alimentacion/` (salvo los
archivos ignorados que genera el script en `_importacion/`).

## 9. Checklist atómico (una tarea = un commit; solo los archivos de la tarea)

### A. `packages/core` (primero: no depende de la base)
- [ ] **A1 — Mover geometría.** Crear `sara2/lines.ts` con `median`, `makeSeg`, `buildLines`,
  `isRotated`, `pageLines` y sus tipos (5.3); `extract.ts` los importa. `npx vitest run packages/core/src/recipe-import` verde **sin tocar sus tests**. `lines.test.ts` (11).
- [ ] **A2 — `plan-templates.ts`** (tipos de avisos, `parseTemplateHints`, `unplacedCount`,
  `canPublishTemplate`, `templateHintText`, límites y `validatePlanSectionInput`, `hasQuantifiedItems`,
  `hasAnyItem`, `PLAN_IMPORT_TEXT`, `PLAN_SECTION_TEXT` con los textos de 5.1.1) + export en `index.ts` + test.
- [ ] **A3 — Fixture anonimizado** `plan-import/__fixtures__/synthetic-plan.ts` (11). Revisar a mano que
  no tenga nada del PDF real (nombre, fecha, matrícula, ni frases copiadas).
- [ ] **A4 — `types.ts`, `sections.ts`** + test.
- [ ] **A5 — `personal-data.ts`** + test.
- [ ] **A6 — `meal-mapping.ts`, `menu.ts`** + tests.
- [ ] **A7 — `recipe-match.ts`** + test.
- [ ] **A8 — `parse.ts` + `index.ts` + `exports["./plan-import"]`** + `parse.test.ts` contra el fixture.

### B. `packages/db`
- [ ] **B1 — Schema + migración.** `git fetch && git rebase origin/develop` antes. `pg_dump` de la base
  de desarrollo **fuera del repo**. Editar `schema.prisma` (4.1); `--create-only --name plan_template_import`;
  revisar el SQL (4.2); `npm run db:migrate`; `npm run db:generate`. Drift → parar y `blocked`.
- [ ] **B2 — `planTemplates.ts`** (5.4) + `nutritionPlans.ts` (5.5) + ajustar mocks de
  `planTemplates.test.ts` y `weeklyMenu.test.ts` + tests nuevos (11).
- [ ] **B3 — `planSections.ts`** (5.6) + export + test.
- [ ] **B4 — `planTemplateImport.ts`** (5.7) + export + test.
- [ ] **B5 — `scripts/lib/cli.ts`** (mover helpers; `recipes/extract.ts` y `recipes/import.ts` los importan;
  `npm run recipes:extract --workspace packages/db -- --file <uno>` en seco sigue igual).
- [ ] **B6 — `scripts/plans/{import,undo}.ts`** + 4 scripts npm (5.8).
- [ ] **B7 — `npm run typecheck`** completo (core, db, **web y bot**): arreglar lo que rompa el cambio de
  tipos de Prisma (p. ej. `listTemplates` con `select`).

### C. `apps/web`
- [ ] **C1 — `touch-template.ts`**, `revalidate-menu-owner.ts` (rama template) y `plantillas/actions.ts`.
- [ ] **C2 — Aplicar solo publicadas:** `pacientes/[id]/page.tsx` y `applyTemplateAction` + test.
- [ ] **C3 — `plan-section-actions.ts`** + tipos + test.
- [ ] **C4 — `components/plan-sections/*`** + montarlo en `/plantillas/[id]` y en el plan + test de componente.
- [ ] **C5 — `import-actions.ts`** + tipos + test.
- [ ] **C6 — `components/template-import/*`** + montarlo en `/plantillas/[id]` (banner, avisos, texto sin
  ubicar, vincular) + header "Borrador".
- [ ] **C7 — Lista:** `plantillas/page.tsx` + `templates-table.tsx` (chip, subtítulo, orden).
- [ ] **C8 — `meals-editor.tsx`:** D10 y texto largo plegado.
- [ ] **C9 — Portal** (`page.tsx`, `plan-view.tsx`) y **PDF** (`plan-pdf.tsx`, `planes/[planId]/actions.ts`) + test de `plan-pdf`.

### D. Prueba real y cierre
- [ ] **D1 — Prueba en desarrollo con el PDF real** (10.1, pasos 3–6): en seco, `--write` contra la base
  **de desarrollo**, revisar en el panel, `plans:undo`. Anotar **solo contadores** en `progress/impl_HU-020.md`.
- [ ] **D2 — Verificación completa** (10.1) y `progress/impl_HU-020.md` con resultado, comandos, el
  recordatorio de migrar Neon antes del merge (10.3) y el aviso a Leo (7.6).

## 10. Verificación

### 10.1 Lo que corre el implementer antes de `done` (desde la raíz)

```bash
npm run db:generate
(cd packages/db && npx dotenv -e ../../.env -- prisma migrate status)   # "Database schema is up to date"
npm run typecheck                       # TODOS los workspaces: core, db, web Y bot
npm run test                            # vitest de todo el monorepo (mocks, sin base ni red)
npx vitest run packages/core/src/sara2 packages/core/src/recipe-import packages/core/src/plan-import packages/core/src/plan-templates.test.ts
npx vitest run packages/db/domain/planTemplates.test.ts packages/db/domain/planSections.test.ts packages/db/domain/planTemplateImport.test.ts packages/db/domain/weeklyMenu.test.ts
npx vitest run "apps/web/src/app/(panel)/plantillas" "apps/web/src/app/(panel)/plan-section-actions.test.ts" apps/web/src/components/plan-sections apps/web/src/lib/plan-pdf.test.tsx
npx vitest run apps/bot                 # el bot comparte los tipos de Prisma: sus tests tienen que seguir verdes
./ops/harness/verify.sh
docker compose exec -T db psql -U nutri -d nutribot -c '\d "PlanTemplate"'   # status/origin NOT NULL con default, importKey, importHints jsonb, reviewedAt
docker compose exec -T db psql -U nutri -d nutribot -c 'select status, origin, count(*) from "PlanTemplate" group by 1,2'   # las previas: PUBLISHED / MANUAL
```

Prueba con el PDF real (D1), **solo contra la base de desarrollo** y sin bot corriendo:

```bash
# 3. En seco: no toca la base. Mirar el reporte (local, ignorado) y que la consola tenga solo contadores.
npm run plans:import --workspace packages/db
# 4. Escribir en desarrollo (pide SI). Anotar el archivo de corrida.
npm run plans:import --workspace packages/db -- --write
# 5. Reimportar: tiene que decir "ya importado"/"actualizado" y no crear otra plantilla.
npm run plans:import --workspace packages/db -- --write --yes
# 6. Revisar en npm run dev → /plantillas (chip Borrador; no aparece en "Aplicar plantilla" de una paciente
#    de prueba). Después deshacer:
npm run plans:undo --workspace packages/db -- docs/planes-alimentacion/_importacion/corrida-<…>.json
```

Si en el paso 6 se publica o se edita el borrador para probar, `plans:undo` ya no lo borra (correcto):
se borra con el botón "Eliminar" de esa plantilla (por id), nunca con un filtro amplio. Si se aplica a
un paciente, que sea **una paciente de prueba creada para eso**, y el plan creado se borra por id desde
su pantalla. Nada del PDF (nombre, texto, título) va a `progress/impl_HU-020.md`, a commits ni al PR:
solo contadores.

### 10.2 Reglas que valen para el implementer

- **Migraciones:** solo `--create-only` + `npm run db:migrate`; nunca `migrate reset`, nunca aceptar el
  reset por drift, nunca `db push`, nunca `DATABASE_URL` como shadow ni `migrate diff --from-migrations`
  contra ella. `pg_dump` antes de aplicar. Drift → `blocked`.
- **Datos de dev:** no modificar plantillas ni planes preexistentes. Lo que cree la prueba se borra por
  id (`plans:undo` o "Eliminar").
- **Datos de la paciente (D12):** el PDF de `docs/planes-alimentacion/` no se copia a ningún archivo del
  repo, ni se pegan fragmentos en tests, fixtures, commits, PR ni `progress/`. El fixture es inventado.
- **WhatsApp:** nada de esta HU encola mensajes; no usar "Enviar por WhatsApp" en la prueba.
- **Producción:** el implementer **no** corre `plans:import:prod` ni migra Neon: lo hace el usuario (10.3).
- No tocar `backlog/`. Un commit por tarea.

### 10.3 Despliegue (producción = `develop` en Vercel + Neon) — pasos manuales del usuario

El build de Vercel **no** migra. La migración es aditiva y compatible con el código viejo:

1. **Antes del merge a `develop`**, aplicar la migración en Neon con la URL *unpooled* de producción
   (el agente no lee valores de producción; el comando lo corre el usuario):
   `cd packages/db && DATABASE_URL="<DATABASE_URL_UNPOOLED de prod>" npx prisma migrate deploy`
   (sin `dotenv`, para no tomar el `.env` local) y confirmar con
   `DATABASE_URL="<…>" npx prisma migrate status`.
2. Merge del PR a `develop` → Vercel publica.
3. Si se mergeara sin migrar, `/plantillas`, la ficha de paciente, el plan y el portal fallan (columnas y
   tablas inexistentes): migrar Neon de inmediato con el paso 1.
4. **Importar en producción** (D3/D4, después del deploy): `pg_dump "<URL unpooled>" -Fc -f ~/respaldos/nutribot-<fecha>.dump`
   (fuera del repo); luego
   `DATABASE_URL="<URL unpooled>" npm run plans:import:prod --workspace packages/db` (seco) y
   `… -- --write` (pide `SI`). Guardar el archivo de corrida (deshacer:
   `DATABASE_URL="<…>" npm run plans:undo:prod --workspace packages/db -- <corrida.json>`). Después de
   importar y de que ella revise, **borrar los PDF** de `docs/planes-alimentacion/` y la carpeta
   `_importacion/` (D12).

Dejarlo escrito en la descripción del PR.

## 11. Tests (vitest, todo con mocks / datos inventados)

### 11.1 Fixture `plan-import/__fixtures__/synthetic-plan.ts`

Arma `BboxPage[]` con el mismo helper de palabras que `recipe-import/__fixtures__/synthetic.ts`
(importar `words`/`page` si se exportan; si no, exportarlos desde ahí en A3 — no duplicar), con
**datos inventados**: portada `PLAN NUTRICIONAL` + tramo a la derecha `Marta, Ejemplar 03/04/25` +
objetivo `Para comer más verduras y moverse más`; pie `Lic. Profesional Inventada M.P 0000` en todas las
páginas; encabezados en letras espaciadas irregulares (`R E C O M E N DAC I O N E S`) y normales;
Recomendaciones (3 párrafos inventados, uno que menciona `Marta`); Alimentos de consumo diario a dos
columnas con subtítulos (`LÁ C T E O S` / `F R U TA S`); Consumo ocasional; Desayuno y merienda con regla
de armado y **dos tandas** (la segunda tanda sin martes); Almuerzo y cena con regla del plato, `Almuerzo:`,
`Cena:`, `Almuerzo y Cena:`, `Cena:Pollo…` (sin espacio), combinación partida en 2 renglones y una con
`ensalada ( zanahoria + repollo)`; Colaciones (`OPCIONES` / `DE COLACIONES`, `Frutas`, `Budín de prueba
(1 porción)`, `Tarta dulce (2 unidades)`, `Galletas de avena (½ porción)`, `Panqueques (2 unidades) con
fruta`); Reemplazos con dos encabezados `REEMPLAZO (…)`; y una página con encabezado `L I S TA D E
C O M P R A S` (desconocido). Variantes exportadas: `scannedPlan` (sin palabras), `noMenuPlan` (solo
recomendaciones), `singleTandaPlan`.

### 11.2 `packages/core`

**`sara2/lines.test.ts`**
- `buildLines` agrupa por `yc` con la tolerancia y corta en tramos con hueco > 1,5 × h (dos columnas → 2 segs).
- Encabezado de letras sueltas con huecos chicos → **un** seg; `pageLines` descarta palabras rotadas y vacías.

**`plan-templates.test.ts`**
- `parseTemplateHints(null)` → `[]`; array con una entrada sin `kind` o con `page` no numérico → se descarta; las válidas pasan.
- `unplacedCount`/`canPublishTemplate`: 0 UNPLACED → true; 3 → false y 3.
- `templateHintText`: textos exactos de 5.1.1 para `TANDAS` (count 2 → "dos"; 3 → "3"), `BREAKFAST_SNACK_SAME_CONTENT`, `RECIPE_SUGGESTION`, `PATIENT_NAME_REPLACED` (1 → "lugar", 2 → "lugares"), `COVER_LINES_DROPPED`, `UNKNOWN_SECTION`, `MISSING_DAYS` (`["TUE"]` → "martes"; `["TUE","SUN"]` → "martes y domingo").
- `validatePlanSectionInput`: título vacío/espacios → `TITLE_REQUIRED`; 81 → `TITLE_TOO_LONG`; cuerpo vacío → `BODY_REQUIRED`; 20.001 → `BODY_TOO_LONG`; trim conserva `\n` internos.
- `hasQuantifiedItems`: solo `customLabel` → false; uno con `foodId` → true; uno con `recipe` → true. `hasAnyItem([])` → false.
- `PLAN_IMPORT_TEXT.publishBlocked(1|3)`, `noQuantities("template"|"plan")`, `notReadable`, `draftNotApplicable` exactos.

**`plan-import/sections.test.ts`**
- `matchSectionHeading`: `"D E S AY U N O Y M E R I E N DA"` → BREAKFAST_SNACK; `"R E C O M E N DAC I O N E S"` → RECOMMENDATIONS; `"ALIMENTOS DE CONSUMO OCASIONAL"` → OCCASIONAL_FOODS; `"ALMUERZO Y CENA"` → LUNCH_DINNER; `"COLACIONES OPCIONALES"` → SNACKS; `"REEMPLAZO (Alimentos ricos en proteínas)"` → REPLACEMENTS; `"Plan nutricional"` → COVER; `"Almuerzo: Bife + arroz"` → null.
- `isHeadingLike`: `"L I S TA D E C O M P R A S"` → true; `"VEGETALES A"` → true; `"Té + tostada integral"` → false.

**`plan-import/personal-data.test.ts`**
- El tramo `Marta, Ejemplar 03/04/25` en portada → descartado; `coverName` = `["Marta", "Ejemplar"]`.
- `Peso: 70 kg` y `Edad: 34` en portada → descartados; `coverLinesDropped` los cuenta.
- `Lic. Profesional Inventada M.P 0000` en cualquier página → descartado (`footerSegments`), `isProfessionalFooter` true; `M.N 1234` también.
- `"Marta puede incorporar colaciones"` fuera de portada → `"[paciente] puede incorporar colaciones"`, `redactions` 1; `"claras de huevo"` con nombre `Clara` → **no** se reemplaza; `"Clara"` con mayúscula → sí.
- El objetivo `Para comer más verduras…` de portada **no** se descarta.

**`plan-import/meal-mapping.test.ts`**
- `mealNameFor("Desayuno", 1, 2)` → `"Desayuno (1)"`; `mealNameFor("Desayuno", 1, 1)` → `"Desayuno"`.
- `MENU_SECTION_MEALS.BREAKFAST_SNACK` → Desayuno y Merienda (nunca "Desayuno y merienda").
- `LUNCH_DINNER_LABELS`: `"Almuerzo y Cena: X"` → LUNCH+DINNER, resto `"X"`; `"Cena:Pollo"` → DINNER, `"Pollo"`; `"Almuerzo : X"` → LUNCH.

**`plan-import/menu.test.ts`**
- `parseWeekdayLine`: `"LUNES"` → MON; `"MIERCOLES"` y `"Miércoles"` → WED; `"SÁBADO"`/`"SABADO"` → SAT; `"LUNES: Té + pan"` → MON con `rest` `"Té + pan"`; `"Lunes a viernes tomar agua"` → null. Regla: el día solo, o el día seguido de `:`; día + espacio + más texto → null (es texto, no un día).
- `isQualitativeMacroLine`: `"Hidratos de carbono (fibra),"` → true; `"proteínas y grasas saludables"` → true; `"Té + tostada"` → false; `"y"` → false.
- `normalizeCombo("Té + tostada integral +queso untable")` → `"Té + tostada integral + queso untable"`; `"ensalada ( repollo +zanahoria)"` → `"ensalada ( repollo + zanahoria)"`.
- Tanda nueva: secuencia MON…SUN, MON → 2 tandas; MON, WED, TUE → 2 tandas.

**`plan-import/recipe-match.test.ts`** (recetas `[{id:"r1",name:"Budín de prueba"},{id:"r2",name:"Tarta dulce"},{id:"r3",name:"Galletas de avena"}]`)
- `"Budín de prueba (1 porción)"` → RECIPE r1, 1. `"budin de PRUEBA"` (sin cantidad) → RECIPE r1, 1.
- `"Galletas de avena (½ porción)"` → RECIPE r3, 0.5; `"(1,5 porciones)"` → 1.5; `"(5 porciones)"` → TEXT + sugerencia r3 (fuera de rango).
- `"Tarta dulce (2 unidades)"` → TEXT + sugerencia r2. `"Panqueques (2 unidades) con fruta"` → TEXT, sin sugerencia. `"Frutas"` → TEXT, sin sugerencia.
- Dos recetas con el mismo nombre normalizado → TEXT + sugerencia de la primera.

**`plan-import/parse.test.ts`** (contra el fixture)
- `planImportKey("a".repeat(64))` → `"pdf-sha256:" + "a"×64`; `"xyz"` → lanza.
- `scannedPlan` → `{ ok:false, reason:"NO_TEXT" }`; `noMenuPlan` → `NO_MENU`.
- Título = `"Para comer más verduras y moverse más"`.
- Comidas en orden: `Desayuno (1)`, `Merienda (1)`, `Desayuno (2)`, `Merienda (2)`, `Almuerzo`, `Cena`, `Colaciones` (el fixture trae 1 tanda de almuerzo); ninguna llamada `"Desayuno y merienda"`.
- `Desayuno (1)` lunes: un `TEXT` con la combinación normalizada y `notes` = línea de macros unida; `Merienda (1)` lunes: **el mismo** texto y nota.
- Día `Almuerzo y Cena: X` → mismo texto en Almuerzo y Cena; `Cena:Pollo…` → en Cena; combinación partida en 2 renglones → un solo ítem.
- `Desayuno (2)`/`Merienda (2)` sin martes → aviso `MISSING_DAYS` con `["TUE"]`.
- Avisos: `TANDAS` (BREAKFAST_SNACK, 2), `BREAKFAST_SNACK_SAME_CONTENT`, `RECIPE_SUGGESTION` para `Tarta dulce (2 unidades)` con `itemRef` que existe en Colaciones, `PATIENT_NAME_REPLACED` (1), `UNKNOWN_SECTION` (`LISTA DE COMPRAS`, su página), y un `UNPLACED` por renglón de esa página; ids `h1…hn` únicos.
- Colaciones: `EVERY_DAY`, `isOptions`, items en el orden del fixture; `Budín de prueba` y `Galletas de avena` son `RECIPE`; el resto `TEXT`; `OPCIONES`/`DE COLACIONES` no aparecen.
- Secciones: `Recomendaciones`, `Alimentos de consumo diario`, `Alimentos de consumo ocasional`, `Cómo armar el plato` (con subtítulos `Desayuno y merienda` y `Almuerzo y cena`), `Reemplazos` (con los dos subtítulos `REEMPLAZO (…)`); consumo diario: la columna izquierda entera antes que la derecha.
- **Garantías:** `JSON.stringify(draft)` no contiene `Marta`, `Ejemplar`, `03/04/25`, `Lic.`, `M.P`; ningún ítem tiene claves `foodId`, `quantityGrams` ni `measure*`.
- Una combinación de 501 caracteres → `UNPLACED`, no ítem. Con `recipes: []`, `Budín de prueba (1 porción)` queda `TEXT` sin sugerencia.

### 11.3 `packages/db` (mock de `../index` con `$transaction` que pasa el mismo objeto como `tx`)

**`planTemplates.test.ts`** (casos nuevos; los existentes con mock `{ …, status: "PUBLISHED", sections: [] }`)
- `listTemplates()` → `findMany` sin `where.status`, `orderBy [{status:"asc"},{title:"asc"}]`, `select` con los 6 campos; `listTemplates({status:"PUBLISHED"})` → `where: { status: "PUBLISHED" }`.
- `applyTemplateToPatient` con `status: "DRAFT"` → `TemplateNotPublishedError`, **sin** `nutritionPlan.create`.
- Copia `sections: { create: [{ title, body, order }] }` en el orden de la plantilla; sin secciones → `create: []`.

**`planSections.test.ts`**
- `addSection("template", "t1", …)` → `planTemplateSection.create` con `templateId: "t1"` y `order` = max+1 (aggregate mock); `kind: "plan"` → `planSection` con `planId`.
- Entrada inválida → `PlanSectionInvalidError` con el código, sin escribir. 30 existentes → `PlanSectionLimitError`.
- `updateSection`/`deleteSection` filtran por `{ id, templateId }`; `count 0` → `PlanSectionNotFoundError`.
- `moveSection` intercambia `order` con la vecina; en el borde no escribe.
- `appendToSection(tx, …, null, "x")` crea `Texto importado`; con id agrega `\n\nx` al cuerpo.

**`planTemplateImport.test.ts`** (draft armado a mano, sin parser)
- No existe → `planTemplate.create` con `status:"DRAFT"`, `origin:"IMPORT"`, `importKey`, comidas con `mode`/`isOptions`, ítems `TEXT` con `customLabel`/`notes`/`weekday`/`order` y `foodId: null`, `quantityGrams: null`; `RECIPE` con `recipeId`/`portions`; secciones; `importHints` con `itemId` resuelto en `RECIPE_SUGGESTION`; outcome `created`.
- Existe `PUBLISHED` → `skipped-published` sin escrituras. `DRAFT` con `reviewedAt` → `skipped-reviewed` sin escrituras. `DRAFT` sin revisar → `updateMany` con `where {id, status:"DRAFT", reviewedAt:null}`, `templateMeal.deleteMany({ where: { templateId: id } })`, recrea; `updateMany.count 0` → `skipped-reviewed` sin borrar.
- `deleteUnreviewedTemplateDrafts(["a","a",""])` → `deleteMany({ where: { id: { in: ["a"] }, status:"DRAFT", origin:"IMPORT", reviewedAt:null } })`; `[]` → 0 sin llamar.
- `markTemplateReviewed` → `updateMany` con el where de T10.
- `publishTemplate` con 2 `UNPLACED` → `TemplateNotPublishableError` (`unplaced` 2) sin update; sin `UNPLACED` → `status:"PUBLISHED"`, `importHints: Prisma.DbNull` (o `JsonNull` según cómo se tipa), `reviewedAt` puesto si era null.
- `dismissTemplateHint` saca solo ese id; id inexistente → `TemplateHintNotFoundError`; plantilla publicada → `TemplateHintNotFoundError`.
- `resolveUnplacedHint` a comida `PER_DAY` con `weekday: null` → `MealWeekdayMismatchError`; a comida OK → crea ítem `customLabel` = texto y borra el aviso en la misma tx; a sección `null` → `appendToSection` con `null`.
- `linkHintRecipe`: receta no publicada → `RecipeNotAvailableError`; ítem de otra plantilla → `TemplateHintNotFoundError`; OK → `templateMealItem.update` con `recipeId`, `portions`, `customLabel:null`, `foodId:null`, `quantityGrams:null` y medida null; `portions 5` → `RangeError`.

### 11.4 `apps/web`

**`plantillas/import-actions.test.ts`**: sin sesión → error de sesión sin llamar al domain;
`publishTemplateAction` ok → `touchTemplate`/`revalidatePath`; `TemplateNotPublishableError(3)` →
`publishBlocked(3)`; `linkHintRecipeAction` con `portions 0.3` → error zod sin domain;
`dismissTemplateHintAction` con `TemplateHintNotFoundError` → `ok: true`.

**`plan-section-actions.test.ts`**: `kind` inválido → error; `PlanSectionInvalidError("TITLE_TOO_LONG")`
→ `{ ok:false, field:"title", error: textos 5.1.1 }`; `kind "plan"` revalida también `/portal/plan`.

**`pacientes/[id]/planes/actions.test.ts`** (crear): `applyTemplateAction` con plantilla `DRAFT` →
`draftNotApplicable` y **no** llama a `applyTemplateToPatient`.

**`components/plan-sections/plan-sections-editor.test.tsx`**: vacío → `empty` + `Agregar texto`; con 30 →
botón deshabilitado con `tooMany`; render de título y cuerpo con saltos de línea.

**`lib/plan-pdf.test.tsx`**: con `sections: [{ title: "Recomendaciones", body: "a\nb" }]` el documento
incluye el título y el cuerpo; sin `sections` sale igual que hoy (los casos existentes no cambian).

## 12. Dudas técnicas

Ninguna bloqueante. Decisiones para mostrarle al usuario (todas ajustables sin migración):
- **T3:** con una sola tanda las comidas van sin número ("Desayuno", no "Desayuno (1)").
- **T16:** la consola dice `ya importado (plantilla <id>)` en vez del título (D12: solo contadores).
- **T18:** el aviso de "sin cantidades" también aparece en el plan de la paciente, no solo en la plantilla.
- **T4 (e):** el nombre se reemplaza solo con mayúscula inicial (evita pisar "clara de huevo"); cada
  reemplazo se avisa.
- **D12/D14:** cuando lleguen más PDF, los ajustes van en `personal-data.ts` (datos personales),
  `sections.ts` (secciones nuevas) y `meal-mapping.ts` (D6), cada uno con su test.
