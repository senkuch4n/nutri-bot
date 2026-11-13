# SDD HU-023 · Conectar la cuenta de Mercado Pago de la profesional (OAuth)

- HU: `docs/hu-mercadopago-oauth.md` (validada 2026-11-12; las **Resoluciones** mandan sobre las Dudas).
- Issue: #53 (label `migración`). Rama: `feat/HU-023-mercadopago-oauth` (sale de `develop`).
- Skills: `skills/migracion-prisma.md` (obligatorio para el paso de esquema) y `skills/ui.txt`
  (aplicado en §8: listado de pantallas con estructura y componentes).
- Cruces: HU-021 (#50, Leo, `payments.ts` + `DEPOSIT_AUTO_CANCEL_REASONS`), PR #52 (deploy VPS,
  `deploy/.env.example`). Ver §12.

---

## 1. Resumen funcional

La profesional conecta su propia cuenta de Mercado Pago desde **Ajustes → Mercado Pago** con el
OAuth oficial de MP (aplicación del equipo **"Numa"**, con PKCE S256). El panel guarda en la base,
cifrados con AES-256-GCM y una clave nueva del entorno (`MERCADOPAGO_TOKEN_KEY`), el `access_token`
y el `refresh_token` de esa cuenta, más su `user_id`, nickname, email, ambiente (`live_mode`) y
vencimiento. Desde ahí, `packages/db/domain/payments.ts` deja de usar el `MERCADOPAGO_ACCESS_TOKEN`
del `.env`: crea preferencias, consulta y concilia pagos con el token de la cuenta vinculada (y cada
`Payment` nuevo registra con qué `user_id` se creó). El bot renueva el token una vez por día si
faltan menos de 30 días, y también al usarlo si ya venció, con un lock de fila para que web y bot no
se pisen. Si no hay cuenta usable, el bot no crea el turno con seña, le contesta al paciente "seña no
disponible" y le avisa a la profesional (máx. uno cada 24 h). Si MP revoca el permiso o la
renovación falla, la cuenta queda "Hay que reconectar" y la profesional recibe un aviso por
WhatsApp, una vez por incidente. Cambiar de cuenta o desconectar cancela las señas pendientes de la
cuenta anterior con el aviso de seña vencida (D6). El token del `.env` queda solo como respaldo
**explícito** de desarrollo (D3), ignorado en producción.

---

## 2. Workspaces afectados

| Workspace | ¿Se toca? | Qué |
|---|---|---|
| `packages/db` | **Sí** | `schema.prisma`: modelo nuevo `MercadoPagoAccount` (fila única), modelo nuevo `MercadoPagoOAuthState`, columna nueva `Payment.mercadopagoUserId`. **1 migración aditiva** `mercadopago_oauth`. **Nuevos** en `domain/`: `secretBox.ts`, `mercadopagoOAuthClient.ts`, `mercadopagoAccount.ts` (+ tests). **Cambia:** `domain/payments.ts`, `domain/payments.test.ts`, `domain/index.ts` |
| `packages/core` | **Sí** | **Nuevo** `src/mercadopago-oauth.ts` (lógica pura + textos del panel) + test. `src/messages.ts` (3 textos del bot) + `messages.test.ts`. `src/settings-options.ts` (sección `mercadopago` en `SETTINGS_TEXT.sections` y `pageDescription`). `src/index.ts` (1 línea) |
| `apps/web` | **Sí** | Ruta nueva `api/mercadopago/oauth/callback/route.ts` (+ test). Ajustes: tab nueva `mercadopago` (`ajustes-tabs.tsx`, `page.tsx`, `actions.ts`, componente nuevo `mercadopago-section.tsx`). Servicios: aviso en `page.tsx` y nota en `service-form.tsx` (+ prop por `new-service-button.tsx`, `service-card.tsx`). `middleware.test.ts` (1 caso) |
| `apps/bot` | **Sí** | `src/conversation.ts` (`handleBookConfirm`: chequeo previo + mensaje + alerta). `src/workers.ts` (cron diario de renovación). Tests: `conversation-booking.test.ts`, `workers.test.ts`. `scripts/test-mercadopago-sandbox.ts` (usa la cuenta vinculada) |
| Raíz / docs | **Sí** | `.env.example`, `README.md` (sección de puesta en marcha de la app "Numa"). `deploy/.env.example` **solo si** PR #52 ya está en `develop` al rebasear (§12.2) |

**Impacto cruzado (regla del contrato):** el cambio de `schema.prisma` y de `domain/payments.ts`
afecta a los dos procesos. El webhook (`apps/web`) y el checkout/conciliación (`apps/bot`) llaman a
las mismas funciones de `payments.ts`, que ahora resuelven el token vía
`getMercadoPagoCredentials`. `npm run typecheck` tiene que pasar en `apps/web` **y** `apps/bot`.
La ruta del webhook (`apps/web/src/app/api/webhooks/mercadopago/route.ts`) **no cambia**.

---

## 3. Esquema (Prisma)

### 3.1 Cambios en `packages/db/prisma/schema.prisma`

Modelos nuevos (ubicarlos justo **después** de `model Payment`):

```prisma
/// HU-023: cuenta de Mercado Pago vinculada por OAuth (aplicación "Numa"). Fila única id = 1 (hay
/// una sola Professional). La fila puede existir sin cuenta vinculada (guarda el tope del aviso
/// "falta Mercado Pago"). Se crea perezosamente con INSERT ... ON CONFLICT DO NOTHING.
/// DATO SENSIBLE: accessTokenEnc / refreshTokenEnc van cifrados (AES-256-GCM con
/// MERCADOPAGO_TOKEN_KEY, formato "v1.<iv>.<tag>.<ct>" en base64url). Solo los lee
/// domain/mercadopagoAccount.ts; nunca viajan al navegador ni a los logs.
model MercadoPagoAccount {
  id              Int       @id @default(1)
  /// user_id de MP de la cuenta vinculada (número, guardado como texto). null = sin cuenta.
  userId          String?
  nickname        String?
  email           String?
  /// live_mode que devolvió /oauth/token. En producción solo se acepta true (D8).
  liveMode        Boolean?
  accessTokenEnc  String?
  refreshTokenEnc String?
  /// scope que devolvió MP (p. ej. "offline_access payments read write"). Diagnóstico.
  scope           String?
  /// Vencimiento del access_token (now + expires_in al canjear / renovar).
  expiresAt       DateTime?
  connectedAt     DateTime?
  refreshedAt     DateTime?
  /// "revoked" | "refresh_failed" | "decrypt_failed". null = sin error. Se borra al reconectar.
  errorCode       String?
  errorAt         DateTime?
  /// Cuándo se encoló el aviso de WhatsApp de este incidente (uno por incidente, D5).
  errorNotifiedAt DateTime?
  /// Último aviso "un paciente no pudo reservar porque falta Mercado Pago" (máx. 1 cada 24 h, D5).
  missingAlertAt  DateTime?
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt
}

/// HU-023: estado temporal del OAuth (anti-CSRF + PKCE). Un solo uso: se borra con
/// DELETE ... RETURNING al volver del callback. Vence a los 10 minutos.
model MercadoPagoOAuthState {
  id              String   @id @default(cuid())
  /// sha256 (hex) del state que viaja a MP. El state en claro no se guarda.
  stateHash       String   @unique
  /// code_verifier de PKCE, cifrado con la misma clave que los tokens.
  codeVerifierEnc String
  /// Email de la sesión de Auth.js que inició el flujo: el callback exige la misma sesión.
  sessionEmail    String
  expiresAt       DateTime
  createdAt       DateTime @default(now())

  @@index([expiresAt])
}
```

En `model Payment`, agregar (después de `checkoutUrl`):

```prisma
  /// HU-023 (D6): user_id de MP de la cuenta con la que se creó la preferencia. null = pagos
  /// manuales, pagos anteriores a la HU-023 o creados con el token de respaldo del .env (solo dev).
  mercadopagoUserId String?
```

Nada más cambia en `Payment` ni en `Professional`. **No** se agregan columnas a `Professional`
(así `PROFESSIONAL_SELECT` y su test no se tocan, y `getProfessional()` no puede leer tokens).

### 3.2 Migración

- Nombre: `mercadopago_oauth` →
  `npx dotenv -e ../../.env -- prisma migrate dev --create-only --name mercadopago_oauth` (desde
  `packages/db`).
- SQL esperado (revisar antes de aplicar; tiene que ser **solo** esto):
  - `ALTER TABLE "Payment" ADD COLUMN "mercadopagoUserId" TEXT;`
  - `CREATE TABLE "MercadoPagoAccount" (...)` con `"id" INTEGER NOT NULL DEFAULT 1`, `"createdAt"
    ... DEFAULT CURRENT_TIMESTAMP`, `"updatedAt" TIMESTAMP(3) NOT NULL`, PK.
  - `CREATE TABLE "MercadoPagoOAuthState" (...)`, `CREATE UNIQUE INDEX
    "MercadoPagoOAuthState_stateHash_key"`, `CREATE INDEX "MercadoPagoOAuthState_expiresAt_idx"`.
- **Filas existentes:** la única columna sobre una tabla con filas (`Payment.mercadopagoUserId`) es
  nullable: no hace falta default ni backfill. Las tablas nuevas arrancan vacías; **no** insertar la
  fila id = 1 en el SQL (el código la crea perezosamente, §4.3).
- Si el SQL trae un `DROP`, un cambio de tipo o algo fuera de esta lista, o si `migrate dev`
  detecta drift: **parar** y reportar `blocked` con `npx prisma migrate status` (skill
  `migracion-prisma`). Nunca `reset`, nunca `db push`, nunca `--shadow-database-url` con la base de dev.
- Antes de aplicar: `pg_dump` fuera del repo. Aplicar con `npm run db:migrate`, luego `npm run db:generate`.
- Producción (VPS): `docker compose run --rm migrate` (= `prisma migrate deploy`), ver §11.

---

## 4. Contrato compartido

### 4.1 `packages/core/src/mercadopago-oauth.ts` (nuevo, puro, sin `node:crypto` ni red)

`packages/core` se importa en componentes cliente (`SETTINGS_TEXT` en `"use client"`), así que este
archivo **no** puede importar `node:*`. Todo lo criptográfico va en `packages/db/domain` (§4.2).

```ts
export const MERCADOPAGO_AUTHORIZATION_URL = "https://auth.mercadopago.com/authorization";
export const MERCADOPAGO_TOKEN_URL = "https://api.mercadopago.com/oauth/token";
export const MERCADOPAGO_USERS_ME_URL = "https://api.mercadopago.com/users/me";
export const MERCADOPAGO_CALLBACK_PATH = "/api/mercadopago/oauth/callback";
export const MERCADOPAGO_REFRESH_THRESHOLD_DAYS = 30;      // D4
export const MERCADOPAGO_OAUTH_STATE_TTL_MINUTES = 10;     // = vida del code
export const MERCADOPAGO_ALERT_THROTTLE_HOURS = 24;        // D5
/** D6: motivo de cancelación de las señas pendientes al cambiar/desconectar la cuenta. */
export const MERCADOPAGO_ACCOUNT_CHANGED_CANCEL_REASON = "Se desconectó o cambió la cuenta de Mercado Pago";

export type MercadoPagoErrorCode = "revoked" | "refresh_failed" | "decrypt_failed";
export type MercadoPagoConnectionStatus = "not_configured" | "not_connected" | "connected" | "needs_reconnect";
export type MercadoPagoCallbackResult =
  | "connected" | "denied" | "invalid_state" | "rejected" | "not_configured" | "wrong_environment";
export type MercadoPagoFailureKind = "revoked" | "transient" | "rejected";

export type MercadoPagoTokenSet = {
  accessToken: string;
  refreshToken: string;
  /** String(user_id). null si MP no lo devolvió (en el refresh se conserva el guardado). */
  userId: string | null;
  liveMode: boolean | null;
  scope: string | null;
  expiresAt: Date;
};

/** URL de autorización. Orden fijo de params: client_id, response_type=code, platform_id=mp,
 *  state, redirect_uri, code_challenge, code_challenge_method=S256 (URLSearchParams). */
export function buildMercadoPagoAuthorizationUrl(p: {
  clientId: string; redirectUri: string; state: string; codeChallenge: string;
}): string;

/** `${new URL(authUrl).origin}${MERCADOPAGO_CALLBACK_PATH}`. null si authUrl falta o es inválida. */
export function mercadoPagoRedirectUri(authUrl: string | undefined | null): string | null;

/** Clasifica el query del callback. Sin `code` → "denied" (con o sin `error`), state opcional.
 *  Con `code` pero sin `state` → "invalid". */
export function parseMercadoPagoCallback(q: URLSearchParams):
  | { kind: "ok"; code: string; state: string }
  | { kind: "denied"; state: string | null }
  | { kind: "invalid" };

/** Valida la respuesta de POST /oauth/token (create o refresh). Exige access_token,
 *  refresh_token (string no vacío) y expires_in (número > 0); si falta alguno → null.
 *  user_id numérico → String(user_id). expiresAt = now + expires_in segundos. */
export function parseMercadoPagoTokenResponse(json: unknown, now: Date): MercadoPagoTokenSet | null;

/** true si expiresAt - now < thresholdDays (default 30). */
export function needsMercadoPagoRefresh(expiresAt: Date, now: Date, thresholdDays?: number): boolean;
/** true si expiresAt - now <= skewMs (default 60_000). */
export function isMercadoPagoTokenExpired(expiresAt: Date, now: Date, skewMs?: number): boolean;

/** status 401 → "revoked"; error/código "invalid_grant" o "invalid_token" → "revoked";
 *  status 0 / undefined (red), 408, 429, >= 500 → "transient"; el resto (400, 403, 404,
 *  "invalid_client"...) → "rejected". */
export function classifyMercadoPagoFailure(input: { status?: number; code?: string | null }): MercadoPagoFailureKind;

export function mercadoPagoConnectionStatus(input: {
  configured: boolean; hasAccount: boolean; errorCode: string | null;
}): MercadoPagoConnectionStatus;
// !configured → not_configured; !hasAccount → not_connected; errorCode → needs_reconnect; si no → connected

/** Aviso transversal (Servicios / Ajustes): hay servicios con seña activos y la cuenta no está "connected". */
export function shouldWarnDepositWithoutMercadoPago(input: {
  hasActiveDepositServices: boolean; status: MercadoPagoConnectionStatus;
}): boolean;

/** null → true; now - last >= hours → true. */
export function shouldSendThrottledAlert(lastSentAt: Date | null, now: Date, hours?: number): boolean;

/** D3: respaldo de desarrollo. true solo si MERCADOPAGO_ALLOW_ENV_TOKEN === "true",
 *  NODE_ENV !== "production" y MERCADOPAGO_ACCESS_TOKEN no vacío. */
export function allowsMercadoPagoEnvToken(env: Record<string, string | undefined>): boolean;

/** D8: en producción (NODE_ENV === "production") solo se aceptan cuentas con live_mode === true. */
export function requiresLiveMercadoPagoAccount(env: Record<string, string | undefined>): boolean;

/** Textos del panel (Ajustes → Mercado Pago y avisos). Ver §6 para los valores exactos. */
export const MERCADOPAGO_TEXT: { ... } as const;
```

Consumidores: `packages/db/domain` (todo lo de arriba menos `MERCADOPAGO_TEXT`), `apps/web`
(`MERCADOPAGO_TEXT`, `shouldWarnDepositWithoutMercadoPago`, tipos), `apps/bot` (nada directo; usa
`messages`).

### 4.2 `packages/db/domain/secretBox.ts` (nuevo; server-only, `node:crypto`)

```ts
export class MercadoPagoConfigError extends Error {}   // message nombra la variable, nunca el valor
export class SecretDecryptError extends Error {}

/** Lee MERCADOPAGO_TOKEN_KEY: base64 de exactamente 32 bytes (openssl rand -base64 32).
 *  Falta o largo distinto → MercadoPagoConfigError("MERCADOPAGO_TOKEN_KEY inválida o ausente"). */
export function loadMercadoPagoTokenKey(env?: Record<string, string | undefined>): Buffer;

/** AES-256-GCM, IV aleatorio de 12 bytes, AAD = `aad` (utf8). Salida "v1.<iv>.<tag>.<ct>" (base64url). */
export function sealSecret(plain: string, key: Buffer, aad: string): string;
/** Inversa. Prefijo distinto de "v1", tag inválido, AAD o clave distintos → SecretDecryptError. */
export function openSecret(sealed: string, key: Buffer, aad: string): string;

export const SECRET_AAD = {
  accessToken: "mercadopago:access_token",
  refreshToken: "mercadopago:refresh_token",
  codeVerifier: "mercadopago:code_verifier",
} as const;
```

Decisión D10 (architect): **clave nueva** `MERCADOPAGO_TOKEN_KEY`, no derivada de `AUTH_SECRET`
(rotar `AUTH_SECRET` cierra sesiones pero no debe invalidar los tokens). La AAD por campo impide
cambiar un ciphertext de columna. Rotación de la clave = cambiarla y reconectar: el primer uso
falla al descifrar → `errorCode = "decrypt_failed"` → "Hay que reconectar". Con esto una copia de
la base sola no alcanza para usar los tokens. **No** exportar `secretBox.ts` desde
`domain/index.ts` (uso interno de `mercadopagoAccount.ts`).

### 4.3 `packages/db/domain/mercadopagoOAuthClient.ts` (nuevo; HTTP con `fetch` inyectable)

Se usa `fetch` directo y **no** `new OAuth(...)` del SDK: el SDK 3.6.1 no tipa `code_verifier`
(PKCE) en `create`, y con `fetch` inyectable los tests no tocan la red.

```ts
export type MercadoPagoHttpDeps = {
  fetch?: typeof fetch;                          // default: globalThis.fetch
  env?: Record<string, string | undefined>;      // default: process.env
  now?: () => Date;                              // default: () => new Date()
};

export type MercadoPagoAppConfig = { clientId: string; clientSecret: string; redirectUri: string };

/** null si falta MERCADOPAGO_CLIENT_ID, MERCADOPAGO_CLIENT_SECRET, MERCADOPAGO_TOKEN_KEY (o es
 *  inválida) o AUTH_URL. redirectUri = mercadoPagoRedirectUri(AUTH_URL). */
export function getMercadoPagoAppConfig(env?: Record<string, string | undefined>): MercadoPagoAppConfig | null;

/** Error saneado: nunca incluye el body crudo, tokens, code, code_verifier ni client_secret. */
export class MercadoPagoApiError extends Error {
  readonly status: number;            // 0 = red / timeout
  readonly code: string | null;       // body.error de MP (p. ej. "invalid_grant") si vino
  readonly kind: MercadoPagoFailureKind;
}

/** POST MERCADOPAGO_TOKEN_URL, headers { "Content-Type": "application/json", Accept: "application/json" },
 *  body JSON exacto: { client_id, client_secret, code, grant_type: "authorization_code",
 *  redirect_uri, code_verifier }. Timeout 10 s (AbortSignal.timeout). No se envía test_token.
 *  !ok → MercadoPagoApiError. Respuesta inválida (parseMercadoPagoTokenResponse null o userId
 *  null) → MercadoPagoApiError(status, "invalid_token_response", "rejected"). */
export function exchangeMercadoPagoCode(
  p: { code: string; codeVerifier: string; app: MercadoPagoAppConfig }, deps?: MercadoPagoHttpDeps,
): Promise<MercadoPagoTokenSet>;

/** POST MERCADOPAGO_TOKEN_URL, body JSON exacto: { client_id, client_secret,
 *  grant_type: "refresh_token", refresh_token }. Mismos errores. */
export function refreshMercadoPagoToken(
  p: { refreshToken: string; app: MercadoPagoAppConfig }, deps?: MercadoPagoHttpDeps,
): Promise<MercadoPagoTokenSet>;

/** GET MERCADOPAGO_USERS_ME_URL con Authorization: Bearer <token>. Devuelve
 *  { id: String(body.id), nickname: body.nickname ?? null, email: body.email ?? null }. */
export function fetchMercadoPagoUser(accessToken: string, deps?: MercadoPagoHttpDeps):
  Promise<{ id: string; nickname: string | null; email: string | null }>;
```

**Datos de la doc de MP verificados (2026-11-12)** — fuentes:
`/developers/es/docs/security/oauth/creation`, `/developers/es/docs/security/oauth/renewal` y los
tipos del SDK `mercadopago@3.6.1` (`dist/clients/oAuth/commonTypes.d.ts`):

- Refresh: `POST https://api.mercadopago.com/oauth/token`, `Content-Type: application/json`,
  cuerpo `{"client_id","client_secret","grant_type":"refresh_token","refresh_token":"TG-..."}`.
  **No** lleva `code` ni `redirect_uri` ni `code_verifier` (el ejemplo curl de la doc así lo
  muestra; la prosa que menciona el authorization_code es confusa, el curl manda).
- **Cada refresh devuelve un `refresh_token` nuevo y hay que guardarlo** (el viejo deja de servir).
  El access token nuevo vale 180 días.
- El refresh **solo funciona si la aplicación tiene el scope `offline_access`** y el vendedor lo
  autorizó en el flujo de Authorization code → requisito de configuración de la app "Numa" (README).
- Respuesta de create y refresh (`OAuthResponse`): `access_token`, `token_type` ("bearer"),
  `expires_in` (segundos; ~15552000 = 180 días), `scope` (separado por espacios), `user_id`
  (número), `refresh_token`, `public_key`, `live_mode` (boolean). `public_key` **no** se guarda
  (Checkout Pro no la usa).
- PKCE: `code_verifier` de 43–128 caracteres; `code_challenge = BASE64URL(SHA256(verifier))`;
  `code_challenge_method=S256`. Con PKCE habilitado en la app, MP exige `code_challenge` y
  `code_challenge_method` en la URL de autorización y `code_verifier` en el canje.
- `redirect_uri` tiene que ser estática e idéntica a la registrada; los datos extra solo en `state`.
- El `code` vale 10 minutos.
- El canje acepta `test_token: "true"` para credenciales de sandbox: **no se usa** (D8 se resuelve
  con `live_mode`, ver §4.4).

### 4.4 `packages/db/domain/mercadopagoAccount.ts` (nuevo; web + bot)

Exportado desde `domain/index.ts`. Es el **único** archivo que lee `accessTokenEnc`,
`refreshTokenEnc` y `codeVerifierEnc`.

```ts
export class MercadoPagoUnavailableError extends Error {}   // "No hay cuenta de Mercado Pago usable"

export type MercadoPagoCredentials = {
  accessToken: string;
  /** user_id de la cuenta; null si viene del token de respaldo del .env (solo dev). */
  sellerUserId: string | null;
  source: "account" | "env_fallback";
};

export type MercadoPagoConnectionView = {
  status: MercadoPagoConnectionStatus;
  userId: string | null;
  nickname: string | null;
  email: string | null;
  liveMode: boolean | null;
  connectedAt: Date | null;
  errorCode: MercadoPagoErrorCode | null;
  /** Señas PENDING de MP con turno AWAITING_PAYMENT y mercadopagoUserId no null (las que D6 cancelaría). */
  pendingDepositCount: number;
  hasActiveDepositServices: boolean;   // service.count({ active: true, requiresDeposit: true }) > 0
};

/** Panel (web). Sin tokens, sin HTTP, sin descifrar. select explícito sin *Enc. */
export function getMercadoPagoConnectionView(): Promise<MercadoPagoConnectionView>;

/** Web (server action). Requiere getMercadoPagoAppConfig() != null, si no MercadoPagoConfigError.
 *  state = randomBytes(32) base64url; verifier = randomBytes(32) base64url (43 chars);
 *  challenge = sha256(verifier) base64url. Borra estados vencidos (expiresAt < now) y crea
 *  { stateHash: sha256hex(state), codeVerifierEnc: seal(verifier, SECRET_AAD.codeVerifier),
 *    sessionEmail: lower(email), expiresAt: now + 10 min }. Devuelve la URL de autorización. */
export function startMercadoPagoOAuth(sessionEmail: string, deps?: MercadoPagoHttpDeps): Promise<{ url: string }>;

/** Web (ruta callback). Nunca tira por errores de MP: devuelve el resultado para el banner.
 *  1. app = getMercadoPagoAppConfig(); null → "not_configured".
 *  2. parseMercadoPagoCallback(query): "invalid" → "invalid_state".
 *     "denied" → si trae state, consumirlo (paso 3, ignorar resultado) → "denied".
 *  3. Consumir el state en UNA sentencia (un solo uso, atómico):
 *       DELETE FROM "MercadoPagoOAuthState"
 *       WHERE "stateHash" = $hash AND "sessionEmail" = $email AND "expiresAt" > $now
 *       RETURNING "codeVerifierEnc"
 *     0 filas → "invalid_state" (no se llama a MP).
 *  4. exchangeMercadoPagoCode. MercadoPagoApiError → console.error("[mercadopago] oauth_exchange_failed",
 *     { status, code }) → "rejected".
 *  5. requiresLiveMercadoPagoAccount(env) && tokens.liveMode !== true → "wrong_environment" (no guarda).
 *  6. fetchMercadoPagoUser(accessToken): si falla, nickname/email = null (no bloquea).
 *  7. saveConnection (transacción, abajo) → "connected". */
export function completeMercadoPagoOAuth(
  input: { sessionEmail: string; query: URLSearchParams }, deps?: MercadoPagoHttpDeps,
): Promise<MercadoPagoCallbackResult>;

/** Web (server action). Transacción: lock de la fila de cuenta (ensureRow + FOR UPDATE), pone en
 *  null userId, nickname, email, liveMode, *Enc, scope, expiresAt, connectedAt, refreshedAt,
 *  errorCode, errorAt, errorNotifiedAt (missingAlertAt se conserva) y cancela las señas de D6 con
 *  keepSellerUserId = null. */
export function disconnectMercadoPagoAccount(): Promise<{ cancelledDeposits: number }>;

/** Web (webhook vía payments.ts) y bot (checkout, conciliación).
 *  scope "current": la cuenta vinculada; scope "payment": la cuenta con la que se creó ese Payment.
 *  1. Lee la fila (select con *Enc). Si hay userId + tokens y errorCode null:
 *     - scope "payment" y sellerUserId !== userId → null (si sellerUserId es null, ir al paso 2).
 *     - descifra access (SecretDecryptError → markMercadoPagoAccountError("decrypt_failed") → null).
 *     - isMercadoPagoTokenExpired(expiresAt) → refreshMercadoPagoAccountToken({ force: true });
 *       si no devolvió "refreshed" → null; si sí, releer y descifrar.
 *     - → { accessToken, sellerUserId: userId, source: "account" }.
 *  2. Si allowsMercadoPagoEnvToken(env) y (scope "current" sin cuenta, o scope "payment" con
 *     sellerUserId null) → { accessToken: env.MERCADOPAGO_ACCESS_TOKEN, sellerUserId: null, source: "env_fallback" }.
 *  3. null. */
export function getMercadoPagoCredentials(
  scope: { kind: "current" } | { kind: "payment"; sellerUserId: string | null },
  deps?: MercadoPagoHttpDeps,
): Promise<MercadoPagoCredentials | null>;

/** Bot (antes de crear un turno con seña). = (await getMercadoPagoCredentials({ kind: "current" })) !== null. */
export function isMercadoPagoCheckoutAvailable(deps?: MercadoPagoHttpDeps): Promise<boolean>;

/** Bot (cron diario) y getMercadoPagoCredentials (al usar, force). Ver §4.5. */
export function refreshMercadoPagoAccountToken(
  opts?: { force?: boolean }, deps?: MercadoPagoHttpDeps,
): Promise<"refreshed" | "not_needed" | "not_connected" | "transient_error" | "revoked" | "refresh_failed">;

/** Web y bot. Marca el incidente (si errorCode ya no es null, no cambia nada) y, en la misma
 *  transacción, si errorNotifiedAt es null y Professional.phoneJid existe, encola
 *  PROFESSIONAL_ALERT con messages.MERCADOPAGO_DISCONNECTED_ALERT y pone errorNotifiedAt = now. */
export function markMercadoPagoAccountError(code: MercadoPagoErrorCode): Promise<void>;

/** Bot. Tope 24 h atómico:
 *    INSERT INTO "MercadoPagoAccount" (id, "updatedAt") VALUES (1, now()) ON CONFLICT DO NOTHING;
 *    UPDATE "MercadoPagoAccount" SET "missingAlertAt" = $now, "updatedAt" = $now
 *    WHERE id = 1 AND ("missingAlertAt" IS NULL OR "missingAlertAt" <= $now - interval '24 hours')
 *    RETURNING id
 *  Si actualizó y phoneJid existe → encola PROFESSIONAL_ALERT con
 *  messages.professionalDepositUnavailableAlert(...). Devuelve si encoló. */
export function notifyMercadoPagoMissingForBooking(p: {
  patientName: string | null; patientPhone: string; serviceName: string;
}): Promise<boolean>;
```

Internos (no exportados desde `index.ts`):

- `ensureAccountRow(tx)`: `INSERT INTO "MercadoPagoAccount" (id, "updatedAt") VALUES (1, now()) ON CONFLICT (id) DO NOTHING`.
- `lockAccountRow(tx)`: `ensureAccountRow` + `SELECT ... FROM "MercadoPagoAccount" WHERE id = 1 FOR UPDATE`.
- `saveConnection(tokens, user)`: `prisma.$transaction(async tx => …, { timeout: 20_000, maxWait: 10_000 })`:
  `lockAccountRow`; `previousUserId = row.userId`; update con tokens sellados, `userId`, `nickname`,
  `email`, `liveMode`, `scope`, `expiresAt`, `connectedAt = now`, `refreshedAt = now`,
  `errorCode = errorAt = errorNotifiedAt = null`; luego `cancelDepositsNotPayableWith(tx, newUserId)`
  (si `previousUserId === newUserId` no habrá nada para cancelar; se llama igual).
- `cancelDepositsNotPayableWith(tx, keepSellerUserId: string | null): Promise<number>` (D6):
  busca turnos `AWAITING_PAYMENT` con algún `Payment` `{ status: "PENDING", provider: "mercadopago",
  mercadopagoUserId: { not: null } }` cuyo `mercadopagoUserId !== keepSellerUserId`. Por cada uno, con
  el **mismo orden de lock** que `expireStalePendingPayments`
  (`SELECT id FROM "Payment" WHERE "appointmentId" = $id ORDER BY id FOR UPDATE`):
  `appointment.updateMany({ where: { id, status: "AWAITING_PAYMENT" }, data: { status: "CANCELLED",
  cancelledBy: "PROFESSIONAL", cancelReason: MERCADOPAGO_ACCOUNT_CHANGED_CANCEL_REASON } })`; si
  `count > 0`: `payment.updateMany({ where: { appointmentId, status: "PENDING" }, data: { status:
  "CANCELLED" } })` y `outboundMessage.createMany({ skipDuplicates: true, data: [{ toJid:
  patient.whatsappJid, kind: "CANCELLATION", appointmentId, body: messages.depositExpired({...}) }] })`
  (el "aviso de seña vencida" de D6). Los pagos con `mercadopagoUserId` null (anteriores a la HU o
  del respaldo de dev) **no** se tocan: los resuelve la conciliación/expiración de siempre (§4.6).

**Orden de locks (anti-deadlock):** fila de cuenta → filas de `Payment`. Ningún camino toma un
lock de `Payment` y después el de la cuenta: `getMercadoPagoCredentials` y
`markMercadoPagoAccountError` se llaman siempre **fuera** de las transacciones de `payments.ts`.

### 4.5 Renovación (D4) y concurrencia web/bot

`refreshMercadoPagoAccountToken({ force })`:

1. `getMercadoPagoAppConfig()` null → `"not_connected"` (no se puede renovar sin la app).
2. `prisma.$transaction(async (tx) => { … }, { timeout: 20_000, maxWait: 10_000 })`:
   - `lockAccountRow(tx)` y releer la fila **con el lock tomado** (otro proceso pudo haber renovado
     mientras esperaba).
   - Sin cuenta o con `errorCode` → `"not_connected"`.
   - `force` false: si `!needsMercadoPagoRefresh(expiresAt, now)` → `"not_needed"`.
     `force` true: si `!isMercadoPagoTokenExpired(expiresAt, now)` → `"not_needed"` (ya lo renovó otro).
   - Descifrar refresh (falla → marcar `decrypt_failed` dentro de la misma tx → `"refresh_failed"`).
   - `refreshMercadoPagoToken` (HTTP dentro de la tx, timeout 10 s < 20 s de la tx).
   - OK → update con access/refresh **nuevos** sellados, `expiresAt`, `scope`, `liveMode` (si vino),
     `refreshedAt = now`. → `"refreshed"`.
   - `MercadoPagoApiError` `kind === "transient"` → no marca nada → `"transient_error"`.
   - `kind === "revoked"` → marcar `revoked` (+ aviso, misma lógica que `markMercadoPagoAccountError`
     pero con el `tx` actual) → `"revoked"`.
   - `kind === "rejected"` → marcar `refresh_failed` (+ aviso) → `"refresh_failed"`.
   - Log: `console.error("[mercadopago] refresh_failed", { status, code })`, nunca tokens.

El `FOR UPDATE` serializa web y bot: como MP rota el `refresh_token` en cada renovación, dos
renovaciones simultáneas harían que la segunda reciba `invalid_grant` y marque "revocado" en falso.
Con el lock, la segunda relee y devuelve `"not_needed"`.

Cron del bot: una vez por día (`"0 6 * * *"`), `refreshMercadoPagoAccountToken()` (umbral 30 días).
Al usar: `getMercadoPagoCredentials` con token vencido llama `{ force: true }`.

### 4.6 `packages/db/domain/payments.ts` (modificado; web + bot)

Cambios (mínimos y localizados para el rebase con HU-021, §12.1):

1. Imports: sumar `getMercadoPagoCredentials`, `markMercadoPagoAccountError`,
   `MercadoPagoUnavailableError`, `type MercadoPagoCredentials` desde `./mercadopagoAccount`, y
   `classifyMercadoPagoFailure` desde `@nutri-bot/core`.
2. `mercadoPagoClient()` → `mercadoPagoClient(accessToken: string): MercadoPagoConfig` (ya no lee
   `process.env.MERCADOPAGO_ACCESS_TOKEN`).
3. Helper nuevo (no exportado):
   ```ts
   async function withRevocationGuard<T>(creds: MercadoPagoCredentials, call: () => Promise<T>): Promise<T> {
     try { return await call(); }
     catch (error) {
       const status = typeof (error as { status?: unknown })?.status === "number" ? (error as { status: number }).status : undefined;
       const code = typeof (error as { error?: unknown })?.error === "string" ? (error as { error: string }).error : null;
       if (creds.source === "account" && classifyMercadoPagoFailure({ status, code }) === "revoked") {
         await markMercadoPagoAccountError("revoked").catch(() => {});
       }
       throw error;
     }
   }
   ```
4. `createDepositCheckout(appointmentId)` — **firma igual**. Dentro del `try`, reemplazar
   `const client = mercadoPagoClient();` por:
   ```ts
   const creds = await getMercadoPagoCredentials({ kind: "current" });
   if (!creds) throw new MercadoPagoUnavailableError("No hay cuenta de Mercado Pago usable");
   const client = mercadoPagoClient(creds.accessToken);
   ```
   `payment.create` suma `mercadopagoUserId: creds.sellerUserId` en `data`.
   `new Preference(client).create(...)` va envuelto en `withRevocationGuard(creds, () => …)`.
   **El bloque `catch` (libera la reserva, `cancelReason` literal) no se toca.** Si no hay
   credenciales, el `throw` cae en ese `catch` y el turno queda cancelado como hoy.
5. `syncMercadoPagoPayment(paymentId: string, expectedInternalId?: string, credentials?: MercadoPagoCredentials): Promise<void>`
   — tercer parámetro **opcional** (nuevo). Si no viene: `getMercadoPagoCredentials({ kind:
   "current" })`; null → `throw new MercadoPagoUnavailableError(...)` (el webhook ya captura y
   loguea genérico; la conciliación es el respaldo). `Payment.get` envuelto en
   `withRevocationGuard`. Dentro de la transacción, después de `if (!existing || existing.provider
   !== "mercadopago") return;`, agregar **una línea**:
   ```ts
   if (existing.mercadopagoUserId && existing.mercadopagoUserId !== creds.sellerUserId) return;
   ```
   (un pago de la cuenta anterior no se confirma con datos de otra cuenta).
6. `reconcilePendingPayments(onError?, paymentIds?)` — retorno pasa a
   `Promise<{ processed: number; failed: number; skipped: number }>` (aditivo). Ya no arma un
   `api` único: por cada `payment`, resolver credenciales con cache por `mercadopagoUserId`
   (`Map<string | null, MercadoPagoCredentials | null>`) vía `getMercadoPagoCredentials({ kind:
   "payment", sellerUserId: payment.mercadopagoUserId })`. Si es null → `skipped++` y `continue`
   (**no** cuenta como `failed`, así `expireStalePendingPayments` sigue corriendo y libera la reserva
   a los 15 min). Si hay: `api = new MercadoPagoPayment(mercadoPagoClient(creds.accessToken))`,
   `syncMercadoPagoPayment(externalId, payment.id, creds)` y `api.search` envuelto en
   `withRevocationGuard`. El resto del bucle igual.
7. `handleMercadoPagoWebhook`, `expireStalePendingPayments`, `listPendingPayments`,
   `listApprovedPaymentsInRange`, `registerManualPayment`: **sin cambios**.

Consumidores: web (webhook → `handleMercadoPagoWebhook` → `syncMercadoPagoPayment`), bot
(`createDepositCheckout` en `conversation.ts`, `reconcilePendingPayments` en `workers.ts`, script
sandbox). `apps/bot/src/workers.ts` loguea `result`: el campo `skipped` nuevo entra solo; ajustar el
`if (result.processed || result.failed)` a `|| result.skipped`.

### 4.7 `packages/db/domain/index.ts`

Agregar `export * from "./mercadopagoAccount";` **justo después de**
`export * from "./mercadopago-signature";` (línea del medio del archivo, lejos del final, para no
chocar con agregados de otras HU). `index.ts` lleva **solo esa línea**: lo que web/bot necesitan
de los otros dos archivos se re-exporta desde `mercadopagoAccount.ts`:
`export { MercadoPagoConfigError } from "./secretBox";` y
`export { MercadoPagoApiError, getMercadoPagoAppConfig } from "./mercadopagoOAuthClient";`
(`sealSecret`/`openSecret` no se re-exportan).

---

## 5. Rutas / server actions (`apps/web`)

### 5.1 Ruta nueva `apps/web/src/app/api/mercadopago/oauth/callback/route.ts`

- `export const dynamic = "force-dynamic"`; `export async function GET(req: Request)`.
- Protegida por el middleware (el matcher actual ya la cubre: no está en las exclusiones). Además,
  defensa en profundidad: `const session = await auth()` (de `@/auth`); si no hay
  `session.user.email` o no está en `allowedEmails` (de `@/auth.config`) →
  `NextResponse.redirect(new URL("/inicio", base))` **sin** llamar a `completeMercadoPagoOAuth`.
- `base = process.env.AUTH_URL` (detrás de Caddy, `req.url` puede traer el host interno). Si falta,
  usar `req.url`.
- `const result = await completeMercadoPagoOAuth({ sessionEmail: email, query: new URL(req.url).searchParams })`.
- Si `result === "connected"` → `revalidatePath("/ajustes")` y `revalidatePath("/servicios")`.
- Responde `NextResponse.redirect(new URL(`/ajustes?tab=mercadopago&mp=${result}`, base), 303)`.
- Nunca loguea el query (trae `code`).

`redirect_uri` que hay que registrar en la app "Numa": `${origin de AUTH_URL}/api/mercadopago/oauth/callback`
(hoy `https://169-58-151-56.sslip.io/api/mercadopago/oauth/callback`). Si cambia el dominio (D13), se
actualiza en la app de MP; no hay variable aparte.

### 5.2 Server actions nuevas en `apps/web/src/app/(panel)/ajustes/actions.ts`

```ts
/** Botón "Conectar Mercado Pago" / "Reconectar". */
export async function connectMercadoPagoAction(): Promise<void>
//  session = await auth(); sin email → redirect("/inicio").
//  try { const { url } = await startMercadoPagoOAuth(email); redirect(url) }   // URL absoluta externa
//  catch MercadoPagoConfigError → redirect("/ajustes?tab=mercadopago&mp=not_configured")
//  (el redirect de Next tira NEXT_REDIRECT: llamar a redirect FUERA del try/catch, guardando la URL en una variable)

/** Botón "Desconectar" (con confirmación en el cliente). */
export async function disconnectMercadoPagoAction(): Promise<void>
//  await disconnectMercadoPagoAccount(); revalidatePath("/ajustes"); revalidatePath("/servicios");
```

Se usa server action (no un GET) para iniciar el flujo: Next valida el origen de las server actions
y el middleware exige sesión. Las dos actions requieren sesión igual que el resto de Ajustes.

### 5.3 Rutas que **no** cambian

`apps/web/src/app/api/webhooks/mercadopago/route.ts` (sigue validando `x-signature` con
`MERCADOPAGO_WEBHOOK_SECRET`, fuera de alcance), `middleware.ts` (el matcher no cambia; solo se
suma un caso al test), `/pagos`.

---

## 6. Textos

### 6.1 Panel: `MERCADOPAGO_TEXT` en `packages/core/src/mercadopago-oauth.ts`

```ts
export const MERCADOPAGO_TEXT = {
  account: "Cuenta",
  notConnected: "No conectada",
  connected: "Conectada",
  needsReconnect: "Hay que reconectar",
  notConfigured: "No disponible",
  help: "Conectá tu cuenta de Mercado Pago para que las señas que pagan tus pacientes se acrediten directamente en tu cuenta. Vas a iniciar sesión en Mercado Pago; NutriBot nunca ve tu contraseña.",
  connect: "Conectar Mercado Pago",
  reconnect: "Reconectar",
  disconnect: "Desconectar",
  user: "Usuario",
  userId: "N.º de usuario de Mercado Pago",
  connectedAt: "Conectada el",
  testAccount: "Cuenta de prueba",
  disconnectTitle: "¿Desconectar Mercado Pago?",
  disconnectDescription: "Los pacientes no van a poder pagar señas hasta que vuelvas a conectar.",
  disconnectPending: (n: number) =>
    n === 1
      ? "Hay 1 seña esperando pago: si desconectás, se cancela ese turno y le avisamos al paciente."
      : `Hay ${n} señas esperando pago: si desconectás, se cancelan esos turnos y les avisamos a los pacientes.`,
  errorAlert: (reason: string) =>
    `Mercado Pago se desconectó: ${reason}. Hasta que reconectes, los pacientes no pueden pagar señas.`,
  errorReasons: {
    revoked: "se quitó el permiso desde Mercado Pago o dejó de ser válido",
    refresh_failed: "no se pudo renovar el permiso",
    decrypt_failed: "cambió la clave de seguridad del servidor",
  },
  callback: {
    connected: "Cuenta de Mercado Pago conectada.",
    denied: "No se conectó la cuenta: la autorización fue cancelada en Mercado Pago.",
    invalid_state: "No pudimos verificar la conexión. Probá de nuevo.",
    rejected: "Mercado Pago rechazó la conexión. Probá de nuevo; si se repite, avisá al soporte.",
    not_configured: "La conexión con Mercado Pago no está configurada en el servidor.",
    wrong_environment: "Esa es una cuenta de prueba de Mercado Pago. Para cobrar señas de verdad, conectá tu cuenta real.",
  },
  depositWarningTitle: "Tenés servicios con seña pero Mercado Pago no está conectado",
  depositWarningBody: "Hasta que lo conectes, los pacientes no pueden reservar esos servicios por WhatsApp.",
  depositWarningAction: "Ir a Ajustes → Mercado Pago",
  serviceFormNote: "Para cobrar la seña, conectá Mercado Pago en Ajustes.",
  serviceFormNoteAction: "Conectar Mercado Pago",
} as const;
```

`wrong_environment` es nuevo respecto de la tabla de la HU (lo pide D8: impedir un token de prueba en
producción). Los textos sin jerga técnica (regla de `SETTINGS_TEXT`).

En `SETTINGS_TEXT` (`settings-options.ts`): `sections.mercadopago: "Mercado Pago"` (después de
`google`) y `pageDescription: "Tus datos, el bot de WhatsApp, Google Calendar, Mercado Pago y tus informes en PDF."`.

### 6.2 Mensajes del bot (`packages/core/src/messages.ts`)

Agregar **después de `depositExpired`** (no al final del archivo):

```ts
/** HU-023 (D3): al paciente, en BOOK_CONFIRM tras "sí", si el servicio pide seña y no hay cuenta usable. */
export const DEPOSIT_UNAVAILABLE = `No pude generar el link de pago de la seña en este momento. 😕
Te aviso a la nutricionista para que te contacte y coordinen el turno. También podés escribir *menú* para ver otras opciones.`;

/** HU-023 (D5): a la profesional (PROFESSIONAL_ALERT a phoneJid), máx. 1 cada 24 h. */
export function professionalDepositUnavailableAlert(params: {
  patientName?: string | null; patientPhone: string; serviceName: string;
}): string {
  const who = params.patientName ?? params.patientPhone;
  return `⚠️ ${who} quiso reservar *${params.serviceName}* pero no se pudo generar el link de la seña porque Mercado Pago no está conectado. Conectalo en el panel: Ajustes → Mercado Pago.`;
}

/** HU-023 (D5): a la profesional, una vez por incidente (revocado / renovación fallida / clave). */
export const MERCADOPAGO_DISCONNECTED_ALERT = `⚠️ Se desconectó tu cuenta de Mercado Pago en NutriBot, así que por ahora los pacientes no pueden pagar señas. Volvé a conectarla en el panel: Ajustes → Mercado Pago.`;
```

Estados de la conversación:

| Mensaje | Cuándo |
|---|---|
| `DEPOSIT_UNAVAILABLE` | `STEP.BOOK_CONFIRM`, el paciente responde "sí", el servicio tiene `requiresDeposit` y `isMercadoPagoCheckoutAvailable()` es false → **no** se llama a `createAppointment`; o `createDepositCheckout` tira `MercadoPagoUnavailableError` (carrera: el turno ya quedó cancelado por el `catch` de siempre). Después, `save(jid, STEP.MENU)` |
| `professionalDepositUnavailableAlert` | En los mismos dos casos, vía `notifyMercadoPagoMissingForBooking` (outbox, tope 24 h) |
| `MERCADOPAGO_DISCONNECTED_ALERT` | Fuera de la conversación: outbox, al marcar `revoked` / `refresh_failed` / `decrypt_failed` (cron, checkout, webhook o conciliación), uno por incidente |
| `depositExpired` (existente) | D6: al reconectar con otra cuenta o desconectar, a cada paciente con seña pendiente de la cuenta anterior |

Si `phoneJid` es null, las dos alertas no se encolan (queda el aviso del panel).

---

## 7. Bot (`apps/bot`)

### 7.1 `src/conversation.ts` · `handleBookConfirm`

- Import nuevo desde `@nutri-bot/db/domain`: `isMercadoPagoCheckoutAvailable`,
  `notifyMercadoPagoMissingForBooking`, `MercadoPagoUnavailableError`.
- Después de resolver `[service, pro]` y **antes** de `createAppointment`:
  ```ts
  if (service.requiresDeposit && !(await isMercadoPagoCheckoutAvailable())) {
    await depositUnavailable(patientId, service.name, send);
    await save(jid, STEP.MENU);
    return;
  }
  ```
- En el `catch`, rama nueva **antes** del `else` genérico:
  `else if (err instanceof MercadoPagoUnavailableError) { await depositUnavailable(patientId, service.name, send); }`
  (para eso, `service` se declara antes del `try` o se guarda su nombre; no repetir la consulta).
- Helper local `depositUnavailable(patientId, serviceName, send)`: `send(messages.DEPOSIT_UNAVAILABLE)`;
  lee `prisma.patient.findUnique({ where: { id: patientId }, select: { name: true, phone: true } })`;
  `notifyMercadoPagoMissingForBooking({ patientName, patientPhone, serviceName })` dentro de
  `try/catch` (un error al encolar no cambia lo que ve el paciente; `logger.error({ errorType }, ...)`
  sin datos sensibles).

### 7.2 `src/workers.ts`

- Import `refreshMercadoPagoAccountToken`.
- Función `runMercadoPagoRefresh()`: llama, loguea `logger.info({ result }, "Renovación Mercado Pago")`
  si `result` no es `"not_needed"`/`"not_connected"`; `catch` → `logger.error("Error renovando Mercado Pago")` (sin `err`, puede traer headers).
- `startCron()`: agregar `cron.schedule("0 6 * * *", () => runMercadoPagoRefresh());` **entre** el
  cron de Google Calendar y el de `runSessionTextCleanup`. Restricciones de `workers.test.ts` que
  hay que respetar: el primero sigue siendo la conciliación (`"* * * * *"`), `"30 4 * * *"` sigue
  en `length - 2`, el resumen fuera de horario sigue último, y el último `"*/5 * * * *"` sigue siendo
  la limpieza de sesiones.
- `reconcilePayments()`: log con `skipped` (§4.6).

### 7.3 `scripts/test-mercadopago-sandbox.ts`

- Quitar `assert(process.env.MERCADOPAGO_ACCESS_TOKEN, ...)`. Mantener `MERCADOPAGO_SANDBOX === "true"`.
- Antes de crear fixtures: `const view = await getMercadoPagoConnectionView()`; si
  `view.status !== "connected"` y `!allowsMercadoPagoEnvToken(process.env)` → abortar con
  "Conectá un usuario de prueba vendedor en Ajustes → Mercado Pago (o habilitá MERCADOPAGO_ALLOW_ENV_TOKEN en dev)".
- Imprimir `view.nickname`, `view.userId`, `view.liveMode` (nunca tokens).
- Después del checkout, `assert.equal(payment.mercadopagoUserId, view.status === "connected" ? view.userId : null)`.
- La limpieza sigue siendo por ids propios (no cambia). No toca `MercadoPagoAccount`.

---

## 8. UI (skill `ui`): pantallas a dibujar / implementar

Patrón: el de "Google Calendar" en Ajustes (`GroupedList` + `GroupedListRow`, `StatusValue`,
`Button`, `useConfirm`, `Alert`). Componentes de `@/components/ui` y `@/components/grouped-list`;
nada de componentes nuevos de librería.

1. **Ajustes → Mercado Pago · sin cuenta** (`/ajustes?tab=mercadopago`)
   - Estructura: layout de Ajustes existente (índice lateral ≥ 1024 px / lista de secciones en
     celular con "‹ Ajustes"). Ícono del índice: `Wallet` de lucide.
   - Componentes: `GroupedList` con `footer={MERCADOPAGO_TEXT.help}`; fila "Cuenta" con
     `StatusValue` `No conectada` (tono neutro; si `hasActiveDepositServices`, tono de alerta:
     `ok={false}` del `StatusValue` actual). Debajo, `form action={connectMercadoPagoAction}` con
     `Button` primario **Conectar Mercado Pago** (con `loading` vía `useFormStatus`).
2. **Ajustes → Mercado Pago · conectada**
   - `GroupedList`: "Cuenta" → `StatusValue ok` `Conectada` (+ chip/footnote "Cuenta de prueba" si
     `liveMode === false`); "Usuario" → nickname con email en `text-footnote` debajo (si hay; si no
     hay nickname, solo email; si no hay ninguno, la fila no va); "N.º de usuario de Mercado Pago" →
     `userId` (`translate="no"`); "Conectada el" → fecha con el formato de fecha del panel en la
     zona de la profesional. Sin fila de vencimiento (D9).
   - Acciones: `Button variant="secondary"` **Reconectar** (misma action) + `MercadoPagoDisconnectButton`
     (`variant="plain"`) que abre `useConfirm({ title: disconnectTitle, description:
     disconnectDescription + (pendingDepositCount > 0 ? " " + disconnectPending(n) : ""),
     confirmLabel: disconnect, destructive: true })` → `disconnectMercadoPagoAction()`; error →
     `notify.error()` (D7: solo advierte, no bloquea).
3. **Ajustes → Mercado Pago · hay que reconectar**
   - `Alert tone="danger"` arriba de la sección con `errorAlert(errorReasons[errorCode])` y
     `Button` **Reconectar** (misma action). Debajo, el `GroupedList` de "conectada" con la fila
     "Cuenta" en `StatusValue ok={false}` `Hay que reconectar`.
4. **Ajustes → Mercado Pago · no configurada**
   - `GroupedList` con "Cuenta" → `No disponible` y `Alert tone="warning"` con
     `callback.not_configured`; botón **Conectar Mercado Pago** `disabled`.
5. **Banner de vuelta del callback** (dentro de la sección, arriba)
   - Componente cliente `MercadoPagoCallbackBanner`: lee `useSearchParams().get("mp")`; si es una
     clave de `MERCADOPAGO_TEXT.callback`, muestra `Alert` (`success` para `connected`, `warning`
     para `denied`, `danger` para el resto) con el texto; enseguida borra `mp` de la URL con
     `replaceUrlInRouter` (sin ida al servidor) y se oculta solo a los 8 s (con
     `prefers-reduced-motion` igual, sin animación). `role` lo pone `Alert`.
6. **Índice de Ajustes / lista en celular**
   - `AJUSTES_TABS` suma `{ value: "mercadopago", label: T.sections.mercadopago }` (entre `google`
     y `pdf`); `ICONS.mercadopago = Wallet`; `summaries.mercadopago` = texto del estado
     (`Conectada` / `No conectada` / `Hay que reconectar` / `No disponible`). Actualizar el
     comentario del componente (`general | whatsapp | google | mercadopago | pdf`).
7. **Servicios (`/servicios`) · aviso transversal**
   - Si `shouldWarnDepositWithoutMercadoPago(view)`: `Alert tone="warning"
     title={depositWarningTitle}` debajo del `PageHeader`, con `depositWarningBody` y
     `ButtonLink href="/ajustes?tab=mercadopago"` **Ir a Ajustes → Mercado Pago**. El mismo `Alert`
     va en Ajustes como `banner` cuando la sección activa no es Mercado Pago (se pasa como parte
     del `banner` existente, después del de WhatsApp).
8. **Formulario de servicio (Sheet) · nota bajo "Pide seña para reservar por WhatsApp"**
   - Si `requiresDeposit` está activo y `mercadoPagoReady === false`: `<p className="text-footnote
     text-muted-foreground">` con `serviceFormNote` + link `serviceFormNoteAction` a
     `/ajustes?tab=mercadopago`. No bloquea guardar. Prop nueva `mercadoPagoReady: boolean`
     (= `view.status === "connected"`) que baja `page.tsx` → `NewServiceButton` / `ServiceSections`
     → `ServiceSheet` → `ServiceForm`.

Nada de tokens en props de componentes cliente: solo lo de `MercadoPagoConnectionView` (que no los tiene).

---

## 9. Archivos y flujo

### Flujo de conexión

```
Ajustes (botón) ──server action connectMercadoPagoAction──► startMercadoPagoOAuth(email)
   └─ crea MercadoPagoOAuthState (hash state, verifier cifrado, 10 min) ─► redirect a auth.mercadopago.com
MP (login + autorizar app "Numa") ──► GET /api/mercadopago/oauth/callback?code&state
   └─ auth() ─► completeMercadoPagoOAuth: DELETE…RETURNING state ─► POST /oauth/token (PKCE)
      ─► live_mode check ─► GET /users/me ─► tx: lock fila, guardar cifrado, D6 ─► redirect /ajustes?tab=mercadopago&mp=…
```

### Crear

- `packages/core/src/mercadopago-oauth.ts`, `packages/core/src/mercadopago-oauth.test.ts`
- `packages/db/domain/secretBox.ts`, `secretBox.test.ts`
- `packages/db/domain/mercadopagoOAuthClient.ts`, `mercadopagoOAuthClient.test.ts`
- `packages/db/domain/mercadopagoAccount.ts`, `mercadopagoAccount.test.ts`
- `packages/db/domain/mercadopago-privacy.test.ts`
- `packages/db/prisma/migrations/<timestamp>_mercadopago_oauth/migration.sql` (generada)
- `apps/web/src/app/api/mercadopago/oauth/callback/route.ts`, `route.test.ts`
- `apps/web/src/app/(panel)/ajustes/mercadopago-section.tsx` (cliente: botones conectar/desconectar + banner)
- `apps/web/src/app/(panel)/ajustes/mercadopago-actions.test.ts`

### Editar

- `packages/db/prisma/schema.prisma`
- `packages/db/domain/payments.ts`, `payments.test.ts`, `index.ts` (1 línea)
- `packages/core/src/messages.ts`, `messages.test.ts`, `settings-options.ts`, `settings-options.test.ts` (si hace falta), `index.ts` (1 línea: `export * from "./mercadopago-oauth";` **después de** `export * from "./payment-methods";`, no al final)
- `apps/web/src/app/(panel)/ajustes/page.tsx`, `ajustes-tabs.tsx`, `actions.ts`
- `apps/web/src/app/(panel)/servicios/page.tsx`, `service-form.tsx`, `new-service-button.tsx`, `service-card.tsx`
- `apps/web/src/middleware.test.ts` (1 caso)
- `apps/bot/src/conversation.ts`, `conversation-booking.test.ts`, `workers.ts`, `workers.test.ts`
- `apps/bot/scripts/test-mercadopago-sandbox.ts`
- `.env.example`, `README.md`
- `deploy/.env.example` **solo si existe en `develop` al momento del rebase** (§12.2)

### No tocar

`apps/web/src/app/api/webhooks/mercadopago/route.ts`, `packages/db/domain/mercadopago-signature.ts`,
`professionalSelect.ts`, `Professional`, `apps/web/src/auth.ts`, `auth.config.ts`, `middleware.ts`,
`/pagos`, `backlog/**`, el `catch` de `createDepositCheckout` y `expireStalePendingPayments`
(zona de HU-021).

---

## 10. Checklist atómico

### `packages/db` · esquema
- [ ] `git fetch && git rebase origin/develop` antes de crear la migración (regla de migraciones).
- [ ] Confirmar que ninguna otra HU con label `migración` está en `implementando`.
- [ ] Editar `schema.prisma` (§3.1).
- [ ] `pg_dump` de la base de dev fuera del repo.
- [ ] `npx dotenv -e ../../.env -- prisma migrate dev --create-only --name mercadopago_oauth` (desde `packages/db`).
- [ ] Revisar `migration.sql` contra §3.2 (sin DROP, sin cambios de tipo).
- [ ] `npm run db:migrate` y `npm run db:generate` (raíz).

### `packages/core`
- [ ] Crear `mercadopago-oauth.ts` con constantes, tipos, funciones y `MERCADOPAGO_TEXT` (§4.1, §6.1).
- [ ] Crear `mercadopago-oauth.test.ts` (§11.1).
- [ ] `messages.ts`: `DEPOSIT_UNAVAILABLE`, `professionalDepositUnavailableAlert`, `MERCADOPAGO_DISCONNECTED_ALERT` después de `depositExpired`.
- [ ] `messages.test.ts`: textos exactos.
- [ ] `settings-options.ts`: `sections.mercadopago`, `pageDescription`.
- [ ] `index.ts`: export después de `./payment-methods`.
- [ ] `npx vitest run packages/core` verde.

### `packages/db` · domain
- [ ] `secretBox.ts` + `secretBox.test.ts`.
- [ ] `mercadopagoOAuthClient.ts` + test (fetch mockeado, sin red).
- [ ] `mercadopagoAccount.ts`: view, start, complete, disconnect, credentials, refresh, markError, notifyMissing, internos (§4.4–4.5).
- [ ] `mercadopagoAccount.test.ts` (prisma y fetch mockeados).
- [ ] `index.ts`: `export * from "./mercadopagoAccount";` después de `./mercadopago-signature`.
- [ ] `payments.ts`: cambios 1–6 de §4.6, sin tocar el `catch` de checkout ni `expireStalePendingPayments`.
- [ ] `payments.test.ts`: reemplazar el stub de `MERCADOPAGO_ACCESS_TOKEN` por mock de `./mercadopagoAccount`; casos nuevos (§11.2).
- [ ] `mercadopago-privacy.test.ts`.
- [ ] `npx vitest run packages/db` verde.

### `apps/bot`
- [ ] `conversation.ts`: chequeo previo, rama `MercadoPagoUnavailableError`, helper `depositUnavailable` (§7.1).
- [ ] `conversation-booking.test.ts`: mocks nuevos + casos (§11.3).
- [ ] `workers.ts`: `runMercadoPagoRefresh` + cron `"0 6 * * *"` en la posición indicada; log con `skipped`.
- [ ] `workers.test.ts`: mock de `refreshMercadoPagoAccountToken` + caso del cron diario; los asserts de orden existentes siguen verdes.
- [ ] `scripts/test-mercadopago-sandbox.ts` (§7.3).
- [ ] `npm run typecheck --workspace apps/bot`.

### `apps/web`
- [ ] Ruta `api/mercadopago/oauth/callback/route.ts` (§5.1) + `route.test.ts`.
- [ ] `ajustes/actions.ts`: `connectMercadoPagoAction`, `disconnectMercadoPagoAction` (§5.2) + `mercadopago-actions.test.ts`.
- [ ] `ajustes/mercadopago-section.tsx`: `MercadoPagoConnectButton`, `MercadoPagoDisconnectButton`, `MercadoPagoCallbackBanner`.
- [ ] `ajustes/ajustes-tabs.tsx`: tab, ícono, comentario.
- [ ] `ajustes/page.tsx`: `getMercadoPagoConnectionView()`, panel `mercadopago` con los 4 estados, `summaries.mercadopago`, aviso transversal en `banner`.
- [ ] `servicios/page.tsx`: `Alert` + prop `mercadoPagoReady`.
- [ ] `servicios/new-service-button.tsx`, `service-card.tsx`, `service-form.tsx`: bajar la prop y nota bajo el switch.
- [ ] `middleware.test.ts`: `"/api/mercadopago/oauth/callback"` queda protegido.
- [ ] `npm run typecheck --workspace apps/web`.

### Raíz / docs
- [ ] `.env.example` (§11.5).
- [ ] `README.md`: sección "Mercado Pago: vincular la cuenta (HU-023)" (§11.5).
- [ ] `deploy/.env.example` según §12.2.
- [ ] `npm run typecheck`, `npm run test`, `./ops/harness/verify.sh`.
- [ ] Commits separados por tarea (esquema / core / domain / bot / web / docs), con trailer `Co-Authored-By`.

---

## 11. Tests y verificación

Todo sin red ni base: `fetch` con `vi.fn()`, `mercadopago` y `../index` (prisma) mockeados como en
`payments.test.ts`. Ningún test manda WhatsApp.

### 11.1 `packages/core/src/mercadopago-oauth.test.ts`
- `buildMercadoPagoAuthorizationUrl`: host/path exactos; params `client_id`, `response_type=code`,
  `platform_id=mp`, `state`, `redirect_uri` (codificada), `code_challenge`, `code_challenge_method=S256`.
- `mercadoPagoRedirectUri`: `"https://x.sslip.io"` y `"https://x.sslip.io/"` y
  `"https://x.sslip.io/algo"` → `"https://x.sslip.io/api/mercadopago/oauth/callback"`;
  `undefined` / `"no-url"` → `null`.
- `parseMercadoPagoCallback`: code+state → ok; `error=access_denied&state=s` → denied con state;
  query vacío → denied con state null; code sin state → invalid.
- `parseMercadoPagoTokenResponse`: respuesta completa (`user_id` numérico → string, `expiresAt =
  now + expires_in`, `live_mode`, `scope`); sin `refresh_token` → null; sin `expires_in` → null;
  `null` / string → null; sin `user_id` → `userId: null`.
- `needsMercadoPagoRefresh`: 31 días → false; 29 días → true; vencido → true.
  `isMercadoPagoTokenExpired`: 2 min → false; 30 s → true (skew 60 s).
- `classifyMercadoPagoFailure`: 401 → revoked; 400+`invalid_grant` → revoked; 400+`invalid_client`
  → rejected; 403, 404 → rejected; 0, 408, 429, 500, 503 → transient; sin status → transient.
- `mercadoPagoConnectionStatus`: los 4 resultados. `shouldWarnDepositWithoutMercadoPago`: true solo
  con servicios con seña y status ≠ connected.
- `shouldSendThrottledAlert`: null → true; 23 h → false; 24 h → true.
- `allowsMercadoPagoEnvToken`: flag "true" + token + NODE_ENV development → true; NODE_ENV
  production → false; sin flag → false; token "  " → false.
  `requiresLiveMercadoPagoAccount`: production → true; development/test → false.
- `MERCADOPAGO_TEXT.callback` tiene exactamente las 6 claves de `MercadoPagoCallbackResult`;
  `disconnectPending(1)` y `(3)`; ningún texto contiene `MERCADOPAGO_`, `token`, `OAuth`, `PKCE`.
- `messages.test.ts`: `DEPOSIT_UNAVAILABLE` exacto; `professionalDepositUnavailableAlert` con
  nombre y sin nombre (usa teléfono); `MERCADOPAGO_DISCONNECTED_ALERT` exacto.

### 11.2 `packages/db/domain`
- `secretBox.test.ts`: ida y vuelta; dos `seal` del mismo texto dan ciphertexts distintos; AAD
  distinta / tag alterado / clave distinta / prefijo ≠ `v1` → `SecretDecryptError`;
  `loadMercadoPagoTokenKey` con 16 bytes o vacía → `MercadoPagoConfigError` cuyo mensaje no contiene el valor.
- `mercadopagoOAuthClient.test.ts`: `exchangeMercadoPagoCode` hace `POST` a
  `MERCADOPAGO_TOKEN_URL` con el JSON exacto (6 claves, `grant_type: "authorization_code"`,
  `code_verifier`) y `Content-Type: application/json`; `refreshMercadoPagoToken` con el JSON exacto
  (4 claves, `grant_type: "refresh_token"`); 400 `{error:"invalid_grant"}` → `MercadoPagoApiError`
  `kind: "revoked"` cuyo `message`/`JSON.stringify` no contiene `client_secret`, `code`, verifier ni
  tokens; `fetch` que rechaza → `status 0`, `transient`; respuesta 200 sin `refresh_token` →
  `rejected`; `fetchMercadoPagoUser` manda `Authorization: Bearer …` y mapea `id` a string;
  `getMercadoPagoAppConfig` → null si falta cualquiera de las 4 variables.
- `mercadopagoAccount.test.ts`:
  - `startMercadoPagoOAuth`: guarda `stateHash` (≠ state de la URL), `codeVerifierEnc` (≠ verifier),
    `sessionEmail` en minúsculas, `expiresAt = now + 10 min`; el `code_challenge` de la URL es
    `base64url(sha256(verifier descifrado))`; borra vencidos; sin config → `MercadoPagoConfigError`.
  - `completeMercadoPagoOAuth`: `DELETE … RETURNING` sin filas → `"invalid_state"` y `fetch` no
    llamado; `denied` → `fetch` no llamado, nada escrito; canje 400 → `"rejected"` y ninguna
    escritura en la cuenta; `NODE_ENV=production` + `live_mode:false` → `"wrong_environment"` sin
    escritura; OK → update con `accessTokenEnc`/`refreshTokenEnc` que no contienen el token en claro,
    `errorCode: null`, `errorNotifiedAt: null`; `/users/me` falla → igual `"connected"` con nickname null.
  - D6: reconectar con **otro** `user_id` con una seña PENDING de la cuenta anterior → turno
    CANCELLED con `MERCADOPAGO_ACCOUNT_CHANGED_CANCEL_REASON`, pago CANCELLED, un `CANCELLATION`
    con `depositExpired`; misma cuenta → nada cancelado; pago con `mercadopagoUserId` null → no se toca.
  - `disconnectMercadoPagoAccount`: pone en null tokens y datos, conserva `missingAlertAt`, cancela D6, devuelve el conteo.
  - `getMercadoPagoCredentials`: conectada → token descifrado y `sellerUserId`; con `errorCode` →
    null; scope payment con otro seller → null; `decrypt_failed` → marca error y null; vencido →
    llama al refresh (`force`); fallback dev (flag + token + no production) → `env_fallback`;
    mismo caso con `NODE_ENV=production` → null.
  - `refreshMercadoPagoAccountToken`: > 30 días → `"not_needed"` sin `fetch`; < 30 días → ejecuta el
    `FOR UPDATE`, guarda refresh **nuevo** y `expiresAt`; `invalid_grant` → `errorCode: "revoked"`
    + un `outboundMessage` `PROFESSIONAL_ALERT`; segundo fallo con `errorCode` ya puesto → sin
    segundo mensaje; 503 → `"transient_error"` sin marcar; sin `phoneJid` → marca sin mensaje.
  - `notifyMercadoPagoMissingForBooking`: UPDATE devuelve fila → encola con el texto exacto; no
    devuelve fila → no encola; sin `phoneJid` → no encola.
  - `getMercadoPagoConnectionView`: el objeto devuelto no tiene ninguna clave `*Enc` ni el texto de
    un token aunque el mock de prisma lo traiga; el `select` no pide columnas `*Enc`.
- `payments.test.ts` (ajustes + nuevos):
  - El `beforeEach` mockea `getMercadoPagoCredentials` → `{ accessToken: "isolated-test-token",
    sellerUserId: "seller-1", source: "account" }` en lugar de `vi.stubEnv("MERCADOPAGO_ACCESS_TOKEN", …)`.
  - El caso `"missing-token"` pasa a "sin credenciales" (`getMercadoPagoCredentials` → null): tira
    `MercadoPagoUnavailableError`, libera la reserva, no crea `Payment`.
  - `payment.create` recibe `mercadopagoUserId: "seller-1"`.
  - `Preference.create` rechaza con `{ status: 401 }` → `markMercadoPagoAccountError("revoked")` y
    se libera la reserva; con `{ status: 500 }` → no marca.
  - `reconcilePendingPayments`: pago con seller sin credenciales → `skipped: 1`, `failed: 0`, sin
    llamadas a `get`/`search`; dos pagos del mismo seller → `getMercadoPagoCredentials` una sola vez.
  - `syncMercadoPagoPayment` con `existing.mercadopagoUserId = "otro"` → no actualiza ni encola.
  - Los casos existentes (return URL, montos, webhook, expiración) siguen verdes.
- `mercadopago-privacy.test.ts`: lee con `fs` los `.ts`/`.tsx` de `packages/db/domain` y
  `apps/web/src` y `apps/bot/src` (sin `node_modules`/`.next`): `accessTokenEnc`,
  `refreshTokenEnc`, `codeVerifierEnc` solo aparecen en `mercadopagoAccount.ts` (y sus tests);
  `MERCADOPAGO_ACCESS_TOKEN` solo en `packages/core/src/mercadopago-oauth.ts`
  (`allowsMercadoPagoEnvToken`), `packages/db/domain/mercadopagoAccount.ts` (fallback) y tests
  (en particular, ya no en `payments.ts`).

### 11.3 `apps/bot`
- `conversation-booking.test.ts`: agregar al mock de `@nutri-bot/db/domain`
  `isMercadoPagoCheckoutAvailable`, `notifyMercadoPagoMissingForBooking`,
  `MercadoPagoUnavailableError: class extends Error {}`, y `prisma.patient.findUnique`. Casos:
  servicio con `requiresDeposit` y no disponible → `createAppointment` no llamado, `send` con
  `DEPOSIT_UNAVAILABLE`, `notify` con `{ patientName, patientPhone, serviceName }`; disponible →
  flujo de seña de siempre; `createDepositCheckout` tira `MercadoPagoUnavailableError` → mismo
  mensaje + `notify`; servicio sin seña → no consulta disponibilidad.
- `workers.test.ts`: mock `refreshMercadoPagoAccountToken`; hay un schedule `"0 6 * * *"` cuyo tick
  lo llama una vez; si rechaza, no propaga; siguen verdes los asserts de orden.

### 11.4 `apps/web`
- `api/mercadopago/oauth/callback/route.test.ts` (mock de `@/auth`, `@/auth.config`,
  `@nutri-bot/db/domain`, `next/cache`): sin sesión → redirect a `/inicio`, `completeMercadoPagoOAuth`
  no llamado; email fuera de `allowedEmails` → igual; cada resultado → 303 a
  `${AUTH_URL}/ajustes?tab=mercadopago&mp=<resultado>`; `connected` → `revalidatePath` x2.
- `ajustes/mercadopago-actions.test.ts` (mock de `next/navigation` `redirect`, `@/auth`):
  connect sin sesión → `/inicio`; config faltante → `?mp=not_configured`; OK → redirect a la URL
  de MP; disconnect → llama a `disconnectMercadoPagoAccount` y revalida.
- `middleware.test.ts`: `"/api/mercadopago/oauth/callback"` en la lista de "keeps protected".

### 11.5 Configuración y docs

`.env.example` (reemplaza el bloque `# --- Mercado Pago ---`):

```bash
# --- Mercado Pago ---
# Aplicación "Numa" del equipo (Mercado Pago Developers → Tus integraciones → Numa).
# La profesional conecta SU cuenta desde Ajustes → Mercado Pago (OAuth). Ver README.
MERCADOPAGO_CLIENT_ID=
MERCADOPAGO_CLIENT_SECRET=
# Clave para cifrar los tokens de la cuenta vinculada: 32 bytes en base64 (openssl rand -base64 32).
# Si se cambia, hay que reconectar Mercado Pago desde Ajustes.
MERCADOPAGO_TOKEN_KEY=
# La redirect URI no va acá: es <AUTH_URL>/api/mercadopago/oauth/callback y tiene que estar
# cargada tal cual en "URLs de redireccionamiento" de la aplicación.
MERCADOPAGO_WEBHOOK_SECRET=
MERCADOPAGO_NOTIFICATION_URL=
MERCADOPAGO_RETURN_URL=
# Solo desarrollo: si no hay cuenta vinculada, usar este access token. Se ignora con NODE_ENV=production.
MERCADOPAGO_ALLOW_ENV_TOKEN=false
MERCADOPAGO_ACCESS_TOKEN=
```

`README.md`, sección nueva "Mercado Pago: vincular la cuenta (HU-023)":
1. En la app "Numa" (MP Developers): URL de redireccionamiento exacta
   `https://<dominio>/api/mercadopago/oauth/callback`; **habilitar PKCE**; confirmar que los scopes
   incluyen `offline_access` (sin eso no hay renovación); notificaciones con la clave secreta
   (= `MERCADOPAGO_WEBHOOK_SECRET`).
2. Variables (`MERCADOPAGO_CLIENT_ID`, `MERCADOPAGO_CLIENT_SECRET`, `MERCADOPAGO_TOKEN_KEY`).
3. Conectar desde Ajustes → Mercado Pago con la cuenta que cobra (hoy la de Joel, D14; después la
   de la Lic. Ponce: "Reconectar" con su cuenta).
4. Pruebas sin plata: usuarios de prueba (vendedor + comprador) creados desde la cuenta de
   developers dueña de "Numa"; en dev se conecta el vendedor de prueba y se paga con el comprador.
5. Cambiar de cuenta cancela las señas pendientes de la anterior (D6).
6. Después de conectar en producción, borrar `MERCADOPAGO_ACCESS_TOKEN` del `.env` del VPS.

### 11.6 Verificación (lo que corre el implementer antes de `done`)

```bash
npm run db:generate
npm run typecheck                                   # todos los workspaces (web y bot incluidos)
npm run typecheck --workspace apps/web
npm run typecheck --workspace apps/bot
npx vitest run packages/core/src/mercadopago-oauth.test.ts packages/core/src/messages.test.ts packages/core/src/settings-options.test.ts
npx vitest run packages/db/domain/secretBox.test.ts packages/db/domain/mercadopagoOAuthClient.test.ts packages/db/domain/mercadopagoAccount.test.ts packages/db/domain/payments.test.ts packages/db/domain/mercadopago-privacy.test.ts
npx vitest run apps/bot/src/conversation-booking.test.ts apps/bot/src/workers.test.ts
npx vitest run apps/web/src/app/api/mercadopago apps/web/src/app/api/webhooks/mercadopago "apps/web/src/app/(panel)/ajustes" apps/web/src/middleware.test.ts
npm run test                                        # monorepo completo
(cd packages/db && npx dotenv -e ../../.env -- prisma migrate status)   # "Database schema is up to date"
./ops/harness/verify.sh
grep -rn "accessTokenEnc\|refreshTokenEnc" apps/web/src apps/bot/src   # tiene que salir vacío
```

Chequeo de la base (solo lectura, para el reporte):
`docker compose exec db psql -U <user> -d <db> -c '\d "MercadoPagoAccount"' -c '\d "MercadoPagoOAuthState"' -c '\d "Payment"'`.

**Prueba manual (la hace Joel, no el implementer; el implementer la deja escrita en
`progress/impl_HU-023.md`)**, sin plata real y sin WhatsApp real:

1. Dev con HTTPS público para el callback (MP exige una redirect URI registrada y la sesión tiene
   que ser del mismo origen que `AUTH_URL`): túnel (`cloudflared tunnel --url http://localhost:3000`),
   `AUTH_URL=<url del túnel>`, la redirect URI del túnel registrada en "Numa" y
   `<túnel>/api/auth/callback/google` en el cliente OAuth de Google de dev. **Bot apagado** (o con
   número propio).
2. Ajustes → Mercado Pago → Conectar → login con el **usuario de prueba vendedor** → vuelve con
   "Cuenta de Mercado Pago conectada." y muestra nickname / user_id. Anotar el `live_mode`
   observado (columna `liveMode`): define si D8 bloquearía usuarios de prueba en producción.
3. Repetir y tocar "Cancelar" en MP → banner "cancelada". Recargar la URL del callback ya usada →
   "No pudimos verificar la conexión".
4. `MERCADOPAGO_SANDBOX=true npm run test:mercadopago-sandbox --workspace apps/bot` → pagar con el
   **usuario de prueba comprador** → PASS; el `Payment` tiene `mercadopagoUserId` = user_id del vendedor de prueba.
5. Con el link de una seña abierto (paso 4 sin pagar), "Desconectar" → la confirmación avisa "Hay 1
   seña…"; el turno queda CANCELLED y hay un `CANCELLATION` en `OutboundMessage` → **borrarlo por
   id** antes de prender el bot (el script limpia sus propios ids al final).
6. Verificar el webhook firmado de un pago del vendedor de prueba (riesgo R2): si llega 401
   `invalid_signature`, anotarlo; la conciliación de cada minuto confirma igual.
7. Renovación: `UPDATE "MercadoPagoAccount" SET "expiresAt" = now() + interval '10 days' WHERE id = 1`
   (solo la fila de prueba, creada por esta prueba) y correr una vez
   `refreshMercadoPagoAccountToken()` desde un script tsx → `"refreshed"` y `expiresAt` ~180 días.

---

## 12. Cruces, despliegue y riesgos

### 12.1 HU-021 (#50, Leo) — diseño para rebase trivial

HU-021 agrega `DEPOSIT_AUTO_CANCEL_REASONS` en `packages/core` y lo usa en
`packages/db/domain/payments.ts` (presumiblemente en los `cancelReason` literales del `catch` de
`createDepositCheckout` y de `expireStalePendingPayments`). Esta SDD:

- **No toca** esas dos zonas de `payments.ts` ni los literales.
- Toca en `payments.ts` solo: imports, `mercadoPagoClient`, 3 líneas del `try` de checkout + el
  `Preference.create` envuelto, el arranque de `syncMercadoPagoPayment` + 1 línea en su tx, y el
  cuerpo de `reconcilePendingPayments`.
- El motivo nuevo de D6 vive en core como `MERCADOPAGO_ACCOUNT_CHANGED_CANCEL_REASON` y se usa en
  `mercadopagoAccount.ts` (archivo nuevo).
- Agregados en `packages/core/src/index.ts` y `messages.ts` van en el medio del archivo, no al final.

**Paso de rebase** (lo hace quien mergee segundo): si `DEPOSIT_AUTO_CANCEL_REASONS` ya existe en
`develop`, sumar `MERCADOPAGO_ACCOUNT_CHANGED_CANCEL_REASON` a esa lista (y a su test), porque es una
cancelación automática de seña. Si HU-023 entra primero, dejarlo anotado en el PR para Leo. Si el
rebase de `payments.ts` choca, resolver conservando los dos cambios (los de HU-021 son en los
literales; los de esta HU, en credenciales).

### 12.2 PR #52 (deploy VPS)

`deploy/compose.yml` **no cambia**: web y bot reciben todo `deploy/.env` por `env_file` y `AUTH_URL`
ya se setea en los dos servicios (el bot lo necesita para `getMercadoPagoAppConfig` al renovar).
`deploy/.env.example`: si al rebasear sobre `develop` el archivo ya existe
(`git ls-tree origin/develop deploy/.env.example`), reemplazar el bloque `MERCADOPAGO_*` por:

```bash
MERCADOPAGO_CLIENT_ID=
MERCADOPAGO_CLIENT_SECRET=
#  openssl rand -base64 32   (si cambia, hay que reconectar Mercado Pago en Ajustes)
MERCADOPAGO_TOKEN_KEY=
MERCADOPAGO_WEBHOOK_SECRET=
MERCADOPAGO_NOTIFICATION_URL=https://${DOMAIN}/api/webhooks/mercadopago
MERCADOPAGO_RETURN_URL=
```

(sin `MERCADOPAGO_ACCESS_TOKEN` ni `MERCADOPAGO_ALLOW_ENV_TOKEN`: en producción se ignoran). Si el
archivo todavía no está en `develop`, **no crearlo** en esta rama (chocaría con #52): dejar esas
líneas en `progress/impl_HU-023.md` y en el cuerpo del PR, para agregarlas en esta rama tras el
rebase cuando #52 esté mergeado.

### 12.3 Puesta en producción (VPS)

1. Sin turnos `AWAITING_PAYMENT` en curso (`SELECT count(*) FROM "Appointment" WHERE status = 'AWAITING_PAYMENT'` → 0); si hay, esperar 15 min.
2. `pg_dump` del VPS.
3. Cargar `MERCADOPAGO_CLIENT_ID`, `MERCADOPAGO_CLIENT_SECRET`, `MERCADOPAGO_TOKEN_KEY` en `deploy/.env`; registrar la redirect URI y PKCE en "Numa".
4. `docker compose up -d --build` y `docker compose run --rm migrate`.
5. Ajustes → Mercado Pago → conectar la cuenta de Joel (D14). Verificar con una reserva de prueba solo si se acepta un pago real chico; si no, alcanza con el estado "Conectada".
6. Borrar `MERCADOPAGO_ACCESS_TOKEN` de `deploy/.env` y reiniciar.

Entre el paso 4 y el 5 los servicios con seña responden `DEPOSIT_UNAVAILABLE` (comportamiento esperado de D3).

### 12.4 Riesgos

| # | Riesgo | Mitigación |
|---|---|---|
| R1 | Pagos PENDING creados antes de la HU (token de Leo, `mercadopagoUserId` null): en producción no hay credencial para consultarlos | La conciliación los cuenta como `skipped` (no `failed`), así `expireStalePendingPayments` libera la reserva a los 15 min. Deploy sin `AWAITING_PAYMENT` (§12.3) |
| R2 | No está confirmado en la doc con qué clave firma MP el `x-signature` de los pagos de un vendedor vinculado por OAuth | Se mantiene la validación actual (fuera de alcance cambiarla). Si falla, la conciliación de cada minuto confirma igual. Se verifica en el paso 6 de la prueba manual |
| R3 | `live_mode` de los usuarios de prueba vía OAuth podría ser `true` | Entonces D8 no los distingue de una cuenta real; el bloqueo cubre solo credenciales sandbox (`live_mode:false`). Se anota en la prueba manual (paso 2) |
| R4 | Refresh concurrente web/bot invalida el `refresh_token` | `FOR UPDATE` sobre la fila + relectura con el lock (§4.5) |
| R5 | HTTP dentro de la transacción de refresh | Una vez cada ~150 días; timeout de fetch 10 s < timeout de tx 20 s |
| R6 | D6 cancela una seña que el paciente justo pagó en la cuenta anterior | Aceptado por el usuario en D6 (ventana ≤ 15 min). La confirmación de "Desconectar" lo advierte (D7) |
| R7 | "Te aviso a la nutricionista" con alerta topeada a 1 cada 24 h | Aceptado en D5; el panel muestra el aviso permanente |
