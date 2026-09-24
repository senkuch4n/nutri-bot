# Implementación HU-005: `base-alimentos-sara2` (épica 20)

**Estado: done**. Rama `hu-005-base-alimentos-sara2`, sin commitear.
SDD: `Refactorizaciones/base-alimentos-sara2.md`, con la **Resolución del orquestador** aplicada
(Q1-b: la suma de macros rechaza fuera de 90–110 g y advierte fuera de 97–103; Q2: Atwater con
`máx(2 kcal, 5 %)`).

**Hace falta reiniciar el `next dev`**: cambió el cliente de Prisma (enum `FoodGroup`, `FoodSource`,
columnas nuevas) y hay una dependencia nueva (`@radix-ui/react-popover`). No levanté ni reinicié
ningún servidor.

## Restricciones de la SDD §15 (copiadas)

- **Base:** solo la migración de 4.3, la carga SARA 2 (`sara2:load`) y las pruebas con datos
  propios borrados por id (o en transacción revertida). Nunca `deleteMany`/`updateMany` sin
  filtro por `source: "SARA2"` o por ids propios. Nunca modificar ni borrar los 90 alimentos, ni
  planes, ni pacientes.
- **Migraciones:** `--create-only`, revisar el SQL, aplicar, `db:generate`. Prohibido
  `prisma migrate reset`, `prisma db push` y aceptar el reset por drift. `pg_dump` antes de
  aplicar. Si hay drift: `blocked` con la salida de `migrate status`.
- **UI:** nunca `await confirm()` dentro de `<form action>` ni de `startTransition` (patrón
  `onSubmit` de 9.4, como `DeleteMealButton`).
- **Dev server:** no `next build`, no otro `next dev`. Si cambia el schema, el reinicio del
  `next dev` lo hace el orquestador.
- **WhatsApp:** nada. Esta HU no encola mensajes.
- **Git:** rama `hu-005-base-alimentos-sara2`, **sin commitear**.
- No correr `db:seed` ni `seed:demo`.
- `alimentos.json` y `reporte.md` los genera el lector: no se editan a mano. Las filas rechazadas
  no se corrigen ni se inventan.

Todas se cumplieron.

## Respaldo y foto previa

- `pg_dump` (texto plano, 82.268 bytes, 23 bloques `COPY`, incluye las 90 filas de `Food`):
  `/private/tmp/claude-501/-Users-joelmiguelserrudo-Documents-Projects-Nutri-Bot/95bd3b1f-af2d-449f-b816-a2a22d5cd1a4/scratchpad/backup-antes-HU-005.sql`.
  No se restauró.
- `prisma migrate status` antes: "Database schema is up to date!" (12 migraciones, sin drift).
- Foto de solo lectura (antes / después de migrar / después de cargar SARA 2 / al final):

| Chequeo | Antes | Después de migrar | Después de cargar (x2) y de las pruebas |
|---|---|---|---|
| `count(*) Food` | 90 | 90 | 90 PROPIO + 890 SARA2 |
| `foodId` distintos en `PlanMealItem` | 36 | 36 | 36 |
| `foodId` de `PlanMealItem` que ya no existen | 0 | 0 | 0 |
| Huella md5 de los 90 (id, nombre, kcal, P, CHO, G, fibra, unitHint, activo) | `dc897c10…4375a` | `dc897c10…4375a` | `dc897c10…4375a` |
| `diff` de la foto sin `group` (`foods-before-hu005.txt`) | — | vacío | vacío |

## Migración `20260924090541_food_sara2`

- `prisma migrate dev --create-only` se negó ("environment is non-interactive"). Como prevé la
  SDD (4.3), generé el SQL con `prisma migrate diff --from-schema-datasource … --script` (solo
  lectura), creé la carpeta a mano y puse el SQL de 4.3.
- El `USING` generado por Prisma era `("group"::text::"FoodGroup_new")`: falla con los valores
  viejos y mandaba `GRASAS` a `GRASAS`. Lo reemplacé por el `CASE` de D2.
- Revisión: el único `DROP` es `DROP TYPE "FoodGroup_old"`, después del rename. El `CASE` cubre
  los 10 valores viejos y `GRASAS` va a `ACEITES`. Las columnas nuevas son nullable o tienen
  default. Ninguna columna existente cambia de tipo. Se agregan el `CHECK`
  `Food_source_sourceKey_check`, el índice único de `sourceKey` y el índice `(source, active)`.
- Antes de aplicarla la corrí en `psql` dentro de `BEGIN … ROLLBACK`: dio los grupos esperados y
  quedó revertida.
- La apliqué con `npm run db:migrate` ("Applying migration `20260924090541_food_sara2`", sin
  drift ni oferta de reset) y después corrí `npm run db:generate`. `migrate status` quedó "up to date".
- Grupos después de migrar: ACEITES 9, AZUCARES_MERMELADAS_Y_DULCES 9, BEBIDAS_SIN_AZUCAR 9,
  CARNES 9, FRUTAS 9, LECHE_Y_POSTRES 9, LEGUMBRES_CEREALES 18, OTROS 9, VERDURAS 9. Los 90 quedan
  `PROPIO` con `groupAutoAssigned = true`.

## Lector y carga de SARA 2

`npm run sara2:read` imprime `SARA 2: 890 importadas de 906 (16 rechazadas, 1,77 %), 24 excluidas → packages/db/data/sara2/`
(83 ms de parseo).

- **16 rechazadas**:
  - ATWATER 5: Durazno enlatado light, Facturas rellenas, Harina de maíz hervida, Caramelos duros light, Mayonesa light.
  - SUMA_MACROS 9: Capelettis, Ravioles, Yogur descremado 88,9, Yogur descremado bebible, Vizcacha, Chicles sin azúcar, Medallón de menta, Margarina, Jugo en polvo light.
  - NUMERO_INVALIDO 1: Salvado de avena, «0.121».
  - SIN_PAREJA_B 1: Salmón blanco, crudo.
  - La Banana entra con el 5 %: 88,2 kcal calculadas contra 92 publicadas.
- **Advertencias 381**: SIN_CENIZAS 237, SUMA_FUERA_97_103 68, GRASAS_INCONSISTENTES 50,
  AZUCARES_INCONSISTENTES 25, TITULO_B_DISTINTO 1 (la B de azúcares, en la p. 105, dice "16.B").
- Criterios L1–L6 cumplidos. No quedó ningún nombre roto, ningún valor negativo, y todo entra en
  las escalas de las columnas (sodio máx. 40.000, saturadas máx. 82,48 con 3 decimales).
- **Dos corridas del lector dan el mismo `alimentos.json`**: md5 `529fd863…ee6a` en las dos. El
  archivo pesa 727 KB, con un alimento por línea.
- Ejemplos de 3.5 verificados en el JSON y en la base:
  - "Arroz blanco, hervido": P 2,4, CHO 28,6, G 0,2, kcal 125,8, publicadas 126.
  - "Queso Cremoso": 310,3.
  - "Limón": 35.
  - "Cerveza con alcohol": alcohol 3,9, kcal 43,7.
  - Nombres completos importados: "Sal dietética o modificada, PROMEDIO"; "Bebida láctea parcialmente descremada fluida, baja en lactosa, fortificada con vitaminas A, D, B2, B9 y Zinc"; "Vacuno, cortes semigrasos, PROMEDIO, crudo"; "Ají verde o amarillo / morrón verde o amarillo, crudo".
- Carga:
  - `npm run sara2:load -- --dry-run`: 890 creados, sin escribir nada (quedó PROPIO 90 y ningún SARA2).
  - `npm run sara2:load`: `890 en el archivo · 890 creados · 0 actualizados · 0 sin cambios · 0 desactivados`.
  - `npm run sara2:load` otra vez: `0 creados · 0 actualizados · 890 sin cambios · 0 desactivados`.
- SQL de control:
  - `source, count, activos`: SARA2 890/890, PROPIO 90/90.
  - SARA2 sin `sourceKey`: 0.
  - `sourceKey` duplicados: 0.
  - Arroz hervido: `125.80 | 2.40 | 28.60 | 0.20 | 126`.
  - Mensajes en `OutboundMessage` de las últimas 2 h: 0.

## Pruebas

- `npm run test` (core): **284 tests OK en 22 archivos**. Los tests nuevos cubren
  food-groups, food-nutrients, food-search, es-ar-number, ai-food-catalog, Atwater en
  nutrition.test, y en `sara2/`: bbox, names, layout, validate, read y dataset.
- El lector se prueba con **15 fixtures reales**: salida sin editar de
  `pdftotext -bbox -f N -l N`, páginas 18, 19, 58, 59, 62, 63, 74, 75, 90, 92, 97, 98, 104, 105 y 137.
- `npm run test:foods --workspace packages/db`: OK dos veces, antes y después de cargar SARA 2.
  En la segunda corrida también se probaron `findFoodNameConflicts("acelga cruda")` y
  `FoodNotEditableError`.
  - La carga se prueba dentro de una transacción que se revierte a propósito: idempotencia,
    mismos ids, un alimento desactivado sigue inactivo, uno que sale del archivo se desactiva sin
    borrarse, y un recorte del 20 % aborta.
  - Los propios de prueba se borraron por id: `cmufb8xia00orj29enkk6k4qn` y
    `cmufb9dcq000163on3lv3ft82`. Quedan 0 filas "Prueba HU-005%".
- `npm run typecheck`: limpio en core, db, **bot** y **web**.
- `./ops/harness/verify.sh`: "Arnés OK". Solo avisa (no bloquea) que la migración nueva ya está
  revisada.
- Catálogo de la IA medido con los datos reales: 980 alimentos activos dan **49.239 caracteres**,
  menos que el umbral de 60.000, así que no se excluye ningún grupo.

## Archivos

**packages/core**
- Nuevos, cada uno con su test: `src/food-groups.ts`, `src/food-nutrients.ts`, `src/food-search.ts`, `src/es-ar-number.ts`, `src/ai-food-catalog.ts`.
- Cambian: `src/nutrition.ts` (Atwater), `src/nutrition.test.ts`, `src/index.ts` y `package.json` (export `"./sara2"`).
- Nuevos en `src/sara2/`:
  - Módulos: `bbox.ts`, `columns.ts`, `names.ts`, `layout.ts`, `validate.ts`, `dataset.ts`, `read.ts`, `report.ts`, `index.ts`.
  - Tests: `{bbox,names,layout,validate,read,dataset}.test.ts` y el helper `fixtures.test-helper.ts`.
  - Fixtures: `__fixtures__/p*.xhtml` (15 archivos).

**packages/db**
- `prisma/schema.prisma`: solo el bloque de `FoodGroup`, `FoodSource` y `Food`. `prisma format` había reformateado otros modelos y eso lo revertí.
- Migración nueva: `prisma/migrations/20260924090541_food_sara2/migration.sql`.
- Dominio:
  - `domain/foods.ts`: reescrito. Se eliminan `createFood` y `updateFood`. Incluye el chequeo de tipos de los enums.
  - `domain/foodImport.ts`: nuevo.
  - `domain/index.ts`.
- `prisma/seed.ts`: grupos según D2, cambio mecánico, no se corrió.
- Scripts: `scripts/sara2/read-pdf.ts`, `scripts/sara2/load.ts`, `scripts/test-foods-sara2.ts`.
- Datos generados: `data/sara2/alimentos.json`, `data/sara2/reporte.md`.
- `package.json` (scripts `sara2:read`, `sara2:load`, `sara2:load:prod`, `test:foods`) y `tsconfig.json` (include).

**apps/web**
- `/alimentos`:
  - Cambian: `page.tsx`, `foods-list.tsx`, `actions.ts`, `[id]/page.tsx`, `nuevo/page.tsx`.
  - Nuevos: `own-food-form.tsx`, `food-energy-card.tsx`, `food-nutrients.tsx`.
  - Se borró `food-form.tsx`.
- Componentes nuevos: `food-picker.tsx`, `food-catalog.tsx`, `kcal-breakdown-popover.tsx`, `food-source-badge.tsx`, `primitives/popover.tsx`.
- Componentes que cambian: `meals-editor.tsx`, `data-table.tsx` (props opcionales `pageSize` y `pageResetKey`).
- Librerías: `lib/meal-view.ts`, `lib/food-groups.ts`.
- Plan y plantilla: `page.tsx` de cada uno (mapean `source`) y el `ai-actions.ts` del plan (formato `ref`).
- `package.json` y `package-lock.json`: solo `@radix-ui/react-popover@^1.1.23`.

**Raíz**: `package.json` (scripts `sara2:read` y `sara2:load`) y `README.md` (comandos y paso de
despliegue después de `migrate deploy`).

No quedaron scripts sueltos: el script con el que medí el catálogo de la IA estaba en
`packages/db` y lo borré.

## Contrato compartido

Los nombres y las firmas coinciden con la sección 5 de la SDD:
- 5.1.1–5.1.7 en core.
- `FOOD_SUMMARY_SELECT`, `listFoods`, `getFood`, `getFoodUsage`, `OwnFoodInput`, los 3 errores,
  `findFoodNameConflicts`, `createOwnFood`, `updateOwnFood`, `setFoodActive`, `applyAtwaterKcal`,
  `loadSara2Dataset`, `LoadSara2Result` y `Sara2LoadAbortedError` en db.
- `OwnFoodState`, `createOwnFoodAction`, `updateOwnFoodAction`, `setFoodActiveAction` y
  `applyAtwaterKcalAction` en web.

Lo único agregado:
- `SaraRawRow.columnError?` (opcional), para marcar una colisión de columnas en una fila.
- Helpers internos: `unitsMatch`, `sara2ColumnLabel`, `SARA2_EXCLUDED_REASON`, y en web `foodGroupLabel` y `foodGroupShortLabel`.

## Decisiones no obvias

1. **Errata del PDF en la columna B12**: 62 de los 63 renglones de unidades de la parte B dicen
   `mg` para vitamina B12 (debería ser µg, y los valores son µg: 2,76 en vizcacha). La
   verificación de columnas acepta `µg` o `mg` solo en esa posición, y se guarda como µg. Sin esto,
   la exigencia de "secuencia exacta" rechazaba todas las partes B.
2. **Se leen 63 secciones A y 63 B**, no las 61 que dice la SDD. L1 no fija un número: exige que
   cada A tenga su B y que estén las tablas 1–26. Los demás números coinciden con la resolución.
3. **Excluidas de la tabla 26**: se cuentan las filas A (24), una por alimento. Así coincide L5.
4. Test de validación: con la tolerancia del 5 %, la Banana **entra**. El caso de rechazo por
   ATWATER del test pasó a ser "Harina de maíz, hervida" (108 publicadas, 101,6 calculadas), con
   celdas reales del PDF.
5. **Edición de un propio**: la advertencia "Ya existe en SARA 2" solo aparece si cambió el
   nombre. Si no, los propios viejos que se llaman igual que un SARA 2 (por ejemplo "Banana")
   pedirían "Guardar igual" en cada guardado. La creación advierte siempre, como pide D12.
6. El formulario de propios usa `<form onSubmit>`: `await confirm()` va fuera de la transición y
   después `startTransition(() => formAction(fd))`. "Guardar igual" arma el `FormData` con
   `confirmSaraDuplicate=1` y pasa por el mismo camino (con la confirmación de uso si
   corresponde). Tiene `noValidate`, porque `step=0.1` bloqueaba valores válidos del rótulo; el
   servidor valida con zod.
7. El `FoodPicker` vuelve a "Alimento libre" cuando el form dispara el evento `reset` (React 19
   resetea después de la action). Enter con la lista abierta hace `preventDefault`, así que no
   envía el form.
8. `prisma format` reformateaba todo `schema.prisma`. Dejé el formato original y solo el bloque nuevo.
9. Prettier no tiene configuración en el repo y los archivos no están formateados con él, así que
   no lo apliqué.
10. No hubo WebFetch para `web-design-guidelines`. Usé la copia de las guías de Vercel que quedó en
    el scratchpad (`wig.md`). Hallazgos corregidos: comillas curvas en el hint de unidad y
    `motion-reduce` en el chevron de "Más nutrientes". Queda pendiente, porque la SDD no lo pide,
    que los filtros de `/alimentos` no se reflejan en la URL.

## Pendiente para el orquestador

- **Reiniciar el `next dev`** antes del recorrido de §14.
- Recorrido de §14. Los números de 14.1 cambian con Q2: la lista muestra "Mostrando 980 de 980
  alimentos" (90 + **890**), "Página 1 de 20", y el filtro "SARA 2" da 890.
