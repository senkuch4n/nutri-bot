# SDD · HU-028a · Mercado Pago de señas por consultorio

HU: `docs/hu-integraciones-por-consultorio.md` (validada 2026-11-25, D1–D16 = recomendaciones).
Issue #71 · rama `feat/HU-028-integraciones-por-consultorio` · responsable `senkuch4n` · **lleva
migración** (label `migración`; solo una HU con migración en `implementando` a la vez).

Esta SDD cubre **solo la entrega 028a**. 028b (Google Calendar) y 028c (IA) tienen su propia SDD
(ver §13, notas para ellas). Skills aplicados: `skills/migracion-prisma.md` y `skills/refactor.txt`
(diagnóstico + radio de impacto + checklist; el plan vive acá, no en un `REFACTOR_PLAN.md`).

---

## 1. Resumen funcional

Cada consultorio conecta, ve, reconecta y desconecta **su propia** cuenta de Mercado Pago de señas
(misma OAuth/PKCE, cifrado, renovación y avisos de HU-023). `MercadoPagoAccount` deja de ser la
fila única `id = 1` y pasa a una fila por tenant (`tenantId` obligatorio y único, id generado), y
una misma cuenta de MP no puede estar en dos consultorios (D3a, `userId` único). El `state` del
OAuth se ata a la persona (`userId`) y al consultorio (`tenantId`). Solo el `OWNER` conecta,
reconecta o desconecta (D4b). El webhook identifica la cuenta por el `user_id` de la notificación y
lo **re-verifica** consultando el pago con el token de esa cuenta y exigiendo que el `Payment`
local sea de ese consultorio y de ese `mercadopagoUserId`. Los crons de conciliación, vencimiento y
renovación recorren los consultorios con trabajo de MP, aislando fallas por consultorio (D2a). La
fila de producción (`id = 1`, `legacy-tenant`, cuenta de Joel, liveMode) se conserva tal cual: mismo
id, mismos ciphertexts (el AAD es por campo, no por id: `SECRET_AAD` en `secretBox.ts`), sin
reconectar.

## 2. Diagnóstico (skill refactor)

- `packages/db/domain/mercadopagoAccount.ts` fija `ACCOUNT_ID = 1` en todas las consultas,
  `ensureAccountRow` inserta `id = 1` y `singletonHasUnverifiedOwner` existe solo para no adoptar la
  fila de otro tenant. Un segundo consultorio no puede conectar nada.
- `resolveMercadoPagoWebhookTenant()` lee la fila única: con dos cuentas no sabe a qué consultorio
  va el webhook.
- `MercadoPagoOAuthState` ata el state al `sessionEmail` y **no guarda `tenantId`** (el `create` de
  `startMercadoPagoOAuth` no lo escribe): el callback no compara consultorio.
- Conectar/desconectar usa `requireTenantContext("write")` (cualquier miembro).
- `apps/bot/src/workers.ts`: conciliación, vencimiento y renovación usan `getConversationTenant()`
  (= `legacy-tenant`), así que nada de otro consultorio se concilia ni vence.
- `getMercadoPagoCredentials` permite el respaldo `.env` (dev) para cualquier tenant sin fila.
- `syncMercadoPagoPayment` acepta un `Payment` con `mercadopagoUserId = null` aunque la credencial
  sea de una cuenta OAuth.

## 3. Workspaces afectados

| Workspace | ¿Se toca? | Qué |
|---|---|---|
| `packages/db` | **Sí** | `schema.prisma` + migración; `domain/mercadopagoAccount.ts`, `domain/payments.ts`; tests con mocks; probe de dos consultorios y test de la migración en Postgres descartable. |
| `packages/core` | **Sí** | `MercadoPagoCallbackResult` + `"account_in_use"` y su texto; `parseMercadoPagoNotificationUserId`; `isPlatformMercadoPagoUserId`; tests vitest. |
| `apps/web` | **Sí** | Acciones de Ajustes (owner-only, `userId`), callback OAuth (owner-only, `userId`), webhook (lee `user_id` del cuerpo), sección MP (botones solo para OWNER), `guard-coverage.test.ts`. |
| `apps/bot` | **Sí** | `workers.ts`: crons de MP por consultorio con aislamiento de fallas. `conversation.ts` **no cambia** (ya pasa el tenant de la conversación). |

**Impacto cruzado (AGENTS.md, "El contrato"):** cambian firmas de `packages/db/domain` que consume
web (`startMercadoPagoOAuth`, `completeMercadoPagoOAuth`, `handleMercadoPagoWebhook`) y se agregan
funciones que consume el bot (`listMercadoPagoTenants`). Se borra `resolveMercadoPagoWebhookTenant`
(solo lo usaba `payments.ts`). `npm run typecheck` tiene que pasar en **web y bot**.

## 4. Esquema

### 4.1 Prisma (cambios exactos)

```prisma
model User {
  // ... sin cambios ...
  memberships            TenantMembership[]
  /// HU-028a: states de OAuth de Mercado Pago iniciados por esta persona.
  mercadoPagoOAuthStates MercadoPagoOAuthState[]
}

/// HU-023 / HU-028a: cuenta de Mercado Pago de señas de UN consultorio (fila por tenant), vinculada por
/// OAuth (aplicación "Numa"). La fila puede existir sin cuenta vinculada (guarda el tope del aviso
/// "falta Mercado Pago"). Se crea perezosamente con INSERT ... ON CONFLICT ("tenantId") DO NOTHING.
/// La fila de legacy-tenant conserva id = 1 (migración 028a). Nunca guarda credenciales de Arzium (HU-029).
/// DATO SENSIBLE: accessTokenEnc / refreshTokenEnc (AES-256-GCM, MERCADOPAGO_TOKEN_KEY, AAD por campo).
/// Solo los lee domain/mercadopagoAccount.ts; nunca viajan al navegador ni a los logs.
model MercadoPagoAccount {
  id              Int       @id @default(autoincrement())
  tenantId        String    @unique
  tenant          Tenant    @relation(fields: [tenantId], references: [id], onDelete: Restrict)
  /// user_id de MP de la cuenta vinculada. null = sin cuenta. Único entre consultorios (D3a).
  userId          String?   @unique
  // ... resto de los campos SIN cambios (nickname … updatedAt) ...
}

/// HU-023 / HU-028a: estado temporal del OAuth (anti-CSRF + PKCE). Un solo uso (DELETE ... RETURNING),
/// vence a los 10 minutos. El callback exige la misma persona (userId) y el mismo consultorio (tenantId).
model MercadoPagoOAuthState {
  id              String   @id @default(cuid())
  tenantId        String
  tenant          Tenant   @relation(fields: [tenantId], references: [id], onDelete: Restrict)
  /// HU-028a: User.id de quien inició el flujo.
  userId          String
  user            User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  stateHash       String   @unique
  codeVerifierEnc String
  /// HU-023, en desuso desde 028a (ya no se escribe ni se compara). Se borra en la migración de 028b.
  sessionEmail    String?
  expiresAt       DateTime
  createdAt       DateTime @default(now())

  @@index([expiresAt])
  @@index([tenantId])
  @@index([userId])
}
```

`Tenant.mercadoPagoAccount MercadoPagoAccount?` y `Tenant.mercadoPagoOAuthStates` no cambian.
`Payment` no cambia (`mercadopagoUserId` ya existe).

Por qué `Int autoincrement` y no `cuid`: la fila de producción conserva `id = 1` y, durante la
ventana del deploy (ver §11), el binario viejo sigue consultando `WHERE id = 1 AND "tenantId" = …`:
con `Int` esas consultas siguen siendo válidas; con `TEXT` fallarían por tipo.

### 4.2 Migración `mercadopago_account_per_tenant`

Crear con `--create-only` (skill `migracion-prisma`), y **reemplazar** el SQL generado por este
(Prisma no genera el `setval`, el chequeo previo ni el `DELETE` de states; el resto tiene que
coincidir con lo que genera — se confirma con el chequeo de drift del §11.4):

```sql
-- HU-028a: una cuenta de Mercado Pago de señas por consultorio.
-- La fila existente (legacy-tenant, id = 1) conserva id, tokens cifrados y fechas: el AAD es por campo.
BEGIN;

-- Fail closed: una fila sin dueño no se puede atribuir a ningún consultorio. No se adopta ni se borra.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "MercadoPagoAccount" WHERE "tenantId" IS NULL) THEN
    RAISE EXCEPTION 'HU-028a: MercadoPagoAccount tiene filas sin tenantId; resolver a mano antes de migrar';
  END IF;
END $$;

-- id generado; la próxima fila arranca después del máximo actual (prod: 2).
CREATE SEQUENCE "MercadoPagoAccount_id_seq" AS INTEGER OWNED BY "MercadoPagoAccount"."id";
SELECT setval('"MercadoPagoAccount_id_seq"', COALESCE((SELECT MAX(id) FROM "MercadoPagoAccount"), 0) + 1, false);
ALTER TABLE "MercadoPagoAccount" ALTER COLUMN "id" SET DEFAULT nextval('"MercadoPagoAccount_id_seq"');

ALTER TABLE "MercadoPagoAccount" ALTER COLUMN "tenantId" SET NOT NULL;
-- D3a: una cuenta de MP en un solo consultorio (NULL = sin cuenta, se admiten varios).
CREATE UNIQUE INDEX "MercadoPagoAccount_userId_key" ON "MercadoPagoAccount"("userId");

-- States de OAuth: efímeros (10 min) y sin userId/tenantId confiable. Los que estén en vuelo se
-- descartan: quien estaba conectando ve "No pudimos verificar la conexión" y reintenta.
DELETE FROM "MercadoPagoOAuthState";
ALTER TABLE "MercadoPagoOAuthState" ADD COLUMN "userId" TEXT NOT NULL;
ALTER TABLE "MercadoPagoOAuthState" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "MercadoPagoOAuthState" ALTER COLUMN "sessionEmail" DROP NOT NULL;
CREATE INDEX "MercadoPagoOAuthState_userId_idx" ON "MercadoPagoOAuthState"("userId");
ALTER TABLE "MercadoPagoOAuthState" ADD CONSTRAINT "MercadoPagoOAuthState_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

COMMIT;
```

Filas existentes:
- `MercadoPagoAccount`: no se agrega ninguna columna `NOT NULL` nueva; `tenantId` ya está
  completo desde `20261120050343_integration_ownership` (el `DO $$` lo garantiza o aborta). El
  `UNIQUE(userId)` no puede fallar en prod (una fila). En dev, si hubiera dos filas con el mismo
  `userId` (no debería: el id era fijo), la migración aborta: parar y avisar.
- `MercadoPagoOAuthState.userId NOT NULL`: sin backfill posible (no hay de dónde sacar el
  `userId`); se borran los states, que son temporales (no son datos de negocio).
- Si Prisma genera además `DROP/ADD CONSTRAINT` de las FK de `tenantId` (por pasar de opcional a
  requerida), se pueden conservar en el SQL siempre que queden `ON DELETE RESTRICT ON UPDATE
  CASCADE`, iguales a las actuales. Lo que decide es que el chequeo de drift dé vacío.

Rollback (solo si hiciera falta, a mano y con el `pg_dump` del deploy a mano): `DROP INDEX
"MercadoPagoAccount_userId_key"; ALTER … "tenantId" DROP NOT NULL; ALTER … "id" SET DEFAULT 1; DROP
SEQUENCE …; DROP` de la FK, índice y columna `userId` de states; `sessionEmail SET NOT NULL` (después
de borrar los states). Se documenta, no se automatiza.

## 5. Contrato compartido

### 5.1 `packages/core` (puro, con tests)

`packages/core/src/mercadopago-oauth.ts`:

```ts
export type MercadoPagoCallbackResult =
  | "connected" | "denied" | "invalid_state" | "rejected" | "not_configured" | "wrong_environment"
  | "account_in_use"; // HU-028a (D3a)

// MERCADOPAGO_TEXT.callback.account_in_use:
"Esta cuenta de Mercado Pago ya está conectada en otro consultorio. Usá otra cuenta o escribinos a soporte."

/** HU-028a: user_id del cuerpo de una notificación de MP (`{ user_id: 123 }` o `"123"`).
 *  Solo dígitos, 1..20 caracteres; cualquier otra cosa (null, objeto, negativo, "12a") → null. */
export function parseMercadoPagoNotificationUserId(body: unknown): string | null;

/** HU-028a: true si `userId` es la cuenta de cobro de Arzium (env ARZIUM_MERCADOPAGO_USER_ID, la
 *  define HU-029). Variable vacía o ausente → false siempre. */
export function isPlatformMercadoPagoUserId(userId: string, env: Record<string, string | undefined>): boolean;
```

Consumidores: `parseMercadoPagoNotificationUserId` → web (webhook). `isPlatformMercadoPagoUserId`
→ db (`completeMercadoPagoOAuth`). El texto nuevo → web (banner `?mp=account_in_use`, ya genérico
vía `T.callback[result]` en `mercadopago-section.tsx`).

### 5.2 `packages/db/domain/mercadopagoAccount.ts`

Se **eliminan**: `ACCOUNT_ID`, `singletonHasUnverifiedOwner`, `resolveMercadoPagoWebhookTenant`.
Todo `where: { id: ACCOUNT_ID, tenantId }` pasa a `where: { tenantId }` (es `@unique`).

Internos nuevos/cambiados:

```ts
/** INSERT INTO "MercadoPagoAccount" ("tenantId","updatedAt") VALUES ($t,$now) ON CONFLICT ("tenantId") DO NOTHING.
 *  (Cada conflicto consume un valor de la secuencia: los huecos de id son esperables.) */
async function ensureAccountRow(tx: Tx, now: Date, tenantId: string): Promise<void>;

/** SELECT ... FROM "MercadoPagoAccount" WHERE "tenantId" = $t FOR UPDATE.
 *  create: true → antes llama a ensureAccountRow (solo saveConnection y notifyMercadoPagoMissingForBooking).
 *  create: false → sin fila devuelve row: null (refresh/markError/disconnect no crean filas). */
async function lockAccountRow(tx: Tx, t: TenantRef, now: Date, opts: { create: boolean }):
  Promise<SchedulingContext & { row: AccountRow | null }>;
```

API (firmas exactas; **cambian** las marcadas):

```ts
// SIN CAMBIO de firma:
export async function getMercadoPagoConnectionView(t: TenantRef): Promise<MercadoPagoConnectionView>; // web
export async function isMercadoPagoCheckoutAvailable(t: TenantRef, deps?: MercadoPagoHttpDeps): Promise<boolean>; // bot
export async function notifyMercadoPagoMissingForBooking(t: TenantRef, p: {...}): Promise<boolean>; // bot
export async function markMercadoPagoAccountError(t: TenantRef, code: MercadoPagoErrorCode): Promise<void>; // web+bot
export async function refreshMercadoPagoAccountToken(t: TenantRef, opts?: { force?: boolean }, deps?: MercadoPagoHttpDeps):
  Promise<"refreshed" | "not_needed" | "not_connected" | "transient_error" | "revoked" | "refresh_failed">; // bot
export async function getMercadoPagoCredentials(t: TenantRef, scope: ..., deps?): Promise<MercadoPagoCredentials | null>; // web+bot
export async function disconnectMercadoPagoAccount(t: TenantRef): Promise<{ cancelledDeposits: number }>; // web

// CAMBIA (web): sessionEmail → actor.userId
export async function startMercadoPagoOAuth(
  t: TenantRef,
  actor: { userId: string },
  deps?: MercadoPagoHttpDeps,
): Promise<{ url: string }>;

// CAMBIA (web): input.sessionEmail → input.userId
export async function completeMercadoPagoOAuth(
  t: TenantRef,
  input: { userId: string; query: URLSearchParams },
  deps?: MercadoPagoHttpDeps,
): Promise<MercadoPagoCallbackResult>;

// NUEVA (web, vía payments.ts): reemplaza resolveMercadoPagoWebhookTenant
export async function resolveMercadoPagoWebhookAccount(
  notifiedUserId: string | null,
  env?: Record<string, string | undefined>,
): Promise<{ tenant: TenantRef; sellerUserId: string | null } | null>;

// NUEVA (bot): consultorios con cuenta vinculada (userId no null), orden por tenantId.
export async function listConnectedMercadoPagoTenants(): Promise<TenantRef[]>;
```

Comportamiento (cambios respecto de HU-023/025b-2):

1. **`startMercadoPagoOAuth`**: el `create` del state escribe `tenantId: scope.tenantId`,
   `userId: actor.userId` y **no** escribe `sessionEmail`. El resto igual (fail closed sin agenda
   principal, limpieza de vencidos, PKCE).
2. **`consumeOAuthState(state, { userId, tenantId }, now)`**: `DELETE … WHERE "stateHash" = $h AND
   "userId" = $u AND "tenantId" = $t AND "expiresAt" > $now RETURNING "codeVerifierEnc"`. Otra
   persona u otro consultorio → `null` → `"invalid_state"` y el state **no** se consume (sigue
   siendo de quien lo inició hasta vencer).
3. **`completeMercadoPagoOAuth`**: sin `singletonHasUnverifiedOwner`. Orden: config → `parse` →
   `resolveTenantSchedulingContext` → `denied` (consume si el state es de esta persona/tenant) →
   consumir state → canje → `!userId` → `"rejected"` → live mode → **`isPlatformMercadoPagoUserId`
   → `"rejected"`** → **cuenta ya usada por otro tenant** (`findFirst({ where: { userId, NOT: {
   tenantId } }, select: { id: true } })`) → `"account_in_use"` → `/users/me` → `saveConnection`.
   `saveConnection` atrapa `Prisma.PrismaClientKnownRequestError` `P2002` sobre `userId` (carrera
   entre dos consultorios) y devuelve `"account_in_use"`; la transacción se revierte entera (no se
   pisan tokens ni se cancelan señas). Los tokens canjeados de una cuenta rechazada se descartan (no
   se guardan ni se loguean; no se revocan, igual que HU-023).
4. **`saveConnection`**: `lockAccountRow(…, { create: true })` y `update({ where: { tenantId } })`.
   D6 de HU-023 (`cancelDepositsNotPayableWith`) sigue igual: solo toca el `scope` del consultorio.
5. **`disconnectMercadoPagoAccount`**: `lockAccountRow(…, { create: false })`; sin fila →
   `{ cancelledDeposits: 0 }` sin escribir nada. Con fila: igual que hoy, solo la de ese tenant.
6. **`refreshMercadoPagoAccountToken`**: sin fila → `"not_connected"` (sin crearla).
7. **`markMercadoPagoAccountError` / `markErrorLocked`**: sin fila → no hace nada. El aviso
   `MERCADOPAGO_DISCONNECTED_ALERT` se encola con el `tenantId` y el `phoneJid` del consultorio
   dueño de la fila (ya es así por `resolveTenantSchedulingContext`).
8. **`notifyMercadoPagoMissingForBooking`**: `ensureAccountRow` del tenant y `UPDATE … WHERE
   "tenantId" = $t AND (missingAlertAt …)`: cada consultorio tiene su propio tope de 1 cada 24 h.
9. **`getMercadoPagoCredentials`**: fila por `{ tenantId }`. El respaldo `.env` aplica solo si
   `allowsMercadoPagoEnvToken(env) && tenantId === LEGACY_TENANT_ID` (además de las condiciones
   actuales). Se quita la rama `singletonHasUnverifiedOwner`.
10. **`resolveMercadoPagoWebhookAccount(notifiedUserId, env = process.env)`**:
    - `notifiedUserId` no null y hay fila con ese `userId` (y `accessTokenEnc` no null) →
      `{ tenant: { tenantId: row.tenantId }, sellerUserId: row.userId }`.
    - Si no: `allowsMercadoPagoEnvToken(env)` y **ninguna** fila con `userId = notifiedUserId` →
      `{ tenant: { tenantId: LEGACY_TENANT_ID }, sellerUserId: null }` (solo dev; en producción
      `allowsMercadoPagoEnvToken` es siempre false).
    - Si no: `null`. El llamador loguea `console.warn("[mercadopago] webhook_ignored", { code:
      "unknown_account" })` — solo el código, nada del payload.
11. **`listConnectedMercadoPagoTenants()`**: `findMany({ where: { userId: { not: null } }, select:
    { tenantId: true }, orderBy: { tenantId: "asc" } })`.

### 5.3 `packages/db/domain/payments.ts`

```ts
// CAMBIA (web): recibe el user_id ya parseado del cuerpo.
export async function handleMercadoPagoWebhook(
  query: Record<string, string | string[] | undefined>,
  notification: { userId: string | null },
): Promise<"processed" | "ignored">;

// NUEVA (bot): consultorios con al menos un Payment PENDING de MP en un turno con tenantId,
// distinct, orden por tenantId. Query: appointment.findMany({ where: { tenantId: { not: null },
// payments: { some: { status: "PENDING", provider: "mercadopago" } } }, distinct: ["tenantId"],
// select: { tenantId: true }, orderBy: { tenantId: "asc" } }).
export async function listTenantsWithPendingMercadoPagoPayments(): Promise<TenantRef[]>;
```

- `handleMercadoPagoWebhook`: extrae `paymentId` como hoy → `resolveMercadoPagoWebhookAccount(
  notification.userId)` → `null` ⇒ log `unknown_account` y `"ignored"` → si no,
  `syncMercadoPagoPayment(tenant, paymentId)` y `"processed"`.
- `syncMercadoPagoPayment` (firma sin cambio), endurecido:
  - Después del `get` del pago: si `creds.source === "account"` y `mpPayment.collector_id` viene
    definido y `String(mpPayment.collector_id) !== creds.sellerUserId` → return sin tocar nada.
    (Confirmar el nombre del campo en los tipos del SDK `mercadopago`; si no existe, omitir este
    chequeo y dejarlo anotado en `impl`.)
  - Regla de vendedor (reemplaza `existing.mercadopagoUserId && existing.mercadopagoUserId !==
    creds.sellerUserId`): `creds.source === "account"` ⇒ exige `existing.mercadopagoUserId ===
    creds.sellerUserId`; `creds.source === "env_fallback"` ⇒ exige `existing.mercadopagoUserId ===
    null`. Si no se cumple → return.
  - El `Payment` ya se filtra por el `scope` del tenant (sin cambios).
- `reconcilePendingPayments`, `expireStalePendingPayments`, `createDepositCheckout`: sin cambios
  (ya reciben `t` y piden credenciales por tenant).
- Consumidores de `MERCADOPAGO_NOTIFICATION_URL`: sin cambios (una URL para todas las cuentas; la
  cuenta sale del `user_id`).

### 5.4 Consumidores

| Función | web | bot |
|---|---|---|
| `startMercadoPagoOAuth`, `completeMercadoPagoOAuth`, `disconnectMercadoPagoAccount`, `getMercadoPagoConnectionView` | ✔ | — |
| `handleMercadoPagoWebhook` | ✔ | — |
| `listConnectedMercadoPagoTenants`, `listTenantsWithPendingMercadoPagoPayments` | — | ✔ |
| `refreshMercadoPagoAccountToken`, `reconcilePendingPayments`, `expireStalePendingPayments` | — | ✔ |
| `getMercadoPagoCredentials`, `markMercadoPagoAccountError` | ✔ (webhook) | ✔ |
| `isMercadoPagoCheckoutAvailable`, `createDepositCheckout`, `notifyMercadoPagoMissingForBooking` | — | ✔ (sin cambios en el llamador) |

## 6. Rutas / server actions / API

### 6.1 `apps/web/src/app/(panel)/ajustes/actions.ts`

- `connectMercadoPagoAction()`: `requireOwnerContext()` (antes `requireTenantContext("write")`).
  `TenantAccessError` → `redirect("/inicio")` (igual que hoy para "sin contexto"; un `STAFF` no ve
  el botón, así que solo llega forzando el POST). Llama `startMercadoPagoOAuth(ctx, { userId:
  ctx.userId })`. Se quita el `auth()` / email.
- `disconnectMercadoPagoAction()`: `requireOwnerContext()`; mismo manejo de error. Resto igual.

### 6.2 `apps/web/src/app/api/mercadopago/oauth/callback/route.ts`

- `requireOwnerContext()`:
  - `TenantAccessError` con `code === "owner_only"` → redirect `/ajustes?tab=mercadopago&mp=invalid_state`
    (no consume el state, no canjea).
  - otro `TenantAccessError` → `/inicio` (igual que hoy).
- `completeMercadoPagoOAuth(ctx, { userId: ctx.userId, query })`. Se quita `auth()` y el email.
- Banner: `?mp=account_in_use` lo resuelve `T.callback[result]` sin cambios de código.

### 6.3 `apps/web/src/app/api/webhooks/mercadopago/route.ts`

- Firma `x-signature` y los filtros previos: **sin cambios**.
- Dentro del `after()`: si `req.method === "POST" && req.body`, leer **siempre** el cuerpo una vez
  (`await req.json().catch(() => null)`); si falta `query.type` y `body.type` es string, completarlo
  (como hoy); `notifiedUserId = parseMercadoPagoNotificationUserId(body)`. GET o sin cuerpo →
  `notifiedUserId = null`.
- `await handleMercadoPagoWebhook(query, { userId: notifiedUserId })`. Respuesta HTTP igual (200
  antes de procesar). Nunca loguear el cuerpo.
- Una notificación sin `user_id` conocido se ignora: la conciliación del bot (cada minuto) la cubre
  para los pagos de cuentas conectadas.

### 6.4 `apps/web/src/app/(panel)/ajustes/page.tsx` y `mercadopago-section.tsx`

- `page.tsx` ya calcula `isOwner`. Pasarlo a la UI de MP: `MercadoPagoConnectButton`,
  `MercadoPagoDisconnectButton` y el botón "Reconectar" del aviso de error se renderizan **solo si
  `isOwner`**. Un `STAFF` ve estado y datos de la cuenta, sin botones. **Sin textos nuevos** (4.1).
- Ningún otro cambio visual.

### 6.5 `apps/web/src/guard-coverage.test.ts`

- `ROUTE_GUARDS` agrega `"requireOwnerContext("` (el callback deja de usar `requireTenantContext`).
- Test nuevo en el mismo archivo o en `mercadopago-actions.test.ts`: el source de
  `connectMercadoPagoAction` y `disconnectMercadoPagoAction` y del callback contiene
  `requireOwnerContext(` y no `requireTenantContext(` (D4b fijado).
- La excepción `LEGACY_EXEMPT["auth.ts"]` **no** se toca en 028a (es de 028b).

## 7. Bot: crons por consultorio (`apps/bot/src/workers.ts`)

```ts
async function reconcilePayments(): Promise<void> {
  if (paymentsRunning) return;
  paymentsRunning = true;
  try {
    const tenants = uniqueTenants([
      ...(await listConnectedMercadoPagoTenants()),
      ...(await listTenantsWithPendingMercadoPagoPayments()),
    ]); // dedupe por tenantId, orden estable
    for (const tenant of tenants) {
      try {
        const result = await reconcilePendingPayments(tenant, (paymentId) =>
          logger.warn({ tenantId: tenant.tenantId, paymentId }, "Error conciliando pago de Mercado Pago"));
        if (result.processed || result.failed || result.skipped) logger.info({ tenantId: tenant.tenantId, ...result }, "Conciliación Mercado Pago");
        if (result.failed === 0) await expireStalePendingPayments(tenant);
      } catch {
        logger.error({ tenantId: tenant.tenantId }, "Error en conciliación Mercado Pago");
      }
    }
  } catch {
    logger.error("Error en conciliación Mercado Pago");
  } finally {
    paymentsRunning = false;
  }
}

export async function runMercadoPagoRefresh(): Promise<void> {
  // listConnectedMercadoPagoTenants(); por cada uno, try/catch propio; log { tenantId, result }
  // solo si result no es not_needed/not_connected; error → logger.error({ tenantId }, "Error renovando Mercado Pago").
}
```

- `uniqueTenants` es un helper local de `workers.ts` (no amerita core).
- `getConversationTenant()` deja de usarse en estas dos funciones (sigue en el resto de crons,
  que son de HU-027).
- Nunca loguear el error crudo de MP (puede traer headers con el token): solo `tenantId`/`result`.
- Los avisos que estos crons encolan para un consultorio que no es `legacy-tenant` quedan en el
  outbox con su `tenantId`; el consumidor actual solo despacha `legacy-tenant` hasta HU-027. Es lo
  esperado: el criterio dice "se encola para B".

## 8. Mensajes del bot

**Ninguno nuevo.** Falta de MP (`professionalDepositUnavailableAlert`), incidente
(`MERCADOPAGO_DISCONNECTED_ALERT`), seña vencida/cancelada (`depositExpired`) y confirmación
(`bookingConfirmed`, `professionalNewBookingAlert`): textos actuales, encolados con el `tenantId`
del consultorio dueño. Texto nuevo **del panel** (banner): `MERCADOPAGO_TEXT.callback.account_in_use`
(§5.1).

## 9. Archivos y flujo (radio de impacto)

| Archivo | Acción |
|---|---|
| `packages/db/prisma/schema.prisma` | Modificar `User`, `MercadoPagoAccount`, `MercadoPagoOAuthState` (§4.1). |
| `packages/db/prisma/migrations/<ts>_mercadopago_account_per_tenant/migration.sql` | Crear (§4.2). |
| `packages/core/src/mercadopago-oauth.ts` (+ `.test.ts`) | `account_in_use`, texto, `parseMercadoPagoNotificationUserId`, `isPlatformMercadoPagoUserId`. |
| `packages/core/src/index.ts` | Exportar lo nuevo si el archivo no se reexporta entero (verificar). |
| `packages/db/domain/mercadopagoAccount.ts` (+ `.test.ts`) | §5.2. |
| `packages/db/domain/payments.ts` (+ `.test.ts`) | §5.3. |
| `packages/db/domain/mercadopago-privacy.test.ts` | Ajustar a las firmas nuevas; sumar: el log `unknown_account` no lleva payload. |
| `packages/db/scripts/tenant-isolation-b2.integration.ts` | Fixture de D por `tenantId` (no `id: 1`); el test "la cuenta de MP de D no existe para C" pasa a: C ve "sin cuenta", credenciales `null`, `disconnect` → `{cancelledDeposits: 0}` sin cambios en la base, `markError` sin cambios; `notifyMissing(C)` crea **la fila de C** (y su aviso si C tiene `phoneJid`) sin tocar la de D. |
| `packages/db/scripts/mercadopago-per-tenant.integration.ts` | **Crear**: probe A/B (§11.3). |
| `packages/db/scripts/test-mercadopago-per-tenant.sh` | **Crear**: Postgres descartable: test de la migración con datos tipo producción + probe A/B + chequeo de drift (§11.4). Modelo: `test-tenant-isolation.sh` (usa `docker` del entorno, red y contenedor propios, tmpfs, `127.0.0.1` aleatorio, sin `.env`, `--pull never`). |
| `packages/db/package.json` | Script `"test:mp-tenants": "bash scripts/test-mercadopago-per-tenant.sh"`. |
| `apps/web/src/app/(panel)/ajustes/actions.ts` | §6.1. |
| `apps/web/src/app/(panel)/ajustes/mercadopago-actions.test.ts` | Owner-only, `userId`. |
| `apps/web/src/app/api/mercadopago/oauth/callback/route.ts` (+ `.test.ts`) | §6.2. |
| `apps/web/src/app/api/webhooks/mercadopago/route.ts` (+ `.test.ts`) | §6.3. |
| `apps/web/src/app/(panel)/ajustes/page.tsx`, `mercadopago-section.tsx` (+ `page.test.tsx`) | §6.4. |
| `apps/web/src/guard-coverage.test.ts` | §6.5. |
| `apps/bot/src/workers.ts` (+ `workers.test.ts`) | §7. |
| `apps/bot/scripts/test-mercadopago-sandbox.ts` | Solo si deja de compilar (no se corre en la verificación: es interactivo y con sandbox real). |
| `.env.example` (si existe la sección MP) | Documentar `ARZIUM_MERCADOPAGO_USER_ID=` vacío ("HU-029; nunca la cuenta de un consultorio"). |
| `deploy/README.md` | Nota de deploy de 028a (§11). |

No se tocan: `apps/bot/src/conversation.ts`, `secretBox.ts`, `mercadopagoOAuthClient.ts`,
`mercadopago-signature.ts`, `middleware.ts`, `auth.ts`, `auth.config.ts`.

## 10. Checklist atómico

Antes de empezar: `git fetch && git status` (rama `feat/HU-028-integraciones-por-consultorio`,
traer `develop` si avanzó). Confirmar que ninguna otra HU con label `migración` está en
`implementando`.

### packages/db — esquema y migración
- [ ] 1. `pg_dump` de la base de desarrollo **fuera del repo**:
  `docker compose exec -T db pg_dump -U nutri -Fc nutribot > ~/nutribot-dev-pre-028a.dump`.
- [ ] 2. `npx prisma migrate status` (desde `packages/db`, con el `.env` de la raíz): sin drift. Si
  hay drift → `blocked` con la salida (nunca reset).
- [ ] 3. Lectura de solo lectura en dev: `SELECT id, "tenantId", "userId" IS NOT NULL AS connected
  FROM "MercadoPagoAccount";` y `SELECT count(*) FROM "MercadoPagoOAuthState";`. Si hay una fila con
  `tenantId` NULL → parar y avisar (la migración va a abortar a propósito).
- [ ] 4. Editar `schema.prisma` (§4.1).
- [ ] 5. `npx dotenv -e ../../.env -- prisma migrate dev --create-only --name mercadopago_account_per_tenant`.
- [ ] 6. Reemplazar el SQL por el de §4.2; revisar que no quede ningún `DROP COLUMN`/`DROP TABLE`.
- [ ] 7. `npm run db:migrate` y `npm run db:generate`.
- [ ] 8. Releer en dev: la fila (si existía) conserva `id`, `tenantId`, `userId`, `accessTokenEnc`
  (comparar `md5("accessTokenEnc")` antes/después) y `nextval` no se consumió a mano.

### packages/core
- [ ] 9. RED: tests de `parseMercadoPagoNotificationUserId`, `isPlatformMercadoPagoUserId` y
  `MERCADOPAGO_TEXT.callback.account_in_use` en `mercadopago-oauth.test.ts`.
- [ ] 10. GREEN: implementar (§5.1). `npx vitest run packages/core`.

### packages/db — dominio
- [ ] 11. RED en `mercadopagoAccount.test.ts` para cada punto de §5.2 (lista en §11.2).
- [ ] 12. `mercadopagoAccount.ts`: quitar `ACCOUNT_ID`/`singletonHasUnverifiedOwner`;
  `ensureAccountRow` con `ON CONFLICT ("tenantId")`; `lockAccountRow(…, { create })`.
- [ ] 13. `startMercadoPagoOAuth(t, actor)` + `consumeOAuthState` por `userId`+`tenantId`.
- [ ] 14. `completeMercadoPagoOAuth`: plataforma, `account_in_use` (pre-chequeo + `P2002`).
- [ ] 15. `disconnect`/`refresh`/`markError` sin crear filas; `notifyMissing` por tenant.
- [ ] 16. `getMercadoPagoCredentials`: respaldo `.env` solo `LEGACY_TENANT_ID`.
- [ ] 17. `resolveMercadoPagoWebhookAccount` y `listConnectedMercadoPagoTenants`; borrar
  `resolveMercadoPagoWebhookTenant`.
- [ ] 18. `payments.ts`: `handleMercadoPagoWebhook(query, notification)`, regla de vendedor
  estricta, `collector_id`, `listTenantsWithPendingMercadoPagoPayments`. Tests en `payments.test.ts`.
- [ ] 19. `mercadopago-privacy.test.ts` al día. `npx vitest run packages/db`.
- [ ] 20. `npm run typecheck` (va a fallar en web/bot hasta los pasos siguientes: es esperado).

### packages/db — probes en Postgres descartable
- [ ] 21. Ajustar `tenant-isolation-b2.integration.ts` (§9).
- [ ] 22. Crear `mercadopago-per-tenant.integration.ts` (§11.3) y `test-mercadopago-per-tenant.sh`
  (§11.4) + script en `package.json`.

### apps/web
- [ ] 23. `actions.ts`: owner-only + `userId` (§6.1); tests.
- [ ] 24. Callback: owner-only + `userId` + `owner_only` → `invalid_state` (§6.2); tests.
- [ ] 25. Webhook: cuerpo → `user_id` (§6.3); tests.
- [ ] 26. Ajustes: botones solo para OWNER (§6.4); `page.test.tsx`.
- [ ] 27. `guard-coverage.test.ts` (§6.5).

### apps/bot
- [ ] 28. `workers.ts`: conciliación/vencimiento y renovación por consultorio (§7).
- [ ] 29. `workers.test.ts`: casos de §11.5.

### Cierre
- [ ] 30. `.env.example` y `deploy/README.md` (§12).
- [ ] 31. Verificación completa (§11.6). Reporte en `progress/impl_HU-028a.md`.

Commits sugeridos (uno por bloque): migración+schema · core · domain · probes · web · bot · docs.

## 11. Tests y verificación

### 11.1 `packages/core` (vitest) — `mercadopago-oauth.test.ts`
- `parseMercadoPagoNotificationUserId`: `{ user_id: 123 }` → `"123"`; `{ user_id: "456" }` →
  `"456"`; `null`, `"x"`, `{}`, `{ user_id: null }`, `{ user_id: -1 }`, `{ user_id: 1.5 }`,
  `{ user_id: "12a" }`, `{ user_id: "1".repeat(21) }`, `{ user_id: { a: 1 } }` → `null`.
- `isPlatformMercadoPagoUserId`: env sin la variable o vacía → false; variable `" 99 "` y userId
  `"99"` → true; distinto → false.
- `MERCADOPAGO_TEXT.callback.account_in_use` es exactamente el texto de §5.1.

### 11.2 `packages/db` (vitest, mocks) — `mercadopagoAccount.test.ts` / `payments.test.ts`
- `startMercadoPagoOAuth` guarda `tenantId` y `userId`, no `sessionEmail`.
- callback: state de otra persona → `invalid_state`, sin canje (fetch no llamado), state no
  consumido; state de otro tenant → idem; vencido → idem.
- callback: cuenta ya conectada en otro tenant → `account_in_use`, sin `update` ni cancelación de
  señas; `P2002` en `saveConnection` → `account_in_use`.
- callback: `ARZIUM_MERCADOPAGO_USER_ID` = userId canjeado → `rejected`, nada guardado.
- `saveConnection`/`update` siempre con `where: { tenantId }` (nunca `id`).
- `disconnect` sin fila → `{ cancelledDeposits: 0 }` y ninguna escritura.
- `refresh` sin fila → `not_connected` sin `INSERT`.
- `getMercadoPagoCredentials` con respaldo `.env` habilitado: `legacy-tenant` sin cuenta → env;
  otro tenant sin cuenta → `null`.
- `resolveMercadoPagoWebhookAccount`: userId conocido → su tenant; desconocido sin respaldo →
  `null`; desconocido con respaldo dev → legacy con `sellerUserId: null`; `null` → `null` (sin
  respaldo).
- `handleMercadoPagoWebhook`: cuenta desconocida → `"ignored"`, `console.warn` con `{ code:
  "unknown_account" }` y nada del payload; no llama a MP.
- `syncMercadoPagoPayment`: credencial `account` + `Payment.mercadopagoUserId` null → no actualiza;
  `collector_id` distinto → no actualiza; mismo vendedor → actualiza y confirma (regresión).
- Regresión HU-023: los casos existentes siguen verdes.

### 11.3 Probe A/B en Postgres descartable — `mercadopago-per-tenant.integration.ts` (`tsx --test`)
Dos consultorios A y B con agenda principal, profesional con `phoneJid`, paciente, servicio con seña
y un OWNER cada uno. HTTP de MP inyectado por `deps.fetch` (canje, `/users/me`, refresh); **nunca**
red real. Casos:
1. A y B conectan (completando el OAuth con `deps`): dos filas, cada `getMercadoPagoConnectionView`
   muestra solo lo suyo.
2. B reconecta y desconecta: fila de A idéntica (foto de la fila antes/después, incluidos
   `accessTokenEnc`, `expiresAt`).
3. B intenta conectar el `user_id` de A → `account_in_use`; foto de la base idéntica.
4. State de A consumido con `userId` de B o con `tenantId` de B → `invalid_state`; el state sigue
   en la tabla.
5. `getMercadoPagoCredentials(A, current).sellerUserId` = user de A; para B, el de B.
6. B sin cuenta, A con cuenta: `isMercadoPagoCheckoutAvailable(B)` false;
   `notifyMercadoPagoMissingForBooking(B)` encola un aviso con `tenantId` B y el segundo llamado en
   24 h no; la fila de A no cambia.
7. `markMercadoPagoAccountError(B, "revoked")`: aviso solo para B; A sin cambios; refresh de A
   sigue `refreshed`/`not_needed`.
8. `disconnectMercadoPagoAccount(B)` con señas pendientes en A y B: solo cancela las de B.
9. `resolveMercadoPagoWebhookAccount(userA)` → A; `(userB)` → B; `("999")` → null.
10. `listConnectedMercadoPagoTenants()` = [A, B] (y sin B tras desconectar);
    `listTenantsWithPendingMercadoPagoPayments()` incluye a quien tenga pendientes.
11. `UNIQUE(userId)`: `INSERT` directo de una segunda fila con el user de A → error de unicidad.
Limpieza: el contenedor es `--rm` con tmpfs; no hay datos que borrar.

### 11.4 `test-mercadopago-per-tenant.sh` (Postgres descartable)
1. Copiar las migraciones **anteriores** a `mercadopago_account_per_tenant` a un scratch
   (`mktemp -d`), `prisma migrate deploy` contra el contenedor.
2. Fixture tipo producción (psql): fila `MercadoPagoAccount` `id = 1`, `tenantId =
   'legacy-tenant'`, `userId`, `liveMode = true`, `accessTokenEnc`/`refreshTokenEnc` sellados con una
   clave de prueba generada en el script; un `MercadoPagoOAuthState` en vuelo; un `Payment` PENDING
   con ese `mercadopagoUserId`.
3. Aplicar todas las migraciones (`migrate deploy` con la carpeta completa) y afirmar: `id = 1`,
   mismos `md5` de los `*Enc`, mismo `userId`/`expiresAt`; `openSecret` con la clave de prueba
   descifra igual; `nextval` = 2; states = 0; `Payment.mercadopagoUserId` sin cambios;
   `"tenantId"` NOT NULL en ambas tablas.
4. Variante: fila con `tenantId` NULL → la migración aborta y la tabla queda igual (rollback).
5. Correr `mercadopago-per-tenant.integration.ts` (el b2 ajustado lo corre `test-tenant-isolation.sh`).
6. Drift: `prisma migrate diff --from-url <url del contenedor descartable> --to-schema-datamodel
   prisma/schema.prisma --exit-code` → exit 0. **Solo contra el contenedor descartable; nunca
   `DATABASE_URL` ni `--from-migrations`/`--shadow-database-url` contra la base de dev** (AGENTS.md).

### 11.5 `apps/bot` — `workers.test.ts`
- `reconcilePayments` recorre la unión deduplicada de las dos listas; `reconcilePendingPayments`
  que tira en B no impide que A se procese ni que A venza señas; `failed > 0` en B no vence B pero
  sí A.
- `runMercadoPagoRefresh` llama `refreshMercadoPagoAccountToken` por cada tenant conectado; un
  `throw` en B no frena a A; los logs llevan `tenantId` y nunca el error crudo.
- No se llama `getConversationTenant` en estas dos funciones.

### 11.6 Verificación (comandos exactos, desde la raíz)

```bash
npm run db:generate
npm run typecheck                                   # core, db, web y bot: 0 errores
npm run test                                        # vitest de todo el monorepo
npx vitest run packages/core/src/mercadopago-oauth.test.ts packages/db/domain apps/web/src/app/api/mercadopago apps/web/src/app/api/webhooks/mercadopago "apps/web/src/app/(panel)/ajustes" apps/web/src/guard-coverage.test.ts apps/bot/src/workers.test.ts
npm run test:mp-tenants --workspace packages/db     # migración con datos tipo prod + probe A/B + drift (Postgres descartable)
bash packages/db/scripts/test-tenant-isolation.sh   # aislamiento 025b (incluye b2 ajustado), Postgres descartable
npx prisma migrate status --schema packages/db/prisma/schema.prisma   # con el .env de la raíz: al día, sin drift
npm run test:confirm-flow --workspace apps/bot      # regresión del flujo sí/no (limpia por id)
npm run test:booking-reason --workspace apps/bot    # regresión de reservas (sin WhatsApp real)
npm run build --workspace apps/web
./ops/harness/verify.sh
```

Reglas para el implementer: **ninguna** verificación manda WhatsApp, arranca el bot ni toca la
sesión de Baileys; nada de cobros reales ni llamadas reales a MP (todo por `deps.fetch` o mocks).
En la base de desarrollo solo lecturas y las simulaciones que limpian por id; los probes de dos
consultorios corren solo en Postgres descartable. No correr `db:seed`/`seed:demo`.
`test:mercadopago-sandbox` queda como verificación manual opcional del usuario (interactivo, sandbox).

## 12. Nota de deploy a producción

Orden real (`deploy/deploy.sh`): `pg_dump` → `build web bot` → `docker compose run --rm migrate`
(**con web y bot viejos todavía corriendo**) → `up -d`. Implicancias:

- **Antes de mergear a `main`**, confirmar con SELECT de solo lectura en prod:
  `SELECT id, "tenantId", "userId" IS NOT NULL AS connected, "liveMode" FROM "MercadoPagoAccount";`
  (esperado: `1 | legacy-tenant | t | t`) y `SELECT count(*) FROM "MercadoPagoAccount" WHERE
  "tenantId" IS NULL;` = 0.
- **Ventana entre `migrate` y `up -d`** (segundos): el binario viejo sigue funcionando para cobrar,
  conciliar y renovar (sus consultas `id = 1 AND "tenantId" = 'legacy-tenant'` siguen siendo
  válidas y su `INSERT … (id=1) ON CONFLICT DO NOTHING` no hace nada). Lo único que falla en esa
  ventana es **iniciar** un OAuth de MP (el insert viejo del state no trae `tenantId`/`userId`):
  no conectar MP durante el deploy. Un state en vuelo se pierde: reintentar.
- Después del deploy: Ajustes → Mercado Pago de `legacy-tenant` sigue "Conectada" con la misma
  cuenta, sin reconectar; `SELECT id, "tenantId", "userId" IS NOT NULL FROM "MercadoPagoAccount"`
  igual que antes; mirar en los logs del bot que la conciliación corre con `tenantId:
  "legacy-tenant"` y que no aparecen `unknown_account` para pagos de la cuenta conectada.
- **Webhook:** la cuenta ahora sale del `user_id` del cuerpo. Si MP mandara notificaciones sin
  `user_id`, se ignoran (`unknown_account`) y la conciliación del bot confirma la seña en ≤ 1 min:
  no se pierde ningún pago, solo se demora. Verificarlo con el primer pago real después del deploy
  (o con el sandbox, paso manual).
- **`ARZIUM_MERCADOPAGO_USER_ID`:** dejarla **vacía** en producción en 028a. La cuenta conectada hoy
  en `legacy-tenant` es la de Joel; si HU-029 usa esa misma cuenta para la suscripción de Arzium,
  setear la variable con ese `user_id` no desconecta a `legacy-tenant`, pero le impediría
  **reconectar** esa cuenta. Antes de setearla, `legacy-tenant` tiene que pasar a la cuenta de MP
  de Daiana (decisión de producto para HU-029).
- **Rollback:** código y base juntos con el `pg_dump` del deploy. Volver solo el código con la base
  migrada deja andando cobro/conciliación de `legacy-tenant` pero rompe "Conectar".
- Sin variables nuevas obligatorias. `MERCADOPAGO_NOTIFICATION_URL`, `MERCADOPAGO_WEBHOOK_SECRET`,
  `MERCADOPAGO_TOKEN_KEY`: sin cambios.

## 13. Notas para 028b y 028c

- **028b (Google Calendar):** reutilizar el patrón de 028a: state atado a `userId` + `tenantId`
  (sin email), un solo uso con `DELETE … RETURNING`, acciones y callback con `requireOwnerContext`
  (sumarlo a `ROUTE_GUARDS` ya está hecho), cron del bot que recorre consultorios con conexión y
  aísla fallas con `try/catch` por tenant (mismo esqueleto que `reconcilePayments`). Su migración
  **borra `MercadoPagoOAuthState.sessionEmail`** (contracción pendiente de 028a). Clave nueva
  (`INTEGRATION_TOKEN_KEY`, D6) con AAD propio (`google:refresh_token`); no reutilizar
  `MERCADOPAGO_TOKEN_KEY`. Calendar sigue de solo escritura y aislado del login (D15).
- **028c (IA):** depende de 025c (D1). `BotAiQuestion.tenantId` con backfill desde
  `Patient.tenantId` en el mismo SQL de la migración (columna `NOT NULL` sobre tabla con filas).
- Ninguna de las dos toca `MercadoPagoAccount` ni las firmas de §5.

## 14. Dudas técnicas

Ninguna bloqueante. Supuestos a confirmar durante la implementación (anotar en `impl` si fallan):
- El cuerpo de la notificación de pagos trae `user_id` del vendedor (aplicación OAuth). Si no,
  queda la conciliación como camino principal (§12) y se avisa al orquestador.
- `mpPayment.collector_id` existe en los tipos del SDK `mercadopago` (si no, se omite ese chequeo,
  §5.3).
