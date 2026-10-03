# SDD: HU-016 `matricula-firma` (épica 47: datos profesionales, matrícula y firma)

HU validada: `docs/hu-matricula-firma.md`. **Su sección "Resoluciones" (2026-10-03) manda:**

| Duda | Resolución aplicada en esta SDD |
|---|---|
| D1 | "Firma" = **imagen** de la firma manuscrita. No es firma digital |
| D2 | PNG o JPG, máx. **1 MB**, sin recorte ni procesamiento. WEBP **no** (confirmado abajo: react-pdf 4.9 solo dibuja PNG y JPG). En el PDF, alto máx. 45 pt manteniendo la proporción |
| D3 | Solo se sube una imagen (sin canvas) |
| D4 | Se reemplaza y se borra. Borrar pide confirmación. Sin historial |
| D5 | **No se aplica en esta HU** (es del plan; ver D12 y la sección 12) |
| D6 | Portal: título + nombre en el encabezado y en la pantalla sin sesión. Inicio: "… con Lic. Daiana Ponce · M.P. 852.". La imagen de la firma **nunca** va al portal |
| D7 | Bloque de firma con aclaración en **dos líneas**. Pie del informe y portal en **una línea** con "·". Sin mayúsculas forzadas |
| D8 | El PDF sale siempre. Aviso `warning` único en la página del informe por matrícula **y/o** firma faltante |
| D9 | Los PDF ya generados no se regeneran ni se marcan desactualizados por esto |
| D10 | Seguridad de la firma (sección 6). Va incrustada en el PDF; nunca por URL pública, portal, bot, IA, logs ni WhatsApp suelta |
| D11 | El bot no cambia |
| **D12** | **Esta HU NO toca el PDF del plan**: ni `apps/web/src/lib/plan-pdf.tsx` ni `apps/web/src/app/(panel)/pacientes/[id]/planes/**` (zona de la HU-015 de imleticio). El bloque de firma queda como componente compartido; la sección 12 documenta cómo se enchufa en el plan después |

Skills aplicados: `migracion-prisma` (sección 4 y paso 1 del checklist) y `ui` (sección 8).

Rama: `feat/hu-016-matricula-firma`, que sale de `develop`. **Ojo:** hoy la rama y el `develop`
local están en `3922c4a`, pero `origin/develop` ya está en `5d5ddc1` (PR #17, Mercado Pago). El
paso 0 del checklist la pone al día **antes** de tocar nada.

> **Verificación del architect (2026-10-03, solo lectura).**
> - `origin/develop` (`5d5ddc1`) vs. la rama (`3922c4a`): 20 archivos, **sin migraciones nuevas**
>   y sin cambios en `schema.prisma`. Trae cambios en `middleware.ts` (excluye `numa-logo.png`),
>   `middleware.test.ts`, `components/brand.tsx` (Wordmark "Numa" con logo), `domain/availability.ts`
>   (`checkSlotAvailable` ahora lee `db.professional.findUniqueOrThrow({ where: { id: 1 } })`) y
>   `domain/payments.ts` (`tx.professional.findUniqueOrThrow({ where: { id: 1 } })`). Las dos
>   lecturas de fila completa de `Professional` se tocan en esta HU (sección 5.2).
> - **PR #7** (`origin/feat/hu-010-fix-ai-sara2`) toca `alimentos/**`, `planes/**`, `plantillas/**`,
>   `food-picker.tsx`, `food-policy.test.ts`, `meal-view.test.ts`, `apps/web/vitest.config.ts` y
>   `ai-food-catalog*.ts`. **No trae migraciones.** Esta HU no toca ninguno de esos archivos.
> - Base de desarrollo: última migración aplicada `20261003023029_service_reminders` (igual que la
>   última carpeta del repo, sin drift aparente). `Professional`: 1 fila (`id = 1`), sin título,
>   sin matrícula y sin logo. `AnthropometricReport`: **2 filas del usuario** (no se tocan: ver 11).
> - Prisma **5.22.0** (`Bytes` llega como `Buffer`). `@react-pdf/renderer` **4.9.0**. Next **15.5.24**,
>   `serverActions.bodySizeLimit: "3mb"` (alcanza para 1 MB de firma).
> - **react-pdf y formatos:** `@react-pdf/image` solo decodifica `png` y `jpg/jpeg`. Probado en el
>   scratchpad: un PNG RGBA con transparencia de 600 × 200 dentro de un `<Image>` de 180 × 45 pt con
>   `objectFit: "contain"` se dibuja bien (escalado a 135 × 45, centrado); un PNG **corrupto** con
>   la cabecera válida no rompe el render: react-pdf loguea "Incomplete or corrupt PNG file", omite
>   la imagen y el PDF se genera igual (D8 se cumple también en ese caso).
> - `getProfessional()` (`packages/db/domain/availability.ts`) hace `findUnique({ where: { id: 1 } })`
>   **sin `select`**: trae todas las columnas, incluido `logoData`. La usan el bot (en casi cada
>   mensaje), el portal, la IA del bot (HU-012), el asistente del panel y ~20 páginas. Si se agrega
>   `signatureData` sin más, los bytes de la firma viajarían a todos esos procesos. Ningún consumidor
>   de `getProfessional()` usa `logoData` (grep) ni pasa `pro` entero a un componente cliente.
> - La IA del bot arma `datos_consultorio` con campos explícitos (`botAi.ts`): no serializa `pro`.
> - **Middleware:** el matcher no excluye `/api/professional/*`, así que Auth.js corre antes del
>   handler. Sin sesión del panel (incluida una sesión **solo** del portal, que es otra cookie),
>   `authorized()` da `false` y Auth.js **redirige a `/inicio`** antes de llegar al handler; el
>   `auth()` del handler (→ 401) es la segunda barrera. Ver pregunta P1.

---

## 1. Resumen funcional

La profesional sube en `/ajustes` → pestaña PDF → tarjeta **"Firma y matrícula"** una imagen PNG o
JPG (hasta 1 MB) de su firma manuscrita. Ve la vista previa, la puede reemplazar o quitar (con
confirmación), y ve una vista previa del bloque de firma tal como va a salir en el PDF: imagen,
línea y aclaración en dos líneas ("Lic. Daiana Ponce" / "M.P. 852"). La imagen se guarda en dos
columnas nuevas y nullable de `Professional` (`signatureData`, `signatureMimeType`). El tipo real
se valida **en el servidor** por magic bytes y el tamaño, por bytes. La vista previa se sirve por
`GET /api/professional/signature` solo con sesión del panel y `Cache-Control: private, no-store`.
`getProfessional()` pasa a usar un `select` explícito que **excluye los bytes** (de la firma y del
logo), así la firma no viaja al bot, al portal ni a la IA. El **informe antropométrico** muestra el
nombre con título en el encabezado y, después de "Conclusiones", un bloque de firma compartido
(`PdfSignatureBlock` en `pdf-common.tsx`, `wrap={false}`, alineado a la derecha). Sin firma, sale
solo la línea y la aclaración. El pie del informe no cambia. La página del informe muestra un
único aviso `warning` si faltan la matrícula, la firma o las dos, con botón "Ir a Ajustes"; nunca
bloquea. El **portal** muestra "Lic. Daiana Ponce" en el encabezado (también en la pantalla sin
sesión) y "Este es tu espacio con Lic. Daiana Ponce · M.P. 852." en el inicio. La sidebar del panel,
el bot y el PDF del plan no cambian.

---

## 2. Workspaces afectados

| Workspace | ¿Se toca? | Qué |
|---|---|---|
| `packages/core` | **Sí** | **Nuevo** `professional-identity.ts` (+ `professional-identity.test.ts`): nombre con título, firma en una línea (movida desde `isak-report.ts`), aclaración en dos líneas, detección y validación de la imagen por magic bytes, textos de la firma y del aviso. **Cambian:** `isak-report.ts` (re-exporta `professionalSignature` desde el módulo nuevo; se borra la clave `licenseMissing` de `ISAK_REPORT_TEXT`) e `index.ts` (**una línea**) |
| `packages/db` | **Sí** | `schema.prisma` (2 columnas en `Professional`), **1 migración aditiva** `professional_signature`. **Nuevo** `domain/professionalSelect.ts` (`PROFESSIONAL_SELECT`) + test. `domain/availability.ts` (`getProfessional` y `checkSlotAvailable` con `select`), `domain/payments.ts` (una lectura con `select`), `domain/professionalAssets.ts` (4 funciones nuevas) + test nuevo, `domain/index.ts` (**una línea**). **Nuevo** `domain/signature-privacy.test.ts` |
| `apps/web` | **Sí** | `/ajustes` (`page.tsx`, `settings-form.tsx`, **nuevos** `signature-form.tsx`, `signature-actions.ts` y `signature-actions.test.ts`). **Nueva** ruta `api/professional/signature/route.ts` + test. `lib/pdf-common.tsx` (componente y helpers nuevos, aditivo). **Nuevo** `lib/professional-pdf.ts`. `lib/anthropometric-report-pdf.tsx` (un prop + el bloque). `pacientes/[id]/report-actions.ts`. Página y editor del informe (aviso). **Nuevo** `lib/anthropometric-report-pdf.test.tsx`. Portal: `lib/shell.ts` (función nueva), `(portal)/layout.tsx`, `(portal)/portal/page.tsx`. `middleware.test.ts` (un caso) |
| `apps/bot` | **No** (código) | Ningún archivo. **Sí** hay que correr su `typecheck`: cambia el tipo que devuelve `getProfessional()` (pierde `logoData`; gana `signatureMimeType`) |

**No se tocan (D12 y convivencia):** `apps/web/src/lib/plan-pdf.tsx`,
`apps/web/src/app/(panel)/pacientes/[id]/planes/**`, `plantillas/**`, `alimentos/**`,
`components/food-picker.tsx`, `packages/core/src/ai-food-catalog*.ts`, `apps/web/vitest.config.ts`,
`components/brand.tsx`, `middleware.ts`, `auth.config.ts`, `messages.ts`, `backlog/`. Tampoco
`ajustes/actions.ts` ni `ajustes/logo-form.tsx` (el logo sigue igual; ver P4).

---

## 3. Riesgos de contrato (web y bot)

| Cambio | Impacto en web | Impacto en bot |
|---|---|---|
| `schema.prisma`: 2 columnas nullable | Tipos Prisma nuevos | Tipos Prisma nuevos |
| `getProfessional()` con `select: PROFESSIONAL_SELECT` | El tipo `Professional` (`lib/professional.ts`) pierde `logoData` y suma `signatureMimeType`. Nadie usa `logoData` desde ahí (verificado). Typecheck | `type Professional` de `conversation.ts` idem. Nadie usa `logoData`. Typecheck |
| `checkSlotAvailable` y `syncMercadoPagoPayment` con `select` | — | El bot reserva turnos y procesa pagos con esto: los tests mockeados (`appointments-booking.test.ts`, `payments.test.ts`) tienen que seguir verdes |
| `professionalSignature` se mueve de módulo | Import desde `@nutri-bot/core` sigue igual | No lo usa |

---

## 4. Esquema y migración (skill `migracion-prisma`)

### 4.1 `packages/db/prisma/schema.prisma` (modelo `Professional`, después de `licenseNumber`)

```prisma
  /// HU-016 (D1, D2): imagen de la firma manuscrita (PNG o JPG, máx. 1 MB, validada por magic bytes
  /// en el servidor). null = sin firma. DATO SENSIBLE (D10): nunca se lee en getProfessional()
  /// (ver PROFESSIONAL_SELECT); solo la vista previa del panel y la generación de PDF la seleccionan.
  signatureData      Bytes?
  /// HU-016: "image/png" o "image/jpeg", detectado por magic bytes (no el MIME que manda el navegador).
  /// Se escribe y se borra junto con signatureData.
  signatureMimeType  String?
```

Nada más cambia en el schema. Sin `previewFeatures` nuevos (no se usa `omit`: ver 5.2).

### 4.2 Migración `professional_signature`

SQL esperado (`packages/db/prisma/migrations/<timestamp>_professional_signature/migration.sql`):

```sql
-- AlterTable
ALTER TABLE "Professional" ADD COLUMN     "signatureData" BYTEA,
ADD COLUMN     "signatureMimeType" TEXT;
```

- Solo aditiva, columnas nullable: **sin default ni backfill**. La fila existente queda con `NULL`
  (= sin firma), que es el estado correcto. `prisma migrate deploy` en producción la aplica sin
  pasos extra.
- Si el SQL generado trae **cualquier** otra sentencia (`DROP`, `ALTER ... TYPE`, otra tabla),
  parar: es drift o un cambio no pedido. Reportar `blocked` con `prisma migrate status`.

---

## 5. Contrato compartido

### 5.1 `packages/core/src/professional-identity.ts` (nuevo, puro, con tests)

Consumidores: **web** (ajustes, informe, portal, lib PDF). El bot no lo usa (D11).

```ts
export type ProfessionalIdentity = { title: string | null; name: string; licenseNumber: string | null };

/** "Lic. Daiana Ponce"; sin título (null, "" o espacios) → "Daiana Ponce". Hace trim de cada parte. */
export function professionalDisplayName(p: { title: string | null; name: string }): string;

/**
 * MOVIDA desde isak-report.ts, mismo comportamiento (los tests existentes de isak-report.test.ts
 * siguen pasando sin cambios): "Lic. Ana Pérez · M.P. 123"; sin matrícula → "Lic. Ana Pérez".
 * Implementarla con professionalDisplayName.
 */
export function professionalSignature(p: ProfessionalIdentity): string;

/** Aclaración del bloque de firma (D7): { nameLine: "Lic. Daiana Ponce", licenseLine: "M.P. 852" }.
 *  Matrícula null/""/espacios → licenseLine null. */
export function professionalSignatureLines(p: ProfessionalIdentity): { nameLine: string; licenseLine: string | null };

export const SIGNATURE_IMAGE_MAX_BYTES = 1024 * 1024; // 1 MB = 1.048.576 bytes (inclusive)
export type SignatureImageMime = "image/png" | "image/jpeg";

/** Tipo real por magic bytes. PNG: 89 50 4E 47 0D 0A 1A 0A. JPEG: FF D8 FF. Cualquier otra cosa → null. */
export function detectSignatureImageMime(bytes: Uint8Array): SignatureImageMime | null;

/** Orden: vacío → tamaño → tipo. Usa los textos de PROFESSIONAL_TEXT. */
export function validateSignatureImage(
  bytes: Uint8Array,
): { ok: true; mimeType: SignatureImageMime } | { ok: false; error: string };

/** Pre-chequeo sin leer el archivo (lo usan el cliente y la action antes de arrayBuffer()). */
export function signatureImageSizeError(size: number): string | null; // 0 → signatureEmpty; > MAX → signatureTooLarge

/** Aviso único de la página del informe (D8). null si no falta nada. */
export function professionalDataMissingNotice(p: { licenseMissing: boolean; signatureMissing: boolean }): string | null;

export const PROFESSIONAL_TEXT = { /* textos exactos de la sección 8.4 */ } as const;
```

- `packages/core/src/isak-report.ts`: borrar la definición de `professionalSignature` y poner
  `export { professionalSignature } from "./professional-identity";` (TS acepta que `index.ts`
  exporte el mismo símbolo por dos `export *`: probado en el scratchpad). Borrar la clave
  `licenseMissing` de `ISAK_REPORT_TEXT` (su único consumidor es `report-editor.tsx`, que pasa al
  aviso nuevo). `goToSettings` ("Ir a Ajustes") se queda.
- `packages/core/src/index.ts`: agregar al final `export * from "./professional-identity";`.

### 5.2 `packages/db/domain` (consumidores: web y bot)

**`domain/professionalSelect.ts` (nuevo):**

```ts
import type { Prisma } from "../index";

/**
 * HU-016 (D10): columnas de Professional que lee getProfessional(). Todas las escalares MENOS los
 * bytes de imágenes (signatureData, logoData): no viajan al bot, al portal ni a la IA. Las imágenes
 * se leen solo con las funciones de professionalAssets.ts. Si se agrega una columna a Professional,
 * sumarla acá (el test lo exige).
 */
export const PROFESSIONAL_SELECT = {
  id: true, name: true, email: true, phoneJid: true, timezone: true, currency: true,
  acceptedInsurances: true, logoMimeType: true, pdfAccentColor: true, pdfFooterText: true,
  title: true, licenseNumber: true, signatureMimeType: true, reminderLeadHours: true,
  botPaused: true, afterHoursEnabled: true, afterHoursStart: true, afterHoursEnd: true,
  botAiEnabled: true, botAiInfo: true, googleRefreshToken: true, googleCalendarId: true,
  googleSyncError: true, createdAt: true, updatedAt: true,
} satisfies Prisma.ProfessionalSelect;
```

(La lista es la del schema al 2026-10-03 más `signatureMimeType`. Si `origin/develop` trajera otra
columna al momento de implementar, sumarla: el test de 9.2 lo detecta.)

Por qué `select` y no `omit`: en Prisma 5.22 `omit` es preview (`omitApi`), y un `omit` global cambia
el tipo del cliente y rompe `AvailabilityClient = Pick<Prisma.TransactionClient, …>` con default
`prisma` (develop). El `select` explícito no cambia nada de eso.

**`domain/availability.ts`:**
- `getProfessional()`: `prisma.professional.findUnique({ where: { id: 1 }, select: PROFESSIONAL_SELECT })`.
  Firma y mensaje de error sin cambios.
- `checkSlotAvailable` (versión de develop): `db.professional.findUniqueOrThrow({ where: { id: 1 }, select: PROFESSIONAL_SELECT })`.

**`domain/payments.ts`** (versión de develop, `syncMercadoPagoPayment`):
`tx.professional.findUniqueOrThrow({ where: { id: 1 }, select: PROFESSIONAL_SELECT })`. Sin otro
cambio.

**`domain/professionalAssets.ts`** (las dos funciones del logo quedan igual; se agregan):

```ts
export type ProfessionalImage = { data: Buffer; mimeType: string };

/** Solo la vista previa del panel. null si falta cualquiera de las dos columnas. */
export async function getProfessionalSignatureImage(): Promise<ProfessionalImage | null>;
//   select: { signatureData: true, signatureMimeType: true }

/** Reemplaza la firma (sin historial, D4). Devuelve void: select { id: true } para no traer bytes. */
export async function updateProfessionalSignature(input: { data: Buffer; mimeType: "image/png" | "image/jpeg" }): Promise<void>;
//   data: { signatureData: input.data, signatureMimeType: input.mimeType }

export async function removeProfessionalSignature(): Promise<void>;
//   data: { signatureData: null, signatureMimeType: null }, select: { id: true }

/** Lo que necesita un PDF (informe hoy; plan después de la HU-015). Una sola consulta. */
export async function getProfessionalPdfAssets(): Promise<{
  name: string; title: string | null; licenseNumber: string | null;
  pdfAccentColor: string | null; pdfFooterText: string | null;
  logo: ProfessionalImage | null; signature: ProfessionalImage | null;
}>;
//   findUniqueOrThrow({ where: { id: 1 }, select: { name, title, licenseNumber, pdfAccentColor,
//   pdfFooterText, logoData, logoMimeType, signatureData, signatureMimeType } })
```

`domain/index.ts`: agregar `export * from "./professionalSelect";` (una línea).

### 5.3 `apps/web/src/lib/pdf-common.tsx` (aditivo; consumidores: informe hoy, plan después)

```tsx
export type PdfImage = { data: Buffer; mimeType: string };

/** data: URL de una imagen guardada (logo o firma), o null. */
export function pdfImageSrc(img: PdfImage | null): string | null;
/** Compatibilidad: plan-pdf.tsx y el informe lo siguen importando con este nombre. */
export const pdfLogoSrc = pdfImageSrc;

/** HU-016 (D7): datos del bloque de firma. */
export type PdfSignatureInput = {
  image: PdfImage | null;   // null → solo línea + aclaración (D8)
  nameLine: string;         // professionalSignatureLines(...).nameLine
  licenseLine: string | null;
};

/**
 * Bloque de firma al final del contenido: imagen (alto máx. 45 pt, proporción), línea y aclaración
 * en dos líneas, alineado a la derecha. wrap={false}: si no entra, pasa entero a la página siguiente.
 * Estilos propios (no depende de buildCommonStyles), así el plan lo reusa sin cambios.
 */
export function PdfSignatureBlock({ signature }: { signature: PdfSignatureInput }): JSX.Element;
```

Implementación (valores probados en el scratchpad):

```tsx
const signatureStyles = StyleSheet.create({
  block: { marginTop: 32, alignSelf: "flex-end", width: 180, alignItems: "center" },
  image: { width: 180, height: 45, objectFit: "contain", marginBottom: 2 },
  rule: { alignSelf: "stretch", borderTopWidth: 0.75, borderTopColor: pdfColors.text, marginBottom: 4 },
  name: { fontSize: 10, fontWeight: 500, textAlign: "center", lineHeight: 1.3 },
  license: { fontSize: 9, textAlign: "center", lineHeight: 1.3 },
});

export function PdfSignatureBlock({ signature }: { signature: PdfSignatureInput }) {
  const src = pdfImageSrc(signature.image);
  return (
    <View style={signatureStyles.block} wrap={false}>
      {/* eslint-disable-next-line jsx-a11y/alt-text -- @react-pdf/renderer Image, not an <img> */}
      {src ? <Image src={src} style={signatureStyles.image} /> : null}
      <View style={signatureStyles.rule} />
      <Text style={signatureStyles.name}>{signature.nameLine}</Text>
      {signature.licenseLine ? <Text style={signatureStyles.license}>{signature.licenseLine}</Text> : null}
    </View>
  );
}
```

Sin firma no se reserva espacio en blanco arriba de la línea (D8: "solo la línea y la aclaración").

### 5.4 `apps/web/src/lib/professional-pdf.ts` (nuevo, `import "server-only"`)

Junta lo que pone cualquier PDF sobre la profesional. Es el **único punto** que va a llamar el plan
después de la HU-015.

```ts
export type ProfessionalPdfBranding = {
  displayName: string;           // professionalDisplayName → encabezado (brandName) y metadato author
  footerSignature: string;       // professionalSignature → pie del informe (y pie default del plan, D5)
  logo: PdfImage | null;
  signature: PdfSignatureInput;  // → <PdfSignatureBlock>
  accentColor: string | null;
  footerText: string | null;     // pdfFooterText de /ajustes (lo usa el plan)
};
export async function loadProfessionalPdfBranding(): Promise<ProfessionalPdfBranding>;
```

Usa `getProfessionalPdfAssets()` y las funciones de `professional-identity.ts`. No loguea nada.

### 5.5 Server actions y ruta (solo web)

**`apps/web/src/app/(panel)/ajustes/signature-actions.ts` (nuevo, `"use server"`)**. Archivo aparte
para no tocar `ajustes/actions.ts` y poder testearlo aislado. Reusa el tipo `SettingsState` con
`import type { SettingsState } from "./actions"`.

```ts
export async function uploadSignatureAction(_prev: SettingsState, formData: FormData): Promise<SettingsState>;
export async function removeSignatureAction(_prev: SettingsState): Promise<SettingsState>;
```

`uploadSignatureAction`, en este orden:
1. `const session = await auth()` (de `@/auth`). Sin `session?.user` → `{ ok: false, error: PROFESSIONAL_TEXT.sessionExpired }`, sin leer el archivo (defensa en profundidad: el middleware ya protege `/ajustes`).
2. `const file = formData.get("signature")`. Si no es `File` → `signatureEmpty`.
3. `signatureImageSizeError(file.size)` → si hay error, devolverlo **sin** llamar a `arrayBuffer()`.
4. `const bytes = Buffer.from(await file.arrayBuffer())`; `validateSignatureImage(bytes)`. **Se ignoran `file.type` y `file.name`.**
5. `await updateProfessionalSignature({ data: bytes, mimeType: check.mimeType })` en `try/catch`. En el catch: `console.error("uploadSignatureAction: no se pudo guardar", errorCode(err))` donde `errorCode` devuelve solo `err.code` (Prisma) o `err.name`, **nunca** `err` entero ni `err.message` (los errores de Prisma pueden imprimir los argumentos del `update`, o sea los bytes). Devuelve `signatureSaveError`.
6. `revalidatePath("/ajustes")` → `{ ok: true }`.

`removeSignatureAction`: `auth()` igual que arriba → `removeProfessionalSignature()` en `try/catch`
(mismo logueo acotado, error `signatureRemoveError`) → `revalidatePath("/ajustes")` → `{ ok: true }`.

**`apps/web/src/app/api/professional/signature/route.ts` (nuevo)**

```ts
export const dynamic = "force-dynamic";
export async function GET(): Promise<Response>;
```
- `auth()`; sin `session?.user` → `NextResponse.json({ error: "unauthorized" }, { status: 401, headers: { "Cache-Control": "no-store" } })`, **sin** consultar la base.
- `getProfessionalSignatureImage()`; null → 404 `{ error: "sin firma" }` con `Cache-Control: no-store`.
- 200 con `new Uint8Array(img.data)` y headers: `Content-Type: img.mimeType`,
  `Cache-Control: private, no-store`, `X-Content-Type-Options: nosniff`.
- La URL no lleva ids ni nombre de archivo. El `<img>` del panel le agrega `?v=<updatedAt>` solo
  para refrescar después de subir.

### 5.6 Portal: `apps/web/src/lib/shell.ts`

```ts
/** HU-016 (D6): "Lic. Daiana Ponce" para el portal. Igual que getProfessionalDisplayName: nunca tira. */
export async function getProfessionalPortalName(): Promise<string | null>;
//   select: { name: true, title: true } → professionalDisplayName; nombre vacío → null; error → null
```

`getProfessionalDisplayName()` **no cambia** (la usa la sidebar del panel: sigue mostrando solo el
nombre).

---

## 6. Seguridad de la firma (D10)

| Regla | Cómo se cumple | Test |
|---|---|---|
| No hay URL pública ni archivo en `public/` | Bytes en la base; única ruta `GET /api/professional/signature` | grep de verificación (sección 10) |
| Vista previa solo con sesión del panel | Middleware Auth.js (redirige a `/inicio`) + `auth()` en el handler (401). Sesión del portal = cookie propia, `auth()` da null → 401 | `route.test.ts`, `middleware.test.ts` |
| `Cache-Control: private, no-store` (+ `nosniff`) | Headers de la ruta | `route.test.ts` |
| Validación en el servidor por magic bytes y ≤ 1 MB | `validateSignatureImage` en la action; el MIME guardado es el detectado | `professional-identity.test.ts`, `signature-actions.test.ts` |
| No va al bot, al portal ni a la IA | `getProfessional()` con `PROFESSIONAL_SELECT` (sin bytes); el portal no tiene `<img>` de firma ni llama a la ruta | `professionalSelect.test.ts`, `signature-privacy.test.ts` |
| No va a logs | Las actions loguean solo el código de error; ninguna función nueva loguea datos | `signature-actions.test.ts` (spy de `console.error`) |
| No va suelta por WhatsApp | Ningún cambio en `OutboundMessage`, `outbox.ts` ni el bot | — |
| Solo dentro del PDF (aceptado en D10) | `loadProfessionalPdfBranding` → `PdfSignatureBlock` | `anthropometric-report-pdf.test.tsx` |

---

## 7. Cambios en el informe antropométrico

### 7.1 `apps/web/src/lib/anthropometric-report-pdf.tsx`

- `ReportPdfInput` suma **un** campo: `signatureBlock: PdfSignatureInput;` (requerido). Los demás
  quedan igual (`professionalName` ahora llega con título; ver 7.2).
- Import: sumar `PdfSignatureBlock` y `type PdfSignatureInput` al import de `@/lib/pdf-common`.
- Después del `<Text orphans={2} widows={2}>{texts.conclusions}</Text>` y **dentro** del
  `<View style={styles.content}>`: `<PdfSignatureBlock signature={input.signatureBlock} />`.
- `PdfHeader brandName={input.professionalName}` y `author={input.professionalName}`: sin cambio de
  código (el valor pasa a ser "Lic. Daiana Ponce").
- `PdfFooter text={input.signature}`: sin cambio (sigue "Lic. Daiana Ponce · M.P. 852").

### 7.2 `apps/web/src/app/(panel)/pacientes/[id]/report-actions.ts` (`generateAndSave`)

Reemplazar la consulta `logoRow` por `const branding = await loadProfessionalPdfBranding();` y pasar:

```ts
professionalName: branding.displayName,
signature: branding.footerSignature,
logo: branding.logo,
accentColor: branding.accentColor,
signatureBlock: branding.signature,
```

Quitar los imports que queden sin uso (`prisma`, `professionalSignature`). `pdfSourceKey` no cambia
(D9: cambiar matrícula o firma no marca el PDF como desactualizado).

### 7.3 Aviso en la página del informe (D8)

- `antropometria/informe/page.tsx`: reemplazar `licenseMissing={!ctx.pro.licenseNumber}` por
  ```tsx
  professionalNotice={professionalDataMissingNotice({
    licenseMissing: !ctx.pro.licenseNumber?.trim(),
    signatureMissing: !ctx.pro.signatureMimeType,
  })}
  ```
  (`ctx.pro` sale de `getProfessional()`, que ahora trae `signatureMimeType`).
- `report-editor.tsx`: el prop `licenseMissing: boolean` pasa a `professionalNotice: string | null`.
  El `Alert tone="warning"` existente muestra `{professionalNotice}` en vez de `{T.licenseMissing}`;
  mismo botón `ButtonLink href="/ajustes?tab=pdf" variant="secondary" size="sm"` con
  `{T.goToSettings}`. No se toca nada más del editor.

---

## 8. UI (skill `ui`)

### 8.1 `/ajustes` → pestaña PDF → tarjeta "Firma y matrícula"

`ajustes/page.tsx`:
- La tarjeta "Firma de los informes" pasa a `title="Firma y matrícula"` y `description` = texto
  8.4 `cardDescription` (ver P2).
- Contenido, en orden: `<SettingsSignatureFields defaults={defaults} />` → `<Separator className="my-4" />`
  → `<SignatureForm hasSignature={pro.signatureMimeType !== null} version={pro.updatedAt.getTime()}
  lines={professionalSignatureLines({ title: pro.title, name: pro.name, licenseNumber: pro.licenseNumber })} />`.
- Se borra el import de `professionalSignature` si queda sin uso.
- Tarjeta "Logo": `description="Este logo aparece en los PDFs de los planes e informes que le enviás a tus pacientes."`.
  "Estilo del PDF" sin cambios.

`ajustes/settings-form.tsx` (`SettingsSignatureFields`): quitar el prop `signaturePreview` y el `<p>`
"Pie del informe: …" (la vista previa del bloque lo reemplaza). JSDoc: "HU-007 (D1), HU-016: título
y matrícula (PDF y portal)". Los campos, `name`, `form={SETTINGS_FORM_ID}` y `SettingsSubmit` quedan
igual.

**`ajustes/signature-form.tsx` (nuevo, `"use client"`)**

Props: `{ hasSignature: boolean; version: number; lines: { nameLine: string; licenseLine: string | null } }`.

Estructura (mismos componentes que `logo-form.tsx` y `after-hours-form.tsx`):
1. Encabezado: `<p className="text-sm font-medium">Imagen de la firma</p>` + ayuda
   `text-sm text-muted-foreground` (texto `uploadHelp`) + `text-xs text-muted-foreground` (`uploadLimits`).
2. Fila `flex flex-wrap items-center gap-6`:
   - Con firma: `<img src={`/api/professional/signature?v=${version}`} alt="Tu firma actual" width={240} height={80} className="h-20 w-60 rounded-md border bg-white object-contain p-2" />` (`eslint-disable-next-line @next/next/no-img-element`, como el logo).
   - Sin firma: recuadro `h-20 w-60 rounded-md border border-dashed` con ícono `Signature` de
     lucide (`aria-hidden`) y el texto "Sin firma".
   - Error al cargar la imagen (`onError`): reemplazar por el recuadro con "No se pudo cargar la
     vista previa" (estado local), sin romper el resto.
3. Form de subida `ref={formRef} onSubmit={handleUpload}` (patrón de `after-hours-form.tsx`):
   `<input type="file" name="signature" accept="image/png,image/jpeg" required aria-label="Archivo de la firma" …>`
   con las mismas clases del input del logo; `<Button type="submit" size="sm" loading={uploading}>{uploading ? "Subiendo…" : "Subir firma"}</Button>`.
   `handleUpload`: `e.preventDefault()`; toma el `File`; **pre-chequeo en el cliente** con
   `signatureImageSizeError(file?.size ?? 0)` → si hay error, lo muestra (estado local) y no envía
   (evita mandar archivos de más de 3 MB, que Next corta antes de la action); si no,
   `startTransition(() => uploadAction(new FormData(e.currentTarget)))`. Con `state.ok` → `formRef.current?.reset()`.
4. Si `hasSignature`: `<Button type="button" size="sm" variant="ghost" loading={removing} onClick={handleRemove}>{removing ? "Quitando…" : "Quitar"}</Button>`.
   `handleRemove` es `async`: **primero** `if (!(await confirm({ title, description, confirmLabel: "Quitar" }))) return;`
   (fuera de cualquier transición y de `<form action>`; `useConfirm` de `@/components/confirm`),
   **después** `startTransition(() => removeAction())`.
5. `<FormError message={localError ?? uploadState.error ?? removeState.error} />`.
6. Vista previa del bloque (`Separator` arriba): rótulo `previewLabel` (`text-xs font-medium text-muted-foreground`),
   y un recuadro `rounded-md border bg-white p-4` con un bloque a la derecha de `w-60`, centrado:
   la imagen (si hay; `h-12 w-full object-contain`), `border-t border-foreground`, `nameLine`
   (`text-sm font-medium`) y `licenseLine` (`text-xs`) si no es null. Usa los valores **guardados**
   (props del servidor), no lo que se está tipeando en Título/Matrícula.

Hooks: `useActionState(uploadSignatureAction, initial)` y `useActionState(removeSignatureAction, initial)`;
`useActionToast(uploadState, { success: T.signatureUploaded })` y
`useActionToast(removeState, { success: T.signatureRemoved })`.

Estados: vacío (recuadro "Sin firma" + bloque sin imagen), cargando (botones con `loading` y textos
"Subiendo…"/"Quitando…"), error (`FormError` debajo; toast solo en éxito), con firma (imagen + Quitar).

### 8.2 Página del informe

Ver 7.3. Un solo `Alert tone="warning"` con el texto de `professionalDataMissingNotice` y "Ir a Ajustes".

### 8.3 Portal

- `(portal)/layout.tsx`: `getProfessionalDisplayName()` → `getProfessionalPortalName()` (import desde
  `@/lib/shell`). Se usa en los dos `Wordmark subtitle` (sin sesión y con sesión). Nada más.
- `(portal)/portal/page.tsx`: `Este es tu espacio con {pro.name}.` →
  `Este es tu espacio con {professionalSignature({ title: pro.title, name: pro.name, licenseNumber: pro.licenseNumber })}.`
  (import desde `@nutri-bot/core`). Sin título ni matrícula queda igual que hoy.
- Ningún `<img>` ni link a `/api/professional/signature` en `(portal)/**`.

### 8.4 Textos exactos (`PROFESSIONAL_TEXT` en `professional-identity.ts`, salvo que se diga otra cosa)

| Clave | Texto |
|---|---|
| `cardDescription` (default, ver P2) | "Tu título, matrícula y firma aparecen en el informe antropométrico, y tu título y matrícula en el portal del paciente." |
| `uploadTitle` | "Imagen de la firma" |
| `uploadHelp` | "Firmá en una hoja blanca, sacale una foto o escaneala y recortala dejando solo la firma. Mejor en PNG con fondo transparente." |
| `uploadLimits` | "PNG o JPG, hasta 1 MB." |
| `emptyBox` | "Sin firma" |
| `previewError` | "No se pudo cargar la vista previa" |
| `uploadButton` / `uploading` | "Subir firma" / "Subiendo…" |
| `removeButton` / `removing` | "Quitar" / "Quitando…" |
| `removeConfirmTitle` | "¿Quitar tu firma?" |
| `removeConfirmDescription` | "Los próximos PDF salen sin firma." |
| `previewLabel` | "Así se ve al final de tus PDF" |
| `signatureEmpty` | "Elegí una imagen" |
| `signatureInvalidFormat` | "Formato inválido (usá PNG o JPG)" |
| `signatureTooLarge` | "La imagen pesa más de 1 MB" |
| `signatureUploaded` (toast) | "Firma actualizada" |
| `signatureRemoved` (toast) | "Firma quitada" |
| `signatureSaveError` | "No se pudo guardar la firma. Probá de nuevo." |
| `signatureRemoveError` | "No se pudo quitar la firma. Probá de nuevo." |
| `sessionExpired` | "Tu sesión venció. Volvé a entrar." |
| aviso: solo matrícula | "Tu matrícula no está cargada. Completala en Ajustes para que aparezca en tus PDF." |
| aviso: solo firma | "Tu firma no está cargada. Subila en Ajustes para que aparezca en tus PDF." |
| aviso: las dos | "Tu matrícula y tu firma no están cargadas. Completalas en Ajustes para que aparezcan en tus PDF." |
| Logo (en `page.tsx`) | "Este logo aparece en los PDFs de los planes e informes que le enviás a tus pacientes." |
| Portal inicio (en `page.tsx`) | "Este es tu espacio con {professionalSignature}." |

### 8.5 Mensajes del bot

Ninguno (D11).

---

## 9. Tests

### 9.1 `packages/core/src/professional-identity.test.ts` (nuevo)

- `professionalDisplayName`: con título; título `null`, `""` y `"  "`; trims (`"  Lic. "`, `" Daiana Ponce "` → "Lic. Daiana Ponce").
- `professionalSignature`: los mismos casos que hoy están en `isak-report.test.ts` (que **no** se
  modifica y tiene que seguir pasando importando desde `./isak-report`).
- `professionalSignatureLines`: completo → `{ nameLine: "Lic. Daiana Ponce", licenseLine: "M.P. 852" }`;
  sin título; matrícula `null`/`""`/`"  "` → `licenseLine: null`; matrícula con espacios recortada;
  matrícula compuesta `"M.P. 852 · M.N. 1234"` intacta.
- `detectSignatureImageMime`: PNG real (8 bytes de firma + IHDR), JPEG (`FF D8 FF E0 …`) → mime;
  `%PDF-1.7`, GIF (`GIF89a`), WEBP (`RIFF….WEBP`), `<svg …>` en texto, `<html>`, bytes vacíos, solo
  `89 50 4E` (cortado), PNG con un byte de la firma cambiado → `null`.
- `validateSignatureImage`: vacío → "Elegí una imagen"; PNG de exactamente 1.048.576 bytes → ok;
  1.048.577 → "La imagen pesa más de 1 MB"; PDF chico → "Formato inválido (usá PNG o JPG)"; un PDF
  de más de 1 MB → error de tamaño (orden vacío → tamaño → tipo).
- `signatureImageSizeError`: 0, 1, 1.048.576, 1.048.577.
- `professionalDataMissingNotice`: las 4 combinaciones (null cuando no falta nada) con los textos exactos.

### 9.2 `packages/db/domain` (vitest con `prisma` mockeado, patrón de `payments.test.ts`)

- **`professionalSelect.test.ts` (nuevo):**
  - `PROFESSIONAL_SELECT` no tiene `signatureData` ni `logoData`.
  - Cubre **todas** las demás columnas escalares de `Professional`: comparar sus claves con
    `Prisma.dmmf.datamodel.models.find((m) => m.name === "Professional")!.fields.filter((f) => f.kind === "scalar")`
    menos `signatureData` y `logoData` (CI corre `db:generate` antes de `test`).
  - `getProfessional()` llama a `prisma.professional.findUnique` con `{ where: { id: 1 }, select: PROFESSIONAL_SELECT }`
    y sigue tirando "Falta la ficha…" si no hay fila.
- **`professionalAssets.test.ts` (nuevo):**
  - `updateProfessionalSignature` → `update({ where: { id: 1 }, data: { signatureData, signatureMimeType }, select: { id: true } })`; devuelve `undefined`.
  - `removeProfessionalSignature` → ambos `null`, `select: { id: true }`.
  - `getProfessionalSignatureImage`: fila con las dos → `{ data, mimeType }`; falta cualquiera o no hay fila → `null`; el `select` pide solo esas dos columnas.
  - `getProfessionalPdfAssets`: arma `logo`/`signature` en `null` cuando falta el byte o el MIME.
- **`signature-privacy.test.ts` (nuevo, patrón de `gcal-and-ai-privacy.test.ts`):**
  `getProfessional` mockeado devolviendo además `signatureData: Buffer.from("FIRMA-SECRETA-XYZ")` y
  `signatureMimeType: "image/png"`; correr `runBotAiTool` con `datos_consultorio` y verificar que
  el resultado no contiene `FIRMA-SECRETA-XYZ` ni su base64.
- `appointments-booking.test.ts` y `payments.test.ts` (de develop) tienen que seguir verdes sin
  cambios (solo mockean el valor resuelto). Si alguno afirma los argumentos exactos del
  `findUniqueOrThrow` de `Professional`, ajustar **solo** esa expectativa a `select: PROFESSIONAL_SELECT`.

### 9.3 `apps/web` (vitest de la raíz, alias `@`)

- **`app/api/professional/signature/route.test.ts` (nuevo):** mock de `@/auth` y de
  `@nutri-bot/db/domain` (`getProfessionalSignatureImage`).
  - Sin sesión → 401, body sin la imagen, `getProfessionalSignatureImage` **no** se llama.
  - Request con cookie de sesión del portal (`patient_session=…`) y `auth()` → null → 401 (la cookie del portal no autoriza).
  - Con sesión y firma → 200, `Content-Type: image/png`, `Cache-Control: private, no-store`, `X-Content-Type-Options: nosniff`, body = bytes.
  - Con sesión y sin firma → 404.
- **`middleware.test.ts`:** agregar `"/api/professional/signature"` (y `"/api/professional/logo"`)
  a la lista de rutas que siguen protegidas (`it.each` existente). Una línea.
- **`app/(panel)/ajustes/signature-actions.test.ts` (nuevo):** mocks de `@/auth`, `next/cache`
  (`revalidatePath`) y `@nutri-bot/db/domain` (`updateProfessionalSignature`, `removeProfessionalSignature`).
  `@nutri-bot/core` real.
  - Sin sesión → error `sessionExpired`, sin `update`.
  - Sin archivo / archivo vacío → "Elegí una imagen", sin `update`.
  - Bytes de PDF con `name: "firma.png"`, `type: "image/png"` → "Formato inválido (usá PNG o JPG)", sin `update`.
  - 1.048.577 bytes → "La imagen pesa más de 1 MB", sin `update` (y con un `File` cuyo `arrayBuffer` es un spy: no se llama).
  - PNG real declarado como `type: "image/jpeg"` → se guarda con `mimeType: "image/png"` (manda el detectado).
  - JPEG real → se guarda con `image/jpeg`; `revalidatePath("/ajustes")`; `{ ok: true }`.
  - `update` que tira un error cuyo `message` contiene el base64 de la imagen → devuelve `signatureSaveError`, no tira, y ningún argumento de `console.error` (spy) contiene ese base64 ni el `Buffer`.
  - `removeSignatureAction` con sesión → llama a `removeProfessionalSignature` y devuelve `{ ok: true }`; sin sesión → no la llama.
- **`lib/anthropometric-report-pdf.test.tsx` (nuevo):** renderiza en memoria, sin base.
  - `PdfSignatureBlock({ signature })` devuelve un elemento con `props.wrap === false`.
  - `renderToBuffer(<Document><Page><PdfSignatureBlock … image={PNG chico}/></Page></Document>)`: el buffer contiene `/Subtype /Image`; con `image: null` no lo contiene (los diccionarios de objetos del PDF no van comprimidos). Con `licenseLine: null` renderiza sin errores.
  - `renderAnthropometricReportPdf` con un modelo de `buildIsakReportModel` armado con los fixtures
    de core (`import { CASE_A, CASE_B } from "../../../../packages/core/src/isak-fixtures.test-data"`,
    mismo armado que `isak-report.test.ts`), `logo: null` y firma PNG → buffer empieza con `%PDF` y
    contiene `/Subtype /Image`; sin firma → no lo contiene. Un caso con PNG corrupto (cabecera válida,
    cuerpo basura) → el PDF se genera igual.
  - Si está definida la variable `HU016_PDF_DIR`, el test escribe ahí los PDF (con firma, sin firma,
    sin matrícula, y uno con conclusiones largas para que el bloque caiga al final de la página) para
    revisarlos a ojo. Sin la variable no escribe nada (CI).
  - El PNG de prueba se genera en el test con `zlib` (como en el scratchpad del architect); no se
    agregan archivos binarios al repo.

---

## 10. Verificación (el implementer, antes de `done`)

```bash
# 1. Esquema y cliente
cd packages/db && npx dotenv -e ../../.env -- prisma migrate status && cd ../..   # "Database schema is up to date"
npm run db:generate

# 2. Tipos en TODOS los workspaces (web y bot incluidos)
npm run typecheck

# 3. Tests (vitest de la raíz: core, db/domain, web)
npm run test

# 4. PDF a ojo, sin base: escribe los PDF en el scratchpad y revisarlos (Read del PDF)
HU016_PDF_DIR="<scratchpad>/hu016-pdf" npx vitest run apps/web/src/lib/anthropometric-report-pdf.test.tsx
#    Comprobar: encabezado "Lic. …"; bloque después de Conclusiones, a la derecha; imagen ≤ 45 pt;
#    línea; aclaración en dos líneas (una sin matrícula); sin firma solo línea + aclaración; en el
#    PDF de conclusiones largas el bloque pasa ENTERO a la página siguiente; pie "… · M.P. …" y
#    "Página n de N" en todas las páginas.

# 5. La firma no está expuesta (las dos salidas tienen que ser vacías)
grep -rn "signatureData\|api/professional/signature" apps/bot "apps/web/src/app/(portal)"
git ls-files apps/web/public | grep -i -E "firma|signature"

# 6. Zona de la HU-015 / PR #7 intacta (salida vacía)
git diff --stat origin/develop -- apps/web/src/lib/plan-pdf.tsx "apps/web/src/app/(panel)/pacientes/[id]/planes" "apps/web/src/app/(panel)/plantillas" "apps/web/src/app/(panel)/alimentos" apps/web/src/components/food-picker.tsx packages/core/src/ai-food-catalog.ts apps/web/vitest.config.ts

# 7. Ruta protegida con el panel corriendo (solo lectura): sin sesión NO devuelve la imagen
curl -s -o /dev/null -w "%{http_code} %{redirect_url}\n" http://localhost:3000/api/professional/signature
#    Esperado: 307 (o 302) hacia /inicio (middleware). Nunca 200.

# 8. Arnés
./ops/harness/verify.sh
```

`npm run test:confirm-flow` no hace falta (el bot no cambia), pero el `typecheck` de `apps/bot` sí.

---

## 11. Restricciones para el implementer

- **Datos de la base de desarrollo (regla dura de `AGENTS.md`):** no borrar ni modificar datos de
  negocio preexistentes. En particular:
  - **No subir una firma a la base de desarrollo**, no tocar `title`/`licenseNumber` de la fila
    `Professional` y no apretar "Guardar ajustes" en `/ajustes`. La subida se prueba con los tests
    mockeados (9.3). La prueba manual de `/ajustes` (subir/reemplazar/quitar) la hace el usuario.
    Se puede abrir `/ajustes` en el navegador para ver el estado vacío, sin guardar nada.
  - **No generar ni enviar el informe desde la UI** sobre estudios existentes: las 2 filas de
    `AnthropometricReport` son del usuario y generar pisa su PDF y sus textos. El PDF se verifica
    con el test de render en memoria (10.4).
  - Si igual hiciera falta escribir en la base, solo en una transacción que se revierte o con
    datos propios borrados por id; para `Professional` (fila única), solo con restauración exacta
    de las columnas tocadas por `id = 1`, verificada con `psql` antes y después.
- **WhatsApp:** esta HU no envía nada. No encolar `OutboundMessage` ni usar "Enviar por WhatsApp".
- **Migración:** solo con el paso 1 del checklist. Prohibido `prisma migrate reset`, aceptar el
  reset que ofrece `migrate dev`, `prisma db push`, pasar `DATABASE_URL` como `--shadow-database-url`
  y `prisma migrate diff --from-migrations` contra la base de desarrollo. Si aparece drift: parar y
  `blocked` con la salida de `prisma migrate status`.
- **D12:** no tocar `plan-pdf.tsx` ni `pacientes/[id]/planes/**` (ni `plantillas/**`, `alimentos/**`,
  `food-picker.tsx`, `ai-food-catalog*.ts`, `apps/web/vitest.config.ts`).
- **Archivos compartidos** (`schema.prisma`, `core/index.ts`, `domain/index.ts`, `availability.ts`,
  `payments.ts`, `pdf-common.tsx`, `middleware.test.ts`, `shell.ts`): cambios mínimos y aditivos,
  exactamente los de esta SDD. No reformatear.
- Nada de `console.log`/`console.error` con bytes, `Buffer`, base64 ni el objeto de error entero en
  el camino de la firma.
- No commitear `HU016_PDF_DIR` ni PDF/imagenes de prueba. No tocar `backlog/`.

---

## 12. Cómo se enchufa en el PDF del plan (después de la HU-015; **no se implementa ahora**)

Decidido por el usuario (Resoluciones): firma en los dos PDF; en el plan, encabezado con título y
pie por defecto "Lic. Daiana Ponce · M.P. 852". Con lo de esta HU, en la zona de la HU-015 alcanza con:

1. `buildAndSavePdf` (`pacientes/[id]/planes/[planId]/actions.ts`): reemplazar la consulta `logoRow`
   por `const branding = await loadProfessionalPdfBranding();` y pasar a `renderPlanPdf`:
   `professionalName: branding.displayName`, `logo: branding.logo`, `accentColor: branding.accentColor`,
   `footerText: branding.footerText || branding.footerSignature` (D5: el default deja de ser
   "Generado el … · NutriBot"), `signature: branding.signature`.
2. `plan-pdf.tsx`: sumar `signature?: PdfSignatureInput | null` a `PlanPdfInput` y, después del
   bloque "Notas" (o al final del contenido de la plantilla de la HU-015), dentro del `View` de
   contenido: `{input.signature ? <PdfSignatureBlock signature={input.signature} /> : null}`.
   `PdfSignatureBlock` trae sus propios estilos: no hace falta tocar `buildCommonStyles`.
3. Aviso en la página del plan: el mismo `professionalDataMissingNotice({ licenseMissing, signatureMissing })`
   con `pro.licenseNumber` y `pro.signatureMimeType` de `getProfessional()`, en un `Alert tone="warning"`
   con "Ir a Ajustes" → `/ajustes?tab=pdf` (idealmente en `plan-pdf-actions.tsx`).
4. Cambiar `PROFESSIONAL_TEXT.cardDescription` al texto original de la HU ("…aparecen en los PDF de
   planes e informes…").
5. Si la HU-015 genera Word además de PDF, la imagen y las líneas salen de `ProfessionalPdfBranding`
   (los datos no dependen de react-pdf); solo el componente es específico del PDF.

---

## 13. Archivos

| Acción | Archivo |
|---|---|
| Editar | `packages/db/prisma/schema.prisma` |
| Crear | `packages/db/prisma/migrations/<timestamp>_professional_signature/migration.sql` |
| Crear | `packages/db/domain/professionalSelect.ts`, `professionalSelect.test.ts`, `professionalAssets.test.ts`, `signature-privacy.test.ts` |
| Editar | `packages/db/domain/availability.ts`, `payments.ts`, `professionalAssets.ts`, `index.ts` |
| Crear | `packages/core/src/professional-identity.ts`, `professional-identity.test.ts` |
| Editar | `packages/core/src/isak-report.ts`, `packages/core/src/index.ts` |
| Editar | `apps/web/src/lib/pdf-common.tsx`, `apps/web/src/lib/anthropometric-report-pdf.tsx`, `apps/web/src/lib/shell.ts` |
| Crear | `apps/web/src/lib/professional-pdf.ts`, `apps/web/src/lib/anthropometric-report-pdf.test.tsx` |
| Editar | `apps/web/src/app/(panel)/pacientes/[id]/report-actions.ts` |
| Editar | `apps/web/src/app/(panel)/pacientes/[id]/consultas/[consultationId]/antropometria/informe/page.tsx`, `report-editor.tsx` |
| Editar | `apps/web/src/app/(panel)/ajustes/page.tsx`, `settings-form.tsx` |
| Crear | `apps/web/src/app/(panel)/ajustes/signature-form.tsx`, `signature-actions.ts`, `signature-actions.test.ts` |
| Crear | `apps/web/src/app/api/professional/signature/route.ts`, `route.test.ts` |
| Editar | `apps/web/src/middleware.test.ts` |
| Editar | `apps/web/src/app/(portal)/layout.tsx`, `apps/web/src/app/(portal)/portal/page.tsx` |

---

## 14. Checklist atómico

### Paso 0: rama al día
- [ ] `git fetch origin`. Confirmar que estás en `feat/hu-016-matricula-firma` y que no tiene commits propios (`git log origin/develop..HEAD` vacío).
- [ ] `git merge --ff-only origin/develop` (hoy `5d5ddc1`). Si no es fast-forward, parar y avisar.
- [ ] Confirmar que `origin/develop` no trae migraciones nuevas respecto de la base: `ls packages/db/prisma/migrations | tail -3` y `prisma migrate status` ("up to date"). Si hay pendientes o drift → `blocked`.
- [ ] `npm ci` si cambió `package-lock.json`; `npm run db:generate`; `npm run typecheck` y `npm run test` en verde **antes** de tocar nada (línea de base).

### Paso 1: `packages/db` — esquema y migración (skill `migracion-prisma`)
- [ ] Respaldo **fuera del repo**: `mkdir -p ~/nutribot-backups && docker compose exec -T db pg_dump -U nutri -d nutribot -Fc > ~/nutribot-backups/pre-hu016-$(date +%Y%m%d%H%M).dump` y comprobar que el archivo no pesa 0.
- [ ] Editar `schema.prisma` (4.1).
- [ ] Desde `packages/db`: `npx dotenv -e ../../.env -- prisma migrate dev --create-only --name professional_signature`.
  - Si no corre en modo no interactivo: crear la carpeta `prisma/migrations/<YYYYMMDDHHMMSS>_professional_signature/` y generar el SQL con `npx dotenv -e ../../.env -- prisma migrate diff --from-schema-datasource prisma/schema.prisma --to-schema-datamodel prisma/schema.prisma --script > …/migration.sql` (solo lee la base).
- [ ] Revisar el SQL: tiene que ser **exactamente** el de 4.2. Cualquier otra sentencia → parar.
- [ ] Probar el SQL en una transacción revertida: `docker compose exec -T db psql -U nutri -d nutribot -v ON_ERROR_STOP=1 -c 'BEGIN; ALTER TABLE "Professional" ADD COLUMN "signatureData" BYTEA, ADD COLUMN "signatureMimeType" TEXT; ROLLBACK;'`.
- [ ] Aplicar: `npm run db:migrate` (raíz). Si ofrece reset o detecta drift: **cancelar** y `blocked`.
- [ ] `npm run db:generate`. `prisma migrate status` → up to date.

### Paso 2: `packages/core`
- [ ] Crear `professional-identity.ts` (5.1) con `PROFESSIONAL_TEXT` (8.4).
- [ ] Mover `professionalSignature` ahí; en `isak-report.ts`, `export { professionalSignature } from "./professional-identity";`.
- [ ] Borrar `licenseMissing` de `ISAK_REPORT_TEXT`.
- [ ] `index.ts`: `export * from "./professional-identity";`.
- [ ] `professional-identity.test.ts` (9.1). `npx vitest run packages/core` en verde (incluye `isak-report.test.ts` sin cambios).

### Paso 3: `packages/db/domain`
- [ ] Crear `professionalSelect.ts` (5.2) y exportarlo en `index.ts`.
- [ ] `availability.ts`: `select: PROFESSIONAL_SELECT` en `getProfessional` y en `checkSlotAvailable`.
- [ ] `payments.ts`: `select: PROFESSIONAL_SELECT` en el `findUniqueOrThrow` de `Professional`.
- [ ] `professionalAssets.ts`: las 4 funciones nuevas (5.2).
- [ ] Tests: `professionalSelect.test.ts`, `professionalAssets.test.ts`, `signature-privacy.test.ts` (9.2). Correr también `appointments-booking.test.ts` y `payments.test.ts`.
- [ ] `npm run typecheck` (aquí ya tiene que pasar `apps/bot`; `apps/web` puede fallar solo en `report-editor`/`page.tsx` del informe por `licenseMissing`: se arregla en el paso 5).

### Paso 4: `apps/web` — piezas compartidas
- [ ] `pdf-common.tsx`: `PdfImage`, `pdfImageSrc`, `pdfLogoSrc = pdfImageSrc`, `PdfSignatureInput`, `PdfSignatureBlock` (5.3). Nada más del archivo cambia.
- [ ] Crear `lib/professional-pdf.ts` (5.4).
- [ ] Crear `api/professional/signature/route.ts` (5.5) y `route.test.ts`; agregar los casos a `middleware.test.ts` (9.3).

### Paso 5: `apps/web` — informe
- [ ] `anthropometric-report-pdf.tsx` (7.1).
- [ ] `report-actions.ts` (7.2).
- [ ] `informe/page.tsx` y `report-editor.tsx` (7.3).
- [ ] `lib/anthropometric-report-pdf.test.tsx` (9.3) y revisión visual con `HU016_PDF_DIR` (10.4).

### Paso 6: `apps/web` — `/ajustes`
- [ ] Crear `signature-actions.ts` (5.5) y `signature-actions.test.ts` (9.3).
- [ ] Crear `signature-form.tsx` (8.1).
- [ ] `settings-form.tsx`: quitar `signaturePreview` y el `<p>` del pie.
- [ ] `page.tsx`: tarjeta "Firma y matrícula", `SignatureForm`, texto del logo (8.1).
- [ ] Abrir `/ajustes?tab=pdf` en el navegador **sin guardar nada**: estado vacío ("Sin firma", bloque con solo línea + aclaración), ayuda, botón "Subir firma"; elegir un PDF y un archivo > 1 MB y comprobar el error del pre-chequeo del cliente (no llega a guardar porque el pre-chequeo de tamaño corta; para el PDF chico, el error lo da el servidor **sin escribir**: la validación es previa al `update`).

### Paso 7: `apps/web` — portal
- [ ] `shell.ts`: `getProfessionalPortalName()` (5.6).
- [ ] `(portal)/layout.tsx` y `(portal)/portal/page.tsx` (8.3).

### Paso 8: cierre
- [ ] Toda la verificación de la sección 10.
- [ ] Escribir `progress/impl_HU-016.md` (archivos, salida de verificación, capturas/observaciones del PDF, preguntas que hayan quedado).

---

## 15. Preguntas técnicas (con default; no bloquean)

- **P1. ¿401 o redirección?** El escenario dice "recibe 401". Con el middleware actual, un pedido
  sin sesión del panel (o con sesión solo del portal) a `/api/professional/signature` recibe una
  **redirección a `/inicio`** de Auth.js antes de llegar al handler; el handler devuelve 401 si se
  llega sin sesión. En ningún caso se ve la imagen. **Default:** aceptar el comportamiento del
  middleware (es el mismo que hoy tiene `/api/professional/logo`) y no tocar `auth.config.ts` ni
  `middleware.ts`; el 401 queda cubierto por el test del handler.
- **P2. Descripción de la tarjeta.** La HU dice "…aparecen en los PDF de planes e informes…", pero
  por D12 el plan todavía no muestra firma ni matrícula. **Default:** "Tu título, matrícula y firma
  aparecen en el informe antropométrico, y tu título y matrícula en el portal del paciente." y
  pasar al texto de la HU cuando se enchufe el plan (sección 12, punto 4).
- **P3. Textos del aviso "solo firma" y "las dos".** La HU da completo solo el de matrícula y
  trunca el de las dos. **Default:** los de 8.4.
- **P4. Logo.** La HU sugiere usar `professionalAssets.ts` también para el logo y el logo acepta
  WEBP (que react-pdf no dibuja). **Default:** no tocar el logo en esta HU (fuera de alcance; las
  actions del logo siguen con `prisma` directo). Queda anotado como deuda: el logo WEBP no sale en
  los PDF.
- **P5. `logoData` fuera de `getProfessional()`.** Se excluye junto con la firma porque nadie lo
  usa desde ahí y evita traer hasta 2 MB en cada mensaje del bot. **Default:** excluirlo (el
  typecheck de web y bot confirma que no rompe).

## 16. Resoluciones del usuario (2026-10-03) — tienen prioridad sobre el resto de la SDD

- **P1–P3, P5:** se aceptan los defaults de la sección 15.
- **P4: se suma el arreglo del logo.** El logo deja de aceptar WEBP: solo PNG o JPG, con la misma
  validación en el servidor por magic bytes y tamaño que la firma (reutilizar el mismo helper). Si
  la fila de `Professional` ya tiene un logo con `logoMimeType = image/webp` (u otro que react-pdf
  no dibuje), **no se borra ni se convierte**: el panel muestra un aviso en la tarjeta del logo
  ("Tu logo está en un formato que no sale en los PDF. Volvé a subirlo en PNG o JPG.") y los PDF
  siguen saliendo sin logo como hoy. Tests de la validación y del aviso. El logo sigue fuera de
  `getProfessional()` (P5).
