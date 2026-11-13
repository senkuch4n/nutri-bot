# Implementación HU-018a: recetario

SDD: `Refactorizaciones/recetario.md` (§15: dos PR; 12 aceptada completa). HU: `docs/hu-plan-recetas-buscador.md`.
Rama `feat/hu-018a-recetario`. Implementer: Opus, con los skills `migracion-prisma`, `apple-design` y `ui-ux-pro-max`, y
`web-design-guidelines` como autochequeo.

## 018a-1: recetario manual (fases P y A–F)

**Estado: done.** Commits locales, sin push:

| Fase | Commit | Mensaje |
|---|---|---|
| A | `fa65a47` | HU-018a: lógica pura de recetas (macros por porción, porciones, comparación, validación, búsqueda, foto) |
| B | `5793bfb` | HU-018a: modelo de recetas (migración recipes) |
| C | `49be1c7` | HU-018a: dominio de recetas y procesamiento de fotos |
| D | `969812c` | HU-018a: actions de recetas y rutas de fotos (panel y portal) |
| E | `4e65ba2` | HU-018a: pantalla Recetas (grilla, buscador, ficha y editor con foto) |
| F | último commit de la rama (incluye este reporte) | HU-018a: script de flujo de recetas |

### P: preparación

- `git fetch`: `origin/develop` = `f9d91b0`, ancestro de HEAD. Ninguna rama remota toca `packages/db/prisma` respecto de
  `develop`. En `backlog/` la única HU en `implementando` es HU-018a.
- `docker compose ps`: db healthy (5433). `prisma migrate status`: "Database schema is up to date" (22 migraciones), sin drift.

### Archivos

Creados:
- `packages/core/src/recipes.ts`, `recipes.test.ts` (35 tests), `recipe-photo.ts`, `recipe-photo.test.ts` (6 tests).
- `packages/db/prisma/migrations/20261003102553_recipes/migration.sql`.
- `packages/db/media/recipe-photo.ts`, `recipe-photo.test.ts` (5 tests, sharp real con imágenes generadas en memoria).
- `packages/db/domain/recipes.ts`, `recipes.test.ts` (18 tests, prisma mockeado).
- `packages/db/scripts/test-recipes.ts`.
- `apps/web/src/app/api/recetas/fotos/[photoId]/route.ts` + `route.test.ts` (4 tests).
- `apps/web/src/app/(portal)/portal/recetas/fotos/[photoId]/route.ts` + `route.test.ts` (3 tests).
- `apps/web/src/app/(panel)/recetas/{page,loading,recipes-browser,recipe-form,recipe-portion-summary,actions}.tsx/ts`,
  `actions.test.ts` (12 tests), `nueva/page.tsx`, `[id]/{page,loading}.tsx`.
- `apps/web/src/components/recipes/{recipe-photo,macro-line,recipe-card,recipe-grid,recipe-grid-skeleton,chip-group,recipe-filters,ingredient-food-picker}.tsx`.
- `apps/web/src/lib/recipe-view.ts`.

Modificados:
- `packages/db/prisma/schema.prisma` (3.1: 6 enums, 4 modelos; `recipeId`/`portions` en `PlanMealItem` y
  `TemplateMealItem` (12-D1); `Food.recipeIngredients`).
- `packages/db/package.json` (`sharp ^0.35.4`, export `./media`, script `test:recipes`), `packages/db/tsconfig.json`
  (`media/**`), `packages/db/domain/index.ts` (`export * from "./recipes"`), `packages/core/src/index.ts`.
- `package-lock.json`: solo suma `"sharp": "^0.35.4"` a las dependencias de `packages/db`. La versión instalada no cambia
  (0.35.4) y no se bajó nada.
- `apps/web/next.config.mjs` (`bodySizeLimit: "6mb"` con el comentario nuevo y `serverExternalPackages` + `"sharp"`).
- `apps/web/src/components/shell/nav-config.ts` ("Recetas" con `ChefHat`, entre Alimentos y Plantillas).

**Zona de Leo:** no se tocaron `food-picker.tsx`, `food-catalog.tsx`, `meals-editor.tsx`, `meal-view.ts`, `weeklyMenu.ts`,
`nutritionPlans.ts`, `planTemplates.ts`, `foods.ts`, `plantillas/**`, `planes/**` ni `portal/plan/**`. En el schema
solo cambiaron las dos columnas nullable y la relación inversa. Se reusan sin modificar `useFoodCatalog`,
`FoodCatalogProvider`, `FoodSourceBadge`, `KcalBreakdownPopover` y `searchFoods`. **Para el PR:** "PlanMealItem/TemplateMealItem
tienen `recipeId`/`portions` (sin uso hasta 018c); `FoodPicker` no se tocó; hay un combobox controlado nuevo en
`components/recipes/ingredient-food-picker.tsx` que conviene unificar con el suyo en 017e".

### Migración `20261003102553_recipes`

1. Respaldo: `~/nutribot-backups/pre-recipes-20261003-0724.dump` (`pg_dump -Fc`, 308 KB), fuera del repo.
2. Conteo antes: PlanMealItem 132, TemplateMealItem 0, Food 980.
3. `npx dotenv -e ../../.env -- prisma migrate dev --create-only --name recipes`. El SQL revisado contra 3.2 tiene:
   - 6 `CREATE TYPE` y 4 `CREATE TABLE`;
   - `ADD COLUMN "portions" DECIMAL(3,1)` y `"recipeId" TEXT` (nullable, sin default) en PlanMealItem y TemplateMealItem;
   - los 2 únicos y los 6 índices de la SDD;
   - FKs: RESTRICT en los ítems, CASCADE en ingredientes/foto/imágenes y SET NULL en `RecipeIngredient.foodId`;
   - ningún `DROP` ni `ALTER COLUMN` y ninguna otra tabla.
4. `npm run db:migrate` (aplicó sin drift ni pedido de reset) y `npm run db:generate`.
5. Conteo después: PlanMealItem 132, TemplateMealItem 0, Food 980. Ítems con `recipeId` no null: 0. `migrate status`: up to date.

**Desvío:** Prisma 5 genera `moments`/`tags` como `"RecipeMoment"[] DEFAULT ARRAY[]::...` **sin `NOT NULL`**; la SDD lo
esperaba con `NOT NULL`. Prisma trata así todas las listas escalares en Postgres. Si se agregaba el `NOT NULL` a mano,
la próxima migración mostraría una diferencia contra el schema (drift), así que no se editó. El cliente igual tipa el
campo como `RecipeMoment[]` y escribe `[]` por defecto.

**Para el usuario:** después de la migración hay que **reiniciar `npm run dev`**. El `next dev` que estaba corriendo
tiene el cliente Prisma viejo, sin `prisma.recipe`. No lo toqué.

**Producción:** `prisma migrate deploy`. Es aditiva y sin backfill.

### Contrato compartido: coincide con la SDD (4.1, 4.2, 5.1, 5.4, 6.2, 6.3)

Firmas y nombres iguales a la SDD. Agregados que no rompen el contrato:
- `core/recipes.ts`:
  - claves extra en `RECIPE_TEXT` para los rangos que la SDD valida pero sin texto: `errNameLong`, `errYieldRange`,
    `errPortionLong`, `errIngredientGramsRange`;
  - `isRecipeTypeKey`, `isRecipeMomentKey`, `isRecipeTagKey`, `joinListEs` y las constantes `RECIPE_NAME_MAX`,
    `RECIPE_PORTION_MAX`, `RECIPE_YIELD_MAX` y `RECIPE_GRAMS_MAX`.
- `RecipeActionState` (`actions.ts`): la variante `ok:false` suma `id?: string`. La SDD pide devolver el id cuando la
  receta se guardó y falló la foto, y el tipo original no tenía dónde ponerlo.
- `lib/recipe-view.ts`: además de `toRecipeCardView`, exporta `recipePhotoUrl(photoId, scope, size)`.

### Decisiones no obvias

- **Textos con plural:** `warnMissingGrams` se arma en singular o plural ("de 1 ingrediente" / "de 2 ingredientes"), en vez
  del literal "ingrediente(s)". `warnNoQuantityCaloric` deja la primera palabra en mayúscula y los demás nombres con
  minúscula inicial: así sale el texto exacto de la SDD, "Perejil y aceite de oliva sin cantidad: aceite de oliva puede
  sumar muchas kcal".
- **`computeRecipeMacros`:**
  - un ingrediente c.n. no cuenta como texto libre, aunque no tenga alimento (no le faltan macros: no suma por definición);
  - las filas vacías se ignoran;
  - `estimatedPortionGrams` se redondea a gramos enteros;
  - `atwaterPerPortion.grams` usa `estimatedPortionGrams`, o 0 si no hay. El aside solo abre `KcalBreakdownPopover`
    cuando ese número es mayor que 0.
- **Comparación D4:** se excede con `ratio > 0,10 + 1e-9`, para que el 10 % justo no avise.
- **Dominio:**
  - con `noQuantity` los gramos se guardan en `null`;
  - `archiveRecipe` y `unarchiveRecipe` usan `updateMany` con el estado de origen en el `where`, así la transición es
    atómica; con 0 filas devuelven `RecipeNotFoundError` o `RecipeStatusError`;
  - `RecipeCatalogFood.fiberPer100` vale 0 si la fibra es null.
- **Action:**
  - el tamaño y los magic bytes de la foto se validan **antes** de guardar la receta, así un archivo inválido no deja la
    receta a medias;
  - `processRecipePhoto` corre **después** de guardar, como pide la SDD. Si falla devuelve `{ ok:false, photoError, id }`
    y el cliente navega a `/recetas/<id>?foto=error`, que muestra `photoSaveError` junto a la foto.
- **Números:** el editor usa un campo de texto con `inputMode="decimal"` y `parseEsArNumber` (coma decimal), en lugar de
  `NumberInput`, que es `type="number"` y no acepta la coma de forma confiable en todos los navegadores. Tiene el mismo
  estilo y la unidad a la derecha.
- **Ruta `/recetas/[id]` de un DRAFT:** redirige a `/recetas/revisar/[id]`, como dice la SDD. Esa pantalla es de 018a-2,
  pero en 018a-1 no hay borradores, porque `createRecipe` publica.
- **Foto y crédito:** el crédito (`photoCredit`) se manda solo si hay foto. La vista previa local se descarta cuando
  llega el `photoId` nuevo.
- **Catálogo:** "Crear alimento propio ↗" marca una bandera, y al volver a la pestaña (`visibilitychange`) se hace un
  `router.refresh()` para recargar el catálogo. Sin la bandera no se recarga: son unos 1000 alimentos.
- **Filtros de la lista:** las pestañas van en la URL; los filtros quedan en el estado local, como pide la SDD. En el
  celular "Etiquetas" queda plegada bajo "Más filtros" y en `md:` para arriba se ve abierta.
- **`next/image`:** se usa con `unoptimized` (D7). La vista previa local (blob) también pasa por `next/image`
  `unoptimized`.
- **sharp:**
  - `processRecipePhoto` lee primero los metadatos para saber si hay alfa (PNG con alfa → "contain" transparente; si no,
    "cover" con `attention`);
  - las fotos chicas se agrandan para que siempre salgan en 4:3 de 1200×900;
  - `failOn: "error"` hace que un JPEG truncado tire `InvalidRecipeImageError`.
- **Bot:** `domain/` no importa `media/`. `grep` de `sharp` y `db/media` en `packages/db/domain` y `apps/bot/src`: nada.
  El bot pasa `typecheck`.

### Verificación (12.1, parte a-1)

| Comando | Resultado |
|---|---|
| `npm run db:generate` | OK |
| `npm run typecheck` | OK en core, db, web y bot |
| `npm run test` | 87 archivos, 1537 tests OK (de esos, 59 son nuevos de recetas) |
| `npm run lint --workspace apps/web` | OK. Queda solo un warning anterior a la HU (`ajustes/logo-form.tsx:36`, alt) |
| `next build` | OK. `/recetas` 9,54 kB / 185 kB, `/recetas/[id]` y `/recetas/nueva` 230 kB, y las 2 rutas de foto |
| `sharp` en standalone | `.next/standalone/node_modules/sharp` y `@img/*` presentes (12-D4) |
| `prisma migrate status` | "Database schema is up to date!" (23 migraciones) |
| `npm run test:recipes --workspace packages/db` | OK, pasos 1–8 + limpieza por id |
| `./ops/harness/verify.sh` | "Arnés OK". El WARN "se tocó el bot" sale por `packages/db`: no hay cambios en `apps/bot` |
| `git check-ignore docs/recetarios` | Ignorado. En 018a-1 no se leyó ni se commiteó nada de terceros: los tests usan datos inventados |

**Sobre `next build`.** El `next dev` del usuario no se tocó. El build se corrió en una copia del repo en el scratchpad
(rsync sin `.git`, `.next`, `node_modules`, las carpetas de sesión de WhatsApp ni `docs/recetarios`, con `node_modules`
enlazado), y después la copia se borró.

**`test:recipes` contra la base:**
- Crea sus propios datos:
  - una receta MANUAL con 2 alimentos SARA 2 (solo lectura), un c.n. y un texto libre;
  - el paciente "Prueba HU-018a", con teléfono 5490000018001 (antes de crearlo comprueba que no exista);
  - un plan ACTIVE con un `PlanMealItem` de receta y `portions` 1,5.
- En el `finally` borra **por id** el plan, el paciente y la receta.
- Conteos antes y después del script: Recipe 0/0, Patient 17/17, NutritionPlan 10/10, PlanMealItem 131/131,
  OutboundMessage 11/11. RecipePhoto y RecipeIngredient quedan en 0.
- No encola nada ni usa WhatsApp ni IA.

**Nota de datos:** `PlanMealItem` dio 132 al aplicar la migración (07:24) y 131 antes de correr `test:recipes` (07:43).
En ese rato ningún código de esta HU escribió en esas tablas: los tests de vitest usan mocks y el script corrió
después del segundo conteo. Lo más probable es que el usuario haya quitado un ítem desde el panel, que estaba abierto.
Lo dejo anotado para que el orquestador lo confirme.

### Autochequeo de UI (`web-design-guidelines` + reglas de la SDD 7)

- Objetivos de 44 px: botones `size="lg"` (h-11); chips, picker, inputs y casilla c.n. de 44 px, con `gap-2`.
- Texto en vez de íconos sueltos: "Subir"/"Bajar" llevan ícono y texto, y los íconos son `aria-hidden`.
- Foco visible en todo. El resumen de errores recibe el foco después de "Guardar", con enlaces que llevan a cada campo,
  y además están los errores en línea.
- La barra inferior fija no tapa el campo con foco (`scroll-mb-28`).
- Placeholders con "…", `tabular-nums` en los números, colores de macro siempre con su letra y `aria-live` en el
  contador y en las kcal.
- Reduced motion: no se agregó animación propia más allá del `press-sm` de los primitivos.

### Recorrido en Chrome para el orquestador (12.2, 018a-1)

Primero hay que **reiniciar `npm run dev`**, porque el cliente Prisma cambió. Datos de prueba propios: usar el nombre
"Albóndigas de prueba HU-018a" para encontrarla y borrarla al final.

1. La barra lateral muestra "Recetas" entre "Alimentos" y "Plantillas". `/recetas` sin recetas muestra "Todavía no hay
   recetas. Cargá la primera." y el botón "Nueva receta".
2. "Nueva receta" → "Guardar" sin datos. Aparece arriba "Faltan N datos para guardar", con enlaces que llevan el foco a
   cada campo, y el error junto a cada campo (nombre, tipo, momentos, rinde, porción, ingredientes).
3. Cargar "Albóndigas de prueba HU-018a", tipo "Plato principal", momentos Almuerzo y Cena, rinde 8 y porción
   "¾ albóndigas". Ingredientes:
   - lentejas: buscar "lentejas" y elegir una opción SARA 2, con 500 g;
   - zapallo: buscar "zapallo", 300 g y medida casera "1 taza";
   - perejil: "Sin cantidad (c.n.)";
   - una fila "Sin alimento (texto libre)" con el texto "Pan rallado".

   El aside "1 porción aporta" se recalcula mientras se escribe y muestra los avisos de c.n. y de texto libre. El "≈ X g
   según los ingredientes" aparece junto a "Pesa".
4. Foto:
   - subir un JPG de unos 3 MB: la vista previa sale al instante;
   - subir un GIF o un archivo de más de 5 MB: aparece "La foto tiene que ser JPG, PNG o WebP y pesar menos de 5 MB."
     junto a la foto.
5. "Guardar": toast "Receta guardada", la URL pasa a `/recetas/<id>` con el `Badge` "Publicada", y en `/recetas` la
   tarjeta tiene la foto 4:3, "1 porción: ¾ albóndigas", las kcal y P/C/G.
6. Búsqueda y filtros:
   - buscar "zapallo" y "pan" (o "limon" si se cargó limón): la tarjeta aparece;
   - combinar los chips Tipo, Momento y Etiquetas, y "Quitar filtros";
   - el contador "Mostrando X de Y recetas" cambia.
7. Archivar y volver a publicar:
   - abrir la receta y tocar "Archivar": toast "Receta archivada" con "Deshacer", la pestaña "Archivadas 1" aparece en
     `/recetas` y la receta sale de "Publicadas";
   - abrirla desde "Archivadas" y tocar "Volver a publicar".
8. Celular (DevTools, 390 px): los chips se envuelven, "Etiquetas" queda bajo "Más filtros", los objetivos miden 44 px,
   el aside baja al final y la barra inferior muestra "X kcal / porción".
9. Teclado: Tab recorre el buscador, los chips (dentro de cada grupo con flechas, por roving focus) y las tarjetas, y el
   foco se ve siempre. En el picker de ingredientes funcionan las flechas, Enter y Escape.
10. Abrir `/api/recetas/fotos/<photoId>?size=full` en una ventana de incógnito: el middleware de Auth.js redirige al
    login (307) antes del handler, igual que `api/professional/logo`; no se ve la foto. El 401 del handler es la segunda
    barrera y lo cubre su test. El `photoId` se ve en la URL de la imagen de la tarjeta. (Corregido en la ronda 2.)
11. Limpieza: la receta de prueba se borra por id con `psql`:
    `delete from "Recipe" where id = '<id>';`. No tiene uso en planes, y sus ingredientes y su foto caen en cascada.
    También se puede dejar archivada y anotarlo.

### Ronda 2 (review ronda 1: CHANGES_REQUESTED, intento 1 de 2)

**Defecto arreglado: falso "¿Salir sin guardar?" después de guardar con foto nueva o con "Quitar foto".**
- **Causa:** la referencia de "sin guardar" se tomaba con la foto o el "Quitar foto" todavía pendientes, y después el
  form los limpiaba. La huella nueva no coincidía con la referencia y `dirty` quedaba en `true`.
- **Arreglo:**
  - La lógica pasó a un módulo puro, `recetas/recipe-form-state.ts`:
    - `recipeFormSnapshot(state)` arma la huella del form;
    - `snapshotAfterSave(state)` arma la huella de referencia con la foto y el "Quitar foto" ya resueltos;
    - `rowHasContent(row)` decide si una fila de ingrediente cuenta.
  - Al guardar OK, `recipe-form.tsx` fija la referencia con `snapshotAfterSave` y después limpia `photoFile` y
    `removePhoto`, así `dirty` vuelve a `false` en los tres casos: foto nueva, "Quitar foto" y sin tocar la foto.
  - En la rama `photoError` con `res.id` (la receta se guardó y la foto no), se hace lo mismo y además se descarta la
    vista previa local, para no mostrar una foto que no quedó guardada.
  - Con "Quitar foto" + Guardar en una receta existente, la foto vieja se oculta (`gonePhotoId`) hasta que el
    `router.refresh()` trae los datos nuevos. Así no reaparece un instante.
- **Test nuevo:** `recetas/recipe-form-state.test.ts` (6 tests).
  - Antes de guardar, una foto nueva y "Quitar foto" marcan cambios.
  - Después de un guardado OK, `dirty` es `false` con foto nueva, con "Quitar foto" y sin tocar la foto.
  - Un cambio posterior vuelve a marcar `dirty`.
  - El repo no tiene DOM de test (vitest sin jsdom ni testing-library), por eso se testea la lógica extraída.

**Dudas no bloqueantes resueltas en el mismo commit (triviales y seguras):**
- **Fila con solo "Medida casera":** ya no se descarta en silencio. `rowHasContent` cuenta la medida casera, así que la
  fila entra en la validación y muestra "Elegí un alimento o escribí el ingrediente." junto al campo.
- **Topes de zod** en `recetas/actions.ts`, iguales a las columnas: `yieldPortions` hasta 9999 (`DECIMAL(5,1)`) y
  `grams` hasta 99999 (`DECIMAL(7,2)`). Un valor fuera de rango da "Revisá los datos de la receta." en lugar del error
  genérico de la base.
- **Paso 10 del recorrido:** corregido. Sin sesión el middleware responde 307 al login, no 401, igual que
  `api/professional/logo`. No se tocó el middleware (SDD 9.2).

**Dudas que no toqué:**
- arrays sin `NOT NULL` (aceptado por el reviewer);
- `DecimalInput` en vez de `NumberInput` (unificar más adelante);
- recorrido de Chrome de foto, archivar, celular y teclado: queda para el orquestador. Conviene recorrer al menos
  foto → Guardar → "‹ Recetas" (no tiene que aparecer "¿Salir sin guardar?") y "Quitar foto" → Guardar → salir.

**Archivos:**
- `apps/web/src/app/(panel)/recetas/recipe-form.tsx` (modificado);
- `apps/web/src/app/(panel)/recetas/actions.ts` (modificado);
- `apps/web/src/app/(panel)/recetas/recipe-form-state.ts` (nuevo);
- `apps/web/src/app/(panel)/recetas/recipe-form-state.test.ts` (nuevo);
- este reporte.

Nada fuera de 018a-1. No se tocaron la base, el schema ni `next dev`.

**Verificación:**

| Comando | Resultado |
|---|---|
| `npm run typecheck` | OK en core, db, web y bot |
| `npm run test` | 88 archivos, 1543 tests OK |
| `npm run lint --workspace apps/web` | OK. Solo queda el warning anterior a la HU (`ajustes/logo-form.tsx:36`) |
| `./ops/harness/verify.sh` | "Arnés OK". El WARN del bot sale por `packages/db` de la ronda 1; en esta ronda no se tocó |

### Fuera de 018a-1 (queda para 018a-2)

Parser `recipe-import`, `domain/recipeImport.ts` y `recipeTransfer.ts`, scripts `recipes:*`, ruta
`/api/recetas/importacion/[imageId]`, pantalla de revisión y pestaña "Para revisar" con su botón "Empezar a revisar".
La pestaña ya se dibuja si hay borradores. 018c y 018d no se tocaron.

## 018a-2: carga asistida (fases G, H, I y K)

**Estado: done.** Rama `feat/hu-018a2-carga-asistida`. Commits locales, sin push:

| Fase | Commit | Mensaje |
|---|---|---|
| G | `379204d` | HU-018a: parser de recetarios (líneas de ingrediente, páginas, sugerencias, bundle) |
| H | `1cce855` | HU-018a: extracción de borradores, deshacer corrida y pase a producción |
| I | `bc034b7` | HU-018a: pantalla de revisión de borradores |
| K | último commit de la rama (incluye este reporte) | HU-018a: verificación de la carga asistida |

Skills: `apple-design` y `ui-ux-pro-max` antes del JSX, y `web-design-guidelines` como autochequeo. **Sin migración**:
`schema.prisma` no se tocó. Implementer: Opus.

### Archivos

Creados:
- `packages/core/src/recipe-import/`:
  - `{index,text,ingredient-line,files,extract,food-suggest,bundle}.ts`;
  - `__fixtures__/synthetic.ts`: páginas `BboxPage` armadas en código con recetas **inventadas** (F1, F2, F3, F4, F5 y una página vacía);
  - tests: `ingredient-line.test.ts` (17), `extract.test.ts` (9) y `files-suggest-bundle.test.ts` (16).
- `packages/db/domain/recipeImport.ts` + `recipeImport.test.ts` (13).
- `packages/db/domain/recipeTransfer.ts` + `recipeTransfer.test.ts` (8). No se exporta desde `domain/index.ts`.
- `packages/db/scripts/recipes/{extract,undo,export,import}.ts`.
- `apps/web/src/app/api/recetas/importacion/[imageId]/route.ts` + `route.test.ts` (4).
- `apps/web/src/app/(panel)/recetas/recipe-save.ts`: esquema del payload y manejo de la foto, compartidos por las dos
  pantallas (ver "Decisiones").
- `apps/web/src/app/(panel)/recetas/revisar/`:
  - `page.tsx`, `actions.ts`, `actions.test.ts` (9) y `review-href.ts`;
  - `[id]/{page,loading,review-screen,review-parts}.tsx`.

Modificados:
- `packages/core/package.json`: export `./recipe-import`.
- `packages/db/domain/index.ts`: `export * from "./recipeImport"`.
- `packages/db/package.json`: scripts `recipes:extract`, `recipes:undo`, `recipes:export` y `recipes:import:prod`.
- `packages/db/tsconfig.json`: suma `scripts/recipes/**/*.ts`.
- `packages/db/scripts/test-recipes.ts`: suma los pasos 9 a 12 (018a-2).
- `apps/web/src/app/(panel)/recetas/`:
  - `actions.ts`: usa `recipe-save.ts`, con el mismo comportamiento (sus 12 tests pasan sin cambios);
  - `recipe-form.tsx`: modo revisión (prop `review`);
  - `page.tsx` y `recipes-browser.tsx`: pestaña "Para revisar".
- `apps/web/src/components/recipes/recipe-card.tsx`: línea "Almuerzos y cenas 2 · pág. 7" en los borradores.
- `apps/web/src/lib/recipe-view.ts`: `importLabel` opcional.

**Zona de Leo:** no se tocaron `food-picker.tsx`, `food-catalog.tsx`, `meals-editor.tsx` ni `alimentos/**`, `planes/**` o
`plantillas/**`.

### Contrato compartido (SDD 4.3, 5.2, 5.3, 6.2 y 6.3): coincide

Las firmas y los nombres son los de la SDD. Agregados que no rompen el contrato:
- `BULLETS` es un superconjunto de la lista de la SDD. Suma `° » ◦ ▪ ‣`, que se usan como viñeta en varios
  recetarios ("almuerzos y cenas 3" usa `°` y "panes y pizzas" usa `»`).
- Exports extra de `recipe-import`:
  - `plainText`;
  - `gramValuesIn` y `GRAM_TOKEN_SOURCE`;
  - `recipeFileBase` y `recipeFileTitle` (título legible con tildes: "Almuerzos y cenas 2");
  - `suggestionWords`;
  - los tipos `SkippedPageReason`.
- `DraftQueueItem`: el tipo con nombre del resultado de `listDraftQueue`.
- `DRY_RUN_ID = "(en seco)"`. En seco, `importRecipeBundle` devuelve `result: "created"` con ese id, porque la unión de la SDD
  pide un `id` en "created".
- `discardDraftAction(id, file?)`: el segundo parámetro es opcional y sirve para que `nextId` respete el filtro por
  recetario.
- El script de extracción suma `--limit N` (escribe solo los primeros N borradores) para cargar una muestra chica.

### Decisiones no obvias

**Parser (no se inventan gramos):**
- `grams` sale solo de un token `<número> g|gr|gramos|kg` de la línea. Los kg se multiplican por 1000.
- Si la línea tiene dos o más valores distintos ("50g (150g cocidos)") o un rango ("100 a 150g"), `grams` queda en `null`
  con el aviso `AMBIGUOUS_GRAMS`.
- Nunca se convierten cc ni medidas caseras.
- Hay tres aserciones:
  - el test de propiedad, sobre 30 líneas;
  - un test sobre todos los borradores de los fixtures;
  - el script de extracción, con su propia regex. Si encuentra un gramo sin token, corta la corrida.
- `VOLUME_ONLY` solo cuenta el volumen que está fuera de paréntesis. "Huevo una unidad (o 100cc de bebida…)" da
  `HOUSEHOLD_ONLY`.

**Lectura de la página:**
- Las palabras rotadas (títulos de F2) se separan antes de armar los renglones.
- Cada renglón se corta en tramos donde hay un hueco mayor a 1,5 veces la altura de la letra. Así se separan las
  columnas (ingredientes y pasos lado a lado) y los tips a la derecha.
- **F1** ubica cada tramo bajo el título más cercano por arriba que se solapa en x. Lo que queda sin título va así:
  - un tramo con viñeta va a la sección de arriba;
  - un tramo sin viñeta va a tips.
- Caso que agregué: **página sin título "Ingredientes" pero con "Procedimiento"**. Pasa en todo "Almuerzos y cenas 1".
  Los renglones con cantidades de arriba del procedimiento son los ingredientes, como si tuvieran un título implícito,
  y la página queda con un aviso.
- **F2 con títulos rotados**: cada tramo va al título cuya franja vertical le queda más cerca. "Crumble cookies" usa la
  misma viñeta para ingredientes y pasos, así que no alcanzaba con el cambio de viñeta. **F2 sin títulos**: se separa
  por el cambio de viñeta, como pide la SDD.
- **Nombre**: son los renglones de la cabecera cuya altura es al menos el 75 % de la más alta (y 1,4 veces la
  mediana). Con el 2,5 × la mediana de la SDD, muchos títulos salían cortados: pdftotext mide la caja con el
  interlineado.
- **Rinde**: un rango ("4-5 porciones") deja `yieldPortions` en null y suma un aviso.
- **Fuente sugerida**: "Nutriarte — {título sin la palabra Nutriarte}", o "{autor} — {título}".
- **F4**: cada párrafo termina en "Porción". El párrafo empieza después del último hueco grande, salvo que el renglón
  anterior termine en ":".

**Imágenes (`--images`):**
- `pdfimages -png`: el JPEG CMYK crudo (`-j`) sale con los colores invertidos. Lo comprobé a ojo con una página.
- **Desvío de 8.1:** el filtro de decoración de la SDD ("el objeto aparece en 3 páginas o más") descartaba fotos
  reales. Estos PDF reusan el mismo objeto de foto en 3 o 4 páginas no contiguas (recetas vecinas e intro), y con esa
  regla la página 8 de "Almuerzos y cenas 2" quedaba sin candidatas. Ahora es decoración si aparece en al menos 3
  páginas **y** en al menos el 30 % de las páginas del archivo (por ejemplo, un logo). El revisor igual elige la foto.

**Sugerencia de alimento:**
- A igual ranking, SARA2 va antes que PROPIO, y recién después cuenta el nombre más corto. Así se favorece el pase a
  producción por `sourceKey` (8.4).
- Se suma un paso de singular ("zanahorias" → "zanahoria").
- Los sinónimos de varias palabras ("huevo" → "huevo gallina entero") solo se usan si son la consulta completa.
- La sugerencia no se guarda nunca: se calcula en el cliente y la acepta la persona (12-D12).

**Pantalla de revisión (7.5), pensada para revisar unas 40 recetas seguidas:**
- Es `RecipeForm` con la prop `review`. La sugerencia, los avisos del parser y las actions llegan como funciones desde
  `review-screen.tsx`, así el parser no entra al bundle del editor.
- Las piezas de la revisión se cargan con `next/dynamic`. `/recetas/[id]` pesa 233 kB (230 en 018a-1) y
  `/recetas/revisar/[id]` 250 kB.
- **Barra superior fija** (material bar):
  - "‹ Recetas";
  - "Borrador i de n", con una barra de avance;
  - el selector de recetario, con la cantidad de cada uno;
  - "Saltar" (ghost), "Guardar borrador" (secundario) y "Publicar y seguir" (primario lg);
  - el menú "⋯", con "Descartar borrador": `useConfirm` destructivo con el texto de la SDD.
- **Atajos**: `⌘/Ctrl + ↵` publica y sigue, y `⌘/Ctrl + S` guarda el borrador. Funcionan aunque el foco esté en un campo.
  Se muestran en la barra y van en `aria-keyshortcuts`.
  - "Saltar" no tiene atajo a propósito. Las combinaciones libres chocan con la edición de texto (Alt+→, ⌘→) o con el
    navegador (⌘]).
  - **Enter en un campo no publica**: en modo revisión no hay botón submit.
- **Columna izquierda fija** (lg: 26 rem; su alto se ajusta al de la barra con `--review-bar-h`):
  - primero "1 porción aporta", con la comparación contra la tabla del recetario (D4, no bloquea);
  - debajo, "Original" con el control segmentado Página / Texto. La página se abre a pantalla completa en un Dialog, y
    debajo van los avisos de la lectura.
  - En el celular, el original queda plegado en "Ver original".
- **Fotos encontradas**: un RadioGroup de miniaturas 4:3 de 120 px.
  - La opción elegida lleva el anillo `ring-primary` y un check, así no depende solo del color.
  - Hay opciones "Ninguna" y "Foto actual" (si la tiene), más "Subir otra".
  - No se preselecciona ninguna foto.
  - La candidata elegida viaja como `candidateId`, y la action llama a `chooseImportCandidateAsPhoto` antes de
    `publishRecipe`.
- **Ingredientes**: cada fila muestra "Del recetario: «…»" y "Sugerido: X · N g", con los botones Aceptar, Cambiar y
  Dejar como texto, de 44 px.
  - Los avisos del parser van en `text-warning`, con los textos exactos de 7.5. Se recalculan en el cliente con
    `parseIngredientLine(rawText)`, así siguen bien aunque se reordenen las filas.
  - **Agregado:** un botón "Aceptar las N sugerencias" arriba de la lista, para no tocar ingrediente por ingrediente.
    Igual hay que revisar los gramos.
- **Guardar borrador** solo exige números bien escritos. **Publicar** valida igual que el editor, y los gramos que
  faltan bloquean. El resumen de errores dice "Faltan N datos para publicar".
- Al publicar: toast "Receta publicada" y se pasa al siguiente borrador de la cola, respetando `?archivo=`.
- **`/recetas/revisar` sin borradores** muestra el `EmptyState` "No quedan borradores para revisar." con "Ver recetas".
  Si se filtró por un recetario y quedan otros, muestra además "Revisar los demás (N)". La SDD 6.1 decía volver a
  `/recetas?estado=revisar`. Lo cambié para cumplir el final de cola de 7.5.
- **Pestaña "Para revisar"**: cada tarjeta lleva el `Badge` "Borrador" (ya estaba) y la línea "Almuerzos y cenas 2 ·
  pág. 7", y su enlace va a `/recetas/revisar/<id>`. Arriba, una tarjeta con "Empezar a revisar" (lg).

**Actions:**
- El esquema zod y la foto pasaron a `recipe-save.ts`, porque un archivo `"use server"` solo puede exportar funciones
  async.
- `saveDraftAction` y `publishDraftAction` aceptan la misma foto que el editor (archivo, quitar o candidata).
- Los errores se loguean solo con `errorCode`. Lo prueba un test que espía `console.error`.

**Import a producción:**
- `recipes:import:prod` no acepta `--yes`: con `--write` siempre hay que escribir `SI`.
- Un `P2002` (otra corrida creó la receta en el medio) cuenta como `skipped-exists`.

### Verificación (12.1, parte a-2)

| Comando | Resultado |
|---|---|
| `npm run typecheck` | OK en core, db, bot y web |
| `npm run test` | 95 archivos, 1619 tests OK (76 nuevos de 018a-2) |
| `npm run lint --workspace apps/web` | OK. Solo queda el warning anterior a la HU (`ajustes/logo-form.tsx:36`) |
| `next build` (copia en el scratchpad, como en 018a-1; la copia ya se borró) | OK. `/recetas/revisar/[id]` 250 kB, `/recetas/revisar` 107 kB, `/api/recetas/importacion/[imageId]`. `sharp` está en `.next/standalone/node_modules` |
| `./ops/harness/verify.sh` | "Arnés OK". El WARN "se tocó el bot" sale por `packages/db`: no hay cambios en `apps/bot` |
| `npm run test:recipes --workspace packages/db` | OK, pasos 1 a 12 más la limpieza por id. Del 9 al 12 son de 018a-2: created → updated → skipped-reviewed, el undo no borra uno revisado, la candidata pasa a foto, `deleteUnreviewedDrafts` por id, y export → import en seco sin escribir |
| `git check-ignore` | `docs/recetarios/_extraccion/reporte.md` y `docs/recetarios/_exportacion/*.json` están ignorados (regla `docs/recetarios/` del `.gitignore`). `git status` no muestra nada de `docs/recetarios` |
| Texto de terceros en el repo | Ninguno. Los fixtures y los tests usan recetas inventadas. Las únicas líneas "reales" en los tests son los ejemplos que la SDD 11.1 pide textualmente |
| IA paga | No se usa ni en el extractor ni en los tests |

**Conteos de control** (Recipe | RecipeIngredient | RecipeImportImage | RecipePhoto | PlanMealItem | Food), antes y después
de `test:recipes` y de K1–K3: `1|1|0|1|131|980` en los dos casos. La receta publicada que ya había no se tocó. Después
quedan solo los 8 borradores de muestra que dejé para el recorrido.

### Extractor en seco sobre los PDF reales (8.5)

`npm run recipes:extract --workspace packages/db`: no se conecta a la base. El reporte completo, con el detalle por
archivo y por borrador, quedó en `docs/recetarios/_extraccion/reporte.md` (ignorado).

- 24 archivos leídos, **0 con error**. Se excluyeron 10:
  - 5 PPTX;
  - "Reemplazos";
  - "Conservación";
  - 3 copias en blanco y negro con versión a color.
- **320 borradores** (objetivo: 180 o más).
- F1/F2 con nombre y al menos un ingrediente: **296 de 296 (100 %)**. Los otros 24 borradores son colaciones F4, que
  vienen sin ingredientes por diseño.
- **2450 ingredientes**:
  - 1172 con gramos del texto;
  - **1098 sin gramos** (hay que completarlos o marcarlos como c.n.);
  - 180 sin cantidad (c.n.);
  - **273 sin alimento sugerido**. Este número se calculó contra el catálogo SARA 2 de `alimentos.json`, sin la base.
- **50 borradores con tabla nutricional**: todas las páginas de receta que tienen tabla.
  - Control manual sobre "Almuerzos y cenas 2": 20 de 20 recetas con tabla.
  - Los otros archivos con tabla son "almuerzos y cenas 4" (10), "Mate 3" (10) y "Galletitas" (10). El resto no tiene
    tablas.
- **0 gramos sin token en el texto** (aserción del script).

Huecos conocidos (los cubre la revisión manual):
- Algunas colaciones F4 salen con el nombre cortado ("Hilitos de pasta de maní o…"), cuando el párrafo no trae
  "Nombre:".
- Una página con varios rellenos ("Rellenos dulces saludables") sale como un solo borrador.

### K1–K3: contra la base de desarrollo

Todo lo de esta sección fue con datos de prueba propios. **No se corrió nada contra producción.**

1. **K1.** `--write --images --file "Almuerzos y cenas 2.pdf" --limit 4`:
   - 4 borradores, con la página renderizada (662×936) y las candidatas (1200×900 WebP). Revisé a ojo una página y su
     foto: colores bien.
   - Con el filtro original la página 8 quedaba sin fotos. Por eso cambié la regla (ver "Decisiones") y repetí la corrida
     con `recipes:undo`, que borró 4 de 4.
2. **Revisión simulada.** Hice un script descartable en el scratchpad, ya borrado, que publicó 2 borradores:
   - acepta `suggestFood`;
   - deja en c.n. lo que no tenía gramos del texto, solo como dato de prueba;
   - elige la primera candidata como foto.
3. **K2.** `recipes:export --ids <las 2>`: 2 recetas con foto en `docs/recetarios/_exportacion/` (ignorado).
   - `recipes:import:prod` en seco contra la base de desarrollo, **dos veces**: las dos dieron `skipped-exists`. No
     escribió nada.
   - **Modo real con datos propios**: una copia del bundle con las `importKey` prefijadas `prueba-hu018a2-import:`
     (`echo SI | … --write`).
     - Primera corrida: 2 creadas, PUBLISHED, con 10 y 6 ingredientes y foto.
     - Segunda corrida: 2 ya existían, así que es idempotente.
4. **K3.** Borré **por id** las 2 publicadas de prueba y las 2 importadas de prueba:
   `cmusbo1tl0001uc7djbyer07v`, `cmusbo3nm000huc7daf2bnzit`, `cmusbpimc0001zgnq6ro02ecd` y `cmusbpimz000fzgnqmaftw2xf`.
   - `recipes:undo` de la corrida borró los 2 borradores sin revisar que quedaban.
   - Borré la copia de prueba del bundle.
   - Los conteos volvieron a la línea base.

### Borradores de muestra que quedan en la base de desarrollo (para el recorrido)

Quedan 8 borradores DRAFT de origen IMPORT, sin revisar y con imágenes:

| Archivo | Pág. | Id |
|---|---|---|
| Almuerzos y cenas 2.pdf | 7 | `cmusbpzlw000110rvr6hmug0n` |
| Almuerzos y cenas 2.pdf | 8 | `cmusbq1hh000h10rv55o1uo61` |
| Almuerzos y cenas 2.pdf | 9 | `cmusbq3jp000t10rvzpzvk2nk` |
| Almuerzos y cenas 2.pdf | 10 | `cmusbq4v2001710rvup8aewl9` |
| Almuerzos y cenas 2.pdf | 11 | `cmusbq5uo001s10rvmgvjd2n7` |
| Galletitas nutriarte_compressed (1).pdf | 6 | `cmusbq8g500019bp0ynqezoj3` |
| Galletitas nutriarte_compressed (1).pdf | 7 | `cmusbq92d000e9bp0tdq29bhm` |
| Galletitas nutriarte_compressed (1).pdf | 8 | `cmusbq9jm000r9bp097dryfaj` |

Para limpiar al terminar:
- **Lo que siga sin revisar** se borra con `recipes:undo`, una vez por corrida:
  - `npm run recipes:undo --workspace packages/db -- docs/recetarios/_extraccion/corrida-2026-10-03T11-43-39-782Z.json`
  - `npm run recipes:undo --workspace packages/db -- docs/recetarios/_extraccion/corrida-2026-10-03T11-43-52-081Z.json`
- **Lo que se revise o publique en el recorrido** no lo borra el undo. Va por id:
  `delete from "Recipe" where id in ('<id>', …);`. Los ingredientes, la foto y las imágenes caen en cascada.

### Recorrido en Chrome para el orquestador (12.2, pasos 12 a 15)

No hace falta reiniciar `next dev`: no cambió el schema. Las rutas nuevas las toma solo.

1. `/recetas` → aparece la pestaña "Para revisar 8".
   - Las tarjetas muestran "Borrador", la línea "Almuerzos y cenas 2 · pág. 7" y la miniatura de la primera candidata.
   - Arriba de la grilla está "Empezar a revisar".
2. "Empezar a revisar" → `/recetas/revisar` redirige al primer borrador (Albóndigas, pág. 7).
   - La barra dice "Borrador 1 de 8", con la barra de avance y el selector "Todos los recetarios (8)".
3. Columna Original:
   - alternar Página / Texto;
   - tocar la página: se abre a pantalla completa;
   - abajo están los avisos de la lectura ("Título partido en 2 renglones.").
4. Fotos encontradas: hay 3 miniaturas más "Ninguna", sin ninguna elegida. Elegir una (anillo y check) y probar
   "Subir otra".
5. Ingredientes:
   - "Lentejas" muestra "Del recetario: «Lentejas 500g»" y "Sugerido: Lentejas, crudas · 500 g". "Aceptar" asigna el
     alimento y el aside se recalcula;
   - "Puré de calabaza" muestra "Dice «aprox.»: revisá.";
   - "Huevo" muestra "El texto no dice los gramos.". Completar los gramos;
   - "Una cebolla y morrón picados" muestra el aviso de dos ingredientes;
   - "Dejar como texto" oculta la sugerencia;
   - probar "Aceptar las N sugerencias".
6. Aside: "Según el recetario: 262 kcal (¾ albóndigas)". Si la diferencia pasa el 10 % aparece el aviso "El recetario
   dice 262 kcal; con los ingredientes da X kcal", que no bloquea.
7. "Publicar y seguir" (o `⌘↵`) con gramos faltantes: aparece "Faltan N datos para publicar", con enlaces a cada
   campo. Completar o marcar c.n. y publicar: toast "Receta publicada" y pasa a "Borrador 1 de 7" (pág. 8).
8. "Guardar borrador" (`⌘S`): toast "Borrador guardado" y se queda en la misma pantalla. Enter dentro de un campo no
   publica.
9. "Saltar" lleva al siguiente. Con cambios sin guardar pregunta "¿Salir sin guardar?".
10. "⋯" → "Descartar borrador" → confirmación "Se borra este borrador. Lo podés volver a extraer." → pasa al siguiente.
11. Selector de recetario: elegir "Galletitas nutriarte…" → muestra "Borrador 1 de 3", un F2 con tabla.
12. Celular (390 px):
    - la barra se envuelve debajo de la barra móvil;
    - "Ver original" queda plegado arriba;
    - las kcal se ven en la barra;
    - los objetivos miden 44 px.
13. Teclado: Tab recorre la barra, las miniaturas (con flechas dentro del grupo) y los botones de sugerencia, con el
    foco siempre visible.
14. `/api/recetas/importacion/<id>?size=full` en incógnito: el middleware redirige al login, igual que las fotos.
15. Limpieza: el undo de las dos corridas y, por id, lo que se haya publicado (ver arriba).

### Corrección: build error con Turbopack (lo encontró el recorrido del orquestador)

**Error:** con `npm run dev` (Turbopack), `/recetas` mostraba "Only async functions are allowed to be exported in a
"use server" file". Venía de `recetas/actions.ts:30`, el `export type { RecipeActionState, RecipeFormPayload } from
"./recipe-save"` que agregué en `bc034b7`. Webpack (`next build`) lo acepta y Turbopack no, por eso el build de la fase K
no lo detectó.

**Arreglo:** saqué el re-export. Ningún archivo importaba esos tipos desde `actions.ts`: `recipe-form.tsx` y
`revisar/actions.ts` ya los traían de `recipe-save.ts`. En `actions.ts` quedó un comentario que explica por qué los tipos
viven en `recipe-save.ts`.

**Revisé los otros archivos `"use server"` nuevos:** `recetas/actions.ts` y `revisar/actions.ts` solo exportan funciones
async. Los demás `"use server"` del repo exportan `export type X = …` declarados en el archivo, que Turbopack sí acepta;
el problema era solo el re-export `export type { … } from`.

**Cómo lo verifiqué contra Turbopack:**
- **Con `curl` contra el `next dev` del usuario en :3000** (no lo toqué): las 4 rutas (`/recetas`, `/recetas/nueva`,
  `/recetas/revisar` y `/recetas/revisar/cmusbq1hh000h10rv55o1uo61`) responden 307 al login. El middleware de Auth.js
  corta antes de compilar la página, así que eso no prueba nada sobre el error.
- **Con `next build --turbopack`** (Next 15.5.24), en una copia del repo en el scratchpad. Compila todas las rutas con
  Turbopack, igual que `next dev --turbopack`.
  - El `node_modules` de la copia es un clon APFS (`cp -c`), porque Turbopack rechaza un symlink que sale de la raíz.
  - **Antes del arreglo**, con el `actions.ts` de HEAD: falla con el mismo error que vio el orquestador (8 errores, todos
    por esa línea).
  - **Después del arreglo**: "Compiled successfully" y exit 0, con `/recetas`, `/recetas/[id]`, `/recetas/nueva`,
    `/recetas/revisar`, `/recetas/revisar/[id]` y `/api/recetas/importacion/[imageId]`.
  - La copia ya se borró.
- No levanté un `next dev` aparte: sin sesión, el middleware también cortaría antes de compilar las páginas.

**Verificación después del arreglo:**
- `npm run typecheck`: OK en los 4 workspaces.
- `npm run test`: 95 archivos, 1619 tests OK.
- `npm run lint --workspace apps/web`: solo el warning anterior a la HU, en `logo-form.tsx`.
- `./ops/harness/verify.sh`: "Arnés OK".

**Para el recorrido:** el `next dev` del usuario debería recompilar solo al guardar el archivo. Si el overlay sigue, hay
que recargar la página.
