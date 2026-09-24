# impl HU-002b — `rediseno-ui-pacientes` (Rediseño UI 2/4: pacientes)

**Estado: `done`** (código completo; `typecheck` de los 4 workspaces, `npm run test` (49), `verify.sh`
y los greps de §13.3 en verde; PDF renderizado y verificado en el scratchpad con `pdffonts`/`pdftotext`).
**Salvedades para el orquestador** en "Lo que no se pudo verificar": el recorrido visual (§13.5) es del
orquestador, y el `next dev` del usuario (pid 86416) puede necesitar reinicio tras el
`npm uninstall` de MUI/Emotion (ver "Servidor de desarrollo").

SDD: `Refactorizaciones/rediseno-ui-pacientes.md`. HU: `docs/hu-rediseno-ui-empresarial.md`
("Resoluciones", fila HU-002b). Base: HU-002a. Rama: `hu-002-rediseno-ui-empresarial`. Sin commits.
Decisiones D-b1 a D-b4 de §14 aplicadas tal como están.

---

## Restricciones duras (copiadas tal cual de la SDD, §2.1)

1. **Cero cambios de funcionalidad.** No se tocan: ninguna server action
   (`pacientes/actions.ts`, `pacientes/[id]/clinical-actions.ts`, `pacientes/[id]/planes/actions.ts`,
   `planes/[planId]/actions.ts`, `planes/[planId]/ai-actions.ts`), ninguna consulta (los bloques
   `Promise.all([...])`, `prisma.*` y las llamadas a `@nutri-bot/db/domain` de las `page.tsx`
   quedan **idénticos**), `packages/`, `schema.prisma`, `apps/bot`, `api/**`, `auth*.ts`,
   `middleware.ts`, `meals-editor.tsx` (es de la 002d) y las páginas del portal (002d).
   `plan-pdf-actions.tsx` **sí** se toca: es un componente cliente de UI, no una server action.
   Si un reordenamiento obliga a mover un componente, se mueve **con su lógica tal cual**: mismo
   `useActionState`, mismos `name` de los campos, mismos `hidden`, mismo `action`.
2. **No correr `next build` ni levantar otro `next dev`.** El usuario tiene el suyo en el puerto
   3000. Esta HU **no toca `tailwind.config.ts`** (las clases nuevas las toma el JIT sin
   reiniciar). Si por algún motivo hubiera que tocarlo, parar y avisar para que el usuario
   reinicie el dev (Tailwind 3.4 en Node 24 no lo recarga). Si después de `npm install` o
   `npm uninstall` el dev tira "Module not found", anotarlo en `impl` y avisar: el orquestador
   pide el reinicio. No reiniciarlo.
3. **WhatsApp: nada.** No se toca "Enviar por WhatsApp" en ningún plan: encola el PDF para el
   paciente. El PDF se verifica con la ruta temporal de solo lectura de §13.4, no con "Generar
   PDF" sobre un plan real, porque ese botón **sobrescribe** el `pdfData` guardado del plan.
4. **Base de desarrollo: solo lectura.** No se guarda ningún formulario sobre pacientes reales
   (datos, ficha clínica, datos para cálculos, medición, plan). Si hace falta probar un guardado,
   se hace con un paciente propio creado y borrado por id (regla de `AGENTS.md`). En esta HU no
   debería hacer falta: los flujos se verifican por diff (la lógica no cambia).
5. Rama `hu-002-rediseno-ui-empresarial`. **No commitear.** Anotar el `git status --porcelain`
   inicial y no tocar los archivos ajenos que ya estaban modificados (`backlog.json`,
   `progress/current.md`, `docker-compose.prod.yml`).
6. No correr `prisma migrate`, `db push`, `db:seed` ni `seed:demo`.
7. **Límite servidor/cliente:** ninguna `page.tsx` (server) le pasa **funciones** a un
   componente cliente. `PatientTabs` recibe `ReactNode` y números; los gráficos y `DataTable`
   reciben datos planos, y sus `formatter`/`cell` se definen **dentro** del componente cliente.

**Cumplimiento:** no se leyó ni escribió en la base de desarrollo (ni siquiera con la ruta
`/prueba-pdf`: no tengo sesión de Google; el PDF se probó con fixtures en memoria), no se levantó
el bot, no se mandó nada por WhatsApp, no se corrió `next build` ni otro `next dev`, no se corrió
ningún comando de Prisma, no se tocó `tailwind.config.ts`, `globals.css`, `backlog.json` ni
ninguna server action. Las `page.tsx` no le pasan funciones a componentes cliente: `cell`,
`sortValue`, `rowHref`, `formatter` y `labelFormatter` viven dentro de los componentes cliente.

---

## Fase 0: preflight

- `git branch --show-current` → `hu-002-rediseno-ui-empresarial`.
- `git status --porcelain` inicial: `?? docker-compose.prod.yml` (único ajeno; no tocado).
- `pgrep -fl "next dev"` → pid **86416** en el 3000. No se corrió `next build`.
- `npm run typecheck --workspace apps/web` → verde (línea base).
- Bloques de consulta guardados en el scratchpad (`queries-patient-page.txt`, `queries-plan-page.txt`)
  para comparar al final (§13.2, más abajo).

**Archivos ajenos que aparecieron modificados durante la sesión y que NO toqué** (los movió otro
proceso/sesión mientras trabajaba; no estaban en el porcelain inicial): `docs/historias-usuario-nutridesk.md`,
`progress/current.md`, `docs/EJEMPLO DE INFORME ANTROPOMETRICO.pdf`,
`docs/INFORMACIÓN APP PROVISTA POR LA NUTRICIONISTA.pdf` (los dos PDF nuevos, sin trackear).

---

## Fase 1: Recharts y `primitives/chart.tsx`

- `npm install --workspace apps/web recharts@^3.10.1` → **recharts 3.10.1**, sin quejas de peers,
  sin `--force`. `react-is` resuelve **16.13.1** (esperado, §4.1). Regla del Fragment cumplida:
  `grep "<>"` en los tres gráficos → 0.
- `chart.tsx` descargado de `https://ui.shadcn.com/r/styles/new-york-v4/chart.json` (373 líneas).
  Adaptaciones aplicadas:
  1. `import { cn } from "cn"` → `@/lib/utils`.
  2. `outline-hidden` → `outline-none` en `[&_.recharts-layer]` y `[&_.recharts-sector]`; la de
     `[&_.recharts-surface]` **borrada** (la superficie recibe el foco del `accessibilityLayer` y
     muestra el anillo de `globals.css`).
  3. `font-mono font-medium text-foreground tabular-nums` → `font-medium text-foreground tabular-nums`.
  4. **No prevista en la SDD, necesaria:** el indicador del tooltip usaba sintaxis de Tailwind 4
     `border-(--color-border) bg-(--color-bg)`, que en Tailwind 3 no genera CSS (el cuadradito de
     color quedaba invisible). Pasó a `border-[var(--color-border)] bg-[var(--color-bg)]`.
  Exports iguales a shadcn: `ChartContainer, ChartTooltip, ChartTooltipContent, ChartLegend,
  ChartLegendContent, ChartStyle, type ChartConfig`. Los tipos de Recharts 3.10 coincidieron con
  el registry (3.8): no hubo que tocar tipado.

## Fase 2: gráficos nuevos detrás de la misma API

- `lib/chart-theme.ts`: reescrito sin MUI. Conserva `chartSeriesColors` y `chartDefaultColor`;
  agrega `chartStudyColors`, `studyColor(index, total)` y `chartMetricColors`; **borrados**
  `chartSx`, `chartMargin` y el import de `@mui/material/styles` (sin consumidores).
- `lib/evolution-series.ts` (nuevo, puro): `seriesPoints`, `latestWithDelta`, `lastStudies`,
  `formatDelta` con las firmas de §6.2. `formatDelta` devuelve "Sin cambios" cuando la magnitud
  redondeada con `decimals` es 0 (así "−0,0 kg" nunca aparece).
- `components/evolution-chart.tsx`: `BarChart` + `Cell` (última barra opacidad 1, anteriores 0,85)
  + `LabelList` (valor encima si `showValues ?? points.length <= 8`). API conservada
  (`points, seriesLabel, color, height`) + opcionales `unit, decimals, showValues`. Con 1 punto
  dibuja; sin puntos, "Sin datos para graficar.". El tooltip muestra la fecha completa
  (`labelFormatter` leyendo `payload[0].payload.full`) y el valor con unidad y espacio duro.
- `components/comparative-chart.tsx`: barras agrupadas por fecha con dos `YAxis` (`left`/`right`)
  con la unidad en los ticks, `ChartLegend`, `null` deja hueco. API conservada.
- `components/study-comparison-chart.tsx` (nuevo): barras agrupadas por medida, una por estudio,
  colores `studyColor` (grises → azul el último), leyenda arriba, tooltip por grupo con unidad,
  medidas sin ningún valor filtradas.
- `portal/evolucion/page.tsx` compila **sin tocarlo** y pasa a barras (O-b3).

## Fase 3: sacar MUI y Emotion

- `grep -rn -e "@mui" -e "@emotion" apps/web/src` → 0 antes de desinstalar.
- `npm uninstall --workspace apps/web @mui/material @mui/system @mui/x-charts @emotion/react @emotion/styled`.
- `git diff apps/web/package.json`: salen exactamente esos 5, entra `recharts@^3.10.1`. Nada más.
- `package-lock.json`: +213/−905 líneas. Entran solo las deps de Recharts (`recharts`, `victory-vendor`,
  `d3-*`, `redux`/`react-redux`/`@reduxjs/toolkit`/`immer`/`reselect`, `es-toolkit`, `decimal.js-light`,
  `eventemitter3`, `tiny-invariant`, `@standard-schema/*`, `@types/d3-ease`, `@types/use-sync-external-store`);
  salen las de MUI/Emotion (`@mui/*`, `@emotion/*`, `@babel/*` que arrastraba Emotion, `@popperjs/core`,
  `@base-ui/utils`, `@types/d3-format`/`d3-geo`…). `@keyv/serialize` figura en ambos lados porque
  npm lo reubicó en el árbol (misma versión). Ningún cambio ajeno.
- `node -e "require.resolve('@mui/x-charts')"` → "OK sin MUI". Nada en el portal, PDF, bot ni
  `packages/` importa MUI (grep sobre `apps/web/src`, `apps/bot/src`, `packages`).

## Fase 4: lista de pacientes

- `pacientes/patients-list.tsx` → `DataTable<PatientRow>` (Nombre / Teléfono / Próximos turnos)
  dentro de `Card padding="none"`, buscador `Input type="search"` con `Search` de lucide,
  contador "n de m", dos `EmptyState` (sin pacientes / sin resultados), orden inicial por nombre,
  `rowHref`, `maxHeightClassName="max-h-[calc(100vh-15rem)]"`. `PatientRow` y el filtrado
  (`normalize` + dígitos) idénticos. D-b1: muestra la **cantidad** de próximos turnos.
- `pacientes/loading.tsx` nuevo; `skeletons.tsx` con prop `bare` en `TableSkeleton` y
  `CardSkeleton`; `PageSkeleton` pasa `bare` (un solo "Cargando…", cierra la duda de la 002a).

## Fase 5: ficha del paciente

Componentes nuevos en `pacientes/[id]/`: `patient-tabs.tsx` (`PATIENT_TABS`, `PatientTabValue`,
`PatientTabs`, `PatientTabLink`), `patient-header.tsx`, `evolution-types.ts` (`EvolutionRow` +
`recordedAtShortLabel` + constantes de medidas), `evolution-form.tsx`, `evolution-charts.tsx`,
`evolution-table.tsx`, `evolution-summary.tsx`, `formula-data-sheet.tsx`, `appointments-section.tsx`,
`loading.tsx`. Reescritos: `page.tsx`, `clinical-alert.tsx` (prop `compact`), `patient-form.tsx`,
`clinical-record-form.tsx`, `formula-data-form.tsx` (una columna), `formula-data-section.tsx`
(Card + `dl` de 8 filas + Sheet), `plans-section.tsx` (tabla + `ToggleGroup`), `diary-section.tsx`,
`evolution-section.tsx` (composición + `export type { EvolutionRow }`).

- **Formularios:** `Button loading={pending}`, `useActionToast(state, { success })` con los textos
  exactos de la tabla de §7, `<FormError message={state.error} />` debajo de la fila de botones.
  Cero "✓ Guardado"/`reveal`. Mismos `useActionState`, `name`, `hidden` y `action` (verificado
  por el diff de conjuntos de `name=` de §13.2, vacío).
- **`PatientTabs`:** pestaña activa desde `useSearchParams().get("tab")` (default `resumen`);
  cambiar usa `window.history.replaceState` (sin `?tab` para Resumen); `useEffect` sincroniza si
  cambia la URL desde afuera. Bloque sticky `top-14 lg:top-0 z-20 -mx-6 px-6 lg:-mx-10 lg:px-10
  bg-background` con `header` + `TabsList`. Los 6 `TabsContent` con `forceMount` y
  `data-[state=inactive]:hidden`. Contadores en `evolucion/planes/diario/turnos`, punto `bg-info`
  + `sr-only` en Diario si `diaryHasRecent`. `PatientTabLink` es `<button>` con estilo de enlace
  vía React context; hace scroll al inicio del bloque solo si el encabezado ya está pegado.
  **Detalle no previsto:** la `TabsList` va envuelta en un `div overflow-x-auto overflow-y-hidden`
  y lleva `w-max min-w-full` (en vez de `overflow-x-auto` directo en la lista) para que el
  subrayado del trigger activo no quede recortado y el borde inferior abarque todo el ancho
  scrolleable.
- **`page.tsx`:** el `Promise.all` y el `if (!patient) notFound()` son idénticos al HEAD (diff
  abajo). Calcula `ageYears`, `nextAppointment` (CONFIRMED o AWAITING_PAYMENT futuros; como
  `appts` viene ordenado desc, el próximo es `.at(-1)` del filtro, sin sort extra), `riskBackground`,
  `counts`, `diaryHasRecent`, `recordedAtShortLabel` con `formatInTimeZone(..., "dd/MM/yyyy")`.
  `statusMeta` con tonos `info/warning/success/neutral/danger`. Los precios/fechas de turnos se
  formatean en el server y se pasan planos a `AppointmentsSection` (server, primitivos `Table*`).
- **Resumen (D14):** `grid xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]` con `EvolutionSummary`
  (4 KPIs con `Quantity` + variación con `ArrowUp/ArrowDown/Minus` sin color bueno/malo; barras de
  peso de las últimas 8 mediciones, 180 px) y `FormulaDataSection`; debajo, `SectionLabel` "Turnos"
  + 4 `StatTile`. La fecha "Última medición" usa `recordedAtLabel` calculado en el server (evita
  desfase de hidratación por huso).
- **Datos para cálculos (D-b4):** avisos con `Alert tone="warning"` (mismos textos y condiciones),
  `dl` con Edad, Peso, Talla, Grasa, Contextura, Sexo, Actividad física (`"${label} (×factor)"`),
  Objetivo; "Editar" abre `Sheet` a la derecha (`w-full sm:max-w-md`) con `FormulaDataForm`. Las
  etiquetas de sexo/actividad/objetivo salen de `sexLabel`, `activityLevelOption` y
  `nutritionGoalLabel` de `@nutri-bot/core` (equivalentes a leer `SEX_OPTIONS`/`ACTIVITY_LEVELS`/
  `NUTRITION_GOALS`, ya exportadas).
- **Evolución:** `EvolutionForm` con `NumberInput unit` (etiquetas sin la unidad entre paréntesis,
  mismos `name/step/min/required/placeholder`), dos `Button ghost` con `ChevronDown`, `aria-expanded`
  y `aria-controls`; `EvolutionCharts` (Peso 220 px; Peso vs. grasa si `hasWeightAndFat`;
  Perímetros y Pliegues con `StudyComparisonChart` sobre los últimos 4 estudios; Bioimpedancia en
  tarjetas de 140 px por métrica con valor, unidad y decimales de §7.5.1); `EvolutionTable` con
  las 10 columnas de §7.5, `initialSort` fecha desc, `max-h-[28rem]`, el `<form
  action={deleteEvolutionEntryAction}>` idéntico y `Button ghost icon` + `Trash2` con
  `aria-label="Borrar la medición del dd/MM/yyyy"`. Prop interna `readOnly` (no es contrato) para
  ocultar la columna de acciones en la página de prueba.
- **Planes:** tabla (Título / Estado / Actualizado) + Card "Nuevo plan" con `ToggleGroup
  type="single" variant="outline"`; formularios en una columna, botón a lo ancho, `FormError`.
- **Diario:** Card con `EmptyState` o lista `grid sm:grid-cols-[12rem_minmax(0,1fr)]`, foto con
  `rounded-md border object-cover loading="lazy"`, mismo `src`/`alt`.
- **Turnos:** `AppointmentsSection` con `Table containerClassName="max-h-[28rem]"`, `caption`
  sr-only, precio `numeric`, `Badge` semántico, `EmptyState icon={CalendarX}`.

## Fase 6: detalle del plan

- `delete-plan-button.tsx` → `useConfirm` con título/descripción/`confirmLabel` exactos de §7.9;
  `grep -n "confirm("` solo muestra `!(await confirm({`. `deletePlanAction(planId, patientId)`
  idéntico.
- `plan-meta-form.tsx` (una columna, toast "Plan guardado"), `ai-plan-form.tsx` (`FormError`,
  `Button secondary loading`, ícono `Sparkles`), `plan-pdf-actions.tsx` (`FileDown`/`Send`,
  `notify.saved("PDF generado")`, `notify.info(...)` con el texto de hoy, "Último PDF: …" en
  `text-xs`, `FormError`). En `PlanPdfActions` la función `run` conserva `useTransition`, la
  llamada `action(planId)` y el chequeo `res.ok`; agrega un marcador `running` para que el
  spinner y el texto "Generando…"/"Enviando…" se muestren solo en el botón pulsado (los dos siguen
  deshabilitados mientras corre).
- `planes/[planId]/page.tsx`: `PageHeader` con `back` a `/pacientes/${id}?tab=planes`,
  `description` "Nombre · n años · x kg", franja de totales `sticky top-14 lg:top-0` con `dl` de 5
  celdas y `Quantity` (kcal decimals 0, g decimals 1), grilla `xl:grid-cols-[minmax(0,1fr)_22rem]`
  (izquierda: Armar con IA + `MealsEditor` con **exactamente las mismas props**; derecha: Datos
  del plan + Enviar al paciente). Bloque de consultas idéntico (diff abajo). `loading.tsx` nuevo.

## Fase 7: PDF (D12 + D13)

- Fuentes: `npm pack @fontsource/inter@5.3.0` en el scratchpad → `apps/web/public/fonts/`
  `inter-latin-{400,500,600}-normal.woff` (30,7 / 31,3 / 31,3 KB) + `Inter-OFL.txt` (SIL OFL 1.1).
  Sin dependencia nueva.
- `lib/pdf-theme.ts` nuevo: `DEFAULT_PDF_ACCENT = "#37352F"` (D-b2), `pdfColors`.
- `lib/plan-pdf.tsx` reescrito por dentro; `PlanPdfInput`, `PlanDocument` y `renderPlanPdf` con
  la **misma** firma (`git diff -U0 | grep -A12 "interface PlanPdfInput"` → sin cambios;
  `git diff planes/[planId]/actions.ts` → vacío). `Font.register` a nivel de módulo desde
  `process.cwd()/public/fonts` con fallback a Helvetica si falta algún archivo;
  `registerHyphenationCallback((w) => [w])`. Estructura de §7.11: logo 40×40 a la izquierda,
  título 18/600 en `pdfColors.text` (ya no en el acento), "Paciente: …", nombre de la
  nutricionista + "NutriBot" arriba a la derecha (se ven aunque haya pie personalizado), franja de
  2 pt en el acento, marca 3×12 por comida, filas con borde 0,5, caja de totales con borde
  izquierdo en el acento y la **misma** `macrosLine`, "Notas", pie `fixed` con `footerText` (mismo
  default de hoy) y `n / total`.
- **Bug de react-pdf 4.9 encontrado y esquivado (decisión no obvia):** con `lineHeight` en el
  estilo de `<Page>`, el `View fixed` del pie **no se dibuja** (ni el texto ni la numeración), aun
  poniéndole `lineHeight: 1` al pie. Verificado en el scratchpad con 6 variantes mínimas. Por eso
  `lineHeight: 1.45` va en un `View style={styles.content}` que envuelve todo menos el pie
  (comentado en el código).
- **Verificación real del render** (fixtures en memoria, sin base, script temporal dentro de
  `apps/web/.tmp-pdf-test/` borrado al terminar; PDFs en el scratchpad):
  - `pdffonts`: `Inter-Regular`, `Inter-Medium`, `Inter-SemiBold` **embebidas** (CID TrueType) en
    los 3 PDFs. Queda además una referencia a `Helvetica` (Type 1, no embebida, sin glifos): viene
    del `Text` vacío de cantidad cuando un ítem no tiene gramos (`item.quantityGrams ? … : ""`,
    comportamiento de hoy). Inocua; la anoto por si el orquestador la ve en "Fuentes" del visor.
  - `pdfinfo`: `Title` = título del plan, `Author` = nombre de la nutricionista.
  - Personalizado: pie "Consultorio · Av. Siempreviva 742 · Tel. …" y "1/2", "2/2" en **todas** las
    páginas. `--largo` (comidas ×4): 4 páginas, pie y "1/4 … 4/4" en las cuatro.
    `--sin` (acento/pie/logo `null`): pie "Generado el 24 sept 2026 · NutriBot", "1/2", "2/2".
  - `pdftotext`: "ñ", tildes, "·", "—", "¿" y "×" correctos; "Lic. María Gómez" y "NutriBot"
    arriba a la derecha; "Total del plan" y "Notas" presentes.
  - No hay logo en los fixtures (la base de desarrollo tampoco tiene): `Image` queda sin ver.

## Fase 8: limpieza de tokens viejos

Greps de §13.3 sobre los archivos de §10 (desde `apps/web`):

| # | Chequeo | Resultado |
|---|---|---|
| (1) | tokens/clases viejos (`ink/leaf/mint/paper/line/brand`, `font-display`, `uppercase`, `tracking-[`, `border-2`, `reveal`, `press`, `text-[Npx]`, `amber-N`, `red-N`, tonos viejos, "✓") | **0 líneas** |
| (2) | hex sueltos fuera de `chart-theme.ts`/`pdf-theme.ts`/`stroke='#ccc|#fff'` | **0 líneas** |
| (3) | `@mui`/`@emotion` en `src` y `package.json` | **0** |
| (4) | `recharts` 3.10.1 · `@mui/x-charts` | **3.10.1 · "OK sin MUI"** |
| (5) | `<>` en los tres gráficos | **0** |
| (6) | `confirm(` nativo restante | exactamente 2: `avisos/broadcast-form.tsx` (002c) y `plantillas/[id]/delete-template-button.tsx` (002d) |
| (7) | `console.`/`TODO`/`FIXME` | **0** |
| (8) | fuentes en `public/fonts` | 3 `.woff` + `Inter-OFL.txt` |

## Fase 9: páginas temporales (las borra el orquestador después del recorrido)

1. `apps/web/src/app/(panel)/prueba-002b/page.tsx` + `prueba-002b-client.tsx`: 30 pacientes
   ficticios (tildes, 3 sin nombre, `upcoming` 0–3) en `PatientsList`; `EvolutionCharts` con 6
   mediciones completas (perímetros, pliegues, bioimpedancia); `EvolutionTable` con `readOnly`
   (sin columna Borrar) y aviso "No tocar Borrar: página de prueba"; `Field` con hint +
   `NumberInput unit="kg" aria-describedby="prueba-hint"` y `<p id="prueba-hint">`.
2. `apps/web/src/app/(panel)/prueba-error/page.tsx`: `throw new Error("prueba")`.
3. `apps/web/src/app/(panel)/prueba-pdf/route.ts` (`force-dynamic`): `GET ?planId=<id>
   [&sinPersonalizacion=1][&largo=1]`; lee con `getPlan`, `prisma.patient.findUniqueOrThrow`,
   `getProfessional()` y el logo (`select: { logoData, logoMimeType }`) como `buildAndSavePdf`,
   **sin** `savePlanPdf` ni `revalidatePath`; 404 si no hay plan. Solo lectura.

Borrado sugerido (§13.5.12):
`rm -r "apps/web/src/app/(panel)/prueba-002b" "apps/web/src/app/(panel)/prueba-error" "apps/web/src/app/(panel)/prueba-pdf"`.

---

## Archivos tocados

**Modificados (21 + lockfile)**

- `apps/web/package.json` (+`recharts`; −`@mui/material`, −`@mui/system`, −`@mui/x-charts`,
  −`@emotion/react`, −`@emotion/styled`), `package-lock.json` (raíz).
- `apps/web/src/components/evolution-chart.tsx`, `comparative-chart.tsx`, `skeletons.tsx`.
- `apps/web/src/lib/chart-theme.ts`, `plan-pdf.tsx`.
- `apps/web/src/app/(panel)/pacientes/patients-list.tsx`.
- `apps/web/src/app/(panel)/pacientes/[id]/page.tsx`, `clinical-alert.tsx`, `clinical-record-form.tsx`,
  `diary-section.tsx`, `evolution-section.tsx`, `formula-data-form.tsx`, `formula-data-section.tsx`,
  `patient-form.tsx`, `plans-section.tsx`.
- `apps/web/src/app/(panel)/pacientes/[id]/planes/[planId]/page.tsx`, `plan-meta-form.tsx`,
  `delete-plan-button.tsx`, `ai-plan-form.tsx`, `plan-pdf-actions.tsx`.

**Creados**

- `apps/web/src/components/primitives/chart.tsx`, `apps/web/src/components/study-comparison-chart.tsx`.
- `apps/web/src/lib/evolution-series.ts`, `apps/web/src/lib/pdf-theme.ts`.
- `apps/web/src/app/(panel)/pacientes/[id]/patient-tabs.tsx`, `patient-header.tsx`, `evolution-types.ts`,
  `evolution-form.tsx`, `evolution-charts.tsx`, `evolution-table.tsx`, `evolution-summary.tsx`,
  `formula-data-sheet.tsx`, `appointments-section.tsx`.
- `apps/web/src/app/(panel)/pacientes/loading.tsx`, `pacientes/[id]/loading.tsx`,
  `pacientes/[id]/planes/[planId]/loading.tsx`.
- `apps/web/public/fonts/inter-latin-400-normal.woff`, `-500-`, `-600-`, `Inter-OFL.txt`.
- Temporales: `(panel)/prueba-002b/page.tsx`, `prueba-002b/prueba-002b-client.tsx`,
  `(panel)/prueba-error/page.tsx`, `(panel)/prueba-pdf/route.ts`.
- `progress/impl_HU-002b.md` (este archivo).

**No se tocaron** (verificado por `git diff --name-only`, vacío): `pacientes/page.tsx`,
`pacientes/actions.ts`, `[id]/clinical-actions.ts`, `[id]/planes/actions.ts`,
`planes/[planId]/actions.ts`, `planes/[planId]/ai-actions.ts`, `components/meals-editor.tsx`,
`components/ui.tsx`, `components/data-table.tsx`, `components/number-input.tsx`,
`components/confirm.tsx`, `lib/notify.ts`, `tailwind.config.ts`, `globals.css`, `(portal)/**`,
`api/**`, `middleware.ts`, `packages/**`, `apps/bot/**`.

---

## Contrato compartido (§6.2): firmas coinciden

- `packages/db/domain` y `packages/core`: sin cambios (`git diff --stat -- packages apps/bot` vacío).
- `chart.tsx`: exports iguales a shadcn.
- `chart-theme.ts`: `chartSeriesColors`, `chartDefaultColor` sin cambios; `chartStudyColors`,
  `studyColor`, `chartMetricColors` con los valores exactos; `chartSx`/`chartMargin` borrados.
- `evolution-series.ts`: `SeriesPoint`, `seriesPoints`, `latestWithDelta`, `lastStudies(max=4)`,
  `formatDelta(delta, unit, decimals=1)`.
- `EvolutionChart`: `points, seriesLabel, color?, height?=160, unit?, decimals?=1, showValues?`.
- `ComparativeChart`/`ComparativeSeries`: sin cambios. `StudyComparisonChart`: `title, measures,
  studies, unit, height?=240, decimals?=1` (el tipo del estudio se exporta además como
  `StudyComparisonStudy`, solo como comodidad).
- `PATIENT_TABS`, `PatientTabValue`, `PatientTabs({ header, panels, counts, diaryHasRecent })`,
  `PatientTabLink({ tab, children, className? })`, `PatientHeader({ name, phone, ageYears,
  nextAppointment, riskBackground })`, `EvolutionRow` (+`recordedAtShortLabel`),
  `EvolutionForm({ patientId })`, `EvolutionCharts({ entries })`, `EvolutionTable({ patientId,
  entries })` (+ `readOnly?` interna), `EvolutionSummary({ entries })`, `EvolutionSection({
  patientId, entries })`, `FormulaDataSheet({ children })`, `ClinicalAlert({ background, compact? })`.
- `TableSkeleton({ rows?, columns?, bare? })`, `CardSkeleton({ lines?, bare? })`.
- `DEFAULT_PDF_ACCENT`, `pdfColors`; `PlanPdfInput`/`PlanDocument`/`renderPlanPdf` idénticos.

---

## Verificación (§13.1–§13.3)

```
npm run typecheck --workspace apps/web   → verde
npm run typecheck                        → verde en core, db, bot y web
npm run test                             → 7 archivos, 49 tests, todos pasan
./ops/harness/verify.sh                  → "Arnés OK." (exit 0)
next build                               → NO se corrió (next dev pid 86416 activo, regla 2)
```

§13.2:

- `git diff --stat -- packages apps/bot` → vacío.
- `git diff --name-only` sobre los archivos intocables → vacío.
- Consultas del detalle del plan: diff **vacío**.
- Consultas de la ficha: diff con **una sola línea que no es consulta**: `isRecent: Date.now() -
  e.createdAt.getTime() < …` (el regex la agarra por `getTime(`), idéntica salvo la indentación
  (antes estaba dentro del JSX). Las líneas `prisma.*`, `list*`, `get*(`, `include:`, `orderBy`,
  `where:` y `notFound` son idénticas.
- Conjunto de `name="…"` de los formularios de evolución (HEAD vs. `evolution-*.tsx`): diff vacío.

---

## Skills aplicados y dónde manda la SDD

- **`ui-styling`** (antes de `chart.tsx` y las tablas): guía genérica; propone `npx shadcn init`
  y Tailwind 4 (`@import "tailwindcss"`). Mandó la SDD: adaptación manual del `chart.tsx` v4 a
  Tailwind 3.4, sin CLI ni cambios de configuración.
- **`ui-ux-pro-max`** (antes del encabezado, pestañas, gráficos y detalle del plan): consultas
  `chart`, `ux`. Coincide con la SDD en barras agrupadas para comparar estudios, leyenda + tooltip
  + tabla como alternativa textual, URL que refleja la pestaña (`?tab=`) y sticky que no tape el
  contenido (`top-14` bajo la topbar). **Contradicción:** para series temporales recomienda línea;
  mandó la SDD (D14 bis: barras, decisión del usuario).
- **`web-design-guidelines`** (autochequeo final sobre los archivos tocados, guías bajadas de
  `vercel-labs/web-interface-guidelines`):
  - Corregido durante el chequeo: fecha "Última medición" del Resumen pasa a la etiqueta calculada
    en el server (hidratación segura); `PatientTabLink` con `focus-visible:ring`; ícono-botón
    "Borrar" con `aria-label` completo; `min-w-0` + `truncate` en encabezado y alerta compacta;
    `loading="lazy"` en la foto del diario; `…` en "Cargando…"/"Guardando…"; espacio duro entre
    número y unidad (`Quantity`, tooltips, `formatDelta`); `Intl.*` para todo número y fecha.
  - **No corregido (anotado):** (a) `<img>` del diario sin `width`/`height` (dimensiones
    desconocidas; igual que hoy, acotada con `max-h-64`); (b) los ticks `dd/MM` de los ejes se
    formatean en el cliente con el huso del navegador (comportamiento que ya existía en el gráfico
    viejo); (c) inputs sin `autocomplete` (agregarlo no cambia el FormData, pero la SDD pide mover
    los formularios "tal cual"; lo dejo para quien decida); (d) `DataTable` no virtualiza listas
    largas (componente de la 002a, fuera de alcance); (e) la regla "Title Case" es para inglés:
    en español se sigue el caso oración de la HU.

## Decisiones no obvias (además de las ya anotadas arriba)

- **`ToggleGroup` single de Radix expone `role="radio"` + `aria-checked`**, no `aria-pressed`
  como dice §7.6. Es el comportamiento del primitivo; el activo se distingue por fondo
  (`data-[state=on]:bg-accent`), borde del grupo y peso de fuente, además del estado ARIA.
- `Card` "Diario alimentario" y `Card` "Historial de turnos" las renderizan `DiarySection` y
  `AppointmentsSection` (antes la envolvía `page.tsx`), para que la página quede como composición
  de paneles.
- `evolution-types.ts` concentra también las listas de medidas (`PERIMETER_MEASURES`,
  `SKINFOLD_MEASURES`, `BIOIMPEDANCE_METRICS` con unidad/decimales de §7.5.1) que comparten
  `evolution-charts.tsx` y la página de prueba.
- "Últimos {n} estudios" pasa a "Último estudio" cuando n = 1 (concordancia).

## Servidor de desarrollo (aviso para el orquestador)

- `tailwind.config.ts` **no se tocó**: no hace falta reiniciar por Tailwind.
- Sí hubo `npm install` (recharts) y `npm uninstall` (MUI/Emotion) con el `next dev` (pid 86416)
  levantado. No pude comprobar si el dev tira "Module not found" (no tengo navegador ni sesión):
  si al abrir `/pacientes/[id]` o `/portal/evolucion` aparece un error de módulo de `recharts`
  o de `@mui/*` cacheado, corresponde reiniciar el dev (regla 2: no lo reinicié yo).

## Lo que no se pudo verificar y por qué

- **Recorrido visual completo de §13.5** (1366×663 y 768×1024, teclado, reducción de movimiento,
  contraste, Sheet, `forceMount`, replaceState, esqueletos en "Slow 4G", `/prueba-error`,
  `/prueba-002b`, `/portal/evolucion` con token): es del orquestador con el navegador. Sin
  navegador ni sesión de Google no lo hice.
- **`/prueba-pdf?planId=…` en el navegador** (§13.4): la ruta queda lista; sin sesión no la abrí.
  Lo que sí verifiqué del PDF está en la Fase 7 (render real con fixtures: fuentes, páginas, pie,
  numeración, tildes, título/autor, variantes `largo` y `sinPersonalizacion`).
- **Paciente con `riskFlag`** para ver la alerta compacta: no consulté la base (solo lectura y
  sin necesidad); el orquestador lo confirma en el recorrido.
- **`next build`**: no se corre con el dev levantado (regla 2).

## Ronda de resolución 1

Alcance: los puntos 1 y 2 de `progress/review_HU-002b.md` más el JSDoc en `useConfirm` autorizado por
el orquestador. Nada más se tocó.

### Archivos tocados

- `apps/web/src/app/(panel)/pacientes/[id]/planes/[planId]/delete-plan-button.tsx` (reescrito).
- `apps/web/src/app/(panel)/pacientes/[id]/evolution-charts.tsx` (una línea, el `description`).
- `apps/web/src/components/confirm.tsx` (solo el JSDoc de `useConfirm`; sin cambios de comportamiento).

### 1. Deadlock de "Borrar plan" — desvío justificado de la SDD §7.9

El fragmento de §7.9 (`<form action={async () => { await confirm(...) ... }}>`) es el que tiene el
bug: en React 19 la form action corre dentro de una transición, `confirm()` hace `setPending` en ese
lane y React no lo confirma hasta que la promesa termina; la promesa espera al diálogo, que nunca se
monta. Resultado: no aparece el `alertdialog` y no se puede borrar un plan (regresión frente al
`confirm()` nativo de HEAD).

Implementación nueva (se aparta a propósito del fragmento de la SDD, ya marcado como incorrecto en
`Refactorizaciones/rediseno-ui-pacientes.md`):

- Sin `<form>`. Un `Button type="button"` con `onClick={handleClick}`.
- `handleClick` hace `await confirm({...})` **en el handler del evento**, fuera de cualquier
  transición. Mismo título ("¿Borrar este plan?"), misma descripción ("Se borran el plan y todas
  sus comidas. Esta acción no se puede deshacer."), mismo `confirmLabel` ("Borrar plan"),
  `destructive` por defecto.
- Solo si devuelve `true`: `startTransition(async () => { await deletePlanAction(planId, patientId); })`
  con `useTransition`. Misma action y mismos argumentos que HEAD; `actions.ts` no se tocó. El
  `redirect()` de la action lo maneja Next dentro de la transición, igual que en las otras actions
  disparadas desde cliente del repo (`plan-pdf-actions.tsx`).
- Estado de carga: `loading={pending}` en el `Button` de `components/ui.tsx`, que pone `disabled` y
  `aria-busy` y muestra el spinner; así no se dispara dos veces. Mientras corre, el ícono `Trash2`
  se reemplaza por el spinner y el texto pasa a "Borrando…" (mismo patrón de `plan-pdf-actions.tsx`
  y regla "loading states end with …" de las Web Interface Guidelines). En reposo el botón queda
  como pedía la SDD: `variant="ghost" size="sm"`, clases destructivas, `Trash2 aria-hidden`,
  "Borrar plan".

Verificación: `npm run typecheck --workspace apps/web` limpio. **No probé el borrado de punta a punta**
(sin navegador ni sesión, y la regla de no tocar planes reales); el recorrido §13.5.5 lo repite el
orquestador. Lo que sí garantiza el cambio es que `confirm()` ya no corre dentro de una transición,
que era la única causa del bloqueo según la review.

### 2. Subtítulo de "Peso vs. grasa corporal"

`evolution-charts.tsx:110`: `"Cada fecha con las dos medidas."` → `"Peso en kg a la izquierda, grasa en
% a la derecha."`. La condición `hasWeightAndFat` no cambió. El texto nuevo es cierto siempre (describe
los ejes del `ComparativeChart`), aunque las series tengan fechas sin las dos medidas.

### 3. JSDoc en `useConfirm` (fuera del radio de §10, autorizado por el orquestador)

Se agregó un JSDoc arriba de `export function useConfirm()` en `components/confirm.tsx` que dice que
**no** se puede `await confirm()` dentro de `<form action>` ni de `startTransition` (deadlock en
React 19), explica el mecanismo en tres líneas y da el patrón correcto en una línea:
`onClick={async () => { if (!(await confirm(...))) return; startTransition(() => action(...)); }}`
(o `onSubmit` con `preventDefault` incondicional y la action despachada después en
`startTransition`). Solo el comentario; el `ConfirmProvider` y `confirm()` no cambiaron.

### Autochequeo `web-design-guidelines` (botón y diálogo)

Guías bajadas de `vercel-labs/web-interface-guidelines` (con `curl`, no hay WebFetch en esta sesión).

- `delete-plan-button.tsx`: ✓ pass. Botón con texto visible + ícono `aria-hidden` (nombre accesible
  "Borrar plan" / "Borrando…"); `type="button"`; `focus-visible:ring-2` y `hover:` heredados de
  `buttonVariants`; habilitado hasta que arranca la request y `disabled` + `aria-busy` + spinner
  mientras corre; acción destructiva detrás de un modal de confirmación.
- `confirm.tsx`: ✓ pass en lo que pide la ronda. Foco inicial en "Cancelar" vía `onOpenAutoFocus`
  (no es `autoFocus` en un input; es la opción segura para una acción destructiva); Radix
  `AlertDialog` aporta `role="alertdialog"`, `aria-labelledby`/`aria-describedby`, focus trap y
  Escape; los dos botones tienen texto. Observación no aplicada (fuera del alcance de esta ronda y
  del radio de §10): el `AlertDialogContent` primitivo de la 002a no declara
  `overscroll-behavior: contain`; irrelevante para este diálogo de dos líneas, lo dejo anotado.
- Regla "Title Case" de la guía: es para inglés; en español se mantiene el caso oración de la HU
  (ya anotado en la ronda anterior).

No hizo falta invocar `ui-ux-pro-max` ni `ui-styling`: el estado de carga reutiliza el `loading` del
`Button` existente sin cambios de diseño.

### Verificación

- `npm run typecheck --workspace apps/web`: limpio (exit 0).
- `./ops/harness/verify.sh`: "Arnés OK" (backlog válido, 1 HU activa; `apps/web` typecheck limpio).
- No se corrió `npm run test` (no se tocó `packages/core`), ni `next dev`/`next build`, ni nada de
  WhatsApp. No se escribió en la base. No quedaron scripts de prueba. Las páginas `prueba-*` siguen
  intactas. `backlog.json` sin tocar. Sin commit.

### Contrato compartido

Sin cambios de firmas: `DeletePlanButton({ planId, patientId })` y `deletePlanAction(planId, patientId)`
son las mismas de la SDD §6.2 y de HEAD; `useConfirm(): (options: ConfirmOptions) => Promise<boolean>`
idéntica.
