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
