# impl HU-029b · Suscripción de Arzium: alta, autorización, cancelación y estado

Estado: **done** · rama `feat/HU-029b-suscripcion` (worktree `../Nutri-Bot-HU029b`, desde `origin/develop` afe6e50) ·
issue #72 · SDD `Refactorizaciones/suscripcion-arzium-mercadopago.md` Parte B (con B.0 R1–R16) · modelo opus ·
skills `skills/migracion-prisma.md`, `skills/ui.txt`, más `ui-ux-pro-max`, `ui-styling` y `web-design-guidelines`.
Sin push. 15 commits (conventional, sin trailer). `backlog/HU-029.json` tenía cambios del orquestador antes de
empezar: no lo toqué. Este archivo queda sin commitear (es del arnés).

## Commits

| Commit | Qué |
|---|---|
| 0c5f493 | `feat(db)`: esquema (§B.4.1) + migración `20261127213351_tenant_subscriptions` |
| af70f22 | `feat(core)`: `subscription-billing.ts` + 115 tests |
| 5d65d43 | `feat(db)`: `subscriptionsGateway.ts`, `subscriptions.ts`, exports, `mercadopagoAccount.ts` (§B.5.7) + tests |
| 453b82d | `feat(db)`: script `subscription-plans.ts` (+ test de argumentos) y scripts npm |
| 03920e7 | `fix(db)`: gate y vista prefieren la suscripción no terminada (lo encontró el probe) |
| 417ac55 | `test(db)`: probe en Postgres descartable |
| 9e44b7f | `feat(web)`: integración HU-026 (adapter, `tenant-context`, middleware, gate real, `PanelShell`, layout `(suscripcion)`) |
| 3699ac9 | `feat(web)`: pantalla, acciones, `guard-coverage` |
| d17a028 | `feat(web)`: pestaña Suscripción en Ajustes |
| 0036944 | `feat(web)`: webhook de suscripciones + regresión del webhook de señas |
| 2eda377 | `feat(bot)`: cron `*/10` de conciliación + arranque |
| f8cd3dc | `docs`: `.env.example`, `deploy/README.md` |
| 61a5135 | `fix(web)`: autochequeo de accesibilidad (`web-design-guidelines`) |
| fd84343, 0e47522 | ajustes de tests (privacidad del token, grep de `validationCharge`) |

## Migración `tenant_subscriptions`

- Antes: `git fetch`, sin migraciones nuevas en develop (la última era `20261127190208_ai_usage_per_tenant`).
  `prisma migrate status` → "Database schema is up to date!" (sin drift). `pg_dump` de dev en
  `~/nutribot-dev-pre-029b.dump` (fuera del repo, 4 MB; hecho con `docker exec nutri-bot-db-1` porque
  `docker compose` desde el worktree usa otro nombre de proyecto).
- Creada con `--create-only`. SQL generado revisado: solo `CREATE TYPE` (6 enums), `CREATE TABLE` (4 tablas
  nuevas), `CREATE INDEX`, `ADD CONSTRAINT … FOREIGN KEY` (todas `ON DELETE RESTRICT ON UPDATE CASCADE`, desde las
  tablas nuevas). Ningún `DROP` ni `ALTER` de tablas existentes. Agregado a mano al final el bloque de §B.4.2:
  índices parciales `TenantSubscription_open_per_tenant_key` y `SubscriptionPlan_default_per_mode_key`, CHECK de
  plan (importe, frecuencia, prueba completa, ciclos) y de suscripción (prueba completa, `trial_granted`,
  `payer_email_transient`, `payer_email_length`), y el `INSERT` de los dos planes mensuales ($60.000, 7 días,
  `LIVE` y `SANDBOX`) con `ON CONFLICT DO NOTHING`.
- Aplicada con `prisma migrate dev` (sin reset ni drift) + `npm run db:generate`. Lecturas en dev: 2 filas en
  `SubscriptionPlan` (`mensual | LIVE/SANDBOX | 60000.00 | 7 | DAYS | t`) y 2 CHECK `TenantSubscription_payer_email%`.
- Al editar el schema, `prisma format` me reformateó todo el archivo: lo revertí y apliqué solo las líneas nuevas
  (el diff de `schema.prisma` es puramente aditivo).

## Checklist §B.11

- [x] 1–7 schema + migración (arriba).
- [x] 8–9b core: RED observado (el módulo no existía), GREEN. `ALLOWED_MONTH_FREQUENCIES = [1, 3, 6, 12]`,
  `PLAN_BILLING_CYCLES_SUPPORTED = false`, `MP_MIN/MAX_AMOUNT_ARS`, `free_trial` objeto (S15),
  `normalizePayerEmail`, `classifyPreapprovalCreateError`, `resolveTrialEnd`, `isCheckoutStale` +
  `STALE_CHECKOUT_TRIAL_LOSS_MS = 1 h` (DP1), meses de prueba de 30 días, `trial_mismatch`, `amount_out_of_range`,
  textos de §B.7 sin `validationCharge`.
- [x] 10 gateway: `payer_email` obligatorio; `maxRetries: 0` en **todas** las llamadas y un `MercadoPagoConfig`
  nuevo por llamada (ver decisiones).
- [x] 11–16 dominio. Tests escritos sobre el borrador (no RED estricto en este paso; RED estricto sí en
  `mercadopagoAccount`): 82 casos con un Prisma en memoria que impone el índice parcial y el CHECK del email, y
  un MP falso cuyo `createPreapproval` ignora la idempotency key (cubre todos los casos de §B.9.2).
- [x] 17 `resolveMercadoPagoWebhookAccount`: `user_id` de Arzium → `null` antes de buscar fila o respaldo `.env`
  (RED → GREEN).
- [x] 18 exports en `domain/index.ts` (`export * from "./subscriptions"` + `SubscriptionBillingUnavailableError`,
  `type ArziumMercadoPagoGateway`; el factory no se reexporta).
- [x] 19 script de planes + `npm run subscription-plans` (no se corrió contra ninguna base).
- [x] 20 probe: `test-tenant-subscriptions.sh` + `tenant-subscriptions.integration.ts` + `npm run test:subscriptions`.
- [x] 20b–20d integración HU-026 (sección propia abajo).
- [x] 21–25 web: acciones, página y componentes, pestaña, webhook, matcher, `guard-coverage`.
- [x] 26 bot.
- [x] 27 `.env.example`, `deploy/README.md`.
- [x] Ítem del anexo: `getTenantSubscriptionGate` + `hasVerifiedSubscriptionAuthorization` con tests de cobro
  apagado, autorizada verificada, pendiente/cancelada, "`?mp=volver` no la cambia" y base caída → tira.
- [x] 28 verificación (abajo).

## Archivos

Nuevos: `packages/core/src/subscription-billing{,.test}.ts`; `packages/db/domain/subscriptionsGateway.ts`,
`subscriptions{,.test}.ts`, `subscriptions-privacy.test.ts`; `packages/db/scripts/subscription-plans{,.test}.ts`,
`tenant-subscriptions.integration.ts`, `test-tenant-subscriptions.sh`; migración; `apps/web/src/app/(suscripcion)/`
(`layout{,.test}.tsx`, `ajustes/suscripcion/{page,page.test,subscription-screen,subscription-confirming,plan-option-card,payer-email-field,loading}.tsx`,
`{actions,actions.test,subscription-model}.ts`); `apps/web/src/components/shell/panel-shell.tsx`;
`apps/web/src/app/api/webhooks/mercadopago-suscripciones/route{,.test}.ts`.

Modificados: `schema.prisma`, `packages/core/src/index.ts`, `packages/db/domain/{index,mercadopagoAccount,mercadopagoAccount.test,mercadopago-privacy.test}.ts`,
`packages/db/package.json`, `apps/web/src/app/(panel)/layout.tsx`, `(panel)/ajustes/{page,page.test,ajustes-tabs,settings-ui}.tsx`,
`apps/web/src/lib/{tenant-context,tenant-context.test,onboarding-access-adapter,onboarding-access-adapter.test,onboarding-server.test,onboarding-subscription-gate}.ts`,
`apps/web/src/{middleware,middleware.test,guard-coverage.test}.ts`, `apps/web/src/app/api/webhooks/mercadopago/route.test.ts`,
`apps/bot/src/workers{,.test}.ts`, `.env.example`, `deploy/README.md`.

## Integración con HU-026

- `onboarding-access-adapter.ts`: `kind: "onboarding"` trae `tenantId` y `timeZone`.
- `tenant-context.ts`: `onboarding_pending` suma `userId`, `tenantId`, `timeZone`; nuevas `SubscriptionContext`,
  `getSubscriptionAccess`, `requireSubscriptionPageContext`, `requireSubscriptionOwnerContext`,
  `requireSubscriptionReadContext` (firmas del contrato §B.6.7). La zona operativa sale de la profesional de la
  agenda principal (`tenantProfessionalWhere`). `requirePageContext`/`requireOwnerContext`/`requireTenantContext`
  sin cambios: el resto del panel sigue cerrado para la titular en onboarding (test).
- `middleware.ts`: `access.kind === "onboarding" && pathname === "/ajustes/suscripcion"` → `next()` sin warn.
  Tests: la OWNER en onboarding pasa en `/ajustes/suscripcion` y `?mp=volver`; `/ajustes`, `/ajustes/suscripcion/x`,
  `/ajustes/suscripcionx`, `/agenda`, `/api/slots` siguen rechazadas con `onboarding_pending`; `setup` y STAFF con
  suscripción pendiente → `/inicio`; operativa pasa. Matcher excluye `api/webhooks/mercadopago(-suscripciones)?$`.
- `onboarding-subscription-gate.ts`: el stub `"pending"` se reemplaza por
  `export { getTenantSubscriptionGate } from "@nutri-bot/db/domain"`. **Efecto:** con el cobro apagado
  (`not_required`) las titulares en onboarding pasan a operativas (anexo, decisión de Joel).
- `PanelShell` extraído de `(panel)/layout.tsx` (mismo HTML; test). `(suscripcion)/layout.tsx`: operativa → shell;
  onboarding → layout mínimo (logo, nombre del consultorio, `SignOutButton`, `ConfirmProvider` + `Toaster`, sin
  sidebar ni estado del bot). En onboarding el "‹" de la pantalla va a `/inicio`.
- `onboarding-guard-enforcement.test.ts` no tiene lista de rutas permitidas: nada que sumar.

## Flags y variables nuevas (producción)

`ARZIUM_SUBSCRIPTIONS_ENABLED=false` (explícito; solo `"true"` habilita), `ARZIUM_MERCADOPAGO_MODE`
(`sandbox` solo fuera de prod, `live` solo con `NODE_ENV=production`), `ARZIUM_MERCADOPAGO_ACCESS_TOKEN`,
`ARZIUM_MERCADOPAGO_WEBHOOK_SECRET`, `ARZIUM_SUBSCRIPTIONS_BACK_URL` (opcional). `ARZIUM_MERCADOPAGO_USER_ID` ya
existía: **no** setearla en prod hasta que `legacy-tenant` use la cuenta de Daiana (D2). Con el flag apagado nada
cambia para nadie salvo el efecto de HU-026 de arriba (avisar a Leo; está en `deploy/README.md`). URL de
notificaciones a configurar cuando se habilite: `/api/webhooks/mercadopago-suscripciones`.

## Verificación (§B.9.6, desde la raíz del worktree)

| Comando | Resultado observado |
|---|---|
| `npm run db:generate` | exit 0 |
| `npm run typecheck` | exit 0 (core, db, bot, web; 0 errores) |
| `npm run test` | 269 archivos OK, 1 skipped; 4648 tests OK, 1 skipped |
| `npx vitest run` (lista de §B.9.6) | 56 archivos, 1342 tests OK |
| `grep -rn "validationCharge" packages/core/src apps/web/src` | exit 1 (vacío) |
| grep del email en `console.`/`subscriptionEvent` de `subscriptions.ts` | exit 1 (vacío) |
| `test ! -e "apps/web/src/app/(panel)/ajustes/suscripcion"` | exit 0 |
| `npm run test:subscriptions --workspace packages/db` | `test-tenant-subscriptions: OK` (fixture intacta, 2 planes, índices y CHECK; 6 casos de integración; drift 0) |
| `npm run test:mp-tenants --workspace packages/db` | `test-mercadopago-per-tenant: OK` |
| `bash packages/db/scripts/test-tenant-isolation.sh` | `test-tenant-isolation: OK` |
| `prisma migrate status` (dev) | "Database schema is up to date!" |
| `npm run test:confirm-flow --workspace apps/bot` | 8/8 escenarios OK (limpia por id) |
| `npm run build --workspace apps/web` | exit 0; rutas `ƒ /ajustes/suscripcion` y `ƒ /api/webhooks/mercadopago-suscripciones` |
| `./ops/harness/verify.sh` | "Arnés OK." (exit 0) |

Ninguna llamada real a MP (todo con gateway falso; el probe bloquea `fetch`); ningún WhatsApp; en la base de dev
solo la migración y lecturas; no se corrieron seeds ni `subscription-plans`.

## Contrato compartido

Firmas iguales a §B.5.1–§B.5.3, §B.6.2, §B.6.7 y anexo, con estos agregados (no renombres):
- core: `parseMercadoPagoDate` (lo usa el dominio para `date_created`) y el tipo `SubscriptionErrorCode`.
- `OfferedPlanView` suma `trialLength` y `trialUnit` (la página necesita la prueba para el estimado
  `computeTrialEnd(ahora, prueba)` del texto `offerTrial`; la vista del contrato no la traía).
- `subscriptions.ts` exporta `CHECKOUT_CREATE_LEASE_MS` y el tipo `TenantSubscriptionGate`.
- `continueCheckoutAction` puede devolver además `mp_unavailable` (validación de host de §B.6.2).

## Decisiones no obvias

1. **SDK de MP:** en 3.6.1 `PreApproval.create` mezcla los `requestOptions` en `config.options` y los deja
   pegados (la idempotency key y los reintentos se heredarían en la llamada siguiente). El gateway crea un
   `MercadoPagoConfig` por llamada. Además el SDK reintenta por defecto 3 veces en 429/5xx/errores de red: va
   `maxRetries: 0` en todas las llamadas (en `create` es obligatorio por S4; en las lecturas, para que búsqueda +
   creación entren en el lease de 45 s).
2. **Restart / checkout viejo:** antes de cancelar se hace `getPreapproval`; si ya está `authorized` no se cancela
   (se aplica y `already_subscribed`). La SDD decía cancelar y después mirar, lo que cancelaría una autorizada.
   Antes de cancelar se marca `cancelRequestedAt` para que un webhook `cancelled` que llegue antes atribuya el
   origen al panel.
3. `resumePendingCheckout`: si la vieja se llegó a abandonar y la creación de la nueva falló, devuelve `not_found`
   (su URL ya no sirve) en vez de la URL vieja; si la vieja sigue viva, la URL vieja + `stale_checkout_kept`.
4. **Gate y vista:** prefieren la suscripción no terminada (como máximo una por índice) y, si no hay, la última por
   `createdAt`. Mismo resultado que "la última" en todos los flujos reales; el probe mostró que con una CANCELED
   insertada después de la abierta, "la última" daba `pending` para una consultorio autorizado.
5. `priorTrialUsed` filtra por modo (una prueba de sandbox no consume la de live).
6. `id_mismatch` con una fila abandonada y una entrante `authorized` → también `authorized_after_abandon` (R11).
7. `syncSubscriptionByPreapprovalId` ante un error del SDK tira un `Error("mp_unavailable")` genérico (nunca el
   del SDK); webhook (`after`) y conciliación lo atrapan y loguean solo códigos.
8. Texto de precio: `formatPrice` (es-AR) produce `"$ 60.000 por mes"` con espacio duro; los tests fijan eso.
9. `PAST_DUE` (029c): el motivo todavía no existe; uso `pastDue("pago pendiente")` y el enlace de respaldo de S14.
   En 029b ese estado no se alcanza.
10. El `mercadopago-privacy.test.ts` de 028a buscaba `MERCADOPAGO_ACCESS_TOKEN` y matcheaba
    `ARZIUM_MERCADOPAGO_ACCESS_TOKEN`: lo acoté con `(?<!ARZIUM_)`. El chequeo del token de Arzium (en
    `subscriptions-privacy.test.ts`) admite core solo en la línea que comprueba que no esté vacío (la config lo
    exige) y los scripts de la corrida en sandbox de 029a; los `*.integration.ts` cuentan como tests.
11. La regresión del webhook de señas (§B.9.4) está en `mercadopago/route.test.ts` usando el resolver real con el
    `user_id` de Arzium (el resto del dominio va mockeado, como el resto de ese archivo).
12. UI: radios nativos dentro de `fieldset` (legend `sr-only`, sin texto nuevo), `role="status"` en P2, foco al
    campo de email cuando la acción lo rechaza, skip link en el layout mínimo. Sin textos nuevos fuera de §B.7
    salvo los rótulos de navegación "Ajustes"/"Inicio" del "‹" y la fila "Estado" de la pestaña (los nombra la SDD).

## Excepciones

- Test-first: estricto en core, `mercadopagoAccount`, `tenant-context`, middleware, pestaña de Ajustes y bot. En el
  dominio de suscripciones, el webhook nuevo y la pantalla los tests se escribieron junto con (o después de) el
  código; todos verifican resultados (filas, eventos, llamadas, HTML).
- No hubo verificación manual en sandbox con la pantalla real (es opcional del usuario, §B.9.6).

Test agregado tras el review: `packages/db/domain/subscriptionsGateway.test.ts` (commit 1ac3989, `test(db)`). Usa el SDK real de `mercadopago` (sin mockearlo) con `globalThis.fetch` falso (lo restaura al final) que responde 500. Verifica que hay exactamente 1 llamada HTTP en `createPreapproval`, que una segunda llamada manda su propia `X-Idempotency-Key` (`sub-1`, después `sub-2`), que un GET posterior no hereda la key, y que con el cobro apagado no se llama a nada. Resultados: el test pasa 4/4. Contraprueba: sacando `maxRetries: 0` el SDK hace 4 llamadas y el test falla; el gateway quedó restaurado y sin cambios. `npm run test --workspace packages/db` no existe (`Missing script: "test"`; ese workspace no define el script), así que corrí el equivalente `npx vitest run packages/db`: 60 archivos OK y 1 skipped, 1076 tests OK y 1 skipped. `./ops/harness/verify.sh`: "Arnés OK." (exit 0). Sin push.
