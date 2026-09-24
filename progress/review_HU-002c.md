# Review — HU-002c (`rediseno-ui-agenda-gestion`)

**Veredicto:** APPROVED

Primer intento. Revisado contra `Refactorizaciones/rediseno-ui-agenda-gestion.md` (D-c1 a D-c7,
aceptadas por el usuario), la fila HU-002c de "Resoluciones" de `docs/hu-rediseno-ui-empresarial.md`,
`progress/impl_HU-002c.md` y `progress/recorrido_HU-002c.md`. Lo verifiqué yo sobre el working
tree de la rama `hu-002-rediseno-ui-empresarial` (sin commitear). No modifiqué código ni datos, no
corrí `next build` ni `next dev`, y no mandé nada por WhatsApp.

## Verificación que corrí yo

- `npm run typecheck`: core, db, bot y web limpios (exit 0).
- `npm run test`: 7 archivos, 49 tests, todos en verde.
- `./ops/harness/verify.sh`: exit 0 ("Arnés OK.", backlog válido, 1 HU activa).
- §13.2 de la SDD:
  - `git diff HEAD --stat -- packages apps/bot`: vacío.
  - Lista de archivos prohibidos (todas las `actions.ts`, `api/**`, `ui.tsx`, `confirm.tsx`,
    `data-table.tsx`, `skeletons.tsx`, `shell/**`, `primitives/**`, `lib/**`, `(panel)/layout.tsx`,
    `(panel)/loading.tsx`, `tailwind.config.ts`, `globals.css`, pacientes/alimentos/plantillas,
    `(portal)`, `middleware.ts`, `package.json`, `package-lock.json`): vacía.
  - Consultas (regex `Q`, HEAD contra ahora) en calendario, disponibilidad, servicios, pagos,
    avisos, ajustes, ajustes/whatsapp y asistente: los 8 diffs vacíos.
  - Conjuntos de `name="…"` en los 8 formularios: los 8 diffs vacíos.
- §13.3 de la SDD:
  - (1) tokens viejos: 0. (2) hex sueltos: 0. (3) `console.`, TODO y FIXME: 0.
  - (5) `confirm(` nativo: solo `plantillas/[id]/delete-template-button.tsx:10` (es de la 002d) y
    el comentario de `delete-plan-button.tsx:14`. Es lo esperado.
  - (6) `3c7a24`: 0. (7) `appointment-detail-modal`: 0.

## Puntos pedidos por el orquestador

- **Regla de `useConfirm`.** Solo se usa en `avisos/broadcast-form.tsx:28`. El `<form>`
  (`broadcast-form.tsx:56`) no tiene `action`. El orden es el de §6.3:
  1. `preventDefault` (l. 39);
  2. `new FormData` sincrónico (l. 40);
  3. `await confirm({…})` dentro del handler de evento (l. 44);
  4. recién después, `startTransition(() => dispatch(formData))` (l. 52).

  No hay `requestSubmit`. Ningún otro archivo de la HU importa `useConfirm`: los
  `useTransition` de `bot-toggle`, `service-card`, `avisos-view`, `schedule`, `exceptions` y
  `assistant-chat` no confirman nada. El recorrido confirma que no hay deadlock.
- **Acciones que mandan WhatsApp o escriben: mismo comportamiento.**
  - `appointment-detail-sheet.tsx`: llama a `setStatusAction(id, "COMPLETED"|"NO_SHOW"|"CONFIRMED")`
    (l. 189, 201, 236), `cancelAppointmentAction(id)` (l. 223) y `sendReminderNowAction(id)` (l. 143)
    con los mismos argumentos que el modal de HEAD. Sigue el mismo `onChanged()` + `onClose()` en
    los cambios de estado, y con el recordatorio el panel queda abierto.
  - `new-appointment-modal.tsx`: `submit`, `fetch` y `FormData` sin cambios. Solo se suma
    `notify.saved`.
  - `bot-toggle.tsx`: `setBotPausedAction(!checked)`, que al tocar el switch da lo mismo que
    `!paused`.
  - `service-card.tsx`: `toggleServiceAction(id, checked)`, que al tocar da lo mismo que
    `!service.active`.
  - `avisos-view.tsx`: `retryMessageAction(id)` y `retryAllFailedAction()` sin cambios.
  - Difusión: misma action y mismo `name="body"`. El único cambio visible es D-c5, aceptado: el
    texto se conserva si la action falla.
  - Ajustes: un solo `useActionState(saveSettingsAction)`
    (`settings-form.tsx:38`). Los 7 controles y el botón están asociados con
    `form={SETTINGS_FORM_ID}`, así que el envío es el mismo. Los dos forms inline de Google
    quedaron textuales (`ajustes/page.tsx`, bloque `google`).
- **Movimiento de `(panel)/page.tsx`.** `git diff -M` lo detecta como rename con similarity 98% y
  una sola línea cambiada, el import `../calendar-client`. `(panel)/page.tsx` ya no existe.
  `(calendario)` es un route group dentro de `(panel)`, así que `/` se sigue resolviendo, con el
  mismo `layout.tsx` y la misma protección por `auth()`. No quedan referencias a la ruta vieja, y
  el tipo generado viejo de `.next/types` ya no está. El recorrido cargó `/` bien.
- **`DEFAULT_PDF_ACCENT`.**
  - `settings-form.tsx:7` lo importa de `@/lib/pdf-theme` y `settings-form.tsx:131` lo usa como
    `defaults.pdfAccentColor || DEFAULT_PDF_ACCENT`.
  - `lib/pdf-theme.ts` no tiene `server-only` ni imports, así que se puede importar desde un
    componente cliente. `lib/` no cambió en este diff.
  - Coincide con el fallback de `lib/plan-pdf.tsx:128`. El valor `#37352F` pasa la regex de
    `saveSettingsAction`.
- **Los dos desvíos del implementer.** Los acepto, no bloquean:
  1. En `avisos-view.tsx`, con `readOnly`, "Pausar"/"Reanudar" sigue visible, aunque §7.5 decía
     ocultarlo. Solo cambia el estado local y no llama a nada. Afecta solo a la página de prueba.
  2. La columna `accion` tiene `header: ""`, sin el `sr-only` "Acciones". Lo verifiqué:
     `DataTableColumn.header` es `string` (`components/data-table.tsx:20`) y ese archivo no se
     puede tocar. El botón tiene `aria-label` con el destinatario.

## Zona horaria del calendario (bug anterior, no es regresión)

La 002c no lo empeora. En `calendar-client.tsx` no cambió nada que dependa de la hora: la prop
`timeZone={tz}`, `businessHours`, `slotMinTime`/`slotMaxTime`, `nowIndicator` y el cálculo de
`summary` en `(calendario)/page.tsx` están igual que en HEAD. Lo único agregado es
`eventInteractive`, `setSelected(null)` en `onSelect` y los refs. Ninguno toca fechas.

Lugares de la HU que dependen de esa hora, para la tarea aparte:

- **Panel del turno** (`appointment-detail-sheet.tsx:151`): usa
  `formatInTimeZone(new Date(appt.start), tz, …)` sobre `event.startStr`. El recorrido muestra que
  da la hora correcta (09:00). Hay que volver a comprobarlo cuando se agregue el plugin de zonas,
  porque cambia lo que devuelve `startStr`.
- **Franja seleccionada** (`calendar-client.tsx:94`): `arg.startStr.slice(0, 10)` toma solo la
  fecha que ve el calendario, que hoy está en UTC. Un clic en una franja que en hora local es de
  21:00 a 24:00 se ve como el día siguiente en UTC y abriría el alta con el día equivocado. La
  hora elegida no se usa: los horarios salen de `/api/slots`.
- **`businessHours`, `slotMinTime`/`slotMaxTime` y `nowIndicator`**: se arman en hora local y se
  dibujan sobre una grilla en UTC. Por eso el sombreado queda desalineado con los turnos, y un
  turno tarde en hora local puede quedar fuera de `slotMax` y no verse.
- **Sin dependencia de esto**: la franja de resumen (calculada en el server con `tz`), las fechas
  de pagos (`formatInTimeZone` con `tz` en `pagos/page.tsx`) y los horarios del alta
  (`new-appointment-modal.tsx`, `formatInTimeZone(…, tz, "HH:mm")`).

## Checkpoints

**C1**
- [x] `backlog.json` válido, 1 HU activa (HU-002c `en_revision`).
- [x] `progress/current.md` refleja la HU en curso.
- [x] `./ops/harness/verify.sh`: exit 0.

**C2**
- [x] `docs/hu-rediseno-ui-empresarial.md` existe, con Resoluciones y la fila HU-002c.
- [x] La SDD existe, con workspaces, checklist atómico y contrato de UI (§6.2).
- [x] Las firmas coinciden con §6.2: `Modal({… description?})`,
  `AppointmentDetailSheet({… interactionAreaRef?, returnFocusRef?})` con `SelectedAppointment`
  idéntico, `PaymentRow` (11 campos), `PaymentsTable`, `ManualPaymentDialog`,
  `ManualPaymentForm({… onDone?})`, `AvisosView({… readOnly?})`,
  `BroadcastForm({… sendAction?})`, `AJUSTES_TABS`/`AjustesTabValue`/`AjustesTabs({ panels })`,
  `SETTINGS_FORM_ID`, `SettingsDefaults`, `SettingsFormProvider`, `SettingsGeneralFields` y
  `SettingsPdfFields`. `SettingsForm` ya no existe.

**C3**
- [x] No hay lógica de dominio nueva. `packages/` no se tocó.
- [x] No aplica: no cambió ni `schema.prisma` ni `packages/db/domain`. Igual, el typecheck de los
  4 workspaces está limpio.
- [x] No aplica: no hay migraciones.
- [x] Rutas: `(calendario)` y `prueba-002c` están bajo `(panel)/layout.tsx` (`auth()` +
  `redirect`) y detrás de `middleware.ts`. El portal no se tocó.
- [x] Bot: `apps/bot` no se tocó y no cambió ningún texto que se encola.
- [x] Sin `console.*`, TODO ni FIXME en los archivos de la HU. El `console.error` de la fuente de
  eventos pasó a `notify.error`.

**C4**
- [x] `npm run typecheck`: limpio.
- [x] `npm run test`: 49 en verde. No hay lógica nueva de `packages/core` (§12).
- [x] Flujo del bot sin WhatsApp real: no se tocó el flujo. La difusión se probó con la action
  falsa. `OutboundMessage` dio 4 antes y 4 después, según el recorrido.
- [x] No aplica: la HU no genera PDF. Solo cambia el color inicial del selector.

**C5**
- [x] `progress/impl_HU-002c.md` existe y está completo.
- [x] `progress/review_HU-002c.md`: este archivo.
- [x] No se escribió en la base (el implementer no la consultó). La única ruta temporal es
  `(panel)/prueba-002c`, que existe a propósito: el orquestador tiene que borrarla antes de
  cerrar, junto con `apps/web/.next/types/app/(panel)/prueba-002c`, que hoy existe. Después hay
  que repetir el typecheck (§13.6).

## Dudas (no bloqueantes)

- **Panel del turno no modal y acción en curso**
  (`appointment-detail-sheet.tsx:122-137`).
  - Qué pasa: mientras corre "Marcar completado" / "No asistió" / "Cancelar turno" sobre el turno
    A, el calendario sigue usable. Si se toca el turno B, el cuerpo se vuelve a montar
    (`key={shown.id}`) y los botones de B quedan habilitados. Cuando termina la action de A, su
    `onClose()` cierra el panel que ahora muestra B.
  - Qué no pasa: no se ejecuta ninguna acción sobre el turno equivocado. Es solo un cierre
    inesperado.
  - Por qué ahora: con el modal anterior esto no podía pasar. Es una consecuencia de D-c1.
- **`onInteractOutside` cierra con clics que no son del calendario**. Por ejemplo, un clic sobre
  el toast "Recordatorio encolado." cierra el panel. Es menor.
- **`returnFocusRef`**: después de `onChanged()` → `refetchEvents()`, FullCalendar vuelve a crear
  el elemento del turno. `isConnected` da `false` y el foco no vuelve a ningún lado.
  Aceptable: el panel igual se cierra.
- **Recorrido incompleto.** No se verificó: el diálogo de nuevo turno, disponibilidad,
  `/ajustes/whatsapp`, `/asistente`, 768 px, los esqueletos con Slow 4G, movimiento reducido y
  contraste medido (`recorrido_HU-002c.md`, "No verificado").
  - Revisé el código de esas pantallas y no encontré problemas.
  - Queda a criterio del orquestador si los recorre antes de commitear.
  - Lo que más vale la pena mirar es el `ToggleGroup` de horarios del alta, porque es el único
    cambio de interacción en un flujo que manda WhatsApp.
- **D-c3 (formulario único en ajustes)**: si un campo obligatorio de *General* queda vacío y se
  guarda desde *PDF*, el navegador bloquea el envío sin mostrar el aviso. Es un caso borde ya
  documentado en §14 y aceptado.
