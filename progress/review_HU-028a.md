# Review — HU-028a (1ª ronda)

**Veredicto:** APPROVED

Alcance revisado: `git diff 0afda21..766c5c3` (8 commits, 5299bfd..766c5c3). No se revisaron los commits
posteriores (995e4da, 69d9f8e, de 029a) ni los cambios sin commitear del implementer de 029a.
Para aislarme de ese trabajo en curso, la verificación corrió en un worktree descartable en
`766c5c3` (node_modules clonado, fuera del repo; ya borrado).

## Verificación corrida por el reviewer (2026-11-25)

| Comando | Resultado |
|---|---|
| `npm run db:generate` (worktree en 766c5c3) | OK |
| `npm run typecheck` (worktree) | exit 0: core, db, bot y web sin errores |
| `npm run test` (worktree) | 228 archivos OK, 1 omitido; 3963 tests OK, 1 omitido |
| `npm run test:mp-tenants --workspace packages/db` | OK: fila id=1 de legacy-tenant intacta (md5 de los `*Enc`, userId, expiresAt, liveMode, connectedAt), descifra con la clave de prueba, `nextval` = 2, states = 0, `Payment.mercadopagoUserId` igual, `tenantId` NOT NULL en las dos tablas; la variante con `tenantId` NULL aborta y deja la tabla y la columna (nullable) como estaban; probe A/B 11/11; drift vacío en las dos bases descartables |
| `bash packages/db/scripts/test-tenant-isolation.sh` | OK, 14/14 (incluye "la cuenta de Mercado Pago de D no existe para C" con el b2 ajustado) |
| `prisma migrate status` (base de dev, solo lectura) | 41 migraciones, "Database schema is up to date!" |
| `npm run build --workspace apps/web` (worktree) | OK |
| `./ops/harness/verify.sh` (árbol principal) | 1ª corrida: FAIL en el typecheck de `packages/db`, causado por ediciones de 029a sin commitear (`packages/db/scripts/lib/mp-sandbox-*`, `tsconfig.json`), no por 028a. 2ª corrida: exit 0, "Arnés OK." |

No corrí `test:confirm-flow` ni `test:booking-reason` contra la base de dev: `conversation.ts` no cambia
y los crons tocados (`workers.ts`) están cubiertos por `workers.test.ts` con mocks. El implementer
dice que los corrió (8/8 y 17/17). No se escribió nada en la base de dev, no se mandó WhatsApp y no
hubo llamadas a Mercado Pago.

## Revisión de los puntos pedidos

- **Migración** (`packages/db/prisma/migrations/20261125234554_mercadopago_account_per_tenant/migration.sql`):
  es el SQL de SDD §4.2 tal cual. El `DO $$` (líneas 6-11) aborta si hay un `tenantId` NULL, y
  `BEGIN/COMMIT` hace el rollback (comprobado en el paso 3/6 del script). No hay DROP de columnas ni
  tablas. El único `DELETE` borra los `MercadoPagoOAuthState`, que son efímeros, y la SDD lo pide
  porque no hay backfill posible para `userId NOT NULL`. `setval` usa MAX(id)+1. Prod tiene 1 fila,
  así que el próximo id es 2. El `UNIQUE(userId)` y los NOT NULL coinciden con `schema.prisma`
  (drift vacío).
- **Aislamiento**:
  - Todas las consultas de `mercadopagoAccount.ts` van por `where: { tenantId }`. `ACCOUNT_ID`,
    `singletonHasUnverifiedOwner` y `resolveMercadoPagoWebhookTenant` se borraron.
  - `consumeOAuthState` filtra por `stateHash` + `userId` + `tenantId` + vencimiento.
  - El webhook resuelve la cuenta por `user_id` (`resolveMercadoPagoWebhookAccount`) y después
    re-verifica: `collector_id` contra `sellerUserId` (payments.ts:180) y la regla estricta de
    vendedor (payments.ts:197-202), además del `scope` del consultorio.
  - En el bot, los crons recorren la unión deduplicada con `try/catch` por consultorio
    (workers.ts:24-50, 154-172), y `failed > 0` en un consultorio no frena el vencimiento de los demás.
  - El respaldo `.env` solo aplica a `LEGACY_TENANT_ID` (mercadopagoAccount.ts:503).
  - El probe A/B lo confirma contra Postgres real.
- **Solo el OWNER**: `connectMercadoPagoAction` y `disconnectMercadoPagoAction` usan
  `requireOwnerContext()`. El callback también: `owner_only` redirige a `?mp=invalid_state` sin
  consumir el state ni canjear, y cualquier otro error de acceso va a `/inicio`. En `page.tsx`, los
  botones Conectar, Reconectar (también el del aviso de error) y Desconectar solo se muestran si
  `isOwner`. `guard-coverage.test.ts` suma `requireOwnerContext(` a `ROUTE_GUARDS`, y
  `mercadopago-actions.test.ts` fija D4b en el código fuente.
- **Logs**:
  - El webhook solo registra `{ code: "unknown_account" }`, fijado en `mercadopago-privacy.test.ts`.
  - La ruta del webhook nunca loguea el cuerpo (también hay test).
  - El callback no loguea ni el query ni la excepción.
  - Los crons loguean solo `tenantId`, `result` y `paymentId`, nunca el error crudo (hay tests con
    "Bearer secreto").
  - Los tokens de una cuenta rechazada (de la plataforma o ya usada en otro consultorio) se
    descartan sin guardarse.
- **Contrato (§5)**: las firmas de `startMercadoPagoOAuth`, `completeMercadoPagoOAuth`,
  `resolveMercadoPagoWebhookAccount`, `listConnectedMercadoPagoTenants`, `handleMercadoPagoWebhook`,
  `listTenantsWithPendingMercadoPagoPayments`, `parseMercadoPagoNotificationUserId`,
  `isPlatformMercadoPagoUserId` y `account_in_use` (con el texto exacto) coinciden con la SDD. Se
  ajustaron todos los consumidores en web y bot.
- **Commits**: no tienen trailer de IA (cumple `.claude/CLAUDE.md`) y no traen archivos fuera del
  §9 de la SDD.

## Checkpoints
- C1 backlog válido / máx. 1 HU activa por responsable: [ ] — `backlog/HU-028.json` está en
  `en_revision` y `backlog/HU-029.json` en `implementando`, ambos de `senkuch4n`. Son dos estados
  activos para la misma persona. `verify.sh` lo acepta y no es parte del diff de 028a: lo decide el
  orquestador. No bloquea esta entrega.
- C1 `progress/current-senkuch4n.md` refleja la HU en curso: [x] (está modificado en el árbol; es
  del orquestador)
- C1 el diff no toca HU de la otra persona: [x]
- C1 `verify.sh` exit 0: [x] (2ª corrida; la 1ª falló por 029a sin commitear, ver arriba)
- C2 existe `docs/hu-integraciones-por-consultorio.md`: [x]
- C2 existe la SDD con contrato y checklist: [x]
- C2 las firmas coinciden con el contrato: [x]
- C3 lógica pura en core, base compartida en `db/domain`: [x] (parse y plataforma en core; listas y resolución en domain; `uniqueTenants` local, como pide la SDD)
- C3 web y bot compilan y los consumidores están ajustados: [x]
- C3 migración coherente, sin pasos destructivos no pedidos, NOT NULL resueltos: [x]
- C3 rutas protegidas: [x] (callback owner-only; el webhook sigue exento por firma, sin cambios)
- C3 bot en silencio y textos según la SDD: [x] (no hay mensajes nuevos del bot; el banner `account_in_use` tiene el texto exacto)
- C3 sin `console.log` de debug ni TODOs sueltos: [x]
- C4 typecheck limpio: [x]
- C4 core con tests y `npm run test` en verde: [x]
- C4 flujo del bot simulado sin WhatsApp: [x] (crons con mocks; la conversación no cambia; las simulaciones contra dev las reporta el implementer)
- C4 PDF: [x] N/A
- C5 existe `impl_HU-028a.md`: [x]
- C5 existe `review_HU-028a.md`: [x]
- C5 sin scripts sueltos ni datos de prueba en dev: [x] (los scripts nuevos son parte del §9 y corren solo en Postgres descartable)

## Cambios requeridos
Ninguno.

## Dudas (no bloqueantes)
- **§14, sin confirmar:** no se sabe si las notificaciones de pagos de MP traen `user_id` en el
  cuerpo. Si no lo traen, todo webhook se ignora con `unknown_account` y la seña se confirma por la
  conciliación del bot (≤ 1 min). Hay que validarlo con el primer pago real después del deploy,
  como dice `deploy/README.md`.
- **Regla de vendedor estricta** (payments.ts:197-202, pedida por la SDD): en producción, un
  `Payment` histórico con `mercadopagoUserId = null` (anterior a HU-023) ya no se actualiza por
  webhook. Por ejemplo, un reembolso tardío de una seña vieja. No afecta señas pendientes (vencen a
  los 15 min). Lo dejo anotado como cambio de comportamiento aceptado.
- **`resolveMercadoPagoWebhookAccount(null, env de dev)`** devuelve `legacy-tenant` con el
  respaldo de dev activo (mercadopagoAccount.ts:636). §11.2 dice "`null` → `null` (sin respaldo)",
  que se cumple sin respaldo. Solo pasa en desarrollo; en producción
  `allowsMercadoPagoEnvToken` es false.
- **P2002:** se detecta por la forma del error (`code` + `meta.target` incluye `"userId"`). Funciona
  si `target` es el array de campos o el nombre del constraint
  (`MercadoPagoAccount_userId_key`). Si una versión futura de Prisma cambia el formato de `meta`,
  el pre-chequeo `findFirst` sigue cubriendo el caso normal.
- **`verify.sh` en el árbol compartido:** puede fallar por el trabajo sin commitear de 029a. Antes
  de cerrar 028a, el orquestador debería correrlo con el árbol de 029a commiteado o en reposo.
