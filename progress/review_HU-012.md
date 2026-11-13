# Review — HU-012 (preguntas-bot-ia)

**Veredicto:** APPROVED

Revisado contra `docs/hu-preguntas-bot-ia.md` (Resoluciones), `Refactorizaciones/preguntas-bot-ia.md`
(la sección 15 manda) y `CHECKPOINTS.md`, sobre `git diff HEAD` más los archivos nuevos sin trackear
de la rama `feat/hu-012-preguntas-bot-ia`. Los comandos los corrí yo:

| Comando | Resultado |
|---|---|
| `npm run typecheck` | core, db, bot y web limpios (0 `error TS`, exit 0) |
| `npm run test` | 45 archivos, **863/863** OK (exit 0) |
| `./ops/harness/verify.sh` | exit 0, "Arnés OK" (WARN informativos: migración nueva y bot tocado; los dos revisados abajo) |
| psql en solo lectura | 0 pacientes `549000000002_`, 0 servicios `Antropometría (TEST)`, 0 `OutboundMessage` a `5490000000099`, 0 `BotAiQuestion`; `Professional`: `botAiEnabled=f`, `botAiInfo IS NULL` |

No corrí `test:bot-ai` (lo leí, como pedía la consigna).

## Checkpoints

### C1 — Arnés
- Backlog válido, como mucho 1 HU activa por responsable: [x] verify.sh: "15 HU; imleticio: HU-010; senkuch4n: HU-012". `backlog/HU-012.json` en `en_revision`.
- `progress/current-senkuch4n.md` refleja la HU: [x] (líneas 135–139).
- No toca archivos de HU de la otra persona: [x] ninguno de los de la SDD 2.1 (`plan-micronutrients*`, `micronutrient-recommendations*`, `planes/**`, `seed-hu010.ts`, `ai-food-catalog*`) aparece en `git status`.
- `verify.sh` exit 0: [x]

### C2 — Documentos
- `docs/hu-preguntas-bot-ia.md` completa, con Resoluciones: [x]
- `Refactorizaciones/preguntas-bot-ia.md` con workspaces, checklist y contrato: [x]
- Firmas y nombres del diff = Contrato compartido: [x] `bot-ai.ts` (4.1, el prompt de sistema es **idéntico** al texto de 4.1.1, lo comparé con diff), `bot-ai-tools.ts` (4.2), `messages.ts`/`wake.ts` (4.3), `domain/botAi.ts` (4.4), `provider.ts` (4.5), `createAnthropicProvider` (4.6), `createDeepSeekProvider` (4.7), `runtime.ts` (4.8), `answerQuestion`/`AskDeps`/`AskResult` (4.9), `runSerialByJid` (4.10), `ConversationOptions` + `sendTyping` (4.11), `getBotAiKeyStatus` (5.1), `saveBotAiAction` (5.2). Lo agregado (`BOT_AI_INQUIRY_PREFIX`, `inquiryBodyFromAiQuestion`, `addUsage`, `MIN_REMAINING_MS`, `toBotAiError`/`toDeepSeekError`, `__queueSizeForTests`, `runBotAiPurge`) suma al contrato y no reemplaza nada.

### C3 — Arquitectura
- Lógica pura en core y operaciones de base en `packages/db/domain`, sin duplicar: [x] el bot usa `domain/botAi.ts` y la web solo `resolveBotAiEnv`/`validateBotAiInfo` de core.
- Schema/domain cambiaron y web y bot compilan: [x] los consumidores están ajustados (`page.tsx` lee `pro.botAiEnabled`/`botAiInfo`).
- Migración: [x] `20261003001239_bot_ai_questions/migration.sql` coincide con el SQL de la SDD 3.2: `botAiEnabled BOOLEAN NOT NULL DEFAULT false`, `botAiInfo TEXT`, tabla nueva, 2 índices y FK `ON DELETE CASCADE`. No tiene DROP, ALTER TYPE ni RENAME. `schema.prisma`: +63/−0.
- Rutas del panel protegidas: [x] no hay rutas nuevas. `saveBotAiAction` vive en `/ajustes`, cubierto por el `matcher` de `apps/web/src/middleware.ts:8`, igual que el resto de las actions del archivo. No se toca el portal.
- El bot sigue en silencio fuera de una sesión y los textos coinciden con la SDD: [x] `DORMANT` no cambia (`conversation.ts:183`, `if (!isWakeWord) return`). A `AWAIT_QUESTION` solo se llega con la opción 5 y la IA disponible (`conversation.ts:375`). Una sesión vencida vuelve a DORMANT antes de llegar al bloque de la IA (`conversation.ts:178`). Los textos de `messages.ts` son los de la sección 6 al pie de la letra.
- Sin `console.log` de debug ni TODOs: [x] solo hay un `console.warn` operativo en `domain/botAi.ts:232`, que registra el nombre de la tool y la clase del error.

### C4 — Verificación
- `npm run typecheck` limpio: [x]
- Tests vitest de la lógica nueva de core y `npm run test` en verde: [x] `bot-ai.test.ts` (incluye el test del prefijo P6), `bot-ai-tools.test.ts`, `wake.test.ts`, más `botAi.test.ts`, `anthropic-provider.test.ts`, `deepseek-provider.test.ts`, `ask.test.ts` y `jid-queue.test.ts`.
- Flujo del bot simulado sin WhatsApp real y limpieza por id: [x] ver el punto 6 de abajo. La base no tiene restos (lo verifiqué yo).
- PDF/documento: [x] no aplica.

### C5 — Cierre
- `progress/impl_HU-012.md` existe y describe lo tocado: [x]
- `progress/review_HU-012.md` con veredicto: [x] (este archivo)
- Sin scripts sueltos ni datos de prueba: [x] el único script nuevo es `apps/bot/scripts/test-bot-ai-questions.ts`, que es parte de la SDD (10.6) y tiene su entrada `test:bot-ai`. La base está limpia.

## Verificaciones específicas pedidas

1. **SDK de Anthropic** (`apps/bot/src/ai/anthropic-provider.ts`, `@anthropic-ai/sdk ^0.131.0`). Todo según la documentación:
   - `client.messages.create` con tipos del SDK (`Anthropic.MessageParam`, `Anthropic.Tool`, `Anthropic.ToolUseBlock`, `Anthropic.ToolResultBlockParam`, `Anthropic.Message`), sin `any`.
   - Loop manual: cuando `stop_reason` es `tool_use`, agrega `res.content` como mensaje `assistant` y manda **todos** los `tool_result` en un solo mensaje `user` (l.93–110). `is_error: true` va cuando la tool falla (l.106).
   - Maneja `end_turn`/`stop_sequence`, `max_tokens` (truncated), `refusal` (sin leer `stop_details`) y cualquier otro valor (`unexpected_stop`).
   - Tope de vueltas: `rounds >= maxToolRounds` devuelve `tool_limit`.
   - No manda `thinking` ni `output_config`. Modelo `claude-haiku-4-5`, configurable con `BOT_AI_MODEL`.
   - `new Anthropic({ timeout: 20_000, maxRetries: 0 })`. Cada request lleva `{ timeout: min(timeoutMs, remaining) }` y hay un deadline total con margen de 1 s.
   - Errores mapeados con `instanceof`, de la clase más específica a la más general, sin comparar strings (l.26–37).
   - `usage` sumado en todas las vueltas, con `cache_*` en 0 cuando vienen null.
   - `cache_control: ephemeral` en el único bloque del `system`. System y tools son constantes: la fecha y el nombre de la profesional van en el mensaje de usuario.
   - Tools con `strict: true`, y cada `inputSchema` tiene `additionalProperties: false` y `required` igual a sus keys.
   - DeepSeek sigue la 4.7: `JSON.parse` en try/catch, un mensaje `tool` por cada llamada y `ERROR: ` como prefijo en las fallas.
2. **Seguridad de las tools** (`packages/db/domain/botAi.ts`):
   - Las 4 tools son de solo lectura (`findMany`/`getProfessional`/`getAvailableSlotsForService`).
   - `mis_turnos` ignora el input y filtra por el `patientId` que pasa `conversation.ts:762`. Hay test con `{ patientId: "OTRO" }` en vitest y otro en el escenario 4 del script.
   - Ninguna lee ClinicalRecord, Plan, Diary, Consultation, PatientInquiry ni Patient.
   - P10: `buildQuestionMessage` no lleva el nombre ni el teléfono del paciente (el escenario 3 del script lo comprueba).
   - "Información para el asistente" entra como dato de una tool. Aunque alguien inyecte instrucciones por ahí o por el texto del paciente, no hay tool de escritura ni parámetro de paciente que el modelo pueda controlar, así que no se puede ampliar el acceso.
3. **Sin API real ni fuga de la clave**:
   - Los tests usan clientes y proveedores falsos.
   - El script borra `API_KEY_IA_*` antes de cualquier llamada, comprueba que `getBotAiRuntime() === null` y siempre pasa `aiProvider`.
   - El log de arranque (`apps/bot/src/index.ts`) registra solo `provider`, `model` y `hasKey`.
   - `apps/web/src/lib/bot-ai.ts` es `server-only` y devuelve `{ hasKey, apiKeyEnvName, provider }`, sin la clave.
   - Sin clave o con el interruptor apagado, `isBotAiAvailable` da false: el menú sale sin la opción 5 y "5" responde `NOT_UNDERSTOOD` (`conversation.ts:375`).
4. **Bot**:
   - En `AWAIT_QUESTION`, los comandos estrictos (`isExitCommand`/`isMenuCommand`) y `menuDigit(text, 5)` se evalúan antes de llamar a la IA (`conversation.ts:213–229`).
   - D4(c)+P6: `handoffFromQuestion` guarda `inquiryBodyFromAiQuestion(...)` ("Pregunta al asistente: ...") y llama a `markBotAiQuestionHandedOff`. Manda la alerta de día con la misma condición que la HU-011, responde solo `INQUIRY_SAVED_DAY` o `inquirySavedAfterHours` y deja el paso en `AWAIT_INQUIRY`.
   - "0" sin pregunta previa usa `handleMenu("0")` de la HU-011, sin cambios.
   - Límites D6: 20/300/500, configurables. P8: cuentan `BOT_AI_COUNTED_OUTCOMES` (sin `LIMIT_*` ni TOO_LONG).
   - Cola por jid: un error no corta la cadena, la cola nunca queda rechazada y la entrada se borra del Map al vaciarse (`jid-queue.ts:13–20`).
   - Si el proveedor falla, el paciente recibe `AI_ERROR` y no se loggea la pregunta, la respuesta ni `err`.
5. **Migración y retención**:
   - La migración es aditiva, tiene `DEFAULT false` y cascade con el paciente.
   - `purgeExpiredBotAiQuestions` solo hace `botAiQuestion.deleteMany({ askedAt < cutoff })` y rechaza `retentionDays < 1` o NaN.
   - El cron `"30 4 * * *"` está justo antes del resumen de la HU-011, que sigue siendo el último, y también corre al arrancar.
6. **Script** `apps/bot/scripts/test-bot-ai-questions.ts`:
   - Limpia por ids propios. La limpieza previa aborta si un jid de prueba pertenece a un paciente que no termina en "(TEST)".
   - No escribe en `Professional`: el interruptor, la franja, la hora y los límites entran por `opts`.
   - Los `OutboundMessage` se borran por id, con una búsqueda de seguridad por `ALERT_JID` falso. `PatientInquiry` y `BotAiQuestion` se buscan por los ids de los pacientes TEST y se borran por id.
   - Aborta si `BotStatus.connected`. No puede llamar a la API (no hay claves y el proveedor es falso).
7. **HU-010**: no se tocó ningún archivo suyo. En los archivos compartidos los cambios son aditivos (`schema` +63/−0, `core/index.ts` +2, `domain/index.ts` +1, textos al final de `messages.ts`, función al final de `wake.ts`). Falta traer `origin/develop` (fix de la HU-010) a la rama, como ya anotó el implementer; eso no es un problema de esta HU.

## Dudas (no bloqueantes)

- **Fallas de base en el modo pregunta.** Si `countBotAiQuestionsToday` o `recordBotAiQuestion` lanzan (`ask.ts:60`, `ask.ts:148`), la excepción sube hasta `whatsapp.ts:141–143`: el paciente no recibe respuesta, ni siquiera `AI_ERROR`, y se loggea `{ err }`. Un error de validación de Prisma podría incluir los argumentos, es decir, el texto de la pregunta. Es poco probable y es el mismo comportamiento que tiene hoy el resto del bot, pero se podría envolver `answerQuestion` en `handleQuestionText` para responder `AI_ERROR`.
- **Historial fuera de la retención.** `aiHistory` (las últimas 6 preguntas y respuestas) queda en `ConversationState.context`, y la retención de 90 días no lo alcanza. Si la sesión vence sola (sin "chau"), ese contexto sigue en la base hasta que el contacto vuelva a escribir y se guarde un estado nuevo. Conviene que el usuario lo tenga presente por privacidad.
- `anthropic-provider.ts:14` y `deepseek-provider.ts:13` dejan el timeout del cliente fijo en 20.000 ms en lugar de usar `limits.timeoutMs`. No tiene efecto práctico, porque el timeout de cada request lo pisa con `min(timeoutMs, remaining)`.
- `apps/bot/tsconfig.json` no incluye `scripts/`, así que `typecheck` no revisa el script. Esto ya era así antes de esta HU; el implementer dice que el script corrió 18/18.
- Antes de mergear, traer `origin/develop` (2 commits de la HU-010) a la rama.
- El recorrido visual de `/ajustes?tab=whatsapp` está pendiente; lo hace el orquestador. Si se prueba guardar, dejar la fila de `Professional` como está ahora (`f`, `null`).
