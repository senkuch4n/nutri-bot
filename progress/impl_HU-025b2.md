# impl HU-025b2 · Pagos, mensajes, ajustes, alimentos, asistente, recetas y plantillas, Equipo y cierre

- SDD: `Refactorizaciones/autenticacion-permisos-tenant.md`, 7.2 "Checklist 025b-2" (M4–M12, probe M4–M8, logs D11), más 2, 4.3, 4.4, 4.5, 8, 9.2, 9.4 y 10. Decisiones C1–C7 y sección 9 de la HU aplicadas (C4/C5 en Equipo).
- Rama: `feat/HU-025b2-pagos-ajustes-asistente-equipo` (worktree `Nutri-Bot-HU025b2`), encima de 025b-1 (`95259e1`) sin tocar sus commits.
- Estado: **done**. Sin push ni PR. Sin migración (no se corrió `migrate dev`, `migrate reset` ni `db push`). No se tocó `backlog/` ni `progress/current-*.md`.

## Commits (11)

| Commit | Qué |
|---|---|
| `bdc3916` | **M4** pagos y Mercado Pago: `payments.ts`, `mercadopagoAccount.ts` con `t: TenantRef`; `/pagos`, pago manual, acciones MP de Ajustes (`disconnectMercadoPagoAction` con `requireTenantContext("write")`), callback OAuth; bot: seña (`depositUnavailable`) y crons de conciliación y renovación con `getConversationTenant()`. |
| `7821c4f` | **M5** mensajes, avisos y outbox: `inquiries.ts`, `enqueueMessage(t, …)` (escribe `tenantId`, se retira `verifiedTenantId`), se retira `listLegacyPatientLastContacts`; `/mensajes`, `/avisos`, contador de la sidebar; bot: `handoffAlertTarget`, `recordInquiryMessage`, resumen nocturno y `tick` del outbox con `getConversationTenant()`. |
| `ec946ca` | **M6** Ajustes, activos y shell: `professionalAssets.ts` con `t`; todas las acciones de Ajustes, firma, logo y sus rutas API sobre el contexto (clave compuesta `id_tenantId`); branding del PDF (`lib/professional-pdf.ts`) del tenant; sidebar con nombre y estado del bot del tenant; `/ajustes/whatsapp` y `BotStatus` por `tenantId`; el bot escribe `BotStatus` por `tenantId`. |
| `8c74203` | **M7** alimentos y medidas: `foods.ts`, `foodMeasures.ts` con `t`; preferencia de SARA 2 por tenant; medidas por `tenantId`. |
| `5b1da29` | **M8** asistente: cada tool con el `TenantRef` del contexto y `tenantId` en todos los `where`; errores del proveedor solo con código (D11). |
| `f1dee7f` | **M9** resumen: test de página con un tenant distinto (el código ya estaba sobre el contexto desde 025b-1/M6). |
| `aa2572d` | **M10** recetas y plantillas a `requireTenantContext`/`requirePageContext`; se borra `private-content-access.ts` (+ test, casos movidos a `tenant-context.test.ts`); tenant obligatorio por tipo en `weeklyMenu`/`planSections` (también plantillas), `addTemplateMeal`, `addTemplateMealItem`, `resolveUnplacedHint`; `getTenantAccess` usa `resolvePrimaryAgenda`. |
| `3eea743` | **M11** Equipo: core `canRemoveMember` + `TEAM_TEXT`; db `listTenantMembers`/`removeTenantMember`; web pestaña, sección, acción y tests. |
| `8f4ff68` | **M12** `guard-coverage.test.ts`; middleware deja pasar `next-action` al handler; `reauth` en `useActionToast`; aviso genérico en `/inicio?error=…`. |
| `b145845` | Probe de aislamiento extendido a M4–M7 (`tenant-isolation-b2.integration.ts`, paso 3/3 de `test-tenant-isolation.sh`). |
| `ac42a4d` | Logs D11 de la IA de planes (sin mensaje del proveedor). |

154 archivos, +3341 / −1313 (incluye tests).

## Notas de las reviews anteriores (resueltas)

1. **Bot fuera de `getConversationTenant()`:** `depositUnavailable` (M4), `handoffAlertTarget` y `tick` del outbox (M5) pasan por `getConversationTenant()`. `grep resolveLegacy apps/bot/src` → solo `tenant.ts` (el único punto, como pide 7.2 estrategia 2).
2. **`disconnectMercadoPagoAction`** usa `requireTenantContext("write")` (antes miraba solo la sesión).
3. **`lib/professional-pdf.ts`**: `loadProfessionalPdfBranding(t)` → `getProfessionalPdfAssets(t)` (profesional de la agenda principal del tenant).
4. **M10:** `weeklyMenu` y `planSections` con `tenantId: string` obligatorio por tipo para plan y plantilla (la defensa en runtime queda para llamadores JS). Los tests de recetas (`recetas/actions.test.ts`, rutas de fotos e importación) y los de plantillas mockean `requireTenantContext`/`getTenantContext` directo, sin reimplementar la cadena sesión → membresía.
5. **`/inicio?error=AccessDenied`**: `LoginScreen` muestra un `Alert` warning genérico (`ACCESS_TEXT.signInFailed`) sin el código (M12). `/inicio` y `/login` leen `searchParams.error`.
6. **`getTenantAccess`** ya no consulta `prisma.agenda` por su cuenta: usa `resolvePrimaryAgenda` de `tenantScope.ts` (la primitiva debajo de `resolveTenantSchedulingContext`). Se usa la primitiva y no `resolveTenantSchedulingContext` porque el contrato 4.3 de esta última no devuelve `professionalId`, que `TenantContext` necesita; usarla obligaba a una segunda consulta. Sin cambio de contrato.

## Contrato compartido: confirmación

- **4.4** (firma nueva = `fn(t: TenantRef, …params actuales)`), todas como primer parámetro posicional:
  - `payments.ts`: `createDepositCheckout`, `syncMercadoPagoPayment`, `reconcilePendingPayments`, `expireStalePendingPayments`, `listPendingPayments`, `listApprovedPaymentsInRange`, `registerManualPayment`. `handleMercadoPagoWebhook(query)` sigue sin sesión y resuelve el tenant de la cuenta (`resolveMercadoPagoWebhookTenant`, nuevo).
  - `mercadopagoAccount.ts`: `getMercadoPagoConnectionView(t)`, `startMercadoPagoOAuth(t, sessionEmail)`, `completeMercadoPagoOAuth(t, input)`, `disconnectMercadoPagoAccount(t)`, `getMercadoPagoCredentials(t, scope)`, `isMercadoPagoCheckoutAvailable(t)`, `notifyMercadoPagoMissingForBooking(t, p)`. Fuera de la tabla, misma regla (anotado): `refreshMercadoPagoAccountToken(t, …)`, `markMercadoPagoAccountError(t, code)`.
  - `inquiries.ts`: `recordInquiryMessage`, `listInquiries`, `countInquiriesByStatus`, `countPendingInquiries`, `markInquiryAnswered`, `enqueueAfterHoursDigest`.
  - `conversationState.ts`: `listPatientLastContacts(t, jids)` (se eliminó `listLegacyPatientLastContacts`; el resto `Legacy*` queda para el bot hasta HU-027).
  - `outbox.ts`: `enqueueMessage(t, params, tx?)`.
  - `foods.ts`: `listFoods`, `getFood`, `getFoodUsage`, `findFoodNameConflicts`, `createOwnFood`, `updateOwnFood`, `setFoodActive`, `applyAtwaterKcal` (agregados: `tenantFoodWhere`, `tenantVisibleFoodWhere`, `FoodNotFoundError`).
  - `foodMeasures.ts`: `listFoodMeasures`, `listMeasuresForPicker`, `createFoodMeasure`, `updateFoodMeasure`, `deleteFoodMeasure`, `moveFoodMeasure`, `resolveMeasureItem`.
  - `professionalAssets.ts`: `updateProfessionalLogo(t, data)`, `removeProfessionalLogo(t)`, `getProfessionalSignatureImage(t)`, `updateProfessionalSignature(t, input)`, `removeProfessionalSignature(t)`, `getProfessionalPdfAssets(t)`.
  - `weeklyMenu.ts`, `planSections.ts`: `tenantId` obligatorio también para `kind: "template"`.
- **4.2** `listTenantMembers(tenantId)` → `{ userId, email, role, createdAt }[]`; `removeTenantMember({ tenantId, actorUserId, targetUserId })` → `{ ok: true } | { ok: false; reason: "not_owner" | "self" | "last_owner" | "not_member" }` (segundo parámetro opcional `db` para tests, como el resto del módulo).
- **4.1** `canRemoveMember({ actor, target, ownerCount }): RemoveMemberCheck`, `RemoveMemberCheck` exportado. Textos `TEAM_TEXT` en `packages/core/src/team-text.ts` (exportado en `index.ts`).
- **4.5** sin cambios de firma. `resolvePrivateContentAccess` eliminado como pide 4.5.
- **8.2** `removeTeamMemberAction(prevState, formData): Promise<{ ok: true } | { error: string; reauth?: true }>` (con `ok: false` explícito en el error, igual que el resto de los estados del panel).
- **4.6/6.3** middleware: server action sin acceso → pasa al handler; páginas → `/inicio`; `/api/*` → 401.

## Decisiones no obvias

1. **Mercado Pago fila única (`id = 1`).** Toda función filtra `{ id: 1, tenantId: t.tenantId }`: otro consultorio ve "no conectada", no obtiene credenciales y sus escrituras fallan con `MercadoPagoUnavailableError` (la inserción perezosa `ON CONFLICT DO NOTHING` no adopta la fila). HU-028 generaliza a una fila por consultorio.
2. **Webhook de Mercado Pago:** el tenant sale de la fila de la cuenta (`resolveMercadoPagoWebhookTenant`), nunca del payload. Sin fila → `legacy-tenant` (solo aplica el respaldo `.env` de desarrollo, que `getMercadoPagoCredentials` revalida); fila sin dueño → no se procesa.
3. **State del OAuth de MP** sigue atado al email de la sesión (sin migración no hay columna de tenant). El callback toma el tenant del contexto; con D7 (una sola membresía) el email determina el tenant. Queda para HU-028.
4. **`registerManualPayment(t, …)`:** `SELECT … FOR KEY SHARE` del turno con `tenantId` antes de crear el pago; un turno ajeno tira el mismo error que uno inexistente.
5. **`enqueueMessage` siempre escribe `tenantId`:** la FK compuesta `(appointmentId, tenantId)` rechaza un turno de otro consultorio. Las filas nuevas ya no dependen del camino `tenantId: null` de `outboxOwnershipWhere`.
6. **Consultas (`PatientInquiry` no tiene `tenantId`):** se filtran por `patient: { tenantId }`; el `UPDATE` crudo de "agregar a la consulta" agrega `EXISTS (… "Patient"."tenantId" = t)`; `recordInquiryMessage` rechaza un paciente de otro consultorio antes de escribir.
7. **Alimentos — "activo" por consultorio.** Misma regla que la función SQL `tenant_visible_foods` de HU-024: SARA 2 activo = `catalogActive` y sin preferencia `visible=false` del tenant; propio = `active`. `setFoodActive(t, sara, …)` escribe `FoodVisibilityPreference` del tenant, **nunca** la columna global `active` (antes, desactivar un SARA 2 lo ocultaba a todos los consultorios). **Riesgo de producción (corregido en el reintento 1):** hasta este diff la visibilidad real de un SARA 2 la decidía la columna global `Food.active`. La migración de HU-024 (`20261120053254_catalog_ownership`) copió como preferencia `visible=false` los SARA 2 inactivos de ese momento, y después el código viejo siguió escribiendo solo `active`. Hay dos desvíos posibles:
   - (a) SARA 2 **desactivado después** de HU-024 (`active=false`, sin preferencia): con este diff **reaparecería**.
   - (b) SARA 2 **reactivado después** de HU-024 (`active=true`, con la preferencia `visible=false` de la migración): con este diff **desaparecería** de `/alimentos`, recetas y planes.

   Chequeo de solo lectura antes de publicar (cubre los dos casos):
   ```sql
   SELECT count(*) FROM "Food" f
   LEFT JOIN "FoodVisibilityPreference" p ON p."foodId" = f.id AND p."tenantId" = 'legacy-tenant'
   WHERE f.source = 'SARA2' AND f."catalogActive" AND f.active <> coalesce(p.visible, true);
   ```
   Si da más de 0, **antes de publicar** alinear la preferencia de esos ids con `active` (caso a: inserta `visible=false`; caso b: pasa la preferencia a `visible=true`):
   ```sql
   BEGIN;
   INSERT INTO "FoodVisibilityPreference" ("tenantId", "foodId", "visible")
   SELECT 'legacy-tenant', f.id, f.active FROM "Food" f
   LEFT JOIN "FoodVisibilityPreference" p ON p."foodId" = f.id AND p."tenantId" = 'legacy-tenant'
   WHERE f.source = 'SARA2' AND f."catalogActive" AND f.active <> coalesce(p.visible, true)
   ON CONFLICT ("tenantId", "foodId") DO UPDATE SET "visible" = EXCLUDED."visible";
   COMMIT;
   ```
   Correrlo **solo antes** del deploy: después, la columna `active` de un SARA 2 queda sin uso y puede quedar desfasada a propósito (la preferencia manda), así que el remedio ya no aplica. Probado en un Postgres descartable (todas las migraciones aplicadas, cinco SARA 2: alineado visible, alineado oculto, caso a, caso b y retirado del catálogo): el chequeo da 2 (casos a y b), el remedio inserta/actualiza 2 filas, el chequeo vuelve a 0 y `tenant_visible_foods('legacy-tenant')` devuelve el visible alineado y el caso b. En la base de desarrollo (transacción `READ ONLY`) da 0.
8. **`BotStatus`:** el bot hace `upsert` por `tenantId` (único); una fila de otro consultorio o sin dueño no se adopta (el alta choca; desde el reintento 1 la falla se loguea con su código y no corta la reconexión). En la base de desarrollo la fila `id=1` tiene `tenantId = legacy-tenant` (backfill de HU-024).
9. **Ajustes:** `lib/tenant-professional.ts` (`tenantProfessionalWhere(ctx)` = `{ id_tenantId: { id: ctx.professionalId, tenantId } }`) es puro y aparte de `lib/professional.ts` (`server-only`), para que los tests de acciones no lo tengan que mockear. `setBotPausedAction` normaliza `paused === true` (un argumento de server action llega del cliente). `AjustesTabs` recibe `tabs` y `panels` parcial; `page.tsx` arma la lista literal porque `AJUSTES_TABS` vive en un módulo `"use client"` y no se puede leer desde el servidor.
10. **Equipo (9.2, 7.2.1):** solo OWNER (`ctx.access.kind === "member" && role === "OWNER"`); `?tab=equipo` sin permiso cae en la pestaña por defecto (el `isTab` valida contra las pestañas visibles). La fila desaparece al confirmar (estado local) y vuelve si el servidor rechaza; `revalidatePath("/ajustes")` deja la lista del servidor al día. `removeTenantMember` bloquea con `FOR UPDATE` **todas** las membresías del tenant (R12), así dos OWNER quitándose a la vez quedan serializadas: la segunda ya no es miembro → `not_owner`. `last_owner` por la UI es inalcanzable (quien quita es OWNER y no puede quitarse); queda como defensa (cubierto en core). Log solo `reason=<código>`, sin ids ni emails. Badge de rol: "Responsable" en tono `info`, "Equipo" neutro; "Vos" neutro en la fila propia. Soporte (025d): `requireOwnerContext` ya lo rechaza; la sección "Soporte de Arzium" (C4) queda para 025d.
11. **M10 sin `resolvePrivateContentAccess`:** las acciones usan `requireTenantContext(mode).catch(() => null)` donde antes había `if (!access)`, para conservar los mismos mensajes (`sessionExpired`, `Acceso no autorizado`, etc.). `patient-record.tsx` lista las plantillas del tenant del contexto (el paciente ya es de ese tenant), sin el chequeo cruzado viejo.
12. **`getTenantAccess`:** `resolvePrimaryAgenda(prisma, tenantId, { id: true })`; `TenantScopeError` → `tenant_not_enabled` y log `[auth] tenant_scope_missing` (mismo comportamiento que antes).
13. **Middleware y `reauth` (M12):** una server action sin acceso llega al handler, que falla cerrado. Las acciones con estado (`pagos`, `mensajes`, Ajustes, alimentos, avisos, Equipo) devuelven `reauth: true` ante un `TenantAccessError` (`lib/reauth.ts`, `withReauth`, detecta por `name` para no importar el módulo `server-only`), y `useActionToast` hace toast + `router.replace("/inicio")`. Las acciones `void` sin `try` (p. ej. `disconnectGoogleAction`, `setFoodActiveAction`, varias de planes de 025b-1) tiran `TenantAccessError` y terminan en el error boundary: fallan cerrado; antes el middleware devolvía 401 y el cliente tampoco mostraba nada. Ver pendientes.
14. **`guard-coverage.test.ts`:** usa el compilador de TypeScript para listar las funciones exportadas de cada archivo `"use server"` del panel y de `/api`; acepta la guarda directa o vía un helper local (p. ej. `run(...)`, `requireTemplateTenant()`, `saveDraft()`), con una autoprueba del detector. Revisa los `route.ts` (salvo `api/auth`, `api/webhooks`) y prohíbe `resolveLegacy`, `legacySchedulingScope`, `getProfessional(` y `where: { id: 1 }` en `app/(panel)`, `app/api`, `lib/` y `auth.ts`, con tres excepciones documentadas que el mismo test verifica que siguen siendo necesarias: `auth.ts` (calendario legacy, HU-028), `lib/shell.ts` (funciones del **portal**, 025c) y `lib/professional.ts` (reexporta `getProfessional` para el portal, 025c).
15. **Logs (D11):** asistente y IA de planes loguean `"[assistant|plan-ai] provider_error", errorCode(err)` y devuelven el texto genérico (antes devolvían `err.message` del proveedor al cliente). `weekly-menu-actions` pasa de loguear el error entero a `errorCode(err)`. Equipo: `[team] remove_denied reason=…` / `remove_failed <código>`.
16. **Soporte (025d) sin cerrar la puerta:** WhatsApp (`/ajustes/whatsapp`), Mercado Pago, firma y Equipo usan `requirePageContext`/`requireTenantContext("write")`/`requireOwnerContext`; 025d puede agregar `blocked_in_support` en `requireTenantContext` y los prefijos de `SUPPORT_BLOCKED_PATH_PREFIXES` en el middleware sin tocar estos archivos.

## Desvíos de la SDD

- **M8 en el probe:** `assistant-tools.ts` es `server-only` de `apps/web`, no se puede importar desde el probe de `packages/db`. La cobertura es `assistant-tools.test.ts` (cada tool, todos los `where` con el tenant; un paciente ajeno no lee nada más) y `asistente/actions.test.ts` (tools con el contexto aunque la IA pida otro tenant; lo que agrega el servidor al prompt es solo del consultorio). El probe extendido cubre M4–M7.
- **El probe nuevo es un segundo archivo** (`tenant-isolation-b2.integration.ts`, consultorios C y D) en el mismo Postgres descartable, para no reescribir el `seed` de 025b-1. `test-tenant-isolation.sh` corre los dos (pasos 2/3 y 3/3).
- **`removeTenantMember`** acepta un segundo parámetro opcional `db` (patrón del módulo), no listado en 4.2.
- **`TeamActionState`** usa `{ ok: false; error; reauth? }` además de `{ ok: true }` (8.2 escribe `{ error, reauth? }` sin `ok`).
- **Funciones agregadas fuera de la tabla 4.4:** `resolveMercadoPagoWebhookTenant`, `refreshMercadoPagoAccountToken(t, …)`, `markMercadoPagoAccountError(t, …)`, `tenantFoodWhere`, `tenantVisibleFoodWhere`, `FoodNotFoundError`; `addTemplateMeal`/`addTemplateMealItem`/`resolveUnplacedHint` con tenant obligatorio.
- **M9** quedó como commit de solo test: el código de `resumen/page.tsx` ya estaba sobre el contexto (025b-1 + el cambio del nombre en M6).

## Pendientes y observaciones para el reviewer / 025c

- **Acciones `void` sin `reauth`:** con el middleware dejando pasar las acciones, las que no tienen `try` (`disconnectGoogleAction`, `setBotPausedAction`, `removeLogoAction`, `setFoodActiveAction`, `applyAtwaterKcalAction`, `retryMessageAction`, `retryAllFailedAction`, y las de planes señaladas en la review de 025b-1) tiran `TenantAccessError` al error boundary en vez de mostrar el genérico y mandar a `/inicio`. Fallan cerrado; solo pasa con una membresía revocada a mitad de sesión. Llevarlas al patrón `reauth` es un cambio mecánico de UI pendiente.
- **Portal (025c):** `lib/shell.ts` (funciones del portal) y `lib/professional.ts` (`getProfessional`) siguen con `Professional(1)`; están en las excepciones del test de guarda, que falla si se arreglan y no se sacan de la lista.
- **Scripts CLI de plantillas** (`test-weekly-menu.ts`, `test-food-measures.ts`, `test-recipe-picker.ts`): creaban plantillas sin tenant; ahora pasan `LEGACY_TENANT_ID` (no se corrieron: escriben en la base de desarrollo y no son parte de la verificación pedida; sí compilan).
- **025a/025b-1:** no encontré problemas nuevos. Observación: `findTenantProfessionalSummary` atrapa cualquier error (no solo `TenantScopeError`), coherente con "nunca tira" del contrato.
- **Producción:** ver la decisión 7 (preferencias de SARA 2) antes de publicar.

## Verificación (desde el worktree)

```
npm run db:generate                                  → OK
npm run typecheck                                    → OK (core, db, bot, web; 0 errores)
npm run test                                         → Test Files 227 passed | 1 skipped (228); Tests 3908 passed | 1 skipped
bash packages/db/scripts/test-tenant-isolation.sh    → 1/3 migraciones desde cero; 2/3 M1–M3: 13 tests / 9 suites, 0 fallas;
                                                       3/3 M4–M7: 13 tests / 4 suites, 0 fallas; "test-tenant-isolation: OK"
bash packages/db/scripts/test-tenant-access.sh       → 0 fallas, "test-tenant-access: OK"
npm run test:confirm-flow --workspace apps/bot       → 8/8 escenarios OK
npm run test:service-reminders --workspace apps/bot  → 17 OK, 0 con error
npm run test:after-hours --workspace apps/bot        → 12/12 escenarios OK (datos borrados por id)
npm run test:bot-ai --workspace apps/bot             → 18/18 escenarios OK (sin proveedor real)
npm run test:booking-reason --workspace apps/bot     → 17/17 escenarios OK
npm run test:report-outbox --workspace apps/bot      → OK (transacción revertida, sin filas)
npm run build --workspace apps/web                   → OK; .next/server/middleware-manifest.json sin middleware edge ("middleware": {})
./ops/harness/verify.sh                              → "Arnés OK"
grep resolveLegacy|legacySchedulingScope apps/web/src (sin tests) → solo auth.ts (calendario legacy, HU-028)
```

- Scripts de `packages/db/scripts` y `apps/bot/scripts` chequeados con un `tsconfig` temporal que incluía `scripts/**`: 0 errores. El temporal se borró.
- Conteo de filas de la base de desarrollo antes y después de las seis simulaciones del bot (solo `SELECT`: Patient, Appointment, OutboundMessage, PatientInquiry, ConversationState, BotAiQuestion, Payment, Service): idéntico (`21|22|12|0|14|1|6|9`).
- Lecturas de solo lectura sobre la base de desarrollo para decidir: `BotStatus` (1 fila, `legacy-tenant`), `MercadoPagoAccount` (sin filas), `Food` (890 SARA 2 y 90 propios de `legacy-tenant`, todos activos; sin preferencias ni medidas).
- **Datos y WhatsApp:** ninguna verificación mandó WhatsApp, arrancó el bot ni tocó la sesión de Baileys. Los probes corren solo en Postgres descartable (red y contenedor propios, tmpfs, `127.0.0.1` aleatorio, sin `.env`, sin `--pull`); `docker ps` queda sin contenedores del probe. No quedaron scripts sueltos.
- **UI:** se usaron los skills `ui-ux-pro-max` (confirmación destructiva, objetivos de toque), `apple-design` (confirmación solo para lo irreversible, patrón de lista agrupada de Ajustes) y `web-design-guidelines` (autochequeo de `team-section.tsx`: confirmación antes de destruir, toasts con `aria-live` de sonner, email con `truncate` y `translate="no"`, botón con `aria-label` específico y alto mínimo de 44 px). `ui-styling` no hizo falta: se reusaron `GroupedList`, `Badge`, `Button`, `SectionLabel` y `useConfirm` del design system de HU-017 sin estilos nuevos.

## Reintento 1

Alcance: `progress/review_HU-025b2.md` (CHANGES_REQUESTED), cambios requeridos 1 y 2, más la duda de `setBotStatus` que pidió el orquestador. Estado: **done**. Sin migración, sin push ni PR, sin tocar `backlog/`.

### Commits

| Commit | Qué |
|---|---|
| `7df879b` | **Cambio 1.** `fix(db)`: el catálogo del editor de recetas usa la visibilidad del consultorio. |
| `ea1d792` | **Duda `setBotStatus`.** `fix(bot)`: una falla al registrar `BotStatus` se loguea con su código y no corta la reconexión. |

El cambio 2 es solo de este reporte (decisión 7, arriba), sin commit: `progress/` no se commitea desde el implementer.

### Cambio 1: catálogo de recetas con `tenantVisibleFoodWhere`

- `packages/db/domain/recipes.ts` `readFoodsForRecipes` (camino con `tenantId`, que usan `recetas/nueva`, `recetas/[id]` y `recetas/revisar/[id]` vía `recipesForTenant(...).foods()`):
  - Sin `includeIds`: `where = tenantVisibleFoodWhere(t)` (SARA 2 con `catalogActive` y sin preferencia `visible=false` del tenant; propio del tenant con `active`).
  - Con `includeIds`: `AND [tenantFoodWhere(t), OR [tenantVisibleFoodWhere(t), id in includeIds]]`. Se conservan los ingredientes que ya usa la receta, pero nunca entra un propio de otro consultorio, ni pedido por id.
  - `active` de cada fila es el del consultorio (`activeForTenant` con la preferencia del tenant), así el editor marca como inactivo un SARA 2 oculto que la receta ya usaba. Antes se devolvía la columna global.
  - El camino sin tenant (`listFoodsForRecipes`, solo scripts legacy) no cambia.
- `packages/db/domain/foods.ts`: se exportan `activeForTenant` y `visibilityFor` (antes privados) para que recetas use la misma regla sin duplicarla. Sin cambio de firma de lo que ya era público.
- **Otros caminos de lectura de `Food` revisados** (ninguno usa la columna global `active` para SARA 2 en el panel):
  - Planes (`plan-detail.tsx`, `ai-actions.ts`) y plantillas (`plantillas/[id]/page.tsx`): `listFoods(ctx, { activeOnly: true, source: "SARA2" })` → `tenantVisibleFoodWhere`.
  - Medidas del picker: `listMeasuresForPicker` → `tenantVisibleFoodWhere`.
  - Alta de ítems en plan y plantilla (`actions.ts`, `food.active`): `getFood(t, id)` ya devuelve `active` del consultorio.
  - Asistente (`assistant-tools.ts`): no lee `Food`.
  - `recipeTransfer.ts` (importador CLI de recetas): busca SARA 2 por `sourceKey` sin filtrar por `active`; el `active: true` es de propios y no aplica a SARA 2. Tampoco es un camino del panel. Sin cambio.
  - `unitHintConversion.ts` y `foodReferenceOwnership.ts`: no filtran por visibilidad, a propósito (conversión de medidas y propiedad de referencias).
- **Tests:**
  - `packages/db/domain/recipes.test.ts`: nuevo caso "recipesForTenant().foods usa la visibilidad del consultorio". Fija el `where`, que la preferencia leída es solo la del tenant (`visibility.where.tenantId`) y el `active` resultante: SARA 2 con columna global en false sin preferencia → activo, SARA 2 oculto por el tenant pedido por la receta → inactivo. Contra el código anterior falla (RED observado), con el nuevo pasa.
  - Probe real en Postgres descartable (`tenant-isolation-b2.integration.ts`, M7), nuevo test "el catálogo de recetas sigue la misma regla". C oculta un SARA 2 y:
    - No aparece en el catálogo de recetas de C.
    - D lo sigue viendo activo.
    - Pedido por la receta, entra marcado inactivo.
    - Un propio de D no entra ni pedido por id.
    - Con la columna global en false y sin preferencia, C lo ve activo.

### Cambio 2: chequeo SQL de producción

- Reemplazado en la decisión 7 por la consulta del reviewer, que cubre los dos casos (desactivado después de HU-024 → reaparecería; reactivado después de la migración → desaparecería), con el remedio único (`INSERT … ON CONFLICT DO UPDATE SET visible = f.active`) y la advertencia de correrlo solo **antes** del deploy.
- Probado en un Postgres descartable propio (contenedor `--rm` con tmpfs, `127.0.0.1` aleatorio, `migrate deploy` de todas las migraciones, sin `.env`; ya no existe):
  - Con 5 SARA 2 (visible alineado, oculto alineado, caso a, caso b y retirado), el chequeo da 2 y lista exactamente los casos a y b.
  - El remedio toca 2 filas.
  - El chequeo vuelve a 0.
  - `tenant_visible_foods('legacy-tenant')` devuelve el visible alineado y el caso b.
- En la base de desarrollo, dentro de una transacción `READ ONLY`, da 0.

### `setBotStatus` (bot)

- `apps/bot/src/whatsapp.ts`: `setBotStatus` envuelve la resolución del tenant y el `upsert` en `try/catch`. Ante una falla (tenant no resoluble, fila `id=1` ajena o sin dueño → `P2002`, base caída) hace `logger.warn({ code, connected }, "No se pudo registrar el estado del bot")`.
  - `code` es el `code` del error de Prisma o, si no hay, su `name`. Nunca el mensaje, el QR, ids ni teléfonos.
  - El listener de `connection.update` sigue: en `close`, programa la reconexión a los 3 s. En `open`, loguea "WhatsApp conectado.".
  - Antes, el `await` rechazaba, se perdía el `setTimeout` de reconexión y quedaba una promesa no manejada.
- `apps/bot/src/whatsapp.test.ts` (nuevo, vitest, con Baileys, Prisma y tenant mockeados; sin WhatsApp real ni base), 4 casos:
  - Base sana: escribe la fila del tenant y reconecta.
  - `P2002` en el alta: reconecta, y el log lleva solo `{ code: "P2002" }`, sin el mensaje ni datos.
  - Tenant no resoluble: no escribe, loguea `TenantScopeError` y reconecta.
  - `open` con la base caída: no rechaza.

  Contra el código anterior fallan 3 de los 4 (RED observado).
- Sigue valiendo confirmar en producción `SELECT id, "tenantId" FROM "BotStatus";` antes de publicar (si la fila `id=1` no es de `legacy-tenant`, el estado del panel no se actualiza, aunque ahora el bot ya no deja de reconectar).

### Dudas no bloqueantes que quedan sin hacer (no triviales)

- **Server actions inline** en server components (`ajustes/page.tsx:163`, `alimentos/[id]/page.tsx:47`) fuera del detector de `guard-coverage.test.ts`, y el detector textual (`requireTenantContext(` en cualquier lugar del cuerpo). Hoy ninguna lee ni escribe sin guarda. Extender el detector a los `"use server"` inline (o prohibirlos en `(panel)`) queda para una próxima entrega.
- **Probe real de `removeTenantMember`** (quitar STAFF, rechazar `self` y un objetivo de otro tenant) contra Postgres. Hoy solo está cubierto con mocks. Requiere usuarios y membresías nuevos en el seed del probe, así que queda pendiente.
- **Fila única de MP perezosa** (`ensureAccountRow`): no es una fuga de datos. Antes de quitar el candado `ENABLED_TENANT_IDS` (025c), confirmar en producción `SELECT id, "tenantId" FROM "MercadoPagoAccount";`. El arreglo de fondo (una fila por consultorio) es HU-028.

### Verificación (desde el worktree)

```
rm -rf apps/web/.next/types && npm run db:generate   → OK
npm run typecheck                                    → exit 0 (core, db, bot, web)
npm run test                                         → Test Files 228 passed | 1 skipped (229); Tests 3913 passed | 1 skipped
bash packages/db/scripts/test-tenant-isolation.sh    → 1/3 migraciones desde cero; 2/3 M1–M3: 13 tests / 9 suites, 0 fallas;
                                                       3/3 M4–M7: 14 tests / 4 suites, 0 fallas (incluye el catálogo de recetas);
                                                       "test-tenant-isolation: OK"
npm run test:confirm-flow --workspace apps/bot       → 8/8 escenarios OK
./ops/harness/verify.sh                              → "Arnés OK"
docker ps (contenedores hu025-*)                     → 0
```

- Datos y WhatsApp: no se mandó ningún WhatsApp, no se arrancó el bot y no se tocó la sesión de Baileys. En la base de desarrollo solo hubo una lectura en transacción `READ ONLY` y la simulación confirm-flow, que limpia por id. Los probes corrieron en Postgres descartables.
- No quedaron scripts sueltos: el script del chequeo SQL vivió en el scratchpad de la sesión, fuera del repo, y se borró.
- Contrato: no cambia ninguna firma de 4.x. Se agregan dos exports de `foods.ts` (`activeForTenant`, `visibilityFor`), puros y usados por recetas.
