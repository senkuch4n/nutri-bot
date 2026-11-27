# Review — HU-029b (suscripción de Arzium con Mercado Pago: alta, autorización, cancelación y estado)

**Veredicto:** APPROVED

Revisado: worktree `Nutri-Bot-HU029b`, rama `feat/HU-029b-suscripcion`, `git diff origin/develop...HEAD`
(15 commits, 52 archivos). Fuente: SDD `Refactorizaciones/suscripcion-arzium-mercadopago.md` Parte B con
B.0 R1–R16, DP1 resuelta (umbral de 1 h), anexo HU-026. Modelo del reviewer: opus.

## Verificación corrida por el reviewer (no copiada del impl)

| Comando | Resultado |
|---|---|
| `npm run typecheck` | exit 0 (core, db, bot, web) |
| `npm run test` | 269 archivos OK, 1 skipped; 4648 tests OK, 1 skipped (exit 0) |
| `grep -rn validationCharge packages/core/src apps/web/src` | vacío (exit 1) |
| grep del email en `console.`/`subscriptionEvent` de `subscriptions.ts` | vacío (exit 1) |
| `test ! -e "apps/web/src/app/(panel)/ajustes/suscripcion"` | exit 0 |
| `npm run test:subscriptions --workspace packages/db` | `test-tenant-subscriptions: OK` (fixture intacta, 6/6 integración, drift 0; los `23514` del log son los casos de CHECK que se esperan) |
| `npm run test:mp-tenants --workspace packages/db` | OK |
| `bash packages/db/scripts/test-tenant-isolation.sh` | OK |
| `prisma migrate status` (dev, solo lectura) | "Database schema is up to date!" (45 migraciones) |
| `npm run build --workspace apps/web` | exit 0; `ƒ /ajustes/suscripcion`, `ƒ /api/webhooks/mercadopago-suscripciones` |
| `./ops/harness/verify.sh` | "Arnés OK." |
| Probe propio del SDK (fetch falso, en scratchpad, sin red ni base) | ver punto 2 |

No corrí `test:confirm-flow` (el flujo sí/no del bot no cambió: solo se suma un cron). No escribí en la base de
desarrollo. Ninguna llamada a MP ni WhatsApp.

## Foco pedido por el orquestador

1. **Migración `20261127213351_tenant_subscriptions`.** Solo `CREATE TYPE` (6), `CREATE TABLE` (4 nuevas),
   `CREATE INDEX` y FKs desde las tablas nuevas (`ON DELETE RESTRICT ON UPDATE CASCADE`). Ningún `ALTER`/`DROP`
   sobre tablas existentes; el diff de `schema.prisma` no tiene líneas borradas. Bloque a mano igual a §B.4.2:
   índices parciales `TenantSubscription_open_per_tenant_key` y `SubscriptionPlan_default_per_mode_key`, CHECK de
   plan y de suscripción (incluidos `payer_email_transient` y `payer_email_length`), y el `INSERT` de los dos planes
   ($60.000, 1 mes, 7 días, `LIVE` y `SANDBOX`, `isDefault`) con ids fijos y `ON CONFLICT DO NOTHING`: idempotente
   y no toca otras filas. Columnas `NOT NULL` solo en tablas nuevas (sin backfill necesario). Segura para un deploy
   con datos reales; el probe lo confirma con hash de `MercadoPagoAccount`/`Tenant`/`TenantMembership` y drift 0.
2. **Pagos.**
   - `payer_email` obligatorio: `ArziumPreapprovalCreate.payer_email: string` (`subscriptionsGateway.ts:21`);
     normalizado en la acción (`actions.ts:49`) y otra vez en el dominio (`subscriptions.ts:433`). Los dos errores
     de MP: `classifyPreapprovalCreateError` (`subscription-billing.ts:199-211`) → `payer_email_required` /
     `payer_email_rejected`; `handleCreateError` (`subscriptions.ts:622-628`) suelta lease y email, evento REJECTED
     sin email, devuelve `invalid_payer_email` / `payer_email_rejected`. Tests en core y db.
   - Deduplicación propia: lease bajo advisory lock (`subscriptions.ts:461-509`), búsqueda por
     `external_reference` antes de cada POST y sin POST si la búsqueda falla (`:528-535`), un solo POST
     (`:570-574`), error ambiguo → lease conservado y sin reintento (`:636-641`), adopción de la `authorized` o la
     `pending` más reciente y cancelación de duplicados (`:253-259`, `:537-543`). El mock de `createPreapproval`
     ignora la key, como pide §B.9.2; el probe en Postgres prueba 2 starts concurrentes → 1 fila y 1 POST.
   - SDK sin reintentos y cliente por llamada (`subscriptionsGateway.ts:69-70`): **verifiqué la afirmación del
     implementer** contra `mercadopago@3.6.1` instalado. `PreApproval.create/get/update/search` hacen
     `this.config.options = {...this.config.options, ...requestOptions}` (`dist/clients/preApproval/index.js:41,50,60,69`):
     las opciones quedan pegadas en el config compartido. `RestClient.fetch` reintenta por defecto 3 veces en
     429/500/502/503/504 y en errores de red (`AppConfig.DEFAULT_RETRIES = 3`). Con un fetch falso que devuelve 500:
     el SDK por defecto hace **4** POST y deja `idempotencyKey` pegada en `config.options`; el gateway hace **1** POST
     y la segunda llamada lleva su propia key. Timeout → `MPConnectionError` con `status 0` → `ambiguous`. Correcto.
   - `card_validation` de $0: en 029b el tópico `payment` se ignora sin consultar MP (`subscriptions.ts:1112`;
     test `subscriptions.test.ts:941`). No crea nada ni cambia estado.
   - Importes: `validatePlanTerms` exige [15, 2.000.000] (`subscription-billing.ts:85`); "Cannot pay an amount…"
     → `plan_not_offered` + `console.error invalid_plan`.
   - DP1: `STALE_CHECKOUT_TRIAL_LOSS_MS = 1 h` (`subscription-billing.ts:160`), `resumePendingCheckout` recrea
     solo con prueba y pérdida > 1 h (`subscriptions.ts:792-807`); `trialEndsAt = resolveTrialEnd(...)` con el
     `next_payment_date` de MP (`:959-967`). Tests de 59/61 min y de "creada 5 días antes".
3. **Webhook.** Firma con `verifyMercadoPagoSignature` y el `data.id` de la query (`route.ts:16,27,32`); respaldo
   del cuerpo solo si falta en la query; más de un `data.id`, id inválido o firma mala → 401 sin procesar; sin
   secreto → 503. El cuerpo solo da tópico e id: `syncWithContext` siempre hace `getPreapproval` y busca la fila
   por el id/referencia **que devuelve MP** (`subscriptions.ts:840-855`). Idempotencia: snapshot repetido →
   `UNCHANGED`, más viejo → `stale_snapshot`, todo bajo `FOR UPDATE` (`:876-992`); test "el mismo dos veces" y sync
   concurrente en el probe. Tópicos: solo `subscription_preapproval`; el resto `ignored`. Sin logs de cuerpo ni
   headers. Matcher del middleware excluye exactamente `/api/webhooks/mercadopago-suscripciones` (test).
4. **Permisos.** Acciones start/continue/cancel con `requireSubscriptionOwnerContext`, refresh con
   `requireSubscriptionReadContext` (`actions.ts:34-39,95`); tenant siempre `ctx.tenantId` del servidor; del cliente
   solo llegan `planId` y email. STAFF y soporte → `owner_only`. `guard-coverage.test.ts` acepta las puertas nuevas
   solo bajo `app/(suscripcion)/`. R16: `middleware.ts:45` deja pasar solo `access.kind === "onboarding"` con
   `pathname === "/ajustes/suscripcion"` exacto; tests en `middleware.test.ts:173-240` cubren `?mp=volver`, server
   action, `/ajustes`, `/ajustes/suscripcion/x`, `/ajustes/suscripcionx`, `/agenda`, `/api/slots`, setup, STAFF
   pendiente y operativa. `requirePageContext`/`requireOwnerContext`/`requireTenantContext` no cambiaron. El email
   de la titular nunca llega a STAFF (`subscription-model.ts:50`, `page.tsx:22`; test P10).
5. **Contrato con HU-026.** `onboarding-subscription-gate.ts` reexporta el gate real; con
   `ARZIUM_SUBSCRIPTIONS_ENABLED` apagado → `not_required` sin consultar la base (`subscriptions.ts:1166-1167`, test
   `:1049`). El efecto (las titulares en onboarding pasan a operativas al desplegar) es la decisión del anexo
   ("los consultorios nuevos se habilitan sin suscripción") y está documentado en `deploy/README.md:199-201` con
   "Avisar a Leo antes del deploy". Consultorios existentes: sin cambios.
6. **Desvíos declarados.**
   - "Empezar de nuevo" consulta antes de cancelar (`subscriptions.ts:733-745`): **correcto** (la SDD cancelaría
     una autorizada y recién después lo vería). Testeado: `subscriptions.test.ts:616` (`cancelPreapproval` no se
     llama) y `:681`.
   - Gate y vista toman la no terminada y si no la última (`:343-349`, `:1170-1172`): **correcto**; con el índice
     parcial hay como máximo una abierta. Testeado en el probe (CANCELED insertada después de la abierta → el gate
     sigue `verified`).
   - SDK sin reintentos y config por llamada: **correcto** (verificado arriba). **Sin test en el repo** (ver dudas).
7. **Logs y red.** Los `console.*` de `subscriptions.ts` solo llevan códigos, `{ op }`, `{ missing }`, `{ planId }`
   o `{ subscriptionId }` (lo pin `subscriptions-privacy.test.ts`); el gateway no loguea; el webhook loguea un código
   fijo; el bot solo el id interno. Tests con gateway falso; el probe bloquea `fetch`.

## Checkpoints

- C1 backlog válido / 1 HU activa por responsable: [x] — `verify.sh` OK (la regla de una HU activa la reemplazó la de lotes de `_reglas.json`).
- C1 `progress/current-<responsable>.md` refleja la HU: [x] — es del orquestador, en el repo principal; fuera de este diff.
- C1 no toca archivos de HU de la otra persona: [x]
- C1 `./ops/harness/verify.sh` exit 0: [x]
- C2 `docs/hu-suscripcion-arzium-mercadopago.md` completa: [x]
- C2 SDD con workspaces, checklist y contrato: [x]
- C2 firmas = contrato compartido: [x] — agregados declarados y compatibles (`OfferedPlanView.trialLength/trialUnit`, `CHECKOUT_CREATE_LEASE_MS`, `parseMercadoPagoDate`, `continueCheckoutAction` puede dar `mp_unavailable` por la validación de host de §B.6.2).
- C3 lógica pura en core, base compartida en `packages/db/domain`: [x]
- C3 web y bot compilan con el schema/domain nuevos: [x]
- C3 migración coherente, sin destructivos, NOT NULL solo en tablas nuevas: [x]
- C3 rutas nuevas protegidas por auth; nada de datos ajenos: [x]
- C3 bot en silencio / textos = SDD: [x] — el bot no manda mensajes; `SUBSCRIPTION_TEXT` = §B.7.
- C3 sin `console.log` de debug ni TODOs sin contexto: [x]
- C4 `npm run typecheck` limpio: [x]
- C4 core con tests y `npm run test` pasa: [x]
- C4 flujo del bot simulado sin WhatsApp: [x] — no cambió el flujo conversacional; `workers.test.ts` cubre el cron nuevo.
- C4 PDF/documento: [x] — no aplica.
- C5 `progress/impl_HU-029b.md` existe y describe lo tocado: [x]
- C5 `progress/review_HU-029b.md` con veredicto: [x]
- C5 sin scripts sueltos ni datos de prueba en la base de dev: [x] — `git status` solo muestra `backlog/HU-029.json` (orquestador) y el impl.

## Cambios requeridos

Ninguno bloqueante.

## Dudas (no bloqueantes)

- **Recomendado antes del PR:** el invariante G2 "nunca un POST repetido a ciegas" depende solo de
  `maxRetries: 0` en `subscriptionsGateway.ts:70` y no hay test que lo fije (la SDD no lo pedía). Un test de
  `createArziumMercadoPagoGateway` con `globalThis.fetch` falso que devuelve 500 en `createPreapproval` y
  verifica **1** llamada (y que una segunda llamada no reusa la key) prueba el SDK real y detectaría una
  regresión o un cambio de semántica en un `npm update` (la dependencia es `^3.6.1`).
- `subscriptions.ts:450-452` (restart) y `:465-467` (paso 5) buscan la suscripción abierta sin filtrar por `mode`,
  mientras vista, resume, refresh y cancel sí filtran. Es coherente con el índice parcial (una abierta por
  consultorio en cualquier modo) y sandbox nunca corre en producción; solo puede confundir en dev si se cambia de
  modo con una abierta.
- `abandonPending` marca `cancelRequestedAt` (`subscriptions.ts:729`) antes de cancelar; si termina en
  `restart_unconfirmed`, el campo queda puesto y una cancelación desde la cuenta de MP en los 15 min siguientes se
  atribuiría a `PANEL`. Impacto bajo (fila sin autorizar).
- El abandono no toma el advisory lock del consultorio: otra pestaña que haga start en ese momento puede recibir el
  `checkoutUrl` viejo que se está anulando. Carrera de doble pestaña poco probable; la persona vuelve a P3.
- `(suscripcion)/layout.tsx:26`: texto nuevo "Saltar al contenido" (skip link) fuera de §B.7; aceptable como rótulo
  de accesibilidad.
