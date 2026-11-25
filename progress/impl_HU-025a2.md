# Implementación HU-025a2 · Acceso por membresía

- SDD: `Refactorizaciones/autenticacion-permisos-tenant.md`, 7.1 "Checklist 025a-2" (con 2, 4.1, 4.5, 4.6, 6.1,
  6.3, 6.4 fase 4, 8, 9.1, 9.4 y 10).
- Worktree: `/Users/joelmiguelserrudo/Projects/Nutri-Bot-HU025a2`, rama `feat/HU-025a2-acceso-por-membresia`,
  encima de `9cece44` (025a-1). No modifiqué ningún commit de 025a-1.
- Modelo: Opus. Skills aplicados: `apple-design`, `ui-ux-pro-max`, `ui-styling` y `web-design-guidelines` (autochequeo).
- Sin migración, sin `migrate`, sin seed, sin escrituras en la base de desarrollo (el smoke test solo leyó un `User`
  inexistente). Ningún mensaje de WhatsApp, no levanté el bot. Sin push ni PR.
- **Estado: done.**

## Commits (uno por tarea)

| Commit | Tarea del checklist |
|---|---|
| `aa05837` feat(core): isMutatingPanelRequest y textos de acceso | core: `isMutatingPanelRequest` + tests; textos de acceso (9.1) |
| `54b7606` feat(web): getTenantContext y requireTenantContext con candado legacy | `lib/tenant-context.ts` (4.5) + tests (10.2) |
| `60228f1` refactor(web): resolvePrivateContentAccess como wrapper de getTenantContext | wrapper (mismo retorno, `mode` default `"write"`) |
| `d19b2c7` feat(web): OAuth de Mercado Pago exige contexto de consultorio | callback MP + `connectMercadoPagoAction` con `requireTenantContext("write")` |
| `02b214f` feat(web): signIn por identidad de Google verificada | `auth.config.ts`: `signIn` (6.1 paso 1), sin `allowedEmails`, sin `authorized` |
| `089c7dc` feat(web): middleware en runtime Node | `middleware.ts` opción A + `next` `^15.5.0` + test |
| `fc22d19` feat(web): layout del panel exige contexto | `(panel)/layout.tsx` con `requirePageContext()` |
| `6f47431` feat(web): NoAccessScreen en /inicio y /login | 9.1: `NoAccessScreen`, `AuthCard`, `/inicio`, `/login`, `LoginScreen`; tests de render |
| `0e7c5e7` chore: retirar ALLOWED_EMAILS | `.env.example`, `deploy/.env.example`, `seed.ts` (+ test), `README.md`, `deploy/README.md`, comentario de `calendar-token-owner.ts` |
| `42dae17` test(web): recetas mockean getTenantContext | arreglo de tres tests que quedaron rotos por el wrapper (ver desvíos) |

La tarea "Logs: solo códigos (D11)" no generó commit: revisé los logs y ya cumplían la regla (ver más abajo).

## Archivos

**packages/core**
- `src/tenant-access.ts`: `isMutatingPanelRequest` (firma exacta de 4.1; lista cerrada de GET que escriben:
  `/api/mercadopago/oauth/callback`, tolera una barra final). `src/tenant-access.test.ts`: casos de 10.1 y algunos más.
- `src/access-text.ts` (nuevo): `ACCESS_TEXT` y `noAccessCopy(reason: AccessDenial)`. `src/access-text.test.ts` (nuevo).
  `src/index.ts`: exporta `access-text`.

**apps/web**
- `src/lib/tenant-context.ts` (nuevo, `server-only`): `TenantContext`, `TenantAccessResult`, `getTenantAccess` (React
  `cache()`), `getTenantContext`, `TenantAccessError` (`code`: `no_context | read_only | owner_only | blocked_in_support`),
  `requireTenantContext(mode?)`, `requireOwnerContext`, `requirePageContext`, `ENABLED_TENANT_IDS = [LEGACY_TENANT_ID]`.
  + `tenant-context.test.ts` (22 tests).
- `src/lib/private-content-access.ts`: wrapper de `getTenantContext()`. + `private-content-access.test.ts` reescrito.
- `src/auth.config.ts`: `verifiedGoogleIdentity` (se movió desde `auth.ts`), `signIn` por identidad verificada, sin
  `allowedEmails` ni `authorized`. + `auth.config.test.ts` (nuevo). `src/auth.ts`: importa `verifiedGoogleIdentity` de
  `auth.config` (mismo comportamiento; `auth.test.ts` de 025a-1 pasa sin cambios).
- `src/middleware.ts`: opción A. `export default auth(panelGate)`, `config.runtime = "nodejs"`, el mismo matcher.
  `src/middleware.test.ts`: se conservaron los tests del matcher que ya había y se agregaron los de 6.3.
- `package.json`: `"next": "^15.5.0"`. Raíz `package-lock.json`: el mismo rango en `packages["apps/web"]` (lo pide `npm ci`).
- `src/app/(panel)/layout.tsx`: `await requirePageContext()` en lugar de `if (!session?.user) redirect("/inicio")`.
- `src/components/login-screen.tsx`: se extrajo `AuthCard` (la cáscara), y `LoginScreen` usa `ACCESS_TEXT`.
- `src/components/no-access-screen.tsx` (nuevo), `src/components/access-gate-screen.tsx` (nuevo: los tres estados de
  8.1), `src/app/inicio/page.tsx`, `src/app/login/page.tsx`. + `src/components/access-screens.test.ts` (nuevo).
- `src/app/api/mercadopago/oauth/callback/route.ts` (+ test), `src/app/(panel)/ajustes/actions.ts`
  (`connectMercadoPagoAction`) + `mercadopago-actions.test.ts`. A `ajustes/actions.test.ts` y `logo-actions.test.ts` se
  les agregó el mock de `@/lib/tenant-context`.
- `src/lib/calendar-token-owner.ts`: solo el comentario.
- Tests de recetas que pasaban por el wrapper con un mock de Prisma: `app/(panel)/recetas/actions.test.ts`,
  `app/api/recetas/fotos/[photoId]/route.test.ts`, `app/api/recetas/importacion/[imageId]/route.test.ts`.

**packages/db**
- `prisma/seed.ts`: `seedProfessionalEmail(env)` = `SEED_PROFESSIONAL_EMAIL?.trim() || "nutricionista@example.com"`.
  + caso en `prisma/seed.test.ts`.
- `scripts/legacy-memberships.test.ts`: ya no inyecta `ALLOWED_EMAILS` en el entorno del CLI (`env: process.env`).

**Raíz**
- `.env.example`, `deploy/.env.example`, `README.md` (nueva sección "Acceso al panel (HU-025)" con `tenant-access`),
  `deploy/README.md` (nueva sección "Acceso al panel por membresía (HU-025)", que enlaza 6.4 y resume las fases 3 y 4 y
  el rollback).

## Contrato compartido: lo que coincide con la SDD

- 4.1: `isMutatingPanelRequest(r: { method; pathname; isServerAction }): boolean`, firma exacta.
- 4.5: los nombres y las firmas son exactos: `TenantContext`, `TenantAccessResult`, `getTenantAccess: () =>
  Promise<TenantAccessResult>`, `getTenantContext()`, `TenantAccessError` con `readonly code`,
  `requireTenantContext(mode?: "read" | "write")`, `requireOwnerContext()`, `requirePageContext()`, `ENABLED_TENANT_IDS`.
  `resolvePrivateContentAccess(mode: "read" | "write" = "write")` conserva su retorno `{ userId, tenantId, role }`.
- 4.6: `session.userId`/`token.userId` (de 025a-1). El JWT no guarda ni rol ni tenant.
- Textos: `ACCESS_TEXT` en `packages/core`, como pide la sección 9. Además agregué `noAccessCopy` y el tipo
  `NoAccessCopy`, que son nuevos y no reemplazan nada del contrato.

## Decisiones no obvias y desvíos

1. **Agenda principal ausente.** La 10.2 pide "sin contexto", pero `AccessDenial` no tiene una razón para ese caso.
   `getTenantAccess` devuelve `reason: "tenant_not_enabled"` y loguea `[auth] tenant_scope_missing`. Así no amplié el
   contrato, y `/inicio` muestra el aviso genérico. El middleware no lee la agenda: con membresía vigente deja pasar, y
   el layout redirige a `/inicio`. No hay bucle, porque `/inicio` muestra el aviso y no redirige.
2. **`requireTenantContext`:** el default es `"write"` para fallar cerrado (la SDD no fija el default). El chequeo de
   soporte `READ_ONLY` ya está escrito, pero en 025a no se puede alcanzar.
3. **Sesión sin `userId`** (conflicto de identidad o JWT viejo) → `reason: "unlinked"`, con el email de la sesión. Sin
   sesión → `"unauthenticated"`, que muestra `LoginScreen`.
4. **Textos de 025d:** `noAccessCopy("support_no_grant" | "support_multiple_grants")` devuelve por ahora el aviso
   genérico. El texto propio de `support_no_grant` es de 025d y no lo implementé.
5. **Orden de los commits:** el de Mercado Pago va antes que el de `auth.config.ts`. Si iba después, el commit que borra
   `allowedEmails` no compilaba (el callback lo importaba). El commit de `auth.config.ts` deja un estado intermedio sin
   `authorized` hasta el commit siguiente (el middleware). Es solo dentro de la rama: el PR va completo.
6. **`verifiedGoogleIdentity` se movió de `auth.ts` a `auth.config.ts`** para que `signIn` (paso 1) y `jwt` usen la misma
   regla. Es un commit nuevo; no se tocó el de 025a-1.
7. **`private-content-access.test.ts` reescrito.** El de 025a-1 mockeaba `prisma.user.findFirst`, y el wrapper ya no
   consulta Prisma directo. Los casos (sin contexto, OWNER/STAFF, revocada entre dos llamadas) ahora se prueban contra
   `getTenantContext`, más los de soporte. La cadena completa (sesión → membresía → candado → agenda) está en
   `tenant-context.test.ts`.
8. **Tres tests de recetas** (`recetas/actions`, `api/recetas/fotos`, `api/recetas/importacion`) dejaron de andar al
   pasar al wrapper: el mock de `@nutri-bot/db/domain` no exportaba `LEGACY_TENANT_ID`. No les cambié ninguna
   aserción. Les agregué un mock de `@/lib/tenant-context` que reproduce la cadena sesión → una membresía OWNER/STAFF
   sobre sus propios `mocks.auth`/`mocks.findUser`. Ese mock no aplica el candado legacy, que se prueba en
   `tenant-context.test.ts`. Fueron en un commit aparte (`42dae17`) porque los encontré al correr la suite completa.
9. **`grep -rn "ALLOWED_EMAILS\|allowedEmails" apps packages .env.example deploy README.md` devuelve 1 resultado, no 0:**
   `deploy/README.md:72`, en la nota de rollback de 6.4 ("`ALLOWED_EMAILS` se deja en `deploy/.env` hasta que 025b-1
   esté en producción y estable"). La SDD pide documentar eso, y el operador necesita saber qué línea conservar. En
   `apps/` y `packages/` no queda ninguna referencia, ni en el código ni en los tests.
10. **NoAccessScreen:** el título usa `text-title-2`, no `text-title-1`. Los títulos de 9.1 son frases largas y, en una
    tarjeta `max-w-sm`, con `title-1` quedaban en 3 o 4 líneas. Sigue siendo `h1` con `text-balance`. La línea
    "Iniciaste sesión como `<email>`." aparece en todas las razones si hay email (también en `multiple_memberships`), porque
    el objetivo de 9.1 incluye "con qué cuenta entró". "Reintentar" es un `ButtonLink` `plain` a `/` con
    `prefetch={false}`, para no disparar el middleware en el prefetch. "Usar otra cuenta" llama a
    `signOut({ redirect: false })` y después a `signIn("google", { redirectTo: "/" }, { prompt: "select_account consent" })`.
    El login normal no cambia (R15).
11. **`/login`** ahora es `force-dynamic`, igual que `/inicio`, porque los dos leen la sesión y la base.
12. **Middleware y server actions sin acceso:** en 025a devuelven `401 {"error":"unauthorized"}`. El paso al handler
    queda para 025b, según 6.3.
13. **`disconnectMercadoPagoAction`** sigue con su chequeo de sesión. La SDD pone en 025a-2 solo la acción que inicia el
    OAuth; el resto de MP es M4 de 025b-2. En 025a ya la cubre el middleware (una server action sin acceso → 401).

## Logs (D11)

En las piezas que tocó la entrega, los logs son solo códigos, y hay tests que verifican que no salen ni el email ni el
`userId`:
- `[auth] sign_in_rejected reason=unverified_identity` (`auth.config.ts`)
- `[auth] access_denied reason=<AccessDenial>` (middleware)
- `[auth] tenant_scope_missing` (`tenant-context.ts`)
- `[auth] identity_conflict` (`auth.ts`, de 025a-1, sin cambios)
- `[mercadopago] oauth_callback_failed` (callback, sin cambios)

## Verificación (desde el worktree)

| Comando | Resultado |
|---|---|
| `npm run typecheck` (core, db, bot, web) | OK, sin errores (`apps/web` **y** `apps/bot`) |
| `npm run test` | **210 archivos OK, 1 saltado; 3418 tests OK, 1 saltado**. Antes del commit `42dae17` fallaban los 3 de recetas (desvío 8). |
| `npm run build --workspace apps/web` | OK (`exit 0`, "Compiled successfully"). `.next/server/middleware-manifest.json` → `"middleware": {}` (no es Edge). `functions-config-manifest.json` → `"/_middleware": { "runtime": "nodejs" }`. El standalone incluye `.next/server/middleware.js` y su `.nft.json` trae `.prisma/client` (con el engine). **La opción A compila: no hizo falta la B.** Nota: el primer build tardó ~6 min porque `next/font` reintentó la descarga de fuentes ("socket hang up") por la red del sandbox. No es un error del código. |
| Smoke del standalone (`node apps/web/server.js`, puerto local) | Sin sesión: `/pacientes` → 307 a `/inicio`; `/api/slots` → 401 `{"error":"unauthorized"}`; server action (`POST` + `next-action`) → 401; `/inicio` → 200. Con un JWT sintético (`userId` que no existe, firmado con un secreto descartable): el middleware **leyó la base desde Node** (Prisma), logueó `[auth] access_denied reason=unlinked`, y respondió 307 en la página y 401 en la API; `/inicio` con esa sesión → 200 (aviso). Solo lectura: no se escribió nada. Un 500 intermedio fue un servidor de una corrida anterior, que seguía vivo sin `DATABASE_URL`; lo maté y repetí. |
| `docker build -f apps/web/Dockerfile .` | OK (`exit 0`): `npm ci` acepta el lock con `next ^15.5.0`, `db:generate`, build standalone y la imagen final (`naming to …:latest done`). Borré la imagen descartable después. |
| `bash packages/db/scripts/test-tenant-access.sh` | OK, 12/12 (Postgres descartable) |
| `./ops/harness/verify.sh` | "Arnés OK" (salteó typecheck/tests porque no hay cambios sin commitear; los corrí aparte, arriba) |
| `grep -rn "ALLOWED_EMAILS\|allowedEmails" apps packages .env.example deploy README.md` | 1 resultado, en la nota de rollback de `deploy/README.md` (desvío 9) |

**No corrí** `bash packages/db/scripts/test-legacy-memberships.sh`: tiene fijo el socket de Docker de Leo
(`unix:///Users/leonel/...`, problema P12 de la SDD). El único cambio en ese archivo es quitar la variable de entorno
`ALLOWED_EMAILS` que se le pasaba al CLI, y el script no la leía.

## "Hecho 025a": lo que cubre esta entrega

1. Un login con membresía entra (`middleware.test.ts`, `tenant-context.test.ts`) y uno sin membresía ve el aviso
   (`access-screens.test.ts`).
2. Dos membresías → aviso de D7 (los tres archivos de tests).
3. Email igual con sub distinto → `conflict` sin escrituras (probe de 025a-1, en verde).
4. Revocar la membresía corta la siguiente página, ruta API y server action (`middleware.test.ts`, "membresía revocada
   con la sesión abierta").
5. `ALLOWED_EMAILS` ya no se lee en ningún código.
6. El probe descartable reproduce 6.4 (025a-1, en verde).
7. Un tenant distinto de `legacy-tenant` → `tenant_not_enabled` (middleware y contexto).

## Observaciones sobre 025a-1 (no las corregí)

- No encontré bugs. Una nota: `auth.ts` duplicaba la verificación de identidad que ahora también necesita `signIn`. La
  moví a `auth.config.ts` en un commit nuevo (desvío 6), sin tocar los commits de 025a-1.
- `loadAccessFacts` ordena las membresías por `tenantId`. No afecta la decisión (con 2 se rechaza siempre), pero sí
  cuál es la primera en los logs y tests futuros.

## Riesgos y pendientes para el orquestador

- **Orden de producción (6.4):** publicar 025a-2 en `main` recién después de la fase 3, con la membresía `OWNER` de
  Daiana ya cargada. Si no, nadie entra al panel. Mantener `ALLOWED_EMAILS` en `deploy/.env` del VPS para el rollback a
  025a-1. Del VPS no toqué nada.
- El middleware Node importa `@nutri-bot/db/domain` (el índice completo) y suma una consulta a Postgres por request del
  matcher, prefetch incluido. Está aceptado por la SDD. Si en producción se nota la latencia, se puede reducir con un
  import directo de `domain/tenantAccess` (habría que exponerlo en `package.json` exports, como pide M0 de 025b-1).
