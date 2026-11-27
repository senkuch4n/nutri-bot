# impl HU-033 · Portal y bot por consultorio (entrega 025c)

Estado: **done**. Alcance: §7.3 de `Refactorizaciones/autenticacion-permisos-tenant.md` **sin** `runBotAiTool` con
`tenantId` (`packages/db/domain/botAi.ts` + sus tests) **ni** la lectura de la profesional al inicio de
`handleIncoming` (`apps/bot/src/conversation.ts`), que hace la 028c (decisión D-c1 b del usuario).
Worktree `/Users/joelmiguelserrudo/Projects/Nutri-Bot-HU033`, rama `feat/HU-033-portal-por-consultorio` (desde
`origin/develop` `e7c0280`). Fecha: 2026-11-27. Modelo: Opus. Skill: `refactor` (el plan es este archivo; no se dejó un
`REFACTOR_PLAN.md` suelto en la raíz). Sin migración, sin tocar `schema.prisma`.
`backlog/HU-033.json` y este archivo quedan sin commitear (los maneja el orquestador).

## Commits (uno por paso del checklist, conventional, sin trailer)

| Commit | Paso de §7.3 |
|---|---|
| `5e1c4a1` feat(db): token del portal v2 atado a paciente y consultorio | 1 · `patientAuth.ts` v2 + test; consumidores web y bot en el mismo commit |
| `958280c` feat(web): sesión del portal atada al consultorio (getPortalSession) | 2 · `patient-session.ts`, `portal/login` + tests |
| `7896025` feat(web): páginas y descargas del portal con el consultorio de la sesión | 3 · páginas, acciones y las tres descargas + tests 404 |
| `91edd90` feat(web): layout del portal y shell con el consultorio de la sesión | 4 · `layout.tsx` + `lib/shell.ts` |
| `68a07d8` feat(bot): reserva y conversación con la profesional y los servicios del consultorio | 5 · `booking.ts` y `conversation.ts` (sin la parte de `runBotAiTool`, excluida) |
| `4dc834e` refactor: getProfessional queda solo para botAi y el inicio de handleIncoming | 6 · "Borrar getProfessional" parcial (ver abajo) |
| `7c7de25` feat(web): quitar el candado ENABLED_TENANT_IDS | 7 · fin del candado + test tenant B |
| — | 8 · logs (D11): sin cambios necesarios (ver abajo) |

## Archivos

**packages/db**
- `domain/patientAuth.ts`: formato v2 exacto de §4.7 (`p2.<patientId>.<tenantId>.<exp>.<firma>`, clave
  `HMAC(AUTH_SECRET, "nutribot/patient-portal")`, mensaje `patient-portal:v2|…`, ids `/^[A-Za-z0-9_-]{1,64}$/`,
  `timingSafeEqual`). `createPatientToken(claims, ttl)` tira si falta `AUTH_SECRET` o un id es inválido;
  `verifyPatientToken` nunca tira y devuelve `PatientPortalClaims | null`.
- `domain/patientAuth.test.ts` (nuevo, 11 casos): formato y firma, válido, vencido (borde exacto), v1 rechazado aunque su
  firma v1 sea correcta, patientId/tenantId/exp cambiados, firma cambiada/otro secreto/secreto crudo sin separación de
  dominio, partes ≠ 5 o prefijo distinto, ids con punto/espacio/>64, `AUTH_SECRET` ausente.
- `domain/recipes.ts`: `patientCanSeeRecipePhoto(t, patientId, photoId)` exige `recipe.tenantId = t.tenantId` y plan
  ACTIVE del paciente con `tenantId` y `patient.tenantId` del consultorio. `recipes.test.ts` actualizado.
- `domain/availability.ts`: `getProfessional` sigue, con el comentario `// 028c lo reemplaza (D-c1 b)`.
- `domain/appointments.test.ts`, `domain/prescriptions.test.ts`: se sacan mocks muertos de `getProfessional` (los módulos
  probados no lo usan).
- `scripts/test-consultations.ts`, `test-prescriptions.ts`, `test-isak.ts`: `getTenantProfessional(T.tenantId)`.
  `scripts/test-recipes.ts`, `test-recipe-picker.ts`: firma nueva de `patientCanSeeRecipePhoto` con el tenant legacy.

**apps/web**
- `lib/patient-session.ts`: `setPatientSessionCookie(claims)`, `PortalSession`, `getPortalSession()` (`findFirst({ where:
  { id, tenantId } })`, sin `archivedAt`, D9c), `getPortalPatient()` = `(await getPortalSession())?.patient ?? null`.
  Test nuevo `lib/patient-session.test.ts` (usa el token real): cookie v2 guardada, sin cookie, cookie v1 → null sin
  tocar la base, paciente de otro consultorio → null, archivado entra.
- `app/(portal)/portal/login/route.ts`: canjea las claims v2. Test nuevo `login/route.test.ts` (v2 válido, sin token,
  v1, consultorio cambiado → `/portal?error=invalid`).
- `app/(portal)/portal/page.tsx`, `plan/page.tsx`, `diario/page.tsx`, `evolucion/page.tsx`: `getPortalSession` +
  `getTenantProfessional(session.tenantId)`; turnos, planes y evolución con `tenantId`, diario con `patient: { tenantId }`.
- `diario/actions.ts`: tenant de la sesión. El borrado busca `{ id, patientId, patient: { tenantId } }`: una entrada de
  otro paciente o de otro consultorio ahora responde **igual que inexistente** (`{ ok: true }`, sin borrar). Antes
  devolvía `deleteError` para otra paciente del mismo consultorio (distinguía existencia; regla §2 "ids ajenos =
  inexistentes"). Test actualizado.
- Descargas: `plan/pdf/route.ts`, `diario/photo/[id]/route.ts`, `recetas/fotos/[photoId]/route.ts` con paciente y
  consultorio de la sesión. Tests nuevos `plan/pdf/route.test.ts`, `diario/photo/[id]/route.test.ts`; actualizado
  `recetas/fotos/[photoId]/route.test.ts`. Cada uno prueba que la consulta lleva paciente + tenant y que un id de otro
  paciente/consultorio y uno inexistente dan el mismo 404 con el mismo cuerpo.
- `app/(portal)/layout.tsx`: con sesión usa `session.tenantId`; sin sesión `LEGACY_TENANT_ID` (nombre y WhatsApp de la
  pantalla de acceso y título de la pestaña). Test nuevo `layout.test.tsx`.
- `lib/shell.ts`: `getProfessionalPortalContact(tenantId)` y `getPortalDocumentTitle(tenantId)` con
  `findTenantProfessionalSummary`; se borra `getProfessionalPortalName` (no tenía usos). Ya no hay `where: { id: 1 }`.
  Test nuevo `lib/shell.test.ts`.
- `lib/professional.ts`: deja de reexportar `getProfessional`. `lib/food-policy.test.ts`: mock actualizado.
- `guard-coverage.test.ts`: `LEGACY_EXEMPT` queda vacío (se sacan `lib/shell.ts` y `lib/professional.ts`) y la regla (c)
  ahora también recorre `app/(portal)`.
- `lib/tenant-context.ts`, `middleware.ts`: se borra `ENABLED_TENANT_IDS`; `decideTenantAccess(facts)` sin
  `enabledTenantIds`. Tests: `tenant-context.test.ts` (el módulo ya no exporta el candado; un tenant B sintético con
  membresía obtiene su contexto `tenant-b`/`agenda-b` y solo se resuelve la agenda de B), `middleware.test.ts` (B pasa
  la puerta; el test de headers forjados ahora usa una identidad sin membresía).

**apps/bot**
- `src/conversation.ts`: opción 4 con `createPatientToken({ patientId, tenantId: patient.tenantId }, 15)`. El resto de las
  lecturas de la profesional pasan por `conversationProfessional()` = `getTenantProfessional((await
  getConversationTenant()).tenantId)` (paso del día, resumen, confirmación, cancelar, confirmar cancelación,
  `handleIncomingMedia`). El tipo `Professional` pasa a `TenantProfessional`.
- `src/booking.ts`: `listActiveServices` y `cancelableAppointments` filtran por el `tenantId` de la conversación;
  `nextAvailableDays`/`slotsForDay` toman la zona horaria de `getTenantProfessional`. Firmas sin cambios (resuelven el
  tenant con `getConversationTenant()`, el único punto del bot). Test nuevo `src/booking.test.ts`.
- Tests: `conversation-booking.test.ts` (token v2; paciente sin tenant; la confirmación usa `getTenantProfessional` y
  `getProfessional` se llama una sola vez, la del inicio), `conversation-attendance.test.ts` (mock).
- Scripts `test-after-hours-inquiry.ts`, `test-bot-ai-questions.ts`, `test-booking-reason.ts`: `getTenantProfessional`.

## Contrato compartido (§4.7) — coincide

`PatientPortalClaims`, `createPatientToken(claims, ttlMinutes)`, `verifyPatientToken(token): PatientPortalClaims | null`,
`setPatientSessionCookie(claims)`, `PortalSession`, `getPortalSession()`, `getPortalPatient()`: nombres y firmas exactos.
`patientCanSeeRecipePhoto(t, patientId, photoId)` como en §4.4.

## Qué quedó vivo de `getProfessional` y por qué

`grep -rn "getProfessional()" apps packages` **no da 0** (el 7.3.V lo pide), por decisión D-c1 b. Quedan:
- `packages/db/domain/availability.ts:24` — la definición, con `// 028c lo reemplaza (D-c1 b)`.
- `packages/db/domain/botAi.ts:173,195,212,236` — `runBotAiTool` (excluido, 028c).
- `apps/bot/src/conversation.ts:175` — inicio de `handleIncoming` (excluido, 028c), con el mismo comentario.
- Tests de la función misma o de botAi: `professionalSelect.test.ts`, `signature-privacy.test.ts`,
  `gcal-and-ai-privacy.test.ts`, `botAi.test.ts` (no tocados).
- Comentarios en `tenantScope.ts:93` y `professionalSelect.ts:4,8` (texto, no llamadas).
Fuera de eso no queda ninguna llamada en web, bot, scripts ni tests.

## Logs (D11)

No hay `console.*`/`logger.*` en el portal, `patient-session.ts`, `shell.ts`, `patientAuth.ts` ni `booking.ts`. Los de
`conversation.ts` ya registraban solo `errorType`/`errName`. El caso nuevo de la opción 4 sin tenant tira
`Error("portal_link_without_tenant")` (un código); `whatsapp.ts` lo registra como cualquier error de mensaje, sin token.
Los logs de `runBotAiTool` quedan para la 028c. Sin commit en este paso.

## Decisiones no obvias

1. **Opción 4 con `patient.tenantId` null:** la SDD pide "el mismo texto de error genérico que ya usa el bot ante una
   falla", pero el bot no tiene un texto genérico de error (los que hay son de reserva o de la IA). Se eligió el mismo
   camino que ya sigue la opción 4 cuando falla la búsqueda del paciente: tira un error con código, no manda link ni
   ningún mensaje nuevo, y `whatsapp.ts` lo registra. Además el caso es inalcanzable hoy: el paciente sale de
   `findPatientByJidOrThrow(tenant, jid)`, que busca por `tenantId`.
2. **Borrado del diario de otra paciente** ahora es `{ ok: true }` sin borrar (igual que inexistente), ver arriba.
3. `booking.ts` resuelve el tenant adentro (`getConversationTenant()`) en vez de recibirlo: mantiene las firmas que usan
   `conversation.ts` y sus mocks. Las lecturas de `service.findUniqueOrThrow({ where: { id: ctx.serviceId } })` en
   `conversation.ts` no se tocaron (el id sale de `listActiveServices`, ya filtrado por tenant; fuera del checklist).
4. `getPortalSession` no usa `React.cache`: el layout y la página la llaman por separado (una lectura de paciente más por
   request). Se priorizó no cambiar la semántica de la función; se puede cachear después.
5. `decideTenantAccess` conserva su parámetro opcional `enabledTenantIds` en core (contrato §4.1 y tests de core); solo se
   dejó de pasar. `tenant_not_enabled` sigue usándose cuando un consultorio no tiene agenda principal.

## Conflicto con el PR #88 (fix/portal-redirect-dominio)

`apps/web/src/app/(portal)/portal/login/route.ts` cambia acá en las líneas vecinas a las redirecciones (`patientId` →
`claims`); las redirecciones quedaron con `new URL(..., url)` como en `develop`. Al rebasear sobre #88 va a haber
conflicto textual en ese archivo: hay que quedarse con `claims` **y** con `publicUrl(path, req)` de #88. El test nuevo
`login/route.test.ts` espera `http://localhost/portal` y `http://localhost/portal?error=invalid`; con #88 la base pasa a
ser `AUTH_URL`, así que ese test puede necesitar `AUTH_URL` stubbeado o las URLs esperadas ajustadas. `logout/route.ts`
no se tocó.

## Verificación (7.3.V + raíz)

Todos los comandos desde la raíz del worktree.

| Comando | Resultado observado |
|---|---|
| `npm run typecheck --workspace apps/web && npm run typecheck --workspace apps/bot && npm run typecheck` | exit 0, 0 errores TS (core, db, bot, web) |
| `npm run test` | exit 0 · 241 archivos ok (1 skipped) · 4166 tests ok (1 skipped). Baseline en `develop`: 233 archivos / 4109 tests |
| `bash packages/db/scripts/test-tenant-isolation.sh` (Postgres descartable) | exit 0 · 14/14 · `test-tenant-isolation: OK` |
| `npm run test:confirm-flow --workspace apps/bot` | exit 0 · 8/8 escenarios OK |
| `npm run test:bot-ai --workspace apps/bot` (proveedor falso, sin WhatsApp) | exit 0 · 18/18 escenarios OK · datos borrados por id |
| extra: `npm run test:booking-reason --workspace apps/bot` | exit 0 · 17/17 · datos borrados por id |
| extra: `npm run test:after-hours --workspace apps/bot` | exit 0 · 12/12 · datos borrados por id |
| `grep -rn "getProfessional()" apps packages` | **no es 0** por D-c1 b: definición en `availability.ts`, `botAi.ts` (4), `conversation.ts:175`, tests de la función/botAi y comentarios. Detalle abajo |
| `./ops/harness/verify.sh` | exit 0 · `Arnés OK.` (backlog válido; typecheck salteado porque todo está commiteado) |
| `prisma migrate status` (solo lectura) | `Database schema is up to date!` |

Test-first: RED observado antes de cada GREEN (token v2 6/11 en rojo; bot opción 4; `getPortalSession`; las tres
descargas y el diario; shell y layout; `booking.ts`; `conversation` con `getTenantProfessional`; candado). El test
de login pasó ya en el paso 2 porque el paso 1 había cambiado la ruta: queda como test de regresión.

## Excepciones y pendientes

- `grep getProfessional()` ≠ 0: por D-c1 b (arriba).
- Los scripts de `packages/db/scripts` (`test-recipes`, `test-consultations`, `test-prescriptions`, `test-isak`,
  `test-recipe-picker`) y los de `apps/bot/scripts` no están en ningún `tsconfig`; se typecheckearon aparte con un
  tsconfig temporal fuera del repo (0 errores). Los de db no se ejecutaron (no forman parte del 7.3.V).
- Se copió el `.env` del repo principal al worktree (ignorado por git, no commiteado) para correr las simulaciones del
  bot contra la base de desarrollo (`migrate status`: al día, sin drift).
