# SDD — HU-002b `rediseno-ui-pacientes` (Rediseño UI 2/4: pacientes)

HU validada: `docs/hu-rediseno-ui-empresarial.md`. **Manda su sección final "Resoluciones"**
(D1–D18). Esta SDD cubre **solo la fila HU-002b** de la partición: lista de pacientes, ficha
(encabezado persistente + pestañas), detalle del plan, evolución y gráficos, diario, la tarjeta
"Datos para cálculos" (HU-001) y el PDF del plan (D12).

Base: la HU-002a (aprobada y commiteada en esta rama). Su contrato de UI está en
`Refactorizaciones/rediseno-ui-fundaciones.md` §6.2 y §8.5, y lo que queda para esta HU en §10.
Todo lo de acá se leyó contra el **código real** de `apps/web/src/components/` y `primitives/`,
no solo contra esa SDD.

Skills aplicados: **`refactor`** (Diagnóstico §3, Radio de impacto §10, Checklist de ejecución
§11, sin romper el sistema en el medio) y **`ui`** (vistas con nombre, estructura base y
componentes clave: §7).

---

## 1. Resumen funcional

La ficha del paciente deja de ser una columna de 7 tarjetas apiladas y pasa a tener un
**encabezado persistente** (nombre, edad, teléfono con acceso a WhatsApp, próximo turno y alerta
clínica) y **seis pestañas**: *Resumen*, *Datos y ficha clínica*, *Evolución*, *Planes*,
*Diario* y *Turnos*. La pestaña es parte de la URL (`?tab=`). *Resumen* abre con lo que la
nutricionista mira primero (D14): la evolución (últimos valores con su variación y el gráfico
de peso) y los **datos para cálculos** (HU-001). Los gráficos de evolución pasan a **barras**
(D14 bis) con **Recharts 3**, que reemplaza a MUI X Charts. Con eso salen del proyecto
`@mui/*` y `@emotion/*`. Hay un gráfico por serie: peso y bioimpedancia en el tiempo, y
perímetros y pliegues comparados entre estudios. La lista de pacientes y las mediciones pasan a
tabla. El detalle del plan se reordena con una franja de totales fija y una columna lateral. El
feedback de guardado pasa a toast y el borrado del plan pide confirmación con `useConfirm`. El
**PDF del plan** adopta Inter y el estilo sobrio nuevo, y respeta el logo, el color de acento y
el pie de `/ajustes`. Muestra "NutriBot" y el nombre de la nutricionista. **No cambia ninguna
funcionalidad**: mismas server actions, mismas consultas, mismos datos.

---

## 2. Workspaces afectados

| Workspace | ¿Se toca? | Qué |
|---|---|---|
| `apps/web` | **Sí** | Pantallas de pacientes, componentes de gráficos, `plan-pdf.tsx`, dependencias (entra `recharts`; salen `@mui/*` y `@emotion/*`), 3 fuentes en `public/fonts/` |
| `apps/bot` | **No** | Nada. Ningún mensaje cambia |
| `packages/core` | **No** | Solo se **importan** funciones existentes (`computeBmi`, `computeWaistHipRatio`, `computeAgeYears`, `SEX_OPTIONS`, `ACTIVITY_LEVELS`, `NUTRITION_GOALS`, `bodyFrameLabel`, etc.) |
| `packages/db` | **No** | Ni `schema.prisma`, ni migraciones, ni `domain/` |

### 2.1 Restricciones duras para el implementer (copiarlas tal cual en `progress/impl_HU-002b.md`)

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

---

## 3. Diagnóstico (skill `refactor`)

Analizado en solo lectura sobre el estado actual de la rama (commit `2487643`).

**Ficha del paciente (`pacientes/[id]/page.tsx`, 235 líneas)**

- Apila 7 tarjetas en una columna: Datos → Datos para cálculos → Ficha clínica → Evolución →
  Diario → Planes → Historial de turnos. Lo que la nutricionista mira primero (evolución y datos
  para cálculos, D14) queda en la 2.ª y la 4.ª tarjeta. Para llegar a *Planes* hay que pasar por
  los gráficos y el diario, y no cumple "llega en un clic".
- El encabezado tiene nombre y teléfono, pero no la edad ni el próximo turno. La alerta clínica
  es una tarjeta aparte que desaparece al scrollear, y ningún encabezado queda persistente.
- Restos del sistema viejo: `font-display text-3xl font-bold`, botón de WhatsApp con `border-2`
  y `press`, "← Volver" hecho a mano, `text-ink*`, `divide-line`, badges con alias viejos
  (`blue`, `amber`, `slate`).
- El historial de turnos es una `ul` con la fecha, el servicio, el precio y el estado en una sola
  línea. No es una tabla y los precios no van alineados.

**Secciones**

- `formula-data-section.tsx`: los avisos usan `bg-amber-50 text-amber-700` a mano (fuera de
  tokens), la lista "Lo que van a usar las fórmulas" es texto corrido con `·`, y el formulario va
  arriba del resumen, así que el dato que se mira queda debajo del que se edita.
- `evolution-section.tsx` (304 líneas, un solo componente): mezcla el formulario de carga, los 4
  gráficos de **línea**, la comparativa y la lista de mediciones. Los colores de serie están en hex
  sueltos (`#3c7a24`, `#2563eb`, `#d97706`, `#7c3aed`) que no vienen de `chart-theme.ts`. Las
  etiquetas van en `uppercase tracking-[0.08em]`. Los perímetros de brazo, muslo y pantorrilla,
  los tres pliegues, el agua, la grasa visceral, la masa ósea y el metabolismo basal no tienen
  gráfico: solo aparecen dentro de un texto corrido de hasta 17 valores por medición. El "Borrar"
  de cada medición es texto `text-xs` sin nombre accesible que diga **qué** borra.
- `clinical-alert.tsx`: `border-2 border-amber-400`, emoji ⚠️ como ícono, mayúsculas.
- `clinical-record-form.tsx`, `patient-form.tsx`, `formula-data-form.tsx`: el feedback es
  "✓ Guardado" inline con `reveal` y `text-leaf-deep`, y el error va en `text-red-600`, repetido en
  cada archivo (lo que la 002a §10 pide cambiar por `useActionToast` + `FormError`).
- `plans-section.tsx`: el selector "Plan nuevo · Desde plantilla" son dos `button` en mayúsculas
  que se distinguen **solo por color** (falla el principio 6), y la lista de planes es una `ul`
  con `hover:bg-mint`.
- `diary-section.tsx`: fecha en mayúsculas espaciadas y foto con `rounded` sin borde.

**Lista de pacientes (`patients-list.tsx`)**

- Es una `ul` de enlaces, no una tabla (reordenamiento 2), y no se puede ordenar. El buscador
  lleva `focus:border-leaf focus:ring-leaf/15` y un SVG inline; el estado vacío es una caja
  `border-dashed` hecha a mano.

**Detalle del plan (`planes/[planId]/page.tsx`)**

- 5 tarjetas de totales con `text-[10px] uppercase tracking-[0.14em]` y `font-display`, sin
  unidad en kcal. Los totales quedan arriba del editor y se pierden al scrollear mientras se
  cargan alimentos, que es justo cuando cambian.
- `delete-plan-button.tsx` usa `confirm()` nativo (Gherkin "Confirmación de una acción
  destructiva").
- `plan-pdf-actions.tsx`: "✓ PDF generado" inline con `text-leaf-deep`.

**Gráficos (`evolution-chart.tsx`, `comparative-chart.tsx`, `lib/chart-theme.ts`)**

- Son de **línea**, con MUI X Charts `LineChart`. `chart-theme.ts` importa tipos de
  `@mui/material/styles`. MUI X Charts 9.13 **no trae locale en español** (`locales/` tiene
  `enUS`, `frFR`, etc., pero no `es*`). El tooltip es un `Paper` de MUI con la tipografía del tema
  MUI por defecto (Roboto/Helvetica), no Inter. Para que siga los tokens hay que reescribirlo con
  `slots`.
- `@mui/material`, `@mui/system`, `@mui/x-charts`, `@emotion/react` y `@emotion/styled` están en
  `apps/web/package.json` **solo** por estos tres archivos (verificado con grep: no hay otros
  consumidores en `apps/web`, `apps/bot` ni `packages/`).
- `EvolutionChart` también lo usa `portal/evolucion/page.tsx` (002d) con
  `{ points, seriesLabel: "Peso (kg)", height: 220 }`.

**PDF (`lib/plan-pdf.tsx`)**

- Helvetica (la default de react-pdf) con colores en hex sueltos (`#1a1a1a`, `#555`, `#777`,
  `#999`). El título va **en el color de acento**: un acento claro elegido en `/ajustes` baja el
  contraste del texto más importante. El pie está `position: absolute` **sin `fixed`**, así que
  en un plan de varias páginas aparece solo en la primera. No hay separación de sílabas
  controlada: react-pdf corta palabras en español con reglas de inglés. "NutriBot" solo aparece si
  no hay pie personalizado (la base de desarrollo tiene uno).

**Estados**

- `pacientes/`, `pacientes/[id]` y `planes/[planId]` usan el `loading.tsx` genérico del panel
  (`PageSkeleton`), que no tiene la forma de la tabla ni de la ficha.
- `PageSkeleton` anida dos `CardSkeleton`, y cada uno trae su `role="status"` + "Cargando…"
  (duda abierta del review de la 002a).

**Conclusión:** la lógica ya está bien separada (server actions + `useActionState`). El trabajo es
de **presentación y composición**: partir `page.tsx` y `evolution-section.tsx` en piezas con una
responsabilidad cada una, reemplazar la librería de gráficos detrás de la **misma API** de
`EvolutionChart`/`ComparativeChart` (así el portal no se toca) y cambiar el feedback al del
sistema.

---

## 4. Decisión técnica: gráficos de barras con Recharts 3 (D14 bis, O1 de la 002a)

### 4.1 Comparación verificada (2026-09-24, versiones reales, no de memoria)

| | MUI X Charts `BarChart` | Recharts |
|---|---|---|
| Versión | 9.13.0 (instalada) | 3.10.1 (`npm view recharts version`) |
| Peers | `react ^17‖^18‖^19`, **`@mui/material` y `@mui/system` `^7.3‖^9`, `@emotion/react`, `@emotion/styled`** | `react`, `react-dom`, `react-is` `^16.8‖…‖^19` |
| Peso en el bundle cliente* | BarChart + LineChart: **~95 KB gz** (incluye las partes de `@mui/material` y Emotion que arrastra) | BarChart, Bar, ejes, grilla, Tooltip, Legend, LabelList: **~56 KB gz** |
| Barras agrupadas y comparativas | Sí (`series[]` sobre un eje `band`) | Sí (varios `<Bar>` sobre el mismo eje; `radius`, `barCategoryGap`, `barGap`, `LabelList` para el valor encima) |
| Doble eje Y | Sí | Sí (`yAxisId`) |
| Tooltip | `Paper` de MUI con la tipografía del tema MUI (sin `ThemeProvider` es Roboto/Helvetica); para usar tokens hay que escribir un `slots.tooltip` con hooks internos | `content={<Componente />}` que es **React + Tailwind común**: se escribe con los tokens (`bg-background`, `text-muted-foreground`, `tabular-nums`) y toma el tono cálido del portal solo |
| Ejes con unidades | `valueFormatter` + `label` | `tickFormatter` + `label` / `unit` |
| Accesibilidad | Navegación con teclado en barras (`keyboardFocusHandler`) | `accessibilityLayer` **activo por defecto** (flechas recorren los puntos y muestran el tooltip), `title`/`desc` en el SVG |
| Movimiento reducido | Hay que pasar `skipAnimation` a mano | `isAnimationActive: "auto"` (default en 3.x): **respeta `prefers-reduced-motion`** y no anima en SSR |
| Textos propios | En inglés ("No data to display"…) y sin locale `es` | Ninguno |
| Colores | Hex (el SVG de MUI los necesita resueltos, 002a §7.1) | Hex o `var(--…)` |
| Patrón shadcn | No | Es la base del "Chart" de shadcn. El registry **new-york-v4** trae un `chart.tsx` ya escrito para **Recharts 3** (`recharts@3.8.0`, usa `TooltipContentProps`), con solo 2 clases de Tailwind 4 que se adaptan. El del registry v3 (`new-york`) es para `recharts@2.15.4` y **no** se usa |
| Cuánto cambia | 0 dependencias nuevas; se reescriben 2 componentes y el tooltip | +1 dependencia (`recharts`), −5 (`@mui/material`, `@mui/system`, `@mui/x-charts`, `@emotion/react`, `@emotion/styled`); se reescriben 2 componentes, se suma 1 y el primitivo `chart.tsx` |

\* Medido con `esbuild --bundle --minify` sobre entradas mínimas (`import { BarChart, LineChart }
from "@mui/x-charts/…"` y los componentes de Recharts que usa esta SDD), restando React y
ReactDOM (~60 KB gz, iguales en los dos). Es una aproximación: Next además aplica
`optimizePackageImports` a `recharts` por defecto.

**Riesgo verificado de Recharts: `react-is`.** Recharts pide `react-is` como peer. En este
monorepo la raíz tiene `react-is@16.13.1` (lo traen `prop-types` de `@react-pdf/renderer` y
Emotion), y una simulación con la misma forma de workspaces confirmó que **Recharts va a
resolver esa 16**, aunque `apps/web` declare `react-is@19` (un `overrides` tampoco lo cambia con
el lockfile existente). Recharts 3.10.1 usa `react-is` en **un solo lugar**
(`lib/util/ReactUtils.js`, `isFragment` dentro de `toArray`): con la 16, un `<>…</>` **como hijo
directo** de un chart no se aplana, y los arrays (`series.map(...)`) funcionan igual. **Regla:**
en los componentes de gráficos no se usa Fragment como hijo directo de `BarChart`/`ComposedChart`;
las series se generan con `.map()` y `key`. No se instala `react-is` ni se agregan `overrides`.

### 4.2 Recomendación: **Recharts 3.10.1**

Argumentos concretos:

1. **Tooltip del sistema sin pelear con otro sistema de diseño.** Es el elemento que más se ve
   en un gráfico de consulta ("¿cuánto pesaba en junio?"). Con Recharts es un componente nuestro
   con Inter, tokens, `tabular-nums` y unidad. En MUI es un `Paper` con tipografía MUI, salvo que
   se reescriba con sus hooks internos.
2. **Accesibilidad y movimiento reducido por defecto** (`accessibilityLayer` y
   `isAnimationActive: "auto"`), que son dos escenarios del Gherkin. En MUI hay que cablear los dos.
3. **~40 % menos de JavaScript en el cliente** (~56 vs ~95 KB gz), y además sale Emotion (runtime
   de CSS-in-JS) de la app. Con el reemplazo detrás de la misma API, **el último consumidor de MUI
   desaparece en esta HU** (el portal usa `EvolutionChart` sin cambios), así que se desinstalan
   `@mui/*` + `@emotion/*` acá, no en la 002d.
4. **Es el patrón de shadcn** (D7): el `chart.tsx` v4 ya tipado para Recharts 3 se adapta con dos
   reemplazos de clases. Las pantallas de la Ronda 2 (plan contra objetivo, SARA 2) van a
   encontrar `ChartContainer` + `ChartTooltipContent` en `primitives/`.
5. **Colores con tokens**: los ejes y la grilla se pintan con clases (`fill-muted-foreground`,
   `stroke-border`), así el tono cálido del portal los alcanza sin hacer nada.

Costo aceptado: una dependencia nueva y la regla del Fragment (§4.1). Si en el recorrido las
barras no convencen, la vuelta atrás es acotada: los consumidores no cambian de API.

### 4.3 Qué gráfico para cada serie

Principio: **barras con base en cero** (una barra recortada exagera un cambio de 1 kg sobre 70).
La variación se lee en el **número** (último valor y diferencia contra el anterior, arriba del
gráfico, y la etiqueta con el valor encima de cada barra), no en la altura relativa.

| Serie | Qué pregunta responde | Tipo | Detalle |
|---|---|---|---|
| **Peso** (kg) | ¿Cómo viene el peso consulta a consulta? | **Barras en el tiempo** (una barra por medición, eje X = fecha `dd/MM`) | Color `chartSeriesColors[0]`. Valor encima de cada barra si hay ≤ 8. Última barra con opacidad 1 y las anteriores con 0,85, para que la actual se note sin depender de otro color |
| **Perímetros**: cintura, cadera, brazo, muslo, pantorrilla (cm) | ¿Qué cambió entre este estudio y los anteriores? | **Barras agrupadas por medida**, una barra por estudio (últimos **4** estudios con algún perímetro), de más viejo a más nuevo | Colores de `chartStudyColors`: grises de más claro a más oscuro para los anteriores y azul para el último. Todos ≥ 3:1 sobre blanco. Leyenda con la fecha de cada estudio. El tooltip de un grupo muestra los 4 valores con unidad |
| **Pliegues**: tricipital, subescapular, abdominal (mm) | Igual que perímetros | **Barras agrupadas por medida** (mismo componente) | Igual |
| **Bioimpedancia**: grasa (%), masa muscular (kg), agua (%), grasa visceral (nivel), masa ósea (kg), metabolismo basal (kcal) | ¿Cómo evoluciona cada componente? | **Barras chicas en el tiempo, una por métrica** (small multiples) | Unidades distintas: no se mezclan en un eje. Solo se dibujan las métricas con al menos un valor |
| **Peso vs. grasa corporal** (hoy `ComparativeChart`) | ¿Baja el peso a costa de grasa o de músculo? | **Barras agrupadas por fecha con doble eje Y** (izquierda kg, derecha %) | Mismos datos que hoy. Leyenda y tooltip con las dos unidades, y cada eje con su unidad en los ticks |

"Estudio" = una fila de `EvolutionEntry` (una medición). La comparación entre estudios la
resuelven los gráficos agrupados de perímetros y pliegues (arriba) y la tabla de mediciones con
todas las columnas (§7.5).

---

## 5. Esquema

**No cambia.** Sin migración. No hay consultas nuevas: el próximo turno y los contadores salen de
`patient.appointments`, que la página ya trae (`include: { service: true }`,
`orderBy: { startsAt: "desc" }`).

---

## 6. Contrato compartido

### 6.1 `packages/db/domain` y `packages/core`

**Sin cambios.** No hay funciones nuevas ni modificadas. Consumidores: ninguno nuevo.

### 6.2 Contrato de UI de `apps/web` (lo que agrega o cambia esta HU)

Las firmas de 002a §6.2 **no se rompen**, con una excepción explícita: `chartSx` y `chartMargin`
(eran solo para MUI y se quedan sin consumidores).

#### Dependencias

- **Entra:** `recharts@^3.10.1` (`dependencies` de `apps/web`).
- **Salen:** `@mui/material`, `@mui/system`, `@mui/x-charts`, `@emotion/react`,
  `@emotion/styled`, recién cuando `grep` confirme 0 usos (checklist 3.1).

#### `src/components/primitives/chart.tsx` (nuevo, `"use client"`)

Origen: `https://ui.shadcn.com/r/styles/new-york-v4/chart.json` (`files[0].content`, para
Recharts 3). Exports **iguales** a shadcn: `ChartContainer`, `ChartTooltip`,
`ChartTooltipContent`, `ChartLegend`, `ChartLegendContent`, `ChartStyle`, `type ChartConfig`.
Adaptaciones (y ninguna otra):

- `import { cn } from "cn"` → `import { cn } from "@/lib/utils"`.
- Tailwind 4 → 3: `outline-hidden` → `outline-none` en las tres apariciones, **salvo** la de
  `[&_.recharts-surface]`, que se **borra**: la superficie recibe el foco del `accessibilityLayer`
  y tiene que mostrar el anillo de `globals.css` (`:focus-visible`).
- `ChartTooltipContent`: `font-mono font-medium text-foreground tabular-nums` →
  `font-medium text-foreground tabular-nums` (sin mono, Inter con cifras tabulares).
- `ChartContainer` conserva `initialDimension`. El `aspect-video` default se pisa en cada uso con
  `className="aspect-auto h-[<alto>px] w-full"`.
- Las clases con `[stroke='#ccc']`/`[stroke='#fff']` son selectores de atributo que genera
  Recharts, no colores nuestros. Quedan tal cual y es la única excepción al grep de hex (§13.3).

#### `src/lib/chart-theme.ts` (reescrito, sin MUI)

```ts
// Único lugar donde viven los colores de serie (hex: van como atributo SVG). Todos ≥ 3:1 sobre blanco.
export const chartSeriesColors: readonly ["#2C6890", "#396F51", "#B37D19", "#7959A6", "#B53A36"]; // sin cambios
export const chartDefaultColor: "#2C6890";                                                      // sin cambios
/** Estudios comparados, de más viejo a más nuevo; el último siempre es chartDefaultColor. */
export const chartStudyColors: readonly ["#8C8B87", "#65635D", "#37352F"];                       // NUEVO (3,41 / 5,98 / 12,25 : 1)
export function studyColor(index: number, total: number): string;                                // NUEVO
//   index === total - 1 → chartDefaultColor; si no, chartStudyColors[chartStudyColors.length - (total - 1) + index]
//   (con 2 estudios: ["#37352F", azul]; con 4: ["#8C8B87", "#65635D", "#37352F", azul]).
export const chartMetricColors: {                                                                 // NUEVO
  weightKg: "#2C6890"; bodyFatPercent: "#B37D19"; muscleMassKg: "#396F51";
  bodyWaterPercent: "#7959A6"; visceralFatLevel: "#B53A36"; boneMassKg: "#65635D"; basalMetabolicRateKcal: "#37352F";
};
// SE BORRAN: chartSx, chartMargin (y el import de @mui/material/styles).
```

#### `src/lib/evolution-series.ts` (nuevo, puro, sin `"use client"`)

Helpers de **forma de datos para gráficos** (no son reglas de dominio: solo filtran, ordenan y
restan dos números). Quedan en `apps/web` porque la HU no puede tocar `packages/` (ver §12).

```ts
export type SeriesPoint = { date: Date; value: number };

/** Puntos con valor de `pick`, ordenados por fecha ascendente (sin nulls). */
export function seriesPoints<T extends { recordedAtISO: string }>(
  entries: readonly T[], pick: (e: T) => number | null,
): SeriesPoint[];

/** Último punto y su diferencia con el anterior (null si hay uno solo). null si no hay puntos. */
export function latestWithDelta(points: readonly SeriesPoint[]):
  { value: number; date: Date; delta: number | null } | null;

/** Las últimas `max` entradas con al menos un valor no-null en `fields`, en orden ascendente. */
export function lastStudies<T extends { recordedAtISO: string }>(
  entries: readonly T[], fields: readonly (keyof T)[], max?: number /* default 4 */,
): T[];

/** "+0,8 kg" · "−1,2 kg" (U+2212) · "Sin cambios". es-AR, `decimals` default 1. */
export function formatDelta(delta: number, unit: string, decimals?: number): string;
```

#### `src/components/evolution-chart.tsx` (reescrito sobre Recharts, API conservada + opcionales)

```ts
"use client";
export interface EvolutionPoint { date: Date; value: number }        // sin cambios
export function EvolutionChart(props: {
  points: EvolutionPoint[];     // existente (se ordena adentro, como hoy)
  seriesLabel: string;          // existente: nombre de la serie en tooltip, <title> del SVG y leyenda accesible
  color?: string;               // existente, default chartDefaultColor
  height?: number;              // existente, default 160
  unit?: string;                // NUEVO: unidad en ticks del eje Y y tooltip ("kg"); sin unit → solo el número
  decimals?: number;            // NUEVO: default 1
  showValues?: boolean;         // NUEVO: valor encima de cada barra; default points.length <= 8
}): JSX.Element;
```

- `ChartContainer config={{ value: { label: seriesLabel, color } }} className="aspect-auto w-full"
  style={{ height }}` con `BarChart data={rows} margin={{ top: 20, right: 8, bottom: 0, left: 0 }}
  accessibilityLayer title={seriesLabel}`.
- `rows = sorted.map((p, i) => ({ label: fmtDay(p.date), full: fmtFull(p.date), value: p.value, isLast: i === sorted.length - 1 }))`.
  `fmtDay` = `Intl.DateTimeFormat("es-AR", { day: "2-digit", month: "2-digit" })`, igual que hoy.
  `fmtFull` = `{ day: "numeric", month: "short", year: "numeric" }`.
- `CartesianGrid vertical={false}`; `XAxis dataKey="label" tickLine={false} axisLine={false}
  tickMargin={8} minTickGap={8}`; `YAxis tickLine={false} axisLine={false} width={unit === "kcal" ? 64 : 48}
  tickFormatter={(v) => fmtNum(v) + (unit ? " " + unit : "")} domain={[0, "auto"]}`.
- `Bar dataKey="value" radius={[4, 4, 0, 0]} maxBarSize={48}` con celdas por fila
  (`rows.map(r => <Cell key fill={color} fillOpacity={r.isLast ? 1 : 0.85} />)`, como array).
  Con `showValues`: `LabelList dataKey="value" position="top" className="fill-foreground text-xs tabular-nums" formatter={fmtNum}`.
- `ChartTooltip cursor={{ className: "fill-muted" }} content={<ChartTooltipContent labelKey="full" formatter={…valor con unidad y espacio duro…} />}`.
- Sin `points`: `EmptyState`-like chico (`p className="text-sm text-muted-foreground"`) "Sin datos
  para graficar.". Con **1 punto** se dibuja (una barra es legible; hoy se exigían 2 para una línea).
- Consumidores: `pacientes/[id]` (Resumen, Evolución) y `portal/evolucion` (sin tocar, 002d:
  pasa `seriesLabel="Peso (kg)" height={220}` y sigue compilando).

#### `src/components/comparative-chart.tsx` (reescrito, API conservada)

```ts
"use client";
export interface ComparativeSeries { label: string; unit: string; color: string; points: { date: Date; value: number | null }[] } // sin cambios
export function ComparativeChart(props: { left: ComparativeSeries; right: ComparativeSeries; height?: number /* default 220 */ }): JSX.Element;
```

Misma unión de fechas que hoy (`Set` de `getTime()` de los puntos no-null, orden ascendente).
`BarChart` con `YAxis yAxisId="left"` (ticks `"<n> <left.unit>"`) y `YAxis yAxisId="right"
orientation="right"` (ticks `"<n> <right.unit>"`), `Bar yAxisId="left" dataKey="left"` y
`Bar yAxisId="right" dataKey="right"`, `radius={[4,4,0,0]}`, `barGap={2}`, `ChartLegend content={<ChartLegendContent />}`.
Las etiquetas de la leyenda son `"${label} (${unit})"`, como hoy. Un valor `null` deja el hueco
(no se inventa la barra).

#### `src/components/study-comparison-chart.tsx` (nuevo, `"use client"`)

```ts
export function StudyComparisonChart(props: {
  title: string;                                       // <title> del SVG, p. ej. "Perímetros"
  measures: { key: string; label: string }[];          // eje X (categorías), en este orden
  studies: { id: string; label: string; values: Record<string, number | null> }[]; // ascendente, máx. 4
  unit: string;                                        // "cm" | "mm"
  height?: number;                                     // default 240
  decimals?: number;                                   // default 1
}): JSX.Element;
```

`data = measures.map(m => ({ measure: m.label, ...Object.fromEntries(studies.map(s => [s.id, s.values[m.key]])) }))`.
Una medida sin ningún valor en los estudios elegidos **no** se muestra (se filtra antes). `config` = por estudio
`{ label: s.label, color: studyColor(i, studies.length) }`; `studies.map(s => <Bar key={s.id} dataKey={s.id} fill={`var(--color-${s.id})`} radius={[3,3,0,0]} maxBarSize={28} />)`
(array, no Fragment). Los ids de estudio son cuids (alfanuméricos), válidos para la variable CSS de `ChartStyle`.
`ChartLegend content={<ChartLegendContent />}` arriba (`verticalAlign="top"`). Tooltip por grupo con los N valores y la unidad.

#### Componentes de la ficha (nuevos, en `src/app/(panel)/pacientes/[id]/`)

```ts
// patient-tabs.tsx ("use client")
export const PATIENT_TABS: readonly [
  { value: "resumen"; label: "Resumen" },
  { value: "datos"; label: "Datos y ficha clínica" },
  { value: "evolucion"; label: "Evolución" },
  { value: "planes"; label: "Planes" },
  { value: "diario"; label: "Diario" },
  { value: "turnos"; label: "Turnos" },
];   // HU-003 suma { value: "consultas", label: "Consultas" } acá
export type PatientTabValue = (typeof PATIENT_TABS)[number]["value"];
export function PatientTabs(props: {
  header: ReactNode;                                       // <PatientHeader /> (server)
  panels: Record<PatientTabValue, ReactNode>;              // contenido server-rendered de cada pestaña
  counts: Partial<Record<PatientTabValue, number>>;        // evolucion, planes, diario, turnos
  diaryHasRecent: boolean;                                 // punto "nuevo" en Diario
}): JSX.Element;
// Pestaña activa = useSearchParams().get("tab") si es un PatientTabValue; si no, "resumen".
// Cambiar de pestaña: window.history.replaceState(null, "", url) con ?tab=<v> (sin ?tab para "resumen");
// Next 15 sincroniza useSearchParams con history.replaceState (sin ida al servidor ni scroll).
export function PatientTabLink(props: { tab: PatientTabValue; children: ReactNode; className?: string }): JSX.Element;
// <button type="button"> con estilo de enlace (text-sm font-medium text-link hover:underline) que hace
// el mismo replaceState y lleva el scroll al comienzo de las pestañas (tabsRef.scrollIntoView({ block: "start" })
// solo si el encabezado no está visible). Se usa dentro de los paneles (p. ej. "Ver evolución completa").
// Implementación: un React context propio dentro de PatientTabs expone setTab.

// patient-header.tsx (server)
export function PatientHeader(props: {
  name: string | null; phone: string; ageYears: number | null;
  nextAppointment: { label: string; serviceName: string; awaitingPayment: boolean } | null;
  riskBackground: string | null;          // clinicalRecord.riskFlag && background ? background : null
}): JSX.Element;

// evolution-types.ts: `export interface EvolutionRow { …los 19 campos actuales… ; recordedAtShortLabel: string }`
//   (NUEVO campo: "dd/MM/yyyy" calculado en el server con formatInTimeZone(e.recordedAt, pro.timezone, "dd/MM/yyyy")).
//   evolution-section.tsx hace `export type { EvolutionRow } from "./evolution-types"`.
// evolution-form.tsx ("use client"):    export function EvolutionForm({ patientId }: { patientId: string })
// evolution-charts.tsx ("use client"):  export function EvolutionCharts({ entries }: { entries: EvolutionRow[] })
// evolution-table.tsx ("use client"):   export function EvolutionTable({ patientId, entries }: { patientId: string; entries: EvolutionRow[] })
// evolution-summary.tsx ("use client"): export function EvolutionSummary({ entries }: { entries: EvolutionRow[] })
// evolution-section.tsx ("use client", API conservada): EvolutionSection({ patientId, entries }) = Form + Charts + Table
// formula-data-sheet.tsx ("use client"): export function FormulaDataSheet({ children }: { children: ReactNode })
//   Sheet side="right" (className "w-full sm:max-w-md"), SheetTrigger = Button variant="secondary" size="sm" con Pencil "Editar",
//   SheetTitle "Datos para cálculos", SheetDescription "Los usan las fórmulas de la calculadora.", children = <FormulaDataForm />.
```

#### `src/components/skeletons.tsx` (prop opcional nueva)

```ts
export function TableSkeleton(props: { rows?: number; columns?: number; bare?: boolean }): JSX.Element;
export function CardSkeleton(props: { lines?: number; bare?: boolean }): JSX.Element;
// bare = sin role="status" ni "Cargando…" (para anidarlos dentro de otro esqueleto). PageSkeleton pasa bare.
```

#### `src/lib/pdf-theme.ts` (nuevo, sin `"server-only"`: lo puede importar `/ajustes` en la 002c)

```ts
export const DEFAULT_PDF_ACCENT: "#37352F";   // reemplaza el "#3c7a24" de plan-pdf.tsx (D2: acento neutro)
export const pdfColors: { text: "#37352F"; muted: "#65635D"; border: "#E9E9E7"; subtle: "#F6F6F4" };
```

#### `src/lib/plan-pdf.tsx` (reescrito por dentro, API **idéntica**)

`PlanPdfInput`, `PlanDocument({ input })` y `renderPlanPdf(input): Promise<Buffer>` no cambian de
nombre, campos ni tipos, porque los consume `planes/[planId]/actions.ts`, que no se toca. Detalle
en §7.11.

---

## 7. Vistas (skill `ui`)

Referencia Notion, **mucho aire** (D6), notebook a **1366 × 663 px útiles** (ventana de
1366 × 800). Con la sidebar expandida quedan ~1046 px de ancho de contenido (1366 − 240 − 80),
y con la colapsada ~1230 px. Todo en caso oración, sin `uppercase`/`tracking-[…]`/`border-2`/
`font-bold` en títulos, y números con `Quantity` (tabulares, unidad con espacio duro).

**Feedback de guardado (igual en todos los formularios):** `Button type="submit" loading={pending}`
con el texto `"Guardando…"` mientras está pendiente (`"Agregando…"`/`"Creando…"`/`"Aplicando…"`/`"Generando…"`
donde hoy dice eso), `useActionToast(state, { success: "<mensaje>" })` y `<FormError message={state.error} />`
debajo de la fila de botones. Se borran todos los "✓ Guardado" inline y los `reveal`.

| Formulario | Toast de éxito (texto exacto) |
|---|---|
| `PatientForm` | "Datos del paciente guardados" |
| `FormulaDataForm` | "Datos para cálculos guardados" |
| `ClinicalRecordForm` | "Ficha clínica guardada" |
| `EvolutionForm` | "Medición agregada" |
| `PlanMetaForm` | "Plan guardado" |
| `PlanPdfActions` → Generar | `notify.saved("PDF generado")` |
| `PlanPdfActions` → Enviar | `notify.info(\`Encolado para enviar por WhatsApp a ${patientPhone}.\`)` (texto de hoy) |
| `PlansSection`, `AiPlanForm` | Sin toast: el éxito redirige o refresca, como hoy. Solo `FormError` |

### 7.1 Lista de pacientes (`/pacientes`)

**Estructura base:** shell con sidebar → `PageHeader title="Pacientes" description="Personas que
escribieron al bot o tienen turnos cargados."` (sin cambios, `page.tsx` **no se toca**) →
barra de búsqueda → tabla.

```
Pacientes
Personas que escribieron al bot o tienen turnos cargados.

[🔍 Nombre o teléfono…        ]   8 de 10
┌──────────────────────────────┬──────────────────┬──────────────────┐
│ Nombre ↑                     │ Teléfono         │ Próximos turnos ⇅│  ← encabezado fijo
├──────────────────────────────┼──────────────────┼──────────────────┤
│ Ana Pérez                    │ 5493515552345    │   [1 próximo]    │  ← fila clickeable
```

**Componentes clave:**

- Buscador: `Input type="search"` con `className="pl-9"`, ícono `Search` (`absolute left-3
  h-4 w-4 text-muted-foreground`, `aria-hidden`), contenedor `relative w-full sm:max-w-xs`. El
  `label` `sr-only` y el filtrado (`normalize`, dígitos) quedan **idénticos**. Contador
  `text-sm text-muted-foreground tabular-nums` "`{filtered.length} de {patients.length}`".
- `DataTable<PatientRow>` dentro de `Card padding="none"`:
  - `nombre`: `cell` = `name ?? "(sin nombre)"` (`font-medium`), `sortValue` = `name ?? ""`, `className="w-1/2"`.
  - `telefono`: `cell` = `phone` (`tabular-nums text-muted-foreground`).
  - `proximos` ("Próximos turnos", `numeric`, `sortValue` = `upcoming`): `upcoming > 0` →
    `<Badge tone="success">{n} próximo{s}</Badge>`; si no, `<span className="text-muted-foreground">—</span>`.
  - `rowHref={(p) => \`/pacientes/${p.id}\`}`, `initialSort={{ columnId: "nombre", direction: "asc" }}`,
    `caption="Pacientes"`, `maxHeightClassName="max-h-[calc(100vh-15rem)]"` (con 663 px útiles
    entran ~9 filas y el encabezado queda fijo).
  - `empty`: si `patients.length === 0` → `EmptyState icon={Users} title="Todavía no hay pacientes"
    description="Aparecen acá cuando alguien le escribe al bot por WhatsApp o cuando cargás un turno."`;
    si hay pacientes pero el filtro da 0 → `EmptyState icon={SearchX} title={\`Sin resultados para «${q}»\`}
    description="Probá con otro nombre o con parte del teléfono."`.

**Decisión (ver §14 D-b1):** la HU (reordenamiento 2) menciona columnas "último turno / próximo
turno", pero la consulta actual solo trae la **cantidad** de próximos turnos, y esta HU no
cambia consultas. La tabla muestra nombre, teléfono y próximos turnos.

### 7.2 Ficha: encabezado persistente (`PatientHeader` dentro de `PatientTabs`)

**Estructura base:**

```
← Pacientes                                              (no sticky, text-sm muted, scrollea)
┌─ sticky top-14 lg:top-0, z-20, bg-background, -mx-6 px-6 lg:-mx-10 lg:px-10, pt-4 ───────────┐
│ Ana Pérez                                            [💬 Abrir chat de WhatsApp ↗]  │ h1 text-2xl semibold
│ 34 años · 5493515552345 · Próximo turno: lunes 6 de octubre, 10:00 · Control        │ text-sm muted
│ ⚠ Antecedentes: celiaquía, alergia a frutos secos…              Ver ficha clínica   │ 1 línea, solo si hay riesgo
│ Resumen  Datos y ficha clínica  Evolución 5  Planes 2  Diario •1  Turnos 8           │ TabsList (border-b)
└──────────────────────────────────────────────────────────────────────────────────────┘
```

- "← Pacientes": `Link href="/pacientes"` con `ArrowLeft`, **fuera** del bloque sticky (ahorra
  alto mientras se scrollea).
- Bloque sticky (lo arma `PatientTabs`): `sticky top-14 z-20 -mx-6 bg-background px-6 pt-4
  lg:top-0 lg:-mx-10 lg:px-10`. El `top-14` compensa la `MobileTopbar` (h-14) de < 1024 px. El
  `-mx`/`px` replica el padding de `main` (`px-6 lg:px-10`) para que el fondo tape el contenido
  de lado a lado.
- Fila 1: `h1` `text-2xl font-semibold tracking-tight truncate` (`name ?? "Paciente sin nombre"`) +
  a la derecha `<a href={\`https://wa.me/${phone}\`} target="_blank" rel="noopener noreferrer">` con
  las clases de `Button variant="secondary" size="sm"` (usar `buttonVariants` de
  `primitives/button`, mapeo `outline`/`sm`), ícono `MessageCircle`, texto "Abrir chat de
  WhatsApp", `ExternalLink h-3.5 w-3.5` y `<span className="sr-only"> (se abre en otra pestaña)</span>`.
  Mismo `href` que hoy.
- Fila 2 (`mt-1 flex flex-wrap gap-x-2 text-sm text-muted-foreground`, separadores `·` con
  `aria-hidden`): edad (`{n} años`, o "Edad sin cargar"), teléfono (`tabular-nums`), y
  "Próximo turno: {label} · {servicio}" con `Badge tone="warning"` "Esperando pago" si corresponde,
  o "Sin turnos próximos".
- Fila 3 (solo si `riskBackground`): `ClinicalAlert compact` (ver abajo).
- Fila 4: `TabsList` (el de la 002a, subrayado) con `overflow-x-auto` (a 768 px las 6 pestañas
  pueden no entrar: scrollean dentro de la barra, no la página). Cada `TabsTrigger` lleva la
  etiqueta y, si hay `count`, un contador `ml-1.5 rounded-md bg-secondary px-1.5 text-xs
  tabular-nums text-muted-foreground`. En Diario, si `diaryHasRecent`, un punto
  `h-1.5 w-1.5 rounded-full bg-info` + `sr-only` "(hay entradas de las últimas 24 hs)".
- Alto del bloque sticky: ~110 px sin alerta y ~146 px con alerta. A 663 px útiles quedan
  ≥ 500 px para el contenido.

**Cálculos en `page.tsx` (sin consultas nuevas):**

- `ageYears = patient.birthDate ? computeAgeYears(patient.birthDate, new Date(), pro.timezone) : null` (ya existe).
- `next = appts.filter(a => (a.status === "CONFIRMED" || a.status === "AWAITING_PAYMENT") && a.startsAt >= now).sort(asc by startsAt)[0]`
  → `{ label: formatDateTime(next.startsAt, pro.timezone), serviceName: next.service.name, awaitingPayment: next.status === "AWAITING_PAYMENT" }`.

**`ClinicalAlert` (reescrito):** `({ background, compact? }: { background: string; compact?: boolean })`.

- `compact` (encabezado): `div role="note" className="mt-3 flex items-center gap-2 rounded-md
  border border-warning/30 bg-warning-muted px-3 py-1.5 text-sm"` con `TriangleAlert h-4 w-4
  text-warning`, `<span className="font-medium text-warning">Antecedentes:</span>` + el texto en
  `min-w-0 flex-1 truncate text-foreground` con `title={background}`, y a la derecha
  `<PatientTabLink tab="datos">Ver ficha clínica</PatientTabLink>`. (`ClinicalAlert` es server y
  `PatientTabLink` es cliente: se importa y se usa como elemento, sin pasarle funciones.)
- No compacto (pestaña "Datos y ficha clínica", arriba de la ficha): `Alert tone="warning"
  title="Antecedentes a tener en cuenta"` con el texto completo en `whitespace-pre-wrap`.

**Componentes clave:** `Tabs`/`TabsList`/`TabsTrigger`/`TabsContent` (primitivo, **controlado**),
`Badge`, `buttonVariants`, `Alert`, íconos lucide.

**`TabsContent`:** los seis con `forceMount` y `className="data-[state=inactive]:hidden"`. Así el
texto que se escribió en un formulario no se pierde al cambiar de pestaña, y los gráficos se
miden al mostrarse. `TabsContent` ya trae `mt-6`.

### 7.3 Pestaña *Resumen* (la inicial, D14)

**Estructura base** (a 1366 px):

```
┌──── Evolución ─────────────────── Ver evolución completa ┐ ┌─ Datos para cálculos ─ [✎ Editar] ┐
│ Última medición: 12 sep 2026                             │ │ ⚠ Faltan datos para los cálculos… │
│ Peso        Cintura      Grasa corporal  Masa muscular   │ │ Edad          34 años             │
│ 70,5 kg     88 cm        24,1 %          52 kg           │ │ Peso          70,5 kg · 12/09     │
│ ↓ −1,2 kg   ↓ −2 cm      —               ↑ +0,4 kg       │ │ Talla         165 cm · 01/08      │
│ ▁▂▃▃▄▅▆█  (barras de peso, 180 px)                       │ │ Grasa         24,1 % · 12/09      │
└──────────────────────────────────────────────────────────┘ │ Contextura    Mediana             │
                                                             │ Sexo          Femenino            │
                                                             │ Actividad     Moderada (×1,55)    │
                                                             │ Objetivo      Bajar de peso       │
                                                             └───────────────────────────────────┘
Turnos
[Turnos totales 8] [Completados 5] [Cancelados 1] [Ausencias 0]
```

- Grilla `grid gap-6 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]`. A 1366 px entran las dos
  columnas y, con el encabezado, las dos tarjetas quedan arriba del pliegue (objetivo del
  recorrido). Por debajo de `xl` se apilan: primero Evolución y después Datos para cálculos.
- **Card "Evolución"** (`EvolutionSummary`, cliente): `Card title="Evolución"
  description={ultima ? \`Última medición: ${fmtFull}\` : undefined}
  actions={<PatientTabLink tab="evolucion">Ver evolución completa</PatientTabLink>}`.
  - KPIs `grid grid-cols-2 gap-4 sm:grid-cols-4`: Peso (kg), Cintura (cm), Grasa corporal (%),
    Masa muscular (kg). Cada uno: etiqueta `text-sm text-muted-foreground`, valor
    `Quantity className="text-xl font-semibold"`, y debajo la variación contra la medición anterior
    con valor en esa serie: `ArrowDown`/`ArrowUp`/`Minus` `h-3.5 w-3.5` + `formatDelta(...)` en
    `text-xs text-muted-foreground`. **Sin color de "bueno/malo"**: que bajar sea bueno depende del
    objetivo, y el ícono con el texto ya dicen la dirección. Sin dato → `Quantity` muestra "—".
  - Debajo: `EvolutionChart` de peso, `height={180}`, `unit="kg"`, `color={chartMetricColors.weightKg}`,
    solo las **últimas 8** mediciones con peso.
  - Sin mediciones: `EmptyState icon={ChartColumn} title="Todavía no hay mediciones"
    description="Cargá la primera en la pestaña Evolución." action={<PatientTabLink tab="evolucion">Cargar medición</PatientTabLink>}`.
- **Card "Datos para cálculos"** (`FormulaDataSection`, server, reordenada): `Card title="Datos
  para cálculos" actions={<FormulaDataSheet><FormulaDataForm … /></FormulaDataSheet>}`.
  - Arriba, los avisos de hoy con `Alert`: `missingMessage` → `Alert tone="warning"`;
    `isMinor(ageYears)` → `Alert tone="warning"` con `MINOR_WARNING_TEXT`. Mismos textos y
    condiciones que hoy.
  - Lista `dl className="divide-y text-sm"`, filas `flex justify-between gap-4 py-2`, `dt
    text-muted-foreground`, `dd text-right`: **Edad**, **Peso**, **Talla**, **Grasa**,
    **Contextura** (los 5 de hoy, con sus mismos textos vacíos en `Badge`: "Sin cargar",
    "Sin dato", "Sin cargar, se asume Mediana") y **Sexo**, **Actividad física**, **Objetivo**
    (antes solo se veían dentro de los `select`; ahora que el formulario va en el Sheet, el
    resumen los muestra. Etiqueta tomada de `SEX_OPTIONS`/`ACTIVITY_LEVELS`/`NUTRITION_GOALS`;
    actividad como `"${label} (×${formatDecimalEs(factor)})"`; null → `Badge` "Sin cargar").
    Peso/Talla/Grasa con `Quantity` y la fecha en `text-xs text-muted-foreground`.
  - El `h3` "Lo que van a usar las fórmulas" pasa a ser el `description` de la Card: "Lo que van a
    usar las fórmulas."
  - **Editar**: `FormulaDataSheet` abre el `Sheet` lateral con `FormulaDataForm` (la misma, con su
    `useActionState(updateFormulaDataAction)` y sus 4 `Select` con los mismos `name`), en una
    columna (`grid gap-4`). Al guardar: toast y el resumen de atrás se actualiza por el
    `revalidatePath` de siempre. El Sheet no se cierra solo.
- **Sección "Turnos"** (`SectionLabel` + `grid grid-cols-2 gap-4 sm:grid-cols-4`): los 4
  `StatTile` de hoy (Turnos totales, Completados, Cancelados, Ausencias), mismos cálculos.

### 7.4 Pestaña *Datos y ficha clínica*

- Si hay riesgo: `ClinicalAlert` (no compacto) arriba, `mb-6`.
- `grid gap-6 xl:grid-cols-2`:
  - `Card title="Datos del paciente"` → `PatientForm` (sin cambios de campos: `name`, `birthDate`,
    `notes`, `hidden id`). Grilla interna `grid gap-4 sm:grid-cols-2` para nombre y nacimiento, y
    notas debajo. Botón "Guardar".
  - `Card title="Ficha clínica"` → `ClinicalRecordForm`. El checkbox sigue **nativo** (mismo
    `name="riskFlag" value="true"`, mismo `FormData`), con estilo `h-4 w-4 rounded border-input
    accent-primary` en un `label className="flex items-start gap-2 text-sm"`. No se usa el
    `Checkbox` de Radix para no cambiar el `FormData`. Botón "Guardar ficha clínica".

### 7.5 Pestaña *Evolución*

**Estructura base:** tres bloques verticales `space-y-8`.

1. **`Card title="Nueva medición"
   description="Fecha, peso y nota. El resto de las medidas es opcional."`** (`EvolutionForm`,
   la misma lógica que hoy: `useActionState(addEvolutionEntryAction)`, `showMore`, `showBio`, los
   mismos 18 `name`, `step`, `min`, `required` y `placeholder`):
   - Fila `grid gap-4 sm:grid-cols-[10rem_9rem_minmax(0,1fr)_auto] sm:items-end`: `Field "Fecha"`
     + `Input type="date"`; `Field "Peso"` + `NumberInput unit="kg" name="weightKg" step="0.1" min="0" placeholder="70.5"`;
     `Field "Nota"` + `Textarea rows={1} className="min-h-9"`; `Button type="submit" loading={pending}`
     "Agregar" / "Agregando…".
   - Dos `Button variant="ghost" size="sm"` con `ChevronDown` (rota 180° cuando está abierto),
     `aria-expanded` y `aria-controls`. Textos de hoy sin el "+"/"−": "Agregar medidas
     antropométricas" ↔ "Ocultar medidas antropométricas", "Agregar datos de bioimpedancia" ↔
     "Ocultar datos de bioimpedancia".
   - Paneles: `rounded-lg bg-muted/60 p-4 grid gap-4 sm:grid-cols-3 lg:grid-cols-4`. Cada medida
     es un `Field` con la etiqueta **sin** la unidad entre paréntesis + `NumberInput unit="…"`:
     Talla cm, Cintura cm, Cadera cm, Brazo cm, Muslo cm, Pantorrilla cm, Pliegue tricipital mm,
     Pliegue subescapular mm, Pliegue abdominal mm | Grasa corporal %, Masa muscular kg, Agua
     corporal %, Grasa visceral `nivel`, Masa ósea kg, Metabolismo basal kcal (`step="1"`).
   - `FormError` + toast "Medición agregada".
2. **Gráficos** (`EvolutionCharts`, `SectionLabel` "Gráficos"). Si no hay mediciones, un solo
   `EmptyState icon={ChartColumn} title="Todavía no hay mediciones"
   description="Cuando cargues la primera, acá vas a ver cómo evoluciona."`. Si hay:
   - `grid gap-6 lg:grid-cols-2`, cada gráfico en un `Card` con `title` y, en `actions`, el
     último valor (`Quantity`) + variación (`formatDelta`):
     - **Peso** (`EvolutionChart`, 220 px, todas las mediciones con peso).
     - **Peso vs. grasa corporal** (`ComparativeChart`, 220 px), solo si hay peso **y** grasa
       (misma condición que hoy, `hasWeightAndFat`). Colores `chartMetricColors.weightKg` y
       `.bodyFatPercent`.
     - **Perímetros** (`StudyComparisonChart`, 240 px, `unit="cm"`, medidas Cintura, Cadera,
       Brazo, Muslo, Pantorrilla), solo si alguna medición tiene alguno. `description` = "Últimos
       {n} estudios".
     - **Pliegues** (`StudyComparisonChart`, `unit="mm"`, Tricipital, Subescapular, Abdominal),
       solo si hay alguno.
   - **Bioimpedancia** (solo si `hasBioimpedance`, misma condición que hoy): `SectionLabel`
     "Bioimpedancia" + `grid gap-4 sm:grid-cols-2 xl:grid-cols-3` con un `Card` chico por métrica
     que tenga al menos un valor (`EvolutionChart height={140}`, color de `chartMetricColors`, unidad
     de §7.5.1).
   - Etiquetas de estudio para leyenda/tooltip: `recordedAtShortLabel` ("dd/MM/yyyy").
3. **Mediciones** (`EvolutionTable`): `Card title="Mediciones" padding="none"` con `DataTable<EvolutionRow>`:

   | id | header | numeric | cell | sortValue |
   |---|---|---|---|---|
   | `fecha` | Fecha | | `recordedAtShortLabel` (`tabular-nums`) | `new Date(recordedAtISO)` |
   | `peso` | Peso | ✓ | `Quantity unit="kg"` | `weightKg` |
   | `imc` | IMC | ✓ | `Quantity value={computeBmi(weightKg, heightCm)}` | ídem |
   | `cintura` | Cintura | ✓ | `Quantity unit="cm"` | `waistCm` |
   | `cadera` | Cadera | ✓ | `Quantity unit="cm"` | `hipCm` |
   | `icc` | ICC | ✓ | `Quantity value={computeWaistHipRatio(waistCm, hipCm)} decimals={2}` | ídem |
   | `grasa` | Grasa | ✓ | `Quantity unit="%"` | `bodyFatPercent` |
   | `musculo` | Masa muscular | ✓ | `Quantity unit="kg"` | `muscleMassKg` |
   | `detalle` | Detalle | | el resto de las medidas **con los mismos textos de hoy** (brazo, muslo, pantorrilla, 3 pliegues, agua, visceral, ósea, MB) unidos con " · " en `text-xs text-muted-foreground`, y debajo la `note` (`truncate`, `title`) | — |
   | `acciones` | (header `""`, `className="w-12"`) | | `<form action={deleteEvolutionEntryAction}>` **idéntico** (hidden `id` y `patientId`) con `Button type="submit" variant="ghost" size="icon"` + `Trash2`, `aria-label={\`Borrar la medición del ${recordedAtShortLabel}\`}` | — |

   `initialSort={{ columnId: "fecha", direction: "desc" }}`, `caption="Mediciones de evolución"`,
   `maxHeightClassName="max-h-[28rem]"`, `empty` = `EmptyState title="Todavía no hay registros de evolución."`.
   Sin `rowHref`. El borrado sigue **sin** confirmación, como hoy (la HU pide confirmación solo
   para plan, plantilla y difusión).

#### 7.5.1 Unidades por métrica (gráficos y tabla)

`weightKg` kg · `heightCm` cm · `waistCm`/`hipCm`/`armCm`/`thighCm`/`calfCm` cm ·
`*SkinfoldMm` mm · `bodyFatPercent` % · `muscleMassKg` kg · `bodyWaterPercent` % ·
`visceralFatLevel` "nivel" (en los ticks, sin unidad) · `boneMassKg` kg ·
`basalMetabolicRateKcal` kcal (decimals 0).

### 7.6 Pestaña *Planes*

**Estructura base:** `grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem] xl:items-start`.

- Izquierda: `Card title="Planes nutricionales" padding="none"` con `DataTable<PlanRow>`:
  Título (`font-medium`, 1.ª columna → `Link`), Estado (`Badge`: Borrador `neutral`, Activo
  `success`, Archivado `neutral`) y Actualizado (`updatedAtLabel`, `text-muted-foreground`).
  `rowHref={(p) => \`/pacientes/${patientId}/planes/${p.id}\`}`, sin orden inicial (se respeta el
  orden de `listPatientPlans`), `empty` = `EmptyState icon={ClipboardList} title="Este paciente
  todavía no tiene planes" description="Creá el primero desde cero o a partir de una plantilla."`.
- Derecha: `Card title="Nuevo plan"`:
  - `ToggleGroup type="single" value={mode} onValueChange={(v) => v && setMode(v as …)}`
    `aria-label="Cómo crear el plan"` con `ToggleGroupItem value="nuevo"` "Plan nuevo" y
    `value="plantilla"` "Desde plantilla". El estado activo se ve por fondo **y** `aria-pressed`
    (no solo por color).
  - Los dos formularios de hoy, **idénticos** en lógica (`createPlanAction`/`applyTemplateAction`,
    mismos `name`/`hidden`/`required`), en una columna: `Field` + `Input`/`Select` a lo ancho
    (se quitan los `w-64`) + `Button` a lo ancho. Sin plantillas: el texto de hoy con el enlace a
    `/plantillas` en `text-link underline-offset-4 hover:underline`.
  - `FormError` para `createState.error`/`applyState.error`.

### 7.7 Pestaña *Diario*

`Card title="Diario alimentario" description="Lo carga el paciente desde el portal."`.

- Vacío: `EmptyState icon={NotebookPen} title="Todavía no cargó nada en su diario"
  description="El paciente lo completa desde el portal."`.
- Lista `ul className="divide-y"`, cada entrada `li className="grid gap-3 py-5 sm:grid-cols-[12rem_minmax(0,1fr)]"`:
  columna izquierda con la fecha (`createdAtLabel`, `text-sm text-muted-foreground`) y, si
  `isRecent`, `Badge tone="info"` "Últimas 24 hs"; columna derecha con la nota (`text-sm
  whitespace-pre-wrap`) y la foto (mismo `src`, mismo `alt`, `className="mt-3 max-h-64 max-w-full
  rounded-md border object-cover"`, `loading="lazy"`).

### 7.8 Pestaña *Turnos*

Server, con los **primitivos** `Table*` (no `DataTable`, porque la página es server). `Card
title="Historial de turnos" padding="none"` → `Table containerClassName="max-h-[28rem]"`:
Fecha y hora (`formatInTimeZone(..., "dd/MM/yyyy · HH:mm")` + " hs", como hoy, `tabular-nums`),
Servicio, Precio (`numeric`, `formatPrice(...)` como hoy), Estado (`Badge` con tonos semánticos:
CONFIRMED `info`, AWAITING_PAYMENT `warning`, COMPLETED `success`, CANCELLED `neutral`, NO_SHOW
`danger`, mismas etiquetas). Vacío: `EmptyState icon={CalendarX} title="Sin turnos registrados"`.
El `statusMeta` de `page.tsx` pasa a los tonos nuevos (se dejan de usar los alias `blue`, `amber`,
`slate`, `green`, `red` en los archivos de esta HU).

### 7.9 Detalle del plan (`/pacientes/[id]/planes/[planId]`)

**Estructura base:**

```
← Volver a Ana Pérez                                            (PageHeader.back → ?tab=planes)
Plan inicial                                               [🗑 Borrar plan]
Ana Pérez · 34 años · 70,5 kg
┌ sticky: Energía 1.850 kcal │ Proteínas 92 g │ Carbohidratos 210 g │ Grasas 60 g │ Fibra 25 g ┐
┌──────────── izquierda (minmax(0,1fr)) ───────────┐ ┌──── derecha (22rem) ─────┐
│ [Armar con IA]  (solo sin comidas)               │ │ Datos del plan            │
│ MealsEditor (sin cambios internos, 002d)         │ │ Enviar al paciente        │
└──────────────────────────────────────────────────┘ └───────────────────────────┘
```

- `PageHeader title={plan.title} description={[patient.name ?? patient.phone, age !== null ? \`${age} años\` : null, latestWeight !== null ? \`${fmt(latestWeight)} kg\` : null].filter(Boolean).join(" · ")}
  back={{ href: \`/pacientes/${id}?tab=planes\`, label: \`Volver a ${patient.name ?? "paciente"}\` }}
  action={<DeletePlanButton planId={plan.id} patientId={id} />}`. Mismos datos que hoy
  (`calculateAge`, `latestEntry`).
- **Franja de totales** `sticky top-14 z-10 -mx-6 mb-6 bg-background px-6 py-3 lg:top-0 lg:-mx-10 lg:px-10`
  con `dl className="grid grid-cols-2 divide-y rounded-lg border sm:grid-cols-5 sm:divide-x sm:divide-y-0"`.
  Cada celda `px-4 py-3`: `dt text-sm text-muted-foreground` (Energía, Proteínas, Carbohidratos,
  Grasas, Fibra) y `dd` con `Quantity className="text-lg font-semibold"` (`unit="kcal" decimals={0}`
  y `unit="g"`). Mismos `totals` de `sumMacros`. Queda a la vista mientras se editan las comidas.
- `grid gap-8 xl:grid-cols-[minmax(0,1fr)_22rem] xl:items-start`:
  - Izquierda `space-y-6`: si `plan.meals.length === 0`, `Card title="Armar con IA"` →
    `AiPlanForm` (restilizado: `FormError`, `Button variant="secondary" loading`, ayuda en
    `text-xs text-muted-foreground`); después `MealsEditor` **sin tocar** (sus props de hoy).
  - Derecha `space-y-6`: `Card title="Datos del plan"` → `PlanMetaForm` en una columna (Título,
    Estado con `Select` a lo ancho, Notas generales, `Button` "Guardar"); `Card title="Enviar al
    paciente"` → `PlanPdfActions`.
- **`DeletePlanButton`** (reemplaza `confirm()`):

  > ⚠️ **CORREGIDO en la review (ronda 1).** El fragmento de abajo tiene un bug: `useConfirm`
  > dentro de una form action de React 19 queda en deadlock (la action corre en una transición y el
  > diálogo nunca se monta). La confirmación se pide en un handler de evento (`onClick` de un
  > `Button type="button"`) y, solo si da `true`, se llama a la action dentro de `startTransition`.
  > Ver `progress/review_HU-002b.md`. **Regla para toda HU:** nunca `await confirm()` dentro de
  > `<form action>` ni de `startTransition`.

  ```tsx
  const confirm = useConfirm();
  <form action={async () => {
    if (!(await confirm({
      title: "¿Borrar este plan?",
      description: "Se borran el plan y todas sus comidas. Esta acción no se puede deshacer.",
      confirmLabel: "Borrar plan",
    }))) return;
    await deletePlanAction(planId, patientId);   // idéntico: misma action, mismos argumentos
  }}>
    <Button type="submit" variant="ghost" size="sm" className="text-destructive hover:bg-destructive-muted hover:text-destructive">
      <Trash2 aria-hidden /> Borrar plan
    </Button>
  </form>
  ```

  (Las comidas se borran en cascada: `PlanMeal.plan … onDelete: Cascade` en el schema, así que
  el texto es exacto.) `deletePlanAction` redirige a `/pacientes/[id]` y la ficha abre en
  *Resumen*: la action no se toca.
- **`PlanPdfActions`**: fila `flex flex-wrap gap-2` con `Button variant="secondary" size="sm"`
  `FileDown` "Generar PDF" (`loading` mientras corre) y `Button size="sm"` `Send` "Enviar por
  WhatsApp"; debajo `text-xs text-muted-foreground` "Último PDF: {label}" / "Todavía no generaste
  el PDF."; errores con `FormError`; éxito con toast (tabla de arriba). La función `run` y el
  `useTransition` quedan igual. Se borran `notice` y el "✓".

### 7.10 Gráficos (detalles comunes)

- Contenedor: `ChartContainer` con `className="aspect-auto w-full"` + alto explícito. En el portal
  el mismo componente toma `theme-warm` (los ticks y la grilla van por clases con tokens).
- Tooltip (`ChartTooltipContent`): fecha completa arriba (`labelKey="full"` o el nombre de la
  medida), cada serie con su cuadradito de color, nombre y **valor con unidad** (`es-AR`, espacio
  duro), `tabular-nums`.
- Ejes: sin líneas de eje (`axisLine={false}`), grilla horizontal `stroke-border`, ticks `text-xs
  fill-muted-foreground`, unidad en los ticks del eje Y.
- Barras: `radius` superior 3–4 px, `maxBarSize` 28–48. Nada de gradientes ni sombras.
- Accesibilidad: `accessibilityLayer` (default) + `title` en el chart. La tabla de mediciones es la
  alternativa textual en la misma pestaña, y en *Resumen* los KPIs son texto.
- Sin Fragment como hijo directo de un chart (§4.1).

### 7.11 PDF del plan (`lib/plan-pdf.tsx`, D12 + D13)

**Tipografía:** Inter 400/500/600 registrada con
`Font.register({ family: "Inter", fonts: [...] })` a nivel de módulo, desde
`path.join(process.cwd(), "public/fonts/inter-latin-{400,500,600}-normal.woff")`. `process.cwd()` es
`apps/web` en `next dev` y `/app/apps/web` en el contenedor (el `server.js` standalone hace
`chdir` a su carpeta y el `Dockerfile` copia `apps/web/public`). Si algún archivo no existe
(`fs.existsSync`), se usa `Helvetica`: el PDF **nunca** deja de generarse por la fuente.
`Font.registerHyphenationCallback((word) => [word])` para que no corte palabras en español con
reglas de inglés. Verificado en el scratchpad: react-pdf 4.9.0 incrusta Inter desde WOFF
(`pdffonts`: `Inter-Regular`, `Inter-SemiBold`, CID TrueType embebidas) y `pdftotext` devuelve
bien "ñ", "á", "·", "—", "¿" y "×".

**Estructura (A4, `padding: 44`, `paddingBottom: 64`, `fontSize: 10`, `lineHeight: 1.45`,
color `pdfColors.text`):**

```
┌──────────────────────────────────────────────────────────────┐
│ [logo 40×40]  Plan inicial                  Nutricionista     │ título 18 / 600 en pdfColors.text
│               Paciente: Ana Pérez           NutriBot          │ 10 muted | derecha: nombre 10/500 + "NutriBot" 8 muted
│ ════════════════════════════════════════ (2 pt, acento) ═════ │ única franja de color fuerte
│ Generado el 24 sept 2026                                      │ 8.5 muted
│                                                               │
│ ▌ Desayuno                                                    │ 11/600 + marca 3×12 pt en acento
│   Avena ........................................... 40 g      │ fila: nombre flex, cantidad 64 pt a la derecha (muted)
│   con leche descremada                                        │ nota 8.5 muted
│   ─────────────────────────────────────────────── (0.5 border)│
│ ▌ Almuerzo …                                                  │
│                                                               │
│ ┌ Total del plan ───────────────────────────────────────────┐ │ caja bg subtle, borde border, radio 6
│ │ 1.850 kcal   P 92 g   C 210 g   G 60 g                     │ │ mismo contenido que hoy (macrosLine)
│ └───────────────────────────────────────────────────────────┘ │
│ Notas                                                         │ 9/600 (solo si hay notas)
│ Tomar 2 litros de agua…                                       │ 9 muted
│ ───────────────────────────────────────────────────────────── │
│ {footerText}                                          1 / 2   │ fixed: en TODAS las páginas
└──────────────────────────────────────────────────────────────┘
```

- **Acento** = `input.accentColor || DEFAULT_PDF_ACCENT`. Se usa **solo** en la franja de 2 pt,
  la marca de cada comida y el borde izquierdo de la caja de totales: el texto va siempre en
  `pdfColors.text`/`muted`, así un acento claro elegido en `/ajustes` no deja nada ilegible.
  Mismo input que hoy, sin dejar de usar ningún campo de personalización.
- **Logo**: si viene, `Image` 40×40 `objectFit: "contain"` a la izquierda del título (hoy va a la
  derecha).
- **Marca (D13)**: arriba a la derecha, el nombre de la nutricionista (`professionalName`) y debajo
  "NutriBot". Se ve aunque haya pie personalizado.
- **Pie**: `View fixed` con borde superior 0.5 pt y `Text` con
  `input.footerText || \`Generado el ${input.generatedAtLabel} · NutriBot\`` (mismo default de hoy) +
  `Text render={({ pageNumber, totalPages }) => \`${pageNumber} / ${totalPages}\`}` a la derecha.
- **Comidas**: `View wrap={false}` por comida (como hoy). Filas separadas por `borderBottomWidth: 0.5`
  en `pdfColors.border`. `item.foodName ?? item.customLabel ?? "—"` y
  `item.quantityGrams ? \`${item.quantityGrams} g\` : ""`, como hoy.
- Totales: la **misma** `macrosLine(totals)` de hoy, dentro de la caja.
- Sin sombras, sin mayúsculas, sin hex fuera de `pdf-theme.ts` (el acento del usuario viene del
  dato).

### 7.12 Estados de carga

- `pacientes/loading.tsx`: esqueleto de `PageHeader` (`Skeleton h-8 w-40` + `h-4 w-80`) +
  `Skeleton h-9 w-72` (buscador) + `TableSkeleton rows={8} columns={3}`, dentro de un
  `role="status"` con "Cargando…" (los hijos con `bare`).
- `pacientes/[id]/loading.tsx`: `h-4 w-24` (volver) + `h-8 w-64` (nombre) + `h-4 w-96` (meta) + fila
  de 6 `h-4 w-20` (pestañas) + `grid xl:grid-cols-[3fr_2fr]` con dos `CardSkeleton bare lines={5}`.
- `pacientes/[id]/planes/[planId]/loading.tsx`: encabezado + franja `Skeleton h-16 w-full` +
  `grid xl:grid-cols-[1fr_22rem]` con `CardSkeleton bare lines={6}` y dos `CardSkeleton bare lines={3}`.
- `PageSkeleton` pasa `bare` a sus `CardSkeleton` (cierra la duda de la 002a: un solo "Cargando…").

---

## 8. Rutas / server actions / API

- **No se crean ni cambian** rutas de API ni server actions. Las páginas de siempre, con el
  parámetro de URL nuevo `?tab=` (opcional) en `/pacientes/[id]`.
- **Rutas temporales para el recorrido** (se crean en el checklist 9.x, las usa el orquestador y
  **las borra el orquestador** después del recorrido; ver §13.5):
  - `src/app/(panel)/prueba-002b/page.tsx` + `prueba-002b-client.tsx`: fixtures **en memoria**.
  - `src/app/(panel)/prueba-error/page.tsx`: `export default function P() { throw new Error("prueba"); }`.
  - `src/app/(panel)/prueba-pdf/route.ts`: `GET` que arma el PDF de un plan **sin guardarlo**.
  Las tres quedan detrás del `middleware.ts` (sesión de Google), como el resto del panel.

## 9. Mensajes del bot

No aplica. No cambia ningún mensaje. El caption del PDF por WhatsApp
("📄 Te comparto tu plan alimentario actualizado.") vive en `actions.ts`, que no se toca.

---

## 10. Radio de impacto (lista exacta)

**Modificados**

- `apps/web/package.json` (+`recharts`, −`@mui/material`, −`@mui/system`, −`@mui/x-charts`,
  −`@emotion/react`, −`@emotion/styled`) y `package-lock.json` (raíz, lo actualiza npm)
- `apps/web/src/components/evolution-chart.tsx`
- `apps/web/src/components/comparative-chart.tsx`
- `apps/web/src/components/skeletons.tsx` (prop `bare`)
- `apps/web/src/lib/chart-theme.ts`
- `apps/web/src/lib/plan-pdf.tsx`
- `apps/web/src/app/(panel)/pacientes/patients-list.tsx`
- `apps/web/src/app/(panel)/pacientes/[id]/page.tsx`
- `apps/web/src/app/(panel)/pacientes/[id]/clinical-alert.tsx`
- `apps/web/src/app/(panel)/pacientes/[id]/clinical-record-form.tsx`
- `apps/web/src/app/(panel)/pacientes/[id]/diary-section.tsx`
- `apps/web/src/app/(panel)/pacientes/[id]/evolution-section.tsx`
- `apps/web/src/app/(panel)/pacientes/[id]/formula-data-form.tsx`
- `apps/web/src/app/(panel)/pacientes/[id]/formula-data-section.tsx`
- `apps/web/src/app/(panel)/pacientes/[id]/patient-form.tsx`
- `apps/web/src/app/(panel)/pacientes/[id]/plans-section.tsx`
- `apps/web/src/app/(panel)/pacientes/[id]/planes/[planId]/page.tsx`
- `apps/web/src/app/(panel)/pacientes/[id]/planes/[planId]/plan-meta-form.tsx`
- `apps/web/src/app/(panel)/pacientes/[id]/planes/[planId]/delete-plan-button.tsx`
- `apps/web/src/app/(panel)/pacientes/[id]/planes/[planId]/ai-plan-form.tsx`
- `apps/web/src/app/(panel)/pacientes/[id]/planes/[planId]/plan-pdf-actions.tsx`

**Creados**

- `apps/web/src/components/primitives/chart.tsx`
- `apps/web/src/components/study-comparison-chart.tsx`
- `apps/web/src/lib/evolution-series.ts`, `apps/web/src/lib/pdf-theme.ts`
- `apps/web/src/app/(panel)/pacientes/[id]/patient-tabs.tsx`, `patient-header.tsx`,
  `evolution-types.ts`, `evolution-form.tsx`, `evolution-charts.tsx`, `evolution-table.tsx`,
  `evolution-summary.tsx`, `formula-data-sheet.tsx`, `appointments-section.tsx` (tabla de turnos, server)
- `apps/web/src/app/(panel)/pacientes/loading.tsx`, `pacientes/[id]/loading.tsx`,
  `pacientes/[id]/planes/[planId]/loading.tsx`
- `apps/web/public/fonts/inter-latin-400-normal.woff`, `inter-latin-500-normal.woff`,
  `inter-latin-600-normal.woff`, `Inter-OFL.txt` (licencia SIL OFL 1.1 del paquete)
- Temporales (§8): `(panel)/prueba-002b/page.tsx`, `(panel)/prueba-002b/prueba-002b-client.tsx`,
  `(panel)/prueba-error/page.tsx`, `(panel)/prueba-pdf/route.ts`
- `progress/impl_HU-002b.md`

**No se tocan** (verificable por diff, §13.2): `pacientes/page.tsx`, `pacientes/actions.ts`,
`[id]/clinical-actions.ts`, `[id]/planes/actions.ts`, `planes/[planId]/actions.ts`,
`planes/[planId]/ai-actions.ts`, `components/meals-editor.tsx`, `components/ui.tsx`,
`components/data-table.tsx`, `components/number-input.tsx`, `components/confirm.tsx`,
`lib/notify.ts`, `tailwind.config.ts`, `globals.css`, todo `(portal)/**` (el portal cambia de
gráfico solo a través de `EvolutionChart`), `packages/**`, `apps/bot/**`.

---

## 11. Checklist de ejecución (atómico y en orden; al final de cada fase el panel compila y funciona)

No hay pasos en `packages/db` ni en `packages/core`. Todo es `apps/web`.

### Fase 0: preflight

- [ ] 0.1 `git -C /Users/joelmiguelserrudo/Documents/Projects/Nutri-Bot branch --show-current` →
      `hu-002-rediseno-ui-empresarial`. Copiar el `git status --porcelain` inicial en `impl`.
- [ ] 0.2 `pgrep -fl "next dev"`: anotar el PID. Con un dev levantado, **nada de `next build`**, y
      no se levanta otro dev.
- [ ] 0.3 `npm run typecheck --workspace apps/web` en verde (línea base).
- [ ] 0.4 Guardar en el scratchpad una copia de los bloques de consulta actuales para comparar al
      final: `git show HEAD:"apps/web/src/app/(panel)/pacientes/[id]/page.tsx" | sed -n '38,55p'` y
      `git show HEAD:"apps/web/src/app/(panel)/pacientes/[id]/planes/[planId]/page.tsx" | sed -n '30,48p'`.

### Fase 1: Recharts y el primitivo de gráficos (sin consumidores todavía)

- [ ] 1.1 `npm install --workspace apps/web recharts@^3.10.1` (desde la raíz). Si npm protesta por
      peers, **no** usar `--force`: parar y anotarlo. Anotar la versión instalada
      (`node -p "require('recharts/package.json').version"` desde `apps/web`) y que `react-is`
      resuelve 16.x (esperado, §4.1).
- [ ] 1.2 Descargar el chart v4:
      `curl -fsS https://ui.shadcn.com/r/styles/new-york-v4/chart.json | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>process.stdout.write(JSON.parse(s).files[0].content))' > apps/web/src/components/primitives/chart.tsx`
      y aplicar **solo** las adaptaciones de §6.2 (`cn`, `outline-hidden`, `font-mono`).
- [ ] 1.3 `npm run typecheck --workspace apps/web` → verde. Si algún tipo de Recharts 3.10 no
      coincide con el 3.8 del registry, corregir **solo** el tipado (sin cambiar exports) y
      anotarlo.

### Fase 2: gráficos nuevos detrás de la misma API

- [ ] 2.1 `lib/chart-theme.ts`: **agregar** `chartStudyColors`, `studyColor`, `chartMetricColors`
      (todavía no borrar `chartSx`/`chartMargin`, que los usan los componentes viejos).
- [ ] 2.2 Crear `lib/evolution-series.ts` (§6.2).
- [ ] 2.3 Reescribir `components/evolution-chart.tsx` sobre Recharts (§6.2, §7.10). Misma API +
      opcionales.
- [ ] 2.4 Reescribir `components/comparative-chart.tsx` sobre Recharts (misma API).
- [ ] 2.5 Crear `components/study-comparison-chart.tsx`.
- [ ] 2.6 Ahora sí, en `chart-theme.ts` borrar `chartSx`, `chartMargin` y el import de
      `@mui/material/styles`.
- [ ] 2.7 typecheck verde. `portal/evolucion/page.tsx` compila **sin tocarlo**.

### Fase 3: sacar MUI y Emotion

- [ ] 3.1 `grep -rn -e "@mui" -e "@emotion" apps/web/src` → **0 líneas**. Si hay alguna, parar.
- [ ] 3.2 `npm uninstall --workspace apps/web @mui/material @mui/system @mui/x-charts @emotion/react @emotion/styled`.
- [ ] 3.3 typecheck verde. `git diff apps/web/package.json`: solo esos 5 salen y `recharts` entra.

### Fase 4: lista de pacientes

- [ ] 4.1 Reescribir `pacientes/patients-list.tsx` (§7.1). `PatientRow` y el filtrado quedan igual.
- [ ] 4.2 Crear `pacientes/loading.tsx` (§7.12) y agregar `bare` a `skeletons.tsx`
      (`PageSkeleton` lo usa).
- [ ] 4.3 typecheck verde.

### Fase 5: ficha (de adentro hacia afuera; `page.tsx` al final)

- [ ] 5.1 `patient-form.tsx`, `clinical-record-form.tsx`, `formula-data-form.tsx`: feedback nuevo
      (tabla de §7), sin cambiar campos ni actions. `formula-data-form.tsx` a una columna.
- [ ] 5.2 `clinical-alert.tsx` con la prop `compact` (§7.2).
- [ ] 5.3 Crear `evolution-types.ts` (mover `EvolutionRow` + `recordedAtShortLabel`),
      `evolution-form.tsx` (el `<form>` actual **movido tal cual** + estilo), `evolution-charts.tsx`,
      `evolution-table.tsx` (el `<form action={deleteEvolutionEntryAction}>` movido tal cual) y
      `evolution-summary.tsx`. `evolution-section.tsx` queda como composición + re-export del tipo.
- [ ] 5.4 `formula-data-sheet.tsx` y `formula-data-section.tsx` reordenada (§7.3).
- [ ] 5.5 `plans-section.tsx` (§7.6) y `diary-section.tsx` (§7.7).
- [ ] 5.6 Crear `patient-header.tsx`, `patient-tabs.tsx` (con `PatientTabLink`) y
      `appointments-section.tsx`.
- [ ] 5.7 Reescribir `[id]/page.tsx`: **el bloque `Promise.all` y el `if (!patient) notFound()`
      quedan idénticos** (comparar con 0.4). Mapear `recordedAtShortLabel`, calcular
      `nextAppointment`, `riskBackground`, `counts` y `diaryHasRecent`, y armar
      `<PatientTabs header panels counts diaryHasRecent />`. `statusMeta` con tonos nuevos.
- [ ] 5.8 Crear `[id]/loading.tsx`.
- [ ] 5.9 typecheck verde.

### Fase 6: detalle del plan

- [ ] 6.1 `delete-plan-button.tsx` → `useConfirm` (§7.9). `grep -n "confirm(" delete-plan-button.tsx`
      solo muestra la llamada a `confirm({`.
- [ ] 6.2 `plan-meta-form.tsx`, `ai-plan-form.tsx`, `plan-pdf-actions.tsx`: feedback nuevo.
- [ ] 6.3 Reescribir `planes/[planId]/page.tsx` (§7.9). El bloque de consultas queda **idéntico**
      (comparar con 0.4) y `MealsEditor` recibe exactamente las mismas props.
- [ ] 6.4 Crear `planes/[planId]/loading.tsx`.
- [ ] 6.5 typecheck verde.

### Fase 7: PDF

- [ ] 7.1 Fuentes, sin dependencia nueva, desde el scratchpad:
      `cd <scratchpad> && npm pack @fontsource/inter@5.3.0 && tar xzf fontsource-inter-5.3.0.tgz`
      → copiar `package/files/inter-latin-{400,500,600}-normal.woff` a `apps/web/public/fonts/` y
      `package/LICENSE` a `apps/web/public/fonts/Inter-OFL.txt`.
- [ ] 7.2 Crear `lib/pdf-theme.ts`.
- [ ] 7.3 Reescribir el cuerpo de `lib/plan-pdf.tsx` (§7.11). `PlanPdfInput`, `PlanDocument` y
      `renderPlanPdf` con la **misma** firma. `git diff` de `planes/[planId]/actions.ts` → vacío.
- [ ] 7.4 typecheck verde.

### Fase 8: limpieza de tokens viejos en los archivos de la HU

- [ ] 8.1 Correr el grep de §13.3 (1) y (2) sobre los archivos de §10 → 0 líneas (salvo las
      excepciones escritas).

### Fase 9: páginas temporales para el recorrido (las borra el orquestador)

- [ ] 9.1 `(panel)/prueba-002b/page.tsx` (server) + `prueba-002b-client.tsx` (cliente), con datos
      **solo en memoria** y sin importar ninguna server action:
  - `PatientsList` con **30** pacientes ficticios (nombres con tildes, 3 sin nombre, `upcoming` 0–3).
  - `EvolutionCharts` con 6 mediciones ficticias con **todos** los campos (perímetros, pliegues y
    bioimpedancia completos) y `EvolutionTable` con esas filas, en modo de solo lectura: renderizar
    la tabla con un `patientId` ficticio y un aviso arriba, "No tocar Borrar: página de prueba". Si se
    prefiere evitar el riesgo, pasar una prop opcional interna que oculte la columna `acciones`
    (no es contrato).
  - Un `Field` con hint + `NumberInput unit="kg" aria-describedby="prueba-hint"` y un
    `<p id="prueba-hint">`, para verificar que quedan los dos ids (pendiente de la review de la 002a).
- [ ] 9.2 `(panel)/prueba-error/page.tsx` que tira un error.
- [ ] 9.3 `(panel)/prueba-pdf/route.ts` (`export const dynamic = "force-dynamic"`): `GET` con
      `?planId=<id>`; lee con `getPlan`, `prisma.patient.findUniqueOrThrow`, `getProfessional()` y
      el logo (`select: { logoData, logoMimeType }`), **exactamente** como `buildAndSavePdf`, pero
      **sin** `savePlanPdf` ni `revalidatePath`. Devuelve `new Response(new Uint8Array(buffer),
      { headers: { "Content-Type": "application/pdf", "Content-Disposition": "inline; filename=prueba.pdf" } })`.
      Parámetros: `&sinPersonalizacion=1` (acento, pie y logo en `null`) y `&largo=1` (repite
      las comidas ×4 en memoria para forzar una 2.ª página). Si `planId` no es de un plan, 404.
      Solo lectura: nada de `update`, `create` ni `delete`.
- [ ] 9.4 typecheck verde. Anotar en `impl` las 4 rutas temporales, con el aviso de que las borra
      el orquestador después del recorrido.

### Fase 10: verificación y cierre

- [ ] 10.1 Correr §13.1–§13.3 y anotar los resultados en `progress/impl_HU-002b.md`, con lo que no
      se pudo verificar y por qué.
- [ ] 10.2 No commitear. Devolver `done -> progress/impl_HU-002b.md`.

---

## 12. Tests

**No hay lógica de dominio nueva.** `evolution-series.ts` solo da forma a datos para los gráficos
(filtrar nulls, ordenar por fecha, tomar los últimos N y restar dos números). No tiene reglas
clínicas, así que queda en `apps/web` sin tests (vitest solo corre en `packages/core`, y la HU no
puede tocar `packages/`). Si más adelante algo de esto se vuelve regla (p. ej. "variación
significativa"), va a `packages/core` con tests en la HU que lo pida. `npm run test` tiene que
seguir en verde (49 tests).

---

## 13. Verificación (comandos exactos antes de declararse `done`)

Todo desde `/Users/joelmiguelserrudo/Documents/Projects/Nutri-Bot` salvo que se indique otra cosa.

### 13.1 Compilación y arnés

```bash
npm run typecheck --workspace apps/web     # verde
npm run typecheck                          # todos los workspaces (bot y packages no cambian)
npm run test                               # vitest de packages/core, sigue en verde
./ops/harness/verify.sh                    # exit 0
```

`next build` **no** se corre si `pgrep -fl "next dev"` devuelve algo (es lo esperado: el usuario
tiene su dev en el 3000). Anotarlo.

### 13.2 Alcance del diff

```bash
git status --porcelain
git diff --stat -- packages apps/bot                                                          # vacío
git diff --name-only -- \
  'apps/web/src/app/(panel)/pacientes/actions.ts' \
  'apps/web/src/app/(panel)/pacientes/[id]/clinical-actions.ts' \
  'apps/web/src/app/(panel)/pacientes/[id]/planes/actions.ts' \
  'apps/web/src/app/(panel)/pacientes/[id]/planes/[planId]/actions.ts' \
  'apps/web/src/app/(panel)/pacientes/[id]/planes/[planId]/ai-actions.ts' \
  'apps/web/src/app/(panel)/pacientes/page.tsx' \
  apps/web/src/components/meals-editor.tsx apps/web/src/components/ui.tsx \
  apps/web/tailwind.config.ts apps/web/src/app/globals.css \
  'apps/web/src/app/(portal)' apps/web/src/app/api apps/web/src/middleware.ts                 # vacío
# Consultas idénticas: las líneas de consulta de las dos page.tsx no cambian
diff <(git show HEAD:"apps/web/src/app/(panel)/pacientes/[id]/page.tsx" | grep -E "prisma\.|list[A-Z]|get[A-Z][A-Za-z]*\(|include:|orderBy|where:|notFound") \
     <(grep -E "prisma\.|list[A-Z]|get[A-Z][A-Za-z]*\(|include:|orderBy|where:|notFound" "apps/web/src/app/(panel)/pacientes/[id]/page.tsx")          # vacío
diff <(git show HEAD:"apps/web/src/app/(panel)/pacientes/[id]/planes/[planId]/page.tsx" | grep -E "prisma\.|getPlan|listFoods|getProfessional|where:|orderBy|notFound") \
     <(grep -E "prisma\.|getPlan|listFoods|getProfessional|where:|orderBy|notFound" "apps/web/src/app/(panel)/pacientes/[id]/planes/[planId]/page.tsx") # vacío
# Mismos "name" de campos en los formularios movidos (comparar conjuntos)
diff <(git show HEAD:"apps/web/src/app/(panel)/pacientes/[id]/evolution-section.tsx" | grep -oE 'name="[a-zA-Z]+"' | sort -u) \
     <(cat "apps/web/src/app/(panel)/pacientes/[id]/"evolution-*.tsx | grep -oE 'name="[a-zA-Z]+"' | sort -u)                                        # vacío
```

Los únicos cambios fuera de `apps/web/` son `package-lock.json`, `progress/impl_HU-002b.md` y los
archivos ajenos anotados en 0.1.

### 13.3 Sistema viejo, MUI y confirm

Desde `apps/web`:

```bash
FILES=( src/components/evolution-chart.tsx src/components/comparative-chart.tsx src/components/study-comparison-chart.tsx
  src/components/primitives/chart.tsx src/components/skeletons.tsx src/lib/chart-theme.ts src/lib/evolution-series.ts
  src/lib/pdf-theme.ts src/lib/plan-pdf.tsx "src/app/(panel)/pacientes/patients-list.tsx" "src/app/(panel)/pacientes/loading.tsx"
  "src/app/(panel)/pacientes/[id]/"*.tsx "src/app/(panel)/pacientes/[id]/"*.ts
  "src/app/(panel)/pacientes/[id]/planes/[planId]/"*.tsx )
# (1) Tokens/clases viejos → 0 líneas (en *.ts de [id] solo hay actions y tipos: no deberían matchear)
grep -nE "(bg|text|border|ring|fill|stroke|divide|accent|outline|from|to|placeholder|decoration)-(ink|leaf|mint|paper|line|brand)\b|font-display|rounded-card|shadow-card|shadow-lift|uppercase|tracking-\[|border-2|\breveal\b|\bpress\b|text-\[[0-9]+px\]|amber-[0-9]|red-[0-9]|tone=\"(slate|green|red|amber|blue)\"|✓" "${FILES[@]}"
# (2) Hex sueltos → solo chart-theme.ts, pdf-theme.ts y los selectores [stroke='#ccc'|'#fff'] de primitives/chart.tsx
grep -nE "#[0-9a-fA-F]{3,8}\b" "${FILES[@]}" | grep -vE "src/lib/chart-theme.ts|src/lib/pdf-theme.ts|stroke='#(ccc|fff)'"
# (3) MUI/Emotion fuera del código y de package.json → 0
grep -rn -e "@mui" -e "@emotion" src package.json
# (4) Recharts instalado y MUI no
node -p "require('recharts/package.json').version"                              # 3.10.x
node -e "try{require.resolve('@mui/x-charts');console.log('MUI SIGUE')}catch{console.log('OK sin MUI')}"
# (5) Sin Fragment como hijo directo en los gráficos (revisión: no hay "<>" dentro de <BarChart>…</BarChart>)
grep -n "<>" src/components/evolution-chart.tsx src/components/comparative-chart.tsx src/components/study-comparison-chart.tsx
# (6) confirm() nativo: quedan exactamente 2 (broadcast-form de 002c y delete-template-button de 002d)
grep -rn "confirm(" src | grep -v "useConfirm\|components/confirm.tsx\|await confirm({"
# (7) Sin console.* ni TODO en los archivos de la HU
grep -nE "console\.|TODO|FIXME" "${FILES[@]}"
# (8) Fuentes del PDF presentes
ls -l public/fonts/inter-latin-400-normal.woff public/fonts/inter-latin-500-normal.woff public/fonts/inter-latin-600-normal.woff public/fonts/Inter-OFL.txt
```

### 13.4 PDF (lo verifica el implementer hasta donde puede y el orquestador en el navegador)

- El implementer no tiene sesión de Google para abrir `/prueba-pdf`: deja la ruta lista y lo anota.
  Además confirma por diff que `actions.ts` no cambió y que `PlanPdfInput` es idéntico
  (`git diff -U0 apps/web/src/lib/plan-pdf.tsx | grep -A12 "interface PlanPdfInput"` no muestra
  cambios dentro de la interfaz).
- **Prohibido** usar "Generar PDF" o "Enviar por WhatsApp" de un plan real para verificar.

### 13.5 Recorrido visual (lo hace el orquestador con el navegador; lista concreta)

Ventana de **1366 × 800** (viewport útil **1366 × 663**) salvo que se diga otra cosa. En cada
pantalla, en la consola: `document.documentElement.scrollWidth <= window.innerWidth` → `true`.
Ids de solo lectura: el paciente con más mediciones es `cmtyq7tzm0017xnwskwm1ttlb` (5 mediciones,
2 con grasa); `cmtyq7tys0000xnwszq8d9maa` tiene cintura. Un plan:
`docker compose exec -T db psql -U nutri -d nutribot -Atc 'select id, "patientId" from "NutritionPlan" limit 3;'`.
**No** guardar formularios, **no** tocar "Generar PDF" ni "Enviar por WhatsApp", **no** borrar
mediciones ni planes (en el diálogo de borrar plan, solo "Cancelar" y Escape).

1. **`/pacientes`**: tabla con encabezado; orden por nombre y por próximos turnos (ícono y
   `aria-sort`); clic en una fila y Enter sobre el nombre llevan a la ficha; búsqueda por nombre
   con tilde y por parte del teléfono; "Sin resultados para «x»"; "8 de 10".
2. **`/prueba-002b`**: la tabla con **30 filas** (el encabezado queda fijo al scrollear **dentro**
   de la tabla, y la página no tiene scroll horizontal); gráficos con todos los campos: peso en
   barras con valores encima, perímetros y pliegues **agrupados por estudio** (4 colores, el
   último azul, leyenda con fechas), bioimpedancia en 6 tarjetas, peso vs. grasa con **dos ejes con
   unidad**; tooltip con Inter, fecha completa y unidades; teclado: Tab hasta un gráfico y flechas
   → el tooltip recorre las barras con foco visible. `NumberInput`: en DevTools, el `input` tiene
   `aria-describedby="prueba-hint <id-de-la-unidad>"`.
3. **`/pacientes/cmtyq7tzm0017xnwskwm1ttlb`** (abre en *Resumen*):
   - **Sin scroll**: encabezado (nombre, edad, teléfono, WhatsApp, próximo turno, alerta si
     hay), pestañas, **la tarjeta Evolución completa con el gráfico** y **la tarjeta Datos para
     cálculos** (D14). Anotar si algo queda abajo del pliegue.
   - Scrollear: el encabezado con las pestañas **queda fijo** y tapa el contenido de lado a lado.
   - Cada pestaña en **un clic**; la URL cambia a `?tab=…`; recargar mantiene la pestaña; el botón
     atrás del navegador **no** recorre las pestañas (replaceState).
   - Flechas izquierda/derecha sobre las pestañas (Radix); foco visible.
   - "Editar" en Datos para cálculos abre el Sheet a la derecha con los 4 selects; Escape cierra y el
     foco vuelve a "Editar". **No guardar.**
   - "Ver evolución completa" cambia a Evolución.
   - Escribir algo en "Notas" (Datos y ficha clínica), ir a otra pestaña y volver: el texto sigue
     (forceMount). **No guardar.**
   - *Evolución*: formulario con unidades dentro de los campos, los dos desplegables
     (`aria-expanded`), gráficos, tabla de mediciones con números a la derecha y "Borrar" con
     nombre accesible (inspeccionar, **no** hacer clic).
   - *Planes*: tabla + "Nuevo plan" con el segmented control (el activo se distingue sin color).
   - *Diario*, *Turnos*: vacío o tabla.
   - Un paciente con `riskFlag` (si no hay, anotarlo): alerta de una línea en el encabezado +
     "Ver ficha clínica".
4. **A 768 × 1024**: topbar con menú; el encabezado sticky arranca debajo de la topbar (no queda
   tapado); las pestañas scrollean dentro de su barra; *Resumen* en una columna.
5. **Plan** `/pacientes/<id>/planes/<planId>`: "Volver a …" vuelve a la ficha **en Planes**;
   franja de totales con unidades y fija al scrollear el editor; columna derecha con Datos del plan
   y Enviar al paciente; "Borrar plan" abre el **diálogo del sistema** con el foco en "Cancelar",
   Escape y "Cancelar" no hacen nada (**no confirmar**).
6. **Portal** `/portal/evolucion` (token de `createPatientToken` como en 002a §12.4, 30 min): el
   peso se ve en **barras**, con el tono cálido en ejes y tooltip, sin scroll horizontal a 500 px.
7. **PDF** `/prueba-pdf?planId=<id>`: Inter (en el visor, Propiedades del documento → Fuentes:
   Inter), título oscuro, franja de acento con el color de `/ajustes` (en desarrollo `#2563eb`),
   el nombre de la nutricionista + "NutriBot" arriba a la derecha, y el pie personalizado.
   `&sinPersonalizacion=1`: acento neutro y pie "Generado el … · NutriBot". `&largo=1`: 2.ª página
   con el pie y "2 / 2". Tildes y "ñ" bien. (No hay logo en la base de desarrollo: queda sin ver,
   salvo que el usuario suba uno.)
8. **Error**: `/prueba-error` → "Algo salió mal"; "Reintentar" vuelve a intentar (y vuelve a
   fallar), "Volver al calendario" funciona. (Pendiente de la review de la 002a.)
9. **Carga**: DevTools → Network → "Slow 4G", navegar a `/pacientes` y a una ficha: se ven los
   esqueletos con la forma de la tabla y de la ficha.
10. **Movimiento reducido** (DevTools → Rendering → `prefers-reduced-motion: reduce`): las barras
    aparecen sin animar y el Sheet sin deslizar.
11. **Contraste**: barras grises de estudios anteriores (≥ 3:1), texto de ticks (≥ 4,5:1).
12. **Borrar las rutas temporales**: `rm -r "apps/web/src/app/(panel)/prueba-002b" "apps/web/src/app/(panel)/prueba-error" "apps/web/src/app/(panel)/prueba-pdf"`,
    y `git status --porcelain | grep prueba-` → vacío, antes de aprobar.

---

## 14. Observaciones y decisiones para el orquestador (no bloquean)

- **D-b1, columnas de la lista.** El reordenamiento 2 dice "último turno, próximo turno". La
  consulta de `/pacientes` solo trae `_count` de próximos turnos confirmados, y esta HU no puede
  cambiar consultas. Por eso la tabla muestra **Próximos turnos (cantidad)**. Si el usuario quiere
  las fechas, hay que ampliar el `include` de esa `page.tsx` (solo lectura, un cambio chico) en una
  tarea aparte o como excepción explícita.
- **D-b2, color de acento por defecto del PDF.** `DEFAULT_PDF_ACCENT` pasa de `#3c7a24` (verde
  viejo) a `#37352F` (neutro, D2). Solo afecta a quien no eligió color en `/ajustes`. El
  formulario de `/ajustes` (`settings-form.tsx:68`) sigue mostrando `#3c7a24` como valor inicial
  cuando no hay color guardado: **la 002c** tiene que importar `DEFAULT_PDF_ACCENT` de
  `lib/pdf-theme.ts` ahí. En desarrollo hay `#2563eb` guardado, así que no se nota.
- **D-b3, próximo turno en el encabezado.** Cuenta `CONFIRMED` y `AWAITING_PAYMENT` futuros (el
  segundo con badge "Esperando pago"). La lista de pacientes cuenta solo `CONFIRMED`, porque es su
  consulta de siempre. Es una diferencia de presentación y queda documentada.
- **D-b4, Datos para cálculos en un Sheet.** Para que *Resumen* muestre primero los datos y no un
  formulario, la edición va en un panel lateral a un clic. Si la nutricionista prefiere editar en
  línea, el cambio es mover `<FormulaDataForm>` fuera del Sheet (misma lógica).
- **O-b1.** Un clic en un toast con el Sheet abierto lo cierra (Radix `DismissableLayer`, ya
  anotado en la review de la 002a). Es marginal.
- **O-b2.** `DeletePlanButton` → `deletePlanAction` redirige a `/pacientes/[id]` sin `?tab`, así
  que la ficha abre en *Resumen* después de borrar. Sumar `?tab=planes` implicaría tocar la action:
  queda así.
- **O-b3, el portal cambia de gráfico en esta HU.** `/portal/evolucion` pasa de línea a barras a
  través de `EvolutionChart`, sin tocar su página. La 002d migra esa página y puede usar
  `unit="kg"`.
- **O-b4.** `lib/age.ts` `calculateAge` (desfase de un día, pendiente fuera de HU) se sigue usando
  en el detalle del plan, sin cambios.

## 15. Dudas técnicas abiertas

Ninguna bloqueante. Las decisiones de §14 las puede revisar el orquestador con el usuario, pero
no impiden implementar.
