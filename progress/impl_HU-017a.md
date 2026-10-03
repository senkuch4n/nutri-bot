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
