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
10. Abrir `/api/recetas/fotos/<photoId>?size=full` en una ventana de incógnito: 401. El `photoId` se ve en la URL de la
    imagen de la tarjeta.
11. Limpieza: la receta de prueba se borra por id con `psql`:
    `delete from "Recipe" where id = '<id>';`. No tiene uso en planes, y sus ingredientes y su foto caen en cascada.
    También se puede dejar archivada y anotarlo.

### Fuera de 018a-1 (queda para 018a-2)

Parser `recipe-import`, `domain/recipeImport.ts` y `recipeTransfer.ts`, scripts `recipes:*`, ruta
`/api/recetas/importacion/[imageId]`, pantalla de revisión y pestaña "Para revisar" con su botón "Empezar a revisar".
La pestaña ya se dibuja si hay borradores. 018c y 018d no se tocaron.
