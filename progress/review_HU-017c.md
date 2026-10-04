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
