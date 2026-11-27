# Review — HU-028b (Google Calendar por consultorio, 1ª ronda)

**Veredicto:** APPROVED

Diff revisado: `git diff origin/develop..f0d933d` (11 commits, 75e6c89..f0d933d), rama
`feat/HU-028b-calendar-por-consultorio`, worktree `Nutri-Bot-HU028b`. No se revisaron los cambios sin
commitear del orquestador/implementer (SDD, backlog, impl). §B12 (contracción 028b-2) no se implementa, como
corresponde.

## Verificación corrida por el reviewer

| Comando | Resultado |
|---|---|
| `npm run db:generate` | exit 0 |
| `npm run typecheck` | exit 0 (core, db, bot, web) |
| `npm run test` | 233 archivos OK + 1 saltado; 4109 tests OK + 1 saltado |
| `npm run test:gcal-tenants --workspace packages/db` | OK 7/7 (fixture tipo prod, Professional intacto, instalación desde cero, traslado sin clave/dry-run/apply/idempotente, probe A/B pasos 4–9, drift 0), exit 0 |
| `npm run test:mp-tenants --workspace packages/db` | OK 11/11, drift 0, exit 0 (regresión 028a) |
| `bash packages/db/scripts/test-tenant-isolation.sh` | OK 14/14, exit 0 |
| `./ops/harness/verify.sh` | "Arnés OK", exit 0 |
| `prisma migrate status` (dev, lectura) | 42 migraciones, "Database schema is up to date!" |
| Traslado en dev, **solo dry-run** (clave efímera solo en el entorno del comando) | `{"mode":"dry-run","transferred":1,"alreadyConnected":0,"skipped":0}`; sin clave: `INTEGRATION_TOKEN_KEY inválida o ausente` |
| Dev después de todo (solo lectura) | `GoogleCalendarAccount` = 0 filas, `GoogleCalendarOAuthState` = 0 filas, `Professional` con token = 1 (intacto) |
| Greps de §B15 | `maybeStoreCalendarToken`/`calendar-token-owner`/`shouldStoreCalendarToken`/`resolveLegacyCalendarScope`: vacío; `GOOGLE_CALENDAR_OWNER_EMAIL` solo en el traslado y el probe; `grep calendar auth.config.ts`: vacío |

Los probes corren en contenedor descartable (`--pull never`, `mktemp -d`, `trap`, `unset` de
`INTEGRATION_TOKEN_KEY`/`GOOGLE_CALENDAR_OWNER_EMAIL`, sin `.env`), con `deps.fetch`/`deps.events` falsos: nada
contra Google ni WhatsApp real.

## Riesgos pedidos, punto por punto

- **Migración** (`packages/db/prisma/migrations/20261126010640_google_calendar_account/migration.sql`): idéntica
  a §B4.2 (solo `CREATE TABLE`/`CREATE INDEX`/`ADD CONSTRAINT` de las dos tablas nuevas). Ningún `ALTER`/`DROP`
  sobre tablas existentes; ninguna `NOT NULL` nueva en tablas con filas. `schema.prisma` coincide con §B4.1
  (solo comentarios en `Professional`). Commit 75e6c89 aislado. El probe confirma el md5 de
  `Professional` igual tras migrar y drift 0.
- **Cifrado**: `secretBox.ts` refactor con `loadKey(env, name, makeError)`; `loadMercadoPagoTokenKey` mantiene
  clase y mensaje; `loadIntegrationTokenKey` → `IntegrationConfigError("INTEGRATION_TOKEN_KEY inválida o
  ausente")`. `GOOGLE_SECRET_AAD.refreshToken/codeVerifier(tenantId)` (AAD por campo y consultorio). El verifier
  se sella con el AAD del tenant (`googleCalendarAccount.ts:230`), el token también (`:157`), y se abre con el
  del tenant (`gcal.ts:102`). Tests de AAD cruzado en `secretBox.test.ts` y `gcal.test.ts:134-148`.
- **Traslado** (`packages/db/scripts/google-calendar-transfer.ts`): clave validada antes de leer (`:34`, `main`
  `:110-115`, exit 2); `LOCK TABLE ... SHARE ROW EXCLUSIVE` con `--apply`; candidatos solo de agenda principal;
  no pisa fila conectada ni resucita desconectada (`:62`); relectura + `openSecret` y rollback si no coincide
  (`:90-93`); no modifica `Professional`; salida solo con conteos y error fijo. Idempotencia comprobada en el
  probe (segundo `--apply` = `alreadyConnected: 1`, md5 igual).
- **Deploy**: `deploy/compose.yml` `migrate` con `env_file: .env` y `sh -c "migrate deploy && tsx ...
  --apply"`; `deploy/deploy.sh:18` tiene `set -euo pipefail` y `run --rm migrate` (`:58`) va antes de `up -d`
  (`:61`): un fallo del traslado corta el deploy con los contenedores viejos.
- **Login**: `auth.config.ts` solo `scope: "openid email profile"` (sin `access_type`/`prompt`); `auth.ts` solo
  `registerGoogleIdentity` + `userId` (el `signIn` callback no cambió, nadie pierde el acceso). Test en
  `auth.test.ts:116-` (login con `refresh_token` no escribe `Professional` ni `GoogleCalendarAccount`, JWT
  sin tokens). Commit 22b9d84 aislado.
- **OAuth de Calendar**: state y verifier de 32 bytes aleatorios, se guarda solo `sha256(state)`, PKCE S256,
  TTL 10 min; consumo atómico `DELETE ... RETURNING` atado a `stateHash + userId + tenantId + expiresAt`
  (`googleCalendarAccount.ts:98-109`); sin state válido no se llama a `fetch`. id_token validado (iss, aud,
  azp, exp, sub, `email_verified === true`). Scope sin `calendar.events` → revoke + `scope_denied`. Solo OWNER:
  `connectGoogleCalendarAction`/`disconnectGoogleAction`/`saveGoogleCalendarIdAction` usan
  `requireOwnerContext` (actions.ts) y la ruta callback devuelve `invalid_state` a un no-OWNER sin tocar el
  dominio (`route.ts:19-23`); fijado en `guard-coverage.test.ts` y en los tests de acciones/ruta. La ruta
  queda bajo el matcher del middleware (`middleware.ts:47` no la excluye).
- **Aislamiento de la IA (D15)**: `PROFESSIONAL_SELECT` sin columnas `google*`; `domain/index.ts` ya no exporta
  `gcal`; Calendar vive en el subpath `@nutri-bot/db/domain/googleCalendar`; `google-calendar-isolation.test.ts`
  fija solo escritura (insert/patch/delete; del insert solo `data.id`) y que ningún archivo de IA (bot/ai,
  botAi.ts, deepseek, assistant-tools, bot-ai, asistente, ai-actions de planes) mencione Calendar/secretBox.
- **D8**: `decideGoogleCalendarConnection` + `saveGoogleCalendarConnection` (`:113-176`): `changed` olvida
  `googleEventId`, re-encola futuros CONFIRMED y pone `calendarId` null; `same` no toca turnos y conserva
  `calendarId`; anterior desconocido (traslado) → `same`. Probe paso 8 lo comprueba en Postgres real.
- **Revocación best effort**: `revokeGoogleToken` nunca tira (`googleOAuthClient.ts:108-115`); disconnect revoca
  después del commit y loguea solo `[google-calendar] revoke_failed`; `changed` revoca el token viejo después
  del commit; `same` no revoca.
- **Logs**: `describeGoogleCalendarError` no usa `err.message` ni `err.config` (`gcal.ts:50-61`, test con
  `Bearer SECRETO`); el cron del bot loguea solo `tenantId`/`processed`/`error` saneado y mensajes fijos
  (`workers.ts:146-174`); el callback loguea solo `oauth_callback_failed`; el canje solo `{status, code}`
  saneados; el traslado solo conteos.

## Checkpoints
- C1 backlog válido / 1 HU activa por responsable: [x] (verify.sh: "backlog/ válido ... senkuch4n: HU-028")
- C1 `progress/current-senkuch4n.md` refleja la HU: [x] (verify.sh lo encuentra; lo mantiene el orquestador)
- C1 el diff no toca HU de la otra persona: [x] (ningún `backlog/`, `progress/`, `docs/hu-*` ni `Refactorizaciones/` en el diff)
- C1 `./ops/harness/verify.sh` exit 0: [x]
- C2 `docs/hu-integraciones-por-consultorio.md` completa: [x]
- C2 `Refactorizaciones/integraciones-por-consultorio.md` con workspaces, checklist y contrato: [x] (§B3, §B5, §B14)
- C2 firmas/nombres coinciden con el contrato: [x] (§B5.1–§B5.6, barrel `googleCalendar.ts` exacto, `package.json` subpath + 2 scripts)
- C3 lógica pura en core, operaciones de base en db/domain sin duplicar: [x]
- C3 web y bot compilan y se ajustaron todos los consumidores: [x] (typecheck 0; `syncGoogleCalendar` solo en `workers.ts`; `pro.google*` fuera de `page.tsx`)
- C3 migración coherente, sin destructivos, sin NOT NULL sin default: [x]
- C3 rutas nuevas protegidas por auth; portal sin datos ajenos: [x] (callback con middleware + `requireOwnerContext`; portal no se toca)
- C3 bot en silencio fuera de sesión y textos de la SDD: [x] (no cambia conversación; `GOOGLE_CALENDAR_TEXT` y `googleDisconnectDescription` literales de §B5.1)
- C3 sin `console.log` de debug ni TODOs: [x] (solo `console.log` de la línea JSON del traslado, que es su salida)
- C4 typecheck limpio: [x]
- C4 lógica nueva de core con tests y `npm run test` pasa: [x] (`google-calendar-oauth.test.ts`)
- C4 flujo del bot simulado sin WhatsApp real: [x] (el cambio del bot es el cron de Calendar, cubierto con mocks en `workers.test.ts` y en el probe; no hay flujo conversacional tocado)
- C4 PDF/documento: [x] no aplica
- C5 `progress/impl_HU-028b.md` existe y describe lo tocado: [x]
- C5 `progress/review_HU-028b.md` con veredicto: [x]
- C5 sin scripts sueltos ni datos de prueba en dev: [x] (tablas nuevas en dev con 0 filas; `Professional` intacto)

## Cambios requeridos
Ninguno.

## Dudas (no bloqueantes)
- **Revocar revoca la autorización entera de la cuenta** (lo dice la propia SDD en §B5.4.5). Como
  `googleSubject` no es único entre consultorios (§B4.1), si dos consultorios conectan la misma cuenta de
  Google, "Desconectar" en A (`googleCalendarAccount.ts:333`) o un `changed` en A (`:304`) revocaría también
  la conexión de B, que quedaría en `syncError` hasta reconectar. Es consecuencia del diseño de la SDD y hoy
  hay un solo consultorio con Calendar; conviene anotarlo para cuando haya más (p. ej. no revocar si otro
  tenant tiene el mismo `googleSubject` conectado).
- **`tsx` dentro de la imagen `nutribot-bot`**: `apps/bot/Dockerfile` pone `NODE_ENV=production` antes de
  `npm ci`, y `tsx`/`prisma` son devDependencies. Como el bot de producción ya arranca con `tsx src/index.ts`
  y `migrate` ya usa la CLI de Prisma, la imagen evidentemente las trae; no lo verifiqué construyendo la
  imagen. Si faltara, el deploy corta en `migrate` sin daño (contenedores viejos siguen). Mirar la salida de
  `migrate` en el primer deploy, como dice el impl.
- El `.env` de dev no tiene `INTEGRATION_TOKEN_KEY`: hasta agregarla, Ajustes muestra "no configurada" y el bot
  de dev no sincroniza Calendar (el token legacy de dev sigue en `Professional`, sin trasladar). Paso
  operativo del usuario, ya listado en el impl.
- Los commits intermedios no compilan todos por separado (p. ej. e0e50ed saca `syncGoogleCalendar` del barrel
  antes de que 8b707bc ajuste el bot). No afecta el merge.
