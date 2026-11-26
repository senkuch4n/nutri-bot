# impl · HU-028a · Mercado Pago de señas por consultorio

Estado: **done** · rama `feat/HU-028-integraciones-por-consultorio` · SDD `Refactorizaciones/integraciones-por-consultorio.md`
Skills aplicados: `skills/migracion-prisma.md`, `web-design-guidelines` (autochequeo de Ajustes → Mercado Pago).

## Commits (uno por bloque del checklist, sin trailer de IA)

| Commit | Bloque | Checklist |
|---|---|---|
| `5299bfd` feat(db): MercadoPagoAccount por consultorio y state de OAuth atado a persona y consultorio | schema + migración | 1–8 |
| `cbc4686` feat(core): resultado account_in_use, user_id de la notificación y cuenta de plataforma | core | 9–10 |
| `b286a79` feat(db): cuenta de MP por consultorio, state por persona y webhook por user_id | dominio | 11–20 |
| `1c9a317` test(db): probe de MP por consultorio y migración con datos tipo producción | probes | 21–22 |
| `e435caa` feat(web): MP solo para el OWNER, state por userId y webhook por user_id del cuerpo | web | 23–25, 27 |
| `ff51f7f` feat(web): en Ajustes, los botones de MP solo los ve el OWNER | web UI | 26 |
| `5c4c6cd` feat(bot): conciliación, vencimiento y renovación de MP por consultorio | bot | 28–29 |
| `766c5c3` docs: nota de deploy de MP por consultorio y ARZIUM_MERCADOPAGO_USER_ID | cierre | 30 |

No se commiteó nada ajeno (`.claude/settings.json`, `progress/current-senkuch4n.md`, `backlog/*`, `.whatsapp-auth.vieja*`, docs de HU-029 quedan sin tocar).

## Archivos tocados

- `packages/db/prisma/schema.prisma` (§4.1; sin reformatear el resto del archivo)
- `packages/db/prisma/migrations/20261125234554_mercadopago_account_per_tenant/migration.sql` (SQL exacto de §4.2)
- `packages/core/src/mercadopago-oauth.ts` (+ `.test.ts`). `index.ts` ya reexporta el archivo entero: sin cambios.
- `packages/db/domain/mercadopagoAccount.ts` (+ `.test.ts`, mock en memoria reescrito a varias filas con `tenantId`/`userId` únicos)
- `packages/db/domain/payments.ts` (+ `.test.ts`), `packages/db/domain/mercadopago-privacy.test.ts`
- `packages/db/scripts/tenant-isolation-b2.integration.ts` (fixture por `tenantId`; caso C/D según §9)
- `packages/db/scripts/mercadopago-per-tenant.integration.ts` (nuevo, §11.3), `packages/db/scripts/test-mercadopago-per-tenant.sh` (nuevo, §11.4), `packages/db/package.json` (`test:mp-tenants`)
- `apps/web/src/app/(panel)/ajustes/actions.ts`, `mercadopago-actions.test.ts`, `page.tsx`, `page.test.tsx`
- `apps/web/src/app/api/mercadopago/oauth/callback/route.ts` (+ test), `apps/web/src/app/api/webhooks/mercadopago/route.ts` (+ test)
- `apps/web/src/guard-coverage.test.ts` (`ROUTE_GUARDS` + `requireOwnerContext(`)
- `apps/bot/src/workers.ts` (+ test)
- `.env.example` (`ARZIUM_MERCADOPAGO_USER_ID=` vacía, comentario), `deploy/README.md` (nota de deploy §12)
- No se tocó `conversation.ts`, `secretBox.ts`, `mercadopagoOAuthClient.ts`, `mercadopago-signature.ts`, `middleware.ts`, `auth.ts`, `auth.config.ts`, `test-mercadopago-sandbox.ts` (sigue compilando).

## Migración

- `pg_dump` previo fuera del repo: `~/nutribot-dev-pre-028a.dump` (4 MB).
- `prisma migrate status` previo: al día, sin drift. Lectura previa en dev: **0 filas** en `MercadoPagoAccount` y 0 states (nada que preservar en dev; el caso "fila de producción" se probó en Postgres descartable).
- **Desvío del paso 5:** `prisma migrate dev --create-only` se negó a correr ("environment is non-interactive", por el warning del `UNIQUE(userId)`). En vez de forzar una TTY, generé el SQL de Prisma con `migrate diff --from-url <Postgres descartable> --to-schema-datamodel` (contenedor efímero con las 40 migraciones previas; nunca contra la base de dev) y escribí la carpeta de migración a mano con el SQL de §4.2. Diferencias con lo que genera Prisma: el `DO $$` fail-closed, el `setval`, el `DELETE` de states, y el nombre de la secuencia (`"MercadoPagoAccount_id_seq"` en vez del `mercadopagoaccount_id_seq` sin comillas de Prisma). Prisma no genera `DROP/ADD CONSTRAINT` de las FK de `tenantId`. **Drift vacío** (exit 0) en el descartable antes de aplicar, y otra vez en `test:mp-tenants` paso 6.
- Revisado: sin `DROP COLUMN`/`DROP TABLE`. Aplicado con `npm run db:migrate`, después `npm run db:generate`. `migrate status` después: "Database schema is up to date!". En dev, `nextval` sin consumir (`last_value 1, is_called f`).

## Contrato compartido (§5): firmas confirmadas

- core: `MercadoPagoCallbackResult` + `"account_in_use"`; `MERCADOPAGO_TEXT.callback.account_in_use` con el texto exacto; `parseMercadoPagoNotificationUserId(body: unknown): string | null`; `isPlatformMercadoPagoUserId(userId, env): boolean`.
- `mercadopagoAccount.ts`: eliminados `ACCOUNT_ID`, `singletonHasUnverifiedOwner`, `resolveMercadoPagoWebhookTenant`. `startMercadoPagoOAuth(t, actor: { userId }, deps?)`, `completeMercadoPagoOAuth(t, { userId, query }, deps?)`, `resolveMercadoPagoWebhookAccount(notifiedUserId, env = process.env)`, `listConnectedMercadoPagoTenants()`. Internos `ensureAccountRow(tx, now, tenantId)` con `ON CONFLICT ("tenantId") DO NOTHING` y `lockAccountRow(tx, t, now, { create })`. El resto de las firmas, sin cambios.
- `payments.ts`: `handleMercadoPagoWebhook(query, { userId }) : Promise<"processed" | "ignored">`, `listTenantsWithPendingMercadoPagoPayments()`. `syncMercadoPagoPayment` sin cambio de firma.
- Todo `update` de la cuenta es `where: { tenantId }` (el mock del test tira si llega un `id`).

## Decisiones no obvias

- **P2002 en `saveConnection`:** se detecta por forma (`code === "P2002"` y `meta.target` incluye `userId`) en vez de `instanceof Prisma.PrismaClientKnownRequestError`, porque los tests de dominio mockean `../index` sin `Prisma`. Dentro de la transacción se convierte en un error propio que la revierte entera (sin tokens pisados ni señas canceladas) y afuera devuelve `"account_in_use"`. El probe A/B confirma `UNIQUE(userId)` real (23505).
- **`account_in_use` consume el state:** el chequeo va después del canje (orden de §5.2.3), así que el state ya se gastó. Es lo esperado (un solo uso); el probe compara la base sin contar la tabla de states.
- **`resolveMercadoPagoWebhookAccount`:** si hay una fila con ese `userId` pero sin `accessTokenEnc`, devuelve `null` (no cae al respaldo de dev, porque §5.2.10 lo exige solo si "ninguna fila" tiene ese `userId`).
- **Webhook:** el cuerpo se lee siempre en POST con `req.json().catch(() => null)`. Por eso un cuerpo ilegible ya no loguea error: llama a `handleMercadoPagoWebhook(query, { userId: null })`, que sin `type` devuelve `"ignored"`. Se ajustó el test que antes esperaba que no se llamara a handle. `handle` llega un tick después (se ajustó con `vi.waitFor` el test de "200 mientras la conciliación sigue").
- **Callback, `owner_only`:** redirige a `?mp=invalid_state` sin consumir el state ni canjear. Otros `TenantAccessError` → `/inicio`.
- **Ajustes:** para un STAFF no se renderiza el contenedor de botones (no queda un `div` vacío con margen). No hay textos nuevos de UI salvo el banner `account_in_use` (texto de core), que sale con el tono `danger` que ya usa el banner para lo que no es `connected`/`denied`. Autochequeo `web-design-guidelines` (reglas traídas de vercel-labs/web-interface-guidelines): sin hallazgos en el cambio (sin contenedores vacíos, se conservan `translate="no"`/`tabular-nums`, botones nativos con confirmación para desconectar sin cambios).
- **Bot:** `uniqueTenants` es local en `workers.ts`. Un throw de la lista de consultorios en la renovación loguea `"Error renovando Mercado Pago"` sin `tenantId` y no sigue.

## Verificación (resultados reales, 2026-11-25)

| Comando | Resultado |
|---|---|
| `npm run db:generate` | OK |
| `npm run typecheck` | 0 errores en core, db, web y bot |
| `npm run test` | 228 archivos OK, 1 omitido; **3963 tests OK**, 1 omitido |
| `npx vitest run packages/core/src/mercadopago-oauth.test.ts packages/db/domain apps/web/src/app/api/mercadopago apps/web/src/app/api/webhooks/mercadopago "apps/web/src/app/(panel)/ajustes" apps/web/src/guard-coverage.test.ts apps/bot/src/workers.test.ts` | 1286 tests OK |
| `npm run test:mp-tenants --workspace packages/db` | OK: fila id=1 intacta (md5 de tokens, userId, expiresAt, liveMode), descifra con la clave de prueba, `nextval` = 2, states = 0, `Payment.mercadopagoUserId` igual, `tenantId` NOT NULL en ambas tablas; variante con `tenantId` NULL aborta y la tabla queda igual (y la columna sigue nullable); probe A/B **11/11**; drift vacío en las dos bases |
| `bash packages/db/scripts/test-tenant-isolation.sh` | OK (M1–M3 y b2 ajustado: 14/14) |
| `npx prisma migrate status` (con `.env` de la raíz) | "Database schema is up to date!" |
| `npm run test:confirm-flow --workspace apps/bot` | 8/8 escenarios OK |
| `npm run test:booking-reason --workspace apps/bot` | 17/17 escenarios OK, datos borrados por id |
| `npm run build --workspace apps/web` | OK |
| `./ops/harness/verify.sh` | "Arnés OK." (WARN informativo: se tocó el bot) |

RED observado: tests de core (16 fallando antes de implementar), y el test STAFF de `page.test.tsx` (3 fallando contra el `page.tsx` anterior).

Datos de dev: solo lecturas más las dos simulaciones del bot, que limpian por id. Después: `MercadoPagoAccount` 0 filas, `MercadoPagoOAuthState` 0 filas, igual que antes. No se levantó el bot, no se mandó ningún WhatsApp, ninguna llamada real a Mercado Pago (todo con `deps.fetch` o mocks; en el probe, `globalThis.fetch` queda bloqueado).

## Supuestos de §14

- **`mpPayment.collector_id` en el SDK `mercadopago`:** **confirmado** (`collector_id?: number` en `dist/clients/payment/commonTypes.d.ts`). El chequeo está implementado y tiene test.
- **El cuerpo de la notificación de pagos trae `user_id` del vendedor:** **sin confirmar** (no se puede sin una notificación real de MP; queda para el primer pago real o el sandbox manual, ver la nota en `deploy/README.md`). Si no viniera, el webhook ignora con `unknown_account` y la conciliación del bot (cada minuto, por consultorio) confirma la seña. Ningún pago se pierde, solo se demora. **Avisar al orquestador:** validar en el primer pago después del deploy.

## Bloqueos

Ninguno. Pendiente fuera del alcance del implementer: los SELECT de solo lectura en producción antes de mergear a `main` (§12) y el sandbox manual opcional (`test:mercadopago-sandbox`).
