# SDD — HU-017a `rediseno-apple-fundaciones` (Rediseño Apple 1/5: fundaciones y shell)

- **HU de origen:** `docs/hu-rediseno-apple.md` (paraguas HU-017, validada). Esta SDD cubre **solo la fila
  HU-017a** de la sección 6 y los criterios de la sección 7.1.
- **Manda la sección "Resoluciones" de la HU:** acento **azul de sistema `#0066CC`** (el verde de la
  sección 5.2 se lee como azul; el verde queda solo en el logo; el verde de éxito es semántico aparte),
  **Inter variable con eje `opsz`**, **Motion** para springs/gestos/interrupción (press y hover en CSS),
  **página demo interna** solo en desarrollo. Resto según las recomendaciones (D2 portal cálido solo en
  el fondo agrupado; D3 modo oscuro después, con tokens listos; D5 los sheets solo oscurecen; D7
  arrastrar para cerrar sheets sí, swipe en filas no; D9 no tocar "Numa"; D11 mergear después del PR #7).
- **Rama:** `feat/hu-017-rediseno-apple`. **Se mergea después del PR #7** (imleticio).
- **Skills aplicados:** `apple-design` (cada decisión cita su principio: §1…§17 del skill, igual que la
  HU), `refactor` (diagnóstico, radio de impacto, checklist sin romper en el medio), `ui` (especificación
  por componente y por pantalla).

---

## 1. Resumen funcional

HU de presentación pura. Reemplaza el sistema visual estilo Notion de HU-002a por un lenguaje Apple:
un único juego de tokens (paleta con tint azul, escala tipográfica con tracking y leading por tamaño,
radios concéntricos, elevación en tres niveles, materiales translúcidos para el chrome, duraciones y
springs), Inter variable con tamaño óptico, Motion para el movimiento interrumpible, todos los
primitivos de `components/primitives/` y los componentes de `components/ui.tsx` re-estilados con la
**misma API**, tres componentes nuevos (control segmentado, lista agrupada, métrica), el shell
completo (sidebar, topbar móvil, header y tab bar del portal), login/`/inicio`, pantallas de estado,
tema de FullCalendar y colores de Recharts desde los tokens, y una página demo interna para aprobar el
lenguaje antes de migrar pantallas (017b–e). No cambia datos, reglas, validaciones, textos del bot ni
ningún archivo de la zona de imleticio.

## 2. Workspaces afectados

| Workspace | ¿Se toca? | Detalle |
|---|---|---|
| `apps/web` | **sí** | Todo el cambio vive acá. |
| `apps/bot` | **no** | Sin cambios. No hace falta correr su typecheck salvo el global. |
| `packages/core` | **no** | La lógica nueva es de presentación (contraste, springs, gestos): va a `apps/web/src/lib/` con tests vitest (ver §16 y D-T9). |
| `packages/db` | **no** | Sin cambios de schema ni de `domain/`. |

No hay base de datos ni WhatsApp en juego. Ninguna verificación escribe en la base.

---

## 3. Diagnóstico (skill `refactor`)

Qué está mal o es mejorable hoy, con el archivo exacto. Los hallazgos completos están en la HU (§2 y §4);
acá solo lo que esta HU resuelve.

| # | Problema | Dónde | Principio | Lo resuelve |
|---|---|---|---|---|
| G1 | Tokens repartidos: HSL a mano en `globals.css`, radios en `--radius`, hex de gráficos en `chart-theme.ts`, px fijos en `sidebar-layout.css`, duraciones sueltas (280 ms, 500/300 ms, 150 ms). No hay un lugar único ni forma de testear el contraste. | `globals.css:6-66`, `tailwind.config.ts`, `lib/chart-theme.ts`, `shell/sidebar-layout.css` | §16 Craft ("nada es aleatorio") | `lib/design-tokens.ts` como fuente única (§7) |
| G2 | Paleta Notion: acento casi negro (`--primary: 45 4% 18%`), grises cálidos. | `globals.css:13` | §16 Craft/Delight, T9 | Paleta Apple con tint `#0066CC` (§7.1) |
| G3 | Sin un solo `:active` en `apps/web`; `hover:` sin `@media (hover: hover)` queda pegado en táctil. | todos los primitivos | §1 Response, T1/T2 | Utilidades `press*`, variante `pressed:` y `future.hoverOnlyWhenSupported` (§7.6, §9.0) |
| G4 | Dialog/Sheet/menús con `@keyframes` (`tailwindcss-animate`): no interrumpibles; Sheet 500 ms `ease-in-out`; Dialog con desplazamiento diagonal. | `primitives/dialog.tsx:31`, `sheet.tsx:34`, `dropdown-menu.tsx:69`, `popover.tsx:24` | §3, §4, §7 | Motion + patrón Radix `forceMount`/`AnimatePresence` (§9.0) |
| G5 | Sidebar: FLIP con `scaleX` estira el contenido durante 280 ms; reinicia sin velocidad. | `shell/app-sidebar.tsx:41-63` | §11, §3 | Spring sobre el ancho del slot (§10.1) |
| G6 | Chrome opaco con borde de 1 px permanente (topbar, header y tab bar del portal). | `mobile-topbar.tsx:36`, `(portal)/layout.tsx:33`, `portal-nav.tsx:28` | §12 | Materiales + scroll edge (§7.5, §10) |
| G7 | Regla global de reduced-motion que lleva **todo** a 0,01 ms (también fades útiles); nada para transparencia ni contraste. | `globals.css:91-99`, `sidebar-layout.css:154-165` | §14 | Política por componente + media queries nuevas (§7.7) |
| G8 | Inputs de 14 px → zoom automático en Safari iOS. | `components/ui.tsx:299-300` | §16 Flexibility, T17 | Regla global ≥ 16 px en `pointer: coarse` (§9.2) |
| G9 | X de cierre de 16 px, ítems de menú móvil de 32 px. | `sheet.tsx:67`, `dialog.tsx:47`, `nav-config.ts:71` | §10, T16 | Utilidad `touch-target` (44 px) y densidad táctil (§9.0, §10.2) |
| G10 | Tipografía: `tracking-tight` fijo, sin leading por tamaño, sin `opsz`. | `app/layout.tsx:5-9`, `ui.tsx:89` | §15 | Escala con tracking/leading (§7.2), Inter `opsz` |
| G11 | Pestañas, segmentados y sidebar: el indicador salta. | `primitives/tabs.tsx:33`, `toggle.tsx:10`, `sidebar-content.tsx:62` | §7, §8 | `layoutId` con spring (§9) |
| G12 | Skeleton teñido con el primario (`bg-primary/10`): con un primario azul quedaría celeste. | `primitives/skeleton.tsx:9` | §16 Craft | Relleno `fill` (§9.3) |
| G13 | `tailwind-merge` v2 no conoce tamaños de fuente con nombre: `cn("text-foreground", "text-headline")` borraría el color. Riesgo latente apenas se agreguen tokens tipográficos. | `lib/utils.ts` | §16 Craft | `extendTailwindMerge` + test (§6.3) |

Lo que se **conserva** (positivo en la auditoría): estructura de workspace flotante sobre la sidebar
(S9), rail colapsado con tooltips, safe areas y 56 px de la barra del portal (P7), Sheet no modal del
turno (C6), `touch-action: manipulation`, foco visible, la API de todos los componentes.

---

## 4. Decisiones técnicas

| ID | Decisión | Por qué (principio) |
|---|---|---|
| D-T1 | **Fuente única de tokens en TypeScript**: `apps/web/src/lib/design-tokens.ts` (sin imports, sin `@/`). `tailwind.config.ts` lo importa por ruta relativa y genera las variables CSS con un plugin `addBase`; `chart-theme.ts` lo importa para los hex de SVG; los tests de vitest lo importan para medir contraste. `globals.css` solo contiene reglas que **usan** variables, nunca valores. | §16 Craft; criterio "un único juego de tokens"; contraste testeable (criterio "Contraste accesible"). |
| D-T2 | Se **conservan los nombres shadcn** (`primary`, `muted-foreground`, `border`, `accent`…) mapeados a los valores nuevos, y se agregan roles nuevos al lado. Así las ~25 pantallas (y la zona de imleticio) toman el lenguaje sin tocar su código. | HU §11, R1. |
| D-T3 | **Motion `^14.0.0`** (`motion/react`). Verificado en npm (2026-10-03): `latest = 14.0.0`, peer `react ^18 \|\| ^19`; exporta `m`, `LazyMotion`, `domMax`, `MotionConfig`, `AnimatePresence`, `useReducedMotion`, `LayoutGroup`, `useMotionValue`, `animate`; los springs aceptan `bounce` y `visualDuration`. Se usa `LazyMotion` con `domMax` **cargado de forma asíncrona** y `strict` (obliga a `m.*`, nunca `motion.*`). `domMax` hace falta porque `layoutId` (indicadores) y `layout` (listas, 017b) son features de layout. | §3–§6 (springs interrumpibles con velocidad), R8 (peso). |
| D-T4 | Springs con `{ type: "spring", bounce, visualDuration }`. `visualDuration` es el tiempo en llegar visualmente al destino = el *response* de Apple; `bounce` ≈ 1 − *damping ratio*. Por defecto `bounce: 0` (críticamente amortiguado); rebote solo después de un gesto con impulso. | §4 (defaults y valores de Apple). |
| D-T5 | **Press y hover en CSS**, no en Motion: utilidades `press`, `press-sm`, `press-none` y variante Tailwind `pressed:`. Componentes server siguen siendo server. | §1 (respuesta en pointer-down), R8. |
| D-T6 | **Radix + Motion**: el patrón se define una vez (§9.0): un wrapper del `Root` refleja `open` (controlado o no) en un contexto; el `Content`/`Overlay` se renderiza con `forceMount` + `asChild` sobre `m.div` dentro de `AnimatePresence`. Verificado en `@radix-ui/react-dialog@1.1.23`: con `forceMount`, `trapFocus` y `disableOutsidePointerEvents` dependen de `context.open`, así que **durante la salida no se bloquea la entrada** (§3) y el foco vuelve al disparador al desmontar. | §3, §7, R9, criterio de teclado. |
| D-T7 | `tailwindcss-animate` **se queda** solo para el Tooltip (fade+scale de 150 ms) y el `animate-spin`/`animate-pulse` existentes. Todo lo manipulable o interrumpible (sheets, dialogs, popovers, menús, indicadores, switch, sidebar) pasa a Motion. No se elimina el plugin en esta HU (lo usan pantallas fuera de alcance). | §3 aplica a lo que se toca; un tooltip no se agarra. |
| D-T8 | **Tailwind 3.4** con `future: { hoverOnlyWhenSupported: true }`: todos los `hover:` del repo (incluida la zona de imleticio) quedan dentro de `@media (hover: hover) and (pointer: fine)`. Sin migrar a v4. | §1, T2, M5; HU §10. |
| D-T9 | Helpers puros de presentación (contraste, springs, proyección de momentum, rubber-band, decisión de cerrar) en `apps/web/src/lib/` con `*.test.ts` al lado. El `vitest.config.ts` de la raíz ya resuelve `@` → `apps/web/src` y ya corre tests de `apps/web/src/lib` (`food-policy.test.ts`, `meal-view.test.ts`). No van a `packages/core` porque no son dominio y la HU deja `packages/**` fuera de alcance. | AGENTS.md "Dónde va la lógica" (la regla es para dominio); HU §10. |
| D-T10 | Inter con `next/font/google` y `axes: ["opsz"]` (confirmado en `font-data.json` de Next 15.5.24: Inter trae `opsz` 14–32 y `wght` 100–900). Un solo módulo `app/fonts.ts` que importan `layout.tsx` y `global-error.tsx`. `adjustFontFallback` (por defecto) evita el CLS. Los PDF no cambian en esta HU (017c). | §15, D4. |
| D-T11 | Página demo en `/dev-diseno` (dentro de `(panel)`, con shell) y `/dev-diseno-portal` (raíz, con el shell del portal y datos falsos). Ambas hacen `notFound()` si `process.env.NODE_ENV === "production"`, `robots: noindex`, y no aparecen en ninguna navegación. | §17 (prototipar), D12, R7. |
| D-T12 | **Arrastrar para cerrar** con Pointer Events propios + `MotionValue` (no el `drag` de Motion): hace falta rubber-band progresivo (§9), histéresis de 10 px y bloqueo de eje (§10), respetar el punto de agarre (§2) y tomar el valor presente al interrumpir (§3). El `dragElastic` de Motion es lineal. | §2, §3, §5, §6, §9, §10. |

---

## 5. Esquema

No cambia. Sin migraciones. La preferencia de la sidebar sigue en la cookie `nb-sidebar`.

---

## 6. Contrato compartido

### 6.1 `packages/db/domain` y `packages/core`

Sin cambios. Web y bot no se afectan entre sí.

### 6.2 Contrato de UI de `apps/web` (lo consumen todas las pantallas, la zona de imleticio y 017b–e)

**Regla dura (R1): ninguna firma pública cambia.** Solo se agregan props **opcionales**, valores nuevos
a uniones existentes y exports nuevos.

| Módulo | Exports que NO cambian de firma | Agregados (opcionales / nuevos) |
|---|---|---|
| `components/ui.tsx` | `cn`, `Card`, `PageHeader`, `SectionLabel`, `Button`, `ButtonLink`, `StatTile`, `Quantity`, `AdequacyBar`, `Field`, `FormError`, `inputClass`, `Input`, `Select`, `Textarea`, `Badge`, `Alert`, `EmptyState` | `ButtonVariant` suma `"tinted" \| "plain"`. Export nuevo `Metric` (§9.4). |
| `primitives/button.tsx` | `Button`, `buttonVariants`, `ButtonProps` (variants `default`, `destructive`, `outline`, `secondary`, `ghost`, `link`; sizes `default`, `sm`, `lg`, `icon`) | variants `tinted`, `plain`, `destructive-tinted`; sizes `icon-sm`, `icon-lg`. |
| `primitives/dialog.tsx` | todos (`Dialog`, `DialogPortal`, `DialogOverlay`, `DialogTrigger`, `DialogClose`, `DialogContent`, `DialogHeader`, `DialogFooter`, `DialogTitle`, `DialogDescription`) | — (`Dialog` pasa de re-export a componente con la misma firma que `DialogPrimitive.Root`). |
| `primitives/alert-dialog.tsx` | todos | — (idem). |
| `primitives/sheet.tsx` | todos | `SheetContent`: `dismissOnDrag?: boolean` (default `true`). `side="bottom"` muestra grabber. |
| `primitives/popover.tsx` | todos | — |
| `primitives/dropdown-menu.tsx` | todos | `DropdownMenuItem`: `variant?: "default" \| "destructive"`. |
| `primitives/tabs.tsx` | `Tabs`, `TabsList`, `TabsTrigger`, `TabsContent` | — (`Tabs` pasa a componente con la misma firma que `TabsPrimitive.Root`). |
| `primitives/switch.tsx`, `checkbox.tsx`, `radio-group.tsx`, `label.tsx`, `separator.tsx`, `skeleton.tsx`, `table.tsx`, `toggle.tsx`, `toggle-group.tsx`, `tooltip.tsx`, `sonner.tsx`, `chart.tsx` | todos | — (`TableRow` aplica press automáticamente si recibe `onClick`). |
| `components/shell/*` | `AppSidebar`, `MobileTopbar`, `SidebarContent`, `PortalNav`, `SignOutButton`, `navGroups`, `settingsItem`, `SIDEBAR_COOKIE`, `isActive`, `sidebarItemClass`, tipos | `SidebarContent`: `density?: "default" \| "touch"`. `PortalNav`: `activeHref?: string` (solo la demo). Nuevos: `PortalHeader`, `useOptimisticPath`, `useScrollEdge`. |
| `components/status-screen.tsx`, `skeletons.tsx`, `login-screen.tsx`, `confirm.tsx`, `modal.tsx`, `submit-button.tsx` | todos | — |
| `lib/notify.ts` | `notify`, `useActionToast` | — (no se toca; cambia solo el `Toaster`). |
| `lib/chart-theme.ts` | `chartSeriesColors`, `chartDefaultColor`, `chartStudyColors`, `studyColor`, `chartMetricColors`, `isakTissueColors` (mismas claves y tipos `readonly` de string) | — (cambian los valores). |
| `lib/utils.ts` | `cn` | — (internamente usa `extendTailwindMerge`). |

**Cambios de aspecto deliberados en la API conservada** (no de firma; los ve toda pantalla que los use):

| Uso | Antes | Ahora | Por qué |
|---|---|---|---|
| `Button variant="primary"` / `buttonVariants()` | negro | **filled** tint `#0066CC` | §16 color como señal |
| `Button variant="secondary"` | outline con borde | **gray** (relleno `fill`) | Apple *gray* button; menos líneas |
| `Button variant="danger"` | rojo lleno | **destructive-tinted** (texto rojo sobre rojo suave) | §16 Agency, T13: el rojo lleno queda solo para la confirmación final (`buttonVariants({variant:"destructive"})` del `ConfirmProvider`) |
| `Button variant="ghost"` / `"link"` | gris / subrayado | plain neutro / plain tint sin subrayado (subrayado en hover) | §16 Familiarity |
| `Card` | borde 1 px, radio 8 | sin borde, anillo 0,5 px + sombra nivel 1, radio 16 | §12 |
| `PageHeader` título | 24 px `tracking-tight` | Title 1 28/34 700 | §15 |
| `ToggleGroupItem` encendido | gris | `primary-soft` + texto tint | selección = acento |

### 6.3 Módulos nuevos (firmas exactas)

```ts
// apps/web/src/lib/design-tokens.ts — fuente única. Sin imports. Valores en hex (o número).
export const colors: Record<ColorToken, `#${string}`>;          // §7.1, modo claro
export type ColorToken = /* union literal de las claves de §7.1 */;
export const portalColorOverrides: Partial<Record<ColorToken, `#${string}`>>; // { grouped: "#FBFAF7" }
export const materials: {
  chrome: { alpha: 0.8; blurPx: 20; saturate: 1.8 };
  bar:    { alpha: 0.85; blurPx: 24; saturate: 1.8 };
  float:  { alpha: 0.85; blurPx: 24; saturate: 1.8 };
};
export const MATERIAL_TEXT_TOKENS: readonly ColorToken[];       // ["foreground","muted-foreground-vibrant","primary-vibrant","destructive"]
export const typeScale: Record<TypeToken, { size: string; lineHeight: string; tracking: string; weight?: number }>; // §7.2 (rem)
export const legacyTypeScale: Record<"xs"|"sm"|"base"|"lg"|"xl"|"2xl"|"3xl"|"4xl", { size: string; lineHeight: string; tracking: string }>;
export const radii: { xs: "0.375rem"; sm: "0.375rem"; DEFAULT: "0.375rem"; md: "0.5rem"; lg: "0.75rem"; xl: "1rem"; "2xl": "1.375rem"; full: "9999px" };
export const shadows: Record<"card"|"float"|"modal"|"thumb"|"focus", string>; // §7.4 (focus usa var(--ring))
export const durations: { press: 100; release: 200; hover: 150; fade: 150; scrim: 200; content: 200 }; // ms
export const easings: { out: "cubic-bezier(0.25, 1, 0.5, 1)"; inOut: "cubic-bezier(0.65, 0, 0.35, 1)" };
export const chartPalette: { series: readonly [string,string,string,string,string]; study: readonly [string,string,string]; metric: {...}; tissue: {...} }; // §12.2
export const contrastRequirements: ReadonlyArray<{ fg: ColorToken; bg: ColorToken | `#${string}`; min: 3 | 4.5; use: string }>; // §7.1, lo recorre el test
export function hexToHslChannels(hex: string): string;           // "#0066CC" → "210 100% 40%"
export function cssVariablesFor(palette: Partial<Record<ColorToken,string>>): Record<`--${string}`, string>;

// apps/web/src/lib/contrast.ts — puro
export function relativeLuminance(hex: string): number;
export function contrastRatio(a: string, b: string): number;      // WCAG 2.x, 1..21
export function compositeOver(fgHex: string, alpha: number, bgHex: string): string; // mezcla sRGB como el navegador

// apps/web/src/lib/motion.ts — presets y física (puro; sin "use client")
export const springs: {
  standard:  { type: "spring"; bounce: 0;    visualDuration: 0.35 };
  quick:     { type: "spring"; bounce: 0;    visualDuration: 0.25 };
  modal:     { type: "spring"; bounce: 0;    visualDuration: 0.3 };
  indicator: { type: "spring"; bounce: 0;    visualDuration: 0.3 };
  fling:     { type: "spring"; bounce: 0.2;  visualDuration: 0.3 };
  toggle:    { type: "spring"; bounce: 0.15; visualDuration: 0.25 };
};
export const fades: { fast: { type: "tween"; duration: 0.15; ease: [0.25, 1, 0.5, 1] }; scrim: { type: "tween"; duration: 0.2; ease: [0.25, 1, 0.5, 1] } };
export function projectMomentum(velocityPxPerS: number, decelerationRate?: number /* 0.998 */): number;
export function rubberband(overshoot: number, dimension: number, constant?: number /* 0.55 */): number;
export function dragOffset(raw: number, size: number): number;   // raw>0 = hacia cerrar: 1:1 hasta size; raw<0: −rubberband(|raw|, size)
export function resolveDismiss(input: { offset: number; velocity: number; size: number; flickVelocity?: number /* 500 */; threshold?: number /* 0.5 */ }): "dismiss" | "restore";
export function gestureIntent(dAxis: number, dCross: number, hysteresis?: number /* 10 */): "axis" | "cross" | null;
export function isPlainLeftClick(e: { button: number; metaKey: boolean; ctrlKey: boolean; shiftKey: boolean; altKey: boolean; defaultPrevented: boolean }): boolean;

// apps/web/src/lib/motion-features.ts
export { domMax as default } from "motion/react";

// apps/web/src/lib/use-controllable-state.ts ("use client")
export function useControllableState<T>(opts: { prop?: T; defaultProp: T; onChange?: (v: T) => void }): [T, (v: T) => void];

// apps/web/src/components/motion-provider.tsx ("use client")
export function MotionProvider({ children }: { children: React.ReactNode }): JSX.Element;
// <LazyMotion features={() => import("@/lib/motion-features").then(r => r.default)} strict>
//   <MotionConfig reducedMotion="user">{children}</MotionConfig></LazyMotion>
// + useEffect: document.addEventListener("touchstart", noop, { passive: true }) (habilita :active en Safari iOS)

// apps/web/src/app/fonts.ts
export const sans: NextFont & { variable: string }; // Inter({ subsets:["latin"], variable:"--font-sans", display:"swap", axes:["opsz"] })

// apps/web/src/components/segmented-control.tsx ("use client")
export type SegmentedOption<T extends string> = { value: T; label: React.ReactNode; icon?: LucideIcon; disabled?: boolean; "aria-label"?: string };
export function SegmentedControl<T extends string>(props: {
  value: T; onValueChange: (value: T) => void; options: ReadonlyArray<SegmentedOption<T>>;
  "aria-label": string; size?: "sm" | "md" | "lg"; fullWidth?: boolean; className?: string;
}): JSX.Element;

// apps/web/src/components/grouped-list.tsx (server-safe, sin "use client")
export function GroupedList(props: { header?: React.ReactNode; footer?: React.ReactNode; children: React.ReactNode; className?: string }): JSX.Element;
export function GroupedListRow(props: {
  label: React.ReactNode; description?: React.ReactNode; value?: React.ReactNode; icon?: LucideIcon;
  accessory?: React.ReactNode; href?: string; onClick?: () => void; destructive?: boolean; disabled?: boolean;
}): JSX.Element;

// apps/web/src/components/ui.tsx (agregado)
export function Metric(props: {
  label: string; value: number | null | undefined; unit?: string; decimals?: number; size?: "md" | "lg";
  trend?: { delta: number; unit?: string; sentiment: "positive" | "negative" | "neutral"; label?: string };
}): JSX.Element;

// apps/web/src/components/shell/use-optimistic-path.ts ("use client")
export function useOptimisticPath(): { pathname: string; markPending: (href: string, e: React.MouseEvent) => void };
// apps/web/src/components/shell/use-scroll-edge.ts ("use client")
export function useScrollEdge(offsetPx: number): { sentinelRef: React.RefObject<HTMLDivElement | null>; scrolled: boolean };
// apps/web/src/components/shell/portal-header.tsx (server-safe)
export function PortalHeader(props: { professionalName: string | null; activeHref?: string }): JSX.Element;
// apps/web/src/components/primitives/use-dismiss-drag.ts ("use client")
export function useDismissDrag(opts: { side: "left" | "right" | "top" | "bottom"; enabled: boolean; onDismiss: (velocity: number) => void; handleOnly: boolean }):
  { value: MotionValue<number>; handlers: { onPointerDown; onPointerMove; onPointerUp; onPointerCancel }; style: { touchAction: string } };
```

`lib/utils.ts`: `cn` pasa a usar `extendTailwindMerge({ extend: { classGroups: { "font-size": [{ text: [<claves de typeScale>] }], shadow: [{ shadow: ["card","float","modal","thumb","focus"] }] } } })`.

### 6.4 Rutas nuevas

| Ruta | Archivo | Protección |
|---|---|---|
| `/dev-diseno` | `app/(panel)/dev-diseno/page.tsx` (+ `_sections/*.tsx`) | Login del panel (middleware) + `notFound()` en producción |
| `/dev-diseno-portal` | `app/dev-diseno-portal/page.tsx` | Login del panel (el matcher del middleware la cubre: no empieza con `portal`) + `notFound()` en producción |

No hay server actions, APIs ni mensajes del bot nuevos.

---

## 7. Tokens (valores exactos, modo claro)

Contrastes medidos con WCAG 2.x (script en `progress/impl_HU-017a.md` lo reproduce el test de §16).
W = blanco `#FFFFFF`, G = agrupado `#F5F5F7`, PW = agrupado del portal `#FBFAF7`, F = `fill` `#EDEDF0`.

### 7.1 Color

| Token (nombre CSS/Tailwind) | Rol Apple | Hex | Canales HSL | Uso | Contraste |
|---|---|---|---|---|---|
| `background` | background | `#FFFFFF` | `0 0% 100%` | Contenido, workspace, tarjetas, sheets | — |
| `grouped` (**nuevo**) | grouped background | `#F5F5F7` (portal: `#FBFAF7`) | `240 11.1% 96.5%` / `45 33.3% 97.6%` | Fondo de la app detrás de tarjetas y listas agrupadas; login | — |
| `sidebar` | — | `#F5F5F7` | `240 11.1% 96.5%` | Sidebar y marco del layout (material "pesado", sólido) | — |
| `foreground`, `card-foreground`, `popover-foreground`, `secondary-foreground`, `accent-foreground` | label | `#1D1D1F` | `240 3.3% 11.8%` | Texto principal | 16,83 W · 15,46 G · 14,40 F |
| `muted-foreground` | secondaryLabel | `#636366` | `240 1.5% 39.4%` | Texto secundario, descripciones | 5,99 W · 5,50 G · 5,74 PW · 5,12 F · 4,59 sobre G+8 % negro (ítem presionado) |
| `muted-foreground-vibrant` (**nuevo**) | secondaryLabel sobre material | `#48484A` | `240 1.4% 28.6%` | Texto secundario **sobre materiales** (se sustituye solo dentro de `.material-*`) | ≥ 5,68 sobre cualquier material (ver 7.5) |
| `tertiary` (**nuevo**) | tertiaryLabel | `#8E8E93` | `240 2.3% 56.7%` | **Solo** íconos decorativos, chevrons, separadores "·", deshabilitado. Nunca texto informativo | 3,26 W (no AA texto) |
| `placeholder` (**nuevo**) | placeholderText | `#6E6E73` | `240 2.2% 44.1%` | Placeholders | 5,07 W |
| `border` | separator | `#E5E5EA` | `240 10.6% 90.8%` | Hairlines, divisores (decorativo) | 1,26 W |
| `input` | control border | **`#86868A`** | `240 1.7% 53.3%` | Borde de inputs, track del switch apagado (1.4.11) | 3,63 W · 3,33 G · 3,47 PW · 3,10 F. **Cambia respecto de la HU** (`#8E8E93` da 2,99 sobre G): ver Q10 |
| `secondary` (= `fill`) | tertiarySystemFill | `#EDEDF0` | `240 9.1% 93.5%` | Botón gray, track del segmentado, chips, badge neutro, skeleton | label 14,40 · sec 5,12 |
| `fill-hover` (**nuevo**) | — | `#E5E5EA` | `240 10.6% 90.8%` | Hover del botón gray | label > 12 |
| `fill-pressed` (**nuevo**) | — | `#D8D8DD` | `240 6.8% 85.7%` | Press del botón gray, grabber del sheet | label 11,85 |
| `muted` | — | `#F5F5F7` | `240 11.1% 96.5%` | Fondos suaves existentes (`bg-muted`), igual a `grouped` | — |
| `accent` | (shadcn: superficie de hover) | `#EDEDF0` | `240 9.1% 93.5%` | Hover/focus de ítems de menú y filas existentes | label 14,40 |
| `card`, `popover` | — | `#FFFFFF` | `0 0% 100%` | Tarjetas, popovers sólidos (fallback) | — |
| `primary`, `ring`, `link` | **tint** (systemBlue accesible) | **`#0066CC`** | `210 100% 40%` | Botón principal, selección, switch encendido, links, foco, navegación activa | blanco sobre tint 5,57 · tint sobre W 5,57 · G 5,11 · PW 5,33 · F 4,76 |
| `primary-foreground` | — | `#FFFFFF` | `0 0% 100%` | Texto sobre tint | 5,57 |
| `primary-hover` (**nuevo**) | — | `#005BB8` | `210.3 100% 36.1%` | Hover del filled (más oscuro: aclarar bajaría el contraste del blanco) | blanco 6,59 |
| `primary-pressed` (**nuevo**) | — | `#004F9E` | `210 100% 31%` | Press del filled | blanco 8,04 |
| `primary-soft` (**nuevo**) | tint 12 % opaco | `#E8F1FC` | `213 76.9% 94.9%` | Botón *tinted*, fondo de selección, ítem activo de sidebar, toggle encendido | tint sobre él 4,88 · label 14,76 |
| `primary-soft-hover` (**nuevo**) | — | `#DDEAFA` | `213.1 74.4% 92.4%` | Hover del tinted | tint 4,57 |
| `primary-soft-pressed` (**nuevo**) | — | `#D0E2F7` | `212.3 70.9% 89.2%` | Press del tinted (el texto pasa a `primary-vibrant`) | `primary-vibrant` sobre él 6,09 (tint daría 4,22 ✗) |
| `primary-vibrant` (**nuevo**) | tint sobre material | `#004F9E` | `210 100% 31%` | Texto tint **sobre materiales** (pestaña activa de la tab bar) y texto del tinted presionado | ≥ 5,01 sobre cualquier material (7.5) |
| `destructive` | systemRed accesible | `#D70015` | `354.1 100% 42.2%` | Texto/botón destructivo, error | 5,38 W · 4,94 G |
| `destructive-foreground` | — | `#FFFFFF` | — | Texto sobre rojo lleno | 5,38 |
| `destructive-hover` / `destructive-pressed` (**nuevos**) | — | `#C20013` / `#A80010` | `354.1 100% 38%` / `354.3 100% 32.9%` | Estados del rojo lleno | blanco 6,36 / 7,86 |
| `destructive-muted` | — | `#FDECEE` | `352.9 81% 95.9%` | Fondo de alerta de error, botón destructive-tinted | rojo 4,72 |
| `destructive-muted-hover` / `-pressed` (**nuevos**) | — | `#FBDFE2` / `#F8D0D5` | `353.6 77.8% 92.9%` / `352.5 74.1% 89.4%` | Estados del destructive-tinted (en press el texto pasa a `destructive-pressed`) | `destructive-pressed` sobre pressed 5,60 |
| `success` / `success-muted` | verde semántico (**no** es el logo) | `#1E7A34` / `#E8F5EC` | `134.3 60.5% 29.8%` / `138.5 39.4% 93.5%` | Estado OK (Acreditado, Conectado) | 5,40 W · 4,81 sobre muted |
| `warning` / `warning-muted` | — | `#A05A00` / `#FFF4E0` | `33.8 100% 31.4%` / `38.7 100% 93.9%` | Avisos | 5,31 W · 4,87 sobre muted |
| `info` / `info-muted` | — | `#0058B0` / `#EAF2FB` | `210 100% 34.5%` / `211.8 68% 95.1%` | Información (nunca en botones; siempre con ícono `Info`) | 6,95 W · 6,15 sobre muted |
| `overlay` (**nuevo**, canales) | — | negro | `0 0% 0%` | Base de `overlay-hover` (4 %), `overlay-pressed` (8 %), `scrim` (30 %). En 017f pasa a blanco | — |
| selección de texto (`::selection`) | — | tint 20 % sobre blanco = `#CCE0F5` | — | `::selection { background: hsl(var(--primary) / 0.2) }` | label 12,46 |

Notas de uso (§16, criterio "Color de acento como señal"):

- El tint aparece **solo** en: acción principal, selección (segmentado, toggle, ítem activo), foco,
  links y navegación activa. Nunca de fondo decorativo, ni en encabezados, ni en íconos de reposo.
- El badge de pendientes de Mensajes usa tint (no rojo: el rojo queda para error/destructivo). Ver Q3.
- `info` y `primary` son de la misma familia (como en Apple). Se distinguen porque `info` siempre va
  con ícono y superficie `info-muted`, y nunca es interactivo. Ver Q6.
- El verde de marca del logo **no** es un token: vive solo en `public/numa-logo.png`.

**Modo oscuro (D3): NO se implementa.** Los nombres son semánticos; 017f solo agrega valores. Propuesta
de partida para 017f (no se usa ahora): fondos `#000000`/`#1C1C1E`/`#2C2C2E`, label `#F5F5F7`,
secundario `#AEAEB2` (7,69 sobre `#1C1C1E`), tint `#2997FF` (5,64 sobre `#1C1C1E`; el `#0A84FF` de
iOS da 4,66), rojo `#FF453A` (4,99), `overlay` blanco. `darkMode` sigue `["class"]` sin activar.

### 7.2 Tipografía (Inter variable, `opsz` 14–32, `font-optical-sizing: auto`)

Tracking por la fórmula de métricas dinámicas de Inter (`−0,0223 + 0,185·e^(−0,1745·px)` em), leading
inverso al tamaño (§15). Todo en `rem` (16 px base, respeta el tamaño de texto del usuario).

**Estilos semánticos nuevos** (`text-<token>` en Tailwind; incluyen peso):

| Token | Tamaño / leading | Peso | Tracking | Uso |
|---|---|---|---|---|
| `large-title` | 2.125rem / 2.5625rem (34/41) | 700 | −0.022em | Saludo del portal (017d), título de login en móvil |
| `title-1` | 1.75rem / 2.125rem (28/34) | 700 | −0.021em | `PageHeader`, login |
| `title-2` | 1.375rem / 1.75rem (22/28) | 600 | −0.018em | Títulos de Dialog/Sheet, `StatusScreen` |
| `title-3` | 1.25rem / 1.5625rem (20/25) | 600 | −0.017em | Título del calendario, `Metric` md unidad grande |
| `headline` | 1.0625rem / 1.375rem (17/22) | 600 | −0.013em | Título de `Card`, `SectionLabel`, `EmptyState`, AlertDialog |
| `body` | 0.9375rem / 1.375rem (15/22) | 400 | −0.009em | Texto corrido del panel (`body`) |
| `body-lg` | 1.0625rem / 1.5rem (17/24) | 400 | −0.013em | Texto corrido e inputs del portal |
| `callout` | 0.875rem / 1.25rem (14/20) | 400 | −0.006em | Botones, celdas, filas, ítems de sidebar |
| `subheadline` | 0.8125rem / 1.125rem (13/18) | 400 | −0.003em | Etiquetas de campo, segmentado, botón `sm` |
| `footnote` | 0.75rem / 1rem (12/16) | 400 | 0em | Ayudas, timestamps, encabezados de tabla |
| `caption` | 0.6875rem / 0.8125rem (11/13) | 500 | +0.005em | Encabezados de grupo de la sidebar, etiquetas de la tab bar, contadores |
| `metric` | 2.125rem / 2.5rem (34/40) | 600 | −0.022em | Número de `Metric size="lg"` |
| `metric-md` | 1.75rem / 2.125rem (28/34) | 600 | −0.021em | `Metric size="md"`, valor de `StatTile` |

**Re-mapeo de la escala por defecto de Tailwind** (así las pantallas sin migrar ya toman tracking y
leading correctos; sin peso, para no pisar `font-*`):

| Clase | Antes | Ahora (tamaño / leading / tracking) |
|---|---|---|
| `text-xs` | 12/16 | 0.75rem / 1rem / 0em |
| `text-sm` | 14/20 | 0.875rem / 1.25rem / −0.006em |
| `text-base` | 16/24 | 1rem / 1.5rem / −0.011em |
| `text-lg` | 18/28 | 1.125rem / 1.5rem / −0.014em |
| `text-xl` | 20/28 | 1.25rem / 1.5625rem / −0.017em |
| `text-2xl` | 24/32 | 1.5rem / 1.875rem / −0.019em |
| `text-3xl` | 30/36 | 1.875rem / 2.25rem / −0.021em |
| `text-4xl` | 36/40 | 2.25rem / 2.625rem / −0.022em |

- `tracking-tight` desaparece de los archivos de esta HU (queda en pantallas fuera de alcance: lo
  limpian 017b/c). Con la escala nueva, `tracking-tight` en un título sobre-ajusta; no rompe nada.
- Números: `tabular-nums` en datos (se mantiene). Sin `font-feature-settings` extra por defecto (Q2).
- Peso en materiales: etiquetas de 11–13 px sobre material suben un paso (400→500, 500→600) (§12 vibrancy).
- Inputs: **≥ 16 px en táctil** (regla global §9.2) y 17 px en el portal.

### 7.3 Radios (concéntricos)

| Clase | Valor | Uso |
|---|---|---|
| `rounded-xs`, `rounded-sm`, `rounded` | 0.375rem (6) | Badges, chips, eventos del calendario, checkbox |
| `rounded-md` | 0.5rem (8) | Inputs, botones `sm`/`default`/`icon`, ítems de sidebar y menú |
| `rounded-lg` | 0.75rem (12) | Botones `lg`, popovers, menús, toasts, alertas |
| `rounded-xl` | 1rem (16) | `Card`, listas agrupadas, skeleton de tarjeta, login |
| `rounded-2xl` | 1.375rem (22) | Sheets (esquinas expuestas), Dialogs, workspace de escritorio |
| `rounded-full` | 9999px | Segmentado, switch, pills, badge de contador |

Regla (§16 Craft): radio interior = radio exterior − padding. Ej.: botón dentro de `Card` (16) con
`p-2` → 8 (`rounded-md`); thumb del segmentado dentro de un track `rounded-full` → `rounded-full`.
Se elimina `--radius` (y el radio 12 del portal: ya no hace falta, los botones `lg` del portal son 12).

### 7.4 Elevación

| Token Tailwind | Nivel | Valor | Uso |
|---|---|---|---|
| `shadow-card` (= `shadow-sm`) | 1 | `0 0 0 0.5px rgb(0 0 0 / 0.06), 0 1px 2px rgb(0 0 0 / 0.04)` | Tarjetas, listas agrupadas, StatTile, workspace |
| `shadow-float` (= `shadow`, `shadow-md`) | 2 | `0 0 0 0.5px rgb(0 0 0 / 0.08), 0 8px 24px rgb(0 0 0 / 0.12)` | Popovers, menús, tooltips, toasts, Sheet no modal |
| `shadow-modal` (= `shadow-lg`, `shadow-xl`) | 3 | `0 0 0 0.5px rgb(0 0 0 / 0.08), 0 24px 64px rgb(0 0 0 / 0.18)` | Dialog, AlertDialog, Sheet modal |
| `shadow-thumb` | — | `0 3px 8px rgb(0 0 0 / 0.12), 0 3px 1px rgb(0 0 0 / 0.04), 0 0 0 0.5px rgb(0 0 0 / 0.04)` | Thumb del segmentado y del switch, botón activo de FullCalendar |
| `shadow-focus` | — | `0 0 0 3px hsl(var(--ring) / 0.25)` | Halo de foco de inputs (el borde tint da el 3:1) |

Re-mapear `shadow-sm/DEFAULT/md/lg/xl` hace que los usos existentes (incluido el popover propio de
`food-picker.tsx:140`, `shadow-md`) tomen la escala nueva sin tocarlos. La sombra "más fuerte sobre
contenido denso" (§12) no se implementa como modificador en 017a: el nivel 3 ya es el más marcado; si
hiciera falta sobre tablas, lo agrega 017c.

### 7.5 Materiales (clases en `globals.css`, valores desde `materials` vía variables)

| Clase | Dónde | Regla | Fallbacks |
|---|---|---|---|
| `.material-chrome` | Topbar móvil del panel, header del portal | `background: hsl(var(--background) / var(--material-chrome-alpha))` (0,8) + `backdrop-filter: blur(20px) saturate(180%)` (con `-webkit-`) | `@supports not (backdrop-filter: blur(1px))`, `prefers-reduced-transparency: reduce`, `prefers-contrast: more` → fondo sólido `--background`; con `more` además `border-color: hsl(var(--input))` 1 px |
| `.material-bar` | Tab bar del portal | alpha 0,85 + blur 24 px + saturate 180 % + borde superior "de luz" `inset 0 0.5px 0 rgb(255 255 255 / 0.4)` y hairline `0 -0.5px 0 hsl(var(--overlay) / 0.08)` | igual |
| `.material-float` | Popover, menú, toast | alpha 0,85 + blur 24 px + saturate 180 % + `shadow-float` | igual |
| (sólido) | Tarjetas, sheets, dialogs, sidebar | sin blur (§12: nunca translúcido sobre translúcido; datos clínicos legibles) | — |

Dentro de `.material-*` se redefinen `--muted-foreground` → `muted-foreground-vibrant` y se usa
`text-primary-vibrant` para el tint (§12 vibrancy). Contraste sobre el **peor fondo** (negro puro
debajo, sin contar el blur que lo aclara):

| Texto | chrome (0,8) sobre negro → `#CCCCCC` | bar/float (0,85) sobre negro → `#D9D9D9` |
|---|---|---|
| `foreground` `#1D1D1F` | 10,48 | 11,92 |
| `muted-foreground-vibrant` `#48484A` | 5,68 | 6,46 |
| `primary-vibrant` `#004F9E` | 5,01 | 5,70 |
| (prohibido) `muted-foreground` `#636366` | 3,73 ✗ | 4,24 ✗ |
| (prohibido) `primary` `#0066CC` | 3,47 ✗ | 3,94 ✗ |

Por eso los alpha suben respecto de la HU (72 % → 80/85 %; ver Q11) y el texto sobre materiales usa las
variantes *vibrant*. **Scroll edge** (§12): el chrome no tiene borde fijo; `useScrollEdge` pone
`data-scrolled="true"` y aparece `box-shadow: 0 0.5px 0 hsl(var(--border))` con transición de opacidad
de 150 ms (solo en el header/topbar; la tab bar siempre lleva su borde de luz). Rendimiento (R4): blur
solo en esas superficies chicas; nunca en listas, tablas ni áreas grandes; `will-change` no se usa en
materiales estáticos.

### 7.6 Movimiento

**Duraciones y curvas (CSS, `durations`/`easings`):** `--duration-press: 100ms`, `--duration-release:
200ms`, `--duration-hover: 150ms`, `--duration-fade: 150ms`, `--duration-scrim: 200ms`,
`--duration-content: 200ms`; `--ease-out: cubic-bezier(0.25, 1, 0.5, 1)`. Tailwind:
`duration-press|release|hover|fade|scrim|content`, `ease-out-soft`.

**Utilidades de press** (`@layer components`; §1: feedback en pointer-down, instantáneo):

```css
.press      { transition: transform var(--duration-release) var(--ease-out), background-color var(--duration-hover), color var(--duration-hover), opacity var(--duration-hover); --press-scale: .97; }
.press-sm   { /* igual, */ --press-scale: .985; }   /* tarjetas, filas sueltas, ítems de sidebar */
@media (hover: hover) and (pointer: fine) { .press:active:hover, .press-sm:active:hover { transform: scale(var(--press-scale)); transition-duration: var(--duration-press); } }
@media not ((hover: hover) and (pointer: fine)) { .press:active, .press-sm:active { transform: scale(var(--press-scale)); transition-duration: var(--duration-press); } }
.press-none { /* sin escala, solo tono */ }
:is(.press, .press-sm):is(:disabled, [aria-disabled="true"]) { transform: none !important; }
@media (prefers-reduced-motion: reduce) { .press:active, .press-sm:active { transform: none; } } /* queda el cambio de tono */
```

Variante Tailwind `pressed:` (plugin `addVariant`), con la misma lógica `:active:hover` en puntero fino
y `:active` en táctil: así **al arrastrar fuera** con el mouse se suelta el estado (criterio "al soltar
o arrastrar fuera vuelve a su estado"; §10 cancelar arrastrando fuera). `a, button, [role=button]`
llevan `-webkit-tap-highlight-color: transparent` (el flash gris de iOS no es nuestro feedback).

**Springs (Motion; §4, valores de Apple):**

| Preset | `bounce` | `visualDuration` | Uso | Ref. Apple |
|---|---|---|---|---|
| `standard` | 0 | 0,35 | Sidebar colapsar/expandir, sheet abierto/cerrado por botón, listas (017b) | Move/reposition 1,0 / 0,4 |
| `quick` | 0 | 0,25 | Popover, menú | — |
| `modal` | 0 | 0,3 | Dialog / AlertDialog | — |
| `indicator` | 0 | 0,3 | `layoutId` de pestañas, segmentado, sidebar, nav del portal | — |
| `fling` | 0,2 | 0,3 | Sheet al soltar después de arrastrar, **con la velocidad del dedo** | Drawer/sheet 0,8 / 0,3 |
| `toggle` | 0,15 | 0,25 | Thumb del switch (objeto físico que se "tira") | — |

**Tweens (no manipulables):** `fades.fast` 150 ms (contenido de pestañas, reduced-motion),
`fades.scrim` 200 ms (scrim). Tooltip: CSS 150 ms. Skeleton → contenido: CSS `fade-in` 150 ms.

Salidas: mismo camino y mismo spring que la entrada (§7 simetría). Interrupción: Motion re-apunta desde
el valor presente y conserva la velocidad (§3). Solo `transform` y `opacity` en todo lo animado, **salvo
el ancho del slot de la sidebar** (decisión de la HU §5.7 para no deformar el contenido; ver R-3).

### 7.7 Accesibilidad del movimiento y los materiales (§14) — reemplaza la regla global

Se **elimina** `globals.css:91-99` (todo a 0,01 ms) y el bloque de `sidebar-layout.css:154-165`. En su lugar:

| Señal | Comportamiento |
|---|---|
| `prefers-reduced-motion: reduce` | `MotionConfig reducedMotion="user"` (Motion anula transform/layout y conserva opacidad). Cada componente con transform pasa a variantes de **fundido** de 150–200 ms (`useReducedMotion()`): Dialog/Sheet/Popover/Menú = solo opacidad; indicadores = cambian de lugar sin desplazarse y el color hace fundido de 150 ms; switch = salto del thumb + fundido de color; sidebar = ancho instantáneo + fundido de etiquetas. Press = solo tono. `animate-pulse` del skeleton → estático. `scroll-behavior: auto`. Recharts 3.10 ya anima con `isAnimationActive: "auto"` (respeta `prefers-reduced-motion`; verificado en `recharts/es6/animation/JavascriptAnimate.js:39`) y sus duraciones por defecto de `Bar`/`Scatter` son 400 ms: **no se tocan los gráficos**. Sonner: `[data-sonner-toast] { transition-property: opacity, height }` (sin desplazamientos). Spinner (`animate-spin`) se mantiene: es estado, no decoración. |
| `prefers-reduced-transparency: reduce` | Materiales sólidos (sin blur, alpha 1). |
| `prefers-contrast: more` | Materiales sólidos + borde 1 px `--input` (≥ 3:1). Tarjetas con borde 1 px `--input` además del anillo. `separator` sube a `#C7C7CC`. |
| Clases de simulación (solo la demo) | `.a11y-reduce-transparency`, `.a11y-more-contrast` replican las reglas de arriba en un subárbol; la demo envuelve con `MotionConfig reducedMotion="always"` para simular movimiento reducido. |

Foco (criterio "Navegación con teclado"): botones, links, tabs, ítems → `outline: 2px solid
hsl(var(--ring)); outline-offset: 2px` (sigue el radio del elemento en Chrome ≥ 94 y Safari ≥ 16.4; no
depende del fondo, a diferencia de `ring-offset`). Inputs → borde `ring` + `shadow-focus` con transición
de 150 ms. Tint vs fondos: 5,57 W · 5,11 G · 4,88 `primary-soft` (≥ 3:1).

**Objetivos táctiles (criterio 44 × 44):** utilidad `.touch-target` →
`@media (pointer: coarse) { .touch-target::after { content:""; position:absolute; left:50%; top:50%;
width:max(100%, 2.75rem); height:max(100%, 2.75rem); transform:translate(-50%,-50%); } }` (requiere
`relative` en el elemento). La llevan: base de `buttonVariants`, X de cierre, `Switch`, `Checkbox`,
`RadioGroupItem`, ítems del segmentado, toggle de la sidebar.

### 7.8 Cómo conviven los tokens viejos y los nuevos durante la migración

| Fase (ver §15) | `:root` en `globals.css` (viejo) | Plugin `addBase` desde `design-tokens.ts` |
|---|---|---|
| 2 a 6 | Sigue con los valores Notion de los **nombres shadcn** (`--primary`, `--muted-foreground`…), `.theme-warm` y `--radius` | Emite **solo nombres nuevos** (`--grouped`, `--primary-soft`, `--fill-hover`, `--overlay`, `--material-*`…), con valores nuevos. Tipografía semántica, `shadow-card/float/modal/thumb/focus`, `rounded-xs`, duraciones y `pressed:` disponibles |
| 7 (el "flip") | Se borra el bloque `:root` viejo y `.theme-warm` | Emite también los nombres shadcn con los valores Apple; `.theme-portal` + `:root:has(.theme-portal)` con `--grouped: #FBFAF7`; se re-mapean `fontSize` xs–4xl, `borderRadius`, `boxShadow` |
| 8 | — | Se retiran `--radius` y `.theme-warm` de todo `apps/web/src` (grep = 0) |

Entre 4 y 6 un botón puede verse negro en reposo y azul en hover (el `primary` todavía es el viejo y
`primary-hover` ya es nuevo). Es transitorio, nada se rompe, y la rama se mergea completa.

---

## 8. Dependencias

| Paquete | Versión | Dónde | Nota |
|---|---|---|---|
| `motion` | `^14.0.0` | `apps/web` `dependencies` | Única dependencia nueva. Trae `framer-motion`, `motion-dom`, `motion-utils` 14.0.0. Peer React 19 ✓. Instalar con `npm install motion@^14.0.0 --workspace apps/web`. |
| Inter (Google, variable `wght` + `opsz`) | la de `next/font` de Next 15.5.24 | `app/fonts.ts` | Sin paquete nuevo. Los `.woff` de `public/fonts` (PDF) no se tocan. |
| `tailwindcss-animate` | sin cambio (`^1.0.7`) | — | Queda (D-T7). |
| Vaul, Embla, framer-motion directo | **no** | — | Motion cubre sheets arrastrables (D-T12). |

Compatibilidad a confirmar en la Fase 1 (no bloquea): (a) Turbopack resuelve el `import()` dinámico de
`lib/motion-features.ts`; (b) `Slot` de Radix (`asChild`) sobre `m.div` fusiona `style` (las variables
`--radix-*-transform-origin`) y `ref`; (c) en Safari iOS, `:active` se activa con el listener pasivo de
`touchstart` del `MotionProvider`.

---

## 9. Componentes (skill `ui`): anatomía, tamaños, estados y movimiento

Notación de estados: **R** reposo, **H** hover (solo puntero fino), **P** press, **F** foco teclado,
**D** deshabilitado, **L** cargando.

### 9.0 Patrones transversales

**Radix + Motion (Dialog, AlertDialog, Sheet, Popover, DropdownMenu).** (§3, §7, R9)

1. `X` (Root) deja de ser re-export: es un componente con **la misma firma** que `XPrimitive.Root` que
   usa `useControllableState({ prop: open, defaultProp: defaultOpen ?? false, onChange: onOpenChange })`,
   pasa `open`/`onOpenChange` controlados al Root de Radix y publica `{ open, modal }` en un contexto.
2. `XContent` lee el contexto y renderiza:
   `<AnimatePresence custom={exitVelocityRef}>{open && (<XPrimitive.Portal forceMount key="x">…<XPrimitive.Content forceMount asChild><m.div initial/animate/exit …/></XPrimitive.Content></XPrimitive.Portal>)}</AnimatePresence>`.
   Los descendientes con `exit` corren su salida antes de que se desmonte el Portal.
3. Dialog/AlertDialog: el centrado **no** usa `translate-x/y-[-50%]` (Motion escribe `transform` y lo
   pisaría): el Content va dentro de un wrapper `fixed inset-0 z-50 grid place-items-center p-4
   pointer-events-none` y el Content lleva `pointer-events-auto`. El clic afuera cae en el Overlay
   (DismissableLayer lo detecta igual).
4. Popover/Dropdown: `style={{ transformOrigin: "var(--radix-popover-content-transform-origin)" }}`
   (o `--radix-dropdown-menu-content-transform-origin`): nace y vuelve al disparador (§7).
5. Con `useReducedMotion()` las variantes cambian a solo opacidad con `fades.fast`.
6. Durante la salida Radix ya no atrapa foco ni bloquea punteros (D-T6); el `RemoveScroll` del overlay
   dura lo que el fundido del scrim (200 ms).

**Densidad táctil.** En `pointer: coarse`: inputs ≥ 16 px; filas de menú y de sidebar del menú móvil
44 px; objetivos con `.touch-target`.

### 9.1 Button (`primitives/button.tsx`; `ui.tsx` lo mapea)

- **Base:** `relative inline-flex items-center justify-center gap-2 whitespace-nowrap font-medium
  select-none press touch-target focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2
  focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-40 aria-busy:cursor-progress
  [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:pointer-events-none`. Íconos lucide con `strokeWidth` 1,75
  donde el componente controla el ícono (spinner, X, chevrons).
- **Variantes** (R / H / P):

| Variante (`buttonVariants`) | `ui.tsx` | R | H | P |
|---|---|---|---|---|
| `default` (filled) | `primary` | `bg-primary text-primary-foreground` | `bg-primary-hover` | `bg-primary-pressed` + escala 0,97 |
| `destructive` (filled rojo) | — (solo confirmación final) | `bg-destructive text-destructive-foreground` | `bg-destructive-hover` | `bg-destructive-pressed` |
| `destructive-tinted` | `danger` | `bg-destructive-muted text-destructive` | `bg-destructive-muted-hover` | `bg-destructive-muted-pressed text-destructive-pressed` |
| `tinted` | `tinted` (nuevo) | `bg-primary-soft text-primary` | `bg-primary-soft-hover` | `bg-primary-soft-pressed text-primary-vibrant` |
| `secondary` (gray) | `secondary` | `bg-secondary text-foreground` | `bg-fill-hover` | `bg-fill-pressed` |
| `outline` (bordered) | — | `bg-background text-foreground border border-border` | `bg-overlay-hover` | `bg-overlay-pressed` |
| `ghost` (plain neutro) | `ghost` | `text-foreground` | `bg-overlay-hover` | `bg-overlay-pressed` |
| `plain` (plain tint) | `plain` (nuevo) | `text-primary` | `text-primary-hover` | `opacity-60` |
| `link` | `link` | `text-primary underline-offset-4 press-none` (sin padding extra, sin escala) | `underline` | `opacity-60` |

- **Tamaños:** `sm` `h-8 px-3 rounded-md text-subheadline font-medium` (32) · `default` `h-9 px-4
  rounded-md text-callout font-medium` (36) · `lg` `h-11 px-5 rounded-lg text-base font-semibold` (44;
  portal y acciones de pantalla completa) · `icon` `size-9 rounded-md` · `icon-sm` `size-8 rounded-md` ·
  `icon-lg` `size-11 rounded-lg`. En táctil, todos llegan a 44 por `.touch-target`.
- **L:** `loading` (ya existe en `ui.tsx`): `LoaderCircle` `animate-spin` + `aria-busy`; el botón
  conserva el ancho (§1: feedback inmediato de estado). `SubmitButton` sin cambios.
- **D:** `opacity-40`, sin press.
- Principios: §1 (press en pointer-down), §10 (hit padding), §16 Agency (destructivo con mesura).

### 9.2 Field, Input, Select, Textarea, Label, Checkbox, RadioGroup, Switch

- `inputClass`: `h-9 w-full rounded-md border border-input bg-background px-3 text-callout text-foreground
  placeholder:text-placeholder transition-[border-color,box-shadow] duration-hover ease-out-soft
  focus-visible:outline-none focus-visible:border-ring focus-visible:shadow-focus
  aria-[invalid=true]:border-destructive disabled:cursor-not-allowed disabled:bg-secondary
  disabled:text-tertiary`. `Select` igual + `pr-8` (nativo, T20 fuera). `Textarea` `h-auto min-h-20 py-2`.
- **Regla global (al final de `globals.css`, sin layer, gana por especificidad a `text-sm`):**
  `@media (pointer: coarse) { input:not([type=checkbox]):not([type=radio]):not([type=range]):not([type=color]), select, textarea { font-size: max(1rem, 16px); } }`
  y `.theme-portal :is(input…, select, textarea) { font-size: 1.0625rem; }`. Resuelve PO1/T17 en **todas**
  las pantallas, incluida la zona de imleticio, sin tocar sus archivos.
- `Field`: etiqueta `text-subheadline font-medium text-foreground mb-1.5`; ayuda `text-footnote
  text-muted-foreground mt-1.5`; error `text-footnote text-destructive` con `role="alert"` (sin cambio de
  semántica).
- `Label` (primitivo): `text-subheadline font-medium`.
- `Checkbox`: `size-[1.125rem] rounded-xs border border-input touch-target relative`; marcado
  `bg-primary border-primary text-primary-foreground`; ícono `Check` 14 px `strokeWidth 3`; transición de
  color 150 ms. F: outline ring.
- `RadioGroupItem`: `size-[1.125rem] rounded-full border border-input`; marcado borde tint + punto
  tint 8 px.
- `Switch`: track `h-[1.625rem] w-[2.75rem] rounded-full p-0.5` (44×26, proporción iOS 51×31); apagado
  `bg-input` (AA: 3,63 contra blanco; ver Q7), encendido `bg-primary`; thumb `size-[1.375rem]
  rounded-full bg-white shadow-thumb` animado con `m.span` (`animate={{ x: checked ? 18 : 0 }}`,
  `springs.toggle`); en press el thumb se estira 4 px hacia donde va (detalle de craft; CSS sobre el
  ancho de un hijo interno, no sobre el `transform` que maneja Motion). Fondo del track con transición
  de color 200 ms. Reduced motion: thumb sin spring (salto) + color con fundido.
- Principios: §1, §4 (switch), §16 Flexibility (16 px), 1.4.11 (bordes de control ≥ 3:1).

### 9.3 Card, PageHeader, SectionLabel, StatTile, Badge, Alert, EmptyState, Skeleton, Quantity, AdequacyBar

| Componente | Especificación |
|---|---|
| `Card` | `rounded-xl bg-card text-card-foreground shadow-card` (sin `border`); `padding="md"` → `p-6`; encabezado: título `text-headline`, descripción `text-subheadline text-muted-foreground mt-1`; con `padding="none"` el encabezado lleva `px-6 py-4` y separador hairline `border-b`. `prefers-contrast: more` → `border border-input`. (§12 nivel 1) |
| `PageHeader` | `mb-8`; back link: `ChevronLeft` 16 + texto `text-callout text-primary press-none pressed:opacity-60` (patrón "atrás" de Apple, §16 Familiarity); título `text-title-1` `text-balance`; descripción `text-body text-muted-foreground mt-1.5`. |
| `SectionLabel` | `text-headline mb-3`. |
| `StatTile` | `rounded-xl bg-card px-4 py-3 shadow-card`; etiqueta `text-subheadline text-muted-foreground`; valor `text-metric-md tabular-nums mt-1`. |
| `Metric` (nuevo, §9.4) | — |
| `Badge` | `inline-flex items-center rounded-xs px-2 py-0.5 text-footnote font-semibold`; tonos iguales (`neutral` = `bg-secondary text-foreground`). |
| `Alert` | `flex gap-3 rounded-lg px-4 py-3 text-callout` sin borde (el fondo `*-muted` ya separa; `prefers-contrast: more` agrega borde); ícono del tono 16 px; título `font-semibold`; cuerpo `text-foreground`. Rol `alert`/`status` sin cambio. |
| `EmptyState` | ícono 32 px `text-tertiary` (decorativo); título `text-headline`; descripción `text-subheadline text-muted-foreground`; acción debajo (se recomienda `tinted` en 017b+). |
| `Skeleton` | `rounded-md bg-secondary motion-safe:animate-pulse` (G12; §14 sin loops con movimiento reducido). |
| `skeletons.tsx` | `CardSkeleton` → `rounded-xl bg-card p-6 shadow-card`; `TableSkeleton` → `rounded-xl bg-card shadow-card` con separadores hairline; `PageSkeleton` igual estructura. |
| `Quantity` | sin cambios (la unidad hereda `text-muted-foreground`). |
| `AdequacyBar` | track `bg-secondary h-2 rounded-full`; barra por tono; etiqueta de estado `text-footnote font-semibold`. |

**Transición skeleton → contenido (§11, L5):** `#contenido > *` y `[data-portal-main] > *` llevan
`animation: fade-in var(--duration-fade) var(--ease-out) both` (keyframe `fade-in` de opacidad 0→1). Cada
navegación inserta nodos nuevos y la animación corre una vez; los re-render dentro de una página no la
repiten. Con movimiento reducido se conserva (es opacidad).

### 9.4 Componentes nuevos

**Segmented control** (`components/segmented-control.tsx`) — §16 Familiarity, §7, §8.

- Sobre `ToggleGroup` de Radix `type="single"` (rol `radiogroup`/`radio`, foco itinerante con flechas,
  Espacio/Enter selecciona). Se ignora `onValueChange("")` (no se puede deseleccionar).
- **Anatomía:** track `relative inline-grid grid-flow-col auto-cols-fr items-stretch rounded-full
  bg-secondary p-0.5` · segmento `relative z-0 inline-flex items-center justify-center gap-1.5 rounded-full
  px-3 text-subheadline font-medium text-foreground touch-target press-none` · thumb (solo en el
  seleccionado) `m.span layoutId={`${id}-thumb`}` `absolute inset-0 -z-10 rounded-full bg-background
  shadow-thumb` con `springs.indicator`. `id` = `useId()` dentro de un `LayoutGroup` propio (dos
  segmentados en la misma pantalla no se cruzan).
- **Tamaños:** `sm` `h-7` (28) · `md` `h-8` (32, panel) · `lg` `h-10` (40, portal). `fullWidth` → `w-full`.
- **Estados:** R texto `foreground`; H (no seleccionado) `bg-overlay-hover` en el segmento; P (no
  seleccionado) `opacity-60`; F outline ring sobre el segmento; D `opacity-40`.
- Reduced motion: el thumb aparece en el nuevo segmento sin desplazarse.
- Reemplaza a futuro los filtros de Mensajes, Pagos, Avisos y el selector de vista del calendario
  (017b/c). **No se adopta en pantallas en 017a.**

**Lista agrupada** (`components/grouped-list.tsx`, server-safe) — §16 Familiarity, Grouping & mapping.

- `GroupedList`: encabezado opcional `text-subheadline font-medium text-muted-foreground px-4 pb-1.5`;
  contenedor `<ul>` `rounded-xl bg-card shadow-card overflow-hidden`; pie opcional `text-footnote
  text-muted-foreground px-4 pt-1.5`.
- `GroupedListRow` (`<li>`): `relative flex min-h-11 items-center gap-3 px-4 py-2.5`. Izquierda: ícono
  opcional 18 px `text-muted-foreground`; `label` `text-callout text-foreground` (rojo si `destructive`);
  `description` `text-footnote text-muted-foreground`. Derecha: `value` `text-callout
  text-muted-foreground tabular-nums`, `accessory` (switch, botón), y `ChevronRight` 16 px `text-tertiary`
  si tiene `href`. Separador: `::after` hairline `bg-border` de 1 px desde `left: 1rem` (o `3.25rem` con
  ícono) hasta el borde derecho; ninguno en la última fila.
- Navegable (`href` → `<Link>`, `onClick` → `<button>`, ambos `w-full text-left`): H `bg-overlay-hover`,
  P `bg-overlay-pressed` **sin escala** (resaltado de fila de iOS: escalar una fila dentro de su
  contenedor se ve roto; §16 Familiarity). F outline ring inset.
- Usos futuros: Ajustes, Datos para cálculos, listas del portal, pacientes en móvil (017b–d). Solo la
  demo la usa en 017a.

**Métrica** (`Metric` en `ui.tsx`, server-safe) — §15, F5.

- Etiqueta `text-subheadline text-muted-foreground`; número `text-metric` (lg) o `text-metric-md` (md)
  `tabular-nums`, formateado como `Quantity` (es-AR, `decimals`); unidad pegada con NBSP en
  `text-subheadline font-medium text-muted-foreground`; `null` → "—" en `text-tertiary`.
- `trend`: renglón `text-footnote` con `ArrowUpRight`/`ArrowDownRight`/`Minus` 14 px y el delta con signo
  (`+1,2 kg`, `−1,4 kg` con signo menos tipográfico U+2212); color por `sentiment` (`success`,
  `destructive`, `muted-foreground`) **decidido por quien llama** (regla de dominio); `sr-only` con el
  texto completo ("subió 1,2 kg", o `trend.label` si viene).

### 9.5 Tabs (`primitives/tabs.tsx`)

- `Tabs` envuelve `TabsPrimitive.Root` reflejando `value` (controlado o no) en un contexto con un id de
  `LayoutGroup`. Misma firma.
- `TabsList`: `relative inline-flex h-11 w-full items-center gap-6 border-b border-border`.
- `TabsTrigger`: `relative inline-flex h-full items-center whitespace-nowrap px-0.5 text-callout
  font-medium text-muted-foreground transition-colors duration-hover hover:text-foreground pressed:opacity-60
  data-[state=active]:text-foreground focus-visible:outline-ring`; si está activo (comparando su `value`
  con el del contexto) renderiza `m.span layoutId="tab-indicator"` `absolute inset-x-0 -bottom-px h-0.5
  rounded-full bg-primary` con `springs.indicator`. (§7, §8)
- `TabsContent`: `mt-6 focus-visible:outline-none data-[state=active]:animate-fade-in` (150 ms; sin
  slide para no demorar). Compatible con `forceMount` + `hidden` que usa `patient-tabs.tsx`.

### 9.6 Toggle y ToggleGroup

`toggleVariants`: `rounded-md text-callout font-medium press-none transition-colors hover:bg-overlay-hover
pressed:bg-overlay-pressed data-[state=on]:bg-primary-soft data-[state=on]:text-primary focus-visible:outline-ring
touch-target`; `outline` → `border border-border`. Sin indicador deslizante (eso es el segmentado). Usos
actuales (6 archivos, incluidos los horarios de `new-appointment-modal.tsx`) cambian de color pero no de
API.

### 9.7 Overlays

| Componente | Anatomía y material | Entrada / salida | Gesto | Reduced motion |
|---|---|---|---|---|
| **Dialog** | `w-full max-w-lg max-h-[90dvh] overflow-y-auto overscroll-contain rounded-2xl bg-background p-6 shadow-modal` (sólido). Título `text-title-2`; descripción `text-callout text-muted-foreground`; footer `flex flex-col-reverse gap-2 sm:flex-row sm:justify-end`. **X**: `absolute right-3 top-3 size-[1.875rem] rounded-full bg-secondary text-muted-foreground grid place-items-center touch-target press` con `X` 14 px `strokeWidth 2.25` (como el "xmark.circle" de iOS; 44 px de objetivo en táctil). | Scrim `bg-scrim` (negro 30 %) `fades.scrim`. Contenido: escala 0,96→1 + opacidad 0→1, `springs.modal`; salida simétrica. Centrado (tarea modal, §12 "dim to focus"). | — | solo opacidad 150 ms |
| **AlertDialog** (y `ConfirmProvider`) | Alerta de Apple: `max-w-[22.5rem] rounded-2xl p-5 text-center shadow-modal`; título `text-headline`; texto `text-subheadline text-muted-foreground`; footer `grid grid-cols-2 gap-2 mt-4` (apilado `grid-cols-1` si algún label supera ~16 caracteres: lo resuelve CSS con `@container`, o siempre 2 columnas en 017a). Cancel = `secondary` `h-11 rounded-lg`; Action = `default` o `destructive` (lleno: es la confirmación final) `h-11 rounded-lg`. Foco inicial en Cancelar (ya existe). | igual que Dialog | — | idem |
| **Sheet** | Sólido `bg-background`, `overflow-y-auto overscroll-contain`. `right`: `inset-y-0 right-0 h-full w-3/4 sm:max-w-sm sm:rounded-l-2xl`; `left`: `inset-y-0 left-0 h-full w-[min(85vw,20rem)] rounded-r-2xl`; `bottom`: `inset-x-0 bottom-0 max-h-[90dvh] rounded-t-2xl pb-[env(safe-area-inset-bottom)]` con **grabber** `mx-auto mt-2 h-[5px] w-9 rounded-full bg-fill-pressed` dentro de una zona de agarre `h-6` (`data-sheet-handle`); `top` sin cambios de forma. Modal → `shadow-modal` + scrim 30 %; no modal (`modal={false}`, sheet del turno) → `shadow-float` sin scrim (§12 "separate to keep flow"). X igual que Dialog. Las clases del consumidor (`w-full sm:max-w-xl`) siguen funcionando. | Entra desde su borde (`x: ±100%` / `y: 100%` → 0) con `springs.standard`; sale **por el mismo borde** (§7). Abrir y cerrar a mitad: Motion re-apunta desde la posición presente (§3). | `useDismissDrag` (§9.8) | solo opacidad 200 ms, sin desplazamiento |
| **Popover** | `.material-float rounded-lg p-4 w-72 text-popover-foreground` (material flotante). | escala 0,96→1 + opacidad, origen en el disparador (`--radix-popover-content-transform-origin`), `springs.quick`; salida simétrica hacia el disparador | — | opacidad 150 ms |
| **DropdownMenu** | `.material-float rounded-lg p-1.5 min-w-[12rem]`; ítem `h-8 rounded-md px-2.5 gap-2.5 text-callout` (44 en táctil), `focus:bg-overlay-hover`, `data-[disabled]:opacity-40`; `variant="destructive"` → `text-destructive` (y su ícono); separador hairline `-mx-1.5 my-1.5`; label `text-footnote font-semibold text-muted-foreground`; sub-menús igual. | igual que Popover (origen `--radix-dropdown-menu-content-transform-origin`) | — | idem |
| **Tooltip** | `rounded-md bg-foreground px-2.5 py-1 text-footnote text-background shadow-float` (16,83:1; no tinte: no es acción). | CSS (`tailwindcss-animate`): `fade-in-0 zoom-in-[0.96]` 150 ms desde el origen; salida igual. D-T7. | — | sin zoom (regla CSS) |
| **Toaster (Sonner)** | `toast`: `.material-float rounded-lg text-callout text-foreground`; `description`: `text-subheadline text-muted-foreground` (vibrant por estar en material); íconos de estado de Sonner con colores `success`/`destructive`/`info`; botón de acción `bg-primary text-primary-foreground rounded-md`. Panel abajo a la derecha; portal arriba al centro con `offset` bajo el header (`calc(env(safe-area-inset-top) + 4rem)`). Swipe para descartar: el de Sonner. `lib/notify.ts` no cambia. | las de Sonner | swipe de Sonner | `transition-property: opacity, height` |

### 9.8 Arrastrar para cerrar (`useDismissDrag`) — D7 "sí"

Principios: §2 (1:1, punto de agarre), §3 (agarrar en vuelo), §5 (handoff de velocidad), §6
(proyección), §9 (rubber-band), §10 (histéresis, bloqueo de eje, gestos en paralelo).

1. **Cuándo:** `pointerType` `touch` o `pen` en sheets `left`/`right` desde cualquier punto del sheet;
   `bottom` solo desde `[data-sheet-handle]` (grabber + encabezado), también con mouse. Con mouse en
   sheets laterales **no** (selección de texto en formularios; §16 Flexibility: escritorio cierra con X,
   Esc o clic afuera). Se ignora si el `pointerdown` nace en `input, textarea, select,
   [contenteditable], [data-sheet-drag-ignore]`. `dismissOnDrag={false}` lo apaga.
2. **`touch-action`:** `pan-y` en sheets laterales (el scroll vertical nativo sigue andando); `none` en
   el handle del sheet inferior.
3. **Inicio:** en `pointerdown` se hace `value.stop()` (toma el valor presente si estaba animando) y se
   guarda el origen; no se captura todavía. En `pointermove`, `gestureIntent(dAxis, dCross, 10)`: si
   gana el eje cruzado (scroll), se abandona; si gana el eje del sheet, `setPointerCapture` y desde ahí
   1:1 respetando el desplazamiento inicial.
4. **Durante:** `value.set(dragOffset(raw, size))`: hacia cerrar sigue el dedo (hasta `size`); hacia
   adentro, `rubberband`. El scrim baja su opacidad proporcional al progreso (`1 − offset/size`).
5. **Al soltar:** `velocity = value.getVelocity()` (px/s); `resolveDismiss({ offset, velocity, size })`:
   si `|velocity| ≥ 500` decide el **signo**; si no, `offset + projectMomentum(velocity)` contra
   `size × 0,5`. `"restore"` → `animate(value, 0, { ...springs.fling, velocity })`. `"dismiss"` →
   `onOpenChange(false)` y la salida usa `springs.fling` con esa `velocity` (vía `custom` de
   `AnimatePresence`), así no hay costura entre el dedo y la animación.
6. `pointercancel` → igual que soltar con velocidad 0.
7. Movimiento reducido: el arrastre sigue siendo 1:1 (es manipulación directa, no animación); el cierre
   y el regreso son fundidos.

### 9.9 Table (`primitives/table.tsx`)

`TableHeader`: `sticky top-0 z-10 bg-background/95` (sin `backdrop-filter`: bugs de Safari con
`thead` sticky, R12) + `[&_tr]:border-b`; `TableHead`: `h-9 px-3 text-footnote font-semibold
text-muted-foreground`; `TableRow`: `border-b transition-colors duration-hover hover:bg-overlay-hover
data-[state=selected]:bg-primary-soft`; si recibe `onClick` agrega `press-none pressed:bg-overlay-pressed
cursor-pointer` (criterio "fila navegable": cambia en el pointerdown; sin escala en filas de tabla);
`TableCell`: `px-3 py-2.5 text-callout`. Números a la derecha con `tabular-nums` (sin cambio). La lista
agrupada en móvil es 017c.

### 9.10 Separator, Chart

- `Separator`: `bg-border` 1 px (sin cambio de API).
- `chart.tsx`: `ChartTooltipContent` → `rounded-lg bg-background px-2.5 py-1.5 text-footnote
  shadow-float` sin borde; ejes/grilla ya toman `muted-foreground`/`border` (valores nuevos). Sin
  cambios de animación (Recharts `auto`, §7.7).

---

## 10. Shell

### 10.1 Sidebar de escritorio (≥ 1024 px) — `app-sidebar.tsx`, `sidebar-content.tsx`, `nav-config.ts`, `sidebar-layout.css`

- **Layout:** `.panel-sidebar-layout` `h-[100dvh] p-2 bg-sidebar` (`#F5F5F7`, material sólido "pesado";
  §12). Workspace: `mt-2 rounded-2xl bg-background shadow-card overflow-y-auto` (sin borde de 1 px; con
  `prefers-contrast: more` borde `--input`). Todo en `rem`: `--panel-sidebar-collapsed: 3rem`,
  `--panel-sidebar-expanded: 14rem` (T11).
- **Colapsar (G5, criterio "sin deformar"):** el slot es `m.div` con `animate={{ width: collapsed ?
  "3rem" : "14rem" }}` y `transition={springs.standard}`, `overflow: hidden`; la `<aside>` mantiene
  `width: 14rem` fija y queda recortada por el slot (se elimina el `clip-path` y **todo el FLIP/WAAPI**
  de `app-sidebar.tsx:39-76`). El workspace se reacomoda por layout normal: nada se escala. Otro clic a
  mitad: Motion invierte desde el ancho presente con su velocidad (§3). Etiquetas: fundido de opacidad
  CSS como hoy (120 ms con 60 ms de retardo al abrir; 90 ms al cerrar). Reduced motion: ancho
  instantáneo (`{ duration: 0 }`) + fundido de etiquetas. Cookie igual.
- **Encabezado:** `Wordmark` sin cambios (D9) + toggle `ghost icon` 40 px; el intercambio logo/ícono en
  el rail queda, con el `:hover` de `sidebar-layout.css` dentro de `@media (hover: hover)`.
- **Grupos:** título `text-caption font-semibold text-muted-foreground px-2 pb-1` (`pt-3`; el primero
  `pt-2`) (§15: 11 px con tracking positivo; S6).
- **Ítem (`sidebarItemClass`):** `relative isolate flex h-8 w-full items-center gap-2.5 rounded-md px-2
  text-callout text-foreground press-sm hover:bg-overlay-hover pressed:bg-overlay-pressed
  focus-visible:outline-ring group-data-[density=touch]/nav:h-11`; ícono 16 px `strokeWidth 1.75`
  `text-muted-foreground`. **Activo:** texto `text-primary font-semibold`, ícono `text-primary`, y fondo
  `m.span layoutId="sidebar-active"` `absolute inset-0 -z-10 rounded-md bg-primary-soft`
  (`springs.indicator`). Se distingue por fondo + color + peso + ícono (criterio "no solo color"; S2).
  Se elimina la barrita negra `before:`. Contraste: tint sobre `primary-soft` 4,88.
- **Respuesta inmediata (S1):** `useOptimisticPath()` → al hacer clic plano (`isPlainLeftClick`) se marca
  el `href` como activo al instante (el indicador ya se desliza mientras carga la página) y se limpia
  cuando cambia `usePathname()` (o a los 4 s como tope, R-9). Cmd/Ctrl/Shift/Alt-clic y clic medio no
  marcan nada.
- **Badge de Mensajes (S7):** pill `rounded-full bg-primary px-1.5 text-caption font-semibold leading-5
  text-primary-foreground tabular-nums` (5,57:1); colapsado, punto 8 px `bg-primary`. Nombre accesible
  sin cambio.
- **Pie:** separador hairline; Ajustes (ítem); estado del bot `h-7 text-footnote text-muted-foreground` con
  punto de color; email `text-footnote text-muted-foreground`; `SignOutButton` (usa `sidebarItemClass`,
  sin cambio de archivo salvo que haga falta el ícono 1,75).
- **Dos instancias:** `AppSidebar` envuelve su `SidebarContent` en `<LayoutGroup id="sidebar-desktop">` y
  `MobileTopbar` en `<LayoutGroup id="sidebar-mobile">` (los `layoutId` no se cruzan).
- Restricción 1366 × 768: todo entra sin scroll (las alturas de ítem no cambian; los títulos de grupo
  bajan de 12/16 a 11/13). Se mide en la verificación.

### 10.2 Topbar móvil del panel (< 1024 px) — `mobile-topbar.tsx`

- `header` `sticky top-0 z-30 h-14 .material-chrome lg:hidden` + `data-scrolled` (scroll edge, §12; M1).
  **La altura queda en `h-14`** (3,5 rem): `patient-tabs.tsx:91` usa `top-14` para su sticky.
- Izquierda: botón menú `ghost icon-lg` (44 px; ícono `Menu` 20 px). Luego `Wordmark` (sin cambios).
- Menú: `SheetContent side="left"` (§9.7) con `SidebarContent density="touch"` (ítems de 44 px; M3), X de
  44 px (M4), entra con `springs.standard` (M2: adiós a los 500 ms) y **se cierra arrastrando hacia la
  izquierda** (§9.8). `onNavigate` cierra como hoy.
- Sentinela de `useScrollEdge(56)` inmediatamente después del header.

### 10.3 Header y tab bar del portal — `(portal)/layout.tsx`, `portal-header.tsx` (nuevo), `portal-nav.tsx`

- **Contenedor:** `.theme-portal min-h-[100dvh] bg-grouped text-foreground` (D2: cálido solo en el fondo
  agrupado `#FBFAF7`).
- **`PortalHeader`** (extraído del layout para reusarlo en la demo): `header` `sticky top-0 z-30
  .material-chrome pt-[env(safe-area-inset-top)]` + `data-scrolled`; interior `mx-auto flex h-14 max-w-2xl
  items-center justify-between gap-4 px-4`; `Wordmark` (sin cambios); a la derecha `PortalNav
  variant="top"` (≥ 768 px) y el form de "Salir" (`Button variant="ghost" size="lg"
  text-muted-foreground`, mismo `action="/portal/logout"`). La ubicación de "Salir" (P5) se revisa en 017d.
- **`PortalNav variant="top"`** (≥ 768 px): links `h-11 rounded-lg px-3 text-callout font-medium
  text-foreground press-sm hover:bg-overlay-hover`; activo `text-primary-vibrant` (está sobre material)
  con fondo `m.span layoutId="portal-top-active"` `rounded-lg bg-primary-soft` (`springs.indicator`; P6).
- **`PortalNav variant="bottom"`** (tab bar, < 768 px; P1–P3): `nav` `fixed inset-x-0 bottom-0 z-30
  grid grid-cols-4 .material-bar pb-[env(safe-area-inset-bottom)] md:hidden`; ítem `flex min-h-[3.5rem]
  flex-col items-center justify-center gap-0.5 text-caption press` (`--press-scale: .94`); ícono 24 px.
  Reposo: ícono `strokeWidth 1.75` + etiqueta `font-medium text-muted-foreground` (vibrant por el
  material: 5,68–6,46:1). Activo: ícono `strokeWidth 2.25` + etiqueta `font-semibold`, ambos
  `text-primary-vibrant` (≥ 5,01:1). Se elimina la rayita superior (P2: patrón Android). Activo optimista
  con `useOptimisticPath` (P3). `activeHref` opcional para la demo. Se conservan los 56 px y la safe area
  (P7).
- **Main:** `data-portal-main mx-auto max-w-2xl px-4 pt-6 pb-[calc(3.5rem+env(safe-area-inset-bottom)+1.5rem)]
  md:py-8` (el contenido pasa por debajo del header y de la tab bar; criterio "Chrome translúcido").
- **Portal sin link** (mismo layout, rama `!patient`): `bg-grouped` centrado; tarjeta `rounded-xl bg-card
  p-8 shadow-card text-center`; `Wordmark`; título `text-title-2`; texto `text-callout
  text-muted-foreground` (mismo texto).
- `Toaster position="top-center"` con el `offset` de §9.7.

### 10.4 Layout del panel — `(panel)/layout.tsx`

Sin cambios de datos. Skip link `focus:rounded-lg focus:bg-background focus:shadow-float focus:text-callout`.
`main#contenido` igual (padding `px-6 py-8 lg:px-10`). `Toaster position="bottom-right"`.

### 10.5 Raíz — `app/layout.tsx`, `app/fonts.ts`, `components/motion-provider.tsx`

`<html lang="es" className={sans.variable}>` · `<body>` con `<MotionProvider>{children}</MotionProvider>`.
`body`: `bg-background text-foreground font-sans antialiased text-body` + `font-optical-sizing: auto`.
`global-error.tsx` importa `sans` de `app/fonts.ts` (en vez de repetir `Inter(...)`).

### 10.6 Login e `/inicio` — `login-screen.tsx`

- `main` `grid min-h-[100dvh] place-items-center bg-grouped px-4 py-12`.
- Columna `w-full max-w-sm`: `Wordmark` centrado (sin cambios) `mb-8`; tarjeta `rounded-xl bg-card p-8
  shadow-card` que entra con fundido + `translateY(8px)→0` de 200 ms (CSS `motion-safe:`; solo fundido con
  movimiento reducido) — §16 Delight sin espectáculo.
- Título `text-title-1` "Ingresá al panel"; texto `text-body text-muted-foreground mt-2` (mismo texto).
- **L2:** el botón pasa a `SubmitButton variant="secondary" size="lg" className="w-full mt-6"
  pendingLabel="Abriendo Google…"` con `GoogleG`: muestra spinner apenas se envía (§1). La action
  `signIn("google", { redirectTo: "/" })` no cambia.
- Pie `text-footnote text-muted-foreground text-center mt-6` (mismo texto).

### 10.7 Estados — `status-screen.tsx`, `not-found.tsx`, `error.tsx`, `global-error.tsx`, `loading.tsx`

- `StatusScreen`: ícono 28 px `text-muted-foreground` dentro de un círculo `size-14 rounded-full
  bg-secondary grid place-items-center mb-5`; título `text-title-2 text-balance`; descripción `text-callout
  text-muted-foreground mt-2 max-w-md`; acciones `mt-6 gap-3`; detalle `text-footnote
  text-muted-foreground tabular-nums`. Entrada: `animate-fade-in` 200 ms. API igual; los textos no cambian.
- `app/not-found.tsx`: la clase del portal pasa de `theme-warm` a `theme-portal` (`bg-grouped`).
- `error.tsx` del panel y del portal y `(panel)/not-found.tsx`: sin cambios de archivo (toman el estilo
  de `StatusScreen` y `Button`).
- `loading.tsx` (10 del panel + portal): sin cambios de archivo; toman `Skeleton`/`skeletons.tsx` y el
  fundido de §9.3.

---

## 11. FullCalendar (tema en `globals.css`)

Sin tocar `calendar-client.tsx` (es de 017b). Solo el CSS:

```text
.fc vars: --fc-border-color: hsl(var(--border)); --fc-today-bg-color: hsl(var(--primary) / 0.05);
          --fc-now-indicator-color: hsl(var(--destructive)); --fc-page-bg-color: hsl(var(--background));
          --fc-neutral-bg-color: hsl(var(--muted)); --fc-highlight-color: hsl(var(--primary) / 0.12);
          font-size: 0.8125rem;
.fc-toolbar-title            → text-title-3 text-foreground
.fc-col-header-cell-cushion  → py-2 text-footnote font-semibold text-muted-foreground
.fc-timegrid-slot-label-cushion, .fc-list-day-text → text-footnote text-muted-foreground
.fc-button-primary           → h-8 rounded-md border-0 bg-secondary px-3 text-subheadline font-medium normal-case
                                text-foreground shadow-none press (transform + color)
  :hover                     → bg-fill-hover (solo puntero fino: envolver en @media (hover: hover))
  :not(:disabled):active     → bg-fill-pressed
  .fc-button-active          → bg-background shadow-thumb font-semibold (anticipa el segmentado de 017b)
  :focus-visible             → outline 2px ring, offset 2px
  :disabled                  → opacity .4
.fc-daygrid-event, .fc-timegrid-event → rounded-sm (6) border-0 px-1.5 py-0.5 text-footnote font-medium
.fc-non-business             → hsl(var(--muted)) (017b lo aliviana: C1)
.fc-event:focus-visible      → outline ring
```

Los colores de servicio siguen siendo dato (`service-form.tsx`), sin cambios.

## 12. Gráficos

### 12.1 Animación

Sin cambios de código (Recharts 3.10 `isAnimationActive: "auto"`, 400 ms en `Bar`/`Scatter`; §7.7).
Criterio "los gráficos aparecen sin animación de crecimiento" con movimiento reducido: se verifica en la
ficha y en antropometría.

### 12.2 Colores (`lib/chart-theme.ts` desde `chartPalette`)

Todos ≥ 3:1 sobre blanco (elementos gráficos, 1.4.11). Mismas claves y tipos.

| Export | Valores nuevos (contraste sobre W) |
|---|---|
| `chartSeriesColors` | `#0066CC` tint (5,57) · `#248A3D` verde (4,40) · `#C93400` naranja (5,28) · `#8944AB` violeta (6,04) · `#D70015` rojo (5,38) |
| `chartDefaultColor` | `#0066CC` (serie 1 = tint, HU §5.2) |
| `chartStudyColors` | `#8E8E93` (3,26) · `#636366` (5,99) · `#3A3A3C` (11,35); el último estudio en tint |
| `chartMetricColors` | `weightKg #0066CC` · `bodyFatPercent #C93400` · `muscleMassKg #248A3D` · `bodyWaterPercent #007D99` (4,78) · `visceralFatLevel #D70015` · `boneMassKg #636366` · `basalMetabolicRateKcal #3A3A3C` |
| `isakTissueColors` | `adipose #C93400` · `muscle #248A3D` · `bone #636366` · `residual #8944AB` |

`chart-theme.ts` no lo importa ningún PDF (verificado: `lib/report-pdf-charts.tsx` y `pdf-theme.ts` no lo
usan): los PDF no cambian en esta HU (D8 → 017c).

---

## 13. Página demo (D12; §17 "una demo interactiva vale más que un millón de diseños")

### 13.1 Rutas y exclusión de producción

- `/dev-diseno` → `app/(panel)/dev-diseno/page.tsx` (server) + `app/(panel)/dev-diseno/_sections/*.tsx`
  (carpeta privada `_`, no genera rutas). Se ve dentro del shell real del panel.
- `/dev-diseno-portal` → `app/dev-diseno-portal/page.tsx`: monta `PortalHeader` + `PortalNav` con
  `activeHref` y contenido largo falso (sin consultas a la base) dentro de `.theme-portal`.
- Exclusión: primera línea de cada `page.tsx`: `if (process.env.NODE_ENV === "production") notFound();`;
  `export const metadata = { title: "Demo de diseño", robots: { index: false, follow: false } }`; no
  aparecen en `nav-config.ts`, `portal-nav.tsx` ni en ningún link. Ambas exigen sesión del panel
  (middleware). Datos: todo literal en el archivo; nada lee ni escribe la base; los toasts y diálogos son
  locales.

### 13.2 Estructura de `/dev-diseno`

Barra superior propia (dentro de la página, `sticky top-0` del workspace) con un índice de anclas y tres
interruptores de simulación: "Transparencia reducida" (`.a11y-reduce-transparency`), "Más contraste"
(`.a11y-more-contrast`) y "Movimiento reducido" (`MotionConfig reducedMotion="always"` en el subárbol).
Nota visible: "press con movimiento reducido y `pointer: coarse` solo se ven con el ajuste real del SO /
emulación de DevTools".

| # | Sección (`_sections/`) | Contenido |
|---|---|---|
| 1 | `colors.tsx` | Cada token de §7.1: muestra, nombre, hex, y los contrastes de `contrastRequirements` calculados **en vivo** con `contrastRatio` (✓/✗ AA). Fondo blanco, agrupado y agrupado del portal. |
| 2 | `typography.tsx` | Cada estilo de §7.2 con texto real ("María López", "61,2 kg", "Próximo turno: jueves 9 de octubre, 10:30") en su tamaño, peso, leading y tracking; tabla con los valores; comparación de `text-sm/base/lg/2xl` re-mapeados. Toggle local para probar `ss01`/`cv11` en números (Q2). |
| 3 | `shape.tsx` | Radios (con un ejemplo concéntrico: tarjeta 16 + botón 8 con `p-2`), elevación 1–3 sobre blanco y sobre agrupado. |
| 4 | `materials.tsx` | Un bloque con fondo "difícil" dibujado con gradientes CSS (franjas negras, tint y rojo; sin imágenes nuevas en `public/`) y encima `.material-chrome`, `.material-bar`, `.material-float` con texto `foreground`, `muted-foreground` (vibrant) y `primary-vibrant`; interactuable con scroll para ver el blur pasar. |
| 5 | `motion.tsx` | Un cuadrado por preset de `springs` (botón "Mover" que lo manda de un extremo al otro; volver a tocar a mitad invierte desde donde está: §3). Valores impresos. Una pelota arrastrable con rubber-band contra un borde y proyección de momentum (muestra el destino proyectado como fantasma: §6, §9). |
| 6 | `buttons.tsx` | Matriz variante × tamaño (incluye `ui.tsx` y `buttonVariants`), con `loading`, `disabled`, ícono solo, `ButtonLink`, `SubmitButton`. Indicación para probar press/hover/foco. |
| 7 | `forms.tsx` | `Field` + `Input`/`Select`/`Textarea` (normal, con ayuda, con error `aria-invalid`, deshabilitado), `Checkbox`, `RadioGroup`, `Switch` (on/off/disabled), `Label`. |
| 8 | `selection.tsx` | `SegmentedControl` (2, 3 y 4 opciones; `sm/md/lg`; `fullWidth`; opción deshabilitada; dos instancias juntas), `Tabs` con 7 pestañas y contenido, `ToggleGroup` (filtros y grilla de horarios). |
| 9 | `content.tsx` | `Card` (con y sin encabezado, `padding="none"`), `PageHeader` con back, `SectionLabel`, `StatTile`, `Metric` (md/lg, con `null`, con tendencias positiva/negativa/neutral), `Badge` (5 tonos), `Alert` (4 tonos), `EmptyState`, `Quantity`, `AdequacyBar` (low/ok/high y por encima). |
| 10 | `lists.tsx` | `GroupedList` con filas: valor, descripción, ícono, switch, link con chevron, destructiva, deshabilitada, encabezado y pie. `Table` con encabezado sticky en contenedor `max-h-72`, filas con `onClick`, columnas numéricas. |
| 11 | `overlays.tsx` | Botones que abren: `Dialog`, `Modal` (compat), `useConfirm` destructivo y no destructivo, `Sheet` right/left/bottom (modal y `modal={false}`), `Popover`, `DropdownMenu` con ítem destructivo y submenú, `Tooltip`, y toasts `notify.saved/error/info`. |
| 12 | `states.tsx` | `StatusScreen` (error y 404 con sus acciones), `PageSkeleton`, `TableSkeleton`, `CardSkeleton`, botón "Simular carga" que alterna skeleton ↔ contenido (para ver el fundido). |
| 13 | `calendar.tsx` | FullCalendar `timeGridWeek` sin eventos de la base (eventos literales) para ver el tema. |
| 14 | `chart.tsx` | Un `ChartContainer` con barras y la paleta de `chartPalette` (series, estudios, métricas, tejidos). |

`/dev-diseno-portal`: header con scroll edge, tab bar con material, tarjetas tocables de muestra
(`press-sm`), texto largo para scrollear por debajo, un `Sheet side="bottom"` con grabber para arrastrar,
inputs a 17 px, y los mismos interruptores de simulación.

---

## 14. Radio de impacto (lista exacta)

### 14.1 Archivos que se modifican

```
apps/web/package.json                                   (+ motion)
package-lock.json
apps/web/tailwind.config.ts
apps/web/src/app/globals.css
apps/web/src/app/layout.tsx
apps/web/src/app/global-error.tsx
apps/web/src/app/not-found.tsx
apps/web/src/app/(panel)/layout.tsx
apps/web/src/app/(portal)/layout.tsx
apps/web/src/lib/utils.ts
apps/web/src/lib/chart-theme.ts
apps/web/src/components/ui.tsx
apps/web/src/components/status-screen.tsx
apps/web/src/components/skeletons.tsx
apps/web/src/components/login-screen.tsx
apps/web/src/components/confirm.tsx                     (solo clases del footer/botones)
apps/web/src/components/primitives/alert-dialog.tsx
apps/web/src/components/primitives/button.tsx
apps/web/src/components/primitives/chart.tsx            (solo clases del tooltip)
apps/web/src/components/primitives/checkbox.tsx
apps/web/src/components/primitives/dialog.tsx
apps/web/src/components/primitives/dropdown-menu.tsx
apps/web/src/components/primitives/label.tsx
apps/web/src/components/primitives/popover.tsx
apps/web/src/components/primitives/radio-group.tsx
apps/web/src/components/primitives/separator.tsx        (si hace falta; API igual)
apps/web/src/components/primitives/sheet.tsx
apps/web/src/components/primitives/skeleton.tsx
apps/web/src/components/primitives/sonner.tsx
apps/web/src/components/primitives/switch.tsx
apps/web/src/components/primitives/table.tsx
apps/web/src/components/primitives/tabs.tsx
apps/web/src/components/primitives/toggle.tsx
apps/web/src/components/primitives/toggle-group.tsx     (si hace falta; API igual)
apps/web/src/components/primitives/tooltip.tsx
apps/web/src/components/shell/app-sidebar.tsx
apps/web/src/components/shell/mobile-topbar.tsx
apps/web/src/components/shell/nav-config.ts
apps/web/src/components/shell/portal-nav.tsx
apps/web/src/components/shell/sidebar-content.tsx
apps/web/src/components/shell/sidebar-layout.css
apps/web/src/components/shell/sign-out-button.tsx       (solo si cambia el ícono; si no, sin tocar)
```

### 14.2 Archivos nuevos

```
apps/web/src/app/fonts.ts
apps/web/src/lib/design-tokens.ts           + design-tokens.test.ts
apps/web/src/lib/contrast.ts                + contrast.test.ts
apps/web/src/lib/motion.ts                  + motion.test.ts
apps/web/src/lib/motion-features.ts
apps/web/src/lib/use-controllable-state.ts
apps/web/src/lib/utils.test.ts
apps/web/src/components/motion-provider.tsx
apps/web/src/components/segmented-control.tsx
apps/web/src/components/grouped-list.tsx
apps/web/src/components/primitives/use-dismiss-drag.ts
apps/web/src/components/shell/portal-header.tsx
apps/web/src/components/shell/use-optimistic-path.ts
apps/web/src/components/shell/use-scroll-edge.ts
apps/web/src/app/(panel)/dev-diseno/page.tsx
apps/web/src/app/(panel)/dev-diseno/_sections/{colors,typography,shape,materials,motion,buttons,forms,selection,content,lists,overlays,states,calendar,chart}.tsx
apps/web/src/app/dev-diseno-portal/page.tsx
```

### 14.3 Archivos que NO se tocan (y cambian de aspecto igual)

Todas las pantallas del panel y del portal (017b–d), `components/data-table.tsx`, `modal.tsx`,
`submit-button.tsx`, `evolution-chart.tsx`, `comparative-chart.tsx`, `study-comparison-chart.tsx`,
`kcal-breakdown-popover.tsx`, `number-input.tsx`, los PDF (`lib/pdf-*`, `plan-pdf.tsx`,
`anthropometric-report-pdf.tsx`, `report-pdf-charts.tsx`, `pdf-theme.ts`), `lib/notify.ts`, `apps/bot/**`,
`packages/**`, `backlog/**`.

### 14.4 Zona de imleticio: qué cambia visualmente sin tocar sus archivos

Archivos: `app/(panel)/alimentos/**`, `app/(panel)/pacientes/[id]/planes/**`, `app/(panel)/plantillas/**`,
`components/food-picker.tsx`, `components/meals-editor.tsx` (26 `.tsx`, PR #7 abierto: toca
`alimentos/**`, `planes/**`, `plantillas/[id]/page.tsx`, `food-picker.tsx`; **ninguno** de los
archivos de 14.1). Dependen de: `ui.tsx` (`Button` ×10, `Card` ×8, `Input` ×7, `Field`/`FormError` ×6,
`PageHeader` ×5, `Textarea`/`Select`/`EmptyState` ×3, `Badge`/`Alert`/`Quantity` ×2, `inputClass` ×1),
`skeletons` y `primitives/skeleton` (×5), `confirm`, `submit-button`, `modal`, `data-table`,
`primitives/table|switch|label`, `kcal-breakdown-popover` (→ `primitives/popover`).

| Qué ven | Por qué |
|---|---|
| Botón principal azul; "secundario" gris lleno; "danger" rojo suave en vez de lleno; press con escala | `buttonVariants`, mapping de `ui.tsx` |
| Tarjetas sin borde, radio 16, título 17 px | `Card` |
| Títulos de página 28 px bold; back con chevron azul | `PageHeader` |
| Inputs con borde `#86868A`, radio 8, halo azul de foco; **16 px en táctil** | `inputClass` + regla global |
| Skeletons grises (no teñidos) | `Skeleton` |
| Tracking/leading nuevos en todo `text-xs…4xl`; Inter con `opsz` | escala re-mapeada |
| Popover de `kcal-breakdown-popover` con material y spring desde el disparador | `primitives/popover` |
| Popover propio de `food-picker.tsx:140` (`shadow-md`, `bg-popover`, `rounded-md`): sombra nivel 2, radio 8, fondo blanco; **sin** spring ni material (queda así hasta 017e) | re-mapeo de `boxShadow`/`borderRadius` |
| Confirmaciones (borrar plan/plantilla) con estilo alerta de Apple | `confirm.tsx` |
| Sin hover pegado en táctil | `hoverOnlyWhenSupported` |
| Fundido de 150 ms al entrar a cada pantalla | `#contenido > *` |

**Cómo se verifica que no se rompe (solo lectura):** recorrido de §17.4 en esas rutas a 1366 y 390 px,
antes (en `main`) y después, abriendo el buscador de `food-picker` y el popover de kcal, **sin guardar,
borrar ni generar con IA**; `git diff main --stat` sin archivos de la zona; `typecheck` de `apps/web`.

---

## 15. Checklist de ejecución (atómico, en orden; el panel compila y anda después de cada paso)

> Cada `[ ]` termina con `npm run typecheck --workspace apps/web` en verde salvo que diga otra cosa.
> Commits por fase en la rama (`git add` solo los archivos de la fase; el árbol tiene archivos ajenos sin
> trackear: `.mcp.json`, `docker-compose.prod.yml`, `hus-last-meet.md`, `apps/bot/.whatsapp-auth.vieja*`,
> `backlog/*`, `docs/auditoria-apple/`… **no** se agregan). Trailer `Co-Authored-By` del implementer.

### Fase 0 — Preflight

- [ ] 0.1 `git status` y `git log -1` en `feat/hu-017-rediseno-apple`; anotar en `progress/impl_HU-017a.md`.
- [ ] 0.2 `gh pr view 7 --json state,mergedAt`: si ya se mergeó, `git rebase origin/main` (o merge) antes de empezar; si sigue abierto, seguir (el merge final espera a PR #7; D11).
- [ ] 0.3 Capturas **antes** (`npm run dev` sobre el commit actual, base de dev levantada, **solo lectura**): todas las rutas de §17.4 a 1366×768 y 390×844 (más 768×1024 en portal y ficha) → `docs/auditoria-apple/017a/antes/NN-ruta-ancho.png` (no se commitean salvo que el usuario lo pida).
- [ ] 0.4 Medir en 1366×768 que la sidebar entra sin scroll (DevTools: `nav.scrollHeight <= nav.clientHeight`); anotar.

### Fase 1 — Dependencias y helpers puros (sin cambio visual salvo `opsz`)

- [ ] 1.1 `npm install motion@^14.0.0 --workspace apps/web`. Verificar: `node -p "require('motion/package.json').version"` → 14.x.
- [ ] 1.2 `lib/contrast.ts` + `contrast.test.ts` (§16). Verificar: `npm run test`.
- [ ] 1.3 `lib/design-tokens.ts` con **todos** los valores de §7 y §12.2 + `design-tokens.test.ts` (contrastes, materiales, chart ≥ 3:1, `hexToHslChannels`). Verificar: `npm run test`.
- [ ] 1.4 `lib/motion.ts` + `motion.test.ts`; `lib/motion-features.ts`. Verificar: `npm run test`.
- [ ] 1.5 `lib/use-controllable-state.ts`.
- [ ] 1.6 `lib/utils.ts` con `extendTailwindMerge` (claves de `typeScale` y sombras nuevas) + `utils.test.ts`. Verificar: test.
- [ ] 1.7 `app/fonts.ts` (`axes: ["opsz"]`); `layout.tsx` y `global-error.tsx` lo importan. Verificar: `npm run dev`, en DevTools → Computed `font-variation-settings`/`font-optical-sizing: auto` y que el `@font-face` de Inter declara `opsz`; sin salto de layout al cargar (Performance → CLS ≈ 0).
- [ ] 1.8 `components/motion-provider.tsx`; montarlo en `app/layout.tsx`. Verificar: dev sin errores de consola; Network muestra el chunk de `motion-features` cargado en diferido.

### Fase 2 — Tokens nuevos conviviendo con los viejos

- [ ] 2.1 `tailwind.config.ts`: importar `./src/lib/design-tokens`; plugin `addBase` que emite **solo las variables nuevas** (§7.8 fila 2–6) y las de materiales/duraciones; `extend.colors` con los roles nuevos (`grouped`, `fill-hover`, `fill-pressed`, `tertiary`, `placeholder`, `primary-hover|pressed|soft|soft-hover|soft-pressed|vibrant`, `destructive-hover|pressed`, `destructive-muted-hover|pressed`, `muted-foreground-vibrant`, `overlay-hover`, `overlay-pressed`, `scrim`); `extend.fontSize` con los estilos semánticos; `extend.boxShadow` `card|float|modal|thumb|focus`; `extend.borderRadius.xs`; `transitionDuration`/`transitionTimingFunction`; `keyframes`/`animation` `fade-in`; variante `pressed:`; `future.hoverOnlyWhenSupported: true`. **No** se re-mapean todavía `fontSize` xs–4xl, `borderRadius` sm/md/lg ni `boxShadow` sm/md/lg. Verificar: dev compila; una pantalla cualquiera se ve igual que en 0.3 (salvo hover en táctil); en DevTools `:root` tiene `--primary-soft` etc.
- [ ] 2.2 `globals.css`: agregar (sin borrar nada todavía) las clases `.press`, `.press-sm`, `.press-none`, `.touch-target`, `.material-chrome|bar|float` con sus fallbacks y media queries de §7.5/§7.7, `-webkit-tap-highlight-color`, `::selection`. Verificar: dev compila; nada cambia (nadie las usa).

### Fase 3 — Página demo (andamio)

- [ ] 3.1 `app/(panel)/dev-diseno/page.tsx` con el guard de producción, metadata noindex, barra de simulación y las secciones 1–5 (tokens, tipografía, forma, materiales, movimiento). Verificar: `/dev-diseno` abre con sesión; contrastes de la sección 1 todos ✓.
- [ ] 3.2 `app/dev-diseno-portal/page.tsx` vacío con el guard (se completa en Fase 6). Verificar: abre.

### Fase 4 — Primitivos (uno por paso; cada uno se agrega a la demo y se prueba en una pantalla real que lo use)

- [ ] 4.1 `button.tsx` (§9.1). Demo sección 6. Pantalla: `/servicios`.
- [ ] 4.2 `skeleton.tsx`, `label.tsx`, `separator.tsx`. Pantalla: `/pacientes` cargando (Network → Slow 3G).
- [ ] 4.3 `checkbox.tsx`, `radio-group.tsx`, `switch.tsx` (Motion en el thumb). Demo sección 7. Pantalla: `/servicios` (switch Activo) **sin guardar** (el toggle guarda: solo mirar el press; o probar en la demo).
- [ ] 4.4 `toggle.tsx`/`toggle-group.tsx`. Pantalla: `/mensajes` (filtros) y modal de nuevo turno (horarios) **sin crear turno**.
- [ ] 4.5 `table.tsx`. Pantalla: `/pacientes` (press de fila, header sticky).
- [ ] 4.6 `tabs.tsx` (indicador + fundido). Pantallas: `/pacientes/[id]` (todas las pestañas) y `/ajustes`.
- [ ] 4.7 `tooltip.tsx`. Pantalla: sidebar colapsada.
- [ ] 4.8 `popover.tsx` (patrón §9.0). Pantalla: plan de un paciente → popover de kcal (**solo abrir/cerrar**; zona de imleticio).
- [ ] 4.9 `dropdown-menu.tsx` (+ `variant`). Solo demo (sin usos hoy).
- [ ] 4.10 `dialog.tsx` (patrón + centrado sin translate). Pantallas: `/` → "Nuevo turno" (abrir, cerrar a mitad de la animación, Esc, foco vuelve al botón) **sin guardar**; `/disponibilidad` → agregar bloque (abrir/cancelar).
- [ ] 4.11 `alert-dialog.tsx` + clases de `confirm.tsx`. Pantalla: demo (`useConfirm`) y un "Borrar" cualquiera **cancelando**.
- [ ] 4.12 `use-dismiss-drag.ts` + `sheet.tsx` (lados, grabber, modal/no modal, drag). Pantallas: `/servicios` → Editar (abrir/cerrar, interrumpir) **sin guardar**; `/` → clic en un turno (sheet no modal, elegir otro turno sin cerrar); demo: arrastrar con emulación táctil.
- [ ] 4.13 `sonner.tsx`. Demo: `notify.*`.
- [ ] 4.14 `chart.tsx` (tooltip). Pantalla: `/pacientes/[id]` pestaña Evolución.

### Fase 5 — Componentes de aplicación

- [ ] 5.1 `ui.tsx`: `Button`/`ButtonLink` (mapping + `tinted`/`plain`), `Card`, `PageHeader`, `SectionLabel`, `StatTile`, `Field`, `inputClass`/`Input`/`Select`/`Textarea`, `Badge`, `Alert`, `EmptyState`, `AdequacyBar`; agregar `Metric`. Demo secciones 6, 7, 9. Pantallas: `/pagos` (StatTile), `/pacientes/[id]` (Card, Badge, Alert), `/alimentos` (solo lectura).
- [ ] 5.2 Regla global de inputs ≥ 16 px en táctil + 17 px en `.theme-portal` (`globals.css`). Verificar: DevTools con emulación de iPhone → `font-size` computado 16 px en un input del panel.
- [ ] 5.3 `segmented-control.tsx` y `grouped-list.tsx`. Demo secciones 8 y 10.
- [ ] 5.4 `skeletons.tsx`, `status-screen.tsx`. Demo sección 12; `/no-existe` (404).
- [ ] 5.5 `login-screen.tsx` (con `SubmitButton`). Verificar en ventana privada `/inicio` y `/login`: el botón muestra spinner al enviar (no completar el login si no hace falta).

### Fase 6 — Shell

- [ ] 6.1 `use-optimistic-path.ts`, `use-scroll-edge.ts`.
- [ ] 6.2 `nav-config.ts` (`sidebarItemClass`) + `sidebar-content.tsx` (indicador `layoutId`, optimista, badge, `density`).
- [ ] 6.3 `app-sidebar.tsx` (slot `m.div` con ancho spring, sin FLIP/WAAPI, `LayoutGroup`) + `sidebar-layout.css` (rem, `overflow:hidden` en el slot, sin `clip-path`, hover dentro de `@media (hover: hover)`, sin el bloque de reduced-motion). Verificar: colapsar/expandir rápido dos veces (invierte sin frenazo); el texto del workspace no se estira; 1366×768 sin scroll en la nav (repetir 0.4).
- [ ] 6.4 `mobile-topbar.tsx` (material, scroll edge, botón 44, sheet izquierdo con drag, `density="touch"`, `LayoutGroup`). Verificar a 390 px.
- [ ] 6.5 `portal-header.tsx` (nuevo) + `portal-nav.tsx` (tab bar material, activo vibrant, optimista, `activeHref`) + `(portal)/layout.tsx` (`.theme-portal`, `bg-grouped`, main con padding inferior, portal sin link, Toaster con offset). Verificar en `/portal` con sesión de paciente (§17.4) a 390 y 1366.
- [ ] 6.6 `(panel)/layout.tsx` (skip link) y `app/not-found.tsx` (`theme-portal`).
- [ ] 6.7 Completar `/dev-diseno-portal` y las secciones 11–14 de `/dev-diseno`.

### Fase 7 — El "flip": nombres shadcn con valores Apple y reglas globales

- [ ] 7.1 Plugin: emitir también los nombres shadcn con valores de §7.1 y `.theme-portal, :root:has(.theme-portal) { --grouped: …FBFAF7 }`; `globals.css`: **borrar** el bloque `:root` viejo (`globals.css:6-45`) y `.theme-warm` (`:47-66`). Verificar: `/` y `/pacientes` en azul/grises fríos; contraste de la sección 1 de la demo leyendo los valores computados.
- [ ] 7.2 Re-mapear `fontSize` xs–4xl (§7.2), `borderRadius` (sm/DEFAULT/md/lg/xl/2xl; quitar `var(--radius)`), `boxShadow` (sm/DEFAULT/md/lg/xl). Verificar: recorrido rápido de 5 pantallas a 1366.
- [ ] 7.3 `globals.css`: borrar la regla global de reduced-motion (`:91-99`); agregar la política de §7.7 (skeleton estático, `scroll-behavior`, Sonner, tooltip sin zoom, press sin escala); `body` con `text-body` y `font-optical-sizing`; `#contenido > *`/`[data-portal-main] > *` con `animate-fade-in`; `:focus-visible` con `--ring`.
- [ ] 7.4 Tema de FullCalendar (§11). Verificar: `/` a 1366 y 390.
- [ ] 7.5 `lib/chart-theme.ts` desde `chartPalette` (§12.2). Verificar: `npm run test` y `/pacientes/[id]` (Evolución) + antropometría.

### Fase 8 — Retirar lo viejo

- [ ] 8.1 Buscar y eliminar en `apps/web/src`: `theme-warm`, `--radius`, `bg-primary/10`, el FLIP (`previousBounds`, `element.animate(`), `clip-path` de la sidebar. Comandos en §17.3 → 0.
- [ ] 8.2 Quitar `tracking-tight` de los archivos de 14.1 (no de los de fuera de alcance).
- [ ] 8.3 Verificar que `sidebar-layout.css` ya no tiene px de layout (solo `rem`) salvo hairlines.

### Fase 9 — Verificación final y cierre

- [ ] 9.1 Todo §17 (comandos, alcance, recorrido "después", teclado, movimiento, contraste, iOS).
- [ ] 9.2 `progress/impl_HU-017a.md` completo (archivos, capturas antes/después con rutas, mediciones, desvíos, respuestas a las Q de §20 si se resolvieron distinto del default).

---

## 16. Tests (vitest, desde la raíz: `npm run test`)

Los componentes son visuales; se testea la lógica pura y los tokens. Sin DOM (el entorno es `node`).

| Archivo | Casos |
|---|---|
| `lib/contrast.test.ts` | `contrastRatio("#FFFFFF","#000000")` = 21 (±0,01); blanco/blanco = 1; simetría `a,b` = `b,a`; `#0066CC` sobre blanco ≈ 5,57; `compositeOver("#FFFFFF", 0.8, "#000000")` = `#CCCCCC`; acepta hex en minúsculas y sin `#`. |
| `lib/design-tokens.test.ts` | (1) Cada fila de `contrastRequirements` cumple su `min` (incluye todos los pares de §7.1: label/sec/placeholder/tint/rojo/éxito/aviso/info sobre W, G, PW, F y sus `*-muted`; blanco sobre `primary`, `-hover`, `-pressed`, `destructive*`; `primary-vibrant` sobre `primary-soft-pressed`; `destructive-pressed` sobre `destructive-muted-pressed`; `input` ≥ 3 sobre W, G, PW, F; `ring` ≥ 3 sobre W, G, `primary-soft`). (2) Para cada material y cada token de `MATERIAL_TEXT_TOKENS`: contraste ≥ 4,5 sobre `compositeOver("#FFFFFF", alpha, under)` con `under` ∈ {`#000000`, `#1D1D1F`, `#0066CC`, `#D70015`}. (3) Todos los colores de `chartPalette` ≥ 3 sobre blanco. (4) `hexToHslChannels("#0066CC")` = `"210 100% 40%"` y `("#FFFFFF")` = `"0 0% 100%"`. (5) No queda ningún valor Notion (`#37352F`, `45 4% 18%`…) en `colors`. (6) `cssVariablesFor` genera `--primary: 210 100% 40%`. |
| `lib/motion.test.ts` | `projectMomentum(0)` = 0; `projectMomentum(1000)` ≈ 499 y `projectMomentum(200)` ≈ 99,8 (d = 0,998); signo se conserva; `rubberband(0, 300)` = 0; `rubberband(300, 300)` ≈ 106,45; monótono creciente y siempre < `dimension` (asíntota); `rubberband(1e6, 300)` < 300; `dragOffset(50, 300)` = 50; `dragOffset(400, 300)` = 300; `dragOffset(-50, 300)` ≈ −25,19 (entre −50 y 0); `resolveDismiss` con `size: 300`: `{offset:10, velocity:900}` = "dismiss"; `{offset:250, velocity:-900}` = "restore" (manda el signo); `{offset:30, velocity:100}` → 30 + 49,9 < 150 → "restore"; `{offset:100, velocity:200}` → 100 + 99,8 ≥ 150 → "dismiss"; `{offset:120, velocity:0}` = "restore"; `{offset:200, velocity:0}` = "dismiss"; `gestureIntent(5,3)` = null; `(12,3)` = "axis"; `(3,12)` = "cross"; `isPlainLeftClick` falso con `metaKey`, `ctrlKey`, `shiftKey`, `altKey`, `button: 1`, `defaultPrevented`; verdadero en el caso plano. Presets: todos `type: "spring"`; `bounce` 0 salvo `fling` (0,2) y `toggle` (0,15). |
| `lib/utils.test.ts` | `cn("text-foreground", "text-headline")` conserva ambas; `cn("text-sm", "text-headline")` = `"text-headline"`; `cn("text-callout", "text-muted-foreground")` conserva ambas; `cn("shadow-sm", "shadow-float")` = `"shadow-float"`; `cn("rounded-md", "rounded-xl")` = `"rounded-xl"`. |

Lo que no tiene test automático (se verifica a mano en §17): springs reales, gestos, materiales,
Radix + Motion, foco.

---

## 17. Verificación (antes de declararse `done`)

### 17.1 Compilación y arnés

```bash
npm run db:generate                     # por si el cliente no está generado (no toca la base)
npm run typecheck                       # todos los workspaces (web es el que cambia; bot/db/core deben seguir verdes)
npm run test                            # vitest de la raíz (incluye apps/web/src/lib/*.test.ts)
./ops/harness/verify.sh
```

`next build` solo si el usuario lo pide y **con `next dev` apagado** (HU §11). Si se corre, anotar el
First Load JS de `/` y `/portal` antes/después (presupuesto: + ≤ 45 KB gz con `domMax` diferido).

### 17.2 Alcance del diff

```bash
git diff main --stat
git diff main --name-only | grep -E '^apps/web/src/app/\(panel\)/(alimentos|plantillas)/|pacientes/\[id\]/planes/|components/(food-picker|meals-editor)\.tsx' # → vacío
git diff main --name-only | grep -E '^(packages|apps/bot|backlog)/'                                                                           # → vacío
git diff main --name-only | grep -vE '^(apps/web/|package-lock\.json|progress/|Refactorizaciones/|docs/)'                                     # → vacío
```

### 17.3 Lo que tiene que desaparecer

```bash
cd apps/web/src
grep -rn "theme-warm\|var(--radius)" .                                          # → 0
grep -rn "45 8% 20%\|45 4% 18%\|60 11% 96%\|60 4% 91%" .                         # → 0 (valores Notion)
grep -rn "prefers-reduced-motion" app/globals.css components/shell/sidebar-layout.css   # → solo la política nueva (sin "0.01ms")
grep -rn "0.01ms" .                                                              # → 0
grep -rn "scaleX\|previousBounds\|clip-path" components/shell                    # → 0
grep -rn "bg-primary/10" components                                              # → 0
grep -rn "motion\.div\|from \"framer-motion\"" .                                  # → 0 (solo m.* de motion/react)
grep -rnE "#[0-9A-Fa-f]{6}" components app/globals.css lib/chart-theme.ts | grep -v "brand.tsx"   # → 0 (los hex viven en design-tokens.ts; GoogleG queda)
grep -rn "dev-diseno" components/shell lib                                       # → 0 (fuera de la navegación)
```

### 17.4 Recorrido visual (con `npm run dev`, base de dev levantada, **solo lectura**)

Anchos: 1366×768 y 390×844 (Chrome DevTools, emulación táctil en 390); 768×1024 en portal y ficha.
Capturas **después** en `docs/auditoria-apple/017a/despues/` con el mismo nombre que las de 0.3.

- **Panel:** `/`, `/disponibilidad`, `/servicios`, `/pacientes`, `/pacientes/[id]` (las 7 pestañas),
  `/pacientes/[id]/consultas/[cid]`, `…/antropometria`, `…/antropometria/informe`, `/mensajes`, `/pagos`,
  `/avisos`, `/asistente`, `/ajustes` (4 secciones), `/ajustes/whatsapp`, `/no-existe` (404), un
  `loading` (Network → Slow 3G), `/dev-diseno` completa.
- **Zona de imleticio (solo mirar):** `/alimentos`, `/alimentos/[id]`, `/alimentos/nuevo` (no enviar),
  `/plantillas`, `/plantillas/[id]`, `/pacientes/[id]/planes/[planId]` (abrir el buscador de
  `food-picker`, el popover de kcal; no guardar, no borrar, no "generar con IA").
- **Portal:** sesión de paciente **sin escribir en la base**: obtener un id con
  `docker compose exec db psql -U <usuario> -d <db> -c 'SELECT id FROM "Patient" LIMIT 1;'` y generar el
  token con `npx tsx --env-file=.env -e "import('./packages/db/domain/patientAuth.ts').then(m => console.log(m.createPatientToken('<id>', 60)))"`
  → abrir `/portal/login?token=<token>`. Recorrer `/portal`, `/portal/plan`, `/portal/evolucion`,
  `/portal/diario` (no enviar registros), "Salir" al final, y el portal sin sesión. `/dev-diseno-portal`.
- **Sin sesión:** `/inicio` y `/login` en ventana privada.

### 17.5 Criterios de §7.1 (cómo se prueba cada uno)

| Criterio | Cómo |
|---|---|
| Un único juego de tokens | §17.3 + revisión de `design-tokens.ts`; `chart-theme.ts` y FullCalendar leen tokens. |
| Acento como señal | Recorrido: azul solo en acción principal, selección, foco, links y navegación activa. |
| Contraste accesible | `npm run test` (design-tokens) + demo sección 1 + DevTools "Contrast" en 5 textos al azar, incluido texto sobre el header del portal con contenido oscuro debajo. |
| Escala tipográfica | Demo sección 2; DevTools en un `PageHeader`, un título de `Card`, cuerpo y nota al pie. |
| Inputs sin zoom | iOS Simulator o iPhone (o emulación con `pointer: coarse`): `font-size` computado ≥ 16 px; tocar un input del Diario del portal → sin zoom. |
| Feedback al presionar | Mantener presionado (sin soltar): botón de cada variante, ítem de sidebar, pestaña de la tab bar, fila de `/pacientes`, tarjeta de la demo del portal. Arrastrar afuera con el mouse → vuelve. |
| Hover solo con puntero | Emulación táctil: tocar un botón y levantar → sin estilo de hover. |
| Sheets/modales interrumpibles | Abrir el sheet de Editar servicio y cerrarlo (Esc) a mitad: vuelve desde donde estaba, por el mismo borde. Grabar la pantalla y revisar cuadro a cuadro (§17 del skill). |
| Menús desde su origen | Popover de kcal y DropdownMenu de la demo crecen desde el disparador y vuelven a él. |
| Indicadores que se deslizan | Sidebar, pestañas de la ficha, segmentado de la demo, nav superior del portal. |
| Sidebar sin deformar | Colapsar en `/pacientes` (tabla): el texto no se estira; doble clic rápido invierte. |
| Chrome translúcido | Portal a 390: scrollear el inicio; el contenido pasa difuminado bajo header y tab bar; el borde del header aparece solo al scrollear. |
| Movimiento reducido | macOS → Accesibilidad → Pantalla → Reducir movimiento: sheet, modal, menú y pestaña = fundido; gráficos sin crecer; press solo tono. |
| Transparencia reducida / más contraste | macOS → Reducir transparencia / Aumentar contraste: chrome sólido; con contraste, borde visible. |
| Teclado | Tab por sidebar, botones, pestañas, segmentado, switch, inputs: anillo azul; Dialog/Sheet: foco atrapado, Esc cierra y el foco vuelve al disparador. |
| Objetivos táctiles | 390 px: medir con DevTools (o el `::after`) X de cierre, ítems del menú, tab bar, switch: ≥ 44×44. |
| Shell en notebook | 1366×768: grupos + pie sin scroll; activo por fondo + color + peso + ícono. |
| Marca sin cambios | "Numa" + logo idénticos en panel, portal y login. |
| Sin cambios de funcionalidad | Los flujos solo se **abren y cancelan** (crear turno, cargar medición, enviar aviso: no se envían); entrar al portal con token. No se escribe en la base. |
| Zona de imleticio sin cambios de archivo | §17.2. |

### 17.6 Rendimiento

Chrome Performance (CPU 4× slowdown) a 390 px: scroll del portal con header y tab bar → sin frames
largos sostenidos; colapsar la sidebar en `/pacientes` → anotar el peor frame. Si el ancho animado da
frames > 32 ms de forma sostenida, aplicar la mitigación de R-3 y anotarlo.

---

## 18. Restricciones para el implementer

- **No tocar** la zona de imleticio (`alimentos/**`, `pacientes/[id]/planes/**`, `plantillas/**`,
  `food-picker.tsx`, `meals-editor.tsx`), ni `packages/**`, `apps/bot/**`, `backlog/**`, los PDF.
- **No cambiar firmas** de `ui.tsx` ni de los primitivos (§6.2). Props nuevas solo opcionales.
- **Datos de la base de desarrollo — regla dura (AGENTS.md):** ninguna verificación escribe en la base.
  Los flujos se abren y se cancelan. El token del portal se genera sin escribir (HMAC). No correr
  `db:seed`/`seed:demo`. No `prisma migrate`.
- **WhatsApp: nunca mensajes reales.** No enviar avisos, no cancelar turnos, no marcar mensajes. Nada
  de esta HU encola en `OutboundMessage`.
- Motion: solo `m.*` (LazyMotion `strict`), importado de `motion/react`; nada de `motion.*` ni
  `framer-motion` directo. Animar solo `transform` y `opacity` (excepción documentada: ancho del slot de
  la sidebar).
- Ningún hex fuera de `lib/design-tokens.ts` (excepto `GoogleG` en `brand.tsx` y los colores de servicio,
  que son dato).
- No crear valores mágicos: duraciones, springs, radios, sombras y tamaños salen de los tokens.
- Mantener `h-14` en la topbar móvil (`patient-tabs.tsx` depende de `top-14`).
- No correr `next build` con `next dev` levantado. No migrar a Tailwind 4. No eliminar `tailwindcss-animate`.
- `git add` solo de los archivos de la tarea (el árbol tiene archivos ajenos sin trackear).
- Skill `apple-design` para cualquier decisión no prevista: §1 respuesta, §3 interrupción, §4 springs
  críticamente amortiguados, §7 simetría, §12 materiales, §14 accesibilidad.

---

## 19. Riesgos y rollback

| # | Riesgo | Mitigación |
|---|---|---|
| R-1 | (R1 HU) Las pantallas de imleticio cambian de aspecto sin revisión propia y el PR #7 se mergea sobre componentes re-estilados. | Firmas intactas; 14.4 lista el cambio visible; recorrido en solo lectura; mergear 017a **después** del PR #7 y avisarle con el diff de tokens (D11). PR #7 no toca ningún archivo de 14.1 → sin conflictos de texto. |
| R-2 | Motion 14 es un major reciente; algún detalle de API o de Turbopack puede diferir. | Exports y opciones verificados en el tarball 14.0.0 (§8). Si algo falla, bajar a la última 12.x/13.x compatible con React 19 sin cambiar la SDD (misma API `m`/`LazyMotion`/`AnimatePresence`). |
| R-3 | Animar el **ancho** del slot reflowea el workspace en cada cuadro (tablas grandes). | Medir (§17.6). Si hay jank: `contain: layout paint` en el workspace durante la animación; si no alcanza, animar el slot con `clip-path`/`translateX` y aplicar el ancho final al terminar (sin `scaleX`), documentado como desvío. |
| R-4 | Radix + `AnimatePresence`: foco, Esc o scroll lock rotos si el patrón se aplica mal. | Patrón único (§9.0) implementado primero en `dialog.tsx` (4.10) y probado con teclado antes de copiarlo. |
| R-5 | `backdrop-filter` en Android gama baja o Safari con sticky. | Blur solo en header/topbar/tab bar/popovers/toasts; nunca en tablas; fallbacks sólidos; probar en iOS Simulator (R12 HU). |
| R-6 | `hoverOnlyWhenSupported` cambia el comportamiento de `hover:` en todo el repo (también `group-hover`). | Es el objetivo (T2). En puntero fino nada cambia; en táctil se pierde el hover pegado. Revisar en el recorrido que nada dependía de hover para mostrar información (tooltips usan Radix, no `hover:`). |
| R-7 | `tailwind-merge` y tokens con nombre (G13). | `extendTailwindMerge` + `utils.test.ts` antes de usar `text-headline` en componentes (1.6). |
| R-8 | El "flip" (Fase 7) cambia ~25 pantallas de golpe. | Demo aprobada antes (Fase 3–6); capturas antes/después; commit propio de la Fase 7 para revertir solo eso. |
| R-9 | Optimistic active marca una ruta que después falla o redirige. | Se limpia en el próximo cambio de `pathname` y a los 4 s como tope; sin efecto funcional. |

**Rollback:** no hay datos ni migraciones. (a) Antes del merge: `git revert` del commit de la fase
problemática (las fases son commits separados). (b) Después del merge: revertir el merge commit de
017a; vuelve el sistema HU-002 completo. (c) Parcial: revertir solo el commit de la Fase 7 deja los
nombres shadcn con los valores Notion y los componentes nuevos funcionando (convivencia de §7.8).
`motion` se puede quitar con `npm uninstall motion --workspace apps/web` tras revertir.

---

## 20. Dudas técnicas (con default; ninguna bloquea)

| # | Duda | Default que aplica el implementer |
|---|---|---|
| Q1 | Con `opsz`, Inter ya ajusta el espaciado en tamaños grandes (corte "Display"); el tracking negativo de la fórmula puede quedar apretado en 28–34 px. | Usar los valores de §7.2 y calibrar en la demo (sección 2). Si se ve apretado, reducir a la mitad el tracking de `title-1`, `large-title`, `metric*` **solo en `design-tokens.ts`** y anotarlo. |
| Q2 | `font-feature-settings` de Inter para dígitos más parecidos a SF (`ss01`, `cv11`…). | Ninguno extra; solo `tabular-nums` en datos. La demo tiene un toggle para que el usuario decida después. |
| Q3 | Color del badge de pendientes: tint o rojo de sistema (HU S7 deja ambas). | **Tint** (rojo reservado a error/destructivo; §16 color como señal). |
| Q4 | `#FBFAF7` (portal) casi no se distingue del blanco: las tarjetas dependen del anillo de 0,5 px. | Mantener (D2 validado); revisar en 017d con el inicio real. |
| Q5 | Ancho animado vs. rendimiento (R-3). | Ancho con spring; mitigación de R-3 solo si la medición lo pide. |
| Q6 | `info` (`#0058B0`) y el tint (`#0066CC`) son de la misma familia. | Mantener; `info` siempre con ícono y superficie, nunca interactivo. |
| Q7 | Track del switch apagado: AA (`#86868A`) vs. el gris claro de iOS (`#E9E9EA`, 1,2:1). | **AA**. |
| Q8 | La demo del portal exige login de Google (middleware). | Aceptado: es una herramienta de desarrollo. |
| Q9 | Tooltip en CSS, no en Motion (D-T7). | CSS. |
| Q10 | `control-border`: la HU dice `#8E8E93`, que da 2,99:1 sobre `#F5F5F7`. | **`#86868A`** (3,33 sobre G, 3,63 sobre W). |
| Q11 | Materiales: la HU propone 72 % de blanco; con texto secundario/tint no llega a AA sobre fondo oscuro. | **80 % (chrome) / 85 % (bar, float)** + texto *vibrant* dentro de materiales (§7.5). |
| Q12 | `Button variant="danger"` pasa de rojo lleno a rojo suave en todas las pantallas antes de que 017c mueva las destructivas a menús "…". | Sí (T13, D13): menos peso que la acción principal; la confirmación final sigue en rojo lleno. |
| Q13 | `Button variant="secondary"` pasa de outline a gray. | Sí (Apple *gray*); `outline` sigue disponible en el primitivo para quien lo pida explícito (`patient-header.tsx`). |

## 21. Resoluciones del usuario (2026-10-03) — tienen prioridad sobre el resto de la SDD

- **Q1–Q13:** se aceptan los defaults de la sección 20.
- **Corte en la demo:** el implementer ejecuta las **fases 0 a 6** y se detiene (`done` parcial con la
  demo lista en `/dev-diseno` y `/dev-diseno-portal`). El usuario revisa la demo; recién con su
  aprobación (y los ajustes que pida) se ejecutan las fases 7 a 9.
- **Rama base:** donde dice `origin/main` (0.2) leer `origin/develop`: las ramas de HU salen de
  `develop` y vuelven por PR a `develop` (AGENTS.md). El merge final de 017a espera al PR #7 (D11).
- **Commits por fase** en la rama (locales, sin push), como dice la sección 15, con
  `git add` solo de los archivos de la fase.
