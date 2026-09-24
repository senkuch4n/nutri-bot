# impl HU-002c — `rediseno-ui-agenda-gestion` (Rediseño UI 3/4: agenda y gestión)

**Estado: `done`** (código completo; `typecheck` de los 4 workspaces, `npm run test` (49),
`./ops/harness/verify.sh` (exit 0) y todos los greps de §13.2/§13.3 de la SDD en verde).
**Salvedades para el orquestador** en "Lo que no se pudo verificar": el recorrido visual (§13.5)
es del orquestador, y la ruta temporal `/prueba-002c` queda creada para eso (la borra el
orquestador, §13.6).

SDD: `Refactorizaciones/rediseno-ui-agenda-gestion.md`. HU: `docs/hu-rediseno-ui-empresarial.md`
("Resoluciones", fila HU-002c). Base: HU-002a y HU-002b. Rama: `hu-002-rediseno-ui-empresarial`.
Sin commits. Decisiones D-c1 a D-c7 de §14 aplicadas tal como están.

---

## Restricciones duras (copiadas tal cual de la SDD, §2.1)

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

**Cumplimiento:** no se leyó ni escribió en la base de desarrollo (ni siquiera un `psql`: la
página de prueba usa fixtures en memoria), no se levantó el bot, no se mandó nada por WhatsApp,
no se corrió `next build` ni otro `next dev`, no se corrió ningún comando de Prisma, no se tocó
`tailwind.config.ts`, `globals.css`, `backlog.json` ni ninguna server action ni `api/**`. Las
`page.tsx` no le pasan funciones a componentes cliente: `cell`, `sortValue`, `getRowId` y los
íconos de las pestañas viven dentro de los componentes cliente. `useConfirm` solo se usa en
`broadcast-form.tsx`, en un handler de evento con `preventDefault` incondicional (§6.3). Se leyeron
§2.1 y §6.3 antes de tocar código (fase 0.4).

---

## Fase 0: preflight

- `git branch --show-current` → `hu-002-rediseno-ui-empresarial`.
- `git status --porcelain` inicial: `?? docker-compose.prod.yml` (único ajeno; no tocado).
- `pgrep -fl "next dev"` → pid **86416** (`next dev` del usuario en el 3000). No se corrió `next build`.
- `npm run typecheck --workspace apps/web` → verde (línea base).
- Skills invocados: `ui-ux-pro-max` (búsquedas `--domain ux` sobre panel lateral, filtros de tabla,
  pestañas verticales y `--stack shadcn` sobre tablas) y `ui-styling` antes del JSX; ambos
  compatibles con la SDD. Una diferencia anotada: shadcn recomienda TanStack Table para tablas con
  orden/filtro; **manda la SDD** (el `DataTable` propio de la 002a, que no se toca).
  `web-design-guidelines` al final (ver "Autochequeo").

## Fase 1: `components/modal.tsx`

- Prop opcional `description?: string`. Con `description`: `<DialogDescription>` dentro de
  `<DialogHeader>` y **no** se pasa `aria-describedby` (Radix enlaza la suya). Sin `description`:
  `aria-describedby={undefined}` como antes (render idéntico). Firma igual a §6.2.

## Fase 2: calendario

- 2.1 `git mv "(panel)/page.tsx" "(panel)/(calendario)/page.tsx"`; único cambio: el import
  `"./calendar-client"` → `"../calendar-client"` (`git diff -M --stat` → rename, 1 línea).
- 2.2 Borrado `apps/web/.next/types/app/(panel)/page.ts` (tipo generado viejo). typecheck verde.
- 2.3 `(calendario)/loading.tsx` con la forma del calendario (encabezado, franja `h-11`, tarjeta
  con toolbar, fila de 7 días y bloque `h-[26rem]`), dentro de `role="status"` + "Cargando…".
- 2.4 `git mv appointment-detail-modal.tsx appointment-detail-sheet.tsx` y reescritura como
  `AppointmentDetailSheet` (D-c1): `Sheet modal={false}` `side="right"` `w-full sm:max-w-sm`;
  `onInteractOutside` → `preventDefault` si el objetivo está dentro de `interactionAreaRef`;
  `onCloseAutoFocus` → foco a `returnFocusRef` si `isConnected`. Estado `shown` conservado
  durante la animación de cierre; cuerpo en `AppointmentBody key={shown.id}` (error y `busy` se
  reinician por turno). Badges `info`/`success`/`danger` + `neutral` "En Google Calendar". Fecha
  con `{ locale: es }` (antes salía el día en inglés). **Mismas actions con los mismos
  argumentos**: `setStatusAction(id, "COMPLETED"|"NO_SHOW"|"CONFIRMED")`,
  `cancelAppointmentAction(id)`, `sendReminderNowAction(id)`. Toasts de §7 (tabla de textos
  exactos). `busy` tipado `null | "reminder" | "completed" | "no_show" | "cancel" | "confirm"`.
- 2.5 `new-appointment-modal.tsx`: `description`, horarios en `ToggleGroup type="single"` con
  `aria-labelledby`, "Buscando horarios…" con `LoaderCircle` + `role="status"`, `FormError`,
  `Button loading`, `notify.saved("Turno creado")`. `submit`, `fetch` de `/api/slots` y el
  `FormData` de 4 campos **sin cambios**.
- 2.6 `calendar-client.tsx`: franja `<dl aria-label="Resumen de turnos">` con `Separator`
  vertical, tarjeta `ref={calendarAreaRef}`, barra de carga `h-0.5 bg-primary`,
  `eventInteractive` (turnos tabulables, Enter abre), `EVENT_SOURCE.failure` →
  `notify.error("No se pudieron cargar los turnos.")` (sin `console.error`),
  `lastEventElRef.current = arg.el` en `onEventClick`, `setSelected(null)` en `onSelect`, leyenda
  con `rounded-sm`. Props del componente **sin cambios**. typecheck verde.

## Fase 3: disponibilidad

- `view.tsx`: `PageHeader` con dos botones (`Plus` "Bloque de horario" secondary, `Plus`
  "Excepción" primary; mismos `onClick`), `Card title/description` para las dos secciones
  (`lg:sticky lg:top-8` en excepciones). El párrafo de ayuda pasó a la `description` de la tarjeta.
- `schedule.tsx`: contenedor `max-h-[calc(100vh-17rem)] min-h-72 overflow-auto`, días/horas en
  `text-xs` sin mayúsculas, bloques `rounded-md border-l-2 border-l-foreground bg-accent`, quitar
  con `<X>` (mismo `aria-label`, misma `deleteRuleAction`). `AddBlockModal`: `loading`,
  `useActionToast("Bloque agregado")`, `FormError`. `HOUR_PX` y el cálculo iguales.
- `exceptions.tsx`: vacío con `EmptyState icon={CalendarOff}`, lista `divide-y` con ícono por tipo
  (`Ban` destructive / `Clock`), quitar con `<X>` (mismo `aria-label`, misma
  `deleteExceptionAction`). `ExceptionForm`: `loading`, toast "Excepción agregada", `FormError`.
- `disponibilidad/loading.tsx` creado. typecheck verde.

## Fase 4: servicios

- `service-form.tsx`: swatches `h-8 w-8 rounded-md` con `ring-2 ring-foreground` + `aria-pressed`
  (y `focus-visible:ring`), "Otro" con borde del sistema, checkboxes `accent-primary`, "Horas
  antes" con `NumberInput unit="h" step={1}` (mismo `name`, `min`, `max`, `required`), separadores
  `border-t pt-4`, `loading`, toast `editing ? "Servicio guardado" : "Servicio creado"`,
  `FormError`; se borró "Guardado.". `PRESET_COLORS` intacto. Mismos `name` y `hidden`.
- `new-service-button.tsx`: default `label="Nuevo servicio"` con `Plus`; `Sheet` `sm:max-w-xl`
  con título y descripción.
- `service-card.tsx`: `Card` con punto de color (+ `sr-only`), badges, precio/duración
  `tabular-nums`, `Pencil` "Editar", `Switch` "Activo" con `Label htmlFor` y
  `onCheckedChange={(checked) => start(() => toggleServiceAction(service.id, checked))}` (al
  tocarlo `checked === !service.active`: **misma llamada**). Edición en el mismo `Sheet`.
- `servicios/page.tsx`: consultas y `toView` idénticos; vacío con `EmptyState icon={Tag}`;
  secciones `h2` + `Badge` con el conteo; grilla `sm:grid-cols-2 xl:grid-cols-3`.
  `servicios/loading.tsx` creado. typecheck verde.

## Fase 5: pagos

- `payments-table.tsx` (nuevo, cliente): `PaymentRow` **exacto** al de §6.2. Filtros: búsqueda
  (`label sr-only`, `normalize("NFD")` sobre paciente y servicio), `ToggleGroup` de estado con
  conteos, `Select` nativos de medio y tipo con `label sr-only`, contador "N de M" y "Limpiar
  filtros" (`ghost`) solo con filtro activo. `DataTable` con `caption="Pagos"`,
  `max-h-[60vh]`, orden inicial `fecha desc`, 8 columnas de §7.4 (`monto` `numeric`). Vacíos:
  `Wallet` sin filas / `SearchX` + "Limpiar filtros" con filtro vacío. `columns` a nivel de módulo
  (funciones dentro del cliente).
- `manual-payment-form.tsx`: `onDone?` (se llama en `useEffect` cuando `state.ok`), layout de
  diálogo (`grid gap-4`, Tipo/Monto en `sm:grid-cols-2`), `loading`, toast "Pago registrado",
  `FormError`, `EmptyState` sin turnos. Mismos `name` (`appointmentId`, `kind`, `amount`) y defaults.
- `manual-payment-dialog.tsx` (nuevo): `Plus` "Registrar pago" + `Modal` con `description`.
- `pagos/page.tsx`: bloque `Promise.all`, `totalThisMonth` y `appointmentOptions` **idénticos**
  (verificado con el diff de consultas, más abajo). Presentación nueva: `pendingTotal`,
  `mpCount`/`manualCount` (regla `p.provider === "manual"`), `rows` con `toRow` según §6.2
  (`dateISO` = `paidAt ?? createdAt` para APPROVED, `createdAt` para PENDING). 3 `StatTile` +
  `Card padding="none"` con `PaymentsTable`. Se quitó el import de `formatDate` (ya no se usa).
  `pagos/loading.tsx` creado. typecheck verde.

## Fase 6: avisos

- `broadcast-form.tsx`: **fragmento de §6.3 tal cual** (`preventDefault` → `new FormData` →
  `await confirm({…})` solo si hay texto → `startTransition(() => dispatch(formData))`). Sin
  `action=` en el `<form>`, sin `requestSubmit`. Reset del formulario **solo si `state.ok`**
  (D-c5). Prop opcional `sendAction` con default `broadcastMessageAction`. Toast de éxito con el
  texto de hoy. Único agregado fuera del fragmento: `aria-label="Mensaje del comunicado"` en el
  `Textarea` (no tenía label; ver "Autochequeo").
  Verificación 6.1: `grep -n "action=" broadcast-form.tsx` → 0; `grep -n "requestSubmit"` → 0;
  `grep -n "confirm("` → solo la línea `await confirm({`.
- `avisos-view.tsx`: `Card padding="none" title="Cola de mensajes"` con el estado en vivo
  (`role="status"`, punto `bg-success motion-safe:animate-pulse` / `bg-muted-foreground`),
  "Actualizar" (`RotateCw`) y "Pausar"/"Reanudar"; filtros en `ToggleGroup` ("Fallidos" en
  `text-destructive` si hay), "Reintentar N fallido(s)" (`loading`, misma `retryAllFailedAction`);
  `DataTable` con las 6 columnas de §7.5 (`caption="Mensajes salientes"`, `max-h-[60vh]`, sin
  orden). `RetryButton` con `aria-label="Reintentar el mensaje a <to>"` y la misma
  `retryMessageAction(id)`. Vacíos con `EmptyState` (`Inbox`). `readOnly?` (D-c7): sin
  `AutoRefresh`, sin "Actualizar", "Reintentar" y "Reintentar todos" `disabled` con
  `title="Página de prueba: solo lectura"`. **Decisión no obvia:** en `readOnly` el botón
  "Pausar"/"Reanudar" **queda visible** (la §7.5 lo ocultaba, pero el recorrido §13.5.9 pide ver
  el estado "Pausado"/"En vivo" sin refrescar); solo cambia el texto del estado, no llama a nada.
- `avisos/page.tsx`: consultas, `counts` y `rows` idénticos; `Card title/description` para el
  comunicado. `avisos/loading.tsx` creado. typecheck verde.

## Fase 7: asistente

- `asistente/page.tsx`: `max-w-3xl` + `Card padding="none"`.
- `assistant-chat.tsx`: misma lógica (`ask`, `startTransition(async …)`, `askAssistantAction`).
  Conversación `aria-live="polite"` con `max-h-[calc(100vh-20rem)]` y `scrollIntoView` al
  último mensaje / "Pensando…" (`role="status"` + `LoaderCircle`); vacío `EmptyState
  icon={Sparkles}` con el texto de hoy; burbujas `bg-primary` / `bg-muted`; caja con
  `aria-label="Pregunta"`, `Send` "Preguntar" con `loading`, ayuda "Enter envía · Shift + Enter…",
  `FormError`. typecheck verde.

## Fase 8: ajustes

- `settings-form.tsx` reescrito según §6.2: `SETTINGS_FORM_ID = "ajustes-generales"`,
  `SettingsDefaults` (7 campos), `SettingsFormProvider` (un solo `useActionState(saveSettingsAction)`,
  `useActionToast("Ajustes guardados")`, `<form id=… action={action} className="hidden" />` +
  context `{ pending, error }`), `SettingsGeneralFields` (5 controles con `form=`, "Aviso previo"
  con `NumberInput unit="h" step={1}`), `SettingsPdfFields` (`input type="color"` con
  `DEFAULT_PDF_ACCENT` de `@/lib/pdf-theme`, no `#3c7a24`; `pdfFooterText`; nota "Se guarda
  junto con los ajustes generales."), `SettingsSubmit` interno (`Button type="submit"
  form={SETTINGS_FORM_ID} loading` + `FormError`). `grep -c "form={SETTINGS_FORM_ID}"` → **8**.
- `bot-toggle.tsx` → `Switch` con `Label htmlFor="bot-activo"`, descripción `id="bot-activo-desc"`
  (`text-warning` si pausado), `onCheckedChange={(checked) => start(() => setBotPausedAction(!checked))}`
  (al tocarlo `!checked === !paused`: **misma llamada**).
- `google-calendar-form.tsx`: `loading`, toast "Calendario guardado", `FormError`; mismo `name`.
- `logo-form.tsx`: preview `h-16 w-16 rounded-md border` / "Sin logo" con ícono `Image`, `input
  type="file"` con `file:` del sistema (mismo `name`, `accept`, `required`; se sumó
  `aria-label="Archivo del logo"`), "Subir logo" `loading`, toast "Logo actualizado", `FormError`.
  "Quitar" igual (form con `removeLogoAction`).
- `ajustes-tabs.tsx` (nuevo): `AJUSTES_TABS`, `AjustesTabValue`, `AjustesTabs({ panels })` con
  `Tabs orientation="vertical"`, `?tab=` por `history.replaceState` (sin `?tab` para "general"),
  `forceMount` + `data-[state=inactive]:hidden`, íconos definidos en el archivo. Clases de §7.7
  (activo con fondo **y** barra `before:`).
- `ajustes/page.tsx`: consultas **idénticas**; `defaults` con las mismas 7 expresiones; cuatro
  paneles como `ReactNode` (`general`, `whatsapp` con `Badge` de conexión + `ButtonLink` `QrCode`
  "Ver QR y vinculación" + `Separator` + `BotToggle`; `google` con `actions` badge, `Alert
  tone="danger"` si `googleSyncError`, los dos forms inline **textuales** y `GoogleCalendarForm`;
  `pdf` con `Card "Logo"` + `Card "Estilo del PDF"`). `grep` de los dos forms inline → 2 líneas.
  `ajustes/loading.tsx` creado.
- `ajustes/whatsapp/page.tsx`: `PageHeader back={{ href: "/ajustes?tab=whatsapp", label: "Volver a
  ajustes" }}`, `Card "Estado" max-w-3xl`, instrucciones en `<ol>`, QR `rounded-md border`, ASCII
  `bg-foreground text-background`, `Alert tone="info" "Esperando al bot…"` con `<code>`, mismo
  `AutoRefresh seconds={5}`. `ajustes/whatsapp/loading.tsx` creado. typecheck verde.

## Fase 9: greps de §13.3 (desde `apps/web`, sobre la lista `FILES` de la SDD)

| Chequeo | Resultado |
|---|---|
| (1) tokens/clases viejos (`ink`, `leaf`, `font-display`, `uppercase`, `border-2`, `reveal`, `text-[Npx]`, `red-600`, tonos viejos, ✓, ←…) | **0 líneas** |
| (2) hex sueltos (salvo `PRESET_COLORS`) | **0 líneas** |
| (3) `console.` / TODO / FIXME | **0 líneas** |
| (4) `components/modal` en sheet del turno y `servicios/*` | **0 líneas** |
| (5) `confirm(` nativo en `src` | solo `plantillas/[id]/delete-template-button.tsx:10` (002d) y el comentario de `delete-plan-button.tsx:14` — exactamente lo esperado; `broadcast-form.tsx` no aparece |
| (6) `3c7a24` en `src` | **0**; `DEFAULT_PDF_ACCENT` en `settings-form.tsx`: import (l. 7) + uso (l. 131) |
| (7) `appointment-detail-modal` / `AppointmentDetailModal` | **0** |
| (13.4) `useConfirm` en `assistant-chat`, `appointment-detail-sheet`, `service-card` | **0** |

## Fase 10: página temporal (la borra el orquestador, §13.6)

- `apps/web/src/app/(panel)/prueba-002c/page.tsx` (server, solo renderiza el cliente) y
  `prueba-002c-client.tsx` (cliente): `Alert tone="info"` "Página de prueba: nada se envía ni se
  guarda."; `PaymentsTable` con **30** filas (8 pendientes / 22 acreditadas; Mercado Pago y manual;
  seña y total; nombres con tildes y un teléfono; montos de 3 a 7 cifras) y otra con `rows={[]}`;
  `BroadcastForm patientCount={3} sendAction={accionFalsa}` (`accionFalsa` a nivel de módulo,
  800 ms, `< 3` caracteres → `{ ok: false, error: "Escribí un mensaje" }`, si no `{ ok: true,
  sent: 3 }`); `AvisosView readOnly` con **30** mensajes (5 fallidos con `error`, 3 pendientes,
  22 enviados; cuerpos largos) y sus `counts`.
- `grep -n "actions\"" "(panel)/prueba-002c/"*` → **0** (no importa ninguna server action; el
  tipo del estado se define estructuralmente).
- Queda detrás de `middleware.ts` como el resto del panel (`curl` sin sesión → 307 a `/inicio`).
- **Aviso:** después del recorrido, borrar `apps/web/src/app/(panel)/prueba-002c` **y**
  `apps/web/.next/types/app/(panel)/prueba-002c` (si no, `tsc` falla), y repetir `npm run
  typecheck --workspace apps/web` (§13.6).

---

## Verificación §13.1

```
npm run typecheck --workspace apps/web   → verde
npm run typecheck                        → verde en core, db, bot y web
npm run test                             → 7 archivos, 49 tests, todos en verde
./ops/harness/verify.sh                  → exit 0 ("Arnés OK."; apps/web typecheck limpio; backlog válido, 1 HU activa)
```

`next build` **no** se corrió (`pgrep -fl "next dev"` → pid 86416 del usuario, como espera la SDD).

## Verificación §13.2 (alcance del diff)

- `git diff --stat -- packages apps/bot` → **vacío**.
- `git diff --name-only` sobre la lista de archivos prohibidos (todas las `actions.ts`, `api/**`,
  `ui.tsx`, `confirm.tsx`, `data-table.tsx`, `skeletons.tsx`, `shell/**`, `primitives/**`,
  `lib/**`, `(panel)/layout.tsx`, `(panel)/loading.tsx`, `tailwind.config.ts`, `globals.css`,
  `pacientes/**`, `alimentos/**`, `plantillas/**`, `(portal)/**`, `middleware.ts`,
  `package.json`, `package-lock.json`) → **vacío**.
- Consultas idénticas (HEAD vs. ahora, regex `Q` de la SDD) en calendario, disponibilidad,
  servicios, pagos, avisos, ajustes y ajustes/whatsapp → **7 diffs vacíos**.
- `git diff -M HEAD --stat` del `page.tsx` movido → rename `(panel)/{ => (calendario)}/page.tsx`,
  **1 insertion, 1 deletion** (el import).
- Conjuntos de `name="…"` iguales en `service-form`, `manual-payment-form`, `schedule`,
  `exceptions`, `broadcast-form`, `settings-form`, `google-calendar-form`, `logo-form` → **8 diffs
  vacíos**.
- `grep -c "form={SETTINGS_FORM_ID}" settings-form.tsx` → **8**. Forms inline de Google → **2 líneas**.
- Fuera de `apps/web/` solo cambia `progress/impl_HU-002c.md`; `docker-compose.prod.yml` (ajeno)
  sigue sin trackear y sin tocar.

`git status --porcelain` final: 24 modificados (2 de ellos renames `RM`), 12 nuevos sin trackear
(8 `loading.tsx`/componentes nuevos + la carpeta `prueba-002c/`), más `docker-compose.prod.yml`.

## Autochequeo `web-design-guidelines` (sobre los archivos tocados)

Cumple: íconos decorativos `aria-hidden`; botones de ícono con `aria-label` (quitar bloque /
excepción, reintentar); controles con label (`Field`, `sr-only` en búsqueda/medio/tipo,
`aria-label` en la pregunta del asistente, el textarea del comunicado y el archivo del logo);
foco visible (`focus-visible:ring`) en swatches, botones de quitar y `ToggleGroupItem`;
"…" en todos los estados de carga; `tabular-nums` en montos, fechas, teléfonos y contadores;
`min-w-0` + `truncate` en la franja del calendario y `line-clamp-2` en descripciones/mensajes;
vacíos con `EmptyState`; `role="status"`/`aria-live` en cargas y en la conversación;
`overscroll-contain` en Sheet/Dialog (primitivos); `motion-safe:` en el punto "En vivo" y
animaciones de Radix con `tailwindcss-animate` (respetan `prefers-reduced-motion` según la 002a).
Ajustes aplicados por el autochequeo: `aria-label` en el textarea del comunicado y `width`/`height`
en los `<img>` del logo (64) y del QR (240).

Observaciones **no** corregidas (fuera de alcance o decisión de la SDD):
- Sentence case en títulos y botones (la guía pide Title Case; la HU/SDD mandan caso oración en
  español).
- Los filtros de `/pagos` viven en `useState`, no en la URL (la SDD los define en cliente; O-c3).
- "Cancelar turno", la × de bloques/excepciones y "Reintentar todos" siguen sin confirmación
  (O-c1 de la SDD: agregarla es un cambio de funcionalidad).
- `DataTable` no virtualiza (avisos trae hasta 100 filas; mismo patrón de la 002b).
- La columna de acciones de la cola tiene encabezado vacío (`header: ""`): `DataTableColumn.header`
  es `string` y `data-table.tsx` no se puede tocar, así que no se pudo poner el `sr-only`
  "Acciones" que sugería §7.5. El botón tiene su propio `aria-label` con el destinatario.
- La columna de un día de la grilla semanal se abre con clic (no con teclado), como antes; la
  alternativa por teclado es el botón "Bloque de horario" del encabezado.

## Decisiones no obvias

- **D-c1 aplicada**: panel del turno **no modal** (`modal={false}`), sin overlay ni atrapado de
  foco; Escape, X y clic fuera del calendario cierran; clic dentro del calendario no. Si el
  orquestador prefiere modal: `modal={true}` en `appointment-detail-sheet.tsx`.
- En `AvisosView readOnly`, "Pausar"/"Reanudar" queda visible (ver fase 6) para poder verificar el
  estado en vivo en `/prueba-002c` sin `AutoRefresh`.
- `SettingsSubmit` renderiza también el `FormError` (compartido por context): el error de la
  action se ve en la pestaña desde la que se guardó y en la otra.
- `Modal`: `{...(description ? {} : { "aria-describedby": undefined })}` para que Radix enlace la
  descripción cuando existe y no avise por consola cuando no.
- El `Button` compartido ya pone el spinner con `loading`; en los botones con ícono el ícono se
  oculta mientras `loading` para no mostrar dos.
- `pagos/loading.tsx`: los filtros del esqueleto van fuera de `TableSkeleton` (que ya trae su
  propio borde) para no duplicar bordes.

## Firmas vs. "Contrato compartido" (§6.2)

Coinciden **todas**: `Modal({ …, description? })`; `AppointmentDetailSheet({ appt, tz, currency,
onClose, onChanged, interactionAreaRef?, returnFocusRef? })` con `SelectedAppointment` idéntico;
`NewAppointmentModal` y `CalendarClient` sin cambios de props; `PaymentRow` (11 campos, mismos
nombres y tipos) y `PaymentsTable({ rows })`; `ManualPaymentDialog({ appointments })`;
`ManualPaymentForm({ appointments, onDone? })`; `AvisosView({ rows, counts, intervalSeconds,
readOnly? })` con `MessageRow` sin cambios; `BroadcastForm({ patientCount, sendAction? })`;
`AJUSTES_TABS`, `AjustesTabValue`, `AjustesTabs({ panels })`; `SETTINGS_FORM_ID`,
`SettingsDefaults`, `SettingsFormProvider({ children })`, `SettingsGeneralFields({ defaults })`,
`SettingsPdfFields({ defaults })`; `BotToggle({ paused })`, `LogoForm`, `GoogleCalendarForm`,
`DisponibilidadView`, `WeeklySchedule`, `AddBlockModal`, `ExceptionsList`, `ExceptionForm`,
`NewServiceButton`, `ServiceCard`, `ServiceForm`, `AssistantChat` sin cambios. `SettingsForm`
dejó de existir (como pide la SDD). Sin cambios en `packages/db/domain` ni `packages/core`.

## Lo que no se pudo verificar y por qué

- **Recorrido visual §13.5** (1366 × 663, teclado, movimiento reducido, contraste, 768 px): es del
  orquestador con el navegador. No tengo sesión de Google: `curl` a `/`, `/ajustes`, `/pagos` y
  `/prueba-002c` devuelve **307 a `/inicio`** (no 404), así que el `middleware` sigue delante y la
  ruta `/` existe, pero no pude ver las páginas renderizadas. Si al entrar con sesión `/` diera 404
  por el `page.tsx` movido, es el caso previsto en §2.1.2: pedir reinicio del `next dev` (pid 86416).
- Flujo real de `useConfirm` en la difusión: solo por revisión de código (orden `preventDefault` →
  `FormData` → `await confirm` → `startTransition(dispatch)`) y por los greps de 6.1; el flujo
  completo con la action falsa se prueba en `/prueba-002c` (§13.5.9).
- Conteo de `OutboundMessage` antes/después: no se consultó la base (solo lectura estricta, ni
  `psql`). Ninguna verificación mía pudo encolar nada: no se ejecutó ninguna action.

## Archivos

**Modificados (24):** `apps/web/src/components/modal.tsx`; `(panel)/page.tsx` → **movido** a
`(panel)/(calendario)/page.tsx`; `(panel)/calendar-client.tsx`; `(panel)/new-appointment-modal.tsx`;
`(panel)/appointment-detail-modal.tsx` → **renombrado** a `(panel)/appointment-detail-sheet.tsx`;
`disponibilidad/{view,schedule,exceptions}.tsx`; `servicios/{page,new-service-button,service-card,service-form}.tsx`;
`pagos/{page,manual-payment-form}.tsx`; `avisos/{page,avisos-view,broadcast-form}.tsx`;
`asistente/{page,assistant-chat}.tsx`; `ajustes/{page,settings-form,bot-toggle,logo-form,google-calendar-form}.tsx`;
`ajustes/whatsapp/page.tsx`.

**Creados (12):** `(calendario)/loading.tsx`; `disponibilidad/loading.tsx`; `servicios/loading.tsx`;
`pagos/{payments-table,manual-payment-dialog,loading}.tsx`; `avisos/loading.tsx`;
`ajustes/{ajustes-tabs,loading}.tsx`; `ajustes/whatsapp/loading.tsx`;
**temporales** `prueba-002c/{page,prueba-002c-client}.tsx`.

**Borrado (artefacto no versionado):** `apps/web/.next/types/app/(panel)/page.ts`.

**No se tocó `tailwind.config.ts`** (no hace falta reiniciar el dev por eso).
