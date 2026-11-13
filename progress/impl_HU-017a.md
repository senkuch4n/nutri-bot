# impl HU-017a — Rediseño Apple (1/5): fundaciones y shell

Estado: **done** (fases 0–9; demo aprobada por el usuario, SDD §22). Falta solo el recorrido con sesión en Chrome (lista en "Fases 7–9").

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

## Fase 6 — Shell

- 6.1 `shell/use-optimistic-path.ts` (activo al instante del clic plano; vale mientras la ruta real
  sea la del clic, tope 4 s; Cmd/Ctrl/Shift/Alt/medio/`target` no marcan) y `shell/use-scroll-edge.ts`
  (IntersectionObserver con `rootMargin` negativo). **Nuevo, no listado en §14.2:**
  `shell/scroll-edge-header.tsx` (cliente): `<header class="material-chrome">` + sentinela, mide la
  altura real del header (incluye la safe area del portal) para el offset. Lo usan la topbar móvil y
  `PortalHeader`, que así sigue siendo server-safe.
- 6.2 `nav-config.ts`: `sidebarItemClass` (callout, `text-foreground`, ícono muted, `press-sm`,
  overlay hover/press, foco hacia adentro para no recortarse en el rail, `h-11` con
  `group-data-[density=touch]/nav`); nuevo `SIDEBAR_WIDTH` (3rem/14rem). `sidebar-content.tsx`:
  activo = `m.span layoutId="sidebar-active"` `bg-primary-soft` + `text-primary font-semibold` + ícono
  tint de trazo 2 (no solo color); optimista; títulos de grupo `text-caption font-semibold`; badge
  tint (Q3); pie con hairline y footnote; prop `density`.
- 6.3 `app-sidebar.tsx`: **sin FLIP/WAAPI**; el slot es `m.div` con `width` animado por
  `springs.standard` (con movimiento reducido, instantáneo); la `aside` mantiene 14rem y el slot la
  recorta (`overflow: hidden`); `LayoutGroup id="sidebar-desktop"`. `sidebar-layout.css` reescrito en
  rem (salvo hairlines), sin `clip-path`, workspace sin borde (`shadow-card`, radio 22 px, borde
  `--input` con más contraste), hover del logo dentro de `@media (hover: hover)`, sin la regla vieja de
  reduced-motion (queda solo "sin escala en el ícono del toggle").
- 6.4 `mobile-topbar.tsx`: `ScrollEdgeHeader` `h-14` sticky con material; botón `ghost icon-lg`
  (44 px); Sheet izquierdo (ancho `min(85vw,20rem)`, arrastrar a la izquierda para cerrar),
  `SidebarContent density="touch"` dentro de `LayoutGroup id="sidebar-mobile"`.
- 6.5 `portal-header.tsx` (nuevo, server-safe), `portal-nav.tsx` (tab bar `material-bar`, ícono 24 px
  con trazo 1,75/2,25, etiqueta `text-caption`, activo `text-primary-vibrant` semibold, sin la rayita
  superior, press 0,94; nav superior con `layoutId="portal-top-active"`; optimista; prop
  `activeHref`), `(portal)/layout.tsx` (`theme-portal` + `bg-grouped`, main `data-portal-main` con
  padding inferior para la tab bar, portal sin link en tarjeta `shadow-card`, Toaster con offset bajo
  el header).
- 6.6 `(panel)/layout.tsx` (skip link `rounded-lg shadow-float text-callout`), `app/not-found.tsx`
  (`theme-portal bg-grouped` en rutas del portal).
- 6.7 `/dev-diseno-portal` (`app/dev-diseno-portal/{page,portal-demo}.tsx`): header + tab bar reales
  con `activeHref` local (los links y "Salir" no navegan dentro de la demo: se interceptan en captura),
  saludo `large-title`, interruptores de simulación, tarjetas tocables `press-sm`, `Metric`,
  segmentado `fullWidth`, Sheet inferior con grabber e inputs de 17 px, texto largo para scrollear.
  `/dev-diseno` suma secciones 13 (FullCalendar con eventos literales, fechas calculadas en el cliente
  para no desfasar la hidratación) y 14 (gráfico con `chartPalette` + muestras).
- Tema de FullCalendar (§11) en `globals.css`, **por ahora solo bajo
  `:root:has([data-apple-preview])`** (mismo criterio que D-2): en la fase 7 pierde el prefijo y
  reemplaza al tema actual. `lib/chart-theme.ts` no se tocó (es la 7.5); la demo usa `chartPalette`.

### Desvío D-3: `theme-warm` convive con `theme-portal` hasta el flip

La SDD (6.5, 6.6) cambia `theme-warm` por `theme-portal`. Sacar `theme-warm` antes de la fase 7 le
quitaría al portal real su paleta cálida de los nombres shadcn sin tener todavía la Apple. Dejé
**las dos clases** en `(portal)/layout.tsx` y `app/not-found.tsx`; la fase 7/8 borra `.theme-warm`
(regla y usos) como ya prevé §7.8.

## Verificación al cierre de la fase 6

```
npm run typecheck            → core, db, bot, web: tsc limpio
npm run test                 → Test Files 68 passed (68) · Tests 1341 passed (1341)
                               (incluye contrast 7, design-tokens 77, motion 20, utils 3 nuevos)
npm run lint -w apps/web     → 1 warning preexistente (ajustes/logo-form.tsx:36 alt-text), ninguno nuevo
./ops/harness/verify.sh      → Arnés OK (WARN "se tocó el bot": son los apps/bot/.whatsapp-auth.vieja*
                               sin trackear, ajenos; git diff contra develop no tiene apps/bot ni packages)
```

- Alcance (§17.2 contra `origin/develop`): sin archivos de la zona de imleticio, `packages/` ni
  `apps/bot/`; los `backlog/HU-017*.json` del diff vienen del commit del orquestador (`3457e3f`).
- Smoke de SSR de `/dev-diseno` y `/dev-diseno-portal` (test temporal, borrado): renderizan; la tabla
  de contrastes en vivo no tiene ningún "No".
- Rutas públicas con Playwright (sin sesión, sin datos): `/inicio` y `/portal` sin sesión a 1366 y
  390 → `docs/auditoria-apple/017a/despues/{50-inicio,44-portal-sin-sesion}-{1366,390}.png`. Sin
  errores de consola; `body` con Inter y `font-optical-sizing: auto`.
- `next build` no se corrió (hay un `next dev` del usuario levantado; §17.1).
- **No hecho por mí (sin sesión del panel ni herramienta de navegador en este contexto):** recorrido
  visual con sesión, capturas "antes/después" de las pantallas autenticadas, medición 0.4/6.3 de la
  sidebar a 1366×768, prueba de teclado/Esc/foco, reduced-motion real, Performance (§17.6).

## Para el usuario / orquestador: qué mirar en la demo

Con sesión del panel, `npm run dev` ya levantado:

1. **`/dev-diseno`** (1366×768 y 390×844 con emulación táctil):
   - Color: la tabla de contrastes en vivo (todo "AA"); texto sobre W/G/PW.
   - Tipografía: títulos 28–34 px (Q1: si el tracking se ve apretado, se ajusta solo en
     `design-tokens.ts`); probar `ss01`/`cv11` en los números (Q2).
   - Materiales: scrollear la caja; el texto sigue legible sobre franjas negras/azules/rojas.
   - Movimiento: "Mover" y volver a tocar a mitad (invierte sin frenazo); tirar la pelota con impulso.
   - Botones: mantener presionado (escala + tono en el pointer-down), arrastrar afuera con el mouse.
   - Formularios: switch (estirar en press), foco azul con Tab.
   - Selección: segmentados (thumb que se desliza, dos juntos no se cruzan), pestañas.
   - Overlays: Dialog y Sheet → Esc o clic afuera **a mitad de la entrada** (vuelve desde donde
     está); foco atrapado y devuelto al botón; confirmación destructiva (rojo lleno) y neutra; menú
     "…" con submenú e ítem destructivo (crece desde el botón); Sheet izquierdo/derecho arrastrando
     con emulación táctil; Sheet inferior arrastrando el grabber también con mouse; toasts.
   - Estados: "Simular carga" (fundido skeleton → contenido). Calendario y gráfico.
   - Interruptores de la barra: transparencia reducida, más contraste, movimiento reducido.
   - Sidebar: colapsar/expandir dos veces rápido (invierte, el contenido no se estira); el activo se
     desliza entre ítems y se marca al instante del clic; menú móvil a 390 px (ítems de 44 px).
2. **`/dev-diseno-portal`** (390×844 táctil y 1366): header translúcido con borde que aparece al
   scrollear, tab bar con material, tarjetas con press, Sheet inferior con grabber, inputs a 17 px.
3. **Pantallas reales (deberían verse casi igual que antes, con los cambios parciales previstos en
   §7.8):** `/`, `/pacientes`, `/pacientes/[id]` (pestañas), `/servicios` (switch, sheet Editar),
   `/alimentos` y un plan (popover de kcal) **sin guardar nada**. Transitorio esperado hasta la fase 7:
   botón principal negro en reposo y azul en hover/press, tarjetas sin borde con sombra, sidebar con
   fondo azul claro en el activo pero texto oscuro, secundario gris lleno, "Borrar" rojo suave.

## Archivos tocados (fases 1–6)

Nuevos: `apps/web/src/lib/{contrast,design-tokens,motion}.ts` (+ `.test.ts`), `lib/utils.test.ts`,
`lib/motion-features.ts`, `lib/use-controllable-state.ts`, `lib/use-exit-snapshot.ts`,
`app/fonts.ts`, `components/motion-provider.tsx`, `components/segmented-control.tsx`,
`components/grouped-list.tsx`, `components/primitives/use-dismiss-drag.ts`,
`components/shell/{portal-header.tsx,scroll-edge-header.tsx,use-optimistic-path.ts,use-scroll-edge.ts}`,
`app/(panel)/dev-diseno/page.tsx` + `_sections/{section,demo-frame,colors,typography,shape,materials,motion,buttons,forms,selection,content,lists,overlays,states,calendar,chart}.tsx`,
`app/dev-diseno-portal/{page,portal-demo}.tsx`.

Modificados: `apps/web/package.json`, `package-lock.json`, `apps/web/tailwind.config.ts`,
`app/globals.css`, `app/layout.tsx`, `app/global-error.tsx`, `app/not-found.tsx`,
`app/(panel)/layout.tsx`, `app/(portal)/layout.tsx`, `lib/utils.ts`, `components/ui.tsx`,
`components/{status-screen,skeletons,login-screen,confirm}.tsx`,
`components/primitives/{alert-dialog,button,chart,checkbox,dialog,dropdown-menu,label,popover,radio-group,sheet,skeleton,sonner,switch,table,tabs,toggle,tooltip}.tsx`,
`components/shell/{app-sidebar.tsx,mobile-topbar.tsx,nav-config.ts,portal-nav.tsx,sidebar-content.tsx,sidebar-layout.css}`.
Sin tocar: `lib/chart-theme.ts` (fase 7.5), `sign-out-button.tsx`, `separator.tsx`, `toggle-group.tsx`.

## Contrato compartido (§6)

Firmas de §6.2 intactas (solo props opcionales: `SheetContent.dismissOnDrag`,
`DropdownMenuItem.variant`, `SidebarContent.density`, `PortalNav.activeHref`; valores nuevos en
`ButtonVariant`/`buttonVariants`). Firmas de §6.3 como dice la SDD, con estos agregados/desvíos:
`colors` suma `destructive-vibrant` y `MATERIAL_TEXT_TOKENS` lo usa en lugar de `destructive` (D-1);
exports nuevos `newColorTokens`, `moreContrastOverrides`, `overlayAlpha` (design-tokens),
`closeButtonClass` (dialog), `SIDEBAR_WIDTH` (nav-config), `ScrollEdgeHeader`, `useExitSnapshot`;
`useDismissDrag` acepta además `reducedMotion?` opcional. Los componentes leen
`useReducedMotionConfig()` en lugar de `useReducedMotion()` (respeta el interruptor de la demo).
`packages/**` y `apps/bot/**` sin cambios.

## Pendiente (fases 7–9, cuando el usuario apruebe la demo)

Flip: mover el bloque `:root:has([data-apple-preview])` a `:root` (y el tema de FullCalendar sin
prefijo), borrar `:root` viejo y `.theme-warm`, re-mapear `shadow-sm…xl`, regla de reduced-motion
global → política §7.7, `body text-body`, fundido de `#contenido > *`, `chart-theme.ts` desde
`chartPalette`; quitar `data-apple-preview` de las demos; fase 8 (greps de §17.3, `tracking-tight`);
fase 9 (recorrido completo §17).

# Fases 7–9 (demo aprobada, SDD §22)

## Arreglo previo: hidratación de `/dev-diseno` — commit `f4f53ea`

- **No lo pude reproducir.** Armé una réplica fiel en rutas públicas temporales (mismo layout que
  `(panel)/layout.tsx` con datos falsos: `TooltipProvider` → `ConfirmProvider` → skip link →
  `AppSidebar` + `MobileTopbar` → `main`, más `loading.tsx`, layout async con server action y la
  página demo completa) con un `next dev` limpio en :3100, y la cargué con Playwright en Chrome real
  (`channel: "chrome"`) y Chromium, a 1366 y 390, con y sin `reducedMotion: reduce`, y con un user
  agent **no headless** (Next 15.5 trata a los navegadores headless como bots y les sirve la metadata
  bloqueante en lugar de streaming). El `aside id` y todos los ids eran iguales en el SSR y en el
  cliente, y no hubo ningún aviso de hidratación. Borré las rutas de prueba.
- Lo único que distingue `/dev-diseno` de `/pacientes` por encima de `AppSidebar` era el
  `export const metadata` de la página (único en todo el panel). Además el calendario de la demo
  renderiza cosas que dependen de la hora (hoy, indicador de "ahora", título de la semana).
  Cambios defensivos:
  1. Las dos páginas demo ya **no exportan `metadata`**: el `noindex` va como `<meta name="robots">`
     dentro de la página (React 19 lo sube al `<head>`; verificado en el HTML).
  2. `FullCalendar` de la demo se monta **solo en el cliente** (skeleton de la misma altura hasta el
     `useEffect`), así ningún valor dependiente de la hora puede diferir entre servidor y cliente.
- Hipótesis más probable para lo que vio el orquestador: bundles de servidor y cliente desfasados en el
  `next dev` del usuario, que estuvo levantado durante todas mis ediciones (Fast Refresh). **Hay que
  confirmarlo en Chrome con un `next dev` recién levantado** (punto 1 de la lista de abajo).

## Fase 7 — El flip — commit `b96d1a4`

- 7.1 Plugin: `:root` recibe **todos** los colores de `design-tokens.ts` (`cssVariablesFor(colors)`)
  + materiales + movimiento; `.theme-portal, :root:has(.theme-portal)` con `--grouped` cálido;
  `prefers-contrast: more` y `:root:has(.a11y-more-contrast)` con el separador `#C7C7CC`. Se borró
  el bloque `:root` viejo de `globals.css` y `.theme-warm` (queda solo `color-scheme: light`). Se
  retiró el alcance `:root:has([data-apple-preview])` (desvío D-2): el "flip" fue moverlo a `:root`.
- 7.2 `fontSize` `xs…4xl` = `legacyTypeScale` (valores directos, sin las variables con fallback de
  D-2), `borderRadius` = `radii` (sin `var(--radius)`), `boxShadow` sm=card, DEFAULT/md=float,
  lg/xl=modal.
- 7.3 `globals.css`: se borró la regla global de reduced-motion (todo a 0,01 ms) y quedó la política
  §7.7 en CSS (`scroll-behavior: auto`, toasts de Sonner solo con opacidad/altura; el resto ya estaba en
  los componentes: skeleton `motion-safe:animate-pulse`, tooltip sin zoom, press sin escala, overlays
  y sidebar en Motion). `body` con `text-body` y `font-optical-sizing: auto`. `#contenido > *` y
  `[data-portal-main] > *` con fundido de 150 ms. `:focus-visible` con `--ring` (ya estaba).
- 7.4 Tema de FullCalendar (§11) sin prefijo, reemplazando al anterior (se conservan
  `.fc-non-business` plano y la flecha del indicador oculta).
- 7.5 `lib/chart-theme.ts` sale de `chartPalette` (mismos exports y claves; `chartDefaultColor` pasa
  de tipo literal a `string`, sin efecto en los consumidores: tsc verde).
- Verificación: tsc web verde, `npm run test` 68/1341 verdes; `/inicio` y `/portal` sin sesión a 1366
  y 390 en Chrome sin errores de consola ni de hidratación; `body` 15/22 px `#1D1D1F`. Capturas en
  `docs/auditoria-apple/017a/despues/` (sobrescriben las de la fase 6).

## Fase 8 — Retirar lo viejo — commit `f8cbc9a`

- `theme-warm` fuera de `(portal)/layout.tsx` y `app/not-found.tsx` (D-3 cerrado);
  `data-apple-preview` fuera de las dos demos; export `newColorTokens` (ya sin uso) fuera de
  `design-tokens.ts`; comentarios de "hasta el flip" actualizados.
- Greps de §17.3 en `apps/web/src`, todos en 0 salvo lo esperado:
  - `theme-warm|var(--radius)` → 0. Valores Notion → 0 (solo el propio test que verifica que no estén).
  - `prefers-reduced-motion` → solo la política nueva (`globals.css` 2, `sidebar-layout.css` 1). `0.01ms` → 0.
  - `scaleX|previousBounds|clip-path` en `components/shell` → 0. `bg-primary/10` en `components` → 0.
  - `motion.div|from "framer-motion"` → 0. Hex en `components`, `globals.css`, `chart-theme.ts` (sin `brand.tsx`) → 0.
  - `dev-diseno` en `components/shell` y `lib` → 0. `data-apple-preview` → 0.
- 8.2 `tracking-tight` en los archivos de §14.1 → 0 (ya se había ido en las fases 4–6).
- 8.3 `sidebar-layout.css`: px solo en las media queries (`min-width: 1024px`) y en el borde de 1 px
  de más contraste.

## Fase 9 — Verificación final

```
npm run typecheck              → core, db, bot, web: sin errores
npm run test                   → Test Files 68 passed (68) · Tests 1341 passed (1341)
npm run lint -w apps/web       → 1 warning preexistente (ajustes/logo-form.tsx:36, alt-text), ninguno nuevo
./ops/harness/verify.sh        → Arnés OK (WARN "se tocó el bot" = los apps/bot/.whatsapp-auth.vieja* sin trackear, ajenos)
next build (apps/web, sin next dev levantado) → Compiled successfully, 41 rutas
```

- **La demo no existe en producción:** `/dev-diseno-portal` se prerenderiza como **404**
  (`.next/server/app/dev-diseno-portal.meta` → `"status": 404`, HTML con
  `NEXT_HTTP_ERROR_FALLBACK;404`). `/dev-diseno` es dinámica (está bajo el layout del panel, que lee
  la sesión) y su primera línea es `notFound()` cuando `NODE_ENV === "production"`; sin sesión el
  middleware redirige antes, así que el 404 con sesión queda para el recorrido. Ninguna navegación
  enlaza a las demos.
- First Load JS del build: `/` 339 kB, `/portal` 107 kB, `/pacientes` 146 kB, `/pacientes/[id]`
  362 kB, compartido 103 kB. No tengo la medición de antes (no se corrió `next build` antes de la
  HU), así que no puedo comparar contra el presupuesto de §17.1 (+≤ 45 KB gz). `domMax` se carga en
  diferido.
- Alcance contra `origin/develop`: 112 archivos; ninguno en la zona de imleticio, `packages/` ni
  `apps/bot/`.
- `next build` regeneró `apps/web/.next`: el próximo `npm run dev` recompila desde cero (ayuda a
  descartar la hipótesis de bundles desfasados).

### Commits de esta ronda

`f4f53ea` hidratación · `b96d1a4` fase 7 · `f8cbc9a` fase 8 · (este reporte va en un commit aparte).

## Recorrido pendiente en Chrome (orquestador, con sesión y `npm run dev` recién levantado)

Solo lectura: no guardar, no borrar, no enviar avisos, no "generar con IA". Con la consola abierta: el
criterio es **cero avisos de hidratación** y cero errores en cada pantalla (carga completa, no
navegación).

1. **Hidratación:** `/dev-diseno`, `/dev-diseno-portal`, `/pacientes`, `/` (recarga dura en cada
   una). Si `/dev-diseno` sigue avisando, copiar el diff completo del aviso (el primer nodo distinto,
   no solo los ids) al reporte.
2. **Escritorio 1366×768:**
   - `/` (calendario: botones gray, activo elevado; abrir "Nuevo turno" y cerrar con Esc a mitad de la
     animación; clic en un turno → sheet no modal, elegir otro turno sin cerrar).
   - `/disponibilidad` (abrir y cancelar agregar bloque).
   - `/servicios` (switch Activo: solo mirar el press; "Editar" → sheet, cerrar a mitad).
   - `/pacientes` (press de fila, header sticky).
   - `/pacientes/[id]` (las 7 pestañas: el indicador se desliza; Evolución: gráficos con colores nuevos).
   - Una consulta, su antropometría y el informe.
   - `/mensajes`, `/pagos` (StatTile), `/avisos`, `/asistente`, `/ajustes` (4 secciones) y `/ajustes/whatsapp`.
   - Una URL inexistente (404) y un `loading` con Network en Slow 3G.
   - Sidebar: colapsar/expandir dos veces rápido (invierte, el contenido no se estira); entra sin scroll
     (`nav.scrollHeight <= nav.clientHeight`); activo con fondo + color + peso + ícono.
3. **Zona de imleticio (solo mirar):** `/alimentos`, `/alimentos/[id]`, `/alimentos/nuevo` (sin
   enviar), `/plantillas`, `/plantillas/[id]`, `/pacientes/[id]/planes/[planId]`. Abrir el buscador
   de `food-picker` (su popover propio queda con sombra nivel 2 y radio 8, sin spring: esperado hasta
   017e) y el popover de kcal (material + spring desde el disparador).
4. **Móvil 390×844 con emulación táctil:**
   - `/` y `/pacientes/[id]`: topbar translúcida, línea que aparece al scrollear, pestañas sticky bajo `top-14`.
   - Menú: ítems de 44 px, cerrar arrastrando hacia la izquierda.
   - Inputs: tocar uno → `font-size` computado 16 px.
5. **Portal** (token de paciente, sin escribir): `/portal`, `/portal/plan`, `/portal/evolucion`,
   `/portal/diario` (no enviar) a 390, 768 y 1366. Revisar:
   - fondo cálido;
   - header y tab bar translúcidos, con el contenido pasando por debajo;
   - activo de la tab bar en azul oscuro y semibold;
   - inputs a 17 px.

   "Salir" al final; también el portal sin sesión.
6. **Accesibilidad del sistema:** macOS Reducir movimiento (sheet, modal, menú y pestañas con
   fundido; gráficos sin crecer; press solo de tono), Reducir transparencia y Aumentar contraste
   (chrome sólido, borde visible); Tab por sidebar, botones, pestañas, segmentado, switch e inputs
   (anillo azul), Dialog y Sheet con foco atrapado, Esc cierra y el foco vuelve al disparador.
7. **Producción (opcional):** con `next start` y sesión, `/dev-diseno` → 404.

# Ronda 2 (review CHANGES_REQUESTED, SDD §23)

## 1. Sheet congelado por un toque o un scroll — commit `a689f7f`

- La lógica del gesto pasó a un controlador puro, **`lib/dismiss-drag.ts`** (`createDismissDrag`, sin
  React ni Motion), y `primitives/use-dismiss-drag.ts` solo traduce los eventos de React.
- **`pointerdown` ya no llama a `value.stop()`.** La animación se detiene recién en el `pointermove`
  en que el gesto se **captura** (gana el eje del sheet después de 10 px). En ese momento el arrastre
  parte del valor presente: el "agarrar en vuelo" (§3) se mantiene para el arrastre real. Un toque,
  un scroll vertical que gana el eje cruzado, un `pointercancel` del navegador o un `pointerup` sin
  movimiento no tocan la animación, así que la entrada y la salida siguen solas.
- **Gestos con el sheet saliendo:** `sheet.tsx` pasa `enabled: dismissOnDrag && isPresent`.
  - Un gesto que empieza durante la salida se ignora por completo, así que nadie puede cortar la
    animación de salida (antes, en Motion 14, `stop()` no resolvía la promesa, `safeToRemove` no se
    llamaba y el scrim quedaba montado).
  - Si el sheet se cierra a mitad de un arrastre (Esc), el gesto se abandona sin restaurar y la salida
    manda.
- Tests: **`lib/dismiss-drag.test.ts`, 13 casos** con un MotionValue falso que cuenta los `stop()`:
  - Un toque, un movimiento menor a la histéresis, un scroll vertical y un `pointercancel` sin captura
    no detienen nada ni llaman callbacks.
  - Al capturar se detiene una sola vez y el arrastre parte del valor presente (sin salto); después
    sigue 1:1.
  - Hacia adentro, rubber-band.
  - Soltar lejos cierra y soltar cerca vuelve; un flick cierra con su velocidad.
  - Lado izquierdo.
  - Un gesto que empieza mientras el sheet sale no hace nada.
  - Si se cierra a mitad del arrastre, no se pelea con la salida.
  - Con mouse solo desde el handle; los inputs se ignoran; otro puntero no interfiere.

## 2. El scrim no bloquea la página durante la salida — commit `d3e7485`

- Nuevo **`primitives/modal-scrim.tsx`** (`ModalScrim`) con dos capas, que usan `dialog.tsx`,
  `alert-dialog.tsx` y `sheet.tsx`:
  - **Visual:** `bg-scrim` con `pointer-events-none` **siempre**. Hace su fundido de salida, o sigue
    el progreso del arrastre en el sheet.
  - **Overlay de Radix:** transparente; atrapa el clic afuera y lleva el `RemoveScroll`. Se desmonta
    **apenas empieza la salida** (`useIsPresent()` de Motion). Desde ese instante la página recibe
    clics y scroll; el `RemoveScroll` ya no dura toda la salida.
  - Se hizo así porque Radix fuerza `pointer-events: auto` en su Overlay, así que no alcanzaba con
    estilos sobre él.
- El **contenido** (dialog, alerta, sheet, popover, menú) lleva `data-[state=closed]:pointer-events-none`:
  mientras sale ya no se traga clics. Radix pone `data-state="closed"` aunque esté montado con
  `forceMount`.
- **Foco al desmontar:** nuevo `lib/overlay-focus.ts` con `preserveUserFocusOnClose`, que envuelve
  `onCloseAutoFocus` en los cinco overlays.
  - Primero corre el del consumidor.
  - Si el foco quedó en un elemento que el usuario eligió durante la salida (no `body` ni `html`), se
    previene la devolución automática al disparador.
  - Si el foco estaba adentro del overlay (al desmontarse el navegador lo pasa a `body`), Radix lo
    devuelve al disparador como siempre: el teclado (Esc, X, Enter en un ítem del menú) no cambia.
- Tests:
  - `lib/overlay-focus.test.ts`, 6 casos: body, html y null → devolver; un botón de la página → respetar;
    foco adentro → devolver; el handler del consumidor corre primero y su `preventDefault` manda.
  - `primitives/modal-scrim.test.tsx`, 2 casos (SSR con `PresenceContext`): presente → scrim visual
    con `pointer-events-none` + Overlay montado; saliendo → Overlay **desmontado** y scrim visual con
    `pointer-events-none`.
- `hideOthers` (el `aria-hidden` sobre el resto de la página) se sigue levantando al desmontar el
  contenido (~300 ms después de cerrar), como señaló la review. Queda así: no bloquea punteros.

## 3. Toaster — commit `6d177bb`

- El `li` del toast vuelve a llevar `group` y `toast` (los `group-[.toast]:` compilan a `.group.toast .x`)
  además de `group/toast` (íconos por `data-type`).
- Las clases quedan en un export `toastClassNames`.
- Verificado compilando con Tailwind: salen `.group.toast .group-\[\.toast\]\:text-subheadline`,
  `…!bg-primary` y `…!bg-secondary`.
- Test `primitives/sonner.test.ts` (2 casos): el `li` tiene `group`, `toast` y `group/toast`; la
  descripción y los botones usan `group-[.toast]:` y los íconos `group-data-[type=…]/toast:`.

## 4. Peso — commit `3cb5faf`

Medición con `next build` en **worktrees aparte** (`3457e3f` = antes y HEAD = después, en el
scratchpad, con el `node_modules` del repo enlazado; no se tocó el árbol ni el `.next` del `next dev`
del usuario, que estaba levantado; los worktrees se borraron al terminar).

Hay dos columnas porque la de Next es engañosa en el App Router: el "First Load JS" de su tabla no
cuenta los chunks de los layouts. Por eso también sumé el gzip de **todos** los chunks iniciales de
la ruta (layout raíz + layout del grupo + página, desde `app-build-manifest.json`).

| Ruta | Antes (`3457e3f`) | Después, 1ª medición | Después, final (`3cb5faf`) | Δ final |
|---|---|---|---|---|
| `/` (tabla de Next) | 279 kB | 339 kB | 313 kB | **+34 kB** |
| `/` (todos los chunks iniciales, gz) | 299,2 KB | 357,4 KB | 336,8 KB | **+37,6 KB** ✓ |
| `/portal` (tabla de Next) | 107 kB | 107 kB | 107 kB | 0 |
| `/portal` (todos los chunks iniciales, gz) | 128,4 KB | 177,1 KB | 148,0 KB | **+19,6 KB** ✓ |
| `/pacientes/[id]` (todos, gz) | 321,8 KB | 382,4 KB | 361,9 KB | +40,1 KB |
| `/inicio` (todos, gz) | 110,4 KB | 135,5 KB | 135,5 KB | +25,1 KB |

- **La primera medición pasaba el presupuesto** (`/` +58 KB). Diagnóstico con un volcado de stats de
  webpack en el worktree:
  - `motion/dist/es/react.mjs` (la entrada `motion/react` de Motion 14) hace
    `const motion = fm.motion; const m = fm.m;` a nivel de módulo.
  - Eso marca como usado el componente `motion` completo, que trae **todas** las features (drag,
    gestos, layout, proyección: ~31 KB gz).
  - Esas features quedaban en un chunk inicial aunque solo usamos `m` + `LazyMotion` con `domMax` en
    diferido.
  - No era `domMax` en sí: probé importarlo por ruta interna y no cambió nada.
  - `optimizePackageImports` tampoco cambió nada.
- **Arreglo (desvío D-4, documentado en `next.config.mjs`):**
  - Alias `"motion/react$" → "framer-motion"` en webpack, y el mismo `turbopack.resolveAlias` para que
    desarrollo resuelva igual.
  - `motion/react` es exactamente `export * from "framer-motion"` más esas dos re-ligaduras: mismos
    exports, misma versión 14.0.0, que trae `motion`. No hay dependencia nueva y el código sigue
    importando de `"motion/react"` (el grep de §17.3 sigue en 0).
- Además, `animate()` pasó a `animateSingleValue()` en `sheet.tsx`, `use-dismiss-drag.ts` y la demo
  (anima un MotionValue sin el animador de elementos del DOM; −5 KB).
- Resultado: `/` +37,6 KB y `/portal` +19,6 KB gz, **dentro del presupuesto de +≤ 45 KB**. El root
  layout ahora suma ~10,8 KB gz de Motion (`LazyMotion`, `MotionConfig`, `m`). Las features siguen
  cargándose en diferido (chunk async de `motion-features`).
- El `next dev` del usuario reinició solo con el cambio de `next.config.mjs`: `/inicio` y `/portal`
  siguen respondiendo 200.

## 5. Defecto del recorrido: rueda durante la entrada + Esc → el sheet no se desmonta — commit `3ed662d`

Ver `progress/recorrido_HU-017a-ronda2.md`.

- **No lo pude reproducir.** Armé una réplica pública temporal con el shell real: `AppSidebar` +
  `MobileTopbar` + `TooltipProvider`, con `PathnameContext` en `/alimentos` para que el ítem activo
  tenga su `m.span layoutId` adentro del sheet. La probé con Playwright en Chrome real a 390×844, con
  y sin emulación táctil, con 0 y 200 ms antes de la rueda y con la página en segundo plano. Los
  pasos fueron: abrir el menú, 2 ticks de rueda en (120, 500), esperar 1 s, Esc y esperar 3 s. Las 6
  corridas terminaron con 0 `[role=dialog]`, 0 `[data-scrim]` y el foco en "Abrir menú". Borré la
  réplica.
- **La rueda no pasa por `dismiss-drag`:** no genera `pointerdown` y los `pointermove` sin
  `pointerdown` se ignoran (test).
- **Lo que muestra el estado reportado:** `left = -4` con `data-state="closed"` (o `-305` con el scrim
  al 4,5 %) indica que la animación de salida **quedó detenida a mitad** y que su promesa no resolvió.
  En Motion 14, `then` no resuelve si la animación se frena, y tampoco avanza si el navegador no da
  cuadros (pestaña en segundo plano o tapada, como puede pasar con la pestaña que maneja la extensión).
  Sin resolver, `safeToRemove` no se llama nunca.
- **Arreglo (no depende de la causa exacta):**
  1. **La salida del sheet siempre termina.** Nuevo `lib/sheet-exit.ts` (`runExit`):
     - Arranca la animación de salida y llama a `safeToRemove` una sola vez, cuando la animación termina.
     - Si no termina, lo hace a los 1000 ms (`SHEET_EXIT_TIMEOUT_MS`, springs de ~0,3 s + margen):
       primero frena la animación y deja el valor en su destino (`jump`), después desmonta.
     - Si el sheet se reabre a mitad de la salida, se cancela.
     - Si no se puede medir el panel, el destino es el ancho o alto del viewport (antes era 0, o sea la
       posición de abierto).
  2. **El foco nunca queda en un panel cerrado.**
     - Al empezar la salida, si el foco está adentro del panel se le hace `blur()`, y el panel queda
       `inert` (fuera del orden de foco y del árbol de accesibilidad) mientras sale.
     - Al desmontar, Radix devuelve el foco al disparador, o lo deja donde el usuario lo puso.
     - Lo mismo para Dialog y AlertDialog con `ExitFocusGuard` (en `modal-scrim.tsx`): al empezar la
       salida saca el foco del contenido y lo marca `inert`.
     - Verificado en la réplica: después de Esc el foco pasa a `body` y, al desmontar, a "Abrir menú".
  3. **El menú del celular ya no usa `layoutId`** para el ítem activo (`SidebarContent` con
     `density="touch"` dibuja un fondo fijo). Ahí no hay nada que deslizar: el menú se cierra al
     navegar. Así no quedan nodos de proyección (`MeasureLayout`, que también se registra en
     `AnimatePresence`) adentro de un sheet que sale. La sidebar de escritorio conserva el indicador
     que se desliza.
- **Tests:** `lib/sheet-exit.test.ts`, 4 casos:
  - desmonta cuando termina la animación, una sola vez;
  - **si la animación no termina nunca, desmonta igual a los 1000 ms** (la frena, deja el valor en el
    destino y no llama dos veces si resuelve tarde);
  - reabrir a mitad de la salida cancela;
  - **"evento sin captura durante la entrada y después cerrar → se desmonta"**: toque y scroll vertical
    sin captura en la entrada, movimientos sin botón y un gesto durante la salida no frenan nada, y la
    salida, aunque no avance, termina con `onDone` y el valor en el destino.
- **Para el orquestador:** repetir exactamente los pasos del recorrido. Después de Esc, en ≤ 1 s tiene
  que haber 0 `[role=dialog]` y 0 `[data-scrim]`, con el foco en "Abrir menú". Repetir con la variante
  (rueda sobre la página después de Esc). Si **antes** de 1 s se consulta
  `document.activeElement`, tiene que ser `body`, no "Cerrar sesión".

## 6. Sidebar a 1366×768 (mismo commit)

- Los títulos de grupo pasan de `pt-3`/`pb-1` a `pt-2`/`pb-0.5` (el primero `pt-1.5`) y el `nav` de
  `pb-2` a `pb-1`. Los ítems no cambian: 32 px en escritorio y 44 px en el menú táctil.
- Medido en la réplica con Chrome real a 1366 de ancho:

| Alto del viewport | header + contenido del nav + pie | Alto del `nav` | ¿Entra sin scroll? |
|---|---|---|---|
| 768 | 56 + 567 + 129 = 752 | 567 | sí |
| 650 (la barra del navegador a 1366×768) | 56 + 449 + 129 = 634 | 449 | sí: `scrollHeight` 449 = `clientHeight` 449 |

- Antes, a 650 px, el contenido del nav era 467 y sobraban 18 px de scroll. El contenido total es
  634 px: entra hasta en un viewport de ~650 px (la `aside` tiene 16 px menos por el padding del layout).

## Verificación ronda 2

```
npm run typecheck              → core, db, bot, web: sin errores
npm run test                   → Test Files 73 passed (73) · Tests 1368 passed (1368)  (+27 tests nuevos en la ronda)
npm run lint -w apps/web       → 1 warning preexistente (ajustes/logo-form.tsx:36), ninguno nuevo
./ops/harness/verify.sh        → Arnés OK (WARN "se tocó el bot" = apps/bot/.whatsapp-auth.vieja* sin trackear)
next build (worktree de HEAD 3cb5faf; el `next dev` del usuario seguía levantado sobre el árbol)
                               → OK; único warning el preexistente de `jose` en Edge (también en 3457e3f);
                                 /dev-diseno-portal prerenderiza 404
```

- Nota: el `next build` de la ronda anterior había dejado `apps/web/.next/types/validator.ts`, que
  chocaba con los tipos que genera el `next dev` (tsc fallaba en `.next/types`). Lo borré: es un
  artefacto del build y se regenera.

## Recorrido para el orquestador en Chrome (ronda 2)

Con sesión, `npm run dev` y la consola abierta (cero errores y cero avisos de hidratación). Emulación
táctil en DevTools para los puntos 1 a 3.

1. **Sheet, toque o scroll a mitad de la entrada** (390×844, táctil):
   - Abrir el menú (hamburguesa) y, **antes de que termine de entrar** (~350 ms), tocar el panel o
     empezar a scrollear la lista en vertical. Tiene que terminar de entrar y quedar abierto, nunca
     clavado a mitad.
   - Repetir en `/servicios` → "Editar" (sheet derecho) y en `/dev-diseno-portal` → "Registrar una
     comida" (sheet inferior: tocar el grabber o el título durante la entrada, también con mouse).
2. **Sheet, toque a mitad de la salida:** cerrar el menú (X o tocando afuera) y tocar o arrastrar el
   panel mientras sale.
   - Tiene que terminar de salir.
   - El scrim desaparece y la página **recibe clics y scroll enseguida**: tocar un link de la página
     durante la salida tiene que funcionar.
   - Nada queda montado: en Elements no queda ningún `[data-scrim]` después de ~0,5 s.
3. **Arrastre real (sigue igual):** arrastrar el menú hacia la izquierda y soltar a mitad (vuelve),
   flick (cierra con la velocidad del dedo), agarrar el sheet mientras entra con un arrastre
   horizontal (lo toma desde donde está).
4. **Clic en la página durante la salida de un dialog** (1366×768, mouse):
   - En `/` abrir "Nuevo turno", cerrar con Esc e **inmediatamente** hacer clic en un botón o link de
     la página (p. ej. "Hoy" del calendario o un ítem de la sidebar). El clic tiene que actuar.
   - Si es un input o un botón, el foco tiene que quedar ahí: no saltar de vuelta a "Nuevo turno".
   - Lo mismo con la confirmación de `/dev-diseno` ("Confirmar destructivo" → Cancelar → clic
     inmediato en otro botón).
   - Con teclado: abrir el dialog, Esc → el foco vuelve al botón que lo abrió.
5. **Scroll durante la salida:** con un dialog abierto, cerrarlo y scrollear con la rueda enseguida:
   la página scrollea (el `RemoveScroll` ya no dura toda la salida).
6. **Toasts** (`/dev-diseno` → Overlays): `notify.saved`, `notify.error` y `notify.info`. Material
   flotante, ícono verde, rojo o azul y texto callout. (La descripción, la acción y cancelar solo se
   ven si alguien las usa; hoy `notify` no las usa.)
7. **Sidebar a 1366×768** (§10.1, 0.4/6.3):
   - En DevTools, sobre `nav[aria-label="Principal"]`:
     `$0.scrollHeight <= $0.clientHeight` → `true`, con todos los grupos y el pie a la vista sin scroll.
   - Colapsar y expandir dos veces rápido: invierte sin frenazo y el texto del workspace no se estira.
   - Clic en otro ítem: el indicador azul se desliza al instante. Fijarse si la escala de press del
     ítem (`press-sm`) produce un salto del indicador (duda de la review). Si se nota, se saca la
     escala en ítems con indicador.
8. **Movimiento reducido real** (macOS → Reducir movimiento): repetir 1, 2 y 4. Todo con fundidos, sin
   desplazamientos, y nada queda clavado.
9. **Regresión rápida:**
   - Popover de kcal en un plan (zona de imleticio, solo abrir y cerrar): clic afuera durante la salida
     → el clic actúa.
   - Menú "…" de la demo: elegir un ítem con Enter → el foco vuelve al botón "…".

# Ronda 3 (review ronda 2 CHANGES_REQUESTED, SDD §24, último reintento)

## 1. Dialog/AlertDialog reabierto durante la salida quedaba `inert` — commit `15e7fc7`

- `ExitFocusGuard` (`modal-scrim.tsx`) ahora delega en `applyExitGuard` (`lib/overlay-focus.ts`, puro):
  - Al salir: `inert = true` y, si el foco estaba adentro, `blur()`.
  - **Al volver a estar presente:** `inert = false`. `AnimatePresence` re-presenta la misma instancia
    si se reabre antes de que termine la salida.
- Tests (`overlay-focus.test.ts`): salir con el foco adentro, salir con el foco afuera, y
  **cerrar y reabrir a mitad → deja de ser `inert`**.
- Caso en la demo: `/dev-diseno` → Overlays → **"Cerrar y reabrir a mitad"**. Abre un dialog, lo
  cierra a los 700 ms y lo reabre a los 820 ms, con la salida todavía en curso. Hay que poder escribir
  en el campo.

## 2. El foco vuelve al botón que abrió el overlay (sin `Trigger` de Radix) — commit `e46e214`

- Nuevo `lib/use-return-focus.ts`: `useOverlayOpenInfo(open)` en el Root de Dialog, AlertDialog y
  Sheet. Su efecto de layout, al pasar `open` a `true`, guarda dos cosas:
  - el elemento que tenía el foco: corre antes del efecto del `FocusScope` de Radix, que mueve el foco
    (además el Portal de Radix monta el contenido un commit después);
  - el instante de la apertura.

  Lo comparten por `OverlayOpenInfoContext`.
- `preserveUserFocusOnClose(handler, { returnTo })` en `onCloseAutoFocus`:
  1. Corre el handler del consumidor.
  2. Si el usuario eligió otro elemento durante la salida, se respeta (como antes).
  3. Si no, deja que Radix haga lo suyo (enfocar su `Trigger`, si hay) y en un microtask, si el foco
     quedó en `body` y el elemento guardado sigue conectado, lo enfoca (`restoreFocus`).

  Cubre `Modal` ("Nuevo turno", disponibilidad, pagos), `useConfirm` y el sheet de
  `servicios/service-card.tsx` sin tocar pantallas.
- **Hallazgo al verificarlo en el navegador:** reabrir un dialog durante su salida (clic en "Nuevo
  turno" ~100 ms después de Esc) lo volvía a cerrar al instante. La traza mostró el camino:
  - el `pointerdown` de ese mismo clic ocurrió con el dialog cerrado;
  - Radix lo despacha como "pointerdown afuera" (en ese camino, recién en el `click`), cuando el dialog
    ya se había reabierto;
  - eso llama a `onDismiss`.

  Arreglo:
  - `ignoreOutsideBeforeOpen` en `onPointerDownOutside` de Dialog y Sheet: si el evento original es
    anterior a la última apertura, se ignora.
  - Un clic afuera real, con el overlay abierto, sigue cerrando.
  - AlertDialog no cierra con clic afuera, así que no lo necesita.
- Tests (`overlay-focus.test.ts`, 18 en total):
  - `restoreFocus`: foco en body → enfoca; foco real → no lo pisa; disparador desconectado → nada.
  - "Esc en un overlay controlado → vuelve al botón".
  - "el usuario tocó otro control → no se le devuelve".
  - "con `Trigger` de Radix → no hace nada extra".
  - `startedBeforeOpen` e `ignoreOutsideBeforeOpen`: el toque previo a la reapertura no cierra; un clic
    afuera posterior sí.
- **Verificación en Chrome real (Playwright, `channel: "chrome"`).** Usé una ruta pública temporal
  (ya borrada) con `Modal`, un `Sheet` controlado y `useConfirm`, como "Nuevo turno", "Editar
  servicio" y "Borrar":

| Caso | Resultado |
|---|---|
| Teclado: Tab + Enter en el botón → Esc | el foco vuelve a "Nuevo turno", "Editar" y "Borrar" |
| Clic con mouse → Esc | el foco vuelve a "Nuevo turno" |
| Esc → clic en "Nuevo turno" a los ~80 ms (mouse y táctil) | queda `open`, sin `inert`, el campo acepta texto |
| Clic afuera con el overlay abierto (mouse y táctil, dialog y sheet) | cierra; al final 0 `[role=dialog]` |

## 3. `framer-motion` declarado — commit `26796b6`

- `node_modules/motion/package.json` depende de `framer-motion` **14.0.0** exacto. Se declaró igual
  en `apps/web/package.json` (`npm install framer-motion@14.0.0 --save-exact --workspace apps/web`).
- `package-lock.json` cambió en +1 línea: hay una sola entrada `node_modules/framer-motion`, y
  `npm ls` muestra la de `motion` como `deduped`.
- El comentario del alias en `next.config.mjs` lo menciona.

## Verificación ronda 3

```
npm run typecheck              → core, db, bot, web: sin errores
npm run test                   → Test Files 73 passed (73) · Tests 1380 passed (1380)  (+12 en la ronda)
npm run lint -w apps/web       → 1 warning preexistente (ajustes/logo-form.tsx:36), ninguno nuevo
./ops/harness/verify.sh        → Arnés OK (WARN "se tocó el bot" = apps/bot/.whatsapp-auth.vieja* sin trackear)
next build (apps/web, sin ningún next dev levantado) → OK; único warning el preexistente de `jose`
                               en Edge; /dev-diseno-portal prerenderiza 404
```

- Borré `.next/types` dos veces: lo dejan desfasado el `next dev` de la ruta temporal y el build, y
  `tsc` lo incluye. Es generado: se regenera solo.

Peso, sumando todos los chunks iniciales de la ruta, gzip (misma medición que la ronda 2):

| Ruta | Antes (`3457e3f`) | Ahora | Δ | Presupuesto |
|---|---|---|---|---|
| `/` | 299,2 KB | 337,9 KB | +38,7 KB | ✓ +≤ 45 |
| `/portal` | 128,4 KB | 148,1 KB | +19,7 KB | ✓ +≤ 45 |
| `/pacientes/[id]` | 321,8 KB | 363,6 KB | +41,8 KB | — |

En la tabla de Next: `/` 314 kB (antes 279) y `/portal` 107 kB (igual).

## Para el orquestador en Chrome (ronda 3)

Con sesión, `npm run dev` recién levantado (hay un `.next` de producción del build) y la consola
abierta (0 errores, 0 avisos de hidratación).

1. **Reabrir enseguida (1366×768):**
   - En `/`, clic en "Nuevo turno", Esc e **inmediatamente** clic otra vez en "Nuevo turno" (antes de
     ~300 ms). El dialog queda abierto y se puede usar: Tab entre campos, escribir. No tiene que
     cerrarse solo ni quedar inerte; en Elements, sin `inert` en el contenido.
   - Repetir en `/dev-diseno` con "Cerrar y reabrir a mitad".
   - Repetir a 390×844 con emulación táctil.
2. **El foco vuelve al botón que abrió** (teclado: llegar con Tab y abrir con Enter):
   - `/servicios` → "Editar" de un servicio → Esc: foco en ese "Editar".
   - `/` → "Nuevo turno" → Esc: foco en "Nuevo turno".
   - Un "Borrar" con confirmación (p. ej. un bloque en `/disponibilidad`) → Cancelar o Esc: foco en
     ese "Borrar". **No confirmar.**
   - Con mouse: abrir y cerrar con Esc → mismo resultado.
3. **Sin regresiones:**
   - Clic afuera con un dialog o sheet abierto lo cierra.
   - Esc durante la salida y clic en otro control: el foco queda en ese control.
   - El menú móvil (sheet izquierdo con `SheetTrigger`) devuelve el foco a la hamburguesa.
   - Los pasos de la ronda 2 (rueda en la entrada + Esc → se desmonta en ≤ 1 s).
4. **Sidebar a 1366×768:** `nav[aria-label="Principal"]` → `scrollHeight <= clientHeight`.
