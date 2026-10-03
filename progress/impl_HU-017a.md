# impl HU-017a — Rediseño Apple (1/5): fundaciones y shell

Estado: **en curso** (alcance de esta ronda: fases 0 a 6; las 7–9 esperan la aprobación de la demo).

SDD: `Refactorizaciones/rediseno-apple-fundaciones.md` (manda §21). Rama `feat/hu-017-rediseno-apple`.
Skills: `apple-design` (base), `web-design-guidelines` (autochequeo).

## Fase 0 — Preflight

- 0.1 Rama `feat/hu-017-rediseno-apple`, HEAD `3457e3f` (HU + SDD). Árbol limpio salvo los ajenos sin
  trackear (`.mcp.json`, `docker-compose.prod.yml`, `hus-last-meet.md`, `apps/bot/.whatsapp-auth.vieja*`).
- 0.2 `gh pr view 7` → `OPEN` (sin merge). `origin/develop` (`8173142`) ya es ancestro de HEAD: no hace
  falta rebase. El merge final espera al PR #7 (D11).
- 0.3 Capturas "antes": **no las tomé yo.** El panel exige sesión de Google; armar una sesión a mano
  (JWT firmado con `AUTH_SECRET`) y leer ids de pacientes para el portal fue rechazado por el
  clasificador de permisos (datos personales), así que no lo intenté por otro camino. Como línea de
  base sirven las 22 capturas de la auditoría (`docs/auditoria-apple/01…22-*.jpg`), tomadas sobre este
  mismo estado (pre-017a). El recorrido con sesión queda para el orquestador (Chrome con su sesión),
  como en las HU anteriores (`progress/recorrido_HU-*.md`).
- 0.4 Medición de la sidebar a 1366×768: pendiente del recorrido con sesión (mismo motivo).
- Hay un `next dev --turbopack` del usuario corriendo en :3000 (terminal s006); lo uso para
  compilar/verificar rutas públicas, no lo reinicio.

## Fase 1 — Dependencias y helpers puros

- 1.1 `npm install motion@^14.0.0 --workspace apps/web` → `motion` 14.0.0 (+ `framer-motion`,
  `motion-dom`, `motion-utils` 14.0.0 en el lock; 61 líneas de lock). Sin plan B de R-2 por ahora.
- 1.2 `lib/contrast.ts` + test. 1.3 `lib/design-tokens.ts` + test. 1.4 `lib/motion.ts` + test,
  `lib/motion-features.ts`. 1.5 `lib/use-controllable-state.ts`. 1.6 `lib/utils.ts` con
  `extendTailwindMerge` + `utils.test.ts`. 1.7 `app/fonts.ts` (`axes: ["opsz"]`), lo importan
  `layout.tsx` y `global-error.tsx`. 1.8 `components/motion-provider.tsx` montado en `app/layout.tsx`.
- Verificación: `npx vitest run apps/web/src/lib` → 107 tests verdes (contrast 7, design-tokens 77,
  motion 20, utils 3). `tsc` de web verde. `/inicio` compila (200) con Inter nueva.

### Desvío D-1: `destructive` sobre materiales

El contrato (§6.3) pone `"destructive"` en `MATERIAL_TEXT_TOKENS`, pero el propio test de §16 (2) lo
rechaza: `#D70015` sobre chrome con negro debajo da **3,35:1** (bar/float 3,81). Agregué el token
**`destructive-vibrant` `#A80010`** (mismo valor que `destructive-pressed`; ≥ 4,8 sobre cualquier
material) y `MATERIAL_TEXT_TOKENS` usa ese en lugar de `destructive`. Dentro de `.material-*` se
redefine `--destructive` → vibrant (igual que `--muted-foreground`), así el ítem destructivo del menú y
cualquier texto rojo de un toast quedan AA sin que el consumidor haga nada.

## Fase 2 — Tokens nuevos conviviendo con los viejos

- 2.1 `tailwind.config.ts` importa `./src/lib/design-tokens` y genera las variables con un plugin
  (`addBase`): en `:root` **solo nombres nuevos** (17 colores nuevos, materiales, duraciones,
  curvas); `.theme-portal, :root:has(.theme-portal)` con `--grouped` cálido. `extend.colors` con
  los roles nuevos (`grouped`, `tertiary`, `placeholder`, `fill-hover|pressed`,
  `primary-hover|pressed|soft|soft-hover|soft-pressed|vibrant`, `destructive-hover|pressed|muted-hover|muted-pressed|vibrant`,
  `muted-foreground-vibrant`, `overlay-hover|pressed`, `scrim`), `fontSize` semánticos (con peso),
  `boxShadow` card/float/modal/thumb/focus, `rounded-xs`, duraciones (`duration-press`…),
  `ease-out-soft`, `animate-fade-in`/`fade-in-content`/`rise-in`, variantes `pressed:` y
  `more-contrast:`, `future.hoverOnlyWhenSupported`.
- 2.2 `globals.css` (agregado, sin borrar nada): `.press`, `.press-sm`, `.press-none`, `.touch-target`,
  `.material-chrome|bar|float` con scroll edge, fallbacks (`@supports`, reduced-transparency,
  contrast more) y simulación (`.a11y-reduce-transparency`, `.a11y-more-contrast`),
  `-webkit-tap-highlight-color`, `::selection`.
- Verificación: tsc web verde; `/inicio` 200; en el CSS compilado `:root` tiene `--primary-soft`,
  `--material-chrome-alpha`, `--duration-press`; `hover:` sale dentro de
  `@media (hover: hover) and (pointer: fine)`; `.rounded-md` y `.text-sm` dan el mismo valor que antes
  (fallback).

### Desvío D-2: alcance "preview" para que la demo muestre el lenguaje completo antes del flip

Con §21 la demo se aprueba **antes** de la fase 7, pero hasta la fase 7 los nombres shadcn
(`primary`, `muted-foreground`…) conservan los valores Notion: la demo mostraría botones negros. Para
que el usuario apruebe lo que de verdad va a ver, el plugin emite además
`:root:has([data-apple-preview])` con **todos** los colores Apple, radios y escala tipográfica
re-mapeada. Las dos páginas demo marcan su raíz con `data-apple-preview`; el resto de las pantallas
no cambia. Para que radios y `text-xs…4xl` se puedan re-mapear por alcance, sus utilidades pasan a
leer variables con **fallback idéntico al valor actual** (`rounded-md` =
`var(--radius-md, calc(var(--radius) - 2px))`, `text-sm` = `var(--text-sm, .875rem)` /
`var(--text-sm-lh, 1.25rem)` / `letter-spacing: var(--text-sm-tracking)` sin fallback → se hereda
como hoy). En la fase 7 el "flip" se reduce a mover ese bloque a `:root`.

## Fase 3 — Página demo (andamio)

- 3.1 `app/(panel)/dev-diseno/page.tsx` (guard `NODE_ENV === "production"` → `notFound()`, metadata
  noindex) + `_sections/`: `section.tsx` (marco de sección), `demo-frame.tsx` (raíz con
  `data-apple-preview`, barra `material-chrome` sticky con los tres interruptores de simulación e
  índice de anclas), `colors.tsx` (muestras de cada token, texto sobre W/G/PW, **tabla de contrastes
  calculada en vivo** con `contrastRatio` sobre `contrastRequirements` y texto sobre materiales con el
  peor fondo), `typography.tsx` (cada estilo con su tamaño/leading/peso/tracking, escala re-mapeada,
  selector de rasgos `ss01`/`cv11` para Q2), `shape.tsx` (radios, ejemplo concéntrico, elevación sobre
  blanco y agrupado), `materials.tsx` (caja desplazable con fondo de franjas negro/tint/rojo y los tres
  materiales), `motion.tsx` (un carril por preset con "Mover" interrumpible y pelota arrastrable con
  rubber-band, proyección de momentum con fantasma y spring con la velocidad del dedo).
- 3.2 `app/dev-diseno-portal/page.tsx` con el guard (placeholder hasta la fase 6).
- Verificación: tsc web y `next lint` de los directorios nuevos verdes. Smoke de SSR (test temporal,
  no commiteado) renderiza la página completa: 0 contrastes en "No". La verificación visual con
  sesión queda para el recorrido (ver Fase 0.3).
- Movimiento reducido: los componentes usan `useReducedMotionConfig()` (respeta el SO con
  `reducedMotion="user"` **y** la simulación `"always"` de la demo); `useReducedMotion()` de la SDD
  solo lee el SO y no reaccionaría al interruptor.

## Fase 4 — Primitivos

Archivos: `primitives/{button,skeleton,label,checkbox,radio-group,switch,toggle,table,tabs,tooltip,popover,dropdown-menu,dialog,alert-dialog,sheet,sonner,chart}.tsx`,
nuevo `primitives/use-dismiss-drag.ts`, nuevo `lib/use-exit-snapshot.ts`, `components/confirm.tsx`
(solo clases: sin `max-w-md`, botón destructivo `size: "lg"`). `separator.tsx` y `toggle-group.tsx`
sin cambios (ya cumplen). Demo: secciones 7 (formularios) y 11 (overlays).

- 4.1 `button`: variantes `default|destructive|destructive-tinted|tinted|secondary(gray)|outline|ghost|plain|link`,
  tamaños `sm|default|lg|icon|icon-sm|icon-lg`, `press` + `touch-target`, foco con `outline` ring,
  disabled 40 %. `link` sin escala (`--press-scale: 1`) y sin padding.
- 4.2 `skeleton` → `bg-secondary motion-safe:animate-pulse` (G12). `label` → `text-subheadline`.
- 4.3 `checkbox`/`radio` 18 px con `touch-target`; `switch` 44×26 con thumb `m.span` (spring
  `toggle`), estiramiento de 4 px en press hacia donde va (ancho de un hijo interno), track apagado
  `bg-input` (Q7). Refleja `checked` con `useControllableState` (misma API de Radix).
- 4.4 `toggle`: encendido `primary-soft` + tint; hover/press con overlay.
- 4.5 `table`: header `bg-background/95`, `TableHead` footnote semibold, `TableRow` con `onClick` →
  `pressed:bg-overlay-pressed cursor-pointer` sin escala; seleccionada `primary-soft`.
- 4.6 `tabs`: `Tabs` refleja el valor en un contexto dentro de un `LayoutGroup` propio; el activo
  dibuja `m.span layoutId="tab-indicator"` (spring `indicator`). En orientación vertical de escritorio
  (Ajustes ≥ lg) el indicador se oculta: esa pantalla dibuja su propio activo (se rediseña en 017c).
  `TabsContent` con `animate-fade-in`.
- 4.7 `tooltip`: `bg-foreground text-background text-footnote shadow-float`, CSS 150 ms con
  `motion-safe:zoom-in-[0.96]` (sin zoom con movimiento reducido).
- 4.8–4.11 Patrón Radix + Motion (§9.0) en `popover`, `dropdown-menu` (Root y Sub), `dialog`,
  `alert-dialog`: wrapper del Root con `useControllableState` + contexto; Content con
  `asChild` sobre `m.div` dentro de `AnimatePresence`, `forceMount` **después** del spread de props
  (si no, un `forceMount` undefined del consumidor lo pisaría). Dialog/Alert centrados con un wrapper
  `grid place-items-center pointer-events-none` (sin translate). Popover/menú con
  `transformOrigin: var(--radix-*-content-transform-origin)`. `DropdownMenuItem variant="destructive"`.
  `DialogOverlay`/`AlertDialogOverlay`/`SheetOverlay` exportados quedan como overlays CSS (API
  conservada); el contenido usa su propio scrim animado.
- 4.12 `sheet` + `use-dismiss-drag`: un solo `MotionValue` (px hacia el borde de cierre) maneja
  entrada, salida y arrastre, con `usePresence` → la salida va por el mismo borde, reabrir a mitad
  parte del valor presente y el cierre por arrastre hereda la velocidad del dedo (spring `fling`). El
  scrim sigue el progreso. Laterales: táctil/lápiz desde cualquier punto, `touch-action: pan-y`;
  inferior: desde el grabber (`data-sheet-handle`, `touch-none`) o el `SheetHeader`, también con
  mouse. Ignora inputs y `[data-sheet-drag-ignore]`. Modal → `shadow-modal` + scrim; `modal={false}`
  → `shadow-float` sin scrim. Prop nueva `dismissOnDrag` (default `true`).
- 4.13 `sonner`: variables de Sonner apuntadas a los tokens + `material-float`, íconos por tipo.
- 4.14 `chart`: tooltip `rounded-lg bg-background text-footnote shadow-float` sin borde.

### Decisiones no obvias

- **`useExitSnapshot`** (nuevo, `lib/use-exit-snapshot.ts`): como el contenido de los overlays queda
  montado durante la salida, si quien los usa limpia su estado al cerrar (p. ej. `ConfirmProvider`
  pone `pending = null`, el sheet del turno deja de tener turno seleccionado) el contenido se vaciaría
  a mitad del fundido. Los Content guardan sus `children` del último render abierto y los muestran
  durante la salida. Sin cambios en los consumidores.
- Durante las fases 4–6 las pantallas reales **sí cambian parcialmente** (lo prevé §7.8): tarjetas,
  botones, tabs, overlays y switch usan clases nuevas, pero los nombres shadcn (`primary`,
  `muted-foreground`…) siguen con valores Notion fuera de la demo; p. ej. un botón principal se ve
  negro en reposo y azul en hover/press hasta la fase 7. La demo (`data-apple-preview`) es la que
  muestra el lenguaje final.
- Verificación: tsc web verde, `next lint` sin warnings, smoke SSR de la demo con providers OK.
  **Sin verificación interactiva en navegador** (ver 0.3): el patrón Radix + Motion, el arrastre y el
  foco quedan para el recorrido del orquestador (lista al final).

## Fase 5 — Componentes de aplicación

- 5.1 `components/ui.tsx` (misma API): `ButtonVariant` suma `tinted` y `plain`; mapping
  `primary→default`, `secondary→secondary (gray)`, `danger→destructive-tinted`, `ghost`, `link`,
  `tinted`, `plain` (Q12, Q13). `Card` sin borde (`rounded-xl shadow-card`, `more-contrast:` borde),
  título `text-headline`. `PageHeader` `text-title-1`, back con `ChevronLeft` + texto tint.
  `SectionLabel` `text-headline`. `StatTile` `text-metric-md`. `Field` subheadline/footnote.
  `inputClass` borde `input`, foco `border-ring` + `shadow-focus`, `aria-invalid` rojo, placeholder
  `placeholder`, deshabilitado `bg-secondary text-tertiary`. `Badge` footnote semibold `rounded-xs`.
  `Alert` sin borde (borde solo con más contraste), título semibold, cuerpo `text-foreground`.
  `EmptyState` ícono `text-tertiary`. `AdequacyBar` footnote semibold. **Nuevo `Metric`** (firma de
  §6.3): número `text-metric`/`metric-md`, unidad con NBSP, `null` → "—" terciario, tendencia con
  flecha, signo menos U+2212, color por `sentiment` y `sr-only` ("subió 1,2 kg").
- 5.2 `globals.css` (sin layer, al final): inputs ≥ 16 px con `pointer: coarse`; 17 px dentro de
  `.theme-portal`. Verificado en el CSS compilado.
- 5.3 `segmented-control.tsx` (ToggleGroup single con `role="radiogroup"`, ignora el
  deseleccionar, thumb `layoutId` dentro de un `LayoutGroup` propio, tamaños sm/md/lg, `fullWidth`)
  y `grouped-list.tsx` (server-safe; `href`→`Link` con chevron, `onClick`→`button`, separador
  hairline desde el texto, resaltado de fila sin escala, destructiva, deshabilitada).
- 5.4 `skeletons.tsx` (tarjetas `rounded-xl shadow-card`), `status-screen.tsx` (ícono en círculo
  `bg-secondary`, título `text-title-2`, fundido de entrada).
- 5.5 `login-screen.tsx`: `bg-grouped`, tarjeta con `rise-in` (solo fundido con movimiento
  reducido), título `text-title-1`, **`SubmitButton`** con `pendingLabel="Abriendo Google…"` (la action
  `signIn` no cambia). `/inicio` responde 200 con el markup nuevo.
- Demo: secciones 6 (botones), 8 (selección), 9 (contenido), 10 (listas), 12 (estados).
- Verificación: tsc web verde; `next lint` de `src` → solo el warning preexistente de
  `ajustes/logo-form.tsx` (no es de esta HU); smoke SSR de la demo completa OK.
