# Review — HU-017d (entrega 017d-1: acceso, inicio y evolución)

**Veredicto:** APPROVED

Diff revisado: `git diff feat/hu-017b4-ajustes...HEAD` (merge-base = punta de 017b-4, `266f3ac`), commits
`90596bb`..`db3b9b4`, sin los archivos del arnés. Comandos corridos por el reviewer (no se tomó lo del reporte):

| Comando | Resultado |
|---|---|
| `npm run typecheck` | exit 0 (core, db, bot, web) |
| `npm run test` | exit 0, 129 archivos, 2103 tests |
| `npm run lint --workspace apps/web` | "No ESLint warnings or errors" |
| `./ops/harness/verify.sh` | exit 0, "Arnés OK" (el WARN del bot es porque cambió core; `apps/bot/**` sin diff) |
| Base de dev (solo lectura) | 0 filas `Patient`/`EvolutionEntry`/`Appointment` con id `hu017d%` |

## Checkpoints

### C1 — Arnés
- [x] `backlog/` válido; senkuch4n tiene una sola HU activa (HU-017d `en_revision`); imleticio ninguna activa.
- [x] `progress/current-senkuch4n.md:259-263` refleja la HU en curso.
- [x] El diff no toca archivos de imleticio: el grep de la zona de T6 (`alimentos/`, `plantillas/`, `pacientes/[id]/planes/`, `food-picker`, `meals-editor`, `macro-totals`, `meal-view`, `plan-pdf`, `weekly-menu`, `day-selector`) sale vacío.
- [x] `./ops/harness/verify.sh` exit 0.

### C2 — Cadena de documentos
- [x] `docs/hu-017d-portal.md` completo, con las Resoluciones D1–D20.
- [x] `Refactorizaciones/017d-portal.md` con workspaces, checklist por fase y contrato.
- [x] Firmas iguales al contrato 4.1–4.5: `packages/core/src/portal.ts` (todas las funciones y `PORTAL_TEXT` textuales), `lib/shell.ts:31` `getProfessionalPortalContact`, `portal-access.tsx:13,37`, `portal-card-link.tsx:6`, `portal-logout-button.tsx:10`. Lo que se sumó (`portalDocumentTitle`, `getPortalDocumentTitle`, `lib/evolution-chart-rows.ts`) son funciones nuevas que no cambian ninguna firma existente. `export * from "./portal"` es la última línea de `packages/core/src/index.ts` (T2/T11) y no choca con ningún otro export de core.

### C3 — Arquitectura
- [x] Lógica pura en `packages/core/src/portal.ts`, con test. Las consultas solo del portal van en las páginas, con `select` de lo justo (T3). `packages/db` sin diff.
- [x] `schema.prisma` y `packages/db/domain` sin cambios; bot y web compilan.
- [x] Sin migraciones (T1).
- [x] El portal expone solo datos de la paciente:
  - Todas las consultas filtran por `patient.id`, que sale de `getPortalPatient()` (cookie con HMAC, sin cambios). No hay ids en la query ni en los params.
  - **D2:** `evolucion/page.tsx:175` hace `select { id, recordedAt, weightKg, heightCm }`, sin `note`, así que la nota no llega ni al payload RSC. `portalEvolutionRows` arma objetos con exactamente 4 claves (test `Object.keys` en `portal.test.ts:256-259`).
  - El inicio (`page.tsx:357-374`) usa `select` en las tres consultas y en el conteo. El plan solo lee `title`.
  - No hay kcal ni macros en ningún lado (test de lenguaje en `portal.test.ts:264`).
  - La pantalla sin sesión y `generateMetadata` muestran solo el nombre y el WhatsApp de la profesional, que son públicos.
- [x] Seguridad del token y del link vencido (D8):
  - `login/route.ts`, `logout/route.ts`, `patient-session.ts` y `middleware.ts` no tienen diff.
  - `?error=invalid` solo elige el texto (`portal-access.tsx:14`) y no muestra nada de la query.
  - `/portal?error=invalid` con una cookie válida entra al inicio, como decide la SDD (4.3).
  - El fallback del `Suspense` (`layout.tsx:49-55`) es la variante "no-link": no da acceso y solo cambia el texto.
- [x] El bot no cambia (`apps/bot/**` y `messages.ts` sin diff).
- [x] Sin `console.log` ni TODOs.

### C4 — Verificación
- [x] `npm run typecheck` limpio (corrido por el reviewer).
- [x] `portal.test.ts` cubre todo lo de 9-1, más `portalDocumentTitle`. `portal-access.test.tsx` y `evolution-chart-rows.test.ts` están. `npm run test` pasa.
- [x] Flujo del bot: no aplica (no se tocó). El runtime con turnos corrió con el bot apagado y limpió por id. Los conteos del reporte coinciden antes y después, y la base no tiene filas `hu017d%`.
- [x] PDF: no aplica.

### C5 — Cierre
- [x] `progress/impl_HU-017d.md` describe archivos, commits, verificación, datos de prueba y las correcciones del recorrido.
- [x] `progress/review_HU-017d.md`: este archivo.
- [x] No quedan scripts sueltos ni datos de prueba. En `git status` solo están los archivos ajenos que ya había antes, sin trackear.

## Puntos que pidió mirar el orquestador

1. **Datos que no debe ver (macros, notas D2, otras pacientes):** OK (ver C3).
2. **Token y link vencido (D8):** OK (ver C3).
3. **Q4, `primitives/sheet.tsx:133-156`:**
   - La API no cambia.
   - `onDismiss` solo lo dispara `useDismissDrag` desde `onPointerUp`, que es un evento discreto de React. El `setOpen(false)` se aplica antes del `requestAnimationFrame`.
   - Sin veto: `SheetContext.open` pasa a false, o `usePresence` da `isPresent=false`. Las dos cosas vuelven a dibujar `SheetPanel`, así que `stillOpenRef` queda en false y el rAF no hace nada. La salida sigue como antes, con `exitVelocity` intacto.
   - Con veto: no hay re-render y el ref sigue en true. `offset` vuelve a 0 con `springs.standard`, o con `fades.fast` si hay movimiento reducido.
   - Los sheets del panel que no vetan (017a/b/c) no cambian. `ServiceSheet`, que veta, queda arreglado.
4. **Gráfico (`9831216`, `evolution-chart.tsx:89-92`):** `isAnimationActive={false}` siempre, así que con movimiento reducido no hay crecimiento (escenario de la HU cumplido) y no depende de rAF. Las props no cambian. `evolutionChartRows` pasa los valores a número y tiene test.
5. **Props de servidor a cliente:**
   - `PortalAccessGate` y `PortalAccessScreen` reciben strings o null.
   - `PortalLogoutButton` no recibe props.
   - `PortalCardLink`, `Metric`, `EmptyState` (con `icon={TrendingUp}`), `GroupedList` y `StatusScreen` son server-safe: sus archivos no tienen `"use client"`.
   - `ConfirmProvider` (cliente) recibe solo `children`.
   - `EvolutionChart` recibe `{date: Date, value: number}[]`, que se serializa.
6. **`ConfirmProvider` en `(portal)/layout.tsx:76-93`:** envuelve header, `main`, `PortalNav` y `Toaster`, solo cuando hay paciente (como pide 4.3). `useConfirm` se llama en `onClick` (`portal-logout-button.tsx:15-23`), no en una transición.
7. **Zona de imleticio:** intacta (C1).

## Cambios requeridos

Ninguno.

## Dudas (no bloqueantes)

- **Desvío de T5 en el panel:** `evolution-chart.tsx:92` saca la animación de crecimiento **también** en el panel y sin movimiento reducido. La SDD pedía `isAnimationActive={!reduced}` y "el panel queda igual salvo con movimiento reducido". El cambio lo pidió el orquestador en el recorrido (barras en 0 sin rAF), está documentado en el reporte y es más robusto. Conviene anotarlo como decisión en la SDD o en la historia para que 017d-2/3 no lo reviertan.
- **Q4 sin prueba de runtime ni test unitario:** queda para el runtime de 017d-2 ("Anotar comida" con texto → arrastrar → "¿Descartar…?" → Cancelar). Un caso borde teórico: si un dueño cierra el sheet en forma asíncrona, después del cuadro, el panel volvería a 0 y después saldría sin la velocidad del fling. Es un detalle visual, sin pérdida de estado.
- **D20 (contraste de las tarjetas con el brillo bajo) y D19 (prueba con la mamá en un celular real):** `progress/recorrido_HU-017d.md` no los menciona. Quedan pendientes del orquestador o del usuario.
- `ComparativeChart` y `StudyComparisonChart` del panel siguen con la animación de Recharts. Pueden arrancar con las barras en 0 en una pestaña en segundo plano. Está fuera de alcance; lo anotó el implementer.

---

# Review — HU-017d, entrega 017d-2 (diario + R1)

**Veredicto:** APPROVED

Diff revisado: `git diff feat/hu-017d-portal...HEAD` (rama `feat/hu-017d2-diario`, commits `16f13aa`..`31ea74a`), sin los archivos del arnés. Comandos que corrí yo:
- `npm run typecheck`: exit 0 en core, db, bot y web.
- `npm run test`: 132 archivos y 2139 tests, todos OK.
- `npm run lint --workspace apps/web`: sin warnings.
- `./ops/harness/verify.sh`: "Arnés OK", exit 0. El WARN del bot aparece porque cambió core; `apps/bot/**` no tiene diff.
- Consulta de solo lectura a la base de dev: 0 pacientes `hu017d*` o con JID `549351001740*`, `DiaryEntry` = 2 y `Patient` = 21, los mismos conteos de antes.

## Checkpoints
- C1 backlog válido, una HU activa por responsable: [x] (verify.sh: "senkuch4n: HU-017d")
- C1 bitácora refleja la HU: [x]
- C1 no toca archivos de la otra persona: [x]. Tampoco toca la zona de imleticio (T6).
- C1 verify.sh exit 0: [x]
- C2 HU con sus secciones: [x]
- C2 SDD con workspaces, checklist y contrato: [x]
- C2 firmas = contrato: [x]. Coinciden `PORTAL_DIARY_TEXT` (textos exactos), `DiaryDayGroup`, `groupDiaryByDay`, las constantes y funciones de `photo-resize`, `DiaryState`/`DiaryDeleteResult`, `deleteDiaryEntryAction(id)`, los cuatro componentes y `useKeyboardInset`/`keyboardInsetFrom`.
- C3 lógica pura en core, sin duplicar domain: [x]. `groupDiaryByDay` está en core. La consulta sin bytes va con `select` en la página (Q6). `packages/db` no cambia.
- C3 schema/domain: [x]. No hay cambios (T1/T3).
- C3 migraciones: [x]. No hay migraciones.
- C3 el portal solo expone datos propios: [x] (ver el punto 1 abajo)
- C3 bot en silencio y textos: [x]. El bot y `messages.ts` no tienen diff.
- C3 sin console.log/TODO: [x]. El grep sobre las líneas agregadas da vacío.
- C4 typecheck: [x]
- C4 tests de core y test: [x]. Hay 7 de `groupDiaryByDay`, más los de photo-resize, keyboard-inset y actions.
- C4 bot simulado: [x]. No aplica.
- C4 PDF: [x]. No aplica.
- C5 impl existe: [x]. Es la sección 017d-2 de `progress/impl_HU-017d.md`.
- C5 review con veredicto: [x]
- C5 sin scripts ni datos de prueba sueltos: [x]

## Lo que verifiqué punto por punto

1. **Aislamiento entre pacientes.** Las dos actions sacan la paciente de la cookie firmada (`getPortalPatient`, HMAC + `findUnique`), nunca de un parámetro: `actions.ts:23` y `:51`. En el borrado, `findUnique({ select: { patientId } })` y `entry.patientId !== patient.id` dan `deleteError` sin borrar (`actions.ts:56-59`). El test "de otra paciente" lo cubre. El alta usa `patient.id` y el form no lleva ningún id. Para leer, la lista filtra `where: { patientId: patient.id }` (`page.tsx:15-20`). La foto pasa por `photo/[id]/route.ts`, que no cambió y compara `entry.patientId !== patient.id` antes de devolver bytes. El chequeo y el delete no son atómicos, pero `patientId` no cambia, así que no hay TOCTOU.
2. **Borrado idempotente con Deshacer.** La key es `diary:<id>` y `if (!scheduled) return` maneja el doble toque (`diary-list.tsx:41-50`). Las filas y los grupos que salen quedan `inert` (`:106`, `:124`). La action da `ok: true` si el registro no existe o si llega un P2025 entre medio (`actions.ts:58`, `:63`). El plazo es de 8 s (`notify.ts`, `duration: 8000`). Un error al confirmar devuelve la fila con `deleteError`. `PendingUnloadGuard` está en `(portal)/layout.tsx:41`, dentro del `ConfirmProvider` y solo con paciente, y `guardUnload: true` está puesto.
3. **Foto.** Los dos inputs tienen `accept="image/*"` (`diary-entry-sheet.tsx:198`, `:207`), uno con `capture="environment"`. Si el navegador no decodifica la foto (HEIC en Chrome de escritorio), el resultado es `unreadable` → `errorPhoto` (`photo-resize.ts:96`). `canUploadAsIs` deja pasar solo JPEG/PNG/WEBP de ≤ 2,5 MB y ≤ 1600 px, y todo lo demás se re-codifica a JPEG sobre fondo blanco. El servidor sigue validando el tipo y el tope de 3 MB (`actions.ts:32`), cubierto con los tests de gif y de 3 MB + 1. `resizePhotoForUpload` no tira y libera el bitmap o el object URL en `finally`. Una foto que termina de prepararse después de cerrar el sheet se descarta (`generation`, `:55`, `:88-92`).
4. **La consulta no trae bytes.** `select: { id, note, createdAt, photoMimeType }` (`page.tsx:20`), y `hasPhoto` sale de `photoMimeType`. El runtime del implementer midió un HTML de 32 KB sin `/9j/`.
5. **Sheet arrastrable y guardia de descarte.** `requestOpenChange` pregunta con `dirty`, ignora el cierre mientras guarda (`:71`) y usa `confirm` desde el handler, fuera de la transición. El guardado exitoso cierra sin preguntar. `useUnsavedChangesGuard(open && dirty)` (`:50`). La vuelta a 0 cuando se veta el cierre por arrastre (Q4) está en `primitives/sheet.tsx` desde 017d-1. Lo leí y es coherente: `stillOpenRef` sigue en `true` mientras el confirm asíncrono está pendiente, así que el panel vuelve antes de la pregunta. Se verificó en runtime (y = 410 → 410). No hace falta `SheetTrigger`: `useOverlayOpenInfo` del Root guarda y devuelve el foco. El inset del teclado entra por `style.bottom` (`:147`), y `SheetPanel` lo combina en `style={{ ...style, ... }}`.
6. **Props de servidor a cliente.** `DiaryScreen` recibe `groups` (strings, booleanos y `null`) y `openOnMount` (booleano). La página importa `DiaryGroupRow` solo como tipo. `actions.ts` (`"use server"`) exporta dos funciones async y dos `export type` propios, sin re-exports (T9c). Los íconos se importan en los componentes cliente.
7. **Fechas y zona horaria.** `groupDiaryByDay` usa `dayKeyInTz`/`calendarDaysBetween` con `pro.timezone` en el servidor. El test de las 23:30 en Argentina (02:30Z) da "Ayer". Que el 2/10/2026 caiga viernes es correcto: la SDD traía mal el día de la semana, y el implementer lo documentó.
8. **R1.** `comparative-chart.tsx:119-120` y `study-comparison-chart.tsx:104` llevan `isAnimationActive={false}`, el mismo cambio de prop que `9831216`.
9. **Alcance.** Los archivos del diff son exactamente los de 7-2 más R1. `sheet.tsx` no aparece porque 4.6 ya entró en 017d-1. `diary-form.tsx` se borró, y `grep DiaryForm apps/web/src` da vacío.

## Cambios requeridos

Ninguno.

## Dudas (no bloqueantes)

- **Metadatos EXIF de la foto subida tal cual.** Cuando `canUploadAsIs` da `true` (`photo-resize.ts:97`), sube el archivo original, con su EXIF, incluido el GPS si la cámara lo guardó. El dato solo lo ve la nutricionista, y lo que se re-codifica sale sin EXIF. Es lo que dice el contrato de la SDD, pero conviene decidir si se re-codifica siempre para limpiar la ubicación.
- **`EmptyState` sin la acción "Anotar comida"** (`diary-screen.tsx:45`). La SDD 4.5 la pedía. El implementer lo justifica porque el botón lleno de arriba siempre está a la vista, y el escenario "Diario vacío" se cumple igual. Es un desvío menor que está documentado.
- **El formulario no se remonta con `key={openCount}`** como dice 4.5. Lo reemplaza un efecto que limpia todo al cerrar y revoca el object URL. Es equivalente.
- **Borrar con el link vencido:** la action devuelve `errorNoAccess`, pero `runDeferredDelete` muestra `errorMessage` (`deleteError`, "No se pudo borrar. Probá de nuevo."). Como pide la SDD, el registro vuelve. El texto no explica que hay que pedir otro link.
- **Existencia de un id ajeno:** borrar un id que no existe da `ok: true` y uno de otra paciente da `ok: false`, así que se puede distinguir si el id existe. No se borra ni se filtra contenido, y los ids son cuid imposibles de adivinar. El riesgo es despreciable.
- **`max-h-[90dvh]` con `bottom = alto del teclado`** en iOS: `dvh` no se achica con el teclado, así que un contenido alto podría pasar el borde de arriba del visual viewport. Con el contenido de este sheet no debería pasar. Queda para el recorrido en Safari o el simulador (Q5), que todavía falta, igual que la cámara real, HEIC, el movimiento reducido del sheet y D19 (3).
- **`somatochart.tsx:117`/`:127`** sigue con `isAnimationActive={!reduced}` y podría tener el mismo problema de las pestañas de fondo. R1 nombraba solo perímetros y comparación de estudios, así que queda fuera.
- **R1 no se probó en runtime:** los gráficos están detrás de Google. Es una prop idéntica a la ya verificada en `evolution-chart`.
