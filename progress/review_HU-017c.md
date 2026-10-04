# Review — HU-017c (entrega 017c-1: lista de pacientes)

**Veredicto:** APPROVED

Diff revisado: `git diff origin/develop...HEAD` en `feat/hu-017c-pacientes` (commits `e076a17`..`e37ddfe`), sin
contar los archivos del arnés. Comandos que corrí yo:
- `npm run typecheck`: core, db, bot y web en verde (exit 0).
- `npm run test`: 101 archivos, 1719 tests en verde (exit 0). Los nuevos: whatsapp-contact, phone-format
  (16), relative-date (28), patient-directory y `pacientes/actions.test.ts` (6).
- `./ops/harness/verify.sh`: "Arnés OK". Avisa "Se tocó el bot" por las carpetas sin trackear
  `apps/bot/.whatsapp-auth.vieja*` del usuario. El diff no toca `apps/bot`.
- Grep de alcance (SDD 10.2) contra `origin/develop`: no aparece ningún archivo de la zona de imleticio
  (`alimentos/`, `plantillas/`, `pacientes/[id]/planes/`, `food-picker`, `meals-editor`, `plan-pdf`,
  `pdf-theme`, `plans-section`), ni de `apps/bot`, `packages/db`, `schema.prisma` o migraciones.
- Base (solo lectura): 0 filas `hu017c1-*` y ninguno de los JID de prueba de 10.3.

## Checkpoints

### C1 — El arnés está sano
- [x] `backlog/` válido; senkuch4n tiene una sola HU activa (HU-017c, `en_revision`).
- [x] `progress/current-senkuch4n.md` refleja la HU.
- [x] No hay archivos de HU de imleticio en el diff.
- [x] `verify.sh` termina en exit 0.

### C2 — Cadena de documentos
- [x] `docs/hu-017c-pacientes-consultas.md` está completa y tiene sus Resoluciones.
- [x] `Refactorizaciones/017c-pacientes-consultas.md` tiene workspaces, checklist y contrato (§4.1 a §4.6).
- [x] Firmas y nombres coinciden con el contrato:
  - `classifyWhatsappJid`, `isPersonJid`, `whatsappChatUrl`, `HIDDEN_NUMBER_TEXT` (`packages/core/src/whatsapp-contact.ts:4-35`).
  - `formatPhone`, `AR_AREA_CODES_3` (38 códigos, iguales a la SDD), `COUNTRY_CODES_2` (`phone-format.ts:5-72`).
  - `calendarDaysBetween`, `capitalizeFirst`, `formatAppointmentWhen`, `formatTimeAgo` (`relative-date.ts`).
  - Los tipos de entrada, fila y directorio, `buildPatientDirectory`, `matchesPatientQuery`, `patientCountLabel` y `PATIENT_DIRECTORY_TEXT`, con los textos literales de la SDD (`patient-directory.ts`).
  - `setPatientNameAction` y `SetPatientNameState` (`pacientes/actions.ts:74-96`).
  - `GroupedListRow size`, `GroupedListSkeleton` y `useMediaQuery`.

### C3 — Arquitectura
- [x] La lógica pura está en `packages/core`. `packages/db/domain` no cambia. Las consultas de lectura están en `pacientes/page.tsx`: 3 en paralelo, sin N+1.
- [x] No cambia `schema.prisma` ni `domain` (igual, bot y web compilan).
- [x] No hay migraciones (T1).
- [x] `/pacientes` y su server action quedan bajo el middleware de Auth.js (`apps/web/src/middleware.ts`, matcher; `authorized` exige un email permitido). La action nueva no agrega un chequeo propio, igual que las demás de ese archivo. No toca el portal.
- [x] No toca el bot ni sus textos.
- [x] No hay `console.log` ni TODOs en los archivos del diff.

### C4 — Verificación
- [x] `npm run typecheck` limpio.
- [x] La lógica nueva de core tiene tests reales que cubren los casos de §9-1:
  - zona horaria: "Hoy, 23:30" cuando en UTC ya es otro día; "Mañana" cuando el lunes son las 22:00; "ayer" para el domingo 23:00;
  - cortes de semanas, meses y años;
  - orden es con la "ñ" después de la "n";
  - búsqueda con "0" adelante y por palabras;
  - los dígitos de un `@lid` no se buscan.
- [x] No aplica simular el bot: no se tocó.
- [x] No aplica verificar un PDF: no hay.

### C5 — Cierre
- [x] `progress/impl_HU-017c.md` describe archivos, comandos y desvíos.
- [x] `progress/review_HU-017c.md` (este archivo).
- [x] No quedan scripts sueltos ni filas de prueba en la base (verificado con una consulta de solo lectura).

## Puntos que pidió el orquestador

- **Helpers de core:**
  - `classifyWhatsappJid` ignora mayúsculas y espacios y manda a "hidden" lo desconocido.
  - `whatsappChatUrl` devuelve una URL solo para "phone" con dígitos.
  - `formatPhone` sigue la regla de §4.2: solo los largos 13/12 con prefijo `549`/`54` y un número nacional que empieza con 11, 2 o 3; si no, el formato genérico con el primer grupo de 1 dígito unido al siguiente.
  - `relative-date` calcula siempre con `dayKeyInTz` en la zona que recibe, sin usar la zona del proceso.
  - Los tests de las tres cosas son de valores exactos.
- **`@newsletter` ocultos en todos lados:**
  - `buildPatientDirectory` los descarta antes de armar `named` y `unnamed` (`patient-directory.ts:76-77`).
  - El contador (`patient-directory.tsx:179`), "Por completar (N)" (`:275`) y la búsqueda (`:51-58`) trabajan sobre esas listas, así que un canal no se cuenta ni aparece al buscar "120363".
  - Lo prueba `patient-directory.test.ts:33-48`.
- **Zona de imleticio:** el diff no toca ningún archivo de la zona (ver el grep de arriba).
- **Accesibilidad:**
  - Buscador:
    - `<label class="sr-only">` asociado por `htmlFor`, `form role="search"`, `aria-keyshortcuts="/"`;
    - autofoco solo con `pointer: fine`, sin `autoFocus`;
    - el atajo `/` no actúa si hay un campo o un diálogo con foco o abierto;
    - Escape limpia y la "×" de 44 px tiene `aria-label`;
    - contador con `aria-live="polite"`.
  - "Poner nombre":
    - `aria-label` que empieza con el texto visible;
    - el Sheet tiene `SheetTitle` y `SheetDescription`;
    - campo con `aria-invalid`, error `role="alert"` y foco al campo ante un error;
    - lo escrito no se pierde;
    - al guardar, el foco va al buscador (`onCloseAutoFocus`).
  - Disclosure: `aria-expanded` y `aria-controls` hacia un contenedor que siempre existe; con movimiento reducido, el cambio es instantáneo.

## Cambios requeridos
Ninguno.

## Dudas (no bloqueantes)
- **El disclosure no se cierra mientras se busca.** Con una búsqueda que coincide en "Por completar", el clic en el disclosure no hace nada visible (`patient-directory.tsx:59` y `:225`): `open = incompleteByUser || (searching && coincidencias > 0)`. Es lo que pide la SDD §5.4. Si molesta en el recorrido con la nutricionista, se puede ajustar en 017c-2.
- **`Field` mete el error dentro del `<label>`** (`components/ui.tsx:337-358`). El nombre accesible del campo pasa a incluir el texto del error ("Nombre y apellido Escribí el nombre"). Es un patrón previo de `Field`, no de esta entrega.
- **Faltan las capturas antes y después** (0.3 y 5.1). El recorrido (`progress/recorrido_HU-017c.md`) no cubre los pasos 9 a 12 de §10.3: teclado, 390 px táctil, movimiento reducido, skeleton. Tampoco el paso 6 ("Poner nombre" con datos de prueba). Conviene completarlos antes del PR o cuando se repita con la nutricionista.
- **Las 5 filas `@lid` sin nombre se ven iguales** (lo anotó el recorrido). Sus `aria-label` también quedan iguales. Resolverlo pide `pushName` en el bot: es una tarea aparte, fuera de 017c.
- **Desvíos ya documentados y razonables:**
  - `capitalizeFirst` en la segunda línea de "Por completar" sin búsqueda;
  - el error va en el `Field` y no en un `FormError` aparte;
  - el archivo se llama `impl_HU-017c.md` en vez de `impl_HU-017c-1.md`.

---

# 017c-2

**Veredicto:** CHANGES_REQUESTED

Diff revisado: `git diff feat/hu-017c-pacientes...HEAD` en `feat/hu-017c2-ficha` (`5215bc2`..`566a98b`), sin los
archivos del arnés. Comandos que corrí yo:
- `npm run typecheck`: core, db, bot y web en verde (exit 0).
- `npm run test`: 103 archivos, 1778 tests en verde (exit 0).
- `./ops/harness/verify.sh`: "Arnés OK" (exit 0). Avisa "Se tocó el bot" por las carpetas sin trackear
  `apps/bot/.whatsapp-auth.vieja*`. El diff no toca `apps/bot`.
- Grep de alcance contra la rama base: ningún archivo de `alimentos/`, `plantillas/`, `pacientes/[id]/planes/`,
  `food-picker`, `meals-editor`, `plan-pdf`, `pdf-theme`, `apps/bot`, `packages/db`, `schema.prisma` ni migraciones.
  El grep de 10-2 sobre `plans-section.tsx` (`createPlanAction|applyTemplateAction|useActionState|name="|action={`)
  sale vacío.
- No quedan referencias a `updatePatientAction`, `updateClinicalRecordAction` ni a los 5 componentes borrados. No
  queda ningún `?tab=datos|evolucion|diario|turnos` en el código (solo un comentario).
- Leí el código de Next 15.5.24 (`node_modules/next/dist/client/components/app-router.js`, `HistoryUpdater` y el
  parche de `history.replaceState`, líneas 89-115 y 324-333). Lo uso para el hallazgo 1.

## Checkpoints

### C1 — El arnés está sano
- [x] `backlog/` válido; senkuch4n tiene una sola HU activa (HU-017c, `en_revision`, entrega 017c-2).
- [x] `progress/current-senkuch4n.md` refleja la entrega.
- [x] No hay archivos de HU de imleticio en el diff.
- [x] `verify.sh` termina en exit 0.

### C2 — Cadena de documentos
- [x] La HU y la SDD están completas (017c-2, "Decisiones" y "Agregados a 017c-2").
- [x] La SDD trae el contrato de 017c-2 (§4.1 a §4.4).
- [x] Firmas y nombres coinciden con el contrato:
  - `patient-summary.ts`: las 14 piezas de §4.1. Hay un export extra, `joinSpanish`, que no choca con nada.
  - `patient-tab-route.ts`: `PATIENT_TABS`, `HISTORY_VIEWS`, `resolvePatientTab`, `patientTabQuery`.
  - `updatePatientDataAction(prev, formData)` y `PatientDataState`, con los 5 `fieldErrors`.
  - `focusDate?` en `CalendarClient`.
  - `PatientTabLink` toma `{ tab, view?, focus? }`.
  - `missingFormulaDataMessage` usa los 4 textos de §4.1. Sus tests están actualizados.

### C3 — Arquitectura
- [x] La lógica pura está en core y el ruteo en `apps/web/src/lib`, los dos con test. `domain` no cambia.
- [x] No cambia `schema.prisma` ni `domain`.
- [x] No hay migraciones (T1).
- [x] La ficha, la action y `/?fecha=` quedan bajo el middleware de Auth.js, igual que antes. No toca el portal.
- [x] No toca el bot.
- [x] No hay `console.log` ni TODOs en las líneas agregadas.

### C4 — Verificación
- [x] `npm run typecheck` limpio.
- [x] `patient-summary.test.ts` cubre los casos de §9-2, con valores exactos:
  - "Bajó 6,8 kg desde el 11/05", la subida, "Igual que", 8 de 10 y `null` sin pesos;
  - "8 turnos: 6 vino, 1 canceló, 1 no vino" y "por venir / sin marcar";
  - el otro año en `formatConsultationDay`;
  - `missingForCaloriesText`.
  `patient-tab-route.test.ts` cubre los 7 alias, los valores nuevos, los desconocidos y la ida y vuelta.
  `actions.test.ts` cubre:
  - una sola `$transaction` con 2 operaciones;
  - los 7 campos exactos;
  - `""` → `null`;
  - un enum inválido sin escribir;
  - un nombre de 121;
  - una transacción que falla, sin revalidar.
- [x] No aplica simular el bot.
- [x] No aplica verificar un PDF.

### C5 — Cierre
- [x] La sección 017c-2 de `progress/impl_HU-017c.md` describe archivos, comandos, desvíos y el arreglo de runtime.
- [x] `progress/review_HU-017c.md` (esta sección).
- [x] No quedan scripts sueltos. La entrega no escribió en la base: el recorrido y la verificación en runtime fueron de solo lectura.

## Puntos que pidió el orquestador

- **Props no serializables de servidor a cliente:** revisé cada server component del diff contra los cliente que renderiza.
  - `page.tsx` → `PatientTabs`, `HistorySection`, `ConsultationsSection`, `PlansSection` y `EvolutionSection`: solo elementos, strings, números y booleanos.
  - `summary-section.tsx` → `EditPatientProvider` (datos planos), `NewConsultationButton` (`trigger` es un elemento), `SummaryCard` (`icon` ya renderizado, `tab` es un objeto plano) y `PatientTabButton`.
  - `patient-header.tsx` → `HeaderNameButton` (strings).
  - `patient-data-section.tsx` → `EditPatientButton`, `PatientTabButton` y `DetailDisclosure`.
  - `clinical-alert.tsx` → `PatientTabLink`.
  - `appointments-section.tsx` → `AppointmentReasonCell` (string).
  - `EmptyState` sí recibe la función del ícono, pero vive en `components/ui.tsx`, que no es `"use client"`, así que no cruza ninguna frontera. En `consultations-section.tsx` y `plans-section.tsx` la pasa un componente que ya es cliente.
  - **No queda ningún caso.**
- **Tabla de alias:** `resolvePatientTab` (`patient-tab-route.ts:20-41`) coincide con la HU §2.2 y la SDD §4.2.
  - Un alias con vista fija (`diario`, `turnos`, `evolucion`) gana sobre `?vista=`.
  - Una `vista` desconocida da "medidas".
  - El destino `?tab=planes` de la zona de imleticio se mantiene.
  - `?tab=datos` hace scroll y foco a `#datos-paciente` (`patient-tabs.tsx:66-74,109-114`).
  - **Ver el hallazgo 1** sobre cómo se escribe en la URL.
- **Action única de "Editar datos"** (`pacientes/actions.ts:69-140`):
  - una sola `prisma.$transaction([patient.update(7 campos), clinicalRecord.upsert])`;
  - límites 120/2000/4000;
  - enums con los `*_VALUES` de core;
  - la fecha se valida con `isValidDayKey` y se guarda a medianoche UTC, coherente con la lectura `toISOString().slice(0,10)` de `page.tsx:219`;
  - `try/catch` sin revalidar si falla;
  - `revalidatePath(..., "layout")`.
  - En el Sheet: con un error se conserva lo escrito (`onSubmit` + `startTransition`) y el foco va al primer `aria-invalid`.
- **Zona de imleticio:** sin cambios de archivo. `plans-section.tsx` cambia solo la presentación: `GroupedList`, estado con ícono y texto, `SegmentedControl fullWidth`. Los `<form action>`, `useActionState`, los `name=` y los imports de `./planes/actions` quedan iguales.
- **Accesibilidad de las pestañas:**
  - Radix Tabs da `role=tablist/tab/tabpanel`, `aria-selected` y flechas. `TabsList` tiene `aria-label`.
  - Los 4 paneles van con `forceMount` y se ocultan con `data-[state=inactive]:hidden`.
  - Historial: el punto lleva `sr-only`, en la pestaña y en la opción "Diario".
  - Historial usa `SegmentedControl` (`role=radiogroup`) con `aria-label`. Las vistas son `role=region` con `hidden`.
  - Las tarjetas que cambian de pestaña son `<a href>` reales: Enter, Cmd+clic.
  - El disclosure tiene `aria-expanded/aria-controls`, y con movimiento reducido el chevron no gira.
- **390 px (revisado en el código):**
  - Las pestañas usan `max-sm:grid-cols-4` con `gap-1` y `text-subheadline` (13 px). El ancho útil es 342 px (main `px-6`, chrome `-mx-6 px-6`), así que cada columna mide unos 82 px. "Consultas 12" ocupa unos 84 px: se pasa alrededor de 1,5 px sobre el `gap` de 4 px, sin llegar a pisar la pestaña de al lado ni generar scroll horizontal. Con 1 dígito sobra lugar. Los triggers miden `h-11` (44 px).
  - Encabezado: el `h1` usa `truncate` y el botón WhatsApp es `shrink-0`. Sin nombre, "Poner nombre" baja de línea (`flex-wrap`). En la franja de antecedentes, el texto se trunca entre dos `shrink-0`.
  - Resumen:
    - tarjetas en una columna;
    - en la tarjeta Peso, Metric y el sparkline de 96 px entran;
    - las filas de "Datos" pasan el valor abajo con `flex-wrap`;
    - el Sheet abre desde abajo con `max-h-[90dvh] overflow-y-auto`;
    - Turnos se muestra como lista en < 768 px.
- **R1** (`patient-directory.tsx:47-70,236`): `incompleteChoice ?? incompleteAuto`. El clic manda aunque haya coincidencias. Una búsqueda nueva reabre solo si la usuaria la había cerrado. Cumple lo agregado a la SDD.

## Cambios requeridos

1. **La pestaña escrita en la URL se pierde: Next la pisa con una URL vieja después de cualquier server action.**
   - **Dónde:** `patient-tabs.tsx:63` (`window.history.replaceState(window.history.state, "", url)`) y `edit-patient-sheet.tsx:98`.
   - **Por qué pasa:** `window.history.state` es el estado interno de Next, que trae `__NA: true`. Con `__NA`, el parche de Next 15.5 deja pasar la llamada sin sincronizar el router (`app-router.js:324-328`): ni `canonicalUrl` ni `useSearchParams` se enteran del cambio. Después, cualquier cambio del estado del router vuelve a escribir la URL vieja. Ese cambio puede ser la revalidación de una server action ("Nueva medición" en Historial, "Editar datos", crear una consulta) o un `router.refresh`. Lo hace `HistoryUpdater`, `app-router.js:91-114` (`replaceState(historyState, '', canonicalUrl)`).
   - **Casos concretos:**
     - Abrir la ficha sin `?tab`, ir a Historial y guardar una medición: la URL vuelve a `/pacientes/<id>` y al recargar se abre Resumen.
     - Entrar con `?editar=datos`, cerrar el Sheet y guardar después una medición: la URL vuelve a tener `?editar=datos` y al recargar el Sheet se abre solo.
   - **Es una regresión:** la versión base de `patient-tabs.tsx` llamaba `replaceState(null, "", url)`, que Next sí sincroniza. Va contra la SDD §4.2 ("Query canónica para escribir en la URL (replaceState)") y contra lo que dice el reporte ("La pestaña y la vista viven en la URL").
   - **Además:** `writeUrl` corre dentro del updater de `setState` (`patient-tabs.tsx:141-145, 159-162, 166-169`). Es un efecto secundario en una función que React puede ejecutar durante el render y dos veces en StrictMode. Si pasa a `null` sin sacarlo del updater, el `dispatch` de Next ocurriría durante el render de otro componente.
   - **Qué tiene que quedar:**
     - la URL se escribe fuera del updater y queda sincronizada con el router (como en la base);
     - `?editar=datos` sale de la URL de forma que Next también se entere;
     - se verifica en runtime que, después de guardar una medición en Historial, la URL sigue en `?tab=historial`.

## Dudas (no bloqueantes)

- **Nombre accesible de la pestaña Consultas.** El contador va pegado al texto sin espacio (`patient-tabs.tsx:193-196`), así que algunos lectores de pantalla pueden leer "Consultas5". Conviene un espacio `sr-only` o un texto como "5 consultas".
- **Alto del chrome pegado a 390 px.** La barra móvil (56 px), el nombre, la línea de edad y teléfono, la franja de antecedentes y las pestañas ocupan unos 220 px de 844. Hay que confirmarlo en el recorrido (R2 y los 390 px siguen sin hacerse: el recorrido no pudo achicar la ventana).
- **"Ir a Datos"** (`requirement-section.tsx:82`, `antropometria/page.tsx:261`): ahora abre "Editar datos" pero conserva el texto viejo. Es un desvío documentado; conviene alinearlo en 017c-3.
- **Fecha de nacimiento futura.** `updatePatientDataAction` no rechaza una fecha futura: solo la limita el `max` del input. La action vieja tampoco lo hacía.
- **"Nueva consulta" en la pestaña Consultas** usa la variante primaria por defecto (`consultations-section.tsx:31`). No choca con "una sola primaria" porque está en otra pestaña, pero la SDD habla de "única variante `primary` del panel".
- **Capturas y recorrido completo a 1366/768/390 con movimiento reducido** (10-2 y R2): siguen pendientes.

# 017c-2 — ronda 2

**Veredicto:** APPROVED

Diff revisado: `git diff 034084d..HEAD` en `feat/hu-017c2-ficha` (código de `9da10e9`), sin los archivos del arnés.
Comandos que corrí yo:
- `npm run typecheck`: core, db, bot y web en verde (exit 0).
- `npm run test`: 103 archivos, 1785 tests en verde (exit 0). Coincide con el reporte.
- `./ops/harness/verify.sh`: "Arnés OK". El aviso "Se tocó el bot" viene de las carpetas sin trackear
  `apps/bot/.whatsapp-auth.vieja*`. El diff no toca `apps/bot`.
- Releí el parche de `history.replaceState` de Next 15.5 (`node_modules/next/dist/client/components/app-router.js`,
  `applyUrlFromHistoryPushReplace` y `replaceState`, líneas 293-334): con `data == null` copia el estado interno y
  despacha `ACTION_RESTORE` con la URL nueva, así que `canonicalUrl` y `useSearchParams` quedan sincronizados.

## Checkpoints

### C1 — El arnés está sano
- [x] `backlog/` válido y `verify.sh` en exit 0. Una sola HU activa para senkuch4n.
- [x] El diff no tiene archivos de HU de imleticio.

### C2 — Cadena de documentos
- [x] El contrato de §4.2 se mantiene: `resolvePatientTab` y `patientTabQuery` no cambian. Los helpers nuevos
  (`patientTabHref`, `withoutSearchParam`, `replaceUrlInRouter`, `patient-tab-route.ts:53-79`) se suman sin
  romper firmas.

### C3 — Arquitectura
- [x] No cambian `schema.prisma`, `domain`, las migraciones ni el bot. `getProfessional` se usa sin modificarlo.
- [x] Las rutas no cambian y quedan bajo el mismo middleware de auth.
- [x] No hay `console.log` ni TODOs agregados.

### C4 — Verificación
- [x] typecheck y tests en verde, corridos por mí.
- [x] Los tests nuevos prueban algo real:
  - `replaceUrlInRouter` se llama con estado `null` exactamente una vez;
  - no hace nada si la URL no cambia;
  - una guarda por código fuente impide volver a `history.replaceState` directo en los dos archivos;
  - la fecha futura da error en el campo y no escribe (`actions.test.ts:168-172`).

### C5 — Cierre
- [x] La sección "Ronda 2" de `progress/impl_HU-017c.md` describe el arreglo, los tests, el runtime y el control
  negativo.
- [x] El recorrido en runtime creó su propia paciente y la borró por id. No tocó datos de la usuaria ni creó turnos
  ni `OutboundMessage`.

## Hallazgo 1 de la revisión anterior, punto por punto

- **La URL se escribe sincronizada con el router.**
  - `patient-tabs.tsx:60-62`: `writeUrl` pasa por `replaceUrlInRouter`.
  - `patient-tab-route.ts:76-79`: `history.replaceState(null, "", href)`.
  - Con `null`, el parche de Next despacha `ACTION_RESTORE`. Cuando una server action revalida después,
    `HistoryUpdater` reescribe la URL nueva y no la vieja. **Resuelto.**
- **Ya no escribe la URL dentro del updater de `setState`.**
  - `patient-tabs.tsx:138-166`: `apply` llama a `setState({...})` con un valor y después a `writeUrl`, en el handler.
  - `go`, `setTab` y `setView` leen el estado anterior de `stateRef`. **Resuelto.**
- **`?editar=datos` sale de la URL y Next se entera:** `edit-patient-sheet.tsx:92-98` usa
  `replaceUrlInRouter(withoutSearchParam(...))`. Además `fromUrl` (`:76-85`) vuelve a `false`, así que el efecto
  no reabre el Sheet. **Resuelto.**
- **Verificación en runtime de que la URL sigue en `?tab=historial` después de guardar una medición:** el reporte
  la documenta con un build de producción, junto con un control negativo contra el código anterior que reproduce
  la regresión. No la repetí: no corro el panel ni escribo en la base. El mecanismo coincide con el código de Next
  que leí.
- **Interacción con el efecto de `[tabParam, viewParam]`** (`patient-tabs.tsx:100-104`): ahora que
  `useSearchParams` se actualiza, el efecto corre después de cada cambio de pestaña. Como `patientTabQuery` y
  `resolvePatientTab` hacen ida y vuelta (está testeado), vuelve a fijar la misma pestaña y la misma vista. Cuesta
  un render extra y no hay bucle ni salto. Atrás y adelante siguen funcionando.

## Resto de la ronda (las dudas de la revisión anterior)
- Pestaña Consultas: el número va `aria-hidden` y hay un `sr-only` " (N consulta/s)" (`patient-tabs.tsx:190-199`). OK.
- "Ir a Datos" → "Editar datos" (`requirement-section.tsx:82` y `antropometria/page.tsx:261`). OK.
- Fecha de nacimiento futura (`actions.ts:91-94`):
  - se rechaza con `isFutureDayKey` en la zona de la profesional;
  - solo consulta la base si la fecha es válida y no está vacía. OK.
- "Nueva consulta" en la pestaña Consultas pasa a `tinted` (`consultations-section.tsx:34`). OK.

## Cambios requeridos

Ninguno.

## Dudas (no bloqueantes)
- `getProfessional()` (`actions.ts:92`) está fuera del `try/catch`. Si falta la fila de la profesional, la action tira
  la excepción en vez de devolver el error genérico. En la práctica no pasa: el panel entero necesita esa fila.
- Siguen pendientes para el recorrido del orquestador:
  - el alto del chrome a 390 px;
  - las capturas a 1366/768/390 con movimiento reducido (R2 y 10-2).

---

# 017c-3

**Veredicto:** APPROVED

Diff revisado: `git diff feat/hu-017c2-ficha...HEAD` en `feat/hu-017c3-consulta` (`6903313`..`91ab7d3`), sin los
archivos del arnés. Comandos que corrí yo:
- `npm run typecheck`: core, db, bot y web en verde (exit 0).
- `npm run test`: 106 archivos, 1806 tests en verde (exit 0). Coincide con el reporte.
- `./ops/harness/verify.sh`: "Arnés OK" (exit 0). El aviso "Se tocó el bot" viene de las carpetas sin trackear
  `apps/bot/.whatsapp-auth.vieja*`. El diff no toca `apps/bot`.
- Grep de alcance contra la rama base: ningún archivo de `alimentos/`, `plantillas/`, `pacientes/[id]/planes/`,
  `food-picker`, `meals-editor`, `plan-pdf`, `pdf-theme`, `plans-section`, `apps/bot`, `packages/db`,
  `schema.prisma` ni migraciones.
- Grep de las líneas agregadas: no hay `console.log`, TODOs, `replaceState` ni `window.history`.
- Leí `sonner@2.0.8` (`node_modules/sonner/dist/index.mjs`):
  - el timer llama a `onAutoClose` y se pausa con `expanded || interacting || isDocumentHidden` (`:643-679`);
  - `toast.dismiss`, la X y el swipe llaman a `onDismiss` (`:681-686`, `:772`, `:848`);
  - el clic en la acción solo llama a `deleteToast()`, sin `onDismiss` (`:878-885`);
  - los toasts que no se ven (más de 3) mantienen su timer.
- Leí Next 15.5.24: `devtoolSegmentExplorer: true` es el default (`server/config-shared.js:216`), y los
  `SegmentViewNode` se agregan solo con `NODE_ENV === 'development'` (`server/app-render/create-component-tree.js:268,785`).

## Checkpoints

### C1 — El arnés está sano
- [x] `backlog/` válido. senkuch4n tiene una sola HU activa (HU-017c, `en_revision`, entrega 017c-3).
- [x] `progress/current-senkuch4n.md` refleja la entrega.
- [x] No hay archivos de HU de imleticio en el diff.
- [x] `verify.sh` termina en exit 0.

### C2 — Cadena de documentos
- [x] La HU (§4.3, §4.4) y la SDD (017c-3, "Decisiones", "Agregados a 017c-3") están completas.
- [x] La SDD trae el contrato de §4-3 (`deferred-delete.ts`, `notify.undo`, actions).
- [x] Firmas y nombres coinciden con el contrato:
  - `deferred-delete.ts` exporta `CommitResult`, `DeferredDeleteStore` (6 métodos), `createDeferredDeleteStore`,
    `deferredDeletes`, `usePendingDeletion`, `usePendingDeletions` y `useDeferredDelete` con los campos de §4.1.
    Los agregados son compatibles: el parámetro opcional `options` (`releaseAfterMs`, `setTimer`), `UNDO_TEXT`,
    `measurementLabelsText` y `DeferredDeleteOptions`.
  - `notify.undo(message, onUndo, { onExpire? })` (`notify.ts:26-34`). `notify.saved` suma un `action` opcional;
    los usos de hoy no cambian.
  - Actions: `deleteConsultationAction` devuelve `{ ok: true }` sin `redirect` (`consultation-actions.ts:239-250`).
    `deleteEvolutionEntryByIdAction(patientId, entryId): Promise<ActionState>` (`clinical-actions.ts:67-83`).
    No queda ninguna referencia a `deleteEvolutionEntryAction`.
  - Las keys son las de la SDD: `consultation:`, `isak:`, `prescription:` y `measurement:`.
  - Los textos de las confirmaciones y los toasts coinciden con la tabla de la HU §4.3. Los textos de core de la
    lista 0.1 cambian con sus tests (`isak-study.ts:162-171`, `energy-requirement.ts:349-356`).

### C3 — Arquitectura
- [x] El store puro va en `apps/web/src/lib` con su test (T2). Los textos de core son solo del panel (D11b).
  `domain` no cambia.
- [x] No cambian `schema.prisma` ni `domain`. Igual compilan los 4 workspaces.
- [x] No hay migraciones (3-3).
- [x] No hay rutas nuevas. Las actions quedan bajo el middleware de Auth.js. No toca el portal.
- [x] No toca el bot.
- [x] No hay `console.log` ni TODOs en las líneas agregadas.

### C4 — Verificación
- [x] `npm run typecheck` limpio.
- [x] Tests reales:
  - `deferred-delete.test.ts` cubre todos los casos de §9-3: schedule, undo antes y después de commit, commit
    doble, `{ ok: false }`, commit que tira, dos keys, subscribe con cambio de identidad y `releaseAfterMs`
    con timers manuales.
  - `consultation-actions.test.ts`: `{ ok: true }` sin `redirect`, `notDeletable` y una consulta de otro paciente.
  - `clinical-actions.test.ts`: una medición de otro paciente da error sin borrar ni revalidar; también la
    inexistente, los ids vacíos y el borrado que tira.
  - En core, los textos exactos y que ya no dicen "deshacer".
- [x] No aplica simular el bot.
- [x] No aplica verificar un PDF.

### C5 — Cierre
- [x] La sección 017c-3 de `progress/impl_HU-017c.md` describe archivos, contrato, verificación, runtime, R3 y
  desvíos.
- [x] `progress/review_HU-017c.md` (esta sección).
- [x] No quedan scripts sueltos en el repo. Según el reporte, la paciente de prueba se borró por id. No lo
  verifiqué en la base: esta revisión no consulta la base.

## Puntos que pidió el orquestador

- **Borrado diferido** (`deferred-delete.ts`):
  - **Al navegar:**
    - el `<Toaster />` vive en `(panel)/layout.tsx:62` y el store es un singleton de módulo, así que la navegación
      cliente no corta el plazo;
    - los cierres del toast son globales de sonner y el `router` de Next es estable, así que el commit corre
      aunque el componente que borró ya no esté montado.
    - Al borrar la consulta, `afterSchedule` navega a `?tab=consultas`, y la lista filtra la key
      (`consultations-section.tsx:31-32`).
  - **Al cerrar la pestaña o recargar:** se pierde el store, nadie llama a commit y el dato vuelve. Es la falla del
    lado seguro de D12a. Una navegación con recarga completa se comporta igual.
  - **Dos borrados seguidos:**
    - cada uno tiene su entrada (`id = key#n`) y su toast;
    - el `router.refresh()` del primero no hace reaparecer el segundo, que sigue oculto por la snapshot;
    - si el primero falla, solo vuelve el primero.
    - En un mismo toast, el `settled` local (`:197-213`) deja pasar una sola resolución entre `onAutoClose`,
      `onDismiss` y "Deshacer".
    - El store, además, guarda la promesa de commit y no lo repite (`:80-81`).
  - **Error de la action:** si la action devuelve `{ ok: false }`, o el fetch o la action tiran (`:85-89`), la
    entrada se borra, la key vuelve a verse y sale `notify.error("No se pudo borrar. Probá de nuevo.")`. El
    reporte lo probó en runtime con la red cortada.
  - **SSR e hidratación:** `getServerSnapshot` devuelve un `Set` vacío fijo y en el servidor nunca se programa
    nada, así que no hay diferencias de hidratación.
- **Pertenencia en las actions de borrado:**
  - `deleteEvolutionEntryByIdAction` compara `entry.patientId !== patientId` (`clinical-actions.ts:76`);
  - `deleteConsultationAction`, `deleteIsakStudyAction` (`isak-actions.ts:75`) y `deletePrescriptionAction`
    (`prescription-actions.ts:72`) usan `belongsToPatient`;
  - `deleteConsultationMeasurementAction` usa `belongsToPatient` y además compara el `consultationId` de la
    medición (`consultation-actions.ts:220-222`). Ninguna de estas cambió.
- **Props de servidor a cliente:**
  - consulta: `ConsultationMoreMenu` (strings y booleano), `ConsultationDateSheet` (`trigger` es un elemento),
    `StickyAside` (string e hijos) e `IsakCard` (datos planos, igual que antes);
  - estudio ISAK: `IsakSectionIndex` (array de `{ id, label }`) e `IsakStudyMoreMenu` (strings y booleano);
  - `MoreActionsMenu` recibe funciones, pero solo desde componentes cliente.
  - **No queda ningún caso.** No hay `replaceState` en el diff.
- **R3:** la causa es real y está bien acotada. `devtoolSegmentExplorer` viene prendido por defecto en Next 15.5
  y envuelve layouts y páginas en `SegmentViewNode` solo en desarrollo. Eso explica que fallen todos los `useId`
  de abajo de `PanelLayout`, en una parte de las cargas y nunca en `next start`.
  - El arreglo (`next.config.mjs:11-17`) es una opción `experimental` de desarrollo con un comentario. No cambia
    nada en producción.
  - El recorrido del orquestador confirma la consola limpia en la ficha y en la consulta.
- **R4:** "70,5", "22,5" y "2,8" (`measurement-fields.tsx:32,105,117`). El input sigue siendo
  `type="number" inputMode="decimal"`, así que solo cambia el texto de ejemplo.
- **Zona de imleticio:** intacta (ver el grep de arriba).

## Cambios requeridos

Ninguno.

## Dudas (no bloqueantes)

- **El cálculo sigue oculto 10 s después del commit.** Durante ese tiempo, "Calcular requerimiento" queda
  deshabilitado con "cuando se cierre el aviso de “Deshacer”", aunque el toast ya se cerró
  (`requirement-section.tsx:53,117-135` con `releaseAfterMs` en `deferred-delete.ts:44`). Se puede liberar antes,
  apenas llega la página revalidada (`prescription === null`), o cambiar el texto.
- **Volver con "Atrás" a la consulta o al estudio dentro de los 8 s** muestra la página completa, porque
  `consultas/[consultationId]/page.tsx` no se oculta con su key. Si después vence el plazo, el `router.refresh()`
  lleva a `notFound`. La SDD no lo pide.
- **Resumen y contador de la pestaña Consultas:** durante el plazo siguen contando la consulta o la medición
  pendiente, porque son datos del servidor (`patient-tabs.tsx`, `summary-section.tsx`). Solo filtran las listas
  que nombra la SDD (R-2).
- **Borrar un estudio ISAK desde Historial** usa siempre `ISAK_TEXT.deleteDescription`, sin "y su informe"
  (`evolution-table.tsx:53-56`), porque la fila no sabe si el estudio tiene informe. Pasa por
  `deleteEvolutionEntryByIdAction` y no por `deleteIsakStudyAction`, igual que antes de esta entrega.
- **"Quitar plan" no muestra estado de carga** (`consultation-plan.tsx:43`, `[, startClear]`). Sin red tarda en
  aparecer el toast, pero el menú se cierra y no se puede repetir el clic sobre el mismo ítem.
- **Faltan del recorrido 10-3:**
  - 1920×1080;
  - movimiento reducido;
  - el toast con lector de pantalla;
  - cerrar el toast con swipe (el `Toaster` del panel no tiene X).

---

# 017c-4

# Review — HU-017c (entrega 017c-4: informe antropométrico, su PDF y R5–R7)

**Veredicto:** CHANGES_REQUESTED

Diff revisado: `git diff feat/hu-017c3-consulta...HEAD` en `feat/hu-017c4-informe` (`31036d2`..`d16e33a`), sin los
archivos del arnés. Typecheck, tests, `verify.sh`, la compilación de Tailwind y el PDF los corrí yo.

## Checkpoints
- C1 backlog válido, 1 HU activa por responsable: [x] `backlog/HU-017c.json` en `en_revision`, entrega 017c-4.
- C1 bitácora refleja la HU: [x] `progress/current-senkuch4n.md` (última línea: 017c-4 `implementando`; el pase a revisión lo anota el orquestador).
- C1 no toca HU de la otra persona: [x] Ni zona de imleticio ni archivos de sus HU. `plan-pdf.tsx`, `plan-pdf.test.tsx`, `pdf-theme.ts`, `ajustes/**`, `planes/**`, `alimentos/**` y `plantillas/**` quedan fuera del diff (el grep también encuentra `report-pdf-theme.ts`, pero es un falso positivo).
- C1 `verify.sh` exit 0: [x] "Arnés OK". El WARN de bot viene de las entregas anteriores de la cadena: este diff no toca `apps/bot`.
- C2 HU completa: [x] `docs/hu-017c-pacientes-consultas.md` §4.5 y su Gherkin.
- C2 SDD completa: [x] sección 017c-4, Decisiones y "Agregados a 017c-4".
- C2 firmas = contrato: [x] `report-pdf-theme.ts` exporta lo de §4.1 con esos nombres y valores (más `reportPdfFigureNeutral`, `reportPdfGridColor` y `ReportPdfTextStyle`, que no rompen nada). `buildCommonStyles(accentColor, palette = pdfColors)` y `palette?` opcional en `PdfHeader`, `PdfFooter` y `PdfSignatureBlock` (`pdf-common.tsx:71,105,143,178`). `informe/page.tsx:25-32` pasa `patientName`, `whatsappJid` y `phone`.
- C3 arquitectura: [x] Core, db y bot sin cambios. Los textos nuevos, solo del panel, están en `apps/web/src/lib/report-editor-text.ts` (puro y con test). `ISAK_REPORT_TEXT` no cambia (D11b).
- C3 schema/domain: [x] sin cambios (n/a). Typecheck de los 4 workspaces en verde.
- C3 migraciones: [x] n/a.
- C3 auth/portal: [x] No hay rutas nuevas.
- C3 bot silencioso y textos: [x] n/a. El caption sigue siendo `ISAK_REPORT_TEXT.whatsappCaption`.
- C3 sin console.log/TODO: [x] grep limpio sobre los archivos del diff.
- C4 typecheck: [x] `npm run typecheck` exit 0 (core, db, bot, web).
- C4 tests: [x] `npm run test` da 110 archivos y 1835 tests en verde. `plan-pdf.test.tsx` pasa 4/4 y el archivo no tiene cambios.
- C4 bot simulado: [x] n/a.
- C4 PDF verificado: [x] Lo regeneré con `HU016_PDF_DIR` y cwd en `apps/web` (en el scratchpad): A4, 4 páginas, Inter 400/500/600 incrustadas (`pdffonts`). Con `pdftoppm -gray`, en la página 3 los 4 tejidos se distinguen. El PDF del plan no puede cambiar. Con `palette` omitido, `buildCommonStyles` da lo mismo que con `pdfColors` (test). La línea de firma por defecto sigue en `pdfColors.text`, igual que el `signatureStyles.rule` de antes. `plan-pdf.tsx` no pasa `palette`.
- C5 impl existe: [x] sección 017c-4 de `progress/impl_HU-017c.md`.
- C5 review con veredicto: [x] esta sección.
- C5 sin scripts ni datos sueltos: [x] El diff no agrega scripts. El implementer declara que sus datos de prueba se borraron por id (no lo verifiqué contra la base: no escribo ahí).

## Puntos que pidió el orquestador

- **PDF del plan intacto:** OK (ver C4). `pdf-theme.ts` no cambió (no figura en el diff) y `plan-pdf.test.tsx` no tiene cambios.
- **Confirmación de envío:**
  - No encola sin confirmar: `send()` (`report-editor.tsx:259-268`) hace `await confirm(...)` y vuelve si no hay `ok`, antes de `run("send", …)`.
  - No manda dos veces:
    - el botón queda `disabled={busy}` mientras corre cualquier acción;
    - `useConfirm` resuelve una sola vez: al cerrar, `pending` pasa a null;
    - una segunda llamada mientras hay un diálogo abierto resuelve la anterior con `false` (`components/confirm.tsx:36-49`);
    - un doble clic sobre "Enviar por WhatsApp" abre un solo diálogo efectivo.
  - Los textos coinciden con SDD 4.4: `¿Enviar el informe a ${nombre}?` / `Le llega por WhatsApp al ${formatPhone(phone)}.`; "Le llega por WhatsApp." para JID no-phone; botón "Enviar"; `destructive: false`.
- **Props serializables:** OK. `informe/page.tsx` pasa strings y booleanos (`professionalNotice` pasa a `licenseMissing`/`signatureMissing`). `hasReport` es un booleano opcional dentro de `EvolutionRow`. `disabledReason` es un string dentro de un componente cliente. No cruza ninguna función ni componente.
- **R5:** cumple lo pedido (se libera cuando llega `prescription === null`), pero abre un caso borde que deja un estado falso. Ver hallazgo 1.
- **R6:** OK (`consultation-plan.tsx:44,72,89,93-100`). `isPending` de la transición: opacidad, "Quitando el plan de la consulta…" en `aria-live` con spinner `motion-reduce:animate-none`, y el ítem del menú deshabilitado con su motivo.
- **R7:** OK.
  - `pacientes/[id]/page.tsx:59` incluye `anthropometricReport: { select: { id } }`.
  - `evolution-rows.ts:50` pone `hasReport` solo si la relación vino (con test).
  - `evolution-table.tsx:54-59` usa `ISAK_TEXT.deleteWithReportDescription` cuando `hasReport`.
  - `EvolutionSection` solo se monta en la ficha, así que no hay consumidores que queden con `undefined`.
- **Editor:**
  - la ayuda va como texto secundario bajo el subtítulo;
  - "Antes de enviar" es un solo `Alert warning` con una fila por problema y su botón, y se oculta si no hay problemas;
  - el aviso de menor queda aparte como info;
  - "Editado" y "Restaurar el texto original" aparecen solo si `texts[k] !== drafts[k]`;
  - "Generar PDF" es `primary lg`.
- **Barra sticky en < 640 px:** compilé Tailwind con la config del repo. `max-sm:material-bar` genera también las variantes de `prefers-reduced-transparency`, `prefers-contrast` y `:root:has(.a11y-…)`, así que la accesibilidad del material se conserva. `-mx-6` coincide con el `px-6` del `<main>` del panel.

## Cambios requeridos
1. **R5 deja un estado falso si se recalcula dentro de la ventana `releaseAfterMs`.**
   - **Dónde:** `apps/web/src/app/(panel)/pacientes/[id]/consultas/[consultationId]/requirement-section.tsx:113` y `:117`.
   - **Qué pasa:**
     - Después del commit, la key `prescription:<id>` sigue oculta 10 s (`deferred-delete.ts:44,90-95`). Con R5, en cuanto llega `prescription === null`, la usuaria ya puede apretar "Calcular requerimiento".
     - Si guarda el cálculo nuevo antes de que venzan esos 10 s, `onDone` pasa a `mode = "view"`. La página revalidada trae `prescription !== null` mientras `deleting` sigue en `true`.
     - Entonces se entra al bloque vacío (`prescription === null || deleting`) con `waitingUndo === true`.
   - **Qué ve la usuaria:** el cálculo que acaba de guardar desaparece, el botón queda deshabilitado y aparece "Vas a poder calcular de nuevo cuando se cierre el aviso de 'Deshacer'", cuando ya no hay ningún aviso. El cálculo reaparece solo, a los pocos segundos. Antes de R5 no podía pasar.
   - **Qué se espera:** que un cálculo creado después del borrado no quede oculto por la key vieja. Por ejemplo, tomar el borrado como terminado una vez que se vio `prescription === null` con la key pendiente, o liberar la key en cuanto la página refleja el borrado.
   - **Cómo se verifica:** el escenario "borrar → dejar vencer el toast → calcular y guardar enseguida" muestra el cálculo nuevo sin el aviso.

## Dudas (no bloqueantes)
- **Texto de la fila de la profesional.** La HU dice "Falta tu matrícula o tu firma". El implementer lo cambió por tres variantes más específicas: "Falta tu matrícula", "Falta tu firma" y "Faltan tu matrícula y tu firma". Lo declara (impl, decisión 4) y me parece mejor, pero es un desvío de un texto de la HU: que el orquestador lo confirme.
- **Tamaño de los botones.** Todos van en `size="lg"`, también los secundarios. La HU (decisión de tamaños) recomienda 36 px para los secundarios. La SDD 4.4 solo pide `secondary`. En el celular, el `lg` parejo tiene sentido en la grilla de 2 columnas.
- **Toasts sobre la barra sticky.** En el celular, los toasts pueden tapar la barra un momento (impl, decisión 8). Queda para otra entrega (`mobileOffset` del `Toaster`).
- **Recorrido incompleto del orquestador.** No cubrió la confirmación de envío (abrir y cancelar), los 390 px ni el antes/después del PDF de un plan. Lo hizo el implementer con Chromium headless y yo regeneré el PDF del informe, pero la SDD 10-4 lo pide en el recorrido.
- **Escala `metric`.** `reportPdfType.metric` está definida pero el PDF no la usa: se volvía a 5 páginas. Está justificado, pero queda un export sin uso.
- **Fuente en los tests.** `npm run test` desde la raíz genera los PDF de prueba con Helvetica: `FONT_DIR` depende de `process.cwd()`. No es de esta entrega, pero los tests de paleta no prueban la tipografía real.

# 017c-4 — ronda 2

# Review — HU-017c (entrega 017c-4, ronda 2 / intento 1 de 2)

**Veredicto:** APPROVED

Diff revisado: `git diff 512134e..HEAD -- apps packages` en `feat/hu-017c4-informe` (commit de código `46b2b0c`),
sin los archivos del arnés. Typecheck, tests y `verify.sh` los corrí yo.

## Checkpoints
- C1 backlog válido, 1 HU activa por responsable: [x] `backlog/HU-017c.json` en revisión, entrega 017c-4.
- C1 bitácora refleja la HU: [x] `progress/current-senkuch4n.md` tiene la línea de la ronda 2.
- C1 no toca HU de la otra persona: [x] el diff toca solo `requirement-section.tsx`, `consultas/[consultationId]/page.tsx`, `report-editor.tsx`, `lib/deferred-delete.ts`, `lib/report-editor-text.ts` y sus tests.
- C1 `verify.sh` exit 0: [x] "Arnés OK". El WARN del bot viene de las entregas anteriores de la cadena: este diff no toca `apps/bot`.
- C2 HU/SDD completas: [x] sin cambios.
- C2 firmas = contrato: [x] Solo cambia la key del borrado diferido del cálculo: antes `prescription:<consultationId>` (017c-3), ahora `prescription:<prescriptionId>` vía `prescriptionDeletionKey` (`deferred-delete.ts:177-179`). El desvío está declarado. Un grep confirma que el único que la arma es `requirement-section.tsx:59,71`. `prescriptionId` es un string serializable (`page.tsx:292`).
- C3 arquitectura: [x] core, db y bot sin cambios.
- C3 schema/domain/migraciones: [x] n/a.
- C3 auth/portal: [x] no hay rutas nuevas.
- C3 bot silencioso y textos: [x] n/a.
- C3 sin console.log/TODO: [x] grep limpio sobre el diff.
- C4 typecheck: [x] `npm run typecheck` en verde (core, db, bot, web).
- C4 tests: [x] `npm run test` da 110 archivos y 1838 tests en verde (son 3 más que en la ronda 1).
- C4 bot simulado: [x] n/a.
- C5 impl existe: [x] sección "Ronda 2 (017c-4)" de `progress/impl_HU-017c.md`.
- C5 review con veredicto: [x] esta sección.
- C5 sin scripts ni datos sueltos: [x] El diff no agrega scripts. El implementer declara que borró sus datos de prueba por id. No lo verifiqué contra la base porque no escribo ahí.

## Hallazgo 1 de la ronda anterior (R5): resuelto
- La key del borrado diferido va por el id de la prescripción: `requirement-section.tsx:59-60` y `:71`, con `deferred-delete.ts:177-179`.
- Después del commit, la key vieja sigue oculta durante `releaseAfterMs`, pero solo alcanza a la fila borrada. El upsert crea una fila nueva con otro cuid y su key nunca se programó, así que el cálculo nuevo se ve y `deleting` es `false`.
- Con `prescription === null`, la key es `prescription:`. Nunca se programa, así que "Calcular requerimiento" queda libre en cuanto llega la página revalidada. Se conserva R5 y deja de depender de la ventana.
- Durante el plazo de "Deshacer" el id es el mismo: el cálculo sigue oculto y el botón, deshabilitado con su motivo (`:123`).
- Deshacer y un commit fallido no cambian: la key es la misma en todo el ciclo.
- Tests: `deferred-delete.test.ts:147-174` usan el store real con timers manuales y prueban la key vieja, la nueva y la de `null` dentro de la ventana, y la liberación al vencer.

## Cambios por las dudas de la ronda anterior (verificados)
- **Texto de la profesional:** vuelve al texto de la HU §4.5 (`docs/hu-017c-pacientes-consultas.md:723`), "Falta tu matrícula o tu firma" (`report-editor-text.ts:23-25`). El único consumidor es `reportIssues`. Los tests están actualizados.
- **Botones secundarios:** quedan en 36 px desde `sm` (`report-editor.tsx:31` y `:530`, `:546`, `:556`). `h-11` y `sm:h-9` son variantes distintas, así que tailwind-merge no las pisa: en el celular siguen en 44 px y desde `sm` miden 36 px. "Generar PDF" sigue en `lg`.

## Cambios requeridos
Ninguno.

## Dudas (no bloqueantes)
- Siguen abiertas las dudas de la ronda 1 que el implementer dejó con motivo: los toasts sobre la barra sticky, `reportPdfType.metric` sin uso y la fuente de los tests (`FONT_DIR` depende de `process.cwd()`). También el recorrido del orquestador incompleto según la SDD 10-4, que conviene cerrar antes del PR.
