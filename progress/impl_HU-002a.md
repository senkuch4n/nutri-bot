# impl HU-002a — `rediseno-ui-fundaciones` (Rediseño UI 1/4: fundaciones y shell)

**Estado: `done`** (código completo; typecheck, tests, `verify.sh` y greps de la SDD en verde).
**Con una salvedad importante para el orquestador**: el recorrido visual (SDD 12.4, 12.5 y 12.6)
**no se pudo hacer**, porque el `next dev` del usuario (pid 74126) no recarga `tailwind.config.ts`
y sirve 500 hasta que se reinicie. Detalle y causa raíz en "Lo que no se pudo verificar".

SDD: `Refactorizaciones/rediseno-ui-fundaciones.md`. HU: `docs/hu-rediseno-ui-empresarial.md`
(sección "Resoluciones"). Rama: `hu-002-rediseno-ui-empresarial`. Sin commits.

---

## Restricciones duras (copiadas tal cual de la SDD, sección 2)

1. Solo `apps/web`, más el `package-lock.json` de la raíz que cambia al instalar dependencias. No se tocan `schema.prisma`,
   `packages/`, `apps/bot`, ni ninguna server action existente (`**/actions.ts`,
   `**/*-actions.ts`), ni `apps/web/src/app/api/**`, ni `apps/web/src/lib/plan-pdf.tsx`. **Cero
   cambios de funcionalidad**: los dos server actions inline que viven en archivos que se
   reescriben (`signOut` de `nav.tsx` y `signIn` de login/inicio) se **mueven textualmente**, sin
   cambiar ni una línea de su cuerpo.
2. **No correr `next build` (ni `npm run build`) si hay un `next dev` levantado en `apps/web`**:
   corrompe `.next`. Comprobarlo antes con `pgrep -fl "next dev"`.
3. **WhatsApp: nunca mensajes reales.** En el recorrido no se envía ninguna difusión, no se
   reintentan avisos, no se da ningún turno (crear un turno encola una confirmación por
   WhatsApp) y no se pausa ni reanuda el bot.
4. **Base de desarrollo: solo lectura.** No se guarda ningún formulario durante el recorrido. Solo
   se abren y cierran modales. Si hiciera falta escribir algo, tiene que ser con datos propios que
   se borran por id (regla de `AGENTS.md`). En esta HU no debería hacer falta.
5. Rama `hu-002-rediseno-ui-empresarial`. **No commitear.** En el working tree ya hay cambios
   ajenos (`backlog.json`, `progress/current.md`, `docs/hu-rediseno-ui-empresarial.md`,
   `docker-compose.prod.yml`): no tocarlos.
6. No correr `prisma migrate`, `db push`, `db:seed` ni `seed:demo`.

Cumplimiento: no se escribió en la base (ni siquiera lecturas manuales: el recorrido no se hizo),
no se levantó el bot, no se mandó nada por WhatsApp, no se corrió `next build`, no se corrió
ningún comando de Prisma, no se tocó `backlog.json`. Los archivos ajenos siguen como estaban.

---

## Fase 0: preflight

- `git branch --show-current` → `hu-002-rediseno-ui-empresarial`.
- `git status --porcelain` inicial (archivos ajenos, no tocados):
  ```
   M backlog.json
   M progress/current.md
  ?? docker-compose.prod.yml
  ```
- `pgrep -fl "next dev"` → **sí hay dev server**: pid 74126 (`next dev`, arrancado 23:43:52),
  puerto 3000. Por eso **no se corrió `next build`**.
- `npm run typecheck --workspace apps/web` → verde (línea base).
- Versiones confirmadas: Tailwind 3.4.19, Next 15.5.24, Node **v24.15.0**.

---

## Archivos tocados

**Modificados**

- `apps/web/package.json` (19 dependencias nuevas, sección 4.7 de la SDD) y `package-lock.json` (raíz).
- `apps/web/tailwind.config.ts` — reescrito según 7.2 (tokens HSL via `token()`, alias LEGACY bajo
  comentario, `tailwindcss-animate`, sin `float-slow`). `import animate from "tailwindcss-animate"`
  tipa bien: no hizo falta el fallback con `require`.
- `apps/web/src/app/globals.css` — reescrito según 7.3 (tokens, `.theme-warm` + `:root:has(.theme-warm)`,
  base, `:focus-visible`, reduced-motion global, bloque LEGACY solo con `.press`/`.reveal`, tema
  FullCalendar). Agregado propio (autochequeo de guidelines): `a, button, [role="button"] { touch-action: manipulation }`.
- `apps/web/src/app/layout.tsx` — solo Inter (`--font-sans`); se borró Space Grotesk.
- `apps/web/src/app/(panel)/layout.tsx` — shell con sidebar (8.1). `auth()` + `redirect("/inicio")` intactos.
- `apps/web/src/app/(portal)/layout.tsx` — layout cálido con `PortalNav` (8.2), texto "sin acceso" literal.
- `apps/web/src/app/login/page.tsx`, `apps/web/src/app/inicio/page.tsx` — redirección de sesión + `<LoginScreen />`.
  `/inicio` conserva `export const dynamic = "force-dynamic"`.
- `apps/web/src/components/ui.tsx` — reescrito (6.2), API existente conservada + nuevos.
- `apps/web/src/components/brand.tsx` — `Wordmark` y `LeafMark` nuevos; `GoogleG` igual;
  `SpringShapes`, `CornerTriangle`, `Eyebrow` eliminados (en 6.3, después de reescribir login/inicio).
- `apps/web/src/components/modal.tsx` — sobre `Dialog` (misma API).
- `apps/web/src/components/evolution-chart.tsx`, `comparative-chart.tsx` — misma API; usan `chart-theme.ts`.

**Borrados**

- `apps/web/src/components/nav.tsx`, `apps/web/src/components/nav-links.tsx`.

**Creados**

- `apps/web/components.json`
- `apps/web/src/lib/utils.ts`, `notify.ts`, `shell.ts`, `chart-theme.ts`
- `apps/web/src/components/primitives/` (17): `button`, `dialog`, `alert-dialog`, `sheet`, `tabs`,
  `table`, `tooltip`, `dropdown-menu`, `skeleton`, `label`, `switch`, `checkbox`, `radio-group`,
  `toggle`, `toggle-group`, `separator`, `sonner`. Descargados del registry `new-york` v3 con el
  script determinista de 1.4 (sin CLI) y adaptados según 1.5.
- `apps/web/src/components/number-input.tsx`, `data-table.tsx`, `confirm.tsx`, `skeletons.tsx`,
  `status-screen.tsx`, `login-screen.tsx`
- `apps/web/src/components/shell/nav-config.ts`, `sidebar-content.tsx`, `app-sidebar.tsx`,
  `mobile-topbar.tsx`, `sign-out-button.tsx`, `portal-nav.tsx`
- `apps/web/src/app/(panel)/loading.tsx`, `error.tsx`, `not-found.tsx`
- `apps/web/src/app/(portal)/portal/loading.tsx`, `error.tsx`
- `apps/web/src/app/not-found.tsx`, `apps/web/src/app/global-error.tsx`
- `progress/impl_HU-002a.md` (este archivo)

No se creó ninguna ruta temporal (`prueba-sistema`, `prueba-error`): no tenía sentido sin poder
verla en el navegador (ver abajo). No queda nada temporal en el repo.

---

## Decisiones no obvias

1. **`sidebarItemClass` vive en `shell/nav-config.ts`, no en `sidebar-content.tsx`.**
   `sign-out-button.tsx` es un server component y `sidebar-content.tsx` es `"use client"`: un
   string exportado desde un módulo cliente le llegaría al server component como referencia de
   cliente, no como string (tsc no lo detecta). `nav-config.ts` es un módulo plano que pueden
   importar los dos lados.
2. **`AlertDialog` de `ConfirmProvider`**: el foco inicial va a "Cancelar" con
   `onOpenAutoFocus` explícito (`preventDefault` + `cancelRef.focus()`), además del default de
   Radix. Si llega un segundo `confirm()` con uno pendiente, el anterior se resuelve `false`.
3. **`switch.tsx`**: shadcn trae `border-2 border-transparent` (relleno estructural alrededor del
   pulgar, no un borde visible). Como el grep (1) de la SDD lo marcaba, se reemplazó por `p-0.5`,
   que da exactamente la misma geometría (h-5 w-9, pulgar h-4, `translate-x-4`).
4. **`alert-dialog.tsx` y `toggle-group.tsx`** del registry importaban desde
   `@/registry/new-york/ui/…` (no `@/components/ui/…`, que es lo que reemplazaba el script). Se
   corrigieron a `@/components/primitives/…`.
5. **Sheet del menú mobile**: lleva `SheetTitle` sr-only "Menú" y `SheetDescription` sr-only, en vez
   de `aria-describedby={undefined}`, para que Radix no avise y el lector tenga contexto.
6. **`Wordmark` en la sidebar colapsada**: el glifo `compact` va en una fila propia debajo del botón
   de expandir (en 56 px no entran los dos en una fila).
7. **`AdequacyBar`**: `role="meter"` + `aria-valuetext`. La marca de "supera el objetivo" es un
   `span` de 2 px al final de la barra, y además el texto de estado ("Por encima") siempre está.
8. **`chartSx`** tipado con `satisfies SxProps<Theme>` (de `@mui/material/styles`) de entrada, para
   que `sx={chartSx}` compile sin cast en los dos charts. `comparative-chart` conserva su
   `margin` propio (la SDD lo pide así).
9. **Estado del bot en la sidebar** se calcula en cada render del layout; en navegación cliente
   puede quedar desactualizado hasta recargar (O3 de la SDD, aceptado).
10. **`app/not-found.tsx`** aplica `theme-warm` al `<main>` cuando la ruta empieza con `/portal`,
    así el 404 del portal también sale cálido.
11. **Tooltip sobre el `account` slot** (botón "Cerrar sesión") solo en modo colapsado: `TooltipTrigger asChild`
    clona el `<form>` que renderiza el server component; la etiqueta accesible la da el `sr-only`.

---

## Skills

**`ui-styling`** (invocado antes de primitivos y tokens). Sus defaults contradicen la SDD en cuatro
puntos y **mandó la SDD** en todos: (a) sugiere `npx shadcn@latest init/add` → se descargó del
registry con el script determinista de 1.4; (b) sugiere `next-themes` para dark mode → sin
`next-themes`, `Toaster theme="light"`; (c) primitivos en `@/components/ui/` → en
`@/components/primitives/` (ya existe `ui.tsx`); (d) setup de Tailwind v4 (`@import "tailwindcss"`,
`@theme`) → Tailwind 3.4 con `@tailwind base/components/utilities` y `tailwind.config.ts`.
También se respetó `tailwind-merge` **2.6.1** (verificado en `node_modules/tailwind-merge/package.json`).

**`ui-ux-pro-max`** (invocado antes del JSX del shell, portal, login y estados). No se usó
`--design-system` porque el sistema ya está fijado por la SDD; se hicieron 5 búsquedas `--domain ux`
(sidebar/tooltip, skip link + foco, bottom nav + touch target, estado sin depender del color,
recuperación de errores). Todo lo devuelto coincide con lo que la SDD ya prescribía: skip link,
foco visible en cada control, activo con barra + `aria-current` (no solo color), estado del bot con
texto además del punto, tabs del portal `min-h-14` (≥ 44 px) con `gap` y `safe-area-inset-bottom`,
`pb-28` en el `main` para que la barra fija no tape contenido, pantallas de error con acción de
recuperación ("Reintentar" + volver). Nada contradijo la SDD.

**`web-design-guidelines`** (autochequeo final; reglas descargadas de
`vercel-labs/web-interface-guidelines`). Resultado sobre los archivos de la HU:

Corregido:
- `text-balance` en títulos y `text-pretty` en descripciones de `StatusScreen`, `EmptyState`,
  `LoginScreen` y la tarjeta "sin acceso" del portal (evita viudas).
- `overscroll-contain` en `DialogContent` y `SheetContent`.
- `touch-action: manipulation` en `a, button, [role="button"]` (capa base de `globals.css`).
- `SheetDescription` sr-only en el menú mobile (contexto para lector de pantalla).

No corregido, y por qué:
- **Comillas rectas** en `"portal"` del texto "sin acceso": la SDD exige el texto **literal** de hoy.
- **`transition-[width]`** en la sidebar (la guía pide animar solo transform/opacity): lo prescribe
  la SDD 8.1 textualmente; 200 ms y queda anulado con `prefers-reduced-motion`.
- **`<meta name="theme-color">`**: la SDD dice `metadata` sin cambios.
- **"Title Case" en títulos/botones**: regla anglosajona; la HU manda caso oración en español.
- **Virtualización de listas > 50 filas en `DataTable`**: la SDD la define con orden en cliente y
  scroll interno con encabezado fijo; la virtualización sería otra decisión (queda para quien la
  consuma con muchas filas).
- **`focus-visible:outline-none` en `main#contenido`** (`tabIndex={-1}`): es el destino del skip
  link; no es un control interactivo y un anillo alrededor de toda la página sería ruido.
- **Foco tapado por el header sticky mobile al tabular hacia atrás**: haría falta `scroll-padding-top`
  en `<html>`; el root layout no cambia más que la fuente según la SDD. Menor.
- **Skip link en el portal**: la SDD solo lo pide en el panel; el portal tiene 4 enlaces de nav.

---

## Verificación (sección 12 de la SDD)

### 12.1 Compilación y arnés

| Comando | Resultado |
|---|---|
| `npm run typecheck --workspace apps/web` | verde (después de cada fase 1–7 y al final) |
| `npm run typecheck` (core, db, bot, web) | verde en los 4 workspaces |
| `npm run test` | 7 archivos, **49 tests pasados** (sin cambios en `packages/core`) |
| `./ops/harness/verify.sh` | `Arnés OK.` (backlog válido, 1 HU activa; `apps/web: typecheck limpio`) |
| `npm run build --workspace apps/web` | **no se corrió**: hay `next dev` vivo (pid 74126), como manda la SDD |
| `npx tailwindcss -c tailwind.config.ts -i src/app/globals.css -o <scratch>` | compila sin errores (verifica config + `@apply` de globals.css fuera del dev server) |

### 12.2 Alcance del diff

- `git diff --stat -- packages apps/bot` → vacío.
- `git diff --name-only -- '**/actions.ts' '**/*-actions.ts' api plan-pdf.tsx auth.ts auth.config.ts middleware.ts` → vacío
  (`middleware.ts` sin cambios, como pidió el orquestador).
- `git status --porcelain | grep prueba-` → vacío.
- Fuera de `apps/web/` solo cambian `package-lock.json`, este archivo y los ajenos de la Fase 0.
- Los actions inline se movieron textuales (verificado con `git show HEAD:…` vs archivo nuevo):
  `signOut({ redirectTo: "/inicio" })` en `shell/sign-out-button.tsx`;
  `signIn("google", { redirectTo: "/" })` en `login-screen.tsx`.

### 12.3 Sistema viejo

| Chequeo | Resultado |
|---|---|
| (1) tokens/clases viejas en los archivos de la HU | **0 líneas** (tras el cambio de `switch.tsx`) |
| (2) hex fuera de `brand.tsx` (GoogleG) y `chart-theme.ts` | **0** |
| (3) global `SpringShapes|CornerTriangle|Eyebrow|Space_Grotesk|btn-*|float-slow|components/nav` en `src` | **0** |
| (4) `nav.tsx` y `nav-links.tsx` borrados | OK |
| (5) `tailwind-merge` | **2.6.1** |
| (6) alias LEGACY en `tailwind.config.ts` | todos bajo comentarios `LEGACY` (líneas 15, 41, 54, 57, 58) |
| (7) `confirm(` nativos | exactamente los 3 de 002b/c/d (`broadcast-form`, `delete-plan-button`, `delete-template-button`) |
| Sin `console.*` en `error/not-found/global-error` | OK |
| `grep -rn "components/ui/\|next-themes" primitives` | solo el comentario de `sonner.tsx` que explica que no se usa |

### 12.4 – 12.6 Recorrido visual, teclado, movimiento, contraste, flujos: **NO REALIZADO**

**Causa raíz.** Al reescribir `tailwind.config.ts`, el `next dev` del usuario empezó a responder
**500** en todas las rutas con:
`Syntax error: globals.css The 'border-border' class does not exist`. Es decir, sigue usando el
config viejo (sin el color `border`). Comprobado que no es un error del código: el mismo config +
CSS compilan con el CLI de Tailwind. El motivo está en
`node_modules/tailwindcss/lib/lib/setupTrackingContext.js`: Tailwind 3.4 recarga el config borrando
`require.cache[...]`, pero en **Node 24** un `tailwind.config.ts` con sintaxis ESM se carga vía
`require(esm)` con type-stripping, cuya caché no se puede invalidar (el propio código de Tailwind
tiene el comentario "may be undefined. Happens in Node 22.18+"). Resultado: el dev server queda
con el config de cuando arrancó hasta que se reinicie. Probé `touch` de config y CSS: sin efecto.

No reinicié el proceso del usuario ni levanté otro `next dev` (prohibido: comparten `.next`), ni
corrí `next build`.

**Qué tiene que hacer el usuario/orquestador**: reiniciar `npm run dev` (Ctrl-C y volver a
levantarlo). A partir de ahí el panel compila con los tokens nuevos. Después, queda pendiente todo
12.4–12.6; lo más importante a mirar, porque tsc no lo cubre:

1. Límites servidor/cliente en runtime: `(panel)/layout.tsx` pasa `<SignOutButton />` (server) como
   prop `account` a `AppSidebar`/`MobileTopbar` (cliente), y `SidebarContent` lo envuelve en
   `TooltipTrigger asChild` cuando la sidebar está colapsada.
2. `/` , `/pacientes`, `/ajustes`: renderizan con la paleta nueva en las clases viejas; sin scroll
   horizontal (`document.documentElement.scrollWidth <= window.innerWidth`).
3. Sidebar a 1366 px: colapsar/expandir con clic y con Enter, recargar y que persista (cookie
   `nb-sidebar`), tooltips a la derecha en modo colapsado, estado del bot con texto.
4. 768 px: "Abrir menú" abre el Sheet, Tab atrapado, Escape cierra y devuelve el foco; se cierra al
   tocar un enlace.
5. `Modal` de nuevo servicio en `/servicios` y de nuevo turno en `/`: foco atrapado, Escape, clic
   afuera. **Sin guardar.**
6. Portal a 360 px (token con `createPatientToken`, ver 12.4): barra inferior con 4 tabs ≥ 44 px,
   "Plan" presente, tono cálido; a 1366 px tabs arriba. "Sin acceso" en ventana privada.
7. `/login` e `/inicio` en ventana privada. `/no-existe`, `/pacientes/id-que-no-existe`,
   `/portal/no-existe`.
8. Página temporal `prueba-sistema` con todos los componentes y `prueba-error` (y borrarlas), como
   describe 12.4.
9. Contraste en DevTools: `muted-foreground` ≥ 4,5, borde `input` ≥ 3.

Si el orquestador prefiere, se me puede relanzar solo para el recorrido una vez reiniciado el dev
server; el código no tendría que cambiar.

---

## Contrato compartido (SDD 6.2): confirmación de firmas

- `packages/db/domain` y `packages/core`: **sin cambios** (diff vacío).
- `src/lib/utils.ts`: `cn(...inputs: ClassValue[]): string` = `twMerge(clsx(inputs))`. `ui.tsx` lo re-exporta.
- `ui.tsx`: `Card` (`children, className?, title?, description?, actions?, padding?: "md"|"none"`),
  `PageHeader` (`title, description?, action?, back?: {href,label}`), `SectionLabel`, `Button`
  (`variant?: primary|secondary|danger|ghost|link; size?: sm|md|lg|icon; loading?`), `ButtonLink`,
  `StatTile`, `Field` (`label, children, hint?, error?`), `FormError({ message?: string|null })`,
  `inputClass` (string exacto de la SDD), `Input`, `Select` (nativo, `pr-8`), `Textarea`
  (`h-auto min-h-20 py-2`), `Badge` (tonos nuevos + alias viejos), `Alert`, `EmptyState`, `Quantity`,
  `AdequacyBar`. Mapa de variantes/tamaños igual al de la SDD. `LoaderCircle` en `loading`.
- `number-input.tsx`: `NumberInput(props: Omit<ComponentProps<"input">,"type"> & { unit: string })`.
- `data-table.tsx`: `DataTableColumn<T>` (`id, header, cell, numeric?, sortValue?, className?`) y
  `DataTable<T>` (`columns, rows, getRowId, rowHref?, empty?, maxHeightClassName?, initialSort?, caption?`).
  `Intl.Collator("es", { numeric: true, sensitivity: "base" })`, `Date` por `getTime()`, `null` al
  final, `aria-sort`, clic en fila ignorado dentro de `a, button, input, select, textarea, label`.
- `confirm.tsx`: `ConfirmOptions`, `ConfirmProvider`, `useConfirm(): (o) => Promise<boolean>`; error
  textual `"useConfirm necesita <ConfirmProvider> (está en el layout del panel)"`.
- `modal.tsx`: `Modal({ open, onClose, title, children })` sobre `Dialog`, `aria-describedby={undefined}`.
- `lib/notify.ts`: `notify.saved/error/info` y `useActionToast(state, options?)` con los textos por defecto de la SDD.
- `lib/shell.ts`: `BotShellStatus`, `getProfessionalDisplayName()`, `getBotShellStatus()` (nunca tiran).
- `lib/chart-theme.ts`: `chartSeriesColors` (los 5 hex exactos), `chartDefaultColor`, `chartSx`, `chartMargin = {12,16,28,44}`.
- `skeletons.tsx`: `PageSkeleton`, `TableSkeleton({ rows?, columns? })`, `CardSkeleton({ lines? })`.
- `status-screen.tsx`: `StatusScreen({ icon?, title, description, actions?, detail? })`.
- `brand.tsx`: `Wordmark({ className?, subtitle?, compact? })`, `LeafMark`, `GoogleG`. Eliminados `SpringShapes`, `CornerTriangle`, `Eyebrow`.
- `login-screen.tsx`: `LoginScreen()`.
- `shell/nav-config.ts`: `navGroups`, `settingsItem`, `SIDEBAR_COOKIE = "nb-sidebar"`, `isActive`, `sidebarItemClass` (agregado, ver decisión 1).
- `shell/portal-nav.tsx`: `PortalNav({ variant: "top"|"bottom", className? })`.
- Primitivos: exports de shadcn intactos; agregados `numeric?` en `TableHead`/`TableCell` y `containerClassName?` en `Table`.
- Textos exactos: estado del bot ("WhatsApp conectado" / "Bot pausado" / "WhatsApp desconectado"),
  "Cerrar sesión", "Saltar al contenido", "Abrir menú", "Contraer/Expandir barra lateral", pantallas
  de error y 404, login y "sin acceso", según la SDD.

---

## Ronda de resolución 1 (2026-09-24)

**Estado: `done`.** Alcance: los dos pedidos del reviewer (`review_HU-002a.md`), el hallazgo de la
sidebar del recorrido (`recorrido_HU-002a.md`) y la duda opcional de `global-error.tsx`. Sin
commits, sin tocar `backlog.json`, sin `next dev`/`next build` propios (el del usuario sigue vivo,
pid 86416), sin escribir en la base, sin WhatsApp.

### Archivos tocados

- `apps/web/src/components/ui.tsx` (punto 1)
- `apps/web/src/components/number-input.tsx` (punto 2)
- `apps/web/src/components/shell/sidebar-content.tsx` (punto 3)
- `apps/web/src/app/global-error.tsx` (punto 4)
- `progress/impl_HU-002a.md` (esta sección)

No se tocó `sign-out-button.tsx`, `app-sidebar.tsx`, `mobile-topbar.tsx` ni `nav-config.ts`: la
compactación entra toda en `SidebarContent`, que comparten la sidebar de escritorio y el Sheet.

### Punto 1 — `Quantity` con espacio duro (`ui.tsx`)

El archivo ya tenía un U+00A0 **literal** dentro del string (`{" " + unit}` con NBSP real, que
un editor muestra igual que un espacio; por eso el reviewer lo leyó como espacio común). Se
reemplazó por el escape explícito `{" " + unit}` con un comentario al lado, para que sea
inequívoco en cualquier diff. `AdequacyBar` usa `Quantity` para el objetivo (`ui.tsx:233`), así
que hereda el arreglo. Firma sin cambios.

### Punto 2 — `NumberInput` y `aria-describedby` (`number-input.tsx`)

- `"aria-describedby": describedBy` se desestructura de `props`, así el spread no lo pisa.
- Ids unidos con `[describedBy, unitId].filter(Boolean).join(" ")` (sin `cn`).
- `aria-describedby` va **después** de `{...props}` (redundante con la desestructuración, pero
  deja la intención a la vista).
- Firma del contrato 6.2 sin cambios: `NumberInput(props: Omit<ComponentProps<"input">, "type"> & { unit: string })`.

### Punto 3 — Sidebar sin scroll a 650 px (`sidebar-content.tsx`)

Skill `ui-ux-pro-max` (`--domain ux`): el mínimo web de target es 24 CSS px (WCAG 2.2), 44 pt es
regla nativa; la sugerencia de densidad es no sacrificar el aire entre grupos. Con eso se decidió
**no bajar los ítems de `h-8`** (32 px: mantienen su hit area en el Sheet táctil y el valor de la
SDD 8.1) y compactar lo que no es navegación primaria:

| Cambio | Antes | Ahora | Ahorro |
|---|---|---|---|
| Título de grupo 1 (`text-xs`, línea 16 px) | `pt-4 pb-1` = 36 px | `pt-2 pb-1` = 28 px | 8 |
| Títulos de grupos 2–5 | `pt-4 pb-1` = 36 px c/u | `pt-3 pb-1` = 32 px c/u | 16 |
| Fila de estado del bot (`text-xs`) | `h-8` = 32 px | `h-7` = 28 px | 4 |
| Cuenta: email + "Cerrar sesión" | 2 filas: 24 (`pt-2` + 16) + 2 + 32 = 58 px | 1 fila `flex` de 32 px | 26 |
| **Total** | | | **54 px** |

Medición (todas alturas declaradas en clases; Tailwind preflight usa `border-box`, así el borde va
dentro del `h-*`; `text-xs` tiene `line-height: 1rem`):

- **Escritorio expandida** (`w-60`):
  - Encabezado `h-14` = **56**.
  - `nav` (`px-2 pb-2`): títulos 28 + 4×32 = 156; 9 ítems × 32 = 288; `space-y-0.5` dentro de los
    grupos (2 + 1 + 1 = 4 huecos) = 8; `pb-2` = 8 → **460** (antes 484, que coincide con el
    `scrollHeight` 484 del recorrido: el modelo cierra).
  - Pie (`border-t p-2 space-y-0.5`): 1 + 8 + Ajustes 32 + 2 + estado 28 + 2 + fila cuenta 32 + 8 → **113**
    (antes 143, que coincide con 663 − 56 − 464 del recorrido).
  - **Total 629 px** (antes 683). A **650 px** sobran 21 px; a 663 (notebook 1366×768 con
    navegador) sobran 34 px. Sin scroll.
- **Sheet (< 1024 px)**: encabezado `h-14` 56 + el mismo `SidebarContent` 460 + 113 = **629 px**.
  Entra a 650 con el mismo margen.
- **Escritorio colapsada** (`w-14`): 56 + fila del glifo `h-10` 40 + `nav` (pt-2 8 + 4 separadores
  × 17 + 288 + 8 + 8 = 380) + pie (1 + 8 + 32 + 2 + 28 + 2 + 32 + 8 = 113) = **589 px**.
- Por debajo de ~629 px de alto sigue actuando el `overflow-y-auto` del `nav` (red de seguridad,
  se dejó tal cual).

Detalles de la fila de cuenta (solo expandida; colapsada se renderiza como antes: el botón solo,
centrado, con tooltip):

- `div.flex.items-center.gap-1` → email `min-w-0 flex-1 truncate px-2 text-xs text-muted-foreground`
  con `title={email}` + `div` con el slot `account` (`shrink-0`; `flex-1` si no hay email).
- El botón "Cerrar sesión" conserva ícono `LogOut` + texto visible (SDD 8.1): no se pasó a
  icon-only para no esconder la salida detrás de un tooltip.
- Trade-off: en 224 px útiles (240 − `p-2`) el botón ocupa ~134 px, así que el email dispone de
  ~86 px (unos 13–14 caracteres en `text-xs`) antes de truncarse; el email completo queda en el
  `title`. En el Sheet (`w-72`, 272 útiles) el email tiene ~134 px. Se prefirió esto a bajar los
  ítems a 28 px o a un botón icon-only.
- `SignOutButton` (`w-full` en `sidebarItemClass`) dentro de un contenedor `shrink-0` de ancho
  automático resuelve a su ancho de contenido; no hizo falta tocar el server component.

Comentario en el código apuntando a esta medición.

### Punto 4 — `global-error.tsx` sin serif

Se carga `Inter` con `next/font/google` (`variable: "--font-sans"`, misma config que
`app/layout.tsx`) y `<html className={sans.variable}>`. `next/font` funciona en módulos
`"use client"` (es una transformación de SWC a nivel de módulo). Así `font-sans` del `body`
(`var(--font-sans), …`) resuelve aunque `global-error` reemplace el layout raíz.

### Autochequeo `web-design-guidelines` (sobre los 4 archivos)

Sin `WebFetch` en este entorno, se aplicaron las reglas ya descargadas en la ronda anterior:

- Unidad pegada al número con NBSP (regla "no orphans / non-breaking space before units"): punto 1.
- `NumberInput`: `aria-describedby` acumulativo (hint/error del consumidor + unidad),
  `inputMode="decimal"`, `tabular-nums`: OK.
- Sidebar: targets ≥ 24 px (ítems 32, estado 28, botón 32); texto truncado con `title`; activo
  con `aria-current` + barra (no solo color); sin botones icon-only nuevos; el `overflow-y-auto`
  se mantiene para alturas menores. OK.
- `global-error`: fuente consistente con el resto (punto 4). OK.
- Pendiente ya conocido (no de esta ronda): `PageSkeleton` anida `role="status"` (duda del reviewer).

### Verificación

| Comando | Resultado |
|---|---|
| `npm run typecheck --workspace apps/web` | verde |
| `./ops/harness/verify.sh` | `Arnés OK.`, exit 0 (`apps/web: typecheck limpio`) |
| `git diff --stat -- packages apps/bot` | vacío |
| `git status --porcelain \| grep prueba-` | vacío |
| `next dev` / `next build` | no se corrieron (dev server del usuario vivo) |

Contrato 6.2: `Quantity`, `AdequacyBar`, `NumberInput` y `SidebarContent` conservan firmas y
textos ("Cerrar sesión", estados del bot). Lo que falta ver en navegador (orquestador): la
sidebar a 663 px sin scroll, la fila de cuenta expandida (truncado del email) y `NumberInput` con
un `aria-describedby` propio en `prueba-sistema` si se arma.
