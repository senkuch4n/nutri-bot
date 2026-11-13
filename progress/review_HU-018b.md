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

---

## 018b-2 (editor semanal, fases E–G)

**Veredicto:** APPROVED

Revisé la rama `feat/hu-018b2-editor-semanal`, con el diff `git diff 745acd9..HEAD` (`0738780`,
`122329b`, `cb9e59f`), contra la SDD `Refactorizaciones/menu-semanal.md`: fases E–G de la §9, §15,
D2–D12 de la §12 y los dos pendientes de la §16. También leí la sección "018b-2" de
`progress/impl_HU-018b.md` y `progress/recorrido_HU-018b.md`. El diff no toca `schema.prisma`, las
migraciones ni `apps/bot`.

### Verificación que corrí yo

| Comando | Resultado |
|---|---|
| `npm run typecheck` | core, db, **bot** y **web** limpios (exit 0) |
| `npm run test` | 80 archivos, 1454 tests OK |
| `npm run lint --workspace apps/web` | exit 0. Solo el warning de antes en `ajustes/logo-form.tsx:36` |
| `./ops/harness/verify.sh` | "Arnés OK" (exit 0). El WARN del bot lo dispara `packages/db/domain`; `apps/bot` no se tocó |

No corrí `next build` (hay un `next dev` en marcha), ni el script de flujo 10.4, porque escribe en la
base. Ese script lo revisé leyéndolo. La `FALLA` de `--compare` en `cmufow0kr…` no cuenta como defecto
de esta HU, como indicaste.

### Puntos pedidos

1. **Actions nuevas: zod y dueño (D6).** `apps/web/src/app/(panel)/weekly-menu-actions.ts`:
   - Cada action pasa por `run()` (l. 46-61): `safeParse` antes de llamar a domain, y cualquier error
     se convierte en "No se pudo guardar. Probá de nuevo.".
   - La foto de "Deshacer" se valida estricta (l. 97-114): `.strict()` en la foto y en cada ítem,
     hasta 20 comidas, 400 ítems en total (con el `refine`), gramos entre 0 y 99999, textos de hasta
     4000 y `weekday`/`mode` como enums.
   - La pertenencia se verifica en domain: `restoreMealSnapshots` cuenta las comidas por `ownerKey` y
     revisa las invariantes antes de escribir, en `$transaction`. Las demás operaciones pasan por
     `loadOwnedMeal` o filtran por dueño (`copyDay`).
   - La revalidación coincide con 6.1.
   - Tests en `weekly-menu-actions.test.ts`: zod antes de domain y foto con campos extra o fuera de
     rango.
2. **IA (§16, primer pendiente).** `ai-actions.ts:168-179`: después de validar la propuesta, relee el
   plan con `getPlan`.
   - Si ya no existe → "Plan no encontrado".
   - Si ya tiene ítems → el error de siempre, sin borrar ni crear.
   - Si no, borra solo las comidas de la segunda lectura.
   - `ai-actions.test.ts` cubre los 3 casos.

   La §16 aceptaba releer como alternativa a la transacción.
3. **Concordancia de género.** `components/weekly-menu/labels.ts:21-63`:
   - `deleteOtherDaysWarning` da "las meriendas", "las cenas", "las colaciones" y "los desayunos".
     Con nombres de más de una palabra usa el texto genérico de la SDD.
   - `withArticle` da "la merienda", y `agreeWithMeal` da "repetida" y "repetidas".
   - Tiene tests en `weekly-overview.test.tsx`.
   - El desvío respecto del "los + nombre + s" de la SDD 7.4 está justificado en el impl y mejora el
     texto.
4. **Accesibilidad.**
   - Selector de días: `h-11` (de 018b-1).
   - Menú "⋯": trigger `icon-lg` con `aria-label` e ítems `h-11` (`meal-card-menu.tsx:30, 127-131`).
   - Filas de los diálogos: `min-h-11` (`copy-day-dialog.tsx:11-12`, `meal-mode-dialog.tsx:57`).
   - Celdas de la vista Semana: botones `min-h-11` con `aria-label` y foco visible
     (`weekly-overview.tsx:31-32`).
   - Barra de la franja: `role="meter"` con `aria-valuetext` (`day-target-strip.tsx:87-95`). Los
     estados llevan texto e ícono, no solo color.
   - Toast con "Deshacer": `!h-11`.
   - Los diálogos usan el `Dialog` de 017a, que devuelve el foco con `preserveUserFocusOnClose` +
     `returnFocus`.
   - El foco al cerrar los diálogos que se abren desde el menú no lo pude comprobar sin navegador
     (ver Dudas).
5. **El plan no semanal se ve igual.**
   - Sin selector ni vista Semana (`meals-editor.tsx:151-153, 177`).
   - Una sola lista y la franja con `days.MON.macros`, el mismo número de siempre (l. 135-136).
   - El título pasa de "Total del plan" a "Total del día", como pide la SDD en 11.1 paso 1.
   - Ahora aparece el "⋯" en cada comida y, si no hay prescripción, el aviso "Calculá el
     requerimiento…". Los dos son de la SDD (7.2 y 7.3).
   - El formulario de ítem manda `weekday=""` (l. 324, 418): sigue entrando como `EVERY_DAY`.
6. **Zona de imleticio.**
   - `food-picker.tsx`, `food-catalog.tsx`, `delete-meal-button.tsx`, `kcal-breakdown-popover.tsx`
     y `planes/actions.ts` no están en el diff.
   - `meals-editor.tsx` se reescribió como pide la SDD 2.1/7.2. Conserva el nombre, el
     `export type { FoodOption }`, todas las props anteriores y el formulario "Agregar alimento" con
     `FoodPicker` tal cual, y suma el input oculto `weekday`. Ese input cierra el segundo pendiente de
     la §16.
   - `food-policy.test.ts` solo suma 2 mocks (`getPlanTarget` y `getPlanConsultationId`) y no cambia
     aserciones. El segundo mock está justificado (la página lo llama sin objetivo).
   - Desvío menor de la SDD 7.4 punto 7: "Borrar comida" ya no usa `DeleteMealButton`. Usa el mismo
     `useConfirm` y la misma `deleteMealAction`; la razón está en el impl.

### Otros chequeos
- **E1.**
  - `createPlan` y `createTemplate` crean el dueño y `createDefaultWeeklyMeals` en una sola
    `$transaction` (`nutritionPlans.ts:33-38`, `planTemplates.ts:24-29`).
  - `createPlanForConsultation` lo hace dentro de su transacción (`consultations.ts:184-185`).
  - `applyTemplateToPatient` sigue copiando la plantilla exacta (D4).
  - Hay tests de domain para los tres.
- **E3.** `notify.undo` y `chartPalette.macro` coinciden con 7.9 y 7.10. `design-tokens.test.ts`
  incluye `macro` en el contraste.
- **D7/D11.**
  - `page.tsx` arma el objetivo con `getPlanTarget` y el rótulo "Objetivo: consulta del dd/MM/yyyy"
    en la zona de la profesional.
  - El link sin objetivo va a `/pacientes/{id}/consultas/{consultationId}` o a
    `/pacientes/{id}?tab=consultas`. Las dos rutas existen (`requirement-summary-card.tsx` usa las
    mismas).
- **D8.** "Repetir" pide confirmación solo si otros días tienen ítems (`meal-card-menu.tsx:71-87`).
- **D12.** Al pasar a "Cambia cada día", el toast dice "…; ya no es de opciones" (l. 89-94).
- **`?dia=`.**
  - `day-param.ts`: el día inicial es el de la URL si es válido; si no, "Semana" con el plan vacío y
    el lunes si tiene ítems.
  - La URL se sincroniza con `replaceState` (`meals-editor.tsx:117-123`).
- **Script 10.4** (`packages/db/scripts/test-weekly-menu.ts`).
  - Crea su propio paciente con un jid ficticio y aborta si ya existe uno con ese jid (l. ~110-118).
  - En el `finally` borra **solo por id** la plantilla, los planes y el paciente (l. 293-295) y
    después verifica los conteos por id.
  - No usa `deleteMany` por filtro, no encola en `OutboundMessage` y no llama a la IA.

## Checkpoints
- C1 backlog válido, 1 HU activa por responsable: [x]
- C1 bitácora del responsable al día: [x]
- C1 no toca archivos de HU de la otra persona: [x] (solo toca los archivos de código de la zona de Leo que autoriza la SDD 2.1)
- C1 `verify.sh` exit 0: [x]
- C2 HU completa: [x]
- C2 SDD con contrato: [x]
- C2 firmas = contrato (6.1, 7.1–7.10): [x] (extras `labels.ts`/`day-param.ts` declarados y puros)
- C3 lógica pura en core/puro, base en domain, sin duplicar web/bot: [x]
- C3 domain cambiado: web y bot compilan: [x]
- C3 migraciones: [x] (no aplica: no hay migración)
- C3 rutas protegidas / portal: [x] (sin rutas nuevas; el portal no cambia)
- C3 bot en silencio / textos: [x] (no aplica)
- C3 sin `console.log` de debug ni TODOs: [x] (`console.error("[weekly-menu]")` es el log de error de las actions)
- C4 typecheck limpio: [x]
- C4 tests de la lógica nueva y `npm run test` OK: [x]
- C4 flujo del bot simulado: [x] (no aplica)
- C4 PDF real: [x] (el recorrido generó el PDF del plan de prueba sin errores; los tests del PDF son de 018b-1)
- C5 impl con "018b-2": [x]
- C5 review con veredicto: [x]
- C5 sin scripts sueltos ni datos de prueba: [x] (los scripts son los de 10.3 y 10.4, que pide la SDD; el recorrido y el script borraron su paciente por id)

## Cambios requeridos
Ninguno.

## Dudas (no bloqueantes)
- **Foco al cerrar "Renombrar" y "¿Qué día conservar?".** Se abren desde un ítem del menú, que se
  desmonta (`modal={false}`). `returnFocus` puede apuntar a ese ítem, que ya no está conectado, y el
  foco quedaría en `body` en vez de volver al "⋯". Además, mientras la action corre, el "⋯" queda
  `disabled={busy}` (`meal-card-menu.tsx:132`) y pierde el foco. Lo mismo pasa al Subir/Bajar, que
  reordena la tarjeta. No lo pude verificar sin navegador. Probarlo con teclado en el PR y, si se
  pierde, devolver el foco al trigger del menú.
- **Recorrido, observación 1.** En la vista Semana, "Promedio diario de la semana" aparece dos veces:
  en la franja (`MacroTotals`, con decimales) y en la tarjeta de abajo (`weekly-overview.tsx:167-197`,
  enteros). Por eso se ve "1,4 g" contra "1 g". Las dos están en la SDD (7.2 y 7.5), pero conviene
  unificar el redondeo u ocultar una.
- **Recorrido, observación 2.** Desde `md`, la franja fija (`meals-editor.tsx:156`) tapa el encabezado
  de la tabla Semana al desplazar. Se podría hacer el `<thead>` sticky debajo de la franja o no fijar
  la franja en la vista Semana.
- **Franja sin objetivo.** Muestra el `<h2>` con el título y además el `MacroTotals` con el mismo
  `label` (`day-target-strip.tsx:144-145`), así que el texto puede salir repetido.
- **Opciones.** Prender o apagar "Opciones (elige una)" muestra un toast de guardado. La SDD 7.4
  dice "sin toast con Deshacer", y no lleva Deshacer, así que cumple.
- **Auth de las actions.** `weekly-menu-actions.ts` no llama a `auth()`: depende del middleware, como
  las demás actions del panel (patrón del repo, no de esta HU). Conviene revisarlo aparte porque el
  matcher excluye `/portal`.
- **PR.** Avisar que, después de `db:migrate`/`db:generate`, hay que reiniciar `npm run dev` (lo
  anota el recorrido: el cliente de Prisma viejo tiraba `Unknown argument mode`).
