# Review — HU-025b2

**Veredicto:** CHANGES_REQUESTED

Alcance revisado: `git diff 95259e1..HEAD` (11 commits, de `bdc3916` a `ac42a4d`) en el worktree `Nutri-Bot-HU025b2`. 025b-1 no se re-revisó. Todo lo que figura abajo se verificó corriendo los comandos en esta revisión.

## Verificación corrida por el reviewer

| Comando | Resultado |
|---|---|
| `npm run db:generate` + `rm -rf apps/web/.next/types` + `npm run typecheck` | exit 0 (core, db, bot y web) |
| `npm run test` | 227 archivos pasan y 1 se salta; 3908 tests pasan y 1 se salta; exit 0 |
| `./ops/harness/verify.sh` | "Arnés OK", exit 0 |
| `bash packages/db/scripts/test-tenant-isolation.sh` | M1–M3 y M4–M7 con 0 fallas; "test-tenant-isolation: OK" |
| `bash packages/db/scripts/test-tenant-access.sh` | "test-tenant-access: OK" |
| `npm run test:confirm-flow --workspace apps/bot` | 8/8 OK |
| `npm run test:after-hours --workspace apps/bot` | 12/12 OK, datos borrados por id |
| `grep resolveLegacy\|legacySchedulingScope apps/web/src` (sin tests) | solo `auth.ts` (calendario legacy, HU-028) |
| Diff: migraciones, `schema.prisma`, `backlog/`, `progress/` | no se tocan. Tampoco hay `console.log` ni TODO nuevos |

No quedaron contenedores de los probes.

## Checkpoints

### C1 — Arnés
- [x] `backlog/` válido: `verify.sh` OK. El estado de `HU-025.json` lo maneja el orquestador y no se evaluó.
- [x] `progress/current-*.md` no está en el diff y no corresponde al implementer.
- [x] El diff no toca archivos de HU de la otra persona.
- [x] `./ops/harness/verify.sh` termina con exit 0.

### C2 — Documentos
- [x] `docs/hu-autenticacion-permisos-tenant.md` está completo (validado en entregas anteriores).
- [x] La SDD tiene el checklist de 025b-2 y el contrato 4.x.
- [x] Las firmas coinciden con 4.1, 4.2, 4.4 y 8.2:
  - `canRemoveMember` y `RemoveMemberCheck` en `packages/core/src/tenant-access.ts:78-97`.
  - `listTenantMembers` y `removeTenantMember` en `packages/db/domain/tenantAccess.ts:102-144`. El parámetro `db` es opcional y está anotado.
  - Todas las funciones de pagos, MP, consultas, outbox, alimentos, medidas y activos reciben `t: TenantRef` como primer parámetro.
  - `TeamActionState` agrega `ok: false`. Es un desvío menor y está anotado.

### C3 — Arquitectura
- [x] Lo puro está en core (`canRemoveMember`, `TEAM_TEXT`) y lo de base en `packages/db/domain`. No hay duplicación entre web y bot.
- [x] Web y bot compilan, y se ajustaron todos los consumidores de las firmas nuevas.
- [x] No hay migraciones nuevas (la SDD 7.2 dice "Sin migración").
- [x] Rutas del panel y de la API:
  - Logo y firma usan `getTenantContext()`, que da 401 con `no-store`.
  - El callback de MP usa el tenant del contexto.
  - `?tab=equipo` solo aparece para OWNER (`ajustes/page.tsx:77`, `ajustes-tabs.tsx:104`).
  - El portal no se toca.
- [x] Bot: no hay mensajes nuevos y sigue en silencio por defecto. Todo pasa por `getConversationTenant()`: el único `resolveLegacy*` del bot está en `apps/bot/src/tenant.ts`. Ver la duda sobre `setBotStatus`.
- [x] No hay `console.log` de debug ni TODOs sin contexto.

### C4 — Verificación
- [x] `npm run typecheck` limpio.
- [x] La lógica nueva de core tiene tests (`tenant-access.test.ts` para `canRemoveMember` con los 7 casos de 10.1, y `team-text.test.ts`), y `npm run test` pasa.
- [x] El bot se simuló sin WhatsApp real (confirm-flow y after-hours) y limpió por id.
- [x] PDF: no se genera ningún documento nuevo. Solo cambió de dónde sale el branding (`lib/professional-pdf.ts:30` → `getProfessionalPdfAssets(t)`). Lo cubren los mocks y el probe de M6.

### C5 — Cierre
- [x] `progress/impl_HU-025b2.md` existe y describe lo hecho.
- [x] `progress/review_HU-025b2.md` (este archivo).
- [ ] **Comportamiento existente sin pedir cambio (alimentos SARA 2):** ver cambio requerido 1. No quedan scripts sueltos ni datos de prueba.

## Notas trasladadas de reviews anteriores (las seis están resueltas)

1. **Bot fuera de `getConversationTenant()`: resuelto.**
   - `apps/bot/src/conversation.ts:627` (`depositUnavailable`) y `:737` (`handoffAlertTarget`).
   - `apps/bot/src/workers.ts:44` (`tick`), `:20` (conciliación), `:137` (renovación MP) y `:192` (resumen).
   - `grep resolveLegacy apps/bot/src` (sin tests) solo encuentra `tenant.ts`.
2. **`disconnectMercadoPagoAction`: resuelto.** Usa `requireTenantContext("write")` (`apps/web/src/app/(panel)/ajustes/actions.ts:312`).
3. **`professional-pdf.ts`: resuelto.** `loadProfessionalPdfBranding(t)` → `getProfessionalPdfAssets(t)`, con clave compuesta `id_tenantId` (`packages/db/domain/professionalAssets.ts:7-10`).
4. **weeklyMenu y planSections: resuelto.**
   - `tenantId: string` es obligatorio por tipo para plan y plantilla. `planTenant` y `sectionScope` quedan como defensa para llamadores JS.
   - Los tests de recetas mockean `requireTenantContext` y `getTenantContext` directo (`recetas/actions.test.ts:33`, `api/recetas/fotos/[photoId]/route.test.ts:7`).
   - `private-content-access.ts` se borró y sus casos pasaron a `lib/tenant-context.test.ts:208`.
5. **`/inicio?error=AccessDenied`: resuelto.** `inicio/page.tsx` y `login/page.tsx` leen `searchParams.error`. `LoginScreen` muestra un `Alert` warning con `ACCESS_TEXT.signInFailed`, genérico y sin el código.
6. **`getTenantAccess`: resuelto.** Usa `resolvePrimaryAgenda` (`apps/web/src/lib/tenant-context.ts:50`), la primitiva de `tenantScope`. Que no sea `resolveTenantSchedulingContext` está justificado: el contrato 4.3 no devuelve `professionalId`.

## Puntos de foco

1. **Equipo: correcto.**
   - Solo OWNER puede quitar: `requireOwnerContext` en la acción y el rol se relee de la base dentro de la transacción (`tenantAccess.ts:126-133`). No confía en el rol del contexto.
   - C5: `self` y `last_owner` en `canRemoveMember`.
   - `FOR UPDATE` sobre todas las membresías del tenant, en ReadCommitted. En Postgres, la segunda transacción espera el lock, relee y saltea la fila que borró la primera. Así la segunda OWNER ya no figura y recibe `not_owner`. El razonamiento del implementer es correcto.
   - Del form solo se lee `userId`, con zod `min(1).max(64)`.
   - `not_member` y `not_owner` devuelven el genérico, así que no se distingue un objetivo de otro consultorio.
   - Logs: solo `reason=<código>` o `errorCode`. Hay test de que no aparecen ids ni emails (`team-actions.test.ts:55`).
   - La fila propia muestra "Vos" en lugar del botón.
   - Textos 9.2 en `TEAM_TEXT`.
   - Ver la duda sobre el probe.
2. **Mercado Pago: no encontré ningún camino que lea o escriba datos de otro consultorio.**
   - Cada lectura y escritura filtra por `{ id: 1, tenantId }`.
   - `lockAccountRow` hace `SELECT … WHERE id = 1 AND "tenantId" = t FOR UPDATE` y lanza `MercadoPagoUnavailableError` si la fila es ajena.
   - El webhook toma el tenant de la fila (`resolveMercadoPagoWebhookTenant`, `mercadopagoAccount.ts:587`), nunca del payload.
   - `syncMercadoPagoPayment` bloquea el `Payment` solo si su turno es del tenant y de la agenda (`payments.ts:176-178`).
   - `registerManualPayment` usa `FOR KEY SHARE` con `tenantId`.
   - Listados de pagos y vista de conexión acotados por `appointment.tenantId`.
   - El probe M4 cubre que la cuenta de D no existe para C, con control positivo. Ver la duda sobre la fila perezosa.
3. **Middleware y server actions: las de los archivos `"use server"` fallan cerrado.**
   - `guard-coverage.test.ts` usa el AST para recorrer las funciones exportadas, con autoprueba. La lista de excepciones de (c) tiene 3 entradas justificadas (`auth.ts`, `lib/shell.ts` y `lib/professional.ts`, las dos últimas para el portal en 025c), y el mismo test exige que sigan siendo necesarias. (a) no tiene excepciones.
   - Revisé el orden guarda → datos en Ajustes, pagos, mensajes, avisos, alimentos, Equipo y asistente.
   - Límites: ver dudas.
4. **Decisión 7 (SARA 2 por preferencia del tenant): ver cambios requeridos 1 y 2.**
   - La regla de `foods.ts` sigue la función SQL `tenant_visible_foods` y es lo que pide 4.4.
   - Pero deja dos lugares que todavía usan la columna global `active`.
   - Además, el chequeo SQL propuesto para producción está incompleto.
5. **Bot legacy:** no hay cambios de comportamiento en los flujos (8/8 y 12/12 OK, tests de workers y de booking actualizados). La única dependencia nueva está en `setBotStatus` (ver dudas).

## Cambios requeridos

1. **Ocultar un SARA 2 en `/alimentos` ya no lo oculta en el editor de recetas (cambio de comportamiento que nadie pidió).**
   - Ahora `setFoodActive` (`packages/db/domain/foods.ts:242`) escribe solo `FoodVisibilityPreference` para SARA 2.
   - Pero el catálogo del editor de recetas sigue filtrando por la columna global `active`: `packages/db/domain/recipes.ts:351-352` (`readFoodsForRecipes`, que usan `recetas/nueva`, `recetas/[id]` y `recetas/revisar/[id]` vía `recipesForTenant(...).foods()`).
   - Antes de este diff, el botón de `/alimentos` cambiaba `active`, así que ocultar un alimento lo ocultaba también en recetas. Ahora sigue apareciendo.
   - También pasa al revés: un SARA 2 con `active = false` sin preferencia aparece como "Activo" en `/alimentos` pero no en recetas, y desde la UI ya no se puede corregir.
   - Corresponde aplicar la regla de 4.4 ("una función exportada que consulta datos de consultorio y no está en la tabla, se le aplica la misma regla"): en el camino con `tenantId`, `readFoodsForRecipes` tiene que usar `tenantVisibleFoodWhere({ tenantId })` en lugar de `{ active: true }`. Hay que conservar los `includeIds` ya usados por la receta.
   - Falta un test con mock que fije que un SARA 2 con preferencia `visible=false` del tenant no entra al catálogo y que uno de otro tenant no afecta.
2. **El chequeo SQL de producción de la decisión 7 (`progress/impl_HU-025b2.md`, "Decisiones no obvias" 7) está incompleto.**
   - Hasta este diff, la visibilidad real en producción la decidía `Food.active`. La migración de HU-024 (`20261120053254_catalog_ownership/migration.sql:16-17`) copió como `visible=false` los SARA 2 inactivos de ese momento. Después, el código viejo siguió escribiendo solo `active`.
   - El chequeo propuesto detecta uno de los dos desvíos: SARA 2 desactivado después de HU-024, con `active=false` y sin preferencia, que reaparecería.
   - No detecta el otro: un SARA 2 que tenía preferencia `visible=false` desde la migración y que Daiana **reactivó** después (`active=true`). Con este diff desaparecería de `/alimentos` y de los planes.
   - El chequeo correcto (solo lectura) cubre los dos casos en una sola consulta:
     ```sql
     SELECT count(*) FROM "Food" f
     LEFT JOIN "FoodVisibilityPreference" p ON p."foodId" = f.id AND p."tenantId" = 'legacy-tenant'
     WHERE f.source = 'SARA2' AND f."catalogActive" AND f.active <> coalesce(p.visible, true);
     ```
     Si da más de 0, alinear la preferencia de esos ids con `active` (upsert `visible = f.active`) antes de publicar.
   - Corregirlo en el reporte (o en la nota de deploy del PR) para que el orquestador lo lleve al PR.

## Dudas (no bloqueantes)

- **Acciones inline en server components fuera del test de guarda.**
  - (a) solo recorre archivos que empiezan con `"use server"`. Quedan afuera dos closures inline del panel:
    - `apps/web/src/app/(panel)/ajustes/page.tsx:163` (`signIn("google")` para el calendario).
    - `apps/web/src/app/(panel)/alimentos/[id]/page.tsx:47`, que delega en `setFoodActiveAction`, que sí está guardada.
  - Hoy ninguna lee ni escribe sin guarda. `signIn` equivale a `/login`, y el refresh token del calendario solo se guarda con membresía legacy (`apps/web/src/auth.ts:12-13`).
  - Ahora que el middleware deja pasar las actions, conviene que el detector también marque los `"use server"` inline (o prohibirlos en `(panel)`) para que una acción inline futura no quede sin cubrir.
- **El detector es textual.** Da por guardada una función cuyo cuerpo contiene `requireTenantContext(` en cualquier lugar, aunque descarte el resultado. Ejemplo: `createOwnFoodAction` en `alimentos/actions.ts:115` hace `await requireTenantContext("read").catch(() => null)` y sigue. Hoy es inocuo, porque esa acción no toca datos. TypeScript obliga a chequear `null` donde se usa `ctx`.
- **Probe de Equipo.** `removeTenantMember` (SQL crudo con `role::text` y `FOR UPDATE`) solo está probado con mocks. Ni `test-tenant-access.sh` ni el probe b2 lo ejecutan contra Postgres. El SQL es simple y el razonamiento de concurrencia es correcto, pero conviene un caso real: quitar STAFF, rechazar `self` y un objetivo de otro tenant.
- **`setBotStatus` depende ahora de `getConversationTenant()`** (`apps/bot/src/whatsapp.ts:25-35`).
  - Si la fachada legacy falla, o si la fila `BotStatus` `id=1` existe con `tenantId` null o ajeno (el `upsert` por `tenantId` intenta crear `id=1` y choca), el `await` de `connection.update` (`:92/:97/:102`) rechaza.
  - En la rama `close`, eso evita el `setTimeout` de reconexión, y es una promesa no manejada dentro del listener.
  - El reporte dice que "el alta choca y se loguea", pero no hay `try/catch`.
  - En producción, la migración de HU-024 puso `tenantId = 'legacy-tenant'` en la fila existente, así que no debería pasar. Antes de publicar, confirmar con `SELECT id, "tenantId" FROM "BotStatus";`, y considerar un `try/catch` con log de código.
- **Fila única de MP perezosa.** `ensureAccountRow` (`mercadopagoAccount.ts:129`) inserta `id=1` con el tenant de quien llama si no existe. Sin el candado `ENABLED_TENANT_IDS` (025c), el primer consultorio que conecte, desconecte o reciba un aviso de MP se adueña de la fila, y legacy queda en "rejected" hasta HU-028. No es una fuga de datos, pero hay que tenerlo en cuenta antes de quitar el candado si en producción no existe la fila: `SELECT id, "tenantId" FROM "MercadoPagoAccount";`.
- **Acciones `void` sin `reauth`** (`disconnectGoogleAction`, `setBotPausedAction`, `removeLogoAction`, `setFoodActiveAction`, `applyAtwaterKcalAction`, `retryMessageAction`, `retryAllFailedAction` y las de planes de 025b-1). Fallan cerrado, pero terminan en el error boundary en lugar del toast más `/inicio`. Ya está anotado como pendiente. Aceptable.
- **`removeTeamMemberAction` con STAFF:** devuelve `reauth: true` y manda a `/inicio`, que la redirige a `/`. No se puede alcanzar desde la UI, porque STAFF no ve la pestaña. Inocuo.
- Los desvíos anotados por el implementer (M8 fuera del probe y cubierto con mocks, segundo archivo del probe, parámetro `db` opcional, `ok: false` en `TeamActionState`, funciones fuera de la tabla 4.4) son razonables y están anotados.
