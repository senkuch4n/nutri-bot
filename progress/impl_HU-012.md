# impl HU-012 — preguntas al bot con IA

Estado: **done**

SDD: `Refactorizaciones/preguntas-bot-ia.md` (sección 15 manda: P6 con prefijo).

## Preparación

- Bot: no hay proceso corriendo (ps sin `apps/bot`/`tsx`). Postgres de Docker arriba (5433).
- `git fetch origin`: `origin/develop` avanzó 2 commits (`a5a405e fix/hu-010`, `1b08fa2` merge PR #5).
  `git diff --name-only HEAD origin/develop -- packages/db/prisma` → **vacío** (no trae migraciones).
  Los 3 archivos que cambian (`ai-food-catalog.ts`/`.test.ts`, `planes/[planId]/ai-actions.ts`) no se
  solapan con esta HU. **No mergeé `develop`** (crearía un commit y la consigna es no commitear): queda
  para el orquestador. Sin riesgo de conflicto.

## Bloques

- [x] core
- [x] db
- [x] bot
- [x] web
- [x] repo (.env.example, README)
- [x] verificación

## Bloque core (hecho)

Archivos:
- **Nuevo** `packages/core/src/bot-ai.ts`: contrato 4.1 completo (`resolveBotAiEnv`, `mergeBotAiLimits`,
  `validateQuestion`, `dayBoundsInTz`, `BOT_AI_SYSTEM_PROMPT` texto exacto 4.1.1, `buildQuestionMessage`,
  `trimHistory`, `BOT_AI_REPLY_MAX_CHARS`, `toWhatsAppText`, `cutAtSentence`, `classifyAnswer`,
  `BOT_AI_INFO_MAX`, `validateBotAiInfo`, `isBotAiAvailable`) **+ resolución P6 (sección 15):**
  `BOT_AI_INQUIRY_PREFIX = "Pregunta al asistente: "` y `inquiryBodyFromAiQuestion(question)`.
- **Nuevo** `packages/core/src/bot-ai-tools.ts`: `BotAiToolName`, `BotAiToolSpec`, `BOT_AI_TOOLS` (tabla 4.2),
  `AiServiceItem`, `servicesForAi`, `availabilityForAi`, `appointmentsForAi`, `clinicInfoForAi`.
- **Nuevos** `bot-ai.test.ts` (27 tests) y `bot-ai-tools.test.ts` (8 tests).
- `messages.ts`: `greetByName`/`welcomeBack` con 2.º parámetro `menuText = MENU`; al final
  `MENU_WITH_QUESTIONS`, `menu()`, `QUESTION_MODE_INTRO`, `AI_DAILY_LIMIT`, `AI_TOO_LONG`, `AI_ERROR`,
  `AI_UNAVAILABLE`, `AI_TEXT_ONLY`, `AI_OFF_TOPIC`, `AI_TRUNCATED_SUFFIX` (textos exactos sección 6).
- `wake.ts`: `menuDigit` al final; `wake.test.ts`: 3 casos nuevos al final.
- `index.ts`: +2 líneas al final.

Decisiones:
- `validateBotAiInfo` agrupa miles a mano (`2.001`) en vez de `toLocaleString("es-AR")`, para no depender
  de la versión de ICU (en `es` la agrupación mínima de 4 dígitos varía).
- `bot-ai.ts` no re-exporta `AfterHoursConfig` (ya lo exporta `after-hours.ts`; duplicarlo en `export *`
  da error de ambigüedad).

Verificación: `vitest` de los 3 archivos → 46/46; `tsc` de core en verde.

## Bloque db (hecho)

Skill `migracion-prisma`, paso a paso:
1. `git diff --name-only HEAD origin/develop -- packages/db/prisma` → vacío.
2. `prisma migrate status` previo → "17 migrations found… Database schema is up to date!" (sin drift).
3. `schema.prisma`: 2 columnas en `Professional` (después de `afterHoursEnd`), `botAiQuestions` en `Patient`
   (después de `inquiries`), enum `BotAiOutcome` + modelo `BotAiQuestion` al final. Diff: **+63 líneas, 0 borradas**.
   (Corrí `prisma format` por error, que reflowó todo el archivo; lo revertí con `git checkout` del schema y
   reapliqué solo las líneas nuevas antes de crear la migración, para no generar conflictos con la HU-010.)
4. Respaldo: `~/nutribot-backups/pre-hu012-20261002-2112.dump` (**278K**, no vacío).
5. `npx dotenv -e ../../.env -- prisma migrate dev --create-only --name bot_ai_questions` →
   `20261003001239_bot_ai_questions` (sin drift ni oferta de reset).
6. SQL revisado: idéntico al esperado de la SDD 3.2 (`botAiEnabled BOOLEAN NOT NULL DEFAULT false`,
   `botAiInfo TEXT`, tabla, 2 índices, FK `ON DELETE CASCADE`). `grep -ciE "drop|rename|alter column"` → 0.
7. `npm run db:migrate` → "Your database is now in sync with your schema." + `npm run db:generate`.

Archivos:
- `packages/db/prisma/schema.prisma`, `packages/db/prisma/migrations/20261003001239_bot_ai_questions/migration.sql`.
- **Nuevo** `packages/db/domain/botAi.ts`: `BOT_AI_COUNTED_OUTCOMES`, `countBotAiQuestionsToday`,
  `BotAiQuestionInput`, `recordBotAiQuestion`, `markBotAiQuestionHandedOff`, `purgeExpiredBotAiQuestions`,
  `BotAiToolResult`, `runBotAiTool` (firmas 4.4 exactas).
- **Nuevo** `packages/db/domain/botAi.test.ts` (14 tests, prisma y availability mockeados).
- `packages/db/domain/index.ts`: +1 línea.

Decisiones:
- `runBotAiTool` nunca lanza; ante excepción hace `console.warn` con **solo** el nombre de la tool y la clase
  del error (el dominio no tiene logger; nunca el input ni el mensaje).
- `purgeExpiredBotAiQuestions` también rechaza `NaN` (además de `< 1`).
- `Decimal` de Prisma se pasa a `servicesForAi` como string (`toString()`).

Verificación: `vitest botAi.test.ts` 14/14; `npm run typecheck` (core, db, bot, web) en verde.

## Bloque bot (hecho)

Skill `claude-api` invocado antes de escribir el código (README TS, manual loop de `tool-use.md`,
tabla de clases de `shared/error-codes.md`).

Dependencias:
- `@anthropic-ai/sdk` **0.131.0** (`^0.131.0`). `Anthropic.Tool` tiene `strict?: boolean` (P13 OK, sin cast) y
  `RequestOptions.timeout?: number` (ms).
- `openai` `^7.15.0` (resuelve **7.15.0**, la misma que `apps/web`). Nota: `npm install openai@^7.15.0` había
  subido el lock a 7.27.0 (afectando también a web); lo revertí (`git checkout package-lock.json`, dejé
  `"openai": "^7.15.0"` en `apps/bot/package.json` y `npm install`): el lock solo suma `@anthropic-ai/sdk`
  y sus dependencias, `openai` queda en 7.15.0.

Archivos nuevos hasta ahora: `src/ai/provider.ts` (además del contrato: `addUsage`, `MIN_REMAINING_MS`),
`src/ai/anthropic-provider.ts` (+ `toBotAiError` exportado), `src/ai/deepseek-provider.ts` (+ `toDeepSeekError`),
`src/ai/runtime.ts`, `src/ai/ask.ts`, `src/jid-queue.ts` (+ `__queueSizeForTests`), y tests
`anthropic-provider.test.ts` (10), `deepseek-provider.test.ts` (4), `ask.test.ts` (11), `jid-queue.test.ts` (4) → 29/29.
- `conversation.ts`: `ConversationOptions` (4.11), `STEP.AWAIT_QUESTION`, `Ctx` (`aiHistory`, `lastQuestion`,
  `lastQuestionLogId`), `ai`/`menuText` calculados después de `loadState` y propagados a **todos** los envíos
  de menú (`grep messages.MENU` → 0), opción 5 en `handleMenu`, bloque `AWAIT_QUESTION`, `menuDigit` en
  `handleInquiryText`, `handoffFromQuestion` (**body con prefijo** `inquiryBodyFromAiQuestion`, sección 15),
  `handleQuestionText`, `AI_TEXT_ONLY` en `handleIncomingMedia`. Tipo interno `AiState = { available, provider }`
  para pasar a los handlers (no es parte del contrato).
- `whatsapp.ts`: `sendTyping` (aditivo). `index.ts`: log de arranque sin clave, `runSerialByJid`, `typing`.
- `workers.ts`: `runBotAiPurge`, cron `"30 4 * * *"` justo antes del resumen HU-011, y en `runStartupJobs`.
  `workers.test.ts`: mocks nuevos + 2 casos (anteúltimo schedule, error contenido). Bot: 38/38 tests.
- **Nuevo** `scripts/test-bot-ai-questions.ts` (18 escenarios de la SDD 10.6) y script `test:bot-ai` en
  `apps/bot/package.json`. Borra `API_KEY_IA_*` del `process.env` al inicio y verifica `getBotAiRuntime() === null`;
  todas las llamadas pasan `aiProvider` (falso o null); alertas a `5490000000099@…`; no toca `Professional`.

Corridas (bot detenido: sin proceso `tsx` y `BotStatus.connected = f`):
- `npm run test:bot-ai --workspace apps/bot` → **18/18 escenarios OK**, "Datos de prueba borrados (por id)".
- `npm run test:after-hours --workspace apps/bot` → 12/12 OK (regresión HU-011).
- `npm run test:confirm-flow --workspace apps/bot` → 5/5 OK.
- Conteos en solo lectura **antes y después** (idénticos): Patient 14, Service 9, Appointment 18,
  OutboundMessage 6, PatientInquiry 0, BotAiQuestion 0, ConversationState 7; pacientes `549000000002_` 0,
  servicio TEST 0, outbound a ALERT_JID 0; `Professional`: botAiEnabled f, botAiInfo null, botPaused f,
  phoneJid null, franja 22:00–09:00, `updatedAt` 2026-10-01 18:08:25 (sin cambios).

## Bloque web (hecho)

Skills: `ui-styling` invocado antes del JSX; `web-design-guidelines` como autochequeo (guía de Vercel
descargada). Cambio aplicado por el chequeo: `translate="no"` en el `<code>` con el nombre de la variable.
No aplicados a propósito: placeholder sin "…" final y textos en minúscula (los textos exactos los fija la
SDD; "Title Case" es convención en inglés).

- **Nuevo** `apps/web/src/lib/bot-ai.ts` (`server-only`): `getBotAiKeyStatus()` → `{ hasKey, apiKeyEnvName, provider }`
  vía `resolveBotAiEnv(process.env)`; nunca expone la clave.
- `ajustes/actions.ts`: `saveBotAiAction` al final (zod `botAiEnabled` "0"/"1" + `botAiInfo`; trim;
  `validateBotAiInfo`; no se puede **prender** sin clave → "Para activarlo falta cargar {VAR} en el servidor.";
  apagar o guardar texto sin clave sí; `botAiInfo: info || null`; `revalidatePath("/ajustes")`).
  No se tocaron `saveSettingsAction`, `saveAfterHoursAction` ni `setBotPausedAction`.
- **Nuevo** `ajustes/bot-ai-form.tsx`: patrón de `after-hours-form.tsx` (`onSubmit` + `startTransition`, sin
  `<form action>`, sin `confirm()`). Encabezado + descripción, `Alert tone="warning"` sin clave, `Switch`
  (`id="bot-ai-activo"`, `aria-describedby`, `disabled={!hasKey && !enabled}`, hidden `botAiEnabled`),
  `Field` + `Textarea name="botAiInfo" rows={6}` **sin `maxLength`**, ayuda + contador `n / 2.000`
  (`tabular-nums`, `aria-live="polite"`, `text-destructive` si se pasa), `FormError` inline, botón
  "Guardar"/"Guardando…", toast "Guardado".
  Decisión: el contador cuenta `trim().length` (la misma medida que valida la action), así el número del
  contador coincide con el "(tenés n)" del error.
- `ajustes/page.tsx`: `Separator` + `BotAiForm` después de `AfterHoursForm`, dentro de la Card "Bot de WhatsApp".

## Bloque repo (hecho)

- `.env.example`: bloque HU-012 tal cual la SDD (solo nombres de variables, sin valores).
- `README.md`: fila de `npm run test:bot-ai --workspace apps/bot`.

## Verificación final (desde la raíz, bot detenido)

| Comando | Resultado |
|---|---|
| `npm run db:generate` | Generated Prisma Client (v5.22.0) |
| `npm run typecheck` | core, db, bot y web limpios (0 `error TS`) |
| `npm run test` | **45 archivos, 863 tests OK** (780 previos + 83 nuevos: core 38, db 14, bot 31) |
| `prisma migrate status` | 18 migrations found… **Database schema is up to date!** |
| `npm run test:bot-ai --workspace apps/bot` | **18/18 escenarios OK**, datos borrados por id |
| `npm run test:after-hours --workspace apps/bot` | 12/12 OK |
| `npm run test:confirm-flow --workspace apps/bot` | 5/5 OK |
| `npm run lint --workspace apps/web` | sin errores; solo el warning preexistente de `logo-form.tsx` (alt) |
| `./ops/harness/verify.sh` | **Arnés OK** (exit 0). WARN informativos: migración nueva (SQL revisado arriba) y bot tocado (probado sin WhatsApp, sin restos en OutboundMessage) |

Conteos en solo lectura antes/después: idénticos (ver bloque bot). Ninguna llamada a Anthropic ni DeepSeek
(tests con clientes falsos; el script borra las claves del entorno y verifica que no haya runtime). No se
leyó ni imprimió el `.env`.

## Contrato compartido: confirmación

Firmas y nombres coinciden con la sección 4 de la SDD: `bot-ai.ts` (4.1), `bot-ai-tools.ts` (4.2),
`messages.ts`/`wake.ts` (4.3), `domain/botAi.ts` (4.4), `provider.ts` (4.5), `createAnthropicProvider` (4.6),
`createDeepSeekProvider` (4.7), `getBotAiRuntime`/`getBotAiConfig` (4.8), `answerQuestion`/`AskDeps`/`AskResult`
(4.9), `runSerialByJid` (4.10), `ConversationOptions` + `sendTyping` (4.11), `getBotAiKeyStatus` (5.1),
`saveBotAiAction` (5.2). Campos Prisma con los nombres exactos de 4.4.
**Agregados** (no reemplazan nada del contrato): `BOT_AI_INQUIRY_PREFIX` + `inquiryBodyFromAiQuestion` (core,
por la resolución P6 de la sección 15, con test), `addUsage`/`MIN_REMAINING_MS` (provider), `toBotAiError`/
`toDeepSeekError` exportados, `__queueSizeForTests` (jid-queue), `runBotAiPurge` (workers, nombrado en 6.5).

## Para el orquestador

- Sin commit. `develop` avanzó 2 commits (HU-010, sin solapamiento con esta HU ni con `packages/db/prisma`):
  queda mergearlo en la rama cuando se decida.
- Convivencia HU-010: no se tocó ningún archivo de la lista 2.1. Cambios en compartidos solo aditivos
  (`schema.prisma` +63/−0, `index.ts` de core +2, `domain/index.ts` +1).
- Respaldo previo a la migración: `~/nutribot-backups/pre-hu012-20261002-2112.dump` (278K).
- Pendiente fuera de mi alcance: recorrido visual de `/ajustes?tab=whatsapp` (lo hace el orquestador);
  dejar la fila real de `Professional` como está si se prueba guardar.
