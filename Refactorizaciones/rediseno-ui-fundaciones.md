# SDD — HU-002a `rediseno-ui-fundaciones` (Rediseño UI 1/4: fundaciones y shell)

HU validada: `docs/hu-rediseno-ui-empresarial.md`. **Manda su sección final "Resoluciones"**
(D1–D18). Esta SDD cubre **solo la fila HU-002a** de "Propuesta de partición": tokens,
tipografía, componentes base, sidebar, layouts de panel y portal, `loading`/`error`/`not-found`,
tema de FullCalendar y de los gráficos, login e `/inicio`.

Skills aplicados: **`refactor`** (diagnóstico, radio de impacto y checklist sin romper nada en
el medio: secciones 3, 9 y 11) y **`ui`** (vistas con estructura y componentes shadcn/ui:
sección 8).

---

## 1. Resumen funcional

Se reemplaza el sistema visual "Spring-inspired" por uno sobrio al estilo Notion: blanco, grises
cálidos, acento neutro casi negro, una sola sans (Inter) y mucho aire. Los tokens pasan a ser
variables CSS (el modo oscuro queda preparado, pero no se activa), consumidas por Tailwind 3.4
con la convención de shadcn/ui. Se incorporan los primitivos de shadcn/ui (estilo `new-york` de
Tailwind v3, sobre Radix) y un set de componentes de aplicación: botones, campos, tarjetas,
tabla de datos, pestañas, diálogo y confirmación, panel lateral, toast, estado vacío, esqueletos,
callout, número con unidad y barra de adecuación. La barra superior del panel pasa a ser una
**sidebar agrupada** (colapsable a íconos y, en pantallas de menos de 1024 px, un menú que se abre
con un botón). Muestra "NutriBot", el nombre de la nutricionista, el estado del bot de WhatsApp y
"Cerrar sesión". El portal usa los mismos tokens con un tono más cálido y una navegación que suma
**Plan** (pestañas abajo en el celular, arriba en pantallas grandes). `/login` e `/inicio` pasan a
ser la misma pantalla de login sobria. Se agregan `loading`, `error` y `not-found`, y se
re-tematizan FullCalendar y los gráficos. **Las pantallas no se migran en esta HU**: cambian de
aspecto solo por los primitivos de `ui.tsx` y por un mapeo de compatibilidad de los tokens viejos,
así que el panel sigue funcionando y se ve coherente mientras 002b, 002c y 002d migran cada
pantalla. No cambia ninguna funcionalidad.

---

## 2. Workspaces afectados

| Workspace | ¿Se toca? | Qué |
|---|---|---|
| `apps/web` | **Sí** | Todo el trabajo: dependencias, tokens, primitivos, componentes, shell, layouts, pantallas de entrada y de estado |
| `apps/bot` | **No** | Nada. Ningún mensaje cambia |
| `packages/core` | **No** | Nada |
| `packages/db` | **No** | Nada: ni `schema.prisma`, ni migraciones, ni `domain/`. Solo se **leen** `Professional` y `BotStatus` desde `apps/web` |

**Restricciones duras para el implementer** (copiarlas tal cual en `progress/impl_HU-002a.md`):

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

---

## 3. Diagnóstico (skill `refactor`)

Analizado en solo lectura sobre el estado actual de `apps/web` (commit `3a0ab1b` + working tree).

**Tokens y estilos**

- `tailwind.config.ts` define la paleta en **hex fijos** (`ink`, `leaf`, `mint`, `paper`, `line`,
  `link`, `brand`) sin variables CSS. No hay base para modo oscuro (0 usos de `dark:`) y cambiar un
  color obliga a tocar clases.
- `text-ink-faint` (`#8a94a0`) tiene un contraste de ~3:1 sobre blanco y es la clase de texto **más
  usada** del panel (109 usos). Todas esas etiquetas, ayudas y metadatos quedan por debajo de WCAG AA.
- `globals.css` mezcla el tema de FullCalendar (botones en mayúsculas, `border-2`, rayado verde en
  las horas no laborables), `.btn-*` en mayúsculas con borde grueso y `.font-display` (`ss01`,
  tracking negativo) para Space Grotesk.
- La animación `float-slow` y los `.btn-solid`, `.btn-outline` y `.btn-leaf` solo se usan en
  `inicio`, `login` y `globals.css`.

**Componentes**

- `components/ui.tsx`: `cn` es un `filter(Boolean).join(" ")`, sin resolver conflictos de clases.
  Si un consumidor pasa `className="w-24"` a un `Input`, convive con `w-full`. `Button` usa
  `border-2`. `SectionLabel`, `StatTile` y `Badge` van en mayúsculas espaciadas.
- `components/modal.tsx`: maneja Escape y el clic afuera, pero **no atrapa el foco**, no lo
  devuelve al disparador y no bloquea el scroll del body. No cumple el escenario "Navegación con
  teclado".
- `components/nav.tsx` y `nav-links.tsx`: barra superior con 10 enlaces en fila. En mobile pasan a
  una segunda fila con scroll horizontal. El activo se marca solo con un subrayado verde, sin
  `aria-current`. El botón "Salir" lleva borde grueso y mayúsculas.
- `components/brand.tsx`: `SpringShapes`, `CornerTriangle` y `Eyebrow` son decorativos y se
  eliminan (Gherkin "Un único sistema de tokens"). `LeafMark` lleva un trazo blanco en hex.
- `evolution-chart.tsx` y `comparative-chart.tsx` llevan los colores de ejes y grilla en hex
  (`#4a5460`, `#dbe2d8`) copiados en los dos archivos.
- No existen tabla de datos, pestañas, toast, diálogo de confirmación, panel lateral, esqueleto,
  estado vacío, callout ni número con unidad (HU, "Componentes del sistema").

**Layouts y pantallas de entrada**

- `(panel)/layout.tsx`: `main max-w-6xl` y navegación arriba. No hay "saltar al contenido".
- `(portal)/layout.tsx`: "Plan" no está en la navegación. Los enlaces miden ~20 px de alto, lejos
  de los 44 px táctiles. El activo no se distingue.
- `login/page.tsx` e `inicio/page.tsx` son de marketing: formas decorativas, mayúsculas,
  `reveal`, 6 íconos SVG inline sueltos y el mismo server action `signIn` copiado **4 veces**.
- No hay `loading.tsx`, `error.tsx` ni `not-found.tsx` en ninguna ruta. 4 páginas llaman a
  `notFound()` (`pacientes/[id]`, `planes/[planId]`, `alimentos/[id]`, `plantillas/[id]`) y
  muestran el 404 por defecto de Next.

**Alcance del sistema viejo fuera de esta HU** (lo migran 002b, 002c y 002d, y por eso esta HU
necesita una capa de compatibilidad):

- 46 archivos usan tokens viejos. Recuento de clases: `text-ink-faint` 109, `text-ink` 107,
  `text-ink-soft` 76, `border-line` 72, `bg-paper` 50, `text-leaf-deep` 29, `border-ink` 19,
  `divide-line` 13, `border-leaf` 12, `bg-ink` 12, `bg-mint` 11, `bg-leaf` 10, y otros menores
  (`accent-leaf`, `ring-leaf/15`, `bg-leaf-tint`…). `font-display` aparece en 41 lugares fuera de
  los archivos de esta HU. `.press` y `.reveal` también se usan fuera.
- Imports de `@/components/ui`: `Button` ×34, `Field` ×17, `Input` ×16, `Card` ×16,
  `PageHeader` ×14, `SectionLabel` ×12, `Badge` ×12 (tonos usados: `green`, `red`, `amber`),
  `Textarea` ×11, `Select` ×10, `cn` ×2, `StatTile` ×2, `ButtonLink` ×1. Variantes: `secondary`
  ×13, `ghost` ×7, `danger` ×1, y `size="sm"` ×16.
- `Modal` lo usan 6 archivos de agenda (002c).
- `confirm()` nativo en 3 lugares: `delete-plan-button.tsx` (002b), `broadcast-form.tsx` (002c) y
  `delete-template-button.tsx` (002d).

**Conclusión:** conviene conservar las **APIs públicas** de `ui.tsx` y `modal.tsx` y
reimplementarlas sobre shadcn/ui, y mapear los **nombres** de los tokens viejos a las variables
nuevas en `tailwind.config.ts`. Así, en el momento en que cambian los primitivos, las 22 pantallas
toman la paleta, la tipografía y el contraste nuevos sin editarlas, y cada HU siguiente limpia sus
archivos.

---

## 4. Decisión técnica: shadcn/ui sobre Tailwind 3.4 + Next 15 + React 19

Verificado contra lo instalado y contra el registry real (2026-09-23), no de memoria:

| Pieza | Instalado / verificado |
|---|---|
| `tailwindcss` | 3.4.19 (`^3.4.17` en `apps/web/package.json`) |
| `next` | 15.5.24 |
| `react` / `react-dom` | 19.2.8 |
| `typescript` | 5.9.3 |
| `@mui/x-charts` | 9.13.0 |
| `@fullcalendar/*` | 6.1.21 |
| CLI `shadcn` | `latest` = 4.21.0. Detecta Tailwind v3 por `package.json` y usa el estilo `new-york` (v3). El changelog de shadcn aclara que los proyectos con Tailwind v3 "siguen funcionando" y que al agregar componentes "se quedan en v3". Para v3, la versión documentada del CLI es `shadcn@2.3.0` |
| Registry v3 | `https://ui.shadcn.com/r/styles/new-york/<componente>.json` responde 200 para todos los componentes de esta HU. Usa paquetes `@radix-ui/react-*` sueltos, `class-variance-authority`, `lucide-react` y el plugin `tailwindcss-animate` |
| `tailwind-merge` | **Tiene que ser v2** (`^2.6.1`). La v3 es solo para Tailwind v4 (el CLI 4.x lo dice textual: "Tailwind CSS v3 projects should continue using tailwind-merge v2") |
| `sonner` 2.0.8, `lucide-react` 1.47.0, `@radix-ui/*` | Aceptan React 19 en `peerDependencies`. Los íconos que usa esta SDD existen en `lucide-react@1.47.0` (verificado en su `.d.ts`; ojo: `Loader2` no existe, se llama `LoaderCircle`) |

**Decisiones:**

1. **Sin migrar a Tailwind 4** (D7). Estilo `new-york`, colores en **canales HSL** (`--x: H S% L%`,
   consumidos como `hsl(var(--x) / <alpha-value>)`), que es la convención v3 de shadcn.
2. **Los primitivos no se generan con el CLI, se descargan del registry con un script
   determinista** (checklist, paso 1.4). El CLI (2.3.0 o 4.x) puede pedir confirmaciones por los
   peer deps de React 19, reescribir `tailwind.config.ts` y `globals.css`, e instalar
   `next-themes` para `sonner`. Igual se deja un `components.json` válido para que las HU
   siguientes puedan usar `npx shadcn@2.3.0 add <x>` si quieren, revisando el diff.
3. Primitivos en **`src/components/primitives/`**, no en `src/components/ui/`, porque ya existe
   `src/components/ui.tsx`: `@/components/ui` quedaría ambiguo entre el archivo y la carpeta. El
   alias `ui` de `components.json` apunta a `@/components/primitives`.
4. Sin `next-themes`. El `Toaster` va con `theme="light"` fijo (D4: el modo oscuro no se activa).
5. **No se usa el bloque `sidebar` de shadcn**: trae su propio estado en cookie, más de 10 variables
   CSS extra y un corte mobile en 768 px, pero el Gherkin exige menú colapsado **en** 768 px. La
   sidebar se arma con `Sheet`, `Tooltip` y los tokens (sección 8.1).
6. **`Select` sigue siendo el `<select>` nativo** con estilo nuevo. El `Select` de Radix cambia la
   API de hijos (`<option>`) y el comportamiento en `FormData`, y hoy hay 10 usos.
7. Dependencias en `dependencies` de `apps/web` (incluido `tailwindcss-animate`, como hace shadcn),
   con estas versiones:

```
@radix-ui/react-alert-dialog@^1.1.23  @radix-ui/react-checkbox@^1.3.11
@radix-ui/react-dialog@^1.1.23        @radix-ui/react-dropdown-menu@^2.1.24
@radix-ui/react-label@^2.1.15         @radix-ui/react-radio-group@^1.4.7
@radix-ui/react-separator@^1.1.15     @radix-ui/react-slot@^1.3.3
@radix-ui/react-switch@^1.3.7         @radix-ui/react-tabs@^1.1.21
@radix-ui/react-toggle@^1.1.18        @radix-ui/react-toggle-group@^1.1.19
@radix-ui/react-tooltip@^1.2.16       class-variance-authority@^0.7.1
clsx@^2.1.1                           lucide-react@^1.47.0
sonner@^2.0.8                         tailwind-merge@^2.6.1
tailwindcss-animate@^1.0.7
```

---

## 5. Esquema

**No cambia.** Sin migración. `apps/web` solo **lee** (consultas nuevas en `src/lib/shell.ts`):

- `Professional.name`, `Professional.botPaused` (fila `id = 1`).
- `BotStatus.connected` (fila `id = 1`).

---

## 6. Contrato compartido

### 6.1 `packages/db/domain` y `packages/core`

**Sin cambios.** No hay funciones nuevas ni modificadas en `packages/`. `getProfessional()` no se
usa en el shell, porque tira error si falta la fila y el layout quedaría inutilizable: el shell
consulta `prisma` directo y tolera `null`.

### 6.2 Contrato de UI de `apps/web` (lo que consumen 002b, 002c y 002d)

Este es el contrato real de esta HU: **nombres, props y ubicación exactos**. Las HU siguientes
pueden **agregar** props opcionales, pero no romper estas firmas.

**Regla de imports:**

- Componentes de aplicación → `@/components/ui` (server-safe, sin `"use client"`) y los archivos
  sueltos que se listan abajo.
- Primitivos shadcn (Dialog, Sheet, Tabs, Tooltip, DropdownMenu, Switch, Checkbox, RadioGroup,
  ToggleGroup, Separator, Label, Skeleton, Table) → **directo** desde
  `@/components/primitives/<nombre>`. `ui.tsx` **no** los re-exporta, para no armar un barrel
  enorme de módulos cliente.

#### `src/lib/utils.ts` (nuevo)

```ts
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
export function cn(...inputs: ClassValue[]): string;   // twMerge(clsx(inputs))
```

`ui.tsx` re-exporta `cn` desde acá (`export { cn } from "@/lib/utils"`), así los 2 usos actuales
de `cn` desde `@/components/ui` siguen compilando. **No** se agregan tamaños de fuente custom en
Tailwind (`text-2xs`, etc.): `tailwind-merge` los confundiría con colores.

#### `src/components/ui.tsx` (reescrito, API existente conservada)

| Export | Firma | Cambio visual |
|---|---|---|
| `cn` | re-export de `@/lib/utils` | resuelve conflictos de clases |
| `Card` | `({ children, className?, title?: string, description?: string, actions?: ReactNode, padding?: "md" \| "none" }) ` | `rounded-lg border bg-card p-6`, sin sombra. Si hay `title`, renderiza un encabezado (`h2 text-base font-semibold` + `description` en `text-sm text-muted-foreground` + `actions` a la derecha). `padding="none"` sirve para tablas a sangre. **Nuevo:** `title`, `description`, `actions`, `padding` (todos opcionales) |
| `PageHeader` | `({ title: string, description?: string, action?: ReactNode, back?: { href: string; label: string } })` | `h1 text-2xl font-semibold tracking-tight`, `mb-8`. `back` es **nuevo**: enlace chico con `ArrowLeft` arriba del título |
| `SectionLabel` | `({ children })` | `h2 mb-4 text-base font-semibold text-foreground`. Sin mayúsculas, sin tick |
| `Button` | `ComponentProps<"button"> & { variant?: "primary" \| "secondary" \| "danger" \| "ghost" \| "link"; size?: "sm" \| "md" \| "lg" \| "icon"; loading?: boolean }` | Sobre `buttonVariants` del primitivo. Mapa: `primary→default`, `secondary→outline`, `danger→destructive`, `ghost→ghost`, `link→link`; `sm→sm`, `md→default`, `lg→lg`, `icon→icon`. Con `loading`: `disabled` + `LoaderCircle` girando delante de los hijos. **Nuevos:** `link`, `lg`, `icon`, `loading` |
| `ButtonLink` | `ComponentProps<typeof Link> & { variant?, size? }` (mismos tipos) | igual que `Button` |
| `StatTile` | `({ label: string, value?: ReactNode, children? })` | etiqueta `text-sm text-muted-foreground`, valor `text-2xl font-semibold tabular-nums` |
| `Field` | `({ label: string, children, hint?: string, error?: string })` | sigue envolviendo en `<label>`. Etiqueta `text-sm font-medium`, hint `text-xs text-muted-foreground`, `error` en `text-xs text-destructive`. **Nuevo:** `error` |
| `FormError` | `({ message?: string \| null })` | **Nuevo.** Si hay mensaje: `<p role="alert" className="text-sm text-destructive">`; si no, `null` |
| `inputClass` | `string` | `h-9 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50` |
| `Input`, `Select`, `Textarea` | `ComponentProps<"input" \| "select" \| "textarea">` | `cn(inputClass, className)`. `Textarea`: `h-auto min-h-20 py-2`. `Select`: nativo, `pr-8` |
| `Badge` | `({ children, tone?: "neutral" \| "success" \| "danger" \| "warning" \| "info" \| "slate" \| "green" \| "red" \| "amber" \| "blue" })` | `rounded-md px-2 py-0.5 text-xs font-medium`, sin mayúsculas. `neutral`/`slate` → `bg-secondary text-foreground`; `success`/`green` → `bg-success-muted text-success`; `danger`/`red` → `bg-destructive-muted text-destructive`; `warning`/`amber` → `bg-warning-muted text-warning`; `info`/`blue` → `bg-info-muted text-info`. **Nuevos:** los tonos semánticos. Los viejos quedan como alias (se borran en 002d) |
| `Alert` | `({ tone?: "info" \| "warning" \| "danger" \| "success", title?: string, children?: ReactNode, className? })` | **Nuevo.** Callout: `rounded-lg border px-4 py-3 text-sm`, fondo `*-muted`, ícono (`Info`, `TriangleAlert`, `CircleAlert`, `CircleCheck`) y título en `font-medium`. El tono **no** depende solo del color, porque lleva ícono y título |
| `EmptyState` | `({ title: string, description?: string, action?: ReactNode, icon?: LucideIcon })` | **Nuevo.** Centrado, `py-12`, ícono `h-8 w-8 text-muted-foreground`, título `text-base font-medium`, descripción `text-sm text-muted-foreground max-w-sm`, acción debajo |
| `Quantity` | `({ value: number \| null \| undefined, unit?: string, decimals?: number /* default 1 */, className? })` | **Nuevo.** `Intl.NumberFormat("es-AR", { maximumFractionDigits: decimals })`, `tabular-nums`, unidad separada con espacio duro y en `text-muted-foreground`. `null`/`undefined` se muestran como `—` |
| `AdequacyBar` | `({ label: string, value: number, target: number, unit: string, status: "low" \| "ok" \| "high", decimals?: number })` | **Nuevo.** Fila: etiqueta, `Quantity value / Quantity target` y `% ` redondeado. Barra `h-2 rounded-full bg-secondary` con relleno `min(value/target, 1) × 100 %`; si `value > target`, el relleno llega al 100 % y aparece una marca al final. Color: `low → bg-warning`, `ok → bg-success`, `high → bg-destructive`, **más** texto "Por debajo", "En rango" o "Por encima" (no depende solo del color). `role="meter"`, `aria-valuemin={0}`, `aria-valuemax={target}`, `aria-valuenow={value}`, `aria-valuetext="<value> de <target> <unit>"`. **El `status` lo calcula quien lo usa** (la regla de adecuación es dominio y va a vivir en `packages/core`, Épica 23) |

#### Archivos cliente nuevos (`"use client"`)

```ts
// src/components/number-input.tsx
export function NumberInput(
  props: Omit<ComponentProps<"input">, "type"> & { unit: string }
): JSX.Element;
// <input type="number" inputMode="decimal" step={props.step ?? "any"}> con inputClass + "pr-12 text-right tabular-nums";
// unidad a la derecha en un <span id={useId()}> (text-sm text-muted-foreground, pointer-events-none),
// enlazado con aria-describedby. El `name` y el valor del form no cambian.

// src/components/data-table.tsx
export type DataTableColumn<T> = {
  id: string;
  header: string;
  cell: (row: T) => ReactNode;
  numeric?: boolean;                                        // a la derecha + tabular-nums (th y td)
  sortValue?: (row: T) => string | number | Date | null;    // si está, la columna se puede ordenar
  className?: string;                                       // ancho, etc.
};
export function DataTable<T>(props: {
  columns: DataTableColumn<T>[];
  rows: T[];
  getRowId: (row: T) => string;
  rowHref?: (row: T) => string;       // fila clickeable (router.push); la 1.ª celda envuelve su contenido en <Link> para el teclado
  empty?: ReactNode;                  // si rows.length === 0; default <EmptyState title="No hay datos para mostrar" />
  maxHeightClassName?: string;        // p. ej. "max-h-[60vh]": scroll interno con encabezado fijo
  initialSort?: { columnId: string; direction: "asc" | "desc" };
  caption?: string;                   // <caption className="sr-only">
}): JSX.Element;
// Orden en cliente: strings con Intl.Collator("es", { numeric: true, sensitivity: "base" }),
// Date por getTime(), null siempre al final. Encabezado ordenable: <button> con ArrowUp/ArrowDown/ArrowUpDown,
// y aria-sort ("ascending" | "descending" | "none") en el <th>.
// El clic en la fila se ignora si el target está dentro de a, button, input, select, textarea o label.
// LÍMITE RSC: `cell`, `sortValue` y `rowHref` son funciones, así que DataTable SOLO se puede usar desde
// componentes cliente. Desde un server component usar los primitivos de @/components/primitives/table.

// src/components/confirm.tsx
export type ConfirmOptions = {
  title: string;               // "¿Borrar este plan?"
  description: string;         // "Esta acción no se puede deshacer."
  confirmLabel: string;        // "Borrar plan"
  cancelLabel?: string;        // default "Cancelar"
  destructive?: boolean;       // default true → botón de confirmar con variant destructive
};
export function ConfirmProvider({ children }: { children: ReactNode }): JSX.Element; // montado en el layout del panel
export function useConfirm(): (options: ConfirmOptions) => Promise<boolean>;
// AlertDialog de Radix: atrapa el foco, arranca en "Cancelar", Escape o Cancelar → false, confirmar → true.
// Resuelve la promesa una sola vez. Sin provider: throw new Error("useConfirm necesita <ConfirmProvider> (está en el layout del panel)").
// Uso previsto (reemplazo directo de confirm()):
//   const confirm = useConfirm();
//   if (!(await confirm({ title, description, confirmLabel }))) return;

// src/components/modal.tsx (API conservada; 6 consumidores en 002c)
export function Modal(props: { open: boolean; onClose: () => void; title: string; children: ReactNode }): JSX.Element;
// Reimplementado sobre Dialog: <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>,
// DialogContent "max-w-lg max-h-[90vh] overflow-y-auto", DialogTitle = title, aria-describedby={undefined}.
// Gana foco atrapado, devolución de foco y bloqueo del scroll del body. Escape y el clic afuera siguen cerrando.
```

#### Otros módulos nuevos

```ts
// src/lib/notify.ts (sin "use client": se usa desde componentes cliente)
export const notify: {
  saved: (message?: string) => void;   // toast.success(message ?? "Cambios guardados")
  error: (message?: string) => void;   // toast.error(message ?? "No se pudo guardar. Probá de nuevo.")
  info: (message: string) => void;     // toast(message)
};
export function useActionToast(
  state: { ok: boolean; error?: string },
  options?: { success?: string; errorAsToast?: boolean }   // errorAsToast default false: el error va inline con FormError
): void;
// useEffect sobre la identidad de `state`: si state.ok → notify.saved(options?.success).
// Si state.error && errorAsToast → notify.error(state.error). Encaja con el patrón actual
// useActionState + { ok, error } (10 tipos *State en el panel).

// src/lib/shell.ts ("server-only")
export type BotShellStatus = "connected" | "paused" | "disconnected";
export async function getProfessionalDisplayName(): Promise<string | null>;
//   prisma.professional.findUnique({ where: { id: 1 }, select: { name: true } }) → name?.trim() || null
export async function getBotShellStatus(): Promise<BotShellStatus>;
//   pro.botPaused → "paused"; si no, BotStatus(id 1).connected → "connected"; si no → "disconnected".
//   Si falta alguna fila → "disconnected". Nunca tira.

// src/lib/chart-theme.ts
export const chartSeriesColors: readonly ["#2C6890", "#396F51", "#B37D19", "#7959A6", "#B53A36"];
export const chartDefaultColor: "#2C6890";
export const chartSx: object;     // sx para MUI X Charts; ejes, ticks y grilla con hsl(var(--…)), ver 7.4
export const chartMargin: { top: number; right: number; bottom: number; left: number };

// src/components/skeletons.tsx
export function PageSkeleton(): JSX.Element;                                   // encabezado + 2 bloques
export function TableSkeleton(props: { rows?: number; columns?: number }): JSX.Element;
export function CardSkeleton(props: { lines?: number }): JSX.Element;
// Todos: role="status", aria-busy, <span className="sr-only">Cargando…</span>, Skeleton del primitivo.

// src/components/status-screen.tsx
export function StatusScreen(props: {
  icon?: LucideIcon; title: string; description: string; actions?: ReactNode; detail?: string;
}): JSX.Element;   // centrado, min-h-[60vh]

// src/components/brand.tsx (reescrito)
export function Wordmark(props: { className?: string; subtitle?: string | null; compact?: boolean }): JSX.Element;
//   LeafMark h-5 w-5 text-foreground + "NutriBot" (text-sm font-semibold). `subtitle` en una línea debajo
//   (text-xs text-muted-foreground, truncate). compact = solo la marca + <span className="sr-only">NutriBot</span>.
export function LeafMark(props: { className?: string }): JSX.Element;  // monocromo: fill currentColor, nervio con className="stroke-background"
export function GoogleG(props: { className?: string }): JSX.Element;   // sin cambios (los hex son los colores oficiales de Google)
// SE ELIMINAN: SpringShapes, CornerTriangle, Eyebrow.

// src/components/login-screen.tsx (server component)
export function LoginScreen(): JSX.Element;   // contiene el server action inline de signIn, textual (ver 8.3)
```

#### Primitivos (`src/components/primitives/`, del registry `new-york` v3, adaptados en 1.5)

`button`, `dialog`, `alert-dialog`, `sheet`, `tabs`, `table`, `tooltip`, `dropdown-menu`,
`skeleton`, `label`, `switch`, `checkbox`, `radio-group`, `toggle`, `toggle-group`, `separator`,
`sonner`. Exports: los mismos de shadcn (p. ej. `Tabs, TabsList, TabsTrigger, TabsContent`;
`Sheet, SheetTrigger, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter,
SheetClose`; `Table, TableHeader, TableBody, TableFooter, TableRow, TableHead, TableCell,
TableCaption`; `Toaster`). Agregados propios: `numeric?: boolean` en `TableHead`/`TableCell` y
`containerClassName?: string` en `Table`.

---

## 7. Fundaciones (valores exactos)

### 7.1 Paleta (canales HSL; contrastes medidos)

Contraste calculado con la fórmula WCAG sobre los valores HSL exactos. Columnas: sobre
`background` / sobre `muted` (sidebar) / sobre `accent` (hover).

| Token | HSL | ≈ hex | Uso | Contraste |
|---|---|---|---|---|
| `--background` | `0 0% 100%` | `#FFFFFF` | fondo de página | — |
| `--foreground` | `45 8% 20%` | `#37352F` | texto principal (el de Notion) | 12,25 / 11,31 / 10,57 |
| `--card` / `--popover` | `0 0% 100%` | | tarjetas, menús | — |
| `--card-foreground` / `--popover-foreground` | `45 8% 20%` | | | |
| `--primary` | `45 4% 18%` | `#302F2C` | **acento neutro**: acción principal, activo | 13,42 / 12,39 / 11,58 |
| `--primary-foreground` | `0 0% 100%` | | texto sobre primary | 13,42 |
| `--secondary` | `60 7% 94%` | `#F1F1EF` | fondos de badge neutro y de barra | — |
| `--secondary-foreground` | `45 8% 20%` | | | |
| `--muted` | `60 11% 96%` | `#F6F6F4` | fondos suaves, skeleton, sidebar | — |
| `--muted-foreground` | `50 4% 38%` | `#65635D` | texto secundario, hints, placeholders (reemplaza `ink-faint`, que daba ~3:1) | 5,98 / 5,52 / 5,16 |
| `--accent` | `60 6% 93%` | `#EEEEEC` | hover y ítem activo (en shadcn "accent" es el fondo de hover, **no** el color de marca) | — |
| `--accent-foreground` | `45 8% 20%` | | | |
| `--destructive` | `2 54% 46%` | `#B53A36` | error, borrar | 5,80 / 5,36 / 5,01 |
| `--destructive-foreground` | `0 0% 100%` | | | 5,80 |
| `--destructive-muted` | `357 82% 96%` | `#FDECED` | fondo de callout/badge de error | texto destructive encima: 5,10 |
| `--success` | `147 32% 33%` | `#396F51` | | 5,88 / 5,43 / 5,07 |
| `--success-muted` | `111 23% 94%` | `#EDF3EC` | | 5,23 |
| `--warning` | `39 75% 30%` | `#865E13` | | 5,81 / 5,37 / 5,01 |
| `--warning-muted` | `45 80% 92%` | `#FBF3DA` | | 5,23 |
| `--info` | `204 53% 37%` | `#2C6890` | | 5,99 / 5,53 / 5,16 |
| `--info-muted` | `198 55% 94%` | `#E7F3F8` | | 5,30 |
| `--link` | `211 73% 42%` | `#1D68B9` | enlaces en texto (único uso del azul, D2) | 5,59 / 5,16 / 4,82 |
| `--border` | `60 4% 91%` | `#E9E9E7` | divisores y bordes de tarjeta (decorativos, fuera del 3:1) | — |
| `--input` | `48 2% 54%` | `#8C8B87` | **borde de controles** (el Gherkin pide 3:1) | 3,41 / 3,14 |
| `--ring` | `210 77% 51%` | `#2282E2` | anillo de foco (azul, D2) | 3,91 / 3,61 / 3,38 |
| `--sidebar` | `60 11% 96%` | | fondo de la sidebar | — |
| `--radius` | `0.5rem` | | `lg` 8 px (tarjetas), `md` 6 px (controles), `sm` 4 px | — |

**Portal, tono cálido (D11)**: mismos nombres de token, sobreescritos por la clase `theme-warm`
(ver 7.3). Solo cambian estos:

| Token | HSL | Contraste |
|---|---|---|
| `--background` | `40 43% 99%` | — |
| `--foreground`, `--card-foreground`, `--popover-foreground`, `--secondary-foreground`, `--accent-foreground` | `30 14% 20%` | 12,20 / 11,24 / 10,58 |
| `--card`, `--popover` | `0 0% 100%` | tarjetas blancas sobre fondo crema |
| `--primary` | `29 17% 25%` | 9,98 / 9,20 / 8,65 |
| `--secondary`, `--muted`, `--sidebar` | `37 31% 95%` | — |
| `--muted-foreground` | `32 9% 38%` | 5,93 / 5,47 / 5,14 |
| `--accent` | `37 32% 92%` | — |
| `--border` | `37 25% 90%` | — |
| `--input` | `37 11% 50%` | 3,67 / 3,38 / 3,18 |
| `--radius` | `0.75rem` | más redondeado, más amable |

**Gráficos**: `chartSeriesColors` = `#2C6890` (azul, igual a `--info`), `#396F51` (igual a
`--success`), `#B37D19` (ámbar), `#7959A6` (violeta), `#B53A36` (igual a `--destructive`). Todos
≥ 3:1 sobre blanco, que es lo que pide AA para elementos no textuales. Van en hex porque el SVG
de MUI los necesita resueltos. `chart-theme.ts` es el **único** lugar donde viven los colores de
serie.

### 7.2 `apps/web/tailwind.config.ts` (contenido objetivo)

```ts
import type { Config } from "tailwindcss";
import animate from "tailwindcss-animate";

const token = (name: string) => `hsl(var(--${name}) / <alpha-value>)`;

export default {
  darkMode: ["class"], // preparado; ningún código agrega la clase `dark` (D4)
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
        // LEGACY (HU-002d la elimina): alias a la sans; Space Grotesk ya no existe.
        display: ["var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      colors: {
        border: token("border"),
        input: token("input"),
        ring: token("ring"),
        background: token("background"),
        foreground: token("foreground"),
        primary: { DEFAULT: token("primary"), foreground: token("primary-foreground") },
        secondary: { DEFAULT: token("secondary"), foreground: token("secondary-foreground") },
        muted: { DEFAULT: token("muted"), foreground: token("muted-foreground") },
        accent: { DEFAULT: token("accent"), foreground: token("accent-foreground") },
        popover: { DEFAULT: token("popover"), foreground: token("popover-foreground") },
        card: { DEFAULT: token("card"), foreground: token("card-foreground") },
        destructive: {
          DEFAULT: token("destructive"),
          foreground: token("destructive-foreground"),
          muted: token("destructive-muted"),
        },
        success: { DEFAULT: token("success"), muted: token("success-muted") },
        warning: { DEFAULT: token("warning"), muted: token("warning-muted") },
        info: { DEFAULT: token("info"), muted: token("info-muted") },
        link: token("link"),
        sidebar: token("sidebar"),

        // ── LEGACY: compatibilidad con el sistema "Spring" mientras 002b/c/d migran.
        // HU-002d borra este bloque cuando `grep` no encuentre más usos.
        ink: { DEFAULT: token("foreground"), soft: token("muted-foreground"), faint: token("muted-foreground") },
        leaf: { DEFAULT: token("primary"), bright: token("primary"), deep: token("primary"), tint: token("accent") },
        mint: token("muted"),
        paper: token("card"),
        line: token("border"),
        brand: { DEFAULT: token("primary"), dark: token("primary") },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
        card: "var(--radius)", // LEGACY
      },
      boxShadow: {
        card: "none", // LEGACY: el sistema nuevo no usa sombra en tarjetas
        lift: "0 10px 30px -10px hsl(var(--foreground) / 0.18)", // LEGACY
      },
    },
  },
  plugins: [animate],
} satisfies Config;
```

Se borran `keyframes.float-slow` y `animation.float-slow`, que solo usaba `/inicio`.

Efecto del mapeo en las pantallas sin migrar: `text-ink-faint` pasa a `muted-foreground` y todas
esas etiquetas **suben a AA sin tocarlas**. `bg-leaf`, `border-leaf` y `text-leaf-deep` pasan al
acento neutro, `bg-mint` al gris muy claro y `accent-leaf` (checkboxes nativos) al casi negro.
Lo que no cambia en esas pantallas son los `border-2` y las `uppercase tracking-[…]` escritas a
mano: eso lo limpia cada HU de migración (D9 acepta la convivencia).

Si `import animate from "tailwindcss-animate"` no tipa en `tsc`, usar
`// eslint-disable-next-line @typescript-eslint/no-require-imports` + `require("tailwindcss-animate")`
y anotarlo en `impl`.

### 7.3 `apps/web/src/app/globals.css` (estructura objetivo)

En este orden:

1. `@tailwind base; @tailwind components; @tailwind utilities;`
2. `@layer base { :root { …todos los tokens de 7.1 con los HSL exactos…; color-scheme: light; } }`
3. **Tono cálido del portal**, en el mismo `@layer base`:
   `.theme-warm, :root:has(.theme-warm) { …tokens cálidos de 7.1… }`. El `:root:has(...)` hace que
   los overlays de Radix (que se renderizan en un portal dentro de `<body>`, fuera del div del
   portal) y el fondo del `body` también tomen el tono cálido. `:has` está en Safari 15.4+,
   Chrome 105+ y Firefox 121+. La clase sola cubre el contenido aunque el navegador no soporte
   `:has`.
4. `@layer base`:
   - `* { @apply border-border; }`
   - `body { @apply bg-background font-sans text-foreground antialiased; }`
   - `:focus-visible { outline: 2px solid hsl(var(--ring)); outline-offset: 2px; }`: foco visible
     también en los controles hechos a mano de las pantallas sin migrar. Los primitivos usan
     `focus-visible:outline-none` + `ring` y pisan esta regla.
5. **Movimiento reducido global** (Gherkin "Movimiento reducido"):
   ```css
   @media (prefers-reduced-motion: reduce) {
     *, *::before, *::after {
       animation-duration: 0.01ms !important;
       animation-iteration-count: 1 !important;
       transition-duration: 0.01ms !important;
       scroll-behavior: auto !important;
     }
   }
   ```
6. **Bloque LEGACY** con comentario `/* LEGACY (sistema Spring): HU-002d lo borra cuando no haya usos */`:
   solo `.press`/`.press:active` y `@keyframes reveal` + `.reveal` (se usan en archivos de
   002b/c/d). **Se borran** `.font-display` (la clase la sigue generando el alias de Tailwind),
   `.btn`, `.btn-solid`, `.btn-outline`, `.btn-leaf` y las variables `--ink` y `--mint`.
7. **Tema de FullCalendar** (reemplaza el actual por completo):
   ```css
   .fc {
     --fc-border-color: hsl(var(--border));
     --fc-today-bg-color: hsl(var(--muted));
     --fc-now-indicator-color: hsl(var(--destructive));
     --fc-page-bg-color: hsl(var(--background));
     --fc-neutral-bg-color: hsl(var(--muted));
     --fc-highlight-color: hsl(var(--accent) / 0.7);
     font-size: 0.8125rem;
   }
   .fc .fc-toolbar-title { @apply text-lg font-semibold tracking-tight text-foreground; }
   .fc .fc-col-header-cell-cushion { @apply py-2 text-xs font-medium text-muted-foreground; }
   .fc .fc-timegrid-slot-label-cushion, .fc .fc-list-day-text { @apply text-xs text-muted-foreground; }
   .fc .fc-button-primary {
     @apply h-8 rounded-md border border-input bg-background px-3 text-sm font-medium normal-case
       text-foreground shadow-none transition-colors;
   }
   .fc .fc-button-primary:hover { @apply border-input bg-accent text-foreground; }
   .fc .fc-button-primary:not(:disabled):active,
   .fc .fc-button-primary:not(:disabled).fc-button-active {
     @apply border-input bg-secondary font-semibold text-foreground;  /* activo: fondo + peso */
   }
   .fc .fc-button-primary:focus { @apply shadow-none; }
   .fc .fc-button-primary:focus-visible { @apply outline-none ring-2 ring-ring ring-offset-1; }
   .fc .fc-button-primary:disabled { @apply border-border bg-background text-muted-foreground opacity-100; }
   .fc .fc-daygrid-event, .fc .fc-timegrid-event { @apply rounded-sm border-0 px-1.5 py-0.5 text-xs font-medium; }
   .fc .fc-non-business { background: hsl(var(--muted)); }   /* plano, sin rayado */
   .fc .fc-timegrid-now-indicator-arrow { display: none; }
   .fc .fc-event:focus-visible { @apply outline-none ring-2 ring-ring ring-offset-1; }
   ```
   El color de fondo de cada turno sigue saliendo del color del servicio (es un dato, no se
   toca). FullCalendar no se reemplaza.

### 7.4 Tipografía, escala y gráficos

- `src/app/layout.tsx`: solo `Inter` (`variable: "--font-sans"`, `display: "swap"`,
  `subsets: ["latin"]`). **Se borra `Space_Grotesk`** y `--font-display`.
  `<html lang="es" className={sans.variable}>`. `metadata` sin cambios.
- Escala (solo la de Tailwind, sin `px` sueltos):

| Rol | Clases |
|---|---|
| Título de página (h1) | `text-2xl font-semibold tracking-tight` |
| Título de sección / Card (h2) | `text-base font-semibold` |
| Subtítulo (h3) | `text-sm font-semibold` |
| Texto de interfaz | `text-sm` |
| Secundario / hint | `text-sm text-muted-foreground` / `text-xs text-muted-foreground` |
| Números | `tabular-nums`, a la derecha en tablas, unidad siempre visible |
| **Prohibido** en código nuevo | `uppercase`, `tracking-[…]`, `font-bold` en títulos, `border-2`, sombras en tarjetas |

- Aire (D6): `space-y-8` entre secciones, `p-6` en tarjetas, `gap-4`/`gap-6` en grillas de
  formulario, `mb-8` debajo del `PageHeader`. Controles `h-9` en el panel. En el portal los
  controles táctiles usan `size="lg"` (`h-11` = 44 px).
- Íconos: **solo `lucide-react`**, `h-4 w-4` en controles y `strokeWidth` por defecto.
- `chartSx` (en `chart-theme.ts`):
  ```ts
  {
    fontFamily: "inherit",
    "& .MuiChartsAxis-tickLabel": { fill: "hsl(var(--muted-foreground))", fontSize: 12 },
    "& .MuiChartsAxis-label": { fill: "hsl(var(--muted-foreground))" },
    "& .MuiChartsAxis-line, & .MuiChartsAxis-tick": { stroke: "hsl(var(--border))" },
    "& .MuiChartsGrid-line": { stroke: "hsl(var(--border))" },
    "& .MuiChartsLegend-label": { fill: "hsl(var(--foreground))" },
  }
  ```
  `chartMargin = { top: 12, right: 16, bottom: 28, left: 44 }`. Si el tipo de `sx` protesta,
  tiparlo como `SxProps<Theme>` (de `@mui/system`, ya instalado).
- `evolution-chart.tsx` y `comparative-chart.tsx`: **misma API**, solo cambian el default
  `color = chartDefaultColor` (en evolution), `sx={chartSx}` (comparative:
  `sx={{ ...chartSx }}` con su margen propio) y `margin={chartMargin}` en evolution. No cambian
  a barras: eso es de la 002b.

---

## 8. Vistas (skill `ui`)

Cada vista con su estructura base y sus componentes clave, pensada para cumplir los principios
UX de la HU: sobria, datos protagonistas, aire, consistencia, caso oración y accesible.

### 8.1 Shell del panel: sidebar (`(panel)/layout.tsx`)

**Estructura base** (≥ 1024 px):

```
┌───────────────┬──────────────────────────────────────────────────┐
│ Sidebar 240px │ main#contenido  (mx-auto max-w-screen-2xl         │
│ bg-sidebar    │   px-6 py-8 lg:px-10)                             │
│ border-r      │                                                   │
│ sticky h-screen                                                   │
└───────────────┴──────────────────────────────────────────────────┘
```

- Wrapper: `<TooltipProvider delayDuration={300}><ConfirmProvider>` + enlace "Saltar al
  contenido" (`sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50
  rounded-md bg-background px-3 py-2 text-sm shadow`) + `<div className="flex min-h-screen
  bg-background">` + `<Toaster position="bottom-right" />`.
- Columna de contenido: `flex min-w-0 flex-1 flex-col` (el `min-w-0` evita el scroll horizontal
  por hijos anchos).
- A 1366 px quedan ~1046 px útiles (240 de sidebar + 80 de padding). Con la sidebar colapsada
  (56 px), ~1230 px.

**Sidebar (`AppSidebar`, cliente)**: `aside`, `group/sidebar`,
`data-collapsed={collapsed}`, `sticky top-0 hidden h-screen shrink-0 flex-col border-r bg-sidebar
lg:flex`, ancho `w-60` o `w-14`, `transition-[width] duration-200`.

1. **Encabezado**: `Wordmark subtitle={professionalName}` (colapsada: `compact`) + botón fantasma
   `size="icon"` con `PanelLeftClose` / `PanelLeftOpen`, `aria-label` "Contraer barra lateral" /
   "Expandir barra lateral" y `aria-expanded`. Al tocarlo escribe la cookie
   `nb-sidebar=collapsed|expanded; path=/; max-age=31536000; samesite=lax`. El layout la lee con
   `(await cookies()).get(SIDEBAR_COOKIE)` para el estado inicial, sin parpadeo.
2. **Navegación** `<nav aria-label="Principal">` con los grupos de `nav-config.ts` (D3):

   | Grupo | Ítems (href, ícono lucide) |
   |---|---|
   | Agenda | Calendario `/` `CalendarDays` · Disponibilidad `/disponibilidad` `Clock` · Servicios `/servicios` `Tag` |
   | Pacientes | Pacientes `/pacientes` `Users` |
   | Nutrición | Alimentos `/alimentos` `Apple` · Plantillas `/plantillas` `Files` |
   | Gestión | Pagos `/pagos` `Wallet` · Avisos `/avisos` `Megaphone` |
   | Herramientas | Asistente `/asistente` `Sparkles` |

   - Etiqueta de grupo: `px-2 pb-1 pt-4 text-xs font-medium text-muted-foreground`. Colapsada:
     se reemplaza por un `Separator`.
   - Ítem: `relative flex h-8 items-center gap-2.5 rounded-md px-2 text-sm text-muted-foreground
     hover:bg-accent hover:text-foreground`.
   - **Activo** (no depende solo del color): `aria-current="page"` + `bg-accent font-medium
     text-foreground` + barra de 2 px a la izquierda (`before:absolute before:inset-y-1.5
     before:left-0 before:w-0.5 before:rounded-full before:bg-foreground`).
   - Regla de activo, igual que hoy: `href === "/" ? pathname === "/" : pathname.startsWith(href)`.
   - Colapsada: solo el ícono, la etiqueta en `sr-only`, y un `Tooltip` `side="right"` con la
     etiqueta.
3. **Pie** (`mt-auto border-t p-2`):
   - Ítem **Ajustes** `/ajustes` `Settings`, que también queda activo en `/ajustes/whatsapp`.
   - **Estado del bot**: `Link` a `/ajustes/whatsapp`, `text-xs text-muted-foreground`, con punto
     `h-2 w-2 rounded-full` + texto. Textos exactos: `connected` → "WhatsApp conectado" (punto
     `bg-success`), `paused` → "Bot pausado" (`bg-warning`), `disconnected` → "WhatsApp
     desconectado" (`bg-destructive`). Colapsada: solo el punto + `sr-only` + tooltip. Se calcula
     en cada render del layout: en navegación cliente puede quedar desactualizado hasta recargar.
     Es aceptable y hay que anotarlo en `impl`.
   - **Cuenta**: el email (`truncate text-xs text-muted-foreground`, `title={email}`, oculto
     colapsada) + el slot `account` = `<SignOutButton />`.

**`SignOutButton`** (`shell/sign-out-button.tsx`, server): `<form action={async () => { "use
server"; await signOut({ redirectTo: "/inicio" }); }}>`, **idéntico** al de `nav.tsx`. Adentro, un
`<button type="submit">` con el mismo estilo de ítem, `LogOut` y
`<span className="group-data-[collapsed=true]/sidebar:sr-only">Cerrar sesión</span>`. Se pasa
como `ReactNode` a los componentes cliente (`account` prop), así el action sigue inline y sin
cambios.

**< 1024 px (`MobileTopbar`, cliente, `lg:hidden`)**: `header sticky top-0 z-30 flex h-14
items-center gap-3 border-b bg-background px-4`. Tiene un `Button variant="ghost" size="icon"
aria-label="Abrir menú"` con `Menu` y un `Wordmark`. Abre un **`Sheet side="left"`** (`w-72 p-0`,
`SheetTitle className="sr-only"` "Menú") con el mismo `SidebarContent` sin colapsar. El Sheet se
cierra al tocar un enlace (`onNavigate`) y con Escape (Radix). Cumple "Panel en pantalla chica" a
768 px, porque el corte es `lg`.

**Componentes shadcn**: Sheet, Tooltip, Separator, Button (icon/ghost), Toaster (Sonner),
AlertDialog (vía ConfirmProvider).

### 8.2 Layout del portal (`(portal)/layout.tsx`)

**Con sesión**: `<div className="theme-warm min-h-screen bg-background text-foreground">`, con
`getPortalPatient()` y `getProfessionalDisplayName()` en paralelo.

```
Celular (360 px)                      ≥ 768 px
┌──────────────────────────┐          ┌────────────────────────────────────────────┐
│ Wordmark+nombre   [Salir]│ h-14     │ Wordmark+nombre  Inicio Plan Evol Diario [Salir]
├──────────────────────────┤          ├────────────────────────────────────────────┤
│ main max-w-2xl px-4 pt-6 │          │ main max-w-2xl px-4 py-8                    │
│      pb-28               │          │                                             │
├──────────────────────────┤          └────────────────────────────────────────────┘
│ Inicio Plan Evol. Diario │ fixed bottom, min-h-14 c/u, pb-[env(safe-area-inset-bottom)]
└──────────────────────────┘
```

- Header: `sticky top-0 z-30 border-b bg-background`, contenedor `mx-auto flex h-14 max-w-2xl
  items-center justify-between gap-4 px-4`. `Wordmark subtitle={professionalName}` (D13: se ven
  "NutriBot" y el nombre de la nutricionista). `PortalNav variant="top"` con `hidden md:flex`.
  "Salir" = el mismo `<form action="/portal/logout" method="POST">` de hoy con un
  `Button variant="ghost" size="lg"` (44 px) e ícono `LogOut`.
- `PortalNav` (cliente, `shell/portal-nav.tsx`): `({ variant: "top" | "bottom", className? })`,
  `<nav aria-label="Portal">`. Ítems: Inicio `/portal` `House` · **Plan** `/portal/plan`
  `ClipboardList` (reordenamiento 8) · Evolución `/portal/evolucion` `TrendingUp` · Diario
  `/portal/diario` `NotebookPen`. Activo: `/portal` exacto y el resto con `startsWith`, más
  `aria-current="page"`.
  - `bottom`: `fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 border-t bg-background
    pb-[env(safe-area-inset-bottom)] md:hidden`. Cada tab es un `flex min-h-14 flex-col
    items-center justify-center gap-1 text-xs`. Activo: `font-medium text-foreground` + barra
    superior de 2 px `bg-foreground`. Inactivo: `text-muted-foreground`.
  - `top`: enlaces `inline-flex h-11 items-center rounded-md px-3 text-sm`. Activo `bg-accent
    font-medium text-foreground`.
  - `next/link` en vez de `<a>`: misma URL y misma cookie, sin recarga completa.
- `<Toaster position="top-center" />`, para que no tape la barra de abajo.

**Sin acceso** (`!patient`): `<div className="theme-warm flex min-h-screen items-center
justify-center bg-background px-4">` con una tarjeta `w-full max-w-sm rounded-lg border bg-card
p-8 text-center`, `Wordmark` centrado, `h1 text-xl font-semibold` "Portal del paciente" y el
**mismo texto de hoy, literal**: "Para entrar necesitás un link de acceso. Escribile a tu
nutricionista por WhatsApp **"portal"** o elegí la opción del menú y te lo mandamos." (el
`<strong>` pasa a `font-semibold text-foreground`).

**Componentes shadcn**: Button (ghost, lg), Toaster. Las pantallas internas del portal las
migra la 002d.

### 8.3 Login y `/inicio` (D10)

Las dos rutas renderizan `<LoginScreen />`. Cada página **conserva** su lógica de hoy:
`const session = await auth(); if (session?.user) redirect("/");`, y `/inicio` mantiene
`export const dynamic = "force-dynamic"`. `/inicio` sigue siendo la página de `signIn` de
Auth.js (`auth.config.ts`, sin tocar) y el destino del `signOut`.

```
                 bg-muted, min-h-screen, centrado
              ┌───────────────────────────────┐
              │  ◆ NutriBot                   │  Wordmark, mb-8, centrado
              │ ┌───────────────────────────┐ │
              │ │ Ingresá al panel          │ │  h1 text-xl font-semibold
              │ │ Usá tu cuenta de Google   │ │  text-sm text-muted-foreground
              │ │ autorizada para continuar.│ │
              │ │ [G  Entrar con Google   ] │ │  Button variant="secondary" size="lg" w-full
              │ └───────────────────────────┘ │  rounded-lg border bg-card p-8
              │  Si no podés entrar, pedí que │  text-xs text-muted-foreground, centrado
              │  sumen tu correo a la lista   │
              │  de acceso.                   │
              └───────────────────────────────┘  w-full max-w-sm
```

- El `form` con `action={async () => { "use server"; await signIn("google", { redirectTo: "/" }); }}`
  es textual al de hoy. No se muestra el nombre de la profesional, porque es una página pública y
  no conviene que dependa de la base.
- Desaparecen el hero, "Cómo funciona", las 6 features, los íconos inline, `SpringShapes`,
  `CornerTriangle`, `Eyebrow` y `reveal`.

### 8.4 Estados: `loading`, `error`, `not-found`

| Archivo | Tipo | Contenido |
|---|---|---|
| `app/(panel)/loading.tsx` | server | `<PageSkeleton />`. Aparece dentro del shell (el layout persiste), para todas las rutas del panel. Los esqueletos con la forma de cada pantalla los agrega cada HU de migración como `loading.tsx` por ruta |
| `app/(portal)/portal/loading.tsx` | server | `<PageSkeleton />` |
| `app/(panel)/error.tsx` | **cliente** | `({ error, reset }: { error: Error & { digest?: string }; reset: () => void })` → `StatusScreen icon={CircleAlert} title="Algo salió mal" description="No pudimos mostrar esta pantalla. Probá de nuevo y, si sigue fallando, recargá la página." actions={<><Button onClick={reset}>Reintentar</Button><ButtonLink href="/" variant="secondary">Volver al calendario</ButtonLink></>} detail={error.digest ? \`Código: ${error.digest}\` : undefined}` |
| `app/(portal)/portal/error.tsx` | **cliente** | Igual, pero con `ButtonLink href="/portal"` "Volver al inicio" y `size="lg"` en los dos botones |
| `app/(panel)/not-found.tsx` | server | Lo usan los `notFound()` de las 4 páginas de detalle, dentro del shell: `StatusScreen icon={SearchX} title="No encontramos esta página" description="Puede que el enlace esté mal o que lo que buscabas ya no exista." actions={<ButtonLink href="/">Volver al calendario</ButtonLink>}` |
| `app/not-found.tsx` | **cliente** (usa `usePathname`) | URLs inexistentes (sin shell). `<main className="flex min-h-screen items-center justify-center px-6">` + el mismo `StatusScreen`. Si `pathname.startsWith("/portal")`: `ButtonLink href="/portal"` "Volver al inicio"; si no, `href="/"` "Volver al calendario" |
| `app/global-error.tsx` | **cliente** | Errores del layout raíz o de los layouts de grupo (que `error.tsx` no atrapa): `<html lang="es"><body>` + `import "./globals.css"` + el `StatusScreen` de error con "Reintentar" |

Sin `console.log` ni `console.error` en estos archivos (CHECKPOINTS C3).

### 8.5 Componentes base (catálogo para 002b, 002c, 002d y Ronda 2)

| Necesidad de la HU | Componente | Dónde |
|---|---|---|
| Acciones | `Button` / `ButtonLink` (primary, secondary, danger, ghost, link; sm, md, lg, icon; loading) | `ui.tsx` |
| Formularios | `Field` (label, hint, error), `Input`, `Select` nativo, `Textarea`, `FormError` | `ui.tsx` |
| Checkbox, Switch, Radio / segmented | `Checkbox`, `Switch`, `RadioGroup`, `ToggleGroup` | `primitives/*` |
| Número con unidad | `NumberInput` | `number-input.tsx` |
| Número mostrado | `Quantity` | `ui.tsx` |
| Card / Section | `Card` (title, description, actions, padding) | `ui.tsx` |
| Encabezado de pantalla | `PageHeader` (back) | `ui.tsx` |
| Tabs | `Tabs*` (subrayado, ver 1.5) | `primitives/tabs` |
| Tabla de datos | `DataTable` (cliente) / `Table*` con `numeric` y encabezado fijo (server-safe) | `data-table.tsx` / `primitives/table` |
| Badge de estado | `Badge` | `ui.tsx` |
| Stat / KPI | `StatTile` | `ui.tsx` |
| Alert / Callout | `Alert` | `ui.tsx` |
| Dialog | `Dialog*` / `Modal` (compat) | `primitives/dialog` / `modal.tsx` |
| Confirmación destructiva | `useConfirm` + `ConfirmProvider` | `confirm.tsx` |
| Panel lateral | `Sheet*` | `primitives/sheet` |
| Toast | `notify`, `useActionToast` + `Toaster` montado en los layouts | `lib/notify.ts` |
| Estado vacío | `EmptyState` | `ui.tsx` |
| Carga | `PageSkeleton`, `TableSkeleton`, `CardSkeleton`, `Skeleton` | `skeletons.tsx` / `primitives/skeleton` |
| Barra de adecuación | `AdequacyBar` | `ui.tsx` |
| Menú y tooltip | `DropdownMenu*`, `Tooltip*` | `primitives/*` |
| Tema de gráficos | `chartSeriesColors`, `chartSx`, `chartMargin` | `lib/chart-theme.ts` |

---

## 9. Radio de impacto (lista exacta)

**Modificados**

- `apps/web/package.json` (dependencias de 4.7)
- `package-lock.json` (raíz, lo actualiza `npm install`)
- `apps/web/tailwind.config.ts`
- `apps/web/src/app/globals.css`
- `apps/web/src/app/layout.tsx`
- `apps/web/src/app/(panel)/layout.tsx`
- `apps/web/src/app/(portal)/layout.tsx`
- `apps/web/src/app/login/page.tsx`
- `apps/web/src/app/inicio/page.tsx`
- `apps/web/src/components/ui.tsx`
- `apps/web/src/components/brand.tsx`
- `apps/web/src/components/modal.tsx`
- `apps/web/src/components/evolution-chart.tsx`
- `apps/web/src/components/comparative-chart.tsx`

**Borrados**

- `apps/web/src/components/nav.tsx`
- `apps/web/src/components/nav-links.tsx`

**Creados**

- `apps/web/components.json`
- `apps/web/src/lib/utils.ts`, `notify.ts`, `shell.ts`, `chart-theme.ts`
- `apps/web/src/components/primitives/` → `button.tsx`, `dialog.tsx`, `alert-dialog.tsx`,
  `sheet.tsx`, `tabs.tsx`, `table.tsx`, `tooltip.tsx`, `dropdown-menu.tsx`, `skeleton.tsx`,
  `label.tsx`, `switch.tsx`, `checkbox.tsx`, `radio-group.tsx`, `toggle.tsx`, `toggle-group.tsx`,
  `separator.tsx`, `sonner.tsx`
- `apps/web/src/components/number-input.tsx`, `data-table.tsx`, `confirm.tsx`, `skeletons.tsx`,
  `status-screen.tsx`, `login-screen.tsx`
- `apps/web/src/components/shell/nav-config.ts` (grupos, ítem Ajustes y
  `export const SIDEBAR_COOKIE = "nb-sidebar"`), `sidebar-content.tsx`, `app-sidebar.tsx`,
  `mobile-topbar.tsx`, `sign-out-button.tsx`, `portal-nav.tsx`
- `apps/web/src/app/(panel)/loading.tsx`, `error.tsx`, `not-found.tsx`
- `apps/web/src/app/(portal)/portal/loading.tsx`, `error.tsx`
- `apps/web/src/app/not-found.tsx`, `apps/web/src/app/global-error.tsx`
- `progress/impl_HU-002a.md`

**No se tocan** (cambian de aspecto solo a través de `ui.tsx`, `modal.tsx` y los alias): las 22
`page.tsx` restantes y todos sus componentes de sección, formularios y listas, `meals-editor.tsx`,
`auto-refresh.tsx`, `lib/plan-pdf.tsx`, `auth*.ts`, `middleware.ts`, `api/**`, todas las
`actions.ts`.

**Rutas / server actions / API**: no se crean ni cambian rutas de API ni server actions. Se agregan
los límites de estado de 8.4. Los actions inline de `signOut` y `signIn` se **mueven** textuales
(`nav.tsx` → `shell/sign-out-button.tsx`; `login/page.tsx` e `inicio/page.tsx` →
`login-screen.tsx`).

**Mensajes del bot**: no aplica. No cambia ningún mensaje.

---

## 10. Qué pueden asumir 002b, 002c y 002d (y qué les queda)

**Pueden asumir:**

1. Tokens, paleta, tipografía y escala de la sección 7. Las clases nuevas son `bg-background`,
   `text-foreground`, `text-muted-foreground`, `border`/`border-input`, `bg-muted`, `bg-accent`,
   `text-destructive`, `bg-success-muted`, etc. El portal ya es cálido por `theme-warm`.
2. Todos los componentes de 6.2 y 8.5, con esas firmas.
3. El shell completo: sidebar, menú mobile, estado del bot, "Cerrar sesión", `ConfirmProvider`,
   `TooltipProvider` y `Toaster` ya montados en el panel. En el portal: la navegación con Plan, el
   `Toaster` arriba y la pantalla sin acceso.
4. `loading`, `error` y `not-found` genéricos funcionando.
5. FullCalendar ya re-tematizado (002c solo toca `calendar-client.tsx` y los modales).
6. `components.json` válido para `npx shadcn@2.3.0 add <x>`, que deja los archivos en
   `@/components/primitives`. Revisar el diff: si el CLI toca `tailwind.config.ts` o
   `globals.css`, o instala `next-themes`, revertirlo.

**Les queda, por HU:**

- **Regla de cada migración**: un archivo migrado queda con **cero** tokens viejos. Sale del grep de
  11.8.1 sobre ese archivo, sin `uppercase`, `tracking-[…]`, `border-2` ni `font-bold` en títulos,
  y con feedback de guardado vía `useActionToast` + `FormError`, sin "✓ Guardado" inline.
- **002b (pacientes)**: `delete-plan-button.tsx` → `useConfirm`. Ficha con `Tabs` y encabezado
  persistente. Evolución en **barras** y decisión de librería (ver observación O1). PDF del plan
  con la tipografía y el estilo nuevos (D12). Ojo: `EvolutionChart` también lo usa
  `portal/evolucion`: si cambia de librería, el portal cambia con ella.
- **002c (agenda y gestión)**: `broadcast-form.tsx` → `useConfirm`. Detalle de turno en `Sheet`.
  Los 6 usos de `Modal` pueden quedarse con el compat o pasar a `Dialog`. `loading.tsx` con la
  forma del calendario.
- **002d (nutrición y portal, la última)**: `delete-template-button.tsx` → `useConfirm`. Páginas
  del portal con `size="lg"` en controles táctiles. **Borrar los alias LEGACY**: el bloque de
  `tailwind.config.ts` (`ink`, `leaf`, `mint`, `paper`, `line`, `brand`, `display`,
  `rounded-card`, `shadow-card`, `shadow-lift`), el bloque LEGACY de `globals.css` (`.press`,
  `.reveal`) y los tonos viejos de `Badge` (`slate`, `green`, `red`, `amber`, `blue`). Correr el
  grep global de 11.8.1 sobre `apps/web/src` → 0. Si ya no queda ningún consumidor de MUI,
  desinstalar `@mui/*` y `@emotion/*`.
- La memoria `design-system.md` la actualiza el orquestador al cerrar esta HU (describe el sistema
  viejo).

---

## 11. Checklist de ejecución (atómico y en orden; después de cada fase el panel compila y funciona)

Solo `apps/web` (no hay pasos en `packages/db` ni en `packages/core`).

### Fase 0: preflight

- [ ] 0.1 `git -C /Users/joelmiguelserrudo/Documents/Projects/Nutri-Bot branch --show-current` →
      `hu-002-rediseno-ui-empresarial`. Anotar el `git status --porcelain` inicial en `impl`,
      para no tocar esos archivos ajenos.
- [ ] 0.2 `pgrep -fl "next dev"`: anotar si hay un dev server (define si después se puede correr
      `next build`).
- [ ] 0.3 `npm run typecheck --workspace apps/web` en verde antes de empezar (línea base).

### Fase 1: dependencias y primitivos (sin consumidores todavía)

- [ ] 1.1 Desde la raíz:
      `npm install --workspace apps/web @radix-ui/react-alert-dialog@^1.1.23 @radix-ui/react-checkbox@^1.3.11 @radix-ui/react-dialog@^1.1.23 @radix-ui/react-dropdown-menu@^2.1.24 @radix-ui/react-label@^2.1.15 @radix-ui/react-radio-group@^1.4.7 @radix-ui/react-separator@^1.1.15 @radix-ui/react-slot@^1.3.3 @radix-ui/react-switch@^1.3.7 @radix-ui/react-tabs@^1.1.21 @radix-ui/react-toggle@^1.1.18 @radix-ui/react-toggle-group@^1.1.19 @radix-ui/react-tooltip@^1.2.16 class-variance-authority@^0.7.1 clsx@^2.1.1 lucide-react@^1.47.0 sonner@^2.0.8 tailwind-merge@^2.6.1 tailwindcss-animate@^1.0.7`.
      Si npm protesta por peer deps, **no** usar `--force`: parar y anotarlo.
- [ ] 1.2 Crear `apps/web/src/lib/utils.ts` con `cn` (6.2).
- [ ] 1.3 Crear `apps/web/components.json`:
      ```json
      {
        "$schema": "https://ui.shadcn.com/schema.json",
        "style": "new-york",
        "rsc": true,
        "tsx": true,
        "tailwind": { "config": "tailwind.config.ts", "css": "src/app/globals.css", "baseColor": "stone", "cssVariables": true, "prefix": "" },
        "aliases": { "components": "@/components", "utils": "@/lib/utils", "ui": "@/components/primitives", "lib": "@/lib", "hooks": "@/hooks" },
        "iconLibrary": "lucide"
      }
      ```
- [ ] 1.4 Descargar los 17 primitivos del registry v3 (sin CLI), desde `apps/web`:
      ```bash
      mkdir -p src/components/primitives
      for c in button dialog alert-dialog sheet tabs table tooltip dropdown-menu skeleton label switch checkbox radio-group toggle toggle-group separator sonner; do
        curl -fsS "https://ui.shadcn.com/r/styles/new-york/$c.json" \
        | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const j=JSON.parse(s);if(j.files.length!==1)throw new Error("más de un archivo");process.stdout.write(j.files[0].content.replaceAll("@/components/ui/","@/components/primitives/"))})' \
        > "src/components/primitives/$c.tsx"
      done
      ```
      Comprobar que no quedó ningún `@/components/ui/` ni `next-themes`
      (`grep -rn "components/ui/\|next-themes" src/components/primitives`: solo `sonner.tsx` debe
      mencionar `next-themes`, y se corrige en 1.5).
- [ ] 1.5 Adaptar los primitivos (sin cambiar sus exports):
  - [ ] `sonner.tsx`: quitar `useTheme`/`next-themes`, `theme="light"`. `classNames`: toast
        `bg-background text-foreground border-border shadow-lg`, description
        `text-muted-foreground`, actionButton `bg-primary text-primary-foreground`, cancelButton
        `bg-muted text-muted-foreground`.
  - [ ] `button.tsx`: quitar `shadow` y `shadow-sm` de las variantes. Foco
        `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring
        focus-visible:ring-offset-2 focus-visible:ring-offset-background`. Tamaños `sm: "h-8
        rounded-md px-3 text-sm"`, `default: "h-9 px-4 py-2"`, `lg: "h-11 rounded-md px-5"`,
        `icon: "h-9 w-9"`.
  - [ ] `dialog.tsx` y `sheet.tsx`: texto `sr-only` "Close" → "Cerrar". Overlay `bg-black/80` →
        `bg-foreground/40`. `DialogContent`: sumar `max-h-[90vh] overflow-y-auto`, dejar su
        `shadow-lg` (es un elemento flotante) y `rounded-lg`.
  - [ ] `alert-dialog.tsx`: overlay igual que dialog. Verificar que importa `buttonVariants` de
        `@/components/primitives/button`.
  - [ ] `tabs.tsx` (estilo subrayado): `TabsList` → `inline-flex h-10 w-full items-center
        justify-start gap-6 border-b border-border`. `TabsTrigger` → `-mb-px inline-flex
        items-center border-b-2 border-transparent px-1 pb-2.5 pt-2 text-sm font-medium
        text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none
        focus-visible:ring-2 focus-visible:ring-ring data-[state=active]:border-foreground
        data-[state=active]:text-foreground`. `TabsContent` → `mt-6 focus-visible:outline-none`.
  - [ ] `table.tsx`: `Table` acepta `containerClassName?: string` (en el div `relative w-full
        overflow-auto`). `TableHeader` → `sticky top-0 z-10 bg-background [&_tr]:border-b`.
        `TableHead` (`h-10 px-3 text-xs font-medium text-muted-foreground`) y `TableCell`
        (`px-3 py-2.5`) aceptan `numeric?: boolean` → `text-right tabular-nums`. Sin
        mayúsculas.
  - [ ] `checkbox.tsx`, `switch.tsx`, `radio-group.tsx`, `toggle.tsx`: quitar `shadow`/`shadow-sm`.
        Checkbox y radio con `border-input`. Foco `ring-2 ring-ring`.
  - [ ] Ningún primitivo con hex, `uppercase` ni `tracking-[…]`.
- [ ] 1.6 `npm run typecheck --workspace apps/web` → verde (los primitivos todavía no se usan).

### Fase 2: tokens (el panel sigue funcionando por los alias)

- [ ] 2.1 Reescribir `tailwind.config.ts` según 7.2.
- [ ] 2.2 Reescribir `globals.css` según 7.3 (tokens, `theme-warm`, base, reduced-motion, LEGACY
      mínimo, FullCalendar).
- [ ] 2.3 `layout.tsx` raíz: solo Inter (7.4).
- [ ] 2.4 `npm run typecheck --workspace apps/web` → verde. Con `npm run dev`, abrir `/`,
      `/pacientes` y `/ajustes`: renderizan, sin errores de consola y con la paleta nueva en las
      clases viejas.

### Fase 3: componentes base (API conservada + nuevos)

- [ ] 3.1 Reescribir `components/ui.tsx` según 6.2 (todas las firmas existentes intactas).
- [ ] 3.2 Reescribir `components/modal.tsx` sobre `Dialog` (misma API).
- [ ] 3.3 Crear `number-input.tsx`, `data-table.tsx`, `confirm.tsx`, `skeletons.tsx`,
      `status-screen.tsx` y `lib/notify.ts`.
- [ ] 3.4 Crear `lib/chart-theme.ts` y aplicarlo en `evolution-chart.tsx` y
      `comparative-chart.tsx` (misma API).
- [ ] 3.5 `npm run typecheck --workspace apps/web` → verde. Abrir `/servicios` y abrir/cerrar el
      modal de nuevo servicio (Escape, clic afuera, foco atrapado con Tab). **Sin guardar.**

### Fase 4: shell del panel

- [ ] 4.1 Reescribir `Wordmark` y `LeafMark` en `components/brand.tsx` (6.2). `SpringShapes`,
      `CornerTriangle` y `Eyebrow` **se dejan tal cual por ahora**: todavía los importan `login` e
      `inicio`. Se borran en 6.3, así el typecheck no se rompe en el medio.
- [ ] 4.2 Crear `lib/shell.ts` (6.2).
- [ ] 4.3 Crear `shell/nav-config.ts`, `sidebar-content.tsx`, `app-sidebar.tsx`,
      `mobile-topbar.tsx` y `sign-out-button.tsx` (8.1).
- [ ] 4.4 Reescribir `(panel)/layout.tsx` (8.1), manteniendo `auth()` + `redirect("/inicio")`
      exactamente igual.
- [ ] 4.5 Borrar `components/nav.tsx` y `components/nav-links.tsx`.
      `grep -rn "components/nav" apps/web/src` → 0.
- [ ] 4.6 typecheck verde. En el navegador: la sidebar a 1366 px, colapsar/expandir y recargar
      (el estado persiste), el menú a 768 px, el estado del bot visible.

### Fase 5: layout del portal

- [ ] 5.1 Crear `shell/portal-nav.tsx`.
- [ ] 5.2 Reescribir `(portal)/layout.tsx` (8.2), con el texto de "sin acceso" literal.
- [ ] 5.3 typecheck verde.

### Fase 6: login e `/inicio`

- [ ] 6.1 Crear `components/login-screen.tsx` (8.3), con el action de `signIn` textual.
- [ ] 6.2 Reescribir `login/page.tsx` e `inicio/page.tsx` para que solo hagan la redirección de
      sesión + `<LoginScreen />` (`/inicio` conserva `dynamic = "force-dynamic"`).
- [ ] 6.3 Ahora sí, borrar `SpringShapes`, `CornerTriangle` y `Eyebrow` de `brand.tsx`.
      `grep -rnE "SpringShapes|CornerTriangle|Eyebrow" apps/web/src` → 0.
- [ ] 6.4 typecheck verde.

### Fase 7: estados

- [ ] 7.1 Crear `(panel)/loading.tsx`, `(panel)/error.tsx`, `(panel)/not-found.tsx`,
      `(portal)/portal/loading.tsx`, `(portal)/portal/error.tsx`, `app/not-found.tsx` y
      `app/global-error.tsx` (8.4).
- [ ] 7.2 typecheck verde.

### Fase 8: verificación (ver sección 12) y cierre

- [ ] 8.1 Correr todo lo de la sección 12 y anotar los resultados en `progress/impl_HU-002a.md`,
      con lo que no se pudo verificar y por qué.
- [ ] 8.2 Confirmar que las rutas temporales de prueba ya no existen.
- [ ] 8.3 No commitear. Devolver `done -> progress/impl_HU-002a.md`.

---

## 12. Verificación (comandos exactos antes de declararse `done`)

Todo desde `/Users/joelmiguelserrudo/Documents/Projects/Nutri-Bot` salvo que se indique.

### 12.1 Compilación y arnés

```bash
npm run typecheck --workspace apps/web     # obligatorio, verde
npm run typecheck                          # todos los workspaces (bot y packages no cambian: deben seguir verdes)
npm run test                               # vitest de packages/core: sin cambios, debe seguir verde
./ops/harness/verify.sh                    # exit 0
```

`next build` **solo** si `pgrep -fl "next dev"` no devuelve nada:
`npm run build --workspace apps/web`. Detecta errores de límite servidor/cliente que `tsc` no ve,
como pasar funciones a un componente cliente. Si hay un dev server, **no** correrlo y anotarlo.

### 12.2 Alcance del diff

```bash
git status --porcelain
git diff --stat -- packages apps/bot                           # vacío
git diff --name-only -- 'apps/web/src/**/actions.ts' 'apps/web/src/**/*-actions.ts' apps/web/src/app/api apps/web/src/lib/plan-pdf.tsx apps/web/src/auth.ts apps/web/src/auth.config.ts apps/web/src/middleware.ts   # vacío
git status --porcelain | grep -E "prueba-(sistema|error)"      # vacío (rutas temporales borradas)
```

Los únicos cambios fuera de `apps/web/` son `package-lock.json`, `progress/impl_HU-002a.md` y los
archivos ajenos que ya estaban en 0.1.

### 12.3 Lo que tiene que desaparecer del sistema viejo

Desde `apps/web`:

```bash
FILES=(
  "src/app/layout.tsx" "src/app/globals.css" "src/app/(panel)/layout.tsx" "src/app/(panel)/loading.tsx"
  "src/app/(panel)/error.tsx" "src/app/(panel)/not-found.tsx" "src/app/(portal)/layout.tsx"
  "src/app/(portal)/portal/loading.tsx" "src/app/(portal)/portal/error.tsx" "src/app/not-found.tsx"
  "src/app/global-error.tsx" "src/app/login/page.tsx" "src/app/inicio/page.tsx"
  src/components/ui.tsx src/components/brand.tsx src/components/modal.tsx src/components/number-input.tsx
  src/components/data-table.tsx src/components/confirm.tsx src/components/skeletons.tsx
  src/components/status-screen.tsx src/components/login-screen.tsx src/components/evolution-chart.tsx
  src/components/comparative-chart.tsx src/components/shell/*.ts* src/components/primitives/*.tsx
  src/lib/utils.ts src/lib/notify.ts src/lib/shell.ts src/lib/chart-theme.ts
)
# (1) Tokens, clases y componentes del sistema viejo en los archivos de la HU → 0 líneas
grep -nE "(bg|text|border|ring|fill|stroke|divide|accent|outline|from|to|placeholder|decoration)-(ink|leaf|mint|paper|line|brand)\b|font-display|--font-display|btn-(solid|outline|leaf)|SpringShapes|CornerTriangle|Eyebrow|Space_Grotesk|Space Grotesk|rounded-card|shadow-card|shadow-lift|float-slow|uppercase|tracking-\[|border-2" "${FILES[@]}"
#     Excepción esperada: el bloque LEGACY de globals.css solo puede contener .press y .reveal
#     (no matchean este patrón).
# (2) Hex sueltos en los archivos de la HU → solo brand.tsx (GoogleG) y chart-theme.ts
grep -nE "#[0-9a-fA-F]{3,8}\b" "${FILES[@]}" | grep -vE "src/components/brand.tsx|src/lib/chart-theme.ts"
# (3) Global en todo apps/web/src → 0
grep -rnE "SpringShapes|CornerTriangle|Eyebrow|Space_Grotesk|btn-(solid|outline|leaf)|float-slow|components/nav" src
# (4) Archivos borrados
test ! -e src/components/nav.tsx && test ! -e src/components/nav-links.tsx && echo OK
# (5) tailwind-merge v2 (no v3)
node -p "require('tailwind-merge/package.json').version"     # 2.x
# (6) Los alias LEGACY de tailwind.config.ts están todos bajo el comentario LEGACY (revisión visual)
grep -n "LEGACY" tailwind.config.ts
# (7) Los confirm() nativos siguen siendo exactamente los 3 de 002b/c/d (esta HU no los migra)
grep -rn "confirm(" src | grep -v "useConfirm\|components/confirm.tsx"
```

### 12.4 Recorrido visual (con `npm run dev` y la DB de desarrollo levantada, **solo lectura**)

Con la herramienta de navegador disponible. Si no hay ninguna, anotar en `impl` qué quedó sin ver
para que lo pruebe el usuario.

En cada ruta, en la consola: `document.documentElement.scrollWidth <= window.innerWidth` →
`true` (sin scroll horizontal fuera de las tablas). Anotar ruta, ancho y resultado.

- **Panel a 1366×768 y a 768×1024**: `/`, `/disponibilidad`, `/servicios`, `/pacientes`,
  `/pacientes/<id existente>`, `/pacientes/<id>/planes/<planId existente>`, `/alimentos`,
  `/alimentos/nuevo`, `/alimentos/<id>`, `/plantillas`, `/plantillas/<id>`, `/pagos`, `/avisos`,
  `/asistente`, `/ajustes`, `/ajustes/whatsapp`. Los ids salen de un `SELECT` de solo lectura
  (`docker compose exec db psql … -c 'select id from "Patient" limit 1;'`, etc.). Por pantalla:
  renderiza, sin errores de consola, coherente con la paleta nueva (aunque tenga restos de
  mayúsculas o bordes gruesos propios) y con la sidebar o el menú correctos.
- **404**: `/no-existe` (raíz, "Volver al calendario"), `/pacientes/id-que-no-existe`
  (`(panel)/not-found` dentro del shell) y `/portal/no-existe` ("Volver al inicio").
- **Error**: crear **temporalmente** `src/app/(panel)/prueba-error/page.tsx` con
  `export default function P() { throw new Error("prueba"); }`, visitar `/prueba-error`, ver la
  pantalla, probar "Reintentar" y **borrar el archivo**. No usar `_` al inicio: las carpetas con
  `_` no son rutas.
- **Componentes sin consumidores**: crear **temporalmente**
  `src/app/(panel)/prueba-sistema/page.tsx` con un cliente que muestre `Button` (todas las
  variantes, `loading`), `Badge` (todos los tonos), `Alert` (4 tonos), `EmptyState`, `Quantity`,
  `NumberInput`, `AdequacyBar` (low/ok/high), `Tabs`, `DataTable` con 30 filas ficticias en
  memoria (orden, encabezado fijo con `maxHeightClassName`, números a la derecha, vacío),
  `useConfirm` (destructivo), `notify.saved()`/`notify.error()`, `Sheet`, `DropdownMenu`,
  `Tooltip`, `Switch`, `Checkbox`, `ToggleGroup` y los tres skeletons. Verificarlo a 1366 y a 768,
  y **borrarlo**. Datos solo en memoria: nada contra la base.
- **Portal a 360×780 y a 1366×768**. Para entrar sin escribir en la base (el token es un HMAC sin
  estado):
  ```bash
  cd apps/web
  PATIENT_ID=<id de un SELECT> npx tsx --env-file=../../.env -e 'import("@nutri-bot/db/domain").then(m=>console.log(m.createPatientToken(process.env.PATIENT_ID, 60)))'
  ```
  Abrir `http://localhost:3000/portal/login?token=<token>` y recorrer `/portal`, `/portal/plan`,
  `/portal/evolucion` y `/portal/diario`. **No** enviar el formulario del diario. Chequear: barra
  inferior con 4 tabs de ≥ 44 px de alto (medir con DevTools), Plan en la navegación, tono cálido
  y tabs arriba a 1366. "Sin acceso": ventana privada o después de "Salir" del portal → `/portal`.
- **Login**: en ventana privada, `/login` e `/inicio` a 1366 y a 360. **No** completar el login de
  Google. **No** tocar "Cerrar sesión" en la sesión principal (no se puede volver a entrar sin la
  cuenta de la usuaria). El action se verifica por diff: tiene que ser idéntico al de `nav.tsx`.

### 12.5 Teclado, movimiento y contraste

- Recorrer la sidebar solo con Tab: foco visible en cada ítem, "Saltar al contenido" aparece con
  el primer Tab, y el botón de colapsar funciona con Enter.
- A 768 px: "Abrir menú" con Enter, Tab queda atrapado en el Sheet, Escape cierra y el foco vuelve
  al botón.
- `Modal` (nuevo servicio en `/servicios`, nuevo turno en `/`): foco atrapado, Escape cierra.
  **Sin guardar.**
- DevTools → Rendering → `prefers-reduced-motion: reduce`: abrir el Sheet y el modal, y comprobar
  que aparecen sin animación.
- Contraste (DevTools, inspector de color) en: texto secundario de la sidebar, hint de un `Field`,
  `text-ink-faint` de alguna pantalla sin migrar (ahora `muted-foreground`, ≥ 4,5) y borde de un
  `Input` (≥ 3).

### 12.6 Flujos que tienen que seguir igual (sin escribir en la base)

Abrir y cerrar, sin enviar: "Nuevo turno" y el detalle de un turno en `/`; el formulario de un
servicio; el formulario de un paciente; `/avisos` (no enviar difusión ni reintentar). El resto de
los flujos del Scenario Outline no cambian de código en esta HU (sus archivos no se tocan): se
validan en la HU que migra cada pantalla.

---

## 13. Tests (vitest)

No hay lógica nueva de dominio. La regla de adecuación (qué es "bajo", "en rango" o "alto") **no**
se implementa acá: `AdequacyBar` recibe `status` ya calculado, y esa regla va a `packages/core`
con sus tests en la Épica 23. Esta HU no agrega tests. `npm run test` tiene que seguir en verde.

---

## 14. Observaciones (no bloquean)

- **O1 (para la 002b), librería de gráficos de barras (D14 bis).** Hay dos candidatas:
  - **MUI X Charts `BarChart`**, que ya está instalado (9.13.0). No suma dependencias y se
    tematiza con `chartSx`. El costo: mantiene `@mui/material` + Emotion solo por los gráficos.
  - **Recharts 3.x** (3.10.1, peer `react ^19`), que es la base del patrón "Chart" de shadcn. Da
    barras muy cuidadas con tooltip y leyenda del sistema, y permitiría sacar `@mui/*` +
    `@emotion/*` del bundle cuando el último consumidor (`portal/evolucion`, 002d) migre. Ojo: el
    `chart.tsx` del registry v3 está escrito para Recharts 2, así que hay que adaptarlo a los
    tipos de la v3.

  Recomendación: que la 002b haga una prueba corta con los dos sobre los datos reales de una
  paciente a 1366 px. Si no hay una diferencia clara, quedarse con MUI (menos cambio).
- **O2 (fuera de alcance, no verificado).** `middleware.ts` aplica `authorized` (email de Google
  permitido) a todo lo que no sea `api/auth`, `login` o `inicio`, **incluido `/portal`**. Si es
  así, un paciente sin sesión de Google sería redirigido a `/inicio`. En desarrollo no se nota,
  porque el implementer está logueado. Conviene que el orquestador lo confirme aparte. Esta HU no
  lo toca.
- **O3.** El estado del bot en la sidebar se actualiza al recargar, no en vivo (los layouts no se
  vuelven a renderizar en la navegación cliente). Si hace falta en vivo, sería otra HU (polling o
  `router.refresh()`).
- **O4.** `/inicio` recibe `?error=AccessDenied` de Auth.js cuando el email no está autorizado, y
  hoy no se muestra nada. Mostrar un aviso sería funcionalidad nueva: queda fuera.

## 15. Dudas técnicas abiertas

Ninguna bloqueante. Decisiones tomadas en esta SDD, que el orquestador puede revisar con el
usuario si quiere:

- Sidebar colapsable a íconos, persistida en la cookie `nb-sidebar`.
- Corte mobile del panel en `lg` (1024 px), para cumplir el "≤ 768 px" del Gherkin con margen.
- Tono cálido aplicado con `:root:has(.theme-warm)`.
- Primitivos en `components/primitives/`.
- Sin página de muestra permanente (D18): la de prueba es temporal.
