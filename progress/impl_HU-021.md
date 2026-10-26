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
