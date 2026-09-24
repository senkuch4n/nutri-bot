# HU-002 — Rediseño de la UX/UI: sistema de diseño empresarial y minimalista

**Como** profesional (nutricionista),
**quiero** que el panel, el portal del paciente y las pantallas de entrada tengan un diseño
empresarial, sobrio y minimalista, pensado para trabajar con muchos datos,
**para que** el sistema sea cómodo de usar durante la consulta, se vea profesional frente a los
pacientes y las pantallas nuevas (consulta, calculadora, SARA 2, plan contra objetivo) se
puedan sumar sin que la interfaz se vuelva engorrosa.

Origen: pedido directo del usuario (2026-09-23): "Quiero refactorizar toda la UX/UI; si hay que
cambiar todo, se cambia, antes de que se vuelva engorroso. A la nutricionista le gusta algo
empresarial y minimalista." Se hace **antes** de la HU-003 (Épica 30) y de las Épicas 18/19/20/23,
que suman las pantallas con más datos del sistema.

La HU tiene dos partes: **(A) un sistema de diseño nuevo** (tokens, tipografía, componentes,
shell de navegación) y **(B) la migración de todas las pantallas** a ese sistema. Hay una
propuesta de partición en varias HU en la duda D8.

---

## Contexto

### Qué existe hoy

**Sistema visual "inspirado en spring.io"** (commit `ab6387f`, 2026-08-30), aplicado a todo
`apps/web`:

- **Tokens** en `apps/web/tailwind.config.ts`: `ink` (.soft / .faint), `leaf` (verde hoja: DEFAULT,
  .bright, .deep, .tint), `mint` (fondo del body), `paper`, `line`, `link`, alias histórico `brand`
  apuntando al verde; `rounded-card` (12px), `shadow-card` / `shadow-lift`, animación
  `float-slow`. Colores en hex fijos, sin variables CSS (no hay base para modo oscuro:
  0 usos de `dark:` en el código).
- **Tipografía** en `apps/web/src/app/layout.tsx`: Inter (`--font-sans`) + Space Grotesk en
  negrita para títulos (`--font-display`, `.font-display` con `ss01`).
- **`apps/web/src/app/globals.css`**: body `bg-mint`; botones `.btn-solid` / `.btn-outline` /
  `.btn-leaf` (rectos, `border-2`, MAYÚSCULAS con tracking 0.08em, se rellenan al hover);
  microanimaciones `.press` y `.reveal` (con `prefers-reduced-motion`); tema de **FullCalendar**
  (toolbar con botones rectos en mayúsculas, horas no laborables con rayado diagonal verde).
- **Componentes** (`apps/web/src/components/`):
  - `ui.tsx`: `cn`, `Card`, `PageHeader`, `SectionLabel`, `Button` (size sm/md), `ButtonLink`,
    `StatTile`, `Field`, `inputClass`, `Input`, `Select`, `Textarea`, `Badge` (cuadrado,
    mayúsculas).
  - `brand.tsx`: `Wordmark` + `LeafMark` (logo "NutriBot" con hoja), `Eyebrow`, `SpringShapes` y
    `CornerTriangle` (formas decorativas SVG), `GoogleG`.
  - `nav.tsx` + `nav-links.tsx`: barra **superior** sticky con 10 enlaces en fila (Calendario,
    Servicios, Disponibilidad, Pacientes, Alimentos, Plantillas, Pagos, Asistente, Avisos,
    Ajustes), subrayado verde en el activo; en mobile los enlaces pasan a una segunda fila con
    scroll horizontal. Botón "SALIR" con borde grueso.
  - `modal.tsx`: modal recto con borde y backdrop-blur.
  - `evolution-chart.tsx` y `comparative-chart.tsx`: gráficos con **MUI X Charts** (arrastra
    `@mui/material` + Emotion solo para esto).
  - `meals-editor.tsx` (editor de comidas del plan), `auto-refresh.tsx`.
- **46 archivos** de `apps/web/src` usan clases o componentes del sistema actual (`leaf`, `mint`,
  `font-display`, `btn-*`, `SpringShapes`…).
- Layouts: `(panel)/layout.tsx` (Nav + `main` con `max-w-6xl`, ~1150px de ancho útil),
  `(portal)/layout.tsx` (header propio con `Wordmark` y enlaces Inicio / Evolución / Diario /
  Salir, `max-w-2xl`; **"Plan" no está en la navegación**, solo se llega desde una tarjeta de
  inicio).
- No hay `loading.tsx`, `error.tsx` ni `not-found.tsx` en ninguna ruta: una página lenta o un
  error muestran el comportamiento por defecto de Next.
- Las confirmaciones destructivas usan `window.confirm()` nativo (borrar plan, borrar plantilla,
  enviar difusión en avisos).
- El feedback de guardado es texto inline al lado del botón ("Guardando…", "✓ Guardado", "Datos
  inválidos"), repetido en cada formulario.
- La ficha del paciente (`/pacientes/[id]`, 235 líneas) apila 7 tarjetas en una sola columna:
  Datos, Datos para cálculos (HU-001), Ficha clínica, Evolución (con gráficos), Diario alimentario,
  Planes nutricionales, Historial de turnos. Es la pantalla que más se usa en consulta y la que
  más va a crecer.
- El único listado en tabla es el de alimentos (`foods-list.tsx`, `min-w-[640px]`); el resto son
  listas de tarjetas o filas.
- **PDF del plan** (`apps/web/src/lib/plan-pdf.tsx`, `@react-pdf/renderer`): estilo propio, con
  logo, color de acento y pie de página configurables en `/ajustes`.

**Inventario de superficies** (22 `page.tsx` + modales y secciones):

| Superficie | Rutas | Uso |
|---|---|---|
| Panel — Agenda | `/` (calendario + modales de nuevo turno y detalle de turno), `/disponibilidad`, `/servicios` | Computadora |
| Panel — Pacientes | `/pacientes`, `/pacientes/[id]` (7 secciones), `/pacientes/[id]/planes/[planId]` | Computadora, en consulta |
| Panel — Nutrición | `/alimentos`, `/alimentos/nuevo`, `/alimentos/[id]`, `/plantillas`, `/plantillas/[id]` | Computadora |
| Panel — Gestión | `/pagos`, `/avisos`, `/asistente`, `/ajustes`, `/ajustes/whatsapp` | Computadora |
| Portal del paciente | `/portal`, `/portal/plan`, `/portal/evolucion`, `/portal/diario`, pantalla "sin acceso" del layout | **Celular** |
| Entrada | `/login`, `/inicio` (landing pública con hero decorativo, "Cómo funciona", 6 features) | Solo la profesional |

### Por qué hace falta

El lenguaje visual actual es de marketing (formas grandes que sangran por los bordes, títulos
en grotesca negrita, botones en mayúsculas con borde grueso, fondo menta) y es lo opuesto a
"empresarial y minimalista". Además tiene problemas prácticos para lo que viene:

- La barra superior con 10 enlaces ya no entra bien y las épicas nuevas suman secciones.
- El ancho `max-w-6xl` y las tarjetas con mucho aire no sirven para tablas de ~40 nutrientes
  (SARA 2), calculadoras con varias fórmulas lado a lado o barras de adecuación.
- `text-ink-faint` tiene contraste ~3:1, por debajo de AA para texto de contenido.
- No hay componentes para tabla de datos, pestañas, toasts, diálogos de confirmación, estados de
  carga ni números con unidad: cada pantalla nueva los resolvería a mano.

### Qué es lo nuevo

1. Un **sistema de diseño** único y documentado: tokens (color, tipografía, espaciado, radios,
   bordes, sombras) como variables, y un set de componentes pensado para interfaces densas.
2. Un **shell de navegación** del panel que escale a más secciones.
3. La **migración de todas las superficies** del inventario al sistema nuevo, sin dejar rastros
   del sistema "Spring-inspired".
4. **Reordenamientos de flujo** puntuales donde hoy el uso es incómodo (listados abajo, en
   "Diseño UX"), **sin cambiar funcionalidad**: lo que hoy se puede hacer se sigue pudiendo hacer,
   con los mismos datos y las mismas reglas.

---

## Criterios de aceptación

```gherkin
Feature: Rediseño de la UX/UI con un sistema de diseño empresarial y minimalista

  Background:
    Given la profesional está logueada en el panel
    And la base de desarrollo tiene pacientes, turnos, planes y alimentos cargados

  # --- Sistema de diseño ---

  Scenario: Un único sistema de tokens
    When se revisa el código de apps/web
    Then los colores, tipografías, radios y sombras salen de tokens definidos en un solo lugar
    And no queda ningún uso de los tokens o componentes del sistema anterior
        (leaf, mint, font-display, btn-solid, btn-outline, btn-leaf, SpringShapes,
         CornerTriangle, Eyebrow, Space Grotesk)

  Scenario: Aspecto empresarial y minimalista
    When la profesional recorre cualquier pantalla del panel
    Then no ve formas decorativas, ni textos de botones en mayúsculas espaciadas,
         ni bordes gruesos
    And el color de acento se usa solo para la acción principal, el estado activo
        y la información que requiere atención

  Scenario: Contraste accesible
    When se mide el contraste de cualquier texto de contenido, etiqueta o placeholder informativo
    Then cumple WCAG AA (4,5:1 para texto normal, 3:1 para texto grande y bordes de controles)

  Scenario: Navegación con teclado
    When la profesional navega el panel solo con el teclado
    Then todos los controles interactivos reciben foco visible
    And los diálogos atrapan el foco y se cierran con Escape

  Scenario: Movimiento reducido
    Given el sistema operativo tiene activado "reducir movimiento"
    When la profesional usa el panel o el paciente usa el portal
    Then no se reproducen animaciones de transición

  # --- Shell del panel ---

  Scenario: Navegación del panel
    When la profesional abre cualquier pantalla del panel en una computadora
    Then ve la navegación principal con todas las secciones actuales, agrupadas
    And la sección en la que está se distingue sin depender solo del color
    And puede cerrar sesión desde el shell

  Scenario: Panel en pantalla de notebook
    Given una ventana de 1366 x 768
    When la profesional abre la ficha de un paciente
    Then la navegación, el encabezado del paciente y el primer bloque de datos
         se ven sin scroll horizontal

  Scenario: Panel en pantalla chica
    Given una ventana de 768 px de ancho o menos
    When la profesional abre el panel
    Then la navegación se colapsa en un menú que se abre con un botón
    And ninguna pantalla tiene scroll horizontal fuera de las tablas

  # --- Funcionalidad sin cambios ---

  Scenario Outline: Cada flujo existente sigue funcionando
    When la profesional <acción>
    Then el resultado en la base es el mismo que antes del rediseño

    Examples:
      | acción                                                              |
      | da un turno nuevo desde el calendario                               |
      | abre el detalle de un turno y cambia su estado                      |
      | agrega un bloque de disponibilidad y una excepción                  |
      | crea, edita, activa y desactiva un servicio                         |
      | busca un paciente y edita sus datos, datos para cálculos y ficha clínica |
      | carga una medición de evolución y ve los gráficos                   |
      | crea un plan, lo edita con el editor de comidas y genera el PDF     |
      | crea y edita un alimento                                            |
      | crea, edita y borra una plantilla                                   |
      | registra un pago                                                    |
      | reintenta un aviso fallido y envía una difusión                     |
      | le pregunta algo al asistente                                       |
      | cambia ajustes generales, de Google Calendar y del PDF              |
      | vincula WhatsApp desde /ajustes/whatsapp                            |

  Scenario: El bot no cambia
    When un paciente conversa con el bot por WhatsApp
    Then recibe exactamente los mismos mensajes que antes del rediseño

  Scenario: El PDF del plan no cambia
    When la profesional genera el PDF de un plan
    Then el PDF sale igual que antes del rediseño (ver D12)

  # --- Feedback y estados ---

  Scenario: Guardado exitoso
    When la profesional guarda cualquier formulario del panel
    Then mientras se procesa el botón queda deshabilitado e indica "Guardando…"
    And al terminar ve una confirmación de éxito con el mismo componente en todo el panel

  Scenario: Error al guardar
    When el servidor rechaza un guardado
    Then la profesional ve el mensaje de error junto al campo o al formulario, en tono de error
    And lo que había escrito no se pierde

  Scenario: Confirmación de una acción destructiva
    When la profesional toca "Borrar" en un plan o una plantilla, o "Enviar" en una difusión
    Then ve un diálogo de confirmación del sistema de diseño (no el confirm() del navegador)
    And el diálogo explica la consecuencia y el botón destructivo se distingue del de cancelar
    And "Cancelar" o Escape cierran el diálogo sin hacer nada

  Scenario: Página cargando
    When una pantalla del panel tarda en cargar sus datos
    Then se ve un estado de carga con la forma del contenido, sin saltos de layout al terminar

  Scenario: Error inesperado o ruta inexistente
    When una pantalla falla o la profesional abre una URL que no existe
    Then ve una página del sistema de diseño con el problema y un enlace para volver

  Scenario: Listado vacío
    Given una sección sin datos (sin pacientes, sin pagos, sin avisos, sin plantillas…)
    When la profesional la abre
    Then ve un estado vacío que explica qué va ahí y ofrece la acción para crear el primero,
         si existe

  # --- Datos densos ---

  Scenario: Números legibles en tablas
    When la profesional ve una tabla con valores numéricos (alimentos, pagos, mediciones)
    Then los números usan cifras de ancho fijo, van alineados a la derecha y muestran su unidad
    And el encabezado de la tabla queda visible al hacer scroll dentro de ella

  Scenario: Los componentes cubren las pantallas que vienen
    When el architect especifique la calculadora, la base SARA 2 o el plan contra objetivo
    Then encuentra en el sistema tabla de datos, pestañas, campo numérico con unidad,
         barra de adecuación y tema de gráficos, sin tener que crearlos

  # --- Ficha del paciente ---

  Scenario: Encabezado persistente del paciente
    When la profesional abre la ficha de "Ana"
    Then arriba de todo ve el nombre, la edad, el teléfono con el acceso a WhatsApp,
         el próximo turno y las alertas clínicas
    And ese encabezado sigue visible mientras navega las secciones de la ficha

  Scenario: Secciones de la ficha sin scroll interminable
    When la profesional quiere ir a "Planes nutricionales" de "Ana"
    Then llega en un clic, sin recorrer todas las tarjetas anteriores (ver D14)

  # --- Portal del paciente ---

  Scenario: Portal en el celular
    Given un celular de 360 px de ancho
    When el paciente abre el portal con su link
    Then ve inicio, plan, evolución y diario sin scroll horizontal
    And los controles táctiles miden al menos 44 x 44 px

  Scenario: Plan accesible desde la navegación del portal
    When el paciente está en cualquier pantalla del portal
    Then puede ir a su plan desde la navegación, sin volver al inicio

  Scenario: Portal sin acceso
    When alguien abre el portal sin un link válido
    Then ve la explicación de cómo pedir el link por WhatsApp con el sistema nuevo

  # --- Entrada ---

  Scenario: Login
    When la profesional abre /login o /inicio sin sesión
    Then ve una pantalla sobria con el botón "Entrar con Google"
    And al entrar llega al calendario como hoy
```

---

## Datos que se registran

No aplica: la HU **no cambia el esquema** ni los datos. Si se decide que la profesional pueda
elegir modo oscuro o densidad desde el panel (D4, D6), esa preferencia se guardaría en el
navegador o en `Professional`; lo define el `architect` según la respuesta.

---

## Diseño UX

### Principios (objetivos UX)

1. **Sobrio y neutro**: fondo blanco o gris muy claro, texto casi negro, grises para jerarquía,
   **un solo color de acento** (ver D2). Nada decorativo.
2. **Los datos son el protagonista**: jerarquía por tamaño y peso tipográfico, no por color ni
   por cajas. Bordes de 1px en lugar de sombras marcadas; radios chicos (6-8px).
3. **Denso pero legible**: pensado para una computadora durante la consulta. Tablas compactas,
   formularios en grilla, cifras tabulares, unidades siempre visibles.
4. **Consistencia**: un componente por necesidad (un solo modo de confirmar, de mostrar éxito, de
   mostrar un estado vacío).
5. **Texto en caso oración** en botones, títulos y etiquetas ("Guardar cambios", no
   "GUARDAR CAMBIOS").
6. **Accesible**: AA de contraste, foco visible, estados que no dependen solo del color.

### Fundaciones propuestas (a validar en D1, D2, D5)

- **Color**: escala de grises neutra + acento (verde sobrio o azul/gris, según D2) + colores
  semánticos (éxito, advertencia, error, información). Todo como variables CSS, así el modo
  oscuro queda posible aunque no entre en esta HU.
- **Tipografía**: una sola familia sans para todo (Inter u otra, D5), con cifras tabulares en
  tablas y números. Se elimina Space Grotesk.
- **Escala**: tamaños de texto y espaciados fijos del sistema; se evita el `px` suelto en páginas.
- **Iconos**: un set de iconos de línea único y coherente (hoy hay iconos inline sueltos en la
  landing).
- **Gráficos**: paleta y estilo de ejes y tooltips alineados al sistema, para MUI X Charts y para
  FullCalendar (que se re-tematiza, no se reemplaza).

### Componentes del sistema

Los que existen se rediseñan manteniendo el nombre donde tenga sentido; los nuevos se suman
porque las pantallas actuales o las que vienen los necesitan.

| Componente | Hoy | Para qué |
|---|---|---|
| Button (primario, secundario, fantasma, destructivo; tamaños) | Existe | Acciones |
| Input, Select, Textarea, Field (label + ayuda + error) | Existen | Formularios |
| Checkbox, Switch, Radio / segmented control | Sueltos o no existen | Pausar bot, activar servicio, opciones cortas |
| Input numérico con unidad (kg, cm, %, kcal, g) | No | Evolución, alimentos, calculadora |
| Card / Section con título y acciones | Existe (`Card` + `SectionLabel`) | Agrupar |
| PageHeader (título, subtítulo, acción principal, volver) | Existe | Encabezado de cada pantalla |
| Tabs | No | Ficha del paciente, ajustes, SARA 2 |
| Tabla de datos (encabezado fijo, orden, números a la derecha, fila clickeable, vacío) | Solo alimentos, a mano | Alimentos, pagos, pacientes, mediciones, SARA 2 |
| Badge de estado | Existe (mayúsculas) | Estados de turno, pago, aviso |
| Stat / KPI | Existe (`StatTile`) | Resúmenes |
| Alert / Callout (info, advertencia, error) | A mano | Alertas clínicas, faltantes de HU-001 |
| Dialog (modal) y AlertDialog (confirmación destructiva) | `Modal` + `confirm()` nativo | Formularios cortos, confirmar borrados |
| Sheet (panel lateral) | No | Detalle de turno o de alimento sin salir de la lista (ver reordenamientos) |
| Toast | No | Éxito/error de guardado |
| Empty state | A mano en cada lista | Listas vacías |
| Skeleton / estado de carga | No | `loading.tsx` |
| Barra de progreso / adecuación (valor vs. objetivo, con %) | No | Plan contra objetivo (Épica 23) |
| Menú desplegable y tooltip | No | Acciones por fila, ayudas cortas |

### Shell del panel (propuesta, ver D3)

**Sidebar izquierda fija** en computadora, colapsable a íconos, con las secciones agrupadas:

- **Agenda**: Calendario, Disponibilidad, Servicios
- **Pacientes**: Pacientes
- **Nutrición**: Alimentos, Plantillas
- **Gestión**: Pagos, Avisos
- **Herramientas**: Asistente
- Abajo: Ajustes, estado del bot de WhatsApp (conectado / pausado / desconectado, en chico) y
  la cuenta con "Cerrar sesión".

Área de contenido **más ancha** que la actual (el `max-w-6xl` limita las tablas), con un ancho
de lectura más angosto solo para formularios. En pantallas ≤ 768 px la sidebar pasa a un menú
que se abre con un botón.

Alternativa: barra superior con menús agrupados (D3).

### Portal del paciente

- Mismo sistema de tokens, con tono más cálido si se decide (D11), **mobile-first**.
- Navegación: **Inicio, Plan, Evolución, Diario** (se suma Plan) + "Salir". Propuesta: barra de
  pestañas fija abajo en el celular, arriba en pantallas grandes.
- Textos y flujos de acceso por link (pedido por WhatsApp) sin cambios.

### Login y landing

- `/login`: pantalla simple, centrada, marca + "Entrar con Google".
- `/inicio`: la landing actual es de marketing y solo la ve la profesional antes de entrar. Se
  propone reducirla a la misma pantalla sobria de login (ver D10).

### Reordenamientos de flujo propuestos

Todos sin cambio de funcionalidad. Cada uno se valida en D14/D15; los que no se aprueben quedan
solo con el cambio visual.

1. **Ficha del paciente**: encabezado persistente (nombre, edad, teléfono + WhatsApp, próximo
   turno, alertas clínicas) y el contenido en **pestañas**: *Resumen* (contadores de turnos,
   datos para cálculos, últimas mediciones), *Datos y ficha clínica*, *Evolución*, *Planes*,
   *Diario*, *Turnos*. Deja lugar para la pestaña *Consultas* de la HU-003.
2. **Pacientes (lista)**: pasa a tabla (nombre, teléfono, último turno, próximo turno) con la
   búsqueda actual.
3. **Pagos**: tabla con filtros visibles y totales arriba.
4. **Calendario**: el detalle de un turno se abre en un panel lateral en vez de un modal que
   tapa el calendario; los contadores del día/semana quedan en una franja compacta.
5. **Alimentos**: tabla densa con encabezado fijo; alta y edición en panel lateral o página,
   según lo que convenga a la base SARA 2.
6. **Ajustes**: secciones en pestañas o índice lateral (General, Bot de WhatsApp, Google
   Calendar, PDF) en vez de tarjetas apiladas.
7. **Confirmaciones**: los tres `confirm()` nativos pasan a diálogos del sistema.
8. **Portal**: "Plan" en la navegación.

### Estados y feedback

- **Guardar**: botón deshabilitado con "Guardando…" + toast "Cambios guardados" (o el feedback
  inline actual con el componente nuevo; D17). Errores de validación junto al campo; errores del
  servidor ("Datos inválidos", "No se pudo guardar. Probá de nuevo.") en un callout arriba del
  formulario o en toast de error.
- **Carga**: skeletons por pantalla (`loading.tsx`).
- **Error / 404**: página propia con "Algo salió mal" / "No encontramos esta página" y enlace
  "Volver al calendario" (panel) o "Volver al inicio" (portal).
- **Vacíos**: título + una línea de explicación + acción ("Todavía no hay pagos registrados").
- **Destructivo**: diálogo "¿Borrar este plan?" / "Esta acción no se puede deshacer." /
  [Cancelar] [Borrar plan].

### Bot de WhatsApp

No interviene. No cambia ningún mensaje.

---

## Propuesta de partición (a decidir en D8)

La HU completa toca las 22 páginas, los componentes y los estilos de terceros. Se propone
partirla en HU encadenadas, cada una revisable por separado:

| HU | Alcance | Por qué en este orden |
|---|---|---|
| **HU-002a — Fundaciones y shell** | Tokens, tipografía, componentes base de la tabla de arriba, sidebar, layouts de panel y portal, `loading`/`error`/`not-found`, tema de FullCalendar y de gráficos, login e `/inicio` | Sin esto no se puede migrar nada. Al cambiar `ui.tsx` todas las páginas quedan "parcialmente" renovadas |
| **HU-002b — Pacientes** | Lista, ficha (con pestañas y encabezado persistente), detalle del plan, evolución y gráficos, diario, tarjeta de HU-001 | La pantalla que más se usa en consulta y la base de la HU-003 |
| **HU-002c — Agenda y gestión** | Calendario y sus modales, disponibilidad, servicios, pagos, avisos, asistente, ajustes y WhatsApp | Pantallas más estables, cambios mayormente visuales |
| **HU-002d — Nutrición y portal** | Alimentos, plantillas, editor de comidas y portal completo | Alimentos se rehace con la Épica 20; puede ir justo antes |

Entre HU-002a y la última, el panel convive con pantallas a medio migrar (ver D9).

---

## Fuera de alcance

- **Cualquier cambio de funcionalidad**: no se agregan, quitan ni cambian datos, reglas,
  validaciones, permisos ni integraciones. Solo presentación y orden de los elementos.
- **Esquema de la base** (`schema.prisma`) y **`packages/`** en general.
- **El bot de WhatsApp** y sus textos.
- **El PDF del plan** (`plan-pdf.tsx`): sigue igual, con su personalización de `/ajustes` (salvo
  lo que se decida en D12).
- Las **pantallas nuevas** de la Ronda 2 (consulta, calculadora, SARA 2, plan contra objetivo):
  esta HU solo deja listos los componentes que van a necesitar.
- **Modo oscuro** como funcionalidad visible (los tokens quedan preparados), salvo que D4 diga lo
  contrario.
- **Búsqueda global / paleta de comandos** (Ctrl+K), salvo que D16 diga lo contrario.
- Reemplazar FullCalendar, MUI X Charts o `@react-pdf/renderer` por otras librerías (se
  re-tematizan).
- Rediseño del **nombre o logo** "NutriBot" más allá de adaptarlo al sistema (ver D13).
- Internacionalización y textos en otro idioma.
- Emails (no hay).

---

## Notas de implementación

- Tokens como **variables CSS** consumidas por Tailwind (hoy Tailwind 3.4), para que un modo
  oscuro futuro sea un cambio de valores y no de clases.
- Si se adopta **shadcn/ui** (D7): trae Radix para diálogos, tabs, menús, toasts y sheets, con
  foco y teclado resueltos, y encaja con Tailwind + variables CSS. Hay que ver qué versión
  soporta Tailwind 3 o si conviene pasar a Tailwind 4 en la misma HU de fundaciones. El skill
  `skills/ui.txt` del catálogo ya asume Shadcn/UI.
- `@mui/material` + Emotion están solo por MUI X Charts: el tema de los gráficos tiene que seguir
  los tokens nuevos (o el `architect` evalúa otra librería de gráficos, fuera de esta HU salvo
  decisión explícita).
- Todo el trabajo es en `apps/web`. No se tocan server actions ni consultas: si un reordenamiento
  obliga a mover un componente, se mueve con su lógica tal cual.
- Verificación: `typecheck` de `apps/web`, recorrido manual de cada ruta del inventario (panel a
  1366 px y a 768 px, portal a 360 px), `grep` de que no quedan tokens del sistema anterior, y
  prueba de cada flujo del Scenario Outline. Las pruebas que escriban en la base usan datos
  propios borrados por id (regla de `AGENTS.md`). Nada de mensajes de WhatsApp reales (difusión
  de avisos incluida).
- No correr `next build` con `next dev` levantado en `apps/web` (corrompe `.next`).
- La memoria del proyecto `design-system.md` describe el sistema viejo: el orquestador la
  actualiza al cerrar la HU.

---

## Dudas para validar con el usuario

- **D1 — Referencias visuales.** ¿Qué productos le gustan a la nutricionista por cómo se ven?
  Opciones típicas de "empresarial y minimalista": Linear, Stripe Dashboard, Notion, Google
  Workspace / Calendar, Vercel, Attio. ¿NutriDesk (https://nutrideskapp.com/) es una referencia
  **a seguir** o solo de funcionalidades? ¿Hay algo que **no** le guste de lo actual además de lo
  ya dicho (formas, mayúsculas, bordes gruesos)?
- **D2 — Color de marca.** ¿Se mantiene un **verde** (más sobrio y apagado que el actual, que
  conecta con nutrición) o se pasa a un acento **neutro** (azul, gris pizarra, negro)? ¿Tiene ella
  un color o logo propio de su consultorio que convenga usar?
- **D3 — Navegación del panel.** ¿**Sidebar** lateral (propuesta: escala mejor con las secciones
  que vienen y deja el ancho para datos) o **barra superior** con menús agrupados? ¿Está de acuerdo
  con los grupos propuestos (Agenda, Pacientes, Nutrición, Gestión, Herramientas)?
- **D4 — Modo oscuro.** ¿Lo quiere? Si sí: ¿en esta HU o después, y sigue la preferencia del
  sistema operativo o un selector en el panel? La propuesta es dejar solo los tokens preparados.
- **D5 — Tipografía.** ¿Una sola sans neutra para todo (propuesta: Inter, que ya se usa, o Geist /
  IBM Plex Sans) o quiere una tipografía con más personalidad para títulos?
- **D6 — Densidad.** ¿En qué pantalla trabaja: notebook (13-15"), monitor externo, las dos?
  ¿Prefiere ver más datos por pantalla (compacto, estilo planilla) o más aire? ¿Hace falta un
  selector de densidad?
- **D7 — shadcn/ui o componentes propios.** Propuesta: **adoptar shadcn/ui** (el código de los
  componentes queda en el repo y se adapta; resuelve accesibilidad de diálogos, tabs, menús y
  toasts). Alternativa: seguir con componentes propios y escribir esos comportamientos a mano.
  ¿Vale también pasar a Tailwind 4 en la misma HU?
- **D8 — Partición.** ¿Se parte en las 4 HU propuestas (fundaciones y shell → pacientes → agenda y
  gestión → nutrición y portal), en otra agrupación, o va como una sola HU?
- **D9 — Convivencia durante la migración.** Si se parte, entre una HU y otra habrá pantallas con
  componentes nuevos pero layout viejo. ¿Es aceptable en `main` (lo usa ella a diario), o todas
  las HU del rediseño se mergean juntas al final?
- **D10 — Landing `/inicio`.** Hoy es una landing de marketing que solo ve la profesional al
  entrar. ¿Se reduce a una pantalla de login sobria (propuesta), se mantiene como página
  pública del consultorio, o se elimina y queda solo `/login`?
- **D11 — Portal.** ¿El portal usa exactamente el mismo estilo que el panel, o un tono algo más
  cálido y amigable para el paciente con los mismos tokens? ¿Barra de pestañas abajo en el
  celular (propuesta) o menú arriba?
- **D12 — PDF del plan.** Queda fuera por defecto. ¿Quiere que el PDF adopte la tipografía y el
  estilo nuevos para que todo se vea igual (sería un cambio chico, dentro de alguna de las HU)?
- **D13 — Marca en pantalla.** ¿El panel y el portal siguen diciendo "NutriBot" con la hoja, o el
  paciente debería ver el nombre/logo de la nutricionista (el logo ya se sube en `/ajustes` para
  el PDF)?
- **D14 — Ficha del paciente en pestañas.** ¿Está de acuerdo con el encabezado persistente y las
  pestañas propuestas (Resumen, Datos y ficha clínica, Evolución, Planes, Diario, Turnos)? ¿O
  prefiere una sola página larga con un índice lateral que salta a cada sección? ¿Qué mira
  primero cuando entra un paciente a la consulta?
- **D15 — Otros reordenamientos.** ¿Aprueba los reordenamientos 2 a 8 de la lista? ¿Hay algún
  flujo que hoy le resulte incómodo y no esté en la lista (p. ej. dar un turno, cargar una
  medición, armar un plan)?
- **D16 — Búsqueda rápida.** ¿Le sirve una búsqueda global (Ctrl+K: "ir al paciente Ana",
  "nuevo turno")? Es una funcionalidad nueva; la propuesta es dejarla fuera de esta HU.
- **D17 — Feedback de guardado.** ¿Toast en una esquina (propuesta) o confirmación al lado del
  botón como hoy?
- **D18 — Prototipo antes de implementar.** ¿Quiere ver una propuesta visual antes de migrar
  (maqueta en Figma con el skill `ui`, o una página de muestra del sistema en el propio panel para
  que la nutricionista la apruebe), o se implementa directo y se ajusta sobre lo hecho?

---

## Resoluciones (validadas por el usuario, 2026-09-23)

Estas resoluciones **mandan sobre el texto de arriba** donde haya diferencia.

- **D1 — Referencia:** **Notion**. Es la referencia principal de "empresarial y minimalista":
  fondo blanco, grises cálidos, tipografía neutra, mucho aire, sin decoración.
- **D2 — Color:** acento **neutro** (gris/negro al estilo Notion; el azul, solo como color de
  enlace o foco si hace falta). La nutricionista **no tiene logo** propio.
- **D3 — Navegación:** sidebar lateral con los grupos propuestos.
- **D4 — Modo oscuro:** solo tokens preparados; no se activa en esta HU.
- **D5 — Tipografía:** una sola sans neutra (Inter u otra equivalente). Se elimina Space Grotesk.
- **D6 — Densidad:** trabaja en una **notebook** y prefiere **más aire**. Nada de densidad tipo
  planilla ni selector de densidad. Probar todo a 1366 px.
- **D7 — Componentes:** **adoptar shadcn/ui**, sobre **Tailwind 3** (la migración a Tailwind 4
  va aparte).
- **D8 — Partición:** sí, en 4 HU encadenadas: HU-002a fundaciones y shell → HU-002b pacientes →
  HU-002c agenda y gestión → HU-002d nutrición y portal.
- **D9 — Convivencia:** se acepta que `main` tenga pantallas a medio migrar, pero cada HU se
  mergea completa y aprobada, nunca a la mitad.
- **D10 — `/inicio`:** se reduce a una pantalla de login sobria.
- **D11 — Portal:** mismos tokens pero con un **tono más cálido** que el panel.
- **D12 — PDF del plan:** **entra**: adopta la tipografía y el estilo nuevos (dentro de la HU que
  corresponda, sugerido HU-002b).
- **D13 — Marca:** se ven **las dos**: "NutriBot" y el **nombre de la nutricionista**
  (`Professional.name`). No hay logo del consultorio: no se inventa uno.
- **D14 — Ficha del paciente:** encabezado persistente + pestañas, aprobado. Lo que mira primero
  al entrar un paciente es **la evolución y los datos para cálculos**: la pestaña inicial
  (*Resumen*) tiene que priorizar esos dos.
- **D14 bis — Gráficos:** los gráficos de evolución tienen que ser **de barras** y "muy buenos".
  Se habilita **cambiar de librería de gráficos** si da un resultado claramente mejor que MUI X
  Charts (el `architect` evalúa y recomienda en la HU que migre Evolución, sugerido HU-002b).
- **D15 — Reordenamientos:** los 2 a 8 quedan aprobados. No hay otros flujos incómodos
  identificados por ahora.
- **D16 — Búsqueda global:** fuera de alcance.
- **D17 — Feedback de guardado:** toast en una esquina.
- **D18 — Prototipo:** **no** se arma un prototipo previo (la nutricionista no está disponible
  para revisarlo). Se implementa directo y se ajusta sobre lo hecho.
