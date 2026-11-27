# impl HU-028c · IA por consultorio (issue #71)

**Estado:** done
**Rama / worktree:** `feat/HU-028c-ia-por-consultorio` en `/Users/joelmiguelserrudo/Projects/Nutri-Bot-HU028c`, sobre `origin/develop` `f0f4cb5`.
**SDD:** `Refactorizaciones/integraciones-por-consultorio.md` §C0–§C16. **D-c1 aplicada: (b)**: `runBotAiTool` con `tenantId`; en `handleIncoming` solo cambia la lectura de la profesional del consultorio.
**Skill aplicado:** `skills/migracion-prisma.md`.

## Commits (uno por bloque, Conventional Commits, sin trailer)

| Commit | Qué |
|---|---|
| `6a6e4ec` feat(db): tenant on bot AI questions and per-tenant AI usage tables | schema + migración `20261127190208_ai_usage_per_tenant` (solo, alto riesgo) |
| `ee9aa7c` feat(core): per-tenant bot AI limits and chat usage totals | `tenantDaily`, `applyTenantBotAiLimits`, `parseTenantAiLimitArg`, `TENANT_AI_LIMIT_MAX`, `ai-usage.ts` |
| `f966e6a` feat(db): count and record bot AI questions per tenant, record panel AI usage | `aiUsage.ts`, conteo/registro/derivación con `tenantId`, `AI_FILES` |
| `7ac104d` feat(db): bot AI tools read only the conversation tenant | `runBotAiTool` con `tenantId` (D-c1 b) |
| `910bc9e` feat(db): ai-limits script for per-tenant bot AI limits | script + test + npm `ai-limits` |
| `9081c10` test(db): disposable Postgres probe for per-tenant AI usage | probe + npm `test:ai-tenants` + tsconfig |
| `da9f960` feat(bot): bot AI limits, counts and tools per conversation tenant | `ask.ts`, `conversation.ts`, tests, scripts de simulación |
| `b1d28d5` feat(web): record panel AI usage per tenant without blocking | `deepseek.ts`, asistente, IA de planes + tests |
| `ac291eb` docs(web): privacy policy mentions panel AI usage records | `/privacidad` (D16), fecha 27/11/2026 |
| `8069c42` docs: per-tenant AI limits, usage records and 028c deploy notes | `.env.example`, `README.md`, `deploy/README.md` |
| `177786a` test(web): mock panel AI usage record in food policy test | mock que faltaba (ver Excepciones) |

`backlog/HU-028.json` estaba modificado en el worktree antes de empezar (es del orquestador): no lo toqué ni lo commiteé. Este reporte queda sin commitear.

## Archivos tocados

- **db:** `prisma/schema.prisma`, `prisma/migrations/20261127190208_ai_usage_per_tenant/migration.sql`, `domain/aiUsage.ts` (nuevo), `domain/aiUsage.test.ts` (nuevo), `domain/index.ts`, `domain/botAi.ts`, `domain/botAi.test.ts`, `domain/gcal-and-ai-privacy.test.ts`, `domain/google-calendar-isolation.test.ts`, `domain/signature-privacy.test.ts`, `scripts/ai-limits.ts` (nuevo), `scripts/ai-limits.test.ts` (nuevo), `scripts/bot-ai-per-tenant.integration.ts` (nuevo), `scripts/test-bot-ai-per-tenant.sh` (nuevo), `package.json`, `tsconfig.json`.
- **core:** `src/bot-ai.ts`, `src/bot-ai.test.ts`, `src/ai-usage.ts` (nuevo), `src/ai-usage.test.ts` (nuevo), `src/index.ts`.
- **bot:** `src/ai/ask.ts`, `src/ai/ask.test.ts`, `src/conversation.ts`, `src/conversation-ai.test.ts` (nuevo), `src/conversation-attendance.test.ts`, `src/conversation-booking.test.ts`, `scripts/test-bot-ai-questions.ts`, `scripts/test-booking-reason.ts`.
- **web:** `src/lib/deepseek.ts`, `src/app/(panel)/asistente/actions.ts` y su test, `src/app/(panel)/pacientes/[id]/planes/[planId]/ai-actions.ts` y su test, `src/lib/food-policy.test.ts`, `src/app/privacidad/page.tsx`.
- **docs:** `.env.example`, `README.md`, `deploy/README.md` (no existe `deploy/.env.example`).

## Checklist §C13

| # | Estado | Nota |
|---|---|---|
| 1 | ✅ | `pg_dump` → `~/nutribot-dev-pre-028c.dump` (4,0 MB, fuera del repo) |
| 2 | ✅ | `migrate status`: sin drift; solo pendiente `20261126013713_tenant_onboarding_profile` (HU-026, de develop: `ADD COLUMN name/timeZone` nullable en `Tenant`). `migrate dev --create-only` la aplicó antes de generar la nueva. |
| 3 | ✅ | schema según C4.1 + comentario de `LIMIT_GLOBAL`. La relación **requerida** `tenantPatient` contra `Patient.tenantId` opcional **sí la aceptó Prisma** (`prisma validate` OK): queda `Patient` (no hizo falta `Patient?`). |
| 4 | ✅ | `--create-only --name ai_usage_per_tenant` |
| 5 | ✅ | SQL reescrito según C4.2; `grep -ci drop` = 0 |
| 6 | ✅ | `npm run db:migrate` aplicó; `npm run db:generate` OK |
| 7 | ✅ | dev (solo lectura): `legacy-tenant | 1`; `TenantAiSettings` 0, `PanelAiUsage` 0 |
| 8–9 | ✅ | RED observado (9 fallas + import faltante) → GREEN |
| 10 | ✅ | RED (import) → GREEN 9/9 |
| 11 | ✅ | RED 3 fallas → GREEN |
| 12 | ✅ | `aiUsage.ts` en `AI_FILES` |
| 13 | ✅ | RED 8 fallas → GREEN; incluye source check y "input con tenantId: tenant-b no cambia ningún where" |
| 14 | ✅ | RED (import) → GREEN 19/19 |
| 15 | ✅ | |
| 16 | ✅ | `test:ai-tenants` OK (salida abajo) |
| 17 | ✅ | RED 1 falla → GREEN |
| 18–19 | ✅ | `conversation-ai.test.ts` RED 6 fallas → GREEN |
| 20 | ✅ | test nuevo + scripts de simulación |
| 21–22 | ✅ | RED 4 + 4 fallas → GREEN |
| 23 | ✅ | |
| 24 | ✅ | |
| 25 | ✅ | este reporte |

## Migración (SQL resumido)

`20261127190208_ai_usage_per_tenant/migration.sql`, dentro de `BEGIN; … COMMIT;`:
1. `DO $$` fail closed: si hay `BotAiQuestion` de un `Patient` con `tenantId IS NULL` → `RAISE EXCEPTION 'HU-028c: hay preguntas de la IA del bot de pacientes sin tenantId; …'`.
2. `ADD COLUMN "tenantId" TEXT` (nullable) → `UPDATE … SET "tenantId" = p."tenantId" FROM "Patient" p` → `SET NOT NULL`.
3. Índice `BotAiQuestion_tenantId_askedAt_idx`; FK compuesta `BotAiQuestion_patientId_tenantId_fkey` → `Patient(id, tenantId)` `ON DELETE CASCADE ON UPDATE RESTRICT` (la FK simple existente se conserva).
4. Enums `PanelAiFeature`, `PanelAiOutcome`; tabla `TenantAiSettings` (PK `tenantId`, FK `Tenant` RESTRICT/RESTRICT, `CHECK TenantAiSettings_limits_check` 0..100000 o NULL); tabla `PanelAiUsage` + índice `(tenantId, usedAt)` + FK `Tenant` RESTRICT/RESTRICT.

El SQL generado por Prisma coincidía 1:1 con el objetivo de la SDD salvo el `ADD COLUMN … NOT NULL` (reemplazado). Sin `DROP`.

## Verificación §C14 (resultados observados)

| Comando | Resultado |
|---|---|
| `npm run db:generate` | exit 0 |
| `npm run typecheck` | exit 0 (core, db, web, bot) |
| `npm run test` | exit 0 — 246 files passed, 1 skipped; 4232 tests passed, 1 skipped |
| `npx vitest run <13 archivos de §C14>` | 13 files, 175 tests passed |
| `npm run test:ai-tenants --workspace packages/db` | exit 0, `test-bot-ai-per-tenant: OK` |
| `npm run test:gcal-tenants --workspace packages/db` | exit 0, `test-google-calendar-per-tenant: OK` |
| `npm run test:mp-tenants --workspace packages/db` | exit 0, `test-mercadopago-per-tenant: OK` |
| `bash packages/db/scripts/test-tenant-isolation.sh` | exit 0, `test-tenant-isolation: OK` |
| `prisma migrate status` (dev) | 44 migraciones, "Database schema is up to date!" |
| `npm run test:bot-ai --workspace apps/bot` | 18/18 escenarios OK, datos borrados por id |
| `npm run test:confirm-flow --workspace apps/bot` | 8/8 escenarios OK |
| `npm run test:booking-reason --workspace apps/bot` | 17/17 escenarios OK, datos borrados por id |
| `npm run build --workspace apps/web` | exit 0 (Compiled successfully, 17/17 páginas) |
| `grep -n "getProfessional\|LEGACY_TENANT_ID" packages/db/domain/botAi.ts` | vacío |
| `grep -n "where: { active: true }" packages/db/domain/botAi.ts` | vacío |
| `grep -rn "globalDaily" apps packages --include='*.ts' --include='*.tsx'` | vacío |
| `./ops/harness/verify.sh` | exit 0, "Arnés OK." (39 HU válidas) |

### Salida de `test:ai-tenants`

```
1/6 migraciones anteriores a 028c + fixture tipo producción
2/6 aplicar 028c: backfill a legacy-tenant, mismas filas, NOT NULL, tablas nuevas vacías
   md5 de las preguntas igual; instalación desde cero (todas las migraciones): OK
3/6 fail closed: una pregunta de un paciente sin consultorio corta la migración
   migrate deploy falla con "HU-028c:" (log del servidor), sin columna ni tablas nuevas, la pregunta sigue
4/6 consultorio B sintético + ai-limits
   show/dry-run sin escribir; --apply: B = {null, 5}; A sin fila; tenant inexistente: tenant_not_found
5/6 integración: consultorios A y B
  ✔ una pregunta no puede quedar en otro consultorio que su paciente (FK compuesta)
  ✔ el uso de A no consume el cupo diario de B
  ✔ servicios: cada consultorio ve solo los suyos
  ✔ disponibilidad: un servicio de B no existe para A
  ✔ mis_turnos: A no ve turnos de B
  ✔ datos_consultorio: B devuelve la profesional de B
  ✔ topes: B con el valor del script, A sin fila (default del .env); el CHECK rechaza negativos
  ✔ consumo del panel: la fila es de A y B no la ve
ℹ tests 8 · pass 8 · fail 0
6/6 drift: schema.prisma vs. las bases migradas (solo el contenedor descartable)
test-bot-ai-per-tenant: OK
```

(Las líneas `prisma:error` que aparecen en el paso 5 son los errores esperados de FK/CHECK que el probe provoca a propósito; los loguea el cliente de Prisma por su config `log: ["error"]`.)

## Contrato compartido (§C5): firmas confirmadas

- core: `BotAiLimits.tenantDaily` (env `BOT_AI_DAILY_GLOBAL`), `TenantBotAiLimits`, `applyTenantBotAiLimits(base, tenant)`, `TENANT_AI_LIMIT_MAX = 100_000`, `parseTenantAiLimitArg(raw)`; `ChatUsageTotals`, `EMPTY_CHAT_USAGE`, `addChatUsage(acc, usage)`. Exactas a §C5.1/§C5.2.
- db: `countBotAiQuestionsToday({ tenantId, patientId, now, tz }) → { patient, tenant }`; `BotAiQuestionInput.tenantId`; `markBotAiQuestionHandedOff({ id, patientId, tenantId, at })`; `runBotAiTool({ name, input, patientId, tenantId, now, afterHours? })`; `getTenantAiSettings(t: TenantRef)`; `PanelAiUsageInput`; `recordPanelAiUsage(t, row)`. Exactas a §C5.3/§C5.4.
- web: `DEEPSEEK_PROVIDER = "deepseek"`.

## Decisiones no obvias

- **El mensaje `HU-028c:` del fail closed no sale en la salida de `prisma migrate deploy`.** Por el `BEGIN` explícito, el `RAISE` deja la transacción abortada y Prisma informa el error de su sentencia siguiente (`current transaction is aborted…`). El probe verifica el `RAISE` en el log del servidor descartable y que el error sea de `ai_usage_per_tenant`; la reversión (sin columna ni tablas, la pregunta sigue) se verifica en la base. Mismo comportamiento que tendría el fail closed de 028a (que no lo testeaba). En `deploy/README.md` agregué que, si corta, Prisma deja la migración como fallida y hay que hacer `prisma migrate resolve --rolled-back` después de arreglar los datos.
- `ai/ask.ts`: el tipo de `record` pasa a `Omit<BotAiQuestionInput, "tenantId" | "patientId" | "askedAt">` (el consultorio lo pone `conversation.ts`, nunca `ask`).
- `handleQuestionText`: `limits` se declara con `let` y se calcula **dentro** del `try` (un error leyendo `TenantAiSettings` da `AI_ERROR` y loguea solo `errName`, igual que un error de conteo); `trimHistory` usa el mismo `limits`.
- `recordPanelAiUsage` loguea `code` si es un string seguro, si no `err.name`, si no `"error"`. Llama a `create` con `select: { id: true }` (no cambia las claves de `data`).
- `addChatUsage` trunca decimales positivos (3.9 → 3) y trata negativos/NaN/Infinity como 0.
- Asistente: `!msg` antes hacía `break` y caía al mensaje de "no pudo resolver"; ahora registra `INVALID_RESPONSE` y devuelve **el mismo** objeto al cliente.
- Script `ai-limits`: valores negativos (`-1`) llegan como valor y fallan con `Invalid value for --per-tenant…` (no con el uso). La salida incluye `tenantId` en dry-run/apply (`{"mode":…,"tenantId":…,"before":…,"after":…}`).
- `packages/db/tsconfig.json`: sumé `scripts/ai-limits*.ts` y `scripts/bot-ai-per-tenant*.ts` para que entren en el typecheck (igual que los scripts de 028a/028b).
- Entorno: en el worktree creé un symlink `.env → ../Nutri-Bot/.env` (gitignored) para los comandos con `dotenv -e ../../.env`. `node_modules` propio con `npm ci`.

## Excepciones / fuera de lista

- Dos tests que la SDD no nombraba necesitaron el mismo ajuste de mocks: `packages/db/domain/signature-privacy.test.ts` (mock de `getTenantProfessional` + `tenantId`) y `apps/web/src/lib/food-policy.test.ts` (mock de `recordPanelAiUsage` y `DEEPSEEK_PROVIDER`). Sin cambiar asserts.
- **La base de desarrollo quedó migrada** (`BotAiQuestion.tenantId NOT NULL`). Un bot de otra rama sin 028c (por ejemplo, desde el repo principal) que registre una pregunta de IA contra esta base va a fallar el insert (`AI_ERROR`), igual que la ventana de deploy de §C12. Backup en `~/nutribot-dev-pre-028c.dump`.
- No creé ninguna fila en `TenantAiSettings` de dev (el `--apply` corrió solo en el probe descartable). Las simulaciones del bot borraron sus datos por id; no se mandó WhatsApp ni se llamó a ningún proveedor de IA real.

## Posibles conflictos con el PR #92 (HU-033, 025c)

1. **`apps/bot/src/conversation.ts`, inicio de `handleIncoming`:** 028c reemplaza `const pro = await getProfessional();` por `const tenant = await getConversationTenant(); const pro = await getTenantProfessional(tenant.tenantId);` y reusa `tenant` en `findOrCreatePatientByJid(tenant, jid)`. #92 deja ahí `getProfessional()` con el comentario `// 028c lo reemplaza (D-c1 b)`: conflicto textual seguro. Resolución: quedarse con la versión de 028c.
2. **`conversation.ts`, imports de `@nutri-bot/db/domain`:** 028c agrega `getTenantAiSettings` y `getTenantProfessional` y mantiene `getProfessional`. Si #92 ya agrega `getTenantProfessional`, hay duplicado/conflicto en el bloque. También `type Professional = Awaited<ReturnType<typeof getProfessional>>` (028c no lo tocó).
3. **`conversation.ts`, `handleQuestionText` y `handoffFromQuestion`:** 028c cambia la firma (`tenant: TenantRef` como 4.º parámetro) y la llamada de `markBotAiQuestionHandedOff` (usa `(await getConversationTenant()).tenantId`). Si #92 tocó esas funciones (por ejemplo, para pasar el tenant de otra forma), conflicto semántico.
4. **`packages/db/domain/botAi.ts`:** 028c borra los imports de `getProfessional` y `LEGACY_TENANT_ID` y reescribe las 4 tools con `tenantId`. Si #92 agregó comentarios `// 028c lo reemplaza` junto a esos usos, conflicto textual en los mismos hunks; resolución: versión de 028c.
5. **Tests con mocks de `@nutri-bot/db/domain`:** `conversation-booking.test.ts` y `conversation-attendance.test.ts` (028c agrega `getTenantProfessional` al mock) y `botAi.test.ts`, `gcal-and-ai-privacy.test.ts`, `signature-privacy.test.ts` (028c pasa de mockear `./availability.getProfessional` a `./tenantScope.getTenantProfessional`). Si #92 cambió los mismos mocks, conflictos de una o dos líneas.
6. Después de que entren los dos: `getProfessional()` debería quedar vivo solo en `availability.ts` (sin usos en `botAi.ts` ni en el inicio de `handleIncoming`); borrarlo queda para después, como pidió el orquestador.

## Rebase sobre develop (con #92)

**Base nueva:** `origin/develop` `a58e023` (merge del PR #92, HU-033 025c). `git diff --name-only f0f4cb5 origin/develop -- packages/db/prisma/migrations` dio vacío, así que no entraron migraciones nuevas. La última sigue siendo `20261127190208_ai_usage_per_tenant`. Hice el rebase con `git rebase --autostash`: `backlog/HU-028.json` y este reporte siguen sin commitear. No hice push.

**Commits después del rebase:** `4ee3d80` schema+migración · `838d6e7` core · `9ffc571` db conteo/consumo · `c88d466` db tools · `99c7896` ai-limits · `5d6c5b5` probe · `5638247` bot · `53fb9bb` web · `417ccc3` privacidad · `277cd8a` docs · `f145736` test food-policy · **`20f83aa` refactor(db): remove getProfessional fixed to Professional(1)** (commit aparte, nuevo).

### Conflictos y cómo los resolví

Los commits de db, core y probe se aplicaron sin conflicto. Que `botAi.ts` no chocara significa que #92 no lo tocó en los mismos hunks; ahí queda la versión de 028c.

1. **`apps/bot/src/conversation.ts`** (commit del bot):
   - Imports de `@nutri-bot/db/domain`: quedan `getTenantAiSettings` (028c) y `getTenantProfessional` (los dos lados lo tenían). Saqué `getProfessional` porque, con la resolución, no queda ningún uso.
   - Import de `tenantScope`: combiné `type TenantProfessional` (025c, lo usan `type Professional` y `conversationProfessional()`) con `type TenantRef` (028c, parámetro de `handleQuestionText`).
   - Inicio de `handleIncoming`: quedó la versión de 028c (`const tenant = await getConversationTenant(); const pro = await getTenantProfessional(tenant.tenantId);` y `findOrCreatePatientByJid(tenant, jid)`). Saqué el comentario `// 028c lo reemplaza` de #92 y la línea que decía que el resto quedaba para 025c.
   - El resto del archivo conserva lo de 025c (`conversationProfessional()`, reserva y opción 4 por consultorio) más los cambios de 028c en `handleQuestionText` y `handoffFromQuestion`, que no chocaron.
2. **`conversation-attendance.test.ts`:** ya tenía el mock `getTenantProfessional` de #92. Me quedé con ese y descarté mi comentario duplicado.
3. **`conversation-booking.test.ts`:** quedó la línea de #92 (`getTenantProfessional: mocks.tenantProfessional`, un mock separado). Ajusté el test de #92 "la confirmación usa la profesional del consultorio…": ahora el inicio de `handleIncoming` también lee la profesional del consultorio, así que `tenantProfessional` se llama `[["legacy-tenant"], ["legacy-tenant"]]` y `getProfessional` no se llama.
4. **`apps/web/src/lib/food-policy.test.ts`** (commit `test(web)`): #92 cambió el mock de `@/lib/professional` a `getTenantProfessional`. Quedó esa versión más `DEEPSEEK_PROVIDER: "deepseek"` en el mock de `@/lib/deepseek` (028c).

### `getProfessional()` borrado (`20f83aa`)

- Después del rebase, `grep -rn "getProfessional\b" apps packages --include='*.ts' --include='*.tsx'` no mostró ningún uso en código de producción ni en scripts. Lo único que quedaba era la definición en `availability.ts` y mocks en tests.
- Borré la función de `packages/db/domain/availability.ts` junto con el import de `PROFESSIONAL_SELECT`, que quedó sin uso.
- `professionalSelect.test.ts`: el `describe("getProfessional")` pasa a ser `describe("getTenantProfessional")`. Verifica que `agenda.findFirst` pida `professional: { select: PROFESSIONAL_SELECT }` y que `"getProfessional" in availability === false`.
- Actualicé los comentarios que la nombraban: `professionalSelect.ts` y `tenantScope.ts`.
- Saqué los mocks de `getProfessional` de `conversation-attendance.test.ts`, `conversation-booking.test.ts` y `conversation-ai.test.ts`.
- Con el mismo grep, sin contar los tests que impiden que vuelva, el resultado es **0**. Esos tests son tres y no los toqué: el patrón prohibido `getProfessional(` de `apps/web/src/guard-coverage.test.ts`, el source check de `botAi.test.ts` y la aserción nueva de `professionalSelect.test.ts`.

### Verificación después del rebase

| Comando | Resultado |
|---|---|
| `ls packages/db/prisma/migrations` | última `20261127190208_ai_usage_per_tenant`; sin migraciones nuevas de develop |
| `npm run db:generate` | exit 0 |
| `npm run typecheck` | exit 0 (core, db, web, bot) |
| `npm run test` | exit 0: 255 files passed, 1 skipped; 4294 tests passed, 1 skipped |
| `prisma migrate status` (dev) | 44 migraciones, "Database schema is up to date!" |
| `npm run test:bot-ai --workspace apps/bot` | 18/18 OK, datos borrados por id |
| `npm run test:confirm-flow --workspace apps/bot` | 8/8 OK |
| `npm run test:booking-reason --workspace apps/bot` | 17/17 OK, datos borrados por id |
| `npm run test:ai-tenants --workspace packages/db` | exit 0, `test-bot-ai-per-tenant: OK` (integración: pass 8, fail 0) |
| `./ops/harness/verify.sh` | exit 0, "Arnés OK." (40 HU válidas) |

No se mandó ningún WhatsApp ni se llamó a un proveedor de IA real. No corrí `migrate reset`, `db push` ni seeds.
