# impl HU-016 — matrícula y firma

Estado: **done**

## Paso 0: rama al día

- `git fetch origin`. La rama tenía un commit propio (`f335455`, HU + SDD del orquestador, **no
  pusheado**), así que `git merge --ff-only origin/develop` no era posible. Como ese commit solo toca
  `Refactorizaciones/`, `docs/`, `backlog/HU-016.json` y `progress/current-senkuch4n.md` (ninguno
  cambia en `origin/develop`), se hizo `git rebase origin/develop`: limpio, sin conflictos. El commit
  quedó como `9b0bd9b` encima de `5d5ddc1`. No se creó ningún commit nuevo.
- `git diff --name-only HEAD origin/develop -- packages/db/prisma`: vacío. Última migración:
  `20261003023029_service_reminders`. `prisma migrate status`: "Database schema is up to date!".
- `package-lock.json` sin cambios → sin `npm ci`. `npm run db:generate` OK.
- Línea de base: `npm run typecheck` verde en core, db, bot y web; `npm run test`: **55 archivos,
  1162 tests** verdes (develop sumó tests respecto de los 1124 que menciona el pedido).
- Snapshot de la base (conteo + md5 por tabla) guardado en el scratchpad para comparar al final.

## Paso 1: esquema y migración (skill `migracion-prisma`)

- Respaldo: `~/nutribot-backups/pre-hu016-202610030117.dump` (288.531 bytes, `pg_dump -Fc`).
- `schema.prisma`: `signatureData Bytes?` y `signatureMimeType String?` en `Professional` (4.1).
- `npx dotenv -e ../../.env -- prisma migrate dev --create-only --name professional_signature`
  corrió en modo no interactivo (stdin `/dev/null`) → `20261003041739_professional_signature`.
- SQL generado, idéntico a 4.2:
  ```sql
  -- AlterTable
  ALTER TABLE "Professional" ADD COLUMN     "signatureData" BYTEA,
  ADD COLUMN     "signatureMimeType" TEXT;
  ```
- Prueba en transacción revertida (`BEGIN; ALTER …; ROLLBACK;`): OK.
- `npm run db:migrate`: aplicada, "Your database is now in sync with your schema." Sin drift ni
  oferta de reset. `npm run db:generate` OK. `prisma migrate status`: "Database schema is up to date!".
- Fila `Professional` id=1 intacta (name "Nutricionista", title/licenseNumber/logo null,
  `updatedAt` 2026-10-01 18:08:25.267), columnas nuevas en NULL.

## Paso 2: `packages/core`

- **Nuevo** `packages/core/src/professional-identity.ts`: contrato 5.1 tal cual
  (`ProfessionalIdentity`, `professionalDisplayName`, `professionalSignature`,
  `professionalSignatureLines`, `SIGNATURE_IMAGE_MAX_BYTES`, `SignatureImageMime`,
  `detectSignatureImageMime`, `validateSignatureImage`, `signatureImageSizeError`,
  `professionalDataMissingNotice`, `PROFESSIONAL_TEXT` con los textos de 8.4).
  **Agregados por la sección 16 (P4, logo):** `LOGO_IMAGE_MAX_BYTES` (2 MB, el tope que el logo ya
  tenía), `PdfImageMime`, `isPdfDrawableImageMime`, `validateLogoImage`, `logoImageSizeError`,
  `professionalLogoNotice` y textos `logoDescription`, `logoLimits`, `logoTooLarge`,
  `logoUnsupportedFormat`. Firma y logo comparten un único helper interno (`validatePdfImage`:
  vacío → tamaño → magic bytes); solo cambia el tope.
- `isak-report.ts`: se borró la definición de `professionalSignature` y quedó
  `export { professionalSignature } from "./professional-identity";`. Se borró `licenseMissing` de
  `ISAK_REPORT_TEXT` (`goToSettings` queda).
- `index.ts`: `export * from "./professional-identity";` (una línea).
- **Nuevo** `professional-identity.test.ts` (9.1 + logo). `isak-report.test.ts` sin cambios.
- `npx vitest run packages/core`: 37 archivos, 985 tests verdes. `tsc` de core OK.

## Paso 3: `packages/db/domain`

- **Nuevo** `professionalSelect.ts` (`PROFESSIONAL_SELECT`, lista exacta de 5.2) y
  `export * from "./professionalSelect";` en `domain/index.ts`.
- `availability.ts`: `select: PROFESSIONAL_SELECT` en `getProfessional()` y en el
  `findUniqueOrThrow` de `checkSlotAvailable`. `payments.ts`: idem en `syncMercadoPagoPayment`.
  Sin otros cambios.
- `professionalAssets.ts`: `ProfessionalImage`, `getProfessionalSignatureImage`,
  `updateProfessionalSignature`, `removeProfessionalSignature`, `getProfessionalPdfAssets` (firmas
  de 5.2). Las funciones del logo quedan igual.
- **Nuevos tests:** `professionalSelect.test.ts` (sin bytes; cubre todas las escalares vía
  `Prisma.dmmf`; `getProfessional` con el select y el error de siempre), `professionalAssets.test.ts`
  (8 tests), `signature-privacy.test.ts` (`datos_consultorio` no devuelve `FIRMA-SECRETA-XYZ`, su
  base64 ni el MIME). `appointments-booking.test.ts` y `payments.test.ts` verdes **sin cambios**.
- `npx vitest run packages/db`: 12 archivos, 138 tests verdes.
- Typecheck: core, db y **bot** verdes; web falla solo en `report-editor.tsx` por
  `T.licenseMissing` (esperado, se arregla en el paso 5).
- Revisión de consumidores: ningún `console.*`/logger imprime `pro`; nadie usa `logoData` desde
  `getProfessional()`. Las demás lecturas de `Professional` en web ya usan `select` acotado.

## Paso 4: `apps/web`, piezas compartidas

- `lib/pdf-common.tsx` (aditivo): `PdfImage`, `pdfImageSrc`, `pdfLogoSrc = pdfImageSrc`
  (compatibilidad, `plan-pdf.tsx` sin tocar), `PdfSignatureInput`, `PdfSignatureBlock` con los
  estilos de 5.3 y `wrap={false}`.
- **Nuevo** `lib/professional-pdf.ts` (`server-only`): `ProfessionalPdfBranding` y
  `loadProfessionalPdfBranding()` (5.4). **Decisión (sección 16, P4):** si la imagen guardada no es
  PNG/JPG (`isPdfDrawableImageMime`), se pasa `null` al PDF: un logo WEBP viejo deja de llegar a
  react-pdf (antes react-pdf lo omitía con un error en consola); el resultado visible es el mismo
  ("sale sin logo como hoy").
- **Nuevo** `app/api/professional/signature/route.ts` (`force-dynamic`; 401/404 con `no-store`; 200
  con `Content-Type` guardado, `Cache-Control: private, no-store`, `X-Content-Type-Options: nosniff`).
  **Nuevo** `route.test.ts` (5 casos). `middleware.test.ts`: suma `/api/professional/signature` y
  `/api/professional/logo` al `it.each` de rutas protegidas (una línea).
- Tests: 2 archivos, 13 tests verdes.

## Paso 5: `apps/web`, informe

- `lib/anthropometric-report-pdf.tsx`: `ReportPdfInput.signatureBlock: PdfSignatureInput`
  (requerido); `<PdfSignatureBlock signature={input.signatureBlock} />` después del texto de
  Conclusiones, dentro de `styles.content`. Encabezado, `author` y pie sin cambio de código.
- `pacientes/[id]/report-actions.ts`: la consulta `logoRow` se reemplazó por
  `loadProfessionalPdfBranding()` (7.2). Se quitaron los imports de `prisma` y
  `professionalSignature`. `pdfSourceKey` sin cambios (D9).
- `informe/page.tsx`: `professionalNotice={professionalDataMissingNotice({ licenseMissing:
  !ctx.pro.licenseNumber?.trim(), signatureMissing: !ctx.pro.signatureMimeType })}`.
  `report-editor.tsx`: prop `licenseMissing: boolean` → `professionalNotice: string | null`; el
  mismo `Alert tone="warning"` con el texto del aviso y el mismo botón "Ir a Ajustes". Nada más.
- **Nuevo** `lib/anthropometric-report-pdf.test.tsx` (8 tests): `wrap === false`; `/Subtype /Image`
  con imagen y sin ella; sin matrícula; informe completo con/sin firma; PNG corrupto (react-pdf
  loguea "Incomplete or corrupt PNG file" y el PDF sale igual); conclusiones largas. PNG de prueba
  generado con `zlib` en el test (sin binarios en el repo). Escribe PDF solo con `HU016_PDF_DIR`.
- **Revisión visual** (render a PDF en el scratchpad, rasterizado con `pdftoppm`; corrido desde
  `apps/web` para que use Inter como en producción — desde la raíz cae a Helvetica por
  `process.cwd()`):
  - Encabezado "Lic. Daiana Ponce" arriba a la derecha.
  - Después de Conclusiones, bloque alineado a la derecha: firma (600×200 escalada a ≤ 45 pt de
    alto, proporción ok), línea, "Lic. Daiana Ponce" / "M.P. 852" centrados en dos líneas.
  - Sin firma: solo línea + aclaración, sin hueco arriba. Sin matrícula: una sola línea de
    aclaración y pie "Lic. Daiana Ponce".
  - Conclusiones largas (10 párrafos): la página 4 termina con el párrafo 10 y el bloque **entero**
    (imagen + línea + aclaración) pasa a la página 5. Pie "Lic. Daiana Ponce · M.P. 852" y
    "Página n de 5" en todas.
- `npm run typecheck --workspace apps/web`: verde.

## Paso 6: `apps/web`, `/ajustes`

- **Nuevo** `ajustes/signature-actions.ts` (`"use server"`): `uploadSignatureAction` y
  `removeSignatureAction` con el orden de 5.5 (auth → archivo → pre-chequeo de tamaño sin
  `arrayBuffer()` → magic bytes → `updateProfessionalSignature` → `revalidatePath`). Los `catch`
  loguean solo `err.code`/`err.name` (`errorCode`), nunca el error ni el mensaje.
- **Nuevo** `ajustes/signature-actions.test.ts` (10 tests, 9.3 completo, incluido el spy de
  `console.error` con un error cuyo `message` trae el base64 y `meta` trae el `Buffer`).
- **Nuevo** `ajustes/signature-form.tsx` (8.1): vista previa por `/api/professional/signature?v=<updatedAt>`,
  recuadro "Sin firma" con ícono `Signature` (`aria-hidden`), "No se pudo cargar la vista previa" en
  `onError`, form `onSubmit` + `startTransition` con pre-chequeo de tamaño en el cliente, "Quitar"
  con `await confirm(...)` **antes** de `startTransition` y fuera de `<form action>`, `FormError`,
  vista previa del bloque con valores guardados. Toasts "Firma actualizada" / "Firma quitada".
  Decisiones: el `reset()` del form se hace dentro del wrapper de la action cuando vuelve `ok`
  (equivalente a "con `state.ok` → `formRef.current?.reset()`" sin un efecto extra); cada botón queda
  `disabled` mientras corre el otro; `aria-describedby` del input apunta al error; `break-words` en la
  aclaración (autochequeo `web-design-guidelines`).
- `settings-form.tsx`: `SettingsSignatureFields` sin `signaturePreview` ni el `<p>` "Pie del
  informe"; JSDoc actualizado. Campos y `SettingsSubmit` iguales.
- `page.tsx`: tarjeta **"Firma y matrícula"** con `PROFESSIONAL_TEXT.cardDescription` (P2),
  `SettingsSignatureFields` → `Separator` → `SignatureForm`. Tarjeta "Logo" con el texto nuevo.
- **Logo (sección 16, P4):**
  - `ajustes/actions.ts` (`uploadLogoAction`, único cambio en ese archivo): sin lista de MIME del
    navegador; `logoImageSizeError` (pre-chequeo, 2 MB) → `validateLogoImage` (mismo helper que la
    firma, magic bytes) → guarda el MIME **detectado**, con `select: { id: true }`. WEBP ya no entra.
    `removeLogoAction` sin cambios.
  - `logo-form.tsx`: `accept="image/png,image/jpeg"`, texto "PNG o JPG, hasta 2 MB." y prop
    `unsupportedNotice` → `Alert tone="warning"` "Tu logo está en un formato que no sale en los PDF.
    Volvé a subirlo en PNG o JPG." `page.tsx` lo calcula con `professionalLogoNotice(pro.logoMimeType)`
    solo si hay `logoData`. El logo existente **no** se borra ni se convierte.
  - En los PDF, `loadProfessionalPdfBranding` manda `logo: null` si el MIME no es PNG/JPG.
  - **Decisión:** el tope del logo sigue en **2 MB** (el que ya tenía); "misma validación" se aplicó
    como mismo helper y mismas reglas (vacío → tamaño → magic bytes), sin achicar el límite a 1 MB
    para no rechazar logos que hoy son válidos. Si se quiere 1 MB, es cambiar `LOGO_IMAGE_MAX_BYTES`.
  - **Nuevo** `ajustes/logo-actions.test.ts` (6 tests: WEBP real, WEBP renombrado a .png, vacío,
    > 2 MB, PNG declarado JPEG → guarda `image/png`, JPEG ok). El aviso se testea en
    `professional-identity.test.ts` (`professionalLogoNotice`).
- No se abrió `/ajustes` en el navegador (el recorrido visual lo hace el orquestador); no se guardó
  nada desde la UI.

## Paso 7: portal

- `lib/shell.ts`: **nueva** `getProfessionalPortalName()` (select `{ name, title }` →
  `professionalDisplayName`; nombre vacío o error → `null`). `getProfessionalDisplayName()` intacta.
- `(portal)/layout.tsx`: usa `getProfessionalPortalName()` en los dos `Wordmark subtitle`.
- `(portal)/portal/page.tsx`: "Este es tu espacio con {professionalSignature(...)}.". Ningún `<img>`
  ni link a la firma en `(portal)/**`.

## Paso 8: verificación final (sección 10 + pedido del orquestador)

| Chequeo | Resultado |
|---|---|
| `prisma migrate status` | "Database schema is up to date!" (21 migraciones) |
| `npm run db:generate` | OK |
| `npm run typecheck` | core, db, **bot** y **web** limpios |
| `npm run test` | **63 archivos, 1249 tests** verdes (línea de base 55/1162; +8 archivos, +87 tests; los existentes siguen verdes, `isak-report.test.ts` sin cambios) |
| `npm run lint --workspace apps/web` | 1 warning **preexistente** (`logo-form.tsx`: el ícono lucide `Image` dispara `jsx-a11y/alt-text`; ya estaba en HEAD). Sin warnings nuevos |
| `test:service-reminders` | 17 OK, 0 con error |
| `test:confirm-flow` | 8/8 OK |
| `test:booking-reason` | 16/17. **Falla el 14** ("Seña (dominio)": `SlotUnavailableError`). **Preexistente y ajeno a la HU**: falla igual con el `availability.ts` original de HEAD (lo cambié de forma temporal, corrí el script y lo restauré). Elige el último horario libre de un servicio y reserva otro servicio con seña en ese horario; depende de la hora/día. Datos de prueba borrados por id |
| `test:bot-ai` | 18/18 OK, datos borrados por id |
| `test:after-hours` | 12/12 OK, datos borrados por id |
| Grep 10.5 (`signatureData`/`api/professional/signature` en `apps/bot` y `(portal)`; `public/` con firma) | vacíos |
| Diff 10.6 contra `origin/develop` (zona HU-015 / PR #7, más `brand.tsx`, `middleware.ts`, `auth.config.ts`) | vacío (solo aparece `backlog/HU-016.json`, que viene del commit del orquestador) |
| Curl 10.7 (panel levantado un momento con `npm run dev`, sin bot, después detenido) | sin sesión: `307 → /inicio?callbackUrl=…`; con cookie `patient_session=fake`: `307` igual. Nunca 200 |
| Portal sin sesión (`/portal`) | 200, subtítulo "Nutricionista" (la fila real no tiene título) |
| `./ops/harness/verify.sh` | "Arnés OK." Avisos manuales: migración nueva (SQL revisado arriba) y "se tocó el bot" (cambió `packages/db`; no hubo WhatsApp y `OutboundMessage` quedó igual) |
| Render del informe con firma de prueba | ver paso 5 (PDF en el scratchpad, revisados a ojo) |

### Base de desarrollo antes/después

Conteo + md5 por tabla: **las 25 tablas idénticas** (incluidas `OutboundMessage` 6, `Appointment`
18, `Patient` 14, `AnthropometricReport` 2, `Payment` 3, `ConversationState` 7). La única
diferencia es el md5 de fila completa de `Professional`, porque la fila ahora tiene las 2 columnas
nuevas en NULL; el md5 de esa fila **sin** las columnas nuevas, en el orden de la tabla, da
`aeb101668228bb094fd6893ae6ed13ff`, igual al de antes. No se escribió en `Professional` ni se
generó/envió ningún informe desde la UI. No se corrió `db:seed`/`seed:demo`. No se arrancó el bot.

### Contrato compartido (sección 5)

Las firmas coinciden con la SDD: `professional-identity.ts` (5.1), `PROFESSIONAL_SELECT` y las 4
funciones de `professionalAssets.ts` (5.2), `PdfImage`/`pdfImageSrc`/`pdfLogoSrc`/`PdfSignatureInput`/
`PdfSignatureBlock` (5.3), `ProfessionalPdfBranding`/`loadProfessionalPdfBranding` (5.4),
`uploadSignatureAction`/`removeSignatureAction` y `GET` de la ruta (5.5),
`getProfessionalPortalName` (5.6). Agregados (no reemplazan nada del contrato), por la sección 16:
`LOGO_IMAGE_MAX_BYTES`, `PdfImageMime`, `isPdfDrawableImageMime`, `validateLogoImage`,
`logoImageSizeError`, `professionalLogoNotice` y 4 claves de texto del logo en `PROFESSIONAL_TEXT`
(las del aviso del informe se llaman `noticeLicense`/`noticeSignature`/`noticeBoth`).

### Archivos

- Editados: `packages/db/prisma/schema.prisma`; `packages/db/domain/{availability,payments,professionalAssets,index}.ts`;
  `packages/core/src/{isak-report,index}.ts`; `apps/web/src/lib/{pdf-common.tsx,anthropometric-report-pdf.tsx,shell.ts}`;
  `apps/web/src/app/(panel)/pacientes/[id]/report-actions.ts`; `…/antropometria/informe/{page,report-editor}.tsx`;
  `apps/web/src/app/(panel)/ajustes/{page,settings-form,logo-form}.tsx`, `ajustes/actions.ts` (solo `uploadLogoAction`, P4);
  `apps/web/src/middleware.test.ts`; `apps/web/src/app/(portal)/layout.tsx`, `(portal)/portal/page.tsx`.
- Creados: `packages/db/prisma/migrations/20261003041739_professional_signature/migration.sql`;
  `packages/db/domain/{professionalSelect.ts,professionalSelect.test.ts,professionalAssets.test.ts,signature-privacy.test.ts}`;
  `packages/core/src/{professional-identity.ts,professional-identity.test.ts}`;
  `apps/web/src/lib/{professional-pdf.ts,anthropometric-report-pdf.test.tsx}`;
  `apps/web/src/app/(panel)/ajustes/{signature-actions.ts,signature-actions.test.ts,signature-form.tsx,logo-actions.test.ts}`;
  `apps/web/src/app/api/professional/signature/{route.ts,route.test.ts}`.
- No tocados (D12/convivencia): `plan-pdf.tsx`, `pacientes/[id]/planes/**`, `plantillas/**`,
  `alimentos/**`, `food-picker.tsx`, `ai-food-catalog*.ts`, `apps/web/vitest.config.ts`, `brand.tsx`,
  `middleware.ts`, `auth.config.ts`, `messages.ts`, `backlog/`, `apps/bot/**`.
- Sin scripts sueltos en el repo; los PDF/PNG de prueba quedaron solo en el scratchpad. Sin commits.

### Observaciones para el reviewer / orquestador

1. **Git (paso 0):** el ff-only no era posible por el commit de HU+SDD; se hizo `rebase` del commit
   (no pusheado) sobre `origin/develop`. El hash pasó de `f335455` a `9b0bd9b`.
2. **Riesgo residual de logs (fuera del checklist, no cambiado):** en `report-actions.ts`, los
   `catch` existentes de generar/enviar hacen `console.error("…", err)` con el error entero. Si
   fallara `saveAnthropometricReportPdf`, un error de Prisma podría incluir los argumentos (el PDF,
   que ahora trae la firma incrustada). No lo toqué porque cambia el logueo de HU-007; si se quiere,
   se resuelve con el mismo `errorCode(err)` de `signature-actions.ts`.
3. **Logo (P4):** tope de 2 MB mantenido (ver paso 6). El botón "Quitar" del logo sigue sin
   confirmación (como antes; fuera de alcance).
4. `test:booking-reason` escenario 14: falla preexistente, dependiente de la hora (ver tabla).
5. El recorrido visual de `/ajustes` (estado vacío, errores del pre-chequeo) queda para el orquestador.

---

## Ronda 2 (review_HU-016: CHANGES_REQUESTED; SDD §17)

Estado: **done**. Sin tocar schema ni migraciones, sin escribir en la base, sin bot ni WhatsApp, sin
tocar el PDF del plan ni la zona HU-015/PR #7, sin commits. Tope del logo: **2 MB**, sin cambios.

### 1. Cambio requerido: logs de `report-actions.ts`

- **Nuevo** `apps/web/src/lib/error-code.ts`: `errorCode(err)` (devuelve `err.code` si es string,
  si no `err.name`, si no `"error"`). Es el mismo helper de la ronda 1, **movido**; no está duplicado.
- `ajustes/signature-actions.ts`: borra su copia local e importa `errorCode` de `@/lib/error-code`.
- `pacientes/[id]/report-actions.ts`: `generateIsakReportPdfAction` y `sendIsakReportWhatsAppAction`
  loguean `console.error("<action>", errorCode(err))` en vez del error entero. Mensajes que ve la
  usuaria sin cambios. `saveIsakReportTextsAction` (`:97`) queda igual: no pasa por la firma.
- **Nuevo** `pacientes/[id]/report-actions.test.ts` (3 tests; mocks de `next/cache`,
  `@nutri-bot/db/domain`, render, branding, contexto y guard; no abre la base): un error tipo Prisma
  (`code: "P2000"`, `message` con el base64 de la firma, `meta` con el PDF y la firma como `Buffer`)
  al guardar el PDF (generar) y al encolar (enviar) → el spy de `console.error` recibe exactamente
  `[label, "P2000"]`; ningún argumento es `Error` ni `Buffer`, ni contiene el base64,
  `FIRMA-SECRETA-XYZ` o "invocation". Un error al leer la firma → `[label, "TypeError"]` y no encola.
  **Prueba de mutación:** con la línea vieja (`console.error(..., err)`) el test falla (1 failed);
  se restauró la versión nueva.

### 2. Sumado por el usuario: `update`/`upsert` de `Professional` con `select` mínimo

Ninguno de estos lee el resultado, así que todos pasan a `select: { id: true }` (sin cambio de
comportamiento; ya no devuelven `signatureData` ni `logoData`):

| Archivo | Llamadas |
|---|---|
| `packages/db/domain/gcal.ts` (corre en el bot) | `:79` limpiar `googleSyncError`, `:84` guardar `googleSyncError` |
| `packages/db/domain/professionalAssets.ts` | `updateProfessionalLogo`, `removeProfessionalLogo` (el `return` ahora es `{ id }`; no tienen consumidores, verificado con grep) |
| `apps/web/src/auth.ts` | `jwt` callback (refresh token de Google) |
| `apps/web/src/app/(panel)/ajustes/actions.ts` | `saveSettingsAction`, `saveGoogleCalendarIdAction`, `disconnectGoogleAction`, `setBotPausedAction`, `removeLogoAction`, `saveAfterHoursAction`, `saveBotAiAction` (`uploadLogoAction` ya lo tenía desde la ronda 1) |
| `packages/db/prisma/seed.ts` | `upsert` de la ficha (no se corrió el seed) |

Grep final de `.professional.(update|upsert|create)(` en `apps/` y `packages/` (sin tests): las
16 llamadas tienen `select`. Las 4 de la firma (`professionalAssets.ts`) ya lo tenían. El bot no
tiene escrituras propias de `Professional` (solo vía `packages/db/domain`).

### Verificación

| Chequeo | Resultado |
|---|---|
| `npm run typecheck` | core, db, **bot** y **web** limpios |
| `npm run test` | **64 archivos, 1252 tests** verdes (ronda 1: 63/1249; +1 archivo, +3 tests) |
| `npm run lint --workspace apps/web` | solo el warning preexistente de `logo-form.tsx` (ícono lucide `Image`) |
| `test:service-reminders` | 17 OK, 0 con error |
| `test:confirm-flow` | 8/8 OK |
| `test:bot-ai` | 18/18 OK, datos borrados por id (el `WARN … error del proveedor` es de un escenario simulado) |
| `test:after-hours` | 12/12 OK, datos borrados por id |
| `test:booking-reason` | no corrido (pedido del orquestador; el review identificó la causa del escenario 14: `sSena` creado con `active: false` contra la regla de PR #17, no la hora como dije en la ronda 1) |
| `./ops/harness/verify.sh` | "Arnés OK." (mismos avisos manuales que la ronda 1) |
| Base | snapshot (conteo + md5 de las 25 tablas) **idéntico** al de cierre de la ronda 1; `Professional` sin las columnas nuevas sigue en `aeb101668228bb094fd6893ae6ed13ff` y `signatureMimeType` NULL |

### Archivos de la ronda 2

- Creados: `apps/web/src/lib/error-code.ts`, `apps/web/src/app/(panel)/pacientes/[id]/report-actions.test.ts`.
- Editados: `apps/web/src/app/(panel)/pacientes/[id]/report-actions.ts`,
  `apps/web/src/app/(panel)/ajustes/signature-actions.ts`, `apps/web/src/app/(panel)/ajustes/actions.ts`,
  `apps/web/src/auth.ts`, `packages/db/domain/gcal.ts`, `packages/db/domain/professionalAssets.ts`,
  `packages/db/prisma/seed.ts`.
