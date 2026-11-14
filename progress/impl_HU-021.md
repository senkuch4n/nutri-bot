# Implementación HU-021: Lista de turnos (`lista-turnos`)

- **Estado:** `done`
- **SDD:** `Refactorizaciones/lista-turnos.md` (§9, de A1 a D1). **HU:** `docs/hu-lista-turnos.md`.
- **Rama:** `feat/HU-021-lista-turnos` (local, sin push). Base: `10ece48` (MorphDialog).
- **Modelo:** Opus. **Skills:** ninguno (el usuario lo pidió explícitamente). Referencia visual:
  `/tmp/hu-021-referencia.png`.
- **Migraciones:** ninguna. `schema.prisma` no se tocó (`git diff --stat develop -- packages/db/prisma` sale vacío).
- **Base de datos / WhatsApp:** no se escribió nada en la base de desarrollo ni se mandó ningún mensaje.
  Todos los tests son con mocks. No se usó ningún turno de prueba, así que no hay ids para reportar.

## Commits (uno por tarea)

| Tarea | Commit | Qué |
|---|---|---|
| A1 | `310741d` | `appointment-list.ts` (estado de la fila, pagos, texto de Pago, `canRegisterAppointmentPayment`, `APPOINTMENT_LIST_TEXT`), `DEPOSIT_AUTO_CANCEL_REASONS` en `deposits.ts`, export en `index.ts` + tests |
| A2 | `411269b` | `buildAppointmentListRows`, filtros, URL, `activeAppointmentFilterCount`, `matchesAppointmentFilters`, `countAppointmentCards` + tests (bloques 5 a 8) |
| B1 | `815f17c` | `packages/db/domain/payments.ts` usa `DEPOSIT_AUTO_CANCEL_REASONS` (mismos valores) |
| C1 | `b8de8c3` | `(panel)/appointment-cancel.ts` (`appointmentCancelKey`, `useScheduleAppointmentCancel`); `calendar-client.tsx` lo usa; `GroupedListRow.onClick` recibe el evento |
| C2 | `d1dfdc0` | `revalidatePath("/turnos")` en las 5 actions + tests |
| C3 | `5693c2e` | `AppointmentDetailBody` exportado (`ActiveAppointmentBody` / `ReadOnlyAppointmentBody`), status amplio, fila «Pagos», `balance`/`depositAmount` hacia el pago; `ManualPaymentForm.balanceAmount` |
| C4 | `24e2518` | Ruta `/turnos` (`page`, `loading`, `data` + test, cliente, tabla, lista del celular) e ítem «Turnos» en Agenda |
| C5 | `f377311` | `appointment-detail-dialog.tsx` (MorphDialog), «Abrir», override de T16, cancelación diferida, «Vino»/«No vino» con «Deshacer», «Registrar pago» con saldo |
| C6 | `3ae8a4b` | `turnos-filters.tsx` (popover / sheet inferior), filtros y buscador en la URL, «Ver todos», mes que conserva filtros |
| D1 | (sin commit) | Verificación completa y este reporte. `progress/impl_HU-021.md` queda sin commitear para que lo commitee el orquestador junto con la revisión (como en HU-019). |

## Archivos tocados

**Creados**
- `packages/core/src/appointment-list.ts`, `packages/core/src/appointment-list.test.ts`
- `apps/web/src/app/(panel)/appointment-cancel.ts`
- `apps/web/src/app/(panel)/turnos/page.tsx`, `loading.tsx`, `data.ts`, `data.test.ts`, `turnos-client.tsx`,
  `appointments-table.tsx`, `appointments-mobile-list.tsx`, `turnos-filters.tsx`, `appointment-detail-dialog.tsx`

**Modificados**
- `packages/core/src/deposits.ts`, `deposits.test.ts`, `index.ts`
- `packages/db/domain/payments.ts`
- `apps/web/src/app/(panel)/appointment-detail-sheet.tsx`, `calendar-client.tsx`, `actions.ts`, `actions.test.ts`
- `apps/web/src/app/(panel)/pagos/manual-payment-form.tsx`, `pagos/actions.ts`, `pagos/actions.test.ts`
- `apps/web/src/components/grouped-list.tsx`, `apps/web/src/components/shell/nav-config.ts`

No se tocó nada de la lista «No tocar» (§8): ni `prisma/**`, ni `domain/appointments.ts`, ni `apps/bot/**`, ni
`api/appointments/route.ts`, ni `pagos/page.tsx`, ni `payments-table.tsx`, ni `appointment-payment-modal.tsx`,
ni `backlog/**`.

## Test-first (RED → GREEN)

- **A1:** con los tests escritos y sin implementación: `npx vitest run packages/core/src/appointment-list.test.ts packages/core/src/deposits.test.ts`
  → RED (`appointment-list.test.ts` no carga el módulo; `deposits.test.ts`: falla 1 de 7, el de `DEPOSIT_AUTO_CANCEL_REASONS`).
  Después de implementar: GREEN, 21/21.
- **A2:** RED (`appointment-list.test.ts` no carga: faltan los exports nuevos) → GREEN, 43/43 (36 + 7 de deposits).
- **C2:** RED con 5 fallas (`createAppointmentAction`, `setStatusAction` ok, `cancelAppointmentAction`,
  `saveAppointmentReasonAction` y el caso de éxito de `registerManualPaymentAction`; el caso de error de
  `setStatusAction` ya pasaba porque ese comportamiento existía) → GREEN, 19/19.
- **C4 (`data.test.ts`):** RED (no existe `./data`) → GREEN, 3/3.

## Verificación (D1, desde la raíz)

- `npm run typecheck`: exit 0, 0 errores en core, db, bot y web.
- `npm run test`: exit 0. 158 archivos, 2471 tests pasados.
- `npx vitest run packages/core/src/appointment-list.test.ts packages/core/src/deposits.test.ts`: 43 pasados.
- `npx vitest run packages/db/domain/payments.test.ts`: 31 pasados.
- `npx vitest run "apps/web/src/app/(panel)/actions.test.ts" "apps/web/src/app/(panel)/pagos/actions.test.ts" "apps/web/src/app/(panel)/turnos/data.test.ts"`: 3 archivos, 22 pasados.
- `npx vitest run apps/bot`: 7 archivos, 50 pasados (obligatorio por B1: el bot corre `expireStalePendingPayments`).
- `npx vitest run` (suite completa): 158 archivos, 2471 pasados.
- `./ops/harness/verify.sh`: exit 0, «Arnés OK». Avisa `[WARN] Sin cambios sin commitear en apps/ ni packages/, se saltea typecheck`
  porque todo ya estaba commiteado. El typecheck se corrió aparte (arriba).
- `git diff --stat develop -- packages/db/prisma`: vacío.

Verificaciones por tarea (todas en verde al cerrar cada tarea):
- A1/A2: `npx vitest run packages/core/src/appointment-list.test.ts packages/core/src/deposits.test.ts` + `npm run typecheck`.
- B1: `npm run typecheck` (exit 0) + `npx vitest run packages/db/domain/payments.test.ts apps/bot`: 8 archivos, 81 pasados.
- C1: `npm run typecheck` (exit 0) + `npx vitest run apps/web`: 66 archivos, 626 pasados.
- C2: los dos archivos de actions (19 pasados) + `npm run typecheck` (exit 0).
- C3: `npm run typecheck` (exit 0) + `npx vitest run apps/web`: 66 archivos, 630 pasados.
- C4: `data.test.ts` (3 pasados) + `npm run typecheck` (exit 0) + `npx vitest run apps/web`: 67 archivos, 633 pasados.
- C5: `npm run typecheck` (exit 0) + `npx vitest run apps/web`: 67 archivos, 633 pasados.
- C6: `npm run typecheck` (exit 0) + `npx vitest run packages/core/src/appointment-list.test.ts apps/web`: 68 archivos, 669 pasados.

**Sin verificar visualmente.** El panel exige login con Google: `curl http://localhost:3000/turnos` contra el dev
server que ya estaba corriendo devuelve `307 → /inicio`. No usé el navegador del usuario. Queda pendiente el
recorrido manual de §10.1 (solo mirando): `/turnos` del mes en curso y del siguiente, filtros, recargar con filtros,
abrir el detalle en escritorio y en celular, Escape y foco en «Abrir».

## Contrato compartido (§5): coincide

- `packages/core/src/appointment-list.ts` exporta exactamente los nombres y firmas de §5.1:
  `AppointmentRowStatus`, `isUnpaidDepositCancellation`, `appointmentRowStatus`, `AppointmentPaymentState`,
  `AppointmentPaymentSummary`, `summarizeAppointmentPayments`, `appointmentPaymentText`,
  `canRegisterAppointmentPayment`, `AppointmentListInput`, `AppointmentListRow`, `buildAppointmentListRows`,
  `AppointmentStatusFilter`, `AppointmentPaymentFilter`, `AppointmentListFilters`,
  `DEFAULT_APPOINTMENT_LIST_FILTERS`, `parseAppointmentListFilters`, `appointmentListQuery`,
  `activeAppointmentFilterCount`, `matchesAppointmentFilters`, `AppointmentListCards`, `countAppointmentCards`,
  `APPOINTMENT_LIST_TEXT` (textos idénticos a §5.1).
- `DEPOSIT_AUTO_CANCEL_REASONS` (`expired`, `checkoutFailed`) con los literales exactos de §5.2.
- `payments.ts` sin cambio de firma (§5.3).
- `SelectedAppointment` (status `AppointmentStatusLike` + `cancelledBy?`, `cancelReason?`, `paymentText?`, `balance?`,
  `depositAmount?`), `AppointmentDetailBody(props)`, `AppointmentOption.balanceAmount?`,
  `appointmentCancelKey(id)`, `useScheduleAppointmentCancel(options?)` y `GroupedListRow.onClick(event)`: como §5.4.
- `TurnosAppointment` y `loadTurnosMonth(month, tz)`: como §6.2, con la consulta tal cual.
- Actions: solo se sumó `revalidatePath("/turnos")`, sin cambio de firma (§6.3).

## Decisiones no obvias

1. **Tarjetas separadas.** La SDD (§7.1, punto 3) pide un contenedor único con 4 `Metric`. El orquestador pidió
   reproducir la referencia («una fila de tarjetas de resumen»), así que hay 4 tarjetas separadas (`rounded-xl bg-card
   shadow-card`, `grid-cols-2` en el celular y `sm:grid-cols-4`), cada una con su `Metric`. Mismos datos y textos.
2. **Pastillas suaves.** El estado de la tabla es una pastilla `rounded-full` con fondo suave del tono e ícono, con el
   mapa de tonos e íconos de §7.3. Lo hice en `appointments-table.tsx` (`ROW_STATUS_VISUAL`, que reusa la lista del
   celular) en lugar del `Badge` de `ui.tsx`, porque ese `Badge` es `rounded-xs` y no recibe `className`. La columna
   Pago también es una pastilla suave, pero **neutra** (`bg-secondary`, `text-foreground` o `text-muted-foreground`
   cuando no hay pagos, sin tonos de advertencia ni de error, R8). «—» (sin cargo) va como texto, sin pastilla.
   «Archivada» sí usa `Badge tone="neutral"`, como pide la SDD.
3. **«Abrir ↗» discreto.** `Button variant="ghost" size="sm"` en gris (`text-muted-foreground hover:text-foreground`)
   con `ArrowUpRight` después del texto, como en la referencia. La SDD decía `variant="plain"` (azul). Se mantienen
   `id`, `aria-label` y el origen del MorphDialog.
4. **Acciones opcionales en la tabla.** `AppointmentsTable` recibe `actions?: AppointmentRowActions` y
   `AppointmentsMobileList` recibe `onOpen?`. En C4 no se pasaban (filas sin acciones); en C5 se conectaron.
   `openButtonId` y `ROW_STATUS_VISUAL` viven en `appointments-table.tsx` (no hay archivo nuevo fuera de §8).
5. **Detalle con el estado efectivo.** `toSelectedAppointment` arma el turno desde el DTO con la cancelación
   pendiente ya aplicada (T15). Si se reabre un turno durante los 8 s del «Deshacer», se ve en modo lectura como
   cancelado y no ofrece cancelar de nuevo.
6. **`selected` memoizado y override por identidad de DTOs.** El override optimista (T16) guarda la lista de DTOs con
   la que se creó y solo vale mientras esa lista no cambie, sin efectos. Cuando llega `router.refresh()`, se descarta.
7. **Modal de pago desde la fila.** Conserva el último turno (`payingShown`) para que la animación de cierre del
   `Modal` no se corte al desmontarse.
8. **Buscador ↔ URL.** El efecto que resincroniza el buscador compara con `trim()`, para no borrar un espacio que se
   está tipeando cuando la URL deja de llevar `q`.
9. **Página:** `resolveMonth` acepta cualquier `yyyy-MM` válido, también futuro. `filterServices` = todos los
   servicios (`listServices()`); «Nuevo turno» usa solo los activos.
10. **Tipografía de los filtros:** los títulos de grupo usan el token `text-caption` en mayúsculas (el mismo estilo
    que los grupos de la sidebar). El contador del botón es una pastilla `bg-primary` con `aria-hidden`; el número
    se anuncia por el `aria-label` («Filtros, 1 activo»).

## Pendiente / para el usuario

- Recorrido visual manual (ver «Sin verificar visualmente»).
- §12 de la SDD sigue igual: seña vencida reconocida por texto (sin migración) y la diferencia T6 entre el calendario
  y `/turnos` en «Registrar pago».

## Ajuste visual (V1), 2026-10-26

Pedido del usuario: `/turnos` tiene que copiar la referencia (`/tmp/hu-021-referencia-2.png`, pantalla «Citas»).
Donde la §7 de la SDD contradice la referencia, manda la referencia (decisión explícita del usuario). Solo
cambia la presentación: datos, server actions, filtros en la URL, `MorphDialog`, «Deshacer» y el foco quedan
igual.

### Qué cambió

- **Encabezado** (`turnos-client.tsx`): sale `PageHeader` (y su descripción). A la izquierda `h1` «Turnos» y al
  lado el selector de mes chico (`‹ Octubre 2026 ›`, mismos `turnosHref`, `nav aria-label="Mes"`, `h2
  aria-live="polite"`; chevrons de 32 px con `touch-target` de 44 px en puntero grueso). A la derecha «Filtros»
  (ghost, ícono `ListFilter`) y «+ Nuevo turno» en pastilla negra (`rounded-full bg-foreground text-background`).
  Sin selector lista/grilla. Se sacaron del cuerpo la fila del mes y la fila buscador + contador.
- **Filtros** (`turnos-filters.tsx`): el buscador por paciente pasa adentro del popover (sheet inferior en el
  celular), arriba de Estado / Pago / Servicio. Sigue escribiendo `?q=` igual que antes (estado local en el
  cliente + `replaceUrlInRouter`). El indicador del botón cuenta los filtros activos **más** el buscador si tiene
  texto (el buscador ya no se ve, así que hace falta avisar que está filtrando); `aria-label` =
  `filtersLabel(n)`. El pie muestra «N turnos» al lado de «Limpiar filtros».
- **Tarjetas**: una fila de 4 (2 columnas en el celular), `bg-muted rounded-xl`, sin sombra ni tarjeta blanca;
  etiqueta chica arriba y número grande abajo. «Totales» con la etiqueta en `text-foreground`; su «N sin cerrar»
  queda como renglón gris chico. `more-contrast` agrega borde.
- **Tabla** (`appointments-table.tsx`): plana sobre el fondo, sin contenedor, sombra ni borde. Encabezados
  chicos grises sin fondo; filas de 64 px separadas por `border-border/60` (también debajo de la última).
  Columnas: Estado · Paciente · Fecha · Hora · Precio · Pago · Nota · «Abrir ↗». **Sin «Servicio».** «Nota»
  sigue siendo `AppointmentReasonCell` (motivo truncado, expandible, «—» si no hay). Precio alineado a la
  izquierda, como la referencia.
- **Pastillas** Estado y Pago: neutras, `border border-border rounded-full`, texto chico e ícono a la
  izquierda, sin fondos de color. Íconos de estado: Pendiente `Circle` (el «○» de la referencia), Sin cerrar
  `CircleAlert`, Completado `CircleCheck`, No vino `CircleX`, Canceló `CircleSlash`, Esperando seña `Clock`.
  Pago: Pagado `BadgeCheck`, Seña pagada `Coins`, Sin pagos registrados `BanknoteX`; «—» (sin cargo) sin
  pastilla. El estado se distingue por ícono + texto, nunca por color.
- **Acciones de la fila**: «Vino», «No vino» (solo «Sin cerrar») y «Registrar pago» pasan a texto gris ghost,
  igual que «Abrir». Mismos `aria-label`, `loading`/`disabled`, y el foco vuelve a «Abrir»
  (`openButtonId`) después de «Vino» / «No vino». «Abrir» sigue abriendo el `MorphDialog` con la fila como
  origen.
- **Celular** (`appointments-mobile-list.tsx`): deja `GroupedList`; filas planas con divisores, paciente,
  «23 Oct · 8:00», las mismas pastillas neutras y el precio a la derecha. Cada fila sigue siendo un `button`
  que abre el detalle con origen en la fila.
- **`loading.tsx`**: esqueleto del layout nuevo (título + mes, dos botones, 4 tarjetas grises, filas planas).
- **Core** (`packages/core/src/appointment-list.ts`, con su test): `dateLabel` = «23 Oct» (día sin cero + mes
  corto, zona de la profesional; antes «jue 29/10»); `timeLabel` = «8:00» (24 h sin cero adelante; antes
  `formatTime` → «08:00»; `formatTime` no se tocó); `APPOINTMENT_LIST_TEXT.free` = «—» (antes «Sin cargo»);
  `columns.reason` = «Nota» (antes «Motivo»). `openLabel` usa el `dateLabel` nuevo («Abrir el turno de Carla
  López, 20 Oct 10:00»).

### Test-first

`packages/core/src/appointment-list.test.ts`: primero se cambiaron las expectativas (`dateLabel` «29 Oct»,
`priceLabel` «—» en sin cargo) y se agregaron dos tests nuevos (8:00 sin cero y 17:30; fechas en la zona de
la profesional en agosto y el 31/12 a las 23:30, que en UTC ya es 1/1). RED observado: 4 fallos
(«lun 03/08 09:15» en vez de «3 Ago 9:15», etc.). Después de implementar: 38/38 en verde. No se relajó
ninguna aserción.

### Verificación (desde la raíz)

- `npm run typecheck`: exit 0 (core, db, bot y web sin errores).
- `npx vitest run apps/web packages/core`: 129 archivos, 2147 tests, todos en verde.
- Sin base ni WhatsApp: no se tocó la base de desarrollo ni se mandaron mensajes.
- **Sin verificación visual en el navegador**: el panel exige login con Google; queda para el recorrido del
  usuario.

### Desvíos respecto de la referencia (y por qué)

- **Hora en 24 h** («8:00», no «8:00 AM»): aprobado por el usuario.
- **Sin «Por cobrar» ni selector lista/grilla**: «Por cobrar» quedó fuera de alcance en la HU (Resoluciones
  2026-10-26) y la grilla también; son 4 tarjetas en vez de 5.
- **Selector de mes al lado del título**: no está en la referencia (que no tiene período); lo pidió el usuario.
- **Vacío como «—» (raya) y no «-» (guion)**: es el mismo carácter que ya usan «Nota» vacía
  (`AppointmentReasonCell`) y Pago sin cargo; así las tres columnas muestran lo mismo. Es un cambio de un
  carácter en `APPOINTMENT_LIST_TEXT.free` si se prefiere el guion.
- **Texto de Pago**: sigue siendo «Sin pagos registrados» / «Seña pagada · $ X» / «Pagado» (R8 de la HU), no
  «Cobro pendiente» de la referencia.
- **Celular**: sin servicio en la fila, igual que la tabla (la columna «Servicio» salió); el servicio se ve en
  el detalle.
- **Peso tipográfico**: título y números de las tarjetas en `font-medium` (la referencia no usa negrita), sobre
  los tamaños del sistema (`text-title-1`, `text-metric-md`).

### Skills

Los skills de UI que pide el protocolo (`ui-ux-pro-max`, `ui-styling`, `web-design-guidelines`) no están
instalados en esta sesión. Se aplicó `refactoring-ui` y se hizo el autochequeo a mano: foco visible en todo lo
interactivo, `aria-live` del mes y del contador (este último ahora `sr-only`), nombres accesibles que contienen
el texto visible («Paciente» ⊂ `searchLabel`), objetivo táctil de 44 px, `more-contrast` con borde en tarjetas y
pastillas, sin animaciones nuevas (el esqueleto sigue con `motion-safe:animate-pulse`). Contraste de
`muted-foreground` (#636366) sobre `muted` (#F5F5F7) ≈ 5,6:1.

### Contrato compartido

Sin cambios de firmas de core: `AppointmentListRow` conserva sus campos (cambia el formato de `dateLabel`,
`timeLabel` y el texto de `priceLabel` sin cargo). En web, `ROW_STATUS_VISUAL` pasa a `ROW_STATUS_ICON` (solo lo
usaban la tabla y la lista del celular) y `TurnosFilters` suma las props `resultCount` y `onQueryChange`.
