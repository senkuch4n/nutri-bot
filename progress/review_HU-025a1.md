# Review — HU-025a1 (entrega 025a-1 de HU-025)

**Veredicto:** APPROVED

Alcance revisado: `git diff a7500b0..feat/HU-025a1-registro-identidad` (commits `65066b7`..`9cece44`, HEAD `9cece44`)
contra la SDD `Refactorizaciones/autenticacion-permisos-tenant.md` §7.1 "Checklist 025a-1" y §2, 2.1, 4.1, 4.2, 4.6,
5.1, 6.1, 6.2, 6.4 (fases 0 y 1), 6.5 y 10.1–10.3.

Lo que corrí yo (no tomé el reporte del implementer como prueba):

| Comando | Resultado |
|---|---|
| `npm run typecheck` (core, db, bot, web) | limpio |
| `npm run test` | 206 archivos ok, 1 skipped; 3334 tests ok, 1 skipped |
| `bash packages/db/scripts/test-tenant-access.sh` (Postgres descartable) | `test-tenant-access: OK`, 12/12. Después no quedaron contenedores ni redes con la label `hu025.tenant-access` |
| `./ops/harness/verify.sh` | `Arnés OK.`, exit 0 (el único WARN es el recordatorio genérico del bot; esta entrega no toca `apps/bot`) |

No toqué la base de desarrollo: el probe usa `--pull never`, tmpfs, `127.0.0.1` con puerto aleatorio, y valida
`DATABASE_URL` con regex en el `.sh` (l. 55) y en el `.ts` (l. 10-13). La integración pasa un `db` explícito a
`registerGoogleIdentity`/`loadAccessFacts`.

## Checkpoints
- C1 backlog válido, como mucho 1 HU activa por responsable: [x] (verify.sh OK; `backlog/HU-025.json` en `en_revision`, sin commitear en el working tree, lo maneja el orquestador)
- C1 `progress/current-senkuch4n.md` refleja la HU: [x]
- C1 el diff no toca archivos de HU de la otra persona: [x]
- C1 `verify.sh` exit 0: [x]
- C2 `docs/hu-autenticacion-permisos-tenant.md` completo con dudas validadas (§9): [x]
- C2 SDD con workspaces, checklist atómico y contrato: [x]
- C2 firmas = contrato compartido: [x]. 4.1: tipos, `decideTenantAccess(facts, opts?)` y `canonicalEmail` exactos (`packages/core/src/tenant-access.ts:4-62`). 4.2: `LEGACY_TENANT_ID`, `GoogleIdentity`, `IdentityRegistration`, `registerGoogleIdentity(identity, now?, db?)` y `loadAccessFacts(userId, now, db?)` exactos (`packages/db/domain/tenantAccess.ts:8-87`). Los tipos de cliente salen por función, como permite 4.2. 4.6: `token.userId`/`session.userId` (`apps/web/src/types/next-auth.d.ts`); el JWT no guarda rol ni tenant.
- C3 lógica pura en core y base en `packages/db/domain`, sin duplicar: [x]
- C3 schema/domain cambiados, web y bot compilan: [x]. Ningún consumidor del bot usa `User`/`TenantMembership`.
- C3 migración coherente, sin pasos destructivos, `NOT NULL` con default: [x]. Ver detalle abajo.
- C3 rutas nuevas protegidas, portal: [x] (N/A: no hay rutas nuevas)
- C3 bot en silencio y textos: [x] (N/A: no toca el bot)
- C3 sin `console.log` de debug ni TODOs: [x]. Los únicos `console.log` nuevos son la salida del CLI (`tenant-access.ts:210,217`) y el `--help` de `legacy-memberships.ts:47`.
- C4 `npm run typecheck` limpio: [x]
- C4 lógica de core con vitest y `npm run test` pasa: [x]
- C4 flujo del bot simulado: [x] (N/A)
- C4 PDF/documento: [x] (N/A)
- C5 `progress/impl_HU-025a1.md` describe lo tocado: [x]
- C5 `progress/review_HU-025a1.md` con veredicto: [x]
- C5 sin scripts sueltos ni datos de prueba en la base de desarrollo: [x]. El probe limpia con `trap` (lo verifiqué) y la base de desarrollo solo recibió migraciones (2.1 + 5.1, con `pg_dump` previo según el reporte).

## Verificación de los puntos pedidos

1. **Migración `20261122013041_tenant_access_identity`**: el SQL es exactamente el de 5.1. Agrega dos columnas
   `NOT NULL DEFAULT CURRENT_TIMESTAMP` y una nullable. No tiene `DROP`, cambios de tipo, índices ni constraints, y no
   toca triggers, vista ni esquema `recipe_reference_guard`, índices parciales de JID, `Agenda_primary_per_tenant_key`
   ni FKs compuestas. En PG ≥ 11 un default no volátil es un fast default (no reescribe la tabla). El lock
   `ACCESS EXCLUSIVE` es momentáneo, sobre tablas chicas. Es seguro para `migrate deploy` con filas en `User`. El
   probe lo confirma: el upgrade sobre un fixture preserva las filas y rellena `createdAt`, y la instalación desde cero
   deja las nulabilidades esperadas. Binario anterior: su cliente Prisma no selecciona las columnas nuevas y sus
   `INSERT` (`legacy-memberships.ts:84,94`) toman el default. Compatible.
2. **Seguridad del login** (`apps/web/src/auth.ts`):
   - `verifiedGoogleIdentity` (l. 14-27) exige `provider === "google"`, `email_verified === true`, un `sub` string no
     vacío igual a `providerAccountId` y un email canónico no vacío.
   - `registerGoogleIdentity` no reasigna nada. Si el `sub` existe, solo actualiza `lastSignInAt` y deja el email
     (`tenantAccess.ts:43-46`). Un email existente con otro `sub` o sin `sub` da `conflict` sin escrituras
     (l. 49-52, por `lower(btrim(email))`).
   - Ante un conflicto, el JWT queda sin `userId` y el log es solo `[auth] identity_conflict` (l. 83-86; el test
     verifica que el log no lleva ni email ni `sub`).
   - El acceso al panel no cambia: `signIn` y `authorized` de `auth.config.ts` siguen con `allowedEmails` y no están en
     el diff. `callbacks: { ...authConfig.callbacks, jwt, session }` conserva `signIn`. Como `signIn` corre antes que
     `jwt`, solo se registran identidades que ya están en la lista.
   - Un conflicto no deja a nadie afuera: solo sin `userId`, el mismo efecto que antes tenía un `sub` sin `User`.
3. **Concurrencia**: la transacción es `ReadCommitted` con `pg_advisory_xact_lock(hashtext('user-identity'))` antes de
   cualquier lectura (`tenantAccess.ts:38-41`). En RC cada sentencia posterior al lock ve lo que commiteó la sesión
   anterior. Un `P2002` (por ejemplo, contra un `INSERT` de `legacy-memberships`, que toma `SHARE ROW EXCLUSIVE` y no
   el advisory lock) se traduce a `conflict` (l. 61-64). El probe lo cubre con 6 llamadas concurrentes: mismo `sub` → un
   solo User; mismo email con `sub` distintos → 1 `linked` y 5 `conflict`.
4. **Script `tenant-access.ts`**:
   - Es dry-run por defecto: `--apply` es opcional y solo está permitido en `grant`, `revoke` y `forget-pending`.
   - Con `--apply` corre en `ReadCommitted` con `LOCK TABLE "User", "TenantMembership" IN SHARE ROW EXCLUSIVE MODE`
     (l. 189-204).
   - Los errores salen con mensaje fijo y sin stack (l. 223-227).
   - El `sub` se enmascara (`maskSubject`, l. 92-95). No hay tokens. El probe verifica que el `sub` completo no
     aparece.
   - Rechazos extra a la SDD, todos razonables, en el sentido de fallar cerrado y sin escribir: email ambiguo (dos
     Users con el mismo email canónico, l. 109), `revoke` de alguien que no es miembro (l. 166), y tenant inexistente
     en `members`/`grant`/`revoke` (l. 113-117).
5. **Commit intermedio `c0d84e8`**: lo acepto. Ese árbol compila (`next-auth.d.ts` conserva `privateContentUserId`
   `@deprecated` en `Session`), y `9cece44` lo arregla en la misma rama y el mismo PR. Producción solo se deploya desde
   `main`, con el PR entero, así que ese estado no llega a correr.
6. **Tests**:
   - 10.1, en lo que corresponde a 025a-1: `unlinked` (null y sin sub), `no_membership`, `member` OWNER/STAFF,
     `multiple_memberships`, `tenant_not_enabled`, sin candado → ok, membresía + permiso → manda la membresía, y
     `canonicalEmail` con el caso de la SDD. `isMutatingPanelRequest` es de 025a-2 y los casos de soporte son de 025d.
   - 10.2 `auth.test.ts`: registro, conflicto, `sub ≠ providerAccountId`, `email_verified` false o ausente, email vacío,
     `session.update()` forjado, y calendario con y sin membresía (pendiente, otro tenant, dos membresías, User
     inexistente, no dueña, agenda ausente, error de base).
   - 10.3: upgrade, los 4 casos de 6.2 más el concurrente, `grant`/`revoke`/`forget-pending`/`pending`/`members` en
     dry-run y `--apply`, segunda membresía en otro tenant, último OWNER, y el ensayo 6.4 con dos identidades
     sintéticas. Cada rechazo y cada dry-run compara una foto `jsonb_agg` de antes y después.

## Cambios requeridos (si CHANGES_REQUESTED)
Ninguno.

## Dudas (no bloqueantes)
- **D10 entre la fase 1 y la fase 3 de 6.4:** `maybeStoreCalendarToken` (`auth.ts:31-33`) exige ser `member` de
  `legacy-tenant`. Cuando Daiana vuelva a entrar en la fase 2 (con `prompt=consent`), ese refresh token **no** se
  guarda, porque todavía no tiene membresía. El token anterior sigue sirviendo, pero si el calendario está con error de
  sincronización en ese momento, no se reconecta hasta otro login después de la fase 3. Es lo que pide la SDD; conviene
  sumarlo al procedimiento de deploy ("después de la fase 3, si `/ajustes` muestra error de calendario, volver a
  entrar").
- **`pending`** (`tenant-access.ts:119-130`) también lista Users sin `googleSubject` (se ven con `-`), y la SDD define
  pendiente como "con `sub` y sin membresía". Es inofensivo y hasta útil para encontrar históricos, pero el chequeo
  "`pending` → vacío" de la fase 1 podría no dar vacío si en producción hubiera algún User sin `sub` sin membresía
  (con `legacy-memberships` no debería haber). `forget-pending` también aceptaría borrar uno de esos Users.
- **`decideTenantAccess`** ignora los hechos de plataforma en 025a (`tenant-access.ts:36-38`) y falla cerrado. Está
  documentado. En 025d hay que reemplazar el test "025a: hechos de plataforma sin membresía no dan acceso" por los
  casos de soporte de 10.1.
- **Sesiones abiertas en producción:** después del deploy de 025a-1, un JWT viejo (solo `privateContentUserId`) pierde
  recetas y plantillas hasta volver a entrar. Está aceptado en 4.6, y el test de `private-content-access.test.ts` lo
  fija. Es la fase 2.
- El advisory lock de `registerGoogleIdentity` es global (serializa todos los logins). Con esta escala está bien.
- La detección de "agenda ausente" por comparar el texto del error (`auth.ts:35-39`) ya existía antes de esta entrega.
