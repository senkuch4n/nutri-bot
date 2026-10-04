# Review — HU-018d (entrega 018d-1a, medidas caseras)

**Veredicto:** APPROVED

Alcance revisado: `git diff 833c107..HEAD` sin `progress/` ni `backlog/` (44 archivos, +3160/−83), contra
la SDD `Refactorizaciones/medidas-caseras.md` (sección 9: corte 1a = fases A–F; "Decisiones": T1–T17
aceptadas) y la HU `docs/hu-medidas-caseras.md`. Reviewer: Opus, 2026-10-04. Solo lectura de código y
de la base (no corrí scripts contra la base).

Verificación propia:
- `npm run typecheck`: core, db, bot y web limpios (exit 0).
- `npm run test`: 110 archivos, 1809 tests OK (exit 0).
- `./ops/harness/verify.sh`: "Arnés OK", exit 0. El `[WARN] Se tocó el bot` viene del diff de la rama
  contra `develop` (018c): `git diff 833c107..HEAD -- apps/bot` está vacío.

## Checkpoints

### C1 — Arnés
- Backlog válido, 1 HU activa por responsable: [x] (verify.sh: "30 HU; senkuch4n: HU-018d"; `HU-018d.json` en `en_revision`).
- `progress/current-senkuch4n.md` refleja la HU: [x].
- No toca HU de la otra persona: [x] (fuera de `apps/` y `packages/` solo cambian `backlog/HU-018d.json` y `progress/*HU-018d*`, `current-senkuch4n.md`).
- `verify.sh` con exit 0: [x].

### C2 — Documentos
- HU completa: [x] `docs/hu-medidas-caseras.md`.
- SDD con workspaces, checklist y contrato: [x].
- Firmas y nombres coinciden con el contrato: [x]. Core 4.1 completo (`packages/core/src/household-measures.ts`), textos de `MEASURE_TEXT` iguales a la tabla 4.2 (l. 344-386), domain 5.1 (`packages/db/domain/foodMeasures.ts`: `FOOD_MEASURE_SELECT`, `FoodMeasureRow`, los 3 errores, CRUD, `listMeasuresForPicker` con `food: { source: "SARA2", active: true }` l. 76, `resolveMeasureItem` l. 200), 5.3 (`weeklyMenu.ts`: `MenuItemData`, `ItemRow`, `itemCopyData` l. 136-158, M1/M2 con el mensaje exacto l. 325), 5.4 (tipos de alta y `applyTemplateToPatient` `planTemplates.ts` l. 116-120), 6.1 (tipos en `components/food-measures/types.ts`, actions solo async), 6.2 (`lib/measure-form.ts` con `import "server-only"`), 8.4 (esquema de la foto con `.default(null)`). Lo que falta (`setMeasureItemQuantity`, `setMeasureItemQtyAction`, `StepperControl`, `use-measure-item-qty.ts`, `OwnFoodInput.unitHint` opcional, `unitHintConversion.ts`, aviso "Tenías anotado", sacar `unitHint` del formulario) es de 1b según la sección 9: correcto que no esté.

### C3 — Arquitectura
- Lógica pura en core, base compartida en domain, sin duplicar: [x]. Las dos actions de alta usan el mismo helper `readMeasureFields` y `resolveMeasureItem`.
- Schema/domain: web y bot compilan, consumidores ajustados: [x]. `itemCopyData` es el único lugar que lista los campos, así que `setMealMode`, `copyDay`, `repeatMealInAllDays`, `toSnapshot` y `restoreMealSnapshots` (l. 370) conservan la medida. Las lecturas de ítems usan `include` (escalares completos), así que no hace falta tocar selects. `applyTemplateToPatient` (el único que lista campos a mano) suma los cuatro. El esquema zod `.strict()` de Deshacer (`weekly-menu-actions.ts` l. 98-115) suma los cuatro con default `null` (fotos viejas pasan) y M1/M2. El bot no lee planes ni alimentos.
- Migración: [x]. `20261004174348_food_measures/migration.sql` coincide con 3.2: `CREATE TABLE "FoodMeasure"` (los `NOT NULL` están en una tabla nueva y vacía, sin necesidad de backfill; `createdAt` con default), unique `(foodId, nameKey)`, índice `(foodId, order)`, FK `ON DELETE CASCADE ON UPDATE CASCADE`, y 4 `ADD COLUMN` **nullable y sin default** en `PlanMealItem` y `TemplateMealItem` con los tipos del schema (`DECIMAL(4,2)`, `TEXT`, `TEXT`, `DECIMAL(6,1)`). Sin `DROP`, sin `ALTER COLUMN`, sin cambios en otras tablas; `Food.unitHint` intacta. Las filas existentes quedan en NULL = "ítem en gramos". El schema cambió solo en las 47 líneas de la SDD 3.1.
- Auth / portal: [x]. No hay rutas nuevas. Las 4 actions nuevas chequean `hasPanelSession()` antes de todo (`food-measure-actions.ts` l. 81, 100, 114, 131). El portal no cambia de consulta: suma solo la rama de presentación en `portal-day-view.tsx` y la medida es una copia del ítem del propio plan (no viajan ids nuevos). `portalMealsForClient` pasa `measure` sin cambios, como pide 7.7.
- Bot en silencio / textos: [x] (no aplica: el bot no se toca, no se encola nada en `OutboundMessage`).
- Sin `console.log` de debug ni TODOs: [x]. Los `console.log` del diff son la salida del script `packages/db/scripts/test-food-measures.ts`, que es intencional. Las actions loguean solo `errorCode(err)` con `console.error`.

### C4 — Verificación
- `npm run typecheck` limpio: [x] (lo corrí yo).
- Core con tests y `npm run test` en verde: [x]. `household-measures.test.ts` cubre cantidad, plural/singular, validación, textos y `parseUnitHint`. Además hay tests nuevos en domain (`foodMeasures.test.ts`, casos de copia y M1/M2 en `weeklyMenu.test.ts`, `planTemplates.test.ts`) y en web (actions, `measure-form`, foto de Deshacer, `meal-view`, PDF, componentes).
- Flujo del bot simulado: [x] (no aplica). El script contra la base (`test-food-measures.ts`) limpia solo por id (l. 59-62) y crea sus propios alimentos, paciente, plan y plantilla.
- PDF verificado en el resultado real: [ ] **(no bloqueante)**. `plan-pdf.test.tsx` verifica el texto "1½ tazas (270 g)" sobre el árbol de `PlanDocument`, pero nadie generó el PDF de verdad. El ancho nuevo `itemQtyMeasure: 132` (`plan-pdf.tsx` l. 44) y el portal tampoco se vieron: `progress/recorrido_HU-018d.md` deja sin recorrer los pasos 6-12 de 12.2 (editor, copias, plantilla, portal, PDF). Ver la duda 1.

### C5 — Cierre
- `progress/impl_HU-018d.md` describe lo tocado: [x].
- `progress/review_HU-018d.md` con veredicto: [x] (este archivo).
- Sin scripts sueltos ni datos de prueba: [x]. El único script nuevo está registrado (`test:food-measures`). El recorrido del orquestador informa `FoodMeasure` = 0 al final. No lo verifiqué contra la base: la consigna era no tocarla.

## Cambios requeridos

Ninguno.

## Dudas (no bloqueantes)

1. **Recorrido 12.2, pasos 6-12, pendiente.** Antes de abrir el PR conviene que el orquestador recorra
   el editor (alta en medida casera, "Gramos", crear la medida desde el editor), copiar/repetir/deshacer,
   la plantilla aplicada, el portal y un PDF generado de verdad. Lo cubren el script contra la base y los
   tests, pero falta verlo en pantalla: en particular, el ancho de 132 pt de la columna del PDF y el
   cambio de layout de "Agregar alimento" (zona de Leo, punto 5 de los desvíos).
2. **`measurePlural` puede pasar de 40 caracteres y romper "Deshacer".** El plural automático
   (`resolvedMeasurePlural`, `household-measures.ts` l. 201-204) de un nombre de 38 a 40 caracteres puede
   superar los 40 ("unidad" → "unidades" suma 2 por palabra). Pero el zod de la foto exige
   `measurePlural: z.string().min(1).max(40)` (`weekly-menu-actions.ts` l. 101). Ese ítem haría fallar
   el Deshacer de su comida. Así lo pide la SDD 8.4, no es un desvío del implementer, y es muy poco
   probable con nombres reales. Para 1b se puede subir ese tope (por ejemplo a 80) o acotar el plural
   automático.
3. **El plural automático pluraliza las conjunciones.** `pluralizeWord` (l. 131-148) solo corta en
   preposiciones: "feta fina y larga" da "fetas finas yes largas" y "taza o vaso" da "tazas os vasos".
   Se arregla con el plural a mano (D6) y es raro en la práctica. Si se toca, sumar "y"/"o"/"e"/"u" al
   corte o dejarlas sin cambio.
4. **Medida borrada mientras está abierto el editor.** `addPlanMealItemAction`/`addTemplateMealItemAction`
   no capturan `FoodMeasureNotFoundError` ni el `RangeError` de `resolveMeasureItem` (`planes/[planId]/actions.ts`
   l. 109, `plantillas/actions.ts` l. 101): llegan al error boundary. Es el mismo patrón que ya tiene la
   action con un alimento no SARA 2 (tira `Error`), y la SDD 6.2 no pide otra cosa. Se podría ignorar en
   silencio, como hace con los otros datos inválidos.
5. El toast "Medida guardada" que queda visible (observación del recorrido) no viene de este diff:
   `MeasureFormBody` usa `notify.saved` como el resto del panel. Probablemente es el throttling de la
   pestaña oculta.

---

# Review — HU-018d (entrega 018d-1b, stepper y referencias anotadas)

**Veredicto:** APPROVED

Alcance revisado: `git diff 13a2ff4..HEAD` sin los archivos del arnés (36 archivos de código/README), contra la SDD
`Refactorizaciones/medidas-caseras.md` (fases G y H, "Agregados a 018d-1b" R2–R4, "Decisiones") y la HU
`docs/hu-medidas-caseras.md`. Incluye la mejora del prellenado de "Pasar a medida" (commit `1b7e5d7`, pedida por el
orquestador en el recorrido). Reviewer: Opus, 2026-10-04. Solo lectura: no corrí scripts contra la base.

Verificación propia:
- `npm run typecheck`: core, db, bot y web limpios (exit 0).
- `npm run test`: 113 archivos, 1841 tests OK (exit 0). Coincide con lo declarado.
- `./ops/harness/verify.sh`: "Arnés OK", exit 0. El `[WARN] Se tocó el bot` viene del diff de la rama contra `develop`:
  `git diff 13a2ff4..HEAD -- apps/bot` está vacío.

## Checkpoints

### C1 — Arnés
- Backlog válido, 1 HU activa por responsable: [x] (verify.sh: "30 HU; senkuch4n: HU-018d"; `HU-018d.json` en `en_revision`, `entrega_actual` 018d-1b).
- `progress/current-senkuch4n.md` refleja la HU: [x].
- No toca HU de la otra persona: [x]. Fuera de código solo cambian `backlog/HU-018d.json` y `progress/*HU-018d*`/`current-senkuch4n.md`. Los archivos ajenos sin trackear siguen sin agregar.
- `verify.sh` con exit 0: [x].

### C2 — Documentos
- HU completa: [x].
- SDD con workspaces, checklist y contrato: [x].
- Firmas y nombres coinciden con el contrato: [x].
  - 5.3 `setMeasureItemQuantity(kind, ownerId, itemId, qty): Promise<{ quantityGrams }>` (`packages/db/domain/weeklyMenu.ts` l. 546): valida qty antes de tocar la base (`RangeError`), busca con `{ id, measureName: { not: null }, meal: { [ownerKey]: ownerId } }` (si no → `MealOwnershipError`) y recalcula con los gramos **copiados** del ítem (D4).
  - 5.2 `OwnFoodInput.unitHint?` y `ownFoodData` que solo escribe la clave si viene (`foods.ts` l. 73, 149).
  - 5.4 `convertUnitHints({ apply, foodIds? })` y `UnitHintRow` con los cuatro `kind` (`unitHintConversion.ts`), no exportado desde `domain/index.ts`. Una transacción con apply; en seco no abre transacción.
  - 6.1 `setMeasureItemQtyAction` (`food-measure-actions.ts` l. 156) con el zod pedido (l. 45-50), `hasPanelSession` primero, `revalidateMenuOwner` y `qtyError` en cualquier fallo.
  - 7.5 `StepperControl` (`components/stepper-control.tsx`) con las props de la SDD más `valueClassName` (desvío documentado y razonable: el `min-w` es distinto en porciones y medidas). `PortionStepper` y `MeasureQtyStepper` quedan como envoltorios; `portion-stepper.test.tsx` no cambió.
  - 7.1 `useMeasureItemQty` (mismo patrón que `useRecipePortions`).
  - 3.6 scripts npm `measures:convert-hints` y `:prod` con los comandos exactos.
  - Nombres fuera del contrato, por R2–R4 (que no fijaban nombres): `MEASURE_TEXT.measureGone` con el texto exacto de R4, `resolveFormMeasure`, `AddMealItemResult`, `MeasurePrefill`/`legacyMeasurePrefill`. Todos documentados en el reporte.

### C3 — Arquitectura
- Lógica pura en core, base compartida en domain, sin duplicar: [x]. El parseo vive en `parseUnitHint` (core) y lo usan el script y la tarjeta. La resolución de la medida del alta sigue en un solo helper (`lib/measure-form.ts`) para plan y plantilla.
- Schema/domain: web y bot compilan, consumidores ajustados: [x]. No se tocó `schema.prisma`. `OwnFoodInput.unitHint` pasó a opcional: el único consumidor web (`alimentos/actions.ts`) dejó de mandarlo; `foodImport.ts` no usa `OwnFoodInput`. El bot no lee alimentos ni planes.
- Migraciones: [x] (no aplica: 1b no tiene migración, como pide la sección 9).
- Auth / portal: [x]. No hay rutas nuevas. `setMeasureItemQtyAction` chequea sesión antes de todo y el dominio ata el ítem al dueño. El portal no cambia.
- Bot en silencio / textos: [x] (no aplica).
- Sin `console.log` de debug ni TODOs: [x]. Los `console.log` son la salida intencional de `convert-unit-hints.ts` y `test-food-measures.ts`.

### C4 — Verificación
- `npm run typecheck` limpio: [x] (corrido por mí).
- Core con tests y `npm run test` en verde: [x]. R3 tiene test en core (conjunciones, también en singular) y R2 tiene el peor caso de largo del plural. Además hay tests en domain (`setMeasureItemQuantity`, `foods.test.ts` nuevo, `unitHintConversion.test.ts`: seco, apply con `order` al final, idempotencia por `nameKey`, `foodIds`, nunca actualiza `Food`) y en web (action del stepper, R2 en el zod de la foto, R4 en `measure-form.test.ts` y `food-policy.test.ts`, la tarjeta con el aviso y el prellenado, el ítem con el stepper y el valor optimista).
- Flujo del bot simulado: [x] (no aplica). Los pasos 10–12 de `test-food-measures.ts` limitan la conversión a sus dos alimentos (`foodIds`) y la limpieza sigue siendo por id.
- PDF verificado en el resultado real: [x] (no aplica a 1b: no toca el PDF).

### C5 — Cierre
- `progress/impl_HU-018d.md` describe lo tocado: [x] (sección 018d-1b, con el reporte en seco: 79 · 77 a crear · 2 ilegibles, lo esperado por G5).
- `progress/review_HU-018d.md` con veredicto: [x] (esta sección).
- Sin scripts sueltos ni datos de prueba: [x]. Los dos scripts nuevos están registrados en `package.json`. El test temporal de DOM del implementer se borró (no aparece en el diff). No verifiqué los conteos contra la base (consigna de solo lectura); el reporte los da iguales.

### Checklist de la SDD
- G1 [x] · G2 [x] · G3 [x] (`own-food-form.tsx`, `alimentos/actions.ts` y `[id]/page.tsx` sin `unitHint`; el zod no es `.strict()`, así que una pestaña vieja que lo mande no rompe y domain no lo toca) · G4 [x] (aviso solo sin medidas y con `unitHint` no vacío, `food-measures-card.tsx` l. 52) · G5 [x] (en seco, sin `--apply`, T16) · G6 [x] según el reporte (no corrido por mí) · G7 [x] (README).
- H1: 12.1 [x]; 12.2 pasos 13–17: el recorrido del orquestador cubre solo el 15 (aviso) y la mejora de "Pasar a medida". Ver duda 1.
- R2 [x] `weekly-menu-actions.ts` l. 103 (`max(80)`), con test. El plural escrito a mano sigue topado en 40 por `validateMeasure`, coherente.
- R3 [x] `household-measures.ts` l. 117 y 180. Las conjunciones no se pluralizan ni cortan; las preposiciones siguen cortando.
- R4 [x] `lib/measure-form.ts` l. 33-37 (`FoodMeasureNotFoundError` y `RangeError` → `"gone"`, el resto sigue de largo), `planes/[planId]/actions.ts` l. 110 y `plantillas/actions.ts` l. 102 (revalidan y devuelven `measureGone`), toast en `add-food-form.tsx` (`submit`).
- Prellenado de "Pasar a medida" [x]: `legacyMeasurePrefill` usa `parseUnitHint` y cae a `unitHintPrefillName` si no lo lee. Es un superconjunto del Gherkin ("con el nombre prellenado") y el cuadro valida igual al guardar.

## Cambios requeridos

Ninguno.

## Dudas (no bloqueantes)

1. **Recorrido 12.2, pasos 13–17, casi sin ver en pantalla.** El stepper del ítem en el editor (con la franja del día
   que se actualiza por revalidación), el error del stepper con la red cortada, el toast de R4 y el formulario de un
   PROPIO sin "Unidad de referencia" solo están cubiertos por tests. Junto con los pasos 6–12 de 1a (duda 1 de la
   revisión anterior), conviene recorrerlos antes de abrir el PR.
2. **Clics rápidos en el stepper del ítem.** `useMeasureItemQty` (`use-measure-item-qty.ts`) lanza una action por clic
   sin serializar. Si dos respuestas vuelven en otro orden, la base puede quedar con la cantidad del primer clic
   mientras la pantalla mostró la del segundo hasta que llega la revalidación. Es el mismo patrón que ya tiene
   `useRecipePortions` en 018c, así que no es un desvío de esta entrega. Si molesta en la práctica, se arregla para los
   dos steppers a la vez (deshabilitar mientras `pending` o mandar solo el último valor).
3. **R4 resetea el formulario.** Con el error "Esa medida ya no existe. Elegí otra.", React 19 resetea el form igual
   y ella tiene que volver a elegir el alimento (lo anota el reporte, Decisiones 8). Es aceptable por lo raro del caso.
4. **Aplicar la conversión en dev sigue pendiente del usuario (T16).** El escenario "Convertir las referencias
   legibles" de la HU se cumple recién cuando se corra `measures:convert-hints -- --apply` (77 medidas en PROPIO de
   demo). Avisarlo en el PR y en la nota de despliegue.
