# Review — HU-017a (Rediseño Apple 1/5: fundaciones y shell)

**Veredicto:** CHANGES_REQUESTED

Diff revisado: `git diff 3457e3f..HEAD` en `feat/hu-017-rediseno-apple` (10 commits, f404ed6…ec3de99).
Fuentes: SDD `Refactorizaciones/rediseno-apple-fundaciones.md` (§21 y §22 mandan), `progress/impl_HU-017a.md`,
`progress/recorrido_HU-017a.md`, `CHECKPOINTS.md`.

Comandos que corrí yo (2026-10-03):

```
npm run typecheck              → core, db, bot, web: exit 0
npm run test                   → 68 files, 1341 tests, exit 0
npm run lint --workspace apps/web → exit 0; solo el warning preexistente ajustes/logo-form.tsx:36 (alt-text)
./ops/harness/verify.sh        → "Arnés OK", exit 0 (WARN "se tocó el bot" = apps/bot/.whatsapp-auth.vieja* sin trackear, ajenos)
```

Greps de §17.3 en `apps/web/src`: todos en 0 salvo lo esperado (`prefers-reduced-motion` solo en la política
nueva: `globals.css:38`, `globals.css:103`, `sidebar-layout.css:165`; los valores Notion solo dentro del test
que verifica que no estén). Sin `motion.*`/`framer-motion` directos, sin hex fuera de `design-tokens.ts`,
sin `data-apple-preview`, sin `theme-warm`, `dev-diseno` no aparece en `components/` ni `lib/`.
Alcance: ningún archivo de la zona de imleticio, de `packages/**`, `apps/bot/**`, PDF ni server actions;
ninguna pantalla existente fue editada (solo layouts, `not-found`, `global-error`, raíz y las demos).

## Checkpoints

### C1 — El arnés está sano
- [x] `backlog/` válido; senkuch4n tiene 1 HU activa (HU-017a, `en_revision`) — lo confirma verify.sh.
- [x] `progress/current-senkuch4n.md` refleja la HU (entradas del 2026-10-03).
- [x] El diff no toca archivos de HU de la otra persona.
- [x] `./ops/harness/verify.sh` exit 0.

### C2 — Cadena de documentos
- [x] `docs/hu-rediseno-apple.md` (paraguas validado, fila HU-017a, 7.1, Resoluciones).
- [x] `Refactorizaciones/rediseno-apple-fundaciones.md` con workspaces, checklist atómico y contrato (§6).
- [x] Firmas coinciden con §6.2/§6.3. Solo props opcionales (`SheetContent.dismissOnDrag`,
      `DropdownMenuItem.variant`, `SidebarContent.density`, `PortalNav.activeHref`, `useDismissDrag.reducedMotion`),
      valores nuevos en uniones (`ButtonVariant` `tinted|plain`, `buttonVariants` `tinted|plain|destructive-tinted`,
      `icon-sm|icon-lg`) y exports nuevos documentados en impl (`closeButtonClass`, `SIDEBAR_WIDTH`,
      `ScrollEdgeHeader`, `useExitSnapshot`, `moreContrastOverrides`, `overlayAlpha`). `chartDefaultColor` pasa
      de literal a `string` sin efecto en consumidores (tsc verde). `Dialog`/`AlertDialog`/`Popover`/`DropdownMenu`/
      `Sheet`/`Tabs`/`Switch` pasan a wrappers con la misma firma del Root de Radix.

### C3 — Arquitectura
- [x] Helpers puros de presentación en `apps/web/src/lib` con tests (D-T9; la HU deja `packages/**` fuera).
- [x] Sin cambios en `schema.prisma` ni `packages/db/domain` (N/A).
- [x] Sin migraciones (N/A).
- [x] Rutas nuevas: `/dev-diseno` (bajo `(panel)`) y `/dev-diseno-portal` quedan cubiertas por el matcher del
      middleware (`middleware.ts:8`, no empiezan con `portal`), `notFound()` en producción como primera
      línea (`(panel)/dev-diseno/page.tsx:38`, `dev-diseno-portal/page.tsx:6`), `<meta name="robots"
      content="noindex, nofollow">`, sin links en ninguna navegación. El portal no expone ids.
- [x] Bot sin cambios (N/A).
- [x] Sin `console.log` ni TODOs nuevos.

### C4 — Verificación real
- [x] `npm run typecheck` limpio (corrido por mí).
- [x] Tests: no se tocó `packages/core`; los helpers nuevos tienen vitest (`contrast` 7, `design-tokens` 77,
      `motion` 11 `it` / 20 casos, `utils` 3) con los casos de §16; `npm run test` verde.
- [x] Flujo del bot: N/A.
- [x] PDF: N/A (no se tocaron).

### C5 — Cierre de sesión
- [x] `progress/impl_HU-017a.md` describe fases, archivos, desvíos y verificación.
- [x] `progress/review_HU-017a.md` (este archivo).
- [x] Sin scripts de prueba sueltos (los smoke SSR y las rutas temporales se borraron; no hay archivos nuevos
      fuera de los de §14.2 + agregados documentados). Nada escribió en la base.

Los checkpoints pasan, pero el foco pedido en los puntos 2 (Radix + Motion, arrastrar para cerrar) y 4 (toasts)
tiene tres defectos concretos de código. Se describen abajo.

## Cambios requeridos

1. **Sheet: un toque durante la entrada o la salida congela el sheet**
   (`components/primitives/use-dismiss-drag.ts:80`, `:61`, `:100`; `components/primitives/sheet.tsx:187`, `:211`).
   `onPointerDown` llama a `value.stop()` siempre, antes de saber si hay arrastre. Si después no se captura
   (un tap, un scroll vertical que gana `"cross"` en `:100`, o un `pointerup` sin moverse), `finish()` vuelve en
   `:61` sin restaurar nada.
   - **Durante la entrada** (springs.standard ≈ 350 ms), un toque o un scroll en el menú móvil (`side="left"`,
     acepta táctil desde cualquier punto) deja el sheet clavado a mitad de camino. El patrón es frecuente: se
     abre el menú y se empieza a scrollear enseguida. Con el mouse pasa lo mismo en el grabber o el
     `SheetHeader` de un sheet inferior.
   - **Durante la salida**, los handlers siguen montados (`sheet.tsx:211`). Si se toca el panel mientras sale,
     `value.stop()` corta la animación de `sheet.tsx:187`. En Motion 14, `stop()` **no** resuelve la promesa
     (`motion-dom/.../JSAnimation.mjs:45-54`: `teardown()` sin `notifyFinished()`), así que `safeToRemove`
     no se llama nunca. El sheet queda montado con `open=false`. Si es modal, el scrim también queda montado
     con `pointer-events: auto` (ver punto 2) y `RemoveScroll` activo, y bloquea la página entera.
   - Qué cambiar: solo detener la animación cuando el gesto se captura de verdad (o, si se detuvo y no hubo
     captura, retomar hacia el destino vigente: 0 si está presente, `size` + `safeToRemove` si está
     saliendo), e ignorar o completar correctamente los gestos que empiecen mientras el sheet no está presente.
     Hay que mantener el §3 "agarrar en vuelo" para el arrastre real.

2. **El scrim bloquea la entrada durante la salida** (contradice D-T6 / §9.0.6 / skill §3).
   Archivos: `components/primitives/dialog.tsx:62-69` (`AnimatedScrim`), `components/primitives/alert-dialog.tsx:68-76`
   y `components/primitives/sheet.tsx:203-205`.
   - Radix fuerza `style={{ pointerEvents: "auto", ... }}` en el Overlay (`@radix-ui/react-dialog/dist/index.mjs:122`).
     Con `forceMount` + `AnimatePresence`, el scrim de pantalla completa sigue montado hasta que termina la
     salida del **contenido** (spring `modal`/`standard`/`fling`, ≈ 300–450 ms), aunque su opacidad ya esté
     en 0. Mientras tanto se traga los clics a la página. `RemoveScroll` también dura toda la salida, no los
     200 ms que dice §9.0.6.
   - Que Radix ya no atrape el foco ni ponga `body { pointer-events: none }` cuando `open=false` no alcanza:
     el bloqueo lo hace nuestro scrim.
   - Qué cambiar: cuando el overlay no está abierto, el scrim tiene que quedar con `pointer-events: none` (por
     ejemplo con `style` en el `m.div`; el `Slot` de Radix deja que el estilo del hijo gane). Al hacerlo, hay que
     revisar que `onCloseAutoFocus` (que en Radix devuelve el foco al disparador **al desmontar**) no le
     robe el foco a lo que el usuario haya tocado durante la salida.

3. **Toaster: los estilos de descripción, acción y cancelar no aplican nunca** (`components/primitives/sonner.tsx:28` vs `:30`, `:32`, `:33`).
   - El toast pasó de `group toast` a `group/toast toast`. Las clases `group-[.toast]:…` compilan a
     `.group.toast .x`, que exige la clase `group` sin nombre en el mismo `li`. Lo verifiqué compilando con
     Tailwind 3.4: sale `.group.toast .group-\[\.toast\]\:text-subheadline`.
   - Resultado: la descripción no toma `text-subheadline text-muted-foreground` y los botones de acción y
     cancelar quedan con los colores por defecto de Sonner, en lugar de lo que pide §9.7.
   - Hoy no se nota porque `lib/notify.ts` no usa `description` ni `action`, pero el primitivo queda roto para
     017b–e.
   - Qué cambiar: o devolver `group` al `li` además de `group/toast`, o pasar esos selectores a
     `group-[.toast]/toast:` (o al equivalente que matchee el `li`).

## Respuestas a los puntos pedidos

1. **API intacta:** sí. Ninguna pantalla existente se editó para compilar. Las props públicas son las mismas
   (solo hay opcionales nuevas) y tsc está verde en web y bot. Los componentes nuevos tienen API clara y
   coinciden con §6.3:
   - `SegmentedControl` es genérico en `T`, ignora el deseleccionar, usa `LayoutGroup` propio y tiene `role="radiogroup"`.
   - `GroupedList` y `GroupedListRow` son server-safe; `href` renderiza `Link` y `onClick` renderiza `button`.
   - `Metric` muestra "—" con `null`, usa U+2212 y NBSP, y el texto `sr-only` es "subió/bajó …".
2. **Radix + Motion:** el patrón está bien aplicado.
   - `forceMount` va después del spread (un `forceMount` undefined del consumidor no lo pisa), con `asChild`
     sobre `m.div` y `AnimatePresence` por fuera del Portal.
   - El centrado no usa translate.
   - `transformOrigin` viene de las variables de Radix.
   - Foco y Esc los sigue manejando Radix.
   - `useExitSnapshot` resuelve bien el vaciado del contenido en la salida (`ConfirmProvider`, sheet del turno).
   - Arrastrar para cerrar no rompe el teclado ni los lectores: el grabber es `aria-hidden` y la X y Esc
     siguen disponibles.
   - **Fallan** los puntos 1 y 2 de arriba.
3. **Accesibilidad:**
   - Contraste: los tests cubren los pares de §7.1, materiales sobre 4 fondos y la paleta de gráficos.
   - Foco: `outline` ring de 2 px en todos los controles.
   - `touch-target` en botones, X, checkbox, radio, switch, toggle y segmentado; el menú móvil y la tab bar
     llegan a 44 px.
   - Inputs ≥ 16 px con `pointer: coarse` y 17 px en el portal.
   - Movimiento reducido por componente: overlays con fundido, sidebar con ancho instantáneo, `layoutId`
     anulado por `MotionConfig`, skeleton `motion-safe`, tooltip sin zoom, press sin escala, login con fundido
     y Sonner sin desplazamiento. No quedan animaciones grandes sin alternativa.
   - Transparencia reducida y más contraste: hay `@media` + simulación en los tres materiales y bordes
     `more-contrast:` en tarjetas, alertas y workspace.
4. **Rendimiento:**
   - `LazyMotion` con `strict` y `domMax` por `import()` diferido; solo hay `m.*`.
   - `backdrop-filter` solo en `material-*`: topbar móvil, header del portal, tab bar, popover, menú, toast y
     la barra de la demo.
   - Se anima solo transform/opacity, salvo el ancho del slot de la sidebar (excepción documentada en R-3).
   - Tamaño: `/portal` 107 kB contra 103 kB compartidos indica que el núcleo eager de Motion es chico.
     `/` 339 kB y `/pacientes/[id]` 362 kB los dominan FullCalendar y Recharts. Me parece razonable, pero
     no es verificable contra el +≤ 45 KB sin un "antes" (ver Dudas).
   - `animate()` importado en `sheet.tsx` y `use-dismiss-drag.ts` es eager (no lo cubre `LazyMotion`).
     Es aceptable.
5. **Hidratación:** `f4f53ea` es razonable: FullCalendar de la demo solo en el cliente, con skeleton de la misma
   altura, y sin `export const metadata` en las demos.
   - En el shell no encontré ramas servidor/cliente que cambien el árbol. `useReducedMotionConfig` solo
     afecta `transition` (no llega al DOM) o contenido de overlays que solo existe abierto en el cliente.
     El sidebar usa `initial={false}` con el ancho que sale de la cookie, y `ScrollEdgeHeader` y
     `useOptimisticPath` arrancan igual en el servidor y en el cliente.
   - El orquestador confirmó 0 errores en Chrome.
6. **Demo:** cumple `notFound()` en producción, `noindex`, fuera de toda navegación y protegida por el
   middleware. El implementer verificó en el build que `/dev-diseno-portal` prerenderiza un 404.
7. **Zona de imleticio:** sin cambios de archivos (lo verifiqué con grep sobre el diff). El cambio visual por
   tokens compartidos lo validó el orquestador.
8. **Presentación pura:** nada en `packages/**`, `apps/bot/**`, server actions (la action `signIn` del login
   está igual), datos ni PDF.
9. **Fase 8 limpia:** no quedan restos Notion, `theme-warm`, `var(--radius)` ni el alcance de preview.
   `tailwindcss-animate` queda en el Tooltip y en `animate-spin`/`animate-pulse`, y además en los
   `DialogOverlay`/`SheetOverlay`/`AlertDialogOverlay` **exportados** (ver Dudas).
10. **Desvíos y agregados:** los cinco desvíos y agregados están bien justificados.
    - **D-1:** el test de §16 (2) obliga; `#A80010` cumple y la redefinición de `--destructive` dentro de
      `.material-*` es coherente con la de `--muted-foreground`.
    - **D-2 y D-3:** fueron necesarios para aprobar la demo antes del flip; ya están retirados y cerrados en
      fase 7/8 (grep = 0).
    - **`useExitSnapshot`:** necesario para que el contenido no se vacíe en la salida.
    - **`ScrollEdgeHeader`:** permite que `PortalHeader` siga server-safe y mide la safe area real.
    - **`SIDEBAR_WIDTH`:** Motion necesita el valor en JS; está documentado como espejo de las variables CSS.
    - **`closeButtonClass`:** es la X compartida entre Dialog y Sheet.
    - **`useReducedMotionConfig`:** es correcto que reemplace a `useReducedMotion()` de la SDD, porque
      respeta el `MotionConfig reducedMotion="always"` de la simulación.

## Dudas (no bloqueantes)

- **Recorrido incompleto respecto de §17.4–§17.6.** No se midió la sidebar a 1366×768
  (`nav.scrollHeight <= nav.clientHeight`, §10.1 y 0.4/6.3). Tampoco se probaron con el ajuste real del
  sistema la transparencia reducida, el contraste ni el teclado en los overlays reales, ni se hizo el
  Performance de §17.6. Conviene hacerlo en la próxima ronda, sobre todo después de corregir los puntos 1 y 2.
- **Peso (+≤ 45 KB):** para cerrar la duda, hay que correr `next build` sobre `3457e3f` en un worktree (con el
  `next dev` apagado) y comparar el First Load de `/` y `/portal`.
- **Overlays exportados con CSS:** `DialogOverlay` (`dialog.tsx:51`), `SheetOverlay` (`sheet.tsx:64`) y
  `AlertDialogOverlay` (`alert-dialog.tsx:46`) siguen con `tailwindcss-animate`. Hoy nadie los usa (grep),
  así que es una desviación menor de D-T7. Se aceptan para conservar la API.
- **Accesibilidad durante la salida:** el foco vuelve al disparador y `hideOthers` (aria-hidden del resto de la
  página) se levanta recién al **terminar** la salida (≈ 300 ms), no al cerrar. Es aceptable, pero conviene
  tenerlo en cuenta al resolver el punto 2.
- **`useExitSnapshot` escribe un ref durante el render** (`lib/use-exit-snapshot.ts:12`). Funciona, pero lo
  marcaría el React Compiler. Además congela solo el árbol de elementos: un hijo que lea su propio
  estado o contexto se puede vaciar igual.
- **`Tabs` sin `value` ni `defaultValue`:** el wrapper hace que el Root de Radix pase de no controlado a
  controlado en el primer cambio (`primitives/tabs.tsx:19-28`). No hay consumidores así hoy.
- **`press-sm` en los ítems de la sidebar** escala el link mientras Motion mide el `layoutId` al hacer clic.
  Si se nota un salto del indicador, conviene quitar la escala en ítems con indicador.

---

# Ronda 2

**Veredicto:** CHANGES_REQUESTED

Diff revisado: `git diff ec3de99..HEAD` (ff79809, a689f7f, d3e7485, 6d177bb, 3cb5faf, 0bdd0e9, 3ed662d, d883e06).
Fuentes: "Ronda 2" de `progress/impl_HU-017a.md`, `progress/recorrido_HU-017a-ronda2.md`, SDD §23.

Verificación que corrí yo:

```
npm run typecheck                  → exit 0 (core, db, bot, web)
npm run test                       → 73 files, 1368 tests, exit 0
npm run lint --workspace apps/web  → exit 0; solo el warning preexistente ajustes/logo-form.tsx:36
./ops/harness/verify.sh            → "Arnés OK", exit 0 (WARN del bot = .whatsapp-auth.vieja* sin trackear, ajenos)
```

Alcance de la ronda: solo `primitives/*`, `lib/*` (helpers nuevos y sus tests), `shell/sidebar-content.tsx`,
`next.config.mjs`, la demo y la SDD. No toca pantallas, la zona de imleticio, `packages/**` ni `apps/bot/**`.
Los checkpoints C1–C5 de la ronda 1 siguen marcados (los comandos están verdes de nuevo).

## Pedidos de la ronda 1

1. **Sheet congelado: resuelto.**
   - `lib/dismiss-drag.ts` ya no frena la animación en el `pointerdown`.
   - `value.stop()` se llama recién al capturar el gesto (`dismiss-drag.ts`, `move()`), y `startValue` se toma
     en ese momento. Así el "agarrar en vuelo" (§3) sigue funcionando para el arrastre real: no hay salto y
     después sigue 1:1.
   - Un toque, un scroll que gana el eje cruzado, un `pointercancel` o un `pointerup` sin captura no tocan
     la animación.
   - Durante la salida el sheet pasa `enabled: dismissOnDrag && isPresent` (`sheet.tsx:136`), así que ningún
     gesto puede cortarla.
   - Lo cubren 13 tests con un MotionValue falso.
   - `runExit` (`lib/sheet-exit.ts`) es una red razonable. Con 1000 ms no corta salidas legítimas: `standard`
     dura 0,35 s y `fling` 0,3 s; aunque el resorte siga asentándose, a 1 s está a píxeles del destino y
     `finalize` hace `jump(target)` sin salto visible. En movimiento reducido el fundido dura 0,2 s.
   - Si el sheet se reabre durante la salida, se llama a `cancelExit` (`sheet.tsx:173-175`) y la promesa
     vieja queda neutralizada por `settled`. El destino ya no puede ser 0 cuando no se puede medir el panel.
2. **Scrim que bloqueaba: resuelto.**
   - `ModalScrim` separa el scrim visual (siempre `pointer-events-none`) del Overlay de Radix. El Overlay es
     el que atrapa el clic afuera y lleva `RemoveScroll`, y se desmonta con `useIsPresent()` apenas empieza
     la salida.
   - Los contenidos llevan `data-[state=closed]:pointer-events-none`.
   - `preserveUserFocusOnClose` evita pisar el foco que el usuario puso en otro lado durante la salida.
   - El recorrido lo confirma: un clic durante la salida navega, y quedan 0 scrim y `body` con
     `pointer-events: auto`.
3. **Toaster: resuelto.** El `li` lleva `group toast group/toast` (`sonner.tsx`, `toastClassNames`). Lo compilé
   en la ronda 1: con `group` presente, `.group.toast .x` matchea. Hay un test que fija las clases.

## D-4 (alias `motion/react` → `framer-motion`): es seguro

- `node_modules/motion/dist/es/react.mjs` es literalmente `export * from 'framer-motion'` más
  `const motion = fm.motion; const m = fm.m`. Los exports son los mismos y la versión también:
  `motion` y `framer-motion` están en 14.0.0.
- Hay una sola copia de `framer-motion`, en el `node_modules` de la raíz. No se duplica Motion: el alias hace
  que todo el código use el mismo módulo.
- Webpack usa `"motion/react$"` (coincidencia exacta) y Turbopack `resolveAlias`. Solo se importa
  `"motion/react"` (20 imports; no hay `motion/react-*`).
- El `next build` del implementer pasó, y el `next dev` (Turbopack) del orquestador anduvo con 0 errores.
- Peso medido contra `3457e3f` en un worktree: `/` +37,6 KB y `/portal` +19,6 KB gz, sumando todos los
  chunks iniciales, que es la medición correcta en el App Router. Entra en el presupuesto de +≤ 45 KB.
  `animateSingleValue` está bien elegido.
- Hay un riesgo menor (ver Dudas): `framer-motion` no está declarado en `apps/web/package.json`.

## Cambios requeridos (ronda 2)

1. **Un Dialog o AlertDialog que se reabre durante su salida queda `inert` para siempre**
   (`components/primitives/modal-scrim.tsx:60-70`, `ExitFocusGuard`).
   - Al empezar la salida, el efecto hace `container.inert = true`. Cuando `isPresent` vuelve a `true`
     (`if (isPresent) return`, `:64`), no lo deshace.
   - `AnimatePresence` de framer-motion 14 **re-presenta el mismo hijo** si la clave vuelve antes de
     terminar la salida (`AnimatePresence/index.mjs:151-156`: `isPresent = presentKeys.includes(key)`).
     Acá la clave es siempre `""` (un solo hijo sin `key`), así que es la misma instancia de React y el
     mismo nodo del DOM.
   - Ahora es fácil llegar a ese estado, justamente porque el scrim ya no bloquea: cerrar "Nuevo turno" con
     Esc y volver a hacer clic en el botón dentro de ~300 ms.
   - Resultado: el dialog queda visible y abierto, pero inerte. No se puede enfocar ni hacer clic en nada
     de adentro, y el foco atrapado de Radix no encuentra destino. Esc y el clic afuera lo cierran, pero el
     formulario no se puede usar.
   - El sheet no tiene el problema: usa `inert={!isPresent || undefined}` como prop (`sheet.tsx:247`).
   - Qué cambiar: que `ExitFocusGuard` vuelva a poner `inert = false` cuando `isPresent` es `true`, o pasar a
     un `inert` controlado por prop como en el sheet. Agregar un caso de test o de la demo que lo cubra
     (cerrar y reabrir a mitad).

2. **El foco no vuelve al disparador en los overlays controlados sin `Trigger` de Radix** (observación del
   recorrido: `/servicios` → "Editar" → Esc deja el foco fuera del botón).
   - **Diagnóstico:** no lo causan el `inert` ni el `blur()`.
     - El `onCloseAutoFocus` del Dialog modal de Radix hace `event.preventDefault(); context.triggerRef.current?.focus()`
       (`@radix-ui/react-dialog/dist/index.mjs:154-157`).
     - "Editar" (`servicios/service-card.tsx:65`) es un `Button` con `onClick={() => setEditing(true)}`, no
       un `SheetTrigger`, así que `triggerRef` es `null` y el foco queda en `body`. Lo que el orquestador
       vio como "Saltar al contenido" es el primer enfocable desde `body`.
     - Pasa lo mismo con **`Modal`** (`components/modal.tsx`; lo usan "Nuevo turno", disponibilidad y pagos)
       y con **`useConfirm`** (`ConfirmProvider`), que tampoco tienen `Trigger`.
   - Ya pasaba antes de 017a. Pero choca con un criterio explícito de esta HU: el paso 4.10 dice
     "`/` → 'Nuevo turno' … Esc, **foco vuelve al botón**", y §17.5 "Teclado" dice que el foco "vuelve al
     disparador". Además se puede arreglar sin tocar pantallas: el comentario de `modal.tsx` promete
     "devolución de foco al disparador".
   - Qué cambiar, solo en los primitivos (`dialog.tsx`, `alert-dialog.tsx`, `sheet.tsx`):
     - Guardar el elemento enfocado en el momento en que el overlay se abre, antes de que el `FocusScope` de
       Radix mueva el foco. Sirve un `useLayoutEffect` del Content o del Root al pasar `open` a `true`.
     - En `onCloseAutoFocus`, si después del handler de Radix el foco quedó en `body` (sin trigger o con un
       trigger que no se pudo enfocar) y el usuario no eligió otro elemento (`preserveUserFocusOnClose`),
       devolverlo a ese elemento, si sigue conectado y no está dentro del overlay.
     - Verificar con teclado: `/servicios` "Editar" → Esc; "Nuevo turno" → Esc; un "Borrar" con
       `useConfirm` → Cancelar. En los tres casos el foco tiene que quedar en el botón que lo abrió.

## Dudas (no bloqueantes)

- **`framer-motion` sin declarar:** el alias de D-4 depende de que npm lo deje en el `node_modules` de la raíz,
  y no está en `apps/web/package.json`. Si un `npm dedupe` o un cambio de versión lo anidara bajo `motion/`,
  el build fallaría al resolverlo. Conviene declararlo con la misma versión (`14.0.0`, exacta o atada a la
  de `motion`), o resolver la ruta desde `motion` con `require.resolve`.
- **Sidebar a 1366×768:** el implementer midió 634 px en su réplica. El orquestador no pudo repetir la medición
  a 650 px útiles. Conviene confirmarla en el recorrido de la próxima ronda.
- Siguen vigentes las dudas de la ronda 1 que no se tocaron: los overlays exportados con
  `tailwindcss-animate` sin uso, el ref escrito durante el render en `useExitSnapshot`, el paso de no
  controlado a controlado en `Tabs` y la escala de `press-sm` con `layoutId`. El menú táctil ya no usa
  `layoutId`, lo que achica la última.

---

# Ronda 3

**Veredicto:** APPROVED

Diff revisado: `git diff d883e06..HEAD` (3c77283, 15e7fc7, e46e214, 26796b6, 4249f51).
Fuentes: "Ronda 3" de `progress/impl_HU-017a.md` y de `progress/recorrido_HU-017a-ronda2.md`, SDD §24.

Verificación que corrí yo:

```
npm run typecheck                  → exit 0
npm run test                       → 73 files, 1380 tests, exit 0
npm run lint --workspace apps/web  → exit 0; solo el warning preexistente ajustes/logo-form.tsx:36
./ops/harness/verify.sh            → "Arnés OK", exit 0
```

La ronda no toca pantallas, la zona de imleticio, `packages/**` ni `apps/bot/**`. Los checkpoints C1–C5 siguen
marcados.

## Pedidos de la ronda 2

1. **Dialog reabierto durante la salida que quedaba `inert`: resuelto.**
   - `ExitFocusGuard` (`modal-scrim.tsx:61-70`) llama a `applyExitGuard`, que pone `inert = false` cuando
     `isPresent` vuelve a `true` (`lib/overlay-focus.ts`, `applyExitGuard`).
   - Lo cubren un test y el caso "Cerrar y reabrir a mitad" de la demo.
   - El orquestador lo confirmó en Chrome: reabrir "Nuevo turno" enseguida deja 1 dialog `open` y no `inert`.
2. **Foco al disparador sin `Trigger`: resuelto.**
   - `useOverlayOpenInfo` (`lib/use-return-focus.ts`) guarda `document.activeElement` en un efecto de layout
     del Root, al pasar `open` a `true`. Corre antes del `useEffect` del `FocusScope` de Radix, que es el que
     mueve el foco.
   - `preserveUserFocusOnClose(…, { returnTo })` corre antes que el handler de Radix (`composeEventHandlers`
     llama primero al del consumidor). Agenda `restoreFocus` en un microtask, que se ejecuta después de que
     Radix enfoca su `Trigger`. Así:
     - si hay `Trigger`, el foco ya no está en `body` y no hace nada;
     - si no hay, enfoca el elemento guardado, siempre que siga conectado (un "Borrar" que se eliminó
       queda sin efecto);
     - si el usuario eligió otro control durante la salida, se respeta, como en la ronda 2.
   - Con esto quedan cubiertos `Modal`, `useConfirm` y los sheets de `/servicios` sin tocar pantallas. El
     orquestador lo confirmó en "Nuevo turno" y "Editar".

## Filtro de "clic afuera que empezó antes de la apertura"

- `ignoreOutsideBeforeOpen` compara `detail.originalEvent.timeStamp` con el `performance.now()` de la apertura.
  Los dos usan la misma base de tiempo (`DOMHighResTimeStamp` desde `timeOrigin`).
- **Un clic afuera real**, con el overlay ya abierto, tiene un `timeStamp` posterior: pasa al handler del
  consumidor y Radix cierra. Lo cubre un test y lo verificó el implementer con mouse y táctil.
- **El arrastre del sheet no se ve afectado:** nace dentro del panel, no es "outside" y lo maneja
  `use-dismiss-drag`.
- **El sheet no modal del turno** (`appointment-detail-sheet.tsx`) usa `onInteractOutside`, que no se
  envuelve. Como `open` no cambia al elegir otro turno, `openedAt` no se mueve y los clics posteriores
  se procesan igual que antes.
- **Táctil:** Radix despacha en el `click` con el `pointerdown` original como `originalEvent`. Por eso el
  toque que reabrió el overlay se ignora, que es justo el caso que se quería cubrir.

## framer-motion

- Está declarado `"framer-motion": "14.0.0"` exacto en `apps/web/package.json`, la misma versión exacta de
  la que depende `motion`.
- El lock solo suma esa línea, sin una segunda copia. D-4 ya no depende del hoisting.

## Lo aprobado en rondas anteriores

Sigue igual:
- `use-dismiss-drag`/`dismiss-drag`, `runExit`, `ModalScrim`, Toaster y alias.
- Peso: `/` +38,7 KB y `/portal` +19,7 KB gz, dentro del presupuesto de +≤ 45 KB.
- Los cambios de esta ronda son aditivos, en los Roots y los Content de Dialog, AlertDialog y Sheet. Las
  firmas públicas no cambian; los handlers del consumidor se siguen llamando.

## Dudas (no bloqueantes)

- **Commit mezclado:** `3c77283` mete en esta rama un `.gitignore` de material de la HU-018 (`docs/recetarios/`,
  `docs/planes-alimentacion/`), junto con la SDD §24. Es inocuo, pero mezcla tareas en un commit (AGENTS.md).
  Conviene mencionarlo en el PR o moverlo a la rama de la HU-018.
- **Sidebar a 1366×768:** el orquestador todavía no la midió a ~650 px útiles; el implementer la midió en
  634 px. Confirmar en el PR.
- **Pruebas en Chrome con la pestaña de la extensión:** esa pestaña reporta `visibilityState = "hidden"` y
  no recibe frames, así que las salidas tardan más. Las verificaciones de tiempos conviene hacerlas en una
  pestaña visible.
- Siguen vigentes las dudas menores de la ronda 1 (overlays exportados con `tailwindcss-animate` sin uso, el
  ref escrito durante el render en `useExitSnapshot`, `Tabs` que pasa de no controlado a controlado). Ninguna
  bloquea.
