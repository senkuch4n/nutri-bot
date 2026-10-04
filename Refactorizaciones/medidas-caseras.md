# SDD: HU-018d-1 `medidas-caseras` (medidas caseras de alimentos sueltos en el plan)

HU validada: `docs/hu-medidas-caseras.md`. Manda la sección "Resoluciones" (2026-10-04): **se
implementa solo 018d-1**. El Feature "018d-2 (opcional)" (medidas en los ingredientes de receta y
en la revisión de la carga asistida) **no entra**.

Rama: `feat/hu-018d-medidas-caseras`, encadenada sobre 018c-2 (PR #26 y #27 abiertos, todavía no
mergeados en `develop`). El código del buscador de recetas (`components/recipe-picker/*`,
`recipe-picker-actions.ts`, `RecipeMealItem`, `PortionStepper`) ya está en la rama.

Skills: `skills/migracion-prisma.md` (sección 3 completa) y `skills/ui.txt` (sección 7: pantallas
concretas, sin código). Mismo sistema visual que 018c: primitivos y tokens de HU-017a.

Resoluciones que mandan:

| Duda | Cómo se aplica acá |
|---|---|
| D1 = (a), D7 | Las medidas las carga ella, por alimento, en la ficha **y** desde el editor del plan (mismo cuadro) |
| D2 | Pendiente de la nutricionista. No se precarga nada: no se inventan gramos |
| D3 = (a) | Portal: "1½ tazas" y debajo "270 g" chico y gris. PDF: "1½ tazas (270 g)" |
| D4 | El ítem guarda **copia** del nombre, del plural y de los gramos por medida. Sin FK a la medida |
| D5 | Cantidad de ¼ a 20, de a ¼. Tercios y rangos van en la nota |
| D6 | Plural automático (core) con vista previa + campo de plural opcional escondido |
| D8 | 1 ml ≈ 1 g. Ayuda en el formulario. El parser de `unitHint` toma ml como g |
| D9 | Convertir los `unitHint` legibles; mostrar los otros con "Tenías anotado…" y "Pasar a medida"; sacar el campo del formulario de alimentos propios; **la columna queda** |
| D10 | Stepper en el lugar solo para ítems en medida casera (mismo look que las porciones de receta) |
| D13 | Por defecto, la primera medida de la lista (`order` asc). Reordenable con flechas |
| D14 | Selector "Medida casera \| Gramos" |

> **Verificación del architect (2026-10-04, solo lectura).**
> - Base de desarrollo (Postgres 5433): última migración aplicada `20261003102553_recipes`, igual a
>   la última carpeta. `Food` = 980 filas; `PlanMealItem` = 132; `TemplateMealItem` = 0;
>   `NutritionPlan` = 11; `PlanTemplate` = 0.
> - `unitHint` no vacío: **79 alimentos, todos `PROPIO`** (los SARA 2 lo tienen en `null`, como dice
>   la HU). Son los del seed de demo. Patrones reales: 71 con la forma "1 nombre ≈ X g|ml", 6 con
>   N ≠ 1 ("2 cucharadas ≈ 50 g", "3 cucharadas ≈ 30 g", "4 unidades ≈ 25 g", "6 unidades ≈ 25 g",
>   "2 cuadraditos ≈ 10 g"), 2 con fracción ("1/2 unidad ≈ 100 g", "1/2 taza ≈ 125 g") y 2 ilegibles
>   ("1 lata ≈  lata 473 ml", "usar con moderación").
> - **Hallazgo que cambia el peso de D9 (ver 13-T1):** desde el commit `22046a3` ("estandarizar el uso
>   de alimentos SARA2") los `PROPIO` son **históricos**: `/alimentos` lista solo SARA 2, crear un
>   propio está deshabilitado (`createOwnFoodAction` devuelve error y `/alimentos/nuevo` redirige),
>   los pickers de planes y plantillas reciben solo SARA 2 activos, las actions rechazan un `foodId`
>   PROPIO y `applyTemplateAction` rechaza plantillas con PROPIO. La ficha de un PROPIO solo se abre
>   por URL directa. O sea: las medidas que salgan de convertir `unitHint` quedan en alimentos que
>   **no se pueden agregar a planes nuevos**. En la práctica, ella va a cargar las medidas sobre SARA 2.
> - `PlanMealItem`/`TemplateMealItem`: `foodId`, `customLabel`, `quantityGrams Decimal(7,2)`, `notes`,
>   `order`, `weekday`, `recipeId`, `portions`. No hay nada de medida casera.
> - Lugares que copian ítems (todos pasan por `itemCopyData` en `domain/weeklyMenu.ts`, salvo uno):
>   `setMealMode` (vía `copiesTo`), `copyDay`, `repeatMealInAllDays`, `restoreMealSnapshots` y
>   `toSnapshot`. El que **no** usa `itemCopyData` es `applyTemplateToPatient`
>   (`domain/planTemplates.ts`), que lista los campos a mano. No existe "guardar plan como plantilla"
>   (`grep AsTemplate` vacío).
> - `weekly-menu-actions.ts#restoreMealsAction` valida la foto con zod `.strict()`: si `MenuItemData`
>   suma campos y el esquema no, el "Deshacer" **falla** apenas haya un ítem en medida casera (mismo
>   riesgo que se cubrió en 018c, 6.2).
> - `getPlan`, `getTemplate` y el `include` del portal traen los escalares del ítem solos: las
>   columnas nuevas llegan sin tocar ningún `include`.
> - `updateOwnFoodAction` parsea `unitHint: optionalText(120)` y `ownFoodData` escribe
>   `unitHint: input.unitHint?.trim() || null`. **Si solo se saca el input del formulario, guardar un
>   propio borraría su `unitHint`.** Hay que cambiar el contrato (5.2).
> - `FoodPicker` guarda el alimento elegido en estado interno y no avisa al padre. El editor necesita
>   saberlo para mostrar "Medida casera | Gramos": hace falta un callback (7.3).
> - `food-policy.test.ts` mockea `@nutri-bot/db/domain` con un objeto fijo y renderiza las páginas del
>   plan y de la plantilla. Si las páginas llaman a una función nueva de domain, ese test se rompe si
>   no se agrega al mock.
> - El bot no lee planes ni alimentos (`grep` en `apps/bot/src` vacío). Solo necesita `typecheck`.
> - Turbopack (`npm run dev`) rechaza en un archivo `"use server"` cualquier export que no sea una
>   función async (lección de 018a-2/018c). Los tipos de las actions nuevas van en un `types.ts` aparte.

---

## 1. Resumen funcional

En la ficha de cualquier alimento (`/alimentos/[id]`), arriba de "Energía", aparece la tarjeta
**"Medidas caseras"**: una lista "1 taza = 180 g · 234 kcal" con Editar, Quitar y flechas, y el
botón "Agregar medida". El cuadro de nueva medida tiene chips de sugerencias (taza, cda, unidad
mediana…), "¿Cuántos gramos pesa 1?", vista previa en vivo con el plural automático y un campo de
plural opcional. En los SARA 2 la composición sigue bloqueada, pero la tarjeta es editable. En el
editor de comidas (planes y plantillas), al elegir un alimento con medidas aparece "Medida casera |
Gramos" con "Medida casera" elegida, la primera medida del alimento, un stepper de ¼ a 20 y el
resultado "= 270 g". Si el alimento no tiene medidas, queda en gramos y hay un botón para crear
una medida ahí mismo, sin salir del plan. El ítem se guarda con `quantityGrams` = cantidad × gramos
por medida, así que **todo el cálculo de macros, franja, promedio, micronutrientes e impacto del
buscador sigue igual**. Además, el ítem guarda una copia de la medida: cambiar o borrar la medida
después no altera planes ya armados. El ítem se ve como "1½ tazas" con "270 g" en gris y un stepper
que cambia la cantidad en el lugar. Copiar día, repetir, cambiar el modo, deshacer y aplicar
plantilla conservan la medida. El portal muestra "1½ tazas" y debajo "270 g", y el PDF "1½ tazas
(270 g)". Un script idempotente convierte en medidas los `unitHint` legibles. Los que no se pueden
leer se muestran en la ficha como "Tenías anotado: «…»" con un botón "Pasar a medida".

---

## 2. Workspaces afectados

| Workspace | ¿Cambia? | Qué |
|---|---|---|
| `packages/core` | **Sí** | Nuevo `household-measures.ts`: cantidad (¼..20), fracciones, plural y singular en español, gramos del ítem, kcal por medida, validación de la medida, parser de `unitHint`, textos `MEASURE_TEXT`. Todo con tests |
| `packages/db` | **Sí, con migración** | `schema.prisma`: modelo `FoodMeasure` y 4 columnas nullable en `PlanMealItem` y `TemplateMealItem`. Migración `food_measures`. `domain/foodMeasures.ts` (nuevo), `domain/weeklyMenu.ts` (copias, invariantes y stepper), `nutritionPlans.ts`/`planTemplates.ts` (tipos de alta y `applyTemplateToPatient`), `foods.ts` (`unitHint` opcional). `domain/unitHintConversion.ts` (solo scripts). Scripts `measures/convert-unit-hints.ts` y `test-food-measures.ts` |
| `apps/web` | **Sí** | Tarjeta "Medidas caseras" en la ficha, cuadro de medida (compartido), bloque "Agregar alimento" con medida casera, ítem con stepper, actions nuevas (`food-measure-actions.ts`), actions de alta de ítem de plan y de plantilla, `meal-view.ts`, portal, PDF, `food-picker.tsx` (callback), `food-catalog.tsx` (medidas por contexto), `own-food-form.tsx` (sin `unitHint`) |
| `apps/bot` | **No** (solo `typecheck`) | No lee planes ni alimentos. Igual se corre `typecheck`, porque cambian los tipos de Prisma (`PlanMealItem`) y de `@nutri-bot/db/domain` (`MenuItemData`) |

### 2.1 Zona de imleticio (Leo): qué se toca y hasta dónde

| Archivo | Cambio (mínimo) |
|---|---|
| `components/meals-editor.tsx` | (1) `MealItemView` suma `measure?: MeasureItemView \| null`. (2) Props `measures` (mapa por alimento), que pasa a `FoodCatalogProvider`. (3) El `<form>` "Agregar alimento" se **mueve** tal cual a `components/food-measures/add-food-form.tsx`, que suma el modo medida casera. En `MealCard` queda `<AddFoodForm …/>`. (4) En el `map` de ítems, si `item.measure`, se dibuja `<MeasureMealItem>` (nuevo) en vez del `<li>` de gramos |
| `components/food-picker.tsx` | Prop opcional `onValueChange?: (foodId: string) => void`, que se llama al elegir y al resetear. Nada más |
| `components/food-catalog.tsx` | `FoodCatalogProvider` acepta `measures?: Record<string, FoodMeasureView[]>` y expone `measuresFor(foodId)` y `addMeasure(foodId, m)` (estado local para la medida recién creada desde el editor) |
| `alimentos/[id]/page.tsx` | Carga `listFoodMeasures(id)` y monta `<FoodMeasuresCard>` arriba de la grilla de Energía. Saca `unitHint` de los `defaults` de `OwnFoodForm` |
| `alimentos/own-food-form.tsx`, `alimentos/actions.ts` | Sacan el campo "Unidad de referencia" y `unitHint` del esquema zod (D9) |
| `lib/plan-pdf.tsx` | `ItemRows`: si `item.measure`, la columna de cantidad dice "1½ tazas (270 g)" |
| `(portal)/portal/plan/portal-day-view.tsx` | `PortalMealItems`: si `item.measure`, a la derecha "1½ tazas" y debajo "270 g" chico y gris |
| `planes/[planId]/actions.ts`, `plantillas/actions.ts` | `add…MealItemAction` leen `measureId`/`measureQty` y resuelven la medida en el server (6.2) |
| `planes/[planId]/page.tsx`, `plantillas/[id]/page.tsx` | Suman `listMeasuresForPicker()` al `Promise.all` y pasan `measures` al editor |

Aviso para el PR (a Leo): "El formulario 'Agregar alimento' se movió sin cambios a
`components/food-measures/add-food-form.tsx`, que suma el modo medida casera. El ítem en medida se
dibuja en `MeasureMealItem`. El PDF y el portal suman una rama por ítem con medida. Lo que le
toca a la HU-015 (PDF) y a la HU-017e (rediseño de planes y alimentos) está en la sección 14."

---

## 3. Esquema (Prisma) y migración (skill `migracion-prisma`)

### 3.1 Cambios en `packages/db/prisma/schema.prisma`

```prisma
/// HU-018d: medida casera de un alimento ("1 taza = 180 g"). La equivalencia es POR alimento.
/// Se cargan a mano (D1) o salen de convertir el unitHint (D9). Se pueden cargar en SARA 2: la
/// composición del alimento no cambia.
model FoodMeasure {
  id        String   @id @default(cuid())
  food      Food     @relation(fields: [foodId], references: [id], onDelete: Cascade)
  foodId    String
  /// Singular, como lo escribió ella ("taza", "unidad mediana"). trim + espacios colapsados, 1..40.
  name      String
  /// foodSearchText(name) (core): unicidad por alimento sin mayúsculas ni tildes.
  nameKey   String
  /// Plural escrito a mano (D6). null = el automático (pluralizeMeasureName de core). 1..40.
  plural    String?
  /// Gramos que pesa UNA medida. 0,1..2000, 1 decimal. Líquidos: 1 ml ≈ 1 g (D8).
  grams     Decimal  @db.Decimal(6, 1)
  /// Orden en la lista. La primera es la que se propone al agregar (D13).
  order     Int
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@unique([foodId, nameKey])
  @@index([foodId, order])
}
```

En `model Food` se agrega la relación: `measures FoodMeasure[] // HU-018d`.

En `model PlanMealItem` **y** en `model TemplateMealItem`, iguales, después de `portions`:

```prisma
  /// HU-018d: ítem de alimento en medida casera. Las 4 van juntas (todas null o todas con valor) y
  /// solo con foodId (nunca con recipeId). Son COPIAS de la medida al agregar (D4): cambiar o borrar
  /// la FoodMeasure no toca el ítem. quantityGrams = measureItemGrams(measureQty, measureGrams).
  /// Cantidad: ¼..20 de a ¼ (D5).
  measureQty    Decimal?  @db.Decimal(4, 2)
  /// Singular ("taza").
  measureName   String?
  /// Plural ya resuelto al agregar (el escrito a mano o el automático): "tazas".
  measurePlural String?
  /// Gramos por medida al agregar (para recalcular con el stepper).
  measureGrams  Decimal?  @db.Decimal(6, 1)
```

Rangos: `measureQty` máx. 20,00 entra en `Decimal(4,2)`; 20 × 2000 = 40 000 g entra en
`quantityGrams Decimal(7,2)`.

**Sin FK** del ítem a `FoodMeasure` (D4, 13-T7) y **sin `CHECK`** en la base (13-T8): las
invariantes las asegura el dominio, igual que en 018c.

Invariantes nuevas (dominio, `weeklyMenu.ts` y las actions):

- **M1.** `measureQty`, `measureName`, `measurePlural` y `measureGrams`: o las cuatro son null o las
  cuatro tienen valor.
- **M2.** Con medida: `foodId != null`, `recipeId == null`, `portions == null`, `customLabel == null`,
  `normalizeMeasureQty(measureQty) != null`, `measureGrams` entre 0,1 y 2000, y
  `quantityGrams == measureItemGrams(measureQty, measureGrams)` (tolerancia 0,01).
- Siguen valiendo las de 018b (weekday contra el modo; `order` correlativo) y las de 018c (receta).

### 3.2 Migración

Nombre: **`food_measures`**. Desde `packages/db`:

```bash
npx dotenv -e ../../.env -- prisma migrate dev --create-only --name food_measures
```

Lo que **tiene** que tener el `migration.sql` generado (revisarlo antes de aplicar):

- `CREATE TABLE "FoodMeasure"` con `"grams" DECIMAL(6,1) NOT NULL`, `"order" INTEGER NOT NULL`,
  `"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP` y `"updatedAt" TIMESTAMP(3) NOT NULL`.
  Es una tabla nueva y vacía: los `NOT NULL` no necesitan backfill.
- `CREATE UNIQUE INDEX "FoodMeasure_foodId_nameKey_key"` y `CREATE INDEX "FoodMeasure_foodId_order_idx"`.
- FK `FoodMeasure_foodId_fkey` → `Food(id)` `ON DELETE CASCADE ON UPDATE CASCADE`.
- `ALTER TABLE "PlanMealItem" ADD COLUMN "measureQty" DECIMAL(4,2), ADD COLUMN "measureName" TEXT,
  ADD COLUMN "measurePlural" TEXT, ADD COLUMN "measureGrams" DECIMAL(6,1)`, y lo mismo en
  `"TemplateMealItem"`. Las cuatro son **nullable y sin default**. Las 132 filas existentes quedan en
  `NULL`, que es exactamente "ítem en gramos, como siempre". **No hay backfill.**

Lo que **no** puede aparecer: ningún `DROP`, ningún `ALTER COLUMN` sobre columnas existentes (en
particular `Food.unitHint` **queda** igual, D9) y ningún cambio en otras tablas. Si aparece, parar y
reportar `blocked` (drift o un rename mal interpretado).

La conversión de `unitHint` **no** va en esta migración: es un script aparte (3.6 y 13-T2).

### 3.3 Respaldo y orden de aplicación (dev)

1. `git fetch && git log origin/develop -1` y `ls packages/db/prisma/migrations`: confirmar que nadie
   mergeó otra migración en `develop` (regla del equipo: una sola HU con `schema.prisma` en
   `implementando`). Si apareció una, `git rebase origin/develop` **antes** de crear la carpeta.
2. `cd packages/db && npx dotenv -e ../../.env -- prisma migrate status`: tiene que decir
   "Database schema is up to date". Si hay drift → `blocked` con la salida. No resolverlo.
3. Respaldo **fuera del repo**:
   `mkdir -p ~/nutribot-backups && docker compose exec -T db pg_dump -U nutri -d nutribot -Fc > ~/nutribot-backups/pre-food-measures-$(date +%Y%m%d-%H%M).dump`
4. Conteo antes (solo lectura, 12.1 "Conteos de control").
5. Editar el schema, `--create-only`, revisar el SQL según 3.2, `npm run db:migrate` (desde la raíz)
   y `npm run db:generate`.
6. Conteo después: `Food`, `PlanMealItem`, `TemplateMealItem` iguales; `FoodMeasure` = 0;
   `select count(*) from "PlanMealItem" where "measureName" is not null` = 0.

### 3.4 Prohibido (skill y `AGENTS.md`)

`prisma migrate reset`, aceptar el reset que ofrece `migrate dev`, `prisma db push`, pasar
`DATABASE_URL` como `--shadow-database-url` y `prisma migrate diff --from-migrations` contra la base
de desarrollo. Tampoco se edita una migración ya aplicada: si hay que corregir, migración nueva.

### 3.5 Producción

`prisma migrate deploy` (aditiva, sin backfill). Después, **opcional**, la conversión de `unitHint`
(3.6): primero en seco (`npm run measures:convert-hints:prod --workspace packages/db` con
`DATABASE_URL` de producción) y, si el reporte está bien, con `-- --apply`. Se documenta en el PR y
en la sección "Despliegue" del README (un renglón).

### 3.6 Conversión de `unitHint` (script idempotente, no SQL)

- Lógica de lectura: `parseUnitHint` en core (4.1), con tests sobre **los 55 textos distintos que hay
  hoy en la base** (lista en la verificación de arriba).
- Lógica de escritura: `convertUnitHints` en `packages/db/domain/unitHintConversion.ts` (5.4). **No**
  se exporta desde `domain/index.ts` (solo la usan scripts, como `recipeTransfer.ts`).
- Script: `packages/db/scripts/measures/convert-unit-hints.ts`. Por defecto corre **en seco** (no
  escribe nada) e imprime una tabla: alimento, fuente, `unitHint`, resultado ("taza = 180 g" / "ya
  tenía «taza»" / "no se puede leer"). Con `--apply` escribe en **una** transacción.
- Idempotente: para cada alimento con `unitHint` legible crea la medida **solo si** el alimento no
  tiene ya una con el mismo `nameKey`. Correrlo dos veces da 0 altas la segunda vez. Nunca modifica
  ni borra `unitHint`, nunca toca medidas existentes, nunca toca ítems.
- Scripts npm en `packages/db/package.json`:
  - `"measures:convert-hints": "dotenv -e ../../.env -- tsx scripts/measures/convert-unit-hints.ts"`
  - `"measures:convert-hints:prod": "tsx scripts/measures/convert-unit-hints.ts"`
- En **dev**, el implementer lo corre en seco y deja la salida en `progress/impl_HU-018d.md`. **No lo
  aplica** sobre la base del usuario sin que el orquestador lo confirme con el usuario, porque crea filas
  en alimentos que ya existen (no borra ni modifica nada, pero son datos de negocio). La prueba con
  escritura la hace `test-food-measures.ts` sobre su propio alimento (11.4).

---

## 4. Contrato compartido: `packages/core`

### 4.1 `packages/core/src/household-measures.ts` (nuevo; `export *` desde `index.ts`)

Todo puro. Lo consumen `apps/web` (editor, ficha, portal, PDF, actions) y `packages/db` (dominio y
scripts).

```ts
// ── Cantidad (D5) ──
export const MEASURE_QTY_STEP = 0.25;
export const MEASURE_QTY_MIN = 0.25;
export const MEASURE_QTY_MAX = 20;
/** Múltiplo de ¼ en [¼, 20] (tolera el error de coma flotante) o null. */
export function normalizeMeasureQty(value: number): number | null;
/** ±¼ con tope en los extremos. Un valor no finito arranca en 1. */
export function stepMeasureQty(current: number, direction: 1 | -1): number;
/** "¼", "½", "¾", "1", "1¼", "1½", "1¾", "2", …, "20". Valor fuera de la grilla → se redondea a ¼. */
export function formatMeasureQty(qty: number): string;

// ── Medida: límites y validación ──
export const MEASURE_NAME_MAX = 40;
export const MEASURE_GRAMS_MIN = 0.1;
export const MEASURE_GRAMS_MAX = 2000;
/** trim + espacios internos colapsados. No cambia mayúsculas. */
export function cleanMeasureName(name: string): string;
/** foodSearchText(cleanMeasureName(name)): "Tazá" y "taza" dan lo mismo. Clave de unicidad. */
export function measureNameKey(name: string): string;
/** Gramos a 1 decimal (Math.round(x*10)/10). null si no es número finito. */
export function roundMeasureGrams(grams: number): number | null;

export type MeasureField = "name" | "plural" | "grams";
export interface MeasureInput { name: string; plural: string | null; grams: number | null }
export interface MeasureIssue { field: MeasureField; message: string }
/**
 * Valida (sin unicidad, que la mira la base). Orden: name vacío → MEASURE_TEXT.nameRequired;
 * name > 40 → nameTooLong; plural (si viene, tras limpiar) > 40 → pluralTooLong;
 * grams null/no finito/redondeado < 0,1/> 2000 → gramsRange. Devuelve todos los problemas, uno por campo.
 */
export function validateMeasure(input: MeasureInput): MeasureIssue[];
/** Datos listos para guardar: name limpio, nameKey, plural limpio o null (vacío o igual al automático → null), grams redondeado. */
export function normalizeMeasureInput(input: MeasureInput): { name: string; nameKey: string; plural: string | null; grams: number };

// ── Plural y singular (D6) ──
/**
 * Plural en español, palabra por palabra hasta la primera preposición (de, del, con, sin, para, a,
 * al, en, por): "taza de té" → "tazas de té"; "unidad mediana" → "unidades medianas".
 * Abreviaturas: cda → cdas, cdita → cditas, cdta → cdtas, cc → cc (sin cambio).
 * Por palabra: termina en vocal (con o sin tilde, salvo í/ú) → +s; en "ión" → "iones" (porción →
 * porciones); en "z" → "ces"; en "s" o "x" → sin cambio; en í/ú → +es; otra consonante (incluida y) → +es.
 * Conserva mayúsculas iniciales de cada palabra.
 */
export function pluralizeMeasureName(name: string): string;
/**
 * Inversa aproximada (solo para parseUnitHint con N ≠ 1), mismas palabras: "iones" → "ión";
 * "ces" → "z"; consonante (d, l, n, r, j) + "es" → sin "es" ("unidades" → "unidad"); si no, una "s"
 * final se saca ("cucharadas" → "cucharada", "cuadraditos" → "cuadradito"). cdas → cda, cditas → cdita.
 */
export function singularizeMeasureName(name: string): string;
/** Plural a guardar en el ítem: el escrito a mano o el automático. */
export function resolvedMeasurePlural(m: { name: string; plural: string | null }): string;

// ── Conversión y textos con números ──
/** quantityGrams del ítem: Math.round(qty × grams × 100) / 100 (Decimal(7,2)). */
export function measureItemGrams(qty: number, gramsPerUnit: number): number;
/** kcal redondeadas de `grams` gramos de un alimento con kcalPer100. */
export function measureKcal(kcalPer100: number, grams: number): number;
/** "1 taza", "½ taza", "1½ tazas", "2 unidades medianas". qty ≤ 1 → singular; > 1 → plural. */
export function measureAmountText(qty: number, m: { name: string; plural: string }): string;
/** "270 g", "6,3 g" (es-AR, máx. 1 decimal). */
export function formatGrams(grams: number): string;
/** PDF: "1½ tazas (270 g)". */
export function measureWithGramsText(qty: number, m: { name: string; plural: string }, grams: number): string;
/** Desplegable del editor: "taza (180 g)". */
export function measureOptionLabel(m: { name: string; grams: number }): string;
/** Lista de la ficha: "1 taza = 180 g · 234 kcal". */
export function measureListLine(m: { name: string; grams: number }, kcalPer100: number): string;
/** Vista previa del cuadro: { one: "1 taza de Arroz blanco, hervido = 180 g · 234 kcal", two: "2 tazas = 360 g" }. null si los datos no validan. */
export function measurePreview(input: MeasureInput, food: { name: string; kcalPer100: number }): { one: string; two: string } | null;

// ── unitHint (D9) ──
export interface ParsedUnitHint { name: string; grams: number }
/**
 * "N <nombre> ≈ X <unidad>" (también "=", "~"). N: entero, decimal con coma o punto, "1/2" o
 * "1 1/2". Unidad: g, gr, grs, gramos, ml, cc (ml y cc como g, D8), con punto final opcional.
 * N ≠ 1 → grams = X / N (redondeado a 1 decimal) y nombre singularizado si N > 1.
 * null si: no matchea, N ≤ 0, el nombre limpio está vacío o supera 40, tiene dígitos, o los
 * gramos por unidad quedan fuera de [0,1; 2000].
 * Ej.: "1 taza ≈ 180 g" → {taza, 180}; "1 vaso ≈ 200 ml" → {vaso, 200}; "4 unidades ≈ 25 g" →
 * {unidad, 6.3}; "1/2 taza ≈ 125 g" → {taza, 250}; "1 lata ≈  lata 473 ml" → null; "usar con moderación" → null.
 */
export function parseUnitHint(text: string | null | undefined): ParsedUnitHint | null;
/** Texto para "Pasar a medida": cleanMeasureName(text).slice(0, 40). */
export function unitHintPrefillName(text: string): string;

// ── Sugerencias del cuadro (UX de la HU) ──
export const MEASURE_SUGGESTIONS: readonly { name: string; label: string }[];
// [{taza,"taza"},{taza de té,"taza de té"},{pocillo,…},{vaso,…},{cda,"cda (cucharada)"},
//  {cdita,"cdita (cucharadita)"},{unidad chica,…},{unidad mediana,…},{unidad grande,…},{feta,…},
//  {rebanada,…},{plato,…},{porción,…},{puñado,…},{pote,…},{lata,…}] — al tocar se escribe `name`.

export const MEASURE_TEXT: { /* 4.2 */ };
/** "¿Quitar la medida «taza»?" */
export function removeMeasureTitle(name: string): string;
/** "Este alimento ya tiene la medida «taza»" (con el nombre como está guardado). */
export function duplicateMeasureMessage(existingName: string): string;
/** "Medida guardada en Quinoa, cocida" */
export function measureSavedInMessage(foodName: string): string;
/** "Tenías anotado: «porción chica». Pasalo a una medida para usarlo en los planes." */
export function legacyUnitHintText(text: string): string;
/** "Sumar ¼ a Arroz blanco, hervido" / "Restar ¼ a …" */
export function measureStepperAriaLabel(direction: 1 | -1, foodName: string): string;
```

### 4.2 Textos exactos (`MEASURE_TEXT`)

| Clave | Texto |
|---|---|
| `cardTitle` | "Medidas caseras" |
| `cardHelp` | "Cuánto pesa una taza, una cucharada o una unidad de este alimento. Se usan para armar planes en medidas caseras." |
| `saraNote` | "Las medidas son tuyas; la composición es de la tabla SARA 2 y no cambia" |
| `empty` | "Todavía no tiene medidas caseras." |
| `addButton` | "Agregar medida" |
| `edit` / `remove` | "Editar" / "Quitar" |
| `moveUp` / `moveDown` (aria) | "Subir {name}" / "Bajar {name}" |
| `removeDescription` | "Los planes que ya la usan no cambian." |
| `removed` | "Medida quitada" |
| `dialogNew` / `dialogEdit` | "Agregar medida" / "Editar medida" |
| `nameLabel` / `namePlaceholder` | "Medida" / "Ej: taza" |
| `suggestionsLabel` (aria del grupo de chips) | "Sugerencias de medidas" |
| `gramsLabel` / `gramsHint` | "¿Cuántos gramos pesa 1?" / "Para líquidos, 1 ml ≈ 1 g" |
| `pluralLink` / `pluralLabel` / `pluralHint` | "¿Se escribe distinto en plural?" / "Plural" / "Ej: unidades medianas" |
| `save` / `cancel` | "Guardar" / "Cancelar" |
| `nameRequired` | "Escribí el nombre de la medida (por ejemplo, taza)" |
| `nameTooLong` | "El nombre puede tener hasta 40 caracteres" |
| `pluralTooLong` | "El plural puede tener hasta 40 caracteres" |
| `gramsRange` | "Escribí cuántos gramos pesa una (entre 0,1 y 2000)" |
| `saved` | "Medida guardada" |
| `saveError` | "No se pudo guardar la medida. Probá de nuevo." |
| `notFound` | "Esa medida ya no existe. Recargá la página." |
| `sessionExpired` | `RECIPE_TEXT.sessionExpired` (el mismo de 018a/018c) |
| `legacyButton` | "Pasar a medida" |
| `modeAria` / `modeHousehold` / `modeGrams` | "Cómo cargar la cantidad" / "Medida casera" / "Gramos" |
| `qtyLabel` / `measureLabel` | "Cantidad" / "Medida" |
| `addFromEditor` | "Agregar una medida casera a este alimento" |
| `qtyGroupAria` | "Cantidad de {food}" |
| `qtyError` | "No se pudo cambiar la cantidad. Probá de nuevo." |

---

## 5. Contrato compartido: `packages/db/domain`

### 5.1 `domain/foodMeasures.ts` (nuevo; `export *` desde `domain/index.ts`): web y scripts

```ts
export const FOOD_MEASURE_SELECT = { id: true, foodId: true, name: true, plural: true, grams: true, order: true } satisfies Prisma.FoodMeasureSelect;
/** grams ya como number. */
export interface FoodMeasureRow { id: string; foodId: string; name: string; plural: string | null; grams: number; order: number }

export class InvalidFoodMeasureError extends Error { constructor(public readonly issues: MeasureIssue[]) }
export class DuplicateFoodMeasureError extends Error { constructor(public readonly existingName: string) }
export class FoodMeasureNotFoundError extends Error {}

/** Medidas de un alimento por `order` asc (ficha). */
export function listFoodMeasures(foodId: string): Promise<FoodMeasureRow[]>;
/** Medidas de los alimentos SARA 2 ACTIVOS, agrupadas por foodId y ordenadas (editor). Solo trae los que tienen medidas. */
export function listMeasuresForPicker(): Promise<Record<string, FoodMeasureRow[]>>;
/**
 * Valida (validateMeasure → InvalidFoodMeasureError), normaliza y crea al final (order = máx + 1), en
 * transacción. Duplicado por (foodId, nameKey) → DuplicateFoodMeasureError(existente.name); también
 * traduce el P2002 de la base al mismo error. Alimento inexistente → FoodMeasureNotFoundError.
 * Vale para SARA 2 y PROPIO, activos o no (las medidas no son composición).
 */
export function createFoodMeasure(foodId: string, input: MeasureInput): Promise<FoodMeasureRow>;
/** Igual que create, excluyéndose de la unicidad. No toca ningún ítem (D4). */
export function updateFoodMeasure(measureId: string, input: MeasureInput): Promise<FoodMeasureRow>;
/** Borra solo esa medida. No toca ningún ítem (D4). Inexistente → FoodMeasureNotFoundError. Devuelve el foodId (para revalidar). */
export function deleteFoodMeasure(measureId: string): Promise<{ foodId: string }>;
/** Intercambia `order` con la vecina dentro del alimento. En el borde no hace nada. */
export function moveFoodMeasure(measureId: string, direction: "up" | "down"): Promise<{ foodId: string }>;

/** Campos de medida de un ítem (los que se copian). */
export interface MeasureItemFields { measureQty: number; measureName: string; measurePlural: string; measureGrams: number; quantityGrams: number }
/**
 * Lee la medida, verifica que sea de `foodId` (si no → FoodMeasureNotFoundError), valida qty con
 * normalizeMeasureQty (si no → RangeError) y arma la copia: name, resolvedMeasurePlural, grams y
 * quantityGrams = measureItemGrams(qty, grams).
 */
export function resolveMeasureItem(foodId: string, measureId: string, qty: number): Promise<MeasureItemFields>;
```

### 5.2 Cambios en `domain/foods.ts` (contrato de `OwnFoodInput`)

- `OwnFoodInput.unitHint` pasa a **opcional**: `unitHint?: string | null`.
- `ownFoodData` incluye `unitHint` **solo si** `input.unitHint !== undefined`. Así, guardar un propio
  desde el formulario nuevo (sin el campo) **no borra** su `unitHint`.
- `createOwnFood` sigue igual (está deshabilitada en la action, pero el dominio la conserva).
- Test: `updateOwnFood` sin `unitHint` → el `data` del `update` no tiene la clave `unitHint`.

### 5.3 Cambios en `domain/weeklyMenu.ts` (Joel, 018b/018c)

- `MenuItemData` suma `measureQty: number | null; measureName: string | null; measurePlural: string | null; measureGrams: number | null`.
- `ItemRow` suma `measureQty` y `measureGrams` (`{ toString(): string } | null`), `measureName` y
  `measurePlural` (`string | null`).
- `itemCopyData` copia las cuatro (`Number(...)` para los Decimal, null si faltan). Es el **único**
  lugar que lista los campos: así `setMealMode`, `copyDay`, `repeatMealInAllDays`, `toSnapshot` y
  `restoreMealSnapshots` los conservan solos.
- `assertSnapshotInvariants` suma M1 y M2 (3.1) con `MealModeError("Un ítem en medida casera lleva alimento, cantidad válida y sus gramos.")`.
- Nuevo:

```ts
/**
 * Stepper (D10): cambia la cantidad de UN ítem en medida casera del dueño. Busca el ítem con
 * { id, measureName: { not: null }, meal: { [ownerKey]: ownerId } } (si no → MealOwnershipError), valida
 * qty (RangeError) y actualiza { measureQty: qty, quantityGrams: measureItemGrams(qty, measureGrams) }
 * con los gramos COPIADOS del ítem (no los de la medida actual, D4).
 */
export function setMeasureItemQuantity(kind: MealOwnerKind, ownerId: string, itemId: string, qty: number): Promise<{ quantityGrams: number }>;
```

### 5.4 `nutritionPlans.ts`, `planTemplates.ts` y `unitHintConversion.ts`

- `MealItemData` (plan) y `TemplateItemData` (plantilla) suman los cuatro campos opcionales
  (`measureQty?`, `measureName?`, `measurePlural?`, `measureGrams?`, `number | string | null`).
  `addMealItem`/`addTemplateMealItem` no cambian de lógica (el `...data` ya los pasa). Las actions
  solo los llenan con lo que devuelve `resolveMeasureItem`. El asistente IA (`ai-actions.ts`) no los
  manda y sigue igual.
- `applyTemplateToPatient`: suma `measureQty`, `measureName`, `measurePlural` y `measureGrams` al
  `create` de cada ítem (al lado de `recipeId`/`portions`). Test con un ítem en medida.
- `getPlan`, `getTemplate` y los `include`: **sin cambios** (los escalares vienen solos).
- `domain/unitHintConversion.ts` (nuevo, **no** exportado desde `index.ts`):

```ts
export interface UnitHintRow { foodId: string; foodName: string; source: "SARA2" | "PROPIO"; unitHint: string;
  result: { kind: "CREATED" | "WOULD_CREATE"; name: string; grams: number } | { kind: "ALREADY_HAD"; name: string } | { kind: "UNREADABLE" } }
/**
 * Recorre los alimentos con unitHint no vacío (todos, cualquier fuente y estado; o solo `foodIds` si
 * viene). parseUnitHint; si es legible y el alimento no tiene una medida con ese nameKey, la crea
 * al final (apply) o la reporta (seco). Una transacción con apply. Nunca toca unitHint ni otras medidas.
 */
export function convertUnitHints(params: { apply: boolean; foodIds?: string[] }): Promise<UnitHintRow[]>;
```

### 5.5 Qué **no** cambia en `domain` (verificado)

`getFoodUsage` (sigue contando por `foodId`), `listFoods`/`FOOD_SUMMARY_SELECT`, `foodImport.ts`
(el cargador SARA 2 no toca medidas: `FoodMeasure` cuelga de `Food` y el upsert por `sourceKey` no
borra alimentos), `recipes.ts`, `addRecipeItems`, `setRecipeItemPortions`, `removeMenuItems`.

---

## 6. Rutas, server actions y API (`apps/web`)

No hay rutas nuevas. Cambia `/alimentos/[id]` (tarjeta) y el editor de `/pacientes/[id]/planes/[planId]`
y `/plantillas/[id]`.

### 6.1 `apps/web/src/app/(panel)/food-measure-actions.ts` (nuevo, `"use server"`)

Exporta **solo funciones async**. Tipos en `components/food-measures/types.ts`. Cada action: chequea
`hasPanelSession()` (de `./recetas/recipe-save`; si no → `{ ok:false, error: MEASURE_TEXT.sessionExpired }`),
valida con zod, llama a domain, revalida y loguea solo `errorCode(err)`.

```ts
// types.ts
export interface FoodMeasureView { id: string; foodId: string; name: string; plural: string | null; grams: number; order: number }
export type MeasureFieldErrors = Partial<Record<MeasureField, string>>;
export type FoodMeasureResult = { ok: true; measure: FoodMeasureView } | { ok: false; error?: string; fieldErrors?: MeasureFieldErrors };
export type MeasureMutationResult = { ok: true } | { ok: false; error: string };
export interface MeasureItemView { qty: number; name: string; plural: string; gramsPerUnit: number }

// food-measure-actions.ts
export async function createFoodMeasureAction(input: { foodId: string; name: string; plural: string | null; grams: number | null }): Promise<FoodMeasureResult>;
export async function updateFoodMeasureAction(input: { measureId: string; name: string; plural: string | null; grams: number | null }): Promise<FoodMeasureResult>;
export async function deleteFoodMeasureAction(input: { measureId: string }): Promise<MeasureMutationResult>;
export async function moveFoodMeasureAction(input: { measureId: string; direction: "up" | "down" }): Promise<MeasureMutationResult>;
export async function setMeasureItemQtyAction(input: { kind: MealOwnerKind; ownerId: string; itemId: string; qty: number }): Promise<MeasureMutationResult>;
```

- zod: ids `string().min(1).max(64)`; `name` `string().max(200)` (el límite fino lo da core);
  `plural` `string().max(200).nullable()`; `grams` `number().finite().nullable()`; `qty`
  `number().min(0.25).max(20).multipleOf(0.25)`; `kind` `enum(["plan","template"])`.
- Errores → resultado: `InvalidFoodMeasureError` → `fieldErrors` (un mensaje por campo, de
  `MEASURE_TEXT`); `DuplicateFoodMeasureError` → `fieldErrors.name = duplicateMeasureMessage(existingName)`;
  `FoodMeasureNotFoundError` → `error: MEASURE_TEXT.notFound`; cualquier otro → `MEASURE_TEXT.saveError`
  (stepper: `MEASURE_TEXT.qtyError`).
- Revalidación: create/update/delete/move → `revalidatePath(\`/alimentos/${foodId}\`)`. **No** revalidan
  planes: los ítems no cambian (D4). `setMeasureItemQtyAction` → `revalidateMenuOwner(kind, ownerId)`.

### 6.2 Alta de ítems: `planes/[planId]/actions.ts` y `plantillas/actions.ts`

`addPlanMealItemAction` y `addTemplateMealItemAction` suman dos campos del `FormData`: `measureId` y
`measureQty`. Para no duplicar, un helper server-only nuevo `apps/web/src/lib/measure-form.ts`:

```ts
import "server-only";
/** Lee measureId/measureQty. Sin measureId → null (ítem en gramos, como hoy). Con measureId y sin foodId,
 *  o con qty inválida (parseEsArNumber + normalizeMeasureQty) → "invalid". */
export function readMeasureFields(formData: FormData, foodId: string): { measureId: string; qty: number } | null | "invalid";
```

Flujo de cada action: igual que hoy hasta el chequeo de SARA 2. Después:
`const m = readMeasureFields(formData, foodId)`. Si es `"invalid"`, `return` (como los otros datos
inválidos). Si `m`, `resolveMeasureItem(foodId, m.measureId, m.qty)` y se pasan sus cinco campos a
`addMealItem`/`addTemplateMealItem` (el `quantityGrams` del form **se ignora**). Si es `null`, todo
como hoy. `customLabel` se fuerza a `null` cuando hay medida.

### 6.3 Mensajes del bot

No hay. El bot no interviene (HU, "Bot de WhatsApp: no interviene"). No se encola nada en
`OutboundMessage`.

---

## 7. UI (Apple, HU-017a): pantallas concretas (skill `ui`)

### 7.1 Componentes nuevos (`apps/web/src/components/food-measures/`)

| Archivo | Qué es |
|---|---|
| `types.ts` | Tipos de 6.1 (sin `"use server"`) |
| `measure-form-dialog.tsx` | `Modal` "Agregar medida" / "Editar medida". Lo usan la ficha y el editor. Props: `open`, `onClose`, `food: { id; name; kcalPer100 }`, `initial?: FoodMeasureView \| { name: string }` (prefill de "Pasar a medida"), `onSaved(measure)` |
| `food-measures-card.tsx` | Tarjeta de la ficha (lista, vacío, flechas, Quitar con `useConfirm`, aviso de `unitHint`) |
| `add-food-form.tsx` | El bloque "Agregar alimento" movido desde `meals-editor.tsx`, con el modo medida casera |
| `measure-qty-stepper.tsx` | "− 1½ +" de ¼ en ¼ entre ¼ y 20 (sobre `StepperControl`, 7.5) |
| `measure-meal-item.tsx` | Ítem en medida casera dentro de la comida |
| `use-measure-item-qty.ts` | `useOptimistic` + `setMeasureItemQtyAction` (patrón de `useRecipePortions`) |

### 7.2 Ficha del alimento: tarjeta "Medidas caseras"

- **Estructura:** `Card` con título `cardTitle` y `cardHelp` debajo, **antes** de la grilla Energía /
  Nutrientes (ancho `max-w-3xl`, como los avisos). En SARA 2, `saraNote` en `text-footnote`
  `text-muted-foreground` debajo de la ayuda.
- **Lista** (`ul` con divisores, como los ingredientes de receta): cada fila tiene `measureListLine`
  ("1 taza = 180 g · 234 kcal") y, si tiene plural a mano, en gris "Plural: unidades medianas". A la
  derecha: flechas subir/bajar (`Button variant="ghost" size="icon"`, 44 px, `aria-label`
  moveUp/moveDown, deshabilitadas en los bordes), "Editar" (abre el cuadro con la medida) y "Quitar"
  (`useConfirm` con `removeMeasureTitle(name)` + `removeDescription`; al confirmar, toast `removed`).
  Las flechas y Quitar usan `useTransition`. Con error, toast con el `error`.
- **Vacío:** `empty` + `Button size="lg"` `addButton`. Con medidas: `addButton` secundario debajo de la lista.
- **Aviso de `unitHint` (D9, 13-T5):** solo si el alimento **no tiene ninguna medida** y `unitHint`
  no está vacío. `Alert tone="info"` con `legacyUnitHintText(unitHint)` y `Button variant="secondary"`
  `legacyButton`, que abre el cuadro con `initial = { name: unitHintPrefillName(unitHint) }`. Al
  guardar la primera medida, el aviso desaparece solo.
- **Datos:** la página (server) pasa `food: { id, name, kcalPer100 }`, `measures` (de
  `listFoodMeasures`) y `unitHint`. La tarjeta es cliente y se refresca por la revalidación de la action.

### 7.3 Cuadro "Agregar medida" (`measure-form-dialog.tsx`)

- **Medida:** `Field label=nameLabel` con `Input` (placeholder `namePlaceholder`, `maxLength` 40,
  `autoComplete="off"`). Debajo, chips de `MEASURE_SUGGESTIONS` (`role="group"`, `aria-label`
  `suggestionsLabel`; botones de 44 px de alto que escriben `name` en el input y le pasan el foco al de
  gramos). Error debajo (`FormError`).
- **Gramos:** `Field label=gramsLabel hint=gramsHint` con `NumberInput unit="g" step="0.1" min="0.1" max="2000" inputMode="decimal"`.
  Se lee con `parseEsArNumber` (acepta coma).
- **Plural:** link `pluralLink` (botón `variant="link"`) que muestra `Field label=pluralLabel
  hint=pluralHint`. Si la medida ya tiene plural, el campo arranca abierto.
- **Vista previa en vivo** (`aria-live="polite"`, `text-callout`): `measurePreview(...)`, dos líneas
  ("1 taza de Arroz blanco, hervido = 180 g · 234 kcal" / "2 tazas = 360 g"). La segunda usa el plural
  escrito o el automático: así se ve "2 unidades medianas" (Gherkin "Plural automático").
- **Validación en el cliente** con `validateMeasure` al tocar Guardar (los mismos textos que el server).
  Errores del server (`fieldErrors`) debajo de cada campo; `error` general en `Alert` arriba de los botones.
- **Botones:** `Guardar` (primario, `loading`) / `Cancelar`. Al guardar: cierra, toast `saved` (en la
  ficha) o `measureSavedInMessage(food.name)` (desde el editor), y llama `onSaved(measure)`.

### 7.4 Editor de comidas: bloque "Agregar alimento" (`add-food-form.tsx`)

- Es el mismo `<form action={addItemAction}>` de hoy (hidden `mealId`, `ownerField`, `weekday`,
  `key` por día; `FoodPicker`; descripción libre; nota; botón "Agregar al martes"/"Agregar").
- Estado local: `foodId` (de `FoodPicker onValueChange`), `mode: "household" | "grams"`, `measureId`, `qty`.
  Medidas: `measuresFor(foodId)` del contexto del catálogo.
- **Al elegir un alimento con medidas:** debajo de "Alimento", `SegmentedControl` (`aria-label`
  `modeAria`, opciones `modeHousehold` / `modeGrams`, `size="lg"`), en "Medida casera", con la
  **primera** medida y `qty = 1`. **Sin alimento** (descripción libre): no hay selector y el formulario
  queda como hoy. **Alimento sin medidas:** queda "Gramos" sin selector, y debajo un
  `Button variant="secondary"` `addFromEditor` que abre `MeasureFormDialog`. Al guardar,
  `addMeasure(foodId, m)` en el contexto, `mode = "household"`, `measureId = m.id` y `qty = 1`.
- **Modo "Medida casera":** una fila con `Field label=qtyLabel` → `MeasureQtyStepper`;
  `Field label=measureLabel` → `Select` nativo con `measureOptionLabel` por opción; y el resultado
  "= 270 g" (`text-title3 tabular-nums`, `aria-live="polite"`, con `formatGrams(measureItemGrams(qty, grams))`).
  Hidden: `measureId`, `measureQty`. El `NumberInput name="quantityGrams"` **no se renderiza** (no viaja).
- **Modo "Gramos":** el `NumberInput unit="g" name="quantityGrams"` de hoy. Sin `measureId`.
- **Reset:** escucha el evento `reset` del form (como `FoodPicker`). Al resetear: `foodId=""`,
  `mode="grams"`, `measureId=""` y `qty=1`.
- Celular: la fila del stepper se apila (stepper arriba, medida y resultado abajo). Objetivos de toque
  de 44 px.

### 7.5 Stepper genérico (`components/recipe-picker/portion-stepper.tsx`)

Extraer de `PortionStepper` un `StepperControl` (mismo archivo o `components/stepper-control.tsx`)
con props `value`, `onChange`, `canDecrement`, `canIncrement`, `step(direction)`, `format(value)`,
`groupLabel`, `minusLabel`, `plusLabel`, `disabled`, `className`. `PortionStepper` queda como un wrapper
de una línea, **con el mismo DOM** (su test sigue en verde sin cambios). `MeasureQtyStepper` usa
`stepMeasureQty`, `formatMeasureQty`, `MEASURE_QTY_MIN/MAX`, `qtyGroupAria` y
`measureStepperAriaLabel`. El ancho mínimo del texto (`min-w`) se ajusta a "1¾" (más angosto que "1½
porciones").

### 7.6 Ítem en medida casera (`measure-meal-item.tsx`)

- Misma estructura que el `<li>` de gramos (nombre con `itemLabel`, nota, línea de macros con el popover
  de Atwater y "Quitar"). A la derecha, en lugar de `<Quantity g>`: **"1½ tazas"** (`text-sm
  font-medium`, `measureAmountText`) y debajo **"270 g"** (`text-xs text-muted-foreground tabular-nums`),
  y al lado el `MeasureQtyStepper`.
- Optimista: `useMeasureItemQty(kind, ownerId, item.id, measure.qty)`. Los macros se escalan con
  `scaleMacros(item.macros, qty / measure.qty)` y los gramos con `measureItemGrams(qty, measure.gramsPerUnit)`.
  Con error, el valor vuelve solo (fin de la transición) y toast `qtyError`. La franja del día se
  actualiza con la revalidación (igual que las porciones de receta en 018c).
- El popover de Atwater se calcula con los gramos optimistas (`atwaterBreakdown` del server viene para
  la cantidad guardada; mientras hay una transición pendiente se oculta el popover y se muestra la kcal
  escalada en texto, para no mostrar un desglose viejo).

### 7.7 Portal (`portal-day-view.tsx`, `PortalMealItems`)

Ítem con `item.measure`: nombre a la izquierda; a la derecha, en columna alineada a la derecha,
`measureAmountText` en `text-sm` y debajo `formatGrams(quantityGrams)` en `text-footnote
text-muted-foreground`. Ítem sin medida: como hoy. `portalMealsForClient` no cambia (la medida no es
un dato sensible y los macros de los alimentos ya viajan hoy).

### 7.8 PDF (`lib/plan-pdf.tsx`, `ItemRows`)

`itemQty`: si `item.measure`, `measureWithGramsText(qty, measure, Number(item.quantityGrams))`
("1½ tazas (270 g)"); si no, `"{quantityGrams} g"` como hoy. Nada más cambia.

---

## 8. Archivos y flujo

### 8.1 Tipos de la vista

- `MealItemView` (`meals-editor.tsx`) suma `measure?: MeasureItemView | null` (opcional: los fixtures
  de 018b/018c no cambian).
- `meal-view.ts`: `RawItem` suma `measureQty?`, `measureName?`, `measurePlural?`, `measureGrams?`
  (`unknown`/`string | null`). `toMealView` arma `measure` cuando `measureName != null` (qty, name,
  plural, gramsPerUnit en number). Los macros, el desglose y `toMicronutrientItems` **no cambian**
  (todo sale de `quantityGrams`).

### 8.2 Crear

- `packages/core/src/household-measures.ts` y `household-measures.test.ts`
- `packages/db/prisma/migrations/<ts>_food_measures/migration.sql` (generado)
- `packages/db/domain/foodMeasures.ts`, `foodMeasures.test.ts`
- `packages/db/domain/unitHintConversion.ts`, `unitHintConversion.test.ts`
- `packages/db/scripts/measures/convert-unit-hints.ts`
- `packages/db/scripts/test-food-measures.ts`
- `apps/web/src/app/(panel)/food-measure-actions.ts`, `food-measure-actions.test.ts`
- `apps/web/src/lib/measure-form.ts`, `measure-form.test.ts`
- `apps/web/src/components/food-measures/{types.ts, measure-form-dialog.tsx, food-measures-card.tsx, add-food-form.tsx, measure-qty-stepper.tsx, measure-meal-item.tsx, use-measure-item-qty.ts}`
- Tests de componentes: `measure-form-dialog.test.tsx`, `add-food-form.test.tsx`, `measure-meal-item.test.tsx`

### 8.3 Modificar

- `packages/core/src/index.ts` (`export * from "./household-measures"`)
- `packages/db/prisma/schema.prisma`; `packages/db/domain/{index,foods,weeklyMenu,nutritionPlans,planTemplates}.ts` y sus tests (`weeklyMenu.test.ts`, `planTemplates.test.ts`); `packages/db/package.json` (3 scripts)
- `apps/web/src/components/{meals-editor,food-picker,food-catalog}.tsx`, `components/recipe-picker/portion-stepper.tsx`
- `apps/web/src/lib/{meal-view,plan-pdf}.ts(x)` y sus tests
- `apps/web/src/app/(panel)/weekly-menu-actions.ts` (+ test)
- `apps/web/src/app/(panel)/pacientes/[id]/planes/[planId]/{actions,page}.ts(x)`, `plantillas/{actions.ts,[id]/page.tsx}`
- `apps/web/src/app/(panel)/alimentos/{[id]/page.tsx, own-food-form.tsx, actions.ts}`
- `apps/web/src/app/(portal)/portal/plan/portal-day-view.tsx`
- `apps/web/src/lib/food-policy.test.ts` (mock de `listMeasuresForPicker`)
- `README.md` (un renglón en "Despliegue": conversión opcional de `unitHint`)

### 8.4 `weekly-menu-actions.ts`: esquema de la foto

`snapshotItemSchema` suma, con `.default(null)` (una pestaña abierta antes del deploy manda la foto
sin estos campos):
`measureQty: z.number().min(0.25).max(20).multipleOf(0.25).nullable()`,
`measureName: z.string().min(1).max(40).nullable()`, `measurePlural: z.string().min(1).max(40).nullable()`,
`measureGrams: z.number().min(0.1).max(2000).nullable()`. El `superRefine` suma M1 y M2 (sin la
igualdad exacta de gramos, que la verifica el dominio con la tolerancia).

---

## 9. Corte en dos PR (recomendado, 13-T15)

| Parte | Fases | Qué incluye | Se mergea sola porque… |
|---|---|---|---|
| **018d-1a "Medidas y alta en medida casera"** | A–F | Schema y migración completos (las 4 columnas y `FoodMeasure`), core, dominio (CRUD de medidas, copias, invariantes, `resolveMeasureItem`, `applyTemplateToPatient`), tarjeta de la ficha con el cuadro, alta en medida casera en el editor (incluido crear la medida desde el editor), ítem con "1½ tazas · 270 g" **sin stepper**, portal y PDF | Ella ya arma planes en medida casera y el paciente los ve. Para cambiar la cantidad, quita y vuelve a agregar (como hoy con los gramos) |
| **018d-1b "Stepper y referencias anotadas"** | G–H | `setMeasureItemQuantity`, `setMeasureItemQtyAction`, `StepperControl` + `MeasureQtyStepper` en el ítem; `parseUnitHint` + `convertUnitHints` + script; aviso "Tenías anotado" y "Pasar a medida"; sacar `unitHint` del formulario (con el cambio de `OwnFoodInput`) | Sin schema. Suma cosas, no cambia lo de 1a |

La migración va **entera** en 1a: 1b no toca `schema.prisma` ni toma el lock de migraciones. Si el
orquestador prefiere un solo PR, el checklist sirve en orden.

Las dos esperan a que los PR #26 y #27 (018c) estén en `develop`: se abren después del merge, con
`git rebase origin/develop`.

---

## 10. Checklist atómico (fases en orden, un commit por fase)

### Preparación

- [ ] P1. `git fetch && git log origin/develop -1`. Si #26/#27 ya se mergearon, `git rebase origin/develop`.
      Confirmar que no entró otra migración en `develop` después de `20261003102553_recipes`.
- [ ] P2. `cd packages/db && npx dotenv -e ../../.env -- prisma migrate status` → "up to date". Si hay
      drift → `blocked`.
- [ ] P3. Leer la sección 12.1 de esta SDD (Turbopack, builds en copia) y `skills/migracion-prisma.md`.

### Fase A: `packages/core` (1a)

- [ ] A1. `household-measures.ts`: cantidad (`normalizeMeasureQty`, `stepMeasureQty`, `formatMeasureQty`), con tests.
- [ ] A2. Nombre y validación (`cleanMeasureName`, `measureNameKey`, `roundMeasureGrams`, `validateMeasure`, `normalizeMeasureInput`), con tests.
- [ ] A3. `pluralizeMeasureName`, `singularizeMeasureName` y `resolvedMeasurePlural`, con tests.
- [ ] A4. `measureItemGrams`, `measureKcal`, `formatGrams`, `measureAmountText`, `measureWithGramsText`, `measureOptionLabel`, `measureListLine`, `measurePreview`, `MEASURE_SUGGESTIONS`, `MEASURE_TEXT` y las funciones de texto, con tests.
- [ ] A5. `parseUnitHint` y `unitHintPrefillName`, con la tabla de 11.1 (se incluye en 1a para que el core quede completo; no se usa hasta 1b).
- [ ] A6. `index.ts`; `npm run typecheck --workspace packages/core` y `npx vitest run packages/core`.
- Commit: `HU-018d: medidas caseras en core (cantidad, plural, gramos, textos y unitHint)`.

### Fase B: esquema y migración (1a)

- [ ] B1. Pasos 3.3.1 a 3.3.4 (fetch, status, `pg_dump` fuera del repo, conteos).
- [ ] B2. `schema.prisma` según 3.1. `--create-only --name food_measures`. Revisar el SQL contra 3.2.
- [ ] B3. `npm run db:migrate` y `npm run db:generate`. Conteos después (3.3.6).
- [ ] B4. `npm run typecheck` (los 4 workspaces; `apps/bot` también).
- Commit: `HU-018d: modelo FoodMeasure y medida casera en los ítems (migración)`.

### Fase C: `packages/db/domain` (1a)

- [ ] C1. `foodMeasures.ts` (5.1) y `foodMeasures.test.ts` (11.2). `export *` en `domain/index.ts`.
- [ ] C2. `weeklyMenu.ts`: `ItemRow`, `MenuItemData`, `itemCopyData` y `assertSnapshotInvariants` (5.3). Actualizar las aserciones `toEqual` de `weeklyMenu.test.ts` (suman los cuatro campos en `null`) + casos nuevos.
- [ ] C3. `nutritionPlans.ts`/`planTemplates.ts` (5.4): tipos de alta y `applyTemplateToPatient`. Actualizar `planTemplates.test.ts` + caso con medida.
- [ ] C4. `npm run typecheck` (los 4) y `npx vitest run packages/db`.
- Commit: `HU-018d: medidas caseras en domain (CRUD, copias e invariantes)`.

### Fase D: script contra la base, parte 1a

- [ ] D1. `scripts/test-food-measures.ts` (11.4, pasos 1 a 9) y `"test:food-measures"` en `packages/db/package.json`.
- [ ] D2. Correrlo **dos veces seguidas**: OK las dos y conteos de control iguales.
- Commit: `HU-018d: script de verificación de medidas caseras`.

### Fase E: `apps/web`, lectura y actions (1a)

- [ ] E1. `components/food-measures/types.ts`; `MealItemView.measure`; `meal-view.ts` (8.1) + casos en `meal-view.test.ts`.
- [ ] E2. `plan-pdf.tsx` (7.8) + caso en `plan-pdf.test.tsx`. `portal-day-view.tsx` (7.7).
- [ ] E3. `weekly-menu-actions.ts`: esquema de la foto (8.4) + tests (foto con medida pasa; medida sin `foodId` no pasa; medida con 3 de 4 campos no pasa; foto vieja sin campos pasa con `null`).
- [ ] E4. `food-measure-actions.ts` (6.1, sin `setMeasureItemQtyAction`) + `food-measure-actions.test.ts`.
- [ ] E5. `lib/measure-form.ts` + test; `addPlanMealItemAction`/`addTemplateMealItemAction` (6.2). Casos en `food-policy.test.ts` (mock de `listMeasuresForPicker` y `resolveMeasureItem`; un alta con medida llama a `addMealItem` con los cinco campos e ignora `quantityGrams` del form).
- Commit: `HU-018d: la medida casera en el plan, el portal, el PDF y las actions`.

### Fase F: UI (1a)

- [ ] F1. `food-catalog.tsx` (medidas por contexto) y `food-picker.tsx` (`onValueChange`).
- [ ] F2. `measure-form-dialog.tsx` + test.
- [ ] F3. `food-measures-card.tsx` (sin el aviso de `unitHint`) y montaje en `alimentos/[id]/page.tsx`.
- [ ] F4. `add-food-form.tsx` (movido + modo medida casera, 7.4) + test; `meals-editor.tsx` (2.1, puntos 1 a 4). En 1a, `measure-meal-item.tsx` **sin** stepper.
- [ ] F5. Páginas del plan y de la plantilla: `listMeasuresForPicker()` y la prop `measures`.
- [ ] F6. Verificación de 1a (12.1 completo, 12.2 pasos 1 a 12).
- Commits: `HU-018d: medidas caseras en la ficha del alimento`, `HU-018d: agregar alimentos en medida casera`, `HU-018d: verificación de 018d-1a`.

### Fase G: stepper y referencias anotadas (1b)

- [ ] G1. `weeklyMenu.ts`: `setMeasureItemQuantity` + tests. `setMeasureItemQtyAction` + tests.
- [ ] G2. `StepperControl` (7.5), `PortionStepper` como wrapper (su test sin cambios), `measure-qty-stepper.tsx`, `use-measure-item-qty.ts` y el stepper en `measure-meal-item.tsx` (7.6) + test.
- [ ] G3. `domain/foods.ts`: `unitHint` opcional (5.2) + test. `own-food-form.tsx`/`alimentos/actions.ts`/`[id]/page.tsx` sin `unitHint`.
- [ ] G4. Aviso "Tenías anotado" + "Pasar a medida" en `food-measures-card.tsx` (7.2).
- [ ] G5. `unitHintConversion.ts` + test (prisma mockeado); `scripts/measures/convert-unit-hints.ts`; scripts npm (3.6). Correr **en seco** contra la base de dev y pegar el reporte en `progress/impl_HU-018d.md` (esperado: 77 legibles, 2 ilegibles). **No** `--apply` sin confirmación del usuario.
- [ ] G6. `test-food-measures.ts` pasos 10 a 12 (11.4). Dos veces seguidas.
- [ ] G7. README, "Despliegue": un renglón.
- Commit: `HU-018d: stepper de la medida casera y conversión de unitHint`.

### Fase H: verificación de 1b

- [ ] H1. 12.1 completo y 12.2 pasos 13 a 17.
- Commit: `HU-018d: verificación de 018d-1b`.

Cada commit lleva el trailer `Co-Authored-By` del agente y **solo** los archivos de su fase (el working
tree tiene archivos ajenos sin trackear: `.mcp.json`, `apps/bot/.whatsapp-auth.vieja*`,
`docker-compose.prod.yml`, `docs/auditoria-apple/017a/`, `hus-last-meet.md`: **no** se agregan).

---

## 11. Tests

### 11.1 `packages/core/src/household-measures.test.ts` (vitest)

- **Cantidad:** `normalizeMeasureQty`: 0,25 / 1 / 1,5 / 20 → igual; 0, 0,1, 1,3, 20,25, −1, NaN → null;
  0,1+0,15 (flotante) → 0,25. `stepMeasureQty`: 1 → 1,25 / 0,75; 0,25 −1 → 0,25; 20 +1 → 20; NaN → 1,25.
  `formatMeasureQty`: 0,25 "¼", 0,5 "½", 0,75 "¾", 1 "1", 1,25 "1¼", 1,5 "1½", 1,75 "1¾", 2 "2", 20 "20".
- **Plural:** taza→tazas, cda→cdas, cdita→cditas, vaso→vasos, café→cafés, unidad→unidades,
  "unidad mediana"→"unidades medianas", "taza de té"→"tazas de té", porción→porciones, nuez→nueces,
  filet→filetes, "lata escurrida"→"latas escurridas", "hamburguesa casera"→"hamburguesas caseras",
  "Taza"→"Tazas", ají→ajíes, "cc"→"cc".
- **Singular:** cucharadas→cucharada, unidades→unidad, cuadraditos→cuadradito, porciones→porción,
  nueces→nuez, cdas→cda, "unidades medianas"→"unidad mediana".
- **Validación:** "" → nameRequired; 41 caracteres → nameTooLong; grams null/0/−5/0,04/2000,1 →
  gramsRange; 0,05 → redondea a 0,1 y pasa; 2000 pasa; plural de 41 → pluralTooLong; varios a la vez →
  uno por campo. `normalizeMeasureInput`: "  unidad   mediana " → "unidad mediana"; plural igual al
  automático → null; 180,04 → 180.
- **Clave:** `measureNameKey("Taza") === measureNameKey("tazá") === measureNameKey(" taza ")`.
- **Números y textos:** `measureItemGrams(1.5, 180)` = 270; `(0.25, 0.1)` = 0,03; `(20, 2000)` = 40000.
  `measureKcal(130, 180)` = 234. `measureAmountText(0.5, taza)` "½ taza", `(1, …)` "1 taza", `(1.5, …)`
  "1½ tazas", `(2, unidad mediana)` "2 unidades medianas". `formatGrams(6.25)` "6,3 g".
  `measureWithGramsText` "1½ tazas (270 g)". `measureListLine` "1 taza = 180 g · 234 kcal".
  `measurePreview` con "unidad mediana" 120 g → two = "2 unidades medianas = 240 g"; con plural a mano
  usa el escrito; datos inválidos → null. Textos de `MEASURE_TEXT` iguales a 4.2 (snapshot de las claves
  con texto del Gherkin).
- **`parseUnitHint`, tabla con los 55 textos de la base** (los legibles con su resultado esperado y los
  dos ilegibles en null). Además: "1 taza ≈ 180 g"→{taza,180}; "1 vaso ≈ 200 ml"→{vaso,200};
  "1 cucharadita ≈ 5 ml"→{cucharadita,5}; "2 cucharadas ≈ 50 g"→{cucharada,25}; "3 cucharadas ≈ 30 g"→
  {cucharada,10}; "4 unidades ≈ 25 g"→{unidad,6.3}; "6 unidades ≈ 25 g"→{unidad,4.2};
  "2 cuadraditos ≈ 10 g"→{cuadradito,5}; "1/2 unidad ≈ 100 g"→{unidad,200}; "1/2 taza ≈ 125 g"→{taza,250};
  "1 lata escurrida ≈ 170 g"→{lata escurrida,170}; "1 hamburguesa casera ≈ 120 g"→{…,120};
  "1 taza = 180 gr."→{taza,180}; "1,5 tazas ≈ 270 g"→{taza,180}; "1 1/2 taza ≈ 270 g"→{taza,180};
  "1 lata ≈  lata 473 ml"→null; "usar con moderación"→null; ""/null→null; "0 taza ≈ 10 g"→null;
  "1 taza ≈ 3000 g"→null; nombre de 41 caracteres→null.

### 11.2 `packages/db`: prisma mockeado (patrón de `weeklyMenu.test.ts`)

- `foodMeasures.test.ts`: `createFoodMeasure` valida (sin llamar a la base si hay issues), normaliza,
  `order` = máx + 1 (0 si no hay), duplicado por `nameKey` → `DuplicateFoodMeasureError` con el nombre
  existente, P2002 → mismo error, alimento inexistente → not found. `updateFoodMeasure` se excluye a sí
  misma. `moveFoodMeasure` intercambia y en el borde no escribe. `deleteFoodMeasure` no toca ítems.
  `listMeasuresForPicker` filtra `food: { source: "SARA2", active: true }` y agrupa en orden.
  `resolveMeasureItem`: medida de otro alimento → not found; qty 1,3 → RangeError; ok → 5 campos con
  plural resuelto y gramos.
- `weeklyMenu.test.ts`: `copyDay`, `repeatMealInAllDays` y `setMealMode` copian los cuatro campos;
  `restoreMealSnapshots` acepta una foto con medida válida y rechaza: 3 de 4 campos, medida sin
  `foodId`, medida con `recipeId`, qty 1,3 y `quantityGrams` que no coincide. (1b) `setMeasureItemQuantity`:
  usa los gramos del ítem, ítem sin medida o de otro dueño → `MealOwnershipError`.
- `planTemplates.test.ts`: `applyTemplateToPatient` copia los cuatro campos.
- `foods.test`/caso nuevo (1b): `updateOwnFood` sin `unitHint` no manda la clave.
- `unitHintConversion.test.ts` (1b): seco no escribe; apply crea solo los que faltan; "ya tenía" por
  `nameKey`; ilegible reportado; `foodIds` limita.

### 11.3 `apps/web` (vitest con mocks)

- `meal-view.test.ts`: ítem con medida → `measure` con números; ítem sin medida → `measure: null`;
  macros iguales a los de un ítem en gramos con el mismo `quantityGrams`.
- `plan-pdf.test.tsx`: "1½ tazas (270 g)" para el ítem con medida y "120 g" para el de gramos.
- `weekly-menu-actions.test.ts`: casos de 10-E3.
- `food-measure-actions.test.ts`: sin sesión → `sessionExpired`; `fieldErrors` por campo; duplicado →
  mensaje con el nombre; not found; error genérico; revalida `/alimentos/{foodId}`; (1b) qty inválida
  rechazada por zod y `revalidateMenuOwner` llamado.
- `measure-form.test.ts`: sin `measureId` → null; con `measureId` y sin `foodId` → "invalid"; "1,5" → 1,5;
  "1,3" → "invalid".
- `food-policy.test.ts`: mocks nuevos; alta con medida; un PROPIO con medida sigue rechazado.
- Componentes (Testing Library, patrón de `portion-stepper.test.tsx` y `picker-card-footer.test.tsx`):
  `add-food-form.test.tsx` (alimento con medidas → "Medida casera" elegida, primera medida, "= 180 g",
  "+" → "= 225 g", hidden `measureId`/`measureQty` y sin `quantityGrams`; "Gramos" → vuelve el input de
  gramos; alimento sin medidas → sin selector y con el botón; sin alimento → sin selector);
  `measure-form-dialog.test.tsx` (chip escribe el nombre; vista previa "2 unidades medianas"; errores del
  Gherkin); `measure-meal-item.test.tsx` (muestra "1½ tazas" y "270 g"; 1b: "+" pasa a "2 tazas · 360 g").

### 11.4 Flujo contra la base: `packages/db/scripts/test-food-measures.ts`

Patrón de `test-recipe-picker.ts`. Sin WhatsApp, sin `OutboundMessage`, sin IA. **No toca ningún
alimento existente**: crea los suyos.

Datos propios: un `Food` PROPIO inactivo "Prueba HU-018d arroz" (kcal 130, macros cualquiera,
`unitHint` "1 taza ≈ 180 g"), otro "Prueba HU-018d ilegible" (`unitHint` "porción chica"), un paciente
"Prueba HU-018d" con teléfono ficticio `5490000018004`, un plan con `createPlan` y una plantilla con
`createTemplate`. Ids anotados en un array.

Pasos (cada uno con `assert`):
1. `createFoodMeasure(arroz, {taza, 180})` → order 0. `createFoodMeasure(arroz, {"Tazá", 160})` →
   `DuplicateFoodMeasureError("taza")`. `createFoodMeasure(arroz, {cda, 15})` → order 1.
2. `moveFoodMeasure(cda, "up")` → `listFoodMeasures` = [cda, taza]; volver a subir taza.
3. `resolveMeasureItem(arroz, taza, 1.5)` → 270 g, plural "tazas". Con `measureId` de cda y otro
   `foodId` → not found.
4. `addMealItem` en el Almuerzo PER_DAY del plan, MON, con esos campos → `getPlan` trae el ítem con los
   cuatro campos y `quantityGrams` 270.
5. `copyDay("plan", plan, {from: MON, to: [THU]})` → el jueves tiene el ítem con la medida;
   `restoreMealSnapshots` con la foto devuelta lo saca.
6. `repeatMealInAllDays` desde MON → 7 ítems con medida; restaurar.
7. Plantilla: `addTemplateMealItem` con medida en una comida EVERY_DAY → `applyTemplateToPatient` → el
   plan nuevo (id anotado) tiene la medida.
8. `updateFoodMeasure(taza, {taza, 160})` → el ítem del paso 4 sigue en 270 g / 180 por taza.
9. `deleteFoodMeasure(taza)` → el ítem sigue igual.
10. (1b) `setMeasureItemQuantity` del ítem a 2 → `quantityGrams` 360 (con los 180 copiados, no 160).
    Ítem de otro plan → `MealOwnershipError`.
11. (1b) `convertUnitHints({ apply: false, foodIds: [arroz, ilegible] })` → arroz `WOULD_CREATE
    {taza,180}` (después del paso 9 ya no tiene "taza"; le queda "cda"); ilegible `UNREADABLE`. Sin
    escrituras (conteo de `FoodMeasure` igual).
12. (1b) `convertUnitHints({ apply: true, foodIds: [arroz, ilegible] })` → 1 `CREATED`; segunda vez →
    `ALREADY_HAD`. Idempotente.

Limpieza en `finally`, **solo por id** y en este orden: los planes creados (cascada a comidas e
ítems), la plantilla, el paciente y los dos alimentos (cascada a sus `FoodMeasure`). Imprime los
conteos de control (`Food`, `FoodMeasure`, `PlanMealItem`, `TemplateMealItem`, `NutritionPlan`,
`Patient`) antes y después: tienen que dar iguales. Script npm:
`"test:food-measures": "dotenv -e ../../.env -- tsx scripts/test-food-measures.ts"`.

---

## 12. Verificación (el implementer la corre antes de declararse `done`)

### 12.1 Comandos (desde la raíz)

```bash
npm run db:generate
npm run typecheck                                    # core, db, web y bot: todos en verde
npm run test                                         # vitest de todo el monorepo
npm run lint --workspace apps/web                    # sin warnings nuevos
cd packages/db && npx dotenv -e ../../.env -- prisma migrate status && cd -   # "up to date" con food_measures
npm run test:food-measures --workspace packages/db   # OK, dos veces seguidas
npm run test:recipe-picker --workspace packages/db   # el de 018c sigue OK
npm run test:recipes --workspace packages/db         # el de 018a sigue OK
cd packages/db && npx dotenv -e ../../.env -- tsx scripts/test-weekly-menu.ts && cd -   # el de 018b sigue OK
npm run measures:convert-hints --workspace packages/db   # (1b) EN SECO: reporte, sin escribir
./ops/harness/verify.sh
```

**Builds (webpack y Turbopack).** Si el usuario tiene `npm run dev` corriendo, el build **no** se hace
en `apps/web/.next` (pisaría el servidor de desarrollo): se hace en una copia, como en 018a-2/018c.

```bash
SCR=<scratchpad>/build-018d && rm -rf "$SCR" && mkdir -p "$SCR"
rsync -a --exclude node_modules --exclude .next --exclude .git ./ "$SCR/"
cp -c -R node_modules "$SCR/node_modules"                 # clon APFS: Turbopack rechaza symlinks fuera de la raíz
cp -c -R apps/web/node_modules "$SCR/apps/web/node_modules" 2>/dev/null || true
cp .env "$SCR/.env"
cd "$SCR" && npm run build --workspace apps/web                       # next build (webpack)
cd "$SCR/apps/web" && npx next build --turbopack                      # Turbopack: "Compiled successfully", exit 0
cd - && rm -rf "$SCR"
```

Las dos tienen que compilar `/alimentos/[id]`, `/pacientes/[id]/planes/[planId]`, `/plantillas/[id]`
y `/portal/plan` sin "Only async functions are allowed to be exported in a "use server" file".

**Conteos de control** (solo lectura, antes y después de los scripts):

```bash
docker compose exec -T db psql -U nutri -d nutribot -c 'select
 (select count(*) from "Food") foods, (select count(*) from "FoodMeasure") measures,
 (select count(*) from "PlanMealItem") items, (select count(*) from "TemplateMealItem") tpl_items,
 (select count(*) from "NutritionPlan") plans, (select count(*) from "Patient") patients,
 (select count(*) from "PlanMealItem" where "measureName" is not null) measure_items;'
# Al 2026-10-04 en la base de Joel: 980 | (0 tras migrar) | 132 | 0 | 11 | <n> | 0. Iguales al terminar.
```

### 12.2 Recorrido en Chrome (para el orquestador)

Con `npm run dev` (Turbopack, panel en :3000) y logueado. Sin bot ni WhatsApp. Los datos que crea el
recorrido (medidas, ítems, un plan de prueba) se anotan por id en el scratchpad y se borran por id al
final. **No** se cargan medidas en alimentos SARA 2 que el usuario ya use sin avisarle: se usa
"Quinoa, cocida" o el que el orquestador acuerde, y la medida se borra al final.

1a:
1. `/alimentos/<id SARA 2>`: la tarjeta "Medidas caseras" está arriba de Energía, con la nota de SARA 2. Vacía: "Todavía no tiene medidas caseras."
2. "Agregar medida": tocar el chip "taza", escribir 180 → vista previa "1 taza de … = 180 g · N kcal" / "2 tazas = 360 g". Guardar → toast "Medida guardada" y la fila "1 taza = 180 g · N kcal". La composición no cambió.
3. Errores: nombre vacío, 0 g, 2001 g, "Taza" repetida → los textos del Gherkin, sin guardar.
4. "unidad mediana" → vista previa "2 unidades medianas". "¿Se escribe distinto en plural?" abre el campo.
5. Segunda medida, flechas, Editar y Quitar (con la confirmación del Gherkin).
6. Plan semanal de prueba, "Almuerzo · Martes": elegir el alimento → "Medida casera" elegida, "taza", 1, "= 180 g". Subir a 1½ → "= 270 g". "Agregar al martes" → "… — 1½ tazas" con "270 g" en gris; la franja se actualiza.
7. "Gramos" → carga en gramos como siempre; el ítem sale sin medida.
8. Alimento sin medidas → sin selector, botón "Agregar una medida casera a este alimento" → cuadro → Guardar → toast "Medida guardada en …" y queda en "Medida casera".
9. Descripción libre sin alimento → sin selector.
10. "Copiar este día a…" jueves y "Repetir en todos los días" → la medida se conserva; "Deshacer" funciona.
11. Plantilla con un ítem en medida → aplicarla a un paciente de prueba → el plan dice "1 cda · 10 g".
12. Portal (`createPatientToken` + `/portal/login?token=…`, sin WhatsApp): "1½ tazas" y debajo "270 g". PDF: "1½ tazas (270 g)". Cambiar la medida en la ficha → el plan no cambia.

1b:
13. Stepper del ítem: "+" → "2 tazas · 360 g" sin recargar; la franja se recalcula al volver la revalidación.
14. Error simulado del stepper (por ejemplo, cortar la red en DevTools) → vuelve a "1½ tazas" y toast "No se pudo cambiar la cantidad. Probá de nuevo."
15. Ficha de un PROPIO con `unitHint` ilegible (por URL directa): "Tenías anotado: «…»" + "Pasar a medida" → cuadro con el nombre prellenado.
16. Formulario de un PROPIO: no tiene "Unidad de referencia"; guardar no borra el `unitHint` (psql, solo lectura).
17. Ítems anteriores a la HU (en gramos) se ven y calculan igual.

---

## 13. Desvíos y dudas técnicas (cada una con recomendación; ninguna bloquea)

**T1. Los `unitHint` están todos en alimentos PROPIO, que ya no se pueden usar en planes.** Desde
`22046a3`, los PROPIO son históricos (ver la verificación de arriba). La HU (escrita sobre HU-005)
supone que los propios siguen activos: el escenario "Agregar una medida a un alimento propio" y toda
la D9 pesan mucho menos de lo que parece. **Recomendación:** implementar igual, pero barato. La
tarjeta es la misma para cualquier alimento, el script corre una vez y el aviso es un `Alert`. No se
agrega navegación a los PROPIO ni se reactiva nada. El orquestador debería avisarle al usuario que, en
la práctica, las medidas útiles son las que ella cargue en SARA 2, y que la conversión de `unitHint`
afecta solo a los 79 alimentos de demo. Por ese mismo peso bajo va en 1b.

**T2. Conversión de `unitHint`: script idempotente o SQL en la migración.** **Recomendación: script.**
(a) La lectura (fracciones, N ≠ 1, singular, ml) vive en `parseUnitHint`, con tests sobre los 55 textos
reales. En SQL habría que duplicarla con regex de Postgres, sin tests. (b) Tiene modo seco con reporte
antes de escribir. (c) La migración queda solo estructural y diff-friendly para Prisma. (d) Es
re-ejecutable si después aparecen más alimentos. El costo es un paso manual opcional en producción
(3.5), que se documenta.

**T3. `unitHint` con N ≠ 1 ("4 unidades ≈ 25 g", "1/2 taza ≈ 125 g").** Son 8 de 79. **Recomendación:**
convertir dividiendo (6,3 g por unidad; 250 g por taza) y singularizando el nombre. La alternativa
conservadora (tratarlos como ilegibles) los deja como aviso para que ella los pase a mano.

**T4. Nombre de la medida: tal como lo escribió o normalizado a abreviaturas.** Los `unitHint` dicen
"cucharada" y las sugerencias "cda". **Recomendación:** tal como está escrito (no se reescribe lo que
ella anotó). La unicidad ignora mayúsculas y tildes, pero "cucharada" y "cda" son dos medidas distintas.

**T5. Cuándo se ve "Tenías anotado: «…»".** La columna `unitHint` queda, así que hace falta una regla
para que el aviso no quede para siempre. **Recomendación:** solo si el alimento no tiene ninguna
medida. Si el `unitHint` era legible y se corrió el script, ya tiene medida y no aparece. Si no, aparece
hasta que ella cargue la primera. No hace falta columna nueva ni borrar el `unitHint`.

**T6. Cómo llegan las medidas al editor.** **Recomendación:** `listMeasuresForPicker()` en la página
(solo SARA 2 activos con medidas: hoy 0 filas; en uso real, decenas o cientos de filas chicas), pasado
una vez por el contexto del catálogo. La alternativa, una action al elegir cada alimento, suma una
espera justo en el momento en que ella está cargando.

**T7. ¿FK del ítem a `FoodMeasure`?** **Recomendación: no.** D4 pide que cambiar o borrar la medida no
toque el plan. Con una FK `SetNull` la copia quedaría igual, pero suma una columna y una relación que
nadie lee. Si algún día hace falta "¿qué planes usan esta medida?", se busca por `foodId` + `measureName`.

**T8. ¿`CHECK` en la base para M1/M2?** **Recomendación: no.** Prisma 5 no modela los `CHECK` (quedarían
solo en el SQL y confundirían los diffs futuros), y 018c ya estableció que las invariantes del ítem las
asegura el dominio y el zod de la foto.

**T9. Redondeos.** `FoodMeasure.grams` y `measureGrams` a 1 decimal; `quantityGrams` a 2
(`measureItemGrams`); per-unit de `unitHint` dividido, a 1 decimal (6,25 → 6,3). **Recomendación:**
aceptarlos. El error máximo es ±0,05 g por medida, irrelevante para los macros.

**T10. Plural guardado en el ítem.** **Recomendación:** guardar el plural **resuelto** al agregar (el escrito
a mano o el automático). Así, si después se mejora `pluralizeMeasureName`, los planes armados no cambian
de texto (mismo espíritu que D4).

**T11. Stepper: generalizar `PortionStepper` o duplicarlo.** **Recomendación:** extraer `StepperControl`
y dejar `PortionStepper` como wrapper con el mismo DOM (su test no cambia). Duplicar dejaría dos
botoneras que la HU-017e tendría que rediseñar por separado.

**T12. Mover el formulario "Agregar alimento" fuera de `meals-editor.tsx` (zona de Leo).** **Recomendación:**
moverlo a `food-measures/add-food-form.tsx`. Suma bastante estado (modo, medida, cantidad, cuadro),
`meals-editor.tsx` ya tiene casi 500 líneas y un archivo aparte deja el diff de Leo en "se movió + una
rama del `map`". Avisarlo en el PR.

**T13. Ítems de plantilla.** La HU dice "planes y plantillas". **Recomendación:** mismas columnas en
`TemplateMealItem` (ya incluido en 3.1). El mismo editor y el stepper valen para las dos.

**T14. Rama encadenada sobre PR no mergeados.** **Recomendación:** implementar ahora (la rama ya tiene 018c),
pero crear la migración recién después de P1. Abrir los PR de 018d solo cuando #26/#27 estén en
`develop`, con rebase. Si mientras tanto entra otra migración en `develop`, se borra la carpeta de
`food_measures` (todavía no está en `develop`), se hace rebase y se vuelve a generar (regla de
`AGENTS.md`).

**T15. Tamaño de la entrega.** Es comparable a 018c-1 (core + migración + dominio + 5 actions + 6
componentes + portal + PDF + 2 scripts). **Recomendación:** dos PR (sección 9), con la migración entera
en 1a. 1b no toma el lock de schema.

**T16. Aplicar la conversión en la base de dev.** **Recomendación:** el implementer la corre solo en seco.
Aplicarla crea filas en 77 alimentos existentes del usuario: no borra ni modifica nada, pero son datos
de negocio. Que la aplique el orquestador después de mostrarle el reporte al usuario.

**T17. Cantidad máxima × gramos.** 20 × 2000 = 40 000 g en un ítem es absurdo pero válido. **Recomendación:**
no agregar un tope combinado. Los dos límites individuales vienen de la HU.

---

## 14. Para la HU-015 (PDF, Leo) y la HU-017e (rediseño de planes/alimentos)

- PDF: `ItemRows` sabe dibujar `item.measure` con `measureWithGramsText`. La HU-015 solo tiene que
  conservar esa rama (o usar la misma función de core) cuando rehaga el documento.
- Rediseño: `StepperControl` es el único stepper (porciones y medidas). La tarjeta "Medidas caseras" y el
  cuadro de medida usan primitivos de 017a; el diseño visual final es de la 017e.
- Nada de esto cambia los datos que esas HU leen: el ítem sigue teniendo `quantityGrams`.

---

## 15. Fuera de alcance (no implementar en 018d-1)

- **018d-2**: medidas en los ingredientes de receta, sugerencias en la revisión de la carga asistida y
  semilla de medidas (D2, D11).
- Crudo ↔ cocido, peso bruto/neto (D12, HU 018e si ella la pide).
- Tabla genérica de unidades; medidas por edad; rangos y tercios (van en la nota).
- Asistente IA del plan con medidas (sigue proponiendo gramos).
- Editar en el lugar los ítems en gramos, o cambiar la medida (taza → cda) de un ítem ya agregado:
  se quita y se vuelve a agregar.
- `portionHousehold` de las recetas (sigue siendo texto).
- Reactivar o crear alimentos PROPIO, o navegar a ellos desde `/alimentos` (T1).
- Borrar la columna `Food.unitHint` o sus valores (D9).
- Seed: `seed.ts` no crea medidas (no se corre sin pedido del usuario).

---

## Decisiones (2026-10-04, modo autónomo del orquestador)

- SDD aprobada. **T1–T17 aceptadas con su recomendación.**
- Corte: **018d-1a** (migración entera, ficha, alta en medida casera, copias, portal, PDF) → **018d-1b** (stepper,
  conversión de `unitHint`, sacar el campo del formulario). Rama encadenada sobre 018c-2 (T14): `develop` no tiene
  migraciones nuevas ni hay otra HU con schema activa (chequeado 2026-10-04).
- T16: la conversión de `unitHint` en la base de dev **solo en seco**; aplicarla queda como pendiente del usuario.
- Implementer: Opus; skills migracion-prisma, apple-design, ui-ux-pro-max. Reviewer: Opus.

## Agregados a 018d-1b (de la revisión de 018d-1a, progress/review_HU-018d.md)

- R2. `measurePlural` > 40 rompe "Deshacer": subir el tope del zod de la foto a 80 (y el del campo de plural) o
  acotar el plural automático a 40. Recomendado: tope 80 en el zod y en la columna si hace falta (sin migración si
  la columna es `text`).
- R3. El plural automático no pluraliza las conjunciones "y", "o", "e", "u" ("taza o vaso" → "tazas o vasos").
  Test incluido.
- R4. `addPlanMealItemAction` / `addTemplateMealItemAction`: capturar `FoodMeasureNotFoundError` y el `RangeError`
  de `resolveMeasureItem` y devolver un error amable ("Esa medida ya no existe. Elegí otra.") en vez del error
  boundary. Test incluido.
