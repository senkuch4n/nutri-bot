# SDD: HU-018b `menu-semanal` (plan y plantilla como menú semanal)

HU validada: `docs/hu-plan-recetas-buscador.md` (validada el 2026-10-03). Esta SDD cubre **solo la
parte 018b** ("Menú semanal" en el Gherkin, en "Datos" y en el §1 y §4 de "Diseño UX"). 018a
(recetario), 018c (buscador de recetas) y 018d (medidas caseras) quedan **fuera**, salvo lo que
018b deja preparado (sección 13).

Resoluciones que mandan en esta SDD:

| Duda | Cómo se aplica acá |
|---|---|
| D1 = (c) | El plan y la plantilla pasan a menú semanal: cada comida es `EVERY_DAY` ("Igual todos los días") o `PER_DAY` ("Cambia cada día"), con días fijos lunes a domingo |
| D7 | Objetivo = prescripción de la consulta que indicó el plan (`Consultation.planId`); si no hay, la más reciente del paciente; si no hay ninguna, sin objetivo. Mismo objetivo para los 7 días |
| D14 | "En objetivo" = dentro de ±5 % del objetivo (constante `TARGET_TOLERANCE = 0.05` en `packages/core`) |
| D17 | Las plantillas son semanales igual que los planes, sin objetivo |
| N1 = (a) | Una comida de opciones suma el **promedio** de sus opciones al día y muestra el rango ("Opciones: 70 a 180 kcal") |
| N2 = (a) | La implementa senkuch4n. Leo (imleticio) revisa el PR y su HU-015 se construye sobre este modelo |

Skills: `migracion-prisma` (sección 3) y el skill de proyecto `.claude/skills/apple-design/SKILL.md`
(sección 7: primitivos y tokens de la HU-017a).

Rama: `feat/hu-018-plan-recetas-buscador`, que ya tiene `develop` adentro (`45d3075`: HU-017a y
PR #7 de Leo).

> **Verificación del architect (2026-10-03, solo lectura).**
> - `git fetch`: `origin/develop` = `45d3075`, ancestro de `HEAD`. Ninguna rama remota abierta
>   toca `schema.prisma`, `planes/**`, `plantillas/**`, `meals-editor.tsx`, `meal-view.ts`,
>   `plan-pdf.tsx`, `portal/plan/**`, `nutritionPlans.ts`, `planTemplates.ts` ni
>   `plan-micronutrients.ts`.
> - Base de desarrollo (puerto 5433): 9 `NutritionPlan`, 34 `PlanMeal`, 113 `PlanMealItem`,
>   **3 planes con `pdfData`**, 0 plantillas. Última migración aplicada:
>   `20261003041739_professional_signature`, igual que la última carpeta de `migrations/`: sin drift
>   aparente.
> - **El bot no lee la estructura del plan**: `apps/bot/src/outbound-payload.ts` solo lee
>   `plan.pdfData`/`pdfFileName` para mandar el PDF ya generado. `packages/db/domain/botAi.ts` no
>   lee `NutritionPlan` (lo dice su JSDoc y se confirma con grep). `apps/web/src/lib/assistant-tools.ts`
>   (asistente del panel) solo lee `title` y cuenta planes. **Ninguno cambia.**
> - Los únicos que leen comidas e ítems: `planes/[planId]/{page,actions,ai-actions}.ts(x)`,
>   `plantillas/{actions.ts,[id]/page.tsx}`, `planes/actions.ts` (aplicar plantilla),
>   `portal/plan/{page,plan-view}.tsx`, `lib/{meal-view,plan-pdf}.ts(x)`,
>   `domain/{nutritionPlans,planTemplates,foods,consultations}.ts`, seeds y
>   `apps/web/src/lib/food-policy.test.ts` (de Leo, PR #7).
> - `food-policy.test.ts` busca el editor por la prop `ownerField` en el árbol que devuelven
>   `PlanPage` y `TemplatePage`, y espía `addMeal`/`addMealItem` en el flujo de IA. Esta SDD
>   conserva el nombre `MealsEditor`, sus props `ownerField` y `meals`, y el uso de
>   `addMeal`/`addMealItem` en `ai-actions.ts` para que ese test siga pasando con un solo mock nuevo
>   (`getPlanTarget`, ver 9.4).
> - `SegmentedControl` (`components/segmented-control.tsx`) es para 2–5 opciones y su tamaño máximo
>   es `h-10`. El selector de día tiene 8 opciones de 44 px. Por eso va un componente nuevo sobre el
>   primitivo `ToggleGroup` (ver 7.2).
> - `packages/db/tsconfig.json` incluye `domain/**` y `prisma/**`, pero de `scripts/` solo
>   `scripts/sara2/**` y `test-foods-sara2.ts`: los scripts nuevos corren con `tsx` y no entran en el
>   `typecheck`.

---

## 1. Resumen funcional

El plan de un paciente y las plantillas pasan de "una lista de comidas que se suman" a un **menú
semanal**. Cada comida tiene un modo: **"Igual todos los días"** (un solo contenido, que además puede
ser una lista de **opciones** "Elegí una", como las colaciones) o **"Cambia cada día"** (un contenido
para cada día, de lunes a domingo). El editor muestra pestañas Lun…Dom más una vista "Semana" de solo
lectura. Tiene "Copiar este día a…", "Repetir en todos los días", cambio de modo con "Deshacer", y
una franja fija con los totales **del día** contra el objetivo del paciente (la prescripción de
HU-004, ±5 %) más el promedio diario de la semana. Los planes y plantillas que ya existen quedan
"Igual todos los días", **sin mover ningún dato** y con los mismos totales. Los planes nuevos traen
Desayuno, Almuerzo, Merienda y Cena "Cambia cada día" y Colaciones "Igual todos los días" con
opciones. Aplicar una plantilla copia modos, días e ítems. El portal muestra el día de hoy con
pestañas, el PDF mínimo lista las comidas de todos los días y después cada comida por día, y el
asistente IA sigue cargando su propuesta como "Igual todos los días". Los micronutrientes usan el
promedio diario de la semana.

---

## 2. Workspaces afectados

| Workspace | ¿Se toca? | Qué |
|---|---|---|
| `packages/db` | **Sí** | `schema.prisma` (2 enums, 2 columnas en `PlanMeal`/`TemplateMeal`, 1 columna en `PlanMealItem`/`TemplateMealItem`), migración `weekly_menu`, `domain/weeklyMenu.ts` (nuevo), cambios en `domain/nutritionPlans.ts`, `domain/planTemplates.ts`, `domain/consultations.ts` (plan con comidas por defecto), `domain/index.ts`. Script de verificación de la migración y script de flujo |
| `packages/core` | **Sí** | `weekly-menu.ts` (nuevo, puro) + test; `plan-micronutrients.ts` (peso opcional por ítem) + test; `index.ts` |
| `apps/web` | **Sí** | Editor de planes y plantillas (zona de Leo), franja del día, vista Semana, diálogos, server actions nuevas, portal por día, PDF mínimo por día, IA, `meal-view.ts`, `design-tokens.ts` (colores por macro), `notify.ts` (toast con Deshacer) |
| `apps/bot` | **No** | Solo lee `pdfData`. Igual se corre su `typecheck` (contrato: cambia `schema.prisma`) |

### 2.1 Convivencia con Leo (zona de imleticio)

Archivos de su zona que se tocan, y hasta dónde:

| Archivo | Cambio |
|---|---|
| `components/meals-editor.tsx` | Se reescribe (pasa a ser cliente, con días y modos). **Se conservan** el nombre `MealsEditor`, el `export type { FoodOption }`, las props `ownerId`, `ownerField`, `meals`, `foods`, `addMealAction`, `deleteMealAction`, `addItemAction`, `deleteItemAction`, `showMacros`, y el formulario de "Agregar alimento" con `FoodPicker` tal cual (solo se le agrega el `<input type="hidden" name="weekday">`) |
| `components/food-picker.tsx`, `food-catalog.tsx`, `delete-meal-button.tsx`, `kcal-breakdown-popover.tsx` | **No se tocan** |
| `planes/[planId]/page.tsx` | Carga el objetivo y pasa los datos nuevos al editor. La franja nueva reemplaza al `MacroTotals` fijo |
| `planes/[planId]/actions.ts` | `addPlanMealItemAction` lee `weekday`. `buildAndSavePdf` pasa los datos nuevos al PDF. Nada más |
| `planes/[planId]/ai-actions.ts` | Precondición "plan sin ítems" en vez de "sin comidas", borra las comidas vacías por defecto antes de crear las de la IA, y crea con `mode: "EVERY_DAY"` (ver 5.3) |
| `planes/actions.ts` | **No cambia** (aplicar plantilla y crear plan llaman al dominio) |
| `plantillas/actions.ts` | `addTemplateMealItemAction` lee `weekday`. Nada más |
| `plantillas/[id]/page.tsx` | Igual que la página del plan, sin objetivo |
| `lib/meal-view.ts` | `toMealView` agrega `mode`, `isOptions` y `weekday`; `toMicronutrientItems` agrega el peso semanal |
| `lib/plan-pdf.tsx` | Versión mínima por día (7.8). **Provisional hasta la HU-015** |
| `portal/plan/{page,plan-view}.tsx` | Selector de día con hoy seleccionado (7.7) |
| `lib/food-policy.test.ts` | Solo se agrega `getPlanTarget: vi.fn().mockResolvedValue(null)` al mock de `@nutri-bot/db/domain`. No se cambia ninguna aserción |

Componentes nuevos (fuera de la zona de Leo, en `components/weekly-menu/`): selector de día, franja
del día, vista Semana, diálogos y menú de la comida. La lógica queda fuera de su código: va en
`packages/core/src/weekly-menu.ts` y en `packages/db/domain/weeklyMenu.ts`.

---

## 3. Esquema (Prisma) y migración (skill `migracion-prisma`)

### 3.1 Cambios en `packages/db/prisma/schema.prisma`

Al lado de `enum PlanStatus`:

```prisma
/// HU-018b: modo de una comida del plan o de la plantilla.
/// EVERY_DAY = "Igual todos los días" (ítems con weekday = null).
/// PER_DAY   = "Cambia cada día" (cada ítem tiene su weekday).
enum MealMode {
  EVERY_DAY
  PER_DAY
}

/// HU-018b: día de la semana de un ítem en una comida PER_DAY. Semana fija lunes a domingo.
enum Weekday {
  MON
  TUE
  WED
  THU
  FRI
  SAT
  SUN
}
```

En `PlanMeal` y en `TemplateMeal`, después de `order`:

```prisma
  /// HU-018b. Default EVERY_DAY: los planes previos a la HU quedan "Igual todos los días".
  mode      MealMode @default(EVERY_DAY)
  /// HU-018b: "Opciones (elige una)". Solo con mode = EVERY_DAY (lo garantiza el dominio).
  isOptions Boolean  @default(false)
```

En `PlanMealItem` y en `TemplateMealItem`, después de `order`:

```prisma
  /// HU-018b: null = todos los días (comida EVERY_DAY). En comidas PER_DAY, siempre con valor.
  /// `order` es el orden dentro de (mealId, weekday).
  weekday       Weekday?
```

No se cambian índices ni relaciones. No se renombra ni se borra nada.

**Invariantes** (las asegura `packages/db/domain/weeklyMenu.ts`, no la base):

1. Comida `EVERY_DAY` → todos sus ítems con `weekday = null`.
2. Comida `PER_DAY` → todos sus ítems con `weekday != null`, y `isOptions = false`.
3. `order` es correlativo dentro de cada `(mealId, weekday)`.

### 3.2 Migración

Nombre: **`weekly_menu`**. Desde `packages/db`:

```bash
npx dotenv -e ../../.env -- prisma migrate dev --create-only --name weekly_menu
```

El `migration.sql` generado tiene que ser **exactamente** esto (el orden de las sentencias puede
variar). Si aparece cualquier `DROP`, `ALTER COLUMN ... TYPE`, `RENAME` o un `NOT NULL` sin
`DEFAULT`, **parar y reportar `blocked`**:

```sql
-- CreateEnum
CREATE TYPE "MealMode" AS ENUM ('EVERY_DAY', 'PER_DAY');

-- CreateEnum
CREATE TYPE "Weekday" AS ENUM ('MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN');

-- AlterTable
ALTER TABLE "PlanMeal" ADD COLUMN     "isOptions" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "mode" "MealMode" NOT NULL DEFAULT 'EVERY_DAY';

-- AlterTable
ALTER TABLE "PlanMealItem" ADD COLUMN     "weekday" "Weekday";

-- AlterTable
ALTER TABLE "TemplateMeal" ADD COLUMN     "isOptions" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "mode" "MealMode" NOT NULL DEFAULT 'EVERY_DAY';

-- AlterTable
ALTER TABLE "TemplateMealItem" ADD COLUMN     "weekday" "Weekday";
```

**Backfill de las filas existentes, en el mismo SQL**: `ADD COLUMN ... NOT NULL DEFAULT` hace que
Postgres complete **todas las filas existentes** con el default en la misma sentencia. Todas las
comidas quedan `mode = 'EVERY_DAY'` y `isOptions = false`. La columna nueva de los ítems es nullable
y queda `NULL` ("todos los días"). **Ninguna fila se mueve ni se copia**: los ítems, gramos, notas,
`order` y `pdfData` quedan intactos. No hace falta ningún `UPDATE` extra. Funciona igual con
`prisma migrate deploy` en producción: es SQL aditivo y no depende de los datos.

Antes de aplicar, agregar arriba del SQL este comentario (no cambia el comportamiento):

```sql
-- HU-018b: aditiva. Las comidas existentes quedan EVERY_DAY / isOptions=false por el DEFAULT
-- (backfill de Postgres en el mismo ADD COLUMN). Los ítems existentes quedan weekday=NULL
-- ("todos los días"). No mueve ni borra datos.
```

### 3.3 Respaldo y orden de aplicación (dev)

1. `git fetch && git merge origin/develop` (traer `develop` antes de crear la migración: regla del
   equipo). Si `develop` trae otra migración, aplicarla primero con `npm run db:migrate`.
2. `npx dotenv -e ../../.env -- prisma migrate status` (desde `packages/db`): tiene que decir
   "Database schema is up to date". **Si hay drift, parar y reportar `blocked`** con la salida.
3. **Respaldo**, fuera del repo:
   ```bash
   mkdir -p ~/nutribot-backups
   docker compose exec -T db pg_dump -U nutri -d nutribot -Fc > ~/nutribot-backups/pre-hu018b-$(date +%Y%m%d-%H%M).dump
   ls -lh ~/nutribot-backups/   # el archivo tiene que pesar > 0
   ```
4. **Snapshot "antes"** de totales y datos (script de 10.3, modo `--snapshot`), **antes** de editar
   `schema.prisma`.
5. Editar `schema.prisma` → `--create-only` → revisar el SQL contra 3.2 → `npm run db:migrate` →
   `npm run db:generate`.
6. **Comparación "después"** (script de 10.3, modo `--compare`). Tiene que terminar en `OK`.

### 3.4 Prohibido (skill y `AGENTS.md`)

- `prisma migrate reset`, o aceptar el "reset" que ofrece `migrate dev` ante drift.
- `prisma db push`.
- `--shadow-database-url` con `DATABASE_URL`, o `prisma migrate diff --from-migrations` contra la
  base de desarrollo (incidente HU-007).
- Editar la migración una vez aplicada. Si hay que corregirla, se crea otra.
- Correr `npm run db:seed` / `seed:demo`.

---

## 4. Contrato compartido: `packages/core`

### 4.1 `packages/core/src/weekly-menu.ts` (nuevo, puro). Lo consumen web y `packages/db`

```ts
import type { Macros } from "./nutrition";

export const WEEKDAYS = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"] as const;
export type Weekday = (typeof WEEKDAYS)[number];          // mismos valores que el enum Prisma
export type MealMode = "EVERY_DAY" | "PER_DAY";           // mismos valores que el enum Prisma

/** Rótulos: { short: "Lun", long: "Lunes", lower: "lunes" } … { "Dom", "Domingo", "domingo" }. */
export const WEEKDAY_LABELS: Record<Weekday, { short: string; long: string; lower: string }>;

/** Tolerancia de "En objetivo" (D14): ±5 %. */
export const TARGET_TOLERANCE = 0.05;

/** Comidas de un plan nuevo (y de una plantilla nueva, ver 12-D4), en este orden. */
export const DEFAULT_WEEKLY_MEALS: ReadonlyArray<{ name: string; mode: MealMode; isOptions: boolean }>;
// = [ { "Desayuno", PER_DAY, false }, { "Almuerzo", PER_DAY, false }, { "Merienda", PER_DAY, false },
//     { "Cena", PER_DAY, false }, { "Colaciones", EVERY_DAY, true } ]

export interface WeeklyMenuItem { id: string; weekday: Weekday | null; macros: Macros | null }
export interface WeeklyMenuMeal { id: string; mode: MealMode; isOptions: boolean; items: WeeklyMenuItem[] }

/** true si alguna comida es PER_DAY. Si es false (planes migrados), la UI se ve como antes. */
export function isWeeklyMenu(meals: readonly Pick<WeeklyMenuMeal, "mode">[]): boolean;

/** Ítems de una comida que valen para `day`: EVERY_DAY → todos; PER_DAY → los de ese día. */
export function itemsForDay<T extends { weekday: Weekday | null }>(
  meal: { mode: MealMode; items: readonly T[] }, day: Weekday,
): T[];

/** Resumen de una comida de opciones: promedio y rango de las opciones **con macros**
 *  (las de texto libre no cuentan). null si ninguna opción tiene macros. */
export function summarizeOptions(options: readonly (Macros | null)[]): {
  average: Macros; minKcal: number; maxKcal: number; countedOptions: number;
} | null;

/** Total de una comida en un día. Sin opciones: sumMacros de sus ítems del día.
 *  Con opciones: el promedio (N1 = a) y el rango en `optionsRange`. */
export function mealTotalForDay(meal: WeeklyMenuMeal, day: Weekday): {
  macros: Macros;
  optionsRange: { minKcal: number; maxKcal: number } | null;
  itemCount: number;
};

/** Totales por día y promedio semanal (lo usan el editor, el portal, el PDF y el script de 10.3). */
export function computeWeeklyTotals(meals: readonly WeeklyMenuMeal[]): {
  isWeekly: boolean;
  days: Record<Weekday, { macros: Macros; loaded: boolean }>;
  loadedDays: Weekday[];
  /** Promedio de los días cargados. Si ningún día está cargado, null. */
  weeklyAverage: Macros | null;
};

/** Peso de cada ítem en el promedio diario de la semana (micronutrientes, 4.2). */
export function computeWeeklyItemWeights(meals: readonly WeeklyMenuMeal[]): Record<string, number>;

export type TargetStatus =
  | { kind: "ON_TARGET" }
  | { kind: "UNDER"; missing: number }
  | { kind: "OVER"; excess: number };

/** |value − target| ≤ target × tolerance → ON_TARGET. target ≤ 0 → null (sin estado). */
export function compareToTarget(value: number, target: number, tolerance?: number): TargetStatus | null;

/** "Faltan 560 kcal" · "Falta 1 g" · "En objetivo" · "Se pasa 12 g". kcal y g sin decimales, es-AR. */
export function formatTargetStatus(status: TargetStatus, unit: "kcal" | "g"): string;

export interface MacroTarget { kcal: number; protein: number; carbs: number; fat: number }

/** Estado resumido de un día para la vista Semana (ver reglas abajo). */
export function summarizeDayStatus(day: Macros, target: MacroTarget): string;

/** "lunes", "lunes y martes", "lunes, martes y miércoles" (para toasts y avisos). */
export function joinWeekdaysEs(days: readonly Weekday[], form?: "lower" | "long"): string;

/** Día de la semana de `instant` en `timeZone` (portal: "hoy" en la zona de la profesional). */
export function weekdayInTimeZone(instant: Date, timeZone: string): Weekday;
```

Reglas exactas (son las que se testean en 10.1):

- **Día cargado.** Si `isWeekly`: un día está cargado si alguna comida `PER_DAY` tiene al menos un
  ítem ese día. Si **no** es semanal (plan migrado): los 7 días están cargados si hay al menos un
  ítem en el plan, y ninguno si el plan está vacío.
- **Total del día.** `sumMacros` de una lista **plana**: los `macros` de cada ítem (no null) de las
  comidas sin opciones que valen ese día, más **un** elemento por cada comida de opciones (su
  `average`). Se arma plano a propósito: en un plan migrado el total del día es **la misma llamada**
  `sumMacros(todos los ítems)` que hacen hoy `page.tsx`, el portal y el PDF, así que da el mismo
  número, redondeo incluido.
- **Promedio semanal.** Para cada campo, `round1(Σ días cargados / n)`. Con `n = 0` → `null`.
- **Opciones.** `average` = promedio campo a campo de las opciones con macros, redondeado a 0,1.
  `minKcal`/`maxKcal` = mínimo y máximo de kcal entre esas opciones.
- **Pesos (micronutrientes).** Con `n` = días cargados (si `n = 0` y hay ítems `EVERY_DAY`, se usa
  `n = 1`): ítem de comida `EVERY_DAY` sin opciones → `1`; ítem de comida de opciones → `1 / k`
  si tiene macros (`k` = opciones con macros), `0` si no; ítem de comida `PER_DAY` → `1 / n`.
  En un plan migrado todos los pesos son `1`, así que los micronutrientes no cambian.
- **`summarizeDayStatus`** (vista Semana, una sola frase por día): si algún valor (kcal, P, C, G) está
  `OVER`, gana el de mayor exceso relativo: `"Se pasa 120 kcal"` o `"Se pasa 15 g G"` (letras P, C,
  G). Si no, y las kcal están `UNDER`: `"Faltan 300 kcal"`. Si no, y algún macro está `UNDER`, el de
  mayor faltante relativo: `"Faltan 20 g P"`. Si no: `"En objetivo"`.
- **`formatTargetStatus`**: `UNDER` → `"Faltan {n} {u}"`, o `"Falta 1 {u}"` si el valor redondeado
  es 1. `OVER` → `"Se pasa {n} {u}"`. `ON_TARGET` → `"En objetivo"`. Números con separador de
  miles es-AR (`1.240`), sin decimales.
- **`weekdayInTimeZone`**: usa `weekdayInTz` de `time.ts` (0 = domingo) y lo mapea.

### 4.2 `packages/core/src/plan-micronutrients.ts` (cambio compatible)

```ts
export interface MicronutrientPlanItem {
  quantityGrams: number | null;
  food: { nutrients: unknown; sodiumMgPer100: number | null } | null;
  /** HU-018b: peso del ítem en el promedio diario de la semana. Default 1. 0 = no aporta. */
  weight?: number;
}
```

En el bucle: `amount += value * grams / 100 * (item.weight ?? 1)`. `coverage` sigue contando ítems
distintos (un ítem con peso 0 que tiene datos cuenta como conocido). La firma de
`computePlanMicronutrients` no cambia. Sin `weight`, el resultado es idéntico al de hoy (test).

### 4.3 `packages/core/src/index.ts`

Agregar `export * from "./weekly-menu";`.

---

## 5. Contrato compartido: `packages/db/domain`

Todo lo de esta sección lo consume **solo web** (el bot no lee planes). Va en `domain` porque son
operaciones sobre la base compartidas por planes **y** plantillas, y por la regla del repo.

### 5.1 `packages/db/domain/weeklyMenu.ts` (nuevo)

Operaciones de menú semanal **parametrizadas por dueño**, para no duplicar plan y plantilla. Por
dentro, un helper privado `delegates(kind, tx)` devuelve `{ meal: tx.planMeal | tx.templateMeal,
item: tx.planMealItem | tx.templateMealItem, ownerKey: "planId" | "templateId" }` (con un cast a una
interfaz mínima común). Todas las escrituras van en **`prisma.$transaction`**.

```ts
import type { MealMode, Weekday } from "../index";   // tipos generados por Prisma

export type MealOwnerKind = "plan" | "template";

/** Un ítem tal como se copia o se restaura. 018c le agrega recipeId y portions (sección 13). */
export interface MenuItemData {
  foodId: string | null;
  customLabel: string | null;
  quantityGrams: number | null;
  notes: string | null;
  order: number;
  weekday: Weekday | null;
}

/** Foto completa de una comida (todos sus días) para "Deshacer". */
export interface MealSnapshot { mealId: string; mode: MealMode; isOptions: boolean; items: MenuItemData[] }

export class MealOwnershipError extends Error {}      // la comida no es de ese plan/plantilla
export class MealWeekdayMismatchError extends Error {} // weekday no coincide con el modo de la comida
export class MealModeError extends Error {}           // p. ej. isOptions en una comida PER_DAY

/** Crea DEFAULT_WEEKLY_MEALS (core) para un dueño recién creado, dentro de la transacción dada. */
export function createDefaultWeeklyMeals(
  tx: Prisma.TransactionClient, kind: MealOwnerKind, ownerId: string,
): Promise<void>;

/** Cambia el modo. Devuelve la foto ANTERIOR de la comida (para Deshacer).
 *  EVERY_DAY → PER_DAY: cada ítem (weekday null) se copia a los 7 días (MON..SUN, mismo order) y
 *    se borra el original; isOptions pasa a false.
 *  PER_DAY → EVERY_DAY: se conservan los ítems de `keepWeekday` (default "MON") con weekday = null
 *    y se borran los de los otros días.
 *  Mismo modo → no hace nada (devuelve la foto igual). */
export function setMealMode(
  kind: MealOwnerKind, ownerId: string, mealId: string,
  params: { mode: MealMode; keepWeekday?: Weekday },
): Promise<MealSnapshot>;

/** Prende/apaga "Opciones (elige una)". Si la comida es PER_DAY y isOptions = true → MealModeError. */
export function setMealOptions(
  kind: MealOwnerKind, ownerId: string, mealId: string, isOptions: boolean,
): Promise<void>;

/** "Copiar este día a…": en cada comida PER_DAY del dueño, borra los ítems de los días `to` y copia
 *  los de `from` a cada uno (mismo order). Las comidas EVERY_DAY no se tocan. `to` sin `from`, sin
 *  repetidos, 1..6 días. Devuelve las fotos ANTERIORES de las comidas PER_DAY. */
export function copyDay(
  kind: MealOwnerKind, ownerId: string, params: { from: Weekday; to: Weekday[] },
): Promise<MealSnapshot[]>;

/** "Repetir en todos los días": copia los ítems de `from` de UNA comida PER_DAY a los otros 6 días
 *  (reemplaza). La comida sigue PER_DAY. Devuelve la foto ANTERIOR. */
export function repeatMealInAllDays(
  kind: MealOwnerKind, ownerId: string, mealId: string, from: Weekday,
): Promise<MealSnapshot>;

/** Deshacer: para cada foto, verifica que la comida sea del dueño, borra TODOS sus ítems, restaura
 *  mode/isOptions y recrea los ítems de la foto. Los foodId tienen que existir (cualquier fuente:
 *  la foto sale del propio plan y puede tener alimentos PROPIO históricos, ver 12-D6). */
export function restoreMealSnapshots(
  kind: MealOwnerKind, ownerId: string, snapshots: MealSnapshot[],
): Promise<void>;

/** Renombrar una comida (1..60 caracteres, trim). */
export function renameMeal(kind: MealOwnerKind, ownerId: string, mealId: string, name: string): Promise<void>;

/** Subir/bajar una comida: intercambia `order` con la vecina. En el borde no hace nada. */
export function moveMeal(
  kind: MealOwnerKind, ownerId: string, mealId: string, direction: "up" | "down",
): Promise<void>;

/** Siguiente `order` libre dentro de (mealId, weekday). */
export function nextItemOrder(kind: MealOwnerKind, mealId: string, weekday: Weekday | null): Promise<number>;

/** Valida weekday contra el modo de la comida. EVERY_DAY exige null; PER_DAY exige un día.
 *  Tira MealWeekdayMismatchError. La usan addMealItem y addTemplateMealItem. */
export function assertWeekdayMatchesMeal(
  kind: MealOwnerKind, mealId: string, weekday: Weekday | null,
): Promise<void>;
```

Copiar un ítem usa **un solo helper privado** `itemCopyData(item): Omit<MenuItemData, "weekday" |
"order">` que lista explícitamente `foodId, customLabel, quantityGrams, notes`. 018c agrega
`recipeId` y `portions` **solo ahí** (sección 13).

`ownerId` se valida en todas: la comida tiene que tener `planId`/`templateId = ownerId`. Si no,
`MealOwnershipError`.

### 5.2 `packages/db/domain/nutritionPlans.ts` (cambios)

```ts
// Antes: createPlan(patientId, data) creaba el plan vacío.
/** Crea el plan DRAFT con DEFAULT_WEEKLY_MEALS, en una transacción. */
export function createPlan(patientId: string, data: { title: string; notes?: string | null }): Promise<NutritionPlan>;

// Antes: addMeal(planId, { name, order })
/** `mode` por defecto: PER_DAY si el plan ya tiene alguna comida PER_DAY; si no, EVERY_DAY (12-D3). */
export function addMeal(
  planId: string,
  data: { name: string; order: number; mode?: MealMode; isOptions?: boolean },
): Promise<PlanMeal>;

// Antes: MealItemData sin weekday.
type MealItemData = {
  foodId?: string | null; customLabel?: string | null; quantityGrams?: number | null;
  notes?: string | null; order: number;
  weekday?: Weekday | null;   // HU-018b. Default null. Se valida con assertWeekdayMatchesMeal
};
export function addMealItem(mealId: string, data: MealItemData): Promise<PlanMealItem>;

// Nuevo. D7.
export interface PlanTarget {
  kcal: number;        // prescribedVctKcal
  protein: number;     // proteinG
  carbs: number;       // carbG
  fat: number;         // fatG
  consultationId: string;
  consultedAt: Date;
  /** PLAN_CONSULTATION = de una consulta que indicó este plan; LATEST = la más reciente del paciente. */
  source: "PLAN_CONSULTATION" | "LATEST";
}
/** Prescripción de referencia del plan (D7): entre las consultas con planId = plan.id que tengan
 *  prescripción, la de consultedAt más reciente (desempate createdAt desc). Si no hay, la
 *  prescripción más reciente del paciente (mismo orden que listLatestPrescriptions). Si no hay
 *  ninguna, null. */
export function getPlanTarget(planId: string): Promise<PlanTarget | null>;

// Nuevo. Para el aviso "Calculá el requerimiento…" cuando getPlanTarget da null.
/** La consulta más reciente con planId = plan.id, o null. */
export function getPlanConsultationId(planId: string): Promise<string | null>;
```

`getPlan` no cambia: el `include` actual ya trae los escalares nuevos (`mode`, `isOptions`,
`weekday`). Se sigue ordenando por `order`; el agrupado por día lo hace `core`.

`updateMeal`, `deleteMeal`, `updateMealItem`, `deleteMealItem`, `savePlanPdf`,
`enqueuePlanPdfMessage`, `listPatientPlans`, `updatePlan`, `deletePlan`: **sin cambios**.

### 5.3 `packages/db/domain/planTemplates.ts` (cambios)

- `createTemplate(data)`: crea la plantilla con `DEFAULT_WEEKLY_MEALS` en una transacción (12-D4).
- `addTemplateMeal(templateId, data)`: misma firma y default de `mode` que `addMeal`.
- `TemplateItemData` suma `weekday?: Weekday | null` y `addTemplateMealItem` valida con
  `assertWeekdayMatchesMeal("template", …)`.
- `applyTemplateToPatient(templateId, patientId)`: copia también `mode`, `isOptions` (comidas) y
  `weekday` (ítems). **No** crea las comidas por defecto: el plan nuevo es copia exacta de la
  plantilla. Firma sin cambios.

### 5.4 `packages/db/domain/consultations.ts` (cambio)

`createPlanForConsultation`: dentro de su transacción, después de crear el plan, llama a
`createDefaultWeeklyMeals(tx, "plan", plan.id)`. Firma y retorno sin cambios.

### 5.5 `packages/db/domain/index.ts`

Agregar `export * from "./weeklyMenu";`.

### 5.6 Qué **no** cambia en `domain` (y está verificado)

`foods.ts#getFoodUsage` (cuenta por `some`, no depende del modo), `botAi.ts` (no lee planes),
`outbox.ts`, `prescriptions.ts` (solo se leen sus datos desde `getPlanTarget`).

---

## 6. Rutas, server actions y API (apps/web)

No hay rutas nuevas. La página del plan y la de la plantilla leen `?dia=` (ver 7.2).

### 6.1 `apps/web/src/app/(panel)/weekly-menu-actions.ts` (nuevo, `"use server"`)

Un solo archivo para plan y plantilla (no se duplica en las dos carpetas de Leo). Cada action valida
con zod, llama a `domain`, revalida y devuelve un resultado para `useTransition` (no `FormData`).

```ts
export type MenuActionResult = { ok: true; undo?: MealSnapshot[] } | { ok: false; error: string };

export async function setMealModeAction(input: {
  kind: "plan" | "template"; ownerId: string; mealId: string; mode: "EVERY_DAY" | "PER_DAY"; keepWeekday?: Weekday;
}): Promise<MenuActionResult>;                 // undo = [foto anterior]
export async function setMealOptionsAction(input: {
  kind; ownerId; mealId; isOptions: boolean;
}): Promise<MenuActionResult>;                 // sin undo (se vuelve a tocar el mismo interruptor)
export async function copyDayAction(input: {
  kind; ownerId; from: Weekday; to: Weekday[];
}): Promise<MenuActionResult>;                 // undo = fotos anteriores
export async function repeatMealAction(input: {
  kind; ownerId; mealId: string; from: Weekday;
}): Promise<MenuActionResult>;                 // undo = [foto anterior]
export async function restoreMealsAction(input: {
  kind; ownerId; snapshots: MealSnapshot[];
}): Promise<MenuActionResult>;
export async function renameMealAction(input: { kind; ownerId; mealId; name: string }): Promise<MenuActionResult>;
export async function moveMealAction(input: { kind; ownerId; mealId; direction: "up" | "down" }): Promise<MenuActionResult>;
```

- Revalidación: `kind = "plan"` → `/pacientes/{patientId}` y `/pacientes/{patientId}/planes/{ownerId}`
  (el `patientId` sale de la base, como `revalidatePlanPaths`). `kind = "template"` →
  `/plantillas/{ownerId}`.
- Errores del dominio (`MealOwnershipError`, `MealModeError`, `MealWeekdayMismatchError`, zod) →
  `{ ok: false, error: "No se pudo guardar. Probá de nuevo." }` (los ve el toast de error).
- `restoreMealsAction`: zod estricto sobre `MealSnapshot[]` (máx. 20 comidas, 400 ítems,
  `quantityGrams` 0..99999, textos ≤ 4000).

### 6.2 Cambios en actions existentes (zona de Leo, mínimos)

- `planes/[planId]/actions.ts#addPlanMealItemAction` y `plantillas/actions.ts#addTemplateMealItemAction`:
  leer `weekday` del `FormData` (`""` → `null`; si no, tiene que estar en `WEEKDAYS` o se ignora el
  envío como hoy con datos inválidos). El `order` pasa a `nextItemOrder(kind, mealId, weekday)` en vez
  de `meal.items.length`. Pasar `weekday` a `addMealItem`/`addTemplateMealItem`. La validación
  SARA 2 **no cambia**.
- `planes/[planId]/actions.ts#buildAndSavePdf`: le pasa a `renderPlanPdf` los `meals` con los campos
  nuevos (los da `toMealView`). Sin otros cambios.

### 6.3 `planes/[planId]/ai-actions.ts` (asistente IA)

Requisito de la HU: "la propuesta se carga como comidas Igual todos los días (como funciona hoy)".
Con las comidas por defecto, un plan nuevo **ya no está vacío**, así que la precondición actual
(`plan.meals.length > 0` → error) bloquearía siempre a la IA. Cambios:

1. Precondición: `plan.meals.some((m) => m.items.length > 0)` → mismo error de hoy ("Este plan ya
   tiene comidas cargadas. Generá la propuesta en un plan vacío.").
2. **Después** de validar la respuesta de la IA y **antes** de crear nada: `deleteMeal(meal.id)` para
   cada comida (vacía) del plan.
3. `addMeal(planId, { name, order, mode: "EVERY_DAY" })` y `addMealItem(..., { ..., weekday: null })`.
   El prompt, el catálogo y las validaciones no cambian.

En `page.tsx`, la tarjeta "Armar con IA" se muestra si **ningún** ítem existe (no si no hay
comidas).

---

## 7. UI (Apple, HU-017a): pantallas concretas

Reglas para todo: tokens de `apps/web/src/lib/design-tokens.ts` y primitivos de
`components/primitives/*`; ningún color hex nuevo fuera de `design-tokens.ts`. Objetivos de toque de
44 px (`h-11` o `.touch-target`), `gap-2` mínimo, `tabular-nums` en todos los números, estados con
texto (no solo color), nada que dependa del hover, foco visible, `prefers-reduced-motion` respetado
(Motion con `springs` de `lib/motion`; con reduced motion, fundido o salto). **Una acción principal
visible por comida.** La UX es la de la HU (§1 y §4 de "Diseño UX"); esta sección solo dice con qué se
arma.

### 7.1 Componentes nuevos (`apps/web/src/components/weekly-menu/`)

| Archivo | Qué es | Primitivos |
|---|---|---|
| `day-selector.tsx` | "Semana" + Lun…Dom. Selección única, no se puede deseleccionar. Punto chico (`size-1.5 rounded-full bg-tertiary`, con `aria-label` "sin cargar" en el ítem) en los días sin cargar | `ToggleGroup type="single"` + `ToggleGroupItem`, `h-11 min-w-11`, encendido `data-[state=on]:bg-primary-soft data-[state=on]:text-primary font-semibold`. `role="tablist"` no: es un radiogroup como `SegmentedControl`. Escritorio: fila; celular: `grid grid-cols-8` a todo el ancho, texto `text-footnote` |
| `day-target-strip.tsx` | Franja del día (7.3) | `Quantity`, barra propia (`div` con `role="meter"`), `lucide-react` (`CheckCircle2`, `ArrowDown`, `ArrowUp`) |
| `weekly-overview.tsx` | Vista "Semana" (7.5) | `Table` de `primitives/table.tsx`; en el celular, lista por día |
| `meal-card-menu.tsx` | Menú "⋯" de cada comida (7.4) | `DropdownMenu` |
| `copy-day-dialog.tsx` | "Copiar este día a…" y "Copiar otro día acá" (7.6) | `Dialog`, `Checkbox`, `RadioGroup` |
| `meal-mode-dialog.tsx` | Pasar a "Igual todos los días": qué día conservar (7.4) | `Dialog`, `RadioGroup` |
| `rename-meal-dialog.tsx` | Renombrar | `Dialog`, `Input` |
| `use-menu-undo.ts` | Hook: llama a una action, y si devuelve `undo` muestra el toast con "Deshacer" | `notify.undo` (7.9) |

### 7.2 Editor (`components/meals-editor.tsx`, reescrito como `"use client"`)

Props: las de hoy **más**:

```ts
kind: "plan" | "template";          // para weekly-menu-actions (ownerField sigue y se deriva igual)
meals: MealView[];                  // MealView ahora con mode, isOptions e items con weekday (8.1)
target: PlanTargetView | null;      // null en plantillas o si no hay prescripción
targetMissingHref: string | null;   // solo planes sin objetivo: link de "Calculá el requerimiento…"
initialDay: Weekday | "WEEK";       // lo calcula la página (ver abajo)
```

`PlanTargetView = { kcal; protein; carbs; fat; sourceLabel: string }` con
`sourceLabel = "Objetivo: consulta del 12/09/2026"` (fecha con `formatDate(consultedAt, pro.timezone)`).

Comportamiento:

- **Día seleccionado**: estado del cliente, inicializado con `initialDay`, y reflejado en la URL con
  `history.replaceState` (`?dia=lun|mar|mie|jue|vie|sab|dom|semana`) para que una recarga o una
  revalidación conserven el día. Cambiar de día **no** navega: es instantáneo (todos los ítems ya
  están en `meals`). La página calcula `initialDay`: `?dia=` válido → ese; si no, plan sin ítems →
  `"WEEK"`; si no → `"MON"`.
- **Plan no semanal** (`isWeeklyMenu(meals) === false`, planes migrados): no hay selector ni vista
  Semana; se ve una sola lista de comidas como hoy, con la franja de totales (como el "día", que es
  igual todos los días; el rótulo dice "Total del día"). Las acciones de modo siguen en el "⋯"; al
  pasar una comida a "Cambia cada día" aparece el selector.
- **Pestaña de un día**: arriba la franja (7.3), después el botón secundario **"Copiar este día a…"**
  (solo si el plan es semanal), después las comidas en su `order`:
  - Comida `PER_DAY`: tarjeta titulada `"{nombre} · {Martes}"`, con sus ítems de ese día.
  - Comida `EVERY_DAY`: tarjeta titulada `"{nombre}"` con la marca **"Todos los días"** (pill
    `bg-secondary text-footnote`) y, si `isOptions`, **"Elegí una"**. Editarla cambia los 7 días
    (texto de ayuda chico debajo del título: "Los cambios valen para todos los días").
  - Total de la comida a la derecha del título: `"{kcal} kcal"`, o `"Opciones: 70 a 180 kcal"` si es
    de opciones (y debajo, chico: "Suma al día el promedio: 110 kcal").
  - Pie de la tarjeta: el formulario **"Agregar alimento"** de hoy (mismo `FoodPicker`, `NumberInput`,
    "Descripción libre", "Nota"), con `<input type="hidden" name="weekday">` = día seleccionado
    (`""` en comidas `EVERY_DAY`). El botón "Agregar receta" **no** va en 018b (es de 018c).
  - "⋯" (7.4) en el encabezado de la tarjeta, junto al "Borrar" actual pasa adentro del menú (el
    `DeleteMealButton` se monta como ítem del menú; se conserva su confirmación).
  - Día sin ninguna comida `PER_DAY` con ítems: aviso arriba de las comidas "El {jueves} todavía no
    tiene comidas." + botón **"Copiar otro día acá"** (7.6).
- **Vista Semana**: 7.5.
- **"Nueva comida"** al final, como hoy (el modo lo decide el dominio, 12-D3).
- Ítems: como hoy (nombre, nota, macros con el popover de Atwater, gramos, "Quitar").

### 7.3 Franja del día (`day-target-strip.tsx`)

Reemplaza al `MacroTotals` que hoy está fijo arriba (mismo contenedor `sticky top-14 … lg:top-0`, con
material translúcido `material-bar` de 017a). Título: el día ("Martes"), o "Total del día" en planes
no semanales, o "Promedio diario de la semana" en la vista Semana.

- **Con objetivo** (`target != null`): 4 celdas grandes — Energía, Proteínas, Carbohidratos, Grasas —
  cada una con: número grande (`text-metric-md`, `tabular-nums`) + `"de 1.800 kcal"`,
  una barra (`role="meter"`, `aria-valuenow/min/max`, `aria-valuetext="1.240 de 1.800 kcal, faltan 560"`)
  con una marca vertical en el 100 %, de color fijo por macro (7.10), y el estado con ícono + texto de
  `formatTargetStatus` ("Faltan 560 kcal" con `ArrowDown`, "En objetivo" con `CheckCircle2` en
  `text-success`, "Se pasa 12 g" con `ArrowUp` en `text-warning`). La barra se llena hasta 100 % y el
  exceso no se dibuja (el texto lo dice). Fibra como dato chico al final de la fila. Debajo, en
  `text-footnote text-muted-foreground`: `"{sourceLabel} · Promedio semanal: 1.690 kcal"` (el promedio
  solo si el plan es semanal y hay días cargados).
- **Sin objetivo, en un plan**: el `MacroTotals` de hoy (con `label` = "Total del martes") y debajo
  un aviso `info`: **"Calculá el requerimiento para ver cuánto falta."** con link "Ir a la consulta" a
  `targetMissingHref` (`/pacientes/{id}/consultas/{consultationId}` si el plan tiene consulta; si no,
  `/pacientes/{id}?tab=consultas`).
- **Plantillas**: `MacroTotals` del día + `"Promedio semanal: … kcal"`, sin aviso.
- El cambio de valor anima con un spring sin rebote (`springs` de `lib/motion`); con reduced motion,
  salta.

### 7.4 Menú "⋯" de la comida y cambio de modo

Ítems (en este orden, cada uno de 44 px de alto):

1. **"Repetir en todos los días"**: solo comidas `PER_DAY` en la pestaña de un día. Si alguno de los
   otros 6 días tiene ítems en esa comida, primero un `AlertDialog`: título "¿Repetir el desayuno del
   lunes?", texto **"Martes, miércoles y viernes ya tienen desayuno. Se van a reemplazar."**, botones
   "Repetir" y "Cancelar". Si ninguno tiene, sin diálogo. Toast: **"Desayuno del lunes repetido en
   todos los días · Deshacer"**.
2. **"Cambiar a Cambia cada día"** (si es `EVERY_DAY`): sin diálogo. Si tenía `isOptions`, el toast lo
   aclara. Toast: **"Desayuno ahora cambia cada día · Deshacer"**. Los 7 días quedan con los mismos
   ítems.
3. **"Cambiar a Igual todos los días"** (si es `PER_DAY`): `meal-mode-dialog`: título "¿Qué día
   conservar?", `RadioGroup` de los 7 días (por defecto el lunes; cada opción con el resumen "3
   ítems" o "vacío"), aviso **"Se van a borrar los desayunos de los otros días."**, botones "Cambiar"
   y "Cancelar". Toast: **"Desayuno ahora es igual todos los días · Deshacer"**.
4. **"Opciones (elige una)"**: `DropdownMenuCheckboxItem`, solo en `EVERY_DAY`. Sin toast con Deshacer
   (se vuelve a tocar).
5. **"Renombrar"** → `rename-meal-dialog`.
6. **"Subir"** / **"Bajar"** (deshabilitados en los bordes).
7. **"Borrar comida"**: el `DeleteMealButton` de hoy, con su confirmación.

Los nombres de comida en los textos van en minúscula cuando están en medio de la frase
("los desayunos", "ya tienen desayuno"): se usa `meal.name.toLocaleLowerCase("es-AR")`. El plural
"los desayunos" es `"los " + nombre en minúscula + "s"` solo si el nombre no termina en "s"; si
termina en "s" (Colaciones), se usa tal cual. Si queda raro con nombres libres, el texto genérico es
"Se van a borrar los ítems de los otros días."

### 7.5 Vista "Semana" (`weekly-overview.tsx`)

Solo lectura. Escritorio: tabla con una fila por comida y una columna por día (Lun…Dom). Cada celda:
los nombres cortos de los ítems de ese día separados por " · " (máx. 3, después "+2"), o "—". Las
comidas `EVERY_DAY` ocupan una fila con una sola celda que abarca los 7 días (`colSpan={7}`) con la
marca "Todos los días" ("Elegí una:" si es de opciones). Pie: una fila "Total" con las kcal de cada
día y debajo el estado de `summarizeDayStatus` (o solo kcal si no hay objetivo), y **"Sin cargar"**
en los días no cargados. Debajo de la tabla: **"Promedio diario de la semana"** con kcal, P, C y G
contra el objetivo (`formatTargetStatus` por valor). Tocar una celda (botón de 44 px de alto) lleva a
ese día y hace `scrollIntoView` de `#meal-{id}` (`behavior: "smooth"` salvo reduced motion).
Celular: una tarjeta por día con sus comidas en lista y su total/estado.

### 7.6 "Copiar este día a…" y "Copiar otro día acá" (`copy-day-dialog.tsx`)

- **Copiar este día a…**: título "Copiar el lunes a…". Los otros 6 días como casillas grandes (fila
  de 44 px, `Checkbox` + rótulo; toda la fila es clicable). Al lado de cada día con ítems en alguna
  comida `PER_DAY`: "Ya tiene comidas". Si alguno de los marcados tiene comidas, aviso arriba del botón:
  **"Martes y miércoles ya tienen comidas. Se van a reemplazar."** Botón primario **"Copiar"**
  (deshabilitado sin días marcados). Sin confirmación extra. Toast: **"Lunes copiado a martes y
  miércoles · Deshacer"**. Las comidas "Todos los días" no cambian (texto chico en el diálogo: "Las
  comidas de todos los días no cambian.").
- **Copiar otro día acá** (pestaña de un día vacío): título "Copiar al jueves", `RadioGroup` con los
  días **cargados**, botón "Copiar". Usa la misma action con `to = [jueves]`. Toast: **"Lunes copiado
  al jueves · Deshacer"**.

### 7.7 Portal (`(portal)/portal/plan/page.tsx` y `plan-view.tsx`)

- `page.tsx` calcula `today = weekdayInTimeZone(new Date(), pro.timezone)` (`getProfessional()`) y
  pasa `meals` (con los campos nuevos), `today` y los totales por día (`computeWeeklyTotals`).
- `PortalPlanView` (sigue server-safe) recibe `weekly: boolean`. Si **no** es semanal: igual que hoy
  (sin selector, `MacroTotals` "Total del plan"). Si es semanal: renderiza un componente cliente nuevo
  `portal-day-view.tsx` (en la misma carpeta) con el selector **Lun…Dom** (sin "Semana", hoy
  seleccionado; `DaySelector` con `includeWeek={false}`), `MacroTotals` con `label="Total del {lunes}"`
  y las comidas del día y las de "Todos los días" (con la marca), las de opciones con **"Elegí una"**
  arriba de la lista. El botón "Descargar PDF" no cambia.

### 7.8 PDF mínimo (`lib/plan-pdf.tsx`), provisional hasta la HU-015

`PlanPdfInput.meals` pasa a ser `MealView[]` con los campos nuevos (sin cambio de nombre).

- **Plan no semanal**: sale **igual que hoy** (mismo orden, misma tabla, "Total del plan"), salvo que
  una comida con `isOptions` lleva debajo del título la línea "Elegí una:" (un plan migrado no tiene
  ninguna, así que sale idéntico).
- **Plan semanal**:
  1. Primero las comidas `EVERY_DAY` en su `order`, título `"{nombre} · Todos los días"`, y "Elegí
     una:" si son de opciones. Ítems como hoy.
  2. Después cada comida `PER_DAY` en su `order`: título `"{nombre}"` y, por cada día **con** ítems,
     un subtítulo `"Lunes"` seguido de sus ítems (fila como hoy: nombre, nota, gramos). Los días sin
     ítems se omiten; una comida sin ítems en ningún día se omite.
  3. Recuadro de totales con el rótulo **"Promedio diario"** y `formatMacrosLine(weeklyAverage)`
     (si es null, se omite).
- Cada bloque de día lleva `wrap={false}` (no se corta un día entre páginas); la comida entera ya no
  lleva `wrap={false}` porque con 7 días no entra en una página.
- No se agregan logos, textos ni secciones nuevas: el diseño lo define la HU-015.

### 7.9 Toast con Deshacer (`apps/web/src/lib/notify.ts`)

Agregar:

```ts
undo: (message: string, onUndo: () => void | Promise<void>) => {
  toast(message, { duration: 8000, action: { label: "Deshacer", onClick: () => void onUndo() } });
},
```

`use-menu-undo.ts`: al tocar "Deshacer" llama a `restoreMealsAction` con las fotos y muestra
`notify.saved("Listo, se deshizo el cambio")` o `notify.error()`. El botón de acción del toast ya tiene
estilo (`toastClassNames.actionButton`); asegurar 44 px de alto con `touch-target`.

### 7.10 Colores por macro (`apps/web/src/lib/design-tokens.ts`)

Agregar a `chartPalette` (todos ≥ 3:1 sobre blanco, ya están en `series`):

```ts
macro: { kcal: "#0066CC", protein: "#248A3D", carbs: "#C93400", fat: "#8944AB" },
```

Y el tipo del `satisfies` suma `macro: Record<"kcal" | "protein" | "carbs" | "fat", string>`. Se usan
siempre los mismos en la barra de la franja (y 018c los reusa en las tarjetas). La barra lleva además
el texto del estado (no solo color).

---

## 8. Archivos y flujo

### 8.1 Tipos de la vista (`components/meals-editor.tsx` y `lib/meal-view.ts`)

```ts
export interface MealItemView {
  // … campos de hoy sin cambios (id, foodId, foodName, customLabel, quantityGrams, notes, macros, kcalBreakdown)
  weekday: Weekday | null;             // HU-018b
}
export interface MealView {
  id: string;
  name: string;
  mode: MealMode;                      // HU-018b
  isOptions: boolean;                  // HU-018b
  items: MealItemView[];
}
```

`MealView` es compatible con `WeeklyMenuMeal` de `core` (mismo `id`, `mode`, `isOptions`, `items[].id`,
`items[].weekday`, `items[].macros`): se le pasa directo a `computeWeeklyTotals`.
`toMealView(meals)` copia `mode`, `isOptions` y `weekday` (en `RawMeal`/`RawItem`, opcionales con
default `"EVERY_DAY"`/`false`/`null` para que los tests de hoy, que no los traen, sigan pasando).
`toMicronutrientItems(meals)` suma `weight` con `computeWeeklyItemWeights` cuando recibe `id`, `mode`,
`isOptions` y `weekday`; sin esos campos, `weight` queda `undefined` (= 1, como hoy).

### 8.2 Lista

Crear:

- `packages/core/src/weekly-menu.ts`, `packages/core/src/weekly-menu.test.ts`
- `packages/db/prisma/migrations/<timestamp>_weekly_menu/migration.sql` (generada)
- `packages/db/domain/weeklyMenu.ts`, `packages/db/domain/weeklyMenu.test.ts`
- `packages/db/scripts/test-weekly-menu-migration.ts` (10.3)
- `packages/db/scripts/test-weekly-menu.ts` (10.4)
- `apps/web/src/app/(panel)/weekly-menu-actions.ts`
- `apps/web/src/components/weekly-menu/{day-selector,day-target-strip,weekly-overview,meal-card-menu,copy-day-dialog,meal-mode-dialog,rename-meal-dialog}.tsx`, `use-menu-undo.ts`
- `apps/web/src/components/weekly-menu/day-target-strip.test.tsx`, `weekly-overview.test.tsx`
- `apps/web/src/app/(portal)/portal/plan/portal-day-view.tsx`
- `apps/web/src/lib/plan-pdf.test.tsx` (si no existe un test del PDF; 10.5)

Modificar:

- `packages/db/prisma/schema.prisma`
- `packages/db/domain/{nutritionPlans,planTemplates,consultations,index}.ts`
- `packages/core/src/{plan-micronutrients,plan-micronutrients.test,index}.ts`
- `apps/web/src/components/meals-editor.tsx`
- `apps/web/src/lib/{meal-view,meal-view.test,plan-pdf,notify,design-tokens}.ts(x)`
- `apps/web/src/lib/food-policy.test.ts` (un mock)
- `apps/web/src/app/(panel)/pacientes/[id]/planes/[planId]/{page,actions,ai-actions}.ts(x)`
- `apps/web/src/app/(panel)/plantillas/{actions.ts,[id]/page.tsx}`
- `apps/web/src/app/(portal)/portal/plan/{page,plan-view}.tsx`

**No** se tocan: `apps/bot/**`, `food-picker.tsx`, `food-catalog.tsx`, `delete-meal-button.tsx`,
`planes/actions.ts`, `segmented-control.tsx`, `macro-totals.tsx`, `primitives/*`,
`domain/{foods,botAi,prescriptions,outbox}.ts`, seeds.

---

## 9. Checklist atómico

### Corte recomendado en dos entregas (ver 12-D1)

La 018b completa es grande para una sola implementación (modelo + migración + dominio + editor
cliente nuevo + 6 diálogos + portal + PDF). Se propone **partirla en dos PR que se mergean solos**:

- **018b-1 "Modelo semanal"** (fases A–D): schema + migración + core + dominio + todo lo que **lee**
  planes ya entiende el modelo semanal (totales por día, portal por día, PDF por día, micronutrientes,
  aplicar plantilla, IA). **Sin cambios visibles** para los planes existentes, y todavía sin manera de
  crear comidas `PER_DAY` desde la UI (los defaults de plan nuevo **no** se prenden en 018b-1). Se
  mergea solo y es seguro.
  - **Leo puede empezar la HU-015 sobre el modelo** apenas se mergea 018b-1.
  - **Libera la regla de migraciones**: 018b-2 no toca `schema.prisma`, así que la 018a puede pasar a
    `implementando` mientras se hace 018b-2.
- **018b-2 "Editor semanal"** (fases E–G): editor por día, franja contra el objetivo, vista Semana,
  modos, opciones, copiar/repetir/deshacer, renombrar/mover, comidas por defecto en planes y
  plantillas nuevos, recorrido en Chrome. Sin migración.

Si el orquestador prefiere una sola entrega, se hacen las fases A–G seguidas en el mismo PR.

### Preparación (018b-1)

- [ ] `git fetch && git merge origin/develop` en `feat/hu-018-plan-recetas-buscador` (o la rama que
      defina el orquestador para 018b-1). `npm install` si cambió el lock.
- [ ] `npx dotenv -e ../../.env -- prisma migrate status` (en `packages/db`): sin drift. Si hay drift,
      **parar, `blocked`**.

### Fase A — `packages/core` (018b-1)

- [ ] A1. Crear `weekly-menu.ts` con todo lo de 4.1 (constantes, tipos, funciones).
- [ ] A2. Crear `weekly-menu.test.ts` con los casos de 10.1.
- [ ] A3. `plan-micronutrients.ts`: `weight?` (4.2) + casos nuevos en `plan-micronutrients.test.ts`.
- [ ] A4. `index.ts`: exportar `weekly-menu`.
- [ ] A5. `npm run test -- packages/core` y `npm run typecheck --workspace packages/core`.
- Commit: `HU-018b: lógica pura del menú semanal (totales por día, opciones, objetivo ±5 %)`

### Fase B — snapshot, schema y migración (018b-1)

- [ ] B1. Crear `packages/db/scripts/test-weekly-menu-migration.ts` (10.3). El modo `--snapshot`
      usa **solo `$queryRaw`** con columnas que ya existen, así corre antes y después del cambio de
      schema.
- [ ] B2. Respaldo `pg_dump` (3.3 paso 3). Verificar tamaño > 0.
- [ ] B3. `--snapshot ~/nutribot-backups/hu018b-snapshot.json` (fuera del repo).
- [ ] B4. Editar `schema.prisma` (3.1).
- [ ] B5. `--create-only --name weekly_menu`; comparar el SQL con 3.2; agregar el comentario.
      Cualquier diferencia destructiva → **parar, `blocked`**.
- [ ] B6. `npm run db:migrate` y `npm run db:generate`.
- [ ] B7. `--compare ~/nutribot-backups/hu018b-snapshot.json` → tiene que imprimir `OK`.
- Commit: `HU-018b: migración weekly_menu (modo por comida, opciones y día por ítem)`

### Fase C — `packages/db/domain` (018b-1)

- [ ] C1. Crear `weeklyMenu.ts` (5.1), con `itemCopyData` como único lugar que lista los campos.
- [ ] C2. `nutritionPlans.ts`: `addMeal` (mode por defecto), `addMealItem` (weekday +
      `assertWeekdayMatchesMeal`), `getPlanTarget`, `getPlanConsultationId`. **`createPlan` todavía
      sin comidas por defecto** (eso es 018b-2, fase E1).
- [ ] C3. `planTemplates.ts`: `addTemplateMeal`, `addTemplateMealItem` (weekday), `applyTemplateToPatient`
      copia `mode`, `isOptions`, `weekday`. **`createTemplate` todavía sin defaults** (E1).
- [ ] C4. `index.ts`: exportar `weeklyMenu`.
- [ ] C5. `weeklyMenu.test.ts` (10.2) con prisma mockeado.
- [ ] C6. `npm run typecheck` (todos los workspaces: **web y bot**).
- Commit: `HU-018b: operaciones de menú semanal en domain (copiar, repetir, modo, deshacer, objetivo)`

### Fase D — `apps/web`, lectura (018b-1)

- [ ] D1. `lib/meal-view.ts`: tipos y campos nuevos (8.1); `meal-view.test.ts` suma un caso semanal.
- [ ] D2. `planes/[planId]/actions.ts` y `plantillas/actions.ts`: `weekday` en "agregar ítem" (6.2).
- [ ] D3. `planes/[planId]/ai-actions.ts` (6.3) y la condición de "Armar con IA" en `page.tsx`.
- [ ] D4. Páginas de plan y plantilla: totales con `computeWeeklyTotals` (plan no semanal → mismo
      número que hoy) y micronutrientes con pesos. **Sin** editor nuevo todavía.
- [ ] D5. `lib/plan-pdf.tsx` (7.8) + `plan-pdf.test.tsx` (10.5).
- [ ] D6. Portal (7.7) + `DaySelector` (7.1, se crea acá porque lo usa el portal).
- [ ] D7. `food-policy.test.ts`: agregar el mock de `getPlanTarget` (si la página ya lo llama) y
      `deleteMeal` al objeto `mocks`.
- [ ] D8. Verificación de 11 (sin el recorrido de editor). `progress/impl_HU-018b.md` con "018b-1".
- Commit: `HU-018b: portal, PDF, IA y micronutrientes leen el menú semanal`

### Fase E — dominio y actions del editor (018b-2)

- [ ] E1. `createPlan`, `createTemplate` y `createPlanForConsultation` crean `DEFAULT_WEEKLY_MEALS`
      (con `createDefaultWeeklyMeals`). Tests de dominio.
- [ ] E2. `apps/web/src/app/(panel)/weekly-menu-actions.ts` (6.1).
- [ ] E3. `notify.undo` (7.9) y `chartPalette.macro` (7.10) (+ el test de contraste de tokens, si
      recorre `chartPalette`).
- Commit: `HU-018b: plan nuevo con comidas por defecto y actions del editor semanal`

### Fase F — UI del editor (018b-2)

- [ ] F1. `day-target-strip.tsx` + test.
- [ ] F2. `weekly-overview.tsx` + test.
- [ ] F3. `meal-card-menu.tsx`, `meal-mode-dialog.tsx`, `rename-meal-dialog.tsx`, `copy-day-dialog.tsx`,
      `use-menu-undo.ts`.
- [ ] F4. `meals-editor.tsx` reescrito (7.2), conservando nombre, props y el formulario de alimento.
- [ ] F5. `planes/[planId]/page.tsx`: `getPlanTarget` + `getPlanConsultationId` → `target`,
      `targetMissingHref`, `initialDay` (lee `searchParams.dia`); la franja reemplaza al
      `MacroTotals` fijo. `plantillas/[id]/page.tsx` igual, con `target={null}`.
- [ ] F6. `food-policy.test.ts`: confirmar que pasa sin cambiar aserciones.
- Commit: `HU-018b: editor semanal (días, modos, opciones, copiar y repetir con deshacer, objetivo del día)`

### Fase G — verificación final (018b-2)

- [ ] G1. `packages/db/scripts/test-weekly-menu.ts` (10.4) contra la base: `OK`.
- [ ] G2. Sección 11 completa, incluido `next build`.
- [ ] G3. `progress/impl_HU-018b.md` con archivos, salidas y el recorrido sugerido para el orquestador.
- Commit: `HU-018b: script de flujo del menú semanal`

---

## 10. Tests

### 10.1 `packages/core/src/weekly-menu.test.ts` (vitest)

- `WEEKDAYS` tiene 7 valores en orden MON..SUN; `WEEKDAY_LABELS.TUE` = `{ "Mar", "Martes", "martes" }`.
- `DEFAULT_WEEKLY_MEALS`: 5 comidas, 4 `PER_DAY` sin opciones y "Colaciones" `EVERY_DAY` con opciones.
- `isWeeklyMenu`: `false` con todas `EVERY_DAY` (y con `[]`); `true` con una `PER_DAY`.
- `itemsForDay`: `EVERY_DAY` devuelve todos; `PER_DAY` solo los del día.
- **Plan migrado = mismos totales**: un plan con 3 comidas `EVERY_DAY` e ítems con macros con
  decimales (p. ej. 12,3 + 45,6 + 0,1 …, incluir ítems `null`) → los 7 `days[d].macros` son
  `toEqual(sumMacros(todos los ítems))` y `weeklyAverage` también. Los 7 días `loaded`.
- Plan vacío → ningún día cargado, `weeklyAverage = null`, totales en 0.
- Gherkin "Varios ítems se suman": desayuno del martes con 3 ítems → `mealTotalForDay` = suma.
- Gherkin "Comida con opciones": 180, 80 y 70 kcal → `average.kcal = 110`, `minKcal = 70`,
  `maxKcal = 180`, y el día suma 110. Con una opción de texto libre (macros `null`) → no cuenta en el
  promedio ni en el rango; todas `null` → `summarizeOptions` = `null` y la comida suma 0.
- Gherkin "Día vacío": jueves sin ítems `PER_DAY` pero con una comida `EVERY_DAY` con ítems →
  `loaded = false`, su total incluye la `EVERY_DAY`, y **no** entra en el promedio (promedio de 6 días).
- Promedio: lunes 1.800 y martes 1.600 cargados, resto vacíos → `weeklyAverage.kcal = 1700`.
- `computeWeeklyItemWeights`: migrado → todos 1; `PER_DAY` con 4 días cargados → 0,25; opciones con
  2 de 3 con macros → 0,5, 0,5 y 0. Y `Σ macros × peso` ≈ `weeklyAverage` (±0,1).
- `compareToTarget` (D14): 1.800 objetivo → 1.710 y 1.890 `ON_TARGET` (bordes ±5 % inclusive);
  1.709 `UNDER` con `missing = 91`; 1.891 `OVER` con `excess = 91`; objetivo 0 → `null`.
- `formatTargetStatus`: `"Faltan 560 kcal"`, `"Falta 1 g"`, `"Se pasa 12 g"`, `"En objetivo"`,
  `"Faltan 1.240 kcal"` (separador es-AR).
- `summarizeDayStatus`: objetivo 1.800/110/200/60 → día 1.500/… → `"Faltan 300 kcal"`; grasas 75 →
  `"Se pasa 15 g G"`; todo dentro de ±5 % → `"En objetivo"`; kcal OK y proteínas 80 → `"Faltan 30 g P"`.
- `joinWeekdaysEs`: `["TUE"]` → "martes"; `["TUE","WED"]` → "martes y miércoles"; 3 → "martes,
  miércoles y jueves"; `form: "long"` → "Martes y Miércoles".
- `weekdayInTimeZone`: `2026-10-05T02:00:00Z` en `America/Argentina/Buenos_Aires` → `"SUN"` (son las
  23:00 del domingo); en `UTC` → `"MON"`.

`plan-micronutrients.test.ts`: sin `weight` el resultado es idéntico al de hoy (mismo caso de
fixture); `weight: 0.5` reduce `knownAmount` a la mitad; `weight: 0` con datos cuenta en `coverage`
como conocido y aporta 0.

### 10.2 `packages/db/domain/weeklyMenu.test.ts` (prisma mockeado, patrón de `appointments.test.ts`)

- `setMealMode` EVERY_DAY → PER_DAY: con 2 ítems crea 14 (7 por ítem, `order` conservado, weekday
  MON..SUN), borra los 2 originales, pone `isOptions = false`, todo en `$transaction`; devuelve la foto
  anterior con los 2 ítems `weekday: null`.
- `setMealMode` PER_DAY → EVERY_DAY con `keepWeekday: "WED"`: actualiza a `weekday = null` solo los del
  miércoles y borra los demás **filtrando por `mealId` y `weekday != WED`** (nunca un `deleteMany`
  sin `mealId`).
- `setMealOptions(true)` en una `PER_DAY` → `MealModeError`.
- `copyDay({ from: "MON", to: ["TUE","WED"] })`: solo comidas `PER_DAY` del dueño; borra ítems de
  TUE/WED de esas comidas y crea las copias; no toca comidas `EVERY_DAY`; `to` con `from` adentro o
  vacío → error.
- `repeatMealInAllDays`: reemplaza los otros 6 días de **esa** comida.
- `restoreMealSnapshots`: borra ítems de la comida y recrea los de la foto; comida de otro dueño →
  `MealOwnershipError` y no escribe nada.
- `assertWeekdayMatchesMeal`: EVERY_DAY + "MON" → error; PER_DAY + null → error.
- `moveMeal("up")` intercambia `order` con la anterior; en la primera no hace nada.
- `kind: "template"` usa `templateMeal`/`templateMealItem` y `templateId` (un caso por operación
  principal).
- `getPlanTarget`: prefiere la consulta del plan (`source: "PLAN_CONSULTATION"`, la más reciente si
  hay varias); si no hay, la más reciente del paciente (`"LATEST"`); si no hay, `null`. Mapea
  `prescribedVctKcal`, `proteinG`, `carbG`, `fatG`.
- `applyTemplateToPatient`: el `create` lleva `mode`, `isOptions` y `weekday`.
- (018b-2) `createPlan` y `createPlanForConsultation` crean las 5 comidas por defecto; `createTemplate`
  también.

### 10.3 Migración sin pérdida: `packages/db/scripts/test-weekly-menu-migration.ts`

Correr desde `packages/db`: `npx dotenv -e ../../.env -- tsx scripts/test-weekly-menu-migration.ts --snapshot <archivo>`
(antes) y `... --compare <archivo>` (después). **Solo lee**: no escribe nada en la base.

- `--snapshot` (con `$queryRaw`, solo columnas que ya existen): por cada `NutritionPlan` y cada
  `PlanTemplate`: lista ordenada de comidas (`id, name, order`) y de ítems (`id, mealId, foodId,
  customLabel, quantityGrams::text, notes, order`); **totales de hoy**: `sumMacros` de
  `computeItemMacros` de cada ítem con alimento y gramos (el mismo cálculo que hoy hacen `page.tsx`,
  el portal y el PDF); **micronutrientes conocidos**: `computePlanMicronutrients(...).nutrients[].knownAmount`
  con un paciente ficticio fijo (`{ birthDate: 1990-01-01, sex: "FEMALE" }`, fecha fija); y
  `md5(pdfData)` (o `null`). Escribe el JSON en el archivo dado, **fuera del repo**.
- `--compare`: relee con `getPlan`/`getTemplate` (domain, cliente regenerado) y verifica:
  1. mismas comidas e ítems, mismos campos (incluidos `quantityGrams` como texto, `notes`, `order`);
  2. toda comida `mode = "EVERY_DAY"` e `isOptions = false`; todo ítem `weekday = null`;
  3. `computeWeeklyTotals(...)`: `isWeekly = false`, y **cada uno de los 7 días** y el
     `weeklyAverage` son `deepEqual` al total del snapshot;
  4. micronutrientes con `computeWeeklyItemWeights` (todos 1) iguales a los del snapshot;
  5. `md5(pdfData)` igual (el PDF guardado no cambió).

  Imprime `OK — 9 planes, 0 plantillas, 113 ítems, 3 PDF sin cambios` o la lista de diferencias y
  sale con código 1.

### 10.4 Flujo contra la base: `packages/db/scripts/test-weekly-menu.ts` (018b-2)

Patrón de `apps/bot/scripts/test-confirm-attendance.ts`, **sin WhatsApp** (esta HU no encola nada en
`OutboundMessage`). Crea **su propio** paciente (teléfono ficticio `5490000018018`, nombre "Prueba
HU-018b"), un plan con `createPlan` y una plantilla con `createTemplate`; recorre: comidas por
defecto, agregar ítems en lunes, `copyDay` a martes y miércoles, `restoreMealSnapshots` (deshacer),
`repeatMealInAllDays`, `setMealMode` en los dos sentidos, `setMealOptions`, `applyTemplateToPatient`
(copia modos y días), `getPlanTarget` (`null`, el paciente no tiene consultas) y
`computeWeeklyTotals` sobre lo leído. Al final, en `finally`, **borra por id** la plantilla, los
planes creados y el paciente (los planes y comidas caen en cascada desde esos ids). Nunca usa
`deleteMany` por filtro amplio. Imprime `OK` o falla con código 1.

### 10.5 `apps/web` (vitest, con mocks)

- `meal-view.test.ts`: caso semanal (`mode`, `isOptions`, `weekday` llegan a la vista; sin esos
  campos → defaults); `toMicronutrientItems` con pesos.
- `day-target-strip.test.tsx`: con objetivo muestra "1.240", "de 1.800 kcal", "Faltan 560 kcal",
  "Objetivo: consulta del 12/09/2026"; sin objetivo muestra "Calculá el requerimiento para ver cuánto
  falta." y el link.
- `weekly-overview.test.tsx`: una fila "Todos los días" con `colSpan` 7, "Sin cargar" en un día vacío,
  "Promedio diario de la semana".
- `plan-pdf.test.tsx` (con `renderToBuffer` mockeado o renderizando `PlanDocument` a árbol): plan no
  semanal → mismas secciones y "Total del plan"; semanal → primero las `EVERY_DAY`, después "Lunes",
  "Martes" de las `PER_DAY`, "Elegí una:" en opciones, "Promedio diario".
- `food-policy.test.ts` (Leo): pasa sin cambiar aserciones.

---

## 11. Verificación (el implementer la corre antes de declararse `done`)

Desde la raíz:

```bash
npm run db:generate
npm run typecheck                                   # web, bot, core y db: todos en verde
npm run test                                        # vitest de todo el monorepo
npm run build --workspace packages/core && npm run build --workspace apps/web   # next build
cd packages/db && npx dotenv -e ../../.env -- prisma migrate status && cd -     # "up to date"
cd packages/db && npx dotenv -e ../../.env -- tsx scripts/test-weekly-menu-migration.ts --compare ~/nutribot-backups/hu018b-snapshot.json && cd -   # OK
cd packages/db && npx dotenv -e ../../.env -- tsx scripts/test-weekly-menu.ts && cd -   # OK (018b-2)
./ops/harness/verify.sh
```

Chequeo de datos (solo lectura), los números tienen que coincidir con los de antes de la migración:

```bash
docker compose exec -T db psql -U nutri -d nutribot -c 'select
 (select count(*) from "NutritionPlan") plans, (select count(*) from "PlanMeal") meals,
 (select count(*) from "PlanMealItem") items,
 (select count(*) from "PlanMeal" where mode <> '"'"'EVERY_DAY'"'"' or "isOptions") no_migradas,
 (select count(*) from "PlanMealItem" where weekday is not null) con_dia;'
# Antes de 018b-2 y sin pruebas a mano: 9 | 34 | 113 | 0 | 0 (en la base de Joel al 2026-10-03)
```

### 11.1 Recorrido en Chrome para el orquestador (018b-2)

Con `npm run dev` (panel en :3000), logueado. No requiere el bot. Antes, crear un paciente de prueba
a mano o usar uno inventado; **no editar planes reales**: los planes existentes solo se abren.

1. Abrir un plan **existente** → se ve como antes (sin selector de días), "Total del día" con los
   mismos números que antes de la HU; micronutrientes iguales.
2. En el paciente de prueba, "Nuevo plan" → trae Desayuno, Almuerzo, Merienda, Cena ("Cambia cada
   día") y Colaciones ("Todos los días · Elegí una"). Abre en "Semana" (plan vacío).
3. Tocar "Lun", agregar 2 alimentos al desayuno → la franja del lunes cambia; si el paciente tiene
   prescripción, "lleva / objetivo" y "Faltan …"; si no, "Calculá el requerimiento…" con link.
4. "Copiar este día a…" → marcar martes y miércoles → toast "Lunes copiado a martes y miércoles ·
   Deshacer" → tocar "Deshacer" → martes y miércoles vuelven a estar vacíos.
5. "⋯ → Repetir en todos los días" en el desayuno del lunes → los 7 días con ese desayuno.
6. Colaciones: agregar 3 alimentos → "Opciones: X a Y kcal"; el total del día suma el promedio.
7. "⋯ → Cambiar a Igual todos los días" en el desayuno → diálogo "¿Qué día conservar?" (lunes) →
   toast con "Deshacer".
8. "Semana" → tabla con filas por comida, "Todos los días" en una fila, "Sin cargar" en días vacíos,
   "Promedio diario de la semana". Tocar una celda lleva a ese día.
9. Generar el PDF del plan de prueba → comidas "Todos los días" primero y después "Lunes: …".
10. Marcar el plan de prueba como activo y verlo en el portal (sesión del paciente de prueba): hoy
    seleccionado, pestañas Lun…Dom, "Elegí una" en Colaciones.
11. Plantillas: "Nueva plantilla" → mismas comidas por defecto, sin objetivo; aplicarla al paciente de
    prueba → el plan copia modos y días.
12. Achicar la ventana a ancho de celular (DevTools, 390 px) y repetir 3 y 8: selector en 8 columnas,
    objetivos de 44 px.
13. Al terminar, borrar el paciente de prueba desde el panel (o pedirle al usuario que lo borre).

---

## 12. Desvíos y dudas técnicas (cada una con recomendación; ninguna bloquea)

- **D1. Partir 018b en 018b-1 (modelo) y 018b-2 (editor).** Ver sección 9. **Recomendación: sí.**
  Cada mitad se mergea sola, Leo puede arrancar la HU-015 sobre el modelo antes, y como 018b-2 no
  tiene migración, la 018a puede pasar a `implementando` en paralelo con 018b-2. Si el orquestador
  prefiere una sola entrega, el checklist sirve igual en orden.
- **D2. La IA con comidas por defecto.** La HU pide que el plan nuevo traiga 5 comidas **y** que la IA
  cargue "como hoy", pero hoy la IA solo corre en planes **sin comidas**. **Recomendación:** la IA
  corre si el plan no tiene **ítems**, y reemplaza las comidas vacías por las suyas (`EVERY_DAY`). Se
  borran solo después de validar la respuesta, para no dejar el plan sin comidas si la IA falla
  (6.3).
- **D3. Modo de una comida agregada a mano.** La HU no lo dice. **Recomendación:** hereda: `PER_DAY` si
  el plan ya tiene alguna comida `PER_DAY`, si no `EVERY_DAY` (así un plan migrado no se vuelve
  semanal sin querer, y en un plan semanal la comida nueva se edita por día). Se cambia después con
  el "⋯". No se agrega una pregunta más al formulario ("pocas decisiones a la vez").
- **D4. Comidas por defecto en plantillas nuevas.** El escenario "Plan nuevo" habla de planes, y
  "Plantillas semanales" dice que se editan igual. **Recomendación:** la plantilla nueva también trae
  las 5 comidas por defecto. Aplicar una plantilla **no** agrega las comidas por defecto: copia la
  plantilla tal cual.
- **D5. Selector de día: componente nuevo, no `SegmentedControl`.** El `SegmentedControl` de 017a es
  para 2–5 opciones y llega a `h-10`. **Recomendación:** `DaySelector` sobre el primitivo
  `ToggleGroup`, con el mismo estado encendido (`primary-soft`) y 44 px. No se modifica el primitivo
  ni `segmented-control.tsx`.
- **D6. "Deshacer" con la foto en el cliente.** Las actions devuelven la foto anterior y el cliente la
  manda de vuelta al tocar "Deshacer". Es simple y no necesita tablas nuevas. El panel es solo de la
  profesional y la foto se valida con zod y por dueño. **Recomendación:** aceptarlo; la restauración
  admite cualquier `foodId` existente (no solo SARA 2) porque la foto sale del mismo plan y puede
  tener alimentos PROPIO históricos (PR #7). Los ítems restaurados tienen ids nuevos (nadie guarda
  ids de ítems).
- **D7. Opciones con ítems de texto libre.** Una opción "Fruta" sin alimento no tiene macros.
  **Recomendación:** el promedio y el rango se calculan sobre las opciones **con** macros; las de
  texto no cuentan (en kcal ni en micronutrientes).
- **D8. "Repetir en todos los días" pide confirmación solo si va a pisar algo.** La HU dice "con el
  mismo aviso y Deshacer". **Recomendación:** si otros días tienen contenido, `AlertDialog` con el
  aviso de reemplazo; si no, directo. Siempre toast con "Deshacer".
- **D9. PDF de un plan semanal: totales.** "Total del plan" no tiene sentido en un menú semanal.
  **Recomendación:** "Promedio diario" (de los días cargados). Planes migrados: "Total del plan" como
  hoy.
- **D10. `wrap={false}` en el PDF.** Hoy cada comida no se corta entre páginas; con 7 días no entra.
  **Recomendación:** el bloque que no se corta es el día, no la comida. Lo puede cambiar la HU-015.
- **D11. Objetivo: link "Calculá el requerimiento…".** **Recomendación:** a la consulta más reciente
  vinculada al plan; si el plan no tiene consulta, a la pestaña Consultas del paciente.
- **D12. Comida "Todos los días" con opciones que pasa a "Cambia cada día".** Las opciones solo valen
  con "Igual todos los días". **Recomendación:** se apagan al cambiar, el toast lo aclara ("Colaciones
  ahora cambia cada día; ya no es de opciones · Deshacer") y "Deshacer" lo devuelve.

---

## 13. Para la HU-015 de Leo (lo que deja el modelo nuevo)

**Modelo** (`schema.prisma`):

- `PlanMeal.mode: MealMode` (`EVERY_DAY` | `PER_DAY`) y `PlanMeal.isOptions: Boolean`. Igual en
  `TemplateMeal`.
- `PlanMealItem.weekday: Weekday | null` (`MON`…`SUN`; `null` = todos los días). Igual en
  `TemplateMealItem`. `order` es el orden **dentro del día**.
- Invariantes: `EVERY_DAY` ⇒ ítems con `weekday = null`; `PER_DAY` ⇒ ítems con día e
  `isOptions = false`.

**Funciones puras** (`@nutri-bot/core`, `weekly-menu.ts`): `WEEKDAYS`, `WEEKDAY_LABELS` (para
"Lunes:"), `isWeeklyMenu`, `itemsForDay`, `mealTotalForDay`, `summarizeOptions` (rango "70 a 180
kcal"), `computeWeeklyTotals` (totales por día + `weeklyAverage`), `computeWeeklyItemWeights`,
`compareToTarget`/`formatTargetStatus`/`summarizeDayStatus`, `joinWeekdaysEs`, `weekdayInTimeZone`.

**Vista** (`apps/web`): `MealView` = `{ id, name, mode, isOptions, items: MealItemView[] }` y
`MealItemView.weekday`. `toMealView(plan.meals)` arma todo; `PlanPdfInput.meals` ya recibe esa forma.

**Objetivo**: `getPlanTarget(planId)` → `{ kcal, protein, carbs, fat, consultationId, consultedAt,
source }` o `null` (por si el PDF/Word muestra el VCT).

**Lo provisional que la HU-015 reemplaza**: `lib/plan-pdf.tsx` (7.8) completo. La estructura que se
recomienda conservar es la de la plantilla real: comidas "Todos los días" (y opciones "Elegí una")
primero, después cada comida "Cambia cada día" con sus 7 días.

**Lo que 018c va a agregar al mismo modelo** (para que la HU-015 lo tenga en cuenta): `recipeId` y
`portions` en `PlanMealItem`/`TemplateMealItem` (ítem de receta: una línea con nombre + porción casera
+ "Fuente: …"). En `weeklyMenu.ts`, `itemCopyData` y `MenuItemData` son el único lugar a extender para
que copiar/repetir/deshacer copien recetas.

---

## 14. Fuera de alcance (no implementar en 018b)

Recetas, buscador y "Agregar receta" (018a/018c); medidas caseras (018d); semanas de más de 7 días;
fechas reales; objetivo por comida; recetas en la IA; rediseño general de la pantalla del plan
(HU-017e) y del PDF (HU-015); vista previa de la receta en la franja (018c); cualquier mensaje de
WhatsApp; cambios en `apps/bot`.

## 15. Decisiones del usuario (2026-10-03)

- **D1: dos PR.** Primero **018b-1 (modelo)**, en la rama `feat/hu-018-plan-recetas-buscador`, con PR a `develop`. Después
  **018b-2 (editor semanal)**, en una rama nueva desde `develop` cuando 018b-1 esté mergeado. La 018a **no** va en
  paralelo con 018b-2: el arnés permite una HU activa por persona.
- **D2–D12:** aceptadas todas las recomendaciones de la sección 12.
- **Implementer:** Opus, con los skills `migracion-prisma`, `apple-design`, `web-design-guidelines` y `ui-ux-pro-max`.

## 16. Pendientes para 018b-2 (de la revisión de 018b-1)

- `ai-actions.ts`: releer el plan justo antes de borrar las comidas vacías, o mover borrado + alta a una operación
  transaccional de domain (hoy se lee antes de llamar a la IA y no hay transacción).
- `addPlanMealItemAction`/`addTemplateMealItemAction`: el editor nuevo manda `weekday` (input oculto) en comidas
  `PER_DAY`, para que `assertWeekdayMatchesMeal` no termine en la página de error.
