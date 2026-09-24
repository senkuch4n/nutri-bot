# SDD — HU-002c `rediseno-ui-agenda-gestion` (Rediseño UI 3/4: agenda y gestión)

HU validada: `docs/hu-rediseno-ui-empresarial.md`. **Manda su sección final "Resoluciones"**
(D1–D18). Esta SDD cubre **solo la fila HU-002c** de la partición: calendario y sus modales,
disponibilidad, servicios, pagos, avisos (difusión), asistente, ajustes y `/ajustes/whatsapp`.
Reordenamientos aprobados que tocan acá: **3** (pagos en tabla con filtros visibles y totales
arriba), **4** (detalle del turno en panel lateral y contadores en una franja compacta), **6**
(ajustes en pestañas o índice lateral) y **7** (el `confirm()` nativo que queda en esta HU pasa al
diálogo del sistema).

Base: HU-002a y HU-002b, aprobadas y commiteadas en esta rama. Contrato de UI en
`Refactorizaciones/rediseno-ui-fundaciones.md` §6.2 / §8.5 / §10 y lo que agregó
`Refactorizaciones/rediseno-ui-pacientes.md` §6.2. Todo lo de acá se leyó contra el **código
real** de `apps/web/src/components/`, `primitives/` y las pantallas de esta HU (rama
`hu-002-rediseno-ui-empresarial`, commit `6784c55`), y contra la base de desarrollo en **solo
lectura**.

Skills aplicados: **`refactor`** (Diagnóstico §3, Radio de impacto §10, Checklist de ejecución §11,
sin romper nada en el medio) y **`ui`** (cada vista con nombre, estructura base y componentes
clave: §7).

---

## 1. Resumen funcional

Las pantallas de agenda y gestión pasan al sistema nuevo (Notion, mucho aire, notebook). En el
**calendario**, los tres contadores dejan de ser tarjetas y pasan a una **franja compacta** (hoy,
esta semana, próximo turno), y el detalle de un turno se abre en un **panel lateral no modal** a
la derecha: el calendario sigue a la vista y se puede tocar otro turno sin cerrar nada. El
calendario tiene su propio esqueleto de carga. **Disponibilidad** y **servicios** cambian de
aspecto; el alta y la edición de servicios pasan a un panel lateral. **Pagos** pasa a una
**tabla con filtros visibles** (estado, medio, tipo, búsqueda) y **totales arriba**, y el pago
manual se registra desde un diálogo. **Avisos** muestra la cola en una tabla y la difusión pide
confirmación con el **diálogo del sistema** en vez del `confirm()` del navegador. **Ajustes** se
ordena en **pestañas laterales** (General, Bot de WhatsApp, Google Calendar, PDF del plan) y el
color por defecto del PDF sale de `DEFAULT_PDF_ACCENT`. El feedback de guardado pasa a toast en
todos los formularios. **No cambia ninguna funcionalidad**: mismas server actions, mismas
consultas, mismos datos, mismos mensajes del bot.

---

## 2. Workspaces afectados

| Workspace | ¿Se toca? | Qué |
|---|---|---|
| `apps/web` | **Sí** | Pantallas de agenda y gestión, `components/modal.tsx` (una prop opcional), `loading.tsx` por ruta, una página temporal de prueba |
| `apps/bot` | **No** | Nada. Ningún mensaje cambia |
| `packages/core` | **No** | Solo se **importan** funciones existentes (`formatInTimeZone`, `formatPrice`, `fromZonedTime`) |
| `packages/db` | **No** | Ni `schema.prisma`, ni migraciones, ni `domain/` |

### 2.1 Restricciones duras para el implementer (copiarlas tal cual en `progress/impl_HU-002c.md`)

1. **Cero cambios de funcionalidad.** No se tocan: ninguna server action (`(panel)/actions.ts`,
   `disponibilidad/actions.ts`, `servicios/actions.ts`, `pagos/actions.ts`, `avisos/actions.ts`,
   `asistente/actions.ts`, `ajustes/actions.ts`), ninguna consulta (los `Promise.all([...])`, los
   `prisma.*` y las llamadas a `@nutri-bot/db/domain` de las `page.tsx` quedan **idénticos**),
   `packages/`, `schema.prisma`, `apps/bot`, `api/**` (incluido `api/appointments` y `api/slots`),
   `auth*.ts`, `middleware.ts`, el shell (`components/shell/**`, `(panel)/layout.tsx`),
   `components/ui.tsx`, `confirm.tsx`, `data-table.tsx`, `lib/notify.ts`, `lib/pdf-theme.ts`,
   `tailwind.config.ts` y `globals.css`. Si un reordenamiento obliga a mover un componente, se
   mueve **con su lógica tal cual**: mismo `useActionState`, mismos `name` de los campos, mismos
   `hidden`, misma action con los mismos argumentos. Los dos server actions inline de
   `ajustes/page.tsx` (`signIn("google", { redirectTo: "/ajustes" })` y el `<form
   action={disconnectGoogleAction}>`) quedan **textuales**.
2. **No correr `next build` ni levantar otro `next dev`.** El usuario tiene el suyo en el puerto
   3000 (`pgrep -fl "next dev"`). Esta HU **no toca `tailwind.config.ts`**: las clases nuevas las
   toma el JIT sin reiniciar. Si por algún motivo hubiera que tocarlo, parar y avisar para que el
   usuario reinicie el dev. Si después de mover `page.tsx` (paso 2.1) el dev responde 404 en `/`,
   anotarlo en `impl` y avisar: el orquestador pide el reinicio. No reiniciarlo.
3. **WhatsApp: nada.** Crear un turno encola la confirmación por WhatsApp; cancelarlo encola la
   cancelación; "Enviar recordatorio ahora" encola un recordatorio; la difusión encola un mensaje
   a **todos** los pacientes; "Reintentar" reencola. **Ninguna** de esas acciones se ejecuta en
   ninguna verificación. La difusión se prueba solo en la página temporal con una action falsa
   (§8, §11 fase 10).
4. **Base de desarrollo: solo lectura.** No se guarda ningún formulario (ajustes, servicios,
   bloques, excepciones, pagos, logo), no se toca el switch del bot ni el de "Activo" de un
   servicio (escriben al instante), no se borran bloques ni excepciones (la × borra sin
   confirmar) y no se conecta ni desconecta Google Calendar.
5. Rama `hu-002-rediseno-ui-empresarial`. **No commitear.** Anotar el `git status --porcelain`
   inicial y no tocar los archivos ajenos que ya estaban (`docs/historias-usuario-nutridesk.md`,
   `docker-compose.prod.yml`, `docs/ISAKMetry_*`, y los de `backlog.json`/`progress/*` que
   modifique el orquestador).
6. No correr `prisma migrate`, `db push`, `db:seed` ni `seed:demo`.
7. **Límite servidor/cliente:** ninguna `page.tsx` (server) le pasa **funciones** a un componente
   cliente. `PaymentsTable`, `AvisosView` y `AjustesTabs` reciben datos planos y `ReactNode`; los
   `cell`/`sortValue` de `DataTable` se definen **dentro** del componente cliente.
8. **`useConfirm` nunca dentro de `<form action>` ni de `startTransition`** (regla aprendida en la
   002b, ver §6.3). En React 19 queda en deadlock: el diálogo no se monta y el botón queda colgado.
9. Las páginas temporales de prueba (§8) **las borra el orquestador** después del recorrido, junto
   con sus tipos generados en `apps/web/.next/types/` (§13.6).

---

## 3. Diagnóstico (skill `refactor`)

Analizado en solo lectura sobre la rama (commit `6784c55`). Las pantallas ya toman la paleta
nueva por los alias LEGACY de la 002a, pero conservan la estructura y los restos del sistema viejo.

**Calendario (`(panel)/page.tsx`, `calendar-client.tsx`, `new-appointment-modal.tsx`,
`appointment-detail-modal.tsx`)**

- Los contadores son tres `StatTile` en tarjetas (`grid sm:grid-cols-3`), que ocupan ~90 px de
  alto en una pantalla de 663 px útiles antes de que empiece el calendario. El "Próximo turno" usa
  `font-display font-bold` y `text-ink*`.
- El detalle del turno es un `Modal` centrado con overlay: **tapa el calendario** (reordenamiento
  4). Para ver otro turno hay que cerrar y volver a abrir. Los estados usan tonos viejos de
  `Badge` (`blue`, `green`, `red`), el error va en `text-red-600` y el aviso "Recordatorio
  encolado." en `text-green-600`, inline. La fecha usa `"EEEE dd/MM/yyyy HH:mm"` **sin locale**:
  el día sale en inglés ("Monday 14/09/2026 14:00 hs").
- El `NewAppointmentModal` elige el horario con botones `border-2` + `bg-leaf`, sin semántica de
  grupo (no son un `radiogroup`), el error en `text-red-600` y la etiqueta "Horario" es un `span`
  suelto.
- El contenedor del calendario: `rounded-card … shadow-card`; la barra de carga `bg-leaf`; la
  leyenda de servicios con `text-[10px] uppercase tracking-[0.14em]`. El `failure` de la fuente de
  eventos hace `console.error` (la profesional no se entera si fallan los turnos).
- Los eventos de FullCalendar **no son tabulables** (`eventInteractive` está en `false` por
  defecto): el detalle de un turno no se puede abrir con el teclado (Gherkin "Navegación con
  teclado").
- No hay `loading.tsx` propio: `/` usa el genérico del panel (`PageSkeleton`, dos tarjetas), que no
  tiene la forma del calendario. Como `(panel)/loading.tsx` es también el fallback de **todas** las
  rutas del panel, el esqueleto del calendario no se puede poner ahí (ver §5.1).

**Disponibilidad (`view.tsx`, `schedule.tsx`, `exceptions.tsx`)**

- Encabezado hecho a mano con `font-display text-3xl font-bold` (no usa `PageHeader`). Secciones
  con `rounded-card border-line bg-paper shadow-card`. Sticky `lg:top-24` (pensado para la barra
  superior vieja, que ya no existe).
- Grilla semanal: días en `text-[11px] uppercase tracking-[0.1em]`, horas en `text-[11px]`,
  bloques `border-l-2 border-leaf bg-leaf-tint text-leaf-deep`, botón de quitar con el carácter
  "×" y `hover:bg-white hover:text-red-600`. `max-h-[520px]` fijo: a 663 px de alto la grilla
  queda cortada por abajo de la página.
- Excepciones: vacío en `border-dashed`, indicador de tipo **solo por color** (`bg-red-400` /
  `bg-leaf`), quitar con "×".
- `AddBlockModal` y `ExceptionForm`: error en `text-red-600`, sin toast de éxito.

**Servicios (`page.tsx`, `new-service-button.tsx`, `service-card.tsx`, `service-form.tsx`)**

- Tarjetas con `shadow-card`, título `font-display text-lg font-bold`, "Inactivo", "Requiere
  seña" y "Manda recomendaciones previas" en `uppercase tracking-[…]`. Activar/desactivar es un
  `button` de texto sin estado accesible. El vacío es un `border-dashed` a mano.
- El formulario (12 campos, con bloques condicionales de seña y recomendaciones) vive en un
  `Modal` `max-w-lg`: con los dos bloques abiertos supera los 663 px y scrollea dentro del modal.
  Colores con `border-2` y `scale-110`; checkboxes `accent-leaf`; "Guardado." inline en
  `text-leaf-deep`.

**Pagos (`page.tsx`, `manual-payment-form.tsx`)**

- Tres bloques apilados: "Cobrado este mes" (`text-[10px] uppercase` + `font-display
  text-3xl font-bold`), una lista de pendientes, el formulario manual y una lista de pagos del
  mes. **No hay tabla ni filtros** (reordenamiento 3). Los montos no van alineados ni con cifras
  tabulares. El pendiente usa `Badge tone="amber"` para el monto.
- El formulario manual queda en el medio de la página, entre las dos listas; su feedback es "✓
  Registrado" con `reveal` y `text-leaf-deep`.
- Datos reales en desarrollo: 0 pendientes, 3 aprobados (1 en septiembre). Sin fixtures no se
  puede ver una tabla con muchas filas.

**Avisos (`page.tsx`, `avisos-view.tsx`, `broadcast-form.tsx`)**

- **`broadcast-form.tsx` usa `confirm()` nativo** en el `onSubmit` (Gherkin "Confirmación de una
  acción destructiva"; es uno de los dos `confirm()` que quedan en el repo). Además, al usar
  `<form action>`, React resetea el formulario **también cuando falla**, así que el texto se
  pierde (Gherkin "Error al guardar").
- Filtros como `button` con `press border-2`, activo `bg-ink text-white`, y el de fallidos en
  `border-red-300 text-red-700`. La cola es una `ul` con `reveal … shadow-card`; "Reintentar" es
  texto `text-leaf-deep` sin nombre accesible que diga **a quién** reintenta. Vacío en
  `border-dashed`. El punto "En vivo" es `bg-leaf`.
- Datos reales: 4 enviados, 0 fallidos, 0 pendientes. Los estilos de "Falló" y "Reintentar" solo
  se pueden ver con fixtures.

**Asistente (`page.tsx`, `assistant-chat.tsx`)**

- Burbujas con `rounded` + `bg-ink text-white` / `border-line bg-paper`; "Pensando…" como texto
  plano sin `role="status"`; sin `aria-live` en la conversación; error en `text-red-600`. El área
  de mensajes no scrollea sola al último mensaje.

**Ajustes (`page.tsx`, `settings-form.tsx`, `bot-toggle.tsx`, `logo-form.tsx`,
`google-calendar-form.tsx`, `whatsapp/page.tsx`)**

- Cinco tarjetas apiladas (Bot, Marca, General, Google): para llegar a Google Calendar hay que
  scrollear ~1,5 pantallas (reordenamiento 6). "Marca" (el logo del PDF) está separada del color
  y el pie del PDF, que viven **dentro** del formulario "General".
- **`settings-form.tsx:68` usa `"#3c7a24"`** (verde viejo) como color inicial cuando no hay uno
  guardado; el PDF ya usa `DEFAULT_PDF_ACCENT = "#37352F"` (D-b2 de la 002b).
- `saveSettingsAction` guarda **los 7 campos juntos** (zona horaria, moneda, recordatorio,
  teléfono, obras sociales, color y pie del PDF). Si General y PDF quedan en pestañas distintas,
  los dos grupos de campos tienen que seguir viajando **en el mismo envío**: un formulario por
  pestaña rompería la action (faltarían campos obligatorios o se borrarían los opcionales).
- `BotToggle` es un botón que cambia de texto; el estado va en `text-red-600` / `bg-leaf`.
- `logo-form.tsx`: `file:border-2 … file:uppercase file:tracking-[0.08em]`, "Sin logo" en
  `text-[10px]`, sin feedback de éxito. Error de Google en `border-l-2 border-red-400 bg-red-50`.
- `/ajustes/whatsapp`: "← Volver" hecho a mano, QR ASCII en `bg-ink text-leaf-bright`, `code` en
  `bg-mint`.

**Modales (6 usos de `Modal`)**: `new-appointment-modal.tsx`, `appointment-detail-modal.tsx`,
`disponibilidad/view.tsx` (nueva excepción), `disponibilidad/schedule.tsx` (nuevo bloque),
`servicios/new-service-button.tsx` y `servicios/service-card.tsx`. Todos ya corren sobre `Dialog`
(002a): foco atrapado, Escape, devolución de foco.

**Conclusión:** la lógica ya está bien separada (server actions + `useActionState` o llamadas
directas). El trabajo es de **presentación y composición**, con tres puntos delicados: (1) la
difusión, que tiene que pedir confirmación con `useConfirm` **sin** caer en el deadlock de la 002b;
(2) ajustes, donde los campos de General y del PDF se separan en pestañas pero siguen siendo **un
solo envío**; y (3) el esqueleto del calendario, que necesita su propio límite de carga sin
afectar al resto del panel.

---

## 4. Decisiones técnicas

### D-c1 Detalle del turno: `Sheet` **no modal** (reordenamiento 4)

`Sheet side="right"` con `modal={false}`:

- Radix no dibuja el overlay en modo no modal (`DialogOverlay` devuelve `null` si
  `!context.modal`, verificado en `@radix-ui/react-dialog/dist/index.mjs:102`), no bloquea el scroll
  ni los clics del resto de la página, y no atrapa el foco.
- **El calendario sigue usable**: tocar otro turno cambia el contenido del panel sin cerrarlo. Para
  eso `onInteractOutside` hace `preventDefault()` cuando el objetivo está dentro del área del
  calendario (`interactionAreaRef`). Cualquier otro clic afuera, Escape o la X cierran.
- Foco: al abrir entra al panel (Radix `onOpenAutoFocus`); al cerrar vuelve al evento que lo abrió
  (`returnFocusRef`, si sigue en el DOM). Con `eventInteractive` los turnos se abren con Tab +
  Enter.
- Trade-off explícito con el Gherkin "los diálogos atrapan el foco": este panel **no es un diálogo
  bloqueante** sino un panel complementario, y atrapar el foco contradice el objetivo del
  reordenamiento (seguir usando el calendario). Conserva `role="dialog"`, título, Escape y
  devolución de foco. Si el orquestador prefiere modal, el cambio es `modal={true}` (con overlay):
  queda anotado en §14.

### D-c2 Los 6 usos de `Modal`

| Uso | Decisión | Por qué |
|---|---|---|
| Detalle del turno | **`Sheet` no modal** (archivo nuevo `appointment-detail-sheet.tsx`) | Reordenamiento 4 |
| Nuevo servicio / editar servicio (×2) | **`Sheet` modal**, `side="right"`, `sm:max-w-xl` | Formulario largo con bloques condicionales; mismo patrón que "Datos para cálculos" de la 002b y que la HU pide para alimentos |
| Nuevo turno | **`Modal` compat** + `description` | Formulario corto; el diálogo centrado sigue siendo lo correcto |
| Nuevo bloque, nueva excepción | **`Modal` compat** | Formularios de 3–5 campos |
| (nuevo) Registrar pago manual | **`Modal` compat** + `description` | Formulario de 3 campos que sale del medio de la página de pagos |

`Modal` (002a) suma **una** prop opcional, `description?: string` (ver §6.2). El contrato permite
agregar opcionales.

### D-c3 Ajustes: pestañas laterales con **un solo formulario** para General + PDF

- `Tabs orientation="vertical"` con la lista a la izquierda a partir de `lg` (índice lateral) y
  arriba en pantallas chicas. Pestaña activa en la URL (`?tab=`) con `history.replaceState`, igual
  que `PatientTabs` de la 002b. Los cuatro paneles quedan montados (`forceMount` +
  `data-[state=inactive]:hidden`) para no perder lo escrito al cambiar de pestaña.
- **Un solo `<form>` para los 7 campos.** `SettingsFormProvider` (cliente) llama **una vez** a
  `useActionState(saveSettingsAction)` y renderiza un `<form id="ajustes-generales"
  action={action} className="hidden" />` vacío. Los campos de General y de PDF viven en sus
  pestañas y se asocian a ese formulario con el atributo HTML **`form="ajustes-generales"`**; los
  dos botones "Guardar ajustes" también (`type="submit" form=…`). Por HTML, `new
  FormData(form)` incluye todos los controles asociados por `form=`, estén donde estén, y
  `form.reset()` los resetea a todos. Resultado: **mismo envío, mismos 7 `name`, misma action**
  que hoy, desde cualquiera de las dos pestañas.
- El estado (`pending`, `error`) se comparte por un context del provider.
- `LogoForm`, `GoogleCalendarForm`, el `signIn` inline y `disconnectGoogleAction` siguen siendo
  formularios propios (no se anidan: el formulario de ajustes está vacío y fuera de ellos).

### D-c4 Esqueleto del calendario: route group `(calendario)`

`(panel)/loading.tsx` es el fallback de **todas** las rutas del panel, así que no puede tener la
forma del calendario. Se mueve `(panel)/page.tsx` a **`(panel)/(calendario)/page.tsx`** (sigue
resolviendo `/`) y se crea `(panel)/(calendario)/loading.tsx`. Es el patrón documentado de Next
para "loading solo para la página índice" (route group con su propio `loading.tsx`). El contenido
de `page.tsx` no cambia salvo el import (`./calendar-client` → `../calendar-client`). Mover el
archivo deja un tipo generado viejo en `apps/web/.next/types/app/(panel)/page.ts` que rompe el
`tsc`: se borra en el mismo paso (§11, 2.2).

### D-c5 Difusión: confirmación sin deadlock + el texto no se pierde si falla

Patrón de §6.3. Con `preventDefault` incondicional y el despacho manual, React ya no resetea el
formulario solo: se resetea **solo si el envío salió bien** (`state.ok`). Hoy el texto se borraba
también cuando la action fallaba; después de este cambio se conserva, que es lo que pide el Gherkin
"Error al guardar". Es el único cambio de comportamiento visible de la difusión y es de
presentación (no cambia qué se envía ni a quién).

### D-c6 Pagos: filtros en cliente sobre los mismos datos

La página ya trae **todos los pendientes** (`listPendingPayments`) y **los acreditados del mes**
(`listApprovedPaymentsInRange`). Esta HU no cambia consultas: la tabla une esas dos listas y
filtra en el cliente. La descripción de la tabla lo dice ("Pendientes de confirmar y pagos
acreditados este mes"), para que nadie espere ver meses anteriores. Los totales de arriba son
sumas de esos mismos datos (presentación).

### D-c7 Página temporal con fixtures y dos props de prueba

Como la base de desarrollo no tiene pendientes, fallidos ni muchos pagos, y como la difusión y los
reintentos no se pueden ejecutar, el recorrido usa `(panel)/prueba-002c` con datos en memoria.
Para eso dos componentes suman una prop opcional que **en producción nunca se pasa**:

- `BroadcastForm({ sendAction? })`: la action por defecto es `broadcastMessageAction`; la página
  de prueba pasa una action **falsa** en memoria. Así se prueba el flujo completo del
  `useConfirm` (abrir, cancelar, confirmar, toast, reset) sin encolar nada.
- `AvisosView({ readOnly? })`: sin `AutoRefresh`, con "Reintentar" y "Reintentar todos"
  **deshabilitados** (se ven, no llaman a nada).

---

## 5. Esquema

**No cambia.** Sin migración. Solo lecturas que ya existen.

### 5.1 Rutas

Ninguna ruta pública nueva ni cambiada. Cambia la **ubicación** de un archivo:
`(panel)/page.tsx` → `(panel)/(calendario)/page.tsx` (misma URL `/`). Se suma el parámetro
opcional `?tab=general|whatsapp|google|pdf` en `/ajustes`.

---

## 6. Contrato compartido

### 6.1 `packages/db/domain` y `packages/core`

**Sin cambios.** No hay funciones nuevas ni modificadas. Consumidores nuevos: ninguno (solo se
importan `formatInTimeZone` y `formatPrice` de `@nutri-bot/core`, como hoy).

### 6.2 Contrato de UI de `apps/web` (lo que agrega o cambia esta HU)

Las firmas de 002a §6.2 y 002b §6.2 **no se rompen**. Única modificación a un componente
compartido: `Modal` suma `description?`.

```ts
// src/components/modal.tsx (API conservada + 1 opcional)
export function Modal(props: {
  open: boolean; onClose: () => void; title: string; children: ReactNode;
  description?: string;   // NUEVO: <DialogDescription> debajo del título.
}): JSX.Element;
// Con description: se renderiza <DialogDescription>{description}</DialogDescription> dentro de
// <DialogHeader> y NO se pasa aria-describedby={undefined} (Radix enlaza la descripción).
// Sin description: igual que hoy (aria-describedby={undefined}).
```

```ts
// src/app/(panel)/appointment-detail-sheet.tsx ("use client")
// REEMPLAZA a appointment-detail-modal.tsx (git mv + reescritura). El tipo no cambia.
export interface SelectedAppointment {           // idéntico al de hoy
  id: string; start: string; end: string;
  status: "CONFIRMED" | "COMPLETED" | "NO_SHOW";
  patientName: string | null; patientPhone: string; serviceName: string; price: string; googleSynced: boolean;
}
export function AppointmentDetailSheet(props: {
  appt: SelectedAppointment | null;               // null = cerrado
  tz: string;
  currency: string;
  onClose: () => void;
  onChanged: () => void;                          // refetch del calendario (igual que hoy)
  interactionAreaRef?: RefObject<HTMLElement | null>;  // NUEVO: clics adentro de esta área no cierran el panel
  returnFocusRef?: RefObject<HTMLElement | null>;      // NUEVO: al cerrar, el foco vuelve acá si sigue en el DOM
}): JSX.Element;
```

```ts
// src/app/(panel)/new-appointment-modal.tsx: props SIN cambios
//   ({ open, onClose, onCreated, services, tz, initialDate }); ServiceOption sin cambios.

// src/app/(panel)/calendar-client.tsx: props SIN cambios
//   ({ services, legend, tz, currency, summary, businessHours, slotMin, slotMax }).
```

```ts
// src/app/(panel)/pagos/payments-table.tsx ("use client", NUEVO)
export interface PaymentRow {
  id: string;
  status: "PENDING" | "APPROVED";
  patient: string;            // p.appointment.patient.name ?? p.appointment.patient.phone
  service: string;            // p.appointment.service.name
  appointmentLabel: string;   // formatInTimeZone(p.appointment.startsAt, tz, "dd/MM/yyyy HH:mm")
  dateISO: string;            // APPROVED: (p.paidAt ?? p.createdAt).toISOString(); PENDING: p.createdAt.toISOString()
  dateLabel: string;          // la misma fecha con formatInTimeZone(…, tz, "dd/MM/yyyy")
  kind: "DEPOSIT" | "FULL";
  provider: "manual" | "mercadopago";   // p.provider === "manual" ? "manual" : "mercadopago" (misma regla que hoy)
  amount: number;             // Number(p.amount), solo para ordenar
  amountLabel: string;        // formatPrice(p.amount.toString(), pro.currency)
}
export function PaymentsTable(props: { rows: PaymentRow[] }): JSX.Element;

// src/app/(panel)/pagos/manual-payment-dialog.tsx ("use client", NUEVO)
export function ManualPaymentDialog(props: { appointments: AppointmentOption[] }): JSX.Element;
//   Button "Registrar pago" (Plus) + <Modal title="Registrar pago manual" description=…> con <ManualPaymentForm onDone={cerrar} />

// src/app/(panel)/pagos/manual-payment-form.tsx (+1 opcional)
export function ManualPaymentForm(props: { appointments: AppointmentOption[]; onDone?: () => void }): JSX.Element;
//   AppointmentOption sin cambios. onDone se llama en un useEffect cuando state.ok (mismo patrón que ServiceForm).
```

```ts
// src/app/(panel)/avisos/avisos-view.tsx (+1 opcional)
export function AvisosView(props: {
  rows: MessageRow[]; counts: Record<"PENDING" | "SENT" | "FAILED", number>; intervalSeconds: number;
  readOnly?: boolean;   // NUEVO, solo para la página de prueba: sin AutoRefresh, Reintentar/Reintentar todos deshabilitados
}): JSX.Element;
// MessageRow sin cambios.

// src/app/(panel)/avisos/broadcast-form.tsx (+1 opcional)
export function BroadcastForm(props: {
  patientCount: number;
  sendAction?: (prev: BroadcastState, formData: FormData) => Promise<BroadcastState>;  // NUEVO; default broadcastMessageAction
}): JSX.Element;
```

```ts
// src/app/(panel)/ajustes/ajustes-tabs.tsx ("use client", NUEVO)
export const AJUSTES_TABS: readonly [
  { value: "general"; label: "General" },
  { value: "whatsapp"; label: "Bot de WhatsApp" },
  { value: "google"; label: "Google Calendar" },
  { value: "pdf"; label: "PDF del plan" },
];
export type AjustesTabValue = (typeof AJUSTES_TABS)[number]["value"];
export function AjustesTabs(props: { panels: Record<AjustesTabValue, ReactNode> }): JSX.Element;
// Pestaña activa = useSearchParams().get("tab") si es un AjustesTabValue; si no, "general".
// Cambio: window.history.replaceState con ?tab=<v> (sin ?tab para "general"). Íconos (SlidersHorizontal,
// MessageCircle, CalendarDays, FileText) definidos DENTRO de este archivo (no se pasan desde el server).

// src/app/(panel)/ajustes/settings-form.tsx ("use client", REESCRITO; SettingsForm deja de existir)
export const SETTINGS_FORM_ID = "ajustes-generales";
export type SettingsDefaults = {
  timezone: string; currency: string; reminderLeadHours: number; phone: string;
  acceptedInsurances: string; pdfAccentColor: string; pdfFooterText: string;
};   // los mismos 7 campos del `defaults` de hoy
export function SettingsFormProvider(props: { children: ReactNode }): JSX.Element;
//   useActionState(saveSettingsAction, { ok: false }) UNA vez; useActionToast(state, { success: "Ajustes guardados" });
//   renderiza <form id={SETTINGS_FORM_ID} action={action} className="hidden" /> + context { pending, error }.
export function SettingsGeneralFields(props: { defaults: SettingsDefaults }): JSX.Element;
//   timezone, currency, reminderLeadHours, phone, acceptedInsurances: cada control con form={SETTINGS_FORM_ID}
//   + <SettingsSubmit />.
export function SettingsPdfFields(props: { defaults: SettingsDefaults }): JSX.Element;
//   pdfAccentColor (defaultValue={defaults.pdfAccentColor || DEFAULT_PDF_ACCENT}), pdfFooterText, con form=…
//   + <SettingsSubmit />.
// (interno) function SettingsSubmit(): Button type="submit" form={SETTINGS_FORM_ID} loading={pending}
//   {pending ? "Guardando…" : "Guardar ajustes"} + <FormError message={error} />.

// src/app/(panel)/ajustes/bot-toggle.tsx: props SIN cambios ({ paused }). Pasa a Switch (§7.8).
// src/app/(panel)/ajustes/logo-form.tsx, google-calendar-form.tsx: props SIN cambios.
```

Sin cambios de props: `DisponibilidadView`, `WeeklySchedule`, `AddBlockModal`, `ExceptionsList`,
`ExceptionForm`, `NewServiceButton` (`label`, `variant`), `ServiceCard`, `ServiceForm`,
`AssistantChat`.

### 6.3 Regla dura: `useConfirm` fuera de toda transición (patrón exacto de `broadcast-form.tsx`)

`await confirm()` **nunca** dentro de `<form action={…}>` ni dentro de `startTransition`: en React
19 la action corre en una transición, el `setPending` del diálogo toma ese lane y React no lo
confirma hasta que la promesa termine; como la promesa espera al diálogo, queda en deadlock (bug
real de "Borrar plan" en la 002b; JSDoc de `components/confirm.tsx`). **No** usar
`requestSubmit()` después de confirmar: vuelve a entrar al `onSubmit`.

Fragmento correcto (el formulario **no** tiene prop `action`):

```tsx
"use client";

import { startTransition, useActionState, useEffect, useRef, type FormEvent } from "react";
import { Send } from "lucide-react";
import { useConfirm } from "@/components/confirm";
import { Button, FormError, Textarea } from "@/components/ui";
import { useActionToast } from "@/lib/notify";
import { broadcastMessageAction, type BroadcastState } from "./actions";

const initial: BroadcastState = { ok: false };
type BroadcastAction = (prev: BroadcastState, formData: FormData) => Promise<BroadcastState>;

export function BroadcastForm({
  patientCount,
  sendAction = broadcastMessageAction,
}: {
  patientCount: number;
  sendAction?: BroadcastAction;
}) {
  const [state, dispatch, pending] = useActionState(sendAction, initial);
  const formRef = useRef<HTMLFormElement>(null);
  const confirm = useConfirm();

  useActionToast(state, {
    success: state.ok ? `Encolado para ${state.sent} paciente${state.sent === 1 ? "" : "s"}` : undefined,
  });
  // Solo si salió bien: si falla, lo escrito se conserva (Gherkin "Error al guardar").
  useEffect(() => {
    if (state.ok) formRef.current?.reset();
  }, [state]);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();                               // 1. SIEMPRE y antes de cualquier await
    const formData = new FormData(e.currentTarget);   // 2. sincrónico: currentTarget es null después del await
    const body = formData.get("body")?.toString().trim();
    if (body) {                                       // 3. igual que hoy: sin texto no se confirma y la action devuelve su error
      const ok = await confirm({                      // 4. en un handler de evento, fuera de toda transición
        title: "¿Enviar este comunicado?",
        description: `Se va a mandar por WhatsApp a los ${patientCount} pacientes cargados. No se puede deshacer.`,
        confirmLabel: `Enviar a ${patientCount} pacientes`,
      });
      if (!ok) return;                                // Cancelar o Escape: no pasa nada
    }
    startTransition(() => dispatch(formData));        // 5. recién acá la action, dentro de una transición
  }

  return (
    <form ref={formRef} onSubmit={onSubmit} className="space-y-3">
      <Textarea name="body" rows={3} required placeholder="Ej: La semana que viene estoy de vacaciones, retomo el lunes 22." />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">Se envía a {patientCount} pacientes por WhatsApp.</p>
        <Button type="submit" loading={pending} disabled={patientCount === 0}>
          {pending ? "Enviando…" : (<><Send aria-hidden />Enviar a los {patientCount} pacientes</>)}
        </Button>
      </div>
      <FormError message={state.error} />
    </form>
  );
}
```

Por qué funciona: el `await confirm()` corre en un handler de evento común, así que el
`setPending` del `ConfirmProvider` se confirma como una actualización normal y el `AlertDialog` se
monta. `dispatch` se llama dentro de `startTransition` (React lo exige para `useActionState`
fuera de `<form action>`; si no, `pending` no se actualiza). El `name="body"`, la action y el
`FormData` que recibe son los mismos que hoy.

---

## 7. Vistas (skill `ui`)

Referencia Notion, **mucho aire** (D6), notebook a **1366 × 663 px útiles** (ventana de 1366 ×
800). Con la sidebar expandida quedan ~1046 px de contenido (1366 − 240 − 80). Todo en caso
oración, sin `uppercase` / `tracking-[…]` / `border-2` / `font-bold` en títulos / `text-[Npx]`;
números con `tabular-nums`. Íconos solo `lucide-react`, `h-4 w-4`, `aria-hidden`. Los botones "+"
pasan a ícono `Plus` + texto ("Nuevo turno", no "+ Nuevo turno"). La acción principal de cada
pantalla es la única en `variant="primary"`.

**Feedback de guardado (igual en todos los formularios):** `Button type="submit" loading={pending}`
con `"Guardando…"` (o el verbo de hoy: `"Creando…"`, `"Enviando…"`, `"Subiendo…"`) mientras está
pendiente, `useActionToast(state, { success })` y `<FormError message={state.error} />` debajo de
la fila de botones. Se borran todos los "✓ …" / "Guardado." inline y los `reveal`/`press`.

| Formulario / acción | Toast de éxito (texto exacto) |
|---|---|
| `NewAppointmentModal` | `notify.saved("Turno creado")` |
| Sheet → Marcar completado | `notify.saved("Turno marcado como completado")` |
| Sheet → No asistió | `notify.saved("Turno marcado como «No asistió»")` |
| Sheet → Cancelar turno | `notify.saved("Turno cancelado")` |
| Sheet → Volver a confirmado | `notify.saved("Turno vuelto a confirmado")` |
| Sheet → Enviar recordatorio ahora | `notify.info("Recordatorio encolado.")` (texto de hoy) |
| `AddBlockModal` | `"Bloque agregado"` |
| `ExceptionForm` | `"Excepción agregada"` |
| `ServiceForm` | `editing ? "Servicio guardado" : "Servicio creado"` |
| `ManualPaymentForm` | `"Pago registrado"` |
| `BroadcastForm` | `` `Encolado para ${sent} paciente${sent === 1 ? "" : "s"}` `` (texto de hoy) |
| Ajustes (General + PDF) | `"Ajustes guardados"` |
| `GoogleCalendarForm` | `"Calendario guardado"` |
| `LogoForm` | `"Logo actualizado"` |
| `BotToggle`, `toggleServiceAction`, borrar bloque/excepción, reintentar | Sin toast (como hoy; el cambio se ve en la pantalla) |

### 7.1 Calendario (`/`)

**Estructura base:** shell con sidebar → `PageHeader` → franja de resumen → tarjeta del
calendario → leyenda. Panel lateral de detalle a la derecha, sin overlay.

```
Calendario                                                    [+ Nuevo turno]
Turnos confirmados, completados y ausencias.

┌──────────────────────────────────────────────────────────────────────────┐
│ Turnos hoy 3  │  Esta semana 12  │  Próximo turno 14:30 · Ana · Consulta │  h-11, una línea
└──────────────────────────────────────────────────────────────────────────┘
┌──────────────────────────────────────────────────────────┐ ┌─────────────┐
│ [<][>][Hoy]      14 – 20 sept 2026   [Mes][Semana][Día]  │ │ Ana Pérez  ×│ Sheet no modal
│ ─────────────────────────────────────────────────────── │ │ Consulta    │ w-full sm:max-w-sm
│  FullCalendar (tema de la 002a, sin cambios)            │ │ [Confirmado]│
│                                                         │ │ Teléfono …  │
└──────────────────────────────────────────────────────────┘ │ …           │
Servicios  ■ Primera consulta  ■ Seguimiento  ■ Antropometría│ [acciones]  │
                                                             └─────────────┘
```

**Componentes clave:**

- `PageHeader title="Calendario" description="Turnos confirmados, completados y ausencias."
  action={<Button onClick=…><Plus aria-hidden />Nuevo turno</Button>}` (mismo `onClick` de hoy).
- **Franja de resumen** (reordenamiento 4): `<dl aria-label="Resumen de turnos" className="mb-4
  flex flex-wrap items-center gap-x-6 gap-y-2 rounded-lg border bg-card px-4 py-2.5 text-sm">`.
  Tres grupos `<div className="flex min-w-0 items-baseline gap-2">` con `<dt
  className="text-muted-foreground">` y `<dd className="font-semibold tabular-nums">`: "Turnos hoy"
  / `summary.today`, "Esta semana" / `summary.week`, "Próximo turno" / `summary.next ? <><span
  className="font-semibold tabular-nums">{time}</span><span className="mx-1.5
  text-muted-foreground">·</span><span className="truncate">{label}</span></> : <span
  className="text-muted-foreground">Sin turnos próximos</span>` (este `dd` con `font-normal
  truncate`). Entre grupos, `<Separator orientation="vertical" className="hidden h-4 sm:block" />`.
  Mismos datos y etiquetas que hoy.
- Tarjeta: `<div ref={calendarAreaRef} className="relative overflow-hidden rounded-lg border
  bg-card p-4">`. Barra de carga: `<span role="status" aria-label="Cargando turnos"
  className="absolute inset-x-0 top-0 z-10 h-0.5 animate-pulse bg-primary" />`.
- `FullCalendar`: **mismas props** que hoy + `eventInteractive` (los turnos quedan tabulables y
  Enter dispara `eventClick`). `EVENT_SOURCE.failure` → `() => notify.error("No se pudieron cargar
  los turnos.")` (sin `console.error`). Las constantes siguen fuera del componente (comentario del
  loop infinito).
- `onEventClick`: además de `setSelected(...)` igual que hoy, guarda `lastEventElRef.current =
  arg.el`. `onSelect`: además de lo de hoy, `setSelected(null)` (si el panel estaba abierto, se
  cierra al elegir una franja para un turno nuevo).
- Leyenda: `<div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs
  text-muted-foreground"><span className="font-medium text-foreground">Servicios</span>` + por
  servicio `<span className="inline-flex items-center gap-1.5"><span aria-hidden className="h-2.5
  w-2.5 rounded-sm" style={{ background: s.color }} />{s.name}</span>` (el color es un dato).
- `<AppointmentDetailSheet appt={selected} … interactionAreaRef={calendarAreaRef}
  returnFocusRef={lastEventElRef} />` y `<NewAppointmentModal …>` con las mismas props de hoy.

**Detalle del turno (`AppointmentDetailSheet`):**

```
┌──────────────────────────────┐
│ Ana Pérez                  × │  SheetTitle = patientName ?? patientPhone
│ Consulta de seguimiento      │  SheetDescription = serviceName
│ [Confirmado] [En Google Cal.]│  Badge info|success|danger + Badge neutral
│                              │
│ Paciente      Ana Pérez      │  <dl> grid grid-cols-[7rem_1fr] gap-y-3 text-sm
│ Teléfono      5493515552345  │  dt text-muted-foreground, dd text-right? no: text-left font-medium
│ Servicio      Consulta …     │
│ Fecha         lunes 14/09/…  │  capitalize
│ Precio        $ 25.000,00    │  tabular-nums
│                              │
│ ─ Acciones ─────────────────  │  Separator
│ [✓ Marcar completado]        │  secondary, w-full justify-start
│ [✗ No asistió]               │  secondary
│ [🔔 Enviar recordatorio ahora]│  ghost
│ ──────────                   │
│ [Cancelar turno]             │  danger, w-full
│ El paciente recibe el aviso  │  text-xs text-muted-foreground
│ por WhatsApp.                │
│ <FormError />                │
└──────────────────────────────┘
```

- `<Sheet open={appt !== null} modal={false} onOpenChange={(o) => { if (!o) onClose(); }}>` +
  `<SheetContent side="right" className="w-full sm:max-w-sm" onInteractOutside={(e) => { if
  (interactionAreaRef?.current?.contains(e.target as Node)) e.preventDefault(); }}
  onCloseAutoFocus={(e) => { const el = returnFocusRef?.current; if (el?.isConnected) {
  e.preventDefault(); el.focus(); } }}>`.
- Para que el contenido no desaparezca durante la animación de cierre: `const [shown, setShown] =
  useState(appt); if (appt && appt !== shown) setShown(appt);` (ajuste de estado por prop, patrón
  documentado de React) y se renderiza `shown`. El cuerpo va en un subcomponente con
  `key={shown.id}`, así el error y el estado ocupado se reinician al cambiar de turno.
- Estados: `CONFIRMED` → `Badge tone="info"` "Confirmado"; `COMPLETED` → `tone="success"`
  "Completado"; `NO_SHOW` → `tone="danger"` "No asistió". `googleSynced` → `Badge tone="neutral"`
  "En Google Calendar".
- Fecha: `formatInTimeZone(new Date(appt.start), tz, "EEEE dd/MM/yyyy HH:mm", { locale: es })` +
  " hs" (`es` de `date-fns/locale`; hoy salía en inglés). Precio: `formatPrice(appt.price,
  currency)` como hoy.
- Acciones: **las mismas llamadas de hoy, con los mismos argumentos**, según `appt.status`
  (`CONFIRMED`: recordatorio, completado, no asistió, cancelar; si no: "Volver a confirmado").
  Íconos `Check`, `UserX`, `Bell`, `Undo2`. `busy: null | "reminder" | "completed" | "no_show" |
  "cancel" | "confirm"`: el botón tocado lleva `loading`, todos `disabled={busy !== null}`.
  Éxito de un cambio de estado → toast de §7 + `onChanged()` + `onClose()` (igual que hoy).
  Recordatorio → `notify.info("Recordatorio encolado.")` y el panel queda abierto (igual que hoy).
  Error → `<FormError />` en el panel (queda abierto).
- Las acciones van en `mt-6 space-y-2`, con `Separator` antes de "Cancelar turno".

**Nuevo turno (`NewAppointmentModal`):**

- `<Modal open onClose title="Nuevo turno" description="El paciente recibe la confirmación por
  WhatsApp.">`. Mismo `<form onSubmit={submit}>` y la misma lógica (`fetch` de `/api/slots`,
  `FormData` con los 4 campos, `createAppointmentAction({ ok: false }, fd)`).
- Horario: `<p id="nuevo-turno-horario" className="mb-2 text-sm font-medium">Horario</p>` y los
  horarios como `<ToggleGroup type="single" variant="outline" value={slot} onValueChange={(v) => v
  && setSlot(v)} aria-labelledby="nuevo-turno-horario" className="flex flex-wrap justify-start
  gap-2">` con `<ToggleGroupItem value={s} className="tabular-nums data-[state=on]:border-primary
  data-[state=on]:bg-primary data-[state=on]:font-semibold data-[state=on]:text-primary-foreground">`.
  Los mensajes "Elegí un servicio y un día." / "Buscando horarios…" / "No hay horarios disponibles
  ese día." quedan con esos textos en `text-sm text-muted-foreground` ("Buscando horarios…" con
  `LoaderCircle animate-spin` y `role="status"`).
- Error: `<FormError message={error} />`. Botones: "Cancelar" (`secondary`) y `<Button
  type="submit" loading={submitting} disabled={!slot}>{submitting ? "Creando…" : "Crear
  turno"}</Button>`. En éxito, además de lo de hoy, `notify.saved("Turno creado")`.

**Esqueleto (`(panel)/(calendario)/loading.tsx`):** `<div role="status" aria-busy="true"><span
className="sr-only">Cargando…</span>` + encabezado (`Skeleton h-8 w-40`, `h-4 w-72`, a la
derecha `h-9 w-32`) + franja `Skeleton mb-4 h-11 w-full rounded-lg` + tarjeta `rounded-lg border
p-4` con barra de herramientas (`h-8 w-28` · `h-6 w-48` · `h-8 w-44`, `justify-between`), una fila
de 7 `h-4` y `Skeleton h-[26rem] w-full`.

### 7.2 Disponibilidad (`/disponibilidad`)

**Estructura base:** `PageHeader` → grilla `lg:grid-cols-[minmax(0,2fr)_minmax(300px,1fr)]`:
horario semanal (izquierda) y excepciones (derecha, sticky).

```
Disponibilidad                          [+ Bloque de horario] [+ Excepción]
Tu horario habitual y las excepciones · America/Argentina/Buenos_Aires

┌ Horario semanal ───────────────────────────┐ ┌ Excepciones ─────────────┐
│ Tocá una franja vacía de un día para …     │ │ Feriados, días libres …  │
│      Lun  Mar  Mié  Jue  Vie  Sáb  Dom     │ │ ⊘ Lunes 12 de octubre  × │
│ 09:00 ┃09  ┃09  ┃09                         │ │   Día bloqueado · Feriado│
│       ┃13  ┃13  ┃13                         │ │ ◷ Viernes 16 …         × │
└────────────────────────────────────────────┘ └──────────────────────────┘
```

**Componentes clave:**

- `view.tsx`: el `div` de encabezado a mano → `PageHeader title="Disponibilidad"
  description={\`Tu horario habitual y las excepciones · ${timezone}\`} action={<>…</>}` con
  `Button variant="secondary"` (`Plus` "Bloque de horario") y `Button` (`Plus` "Excepción"). Mismos
  `onClick`.
- Las dos `section` → `Card title="Horario semanal" description="Tocá una franja vacía de un día
  para agregar un bloque."` y `Card title="Excepciones" description="Feriados, días libres y
  horarios especiales puntuales." className="lg:sticky lg:top-8"`. El párrafo de ayuda de
  `WeeklySchedule` pasa a la `description` de la tarjeta (se borra de `schedule.tsx`).
- `Modal title="Nueva excepción"` sin cambios de lógica.
- `schedule.tsx` (`WeeklySchedule`, mismo cálculo y `HOUR_PX`): contenedor `max-h-[calc(100vh-17rem)]
  min-h-72 overflow-auto` (entra a 663 px); horas `text-xs tabular-nums text-muted-foreground`; días
  `h-8 text-xs font-medium text-muted-foreground` (sin mayúsculas); columnas `border-r`, líneas
  `border-t border-border/60`; hover de columna `hover:bg-muted/60`; vacío "—" en `text-xs
  text-muted-foreground`.
- `Block`: `absolute inset-x-1 overflow-hidden rounded-md border-l-2 border-l-foreground bg-accent
  px-2 py-1`; horas `text-xs font-medium tabular-nums text-foreground` / `text-xs tabular-nums
  text-muted-foreground`. Quitar: `<button type="button" aria-label=… title="Quitar bloque"
  className="absolute right-0.5 top-0.5 flex h-6 w-6 items-center justify-center rounded-sm
  text-muted-foreground hover:bg-background hover:text-destructive focus-visible:outline-none
  focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40"><X className="h-3.5 w-3.5"
  aria-hidden /></button>` (mismo `aria-label`, mismo `start(() => deleteRuleAction(rule.id))`).
- `AddBlockModal`: mismo `<form action={action}>`; `Button type="submit" loading={pending}`
  ("Guardando…" / "Agregar bloque"), `useActionToast(state, { success: "Bloque agregado" })`,
  `FormError`.
- `exceptions.tsx`: vacío → `EmptyState icon={CalendarOff} title="Sin excepciones cargadas"
  description="Feriados, días libres u horarios especiales."`. Lista → `<ul className="divide-y">`;
  cada ítem `flex items-center justify-between gap-3 py-3` con ícono **por tipo** (no solo color):
  `Ban` `text-destructive` si `blocked`, `Clock` `text-foreground` si no; fecha `text-sm
  font-medium capitalize`; detalle `text-sm text-muted-foreground` (+ " · motivo"). Quitar: mismo
  botón de ícono `X` que los bloques (mismo `aria-label`, misma action).
- `ExceptionForm`: mismo `<form action>` y campos; `Button type="submit" loading={pending}`
  ("Guardando…" / "Agregar excepción"), `useActionToast(state, { success: "Excepción agregada" })`,
  `FormError`; la ayuda final en `text-xs text-muted-foreground`.

**Esqueleto (`disponibilidad/loading.tsx`):** encabezado (`h-8 w-48`, `h-4 w-96`, dos `h-9 w-36` a
la derecha) + la misma grilla con `CardSkeleton bare lines={10}` y `CardSkeleton bare lines={4}`,
dentro de `role="status"` + "Cargando…".

### 7.3 Servicios (`/servicios`)

**Estructura base:** `PageHeader` con "Nuevo servicio" → sección "Activos" → sección "Inactivos".
Tarjetas en grilla `sm:grid-cols-2 xl:grid-cols-3`. Alta y edición en panel lateral.

```
Servicios                                                   [+ Nuevo servicio]
Consultas, estudios y precios que ofrecés. El bot los muestra a los pacientes.

Activos  3
┌─────────────────────────┐ ┌─────────────────────────┐ ┌──────────────────┐
│ ● Primera consulta      │ │ ● Seguimiento           │ │ ● Antropometría  │
│ $ 25.000 · 60 min       │ │ …                       │ │ …                │
│ [Requiere seña]         │ │                         │ │ [Recomendaciones]│
│ Descripción en 2 líneas │ │                         │ │                  │
│ [✎ Editar]   Activo [●]│ │                         │ │                  │
└─────────────────────────┘ └─────────────────────────┘ └──────────────────┘
```

**Componentes clave:**

- `page.tsx`: consultas y `toView` **idénticos**. `div space-y-10` → `space-y-8`. Vacío (sin
  ningún servicio) → `<Card><EmptyState icon={Tag} title="Todavía no hay servicios"
  description="Cargá el primero para que el bot pueda ofrecerlo." action={<NewServiceButton
  label="Crear el primer servicio" />} /></Card>`. Secciones con `SectionLabel` → `<h2
  className="mb-4 flex items-center gap-2 text-base font-semibold">Activos <Badge
  tone="neutral">{n}</Badge></h2>`. "No hay servicios activos." en `text-sm text-muted-foreground`.
- `NewServiceButton`: default `label="Nuevo servicio"` (sin "+"), `Plus` delante. `Modal` →
  `<Sheet open onOpenChange={setOpen}><SheetContent side="right" className="w-full
  sm:max-w-xl"><SheetHeader><SheetTitle>Nuevo servicio</SheetTitle><SheetDescription>El bot lo
  ofrece a los pacientes por WhatsApp.</SheetDescription></SheetHeader><div
  className="mt-6"><ServiceForm onDone={() => setOpen(false)} /></div></SheetContent></Sheet>`.
- `ServiceCard`: `Card` con `className={cn("flex flex-col", !service.active && "bg-muted/40")}`.
  Encabezado: punto de color `h-2.5 w-2.5 shrink-0 rounded-full` (`style` con el color; `title`
  y `sr-only` "Color en el calendario") + `h3 text-base font-semibold`; si inactivo, `Badge
  tone="neutral"` "Inactivo". Precio y duración: `<p className="mt-2 text-sm tabular-nums"><span
  className="font-medium">{priceLabel}</span><span className="mx-1.5
  text-muted-foreground">·</span>{durationMin} min</p>`. `requiresDeposit` → `Badge
  tone="neutral"` "Requiere seña"; `prepInstructions` → `Badge tone="info"` "Manda recomendaciones
  previas" (`flex flex-wrap gap-2 mt-3`). Descripción `line-clamp-2 text-sm text-muted-foreground`.
  Pie `mt-auto flex items-center justify-between pt-5`: `Button variant="secondary" size="sm"`
  (`Pencil` "Editar") y `<div className="flex items-center gap-2"><Label
  htmlFor={\`activo-${service.id}\`} className="text-sm text-muted-foreground">Activo</Label><Switch
  id=… checked={service.active} disabled={pending} aria-busy={pending || undefined}
  onCheckedChange={(checked) => start(() => toggleServiceAction(service.id, checked))} /></div>`
  (`checked` es `!service.active` al tocarlo: **misma llamada** que hoy). Edición: el mismo
  `Sheet` que el alta, con `SheetTitle` `\`Editar · ${service.name}\`` y `<ServiceForm
  editing={service} onDone={() => setEditing(false)} />`.
- `ServiceForm`: mismo `<form action>`, mismos campos, `hidden` y `name`. Cambios visuales:
  colores → `h-8 w-8 rounded-md ring-offset-2 ring-offset-background` con el seleccionado
  `ring-2 ring-foreground` (y `aria-pressed`), "Otro" → `inline-flex h-8 items-center gap-2
  rounded-md border border-input px-2 text-sm hover:bg-accent` con el `input type="color"`
  adentro; checkboxes nativos `h-4 w-4 accent-primary` (se mantienen nativos: mismo `FormData`);
  separadores `border-t pt-4`; "Horas antes" con `NumberInput unit="h" step={1}` (mismo `name`, `min`, `max`,
  `required`); "Precio" y "Valor" de la seña quedan `Input type="number"` (la unidad es la moneda
  o un %, según el tipo). Botón `loading={pending}` ("Guardando…" / "Guardar cambios" / "Crear
  servicio"), `useActionToast`, `FormError`. Se borra "Guardado.". `PRESET_COLORS` no cambia (son
  datos del servicio, no tokens).

**Esqueleto (`servicios/loading.tsx`):** encabezado + `h-5 w-24` + grilla `sm:grid-cols-2
xl:grid-cols-3` con 3 `CardSkeleton bare lines={4}`.

### 7.4 Pagos (`/pagos`) — reordenamiento 3

**Estructura base:** `PageHeader` con "Registrar pago" → totales (3 `StatTile`) → tarjeta con
filtros visibles y tabla.

```
Pagos                                                        [+ Registrar pago]
Señas cobradas por Mercado Pago y facturación del mes.

┌ Cobrado este mes ─┐ ┌ Pendiente de confirmar ─┐ ┌ Pagos del mes ──────────┐
│ $ 15.000,00       │ │ $ 0,00                  │ │ 1                       │
│                   │ │ 0 señas esperando       │ │ 0 Mercado Pago · 1 manual│
└───────────────────┘ └─────────────────────────┘ └─────────────────────────┘
┌ Pagos ─────────────────────────────────────────────────────────────────────┐
│ Pendientes de confirmar y pagos acreditados este mes.                       │
│ [🔍 Paciente o servicio… ] [Todos 1|Pendientes 0|Acreditados 1] [Medio ▾]  │
│ [Tipo ▾]                                     1 de 1   [Limpiar filtros]     │
│ Estado      Paciente   Servicio   Turno          Fecha ↓   Tipo  Medio  Monto│
│ Acreditado  Ana Pérez  Consulta   07/09/26 10:00 07/09/26  Total Manual $15.000│
└─────────────────────────────────────────────────────────────────────────────┘
```

**Componentes clave:**

- `page.tsx`: el bloque `Promise.all` y `totalThisMonth` **idénticos**; `appointmentOptions`
  idéntico. Se agregan solo cálculos de presentación sobre esos datos: `pendingTotal =
  pending.reduce((s, p) => s + Number(p.amount), 0)`, `mpCount`/`manualCount` de
  `approvedThisMonth` (regla `p.provider === "manual"`, la de hoy) y `rows: PaymentRow[]` =
  pendientes + acreditados mapeados según §6.2 (fechas con `formatInTimeZone` de
  `@nutri-bot/core`, que ya se importa en el panel).
- `PageHeader title="Pagos" description="Señas cobradas por Mercado Pago y facturación del mes."
  action={<ManualPaymentDialog appointments={appointmentOptions} />}`.
- Totales: `<div className="grid gap-4 sm:grid-cols-3">` con `StatTile label="Cobrado este mes"
  value={formatPrice(totalThisMonth, pro.currency)}`, `StatTile label="Pendiente de confirmar"
  value={formatPrice(pendingTotal, pro.currency)}` + `<p className="mt-1 text-xs
  text-muted-foreground">{n} seña(s) esperando</p>` (singular/plural) y `StatTile label="Pagos del
  mes" value={approvedThisMonth.length}` + `<p …>{mpCount} Mercado Pago · {manualCount}
  manual(es)</p>`.
- `<Card title="Pagos" description="Pendientes de confirmar y pagos acreditados este mes."
  padding="none"><PaymentsTable rows={rows} /></Card>`.
- `PaymentsTable` (cliente): barra de filtros `flex flex-wrap items-center gap-3 border-b px-6 py-4`:
  - Búsqueda: `relative w-full sm:max-w-xs` + `Search` a la izquierda + `Input type="search"
    className="pl-9" placeholder="Paciente o servicio…"` con `label` `sr-only` "Buscar pagos".
    Filtra por `patient` y `service`, sin tildes ni mayúsculas (`normalize("NFD")`).
  - Estado: `ToggleGroup type="single" variant="outline" aria-label="Estado"` (mismo estilo de
    segmented control que `plans-section.tsx` de la 002b: `rounded-md border border-input p-0.5
    [&>button]:border-0`, activo `data-[state=on]:font-semibold`) con "Todos (n)", "Pendientes
    (n)", "Acreditados (n)". `onValueChange={(v) => v && setStatus(v)}`.
  - Medio: `Select` nativo (`w-auto`) con `sr-only` label "Medio de pago": "Todos los medios",
    "Mercado Pago", "Manual".
  - Tipo: `Select` nativo con `sr-only` label "Tipo de pago": "Todos los tipos", "Seña", "Total".
  - A la derecha (`ml-auto`): `<p className="text-sm tabular-nums text-muted-foreground">{filtrados}
    de {total}</p>` y, si hay algún filtro activo, `Button variant="ghost" size="sm"` "Limpiar
    filtros".
  - `DataTable<PaymentRow>` con `caption="Pagos"`, `maxHeightClassName="max-h-[60vh]"`,
    `initialSort={{ columnId: "fecha", direction: "desc" }}` y columnas: `estado` ("Estado":
    `Badge tone="warning"` "Pendiente" / `tone="success"` "Acreditado"; `sortValue` = status),
    `paciente` (`font-medium`, `sortValue`), `servicio` (`text-muted-foreground`), `turno`
    ("Turno", `appointmentLabel`, `tabular-nums whitespace-nowrap`), `fecha` ("Fecha",
    `dateLabel`, `sortValue` = `new Date(dateISO)`), `tipo` ("Seña"/"Total"), `medio` ("Mercado
    Pago"/"Manual"), `monto` ("Monto", `numeric`, `amountLabel`, `sortValue` = `amount`,
    `font-medium`).
  - `empty`: sin filas → `EmptyState icon={Wallet} title="Todavía no hay pagos registrados"
    description="Acá aparecen las señas de Mercado Pago y los pagos que registres a mano."`; con
    filas pero filtro vacío → `EmptyState icon={SearchX} title="Ningún pago coincide con los
    filtros" action={<Button variant="secondary" size="sm" onClick={limpiar}>Limpiar
    filtros</Button>}`.
- `ManualPaymentDialog`: `Button` (`Plus` "Registrar pago") + `<Modal title="Registrar pago manual"
  description="Efectivo o transferencia, asociado a un turno confirmado de la última o la próxima
  semana.">` + `<ManualPaymentForm appointments onDone={() => setOpen(false)} />`.
- `ManualPaymentForm`: mismo `<form action>`, mismos `name` (`appointmentId`, `kind`, `amount`) y
  defaults. Layout de diálogo: `grid gap-4` (Turno a todo el ancho; Tipo y Monto en
  `sm:grid-cols-2`), botón a la derecha `loading={pending}` ("Guardando…" / "Registrar pago"),
  `useActionToast(state, { success: "Pago registrado" })`, `FormError`, y `useEffect(() => { if
  (state.ok) onDone?.(); }, [state, onDone])`. Sin turnos → `EmptyState title="No hay turnos para
  asociar" description="Tiene que haber un turno confirmado entre hace 7 días y dentro de 7 días."`
  (misma condición que hoy, dicha con otras palabras).

**Esqueleto (`pagos/loading.tsx`):** encabezado + 3 `Skeleton h-24` en `sm:grid-cols-3` + fila de
filtros (`h-9 w-72`, `h-9 w-64`, `h-9 w-40`) + `TableSkeleton bare rows={6} columns={8}`.

### 7.5 Avisos (`/avisos`)

**Estructura base:** `PageHeader` → tarjeta "Comunicado a todos los pacientes" (arriba, como hoy)
→ tarjeta "Cola de mensajes" con estado en vivo, filtros y tabla.

```
Avisos
Cola de mensajes que envía el bot: confirmaciones, cancelaciones y recordatorios.

┌ Comunicado a todos los pacientes ──────────────────────────────────────────┐
│ Para avisos generales (cambio de horario, vacaciones, saludos). …           │
│ [ textarea                                                               ]  │
│ Se envía a 10 pacientes por WhatsApp.        [➤ Enviar a los 10 pacientes]  │
└─────────────────────────────────────────────────────────────────────────────┘
┌ Cola de mensajes ───────────────────── ● En vivo · 0 pendientes [Actualizar][Pausar]
│ [Todos 4|Pendientes 0|Enviados 4|Fallidos 0]          [↻ Reintentar 2 fallidos]
│ Estado     Tipo          Destinatario    Mensaje                 Fecha      │
│ [Enviado]  Confirmación  5493515552345   Hola Ana, tu turno …    14/09 · 10:00
└─────────────────────────────────────────────────────────────────────────────┘
```

**Componentes clave:**

- `page.tsx`: consultas, `counts` y `rows` **idénticos**. `Card title="Comunicado a todos los
  pacientes" description="Para avisos generales (cambio de horario, vacaciones, saludos). Se manda
  por WhatsApp a todos los pacientes cargados, no a uno en particular." className="mb-6"` +
  `<BroadcastForm patientCount={patientCount} />`.
- `BroadcastForm`: **exactamente el patrón de §6.3**.
- `AvisosView` → `Card padding="none" title="Cola de mensajes" actions={…}`:
  - `actions`: `<p role="status" aria-atomic="true" className="flex items-center gap-2 text-sm
    text-muted-foreground">` con punto `h-2 w-2 rounded-full` (`bg-success
    motion-safe:animate-pulse` en vivo, `bg-muted-foreground` pausado) + "En vivo"/"Pausado" + "·
    N pendiente(s)" + (si hay) "· <span className="font-medium text-destructive">N con
    error</span>"; y `Button variant="ghost" size="sm"` "Actualizar" (`RotateCw`) y
    "Pausar"/"Reanudar". Mismos handlers.
  - Filtros (`border-b px-6 py-3 flex flex-wrap items-center gap-3`): `ToggleGroup type="single"
    variant="outline" aria-label="Filtrar por estado"` (estilo segmented de la 002b) con "Todos
    (n)", "Pendientes (n)", "Enviados (n)", "Fallidos (n)"; si `counts.FAILED > 0`, el ítem
    "Fallidos" lleva `text-destructive`. `onValueChange={(v) => v && setFilter(v)}`. "Reintentar
    N fallido(s)" → `Button variant="secondary" size="sm" className="ml-auto"` con `RotateCw`,
    `loading={retryingAll}` ("Reintentando…"), mismo `startRetryAll(() => retryAllFailedAction())`.
  - `DataTable<MessageRow>` (`caption="Mensajes salientes"`, `maxHeightClassName="max-h-[60vh]"`,
    sin orden: la consulta ya viene por fecha descendente) con columnas `estado` (`Badge`:
    PENDING `warning` "Pendiente", SENT `success` "Enviado", FAILED `danger` "Falló"), `tipo`
    (`font-medium whitespace-nowrap`), `destinatario` (`tabular-nums text-muted-foreground
    whitespace-nowrap`), `mensaje` (`className="min-w-64"`; `<p className="line-clamp-2
    text-muted-foreground">{body}</p>` + si hay error `<p className="mt-1 text-xs
    text-destructive">Error: {error}</p>`), `fecha` (`tabular-nums whitespace-nowrap
    text-muted-foreground`), `accion` (header "" + `sr-only` "Acciones"; si FAILED, `RetryButton`).
  - `RetryButton`: `Button variant="ghost" size="sm" loading={pending}` "Reintentar" con
    `aria-label={\`Reintentar el mensaje a ${to}\`}`, mismo `start(() => retryMessageAction(id))`.
  - Vacíos: sin mensajes → `EmptyState icon={Inbox} title="Todavía no hay mensajes"
    description="El bot los va a listar acá cuando envíe confirmaciones o recordatorios."`; filtro
    vacío → `EmptyState title="No hay mensajes en este filtro."`.
  - `readOnly` (§4 D-c7): no se renderiza `AutoRefresh`; "Actualizar"/"Pausar" ocultos;
    `RetryButton` y "Reintentar todos" con `disabled` y `title="Página de prueba: solo lectura"`.

**Esqueleto (`avisos/loading.tsx`):** encabezado + `CardSkeleton bare lines={3}` + `mt-6` +
`TableSkeleton bare rows={6} columns={5}`.

### 7.6 Asistente (`/asistente`)

**Estructura base:** `PageHeader` → una tarjeta de chat de ancho de lectura (`max-w-3xl`), con la
conversación arriba y la caja de pregunta abajo.

```
Asistente
Consultas rápidas sobre tu agenda, tus pacientes o la facturación, con IA.
┌───────────────────────────────────────────────────────────┐
│            ✦  Preguntale al asistente                      │ vacío
│  Preguntame por tu agenda, un paciente puntual …           │
│                                   ┌───────────────────┐    │
│                                   │ ¿Qué turnos tengo │    │ usuario: bg-primary
│                                   └───────────────────┘    │
│ ┌──────────────────────────┐                               │
│ │ Mañana tenés 3 turnos …  │                               │ asistente: bg-muted
│ └──────────────────────────┘                               │
│ ◌ Pensando…                                                │
│ ───────────────────────────────────────────────────────── │
│ [ Escribí tu pregunta…                        ] [➤ Preguntar]
│ Enter envía · Shift + Enter hace un salto de línea          │
└───────────────────────────────────────────────────────────┘
```

**Componentes clave:**

- `page.tsx`: `<div className="max-w-3xl">` + `PageHeader` igual + `<Card
  padding="none"><AssistantChat /></Card>`.
- `AssistantChat`: misma lógica (`ask`, `startTransition(async …)`, `askAssistantAction(messages,
  q)`). Conversación: `<div aria-live="polite" className="max-h-[calc(100vh-20rem)] min-h-48
  space-y-3 overflow-y-auto p-6">`. Vacío → `EmptyState icon={Sparkles} title="Preguntale al
  asistente" description='Preguntame por tu agenda, un paciente puntual o la facturación. Ej:
  "¿qué turnos tengo mañana?" o "contame de Ricardo".'` (mismo texto). Burbujas `inline-block
  max-w-[85%] whitespace-pre-wrap rounded-lg px-3 py-2 text-left text-sm`: usuario `bg-primary
  text-primary-foreground`, asistente `bg-muted text-foreground`. Pendiente: `<p role="status"
  className="flex items-center gap-2 text-sm text-muted-foreground"><LoaderCircle
  className="h-4 w-4 animate-spin" aria-hidden />Pensando…</p>`. Al cambiar `messages.length` o
  `pending`, `endRef.current?.scrollIntoView({ block: "end" })` (el contenedor scrollea solo).
- Caja: `border-t p-4 flex items-end gap-3` con `Textarea rows={2}` (mismo `onKeyDown`) con
  `aria-label="Pregunta"` y `Button type="button" onClick={ask} loading={pending}` (`Send`
  "Preguntar"). Debajo `text-xs text-muted-foreground` "Enter envía · Shift + Enter hace un salto de
  línea". Error → `<FormError message={error} />`.
- Sin `loading.tsx` propio: la página no consulta datos.

### 7.7 Ajustes (`/ajustes`) — reordenamiento 6

**Estructura base:** `PageHeader` → índice lateral (pestañas verticales) + panel de ancho de
lectura.

```
Ajustes
Configuración del panel, el bot y las integraciones.

┌──────────────────┐  ┌ General ──────────────────────────────────────────┐
│▌General          │  │ Zona horaria, moneda, recordatorios y datos …     │
│ Bot de WhatsApp  │  │ [Zona horaria        ] [Moneda  ]                  │
│ Google Calendar  │  │ [Aviso previo (h)    ] [Tu WhatsApp ]              │
│ PDF del plan     │  │ [Obras sociales                               ]    │
└──────────────────┘  │                               [Guardar ajustes]    │
   w-52, sticky       └───────────────────────────────────────────────────┘ max-w-3xl
```

**Componentes clave:**

- `page.tsx`: consultas **idénticas**; se arma `defaults: SettingsDefaults` con **las mismas 7
  expresiones** de hoy y los cuatro paneles como `ReactNode`, y se renderiza `<PageHeader …/>` +
  `<SettingsFormProvider><AjustesTabs panels={{ general, whatsapp, google, pdf }}
  /></SettingsFormProvider>`.
  - **general**: `<Card title="General" description="Zona horaria, moneda, recordatorios y datos que
    usa el bot."><SettingsGeneralFields defaults={defaults} /></Card>`.
  - **whatsapp**: `<Card title="Bot de WhatsApp" description="El bot nunca contesta mensajes
    comunes: solo se activa cuando alguien escribe una palabra clave como turno, turnos o menú.
    Igual podés apagarlo del todo.">` (texto de hoy; las `<em>` pasan a la descripción como texto)
    con: fila `flex flex-wrap items-center justify-between gap-3` "Conexión" + `Badge
    tone="success"` "Conectado" / `tone="danger"` "Desconectado" y `ButtonLink variant="secondary"
    size="sm" href="/ajustes/whatsapp"` (`QrCode` "Ver QR y vinculación"); `Separator
    className="my-4"`; `<BotToggle paused={pro.botPaused} />`.
  - **google**: `<Card title="Google Calendar" description="Sincroniza los turnos confirmados con
    tu calendario de Google." actions={googleConnected ? <Badge tone="success">Conectado</Badge> :
    <Badge tone="warning">Sin conectar</Badge>}>`; si `pro.googleSyncError`, `<Alert tone="danger"
    title="Error de sincronización" className="mb-4">{pro.googleSyncError}. Reconectá para renovar
    el permiso.</Alert>`; la fila de los dos `<form>` **textuales** (solo cambian las clases del
    contenedor: `flex flex-wrap gap-3`); y `GoogleCalendarForm` si está conectado.
  - **pdf**: `<div className="space-y-6">` con `<Card title="Logo" description="Este logo aparece
    en los PDFs de los planes alimentarios que le enviás a tus pacientes."><LogoForm
    hasLogo=… /></Card>` y `<Card title="Estilo del PDF" description="Color y pie de página del PDF
    del plan."><SettingsPdfFields defaults={defaults} /></Card>`.
- `AjustesTabs`: `<Tabs orientation="vertical" value={tab} onValueChange=… className="lg:grid
  lg:grid-cols-[13rem_minmax(0,1fr)] lg:items-start lg:gap-10">`.
  - `TabsList` (`aria-label="Secciones de ajustes"`): `className="w-full overflow-x-auto lg:sticky
    lg:top-8 lg:h-auto lg:flex-col lg:items-stretch lg:gap-0.5 lg:overflow-visible lg:border-b-0"`
    (a `< lg` queda la barra horizontal subrayada del primitivo).
  - `TabsTrigger`: ícono + etiqueta, `className="gap-2 lg:relative lg:mb-0 lg:h-8 lg:justify-start
    lg:rounded-md lg:border-b-0 lg:px-2 lg:py-0 lg:hover:bg-accent lg:data-[state=active]:bg-accent
    lg:data-[state=active]:before:absolute lg:data-[state=active]:before:inset-y-1.5
    lg:data-[state=active]:before:left-0 lg:data-[state=active]:before:w-0.5
    lg:data-[state=active]:before:rounded-full lg:data-[state=active]:before:bg-foreground"`. El
    activo se distingue por fondo **y** barra (como la sidebar) y por `aria-selected`.
  - `TabsContent forceMount className="max-w-3xl data-[state=inactive]:hidden lg:mt-0"`.
- `SettingsGeneralFields`: grilla `grid gap-4 sm:grid-cols-2` con los 5 `Field` de hoy (mismas
  etiquetas, hints, `name`, `required`, `min`/`max`, `maxLength`, `defaultValue`, `placeholder`),
  cada control con `form={SETTINGS_FORM_ID}`. "Aviso previo del recordatorio (horas)" → `NumberInput step={1}
  unit="h"` (mismo `name`, `min`, `max`, `required`, `defaultValue`; `step={1}` porque el default
  de `NumberInput` es `"any"` y hoy el navegador rechaza decimales: se conserva). Pie `flex items-center
  justify-end gap-3 sm:col-span-2` con `<SettingsSubmit />`.
- `SettingsPdfFields`: `Field label="Color de acento del PDF" hint="Se usa en los títulos y
  separadores del PDF del plan"` con `<input type="color" name="pdfAccentColor"
  form={SETTINGS_FORM_ID} defaultValue={defaults.pdfAccentColor || DEFAULT_PDF_ACCENT}
  className="h-9 w-16 cursor-pointer rounded-md border border-input bg-background p-1" />`
  (**`DEFAULT_PDF_ACCENT` de `@/lib/pdf-theme`**, no `"#3c7a24"`, D-b2), el `Field` del pie
  (`Textarea name="pdfFooterText" form=…`, mismo hint) y `<SettingsSubmit />`. Nota
  `text-xs text-muted-foreground` debajo: "Se guarda junto con los ajustes generales."
- `BotToggle` → `Switch`: `<div className="flex items-start justify-between gap-6"><div><Label
  htmlFor="bot-activo" className="text-sm font-medium">Bot activo</Label><p id="bot-activo-desc"
  className={cn("mt-1 text-sm", paused ? "font-medium text-warning" :
  "text-muted-foreground")}>{paused ? "El bot no está respondiendo ningún mensaje." : "El bot
  responde solo ante palabras clave (turno, menú…)."}</p></div><Switch id="bot-activo"
  checked={!paused} disabled={pending} aria-busy={pending || undefined}
  aria-describedby="bot-activo-desc" onCheckedChange={(checked) => start(() =>
  setBotPausedAction(!checked))} /></div>`. `!checked` es `!paused` al tocarlo: **misma
  llamada** que hoy.
- `GoogleCalendarForm`: mismo `<form action>` y `name="calendarId"`; `Button variant="secondary"
  size="sm" loading={pending}` ("Guardando…"/"Guardar"), `useActionToast(state, { success:
  "Calendario guardado" })`, `FormError`. Contenedor `mt-4 flex flex-wrap items-end gap-3`.
- `LogoForm`: preview `h-16 w-16 rounded-md border object-contain p-1` (o `flex h-16 w-16
  items-center justify-center rounded-md border border-dashed text-xs text-muted-foreground` "Sin
  logo", con `Image` `h-5 w-5`); `input type="file"` con `className="text-sm text-muted-foreground
  file:mr-3 file:h-8 file:cursor-pointer file:rounded-md file:border file:border-input
  file:bg-background file:px-3 file:text-sm file:font-medium file:text-foreground
  hover:file:bg-accent"` (mismo `name`, `accept`, `required`); "Subir logo" `loading={pending}`
  ("Subiendo…"); "Quitar" igual (form con `removeLogoAction`); `useActionToast(state, { success:
  "Logo actualizado" })`, `FormError`.

**Esqueleto (`ajustes/loading.tsx`):** encabezado + `grid lg:grid-cols-[13rem_minmax(0,1fr)]
lg:gap-10` con 4 `Skeleton h-8` apilados y `CardSkeleton bare lines={6}` (`max-w-3xl`).

### 7.8 Vinculación de WhatsApp (`/ajustes/whatsapp`)

**Estructura base:** `PageHeader` con "Volver a ajustes" → tarjeta de estado (y QR) de ancho de
lectura.

- `PageHeader title="Vinculación de WhatsApp" description="El bot corre como un proceso aparte.
  Escaneá el QR para vincular el número." back={{ href: "/ajustes?tab=whatsapp", label: "Volver a
  ajustes" }}` (vuelve a la pestaña del bot). Se borra el "← Volver" a mano.
- `<Card title="Estado" className="max-w-3xl">` con `Badge tone="success"`/`"danger"` +
  "Última conexión: …" (`text-sm text-muted-foreground tabular-nums`, mismo formato).
- QR: instrucciones como `<ol className="mb-4 list-decimal space-y-1 pl-5 text-sm
  text-muted-foreground">` ("Abrí WhatsApp en el teléfono.", "Entrá a **Dispositivos
  vinculados** → Vincular un dispositivo.", "Escaneá este código."); imagen `h-60 w-60 rounded-md
  border`; ASCII `<pre className="overflow-x-auto rounded-md bg-foreground p-4 text-xs
  leading-none text-background">`.
- Sin QR y sin conexión: `Alert tone="info" title="Esperando al bot…"` con "Verificá que el
  proceso esté corriendo (" `<code className="rounded bg-muted px-1 font-mono
  text-xs">npm run dev:bot</code>` ")." Conectado: "El número está vinculado y el bot está
  operativo." en `text-sm text-muted-foreground`.
- Pie `text-xs text-muted-foreground` "Esta página se actualiza sola cada pocos segundos." y el
  mismo `<AutoRefresh seconds={5} />`.
- **Esqueleto (`ajustes/whatsapp/loading.tsx`):** `h-4 w-32` (volver) + encabezado +
  `CardSkeleton bare lines={4}` `max-w-3xl` (sin este archivo, `/ajustes/whatsapp` mostraría el
  esqueleto de pestañas de `/ajustes`).

### 7.9 Estado del bot en la sidebar

**No se toca** (O3 de la 002a): se actualiza al recargar. Ni `components/shell/**` ni
`(panel)/layout.tsx` entran en esta HU, así que la sidebar sigue entrando a 1366 × 663 (se
re-verifica en el recorrido, §13.5).

---

## 8. Rutas / server actions / API

- **No se crean ni cambian** rutas de API ni server actions. `(panel)/page.tsx` se **mueve** a
  `(panel)/(calendario)/page.tsx` (misma URL). `/ajustes` acepta `?tab=` (opcional).
- **Ruta temporal para el recorrido** (checklist fase 10; la usa y **la borra el orquestador**,
  §13.6): `src/app/(panel)/prueba-002c/page.tsx` (server, solo renderiza el cliente) +
  `prueba-002c-client.tsx` (cliente) con **datos en memoria**, sin importar ninguna server action
  directamente:
  - `PaymentsTable` con **30** filas ficticias (pendientes y acreditadas, Mercado Pago y manual,
    seña y total, nombres con tildes, montos de 3 a 7 cifras) y otra instancia con `rows={[]}`.
  - `AvisosView readOnly` con **30** mensajes ficticios (los tres estados, 5 fallidos con
    `error`, cuerpos largos) y sus `counts`.
  - `BroadcastForm patientCount={3} sendAction={accionFalsa}`, con `accionFalsa` definida **a nivel
    de módulo** en el archivo cliente: `async (_prev, fd) => { await new Promise((r) =>
    setTimeout(r, 800)); const body = String(fd.get("body") ?? "").trim(); return body.length < 3 ?
    { ok: false, error: "Escribí un mensaje" } : { ok: true, sent: 3 }; }`. Arriba, un `Alert
    tone="info"` "Página de prueba: nada se envía ni se guarda."
  - Queda detrás de `middleware.ts` y del layout con `auth()`, como el resto del panel.

## 9. Mensajes del bot

No aplica. No cambia ningún mensaje (los textos que encolan las actions viven en `packages/db` y
en las actions, que no se tocan).

---

## 10. Radio de impacto (lista exacta)

**Modificados**

- `apps/web/src/components/modal.tsx` (+`description?`)
- `apps/web/src/app/(panel)/page.tsx` → **movido** a `apps/web/src/app/(panel)/(calendario)/page.tsx`
  (solo cambia el import de `calendar-client`)
- `apps/web/src/app/(panel)/calendar-client.tsx`
- `apps/web/src/app/(panel)/new-appointment-modal.tsx`
- `apps/web/src/app/(panel)/appointment-detail-modal.tsx` → **renombrado** a
  `apps/web/src/app/(panel)/appointment-detail-sheet.tsx` (`git mv` + reescritura)
- `apps/web/src/app/(panel)/disponibilidad/view.tsx`, `schedule.tsx`, `exceptions.tsx`
- `apps/web/src/app/(panel)/servicios/page.tsx`, `new-service-button.tsx`, `service-card.tsx`,
  `service-form.tsx`
- `apps/web/src/app/(panel)/pagos/page.tsx`, `manual-payment-form.tsx`
- `apps/web/src/app/(panel)/avisos/page.tsx`, `avisos-view.tsx`, `broadcast-form.tsx`
- `apps/web/src/app/(panel)/asistente/page.tsx`, `assistant-chat.tsx`
- `apps/web/src/app/(panel)/ajustes/page.tsx`, `settings-form.tsx`, `bot-toggle.tsx`,
  `logo-form.tsx`, `google-calendar-form.tsx`, `whatsapp/page.tsx`

**Creados**

- `apps/web/src/app/(panel)/(calendario)/loading.tsx`
- `apps/web/src/app/(panel)/disponibilidad/loading.tsx`
- `apps/web/src/app/(panel)/servicios/loading.tsx`
- `apps/web/src/app/(panel)/pagos/payments-table.tsx`, `manual-payment-dialog.tsx`, `loading.tsx`
- `apps/web/src/app/(panel)/avisos/loading.tsx`
- `apps/web/src/app/(panel)/ajustes/ajustes-tabs.tsx`, `loading.tsx`, `whatsapp/loading.tsx`
- Temporales (§8): `apps/web/src/app/(panel)/prueba-002c/page.tsx`, `prueba-002c-client.tsx`
- `progress/impl_HU-002c.md`

**Borrados (artefacto generado, no versionado):** `apps/web/.next/types/app/(panel)/page.ts`
(queda viejo al mover `page.tsx`; §11 paso 2.2).

**No se tocan** (verificable por diff, §13.2): todas las `actions.ts` de esta HU y
`(panel)/actions.ts`; `api/**`; `components/ui.tsx`, `confirm.tsx`, `data-table.tsx`,
`skeletons.tsx`, `number-input.tsx`, `auto-refresh.tsx`, `components/shell/**`,
`primitives/**`; `lib/notify.ts`, `lib/pdf-theme.ts` (solo se importa), `lib/plan-pdf.tsx`;
`(panel)/layout.tsx`, `(panel)/loading.tsx`, `error.tsx`, `not-found.tsx`; `tailwind.config.ts`,
`globals.css`; `pacientes/**`, `alimentos/**`, `plantillas/**` (002d), `(portal)/**`;
`packages/**`, `apps/bot/**`.

---

## 11. Checklist de ejecución (atómico y en orden; al final de cada fase el panel compila y funciona)

No hay pasos en `packages/db` ni en `packages/core`. Todo es `apps/web`. Cada fase termina con
`npm run typecheck --workspace apps/web` en verde.

### Fase 0: preflight

- [ ] 0.1 `git -C /Users/joelmiguelserrudo/Documents/Projects/Nutri-Bot branch --show-current` →
      `hu-002-rediseno-ui-empresarial`. Copiar el `git status --porcelain` inicial en `impl`.
- [ ] 0.2 `pgrep -fl "next dev"`: anotar el PID. Con un dev levantado, **nada de `next build`** y
      no se levanta otro.
- [ ] 0.3 `npm run typecheck --workspace apps/web` en verde (línea base).
- [ ] 0.4 Anotar en `impl` que se leyeron §2.1 y §6.3 (reglas duras y patrón de `useConfirm`).

### Fase 1: componente compartido

- [ ] 1.1 `components/modal.tsx`: prop opcional `description` (§6.2). Sin `description`, el render
      queda idéntico al de hoy.

### Fase 2: calendario

- [ ] 2.1 `git mv "apps/web/src/app/(panel)/page.tsx" "apps/web/src/app/(panel)/(calendario)/page.tsx"`
      y cambiar **solo** `import { CalendarClient } from "./calendar-client"` →
      `"../calendar-client"`.
- [ ] 2.2 `rm -f "apps/web/.next/types/app/(panel)/page.ts"` (tipo generado viejo; si no, `tsc`
      falla buscando `src/app/(panel)/page.js`). typecheck verde.
- [ ] 2.3 Crear `(panel)/(calendario)/loading.tsx` (§7.1).
- [ ] 2.4 `git mv "apps/web/src/app/(panel)/appointment-detail-modal.tsx" "apps/web/src/app/(panel)/appointment-detail-sheet.tsx"`
      y reescribirlo como `AppointmentDetailSheet` (§6.2, §7.1). Mismas actions con los mismos
      argumentos.
- [ ] 2.5 `new-appointment-modal.tsx` (§7.1): `description`, `ToggleGroup` de horarios, `FormError`,
      `loading`, toast. La lógica de `submit` y del `fetch` queda igual.
- [ ] 2.6 `calendar-client.tsx` (§7.1): franja, tarjeta, `eventInteractive`, `notify.error` en
      `failure`, refs (`calendarAreaRef`, `lastEventElRef`), `setSelected(null)` en `onSelect`,
      import del Sheet. typecheck verde.

### Fase 3: disponibilidad

- [ ] 3.1 `view.tsx`, `schedule.tsx`, `exceptions.tsx` (§7.2). Actions, `name` y `aria-label`
      iguales.
- [ ] 3.2 Crear `disponibilidad/loading.tsx`. typecheck verde.

### Fase 4: servicios

- [ ] 4.1 `service-form.tsx` (§7.3): estilo, `NumberInput` de "Horas antes", feedback. Mismos `name`.
- [ ] 4.2 `new-service-button.tsx` y `service-card.tsx`: `Sheet` en vez de `Modal`, `Switch` de
      activo con la misma llamada.
- [ ] 4.3 `servicios/page.tsx` (vacío y secciones) y `servicios/loading.tsx`. typecheck verde.

### Fase 5: pagos

- [ ] 5.1 Crear `pagos/payments-table.tsx` (§6.2, §7.4).
- [ ] 5.2 `manual-payment-form.tsx`: `onDone?`, layout de diálogo, feedback. Mismos `name`.
- [ ] 5.3 Crear `pagos/manual-payment-dialog.tsx`.
- [ ] 5.4 `pagos/page.tsx`: bloque `Promise.all`, `totalThisMonth` y `appointmentOptions`
      **idénticos**; totales, `rows` y composición nueva. Crear `pagos/loading.tsx`. typecheck verde.

### Fase 6: avisos

- [ ] 6.1 `broadcast-form.tsx` con **el fragmento de §6.3, tal cual**. Verificación local:
      `grep -n "action=" broadcast-form.tsx` → 0 líneas (el `<form>` no tiene `action`);
      `grep -n "requestSubmit" broadcast-form.tsx` → 0; `grep -n "confirm(" broadcast-form.tsx` →
      solo `await confirm({`.
- [ ] 6.2 `avisos-view.tsx` (§7.5) con `readOnly?`.
- [ ] 6.3 `avisos/page.tsx` (tarjeta del comunicado) y `avisos/loading.tsx`. typecheck verde.

### Fase 7: asistente

- [ ] 7.1 `asistente/page.tsx` y `assistant-chat.tsx` (§7.6). typecheck verde.

### Fase 8: ajustes

- [ ] 8.1 Reescribir `settings-form.tsx` (§6.2, §7.7): `SETTINGS_FORM_ID`, `SettingsDefaults`,
      `SettingsFormProvider`, `SettingsGeneralFields`, `SettingsPdfFields`, `SettingsSubmit`
      interno. **Los 7 controles y el botón de `SettingsSubmit` con `form={SETTINGS_FORM_ID}`**. Color inicial con
      `DEFAULT_PDF_ACCENT`.
- [ ] 8.2 `bot-toggle.tsx` (Switch), `google-calendar-form.tsx`, `logo-form.tsx` (§7.7).
- [ ] 8.3 Crear `ajustes/ajustes-tabs.tsx` (§6.2, §7.7).
- [ ] 8.4 `ajustes/page.tsx`: consultas **idénticas**, los dos forms inline **textuales**, paneles y
      composición. Crear `ajustes/loading.tsx`.
- [ ] 8.5 `ajustes/whatsapp/page.tsx` (§7.8) y `ajustes/whatsapp/loading.tsx`. typecheck verde.

### Fase 9: limpieza del sistema viejo en los archivos de la HU

- [ ] 9.1 Correr §13.3 (1), (2), (3) y (4) → 0 líneas (salvo las excepciones escritas).

### Fase 10: página temporal para el recorrido (la borra el orquestador)

- [ ] 10.1 Crear `(panel)/prueba-002c/page.tsx` + `prueba-002c-client.tsx` (§8), con datos solo en
      memoria. `grep -n "actions\"" "apps/web/src/app/(panel)/prueba-002c/"*` → 0 (no importa
      ninguna server action).
- [ ] 10.2 typecheck verde. Anotar en `impl` la ruta temporal, con el aviso de que la borra el
      orquestador después del recorrido (con sus tipos de `.next/types`, §13.6).

### Fase 11: verificación y cierre

- [ ] 11.1 Correr §13.1–§13.4 y anotar los resultados en `progress/impl_HU-002c.md`, con lo que no
      se pudo verificar y por qué.
- [ ] 11.2 No commitear. Devolver `done -> progress/impl_HU-002c.md`.

---

## 12. Tests

**No hay lógica de dominio nueva.** Los filtros de pagos y avisos, las sumas de los totales y el
armado de filas son presentación sobre datos que ya trae la página (sin reglas de negocio), así que
quedan en `apps/web` sin tests (vitest solo corre en `packages/core`, y la HU no puede tocar
`packages/`). `npm run test` tiene que seguir en verde (49 tests).

---

## 13. Verificación (comandos exactos antes de declararse `done`)

Todo desde `/Users/joelmiguelserrudo/Documents/Projects/Nutri-Bot` salvo que se indique otra cosa.

### 13.1 Compilación y arnés

```bash
npm run typecheck --workspace apps/web     # verde
npm run typecheck                          # todos los workspaces (bot y packages no cambian)
npm run test                               # vitest de packages/core, sigue en verde (49)
./ops/harness/verify.sh                    # exit 0
```

`next build` **no** se corre si `pgrep -fl "next dev"` devuelve algo (es lo esperado). Anotarlo.

### 13.2 Alcance del diff

```bash
git status --porcelain
git diff --stat -- packages apps/bot                                                     # vacío
git diff --name-only -- \
  'apps/web/src/app/(panel)/actions.ts' \
  'apps/web/src/app/(panel)/disponibilidad/actions.ts' 'apps/web/src/app/(panel)/servicios/actions.ts' \
  'apps/web/src/app/(panel)/pagos/actions.ts' 'apps/web/src/app/(panel)/avisos/actions.ts' \
  'apps/web/src/app/(panel)/asistente/actions.ts' 'apps/web/src/app/(panel)/ajustes/actions.ts' \
  apps/web/src/app/api apps/web/src/components/ui.tsx apps/web/src/components/confirm.tsx \
  apps/web/src/components/data-table.tsx apps/web/src/components/skeletons.tsx \
  apps/web/src/components/shell apps/web/src/components/primitives apps/web/src/lib \
  'apps/web/src/app/(panel)/layout.tsx' 'apps/web/src/app/(panel)/loading.tsx' \
  apps/web/tailwind.config.ts apps/web/src/app/globals.css \
  'apps/web/src/app/(panel)/pacientes' 'apps/web/src/app/(panel)/alimentos' 'apps/web/src/app/(panel)/plantillas' \
  'apps/web/src/app/(portal)' apps/web/src/middleware.ts                                  # vacío

# Consultas idénticas (HEAD vs. ahora). Cada diff → vacío.
Q='prisma\.|list[A-Z][A-Za-z]*\(|get[A-Z][A-Za-z]*\(|where:|orderBy|include:|take:|_count|groupBy|findUnique|findFirst|count\('
diff <(git show HEAD:"apps/web/src/app/(panel)/page.tsx" | grep -E "$Q") <(grep -E "$Q" "apps/web/src/app/(panel)/(calendario)/page.tsx")
for p in disponibilidad servicios pagos avisos ajustes ajustes/whatsapp; do
  echo "== $p"; diff <(git show HEAD:"apps/web/src/app/(panel)/$p/page.tsx" | grep -E "$Q") <(grep -E "$Q" "apps/web/src/app/(panel)/$p/page.tsx")
done
# El page.tsx movido solo cambia el import
git diff -M HEAD --stat -- 'apps/web/src/app/(panel)/page.tsx' 'apps/web/src/app/(panel)/(calendario)/page.tsx'   # rename, 1 línea

# Mismos "name" de campos (conjuntos). Cada diff → vacío.
N='name="[a-zA-Z]+"'
for f in servicios/service-form.tsx pagos/manual-payment-form.tsx disponibilidad/schedule.tsx disponibilidad/exceptions.tsx \
         avisos/broadcast-form.tsx ajustes/settings-form.tsx ajustes/google-calendar-form.tsx ajustes/logo-form.tsx; do
  echo "== $f"; diff <(git show HEAD:"apps/web/src/app/(panel)/$f" | grep -oE "$N" | sort -u) <(grep -oE "$N" "apps/web/src/app/(panel)/$f" | sort -u)
done
# Ajustes: los 7 controles + 2 botones asociados al formulario único
grep -c "form={SETTINGS_FORM_ID}" "apps/web/src/app/(panel)/ajustes/settings-form.tsx"     # 8 (5 de General + 2 del PDF + el botón de SettingsSubmit, que se usa dos veces)
# Los forms inline de ajustes siguen textuales
grep -n 'signIn("google", { redirectTo: "/ajustes" })\|action={disconnectGoogleAction}' "apps/web/src/app/(panel)/ajustes/page.tsx"   # 2 líneas
```

Los únicos cambios fuera de `apps/web/` son `progress/impl_HU-002c.md` y los archivos ajenos
anotados en 0.1. **No hay cambios en `package.json` ni `package-lock.json`** (esta HU no instala
nada).

### 13.3 Sistema viejo, confirm y consola

Desde `apps/web`:

```bash
FILES=( src/components/modal.tsx
  "src/app/(panel)/(calendario)/page.tsx" "src/app/(panel)/(calendario)/loading.tsx"
  "src/app/(panel)/calendar-client.tsx" "src/app/(panel)/new-appointment-modal.tsx" "src/app/(panel)/appointment-detail-sheet.tsx"
  "src/app/(panel)/disponibilidad/"*.tsx "src/app/(panel)/servicios/"*.tsx "src/app/(panel)/pagos/"*.tsx
  "src/app/(panel)/avisos/"*.tsx "src/app/(panel)/asistente/"*.tsx
  "src/app/(panel)/ajustes/"*.tsx "src/app/(panel)/ajustes/whatsapp/"*.tsx )
# (1) Tokens/clases viejos → 0 líneas
grep -nE "(bg|text|border|ring|fill|stroke|divide|accent|outline|from|to|placeholder|decoration)-(ink|leaf|mint|paper|line|brand)\b|font-display|rounded-card|shadow-card|shadow-lift|uppercase|tracking-\[|border-2|\breveal\b|\bpress\b|text-\[[0-9]+px\]|(amber|red|green|blue)-[0-9]|tone(=|: )\"(slate|green|red|amber|blue)\"|✓|← " "${FILES[@]}"
# (2) Hex sueltos → solo PRESET_COLORS de service-form.tsx (datos del servicio)
grep -nE "#[0-9a-fA-F]{3,8}\b" "${FILES[@]}" | grep -v "service-form.tsx:.*PRESET_COLORS"
# (3) Sin console.* ni TODO
grep -nE "console\.|TODO|FIXME" "${FILES[@]}"
# (4) Sin Modal en los archivos que pasaron a Sheet
grep -n "components/modal" "src/app/(panel)/appointment-detail-sheet.tsx" "src/app/(panel)/servicios/"*.tsx
# (5) confirm() nativo: queda exactamente 1 llamada (plantillas/[id]/delete-template-button.tsx:10, de la 002d).
#     También aparece el comentario de pacientes/[id]/planes/[planId]/delete-plan-button.tsx:14 (esperado, no es una llamada).
#     broadcast-form.tsx NO tiene que aparecer.
grep -rn "confirm(" src | grep -v "useConfirm\|components/confirm.tsx\|await confirm({"
# (6) Color por defecto del PDF
grep -n "3c7a24" -r src                                                   # 0
grep -n "DEFAULT_PDF_ACCENT" "src/app/(panel)/ajustes/settings-form.tsx"  # import + uso
# (7) Ningún archivo apunta al viejo detalle modal
grep -rn "appointment-detail-modal\|AppointmentDetailModal" src           # 0
```

### 13.4 Lo que el implementer puede verificar sin navegador

- Que `(panel)/(calendario)/page.tsx` y `loading.tsx` existen y que `(panel)/page.tsx` no existe.
- Revisión de código del patrón de §6.3 en `broadcast-form.tsx` (orden: `preventDefault` →
  `FormData` → `await confirm` → `startTransition(dispatch)`), y que `AssistantChat`,
  `AppointmentDetailSheet` y `ServiceCard` no llaman a `useConfirm`.
- Que `prueba-002c` no importa server actions (10.1).

### 13.5 Recorrido visual (lo hace el orquestador con el navegador; lista concreta)

Ventana de **1366 × 800** (viewport útil **1366 × 663**) salvo que se diga otra cosa. En cada
pantalla, en la consola: `document.documentElement.scrollWidth <= window.innerWidth` → `true`.
**Prohibido en todo el recorrido:** "Crear turno", cualquier botón de acción del panel del turno
(completado, no asistió, recordatorio, cancelar, volver a confirmado), "Enviar a los N pacientes"
en `/avisos` real, "Reintentar", el switch del bot, el switch "Activo" de un servicio, la × de un
bloque o una excepción, "Guardar ajustes", "Registrar pago", "Subir logo"/"Quitar", "Conectar" o
"Desconectar" Google, "Cerrar sesión". Datos reales de desarrollo (solo lectura, consultados el
2026-09-24): no hay turnos en la semana actual; la **semana anterior (14–20 sept)** tiene turnos
`CONFIRMED` (`cmtyq7u0a003pxnwsnvw2cf0w` el 14, `cmtytsunv000bx91e24ssgyoh` el 14 **con Google**,
`cmtyq7tz7000exnws6d01jedw` el 15, `cmtyq7u03002oxnws3bgkcqud` el 17); un `COMPLETED`
(`cmtyq7u0d0042xnwsyrmtgsqa`, 7 sept) y un `NO_SHOW` (`cmtyq7u02002mxnwsfjuso8am`, 2 sept). Pagos:
0 pendientes, 1 acreditado en septiembre. Avisos: 4 enviados, 0 fallidos. 10 pacientes. 3
servicios activos. 8 bloques de horario, 0 excepciones. Bot desconectado, sin QR. Google conectado
sin error. Sin logo. Acento del PDF `#2563eb`. Contar mensajes antes y después:
`docker compose exec -T db psql -U nutri -d nutribot -Atc 'select count(*) from "OutboundMessage";'`
→ tiene que dar **lo mismo** al final (hoy 4).

1. **Sidebar** a 1366 × 663: entran todas las secciones y el pie sin scroll
   (`nav.scrollHeight == nav.clientHeight`), como en la 002a. Esta HU no toca el shell.
2. **`/`**: franja de una línea (hoy, semana, próximo); el calendario arranca a < 220 px del
   borde superior. `<` una semana → turnos del 14–17. Clic en un turno → panel a la derecha **sin
   overlay**, fecha en español ("lunes 14/09/2026 …"), badge de estado y "En Google Calendar" en
   `cmtytsunv000bx91e24ssgyoh`. **Con el panel abierto, clic en otro turno** → el panel cambia de
   contenido sin cerrarse. Escape → cierra y el foco vuelve al turno. Tab por el calendario →
   los turnos reciben foco visible; Enter abre el panel. `<` hasta el 7 y el 2 de septiembre →
   paneles de COMPLETED ("Volver a confirmado") y NO_SHOW. **No tocar ningún botón del panel.**
3. **Nuevo turno**: "Nuevo turno" → diálogo con la descripción de WhatsApp; elegir servicio y un
   día hábil → horarios como grupo (flechas izquierda/derecha los recorren, el elegido se
   distingue por fondo **y** peso). Clic en una franja vacía del calendario → abre el diálogo con
   ese día (y cierra el panel si estaba abierto). **Cancelar** / Escape. No crear.
4. **Carga**: DevTools → Network → "Slow 4G", navegar a `/` desde otra sección → esqueleto con la
   forma del calendario (no el genérico de dos tarjetas). Repetir en `/disponibilidad`,
   `/servicios`, `/pagos`, `/avisos`, `/ajustes` y `/ajustes/whatsapp` → cada uno con su forma.
5. **`/disponibilidad`**: encabezado del sistema, grilla sin mayúsculas que entra a 663 px (scroll
   dentro de la tarjeta), bloques con la barra oscura; excepciones vacías con `EmptyState`. Clic
   en una franja vacía → "Nuevo bloque de atención" con el día/hora; Escape. "Excepción" → diálogo;
   Escape. **No tocar la ×.**
6. **`/servicios`**: 3 tarjetas con punto de color, precio y duración tabulares, badges. "Editar" →
   **panel lateral** con el formulario; activar "Requiere seña" y "Mandar recomendaciones" en el
   formulario (solo UI, sin guardar) y verificar que el panel scrollea; "Horas antes" con la unidad
   "h"; Escape → el foco vuelve a "Editar". "Nuevo servicio" → panel vacío; Escape. **No tocar el
   switch "Activo".**
7. **`/pagos`**: 3 totales arriba; tabla con 1 fila; filtros visibles (búsqueda, estado, medio,
   tipo); "Pendientes" → vacío "Ningún pago coincide…" + "Limpiar filtros". "Registrar pago" →
   diálogo con descripción; Escape. **No registrar.**
8. **`/avisos`** (real): tarjeta del comunicado con el contador de pacientes; cola en tabla con 4
   enviados; filtros como control segmentado; "Pausar"/"Reanudar" cambia el estado en vivo
   (solo UI). **No escribir en el comunicado ni tocar "Enviar".**
9. **`/prueba-002c`**:
   - Pagos: 30 filas, encabezado fijo al scrollear **dentro** de la tabla, montos a la derecha con
     cifras tabulares; orden por Monto y por Fecha (ícono + `aria-sort`); cada filtro y sus
     combinaciones, contador "N de 30", "Limpiar filtros"; la instancia vacía muestra
     "Todavía no hay pagos registrados".
   - Avisos (`readOnly`): 30 filas, "Falló" con el error debajo, "Reintentar" y "Reintentar 5
     fallidos" **deshabilitados**, filtro "Fallidos (5)" en tono de error; el estado dice
     "Pausado"/"En vivo" sin refrescar la página.
   - **Difusión (flujo completo, action falsa):** escribir "Prueba" → "Enviar a los 3 pacientes"
     → aparece el **diálogo del sistema** "¿Enviar este comunicado?" con el foco en "Cancelar" →
     Escape → no pasa nada y el texto sigue. Otra vez → "Cancelar" → igual. Otra vez →
     "Enviar a 3 pacientes" → el botón queda en "Enviando…" ~0,8 s → toast "Encolado para 3
     pacientes" y el textarea se vacía. Con "ab" (2 caracteres): confirmar → error "Escribí un
     mensaje" debajo **y el texto se conserva**. Con solo espacios: no pide confirmación y muestra
     el error. Al final, el conteo de `OutboundMessage` sigue igual.
10. **`/asistente`**: vacío con el ícono y el texto de ejemplo; caja de pregunta con la ayuda de
    Enter/Shift+Enter. (Opcional, **solo si el usuario lo autoriza**: una pregunta de lectura, "¿qué
    turnos tuve el 14 de septiembre?"; consume la API de DeepSeek y **no escribe** en la base.
    Ver "Pensando…" con el ícono girando y el scroll al último mensaje.)
11. **`/ajustes`**: índice lateral con 4 secciones; el activo con fondo **y** barra; flechas
    arriba/abajo recorren las pestañas; la URL cambia a `?tab=…`, recargar la mantiene y "atrás"
    no recorre pestañas. *General*: 5 campos, "Aviso previo" con unidad "h". *Bot de WhatsApp*:
    "Desconectado", "Ver QR y vinculación", switch "Bot activo" encendido con su descripción
    (**no tocarlo**). *Google Calendar*: "Conectado", sin alerta de error, formulario del
    calendario. *PDF del plan*: "Sin logo", selector de color en `#2563eb` (el guardado), pie.
    **Formulario único, sin guardar**: en la consola,
    `[...document.getElementById("ajustes-generales").elements].map(e => e.name).filter(Boolean)`
    → `["timezone","currency","reminderLeadHours","phone","acceptedInsurances","pdfAccentColor","pdfFooterText"]`
    (el orden puede variar; tienen que estar los 7). Escribir algo en "Obras sociales", ir a *PDF*
    y volver: el texto sigue. Recargar para descartar.
12. **`/ajustes/whatsapp`**: "Volver a ajustes" lleva a `/ajustes?tab=whatsapp`; estado
    "Desconectado"; callout "Esperando al bot…" con `npm run dev:bot`; la página se refresca sola.
13. **A 768 × 1024**: `/`, `/pagos`, `/avisos` y `/ajustes` sin scroll horizontal fuera de las
    tablas; en `/ajustes` las pestañas pasan arriba en una fila; el panel del turno ocupa el ancho
    en pantallas chicas y se cierra con la X.
14. **Movimiento reducido** (DevTools → Rendering → `prefers-reduced-motion: reduce`): el panel del
    turno y el de servicios aparecen sin deslizar; el punto "En vivo" no late.
15. **Contraste** (DevTools): texto de la franja del calendario, hints de ajustes, "Pendiente" y
    "Falló" de los badges ≥ 4,5:1; borde de los `Select` de filtros ≥ 3:1.

### 13.6 Cierre del recorrido (lo hace el orquestador)

Después del recorrido y **antes** de aprobar:

```bash
cd /Users/joelmiguelserrudo/Documents/Projects/Nutri-Bot
rm -r "apps/web/src/app/(panel)/prueba-002c"
rm -rf "apps/web/.next/types/app/(panel)/prueba-002c"     # si no, tsc falla con tipos viejos de la ruta borrada
git status --porcelain | grep prueba-                      # vacío
npm run typecheck --workspace apps/web                     # verde otra vez
```

Si quedara alguna otra ruta temporal de HU anteriores (`prueba-002b`, `prueba-error`,
`prueba-pdf`), mismo tratamiento: borrar la carpeta en `src/app/(panel)/` **y** su carpeta en
`apps/web/.next/types/app/(panel)/`.

---

## 14. Observaciones y decisiones para el orquestador (no bloquean)

- **D-c1, panel del turno no modal.** No atrapa el foco a propósito (§4). Si el usuario prefiere
  que se comporte como diálogo, es `modal={true}` en `AppointmentDetailSheet` (vuelve el overlay y
  para ver otro turno hay que cerrar primero).
- **D-c3, formulario único en ajustes.** Un caso borde: si la profesional **vacía** un campo
  obligatorio de *General* (zona horaria, moneda o aviso previo), cambia a *PDF* y guarda, el
  navegador bloquea el envío porque el campo inválido está oculto y no puede mostrar el aviso
  (aparece un error en la consola). Hoy no pasa porque todo está en una columna. Es poco probable
  (los tres tienen valor guardado) y se resuelve volviendo a *General*. Si molesta, el arreglo es
  mover el color y el pie del PDF a *General* (pierde el agrupamiento del reordenamiento 6).
- **D-c5, la difusión conserva el texto si falla.** Hoy React lo borraba siempre. Es el único
  cambio de comportamiento visible y va en la línea del Gherkin.
- **O-c1, acciones que mandan WhatsApp o borran sin confirmar.** "Cancelar turno" (manda la
  cancelación al paciente), "Reintentar N fallidos", "Quitar" logo y la × de bloques y excepciones
  se ejecutan con un clic, sin confirmación, **hoy y después de esta HU** (sumar confirmaciones es
  un cambio de funcionalidad). Recomendación: una tarea puntual con `useConfirm` (respetando §6.3)
  al menos para "Cancelar turno" y "Reintentar todos".
- **O-c2, colores de estado del calendario.** `api/appointments/route.ts` pinta COMPLETED y NO_SHOW
  con `#16a34a` y `#dc2626` (fuera de los tokens) y la leyenda no los explica. La API queda fuera de
  alcance; si se quiere, en la 002d o una tarea aparte: pasarlos a `--success`/`--destructive` y
  sumarlos a la leyenda.
- **O-c3, alcance de los datos de pagos.** La tabla muestra todos los pendientes pero solo los
  acreditados del mes (son las consultas de hoy). "Cobrado este mes" usa el mes de la hora del
  servidor, no de `pro.timezone` (igual que hoy). Si hace falta ver meses anteriores, es una
  consulta nueva: otra HU.
- **O-c4, pestañas verticales en pantallas chicas.** Con `orientation="vertical"`, a < 1024 px
  (donde la lista se ve horizontal) las flechas que recorren las pestañas siguen siendo arriba y
  abajo. Tab y clic funcionan normal. Aceptable.
- **O-c5, Google OAuth.** El `signIn` inline vuelve a `/ajustes` (sin `?tab=google`), así que
  después de reconectar se abre *General*. Cambiarlo implicaría tocar el action inline: queda así.
- **O-c6, asistente.** Si la consulta falla, la pregunta se borra de la caja (hoy también). No se
  toca en esta HU.
- **O-c7, Sonner y paneles.** Un clic sobre un toast con un `Sheet` **modal** abierto (servicios)
  lo cierra (Radix `DismissableLayer`, ya anotado en 002a/002b). El panel del turno es no modal y
  no tiene ese problema.

## 15. Dudas técnicas abiertas

Ninguna bloqueante. Las decisiones D-c1 a D-c7 están tomadas y justificadas; el orquestador puede
revisarlas con el usuario, pero no impiden implementar.
