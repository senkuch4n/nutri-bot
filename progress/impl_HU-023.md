# impl HU-023 · Conectar la cuenta de Mercado Pago de la profesional (OAuth)

- Estado: **done**
- SDD: `Refactorizaciones/mercadopago-oauth.md` · HU: `docs/hu-mercadopago-oauth.md` (Resoluciones D1–D14)
- Rama: `feat/HU-023-mercadopago-oauth` (sin push). Skills aplicados: `skills/migracion-prisma.md`,
  `apple-design`, `web-design-guidelines` (autochequeo al final).
- Implementer: Claude Opus 5.5.

## Commits (uno por tarea lógica, trailer `Co-Authored-By`)

| Commit | Qué |
|---|---|
| `bde9836` | db: schema + migración `20261113020849_mercadopago_oauth` |
| `113003f` | core: `mercadopago-oauth.ts` (+test), 3 textos en `messages.ts`, `SETTINGS_TEXT` |
| `3773ba3` | domain: `secretBox`, `mercadopagoOAuthClient`, `mercadopagoAccount` (+tests), `payments.ts`, privacidad |
| `0f684e8` | bot: `handleBookConfirm`, cron diario, sandbox |
| `7697962` | web: callback, server actions, Ajustes → Mercado Pago, Servicios |
| `e8b0225` | docs: `.env.example`, `README.md` |

## Archivos

**Creados**
- `packages/core/src/mercadopago-oauth.ts`, `mercadopago-oauth.test.ts`
- `packages/db/domain/secretBox.ts`, `secretBox.test.ts`
- `packages/db/domain/mercadopagoOAuthClient.ts`, `mercadopagoOAuthClient.test.ts`
- `packages/db/domain/mercadopagoAccount.ts`, `mercadopagoAccount.test.ts`
- `packages/db/domain/mercadopago-privacy.test.ts`
- `packages/db/prisma/migrations/20261113020849_mercadopago_oauth/migration.sql`
- `apps/web/src/app/api/mercadopago/oauth/callback/route.ts`, `route.test.ts`
- `apps/web/src/app/(panel)/ajustes/mercadopago-section.tsx`, `mercadopago-actions.test.ts`

**Editados**
- `packages/db/prisma/schema.prisma`, `packages/db/domain/{payments.ts,payments.test.ts,index.ts}`
- `packages/core/src/{messages.ts,messages.test.ts,settings-options.ts,settings-options.test.ts,index.ts}`
- `apps/bot/src/{conversation.ts,conversation-booking.test.ts,workers.ts,workers.test.ts}`, `apps/bot/scripts/test-mercadopago-sandbox.ts`
- `apps/web/src/app/(panel)/ajustes/{actions.ts,ajustes-tabs.tsx,page.tsx,settings-ui.tsx,actions.test.ts,logo-actions.test.ts}`
- `apps/web/src/app/(panel)/servicios/{page.tsx,service-form.tsx,new-service-button.tsx,service-card.tsx}`
- `apps/web/src/middleware.test.ts`, `.env.example`, `README.md`

No se tocaron: webhook de MP, `mercadopago-signature.ts`, `professionalSelect.ts`, `Professional`,
`auth.ts`, `auth.config.ts`, `middleware.ts`, `/pagos`, `backlog/**`, el `catch` de
`createDepositCheckout` ni `expireStalePendingPayments`, `deploy/`.

## Migración

- Antes: `git fetch` (la rama ya contenía `origin/develop`); único issue abierto con label
  `migración` es el #53 (esta HU). `migrate status` → up to date, sin drift.
- Respaldo: `~/nutribot-backups/pre-HU-023-20261112230820.dump` (`pg_dump -Fc` desde el contenedor).
- `prisma migrate dev --create-only --name mercadopago_oauth` → SQL revisado: exactamente lo de §3.2
  (`ALTER TABLE "Payment" ADD COLUMN "mercadopagoUserId" TEXT`, `CREATE TABLE` de las 2 tablas,
  unique `MercadoPagoOAuthState_stateHash_key`, índice `MercadoPagoOAuthState_expiresAt_idx`). Sin
  DROP, sin cambios de tipo, sin INSERT. Aplicada con `npm run db:migrate`; `npm run db:generate`.
- Después: `migrate status` → "27 migrations found … Database schema is up to date!".
- Nota: un `prisma format` reformateó todo el schema; lo revertí (`git checkout`) y reapliqué solo el
  cambio, así el diff del schema son 52 líneas agregadas.

## Verificación

- `npm run typecheck`: core, db, bot y web limpios.
- `npm run test`: **176 archivos, 2657 tests OK**.
- Tests nuevos/relevantes: core `mercadopago-oauth` + `messages` + `settings-options`; db `secretBox` (8),
  `mercadopagoOAuthClient` (16), `mercadopagoAccount` (40), `payments` (40), `mercadopago-privacy` (4);
  bot `conversation-booking` (8), `workers` (20); web callback `route` (9), `mercadopago-actions` (6),
  `middleware` (9), y los de `ajustes/actions` y `logo-actions` siguen verdes.
- `grep -rn "accessTokenEnc\|refreshTokenEnc" apps/web/src apps/bot/src` → vacío.
- `./ops/harness/verify.sh` → "Arnés OK" (único WARN: el recordatorio de siempre por tocar el bot).
- Todo con `fetch` mockeado: ninguna llamada a la API real de Mercado Pago, ningún pago.

**Pruebas contra la Postgres local (scripts fuera del repo, en el scratchpad de la sesión):**
1. Smoke del dominio con `fetch` falso: `startMercadoPagoOAuth` → `completeMercadoPagoOAuth` real
   (`DELETE … RETURNING` con fechas: vencido → `invalid_state`, OK → `connected`, reuso →
   `invalid_state`), `getMercadoPagoCredentials`, `refreshMercadoPagoAccountToken` con el
   `FOR UPDATE` real (`not_needed` y luego `refreshed` con `expiresAt` ~180 días), vista, el
   `UPDATE … RETURNING` del tope de 24 h (en transacción revertida) y `disconnectMercadoPagoAccount`
   (filtro D6 real de Prisma; 0 señas). Solo tocó la fila id=1 de `MercadoPagoAccount` (no existía
   antes; el script lo verifica) y sus propios `MercadoPagoOAuthState`; borrados al final (0|0).
2. Simulación del bot sin WhatsApp: paciente/servicio con seña/estado `BOOK_CONFIRM` propios →
   `handleIncoming(jid, "sí")` responde exactamente `DEPOSIT_UNAVAILABLE`, no crea turno, vuelve a
   `MENU`, marca `missingAlertAt`. Se verificó antes que `Professional.phoneJid` es null en dev
   (no se encola ninguna alerta) y `MERCADOPAGO_ALLOW_ENV_TOKEN=false`. Limpieza por ids → 0 filas.
   No se escribió ningún `OutboundMessage`. Bot no corriendo (`ps`).

**Recorrido visual:** no hecho. El login de Google no se puede automatizar, y el middleware redirige
antes de compilar la página sin sesión. Typecheck + tests cubren los componentes; falta mirar
Ajustes → Mercado Pago (4 estados) y el aviso de Servicios en el navegador.

## Contrato compartido

Las firmas coinciden con §4 de la SDD: `packages/core/src/mercadopago-oauth.ts` (constantes, tipos,
11 funciones, `MERCADOPAGO_TEXT` con los valores exactos de §6.1), `secretBox.ts`
(`MercadoPagoConfigError`, `SecretDecryptError`, `loadMercadoPagoTokenKey`, `sealSecret`,
`openSecret`, `SECRET_AAD`), `mercadopagoOAuthClient.ts` (`MercadoPagoHttpDeps`,
`MercadoPagoAppConfig`, `getMercadoPagoAppConfig`, `MercadoPagoApiError{status,code,kind}`,
`exchangeMercadoPagoCode`, `refreshMercadoPagoToken`, `fetchMercadoPagoUser`),
`mercadopagoAccount.ts` (`MercadoPagoUnavailableError`, `MercadoPagoCredentials`,
`MercadoPagoConnectionView`, `getMercadoPagoConnectionView`, `startMercadoPagoOAuth`,
`completeMercadoPagoOAuth`, `disconnectMercadoPagoAccount`, `getMercadoPagoCredentials`,
`isMercadoPagoCheckoutAvailable`, `refreshMercadoPagoAccountToken`, `markMercadoPagoAccountError`,
`notifyMercadoPagoMissingForBooking`), `payments.ts` (`syncMercadoPagoPayment(paymentId,
expectedInternalId?, credentials?)`, `reconcilePendingPayments` → `{ processed, failed, skipped }`),
server actions `connectMercadoPagoAction` / `disconnectMercadoPagoAction`, ruta `GET` del callback,
mensajes `DEPOSIT_UNAVAILABLE`, `professionalDepositUnavailableAlert`,
`MERCADOPAGO_DISCONNECTED_ALERT`. `domain/index.ts` lleva solo
`export * from "./mercadopagoAccount";` (después de `./mercadopago-signature`); `mercadopagoAccount.ts`
re-exporta `MercadoPagoConfigError`, `MercadoPagoApiError`, `getMercadoPagoAppConfig` (y los tipos
`MercadoPagoHttpDeps`/`MercadoPagoAppConfig`). `secretBox` no se exporta.

## Decisiones no obvias

1. **`settings-ui.tsx`** (no listado en la SDD): `SettingsSection` suma `"mercadopago"`; sin eso no
   compila `dirty.has(t.value)` en `ajustes-tabs.tsx`.
2. **Aviso transversal en Ajustes:** el `banner` actual es server y no sabe qué sección está abierta,
   así que `AjustesTabs` suma una prop `mercadoPagoBanner`, que se muestra después del de WhatsApp y
   se oculta cuando la sección activa es Mercado Pago (tal como pide §8.7).
3. **`actions.test.ts` y `logo-actions.test.ts`**: como `actions.ts` ahora importa `@/auth` y
   `@nutri-bot/db/domain`, se les agregó `vi.mock("@/auth")` y `vi.mock("@nutri-bot/db/domain")`
   (si no, next-auth no carga en vitest). No cambia ningún caso.
4. **`disconnectMercadoPagoAction`** también exige sesión (`redirect("/inicio")`), como barrera extra.
5. **`getMercadoPagoCredentials` sin `MERCADOPAGO_TOKEN_KEY`** (cuenta guardada pero falta la clave):
   devuelve null **sin** marcar `decrypt_failed`. Es un problema de configuración (Ajustes ya muestra
   "No disponible"), y marcarlo obligaría a reconectar después de arreglar el `.env`.
6. **`completeMercadoPagoOAuth`**: si el verifier guardado no se puede descifrar (clave rotada en esos
   10 min) → `invalid_state`. Cualquier error del canje (no solo `MercadoPagoApiError`) → `rejected`,
   con log saneado `{ status, code }`.
7. **`markMercadoPagoAccountError` sin cuenta vinculada** no hace nada (no hay incidente que marcar).
   Si no hay `phoneJid`, se marca el error y `errorNotifiedAt` queda null.
8. **Refresh:** si `expiresAt` es null se trata como "hay que renovar". La respuesta del refresh
   actualiza `scope`/`liveMode` solo si vinieron; `userId` no se toca.
9. **D6:** el filtro es `AND: [{ mercadopagoUserId: { not: null } }, { NOT: { mercadopagoUserId: keep } }]`
   (no un `{ not: keep }` suelto, para no depender de cómo Prisma trata los null). `pendingDepositCount`
   cuenta pagos con el mismo filtro + turno `AWAITING_PAYMENT`.
10. **`MercadoPagoApiError.code`** solo guarda códigos con forma de identificador (`/^[a-z0-9_.-]{1,64}$/i`),
    para que nada del body crudo termine en el error.
11. **Tope de 24 h**: el `UPDATE … RETURNING` usa un `cutoff` calculado en JS (`now - 24h`) en vez de
    `interval '24 hours'`: misma semántica, todo con parámetros Date (verificado contra la base real).
    `notifyMercadoPagoMissingForBooking` va en una transacción: si falla el encolado, no queda
    consumido el tope.
12. **UI** (`apple-design` + `web-design-guidelines`): `GroupedList` / `StatusValue` / `Alert` /
    `useConfirm` existentes, sin componentes nuevos. "No conectada" en gris (neutro) salvo que haya
    servicios con seña (ahí `StatusValue ok={false}`). En "Hay que reconectar", el `Alert` danger
    lleva **Reconectar** y abajo solo queda **Desconectar**. El banner del callback entra y sale con
    fade (`fades.fast`; con movimiento reducido, `duration: 0`), saca `mp` de la URL con
    `replaceUrlInRouter` y se oculta a los 8 s (también los de error, como pide la SDD). Nickname/email
    con `translate="no"`, `break-all` y ancho máximo (la celda de valor de `GroupedListRow` es
    `shrink-0`); user_id con `translate="no"` y `tabular-nums`. "Conectada el" usa
    `Intl.DateTimeFormat("es-AR", { dateStyle: "long", timeZone })`, renderizado en el servidor.
    La nota del formulario de servicio es un `<p>` con `Link` (con foco visible) que no bloquea guardar.

## Impacto en dev al hacer pull (para avisar)

Con este cambio, sin cuenta vinculada y sin `MERCADOPAGO_ALLOW_ENV_TOKEN=true`, el bot local
contesta `DEPOSIT_UNAVAILABLE` a los servicios con seña (D3). Para probar como antes hay que conectar
un vendedor de prueba o poner `MERCADOPAGO_ALLOW_ENV_TOKEN=true` en el `.env` de dev.

## Para el PR / rebase

- **HU-021 (#50)**: si `DEPOSIT_AUTO_CANCEL_REASONS` ya está en `develop` al rebasear, sumar
  `MERCADOPAGO_ACCOUNT_CHANGED_CANCEL_REASON` a esa lista y a su test (§12.1). `payments.ts` no toca
  los literales de `cancelReason`.
- **PR #52**: `deploy/.env.example` no existe en `develop` (verificado con `git ls-tree origin/develop
  deploy/.env.example`), así que no se creó. Tras el rebase con #52 mergeado, reemplazar el bloque
  `MERCADOPAGO_*` por:

```bash
MERCADOPAGO_CLIENT_ID=
MERCADOPAGO_CLIENT_SECRET=
#  openssl rand -base64 32   (si cambia, hay que reconectar Mercado Pago en Ajustes)
MERCADOPAGO_TOKEN_KEY=
MERCADOPAGO_WEBHOOK_SECRET=
MERCADOPAGO_NOTIFICATION_URL=https://${DOMAIN}/api/webhooks/mercadopago
MERCADOPAGO_RETURN_URL=
```

## Prueba manual (la hace Joel, sin plata real ni WhatsApp real), §11.6

1. Dev con HTTPS público para el callback: túnel (`cloudflared tunnel --url http://localhost:3100`),
   `AUTH_URL=<url del túnel>`, la redirect URI `<túnel>/api/mercadopago/oauth/callback` registrada en
   "Numa" (con PKCE habilitado) y `<túnel>/api/auth/callback/google` en el cliente OAuth de Google de
   dev. Cargar `MERCADOPAGO_CLIENT_ID`, `MERCADOPAGO_CLIENT_SECRET`, `MERCADOPAGO_TOKEN_KEY`
   (`openssl rand -base64 32`). **Bot apagado** (o con número propio).
2. Ajustes → Mercado Pago → Conectar → login con el **usuario de prueba vendedor** → vuelve con
   "Cuenta de Mercado Pago conectada." y muestra nickname / user_id. Anotar el `liveMode` guardado:
   define si D8 bloquearía usuarios de prueba en producción (riesgo R3).
3. Repetir y tocar "Cancelar" en MP → banner de cancelada. Recargar la URL del callback ya usada →
   "No pudimos verificar la conexión".
4. `MERCADOPAGO_SANDBOX=true npm run test:mercadopago-sandbox --workspace apps/bot` → pagar con el
   **comprador de prueba** → PASS; el `Payment` tiene `mercadopagoUserId` = user_id del vendedor.
5. Con el link de una seña abierto (paso 4 sin pagar), "Desconectar" → la confirmación avisa "Hay 1
   seña…"; el turno queda CANCELLED y hay un `CANCELLATION` en `OutboundMessage` → **borrarlo por id**
   antes de prender el bot.
6. Verificar el webhook firmado de un pago del vendedor de prueba (R2): si llega 401
   `invalid_signature`, anotarlo; la conciliación de cada minuto confirma igual.
7. Renovación: `UPDATE "MercadoPagoAccount" SET "expiresAt" = now() + interval '10 days' WHERE id = 1`
   y correr una vez `refreshMercadoPagoAccountToken()` desde un script tsx → `"refreshed"` y
   `expiresAt` a ~180 días.
8. Recorrido visual de Ajustes → Mercado Pago (no configurada / sin cuenta / conectada / hay que
   reconectar), el aviso en `/servicios` y en Ajustes (otra sección), y la nota bajo "Pide seña".
