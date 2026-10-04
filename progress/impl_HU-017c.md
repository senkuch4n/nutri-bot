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
