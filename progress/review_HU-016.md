# Review — HU-016 (matrícula y firma)

**Veredicto:** CHANGES_REQUESTED

Revisado contra `docs/hu-matricula-firma.md` (Resoluciones), `Refactorizaciones/matricula-firma.md`
(la sección 16 manda) y `CHECKPOINTS.md`, sobre el working tree sin commitear de
`feat/hu-016-matricula-firma` (HEAD `9b0bd9b`). Hay un solo cambio pedido, chico (ver abajo). Todo lo
demás está bien.

## Verificación corrida por el reviewer

| Comando | Resultado |
|---|---|
| `npm run typecheck` | core, db, **bot** y **web** limpios |
| `npm run test` | 63 archivos, 1249 tests verdes |
| `npx dotenv -e ../../.env -- prisma migrate status` (packages/db) | 21 migraciones, "Database schema is up to date!" |
| `./ops/harness/verify.sh` | exit 0, "Arnés OK" (avisos manuales: migración nueva y "se tocó el bot", revisados abajo) |
| `psql` en solo lectura | `Professional` id=1: title/licenseNumber/logo/firma en NULL, `updatedAt` 2026-10-01 18:08:25.267 (no se escribió). `AnthropometricReport`: 2 filas con `pdfGeneratedAt` del 2026-09-24 (no se regeneraron). `OutboundMessage`: 6 filas, la última del 2026-09-24. `_prisma_migrations`: `20261003041739_professional_signature` aplicada. Respaldo `~/nutribot-backups/pre-hu016-202610030117.dump` (288.531 bytes) presente |
| Grep 10.5 | `signatureData` / `api/professional/signature` en `apps/bot` y `(portal)`: vacío. `apps/web/public`: solo `fonts/` y `numa-logo.png` |
| Diff 10.6 contra `origin/develop` (`plan-pdf.tsx`, `pacientes/[id]/planes`, `plantillas`, `alimentos`, `food-picker.tsx`, `ai-food-catalog.ts`, `vitest.config.ts`, `middleware.ts`, `auth.config.ts`, `apps/bot`) | vacío |

## Checkpoints

### C1 — Arnés
- C1.1 `backlog/` válido, 1 HU activa por responsable: [x] (verify.sh: "senkuch4n: HU-016")
- C1.2 `progress/current-senkuch4n.md` refleja la HU: [x]
- C1.3 No toca HU ajenas: [x] (solo `backlog/HU-016.json`, propio, y lo cambió el orquestador)
- C1.4 `verify.sh` exit 0: [x]

### C2 — Documentos
- C2.1 HU completa con Resoluciones: [x]
- C2.2 SDD con workspaces, checklist y contrato: [x]
- C2.3 Firmas y nombres = contrato: [x] — `professional-identity.ts` (5.1), `PROFESSIONAL_SELECT` y las 4
  funciones de `professionalAssets.ts` (5.2), `PdfImage`/`pdfImageSrc`/`pdfLogoSrc`/`PdfSignatureInput`/
  `PdfSignatureBlock` (5.3), `loadProfessionalPdfBranding` (5.4), actions y `GET` (5.5),
  `getProfessionalPortalName` (5.6). Los agregados del logo (`validateLogoImage`, `logoImageSizeError`,
  `professionalLogoNotice`, `isPdfDrawableImageMime`, `LOGO_IMAGE_MAX_BYTES`) vienen de la sección 16 (P4) y
  reutilizan el mismo helper interno `validatePdfImage`.

### C3 — Arquitectura
- C3.1 Lógica pura en core, base en `db/domain`: [x]
- C3.2 Cambio de schema/domain: web y bot compilan y consumidores ajustados: [x] — ver punto 2 abajo
- C3.3 Migración coherente, sin pasos destructivos: [x] — ver punto 6
- C3.4 Rutas nuevas protegidas, portal sin datos ajenos: [x] — ver punto 1
- C3.5 Bot en silencio, textos = SDD: [x] (el bot no cambia; textos de `PROFESSIONAL_TEXT` = 8.4)
- C3.6 Sin `console.log` de debug ni TODOs: [ ] — no hay logs de debug nuevos, pero
  `apps/web/src/app/(panel)/pacientes/[id]/report-actions.ts:112` y `:134` siguen logueando el error entero
  en el camino que ahora lleva la firma (Cambio requerido 1; regla explícita de la SDD §11 y D10)

### C4 — Verificación real
- C4.1 typecheck limpio: [x]
- C4.2 lógica nueva de core con tests y `npm run test` verde: [x] (`professional-identity.test.ts`)
- C4.3 Flujo del bot simulado: [x] N/A (el bot no cambia; `test:confirm-flow`, `test:bot-ai`, etc. corridos por
  el implementer; `signature-privacy.test.ts` cubre la IA)
- C4.4 PDF verificado de verdad: [x] — `anthropometric-report-pdf.test.tsx` renderiza en memoria
  (`/Subtype /Image` con firma y sin ella, sin matrícula, PNG corrupto, conclusiones largas) y el
  implementer revisó los PDF rasterizados en el scratchpad

### C5 — Cierre
- C5.1 `progress/impl_HU-016.md` existe y describe lo tocado: [x]
- C5.2 `progress/review_HU-016.md` con veredicto: [x]
- C5.3 Sin scripts sueltos ni datos de prueba en la base: [x] (confirmado en solo lectura, ver tabla)

## Puntos pedidos por el orquestador

1. **Seguridad de la firma (D10, §6).**
   - Validación en el servidor: `signature-actions.ts` hace `auth()` → `signatureImageSizeError(file.size)`
     antes de `arrayBuffer()` → `validateSignatureImage` (vacío → tamaño → magic bytes PNG `89 50 4E 47 0D 0A 1A 0A`
     / JPEG `FF D8 FF`) → guarda el MIME **detectado**; ignora `file.type`/`file.name`. Tope 1.048.576 inclusive.
     Tests: `professional-identity.test.ts`, `signature-actions.test.ts` (PDF disfrazado, PNG declarado JPEG,
     `arrayBuffer` no se llama con > 1 MB, spy de `console.error` sin base64 ni Buffer). OK.
   - `GET /api/professional/signature` (`route.ts`): `auth()` → 401 con `no-store` sin tocar la base; 404 con
     `no-store`; 200 con `Cache-Control: private, no-store` y `nosniff`. El matcher del middleware no excluye
     `/api/professional/*` (Auth.js redirige antes; `middleware.test.ts` lo cubre). La sesión del portal es otra
     cookie (`patient_session`), así que `auth()` da null → nunca 200. OK.
   - No llega al portal (sin `<img>` ni URL en `(portal)/**`; el portal usa `getProfessional()` sin bytes y
     `getProfessionalPortalName()` con `select { name, title }`), ni al bot ni a la IA (`PROFESSIONAL_SELECT`,
     `signature-privacy.test.ts`), ni a WhatsApp suelta (sin cambios en outbox/bot), ni a `public/`. OK.
   - **Logs — observación 2 del reporte: la considero defecto de esta HU**, no mejora. Hasta ahora
     `generateAndSave` no tocaba la firma; con esta HU pasa a leerla (`loadProfessionalPdfBranding`) y a guardar un
     PDF que la lleva incrustada (`saveAnthropometricReportPdf({ data })`). La SDD §11 prohíbe explícitamente
     "el objeto de error entero en el camino de la firma" y D10 dice "nunca a logs". El riesgo concreto es bajo
     (un `PrismaClientValidationError` imprime los argumentos de la llamada; un known request error imprime el
     fragmento de código, no los valores), pero la regla es explícita y el arreglo es de dos líneas → Cambio 1.

2. **`getProfessional()` sin bytes.** `PROFESSIONAL_SELECT` excluye `logoData` y `signatureData` y el test
   compara sus claves con `Prisma.dmmf` (si se agrega una columna, falla). Ningún consumidor de web ni bot usa
   `logoData`/`signatureData` desde ahí (grep: los únicos lectores de bytes son `api/professional/logo/route.ts`,
   `planes/[planId]/actions.ts:126`, `ajustes/page.tsx:31` y `professionalAssets.ts`), y typecheck de web y bot
   limpio. El logo sigue saliendo: en el **informe** por `getProfessionalPdfAssets` → `loadProfessionalPdfBranding`
   (`logo: drawable(a.logo)`); en el **plan** por su propia consulta `logoRow` sin tocar (`planes/[planId]/actions.ts:126-136`).
   `availability.ts:104` (`checkSlotAvailable`) y `payments.ts:124` (`syncMercadoPagoPayment`) se tocaron porque
   `origin/develop` (PR #17, `a358035e`) agregó dos `findUniqueOrThrow({ where: { id: 1 } })` **sin `select`**:
   sin el cambio, el bot (reservas y webhook de pago) traería `signatureData` y `logoData` en cada reserva o pago.
   El cambio es solo `select: PROFESSIONAL_SELECT`; ambos consumen solo escalares (`timezone`, etc.), y
   `appointments-booking.test.ts`/`payments.test.ts` siguen verdes sin cambios. Correcto.

3. **Informe.** `report-actions.ts:64-73`: `professionalName: branding.displayName` (encabezado + `author`),
   pie `footerSignature`, `signatureBlock: branding.signature`. `anthropometric-report-pdf.tsx:299`:
   `<PdfSignatureBlock>` justo después del `<Text>` de Conclusiones dentro de `styles.content`. `pdf-common.tsx`:
   `wrap={false}`, imagen 180×45 `contain`, sin imagen → solo línea + aclaración en dos `<Text>` (nombre /
   matrícula, la segunda omitida si es null). Aviso único: `informe/page.tsx:29-32` con
   `professionalDataMissingNotice` y `report-editor.tsx:304-311` con el mismo botón "Ir a Ajustes" →
   `/ajustes?tab=pdf`. Bloque reutilizable (estilos propios, `ProfessionalPdfBranding.footerText` para el plan).
   `plan-pdf.tsx` y `pacientes/[id]/planes/**` intactos (diff vacío contra `origin/develop`). OK.

4. **Portal.** `(portal)/layout.tsx:11` usa `getProfessionalPortalName()` en los dos `Wordmark` (con y sin
   sesión); `portal/page.tsx:40-43` "Este es tu espacio con {professionalSignature(...)}.". Sin imagen. OK.

5. **Logo (P4).** `ajustes/actions.ts:94-111`: sin lista de MIME del navegador, pre-chequeo de tamaño,
   `validateLogoImage` (mismo helper que la firma), guarda el MIME detectado, `select: { id: true }`. WEBP
   rechazado (también renombrado a .png). `logo-form.tsx`: `accept` PNG/JPG y aviso `Alert tone="warning"` con el
   texto exacto de §16 cuando `professionalLogoNotice(pro.logoMimeType)` da no-null y hay logo
   (`page.tsx:136`). El logo existente no se borra ni se convierte. En el informe, un logo no dibujable va como
   `null` (`professional-pdf.ts:27`). Tests: `logo-actions.test.ts` (6) y `professionalLogoNotice` en core. OK
   (ver duda sobre el tope de 2 MB).

6. **Migración.** `20261003041739_professional_signature/migration.sql` = SQL de 4.2: `ADD COLUMN "signatureData"
   BYTEA, ADD COLUMN "signatureMimeType" TEXT`; nullable, sin default, sin backfill, sin DROP. Coherente con
   `schema.prisma:27-33`. Procedimiento según `skills/migracion-prisma.md`: respaldo `pg_dump` presente,
   `migrate dev --create-only` no interactivo, prueba en transacción revertida, `migrate status` up to date
   (confirmado por mí). OK.

7. **Regla de datos.** Confirmado en solo lectura (tabla de arriba): fila `Professional` sin cambios
   (`updatedAt` 2026-10-01), informes del usuario sin regenerar, `OutboundMessage` sin filas nuevas. Los tests
   nuevos mockean `prisma` / `@nutri-bot/db` / `@nutri-bot/db/domain` o renderizan en memoria; ninguno abre la base.
   El test de PDF escribe archivos solo si existe `HU016_PDF_DIR`. OK.

8. **`test:booking-reason` escenario 14 — dato para el orquestador, no es cambio de esta HU.** Leí el script
   (`apps/bot/scripts/test-booking-reason.ts:481-503`). **La causa no es la hora**: el servicio `sSena` se crea
   con `active: false` (`:200-211`), y desde PR #17 (`a358035e`, imleticio, 2026-10-02) `checkSlotAvailable`
   devuelve `false` para servicios inactivos (`packages/db/domain/availability.ts:107`). `createAppointment`
   (`appointments.ts:55-56`) llama a `checkSlotAvailable` → `SlotUnavailableError` **siempre**, a cualquier hora.
   Es preexistente (choque entre el script de la HU-013 y la regla nueva de PR #17) y esta HU no cambia esa
   semántica (solo agrega `select`). Arreglo sugerido aparte: crear `sSena` activo en el script (o elegir el
   slot de `sSena`). Corregir la nota de `progress/current-senkuch4n.md` que dice "falla según la hora".

## Cambios requeridos

1. **No loguear el error entero en el camino de la firma** (SDD §11, D10).
   `apps/web/src/app/(panel)/pacientes/[id]/report-actions.ts:112` (`console.error("generateIsakReportPdfAction", err)`)
   y `:134` (`console.error("sendIsakReportWhatsAppAction", err)`): ambos envuelven `generateAndSave`, que con esta
   HU lee la firma y guarda un PDF que la contiene. Cambiar a loguear solo el código/clase del error, igual que
   `errorCode(err)` de `apps/web/src/app/(panel)/ajustes/signature-actions.ts:13-21` (mover ese helper a un módulo
   compartido de `apps/web/src/lib/` o duplicarlo localmente; no hace falta tocar `:96`, que no pasa por la firma,
   aunque se puede unificar). Agregar un test mínimo (mock de `generateAndSave`/`saveAnthropometricReportPdf` que
   tira un error con un `Buffer`/base64 en `message`/`meta`, spy de `console.error` que no lo contenga), o al menos
   documentar en el impl por qué no se testea. No cambia ningún texto que ve la usuaria.

## Dudas (no bloqueantes)

- **Tope del logo:** §16 dice "la misma validación en el servidor por magic bytes y tamaño que la firma". El
  implementer lo leyó como "mismo helper y mismas reglas" y dejó **2 MB** (el tope que ya tenía el logo) para no
  rechazar logos válidos hoy. Es razonable, pero la frase también admite "1 MB como la firma". Que lo confirme la
  usuaria; si quiere 1 MB es cambiar `LOGO_IMAGE_MAX_BYTES` en `packages/core/src/professional-identity.ts` y los
  textos `logoLimits`/`logoTooLarge`.
- **Bytes que viajan sin usarse:** varios `prisma.professional.update(...)` sin `select` devuelven la fila entera
  (con `signatureData`) aunque el resultado se descarta: `packages/db/domain/gcal.ts:79,84` (corre en el bot),
  `apps/web/src/auth.ts:13`, `apps/web/src/app/(panel)/ajustes/actions.ts:44,70,79,87,141,172` y
  `professionalAssets.ts:4,8` (logo). No se loguean ni se exponen, así que no viola D10 en la práctica, pero la
  firma sí llega a la memoria del proceso del bot cuando cambia `googleSyncError`. Mejora futura: `select: { id: true }`.
- `ajustes/page.tsx:31` sigue trayendo `logoData` entero solo para saber si hay logo (preexistente).
- El botón "Quitar" del logo sigue sin confirmación (preexistente, fuera de alcance).

---

# Ronda 2 — HU-016

**Veredicto:** APPROVED

Alcance: el Cambio requerido 1 de la ronda 1 y los agregados de la SDD §17. Revisado sobre el working
tree sin commitear.

## Verificación corrida por el reviewer

| Comando | Resultado |
|---|---|
| `npm run typecheck` | exit 0 (core, db, bot, web) |
| `npm run test` | 64 archivos, 1252 tests verdes |
| `prisma migrate status` (packages/db, `.env` de la raíz) | "Database schema is up to date!" |
| `./ops/harness/verify.sh` | exit 0 |
| `psql` en solo lectura | `Professional.updatedAt` sigue en 2026-10-01 18:08:25.267, sin firma ni logo; `OutboundMessage` 6 filas (última del 2026-09-24); `AnthropometricReport.pdfGeneratedAt` máx. 2026-09-24. La base no cambió |

## Punto por punto

1. **Logs de `report-actions.ts`: resuelto.** `apps/web/src/app/(panel)/pacientes/[id]/report-actions.ts:114`
   (`generateIsakReportPdfAction`) y `:137` (`sendIsakReportWhatsAppAction`) loguean `errorCode(err)`. El helper
   vive solo en `apps/web/src/lib/error-code.ts:4` (grep: una única definición) y `signature-actions.ts:7` lo
   importa (sin copia local). `:97` (`saveIsakReportTextsAction`) queda igual: no pasa por la firma, es correcto.
   El test nuevo `report-actions.test.ts` mockea `@nutri-bot/db/domain`, el render, el branding, el contexto y el
   guard (no abre la base). Simula un error tipo Prisma con `code: "P2000"`, el base64 de la firma en `message` y
   el PDF y la firma como `Buffer` en `meta`, tanto al guardar el PDF (generar) como al encolar (enviar). Verifica
   que el log sea exactamente `[label, "P2000"]` y que ningún argumento sea `Error`/`Buffer` ni contenga el
   base64, `FIRMA-SECRETA-XYZ` o "invocation". También verifica que la firma sí llega al render. Cubre el caso de
   verdad.
2. **`select: { id: true }` en las escrituras de `Professional`: correcto y sin cambio de comportamiento.**
   Recorrí las 16 llamadas `professional.(update|upsert|create)(` fuera de los tests y todas tienen `select`:
   `auth.ts:13`, `ajustes/actions.ts:44,71,81,90,109,119,145,177`, `gcal.ts:79,84`, `seed.ts:10` y
   `professionalAssets.ts:4,8,39,47`. Ninguna usa el valor devuelto (grep de asignaciones/`return`). Las únicas
   con `return` son `updateProfessionalLogo` y `removeProfessionalLogo` (`professionalAssets.ts:3-12`), que no
   tienen consumidores en web ni bot. El callback `jwt` de `auth.ts` hace `await` sin usar el resultado y devuelve
   `token` igual que antes. El seed no se corrió.
3. **Tope del logo en 2 MB:** decisión del usuario (§17). No es defecto. Queda cerrada la duda de la ronda 1.
4. **Lo aprobado en la ronda 1 sigue igual.** Los únicos archivos nuevos o editados en esta ronda son los que
   declara el impl (`error-code.ts`, `report-actions.ts` y su test, `signature-actions.ts`, `ajustes/actions.ts`,
   `auth.ts`, `gcal.ts`, `professionalAssets.ts`, `seed.ts`), más la §17 de la SDD. Schema, migración, ruta de la
   firma, PDF, portal y zona HU-015/PR #7 no se tocaron. Tests y typecheck verdes.

## Checkpoints (ronda 2)

- C1 (arnés): [x] verify.sh exit 0; solo el backlog propio.
- C2 (documentos y contrato): [x] §17 agregada a la SDD; `errorCode` no cambia ningún contrato compartido.
- C3 (arquitectura): [x] incluido C3.6, que ahora queda resuelto (sin error entero en el camino de la firma).
  Web y bot compilan después de tocar `packages/db/domain/gcal.ts` y `professionalAssets.ts`.
- C4 (verificación real): [x] typecheck y 1252 tests verdes; test de logs con datos sensibles reales en el error.
- C5 (cierre): [x] `progress/impl_HU-016.md` con la sección "Ronda 2"; sin datos de prueba en la base.

## Dudas (no bloqueantes)

- Para el orquestador, sin cambios respecto de la ronda 1: `test:booking-reason` escenario 14 falla siempre
  porque `sSena` se crea con `active: false` (`apps/bot/scripts/test-booking-reason.ts:200-211`) contra
  `availability.ts:107` (PR #17). Es ajeno a esta HU; hay que arreglarlo aparte.
