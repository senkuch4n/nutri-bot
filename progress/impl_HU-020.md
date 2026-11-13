# impl HU-020 · Importar planes alimentarios desde PDF como plantillas

Estado: **done**. Rama `feat/HU-020-importar-planes-pdf` (al día con `origin/develop`: 0/0 commits, no
hizo falta rebase). Sin commits (los hace el orquestador). No se tocó `backlog/`.

SDD: `Refactorizaciones/importar-planes-pdf.md`, checklist 9 A→D completo. Skills: `skills/migracion-prisma.md`
(B1), `apple-design` (leído desde `.claude/skills/apple-design/SKILL.md`: el Skill tool no lo encontró),
`ui-ux-pro-max` (pautas de error inline + foco y estados deshabilitados con motivo) y
`web-design-guidelines` (autochequeo; ver al final).

## Archivos

### packages/core
- `src/sara2/lines.ts` (nuevo) + `lines.test.ts`: `Word`, `Seg`, `Line`, `median`, `makeSeg`, `buildLines`,
  `isRotated`, `pageLines` movidos tal cual de `recipe-import/extract.ts`. Extra: `pageWords(page)` (las 3
  líneas de `extractPage` que filtran vacías y calculan `h`/`yc`), usado por `extract.ts` y `pageLines`.
- `src/recipe-import/extract.ts`: importa la geometría de `../sara2/lines` (tests de recipe-import sin tocar, verdes).
- `src/recipe-import/__fixtures__/synthetic.ts`: se exportan `LineSpec`, `words` y `page` (para el fixture nuevo, sin duplicar).
- `src/plan-templates.ts` (nuevo, exportado en `src/index.ts`) + test: tipos de avisos, `parseTemplateHints`,
  `unplacedCount`, `canPublishTemplate`, `templateHintText`, `PLAN_SECTION_LIMITS`, `validatePlanSectionInput`,
  `hasQuantifiedItems`, `hasAnyItem`, `PLAN_IMPORT_TEXT`, `PLAN_SECTION_TEXT` (textos de 5.1.1). Extras:
  `MENU_SECTION_LABELS`, `PlanSectionErrorCode`, `PLAN_IMPORT_TEXT.importedPublished` ("Importada de PDF",
  7.1), `recipeLink`/`recipeKeepText`, `PLAN_SECTION_TEXT.edit`.
- `src/plan-import/{index,types,sections,personal-data,meal-mapping,menu,recipe-match,parse}.ts` + tests de
  cada uno y `__fixtures__/synthetic-plan.ts` (inventado: "Marta, Ejemplar 03/04/25", "Lic. Profesional
  Inventada M.P 0000", comidas inventadas). `package.json` → `exports["./plan-import"]` (no se exporta desde
  el índice).

### packages/db
- `prisma/schema.prisma` (4.1) y migración `prisma/migrations/20261025173320_plan_template_import/`.
- `domain/planTemplates.ts`: `listTemplates({ status? })` con `select` de 6 campos y orden
  `[{status},{title}]`; `getTemplate` trae `sections`; `TemplateNotPublishedError`;
  `applyTemplateToPatient` rechaza DRAFT y copia `sections`.
- `domain/nutritionPlans.ts`: `getPlan` incluye `sections`.
- `domain/planSections.ts` (nuevo) + test; `domain/planTemplateImport.ts` (nuevo) + test; `domain/index.ts` exporta los dos.
- Tests ajustados: `planTemplates.test.ts` (mock con `status`/`sections` + casos nuevos), `weeklyMenu.test.ts` (mock).
- `scripts/lib/cli.ts` (nuevo: `argValues`, `hasFlag`, `run`, `describeDbTarget`, `confirmWrite(message?)`);
  `scripts/recipes/extract.ts` e `import.ts` los importan. `scripts/plans/{import,undo}.ts` (nuevos).
- `package.json`: `plans:import`, `plans:import:prod`, `plans:undo`, `plans:undo:prod`.
- `tsconfig.json`: `include` suma `scripts/lib/**` y `scripts/plans/**` (si no, tsc no los chequeaba).

### apps/web
- `lib/touch-template.ts` (nuevo); `lib/revalidate-menu-owner.ts` (rama template → `touchTemplate`);
  `plantillas/actions.ts` (los 5 `revalidatePath` de plantilla → `touchTemplate`).
- `pacientes/[id]/page.tsx` (`listTemplates({ status: "PUBLISHED" })`); `pacientes/[id]/planes/actions.ts`
  (DRAFT y `TemplateNotPublishedError` → `draftNotApplicable`) + `actions.test.ts` (nuevo).
- `(panel)/plan-section-actions.ts` + test; `components/plan-sections/{types.ts,plan-sections-editor.tsx,section-sheet.tsx}` + `plan-sections-editor.test.tsx`.
- `plantillas/import-actions.ts` + test; `components/template-import/{types.ts,template-review.tsx,link-recipe-dialog.tsx,move-unplaced-dialog.tsx}`.
- `plantillas/[id]/page.tsx`: bloque de revisión (si DRAFT), "Plantilla · Borrador · N comidas", Textos del
  plan debajo del MealsEditor, texto nuevo del Card de datos.
- `plantillas/page.tsx` + `templates-table.tsx`: chip `Borrador`, subtítulo de importadas, borradores arriba.
- `components/meals-editor.tsx`: D10 (Alert info en lugar del strip) y `TextItemLabel` (ítem libre plegado a 2
  renglones con "Ver completo/Ver menos", `aria-expanded`). Recetas y medidas sin cambios.
- `pacientes/[id]/planes/[planId]/page.tsx` (editor de secciones) y `actions.ts` (`sections` al PDF).
- Portal: `portal/plan/page.tsx` (`include.sections`) y `plan-view.tsx` (`<details>` por sección, cerrados,
  h2 `sr-only` "Textos del plan" para la jerarquía).
- `lib/plan-pdf.tsx` (`sections?`, después de totales y antes de Notas, sin `wrap={false}`) + 2 tests.
- Tests existentes ajustados por el cambio de tipos/T10: `weekly-menu-actions.test.ts` (`markTemplateReviewed`
  y revalidación de `/plantillas` + `/plantillas/t1`), `lib/food-policy.test.ts` (mocks con `sections`,
  `status`, `markTemplateReviewed`, `TemplateNotPublishedError` y mocks de las actions nuevas).

### apps/bot
Sin cambios de código. Typecheck y tests verdes.

## Migración

- Respaldo previo: `~/respaldos/nutribot-dev-HU-020-20261025-173152.dump` (fuera del repo).
- `migrate status` antes: "Database schema is up to date" (25 migraciones, sin drift).
- **Desvío de herramienta (mismo precedente HU-005/006/007/014):** `prisma migrate dev --create-only` se negó
  ("environment is non-interactive", por el aviso del índice único de `importKey`). Generé el SQL con
  `prisma migrate diff --from-schema-datasource prisma/schema.prisma --to-schema-datamodel prisma/schema.prisma --script`
  (solo lectura; **sin** `--from-migrations` ni shadow) y creé la carpeta a mano.
- SQL = el de 4.2: 2 `CREATE TYPE`, `ALTER TABLE "PlanTemplate"` con `status`/`origin` `NOT NULL DEFAULT`,
  `importKey`, `importHints JSONB`, `reviewedAt`; 2 `CREATE TABLE` con FK `ON DELETE CASCADE`; índices
  `PlanTemplate_importKey_key` (unique), `PlanTemplate_status_title_idx`, `PlanTemplateSection_templateId_order_idx`,
  `PlanSection_planId_order_idx`. `grep -ciE "drop|alter column|rename"` → 0. No toca otras tablas.
- Aplicada con `npm run db:migrate` ("Your database is now in sync", sin oferta de reset) + `npm run db:generate`.
- `\d "PlanTemplate"`: `status`/`origin` NOT NULL con default, `importKey` text unique, `importHints` jsonb, `reviewedAt`.
  Plantillas previas en dev: 0 (como dijo el architect); `NutritionPlan` 11 antes y después.
- (Un `prisma format` accidental reformateó todo el schema: lo revertí con `git checkout` antes de crear la
  migración; el diff final del schema es solo lo de 4.1.)

## Decisiones no obvias

- **Letras espaciadas:** el texto de un tramo con letras espaciadas (≥ 4 fichas, ≥ 70 % de 1–3 caracteres, sin
  minúsculas) se junta por geometría: hueco > 0,25 × h = espacio entre palabras. En el PDF real las letras
  están a ~0,1 h y las palabras a ~0,41 h. Así "L I S TA  D E  C O M P R A S" → "LISTA DE COMPRAS" (aviso) y
  "V E G E TA L E S A" → "VEGETALES A".
- **`matchSectionHeading`** descarta textos de más de 8 palabras (salvo letras espaciadas): evita que un
  renglón que empieza con "Reemplazo …" abra la sección.
- **Objetivo en 2 renglones:** `personal-data.ts` conserva el renglón siguiente al objetivo si empieza en
  minúscula y está justo debajo (regla `cover-objective-continuation`); el resto de la portada se descarta y
  se cuenta (T4 b). Sin esto el título del PDF real quedaba cortado y el segundo renglón contaba como
  "línea de portada descartada".
- **Nota de macros en almuerzo y cena:** en el formato real la línea de macros va después de las dos
  etiquetas del día, así que la nota es **del día** y la llevan todos los ítems de ese día (5.2.1 dice
  "notes = la nota del día"). Una línea que solo tiene palabras de macros sigue la nota ya abierta ("fibra)").
- **Orden de los renglones del menú:** se usa el orden de `pageLines` (renglón por `yc`, tramos por x), no un
  re-sort por `y0`, porque en el PDF real hay renglones justificados partidos en varios tramos.
- **Texto:** subtítulo repetido en la página siguiente (p. ej. el mismo "REEMPLAZO (…)") se omite; cambio de
  página = párrafo nuevo; renglón que empieza con viñeta va en renglón propio.
- **Colaciones:** una línea de macros debajo de una opción se ignora (no es opción). Combinaciones > 500 van
  enteras a "Texto sin ubicar" una sola vez aunque vayan a 2 comidas.
- **Comidas sin ítems no se crean** (p. ej. una tanda sin "Cena"); `MISSING_DAYS` solo para comidas con ítems.
- **Avisos en orden:** UNKNOWN_SECTION → por sección de menú (TANDAS, SAME_CONTENT, MISSING_DAYS) →
  RECIPE_SUGGESTION → PATIENT_NAME_REPLACED → COVER_LINES_DROPPED → UNPLACED; ids `h1…hn`.
- **`upsertImportedTemplate`:** un solo `create` anidado (comidas + ítems + secciones) con `select` de los ids,
  y después un `update` de `importHints` con `itemId` resuelto por (comida, día, orden). Mismo esquema al
  pisar un borrador sin revisar (guarda `updateMany` + `deleteMany` por `templateId` de **ese** id).
- **`resolveUnplacedHint`** valida el día contra el modo de la comida dentro de la transacción (misma regla
  y error que `assertWeekdayMatchesMeal`, que usa `prisma` fuera de la tx) y exige `templateMeal.templateId`.
- **`publishTemplate`** usa `Prisma.DbNull` para vaciar `importHints`; publicar una ya publicada es no-op.
- **Textos de UI que la SDD no fija:** botón "Mover" y "Cancelar" en diálogos, label "Comida"/"Día"/"Texto del
  plan", descripción del diálogo de Vincular ("«…» pasa a ser la receta, con las porciones que elijas.") y
  del confirm de Descartar ("No se guarda en ningún lado. No se puede deshacer."), "Se borra solo este texto."
  en el confirm de borrar sección, contador "n / 20.000".
- **Tests de core:** las cadenas de ejemplo de `normalizeCombo` de la SDD 11.2 se parecían a frases del PDF
  real; usé equivalentes inventados con el mismo caso ("Café + pan de centeno +ricota", "ensalada ( pepino +rúcula)").
- **Sesión vencida** en las actions nuevas: `RECIPE_TEXT.sessionExpired` (texto existente, no uno nuevo).

## Contrato compartido

Firmas de 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7 y 5.8 respetadas con los mismos nombres. Diferencias menores:
`LUNCH_DINNER_LABELS` es `{ re, meals }` + helper `matchLunchDinnerLabel`; `splitTandas(days): Weekday[][]`;
extras exportados mencionados arriba (`pageWords`, `compactHeading`, `isLetterSpaced`, `isDecorativeLabel`,
`sectionKind`, `isMacroContinuation`, `redactCoverName`, `isCoverObjective`, `MENU_SECTION_LABELS`). `apps/bot`
no consume nada nuevo.

## D1 · Prueba con el PDF real (solo contadores)

Base de desarrollo (`localhost:5433/nutribot`), sin bot de WhatsApp involucrado (nada de esta HU encola).
- En seco: `PDF: 1 leídos · 0 sin formato reconocible` · `Comidas: 9 · ítems de texto 65 · recetas 0 ·
  sugerencias 0` · `Secciones: 5 · texto sin ubicar: 0 · nombres reemplazados: 0 · líneas de portada
  descartadas: 0` · 15 páginas · 29 tramos de pie descartados · 3 avisos (2 TANDAS, 1 SAME_CONTENT).
  Comidas: 2 tandas de desayuno/merienda y 2 de almuerzo/cena, 7 días cada una, + Colaciones (9 opciones).
- Chequeo de fuga (solo conteo, en la salida del parser): 0 apariciones de las palabras del nombre de
  portada, de la fecha, de "Lic." y "M.P", y del nombre de la profesional.
- `--write` (SI): `PDF 1 de 1: creado`. Reimportar con `--write --yes`: `actualizado` (misma plantilla, no se
  duplicó). En la base: 1 plantilla `DRAFT/IMPORT`, sin revisar, 9 comidas, 5 secciones, 3 avisos.
- **No revisé la UI en el navegador**: el panel corriendo en :3000 (del usuario) pide login de Google y no
  tengo sesión. La UI quedó cubierta por typecheck, los tests de componente/acciones y los de páginas en
  `food-policy.test.ts`. Queda para el recorrido del orquestador.
- `plans:undo` con la corrida del `--write`: `Corrida con 1 plantillas creadas: 1 borradas. 0 quedan`.
  Después: `PlanTemplate` 0, `PlanTemplateSection` 0, `TemplateMeal` de ese id 0, `NutritionPlan` 11.
- Quedan archivos locales ignorados en `docs/planes-alimentacion/_importacion/` (reporte + 2 corridas). B5
  regeneró `docs/recetarios/_extraccion/reporte.md` (ignorado) con 1 archivo en seco.

## Verificación (10.1)

- `npm run db:generate` OK · `prisma migrate status` → "Database schema is up to date!"
- `npm run typecheck` → 0 errores en core, db, **bot** y **web**.
- `npm run test` → 169 archivos, **2526 tests** OK.
- `vitest` core (sara2, recipe-import, plan-import, plan-templates) → 17 archivos, 133 tests.
- `vitest` db (planTemplates, planSections, planTemplateImport, weeklyMenu) → 4 archivos, 85 tests.
- `vitest` web (plantillas, plan-section-actions, plan-sections, plan-pdf) → 4 archivos, 26 tests.
- `vitest apps/bot` → 7 archivos, 50 tests.
- `npm run recipes:extract --workspace packages/db -- --file <uno>` en seco: igual que antes (22 borradores, 0 gramos sin token).
- `./ops/harness/verify.sh` → "Arnés OK" (avisos manuales: migración nueva; "se tocó el bot" — no hay cambios
  en `apps/bot/`, es el aviso genérico porque cambian los tipos de Prisma).

## Autochequeo web-design-guidelines

Corregido: el sheet de textos lleva el foco al campo con error. Revisado OK: botones de ícono con nombre
(menú "…" con `aria-label` específico), `aria-expanded`/`aria-controls` en "Ver completo", motivo del botón
deshabilitado por `aria-describedby` (Publicar y Agregar texto), `<details>/<summary>` con foco visible y
`motion-reduce`, `[overflow-wrap:anywhere]` en textos largos, números con `toLocaleString("es-AR")`,
"Publicando…" con elipsis. Sin cambios: "Publicar" deshabilitado con líneas sin ubicar (lo pide la HU).

## Pendientes para el usuario / orquestador

- **Antes del merge a `develop`, migrar Neon** (10.3 paso 1): `cd packages/db && DATABASE_URL="<DATABASE_URL_UNPOOLED de prod>" npx prisma migrate deploy`
  y confirmar con `migrate status`. Sin eso, `/plantillas`, la ficha, el plan y el portal fallan en producción.
- Importar en producción (10.3 paso 4): `pg_dump` fuera del repo, `plans:import:prod` en seco y con `--write`;
  guardar la corrida; después de la revisión, borrar los PDF y `_importacion/` (D12).
- **Aviso a Leo (7.6):** HU-015 debe usar `PlanSection`/`PlanTemplateSection` para sus textos editables;
  HU-017e puede restilar `components/template-import/*` y `components/plan-sections/*`. Archivos de su zona
  tocados (cambios chicos, comentados `HU-020`): `plantillas/{page,templates-table,[id]/page}.tsx`,
  `meals-editor.tsx` (strip y `<li>` de texto), `portal/plan/plan-view.tsx`, `lib/plan-pdf.tsx`,
  `planes/[planId]/page.tsx`. Dejarlo en el issue #48 y en el PR.
- Recorrido visual del panel (borrador en `/plantillas`, que no aparezca en "Aplicar plantilla", publicar,
  textos del plan, portal y PDF) — no lo pude hacer sin sesión.
