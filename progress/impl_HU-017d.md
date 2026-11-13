# Implementación HU-017d (portal del paciente)

## 017d-1: acceso, inicio y evolución

- **Estado:** done
- **Rama:** `feat/hu-017d-portal` (sale de 017b-4; `git merge-base --is-ancestor 0aec47b HEAD` → 0)
- **Modelo:** Opus. Skills: apple-design, web-design-guidelines (autochequeo), ui-ux-pro-max /
  mblode-agent-skills-ui-animation (criterios aplicados: press de tarjeta, sin animación nueva fuera de
  `press-sm` y de la entrada del gráfico).
- **Sin migraciones, sin cambios en `schema.prisma`, `packages/db`, `apps/bot` ni `messages.ts`.**

### Commits (uno por fase)

| Commit | Fase |
|---|---|
| `90596bb` | 1 core: `portal.ts` + `portal.test.ts` + `export *` al final de `index.ts` |
| `0ece561` | 2 acceso y shell: `getProfessionalPortalContact`, `PortalAccessGate/Screen`, layout con `Suspense` + `ConfirmProvider`, header sin "Salir", `loading.tsx`, `error.tsx` sin `detail` |
| `63b0cbd` | 3 inicio: `PortalCardLink`, `PortalLogoutButton`, `portal/page.tsx` |
| `df85010` | 4 evolución: `evolucion/page.tsx` (select sin `note`) + `EvolutionChart` con `isAnimationActive={!reduced}` |
| `aefe6da` | Q4: `primitives/sheet.tsx`, el panel vuelve a 0 si el dueño veta el cierre por arrastre (pedido del orquestador, ver abajo) |
| `bc26ebe` | Ajuste del autochequeo de UI: `break-words` en el título del plan |
| (este) | 5 verificación: este archivo |

### Archivos tocados

- `packages/core/src/portal.ts` (nuevo), `packages/core/src/portal.test.ts` (nuevo, 32 tests), `packages/core/src/index.ts` (última línea)
- `apps/web/src/lib/shell.ts` (`getProfessionalPortalContact`)
- `apps/web/src/app/(portal)/layout.tsx`, `portal/page.tsx`, `portal/evolucion/page.tsx`, `portal/loading.tsx`, `portal/error.tsx`
- `apps/web/src/components/portal/portal-access.tsx` + `portal-access.test.tsx` (5 tests), `portal-card-link.tsx`, `portal-logout-button.tsx` (nuevos)
- `apps/web/src/components/shell/portal-header.tsx` (sin "Salir", sin imports de `LogOut`/`Button`; `activeHref` sigue)
- `apps/web/src/components/evolution-chart.tsx` (movimiento reducido; sin cambio de props)
- `apps/web/src/components/primitives/sheet.tsx` (Q4; sin cambio de API)

### Contrato compartido

Las firmas coinciden con la SDD 4.1, 4.2, 4.3 y 4.5: `PORTAL_TEXT` (textos exactos), `portalGreeting`,
`portalProfessionalLine`, `professionalWhatsappUrl`, `diaryTodayText`, `startOfTodayInTz`, `isMinorOn`,
`formatPortalDate`, `formatWeightKg`, `formatHeightMeters`, `PortalWeightSummary`/`portalWeightSummary`,
`PortalHeightSummary`/`portalHeightSummary`, `PortalEvolutionRow`/`portalEvolutionRows`,
`getProfessionalPortalContact()`, `PortalAccessGate`, `PortalAccessScreen`, `PortalCardLink`,
`PortalLogoutButton`. Antes de crearlas: ningún export de core ni de la rama de 018d usaba esos nombres
(`git grep … feat/hu-018d-medidas-caseras -- packages/core/src` vacío).

### Decisiones no obvias

- **Q4 en 017d-1.** La SDD lo ubica en 017d-2 (4.6), pero el orquestador lo pidió en esta entrega. Va en
  su propio commit. `SheetPanel` guarda en un ref `open && isPresent`. En `onDismiss`, después de
  `setOpen(false)`, un `requestAnimationFrame` mira el ref: si el sheet sigue abierto (el dueño vetó),
  pone `exitVelocity` en null y anima `offset` a 0 (`springs.standard`, o `fades.fast` con movimiento
  reducido). Sin veto, el panel deja de estar presente y la salida sigue como antes. **No se verificó en
  runtime:** en 017d-1 no hay ningún sheet del portal, y el único que veta (`ServiceSheet`, 017b-2)
  está en el panel, detrás de Google. Queda para el runtime de 017d-2 ("Anotar comida" con texto →
  arrastrar → "¿Descartar…?" → Cancelar → el panel vuelve a su lugar). **017d-2 no tiene que volver a
  hacer 4.6.**
- **ConfirmProvider en el portal:** envuelve todo el shell con paciente (header, `main`, `PortalNav` y
  `Toaster`). El `AlertDialog` se monta en `document.body`, fuera de `.theme-portal`, igual que en el
  panel. Verificado en runtime: abre, cancela y sale. `useConfirm` se llama en `onClick` (no dentro de
  una action ni de una transición, por la nota de deadlock de `confirm.tsx`) y después hace
  `requestSubmit()` del `<form hidden action="/portal/logout" method="POST">`.
- **T9a:** el servidor no le pasa funciones ni componentes a clientes. Los íconos de `PortalAccessScreen`
  y `PortalLogoutButton` se importan del lado cliente. `PortalCardLink` es server-safe y dibuja su
  `ChevronRight`. `EmptyState icon={TrendingUp}` se usa en un server component que no es cliente.
- **T9e:** sin `useId` en lo que dibuja el layout. Ids fijos `portal-access-title` y `portal-next-appointment`.
- La tarjeta del turno es un `<section aria-labelledby>` con `h2`. Dentro de las tarjetas tocables, los
  títulos van en `<p>` y no en `h2`, porque el link tiene `aria-label`.
- `formatHeightMeters` redondea los cm a entero antes de dividir por 100, así `165,5` da `1,66` sin
  depender del redondeo binario. `formatWeightKg` redondea a 1 decimal antes del `Intl`.
- `portalProfessionalLine` (Q1) normaliza con NFD, así que "NUTRICIONÍSTA" también cuenta como el nombre del seed.
- `npm run db:generate` corrió en el preflight y no tocó la base.

### Verificación

| Comando | Resultado |
|---|---|
| `npm run typecheck` | core, db, bot y web en verde |
| `npm run test` | 128 archivos, **2098 tests** OK (incluye `portal.test.ts` 32 y `portal-access.test.tsx` 5) |
| `npm run lint --workspace apps/web` | "No ESLint warnings or errors" |
| `./ops/harness/verify.sh` | "Arnés OK" (el WARN "se tocó el bot" sale porque cambió core; el bot no cambió) |
| `next build` (webpack, en una copia del scratchpad) | exit 0. El único warning es el de `jose`/Edge Runtime, que ya estaba. Sin "useSearchParams() should be wrapped…" ni "use server" |
| `next build --turbopack` (misma copia) | "Compiled successfully", exit 0 |

**Runtime** con `next start -p 3198` y Chromium headless (playwright-core, 390×844 táctil, 768×1024 y
1366×768), **sobre los dos builds** (webpack y Turbopack): **77/77 chequeos OK en cada uno**.
- Sin cookie: `/portal` muestra "Para entrar necesitás un link". `/portal/login?token=basura` y el token
  vencido (`createPatientToken(id, -1)`) terminan en `/portal?error=invalid`, con "Este link ya venció" y
  "cada link dura 15 minutos", y sin el texto de sin link. No hay botón de WhatsApp (`phoneJid` null en
  dev). En 20 cargas por ancho, la consola queda sin errores ni avisos de hidratación.
- Con el token válido de la paciente de prueba: "Hola, Prueba 👋", "Tu espacio con tu nutricionista",
  "Mañana, 10:00" + "Falta pagar la seña para confirmarlo" (gana el turno con seña de las 10:00 sobre el
  confirmado de las 11:30, D6), "28,4" + "hace 3 semanas" en la tarjeta. La tarjeta de evolución es
  `<a aria-label="Tu evolución">` y, tocada en una esquina (12,12), navega. `header form[action="/portal/logout"]`
  da null. Todos los `a`/`button` de `main` miden ≥ 44 px de alto. No hay scroll horizontal. 10 recargas
  sin errores de consola.
- `/portal/evolucion`: "28,4 kg", "Último registro: hace 3 semanas", "1,30 m", "Medida hace 3 semanas". La
  paciente es menor, así que no aparece "menos que", "más que" ni "Igual que". El historial tiene 2 filas:
  la medición sin peso ni altura no aparece. **"NOTA-CLINICA-017d" no está ni en el DOM ni en el HTML/RSC de
  la respuesta** (`request.get(...).text()`). No se ve el error boundary.
- "Salir del portal" abre el diálogo "¿Salir del portal?" con el texto de la HU. "Cancelar" deja la
  sesión abierta. "Salir" lleva a "Para entrar necesitás un link" y la cookie `patient_session` desaparece.
- Con `reducedMotion: "reduce"`, las 2 barras del gráfico tienen el mismo alto al cargar y 1,5 s después
  (no crecen).
- Log del servidor (los dos builds): sin "cannot be passed to Client Components", sin "Functions cannot
  be passed" y sin errores.
- Capturas a 390 px (inicio, evolución y link vencido) en el scratchpad de la sesión, no en el repo. **No
  se tomaron las capturas "antes" (0.4)**: no son parte del criterio y el dev server iba a recargar con
  los cambios.

### Datos de prueba (creados y borrados por id)

- El bot estaba apagado: `ps` no mostró ningún proceso de `apps/bot`.
- Conteos de antes, `Patient|Appointment|EvolutionEntry|DiaryEntry|OutboundMessage`: `21|22|17|2|12`.
- Se crearon la paciente `hu017d-paciente` (JID inventado `5493510017401@s.whatsapp.net`, nacida el
  2018-05-10), `hu017d-ev-1/2/3` (la 2 con la nota de prueba y la 3 sin peso ni altura) y
  `hu017d-turno-a` (CONFIRMED 11:30) y `hu017d-turno-b` (AWAITING_PAYMENT 10:00), mañana, con
  `needsGoogleSync=false`.
- `OutboundMessage` de esos turnos antes de limpiar: 0. Se borró por id: 2 turnos, 3 mediciones y 1 paciente.
- Conteos de después: `21|22|17|2|12`, iguales a los de antes.
- El token no se guarda en la base. Los tokens estuvieron solo en un archivo del scratchpad, que ya se
  borró. Se borraron la copia del build y `playwright-core`, y el `next start` de :3198 está apagado.

### Para el orquestador / recorrido

- **El dev server de :3100 (Turbopack) devuelve 500 en `/portal`:** `getProfessionalPortalContact is not
  a function`. Tiene en caché el módulo `lib/shell.ts` de antes. Hacer `touch` no alcanzó. Los dos builds
  limpios y su runtime andan, así que hay que reiniciar ese dev server para el recorrido. No lo paré.
- El `Wordmark` del header y de la pantalla de acceso sigue diciendo "Nutricionista" (valor del seed).
  Está fuera de alcance según Q1.
- D20 (contraste de las tarjetas con el brillo bajo) y D19 quedan para el recorrido.
- La tarjeta del plan como `<a>` no se probó en runtime porque la paciente de prueba no tiene plan. Usa
  el mismo `PortalCardLink` que la de evolución, que sí se probó.
- Las etiquetas del eje del gráfico usan la zona del navegador (`Intl.DateTimeFormat` sin `timeZone`, ya
  estaba así). El historial usa la zona de la profesional.

### Correcciones del recorrido (ronda 1)

- `9831216`, gráfico de peso con las barras en 0. **Causa:** Recharts avanza la animación de crecimiento de
  `<Bar>` con `requestAnimationFrame`, y Chrome no da cuadros a una pestaña o ventana que no está en
  primer plano (el Chrome del recorrido). Por eso las barras quedaban en su alto inicial, 0. Los valores
  ya llegaban numéricos (`Number(...)` en el portal y en `evolution-series` del panel), y el dominio y
  el contenedor estaban bien. Lo reproduje con `requestAnimationFrame` anulado: antes del arreglo, 0
  rectángulos dibujados. **Arreglo** en `components/evolution-chart.tsx`, que comparten portal y panel:
  `isAnimationActive={false}`, así el gráfico se dibuja ya con su alto final. Eso también cubre el
  movimiento reducido (reemplaza el `useReducedMotionConfig` de `df85010`). Las filas salen de
  `lib/evolution-chart-rows.ts` (`evolutionChartRows`, nuevo), que pasa `value` a número aunque llegue
  un Decimal como string y descarta lo que no es finito. Su test es `lib/evolution-chart-rows.test.ts`
  (3 tests). Las props no cambian.
- `37cf2ac`, título de la pestaña. `generateMetadata` en `(portal)/layout.tsx` usa
  `getPortalDocumentTitle()` (nuevo en `lib/shell.ts`, nunca tira) y `portalDocumentTitle()` (nuevo en
  core, con 2 tests): da "Tu espacio — Lic. Daiana Ponce", y con nombre vacío o el "Nutricionista" del
  seed sin título (regla Q1) da "Tu espacio". El panel sigue con "NutriBot — Panel". Las firmas del
  contrato de la SDD no cambian: solo se suman funciones.
- **Verificación:** `typecheck` en los 4 workspaces OK. `test` OK, 129 archivos y 2103 tests. `lint` de
  web sin warnings. `verify.sh` dice "Arnés OK". `next build` y `next build --turbopack` en una copia,
  exit 0. Runtime con `next start :3198` sobre los dos builds:
  - Portal de María González (solo lectura, token local): las barras miden 166/162/158 px con etiquetas
    78 / 76 / 74,5, igual con `requestAnimationFrame` anulado.
  - Ficha del panel `/pacientes/<María>?tab=historial&vista=medidas`, con una cookie de sesión de Auth.js
    armada en local con `AUTH_SECRET` para un mail de `ALLOWED_EMAILS` (sin login de Google, sin
    escribir en la base y con vencimiento de 15 min): el gráfico de Peso da 166/162/158 px, con y sin
    rAF.
  - La pestaña del portal dice "Tu espacio" (en dev la profesional es el seed) y la del panel "NutriBot — Panel".
  - Sin errores de consola ni del servidor.
  - No se crearon datos. Se borraron la copia, playwright y los tokens.
- **Pendiente para el orquestador:** los otros gráficos del panel (`ComparativeChart` y
  `StudyComparisonChart`) siguen con la animación de Recharts, así que en una pestaña de fondo pueden
  arrancar en 0 hasta que la pestaña se ve. Están fuera del pedido. El dev server de :3100 seguía
  sirviendo el `<title>` viejo, probablemente por la caché de Turbopack: conviene reiniciarlo antes de
  mirar el título.

## 017d-2: diario (+ agregado R1)

- **Estado:** done
- **Rama:** `feat/hu-017d2-diario` (sale de la punta aprobada de 017d-1, `9ecdc30`). Sin push.
- **Modelo:** Opus. Skills: ui-ux-pro-max, apple-design, mblode-agent-skills-ui-animation (criterios para
  la entrada y la salida de filas, el sheet y la vuelta del arrastre) y web-design-guidelines (autochequeo).
- **Sin migraciones ni cambios en `schema.prisma`, `packages/db`, `apps/bot` ni `messages.ts`** (T1, T3, T4).
  `primitives/sheet.tsx` tampoco cambia: Q4 (4.6) ya entró en 017d-1 (`aefe6da`) y acá se verificó en runtime.

### Commits

| Commit | Fase |
|---|---|
| `16f13aa` | 1 core: `PORTAL_DIARY_TEXT`, `DiaryDayGroup`, `groupDiaryByDay` + 7 tests |
| `89bfe1e` | 2 `lib/photo-resize.ts` y `lib/use-keyboard-inset.ts` + tests (10 y 4) |
| `87e6fac` | 3 `diario/actions.ts` + `actions.test.ts` (15 tests) |
| `150fca4` | 4 los 4 componentes, `page.tsx`, se borra `diary-form.tsx`, `PendingUnloadGuard` en el layout, link `?anotar=1` del inicio |
| `1b7fb4f` | R1: `comparative-chart.tsx` y `study-comparison-chart.tsx` con `isAnimationActive={false}` |
| `267d383` | Ajuste del runtime: la fila y el grupo que se funden al borrar quedan `inert` |
| (este) | 5 verificación: esta sección |


Entre la fase 3 y la 4 el `typecheck` de web no pasa (la página vieja usaba la firma vieja de
`deleteDiaryEntryAction`). Es el orden de fases de la SDD; desde la fase 4 todo compila.

### Contrato compartido

Las firmas coinciden con 4.1–4.7 de 017d-2: `PORTAL_DIARY_TEXT` (textos exactos), `DiaryDayGroup<T>`,
`groupDiaryByDay(entries, now, tz)`, `PHOTO_MAX_SIDE`, `PHOTO_MAX_BYTES`, `PHOTO_TARGET_BYTES`,
`PHOTO_ALLOWED_TYPES`, `fitWithin`, `canUploadAsIs`, `PHOTO_ATTEMPTS`, `ResizeResult`,
`resizePhotoForUpload`, `DiaryState`, `DiaryDeleteResult`, `addDiaryEntryAction(_prev, formData)`,
`deleteDiaryEntryAction(id)`, `DiaryEntryRow`, `DiaryGroupRow`, `DiaryScreen({ groups, openOnMount })`,
`DiaryEntrySheet({ open, onOpenChange })`, `DiaryList({ groups })`,
`DiaryPhotoSheet({ entryId, title, onOpenChange })`, `useKeyboardInset(enabled)`, `keyboardInsetFrom(innerHeight, vv)`.
Lo que se sumó en `diary-list.tsx` (`DIARY_TITLE_ID`, `diaryDeletionKey`, `visibleDiaryGroups`) son
exports nuevos que no cambian ninguna firma.

### Decisiones no obvias

- **El ejemplo de fechas de la SDD no coincide con el calendario.** El 7/10/2026 es miércoles y el 2/10/2026
  es **viernes** (la SDD dice "martes" y "Jueves 2 de octubre"). El test usa la fecha real: "Viernes 2 de
  octubre". "Jueves 2 de octubre de 2025" sí es correcto (otro año). La función no tiene nada hardcodeado.
- **`DiaryPhotoSheet.title`** es cuándo se anotó ("Hoy, 13:40"): va en `SheetDescription`, debajo del título fijo
  "Foto de la comida" (4.5 dice "título + hora").
- **Sin `SheetTrigger`:** "Anotar comida" es un `Button` con `onClick`. El foco vuelve igual al disparador porque
  el `Sheet` de 017a guarda el elemento con foco al abrir (`useOverlayOpenInfo`). Verificado en runtime: después
  de Esc, el foco está en "Anotar comida".
- **El `EmptyState` no repite el botón "Anotar comida":** el botón lleno de arriba siempre está visible, y dos
  botones iguales seguidos sobran. El escenario "Diario vacío" se cumple igual (texto + botón).
- **Doble submit:** además del `disabled` del botón, hay un ref `submitting`, y mientras guarda el sheet no se
  cierra (`requestOpenChange` lo ignora).
- **La foto que termina de prepararse después de cerrar el sheet se descarta** (contador de "generación").
  La foto se codifica sobre un fondo blanco, así un PNG transparente no queda negro en el JPEG.
- **Borrado idempotente:** "no existe" da `ok: true`, y también un `P2025` de Prisma (borrado entre el
  `findUnique` y el `delete`, p. ej. desde otra pestaña).
- **Filas y grupos que se van quedan `inert`** (`useIsPresent`). En el runtime, el segundo clic del doble toque
  caía en la fila que se estaba fundiendo y le sacaba el foco al título. Ahora no le llega. Si el segundo toque
  cae en una zona no enfocable, el foco puede ir al `body` (comportamiento del navegador), pero no hay un
  segundo toast ni un segundo borrado.
- **El grupo nuevo ("Hoy" cuando no había) entra con la transición:** el `AnimatePresence initial={false}` de
  afuera anima el `section` nuevo. Si solo se animara el `li`, el primer registro de un día nuevo aparecería de
  golpe, porque un `AnimatePresence` recién montado con `initial={false}` no anima a sus primeros hijos.
  `layout="position"` evita que el texto se deforme cuando se corren las filas.
- **T9:** (a) la página le pasa a `DiaryScreen` solo strings y booleanos, y los íconos se importan en el cliente;
  (b) `?anotar=1` se limpia con `replaceUrlInRouter` (`replaceState(null, …)`); (c) `actions.ts` exporta solo
  dos funciones async y dos `export type` propios; (d) la key es `diary:<id>`; (e) los ids son fijos con
  prefijo `portal-` (`portal-diary-title`, `portal-diary-note-error`) o `diario-dia-<dayKey>`; (f) los grupos y
  la hora se calculan en el servidor con `pro.timezone`.

### Verificación

| Comando | Resultado |
|---|---|
| `npm run typecheck` | core, db, bot y web en verde |
| `npm run test` | 132 archivos, **2139 tests** OK (36 nuevos: core 7, photo-resize 10, keyboard-inset 4, actions 15) |
| `npm run lint --workspace apps/web` | "No ESLint warnings or errors" |
| `./ops/harness/verify.sh` | "Arnés OK" (el WARN del bot es porque cambió core; `apps/bot/**` sin diff) |
| `next build` (webpack, copia en el scratchpad) | exit 0. Solo el warning de `jose`/Edge Runtime, que ya estaba |
| `next build --turbopack` (misma copia) | "Compiled successfully", exit 0. Con `node_modules` como symlink Turbopack falla ("points out of the filesystem root"), así que la copia lleva `node_modules` clonados (`cp -c`) |

**Runtime:** `next start -p 3198` + Chromium headless (playwright-core, 390×844 táctil y 1366×768), **sobre los dos
builds: 49/49 chequeos OK en cada uno.** El dev server de :3100 no se tocó (sigue respondiendo 200).
- Inicio: el botón "Anotar comida" tiene `href="/portal/diario?anotar=1"`. Al entrar, el sheet está abierto, la URL
  queda en `/portal/diario` y `history.length` crece solo por la navegación (3→4, sin entrada extra).
- Sheet: agarre visible y campo a **17 px**. Hay dos botones, "Sacar foto" (con un input `capture="environment"`)
  y "Elegir de la galería". Guardar sin nada → "Escribí qué comiste o agregá una foto." y el sheet sigue abierto.
- Foto **JPEG de 5,21 MB y 4032×3024** (generada en el scratchpad) → miniatura y "Quitar foto". En la base quedó con
  **697 456 bytes, `image/jpeg`** y 1600 px de ancho.
- Offline (`context.setOffline(true)`) → "No se pudo guardar. Probá de nuevo.", y el texto y la miniatura siguen
  ahí. No se ve el error boundary.
- Tocar afuera con texto → "¿Descartar lo que anotaste?" → "Seguir anotando" → el sheet sigue con el texto.
- **Arrastre desde el agarre con texto (Q4):** el panel sigue al dedo (y de 410 a 830). Al soltar aparece la
  pregunta. Con "Seguir anotando", **el panel vuelve exactamente arriba** (y = 410,0).
- Guardar → "Guardando…" con el botón deshabilitado → toast "¡Listo! Ya lo anotaste." → el sheet se cierra → el
  registro aparece bajo "Hoy". Entra con transición: un `MutationObserver` lo vio con opacidad inicial 0.
- Grupos: "Hoy", "Ayer" y "Miércoles 30 de septiembre". La hora va en formato `H:mm`.
- Miniatura → sheet "Foto de la comida", con la descripción "Hoy, 1:34" y la imagen cargada (`naturalWidth` 1600).
  Se cierra con la X.
- **Borrar con doble toque → la fila sale al instante y aparece un solo toast "Borraste el registro."** Durante
  el plazo la base sigue teniendo la fila (count 1). "Deshacer" → "Listo, el registro volvió.", la fila vuelve y la
  base sigue con 1.
- Con un borrado pendiente, recargar → diálogo `beforeunload` (aceptado). Después de recargar, el registro sigue en
  la base y en la lista: si se recarga, no se borra nada.
- Un toque en "Borrar" → el foco va a "Tu diario" (`portal-diary-title`). Al vencer el plazo (8 s) → count 0, y la
  fila no vuelve.
- El HTML de `/portal/diario` pesa **32 KB** y no tiene bytes de fotos (no aparece `/9j/`).
- A 1366 px: el sheet entra desde la derecha (448 px de ancho, alto completo), con un solo botón "Elegir foto" y el
  foco en el campo. Esc sin texto lo cierra sin preguntar, y el foco vuelve a "Anotar comida".
- La consola no muestra errores ni avisos de hidratación. Lo único es un 404 de `/favicon.ico`, que ya estaba y no
  es de esta HU. En el log del servidor (los dos builds) no aparecen "cannot be passed", "Functions cannot be
  passed" ni errores.
- **No se probó en runtime:** R1, porque los gráficos del panel están detrás de Google. Es el mismo cambio de una
  prop que `9831216`. Tampoco se probaron la cámara real, el teclado de iOS (Q5) ni el movimiento reducido del
  sheet: quedan para el recorrido en Safari o en el simulador contra `next dev` (Q13).

### Datos de prueba (creados y borrados por id)

- El bot estaba apagado: `ps` no mostró ningún proceso de `apps/bot`.
- Conteos de antes, `Patient|Appointment|EvolutionEntry|DiaryEntry|OutboundMessage`: `21|22|17|2|12`.
- Se creó la paciente `hu017d2-paciente`, con el JID inventado `5493510017402@s.whatsapp.net` y el nombre "Prueba
  Diario 017d". También se crearon `hu017d2-diario-ayer` y `hu017d2-diario-viejo`.
- La UI creó 5 `DiaryEntry`, una por corrida: `cmuuraahr000163dm4wjcib5k`, `cmuurd2ca0001yraap9hx1agg`,
  `cmuurdtdx0003yraavgc7q3lr`, `cmuurelt20005yraas4tn0weg` y `cmuurhdvw00017qo0ixeu7vt0`. Cada corrida borró la
  suya con el flujo de Deshacer vencido.
- Limpieza, solo por esos ids: 2 `DiaryEntry` (las de la UI ya no estaban) y 1 paciente. No se tocaron las
  `DiaryEntry` de pacientes reales.
- Conteos de después: `21|22|17|2|12`, iguales a los de antes.
- El token estuvo solo en un archivo del scratchpad, que ya se borró. También se borraron la copia del build,
  `playwright-core` y la foto de 5 MB. El `next start` de :3198 está apagado.

### Para el orquestador / recorrido

- Queda en el scratchpad de la sesión la captura `diario-1366.png`, junto con los logs `run-webpack.txt` y `run-turbo.txt`.
- Para el recorrido en iPhone o en el simulador (`next dev`, Q13):
  - "Guardar" tiene que quedar visible con el teclado abierto (Q5).
  - Probar la cámara y la galería, incluida una foto HEIC.
  - Revisar el movimiento reducido: solo fundido.
  - D19 (3).

---

## 017d-3: plan (con el merge de 018d)

- **Estado:** done
- **Rama:** `feat/hu-017d3-plan`. Arranca del merge de `feat/hu-018d-medidas-caseras` (`03cd797`), que hizo el
  orquestador (Q16). Antes de cambiar nada verifiqué el merge: `typecheck` de los 4 workspaces en verde, `test`
  149 archivos y 2357 tests en verde, y `migrate status` → "Database schema is up to date!" (24 migraciones).
- **Modelo:** Opus. Skills: apple-design (fila con press en pointer-down, sheet con agarre y encabezado
  arrastrable), mblode-agent-skills-ui-animation (fundido de 150 ms solo con `opacity`, sin animación al montar),
  web-design-guidelines (autochequeo, ver abajo) y ui-ux-pro-max (criterios de jerarquía y objetivos táctiles).
- **Sin migraciones ni cambios en `schema.prisma`, `packages/*`, `apps/bot` ni la zona de imleticio.** El PDF
  (`lib/plan-pdf.tsx`, `/portal/plan/pdf`) no se tocó: D16 es solo el botón.

### Commits

| Commit | Fase |
|---|---|
| `a7f8f69` | 1: `DaySelector.today?` + `day-selector.test.tsx` |
| `d0a0549` | 2: `page.tsx`, `plan-view.tsx`, `portal-day-view.tsx`, `portal-recipe-sheet.tsx` + `portal-day-view.test.tsx` |
| `64da48e` | 2 (arreglo que encontró el runtime): la X y el agarre del sheet de receta quedan arriba del encabezado sticky |
| (este) | 3: este archivo |

### Archivos tocados (`git diff 03cd797 --name-only`, igual a la tabla 7.2)

- `apps/web/src/components/weekly-menu/day-selector.tsx` (`today?`) y `day-selector.test.tsx` (nuevo, 3 tests)
- `apps/web/src/app/(portal)/portal/plan/page.tsx`: deja de mandar `totals` y `dayTotals` (Q10). Sin plan →
  "Todavía no tenés un plan.". La consulta, `RECIPE_ITEM_SELECT`, `listPlanRecipePreviews`, `toPortalRecipeMap`
  y `portalMealsForClient` siguen como vienen de 018d.
- `plan-view.tsx`, `portal-day-view.tsx`, `portal-recipe-sheet.tsx` y `portal-day-view.test.tsx` (nuevo, 8 tests)
- `git diff 03cd797 -- apps/web/src/components/macro-totals.tsx` → vacío. Tampoco hay diff en `apps/bot`,
  `packages/` ni la zona de imleticio (T6).

### Contrato compartido

Las firmas coinciden con la SDD 4-3: `DaySelector` `today?: Weekday` (opcional; el editor no lo pasa y el HTML sin
`today` es idéntico: snapshot inline grabado **antes** del cambio), `PortalPlanView({ title, notes, meals, hasPdf,
weekly?: { today; loadedDays } | null, recipes? })` sin `totals`, `PortalMealItems({ items, recipes? })`,
`PortalMealCard({ meal, items, recipes? })`, `PortalDayView({ meals, today, loadedDays, recipes? })` sin
`dayTotals`, y `PortalRecipeSheet({ recipe, trigger: React.ReactElement })`. El servidor no le pasa funciones ni
componentes a un cliente (T9a): `trigger` es un elemento que arma `PortalMealItems` (que ya es cliente) y `page.tsx`
solo pasa datos planos.

### Decisiones no obvias

- **El fundido no corre en la primera pintada.** La SDD dice `<m.div key={day} initial={{ opacity: 0 }} …>`. Si
  fuera literal, el HTML del servidor llegaría con `opacity: 0` y las comidas no se verían hasta hidratar. Por eso
  `initial` es `false` hasta que la paciente cambia de día, y desde ahí `{ opacity: 0 }` con `fades.fast`. En el
  runtime, al tocar el martes la opacidad arranca en 0 y a los 400 ms está en 1. Con movimiento reducido,
  `MotionConfig reducedMotion="user"` deja el fundido (es solo opacidad).
- **La X y el agarre del sheet quedaban tapados** por el encabezado `material-bar sticky top-0 z-10`. Venía así
  de 018c-2. Playwright no podía tocar la X ("intercepts pointer events") y en la captura no se veía el agarre.
  Lo arreglé sin cambiar la API de `Sheet`, con `[&>button]:z-20 [&>[aria-hidden=true]]:z-20` en el `SheetContent`
  del portal: la X es el único botón hijo directo del panel y el agarre es el único hijo directo `aria-hidden`.
  **El mismo encabezado está en `components/recipe-picker/recipe-picker-sheet.tsx:249` (panel, 018c)**. Ahí no
  lo toqué porque está fuera de este alcance: hay que mirarlo.
- **La X se va con el scroll.** El botón es `absolute` dentro del panel que scrollea (así es el primitivo), y con
  una receta larga sale de la vista. Igual se puede cerrar con el agarre o el encabezado (los dos arrastran),
  tocando afuera o con Esc. No lo cambié porque es del primitivo.
- **Porción de la receta:** la HU dice "1 porción: ¾ albóndigas", pero `recipePortionText` (018, no se toca por
  D14) devuelve "1 porción (¾ albóndigas)". El test usa el texto real.
- **Alimento en gramos:** el número va en el color del texto y la "g" en gris (lo hace `Quantity`). Antes el
  número también iba en gris. La SDD pide `className="text-body-lg"` y no pide el gris, así que queda así.
- **Encabezados:** en la vista por día, h1 (plan), h2 (día) y h3 (comida). En el plan no semanal, para no saltar
  del h1 al h3, agregué un h2 `sr-only` "Comidas del plan" con id fijo `portal-plan-meals` (T9e).
- **Receta sin detalle:** la fila se muestra con miniatura, nombre y porción, pero no es botón ni dice "Ver
  receta" (lo prueba un test).
- **Autochequeo web-design-guidelines:** foco visible en la fila (`outline-ring`), `alt=""` en la miniatura
  decorativa, `aria-hidden` en el chevron, `break-words` y `min-w-0` en los nombres, la cantidad con `shrink-0` y
  hover solo con puntero fino (`hoverOnlyWhenSupported`). El día elegido no va en la URL, igual que en 018b, y
  queda fuera del alcance.

### Verificación

| Comando | Resultado |
|---|---|
| `npm run typecheck` (core, db, bot, web) | exit 0 |
| `npm run test` | 151 archivos, 2368 tests, exit 0 (+11 tests de 017d-3) |
| `npm run lint --workspace apps/web` | "No ESLint warnings or errors" |
| `./ops/harness/verify.sh` | "Arnés OK". Avisa que "Se tocó el bot", pero el aviso compara contra `develop` (trae 017d-1/2 y 018): en `git diff 03cd797` no hay nada de `apps/bot` |
| `npm run test:recipe-picker --workspace packages/db` | "OK: flujo de ítems de receta (018c)". Conteos antes y después iguales: `{ recipes: 9, planItems: 128, templateItems: 0, plans: 11 }` |
| `npm run test:food-measures --workspace packages/db` | exit 0. Conteos antes y después iguales (`foods 980, measures 0, planItems 128, plans 11, patients 21`) |
| `next build` (webpack, copia en el scratchpad con `db:generate`) | exit 0. `/portal/plan` pesa 9,69 kB |
| `next build --turbopack` (la misma copia) | "Compiled successfully", exit 0 |

**Runtime:** `next start -p 3197` sobre los dos builds y Chromium headless (playwright-core en el scratchpad),
a 390×844 táctil y a 1366×768. El dev server de :3100 no se tocó: sigue vivo (responde 307).
- `/portal/plan` responde 200, sin error boundary ("Algo salió mal" no aparece).
- En el DOM no aparecen "kcal", "Proteínas", "Carbohidratos", "Grasas", "Fibra", "Energía" ni "Total del".
  Tampoco hay "kcal" en el HTML fuera de los `<script>`.
- **Q11:** el payload RSC trae "kcal" 22 veces, porque los ítems de alimento siguen trayendo `macros`
  (`portalMealsForClient` solo limpia las recetas). No se muestra. Hay que anotarlo en el PR para 018.
- Título y notas del plan. "Descargar plan (PDF)" `tinted` (`bg-primary-soft`), de 44 px de alto y 358 px de
  ancho. `GET /portal/plan/pdf` → 200 `application/pdf`.
- Hoy era lunes (America/Argentina): el radio "Lunes, hoy" está elegido y dice "Hoy". Debajo, el h2 "Lunes".
- Almuerzo: "Arroz blanco cocido · 1½ tazas · 270 g" y "Queso cremoso · 2 cucharadas soperas · 30 g". En las
  filas de alimento la cantidad no se sale de la fila.
- Colación (EVERY_DAY, opciones): "Todos los días" en texto, "Elegí una de estas opciones" y "37,5 g".
- **Receta:** la fila es un `<button>` de 82 px de alto. Tocar el nombre (no solo "Ver receta") abre el sheet
  **inferior** (de y = 328 a 844, a todo el ancho), con agarre, `theme-portal`, el título de la receta y sin
  kcal ni macros.
  - Se cierra con Esc, y el foco vuelve a la fila.
  - Se cierra con la X (después del arreglo: `elementFromPoint` sobre la X da el botón "Cerrar").
  - Se cierra arrastrando el encabezado hacia abajo (touch por CDP).
- A 1366 px el sheet entra **desde la derecha** (512 px de ancho, alto completo) y se cierra con Esc.
- Martes: al tocarlo, la opacidad arranca en 0 y termina en 1 (fundido), y se ve "120 g".
- **Día vacío:** con la colación de prueba pasada a PER_DAY (solo el lunes), el jueves muestra "El jueves no
  tiene comidas cargadas. Mirá otro día o preguntale a tu nutricionista.". Con la colación EVERY_DAY el jueves
  la muestra, como corresponde.
- Consola: sin errores de hidratación ni de página. Lo único es el 404 de `/favicon.ico`, que ya estaba. En los
  logs de `next start` de los dos builds no aparece "cannot be passed" ni ningún error.
- Capturas en el scratchpad de la sesión: `plan-390.png`, `receta-390.png` y `receta-1366.png`.

### Datos de prueba (creados y borrados por id)

- El bot estaba apagado: `ps` no mostró ningún proceso de `apps/bot`.
- Conteos de antes (`patients|plans|meals|items|recipes|foods|outbound`): `21|11|40|128|9|980|12`.
- Se creó la paciente "Prueba Plan 017d" (`cmuusc6xd0000orstg3lj9stx`, JID inventado `5490000017303@s.whatsapp.net`).
  También se creó el plan ACTIVE semanal `cmuusc6xg0002orstx507kbdq`, con un PDF falso de 50 bytes.
  - Comidas: `cmuusc6xk0004orstmssjnjqs` (Almuerzo, PER_DAY) y `cmuusc6xm0006orstm8smeb4p` (Colación).
  - 6 ítems: `cmuusc6xn0008orsto805y0px`, `cmuusc6xr000aorstho2f1u3g`, `cmuusc6xs000corst9tvjbbe7`,
    `cmuusc6xt000eorstljapxb7t`, `cmuusc6xu000gorstw9uxjey0` y `cmuusc6xw000iorsti4a53rqf`.
  - Los ítems referencian, **solo para leerlos**, la receta publicada `cmusa9qn7000c79pwi9vntpeh` y los alimentos
    `cmtynk2e800001y4zkerocwsl` y `cmtynk2e8000d1y4z5sae50xr`.
- El token se guardó solo en un archivo del scratchpad, que ya se borró.
- Limpieza, solo por esos ids: ítems → comidas → plan → paciente. Conteos de después: `21|11|40|128|9|980|12`,
  iguales a los de antes. No hubo filas en `OutboundMessage`.
- También se borraron el script temporal (`packages/db/scripts/.tmp-017d3.ts`), la copia del build y
  `playwright-core`. El `next start` de :3197 está apagado.

### Para el orquestador / recorrido / PR

- Recorrido en el celular (`next dev`, Q13): D19 (2), "decir qué come hoy en el almuerzo". También probar el
  arrastre real del sheet de receta y una receta con "Fuente: …": la de dev no tiene fuente, así que esa línea
  solo la cubre el test.
- PR: avisarle a imleticio que se tocó la presentación del plan en el portal y `DaySelector` (`today?`), y
  pasarle Q11 (las `macros` de los ítems de alimento siguen en el payload). Avisarle también que el encabezado
  sticky de `recipe-picker-sheet.tsx` probablemente tape la X igual que tapaba la del portal.
