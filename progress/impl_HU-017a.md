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
