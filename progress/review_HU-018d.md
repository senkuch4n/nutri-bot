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
