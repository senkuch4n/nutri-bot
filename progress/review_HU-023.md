# Review — HU-023

**Veredicto:** APPROVED

Revisado: diff `origin/develop...feat/HU-023-mercadopago-oauth` (46 archivos), contra
`Refactorizaciones/mercadopago-oauth.md` (SDD), `docs/hu-mercadopago-oauth.md` (Resoluciones D1–D14)
y `CHECKPOINTS.md`. Los comandos los corrí yo:

- `npm run typecheck`: exit 0 (core, db, bot, web).
- `npm run test`: 176 archivos, 2657 tests, exit 0.
- `./ops/harness/verify.sh`: "Arnés OK", exit 0. Solo queda el WARN de siempre por tocar el bot.
- Base de dev, una consulta **solo de lectura**: `MercadoPagoAccount` 0 filas, `MercadoPagoOAuthState` 0,
  `Payment` con `mercadopagoUserId` 0, `OutboundMessage` que mencione Mercado Pago 0. Las pruebas
  del implementer no dejaron datos.

## Seguridad (foco pedido)

- **State OAuth:** `randomBytes(32)` base64url. En la base va solo `sha256hex(state)`
  (`mercadopagoAccount.ts:265,272`). Vence a los 10 min (`:275`). El consumo es de un solo uso y
  atómico, con `DELETE … WHERE stateHash AND sessionEmail AND expiresAt > now RETURNING`
  (`:289-295`), y si no devuelve fila corta en `invalid_state` sin llamar a MP (`:316-317`). Tests en
  `mercadopagoAccount.test.ts:254-299`.
- **PKCE S256:** el verifier es `randomBytes(32)` base64url (43 caracteres) y el challenge es
  `sha256(verifier)` base64url (`:266-267`). El verifier va cifrado con AAD propia (`:273`). La URL
  lleva `code_challenge_method=S256` (`core/mercadopago-oauth.ts:47-56`). El test verifica que el
  challenge sea el sha256 del verifier descifrado.
- **Misma sesión:** `sessionEmail` se guarda en minúsculas al iniciar y se exige en el DELETE. La
  ruta lo toma de `auth()` y además valida `allowedEmails` (`callback/route.ts:14-18`). El
  middleware también cubre la ruta (matcher sin excepción; caso nuevo en `middleware.test.ts`).
- **redirect_uri fija / open redirect:** la redirect_uri sale de `origin(AUTH_URL)` más un path
  constante (`core/mercadopago-oauth.ts:60-70`). La ruta redirige a `AUTH_URL` con `mp=<enum>`, sin
  usar nada del query. La server action redirige a una URL construida sobre la constante
  `MERCADOPAGO_AUTHORIZATION_URL`.
- **Errores:** `MercadoPagoApiError` guarda solo status y un código con forma de identificador
  (`mercadopagoOAuthClient.ts:57-63`), nunca el body. Los logs son `{ status, code }`
  (`mercadopagoAccount.ts:331,477`). El bot loguea solo `errorType` y el cron no loguea `err`. Hay
  tests de que ni el code, ni el secret, ni los tokens aparecen en los logs.
- **AES-256-GCM:** IV aleatorio de 12 bytes por mensaje, tag de 16 bytes verificado con
  `setAuthTag` + `final()`, largo de IV/tag validado y AAD por campo (`secretBox.ts:43-68`). Una
  clave ausente o que no tenga 32 bytes tira `MercadoPagoConfigError` con un mensaje que nombra la
  variable y no el valor (`:33-40`). Con clave inválida, `getMercadoPagoAppConfig` devuelve null
  ("No disponible").
- **Los tokens no llegan al navegador:** `getMercadoPagoConnectionView` usa un select sin `*Enc`
  (`mercadopagoAccount.ts:227-230`), y `mercadopago-privacy.test.ts` comprueba que las columnas
  cifradas solo aparecen en `mercadopagoAccount.ts`.
- **Concurrencia de la renovación:** se hace `lockAccountRow` (INSERT … ON CONFLICT + `SELECT … FOR
  UPDATE`), se relee con el lock tomado y, con `force`, devuelve `not_needed` si otro proceso ya
  renovó (`:453-462`). El refresh_token nuevo se guarda (`:488-498`). El orden de locks es siempre
  cuenta → Payment: `getMercadoPagoCredentials` y `markMercadoPagoAccountError` se llaman fuera de
  las transacciones de `payments.ts` (`payments.ts:39-41,121-125,207-226`).
- **D3:** en el modo `current`, si la cuenta tiene error o falta la clave, no hay respaldo
  (`fallbackApplies` exige `!hasAccount`, `:429-431`). `allowsMercadoPagoEnvToken` exige el flag
  `"true"` explícito y `NODE_ENV !== "production"`. `apps/bot/Dockerfile` fija
  `NODE_ENV=production`, así que el bot del VPS tampoco usa el token del `.env`.
- **D6:** `staleDepositWhere` filtra `mercadopagoUserId not null AND NOT = keep` (`:104-113`). Al
  desconectar (keep null) cancela todas las señas con cuenta, y al reconectar la misma cuenta no
  cancela nada. Los pagos con `mercadopagoUserId` null no se tocan. Usa el mismo lock de Payment que
  `expireStalePendingPayments` y aplica `updateMany` condicionado a `AWAITING_PAYMENT`, con test de
  aprobación concurrente (`test:429`).
- **D8:** si `NODE_ENV=production` y `live_mode !== true`, devuelve `wrong_environment` y no guarda
  nada (`:335`).
- **Migración:** es solo aditiva, como en §3.2: `ADD COLUMN` nullable, 2 `CREATE TABLE`, un índice
  único y uno común. No tiene DROP, ni cambios de tipo, ni INSERT.
- **Reglas de AGENTS.md:** todos los tests inyectan `fetch` (`vi.fn`) y mockean `../index`, sin
  red ni base. El sandbox sigue limpiando por ids propios y no toca `MercadoPagoAccount`.

## Checkpoints
- C1 backlog válido, 1 HU activa por responsable: [x] (verify.sh OK; HU-023 `en_revision`, responsable senkuch4n)
- C1 bitácora refleja la HU: [x] `progress/current-senkuch4n.md`
- C1 no toca HU ajenas: [x] solo `backlog/HU-023.json` y docs propios
- C1 verify.sh exit 0: [x]
- C2 HU completa: [x] `docs/hu-mercadopago-oauth.md` con Resoluciones
- C2 SDD completa: [x]
- C2 firmas = contrato: [x] (core §4.1, secretBox §4.2, client §4.3, account §4.4, payments §4.6, actions §5.2, `index.ts` con una sola línea y re-exports desde `mercadopagoAccount.ts`)
- C3 arquitectura (core puro sin `node:*`, operaciones compartidas en `domain`): [x]
- C3 web y bot compilan y los consumidores están ajustados: [x] (`workers.ts` usa `skipped`, `conversation.ts`, el script sandbox; el webhook no cambia)
- C3 migración coherente y aditiva: [x]
- C3 rutas nuevas protegidas por auth: [x] (middleware + `auth()` + `allowedEmails` en el callback; las server actions viven bajo `/ajustes`, que está protegido)
- C3 bot en silencio fuera de sesión y textos = SDD: [x] (`DEPOSIT_UNAVAILABLE`, `professionalDepositUnavailableAlert` y `MERCADOPAGO_DISCONNECTED_ALERT` literales; las alertas van por outbox a `phoneJid`, solo en `BOOK_CONFIRM` o por incidente)
- C3 sin console.log de debug ni TODOs: [x] (solo los `console.error` saneados que pide la SDD)
- C4 typecheck limpio: [x]
- C4 tests de core y `npm run test`: [x]
- C4 flujo del bot simulado sin WhatsApp y limpieza por id: [x] (tests de `conversation-booking`; la base de dev quedó limpia según la consulta de lectura)
- C4 PDF/documento: [x] no aplica
- C5 `impl_HU-023.md` existe: [x]
- C5 `review_HU-023.md` con veredicto: [x]
- C5 sin scripts sueltos ni datos de prueba: [x] (los scripts quedaron en el scratchpad, fuera del repo; la base está en 0)

## Cambios requeridos (si CHANGES_REQUESTED)
Ninguno.

## Dudas (no bloqueantes)
1. **Falso "revocado" en el webhook con un pago de la cuenta anterior.** `syncMercadoPagoPayment`
   sin credenciales explícitas usa la cuenta `current` (`payments.ts:121-125`). Si después de
   cambiar de cuenta llega un webhook firmado de un pago de la cuenta vieja (R6: el paciente pagó
   igual) y MP contesta **401** a `Payment.get` con el token de la cuenta nueva, en vez de 404,
   `withRevocationGuard` marcaría la cuenta nueva como `revoked` y la profesional tendría que
   reconectar sin motivo. No sé si MP responde 401 o 404 en ese caso. Conviene mirarlo en el paso 6
   de la prueba manual. Si es 401, solo marcar `revoked` en `createDepositCheckout`, en la
   conciliación y en el refresh, no en el webhook.
2. **Carrera de renovación al usar el token.** Si dos procesos encuentran el token vencido al mismo
   tiempo, el segundo recibe `not_needed` y `getMercadoPagoCredentials` devuelve null
   (`mercadopagoAccount.ts:410-411`). Así lo dice la SDD literalmente, pero en ese caso un paciente
   podría recibir `DEPOSIT_UNAVAILABLE` una vez. Es poco probable porque el cron renueva 30 días
   antes. Mejora posible: tratar `not_needed` como éxito y releer.
3. `completeMercadoPagoOAuth` puede tirar por errores de la base (`saveConnection`), y la ruta no lo
   captura (`callback/route.ts:20`). En producción Next muestra un 500 genérico, sin detalles. Sería
   más prolijo redirigir con `mp=rejected`.
4. Si no hay `phoneJid`, `notifyMercadoPagoMissingForBooking` igual consume el tope de 24 h
   (`mercadopagoAccount.ts:523-528`). No tiene efecto práctico porque no hay a quién avisar.
5. Pendiente para el PR (no es parte de esta revisión): agregar
   `MERCADOPAGO_ACCOUNT_CHANGED_CANCEL_REASON` a `DEPOSIT_AUTO_CANCEL_REASONS` si HU-021 entra antes,
   y el bloque de `deploy/.env.example` cuando #52 esté en `develop` (está anotado en
   `impl_HU-023.md`). Falta el recorrido visual y la prueba manual con usuarios de prueba (§11.6).
