# SDD: HU-018c `buscador-recetas` (buscador de recetas en cada comida, con impacto en el día)

HU validada: `docs/hu-plan-recetas-buscador.md` (validada el 2026-10-03). Esta SDD cubre **solo la
parte 018c**: Gherkin "018c — Buscador de recetas con impacto por día", "Agregar una receta a la
comida" y "La receta en el resto del sistema"; Datos "Ítem de receta"; Diseño UX §1 (ítem de receta),
§2 (buscador) y §4 (portal y PDF, parte 018c). 018a (recetario) y 018b (menú semanal) ya están en
`develop`. 018d (medidas caseras de alimentos sueltos) queda fuera.

Rama: `feat/hu-018c-buscador-recetas`, que sale de `develop` (`cacca16`, con 018a-1, 018a-2 y 018b).

Resoluciones que mandan:

| Duda | Cómo se aplica acá |
|---|---|
| D3 = (b) y D19 | El paciente ve la receta completa (foto, ingredientes, preparación y tips), con "Fuente: …" si la receta tiene fuente. La ve en el portal y, en una línea, en el PDF. No ve los macros. La foto solo se sirve si la receta está en un plan ACTIVE del paciente (`patientCanSeeRecipePhoto`, de 018a) |
| D8 | El buscador es un `Sheet` lateral derecho, de unos 2/3 del ancho en escritorio y de pantalla completa en el celular (ver 13-D1 por el lado del sheet) |
| D9 | Se agrega 1 porción por toque. El control "− 1 porción +" va de ½ en ½, entre ½ y 4. Usa `stepPortions` y `normalizePortions` de 018a |
| D10 | Ya está hecho en 018a: `recipe-form.tsx` muestra `recipeUsageWarning(getRecipeUsage)`. 018c solo hace que el conteo deje de ser 0, porque ahora sí se escriben ítems de receta. Se verifica en el recorrido |
| D11 | El momento sale de inferirlo del nombre de la comida (`inferMomentFromMealName`, en core). Viene preseleccionado y se puede quitar con el chip "Todos" |
| D13 | El buscador muestra solo recetas `PUBLISHED`. `food-picker` no se toca |
| D14 + resolución | El encaje compara el total **después** de agregar contra el objetivo, con ±5 % (`compareToTarget` de 018b). Con varios días marcados se muestra el peor. En una comida "Todos los días" se compara contra el promedio semanal. No se ordena por encaje |
| N1 = (a) | Una comida de opciones suma el promedio. El impacto se calcula con la misma función que los totales (`computeWeeklyTotals` con el ítem agregado), así que el promedio sale solo |
| D17 | En las plantillas el buscador es el mismo, pero sin franja, sin porcentajes y sin encaje |

Skills: `ui` (sección 7, pantallas concretas), `.claude/skills/apple-design/SKILL.md` y los primitivos
y tokens de HU-017a.

> **Verificación del architect (2026-10-03, solo lectura).**
> - **No hace falta migración.** Base de desarrollo (Postgres en el puerto 5433): última migración
>   aplicada `20261003102553_recipes`, igual a la última carpeta. `PlanMealItem` ya tiene
>   `recipeId text NULL` (FK `ON DELETE RESTRICT`), `portions numeric(3,1) NULL` y el índice
>   `PlanMealItem_recipeId_idx`. Lo mismo pasa en `TemplateMealItem`. Hoy hay 0 ítems de receta, 9
>   recetas (1 `PUBLISHED`), 10 planes y 0 plantillas.
> - `packages/core/src/recipes.ts` ya tiene `PORTION_STEP/MIN/MAX`, `normalizePortions`,
>   `stepPortions`, `formatPortions`, `scaleMacros`, `recipeItemMacros`, `filterRecipes`,
>   `recipeCountText` y `recipeUsageWarning`. `weekly-menu.ts` ya tiene `computeWeeklyTotals`,
>   `compareToTarget`, `formatTargetStatus`, `joinWeekdaysEs` y `MacroTarget`.
> - `packages/db/domain/recipes.ts` ya tiene `listRecipeCards`, `getRecipe`, `getRecipeUsage` (ya
>   se usa en `recetas/[id]/page.tsx`) y `patientCanSeeRecipePhoto`. La ruta
>   `(portal)/portal/recetas/fotos/[photoId]/route.ts` ya existe.
> - `weeklyMenu.ts`: `itemCopyData` y `MenuItemData` copian solo `foodId`, `customLabel`,
>   `quantityGrams` y `notes`. Hoy, un "Copiar día", un "Repetir" o un "Deshacer" **perderían** la
>   receta, así que hay que extenderlos (5.1). `applyTemplateToPatient` tampoco copia `recipeId` ni
>   `portions`.
> - `weekly-menu-actions.ts#restoreMealsAction` valida la foto con zod `.strict()`. Si
>   `MenuItemData` suma campos y el esquema no, el "Deshacer" de "Copiar día" **falla** apenas haya
>   una receta en el plan.
> - `getPlan`/`getTemplate` incluyen `items: { include: { food: true } }`. El portal arma su propio
>   `include` en línea (`portal/plan/page.tsx`). Ninguno de los dos trae la receta.
> - `toMealView`, `PortalMealItems`, `ItemRows` (PDF) e `itemLabel` (vista Semana) muestran
>   `foodName ?? customLabel`. Hoy un ítem de receta saldría como "—" o "(sin descripción)".
> - `RecipeCard` envuelve la tarjeta en un `<Link>` y tiene un slot `footer` fuera del enlace, que se
>   pensó para 018c. `RecipeGrid` usa breakpoints del viewport (`lg:3`, `2xl:4`), que dentro de un
>   panel de 2/3 dan 4 columnas angostas. `RecipeFilters` tiene el placeholder fijo. `ChipGroup` no
>   tiene opciones deshabilitadas ni `aria-label` por opción.
> - Los `Sheet` que ya hay en el repo usan `side="right"` con `w-full` en el celular (servicios,
>   datos de fórmula, turno). El primitivo permite cerrar arrastrando en los laterales con el dedo.
> - **Turbopack** (`npm run dev` usa `next dev --turbopack`) rechaza en un archivo `"use server"`
>   cualquier export que no sea una función async, y también un `export type { … } from`. En la
>   018a-2 eso solo se vio en el recorrido. La verificación incluye `next build --turbopack`
>   (12.1).
> - El bot no lee planes ni recetas: solo usa `NutritionPlan.pdfData` y no importa `getPlan`.
> - Portal sin WhatsApp: `createPatientToken(patientId, ttl)` (`domain/patientAuth.ts`) y
>   `/portal/login?token=…` dan una sesión de paciente local. No se manda ningún mensaje.

---

## 1. Resumen funcional

En cada comida del plan, o de la plantilla, aparece el botón primario **"Agregar receta"**. Abre un
panel lateral titulado, por ejemplo, "Agregar a Desayuno · Martes", que en el celular ocupa toda la
pantalla. Arriba del panel se repite, compacta, la franja del día que se está editando. Debajo hay un
buscador por ingrediente o nombre (sin tildes ni mayúsculas), chips de tipo, momento (preseleccionado
desde el nombre de la comida) y etiquetas, y una grilla de tarjetas con foto. Cada tarjeta muestra la
porción casera, las kcal y P/C/G de 1 porción y, si el paciente tiene objetivo, **cuánto suma al día**
("Suma 14 % de las kcal del martes") y si **entra o se pasa** ("Se pasa en grasas el jueves (+8 g)").
Ese cálculo evalúa los días marcados en "Agregar en:" y muestra el peor; en una comida "Todos los
días" usa el promedio semanal, y en una de opciones, el nuevo promedio. "Agregar" suma 1 porción sin
cerrar el panel. Después la tarjeta pasa a "Agregada" con "− 1 porción +" y "Quitar", y aparece un
toast con "Deshacer". Tocar la tarjeta abre el detalle (foto grande, ingredientes, preparación,
fuente y el mismo impacto). En el editor el ítem de receta se ve con miniatura, nombre, porción casera,
kcal, el control de porciones y "Quitar". "Copiar día", "Repetir", "Deshacer", cambiar el modo y
aplicar una plantilla conservan las recetas. Los micronutrientes suman los ingredientes por porción.
En el portal la receta aparece con miniatura, porción y "Ver receta" (receta completa con la fuente,
sin macros). En el PDF mínimo sale una línea con nombre, porción y fuente.

---

## 2. Workspaces afectados

| Workspace | ¿Cambia? | Qué |
|---|---|---|
| `packages/core` | **Sí** | Nuevo `recipe-picker.ts`: momento desde el nombre de la comida, impacto en el día o el peor día, textos del buscador, concordancia de género y textos de porción e ingrediente. `recipes.ts` suma `expandRecipeIngredients` (micronutrientes). Todo con tests |
| `packages/db` | **Sí, sin schema** | `domain/weeklyMenu.ts`: `MenuItemData` con receta, `addRecipeItems`, `setRecipeItemPortions`, `removeMenuItems` e invariante de receta en las fotos. `domain/recipes.ts`: `RECIPE_ITEM_SELECT`, `getRecipePreview` y `listPlanRecipePreviews`. `domain/nutritionPlans.ts` y `planTemplates.ts`: el `include` trae la receta, y `applyTemplateToPatient` la copia. Script `scripts/test-recipe-picker.ts`. **No se toca `schema.prisma` y no hay migración** |
| `apps/web` | **Sí** | Buscador (`components/recipe-picker/*`), actions `recipe-picker-actions.ts`, ítem de receta en el editor, `meal-view.ts`, portal ("Ver receta"), línea del PDF y ajustes chicos a componentes de 018a (`RecipeCard`, `RecipeGrid`, `RecipeGridSkeleton`, `RecipeFilters`, `ChipGroup`) y de 018b (`labels.ts`, `weekly-menu-actions.ts`) |
| `apps/bot` | **No** (solo `typecheck`) | No lee planes ni recetas. Igual se corre `typecheck`, porque cambian tipos de `@nutri-bot/db/domain` (`MenuItemData`) |

### 2.1 Zona de imleticio (Leo): qué se toca y hasta dónde

| Archivo | Cambio (mínimo) |
|---|---|
| `components/meals-editor.tsx` | (1) `MealItemView` suma `recipe?: RecipeItemView \| null`. (2) En `MealCard`, arriba del formulario "Agregar alimento", va el botón **"Agregar receta"** (abre el buscador). (3) En la lista de ítems, si `item.recipe`, se dibuja `<RecipeMealItem>` (componente nuevo) en vez del `<li>` actual. (4) `MealsEditor` monta un solo `<RecipePickerSheet>`, con estado `{ mealId, day }`. El formulario de alimentos, `FoodPicker` y las props no cambian |
| `lib/meal-view.ts` | `RawItem` suma `recipeId?`, `portions?` y `recipe?`. `toMealView` calcula los macros del ítem de receta. `toMicronutrientItems` expande la receta a sus ingredientes |
| `lib/plan-pdf.tsx` | `ItemRows`: si `item.recipe`, una línea con el nombre, la porción casera y "Fuente: …". Nada más |
| `(portal)/portal/plan/{page,plan-view,portal-day-view}.tsx` | `page`: suma la receta al `include` y carga `listPlanRecipePreviews` (018c-2). `PortalMealItems` dibuja el ítem de receta y "Ver receta" |
| `domain/nutritionPlans.ts`, `domain/planTemplates.ts` | Solo el `include` de `getPlan`/`getTemplate` y los dos campos en `applyTemplateToPatient` |
| `components/food-picker.tsx`, `food-catalog.tsx`, `planes/**/actions.ts`, `plantillas/**`, `alimentos/**` | **No se tocan.** Para quitar un ítem de receta se usa `deletePlanMealItemAction`/`deleteTemplateMealItemAction`, que ya existen |

Hay que avisarle a Leo en el PR: "El ítem de receta se dibuja en `RecipeMealItem` (fuera de su
zona). En `meals-editor.tsx` solo hay un botón, una rama del `map` y el montaje del Sheet. El PDF
tiene una línea por receta. Lo que queda para la HU-015 está en la sección 14."

---

## 3. Esquema (Prisma): **sin migración**

Las columnas ya existen desde 018a (ver la verificación de arriba). 018c **no edita
`schema.prisma`**, no corre `prisma migrate` y no toma el lock de schema del equipo.

Invariantes que asegura el dominio (no la base), y que 018c empieza a escribir:

1. Un ítem con `recipeId` tiene `foodId = null`, `quantityGrams = null`, `customLabel = null` y
   `portions = normalizePortions(portions)` distinto de null.
2. Un ítem sin `recipeId` tiene `portions = null`.
3. Siguen valiendo las de 018b (weekday contra el modo; `order` correlativo por `(mealId, weekday)`).
4. Solo se **agregan** recetas `PUBLISHED`. Una receta que se archiva después sigue en los planes con
   sus macros (`RECIPE_ITEM_SELECT` no filtra por estado).

Si el implementer cree que necesita una migración, **para y reporta `blocked`**. No hay nada en esta
HU que la justifique.

---

## 4. Contrato compartido: `packages/core`

Todo puro. Lo consumen `apps/web` y `packages/db` (scripts).

### 4.1 `packages/core/src/recipe-picker.ts` (nuevo; `export *` desde `index.ts`)

```ts
import type { Macros } from "./nutrition";
import type { RecipeMomentKey } from "./recipes";
import type { MacroTarget, Weekday, WeeklyMenuMeal } from "./weekly-menu";

// ── D11: momento desde el nombre de la comida ──
/**
 * Normaliza con foodSearchText (sin tildes ni mayúsculas) y busca palabras completas. Gana la PRIMERA
 * que aparece en el texto:
 *   desayuno → BREAKFAST · almuerzo → LUNCH · merienda → AFTERNOON_SNACK · cena → DINNER
 *   colacion | colaciones → SNACK · "media manana" → SNACK · "media tarde" → AFTERNOON_SNACK
 * Sin coincidencia → null (el buscador abre sin momento).
 */
export function inferMomentFromMealName(name: string): RecipeMomentKey | null;

/** Filtros con los que abre el buscador: EMPTY_RECIPE_FILTERS + moment inferido. */
export function initialPickerFilters(mealName: string): RecipeFilters;

// ── Alcance de lo que se agrega ──
export type PickerScope =
  | { kind: "DAYS"; focusDay: Weekday; days: readonly Weekday[] } // comida PER_DAY; days incluye focusDay
  | { kind: "EVERY_DAY" }                                          // comida EVERY_DAY de un plan semanal
  | { kind: "PLAN" };                                              // plan no semanal (todas EVERY_DAY)

/** Alcance según el plan, la comida y los días marcados. Lo usan el sheet y los textos. */
export function pickerScope(
  meals: readonly Pick<WeeklyMenuMeal, "mode">[],
  meal: Pick<WeeklyMenuMeal, "mode">,
  focusDay: Weekday | null,
  markedDays: readonly Weekday[],
): PickerScope;

/** Días de `days` en los que la comida NO tiene ya un ítem de esa receta (no se duplica). */
export function daysMissingRecipe(
  meal: { mode: "EVERY_DAY" | "PER_DAY"; items: readonly { weekday: Weekday | null; recipeId?: string | null }[] },
  recipeId: string,
  days: readonly Weekday[],
): Weekday[];

// ── D14: impacto ──
export type ImpactMacro = "kcal" | "protein" | "carbs" | "fat";
export type RecipeFit =
  | { kind: "FITS" }
  | { kind: "OVER"; macro: ImpactMacro; excess: number; day: Weekday | null }; // day solo en DAYS con > 1 día
export interface RecipeImpact {
  reference: "DAY" | "WEEK_AVERAGE" | "PLAN_DAY";
  /** Día de referencia (focusDay) en DAYS; null en los otros. */
  day: Weekday | null;
  /** Macros del día de referencia ANTES y DESPUÉS de agregar (vista previa en la franja). */
  before: Macros;
  after: Macros;
  /** round((after.kcal − before.kcal) / target.kcal × 100). Puede ser 0 o negativo (opciones). */
  percentOfTarget: number;
  /** Comida de opciones: el nuevo promedio de la comida (kcal). null si no es de opciones. */
  optionsAverageKcal: number | null;
  fit: RecipeFit;
}
export interface RecipeImpactContext { /* opaco: meals, meal, scope, target y totales base ya calculados */ }

/**
 * null si target es null (plantillas o plan sin prescripción: no hay impacto, D17) o si mealId no
 * está en meals. Se calcula una vez por (meals, mealId, scope, target) y se reusa en todas las tarjetas.
 */
export function prepareRecipeImpact(params: {
  meals: readonly WeeklyMenuMeal[];
  mealId: string;
  scope: PickerScope;
  target: MacroTarget | null;
}): RecipeImpactContext | null;

/**
 * Semántica de referencia (los tests la comparan contra esto): agregar a la comida un ítem ficticio
 * { id: "__preview", macros: add } con weekday = cada día de scope.days (DAYS) o null (EVERY_DAY/PLAN),
 * y recalcular con computeWeeklyTotals.
 *   - DAYS: after/before = days[focusDay]. Encaje: para cada día marcado, el macro con mayor exceso
 *     relativo (excess/target) entre los que dan OVER en compareToTarget (±5 %). Gana el día con mayor
 *     exceso relativo (empate: el primero de la semana). Ninguno OVER → FITS.
 *   - EVERY_DAY: after/before = weeklyAverage (si es null, days.MON). Encaje sobre esa referencia.
 *   - PLAN: after/before = days.MON. Encaje sobre ese día.
 * `add` = perPortion × 1 (se agrega 1 porción).
 */
export function computeRecipeImpact(ctx: RecipeImpactContext, add: Macros): RecipeImpact;

/** Textos de la tarjeta y el detalle (exactos en 4.3). */
export function formatRecipeImpact(impact: RecipeImpact, scope: PickerScope): { percentText: string; fitText: string };

// ── Textos de porción e ingrediente (editor, portal, PDF, detalle) ──
/**
 * household vacío → formatPortions(p) ("1½ porciones").
 * p = 1 → "1 porción (2 panqueques)". Otro → "1½ porciones (1 porción = 2 panqueques)".
 */
export function recipePortionText(portions: number, household: string | null): string;
/** noQuantity → "c.n." · casera + g → "1 taza (300 g)" · solo casera → "1 taza" · solo g → "300 g" · nada → "". */
export function formatIngredientAmount(i: { household: string | null; grams: number | null; noQuantity: boolean }): string;

// ── Concordancia (como 018b, pero sobre el nombre de la receta) ──
/**
 * Género y número aproximados por la PRIMERA palabra (normalizada): plural si termina en "s";
 * femenino si termina en a/as/ión/iones o está en FEMININE_WORDS (leche, carne, nuez, miel, coliflor, sal).
 */
export function genderNumberEs(phrase: string): { feminine: boolean; plural: boolean };
/** "agregado" → "agregada" / "agregados" / "agregadas" según genderNumberEs(phrase). */
export function agreeParticipleEs(phrase: string, participle: string): string;

// ── Textos del buscador ──
export function pickerTitle(mealName: string, scope: PickerScope): string;
export function addButtonLabel(dayCount: number): string;            // 1 → "Agregar" · n → "Agregar en n días"
export function recipeAddedMessage(recipeName: string, mealName: string, scope: PickerScope, addedDays: readonly Weekday[]): string;
export const PICKER_SUGGESTED_INGREDIENTS: readonly string[];        // ["avena", "huevo", "banana", "pollo"]
export const RECIPE_PICKER_TEXT: { /* 4.3 */ };
```

Notas de implementación:
- `prepareRecipeImpact` puede guardar los totales base y la lista de opciones de la comida por día.
  Lo único que se exige es que `computeRecipeImpact` dé **lo mismo** que la semántica de referencia.
  El test 11.1 compara las dos con fixtures.
- Las opciones (N1) salen de la semántica de referencia: el ítem ficticio entra en el promedio.
  `optionsAverageKcal` = `mealTotalForDay(meal con el ítem, día de referencia).macros.kcal`.
- Se reusan `foodSearchText` (normalización), `computeWeeklyTotals`, `mealTotalForDay`,
  `compareToTarget`, `joinWeekdaysEs`, `WEEKDAY_LABELS`, `formatPortions` y `formatMacroAmount`. No
  se duplica ninguno.

### 4.2 `packages/core/src/recipes.ts` (agregado)

```ts
/**
 * Micronutrientes (HU-010) de un ítem de receta: los ingredientes escalados a las porciones del ítem.
 * grams = ingrediente.grams × portions / yieldPortions. Se omiten los noQuantity (c.n., no suman, igual
 * que en los macros). Los de texto libre (food null) o sin gramos quedan con food o grams en null, así
 * cuentan como "sin dato" en la cobertura. yieldPortions ≤ 0 o null → [].
 */
export function expandRecipeIngredients<F>(
  ingredients: readonly { grams: number | null; noQuantity: boolean; food: F | null }[],
  yieldPortions: number | null,
  portions: number,
): { food: F | null; grams: number | null }[];
```

### 4.3 Textos exactos (`RECIPE_PICKER_TEXT` y funciones de 4.1)

| Clave o función | Texto |
|---|---|
| `openButton` | `Agregar receta` |
| `pickerTitle` DAYS | `Agregar a {Comida} · {Martes}` (nombre de la comida como está; el día con `WEEKDAY_LABELS.long`) |
| `pickerTitle` EVERY_DAY | `Agregar a {Comida} · Todos los días` |
| `pickerTitle` PLAN | `Agregar a {Comida}` |
| `done` | `Listo` |
| `searchPlaceholder` | `Buscar por ingrediente o nombre: avena, pollo…` |
| `searchLabel` (aria) | `Buscar recetas por ingrediente o nombre` |
| `daysLabel` | `Agregar en:` |
| `daysHint` | `El {martes} queda marcado: es el día que estás editando.` |
| `addButtonLabel` | `Agregar` · `Agregar en {n} días` (n = días que todavía no la tienen) |
| `addAria` | `Agregar {receta} a {comida en minúscula} del {martes}` (EVERY_DAY/PLAN: `… a {comida}`) |
| `added` | `Agregada` (con ícono `Check`; concuerda con "receta") |
| `remove` | `Quitar` |
| `addError` | `No se pudo agregar. Probá de nuevo.` |
| `notPublished` | `Esta receta ya no está publicada.` |
| `portionsError` | `No se pudo cambiar la porción. Probá de nuevo.` |
| `removeError` | `No se pudo quitar. Probá de nuevo.` |
| `undone` | `Listo, se deshizo el cambio` (el mismo de 018b) |
| `recipeAddedMessage` DAYS | `{Receta} {agregado/a/os/as} a {Comida} ({martes, jueves y sábado})`. Ejemplo: `Panqueques de avena y banana agregados a Desayuno (martes, jueves y sábado)`. Solo lista los días en los que de verdad se agregó |
| `recipeAddedMessage` EVERY_DAY | `{Receta} {agregada…} a {Comida} (todos los días)` |
| `recipeAddedMessage` PLAN | `{Receta} {agregada…} a {Comida}` |
| `percentText` DAY | `Suma {14} % de las kcal del {martes}` |
| `percentText` WEEK_AVERAGE | `Suma {14} % de las kcal de cada día` |
| `percentText` PLAN_DAY | `Suma {14} % de las kcal del día` |
| `percentText` con 0 ≤ p < 1 | `Suma menos de 1 % de las kcal …` (mismo final) |
| `percentText` comida de opciones | `Como opción, la comida pasa a promediar {146} kcal` (reemplaza al porcentaje) |
| `fitText` FITS | `Entra en lo que falta` |
| `fitText` OVER | `Se pasa en {grasas} (+{8} g)`. Con más de un día marcado: `Se pasa en {grasas} el {jueves} (+{8} g)`. En EVERY_DAY: `Se pasa en {grasas} en el promedio (+{8} g)` |
| nombres del macro | `calorías` (unidad `kcal`), `proteínas`, `carbohidratos` y `grasas` (unidad `g`). Exceso entero, es-AR (`+1.200 kcal`) |
| `noResultsQuery` | `No hay recetas con «{quinoa}».` |
| `tryAnother` | `Probá con otro ingrediente:` (seguido de los chips de `PICKER_SUGGESTED_INGREDIENTS`) |
| `noResultsFilters` | `No hay recetas con estos filtros.` |
| `clearFilters` | `Quitar filtros` (lo trae `RecipeFilters`) |
| `createRecipe` | `Crear receta` (link a `/recetas/nueva`, `target="_blank"`, con `aria-label="Crear receta (se abre en otra pestaña)"`) |
| `emptyCatalog` | `Todavía no hay recetas cargadas.` + botón `Ir a Recetas` |
| `loadError` | `No se pudieron cargar las recetas.` + botón `Reintentar` |
| `itemBadge` | `Receta` |
| `stepperMinus` / `stepperPlus` (aria) | `Restar media porción de {receta}` / `Sumar media porción de {receta}` |
| `viewRecipe` (portal) | `Ver receta` |
| secciones del detalle | `Ingredientes`, `Preparación`, `Tips y conservación`, `Fuente: {sourceName}`, `Foto: {credit}` |
| `noTargetStrip` (plan sin objetivo) | `{Martes}: {1.240} kcal · P {70} g · C {150} g · G {40} g` |

---

## 5. Contrato compartido: `packages/db/domain`

### 5.1 `domain/weeklyMenu.ts` (cambios; Joel, 018b)

```ts
/** Un ítem tal como se copia o se restaura. HU-018c: + recipeId y portions. */
export interface MenuItemData {
  foodId: string | null;
  customLabel: string | null;
  quantityGrams: number | null;
  notes: string | null;
  order: number;
  weekday: Weekday | null;
  recipeId: string | null;   // HU-018c
  portions: number | null;   // HU-018c (null si no es receta)
}
```

- `ItemRow` suma `recipeId: string | null` y `portions: { toString(): string } | null`.
- `itemCopyData` (el único lugar que lista los campos) suma
  `recipeId: item.recipeId ?? null` y `portions: item.portions == null ? null : Number(item.portions)`.
  Así `setMealMode`, `copyDay`, `repeatMealInAllDays` y `restoreMealSnapshots` copian recetas sin
  más cambios.
- `assertSnapshotInvariants` suma: si `recipeId` no es null → `foodId === null`,
  `quantityGrams === null` y `normalizePortions(portions) !== null`. Si es null → `portions === null`.
  Si no se cumple → `MealModeError`.
- `ItemDelegate` suma `create`, `update` y `findMany`.

Funciones nuevas (parametrizadas por dueño, como las de 018b):

```ts
/** La receta no existe o no está PUBLISHED (D13). */
export class RecipeNotAvailableError extends Error {}

/**
 * Agrega `portions` (default 1) de una receta a una comida, en uno o varios días, en UNA transacción.
 *  - loadOwnedMeal (MealOwnershipError si la comida no es del dueño).
 *  - EVERY_DAY → weekdays tiene que ser null. PER_DAY → 1..7 días distintos y válidos. Si no → MealWeekdayMismatchError.
 *  - normalizePortions(portions) null → RangeError.
 *  - tx.recipe.findUnique({ where: { id: recipeId }, select: { status: true } }) ≠ PUBLISHED → RecipeNotAvailableError.
 *  - Por cada día (o [null]): order = (max order en (mealId, weekday), leído en la tx) + 1; create con
 *    { mealId, recipeId, portions, weekday, order, foodId: null, quantityGrams: null, customLabel: null, notes: null }.
 * Devuelve los ids creados en el orden de WEEKDAYS (para "Deshacer").
 */
export function addRecipeItems(
  kind: MealOwnerKind,
  ownerId: string,
  params: { mealId: string; recipeId: string; portions?: number; weekdays: Weekday[] | null },
): Promise<{ itemIds: string[] }>;

/**
 * Cambia las porciones de UN ítem de receta del dueño.
 * findFirst({ where: { id: itemId, recipeId: { not: null }, meal: { [ownerKey]: ownerId } } }); si no está → MealOwnershipError.
 * normalizePortions null → RangeError.
 */
export function setRecipeItemPortions(kind: MealOwnerKind, ownerId: string, itemId: string, portions: number): Promise<void>;

/**
 * Deshacer de "Agregar": borra SOLO esos ids y solo si son del dueño:
 * deleteMany({ where: { id: { in: itemIds }, meal: { [ownerKey]: ownerId } } }). 1..50 ids; si no → RangeError.
 * Devuelve cuántos borró.
 */
export function removeMenuItems(kind: MealOwnerKind, ownerId: string, itemIds: string[]): Promise<number>;
```

Consumidores: `apps/web` (`recipe-picker-actions.ts`) y `scripts/test-recipe-picker.ts`. El bot no.

`addMealItem`/`addTemplateMealItem` (zona de Leo) **no** cambian: siguen siendo solo para alimentos.
Ver 13-D4.

### 5.2 `domain/recipes.ts` (agregados)

```ts
/**
 * Lo que necesita un ítem de receta en el plan: macros (con los ingredientes), micronutrientes
 * (nutrients y sodio), nombre, porción, fuente y foto. NO filtra por estado (una receta archivada
 * sigue en el plan, D10 y "Archivar" de 018a).
 */
export const RECIPE_ITEM_SELECT = {
  id: true, name: true, status: true, type: true, portionHousehold: true, yieldPortions: true, sourceName: true,
  photo: { select: { id: true } },
  ingredients: {
    orderBy: { order: "asc" },
    select: {
      label: true, grams: true, noQuantity: true,
      food: { select: { id: true, name: true, group: true, kcalPer100: true, proteinPer100: true, carbsPer100: true,
                        fatPer100: true, fiberPer100: true, nutrients: true, sodiumMgPer100: true } },
    },
  },
} satisfies Prisma.RecipeSelect;

/** Detalle para el buscador (diálogo) y el portal. Serializable. Sin bytes ni datos de importación. */
export interface RecipePreview {
  id: string; name: string; status: RecipeStatusKey; type: RecipeTypeKey | null;
  portionHousehold: string | null; yieldPortions: number | null;
  perPortion: Macros | null; macrosIncomplete: boolean;
  photo: { id: string; credit: string | null } | null;
  sourceName: string | null; preparation: string | null; tips: string | null;
  /** name = ingredientDisplayName(label, food) */
  ingredients: { name: string; household: string | null; grams: number | null; noQuantity: boolean }[];
}
/** PUBLISHED o ARCHIVED (las borradores no se muestran: null). */
export function getRecipePreview(recipeId: string): Promise<RecipePreview | null>;
/** Las recetas DISTINTAS usadas en ítems del plan (cualquier estado salvo DRAFT), en orden de nombre. */
export function listPlanRecipePreviews(planId: string): Promise<RecipePreview[]>;
```

`importRawText`, `rawText`, `importHints` y `published*` **no** entran en `RecipePreview`: son datos
de revisión, no para el paciente.

### 5.3 `domain/nutritionPlans.ts` y `planTemplates.ts` (zona de Leo, mínimo)

- `mealInclude` y `templateMealInclude`: `include: { food: true, recipe: { select: RECIPE_ITEM_SELECT } }`.
- `applyTemplateToPatient`: en `items.create` se suman `recipeId: item.recipeId` y
  `portions: item.portions`.
- Nada más. `addMealItem` y `addTemplateMealItem` no cambian.

### 5.4 Qué **no** cambia en `domain` (verificado)

`foods.ts`, `prescriptions.ts`, `outbox.ts`, `botAi.ts`, `patients.ts`, `recipeImport.ts`,
`recipeTransfer.ts` e `index.ts` (ya exporta `weeklyMenu` y `recipes`).

---

## 6. Rutas, server actions y API (`apps/web`)

No hay rutas nuevas. La foto del portal usa la ruta de 018a.

### 6.1 `apps/web/src/app/(panel)/recipe-picker-actions.ts` (nuevo, `"use server"`)

**Regla Turbopack:** este archivo exporta **solo funciones async**. Ni tipos, ni constantes, ni
`export type { … } from`. Los tipos de entrada y salida van en
`apps/web/src/components/recipe-picker/types.ts` (archivo común) y el archivo de actions los importa.

```ts
// components/recipe-picker/types.ts
export type PickerActionError = { ok: false; error: string };
export type ListPickerRecipesResult = { ok: true; cards: RecipeCardView[] } | PickerActionError;
export type RecipePreviewResult = { ok: true; recipe: RecipePreview } | PickerActionError;
export type AddRecipeResult = { ok: true; itemIds: string[] } | PickerActionError;
export type PickerMutationResult = { ok: true } | PickerActionError;
```

```ts
// recipe-picker-actions.ts
/** listRecipeCards({ status: "PUBLISHED" }) → toRecipeCardView(card, "panel"). */
export async function listPickerRecipesAction(): Promise<ListPickerRecipesResult>;
/** getRecipePreview(id). null → { ok:false, error: RECIPE_PICKER_TEXT.notPublished }. (018c-2) */
export async function getRecipePreviewAction(recipeId: string): Promise<RecipePreviewResult>;
/** zod: { kind, ownerId, mealId, recipeId, weekdays: Weekday[] (1..7, únicos) | null } → addRecipeItems(…, portions 1). */
export async function addRecipeToMealAction(input: {
  kind: MealOwnerKind; ownerId: string; mealId: string; recipeId: string; weekdays: Weekday[] | null;
}): Promise<AddRecipeResult>;
/** zod: portions múltiplo de 0,5 en [0,5; 4] → setRecipeItemPortions. */
export async function setRecipeItemPortionsAction(input: {
  kind: MealOwnerKind; ownerId: string; itemId: string; portions: number;
}): Promise<PickerMutationResult>;
/** zod: itemIds 1..50 → removeMenuItems. Lo usan "Deshacer" y "Quitar" de la tarjeta. */
export async function removeRecipeItemsAction(input: {
  kind: MealOwnerKind; ownerId: string; itemIds: string[];
}): Promise<PickerMutationResult>;
```

- **Sesión:** todas empiezan con `hasPanelSession()` (de `recetas/recipe-save.ts`, como en 018a). Sin
  sesión → `{ ok: false, error: RECIPE_TEXT.sessionExpired }`.
- **Errores:** `RecipeNotAvailableError` → `notPublished`. `MealOwnershipError`,
  `MealWeekdayMismatchError`, `RangeError` o zod → `addError`, `portionsError` o `removeError`
  según la action. El log es `console.error("[recipe-picker]", errorCode(err))`, sin el payload.
- **Revalidación:** las tres mutaciones llaman a `revalidateMenuOwner(kind, ownerId)`.
- **Revalidación compartida:** se crea `apps/web/src/lib/revalidate-menu-owner.ts` (`import
  "server-only"`, exporta `revalidateMenuOwner`) con el cuerpo de la `revalidateOwner` privada que hoy
  está en `weekly-menu-actions.ts`. `weekly-menu-actions.ts` pasa a importarla. La lógica no cambia.

### 6.2 `weekly-menu-actions.ts` (Joel, 018b): esquema de la foto

`snapshotItemSchema` (sigue `.strict()`) suma:

```ts
recipeId: idSchema.nullable().default(null),
portions: z.number().min(0.5).max(4).multipleOf(0.5).nullable().default(null),
```

más un `.superRefine` que exige el invariante 3-1/3-2 (receta ⇒ sin `foodId`/`quantityGrams` y con
porciones; sin receta ⇒ `portions` null). El `.default(null)` deja pasar una foto sin esos campos
(por ejemplo, una pestaña abierta antes del deploy).

### 6.3 Mensajes del bot

No hay. 018c no toca WhatsApp ni `OutboundMessage`.

---

## 7. UI (Apple, HU-017a): pantallas concretas (skill `ui`)

Reglas para todo, igual que en 018a y 018b:
- Tokens de `lib/design-tokens.ts` y primitivos de `components/primitives/*`. Ningún color nuevo.
- Objetivos de toque de 44 px (`h-11`, `size-11` o `.touch-target`), separados por `gap-2` como mínimo.
- `tabular-nums` en todos los números. Macros con `chartPalette.macro`, siempre con la letra.
- Texto en vez de íconos sueltos (si hay un ícono solo, lleva `aria-label`). Nada depende del hover.
  Los estados se dicen con texto e ícono, no solo con color.
- Una acción principal por tarjeta o pantalla. "Deshacer" en vez de pedir confirmación.
- Movimiento: lo resuelven los primitivos (`Sheet`, `Dialog` y sonner, con reduced motion). Solo se
  agrega `press-sm` en los botones. La mini franja anima con `springs.standard`, igual que
  `DayTargetStrip`.

### 7.1 Componentes nuevos (`apps/web/src/components/recipe-picker/`)

| Archivo | Qué es | Primitivos |
|---|---|---|
| `types.ts` | Tipos de las actions (6.1) y `RecipeItemView` (8.1) | — |
| `recipe-picker-sheet.tsx` | El buscador completo (7.3). Cliente | `Sheet`, `SheetContent`, `SheetHeader`, `SheetTitle`, `SheetDescription` (sr-only) |
| `use-picker-recipes.ts` | Hook: llama a `listPickerRecipesAction` **cada vez que se abre** el sheet. Mientras recarga, deja a la vista lo que ya tenía. Estados `loading` / `ready` / `error` y `retry()` | — |
| `picker-day-strip.tsx` | Franja compacta del día dentro del sheet (7.3.2) | `role="meter"` como `DayTargetStrip` |
| `picker-card-footer.tsx` | Pie de cada tarjeta: impacto, "Agregar", "Agregada", porciones y error (7.3.5) | `Button`, `PortionStepper` |
| `portion-stepper.tsx` | "− 1 porción +" con objetivos de 44 px; lo usan la tarjeta, el detalle y el ítem del editor | `Button size="icon"` (`size-11`) |
| `recipe-meal-item.tsx` | Ítem de receta dentro de una comida del editor (7.2) | `Badge`, `PortionStepper`, el `SubmitButton` "Quitar" de hoy |
| `use-recipe-item-actions.ts` | Hook: agregar, cambiar porciones (con `useOptimistic`), quitar y deshacer, con los toasts | `notify` |
| `recipe-preview-dialog.tsx` (018c-2) | Detalle de la receta en el buscador (7.4) | `Dialog` |

En `apps/web/src/components/recipes/` (018a):

| Archivo | Cambio |
|---|---|
| `recipe-detail-body.tsx` (nuevo, 018c-2) | Cuerpo compartido por el detalle del buscador y "Ver receta" del portal: foto grande 4:3 (`RecipePhoto` `size=full`), `1 porción: …`, lista de ingredientes (nombre a la izquierda y `formatIngredientAmount` a la derecha; dos columnas desde `md`), "Preparación" en `<details>`, abierto en el portal y plegado en el buscador, "Tips y conservación", `Fuente: …` y `Foto: …`. Props `recipe: RecipePreview`, `photoScope: "panel" \| "portal"`, `showMacros: boolean` y `preparationOpen: boolean` |
| `recipe-card.tsx` | Prop opcional `onOpen?: () => void`. Si viene, la parte de arriba es un `<button type="button" aria-haspopup="dialog">` con las mismas clases, en vez del `<Link>`. Prop `sizes?` (default `RECIPE_CARD_SIZES`). Prop `onPreviewChange?: (active: boolean) => void`, que se dispara con `onPointerEnter/Leave` y `onFocus/onBlur` del `article` (vista previa en la franja; no reemplaza al texto) |
| `recipe-grid.tsx` | Props `layout?: "page" \| "panel"` (panel: `grid-cols-1 sm:grid-cols-2 xl:grid-cols-3`, `sizes="(min-width: 1280px) 20vw, (min-width: 640px) 30vw, 100vw"`), `onOpen?(card)` y `onPreviewChange?(card, active)` |
| `recipe-grid-skeleton.tsx` | Prop `layout` (las mismas columnas) |
| `recipe-filters.tsx` | Props `placeholder?` y `searchLabel?`, e `inputRef?` para dar el foco al abrir |
| `chip-group.tsx` | `ChipOption` suma `ariaLabel?`. `MultipleProps` suma `lockedValues?: string[]`: esos chips quedan encendidos con `aria-disabled="true"`, no se apagan y muestran un candado de 12 px (`Lock`, `aria-hidden`). El texto de ayuda lo dice el que lo usa |

### 7.2 La comida en el editor (`meals-editor.tsx`, mínimo)

```
┌ Desayuno · Martes ─────────────────────────────── 255 kcal  ⋯ ┐
│ ┌──────────────────────────────────────────────────────────────┐ │
│ │ [48px] Panqueques de avena y banana   (Receta)                │ │
│ │        1 porción (2 panqueques) · 255 kcal                    │ │
│ │        ● P 12 g · ● C 30 g · ● G 8 g                           │ │
│ │                          [ − ] 1 porción [ + ]     Quitar     │ │
│ ├──────────────────────────────────────────────────────────────┤ │
│ │ Té                                                    250 g  Quitar │
│ └──────────────────────────────────────────────────────────────┘ │
│ [ 🔍 Agregar receta ]  ← Button size="lg" (primario), w-full en el celular │
│ ───────────────────────────────────────────────────────────────  │
│ Agregar alimento  (formulario de hoy, sin cambios)               │
└──────────────────────────────────────────────────────────────────┘
```

- **Botón "Agregar receta"**: `Button size="lg"` (primario, ícono `Search`), `w-full sm:w-auto`, en
  `mt-6 border-t pt-6`. El formulario "Agregar alimento" baja abajo, con `mt-4` y sin borde propio, y
  su botón sigue en `secondary`. Así queda una sola acción principal por comida.
  `aria-label` = el título del buscador ("Agregar receta a Desayuno del martes").
- **Ítem de receta** (`RecipeMealItem`, dentro del mismo `<ul className="divide-y rounded-md border">`):
  - Miniatura 48×48 (`size-12 rounded-md`, `RecipePhoto` thumb, `alt=""`).
  - Nombre (`text-sm font-medium`) y `Badge` "Receta". Si la receta está `ARCHIVED`, otro `Badge`
    "Archivada".
  - `recipePortionText(portions, portionHousehold)` · `{kcal} kcal` (`text-xs tabular-nums`).
  - `MacroLine` (`showMacros`).
  - A la derecha (debajo en el celular): `PortionStepper` y el `SubmitButton` "Quitar" de hoy
    (`deleteItemAction`, mismo `aria-label`).
  - Si `macrosIncomplete`, `Badge tone="warning"` "Macros incompletos".
- Las notas del ítem no se editan en 018c (como hoy con los alimentos).

### 7.3 Buscador "Agregar a Desayuno · Martes" (`recipe-picker-sheet.tsx`)

#### 7.3.1 Contenedor

- `SheetContent side="right"` con `className="w-full p-0 sm:max-w-none md:w-[min(66vw,64rem)]"`.
  En el celular ocupa toda la pantalla y se cierra arrastrando a la derecha, como los demás sheets
  del repo (13-D1).
- **Modal**, con el scrim del primitivo, porque la franja del plan no se vería atrás en ningún tamaño.
  Por eso la franja se repite dentro del panel (7.3.2), que es la opción B de la HU.
- **Foco al abrir**: `onOpenAutoFocus={(e) => { e.preventDefault(); if (matchMedia("(pointer: fine)").matches) inputRef.current?.focus(); }}`.
  En pantallas táctiles no se abre el teclado solo, porque taparía la grilla (13-D7).
- **Al cerrar** ("Listo", la X del primitivo, Escape o arrastrar), el foco vuelve al botón "Agregar
  receta" de esa comida (lo maneja el primitivo). Los filtros se reinician la próxima vez que se abre.

#### 7.3.2 Encabezado fijo (`sticky top-0 z-10 material-bar`, `px-4 sm:px-6 pt-5 pb-3`)

```
Agregar a Desayuno · Martes                                      [ Listo ]   (X)
Martes  Energía 1.240 → 1.495 de 1.800 kcal ▓▓▓▓▓▓░  P 70/110 g  C 150/200 g  G 40/60 g
```

- `SheetTitle` con `pickerTitle(...)` (`text-title-3`). "Listo" es `Button variant="secondary"
  size="lg"` y deja `pr-12` para no chocar con la X del primitivo.
- **`PickerDayStrip`** (solo planes):
  - Con objetivo: una fila con 4 celdas compactas. Cada una tiene rótulo, `lleva de objetivo` en
    `tabular-nums`, una barra de 4 px con la marca del 100 % y el ícono de estado. Es el mismo
    `compareToTarget` y el mismo color por macro que `DayTargetStrip`. En el celular va como grilla de
    2×2.
  - **Vista previa**: mientras una tarjeta tiene el puntero o el foco, cada valor muestra
    `antes → después` (`computeRecipeImpact(...).before/after`) y la barra dibuja el tramo agregado en
    el color del macro con 40 % de opacidad. Al salir vuelve. Es un extra: la tarjeta ya dice lo mismo
    con texto.
  - Sin objetivo: una línea con `noTargetStrip`.
  - En plantillas no hay franja (D17).
  - Título de la franja: el día (`Martes`), `Promedio diario de la semana` (EVERY_DAY) o
    `Total del día` (PLAN).

#### 7.3.3 Cuerpo (`px-4 sm:px-6 py-4 space-y-4`)

1. **`RecipeFilters`** con `placeholder` y `searchLabel` de 4.3, el `inputRef`, y el valor inicial
   `initialPickerFilters(meal.name)`.
   - Muestra el momento (no se usa `hideMoment`): el chip inferido viene encendido y "Todos" lo
     quita.
   - "Etiquetas" se pliega en el celular, como en 018a.
   - La búsqueda usa `useDeferredValue` como `recipes-browser.tsx`. No hay botón "Buscar".
2. **"Agregar en:"**, solo en el alcance `DAYS`:
   - `ChipGroup type="multiple" label="Agregar en:"`, con las opciones Lun…Dom (`short`, y
     `ariaLabel` = `long`) y `lockedValues=[focusDay]`.
   - Debajo, en `text-footnote text-muted-foreground`, va `daysHint`.
   - El estado vive en el sheet y arranca en `[focusDay]`.
3. **Contador**: el `countText` de `RecipeFilters` (`recipeCountText`).
4. **Grilla**: `RecipeGrid layout="panel"`, con `onOpen` (detalle, 018c-2; en 018c-1 no se pasa y la
   tarjeta no es clicable salvo el pie) y `onPreviewChange`. `renderFooter` dibuja
   `<PickerCardFooter>`.
   - Las 3 primeras fotos llevan `priority`; el resto, lazy.
   - Resultados en orden de relevancia de `filterRecipes`. No se ordena por encaje (D14).

#### 7.3.4 Estados del cuerpo (en lugar de la grilla)

| Estado | Qué se ve |
|---|---|
| Cargando (primera vez) | `RecipeGridSkeleton layout="panel" count={6}` |
| Error | `EmptyState` con ícono `CloudOff`, título `loadError` y `Button size="lg"` "Reintentar" (`retry()`) |
| Sin recetas publicadas | `EmptyState` con ícono `BookOpen`, `emptyCatalog` y `ButtonLink size="lg" href="/recetas"` "Ir a Recetas" |
| Sin resultados con texto | `EmptyState` con ícono `SearchX` y `noResultsQuery`. Debajo, `tryAnother` y 4 chips de 44 px (botones) con `PICKER_SUGGESTED_INGREDIENTS`, que reemplazan la consulta. Después, "Quitar filtros" (si hay chips encendidos) y el link `Crear receta` |
| Sin resultados solo por chips | `noResultsFilters` + "Quitar filtros" |

#### 7.3.5 Pie de la tarjeta (`picker-card-footer.tsx`)

```
Suma 14 % de las kcal del martes                       ← text-footnote text-muted-foreground
✓ Entra en lo que falta  |  ↑ Se pasa en grasas el jueves (+8 g)   ← text-footnote font-semibold, success / warning
[            Agregar en 3 días            ]              ← Button size="lg" w-full
```

Estados:

| Estado | Contenido |
|---|---|
| Sin objetivo (plantilla o plan sin prescripción) | Sin líneas de impacto, solo el botón |
| `idle` | Las 2 líneas de impacto y el botón `addButtonLabel(daysToAdd.length)`. `daysToAdd = daysMissingRecipe(meal, card.id, markedDays)` |
| `pending` | El botón con `loading` (spinner del primitivo), deshabilitado y con `aria-busy`. Las líneas no cambian |
| `added` | Aparece si la receta ya está en la comida del día que se edita (o en la comida EVERY_DAY). Se deriva de `meals`, que ya trae la revalidación, no de estado local. Muestra el texto `Agregada` con ícono `Check` en `text-success`, y debajo `PortionStepper` del último ítem de esa receta en ese día y `Button variant="plain" size="lg"` "Quitar" (`removeRecipeItemsAction([itemId])`). Sin líneas de impacto |
| `error` | Vuelve a `idle` y muestra `addError` (o `notPublished`) en `text-footnote text-destructive` con `role="alert"`, junto al botón. Los totales no cambian porque no se escribió nada |

Al agregar:
1. `addRecipeToMealAction({ kind, ownerId, mealId, recipeId, weekdays })`, con
   `weekdays = daysToAdd` en DAYS y `null` en EVERY_DAY/PLAN.
2. Si sale bien: `notify.undo(recipeAddedMessage(...), () => removeRecipeItemsAction(itemIds))` y,
   al deshacer, `notify.saved(undone)`. La revalidación trae el ítem nuevo. La tarjeta pasa a `added`
   y las franjas se actualizan.
3. El "+" y el "−" de la tarjeta cambian **solo** el ítem del día que se edita. Usan `useOptimistic`
   y, si fallan, vuelven al valor anterior con `notify.error(portionsError)`.
4. Si el día que se edita ya tenía la receta, los otros días marcados no se agregan desde la tarjeta
   (13-D5).

#### 7.3.6 Teclado

- El orden de Tab es: Listo → buscador → chips de momento → tipo → etiquetas → días → tarjetas (la
  parte de arriba y después el pie).
- Enter o Espacio en la parte de arriba de la tarjeta abre el detalle (018c-2).
- Escape cierra primero el detalle y después el sheet.
- El foco siempre se ve (`focus-visible:outline-ring`).

### 7.4 Detalle de la receta en el buscador (`recipe-preview-dialog.tsx`, 018c-2)

- `Dialog` (`DialogContent className="sm:max-w-2xl max-h-[90dvh] overflow-y-auto"`) por encima del
  sheet. Al abrirse llama a `getRecipePreviewAction(id)`. Mientras carga muestra un skeleton con la
  foto 4:3 reservada. Si falla, muestra `loadError` y "Reintentar".
- Contenido:
  - `RecipeDetailBody` con `photoScope="panel"`, `showMacros` (kcal y `MacroLine` de 1 porción) y
    `preparationOpen={false}`.
  - El mismo bloque de impacto de la tarjeta.
  - Un pie fijo con el mismo control que el pie de la tarjeta, pero con el texto del botón
    `pickerTitle(...)` ("Agregar a Desayuno · Martes"). Con varios días, `Agregar en 3 días`.
- Al cerrar se vuelve a la grilla en el mismo lugar del scroll, porque el sheet no se desmonta.

### 7.5 Plantillas (D17)

Es el mismo `MealsEditor` con `kind="template"` y `target={null}`. En el buscador cambia esto:
- No hay `PickerDayStrip`.
- Las tarjetas no muestran líneas de impacto.
- Lo demás es igual: días, "Agregar", porciones y Deshacer.

Al aplicar la plantilla, las recetas se copian (5.3).

### 7.6 Portal (`(portal)/portal/plan/*`)

- **018c-1**: `PortalMealItems` dibuja el ítem de receta con:
  - Miniatura de 48 px (`recipePhotoUrl(photoId, "portal")`).
  - El nombre.
  - `recipePortionText` en `text-muted-foreground`.
  - `Fuente: …` en `text-footnote`, si tiene fuente.
  - Sin macros y sin gramos.
- **018c-2**: suma un `Button variant="secondary" size="lg"` **"Ver receta"**. Abre un `Sheet`
  `side="right"` `w-full sm:max-w-lg` con `RecipeDetailBody` (`photoScope="portal"`,
  `showMacros={false}` y `preparationOpen`).
  - Los datos vienen del server: `page.tsx` llama a `listPlanRecipePreviews(plan.id)` y le pasa al
    cliente un `Record<recipeId, PortalRecipeView>`.
  - `PortalRecipeView` es `Omit<RecipePreview, "perPortion" | "macrosIncomplete" | "status">`. Así los
    macros **no** viajan al navegador del paciente.
  - El `include` del portal suma `recipe: { select: RECIPE_ITEM_SELECT }`, como `getPlan`.
- Un plan sin recetas se ve igual que después de 018b.

### 7.7 PDF mínimo (`lib/plan-pdf.tsx`)

En `ItemRows`, si `item.recipe`:
- La columna izquierda muestra el nombre de la receta y, debajo, en el estilo `itemNote`,
  `recipePortionText(...)` y, si hay fuente, ` · Fuente: {sourceName}`.
- La columna de cantidad va vacía.
- No hay anexo, ni foto, ni preparación: eso es de la HU-015 (sección 14).

---

## 8. Archivos y flujo

### 8.1 Tipos de la vista

```ts
// components/recipe-picker/types.ts
export interface RecipeItemView {
  id: string;                    // recipeId
  name: string;
  status: "DRAFT" | "PUBLISHED" | "ARCHIVED";
  type: RecipeTypeKey | null;
  portions: number;
  portionHousehold: string | null;
  photoId: string | null;
  sourceName: string | null;
  macrosIncomplete: boolean;
}

// components/meals-editor.tsx (MealItemView)
recipe?: RecipeItemView | null;  // HU-018c. Opcional: los fixtures de 018b no cambian
```

Qué hace `toMealView` con un ítem que trae `recipe`:
- `macros = recipeItemMacros(computeRecipeMacros(ingredientes, yield).perPortion, portions)`.
- `kcalBreakdown = null`, así que el editor usa `formatMacrosLine` y no muestra el popover.
- `foodName`, `customLabel` y `quantityGrams` quedan en `null`.
- `recipe` = el `RecipeItemView` de arriba.

`toMicronutrientItems` hace con un ítem de receta:
- `expandRecipeIngredients(...)` → un `MicronutrientPlanItem` por ingrediente, con el `weight` del
  ítem.
- En `weeklyWeights`, el ítem de receta "tiene macros" si `yieldPortions > 0`.

`itemLabel` (`weekly-menu/labels.ts`) pasa a `item.recipe?.name ?? item.foodName ?? item.customLabel ?? "(sin descripción)"`.

### 8.2 Lista

Crear:

- `packages/core/src/recipe-picker.ts` y `recipe-picker.test.ts`
- `packages/db/scripts/test-recipe-picker.ts`
- `apps/web/src/app/(panel)/recipe-picker-actions.ts` y `recipe-picker-actions.test.ts`
- `apps/web/src/lib/revalidate-menu-owner.ts`
- `apps/web/src/components/recipe-picker/{types.ts,recipe-picker-sheet.tsx,use-picker-recipes.ts,picker-day-strip.tsx,picker-card-footer.tsx,portion-stepper.tsx,recipe-meal-item.tsx,use-recipe-item-actions.ts}`
- `apps/web/src/components/recipe-picker/picker-card-footer.test.tsx` y `portion-stepper.test.tsx`
- 018c-2: `components/recipe-picker/recipe-preview-dialog.tsx`, `components/recipes/recipe-detail-body.tsx` (+ test) y `(portal)/portal/plan/portal-recipe-sheet.tsx`

Modificar:

- `packages/core/src/{recipes.ts,recipes.test.ts,index.ts}`
- `packages/db/domain/{weeklyMenu.ts,weeklyMenu.test.ts,recipes.ts,recipes.test.ts,nutritionPlans.ts,planTemplates.ts}`
- `packages/db/package.json` (script `test:recipe-picker`)
- `apps/web/src/app/(panel)/{weekly-menu-actions.ts,weekly-menu-actions.test.ts}`
- `apps/web/src/components/meals-editor.tsx`
- `apps/web/src/components/weekly-menu/labels.ts` (y su test, si existe)
- `apps/web/src/components/recipes/{recipe-card,recipe-grid,recipe-grid-skeleton,recipe-filters,chip-group}.tsx`
- `apps/web/src/lib/{meal-view.ts,meal-view.test.ts,plan-pdf.tsx,plan-pdf.test.tsx}`
- `apps/web/src/app/(portal)/portal/plan/{page,plan-view,portal-day-view}.tsx`

**No** se tocan:
- `schema.prisma` ni las migraciones.
- `apps/bot/**`.
- `food-picker.tsx`, `food-catalog.tsx` y `primitives/*`.
- `planes/**/actions.ts`, `plantillas/**`, `recetas/**` (salvo importar `hasPanelSession`) y
  `alimentos/**`.
- `domain/{foods,prescriptions,outbox,index}.ts` y los seeds.

---

## 9. Corte en dos PR (recomendado, 13-D2)

| Parte | Qué incluye | Se mergea sola porque… |
|---|---|---|
| **018c-1 "Agregar recetas al plan"** (fases A–F) | Toda la lógica de core, el dominio y las actions. El buscador con grilla, chips, días, impacto, peor día, promedio, opciones, agregar, deshacer y porciones. El ítem de receta en el editor. Plantillas. Copiar, repetir, deshacer y aplicar plantilla con recetas. Micronutrientes. En el portal y en el PDF, **la línea** con nombre, porción y fuente | Cubre todo el flujo de armado. El paciente ya ve la receta (nombre, porción y fuente) y nada muestra "—" |
| **018c-2 "Detalle de la receta"** (fases G–H) | `getRecipePreview`, `listPlanRecipePreviews`, `RecipeDetailBody`, el detalle en el buscador (tocar la tarjeta) y "Ver receta" en el portal (foto, ingredientes, preparación y fuente) | Solo suma pantallas de lectura, sin tocar lo de 018c-1 |

Ninguna de las dos tiene migración. Si el orquestador prefiere un solo PR, el checklist sirve tal
cual en orden.

---

## 10. Checklist atómico (fases en orden, con commits sugeridos)

### Preparación

- [ ] P1. `git fetch && git log origin/develop -1`: la rama tiene `develop` adentro (si hay commits
      nuevos, `git rebase origin/develop`).
- [ ] P2. `cd packages/db && npx dotenv -e ../../.env -- prisma migrate status` → "up to date". No se
      migra nada en esta HU.
- [ ] P3. Leer `progress/impl_HU-018a.md` (corrección de Turbopack) y la sección 12.1 de esta SDD.

### Fase A: `packages/core` (018c-1)

- [ ] A1. `recipe-picker.ts`: `inferMomentFromMealName` e `initialPickerFilters`, con sus tests.
- [ ] A2. `pickerScope` y `daysMissingRecipe`, con tests.
- [ ] A3. `prepareRecipeImpact`, `computeRecipeImpact` y `formatRecipeImpact`, con los tests de 11.1
      (incluida la comparación contra la semántica de referencia).
- [ ] A4. `recipePortionText`, `formatIngredientAmount`, `genderNumberEs`, `agreeParticipleEs`,
      `pickerTitle`, `addButtonLabel`, `recipeAddedMessage`, `RECIPE_PICKER_TEXT` y
      `PICKER_SUGGESTED_INGREDIENTS`, con tests.
- [ ] A5. `recipes.ts`: `expandRecipeIngredients` y su test.
- [ ] A6. `index.ts`: `export * from "./recipe-picker";`. `npm run typecheck --workspace packages/core`
      y `npx vitest run packages/core`.
- Commit: `HU-018c: impacto de recetas en el día y textos del buscador (core)`.

### Fase B: `packages/db/domain` (018c-1)

- [ ] B1. `weeklyMenu.ts`: `ItemRow`, `MenuItemData`, `itemCopyData`, `assertSnapshotInvariants` y
      `ItemDelegate` (5.1). Actualizar `weeklyMenu.test.ts`: las aserciones `toEqual` sobre las filas
      creadas suman `recipeId: null, portions: null`, más los casos nuevos de 11.2.
- [ ] B2. `weeklyMenu.ts`: `RecipeNotAvailableError`, `addRecipeItems`, `setRecipeItemPortions` y
      `removeMenuItems`, con tests.
- [ ] B3. `recipes.ts`: `RECIPE_ITEM_SELECT` (y su test de forma si `recipes.test.ts` lo permite).
- [ ] B4. `nutritionPlans.ts`/`planTemplates.ts`: los `include` y `applyTemplateToPatient` (5.3). Test
      de `applyTemplateToPatient` con un ítem de receta.
- [ ] B5. `npm run db:generate` (no cambia el schema, pero deja el cliente al día) y
      `npm run typecheck` (los 4 workspaces, también `apps/bot`).
- Commit: `HU-018c: ítems de receta en el menú semanal (domain)`.

### Fase C: script contra la base (018c-1)

- [ ] C1. `scripts/test-recipe-picker.ts` (11.4) y el script `test:recipe-picker` en
      `packages/db/package.json`.
- [ ] C2. Correrlo **dos veces seguidas**: tiene que dar OK y dejar los conteos de control iguales.
- Commit: `HU-018c: script de verificación del ítem de receta`.

### Fase D: `apps/web`, lectura (018c-1)

- [ ] D1. `components/recipe-picker/types.ts` (`RecipeItemView` y los tipos de las actions).
- [ ] D2. `meals-editor.tsx`: el campo opcional `recipe` en `MealItemView` (solo el tipo, todavía sin
      UI).
- [ ] D3. `meal-view.ts`: `toMealView` y `toMicronutrientItems` con recetas (8.1). Casos nuevos en
      `meal-view.test.ts`.
- [ ] D4. `weekly-menu/labels.ts`: `itemLabel` con receta.
- [ ] D5. `plan-pdf.tsx`: la línea de receta y su caso en `plan-pdf.test.tsx`.
- [ ] D6. Portal: el `include` con `RECIPE_ITEM_SELECT` y el ítem de receta en `PortalMealItems`
      (miniatura, nombre, porción y fuente).
- Commit: `HU-018c: la receta en el plan, el portal y el PDF (lectura)`.

### Fase E: actions (018c-1)

- [ ] E1. `lib/revalidate-menu-owner.ts` y `weekly-menu-actions.ts`, que pasa a usarlo (sin cambio de
      comportamiento).
- [ ] E2. `weekly-menu-actions.ts`: `snapshotItemSchema` con `recipeId`/`portions` y el refine (6.2).
      Tests: una foto con receta pasa; una con receta y `foodId` no pasa; una sin los campos nuevos
      pasa con `null`.
- [ ] E3. `recipe-picker-actions.ts` (6.1), que exporta **solo funciones async**, y
      `recipe-picker-actions.test.ts`.
- Commit: `HU-018c: actions del buscador de recetas`.

### Fase F: UI del buscador y del ítem (018c-1)

- [ ] F1. Ajustes en `components/recipes/*` (7.1, segunda tabla, sin `recipe-detail-body`). Los tests
      de 018a siguen en verde.
- [ ] F2. `portion-stepper.tsx` y su test.
- [ ] F3. `use-recipe-item-actions.ts` y `recipe-meal-item.tsx`.
- [ ] F4. `use-picker-recipes.ts`, `picker-day-strip.tsx`, `picker-card-footer.tsx` (con su test) y
      `recipe-picker-sheet.tsx`.
- [ ] F5. `meals-editor.tsx`: el botón "Agregar receta", la rama de `RecipeMealItem` y el montaje del
      sheet (2.1). Nada más.
- [ ] F6. Verificación de 018c-1 (12.1 completo, 12.2 pasos 1 a 14).
- Commits: `HU-018c: componentes de recetas listos para el buscador`, `HU-018c: buscador de recetas en
  la comida`, `HU-018c: verificación de 018c-1`.

### Fase G: detalle (018c-2)

- [ ] G1. `domain/recipes.ts`: `RecipePreview`, `getRecipePreview` y `listPlanRecipePreviews`, con
      tests.
- [ ] G2. `recipe-picker-actions.ts`: `getRecipePreviewAction`.
- [ ] G3. `components/recipes/recipe-detail-body.tsx` (y su test) y
      `recipe-picker/recipe-preview-dialog.tsx`. `onOpen` en el sheet.
- [ ] G4. Portal: `listPlanRecipePreviews` en `page.tsx`, `PortalRecipeView` sin macros,
      `portal-recipe-sheet.tsx` y "Ver receta".
- Commit: `HU-018c: detalle de la receta en el buscador y en el portal`.

### Fase H: verificación de 018c-2

- [ ] H1. 12.1 completo y 12.2 pasos 15 a 18.
- Commit: `HU-018c: verificación de 018c-2`.

Cada commit lleva el trailer `Co-Authored-By` del agente y solo los archivos de su fase.

---

## 11. Tests

### 11.1 `packages/core/src/recipe-picker.test.ts` (vitest)

- **`inferMomentFromMealName`**:
  - "Desayuno", "desayuno " y "DESAYUNO" → BREAKFAST.
  - "Almuerzo" → LUNCH. "Merienda" → AFTERNOON_SNACK. "Cena" → DINNER.
  - "Colación", "Colaciones" y "colacion 1" → SNACK. "Media mañana" → SNACK. "Media tarde" →
    AFTERNOON_SNACK.
  - "Almuerzo y cena" → LUNCH (gana la primera).
  - "Pre entreno" y "Escena" → null (palabra completa).
  - `initialPickerFilters("Desayuno").moment` es BREAKFAST.
- **`pickerScope`**:
  - Plan no semanal → PLAN.
  - Comida EVERY_DAY en un plan semanal → EVERY_DAY.
  - Comida PER_DAY con martes y [jue, mar, sáb] → DAYS con los días en orden de la semana y el martes
    incluido aunque no venga.
- **`daysMissingRecipe`**: no devuelve los días que ya tienen esa receta. En EVERY_DAY devuelve [] si
  la comida ya la tiene.
- **Impacto, día (DAYS)**. Objetivo 1.800/110/200/60. Martes con 1.240 kcal, 70 P, 150 C y 40 G. Se
  agregan 255 kcal, 12 P, 30 C y 8 G:
  - `before.kcal` es 1.240 y `after.kcal` es 1.495.
  - `percentOfTarget` es 14 y el texto es "Suma 14 % de las kcal del martes".
  - El encaje es FITS: "Entra en lo que falta".
- **Borde del ±5 %**:
  - Con grasas 55 + 8 = 63 contra 60 (+5 %), sigue siendo FITS.
  - Con 56 + 8 = 64 (+6,7 %) da OVER fat, excess 4, y el texto es "Se pasa en grasas (+4 g)".
- **Peor día**:
  - Días marcados mar, jue y sáb. El jueves se pasa en grasas por 8 g y el sábado en kcal por 50.
    Gana el mayor exceso relativo: "Se pasa en grasas el jueves (+8 g)".
  - Si hay empate, gana el primero de la semana.
- **Día sin cargar**: agregar en un día vacío lo vuelve "cargado". El `after` de ese día solo tiene la
  receta y las comidas EVERY_DAY.
- **EVERY_DAY en un plan semanal**:
  - La referencia es `weeklyAverage` después de agregar y el texto dice "de cada día".
  - El encaje en OVER dice "en el promedio".
  - Si ningún día PER_DAY está cargado, la referencia es `days.MON`.
- **Opciones (N1)**:
  - Colaciones con opciones de 180, 80 y 70 kcal (promedio 110). Al agregar una de 255, el promedio
    pasa a 146,3. El texto es "Como opción, la comida pasa a promediar 146 kcal".
  - El `after` del día suma +36,3 kcal y no +255.
  - Agregar una opción más liviana da `percentOfTarget` negativo, sin texto de "Suma".
- **Plan no semanal (PLAN)**: la referencia es `days.MON` y el texto termina en "del día".
- **Sin objetivo**: `prepareRecipeImpact` devuelve null. Si `mealId` no existe, también.
- **Equivalencia**: para 30 combinaciones generadas (plan semanal o no, modo, opciones, días
  marcados y macros), `computeRecipeImpact(ctx, add)` tiene que dar igual (`toEqual`) que la
  referencia escrita en el test, que agrega el ítem `__preview` y llama a `computeWeeklyTotals`.
- **`recipePortionText`**:
  - (1, "2 panqueques") → "1 porción (2 panqueques)".
  - (1.5, "2 panqueques") → "1½ porciones (1 porción = 2 panqueques)".
  - (0.5, null) → "½ porción".
  - Con un texto de solo espacios se usa la forma sin casera.
- **`formatIngredientAmount`**: c.n. → "c.n."; con casera y gramos → "1 taza (300 g)"; solo casera;
  solo gramos ("62,5 g" es-AR); nada → "".
- **Género**:
  - "Panqueques de avena" → agregados. "Budín de banana" → agregado. "Tarta de jamón" → agregada.
  - "Galletitas" → agregadas. "Crumble" → agregado. "Albóndigas de lentejas" → agregadas.
  - "Infusión" → agregada. "Leche con cacao" → agregada (está en la lista). "Pan de avena" →
    agregado.
- **`recipeAddedMessage`**:
  - DAYS con [TUE, THU, SAT] → "Panqueques de avena y banana agregados a Desayuno (martes, jueves y
    sábado)".
  - EVERY_DAY → "… a Colaciones (todos los días)".
  - PLAN → sin paréntesis.
- **`pickerTitle`** en los 3 alcances. **`addButtonLabel`** con 1 y con 3.
- **Búsqueda (D13 y la HU)**, sobre fixtures de `RecipeCard`:
  - `filterRecipes` con "avena" y el momento BREAKFAST trae lo que tiene avena en el nombre o en
    algún ingrediente.
  - "limon" encuentra "limón".
  - "vianda" encuentra por la etiqueta MEAL_PREP.
  - Una receta con avena pero sin el momento BREAKFAST no aparece hasta que se pone "Todos".
  - El orden es por relevancia, no por encaje.

### 11.2 `packages/db`: prisma mockeado (el patrón de `weeklyMenu.test.ts`)

- **`addRecipeItems`**:
  - PER_DAY con [TUE, THU]: crea 2 ítems con `foodId`, `quantityGrams` y `customLabel` en null,
    `portions: 1`, el `weekday` de cada uno y `order` = máximo + 1 en cada día. Devuelve los 2 ids en
    orden de la semana y corre en 1 transacción.
  - EVERY_DAY con `weekdays: null` → 1 ítem con weekday null. EVERY_DAY con días →
    `MealWeekdayMismatchError`. PER_DAY con `null` o [] → `MealWeekdayMismatchError`.
  - Receta en DRAFT, ARCHIVED o inexistente → `RecipeNotAvailableError`, sin `create`.
  - Comida de otro dueño → `MealOwnershipError`, sin `create`.
  - `portions` 0,3 → `RangeError`.
  - Con `kind` template usa `templateMealItem`.
- **`setRecipeItemPortions`**: el `where` lleva el `recipeId: { not: null }` y el dueño; con 1,5 hace
  `update`; con 5 da `RangeError`; sin ítem da `MealOwnershipError`.
- **`removeMenuItems`**: `deleteMany` con `id in` y el filtro del dueño. Con [] o con 51 ids →
  `RangeError`.
- **Fotos**: `copyDay`, `repeatMealInAllDays` y `setMealMode` copian `recipeId` y `portions`.
  `restoreMealSnapshots` los recrea. Una foto con `recipeId` y `foodId` da `MealModeError` sin
  escribir.
- **`applyTemplateToPatient`**: el ítem de receta se copia con `recipeId`, `portions` y `weekday`.
- **018c-2**: `getRecipePreview` devuelve null para un DRAFT, no expone `rawText` ni los
  `published*`, y arma el nombre del ingrediente con `ingredientDisplayName`.
  `listPlanRecipePreviews` no repite recetas.

### 11.3 `apps/web` (vitest con mocks)

- **`recipe-picker-actions.test.ts`**:
  - Sin sesión → `sessionExpired`.
  - zod: `weekdays` con un día repetido o inválido → `addError`. `portions` 0,7 → `portionsError`.
    51 ids → `removeError`.
  - `RecipeNotAvailableError` → `notPublished`.
  - Si sale bien, devuelve `itemIds` y llama a `revalidateMenuOwner`.
  - El log no incluye el payload.
  - **El archivo solo exporta funciones async**: `Object.values(await import(...))` son todas
    funciones async.
- **`weekly-menu-actions.test.ts`**: los 3 casos de E2.
- **`meal-view.test.ts`**:
  - Un ítem de receta (rinde 4, con dos ingredientes, 1,5 porciones) da `macros` iguales a
    `recipeItemMacros(perPortion, 1.5)`.
  - `foodName` queda null y `recipe` lleva sus campos.
  - `toMicronutrientItems` expande la receta a los ingredientes escalados, con el peso semanal.
  - Un ingrediente c.n. no aparece y uno de texto libre aparece con `food` null.
- **`plan-pdf.test.tsx`**: un ítem de receta sale con su nombre, la porción y "Fuente: Nutriarte".
  Sin fuente no aparece "Fuente".
- **`picker-card-footer.test.tsx`**:
  - Sin objetivo no hay líneas de impacto.
  - Con objetivo se ven los textos de 4.3.
  - Con 3 días marcados el botón dice "Agregar en 3 días". Con la receta ya en el día dice "Agregada"
    y muestra el control de porciones.
  - Si la action falla, aparece `addError` con `role="alert"` y el botón vuelve a "Agregar".
- **`portion-stepper.test.tsx`**:
  - "−" está deshabilitado en ½ y "+" en 4.
  - Los textos son "1½ porciones" y similares.
  - Los botones miden 44 px (`size-11`) y tienen los `aria-label` de 4.3.
- **018c-2, `recipe-detail-body.test.tsx`**: con `showMacros={false}` no aparece ningún "kcal".
  Aparecen "Fuente: …" y "Foto: …". Los ingredientes salen con `formatIngredientAmount`.
- **Tests de 018a y 018b** (`recipe-card`, `chip-group`, `weekly-overview` y `day-target-strip`):
  siguen en verde sin cambiar sus aserciones.

### 11.4 Flujo contra la base: `packages/db/scripts/test-recipe-picker.ts`

Sigue el patrón de `test-recipes.ts`. No usa WhatsApp, no encola nada en `OutboundMessage` y no usa
IA. Crea **sus propios** datos:
- Una receta MANUAL PUBLISHED "Prueba HU-018c", con 2 alimentos SARA 2 que ya existen (solo se leen).
- Un paciente "Prueba HU-018c" con el teléfono ficticio `5490000018003`.
- Un plan ACTIVE con las comidas por defecto (`createPlan`).
- Una plantilla (`createTemplate`).

Pasos (cada uno con un `assert`):
1. `addRecipeItems` en el Desayuno PER_DAY con [MON, WED] → 2 ítems con receta y `portions` 1.
2. `setRecipeItemPortions` del lunes a 1,5. `getPlan` trae la receta con sus ingredientes, y
   recalcular con core (`computeRecipeMacros` y `recipeItemMacros`, sin importar nada de `apps/web`)
   da los macros de 1 porción × 1,5.
3. `copyDay` MON → [FRI]: el viernes tiene la receta con 1,5. "Deshacer" (`restoreMealSnapshots`) la
   saca.
4. `getRecipeUsage` = `{ plans: 1, templates: 0 }`.
5. `patientCanSeeRecipePhoto` (si se le puso foto, con `processRecipePhoto` sobre una imagen
   sintética de sharp): da true con el plan ACTIVE.
6. `addRecipeItems` en Colaciones (EVERY_DAY, opciones) con `null` → 1 ítem.
7. Plantilla: `addRecipeItems("template", …)`, `applyTemplateToPatient` → el plan nuevo tiene la
   receta con sus porciones y su día.
8. `removeMenuItems` con los ids del paso 1 → 2. Con el id de un ítem de **otro** plan → 0.
9. `archiveRecipe` → `addRecipeItems` da `RecipeNotAvailableError` y el plan **sigue** mostrando el
   ítem (vía `getPlan`).

Limpieza en `finally`, **solo por id** y en este orden (por el `Restrict`): los planes creados, la
plantilla, el paciente y la receta. El script imprime los conteos de control
(`Recipe`, `PlanMealItem`, `TemplateMealItem` y `NutritionPlan`) antes y después, y tienen que dar
iguales. Script npm: `"test:recipe-picker": "dotenv -e ../../.env -- tsx scripts/test-recipe-picker.ts"`.

---

## 12. Verificación (el implementer la corre antes de declararse `done`)

### 12.1 Comandos (desde la raíz)

```bash
npm run db:generate
npm run typecheck                                   # core, db, web y bot: todos en verde
npm run test                                        # vitest de todo el monorepo
npm run lint --workspace apps/web                   # sin warnings nuevos
cd packages/db && npx dotenv -e ../../.env -- prisma migrate status && cd -   # "up to date" (no hay migración)
npm run test:recipe-picker --workspace packages/db  # OK, dos veces seguidas
npm run test:recipes --workspace packages/db        # el de 018a sigue OK
cd packages/db && npx dotenv -e ../../.env -- tsx scripts/test-weekly-menu.ts && cd -   # el de 018b sigue OK
./ops/harness/verify.sh
```

**Builds (webpack y Turbopack).** Si el usuario tiene `npm run dev` corriendo, **no** se hace el
build en `apps/web/.next`, porque pisaría el servidor de desarrollo. En ese caso se hace en una copia,
igual que en la 018a-2:

```bash
SCR=<scratchpad>/build-018c && rm -rf "$SCR" && mkdir -p "$SCR"
rsync -a --exclude node_modules --exclude .next --exclude .git ./ "$SCR/"
cp -c -R node_modules "$SCR/node_modules"                 # clon APFS: Turbopack rechaza symlinks fuera de la raíz
cp -c -R apps/web/node_modules "$SCR/apps/web/node_modules" 2>/dev/null || true
cp .env "$SCR/.env"
cd "$SCR" && npm run build --workspace apps/web                       # next build (webpack)
cd "$SCR/apps/web" && npx next build --turbopack                      # Turbopack: "Compiled successfully", exit 0
cd - && rm -rf "$SCR"
```

Las dos tienen que compilar `/pacientes/[id]/planes/[planId]`, `/plantillas/[id]` y `/portal/plan`
sin el error "Only async functions are allowed to be exported in a "use server" file".

**Conteos de control** (solo lectura, antes y después de los scripts):

```bash
docker compose exec -T db psql -U nutri -d nutribot -c 'select
 (select count(*) from "Recipe") recipes, (select count(*) from "NutritionPlan") plans,
 (select count(*) from "PlanMealItem") items, (select count(*) from "PlanMealItem" where "recipeId" is not null) recipe_items,
 (select count(*) from "TemplateMealItem" where "recipeId" is not null) tpl_recipe_items;'
# Al 2026-10-03 en la base de Joel: 9 | 10 | <n> | 0 | 0. Tienen que quedar iguales al terminar.
```

### 12.2 Recorrido en Chrome (para el orquestador)

Con `npm run dev` (Turbopack, panel en :3000) y logueado. No hace falta el bot ni WhatsApp.

**Datos de prueba** (los crea el recorrido; los ids se anotan en el scratchpad para borrarlos al
final):
- Un paciente "Prueba HU-018c" con el teléfono ficticio `5490000018004`. Se le carga una consulta
  con la calculadora de requerimiento: 1.800 kcal, 110 P, 200 C y 60 G.
- Tres recetas publicadas desde `/recetas/nueva`, con prefijo "Prueba 018c":
  - Un desayuno con avena y foto. Momentos Desayuno y Merienda; fuente "Prueba".
  - Una colación.
  - Un plato con mucha grasa (para ver "Se pasa").
- **No** se editan planes ni recetas reales.

018c-1:
1. En un plan nuevo del paciente de prueba, en el martes, el Desayuno muestra "Agregar receta"
   (primario) y debajo "Agregar alimento".
2. Tocar "Agregar receta":
   - El panel se titula "Agregar a Desayuno · Martes".
   - El chip de momento "Desayuno" viene encendido y en "Agregar en:" solo está el martes (con
     candado).
   - El cursor está en el buscador.
   - La franja compacta muestra el martes contra 1.800 kcal.
   - Sin escribir, ya aparecen las recetas de desayuno.
3. Escribir "avena" (y "AVENA") → la tarjeta aparece en menos de 1 s, con foto, porción, kcal, P/C/G,
   "Suma N % de las kcal del martes" y "Entra en lo que falta". Pasar el mouse o hacer Tab por la
   tarjeta → la franja muestra "antes → después".
4. Chip de tipo "Colación" → filtra y cambia el contador. "Quitar filtros" vuelve todo. Con "quinoa"
   aparece "No hay recetas con «quinoa»." y los chips sugeridos.
5. "Agregar" →
   - Spinner, y después "Agregada ✓" con "− 1 porción +".
   - Toast "… agregados/as a Desayuno (martes) · Deshacer", con el género correcto.
   - La franja del martes sube.
6. "+" → 1½ porciones y los macros se recalculan. "Deshacer" del toast (antes de 8 s) → el ítem
   desaparece.
7. Marcar jueves y sábado → la receta grasa dice "Agregar en 3 días" y "Se pasa en grasas el jueves
   (+X g)". "Agregar" → el toast lista "martes, jueves y sábado". La franja sigue en el martes.
8. "Listo" → el Desayuno del martes muestra la receta con miniatura, "Receta", "1 porción (…) · N
   kcal", el control de porciones y "Quitar". El jueves y el sábado también la tienen.
9. Colaciones ("Todos los días · Elegí una") → "Agregar receta":
   - El título termina en "· Todos los días" y no hay fila de días.
   - El texto dice "Como opción, la comida pasa a promediar N kcal".
   - Al agregar, el rango "Opciones: X a Y kcal" cambia.
10. "Copiar este día a…" del martes al miércoles → el miércoles tiene la receta. "Deshacer" funciona
    (la receta vuelve a no estar).
11. Micronutrientes: cambian al agregar la receta.
12. Generar el PDF del plan → la línea "Receta · 1 porción (…) · Fuente: Prueba".
13. Plantilla nueva → "Agregar receta" sin franja ni porcentajes. Aplicarla al paciente de prueba →
    el plan nuevo trae la receta.
14. Celular (DevTools, 390 px):
    - El panel ocupa la pantalla y se cierra arrastrando a la derecha.
    - El teclado no se abre solo.
    - La grilla va en 1 columna.
    - Los chips se envuelven y todos los objetivos miden 44 px.
    - Escape y "Listo" cierran el panel.

018c-1 y 018c-2 (portal):
15. Marcar el plan de prueba como "Activo". Entrar al portal sin WhatsApp: desde `packages/db`, correr
    `npx dotenv -e ../../.env -- tsx -e 'import {createPatientToken} from "./domain/patientAuth"; console.log(createPatientToken("<id del paciente>", 30))'`
    y abrir `http://localhost:3000/portal/login?token=<token>`. Se ve la receta con su miniatura, la
    porción y "Fuente: Prueba", sin macros de la receta.
16. (018c-2) "Ver receta" → foto grande, ingredientes con medida casera y gramos, preparación, tips,
    "Fuente: …". En el HTML no hay kcal de la receta.
17. (018c-2) En el panel, tocar la foto de una tarjeta → el detalle con el mismo impacto y "Agregar a
    Desayuno · Martes". Escape vuelve a la grilla en el mismo lugar.
18. D10: abrir la receta de prueba en `/recetas/<id>`, cambiar un gramo y guardar → "Esta receta está
    en N planes…".

**Limpieza (solo por id).**
1. Borrar desde el panel los planes del paciente de prueba.
2. Borrar las recetas de prueba **por id**:
   `prisma.recipe.delete({ where: { id } })` desde un `tsx -e`, después de borrar los planes, por el
   `Restrict`. También la plantilla de prueba y el paciente.
3. Repetir los conteos de 12.1, que tienen que dar iguales a los de antes del recorrido.

---

## 13. Desvíos y dudas técnicas (cada una con recomendación; ninguna bloquea)

- **D1. El Sheet va a la derecha y a todo el ancho en el celular, no `side="bottom"`.** La UX de la
  HU dice "en el celular `side="bottom"` con grabber", pero D8 pide pantalla completa. El sheet
  inferior de 017a llega a `max-h-[90dvh]`. **Recomendación:** `side="right"` con `w-full` en el
  celular.
  - Ocupa la pantalla completa.
  - Se cierra arrastrando con el dedo, igual que los demás sheets del repo.
  - No hace falta cambiar de `side` según el ancho, lo que daría saltos de hidratación con SSR.
- **D2. Corte en 018c-1 y 018c-2** (sección 9). **Recomendación: aprobarlo.**
  - 018c-1 ya permite armar planes con recetas de punta a punta.
  - 018c-2 suma solo pantallas de lectura.
  - Ninguna de las dos tiene migración.
- **D3. La franja se repite dentro del panel** (la opción B de la HU). **Recomendación:** panel modal
  con la franja compacta adentro. Un panel de 2/3 sin scrim igual taparía la franja del plan, y en el
  celular no se vería. Sin scrim además se rompe el foco atrapado, que sí necesita una usuaria que
  maneja mal la computadora.
- **D4. Las funciones de escritura de recetas van en `weeklyMenu.ts` (parametrizadas por dueño), no
  en `addMealItem`/`addTemplateMealItem`.** La SDD de 018a, en su §13, decía "addMealItem con
  recipeId". **Recomendación:** funciones nuevas en `weeklyMenu.ts`.
  - Agregar en varios días es una transacción con N ítems.
  - Deshacer necesita los ids.
  - Las porciones necesitan chequear el dueño.
  - Escribirlo en los dos archivos de Leo lo duplicaría. `addMealItem` sigue siendo de alimentos y
    no se toca.
- **D5. Si el día que se edita ya tiene la receta, la tarjeta no agrega en los otros días marcados.**
  La tarjeta muestra "Agregada" y las porciones de ese día. **Recomendación:** aceptarlo.
  - Es un caso raro.
  - Para llevar la receta a otros días ya existen "Copiar este día a…" y "Repetir en todos los días".
  - Mostrar a la vez "Agregada" y "Agregar en 2 días más" suma una decisión.
  - En la primera vez, los días que ya la tenían se saltean (`daysMissingRecipe`) y el toast lista
    solo los que sí se agregaron.
- **D6. El día que se edita queda fijo en "Agregar en:".** No se puede desmarcar. **Recomendación:**
  así es. "Agregada" y la franja siempre hablan del mismo día, y para agregar solo en otros días se
  cambia de pestaña. El texto de ayuda lo dice.
- **D7. El foco va al buscador solo con puntero fino.** En el celular, el teclado abierto tapa la
  grilla y las recetas del momento, que son lo primero que la HU quiere mostrar. **Recomendación:**
  así. En escritorio se cumple "el cursor está en el campo de búsqueda".
- **D8. El chip de momento dice "Desayuno", no "Desayuno y merienda".** El Gherkin de la HU nombra un
  chip "Desayuno y merienda", pero en 018a ese texto es un **tipo** (`BREAKFAST`). Los momentos son
  Desayuno, Almuerzo, Merienda, Cena y Colación. **Recomendación:** preseleccionar el momento
  "Desayuno". Las recetas de desayuno y merienda suelen tener los dos momentos, así que aparecen
  igual.
- **D9. Qué es el "%".** "Suma 14 % de las kcal del martes" se calcula sobre el **objetivo** de kcal,
  no sobre el total del día, que cambia mientras se arma. **Recomendación:** sobre el objetivo.
  - Sin objetivo (plantillas o plan sin prescripción) no se muestra porcentaje ni encaje, como pide
    D17 y el estado "Sin objetivo" de la HU.
  - En una comida de opciones el porcentaje engaña, porque la opción no se suma entera. Por eso ahí
    se dice "Como opción, la comida pasa a promediar N kcal".
- **D10. Las recetas se cargan con una server action al abrir el panel, no en la página.**
  - Si las ~300 tarjetas viajaran en el RSC de la página del plan, se reenviarían en cada
    revalidación (cada ítem que se agrega).
  - Se recargan en cada apertura, lo que muestra una receta recién creada en otra pestaña.
  - Mientras recarga se ven las que ya estaban; el skeleton sale solo la primera vez.
  - El filtro es en el cliente, como en `/recetas` (< 1 s).
- **D11. La concordancia de género sale de la primera palabra del nombre de la receta**, más una
  lista corta de femeninos terminados en -e (leche, carne…). Puede fallar con algún nombre raro.
  **Recomendación:** aceptarlo. La alternativa neutra ("Se agregó …") no concuerda con un plural. El
  `genderNumber` de `weekly-menu/labels.ts` (018b) se puede unificar con `genderNumberEs` más
  adelante, pero no se toca acá.
- **D12. Texto de la porción.** El portal de la HU dice "1 porción: ¾ albóndigas". Acá se usa una sola
  función para el editor, el portal y el PDF: "1 porción (¾ albóndigas)" y "1½ porciones (1 porción
  = ¾ albóndigas)". **Recomendación:** una sola función, porque con porciones fraccionarias la forma
  de la HU no dice cuánto es.
- **D13. El ítem de receta no muestra el popover de Atwater en el editor** (`kcalBreakdown` = null).
  El desglose de la receta está en su ficha. **Recomendación:** así. Si se quiere, después se escala
  `atwaterPerPortion`.
- **D14. "Fuente: …" se muestra cuando la receta tiene `sourceName`**, sea propia o de terceros. Las
  recetas propias de ella no tienen fuente, así que no la muestran. **Recomendación:** así; no hace
  falta un campo nuevo.
- **D15. `MealItemView.recipe` es opcional.** Así no se tocan los fixtures de los tests de la zona
  de Leo (`plan-pdf.test`, `weekly-overview.test`). `MenuItemData.recipeId`/`portions` sí son
  obligatorios, porque es el contrato de copia del dominio.

Ninguna duda bloquea. Si el orquestador o el usuario eligen distinto en D1, D2 o D5, se ajustan el
checklist y la sección 7 sin rediseñar.

---

## 14. Para la HU-015 de Leo (lo que deja 018c y lo que le queda)

**Modelo y datos** (no cambian en 018c, ya estaban desde 018a):
- `PlanMealItem.recipeId` y `portions` (Decimal 3,1, pasos de ½ entre ½ y 4). Con `recipeId`, el
  ítem no tiene `foodId` ni `quantityGrams`.
- `getPlan(planId)` ya trae `items[].recipe` con `RECIPE_ITEM_SELECT`: nombre, porción casera,
  rendimiento, fuente, foto e ingredientes con alimento.
- **Vista**: `toMealView` deja en `MealItemView.recipe` el `RecipeItemView` (nombre, porciones,
  porción casera, `photoId`, `sourceName` y `status`). `macros` ya viene multiplicado por las
  porciones.
- **Textos puros** (`@nutri-bot/core`):
  - `recipePortionText(portions, household)`: "1 porción (¾ albóndigas)".
  - `formatIngredientAmount`: "1 taza (300 g)" o "c.n.".
  - `formatPortions`.
- **Detalle** (018c-2): `listPlanRecipePreviews(planId)` devuelve las recetas distintas del plan con
  ingredientes (nombre, medida casera, gramos y c.n.), preparación, tips, fuente y crédito de la foto.
  Es lo que necesita un **anexo de recetas** del PDF o Word.

**Lo provisional que la HU-015 reemplaza:**
- La línea de receta en `ItemRows` de `lib/plan-pdf.tsx`: nombre y, debajo, porción y "Fuente: …".
  La columna de cantidad queda vacía.

**Lo que le queda a la HU-015:**
1. **Anexo de recetas** con preparación, ingredientes y tips, usando `listPlanRecipePreviews`. La HU
   dice que el detalle de las recetas en el PDF lo define la HU-015.
2. **Fotos en el PDF**: `RecipePhoto` se guarda en **WebP**, que `@react-pdf/renderer` no dibuja.
   - Hay que pasarla a JPEG o PNG en el servidor con `sharp` (`@nutri-bot/db/media`).
   - Los bytes se leen con `getRecipePhotoBytes(photoId, "full")`.
   - No se usa la ruta HTTP: pide sesión.
3. **"Fuente: …" obligatoria** en todo lugar del PDF donde salga una receta de terceros (D3 = b). El
   crédito de la foto (`photo.credit`) va junto a la foto si se imprime.
4. Cómo se agrupan las recetas que se repiten en varios días (por ejemplo, el mismo desayuno 3 veces):
   en 018c cada día lista su ítem.
5. El Word, si la HU-015 lo hace, usa los mismos datos.

---

## 15. Fuera de alcance (no implementar en 018c)

- Ordenar o rankear recetas por encaje (D14) y objetivo por comida (épica 23).
- Gramos en el ítem de receta (D9): solo porciones.
- Editar las notas de un ítem de receta.
- Recetas en el asistente IA del plan.
- Medidas caseras de alimentos sueltos (018d).
- Anexo de recetas, fotos en el PDF y rediseño del PDF (HU-015).
- Rediseño general del editor y unificar los dos combobox de alimentos (HU-017e).
- Cualquier cambio de `schema.prisma` o migración.
- Cualquier mensaje de WhatsApp o cambio en `apps/bot`.

## 16. Decisiones del usuario (2026-10-03)

- **Corte:** dos PR. Primero **018c-1** (buscador, impacto, agregar en uno o varios días, porciones, Deshacer y el
  arreglo de copiar/repetir/aplicar plantilla con recetas). Después **018c-2** (detalle de la receta en el buscador
  y en el portal), en una rama nueva desde `develop` con 018c-1 mergeado.
- **Sección 13:** aceptadas todas las recomendaciones (D1–D9).
- **Implementer:** Opus, con los skills `apple-design` y `ui-ux-pro-max`.

## 17. Pendientes para 018c-2 (de la revisión de 018c-1)

- Test unitario (vitest con mocks) de `applyTemplateToPatient` con un ítem de receta.
- Con varios días marcados, el impacto y el botón tienen que medir los mismos días (`daysToAdd`, no `scope.days`).
- "Quitar" del ítem de receta en el editor: llevarlo a 44 px.
- Portal: que los macros de los ítems de receta no viajen al cliente (junto con `PortalRecipeView`, SDD 7.6).
- Recorrido en el navegador del PDF y del portal con un plan de prueba.
