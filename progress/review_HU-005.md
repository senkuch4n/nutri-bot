# Review — HU-005

**Veredicto:** APPROVED

Revisión 1 (primer intento). Rama `hu-005-base-alimentos-sara2`, cambios sin commitear. Manda la
"Resolución del orquestador" de la SDD §16: Q1-b (la suma rechaza fuera de 90–110 g y advierte fuera
de 97–103) y Q2 (Atwater con `máx(2 kcal, 5 %)`). Resultado esperado: 890 importadas y 16 rechazadas.

## Verificación corrida por el reviewer

- `npm run typecheck`: limpio en core, db, bot y web (exit 0).
- `npm run test`: 22 archivos y 284 tests OK.
- `./ops/harness/verify.sh`: exit 0, "Arnés OK". Solo el WARN informativo de migración nueva, que revisé abajo.
- `npm run sara2:load -- --dry-run`: `890 en el archivo · 0 creados · 0 actualizados · 890 sin cambios · 0 desactivados`. La carga es idempotente contra la base real y la transacción se revirtió.
- Lector re-ejecutado en memoria (`readSara2` sobre `pdftotext -bbox` del PDF completo, script en el
  scratchpad, sin escribir en el repo): `status ok`, 906 filas A, 890 importadas, 16 rechazadas (1,77 %),
  24 excluidas. El `serializeSara2Dataset` resultante es **byte a byte igual** a
  `packages/db/data/sara2/alimentos.json`. Las 16 rechazadas coinciden con las de la SDD sin la Banana
  (ATWATER 5, SUMA_MACROS 9, NUMERO_INVALIDO 1, SIN_PAREJA_B 1).
- Fixtures: regeneré p018, p058, p074, p092, p105 y p137 con `pdftotext -bbox -f N -l N` y son idénticas
  (`cmp`) a las de `packages/core/src/sara2/__fixtures__/`. Son reales y no están editadas.

### Integridad de los 90 alimentos propios (solo lectura, contra el pg_dump previo)

Extraje el bloque `COPY public."Food"` de `backup-antes-HU-005.sql` (90 filas, tomado antes de la
migración), mapeé el grupo viejo según D2 y lo comparé con la base actual (`source = 'PROPIO'`),
columna por columna: id, name, group, kcal, P, CHO, G, unitHint, active, createdAt, **updatedAt** y fibra.
El `diff` dio **vacío**, así que ni siquiera cambió el `updatedAt`.
- `Food`: PROPIO 90 (90 activos, 90 con `groupAutoAssigned`) · SARA2 890 (890 activos, 0 con `groupAutoAssigned`).
- Grupos de los propios: ACEITES 9, AZUCARES_MERMELADAS_Y_DULCES 9, BEBIDAS_SIN_AZUCAR 9, CARNES 9,
  FRUTAS 9, LECHE_Y_POSTRES 9, LEGUMBRES_CEREALES 18, OTROS 9, VERDURAS 9. GRASAS queda en 0.
- `PlanMealItem`: 52 filas, igual que en el dump. Hay 36 `foodId` distintos, **todos PROPIO y todos
  existentes** (0 huérfanos). `TemplateMealItem`: 0.
- Ningún propio tiene `sourceKey`, `nutrients` ni `alcoholPer100`. No quedan filas "Prueba HU-005%".

### El lector: 16 filas muestreadas contra `pdftotext -layout`

Tomé 12 al azar (semilla fija) más 4 nombres largos de varios renglones. Comparé el nombre completo,
las kcal publicadas, el agua, P, G, colesterol, saturadas, CHO disponibles, fibra y alcohol (parte A),
y las cenizas, el sodio, la vitamina C y la vitamina D (parte B). **Todas coinciden:**
Granada · Fernet · Mondongo, crudo · Mollejas, crudas · Lengua, cruda · Batata, cruda · Aceite de
girasol alto oleico · Empanaditas chinas (restaurant) · Café preparado a partir de grano molido (tipo
café de filtro) · Leche fórmula para prematuros etapa 1, en polvo ("eta-/pa 1" en la B) · Yogur
descremado con frutas y cereales ("ce-/reales" con los números en el medio) · Bebida a base de soja y
jugo, varios sabores light · Chicha, bebida tradicional obtenida por fermentación del maíz ("obteni-/da
por" en la A y "obtenida/por" en la B) · Arroz envasado deshidratado … (tipo cuatro quesos, primavera,
etc.) (4 renglones) · Puré de frutas envasado (alimento infantil) · Ñoquis de papa, envasados, hervidos.
Casos límite verificados:
- **Chicha, parte B:** el renglón tiene solo 9 de 19 celdas y el lector asigna bien por geometría:
  calcio 25, fósforo 35, hierro 3,5, y null en sodio, potasio, cobre, magnesio, zinc, niacina, folato,
  tiamina y riboflavina, como en el PDF.
- **Bebida de soja light:** con la ceniza vacía queda cenizas = null y sodio = 27. El lector no corre la columna.
- **"McDonald's, McNuggets x 10":** el 10 no se toma como valor (kcal 242, P 14,6, sodio 344, como en el PDF).
- **Controles globales sobre las 890 filas:** 0 nombres rotos (guion final, minúscula inicial, `*`,
  dobles espacios); 0 valores negativos; `kcalPer100` = Atwater exacto en las 890 (D5).

## Checkpoints

### C1 — El arnés está sano
- `backlog.json` válido, 1 HU activa: [x] (verify.sh: "11 HU, 1 activa").
- `progress/current.md` refleja la HU en curso: [x] (es del orquestador y está fuera del diff; verify.sh lo acepta).
- `verify.sh` exit 0: [x].

### C2 — Cadena de documentos
- `docs/hu-base-alimentos-sara2.md` completa, con Resoluciones: [x].
- `Refactorizaciones/base-alimentos-sara2.md` con workspaces, checklist atómico y contrato: [x].
- Firmas y nombres del diff = Contrato compartido: [x]. Core 5.1.1–5.1.7, `domain/foods.ts` (5.2.1,
  incluido el chequeo `Same<FoodGroup, FoodGroupKey>`), `domain/foodImport.ts` (5.2.2), actions (7.2).
  `createFood` y `updateFood` se eliminaron y no quedan consumidores. Agregados menores documentados en el impl
  (`SaraRawRow.columnError?`, `foodGroupLabel` y `foodGroupShortLabel`).

### C3 — Arquitectura
- Lógica pura en core (lector, validaciones, Atwater, búsqueda, catálogo IA) y operaciones de base en
  `packages/db/domain`: [x]. La ficha usa `getFood` y `getFoodUsage`, no `prisma` directo.
- Web y bot compilan; consumidores de `FoodGroup` ajustados: [x]. No queda ningún valor viejo
  (`CEREALES`, `LACTEOS`, `CARNES_Y_HUEVOS`, `AZUCARES_Y_DULCES`, `"BEBIDAS"`, `"LEGUMBRES"`) en apps,
  packages ni seeds (grep vacío fuera de la migración). `seed.ts` sigue D2 al pie (9×7 cambios, mecánico).
  Web: `lib/food-groups.ts` re-exporta de core; `actions.ts` usa `z.enum(FOOD_GROUP_VALUES)`; el
  asistente usa `FOOD_GROUP_SHORT_LABELS` vía `buildAiFoodCatalog`. El bot no usa `Food`.
- Migración `20260924090541_food_sara2`: [x]. Es idéntica al SQL de la SDD 4.3: el `CASE` cubre los 10
  valores viejos, `GRASAS → ACEITES` y no hay `ELSE`, así que un valor desconocido falla por NOT NULL y
  revierte todo. El único DROP es `DROP TYPE "FoodGroup_old"` después del rename. Las columnas nuevas son
  nullable o NOT NULL con default (`source`, `groupAutoAssigned`), más el backfill `groupAutoAssigned = true`.
  Tiene el CHECK de fuente con clave de origen, el índice único de `sourceKey` y `(source, active)`.
  Ninguna columna existente cambia de tipo. Es coherente con `schema.prisma`.
- Rutas nuevas protegidas: [x]. `/alimentos/*` está bajo `(panel)` y el matcher del middleware solo
  excluye login, inicio, portal y los assets. El portal no cambia: `toMealView` suma `kcalBreakdown`, que
  el portal no muestra, y el alcance sigue siendo el plan propio del paciente.
- Bot en silencio, textos: [x] (N/A: el bot no se toca y la HU no encola mensajes).
- Sin `console.log` de debug ni TODOs en el código de la app: [x]. Los `console.log` que hay están en
  scripts CLI (lector, cargador, test) y son la salida esperada.

### C4 — Verificación real
- `npm run typecheck` limpio: [x].
- Tests de core con vitest, `npm run test` pasa y no son circulares: [x]. Validan contra fixtures reales
  del PDF (p. 18/19/58/59/62/74/75/90/92/97/98/104/105/137) y celdas copiadas del PDF. Los valores
  esperados (125,8; "kcal publicadas 108, calculadas 101,6, diferencia 6,4"; "suma de macros = 88,9 g";
  «0.121»; "16.B" → tabla 12; Salmón blanco → SIN_PAREJA_B) están escritos a mano, no derivados del
  código probado. También cubren la DP de nombres con coordenadas reales de la p. 92.
- Flujo del bot simulado: [x] (N/A).
- PDF o documento generado: [x] (N/A: el PDF del plan no cambia).

### C5 — Cierre
- `progress/impl_HU-005.md` describe lo tocado: [x].
- `progress/review_HU-005.md` con veredicto: [x] (este archivo).
- Sin scripts sueltos ni datos de prueba en la base: [x]. Quedan 0 "Prueba HU-005%" y `git status` no
  muestra archivos ajenos al checklist (`docker-compose.prod.yml` está fuera del alcance de esta review).

### Puntos pedidos por el orquestador
- **Cargador idempotente y sin tocar propios:** [x]. Todas las consultas filtran `source: "SARA2"`
  (`findMany`, `update` con `where: { id, source: "SARA2" }`, `updateMany` con `sourceKey in … and active`).
  Nunca borra. Respeta `active`, `unitHint` y `reference`. Tiene un freno si desactivaría más del 10 %.
  El dry-run real dio 890 sin cambios.
- **`useConfirm`:** [x]. `own-food-form.tsx:119` usa `<form onSubmit>`; `await confirm()`
  (`own-food-form.tsx:91`) va antes de `startTransition(() => formAction(formData))`
  (`own-food-form.tsx:103`). "Guardar igual" pasa por el mismo camino. Es el único uso de `confirm` en
  los archivos tocados. Los `<form action>` de la ficha ("Desactivar", "Usar X kcal") no confirman, como
  pide la SDD 9.3.
- **UI y sistema de diseño:** [x]. Solo primitivos existentes (`Card`, `Alert`, `Badge`, `DataTable`,
  `ToggleGroup`, `Switch`, `Select`, `NumberInput`, `Table`) más el `Popover` de shadcn y Radix que pide
  la SDD. El `FoodSourceBadge` usa neutral para SARA 2 y el tono info para Propio. No hay colores
  hardcodeados (grep vacío). Tokens `bg-popover`, `text-muted-foreground`, `tabular-nums`, es-AR. El
  combobox es ARIA 1.2 (`role=combobox/listbox/option`, `aria-activedescendant`, Enter con
  `preventDefault`, Esc, Tab, `onMouseDown`).

## Cambios requeridos (si CHANGES_REQUESTED)

Ninguno.

## Dudas (no bloqueantes)

- **`packages/db/prisma/seed-demo.ts:39-43`:** resuelve los alimentos por nombre con
  `new Map(foods.map(f => [f.name, f]))` sobre **todos** los `Food`. Ahora hay nombres repetidos entre
  propios y SARA 2 ("Frutilla", "Palta", "Aceite de girasol"…), así que el demo puede enganchar el SARA 2
  o el propio según el orden de `findMany`. No se corre sin pedido del usuario y no rompe nada; conviene
  filtrarlo por `source: "PROPIO"` en una tarea puntual.
- **Duplicar como propio:** 3 alimentos SARA 2 tienen P + CHO + G + fibra + alcohol > 100 g
  ("Cereal desayuno, copos azucarados, fortificados" 101,9; "Cereal desayuno, copos de maíz sin azúcar,
  sin fortificar" 101,9; "Snacks saborizados salados a base de maíz" 104,9). Al duplicarlos, el formulario
  no deja guardar sin corregir antes los valores (`MACROS_OVER_100`). Es coherente con la regla de la HU,
  pero puede sorprender.
- **`apps/web/src/app/(panel)/alimentos/actions.ts:65`:** un nombre vacío o de 1 carácter cae en el
  error genérico "Revisá los datos: hay valores fuera de rango." (el form tiene `noValidate`). Es un
  mensaje poco específico, aunque la SDD no pide otro.
- **`actions.ts:137`:** al editar, la advertencia "Ya existe en SARA 2" solo aparece si cambió el nombre.
  Es una desviación razonable, documentada en el impl (decisión 5), y D12 solo exige la advertencia al crear.
- **Despliegue:** `apps/bot/Dockerfile` corre `npm ci` con `NODE_ENV=production` y `tsx` es
  devDependency del bot. Es un problema previo que afecta también al `start` del bot, no a esta HU. El
  README ya documenta el plan B por túnel para `sara2:load`.
- **`reporte.md`** incluye la fecha de generación, así que cambia en cada corrida. Es lo que pide la SDD
  6.1; el que es estable es `alimentos.json`.
- El impl informa 63 secciones A/B contra las 61 de la SDD (3.4). L1 no fija el número, y los totales
  de filas coinciden (906 / 890 / 16 / 24), así que no afecta.
