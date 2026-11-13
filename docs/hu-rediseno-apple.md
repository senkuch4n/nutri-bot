# HU-017 — Rediseño visual estilo Apple: auditoría de todas las páginas y partición

**Como** profesional (nutricionista) que usa el panel todo el día, y como paciente que entra al
portal desde el celular,
**quiero** que el sistema se vea y se mueva con el lenguaje de las interfaces de Apple (respuesta
instantánea al tocar, movimiento continuo e interrumpible, materiales con profundidad, tipografía
cuidada y jerarquía clara),
**para que** usarlo se sienta directo y confiable, la información importante se vea primero y el
portal se sienta como una app nativa en el celular del paciente.

Origen: pedido del usuario (2026-10-03). Instaló el skill **apple-design**
(`.claude/skills/apple-design/SKILL.md`, commit `cf0e3c8`) y quiere "usarlo para ver cada página
del sistema y aplicar todo el diseño". Decisiones ya tomadas por el usuario:

- **Primero la auditoría**, después una o varias HU (como HU-002a–d).
- **Rediseño visual completo**: colores, tipografía, materiales, componentes y movimiento. No es
  solo una capa de animaciones. **Revisa** lo resuelto en HU-002 (estilo Notion neutro, ver
  `docs/hu-rediseno-ui-empresarial.md`, sección "Resoluciones").
- **Alcance**: todo el panel y el portal, **menos la zona de imleticio** (`alimentos/**`,
  `pacientes/[id]/planes/**`, `plantillas/**`, `components/food-picker.tsx`: PR #7 y HU-015).
  Esas pantallas se suman después. Los cambios de tokens, globales y componentes compartidos las
  afectan igual (ver Riesgos R1).

Este documento es la auditoría (secciones 2 a 4), la propuesta de lenguaje visual (5), la
partición en HU (6) y los criterios de aceptación (7). Cada HU de la partición va a tener su
propia SDD.

Referencia de principios: §N es la sección N del skill (§1 Response, §2 Direct manipulation,
§3 Interruptibility, §4 Springs, §5 Velocity handoff, §6 Momentum, §7 Spatial consistency, §8 Hint,
§9 Rubber-banding, §10 Gestures, §11 Frame smoothness, §12 Materials, §13 Multimodal, §14 Reduced
motion, §15 Typography, §16 los 8 principios: Purpose, Agency, Responsibility, Familiarity,
Flexibility, Simplicity, Craft, Delight).

---

## 1. Contexto

### 1.1 Qué existe hoy

**Sistema de diseño (HU-002a–d, mergeado en `e2da8d9`):** estilo Notion, empresarial y neutro.

| Pieza | Estado actual | Dónde |
|---|---|---|
| Tokens | Variables CSS en canales HSL (convención shadcn), consumidas por Tailwind 3.4. Grises cálidos estilo Notion (`--foreground: 45 8% 20%`, `--primary: 45 4% 18%`, casi negro). Acento neutro; el azul solo para link y foco. | `apps/web/src/app/globals.css:6-45`, `apps/web/tailwind.config.ts` |
| Tema del portal | `.theme-warm`: mismos tokens con tono cálido y `--radius: 0.75rem` (D11 de HU-002). | `globals.css:49-66` |
| Modo oscuro | `darkMode: ["class"]` preparado, **sin valores dark** definidos y sin activar (D4 de HU-002). | `tailwind.config.ts:9` |
| Tipografía | Inter (`next/font/google`, variable `--font-sans`), una sola familia. Inter 400/500/600 también en los PDF desde `public/fonts`. | `app/layout.tsx:5-9`, `lib/pdf-common.tsx:10-25` |
| Radios | `--radius: 0.5rem` (lg 8, md 6, sm 4). El "workspace" de escritorio usa 24 px fijo. | `globals.css:40`, `shell/sidebar-layout.css:25` |
| Sombras | Casi no hay: tarjetas planas con borde; `shadow-md/lg` solo en popovers, menús, sheets y diálogos (defaults de shadcn). | `components/primitives/*` |
| Componentes | shadcn/ui sobre Radix en `components/primitives/` (button, dialog, sheet, alert-dialog, tabs, toggle-group, switch, table, dropdown, popover, tooltip, sonner, chart, skeleton…) y componentes de aplicación server-safe en `components/ui.tsx` (Card, PageHeader, Button, Field, Input, Select, Badge, Alert, EmptyState, StatTile, AdequacyBar, Quantity). **No existe `components/ui/`**: el pedido lo menciona pero el código vive en `components/ui.tsx` + `components/primitives/`. | |
| Shell del panel | Sidebar de escritorio colapsable (≥1024 px) con grupos Agenda / Pacientes / Nutrición / Gestión / Herramientas, pie con Ajustes, estado del bot y cuenta. El contenido va en un "workspace" blanco redondeado (24 px) flotando sobre el gris de la sidebar. En < 1024 px, topbar con hamburguesa que abre un Sheet. | `components/shell/*` |
| Shell del portal | Header sticky opaco con la marca y "Salir"; pestañas arriba (≥768 px) o barra de pestañas abajo (celular). | `app/(portal)/layout.tsx`, `shell/portal-nav.tsx` |
| Gráficos | Recharts vía `components/primitives/chart.tsx` (shadcn chart); colores fijos en `lib/chart-theme.ts`. | |
| PDF | `@react-pdf/renderer` con su propio tema (`lib/pdf-theme.ts`, hex fijos Notion: `#37352F`, `#E9E9E7`…). No usa Tailwind. | `lib/pdf-*.tsx`, `lib/plan-pdf.tsx` |
| Calendario | FullCalendar re-tematizado con CSS sobre los tokens. | `globals.css:101-157` |

**Marca:** el panel y el portal dicen **"Numa"** con un logo PNG verde translúcido
(`public/numa-logo.png`, `components/brand.tsx:19-24`). El cambio de "NutriBot" a "Numa" vino en un
commit de imleticio (`ae7edcb fix/bot-mp`, 2026-10-03). **Esta HU no lo cambia**; se anota en D9.
El logo ya tiene un look "glass" verde que encaja con el lenguaje Apple.

### 1.2 Inventario del movimiento actual

| Dónde | Qué hay | Cómo | Ref. |
|---|---|---|---|
| Librería de animación | **Ninguna.** No hay `motion`/`framer-motion`, `vaul` ni `embla`. Todo es CSS (`tailwindcss-animate`) más una animación WAAPI a mano. | `apps/web/package.json` | |
| Dialog / AlertDialog | Fade + zoom 95 % + slide desde `left-1/2 top-48%` (default shadcn), 200 ms. Overlay `bg-foreground/40` con fade. | keyframes | `primitives/dialog.tsx:24,41` |
| Sheet | Slide desde el borde, **500 ms al abrir y 300 ms al cerrar, `ease-in-out`**. Sin arrastre. | keyframes | `primitives/sheet.tsx:34` |
| Dropdown / Popover / Tooltip | Fade + zoom 95 % + slide 2, con `transform-origin` del disparador (Radix). | keyframes | `primitives/dropdown-menu.tsx:69`, `popover.tsx:24` |
| Sidebar colapsable | `clip-path` con transición 280 ms `cubic-bezier(0.22,1,0.36,1)` + FLIP con WAAPI que hace `scaleX` del workspace. Cancela y re-mide si se interrumpe. Respeta reduced-motion. | CSS + WAAPI | `shell/app-sidebar.tsx:40-62`, `sidebar-layout.css:44-128` |
| Tabs | Sin movimiento: el subrayado aparece de golpe en la pestaña nueva. | — | `primitives/tabs.tsx:33` |
| Toggle groups (filtros) | Solo cambio de fondo `data-[state=on]`, sin indicador que se deslice. | `transition-colors` | `primitives/toggle.tsx:10` |
| Switch | Thumb con `transition-transform` (150 ms ease por defecto). | CSS | `primitives/switch.tsx:22` |
| Botones / filas / links | Solo `transition-colors` en **hover**. **Ningún estado `:active`** en todo `apps/web` (grep sin resultados). | CSS | `primitives/button.tsx:8` |
| Toasts | Sonner (sus propias transiciones y swipe para descartar). | librería | `primitives/sonner.tsx` |
| Carga | `animate-pulse` en skeletons y en la barra de carga del calendario; `animate-spin` en spinners; punto "En vivo" de Avisos con `motion-safe:animate-pulse`. | keyframes | `primitives/skeleton.tsx:9`, `calendar-client.tsx:159`, `avisos-view.tsx:122` |
| Gráficos | Animación de entrada por defecto de Recharts (JS, no CSS). | Recharts | `components/evolution-chart.tsx:97` |
| Navegación entre páginas | Sin transición: `loading.tsx` con skeleton y reemplazo instantáneo. | — | |
| Reduced motion | Regla global que lleva **toda** `animation-duration`/`transition-duration` a 0,01 ms (incluidos fades de opacidad). Sidebar con su propio `@media`. No hay nada para `prefers-reduced-transparency` ni `prefers-contrast`. | CSS | `globals.css:91-99`, `sidebar-layout.css:154-165` |
| Táctil | `touch-action: manipulation` global en `a`, `button`, `[role=button]` (sin demora de doble tap). | CSS | `globals.css:82-87` |

### 1.3 Por qué hace falta

- El sistema actual es correcto y accesible, pero **estático**: no hay feedback al presionar, los
  sheets tardan medio segundo en abrir, las pestañas y filtros cambian de golpe, y nada en el
  portal se puede arrastrar. En el celular del paciente se siente como una web, no como una app.
- La jerarquía visual es plana: todo es una tarjeta blanca con borde de 1 px sobre blanco; no hay
  materiales ni elevación que separen chrome, contenido y capas.
- La tipografía usa un `tracking-tight` fijo para todos los títulos y ningún ajuste por tamaño.
- El usuario quiere un lenguaje visual nuevo (Apple) y el skill da criterios concretos para
  evaluarlo.

### 1.4 Qué es lo nuevo

1. Un **lenguaje visual Apple** para NutriBot: paleta con acento, escala tipográfica con tracking
   y leading por tamaño, radios concéntricos, elevación en niveles, materiales translúcidos para el
   chrome.
2. Un **sistema de movimiento**: respuesta al presionar, springs (con una librería o CSS),
   transiciones simétricas y ancladas al origen, gestos en el portal móvil, y reduced-motion /
   reduced-transparency / increased-contrast como variantes y no como "apagar todo".
3. La **migración de todas las pantallas** del alcance, en HU encadenadas.

---

## 2. Auditoría del shell

Severidad: **alta** = rompe un principio central del skill o la accesibilidad en uso diario;
**media** = se nota y afecta la percepción de calidad; **baja** = detalle de craft.

### 2.1 Sidebar de escritorio (`components/shell/app-sidebar.tsx`, `sidebar-content.tsx`, `sidebar-layout.css`)

Captura: todas las del panel (01–16).

| # | Hallazgo | Principio | Sev. | Ref. |
|---|---|---|---|---|
| S1 | Los ítems solo tienen hover (`hover:bg-accent`); al presionar no pasa nada hasta que carga la página nueva. En una navegación que tarda, el clic se siente "muerto". | §1 Response | alta | `nav-config.ts:70-71` |
| S2 | El ítem activo se marca con una barrita negra de 2 px a la izquierda + fondo gris. Funciona, pero cuando se cambia de sección la marca salta de un ítem al otro sin continuidad. Un indicador que se desliza entre ítems comunica "dónde estoy" y "de dónde vengo". | §7 Spatial consistency, §8 Hint | media | `sidebar-content.tsx:62-63` |
| S3 | La sidebar es un plano gris (`--sidebar: 60 11% 96%`) idéntico al fondo del layout; la jerarquía la da solo el workspace blanco. Está bien que sea un material "pesado" (estructural), pero hoy no hay ninguna diferencia de material entre sidebar, fondo y tarjetas: todo es plano. | §12 Materials (peso por jerarquía) | media | `globals.css:39`, `sidebar-layout.css:17` |
| S4 | Al colapsar, el FLIP hace `scaleX` del workspace completo: durante 280 ms el texto del contenido se estira/aplasta horizontalmente. Se nota en pantallas con tablas. | §11 Frame smoothness ("qué hay en los frames") | media | `app-sidebar.tsx:55-61` |
| S5 | El colapso es una curva fija de 280 ms. Se re-mide al interrumpir (bien: arranca del valor presente), pero sin conservar velocidad: un doble clic rápido produce un "frenazo". | §3 Interruptibility (blend de velocidad) | baja | `app-sidebar.tsx:45,55` |
| S6 | Títulos de grupo ("Agenda", "Pacientes"…) en `text-xs font-medium` gris sin tracking positivo; a 12 px Apple usa tracking levemente positivo. | §15 Typography | baja | `sidebar-content.tsx:121` |
| S7 | El contador de Mensajes es un pill negro (`bg-primary`). Con un acento de marca, el badge de "pendientes" es el lugar natural para el acento o el rojo de sistema (como los badges de iOS). | §16 Familiarity | baja | `sidebar-content.tsx:71` |
| S8 | El logo PNG trae mucho margen blanco interno: a 40×40 el glifo se ve chico y desalineado respecto de los íconos de 16 px de los ítems. | §16 Craft | baja | `brand.tsx:19` |
| S9 | Positivo: el workspace flotante redondeado sobre la sidebar ya es un patrón tipo macOS (ventana sobre fondo); el colapso a rail con tooltips respeta reduced-motion. Se conserva la estructura. | — | — | |

Nota: en las capturas aparece un círculo negro "N" abajo a la izquierda tapando el email. Es el
indicador de desarrollo de Next.js, no forma parte del panel; no es un hallazgo.

### 2.2 Topbar móvil del panel (`components/shell/mobile-topbar.tsx`)

Captura: 22-calendario-movil.

| # | Hallazgo | Principio | Sev. | Ref. |
|---|---|---|---|---|
| M1 | Barra sticky **opaca** (`bg-background` + `border-b`): ocupa una franja fija y corta el contenido con una línea dura. En Apple el chrome es un material translúcido con el contenido pasando por debajo y el borde aparece solo al hacer scroll. | §12 Materials, scroll edge effects | media | `mobile-topbar.tsx:36` |
| M2 | El menú es un Sheet izquierdo que abre en 500 ms `ease-in-out` (arranca lento): en un celular se siente con lag. No se puede cerrar arrastrándolo hacia la izquierda; solo con la X o tocando afuera. | §1 Response, §2 Direct manipulation, §3, §6 | alta | `primitives/sheet.tsx:34` |
| M3 | Dentro del Sheet los ítems mantienen la altura de escritorio (32 px): por debajo de 44 px de objetivo táctil. | §16 Flexibility (táctil vs. puntero) | media | `nav-config.ts:71` |
| M4 | La X de cierre del Sheet es un ícono de 16 px sin padding (`rounded-sm`): objetivo táctil de ~16 px. Igual en Dialog. | §10 (hit padding), §16 Flexibility | alta | `primitives/sheet.tsx:67`, `dialog.tsx:47` |
| M5 | `hover:` de Tailwind 3 no está limitado a `@media (hover: hover)`: en el iPhone el último ítem tocado queda "pegado" en hover. | §1 Response (feedback correcto en táctil) | media | todos los `hover:` |

### 2.3 Navegación del portal (`components/shell/portal-nav.tsx`, `app/(portal)/layout.tsx`)

Capturas: 17–21.

| # | Hallazgo | Principio | Sev. | Ref. |
|---|---|---|---|---|
| P1 | La barra de pestañas de abajo es **opaca** con `border-t`. Es el elemento más "app nativa" del portal y hoy se ve como un pie de página web. Debería ser un material translúcido (tab bar de iOS) con el contenido pasando por debajo. | §12 Materials | alta | `portal-nav.tsx:28` |
| P2 | La pestaña activa se marca con una rayita de 2 px arriba y peso medio. En iOS la pestaña activa usa el color de acento en ícono y etiqueta (y el ícono relleno); la rayita es un patrón de Android/web. | §16 Familiarity | media | `portal-nav.tsx:43` |
| P3 | Tocar una pestaña no da feedback hasta que la página nueva renderiza (sin `:active`, sin cambio inmediato del estado activo). | §1 Response | alta | `portal-nav.tsx:36-48` |
| P4 | Header sticky opaco con `border-b` permanente (mismo caso que M1). | §12 | media | `(portal)/layout.tsx:33` |
| P5 | En el celular, "Salir" ocupa el lugar más visible del header (arriba a la derecha) en todas las pantallas. Es una acción poco frecuente; en iOS estaría un nivel más adentro (perfil/cuenta). | §16 Simplicity ("el camino común primero") | baja | `(portal)/layout.tsx:38-43`, captura 21 |
| P6 | En escritorio las pestañas de arriba son pills con fondo; el cambio de pestaña no tiene continuidad (el fondo salta). | §7, §8 | baja | `portal-nav.tsx:65-69` |
| P7 | Positivo: barra inferior con `safe-area-inset-bottom`, objetivos de 56 px, íconos + etiqueta. Se conserva. | — | — | |

---

## 3. Auditoría por página

### 3.1 Calendario — `/` (captura 01, móvil 22)

Archivos: `app/(panel)/calendar-client.tsx`, `(calendario)/page.tsx`, `new-appointment-modal.tsx`,
`appointment-detail-sheet.tsx`, `globals.css:101-157`.

| # | Hallazgo | Principio | Sev. | Ref. |
|---|---|---|---|---|
| C1 | Las horas fuera de atención se pintan en gris lleno (`--muted`): en una semana normal **el gris domina la grilla** y lo disponible (blanco) queda como recortes. El peso visual está invertido respecto de lo importante. | §16 Simplicity (jerarquía), §12 | media | `globals.css:146-148`, captura 01 |
| C2 | En el celular la vista semana mete 7 columnas en 360 px: los turnos son ilegibles y la barra de herramientas se parte en tres renglones (título "28 sept – 4 oct 2026" cortado). | §16 Flexibility (adaptar al dispositivo) | alta | `calendar-client.tsx:165`, captura 22 |
| C3 | El selector Mes / Semana / Día es un grupo de botones cuadrados con borde; en Apple es un **segmented control** con un "thumb" que se desliza. Lo mismo para ‹ › Hoy: botones chicos, separados del título. | §16 Familiarity, §7 | media | `globals.css:122-145` |
| C4 | Cambiar de semana reemplaza la grilla de golpe; no hay ningún indicio de dirección (siguiente → entra desde la derecha). En el celular no se puede pasar de semana deslizando. | §7 Spatial consistency, §8 Hint, §2 | media | FullCalendar `headerToolbar` |
| C5 | La barra de carga es una línea de 2 px con `animate-pulse` (un parpadeo, no un progreso). | §16 Feedback (status) | baja | `calendar-client.tsx:156-160` |
| C6 | Positivo: el detalle del turno abre en un **Sheet no modal** (`modal={false}`), sin scrim, y se puede elegir otro turno sin cerrarlo. Es exactamente "separate to keep flow" del §12. Falta que el Sheet tenga material/elevación coherente y que entre con spring (hoy 500 ms ease-in-out). | §12 (positivo), §1 | media | `appointment-detail-sheet.tsx:82-91` |
| C7 | "Nuevo turno": el modal aparece centrado con zoom + un desplazamiento diagonal (default shadcn `slide-in-from-left-1/2` + `top-48%`). Los horarios disponibles son toggles cuadrados que cambian de color de golpe al elegir. | §7, §1 | baja | `primitives/dialog.tsx:41`, `new-appointment-modal.tsx:149-166` |
| C8 | En el detalle del turno, "Cancelar turno" es un botón rojo lleno a todo el ancho entre acciones neutras. Es una acción destructiva que manda WhatsApp: la jerarquía es correcta en intención, pero el rojo lleno compite con la acción principal. | §16 Agency (destructivo con mesura) | baja | `appointment-detail-sheet.tsx:413-418` |
| C9 | Positivo: franja de resumen en una línea (Turnos hoy / Esta semana / Próximo turno) y leyenda de colores con texto. | — | — | |

### 3.2 Disponibilidad — `/disponibilidad` (captura 02)

Archivos: `disponibilidad/view.tsx`, `schedule.tsx`, `exceptions.tsx`.

| # | Hallazgo | Principio | Sev. | Ref. |
|---|---|---|---|---|
| D-1 | Bloques que se superponen (p. ej. 15:00–19:00 y 16:00–20:00 el mismo día) se dibujan uno encima del otro y se tapan; la × del de abajo queda inaccesible a la vista. | §16 Craft, Simplicity | media | `schedule.tsx:138`, captura 02 |
| D-2 | Para agregar un bloque se toca una franja vacía; la única pista es el `hover:bg-muted/60`. No hay feedback al presionar ni una "fantasma" del bloque que se va a crear. | §1, §8 Hint | media | `schedule.tsx:103` |
| D-3 | La × para borrar un bloque es de 24 px y aparece siempre (ruido en 10 bloques). En táctil es chica. | §10, §16 Simplicity | media | `schedule.tsx:150` |
| D-4 | Los bloques son rectángulos grises con borde izquierdo negro: correctos pero sin el color de acento ni elevación; se confunden con las horas fuera de atención del calendario (mismo gris). | §12, §16 Craft | baja | `schedule.tsx:138` |
| D-5 | Positivo: excepciones en una columna lateral sticky con estado vacío claro. | — | — | |

### 3.3 Servicios — `/servicios` (captura 03)

Archivos: `servicios/page.tsx`, `service-card.tsx`, `service-form.tsx`, `reminders-editor.tsx`.

| # | Hallazgo | Principio | Sev. | Ref. |
|---|---|---|---|---|
| SV1 | Cada tarjeta repite 3 badges ("Manda recomendaciones previas", "Pide motivo", "Recordatorios: 3 días (pide confirmar) y 24 h antes") con tonos distintos: con 6 servicios son 18 etiquetas compitiendo con el nombre y el precio. | §16 Simplicity (cada elemento se gana el lugar) | media | `service-card.tsx:53-60` |
| SV2 | Precio y duración en el mismo peso que la descripción; el precio debería ser el dato con más presencia después del nombre. | §15 (jerarquía por peso + tamaño) | baja | `service-card.tsx:46-50` |
| SV3 | El switch "Activo" cambia sin feedback físico (thumb con 150 ms ease) y la tarjeta salta de la sección "Activos" a "Inactivos" sin transición: el usuario pierde de vista dónde quedó. | §7 Spatial consistency, §4 | media | `service-card.tsx:64-80` |
| SV4 | "Editar" abre un Sheet derecho de `max-w-xl` (bien), con la misma lentitud de 500 ms. | §1 | media | `service-card.tsx:85` |

### 3.4 Pacientes — `/pacientes` (captura 04)

Archivos: `pacientes/patients-list.tsx`, `components/data-table.tsx`.

| # | Hallazgo | Principio | Sev. | Ref. |
|---|---|---|---|---|
| PA1 | Las filas navegan al hacer clic (`router.push`) pero solo tienen hover; al presionar no cambia nada y la ficha tarda en cargar. | §1 Response | alta | `data-table.tsx:119,171-172` |
| PA2 | La tabla no tiene variante móvil: en el celular se scrollea en horizontal. En iOS sería una lista agrupada (inset grouped) con nombre, teléfono y chevron. | §16 Flexibility | media | `data-table.tsx` |
| PA3 | Encabezado de tabla sticky opaco con borde duro. | §12 scroll edge | baja | `primitives/table.tsx:22` |
| PA4 | Filas "(sin nombre)" con el mismo peso que un nombre real. | §16 Simplicity | baja | `patients-list.tsx:21` |
| PA5 | Positivo: búsqueda con ícono, contador "14 de 14", orden por columna. | — | — | |

### 3.5 Ficha del paciente — `/pacientes/[id]` (captura 05)

Archivos: `pacientes/[id]/page.tsx`, `patient-header.tsx`, `patient-tabs.tsx`, `evolution-*`,
`formula-data-*`, `requirement-summary-card.tsx`, `consultations-section.tsx`, `diary-section.tsx`,
`appointments-section.tsx`. (La pestaña **Planes** y `plans-section.tsx` listan planes pero el
detalle `planes/**` es zona de imleticio; `plans-section.tsx` queda en esta auditoría solo en lo
visual de la lista.)

| # | Hallazgo | Principio | Sev. | Ref. |
|---|---|---|---|---|
| F1 | La barra de pestañas es sticky y **opaca** (`bg-background`): al scrollear corta el contenido con un plano blanco. Es el caso de libro de "barra translúcida con scroll edge". | §12 Materials | media | `patient-tabs.tsx:91` |
| F2 | Al cambiar de pestaña, el subrayado salta y el contenido se reemplaza de golpe (`forceMount` + `hidden`). Un indicador que se desliza y un cross-fade corto darían continuidad. | §7, §8, §4 | media | `primitives/tabs.tsx:33`, `patient-tabs.tsx:121` |
| F3 | Los contadores de las pestañas (`Consultas 2`, `Planes 3`) son chips grises de 12 px pegados a la etiqueta; legibles pero sin jerarquía. | §15 | baja | `patient-tabs.tsx:103` |
| F4 | Título del paciente `text-2xl font-semibold tracking-tight` (tracking fijo para todos los títulos del sistema); a 24 px con Inter el tracking ideal es ≈ −0,02 em, y `tracking-tight` (−0,025 em) se aplica igual a 18 y a 30 px. | §15 Typography | baja | `patient-header.tsx:24` |
| F5 | Resumen: las métricas de evolución (Peso 61 kg, Cintura 73 cm…) son el dato que la nutricionista mira primero (D14 de HU-002) y están en el mismo plano que el resto, dentro de una tarjeta con borde de 1 px. Merecen tipografía grande tipo "Health" (número grande, unidad chica) y una tarjeta con más presencia. | §15, §16 Simplicity | media | `pacientes/[id]/page.tsx:166-206`, `evolution-summary.tsx` |
| F6 | "Datos para cálculos" y "Requerimiento indicado" son listas clave-valor con separadores: buena estructura, pero los badges grises ("Sin dato", "Sin cargar, se asume Mediana") tienen bajo contraste de fondo y se parecen a botones. | §16 Craft | baja | `formula-data-section.tsx` |
| F7 | Positivo: encabezado persistente con acción "Abrir chat de WhatsApp" bien ubicada, alerta clínica compacta, pestañas con scroll horizontal en 768 px. | — | — | |

### 3.6 Consulta — `/pacientes/[id]/consultas/[consultationId]` (captura 06)

Archivos: `consultas/[consultationId]/page.tsx`, `consultation-measurements.tsx`, `isak-card.tsx`,
`anthropometric-diagnosis.tsx`, `requirement-*.tsx`, `consultation-plan.tsx`,
`consultation-notes.tsx`, `delete-*-button.tsx`.

| # | Hallazgo | Principio | Sev. | Ref. |
|---|---|---|---|---|
| CO1 | En la tarjeta ISAK conviven 4 botones del mismo tamaño: "Ver estudio completo" (negro), "Informe PDF", "Editar" y **"Borrar estudio" en rojo lleno**. La acción destructiva tiene tanto peso visual como la principal. En Apple lo destructivo va como texto/tinte rojo o dentro de un menú "…", con confirmación. | §16 Agency, Simplicity | media | `delete-isak-study-button.tsx:52`, `isak-card.tsx:67` |
| CO2 | Lo mismo con "Borrar consulta" y "Borrar cálculo" (rojo lleno). | §16 Agency | media | `delete-consultation-button.tsx:44`, `requirement-section.tsx:136` |
| CO3 | Notas: textarea + "Guardar notas" explícito; no hay estado "guardado" visible después del toast. Para una nota de consulta, Apple guardaría solo (autosave con indicador). Es un cambio de comportamiento: se deja como duda, no se asume. | §16 Feedback | baja | `consultation-notes.tsx` |
| CO4 | La columna lateral (Plan indicado, Notas) no es sticky: en una consulta larga, la nota queda arriba y lejos de lo que se está midiendo. | §16 Grouping & mapping | baja | `page.tsx:249,288` |
| CO5 | El diagnóstico antropométrico usa badges de color (Sobrepeso, Riesgo elevado) con texto: bien (no depende solo del color). | — | — | |

### 3.7 Antropometría ISAK — `.../antropometria` (captura 07)

Archivos: `antropometria/page.tsx`, `isak-measures-table.tsx`, `z-score-bar.tsx`, `somatochart.tsx`,
`tissue-stacked-bar.tsx`, `isak-form.tsx`.

| # | Hallazgo | Principio | Sev. | Ref. |
|---|---|---|---|---|
| A1 | Página muy larga (medidas, composición, somatotipo, índices) sin navegación interna; los títulos de sección (`h3 text-sm font-semibold`) son del mismo tamaño que el cuerpo. | §15 jerarquía, §16 Wayfinding | media | `antropometria/page.tsx:163,344,403` |
| A2 | Acciones del encabezado: "Informe PDF", "Editar", "Borrar estudio" (rojo lleno). Igual que CO1. | §16 Agency | media | captura 07 |
| A3 | Barras de z-score: gris sobre gris (`bg-muted-foreground` sobre `bg-secondary`), sin marcar qué lado es "alto/bajo"; con color semántico suave serían más legibles. | §16 Craft | baja | `z-score-bar.tsx:7-11` |
| A4 | Somatocarta y gráficos sin animación de entrada coherente con el resto (o con la de Recharts por defecto, que ignora reduced-motion). | §14 | baja | `somatochart.tsx` |
| A5 | Positivo: tabla con valor, z y barra alineados por columna numérica (`tabular-nums`). | — | — | |

### 3.8 Informe antropométrico — `.../antropometria/informe` (captura 08)

Archivos: `informe/page.tsx`, `informe/report-editor.tsx`.

| # | Hallazgo | Principio | Sev. | Ref. |
|---|---|---|---|---|
| I1 | Hasta **cuatro avisos apilados** arriba (info "Revisá y editá…", warning "El estudio cambió…", warning "Tu matrícula y firma…", info de menor): el primero es una instrucción permanente con el mismo peso que un problema real. | §16 Feedback (4 tipos), Simplicity | media | `report-editor.tsx:292-314` |
| I2 | Formulario largo de textos editables con "Restaurar" por campo; no hay indicación de qué campos se tocaron respecto del texto generado. | §16 Feedback | baja | `report-editor.tsx:112-147` |
| I3 | El PDF tiene su propio tema Notion (`lib/pdf-theme.ts`) y no va a seguir el lenguaje nuevo salvo que se decida (D8). | §16 Craft (consistencia) | media | `lib/pdf-theme.ts:5-21` |

### 3.9 Mensajes — `/mensajes` (captura 09)

Archivos: `mensajes/mensajes-view.tsx`.

| # | Hallazgo | Principio | Sev. | Ref. |
|---|---|---|---|---|
| ME1 | El filtro Pendientes / Respondidos / Todos es un ToggleGroup con borde y fondo que salta: es un segmented control en todo menos en el movimiento y la forma. | §16 Familiarity, §7 | media | `mensajes-view.tsx:168-181` |
| ME2 | Al marcar una consulta como respondida, la fila desaparece de "Pendientes" sin transición (el usuario no ve a dónde fue). | §7 ("si desaparece de un lado, que se vea a dónde va") | media | `mensajes-view.tsx:126` |
| ME3 | "Actualizar" manual con `router.refresh()` sin estado de carga visible. | §16 Feedback (status) | baja | `mensajes-view.tsx:158` |
| ME4 | Tarjeta dentro de la página con título "Mensajes por WhatsApp" que repite el título de la página. | §16 Simplicity | baja | captura 09 |

### 3.10 Pagos — `/pagos` (captura 10)

Archivos: `pagos/page.tsx`, `payments-table.tsx`, `manual-payment-*.tsx`.

| # | Hallazgo | Principio | Sev. | Ref. |
|---|---|---|---|---|
| PG1 | Tres StatTiles ("Cobrado este mes $ 0"…) con número a 24 px semibold y etiqueta gris: buena base; el número no tiene tracking negativo ni separación clara de la moneda. | §15 | baja | `components/ui.tsx:164-166`, `pagos/page.tsx:78-90` |
| PG2 | Barra de filtros con 4 controles distintos en una línea (búsqueda, segmented, dos `<select>` nativos) más el contador: densa y con alturas/radios que no coinciden. | §16 Simplicity, Craft | media | `payments-table.tsx:126-200` |
| PG3 | Segmented Todos/Pendientes/Acreditados: mismo caso que ME1. | §16, §7 | media | `payments-table.tsx:145-162` |

### 3.11 Avisos — `/avisos` (captura 11)

Archivos: `avisos/avisos-view.tsx`, `broadcast-form.tsx`.

| # | Hallazgo | Principio | Sev. | Ref. |
|---|---|---|---|---|
| AV1 | "Enviar a los 14 pacientes" es un botón negro lleno, igual a cualquier "Guardar". Tiene confirmación (bien, `broadcast-form.tsx:44`), pero visualmente no comunica que es una acción de alcance masivo. | §16 Responsibility | media | `broadcast-form.tsx:66` |
| AV2 | Cola de mensajes: el estado (Enviado / Falló) es un badge al principio de la fila y el error se lee en rojo dentro de la celda del mensaje; bien resuelto. Las filas nuevas que llegan "en vivo" aparecen de golpe. | §7, §8 | baja | `avisos-view.tsx:79-100` |
| AV3 | Filtros Todos / Pendientes / Enviados / Fallidos: mismo caso que ME1. "Fallidos (1)" en rojo: correcto. | §16 | media | `avisos-view.tsx:154-174` |
| AV4 | Positivo: punto "En vivo" con `motion-safe:animate-pulse` (respeta reduced-motion). | §14 | — | `avisos-view.tsx:122` |

### 3.12 Asistente — `/asistente` (captura 12)

Archivos: `asistente/assistant-chat.tsx`.

| # | Hallazgo | Principio | Sev. | Ref. |
|---|---|---|---|---|
| AS1 | Los mensajes aparecen de golpe; la respuesta del asistente no tiene una entrada que la conecte con la pregunta (en Mensajes de iOS la burbuja "crece" desde el campo de texto). | §7, §8 | media | `assistant-chat.tsx:43-55` |
| AS2 | El campo de texto no crece con el contenido y queda en una barra con borde duro (`border-t`) en vez de un material de "composer". | §12 | baja | `assistant-chat.tsx:64-84` |
| AS3 | El estado vacío centrado en una caja enorme de borde fino: mucha superficie para un mensaje. | §16 Simplicity | baja | captura 12 |
| AS4 | Responsabilidad: es IA sobre datos clínicos; el aviso "Consultas rápidas…" está en el subtítulo. Mantenerlo visible en el rediseño (no esconderlo por minimalismo). | §16 Responsibility | baja | `asistente/page.tsx` |

### 3.13 Ajustes — `/ajustes` y `/ajustes/whatsapp` (capturas 13–16)

Archivos: `ajustes/ajustes-tabs.tsx`, `settings-form.tsx`, `bot-toggle.tsx`, `after-hours-form.tsx`,
`bot-ai-form.tsx`, `google-calendar-form.tsx`, `logo-form.tsx`, `signature-form.tsx`,
`ajustes/whatsapp/page.tsx`.

| # | Hallazgo | Principio | Sev. | Ref. |
|---|---|---|---|---|
| AJ1 | Navegación lateral (General, Bot de WhatsApp, Google Calendar, PDF) estilo "Configuración del Sistema" de macOS: familiar y correcta. El ítem activo usa el mismo patrón barrita + gris que la sidebar (S2). | §16 Familiarity (positivo), §7 | baja | `ajustes-tabs.tsx:64-74` |
| AJ2 | Los formularios son una tarjeta con campos sueltos y un "Guardar" por bloque. En Apple Settings se agrupan en **listas inset agrupadas** (fila = etiqueta a la izquierda, control a la derecha) y los switches aplican al instante. Hoy los switches ya aplican al instante pero los campos de texto esperan "Guardar": mezcla de modelos en la misma tarjeta. | §16 Familiarity, Grouping | media | captura 14, `settings-form.tsx` |
| AJ3 | Selector de archivo de firma/logo: input nativo con `file:` estilizado ("Seleccionar archivo · Sin archivos seleccionados"): texto del navegador en inglés/español según SO y botón que no coincide con el sistema. | §16 Craft | media | `signature-form.tsx`, `logo-form.tsx`, captura 16 |
| AJ4 | Inputs de hora nativos (`09:00 a.m.` con ícono de reloj del navegador): se ven distintos en cada navegador. | §16 Craft | baja | `after-hours-form.tsx`, captura 14 |
| AJ5 | Estado de conexión ("Desconectado" en rojo, "Conectado" en verde) como badge: bien; el botón "Ver QR y vinculación" es el paso crítico cuando está desconectado y tiene peso de botón secundario. | §16 Simplicity (lo importante más obvio) | baja | captura 14 |

### 3.14 Portal — Inicio, Evolución, Plan, Diario (capturas 17–21)

Archivos: `(portal)/portal/page.tsx`, `evolucion/page.tsx`, `plan/page.tsx` + `plan-view.tsx`,
`diario/page.tsx` + `diary-form.tsx`. (El contenido del plan lo arma la zona de imleticio; la
**vista del portal** `plan-view.tsx` entra en esta HU.)

| # | Hallazgo | Principio | Sev. | Ref. |
|---|---|---|---|---|
| PO1 | **Los campos de texto tienen 14 px** (`inputClass` con `text-sm`). En Safari de iOS, un input de menos de 16 px hace **zoom automático** al enfocarlo: el diario se descuadra en el iPhone del paciente. | §1, §16 Flexibility | alta | `components/ui.tsx:299-300`, `diary-form.tsx:27` |
| PO2 | Inicio: cuatro tarjetas iguales (Próximo turno, Plan vigente, Evolución, Diario), todas con el mismo peso. Lo más importante (el próximo turno) no se distingue; con datos vacíos es una lista de "Todavía no…". | §16 Simplicity, §15 | media | `portal/page.tsx:46-110`, captura 17 |
| PO3 | Los accesos "Ver evolución >", "Abrir diario >" son botones secundarios dentro de la tarjeta; en iOS la tarjeta entera es tocable con chevron y feedback de presión (scale/highlight). | §1, §16 Familiarity | media | `portal/page.tsx:69,92,100` |
| PO4 | Saludo "Hola, María López 👋" a 24 px con tracking fijo. Es el lugar natural para un *large title* (≈ 28–34 px) que se achica al scrollear hacia el header. | §15, §12 | baja | `portal/page.tsx:37` |
| PO5 | "Este es tu espacio con Nutricionista." cuando la profesional no cargó nombre: con datos de desarrollo queda raro. No es de diseño, pero el rediseño lo deja más expuesto. | §16 Craft | baja | `portal/page.tsx:40-43` |
| PO6 | Diario: input de archivo nativo ("Seleccionar archivo · Sin archivos seleccionados"). En el celular el paciente espera "Sacar foto / Elegir de la galería" y una miniatura. | §16 Familiarity | media | `diary-form.tsx:34`, captura 20 |
| PO7 | Diario: al agregar un registro, aparece en la lista de golpe y el form se limpia; no hay confirmación con continuidad (la entrada nueva "cae" en la lista). | §7, §13 (causalidad del feedback) | media | `diary-form.tsx` |
| PO8 | Evolución: estado vacío correcto; con datos, la lista de registros es una lista con divisores dentro de una tarjeta: candidata a lista inset agrupada. Gráfico con animación de Recharts por defecto. | §16, §14 | baja | `evolucion/page.tsx:44-52` |
| PO9 | Plan: botón "Descargar PDF" lleno a todo el ancho en el celular (bien); lista del plan con divisores. Sin gestos. | — | baja | `plan-view.tsx:34-54` |
| PO10 | Sin gestos táctiles en todo el portal (no hay sheets arrastrables, ni swipe entre pestañas, ni pull-to-refresh). Es la diferencia más grande con una app nativa. | §2, §5, §6, §9 | media | — |
| PO11 | Positivo: tono cálido (`theme-warm`), objetivos táctiles de 44 px en botones `lg`, barra inferior con safe area, estados vacíos con ícono y texto. | — | — | |

### 3.15 Pantallas sin sesión y estados (sin captura; vistas en código)

Archivos: `app/inicio/page.tsx`, `app/login/page.tsx` (ambas renderizan `components/login-screen.tsx`),
`(portal)/layout.tsx:15-29` (portal sin link), `components/status-screen.tsx`, `not-found.tsx`,
`error.tsx`, `global-error.tsx`, `components/skeletons.tsx`, `loading.tsx` de cada ruta.

| # | Hallazgo | Principio | Sev. | Ref. |
|---|---|---|---|---|
| L1 | Login: tarjeta blanca con borde sobre `bg-muted`, título 20 px, botón "Entrar con Google" secundario. Sobrio y correcto; sin presencia de marca más allá del Wordmark chico. Es la primera impresión: candidato a large title + material. | §15, §16 Delight | baja | `login-screen.tsx:11-38` |
| L2 | El botón de Google no tiene estado de carga al enviar (es un form de server action; entre el clic y la redirección no hay feedback). | §1 Response | media | `login-screen.tsx:22-31` |
| L3 | Portal sin link: misma tarjeta; texto claro. Sin hallazgos de peso. | — | — | `(portal)/layout.tsx:15-29` |
| L4 | Skeletons con `animate-pulse` de `bg-primary/10`: con un primario de color, los skeletons quedarían teñidos. Deben usar un gris de relleno, no el primario. | §16 Craft | baja | `primitives/skeleton.tsx:9` |
| L5 | El paso de skeleton a contenido es un reemplazo instantáneo; un cross-fade corto (≤150 ms) suaviza sin demorar. | §11, §14 | baja | `loading.tsx` |

---

## 4. Hallazgos transversales

| # | Tema | Hallazgo | Principio | Sev. |
|---|---|---|---|---|
| T1 | Feedback al presionar | **No hay ni un `:active` en todo `apps/web`.** Botones, filas, ítems de navegación, tarjetas tocables y toggles solo reaccionan al hover y al resultado. | §1 Response | alta |
| T2 | Hover en táctil | `hover:` sin `@media (hover: hover)`: hover "pegado" en iPhone/Android. | §1, §16 Flexibility | media |
| T3 | Sheets | 500 ms `ease-in-out` al abrir; no arrastrables; no interrumpibles (keyframes). | §1, §2, §3, §4 | alta |
| T4 | Transiciones con keyframes | Dialog, Sheet, menús y popovers usan `@keyframes` de `tailwindcss-animate`: no se pueden interrumpir ni invertir desde el valor presente (si se cierra a mitad de la apertura, salta). | §3 Interruptibility | media |
| T5 | Segmented controls | Tres pantallas (Mensajes, Pagos, Avisos) y el calendario tienen "segmented controls" armados con ToggleGroup sin thumb deslizante. | §16 Familiarity, §7 | media |
| T6 | Tabs | Subrayado que salta y contenido sin transición (ficha, ajustes). | §7, §8 | media |
| T7 | Materiales | Ningún `backdrop-filter` en todo el código: todo el chrome (topbar móvil, header y tab bar del portal, pestañas sticky de la ficha, encabezados de tabla) es opaco con borde de 1 px permanente. | §12 | media |
| T8 | Elevación | Una sola "capa" visible (borde de 1 px); sombras solo en overlays con defaults shadcn (`shadow-md`/`shadow-lg`) sin una escala propia ni relación tamaño→profundidad. | §12 ("superficies grandes se leen más gruesas") | media |
| T9 | Color | Acento casi negro (`--primary: 45 4% 18%`): toda acción principal, badge, switch y selección es negra. No hay *tint color*; la marca verde del logo no aparece en ningún lado de la UI. | §16 Craft, Delight | media |
| T10 | Tipografía | Escala ad hoc (`text-xs`…`text-2xl` sueltos por página), un solo `tracking-tight` para todos los títulos, sin tracking positivo en 11–12 px, sin leading ajustado por tamaño. Títulos de sección del mismo tamaño que el cuerpo (14 px semibold). | §15 | media |
| T11 | Tamaño de texto del usuario | Hay alturas fijas en px en controles (`h-8`, `h-9`) que están en rem (bien), pero el CSS del shell usa px (`48px`, `14rem`, `40px`, `64px`) en el layout de la sidebar; con zoom de texto del navegador la sidebar no escala con el texto. | §15 (Dynamic Type) | baja |
| T12 | Radios | Tres radios (4/6/8 px) más 24 px del workspace y 12 px en el portal; no son concéntricos (un botón de 6 px dentro de una tarjeta de 8 px con 24 px de padding). | §16 Craft | baja |
| T13 | Destructivas | Botones rojos llenos en ~5 lugares, al lado de la acción principal. | §16 Agency | media |
| T14 | Reduced motion | La regla global apaga **todas** las transiciones (incluidos fades de opacidad que ayudan a entender). El skill pide una alternativa suave (cross-fade), no "nada". Recharts anima por JS y no lo cubre la regla CSS (verificar en la SDD). No hay soporte de `prefers-reduced-transparency` ni `prefers-contrast` (hoy no hay translucidez, pero la propuesta la agrega). | §14 | media |
| T15 | Feedback multimodal | Sin sonido ni haptics (correcto para un panel). En el portal móvil, la Vibration API no existe en iOS Safari; solo serviría en Android. | §13 Utility | baja (no se propone) |
| T16 | Objetivos táctiles | X de cierre de 16 px (Sheet/Dialog), × de bloques de 24 px, ítems de menú móvil de 32 px. | §10, §16 Flexibility | alta |
| T17 | Inputs en iOS | 14 px → zoom automático en Safari iOS (ver PO1). Afecta también al panel si la nutricionista lo usa en el celular. | §16 Flexibility | alta |
| T18 | Iconografía | lucide-react a 16 px con trazo 2 px en todo el sistema. Es coherente; el look Apple (SF Symbols) es de trazo algo más fino y con variantes rellenas para estado activo. Lucide permite `strokeWidth` (p. ej. 1,75) pero no tiene variantes rellenas para todos los íconos. | §16 Craft, Familiarity | baja |
| T19 | Modo oscuro | Tokens "preparados" pero sin valores dark: hoy activarlo no daría nada. | §16 Craft ("colores que se adaptan") | baja (ver D3) |
| T20 | Formularios nativos | `<select>`, `type="date"`, `type="time"` y `type="file"` nativos: accesibles y con buen teclado móvil, pero con aspecto distinto en cada navegador. | §16 Craft vs. Familiarity | baja |
| T21 | Gráficos | Colores fijos en hex (`lib/chart-theme.ts`) fuera de los tokens; animaciones por defecto de Recharts. | §16 Craft, §14 | baja |
| T22 | Navegación entre páginas | Sin continuidad (reemplazo + skeleton). Next 15 tiene View Transitions solo experimental. | §7 | baja (no se propone en la primera ola) |

---

## 5. Diseño UX: propuesta de lenguaje visual Apple para NutriBot

Todo lo que sigue es propuesta a validar (ver Dudas). Valores concretos para que el `architect`
pueda bajarlos a tokens; sin código.

### 5.1 Principios rectores (para decidir casos no previstos)

1. **Responde al tocar.** Todo lo presionable cambia en el `pointerdown` (escala/tono) en
   ≤ 100 ms.
2. **El color es una señal, no un decorado.** Un solo *tint* (acento) para acción principal,
   selección y foco; rojo/naranja/verde de sistema solo para estado.
3. **Chrome translúcido, contenido sólido.** Barras y navegación flotan sobre el contenido;
   tarjetas, sheets y modales son superficies sólidas.
4. **Profundidad por tamaño.** Cuanto más grande y más "encima", más sombra y más blur.
5. **Movimiento con física, sin espectáculo.** Springs críticamente amortiguados por defecto; rebote
   solo después de un gesto con impulso.
6. **Del mismo lugar al mismo lugar.** Lo que entra por la derecha sale por la derecha; menús y
   popovers nacen del botón que los abrió.

### 5.2 Paleta (modo claro)

Contrastes medidos con la fórmula WCAG 2.x.

| Token (rol) | Valor propuesto | Uso | Contraste |
|---|---|---|---|
| `background` | `#FFFFFF` | Contenido (workspace, tarjetas, sheets) | — |
| `background-grouped` | `#F5F5F7` | Fondo de la app detrás de tarjetas/listas agrupadas; sidebar | — |
| `label` (foreground) | `#1D1D1F` | Texto principal | 16,8:1 sobre blanco; 15,5:1 sobre `#F5F5F7` |
| `label-secondary` | `#636366` | Texto secundario, descripciones, etiquetas de campo | 6,0:1 sobre blanco; 5,5:1 sobre `#F5F5F7`; 5,1:1 sobre `fill` |
| `label-tertiary` | `#8E8E93` | **Solo** íconos decorativos, separadores de texto ("·"), deshabilitado. Nunca texto informativo | 3,3:1 (no AA para texto) |
| `placeholder` | `#6E6E73` | Placeholders informativos | 5,1:1 |
| `separator` | `#E5E5EA` (o negro 8 %) | Divisores hairline, bordes de tarjeta | decorativo |
| `control-border` | `#8E8E93` | Borde de inputs (requisito 3:1 de componentes) | 3,3:1 sobre blanco |
| `fill` | `#EDEDF0` | Track de segmented control, chips, fondo de inputs "filled", skeleton | — |
| **`tint` (acento)** | **`#1F7A55`** (verde del logo, oscurecido) | Botón principal, selección, switch encendido, links, foco, pestaña activa | blanco sobre tint 5,3:1; tint sobre blanco 5,3:1; sobre `#F5F5F7` 4,85:1 |
| `tint-pressed` | `#1A6B4A` | Estado presionado del principal | 6,5:1 |
| `tint-soft` | `#E9F4EE` | Fondo de selección, badge de marca, fila activa | tint sobre él 4,7:1 |
| `destructive` | `#D70015` | Texto/botón destructivo | 5,4:1 |
| `warning` (texto) / fondo | `#A05A00` / `#FFF4E0` | Avisos | 4,9:1 |
| `success` (texto) / fondo | `#1E7A34` / `#E8F5EC` | Estado OK | 4,8:1 |
| `info` (texto) / fondo | `#0058B0` / `#E8F1FC` | Información | 6,1:1 |
| `focus-ring` | `tint` al 100 %, 2 px + offset 2 px | Foco de teclado | ≥ 3:1 contra blanco y `#F5F5F7` |

Notas:

- Los grises son los neutros fríos de Apple (`#1D1D1F`, `#636366`, `#F5F5F7`), no los cálidos de
  Notion. El gris secundario de Apple más conocido (`#86868B`) **no pasa AA** sobre blanco (3,6:1):
  no se usa para texto informativo.
- **Conflicto verde-éxito**: si el acento es verde, "Completado"/"Acreditado"/"Conectado" quedan
  del mismo tono que la acción principal. Mitigación: estados siempre con ícono + texto (ya es
  regla de HU-002) y un verde de éxito algo más amarillo (`#1E7A34`) que el tint. Alternativa en
  D1: acento azul de sistema (`#0066CC`, 5,6:1) y verde solo en la marca.
- **Portal cálido** (D11 de HU-002): se propone conservar el tono cálido solo en
  `background-grouped` del portal (`#FBFAF7`, con `label-secondary` a 4,9:1), no en los grises de
  texto. Ver D2.
- Los colores de **servicio** (que elige la profesional, `service-form.tsx:35`) siguen siendo dato;
  el calendario los muestra como hoy.
- Los colores de **gráficos** (`lib/chart-theme.ts`) pasan a derivarse de la paleta (serie 1 = tint)
  en la HU que toque gráficos.

**Modo oscuro (ver D3):** si se aprueba, valores base `#000000` / `#1C1C1E` / `#2C2C2E` para
fondos, `#F5F5F7` texto, `#AEAEB2` secundario, tint aclarado (`#3DBE8B` aprox., a verificar 4,5:1
sobre `#1C1C1E`). Se activaría por `prefers-color-scheme`, sin selector.

### 5.3 Tipografía

**Familia (ver D4):** recomendación **Inter variable con eje óptico (`opsz`)** en todo el sistema.

- Razón para no usar la pila del sistema (`-apple-system, "SF Pro"…`): el skill dice "usá la fuente
  del sistema salvo que haya una razón". La razón es la **consistencia**: con la pila del sistema
  la nutricionista vería SF en una Mac y Segoe UI en Windows, el paciente Roboto en Android, y los
  PDF (que embeben Inter) se verían distintos de la pantalla. Inter es la sans abierta más cercana
  a SF, ya está en el repo (web y PDF) y con `opsz` cambia de forma con el tamaño como SF Text/SF
  Display.
- Alternativa: pila del sistema con Inter de respaldo; se ve "más Apple" en Mac/iPhone y distinto en
  el resto.
- Números: `tabular-nums` en datos (ya se usa) y `font-feature-settings` de Inter para la variante
  de dígitos más parecida a SF (lo define la SDD).

**Escala** (tracking según las métricas dinámicas de Inter, `−0,0223 + 0,185·e^(−0,1745·tamaño)` em):

| Estilo | Tamaño / leading | Peso | Tracking | Uso |
|---|---|---|---|---|
| Large Title | 34 / 41 px | 700 | −0,022 em | Saludo del portal; título grande de página en móvil |
| Title 1 | 28 / 34 px | 700 | −0,021 em | Título de página del panel (hoy 24 px) |
| Title 2 | 22 / 28 px | 600 | −0,018 em | Nombre del paciente, título de sheet/modal |
| Title 3 | 20 / 25 px | 600 | −0,017 em | Títulos de tarjeta destacada, números de métricas medianas |
| Headline | 17 / 22 px | 600 | −0,013 em | Título de tarjeta / sección |
| Body | 15 / 22 px (panel), 17 / 24 px (portal) | 400 | −0,009 / −0,013 em | Texto corrido |
| Callout | 14 / 20 px | 400–500 | −0,006 em | Celdas de tabla, filas de lista del panel, botones |
| Subheadline | 13 / 18 px | 400–500 | −0,003 em | Etiquetas de campo, metadatos |
| Footnote | 12 / 16 px | 400 | 0 | Ayudas, timestamps |
| Caption | 11 / 13 px | 500 | +0,005 em | Encabezados de grupo de la sidebar, contadores |
| Métrica | 34–48 px | 600 | −0,022 em | Números grandes estilo Salud (peso, cintura, cobrado del mes); unidad en Subheadline secundario |

- **Inputs del portal en 17 px** (y nunca menos de 16 px en ningún input táctil): resuelve PO1.
- Jerarquía por **peso + tamaño + leading** juntos (§15), no solo por tamaño.
- Todo en `rem`; el shell también (T11).

### 5.4 Radios (concéntricos)

| Token | Valor | Uso |
|---|---|---|
| `radius-xs` | 6 px | Badges, chips, celdas de calendario |
| `radius-sm` | 8 px | Inputs, botones del panel (36 px de alto), ítems de sidebar |
| `radius-md` | 12 px | Botones grandes del portal (44–50 px), popovers, menús, toasts |
| `radius-lg` | 16 px | Tarjetas, listas agrupadas |
| `radius-xl` | 22 px | Sheets (esquinas expuestas), modales, workspace de escritorio |
| `radius-full` | 9999 px | Segmented controls, switches, pills, avatares |

Regla de concentricidad: radio interior = radio exterior − padding (un botón dentro de una tarjeta
de 16 px con 8 px de padding lleva 8 px). Valorar *continuous corners* (squircle) solo si hay una
forma barata (no es requisito).

### 5.5 Elevación

| Nivel | Uso | Sombra (aprox.) | Borde |
|---|---|---|---|
| 0 — plano | Contenido en el workspace, filas | ninguna | hairline `separator` |
| 1 — tarjeta | Tarjetas, listas agrupadas, StatTiles | muy suave: 0 1 2 negro 4 % + 0 0 0 0,5 px negro 6 % | sin borde de 1 px gris (lo reemplaza el anillo de 0,5 px) |
| 2 — flotante | Popovers, menús, tooltips, toasts, sheet no modal del calendario | 0 8 24 negro 12 % | anillo 0,5 px |
| 3 — modal | Dialogs, AlertDialogs, sheets modales | 0 24 64 negro 18 % | anillo 0,5 px |

Sombra más fuerte sobre contenido denso (tablas) y más suave sobre fondos lisos (§12), si se puede
resolver con un modificador del nivel.

### 5.6 Materiales

| Material | Dónde | Propuesta | Fallback |
|---|---|---|---|
| **Chrome fino** | Topbar móvil del panel, header del portal, pestañas sticky de la ficha, encabezados de tabla sticky | Blanco 72 % + blur 20 px + saturación 180 %. Sin borde fijo: hairline/sombra suave solo cuando hay contenido scrolleado debajo (scroll edge) | `prefers-reduced-transparency` / `prefers-contrast: more`: fondo sólido + borde |
| **Tab bar** | Barra inferior del portal | Igual al chrome, con blur algo mayor (24 px) por ser superficie más grande; borde superior "de luz" (blanco 40 %) | igual |
| **Flotante** | Popovers, menús, tooltips, toasts | Blanco 85 % + blur 24 px + nivel 2 | sólido |
| **Sólido** | Tarjetas, sheets, dialogs | Sólido (no se apila translúcido sobre translúcido; legibilidad de datos clínicos) | — |
| **Sidebar** | Sidebar de escritorio | **Sólida** `#F5F5F7` (material "pesado" estructural). El blur no aporta: no hay contenido debajo. | — |
| **Scrim** | Detrás de modales | Negro 30 % (más liviano que el actual `foreground/40`), con fade. Los sheets modales "empujan" levemente el fondo (escala 0,98) solo en el portal móvil (D5) | sin escala con reduced-motion |

Texto sobre materiales: color sólido de `label`/`label-secondary`, sin grises terciarios; peso un
punto mayor en etiquetas chicas sobre blur (vibrancy, §12).

### 5.7 Movimiento

**Librería (ver D6): recomendación `motion` (Motion for React, ex Framer Motion).**

- Razón: el skill exige springs interrumpibles que arranquen del valor presente y hereden velocidad
  (§3–§5), drag con captura de puntero y proyección de momentum (§2, §6). CSS no puede: las
  transiciones/keyframes no se interrumpen con continuidad de velocidad. Motion lo trae, con
  `layout`/`layoutId` para indicadores que se deslizan, `AnimatePresence` para salidas, y una API
  `bounce + duration` que mapea a damping + response de Apple.
- Costo: ~15–35 KB gz según cuánto se use (con `LazyMotion` + `domAnimation` el piso es bajo); solo
  en componentes cliente. Radix necesita `forceMount` + `AnimatePresence` para animar salidas.
- Para lo trivial (press, hover, color) se queda **CSS**: no hace falta JS para `:active`.
- Alternativa: solo CSS + WAAPI a mano (cero dependencias; sin gestos ni springs reales).
- Vaul (bottom sheets) existe y es Radix-compatible, pero su mantenimiento hay que verificarlo en la
  SDD; con Motion se pueden hacer los sheets arrastrables sin otra dependencia.

**Tabla de movimiento** (Motion: `bounce` ≈ 1 − damping; `duration` ≈ response):

| Interacción | Tipo | Valores | Notas |
|---|---|---|---|
| Presionar botón / fila / tarjeta / ítem | CSS | escala 0,97 (botones) / 0,985 (tarjetas y filas) + tono más oscuro; 100 ms ease-out al presionar, 200 ms al soltar | En `pointerdown`. Solo `transform` y `opacity`/color |
| Hover | CSS | 150 ms color | Solo bajo `@media (hover: hover)` |
| Popover / menú / tooltip | spring | bounce 0, duration 0,25 s; escala 0,96→1 + opacidad desde el origen del disparador | Salida por el mismo camino |
| Dialog / AlertDialog | spring | bounce 0, duration 0,3 s; escala 0,96→1 + opacidad; scrim fade 200 ms | Centrado (es una tarea modal); sin el desplazamiento diagonal actual |
| Sheet lateral (panel) | spring | abrir/cerrar con botón: bounce 0, duration 0,35 s | Sale por el mismo borde por el que entró |
| Sheet inferior (portal móvil) | spring + drag | por botón: bounce 0, 0,35 s; al soltar después de arrastrar: bounce 0,2, 0,3 s **con la velocidad del dedo** | Proyección de momentum (§6, d = 0,998) para decidir cerrar/abrir por el destino proyectado, no por la posición; rubber-band al pasar el tope (§9) |
| Sidebar colapsar/expandir | spring | bounce 0, duration 0,35 s, sobre el **ancho del slot** (no `scaleX` del contenido) | Elimina S4; interrumpible |
| Indicador de pestaña / segmented / ítem activo de sidebar | spring layout | bounce 0, duration 0,3 s | `layoutId`: el indicador se desliza al nuevo ítem |
| Contenido de pestañas | CSS/Motion | cross-fade 150 ms (sin slide) | Sin demorar la interacción |
| Switch | spring | bounce 0,15, duration 0,25 s | El rebote mínimo está justificado: el thumb es un objeto físico que se "tira" |
| Lista: alta / baja de ítems (Mensajes respondidos, Diario, servicio activo↔inactivo) | spring layout | bounce 0, duration 0,35 s | El ítem sale en la dirección de su destino (§7) |
| Toast | librería (Sonner) | conservar Sonner; ajustar posición/material | Ya tiene swipe para descartar |
| Cambio de semana en el calendario | CSS | deslizamiento corto (24 px) + fade 200 ms en la dirección navegada | §8 Hint; FullCalendar no expone animaciones: lo resuelve la SDD o se descarta |
| Skeleton → contenido | CSS | fade 150 ms | |
| Gráficos | Recharts | entrada ≤ 400 ms ease-out, desactivada con reduced-motion | |

**Reduced motion / transparencia / contraste (§14):**

- `prefers-reduced-motion: reduce` → se reemplazan escalas, slides y springs por **cross-fades de
  150–200 ms**; nada de rebote; el press queda como cambio de tono (sin escala). Se elimina la regla
  global que lleva todo a 0,01 ms y se reemplaza por variantes en cada componente (Motion tiene
  `useReducedMotion`/`MotionConfig reducedMotion="user"`).
- `prefers-reduced-transparency: reduce` → materiales sólidos (sin blur).
- `prefers-contrast: more` → materiales sólidos + bordes de 1 px con contraste ≥ 3:1.
- Nada de fondos en movimiento ni loops lentos.

**Gestos (§2, §6, §9, §10) — alcance propuesto (ver D7):**

| Gesto | Dónde | Propuesta |
|---|---|---|
| Arrastrar para cerrar | Sheets inferiores del portal móvil; menú del panel en móvil (hacia la izquierda) | Sí, con velocidad y proyección |
| Swipe en filas (acciones) | Listas del portal (Diario: borrar registro) | No en la primera ola (oculta acciones; requiere alternativa visible igual) |
| Swipe entre pestañas | Portal | No (choca con el scroll horizontal y con el gesto "atrás" de iOS) |
| Swipe de semana | Calendario móvil | Opcional en HU-017b si FullCalendar lo permite sin pelear con su scroll |
| Pull to refresh | Portal | No (el navegador ya lo hace en móvil) |

### 5.8 Componentes clave

| Componente | Propuesta |
|---|---|
| **Botón** | Variantes: *filled* (tint, texto blanco), *tinted* (tint-soft, texto tint), *gray* (fill, texto label), *plain* (solo texto tint), *destructive* (texto rojo; lleno solo en la confirmación final). Alturas: 32 (sm), 36 (panel), 44–50 (portal, `lg`). Radio 8 / 12. Press: escala 0,97 + tono. Spinner dentro del botón al cargar (ya existe `loading`). |
| **Input / Select / Textarea** | Fondo `fill` o blanco con borde `control-border`; radio 8 (panel) / 12 (portal); foco con anillo tint de 2 px que aparece con 150 ms; 17 px en el portal. Errores inline debajo (ya existe). |
| **Card** | Nivel 1 sin borde gris de 1 px; radio 16; padding 20–24; título Headline. |
| **Lista agrupada (nuevo)** | Estilo *inset grouped* de iOS: filas con etiqueta a la izquierda, valor/control a la derecha, chevron si navega, separador hairline indentado. Para Ajustes, Datos para cálculos, listas del portal, pacientes en móvil. |
| **Tabla** | Sin bordes verticales; encabezado sticky con material chrome; filas de 44 px con press; números `tabular-nums` a la derecha (ya existe); en móvil se convierte en lista agrupada. |
| **Segmented control (nuevo)** | Track `fill` radio full; thumb blanco con sombra nivel 1 que se desliza (spring layout). Reemplaza los ToggleGroup de filtros y el selector de vista del calendario. |
| **Tabs** | Para la ficha (7 pestañas) se mantiene la barra horizontal con indicador deslizante (un segmented de 7 no entra a 1366 px). En Ajustes, lista lateral como hoy con indicador deslizante. |
| **Sheet** | Panel: lateral derecho, radio xl en las esquinas expuestas, nivel 3 (o 2 si no es modal), spring. Portal móvil: hoja inferior con "grabber", detents (media/completa) y arrastre. |
| **Modal** | Centrado, radio xl, nivel 3, scrim 30 %, spring sin rebote. Acciones abajo a la derecha (panel) o apiladas a todo el ancho (móvil). |
| **AlertDialog (confirmación)** | Estilo alerta de Apple: título, texto, botón destructivo en rojo (texto o lleno según gravedad) y "Cancelar" como acción por defecto. |
| **Toast** | Sonner con material flotante, radio 12, ícono de estado; arriba al centro en el portal (como hoy) y abajo a la derecha en el panel (como hoy). |
| **Sidebar** | Sólida `#F5F5F7`; ítems de 32 px (escritorio) / 44 px (menú móvil); ítem activo con fondo `tint-soft` + texto e ícono tint (sin barrita negra), indicador deslizante; badge de pendientes en rojo de sistema o tint. |
| **Tab bar del portal** | Material tab bar; ícono + etiqueta; activo en tint (ícono más grueso o relleno si existe); press inmediato. |
| **Badge** | Radio 6, 12 px semibold, tonos suaves; menos badges por tarjeta (SV1). |
| **StatTile / Métrica** | Número grande (34 px, tracking negativo) + unidad secundaria; etiqueta Subheadline; opcional mini-tendencia. |
| **Switch** | Proporción iOS (51×31 escalada a 44×26 en el panel), on = tint, thumb con sombra y spring. |
| **EmptyState** | Ícono 32 px en `label-tertiary`, título Headline, texto Subheadline, acción *tinted*. |
| **Skeleton** | Relleno `fill`, sin teñir con el primario. |
| **Iconos** | lucide-react con `strokeWidth` ~1,75 a 16–20 px; activo en tint. (Cambiar de set de íconos queda fuera.) |

---

## 6. Propuesta de partición en HU

Como en HU-002a–d: HU encadenadas, cada una mergeada completa y aprobada.

| HU | Alcance | Depende de | Notas |
|---|---|---|---|
| **HU-017a — Fundaciones y shell** | Tokens nuevos (paleta, tipografía, radios, elevación, materiales) en `globals.css` y `tailwind.config.ts`; fuente (Inter `opsz` o la que se decida); librería de movimiento y presets de springs; política de reduced-motion/transparency/contrast (reemplaza la regla global); todos los primitivos de `components/primitives/` y los componentes de `components/ui.tsx` (Button con press, Input 16+ px en táctil, Card, Badge, Alert, EmptyState, StatTile, Skeleton); componentes nuevos (Segmented control, Lista agrupada, Métrica); Sheet/Dialog/Popover/Menu/Tooltip/Toast con springs y materiales; shell completo (sidebar, topbar móvil, header y tab bar del portal); login/`/inicio`; `loading`/`error`/`not-found`/`status-screen`; tema de FullCalendar y de Recharts (colores desde tokens). | — | Al cambiar tokens y `ui.tsx`, **todas** las pantallas (incluida la zona de imleticio) cambian de aspecto de golpe. Ver R1 |
| **HU-017b — Agenda y gestión** | Calendario (vista móvil por defecto día/3 días, segmented, horas no laborables más livianas, sheet del turno, modal nuevo turno), Disponibilidad (bloques superpuestos, crear/borrar), Servicios (tarjetas, menos badges, transición activo↔inactivo), Mensajes, Pagos, Avisos, Asistente, Ajustes (listas agrupadas, selector de archivo propio) y WhatsApp. | 017a | Pantallas más estables, mayormente aplicar componentes |
| **HU-017c — Pacientes y consultas** | Lista de pacientes (lista agrupada en móvil), ficha (pestañas con indicador, chrome translúcido, métricas grandes en Resumen, Datos para cálculos como lista agrupada), consulta, ISAK (página y formulario), informe antropométrico (avisos), evolución y gráficos, diario (lado panel), turnos del paciente; la **lista** de planes de la ficha (`plans-section.tsx`) solo en lo visual. Acciones destructivas a menú "…". | 017a | La pantalla más usada en consulta. Si se decide alinear el **informe PDF** (D8), va acá |
| **HU-017d — Portal del paciente** | Inicio (jerarquía con large title, tarjetas tocables), Evolución, vista del Plan (`plan-view.tsx`), Diario (cámara/galería con miniatura, alta con transición), sheets inferiores arrastrables, pantalla sin link. | 017a | Es donde más rinden los gestos (D7) |
| **HU-017e — Zona de planes y alimentos** | `alimentos/**`, `pacientes/[id]/planes/**`, `plantillas/**`, `food-picker.tsx`, `meals-editor.tsx` y lo que agregue la HU-015; PDF del plan si D8 lo incluye. | 017a + **HU-015 mergeada** | Coordinar con imleticio (D11): quién la hace y cuándo |
| **HU-017f — Modo oscuro** (opcional) | Valores dark de todos los tokens, verificación de contraste, gráficos, FullCalendar, imágenes; activado por `prefers-color-scheme`. | 017a–e | Solo si D3 = sí |

Orden propuesto: a → c → b → d → e (→ f). Se pone **pacientes antes que agenda** porque es lo que
la nutricionista usa en consulta y donde más se nota el cambio; ver D10.

Entre HU-017a y la última, `main` convive con pantallas a medio migrar (como con HU-002, D9 de
esa HU): con 017a las pantallas sin migrar ya toman colores, tipografía y componentes nuevos, solo
les falta la reorganización propia.

---

## 7. Criterios de aceptación

### 7.1 HU-017a — Fundaciones y shell (detallado)

```gherkin
Feature: Fundaciones del lenguaje visual Apple y shell

  Background:
    Given la profesional está logueada en el panel
    And la base de desarrollo tiene pacientes, turnos y servicios cargados

  # --- Tokens y tipografía ---

  Scenario: Un único juego de tokens
    When se revisa el código de apps/web fuera de la zona de imleticio
    Then colores, tipografía, radios, sombras, materiales y duraciones de movimiento salen de tokens
         definidos en un solo lugar
    And no quedan los valores del sistema anterior (grises cálidos estilo Notion, --primary casi negro)
    And lib/chart-theme.ts y el tema de FullCalendar toman sus colores de esos tokens

  Scenario: Color de acento como señal
    When la profesional recorre cualquier pantalla
    Then el color de acento aparece en la acción principal, la selección, el foco y la navegación activa
    And no aparece como decoración
    And los estados (éxito, aviso, error, información) se distinguen con ícono y texto además del color

  Scenario: Contraste accesible
    When se mide el contraste de cualquier texto informativo, etiqueta, placeholder o borde de control
    Then cumple WCAG AA (4,5:1 texto normal, 3:1 texto grande, íconos informativos y bordes de controles)
    And se cumple también sobre los materiales translúcidos con contenido claro y oscuro debajo

  Scenario: Escala tipográfica con tracking por tamaño
    When se revisa un título de página, un título de tarjeta, el cuerpo y una nota al pie
    Then cada uno usa un estilo de la escala con su tamaño, peso, leading y tracking propios
    And los títulos grandes tienen tracking negativo y los textos de 11–12 px tracking neutro o positivo

  Scenario: Inputs sin zoom en el celular
    Given el portal abierto en Safari de iOS
    When el paciente toca cualquier campo de texto
    Then el navegador no hace zoom automático (todo input táctil tiene 16 px o más)

  # --- Respuesta y movimiento ---

  Scenario Outline: Feedback al presionar
    When la profesional presiona (sin soltar) <elemento>
    Then el elemento cambia de aspecto en el mismo momento del pointerdown
    And al soltar o arrastrar fuera vuelve a su estado sin esperar el resultado

    Examples:
      | elemento                          |
      | un botón de cualquier variante    |
      | un ítem de la sidebar             |
      | una pestaña de la barra del portal|
      | una fila navegable de una tabla   |
      | una tarjeta tocable del portal    |

  Scenario: Hover solo con puntero
    Given un dispositivo táctil
    When el usuario toca un botón y levanta el dedo
    Then el botón no queda con el estilo de hover

  Scenario: Sheets y modales interrumpibles
    When la profesional abre un sheet y lo cierra antes de que termine de abrir
    Then el sheet vuelve desde la posición en la que estaba, sin saltos
    And sale por el mismo borde por el que entró

  Scenario: Menús desde su origen
    When la profesional abre un menú o popover
    Then aparece desde el control que lo abrió y se cierra hacia él

  Scenario: Indicadores que se deslizan
    When la profesional cambia de sección en la sidebar, de pestaña o de opción en un segmented control
    Then el indicador de selección se desplaza del ítem anterior al nuevo

  Scenario: Colapsar la sidebar sin deformar el contenido
    When la profesional colapsa o expande la sidebar
    Then el contenido del área de trabajo se reacomoda sin estirarse ni aplastarse
    And si vuelve a tocar el botón a mitad de la animación, la sidebar invierte desde donde estaba

  # --- Materiales ---

  Scenario: Chrome translúcido con borde solo al scrollear
    Given el portal abierto en el celular
    When el paciente scrollea el inicio
    Then el contenido se ve pasar difuminado por debajo del header y de la barra de pestañas
    And el borde/sombra del header aparece solo cuando hay contenido debajo

  # --- Accesibilidad del movimiento y los materiales ---

  Scenario: Movimiento reducido
    Given el sistema operativo tiene activado "reducir movimiento"
    When la profesional abre un sheet, un modal o un menú, o cambia de pestaña
    Then la transición es un fundido corto, sin desplazamiento, escala ni rebote
    And los gráficos aparecen sin animación de crecimiento

  Scenario: Transparencia reducida y más contraste
    Given el sistema operativo tiene activado "reducir transparencia" o "aumentar contraste"
    When el usuario abre cualquier pantalla con chrome translúcido
    Then el chrome es sólido y, con más contraste, tiene un borde visible

  Scenario: Navegación con teclado
    When la profesional navega solo con el teclado
    Then todo control interactivo muestra un anillo de foco del color de acento
    And los diálogos y sheets atrapan el foco, se cierran con Escape y devuelven el foco al disparador

  # --- Objetivos táctiles ---

  Scenario: Objetivos táctiles en móvil
    Given una pantalla de 390 px de ancho
    When el usuario usa el menú del panel, los sheets, los diálogos o la barra del portal
    Then cada control tocable mide al menos 44 x 44 px (incluidas las X de cierre)

  # --- Shell ---

  Scenario: Shell del panel en notebook
    Given una ventana de 1366 x 768
    When la profesional abre cualquier pantalla
    Then ve la sidebar con todos los grupos y el pie sin scroll
    And la sección activa se distingue por fondo, color e ícono, no solo por el color

  Scenario: Marca sin cambios
    When se abre el panel, el portal o el login
    Then la marca que se ve es la misma que antes de la HU ("Numa" con su logo)

  # --- No regresión ---

  Scenario: Sin cambios de funcionalidad
    When se ejecuta cualquier flujo existente (crear turno, cargar medición, enviar aviso, entrar al portal)
    Then el resultado, las validaciones y los datos guardados son los mismos que antes de la HU

  Scenario: Zona de imleticio sin cambios de archivo
    When se compara la rama contra main
    Then no hay cambios en alimentos/**, pacientes/[id]/planes/**, plantillas/** ni components/food-picker.tsx
    And esas pantallas siguen funcionando con los tokens y componentes nuevos
```

### 7.2 HU-017b a 017e (alto nivel; cada una se detalla en su afinado/SDD)

```gherkin
Feature: Migración de pantallas al lenguaje Apple

  Scenario: Calendario usable en el celular
    Given el calendario en una pantalla de 390 px
    When la profesional lo abre
    Then ve una vista de día (o de pocos días) legible, con los controles en un solo renglón
    And cambia de vista con un segmented control

  Scenario: Destructivas con mesura
    When la profesional ve una tarjeta con acciones (estudio ISAK, consulta, cálculo, turno)
    Then la acción destructiva no tiene el mismo peso visual que la principal
    And sigue pidiendo confirmación

  Scenario: Continuidad al mover ítems entre listas
    When la profesional marca una consulta como respondida o desactiva un servicio
    Then el ítem se ve salir hacia su nuevo grupo en vez de desaparecer

  Scenario: Ficha con métricas destacadas
    When la profesional abre la ficha de un paciente con mediciones
    Then el peso y las otras métricas de evolución se leen como números grandes con su unidad y variación

  Scenario: Portal como app
    Given el portal en un celular
    When el paciente toca una tarjeta del inicio
    Then la tarjeta responde al toque y navega a su sección
    And los sheets inferiores se pueden cerrar arrastrando hacia abajo, siguiendo el dedo

  Scenario: Diario con foto
    When el paciente agrega un registro con foto desde el celular
    Then puede elegir cámara o galería, ve una miniatura antes de enviar
    And el registro nuevo aparece en la lista con una transición que lo conecta con el formulario
```

---

## 8. Datos que se registran

Ninguno. Es una HU de presentación: no cambia `schema.prisma`, ni `packages/`, ni server
actions, ni consultas. La preferencia de la sidebar sigue en la cookie `nb-sidebar` existente.

---

## 9. Riesgos

| # | Riesgo | Impacto | Mitigación propuesta |
|---|---|---|---|
| R1 | **Zona de imleticio.** `alimentos/**`, `planes/**`, `plantillas/**` y `food-picker.tsx` usan `components/ui.tsx`, `components/primitives/*` y los tokens. Con HU-017a cambian de aspecto (color, tipografía, radios, press, materiales) **sin que nadie las revise**, y el PR #7 / HU-015 se va a mergear sobre componentes con otra API visual. Si 017a cambia firmas (props de `Button`, `Card`, variantes), rompe el código de imleticio. | alto | (1) 017a **no cambia firmas** de `ui.tsx` ni de los primitivos: solo estilos, más componentes nuevos opcionales. (2) Avisar a imleticio antes de mergear 017a (D11) y pasarle el diff de tokens. (3) Recorrido visual de esas pantallas en la verificación de 017a (sin tocar sus archivos). (4) `food-picker.tsx` tiene un popover propio con `shadow-md` (`food-picker.tsx:140`): queda con el estilo viejo hasta 017e. |
| R2 | **Conflictos de merge** con PR #7 (abierto) y con la rama de HU-015 en archivos compartidos (`globals.css`, `ui.tsx`, primitivos). | medio | Mergear 017a cuando PR #7 esté resuelto, o rebasar PR #7 después; coordinación en D11. |
| R3 | **PDFs.** `@react-pdf/renderer` no usa Tailwind ni CSS: tema propio en `lib/pdf-theme.ts` (hex de Notion) y fuente Inter embebida. Sin acción, pantalla y PDF quedan con estilos distintos. Blur, sombras y materiales no existen en PDF. | medio | D8. Si se alinean: solo paleta (tint como acento por defecto, grises fríos) y escala tipográfica; nada de materiales. El informe antropométrico va en 017c; el **PDF del plan es de la zona de imleticio** (HU-015) → 017e. El acento del PDF ya es configurable (`DEFAULT_PDF_ACCENT`). |
| R4 | **Performance del blur en móvil.** `backdrop-filter` en barras sticky de toda la altura fuerza composición en cada scroll; en Android de gama baja puede bajar de 60 fps. | medio | Blur solo en superficies chicas (header, tab bar, encabezado de pestañas), nunca en áreas grandes ni en listas; radio de blur moderado (20–24 px); medir en un Android de gama media; fallback sólido si no hay soporte. |
| R5 | **Contraste sobre translucidez.** El texto sobre un material cambia con lo que pasa debajo (una foto del diario, un gráfico). | medio | Materiales con 72–85 % de opacidad blanca (el contraste mínimo se calcula con el peor fondo), texto en `label`/`label-secondary` sólidos, peso mayor en etiquetas chicas; criterio de aceptación específico. |
| R6 | **Modo oscuro.** Activarlo duplica la verificación (contraste, gráficos, FullCalendar, colores de servicio, PDFs no cambian). | medio | Fuera de la primera ola (HU-017f opcional, D3). 017a deja los tokens con nombres semánticos para que dark sea solo valores. |
| R7 | **Tamaño del cambio.** 017a toca ~20 primitivos, `ui.tsx`, el shell y dos layouts, y cambia el aspecto de las ~25 pantallas a la vez. Revisión difícil. | alto | Partición de la sección 6; en 017a una página de muestra interna (solo en desarrollo) con todos los componentes y estados para revisar sin recorrer el sistema (D12). |
| R8 | **Peso de la librería de movimiento** y que todo componente animado sea cliente. | bajo | `LazyMotion`; press y hover en CSS; los server components que hoy renderizan `Card`/`Button` siguen siendo server (el press es CSS). |
| R9 | **Radix + animaciones de salida.** Con Motion, las salidas de Dialog/Sheet/Popover necesitan `forceMount` + `AnimatePresence`; se puede romper el foco/escape si se hace mal. | medio | La SDD define el patrón una vez en los primitivos; criterio de teclado en 017a. |
| R10 | **FullCalendar** no expone animaciones ni gestos; el segmented y la vista móvil se hacen alrededor de su toolbar o con toolbar propia. | bajo | Toolbar propia con la API de FullCalendar (`changeView`, `next`, `prev`) en 017b. |
| R11 | **Revisión de HU-002.** Se revierten decisiones validadas (D1 Notion, D2 acento neutro, D5 tipografía, D11 portal cálido). La memoria `design-system.md` describe el sistema Notion. | bajo | Este documento las lista; el orquestador actualiza la memoria al cerrar 017a. |
| R12 | **iOS Safari y `backdrop-filter`.** Necesita prefijo `-webkit-` (Autoprefixer ya está en el proyecto) y tiene bugs con `position: sticky` + `overflow`. | bajo | Probar en iPhone real o simulador en 017a y 017d. |

---

## 10. Fuera de alcance

- **Cambios de funcionalidad**: datos, reglas, validaciones, permisos, integraciones, textos del
  bot. Solo presentación, movimiento y orden de los elementos. (Ejemplos que serían funcionales y
  quedan fuera salvo decisión: autosave de notas CO3, arrastrar turnos para reprogramar, acciones
  por swipe.)
- **Zona de imleticio** (`alimentos/**`, `pacientes/[id]/planes/**`, `plantillas/**`,
  `components/food-picker.tsx`, `components/meals-editor.tsx`, PDF del plan) hasta HU-017e.
- `schema.prisma`, `packages/**`, `apps/bot/**`.
- **Nombre y logo** ("Numa"): no se cambian (D9).
- Reemplazar FullCalendar, Recharts, `@react-pdf/renderer`, Radix/shadcn o lucide-react.
- Migrar a Tailwind 4 (sigue la decisión D7 de HU-002), salvo que la SDD de 017a demuestre que es
  necesario.
- Sonido y haptics (§13): no aportan en un panel; la Vibration API no existe en iOS Safari.
- Transiciones entre páginas (View Transitions de Next, experimental).
- Búsqueda global / paleta de comandos.
- Modo oscuro, salvo D3 (HU-017f).

---

## 11. Notas de implementación (mínimas; el detalle lo escribe el `architect`)

- Todo en `apps/web`. Tokens nuevos con **nombres semánticos** (rol, no color) y conservando los
  nombres shadcn que ya consumen las pantallas (`primary`, `muted-foreground`, `border`…) mapeados a
  los valores nuevos, para que 017a no obligue a tocar cada página ni la zona de imleticio.
- No cambiar las **firmas** de `components/ui.tsx` ni de los primitivos (R1). Los componentes nuevos
  (segmented, lista agrupada, métrica) se agregan al lado.
- Press y hover en CSS (Tailwind: `active:` y variante `hover` limitada a `@media (hover: hover)`,
  p. ej. con `future.hoverOnlyWhenSupported` de Tailwind 3.4). Springs y gestos con la librería que
  se decida (D6).
- Reemplazar la regla global de reduced-motion (`globals.css:91-99`) por variantes por componente;
  agregar `prefers-reduced-transparency` y `prefers-contrast`.
- Sidebar: animar el ancho del slot en vez del FLIP con `scaleX` (`app-sidebar.tsx:40-62`).
- Fuente: si se queda Inter, cargarla con el eje `opsz` desde `next/font/google`; los PDF siguen
  con los `.woff` de `public/fonts` (sin `opsz`).
- Verificación por HU: `typecheck` de `apps/web`; recorrido de cada ruta del alcance a 1366 px, 768
  px y 390 px; Safari iOS (o simulador) para materiales, zoom de inputs y gestos; reduced-motion,
  reduced-transparency y más contraste activados en el SO; medición de contraste de los tokens
  (incluido sobre materiales); `git diff main --stat` sin archivos de la zona de imleticio.
- Datos y WhatsApp: no hace falta escribir en la base para verificar; si algún flujo de prueba
  escribe (crear turno, enviar aviso), datos propios borrados por id y **nunca** difusión ni envíos
  reales (reglas de `AGENTS.md`).
- No correr `next build` con `next dev` levantado.
- Al cerrar 017a, el orquestador actualiza la memoria `design-system.md` (hoy describe Notion).

---

## 12. Dudas para validar con el usuario

Cada una con una recomendación. Ninguna está decidida.

- **D1 — Color de acento.** Opciones: (a) **verde de la marca** (`#1F7A55`, derivado del logo
  "Numa", 5,3:1); (b) **azul de sistema** (`#0066CC`, el *tint* clásico de Apple), con el verde solo
  en el logo; (c) seguir neutro (negro) como en HU-002.
  *Recomendación: (a) verde*: le da identidad al sistema, conecta con nutrición y con el logo, y
  Apple usa el tint de cada app (no siempre azul). Costo: el verde de "éxito" se parece; se
  resuelve con ícono + texto (ya es regla) y un verde de éxito distinto.
- **D2 — Portal cálido.** HU-002 decidió un tono más cálido para el portal (D11). ¿Se conserva?
  *Recomendación: conservar el cálido solo en el fondo agrupado del portal (`#FBFAF7`)* y usar la
  misma paleta fría del panel para textos, materiales y controles, para que sean el mismo sistema.
- **D3 — Modo oscuro.** ¿Se quiere? ¿En el panel, en el portal o en los dos?
  *Recomendación: sí pero después, como HU-017f opcional, siguiendo la preferencia del sistema
  operativo sin selector*. 017a deja los tokens listos. El portal es donde más se nota (pacientes
  que lo abren de noche).
- **D4 — Tipografía.** (a) **Inter variable con eje óptico** en todo; (b) **pila del sistema**
  (SF en Apple, Segoe en Windows, Roboto en Android) con Inter de respaldo; (c) SF Pro descargada:
  **no** se puede (la licencia de SF solo permite usarla en plataformas Apple).
  *Recomendación: (a) Inter* por consistencia entre dispositivos y con los PDF. ¿Qué computadora
  usa la nutricionista (Mac o Windows)? Si es Mac y el usuario quiere "que se vea igual a Apple",
  (b) es aceptable.
- **D5 — Profundidad en el portal móvil.** Al abrir un sheet inferior, ¿el fondo "se aleja"
  (escala 0,98 y se oscurece, como iOS) o solo se oscurece?
  *Recomendación: solo oscurecer* en la primera versión; la escala del fondo es costosa en Android
  y suma poco.
- **D6 — Librería de animación.** (a) **Motion** (springs reales, gestos, indicadores que se
  deslizan, salidas de Radix); (b) **solo CSS** + WAAPI (sin dependencia; sin gestos ni
  interrupción con velocidad).
  *Recomendación: (a) Motion*, con press/hover en CSS. Sin una librería de springs no se cumplen
  §3–§6 del skill, que es la mitad del pedido.
- **D7 — Gestos táctiles.** ¿Qué gestos entran? Propuesta de la sección 5.7: arrastrar para cerrar
  sheets (portal y menú móvil del panel) **sí**; swipe en filas, swipe entre pestañas y pull to
  refresh **no**; swipe de semana en el calendario móvil **opcional**.
  *Recomendación: la propuesta tal cual.*
- **D8 — PDFs.** ¿El informe antropométrico (y después el del plan) adopta la paleta y la escala
  tipográfica nuevas?
  *Recomendación: sí, solo paleta y tipografía* (no hay materiales en papel): el informe en
  HU-017c; el PDF del plan en HU-017e con imleticio. El acento personalizable del PDF se mantiene.
- **D9 — Marca "Numa".** El panel y el portal dicen "Numa" (cambio de imleticio en `ae7edcb`).
  ¿Es el nombre definitivo del producto? ¿Se conserva tal cual en el rediseño?
  *Recomendación: no tocar el nombre en esta HU*; solo recortar el margen interno del PNG del logo
  (o pedir una versión SVG) para que se vea nítido y alineado (S8). Si el nombre cambia, es otra
  tarea.
- **D10 — Orden de las HU.** Propuesta: 017a fundaciones → 017c pacientes y consultas → 017b agenda
  y gestión → 017d portal → 017e planes/alimentos (→ 017f oscuro).
  *Recomendación: ese orden* (lo más usado en consulta primero). Alternativa: portal antes que
  agenda, si la prioridad es la experiencia del paciente.
- **D11 — Coordinación con imleticio.** 017a cambia el aspecto de sus pantallas sin tocar sus
  archivos (R1, R2). ¿Se le avisa y se espera a que PR #7 / HU-015 se mergeen antes de mergear 017a?
  ¿HU-017e la hace él, nosotros, o en conjunto?
  *Recomendación: avisarle ya, mergear 017a después de PR #7, y que 017e la haga imleticio con el
  sistema nuevo* (conoce su código), con revisión cruzada.
- **D12 — Página de muestra.** En HU-002 se decidió no hacer prototipo (D18). El skill insiste en
  prototipar el movimiento ("una demo interactiva vale más que un millón de diseños estáticos",
  §17). ¿Se arma en 017a una página interna (solo en desarrollo, fuera de la navegación) con todos
  los componentes, estados y animaciones para aprobar el lenguaje antes de migrar pantallas?
  *Recomendación: sí*, es barata y reduce el riesgo R7.
- **D13 — Destructivas a menú "…".** ¿Se aprueba mover "Borrar estudio", "Borrar consulta" y
  "Borrar cálculo" a un menú de más opciones (con confirmación igual que hoy)? Cambia dónde está el
  botón, no lo que hace.
  *Recomendación: sí.*
- **D14 — Calendario en el celular.** ¿Vista por defecto **día** en el celular (y semana en
  notebook)? ¿O 3 días?
  *Recomendación: día*, con el segmented para cambiar.
- **D15 — Autosave de notas de consulta (CO3).** ¿Se quiere que las notas se guarden solas? Es un
  cambio de comportamiento: por defecto queda **fuera**.
  *Recomendación: fuera de esta HU*; si interesa, HU aparte.

## Resoluciones (2026-10-03)

- **D1: acento azul de sistema** (`#0066CC`, *tint* clásico de Apple, verificar contraste AA en cada
  uso); el verde queda solo en el logo. Donde la propuesta de la sección 5.2 usa el verde de marca
  como acento, leer el azul. El verde de "éxito" sigue siendo un color semántico aparte.
- **D4: Inter variable** (con eje óptico) en todo el sistema y en los PDF.
- **D6 y D12: Motion** para springs, gestos e interrupción (press/hover en CSS), y en HU-017a una
  **página demo interna** (solo desarrollo, fuera de la navegación) con todos los componentes,
  estados y animaciones, para aprobar el lenguaje antes de migrar pantallas.
- **D2, D3, D5, D7–D11, D13–D15:** se aceptan las recomendaciones tal como están escritas arriba
  (portal cálido solo en el fondo; modo oscuro después como HU-017f siguiendo el sistema; sheets
  solo oscurecen el fondo; arrastrar para cerrar sheets sí, swipe en filas no; informe PDF con la
  paleta y tipografía nuevas en 017c; no tocar "Numa"; orden a → c → b → d → e (→ f); avisar a
  imleticio, mergear 017a después del PR #7 y que 017e la haga imleticio; destructivas a menú "…";
  calendario móvil en vista día; sin autosave).
- **Partición:** esta HU se valida como paraguas y se implementa por partes (HU-017a … HU-017f),
  cada una con su SDD, implementación y revisión.
