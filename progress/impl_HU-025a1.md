# impl HU-025a1 · Registro de identidad (entrega 025a-1)

- Estado: **done**
- Rama: `feat/HU-025a1-registro-identidad` (sin push, sin PR)
- SDD: `Refactorizaciones/autenticacion-permisos-tenant.md` §7.1 "Checklist 025a-1" (+ §2, 2.1, 4.1, 4.2, 4.6, 5.1, 6.1, 6.2, 6.5, 10.1–10.3)
- Skill aplicado: `migracion-prisma`
- Fecha: 2026-11-21

## Commits (uno por tarea del checklist)

| Commit | Tarea |
|---|---|
| `65066b7` | core: `canonicalEmail` + tipos + `decideTenantAccess` + tests |
| `c6befd7` | db: schema 5.1 + migración `20261122013041_tenant_access_identity` |
| `0c9e8a9` | db: `domain/tenantAccess.ts` (`LEGACY_TENANT_ID`, `registerGoogleIdentity`, `loadAccessFacts`) + tests con mocks |
| `bd3a85c` | db: `scripts/tenant-access.ts` (`pending`, `members`, `grant`, `revoke`, `forget-pending`) + script en `package.json` |
| `205c069` | db: probe `scripts/test-tenant-access.sh` + `scripts/tenant-access.integration.ts` |
| `c0d84e8` | web: `next-auth.d.ts` → `userId`; `auth.ts` registra la identidad, D10, `session.userId`; `auth.test.ts` |
| `9cece44` | web: `private-content-access.ts` y sus tests leen `session.userId` |

## 2.1 Prerrequisito de la base de desarrollo (sin commit)

1. `prisma migrate status` → pendientes **solo** las 12 `20261120*` de HU-024, sin drift.
2. `pg_dump -Fc` (vía `docker exec nutri-bot-db-1`) a `~/backups/nutribot-dev-2026-11-21-pre-hu024.dump` (fuera del repo).
3. `prisma migrate deploy` → "All migrations have been successfully applied." Sin errores (no hubo `23514`).

## Migración `tenant_access_identity`

- Respaldo previo: `~/backups/nutribot-dev-2026-11-21-pre-hu025a1.dump`.
- `npx dotenv -e ../../.env -- prisma migrate dev --create-only --name tenant_access_identity` → creada sin aplicar.
- SQL generado (revisado, idéntico a 5.1; sin `DROP`, sin tocar objetos de HU-024):

  ```sql
  ALTER TABLE "TenantMembership" ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
  ALTER TABLE "User" ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "lastSignInAt" TIMESTAMP(3);
  ```
- Aplicada con `npm run db:migrate` ("Your database is now in sync with your schema", sin aviso de drift ni reset) y
  `npm run db:generate`. `migrate status` después: "Database schema is up to date!" (40 migraciones).
- No se escribieron datos de negocio en la base de desarrollo: solo se aplicaron migraciones. Las pruebas que escriben
  corren en Postgres descartable.

## Archivos

**Nuevos**
- `packages/core/src/tenant-access.ts`, `tenant-access.test.ts`
- `packages/db/prisma/migrations/20261122013041_tenant_access_identity/migration.sql`
- `packages/db/domain/tenantAccess.ts`, `tenantAccess.test.ts`
- `packages/db/scripts/tenant-access.ts`, `tenant-access.test.ts` (vitest, validación pura), `tenant-access.integration.ts` (node:test, solo vía el probe), `test-tenant-access.sh`

**Modificados**
- `packages/core/src/index.ts` (export)
- `packages/db/prisma/schema.prisma` (5.1)
- `packages/db/domain/index.ts` (export)
- `packages/db/package.json` (`"tenant-access": "tsx scripts/tenant-access.ts"`, sin dotenv)
- `packages/db/tsconfig.json` (incluye `scripts/tenant-access*.ts` en el typecheck)
- `packages/db/scripts/legacy-memberships.ts` (solo la nota de `--help` de 6.5: "To grant access to a pending identity, use tenant-access.")
- `apps/web/src/types/next-auth.d.ts`, `apps/web/src/auth.ts`, `apps/web/src/auth.test.ts`
- `apps/web/src/lib/private-content-access.ts` (+ test), `app/api/recetas/fotos/[photoId]/route.test.ts`, `app/api/recetas/importacion/[imageId]/route.test.ts`, `app/(panel)/recetas/actions.test.ts`

## Contrato compartido (confirmación)

- 4.1 (`packages/core/src/tenant-access.ts`): `MembershipRole`, `SupportMode`, `AccessFacts`, `AccessDenial`,
  `AccessGrant`, `AccessDecision`, `decideTenantAccess(facts, opts?: { enabledTenantIds? })`, `canonicalEmail(email)`:
  nombres y firmas exactos. `isMutatingPanelRequest` y los textos de acceso **no** están (son de 025a-2).
- 4.2 (`packages/db/domain/tenantAccess.ts`): `LEGACY_TENANT_ID = "legacy-tenant"`, `GoogleIdentity`,
  `IdentityRegistration`, `registerGoogleIdentity(identity, now?, db?)`, `loadAccessFacts(userId, now, db?)`: nombres y
  firmas exactos. El tipo del cliente opcional se llama por función, como pide 4.2 ("según lo que use cada función"):
  `RegisterIdentityClient = Pick<PrismaClient, "$transaction">` y `AccessFactsClient = Pick<Prisma.TransactionClient, "user">`.
- 4.6: `token.userId` / `session.userId` reemplazan `privateContentUserId`; el JWT no guarda rol ni tenant.

## Decisiones no obvias

1. **`decideTenantAccess` en 025a no evalúa acceso de plataforma.** Un User sin membresía siempre da
   `no_membership`, aunque los hechos traigan `platformOperator: true` o permisos (falla cerrado; `loadAccessFacts`
   igual devuelve `false`/`[]`). La precedencia de soporte se agrega en 025d, como dice su checklist. Un rol desconocido
   que venga de la base también da `no_membership`. Membresía + permiso → manda la membresía (ya testeado).
2. **`registerGoogleIdentity`**: transacción `ReadCommitted` con `pg_advisory_xact_lock(hashtext('user-identity'))`
   (vía `$executeRaw`); busca por `googleSubject`, después por `lower(btrim(email))`; cualquier User con ese email (con
   otro `sub` o sin `sub`) → `conflict` sin escrituras; `P2002` → `conflict`. Canonicaliza el email adentro también
   (idempotente) y devuelve `conflict` sin abrir transacción si `subject` o email vienen vacíos.
3. **`auth.ts`**: el registro de la identidad va **antes** del chequeo del calendario (D10 necesita el `userId`). El
   calendario solo se evalúa si el login trae `refresh_token`, el registro dio `linked` y
   `decideTenantAccess(loadAccessFacts(userId))` da `member` de `LEGACY_TENANT_ID`; después sigue igual que antes
   (`resolveLegacyCalendarScope`, `shouldStoreCalendarToken`, `updateMany` acotado). En el login se borran
   `token.userId` y el claim viejo `privateContentUserId`. El `signIn` de `auth.config.ts` sigue con `ALLOWED_EMAILS`
   (no se tocó). Log del conflicto: `[auth] identity_conflict`, sin email ni `sub` (test lo verifica).
4. **JWT viejo**: una sesión anterior solo con `privateContentUserId` queda sin acceso a recetas/plantillas hasta volver
   a entrar (aceptado en 4.6; es la fase 2 de 6.4). Test agregado en `private-content-access.test.ts`.
5. **Commit intermedio `c0d84e8`**: compila y pasa tests, pero `next-auth.d.ts` conserva `privateContentUserId` marcado
   `@deprecated` para que `private-content-access.ts` compile hasta el commit siguiente (`9cece44`), que lo retira. En
   `c0d84e8` las recetas no tienen acceso en runtime (nadie setea el claim viejo); se resuelve en el commit siguiente
   de la misma rama.
6. **Script `tenant-access.ts`**: `main` corre solo si se invoca directo (para poder importar `parseArgs`/`maskSubject`
   en vitest). Dry-run en `RepeatableRead`; `--apply` en `ReadCommitted` con
   `LOCK TABLE "User", "TenantMembership" IN SHARE ROW EXCLUSIVE MODE` (igual que `legacy-memberships`). Mensajes
   fijos en inglés como `legacy-memberships`. Rechazos extra además de los de 6.5 (todos sin escribir): email ambiguo
   (dos Users con el mismo email canónico), `revoke` de alguien sin membresía en ese tenant, `members`/`grant`/`revoke`
   con tenant inexistente. `pending` en 025a = Users sin membresía (todavía no hay `PlatformOperator`); incluye Users
   históricos sin `sub` (se muestran con `-`). `forget-pending` en 025a solo rechaza por membresía (operador y auditoría
   no existen hasta 025d). Sub enmascarado: `…` + últimos 4 si tiene más de 8 caracteres; si no, `…`.
7. **Probe**: el fixture crea `Professional` 1/`legacy-agenda` (desde cero la fundación no tiene profesional) y un
   tenant `tenant-b` con agenda y un `tenant-no-agenda`. Ids explícitos para `Professional` (`@default(1)`).

## Verificación (7.1.V, sin el build que es de 025a-2)

| Comando | Resultado |
|---|---|
| `npm run db:generate` | OK |
| `npm run typecheck --workspace apps/web` | OK (sin errores) |
| `npm run typecheck --workspace apps/bot` | OK (sin errores) |
| `npm run typecheck` (core, db, bot, web) | exit 0 |
| `npm run test` | **206 archivos ok, 1 skipped; 3334 tests ok, 1 skipped** (el skipped es el de `legacy-memberships.test.ts` bajo vitest, preexistente) |
| `bash packages/db/scripts/test-tenant-access.sh` | **OK, 12/12** (ver abajo) |
| `./ops/harness/verify.sh` | "Arnés OK." (único WARN: recordatorio genérico del bot; esta entrega no toca `apps/bot` ni encola `OutboundMessage`) |

Tests nuevos por archivo: `core/tenant-access.test.ts` 18; `db/domain/tenantAccess.test.ts` 16;
`db/scripts/tenant-access.test.ts` 32; `web/auth.test.ts` 25 (reescrito).

### Probe descartable `test-tenant-access.sh`

Docker del entorno (`docker` a secas, sin socket fijo), `postgres:16-alpine` con `--pull never`, red y contenedor
propios con label, tmpfs, `127.0.0.1` con puerto aleatorio, password aleatoria, copia del schema en un `mktemp -d`,
sin `.env` (el cliente Prisma generado no carga `.env`: `rootEnvPath`/`schemaEnvPath` nulos), `DATABASE_URL` validada
con regex en el `.sh` y en el `.ts`, limpieza con `trap` (verificado: no quedan contenedores, redes ni scratch).

```
1/4 upgrade: migraciones previas + fixture
2/4 upgrade: aplica 20261122013041_tenant_access_identity
3/4 instalación desde cero (todas las migraciones)        → columnas: TenantMembership.createdAt NOT NULL, User.createdAt NOT NULL, User.lastSignInAt NULL
4/4 integración
✔ upgrade: preserva las filas existentes y rellena createdAt
✔ registerGoogleIdentity: email igual con otro sub → conflict sin escrituras
✔ registerGoogleIdentity: email histórico sin sub (con mayúsculas/espacios) → conflict sin escrituras
✔ registerGoogleIdentity: sub nuevo → User pendiente; mismo sub → mismo User, solo lastSignInAt
✔ registerGoogleIdentity concurrente: mismo sub → un solo User; mismo email con subs distintos → uno linked
✔ pending lista identidades sin membresía con el sub enmascarado
✔ 6.4 ensayo: grant en dry-run no escribe; --apply da acceso a la identidad del padrón
✔ 6.4 ensayo: una cuenta fuera del padrón queda pendiente y sin acceso; forget-pending la borra
✔ grant rechaza sin escribir: otro tenant (D7), sin sub, sin User, tenant inexistente o sin agenda principal
✔ revoke: rechaza el último OWNER; con dos OWNER permite quitar uno; dry-run no escribe
✔ forget-pending rechaza a un User con membresía
✔ decideTenantAccess con hechos reales: otro tenant → tenant_not_enabled; dos membresías → multiple_memberships
ℹ tests 12 · pass 12 · fail 0   (≈80 s)
test-tenant-access: OK
```

Cada rechazo y cada dry-run compara una foto `jsonb_agg` de `User` y `TenantMembership` antes y después (patrón de
`legacy-memberships.test.ts`).

## Fuera de alcance / pendientes (no hechos a propósito)

- Todo 025a-2: `isMutatingPanelRequest`, textos de acceso, `tenant-context.ts`, `signIn` sin lista, middleware Node,
  `/inicio` y `NoAccessScreen`, callback MP, retiro de `ALLOWED_EMAILS`, README/deploy README, `next` `^15.5.0`,
  `npm run build` y `docker build`.
- `package.json` export `./domain/tenantAccess` (es de 025b-1 M0); `auth.ts` importa desde `@nutri-bot/db/domain`.
- No corrí `test-legacy-memberships.sh` ni los demás `test-*.sh` de HU-024: tienen el socket de Docker de Leo fijo (P12)
  y `legacy-memberships.ts` solo cambió en el texto de `--help`.
- Fase 0 de 6.4 en el VPS (`GOOGLE_CALENDAR_OWNER_EMAIL`, `tsx --version` en la imagen) queda para el operador. La
  imagen `nutribot-bot` que usa el servicio `migrate` copia todo el repo (`COPY . .`), así que incluye `packages/core`
  (que importa el script) y `tsx`.

## Bloqueos

Ninguno.
