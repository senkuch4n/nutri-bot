# Review — HU-002a (`rediseno-ui-fundaciones`)

**Veredicto:** APPROVED

## Ronda 2 (resolución 1, 2026-09-24)

### Verificación que corrí yo
- `npm run typecheck` (core, db, bot, web): limpio.
- `npm run test`: 7 archivos, 49 tests OK.
- `./ops/harness/verify.sh`: `Arnés OK.`, exit 0.
- `git diff --stat HEAD -- packages apps/bot`: vacío. Sin archivos `prueba-*`.
- Alcance de la ronda: por fecha de modificación, los únicos archivos de código que cambiaron
  después de mi revisión anterior (00:42) son `ui.tsx` (00:48:35), `number-input.tsx`,
  `shell/sidebar-content.tsx` y `app/global-error.tsx` (00:48:07-08). Además cambiaron
  `progress/impl_HU-002a.md`, `progress/recorrido_HU-002a.md`, `backlog.json` y
  `progress/current.md`, todos del arnés. Nada fuera de alcance.

### Punto 1 (espacio duro en `Quantity`): resuelto
- `apps/web/src/components/ui.tsx:192`: `{"\u00A0" + unit}`. Es el escape explícito en el
  fuente, no un carácter que se confunda con un espacio. `AdequacyBar` lo hereda (`ui.tsx:234`).
  La firma no cambió.

### Punto 2 (`aria-describedby` de `NumberInput`): resuelto
- `apps/web/src/components/number-input.tsx:12`: `"aria-describedby"` se saca de `props`.
- `:17`: `[describedBy, unitId].filter(Boolean).join(" ")`, sin `cn`.
- `:25`: la prop va después de `{...props}`. El id del consumidor y el de la unidad (`:29`)
  quedan los dos. La firma del contrato 6.2 no cambió.

### Sidebar compactada (`shell/sidebar-content.tsx`): la accesibilidad sigue bien
- Foco: los ítems siguen con `sidebarItemClass` (`nav-config.ts:58-59`: `h-8`,
  `focus-visible:ring-2`). La fila de estado del bot (`:139`) baja a `h-7` (28 px, por encima del
  mínimo de 24 px de WCAG 2.2) y conserva su `focus-visible:ring`. El orden de tabulación no cambia.
- Nombres accesibles: los links siguen con su texto (`sr-only` cuando está colapsada, `:63`,
  `:146`). "Cerrar sesión" sigue siendo texto visible con el ícono `aria-hidden`
  (`sign-out-button.tsx:18-19`, sin tocar).
- Email: `<p ... truncate ... title={email}>` (`:158`) con `min-w-0 flex-1`, así que se trunca de
  verdad dentro del flex. El recorrido lo confirma ("jo…errud…").
- "Cerrar sesión" en la misma fila: `div.flex.items-center` (`:156`), con el slot en un contenedor
  `shrink-0` (`:162`). El botón toma el ancho de su contenido y no se parte en dos líneas. Si no
  hay email, pasa a `flex-1`.
- Modo colapsado (`:150-153`): igual que antes, el botón solo dentro de `MaybeTooltip` con
  "Cerrar sesión". El email no se muestra, como antes.
- El `nav` sigue con `overflow-y-auto` (`:95`) como red de seguridad para alturas menores. El
  orquestador comprobó en el navegador que a 1366×663 entra sin scroll (scrollHeight 494 ==
  clientHeight 494).

### `global-error.tsx` (mi duda anterior): resuelta
- `app/global-error.tsx:3,10-14,25`: carga `Inter` con `variable: "--font-sans"`, igual que
  `app/layout.tsx:2-7`, y la aplica al `<html>`. `--font-sans` ahora existe en esa pantalla.

### Lo que el recorrido no pudo verificar: no bloquea
- **Login en ventana privada (`/login`, `/inicio`)**: no bloquea. En la ronda 1 comparé la lógica
  con `git show HEAD:`: `auth()` + `redirect("/")`, el action `signIn("google", { redirectTo: "/" })`
  movido tal cual a `login-screen.tsx`, `force-dynamic` intacto, y `auth*.ts` y `middleware.ts` sin
  cambios. El riesgo es solo visual. **Queda para el usuario.**
- **Portal a 360 px**: no bloquea. Se probó a 500 px (el mínimo de la ventana), con las 4 tabs de
  56 px y sin scroll horizontal. El layout no tiene anchos fijos por encima de 360 que yo haya visto
  en la ronda 1. **Queda para el usuario** (DevTools, modo dispositivo).
- **Página de muestra de componentes (`prueba-sistema`/`prueba-error`)**: no bloquea para 002a.
  Esos componentes (`useConfirm`, `notify`, `DataTable`, `NumberInput`, `AdequacyBar`) todavía no
  tienen consumidores en esta HU. Los van a usar 002b-d, que tienen su propio recorrido. Las
  firmas se revisaron export por export contra el contrato 6.2 y el typecheck está limpio.
  **Pendiente:** que el recorrido de la primera HU que los consuma cubra NumberInput con un
  `aria-describedby` propio, DataTable con 30 filas y el `Reintentar` de `error.tsx`.
- Contraste medido en DevTools: sigue pendiente. Los tokens salen de la SDD.

## Checkpoints (ronda 2)
- C1 `backlog.json` válido, 1 HU activa: [x] (HU-002a `en_revision`, `intentos_revision: 1`)
- C1 `progress/current.md` refleja la HU en curso: [x]
- C1 `verify.sh` exit 0: [x]
- C2 `docs/hu-rediseno-ui-empresarial.md` completa con Resoluciones: [x]
- C2 SDD con workspaces, checklist atómico y contrato: [x]
- C2 Firmas y nombres del diff = "Contrato compartido": [x] (se corrigieron los 2 desvíos de la
  ronda 1: `ui.tsx:192`, `number-input.tsx:12,17,25`)
- C3 Lógica pura en core / domain sin duplicar: [x]
- C3 schema/domain: [x] (sin cambios)
- C3 Migraciones: [x] (no hay)
- C3 Rutas del panel protegidas / portal solo datos propios: [x]
- C3 Bot en silencio / textos: [x] (no se toca)
- C3 Sin `console.log` ni TODO: [x]
- C4 `npm run typecheck` limpio: [x]
- C4 Tests de core: [x] (49/49)
- C4 Flujo del bot simulado: [x] (no aplica)
- C4 PDF verificado: [x] (no aplica)
- C5 `progress/impl_HU-002a.md` describe lo tocado: [x] (sección "Ronda de resolución 1")
- C5 `progress/review_HU-002a.md` con veredicto: [x]
- C5 Sin scripts ni datos de prueba sueltos: [x]

## Dudas (no bloqueantes, ronda 2)
- Siguen abiertas las dudas menores de la ronda 1: `role="status"` anidado en `PageSkeleton`, el
  `TooltipTrigger` sobre el `<form>` cuando está colapsada, el clic en un toast que cierra un
  `Modal`. Conviene tomarlas en 002b-d.
- A 240 px el email tiene unos 86 px antes de truncarse. Es un trade-off aceptado y documentado,
  con el email completo en `title`.

---

# Ronda 1 (histórico, CHANGES_REQUESTED)

Primer intento de revisión. El código está muy cerca: alcance limpio, contrato 6.2 casi
completo, límites server/client correctos. Se rechaza por **dos desvíos puntuales del contrato
6.2** (cambios de una línea cada uno). El recorrido visual (SDD 12.4–12.6) no forma parte de esta
revisión: lo hace el orquestador aparte (ver "Pendiente del recorrido").

## Verificación que corrí yo

- `npm run typecheck` (core, db, bot, web): limpio.
- `npm run test`: 7 archivos, 49 tests OK (`packages/core` sin cambios).
- `./ops/harness/verify.sh`: `Arnés OK.`, exit 0.
- `npx tailwindcss -c tailwind.config.ts -i src/app/globals.css -o <scratchpad>`: compila. Los
  alias LEGACY resuelven a los tokens (`.text-ink-faint` → `hsl(var(--muted-foreground))`,
  `.bg-leaf` → `hsl(var(--primary))`). Las variantes `group-data-[collapsed=true]/sidebar:*` se
  generan. **No** corrí `next build` ni `next dev` (dev server del usuario, pid 74126).
- 12.2: `git diff HEAD -- packages apps/bot` vacío. Actions, `api/**`, `plan-pdf.tsx`,
  `auth*.ts` y `middleware.ts` sin cambios. Fuera de `apps/web` solo `package-lock.json` (y los
  ajenos `backlog.json`, `progress/current.md`, `docker-compose.prod.yml`, más el `impl`). Sin
  rutas `prueba-*`.
- 12.3: greps (1), (2) y (3) → 0 líneas. `nav.tsx`/`nav-links.tsx` borrados. `confirm(`
  nativos: exactamente los 3 de 002b/c/d. Sin `console.*` ni TODO en los archivos de la HU.
- Versiones instaladas: `tailwind-merge` 2.6.1, `sonner` 2.0.8, `lucide-react` 1.47.0, `cva`
  0.7.1, `clsx` 2.1.1, `tailwindcss-animate` 1.0.7, `@radix-ui/react-slot` 1.3.3 (una sola copia),
  `react-tooltip` 1.2.16, `react-dialog` 1.1.23. `apps/web/package.json` coincide con 4.7.
  En el lockfile solo se agregan paquetes; las líneas "-" de `@protobufjs/*` son un reordenamiento
  (mismas versiones), no un downgrade.
- Actions inline movidos textualmente (comparados con `git show HEAD:`):
  `shell/sign-out-button.tsx:9-12` = `nav.tsx` (`signOut({ redirectTo: "/inicio" })`);
  `login-screen.tsx:23-26` = el de `login/page.tsx` e `inicio/page.tsx`
  (`signIn("google", { redirectTo: "/" })`). `inicio/page.tsx:7` conserva `dynamic = "force-dynamic"`;
  las dos páginas conservan `auth()` + `redirect("/")`. `(panel)/layout.tsx:60-61` conserva
  `auth()` + `redirect("/inicio")`.

## Límites server/client (riesgo que typecheck no ve)

- `SignOutButton` (server, sin `"use client"`) se instancia en `(panel)/layout.tsx:72` y se pasa
  como `ReactNode` (`account`) a `AppSidebar` y `MobileTopbar` (cliente). Es el patrón soportado
  de RSC: el action inline queda en el server.
- `sidebar-content.tsx:145-147` lo envuelve en `TooltipTrigger asChild` cuando está colapsada.
  El `Slot` instalado (`@radix-ui/react-slot` 1.3.3, `dist/index.mjs:14-16`) resuelve hijos
  `React.lazy` con `use(children._payload)`, que es como puede llegar un elemento de server
  component por Flight; después clona el `<form>` y le agrega handlers y `ref`. `onFocus` burbujea
  en React, así que el tooltip abre también con Tab sobre el botón. Riesgo bajo; igual queda en la
  lista del recorrido.
- `sidebarItemClass` vive en `nav-config.ts` (módulo plano), no en el módulo cliente: correcto,
  si no le llegaría al server component como referencia de cliente.
- `lib/shell.ts` es `server-only`, y los tres componentes cliente lo importan solo con
  `import type` (`app-sidebar.tsx:8`, `sidebar-content.tsx:8`, `mobile-topbar.tsx:14`): se borra
  en compilación y no arrastra `server-only` al bundle cliente.
- `Tooltip` solo se usa dentro del `TooltipProvider` del layout del panel; el portal no usa
  tooltips.
- `ui.tsx` y `primitives/button.tsx`/`table.tsx`/`skeleton.tsx` quedan sin `"use client"` y los
  importan server y client sin problema. `DataTable` es cliente y está documentado el límite RSC.

## Checkpoints

- C1 `backlog.json` válido, 1 HU activa: [x] (HU-002a `en_revision`, `intentos_revision: 0`)
- C1 `progress/current.md` refleja la HU en curso: [x]
- C1 `verify.sh` exit 0: [x]
- C2 `docs/hu-rediseno-ui-empresarial.md` completa con Resoluciones: [x]
- C2 SDD con workspaces, checklist atómico y contrato: [x]
- C2 Firmas y nombres del diff = "Contrato compartido": [ ] — dos desvíos en 6.2:
  `components/ui.tsx:191` (unidad de `Quantity` sin espacio duro) y
  `components/number-input.tsx:21-22` (el `aria-describedby` del consumidor pisa el de la unidad).
  Ver "Cambios requeridos". El resto de las firmas coincide (verificado export por export:
  `cn`, `Card`, `PageHeader`, `SectionLabel`, `Button`, `ButtonLink`, `StatTile`, `Field`,
  `FormError`, `inputClass` literal, `Input`/`Select`/`Textarea`, `Badge` con tonos nuevos +
  alias, `Alert`, `EmptyState`, `AdequacyBar`, `DataTable`, `ConfirmProvider`/`useConfirm` con el
  error textual, `Modal`, `notify`/`useActionToast`, `shell.ts`, `chart-theme.ts` con los 5 hex y
  el margen, `skeletons`, `StatusScreen`, `Wordmark`/`LeafMark`/`GoogleG`, `LoginScreen`,
  `numeric`/`containerClassName` en `table.tsx`).
- C3 Lógica pura en core / domain sin duplicar: [x] (no aplica lógica de dominio; `AdequacyBar`
  recibe `status` ya calculado, como pide la SDD)
- C3 schema/domain: [x] (sin cambios; `shell.ts` solo lee `Professional` y `BotStatus`, tolera
  `null` y nunca tira)
- C3 Migraciones: [x] (no hay)
- C3 Rutas del panel protegidas / portal solo datos propios: [x] — los estados nuevos
  (`loading`/`error`/`not-found`) cuelgan de `(panel)` o `(portal)/portal`, detrás de los mismos
  layouts con `auth()` / `getPortalPatient()`. El portal no agrega consultas por id: solo
  `getProfessionalDisplayName()` (nombre de la profesional, que es público para el paciente).
  `app/not-found.tsx` y `global-error.tsx` no exponen datos.
- C3 Bot en silencio / textos: [x] (no se toca el bot)
- C3 Sin `console.log` ni TODO: [x]
- C4 `npm run typecheck` limpio: [x]
- C4 Tests de core: [x] (no hay lógica nueva de core; 49/49 siguen verdes)
- C4 Flujo del bot simulado: [x] (no aplica)
- C4 PDF verificado: [x] (no aplica; `plan-pdf.tsx` sin cambios)
- C5 `progress/impl_HU-002a.md` describe lo tocado: [x]
- C5 `progress/review_HU-002a.md` con veredicto: [x]
- C5 Sin scripts ni datos de prueba sueltos: [x] (no hay `prueba-*`; el impl no escribió en la base)

## Cambios requeridos

1. **`apps/web/src/components/ui.tsx:191`** — `Quantity` separa la unidad con un espacio común
   (`{" " + unit}`). La SDD 6.2 pide "unidad separada con **espacio duro**", y la HU pide que la
   unidad quede siempre pegada al número. En columnas angostas y en `AdequacyBar`
   (`ui.tsx:231-233`, que usa `Quantity`) la unidad puede pasar sola a la línea siguiente. Usar
   ` `.
2. **`apps/web/src/components/number-input.tsx:21-22`** — el `aria-describedby` combinado se
   escribe **antes** de `{...props}`, y `aria-describedby` no se saca de `props`. Si el
   consumidor pasa su propio `aria-describedby` (p. ej. el id de un error o un hint), el spread lo
   pisa y se pierde el enlace con la unidad, que es justo lo que la SDD 6.2 exige
   ("enlazado con aria-describedby"). Hay que desestructurar `aria-describedby` o mover la
   prop después del spread. De paso: unir ids con `cn` (que pasa por `twMerge`) no corresponde,
   porque son ids, no clases. Alcanza con un `filter(Boolean).join(" ")`.

## Dudas (no bloqueantes)

- `app/global-error.tsx:17`: el `<html>` no lleva `sans.variable`. Como `global-error` reemplaza
  al layout raíz, `--font-sans` no está definida y `font-sans` (`var(--font-sans), …`) queda
  inválida en cálculo: la pantalla puede salir en la serif por defecto. Es un caso raro y solo
  estético. Se arregla importando `Inter` igual que el layout raíz o agregando un fallback.
- `sidebar-content.tsx:145-147`: con la barra colapsada, el `TooltipTrigger` es el `<form>`, no el
  `<button>`, así que el `aria-describedby` del tooltip queda en el form. El botón igual tiene su
  nombre accesible (`sr-only` "Cerrar sesión"), así que no falta nada. Solo es poco prolijo.
- En los links colapsados el nombre accesible (`sr-only`) y el tooltip (`aria-describedby`) dicen
  lo mismo, así que un lector lo anuncia dos veces. Es lo habitual con Radix; aceptable.
- `skeletons.tsx`: `PageSkeleton` anida dos `CardSkeleton`, y cada uno trae su propio
  `role="status"` + "Cargando…". Un lector de pantalla puede anunciar "Cargando…" tres veces.
  Convendría una prop interna para no anidar `role="status"`.
- `ui.tsx:244`: con `value > target`, `aria-valuenow` supera `aria-valuemax`. Lo prescribe la SDD
  y el `aria-valuetext` lo compensa. Solo lo anoto.
- `comparative-chart.tsx:76` usa `sx={chartSx}` en vez de `sx={{ ...chartSx }}`. Es equivalente
  (el objeto no se muta).
- Un clic en un toast de Sonner con un `Modal` abierto cuenta como "clic afuera" y cierra el modal
  (Radix `DismissableLayer`). Es un caso marginal, a tener en cuenta cuando 002c pase a
  `useActionToast` dentro de modales.
- Agregados propios del implementer fuera de la SDD, que no molestan: `touch-action: manipulation`
  en `globals.css:83-87`, `text-balance`/`text-pretty`, `overscroll-contain` en Dialog/Sheet,
  `SheetDescription` sr-only y el `theme-warm` condicional en `app/not-found.tsx:14`.

## Pendiente del recorrido (SDD 12.4–12.6, lo hace el orquestador)

No lo verifiqué: requiere navegador y reiniciar el `npm run dev` del usuario (Tailwind 3.4 en
Node 24 no recarga `tailwind.config.ts`).

- **12.4 Límites en runtime**: que `/` renderice con la sidebar expandida **y** colapsada (cookie
  `nb-sidebar=collapsed`), sin error de consola por el `SignOutButton` dentro de
  `TooltipTrigger asChild`; hover y Tab sobre "Cerrar sesión" colapsado muestran el tooltip. **No**
  hacer clic en "Cerrar sesión" en la sesión principal.
- **12.4 Panel a 1366×768 y 768×1024**: las 16 rutas de la lista, sin scroll horizontal
  (`scrollWidth <= innerWidth`), paleta nueva en las clases viejas, sidebar/menú correctos.
- **12.4 404**: `/no-existe`, `/pacientes/id-que-no-existe` (dentro del shell),
  `/portal/no-existe` (cálido, "Volver al inicio").
- **12.4 Error**: página temporal `(panel)/prueba-error`, "Reintentar", y borrarla.
- **12.4 Componentes sin consumidores**: página temporal `(panel)/prueba-sistema` con todo el
  catálogo (incluido `useConfirm`, `notify`, `DataTable` con 30 filas, `NumberInput`,
  `AdequacyBar`), a 1366 y 768, y borrarla. Ahí se ve también el arreglo de los puntos 1 y 2.
- **12.4 Portal a 360×780 y 1366×768** con token de `createPatientToken` (sin escribir en la
  base): barra inferior de 4 tabs ≥ 44 px, "Plan" presente, tono cálido (también en overlays por
  `:root:has(.theme-warm)`), tabs arriba en 1366, "Salir" de 44 px; "sin acceso" en ventana
  privada. No enviar el diario.
- **12.4 Login**: `/login` e `/inicio` en ventana privada a 1366 y 360, sin completar el login.
- **12.5 Teclado**: "Saltar al contenido" con el primer Tab; foco visible en cada ítem; colapsar
  con Enter y que persista al recargar; a 768 px "Abrir menú" con Enter, foco atrapado, Escape
  cierra y devuelve el foco; el Sheet se cierra al tocar un enlace; `Modal` de `/servicios` y de
  `/` con foco atrapado, Escape y clic afuera (sin guardar).
- **12.5 Movimiento reducido**: con `prefers-reduced-motion: reduce`, el Sheet y el Modal
  aparecen sin animación y la transición de ancho de la sidebar no se ve.
- **12.5 Contraste**: texto secundario de la sidebar, hint de un `Field` y `text-ink-faint` de
  una pantalla sin migrar ≥ 4,5; borde de `Input` ≥ 3.
- **12.6 Flujos**: abrir y cerrar sin enviar: "Nuevo turno" y el detalle de un turno en `/`,
  formulario de servicio, formulario de paciente y `/avisos`.
