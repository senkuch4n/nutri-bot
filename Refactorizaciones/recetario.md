# SDD: HU-018a `recetario` (recetas, macros por porción, carga asistida)

HU validada: `docs/hu-plan-recetas-buscador.md` (validada el 2026-10-03). Esta SDD cubre **solo la
parte 018a** (Gherkin "018a — Recetario", "Lista de recetas", "Carga asistida", "Viandas"; Datos
"Receta" e "Ingrediente"; Diseño UX §3). 018b (menú semanal) ya está en `develop`. 018c (buscador
dentro de la comida) y 018d (medidas caseras de alimentos sueltos) quedan **fuera**, salvo lo que
018a deja listo para 018c (sección 13).

Resoluciones que mandan:

| Duda | Cómo se aplica acá |
|---|---|
| D3 = (b) | Todo con atribución: la receta guarda `sourceName` ("Fuente: …") y la foto un `credit` opcional. El texto extraído y las imágenes de terceros van **solo a la base**. En el repo no entra nada de terceros: ni fixtures, ni reportes, ni bundles. El material local queda en `docs/recetarios/`, que está en `.gitignore` |
| D4 | Los macros se calculan siempre desde los ingredientes (SARA 2 o propios). La tabla del recetario se guarda en columnas `published*`, solo para comparar. Si las kcal difieren más de 10 %, aparece un aviso que no bloquea |
| D5 | Carga asistida sin IA: script → borradores → pantalla de revisión. El parser **solo** pone gramos que estén escritos en el texto |
| D6 | Primera tanda de ~40 recetas, que revisa Joel **en desarrollo**. Pasan a producción con un bundle de exportación e importación (sección 8.4), no con un login de Joel en el panel de producción (ver 12-D8) |
| D9 | Las porciones van de ½ en ½, entre 0,5 y 4. Las constantes y el formato están en `packages/core`. Se usan en 018c |
| D10 | Los macros se calculan en vivo y no se guardan. Antes de guardar se avisa "Esta receta está en N planes…" |
| D12 | Tipos, momentos y etiquetas tienen valores fijos: son enums de Postgres, no tablas (12-D2) |
| D18 | Fotos de hasta 5 MB, en JPG, PNG o WebP. Se guardan en WebP reducido (1200×900 y miniatura de 480×360) en una tabla aparte con `Bytes` |
| D19 + D3 | El portal muestra la receta completa con la fuente (eso es de 018c). En 018a ya queda la ruta de la foto del portal, con su autorización |
| D20 | "Reemplazos" y "Conservación…" se excluyen por nombre de archivo. La etiqueta `MEAL_PREP` ("Apta vianda / freezer") se acompaña del campo "Tips y conservación" |

Skills: `migracion-prisma` (sección 3), `ui` y `.claude/skills/apple-design/SKILL.md` (sección 7),
con los primitivos y tokens de HU-017a.

Rama: `feat/hu-018a-recetario`. Ya tiene `develop` adentro (`f9d91b0`, que incluye HU-018b completa).

> **Verificación del architect (2026-10-03, solo lectura).**
> - `origin/develop` = `f9d91b0`, ancestro de `HEAD`. Ninguna rama remota toca
>   `packages/db/prisma` respecto de `develop`.
> - Base de desarrollo (5433, `nutri`/`nutribot`, Postgres 16): última migración aplicada
>   `20261003090223_weekly_menu`, igual a la última carpeta. `Food`: 890 SARA2 y 90 PROPIO.
>   10 `NutritionPlan` y 0 `PlanTemplate`. Solo está la extensión `plpgsql` (no hay `unaccent`), así
>   que la búsqueda sin tildes se hace en la app, como `searchFoods`.
> - Imágenes hoy: `Professional.logoData`/`signatureData` y `DiaryEntry.photoData` son `Bytes`
>   en la fila. Se sirven con route handlers: `api/professional/logo`, `api/diary/[entryId]/photo`
>   para el panel con `auth()`, y `(portal)/portal/diario/photo/[id]` con `getPortalPatient()` y
>   chequeo de dueño. La validación es por magic bytes en `packages/core/src/professional-identity.ts`.
>   La cookie del paciente tiene `path: "/portal"`, así que **toda ruta del portal tiene que vivir
>   bajo `/portal/...`**.
> - `next.config.mjs`: `serverActions.bodySizeLimit = "3mb"`. Una foto de 5 MB no entra (12-D5).
> - `sharp@0.35.4` está instalado (lo traen `next` y `baileys`), pero no lo declara ningún
>   `package.json` del repo. Poppler (`pdftotext`, `pdfimages`, `pdftoppm`) está en `/opt/homebrew/bin`.
> - **Login con Google en producción**: `auth.ts` guarda el `refresh_token` de **quien se
>   loguea** en `Professional.googleRefreshToken`, y el proveedor pide `prompt: "consent"`. Si Joel
>   entrara al panel de producción con su cuenta, la sincronización con Google Calendar quedaría
>   apuntando a su calendario. Por eso la revisión se hace en desarrollo (D6, 8.4, 12-D8).
> - `FoodPicker` (zona de Leo) no está controlado: usa un `<input hidden name>`, no tiene valor
>   inicial ni `onChange`. `FoodCatalogProvider` lleva `{id,name,group,source}`, sin macros.
>   `listFoods` no trae fibra. Ver 7.3 y 12-D6.
> - Del menú semanal (018b): `WeeklyMenuItem.macros: Macros | null`, así que un ítem de receta (018c)
>   solo tiene que aportar sus macros. `MenuItemData` (`weeklyMenu.ts`) y `applyTemplateToPatient`
>   copian los campos de a uno, y 018c tiene que sumarles `recipeId` y `portions` (sección 13).
> - **Muestreo de los recetarios** (`pdftotext -bbox`, `pdfimages -list`, lectura de páginas). Son
>   29 PDF y 5 PPTX, todos los PDF con capa de texto. Formatos que vi:
>   - **F1**: una receta por página. Título grande (la caja de cada palabra mide más de 5 veces el
>     cuerpo), después los títulos "Ingredientes" y "Procedimiento" en horizontal y la tabla
>     nutricional con los nombres en una fila y los valores en otra.
>   - **F2**: los títulos de sección están **rotados**: su caja es muy alta y el orden de lectura
>     de `pdftotext` sale cambiado. Ingredientes y pasos solo se distinguen por la viñeta (`•` y `+`).
>   - **F3**: los ingredientes vienen agrupados en subtítulos ("Base", "Relleno", "Superficie").
>   - **F4**: colaciones en párrafo ("Nombre: descripción… Porción: …"), varias por página y sin
>     lista de ingredientes.
>   - **F5**: páginas que no son recetas (introducción, índice, consejos, "alimentos que…").
>   - Viñetas que aparecen: `× • ॰ > + -`. Hay ligaduras (`ﬁ`) y fracciones (`¾ ½ 1/4`).
>   - Las cantidades vienen en g, cc o caseras, a veces dos en la misma línea ("100 g (3/4 de
>     taza)"), o con "aprox."/"en crudo". La c.n. se escribe "c.n"/"c/n".
>   - Las fotos son JPEG CMYK incrustados. **Las imágenes que `pdfimages` lista para una página
>     incluyen las de recetas vecinas**: la foto de una página aparece también en la siguiente. Por
>     eso no se elige la foto sola: se guardan candidatas y el revisor elige (8.2).
>   - Los archivos `byn` son copias sin imágenes de otros que existen a color.

---

## 1. Resumen funcional

La nutricionista tiene un **recetario** en el panel (`/recetas`). Cada receta guarda nombre, tipo,
momentos del día, rendimiento, porción en medida casera (y opcionalmente en gramos), ingredientes,
preparación, tips y conservación, etiquetas, fuente y foto. Cada ingrediente apunta a un alimento
de la base (SARA 2 o propio) o queda como texto libre, con sus gramos o como "sin cantidad (c.n.)"
y su medida casera en texto. Los **macros de 1 porción se calculan en vivo** desde los ingredientes
(Atwater, como el resto del sistema) y nunca se cargan a mano. La lista es una grilla de tarjetas
con foto, buscador sin tildes (por nombre, ingrediente o etiqueta) y chips de tipo, momento y
etiquetas. Para no tipear ~300 recetas existe la **carga asistida**: un script local lee los PDF
de `docs/recetarios/`, arma **borradores** en la base sin inventar gramos y una pantalla de
revisión los muestra uno por uno, con la página original al lado. Ahí se aceptan los alimentos
sugeridos, se completan los gramos faltantes, se elige la foto y se publica. Las recetas
revisadas en desarrollo se pasan a producción con un bundle de exportación e importación. 018a no
agrega recetas al plan (eso es 018c), pero deja listos la relación ítem ↔ receta en el esquema, el
cálculo por porciones, el conteo de uso y la ruta de la foto del portal con su autorización.

---

## 2. Workspaces afectados

| Workspace | ¿Cambia? | Qué |
|---|---|---|
| `packages/core` | **Sí** | `recipes.ts` (catálogos, macros por porción, porciones de ½, comparación D4, validación para publicar, búsqueda y filtros, textos), `recipe-photo.ts` (magic bytes y tope) y el subpaquete `recipe-import/` (parser del texto extraído, línea de ingrediente, sugerencia de alimento, selección de archivos y bundle). Todo con tests |
| `packages/db` | **Sí** | `schema.prisma` y la migración `recipes`; `domain/recipes.ts`, `domain/recipeImport.ts` y `domain/recipeTransfer.ts`; `media/recipe-photo.ts` (sharp, export nuevo `@nutri-bot/db/media`); scripts `scripts/recipes/*` y `scripts/test-recipes.ts`; `package.json` (dependencia `sharp`, export `./media` y scripts) |
| `apps/web` | **Sí** | `(panel)/recetas/**` (lista, ficha y editor, revisión); `components/recipes/*`; rutas de fotos del panel y del portal; `nav-config.ts` (entrada "Recetas"); `next.config.mjs` (`bodySizeLimit` y `sharp`) |
| `apps/bot` | **No** (solo `typecheck`) | El bot no lee recetas ni ítems del plan: solo usa `NutritionPlan.pdfData`, confirmado en 018b. `domain/index.ts` exporta los módulos nuevos de recetas, que no importan `sharp` (`sharp` vive en `@nutri-bot/db/media`, que el bot no importa). Igual hay que correr `typecheck` en el bot, porque cambian los tipos de `PlanMealItem` y `TemplateMealItem` |

### 2.1 Zona de imleticio (Leo)

- **No se tocan** `alimentos/**`, `food-picker.tsx`, `food-catalog.tsx`, `meals-editor.tsx`,
  `plantillas/**`, `planes/**`, `meal-view.ts`, `plan-pdf.tsx` ni `portal/plan/**`.
- **Solo esquema**: `PlanMealItem` y `TemplateMealItem` suman `recipeId` y `portions`, los dos
  nullable (12-D1), y `Food` suma la relación inversa `recipeIngredients`. No se toca ninguna
  función de su zona.
- **Reuso sin modificar**: `useFoodCatalog`, `FoodCatalogProvider`, `FoodSourceBadge`,
  `KcalBreakdownPopover`, `searchFoods` y `foodSearchText`.
- Hay que avisarle a Leo en el PR: "PlanMealItem/TemplateMealItem tienen `recipeId`/`portions`
  (sin uso hasta 018c); `FoodPicker` no se tocó; hay un combobox controlado nuevo en
  `components/recipes/ingredient-food-picker.tsx` que conviene unificar con el suyo en 017e".

---

## 3. Esquema (Prisma) y migración (skill `migracion-prisma`)

### 3.1 Cambios en `packages/db/prisma/schema.prisma`

Todo lo nuevo va después de `TemplateMealItem`. Los comentarios `///` van tal cual.

```prisma
/// HU-018a: estado de una receta. Solo PUBLISHED aparece en el buscador del plan (018c).
enum RecipeStatus {
  DRAFT
  PUBLISHED
  ARCHIVED
}

/// HU-018a: MANUAL = cargada en el formulario. IMPORT = vino de la carga asistida (fuente obligatoria).
enum RecipeOrigin {
  MANUAL
  IMPORT
}

/// HU-018a (D12): tipo de receta (uno por receta). Valores fijos.
enum RecipeType {
  MAIN_DISH   // Plato principal
  SIDE_DISH   // Guarnición
  SALAD       // Ensalada
  SNACK       // Colación
  BREAKFAST   // Desayuno y merienda
  BREAD_DOUGH // Panes y masas
  DESSERT     // Dulces y postres
}

/// HU-018a: momentos del día de una receta (varios). 018c los infiere del nombre de la comida (D11).
enum RecipeMoment {
  BREAKFAST       // Desayuno
  LUNCH           // Almuerzo
  AFTERNOON_SNACK // Merienda
  DINNER          // Cena
  SNACK           // Colación
}

/// HU-018a (D12, D20): etiquetas fijas.
enum RecipeTag {
  GLUTEN_FREE // Sin TACC
  VEGETARIAN  // Vegetariana
  MEAL_PREP   // Apta vianda / freezer
}

/// HU-018a: imágenes de la carga asistida. PAGE = la página renderizada (columna "Original" de la
/// revisión). CANDIDATE = foto incrustada en esa página, para elegir como foto de la receta.
enum RecipeImportImageKind {
  PAGE
  CANDIDATE
}

/// HU-018a: receta. Los macros NO se guardan: se calculan desde los ingredientes (D4, D10).
model Recipe {
  id                   String         @id @default(cuid())
  name                 String
  status               RecipeStatus   @default(DRAFT)
  origin               RecipeOrigin   @default(MANUAL)
  /// null solo en borradores (validateRecipeForPublish lo exige para publicar).
  type                 RecipeType?
  moments              RecipeMoment[] @default([])
  tags                 RecipeTag[]    @default([])
  /// Cuántas porciones rinde la receta (> 0, 1 decimal). null solo en borradores.
  yieldPortions        Decimal?       @db.Decimal(5, 1)
  /// "¾ albóndigas", "1/4 de tarta". Lo que ve el paciente. null solo en borradores.
  portionHousehold     String?
  /// Referencia opcional; el paciente no lo ve (D9).
  portionGrams         Decimal?       @db.Decimal(7, 2)
  preparation          String?
  /// "Tips y conservación" (D20: la nota de conservación de las viandas va acá).
  tips                 String?
  /// "Nutriarte — Almuerzos y cenas 2". Se muestra como "Fuente: …" (D3). Obligatoria si origin = IMPORT.
  sourceName           String?
  /// D4: tabla nutricional publicada por la fuente, por porción. Solo para comparar.
  publishedPortionText String?
  publishedKcal        Decimal?       @db.Decimal(7, 2)
  publishedProteinG    Decimal?       @db.Decimal(6, 2)
  publishedCarbsG      Decimal?       @db.Decimal(6, 2)
  publishedFatG        Decimal?       @db.Decimal(6, 2)
  publishedFiberG      Decimal?       @db.Decimal(6, 2)
  /// Carga asistida: "almuerzos-y-cenas-2:p7:albondigas de lentejas" (recipeImportKey de core).
  /// Hace idempotente la extracción y el pase a producción.
  importKey            String?        @unique
  importFile           String?
  importPage           Int?
  /// Texto de la página tal como salió de pdftotext. Dato de terceros: solo en la base (D3).
  importRawText        String?
  /// RecipeImportHints de core (texto de rinde y porción, línea de autor, avisos del parser).
  importHints          Json?
  /// Primera vez que se guardó desde la revisión. Desde ahí la extracción no pisa el borrador.
  reviewedAt           DateTime?
  publishedAt          DateTime?
  createdAt            DateTime       @default(now())
  updatedAt            DateTime       @updatedAt

  ingredients   RecipeIngredient[]
  photo         RecipePhoto?
  importImages  RecipeImportImage[]
  planItems     PlanMealItem[]
  templateItems TemplateMealItem[]

  @@index([status, name])
}

/// HU-018a: ingrediente. Con alimento suma macros si tiene gramos; sin alimento es texto libre.
model RecipeIngredient {
  id         String   @id @default(cuid())
  recipe     Recipe   @relation(fields: [recipeId], references: [id], onDelete: Cascade)
  recipeId   String
  order      Int
  /// Sin cascada, como PlanMealItem: los alimentos no se borran, se dan de baja.
  food       Food?    @relation(fields: [foodId], references: [id])
  foodId     String?
  /// Cómo se lee en la receta ("Puré de calabaza"). Obligatorio si no hay alimento; si hay, opcional
  /// (vacío = nombre del alimento).
  label      String?
  /// null = sin gramos (o c.n. si noQuantity). Nunca se completa solo (D5).
  grams      Decimal? @db.Decimal(7, 2)
  /// "Sin cantidad (c.n.)": no suma macros y no se le piden gramos.
  noQuantity Boolean  @default(false)
  /// Medida casera en texto: "1 taza", "2 cdas".
  household  String?
  /// Carga asistida: la línea original ("Lentejas 500g"). Dato de terceros: solo en la base.
  rawText    String?

  @@index([recipeId, order])
  @@index([foodId])
}

/// HU-018a (D18): foto de la receta, 1:1. WebP ya reducida. Se reemplaza borrando y creando, así
/// el id cambia y la URL /api/recetas/fotos/<id> se puede cachear como inmutable.
model RecipePhoto {
  id        String   @id @default(cuid())
  recipe    Recipe   @relation(fields: [recipeId], references: [id], onDelete: Cascade)
  recipeId  String   @unique
  /// WebP, máx. 1200×900 (4:3).
  data      Bytes
  /// WebP 480×360 (4:3): tarjetas y miniaturas.
  thumbData Bytes
  mimeType  String   @default("image/webp")
  byteSize  Int
  /// "Foto: Nutrispace". Opcional; se muestra junto a la fuente (D3).
  credit    String?
  createdAt DateTime @default(now())
}

/// HU-018a: imágenes de la carga asistida (página renderizada y fotos candidatas). Se borran al
/// publicar. Dato de terceros: solo en la base (D3).
model RecipeImportImage {
  id        String                @id @default(cuid())
  recipe    Recipe                @relation(fields: [recipeId], references: [id], onDelete: Cascade)
  recipeId  String
  kind      RecipeImportImageKind
  order     Int
  /// PAGE: WebP de hasta 1000 px de ancho. CANDIDATE: WebP 1200×900, ya procesada como RecipePhoto.
  data      Bytes
  /// Solo CANDIDATE: WebP 480×360.
  thumbData Bytes?
  width     Int
  height    Int

  @@index([recipeId, kind, order])
}
```

Cambios en modelos existentes (aditivos):

```prisma
model Food {
  // … sin cambios en los campos …
  planItems         PlanMealItem[]
  templateItems     TemplateMealItem[]
  recipeIngredients RecipeIngredient[]   // HU-018a
}

model PlanMealItem {
  // … campos actuales sin cambios …
  /// HU-018a (para 018c): ítem de receta. Con recipeId, foodId y quantityGrams quedan null.
  /// Restrict: una receta usada en un plan no se puede borrar (se archiva).
  recipe        Recipe?   @relation(fields: [recipeId], references: [id], onDelete: Restrict)
  recipeId      String?
  /// HU-018a (D9): porciones de la receta, pasos de ½ entre 0,5 y 4. null si no es receta.
  portions      Decimal?  @db.Decimal(3, 1)

  @@index([mealId, order])
  @@index([recipeId])
}

model TemplateMealItem {
  // … ídem PlanMealItem: recipe/recipeId (onDelete: Restrict), portions, @@index([recipeId]) …
}
```

Invariantes que garantiza el dominio, no la base (mismo criterio que `isOptions` en 018b):
- Un ítem con `recipeId` tiene `foodId = null`, `quantityGrams = null` y `portions` válido. Esto lo hace cumplir 018c.
- Una receta `PUBLISHED` cumple `validateRecipeForPublish`.

### 3.2 Migración

Nombre: **`recipes`**. Desde `packages/db`:

```bash
npx dotenv -e ../../.env -- prisma migrate dev --create-only --name recipes
```

Lo que **tiene** que tener el `migration.sql` generado (revisarlo antes de aplicar):

- `CREATE TYPE` × 6: `RecipeStatus`, `RecipeOrigin`, `RecipeType`, `RecipeMoment`, `RecipeTag`,
  `RecipeImportImageKind`.
- `CREATE TABLE` × 4: `Recipe`, `RecipeIngredient`, `RecipePhoto` y `RecipeImportImage`.
  `moments` y `tags` quedan como `"RecipeMoment"[] NOT NULL DEFAULT ARRAY[]::"RecipeMoment"[]`
  (lo mismo con `RecipeTag`). Son tablas nuevas y vacías, así que el `NOT NULL` no necesita backfill.
- `ALTER TABLE "PlanMealItem" ADD COLUMN "recipeId" TEXT, ADD COLUMN "portions" DECIMAL(3,1)`, y lo
  mismo en `"TemplateMealItem"`. Las dos columnas son **nullable y sin default**. Las filas
  existentes quedan en `NULL`, que es exactamente lo que significa "no es receta".
- `CREATE UNIQUE INDEX` `Recipe_importKey_key` y `RecipePhoto_recipeId_key`. Índices
  `Recipe_status_name_idx`, `RecipeIngredient_recipeId_order_idx`, `RecipeIngredient_foodId_idx`,
  `RecipeImportImage_recipeId_kind_order_idx`, `PlanMealItem_recipeId_idx` y
  `TemplateMealItem_recipeId_idx`.
- FKs: `RecipeIngredient.recipeId` (CASCADE), `RecipeIngredient.foodId` (SET NULL, el default de
  Prisma para relaciones opcionales, igual que `PlanMealItem.foodId`), `RecipePhoto.recipeId` y
  `RecipeImportImage.recipeId` (CASCADE), y `PlanMealItem.recipeId` / `TemplateMealItem.recipeId`
  (**RESTRICT**).

Lo que **no** puede aparecer: ningún `DROP`, ningún `ALTER COLUMN` sobre columnas existentes,
ningún cambio en tablas que no sean las de arriba. Si aparece algo de eso, parar y reportar
`blocked`, porque sería drift o un rename mal interpretado.

### 3.3 Respaldo y orden de aplicación (dev)

1. `git fetch && git log origin/develop -1`: confirmar que nadie mergeó otra migración (regla
   del equipo: una sola HU con `schema.prisma` en `implementando`).
2. `npx dotenv -e ../../.env -- prisma migrate status` (desde `packages/db`): tiene que decir
   "Database schema is up to date". Si hay drift, `blocked`.
3. Respaldo **fuera del repo**:
   `docker compose exec -T db pg_dump -U nutri -d nutribot -Fc > ~/nutribot-backups/pre-recipes-$(date +%Y%m%d-%H%M).dump`
4. Conteo antes: `select count(*) from "PlanMealItem"; select count(*) from "TemplateMealItem"; select count(*) from "Food";`.
5. `--create-only`, revisar el SQL según 3.2, `npm run db:migrate` y `npm run db:generate`.
6. Conteo después: tiene que dar igual. `select count(*) from "PlanMealItem" where "recipeId" is not null` tiene que dar 0.

### 3.4 Prohibido (skill y `AGENTS.md`)

`prisma migrate reset`, aceptar el reset de `migrate dev`, `prisma db push`, pasar la base de
desarrollo como `--shadow-database-url` y `migrate diff --from-migrations` contra ella. Tampoco se
edita una migración ya aplicada.

### 3.5 Producción

`prisma migrate deploy` (README, "Despliegue"). Es una migración aditiva, sin backfill.

---

## 4. Contrato compartido: `packages/core`

Todo es puro: nada de base, red ni `sharp`. Lo consumen `packages/db` (domain y scripts) y `apps/web`.
018c reusa lo marcado con **(018c)**.

### 4.1 `packages/core/src/recipes.ts` (nuevo; exportado desde `index.ts`)

```ts
import type { Macros, FoodMacros, AtwaterBreakdown } from "./nutrition";
import type { FoodGroupKey } from "./food-groups";

// ── Catálogos fijos (D12) ── mismas claves que los enums de Prisma
export const RECIPE_TYPES = ["MAIN_DISH","SIDE_DISH","SALAD","SNACK","BREAKFAST","BREAD_DOUGH","DESSERT"] as const;
export type RecipeTypeKey = (typeof RECIPE_TYPES)[number];
export const RECIPE_TYPE_LABELS: Record<RecipeTypeKey, string>;
//   Plato principal · Guarnición · Ensalada · Colación · Desayuno y merienda · Panes y masas · Dulces y postres
export const RECIPE_MOMENTS = ["BREAKFAST","LUNCH","AFTERNOON_SNACK","DINNER","SNACK"] as const;
export type RecipeMomentKey = (typeof RECIPE_MOMENTS)[number];
export const RECIPE_MOMENT_LABELS: Record<RecipeMomentKey, string>;
//   Desayuno · Almuerzo · Merienda · Cena · Colación
export const RECIPE_TAGS = ["GLUTEN_FREE","VEGETARIAN","MEAL_PREP"] as const;
export type RecipeTagKey = (typeof RECIPE_TAGS)[number];
export const RECIPE_TAG_LABELS: Record<RecipeTagKey, string>;
//   Sin TACC · Vegetariana · Apta vianda / freezer
export type RecipeStatusKey = "DRAFT" | "PUBLISHED" | "ARCHIVED";
export const RECIPE_STATUS_LABELS: Record<RecipeStatusKey, string>; // Borrador · Publicada · Archivada

// ── Macros por porción (D4) ──
export interface RecipeIngredientForMacros {
  label: string | null;
  grams: number | null;
  noQuantity: boolean;
  food: (FoodMacros & { name: string; group: FoodGroupKey }) | null;
}
export interface RecipeMacroResult {
  /** Suma de los ingredientes con alimento y gramos > 0 (sin redondear por ítem; redondeo final a 1 decimal). */
  total: Macros;
  /** total / yieldPortions, a 1 decimal. null si yieldPortions no es > 0. */
  perPortion: Macros | null;
  /** Desglose de Atwater de 1 porción (P×4, CHO×4, G×9). totalKcal = perPortion.kcal. null si perPortion es null. */
  atwaterPerPortion: AtwaterBreakdown | null;
  /** Suma de los gramos de todos los ingredientes (con o sin alimento) / rendimiento. Pista para "pesa ~X g". */
  estimatedPortionGrams: number | null;
  /** Ingredientes marcados c.n. ("Perejil", "Aceite de oliva"). caloric = los de los grupos de CALORIC_FOOD_GROUPS. */
  noQuantity: { names: string[]; caloricNames: string[] };
  /** Con alimento, sin gramos y sin c.n.: lo que dejó la carga asistida sin completar. Bloquea publicar. */
  missingGrams: { names: string[] };
  /** Sin alimento (texto libre): no suman. */
  freeText: { names: string[] };
}
export const CALORIC_FOOD_GROUPS: readonly FoodGroupKey[]; // ["ACEITES","GRASAS","AZUCARES_MERMELADAS_Y_DULCES"]
export function ingredientDisplayName(i: { label: string | null; food: { name: string } | null }): string;
//   label si tiene texto; si no, el nombre del alimento hasta la primera coma ("Lentejas, secas, crudas" → "Lentejas").
export function computeRecipeMacros(
  ingredients: readonly RecipeIngredientForMacros[],
  yieldPortions: number | null,
): RecipeMacroResult;
/** Avisos de la ficha, en orden: missingGrams, noQuantity, freeText, sin rendimiento (textos en RECIPE_TEXT). */
export function recipeMacroWarnings(r: RecipeMacroResult, yieldPortions: number | null): string[];

// ── Porciones (D9) ── (018c)
export const PORTION_STEP = 0.5;
export const PORTION_MIN = 0.5;
export const PORTION_MAX = 4;
/** Valor válido (múltiplo de 0,5 en [0,5; 4]) o null. Acepta números con error de coma flotante (1.4999999 → 1.5). */
export function normalizePortions(value: number): number | null;
/** +½ / −½ con tope en los extremos. */
export function stepPortions(current: number, direction: 1 | -1): number;
/** "½ porción", "1 porción", "1½ porciones", "2 porciones", "3½ porciones". */
export function formatPortions(portions: number): string;
export function scaleMacros(m: Macros, factor: number): Macros; // cada campo × factor, 1 decimal
/** Macros de un ítem de receta (018c): perPortion × portions. null si perPortion es null. */
export function recipeItemMacros(perPortion: Macros | null, portions: number): Macros | null;

// ── Comparación con la tabla del recetario (D4) ──
export const PUBLISHED_MACROS_TOLERANCE = 0.1;
export interface PublishedMacros { kcal: number | null; protein: number | null; carbs: number | null; fat: number | null; fiber: number | null }
export function compareWithPublished(
  calculated: Macros | null,
  published: PublishedMacros | null,
): { kcalDiffRatio: number | null; exceeds: boolean; message: string | null };
//   ratio = |calc − pub| / pub (solo kcal; pub ≤ 0 o null → null). exceeds = ratio > 0,10.
//   message (solo si exceeds): "El recetario dice 262 kcal; con los ingredientes da 305 kcal" (kcal sin decimales, es-AR).

// ── Validación para publicar ──
export interface RecipePublishCheck {
  name: string; type: RecipeTypeKey | null; moments: readonly RecipeMomentKey[];
  yieldPortions: number | null; portionHousehold: string | null;
  origin: "MANUAL" | "IMPORT"; sourceName: string | null;
  ingredients: readonly { foodId: string | null; label: string | null; grams: number | null; noQuantity: boolean }[];
}
export type RecipeField = "name" | "type" | "moments" | "yieldPortions" | "portionHousehold" | "ingredients" | "sourceName";
export type RecipePublishIssue =
  | { field: RecipeField; message: string }
  | { field: "ingredient"; index: number; message: string };
export function validateRecipeForPublish(r: RecipePublishCheck): RecipePublishIssue[];
//   Reglas (en este orden), con los mensajes de RECIPE_TEXT:
//   name trim ≠ "" (≤ 120) · type ≠ null · moments ≥ 1 · yieldPortions > 0 y ≤ 999 · portionHousehold trim ≠ "" (≤ 80)
//   · ingredients ≥ 1 · cada ingrediente: (foodId o label) · con foodId: grams > 0 o noQuantity
//   · grams, si viene, en (0, 99999] · origin IMPORT → sourceName trim ≠ "".

// ── Búsqueda y filtros (lista y 018c) ──
/** foodSearchText de: nombre + label y nombre del alimento de cada ingrediente + etiquetas de los tags. */
export function recipeSearchText(input: { name: string; ingredientNames: readonly string[]; tags: readonly RecipeTagKey[] }): string;
export interface RecipeFilters { query: string; type: RecipeTypeKey | null; moment: RecipeMomentKey | null; tags: readonly RecipeTagKey[] }
export const EMPTY_RECIPE_FILTERS: RecipeFilters;
export function hasActiveRecipeFilters(f: RecipeFilters): boolean;
/** Chips con AND (los tags también), después searchFoods(cards, query) para ordenar por relevancia.
 *  Sin consulta: orden alfabético (es). */
export function filterRecipes<T extends { name: string; searchText: string; type: RecipeTypeKey | null; moments: readonly RecipeMomentKey[]; tags: readonly RecipeTagKey[] }>(
  cards: readonly T[], filters: RecipeFilters,
): T[];
/** "Mostrando 24 de 186 recetas" | "186 recetas" | "1 receta". */
export function recipeCountText(shown: number, total: number, filtered: boolean): string;

// ── Uso en planes (D10) ──
/** "Esta receta está en 3 planes y 1 plantilla. Sus totales van a cambiar." · null si plans + templates = 0. */
export function recipeUsageWarning(u: { plans: number; templates: number }): string | null;

export const RECIPE_TEXT: { /* ver 4.4 */ };
```

### 4.2 `packages/core/src/recipe-photo.ts` (nuevo; exportado desde `index.ts`)

```ts
export const RECIPE_PHOTO_MAX_BYTES = 5 * 1024 * 1024; // 5 MB inclusive (D18)
export type RecipePhotoMime = "image/jpeg" | "image/png" | "image/webp";
/** Magic bytes: JPEG FF D8 FF · PNG 89 50 4E 47 0D 0A 1A 0A · WebP "RIFF" ???? "WEBP". Otro → null. */
export function detectRecipePhotoMime(bytes: Uint8Array): RecipePhotoMime | null;
/** Pre-chequeo sin leer el archivo (cliente y action). ≤ 0 o > tope → RECIPE_TEXT.photoInvalid. */
export function recipePhotoSizeError(size: number): string | null;
/** Orden: vacío → tamaño → tipo. */
export function validateRecipePhoto(bytes: Uint8Array): { ok: true; mimeType: RecipePhotoMime } | { ok: false; error: string };
/** Medidas de lo que se guarda. */
export const RECIPE_PHOTO_SIZES = { full: { width: 1200, height: 900 }, thumb: { width: 480, height: 360 } } as const;
```

`detectSignatureImageMime` no se toca: la firma sigue aceptando solo PNG y JPG, porque son los
formatos que dibuja react-pdf.

### 4.3 `packages/core/src/recipe-import/` (nuevo subpaquete; export `@nutri-bot/core/recipe-import`) — 018a-2

Va como subpaquete, igual que `sara2`, para no sumar el parser al bundle del cliente salvo en la
pantalla de revisión. Hay que agregar `"./recipe-import": "./src/recipe-import/index.ts"` en
`packages/core/package.json` (`exports`).

```ts
// text.ts
/** NFKC (ligaduras ﬁ→fi), comillas y guiones tipográficos a ASCII, espacios colapsados. */
export function normalizePdfText(s: string): string;
export const BULLETS: readonly string[]; // ["×","•","॰",">","+","-","–","*","·"]
export function stripBullet(line: string): { bullet: string | null; text: string };

// ingredient-line.ts
export type IngredientLineFlag =
  | "HOUSEHOLD_ONLY"     // solo medida casera ("una taza"): grams null, hay que completarlo
  | "VOLUME_ONLY"       // solo cc/ml: no se convierte a gramos (D5)
  | "APPROX"            // "aprox." / "en crudo" / "en cocido" junto a los gramos
  | "AMBIGUOUS_GRAMS"   // dos o más cantidades en g distintas: grams null
  | "MULTI_FOOD";       // "Una cebolla y morrón picados", "sal y pimienta": probablemente son dos ingredientes
export interface ParsedIngredientLine {
  rawText: string;           // la línea original, ya normalizada y sin viñeta
  label: string;             // el texto sin la cantidad en g ni la medida casera ("Lentejas", "Puré de calabaza")
  grams: number | null;      // SOLO de un token explícito "500g", "100 g", "1,5 kg", "1.5kg" (kg × 1000)
  household: string | null;  // "una taza", "2 cditas", "¾ de pocillo de café", "una unidad", "media palta"
  noQuantity: boolean;       // "c.n", "c/n", "cantidad necesaria", "a gusto"
  flags: IngredientLineFlag[];
}
export function parseIngredientLine(raw: string): ParsedIngredientLine;

// extract.ts
export interface RecipeImportHints {
  yieldText: string | null;          // "Rinde para 8 personas aprox." / "16 unidades"
  portionText: string | null;        // "¾ albóndigas", "3 unidades"
  authorLine: string | null;         // la línea del pie con "Lic." / "MN" / "MP" si aparece
  format: "F1" | "F2" | "F4";        // con qué estrategia se armó (sección 8.1)
  warnings: string[];                // "Título partido en 3 renglones", "Ingredientes sin título de sección"…
  ingredientFlags: IngredientLineFlag[][]; // en el mismo orden que ingredients
}
export interface RecipeImportDraft {
  importKey: string; file: string; page: number;
  name: string;
  yieldPortions: number | null;      // solo si el texto trae un número de porciones/personas ("8"); "16 unidades" → null
  portionHousehold: string | null;   // = hints.portionText
  ingredients: ParsedIngredientLine[];
  preparation: string | null;        // pasos unidos con "\n", sin viñetas
  tips: string | null;
  published: { portionText: string | null; kcal: number | null; protein: number | null; carbs: number | null; fat: number | null; fiber: number | null } | null;
  suggestedType: string | null;      // RecipeTypeKey sugerido por el nombre del archivo (sección 8.1)
  suggestedMoments: string[];        // RecipeMomentKey[]
  suggestedSourceName: string;       // "Nutriarte — Almuerzos y cenas 2" (8.1)
  rawText: string;                   // texto de la página en orden de lectura
  hints: RecipeImportHints;
}
export interface RecipeExtractionResult {
  drafts: RecipeImportDraft[];
  skippedPages: { page: number; reason: "NO_RECIPE" | "INDEX" | "CONTINUATION_UNMERGED" | "EMPTY" }[];
}
/** pages = parseBboxXhtml(pdftotext -bbox) de sara2/bbox.ts (se reusa tal cual). */
export function extractRecipesFromPages(pages: readonly BboxPage[], ctx: { file: string }): RecipeExtractionResult;
/** "<archivo-normalizado>:p<página>:<foodSearchText(nombre)>". El archivo se normaliza sin extensión ni
 *  sufijos " (1)", "_compressed", " byn", y pasa por foodSearchText con "-" en vez de espacios. */
export function recipeImportKey(file: string, page: number, name: string): string;

// files.ts
/** D20: "reemplazos", "conservacion" (sin tildes ni mayúsculas) → excluido. PPTX → excluido (bancos de imágenes). */
export function isExcludedRecipeFile(fileName: string): { excluded: boolean; reason: string | null };
/** Saca los "byn" que tienen versión a color (mismo nombre normalizado); un "byn" sin versión a color se queda. */
export function pickRecipeFiles(fileNames: readonly string[]): { use: string[]; skipped: { file: string; reason: string }[] };
/** Tipo y momentos sugeridos por el nombre del archivo (tabla de 8.1). */
export function suggestFromFileName(fileName: string): { type: string | null; moments: string[]; title: string };

// food-suggest.ts
export interface SuggestableFood { id: string; name: string; searchText: string; source: "SARA2" | "PROPIO"; active: boolean }
/** Sugerencia para la revisión. NUNCA se guarda sola: la tiene que aceptar una persona. */
export function suggestFood(label: string, foods: readonly SuggestableFood[]): { foodId: string; matchedQuery: string } | null;
//   1) label → foodSearchText, sin palabras vacías (de, del, la, el, una, un, picado/a(s), rallado/a(s),
//      chico/a, grande(s), mediano/a(s), fresco/a, opcional, optativo…) y sin lo que va entre paréntesis.
//   2) sinónimos (RECIPE_FOOD_SYNONYMS: calabaza→zapallo, morron→pimiento, choclo→maiz, palta→palta,
//      zapallito→zapallito, ricota→ricota, frutillas→frutilla…; lista chica, versionada, sin datos de terceros).
//   3) searchFoods(activos, consulta completa); si no hay, primeras 2 palabras; si no, la primera.
//   4) a igual ranking, SARA2 antes que PROPIO. null si no hay ninguna coincidencia.
export const RECIPE_FOOD_SYNONYMS: Readonly<Record<string, string>>;

// bundle.ts (pase a producción, 8.4)
export const RECIPE_BUNDLE_FORMAT = 1;
export interface RecipeBundleIngredient {
  order: number; label: string | null; grams: number | null; noQuantity: boolean; household: string | null; rawText: string | null;
  food: { sourceKey: string } | { ownName: string; per100: { kcal: number; protein: number; carbs: number; fat: number; fiber: number } } | null;
}
export interface RecipeBundleRecipe {
  importKey: string; name: string; origin: "IMPORT" | "MANUAL"; type: string; moments: string[]; tags: string[];
  yieldPortions: number; portionHousehold: string; portionGrams: number | null;
  preparation: string | null; tips: string | null; sourceName: string | null;
  published: RecipeImportDraft["published"]; importFile: string | null; importPage: number | null;
  ingredients: RecipeBundleIngredient[];
  photo: { dataBase64: string; thumbBase64: string; credit: string | null } | null;
}
export interface RecipeBundle { format: 1; exportedAt: string; recipes: RecipeBundleRecipe[] }
export function validateRecipeBundle(json: unknown): { ok: true; bundle: RecipeBundle } | { ok: false; errors: string[] };
```

`BboxPage` y `parseBboxXhtml` se importan desde `../sara2/bbox` sin modificarlos.

### 4.4 Textos (`RECIPE_TEXT` en `recipes.ts`), exactos

| Clave | Texto |
|---|---|
| `warnNoQuantityOne` | `1 ingrediente sin cantidad: no suma a los macros` |
| `warnNoQuantityMany` | `{n} ingredientes sin cantidad: no suman a los macros` |
| `warnNoQuantityCaloric` | `{nombres} sin cantidad: {calóricos en minúscula} puede sumar muchas kcal` (`pueden` si son varios). Ejemplo: `Perejil y aceite de oliva sin cantidad: aceite de oliva puede sumar muchas kcal`. Las listas se unen con "," e "y" |
| `warnFreeText` | `Hay ingredientes sin alimento asociado: los macros están incompletos` |
| `warnMissingGrams` | `Falta el gramo de {n} ingrediente(s): completalo o marcá «Sin cantidad (c.n.)».` |
| `warnNoYield` | `Cargá cuántas porciones rinde para ver los macros de 1 porción.` |
| `publishedDiff` | `El recetario dice {pub} kcal; con los ingredientes da {calc} kcal` |
| `usage` | `Esta receta está en {3 planes}{ y }{1 plantilla}. Sus totales van a cambiar.` (singular y plural; se omite la parte que es 0) |
| `errName` | `Poné el nombre de la receta.` |
| `errType` | `Elegí el tipo de receta.` |
| `errMoments` | `Elegí al menos un momento del día.` |
| `errYield` | `Cargá cuántas porciones rinde.` |
| `errPortion` | `Contá cuánto es 1 porción, por ejemplo «¾ albóndigas».` |
| `errIngredients` | `Agregá al menos un ingrediente.` |
| `errIngredientEmpty` | `Elegí un alimento o escribí el ingrediente.` |
| `errIngredientGrams` | `Cargá los gramos o marcá «Sin cantidad (c.n.)».` |
| `errSource` | `Cargá la fuente: el paciente la ve junto a la receta.` |
| `photoInvalid` | `La foto tiene que ser JPG, PNG o WebP y pesar menos de 5 MB.` |
| `photoSaveError` | `No se pudo guardar la foto. Probá de nuevo.` |
| `saved` | `Receta guardada` |
| `published` | `Receta publicada` |
| `archived` | `Receta archivada` (toast con "Deshacer") |
| `unarchived` | `Receta publicada de nuevo` |
| `draftDiscarded` | `Borrador descartado` |
| `queueDone` | `No quedan borradores para revisar.` |
| `sessionExpired` | `Tu sesión venció. Volvé a entrar.` |

### 4.5 `packages/core/src/index.ts`

Agregar `export * from "./recipes";` y `export * from "./recipe-photo";`. `recipe-import` **no** va
al índice: se importa por subpath.

---

## 5. Contrato compartido: `packages/db`

### 5.1 `packages/db/domain/recipes.ts` (nuevo, exportado desde `domain/index.ts`): lo usan web, scripts y 018c

Ninguna función devuelve `Bytes`, salvo `getRecipePhotoBytes`. Todas las consultas usan `select`
explícito.

```ts
import type { Macros, RecipeTypeKey, RecipeMomentKey, RecipeTagKey, RecipeStatusKey, RecipePublishIssue, RecipeMacroResult } from "@nutri-bot/core";

/** Tarjeta de la grilla (lista y buscador de 018c). Serializable: sin Decimal ni Date. */
export interface RecipeCard {
  id: string; name: string; status: RecipeStatusKey; origin: "MANUAL" | "IMPORT";
  type: RecipeTypeKey | null; moments: RecipeMomentKey[]; tags: RecipeTagKey[];
  portionHousehold: string | null;
  perPortion: Macros | null;          // computeRecipeMacros(...).perPortion
  macrosIncomplete: boolean;          // freeText > 0 || missingGrams > 0
  photoId: string | null;             // RecipePhoto.id
  draftThumbId: string | null;        // solo DRAFT sin foto: primera RecipeImportImage CANDIDATE
  sourceName: string | null;
  importFile: string | null; importPage: number | null;
  searchText: string;                 // recipeSearchText(...)
  updatedAt: string;                  // ISO
}
export function listRecipeCards(params: { status: RecipeStatusKey }): Promise<RecipeCard[]>;
export function countRecipesByStatus(): Promise<Record<RecipeStatusKey, number>>;

/** Para el editor y la revisión: todo menos bytes. Los Decimal se pasan a number acá. */
export interface RecipeDetail {
  id: string; name: string; status: RecipeStatusKey; origin: "MANUAL" | "IMPORT";
  type: RecipeTypeKey | null; moments: RecipeMomentKey[]; tags: RecipeTagKey[];
  yieldPortions: number | null; portionHousehold: string | null; portionGrams: number | null;
  preparation: string | null; tips: string | null; sourceName: string | null;
  published: { portionText: string | null; kcal: number | null; protein: number | null; carbs: number | null; fat: number | null; fiber: number | null } | null;
  ingredients: {
    id: string; order: number; label: string | null; grams: number | null; noQuantity: boolean;
    household: string | null; rawText: string | null;
    food: { id: string; name: string; group: string; source: "SARA2" | "PROPIO"; active: boolean;
            kcalPer100: number; proteinPer100: number; carbsPer100: number; fatPer100: number; fiberPer100: number } | null;
  }[];
  photo: { id: string; credit: string | null } | null;
  import: { file: string | null; page: number | null; rawText: string | null; hints: unknown;
            pageImageId: string | null; candidateIds: string[] } | null;  // null si origin = MANUAL
  reviewedAt: string | null; publishedAt: string | null; updatedAt: string;
}
export function getRecipe(id: string): Promise<RecipeDetail | null>;

/** Catálogo para el editor: activos + los inactivos que use esta receta. Con fibra (listFoods no la trae). */
export function listFoodsForRecipes(includeIds?: readonly string[]): Promise<RecipeCatalogFood[]>;
export interface RecipeCatalogFood { id: string; name: string; group: string; source: "SARA2" | "PROPIO"; active: boolean;
  kcalPer100: number; proteinPer100: number; carbsPer100: number; fatPer100: number; fiberPer100: number }

/** Planes y plantillas DISTINTOS con al menos un ítem de esta receta (D10). Mismo patrón que getFoodUsage. */
export function getRecipeUsage(recipeId: string): Promise<{ plans: number; templates: number }>;

export interface RecipeInput {
  name: string; type: RecipeTypeKey | null; moments: RecipeMomentKey[]; tags: RecipeTagKey[];
  yieldPortions: number | null; portionHousehold: string | null; portionGrams: number | null;
  preparation: string | null; tips: string | null; sourceName: string | null;
  published: RecipeDetail["published"];  // solo se escribe si origin = IMPORT (en MANUAL se ignora)
  ingredients: { foodId: string | null; label: string | null; grams: number | null; noQuantity: boolean;
                 household: string | null; rawText: string | null }[]; // el orden del array es el `order`
}
export class RecipeNotFoundError extends Error {}
export class RecipeNotPublishableError extends Error { constructor(public issues: RecipePublishIssue[]) }
export class RecipeStatusError extends Error {}   // p. ej. archivar un DRAFT, descartar un PUBLISHED
export class RecipeInUseError extends Error {}    // borrar con uso > 0

/** Crea y publica (manual: "Guardar" publica). Valida con validateRecipeForPublish; si falla → RecipeNotPublishableError. */
export function createRecipe(input: RecipeInput): Promise<{ id: string }>;
/**
 * Guarda los datos e ingredientes en una transacción (deleteMany de RecipeIngredient where recipeId = id,
 * es decir, solo los hijos de ESTA receta, + createMany en orden). PUBLISHED/ARCHIVED: valida para publicar.
 * DRAFT: no valida, guarda tal cual y pone reviewedAt = now() si era null.
 */
export function updateRecipe(id: string, input: RecipeInput): Promise<void>;
/** DRAFT → PUBLISHED (valida), publishedAt = now(), borra sus RecipeImportImage. */
export function publishRecipe(id: string): Promise<void>;
export function archiveRecipe(id: string): Promise<void>;     // PUBLISHED → ARCHIVED
export function unarchiveRecipe(id: string): Promise<void>;   // ARCHIVED → PUBLISHED (sin revalidar: ya era válida)
/** Solo DRAFT y uso 0 (siempre 0 en un DRAFT). Cascada: ingredientes, imágenes. */
export function deleteDraftRecipe(id: string): Promise<void>;

/** Reemplaza la foto: delete + create en transacción (id nuevo = URL nueva). Bytes ya procesados por media/. */
export function setRecipePhoto(recipeId: string, photo: { data: Buffer; thumbData: Buffer; byteSize: number; credit: string | null }): Promise<{ photoId: string }>;
export function setRecipePhotoCredit(recipeId: string, credit: string | null): Promise<void>;
export function removeRecipePhoto(recipeId: string): Promise<void>;
export function getRecipePhotoBytes(photoId: string, size: "full" | "thumb"): Promise<{ data: Buffer; mimeType: string } | null>;

/** Portal (D3/D19): true si el paciente tiene un plan ACTIVE con un ítem de la receta de esa foto. (018c lo usa en la UI) */
export function patientCanSeeRecipePhoto(patientId: string, photoId: string): Promise<boolean>;
//   prisma.recipePhoto.findFirst({ where: { id: photoId, recipe: { planItems: { some: { meal: { plan: { patientId, status: "ACTIVE" } } } } } }, select: { id: true } })
```

Consumidores: `apps/web` (`recetas/**`, rutas de foto), los scripts de 8.x y 018c (`listRecipeCards`,
`getRecipe`, `getRecipeUsage`, `patientCanSeeRecipePhoto`). El bot no lo usa.

### 5.2 `packages/db/domain/recipeImport.ts` (nuevo, exportado; 018a-2)

```ts
import type { RecipeImportDraft } from "@nutri-bot/core/recipe-import";

export interface ImportImageInput { kind: "PAGE" | "CANDIDATE"; order: number; data: Buffer; thumbData: Buffer | null; width: number; height: number }
export type UpsertDraftOutcome = "created" | "updated" | "skipped-reviewed" | "skipped-not-draft";
/**
 * Clave importKey. Si no existe → crea DRAFT (origin IMPORT) con ingredientes (foodId null, label/grams/
 * household/noQuantity/rawText del parser) e imágenes. Si existe y es DRAFT sin reviewedAt → reemplaza datos,
 * ingredientes e imágenes. Si es DRAFT con reviewedAt → "skipped-reviewed". PUBLISHED/ARCHIVED → "skipped-not-draft".
 * Nunca toca otra receta.
 */
export function upsertImportedDraft(draft: RecipeImportDraft, images: ImportImageInput[] | null): Promise<{ id: string; outcome: UpsertDraftOutcome }>;
/** Cola de revisión: DRAFT ordenados por importFile, importPage, name. Filtro opcional por archivo. */
export function listDraftQueue(params?: { file?: string }): Promise<{ id: string; name: string; importFile: string | null; importPage: number | null }[]>;
export function listDraftFiles(): Promise<{ file: string; count: number }[]>;
export function getImportImageBytes(imageId: string, size: "full" | "thumb"): Promise<{ data: Buffer; mimeType: "image/webp" } | null>;
/** Copia la candidata a RecipePhoto (setRecipePhoto con sus bytes ya procesados). */
export function chooseImportCandidateAsPhoto(recipeId: string, imageId: string, credit: string | null): Promise<{ photoId: string }>;
/** undo de una corrida: borra SOLO los ids dados que sigan DRAFT y sin reviewedAt. Devuelve cuántos borró. */
export function deleteUnreviewedDrafts(ids: readonly string[]): Promise<number>;
```

### 5.3 `packages/db/domain/recipeTransfer.ts` (nuevo, **no** exportado desde `domain/index.ts`; solo scripts; 018a-2)

```ts
export function exportPublishedRecipes(params: { ids?: string[]; origin?: "IMPORT" | "MANUAL" }): Promise<RecipeBundle>;
export type ImportOutcome =
  | { importKey: string; result: "created"; id: string }
  | { importKey: string; result: "skipped-exists" }
  | { importKey: string; result: "skipped-food"; detail: string }       // "Falta el alimento propio «X»" / "SARA2 sourceKey no encontrado"
  | { importKey: string; result: "skipped-invalid"; issues: string[] };
/** Mapea alimentos: SARA2 por sourceKey; PROPIO por foodNameCompareKey(nombre) entre propios activos, con UNA sola
 *  coincidencia y los mismos macros cada 100 g (±0,01); si no → skipped-food. Crea PUBLISHED (valida). dryRun no escribe. */
export function importRecipeBundle(bundle: RecipeBundle, opts: { dryRun: boolean }): Promise<ImportOutcome[]>;
```

Sigue la regla de `AGENTS.md`: `sourceKey` es igual en desarrollo y en producción porque los dos
cargan el mismo `alimentos.json` versionado. Las recetas MANUAL que se exporten sin `importKey`
reciben `manual:<id de dev>` como clave.

### 5.4 `packages/db/media/recipe-photo.ts` (nuevo; export `@nutri-bot/db/media`)

`package.json` de `packages/db`:
- `exports` suma `"./media": "./media/recipe-photo.ts"`.
- `dependencies` suma `"sharp": "^0.35.4"`, la versión que ya está en el lockfile.
- `tsconfig.json`: `include` suma `"media/**/*.ts"` y `"scripts/recipes/**/*.ts"`.

```ts
// Sin `import "server-only"`: también lo usan los scripts tsx.
export interface ProcessedRecipeImage { data: Buffer; thumbData: Buffer; byteSize: number; width: number; height: number }
/**
 * sharp(input, { failOn: "error" }).rotate() (orientación EXIF) → sin metadatos (sharp los descarta por
 * defecto: se va el GPS de las fotos del celular).
 * Con alfa (PNG recortados de los PPTX): fit "contain" sobre transparente. Sin alfa: fit "cover" con
 * position sharp.strategy.attention. full 1200×900 WebP quality 80; thumb 480×360 WebP quality 72.
 * Entradas que sharp no puede leer → throw InvalidRecipeImageError.
 */
export function processRecipePhoto(input: Buffer): Promise<ProcessedRecipeImage>;
/** Página renderizada (pdftoppm PNG) → WebP de hasta 1000 px de ancho, quality 70, sin recorte. */
export function processImportPage(input: Buffer): Promise<{ data: Buffer; width: number; height: number }>;
export class InvalidRecipeImageError extends Error {}
```

`domain/` **no** importa `media/`, así el bot no carga `sharp` cuando importa `@nutri-bot/db/domain`.

### 5.5 `packages/db/domain/index.ts`

Agregar `export * from "./recipes";` y `export * from "./recipeImport";`. `recipeTransfer` no se exporta.

---

## 6. Rutas, server actions y API (`apps/web`)

### 6.1 Páginas del panel (`app/(panel)/recetas/`)

| Ruta | Qué | Parte |
|---|---|---|
| `/recetas` | Lista con pestañas `?estado=publicadas` (default), `revisar` y `archivadas`. Server component: `listRecipeCards`, `countRecipesByStatus` y `recipes-browser.tsx` como cliente | 018a-1 (la pestaña "Para revisar" se ve solo si N > 0; en 018a-1 siempre es 0) |
| `/recetas/nueva` | Editor vacío | 018a-1 |
| `/recetas/[id]` | Editor de una PUBLISHED o ARCHIVED. Si es DRAFT, `redirect` a `/recetas/revisar/[id]`. Si no existe, `notFound()` | 018a-1 |
| `/recetas/revisar` | `redirect` al primer borrador de `listDraftQueue({ file: ?archivo })`. Si no hay, vuelve a `/recetas?estado=revisar` con el estado vacío | 018a-2 |
| `/recetas/revisar/[id]` | Pantalla de revisión (7.5). `?archivo=` filtra la cola | 018a-2 |

Todas las páginas llevan `export const dynamic = "force-dynamic"` y un `loading.tsx` con skeleton,
como `alimentos/`.

### 6.2 Server actions

`app/(panel)/recetas/actions.ts` (`"use server"`, 018a-1). Todas chequean `auth()`; si no hay sesión
devuelven `{ ok: false, error: RECIPE_TEXT.sessionExpired }`. Los errores se loguean solo con
`errorCode(err)`, nunca con el payload, porque puede llevar bytes.

```ts
export type RecipeActionState =
  | { ok: true; id: string }
  | { ok: false; error?: string; issues?: RecipePublishIssue[]; photoError?: string };

/**
 * FormData: "payload" (JSON de RecipeFormPayload, validado con zod), "photo" (File opcional),
 * "removePhoto" ("1" opcional), "photoCredit" (texto opcional). Si hay id → updateRecipe; si no → createRecipe.
 * Foto: recipePhotoSizeError(file.size) → bytes → validateRecipePhoto → processRecipePhoto → setRecipePhoto.
 * Si la receta se guardó y la foto falla → { ok:false, photoError } con el id ya creado (el cliente navega igual
 * y muestra el error junto a la foto). revalidatePath("/recetas") y "/recetas/[id]".
 */
export async function saveRecipeAction(formData: FormData): Promise<RecipeActionState>;
export async function archiveRecipeAction(id: string): Promise<{ ok: boolean; error?: string }>;
export async function unarchiveRecipeAction(id: string): Promise<{ ok: boolean; error?: string }>;
```

`RecipeFormPayload` (zod en `actions.ts`): `{ id?: string; name; type; moments; tags; yieldPortions; portionHousehold;
portionGrams; preparation; tips; sourceName; published; ingredients[] }`. Es igual a `RecipeInput` más
el `id` opcional. Los números llegan como `number | null`: el cliente ya parsea la coma con
`parseEsArNumber` de `es-ar-number.ts`.

`app/(panel)/recetas/revisar/actions.ts` (018a-2):

```ts
/** Guarda sin publicar (updateRecipe sobre DRAFT; marca reviewedAt). */
export async function saveDraftAction(formData: FormData): Promise<RecipeActionState>;
/** Guarda + publishRecipe. Si candidateId viene, chooseImportCandidateAsPhoto antes de publicar. Devuelve nextId de la cola. */
export async function publishDraftAction(formData: FormData): Promise<RecipeActionState & { nextId?: string | null }>;
export async function discardDraftAction(id: string): Promise<{ ok: boolean; nextId: string | null; error?: string }>;
```

### 6.3 Route handlers (imágenes)

| Ruta | Auth | Respuesta |
|---|---|---|
| `GET /api/recetas/fotos/[photoId]?size=thumb\|full` (default `thumb`) | `auth()` del panel; sin sesión → 401 JSON | `getRecipePhotoBytes`; si no existe → 404. `Content-Type: image/webp`, `Cache-Control: private, max-age=31536000, immutable` (el id cambia al reemplazar) |
| `GET /api/recetas/importacion/[imageId]?size=thumb\|full` (018a-2) | `auth()` | `getImportImageBytes`; `Cache-Control: private, max-age=3600` |
| `GET /portal/recetas/fotos/[photoId]?size=` → archivo `app/(portal)/portal/recetas/fotos/[photoId]/route.ts` | `getPortalPatient()`; sin sesión → 401 | `patientCanSeeRecipePhoto(patient.id, photoId)` en false → **404**, sin distinguir si no existe o no está autorizado. `Cache-Control: private, max-age=3600` (no inmutable: el permiso puede cambiar al archivar el plan) |

El matcher de `middleware.ts` ya excluye `portal`, y `/api/recetas/*` queda cubierto por NextAuth
igual que `api/professional/logo`. No se toca el middleware.

### 6.4 Otros cambios en `apps/web`

- `components/shell/nav-config.ts`: en el grupo "Nutrición", entre "Alimentos" y "Plantillas", va
  `{ href: "/recetas", label: "Recetas", icon: ChefHat }`.
- `next.config.mjs`:
  - `experimental.serverActions.bodySizeLimit: "6mb"` (12-D5). Hay que actualizar el comentario:
    "Logo, foto de receta (5 MB + payload) y PDFs".
  - `serverExternalPackages` suma `"sharp"`.

### 6.5 Mensajes del bot

No hay. 018a no toca WhatsApp ni `OutboundMessage`.

---

## 7. UI (Apple, HU-017a): pantallas concretas (skill `ui`)

Para todas las pantallas valen estas reglas:
- Tokens de `lib/design-tokens.ts` y primitivos de `components/primitives/*`.
- Botones principales `Button size="lg"` (`h-11`). Todos los objetivos de toque miden 44 px
  (`.touch-target` o `h-11`) y están separados por `gap-2` como mínimo.
- Una acción principal por pantalla. Texto en vez de íconos sueltos (si hay ícono solo, lleva
  `aria-label`). Nada depende del hover.
- Números con `tabular-nums`. Colores de macro de `chartPalette.macro`, siempre con la letra al lado.
- Reduced motion: lo resuelven los primitivos. No se agrega animación nueva, salvo el press (`press-sm`).

### 7.1 Componentes nuevos (`apps/web/src/components/recipes/`): los reusa 018c

| Archivo | Qué es | Props clave |
|---|---|---|
| `recipe-photo.tsx` | Foto 4:3 con `next/image` (`unoptimized`, `fill`, `sizes`, `className="object-cover"`) dentro de `aspect-[4/3] bg-muted`. Sin foto, ilustración del tipo: ícono lucide centrado de 40 px en `text-tertiary` sobre `bg-muted` (MAIN_DISH `CookingPot`, SIDE_DISH `Carrot`, SALAD `Salad`, SNACK `Apple`, BREAKFAST `Coffee`, BREAD_DOUGH `Croissant`, DESSERT `CakeSlice`; sin tipo, `ChefHat`) | `photoUrl: string \| null`, `type`, `alt`, `priority?`, `sizes` |
| `macro-line.tsx` | `● P 23,9 g · ● C 31,1 g · ● G 1,9 g`: punto de 8 px con el color del macro, letra y valor (`footnote`, `tabular-nums`) | `macros: Macros`, `size?: "footnote" \| "callout"` |
| `recipe-card.tsx` | Tarjeta `rounded-xl bg-card shadow-card overflow-hidden`: foto arriba; abajo `p-4 space-y-1`: nombre (`text-headline line-clamp-2`), porción (`text-subheadline text-muted-foreground`, "1 porción: ¾ albóndigas"), kcal (`text-title-3 tabular-nums`, "262 kcal") y `MacroLine`. Si `macrosIncomplete`, `Badge` warning "Macros incompletos". Toda la tarjeta es un `<Link>` con foco visible. Tiene un slot `footer` para el "Agregar" y el impacto de 018c | `card: RecipeCardView`, `href`, `footer?: ReactNode`, `priority?` |
| `recipe-grid.tsx` | `grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4`. Las primeras 4 tarjetas van con `priority` y el resto con lazy | `cards`, `renderFooter?` |
| `recipe-grid-skeleton.tsx` | 8 tarjetas `Skeleton` con la foto 4:3 reservada y `aria-busy` | — |
| `recipe-filters.tsx` | Buscador + chips, controlado (`RecipeFilters`). Detalle en 7.2 | `value`, `onChange`, `countText`, `hideMoment?` |
| `chip-group.tsx` | Fila "Etiqueta: chips" sobre `ToggleGroup` (`type="single"` o `"multiple"`), en `flex flex-wrap gap-2`. Cada chip es `ToggleGroupItem` `h-11 rounded-full px-4 text-callout`; encendido = `bg-primary-soft text-primary` (estado on de 017a). `aria-label` del grupo = la etiqueta | `label`, `type`, `options`, `value`, `onChange` |
| `ingredient-food-picker.tsx` | Combobox **controlado** (patrón ARIA 1.2, mismo comportamiento de teclado que `FoodPicker`) que usa `useFoodCatalog()` + `searchFoods`. La opción 0 es "Sin alimento (texto libre)". Input `h-11`. Ver 12-D6 | `value: string \| null` (foodId), `onChange(food: CatalogFood \| null)`, `placeholder`, `invalid?`, `id` |
| `lib/recipe-view.ts` (en `lib/`) | `RecipeCardView = RecipeCard & { photoUrl: string \| null }`. `toRecipeCardView(card, scope: "panel" \| "portal")` arma `/api/recetas/fotos/<id>?size=thumb` (o `/api/recetas/importacion/<draftThumbId>?size=thumb`) | — |

### 7.2 Pantalla "Recetas" (`/recetas`)

```
┌ Recetas ─────────────────────────────────────────── [ + Nueva receta ] ┐  PageHeader, botón lg
│ Tus recetas con los macros de 1 porción, calculados con SARA 2.          │  description
│ ( Publicadas 186 ) ( Para revisar 40 ) ( Archivadas 3 )                  │  Tabs (triggers h-11); "Para revisar" y "Archivadas" solo si N > 0
│ ┌ 🔍 Buscar por nombre o ingrediente ──────────────────────────────┐    │  input type="search" h-12 text-body-lg
│ Tipo:     (Todas●) (Plato principal) (Guarnición) (Ensalada) …          │  chip-group single (Todas = null)
│ Momento:  (Todos●) (Desayuno) (Almuerzo) (Merienda) (Cena) (Colación)   │
│ Etiquetas: (Sin TACC) (Vegetariana) (Apta vianda / freezer)              │  multiple
│ Mostrando 24 de 186 recetas                    [ Quitar filtros ]       │  aria-live="polite"; "Quitar filtros" solo si hay filtros
│ ┌──────┐ ┌──────┐ ┌──────┐                                              │
│ │ 4:3  │ │ 4:3  │ │ 4:3  │  RecipeCard × N                              │
│ └──────┘ └──────┘ └──────┘                                              │
└──────────────────────────────────────────────────────────────────────────┘
```

- La pestaña va en la URL (`?estado=`) con `router.replace`, para que "atrás" funcione. Los filtros
  quedan en el estado local, no en la URL.
- El filtrado es en el cliente: `filterRecipes(cards, filters)` con `useDeferredValue(query)`, sin
  botón "Buscar".
- En el celular, las filas de chips se envuelven (`flex-wrap`, nunca carrusel). "Etiquetas" queda
  plegada bajo "Más filtros" (`<details>` estilizado con `h-11`) para no llenar la pantalla
  (progressive disclosure). En escritorio (`md:` para arriba) se ve abierta.
- Pestaña "Para revisar" (018a-2): la tarjeta suma el `Badge` "Borrador" y la línea
  `footnote` "Almuerzos y cenas 2 · pág. 7". El `href` lleva a `/recetas/revisar/<id>`. Arriba de
  la grilla va un `Button lg` "Empezar a revisar", que lleva a `/recetas/revisar`.
- Estados:
  - Sin recetas: `EmptyState` "Todavía no hay recetas. Cargá la primera." + `Button lg` "Nueva receta".
  - Sin resultados: "No hay recetas con «{query}»." + "Probá con otro ingrediente." + "Quitar
    filtros" (si hay) + "Crear receta" (secundario → `/recetas/nueva`).
  - Cargando: `loading.tsx` → `RecipeGridSkeleton`.

### 7.3 Ficha / editor (`/recetas/nueva`, `/recetas/[id]`): `recipe-form.tsx` (cliente, compartido con la revisión)

```
┌ ‹ Recetas                                                                  ┐
│ Albóndigas de lentejas                    [Publicada]                      │ title-1 + Badge
│ ┌ columna (max-w-2xl) ─────────────────────┐ ┌ aside sticky (w-80) ──────┐ │
│ │ [ Foto 4:3: "Tocá para subir una foto" ] │ │ 1 porción aporta          │ │
│ │   JPG, PNG o WebP, hasta 5 MB            │ │ 262 kcal  (metric-md)  ⓘ  │ │ ⓘ = KcalBreakdownPopover
│ │ Nombre [______________________]          │ │ ● Proteínas      23,9 g   │ │
│ │ Tipo   (Plato principal●)(Guarnición)…   │ │ ● Carbohidratos  31,1 g   │ │
│ │ Momentos (Almuerzo●)(Cena●)(Desayuno)…   │ │ ● Grasas          1,9 g   │ │
│ │ Rinde [ 8 ] porciones                    │ │   Fibra          11,1 g   │ │
│ │ 1 porción es [ ¾ albóndigas         ]    │ │ P 95,6 · CHO 124,5 · G 17 │ │ formatAtwaterCompact
│ │ pesa [     ] g (opcional) ≈ 180 g        │ │ ⚠ avisos (Alert warning)  │ │ recipeMacroWarnings
│ │ Ingredientes                             │ │ Según el recetario: 262…  │ │ solo si published
│ │ ┌ fila ────────────────────────────────┐ │ └───────────────────────────┘ │
│ │ │ [Lentejas, secas, crudas      ▾]  185 kcal│                            │
│ │ │ Gramos [500] g  Medida casera [      ]  │                              │
│ │ │ ☐ Sin cantidad (c.n.)   ↑ ↓   Quitar │ │                               │
│ │ └──────────────────────────────────────┘ │                               │
│ │ [ + Agregar ingrediente ]  (lg, ancho completo, secondary)              │
│ │ ▸ Más datos (preparación, tips, etiquetas, fuente)                      │
│ └──────────────────────────────────────────┘                              │
│ ▁▁▁ barra inferior sticky (material bar): [ Archivar ]      [ Guardar ] ▁▁│
└────────────────────────────────────────────────────────────────────────────┘
```

- **Foto**: es un botón grande `aspect-[4/3] rounded-xl border-dashed`, con
  `<input type="file" accept="image/jpeg,image/png,image/webp" class="sr-only">`. En iOS ofrece
  cámara y fototeca y convierte HEIC a JPEG.
  - La vista previa sale de `URL.createObjectURL`, al instante.
  - El tamaño se chequea en el cliente con `recipePhotoSizeError(file.size)`. Si falla, el error va
    junto al campo (`FormError`) con el texto `photoInvalid`.
  - Con foto aparecen "Cambiar foto" y "Quitar foto" (secundarios, `h-11`).
  - El archivo viaja recién con "Guardar" (un solo envío).
- **Tipo y Momentos**: `chip-group` (`single` y `multiple`). Son 7 y 5 opciones visibles, sin
  selects escondidos.
- **Rinde / porción / gramos**: `NumberInput` existente con coma decimal.
  - El "≈ 180 g" sale de `estimatedPortionGrams`. Es una pista en `footnote`, no un valor.
- **Fila de ingrediente** (`<li>` con `rounded-lg border p-3 space-y-2`):
  - Renglón 1: `IngredientFoodPicker` (ancho completo) y, a la derecha, las kcal de esa fila
    (`footnote`, se calcula en vivo).
  - Si es texto libre: input "Ingrediente" (label) y nota `footnote` "Sin alimento: no suma
    macros · Crear alimento propio ↗". El enlace va a `/alimentos/nuevo` con `target="_blank"`.
    Al volver el foco a la pestaña (`visibilitychange`), `router.refresh()` recarga el catálogo.
  - Con alimento, el label queda oculto detrás de "Cambiar cómo se lee", que lo despliega.
  - Renglón 2: "Gramos" (`NumberInput` `w-28`, sufijo "g"), "Medida casera" (`Input`, placeholder
    "1 taza") y `Checkbox` "Sin cantidad (c.n.)" con área de 44 px. Marcarlo vacía y deshabilita los
    gramos.
  - Acciones: "Subir" y "Bajar" (`Button variant="ghost" size` con `.touch-target`, ícono +
    `aria-label`) y "Quitar" (ghost, texto destructive). No hay drag (motricidad).
  - Al agregar una fila, el foco va al picker nuevo.
- **Aside "1 porción aporta"**: se recalcula en cada cambio con `computeRecipeMacros` (puro, en el
  cliente, con el `Map` de macros de `listFoodsForRecipes`).
  - Sin rendimiento: muestra el total de la receta y el aviso `warnNoYield`.
  - En el celular (`< lg`) el aside baja al final del formulario. La barra inferior sticky suma
    "262 kcal / porción" a la izquierda del botón, así el dato no se pierde de vista.
- **"Más datos"**: disclosure cerrado por defecto. Se abre solo si la receta ya tiene alguno de
  estos datos o si hay un error adentro.
  - Preparación: `Textarea` de 8 renglones.
  - Tips y conservación: `Textarea`. Si la etiqueta "Apta vianda / freezer" está encendida y el
    campo está vacío, el placeholder pasa a "Se congela hasta 3 meses. Descongelar en heladera." y
    aparece la ayuda "Contá cómo se conserva".
  - Etiquetas: `chip-group` multiple.
  - Fuente: `Input` con la ayuda "Se muestra al paciente como «Fuente: …»". Es obligatoria si
    `origin = IMPORT`.
  - Crédito de la foto: `Input` opcional, visible si hay foto.
  - "Tabla del recetario": solo en recetas IMPORT, con 5 `NumberInput` más el texto de la porción.
- **Guardar**:
  1. Validación local con `validateRecipeForPublish`. Los errores van junto a cada campo; arriba
     aparece `Alert` "Faltan {n} datos para guardar", con enlaces que llevan el foco a cada campo.
  2. Si `usage.plans + usage.templates > 0` y cambiaron los ingredientes o el rendimiento:
     `useConfirm({ title: "¿Guardar los cambios?", description: recipeUsageWarning(usage),
     confirmLabel: "Guardar igual" })`.
  3. `saveRecipeAction`. El botón queda deshabilitado con spinner (`SubmitButton`/`loading`).
  4. `ok` → toast `saved` y `router.replace("/recetas/<id>")` si era nueva.
- **Archivar**: no pide confirmación. Toast `archived` con "Deshacer" (`notify.undo` →
  `unarchiveRecipeAction`). Una receta ARCHIVED muestra "Volver a publicar" (secundario) y el
  `Badge` "Archivada".
- `useUnsavedChangesGuard(dirty, { title: "¿Salir sin guardar?", description: "Los cambios de esta receta se van a perder.", confirmLabel: "Salir sin guardar" })`.

### 7.4 Origen de los datos del editor

`[id]/page.tsx` carga en paralelo `getRecipe(id)`, `getRecipeUsage(id)` y
`listFoodsForRecipes(ids de sus ingredientes)`. El catálogo va a `FoodCatalogProvider` (los campos
extra se ignoran por estructura) y, en el form, a un `Map<foodId, RecipeCatalogFood>`.

### 7.5 Revisión de borradores (`/recetas/revisar/[id]`), 018a-2: `review-screen.tsx`

```
┌ ‹ Recetas   Borrador 3 de 40 · [Todos los recetarios ▾]   [Saltar] [Guardar borrador] [Publicar y seguir] ⋯ ┐ barra sticky (material bar)
│ ┌ Original (lg: 5/12, sticky, scroll propio) ┐ ┌ Formulario (lg: 7/12) ───────────────────────────────┐ │
│ │ ( Página | Texto )  SegmentedControl        │ │ Fotos encontradas: (○ 4:3)(○ 4:3)(○ Ninguna)[Subir otra] │ │
│ │ [ imagen de la página, ancho completo ]     │ │ Nombre [Albóndigas de lentejas]                        │ │
│ │   tocar → Dialog a pantalla completa        │ │ … mismo recipe-form …                                  │ │
│ │ Almuerzos y cenas 2 · pág. 7                │ │ Ingrediente:                                           │ │
│ └─────────────────────────────────────────────┘ │  Del recetario: «Lentejas 500g»          (footnote)   │ │
│                                                 │  Sugerido: Lentejas, secas, crudas · 500 g            │ │
│                                                 │  [ ✓ Aceptar ] [ Cambiar ] [ Dejar como texto ]        │ │
│                                                 └────────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

- **Barra superior**:
  - "Borrador {i} de {n}" sale de `listDraftQueue`.
  - Selector de recetario (`listDraftFiles`, con cantidades) que cambia `?archivo=`.
  - Acciones, de menor a mayor peso: "Saltar" (link al siguiente), "Guardar borrador"
    (secundario) y "Publicar y seguir" (primario lg). En el menú "⋯": "Descartar borrador", con
    `AlertDialog` destructive "Se borra este borrador. Lo podés volver a extraer." / "Descartar".
- **Columna Original**:
  - `SegmentedControl` (2 opciones) entre "Página" (la `RecipeImportImage` PAGE) y "Texto"
    (`importRawText` en `whitespace-pre-wrap text-callout`).
  - Debajo, `importHints.warnings` como lista `footnote`.
  - En el celular (`< lg`) va plegada en un disclosure "Ver original" arriba del formulario.
- **Fotos encontradas**:
  - `RadioGroup` de miniaturas 4:3 de 120 px con borde de selección `ring-2 ring-primary`, más la
    opción "Ninguna" y "Subir otra" (el mismo campo de foto de 7.3).
  - No se preselecciona ninguna. La foto queda opcional.
- **Ingredientes en modo revisión**: cada fila suma "Del recetario: «…»" (`rawText`).
  - Si la fila no tiene `foodId`, se calcula `suggestFood(label, catálogo)` en el cliente.
  - Con sugerencia: "Sugerido: {nombre} · {gramos del parser} g" y tres botones de 44 px:
    - "✓ Aceptar" (primary-soft): asigna el `foodId`.
    - "Cambiar": abre el picker con el foco adentro.
    - "Dejar como texto": oculta la sugerencia hasta recargar (es estado del cliente).
  - Las flags del parser se ven como texto `footnote` en `text-warning`, al lado de los gramos:
    - `HOUSEHOLD_ONLY` → "El texto no dice los gramos." (el campo gramos queda con borde warning).
    - `VOLUME_ONLY` → "Está en cc: pasalo a gramos o marcá c.n."
    - `APPROX` → "Dice «aprox.»: revisá."
    - `AMBIGUOUS_GRAMS` → "Hay dos cantidades: elegí una."
    - `MULTI_FOOD` → "Parecen dos ingredientes: separalos con «Agregar ingrediente»."
- **Tipo, momentos y fuente** vienen precargados con `suggestedType`, `suggestedMoments` y
  `suggestedSourceName`. Se ven como cualquier valor cargado.
- **Aside**: el mismo de 7.3, más la comparación con la tabla (`compareWithPublished`). Si
  `exceeds`, se ve el `Alert` warning con el `message` exacto. **No bloquea.**
- **Publicar y seguir**: valida igual que 7.3 (missingGrams bloquea). Después, `publishDraftAction`
  → toast `published` → `router.push("/recetas/revisar/<nextId>?archivo=…")`. Al final de la cola,
  `EmptyState` `queueDone` con "Ver recetas".
- Esta pantalla la usa Joel (D6). Igual cumple todas las reglas de accesibilidad y 44 px.

### 7.6 Lo que 018a **no** dibuja

No toca el buscador en la comida, el ítem de receta del plan, el portal ni el PDF (son de 018c). La
ruta del portal de 6.3 existe, pero ninguna pantalla la usa todavía.

---

## 8. Carga asistida (script, revisión y pase a producción), 018a-2

### 8.1 Extracción: `packages/db/scripts/recipes/extract.ts`

```bash
npm run recipes:extract --workspace packages/db                         # dry-run (default): no se conecta a la base
npm run recipes:extract --workspace packages/db -- --file "Colaciones_compressed.pdf"
npm run recipes:extract --workspace packages/db -- --write [--images] [--file …] [--yes]
```

`package.json` de `packages/db` suma estos scripts:
- `"recipes:extract": "dotenv -e ../../.env -- tsx scripts/recipes/extract.ts"`
- `"recipes:undo": "dotenv -e ../../.env -- tsx scripts/recipes/undo.ts"`
- `"recipes:export": "dotenv -e ../../.env -- tsx scripts/recipes/export.ts"`
- `"recipes:import:prod": "tsx scripts/recipes/import.ts"`
- `"test:recipes": "dotenv -e ../../.env -- tsx scripts/test-recipes.ts"`

Flujo:
1. Lista `docs/recetarios/*.pdf` (o `--file`). Aplica `pickRecipeFiles` e `isExcludedRecipeFile`
   y loguea los excluidos con el motivo.
2. Por archivo, corre `pdftotext -bbox <pdf> -` (igual que `sara2/read-pdf.ts`, con el mismo
   mensaje si falta poppler) y `parseBboxXhtml`. Después `extractRecipesFromPages`:
   - **Página → líneas**: agrupa palabras por `y` (tolerancia 0,5 × altura mediana) y las ordena
     por `x`. La altura de una línea es la mediana de las alturas de sus palabras.
   - **Títulos de sección**: líneas cuyo texto normalizado es `ingredientes`,
     `procedimiento|preparacion|elaboracion`, `tips|consejos`, `tabla nutricional…` o `porcion…`.
     Si la caja es más alta que ancha × 1,5, el título está **rotado** (F2).
   - **F1** (títulos horizontales): cada línea va a la sección cuyo título está más cerca **por
     arriba** y se solapa en `x` (columna). Las líneas que no tienen título por arriba son la
     cabecera.
   - **F2** (títulos rotados o sin títulos): las líneas con viñeta se cortan en bloques cada vez que
     cambia el glifo de la viñeta. El primer bloque con alguna cantidad (`g`, `cc`, medida casera o
     `c.n.`) son los ingredientes; el siguiente, los pasos.
   - **Nombre**: las líneas de la cabecera con altura ≥ 2,5 × la mediana de la página, unidas en
     orden (resuelve "Albóndigas / de lentejas"). Se ponen en mayúscula inicial si venían todas en
     mayúsculas.
   - **Rinde**: regex sobre la cabecera: `rinde (para )?(\d+)`, `(\d+) (porciones|personas)` →
     `yieldPortions`. `(\d+) unidades` → solo `yieldText`.
   - **Tabla nutricional**: para cada etiqueta (`calorias`, `hidratos|carbohidratos`, `proteinas`,
     `grasas`, `fibra`), el número que esté **debajo** (o a la derecha) y más cerca en `x`. La
     porción sale del texto que sigue a "porción". Los números usan `parseEsArNumber`, que acepta
     "31.12" y "31,12".
   - **Ingredientes**: las líneas sin viñeta se pegan a la anterior (renglón partido). Los subtítulos
     ("Base", "Relleno": una sola palabra sin cantidad y terminada sin punto) **no** son
     ingredientes: van a `hints.warnings` como "Subtítulo «Relleno»". Cada línea pasa por
     `parseIngredientLine`.
   - **F4** (párrafos con "Porción:"): cada bloque "Nombre: texto… Porción: X" es un borrador con
     `ingredients = []`, la descripción en `preparation` y `portionHousehold = X`. El revisor carga
     los ingredientes.
   - **Páginas salteadas**: sin título de ingredientes, sin viñetas con cantidades y sin "Porción:"
     → `NO_RECIPE`. Más de 5 líneas que empiezan con "×" y ninguna cantidad → `INDEX`.
   - **Pie con autor** (`/\b(lic\.?|m\.?n\.?|m\.?p\.?)\b.*\d{3,}/i`) → `hints.authorLine`.
   - **Fuente sugerida**: si el nombre del archivo o el texto dicen "nutriarte", el formato es
     "Nutriarte — {título}". Si hay `authorLine`, "{authorLine} — {título}". Si no, "{título}". El
     `{título}` sale de `suggestFromFileName`: el nombre del archivo sin sufijos y en mayúscula
     inicial ("Almuerzos y cenas 2").
   - **Tipo y momentos sugeridos** por el nombre del archivo (normalizado):

     | Contiene | `type` | `moments` |
     |---|---|---|
     | `almuerzos y cenas` | MAIN_DISH | LUNCH, DINNER |
     | `ensaladas` | SALAD | LUNCH, DINNER |
     | `guarni` | SIDE_DISH | LUNCH, DINNER |
     | `desayunos` | BREAKFAST | BREAKFAST, AFTERNOON_SNACK |
     | `mate`, `galletitas`, `crumble`, `cookies` | DESSERT | BREAKFAST, AFTERNOON_SNACK |
     | `colaciones`, `picoteo` | SNACK | SNACK |
     | `panes`, `pizzas` | BREAD_DOUGH | BREAKFAST, AFTERNOON_SNACK, DINNER |
     | `fiestas` | null | [] |

3. **Imágenes** (solo con `--images`):
   - `pdfimages -list -f p -l p` y `pdfimages -png -f p -l p` a un directorio temporal
     (`mkdtemp` en `os.tmpdir()`, que se borra al terminar).
   - Las candidatas pasan este filtro: `type = image`, ancho ≥ 300 y alto ≥ 200, proporción entre
     0,6 y 2,2, y que el `object ID` **no** aparezca en 3 páginas o más del archivo (eso es
     decoración).
   - Se ordenan por área, de mayor a menor, y se guardan como máximo 3, procesadas con
     `processRecipePhoto`.
   - La página se renderiza con `pdftoppm -r 80 -png -f p -l p` y pasa por `processImportPage`.
4. **Salida**:
   - **Dry-run**: escribe `docs/recetarios/_extraccion/reporte.md` (gitignored) con estas tablas:
     - por archivo: páginas, borradores, páginas salteadas por motivo;
     - por borrador: página, nombre, cantidad de ingredientes, con gramos, con flags, con tabla;
     - un total.
   - Por consola imprime **solo contadores**, nunca texto de terceros.
   - **`--write`**: exige `DATABASE_URL`. Imprime `host:port/db` de la URL y pide escribir `SI`
     (salvo `--yes`). Por cada borrador, `upsertImportedDraft`. Guarda la corrida en
     `docs/recetarios/_extraccion/corrida-<ISO>.json` (`{ ids creados, outcomes }`) para poder
     deshacerla.
   - `scripts/recipes/undo.ts <corrida.json>` → `deleteUnreviewedDrafts(ids)`.

Garantías:
- No inventa gramos: `grams` solo sale de un token `\d g` de la línea, y lo prueban los tests.
- No elige alimentos: todos los `foodId` quedan en `null`.
- No toca recetas PUBLISHED o ARCHIVED ni borradores ya revisados.
- No escribe nada de terceros en el repo.

### 8.2 Primera tanda (D6)

1. Joel corre el dry-run sobre todos los archivos y revisa el reporte (8.5, objetivos).
2. `--write --images` en **su base de desarrollo**, sobre todos los archivos. El resto de los
   borradores sirve para revisarlos más adelante.
3. Revisa unas 40 recetas en `/recetas/revisar`, filtrando por recetario. Empieza por las que
   aparecen en el plan real (colaciones y desayunos). Las valida con Daiana.
4. Las pasa a producción (8.4).

### 8.3 Por qué la revisión es en desarrollo

Ver 12-D8: el login de Joel en producción le cambiaría el token de Google Calendar a la
profesional. Además, en desarrollo Joel puede correr la extracción y deshacerla sin tocar datos
reales.

### 8.4 Pase a producción: export e import (bundle)

```bash
# en la máquina de Joel, contra su base de desarrollo
npm run recipes:export --workspace packages/db -- [--ids id1,id2] [--origin IMPORT]
#   → docs/recetarios/_exportacion/recetas-<fecha>.json (gitignored; incluye fotos en base64)
# producción: pg_dump primero, después por túnel (como sara2:load:prod)
DATABASE_URL=… npm run recipes:import:prod --workspace packages/db -- <bundle.json>            # dry-run (default)
DATABASE_URL=… npm run recipes:import:prod --workspace packages/db -- <bundle.json> --write   # pide escribir SI
```

- `export.ts` → `exportPublishedRecipes` (PUBLISHED; por defecto `origin = IMPORT`) →
  `validateRecipeBundle` antes de escribir.
- `import.ts` → `validateRecipeBundle` → `importRecipeBundle`. Imprime una tabla con cada
  resultado (`created`, `skipped-exists`, `skipped-food` con el detalle, `skipped-invalid`).
- Es idempotente por `importKey`: correrlo dos veces no duplica nada.
- No toca recetas existentes en producción. Si hay que corregir una que ya está, se hace a mano
  en el panel de producción.
- Recomendación operativa para que el import no saltee recetas: en la revisión, preferir alimentos
  SARA 2. Si hace falta un alimento propio, Daiana lo crea antes en producción con el mismo nombre
  y valores, o Joel usa uno que exista en las dos bases.

### 8.5 Objetivos del dry-run (los reporta el implementer; no son un fallo duro)

Sobre todos los archivos no excluidos:
- 0 errores (ningún archivo aborta).
- 180 borradores o más.
- Al menos el 80 % de los borradores de los formatos F1 y F2 con nombre y una línea de ingrediente o más.
- Tabla nutricional detectada en todas las páginas F1 que la tengan (control manual sobre "Almuerzos y cenas 2").
- **0 gramos sin un token en el `rawText`**: lo verifica una aserción del propio script, que se cae si encuentra uno.

Si algo queda por debajo, el implementer lo anota en `progress/impl_HU-018a.md` con los archivos
que fallan, y el orquestador decide si sigue (la revisión manual igual cubre los huecos).

---

## 9. Archivos y flujo

### 9.1 Crear

| Archivo | Parte |
|---|---|
| `packages/core/src/recipes.ts`, `recipes.test.ts` | a-1 |
| `packages/core/src/recipe-photo.ts`, `recipe-photo.test.ts` | a-1 |
| `packages/core/src/recipe-import/{index,text,ingredient-line,extract,files,food-suggest,bundle}.ts` + `*.test.ts` + `__fixtures__/synthetic.ts` (páginas `BboxPage` armadas en código con recetas **inventadas**) | a-2 |
| `packages/db/prisma/migrations/<ts>_recipes/migration.sql` | a-1 |
| `packages/db/media/recipe-photo.ts`, `recipe-photo.test.ts` (sharp real sobre una imagen generada en memoria) | a-1 |
| `packages/db/domain/recipes.ts`, `recipes.test.ts` (prisma mockeado) | a-1 |
| `packages/db/domain/recipeImport.ts`, `recipeImport.test.ts` | a-2 |
| `packages/db/domain/recipeTransfer.ts`, `recipeTransfer.test.ts` | a-2 |
| `packages/db/scripts/test-recipes.ts` | a-1 (a-2 suma un tramo de import) |
| `packages/db/scripts/recipes/{extract,undo,export,import}.ts` | a-2 |
| `apps/web/src/components/recipes/{recipe-photo,macro-line,recipe-card,recipe-grid,recipe-grid-skeleton,recipe-filters,chip-group,ingredient-food-picker}.tsx` | a-1 |
| `apps/web/src/lib/recipe-view.ts` | a-1 |
| `apps/web/src/app/(panel)/recetas/{page,loading,recipes-browser,recipe-form,recipe-portion-summary,actions}.tsx/ts` + `actions.test.ts` | a-1 |
| `apps/web/src/app/(panel)/recetas/nueva/page.tsx`, `recetas/[id]/{page,loading}.tsx` | a-1 |
| `apps/web/src/app/api/recetas/fotos/[photoId]/route.ts` + `route.test.ts` | a-1 |
| `apps/web/src/app/(portal)/portal/recetas/fotos/[photoId]/route.ts` + `route.test.ts` | a-1 |
| `apps/web/src/app/(panel)/recetas/revisar/{page,actions}.ts(x)`, `revisar/[id]/{page,loading,review-screen}.tsx`, `revisar/actions.test.ts` | a-2 |
| `apps/web/src/app/api/recetas/importacion/[imageId]/route.ts` + `route.test.ts` | a-2 |

### 9.2 Modificar

| Archivo | Cambio | Parte |
|---|---|---|
| `packages/db/prisma/schema.prisma` | 3.1 | a-1 |
| `packages/db/package.json` | `sharp`, export `./media`, scripts | a-1 (scripts de a-2 en a-2) |
| `packages/db/tsconfig.json` | include `media/**`, `scripts/recipes/**` | a-1/a-2 |
| `packages/db/domain/index.ts` | exports | a-1/a-2 |
| `packages/core/src/index.ts` | exports | a-1 |
| `packages/core/package.json` | export `./recipe-import` | a-2 |
| `apps/web/next.config.mjs` | `bodySizeLimit: "6mb"`, `serverExternalPackages` + `sharp` | a-1 |
| `apps/web/src/components/shell/nav-config.ts` | "Recetas" | a-1 |
| `package-lock.json` | por `sharp` declarado en `packages/db` (`npm install` desde la raíz; misma versión, no se baja nada nuevo) | a-1 |

No se modifica nada más. En especial: `food-picker.tsx`, `food-catalog.tsx`, `meals-editor.tsx`,
`meal-view.ts`, `weeklyMenu.ts`, `nutritionPlans.ts`, `planTemplates.ts`, `foods.ts`, `middleware.ts`
y `professional-identity.ts`.

---

## 10. Checklist atómico

### Corte en dos partes que se mergean por separado (recomendado, 12-D10)

- **018a-1 — Recetario manual** (fases P, A–F): modelo, migración, macros, lista, editor, foto y
  rutas de foto. Con esto Daiana ya puede cargar recetas a mano. Es la **única parte con
  migración**.
- **018a-2 — Carga asistida** (fases G–K): parser, script, revisión y pase a producción. **No
  tiene migración** (el esquema ya viene en a-1), así que no compite con otra HU de schema y se
  puede implementar mientras otra persona migra.

Cada parte tiene su PR a `develop`, su review y su `impl_HU-018a-<n>.md`.

### Preparación (P, 018a-1)
- [ ] P1. `git fetch`; rama `feat/hu-018a-recetario` al día con `origin/develop`; confirmar que ninguna HU de schema esté en `implementando`.
- [ ] P2. `docker compose ps` (db healthy) y `prisma migrate status` sin drift (3.3).

### Fase A: `packages/core` (018a-1)
- [ ] A1. `recipes.ts`: catálogos y labels (4.1).
- [ ] A2. `computeRecipeMacros`, `ingredientDisplayName` y `recipeMacroWarnings` con `RECIPE_TEXT`.
- [ ] A3. Porciones: `normalizePortions`, `stepPortions`, `formatPortions`, `scaleMacros` y `recipeItemMacros`.
- [ ] A4. `compareWithPublished`.
- [ ] A5. `validateRecipeForPublish`.
- [ ] A6. `recipeSearchText`, `filterRecipes`, `hasActiveRecipeFilters`, `recipeCountText` y `recipeUsageWarning`.
- [ ] A7. `recipe-photo.ts`.
- [ ] A8. Tests (11.1) y `index.ts`.
- [ ] A9. `npm run test` y `npm run typecheck --workspace packages/core`.
- Commit: `HU-018a: lógica pura de recetas (macros por porción, porciones, comparación, validación, búsqueda, foto)`

### Fase B: esquema y migración (018a-1)
- [ ] B1. Respaldo `pg_dump` y conteos (3.3).
- [ ] B2. Editar `schema.prisma` (3.1).
- [ ] B3. `migrate dev --create-only --name recipes` y revisar el SQL contra 3.2.
- [ ] B4. `npm run db:migrate`, `npm run db:generate`, conteos después y `migrate status`.
- [ ] B5. `npm run typecheck` en **los 4 workspaces** (los tipos de `PlanMealItem` cambiaron).
- Commit: `HU-018a: modelo de recetas (migración recipes)`

### Fase C: `packages/db` (018a-1)
- [ ] C1. `sharp` en `packages/db/package.json`, export `./media` y `tsconfig`. `npm install` desde la raíz: verificar que el lockfile no cambie de versión.
- [ ] C2. `media/recipe-photo.ts` y su test.
- [ ] C3. `domain/recipes.ts` (5.1), sin bytes salvo `getRecipePhotoBytes`.
- [ ] C4. `domain/recipes.test.ts` (11.2) y `domain/index.ts`.
- [ ] C5. `npm run test` y `npm run typecheck` (web y bot incluidos).
- Commit: `HU-018a: dominio de recetas y procesamiento de fotos`

### Fase D: rutas y actions de `apps/web` (018a-1)
- [ ] D1. `next.config.mjs` (6.4).
- [ ] D2. `api/recetas/fotos/[photoId]/route.ts` y `portal/recetas/fotos/[photoId]/route.ts`, con sus tests.
- [ ] D3. `recetas/actions.ts` y `actions.test.ts` (11.3).
- Commit: `HU-018a: actions de recetas y rutas de fotos (panel y portal)`

### Fase E: UI de `apps/web` (018a-1)
- [ ] E1. `components/recipes/*` y `lib/recipe-view.ts` (7.1).
- [ ] E2. `/recetas` (lista, pestañas, filtros, estados) y `loading.tsx`.
- [ ] E3. `recipe-form.tsx` y `recipe-portion-summary.tsx` (7.3), con `nueva/` y `[id]/`.
- [ ] E4. `nav-config.ts`.
- [ ] E5. `npm run typecheck`, `npm run test` y `npm run build --workspace apps/web`.
- Commit: `HU-018a: pantalla Recetas (grilla, buscador, ficha y editor con foto)`

### Fase F: verificación de 018a-1
- [ ] F1. `scripts/test-recipes.ts` (11.4) y el script `test:recipes`.
- [ ] F2. Correr toda la verificación de 12.1 (a-1) y el recorrido en Chrome (12.2).
- [ ] F3. `progress/impl_HU-018a.md` (o `-1`).
- Commit: `HU-018a: script de flujo de recetas`

### Fase G: `recipe-import` en core (018a-2)
- [ ] G1. `text.ts` e `ingredient-line.ts`, con sus tests.
- [ ] G2. `files.ts` (exclusiones, byn, sugerencias por archivo), con tests.
- [ ] G3. `__fixtures__/synthetic.ts` (recetas inventadas en F1, F2, F3, F4 y F5) y `extract.ts`, con tests.
- [ ] G4. `food-suggest.ts` y `RECIPE_FOOD_SYNONYMS`, con tests.
- [ ] G5. `bundle.ts` y `validateRecipeBundle`, con tests.
- [ ] G6. Export en `packages/core/package.json`.
- Commit: `HU-018a: parser de recetarios (líneas de ingrediente, páginas, sugerencias, bundle)`

### Fase H: scripts y dominio de import (018a-2)
- [ ] H1. `domain/recipeImport.ts` y su test, con export en `domain/index.ts`.
- [ ] H2. `scripts/recipes/extract.ts` (dry-run primero) y `undo.ts`.
- [ ] H3. Dry-run sobre todo `docs/recetarios/`: anotar los números de 8.5.
- [ ] H4. `domain/recipeTransfer.ts` y su test, con `export.ts` e `import.ts` (dry-run por defecto).
- Commit: `HU-018a: extracción de borradores, deshacer corrida y pase a producción`

### Fase I: revisión en `apps/web` (018a-2)
- [ ] I1. `api/recetas/importacion/[imageId]/route.ts` y su test.
- [ ] I2. `revisar/actions.ts` y su test.
- [ ] I3. `revisar/page.tsx` y `revisar/[id]/*` (7.5). Modo revisión en `recipe-form.tsx` (prop `mode: "edit" | "review"`).
- [ ] I4. Pestaña "Para revisar" en `/recetas`.
- Commit: `HU-018a: pantalla de revisión de borradores`

### Fase K: verificación de 018a-2
- [ ] K1. `--write --images --file "<un recetario F1>"` contra la base de desarrollo. Revisar y publicar 2 borradores en Chrome.
- [ ] K2. `recipes:export` de esas 2 → `recipes:import:prod` **en dry-run contra la base de desarrollo** (tiene que dar `skipped-exists` las 2 veces: así se prueba la idempotencia sin tocar producción).
- [ ] K3. Limpieza: `recipes:undo` de la corrida (borra solo los borradores no revisados de esa corrida). Las 2 publicadas se borran **por id** en `test-recipes.ts --cleanup-ids` o con `psql` puntual por id. Anotarlo.
- [ ] K4. Verificación completa (12.1, a-2) y `impl`.
- Commit: `HU-018a: verificación de la carga asistida`

---

## 11. Tests

### 11.1 `packages/core` (vitest)

`recipes.test.ts`:
- **Macros**:
  - Receta de ejemplo del Gherkin con alimentos ficticios (valores inventados por 100 g): 500 g +
    300 g + 70 g + perejil c.n. y rendimiento 8. `total` = suma exacta, redondeada al final;
    `perPortion` = total / 8.
  - Redondeo: 3 ingredientes con decimales; la suma no acumula el redondeo por ítem (comparar con
    `computeItemMacros` sumados).
  - Sin rendimiento: `perPortion` y `atwaterPerPortion` dan `null` y el aviso es `warnNoYield`.
  - Con c.n. y sin grupos calóricos: `warnNoQuantityOne` y `warnNoQuantityMany`.
  - Con c.n. y aceite (grupo ACEITES): el texto exacto `Perejil y aceite de oliva sin cantidad: aceite de oliva puede sumar muchas kcal`.
  - Texto libre: `warnFreeText` exacto. Los gramos de texto libre cuentan en `estimatedPortionGrams`
    pero no en los macros.
  - Alimento sin gramos ni c.n.: aparece en `missingGrams`. `grams = 0` se trata como sin gramos.
  - `atwaterPerPortion.parts`: P×4, CHO×4, G×9. `totalKcal` = `perPortion.kcal`.
  - `ingredientDisplayName`: devuelve el label si tiene; si no, corta el nombre en la primera coma.
- **Porciones**:
  - `normalizePortions`: 0.5, 1, 1.5, 4 son válidos; 0, 0.25, 4.5, -1, NaN y 1.4999999 → 1.5.
  - `stepPortions`: tiene tope en 0,5 y en 4.
  - `formatPortions`: "½ porción", "1 porción", "1½ porciones", "2 porciones".
  - `recipeItemMacros(null, 2)` da `null`.
- **Comparación**:
  - 262 vs 305: `exceeds` y el mensaje exacto del Gherkin.
  - 262 vs 280: diferencia del 6,9 %, no excede.
  - Publicado `null` o 0: `ratio` en `null` y sin aviso.
  - Justo en el 10 %: no excede.
- **Validación**:
  - Cada regla por separado, en el orden documentado.
  - Un IMPORT sin fuente da `errSource`; un MANUAL sin fuente pasa.
  - Ingrediente con alimento y `noQuantity`, sin gramos: pasa.
- **Búsqueda**:
  - "limon" encuentra una receta con el ingrediente "Limón".
  - Una receta con label "Puré de calabaza" y alimento "Zapallo, hervido" aparece buscando "zapallo".
  - Un tag "Sin TACC" aparece buscando "tacc".
  - Los chips combinan con AND.
  - Sin consulta, el orden es alfabético.
  - `recipeCountText` con 3 variantes.
- **Uso**: `recipeUsageWarning` con {3,1}, {1,0}, {0,2} y {0,0} → `null`, con singular y plural exactos.

`recipe-photo.test.ts`:
- Magic bytes de JPEG, PNG y WebP (`RIFF....WEBP`).
- Un `RIFF` que no es WEBP (por ejemplo WAV) da `null`.
- Tamaños 0, 5 MB exacto y 5 MB + 1.
- Orden de `validateRecipePhoto`.

`recipe-import/*.test.ts` (018a-2), **todo con texto inventado**:
- **`parseIngredientLine`**:
  - "Lentejas 500g" → grams 500, label "Lentejas".
  - "Harina integral 100 g (3/4 de taza)" → 100 y household "3/4 de taza".
  - "Puré de calabaza una taza (son 300g en crudo aprox.)" → 300, APPROX, household "una taza".
  - "Aceite de oliva 50cc (¾ de pocillo de café)" → grams `null`, VOLUME_ONLY.
  - "Huevo una unidad" → HOUSEHOLD_ONLY.
  - "Perejil c.n" y "Sal c/n" → noQuantity.
  - "Una cebolla y morrón picados" → MULTI_FOOD.
  - "Avena 30 g o 40 g" → AMBIGUOUS_GRAMS, grams `null`.
  - "Queso 1,5 kg" → 1500.
  - Ligadura "ﬁna" → "fina".
  - **Propiedad**: para un conjunto de 30 líneas, si `grams !== null`, el `rawText` contiene ese
    número seguido de g o kg.
- **`extractRecipesFromPages`** con fixtures sintéticos:
  - F1: nombre en 2 renglones, rinde 8, tabla con números debajo de las etiquetas, 6 ingredientes y 4 pasos.
  - F2: títulos rotados; los ingredientes y los pasos se separan por el cambio de viñeta.
  - F3: subtítulos que no son ingredientes y que generan un warning.
  - F4: 3 colaciones en una página → 3 borradores con su porción.
  - F5: intro e índice → `skippedPages` con su motivo.
  - La misma entrada da la misma `importKey`. `recipeImportKey` es igual para "X_compressed (1).pdf" y "X.pdf".
- **`files`**: "Reemplazos (2).pdf" y "conservacion … byn" quedan excluidos. "Colaciones byn" sale
  porque existe a color. "panes y pizzas byn" se queda porque no tiene versión a color. Los PPTX
  quedan excluidos.
- **`suggestFood`**:
  - "Lentejas" encuentra "Lentejas, secas, crudas" (catálogo ficticio).
  - "Puré de calabaza" llega a zapallo por sinónimo.
  - "Dientes de ajo" encuentra "Ajo".
  - Una palabra que no está en el catálogo da `null`.
  - A igual ranking, gana SARA2 sobre PROPIO.
  - Los alimentos inactivos se ignoran.
- **`validateRecipeBundle`**:
  - Acepta un bundle válido.
  - Rechaza formato ≠ 1, recetas sin `importKey`, ingredientes con food mal formado y base64 inválido.

### 11.2 `packages/db` (vitest, prisma mockeado, patrón de `weeklyMenu.test.ts`)

`recipes.test.ts`:
- `createRecipe` con datos inválidos tira `RecipeNotPublishableError` con las issues y no crea nada.
- `updateRecipe` sobre PUBLISHED usa una transacción: `deleteMany({ where: { recipeId: id } })` y
  después `createMany` con `order` = índice.
- `updateRecipe` sobre DRAFT no valida y pone `reviewedAt` solo si era null.
- Transiciones: `publishRecipe` solo desde DRAFT y borra las importImages; `archiveRecipe` solo
  desde PUBLISHED; `unarchiveRecipe` solo desde ARCHIVED. Cualquier otra tira `RecipeStatusError`.
- `deleteDraftRecipe` sobre PUBLISHED tira `RecipeStatusError`.
- `setRecipePhoto` hace delete + create en una transacción y devuelve el id nuevo.
- `listRecipeCards`:
  - El `select` no incluye `data` ni `thumbData`. Se verifica el argumento del mock.
  - `perPortion` coincide con `computeRecipeMacros`.
  - Los `Decimal` se convierten a number.
- `getRecipeUsage` cuenta planes y plantillas distintos con el `where` de `recipeId`.
- `patientCanSeeRecipePhoto` usa el `where` de 5.1: plan `ACTIVE` y `patientId`.

`media/recipe-photo.test.ts` (sharp real, sin red):
- Un JPEG de 4000×3000 generado con `sharp({create})` sale WebP de 1200×900 y su thumb de 480×360.
- Un PNG con alfa de 500×800 sale contenido (no se recorta) y conserva el alfa.
- Una entrada basura tira `InvalidRecipeImageError`.
- La salida no tiene EXIF (`metadata().exif` undefined).

`recipeImport.test.ts` (a-2):
- `upsertImportedDraft` cubre los 4 resultados.
- Un DRAFT revisado no se pisa.
- Nunca hace `update` ni `delete` sobre otro id.
- `deleteUnreviewedDrafts` filtra por `id in ids`, `status DRAFT` y `reviewedAt null`.

`recipeTransfer.test.ts` (a-2):
- El mapeo de SARA2 por `sourceKey` funciona.
- Un PROPIO con 2 coincidencias da `skipped-food`, y lo mismo uno con macros distintos.
- Una receta existente da `skipped-exists`.
- `dryRun` no llama a `create`.

### 11.3 `apps/web` (vitest con mocks, patrón de `signature-actions.test.ts` y `api/professional/signature/route.test.ts`)

- `recetas/actions.test.ts`:
  - Sin sesión da `sessionExpired`.
  - Un payload inválido para zod devuelve error.
  - Una foto de 6 MB da `photoInvalid` y no llama a `processRecipePhoto`.
  - Una foto con el MIME del navegador "image/jpeg" pero bytes de GIF da `photoInvalid`.
  - Si la receta se guarda y falla `processRecipePhoto`, devuelve `{ ok:false, photoError }` con el id.
  - Los `console.error` no incluyen el payload (se espía `console.error`).
- `api/recetas/fotos/[photoId]/route.test.ts`:
  - 401 sin sesión, 404 si no existe.
  - 200 con `Content-Type: image/webp` y `Cache-Control` inmutable.
  - Pide `size=full` o `thumb` según el parámetro.
- `portal/recetas/fotos/[photoId]/route.test.ts`:
  - 401 sin paciente.
  - 404 si `patientCanSeeRecipePhoto` da false.
  - 200 si da true.
- `revisar/actions.test.ts` (a-2): `publishDraftAction` con `candidateId` llama a
  `chooseImportCandidateAsPhoto` antes de `publishRecipe` y devuelve `nextId`.

### 11.4 Flujo contra la base: `packages/db/scripts/test-recipes.ts` (no entra en `typecheck`, igual que `test-weekly-menu.ts`)

Crea **sus propios** datos y los borra **solo por id** en `finally`:
- una receta MANUAL, con 2 alimentos SARA 2 existentes (solo lectura), un c.n. y un texto libre;
- un paciente "Prueba HU-018a" con teléfono ficticio `5490000018001`;
- un plan ACTIVE con una comida y un `PlanMealItem` con `recipeId` y `portions` 1.5, insertado
  con `prisma` directo porque el dominio de ítems de receta es de 018c.

Comprueba:
1. `createRecipe` inválida → issues. Válida → PUBLISHED.
2. `getRecipe` y `listRecipeCards` dan `perPortion` igual al cálculo de core con los macros leídos.
3. `setRecipePhoto` con una imagen generada por `processRecipePhoto` → `getRecipePhotoBytes`
   (full/thumb) devuelve WebP. Al reemplazarla, el id cambia.
4. `getRecipeUsage` da {1,0}.
5. `deleteDraftRecipe` sobre PUBLISHED falla.
6. Borrar la receta con el ítem presente falla por FK (Restrict).
7. `patientCanSeeRecipePhoto`: true con el plan ACTIVE; false después de pasar el plan a ARCHIVED;
   false para otro `patientId` inventado.
8. `archiveRecipe` y `unarchiveRecipe`.

Limpieza: borrar el ítem, la comida, el plan y el paciente por id, y después la receta por id (las
fotos y los ingredientes caen en cascada).

No encola nada en `OutboundMessage` y no usa WhatsApp.

En 018a-2 suma un tramo: `upsertImportedDraft` con un draft **sintético** (de los fixtures de core),
que cubre created, updated y skipped-reviewed, y `deleteUnreviewedDrafts` con su id.

---

## 12. Verificación y desvíos

### 12.1 Comandos (el implementer los corre antes de declararse `done`)

```bash
# raíz
npm run db:generate
npm run typecheck                      # core, db, web y bot
npm run test                           # vitest de todo el monorepo
npm run build --workspace apps/web     # next build
ls apps/web/.next/standalone/node_modules/sharp >/dev/null && echo "sharp en standalone"   # 12-D4
cd packages/db && npx dotenv -e ../../.env -- prisma migrate status   # "up to date"
npm run test:recipes --workspace packages/db
# 018a-2, además:
npm run recipes:extract --workspace packages/db                        # dry-run: números de 8.5
npm run recipes:extract --workspace packages/db -- --write --images --file "<F1>" --yes
npm run recipes:undo --workspace packages/db -- docs/recetarios/_extraccion/corrida-<…>.json
git status --porcelain docs/ | grep -v '^??' ; git check-ignore docs/recetarios/_extraccion/reporte.md   # nada de terceros trackeado
./ops/harness/verify.sh
```

Conteos de control antes y después (psql, solo lectura): `PlanMealItem`, `TemplateMealItem` y
`Food` iguales, y `Recipe` en 0 al terminar `test:recipes`.

### 12.2 Recorrido en Chrome (para el orquestador)

018a-1:
1. En la barra lateral, "Recetas" aparece entre "Alimentos" y "Plantillas". `/recetas` vacío
   muestra "Todavía no hay recetas. Cargá la primera.".
2. Hacer clic en "Nueva receta". Con "Guardar" sin datos aparecen los errores junto a cada campo y
   el resumen arriba.
3. Cargar "Albóndigas de prueba", con tipo, momentos, rinde 8 y porción "¾ albóndigas". Agregar
   ingredientes: lentejas (500 g), zapallo (300 g con medida "1 taza"), perejil c.n. y un texto
   libre "Pan rallado". El aside se actualiza mientras se escribe y muestra los avisos de c.n. y
   texto libre.
4. Subir un JPG de 3 MB: la vista previa sale al instante. Subir un GIF o un archivo de más de
   5 MB: aparece el error exacto.
5. Guardar: toast, la URL pasa a `/recetas/<id>`, la tarjeta aparece en la lista con la foto 4:3.
6. Buscar "zapallo" y "limon" sin tilde, combinar chips, usar "Quitar filtros". El contador cambia.
7. Archivar → toast con "Deshacer" → la pestaña "Archivadas" pasa a 1 → "Volver a publicar".
8. Celular (DevTools, 390 px): los chips se envuelven, los objetivos miden 44 px, el aside baja y
   la barra inferior muestra las kcal.
9. Teclado: Tab recorre el buscador, los chips y las tarjetas; el foco se ve siempre. En el picker,
   las flechas y Enter funcionan.
10. Abrir `/api/recetas/fotos/<id>?size=full` en una ventana de incógnito: 401.
11. Limpieza: borrar la receta de prueba por id (o archivarla y anotarlo).

018a-2:
12. Cargar un recetario con `--write --images --file`. Ir a "Para revisar (N)" → "Empezar a revisar".
13. En la columna Original, alternar entre Página y Texto. Elegir una de las fotos encontradas.
    Aceptar las sugerencias, completar un gramo marcado y ver el aviso de diferencia contra la
    tabla del recetario.
14. "Publicar y seguir" lleva al siguiente borrador. "Saltar" y "Descartar" funcionan. El filtro por
    recetario funciona.
15. Al terminar, `recipes:undo` de la corrida y borrado por id de las publicadas de prueba.

### 12.3 Desvíos y dudas técnicas (cada una con recomendación; ninguna bloquea)

- **D1. ¿La relación receta ↔ ítem de comida entra en 018a o en 018c?** **Recomendación: en
  018a, solo esquema y cálculo** (`recipeId` y `portions` nullable en `PlanMealItem` y
  `TemplateMealItem`, `recipeItemMacros`, `getRecipeUsage`, `patientCanSeeRecipePhoto` y la ruta
  del portal).
  - Así 018c queda **sin migración**: no compite por el lock de schema y puede ir en paralelo con
    otra HU que migre.
  - El aviso de D10 ("está en N planes") y el escenario "Archivar: los planes la siguen mostrando"
    funcionan desde el día uno (con N = 0), y `Restrict` protege los borrados.
  - La autorización del portal se prueba ahora.
  - Costo: dos columnas sin uso hasta 018c, que nadie escribe.
  - Si se prefiere no tocar ni el esquema de la zona de Leo, se saca de 3.1 y se agrega en 018c con
    su propia migración. El resto de esta SDD no cambia, salvo que `getRecipeUsage` devolvería 0
    fijo.
- **D2. Etiquetas y momentos como enums de Postgres (arrays), no como tablas.**
  - D12 dice que son valores fijos y que ella no los edita. Un enum es más simple, sin joins, y
    filtra en memoria.
  - Agregar un valor después es una migración trivial y no destructiva.
  - Si algún día los tiene que editar ella, se migra a una tabla (`RecipeTagDef` + tabla
    intermedia) con backfill desde el array.
  - El pedido mencionaba "tablas de etiquetas": queda como desvío consciente.
- **D3. Fotos en la base (`Bytes` en una tabla aparte), no en un storage.**
  - Es coherente con el logo, la firma y el diario.
  - Entran en el `pg_dump` (un solo respaldo) y no hay infraestructura nueva.
  - Con unas 300 recetas son unos 300 × (≈120 KB + ≈30 KB) ≈ 45 MB. Las candidatas de la carga
    asistida se borran al publicar.
  - La tabla aparte evita traer bytes por accidente en un `findMany` sin `select`.
  - Pasar a disco o S3 conviene si se superan unos 500 MB o si se suman fotos de pacientes en
    volumen.
- **D4. `sharp` como dependencia declarada en `packages/db`, con el procesamiento en el
  servidor.**
  - Achicar en el navegador con canvas no sirve: Safari no exporta WebP, la orientación EXIF varía
    entre navegadores y los scripts igual necesitarían `sharp`.
  - Riesgo: el binario de Linux en la imagen de Docker. `npm ci` en `node:20-slim` baja
    `@img/sharp-linux-*` y Next lo trazea al `standalone`, que es lo que chequea 12.1.
  - Si el `build` de Docker falla por `sharp`, el arreglo es copiar `node_modules/sharp` y
    `node_modules/@img` en la etapa `run` del `Dockerfile`, como ya se hace con `.prisma`.
- **D5. `bodySizeLimit` de 3 MB a 6 MB para todas las server actions.**
  - Es lo mínimo para una foto de 5 MB más el payload.
  - La alternativa es una ruta `POST` aparte solo para la foto, pero suma un segundo envío y el
    caso "receta nueva sin id" se complica.
  - Riesgo bajo: todas las actions exigen sesión.
- **D6. Combobox de ingredientes nuevo en vez de modificar `FoodPicker` (zona de Leo).**
  - `FoodPicker` no está controlado y la fila de ingrediente necesita un valor inicial y un
    `onChange`.
  - Para no tocar su zona, se hace `ingredient-food-picker.tsx`, que reusa `useFoodCatalog` y
    `searchFoods`. Se duplican unas 120 líneas de marcado ARIA.
  - **Recomendación**: unificar los dos en un combobox controlado cuando Leo haga 017e (rediseño de
    alimentos y planes), y avisarlo en el PR.
- **D7. `next/image` con `unoptimized`.** El optimizador de Next pide la imagen desde el servidor
  sin las cookies de la sesión, así que las rutas privadas le darían 401. Las fotos ya se guardan
  en WebP del tamaño justo (thumb y full), y `next/image` igual aporta lazy loading, `sizes` y la
  reserva del espacio.
- **D8. La revisión se hace en desarrollo y pasa a producción con un bundle.**
  - El callback `jwt` de `auth.ts` guarda el `refresh_token` de quien se loguee, y el proveedor
    pide `prompt: "consent"`. Si Joel entrara al panel de producción, la sincronización de Google
    Calendar de Daiana pasaría a su cuenta.
  - Alternativa: corregir `auth.ts` para que guarde el token solo si el email es el de la
    profesional. Es un cambio chico, pero fuera de esta HU y en un archivo sensible. **Recomendación:
    abrirlo como tarea directa aparte**: es un bug latente aunque no se haga 018a.
  - El bundle además saca a producción solo recetas revisadas, sin los ~250 borradores.
- **D9. La comparación D4 se dispara solo por las kcal.** Las proteínas, carbohidratos y grasas se
  muestran lado a lado, sin aviso. En porciones chicas los gramos tienen diferencias relativas
  grandes por redondeo (1,87 g contra 2,3 g ya es un 23 %) y avisar por eso sería ruido.
- **D10. Corte en 018a-1 y 018a-2** (sección 10). **Recomendación: aprobarlo.**
  - La HU completa son unos 45 archivos.
  - La parte 1 ya le sirve a Daiana para cargar recetas a mano. La parte 2 no tiene migración.
  - Si se prefiere un solo PR, el orden de las fases ya sirve tal cual.
- **D11. "cc" no se convierte a gramos**, ni siquiera para agua o leche. D5 dice "no se inventan
  gramos": queda `VOLUME_ONLY` y lo completa el revisor.
- **D12. El borrador no guarda la sugerencia de alimento.** Se calcula en el cliente cada vez que
  se abre la revisión. Así se evitan columnas de estado de revisión, y la sugerencia mejora sola si
  cambia el catálogo. Costo: "Dejar como texto" no persiste hasta que se guarda; al guardar, el
  ingrediente queda como texto libre igual.
- **D13. Los borradores de la carga asistida se ven en el panel de desarrollo, no en el de
  producción.** En producción la pestaña "Para revisar" se oculta con N = 0 y no le agrega
  decisiones a Daiana.
- **D14. Las recetas no tienen su propia ilustración.** Sin foto se usa un ícono de lucide por
  tipo sobre `bg-muted`. Es la "ilustración neutra" de la HU sin sumar assets.
- **D15. Licencias (D3).** El sistema no registra la confirmación de licencia: queda fuera del
  sistema, como dice la resolución. El código garantiza que nada de terceros entre al repo: los
  fixtures son sintéticos, el reporte, las corridas y los bundles van a `docs/recetarios/`
  (ignorado) y la consola muestra solo contadores.

Ninguna duda bloquea. Si el orquestador o el usuario eligen distinto en D1, D8 o D10, se ajusta
el checklist sin rediseñar.

---

## 13. Para 018c (lo que deja 018a y lo que falta)

Ya queda listo:
- Columnas `PlanMealItem.recipeId`, `portions` y lo mismo en `TemplateMealItem`.
- `recipeItemMacros`, porciones de ½ y `formatPortions`.
- `listRecipeCards({ status: "PUBLISHED" })` con `perPortion`, `searchText`, `photoId`, `type`,
  `moments` y `tags`.
- `filterRecipes`.
- `RecipeCard` con su slot `footer`, `RecipeGrid`, `RecipeFilters` y `ChipGroup`.
- `chartPalette.macro`.
- Rutas de foto del panel y del portal, con `patientCanSeeRecipePhoto`.
- `getRecipe` para el detalle.

Falta (en 018c):
- `inferMomentFromMealName` (D11).
- Que el dominio de ítems escriba recetas (`addMealItem` y `addTemplateMealItem` con
  `recipeId`/`portions`, con el invariante de 3.1).
- Sumar `recipeId`/`portions` a `MenuItemData` (`weeklyMenu.ts`: copiar día, repetir, snapshots),
  a `applyTemplateToPatient` y a los `select`/`include` de `getPlan`/`getTemplate`.
- `meal-view.ts`: macros del ítem = `recipeItemMacros`.
- `computePlanMicronutrients`: expandir la receta a sus ingredientes × porciones / rendimiento.
- Portal ("Ver receta" con la fuente) y la línea en el PDF.
- El buscador (Sheet) y el impacto por día.

---

## 14. Fuera de alcance (no implementar en 018a)

- Buscador dentro de la comida, ítem de receta en la UI del plan o la plantilla, portal y PDF con
  recetas (018c).
- Medidas caseras de alimentos sueltos con conversión (018d).
- IA para estructurar los recetarios (D5 c).
- Importador de imágenes de los PPTX: se suben a mano como foto, con el crédito.
- Guías educativas (D20).
- Etiquetas editables.
- Crudo/cocido y factor de rendimiento.
- Edición de recetas ya importadas a producción vía bundle: se corrigen en el panel.
- Cualquier mensaje de WhatsApp.

## 15. Decisiones del usuario (2026-10-03)

- **Corte:** dos PR. Primero **018a-1** (recetario manual, con la migración `recipes` y la receta como ítem de una
  comida en el modelo), después **018a-2** (carga asistida, sin migración), en una rama nueva desde `develop`.
- **Sección 12:** aceptadas todas las recomendaciones.
- **Bug de `auth.ts`:** el `refresh_token` de Google se guarda para cualquiera que inicie sesión. Se arregla en una
  **tarea directa aparte**, después de la 018a. Mientras tanto, Joel no entra al panel de producción, y la revisión
  de las recetas se hace en desarrollo y se lleva con export/import.
- **Implementer:** Opus, con los skills `migracion-prisma`, `apple-design` y `ui-ux-pro-max`.
