# Review — HU-018c

## 018c-1 (buscador de recetas dentro de cada comida)

Revisado contra `Refactorizaciones/buscador-recetas.md` (corte 018c-1 = fases A–F, §13 D1–D9 aceptadas, §16) y
`docs/hu-plan-recetas-buscador.md`. Diff `89f850e..HEAD` (8 commits, `e8a38d4` → `fbc62f2`). Reviewer: Opus.

**Veredicto:** APPROVED

### Comandos (corridos por el reviewer, 2026-10-03)

| Comando | Resultado |
|---|---|
| `npm run typecheck` | exit 0 (core, db, web y bot) |
| `npm run test` | 100 archivos, 1712 tests OK |
| `npm run lint --workspace apps/web` | exit 0; 1 warning previo (`ajustes/logo-form.tsx:36`, alt), ninguno nuevo |
| `./ops/harness/verify.sh` | "Arnés OK" (el WARN "se tocó el bot" sale de las carpetas sin trackear `apps/bot/.whatsapp-auth.vieja*`; el diff no toca `apps/bot`) |
| Consulta de solo lectura a la base | 0 recetas "Prueba … 018c", 0 pacientes "Prueba HU-018c", 0 ítems de receta en planes y plantillas, 9 recetas: los datos del recorrido se borraron |

No se corrió `next build` (hay un `next dev` en marcha). La regla de Turbopack se verificó leyendo el código (punto 5).

### Puntos pedidos

1. **Copiar, repetir, deshacer y aplicar plantilla conservan la receta.** OK.
   - `packages/db/domain/weeklyMenu.ts:116-131`: `itemCopyData` copia `recipeId` y `portions`. `setMealMode`, `copyDay`,
     `repeatMealInAllDays` y `restoreMealSnapshots` pasan por esa función (`:154`, `:199`, `:249`, `:270`, `:318`). Los
     ítems se cargan con `include` (fila completa), así que llegan los dos campos.
   - `assertSnapshotInvariants` (`:281-293`) exige el invariante 3-1/3-2 antes de escribir.
   - `planTemplates.ts:108-110`: `applyTemplateToPatient` copia `recipeId` y `portions`.
   - `weekly-menu-actions.ts:94-103`: `snapshotItemSchema` sigue `.strict()` y suma los dos campos con `.default(null)`
     y el `superRefine`.
   - Tests: `weeklyMenu.test.ts:355`, `:377`, `:388` y `weekly-menu-actions.test.ts:90`. La aplicación de la plantilla
     se prueba contra la base en `scripts/test-recipe-picker.ts:185-194`.
2. **Lógica pura (`packages/core/src/recipe-picker.ts`).** OK.
   - **Impacto en el día:** `computeRecipeImpact` (`:182-218`) agrega el ítem `__preview` y recalcula con
     `computeWeeklyTotals`, como pide la semántica de referencia.
   - **Peor día:** `:193-202`, el mayor exceso relativo y, si empatan, el primero de la semana (se recorre `WEEKDAYS`
     y la comparación es estricta `>`).
   - **Promedio semanal en EVERY_DAY:** `referenceMacros`, `:141`.
   - **Opciones:** `optionsAverageKcal` con `mealTotalForDay(withPreview, …)` (`:215`).
   - **±5 %:** se delega en `compareToTarget`; los tests de borde de 63 y 64 g están en `recipe-picker.test.ts:126`.
   - **Momento:** `inferMomentFromMealName` (`:54-63`) busca palabras completas y gana la primera.
   - **Género:** `genderNumberEs` y `agreeParticipleEs` (`:286-298`).
   - El test de equivalencia (`recipe-picker.test.ts:243-314`) compara 30 combinaciones contra una referencia escrita
     aparte.
3. **Seguridad de las actions.** OK.
   - `recipe-picker-actions.ts`: las 4 actions empiezan con `hasPanelSession()` (que llama a `auth()`,
     `recetas/recipe-save.ts:68-71`) y validan con zod antes de llamar al dominio.
   - Las porciones van de ½ en ½ entre ½ y 4 (`:41-44`). Además, el dominio vuelve a validar con `normalizePortions`
     (`weeklyMenu.ts:410-414`).
   - El dueño se verifica en `loadOwnedMeal` (agregar), en el `where` con `meal: { [ownerKey]: ownerId }` (porciones,
     `:481-485`) y en `deleteMany` (quitar, `:494`).
   - Una receta que no está `PUBLISHED` no se agrega: `weeklyMenu.ts:440-443` lanza `RecipeNotAvailableError`, que la
     action convierte en `notPublished`.
   - Las recetas no tienen dueño propio (hay una sola profesional): el "otro dueño" que aplica es el del plan o la
     plantilla, y está cubierto.
   - El log solo lleva `errorCode(err)`, sin el payload.
4. **Contrato web/bot.** OK. `typecheck` limpio en los 4 workspaces. El bot no importa `MenuItemData` ni `getPlan`.
5. **Turbopack.** OK.
   - `recipe-picker-actions.ts` exporta solo 4 `export async function`, y el test de `:56` lo verifica.
   - `weekly-menu-actions.ts` no suma exports: su `export type MenuActionResult` ya estaba en 018b.
   - Los tipos nuevos van en `components/recipe-picker/types.ts`, que no es `"use server"`.
6. **Zona de imleticio.** OK.
   - `meals-editor.tsx` solo suma lo que lista la SDD en 2.1:
     - el campo opcional `recipe`;
     - el botón "Agregar receta" (`:462-468`);
     - la rama de `RecipeMealItem` (`:398-412`);
     - el `RecipePickerSheet` (`:269-278`);
     - el prop `onAddRecipe`.
   - `plan-pdf.tsx` solo suma `RecipeRow` en `ItemRows`.
   - `nutritionPlans.ts` y `planTemplates.ts` solo cambian el `include` y los 2 campos.
   - Sin cambios en el diff: `food-picker.tsx`, `food-catalog.tsx`, `addMealItem`, `addTemplateMealItem`,
     `planes/**/actions.ts`, `plantillas/**`, `schema.prisma` y `apps/bot/**`.
7. **Portal y PDF.** OK.
   - `portal-day-view.tsx:17-38`: miniatura (con la ruta de foto del portal, protegida por
     `patientCanSeeRecipePhoto`), nombre, `recipePortionText` y "Fuente: …". No muestra kcal ni gramos de la receta.
   - La consulta del portal sigue filtrando por `patientId: patient.id` de la sesión (`portal/plan/page.tsx:18`), y
     `RecipeItemView` no lleva ingredientes ni datos de otras recetas.
   - En el PDF, `plan-pdf.tsx:80-93` dibuja el nombre y, debajo, la porción y la fuente. La columna de cantidad queda
     vacía. Lo prueba `plan-pdf.test.tsx`.
8. **UI.** OK.
   - **Sheet:** `side="right"`, `w-full`, `md:w-[min(66vw,64rem)]`. El foco va al buscador solo con `pointer: fine`
     (`recipe-picker-sheet.tsx:233-239`). Escape y el foco de vuelta al botón los maneja el primitivo.
   - **Stepper:** botones `size-11` con `aria-label` y `aria-live` en el valor.
   - **Chips:** `h-11`, con `ariaLabel` largo en los días y el día fijo con `aria-disabled` y candado.
   - **Tarjeta:** botones `size="lg"` y error con `role="alert"`.
   - **Franja:** `role="meter"` con `springs.standard`.
   - Se usan los primitivos y tokens de la HU-017a, sin colores nuevos.

### Checkpoints

- C1 backlog válido, máximo 1 HU activa por responsable: [x] (`verify.sh`: senkuch4n tiene HU-018c)
- C1 `progress/current-senkuch4n.md` refleja la HU: [x]
- C1 no toca HU de la otra persona: [x] (en la zona de Leo solo cambia lo autorizado en la SDD 2.1)
- C1 `verify.sh` termina con exit 0: [x]
- C2 HU completa: [x] `docs/hu-plan-recetas-buscador.md`
- C2 SDD con workspaces, checklist y contrato: [x]
- C2 firmas iguales al contrato: [x]. Desvíos menores y documentados en `impl_HU-018c.md`: `addRecipeItems` es
  `async`, hay helpers de texto extra con test, y `getRecipePreview` y `RecipePreview` se dejan para 018c-2, como
  corresponde
- C3 lógica pura en core y operaciones de base en `domain`, sin duplicar: [x]
- C3 cambio de `domain`: web y bot compilan: [x]
- C3 migraciones: [x] no hay (no aplica)
- C3 rutas del panel con auth; portal con datos propios: [x]
- C3 bot en silencio y textos según la SDD: [x] no se toca el bot
- C3 sin `console.log` de debug ni TODOs: [x]. Los `console.log` del diff son la salida del script
  `scripts/test-recipe-picker.ts`
- C4 `typecheck` limpio: [x]
- C4 tests de core y `npm run test` pasan: [x]
- C4 simulación del bot: [x] no aplica. El script contra la base borra por id en el `finally`
  (`test-recipe-picker.ts:57-60`)
- C4 PDF verificado: [x] con `plan-pdf.test.tsx` (texto del render). El recorrido visual del PDF real quedó como "no
  recorrido" en `progress/recorrido_HU-018c.md`; ver Dudas
- C5 `impl_HU-018c.md` existe y describe lo hecho: [x]
- C5 `review_HU-018c.md` con el veredicto: [x]
- C5 sin scripts sueltos ni datos de prueba en la base: [x] (consulta de solo lectura de arriba)

### Cambios requeridos

Ninguno.

### Dudas (no bloqueantes)

- **Falta el test unitario de `applyTemplateToPatient` con receta** (SDD B4 y 11.2). La copia se verifica contra la
  base en `scripts/test-recipe-picker.ts:185-194` (receta, día y 2 porciones), pero no hay un test con mocks en vitest.
  Conviene sumarlo en 018c-2.
- **El impacto y el texto del botón no miden lo mismo** (`recipe-picker-sheet.tsx:322-325`). Con varios días marcados,
  algunos de los cuales ya tienen la receta, el impacto la evalúa en **todos** los días marcados (`scope.days`), que es
  lo que pide la SDD 4.1. En cambio, el botón y el agregado usan `daysToAdd`, que saltea esos días. En ese caso, el
  "Se pasa … el jueves" puede referirse a un día donde no se va a agregar nada. Es un caso raro (D5).
- **"Quitar" del ítem de receta en el editor** (`recipe-meal-item.tsx:83`): es `SubmitButton size="sm"` (`h-8`, 32 px),
  igual que el "Quitar" de alimentos que ya existía. La SDD 7.2 pide reusar ese botón tal cual, pero queda por debajo
  de los 44 px de la regla general, al lado de un stepper de 44 px.
- **"Quitar" de la tarjeta del buscador** borra sin "Deshacer", igual que el "Quitar" de alimentos. Ya está anotado
  en `impl`.
- **Recorrido incompleto** según `progress/recorrido_HU-018c.md`. No se recorrieron en el navegador:
  - "Entra" / "Se pasa" contra un objetivo;
  - varios días;
  - plantillas;
  - el PDF real;
  - el portal;
  - el celular;
  - el teclado.

  Están cubiertos por tests unitarios y por el script contra la base. Se recomienda que el orquestador (o Leo, en el
  PR) mire al menos el PDF y el portal con un plan de prueba antes del merge.
- **`MealItemView.macros` de los ítems de receta viaja al cliente del portal**, igual que ya pasaba con los
  alimentos. No se muestra, pero la SDD 7.6 (018c-2) busca que los macros de la receta no viajen al navegador del
  paciente. Revisarlo en 018c-2 junto con `PortalRecipeView`.

---

## 018c-2

# Review — HU-018c (018c-2: detalle de la receta + pendientes de 018c-1)

**Veredicto:** APPROVED

Diff revisado: `git diff feat/hu-018c-buscador-recetas...HEAD` (commits `02f5b8f`..`779cb2d`), sin contar
`progress/` ni `backlog/`. Son 20 archivos de código, todos en la lista de la SDD §8.2 (018c-2) o en §17. Se suma
`apps/web/src/lib/portal-recipe.ts` (+ test), que es donde vive `PortalRecipeView` (SDD 7.6). No toca
`schema.prisma`, migraciones, `apps/bot`, `meals-editor.tsx`, `plan-pdf.tsx`, `nutritionPlans.ts`,
`planTemplates.ts` ni `primitives/*`.

Verificación propia (2026-10-04):
- `npm run typecheck`: core, db, bot y web, exit 0.
- `npm run test`: 103 archivos, 1737 tests OK.
- `npm run lint --workspace apps/web`: solo el warning previo (`ajustes/logo-form.tsx:36`).
- `./ops/harness/verify.sh`: "Arnés OK". El WARN "se tocó el bot" sale de las carpetas sin trackear
  `apps/bot/.whatsapp-auth.vieja*`, que no son del diff.
- Base (solo lectura): 0 recetas "Prueba%", 0 pacientes de prueba (`5490000018 00x`). Recipe 9, NutritionPlan 11,
  PlanMealItem 132: iguales a los conteos "después" del implementer.

### Fase G y pendientes de §17, punto por punto

- **G1** `packages/db/domain/recipes.ts:389-472`: `RecipePreview` tiene la forma de la SDD 5.2. `getRecipePreview`
  filtra `status: { not: "DRAFT" }` (`:457`). `listPlanRecipePreviews` usa `planItems: { some: { meal: { planId } } }`,
  no repite recetas porque consulta `Recipe` y no ítems, y ordena por nombre (`:465-471`). El select no pide
  `rawText`, `importHints` ni `published*`, y los nombres salen de `ingredientDisplayName` (`:450`). Tests en
  `recipes.test.ts:295-337` y el paso 10 de `scripts/test-recipe-picker.ts:225-242`, que pasa la receta del propio
  script a DRAFT y la borra por id en el `finally`.
- **G2** `recipe-picker-actions.ts:67-80`: `hasPanelSession` primero, zod del id, `null` → `notPublished`, y el log
  lleva solo `errorCode`. El archivo sigue exportando solo funciones async: lo cubre el test de 018c-1 y los tipos
  quedan en `types.ts:11`.
- **G3** `recipe-detail-body.tsx`: props de la SDD 7.1 más `className`. Con `showMacros={false}` no dibuja kcal
  aunque lleguen los datos (`:43`, test `:51-56`). "Fuente: …" y "Foto: …" salen de `recipeSourceText`/
  `recipePhotoCreditText`, y los ingredientes, de `formatIngredientAmount`. `recipe-preview-dialog.tsx`: es un
  `Dialog` por encima del sheet (el primitivo ya trae `max-h-[90dvh] overflow-y-auto`), tiene skeleton con la foto
  4:3, error con "Reintentar" y un pie fijo con `PickerCard variant="dialog"`, que dice `pickerTitle(...)` o
  "Agregar en N días". `onOpen={setDetailCard}` en `recipe-picker-sheet.tsx:216`. El sheet no se desmonta, así que
  la grilla conserva el scroll.
- **G4** `portal/plan/page.tsx:59-66`: `listPlanRecipePreviews(plan.id)` corre sobre el plan ACTIVE de
  `getPortalPatient()` (`:15-20`), así que no hay ids ajenos en query ni params. `toPortalRecipeView`
  (`lib/portal-recipe.ts:12-30`) arma el objeto campo por campo, sin `perPortion`, `macrosIncomplete` ni `status`.
  "Ver receta" está en `portal-recipe-sheet.tsx` (`Button variant="secondary" size="lg"` y `Sheet side="right"
  w-full sm:max-w-lg`, con `showMacros={false}` y `preparationOpen`).
- **§17.1** `packages/db/domain/planTemplates.test.ts`: test con mocks de `applyTemplateToPatient`. Copia
  `recipeId`, `portions` (2) y `weekday`, y deja el ítem de alimento con `portions: null`. Resuelto.
- **§17.2** `packages/core/src/recipe-picker.ts:97-102` (`scopeForDaysToAdd`) y
  `recipe-picker-sheet.tsx:362-374`: el impacto se recalcula con los mismos días que usa el botón (`daysToAdd`). El
  test `recipe-picker.test.ts:195-212` reproduce el caso de la revisión: el jueves ya la tiene, el resultado deja de
  ser "OVER jueves" y el botón dice "Agregar en 2 días". Resuelto.
- **§17.3** `recipe-meal-item.tsx:77-84`: `className="h-11 px-4"` sobre el `SubmitButton`. Resuelto.
- **§17.4** `lib/portal-recipe.ts:43-56` (`portalMealsForClient`): los ítems de receta viajan con `macros: null`,
  `kcalBreakdown: null` y `macrosIncomplete: false`, y no se modifica lo que recibe. Los totales se calculan antes,
  en el server (`page.tsx:42-54`). `MealItemView.macros` ya era nullable (`meals-editor.tsx:47`). Tests en
  `portal-recipe.test.ts:51-89`. Resuelto.
- **§17.5** Recorrido del portal: hecho por HTTP contra un build de producción con datos propios, borrados por id
  (`impl_HU-018c.md:302-322`). El diálogo del buscador lo recorrió el orquestador (`recorrido_HU-018c.md`, 018c-2).
  Falta el PDF real (ver Dudas).

### Checkpoints

- C1 backlog válido, máximo 1 HU activa por responsable: [x] (`verify.sh`: senkuch4n tiene HU-018c)
- C1 `progress/current-senkuch4n.md` refleja la HU: [x]
- C1 no toca HU de la otra persona: [x]. En la zona de Leo solo cambia el portal (`page`, `plan-view` y
  `portal-day-view`), como autoriza la SDD 2.1. Hay un test nuevo, `planTemplates.test.ts`, y `planTemplates.ts`
  no cambia
- C1 `verify.sh` termina con exit 0: [x]
- C2 HU completa: [x] `docs/hu-plan-recetas-buscador.md`
- C2 SDD con workspaces, checklist y contrato: [x]
- C2 firmas iguales al contrato: [x]. `RecipePreview`, `getRecipePreview`, `listPlanRecipePreviews`,
  `RecipePreviewResult`, `getRecipePreviewAction`, las props de `RecipeDetailBody` y `PortalRecipeView` coinciden.
  Los agregados (`scopeForDaysToAdd`, `recipeYieldText`, `recipeSourceText`, `recipePhotoCreditText` y claves
  nuevas de `RECIPE_PICKER_TEXT`) tienen test y están documentados en `impl`
- C3 lógica pura en core y operaciones de base en `domain`, sin duplicar: [x]
- C3 cambio de `domain`: web y bot compilan: [x] (bot no consume nada nuevo)
- C3 migraciones: [x] no hay (no aplica)
- C3 rutas del panel con auth; portal con datos propios: [x]. No hay rutas nuevas. La action empieza con
  `hasPanelSession`. El portal deriva todo del plan ACTIVE del paciente de la sesión
- C3 bot en silencio y textos según la SDD: [x] no se toca el bot
- C3 sin `console.log` de debug ni TODOs: [x]. Los del diff son la salida del script de verificación
- C4 `typecheck` limpio: [x]
- C4 tests de core y `npm run test` pasan: [x]
- C4 simulación del bot: [x] no aplica. El script contra la base limpia por id
- C4 PDF verificado: [x]. 018c-2 no toca el PDF, y la línea de receta la cubre `plan-pdf.test.tsx` (018c-1). El
  PDF real sigue sin mirarse a ojo (ver Dudas)
- C5 `impl_HU-018c.md` describe lo hecho: [x]
- C5 `review_HU-018c.md` con el veredicto: [x]
- C5 sin scripts sueltos ni datos de prueba en la base: [x] (consulta de solo lectura de arriba)

### Cambios requeridos

Ninguno.

### Dudas (no bloqueantes)

- **Sesión vencida en el diálogo** (`recipe-preview-dialog.tsx:90-100`): cualquier error que no sea `notPublished`
  se muestra como "No se pudo cargar la receta." con "Reintentar", también `sessionExpired`. Reintentar no sirve
  sin sesión. Lo mismo pasaba en la grilla. Es menor.
- **`retry` ignora la cancelación** (`recipe-preview-dialog.tsx:70-75`). Si se cierra y se abre otra receta
  mientras un reintento sigue en vuelo, puede aparecer un error viejo. El caso "ready" está protegido por
  `state.recipe.id === shown.id` (`:88`). Es raro.
- **Texto de error del detalle**: usa `previewLoadError` ("No se pudo cargar la receta.") en vez del `loadError`
  que pide la SDD 7.4. Es un desvío razonable y está documentado en `impl`.
- **Portal**: el total del día que ve el paciente sigue incluyendo las kcal de la receta (018b). Con eso se pueden
  deducir sus kcal restando. Es coherente con la HU, porque los totales del día se muestran, y lo que no viaja es
  el macro por receta.
- **El PDF real no se miró en el navegador** (pendiente §17.5, parte PDF). 018c-2 no lo cambia, pero el pendiente
  venía de 018c-1. Se recomienda que el orquestador, o Leo en el PR, genere el PDF de un plan de prueba con una
  receta antes del merge. Conviene también mirar "Ver receta" del portal a 390 px: el implementer lo verificó por
  HTTP, no visualmente.
