# Review — HU-018b

## 018b-1 (modelo semanal, fases A–D)

**Veredicto:** APPROVED

Diff revisado: `git diff 313a631..HEAD` (`ef4b959`, `e4dfcd9`, `5ffdaf3`, `1a7f83e`) contra
`Refactorizaciones/menu-semanal.md` (secciones 3–8, fases A–D de la 9, dudas D2–D12 de la 12 y
decisiones de la 15). La 018b-2 (fases E–G) no se evaluó y no aparece en el diff: no hay
`weekly-menu-actions.ts`, `createPlan`/`createTemplate`/`createPlanForConsultation` siguen sin comidas
por defecto (C2/C3 de la SDD) y no hay editor nuevo.

### Verificación que corrí yo

| Comando | Resultado |
|---|---|
| `npm run typecheck` | core, db, **bot** y **web** limpios (exit 0) |
| `npm run test` | 76 archivos, 1431 tests OK |
| `npm run lint --workspace apps/web` | exit 0. Solo el warning de antes en `ajustes/logo-form.tsx:36` (fuera de la HU) |
| `./ops/harness/verify.sh` | "Arnés OK" (exit 0). El WARN "Se tocó el bot" lo dispara el cambio de schema: `apps/bot/**` no está en el diff |
| `prisma migrate status` (packages/db) | 22 migraciones, "Database schema is up to date!" |
| `prisma migrate diff --from-url $DATABASE_URL --to-schema-datamodel prisma/schema.prisma --script` (solo lectura, sin shadow ni `--from-migrations`) | "This is an empty migration": la base migrada y el schema coinciden |
| `tsx scripts/test-weekly-menu-migration.ts --compare ~/nutribot-backups/hu018b-snapshot.json` (solo lectura) | `OK — 9 planes, 0 plantillas, 113 ítems, 3 PDF sin cambios` (más el plan `cmus6g6nn0006l4zici8y802k`, creado después del snapshot, que se informa aparte) |

No corrí `next build` porque hay un `next dev` del usuario en marcha. No escribí en la base.

### Puntos pedidos

1. **Migración `20261003090223_weekly_menu/migration.sql`.** Es idéntica a la de la SDD (3.2), con el
   comentario arriba: 2 `CREATE TYPE`, `ADD COLUMN ... NOT NULL DEFAULT` en `PlanMeal`/`TemplateMeal`
   (líneas 12–13 y 19–20) y `weekday` nullable en los ítems (16 y 23). No tiene `DROP`, `RENAME`,
   cambios de tipo ni `NOT NULL` sin default. Es segura para `migrate deploy`. El schema
   (`schema.prisma:601-618, 646-649, 665-667, 687-690, 706-708`) coincide con la migración: lo
   confirma el diff vacío de arriba. El script de 10.3 solo hace `SELECT` (`$queryRaw`, `findMany`,
   `getPlan`/`getTemplate`). Compara de verdad: comidas e ítems campo por campo, el backfill, los 7
   días y el promedio con `isDeepStrictEqual`, los pesos, los micronutrientes y el md5 del PDF. Un
   plan del snapshot que ya no exista cuenta como falla.
2. **Contrato web/bot.** Cambian `schema.prisma` y `domain/{nutritionPlans,planTemplates,weeklyMenu,index}.ts`.
   Los dos typechecks pasan. El bot no lee la estructura del plan (lo verificó el architect; el diff
   no toca `apps/bot`). Las firmas de 4.1 y 5.1–5.3 coinciden con el contrato. Los exports extra
   (`isWeekday`, `resolveNewMealMode`, `toPlanTotals`) están declarados en el impl.
   `updateMealItem`/`updateTemplateMealItem` excluyen `weekday` del tipo para no saltear la invariante.
3. **`packages/core/src/weekly-menu.ts`.**
   - Días y rótulos correctos.
   - Día cargado: en un plan semanal, un día está cargado si tiene algún ítem `PER_DAY`; en uno no
     semanal, cuentan los 7 si hay ítems (`loadedDaysOf`, l. 133-140).
   - Promedio: `round1(Σ días cargados / n)`, `null` con n = 0 (l. 156-163).
   - Opciones: `summarizeOptions` filtra las `null` (texto libre) para el promedio y para el rango
     (l. 79-95).
   - Total del día: se arma con una lista plana, así un plan migrado da exactamente
     `sumMacros(todos)`.
   - ±5 %: bordes inclusivos con epsilon (l. 186-197).
   - Pesos: `PER_DAY` 1/n, opciones 1/k o 0, `EVERY_DAY` 1; n = 1 si no hay días cargados pero sí
     ítems `EVERY_DAY` (l. 167-183).
   - `weekdayInTimeZone` usa `weekdayInTz`.
   - Los tests de 10.1 están completos e incluyen la comprobación `Σ macros × peso ≈ weeklyAverage`.
4. **Los planes existentes no cambian.**
   - Página del plan, plantilla y portal: con un plan no semanal muestran `days.MON.macros` y el
     rótulo "Total del plan" (`meal-view.ts:154-158`, `portal/plan/page.tsx:41-51`). Es el mismo
     cálculo de antes.
   - PDF: la rama no semanal tiene la misma estructura, con `wrap={false}` por comida y "Total del
     plan" (`plan-pdf.tsx:129-160`).
   - Micronutrientes: con pesos 1, el script da los mismos resultados.
   - IA (D2): la precondición pasa a "sin ítems" (`ai-actions.ts:65`). La propuesta se valida
     entera antes de borrar (l. 154-165) y recién después se borran las comidas vacías y se crean
     las nuevas en `EVERY_DAY`/`weekday: null` (l. 167-184). La tarjeta del `page.tsx:82` usa la
     misma condición.
5. **Zona de imleticio.**
   - `meals-editor.tsx` solo suma campos a los tipos `MealItemView`/`MealView`; el nombre, las props
     y el formulario no cambian.
   - `food-picker.tsx`, `food-catalog.tsx`, `delete-meal-button.tsx` y `planes/actions.ts` no están
     en el diff.
   - `food-policy.test.ts` solo suma 2 mocks y no cambia aserciones.
6. **Seguridad.**
   - En 018b-1 no hay actions nuevas: las de zod y el "Deshacer" son de E2/018b-2.
   - Las dos actions modificadas siguen detrás del layout `(panel)` con `auth()` y del middleware.
     Validan `weekday` contra `WEEKDAYS` y, si no es un día válido, descartan el envío
     (`planes/[planId]/actions.ts:91-94`, `plantillas/actions.ts:83-86`). La validación SARA 2 sigue
     igual.
   - En el dominio, `restoreMealSnapshots` revisa las invariantes de cada foto y que todas las
     comidas sean del dueño (`count` con `ownerKey`) antes de escribir, todo en `$transaction`
     (`weeklyMenu.ts:260-287`). Lo cubre el test "otro dueño → no escribe nada".
   - El portal no cambia su consulta (`getPortalPatient`) y no recibe ids nuevos por query.

## Checkpoints
- C1 backlog válido, 1 HU activa por responsable: [x] (verify.sh: "senkuch4n: HU-018b")
- C1 `progress/current-senkuch4n.md` refleja la HU: [x]
- C1 no toca archivos de HU de la otra persona: [x] (solo toca los archivos de código de la zona de Leo que autoriza la SDD 2.1)
- C1 `verify.sh` exit 0: [x]
- C2 HU con Contexto, Gherkin, Datos, UX, Fuera de alcance y dudas: [x]
- C2 SDD con workspaces, checklist y contrato: [x]
- C2 firmas del diff = contrato compartido: [x]
- C3 lógica pura en core, base en domain sin duplicar: [x]
- C3 schema/domain: web y bot compilan: [x]
- C3 migración coherente, aditiva, NOT NULL con default: [x]
- C3 rutas protegidas; el portal solo ve lo propio: [x] (sin rutas nuevas)
- C3 bot en silencio / textos: [x] (no aplica: no se toca el bot)
- C3 sin `console.log` de debug ni TODOs: [x] (los `console.log` del script de 10.3 son su salida)
- C4 typecheck limpio: [x]
- C4 core con tests y `npm run test` OK: [x]
- C4 flujo del bot simulado: [x] (no aplica)
- C4 PDF verificado de verdad: [x] (`plan-pdf.test.tsx` renderiza un PDF real de 7 días × 4 comidas y chequea `%PDF-`; los 3 PDF guardados tienen el mismo md5)
- C5 `progress/impl_HU-018b.md` existe y describe: [x]
- C5 `progress/review_HU-018b.md` con veredicto: [x]
- C5 sin scripts sueltos ni datos de prueba: [x] (el único script es el de 10.3, que pide la SDD y solo lee)

## Cambios requeridos
Ninguno.

## Dudas (no bloqueantes)
- `ai-actions.ts:167`: el borrado de las comidas y la creación de las nuevas no van en una
  transacción, y `plan.meals` se lee **antes** de la llamada a la IA (l. 62).
  - Si alguien agrega un ítem a una comida mientras la IA responde, `deleteMeal` lo borra en
    cascada.
  - Si falla un `addMeal` a la mitad, el plan queda con la propuesta incompleta.
  - Es poco probable (la profesional espera la respuesta), pero en 018b-2 conviene releer el plan
    justo antes de borrar o mover todo a una operación de domain transaccional.
- `addPlanMealItemAction`/`addTemplateMealItemAction`: si una comida es `PER_DAY` y el formulario
  actual no manda `weekday`, `assertWeekdayMatchesMeal` tira un error que llega a la página de error.
  En 018b-1 no se pueden crear comidas `PER_DAY` desde la UI, así que no se puede llegar. Lo cierra
  el editor de 018b-2 (input oculto `weekday`).
- `weeklyMenu.ts:194`: `setMealMode` PER_DAY → EVERY_DAY borra con `weekday: { not: keep }`, que en SQL
  no incluye los `NULL`. Con la invariante 2 no hay `NULL` en una `PER_DAY`, así que no importa.
- `nextItemOrder` y `assertWeekdayMatchesMeal` no verifican que la comida sea del dueño. Ya era así
  antes: las actions de alta de ítem nunca comprobaron que `mealId` fuera de `planId`, y el panel es
  de una sola profesional. Conviene revisarlo cuando lleguen las actions de 018b-2.
