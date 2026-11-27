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

---
---

# SDD · HU-028b · Google Calendar por consultorio

HU: `docs/hu-integraciones-por-consultorio.md` (validada 2026-11-25; D1–D16 = recomendaciones; D15:
app de Google **en verificación**, uso limitado). Issue #71 · rama
`feat/HU-028-integraciones-por-consultorio` · responsable `senkuch4n` · **lleva migración** (label
`migración`). Parte del esquema que deja 028a (`20261125234554_mercadopago_account_per_tenant`).
Skills: `skills/migracion-prisma.md` y `skills/refactor.txt` (diagnóstico + radio de impacto +
checklist, el plan vive acá). Decisiones que aplican: D4b, D5a, D6a (clave nueva), D7, D8, D15, D16.

La entrega se publica en **dos tandas** (D6a: la columna vieja se borra en una migración posterior):

| Tanda | Qué lleva | Cuándo se mergea a `main` |
|---|---|---|
| **028b** (esta rama) | Migración de expansión (tablas nuevas), flujo OAuth propio, sync por consultorio, login sin calendario, script de traslado idempotente que corre solo en el deploy, `/privacidad`. **No borra nada.** | Con la HU. |
| **028b-2 · contracción** (§B12) | Migración que borra `Professional.googleRefreshToken/googleCalendarId/googleSyncError` y `MercadoPagoOAuthState.sessionEmail`, y retira el traslado. | **Después** de confirmar en producción que el calendario de Daiana sigue sincronizando sin reconectar. Rama propia desde `develop`. |

---

## B1. Resumen funcional

Cada consultorio conecta **su** Google Calendar desde Ajustes → Google Calendar con un **flujo OAuth
propio** (ruta de inicio = server action, callback en `/api/google-calendar/oauth/callback`), separado
del login. Solo el `OWNER` conecta, reconecta, desconecta y elige el calendario (D4b). El refresh token
queda **cifrado** (AES-256-GCM, clave nueva `INTEGRATION_TOKEN_KEY`, AAD atado al campo y al consultorio)
en la tabla nueva `GoogleCalendarAccount`, una fila por consultorio (D5a). El `state` es de un solo uso,
vence a los 10 minutos y está atado a la persona (`userId`) y al consultorio (`tenantId`), con PKCE. El
login con Google pide solo `openid email profile`: no guarda ni pisa ningún token de calendario (se
retiran `maybeStoreCalendarToken`, `calendar-token-owner.ts`, `GOOGLE_CALENDAR_OWNER_EMAIL` en el código
y el uso de `resolveLegacyCalendarScope`). El cron del bot recorre los consultorios con calendario
conectado y aísla fallas por consultorio. "Desconectar" borra el token y lo revoca en Google (best
effort, D7); los eventos ya creados no se borran (D8). Reconectar la **misma** cuenta conserva los
eventos; **otra** cuenta los olvida y recrea los turnos futuros (D8). El token de Daiana se traslada en
el deploy con un script idempotente: no reconecta (D6a). Calendar sigue siendo **solo escritura**
(`events.insert/patch/delete`) y ningún dato obtenido de Google llega a la IA (D15), con un test de guarda
que lo fija; `/privacidad` se actualiza (D16).

## B2. Diagnóstico (skill refactor)

- `apps/web/src/auth.config.ts` pide `calendar.events` con `access_type: offline` y `prompt: consent`
  **en el login**: cualquier persona que entra le da a Numa permiso de calendario, y la credencial del
  calendario es la misma que la del login (D15 pide aislarla).
- `apps/web/src/auth.ts` (`maybeStoreCalendarToken`) guarda el refresh token del login **en texto plano**
  en `Professional.googleRefreshToken` del consultorio original, decidido por
  `GOOGLE_CALENDAR_OWNER_EMAIL` (`lib/calendar-token-owner.ts`). Es la excepción `LEGACY_EXEMPT["auth.ts"]`
  de `guard-coverage.test.ts`.
- `PROFESSIONAL_SELECT` (`packages/db/domain/professionalSelect.ts`) incluye `googleRefreshToken`: lo lee
  `getProfessional()`, que usan las tools de la IA del bot (`botAi.ts`). El token no se manda al
  proveedor (las tools arman la salida campo por campo), pero **está en memoria del código de IA**: para
  D15 conviene que ni siquiera se lea ahí.
- `syncGoogleCalendar()` (`packages/db/domain/gcal.ts`) usa `resolveLegacyCalendarScope()` fijo y guarda
  `err.message` crudo en `googleSyncError`. El cron del bot (`apps/bot/src/workers.ts`) loguea
  `logger.error({ err })`: un `GaxiosError` de googleapis trae `config.headers.Authorization` (Bearer).
- Un `patch` sobre un evento que ya no existe (404/410) tira y deja el consultorio en error para siempre.
- "Conectar" en Ajustes hace `signIn("google")`; "Desconectar" (`disconnectGoogleAction`) usa
  `requireTenantContext("write")`, no revoca en Google.
- `GoogleCalendarForm` guarda `Professional.googleCalendarId` con cualquier miembro.

## B3. Workspaces afectados

| Workspace | ¿Se toca? | Qué |
|---|---|---|
| `packages/core` | **Sí** | `google-calendar-oauth.ts` nuevo (URL de autorización, redirect URI, parseo del callback, del token y del id_token, scope, decisión D8, textos); `settings-options.ts` (texto de desconectar y fila "Cuenta"); tests vitest. |
| `packages/db` | **Sí** | `schema.prisma` + migración de expansión; `secretBox.ts` (clave de integraciones); `googleOAuthClient.ts`, `googleCalendarAccount.ts`, `googleCalendar.ts` (barrel) nuevos; `gcal.ts` por consultorio; `tenantScope.ts`, `legacySchedulingScope.ts`, `professionalSelect.ts`, `domain/index.ts`, `package.json`; script de traslado; probe en Postgres descartable. |
| `apps/web` | **Sí** | `auth.config.ts`, `auth.ts`, borrar `lib/calendar-token-owner.ts`; acciones de Ajustes; ruta callback nueva; `page.tsx` y `google-calendar-form.tsx`; `guard-coverage.test.ts`; `/privacidad`. |
| `apps/bot` | **Sí** | `workers.ts`: sync por consultorio con aislamiento de fallas e import desde el subpath nuevo. `apps/bot/src/ai/*` **no cambia** (lo fija el test de aislamiento). |
| Deploy / docs | Sí | `deploy/compose.yml` (servicio `migrate`), `deploy/README.md`, `.env.example`, `deploy/.env.example`, `README.md`. |

**Impacto cruzado (AGENTS.md, "El contrato"):** `syncGoogleCalendar` cambia de firma y **sale de
`@nutri-bot/db/domain`** (pasa al subpath `@nutri-bot/db/domain/googleCalendar`); el bot es el único
consumidor. Se borra `resolveLegacyCalendarScope` (consumidores: `auth.ts` y `gcal.ts`, los dos se
reescriben). Cambia `CalendarContext` (solo lo usa `gcal.ts`). `PROFESSIONAL_SELECT` pierde tres
columnas: revisar todo lo que lea `pro.google*` en web y bot (hoy: `ajustes/page.tsx`, `page.test.tsx`).
`npm run typecheck` tiene que pasar en **web y bot**.

## B4. Esquema

### B4.1 Prisma (cambios exactos de la tanda 028b)

```prisma
model Tenant {
  // ... sin cambios ...
  /// HU-028b: conexión de Google Calendar del consultorio (D5a) y states de su OAuth.
  googleCalendarAccount     GoogleCalendarAccount?
  googleCalendarOAuthStates GoogleCalendarOAuthState[]
}

model User {
  // ... sin cambios ...
  /// HU-028b: states de OAuth de Google Calendar iniciados por esta persona.
  googleCalendarOAuthStates GoogleCalendarOAuthState[]
}

model Professional {
  // ... sin cambios, salvo los comentarios de estas tres columnas:
  /// HU-028b: EN DESUSO. Solo lo lee el traslado (scripts/google-calendar-transfer.ts); conectar o
  /// desconectar en Ajustes lo pone en null. Se borra en la contracción (028b-2). Nunca en PROFESSIONAL_SELECT.
  googleRefreshToken String?
  /// HU-028b: EN DESUSO (lo reemplaza GoogleCalendarAccount.calendarId). Se borra en 028b-2.
  googleCalendarId   String?
  /// HU-028b: EN DESUSO (lo reemplaza GoogleCalendarAccount.syncError). Se borra en 028b-2.
  googleSyncError    String?
}

/// HU-028b (D5a): conexión de Google Calendar de UN consultorio. Sincronización de una vía app → Google,
/// solo escritura (events.insert/patch/delete). La fila sobrevive a "Desconectar" (guarda googleSubject
/// para D8). DATO SENSIBLE: refreshTokenEnc va cifrado (AES-256-GCM, INTEGRATION_TOKEN_KEY, AAD
/// "google:refresh_token:<tenantId>", formato "v1.<iv>.<tag>.<ct>"). Solo lo leen
/// domain/googleCalendarAccount.ts y domain/gcal.ts. Nunca viaja al navegador, a los logs ni a la IA.
model GoogleCalendarAccount {
  id              String    @id @default(cuid())
  tenantId        String    @unique
  tenant          Tenant    @relation(fields: [tenantId], references: [id], onDelete: Restrict)
  /// `sub` del id_token de la cuenta conectada (o la última conectada). Se conserva al desconectar para
  /// reconocer la misma cuenta al reconectar (D8). null = desconocida (traslado sin identidad).
  googleSubject   String?
  /// Email verificado de la cuenta conectada (se muestra en Ajustes). null al desconectar.
  googleEmail     String?
  /// null = sin calendario conectado.
  refreshTokenEnc String?
  /// scope que devolvió Google (diagnóstico). Tiene que incluir calendar.events.
  scope           String?
  /// Identificador del calendario ("Opciones avanzadas"). null = "primary".
  calendarId      String?
  connectedAt     DateTime?
  disconnectedAt  DateTime?
  /// Mensaje saneado del último error de sincronización (sin tokens). null = sin error.
  syncError       String?
  syncErrorAt     DateTime?
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt
}

/// HU-028b: estado temporal del OAuth de Google Calendar (anti-CSRF + PKCE). Un solo uso
/// (DELETE ... RETURNING), vence a los 10 minutos, atado a la persona (userId) y al consultorio (tenantId).
model GoogleCalendarOAuthState {
  id              String   @id @default(cuid())
  tenantId        String
  tenant          Tenant   @relation(fields: [tenantId], references: [id], onDelete: Restrict)
  userId          String
  user            User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  /// sha256 (hex) del state que viaja a Google. El state en claro no se guarda.
  stateHash       String   @unique
  /// code_verifier de PKCE, cifrado (INTEGRATION_TOKEN_KEY, AAD "google:code_verifier:<tenantId>").
  codeVerifierEnc String
  expiresAt       DateTime
  createdAt       DateTime @default(now())

  @@index([expiresAt])
  @@index([tenantId])
  @@index([userId])
}
```

Notas de diseño:
- `googleSubject` **no** es único entre consultorios: a diferencia de MP (D3a), Google no tiene un
  webhook que haya que enrutar; dos consultorios con la misma cuenta escriben eventos independientes.
- `id String cuid()` (no hay binario viejo que consulte esta tabla).
- `Professional` no cambia de forma en esta tanda (expansión pura): el binario viejo sigue funcionando
  durante la ventana del deploy.

### B4.2 Migración `google_calendar_account`

Crear con `--create-only` (skill `migracion-prisma`). El SQL generado tiene que ser **solo** esto
(no se edita a mano; si Prisma genera cualquier `ALTER`/`DROP` sobre una tabla existente, parar):

```sql
-- CreateTable
CREATE TABLE "GoogleCalendarAccount" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "googleSubject" TEXT,
    "googleEmail" TEXT,
    "refreshTokenEnc" TEXT,
    "scope" TEXT,
    "calendarId" TEXT,
    "connectedAt" TIMESTAMP(3),
    "disconnectedAt" TIMESTAMP(3),
    "syncError" TEXT,
    "syncErrorAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "GoogleCalendarAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GoogleCalendarOAuthState" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "stateHash" TEXT NOT NULL,
    "codeVerifierEnc" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "GoogleCalendarOAuthState_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "GoogleCalendarAccount_tenantId_key" ON "GoogleCalendarAccount"("tenantId");
CREATE UNIQUE INDEX "GoogleCalendarOAuthState_stateHash_key" ON "GoogleCalendarOAuthState"("stateHash");
CREATE INDEX "GoogleCalendarOAuthState_expiresAt_idx" ON "GoogleCalendarOAuthState"("expiresAt");
CREATE INDEX "GoogleCalendarOAuthState_tenantId_idx" ON "GoogleCalendarOAuthState"("tenantId");
CREATE INDEX "GoogleCalendarOAuthState_userId_idx" ON "GoogleCalendarOAuthState"("userId");

ALTER TABLE "GoogleCalendarAccount" ADD CONSTRAINT "GoogleCalendarAccount_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "GoogleCalendarOAuthState" ADD CONSTRAINT "GoogleCalendarOAuthState_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "GoogleCalendarOAuthState" ADD CONSTRAINT "GoogleCalendarOAuthState_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
```

Filas existentes: ninguna tabla existente cambia; no hay columnas `NOT NULL` nuevas sobre tablas con
filas. El cifrado no se puede hacer en SQL (la clave vive en el entorno): el traslado es el script de
§B9, no la migración. Rollback: `DROP TABLE "GoogleCalendarOAuthState"; DROP TABLE
"GoogleCalendarAccount";` (a mano, con el `pg_dump` del deploy; se documenta, no se automatiza).

## B5. Contrato compartido

### B5.1 `packages/core/src/google-calendar-oauth.ts` (nuevo, puro; se reexporta desde `index.ts`)

Se importa en componentes cliente (`GOOGLE_CALENDAR_TEXT`): nada de `node:*` ni red. Para base64url usar
`atob` + `TextDecoder` (disponibles en Node 20 y navegador).

```ts
export const GOOGLE_AUTHORIZATION_URL = "https://accounts.google.com/o/oauth2/v2/auth";
export const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
export const GOOGLE_REVOKE_URL = "https://oauth2.googleapis.com/revoke";
export const GOOGLE_CALENDAR_EVENTS_SCOPE = "https://www.googleapis.com/auth/calendar.events";
/** Identidad mínima para mostrar la cuenta y aplicar D8 + el permiso de eventos. Nada más. */
export const GOOGLE_CALENDAR_OAUTH_SCOPES = ["openid", "email", GOOGLE_CALENDAR_EVENTS_SCOPE] as const;
export const GOOGLE_CALENDAR_CALLBACK_PATH = "/api/google-calendar/oauth/callback";
export const GOOGLE_CALENDAR_OAUTH_STATE_TTL_MINUTES = 10;

export type GoogleCalendarConnectionStatus = "not_configured" | "not_connected" | "connected";
export type GoogleCalendarCallbackResult =
  | "connected" | "denied" | "invalid_state" | "rejected" | "scope_denied" | "not_configured";
/** D8: first = nunca hubo conexión; same = misma cuenta (o anterior desconocida); changed = otra cuenta. */
export type GoogleCalendarConnectionKind = "first" | "same" | "changed";

/** URL de autorización. Orden fijo (URLSearchParams): client_id, redirect_uri, response_type=code,
 *  scope (GOOGLE_CALENDAR_OAUTH_SCOPES unidos por espacio), access_type=offline, prompt=consent, state,
 *  code_challenge, code_challenge_method=S256. SIN include_granted_scopes (D15: la credencial del
 *  calendario no hereda los permisos del login). */
export function buildGoogleCalendarAuthorizationUrl(p: {
  clientId: string; redirectUri: string; state: string; codeChallenge: string;
}): string;

/** `${new URL(authUrl).origin}${GOOGLE_CALENDAR_CALLBACK_PATH}`; null si falta, es inválida o no es http(s). */
export function googleCalendarRedirectUri(authUrl: string | undefined | null): string | null;

/** Query del callback. `error` presente o sin `code` → denied (state opcional); `code` sin `state` → invalid. */
export function parseGoogleCalendarCallback(q: URLSearchParams):
  | { kind: "ok"; code: string; state: string }
  | { kind: "denied"; state: string | null }
  | { kind: "invalid" };

/** Respuesta de POST /token (authorization_code). Exige refresh_token e id_token (strings no vacíos);
 *  scope = string o null. Cualquier otra forma → null. No guarda ni devuelve el access_token. */
export function parseGoogleTokenResponse(json: unknown):
  { refreshToken: string; idToken: string; scope: string | null } | null;

/** Claims del id_token recibido directo del endpoint de token por TLS (OIDC Core 3.1.3.7: no hace falta
 *  verificar la firma). Exige: 3 segmentos; payload JSON; iss ∈ {"accounts.google.com",
 *  "https://accounts.google.com"}; aud === clientId (o array que lo contiene, y entonces azp === clientId);
 *  si viene azp, azp === clientId; exp (segundos) * 1000 > now; sub string 1..255; email_verified === true;
 *  email string no vacío. Devuelve el email canónico (canonicalEmail). Cualquier falla → null. */
export function parseGoogleIdTokenClaims(idToken: string, opts: { clientId: string; now: Date }):
  { subject: string; email: string } | null;

/** true si el scope (separado por espacios) incluye GOOGLE_CALENDAR_EVENTS_SCOPE. null → false. */
export function hasGoogleCalendarEventsScope(scope: string | null): boolean;

/** D8. hadConnection = la fila tuvo connectedAt alguna vez.
 *  !hadConnection → "first"; previousSubject null (traslado sin identidad) → "same";
 *  previousSubject === nextSubject → "same"; distinto → "changed". */
export function decideGoogleCalendarConnection(p: {
  hadConnection: boolean; previousSubject: string | null; nextSubject: string;
}): GoogleCalendarConnectionKind;

export const GOOGLE_CALENDAR_TEXT = {
  account: "Cuenta",
  callback: {
    connected: "Google Calendar conectado.",
    denied: "No se conectó el calendario: la autorización fue cancelada en Google.",
    invalid_state: "No pudimos verificar la conexión. Probá de nuevo.",
    rejected: "Google rechazó la conexión. Probá de nuevo; si se repite, avisá al soporte.",
    scope_denied: "Para sincronizar los turnos hace falta permitir el acceso a los eventos del calendario.",
    not_configured: "La conexión con Google Calendar no está configurada en el servidor.",
  },
} as const satisfies { account: string; callback: Record<GoogleCalendarCallbackResult, string> };
```

Los cinco primeros textos de `callback` son los de la HU (4.2), literales. `not_configured` es nuevo
(la HU no lo nombra; mismo estilo que `MERCADOPAGO_TEXT.callback.not_configured`).

`packages/core/src/settings-options.ts` (`SETTINGS_TEXT`): **solo** cambia
`googleDisconnectDescription` a `"Los turnos nuevos dejan de aparecer en tu Google Calendar. Los eventos
que ya están ahí no se borran."` (HU 4.2). Se conservan `googleConnected` ("Conectado"),
`googleNotConnected` ("Sin conectar"), `googleConnect` ("Conectar Google Calendar"), `googleHelp` y el
resto: la HU 4.2 describe esos textos con otras palabras pero el mismo sentido, y son los del rediseño
HU-017 (decisión del architect: sin cambios cosméticos).

Consumidores: todo `core` nuevo → `db` (OAuth, D8) y `web` (textos, banner).

### B5.2 `packages/db/domain/secretBox.ts` (cambia, sin romper MP)

```ts
/** HU-028b: clave de las integraciones que no son Mercado Pago. Mismo formato que MERCADOPAGO_TOKEN_KEY
 *  (base64 de 32 bytes, `openssl rand -base64 32`). Falta o inválida →
 *  IntegrationConfigError("INTEGRATION_TOKEN_KEY inválida o ausente"). */
export class IntegrationConfigError extends Error {} // name = "IntegrationConfigError"
export function loadIntegrationTokenKey(env?: Record<string, string | undefined>): Buffer;

/** HU-028b: AAD atado al campo y al consultorio: un ciphertext no se puede mover de columna ni de fila. */
export const GOOGLE_SECRET_AAD = {
  refreshToken: (tenantId: string) => `google:refresh_token:${tenantId}`,
  codeVerifier: (tenantId: string) => `google:code_verifier:${tenantId}`,
} as const;
```

- Refactor interno: un helper privado `loadKey(env, name, makeError)` que usan
  `loadMercadoPagoTokenKey` (mensaje y clase de error **idénticos** a hoy) y `loadIntegrationTokenKey`.
- `sealSecret` / `openSecret` / `SECRET_AAD` / `MercadoPagoConfigError`: sin cambios.
- Sigue sin reexportarse desde `domain/index.ts`.

### B5.3 `packages/db/domain/googleOAuthClient.ts` (nuevo, server-only, `fetch` inyectable)

```ts
export type GoogleOAuthHttpDeps = {
  fetch?: typeof fetch;                       // default globalThis.fetch
  env?: Record<string, string | undefined>;   // default process.env
  now?: () => Date;                           // default () => new Date()
};
export type GoogleCalendarAppConfig = { clientId: string; clientSecret: string; redirectUri: string };

export class GoogleCalendarConfigError extends Error {} // name = "GoogleCalendarConfigError"

/** null si falta GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, AUTH_URL (redirect = googleCalendarRedirectUri)
 *  o INTEGRATION_TOKEN_KEY es inválida. */
export function getGoogleCalendarAppConfig(env?: Record<string, string | undefined>): GoogleCalendarAppConfig | null;

/** Error saneado: status (0 = red/timeout) y un código con forma de identificador (body.error de Google,
 *  /^[a-z0-9_.-]{1,64}$/i). Nunca el body, code, verifier, tokens ni secret. */
export class GoogleOAuthApiError extends Error { readonly status: number; readonly code: string | null; }

/** POST GOOGLE_TOKEN_URL, x-www-form-urlencoded: code, client_id, client_secret, redirect_uri,
 *  grant_type=authorization_code, code_verifier. Timeout 10 s. !ok o red → GoogleOAuthApiError.
 *  Devuelve el JSON crudo (lo valida parseGoogleTokenResponse). */
export async function exchangeGoogleAuthorizationCode(
  app: GoogleCalendarAppConfig, input: { code: string; codeVerifier: string }, deps?: GoogleOAuthHttpDeps,
): Promise<unknown>;

/** POST GOOGLE_REVOKE_URL (token=... en el body, x-www-form-urlencoded). Best effort (D7): true si 200,
 *  false ante cualquier otra cosa. NUNCA tira ni loguea el token. */
export async function revokeGoogleToken(token: string, deps?: GoogleOAuthHttpDeps): Promise<boolean>;
```

### B5.4 `packages/db/domain/googleCalendarAccount.ts` (nuevo)

```ts
export type GoogleCalendarConnectionView = {
  status: GoogleCalendarConnectionStatus;
  googleEmail: string | null;   // solo si connected
  calendarId: string | null;    // solo si connected; null = principal
  syncError: string | null;     // solo si connected
  connectedAt: Date | null;     // solo si connected
}; // NUNCA refreshTokenEnc, googleSubject ni scope.

// web (page.tsx)
export async function getGoogleCalendarConnectionView(t: TenantRef, env?: Record<string, string | undefined>):
  Promise<GoogleCalendarConnectionView>;
// web (server action) — tira GoogleCalendarConfigError si getGoogleCalendarAppConfig es null.
export async function startGoogleCalendarOAuth(t: TenantRef, actor: { userId: string }, deps?: GoogleOAuthHttpDeps):
  Promise<{ url: string }>;
// web (ruta callback)
export async function completeGoogleCalendarOAuth(
  t: TenantRef, input: { userId: string; query: URLSearchParams }, deps?: GoogleOAuthHttpDeps,
): Promise<GoogleCalendarCallbackResult>;
// web (server action)
export async function disconnectGoogleCalendar(t: TenantRef, deps?: GoogleOAuthHttpDeps): Promise<{ revoked: boolean }>;
// web (server action "Opciones avanzadas"). false si no hay calendario conectado (no escribe).
export async function setGoogleCalendarId(t: TenantRef, calendarId: string | null): Promise<boolean>;
// bot (cron): consultorios con refreshTokenEnc no null, orden por tenantId.
export async function listConnectedGoogleCalendarTenants(): Promise<TenantRef[]>;
```

Comportamiento:

1. **`getGoogleCalendarConnectionView`**: `getGoogleCalendarAppConfig(env)` null → `not_configured`
   (con los demás campos null). Fila con `refreshTokenEnc` → `connected` con `googleEmail`,
   `calendarId`, `syncError`, `connectedAt`. Si no → `not_connected`. La consulta no trae la columna
   cifrada: `$queryRaw` con `"refreshTokenEnc" IS NOT NULL AS connected` (o `findUnique` con `select: {
   googleEmail, calendarId, syncError, connectedAt }` + `count({ where: { tenantId, refreshTokenEnc: {
   not: null } } })`). El objeto devuelto nunca tiene `refreshTokenEnc`.
2. **`startGoogleCalendarOAuth`**: config → `resolveTenantSchedulingContext(prisma, t.tenantId)` (fail
   closed sin agenda principal) → key → `state` y `verifier` = `randomBytes(32).toString("base64url")`,
   `codeChallenge` = sha256(verifier) base64url → `deleteMany` de states vencidos → `create({ tenantId:
   scope.tenantId, userId: actor.userId, stateHash: sha256Hex(state), codeVerifierEnc:
   sealSecret(verifier, key, GOOGLE_SECRET_AAD.codeVerifier(scope.tenantId)), expiresAt: now + 10 min })`
   → `buildGoogleCalendarAuthorizationUrl`.
3. **`consumeGoogleOAuthState(state, { userId, tenantId }, now)`** (interno): `DELETE FROM
   "GoogleCalendarOAuthState" WHERE "stateHash" = $h AND "userId" = $u AND "tenantId" = $t AND
   "expiresAt" > $now RETURNING "codeVerifierEnc"`. Otra persona/consultorio/vencido → null y **no** se
   consume.
4. **`completeGoogleCalendarOAuth`**, en este orden:
   1. config null → `not_configured`.
   2. `parseGoogleCalendarCallback`: `invalid` → `invalid_state`; `denied` → si trae state, consumirlo
      (solo si es de esta persona y consultorio) → `denied`.
   3. `resolveTenantSchedulingContext` (fail closed: tira, la ruta lo convierte en `rejected`).
   4. Consumir state → null → `invalid_state` (sin canje: `fetch` no se llama).
   5. `openSecret(verifier)` con AAD del tenant → `SecretDecryptError` → `invalid_state`.
   6. `exchangeGoogleAuthorizationCode` → error → `rejected`.
   7. `parseGoogleTokenResponse` null → `rejected` (sin refresh token no hay sync posible).
   8. `!hasGoogleCalendarEventsScope(scope)` → `revokeGoogleToken(refreshToken)` (best effort) →
      `scope_denied`. Nada guardado.
   9. `parseGoogleIdTokenClaims(idToken, { clientId, now })` null → revocar (best effort) → `rejected`.
   10. `saveGoogleCalendarConnection` (abajo) → `connected`. Si había otra cuenta (`changed`) y su
       token anterior se pudo descifrar, revocarlo **después del commit** (best effort).
   - Nunca se loguea el query, el code, el verifier ni los tokens. El access_token que devuelve Google se
     descarta (no se guarda).
5. **`saveGoogleCalendarConnection(t, conn, now)`** (interno), una transacción:
   - `INSERT INTO "GoogleCalendarAccount" (id, "tenantId", "updatedAt") VALUES (<cuid>, $t, $now) ON
     CONFLICT ("tenantId") DO NOTHING`; después `SELECT ... WHERE "tenantId" = $t FOR UPDATE`.
   - `kind = decideGoogleCalendarConnection({ hadConnection: row.connectedAt !== null,
     previousSubject: row.googleSubject, nextSubject: conn.subject })`.
   - `first`: `appointment.updateMany({ where: { tenantId, agendaId: scope.agendaId, googleEventId: null,
     startsAt: { lt: now }, needsGoogleSync: true }, data: { needsGoogleSync: false } })` — al conectar
     por primera vez solo van al calendario los turnos futuros (los pasados no inundan el calendario).
   - `changed` (D8): `appointment.updateMany({ where: { tenantId, agendaId, googleEventId: { not: null } },
     data: { googleEventId: null, needsGoogleSync: false } })` y después `appointment.updateMany({ where:
     { tenantId, agendaId, status: "CONFIRMED", startsAt: { gte: now } }, data: { needsGoogleSync: true }
     })`; además lo de `first` para los pasados sin evento. `calendarId` vuelve a null (el calendario
     elegido era de la otra cuenta).
   - `same`: no toca turnos; conserva `calendarId`. Lo encolado mientras estuvo desconectado
     (`needsGoogleSync = true`) se sincroniza solo, contra los mismos eventos (D8).
   - `update({ where: { tenantId }, data: { refreshTokenEnc: sealSecret(refreshToken, key,
     GOOGLE_SECRET_AAD.refreshToken(tenantId)), googleSubject, googleEmail, scope, connectedAt: now,
     disconnectedAt: null, syncError: null, syncErrorAt: null, calendarId: <según kind> } })`.
   - Limpia el texto plano viejo del consultorio: `professional.updateMany({ where: { id:
     <professionalId de la agenda principal>, tenantId }, data: { googleRefreshToken: null,
     googleSyncError: null } })`.
   - En reconexión `same` **no** se revoca el token anterior: en Google, revocar un token revoca la
     autorización entera de esa cuenta para el cliente, incluido el token nuevo.
6. **`disconnectGoogleCalendar`** (D7, D8): transacción con la fila `FOR UPDATE`; sin fila o sin token →
   igual limpia `Professional.googleRefreshToken/googleSyncError` del consultorio y devuelve
   `{ revoked: false }` sin llamar a Google. Con token: lo descifra (si falla, sigue sin revocar) y
   `update({ refreshTokenEnc: null, googleEmail: null, scope: null, syncError: null, syncErrorAt: null,
   disconnectedAt: now })` (conserva `googleSubject`, `calendarId` y `connectedAt`; **no** toca turnos ni
   `googleEventId`). Después del commit: `revokeGoogleToken` (best effort); si da false,
   `console.warn("[google-calendar] revoke_failed")` sin nada más. Devuelve `{ revoked }`.
7. **`setGoogleCalendarId`**: `updateMany({ where: { tenantId, refreshTokenEnc: { not: null } }, data:
   { calendarId } })` → `count === 1`. (Cambiar de calendario no mueve eventos ya creados: igual que hoy.)
8. **`listConnectedGoogleCalendarTenants`**: `findMany({ where: { refreshTokenEnc: { not: null } },
   select: { tenantId: true }, orderBy: { tenantId: "asc" } })`.

### B5.5 `packages/db/domain/gcal.ts` (cambia)

```ts
/** Calendario mínimo que usa la sync (solo escritura). Inyectable para tests y probes. */
export type CalendarEventsWriter = {
  insert(p: { calendarId: string; requestBody: object }): Promise<{ data: { id?: string | null } }>;
  patch(p: { calendarId: string; eventId: string; requestBody: object }): Promise<unknown>;
  delete(p: { calendarId: string; eventId: string }): Promise<unknown>;
};
export type GoogleCalendarSyncDeps = {
  env?: Record<string, string | undefined>;
  now?: () => Date;
  /** default: google.calendar({ version: "v3", auth: OAuth2(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET) + refresh_token }).events */
  events?: (refreshToken: string) => CalendarEventsWriter;
};

// CAMBIA (bot): recibe el consultorio.
export async function syncGoogleCalendar(t: TenantRef, deps?: GoogleCalendarSyncDeps):
  Promise<{ processed: number; error?: string }>;
```

- Cuenta: `googleCalendarAccount.findUnique({ where: { tenantId }, select: { refreshTokenEnc, calendarId,
  syncError } })`. Sin fila o sin token → `{ processed: 0 }` sin construir el cliente de Google.
- `resolveTenantCalendarContext(prisma, t.tenantId)` → `scope`, `agendaOwner`, `professional.timezone`.
  `appointmentScope = { ...scope, agenda: agendaOwner }` (igual que hoy, ahora por consultorio).
- Turnos pendientes: mismo `findMany` (`needsGoogleSync: true`, `take: 25`, `orderBy updatedAt asc`).
  Cola vacía → `{ processed: 0 }` **sin** descifrar ni llamar a Google.
- Descifrar con `loadIntegrationTokenKey(env)` y `GOOGLE_SECRET_AAD.refreshToken(tenantId)`. Clave
  inválida o `SecretDecryptError` → guardar `syncError = "No se pudo leer la conexión guardada.
  Reconectá Google Calendar."` y devolver `{ processed: 0, error: "decrypt_failed" }` sin llamar a Google.
- Bucle insert/patch/delete: **igual que hoy** (mismo `summary`/`description`, sin `reason`), con un
  cambio: `patch` que tira 404/410 → `appointment.update({ where, data: { googleEventId: null,
  needsGoogleSync: true } })` (el próximo tick lo vuelve a crear) y cuenta como procesado.
- Éxito con `syncError` previo → `googleCalendarAccount.updateMany({ where: { tenantId, refreshTokenEnc:
  <el leído> }, data: { syncError: null, syncErrorAt: null } })`.
- Error → `message = describeGoogleCalendarError(err)`; `updateMany({ where: { tenantId,
  refreshTokenEnc: <el leído> }, data: { syncError: message, syncErrorAt: now } })` (si mientras tanto
  desconectaron o reconectaron, no pisa la fila nueva). Devuelve `{ processed, error: message }`.
- `describeGoogleCalendarError(err: unknown): string` (interno, exportado solo para tests): toma
  `err.response?.status` o `err.code` numérico y un código identificador de `err.response?.data?.error`
  (string) o `err.response?.data?.error?.status` que cumpla `/^[a-z0-9_.-]{1,64}$/i` → `"Google Calendar
  respondió con error (status 401, invalid_grant)"`; sin status → `"Google Calendar no respondió"`.
  **Nunca** `err.message` ni nada de `err.config` (trae `Authorization: Bearer`).
- Se borra el import de `resolveLegacyCalendarScope`. Nada de `events.list`, `events.get`,
  `freebusy`, `calendarList` (solo escritura, D15; lo fija el test de §B10.3).

### B5.6 Otros cambios de `packages/db`

- `domain/tenantScope.ts`: `CALENDAR_SELECT = { timezone: true }`; `CalendarContext.professional` pasa a
  `{ timezone: string }`. `resolveTenantCalendarContext` sin otros cambios.
- `domain/legacySchedulingScope.ts`: se **borra** `resolveLegacyCalendarScope` (y el import de
  `CalendarContext`).
- `domain/professionalSelect.ts`: se quitan `googleRefreshToken`, `googleCalendarId`,
  `googleSyncError` de `PROFESSIONAL_SELECT` (comentario: "HU-028b (D15): la conexión de Google vive en
  GoogleCalendarAccount; getProfessional() — que usan las tools de la IA — no la lee").
- `domain/index.ts`: se **quita** `export * from "./gcal";`. Google Calendar no se exporta desde el
  barrel general.
- `domain/googleCalendar.ts` (nuevo, barrel del subpath):
  ```ts
  export { syncGoogleCalendar, type GoogleCalendarSyncDeps, type CalendarEventsWriter } from "./gcal";
  export {
    getGoogleCalendarConnectionView, startGoogleCalendarOAuth, completeGoogleCalendarOAuth,
    disconnectGoogleCalendar, setGoogleCalendarId, listConnectedGoogleCalendarTenants,
    type GoogleCalendarConnectionView,
  } from "./googleCalendarAccount";
  export { GoogleCalendarConfigError, getGoogleCalendarAppConfig, type GoogleOAuthHttpDeps } from "./googleOAuthClient";
  ```
- `packages/db/package.json`: `exports` agrega `"./domain/googleCalendar": "./domain/googleCalendar.ts"`;
  `scripts` agrega `"gcal:transfer": "dotenv -e ../../.env -- tsx scripts/google-calendar-transfer.ts"` y
  `"test:gcal-tenants": "bash scripts/test-google-calendar-per-tenant.sh"`.

### B5.7 Consumidores

| Función | web | bot |
|---|---|---|
| `getGoogleCalendarConnectionView`, `startGoogleCalendarOAuth`, `completeGoogleCalendarOAuth`, `disconnectGoogleCalendar`, `setGoogleCalendarId`, `GoogleCalendarConfigError` | ✔ (`@nutri-bot/db/domain/googleCalendar`) | — |
| `syncGoogleCalendar(t)`, `listConnectedGoogleCalendarTenants` | — | ✔ (`@nutri-bot/db/domain/googleCalendar`) |
| `GOOGLE_CALENDAR_TEXT`, `SETTINGS_TEXT` | ✔ | — |

## B6. Aislamiento de Calendar respecto de la IA y del login (D15)

Requisito de Google (uso limitado): ningún dato obtenido con `calendar.events` llega a un proveedor de
IA. Garantías de esta entrega, cada una con su test:

1. **Credencial aislada del login:** el login pide solo `openid email profile`, sin `access_type` ni
   `prompt` (no hay refresh token del login). La credencial del calendario sale **solo** del flujo de
   Ajustes y vive cifrada en `GoogleCalendarAccount` (`auth.config.test.ts`, `auth.test.ts`).
2. **Solo escritura:** `gcal.ts` y `googleCalendarAccount.ts` no llaman a `events.list/get/watch/
   instances`, `freebusy` ni `calendarList`, y la sync no lee la respuesta del `insert` más que `data.id`
   (`google-calendar-isolation.test.ts`, chequeo de source).
3. **Fuera del alcance de la IA:** `domain/index.ts` no exporta nada de Google Calendar ni `secretBox`;
   `PROFESSIONAL_SELECT` no trae columnas de Google; y ninguno de estos archivos menciona
   `googleCalendar`, `GoogleCalendar`, `gcal`, `googleapis`, `googleOAuthClient`, `refreshTokenEnc` ni
   `secretBox`: `packages/db/domain/botAi.ts`, `apps/bot/src/ai/*.ts`, `apps/web/src/lib/deepseek.ts`,
   `apps/web/src/lib/assistant-tools.ts`, `apps/web/src/lib/bot-ai.ts`,
   `apps/web/src/app/(panel)/asistente/*.ts`,
   `apps/web/src/app/(panel)/pacientes/[id]/planes/[planId]/ai-actions.ts`
   (`google-calendar-isolation.test.ts`, lee los archivos con `fs` desde `import.meta.url`; excluye
   `*.test.ts`).
4. **Nada sale a logs:** el cron del bot no loguea el error crudo; `syncError` está saneado
   (`gcal.test.ts`, `workers.test.ts`).

Lo que **sí** viaja a Google (datos nuestros, no datos de Google): nombre del servicio, nombre y
teléfono del paciente y horario del turno, como hoy; nunca el motivo (HU-013, test existente).

## B7. Rutas / server actions / API (`apps/web`)

### B7.1 Login — `apps/web/src/auth.config.ts` y `apps/web/src/auth.ts`

- `auth.config.ts`: `Google({ clientId, clientSecret, authorization: { params: { scope: "openid email
  profile" } } })`. Se quitan `access_type` y `prompt`.
- `auth.ts`: se borran `maybeStoreCalendarToken`, los imports de `prisma`, `decideTenantAccess`,
  `LEGACY_TENANT_ID`, `loadAccessFacts`, `resolveLegacyCalendarScope`, `shouldStoreCalendarToken` que
  queden sin uso, y el bloque `if (account.refresh_token) { ... }`. El callback `jwt` solo registra la
  identidad (`registerGoogleIdentity`) y guarda `userId`. Nada de tokens de Google en el JWT.
- Se borran `apps/web/src/lib/calendar-token-owner.ts` y `calendar-token-owner.test.ts`.

### B7.2 `apps/web/src/app/(panel)/ajustes/actions.ts`

```ts
// NUEVA. Mismo patrón que connectMercadoPagoAction.
export async function connectGoogleCalendarAction(): Promise<void>;
//  requireOwnerContext(); TenantAccessError → redirect("/inicio").
//  startGoogleCalendarOAuth(ctx, { userId: ctx.userId }) → redirect(url);
//  GoogleCalendarConfigError → redirect("/ajustes?tab=google&gcal=not_configured").

// CAMBIA: owner-only; delega en el dominio (revoca en Google, D7).
export async function disconnectGoogleAction(): Promise<void>;
//  requireOwnerContext(); TenantAccessError → redirect("/inicio"); disconnectGoogleCalendar(ctx);
//  revalidatePath("/ajustes").

// CAMBIA: owner-only; escribe GoogleCalendarAccount.calendarId.
export async function saveGoogleCalendarIdAction(_prev: SettingsState, formData: FormData): Promise<SettingsState>;
//  ctx = requireOwnerContext() dentro del try (withReauth como hoy);
//  setGoogleCalendarId(ctx, parsed.calendarId || null) → false → { ok: false, error: SETTINGS_TEXT.saveError }.
```

Se borra todo uso de `googleRefreshToken`/`googleCalendarId`/`googleSyncError` en `actions.ts`.

### B7.3 `apps/web/src/app/api/google-calendar/oauth/callback/route.ts` (nueva)

Copia del callback de MP (`api/mercadopago/oauth/callback/route.ts`) con:
- `toResult(result)` → `/ajustes?tab=google&gcal=${result}` (base `AUTH_URL`, 303).
- `requireOwnerContext()`: `owner_only` → `toResult("invalid_state")` (no consume ni canjea); otro
  `TenantAccessError` → `/inicio`.
- `completeGoogleCalendarOAuth(ctx, { userId: ctx.userId, query })`; excepción →
  `console.error("[google-calendar] oauth_callback_failed")` y `"rejected"`. `connected` →
  `revalidatePath("/ajustes")`.
- El middleware ya exige sesión con acceso (`/api/google-calendar/...` no está en las exclusiones del
  `matcher`): no tocar `middleware.ts`.

**redirect_uri nueva** = `<origin de AUTH_URL>/api/google-calendar/oauth/callback`:
- Producción: `https://numa.arzium.com.ar/api/google-calendar/oauth/callback`
- Desarrollo: `http://localhost:3000/api/google-calendar/oauth/callback`

Hay que agregarlas en Google Cloud Console → APIs y servicios → Credenciales → el cliente OAuth web de
Numa → "URIs de redireccionamiento autorizados" (se conserva `/api/auth/callback/google` del login).
Mismo cliente (`GOOGLE_CLIENT_ID`): no hace falta otra verificación por cliente nuevo.

### B7.4 `apps/web/src/app/(panel)/ajustes/page.tsx` y `google-calendar-form.tsx`

- `page.tsx`: `gc = await getGoogleCalendarConnectionView(ctx)` (en el `Promise.all`).
  `googleConnected = gc.status === "connected"`; `calendarId = gc.calendarId ?? ""`; alerta de error con
  `gc.syncError` (mismo markup). Se quitan `signIn` (si queda sin uso) y el `<form>` inline.
- Filas: "Estado" (como hoy); si conectado y `gc.googleEmail` → fila `GOOGLE_CALENDAR_TEXT.account` con
  el email (`translate="no"`, `break-all`); "Calendario" (como hoy).
- Botones **solo si `isOwner`** (D4b): no conectado → `<GoogleCalendarConnectButton
  disabled={gc.status === "not_configured"} />`; conectado → `<GoogleCalendarConnectButton reconnect
  variant="secondary" />` + `<GoogleDisconnectButton />`; "Opciones avanzadas" solo para OWNER. Un
  `STAFF` ve estado, cuenta y calendario, sin botones.
- `gc.status === "not_configured"` → `<Alert tone="warning">` con
  `GOOGLE_CALENDAR_TEXT.callback.not_configured`.
- `<GoogleCalendarCallbackBanner />` arriba de la pestaña (lee `?gcal=`).
- `google-calendar-form.tsx` (cliente) agrega:
  - `GoogleCalendarConnectButton({ reconnect?, variant?, disabled? })`: `<form
    action={connectGoogleCalendarAction}>` con `T.googleReconnect` / `T.googleConnect` (como
    `MercadoPagoConnectButton`).
  - `GoogleCalendarCallbackBanner()`: copia de `MercadoPagoCallbackBanner` con el parámetro `gcal`,
    `GOOGLE_CALENDAR_TEXT.callback` y tono `success` (connected) / `warning` (denied) / `danger` (resto).
  - `GoogleDisconnectButton`: sin cambios (el texto nuevo viene de `SETTINGS_TEXT`).

### B7.5 `apps/web/src/guard-coverage.test.ts`

- Se **borra** `LEGACY_EXEMPT["auth.ts"]` (auth.ts ya no usa el adaptador legacy).
- La lista de sanidad de rutas agrega `"app/api/google-calendar/oauth/callback/route.ts"`.
- Test nuevo: el source de `connectGoogleCalendarAction`, `disconnectGoogleAction`,
  `saveGoogleCalendarIdAction` y de la ruta callback contiene `requireOwnerContext(` y no
  `requireTenantContext(`.

### B7.6 `/privacidad` (D16) — `apps/web/src/app/privacidad/page.tsx`

`updated=` pasa a la fecha del día en que se implementa (formato "25 de noviembre de 2026"). Cambios de
texto (el resto queda igual):

**"Qué datos tratamos" → "De quienes usan el panel"**: sin cambios.

**"Datos de Google"**, primer párrafo:
> Numa pide a Google dos permisos distintos. Para iniciar sesión, solo tu identidad básica
> (`openid`, `email`, `profile`). Aparte, y solo si la responsable del consultorio conecta su
> calendario desde Ajustes → Google Calendar, el permiso **calendar.events** sobre Google Calendar
> (junto con su identidad, para mostrar qué cuenta quedó conectada). Iniciar sesión nunca da acceso a
> tu calendario.

Viñetas:
- **A qué datos accedemos:** nombre, correo y foto de tu cuenta de Google, solo para iniciar sesión en
  el panel. Si conectás Google Calendar: el correo y un identificador interno de la cuenta conectada, y
  un token de acceso (refresh token) que nos permite escribir en ese calendario. Numa no lee la lista
  de tus eventos ni tu disponibilidad: solo crea, actualiza y borra los eventos de los turnos que crea
  el propio Numa.
- **Para qué los usamos:** el correo del inicio de sesión, para comprobar que tu cuenta tiene acceso al
  consultorio; el correo de la cuenta conectada, para mostrarte en Ajustes qué cuenta está conectada; el
  identificador, para reconocer la misma cuenta si la volvés a conectar; el token, para que cada turno
  confirmado aparezca en tu calendario, se mueva si se reprograma y se borre si se cancela. No usamos
  datos de Google para ningún otro fin, ni para publicidad.
- **Con quién se comparten:** con nadie. Los datos de Google no se venden ni se transfieren a terceros.
  En particular, ningún dato obtenido de Google se envía a proveedores de inteligencia artificial: el
  asistente del panel y las respuestas con IA del WhatsApp no tienen acceso a la conexión con Google
  Calendar, y los datos de Google no se usan para desarrollar, mejorar ni entrenar modelos.
- **Cómo se protegen:** el token se guarda cifrado (AES-256-GCM) en la base de datos del servidor de
  Arzium, con una clave propia, separada del inicio de sesión; la base no está expuesta a internet, todas
  las conexiones van cifradas (HTTPS) y el acceso administrativo al servidor está restringido.
- **Cuánto tiempo se guardan y cómo se borran:** nombre, correo y foto del inicio de sesión viven en la
  cookie de sesión, que vence al cerrar sesión. El token y el correo de la cuenta conectada se guardan
  mientras el calendario esté conectado: al tocar *Desconectar* en Ajustes → Google Calendar se borran
  en el momento y además pedimos a Google que revoque el permiso. El identificador interno de la cuenta
  se conserva para reconocerla si la volvés a conectar; podés pedir que lo borremos escribiendo a
  {mail}. También podés revocar el permiso desde [la configuración de tu cuenta de Google]. Los eventos
  ya creados quedan en tu calendario y podés borrarlos cuando quieras.

(Se elimina la frase vieja "la base solo guarda el correo durante unos minutos (como máximo 10) mientras
conectás Mercado Pago": desde 028a el state de MP no guarda el correo.)

**"Con quién se comparten" → Google:** "inicio de sesión y, si el consultorio conecta su calendario,
los eventos de los turnos en Google Calendar." **Servidor:** "... Los tokens de acceso a Mercado Pago y
a Google Calendar se guardan cifrados."

**English summary**: mismo contenido, en este orden:
- Primer párrafo: "Numa requests two separate sets of permissions. Signing in only uses the `openid`,
  `email` and `profile` scopes. Separately, and only when the clinic owner connects a calendar from
  Settings → Google Calendar, Numa requests `https://www.googleapis.com/auth/calendar.events` (plus
  `openid` and `email`, to show which account is connected). Signing in never grants access to your
  calendar."
- **Data accessed:** "your Google name, email address and profile picture (sign-in only). If you
  connect Google Calendar: the email address and an internal identifier of the connected account, and
  an OAuth refresh token that lets Numa write to that calendar. Numa does not read or list your calendar
  events or availability; it only creates, updates and deletes the appointment events that Numa itself
  created."
- **Data use:** "the sign-in email is checked against the clinic memberships; the connected account's
  email is shown in Settings; the identifier is used to recognize the same account if you reconnect it;
  the token is used to add each confirmed appointment to your calendar, move it when it is rescheduled
  and delete it when it is cancelled. Google user data is used for nothing else and never for
  advertising."
- **Data sharing:** "Google user data is not shared, sold or transferred to any third party. In
  particular, no data obtained from Google APIs is sent to AI providers: the panel assistant and the
  WhatsApp AI replies have no access to the Google Calendar connection, and Google user data is not used
  to develop, improve or train AI/ML models."
- **Data protection:** "the token is stored encrypted (AES-256-GCM) in Arzium's server database with a
  dedicated key, separate from sign-in; the database is not exposed to the internet, all traffic is
  encrypted (HTTPS) and administrative access to the server is restricted."
- **Retention and deletion:** "name, email and picture from sign-in live in the session cookie, which
  ends when you sign out. The token and the connected account's email are kept while the calendar is
  connected; when you click *Disconnect* in Settings → Google Calendar they are deleted immediately and
  Numa asks Google to revoke the permission. The internal account identifier is kept to recognize the
  account if you reconnect it; email {mail} to have it deleted. You can also revoke access at
  myaccount.google.com/permissions. Events already created stay in your calendar and you can delete them
  at any time."
- El párrafo final de Limited Use: sin cambios.

## B8. Bot (`apps/bot/src/workers.ts`)

```ts
import { listConnectedGoogleCalendarTenants, syncGoogleCalendar } from "@nutri-bot/db/domain/googleCalendar";
// (se quita syncGoogleCalendar del import de "@nutri-bot/db/domain")

let calendarRunning = false;

/** HU-028b (D2a): sync de Google Calendar por consultorio conectado; una falla no frena a los demás.
 *  Nunca loguea el error crudo (un GaxiosError trae el header Authorization). */
export async function runGoogleCalendarSync(): Promise<void> {
  if (calendarRunning) return;
  calendarRunning = true;
  try {
    let tenants: { tenantId: string }[];
    try {
      tenants = await listConnectedGoogleCalendarTenants();
    } catch {
      logger.error("Error en sync de Google Calendar");
      return;
    }
    for (const tenant of tenants) {
      try {
        const res = await syncGoogleCalendar(tenant);
        if (res.processed > 0 || res.error) {
          logger.info({ tenantId: tenant.tenantId, processed: res.processed, error: res.error }, "Sync Google Calendar");
        }
      } catch {
        logger.error({ tenantId: tenant.tenantId }, "Error en sync de Google Calendar");
      }
    }
  } finally {
    calendarRunning = false;
  }
}
```

- El cron `"* * * * *"` de Calendar llama `runGoogleCalendarSync()` (mismo lugar en la lista de
  `cron.schedule`: los tests miran posiciones).
- `runStartupJobs`: reemplaza `await syncGoogleCalendar()` por `await runGoogleCalendarSync()` (no tira).
- `res.error` ya viene saneado (§B5.5). `getConversationTenant()` no se usa para Calendar.

## B9. Traslado del token de Daiana (D6a) — `packages/db/scripts/google-calendar-transfer.ts`

CLI: `tsx scripts/google-calendar-transfer.ts [--apply]` (sin flag = dry-run). Exporta la lógica para el
probe:

```ts
export type GoogleCalendarTransferResult = { transferred: number; alreadyConnected: number; skipped: number };
export async function transferLegacyGoogleCalendarTokens(
  db: PrismaClient,
  opts: { apply: boolean; env: Record<string, string | undefined>; now: Date },
): Promise<GoogleCalendarTransferResult>;
```

Reglas:
1. `DATABASE_URL` explícita (`new PrismaClient({ datasourceUrl })`, como `legacy-memberships.ts`); falta
   → exit 2. `loadIntegrationTokenKey(env)` falla → mensaje `"INTEGRATION_TOKEN_KEY inválida o ausente"`
   y exit 2 **antes** de leer nada.
2. Una transacción. Con `--apply`: `LOCK TABLE "GoogleCalendarAccount" IN SHARE ROW EXCLUSIVE MODE`.
3. Candidatos: `Professional` con `googleRefreshToken IS NOT NULL`, `tenantId` no null y que sea la
   profesional de la agenda principal de su tenant (`JOIN "Agenda" a ON a."professionalId" = p.id AND
   a."tenantId" = p."tenantId" AND a."isPrimary"`). Los que tienen token pero no cumplen → `skipped`.
4. Por candidato: si ya existe `GoogleCalendarAccount` del tenant con `refreshTokenEnc` no null **o**
   `disconnectedAt` no null → `alreadyConnected` (no se pisa una conexión hecha con el flujo nuevo ni se
   resucita una desconectada). Si no: upsert por `tenantId` con `refreshTokenEnc =
   sealSecret(token, key, GOOGLE_SECRET_AAD.refreshToken(tenantId))`, `calendarId =
   p.googleCalendarId`, `syncError = p.googleSyncError`, `syncErrorAt = syncError ? now : null`,
   `connectedAt = now`, `scope = null`, y la identidad de §5 → `transferred`. Releer la fila y
   `openSecret(...) === token`; si no, tirar (rollback de todo).
5. Identidad (opcional, para la fila "Cuenta" y D8): si `env.GOOGLE_CALENDAR_OWNER_EMAIL` no está vacía,
   buscar el `User` con `canonicalEmail(email)` igual, `googleSubject` no null y membresía en ese tenant →
   `googleEmail`/`googleSubject`. Si no se encuentra → los dos null (Ajustes no muestra la fila "Cuenta";
   D8 trata una reconexión como `same`).
6. **No** modifica `Professional` (rollback de código sin reconectar). El texto plano se borra cuando la
   OWNER conecta/desconecta con el flujo nuevo, o con la columna en 028b-2.
7. Salida: una sola línea JSON `{"mode":"dry-run"|"apply","transferred":n,"alreadyConnected":n,
   "skipped":n}`. Nunca tokens, emails, ids de usuario ni el error crudo (`catch` → mensaje fijo +
   exit 1).
8. Idempotente: correrlo dos veces deja la base igual que una (la segunda da `alreadyConnected`).

**Cómo corre en producción:** `deploy/deploy.sh` ya en ejecución es la versión **vieja** (bash leyó
`main()` antes del `git checkout`), así que un paso nuevo en `deploy.sh` no correría en el deploy que lo
introduce. En cambio `compose.yml` se lee después del checkout. Por eso el traslado va dentro del
servicio `migrate` de `deploy/compose.yml`:

```yaml
  migrate:
    image: nutribot-bot
    profiles: ["tools"]
    env_file: .env   # HU-028b: el traslado necesita INTEGRATION_TOKEN_KEY (se quita en 028b-2)
    environment:
      DATABASE_URL: postgresql://nutri:${POSTGRES_PASSWORD}@db:5432/nutribot
    # HU-028b: migraciones y después el traslado idempotente del token de Google Calendar (D6a).
    # 028b-2 vuelve al comando de una sola línea.
    command: ["sh", "-c", "npx prisma migrate deploy --schema packages/db/prisma/schema.prisma && npx --no-install tsx packages/db/scripts/google-calendar-transfer.ts --apply"]
    depends_on:
      db: { condition: service_healthy }
```

Si el traslado falla (p. ej. falta la clave), `docker compose run --rm migrate` sale con error y
`deploy.sh` corta **antes** de `up -d`: siguen los contenedores viejos sobre la base expandida (que el
binario viejo soporta). `ta()` del README sigue andando (sobrescribe el comando).

## B10. Tests

### B10.1 `packages/core` — `google-calendar-oauth.test.ts`
- `buildGoogleCalendarAuthorizationUrl`: URL exacta con los 9 params en orden; `scope` = `"openid email
  https://www.googleapis.com/auth/calendar.events"`; **no** contiene `include_granted_scopes` ni
  `profile`.
- `googleCalendarRedirectUri`: `"https://numa.arzium.com.ar/x"` → `https://numa.arzium.com.ar/api/google-calendar/oauth/callback`;
  `undefined`, `""`, `"nota url"`, `"ftp://x"` → null.
- `parseGoogleCalendarCallback`: `error=access_denied&state=s` → denied con state; sin code → denied;
  code sin state → invalid; ok.
- `parseGoogleTokenResponse`: ok; sin refresh_token / sin id_token / no objeto → null; el resultado no
  tiene `accessToken`.
- `parseGoogleIdTokenClaims` (id_tokens armados en el test con base64url): válido → `{ subject, email }`
  con email canónico; `aud` distinto; `aud` array sin `azp`; `azp` distinto; `iss` ajeno; vencido;
  `email_verified: "true"` (string) o false; sin sub; payload no JSON; 2 segmentos → null.
- `hasGoogleCalendarEventsScope`: con y sin el scope; `"…/auth/calendar.events.readonly"` → false; null → false.
- `decideGoogleCalendarConnection`: los 4 casos de la firma.
- `GOOGLE_CALENDAR_TEXT.callback` = los 6 textos exactos; `SETTINGS_TEXT.googleDisconnectDescription`
  exacto.

### B10.2 `packages/db` (vitest, mocks)
- `secretBox.test.ts`: `loadIntegrationTokenKey` (válida, corta, vacía → `IntegrationConfigError` con el
  mensaje exacto); un secreto sellado con `GOOGLE_SECRET_AAD.refreshToken("A")` no abre con `("B")` ni
  con `SECRET_AAD.refreshToken`; los tests de MP siguen verdes sin cambios.
- `googleOAuthClient.test.ts`: `getGoogleCalendarAppConfig` (cada variable faltante → null); el body del
  canje lleva los 6 campos y `code_verifier`; error 400 `{ error: "invalid_grant", error_description:
  "SECRETO" }` → `GoogleOAuthApiError` cuyo `message` no contiene el code, el secret, el verifier ni
  "SECRETO"; red → status 0; `revokeGoogleToken` → true en 200, false en 400 y en excepción, nunca tira.
- `googleCalendarAccount.test.ts`:
  - start: guarda `tenantId`, `userId`, `stateHash` (no el state), verifier sellado con el AAD del tenant;
    URL con `code_challenge` = sha256(verifier); sin agenda principal → tira y no crea state; sin config
    → `GoogleCalendarConfigError`.
  - complete: state de otra persona / de otro tenant / vencido → `invalid_state`, `fetch` no llamado,
    state no consumido; `error=access_denied` → `denied` y consume el state propio; canje falla →
    `rejected`; sin `calendar.events` → `scope_denied`, revoke llamado una vez, nada guardado; id_token
    inválido → `rejected`, revoke llamado, nada guardado; `first` → `updateMany` de pasados sin evento a
    `needsGoogleSync: false`; `same` → ningún `appointment.updateMany`, `calendarId` conservado; anterior
    desconocido con `connectedAt` → `same`; `changed` → olvida eventos, re-encola futuros CONFIRMED,
    `calendarId: null`, revoke del token viejo después del commit; siempre limpia
    `Professional.googleRefreshToken` del tenant; el `refreshTokenEnc` guardado abre con el AAD del
    tenant; ningún `console.*` contiene code, tokens ni verifier.
  - disconnect: pone null token/email/scope/syncError, `disconnectedAt`, conserva `googleSubject` y
    `calendarId`; no toca turnos; limpia el texto plano de `Professional`; revoke después del commit;
    revoke false → `console.warn("[google-calendar] revoke_failed")` sin token; sin fila → `{ revoked:
    false }`, sin fetch.
  - view: nunca devuelve `refreshTokenEnc`/`googleSubject`/`scope`; `not_configured` sin env.
  - `setGoogleCalendarId`: no conectado → false sin escribir.
- `gcal.test.ts` (reescrito para `syncGoogleCalendar(t, deps)` con `deps.events` falso): sin fila / sin
  token → 0 y `events` no llamado; cola vacía → no descifra ni llama; consulta y escrituras con el scope
  del tenant pedido (nunca otro); `calendarId` null → `"primary"`; clave inválida o AAD de otro tenant →
  `error: "decrypt_failed"` y `syncError` guardado, sin llamar a Google; `patch` 404 → `googleEventId:
  null, needsGoogleSync: true`; error tipo Gaxios con `config.headers.Authorization: "Bearer SECRETO"` y
  `message` con "SECRETO" → `syncError` = `"Google Calendar respondió con error (status 401,
  invalid_grant)"` sin "SECRETO"; la escritura del error usa `refreshTokenEnc` leído en el `where`.
- `gcal-and-ai-privacy.test.ts`: adaptar a la firma nueva (el motivo sigue sin salir).
- `google-calendar-isolation.test.ts` (nuevo): las garantías 2 y 3 de §B6.
- `professionalSelect.test.ts`: `PROFESSIONAL_SELECT` no tiene ninguna clave `google*`; la lista de
  exclusiones del test de cobertura suma las tres columnas (con comentario "HU-028b, se borran en 028b-2").
- `tenantScope.test.ts`: `resolveTenantCalendarContext` con `select { timezone }`; se borra el caso de
  `resolveLegacyCalendarScope`.

### B10.3 `apps/web`
- `auth.config.test.ts`: los params del proveedor Google son exactamente `{ scope: "openid email profile" }`
  (leer `authConfig.providers[0].options.authorization.params`; si la forma de Auth.js no lo expone, leer
  el source de `auth.config.ts` con `fs` y afirmar que no contiene `calendar`, `access_type` ni `prompt`).
- `auth.test.ts`: se borra el `describe` "D10"; nuevo: un login con `account.refresh_token` presente no
  escribe nada fuera de `registerGoogleIdentity` (ningún `professional.*` ni `googleCalendarAccount.*`) y
  el JWT/sesión no tienen tokens de Google.
- `ajustes/google-calendar-actions.test.ts` (nuevo, o dentro del de MP): las tres acciones con STAFF →
  `redirect("/inicio")` (connect/disconnect) o `{ ok: false }` (save), sin llamar al dominio; OWNER →
  dominio llamado con `ctx` y `userId`; `GoogleCalendarConfigError` → redirect `gcal=not_configured`.
- `api/google-calendar/oauth/callback/route.test.ts`: `owner_only` → `gcal=invalid_state` sin llamar al
  dominio; sin contexto → `/inicio`; resultado → redirect `/ajustes?tab=google&gcal=<r>` con base
  `AUTH_URL`; excepción → `rejected` y el log es solo `[google-calendar] oauth_callback_failed`.
- `ajustes/page.test.tsx`: fixture sin columnas `google*` en la profesional; mock de
  `getGoogleCalendarConnectionView`; OWNER conectado ve Reconectar/Desconectar/Opciones avanzadas y la
  fila "Cuenta" con el email; STAFF no ve botones ni Opciones avanzadas; `not_configured` muestra el aviso
  y el botón deshabilitado; `syncError` muestra la alerta.
- `guard-coverage.test.ts`: §B7.5.

### B10.4 `apps/bot` — `workers.test.ts`
- Mock nuevo de `@nutri-bot/db/domain/googleCalendar` (`listConnectedGoogleCalendarTenants`,
  `syncGoogleCalendar`); se quita `syncGoogleCalendar` del mock de `@nutri-bot/db/domain`.
- El cron de cada minuto de Calendar recorre A y B; `syncGoogleCalendar` que tira en B no frena a A;
  `{ error }` en B se loguea con `tenantId` y sin objeto `err`; falla de la lista → log fijo y no propaga;
  ticks solapados se saltean; `runStartupJobs` llama `runGoogleCalendarSync`.
- Las posiciones de los otros crons siguen iguales (tests existentes).

### B10.5 Probe en Postgres descartable — `google-calendar-per-tenant.integration.ts` + `test-google-calendar-per-tenant.sh`
Modelo: `test-mercadopago-per-tenant.sh` (contenedor y red propios, tmpfs, `127.0.0.1` aleatorio, sin
`.env`, `--pull never`, scratch con `mktemp -d` fuera del repo, `trap` de limpieza). Clave de prueba
generada en el script. **Nunca** red real: OAuth con `deps.fetch` falso, sync con `deps.events` falso.
1. Migraciones **anteriores** a `google_calendar_account` + fixture tipo producción: `legacy-tenant` con
   `legacy-agenda` y `Professional(1)` con `googleRefreshToken = 'rt-legacy'`, `googleCalendarId =
   'cal-x'`, un `User` OWNER con `googleSubject`; turnos con y sin `googleEventId`.
2. Aplicar todas las migraciones: `Professional` intacto (md5 de las tres columnas igual), tablas nuevas
   vacías.
3. Traslado sin `INTEGRATION_TOKEN_KEY` → exit ≠ 0 y 0 filas. Dry-run → `transferred: 1` y 0 filas.
   `--apply` (con `GOOGLE_CALENDAR_OWNER_EMAIL`) → fila con `openSecret` = `'rt-legacy'`, `calendarId =
   'cal-x'`, `googleEmail`/`googleSubject` del OWNER, `Professional` sin cambios. Segundo `--apply` →
   `alreadyConnected: 1` y la fila idéntica (md5 de `refreshTokenEnc` igual).
4. Consultorio B con agenda, OWNER y turnos. Conectar B con `completeGoogleCalendarOAuth` (token e
   id_token falsos): la fila de A no cambia (foto antes/después).
5. `syncGoogleCalendar(A)` y `(B)` con un `events` falso que registra el refresh token y el `calendarId`
   de cada llamada: los turnos de A solo con el token y el calendario de A; los de B solo con los de B.
6. `events` de B tira 401 → B con `syncError`, A sincroniza normal en la misma corrida
   (`listConnectedGoogleCalendarTenants` + bucle como el cron).
7. State de A consumido con el `userId` o el `tenantId` de B → `invalid_state` y el state sigue.
8. Reconectar A con **otro** `sub` → `googleEventId` de A en null y futuros CONFIRMED re-encolados; B
   intacto. Reconectar con el mismo `sub` → ningún turno cambia.
9. Desconectar A (revoke por `deps.fetch` falso) → token null, `googleSubject` conservado, turnos y
   `googleEventId` intactos, `Professional(1).googleRefreshToken` null; B intacto;
   `listConnectedGoogleCalendarTenants()` = [B].
10. Drift: `prisma migrate diff --from-url <url del contenedor> --to-schema-datamodel
    prisma/schema.prisma --exit-code` → 0. **Solo contra el contenedor descartable.**

## B11. Archivos y flujo (radio de impacto, tanda 028b)

| Archivo | Acción |
|---|---|
| `packages/db/prisma/schema.prisma` | `Tenant`, `User`, comentarios de `Professional`, modelos nuevos (§B4.1). |
| `packages/db/prisma/migrations/<ts>_google_calendar_account/migration.sql` | Crear (§B4.2). |
| `packages/core/src/google-calendar-oauth.ts` (+ `.test.ts`) | Crear (§B5.1). |
| `packages/core/src/index.ts` | `export * from "./google-calendar-oauth";` |
| `packages/core/src/settings-options.ts` | `googleDisconnectDescription`. |
| `packages/db/domain/secretBox.ts` (+ `.test.ts`) | §B5.2. |
| `packages/db/domain/googleOAuthClient.ts` (+ `.test.ts`) | Crear (§B5.3). |
| `packages/db/domain/googleCalendarAccount.ts` (+ `.test.ts`) | Crear (§B5.4). |
| `packages/db/domain/gcal.ts`, `gcal.test.ts`, `gcal-and-ai-privacy.test.ts` | §B5.5. |
| `packages/db/domain/googleCalendar.ts` | Crear (barrel, §B5.6). |
| `packages/db/domain/google-calendar-isolation.test.ts` | Crear (§B6). |
| `packages/db/domain/index.ts`, `tenantScope.ts` (+ test), `legacySchedulingScope.ts`, `professionalSelect.ts` (+ test) | §B5.6. |
| `packages/db/package.json` | Export del subpath y dos scripts. |
| `packages/db/scripts/google-calendar-transfer.ts` | Crear (§B9). |
| `packages/db/scripts/google-calendar-per-tenant.integration.ts`, `test-google-calendar-per-tenant.sh` | Crear (§B10.5). |
| `apps/web/src/auth.config.ts` (+ `auth.config.test.ts`), `auth.ts` (+ `auth.test.ts`) | §B7.1. |
| `apps/web/src/lib/calendar-token-owner.ts` (+ test) | **Borrar**. |
| `apps/web/src/app/(panel)/ajustes/actions.ts` (+ test de acciones) | §B7.2. |
| `apps/web/src/app/api/google-calendar/oauth/callback/route.ts` (+ test) | Crear (§B7.3). |
| `apps/web/src/app/(panel)/ajustes/page.tsx`, `google-calendar-form.tsx`, `page.test.tsx` | §B7.4. |
| `apps/web/src/guard-coverage.test.ts` | §B7.5. |
| `apps/web/src/app/privacidad/page.tsx` | §B7.6. |
| `apps/bot/src/workers.ts` (+ `workers.test.ts`) | §B8. |
| `deploy/compose.yml` | Servicio `migrate` (§B9). |
| `.env.example` | Quitar el bloque de `GOOGLE_CALENDAR_OWNER_EMAIL`; agregar en Auth/Google: `# Clave para cifrar el token de Google Calendar (y futuras integraciones): openssl rand -base64 32.` / `# Si se cambia, cada consultorio tiene que reconectar Google Calendar.` / `INTEGRATION_TOKEN_KEY=` / `# Redirect URI a cargar en Google Cloud: <AUTH_URL>/api/google-calendar/oauth/callback`. |
| `deploy/.env.example` | Agregar `INTEGRATION_TOKEN_KEY=` con el comentario `#  openssl rand -base64 32 (cifra el token de Google Calendar; si se pierde, hay que reconectar)`. `GOOGLE_CALENDAR_OWNER_EMAIL=` **queda** con el comentario `# Solo para el traslado de HU-028b; se borra en 028b-2`. |
| `README.md` | Sección "Google Calendar": conecta el OWNER desde Ajustes con un permiso aparte del login; token cifrado con `INTEGRATION_TOKEN_KEY`; redirect URI; el bot sincroniza cada minuto por consultorio. |
| `deploy/README.md` | Sección nueva (§B13). |

No se tocan: `middleware.ts`, `deploy/deploy.sh`, `apps/bot/src/ai/*`, `botAi.ts`, `mercadopago*`,
`apps/web/src/app/acerca/page.tsx` (su texto ya es correcto).

## B12. Tanda 028b-2 · contracción (rama aparte, después de producción)

**Precondición:** 028b desplegada y, en producción, confirmado con solo lectura que
`SELECT "tenantId", "refreshTokenEnc" IS NOT NULL, "syncError" IS NULL FROM "GoogleCalendarAccount";` da
`legacy-tenant | t | t` y que el bot loguea `Sync Google Calendar` con `tenantId: "legacy-tenant"` sin
errores después de un turno nuevo. Recién ahí se abre `feat/HU-028b2-contraccion-calendar` desde
`develop` (con label `migración`).

1. `schema.prisma`: borrar `Professional.googleRefreshToken`, `googleCalendarId`, `googleSyncError` y
   `MercadoPagoOAuthState.sessionEmail`.
2. Migración `google_calendar_contraction` (`--create-only`), con este SQL (el guard se agrega a mano
   antes de los `DROP` generados):
   ```sql
   -- HU-028b-2: el token de Google Calendar ya vive cifrado en GoogleCalendarAccount (traslado de 028b).
   DO $$
   BEGIN
     IF EXISTS (
       SELECT 1 FROM "Professional" p
       WHERE p."googleRefreshToken" IS NOT NULL
         AND (p."tenantId" IS NULL
              OR NOT EXISTS (SELECT 1 FROM "GoogleCalendarAccount" g WHERE g."tenantId" = p."tenantId"))
     ) THEN
       RAISE EXCEPTION 'HU-028b-2: hay tokens de Google Calendar sin trasladar; correr el traslado antes';
     END IF;
   END $$;

   ALTER TABLE "Professional" DROP COLUMN "googleRefreshToken",
     DROP COLUMN "googleCalendarId",
     DROP COLUMN "googleSyncError";
   ALTER TABLE "MercadoPagoOAuthState" DROP COLUMN "sessionEmail";
   ```
   Estos `DROP` **sí** los pide la SDD (excepción explícita a la regla del skill).
3. Borrar `packages/db/scripts/google-calendar-transfer.ts`, el script `gcal:transfer` de
   `package.json` y los pasos de traslado del probe (el probe sigue con A/B).
4. `deploy/compose.yml`: `migrate` vuelve a `command: ["npx", "prisma", "migrate", "deploy", "--schema",
   "packages/db/prisma/schema.prisma"]` y sin `env_file`.
5. `professionalSelect.test.ts`: quitar las tres exclusiones; comentarios `EN DESUSO` fuera;
   `googleCalendarAccount.ts`: quitar la limpieza de `Professional.googleRefreshToken`.
6. `deploy/.env.example` y `deploy/.env` del VPS: borrar `GOOGLE_CALENDAR_OWNER_EMAIL` (después del deploy).
7. Correr `bash packages/db/scripts/test-tenant-foundation.sh` (inserta `googleRefreshToken` en una
   migración vieja: tiene que seguir pasando) y la verificación de §B14.
8. Ventana del deploy de 028b-2: el binario de 028b todavía tiene las columnas en su cliente Prisma;
   una consulta a `Professional` **sin `select`** fallaría durante los segundos entre `migrate` y
   `up -d`. Antes de la contracción, `grep -rn "professional.find" apps packages` y confirmar que todas
   llevan `select` (si alguna no, se agrega en 028b-2 y se documenta).

## B13. Nota de deploy (tanda 028b)

Orden real (`deploy/deploy.sh`): `pg_dump` → `build web bot` → `docker compose run --rm migrate`
(migración **y** traslado, §B9) → `up -d`.

**Antes de mergear a `main`:**
1. En producción, solo lectura: `SELECT id, "tenantId", "googleRefreshToken" IS NOT NULL AS has_token,
   "googleCalendarId" IS NOT NULL AS custom_cal, "googleSyncError" IS NOT NULL AS has_error FROM
   "Professional";` (esperado: `1 | legacy-tenant | t | ? | f`) y `grep -c
   '^GOOGLE_CALENDAR_OWNER_EMAIL=.\+' deploy/.env` (1 = la identidad de la cuenta se completa sola; 0 =
   Ajustes no muestra la fila "Cuenta" hasta que Daiana reconecte, la sync anda igual).
2. Generar la clave y cargarla en `deploy/.env`: `INTEGRATION_TOKEN_KEY=$(openssl rand -base64 32)`.
   **Sin esta clave el deploy corta en `migrate`** (a propósito) y siguen los contenedores viejos.
   Guardar la clave en el gestor de secretos: si se pierde, cada consultorio reconecta.
3. Google Cloud Console → Credenciales → cliente OAuth de Numa → agregar la redirect URI
   `https://numa.arzium.com.ar/api/google-calendar/oauth/callback` (y la de `localhost:3000` para
   desarrollo). Pantalla de consentimiento: el scope `calendar.events` sigue declarado (lo pide la app,
   ahora desde Ajustes). Para la verificación en curso (D15): el video demostrativo tiene que mostrar el
   flujo nuevo (login sin calendario → Ajustes → Conectar Google Calendar → consentimiento con
   `calendar.events` → turno confirmado que aparece en el calendario) y la respuesta sobre uso limitado
   puede citar §B6 y `/privacidad`.

**Durante el deploy:** entre `migrate` y `up -d` el binario viejo sigue sincronizando con el token en
texto plano (la migración no toca `Professional`). Si alguien inicia sesión en esa ventana, el binario
viejo podría guardar un token nuevo en `Professional` que no se traslada: no pasa nada (el trasladado
sigue siendo válido).

**Después del deploy** (Daiana **no** reconecta):
- `docker compose logs migrate` (o la salida del deploy) muestra
  `{"mode":"apply","transferred":1,"alreadyConnected":0,"skipped":0}`. Si diera `transferred: 0` y
  `skipped: 1`, parar y revisar la agenda principal (no reconectar a ciegas).
- Ajustes → Google Calendar de `legacy-tenant`: "Conectado", misma opción de calendario; con OWNER se
  ven Reconectar/Desconectar.
- En los logs del bot: `Sync Google Calendar` con `tenantId: "legacy-tenant"` tras confirmar o mover un
  turno, y el evento aparece en el mismo calendario.
- Login: Google ya no pide permiso de calendario (probar con una sesión nueva).
- Re-correr el traslado a mano (idempotente, dry-run): `docker compose run --rm migrate npx --no-install
  tsx packages/db/scripts/google-calendar-transfer.ts`.

**Rollback:** volver a 028a con `deploy.sh <sha>`: la base expandida es compatible; el código viejo lee
`Professional.googleRefreshToken`, que sigue ahí salvo que Daiana haya conectado o desconectado con el
flujo nuevo (entonces vuelve a quedar el login como "Conectar", como antes de 028b).

**Después, en otra publicación:** 028b-2 (§B12).

## B14. Checklist atómico (tanda 028b)

Antes de empezar: `git fetch && git status` en `feat/HU-028-integraciones-por-consultorio`; confirmar
que ninguna otra HU con label `migración` está en `implementando`. Reglas de datos de AGENTS.md: en la
base de desarrollo solo lecturas, la migración y las simulaciones que limpian por id; los probes de dos
consultorios corren **solo** en Postgres descartable. Nada de WhatsApp real ni de llamadas reales a
Google (todo por `deps.fetch`/`deps.events` o mocks). Si falta `INTEGRATION_TOKEN_KEY` en el `.env` de la
raíz, **no** editar `.env`: anotarlo en `impl` y pedir que la agregue el usuario.

### packages/db — esquema y migración
- [ ] 1. `docker compose exec -T db pg_dump -U nutri -Fc nutribot > ~/nutribot-dev-pre-028b.dump` (fuera del repo).
- [ ] 2. `cd packages/db && npx dotenv -e ../../.env -- prisma migrate status`: sin drift (si hay → `blocked`, nunca reset).
- [ ] 3. Editar `schema.prisma` (§B4.1).
- [ ] 4. `npx dotenv -e ../../.env -- prisma migrate dev --create-only --name google_calendar_account`.
- [ ] 5. Comparar el SQL con §B4.2: solo `CREATE TABLE`/`CREATE INDEX`/`ADD CONSTRAINT` de las tablas nuevas.
- [ ] 6. `npm run db:migrate` y `npm run db:generate` (desde la raíz).
- [ ] 7. Releer en dev (solo lectura): `Professional(1)` con las mismas tres columnas que antes (md5); tablas nuevas vacías.

### packages/core
- [ ] 8. RED: `google-calendar-oauth.test.ts` (§B10.1) y el texto de `settings-options`.
- [ ] 9. GREEN: `google-calendar-oauth.ts`, export en `index.ts`, `googleDisconnectDescription`. `npx vitest run packages/core`.

### packages/db — dominio
- [ ] 10. RED + GREEN: `secretBox.ts` (`loadIntegrationTokenKey`, `GOOGLE_SECRET_AAD`) sin cambiar MP.
- [ ] 11. RED + GREEN: `googleOAuthClient.ts`.
- [ ] 12. RED + GREEN: `googleCalendarAccount.ts` (start, consume, complete, save con D8, disconnect con revoke, view, setCalendarId, list).
- [ ] 13. RED + GREEN: `gcal.ts` por consultorio con `deps.events`, `describeGoogleCalendarError`, patch 404 auto-reparable; `gcal-and-ai-privacy.test.ts`.
- [ ] 14. `tenantScope.ts`, `legacySchedulingScope.ts` (borrar `resolveLegacyCalendarScope`), `professionalSelect.ts` + tests.
- [ ] 15. `domain/index.ts` sin `gcal`; barrel `googleCalendar.ts`; `package.json` (subpath + scripts).
- [ ] 16. `google-calendar-isolation.test.ts` (§B6). `npx vitest run packages/db`.
- [ ] 17. `npm run typecheck` (va a fallar en web/bot hasta los pasos siguientes: esperado).

### packages/db — traslado y probe
- [ ] 18. `scripts/google-calendar-transfer.ts` (§B9).
- [ ] 19. `google-calendar-per-tenant.integration.ts` + `test-google-calendar-per-tenant.sh` (§B10.5); `npm run test:gcal-tenants --workspace packages/db`.
- [ ] 20. En dev, **solo dry-run** (lee, no escribe): `npm run gcal:transfer --workspace packages/db` → `transferred: 1`. El `--apply` en dev lo decide el usuario (copia cifrada del token de su base; sin él, el calendario de dev deja de sincronizar hasta reconectar desde Ajustes).

### apps/web
- [ ] 21. `auth.config.ts` + `auth.ts`; borrar `calendar-token-owner.ts` y su test; `auth.config.test.ts` y `auth.test.ts`.
- [ ] 22. `actions.ts` (connect, disconnect, save owner-only) + tests.
- [ ] 23. Ruta `api/google-calendar/oauth/callback/route.ts` + test.
- [ ] 24. `page.tsx` + `google-calendar-form.tsx` (botón conectar, banner, fila "Cuenta", owner-only) + `page.test.tsx`.
- [ ] 25. `guard-coverage.test.ts` (§B7.5).
- [ ] 26. `/privacidad` (§B7.6) con la fecha del día.

### apps/bot
- [ ] 27. `workers.ts`: `runGoogleCalendarSync` por consultorio, cron y arranque (§B8).
- [ ] 28. `workers.test.ts` (§B10.4).

### Cierre
- [ ] 29. `deploy/compose.yml` (§B9), `.env.example`, `deploy/.env.example`, `README.md`, `deploy/README.md` (sección "Google Calendar por consultorio (HU-028b)" con §B13).
- [ ] 30. Verificación completa (§B15). Reporte en `progress/impl_HU-028b.md` (incluir la salida del dry-run de dev y la lista de §B6 con el test que fija cada punto).

Commits sugeridos (uno por bloque, Conventional Commits): migración+schema · core · domain · traslado+probe
· web (login) · web (Ajustes+callback) · privacidad · bot · deploy+docs. El commit del login y el de la
migración van solos (riesgo alto: credenciales y datos).

## B15. Verificación (comandos exactos, desde la raíz)

```bash
npm run db:generate
npm run typecheck                                   # core, db, web y bot: 0 errores
npm run test                                        # vitest de todo el monorepo
npx vitest run packages/core/src/google-calendar-oauth.test.ts packages/db/domain/secretBox.test.ts packages/db/domain/googleOAuthClient.test.ts packages/db/domain/googleCalendarAccount.test.ts packages/db/domain/gcal.test.ts packages/db/domain/gcal-and-ai-privacy.test.ts packages/db/domain/google-calendar-isolation.test.ts packages/db/domain/professionalSelect.test.ts packages/db/domain/tenantScope.test.ts apps/web/src/auth.test.ts apps/web/src/auth.config.test.ts apps/web/src/app/api/google-calendar "apps/web/src/app/(panel)/ajustes" apps/web/src/guard-coverage.test.ts apps/bot/src/workers.test.ts
npm run test:gcal-tenants --workspace packages/db   # migración + traslado + probe A/B + drift (Postgres descartable)
npm run test:mp-tenants --workspace packages/db     # regresión 028a (Postgres descartable)
bash packages/db/scripts/test-tenant-isolation.sh   # aislamiento 025b (Postgres descartable)
(cd packages/db && npx dotenv -e ../../.env -- prisma migrate status)   # al día, sin drift
npm run gcal:transfer --workspace packages/db       # dry-run en dev: solo cuenta, no escribe
npm run test:confirm-flow --workspace apps/bot      # regresión del flujo sí/no (limpia por id, sin WhatsApp)
npm run test:booking-reason --workspace apps/bot    # regresión de reservas (sin WhatsApp)
npm run build --workspace apps/web
# Restos del login con calendario: las dos tienen que dar vacío.
grep -rn "maybeStoreCalendarToken\|calendar-token-owner\|shouldStoreCalendarToken\|resolveLegacyCalendarScope" apps packages --include='*.ts' --include='*.tsx'
grep -rln "GOOGLE_CALENDAR_OWNER_EMAIL" apps packages --include='*.ts' --include='*.tsx' | grep -v "packages/db/scripts/google-calendar-transfer.ts\|packages/db/scripts/google-calendar-per-tenant.integration.ts"
grep -n "calendar" apps/web/src/auth.config.ts      # vacío
./ops/harness/verify.sh
```

Ninguna verificación manda WhatsApp, arranca el bot, toca la sesión de Baileys ni llama a Google de
verdad. Probar la conexión real con Google (consentimiento, evento en el calendario) queda como
verificación manual del usuario en desarrollo, con la redirect URI de `localhost` cargada.

## B16. Dudas técnicas

Ninguna bloqueante. Supuestos a confirmar durante la implementación (anotar en `impl` si fallan):
- `authConfig.providers[0].options.authorization.params` es accesible en el test (si no, se usa el
  chequeo de source de §B10.3).
- Google devuelve `id_token` en el canje cuando el scope incluye `openid` y `refresh_token` con
  `access_type=offline&prompt=consent` (comportamiento documentado). Si no viniera `refresh_token`, el
  resultado es `rejected` y se anota.
- `npx --no-install tsx` funciona dentro de la imagen `nutribot-bot` (lo usa hoy `ta()` del README).

---
---

# SDD · HU-028c · IA por consultorio

HU: `docs/hu-integraciones-por-consultorio.md` (validada 2026-11-25; D1–D16 = recomendaciones). Issue #71 · rama
`feat/HU-028c-ia-por-consultorio` (sale de `develop` con 028a y 028b mergeadas; worktree
`../Nutri-Bot-HU028c`) · responsable `senkuch4n` · **lleva migración** (label `migración`; solo una HU con
migración en `implementando` a la vez). Parte del esquema que deja 028b (`20261126010640_google_calendar_account`).
Skills: `skills/migracion-prisma.md` y `skills/refactor.txt` (diagnóstico + radio de impacto + checklist; el plan
vive acá). Decisiones que aplican: D1 (ver D-c1), D9a, D10a, D11b, D12, D13b, D14, D15, D16.

## C0. Decisión previa para el usuario · D-c1 (relación con 025c)

> **Resuelta (2026-11-27): opción (b).** El usuario eligió que la 028c absorba solo `runBotAiTool` con `tenantId`
> y la línea de `handleIncoming`. El resto de 025c/025d quedó en el issue #91 (HU-033).

**Hecho verificado en el código (2026-11-25, `develop` = `e7c0280`):** la 025c **no está hecha** y la 025d
tampoco.

- `packages/db/domain/botAi.ts`: `runBotAiTool` no recibe tenant; `servicios`/`disponibilidad` usan
  `activeServices()` = `service.findMany({ where: { active: true } })` **sin filtro de consultorio**;
  `disponibilidad` usa `LEGACY_TENANT_ID` fijo; `mis_turnos` filtra solo por `patientId`; los cuatro leen
  `getProfessional()` (= `Professional(1)`).
- `getProfessional()` sigue en `availability.ts` y se usa en `apps/bot/src/conversation.ts` (7 lugares),
  `apps/bot/src/booking.ts`, 4 páginas del portal y scripts. `ENABLED_TENANT_IDS` sigue en
  `apps/web/src/lib/tenant-context.ts` y `middleware.ts`. El token del portal sigue en v1 (no hay `p2.`).
- No existe `SupportGrant`/`PlatformOperator` en el schema (025d sin hacer).
- El issue #68 (HU-025) está **cerrado** y `backlog/HU-025.json` está `aprobada` con 025a-1…025b-2: **la 025c no
  tiene issue, rama ni responsable**. Esperarla (D1a) es esperar algo que hoy nadie tiene en curso.

**Opciones**

- **(a) 028c solo hace lo que no depende de 025c** (tenant en `BotAiQuestion`, topes por consultorio, registro
  del panel) y deja las tools del bot como están. Consecuencia: el escenario de la HU "La IA que trabaja para A
  no lee datos de B" queda **sin cumplir** en 028c, y `servicios`/`disponibilidad` siguen devolviendo los
  servicios activos **de todos los consultorios** (hoy ya pasa en cualquier base con un segundo tenant: los
  probes y una futura alta de consultorio). La HU-028 no se puede cerrar completa hasta que alguien retome 025c.
- **(b) 028c absorbe la parte mínima de 025c que toca la IA del bot** y nada más: `runBotAiTool` con `tenantId`
  (las cuatro tools sobre el consultorio de la conversación, con `getTenantProfessional`), y en
  `conversation.ts` **solo** la lectura de la profesional al inicio de `handleIncoming` (de donde salen
  `botAiEnabled`, la zona horaria y el nombre que usa la IA). Quedan para 025c, sin tocar: portal (token v2,
  sesión, descargas), `booking.ts`, los otros 6 `getProfessional()` de `conversation.ts`, borrar
  `getProfessional`, y retirar `ENABLED_TENANT_IDS`.

**Recomendación: (b).** Es chica (un archivo de dominio, una línea de `conversation.ts`, sus tests), es el
mismo cambio que la SDD de 025c ya especifica (7.3, regla "IA del bot", así que no se diseña nada distinto), y
cierra una fuga real (`activeServices()` sin tenant), no solo teórica. En producción el resultado es idéntico
(un solo tenant: `getTenantProfessional("legacy-tenant")` resuelve la agenda principal `legacy-agenda` →
`Professional(1)`, la misma fila que `getProfessional()`). D1a se decidió cuando se suponía que 025c estaba por
arrancar; hoy no es así. Si el usuario elige (b), el orquestador anota en
`Refactorizaciones/autenticacion-permisos-tenant.md` §7.3 que el ítem "db + bot: `runBotAiTool` con
`tenantId`" quedó hecho en 028c (el architect no edita esa SDD).

**Esta SDD está escrita para (b).** Si el usuario elige (a): se omiten §C5.3 (`runBotAiTool`), el cambio de
línea de `handleIncoming` de §C6, los pasos 13 y 19 del checklist y los casos de tools de §C8.2/§C8.5; todo lo
demás vale igual.

## C1. Resumen funcional

La IA del bot y la del panel pasan a medirse **por consultorio**. Cada pregunta de la IA del bot
(`BotAiQuestion`) queda asociada al consultorio de su paciente (columna `tenantId` obligatoria, con backfill
desde el paciente y FK compuesta que impide que una pregunta quede en otro consultorio que su paciente). El tope
diario "global" pasa a ser **por consultorio** (el uso de A no consume el cupo de B) y el tope por paciente se
cuenta dentro de su consultorio. Los dos topes del bot se guardan por consultorio en una tabla nueva
(`TenantAiSettings`), los define Arzium **por script** (`ai-limits`), y mientras un consultorio no tenga valor
propio usa el default del `.env` de hoy (D10a): Daiana arranca con los mismos topes efectivos. Las tools de la IA
del bot leen solo servicios, disponibilidad, turnos y perfil del consultorio de la conversación (D-c1 b). El
asistente del panel y "Generar con IA" de planes **registran su consumo** (`PanelAiUsage`: consultorio, función,
fecha, proveedor, modelo, tokens, llamadas, resultado) **sin bloquear** (D11b) y sin guardar pregunta,
respuesta ni datos de pacientes (D12). Proveedor, modelo y clave siguen globales por `.env` (D9a); la profesional
no ve el consumo (D13b); la retención de 90 días sigue global (D14); ningún dato de Google Calendar llega a la IA
(D15, se mantiene el test de 028b). Sin mensajes nuevos del bot.

## C2. Diagnóstico (skill refactor)

- `countBotAiQuestionsToday` cuenta el "global" con `where: { askedAt, outcome }`, **sin tenant**: con dos
  consultorios, el uso de uno consume el cupo del otro. `BotAiQuestion` no tiene `tenantId`.
- Los topes salen solo de `resolveBotAiEnv(process.env)` (`BOT_AI_DAILY_PER_PATIENT`, `BOT_AI_DAILY_GLOBAL`),
  memoizados en `apps/bot/src/ai/runtime.ts`: no hay forma de dar un cupo distinto a un consultorio.
- `runBotAiTool` lee `getProfessional()` (fila 1), `activeServices()` sin tenant, `LEGACY_TENANT_ID` fijo y
  turnos solo por `patientId` (ver C0).
- `handleIncoming` toma `botAiEnabled` (opción 5 del menú) de `getProfessional()`, no del consultorio de la
  conversación.
- Asistente (`asistente/actions.ts`) e IA de planes (`ai-actions.ts`) no registran nada: la respuesta de
  DeepSeek trae `usage` y se descarta.
- `markBotAiQuestionHandedOff` filtra por `id` + `patientId`; sin tenant (defensa en profundidad).

## C3. Workspaces afectados

| Workspace | ¿Se toca? | Qué |
|---|---|---|
| `packages/db` | **Sí** | `schema.prisma` + migración `ai_usage_per_tenant`; `domain/botAi.ts` (firmas con `tenantId`, tools por tenant); `domain/aiUsage.ts` nuevo; `domain/index.ts`; script `scripts/ai-limits.ts` (+ test) y npm `ai-limits`; probe en Postgres descartable `test:ai-tenants`; tests con mocks; `google-calendar-isolation.test.ts` y `gcal-and-ai-privacy.test.ts` ajustados. |
| `packages/core` | **Sí** | `bot-ai.ts`: `BotAiLimits.globalDaily` → `tenantDaily`, `applyTenantBotAiLimits`, `parseTenantAiLimitArg`; `ai-usage.ts` nuevo (`addChatUsage`); tests vitest. |
| `apps/bot` | **Sí** | `conversation.ts` (tenant en conteo, registro, derivación y tools; topes del consultorio; profesional del consultorio al inicio de `handleIncoming`), `ai/ask.ts` (contador `tenant`), tests (`ask.test.ts`, `conversation-*.test.ts`, `conversation-ai.test.ts` nuevo), scripts `test-bot-ai-questions.ts` y `test-booking-reason.ts`. `workers.ts` **no cambia** (purga global, D14). |
| `apps/web` | **Sí** | `lib/deepseek.ts` (constante del proveedor), `asistente/actions.ts` y `pacientes/[id]/planes/[planId]/ai-actions.ts` (registro de consumo) + sus tests; `/privacidad` (una oración, D16). Sin rutas ni pantallas nuevas (D13b). |

**Impacto cruzado (AGENTS.md, "El contrato"):** cambian firmas de `packages/db/domain` que consume **solo el bot**
(`countBotAiQuestionsToday`, `recordBotAiQuestion`, `markBotAiQuestionHandedOff`, `runBotAiTool`) y de
`packages/core` que consumen bot y db (`BotAiLimits`). Se agregan funciones que consume el bot
(`getTenantAiSettings`) y la web (`recordPanelAiUsage`). La migración cambia `BotAiQuestion`, que escribe el
bot. `npm run typecheck` tiene que pasar en **core, db, web y bot**.

## C4. Esquema

### C4.1 Prisma (cambios exactos)

```prisma
model Tenant {
  // … campos actuales sin cambios …
  /// HU-028c (D10a): topes de la IA del bot del consultorio (null/sin fila = default del .env).
  aiSettings             TenantAiSettings?
  /// HU-028c (D11b, D12): registro de consumo de la IA del panel.
  panelAiUsage           PanelAiUsage[]
}

model Patient {
  // … sin cambios salvo la relación con BotAiQuestion, que pasa a tener nombre (hay dos relaciones):
  botAiQuestions       BotAiQuestion[] @relation("PatientBotAiQuestions")
  tenantBotAiQuestions BotAiQuestion[] @relation("PatientBotAiQuestionTenant")
}

model BotAiQuestion {
  id                  String       @id @default(cuid())
  patient             Patient      @relation("PatientBotAiQuestions", fields: [patientId], references: [id], onDelete: Cascade)
  patientId           String
  /// HU-028c: consultorio de la pregunta = el del paciente (lo garantiza la FK compuesta). Base del tope
  /// diario por consultorio y del consumo. Lo pone el bot, nunca la IA.
  tenantId            String
  tenantPatient       Patient      @relation("PatientBotAiQuestionTenant", fields: [patientId, tenantId], references: [id, tenantId], onDelete: Cascade, onUpdate: Restrict)
  // … askedAt … handedOffAt, createdAt: sin cambios …

  @@index([patientId, askedAt])
  @@index([askedAt])
  @@index([tenantId, askedAt])
}

/// HU-028c (D10a): configuración de IA del consultorio que define Arzium (script `ai-limits`, sin UI).
/// null = se usa el default del .env (BOT_AI_DAILY_PER_PATIENT / BOT_AI_DAILY_GLOBAL). 0 = sin preguntas.
/// HU-030 suma acá el cupo por plan; el tope del panel llega con el bloqueo (D11b).
model TenantAiSettings {
  tenantId           String   @id
  tenant             Tenant   @relation(fields: [tenantId], references: [id], onDelete: Restrict, onUpdate: Restrict)
  /// Preguntas por paciente por día (tz de la profesional).
  botDailyPerPatient Int?
  /// Preguntas del consultorio por día (tz de la profesional).
  botDailyPerTenant  Int?
  createdAt          DateTime @default(now())
  updatedAt          DateTime @updatedAt
}

enum PanelAiFeature {
  /// Asistente del panel (/asistente).
  ASSISTANT
  /// "Generar con IA" de un plan alimentario.
  PLAN_AI
}

enum PanelAiOutcome {
  /// El proveedor respondió algo usable.
  OK
  /// Respondió, pero vacío, sin JSON válido, con otro formato o sin alimentos válidos.
  INVALID_RESPONSE
  /// El asistente agotó las vueltas de tools sin respuesta final.
  TOOL_LIMIT
  /// Error del proveedor (o de una tool) durante la llamada.
  ERROR
}

/// HU-028c (D11b, D12): una fila por uso de la IA del panel. Nunca la pregunta, la respuesta, el prompt
/// ni datos del paciente; sin usuario (D12). Sin purga: no tiene datos personales.
model PanelAiUsage {
  id           String         @id @default(cuid())
  tenantId     String
  tenant       Tenant         @relation(fields: [tenantId], references: [id], onDelete: Restrict, onUpdate: Restrict)
  feature      PanelAiFeature
  usedAt       DateTime       @default(now())
  /// "deepseek" (D9a: proveedor global).
  provider     String
  model        String
  /// Suma de `usage.prompt_tokens` / `usage.completion_tokens` de todas las respuestas recibidas.
  inputTokens  Int            @default(0)
  outputTokens Int            @default(0)
  /// Respuestas recibidas del proveedor (vueltas del asistente; 1 en planes; 0 si falló la primera).
  calls        Int            @default(0)
  outcome      PanelAiOutcome
  /// Solo el código o la clase del error (`errorCode`), nunca el mensaje. null si no hubo error.
  errorCode    String?

  @@index([tenantId, usedAt])
}
```

Supuesto a confirmar al generar: si Prisma rechazara la relación **requerida** `tenantPatient` porque
`Patient.tenantId` es `String?`, declararla `Patient?` (el SQL de la FK es el mismo y la columna sigue
`NOT NULL`). Anotarlo en `impl`.

### C4.2 Migración `ai_usage_per_tenant`

Crear con `--create-only`. Prisma va a generar `ADD COLUMN "tenantId" TEXT NOT NULL`, que **falla** con filas:
reemplazar el bloque de `BotAiQuestion` por el de abajo (nullable → backfill → `SET NOT NULL`). El resto
(tipos, tablas, índices, FKs) se deja como lo genera Prisma, comparándolo con este SQL objetivo; si Prisma
genera cualquier `DROP`, parar.

```sql
-- HU-028c: IA por consultorio. BotAiQuestion.tenantId (backfill desde el paciente), topes por
-- consultorio y registro de consumo del panel. No borra ni cambia ninguna fila existente salvo el backfill.
BEGIN;

-- Fail closed: una pregunta de un paciente sin consultorio no se puede atribuir. No se adopta ni se borra.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "BotAiQuestion" q JOIN "Patient" p ON p."id" = q."patientId" WHERE p."tenantId" IS NULL
  ) THEN
    RAISE EXCEPTION 'HU-028c: hay preguntas de la IA del bot de pacientes sin tenantId; resolver a mano antes de migrar';
  END IF;
END $$;

ALTER TABLE "BotAiQuestion" ADD COLUMN "tenantId" TEXT;
-- Producción: un solo tenant, todas quedan en 'legacy-tenant' (el tenant de sus pacientes desde HU-024).
UPDATE "BotAiQuestion" q SET "tenantId" = p."tenantId" FROM "Patient" p WHERE p."id" = q."patientId";
ALTER TABLE "BotAiQuestion" ALTER COLUMN "tenantId" SET NOT NULL;

CREATE INDEX "BotAiQuestion_tenantId_askedAt_idx" ON "BotAiQuestion"("tenantId", "askedAt");
ALTER TABLE "BotAiQuestion" ADD CONSTRAINT "BotAiQuestion_patientId_tenantId_fkey"
  FOREIGN KEY ("patientId", "tenantId") REFERENCES "Patient"("id", "tenantId") ON DELETE CASCADE ON UPDATE RESTRICT;

CREATE TYPE "PanelAiFeature" AS ENUM ('ASSISTANT', 'PLAN_AI');
CREATE TYPE "PanelAiOutcome" AS ENUM ('OK', 'INVALID_RESPONSE', 'TOOL_LIMIT', 'ERROR');

CREATE TABLE "TenantAiSettings" (
    "tenantId" TEXT NOT NULL,
    "botDailyPerPatient" INTEGER,
    "botDailyPerTenant" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "TenantAiSettings_pkey" PRIMARY KEY ("tenantId")
);
-- Prisma no modela CHECK (no genera drift; mismo patrón que food_sara2/catalog_ownership).
ALTER TABLE "TenantAiSettings" ADD CONSTRAINT "TenantAiSettings_limits_check"
  CHECK (("botDailyPerPatient" IS NULL OR "botDailyPerPatient" BETWEEN 0 AND 100000)
     AND ("botDailyPerTenant" IS NULL OR "botDailyPerTenant" BETWEEN 0 AND 100000));
ALTER TABLE "TenantAiSettings" ADD CONSTRAINT "TenantAiSettings_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

CREATE TABLE "PanelAiUsage" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "feature" "PanelAiFeature" NOT NULL,
    "usedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "calls" INTEGER NOT NULL DEFAULT 0,
    "outcome" "PanelAiOutcome" NOT NULL,
    "errorCode" TEXT,
    CONSTRAINT "PanelAiUsage_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "PanelAiUsage_tenantId_usedAt_idx" ON "PanelAiUsage"("tenantId", "usedAt");
ALTER TABLE "PanelAiUsage" ADD CONSTRAINT "PanelAiUsage_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

COMMIT;
```

- Filas existentes: `BotAiQuestion` se completa en el mismo SQL (prod y dev: todas `legacy-tenant`; dev verificado
  en solo lectura: 1 fila, 0 pacientes sin tenant). `TenantAiSettings` arranca **vacía**: sin fila = default del
  `.env` = el comportamiento de hoy (criterio "los topes de A arrancan con los valores que hoy da el .env").
- La FK simple existente `BotAiQuestion_patientId_fkey` (CASCADE) **se conserva**; borrar un paciente sigue
  borrando sus preguntas (las dos FKs cascadean).
- No hay `BEGIN/COMMIT` en las migraciones que genera Prisma por defecto; las de 028a/028b lo llevan: mantener.

## C5. Contrato compartido

### C5.1 `packages/core/src/bot-ai.ts` (cambia; consume bot y db)

```ts
export type BotAiLimits = {
  perPatientDaily: number;
  /** HU-028c: tope diario del CONSULTORIO (antes `globalDaily`). Default del .env: BOT_AI_DAILY_GLOBAL (nombre
   *  de variable sin cambios, por compatibilidad con deploy/.env). */
  tenantDaily: number;
  // … resto sin cambios …
};
// BOT_AI_DEFAULT_LIMITS: `tenantDaily: 300`. LIMIT_ENV: `tenantDaily: "BOT_AI_DAILY_GLOBAL"`.

/** HU-028c (D10a): topes guardados del consultorio. null = usar el default. */
export type TenantBotAiLimits = { botDailyPerPatient: number | null; botDailyPerTenant: number | null };

/** Límites efectivos del consultorio: `base` (del .env) con perPatientDaily/tenantDaily reemplazados por los
 *  valores del consultorio que sean enteros entre 0 y 100000. null, `tenant` null o cualquier otro valor → el de
 *  `base`. No toca las demás claves. Pura, no muta `base`. */
export function applyTenantBotAiLimits(base: BotAiLimits, tenant: TenantBotAiLimits | null): BotAiLimits;

export const TENANT_AI_LIMIT_MAX = 100_000;
/** Para el script ai-limits: "default" → null; dígitos 0..100000 → número; cualquier otra cosa → undefined. */
export function parseTenantAiLimitArg(raw: string): number | null | undefined;
```

El enum de base `LIMIT_GLOBAL` **no se renombra** (quitar un valor de enum es destructivo): pasa a significar
"tope diario del consultorio"; actualizar su comentario `///` en el schema (solo comentario, sin migración).

### C5.2 `packages/core/src/ai-usage.ts` (nuevo, puro; se reexporta desde `index.ts`; consume web)

```ts
export type ChatUsageTotals = { inputTokens: number; outputTokens: number; calls: number };
export const EMPTY_CHAT_USAGE: ChatUsageTotals; // { 0, 0, 0 }
/** Suma una respuesta recibida: calls + 1 y los tokens de `usage` (null/undefined/negativos/no finitos → 0,
 *  enteros por Math.trunc). Devuelve un objeto nuevo. */
export function addChatUsage(
  acc: ChatUsageTotals,
  usage: { prompt_tokens?: number | null; completion_tokens?: number | null } | null | undefined,
): ChatUsageTotals;
```

### C5.3 `packages/db/domain/botAi.ts` (cambia; consume bot)

```ts
/** Preguntas de hoy (día en tz) que llamaron a la IA: del paciente y del consultorio. Las dos consultas
 *  llevan `tenantId` en el where. */
export async function countBotAiQuestionsToday(p: {
  tenantId: string; patientId: string; now: Date; tz: string;
}): Promise<{ patient: number; tenant: number }>;

export type BotAiQuestionInput = { tenantId: string; patientId: string; /* … resto sin cambios … */ };
/** Escribe también `tenantId`. Si no coincide con el del paciente, la FK compuesta rechaza el insert. */
export async function recordBotAiQuestion(data: BotAiQuestionInput): Promise<{ id: string }>;

/** where: { id, patientId, tenantId, handedOffAt: null }. */
export async function markBotAiQuestionHandedOff(p: { id: string; patientId: string; tenantId: string; at: Date }): Promise<void>;

/** (D-c1 b) Tools sobre el consultorio `tenantId` (lo pone el bot desde la conversación, nunca la IA; un
 *  `tenantId` dentro de `input` se ignora). */
export async function runBotAiTool(p: {
  name: string; input: unknown; patientId: string; tenantId: string; now: Date; afterHours?: AfterHoursConfig;
}): Promise<BotAiToolResult>;
```

Dentro de `runBotAiTool` (igual a la SDD de 025c, 7.3):
- `activeServices(tenantId)` = `prisma.service.findMany({ where: { tenantId, active: true }, orderBy: { createdAt: "asc" } })`.
- `pro` = `getTenantProfessional(tenantId)` (de `./tenantScope`) en las cuatro tools.
- `disponibilidad`: `getAvailableSlotsForService({ tenantId }, …)`.
- `mis_turnos`: `appointment.findMany({ where: { patientId, tenantId, status: …, startsAt: … }, … })`.
- Se borran los imports de `getProfessional` y `LEGACY_TENANT_ID` de este archivo. El `catch` y su log no cambian.
- `purgeExpiredBotAiQuestions` y `clearExpiredSessionText`: **sin cambios** (D14).

### C5.4 `packages/db/domain/aiUsage.ts` (nuevo; `export *` en `domain/index.ts`)

```ts
import type { PanelAiFeature, PanelAiOutcome } from "@prisma/client";
import type { TenantBotAiLimits } from "@nutri-bot/core";
import type { TenantRef } from "./tenantScope";

/** BOT. Topes guardados del consultorio; sin fila → { botDailyPerPatient: null, botDailyPerTenant: null }.
 *  findUnique({ where: { tenantId }, select: { botDailyPerPatient: true, botDailyPerTenant: true } }). Puede tirar
 *  (error de base): el llamador lo trata como hoy un error de conteo. */
export async function getTenantAiSettings(t: TenantRef): Promise<TenantBotAiLimits>;

export type PanelAiUsageInput = {
  feature: PanelAiFeature;
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  calls: number;
  outcome: PanelAiOutcome;
  errorCode?: string | null;
  /** SOLO pruebas; default: DEFAULT now() de la base. */
  at?: Date;
};

/** WEB. Inserta una fila de PanelAiUsage con `tenantId = t.tenantId` y SOLO esos campos. **Nunca tira** (D11b:
 *  registrar no puede romper la función): ante error hace `console.warn("[ai-usage] record_failed", code)` con
 *  el código/clase del error (nunca el error ni su message) y resuelve. `errorCode` se guarda solo si cumple
 *  /^[A-Za-z0-9_.:-]{1,64}$/; si no, "error". Tokens/calls negativos o no enteros → 0. */
export async function recordPanelAiUsage(t: TenantRef, row: PanelAiUsageInput): Promise<void>;
```

### C5.5 Consumidores

| Función | Web | Bot |
|---|---|---|
| `countBotAiQuestionsToday`, `recordBotAiQuestion`, `markBotAiQuestionHandedOff`, `runBotAiTool`, `getTenantAiSettings` | — | `conversation.ts`, scripts `test-bot-ai-questions.ts`, `test-booking-reason.ts` |
| `recordPanelAiUsage` | `asistente/actions.ts`, `ai-actions.ts` | — |
| `applyTenantBotAiLimits` | — | `conversation.ts` |
| `addChatUsage` | `asistente/actions.ts`, `ai-actions.ts` | — |
| `parseTenantAiLimitArg` | — | (script `packages/db/scripts/ai-limits.ts`) |

## C6. Bot (`apps/bot`)

`conversation.ts`:
- `handleIncoming`: reemplazar `const pro = await getProfessional();` (línea ~168) por
  `const tenant = await getConversationTenant(); const pro = await getTenantProfessional(tenant.tenantId);` y
  reusar ese `tenant` en `findOrCreatePatientByJid(tenant, jid)` (línea ~185). En producción es la misma fila.
  **Solo esa línea**: los otros `getProfessional()` del archivo y `booking.ts` quedan para 025c (D-c1).
- `handleQuestionText`: recibe `tenant: TenantRef` (desde `handleIncoming`) y, **dentro** del `try` que ya
  existe (así un error de base sigue dando `AI_ERROR` y logueando solo `errName`):
  - `const limits = mergeBotAiLimits(applyTenantBotAiLimits(getBotAiConfig().limits, await getTenantAiSettings(tenant)), opts.aiLimits);`
    (el override de pruebas sigue ganando).
  - `countToday: () => countBotAiQuestionsToday({ tenantId: tenant.tenantId, patientId: patient.id, now, tz: pro.timezone })`
  - `record: (row) => recordBotAiQuestion({ ...row, tenantId: tenant.tenantId, patientId: patient.id, askedAt: now })`
  - `runTool: (name, input) => runBotAiTool({ name, input, patientId: patient.id, tenantId: tenant.tenantId, now, afterHours: opts.afterHours })`
  - `trimHistory(…, limits.historyTurns)` sigue usando `limits` (hoy está fuera del `try`: declarar `limits`
    antes con `let` o mover el cálculo; no cambiar el comportamiento).
- Derivación con 0: `markBotAiQuestionHandedOff({ id, patientId, tenantId: (await getConversationTenant()).tenantId, at })`
  (misma forma que las llamadas vecinas del archivo).

`ai/ask.ts`: `countToday: () => Promise<{ patient: number; tenant: number }>`; condición
`counts.patient >= limits.perPatientDaily || counts.tenant >= limits.tenantDaily`; log
`log.warn({ tenant: counts.tenant }, "Tope diario del consultorio de preguntas a la IA")`. Outcomes y textos sin
cambios (`LIMIT_PATIENT` → `AI_DAILY_LIMIT`; `LIMIT_GLOBAL` → `AI_UNAVAILABLE`).

`ai/runtime.ts` y `workers.ts`: sin cambios (proveedor/modelo/clave globales, D9a; purga global, D14).

## C7. Web (`apps/web`)

- `lib/deepseek.ts`: `export const DEEPSEEK_PROVIDER = "deepseek";`. Nada más (la clave sigue solo en el
  servidor; el `throw` de "Falta configurar…" no se loguea con su message, ya cae en `errorCode`).
- `asistente/actions.ts` (`askAssistantAction`): `let usage = EMPTY_CHAT_USAGE;` antes del loop; después de cada
  `create`, `usage = addChatUsage(usage, completion.usage)`. Un helper local
  `track(outcome, errorCode?)` = `recordPanelAiUsage(ctx, { feature: "ASSISTANT", provider: DEEPSEEK_PROVIDER, model: DEEPSEEK_MODEL, ...usage, outcome, errorCode })`
  con `await`. Se llama **una vez** por invocación que llegó a intentar el proveedor:
  - respuesta final → `OK`;
  - `!msg` (break) → `INVALID_RESPONSE`;
  - 4 vueltas sin respuesta final → `TOOL_LIMIT`;
  - `catch` → `ERROR` con `errorCode(err)` (el `console.error` actual queda igual).
  - Pregunta vacía o sin contexto (`requireTenantContext` falla) → **no** registra (no se llamó al proveedor).
  - Las respuestas al cliente no cambian (D11b: sin bloqueo ni mensaje nuevo).
- `pacientes/[id]/planes/[planId]/ai-actions.ts` (`generateAiPlanAction`): un registro `PLAN_AI` por pedido al
  proveedor, con `calls` = 1 si respondió (0 si tiró) y los tokens de `completion.usage`:
  - `catch` del `create` → `ERROR` + `errorCode(err)`;
  - `raw` null, JSON inválido, formato inválido o `proposal.length === 0` → `INVALID_RESPONSE`;
  - propuesta válida → `OK`, **antes** de releer el plan y escribir comidas (lo que pase después ya no es del
    proveedor).
  - Datos inválidos, sin contexto, plan de otro consultorio, plan con comidas o sin SARA 2 → no llama al
    proveedor y **no** registra.
- `/privacidad` (D16): en "Cuánto tiempo se guardan", agregar al final del párrafo: "Del uso del asistente del
  panel y de las propuestas de plan con inteligencia artificial guardamos solo un registro técnico (fecha,
  función y cantidad de uso), sin el texto de la consulta ni datos de pacientes." y actualizar la fecha de la
  página.
- Sin rutas, server actions, pantallas ni textos nuevos en el panel (D11b, D13b). `guard-coverage.test.ts` no
  cambia (no hay acciones nuevas).

## C8. Tests

### C8.1 `packages/core` (vitest)
- `bot-ai.test.ts`: renombrar `globalDaily` → `tenantDaily` en lo existente; `resolveBotAiEnv` con
  `BOT_AI_DAILY_GLOBAL=50` → `limits.tenantDaily === 50`. `applyTenantBotAiLimits`: `null` → igual a base (otro
  objeto); `{5, null}` → perPatient 5, tenant base; `{null, 0}` → tenantDaily 0; `{-1, 2.5}` y `{100001, NaN}` →
  base; no toca `maxTokens` ni `retentionDays`; no muta `base`. `parseTenantAiLimitArg`: `"default"` → null;
  `"0"`, `"20"`, `"100000"` → número; `"100001"`, `"-1"`, `"2.5"`, `"abc"`, `""`, `" 5"` → undefined.
- `ai-usage.test.ts`: suma dos respuestas; `usage` null/undefined → calls + 1 y tokens 0; negativos/NaN → 0;
  no muta `acc`.

### C8.2 `packages/db` (vitest, mocks)
- `botAi.test.ts` (mock de `./tenantScope` con `getTenantProfessional`, en vez de `getProfessional`):
  - `countBotAiQuestionsToday` con `tenantId: "tenant-a"`: las dos `count` llevan `tenantId: "tenant-a"`; devuelve
    `{ patient, tenant }`.
  - `recordBotAiQuestion` escribe `tenantId`; `markBotAiQuestionHandedOff` filtra por `tenantId`.
  - `runBotAiTool` con `tenantId: "tenant-a"`: `servicios` llama `service.findMany` con `where: { tenantId: "tenant-a", active: true }`
    y `getTenantProfessional("tenant-a")`; `disponibilidad` pasa `{ tenantId: "tenant-a" }`; `mis_turnos` filtra
    `{ patientId, tenantId: "tenant-a", … }`; `datos_consultorio` devuelve el `botAiInfo` de la profesional de A;
    un `input` con `tenantId: "tenant-b"` no cambia ningún where. Source check: `botAi.ts` no contiene
    `getProfessional` ni `LEGACY_TENANT_ID`.
- `aiUsage.test.ts`: `getTenantAiSettings` sin fila → nulls; con fila → valores; `recordPanelAiUsage` hace
  `create` con `data` cuyas claves son **exactamente** `tenantId, feature, provider, model, inputTokens,
  outputTokens, calls, outcome, errorCode` (+ `usedAt` solo si viene `at`); `errorCode` con espacios o largo → `"error"`;
  `create` que tira un error con `message` sensible → resuelve `undefined`, `console.warn` recibe solo el código y
  el message no aparece en ningún argumento.
- `gcal-and-ai-privacy.test.ts`: ajustar el mock a `getTenantProfessional` y pasar `tenantId`; los asserts de
  privacidad no cambian.
- `google-calendar-isolation.test.ts`: sumar `"packages/db/domain/aiUsage.ts"` a `AI_FILES` (D15).
- `scripts/ai-limits.test.ts`: parseo de argumentos (ver C9) — `show --tenant legacy-tenant`; `set` sin ningún
  valor → error; `--per-patient abc` → error; tenant con caracteres inválidos → error; `--apply` solo en `set`.

### C8.3 `apps/bot`
- `ai/ask.test.ts`: renombrar `global` → `tenant`; tope del consultorio → `LIMIT_GLOBAL` + `AI_UNAVAILABLE` sin
  llamar al proveedor; tope del paciente → `LIMIT_PATIENT` sin llamar.
- `conversation-ai.test.ts` (nuevo, mismo estilo de mocks que `conversation-booking.test.ts`; `ai/ask` real con
  un proveedor falso): en modo pregunta, con `getConversationTenant` → `tenant-a`:
  - `countBotAiQuestionsToday`, `recordBotAiQuestion` y `runBotAiTool` reciben `tenantId: "tenant-a"`;
  - `getTenantAiSettings` → `{ botDailyPerPatient: null, botDailyPerTenant: 1 }` y conteo `{ patient: 0, tenant: 1 }`
    → responde `AI_UNAVAILABLE`, registra `LIMIT_GLOBAL` y el proveedor falso **no** se llama;
  - `getTenantAiSettings` → nulls y conteo `{ patient: 0, tenant: 299 }` con env default 300 → llama al proveedor;
  - `getTenantAiSettings` tira → `AI_ERROR`, el log lleva solo `errName`;
  - profesional de A con `botAiEnabled: false` → el menú no ofrece la opción 5 (texto `messages.menu({ withQuestions: false })`).
- `conversation-attendance.test.ts` y `conversation-booking.test.ts`: agregar `getTenantProfessional` al mock de
  `@nutri-bot/db/domain` (y `getConversationTenant` si hace falta). Sin cambiar asserts.

### C8.4 `apps/web`
- `asistente/actions.test.ts` (mock de `@nutri-bot/db/domain` → `recordPanelAiUsage`): dos vueltas (tool + final)
  con `usage` → un registro `{ feature: "ASSISTANT", outcome: "OK", calls: 2, inputTokens/outputTokens sumados }`
  con el contexto de A; proveedor tira → `ERROR` con el código; 4 vueltas de tools → `TOOL_LIMIT`; sin contexto o
  pregunta vacía → no registra; `JSON.stringify` de los argumentos del registro no contiene la pregunta ni la
  respuesta; `recordPanelAiUsage` mockeado que rechaza no se usa (nunca tira por contrato), pero la respuesta al
  cliente es la misma con o sin registro.
- `ai-actions.test.ts`: propuesta válida → `PLAN_AI`/`OK`; JSON inválido → `INVALID_RESPONSE`; proveedor tira →
  `ERROR`, `calls: 0`; plan de otro consultorio → ni proveedor ni registro; el registro no contiene datos de la
  paciente (`antecedentes`, `peso_kg`, instrucciones).

### C8.5 Probe en Postgres descartable — `bot-ai-per-tenant.integration.ts` + `test-bot-ai-per-tenant.sh`
Copia del esqueleto de `test-google-calendar-per-tenant.sh` (contenedor, red y puerto propios, tmpfs, sin `.env`
del repo, `--pull never`; copia `pre/` con las migraciones hasta antes de `ai_usage_per_tenant` y `full/`).
npm: `"test:ai-tenants": "bash scripts/test-bot-ai-per-tenant.sh"` en `packages/db`.
1. `pre/` + datos tipo producción (SQL): `legacy-tenant`, `legacy-agenda`, `Professional(1)`, un paciente y 2
   `BotAiQuestion`. md5 de las filas (sin `tenantId`). Aplicar `full/` (`migrate deploy`): las 2 filas con
   `tenantId = 'legacy-tenant'`, mismo md5, columna `NOT NULL`, `TenantAiSettings` y `PanelAiUsage` vacías.
2. Fail closed: otra base `pre/` con un paciente con `tenantId` NULL y una pregunta → `migrate deploy` falla con
   el mensaje `HU-028c:` y la tabla queda sin la columna (transacción revertida).
3. Sobre la base migrada, tenant B sintético (agenda principal, profesional, paciente, servicio activo "Servicio B"):
   - insertar una `BotAiQuestion` con paciente de A y `tenantId` B → error de FK;
   - preguntas de A hasta el tope → `countBotAiQuestionsToday` de B da `tenant: 0`;
   - `runBotAiTool` `servicios` con A no contiene "Servicio B"; con B no contiene los de A; `mis_turnos` de A no
     ve turnos de B; `datos_consultorio` de B devuelve la profesional de B;
   - `ai-limits set --tenant <B> --per-tenant 5 --apply` → `getTenantAiSettings(B)` = `{ null, 5 }`, A sin fila;
     `UPDATE … SET "botDailyPerTenant" = -1` → viola el CHECK;
   - `recordPanelAiUsage(A, …)` crea una fila de A; B no ve filas.
4. Drift: base `gc_fresh` con `migrate deploy` y `prisma migrate diff --from-url <fresh> --to-schema-datamodel full/schema.prisma --exit-code`
   (contra la base **descartable**, nunca la de desarrollo) → sin diferencias.

## C9. Script `packages/db/scripts/ai-limits.ts` (D10a)

Mismo estilo que `tenant-access.ts` (exporta `USAGE`, `parseArgs`, `run`; `PrismaClient` propio; `DATABASE_URL`
explícita; errores con mensaje fijo, sin stacks). npm en `packages/db`: `"ai-limits": "tsx scripts/ai-limits.ts"`.

```
Usage: ai-limits <command> [options]
  show --tenant <id>
  set --tenant <id> [--per-patient <n|default>] [--per-tenant <n|default>] [--apply]
Values: 0..100000, or "default" to use the .env value. Dry run by default; --apply writes.
```

- `show`: `{"tenantId":"…","botDailyPerPatient":null|n,"botDailyPerTenant":null|n}` (null = default del .env;
  el script no lee las `BOT_AI_*`).
- `set`: al menos uno de los dos valores (`parseTenantAiLimitArg`); tenant con `/^[A-Za-z0-9_-]{1,64}$/` y existente
  (si no, `tenant_not_found`); dry-run imprime `{"mode":"dry-run","before":…,"after":…}`; `--apply` hace `upsert`
  y imprime `{"mode":"apply",…}`. Un valor no indicado no cambia.
- En producción: `docker compose run --rm migrate npx --no-install tsx packages/db/scripts/ai-limits.ts show --tenant legacy-tenant`.

## C10. Mensajes del bot

**Sin mensajes nuevos.** Tope del consultorio → `messages.AI_UNAVAILABLE` (el de hoy para el tope global); tope del
paciente → `messages.AI_DAILY_LIMIT` (sin cambios); error de base o de configuración → `messages.AI_ERROR`. Opción
5 del menú: `messages.menu({ withQuestions })` con `botAiEnabled` de la profesional del consultorio.

## C11. Archivos y flujo (radio de impacto)

| Archivo | Acción |
|---|---|
| `packages/db/prisma/schema.prisma` | Editar (C4.1) |
| `packages/db/prisma/migrations/<ts>_ai_usage_per_tenant/migration.sql` | Crear con `--create-only` y ajustar (C4.2) |
| `packages/core/src/bot-ai.ts`, `bot-ai.test.ts` | Editar |
| `packages/core/src/ai-usage.ts`, `ai-usage.test.ts`, `index.ts` | Crear / exportar |
| `packages/db/domain/botAi.ts`, `botAi.test.ts` | Editar |
| `packages/db/domain/aiUsage.ts`, `aiUsage.test.ts`, `index.ts` | Crear / exportar |
| `packages/db/domain/gcal-and-ai-privacy.test.ts`, `google-calendar-isolation.test.ts` | Ajustar |
| `packages/db/scripts/ai-limits.ts`, `ai-limits.test.ts` | Crear |
| `packages/db/scripts/bot-ai-per-tenant.integration.ts`, `test-bot-ai-per-tenant.sh` | Crear |
| `packages/db/package.json` | Scripts `ai-limits`, `test:ai-tenants` |
| `apps/bot/src/conversation.ts`, `ai/ask.ts`, `ai/ask.test.ts` | Editar |
| `apps/bot/src/conversation-ai.test.ts` | Crear |
| `apps/bot/src/conversation-attendance.test.ts`, `conversation-booking.test.ts` | Ajustar mocks |
| `apps/bot/scripts/test-bot-ai-questions.ts` | `tenantId` en `countBotAiQuestionsToday`/`recordBotAiQuestion`; `aiLimits: { tenantDaily: 0 }` |
| `apps/bot/scripts/test-booking-reason.ts` | `runBotAiTool({ …, tenantId })` (tenant legacy que ya resuelve el script) |
| `apps/web/src/lib/deepseek.ts` | `DEEPSEEK_PROVIDER` |
| `apps/web/src/app/(panel)/asistente/actions.ts`, `actions.test.ts` | Registro de consumo |
| `apps/web/src/app/(panel)/pacientes/[id]/planes/[planId]/ai-actions.ts`, `ai-actions.test.ts` | Registro de consumo |
| `apps/web/src/app/privacidad/page.tsx` | Una oración + fecha (D16) |
| `.env.example`, `deploy/.env.example` (si tiene las `BOT_AI_*`), `README.md`, `deploy/README.md` | Comentario: `BOT_AI_DAILY_GLOBAL` = default del tope diario **por consultorio**; sección "IA por consultorio (HU-028c)" con el script y §C12 |

Flujo (bot): mensaje → `handleIncoming` → `getConversationTenant()` → profesional del consultorio (opción 5) →
modo pregunta → `getTenantAiSettings` + `.env` → límites → conteo por consultorio → proveedor (tools con
`tenantId`) → `recordBotAiQuestion` con `tenantId`. Flujo (panel): acción → `requireTenantContext` → proveedor
(acumulando `usage`) → `recordPanelAiUsage(ctx, …)` (nunca tira) → misma respuesta que hoy.

## C12. Nota de deploy (028c)

Orden real (`deploy/deploy.sh`): `pg_dump` → `build web bot` → `docker compose run --rm migrate` (**con web y bot
viejos corriendo**) → `up -d`.

**Antes de mergear a `main`**, en producción y solo lectura:
- `SELECT count(*) FROM "BotAiQuestion" q JOIN "Patient" p ON p.id = q."patientId" WHERE p."tenantId" IS NULL;` → 0
  (si no, el `migrate` corta a propósito y siguen los contenedores viejos).
- `SELECT p."tenantId", count(*) FROM "BotAiQuestion" q JOIN "Patient" p ON p.id = q."patientId" GROUP BY 1;` →
  solo `legacy-tenant` (anotar el número).
- `grep -E '^BOT_AI_DAILY_(PER_PATIENT|GLOBAL)=' deploy/.env` → anotar los valores: siguen siendo los topes de
  Daiana (no hace falta crear fila en `TenantAiSettings`).

**Ventana entre `migrate` y `up -d` (segundos):** el bot viejo inserta `BotAiQuestion` sin `tenantId` → el insert
falla (`NOT NULL`) y esa pregunta responde `AI_ERROR` (el paciente puede repetirla). Conteos, panel y el resto del
bot no se afectan. Riesgo aceptado (mismo criterio que la ventana de OAuth de 028a); deployar fuera del horario de
consultas.

**Después del deploy:**
- `SELECT "tenantId", count(*) FROM "BotAiQuestion" GROUP BY 1;` = el número anotado, todo `legacy-tenant`.
- Una pregunta por WhatsApp (opción 5) responde igual que antes y su fila tiene `tenantId = 'legacy-tenant'`.
- Usar el asistente y `SELECT feature, outcome, "inputTokens" > 0 FROM "PanelAiUsage" ORDER BY "usedAt" DESC LIMIT 3;`
  → `ASSISTANT | OK | t`, `tenantId = 'legacy-tenant'`.
- `docker compose run --rm migrate npx --no-install tsx packages/db/scripts/ai-limits.ts show --tenant legacy-tenant`
  → nulls (= defaults del `.env`).

**Rollback:** código y base juntos con el `pg_dump` del deploy. Volver **solo el código** con la base migrada
rompe el registro de preguntas del bot viejo (`NOT NULL`): si hiciera falta, a mano
`ALTER TABLE "BotAiQuestion" ALTER COLUMN "tenantId" DROP NOT NULL;` (las tablas nuevas no molestan al código viejo).

Sin variables nuevas. `API_KEY_IA_DEEPSEEK`, `BOT_AI_PROVIDER`, `BOT_AI_MODEL`, `BOT_AI_*`: sin cambios de nombre;
`BOT_AI_DAILY_GLOBAL` pasa a ser el default del tope **por consultorio** (con un solo consultorio, mismo efecto).

## C13. Checklist atómico (028c)

Antes de empezar: `git fetch && git status` en `feat/HU-028c-ia-por-consultorio`; confirmar que ninguna otra HU con
label `migración` está en `implementando` (028b-2 tampoco). Reglas de AGENTS.md: en la base de desarrollo solo
lecturas, la migración y las simulaciones que limpian por id (nunca crear/editar `TenantAiSettings` de
`legacy-tenant` en dev); los probes de dos consultorios corren **solo** en Postgres descartable; nada de WhatsApp
real ni llamadas reales a DeepSeek/Anthropic (proveedores falsos y mocks); no `db:seed`/`seed:demo`.

### packages/db — esquema y migración
- [ ] 1. `docker compose exec -T db pg_dump -U nutri -Fc nutribot > ~/nutribot-dev-pre-028c.dump` (fuera del repo).
- [ ] 2. `cd packages/db && npx dotenv -e ../../.env -- prisma migrate status`: sin drift (si hay → `blocked`, nunca reset).
- [ ] 3. Editar `schema.prisma` (C4.1), incluido el comentario de `LIMIT_GLOBAL`.
- [ ] 4. `npx dotenv -e ../../.env -- prisma migrate dev --create-only --name ai_usage_per_tenant`.
- [ ] 5. Reescribir el bloque de `BotAiQuestion` y agregar el CHECK y `BEGIN/COMMIT` (C4.2); confirmar que no hay `DROP`.
- [ ] 6. `npm run db:migrate` y `npm run db:generate` (desde la raíz).
- [ ] 7. Releer en dev (solo lectura): `SELECT "tenantId", count(*) FROM "BotAiQuestion" GROUP BY 1;` → todo `legacy-tenant`; tablas nuevas vacías.

### packages/core
- [ ] 8. RED: casos de C8.1 (`bot-ai.test.ts`, `ai-usage.test.ts`).
- [ ] 9. GREEN: `tenantDaily`, `applyTenantBotAiLimits`, `parseTenantAiLimitArg`, `ai-usage.ts` + export. `npx vitest run packages/core`.

### packages/db — dominio y script
- [ ] 10. RED + GREEN: `aiUsage.ts` (`getTenantAiSettings`, `recordPanelAiUsage`) + `aiUsage.test.ts`; export en `domain/index.ts`.
- [ ] 11. RED + GREEN: `botAi.ts` conteo/registro/derivación con `tenantId` + `botAi.test.ts`.
- [ ] 12. `google-calendar-isolation.test.ts` (`aiUsage.ts` en `AI_FILES`).
- [ ] 13. RED + GREEN (D-c1 b): `runBotAiTool` con `tenantId` (C5.3) + casos de tools en `botAi.test.ts`; `gcal-and-ai-privacy.test.ts`.
- [ ] 14. `scripts/ai-limits.ts` + `ai-limits.test.ts` + npm `ai-limits`.
- [ ] 15. `npx vitest run packages/db`. `npm run typecheck` (va a fallar en bot/web hasta los pasos siguientes: esperado).

### packages/db — probe
- [ ] 16. `bot-ai-per-tenant.integration.ts` + `test-bot-ai-per-tenant.sh` + npm `test:ai-tenants` (C8.5); `npm run test:ai-tenants --workspace packages/db`.

### apps/bot
- [ ] 17. `ai/ask.ts` + `ai/ask.test.ts` (contador `tenant`).
- [ ] 18. `conversation.ts`: `handleQuestionText` y derivación con `tenantId` y topes del consultorio (C6).
- [ ] 19. `conversation.ts`: profesional del consultorio al inicio de `handleIncoming` (D-c1 b); mocks de `conversation-attendance.test.ts`/`conversation-booking.test.ts`.
- [ ] 20. `conversation-ai.test.ts` (C8.3). Scripts `test-bot-ai-questions.ts` y `test-booking-reason.ts`.

### apps/web
- [ ] 21. `lib/deepseek.ts`; RED + GREEN `asistente/actions.ts` + test (C7, C8.4).
- [ ] 22. RED + GREEN `ai-actions.ts` + test.
- [ ] 23. `/privacidad` (C7) con la fecha del día.

### Cierre
- [ ] 24. `.env.example`, `deploy/.env.example`, `README.md`, `deploy/README.md` (sección "IA por consultorio (HU-028c)" con §C9 y §C12).
- [ ] 25. Verificación completa (§C14). Reporte en `progress/impl_HU-028c.md` (incluir la opción de D-c1 aplicada y la salida de `test:ai-tenants`).

Commits sugeridos (Conventional Commits, uno por bloque): migración+schema (solo, riesgo alto: datos) · core · db
dominio (consumo y conteo) · db tools por tenant (D-c1) · script ai-limits · probe · bot · web · privacidad+docs.

## C14. Verificación (comandos exactos, desde la raíz)

```bash
npm run db:generate
npm run typecheck                                   # core, db, web y bot: 0 errores
npm run test                                        # vitest de todo el monorepo
npx vitest run packages/core/src/bot-ai.test.ts packages/core/src/ai-usage.test.ts packages/db/domain/botAi.test.ts packages/db/domain/aiUsage.test.ts packages/db/domain/gcal-and-ai-privacy.test.ts packages/db/domain/google-calendar-isolation.test.ts packages/db/scripts/ai-limits.test.ts apps/bot/src/ai/ask.test.ts apps/bot/src/conversation-ai.test.ts apps/bot/src/conversation-attendance.test.ts apps/bot/src/conversation-booking.test.ts "apps/web/src/app/(panel)/asistente" "apps/web/src/app/(panel)/pacientes/[id]/planes/[planId]/ai-actions.test.ts"
npm run test:ai-tenants --workspace packages/db     # migración con datos tipo prod + fail closed + probe A/B + drift (Postgres descartable)
npm run test:gcal-tenants --workspace packages/db   # regresión 028b (Postgres descartable)
npm run test:mp-tenants --workspace packages/db     # regresión 028a (Postgres descartable)
bash packages/db/scripts/test-tenant-isolation.sh   # aislamiento 025b (Postgres descartable)
(cd packages/db && npx dotenv -e ../../.env -- prisma migrate status)   # al día, sin drift
npm run test:bot-ai --workspace apps/bot            # IA del bot simulada (proveedor falso, sin WhatsApp; limpia por id)
npm run test:confirm-flow --workspace apps/bot      # regresión del flujo sí/no
npm run test:booking-reason --workspace apps/bot    # regresión de reservas (incluye runBotAiTool mis_turnos)
npm run build --workspace apps/web
# Tools del bot sin consultorio fijo (D-c1 b): las dos tienen que dar vacío.
grep -n "getProfessional\|LEGACY_TENANT_ID" packages/db/domain/botAi.ts
grep -n "where: { active: true }" packages/db/domain/botAi.ts
# Nombre viejo del tope: vacío.
grep -rn "globalDaily" apps packages --include='*.ts' --include='*.tsx'
./ops/harness/verify.sh
```

Ninguna verificación manda WhatsApp, arranca el bot, toca la sesión de Baileys ni llama a un proveedor de IA real
(los scripts del bot borran las claves del entorno y pasan `aiProvider` falso). `ai-limits --apply` solo se corre
en el probe descartable.

## C15. Fuera de alcance de 028c (explícito)

- Bloqueo por tope de la IA del panel y su mensaje "Llegaste al límite de uso de IA de tu consultorio para este
  período." (D11b: llega con HU-030). Por eso no hay columna de tope del panel.
- Vista "Uso de IA" para la profesional (D13b).
- Proveedor/modelo/clave por consultorio, Gemini (D9a). Purga por consultorio (D14). UI de topes (D10a).
- El resto de 025c (portal v2, `booking.ts`, demás `getProfessional()`, `ENABLED_TENANT_IDS`) y 025d.

## C16. Dudas técnicas

Ninguna bloqueante; la única decisión abierta es **D-c1** (de producto/alcance, §C0), con recomendación (b).
Supuestos a confirmar durante la implementación (anotar en `impl` si fallan):
- Prisma acepta la relación compuesta requerida contra `Patient.tenantId` opcional (si no, `Patient?`, C4.1).
- `completion.usage` del SDK `openai` contra DeepSeek trae `prompt_tokens`/`completion_tokens` (documentado; si
  viniera vacío, se registran 0 tokens y `calls` igual).
