# impl HU-006 `antropometria-isak` (épicas 44 y 45)

Estado: **done**. Rama `hu-006-antropometria-isak`, sin commitear, `backlog.json` sin tocar.

> **Cambió el schema: hay que reiniciar el `next dev` del usuario** (cliente de Prisma regenerado).
> No levanté `next dev` ni corrí `next build`.

## Restricciones (SDD sección 13, copiadas)

1. **Datos de desarrollo:** ningún dato de negocio preexistente se borra ni cambia. Las únicas
   escrituras son la migración (aditiva) y `test-isak.ts`, que limpia por id.
2. **Prisma:** `pg_dump` antes; `--create-only` y revisar el SQL; nada de `migrate reset`, `db push`
   ni aceptar el reset por drift. Drift → `blocked` con `migrate status`.
3. **WhatsApp:** nada. Ningún script usa Baileys ni encola en `OutboundMessage`.
4. **Lógica:** fórmulas, constantes, clasificaciones, textos y validación en `packages/core`; lectura y
   escritura del estudio en `packages/db/domain/isak.ts`. La web no recalcula nada por su cuenta.
   IMC, ICC, cintura/talla y conicidad salen de `buildAnthropometricDiagnosis` (HU-004).
5. **`useConfirm`:** nunca `await confirm()` dentro de `<form action>` ni de `startTransition`.
6. **UI:** solo el sistema de diseño actual; `tailwind.config.ts` no se toca; colores de la barra y la
   somatocarta = hex que ya estaban en `chart-theme.ts`.
7. **Material ISAKMetry:** no se versiona, no se copia, no se imprime el nombre. Tests con los números
   de la HU y el caso C.
8. **No** `next build` ni otro `next dev`.
9. **Rama** `hu-006-antropometria-isak`, sin commitear, sin tocar `backlog.json`.

## Respaldo y chequeos de datos (solo lectura)

- Respaldo: `pg_dump` a `$SCRATCHPAD/backup-antes-HU-006.sql` (745 227 bytes, fuera del repo). No se
  restauró.
- `migrate status` antes: 13 migraciones, "Database schema is up to date".

| Chequeo | Antes | Después de migrar | Al final (después de `test:isak` ×2) |
|---|---|---|---|
| `count(*) EvolutionEntry` | 15 | 15 | 15 |
| `count(*) Consultation` | 18 | 18 | 18 |
| md5 de las 22 columnas viejas de `EvolutionEntry` (todas, ordenado por id) | `d09313295a85dfbfe8f93d50d5581b0f` | igual | igual |
| `EvolutionEntry where study is not null` | — | 0 | 0 |
| Pacientes `test-hu006-%` que quedaron | — | — | 0 |

## Migración `20260924095323_isak_anthropometry`

- `prisma migrate dev --create-only` se negó ("environment is non-interactive", por el aviso del
  índice único), igual que en la HU-005. Generé el SQL con `prisma migrate diff
  --from-schema-datasource … --to-schema-datamodel … --script` (solo lectura), creé la carpeta a mano
  y lo guardé sin tocar.
- El SQL es **exactamente** el de la SDD 3.2 paso 5: `CREATE TYPE "MeasurementStudy" AS ENUM ('ISAK')`,
  12 `ADD COLUMN` nullable (11 medidas + `study`) y `CREATE UNIQUE INDEX
  "EvolutionEntry_consultationId_study_key"`. `grep -Ei 'drop|not null|alter column|rename'` → sin salida.
- Aplicada con `npm run db:migrate` (sin drift ni oferta de reset) y después `npm run db:generate`.
  `migrate status` final: 14 migraciones, up to date.

## Archivos

**packages/core**
- Nuevos: `src/isak.ts`, `src/isak-study.ts`, `src/isak-form.ts`, `src/isak.test.ts`,
  `src/isak-study.test.ts`, `src/isak-form.test.ts`, `src/isak-fixtures.test-data.ts` (casos A, B, C
  como números, compartidos por los 3 tests), `scripts/validate-isakmetry.ts`.
- Modificados: `consultations.ts` (11 claves), `consultations.test.ts` (`m()` + caso "solo
  diámetros"), `patient-formula-data.ts` (`formatFixedEs`, `formatSignedFixedEs`) y su test,
  `index.ts` (3 exports).

**packages/db**: `prisma/schema.prisma`, la migración, `domain/isak.ts` (nuevo) y su export en
`domain/index.ts`, `scripts/test-isak.ts` (nuevo), `package.json` (`test:isak`).

**Raíz**: `package.json` (`isak:validate`).

**apps/web**
- Nuevos: `pacientes/[id]/isak-actions.ts`; en `consultas/[consultationId]/`: `isak-card.tsx`,
  `isak-form.tsx`, `delete-isak-study-button.tsx`, `diagnosis-rows.tsx`; en `.../antropometria/`:
  `page.tsx`, `loading.tsx`, `isak-measures-table.tsx`, `z-score-bar.tsx`, `tissue-stacked-bar.tsx`,
  `somatochart.tsx`.
- Modificados: `consultas/[consultationId]/page.tsx` (tarjeta, `searchParams.isak`, prefill),
  `consultation-measurements.tsx` (fila ISAK resumida sin tacho; fuera de Bioimpedancia),
  `anthropometric-diagnosis.tsx` (importa filas y tonos de `diagnosis-rows.tsx`, mismo JSX),
  `evolution-types.ts` (`study` + 11 campos, etiquetas D2), `measurement-fields.tsx` y
  `evolution-table.tsx` (etiquetas D2), `lib/evolution-rows.ts`, `lib/chart-theme.ts`
  (`isakTissueColors`).

**apps/bot**: sin cambios.

## Contrato compartido

Las firmas y nombres de la SDD sección 4 se respetaron tal cual: `ISAK_MEASURE_KEYS`,
`ISAK_MEASURES`, `ISAK_MEASURE_GROUPS`, `missingMeasuresNote`, `PHANTOM` (26 valores de la tabla
4.1.2, con comentarios de fuente y de D5/D7), `phantomScale`, `phantomZ`,
`durninWomersleyCoefficients`, `durninWomersleyDensity`, `siriBodyFatPercent`, `sum6/sum8SkinfoldsMm`,
`kerrAdiposeZ`, `kerrAdiposeTissueKg`, `correctedGirthCm`, `LEE_ETHNICITY_TERM`, `leeMuscleMassKg`,
`rochaBoneMassKg`, distribuciones, índices y clasificaciones, Heath-Carter, `classifySomatotype`,
`SOMATOCHART_*`; `IsakValue`, `IsakClassified`, `IsakStudyResult`, `buildIsakStudy`, `ISAK_TEXT`,
`ISAK_METHOD_LABELS`, `buildIsakSummary`, `isakDifference`, `daysBetweenDayKeys`; `ISAK_RANGES`,
`ISAK_FORM_TEXT`, `parseIsakNumber`, `validateIsakForm`; `IsakStudyExistsError`,
`IsakStudyNotFoundError`, `toIsakMeasures`, `getIsakStudy`, `createIsakStudy`, `updateIsakStudy`,
`deleteIsakStudy`, `getPreviousIsakStudy`; `IsakFormState`, `saveIsakStudyAction`,
`deleteIsakStudyAction`. `DW_TABLE` quedó privada al módulo (la SDD no la exporta). Agregados:
`Sum6Input`/`Sum8Input` exportados (los usa la firma), `MUSCLE_BONE_TONES` en `diagnosis-rows.tsx`.

## Decisiones no obvias / desvíos

1. **Talla sentado > talla contra rango (core).** El escenario de la HU (talla 164, sentado 170) exige
   "La talla sentado no puede ser mayor que la talla", pero 170 también está fuera de 30–130 y la
   prioridad literal de la SDD daría el error de rango. Con una talla válida, "sentado > talla" le gana
   al error de rango de la talla sentado (no al de formato). El test SDD "sentado = talla → ok" con 164
   choca con el rango 30–130: lo probé con 120/120 (ok) y 120/120,5 (error), y con talla vacía no se
   compara.
2. **Formulario sin `<form action>`.** `IsakForm` hace `preventDefault` en `onSubmit`, valida con core
   (síncrono) y despacha `startTransition(() => action(formData))`. Motivo: React 19 resetea los campos
   no controlados después de una `<form action>`, y un error del server borraría las 21 medidas.
   `useActionState`, `pending`, `useActionToast` y el patrón `lastState` siguen iguales; ningún
   `confirm()` dentro de la transición.
3. **Z de la masa grasa** con los kg sin redondear; **Z adiposo** = Z de Kerr del Σ6 (D6); **Z de
   muscular/óseo/residual** con los kg redondeados; somatocarta con los componentes sin redondear, como
   fija la SDD.
4. **Piso 0,1** también en endo y meso (decisión de diseño documentada en el código).
5. **Somatocarta:** "Actual" círculo y "Anterior" rombo (no solo color); las etiquetas de los vértices
   con `ReferenceDot r=0`; ejes y contorno con `ReferenceLine segment` del color por defecto, que
   `ChartContainer` pinta con `stroke-border`. Un `figcaption` `sr-only` repite los puntos en texto.
   Sin Fragment como hijo del chart.
6. **Página del estudio:** la comparación con el anterior va en columnas "Anterior"/"Dif." en las
   tablas (Medidas: Dif. del valor medido, 1 decimal; composición: kg) y como "Anterior X (±d)" en las
   filas de índices, proporcionalidad, IDG y tiles del somatotipo. Las listas de distribución no
   tienen anterior (no son tablas).
7. **Barra apilada** decorativa (`aria-hidden`); los valores van en texto en la leyenda.
8. **`isak-fixtures.test-data.ts`**: los casos A/B/C viven en un archivo aparte en vez de repetirse al
   inicio de cada test (no matchea el patrón de vitest; no se exporta desde `index.ts`).
9. **Script de validación:** las celdas vacías del Excel son autocerradas; el regex lo contempla. El
   PDF no trae % de tejidos ni residual, así que no se comparan (el Excel sí trae residual kg y Z).

## Verificación

- `npm run typecheck`: core, db, **bot** y **web** limpios.
- `npm run test`: **25 archivos, 365 tests OK** (isak 35, isak-study y isak-form nuevos).
- `npm run lint --workspace apps/web`: sin avisos nuevos (solo uno previo en `ajustes/logo-form.tsx`).
- `npm run test:isak --workspace packages/db`: los 7 pasos `ok` y `OK` (corrido dos veces). Prisma
  loguea en consola el P2002 esperado del paso 4.
- `npm run test:confirm-flow --workspace apps/bot`: 5/5 escenarios OK.
- `npm run isak:validate -- --check-leaks`: "Sin fugas del nombre en archivos versionados". Además
  comprobé que el detector funciona: con un archivo temporal sin versionar que contenía el apellido
  listó esa ruta; lo borré enseguida.
- `git status --porcelain | grep -i isakmetry`: sin salida.
- `./ops/harness/verify.sh`: "Arnés OK" (solo el WARN recordatorio de migración nueva, ya revisada).

### `npm run isak:validate` (sin datos identificatorios)

Resultado: **100 OK · 2 TOLERADA · 3 CONOCIDA · 0 DIF**. Las filas no OK:

| Caso | Campo | ISAKMetry | Sistema | Dif. | Tolerancia | Estado |
|---|---|---|---|---|---|---|
| xlsx · masculino · 21 | Z masa corporal | 1,26 | 1,27 | 0,01 | ±0,02 (D7) | TOLERADA |
| xlsx · masculino · 21 | Z tejido adiposo | 2,44 | −0,94 | −3,38 | D6 (Excel viejo) | CONOCIDA |
| xlsx · masculino · 21 | Z muslo corregido | 0,62 | 1,70 | 1,08 | D5 | CONOCIDA |
| pdf · masculino · 22 | Z masa corporal | 0,40 | 0,42 | 0,02 | ±0,02 (D7) | TOLERADA |
| pdf · masculino · 22 | Z muslo corregido | 0,17 | 0,84 | 0,67 | D5 | CONOCIDA |

Todo lo demás coincide al decimal que se muestra: los 19–20 Z de medidas por caso, masa grasa kg/Z y
MLG (PDF), los 4 tejidos kg y Z (salvo el adiposo del Excel), distribución adiposa y muscular (PDF),
IAM, IMO, Σ6, Σ8, corregidos y sus Z (salvo el muslo), diferencia de brazo, córmico, Manouvrier,
envergadura relativa, endo/meso/ecto, ICC, conicidad, cintura/talla, IMC e IDG (PDF, 0,65).

## Skills de UI

- `ui-ux-pro-max`: consultado antes del JSX (errores en línea junto al campo y foco al primero,
  tablas con scroll horizontal, scatter con forma además del color y alternativa en texto).
- `ui-styling`: antes de tablas y Recharts (primitivos existentes, tokens existentes, sin colores nuevos).
- `web-design-guidelines` (autochequeo): agregué foco visible al enlace "ver estudio"; `scroll-mt` en el
  ancla `#antropometria-isak`; `autoComplete="off"`, `aria-invalid`, `aria-live` en las sumatorias;
  "Guardando…" con elipsis. No hay aviso de cambios sin guardar al navegar (fuera del alcance de la SDD:
  solo "Cancelar" pregunta).

## Pendiente para el orquestador

- Reiniciar el `next dev` del usuario y hacer el recorrido de la SDD sección 12.
- Nota de la SDD 10.5: `docs/EJEMPLO DE INFORME ANTROPOMETRICO.pdf` está versionado y tiene el nombre
  del evaluado; no lo toqué.

## Ronda de resolución 1

Alcance: el único cambio requerido de `progress/review_HU-006.md` (`onDone()` llamado durante el render de `IsakForm`).

### Archivo tocado
- `apps/web/src/app/(panel)/pacientes/[id]/consultas/[consultationId]/isak-form.tsx`

### Cambio
- El bloque `lastState` del render ahora ajusta solo estado **propio**: con `fieldErrors` del server hace `setErrors` y sube `focusFirstError`. Ya no llama a `onDone()`.
- El aviso al padre pasó a un `useEffect` que depende de `state`: si `state.ok`, llama a `onDone()` (que hace `setMode("view")` en `IsakCard`). Queda fuera del render, así que desaparece el aviso "Cannot update a component while rendering a different component".
- Para no llamar dos veces por el mismo `state` (StrictMode re-ejecuta los efectos en desarrollo), un `useRef` (`notifiedState`) guarda el último `state` ya notificado y el efecto sale si coincide. Mismo criterio de dependencias que `consultation-date-sheet.tsx` (solo la identidad de `state`).
- No hay `confirm()` dentro de transiciones ni de `<form action>`: el submit y la cancelación quedaron como estaban.

### Otros archivos con el mismo patrón
- Revisé los usos de `lastState` / `onDone` en `pacientes/[id]`. `consultation-measurements.tsx` usa `lastState` pero solo cambia estado propio (`setFormKey`): es válido y no se tocó. `consultation-date-sheet.tsx` ya avisa en un `useEffect`, y `requirement-calculator.tsx` lo hace dentro de un handler/transición. Ninguno repite el patrón roto.

### Verificación
- `npm run typecheck`: limpio en core, db, bot y web.
- `npm run test`: 25 archivos, 365 tests OK.
- `./ops/harness/verify.sh`: "Arnés OK" (sigue el WARN de siempre sobre la migración nueva, que no es de esta ronda).
- No levanté `next dev` ni corrí `next build`. No hubo escrituras en la base ni WhatsApp. Queda pendiente el recorrido en el navegador (alta, edición y cancelar mirando la consola), como sugiere el review.

### Ajuste 2: el formulario no se cerraba después de un alta (lo encontró el orquestador en el navegador)
- Causa: en `isak-card.tsx`, `IsakForm` tenía `key={study?.entryId ?? "new"}`. Al guardar un alta, `revalidatePath` trae `study` con su id, la key pasa de "new" al id y React remonta `IsakForm` con un `useActionState` nuevo, en estado inicial. El `state.ok` se perdía con la instancia vieja, así que no se llamaba a `onDone` ni aparecía el toast, y el formulario remontado quedaba en modo edición.
- Arreglo: saqué la `key` (archivo tocado: `apps/web/src/app/(panel)/pacientes/[id]/consultas/[consultationId]/isak-card.tsx`). Para precargar no hace falta, porque al pasar de "view" a "form" `IsakForm` se monta de cero y toma los `defaultValue` de `initial` (los valores del estudio al editar, o el prefill de peso y talla en un alta).
- `entryId` en cada submit: el `<input type="hidden" name="entryId" value={entryId ?? ""}>` es controlado y sale de la prop en cada render, así que el `FormData` de cada submit lleva el valor actual. El primer guardado es un alta y, una vez que la revalidación trae el id, los siguientes son ediciones.
- "Editar" en la vista hace `setMode("form")`, que monta `IsakForm` con `initial = study.values`, así que precarga. "Cancelar" llama a `onDone` y vuelve a "view", después del `confirm` si hay cambios. Ese `confirm` está en un handler de click, fuera de toda transición y de `<form action>`. Lo revisé leyendo el código. No lo probé en el navegador porque no levanté `next dev`.
- Verificación después del ajuste: `npm run typecheck` limpio, `npm run test` con 365 tests OK y `./ops/harness/verify.sh` con "Arnés OK".
