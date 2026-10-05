# Review — HU-017d (entrega 017d-1: acceso, inicio y evolución)

**Veredicto:** APPROVED

Diff revisado: `git diff feat/hu-017b4-ajustes...HEAD` (merge-base = punta de 017b-4, `266f3ac`), commits
`90596bb`..`db3b9b4`, sin los archivos del arnés. Comandos corridos por el reviewer (no se tomó lo del reporte):

| Comando | Resultado |
|---|---|
| `npm run typecheck` | exit 0 (core, db, bot, web) |
| `npm run test` | exit 0, 129 archivos, 2103 tests |
| `npm run lint --workspace apps/web` | "No ESLint warnings or errors" |
| `./ops/harness/verify.sh` | exit 0, "Arnés OK" (el WARN del bot es porque cambió core; `apps/bot/**` sin diff) |
| Base de dev (solo lectura) | 0 filas `Patient`/`EvolutionEntry`/`Appointment` con id `hu017d%` |

## Checkpoints

### C1 — Arnés
- [x] `backlog/` válido; senkuch4n tiene una sola HU activa (HU-017d `en_revision`); imleticio ninguna activa.
- [x] `progress/current-senkuch4n.md:259-263` refleja la HU en curso.
- [x] El diff no toca archivos de imleticio: el grep de la zona de T6 (`alimentos/`, `plantillas/`, `pacientes/[id]/planes/`, `food-picker`, `meals-editor`, `macro-totals`, `meal-view`, `plan-pdf`, `weekly-menu`, `day-selector`) sale vacío.
- [x] `./ops/harness/verify.sh` exit 0.

### C2 — Cadena de documentos
- [x] `docs/hu-017d-portal.md` completo, con las Resoluciones D1–D20.
- [x] `Refactorizaciones/017d-portal.md` con workspaces, checklist por fase y contrato.
- [x] Firmas iguales al contrato 4.1–4.5: `packages/core/src/portal.ts` (todas las funciones y `PORTAL_TEXT` textuales), `lib/shell.ts:31` `getProfessionalPortalContact`, `portal-access.tsx:13,37`, `portal-card-link.tsx:6`, `portal-logout-button.tsx:10`. Lo que se sumó (`portalDocumentTitle`, `getPortalDocumentTitle`, `lib/evolution-chart-rows.ts`) son funciones nuevas que no cambian ninguna firma existente. `export * from "./portal"` es la última línea de `packages/core/src/index.ts` (T2/T11) y no choca con ningún otro export de core.

### C3 — Arquitectura
- [x] Lógica pura en `packages/core/src/portal.ts`, con test. Las consultas solo del portal van en las páginas, con `select` de lo justo (T3). `packages/db` sin diff.
- [x] `schema.prisma` y `packages/db/domain` sin cambios; bot y web compilan.
- [x] Sin migraciones (T1).
- [x] El portal expone solo datos de la paciente:
  - Todas las consultas filtran por `patient.id`, que sale de `getPortalPatient()` (cookie con HMAC, sin cambios). No hay ids en la query ni en los params.
  - **D2:** `evolucion/page.tsx:175` hace `select { id, recordedAt, weightKg, heightCm }`, sin `note`, así que la nota no llega ni al payload RSC. `portalEvolutionRows` arma objetos con exactamente 4 claves (test `Object.keys` en `portal.test.ts:256-259`).
  - El inicio (`page.tsx:357-374`) usa `select` en las tres consultas y en el conteo. El plan solo lee `title`.
  - No hay kcal ni macros en ningún lado (test de lenguaje en `portal.test.ts:264`).
  - La pantalla sin sesión y `generateMetadata` muestran solo el nombre y el WhatsApp de la profesional, que son públicos.
- [x] Seguridad del token y del link vencido (D8):
  - `login/route.ts`, `logout/route.ts`, `patient-session.ts` y `middleware.ts` no tienen diff.
  - `?error=invalid` solo elige el texto (`portal-access.tsx:14`) y no muestra nada de la query.
  - `/portal?error=invalid` con una cookie válida entra al inicio, como decide la SDD (4.3).
  - El fallback del `Suspense` (`layout.tsx:49-55`) es la variante "no-link": no da acceso y solo cambia el texto.
- [x] El bot no cambia (`apps/bot/**` y `messages.ts` sin diff).
- [x] Sin `console.log` ni TODOs.

### C4 — Verificación
- [x] `npm run typecheck` limpio (corrido por el reviewer).
- [x] `portal.test.ts` cubre todo lo de 9-1, más `portalDocumentTitle`. `portal-access.test.tsx` y `evolution-chart-rows.test.ts` están. `npm run test` pasa.
- [x] Flujo del bot: no aplica (no se tocó). El runtime con turnos corrió con el bot apagado y limpió por id. Los conteos del reporte coinciden antes y después, y la base no tiene filas `hu017d%`.
- [x] PDF: no aplica.

### C5 — Cierre
- [x] `progress/impl_HU-017d.md` describe archivos, commits, verificación, datos de prueba y las correcciones del recorrido.
- [x] `progress/review_HU-017d.md`: este archivo.
- [x] No quedan scripts sueltos ni datos de prueba. En `git status` solo están los archivos ajenos que ya había antes, sin trackear.

## Puntos que pidió mirar el orquestador

1. **Datos que no debe ver (macros, notas D2, otras pacientes):** OK (ver C3).
2. **Token y link vencido (D8):** OK (ver C3).
3. **Q4, `primitives/sheet.tsx:133-156`:**
   - La API no cambia.
   - `onDismiss` solo lo dispara `useDismissDrag` desde `onPointerUp`, que es un evento discreto de React. El `setOpen(false)` se aplica antes del `requestAnimationFrame`.
   - Sin veto: `SheetContext.open` pasa a false, o `usePresence` da `isPresent=false`. Las dos cosas vuelven a dibujar `SheetPanel`, así que `stillOpenRef` queda en false y el rAF no hace nada. La salida sigue como antes, con `exitVelocity` intacto.
   - Con veto: no hay re-render y el ref sigue en true. `offset` vuelve a 0 con `springs.standard`, o con `fades.fast` si hay movimiento reducido.
   - Los sheets del panel que no vetan (017a/b/c) no cambian. `ServiceSheet`, que veta, queda arreglado.
4. **Gráfico (`9831216`, `evolution-chart.tsx:89-92`):** `isAnimationActive={false}` siempre, así que con movimiento reducido no hay crecimiento (escenario de la HU cumplido) y no depende de rAF. Las props no cambian. `evolutionChartRows` pasa los valores a número y tiene test.
5. **Props de servidor a cliente:**
   - `PortalAccessGate` y `PortalAccessScreen` reciben strings o null.
   - `PortalLogoutButton` no recibe props.
   - `PortalCardLink`, `Metric`, `EmptyState` (con `icon={TrendingUp}`), `GroupedList` y `StatusScreen` son server-safe: sus archivos no tienen `"use client"`.
   - `ConfirmProvider` (cliente) recibe solo `children`.
   - `EvolutionChart` recibe `{date: Date, value: number}[]`, que se serializa.
6. **`ConfirmProvider` en `(portal)/layout.tsx:76-93`:** envuelve header, `main`, `PortalNav` y `Toaster`, solo cuando hay paciente (como pide 4.3). `useConfirm` se llama en `onClick` (`portal-logout-button.tsx:15-23`), no en una transición.
7. **Zona de imleticio:** intacta (C1).

## Cambios requeridos

Ninguno.

## Dudas (no bloqueantes)

- **Desvío de T5 en el panel:** `evolution-chart.tsx:92` saca la animación de crecimiento **también** en el panel y sin movimiento reducido. La SDD pedía `isAnimationActive={!reduced}` y "el panel queda igual salvo con movimiento reducido". El cambio lo pidió el orquestador en el recorrido (barras en 0 sin rAF), está documentado en el reporte y es más robusto. Conviene anotarlo como decisión en la SDD o en la historia para que 017d-2/3 no lo reviertan.
- **Q4 sin prueba de runtime ni test unitario:** queda para el runtime de 017d-2 ("Anotar comida" con texto → arrastrar → "¿Descartar…?" → Cancelar). Un caso borde teórico: si un dueño cierra el sheet en forma asíncrona, después del cuadro, el panel volvería a 0 y después saldría sin la velocidad del fling. Es un detalle visual, sin pérdida de estado.
- **D20 (contraste de las tarjetas con el brillo bajo) y D19 (prueba con la mamá en un celular real):** `progress/recorrido_HU-017d.md` no los menciona. Quedan pendientes del orquestador o del usuario.
- `ComparativeChart` y `StudyComparisonChart` del panel siguen con la animación de Recharts. Pueden arrancar con las barras en 0 en una pestaña en segundo plano. Está fuera de alcance; lo anotó el implementer.
