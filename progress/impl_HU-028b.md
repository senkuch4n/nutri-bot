# impl HU-028b · Google Calendar por consultorio

Estado: **done** (tanda 028b; la contracción 028b-2, §B12, **no** se implementó).
Worktree `/Users/joelmiguelserrudo/Projects/Nutri-Bot-HU028b`, rama `feat/HU-028b-calendar-por-consultorio`
(desde `develop` con 028a). Fecha: 2026-11-25. Modelo: Opus.
`Refactorizaciones/integraciones-por-consultorio.md` y `backlog/HU-028.json` quedaron sin commitear (los maneja el orquestador).
Este archivo también queda sin commitear.

## Commits (uno por bloque, conventional, sin trailer)

| Commit | Bloque |
|---|---|
| `75e6c89` feat(db): tablas GoogleCalendarAccount y GoogleCalendarOAuthState | schema + migración (solo) |
| `2fccaef` feat(core): OAuth propio de Google Calendar | core |
| `e0e50ed` feat(db): Google Calendar por consultorio (dominio) | secretBox, oauth client, cuenta, gcal, barrel, aislamiento |
| `6886849` feat(db): traslado idempotente + probe en Postgres descartable | traslado + probe |
| `22b9d84` feat(web): el login pide solo openid email profile | login (solo) |
| `869d446` feat(web): Ajustes con OAuth propio, solo OWNER, callback y banner | Ajustes + callback + guard-coverage |
| `ef75763` docs(web): /privacidad | privacidad |
| `8b707bc` feat(bot): sync por consultorio | bot |
| `96e70f8` chore(web): quitar menciones del calendario del login y de su test | ajuste para que las greps de §B15 den vacío |
| `00c4d22` docs: deploy de Google Calendar por consultorio | compose + .env.example + READMEs |
| `f0d933d` chore(web): quitar imports sin uso | lint (Button en page.tsx, calendarLogin en auth.test.ts) |

## Archivos

- **Esquema:** `packages/db/prisma/schema.prisma` (Tenant, User, comentarios EN DESUSO en Professional, modelos nuevos);
  `packages/db/prisma/migrations/20261126010640_google_calendar_account/migration.sql`. El SQL generado es
  exactamente el de §B4.2 (solo CREATE TABLE/INDEX y ADD CONSTRAINT de las tablas nuevas; ningún ALTER/DROP de tablas existentes).
- **core:** `google-calendar-oauth.ts` (+ test), `index.ts` (export), `settings-options.ts` (`googleDisconnectDescription`).
- **db/domain:** `secretBox.ts` (+test: `IntegrationConfigError`, `loadIntegrationTokenKey`, `GOOGLE_SECRET_AAD`, helper privado `loadKey`;
  MP sin cambios de mensaje ni clase), `googleOAuthClient.ts` (+test), `googleCalendarAccount.ts` (+test), `gcal.ts` (+`gcal.test.ts`
  reescrito, `gcal-and-ai-privacy.test.ts` adaptado), `googleCalendar.ts` (barrel del subpath), `google-calendar-isolation.test.ts`,
  `index.ts` (sin `gcal`), `tenantScope.ts` (+test), `legacySchedulingScope.ts` (sin `resolveLegacyCalendarScope`),
  `professionalSelect.ts` (+test), `mercadopago-privacy.test.ts` (allowlist de columnas cifradas suma `gcal.ts` y `googleCalendarAccount.ts`).
- **db:** `package.json` (subpath `./domain/googleCalendar`, scripts `gcal:transfer` y `test:gcal-tenants`), `tsconfig.json`
  (incluye `scripts/google-calendar-*.ts` en el typecheck), `scripts/google-calendar-transfer.ts`,
  `scripts/google-calendar-per-tenant.integration.ts`, `scripts/test-google-calendar-per-tenant.sh`.
- **web:** `auth.config.ts` (+test), `auth.ts` (+test), borrados `lib/calendar-token-owner.ts` y su test;
  `ajustes/actions.ts`, `ajustes/google-calendar-actions.test.ts` (nuevo), mocks del subpath en `actions.test.ts`,
  `logo-actions.test.ts`, `mercadopago-actions.test.ts`; `api/google-calendar/oauth/callback/route.ts` (+test);
  `ajustes/page.tsx`, `ajustes/google-calendar-form.tsx`, `ajustes/page.test.tsx`; `guard-coverage.test.ts`; `privacidad/page.tsx`.
- **bot:** `workers.ts` (`runGoogleCalendarSync`), `workers.test.ts`.
- **deploy/docs:** `deploy/compose.yml` (servicio `migrate` con `env_file` y traslado), `deploy/README.md` (sección HU-028b),
  `deploy/.env.example`, `.env.example`, `README.md`.

## Contrato compartido (§B5)

Las firmas coinciden con la SDD: `GOOGLE_*` y funciones de `google-calendar-oauth.ts` (§B5.1), `IntegrationConfigError`,
`loadIntegrationTokenKey`, `GOOGLE_SECRET_AAD` (§B5.2), `GoogleOAuthHttpDeps`, `GoogleCalendarAppConfig`,
`GoogleCalendarConfigError`, `getGoogleCalendarAppConfig`, `GoogleOAuthApiError`, `exchangeGoogleAuthorizationCode`,
`revokeGoogleToken` (§B5.3), `GoogleCalendarConnectionView`, `getGoogleCalendarConnectionView`, `startGoogleCalendarOAuth`,
`completeGoogleCalendarOAuth`, `disconnectGoogleCalendar`, `setGoogleCalendarId`, `listConnectedGoogleCalendarTenants` (§B5.4),
`CalendarEventsWriter`, `GoogleCalendarSyncDeps`, `syncGoogleCalendar(t, deps?)`, `describeGoogleCalendarError` (§B5.5),
barrel y `package.json` (§B5.6), `connectGoogleCalendarAction`/`disconnectGoogleAction`/`saveGoogleCalendarIdAction` (§B7.2),
`runGoogleCalendarSync` (§B8), `GoogleCalendarTransferResult`/`transferLegacyGoogleCalendarTokens` (§B9).
Internos `consumeGoogleOAuthState` y `saveGoogleCalendarConnection` con los nombres de la SDD.

## Decisiones no obvias

- **id de la fila en el INSERT crudo** (`ON CONFLICT ("tenantId") DO NOTHING`): no hay librería cuid en el repo; se genera
  `c` + 24 hex (`randomBytes(12)`), 25 caracteres como un cuid. La columna es TEXT; el default `cuid()` de Prisma solo aplica a
  inserts por el cliente (el traslado usa `upsert` y ahí sí lo genera Prisma).
- **`parseGoogleCalendarCallback`**: `error` presente → `denied` aunque venga `code` (la SDD dice "error presente o sin code").
- **`completeGoogleCalendarOAuth`**: el canje fallido loguea `console.error("[google-calendar] oauth_exchange_failed", { status, code })`
  (status numérico y código saneado, igual que MP); nada más se loguea. En `denied`, el consumo del state usa `t.tenantId`
  antes de resolver la agenda (orden de §B5.4 paso 2 → 3).
- **`disconnectGoogleCalendar`** resuelve la agenda principal (para el `professionalId` del texto plano a limpiar); si la clave
  `INTEGRATION_TOKEN_KEY` falta o es inválida, desconecta igual sin revocar (`{ revoked: false }`).
- **`getGoogleCalendarConnectionView`** usa la variante `findUnique` (select sin la columna cifrada) + `count` (no resuelve la
  agenda: no lo pide la SDD y no lee nada sensible).
- **Sync**: el `delete` con 404/410 ahora mira también `err.response.status` (antes solo `err.code`), igual que el `patch` nuevo.
  `decrypt_failed` reescribe `syncError`/`syncErrorAt` en cada tick mientras haya cola (no hay llamada a Google).
- **Traslado**: lógica exportada + CLI que solo corre si se invoca directo (`import.meta.url` vs `argv[1]`), así el probe puede
  importarlo. La identidad (§B9.5) se completa solo si hay **exactamente un** User con ese email canónico, `googleSubject` y
  membresía en el tenant; si no, queda null. Salida JSON de una línea; errores → mensaje fijo (exit 1) o
  `INTEGRATION_TOKEN_KEY inválida o ausente` (exit 2).
- **Tests existentes ajustados**: `mercadopago-privacy.test.ts` (la lista cerrada de archivos que mencionan `*TokenEnc` suma los dos
  de Google, que la SDD declara como únicos lectores); los tests de acciones de Ajustes mockean el subpath nuevo para no importar
  Prisma/googleapis reales.
- **`isMutatingPanelRequest`** (core, lista `MUTATING_GET_PATHS`) no se tocó: hoy no lo usa nadie (ni el middleware) y la SDD dice
  no tocar `middleware.ts`. Si en el futuro se cablea, habría que sumar `/api/google-calendar/oauth/callback` (GET que escribe).
- **UI**: el botón "Conectar" de Google ahora es `<form action={connectGoogleCalendarAction}>` con `useFormStatus` (spinner); el
  banner `?gcal=` copia el de MP (respeta reduced motion, `Alert` con `role=alert/status`). Autochequeo con `web-design-guidelines`:
  sin hallazgos en los archivos tocados (email con `translate="no"` y `break-all`, desconectar con confirmación destructiva, botón
  deshabilitado solo con el aviso `not_configured` visible).
- RED/GREEN: los tests nuevos se escribieron junto con (no estrictamente antes de) la implementación; se verificó que fallan ante
  una regresión en el test de aislamiento (mutación temporal: re-exportar `./gcal` desde `domain/index.ts` y mencionar
  `googleCalendar` en `botAi.ts` → 2 fallas; revertido).

## Aislamiento de la IA (§B6) y test que fija cada punto

| Garantía | Test |
|---|---|
| 1. Login solo `openid email profile`, sin `access_type`/`prompt`; credencial del calendario solo desde Ajustes, cifrada | `apps/web/src/auth.config.test.ts` (params exactos), `apps/web/src/auth.test.ts` (login con refresh/access/id token no escribe Professional ni GoogleCalendarAccount; JWT/sesión sin tokens) |
| 2. Solo escritura (sin `events.list/get/watch/instances`, `freebusy`, `calendarList`; del insert solo `data.id`) | `packages/db/domain/google-calendar-isolation.test.ts` |
| 3. Fuera del alcance de la IA (`domain/index.ts` sin Google/secretBox, `PROFESSIONAL_SELECT` sin `google*`, archivos de IA sin menciones) | `google-calendar-isolation.test.ts`, `professionalSelect.test.ts` |
| 4. Nada a logs (cron sin error crudo, `syncError` saneado) | `packages/db/domain/gcal.test.ts`, `apps/bot/src/workers.test.ts` |

## Verificación real (desde la raíz del worktree)

- `npm ci`: OK.
- Migración: `pg_dump` previo en `~/nutribot-dev-pre-028b.dump` (fuera del repo). `prisma migrate status` antes: al día, sin drift.
  `migrate dev --create-only --name google_calendar_account` → SQL revisado = §B4.2. `npm run db:migrate` + `db:generate`: OK.
  Releído en dev (solo lectura): md5 de `Professional`(id, googleRefreshToken, googleCalendarId, googleSyncError) igual antes y
  después (`d094cf83a1a4db580a51ca1ae330137f`); tablas nuevas con 0 filas. Después de todo: `migrate status` → "Database schema is up to date!".
- `npm run db:generate` → OK. `npm run typecheck` → exit 0 (core, db, web, bot).
- `npm run test` → **233 archivos OK, 1 saltado; 4109 tests OK, 1 saltado**.
- Lista de §B15 (`npx vitest run …` con los 15 paths) → 22 archivos, 670 tests OK.
- `npm run test:gcal-tenants --workspace packages/db` → OK (7/7: fixture tipo producción, Professional intacto con la migración,
  instalación desde cero, traslado sin clave = exit≠0 y 0 filas, dry-run = 0 filas, apply = fila cifrada que abre con el AAD del
  consultorio con email/subject del OWNER y Professional intacto, segundo apply = `alreadyConnected: 1` con fila idéntica; probe A/B
  pasos 4–9 en `node:test`; drift = 0 en las dos bases). Todo en un contenedor descartable, sin red real.
- `npm run test:mp-tenants --workspace packages/db` → OK. `bash packages/db/scripts/test-tenant-isolation.sh` → OK.
- `npm run gcal:transfer --workspace packages/db` (dev, **solo dry-run**):
  - sin `INTEGRATION_TOKEN_KEY` (el `.env` no la tiene): `INTEGRATION_TOKEN_KEY inválida o ausente`, exit 2, sin leer nada.
  - con una clave efímera solo en el entorno del comando (no se tocó `.env`): `{"mode":"dry-run","transferred":1,"alreadyConnected":0,"skipped":0}`.
  - Releído después: `GoogleCalendarAccount` = 0 filas, md5 de Professional igual.
- `npm run test:confirm-flow --workspace apps/bot` → 8/8 OK. `npm run test:booking-reason --workspace apps/bot` → 17/17 OK,
  "Datos de prueba borrados (por id)". Sin WhatsApp real.
- `npm run build --workspace apps/web` → OK (ruta `ƒ /api/google-calendar/oauth/callback`). Quedan 2 warnings de lint preexistentes
  en archivos no tocados (`SheetHeader`, `AppointmentListRow`).
- Greps de §B15: las tres dan vacío (sin restos de `maybeStoreCalendarToken`/`calendar-token-owner`/`shouldStoreCalendarToken`/
  `resolveLegacyCalendarScope`; `GOOGLE_CALENDAR_OWNER_EMAIL` solo en el traslado y el probe; `grep -n "calendar" auth.config.ts` vacío).
- `deploy/compose.yml` parseado con YAML: `migrate` con `env_file: .env` y el `sh -c` de §B9.
- `./ops/harness/verify.sh` → "Arnés OK" (backlog válido).

## Supuestos §B16

- `authConfig.providers[0].options.authorization.params` **es accesible**: el test afirma `{ scope: "openid email profile" }` sobre el
  objeto real de Auth.js (no hizo falta el chequeo de source).
- `id_token` + `refresh_token` en el canje con `openid` + `access_type=offline&prompt=consent`: no verificable sin Google real
  (todo mockeado). Si no viniera `refresh_token`, el resultado es `rejected` (cubierto por test).
- `npx --no-install tsx` dentro de la imagen `nutribot-bot`: no se construyó la imagen (no verificado acá). Indicios a favor: el bot
  en producción ya arranca con `tsx src/index.ts` y `migrate` ya usa la CLI de Prisma, ambas devDependencies en el `package.json`,
  así que la imagen las tiene. Igual, **mirar la salida de `migrate` en el primer deploy**: si `tsx` faltara, `migrate` sale con error y
  `deploy.sh` corta antes de `up -d` (siguen los contenedores viejos, sin daño).

## Pasos operativos pendientes para el usuario

1. **Agregar `INTEGRATION_TOKEN_KEY` al `.env` de la raíz** (dev): `openssl rand -base64 32`. Sin ella, Ajustes → Google Calendar
   muestra "no configurada" y el bot no sincroniza (falta en el `.env` actual; no se editó).
2. **Dev, opcional:** decidir si correr el traslado con `--apply` en la base de desarrollo
   (`npm run gcal:transfer --workspace packages/db -- --apply`, con la clave ya en `.env` y, si se quiere la fila "Cuenta",
   `GOOGLE_CALENDAR_OWNER_EMAIL`). Sin eso, el calendario de dev deja de sincronizar hasta reconectar desde Ajustes.
3. **Google Cloud Console** (cliente OAuth de Numa): agregar las redirect URIs
   `http://localhost:3000/api/google-calendar/oauth/callback` y `https://numa.arzium.com.ar/api/google-calendar/oauth/callback`.
4. **Verificación manual en dev** (con la redirect URI cargada): login (Google ya no pide calendario) → Ajustes → Conectar Google
   Calendar → consentimiento → turno confirmado aparece en el calendario; Reconectar misma cuenta; Desconectar.
5. **Antes de mergear a `main`** (deploy/README.md, sección HU-028b): consulta de solo lectura en producción, `INTEGRATION_TOKEN_KEY`
   en `deploy/.env` (sin ella el deploy corta en `migrate`, a propósito), confirmar `GOOGLE_CALENDAR_OWNER_EMAIL` en `deploy/.env`,
   y el video de verificación de Google con el flujo nuevo.
6. **Después del deploy:** confirmar la línea `{"mode":"apply","transferred":1,…}` y la sync de `legacy-tenant`; recién ahí abrir 028b-2.
7. Respaldo de dev previo a la migración: `~/nutribot-dev-pre-028b.dump` (se puede borrar cuando ya no haga falta).
