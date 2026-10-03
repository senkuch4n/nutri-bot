# Implementación HU-018b `menu-semanal`

SDD: `Refactorizaciones/menu-semanal.md`. HU: `docs/hu-plan-recetas-buscador.md`.
Rama: `feat/hu-018-plan-recetas-buscador` (con `develop` = `45d3075` adentro; `git fetch` sin novedades).

## 018b-1 (modelo semanal, fases A–D)

**Estado: done.** Implementado por Opus con los skills `migracion-prisma`, `apple-design`,
`ui-ux-pro-max` y `web-design-guidelines`. La 018b-2 (editor semanal, fases E–G) y la sección 13
(HU-015 de Leo) **no** se tocaron. Tampoco `createPlan`, `createTemplate` ni `createPlanForConsultation`,
que siguen sin comidas por defecto (eso es E1).

### Commits (locales, sin push)

| Fase | Commit | Mensaje |
|---|---|---|
| A | `ef4b959` | HU-018b: lógica pura del menú semanal (totales por día, opciones, objetivo ±5 %) |
| B | `e4dfcd9` | HU-018b: migración weekly_menu (modo por comida, opciones y día por ítem) |
| C | `5ffdaf3` | HU-018b: operaciones de menú semanal en domain (copiar, repetir, modo, deshacer, objetivo) |
| D | HEAD de la rama (el que contiene este archivo) | HU-018b: portal, PDF, IA y micronutrientes leen el menú semanal |

### Archivos

**Fase A, `packages/core`**
- `src/weekly-menu.ts` (nuevo): todo lo de 4.1 con los nombres del contrato.
- `src/weekly-menu.test.ts` (nuevo): 19 tests con los casos de 10.1.
- `src/plan-micronutrients.ts`: `weight?` y `amount += value * grams / 100 * (item.weight ?? 1)`.
- `src/plan-micronutrients.test.ts`: 3 casos nuevos (sin `weight` da igual que con `weight` 1; 0,5 da la mitad; 0 cuenta en la cobertura).
- `src/index.ts`: `export * from "./weekly-menu"`.

**Fase B, `packages/db`**
- `prisma/schema.prisma`: enums `MealMode` y `Weekday`, `mode`/`isOptions` en `PlanMeal` y `TemplateMeal`, y `weekday` en `PlanMealItem` y `TemplateMealItem` (3.1). Edité el archivo a mano, sin `prisma format`, para no reformatear el resto del schema.
- `prisma/migrations/20261003090223_weekly_menu/migration.sql` (generada).
- `scripts/test-weekly-menu-migration.ts` (nuevo, 10.3; solo lee).

**Fase C, `packages/db/domain`**
- `weeklyMenu.ts` (nuevo, 5.1): `itemCopyData` es el único lugar que lista los campos copiados.
- `weeklyMenu.test.ts` (nuevo): 22 tests con prisma mockeado (10.2, sin los casos de 018b-2).
- `nutritionPlans.ts`: `addMeal` (`mode`/`isOptions` y el default de 12-D3), `addMealItem` (`weekday` validado con `assertWeekdayMatchesMeal`), `getPlanTarget` y `getPlanConsultationId`. `updateMealItem` mantiene su firma de antes: excluí `weekday` del tipo para que no se pueda saltear la invariante.
- `planTemplates.ts`: `addTemplateMeal`, `addTemplateMealItem` (`weekday`), y `applyTemplateToPatient`, que ahora copia `mode`, `isOptions` y `weekday`.
- `index.ts`: `export * from "./weeklyMenu"`.

**Fase D, `apps/web`**
- `components/meals-editor.tsx` (zona de Leo): **solo los tipos**. `MealView` suma `mode` e `isOptions`, y `MealItemView` suma `weekday`. El componente, sus props y el formulario no cambian.
- `lib/meal-view.ts`:
  - `toMealView` copia los campos nuevos (con defaults si faltan).
  - `toMicronutrientItems` suma `weight` (de `computeWeeklyItemWeights`) solo si recibe `id`, `mode` y `weekday`. Si no los recibe, no agrega la propiedad.
  - Nuevo `toPlanTotals(meals)`: arma los totales de la franja fija.
- `lib/meal-view.test.ts`: 3 casos nuevos.
- `planes/[planId]/actions.ts` y `plantillas/actions.ts`: leen `weekday` del `FormData` (`""` → `null`; un valor inválido se ignora). El `order` sale de `nextItemOrder`. La validación SARA 2 no cambia.
- `planes/[planId]/ai-actions.ts` (6.3):
  - La precondición pasa a ser "el plan no tiene ítems".
  - La propuesta se valida entera antes de tocar el plan. Si no hay ítems válidos, devuelve el error de siempre sin borrar nada.
  - Recién después borra las comidas (vacías) del plan y crea las de la IA con `mode: "EVERY_DAY"` y `weekday: null`.
- `planes/[planId]/page.tsx`:
  - La tarjeta "Armar con IA" aparece si no hay ningún ítem.
  - Los totales salen de `toPlanTotals`.
  - Los micronutrientes usan los pesos, porque `plan.meals` ya trae los campos.
- `plantillas/[id]/page.tsx`: totales con `toPlanTotals`.
- `lib/plan-pdf.tsx` (7.8, provisional hasta la HU-015):
  - Plan no semanal: sale igual que antes ("Total del plan"). Solo agrega "Elegí una:" si una comida es de opciones.
  - Plan semanal: primero las comidas `EVERY_DAY` ("{nombre} · Todos los días"). Después, cada comida `PER_DAY` con sus días cargados ("Lunes"…), y cada día lleva `wrap={false}`. Termina con el "Promedio diario".
- `lib/plan-pdf.test.tsx` (nuevo): 4 tests. Tres recorren el árbol de `PlanDocument` y uno renderiza de verdad un plan de 7 días × 4 comidas y verifica `%PDF-`.
- `components/weekly-menu/day-selector.tsx` (nuevo): `DaySelector` sobre el primitivo `ToggleGroup`.
  - Es un radiogroup que no se puede deseleccionar. Ítems de `h-11`, encendido en `primary-soft`/`primary`.
  - Los días sin cargar llevan un punto, y su `aria-label` dice "{Día}, sin cargar".
  - En el celular, `grid-cols-8` (o 7); desde `sm`, una fila.
- `(portal)/portal/plan/page.tsx`: con `computeWeeklyTotals`. Si el plan es semanal, calcula `today = weekdayInTimeZone(new Date(), pro.timezone)` y arma los totales por día.
- `(portal)/portal/plan/plan-view.tsx`: recibe `weekly`. Si no es semanal, se ve igual que antes. Si lo es, monta `PortalDayView`.
- `(portal)/portal/plan/portal-day-view.tsx` (nuevo, cliente): selector Lun…Dom con hoy seleccionado, `MacroTotals` "Total del {día}", las comidas del día y las de todos los días (con la marca "Todos los días"), "Elegí una" en las de opciones, y un aviso si el día no tiene comidas.
- `lib/food-policy.test.ts` (Leo): solo sumé `nextItemOrder` y `deleteMeal` al objeto `mocks`. No cambié ninguna aserción. `getPlanTarget` todavía no lo llama ninguna página (eso es F5), así que no lo agregué.
- `packages/db/scripts/test-weekly-menu-migration.ts`: ver "Antes/después".

**No se tocaron:** `apps/bot/**`, `food-picker.tsx`, `food-catalog.tsx`, `delete-meal-button.tsx`, `planes/actions.ts`, `segmented-control.tsx`, `macro-totals.tsx`, `primitives/*`, `domain/{foods,botAi,prescriptions,outbox,consultations}.ts` y los seeds.

### Migración

1. `git fetch`: `develop` = `45d3075`, ya adentro.
2. `prisma migrate status`: "Database schema is up to date!" (21 migraciones), sin drift.
3. Respaldo: `~/nutribot-backups/pre-hu018b-20261003-0601.dump` (282 K, `pg_dump -Fc`).
4. Snapshot "antes": `~/nutribot-backups/hu018b-snapshot.json`, tomado con `$queryRaw` antes de editar el schema. Salida: "9 planes, 0 plantillas, 113 ítems, 3 PDF".
5. `migrate dev --create-only --name weekly_menu` → `20261003090223_weekly_menu`. El SQL quedó **idéntico** al de 3.2: 2 `CREATE TYPE`, `ADD COLUMN ... NOT NULL DEFAULT` en las comidas y `weekday` nullable en los ítems. No tiene `DROP`, `RENAME`, cambios de tipo ni `NOT NULL` sin default. Le agregué arriba el comentario de 3.2 y la apliqué con `npm run db:migrate` + `npm run db:generate`.
6. No hubo reset, `db push` ni shadow apuntando a la base de desarrollo.

### Antes/después (10.3)

```
$ tsx scripts/test-weekly-menu-migration.ts --compare ~/nutribot-backups/hu018b-snapshot.json
OK — 9 planes, 0 plantillas, 113 ítems, 3 PDF sin cambios
(Creados después del snapshot, no comparados: cmus6g6nn0006l4zici8y802k)
```

El script compara cada plan del snapshot contra el estado de ahora:
- mismas comidas e ítems, campo por campo;
- todas las comidas en `EVERY_DAY` sin opciones, y todos los ítems con `weekday = null`;
- `computeWeeklyTotals`: `isWeekly = false`, y los 7 días y el `weeklyAverage` son `deepEqual` al total de antes;
- micronutrientes con pesos (todos 1) idénticos;
- `md5(pdfData)` igual.

Para probar que el script detecta diferencias, lo corrí contra una copia alterada del snapshot (en el scratchpad): devolvió `FALLA`, con las diferencias en ítems, totales, promedio y md5.

**Nota: plan creado durante la sesión.** El plan `cmus6g6nn0006l4zici8y802k` ("Plan leo", DRAFT, sin comidas) se creó a las 09:16 UTC desde el `next dev` que estaba corriendo. No lo creé yo: no escribí nada en la base. Al principio el script lo marcó como diferencia de cantidad de planes. Lo ajusté para que **informe** los planes nuevos en vez de fallar. Un plan del snapshot que ya no exista sigue siendo una falla. No toqué ese plan.

Chequeo SQL (solo lectura) después de la migración: `plans=10 (9 + el nuevo) | meals=34 | items=113 | no_migradas=0 | con_dia=0 | plantillas=0`.

### Verificación (sección 11)

| Comando | Resultado |
|---|---|
| `npm run db:generate` | OK |
| `npm run typecheck` | core, db, **bot** y **web** limpios |
| `npm run test` | **76 archivos, 1431 tests OK** (core weekly-menu 19, micronutrientes +3, domain weeklyMenu 22, web plan-pdf 4, meal-view +3) |
| `npm run lint --workspace apps/web` | Sin errores. Queda solo el warning de antes en `ajustes/logo-form.tsx:36` (`alt`), que no es de esta HU |
| `next build` | OK (todas las rutas; `/portal/plan` 5,49 kB, `/pacientes/[id]/planes/[planId]` 2,5 kB) |
| `prisma migrate status` | "Database schema is up to date!" |
| Antes/después de la migración | `OK — 9 planes, 0 plantillas, 113 ítems, 3 PDF sin cambios` |
| `./ops/harness/verify.sh` | "Arnés OK". Avisa "Se tocó el bot", pero el bot no se tocó: el aviso salta por el cambio de schema. Ninguna prueba encoló en `OutboundMessage` ni usó WhatsApp |

**Sobre `next build`.** El usuario tenía `next dev --turbopack` corriendo (PID 17621) y no lo apagué, porque es su proceso. Para no pisar el `.next` del dev, corrí el build en una copia del repo en el scratchpad (rsync sin `.git`/`.next`/`node_modules`, con `node_modules` enlazado) y después la borré. No queda nada en el repo.

Ninguna prueba escribe en la base: los tests de domain y web usan mocks, y el script 10.3 solo lee. No se llamó a ninguna IA: el test de IA de `food-policy` usa el mock de siempre. `test-weekly-menu.ts` (10.4) es de 018b-2 y no se creó.

### Contrato compartido

- `packages/core/weekly-menu.ts`: todas las firmas de 4.1 con los mismos nombres. **Agregué un export:** `isWeekday(value): value is Weekday`, que usan las actions para leer `weekday`.
- `packages/db/domain/weeklyMenu.ts`: todas las firmas de 5.1, con los mismos nombres de funciones, tipos y errores.
  - **Agregué un export:** `resolveNewMealMode(kind, ownerId, data)`, el default de 12-D3 compartido por `addMeal` y `addTemplateMeal`.
  - `copyDay`, `repeatMealInAllDays`, `restoreMealSnapshots` y `renameMeal` son `async`: así una validación inválida termina en un rechazo de la promesa y no en un `throw` sincrónico. Las firmas (`Promise<…>`) no cambian.
  - `renameMeal` tira `RangeError` si el nombre no tiene entre 1 y 60 caracteres. El contrato no define un error para ese caso.
- `nutritionPlans.ts` y `planTemplates.ts`: `addMeal`, `addMealItem` (`weekday?`), `PlanTarget`, `getPlanTarget`, `getPlanConsultationId`, `addTemplateMeal`, `addTemplateMealItem` y `applyTemplateToPatient` coinciden con 5.2/5.3.
- `MealView`/`MealItemView` coinciden con 8.1. `PlanPdfInput.meals` sigue siendo `MealView[]`.
- **Nombre web nuevo** (no está en el contrato): `toPlanTotals` en `lib/meal-view.ts`. Comparte la franja de totales entre la página del plan y la de la plantilla.

### Decisiones no obvias

- **Franja de totales en 018b-1.** Para un plan no semanal (todos los de hoy), la página del plan, la de la plantilla y el portal muestran `days.MON` de `computeWeeklyTotals`, que es igual a `sumMacros(todos los ítems)` y conserva el rótulo "Total del plan". Para uno semanal (en 018b-1 solo puede salir de una plantilla semanal), el panel muestra el "Promedio diario de la semana". La franja contra el objetivo es de 018b-2 (F1/F5).
- **IA.** Las comidas vacías se borran recién cuando hay al menos un ítem válido, así el plan no queda sin comidas si la IA responde algo inútil.
- **Portal.** El día elegido es estado del cliente y no se refleja en la URL. La SDD pide sincronizar con la URL solo en el editor (7.2), y en el portal "hoy" es el punto de partida natural.
- **Selector en el celular.** Con 8 columnas a 390 px, cada ítem queda de unos 38 px de ancho × 44 px de alto, con `gap-1` en el celular y `gap-2` desde `sm`. La SDD pide 8 columnas a todo el ancho y no entra más.
- **Autochequeo `web-design-guidelines`** (sobre `day-selector.tsx`, `portal-day-view.tsx` y `plan-view.tsx`): foco visible, `tabular-nums`, `min-w-0` + `truncate`, estado vacío y el punto con `aria-hidden` y el texto en `aria-label`. Queda abierto solo lo de la URL del portal (ver arriba).
- **Movimiento** (`apple-design`): el cambio de día es instantáneo y no tiene animación, así que no hay nada que adaptar para movimiento reducido.

### Recorrido en Chrome para el orquestador (018b-1)

En 018b-1 todavía no se pueden crear comidas "Cambia cada día" desde la UI. El recorrido sirve para comprobar que **nada cambió** en lo existente. Las vistas semanales (PDF y portal por día) se cubren con tests (`plan-pdf.test.tsx` y `weekly-menu.test.ts`) y se recorren en 018b-2.

Con `npm run dev` y la sesión iniciada:

1. Abrir un plan **existente** (solo mirar, sin editar): sin selector de días, franja "Total del plan" con los mismos números que antes de la HU, y los micronutrientes iguales (comparar con la producción o con una captura previa si la hay).
2. Abrir la plantilla (si hay): "Total del plan" igual.
3. **Solo en un paciente de prueba** (crear uno a mano):
   1. "Nuevo plan": el plan nuevo **no** trae comidas por defecto en 018b-1 (llegan en 018b-2) y muestra la tarjeta "Armar con IA".
   2. Agregar una comida y 2 alimentos: se agregan como antes, en orden, y el total suma.
   3. Generar el PDF del plan de prueba: sale como antes, con las comidas y "Total del plan". **No** regenerar el PDF de planes reales: pisa el `pdfData` guardado.
4. Portal con la sesión del paciente de prueba y su plan en "Activo": se ve igual que antes, con "Total del plan", sin pestañas de días y con el botón "Descargar PDF".
5. Al terminar, borrar el paciente de prueba desde el panel.

**Pendiente para 018b-2:** el recorrido completo de 11.1 (editor por día, copiar/repetir/deshacer, vista Semana, portal con pestañas y PDF por día sobre datos reales de prueba).

---

## 018b-2 (editor semanal, fases E–G)

**Estado: done.** Rama `feat/hu-018b2-editor-semanal`, que sale de `develop` con la 018b-1 ya mergeada (PR #21). Lo implementó Opus con los skills `apple-design`, `ui-ux-pro-max` y `web-design-guidelines`.
- **Sin migración**: `schema.prisma` no cambió y `prisma migrate status` dice "Database schema is up to date!" (22 migraciones).
- No se tocaron el modelo ni las operaciones de domain de la 018b-1. Solo se sumaron las comidas por defecto (E1).
- Se aplicaron las decisiones de §15 y D2–D12 de §12.

### Commits (locales, sin push)

| Fase | Commit | Mensaje |
|---|---|---|
| E | `0738780` | HU-018b: plan nuevo con comidas por defecto y actions del editor semanal |
| F | `122329b` | HU-018b: editor semanal (días, modos, opciones, copiar y repetir con deshacer, objetivo del día) |
| G | HEAD de la rama (el que contiene este archivo) | HU-018b: script de flujo del menú semanal |

### Archivos

**Fase E: domain y actions**
- `packages/db/domain/nutritionPlans.ts`: `createPlan` crea el plan y `createDefaultWeeklyMeals` en una sola `$transaction`.
- `packages/db/domain/planTemplates.ts`: `createTemplate`, lo mismo (12-D4). `applyTemplateToPatient` no cambió: copia exacta, sin comidas por defecto.
- `packages/db/domain/consultations.ts`: `createPlanForConsultation` llama a `createDefaultWeeklyMeals` dentro de su transacción.
- `packages/db/domain/weeklyMenu.test.ts`: 3 casos nuevos (`createPlan`, `createTemplate` y `createPlanForConsultation` crean las 5 comidas en orden y con modo y opciones) y una aserción más: aplicar una plantilla no crea comidas por defecto.
- `apps/web/src/app/(panel)/weekly-menu-actions.ts` (nuevo, 6.1): las 7 actions del contrato con zod.
  - `restoreMealsAction` es estricto: `.strict()`, hasta 20 comidas y 400 ítems, gramos entre 0 y 99999, textos de hasta 4000.
  - Cualquier error devuelve "No se pudo guardar. Probá de nuevo.".
  - Revalida `/pacientes/{patientId}` y la ruta del plan, o `/plantillas/{id}` para plantillas.
- `apps/web/src/app/(panel)/weekly-menu-actions.test.ts` (nuevo): 6 tests (undo, revalidación, errores, zod y foto estricta).
- `apps/web/src/lib/notify.ts`: `notify.undo` (8 s, "Deshacer" con botón de `h-11`).
- `apps/web/src/lib/design-tokens.ts`: suma `chartPalette.macro`. `design-tokens.test.ts` ya recorre `chartPalette` y ahora incluye `macro` (todos ≥ 3:1).
- **Pendiente §16 (IA):**
  - Cambio en `planes/[planId]/ai-actions.ts`: después de validar la respuesta de la IA, **relee el plan** con `getPlan`. Si el plan ya no existe, devuelve "Plan no encontrado". Si ya tiene ítems, devuelve el error de siempre y no borra ni crea nada. Si no, borra solo las comidas de esa segunda lectura.
  - Test nuevo `ai-actions.test.ts` con 3 casos (IA mockeada, sin APIs reales).
  - Elegí releer y no hacer una operación transaccional de domain. Así `food-policy.test.ts` (de Leo) sigue viendo `addMeal`/`addMealItem` sin cambiar sus aserciones.

**Fase F: UI** (`apps/web/src/components/weekly-menu/`, salvo lo indicado)
- `day-target-strip.tsx` (7.3) y su test (3 casos: con objetivo, sin objetivo en un plan, plantilla).
  - Con objetivo: 4 celdas, cada una con el número, "de X" y una barra `role="meter"`.
    - La barra lleva `aria-valuetext` y su color sale de `chartPalette.macro`. La pista llega al 110 % del objetivo, así la marca del 100 % se ve; el relleno se corta en el objetivo.
    - El estado va con ícono y texto (`formatTargetStatus`).
    - Pie: "Objetivo: consulta del dd/MM/yyyy · Promedio semanal: … kcal".
  - Sin objetivo: `MacroTotals`, más el `Alert` "Calculá el requerimiento para ver cuánto falta." con el link "Ir a la consulta".
  - La barra anima con `springs.standard` (bounce 0). Con movimiento reducido, `MotionConfig reducedMotion="user"` la hace saltar.
- `weekly-overview.tsx` (7.5) y su test, que también cubre `labels.ts` y `day-param.ts`.
  - Escritorio: tabla. Las comidas `EVERY_DAY` van en una celda con `colSpan={7}`, la marca "Todos los días" y "Elegí una:".
  - Celdas: hasta 3 nombres, después "+N", con botones de 44 px.
  - Fila "Total": kcal y `summarizeDayStatus`, o "Sin cargar" si el día no tiene comidas.
  - Debajo, "Promedio diario de la semana" contra el objetivo.
  - Celular: una tarjeta por día.
- `meal-card-menu.tsx` (7.4): menú "⋯" con ítems de 44 px, en este orden:
  1. Repetir en todos los días (con `useConfirm` solo si va a pisar otros días).
  2. Cambiar a Cambia cada día / Igual todos los días.
  3. Opciones (elige una).
  4. Renombrar.
  5. Subir y Bajar (deshabilitados en los bordes).
  6. Borrar comida.
- `meal-mode-dialog.tsx`: "¿Qué día conservar?", con radios de 44 px que dicen "N ítems" o "vacío". Arranca en el lunes y avisa con `deleteOtherDaysWarning`.
- `rename-meal-dialog.tsx`.
- `copy-day-dialog.tsx`: tiene dos variantes.
  - "Copiar el lunes a…": casillas de 44 px, "Ya tiene comidas" en los días con contenido y el aviso "Martes y miércoles ya tienen comidas. Se van a reemplazar.".
  - "Copiar al jueves": radio con los días cargados.
- `use-menu-undo.ts` (7.9).
- `labels.ts` (nuevo, puro): textos del editor (`copiedDayMessage`, `replaceDaysWarning`, `deleteOtherDaysWarning`, `withArticle`, `agreeWithMeal`, `itemLabel`).
- `day-param.ts` (nuevo, puro): `?dia=` ↔ día, y `initialDayFor`.
- `apps/web/src/components/meals-editor.tsx` (de Leo): reescrito como `"use client"` (7.2).
  - Se conservan el nombre `MealsEditor`, `export type { FoodOption }`, todas las props de antes y el formulario "Agregar alimento" con `FoodPicker`, `NumberInput`, "Descripción libre" y "Nota".
  - Props nuevas: `kind`, `target`, `targetMissingHref` e `initialDay`.
  - **Pendiente §16 (weekday):** el formulario manda `<input type="hidden" name="weekday">`, con el día de la pestaña en las comidas `PER_DAY` y `""` en las `EVERY_DAY`.
- `planes/[planId]/page.tsx` (F5): carga `getPlanTarget` y `getPlanConsultationId`, que se llama solo si no hay objetivo.
  - Arma `target` con `sourceLabel` y la fecha `dd/MM/yyyy` en la zona de la profesional.
  - Arma `targetMissingHref`: la consulta del plan, o `/pacientes/{id}?tab=consultas` si no tiene (D11).
  - Calcula `initialDay` con `searchParams.dia`.
  - Ya no tiene el `MacroTotals` fijo: la franja está dentro del editor.
- `plantillas/[id]/page.tsx`: lo mismo, con `target={null}` y `targetMissingHref={null}`.
- `lib/food-policy.test.ts` (de Leo): solo sumé `getPlanTarget` y `getPlanConsultationId` (los dos devuelven `null`) al objeto `mocks`. **No cambié ninguna aserción.** La SDD nombraba solo `getPlanTarget`, pero la página también llama a `getPlanConsultationId` cuando no hay objetivo, y sin ese mock el test rompe.

**Fase G**
- `packages/db/scripts/test-weekly-menu.ts` (nuevo, 10.4). Ver "Script de flujo".

**No se tocaron:** `apps/bot/**`, `schema.prisma`, migraciones, `food-picker.tsx`, `food-catalog.tsx`, `delete-meal-button.tsx`, `kcal-breakdown-popover.tsx`, `planes/actions.ts`, `segmented-control.tsx`, `macro-totals.tsx`, `primitives/*`, `domain/weeklyMenu.ts`, seeds, portal y PDF (ya hechos en 018b-1).

### Verificación (§11)

| Comando | Resultado |
|---|---|
| `npm run typecheck` | core, db, **web** y **bot** limpios |
| `npm run test` | **80 archivos, 1454 tests OK**. Son 23 más que en 018b-1: domain +3, actions +6, IA +3, franja +3 y Semana/textos +8 |
| `npm run lint --workspace apps/web` | Sin errores. Queda solo el warning de antes en `ajustes/logo-form.tsx:36` |
| `next build` | OK (`/pacientes/[id]/planes/[planId]` 2,5 kB / 232 kB, `/plantillas/[id]` 1,02 kB / 230 kB, `/portal/plan` 5,54 kB) |
| `prisma migrate status` | "Database schema is up to date!" (22 migraciones) |
| `tsx scripts/test-weekly-menu.ts` | **OK**, 12 pasos (ver abajo) |
| `./ops/harness/verify.sh` | "Arnés OK". Avisa "Se tocó el bot" porque cambió `packages/db/domain`, pero el bot no se tocó y nada encoló en `OutboundMessage` (11 filas antes y después) |
| `test-weekly-menu-migration.ts --compare` | `FALLA`, pero solo en el plan `cmufow0kr001mzf4w3fp65h8e` ("Plan del 24/09/2026"), y no por esta HU. Ver abajo |

**Sobre `next build`.** El `next dev` del usuario no se tocó. Corrí el build en una copia del repo en el scratchpad (rsync sin `.git`, `.next`, `node_modules` ni las carpetas de sesión de WhatsApp, con `node_modules` enlazado) y después la borré.

**Sobre el `--compare` de 10.3.** El plan `cmufow0kr001mzf4w3fp65h8e` tiene `updatedAt` y `pdfGeneratedAt` = 2026-10-03 06:25:01 (-03). Eso es **antes** del primer commit de esta rama (06:26:58) y antes de cualquier corrida mía, o sea, durante el recorrido o la aprobación de la 018b-1.
- Cambiaron sus ítems (la base pasó de 34 comidas y 113 ítems a 33 y 110) y su PDF se generó por primera vez (el md5 era `null` en el snapshot).
- Los otros 8 planes del snapshot dan igual.
- Ese plan no lo toqué. El script compara contra el snapshot de antes de la migración, así que cualquier edición posterior desde el panel aparece como diferencia.

### Script de flujo (10.4)

```
$ cd packages/db && npx dotenv -e ../../.env -- tsx scripts/test-weekly-menu.ts
  ✓ 1. createPlan trae Desayuno…Cena 'Cambia cada día' y Colaciones con opciones
  ✓ 2. createTemplate trae las mismas 5 comidas
  ✓ 3. ítems del lunes con order correlativo; el día sin weekday se rechaza
  ✓ 4. copyDay MON → TUE, WED y Deshacer deja martes y miércoles vacíos
  ✓ 5. repeatMealInAllDays: los 7 días con el desayuno del lunes, sigue PER_DAY
  ✓ 6. setMealMode en los dos sentidos y Deshacer vuelve a la foto anterior
  ✓ 7. setMealOptions: la comida de opciones suma el promedio al día
  ✓ 8. renameMeal (trim) y moveMeal, con el borde sin cambios
  ✓ 9. addMeal en un plan semanal crea la comida 'Cambia cada día'
  ✓ 10. applyTemplateToPatient copia modos, opciones, días e ítems
  ✓ 11. getPlanTarget = null (sin prescripción)
  ✓ 12. computeWeeklyTotals: 7 días cargados, promedio 1449.3 kcal
OK
```

**Datos que crea.** Su propio paciente ("Prueba HU-018b", jid `5490000018018@s.whatsapp.net`), un plan, una plantilla y el plan que sale de aplicarla. Lee 4 alimentos SARA 2 existentes, que no modifica.

**Limpieza.** En el `finally` borra **solo por los ids** que insertó: la plantilla, los 2 planes y el paciente. Después verifica que no quede ninguno. Si al empezar ya existe un paciente con el jid de prueba, aborta sin borrarlo.

**Sin transacción que se revierta.** Las operaciones de domain abren su propia `$transaction` sobre el cliente global, así que el script no puede envolverlas en una.

**Conteos antes y después.** `Patient|NutritionPlan|PlanMeal|PlanMealItem|PlanTemplate|TemplateMeal|OutboundMessage` = `15|10|33|110|0|0|11` en los dos casos.

No hubo WhatsApp ni IA, y no se regeneró ningún PDF.

### Contrato compartido

- `weekly-menu-actions.ts`: `MenuActionResult` y las 7 actions con los nombres y las firmas de 6.1. En `kind` usé el tipo `MealOwnerKind` de domain, que es el mismo `"plan" | "template"`.
- `notify.undo(message, onUndo)` y `chartPalette.macro` coinciden con 7.9 y 7.10.
- `MealsEditor`: las props de 7.2 (`kind`, `target`, `targetMissingHref` e `initialDay`). `PlanTargetView = { kcal, protein, carbs, fat, sourceLabel }` se exporta desde `day-target-strip.tsx`.
- Componentes con los nombres de archivo de 7.1: `DayTargetStrip`, `WeeklyOverview`, `MealCardMenu`, `CopyDayDialog`, `MealModeDialog`, `RenameMealDialog` y `useMenuUndo`.
- **Archivos nuevos que no están en el contrato:** `weekly-menu/labels.ts` y `weekly-menu/day-param.ts` (textos y `?dia=`, puros y testeados).
- Domain: ninguna firma cambió. `createPlan`, `createTemplate` y `createPlanForConsultation` mantienen firma y retorno.

### Decisiones no obvias

- **Borrar comida desde el "⋯".** No monté `DeleteMealButton` adentro del menú porque es un `<form>` y el menú se desmonta al elegir un ítem. El ítem "Borrar comida" usa el mismo `useConfirm`, con el mismo título, texto y botón, y llama a la misma `deleteMealAction`. `delete-meal-button.tsx` no se tocó, pero el editor ya no lo usa.
- **El menú es `modal={false}`**, para que los diálogos que abre (modo y renombrar) no se crucen con el bloqueo de punteros de Radix. El foco al cerrar lo maneja `preserveUserFocusOnClose` de 017a.
- **Concordancia en los textos.** La SDD pedía "los " + nombre + "s", pero eso da "los meriendas" y "los colaciones". `deleteOtherDaysWarning`, `withArticle` y `agreeWithMeal` concuerdan el artículo y el participio: "las meriendas", "¿Repetir la merienda del lunes?", "Cena del lunes repetida…". Con nombres de más de una palabra usa el texto genérico de la SDD.
- **"¿Qué día conservar?" siempre arranca en el lunes**, como dice la HU, aunque se abra desde otra pestaña. Si la comida no tiene ítems en ningún día, cambia de modo sin diálogo (igual queda "Deshacer").
- **Franja fija solo desde `md`.** En el celular, las 4 celdas (2 × 2) más el título y el pie ocupan unos 200 px. Fijas, junto con el selector, se comían media pantalla, así que en el celular la franja se desplaza con la página. Desde `md` es `sticky` (`top-14`, y `top-0` desde `lg`) con `material-bar`. Las tarjetas de comida llevan `scroll-mt` para que "tocar una celda" de la vista Semana no las deje debajo de la franja.
- **Plan no semanal.** No hay selector ni vista Semana. La franja se titula "Total del día" (antes decía "Total del plan") y usa `days.MON`, que es el mismo número de siempre. Si una comida pasa a "Cambia cada día" desde la lista, el editor abre en el lunes.
- **Celda "Todos los días" de la vista Semana:** lleva al lunes, porque esa comida es igual todos los días.
- **Formulario "Agregar alimento":** se le pone `key` por comida y día, así al cambiar de pestaña no arrastra lo que se tipeó para otro día. El botón dice "Agregar al martes" en las comidas por día.
- **Movimiento** (`apple-design`): spring sin rebote en la barra, diálogos y menú con los primitivos de 017a, y cambio de día instantáneo. Con movimiento reducido, el `scrollIntoView` usa `behavior: "auto"`.
- **Autochequeo `web-design-guidelines`:** botones de solo ícono con `aria-label`, foco visible en las celdas y los links, `tabular-nums`, `break-words`/`min-w-0` para nombres largos, estados vacíos, casillas y radios con la fila entera clicable, URL con `?dia=`, sin lecturas de layout en el render y efectos solo en el cliente (sin riesgo de hidratación). Corregí el link "Ir a la consulta", que no tenía estado de hover ni foco visible. Queda pendiente el placeholder "Ej: Desayuno" de "Nueva comida", que ya estaba antes de esta HU.

### Recorrido en Chrome para el orquestador (018b-2, §11.1)

Con `npm run dev` (panel en :3000) y la sesión iniciada. No hace falta el bot. Crear antes un paciente de prueba a mano, con un teléfono inventado. **No editar planes reales:** los existentes solo se abren. **No regenerar el PDF de planes reales**, porque pisa el `pdfData` guardado.

1. **Plan existente, solo mirar:** se ve como antes, sin selector de días, con la franja "Total del día" y los mismos números que antes. Micronutrientes iguales.
2. **Comidas por defecto.** En el paciente de prueba, "Nuevo plan". Trae:
   - Desayuno, Almuerzo, Merienda y Cena, con el título "{comida} · {día}";
   - Colaciones, con "Todos los días" y "Elegí una".

   Abre en "Semana", porque el plan está vacío, y la URL dice `?dia=semana`.
3. **Editor por día.**
   1. Tocar "Lun" y agregar 2 alimentos al desayuno con "Agregar al lunes". La franja del lunes cambia y "Lun" pierde el punto de "sin cargar".
   2. Si el paciente no tiene prescripción, aparece "Calculá el requerimiento para ver cuánto falta." con "Ir a la consulta".
   3. Con prescripción (cargar una consulta con requerimiento al paciente de prueba), se ven "1.240 de 1.800 kcal", la barra con la marca y "Faltan …" o "En objetivo".
4. **Copiar y Deshacer.**
   1. "Copiar este día a…", marcar martes y miércoles y tocar "Copiar". Aparece el toast "Lunes copiado a martes y miércoles · Deshacer".
   2. Tocar "Deshacer": martes y miércoles vuelven a estar vacíos.
   3. En la pestaña "Jue" (vacía), ver "El jueves todavía no tiene comidas." y "Copiar otro día acá".
5. **Repetir.** "⋯ → Repetir en todos los días" en el desayuno del lunes. Si otro día ya tenía desayuno, primero pide confirmación con "… ya tiene(n) desayuno. Se van a reemplazar.". Después, los 7 días tienen ese desayuno y aparece el toast con "Deshacer".
6. **Opciones.** Agregar 3 alimentos a Colaciones. Aparecen "Opciones: X a Y kcal" y "Suma al día el promedio: Z kcal", y el total del día suma el promedio.
7. **Cambio de modo.**
   1. "⋯ → Cambiar a Igual todos los días" en el desayuno. Aparece el diálogo "¿Qué día conservar?" con el lunes marcado, "N ítems" o "vacío" en cada día, y "Se van a borrar los desayunos de los otros días.".
   2. Tocar "Cambiar": aparece el toast con "Deshacer". Probar "Deshacer".
   3. Probar también "Cambiar a Cambia cada día" en Colaciones. El toast dice "…; ya no es de opciones".
8. **Vista Semana.**
   1. Tocar "Semana": tabla con una fila por comida, "Todos los días" en una sola celda, "Sin cargar" en los días vacíos, la fila "Total" con el estado y abajo "Promedio diario de la semana".
   2. Tocar una celda: lleva a ese día y desplaza hasta esa comida.
9. **Renombrar, Subir y Bajar** desde el "⋯". "Subir" está deshabilitado en la primera comida.
10. **PDF.** "Generar PDF" del plan **de prueba**: primero las comidas "Todos los días" y después cada comida con "Lunes", "Martes"…, cerrando con "Promedio diario".
11. **Portal.** Marcar el plan de prueba como "Activo" y abrirlo en el portal con la sesión del paciente de prueba: hoy seleccionado, pestañas Lun…Dom y "Elegí una" en Colaciones.
12. **Plantillas.**
    1. "Nueva plantilla": trae las mismas 5 comidas, sin objetivo. La franja muestra totales y "Promedio semanal".
    2. Cargar algo en un día y aplicar la plantilla al paciente de prueba: el plan nuevo copia los modos y los días.
13. **Celular.** Achicar la ventana a 390 px en DevTools y repetir 3 y 8:
    - el selector queda en 8 columnas de 44 px de alto;
    - el "⋯" y los botones miden 44 px;
    - la vista Semana se ve como tarjetas por día;
    - la franja no queda fija (decisión de arriba).
14. **IA (opcional, gasta API):** en un plan de prueba recién creado (comidas por defecto vacías), "Armar con IA" reemplaza las comidas vacías por comidas "Igual todos los días".
15. **Limpieza.** Al terminar, borrar el paciente de prueba desde el panel (se lleva sus planes). Borrar también la plantilla de prueba.
