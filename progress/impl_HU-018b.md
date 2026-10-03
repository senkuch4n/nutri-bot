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
