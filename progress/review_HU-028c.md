# Review — HU-028c (IA por consultorio, issue #71)

**Veredicto:** APPROVED

Revisado: `git diff origin/develop...HEAD` en `feat/HU-028c-ia-por-consultorio` (13 commits `14d470e`..`20f83aa`,
merge-base = `origin/develop` `a58e023`), contra `Refactorizaciones/integraciones-por-consultorio.md` §C0–§C16
(D-c1 = b) y `CHECKPOINTS.md`.

Verificación corrida por el reviewer (no copiada del impl):
- `npm run typecheck` → exit 0 (core, db, web, bot).
- `npm run test` → exit 0: 255 archivos passed, 1 skipped; 4294 tests passed, 1 skipped.
- `npm run test:ai-tenants --workspace packages/db` (Postgres descartable) → `test-bot-ai-per-tenant: OK`
  (backfill con md5 igual, fail closed, 8/8 casos A/B, CHECK, FK compuesta, drift sin diferencias).
- `./ops/harness/verify.sh` → "Arnés OK."
- `grep getProfessional` en todo el repo (`*.ts/*.tsx/*.js/*.mjs/*.sh`): solo quedan los tres tests que impiden que vuelva.

## Checkpoints
- C1 backlog válido / bitácora / sin archivos de la otra persona / verify.sh: [x] (el tope "1 HU activa" quedó reemplazado por la regla de lotes de `_reglas.json`; verify.sh lo valida OK)
- C2 HU + SDD completas, firmas = contrato compartido: [x] — §C5.1–§C5.4 coinciden 1:1 (`countBotAiQuestionsToday → {patient, tenant}`, `markBotAiQuestionHandedOff` con `tenantId`, `runBotAiTool({…, tenantId})`, `getTenantAiSettings`, `recordPanelAiUsage`, `applyTenantBotAiLimits`, `parseTenantAiLimitArg`, `addChatUsage`, `DEEPSEEK_PROVIDER`).
- C3 arquitectura (core puro, domain compartido, web y bot ajustados): [x]
- C3 migración coherente / sin destructivos / NOT NULL con backfill: [x] — `migration.sql:6-19`: fail closed → `ADD COLUMN` nullable → backfill desde `Patient` → `SET NOT NULL`, todo en `BEGIN/COMMIT`; sin `DROP`; FK compuesta `:25-26` contra el `@@unique([id, tenantId])` existente; CHECK `:47-49` igual a `TENANT_AI_LIMIT_MAX`. Probado en Postgres descartable con datos tipo prod y con huérfanos.
- C3 rutas protegidas / portal: [x] — sin rutas ni acciones nuevas; el registro del panel usa el `ctx` de `requireTenantContext` y no registra si no hay contexto (tests en `asistente/actions.test.ts:123`, `ai-actions.test.ts:177`).
- C3 bot en silencio fuera de sesión, textos = SDD: [x] — sin mensajes nuevos; `botPaused` y wake word siguen cortando antes de responder (`conversation.ts:184-195`).
- C3 sin console.log de debug: [x]
- C4 typecheck limpio: [x]
- C4 tests de core y `npm run test`: [x]
- C4 bot simulado sin WhatsApp: [x] por mocks (`conversation-ai.test.ts`) y probe descartable; las simulaciones `test:bot-ai`/`test:booking-reason` contra la base de dev no las re-corrí (escriben en dev); el impl reporta limpieza por id.
- C4 PDF: n/a
- C5 impl existe: [x] · review: [x] · sin scripts sueltos: [x]

## Foco pedido

1. **Migración en deploy con datos reales:** segura. Bloquea `ACCESS EXCLUSIVE` desde el `ADD COLUMN`, así que el bot viejo
   no puede colar inserts entre backfill y `SET NOT NULL`; si cuela uno antes (de un paciente sin tenant), el
   `SET NOT NULL` aborta la transacción y no queda nada a medias. La ventana post-`COMMIT` (bot viejo inserta sin
   `tenantId` → `AI_ERROR`) está documentada en `deploy/README.md:161-163`.
2. **Tools con el tenant de la conversación:** `botAi.ts:180-245` usan solo `p.tenantId` (puesto por
   `conversation.ts:935-943` desde `getConversationTenant()`, que nunca sale del mensaje ni de la IA).
   `botAi.test.ts:249-263` inyecta `tenantId: "tenant-b"` en el input y verifica todos los `where`; el probe A/B
   lo confirma en Postgres real (servicios, disponibilidad, mis_turnos, datos_consultorio).
3. **Topes por consultorio con fallback:** `applyTenantBotAiLimits` (core) + `getTenantAiSettings` dentro del `try`
   (`conversation.ts:921-926`): error de base → `AI_ERROR` con solo `errName`. Override de pruebas sigue ganando.
4. **Registro del panel:** `aiUsage.ts:56-75` nunca tira, guarda solo metadata, `errorCode` saneado por regex.
   Llamado una vez por invocación que llegó al proveedor; no registra en validaciones previas.
5. **Calendar fuera de la IA:** `getTenantProfessional` usa `PROFESSIONAL_SELECT` (sin campos de Google, test en
   `professionalSelect.test.ts`); `aiUsage.ts` sumado a `AI_FILES` en `google-calendar-isolation.test.ts:72`.
6. **Rebase con 025c y borrado de `getProfessional`:** resolución correcta (inicio de `handleIncoming` con la
   versión 028c, resto con `conversationProfessional()` de 025c). El borrado (`20f83aa`) excede la letra de §C0
   ("borrar getProfessional queda para 025c"), pero 025c ya está en develop y no quedó ningún consumidor; está
   en commit aparte y lo pidió el orquestador. Aceptado.

## Cambios requeridos
Ninguno.

## Dudas (no bloqueantes)
- `deploy/README.md:155` dice que el `migrate` "corta a propósito con `HU-028c: …`", pero el propio impl
  (Decisiones no obvias) aclara que Prisma muestra `current transaction is aborted…` y el `HU-028c:` solo sale en
  el log de Postgres. Conviene decirlo así para quien opera el deploy.
- `deploy/README.md:182`: `prisma migrate resolve --rolled-back <carpeta>` sin el comando real de producción.
  Sugerido: `docker compose run --rm migrate npx prisma migrate resolve --rolled-back 20261127190208_ai_usage_per_tenant --schema packages/db/prisma/schema.prisma`.
- El cliente Prisma compartido loguea `["error"]` en producción (`packages/db/index.ts:10`): si falla
  `panelAiUsage.create`, además del `console.warn` con el código sale el volcado de la invocación (se ve en la
  salida del probe). Los argumentos no tienen contenido ni datos de pacientes, así que D12 se cumple; solo que el
  log no queda en "solo el código".
- `conversation.ts:180-181`: `getConversationTenant()` (consulta de scope legacy) corre ahora antes del corte por
  `botPaused`/wake word en cada mensaje entrante (antes iba después). Una consulta más por mensaje, sin cambio
  de comportamiento con los datos de producción.
- `progress/impl_HU-028c.md:4` sigue diciendo base `f0f4cb5`; la sección del rebase (`:154`) lo corrige.
