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
