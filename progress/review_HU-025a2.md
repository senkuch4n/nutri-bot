# Review — HU-025a2 (entrega 025a-2 · acceso por membresía)

**Veredicto:** APPROVED

Alcance revisado: `git diff origin/develop..HEAD` en `feat/HU-025a2-acceso-por-membresia` (10 commits, `6eeb09c`..`73de4b2`,
40 archivos), contra la SDD `Refactorizaciones/autenticacion-permisos-tenant.md` 7.1 "Checklist 025a-2" y las secciones 2,
4.1, 4.5, 4.6, 6.1, 6.3, 6.4 (fase 4 y rollback), 8, 9.1, 9.4 y 10, más la sección 9 de la HU y C1 a C7.

## Verificación que corrí yo (desde el worktree)

| Comando | Resultado |
|---|---|
| `npm run typecheck` (core, db, bot, web) | exit 0 |
| `npm run test` | 210 archivos OK y 1 saltado; 3418 tests OK y 1 saltado; exit 0 |
| `npm run build --workspace apps/web` | exit 0. `.next/server/middleware-manifest.json` → `"middleware": {}` (no es Edge); `functions-config-manifest.json` → `"/_middleware": { "runtime": "nodejs" }`; `middleware.js.nft.json` traza `.prisma/client` con el engine |
| `docker build -f apps/web/Dockerfile .` | exit 0. Dentro de la imagen: `apps/web/.next/server/middleware.js` y `libquery_engine-linux-arm64-openssl-3.0.x.so.node`. Borré la imagen después |
| `bash packages/db/scripts/test-tenant-access.sh` | 12/12 OK (Postgres descartable, desde cero y upgrade) |
| `./ops/harness/verify.sh` | "Arnés OK", exit 0. No corrió typecheck ni tests porque no hay cambios sin commitear; los corrí aparte |
| `grep -rn "ALLOWED_EMAILS\|allowedEmails"` fuera de docs, progress y Refactorizaciones | una sola línea: `deploy/README.md:72`, la nota de rollback |

No escribí en la base de desarrollo, no mandé WhatsApp y no corrí seeds, `migrate` ni `db push`.

## Puntos de atención del orquestador

1. **Quién entra.** `middleware.ts:617-635` y `tenant-context.ts:517-547` exigen `session.userId` →
   `loadAccessFacts` → `decideTenantAccess({ enabledTenantIds: ENABLED_TENANT_IDS })`. Con mocks:
   - Sin userId: `middleware.test.ts` "sin sesión" y "sesión sin userId"; `tenant-context.test.ts` "conflicto…", "JWT
     anterior…" y "userId vacío".
   - Sin membresía, con dos membresías y fuera del candado: `middleware.test.ts`, it.each de 4 casos;
     `tenant-context.test.ts`.
   - Membresía revocada a mitad de sesión: `middleware.test.ts`, "membresía revocada con la sesión abierta", que cuenta
     4 lecturas; `tenant-context.test.ts` y `private-content-access.test.ts`.
   - Tenant distinto de `legacy-tenant` → `tenant_not_enabled`: los dos tests, y también el probe.

   `ALLOWED_EMAILS` no queda en `apps/` ni en `packages/`. `authorized` se borró (`auth.config.test.ts`, "ya no define
   authorized").
2. **Middleware Node, opción A.** `config.runtime = "nodejs"` y el matcher no cambió.
   - El matcher cubre las páginas del panel, `/api/*` y las server actions. Las acciones se postean al path de la página
     y, si se las manda a otra página, Next 15.5 las reenvía con `fetch` al path dueño (`action-handler.js:182/461`), así
     que pasan por la puerta igual.
   - Excluye `/portal`, `/inicio`, `/login`, `/api/auth`, `/acerca`, `/privacidad` y el webhook exacto de MP. Está
     testeado en `middleware.test.ts`, describe "matcher".
   - No escribe en la base. El `jwt` de `auth.ts` devuelve el token sin tocar la base cuando no hay `account`; la única
     escritura es la cookie de sesión que renueva Auth.js.
   - Costo por request del matcher: un `user.findUnique` con `memberships take 2`, que Prisma resuelve en 2 queries.
     Las páginas suman otra lectura en el layout (React `cache()`) y la de la agenda principal.
   - Build y Docker en verde, ver la tabla de arriba.
3. **Rollback a 025a-1.** No hay migración, el JWT tiene la misma forma (`userId`) y `deploy/compose.yml` usa
   `env_file: .env`: el código de 025a-1 vuelve a leer `ALLOWED_EMAILS` si la línea sigue en el `.env` del VPS, y
   `deploy/README.md:69-72` lo avisa. Los `User` pendientes que cree 025a-2 (cualquier Google verificado puede loguearse)
   no afectan a 025a-1, que los rechaza en `signIn`/`authorized` por la lista. Es compatible.
4. **OAuth de MP.** `callback/route.ts:15-22` y `ajustes/actions.ts:257-265` usan `requireTenantContext("write")`.
   - Solo `TenantAccessError` se traduce a `/inicio`; cualquier otro error se propaga.
   - El `state` sigue atado a `auth().user.email` canónico, que se pasa como `sessionEmail`.
   - Hay tests de los dos lados: sin contexto, con contexto pero sin email, y error que no es de acceso.
5. **UI (9.1 y 9.4).**
   - `NoAccessScreen` usa `noAccessCopy` y no nombra tenants. `tenant_not_enabled` y `unlinked` muestran el aviso
     genérico, y `access-screens.test.ts` verifica "no revela otros consultorios ni ids".
   - "Usar otra cuenta" (`no-access-screen.tsx:28-34`) hace `signOut({ redirect: false })` y después
     `signIn("google", { redirectTo: "/" }, { prompt: "select_account consent" })`. Es el texto exacto de 9.1: conserva
     `consent` y con él el refresh token.
   - `LoginScreen` sigue con `signIn("google", { redirectTo: "/" })` y el `prompt: "consent"` del proveedor, así que se
     cumple R15.
   - El form de `/inicio` está fuera del matcher, así que el botón anda sin membresía.
   - Navegación con la membresía revocada → `/inicio`, por el middleware y por `requirePageContext` en el layout.
6. **Logs.** Son solo códigos:
   - `[auth] sign_in_rejected reason=unverified_identity`
   - `[auth] access_denied reason=<AccessDenial>`
   - `[auth] tenant_scope_missing`

   Los tests verifican que no salen el email ni el `userId`. No hay tokens, `sub` ni contenido clínico.
7. **Desvíos del implementer.** Los evalué uno por uno en "Dudas".

## Checkpoints

- C1 `backlog/` válido y 1 HU activa por responsable: [x] (verify.sh: imleticio HU-024, senkuch4n HU-025)
- C1 bitácora refleja la HU: [x] No es parte del diff de la rama; la mantiene el orquestador en el repo principal
- C1 no toca archivos de la otra persona: [x]
- C1 `verify.sh` exit 0: [x]
- C2 `docs/hu-autenticacion-permisos-tenant.md` completo y validado: [x]
- C2 SDD con workspaces, checklist y contrato: [x]
- C2 firmas = contrato (4.1 `isMutatingPanelRequest`; 4.5 `TenantContext`, `TenantAccessResult`, `getTenantAccess`, `getTenantContext`, `TenantAccessError.code`, `requireTenantContext`, `requireOwnerContext`, `requirePageContext`, `ENABLED_TENANT_IDS`; `resolvePrivateContentAccess(mode = "write")` con el mismo retorno): [x]
- C3 lógica pura en core (`isMutatingPanelRequest`, `ACCESS_TEXT`/`noAccessCopy`) y dominio sin duplicar: [x]
- C3 web y bot compilan: [x] (no cambió `schema.prisma` ni firmas de `packages/db/domain`)
- C3 migraciones: [x] No aplica, no hay migración
- C3 rutas del panel protegidas y portal intacto: [x] Puerta central en el middleware + layout; `/portal` sigue fuera del matcher
- C3 bot en silencio y textos según la SDD: [x] El bot no se tocó; los textos de 9.1 coinciden con la SDD y la HU
- C3 sin `console.log` de debug ni TODOs: [x]
- C4 typecheck limpio: [x]
- C4 lógica nueva de core con tests y `npm run test` en verde: [x] (`tenant-access.test.ts`, `access-text.test.ts`)
- C4 flujo del bot simulado: [x] No aplica
- C4 PDF o documento: [x] No aplica
- C5 `progress/impl_HU-025a2.md` existe y describe lo hecho: [x] Los hashes que cita son de antes del rebase; los mensajes coinciden 1:1 con los 10 commits
- C5 `progress/review_HU-025a2.md` con veredicto: [x]
- C5 sin scripts sueltos ni datos de prueba: [x] `git status` solo muestra el impl sin trackear

## Cambios requeridos

Ninguno.

## Dudas (no bloqueantes)

Los desvíos del implementer, uno por uno:
1. **Agenda principal ausente → `tenant_not_enabled`.** Es aceptable: `AccessDenial` no tiene una razón propia y no
   se amplía el contrato. El log `tenant_scope_missing` distingue el caso. No hay bucle, porque `/inicio` no redirige
   salvo con `ok`. Un efecto lateral: en ese caso el middleware deja pasar las rutas API, porque no lee la agenda. Hoy
   las rutas que no usan el contexto (`/api/appointments`, `/api/slots`, `/api/diary/...`) operan igual sobre legacy
   hasta 025b-1. No es alcanzable con `legacy-tenant`, que tiene agenda principal.
2. **Default `"write"` en `requireTenantContext`.** Falla cerrado. OK.
3. **Sin userId → `unlinked`; sin sesión → `unauthenticated`.** Coincide con 9.1 ("identity_conflict se muestra como
   unlinked").
4. **Textos `support_*` genéricos hasta 025d.** OK.
5. **Orden de los commits (MP antes que `auth.config`).** OK. El estado intermedio sin `authorized` queda solo dentro
   de la rama.
6. **`verifiedGoogleIdentity` movido a `auth.config.ts`.** Es la misma regla para `signIn` y `jwt`, y `auth.test.ts`
   de 025a-1 sigue en verde. OK.
7. **`private-content-access.test.ts` reescrito.** Mantiene los casos (sin contexto, OWNER/STAFF, revocada entre dos
   llamadas) y agrega soporte. La cadena completa está en `tenant-context.test.ts`. OK.
8. **Tests de recetas con un mock de `@/lib/tenant-context`.** El mock reimplementa la cadena sin el candado
   (`tenantId: "tenant-a"`), y por eso esos tests ya no prueban el candado, que se cubre aparte. Aceptable para 025a. En
   025b conviene que mockeen `requireTenantContext` directo.
9. **`ALLOWED_EMAILS` en `deploy/README.md:72`.** Es la nota de rollback que pide 6.4. El objetivo del grep (0 en
   código) se cumple. OK.
10. **`text-title-2` en el título de `NoAccessScreen`.** 9.1 no fija la clase del título; sigue siendo `h1`. La línea
    "Iniciaste sesión como …" también aparece en `multiple_memberships`, lo que es coherente con el objetivo de 9.1.
    OK.
11. **`/login` con `force-dynamic`.** Necesario, porque lee sesión y base. OK.
12. **Server action sin acceso → 401.** Es lo que pide 6.3 para 025a. El paso al handler va en 025b.
13. **`disconnectMercadoPagoAction` sin `requireTenantContext`.** La SDD solo pide la acción que inicia el OAuth, y el
    middleware ya la cubre. Queda para M4 de 025b-2.

Otras dudas:
- **Aviso tras un rechazo de `signIn`.** 6.1 paso 1 menciona "/inicio?error=AccessDenied, aviso genérico", pero
  `AccessGateScreen` no lee `searchParams.error`. Sin sesión se muestra `LoginScreen` sin aviso. Antes tampoco había
  aviso, y ahora el rechazo solo ocurre con una identidad de Google no verificada. Conviene sumar el aviso en 025b o
  dejarlo explícito como fuera de alcance.
- **`legacy-memberships.test.ts`.** Ya no inyecta `ALLOWED_EMAILS` en el entorno del CLI. Era una guarda negativa ("la
  lista no otorga membresía"). Hoy nada la lee, así que no se pierde cobertura real. No pude correr
  `test-legacy-memberships.sh` por el socket fijo de Leo (P12).
- **Ruido en los logs.** Con una identidad pendiente navegando, cada request del matcher, prefetch incluido, loguea
  `access_denied`. Son solo códigos, pero pueden ser ruidosos en producción.
- **`getTenantAccess` consulta `prisma.agenda` directo en `apps/web`.** Solo lo usa la web, así que no rompe la regla de
  no duplicar. En 025b-1 debería pasar a `resolveTenantSchedulingContext` (4.3).
- **Producción.** Publicar 025a-2 a `main` recién después de la fase 3 de 6.4, con la membresía OWNER de Daiana cargada.
  Si no, nadie entra. Y no borrar `ALLOWED_EMAILS` del `deploy/.env` del VPS hasta que 025b-1 esté estable.
