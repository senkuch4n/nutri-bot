# Implementación HU-018c: buscador de recetas en cada comida

SDD: `Refactorizaciones/buscador-recetas.md` (corte 018c-1 = fases A–F; §13 D1–D9 aceptadas; §16 decisiones).
HU: `docs/hu-plan-recetas-buscador.md`. Rama `feat/hu-018c-buscador-recetas` (ya tenía `develop`: 018a, 018b y #25).
Implementer: Opus, con los skills `apple-design` y `ui-ux-pro-max`, y `web-design-guidelines` como autochequeo.

## 018c-1: agregar recetas al plan

**Estado: done.** Sin migración. Commits locales, sin push:

| Fase | Commit | Mensaje |
|---|---|---|
| A | `e8a38d4` | HU-018c: impacto de recetas en el día y textos del buscador (core) |
| B (+E2) | `415aaa6` | HU-018c: ítems de receta en el menú semanal (domain) |
| C | `569dd78` | HU-018c: script de verificación del ítem de receta |
| D | `1a3b3a7` | HU-018c: la receta en el plan, el portal y el PDF (lectura) |
| E | `71d7f00` | HU-018c: actions del buscador de recetas |
| F1–F2 | `388436a` | HU-018c: componentes de recetas listos para el buscador |
| F3–F5 | `deb0027` | HU-018c: buscador de recetas en la comida |
| F6 | último commit de la rama (este reporte + arreglo de un test) | HU-018c: verificación de 018c-1 |

018c-2 (detalle de la receta: `getRecipePreview`, `listPlanRecipePreviews`, `RecipeDetailBody`, diálogo y "Ver receta"
en el portal) **no** está hecho, como se pidió.

### Preparación

- `git fetch`: `origin/develop` = `524c94a`, ancestro de HEAD. Nada para rebasear.
- `prisma migrate status`: "Database schema is up to date" (23 migraciones). No se tocó `schema.prisma` ni se creó
  ninguna migración.

### Archivos

Creados:
- `packages/core/src/recipe-picker.ts` y `recipe-picker.test.ts` (53 tests).
- `packages/db/scripts/test-recipe-picker.ts`.
- `apps/web/src/app/(panel)/recipe-picker-actions.ts` y `recipe-picker-actions.test.ts` (7 tests).
- `apps/web/src/lib/revalidate-menu-owner.ts`.
- `apps/web/src/components/recipe-picker/`: `types.ts`, `recipe-picker-sheet.tsx`, `use-picker-recipes.ts`,
  `picker-day-strip.tsx`, `picker-card-footer.tsx` (+ test, 6), `portion-stepper.tsx` (+ test, 3),
  `recipe-meal-item.tsx`, `use-recipe-item-actions.ts`.

Modificados:
- `packages/core/src/{recipes.ts,recipes.test.ts,index.ts}`: `expandRecipeIngredients` (+2 tests) y el export.
- `packages/db/domain/weeklyMenu.ts` (+ test): `MenuItemData`/`ItemRow`/`itemCopyData` con `recipeId` y `portions`,
  invariante de receta en `assertSnapshotInvariants`, `ItemDelegate` con `create`/`update`/`findMany`,
  `RecipeNotAvailableError`, `addRecipeItems`, `setRecipeItemPortions`, `removeMenuItems`.
- `packages/db/domain/recipes.ts` (+ test): `RECIPE_ITEM_SELECT`.
- `packages/db/domain/nutritionPlans.ts` y `planTemplates.ts`: solo el `include` (`recipe: { select: RECIPE_ITEM_SELECT }`)
  y los dos campos en `applyTemplateToPatient`.
- `packages/db/package.json`: script `test:recipe-picker`.
- `apps/web/src/app/(panel)/weekly-menu-actions.ts` (+ test): usa `revalidateMenuOwner`; `snapshotItemSchema` con
  `recipeId`/`portions` (`.default(null)`) y el `superRefine` del invariante (6.2).
- `apps/web/src/components/meals-editor.tsx`: ver "Zona de Leo".
- `apps/web/src/components/weekly-menu/labels.ts`: `itemLabel` con `item.recipe?.name`.
- `apps/web/src/components/recipes/{recipe-card,recipe-grid,recipe-grid-skeleton,recipe-filters,chip-group}.tsx` (7.1).
- `apps/web/src/lib/{meal-view.ts,meal-view.test.ts,plan-pdf.tsx,plan-pdf.test.tsx}`.
- `apps/web/src/app/(portal)/portal/plan/{page.tsx,portal-day-view.tsx}` (`plan-view.tsx` no hizo falta: usa
  `PortalMealItems`).
- `apps/web/src/lib/food-policy.test.ts`: dos `vi.mock` (ver "Decisiones").

**Zona de imleticio (Leo), lo que se tocó:**
- `meals-editor.tsx`: `MealItemView.recipe?` (opcional), el botón primario "Agregar receta" arriba del formulario de
  alimentos (que pasó de `mt-6 border-t pt-6` a `mt-4`; su botón sigue `secondary`), la rama `item.recipe →
  <RecipeMealItem>` en el `map`, y un solo `<RecipePickerSheet>` montado en `MealsEditor` (estado `{ mealId, day }`).
  Las props de `MealsEditor` no cambiaron; `MealCard` suma `onAddRecipe`.
- `plan-pdf.tsx`: `ItemRows` dibuja `RecipeRow` (nombre y, debajo, porción casera · "Fuente: …"; cantidad vacía).
- `meal-view.ts`, `nutritionPlans.ts`, `planTemplates.ts` y el portal: como lista la SDD.
- **No se tocaron** `food-picker.tsx`, `food-catalog.tsx`, `addMealItem`, `addTemplateMealItem`, `planes/**/actions.ts`,
  `plantillas/**`, `alimentos/**`, `primitives/*`, `schema.prisma`, `apps/bot/**`. "Quitar" de un ítem de receta usa
  `deletePlanMealItemAction`/`deleteTemplateMealItemAction`, que ya existían.

### Contrato compartido (SDD §4–§6): confirmación

Las firmas de `recipe-picker.ts`, `expandRecipeIngredients`, `MenuItemData`, `addRecipeItems`,
`setRecipeItemPortions`, `removeMenuItems`, `RecipeNotAvailableError`, `RECIPE_ITEM_SELECT`, los tipos de
`components/recipe-picker/types.ts` y las 4 actions coinciden con la SDD. Diferencias y agregados:
- `addRecipeItems` es `async function` (la SDD la declara `function … : Promise`). Así cualquier validación
  (porciones, días) llega como rechazo de la promesa y no como `throw` síncrono.
- `getRecipePreviewAction`, `RecipePreviewResult` y `RecipePreview` son de 018c-2: no están.
- Agregados en core (no figuran en la SDD, son helpers de texto con test): `addAriaLabel`, `openPickerAriaLabel`,
  `pickerDaysHint`, `noTargetStripText` y `stepperAriaLabel`. `RECIPE_PICKER_TEXT` suma `fits`, `createRecipeAria`,
  `goToRecipes`, `retry`, `archivedBadge`, `macrosIncomplete`, `sessionExpired`, `stripWeek` y `stripPlan`.
- Los textos con unidad usan espacio duro antes de la unidad y del `%` (como `formatMacroAmount`): "Suma 14 % …",
  "(+8 g)", "146 kcal".

### Decisiones no obvias

- **E2 va en el commit de B.** Al sumar `recipeId`/`portions` a `MenuItemData`, `weekly-menu-actions.ts` deja de
  compilar. Para que cada commit compile, el `snapshotItemSchema` (6.2) y sus tests entraron con el dominio.
- **"Deshacer" de Copiar día recrea los ítems con ids nuevos** (`restoreMealSnapshots` borra y recrea). Por eso el paso 8
  del script vuelve a leer los ids del desayuno en vez de usar los del paso 1.
- **Pie de la tarjeta presentacional.** `PickerCardFooter` recibe el estado por props y lo prueba `renderToStaticMarkup`
  (el repo no tiene DOM en vitest). El estado vive en `PickerCard` (en el sheet): "Agregar" y "Quitar" usan
  `useTransition`, así el botón sigue pendiente hasta que llega la comida revalidada y no vuelve a "Agregar" por un
  instante. "Agregada" sale de `meals`, no de estado local.
- **Porciones optimistas** (`useRecipePortions`, `useOptimistic`): el ítem del editor reescala sus macros con el valor
  optimista; si la action falla, vuelve solo y aparece `portionsError`.
- **Foco al abrir:** con puntero fino se previene el autofocus de Radix y se enfoca el buscador. En pantallas táctiles
  se deja el de Radix (primer elemento enfocable, el botón "Listo"): no se abre el teclado y el foco queda adentro.
- **Tarjeta sin acción arriba en 018c-1:** `RecipeCard` acepta `href`, `onOpen` (para 018c-2) o ninguno; `RecipeGrid`
  acepta `hrefFor={null}`. `/recetas` sigue igual.
- **Franja compacta en el celular:** el texto de estado de cada celda se oculta debajo de `sm` (el `aria-valuetext` del
  `meter` lo sigue diciendo) para que el encabezado fijo no tape media pantalla a 390 px. Con objetivo, la barra dibuja
  el tramo agregado con 40 % de opacidad durante la vista previa.
- **`scroll-pt` en el sheet** para que el encabezado fijo no tape la tarjeta que recibe el foco con Tab.
- **`food-policy.test.ts`:** importa la página del plan, que ahora llega a `recipe-picker-actions` (y de ahí a
  `next-auth`) y a `server-only` (por `revalidate-menu-owner`). Se mockean los dos módulos; el test no usa ninguno.
- **Autochequeo `web-design-guidelines`:** sin hallazgos bloqueantes. Queda anotado: "Quitar" de la tarjeta borra sin
  "Deshacer", igual que el "Quitar" de alimentos que ya existía. La SDD no lo pide.

### Verificación (SDD 12.1)

| Comando | Resultado |
|---|---|
| `npm run db:generate` | OK |
| `npm run typecheck` | core, db, web y bot: 0 errores |
| `npm run test` | 100 archivos, **1712 tests** OK |
| `npm run lint --workspace apps/web` | 1 warning, el de antes (`ajustes/logo-form.tsx`, alt). Ninguno nuevo |
| `prisma migrate status` | "Database schema is up to date!" |
| `npm run test:recipe-picker --workspace packages/db` ×2 (y otras 2 veces durante la fase C) | OK, conteos iguales antes y después |
| `npm run test:recipes --workspace packages/db` (018a) | OK |
| `tsx scripts/test-weekly-menu.ts` (018b) | OK |
| `./ops/harness/verify.sh` | "Arnés OK". El WARN "se tocó el bot" sale de las carpetas `apps/bot/.whatsapp-auth.vieja*`, que estaban sin trackear desde antes. No toqué el bot |
| `next build` (webpack, copia en el scratchpad) | exit 0 |
| `next build --turbopack` (copia en el scratchpad) | "Compiled successfully", exit 0, sin "Only async functions…" |

Las dos builds compilan `/pacientes/[id]/planes/[planId]`, `/plantillas/[id]` y `/portal/plan`. La copia se borró.
`next dev` del usuario en :3000 no se tocó.

**Conteos de control** (`Recipe | NutritionPlan | PlanMealItem | ítems de receta | ítems de receta en plantillas`):
- Antes: `9 | 10 | 131 | 0 | 0`. Después de todos los scripts: `9 | 10 | 131 | 0 | 0`. `OutboundMessage`: 11 → 11.
- `Patient` pasó de 20 a 21 entre mi primera medición y la segunda. Es `cmusdhvey00047l3w98dvl81i`, sin nombre, con un
  número de WhatsApp real, creado a las 12:33 UTC: lo creó el bot del usuario al recibir un mensaje. No es mío y no lo
  toqué. Mis scripts dejaron `Patient` igual.
- Los 8 borradores de importación y la receta publicada preexistentes no se tocaron. No se corrió `db:seed`, no se
  regeneró ningún PDF, no hubo WhatsApp ni IA.

### Script contra la base (`packages/db/scripts/test-recipe-picker.ts`)

Crea su receta MANUAL publicada "Prueba HU-018c" (2 alimentos SARA 2, solo lectura), el paciente "Prueba HU-018c"
(5490000018003), un plan con `createPlan` y una plantilla. Recorre los 9 pasos de 11.4: agregar en [MON, WED],
porciones a 1,5 (y 2 con otro dueño → `MealOwnershipError`), copiar MON → FRI y deshacer, uso 1/0, foto visible con el
plan ACTIVE, Colaciones con `null`, plantilla aplicada con receta (2 porciones, jueves), `removeMenuItems` (2 y 0 con
otro plan), y archivar → `RecipeNotAvailableError` con el ítem todavía en `getPlan`. Borra por id en `finally`.

## Recorrido en Chrome (para el orquestador, SDD 12.2 pasos 1–14)

### Datos de prueba ya creados (borrar al terminar, solo por id)

Están también en el scratchpad de esta sesión (`walkthrough-018c-ids.json`).

| Qué | id |
|---|---|
| Paciente "Prueba HU-018c" (5490000018004, mujer, nacida el 10/05/1990) | `cmuse1f6k0000a86ybdrp71ia` |
| Receta "Prueba 018c Panqueques de avena y banana" (desayuno y merienda, foto, "Fuente: Prueba", rinde 4, "2 panqueques") | `cmuse1f6p0002a86yjkukkw60` |
| Receta "Prueba 018c Galletitas de avena" (colación, rinde 6, "3 galletitas") | `cmuse1f8p000aa86yf6yxvxlv` |
| Receta "Prueba 018c Huevos revueltos con aceite" (desayuno y almuerzo, ~43 g de grasa por porción, para "Se pasa") | `cmuse1f8t000fa86yziwapifj` |

**Falta cargar (desde la UI):** una consulta del paciente con la calculadora de requerimiento (1.800 kcal, 110 P,
200 C, 60 G), un plan nuevo del paciente y una plantilla nueva. No la inserté a mano porque la prescripción tiene muchos
campos clínicos obligatorios.

### Pasos

1. `/pacientes/cmuse1f6k0000a86ybdrp71ia` → nueva consulta con la calculadora (objetivo de arriba) → plan nuevo. Pestaña
   **Martes**: el Desayuno muestra "Agregar receta" (primario, con lupa) y debajo "Agregar alimento" (secundario).
2. "Agregar receta":
   - El título es "Agregar a Desayuno · Martes".
   - El chip de momento "Desayuno" está encendido y en "Agregar en:" solo "Mar", con candado. Abajo dice "El martes
     queda marcado…".
   - En escritorio, el cursor está en el buscador.
   - La franja compacta muestra el martes contra 1.800 kcal.
   - Sin escribir se ven los Panqueques y los Huevos. Las Galletitas no, porque no son de desayuno.
3. Escribir "avena" y "AVENA": aparecen las dos recetas, con foto (la de los panqueques), porción, kcal y P/C/G. También
   "Suma N % de las kcal del martes" y "Entra en lo que falta". Pasar el mouse o hacer Tab por una tarjeta: la franja
   muestra "antes → después".
4. Tipo "Colación" → "No hay recetas con «avena»."… y el contador cambia. "Todos" en Momento y otra vez "Colación": se
   ven las Galletitas. "Quitar filtros" vuelve todo. Con "quinoa": "No hay recetas con «quinoa».", "Probá con otro
   ingrediente:", los chips avena/huevo/banana/pollo, "Quitar filtros" y "Crear receta" (abre otra pestaña).
5. "Agregar" en los Panqueques:
   - Spinner y después "✓ Agregada" con "− 1 porción +" y "Quitar".
   - El toast dice "Prueba 018c Panqueques de avena y banana agregados a Desayuno (martes) · Deshacer".
   - La franja del martes sube.
6. "+" → "1½ porciones"; en el editor, detrás, los macros se recalculan. Agregar otra vez y "Deshacer" en el toast
   (antes de 8 s) → el ítem desaparece y aparece "Listo, se deshizo el cambio".
7. Marcar Jue y Sáb. Los Huevos revueltos dicen "Agregar en 3 días" y "Se pasa en grasas el … (+X g)", con flecha y en
   color de aviso. "Agregar": el toast dice "… agregados a Desayuno (martes, jueves y sábado)". La franja sigue en el
   martes.
8. "Listo": el Desayuno del martes muestra la receta con miniatura, "Receta", "1 porción (2 panqueques) · N kcal",
   P/C/G, el control de porciones y "Quitar". Jueves y sábado tienen los Huevos.
9. Colaciones ("Todos los días · Elegí una") → "Agregar receta":
   - El título termina en "· Todos los días" y no hay fila de días.
   - Las tarjetas dicen "Como opción, la comida pasa a promediar N kcal".
   - Al agregar, "Opciones: X a Y kcal" de la comida cambia.
10. "Copiar este día a…" del martes al miércoles: el miércoles tiene la receta. "Deshacer" la saca. Antes de 018c, esto
    rompía con recetas.
11. Micronutrientes (debajo del editor): cambian al agregar la receta.
12. "Generar PDF" de este plan (es de prueba, no es un plan real): la receta sale como una línea con "1 porción (2
    panqueques) · Fuente: Prueba".
13. Plantilla nueva → "Agregar receta": sin franja ni porcentajes. Agregar los Panqueques el martes. Aplicarla al paciente
    de prueba: el plan nuevo trae la receta el martes con sus porciones.
14. Celular (DevTools, 390 px):
    - El panel ocupa la pantalla y se cierra arrastrando a la derecha.
    - El teclado no se abre solo.
    - La grilla va en 1 columna y los chips se envuelven.
    - "−", "+", "Agregar" y los chips miden 44 px.
    - Escape y "Listo" cierran.
15. (018c-1, portal) Marcar el plan de prueba como "Activo". Desde `packages/db`:
    `npx dotenv -e ../../.env -- tsx -e 'import {createPatientToken} from "./domain/patientAuth"; console.log(createPatientToken("cmuse1f6k0000a86ybdrp71ia", 30))'`
    y abrir `http://localhost:3000/portal/login?token=<token>`. La receta se ve con miniatura, porción y "Fuente:
    Prueba", sin kcal ni gramos de la receta.

(D10: con la receta en el plan, `/recetas/cmuse1f6p0002a86yjkukkw60` → cambiar un gramo → "Esta receta está en N
planes…").

### Limpieza (solo por id, en este orden por el `Restrict`)

1. Borrar desde el panel los planes del paciente de prueba y la plantilla de prueba.
2. Desde `packages/db`:
   `npx dotenv -e ../../.env -- tsx -e 'import {prisma} from "./index"; for (const id of ["cmuse1f6p0002a86yjkukkw60","cmuse1f8p000aa86yf6yxvxlv","cmuse1f8t000fa86yziwapifj"]) await prisma.recipe.delete({ where: { id } }); await prisma.patient.delete({ where: { id: "cmuse1f6k0000a86ybdrp71ia" } }); await prisma.$disconnect()'`
   El paciente borra en cascada su consulta y su prescripción.
3. Repetir los conteos de 12.1: tienen que dar `9 | 10 | 131 | 0 | 0` (más lo que haya cargado el usuario mientras tanto).

### Para el PR (aviso a Leo)

"El ítem de receta se dibuja en `components/recipe-picker/recipe-meal-item.tsx`, fuera de tu zona. En `meals-editor.tsx`
solo hay un botón, una rama del `map` y el montaje del Sheet. En el PDF hay una línea por receta (`RecipeRow`). Lo que
queda para la HU-015 está en la §14 de la SDD."

## 018c-2: detalle de la receta + pendientes de la revisión de 018c-1

**Estado: done.** Rama `feat/hu-018c2-detalle-receta`. Sin migración, sin `schema.prisma`, sin `apps/bot`. Implementer: Opus,
con los skills `apple-design` y `ui-ux-pro-max`, y `web-design-guidelines` como autochequeo.

### Punto de partida

Los commits `2f44c77` y `bbb7a68` eran trabajo WIP sin verificar de una corrida que se cortó. Los revisé archivo por archivo
contra la SDD (§5.2, §6.1, §7.1, §7.4, §7.6, §10 G–H, §11 y §17). Estaba casi completo y compilaba. Corregí dos detalles
de accesibilidad (abajo) y corrí toda la verificación, que la corrida anterior no había llegado a hacer.

### Lo que hay (checklist G y pendientes de §17)

| Ítem | Dónde |
|---|---|
| G1 `RecipePreview`, `getRecipePreview` (PUBLISHED/ARCHIVED; DRAFT → null) y `listPlanRecipePreviews` (recetas distintas del plan, sin DRAFT, por nombre), con tests | `packages/db/domain/recipes.ts`, `recipes.test.ts` (+3) |
| G2 `getRecipePreviewAction` (sesión, zod del id, null → `notPublished`, error → `loadError` con log solo del código) | `(panel)/recipe-picker-actions.ts` (+ test, 4 casos). El archivo sigue exportando solo funciones async (el test de 018c-1 lo sigue chequeando) |
| G3 `RecipeDetailBody` (+ test, 4 casos) y `RecipePreviewDialog`; `onOpen` en el sheet | `components/recipes/recipe-detail-body.tsx`, `components/recipe-picker/recipe-preview-dialog.tsx`, `recipe-picker-sheet.tsx` |
| G4 Portal: `listPlanRecipePreviews` en `page.tsx`, `PortalRecipeView` sin macros, `portal-recipe-sheet.tsx`, "Ver receta" | `(portal)/portal/plan/*`, `lib/portal-recipe.ts` (+ test) |
| §17.1 Test con mocks de `applyTemplateToPatient` con un ítem de receta | `packages/db/domain/planTemplates.test.ts` (nuevo, 2 casos) |
| §17.2 Impacto y botón miden los mismos días | `scopeForDaysToAdd` en `packages/core/src/recipe-picker.ts` (+ 4 tests, uno reproduce el caso de la revisión: el jueves ya la tiene → deja de decir "Se pasa … el jueves" y el botón dice "Agregar en 2 días"). `PickerCard` recalcula el contexto solo si el alcance se achica |
| §17.3 "Quitar" del ítem de receta a 44 px | `recipe-meal-item.tsx` (`className="h-11 px-4"` sobre el `SubmitButton`) |
| §17.4 Los macros de los ítems de receta no viajan al portal | `portalMealsForClient` (ítems de receta con `macros: null`, `kcalBreakdown: null`, `macrosIncomplete: false`; los totales se calculan en el server antes) y `toPortalRecipeView` (arma el objeto campo por campo: nada nuevo de `RecipePreview` se filtra solo) |
| §17.5 Recorrido del portal con un plan de prueba | Hecho por HTTP contra un build de producción (ver "Portal contra la base"). El PDF, ver "Pendiente" |

### Correcciones sobre el WIP

- **Nombre accesible del botón del detalle** (`recipe-picker-sheet.tsx`): en el diálogo el texto visible es "Agregar a
  Desayuno · Martes" pero el `aria-label` era "Agregar {receta} a desayuno del martes", que no contiene el texto visible
  (WCAG 2.5.3, control por voz). Ahora, en `variant="dialog"`, es `"{texto visible}: {receta}"`. La tarjeta no cambia.
- **El pie fijo del diálogo tapaba el foco** (`recipe-preview-dialog.tsx`): se sumó `scroll-pb-48` al contenedor que
  scrollea, así el `<summary>` de "Preparación" (o lo que tenga foco) no queda debajo del pie al navegar con Tab.

### Contrato compartido: confirmación

`RecipePreview`, `getRecipePreview`, `listPlanRecipePreviews`, `RecipePreviewResult`, `getRecipePreviewAction`,
`RecipeDetailBody` (props `recipe`, `photoScope`, `showMacros`, `preparationOpen`) y `PortalRecipeView =
Omit<RecipePreview, "perPortion" | "macrosIncomplete" | "status">` coinciden con la SDD. Agregados y desvíos menores:
- Core suma `scopeForDaysToAdd`, `recipeYieldText` ("Rinde 4 porciones"), `recipeSourceText`, `recipePhotoCreditText` y
  en `RECIPE_PICKER_TEXT` `ingredientsTitle`, `preparationTitle`, `tipsTitle`, `previewLoadError`,
  `portalSheetDescription` y `previewDescription`. Todos con test.
- `RecipeDetailBody` acepta además `className`, y su `recipe` es `PortalRecipeView & { perPortion?: Macros | null }`, así
  el mismo componente recibe la vista del portal (que no tiene macros) y el `RecipePreview` del panel.
- El diálogo, si la carga falla, dice "No se pudo cargar la receta." (singular) en vez de `loadError` ("No se pudieron
  cargar las recetas."), que habla de la grilla. Si la receta dejó de estar publicada, dice `notPublished` y no ofrece
  "Reintentar".
- El diálogo guarda el detalle por id mientras el sheet esté montado (reabrir la misma receta no vuelve a pedirla).
- La X del primitivo `Dialog` está en el contenedor que scrollea, así que se va al bajar. Escape, el scrim y "Listo"
  del pie siguen. No toqué `primitives/*` (fuera de alcance).

### Verificación (SDD 12.1)

| Comando | Resultado |
|---|---|
| `npm run typecheck` | core, db, bot y web: 0 errores (después de los últimos cambios, de nuevo web: 0) |
| `npm run test` | 103 archivos, **1737 tests** OK |
| `npm run lint --workspace apps/web` | solo el warning previo (`ajustes/logo-form.tsx:36`, alt) |
| `prisma migrate status` | "Database schema is up to date!" (23 migraciones). No hay migración |
| `npm run test:recipe-picker --workspace packages/db` ×2 | OK las dos veces, 10 pasos (el 10 es nuevo: `getRecipePreview` de una archivada, `listPlanRecipePreviews` sin repetir en el plan y en el aplicado, sin datos de importación, y borrador → null). Conteos iguales antes y después |
| `npm run test:recipes --workspace packages/db` (018a) | OK |
| `tsx scripts/test-weekly-menu.ts` (018b) | OK |
| `next build` (webpack, copia en el scratchpad) | exit 0. Compila `/pacientes/[id]/planes/[planId]`, `/plantillas/[id]` y `/portal/plan` |
| `next build --turbopack` (copia en el scratchpad) | "Compiled successfully", exit 0, sin "Only async functions are allowed to be exported in a "use server" file" |
| `./ops/harness/verify.sh` | "Arnés OK". El WARN "se tocó el bot" sale de las carpetas `apps/bot/.whatsapp-auth.vieja*` sin trackear (ajenas); no toqué el bot |

Los dos últimos ajustes (el `aria-label` del diálogo y el `scroll-pb-48`) son una expresión de texto y una clase de
Tailwind, hechos después de las builds. Después de ellos pasaron `typecheck` de web, lint y los tests del buscador. No
cambian imports ni exports, así que no afectan la regla de Turbopack.

No había `next dev` de NutriBot corriendo (el :3000 es de otro proyecto, Evidentia), igual las builds se hicieron en una
copia que después se borró.

### Portal contra la base (build de producción, sin WhatsApp)

Sobre el build de Turbopack de la copia, `next start -p 3107`. Un script del scratchpad (no queda en el repo) creó: receta
"Prueba 018c2 Panqueques" (fuente, preparación y tips con marcas únicas, un ingrediente c.n.), paciente "Prueba HU-018c2"
(teléfono ficticio 5490000018005), plan ACTIVE con la receta en el Desayuno de los 7 días. Token con
`createPatientToken` (HMAC, no escribe nada) → `/portal/login?token=…` → `/portal/plan` (200):
- Se ve el nombre, "1 porción (2 panqueques)", "Fuente: FuentePrueba" y el botón "Ver receta".
- El payload RSC trae el detalle para el sheet (preparación, tips, el ingrediente c.n.).
- `perPortion`: 0 apariciones. Los ítems de receta llegan con `"macros":null,"kcalBreakdown":null` y
  `"macrosIncomplete":false`.

Limpieza por id (plan, paciente, receta). **Incidente menor, resuelto:** la primera corrida de ese script falló después de
crear la receta (`publishRecipe` sobre una receta que `createRecipe` ya deja publicada) y la segunda creó otra antes de
fallar igual. Las dos (`cmuu27it80001tqouf9prxh50` y `cmuu27ojz000111uq83mw0dfg`, ambas "Prueba 018c2 Panqueques") se
borraron por id. Después no quedó ninguna receta "Prueba%".

**Conteos de control** (`Recipe | NutritionPlan | PlanMealItem | ítems de receta | ítems de receta en plantillas | Patient |
OutboundMessage | PlanTemplate`):
- Antes: `9 | 11 | 132 | 1 | 0 | 21 | 12 | 0`. Después de todo: `9 | 11 | 132 | 1 | 0 | 21 | 12 | 0`.
- Desde 018c-1 la base cambió por uso del usuario (un plan más con 1 ítem de receta). No es mío y no lo toqué.
- No se corrió `db:seed`, no se encoló nada en `OutboundMessage`, no hubo WhatsApp ni IA.

### Pendiente para el orquestador (SDD 12.2, pasos 16 a 18 en Chrome)

- Mirar el diálogo del buscador (tocar la foto de una tarjeta → detalle, impacto, "Agregar a Desayuno · Martes", Escape
  vuelve a la grilla en el mismo lugar) y el sheet "Ver receta" del portal a 390 px. No hice el recorrido visual en el
  navegador.
- **PDF:** no lo generé (la generación del panel pide sesión de Google). La línea de receta la cubre
  `plan-pdf.test.tsx`, que no cambió en 018c-2. Si se quiere ver el PDF real, hay que hacerlo en el recorrido con un plan
  de prueba.
- D10 (paso 18) no cambió en 018c-2.

### Archivos de 018c-2

Nuevos: `packages/db/domain/planTemplates.test.ts`, `apps/web/src/components/recipes/recipe-detail-body.tsx` (+ test),
`apps/web/src/components/recipe-picker/recipe-preview-dialog.tsx`, `apps/web/src/app/(portal)/portal/plan/portal-recipe-sheet.tsx`,
`apps/web/src/lib/portal-recipe.ts` (+ test).

Modificados: `packages/core/src/recipe-picker.ts` (+ test), `packages/db/domain/recipes.ts` (+ test),
`packages/db/scripts/test-recipe-picker.ts` (paso 10), `apps/web/src/app/(panel)/recipe-picker-actions.ts` (+ test),
`apps/web/src/components/recipe-picker/{types.ts,recipe-picker-sheet.tsx,recipe-meal-item.tsx}`,
`apps/web/src/app/(portal)/portal/plan/{page.tsx,plan-view.tsx,portal-day-view.tsx}`.

Commits (locales, sin push): los dos WIP (`2f44c77`, `bbb7a68`), "HU-018c: detalle de la receta en el buscador y en el
portal" (las dos correcciones de accesibilidad) y "HU-018c: verificación de 018c-2" (este reporte).

Para el PR (aviso a Leo): en su zona, 018c-2 solo toca el portal (`page.tsx`, `plan-view.tsx` y `portal-day-view.tsx`:
la prop `recipes` y "Ver receta"). `meals-editor.tsx`, `plan-pdf.tsx`, `nutritionPlans.ts` y `planTemplates.ts` no
cambian. Hay un test nuevo, `planTemplates.test.ts`.
