# Review — HU-021

**Veredicto:** APPROVED (aprobada)

Diff revisado: `git diff feat/morph-dialog..HEAD` (9 commits, `310741d`..`3ae8a4b`, 25 archivos, +2279/−55).
Fuentes: `docs/hu-lista-turnos.md` (§7), `Refactorizaciones/lista-turnos.md` (§5, §9, §10, §12), `CHECKPOINTS.md`, `AGENTS.md`.
No se marcan como defecto las decisiones validadas por el usuario: sin tarjeta «Por cobrar», texto neutro en «Pago»,
nombre «Turnos», sin grilla, sin skill de UI (referencia = captura), seña vencida por texto exacto (sin migración).

## Verificación corrida por el reviewer (desde la raíz)
- `npm run typecheck` → exit 0 (core, db, bot y web).
- `npx vitest run` → exit 0, 158 archivos, 2471 tests.
- `./ops/harness/verify.sh` → exit 0, «Arnés OK» (WARN esperado: no hay cambios sin commitear en apps/ ni packages/).
- `git diff --stat develop -- packages/db/prisma` → vacío. Sin cambios en `apps/bot/**`, `api/appointments`,
  `pagos/page.tsx`, `appointment-payment-modal.tsx`, `domain/appointments.ts`.
- B1 en runtime del bot: `npx tsx` desde `apps/bot` importa `@nutri-bot/core` y `DEPOSIT_AUTO_CANCEL_REASONS` da
  exactamente «Venció el tiempo para pagar la seña» y «No se pudo generar el checkout de la seña».
- Sin `console.*`, `TODO`, `FIXME` ni `debugger` en las líneas agregadas.

## Checkpoints
- C1.1 backlog válido, 1 HU activa por responsable: [x] (verify.sh: «imleticio: HU-021», `en_revision`).
- C1.2 bitácora refleja la HU: [x] `progress/current-imleticio.md` → HU-021 en `en_revision`.
- C1.3 no toca HU ajenas: [x] el diff solo toca código de HU-021.
- C1.4 verify.sh exit 0: [x].
- C2.1 HU completa: [x] `docs/hu-lista-turnos.md` con Contexto, Gherkin, Datos, UX, Fuera de alcance y §7 Resoluciones.
- C2.2 SDD completa: [x] workspaces, checklist §9, contrato §5.
- C2.3 firmas = contrato: [x] `packages/core/src/appointment-list.ts` exporta los nombres y firmas de §5.1 con los
  mismos textos; `deposits.ts:14-17` = §5.2; `payments.ts:73,211` = §5.3; `SelectedAppointment`,
  `AppointmentDetailBody`, `AppointmentOption.balanceAmount`, `appointmentCancelKey`/`useScheduleAppointmentCancel`,
  `GroupedListRow.onClick(event)`, `TurnosAppointment`/`loadTurnosMonth` = §5.4/§6.2.
- C3.1 lógica pura en core / sin duplicar consultas: [x] toda la derivación vive en core; el loader solo-web
  `turnos/data.ts` sigue T8 (mismo criterio que `/pagos`).
- C3.2 cambio en `packages/db/domain` con web y bot compilando: [x] `payments.ts` solo reemplaza dos literales por
  constantes con el mismo valor (verificado en runtime); sin cambio de firma; bot typecheck + tests en verde.
- C3.3 migraciones: [x] N/A, no hay.
- C3.4 auth: [x] `/turnos` está bajo `(panel)/layout.tsx` (`auth()` + `redirect("/inicio")`) y el matcher de
  `middleware.ts` no lo excluye. Sin portal.
- C3.5 bot en silencio / textos: [x] el bot no cambia; las únicas salidas a WhatsApp son las acciones existentes
  (cancelar con «Deshacer», recordatorio), sin cambios.
- C3.6 sin debug ni TODOs: [x].
- C4.1 typecheck limpio: [x].
- C4.2 lógica nueva de core testeada y tests en verde: [x] `appointment-list.test.ts` cubre los bloques 1–8 de §11
  (incluidos el borde `startsAt === now`, centavos `100.1`/`33.33`, pago de más, precio 0, Hugo que pasa
  «Cancelados» sin contar en la tarjeta, ida y vuelta de la URL); `deposits.test.ts` fija los literales.
- C4.3 flujo del bot simulado: [x] N/A, no se tocó el flujo del bot. Todos los tests nuevos son con mocks, no escriben
  en la base ni encolan `OutboundMessage`.
- C4.4 PDF/documento: [x] N/A.
- C5.1 `progress/impl_HU-021.md` existe y describe lo tocado: [x].
- C5.2 `progress/review_HU-021.md` con veredicto: [x] este archivo.
- C5.3 sin scripts sueltos ni datos de prueba: [x] no hay scripts nuevos; el reporte dice que no se escribió en la base
  y ningún test del diff toca Prisma real (`data.test.ts` mockea `@nutri-bot/db`).

## Puntos de atención pedidos
- **B1 (`payments.ts`, lo corre el bot):** solo cambia el import (línea 1) y las líneas 73 y 211 pasan de literal a
  `DEPOSIT_AUTO_CANCEL_REASONS.checkoutFailed` / `.expired`. Mismo valor, mismo `where`, misma transacción. Sin
  cambio de comportamiento.
- **Datos de dev / WhatsApp:** sin pruebas contra la base ni mensajes. OK.
- **MorphDialog:** `turnos/appointment-detail-dialog.tsx:36-66` usa `origin` = `e.currentTarget` del botón «Abrir»
  (`appointments-table.tsx`, onClick de «Abrir») o del `<button>` de `GroupedListRow` (`grouped-list.tsx:97`). La
  devolución del foco y el movimiento reducido los resuelve el primitivo (`morph-dialog.tsx:213`, `:394-398`, rama
  `reduced` sin medir ni transformar); el diálogo no los pisa. `onOpenAutoFocus` manda el foco al
  `[data-appointment-title]` como el Sheet. Se conserva el último turno durante la salida.
- **Commits por tarea:** cada commit toca solo los archivos de su tarea (ver Dudas, punto 3, por un matiz en C4).

## Cambios requeridos
Ninguno.

## Dudas (no bloqueantes)
1. **Buscador y resincronización con la URL** (`turnos/turnos-client.tsx:140-146` + `changeQuery` `:171-174`). Next 15
   aplica `history.replaceState` a `useSearchParams` dentro de una transición, mientras `setQuery` es síncrono. Si
   la transición de una tecla anterior se confirma después de la siguiente tecla, el efecto ve
   `urlFilters.query` ("a") ≠ `queryRef` ("ab") y hace `setQuery("a")`, lo que puede comerse letras al tipear
   rápido. No lo pude reproducir sin navegador. Conviene probarlo en el recorrido manual; si pasa, la salida es
   resincronizar solo cuando el cambio de la URL no lo escribió el propio buscador (por ejemplo, guardar el
   último valor escrito).
2. **Foco cuando la fila desaparece** (`turnos-client.tsx:212`). Con un filtro de estado activo (p. ej.
   «Sin cerrar»), después de «Vino»/«No vino» o de cancelar desde el detalle la fila sale de la lista: el
   `getElementById(openButtonId)` no encuentra nada y el foco cae al `body`. Es un caso borde; la HU solo pide el
   foco en «Abrir», que se cumple con «Todos».
3. **Límite C4/C5:** `appointments-table.tsx` entró completo en C4 (`24e2518`), con los botones «Vino» / «No vino» /
   «Registrar pago» / «Abrir» detrás de `actions?`. En C4 el cliente no pasaba `actions` (los botones no se
   renderizaban) y C5 solo los conectó. Funcionalmente respeta «sin acciones de fila todavía», pero el código de
   C5 vive en el commit de C4.
4. **Desvíos visuales de la SDD** pedidos por el orquestador para seguir la referencia (impl, «Decisiones no
   obvias» 1–3): cuatro tarjetas separadas en vez de un contenedor (`turnos-client.tsx:278-296`), pastillas propias
   (`ROW_STATUS_VISUAL`) en vez de `Badge` (§7.3) y «Abrir» `variant="ghost"` en vez de `plain`. Se mantienen tonos,
   íconos, texto (el color no es el único indicador) y R8 (pago sin tonos de advertencia). Queda a criterio del usuario.
5. **Mensajes de commit** con el formato `HU-021 X: …`, no Conventional Commits como dice la SDD §10.2. Igual es la
   convención que ya usa el repo (HU-019), así que no lo marco como defecto.
6. `backlog/HU-021.json` → `titulo` sigue diciendo «…y saldo por cobrar», aunque la tarjeta se sacó del alcance.
   Lo corrige el orquestador.
7. Falta el recorrido visual (§10.1, opcional; el panel pide login con Google). Hay que mirar sobre todo el
   corte en 640 px (el SSR arranca en tabla), el popover/sheet de filtros y el morph desde la fila del celular.
