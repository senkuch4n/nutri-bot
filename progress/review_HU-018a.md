# Review — HU-018a

## 018a-1 (recetario manual, fases P y A–F), ronda 1

**Veredicto:** CHANGES_REQUESTED

Diff revisado: `git diff a3af6b3..HEAD` (fa65a47, 5793bfb, 49be1c7, 969812c, 4e65ba2, 11b37e9), contra la SDD
`Refactorizaciones/recetario.md` (3.x, 4.1, 4.2, 4.4, 5.1, 5.4, 6.x, 7.1–7.4, 9, 10 P–F, 11, 12, 15) y la HU
`docs/hu-plan-recetas-buscador.md` (Gherkin 018a).

Comandos que corrí yo (2026-10-03 07:50):
- `npm run typecheck`: OK en core, db, bot y web.
- `npm run test`: 87 archivos, 1537 tests, todos OK.
- `npm run lint --workspace apps/web`: OK. Solo queda el warning anterior a la HU (`ajustes/logo-form.tsx:36`).
- `./ops/harness/verify.sh`: "Arnés OK", exit 0. El WARN "se tocó el bot" sale por `packages/db`; no hay cambios en `apps/bot`.
- `prisma migrate status`: 23 migraciones, "Database schema is up to date!".
- Consulta de solo lectura a la base de desarrollo:
  - `Recipe` 0 y `RecipePhoto` 0;
  - 0 pacientes con el teléfono 5490000018001;
  - 0 `PlanMealItem` con `recipeId`.
  - No quedan datos de prueba.

No corrí `next build`, porque hay un `next dev` en marcha.

## Checkpoints
- C1 backlog válido, 1 HU activa por responsable: [x] (verify.sh: "senkuch4n: HU-018a").
- C1 bitácora refleja la HU: [x].
- C1 no toca HU de la otra persona: [x]. No hay cambios en `food-picker.tsx`, `food-catalog.tsx`, `meals-editor.tsx`, `meal-view.ts`, `alimentos/**`, `planes/**`, `plantillas/**`, `portal/plan/**`, `weeklyMenu.ts`, `nutritionPlans.ts`, `planTemplates.ts`, `foods.ts` ni `middleware.ts`. En el schema solo entran las 2 columnas nullable, los `@@index([recipeId])` y `Food.recipeIngredients`.
- C1 verify.sh exit 0: [x].
- C2 HU completa: [x].
- C2 SDD con contrato y checklist: [x].
- C2 firmas = contrato: [x]. Las firmas de 4.1, 4.2, 5.1 y 5.4 y `RecipeActionState` coinciden. Los agregados no rompen nada (`id?` en `ok:false`, claves extra en `RECIPE_TEXT`, `isRecipe*Key`, `recipePhotoUrl`).
- C3 lógica pura en core y dominio en db: [x]. `computeRecipeMacros`, porciones, `compareWithPublished`, validación y búsqueda están en `packages/core/src/recipes.ts`. Las consultas están en `packages/db/domain/recipes.ts`, sin duplicarlas en web.
- C3 web y bot compilan: [x]. `sharp` está declarado solo en `packages/db/package.json` y se exporta por `./media`. `grep` de `sharp` y `db/media` en `packages/db/domain` y `apps/bot`: nada. Solo lo importan `recetas/actions.ts`, su test y el script.
- C3 migración: [x]. `20261003102553_recipes` es aditiva:
  - 6 `CREATE TYPE` y 4 `CREATE TABLE`;
  - `ADD COLUMN` nullable y sin default en `PlanMealItem` y `TemplateMealItem`;
  - los 2 únicos y los 6 índices de 3.2;
  - las FK que pide la SDD: RESTRICT en los ítems, CASCADE en ingredientes, foto e imágenes, y SET NULL en `RecipeIngredient.foodId`;
  - ningún `DROP` ni `ALTER COLUMN`.

  Es segura para `migrate deploy`. El desvío de los arrays sin `NOT NULL` lo acepto: ver Dudas.
- C3 rutas protegidas y portal acotado: [x].
  - `api/recetas/fotos/[photoId]/route.ts:12-13` exige `auth()`.
  - `portal/recetas/fotos/[photoId]/route.ts:15-21` usa `getPortalPatient()` y `patientCanSeeRecipePhoto(patient.id, photoId)`. El `patientId` sale de la sesión, nunca de la query, y si no corresponde devuelve 404 sin distinguir el motivo.
  - Las 3 actions chequean `auth()` (`actions.ts:109`, `:174`).
- C3 bot en silencio y textos: [x]. No aplica: no hay mensajes de WhatsApp.
- C3 sin console.log de debug ni TODOs: [x]. Los `console.error` loguean solo `errorCode(err)`.
- C4 typecheck: [x].
- C4 tests de core y npm run test: [x]. Hay 35 tests en `recipes.test.ts` y 6 en `recipe-photo.test.ts`, y cubren los casos de 11.1.
- C4 flujo del bot simulado: [x]. No aplica. `test:recipes` crea sus propios datos y borra por id (`scripts/test-recipes.ts:46-50`). Además verifiqué que la base quedó limpia.
- C4 PDF/documento: [x]. No aplica.
- C5 impl existe: [x].
- C5 review con veredicto: [x].
- C5 sin datos de prueba en la base: [x].
- **Editor coherente con 7.3, `useUnsavedChangesGuard`: [ ]**. Ver el cambio requerido 1.

## Cambios requeridos (si CHANGES_REQUESTED)

1. **Falso "¿Salir sin guardar?" después de guardar con una foto nueva o con "Quitar foto" en una receta existente.**
   - **Dónde:** `apps/web/src/app/(panel)/recetas/recipe-form.tsx`.
   - **Qué pasa:**
     - El snapshot de "sin guardar" incluye la foto y el quitar foto: `snapshot = JSON.stringify({ payload, credit, photo: photoFile ? photoFile.name + photoFile.size : null, removePhoto })` (línea 377).
     - Al guardar bien, se fija `setBaseline(savedSnapshot)` con la foto todavía cargada, y en seguida se limpian `setPhotoFile(null)` y `setRemovePhoto(false)` (líneas 477 y 482-484).
     - El snapshot nuevo ya no coincide con el baseline, así que `dirty` queda en `true` sin que nada lo vuelva a `false`.
     - En el flujo de edición (`recipe` no null) se hace `router.refresh()` (línea 487) y la pantalla sigue montada.
     - Pasa lo mismo en la rama `photoError` con `res.id` (líneas 497-500).
   - **Cómo reproducirlo:** abrir una receta publicada, subir una foto, "Guardar" (toast "Receta guardada") y después tocar "‹ Recetas" o el menú lateral. Aparece "¿Salir sin guardar? Los cambios de esta receta se van a perder." y al recargar sale el `beforeunload`, aunque todo se guardó.
   - **Por qué importa:** le hace creer a la profesional que la foto no se guardó, y la puede llevar a subirla de nuevo. Va contra la intención de 7.3: el guard es para cambios sin guardar.
   - **Qué tiene que cumplir el arreglo:** después de un guardado OK, `dirty` vuelve a `false`, con foto nueva, con "Quitar foto" o sin tocar la foto.
   - **Test:** si se puede, agregar un test que lo cubra o dejarlo anotado en el recorrido.

## Dudas (no bloqueantes)

- **307 en vez de 401 en `/api/recetas/fotos/<id>` sin sesión. No es un defecto contra la SDD.**
  - La propia SDD 6.3 dice: "`/api/recetas/*` queda cubierto por NextAuth igual que `api/professional/logo`. No se toca el middleware". Y 9.2 prohíbe tocar `middleware.ts`.
  - El matcher (`apps/web/src/middleware.ts:8`) no excluye `/api/recetas`, así que la redirección al login llega antes que el handler. Es el mismo comportamiento que ya tiene `api/professional/logo`.
  - El 401 del handler queda como segunda línea de defensa y tiene su test (`route.test.ts:19`).
  - No se expone la foto. Lo que estaba mal era la expectativa del paso 10 de 12.2 y del reporte del implementer.
  - Si se quiere 401 JSON en todas las APIs, es una tarea aparte sobre el middleware.
- **Arrays de enum sin `NOT NULL` (`moments` y `tags`). Lo acepto.**
  - Prisma 5 genera así toda lista escalar en Postgres. Si se agregaba el `NOT NULL` a mano en el SQL, aparecería drift contra el schema en la próxima `migrate dev`.
  - Las tablas son nuevas, el default es `ARRAY[]` y todas las escrituras pasan por Prisma, que tipa el campo como `RecipeMoment[]`.
  - Riesgo residual: un `INSERT` a mano con `NULL` haría fallar `c.moments.includes` en `filterRecipes`.
- **Fila de ingrediente con solo "Medida casera"** (sin alimento, texto ni gramos): se descarta en silencio al guardar (`recipe-form.tsx:327`). Es un caso borde, pero la medida casera escrita se pierde sin aviso.
- **`updateRecipe` sobre un DRAFT no valida rangos.**
  - zod deja pasar `yieldPortions` hasta 100000, y la columna es `DECIMAL(5,1)`.
  - Con un valor así, el overflow de la base termina en el error genérico "No se pudo guardar".
  - En 018a-1 no hay borradores. Conviene acotarlo en 018a-2, cuando exista `saveDraftAction`.
- **Rinde, porción y gramos usan un `DecimalInput` propio en vez de `NumberInput`.** Es un desvío justificado (coma decimal en todos los navegadores) que mantiene el estilo y `h-11`. Para unificar después.
- **El recorrido de Chrome no cubrió** la foto (subida, formatos y tamaño), archivar/publicar, el celular ni el teclado. Después del arreglo 1, conviene recorrer al menos foto → guardar → salir, y archivar → "Deshacer".

---

## Ronda 2 (018a-1, commit `87e8c42`)

**Veredicto:** APPROVED

Comandos que corrí yo:
- `npm run typecheck`: OK en core, db, bot y web.
- `npm run test`: 88 archivos, 1543 tests OK. Son los 6 nuevos de `recipe-form-state.test.ts` más los de antes.
- `npm run lint --workspace apps/web`: OK. Solo queda el warning anterior (`ajustes/logo-form.tsx:36`).
- `./ops/harness/verify.sh`: "Arnés OK", exit 0.
- Base de desarrollo (solo lectura): `Recipe` 0 y `RecipePhoto` 0. La receta del recorrido de la ronda 2 quedó borrada.

### Hallazgo 1 de la ronda 1 (falso "¿Salir sin guardar?"): resuelto

- La huella de referencia ahora se toma con `snapshotAfterSave(dirtyState)` (`recipe-form.tsx:488`). Esa función (`recipe-form-state.ts:28-30`) arma la huella con `photo: null` y `removePhoto: false`, que es el mismo estado en que queda el form después de limpiar.
- **Foto nueva y guardado OK:** `setBaseline(savedSnapshot)`, `setPhotoFile(null)` y `setRemovePhoto(false)` (líneas 494-496). La huella viva vuelve a coincidir con el baseline, así que `dirty` queda en `false`.
- **"Quitar foto" y guardado OK:** el mismo camino. Además, `gonePhotoId` (líneas 233-236 y 497) oculta la foto vieja hasta que llega el `router.refresh()`, así no reaparece un instante. `displayUrl` y el envío del crédito dependen de `existingPhotoId`, que ya la excluye, así que no queda ningún `photoCredit` colgado.
- **Rama `photoError` con `res.id`:** baseline post-guardado, `setPhotoFile(null)`, `setPreviewUrl(null)` y `setRemovePhoto(false)` (líneas 509-515). `dirty` queda en `false`.
  - Si lo que falló fue el "Quitar foto", la foto vieja vuelve a verse, porque `gonePhotoId` solo se fija en la rama OK.
  - Es correcto: la foto sigue en la base y el form muestra `photoSaveError`.
- **El crédito no rompe la huella:** el estado `credit` no se toca al guardar y entra igual en la huella y en el baseline.
- **Tests:** `recipe-form-state.test.ts` cubre los 3 casos más "un cambio posterior vuelve a marcar dirty". Simulan exactamente el par baseline/estado posterior que usa el form.
  - No hay test del componente (el repo no tiene jsdom).
  - El orquestador lo confirmó en Chrome para el caso de foto nueva.

### Lo que agregó de más: no rompe nada

- **`rowHasContent`** (`recipe-form-state.ts:33-41`) suma la medida casera. Se usa en los dos filtros, el del payload (línea 331) y el de `filledRowKeys` (línea 345), así que los índices de los issues siguen alineados con las filas.
  - Una fila con solo medida casera ahora llega a `validateRecipeForPublish` y da `errIngredientEmpty` junto al picker, en vez de perderse en silencio.
  - La fila vacía por defecto se sigue ignorando.
- **Topes de zod** (`actions.ts:50` y `:72`): `yieldPortions` ≤ 9999 (`DECIMAL(5,1)`) y `grams` ≤ 99999 (`DECIMAL(7,2)`).
  - Las recetas publicadas igual pasan por el tope de core (≤ 999 porciones), así que no cambia nada para ellas.
  - Solo cierra el hueco del borrador.
  - Residual despreciable: 9999,95 redondearía a 10000,0 en `DECIMAL(5,1)`.
- **Paso 10 del recorrido:** el texto quedó corregido a 307, en línea con mi duda de la ronda 1.
- **Alcance:** no se tocaron el schema, el dominio, el bot, la zona de Leo ni la base.

### Nota del recorrido: dos `form` y dos `h1` en `/recetas/nueva`

**No es la foto de salida de una transición de la HU-017a, y tampoco un render duplicado del código.**

En el código no hay nada que dibuje el form dos veces:
- `nueva/page.tsx` monta un solo `<RecipeForm>`;
- `(panel)/layout.tsx` dibuja `{children}` una sola vez dentro de `<main>`, y `AppSidebar` también (`app-sidebar.tsx:109`);
- `PageHeader` dibuja un solo `h1` (`components/ui.tsx:92`);
- no existe ningún `template.tsx`;
- no hay transición de página que congele el árbol saliente (ni `AnimatePresence` de rutas, ni `FrozenRouter`, ni `ViewTransition`). Las animaciones de 017a son de overlays: dialog, sheet y popover.

Lo más probable es un artefacto de `next dev`. Hay dos candidatos:
- el chunk de streaming de Suspense (`loading.tsx`), que Next manda primero dentro de un `<div hidden id="S:…">` y después mueve;
- un remonte por Fast Refresh mientras el implementer editaba `recipe-form.tsx`. Eso también explica que se perdiera el primer llenado.

No bloquea. Si el orquestador quiere descartarlo:
1. Mirar si la copia oculta está dentro de `div[hidden][id^="S:"]`.
2. Mirar si persiste después de que termina de cargar o en un build de producción.

Si persistiera en producción, sería un hallazgo aparte y no de esta HU.

### Checkpoints (ronda 2)

Todos los de la ronda 1 siguen en [x]. Además:
- Editor coherente con 7.3, `useUnsavedChangesGuard`: [x]. Ver arriba.

### Dudas que siguen abiertas (no bloqueantes, heredadas)

- Arrays sin `NOT NULL`: aceptado.
- `DecimalInput` en lugar de `NumberInput`: unificar más adelante.
- El recorrido de Chrome todavía no cubrió:
  - "Quitar foto" → Guardar → salir;
  - archivar → "Deshacer";
  - el celular (390 px);
  - el teclado.

  Conviene hacerlo antes del PR.

---

# 018a-2 (carga asistida, fases G, H, I y K), ronda 1

**Veredicto:** APPROVED

- Rama `feat/hu-018a2-carga-asistida`. Diff `git diff 878b88a..HEAD`: `379204d`, `1cce855`, `bc034b7`, `872f637` y `cccfd78`.
- Contra la SDD `Refactorizaciones/recetario.md`: 4.3, 5.2, 5.3, 6.1–6.3, 7.5, 8.x, 9, 10 G–K y 11. Con la §12 aceptada, incluida la 12-D8, y la §15.

## Comandos que corrí yo (2026-10-03)

- `npm run typecheck`: OK en core, db, bot y web.
- `npm run test`: 95 archivos, 1619 tests OK.
- `npm run lint --workspace apps/web`: OK. Solo el warning anterior (`ajustes/logo-form.tsx:36`).
- `./ops/harness/verify.sh`: "Arnés OK", exit 0. El WARN del bot sale por `packages/db`: no hay cambios en `apps/bot`.
- **No corrí** `next build`, el extractor con `--write` ni el import.
- Base de desarrollo, solo lectura:
  - 8 DRAFT IMPORT (los de muestra) y 1 PUBLISHED MANUAL (la que ya había);
  - **1 de los 8 borradores tiene `reviewedAt`** (ver Dudas).

## Puntos pedidos

1. **No se inventan gramos: [x].**
   - **Parser:** `ingredient-line.ts:91-94` saca `grams` solo de `gramValuesIn`, que exige un token `<número> g|gr|gramos|kg`.
     - Con dos valores distintos o un rango, `grams` queda en `null` con `AMBIGUOUS_GRAMS`.
     - Nunca se convierten cc ni medidas caseras.
     - `extract.ts` no asigna gramos por otro camino: solo usa `parseIngredientLine`.
     - En la base, `recipeImport.ts:63` guarda `grams` solo si no es c.n., y `foodId` siempre en `null`.
   - **Casos cubiertos en `ingredient-line.test.ts`:**
     - "aprox." da `APPROX` con los gramos del token (300);
     - "c.n", "c/n" y "a gusto" dan `noQuantity`, sin gramos;
     - "Huevo una unidad" y "Leche una taza" dan `HOUSEHOLD_ONLY` con `grams: null`;
     - "Una cebolla y morrón picados" da `MULTI_FOOD`, sin gramos;
     - "30 g o 40 g", "120 a 180g" y "60g (170g cocida)" dan `null` con `AMBIGUOUS_GRAMS`.
   - **Hay tres controles:**
     - el test de propiedad sobre 30 líneas, con una regex independiente;
     - `extract.test.ts:122`, sobre todos los borradores sintéticos;
     - `assertNoInventedGrams` en `scripts/recipes/extract.ts:68-82`, con su propia regex, que corta la corrida antes de escribir.
2. **Nada de terceros en el repo: [x].**
   - El diff tiene solo `.ts`/`.tsx`/`.json`: ni imágenes ni binarios.
   - `git ls-files | grep recetarios` da vacío.
   - `git check-ignore` confirma que `docs/recetarios/_extraccion/*` y `_exportacion/*` están ignorados (regla `docs/recetarios/`, `.gitignore:23`).
   - **Comparación contra los PDF:** pasé el texto de los 29 PDF locales por `pdftotext` a un directorio temporal fuera del repo, que ya borré, y lo comparé contra todos los literales del diff.
     - Las coincidencias son de dos tipos.
     - **Ejemplos que la propia SDD 11.1 pide textualmente:** "Harina integral 100 g (3/4 de taza)", "Puré de calabaza una taza (son 300g en crudo aprox.)", "Aceite de oliva 50cc (¾ de pocillo de café)", "Una cebolla y morrón picados" y "Huevo una unidad".
     - **Frases genéricas de pocas palabras:** "Leche de almendras", "Se pueden congelar", "Ingredientes", "12 unidades".
   - Las 20 líneas "inventadas" del test de propiedad y los fixtures de `__fixtures__/synthetic.ts` no aparecen textualmente en ningún PDF. Ninguna receta, procedimiento ni tabla se copió.
   - Por consola, el extractor imprime solo contadores. El reporte, las corridas y los bundles van a `docs/recetarios/` (ignorado).
3. **Export/import a producción: [x].**
   - **Es en seco por defecto:** `import.ts:31` solo escribe con `--write`.
   - **No hay atajo para escribir:**
     - con `--write` pide escribir `SI` (líneas 53-60) y **no acepta `--yes`**;
     - no lee el `.env`: exige `DATABASE_URL` en el entorno (línea 37);
     - el cliente Prisma se carga recién después de validar y confirmar (líneas 63-64);
     - no hay `.env` en `packages/db` ni en `packages/db/prisma` que Prisma pueda tomar solo.
   - **Es idempotente por `importKey`:**
     - `recipeTransfer.ts:186-190` hace `findUnique` por `importKey`. Si la receta ya existe, da `skipped-exists`;
     - un `P2002` en una carrera también da `skipped-exists` (líneas 320-323).
   - **Nunca pisa nada:**
     - solo hace `create` (de receta, ingredientes y foto, en una transacción);
     - no hay ningún `update` ni `delete`, así que no puede tocar una receta revisada ni datos ajenos.
   - **Alimentos:**
     - SARA2 se mapea por `sourceKey`;
     - PROPIO por nombre, con una sola coincidencia y los macros a ±0,01;
     - si no, la receta sale como `skipped-food`.
   - **Valida antes de crear:** corre `validateRecipeForPublish`.
   - **El export:**
     - exporta solo las PUBLISHED, por defecto con `origin = IMPORT`;
     - valida el bundle antes de escribirlo;
     - lo escribe en `_exportacion/` (ignorado).
4. **`recipes:undo`: [x].**
   - `extract.ts:373` guarda en la corrida **solo** los ids con `outcome === "created"`. Los "updated" de una corrida anterior no entran.
   - `deleteUnreviewedDrafts` (`recipeImport.ts:191-198`) borra con `id in ids AND status = DRAFT AND reviewedAt IS NULL`. No toca lo revisado, publicado ni archivado.
   - `upsertImportedDraft` tampoco pisa nada revisado:
     - repite `status: DRAFT, reviewedAt: null` en el `where` del `updateMany` (línea 126);
     - los `deleteMany` de ingredientes e imágenes son por `recipeId` de esa receta.
5. **Seguridad: [x].**
   - **Sesión:**
     - las tres actions de `revisar/actions.ts` pasan por `hasPanelSession()` (`auth()`): `saveDraft` en la línea 61 y `discardDraftAction` en la 140;
     - el payload pasa por el `payloadSchema` de zod compartido (`recipe-save.ts:29-64`);
     - la foto, por tamaño y magic bytes antes de guardar.
   - **Dueño:** el panel tiene una sola profesional, así que el dueño es la sesión.
     - `chooseImportCandidateAsPhoto` exige que la imagen sea de **esa** receta y de tipo CANDIDATE (`recipeImport.ts:178-181`), así que no se puede copiar una imagen de otra receta.
     - `publishRecipe` y `deleteDraftRecipe` exigen que la receta esté en DRAFT.
   - **Ruta de imágenes:** `api/recetas/importacion/[imageId]/route.ts:12-13` exige `auth()`, y además el middleware redirige sin sesión, igual que las fotos.
     - Responde 404 si la imagen no existe.
     - Usa `Cache-Control: private, max-age=3600`.
     - Tiene sus tests (4).
6. **Turbopack: [x].**
   - `recetas/actions.ts` y `revisar/actions.ts` (los únicos `"use server"` nuevos o tocados) exportan solo `export async function`.
   - Los tipos y las constantes pasaron a `recipe-save.ts`, que no es `"use server"`.
   - El cliente importa de ahí solo tipos: `recipe-form.tsx:55` es `import type`. Así `sharp` y `auth` no entran al bundle.
   - Revisé los otros `"use server"` del repo: solo declaran `export type X = …` locales, no re-exports.
7. **UX de la revisión: [x].**
   - **Atajos** (`recipe-form.tsx`, el `useEffect` de `onKey`): `⌘/Ctrl+↵` publica y sigue, y `⌘/Ctrl+S` guarda el borrador.
     - Hacen `preventDefault`.
     - El guard de `pending` evita los dobles envíos.
     - Llevan `aria-keyshortcuts` y se muestran en la barra.
   - **Enter no publica:** en modo revisión, `onSubmit` hace `preventDefault` y sale (`if (review) return`), y no hay botón submit.
   - **"¿Salir sin guardar?":**
     - "Saltar", el selector de recetario y "‹ Recetas" pasan por `guardNavigation` o por el interceptor de enlaces;
     - la candidata elegida entra en la huella de "sin guardar";
     - al publicar o descartar se fija el baseline antes del `router.push`.
   - **"Ninguna" ya aparece elegida:** lo acepto, no es un defecto.
     - La SDD dice "No se preselecciona ninguna [foto]".
     - "Ninguna" marcada es justamente el reflejo fiel de "no hay foto elegida". Un `RadioGroup` sin valor dejaría el grupo sin un estado legible para el lector de pantalla.
     - Lo que estaba mal era el texto del reporte ("sin ninguna elegida").
8. **Zona de imleticio: [x].** El diff no toca `food-picker.tsx`, `food-catalog.tsx`, `meals-editor.tsx`, `meal-view.ts`, `alimentos/**`, `planes/**`, `plantillas/**`, `schema.prisma`, migraciones, `middleware.ts` ni `apps/bot`.

## Checkpoints
- C1 backlog válido, 1 HU activa por responsable: [x].
- C1 bitácora: [x].
- C1 no toca HU ajenas: [x].
- C1 verify.sh exit 0: [x].
- C2 HU y SDD: [x].
- C2 firmas = contrato (4.3, 5.2, 5.3 y 6.2): [x]. Los agregados del reporte no rompen nada:
  - `DRY_RUN_ID`;
  - `discardDraftAction(id, file?)`;
  - `BULLETS` ampliado;
  - `--limit`.

  `recipeTransfer` no se exporta desde `domain/index.ts`, como pide la SDD.
- C3 lógica pura en core y dominio en db: [x]. El parser, `suggestFood` y el bundle están en `@nutri-bot/core/recipe-import` (subpath, fuera del índice).
- C3 web y bot compilan: [x].
- C3 migración: [x]. No aplica: no hay migración en 018a-2.
- C3 rutas protegidas: [x].
- C3 bot en silencio: [x]. No aplica.
- C3 sin console.log de debug: [x]. Los scripts imprimen solo contadores; las actions loguean solo `errorCode`.
- C4 typecheck: [x].
- C4 tests: [x]. Hay 76 nuevos: parser, extract, files, suggest, bundle, `recipeImport`, `recipeTransfer`, la ruta y las actions.
- C4 flujo del bot: [x]. No aplica.
- C4 PDF: [x]. No aplica.
- C5 impl: [x].
- C5 review: [x].
- C5 sin datos de prueba: [x]. Los 8 borradores son de muestra para el recorrido, a pedido del orquestador, con el procedimiento de limpieza documentado.

## Cambios requeridos

Ninguno.

## Dudas (no bloqueantes)

- **Limpieza de los borradores de muestra.** 1 de los 8 DRAFT tiene `reviewedAt` (lo marcó algún "Guardar borrador" o `⌘S` del recorrido).
  - `recipes:undo` **no** lo va a borrar, a propósito.
  - Hay que borrarlo por id, igual que lo que se publique en el recorrido.
- **Atajos con un diálogo abierto.** El `keydown` de los atajos está en `window` y no mira si hay un `useConfirm` abierto.
  - Con el confirm de "Descartar" o el de "¿Salir sin guardar?" en pantalla, un `⌘↵` dispararía "Publicar y seguir" detrás del diálogo.
  - Es un caso raro. Se puede ignorar el atajo si el evento viene de dentro de un `[role=alertdialog]` o `[role=dialog]`.
- **`saveDraftAction` y `publishDraftAction` no verifican que el id esté en DRAFT antes de `updateRecipe`.**
  - Si el borrador se publicó en otra pestaña, guardarlo desde la revisión edita la receta publicada (con validación, pero sin el aviso de uso de D10). Después `publishRecipe` responde "ya no está para revisar".
  - Es una carrera de una sola usuaria.
  - Conviene acotarlo cuando 018c use las recetas en planes.
- **Un "Publicar y seguir" que falla del lado del servidor igual deja el borrador guardado y con `reviewedAt`**, porque se guarda antes de publicar.
  - Es consistente con la SDD 6.2 ("Guarda + publishRecipe") y la validación local lo previene casi siempre.
  - Que lo sepa quien use `recipes:undo`.
- **Desvíos aceptables, documentados en el impl:**
  - filtro de decoración (≥ 3 páginas **y** ≥ 30 % del archivo);
  - umbral del nombre (75 % de la más alta);
  - `/recetas/revisar` vacío muestra el `EmptyState` en lugar de redirigir.
- **Pendiente del recorrido de Chrome:**
  - "Guardar borrador" y `⌘S`;
  - "Saltar" con cambios;
  - "Descartar";
  - el selector de recetario;
  - el celular y el teclado (pasos 8 a 13 del impl).
