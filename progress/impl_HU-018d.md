# Implementación HU-018d — entrega 018d-1a (medidas caseras)

**Estado: done (018d-1a).** Implementer en Opus, 2026-10-04. SDD: `Refactorizaciones/medidas-caseras.md`
(sección 9, fases A–F; T1–T17 aceptadas). HU: `docs/hu-medidas-caseras.md`.
Rama `feat/hu-018d-medidas-caseras` (base 833c107). No se pusheó.

Lo de 018d-1b **no** se tocó: `setMeasureItemQuantity`, `setMeasureItemQtyAction`, `StepperControl`,
stepper en el ítem, `unitHintConversion` y su script, aviso "Tenías anotado", sacar `unitHint` del
formulario de propios y la conversión en dev.

## Commits (uno por fase)

| Commit | Fase | Qué |
|---|---|---|
| `35ea02c` | A | `packages/core/src/household-measures.ts` + test (16 casos, incluye los 55 `unitHint` de la base) + `index.ts` |
| `447f063` | B | `schema.prisma` (modelo `FoodMeasure`, 4 columnas en `PlanMealItem` y `TemplateMealItem`) + migración `20261004174348_food_measures` |
| `6760ce4` | C | `domain/foodMeasures.ts` + test, `weeklyMenu.ts` (tipos, `itemCopyData`, M1/M2), `nutritionPlans.ts`/`planTemplates.ts` (tipos de alta, `applyTemplateToPatient`) + tests. **Incluye 10-E3** (ver Desvíos 1) |
| `892a567` | D | `scripts/test-food-measures.ts` (pasos 1–9) + script npm `test:food-measures` |
| `1188d8c` | E | `food-measures/types.ts`, `MealItemView.measure`, `meal-view.ts`, PDF, portal, `food-measure-actions.ts` (sin la del stepper), `lib/measure-form.ts`, altas de plan y plantilla, `food-policy.test.ts` + tests |
| `3d47d7d` | F1–F3 | `food-catalog.tsx` (medidas por contexto), `food-picker.tsx` (`onValueChange`), `measure-form-dialog.tsx` + test, `food-measures-card.tsx`, montaje en `alimentos/[id]/page.tsx` |
| `3663d41` | F4–F5 | `add-food-form.tsx` (movido + modo medida casera) + test, `measure-qty-stepper.tsx`, `measure-meal-item.tsx` (sin stepper) + test, `meals-editor.tsx`, páginas del plan y de la plantilla |
| (este archivo) | F6 | Verificación de 018d-1a |

44 archivos, +3160 / −83. No se agregaron los archivos ajenos sin trackear. `progress/current-senkuch4n.md`
aparece modificado en el working tree pero no es mío: no lo toqué ni lo commiteé.

## Migración

- P1: `origin/develop` sigue en `524c94a` (#26/#27 sin mergear); su última migración es
  `20261003102553_recipes`, igual a la rama. Sin rebase.
- P2: `prisma migrate status` → "Database schema is up to date!" antes de empezar.
- Respaldo: `~/nutribot-backups/pre-food-measures-20261004-1443.dump` (`pg_dump -Fc`, 4 MB, fuera del repo).
- `--create-only --name food_measures`. SQL revisado contra 3.2: `CREATE TABLE "FoodMeasure"` (grams
  `DECIMAL(6,1) NOT NULL`, order `INTEGER NOT NULL`, createdAt con default, updatedAt `NOT NULL`),
  `FoodMeasure_foodId_order_idx`, `FoodMeasure_foodId_nameKey_key` (unique), FK `ON DELETE CASCADE ON
  UPDATE CASCADE`, y `ADD COLUMN` de `measureQty DECIMAL(4,2)`, `measureName TEXT`, `measurePlural TEXT`,
  `measureGrams DECIMAL(6,1)` (nullable, sin default) en las dos tablas de ítems. Sin `DROP`, sin
  `ALTER COLUMN`, sin otras tablas. Sin drift. Aplicada con `npm run db:migrate`; después `npm run db:generate`.
- Nota: un `prisma format` reformateaba todo el schema (369 líneas de ruido); se revirtió y el schema
  quedó con solo las 47 líneas agregadas.
- Conteos de control (antes / después de migrar / al final de todo):
  `Food 980 · FoodMeasure 0 · PlanMealItem 132 · TemplateMealItem 0 · NutritionPlan 11 · Patient 21 ·
  ítems con medida 0` — iguales en los tres momentos.
- **Hay que reiniciar el dev server del orquestador (:3100)**: el cliente de Prisma se regeneró
  (modelo `FoodMeasure` y columnas nuevas). No lo reinicié.

## Verificación (12.1)

| Comando | Resultado |
|---|---|
| `npm run db:generate` | OK |
| `npm run typecheck` | core, db, bot y web limpios |
| `npm run test` | 110 archivos, **1809 tests OK** |
| `npm run lint --workspace apps/web` | sin warnings nuevos (queda el preexistente de `ajustes/logo-form.tsx` `alt-text`) |
| `prisma migrate status` | 24 migraciones, "Database schema is up to date!" |
| `test:food-measures` ×2 (más una 3ª corrida en la fase D) | OK las veces; conteos antes = después |
| `test:recipe-picker` (018c) | OK |
| `test:recipes` (018a) | OK |
| `tsx scripts/test-weekly-menu.ts` (018b) | OK |
| `./ops/harness/verify.sh` | "Arnés OK". Avisa `[WARN] Se tocó el bot`: viene del diff de la rama contra `develop` (018c); 018d no toca `apps/bot` (`git diff 833c107..HEAD -- apps/bot` vacío) |
| `next build` (webpack, copia en scratchpad) | exit 0. Único aviso: el preexistente de `jose`/Edge Runtime |
| `next build --turbopack` (copia) | "✓ Compiled successfully", exit 0. Compilan `/alimentos/[id]`, `/pacientes/[id]/planes/[planId]`, `/plantillas/[id]`, `/portal/plan`, sin "Only async functions are allowed…" |

La copia del build se borró. No se tocó `apps/web/.next` ni el server de :3100.

`test-food-measures.ts` (pasos 1–9 de 11.4): alta con order 0/1, «Tazá» → `DuplicateFoodMeasureError("taza")`,
reordenar, `resolveMeasureItem` 1½ → 270 g «tazas» y not found con otro alimento, ítem en el Almuerzo
del lunes con los cuatro campos, `copyDay` MON→THU y Deshacer, `repeatMealInAllDays` (7 ítems) y Deshacer,
plantilla EVERY_DAY con «1 cda» → plan aplicado con la medida, `updateFoodMeasure` y `deleteFoodMeasure`
sin tocar el ítem. Datos propios (2 PROPIO inactivos, paciente con `5490000018004`, plan, plantilla),
limpieza solo por id. Sin `OutboundMessage`, sin WhatsApp, sin IA.

Tests nuevos o ampliados: `household-measures.test.ts` (16), `foodMeasures.test.ts` (17),
`weeklyMenu.test.ts` (+6: copias con medida y M1/M2 en la foto), `planTemplates.test.ts` (+1),
`weekly-menu-actions.test.ts` (+1: foto con medida, 3 de 4, sin alimento, foto vieja), `meal-view.test.ts`
(+2), `plan-pdf.test.tsx` (+1), `food-measure-actions.test.ts` (8), `measure-form.test.ts` (4),
`food-policy.test.ts` (+4 y los mocks), `measure-form-dialog.test.tsx` (4), `add-food-form.test.tsx` (6),
`measure-meal-item.test.tsx` (2).

## Contrato compartido

Los nombres coinciden con la SDD: core 4.1 completo (incluye `parseUnitHint`/`unitHintPrefillName`, A5),
`MEASURE_TEXT` 4.2 (claves y textos exactos, `moveUp`/`moveDown`/`qtyGroupAria` con `{name}`/`{food}`),
domain 5.1 (`FOOD_MEASURE_SELECT`, `FoodMeasureRow`, los 3 errores, `listFoodMeasures`, `listMeasuresForPicker`,
`createFoodMeasure`, `updateFoodMeasure`, `deleteFoodMeasure`, `moveFoodMeasure`, `MeasureItemFields`,
`resolveMeasureItem`), 5.3 (`MenuItemData`, `ItemRow`, `itemCopyData`, M1/M2 con el mensaje exacto),
5.4 (tipos de alta y `applyTemplateToPatient`), 6.1 (tipos en `components/food-measures/types.ts`;
las 4 actions de medidas), 6.2 (`readMeasureFields`), 8.4 (esquema de la foto). Pendientes de 1b por
el corte: `setMeasureItemQuantity`, `setMeasureItemQtyAction`, `use-measure-item-qty.ts`, `StepperControl`,
`OwnFoodInput.unitHint` opcional y `unitHintConversion.ts`.

## Desvíos y decisiones no obvias

1. **10-E3 (esquema zod de la foto de Deshacer) entró en el commit de la fase C**, no en la E: al ampliar
   `MenuItemData`, `apps/web` dejaba de compilar. Así cada commit compila.
2. **`MeasureQtyStepper` en 1a, sin `StepperControl`.** El formulario de alta necesita el stepper de
   cantidad (Gherkin "Cantidades posibles"), pero la extracción de `StepperControl` es G2 (1b). Es un
   componente propio con el mismo DOM y estilo que `PortionStepper`; en 1b se unifican.
3. **`FoodOption.kcalPer100?`** (opcional) en `food-catalog.tsx`, y las páginas del plan y de la plantilla
   lo pasan: el cuadro de medida creado desde el editor necesita las kcal para la vista previa
   ("… = 185 g · N kcal"). `food-policy.test.ts` se ajustó (los `toEqual` de `foods` suman `kcalPer100`).
4. **PDF:** el ítem con medida usa una columna más ancha (`itemQtyMeasure`, 132 pt) para que
   "2 unidades medianas (240 g)" no se parta en tres renglones. Los ítems en gramos no cambian.
5. **Layout del alta (zona de Leo):** "Alimento" ocupa ahora el renglón entero y "Cantidad" va debajo (antes
   estaban lado a lado), porque en medida casera la fila es stepper + medida + "= 270 g" y el selector
   segmentado va "debajo de Alimento" (7.4). En gramos, el campo de gramos queda debajo, angosto (`sm:w-36`).
   El rótulo "Cantidad" del stepper no es un `<label>` (tocarlo apretaría el "−").
6. **El cuadro de medida se dibuja fuera del `<form>` de "Agregar alimento"** (tiene su propio formulario;
   además `preventDefault` + `stopPropagation`).
7. **Tests de componentes con HTML estático** (`renderToStaticMarkup`), como el resto del repo (no hay
   Testing Library ni DOM). Para probar los estados se exportan `QuantityFields` (de `add-food-form.tsx`)
   y `MeasureFormBody` (de `measure-form-dialog.tsx`). Los clics (chip, "+") no se pueden simular; el
   "+" se prueba con `stepMeasureQty` + la prop `qty`, y queda para el recorrido 12.2.
8. **`measureQty` viaja con coma** ("1,25") en el hidden; `readMeasureFields` acepta coma o punto
   (la cantidad nunca tiene miles). Los gramos del cuadro se leen igual (el input numérico manda punto).
9. **Plural:** además de "-ión → -iones", cualquier aguda en vocal con tilde + n pierde la tilde
   ("cucharón → cucharones"); el singular hace lo inverso con "-ones". Todos los casos de 11.1 pasan.
10. **`parseUnitHint` sobre la base:** 55 textos distintos, 53 legibles y 2 ilegibles (`"1 lata ≈  lata 473 ml"`,
    `"usar con moderación"`), con los resultados de T3 (división y singular). La SDD dice "77 legibles"
    contando alimentos (79 filas), no textos distintos. El reporte en seco del script es de 1b.
11. `moveFoodMeasure`: si dos medidas tuvieran el mismo `order` (no debería pasar), usa las posiciones de
    la lista para que queden correlativas.
12. Autochequeo de UI: se aplicaron los criterios de `apple-design`/`ui-ux-pro-max` (objetivos de 44 px en
    chips, flechas, Editar/Quitar, stepper y select; `aria-live` en la vista previa y en "= 270 g";
    errores debajo de cada campo con `role="alert"`; `aria-label` en los botones de ícono; el cuadro conserva
    el título mientras se cierra). No se invocó el skill `web-design-guidelines`.

## Para el orquestador

- Reiniciar el dev server (:3100) antes del recorrido 12.2 (cliente de Prisma regenerado).
- Recorrido 12.2, pasos 1–12 (1a): pendiente del orquestador. Los datos que cree se borran por id.
- Aviso para el PR (Leo): el formulario "Agregar alimento" se movió a
  `components/food-measures/add-food-form.tsx` (con el cambio de layout del punto 5); el ítem en medida se
  dibuja en `MeasureMealItem`; el PDF y el portal suman una rama por ítem con medida.

---

# 018d-1b (stepper y referencias anotadas)

**Estado: done (018d-1b).** Implementer en Opus, 2026-10-04. Alcance: SDD sección 10, fases G y H, más los
agregados R2–R4 ("Agregados a 018d-1b"). T1–T17 aceptadas. Skills: `apple-design` y `ui-ux-pro-max` (antes del
JSX) y `web-design-guidelines` como autochequeo. **Sin migración**: no se tocó `schema.prisma`. No se pusheó.

## Commits

| Commit | Qué |
|---|---|
| `f41764c` | Fase G: `setMeasureItemQuantity`, `setMeasureItemQtyAction`, `StepperControl` + envoltorios, stepper en el ítem, `unitHint` opcional en domain y fuera del formulario, aviso "Tenías anotado", `unitHintConversion` + script + scripts npm, `test-food-measures` pasos 10–12, README |
| `0ba6526` | R2–R4 (commit aparte) |
| (este archivo) | Fase H: verificación de 018d-1b |

Se comprobó que el commit de G compila y pasa los tests solo, sin R2–R4 (typecheck limpio, 113 archivos /
1830 tests). `meals-editor.tsx` tiene un cambio de cada commit: en G entró solo `kind={kind}` para
`MeasureMealItem`; el tipo `AddMealItemResult` entró en el de R2–R4. No se agregaron los archivos ajenos
sin trackear.

## Archivos

Fase G:
- `packages/db/domain/weeklyMenu.ts` (+ test): `setMeasureItemQuantity(kind, ownerId, itemId, qty)`. Busca
  `{ id, measureName: { not: null }, meal: { [ownerKey]: ownerId } }`, si no hay → `MealOwnershipError`. Si la
  cantidad no vale → `RangeError` (antes de tocar la base). Actualiza `{ measureQty, quantityGrams }` con
  `measureItemGrams(qty, measureGrams del ítem)`.
- `packages/db/domain/foods.ts` (+ `foods.test.ts`, nuevo): `OwnFoodInput.unitHint?` y `ownFoodData` solo
  escribe la clave si viene.
- `packages/db/domain/unitHintConversion.ts` (+ test, nuevo; **no** exportado desde `domain/index.ts`).
- `packages/db/scripts/measures/convert-unit-hints.ts` (nuevo); `packages/db/package.json`:
  `measures:convert-hints` y `measures:convert-hints:prod`.
- `packages/db/scripts/test-food-measures.ts`: pasos 10–12.
- `apps/web/src/app/(panel)/food-measure-actions.ts` (+ test): `setMeasureItemQtyAction`, zod
  `qty: number().min(0.25).max(20).multipleOf(0.25)`, `kind: enum(["plan","template"])`, `revalidateMenuOwner`.
  Si algo falla → `MEASURE_TEXT.qtyError`.
- `apps/web/src/components/stepper-control.tsx` (nuevo): `StepperControl` con las props de 7.5, más
  `valueClassName` para el ancho mínimo.
- `components/recipe-picker/portion-stepper.tsx` y `components/food-measures/measure-qty-stepper.tsx`: ahora
  envuelven `StepperControl`. El DOM es **byte a byte igual** al de antes: lo comparé con `renderToStaticMarkup`
  contra las versiones de `HEAD` (8 valores × habilitado/deshabilitado), con un test temporal que después borré.
  `portion-stepper.test.tsx` no cambió.
- `components/food-measures/use-measure-item-qty.ts` (nuevo): `useOptimistic` + `useTransition`, toast con el
  error. Es el patrón de `useRecipePortions`.
- `components/food-measures/measure-meal-item.tsx` (+ test): prop `kind`, stepper, cantidad/gramos/macros
  optimistas; "Quitar" con 44 px.
- `components/food-measures/food-measures-card.tsx` (+ `food-measures-card.test.tsx`, nuevo): prop `unitHint`
  y aviso.
- `alimentos/own-food-form.tsx`, `alimentos/actions.ts`, `alimentos/[id]/page.tsx`: sin `unitHint` en el
  formulario ni en el zod. La página le pasa `food.unitHint` a la tarjeta.
- `components/meals-editor.tsx`: `kind={kind}` a `MeasureMealItem`.
- `README.md`: un renglón en "Despliegue".

R2–R4:
- `weekly-menu-actions.ts` (+ test): `measurePlural` hasta 80 en el zod de la foto.
- `packages/core/src/household-measures.ts` (+ test): conjunciones (R3) y `MEASURE_TEXT.measureGone` (R4).
- `lib/measure-form.ts` (+ test): `resolveFormMeasure(foodId, fields)` → los campos de la medida o `"gone"`.
- `planes/[planId]/actions.ts`, `plantillas/actions.ts`: `Promise<AddMealItemResult | void>`. Si la medida
  está `"gone"`, revalidan y devuelven `{ ok: false, error: MEASURE_TEXT.measureGone }`.
- `components/food-measures/types.ts`: `AddMealItemResult`. `add-food-form.tsx`: envuelve la action y muestra
  el error en un toast. `meals-editor.tsx`: tipos de la prop.
- `lib/food-policy.test.ts`: caso R4 (not found y `RangeError` → mensaje sin escribir; otro error sigue de largo).

## Verificación (12.1)

| Comando | Resultado |
|---|---|
| `npm run typecheck` | core, db, bot y web limpios |
| `npm run test` | 113 archivos, **1838 tests OK** |
| `npm run lint --workspace apps/web` | Sin warnings nuevos. Queda solo el preexistente `ajustes/logo-form.tsx` `alt-text` |
| `prisma migrate status` | 24 migraciones, "Database schema is up to date!" (sin migración nueva) |
| `test:food-measures` ×2 seguidas | OK las dos, pasos 1–12. Conteos antes = después |
| `test:recipe-picker` (018c) | OK |
| `test:recipes` (018a) | OK. El `prisma:error` del paso 6 es la FK que el script provoca a propósito |
| `tsx scripts/test-weekly-menu.ts` (018b) | OK |
| `measures:convert-hints` (EN SECO) | 79 alimentos · 77 a crear · 0 ya tenían · 2 ilegibles. `FoodMeasure` sigue en 0. Reporte abajo |
| `./ops/harness/verify.sh` | "Arnés OK". El `[WARN] Se tocó el bot` viene del diff de la rama contra `develop` (018c): 018d no toca `apps/bot` |
| `next build` (webpack, copia en el scratchpad) | exit 0. Único aviso: el preexistente de `jose`/Edge Runtime |
| `next build --turbopack` (copia) | "✓ Compiled successfully", exit 0. Compilan `/alimentos/[id]`, `/pacientes/[id]/planes/[planId]`, `/plantillas/[id]` y `/portal/plan`, sin "Only async functions are allowed…" |

La copia del build se borró. No se tocó `apps/web/.next` ni el server de :3100. El cliente de Prisma no se
regeneró (no hubo cambios de schema), así que no hace falta reiniciar el server.

Conteos de control (solo lectura), antes, entre corridas y al final: `Food 980 · FoodMeasure 0 · PlanMealItem 132 ·
TemplateMealItem 0 · NutritionPlan 11 · Patient 21 · ítems con medida 0 · OutboundMessage 12`. Iguales siempre.
Hubo dos corridas fallidas de `test-food-measures` mientras ajustaba el paso 12 (una aserción mía sobre `order`,
ver Decisiones 5). Las dos limpiaron por id en el `finally`, con conteos iguales. No se encoló nada en
`OutboundMessage`, no hubo WhatsApp ni IA, y no se corrió `db:seed`. La conversión **no** se aplicó (`--apply`
nunca se corrió contra la base de dev). La escritura solo se probó dentro de `test-food-measures.ts`, sobre sus
dos alimentos (`foodIds`).

Pasos nuevos de `test-food-measures.ts`:
- 10: `setMeasureItemQuantity` a 2 da 360 g (con los 180 copiados, no los 160 de la medida editada y borrada).
  Con otro plan → `MealOwnershipError`. Con 1,3 → `RangeError`, sin escribir.
- 11: `convertUnitHints` en seco → arroz `WOULD_CREATE taza = 180 g`, ilegible `UNREADABLE`, sin escrituras.
- 12: con apply → 1 `CREATED` al final de la lista. La segunda vez da `ALREADY_HAD` (idempotente) y `unitHint`
  queda intacto.

### Reporte en seco de la conversión de `unitHint` (base de dev, 2026-10-04)

```


Conversión de unitHint (EN SECO: no se escribe nada)

┌─────────┬─────────────────────────────────┬──────────┬────────────────────────────────┬──────────────────────────────┐
│ (index) │ alimento                        │ fuente   │ unitHint                       │ resultado                    │
├─────────┼─────────────────────────────────┼──────────┼────────────────────────────────┼──────────────────────────────┤
│ 0       │ 'Aceite de girasol'             │ 'PROPIO' │ '1 cucharadita ≈ 5 ml'         │ 'cucharadita = 5 g'          │
│ 1       │ 'Aceite de oliva'               │ 'PROPIO' │ '1 cucharadita ≈ 5 ml'         │ 'cucharadita = 5 g'          │
│ 2       │ 'Aceitunas verdes'              │ 'PROPIO' │ '6 unidades ≈ 25 g'            │ 'unidad = 4,2 g'             │
│ 3       │ 'Agua'                          │ 'PROPIO' │ '1 vaso ≈ 250 ml'              │ 'vaso = 250 g'               │
│ 4       │ 'Alfajor de chocolate'          │ 'PROPIO' │ '1 unidad ≈ 50 g'              │ 'unidad = 50 g'              │
│ 5       │ 'Almendras'                     │ 'PROPIO' │ '1 puñado ≈ 30 g'              │ 'puñado = 30 g'              │
│ 6       │ 'Arroz blanco cocido'           │ 'PROPIO' │ '1 taza ≈ 180 g'               │ 'taza = 180 g'               │
│ 7       │ 'Arroz integral cocido'         │ 'PROPIO' │ '1 taza ≈ 180 g'               │ 'taza = 180 g'               │
│ 8       │ 'Arvejas cocidas'               │ 'PROPIO' │ '1 taza ≈ 160 g'               │ 'taza = 160 g'               │
│ 9       │ 'Atún al natural escurrido'     │ 'PROPIO' │ '1 lata escurrida ≈ 170 g'     │ 'lata escurrida = 170 g'     │
│ 10      │ 'Avena arrollada'               │ 'PROPIO' │ '3 cucharadas ≈ 30 g'          │ 'cucharada = 10 g'           │
│ 11      │ 'Azúcar'                        │ 'PROPIO' │ '1 cucharadita ≈ 5 g'          │ 'cucharadita = 5 g'          │
│ 12      │ 'Banana'                        │ 'PROPIO' │ '1 unidad mediana ≈ 120 g'     │ 'unidad mediana = 120 g'     │
│ 13      │ 'Batata cocida'                 │ 'PROPIO' │ '1 unidad mediana ≈ 180 g'     │ 'unidad mediana = 180 g'     │
│ 14      │ 'Brócoli'                       │ 'PROPIO' │ '1 taza ≈ 150 g'               │ 'taza = 150 g'               │
│ 15      │ 'Café con leche'                │ 'PROPIO' │ '1 taza ≈ 200 ml'              │ 'taza = 200 g'               │
│ 16      │ 'Caldo de verduras'             │ 'PROPIO' │ '1 taza ≈ 250 ml'              │ 'taza = 250 g'               │
│ 17      │ 'Carne picada magra'            │ 'PROPIO' │ '1 hamburguesa casera ≈ 120 g' │ 'hamburguesa casera = 120 g' │
│ 18      │ 'Cebolla'                       │ 'PROPIO' │ '1 unidad mediana ≈ 110 g'     │ 'unidad mediana = 110 g'     │
│ 19      │ 'Cerveza rubia'                 │ 'PROPIO' │ '1 lata ≈  lata 473 ml'        │ 'no se puede leer'           │
│ 20      │ 'Chocolate amargo 70%'          │ 'PROPIO' │ '2 cuadraditos ≈ 10 g'         │ 'cuadradito = 5 g'           │
│ 21      │ 'Clara de huevo'                │ 'PROPIO' │ '1 clara ≈ 30 g'               │ 'clara = 30 g'               │
│ 22      │ 'Dulce de leche'                │ 'PROPIO' │ '1 cucharada ≈ 20 g'           │ 'cucharada = 20 g'           │
│ 23      │ 'Durazno'                       │ 'PROPIO' │ '1 unidad ≈ 150 g'             │ 'unidad = 150 g'             │
│ 24      │ 'Fideos de trigo cocidos'       │ 'PROPIO' │ '1 plato ≈ 200 g'              │ 'plato = 200 g'              │
│ 25      │ 'Flan casero con caramelo'      │ 'PROPIO' │ '1 porción ≈ 120 g'            │ 'porción = 120 g'            │
│ 26      │ 'Frutilla'                      │ 'PROPIO' │ '1 taza ≈ 150 g'               │ 'taza = 150 g'               │
│ 27      │ 'Galletitas de agua'            │ 'PROPIO' │ '4 unidades ≈ 25 g'            │ 'unidad = 6,3 g'             │
│ 28      │ 'Garbanzos cocidos'             │ 'PROPIO' │ '1 taza ≈ 165 g'               │ 'taza = 165 g'               │
│ 29      │ 'Gaseosa cola'                  │ 'PROPIO' │ '1 vaso ≈ 250 ml'              │ 'vaso = 250 g'               │
│ 30      │ 'Gelatina sin azúcar preparada' │ 'PROPIO' │ '1 porción ≈ 125 g'            │ 'porción = 125 g'            │
│ 31      │ 'Helado de crema'               │ 'PROPIO' │ '1 bocha ≈ 60 g'               │ 'bocha = 60 g'               │
│ 32      │ 'Huevo entero'                  │ 'PROPIO' │ '1 huevo mediano ≈ 50 g'       │ 'huevo mediano = 50 g'       │
│ 33      │ 'Hummus'                        │ 'PROPIO' │ '2 cucharadas ≈ 30 g'          │ 'cucharada = 15 g'           │
│ 34      │ 'Jugo de naranja natural'       │ 'PROPIO' │ '1 vaso ≈ 200 ml'              │ 'vaso = 200 g'               │
│ 35      │ 'Kiwi'                          │ 'PROPIO' │ '1 unidad ≈ 75 g'              │ 'unidad = 75 g'              │
│ 36      │ 'Kéfir natural'                 │ 'PROPIO' │ '1 vaso ≈ 200 ml'              │ 'vaso = 200 g'               │
│ 37      │ 'Leche chocolatada'             │ 'PROPIO' │ '1 vaso ≈ 200 ml'              │ 'vaso = 200 g'               │
│ 38      │ 'Leche descremada'              │ 'PROPIO' │ '1 vaso ≈ 200 ml'              │ 'vaso = 200 g'               │
│ 39      │ 'Leche entera'                  │ 'PROPIO' │ '1 vaso ≈ 200 ml'              │ 'vaso = 200 g'               │
│ 40      │ 'Lentejas cocidas'              │ 'PROPIO' │ '1 taza ≈ 200 g'               │ 'taza = 200 g'               │
│ 41      │ 'Licuado de banana con leche'   │ 'PROPIO' │ '1 vaso ≈ 250 ml'              │ 'vaso = 250 g'               │
│ 42      │ 'Mandarina'                     │ 'PROPIO' │ '1 unidad ≈ 90 g'              │ 'unidad = 90 g'              │
│ 43      │ 'Manzana'                       │ 'PROPIO' │ '1 unidad mediana ≈ 180 g'     │ 'unidad mediana = 180 g'     │
│ 44      │ 'Maní tostado'                  │ 'PROPIO' │ '1 puñado ≈ 30 g'              │ 'puñado = 30 g'              │
│ 45      │ 'Mate cocido sin azúcar'        │ 'PROPIO' │ '1 taza ≈ 200 ml'              │ 'taza = 200 g'               │
│ 46      │ 'Mayonesa'                      │ 'PROPIO' │ '1 cucharada ≈ 15 g'           │ 'cucharada = 15 g'           │
│ 47      │ 'Mermelada de durazno'          │ 'PROPIO' │ '1 cucharada ≈ 20 g'           │ 'cucharada = 20 g'           │
│ 48      │ 'Miel'                          │ 'PROPIO' │ '1 cucharada ≈ 20 g'           │ 'cucharada = 20 g'           │
│ 49      │ 'Mostaza'                       │ 'PROPIO' │ '1 cucharadita ≈ 5 g'          │ 'cucharadita = 5 g'          │
│ 50      │ 'Naranja'                       │ 'PROPIO' │ '1 unidad mediana ≈ 180 g'     │ 'unidad mediana = 180 g'     │
│ 51      │ 'Nueces'                        │ 'PROPIO' │ '1 puñado ≈ 30 g'              │ 'puñado = 30 g'              │
│ 52      │ 'Palta'                         │ 'PROPIO' │ '1/2 unidad ≈ 100 g'           │ 'unidad = 200 g'             │
│ 53      │ 'Pan francés'                   │ 'PROPIO' │ '1 unidad chica ≈ 50 g'        │ 'unidad chica = 50 g'        │
│ 54      │ 'Pan integral'                  │ 'PROPIO' │ '1 fetita ≈ 25 g'              │ 'fetita = 25 g'              │
│ 55      │ 'Papa hervida'                  │ 'PROPIO' │ '1 unidad mediana ≈ 150 g'     │ 'unidad mediana = 150 g'     │
│ 56      │ 'Pasta de maní'                 │ 'PROPIO' │ '1 cucharada ≈ 15 g'           │ 'cucharada = 15 g'           │
│ 57      │ 'Pechuga de pollo cocida'       │ 'PROPIO' │ '1 filete ≈ 150 g'             │ 'filete = 150 g'             │
│ 58      │ 'Pera'                          │ 'PROPIO' │ '1 unidad mediana ≈ 170 g'     │ 'unidad mediana = 170 g'     │
│ 59      │ 'Pescado merluza'               │ 'PROPIO' │ '1 filet ≈ 180 g'              │ 'filet = 180 g'              │
│ 60      │ 'Pickles'                       │ 'PROPIO' │ '1 porción ≈ 50 g'             │ 'porción = 50 g'             │
│ 61      │ 'Polenta cocida'                │ 'PROPIO' │ '1 taza ≈ 240 g'               │ 'taza = 240 g'               │
│ 62      │ 'Porotos blancos cocidos'       │ 'PROPIO' │ '1 taza ≈ 180 g'               │ 'taza = 180 g'               │
│ 63      │ 'Queso cremoso'                 │ 'PROPIO' │ '1 feta ≈ 25 g'                │ 'feta = 25 g'                │
│ 64      │ 'Queso parmesano'               │ 'PROPIO' │ '1 cucharada ≈ 10 g'           │ 'cucharada = 10 g'           │
│ 65      │ 'Queso port salut light'        │ 'PROPIO' │ '1 feta ≈ 25 g'                │ 'feta = 25 g'                │
│ 66      │ 'Quinoa cocida'                 │ 'PROPIO' │ '1 taza ≈ 185 g'               │ 'taza = 185 g'               │
│ 67      │ 'Ricota'                        │ 'PROPIO' │ '2 cucharadas ≈ 50 g'          │ 'cucharada = 25 g'           │
│ 68      │ 'Sal fina'                      │ 'PROPIO' │ 'usar con moderación'          │ 'no se puede leer'           │
│ 69      │ 'Salsa de tomate'               │ 'PROPIO' │ '1/2 taza ≈ 125 g'             │ 'taza = 250 g'               │
│ 70      │ 'Semillas de chía'              │ 'PROPIO' │ '1 cucharada ≈ 12 g'           │ 'cucharada = 12 g'           │
│ 71      │ 'Semillas de girasol'           │ 'PROPIO' │ '1 cucharada ≈ 10 g'           │ 'cucharada = 10 g'           │
│ 72      │ 'Tomate'                        │ 'PROPIO' │ '1 unidad mediana ≈ 120 g'     │ 'unidad mediana = 120 g'     │
│ 73      │ 'Uva'                           │ 'PROPIO' │ '1 taza ≈ 150 g'               │ 'taza = 150 g'               │
│ 74      │ 'Vinagre de manzana'            │ 'PROPIO' │ '1 cucharada ≈ 15 ml'          │ 'cucharada = 15 g'           │
│ 75      │ 'Vino tinto'                    │ 'PROPIO' │ '1 copa ≈ 150 ml'              │ 'copa = 150 g'               │
│ 76      │ 'Yogur descremado'              │ 'PROPIO' │ '1 pote ≈ 190 g'               │ 'pote = 190 g'               │
│ 77      │ 'Yogur natural entero'          │ 'PROPIO' │ '1 pote ≈ 190 g'               │ 'pote = 190 g'               │
│ 78      │ 'Zanahoria'                     │ 'PROPIO' │ '1 unidad mediana ≈ 70 g'      │ 'unidad mediana = 70 g'      │
└─────────┴─────────────────────────────────┴──────────┴────────────────────────────────┴──────────────────────────────┘

79 alimentos con unitHint · 77 medidas a crear · 0 ya tenían la medida · 2 no se pueden leer
Para escribirlas: agregá -- --apply (solo con el OK del usuario).
```

Coincide con lo esperado por la SDD (G5: 77 legibles, 2 ilegibles). Los 79 son PROPIO del seed de demo (T1).
Aplicarlo queda como pendiente del usuario (T16): `npm run measures:convert-hints --workspace packages/db -- --apply`.

## Contrato compartido

Coinciden con la SDD:
- 5.3: `setMeasureItemQuantity(kind, ownerId, itemId, qty): Promise<{ quantityGrams: number }>`.
- 5.2: `OwnFoodInput.unitHint?: string | null`.
- 5.4: `convertUnitHints(params: { apply: boolean; foodIds?: string[] }): Promise<UnitHintRow[]>` y
  `UnitHintRow` con los cuatro `kind`.
- 6.1: `setMeasureItemQtyAction(input: { kind; ownerId; itemId; qty }): Promise<MeasureMutationResult>`.
- 7.1/7.5: `StepperControl` con `value`, `onChange`, `canDecrement`, `canIncrement`, `step`, `format`,
  `groupLabel`, `minusLabel`, `plusLabel`, `disabled` y `className`, más `valueClassName` (ver Decisiones 1).
  `useMeasureItemQty(kind, ownerId, itemId, qty)`.
- 3.6: scripts npm `measures:convert-hints` y `measures:convert-hints:prod`.

Nombres nuevos fuera del contrato (por los agregados R2–R4, que no fijan nombres):
- `MEASURE_TEXT.measureGone` ("Esa medida ya no existe. Elegí otra.", el texto de R4).
- `resolveFormMeasure` en `lib/measure-form.ts`.
- el tipo `AddMealItemResult` en `components/food-measures/types.ts`.

## Decisiones no obvias

1. **`StepperControl.valueClassName`**: es una prop más, fuera de la lista de 7.5. Hace falta porque el ancho
   mínimo del valor es distinto en porciones (`min-w-[6.5rem]`) y en medidas (`min-w-[2.75rem]`, "1¾"). Va
   **antes** de las clases fijas en el `cn(...)`, para que el `class` quede igual que antes (DOM idéntico).
2. **Ítem en medida, mientras hay una transición o la cantidad optimista no es la guardada** (7.6): se oculta el
   popover de Atwater y la línea de macros se muestra en texto (`formatMacrosLine` de los macros escalados con
   `scaleMacros`). Los gramos salen de `measureItemGrams(qty optimista, gramsPerUnit)`. Ya confirmada, se vuelve
   al `quantityGrams` y al desglose del server.
3. El texto "1½ tazas / 270 g" del ítem **no** tiene `aria-live` propio. Ya lo anuncia el valor del stepper, y
   dos regiones vivas leerían lo mismo dos veces. Tiene `max-w-[14rem]` y `break-words`, porque el plural puede
   tener hasta 80 caracteres (autochequeo de `web-design-guidelines`).
4. **Aviso "Tenías anotado"**: si se muestra, reemplaza el texto de vacío ("Todavía no tiene medidas caseras.").
   "Pasar a medida" es un botón secundario de 44 px dentro del `Alert`, y "Agregar medida" queda debajo como
   secundario, para que no haya dos primarios. Con al menos una medida, el aviso no aparece (T5).
5. **Conversión con apply**: la medida nueva va al final (`order` = máximo + 1 de las existentes). En el paso 12
   del script, a "cda" le queda el `order` 1 después de borrar "taza", así que la nueva "taza" queda en 2. La
   primera versión de mi aserción esperaba 0/1 y estaba mal; el comportamiento es el correcto (el mismo de
   `createFoodMeasure`). La conversión lee y escribe dentro de **una** transacción interactiva (`timeout`
   60 s); en seco no abre transacción. Un `unitHint` que pasa `parseUnitHint` igual se vuelve a validar con
   `validateMeasure`. Los `unitHint` de solo espacios se ignoran (no aparecen en el reporte).
6. **R2**: se subió solo el tope del zod de la foto (`measurePlural` ≤ 80). El plural **escrito a mano** sigue
   limitado a 40 por `validateMeasure`. El automático de un nombre de 40 caracteres llega como mucho a 79 (peor
   caso: 20 palabras de una consonante; hay un test en core). La columna es `TEXT`: no hace falta migración.
7. **R3**: las conjunciones (y, o, e, u) no se pluralizan y **no cortan** el plural: "taza o vaso de leche" da
   "tazas o vasos de leche". Las preposiciones siguen cortando. `singularizeMeasureName` usa la misma regla.
8. **R4**: además de `FoodMeasureNotFoundError` se captura el `RangeError`. La SDD pide los dos con el mismo
   mensaje, aunque `readMeasureFields` ya filtra las cantidades inválidas. Antes de devolver el error, la action
   revalida la página, así el editor trae el mapa de medidas actualizado (sin la borrada). Cualquier otro error
   sigue llegando al boundary. El form de React 19 se resetea igual después de la action, así que ella vuelve a
   elegir el alimento.
9. El zod de `alimentos/actions.ts` no es `.strict()`: si una pestaña vieja todavía manda `unitHint`, se descarta
   y domain no lo toca.

## Para el orquestador

- Recorrido 12.2, pasos 13–17 (1b): queda pendiente para el orquestador. El 14 (cortar la red) solo se puede
  ver en Chrome; en los tests, el error del stepper está cubierto en la action y el hook es el mismo patrón que
  `useRecipePortions`.
- Aplicar la conversión en dev (77 medidas en alimentos PROPIO de demo) solo con el OK del usuario (T16).
- (Recorrido del orquestador, commit `HU-018d: Pasar a medida prellena con el unitHint legible`) "Pasar a medida" ahora prellena nombre **y gramos** cuando `parseUnitHint` puede leer el texto ("1 taza ≈ 180 g" → taza / 180; con N ≠ 1, la división de T3). Si no lo puede leer, queda como antes: el texto en el nombre. La función es `legacyMeasurePrefill` (en `food-measures-card.tsx`) y el cuadro acepta `initial: MeasurePrefill { name; grams? }`. Tiene 3 tests nuevos en `food-measures-card.test.tsx`: los legibles, los ilegibles y el cuadro con "2 tazas = 360 g". Verificado: typecheck limpio en los 4 workspaces, 1841 tests OK, lint sin warnings nuevos, `next build` y `--turbopack` en una copia con exit 0.
