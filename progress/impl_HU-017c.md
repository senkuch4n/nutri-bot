# Implementación HU-017c, entrega 017c-1 (lista de pacientes)

- **Estado:** done
- **Rama:** `feat/hu-017c-pacientes` (contiene `origin/develop` 524c94a; no hizo falta rebase). Sin push.
- **SDD:** `Refactorizaciones/017c-pacientes-consultas.md`, entrega 017c-1, más la sección "Decisiones".
- **Modelo:** Opus. **Skills:** `apple-design` y `ui-ux-pro-max` antes del JSX; `web-design-guidelines` como autochequeo final.

## Commits (uno por fase)

| Commit | Fase |
|---|---|
| `e076a17` | 1: helpers de contacto, teléfono, fechas y directorio (core) |
| `8f59d91` | 2: `GroupedListRow` grande, skeleton, `useMediaQuery` y "Poner nombre" (action) |
| `ce656d8` | 3: lista de pacientes con buscador, próximo turno y "Por completar" |
| `fef5ba6` | 4: teléfono con formato y sin WhatsApp para `@lid` en la ficha |
| `58fd625` | 3 (arreglo del autochequeo): "Poner nombre" conserva lo escrito y enfoca el campo ante un error |
| (este archivo) | 5: implementación y verificación |

## Archivos

**packages/core** (solo exports nuevos):
- `src/whatsapp-contact.ts` + test: `classifyWhatsappJid`, `isPersonJid`, `whatsappChatUrl`, `HIDDEN_NUMBER_TEXT`, `WhatsappContactKind`.
- `src/phone-format.ts` + test: `formatPhone`, `AR_AREA_CODES_3` (38 códigos), `COUNTRY_CODES_2`.
- `src/relative-date.ts` + test: `calendarDaysBetween`, `capitalizeFirst`, `formatAppointmentWhen`, `formatTimeAgo`.
- `src/patient-directory.ts` + test: `PatientDirectoryInput`, `PatientDirectoryRow`, `PatientDirectory`, `buildPatientDirectory`, `matchesPatientQuery`, `patientCountLabel`, `PATIENT_DIRECTORY_TEXT`.
- `src/index.ts`: 4 `export *`.

**apps/web:**
- `components/grouped-list.tsx`: `GroupedListRow` suma `size?: "md" | "lg"` (default `"md"`, que no cambia nada).
- `components/skeletons.tsx`: `GroupedListSkeleton({ rows = 8, bare })`.
- `lib/use-media-query.ts` (nuevo): `useMediaQuery(query, serverDefault?)` con `useSyncExternalStore`.
- `app/(panel)/pacientes/actions.ts`: `setPatientNameAction` + `SetPatientNameState`. El archivo sigue exportando solo funciones async y `export type`.
- `app/(panel)/pacientes/actions.test.ts` (nuevo, mocks).
- `app/(panel)/pacientes/page.tsx` (reescrito, consulta de 7.1: 3 lecturas en paralelo, sin N+1).
- `app/(panel)/pacientes/patient-directory.tsx` (nuevo): buscador, filas, contador, estados, "Por completar", Sheet.
- `app/(panel)/pacientes/name-contact-sheet.tsx` (nuevo).
- `app/(panel)/pacientes/patients-list.tsx`: borrado (`grep -rn patients-list apps/web/src` da vacío).
- `app/(panel)/pacientes/loading.tsx` (reescrito).
- `app/(panel)/pacientes/[id]/patient-header.tsx` y `[id]/page.tsx`: teléfono con formato, sin botón de WhatsApp para `hidden`.
- `app/(panel)/dev-diseno/_sections/lists.tsx`: un grupo de ejemplo con filas `size="lg"` (2.1 del checklist).

Sin cambios en `packages/db`, `apps/bot`, `schema.prisma`, migraciones ni la zona de imleticio.

## Contrato compartido

Los nombres y firmas coinciden con la SDD §4.1 a §4.6: los cuatro módulos de core, `PATIENT_DIRECTORY_TEXT` (textos
literales), `setPatientNameAction(prev, formData)`, `SetPatientNameState`, `GroupedListRow.size`, `GroupedListSkeleton`
y `useMediaQuery`. Ningún export existente cambió de firma.

## Verificación

| Comando | Resultado |
|---|---|
| `npm run db:generate` | ok (cliente de esta rama) |
| `npm run typecheck` | core, db, bot y web en verde |
| `npm run test` | 101 archivos, 1719 tests en verde. Nuevos: whatsapp-contact (15), phone-format (16), relative-date (28), patient-directory (31), pacientes/actions (6) |
| `npm run lint --workspace apps/web` | solo el warning previo de `ajustes/logo-form.tsx` (alt de `<img>`) |
| `./ops/harness/verify.sh` | "Arnés OK". Avisa "Se tocó el bot", pero el aviso sale de las carpetas sin trackear `apps/bot/.whatsapp-auth.vieja*`, que son del usuario: el diff de la rama no toca `apps/bot` |
| `next build` (webpack, copia en el scratchpad) | exit 0. Compila `/pacientes` y `/pacientes/[id]`. Warnings previos de `jose`/`next-auth` (Edge Runtime), nada de esta entrega |
| `next build --turbopack` (misma copia) | exit 0, "Compiled successfully". Sin el error "Only async functions are allowed to be exported in a "use server" file" |
| Alcance del diff (10.2) | contra `origin/develop`: ningún archivo de imleticio, de `apps/bot`, `packages/db`, `schema.prisma` ni migraciones. `backlog/HU-017c.json` aparece por los commits del orquestador (HU y SDD), no por esta entrega |

Las builds se hicieron en una copia en el scratchpad, que después se borró. El dev server de :3100 no se tocó.
No se escribió en la base: ni filas de prueba ni migraciones. No hay mensajes de WhatsApp y no se corrió `db:seed`.

## Decisiones no obvias y desvíos

1. **Capturas "antes" y "después" (0.3 y 5.1): no se hicieron.** Esta sesión no tiene un navegador, y el recorrido en
   Chrome (10.3) le toca al orquestador. Queda para su recorrido.
2. **Archivo de progreso:** se llama `progress/impl_HU-017c.md` (lo pidió el orquestador). La SDD decía `impl_HU-017c-1.md`.
3. **"Por completar" sin búsqueda:** la segunda línea se muestra con `capitalizeFirst` ("Escribió hace 2 días"), porque
   empieza la línea. Con búsqueda queda "Sin nombre · escribió …", como dice la SDD. El valor de `lastContactLabel` en
   core es el literal de la SDD ("escribió …").
4. **Contador de "Por completar (N)":** con búsqueda, N es la cantidad de coincidencias. Sin búsqueda es el total.
5. **`matchesPatientQuery`:**
   - Si la búsqueda no tiene letras ni dígitos (por ejemplo, "+" o "--"), no filtra.
   - En el modo con letras, las palabras que son solo signos se ignoran.
   - A una palabra se le sacan los signos para decidir si es "solo dígitos" (por ejemplo, "555-2345," cuenta como dígitos).
   - Los nombres se comparan con la palabra normalizada, o con la palabra sin signos.
6. **Botón "×":** se usa el `Button` de primitives con `variant="plain" size="icon-lg"` (44 px). El `Button` de `ui.tsx`
   no tiene `icon-lg`, y la SDD no permite cambiar su firma.
7. **"Poner nombre":**
   - El `Input` es controlado. React 19 resetea los campos no controlados de un `<form action>` al terminar la action,
     y con "No se pudo guardar" se perdería lo escrito.
   - Si hay un error, el foco vuelve al campo.
   - El error va con el `error` de `Field`: queda inline debajo del campo, con `role="alert"`. Se usó en lugar de un `FormError` aparte.
   - El botón de cada fila tiene `aria-label` "Poner nombre: <teléfono o texto oculto>", que empieza con el texto
     visible (WCAG 2.5.3), para distinguir los botones con lector de pantalla.
8. **Foco al cerrar el Sheet:** si se guardó, `onCloseAutoFocus` hace `preventDefault()` y enfoca el buscador. Si se
   canceló, sigue el comportamiento por defecto (`preserveUserFocusOnClose` lo devuelve al botón que lo abrió).
9. **Buscador en táctil:** la regla global de `globals.css` (sin `@layer`, inputs ≥ 16 px en `pointer: coarse`) le gana
   a `text-body-lg`. En el celular el texto del buscador queda en 16 px; en escritorio, en 17 px. No se tocó la regla
   global, que está fuera de alcance.
10. **Disclosure:**
    - `aria-controls` apunta a un contenedor que siempre existe. Adentro, `AnimatePresence` con fundido de opacidad (`fades.fast`).
    - El chevron rota con `springs.quick`. Con movimiento reducido el cambio es instantáneo (`duration: 0`).
11. **Página:** el `nextAppointment` se arma solo si el status es `CONFIRMED` o `AWAITING_PAYMENT` (el `where` ya lo
    filtra; el chequeo es para el tipo).

## Autochequeo web-design-guidelines

- Arreglado: el foco va al primer error del form, y lo escrito ya no se pierde si la action falla (commit `58fd625`).
- Se dejó como está, a propósito:
  - El placeholder no termina en "…": el texto es literal de la HU.
  - La búsqueda no queda en la URL: la SDD 4.7 dice "Sin `searchParams`".
  - La lista no está virtualizada: son de decenas a pocos cientos de filas (SDD 7.1).
  - Botones con mayúscula solo en la primera palabra: es la convención del español.
  - `autoFocus` en el Sheet: tiene un solo campo y se abre por un toque explícito.

## Pendiente para el orquestador

- Recorrido 10.3 en Chrome (datos de prueba por id, según la SDD), capturas y las tareas de D1.

---

# 017c-2: ficha de 4 pestañas y Resumen

- **Estado:** done
- **Rama:** `feat/hu-017c2-ficha`, encadenada sobre `feat/hu-017c-pacientes` (decisión Q6). Sin push.
- **SDD:** `Refactorizaciones/017c-pacientes-consultas.md`, entrega 017c-2, "Decisiones" y "Agregados a 017c-2" (R1).
- **Modelo:** Opus. **Skills:** `apple-design` y `ui-ux-pro-max` antes del JSX; `web-design-guidelines` como autochequeo final.

## Commits (uno por fase)

| Commit | Fase |
|---|---|
| `5215bc2` | A: resumen del paciente en lenguaje común (core) |
| `b542ffa` | B: alias de pestañas y "Editar datos" (action) |
| `14baad9` | C: ficha de 4 pestañas con alias de URL |
| `6dd682a` | D: Resumen con una acción principal y datos en lenguaje común |
| `6644339` | E: Historial, Consultas y Plan |
| `5dddc5d` | R1: "Por completar" se cierra con un clic aunque la búsqueda tenga coincidencias |
| `efa9515` | F: loading de la ficha, autochequeo y verificación (y este archivo) |

## Archivos

**packages/core:**
- `src/patient-summary.ts` + test (nuevo): `formatShortDate`, `formatConsultationDay`, `RecordedItem`, `consultationRecordedItems`,
  `recordedItemsText`, `WeightPoint`, `WeightTrend`, `weightTrend`, `AppointmentStatusLike`, `appointmentHistoryText`,
  `APPOINTMENT_STATUS_TEXT`, `ACTIVITY_PLAIN_LABELS`, `missingForCaloriesText`, `PATIENT_SUMMARY_TEXT`. Un export extra
  fuera del contrato: `joinSpanish` (la unión "a, b y c", que usan dos funciones del contrato). Ningún nombre choca.
- `src/patient-formula-data.ts`: `missingFormulaDataMessage` dice "Editar datos" e "Historial" (0.1). Tests actualizados
  en `patient-formula-data.test.ts` y `energy-requirement.test.ts`.
- `src/index.ts`: `export * from "./patient-summary"`.

**apps/web:**
- `lib/patient-tab-route.ts` + test (nuevo): `PATIENT_TABS`, `PatientTab`, `HISTORY_VIEWS`, `HistoryView`,
  `resolvePatientTab`, `patientTabQuery`, con la firma de la SDD 4.2.
- `pacientes/actions.ts`: `updatePatientDataAction` + `PatientDataState` (nuevos); se borró `updatePatientAction`
  (sin consumidores). `PatientState` y `updateFormulaDataAction` se quedan. Test en `pacientes/actions.test.ts`.
- `pacientes/[id]/clinical-actions.ts`: se borró `updateClinicalRecordAction`.
- `pacientes/[id]/patient-tabs.tsx` (reescrito): 4 pestañas, `?tab=`/`?vista=` con alias, chrome `material-chrome`
  pegado con scroll edge (`useScrollEdge`), contador de Consultas en texto, punto + `sr-only` en Historial,
  `PatientTabLink` (`{ tab, view?, focus? }`), `PatientTabButton` y `usePatientTabs()`. El foco `datos` lleva a
  `#datos-paciente` y enfoca su título (`tabIndex={-1}`).
- `pacientes/[id]/patient-header.tsx` (reescrito), `header-name-button.tsx` (nuevo, reutiliza `name-contact-sheet.tsx`),
  `clinical-alert.tsx` ("Ver antecedentes" → Resumen con foco en los datos).
- Resumen: `summary-section.tsx`, `summary-card.tsx`, `weight-sparkline.tsx`, `patient-data-section.tsx`,
  `detail-disclosure.tsx`, `edit-patient-sheet.tsx` (nuevos).
- Historial, Consultas y Plan: `history-section.tsx` (nuevo), `appointments-section.tsx`, `consultations-section.tsx`,
  `diary-section.tsx`, `plans-section.tsx` (solo lo visual).
- `pacientes/[id]/page.tsx` (reescrito), `pacientes/[id]/loading.tsx` (reescrito).
- `consultation-date-sheet.tsx`: `NewConsultationButton` suma `trigger?` (opcional; sin él, el botón de siempre).
- `consultas/[consultationId]/requirement-section.tsx` y `antropometria/page.tsx`: solo el `href`, de `?tab=datos` a `?editar=datos`.
- `(calendario)/page.tsx` acepta `?fecha=` (validado con `isValidDayKey`). `calendar-client.tsx` suma `focusDate?`, que va
  a `initialDate` de FullCalendar (no al modal de turno nuevo).
- `components/ui.tsx`: `Metric.trend` suma `display?: "delta" | "label"` (opcional; default igual que hoy).
- `pacientes/patient-directory.tsx`: R1.
- Borrados: `evolution-summary.tsx`, `formula-data-section.tsx`, `requirement-summary-card.tsx`, `patient-form.tsx`,
  `clinical-record-form.tsx`.

Sin cambios en `packages/db`, `apps/bot`, `schema.prisma`, migraciones ni la zona de imleticio. `FormulaDataSheet`,
`FormulaDataForm` y `updateFormulaDataAction` se quedan para la consulta y el estudio ISAK.

## Contrato compartido

Los nombres y firmas coinciden con la SDD de 017c-2: §4.1 (core), §4.2 (`patient-tab-route.ts`), §4.3
(`updatePatientDataAction(prev, formData)`, `PatientDataState` con los 5 `fieldErrors`) y §4.4 (`?fecha=`, `focusDate?`).
`PatientTabLink` toma `{ tab: PatientTab; view?: HistoryView; focus?: "datos" }`. Ningún export existente de core cambió
de firma. Las props nuevas de `Metric`, `NewConsultationButton` y `CalendarClient` son opcionales.

## Verificación

| Comando | Resultado |
|---|---|
| `npm run typecheck` | core, db, bot y web en verde |
| `npm run test` | 103 archivos, 1778 tests en verde. Nuevos: `patient-summary` (32), `patient-tab-route` (20), `pacientes/actions` (+7, total 13) |
| `npm run lint --workspace apps/web` | solo el warning previo de `ajustes/logo-form.tsx` |
| `./ops/harness/verify.sh` | "Arnés OK". El aviso "Se tocó el bot" sale de las carpetas sin trackear `apps/bot/.whatsapp-auth.vieja*` |
| `next build` (webpack, copia en el scratchpad) | exit 0. Compila `/pacientes/[id]` y `/`. Solo los warnings previos (`jose` en Edge, alt de `logo-form`) |
| `next build --turbopack` (misma copia) | exit 0, "Compiled successfully". Sin el error de exports en `"use server"` |
| Alcance (10.2 / 10-2) | contra `origin/develop`: ningún archivo de imleticio (`alimentos/`, `plantillas/`, `pacientes/[id]/planes/`, `food-picker`, `meals-editor`, `plan-pdf`, `pdf-theme`), ni de `apps/bot`, `packages/db`, `schema.prisma` o migraciones |
| `plans-section.tsx` | el diff no tiene líneas `+`/`-` con `createPlanAction`, `applyTemplateAction`, `useActionState`, `name=` ni `action={`: los formularios quedan iguales |

La copia del scratchpad se borró. El dev server de :3100 no se tocó (responde 200). No se escribió en la base: ni filas
de prueba ni migraciones (la `food_measures` aplicada no se tocó). No hay mensajes de WhatsApp y no se corrió `db:seed`.

## Decisiones no obvias y desvíos

1. **Tendencia de peso visible.** `Metric` mostraba el delta ("−6,8 kg") y dejaba la frase solo para lectores de
   pantalla. La HU pide ver "Bajó 6,8 kg desde el 11/05", así que `trend` suma `display: "label"` (opcional). El color
   sigue en `neutral` (D10). El rótulo de la métrica es "Medido el 24/09".
2. **Tarjeta Peso como `<a>`.** Las tarjetas que cambian de pestaña son un `<a href="?tab=historial">` que intercepta el
   clic (sin ir al servidor). Un `<button>` no puede tener el `<p>`/`<div>` de `Metric` adentro, y el `<a>` además
   sirve para Cmd/Ctrl+clic. Las tarjetas sin destino ("Sin turno", "Sin plan activo", sin mediciones) son estáticas.
   "Ver planes" y "Cargar peso" van en el pie, como botones aparte.
3. **"Datos de la paciente".**
   - Filas propias dentro de `GroupedList`, no `GroupedListRow`. Su `value` es `shrink-0` y no entra a 390 px con
     "1.698 kcal por día · 24/09". Las filas propias pasan el valor a la línea de abajo si no entra, y los textos
     largos (antecedentes, objetivos, calorías sin indicar) van debajo del rótulo.
   - El aviso completo de antecedentes de riesgo (`ClinicalAlert`) está arriba de la lista, como pide la SDD. La fila
     "Antecedentes" dice "… (riesgo)".
   - Con faltantes, el aviso amarillo muestra "Completar" si falta algo del Sheet, y "Cargar peso" si falta peso o talla.
     Si faltan las dos cosas, aparecen los dos botones.
   - "Ver detalle" incluye el texto "Estos datos los usan las fórmulas de calorías." y la lista de qué fórmulas usan
     cada dato (Mifflin-St Jeor, Harris-Benedict, Schofield, Katch-McArdle, Cunningham, Hamwi). Esa lista vive en la
     UI, no en core.
4. **"Editar datos".**
   - El form no usa `action={…}`: se envía con `onSubmit` + `startTransition(() => formAction(data))`. React 19
     resetea los campos no controlados al terminar una form action, y con un error se perdería lo escrito.
   - Con error, el foco va al primer campo marcado.
   - La fecha de nacimiento se guarda como medianoche UTC del día elegido. Es la columna `@db.Date`, y
     `computeAgeYears` lee el día en UTC. La action vieja usaba el mediodía local del servidor.
   - Una fecha inválida ("2026-02-30") da `fieldErrors.birthDate`.
   - Un nombre vacío se guarda como `null`, igual que antes; el contacto vuelve a "Por completar".
   - `?editar=datos` abre el Sheet y sale de la URL al cerrarlo.
5. **Encabezado.**
   - El back "‹ Pacientes" queda fuera del chrome pegado: scrollea y no le suma alto al encabezado en el celular.
     Adentro van el nombre, la edad, el teléfono, la franja de antecedentes y las pestañas.
   - El chrome publica su alto en `--patient-chrome-h`, que usa el `scroll-margin-top` de `#datos-paciente`.
6. **Enlaces "Ir a Datos"** de la consulta y del estudio ISAK: cambió solo el `href` (la SDD dice "solo el `href`").
   El texto "Ir a Datos" queda; se puede revisar en 017c-3.
7. **Turnos en Historial:**
   - La fecha usa `formatAppointmentWhen`, que da "Hoy", "Mañana" o el día completo.
   - La tabla de escritorio conserva la columna Precio.
   - Un turno sin motivo dice "Sin motivo" en vez de "—".
8. **Consultas:** la lista queda en un componente cliente, para que 017c-3 pueda filtrar los borrados pendientes ahí.
9. **R1:**
   - La elección de la usuaria manda: `null` (sin elección) o `true`/`false`.
   - Si la cerró durante una búsqueda, una búsqueda nueva la vuelve a abrir sola cuando hay coincidencias.
   - Si la abrió ella, sigue abierta.
10. **Capturas:** no se hicieron (esta sesión no tiene navegador). El recorrido 10-2 y las tareas de D1 quedan para el orquestador.

## Autochequeo web-design-guidelines

- Arreglado: los enlaces de texto ("Ver antecedentes", "Ver consulta") ahora tienen estado hover.
- Revisado y en regla:
  - Todos los íconos llevan `aria-hidden`.
  - Los botones tienen texto.
  - La pestaña y la vista viven en la URL.
  - Las tarjetas son `<a>`/`Link`.
  - Hay `scroll-margin-top` en el destino interno.
  - El movimiento reducido se respeta en el disclosure.
  - Los campos tienen `name` y `<label>`.
  - El foco va al primer error.
  - "Guardando…" lleva "…".
  - Los números usan `tabular-nums`.
- Se dejó como está, a propósito:
  - Sin aviso de cambios sin guardar al cerrar el Sheet "Editar datos". Los Sheets de hoy tampoco lo tienen, y la SDD
    no lo pide.
  - Mayúscula solo en la primera palabra de títulos y botones: es la convención del español.

## Pendiente para el orquestador

- Recorrido 10-2 en Chrome (1366/768/390, alias de `?tab=`, "Volver a <paciente>" desde un plan, lo escrito en
  "Nueva medición" se conserva, "Editar datos" guardando solo en una paciente de prueba creada por id, movimiento
  reducido). Incluye R2 (pasos 9–12 de §10.3) y las tres tareas de D1 en `progress/recorrido_HU-017c-2.md`.

## Arreglo en runtime: íconos que cruzaban a un componente cliente (`f5e6e2f`)

- **Qué fallaba:** el recorrido encontró que `/pacientes/<id>` caía en "Algo salió mal". `summary-section.tsx`
  (server) le pasaba a `SummaryCard` (cliente) el componente del ícono (`icon={Scale}`), que es una función.
  Next lo rechaza en runtime y el build no lo detecta.
- **Arreglo:** `SummaryCard.icon` pasa a ser `ReactNode` y recibe el ícono ya renderizado (`icon={<Scale />}`). El
  tamaño y el trazo los pone la tarjeta (`[&_svg]:size-4`).
- **Revisión del diff completo (017c-1 + 017c-2):** no hay otro caso.
  - `consultations-section.tsx`, `plans-section.tsx`, `patient-directory.tsx` y `dev-diseno/_sections/lists.tsx` son
    `"use client"`: el ícono no sale del cliente.
  - `diary-section.tsx` y `appointments-section.tsx` son server y le pasan íconos a `EmptyState`, o los renderizan
    ellos. `EmptyState` es server-safe y no es cliente.
  - El resto de los server components (`page.tsx`, `patient-header.tsx`, `patient-data-section.tsx`, `clinical-alert.tsx`,
    `pacientes/page.tsx`) solo le pasan a los componentes cliente datos serializables y elementos ya renderizados.
- **Verificación nueva, en runtime:**
  - Build en una copia del scratchpad, `next start -p 3197` y una cookie de sesión de Auth.js generada en local con el
    `AUTH_SECRET` del `.env`. El script vivía en la copia y se borró con ella.
  - Se pidieron con GET `/pacientes/cmtyq7tys0000xnwszq8d9maa` (también con `?tab=historial&vista=turnos`,
    `?tab=datos&editar=datos` y `?tab=planes`), `/pacientes` y `/?fecha=2026-10-08`. Todas dieron 200, sin filas de
    error en el payload RSC (`E{"digest"…}`) y sin "cannot be passed" en el log del servidor.
  - "Algo salió mal" no aparece en el HTML aunque la página falle: lo dibuja el `error.tsx` en el cliente. Por eso el
    criterio son las filas `E{"digest"}` del payload.
  - Control negativo: el build con el código anterior daba 200, pero con 2 filas `E{"digest"}` y 4 "cannot be passed"
    en el log. El chequeo detecta el problema.
  - Solo lectura: GET, sin escribir en la base.
- typecheck (4 workspaces), test (103 archivos, 1778 tests), lint (solo el warning previo de `logo-form`), `next build` y
  `next build --turbopack` en verde. El dev server de :3100 no se tocó (responde 200).

## Ronda 2 (017c-2): la pestaña de la URL sobrevive a las server actions (`9da10e9`)

Alcance: el cambio requerido 1 de `progress/review_HU-017c.md` (sección 017c-2) y algunas de sus dudas no bloqueantes.

**Cambio requerido 1, arreglado.**
- **`lib/patient-tab-route.ts`** suma tres helpers:
  - `patientTabHref(href, tab, view)`: la URL con la query canónica; conserva el resto de los parámetros.
  - `withoutSearchParam(href, name)`.
  - `replaceUrlInRouter(href, history?)`: llama a `history.replaceState(null, "", href)`. Con estado `null`, Next 15
    sincroniza su URL canónica. Con `window.history.state` (que trae `__NA`) no la sincroniza, y la próxima server
    action la vuelve a pisar.
- **`patient-tabs.tsx`:** la URL ya no se escribe dentro de un updater de `setState`.
  - Los handlers (`go`, `setTab`, `setView`) calculan el estado siguiente desde un `stateRef`, llaman a `setState` y
    escriben la URL.
  - Todo pasa por `replaceUrlInRouter`.
- **`edit-patient-sheet.tsx`:** al cerrar, `?editar=datos` sale con `replaceUrlInRouter(withoutSearchParam(...))`.

**Tests (`patient-tab-route.test.ts`, +7):**
- `patientTabHref` y `withoutSearchParam`.
- `replaceUrlInRouter` llama a `replaceState` con estado `null` exactamente una vez, y no hace nada si la URL no cambia.
- Una guarda: `patient-tabs.tsx` y `edit-patient-sheet.tsx` no llaman a `history.replaceState` directo y usan el helper.

**Dudas no bloqueantes resueltas:**
- **Pestaña Consultas:** el número es `aria-hidden`, con un `sr-only` " (5 consultas)". Ya no se lee "Consultas5".
- **"Ir a Datos" → "Editar datos"**, en `requirement-section.tsx` y `antropometria/page.tsx`. Es el mismo enlace
  `?editar=datos`, ahora con un texto que existe en la ficha.
- **Fecha de nacimiento futura:** `updatePatientDataAction` la rechaza con `fieldErrors.birthDate` "La fecha de
  nacimiento no puede ser futura".
  - Compara en la zona de la profesional: `getProfessional` + `isFutureDayKey`.
  - Solo consulta a la profesional si hay fecha.
  - Test nuevo en `actions.test.ts`; `getProfessional` va mockeado.
- **"Nueva consulta" en la pestaña Consultas** pasa a `tinted`: la única primaria llena queda en el Resumen.

**Dudas que quedan abiertas:**
- El alto del chrome a 390 px y las capturas o el recorrido a 1366/768/390 con movimiento reducido (R2) siguen para el
  recorrido del orquestador.

**Verificación:**
- typecheck (4 workspaces) y test (103 archivos, 1785 tests) en verde.
- lint: solo el warning previo de `logo-form`.
- `next build` (exit 0) y `next build --turbopack` ("Compiled successfully"), en una copia del scratchpad.

**En runtime** (copia del scratchpad + `next start -p 3197` + cookie de sesión generada en local + Chromium headless
con `playwright-core`; todo en el scratchpad, ya borrado):
- **Paciente de prueba:** el recorrido creó la paciente `hu017c2-r2-url` (JID `5493510017201@s.whatsapp.net`, sin
  turnos) y la borró por id. Después del borrado: 0 filas de `Patient`, `Consultation`, `EvolutionEntry` y
  `ClinicalRecord` con ese id. No se tocaron datos de la usuaria ni se crearon turnos.
- **Con el arreglo, todo OK:**
  - `?editar=datos` abre el Sheet, y al cerrarlo el parámetro sale de la URL.
  - Historial → `?tab=historial`; Turnos → `?tab=historial&vista=turnos`.
  - Después de agregar una medición (server action), la URL sigue en `?tab=historial`.
  - Al recargar, la pestaña activa es Historial y el Sheet no se abre solo.
  - Resumen → sin `tab`. "Editar datos" → Guardar → la URL sigue sin `tab` ni `editar`.
  - Sin errores de JS.
- **Control negativo**, el mismo guion contra un build con el código anterior:
  - después de "Guardar" en Resumen, la URL volvió a `?tab=historial`, que era la vieja;
  - el toast de la medición no apareció.
  
  El chequeo detecta la regresión.

El dev server de :3100 no se tocó (responde 200).

---

# 017c-3: consulta, ISAK y borrados con "Deshacer"

- **Estado:** done
- **Rama:** `feat/hu-017c3-consulta`, encadenada sobre `feat/hu-017c2-ficha` (decisión Q6). Sin push.
- **SDD:** `Refactorizaciones/017c-pacientes-consultas.md`: entrega 017c-3, "Decisiones" y "Agregados a 017c-3" (R3 y R4).
- **Modelo:** Opus.
- **Skills:**
  - antes del JSX: `apple-design`, `ui-ux-pro-max` y `mblode-agent-skills-ui-animation` (toast y transiciones);
  - al final, como autochequeo: `web-design-guidelines`.

## Commits (uno por fase)

| Commit | Fase |
|---|---|
| `6903313` | A: borrado diferido con Deshacer (mecanismo) |
| `8226056` | B: actions de borrado listas para diferir + textos de core |
| `bf5a182` | C: `MoreActionsMenu` y consulta (encabezado, lateral sticky, aviso, notas) |
| `2eefc8f` | D: los borrados con confirmación y "Deshacer", y el filtrado de pendientes |
| `09484bb` | E: estudio ISAK (índice, barras z, gráficos) y formulario |
| `70205eb` | R3: error de hidratación de `useId` en el panel |
| `817e604` | R4: placeholders con coma decimal |
| `15adff2` | Autochequeo: comillas tipográficas y la barra z sin dato |
| (este archivo) | F: verificación |

## Archivos

**packages/core** (solo textos que se ven en el panel, D11b; con sus tests):
- `isak-study.ts`: los textos de `ISAK_TEXT` quedan así:
  - `deleteTitle`: "¿Borrar el estudio ISAK?";
  - `deleteDescription`: "Se borran las medidas del estudio.";
  - `deleteWithReportDescription`: "Se borran las medidas del estudio y su informe.";
  - `deleted`: "Estudio borrado";
  - `saved`: "Estudio guardado" (HU §2.3, "al guardar ve 'Estudio guardado'").
- `energy-requirement.ts`: los textos de `REQUIREMENT_TEXT` quedan así:
  - `deleteConfirmTitle`: "¿Borrar el cálculo de calorías?";
  - `deleteConfirmDescription`: el texto de la tabla de la HU §4.3;
  - `deleted`: "Cálculo borrado".
- Tests nuevos en `isak-study.test.ts` y `energy-requirement.test.ts`.

**apps/web:**
- `lib/deferred-delete.ts` + test (nuevo). Exporta:
  - `CommitResult`, `DeferredDeleteStore`, `createDeferredDeleteStore`, `deferredDeletes`;
  - `usePendingDeletion`, `usePendingDeletions`, `useDeferredDelete`;
  - `UNDO_TEXT` y `measurementLabelsText`.
- `lib/notify.ts`:
  - `notify.undo(message, onUndo, { onExpire? })`;
  - `notify.saved(message?, { action? })` (las dos opciones son opcionales; los usos de hoy no cambian).
- `components/more-actions-menu.tsx` (nuevo): `MoreActionsMenu` y `MoreAction`.
- Consulta (`consultas/[consultationId]/`):
  - `page.tsx`;
  - `sticky-aside.tsx` (nuevo);
  - `delete-consultation-button.tsx`, que ahora exporta `ConsultationMoreMenu`;
  - `delete-isak-study-button.tsx`, que ahora exporta `IsakStudyMoreMenu`;
  - `isak-card.tsx`, `isak-form.tsx`, `requirement-section.tsx`, `consultation-measurements.tsx`, `consultation-plan.tsx` y `consultation-notes.tsx`.
- Estudio ISAK (`antropometria/`):
  - `page.tsx`;
  - `isak-section-index.tsx` (nuevo);
  - `z-score-bar.tsx`, `somatochart.tsx` y `tissue-stacked-bar.tsx`.
- Ficha:
  - `consultation-actions.ts` + `consultation-actions.test.ts` (nuevo);
  - `clinical-actions.ts` + `clinical-actions.test.ts` (nuevo);
  - `evolution-table.tsx`, `evolution-section.tsx` y `consultations-section.tsx`;
  - `measurement-fields.tsx` (R4).
- `next.config.mjs` (R3).

Sin cambios en:
- `packages/db`, `apps/bot`, `schema.prisma` ni las migraciones;
- `backlog/`;
- la zona de imleticio. El grep de 10.2 contra `14c9efd` (la base de esta entrega) da vacío.

## Contrato compartido (SDD §4-3)

- `deferred-delete.ts` coincide con §4.1: los nombres y las firmas son los de la SDD. Hay dos agregados compatibles:
  - `createDeferredDeleteStore(options?)`, con `releaseAfterMs` y `setTimer` opcionales (ver la decisión 1);
  - `DeferredDeleteOptions`, el tipo del parámetro de `useDeferredDelete`, que tiene los mismos campos que la SDD.
- Las keys son las de la SDD: `consultation:<id>`, `isak:<entryId>`, `prescription:<consultationId>` y `measurement:<entryId>`.
- `notify.undo` coincide con §4.2.
- Actions (§4.3):
  - `deleteConsultationAction(patientId, consultationId)` ya no hace `redirect()` y devuelve `{ ok: true }`;
  - `deleteEvolutionEntryByIdAction(patientId, entryId): Promise<ActionState>` reemplaza a `deleteEvolutionEntryAction`, que se borró y no tenía otro consumidor. Si falla, devuelve `{ ok: false, error: "No se pudo borrar la medición." }`;
  - las demás actions no cambian de firma.
- "Deshacer" de "Quitar plan" llama a `setConsultationPlanAction` con un `FormData` que lleva `patientId`, `consultationId` y `planId`. Si falla, muestra "No se pudo deshacer.".
- Los archivos `"use server"` siguen exportando solo funciones async y `export type`. `next build --turbopack` compila.

## Verificación

| Comando | Resultado |
|---|---|
| `npm run typecheck` | core, db, bot y web en verde |
| `npm run test` | 106 archivos, 1806 tests en verde. Nuevos: `deferred-delete` (11), `consultation-actions` (3), `clinical-actions` (4), los textos de ISAK (2) y del cálculo (1) |
| `npm run lint --workspace apps/web` | solo el warning previo de `ajustes/logo-form.tsx` |
| `./ops/harness/verify.sh` | "Arnés OK" |
| `next build` (webpack, copia en el scratchpad) | exit 0, con el código final |
| `next build --turbopack` (misma copia) | exit 0, "Compiled successfully". Sin el error de exports en `"use server"` |
| Alcance (10.2) | ningún archivo de imleticio, ni de `apps/bot`, `packages/db`, `schema.prisma`, migraciones o `backlog/` |

La copia del scratchpad (con su `.env` y la cookie) se borró. El dev server de :3100 no se tocó: responde 200.

### Runtime, contra `next start -p 3197` (build de webpack de la copia)

- **Cómo se hizo:** con una cookie de sesión de Auth.js generada en local con el `AUTH_SECRET` y Chromium headless con `playwright-core`. Todo vivió en el scratchpad.
- **Páginas pedidas** (cada una con recarga), todas con 200 y sin el error boundary:
  - la ficha de la paciente de prueba, también con `?tab=consultas` y `?tab=historial`;
  - su consulta y su estudio ISAK;
  - la ficha de María González;
  - `/pacientes`.
- **Errores en el log del servidor:** ninguno, y nada de "cannot be passed".
- **Errores de JS:** ninguno.
- **Consola:** quedan los warnings de Recharts "width(0) and height(0)" en la ficha. Son de 017c-2: los gráficos de Historial están en una pestaña oculta con `forceMount`, y esta entrega no los cambió.
- **Borrado diferido, con datos de prueba creados y borrados por id:**
  - Un seed creó la paciente "Prueba 017c-3" (JID `5493510017301@s.whatsapp.net`) con: una consulta sin turno de ayer, una medición, un estudio ISAK y un plan indicado. El cálculo lo creó el recorrido por la UI.
  - Sin turnos, sin `OutboundMessage` y sin WhatsApp.
  - Se corrió dos veces, y una tercera solo para capturas. Al final de cada corrida se borró la paciente **por su id**; los hijos se van por cascada.
  - Después de la última limpieza: 0 pacientes con ese JID o ese nombre, y 0 planes "Plan prueba 017c-3".
  - No se tocaron datos de la usuaria. Las páginas de María solo se pidieron con GET.
- **Resultados** (la base se verificó con `select` por id):
  - Cálculo:
    - la confirmación abre con el foco en "Cancelar" y aparece el toast "Cálculo borrado" con "Deshacer";
    - mientras corre el plazo, la tarjeta se ve vacía y "Calcular requerimiento" queda deshabilitado con su motivo;
    - con la red cortada (`context.setOffline`) antes de que venza, sale "No se pudo borrar. Probá de nuevo.", el cálculo vuelve a verse y sigue en la base;
    - al repetir sin cortar la red, se borra cuando vence el plazo.
  - Medición: la confirmación dice "Se borra la medición del 03/10 (peso, talla…)." y la medición se oculta al instante. "Deshacer" la trae de vuelta con "Listo, la medición volvió", y la fila sigue en la base 9,5 s después. Al repetir, se borra cuando vence el plazo.
  - Estudio ISAK:
    - desde su página, "Borrar estudio" vuelve a la consulta y la tarjeta se ve vacía;
    - si se recarga antes de los 8 s, el estudio **no** se borra y vuelve a verse;
    - al repetir, se borra cuando vence el plazo.
  - Quitar plan:
    - por teclado: foco en "…", Enter abre el menú y ArrowDown lleva al ítem "Quitar plan de esta consulta";
    - Enter quita el plan sin confirmación;
    - "Deshacer" lo vuelve a indicar ("Listo, el plan volvió"; en la base, `planId` vuelve al mismo plan);
    - si se quita y no se deshace, queda quitado.
  - Consulta:
    - "Borrar consulta" navega a la ficha en Consultas, que queda vacía;
    - "Deshacer" muestra "Listo, la consulta volvió" con "Abrir", y "Abrir" vuelve a la consulta;
    - al repetir y navegar a otra pantalla (`/pacientes`), la consulta se borra a los 8 s.
- **Fallos en las corridas:** en la corrida 1 fallaron tres chequeos y en la corrida 2 uno: "el cálculo se ve como borrado" y "toast con Deshacer" en el cálculo, y la vista después de navegar en el estudio y en la consulta. Las dos corridas no fallaron en los mismos chequeos, y los que fallaron en una pasaron en la otra.
  - El guion contaba los elementos con `count()` justo después de la acción, antes de que la página terminara de mostrarse. No hubo fallo de la app.
  - Esos chequeos pasaron a esperar al elemento, y la captura `calc-pending` confirma el estado (tarjeta vacía, botón deshabilitado con su motivo y toast "Cálculo borrado" con "Deshacer").
- **Anchos:**
  - A 1366×768 la columna lateral queda sticky (`aside[data-sticky]`).
  - A 390×844 (táctil) se ve en una columna, sin scroll horizontal de página, en la consulta y en el estudio ISAK.
  - En el estudio, los chips del índice quedan pegados debajo de la barra móvil.
- **Lo que no se probó:**
  - el cierre del toast con la X: el `Toaster` del panel no tiene botón de cerrar. `onDismiss` queda cableado (swipe o `toast.dismiss`), pero no se probó;
  - los 1920×1080 y el movimiento reducido: quedan para el recorrido del orquestador.

### R3: el error de hidratación del `AppSidebar`

- **Causa:**
  - No es un `useMediaQuery` ni algo de la app, sino el "Segment Explorer" de las devtools de Next 15.5, que viene prendido por defecto en `next dev` (`experimental.devtoolSegmentExplorer`).
  - En una parte de las cargas, el árbol del cliente queda distinto del del servidor por encima de `PanelLayout`. Por eso cambian todos los `useId` del panel: el `aside id` y el `aria-controls` del sidebar, las pestañas de Radix de la ficha y de ajustes, y el disclosure de `/pacientes`.
- **Diagnóstico:**
  - Se pusieron sondas `useId` en una copia: en el layout raíz y en `MotionProvider` daban estables; desde el primer hijo de `PanelLayout` daban distintas.
  - Se compararon, con Playwright, el `id` del DOM contra el `id` de las props de React (`__reactProps$`) en cada elemento.
  - Antes del arreglo, en dev fallaba alrededor de la mitad de las recargas (`/ajustes` en 3 de 6, `/pacientes` en 1 de 3). En producción (`next start`), 0 de 10.
- **Arreglo:**
  - `experimental.devtoolSegmentExplorer: false` en `next.config.mjs`, con un comentario.
  - Con eso, en dev hubo 0 diferencias en 18 de 18 cargas (ficha, `/pacientes` y `/ajustes`, 6 cada una) y 0 avisos de hidratación.
  - Con el código final: la ficha de María (4 recargas), una consulta (3+1) y el estudio ISAK (1) quedaron sin "A tree hydrated…".
  - No afecta producción. Lo único que se pierde es el panel "Segment Explorer" de las devtools de Next en desarrollo.
- **Para el orquestador:** el dev server de :3100 lee `next.config.mjs` solo al arrancar. Hay que reiniciarlo para ver la consola limpia.

## Decisiones no obvias y desvíos

1. **La key sigue oculta 10 s después de un commit exitoso.**
   - Así el dato no reaparece entre que la action responde y llega la página revalidada.
   - Después se libera, para que `prescription:<consultationId>` no quede oculta para siempre si se calcula de nuevo.
   - Es una opción del store (`releaseAfterMs`), con test y timers manuales.
   - No es un timer de respaldo del borrado: el commit sigue disparándose solo por `onAutoClose`/`onDismiss`.
2. **Se atiende solo la primera resolución:** `useDeferredDelete` tiene un `settled` local, porque `onAutoClose` y `onDismiss` pueden llegar los dos. El store, además, ejecuta `commit` una sola vez.
3. **Si el commit falla, el mensaje es el genérico de la SDD** ("No se pudo borrar. Probá de nuevo."), no el `error` de la action.
4. **Mientras corre el "Deshacer" de un cálculo o un estudio, "Calcular requerimiento" y "Cargar antropometría ISAK" quedan deshabilitados.** Debajo dicen "Vas a poder … cuando se cierre el aviso de “Deshacer”."
   - Sin esto, un cálculo nuevo guardado durante el plazo se borraría cuando venciera, porque la prescripción es única por consulta.
   - Un ISAK nuevo chocaría con `IsakStudyExistsError`.
   - No lo pide la SDD.
5. **Historial:** borrar desde la tabla una fila que es un estudio ISAK usa la key `isak:<id>` y los textos de ISAK. Así también se oculta en la tarjeta de la consulta.
   - `EvolutionSection` filtra los pendientes para la tabla y también para los gráficos.
6. **`MoreActionsMenu`:**
   - Recibe acciones con `onSelect`. Solo lo usan componentes cliente; el server nunca le pasa funciones (lección de 017c-2).
   - Si `onSelect` devuelve una promesa (por la confirmación) y al terminar el foco quedó en `body`, el foco vuelve al "…".
   - Un ítem deshabilitado muestra su motivo debajo, con `aria-describedby`. "Borrar consulta" se deshabilita con `CONSULTATION_TEXT.notDeletable`.
   - En las listas, el nombre accesible es más específico ("Más opciones de la medición del 24/09").
7. **Encabezado de la consulta:**
   - "Consulta del sábado 03/10" sale de `formatConsultationDay` con la primera letra en minúscula. Si la consulta es de otro año, el título lleva el año.
   - La línea "Con turno · Control · 10:00" o "Sin turno" va debajo, en gris.
   - El aviso amarillo trae "Abrir el turno", que lleva a `/?fecha=<día>`.
   - "Motivo indicado al reservar" pasa a llamarse "Motivo de la reserva" (HU §4.3).
8. **Lateral sticky:** `StickyAside` usa `top-6`, porque desde `xl` no hay barra móvil. No existe una variable `--chrome-h`; la SDD la nombraba como referencia.
9. **"Informe" en lugar de `ISAK_TEXT.reportButton` ("Informe PDF")**, en la tarjeta y en la página del estudio. Es el texto de la HU §2.3 y §4.4. No cambié el texto de core, porque no está en la lista 0.1.
10. **Índice del estudio ISAK:** tiene las 8 secciones que muestra la página (6 en menores), con rótulos cortos.
    - Por debajo de `xl`, los chips quedan pegados debajo de la barra móvil (`top-14`, o `top-0` desde `lg`).
    - Desde `xl`, la lista va a la derecha.
    - `IntersectionObserver` marca la sección activa con `aria-current="location"`.
    - Las anclas son comunes y cada sección tiene su `scroll-margin-top`.
    - La fila de chips se acomoda sin animación, porque también cambia con el teclado.
11. **Barras z:**
    - El relleno es suave, `primary/35` hasta ±2 y `warning/45` más allá. Lleva los rótulos "bajo" y "alto", y el valor queda en texto en la columna Z.
    - Sin dato no se dibuja la barra (antes había una barra vacía).
    - Los gráficos ya tomaban sus colores de `chartPalette`.
    - Las entradas: la somatocarta usa Recharts con 400 ms, desactivada con movimiento reducido; la barra de tejidos usa un fundido de 300 ms con `motion-safe:`.
12. **Formulario ISAK:**
    - Las medidas ya estaban en `fieldset` por grupo, según `ISAK_MEASURE_GROUPS`. Ahora la `legend` es el título del grupo.
    - Los inputs miden `h-11` con `text-base` (16 px), con la unidad visible de `NumberInput`.
    - Los botones son `lg`.
13. **R4:** "70,5", "22,5" y "2,8" en `measurement-fields.tsx` (Nueva medición de Historial y de la consulta). No había otros placeholders con punto decimal en `apps/web`.

## Autochequeo web-design-guidelines

- Arreglado:
  - las comillas tipográficas en los textos de espera;
  - la barra z sin dato.
- Revisado y en regla:
  - los botones de solo ícono ("…", cerrar) tienen `aria-label` y tooltip;
  - los íconos llevan `aria-hidden`;
  - el foco va a "Cancelar" en cada confirmación;
  - los toasts de sonner están en una región `aria-live`;
  - "Guardado a las 10:42" va con `aria-live="polite"`;
  - se usa `tabular-nums` en los números;
  - con movimiento reducido no hay animaciones de entrada;
  - en el borrado, una sola animación de toast (la de sonner);
  - los enlaces del índice son `<a href>`.
- Se dejó como está, a propósito:
  - Mayúscula solo en la primera palabra: es la convención del español.
  - La fila de chips pegada en el estudio ISAK puede tapar un elemento enfocado con Tab cerca del borde de arriba. Las secciones tienen `scroll-margin-top`, pero los elementos de adentro no. Queda para revisar en el recorrido.

## Pendiente para el orquestador

- Reiniciar el dev server de :3100 para que tome R3, y confirmar la consola en Chrome.
- Recorrido 10-3:
  - 1920×1080;
  - movimiento reducido;
  - lector de pantalla con el toast;
  - cerrar el toast con swipe.
- Capturas.
