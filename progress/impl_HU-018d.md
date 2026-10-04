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
