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

---

# Review — HU-017d, entrega 017d-3 (plan, con el merge de 018d)

**Veredicto:** APPROVED

Alcance revisado: `git diff 03cd797..HEAD` sin los archivos del arnés, más el merge `03cd797` en sí.
Comandos que corrí yo: `npm run typecheck` (core, db, bot, web) dio exit 0. `npm run test` dio 151 archivos y 2368 tests, exit 0. `npm run lint --workspace apps/web` no dio warnings ni errores. `./ops/harness/verify.sh` dio exit 0, "Arnés OK". Su aviso "Se tocó el bot" sale de comparar contra `develop`: en `git diff 03cd797..HEAD` no hay nada de `apps/bot`.

## Checkpoints
- C1 backlog válido, 1 HU activa por responsable: [x]. `backlog/HU-017d.json` está en `en_revision`, `entrega_actual` 017d-3.
- C1 bitácora refleja la HU: [x]. `progress/current-senkuch4n.md` registra el merge y 017d-3.
- C1 no toca HU de la otra persona: [x]. El diff de 017d-3 no tiene archivos de imleticio. `lib/plan-pdf.tsx`, `/portal/plan/pdf`, `alimentos/**`, `planes/**`, `meals-editor.tsx`, `meal-view.ts` y `macro-totals.tsx` no tienen diff desde `03cd797`.
- C1 verify.sh exit 0: [x]
- C2 HU completa: [x]. `docs/hu-017d-portal.md`, §2.3, §4.3 y D1/D13–D16 resueltas.
- C2 SDD con contrato: [x]. `Refactorizaciones/017d-portal.md` §4-3.
- C2 firmas = contrato: [x]. `DaySelector.today?: Weekday` (`day-selector.tsx:33`). `PortalPlanView` sin `totals` y `weekly?: { today; loadedDays } | null` (`plan-view.tsx:21-30`). `PortalMealItems`, `PortalMealCard` y `PortalDayView` sin `dayTotals` (`portal-day-view.tsx`). `PortalRecipeSheet({ recipe, trigger: React.ReactElement })` (`portal-recipe-sheet.tsx:19`).
- C3 lógica pura en core y sin duplicar domain: [x]. 017d-3 no agrega lógica nueva: reusa `recipePortionText`, `measureAmountText`, `formatGrams`, `itemsForDay` y `RECIPE_PICKER_TEXT` de 018, sin cambiarlos.
- C3 schema/domain y consumidores: [x]. 017d-3 no los cambia. Los de 018 llegan con el merge y bot y web compilan.
- C3 migraciones: [x]. 017d-3 no agrega ninguna. `food_measures` viene de 018d, que ya está aprobada.
- C3 el portal solo expone datos propios: [x]. `page.tsx` sigue buscando el plan por `patient.id` de la cookie, con status ACTIVE, y `listPlanRecipePreviews(plan.id)` trae solo las recetas de ese plan. No hay ids en query ni en params.
- C3 bot en silencio y textos: [x]. No aplica: el bot no tiene diff.
- C3 sin console.log/TODO: [x]. El grep sobre las líneas agregadas da vacío.
- C4 typecheck: [x]
- C4 tests: [x]. Son 11 nuevos: 3 de `day-selector.test.tsx` y 8 de `portal-day-view.test.tsx`, y cubren todos los casos de §9-3. Core no cambia.
- C4 bot simulado: [x]. No aplica.
- C4 PDF: [x]. El PDF no cambia: solo cambió el botón (`tinted`, "Descargar plan (PDF)", `plan-view.tsx:112-121`). El implementer verificó `GET /portal/plan/pdf` con 200 `application/pdf`.
- C5 impl: [x]. Es la sección 017d-3 de `progress/impl_HU-017d.md`.
- C5 review: [x]
- C5 sin scripts ni datos sueltos: [x]. `git status` no muestra archivos nuevos de la HU (los sin trackear son de antes y ajenos). La limpieza por id está documentada, con los conteos de antes y después iguales.

## Lo que verifiqué punto por punto

1. **El merge (`03cd797`).** `git show --cc 03cd797` muestra cambios de resolución solo en `progress/current-senkuch4n.md` y `progress/history.md`. Todo el código se mezcló solo, sin edición manual. En la bitácora quedaron las dos partes: entradas de 018c/018d y de 017c/017b/017d, más la línea del merge. `git grep` no encuentra marcadores de conflicto en el código. `packages/core/src/index.ts` exporta `./portal` al final y conserva los exports de 018 (T2). La rama `feat/hu-018d-medidas-caseras` coincide con `origin` (`aa9f3e6`) y todavía no está en `develop`, así que el merge corresponde (Resolución D14). Typecheck y tests pasan con el merge.
2. **Sin kcal ni macros en lo que se ve (D1).** `MacroTotals` desapareció de `plan-view.tsx` y de `portal-day-view.tsx`, y nada en `(portal)` lo importa. `page.tsx` ya no manda `totals` ni `dayTotals` (Q10): `computeWeeklyTotals` se queda en el servidor solo para `isWeekly` y `loadedDays` (`page.tsx:45-52`). Un grep de `kcal|macro|proteína|carbohidrat|grasas|fibra|energía` en `app/(portal)`, `components/portal` y `lib/portal-recipe.ts` solo encuentra comentarios y el `showMacros={false}` del sheet. `PortalRecipeView` no tiene `perPortion` y `portalMealsForClient` le saca los macros a las recetas. El test "no muestra kcal ni macros" renderiza una comida con alimento, medida y receta. Excepción conocida: Q11, en Dudas.
3. **"Ver receta" (D13).** Con detalle, la fila entera es un `<button type="button">` (`portal-day-view.tsx:66-77`) con `min-h-16`, miniatura de 48 px `rounded-lg`, nombre, porción, "Fuente: …" y `RECIPE_PICKER_TEXT.viewRecipe` + `ChevronRight` (`aria-hidden`) a la derecha. Tiene foco visible y press. `SheetTrigger asChild` le suma `aria-haspopup="dialog"`, y el test lo verifica. Sin detalle, la fila no es botón ni dice "Ver receta" (`:35-41`, con test). El nombre accesible del botón incluye el nombre de la receta, así que no hace falta el `sr-only` de 018c-2.
4. **Sheet inferior.** `useMediaQuery("(max-width: 767px)")` da `bottom` en el celular y `right` desde 768 px. El sheet lleva `theme-portal` y `pt-7` en el encabezado compacto, que es arrastrable porque `SheetHeader` trae `data-sheet-handle`. `RecipeDetailBody` queda igual (`showMacros={false}`). El default de servidor de `useMediaQuery` (false) no produce desajuste de hidratación, porque el sheet está cerrado en el primer render y `SheetContent` no monta nada hasta abrirse. El arreglo `[&>button]:z-20 [&>[aria-hidden=true]]:z-20` (`portal-recipe-sheet.tsx:600-603` del diff) corresponde a la estructura real del primitivo: el agarre es el único hijo directo `aria-hidden` (`primitives/sheet.tsx:267`) y la X el único botón hijo directo (`:272`).
5. **Medida casera.** `PortalFoodItem` (`portal-day-view.tsx:84-102`) usa `li flex items-start justify-between gap-4`, el nombre con `min-w-0 flex-1 break-words text-body-lg` y la derecha con `shrink-0 flex-col items-end`: `measureAmountText` en Body y `formatGrams` en `text-footnote tabular-nums text-muted-foreground`. Sin medida va `Quantity decimals={1}`, que da "37,5 g" (D15). Los tests cubren "1½ tazas" + "270 g" y "37,5 g".
6. **Serialización de servidor a cliente (T9a).** `page.tsx` pasa solo datos planos a `PortalPlanView`, que es server-safe. Este pasa a componentes de un archivo `"use client"` solo `meal`, `items`, `recipes`, `today` y `loadedDays`, todo plano. `trigger` es un elemento JSX que arma `PortalRecipeItem`, que ya está del lado cliente. Ningún ícono ni función cruza el límite.
7. **"Hoy" y día.** `DaySelector` sin `today` arma el mismo `aria-label` que antes (`[long, null, unloaded?…].join(", ")` es lo mismo que `"Martes, sin cargar"`) y el mismo DOM. Su único otro consumidor, `meals-editor.tsx:169`, no pasa `today`. El día de hoy sale de `weekdayInTimeZone(new Date(), pro.timezone)` en el servidor. El `h2` del día está en `text-title-3` y el texto de día vacío es literal al Gherkin. El fundido usa `initial={changed ? { opacity: 0 } : false}`: es un desvío justificado de la SDD, para que el HTML del servidor no llegue en opacidad 0. `MotionProvider` (LazyMotion) está en `app/layout.tsx:15`.
8. **Textos.** "Todavía no tenés un plan." y "Cuando tu nutricionista te lo comparta, lo vas a ver acá." (`page.tsx:35-36`). "Todos los días" va en `span` sin `Badge`. "Elegí una de estas opciones". "Descargar plan (PDF)" en `tinted`, `size="lg"`, `w-full sm:w-auto`, debajo del título.
9. **Alcance.** `git diff 03cd797..HEAD --name-only` da exactamente los 7 archivos de §7.2 más los del arnés.

## Cambios requeridos

Ninguno.

## Dudas (no bloqueantes)

- **Q11: `macros`/`kcalBreakdown` de los ítems de alimento siguen en el payload RSC.** `portalMealsForClient` (`lib/portal-recipe.ts:43-56`) limpia solo las recetas. La paciente no los ve, pero están en los props que viajan al cliente (el implementer contó "kcal" 22 veces en el RSC). La SDD decidió no tocarlo en 017d (Q11, aceptada, porque es código de 018). Por eso no bloquea. Hay que anotarlo en el PR y abrir una tarea directa: alcanza con poner `macros: null, kcalBreakdown: null` también en los ítems de alimento, porque el portal ya no los usa en el cliente. El comentario de `lib/portal-recipe.ts:39` ("Los totales del día se calculan en el server ANTES…") quedó viejo: ya no hay totales en el portal.
- **La X y el agarre se van con el scroll.** Los dos son `absolute` dentro de un panel `overflow-y-auto` (`primitives/sheet.tsx:81`, `:267`, `:272`), mientras el encabezado es `sticky`. Con una receta larga, al bajar dejan de verse, aunque el encabezado sigue arrastrando, y Esc y tocar afuera siguen andando. Es del primitivo y el implementer lo anotó. Hay que mirarlo en el recorrido en el celular.
- **El selector `[&>[aria-hidden=true]]:z-20 [&>button]:z-20`** depende de la estructura interna de `SheetPanel`. Si el primitivo suma otro hijo directo `aria-hidden` o botón, cambia sin aviso. Lo mismo pasa en `recipe-picker-sheet.tsx:249` del panel (018c), que todavía no tiene el arreglo: va en el PR para imleticio.
- **El texto de la porción** dice "1 porción (¾ albóndigas)" (`recipePortionText` de 018) y no "1 porción: ¾ albóndigas" como el Gherkin. Se respeta D14 (no tocar 018).
- **Padding de la fila de receta:** quedó `py-2` en el botón dentro de un `li py-1`, contra `py-3` en la SDD. El alto mínimo de 64 px se mantiene. Es cosmético.
- **En el recorrido del orquestador faltan** "Receta en el plan" y "Alimento en medida casera" en el celular: el plan real no tiene recetas ni medidas. También falta D19 (2) en un celular real. El runtime del implementer cubre las dos cosas con datos de prueba en Chromium.
