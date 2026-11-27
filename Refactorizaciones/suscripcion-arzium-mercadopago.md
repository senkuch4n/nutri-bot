# SDD · HU-029 · Suscripción de Arzium con Mercado Pago (planes configurables, prueba gratis)

HU: `docs/hu-suscripcion-arzium-mercadopago.md` (validada 2026-11-25: D1–D15 = recomendaciones;
precio por defecto $60.000 ARS por mes; baja y re-alta libres; **varios planes configurables sin
cambiar código**). Issue #72 · lote `lote-1-mp` con HU-028 · responsable `senkuch4n` · **lleva
migración** (029b y 029c; label `migración`; solo una HU con migración en `implementando` a la vez,
y siempre **después de que 028a esté mergeada en `develop`**).

Skills aplicados: `skills/migracion-prisma.md` (§B.4, §C.3) y `skills/ui.txt` (estructura de
pantallas con componentes del panel, §B.6). Parte del estado del esquema que deja 028a
(`Refactorizaciones/integraciones-por-consultorio.md`, migración
`20261125234554_mercadopago_account_per_tenant`): `MercadoPagoAccount` una fila por consultorio,
`isPlatformMercadoPagoUserId()` en `packages/core`, `resolveMercadoPagoWebhookAccount()` en
`packages/db/domain/mercadopagoAccount.ts`.

La SDD tiene tres entregas, cada una con su propio checklist, verificación y PR:

| Entrega | Qué | Migración | Depende de |
|---|---|---|---|
| **029a** | Prueba en sandbox de la API de suscripciones (script + informe). | No | — (puede ir en paralelo con 028a: no toca esquema ni base) |
| **029b** | Planes, suscripción, log de eventos, Ajustes → Suscripción, webhook de suscripciones, conciliación del estado, cancelación. | `tenant_subscriptions` | 028a en `develop` · informe de 029a con las compuertas G1–G4 resueltas (§A.5) — **resueltas el 2026-11-27** (ver el bloque al principio de la Parte B) |
| **029c** | Cobros (`authorized_payments`), período pagado, `PAST_DUE`, devoluciones y contracargos. | `subscription_charges` | 029b en `develop` |

---

## 0. Resumen funcional (las tres entregas)

La `OWNER` de un consultorio entra a **Ajustes → Suscripción** (`/ajustes/suscripcion`), elige uno de
los planes que Arzium ofrece (por defecto el **mensual de $60.000 con 7 días gratis**) y el servidor
crea en Mercado Pago, **con la cuenta y credenciales de Arzium** (nunca las de señas del
consultorio), una autorización recurrente (`preapproval`) con importe, período, prueba y una
referencia opaca del consultorio fijados por el servidor. La persona autoriza en Mercado Pago; al
volver, Numa **no confía en la URL**: consulta la `preapproval` en MP y solo si es de Arzium, con la
referencia, el importe, la moneda y la frecuencia esperados, pasa la suscripción de `PENDING` a
`TRIALING` (o espera el primer cobro si no hay prueba). Un webhook propio de suscripciones y una
conciliación del bot cada 10 minutos mantienen el estado igual a lo que dice MP. En 029c se registra
cada cobro mensual (aprobado, rechazado, reintento, devuelto, contracargo), se calcula el "pagado
hasta" de forma idempotente y la suscripción pasa a `ACTIVE` o `PAST_DUE`. Los planes (importe,
período 1/3/12 meses, prueba en días o meses, cantidad de cobros para packs) son filas de una tabla
que Arzium administra por script; una re-alta no tiene prueba salvo una oferta asignada por Arzium.
Esta HU **no** habilita ni bloquea el uso del panel o el bot (eso es HU-030) y el cobro queda
**apagado por defecto** en todos los ambientes.

## 0.1 Decisiones de diseño (y por qué)

| # | Decisión | Motivo |
|---|---|---|
| X1 | Flujo D4(c): `POST /preapproval` **sin plan de MP**, `status: "pending"`, con `external_reference`, y redirección a su `init_point`. Los planes viven en **nuestra** tabla, no en `preapproval_plan`. | El servidor fija importe/prueba/referencia; no hay formulario de tarjeta propio. Compuerta G1 (§A.5): si 029a lo refuta, 029b no arranca y se rehace la SDD para D4(b). |
| X2 | Tabla `SubscriptionPlan` por modo (`SANDBOX`/`LIVE`) con importe, período (`frequency` + `frequencyUnit`), prueba (`trialLength` + `trialUnit`) y `billingCycles` (null = renueva sin fin; 1 = pack de un solo cobro). Los planes son **inmutables en lo económico** (cambiar precio = plan nuevo). | Requisito nuevo de varios planes sin cambiar código; "cambiar el precio a suscripciones existentes" está fuera de alcance. |
| X3 | La suscripción guarda una **copia de los términos** del plan (importe, moneda, período, prueba). | Validar contra MP lo que se autorizó, aunque después se edite o retire el plan. |
| X4 | Promociones = `SubscriptionPlanOffer` (consultorio + plan, `allowTrial`), creadas por script de Arzium. Planes `isPublic = false` solo se ven con oferta. | Resolución "una re-alta no da otra prueba salvo que Arzium le asigne una promoción"; sin consola de Arzium (025d). |
| X5 | Prueba una sola vez por consultorio **y** por usuaria que la inició (D7b). Una suscripción solo "consume" la prueba si llegó a autorizarse (`authorizedAt` no null). El fin de la prueba es el que fija MP (`next_payment_date` = creación + prueba, S9), no autorización + prueba; un checkout con prueba que quedó viejo se recrea al continuar (§B.5.4b). | Un checkout abandonado no quema la prueba; la fecha que se muestra es la del primer cobro real. |
| X6 | Como máximo una suscripción no terminada por consultorio: **índice único parcial** en SQL + advisory lock por consultorio al crear. | Doble clic / dos pestañas (Gherkin). Mismo patrón que `Agenda_primary_per_tenant_key`. |
| X7 | Creación en MP **fuera** de la transacción, con deduplicación **propia**: un lease en la fila (`checkoutCreateLeaseUntil`) para que un solo proceso cree, búsqueda por `external_reference` **antes** de cada `POST`, y nunca un `POST` repetido a ciegas después de un error ambiguo. `X-Idempotency-Key` se sigue mandando pero **no** es la deduplicación (S4 refutado: MP la ignora en `POST /preapproval`). | No sostener una transacción durante una llamada HTTP; nunca dos `preapproval` por suscripción (G2). |
| X8 | Sin plata todavía (029b): una suscripción **autorizada sin prueba** queda `PENDING` con `authorizedAt` hasta que 029c vea el primer cobro aprobado. | `ACTIVE` significa "pagó" para HU-030; nunca se anticipa. |
| X9 | Webhook propio `/api/webhooks/mercadopago-suscripciones` con `ARZIUM_MERCADOPAGO_WEBHOOK_SECRET` (aplicación de MP de Arzium, D3a). El cuerpo solo dice **qué** consultar; siempre se consulta MP. | Separación de credenciales y webhooks; idempotencia y orden los resuelve la API. |
| X10 | Fuera de orden: se guarda `mercadoPagoLastModified`; un snapshot más viejo que el guardado no se aplica. Todo cambio se aplica con `SELECT … FOR UPDATE` de la fila de la suscripción. | Webhook y conciliación concurrentes (patrón de `syncMercadoPagoPayment`). |
| X11 | "Pagado hasta" (029c) = máximo `periodEnd` entre cobros `APPROVED` vigentes. El período de cada cobro se asigna **una sola vez** (al aprobarse) y se encadena al anterior. Devolución/contracargo **total** saca al cobro del cálculo. | Idempotente por construcción; D12 (solo la devolución total descuenta). |
| X12 | `CANCELED` es terminal. Re-alta = suscripción nueva (sin prueba salvo oferta). | Baja y alta libres sin perder datos ni historial. |
| X13 | Mensual por defecto **$60.000 ARS, 7 días** sembrado en la migración para `LIVE` y `SANDBOX`. | D1; no depende de que alguien corra un script. |
| X14 | `payer_email` obligatorio (G3 refutada → D8(a)): la OWNER escribe el "Email de tu cuenta de Mercado Pago" (precargado con el de la login). Se guarda **solo** mientras la suscripción está `PENDING` sin autorizar (`checkoutPayerEmail`, con CHECK en la base) para poder recrear un checkout viejo; se borra al autorizar, cancelar o abandonar. | MP responde 400 sin el email o con uno que no es de un usuario de MP. Retención mínima del dato personal. |

---

# Parte A · 029a · Prueba en sandbox

## A.1 Resumen

Un script interactivo que, con **usuarios de prueba** de MP (vendedor = cuenta de cobro de Arzium de
prueba; comprador = usuario de prueba comprador), ejercita las llamadas que usarán 029b/029c y un
receptor local de webhooks detrás de un túnel. Resultado: `docs/mp-suscripciones-sandbox.md` con
cada supuesto S1–S17 marcado **confirmado / refutado / no verificable**, con evidencia saneada. No
importa Prisma, no lee `DATABASE_URL`, no escribe en la base ni en el esquema.

Quién lo corre (D15 = recomendación): el implementer escribe el script, sus tests y el runbook; **el
usuario** (o un agente con las credenciales de prueba que el usuario le pase) hace la corrida
manual, porque requiere iniciar sesión en el checkout de MP con el comprador de prueba y configurar
la URL de notificaciones en la aplicación de prueba. El implementer completa el informe con la salida
de esa corrida. Si la corrida no se puede hacer en la sesión, 029a se entrega con el informe en
estado "pendiente de corrida" y **029b queda bloqueada** hasta completarlo.

## A.2 Workspaces afectados

| Workspace | ¿Se toca? | Qué |
|---|---|---|
| `packages/db` | **Sí (solo `scripts/`)** | Script de sandbox, su lib pura y su test. **Sin** `schema.prisma`, migraciones ni `domain/`. |
| `packages/core` | No | — |
| `apps/web` | No | — |
| `apps/bot` | No | — |

## A.3 Archivos

| Archivo | Acción |
|---|---|
| `packages/db/scripts/mp-subscriptions-sandbox.ts` | **Crear.** CLI de subcomandos (§A.4). Importa solo `mercadopago` (SDK), `node:*` y `../domain/mercadopago-signature` (crypto puro). **Prohibido** importar `../index`, `@nutri-bot/db` o cualquier `domain/*` que toque Prisma. |
| `packages/db/scripts/lib/mp-sandbox-redact.ts` (+ `.test.ts`) | **Crear.** `redactMercadoPagoResource(value: unknown): unknown` — devuelve una copia con `payer_email`, `email`, `first_name`, `last_name`, `identification`, `phone`, `card*`, `card_token_id`, `access_token`, `token` y cualquier clave que contenga `email`/`token`/`card` reemplazados por `"[redacted]"`, y los ids de MP truncados a 6 caracteres + `…`. Usado por todo lo que el script imprime o guarda. |
| `packages/db/scripts/lib/mp-sandbox-guard.ts` (+ `.test.ts`) | **Crear.** `assertSandboxSeller(me: unknown): void` — tira si `/users/me` no tiene `tags` con `"test_user"` (fail closed: nunca operar con una cuenta real). `assertSandboxEnv(env)`: exige `MP_SUBS_SANDBOX=true` y `NODE_ENV !== "production"`. |
| `packages/db/package.json` | Script `"mp:subs-sandbox": "dotenv -e ../../.env.mp-sandbox.local -- tsx scripts/mp-subscriptions-sandbox.ts"`. El archivo `.env.mp-sandbox.local` ya está ignorado por `.env.*.local`; **no** se usa el `.env` de la raíz. |
| `docs/mp-suscripciones-sandbox.md` | **Crear.** Runbook (cómo crear usuarios de prueba, la aplicación de prueba, el túnel, el orden de comandos) + tabla de resultados S1–S17 + compuertas G1–G4 resueltas. |

Variables de `.env.mp-sandbox.local` (no se commitea): `MP_SUBS_SANDBOX=true`,
`ARZIUM_MERCADOPAGO_ACCESS_TOKEN` (del **vendedor de prueba**), `ARZIUM_MERCADOPAGO_WEBHOOK_SECRET`
(clave secreta de la aplicación de prueba), `MP_SUBS_BUYER_EMAIL` (email del comprador de prueba,
solo si S3 lo exige), `MP_SUBS_BACK_URL` (URL pública del túnel + `/volver`), `MP_SUBS_LISTEN_PORT`
(por defecto `4010`), `MP_SUBS_CAPTURE_DIR` (directorio **fuera del repo**; por defecto
`mktemp -d`).

## A.4 Subcomandos del script

Todos empiezan con `assertSandboxEnv` y `GET /users/me` → `assertSandboxSeller`. Imprimen solo
salida redactada.

| Subcomando | Qué hace | Supuestos |
|---|---|---|
| `whoami` | `/users/me` redactado: `id`, `site_id`, `tags`. | S13, S17 |
| `create --freq 1 --unit months --trial 7 --trial-unit days [--amount 60000] [--cycles N] [--no-email] [--idem <key>]` | `PreApproval.create` con `status: "pending"`, `external_reference: "sbx_<hex>"`, `back_url`, `reason: "Numa · prueba sandbox"`, `auto_recurring` (con `free_trial` y `end_date` si `--cycles`), `payer_email` salvo `--no-email`. Imprime id, `status`, `init_point`, `next_payment_date`, `auto_recurring`, `collector_id`. El body con `free_trial` se arma con un tipo local (el `PreApprovalRequest` del SDK no lo declara en `create`). | S1, S3, S5, S15, S16 |
| `create … --idem <key>` dos veces | Misma `X-Idempotency-Key` → ¿mismo id? Registrar también qué pasa con otra key y el mismo `external_reference`. | S4 |
| `get <preapprovalId>` | `PreApproval.get` redactado. | S1, S2, S8, S9, S13, S15 |
| `search --ref <externalReference>` | `PreApproval.search({ options: { external_reference } })`. | S2 |
| `cancel <preapprovalId>` | `PreApproval.update({ status: "cancelled" })` y `get` posterior. Probar sobre una `pending` y sobre una `authorized`. Probar autorizar el `init_point` de una `pending` ya cancelada. | S8 |
| `pause <id>` | `status: "paused"` y `get`. Solo para conocer el estado. | S8 |
| `invoices <preapprovalId>` | `Invoice.search({ options: { preapproval_id } })` redactado: `id`, `status`, `payment.{id,status,status_detail}`, `debit_date`, `retry_attempt`, `transaction_amount`, `currency_id`, `preapproval_id`. | S10, S11 |
| `invoice <id>` | `Invoice.get`. | S11 |
| `payment <paymentId>` | `Payment.get` redactado: `status`, `status_detail`, `transaction_amount_refunded`, `collector_id`, `metadata`, `point_of_interaction`, `external_reference`. | S12 |
| `listen` | Servidor HTTP local en `MP_SUBS_LISTEN_PORT`: por cada request guarda en `MP_SUBS_CAPTURE_DIR/<ts>.json` método, path, query, headers `x-signature`/`x-request-id`, cuerpo **redactado** y el resultado de `verifyMercadoPagoSignature` (con `data.id` de la query y, si falta, del cuerpo, anotando cuál funcionó). Responde 200. | S6, S7 |

Corrida mínima del runbook (la hace el usuario):

1. Crear en el panel de MP de Arzium dos usuarios de prueba (vendedor, comprador) y una aplicación de
   prueba **en el vendedor**, con la URL de notificaciones = URL del túnel
   (`cloudflared tunnel --url http://localhost:4010` o equivalente) y los tópicos de suscripciones y
   pagos activados.
2. `npm run mp:subs-sandbox --workspace packages/db -- listen` (en otra terminal).
3. `create` mensual con 7 días → abrir `init_point` logueado como comprador de prueba con una
   tarjeta de prueba → autorizar → `get` → `invoices`.
4. `create --freq 1 --unit days --trial 1 --trial-unit days` (para ver un cobro real de sandbox en ~1
   día) y, sin prueba, `create --freq 1 --unit days` (cobro inmediato). Al día siguiente: `invoices`,
   `payment`.
5. Variantes: `--freq 3`, `--freq 12`, `--trial 1 --trial-unit months`, `--cycles 1`, `--no-email`.
6. Tarjeta de prueba que rechaza (nombre del titular `OTHE` o la que indique la doc de MP) → ver
   `recycling` y reintentos.
7. Devolución total y parcial de un cobro aprobado desde el panel del vendedor → `payment` y
   webhook.
8. `cancel` desde el script y, en otra, cancelar desde la cuenta del comprador → webhook y `get`.

## A.5 Supuestos a confirmar y compuertas

| # | Supuesto | Si se refuta |
|---|---|---|
| S1 | `POST /preapproval` sin `preapproval_plan_id`, con `status: "pending"`, devuelve `init_point` y **respeta `auto_recurring.free_trial`** (días y meses). | **G1**: 029b no arranca; se relanza el architect para D4(b) (Bricks + plan). |
| S2 | `external_reference` vuelve igual en `GET` y se puede buscar con `/preapproval/search?external_reference=`. | **G2**: sin búsqueda, 029b guarda la fila `PENDING` y llama a MP **dentro** del advisory lock (sin `FOR UPDATE` de filas de negocio), aceptando la transacción larga. Anotar en el informe; el implementer de 029b aplica la variante de §B.5.3 nota 2. |
| S3 | `payer_email` es opcional en `status: "pending"` (la persona elige la cuenta en el checkout). | **G3**: variante D8(a): campo "Email de tu cuenta de Mercado Pago" precargado con el de la login (§B.6). |
| S4 | `X-Idempotency-Key` en `POST /preapproval` devuelve la misma `preapproval` con la misma key (anotar el TTL si se ve). | Se mantiene igual el diseño: la búsqueda por referencia (S2) es la red de seguridad. Si S2 **y** S4 fallan → G2. |
| S5 | `frequency_type: "months"` acepta `frequency` 1, 3, 6 y 12; `"days"` funciona en sandbox; `end_date` corta después de N cobros (pack) y la `preapproval` termina en `finished`. | Períodos no aceptados se quitan de `ALLOWED_MONTH_FREQUENCIES` (§B.4.1). **G4**: sin `end_date`, `PLAN_BILLING_CYCLES_SUPPORTED = false` y los packs quedan como pago único fuera de esta HU (HU aparte con Checkout Pro). |
| S6 | Las notificaciones de suscripciones salen de la URL **de la aplicación**; tópicos `subscription_preapproval`, `subscription_authorized_payment`, `payment`; cuerpo `{ type, action, data: { id } }`; `data.id` viene en la query; `x-signature` valida con el mismo manifiesto que las señas. | Si `data.id` no viene en la query: el webhook de 029b toma `data.id` del cuerpo para el manifiesto (anotar en `impl`). Si la firma no valida con el manifiesto actual: **bloquea** 029b (no se acepta un webhook sin firma). |
| S7 | `back_url` recibe el control con `?preapproval_id=…`; MP exige `https` (localhost no sirve). | Si exige https: en desarrollo `ARZIUM_SUBSCRIPTIONS_BACK_URL` apunta al túnel. Ya contemplado. |
| S8 | Estados de la `preapproval`: `pending`, `authorized`, `paused`, `cancelled`, `finished`. `PUT status=cancelled` deja `cancelled` en el `GET` inmediato. Una `pending` cancelada ya no se puede autorizar. La persona puede cancelar desde su cuenta y llega webhook. | Si una `pending` cancelada se puede autorizar igual: "Empezar de nuevo" se quita de la UI (solo "Continuar en Mercado Pago"). |
| S9 | Con prueba, `next_payment_date` = autorización + prueba. ¿Hay cobro de validación al autorizar? | Si hay cobro de validación: se muestra `SUBSCRIPTION_TEXT.validationCharge` (§B.6). |
| S10 | Sin prueba, el primer cobro ocurre al autorizar y aparece en `/authorized_payments` en minutos. | Sin cambio de diseño (la suscripción espera en `PENDING` autorizada). |
| S11 | `authorized_payments`: `status` `scheduled`/`processed`/`recycling`/`cancelled`; `payment.status` `approved`/`rejected`; `retry_attempt`; política de reintentos de MP (cuántos, cada cuánto, si cancela sola la `preapproval`). | Ajustar `mapAuthorizedPaymentStatus` (§C.4.1) a los valores reales. |
| S12 | El pago de un cobro se consulta con `/v1/payments/{id}` con el token de Arzium; devolución total → `refunded`; parcial → `approved` + `transaction_amount_refunded > 0` (o `partially_refunded`); contracargo → `charged_back`. Llega notificación `payment`. | Ajustar `mapPaymentRefundStatus`. Si no llega `payment`, el chequeo diario de §C.5 es el único camino (ya previsto). |
| S13 | `collector_id` de la `preapproval` = `user_id` de la cuenta de Arzium; `payer_id` estable entre suscripciones del mismo comprador. | Si `collector_id` no viene: la validación usa solo la referencia + que la consulta se hizo con el token de Arzium (anotar). |
| S14 | El comprador puede cambiar el medio de pago desde su cuenta de MP (D10a); URL de gestión de suscripciones del comprador. | Sin enlace: el botón de `PAST_DUE` lleva a `https://www.mercadopago.com.ar/` con el texto de ayuda. |
| S15 | Forma de `auto_recurring.free_trial` en la respuesta (`string` según el SDK u objeto). | Ajustar `parsePreapproval`. |
| S16 | Importes mínimo/máximo de una `preapproval` en ARS. | Agregar el tope a `validatePlanTerms`. |
| S17 | Los usuarios de prueba tienen `tags: ["test_user", …]` en `/users/me`. | Ajustar `assertSandboxSeller` a la marca real (nunca dejarlo abierto). |

**Resultados (corrida del 2026-11-27):** evidencia en `docs/mp-suscripciones-sandbox.md` §3–§4; el
impacto en 029b/029c está en el bloque "Cambios por la corrida en sandbox" al principio de la Parte B.
Resumen: G1 abierta (D4(c)); G2 = creación fuera de la transacción con deduplicación propia (S2
confirmado, S4 refutado); G3 refutada (D8(a)); G4 sin confirmar (`PLAN_BILLING_CYCLES_SUPPORTED =
false`). Sin verificar todavía: S8 (si una `pending` cancelada se puede autorizar), S11 (reintentos),
S12 devolución total y contracargo, S13 `payer_id` estable, S14 (gestión del comprador).

## A.6 Checklist 029a

- [ ] 1. `git fetch`; confirmar la rama. 029a no toca esquema: puede ir mientras 028a está en `implementando`.
- [ ] 2. RED → GREEN `mp-sandbox-redact.test.ts`: email, nombre, identificación, `card_token_id`, `access_token`, claves anidadas en arrays, ids truncados; el original no se muta.
- [ ] 3. RED → GREEN `mp-sandbox-guard.test.ts`: sin `test_user` → tira; `MP_SUBS_SANDBOX` ≠ `"true"` → tira; `NODE_ENV=production` → tira.
- [ ] 4. `mp-subscriptions-sandbox.ts` con los subcomandos de §A.4 (todas las salidas pasan por `redactMercadoPagoResource`).
- [ ] 5. Script npm en `packages/db/package.json`.
- [ ] 6. `docs/mp-suscripciones-sandbox.md`: runbook + tabla S1–S17 vacía + sección "Compuertas G1–G4".
- [ ] 7. Corrida manual con el usuario (§A.4) → completar la tabla con evidencia redactada (nada de tokens, emails ni ids completos).
- [ ] 8. Escribir en el informe la resolución de G1–G4 y los valores reales para `ALLOWED_MONTH_FREQUENCIES`, `PLAN_BILLING_CYCLES_SUPPORTED`, el manifiesto de firma y los estados de S8/S11/S12.
- [ ] 9. Verificación (§A.7). Reporte en `progress/impl_HU-029a.md`.

## A.7 Verificación 029a

```bash
npx vitest run packages/db/scripts/lib/mp-sandbox-redact.test.ts packages/db/scripts/lib/mp-sandbox-guard.test.ts
npm run typecheck --workspace packages/db
grep -nE "from \"(\.\./index|@nutri-bot/db)\"|prisma" packages/db/scripts/mp-subscriptions-sandbox.ts   # debe salir vacío
git status --short | grep -E "schema.prisma|migrations/" ; test $? -eq 1                                # nada de esquema
./ops/harness/verify.sh
```

Reglas: ninguna llamada a MP en la verificación del implementer (solo la corrida manual con usuarios
de prueba); nunca un token de producción; nada de la corrida se commitea salvo el informe redactado.

---

# Parte B · 029b · Alta, autorización, cancelación y estado

## B.0 Cambios por la corrida en sandbox (2026-11-27)

Fuente: `docs/mp-suscripciones-sandbox.md` §3 (supuestos) y §4 (compuertas). Esta lista es la
revisión de la SDD; cada cambio está aplicado en la sección indicada. Si algo de abajo contradice
otra parte del documento, vale lo de abajo y la sección que indica.

| # | Resultado | Cambio | Sección |
|---|---|---|---|
| R1 | **G1 abierta** (S1 confirmado: `preapproval` sin plan, `pending`, con `init_point` y `free_trial`). | Ninguno: sigue D4(c). | §0.1 X1 |
| R2 | **G3 refutada** (S3): `payer_email` es obligatorio. Sin él → 400 `"payer_email is required"`; con un email que no es de un usuario de MP → 400 `"User bad request"`. | Variante D8(a): campo **"Email de tu cuenta de Mercado Pago"** en P1, P3 y P8, precargado con el email de la login (o el que se usó en el checkout pendiente). Normalización y validación en core (`normalizePayerEmail`). Errores nuevos `invalid_payer_email` y `payer_email_rejected` con textos exactos. El email se manda siempre en `payer_email`. | §0.1 X14, §B.5.1, §B.5.2, §B.5.3, §B.5.4, §B.6.2, §B.6.4, §B.7 |
| R3 | Consecuencia de R2 para el **esquema**: hace falta el email para recrear un checkout viejo (R5) sin volver a pedirlo. | Columna nueva **`TenantSubscription.checkoutPayerEmail String?`**, transitoria: solo con `status = PENDING` y `authorizedAt` null (CHECK `TenantSubscription_payer_email_transient`); se borra junto con `checkoutUrl` al autorizar, cancelar o abandonar. Nunca va a `SubscriptionEvent`, logs ni a la vista de STAFF. Es tabla nueva: sin backfill. | §B.4.1, §B.4.2, §B.5.5 |
| R4 | **G2 / S4 refutado**: MP **no** respeta `X-Idempotency-Key` en `POST /preapproval` (misma key → dos `preapproval`). **S2 confirmado**: la búsqueda por `external_reference` funciona. | Creación fuera de la transacción con deduplicación propia: (a) **lease** en la fila (`checkoutCreateLeaseUntil`, columna nueva, 45 s) tomado bajo el advisory lock: un solo proceso hace búsqueda + `POST`; el otro recibe `checkout_in_progress`; (b) **búsqueda por referencia antes de cada `POST`**; si la búsqueda falla, no se crea; (c) error ambiguo del `POST` (timeout, red, 5xx) → **no se reintenta** en la misma llamada ni antes de que venza el lease; el próximo intento busca primero; (d) más de una `preapproval` viva con la misma referencia → se adopta una y se cancelan las otras. Clasificación de errores en core (`classifyPreapprovalCreateError`). La nota 2 de §B.5.4 (MP dentro del lock) **no se aplica**. | §0.1 X7, §B.4.1, §B.4.2, §B.5.1, §B.5.3, §B.5.4, §B.9 |
| R5 | **S9 con matiz**: `next_payment_date` = **creación** (`start_date`) + prueba, **no** autorización + prueba. Quien tarda en autorizar pierde días de prueba y el primer cobro llega antes de "autorización + 7". | (a) `trialEndsAt` = `next_payment_date` que informa MP al autorizar (`resolveTrialEnd`), así el texto "Si cancelás antes del…" y "El primer cobro… es el…" dicen la fecha real. (b) **"Continuar en Mercado Pago"** recrea el checkout (anula la `pending` vieja y crea una nueva con los mismos plan y email) si la prueba ya perdió más de **1 hora** (`isCheckoutStale`); sin prueba no se recrea (el primer cobro es al autorizar). El checkout se sigue creando al tocar el botón, así que el camino normal no pierde días. **Duda de producto DP1** (§F): confirmar que la prueba se cuente desde la fecha que fija MP y el umbral de 1 h. | §0.1 X5, §B.4.1, §B.5.1, §B.5.3, §B.5.4b, §B.5.5, §B.6.2, §D, §F |
| R6 | Al autorizar (con y sin prueba) MP hace un `payment` de **$0** con `operation_type: "card_validation"`, `approved`. No es un cobro. | Se quita el aviso `validationCharge` (era para un cobro chico que se devuelve; no existe). 029b: el tópico `payment` sigue `ignored`. 029c: `isCardValidationPayment` → `IGNORED/card_validation` antes de buscar el cobro; nunca crea `SubscriptionCharge` ni activa nada. | §B.6.4, §B.7, §B.9.2, §C.4.1, §C.4.2, §C.6 |
| R7 | **S10 confirmado**: sin prueba, el primer cobro es inmediato al autorizar (`authorized_payment` `processed` + `payment` `approved`), con webhook `subscription_authorized_payment` (`updated`). | 029b: sin cambio (queda `PENDING` autorizada, X8; P4). 029c: `mapAuthorizedPaymentStatus` `processed`+`approved` confirmado. | §B.6.4 P4, §C.4.1 |
| R8 | **S11 en parte**: tarjeta rechazada al autorizar → la `preapproval` queda **`pending`** (no se autoriza, no hay `authorized_payment` ni `recycling`). Reintentos de cobros posteriores: **no verificable**. | 029b: el rechazo al autorizar es P3 (checkout sin completar); nunca `PAST_DUE`. 029c: el mapeo de `recycling`/`retry_attempt` queda como supuesto; un status desconocido → `IGNORED/unknown_status` con `console.warn` de código para detectarlo en producción. | §B.6.4, §C.4.1 |
| R9 | **S12 en parte** (029c): devolución parcial → `status: "approved"`, `status_detail: "partially_refunded"`, `transaction_amount_refunded > 0`; llegan `payment.updated` (dos). Total y contracargo sin verificar. | Coherente con D12: parcial no descuenta (`mapPaymentRefundStatus` → null, evento `UNCHANGED/partial_refund`, idempotente ante webhooks repetidos). | §C.4.1, §C.4.2, §C.6 |
| R10 | **S6 confirmado**: firma `x-signature` válida con el `data.id` de la **query**; tópicos `subscription_preapproval`, `subscription_authorized_payment`, `payment`; cuerpo `{ type, action, data: { id } }`. Cancelar una `pending` también manda `subscription_preapproval` `updated`. | Webhook sin cambio de diseño (manifiesto con el `data.id` de la query). Test nuevo: el `updated` de una `pending` abandonada (fila `CANCELED`) termina `IGNORED/terminated`. | §B.6.5, §B.9.2 |
| R11 | **S8 sin verificar**: no se sabe si una `pending` cancelada se puede autorizar igual. | Red de seguridad: si llega `authorized` para una fila `CANCELED` abandonada (`authorizedAt` null, `cancelOrigin PANEL`) → se cancela de nuevo en MP y evento `REJECTED/authorized_after_abandon`. "Empezar de nuevo" se mantiene. | §B.5.5 |
| R12 | **S16 confirmado**: importe por cobro entre **$15 y $2.000.000 ARS**; prueba de 1 mes → `first_invoice_offset: 30` (días). | `validatePlanTerms`: error nuevo `amount_out_of_range` (fuera de [15, 2.000.000]). `computeTrialEnd` en `MONTHS` = 30 × n días (como MP). El plan sembrado (60.000) y el anual de ejemplo (600.000) entran. | §B.5.1, §B.9.1 |
| R13 | **S15 confirmado**: `free_trial` viene como objeto `{ frequency, frequency_type, first_invoice_offset }`. | `parsePreapproval` lo lee; `checkPreapprovalAgainstSubscription` suma `trial_mismatch`. | §B.5.1 |
| R14 | **S5**: `months` acepta 1, 3, 6 y 12. **G4 sin confirmar** (no se vio `finished`). | `ALLOWED_MONTH_FREQUENCIES = [1, 3, 6, 12]`; `PLAN_BILLING_CYCLES_SUPPORTED = false` (packs fuera hasta otra corrida). | §B.5.1 |
| R15 | **S13 en parte**: `collector_id` = cuenta de Arzium (confirmado); `payer_id` estable sin verificar. **S14** sin verificar. | `collector_mismatch` se exige (collectorId nunca null en la práctica). D7(c) sigue fuera. P7 (029c) usa el enlace de respaldo. | §B.5.1, §C.5 |
| R16 | (Revisión del PR #87, HU-026, 2026-11-27 — no viene de la corrida) El middleware y el layout del panel de HU-026 mandan a `/inicio` a toda titular en estado `onboarding`; la pantalla de suscripción pendiente del onboarding enlaza a `/ajustes/suscripcion`. | Dependencia de integración: 029b arranca con #87 en `develop`; la ruta sale del layout `(panel)` a un grupo propio `(suscripcion)`, con una puerta nueva (`getSubscriptionAccess`) que deja pasar a la OWNER en `onboarding` (y su vuelta `?mp=volver`) a la página y a sus acciones; el middleware la exceptúa solo para ese caso; tests en `middleware.test.ts`. | §B.6.7, §B.6.1, §B.6.2, §B.9.4, §B.10, §B.11 |

**¿Toca el esquema?** Sí, dentro de la misma migración `tenant_subscriptions` de 029b (la tabla es
nueva, no hay filas): dos columnas nullable en `TenantSubscription` (`checkoutPayerEmail`,
`checkoutCreateLeaseUntil`) y dos CHECK. Nada cambia en tablas existentes ni en 029c.

## B.1 Resumen funcional

Planes en tabla (`SubscriptionPlan`) + ofertas (`SubscriptionPlanOffer`) + suscripción del
consultorio (`TenantSubscription`) + log (`SubscriptionEvent`). Pantalla Ajustes → Suscripción
(OWNER actúa, STAFF lee). Crear (con el email de la cuenta de MP de la OWNER, D8(a))/retomar
(recreando el checkout si la prueba ya perdió tiempo, S9)/empezar de nuevo el checkout, verificar contra MP,
`PENDING → TRIALING`, cancelar (panel y MP), webhook de suscripciones (tópico `preapproval`),
conciliación del estado en el bot y flag de habilitación. Sin cobros (029c).

## B.2 Workspaces afectados

| Workspace | ¿Se toca? | Qué |
|---|---|---|
| `packages/db` | **Sí** | `schema.prisma` + migración `tenant_subscriptions`; `domain/subscriptions.ts`, `domain/subscriptionsGateway.ts` (nuevos); `domain/mercadopagoAccount.ts` (ignorar el `user_id` de Arzium en el webhook de señas); `domain/index.ts`; script de planes; probe en Postgres descartable. |
| `packages/core` | **Sí** | `subscription-billing.ts` (+ `.test.ts`): config, términos de plan, fechas, validación de la `preapproval`, transición de estado, textos. `index.ts`. |
| `apps/web` | **Sí** | Página `/ajustes/suscripcion` (grupo de rutas propio `(suscripcion)`, §B.6.7), acciones, pestaña en Ajustes, webhook nuevo, `middleware.ts` (matcher + excepción de onboarding de HU-026), `tenant-context.ts` y `onboarding-access-adapter.ts` (puerta de suscripción), gate real de HU-026, shell del panel extraído a un componente, tests. |
| `apps/bot` | **Sí** | `workers.ts`: cron de conciliación de suscripciones. |

**Impacto cruzado:** `schema.prisma` suma relaciones en `Tenant` y `User` (sin cambiar columnas
existentes). `packages/db/domain` exporta funciones nuevas para web y bot y cambia el
comportamiento (no la firma) de `resolveMercadoPagoWebhookAccount` (lo usa el webhook de señas).
`npm run typecheck` en **web y bot**.

## B.3 Configuración (variables de entorno)

| Variable | Dónde se lee | Valor por defecto | Uso |
|---|---|---|---|
| `ARZIUM_SUBSCRIPTIONS_ENABLED` | core (`resolveSubscriptionBillingConfig`) | ausente = apagado | Solo `"true"` habilita. |
| `ARZIUM_MERCADOPAGO_MODE` | core | — | `"sandbox"` o `"live"`. `live` solo con `NODE_ENV=production`; `sandbox` nunca con `NODE_ENV=production`. Elige qué planes y suscripciones se usan. |
| `ARZIUM_MERCADOPAGO_ACCESS_TOKEN` | **solo** `domain/subscriptionsGateway.ts` | — | Token de la aplicación de Arzium (D3a). Nunca en la base, en logs ni en el navegador. |
| `ARZIUM_MERCADOPAGO_USER_ID` | core (ya existe por 028a) | vacío | Cobrador esperado (`collector_id`). Obligatorio para habilitar. **En producción no se setea hasta que `legacy-tenant` pase a la cuenta de Daiana** (D2, §B.10). |
| `ARZIUM_MERCADOPAGO_WEBHOOK_SECRET` | web (webhook nuevo) | — | Clave secreta de la aplicación de Arzium. |
| `ARZIUM_SUBSCRIPTIONS_BACK_URL` | db (`startTenantSubscription`) | `${AUTH_URL}/ajustes/suscripcion?mp=volver` | Override para dev con túnel https (S7). |

`resolveSubscriptionBillingConfig` exige las cinco primeras (la cuarta, solo dígitos) para
`enabled`; si `ENABLED=true` y falta alguna → `misconfigured` con los **nombres** que faltan (nunca
los valores). `misconfigured` se trata igual que `disabled` para la UI ("todavía no está
disponible") y loguea una vez por proceso `console.warn("[subscriptions] misconfigured", { missing })`.

## B.4 Esquema

### B.4.1 Prisma (exacto)

```prisma
model Tenant {
  // ... sin cambios ...
  /// HU-029: suscripciones de Arzium del consultorio (como máximo una no terminada; índice parcial SQL).
  subscriptions      TenantSubscription[]
  subscriptionOffers SubscriptionPlanOffer[]
  subscriptionEvents SubscriptionEvent[]
}

model User {
  // ... sin cambios ...
  /// HU-029: suscripciones que esta persona inició (prueba gratis una vez por persona, D7b).
  startedSubscriptions TenantSubscription[]
}

/// HU-029: modo de los recursos de MP de Arzium. Nunca se mezclan (sandbox con usuarios de prueba).
enum BillingMode {
  SANDBOX
  LIVE
}

/// HU-029: unidad de período de cobro y de prueba. DAYS como período de cobro solo en SANDBOX.
enum BillingPeriodUnit {
  DAYS
  MONTHS
}

/// HU-029: estado verificado contra MP. SUSPENDED lo agrega HU-030 (D6). CANCELED es terminal.
enum SubscriptionStatus {
  PENDING
  TRIALING
  ACTIVE
  PAST_DUE
  CANCELED
}

enum SubscriptionCancelOrigin {
  PANEL
  MERCADO_PAGO
}

enum SubscriptionEventSource {
  WEBHOOK
  RECONCILIATION
  PANEL
}

enum SubscriptionEventResult {
  APPLIED
  UNCHANGED
  IGNORED
  REJECTED
}

/// HU-029: plan de la suscripción de Arzium. Configuración del servidor (script
/// packages/db/scripts/subscription-plans.ts), nunca del navegador. Inmutable en lo económico:
/// para cambiar importe, período o prueba se crea un plan nuevo y se retira el viejo (active=false).
model SubscriptionPlan {
  id            String            @id @default(cuid())
  /// Identificador legible y estable dentro del modo ("mensual", "anual-2027").
  code          String
  mode          BillingMode
  /// Nombre visible para la OWNER y `reason` de la preapproval ("Plan mensual").
  name          String
  amount        Decimal           @db.Decimal(12, 2)
  currency      String            @default("ARS")
  frequency     Int
  frequencyUnit BillingPeriodUnit
  /// Prueba gratis: los dos null = sin prueba.
  trialLength   Int?
  trialUnit     BillingPeriodUnit?
  /// null = renueva sin fin; N = termina después de N cobros (pack). Solo si 029a confirmó end_date (G4).
  billingCycles Int?
  /// false = solo visible para consultorios con SubscriptionPlanOffer.
  isPublic      Boolean           @default(true)
  /// Preseleccionado en la pantalla. Como máximo uno por modo (índice parcial SQL).
  isDefault     Boolean           @default(false)
  active        Boolean           @default(true)
  createdAt     DateTime          @default(now())
  updatedAt     DateTime          @updatedAt

  subscriptions TenantSubscription[]
  offers        SubscriptionPlanOffer[]

  @@unique([mode, code])
}

/// HU-029: promoción de Arzium para un consultorio (plan privado y/o prueba en una re-alta).
/// La crea el script de planes. Se considera usada cuando una suscripción con este offerId se autorizó.
model SubscriptionPlanOffer {
  id         String           @id @default(cuid())
  tenantId   String
  tenant     Tenant           @relation(fields: [tenantId], references: [id], onDelete: Restrict)
  planId     String
  plan       SubscriptionPlan @relation(fields: [planId], references: [id], onDelete: Restrict)
  /// true = da la prueba del plan aunque el consultorio o la OWNER ya la hayan usado (una vez).
  allowTrial Boolean          @default(false)
  /// Nota interna de Arzium. Nunca se muestra a la OWNER.
  note       String?
  expiresAt  DateTime?
  createdAt  DateTime         @default(now())

  subscriptions TenantSubscription[]

  @@unique([tenantId, planId])
}

/// HU-029: suscripción del consultorio a Arzium. Hechos verificados contra la API de MP; el acceso
/// lo decide HU-030. Como máximo una no terminada por consultorio (índice parcial SQL
/// TenantSubscription_open_per_tenant_key). Nunca guarda datos de tarjeta ni tokens; el único email es
/// checkoutPayerEmail, transitorio (solo PENDING sin autorizar; CHECK TenantSubscription_payer_email_transient).
model TenantSubscription {
  id                       String                    @id @default(cuid())
  tenantId                 String
  tenant                   Tenant                    @relation(fields: [tenantId], references: [id], onDelete: Restrict)
  planId                   String
  plan                     SubscriptionPlan          @relation(fields: [planId], references: [id], onDelete: Restrict)
  offerId                  String?
  offer                    SubscriptionPlanOffer?    @relation(fields: [offerId], references: [id], onDelete: Restrict)
  startedByUserId          String
  startedBy                User                      @relation(fields: [startedByUserId], references: [id], onDelete: Restrict)
  mode                     BillingMode
  status                   SubscriptionStatus        @default(PENDING)
  /// Valor opaco ("sub_" + 32 hex) que viaja como external_reference. No es el id del consultorio.
  externalReference        String                    @unique
  mercadoPagoPreapprovalId String?                   @unique
  /// Último status crudo de la preapproval ("pending", "authorized", "paused", ...). Diagnóstico.
  mercadoPagoStatus        String?
  /// collector_id verificado (= ARZIUM_MERCADOPAGO_USER_ID) y payer_id de MP. Nunca el email.
  collectorUserId          String?
  payerUserId              String?
  /// init_point del checkout. Solo mientras está PENDING sin autorizar; se borra al autorizar o cancelar.
  checkoutUrl              String?
  /// HU-029b (G3, D8a): email de la cuenta de MP que escribió la OWNER, normalizado. Solo mientras está
  /// PENDING sin autorizar (para recrear un checkout viejo, S9); se borra junto con checkoutUrl. Nunca a logs ni eventos.
  checkoutPayerEmail       String?
  /// HU-029b (G2, S4 refutado): lease de creación en MP. Mientras sea > now, otro proceso no busca ni crea la preapproval.
  checkoutCreateLeaseUntil DateTime?
  /// Copia de los términos del plan al crear (X3).
  amount                   Decimal                   @db.Decimal(12, 2)
  currency                 String
  frequency                Int
  frequencyUnit            BillingPeriodUnit
  trialLength              Int?
  trialUnit                BillingPeriodUnit?
  billingCycles            Int?
  /// Se pidió a MP con prueba gratis (D7b decidido al crear).
  trialGranted             Boolean
  authorizedAt             DateTime?
  /// Fin de la prueba (solo si trialGranted) = next_payment_date de MP al autorizar (S9: creación + prueba,
  /// no autorización + prueba); respaldo resolveTrialEnd. Se fija una vez. HU-030 lo usa para vencer la prueba.
  trialEndsAt              DateTime?
  /// next_payment_date informado por MP (también al crear: lo usa isCheckoutStale).
  nextPaymentDate          DateTime?
  /// La OWNER pidió cancelar desde el panel (para atribuir el origen si el webhook llega antes).
  cancelRequestedAt        DateTime?
  canceledAt               DateTime?
  cancelOrigin             SubscriptionCancelOrigin?
  /// last_modified de la preapproval aplicada: un snapshot más viejo no se aplica (X10).
  mercadoPagoLastModified  DateTime?
  lastSyncedAt             DateTime?
  createdAt                DateTime                  @default(now())
  updatedAt                DateTime                  @updatedAt

  events SubscriptionEvent[]

  @@unique([id, tenantId])
  @@index([tenantId, createdAt])
  @@index([status])
  @@index([startedByUserId])
  @@index([offerId])
}

/// HU-029: log de lo que se consultó y aplicó (webhook, conciliación, panel). Resumen, nunca el cuerpo
/// crudo de MP ni datos del pagador.
model SubscriptionEvent {
  id             String                  @id @default(cuid())
  source         SubscriptionEventSource
  /// "preapproval" | "authorized_payment" | "payment" | "panel_start" | "panel_cancel" | "panel_restart"
  topic          String
  /// Id del recurso de MP consultado (o el de la suscripción para eventos del panel sin recurso).
  resourceId     String
  /// x-request-id del webhook (si vino). No es único: MP reintenta con el mismo.
  requestId      String?
  result         SubscriptionEventResult
  /// Código corto (p. ej. "amount_mismatch", "terminated", "stale_snapshot", "unknown_preapproval").
  reason         String?
  tenantId       String?
  tenant         Tenant?                 @relation(fields: [tenantId], references: [id], onDelete: Restrict)
  subscriptionId String?
  subscription   TenantSubscription?     @relation(fields: [subscriptionId], references: [id], onDelete: Restrict)
  createdAt      DateTime                @default(now())

  @@index([subscriptionId, createdAt])
  @@index([tenantId, createdAt])
  @@index([createdAt])
}
```

### B.4.2 Migración `tenant_subscriptions`

`npx dotenv -e ../../.env -- prisma migrate dev --create-only --name tenant_subscriptions` (desde
`packages/db`). Lo generado por Prisma (enums, tablas, índices, FKs) se conserva; **al final** se
agrega a mano este bloque (Prisma no genera índices parciales, CHECK ni datos):

```sql
-- HU-029b: como máximo una suscripción no terminada por consultorio (X6).
CREATE UNIQUE INDEX "TenantSubscription_open_per_tenant_key" ON "TenantSubscription"("tenantId")
  WHERE "status" IN ('PENDING', 'TRIALING', 'ACTIVE', 'PAST_DUE');

-- HU-029b: como máximo un plan por defecto por modo.
CREATE UNIQUE INDEX "SubscriptionPlan_default_per_mode_key" ON "SubscriptionPlan"("mode") WHERE "isDefault";

-- HU-029b: términos válidos a nivel base (la validación completa está en packages/core).
ALTER TABLE "SubscriptionPlan"
  ADD CONSTRAINT "SubscriptionPlan_amount_positive" CHECK ("amount" > 0),
  ADD CONSTRAINT "SubscriptionPlan_frequency_positive" CHECK ("frequency" > 0),
  ADD CONSTRAINT "SubscriptionPlan_trial_pair" CHECK (("trialLength" IS NULL) = ("trialUnit" IS NULL)),
  ADD CONSTRAINT "SubscriptionPlan_trial_positive" CHECK ("trialLength" IS NULL OR "trialLength" > 0),
  ADD CONSTRAINT "SubscriptionPlan_cycles_positive" CHECK ("billingCycles" IS NULL OR "billingCycles" > 0);
ALTER TABLE "TenantSubscription"
  ADD CONSTRAINT "TenantSubscription_trial_pair" CHECK (("trialLength" IS NULL) = ("trialUnit" IS NULL)),
  ADD CONSTRAINT "TenantSubscription_trial_granted" CHECK (NOT "trialGranted" OR "trialLength" IS NOT NULL),
  -- HU-029b (G3, X14): el email del pagador solo vive mientras el checkout está sin autorizar.
  ADD CONSTRAINT "TenantSubscription_payer_email_transient" CHECK (
    "checkoutPayerEmail" IS NULL OR ("status" = 'PENDING' AND "authorizedAt" IS NULL)),
  ADD CONSTRAINT "TenantSubscription_payer_email_length" CHECK (
    "checkoutPayerEmail" IS NULL OR char_length("checkoutPayerEmail") BETWEEN 3 AND 254);

-- HU-029b (D1, X13): plan mensual por defecto, $60.000 ARS, 7 días de prueba, en los dos modos.
INSERT INTO "SubscriptionPlan"
  ("id", "code", "mode", "name", "amount", "currency", "frequency", "frequencyUnit",
   "trialLength", "trialUnit", "billingCycles", "isPublic", "isDefault", "active", "createdAt", "updatedAt")
VALUES
  ('plan_mensual_live',    'mensual', 'LIVE',    'Plan mensual', 60000.00, 'ARS', 1, 'MONTHS', 7, 'DAYS', NULL, true, true, true, now(), now()),
  ('plan_mensual_sandbox', 'mensual', 'SANDBOX', 'Plan mensual', 60000.00, 'ARS', 1, 'MONTHS', 7, 'DAYS', NULL, true, true, true, now(), now())
ON CONFLICT DO NOTHING;
```

Revisión del SQL generado (skill `migracion-prisma`):
- Solo `CREATE TYPE`, `CREATE TABLE`, `CREATE INDEX`, `ADD CONSTRAINT … FOREIGN KEY`. **Ningún**
  `ALTER`/`DROP` sobre tablas existentes (las relaciones nuevas en `Tenant`/`User` son del lado de
  las tablas nuevas). Si aparece cualquier `DROP` o `ALTER TABLE "Tenant"|"User"|"MercadoPago…"` →
  parar y avisar.
- Filas existentes: no hay columnas nuevas en tablas con filas. No hace falta backfill (las columnas
  de B.0 R3/R4, `checkoutPayerEmail` y `checkoutCreateLeaseUntil`, son nullable y de una tabla nueva).
- Las FK quedan `ON DELETE RESTRICT ON UPDATE CASCADE` (Prisma por defecto con `Restrict`).
- El índice parcial y los CHECK no generan drift en Prisma 5.22 (precedente:
  `Agenda_primary_per_tenant_key`); lo confirma el chequeo de drift de §B.9.3.

Rollback (a mano, solo con el `pg_dump` del deploy): `DROP TABLE` de las cuatro tablas en orden
inverso y `DROP TYPE` de los seis enums. Se documenta, no se automatiza.

## B.5 Contrato compartido

### B.5.1 `packages/core/src/subscription-billing.ts` (puro, con tests)

```ts
export type BillingMode = "SANDBOX" | "LIVE";
export type BillingPeriodUnit = "DAYS" | "MONTHS";
export type SubscriptionStatusValue = "PENDING" | "TRIALING" | "ACTIVE" | "PAST_DUE" | "CANCELED";
export type SubscriptionCancelOriginValue = "PANEL" | "MERCADO_PAGO";

// ---- Configuración ----
export type SubscriptionBillingConfig =
  | { status: "disabled" }
  | { status: "misconfigured"; missing: string[] } // nombres de variables
  | { status: "enabled"; mode: BillingMode; collectorUserId: string };
/** Reglas de §B.3. No devuelve ni lee secretos más allá de comprobar que no están vacíos. */
export function resolveSubscriptionBillingConfig(env: Record<string, string | undefined>): SubscriptionBillingConfig;

// ---- Términos de plan ----
/** S5 confirmado (2026-11-27): [1, 3, 6, 12]. */
export const ALLOWED_MONTH_FREQUENCIES: readonly number[];
/** G4 sin confirmar (2026-11-27): false. Packs fuera hasta que una corrida vea el paso a finished. */
export const PLAN_BILLING_CYCLES_SUPPORTED: boolean;
/** S16 (2026-11-27): importe por cobro aceptado por MP en ARS. */
export const MP_MIN_AMOUNT_ARS: 15;
export const MP_MAX_AMOUNT_ARS: 2_000_000;
export type PlanTerms = {
  amount: string;               // "60000.00" (Decimal serializado)
  currency: string;
  frequency: number;
  frequencyUnit: BillingPeriodUnit;
  trialLength: number | null;
  trialUnit: BillingPeriodUnit | null;
  billingCycles: number | null;
};
export type PlanTermsError =
  | "invalid_amount" | "amount_out_of_range" | "invalid_currency" | "invalid_frequency" | "days_only_in_sandbox"
  | "invalid_trial" | "cycles_not_supported" | "invalid_cycles";
/** amount numérico > 0 y ≤ 2 decimales (si no, invalid_amount); dentro de [MP_MIN_AMOUNT_ARS,
 *  MP_MAX_AMOUNT_ARS] (si no, amount_out_of_range; S16); currency "ARS";
 *  MONTHS ∈ ALLOWED_MONTH_FREQUENCIES; DAYS 1..365 y solo mode SANDBOX;
 *  prueba: ambos o ninguno, DAYS 1..90, MONTHS 1..12; billingCycles null o 1..36 y solo si
 *  PLAN_BILLING_CYCLES_SUPPORTED. */
export function validatePlanTerms(t: PlanTerms, mode: BillingMode): { ok: true } | { ok: false; error: PlanTermsError };
/** "60000.00" | 60000 → 6000000. Tira con un valor no numérico. */
export function toCents(value: string | number): number;

// ---- Fechas ----
/** MONTHS: date-fns addMonths sobre el instante (clamp a fin de mes); DAYS: + length × 24 h. */
export function addBillingPeriod(from: Date, length: number, unit: BillingPeriodUnit): Date;
/** null si no hay prueba. DAYS: + n × 24 h. MONTHS: + n × 30 días (S16: MP usa first_invoice_offset 30
 *  para 1 mes), no meses de calendario. Se usa para estimar (texto de P1), para isCheckoutStale y como respaldo. */
export function computeTrialEnd(from: Date, trialLength: number | null, trialUnit: BillingPeriodUnit | null): Date | null;
/** S9: MP cuenta la prueba desde la creación (start_date), no desde la autorización.
 *  Devuelve nextPaymentDate si no es null y es ≤ computeTrialEnd(authorizedAt) + 1 h (sanidad: nunca más
 *  prueba que la pedida); si no, computeTrialEnd(startDate ?? authorizedAt). null si el plan no tiene prueba.
 *  Puede devolver una fecha pasada (se autorizó después de que venciera la prueba de MP): es la verdad. */
export function resolveTrialEnd(input: {
  authorizedAt: Date; nextPaymentDate: Date | null; startDate: Date | null;
  trialLength: number | null; trialUnit: BillingPeriodUnit | null;
}): Date | null;
/** S9 / B.0 R5. true si trialGranted, nextPaymentDate no null y
 *  computeTrialEnd(now, trial) − nextPaymentDate > STALE_CHECKOUT_TRIAL_LOSS_MS (la prueba ya perdió más de eso).
 *  Sin prueba o sin nextPaymentDate → false. */
export const STALE_CHECKOUT_TRIAL_LOSS_MS: number; // 60 * 60 * 1000 (DP1)
export function isCheckoutStale(input: {
  trialGranted: boolean; nextPaymentDate: Date | null;
  trialLength: number | null; trialUnit: BillingPeriodUnit | null; now: Date;
}): boolean;

// ---- Email del pagador (G3 refutada → D8a) ----
/** trim + minúsculas; ok si 3..254 caracteres y /^[^\s@]+@[^\s@]+\.[^\s@]+$/. No verifica que exista en MP
 *  (eso lo dice MP con "User bad request"). Nunca loguea el valor. */
export function normalizePayerEmail(raw: unknown): { ok: true; email: string } | { ok: false };

// ---- Errores de POST /preapproval (G2, G3, S16) ----
export type PreapprovalCreateErrorKind =
  | "payer_email_required"   // 400 y message contiene "payer_email is required"
  | "payer_email_rejected"   // 400 y message contiene "User bad request"
  | "amount_out_of_range"    // 400 y message empieza con "Cannot pay an amount"
  | "rejected"               // otro 4xx: MP no creó nada (definitivo)
  | "ambiguous";             // timeout, red, 5xx, forma desconocida: MP pudo haber creado la preapproval
/** Lee solo `status`/`statusCode` (número) y `message`/`error` (string) del error del SDK (unknown).
 *  Nunca devuelve ni copia el mensaje. Ante cualquier duda → "ambiguous" (fail safe: no se reintenta el POST). */
export function classifyPreapprovalCreateError(err: unknown): PreapprovalCreateErrorKind;

// ---- Prueba gratis (D7b + ofertas) ----
export function isTrialEligible(input: {
  planHasTrial: boolean;
  priorTrialUsed: boolean;                                  // por consultorio o por la OWNER
  offer: { allowTrial: boolean; used: boolean } | null;
}): boolean; // planHasTrial && (!priorTrialUsed || (offer?.allowTrial === true && !offer.used))

// ---- Preapproval ----
export type PreapprovalSnapshot = {
  id: string;
  status: string;                       // crudo, en minúsculas
  collectorId: string | null;
  payerId: string | null;
  externalReference: string | null;
  amount: number | null;
  currency: string | null;
  frequency: number | null;
  frequencyType: string | null;         // "days" | "months"
  initPoint: string | null;
  nextPaymentDate: Date | null;
  /** auto_recurring.start_date (S9: la prueba cuenta desde acá). */
  startDate: Date | null;
  /** auto_recurring.free_trial (S15: objeto { frequency, frequency_type, first_invoice_offset }). null si no viene. */
  freeTrial: { frequency: number; frequencyType: string } | null;
  lastModified: Date | null;
};
/** Desde el JSON del SDK (unknown). null si falta `id` o `status`. Nunca copia payer_email.
 *  free_trial como string u otra forma → freeTrial null. */
export function parsePreapproval(raw: unknown): PreapprovalSnapshot | null;
export type PreapprovalMismatch =
  | "collector_mismatch" | "reference_mismatch" | "amount_mismatch"
  | "currency_mismatch" | "frequency_mismatch" | "trial_mismatch" | "id_mismatch";
export function checkPreapprovalAgainstSubscription(
  p: PreapprovalSnapshot,
  expected: {
    preapprovalId: string | null;       // null = todavía no se guardó
    externalReference: string;
    collectorUserId: string;
    amount: string;
    currency: string;
    frequency: number;
    frequencyUnit: BillingPeriodUnit;
    trialGranted: boolean;
    trialLength: number | null;
    trialUnit: BillingPeriodUnit | null;
  },
): { ok: true } | { ok: false; reason: PreapprovalMismatch };
// Orden de chequeo: id → collector (S13 confirmado: viene y debe ser igual; si viniera null se acepta,
// la consulta ya se hizo con el token de Arzium) → reference → amount (toCents) → currency →
// frequency/frequencyType → trial: trialGranted exige freeTrial con la misma frequency y frequencyType
// ("days"/"months"); !trialGranted exige freeTrial null (S15).

// ---- Estado ----
export type ChargeSummary = { everApproved: boolean; latestOutcome: "approved" | "failed" | null }; // 029b: siempre { false, null }
export type StatusDecision =
  | { kind: "set"; status: SubscriptionStatusValue; cancelOrigin: SubscriptionCancelOriginValue | null }
  | { kind: "ignore"; reason: "terminated" | "paused" | "unknown_status" };
/**
 * current CANCELED → ignore "terminated" (terminal, X12).
 * mp "cancelled" | "finished" → CANCELED; origin PANEL si cancelRequestedRecently, si no MERCADO_PAGO.
 * mp "pending" → PENDING (solo si current es PENDING; si no → ignore "unknown_status").
 * mp "paused" → ignore "paused" (sin cambio; se guarda mercadoPagoStatus).
 * mp "authorized":
 *   charges.latestOutcome "failed" → PAST_DUE
 *   charges.everApproved → ACTIVE
 *   trialGranted → TRIALING
 *   si no → PENDING (autorizada esperando el primer cobro, X8)
 * otro → ignore "unknown_status".
 */
export function decideSubscriptionStatus(input: {
  current: SubscriptionStatusValue;
  mpStatus: string;
  trialGranted: boolean;
  charges: ChargeSummary;
  cancelRequestedRecently: boolean;     // cancelRequestedAt en los últimos 15 min
}): StatusDecision;

// ---- Textos ----
/** "$60.000 por mes" | "$150.000 cada 3 meses" | "$600.000 por año" | "$1.000 cada 2 días" (formatPrice). */
export function formatPlanPrice(t: Pick<PlanTerms, "amount" | "currency" | "frequency" | "frequencyUnit">): string;
/** "7 días" | "1 día" | "1 mes" | "2 meses". */
export function formatTrialLength(length: number, unit: BillingPeriodUnit): string;
export const SUBSCRIPTION_TEXT: { /* §B.7, textos exactos */ };
```

Consumidores: todo → `packages/db/domain/subscriptions.ts`; `SUBSCRIPTION_TEXT`, `formatPlanPrice`,
`formatTrialLength`, `computeTrialEnd` (estimado de P1) y `normalizePayerEmail` (validación previa de la
acción) → web; `resolveSubscriptionBillingConfig` → db, web (webhook) y bot (cron).
`packages/core/src/index.ts`: `export * from "./subscription-billing";`.

### B.5.2 `packages/db/domain/subscriptionsGateway.ts` (nuevo; el único que lee el token de Arzium)

```ts
export type ArziumPreapprovalCreate = {
  reason: string;
  external_reference: string;
  back_url: string;
  status: "pending";
  payer_email: string;                  // obligatorio (G3 refutada, 2026-11-27); normalizado con normalizePayerEmail
  auto_recurring: {
    frequency: number;
    frequency_type: "days" | "months";
    transaction_amount: number;
    currency_id: string;
    free_trial?: { frequency: number; frequency_type: "days" | "months" };
    end_date?: string;                  // solo packs (G4)
  };
};
export type ArziumMercadoPagoGateway = {
  /** idempotencyKey va en X-Idempotency-Key, pero MP la IGNORA en POST /preapproval (S4 refutado):
   *  la deduplicación es la de §B.5.4 (lease + búsqueda previa). El gateway nunca reintenta un POST. */
  createPreapproval(body: ArziumPreapprovalCreate, idempotencyKey: string): Promise<unknown>;
  getPreapproval(id: string): Promise<unknown>;
  cancelPreapproval(id: string): Promise<unknown>;               // PUT { status: "cancelled" }
  /** S2 confirmado. Devuelve todas las preapproval con esa referencia, en cualquier status (results[]). */
  searchPreapprovalsByReference(externalReference: string): Promise<unknown[]>;
  // 029c:
  getAuthorizedPayment(id: string): Promise<unknown>;
  searchAuthorizedPayments(preapprovalId: string): Promise<unknown[]>;
  getPayment(id: string): Promise<unknown>;
};
export class SubscriptionBillingUnavailableError extends Error {
  readonly code: "disabled" | "misconfigured";
}
/** Lanza SubscriptionBillingUnavailableError si la config no es "enabled". SDK `mercadopago`
 *  (`PreApproval`, `Invoice`, `Payment`) con MercadoPagoConfig({ accessToken:
 *  env.ARZIUM_MERCADOPAGO_ACCESS_TOKEN, options: { timeout: 10_000 } }). El body con free_trial se
 *  pasa con un cast local documentado (el tipo `PreApprovalRequest` del SDK no lo declara). */
export function createArziumMercadoPagoGateway(env?: Record<string, string | undefined>): ArziumMercadoPagoGateway;
```

Reglas: nunca importa `mercadopagoAccount.ts` ni `getMercadoPagoCredentials`; los errores del SDK
se re-tiran **sin** loguearlos (pueden traer headers). Los llamadores solo loguean códigos. El SDK se
configura **sin** reintentos automáticos (ni del SDK ni propios) para `create`: un `POST` repetido a
ciegas puede crear una segunda `preapproval` (S4).

### B.5.3 `packages/db/domain/subscriptions.ts` (nuevo)

```ts
export type SubscriptionDeps = {
  gateway?: ArziumMercadoPagoGateway;          // default: createArziumMercadoPagoGateway()
  env?: Record<string, string | undefined>;    // default: process.env
  now?: () => Date;
};

export type OfferedPlanView = {
  planId: string; name: string; priceText: string; trialText: string | null;
  trialEligible: boolean; isDefault: boolean;
};
export type TenantSubscriptionView = {
  availability: "enabled" | "unavailable";     // unavailable = disabled o misconfigured
  plans: OfferedPlanView[];                    // vacío si unavailable
  trialUsed: boolean;
  subscription: null | {
    id: string;
    status: SubscriptionStatusValue;
    planName: string;
    priceText: string;
    authorized: boolean;                       // authorizedAt != null
    trialEndsAt: Date | null;
    nextPaymentDate: Date | null;
    canceledAt: Date | null;
    cancelOrigin: SubscriptionCancelOriginValue | null;
    hasCheckout: boolean;                      // checkoutUrl != null (la URL no viaja a la vista)
    planId: string;                            // para "Empezar de nuevo" con el mismo plan (P3)
    /** Solo PENDING sin autorizar (X14). La página lo pasa a la pantalla SOLO si isOwner (P10 nunca lo ve). */
    checkoutPayerEmail: string | null;
  };
};
/** web. La última suscripción del consultorio en el modo actual (no terminada, o la última CANCELED).
 *  Planes ofrecidos: active, mode actual, (isPublic || oferta vigente del tenant); orden isDefault desc, amount asc.
 *  trialEligible por plan con isTrialEligible (priorTrialUsed por tenant O por actor.userId). */
export async function getTenantSubscriptionView(t: TenantRef, actor: { userId: string }, deps?: SubscriptionDeps): Promise<TenantSubscriptionView>;

export type StartSubscriptionError =
  | "not_available" | "plan_not_offered" | "already_subscribed" | "mp_unavailable" | "restart_unconfirmed"
  | "invalid_payer_email"      // normalizePayerEmail falló (o MP dijo "payer_email is required")
  | "payer_email_rejected"     // MP: "User bad request" (no es el email de un usuario de MP)
  | "checkout_in_progress";    // otro proceso tiene el lease de creación (doble clic / dos pestañas)
export type StartSubscriptionResult =
  | { ok: true; checkoutUrl: string }
  | { ok: false; error: StartSubscriptionError };
/** web (OWNER). §B.5.4. payerEmail obligatorio (G3): se normaliza acá aunque la acción ya lo haya validado. */
export async function startTenantSubscription(
  t: TenantRef,
  actor: { userId: string },
  input: { planId: string; restart?: boolean; payerEmail: string },
  deps?: SubscriptionDeps,
): Promise<StartSubscriptionResult>;

/** web (OWNER): "Continuar en Mercado Pago". Reemplaza a getPendingCheckoutUrl (S9). §B.5.4b.
 *  Devuelve el init_point de la PENDING sin autorizar del tenant, o uno nuevo si el viejo perdió prueba. */
export async function resumePendingCheckout(
  t: TenantRef,
  actor: { userId: string },
  deps?: SubscriptionDeps,
): Promise<{ ok: true; checkoutUrl: string } | { ok: false; error: "not_found" | "not_available" | "already_subscribed" }>;

export type SubscriptionSyncResult = "applied" | "unchanged" | "ignored" | "rejected";
export type SubscriptionSyncSource = "WEBHOOK" | "RECONCILIATION" | "PANEL";
/** web (webhook) y bot. Consulta la preapproval en MP y la aplica (§B.5.5). */
export async function syncSubscriptionByPreapprovalId(
  preapprovalId: string,
  source: SubscriptionSyncSource,
  meta?: { requestId?: string | null },
  deps?: SubscriptionDeps,
): Promise<SubscriptionSyncResult>;

/** web (polling de la pantalla). Sincroniza la suscripción no terminada del tenant si lastSyncedAt
 *  tiene más de 3 s; si no hay preapprovalId, busca por external_reference. "none" = no hay. */
export async function refreshTenantSubscription(t: TenantRef, deps?: SubscriptionDeps): Promise<{ result: SubscriptionSyncResult | "none"; status: SubscriptionStatusValue | null; authorized: boolean }>;

export type CancelSubscriptionResult =
  | { ok: true }
  | { ok: false; error: "not_available" | "nothing_to_cancel" | "mp_unavailable" | "cancel_unconfirmed" };
/** web (OWNER). TRIALING/ACTIVE/PAST_DUE o PENDING autorizada (X8). §B.5.6. */
export async function cancelTenantSubscription(t: TenantRef, actor: { userId: string }, deps?: SubscriptionDeps): Promise<CancelSubscriptionResult>;

/** web (webhook). topic: "subscription_preapproval" → sync; el resto → "ignored" (029c suma tópicos). */
export async function handleSubscriptionWebhook(
  n: { topic: string | null; resourceId: string; requestId: string | null },
  deps?: SubscriptionDeps,
): Promise<"processed" | "ignored">;

/** bot. Suscripciones del modo actual en PENDING (createdAt ≤ 30 días), TRIALING, ACTIVE, PAST_DUE,
 *  orden lastSyncedAt asc nulls first, máx. 200 por corrida; try/catch por suscripción.
 *  PENDING sin mercadoPagoPreapprovalId y sin lease vigente → searchPreapprovalsByReference y adopción
 *  como §B.5.4 paso 6a (nunca crea: crear es solo del panel). Con lease vigente → skipped.
 *  Config no enabled → { processed: 0, failed: 0, skipped: 0 } sin consultar la base. */
export async function reconcileOpenSubscriptions(
  onError?: (subscriptionId: string) => void,
  deps?: SubscriptionDeps,
): Promise<{ processed: number; failed: number; skipped: number }>;
```

Consumidores:

| Función | web | bot |
|---|---|---|
| `getTenantSubscriptionView`, `startTenantSubscription`, `resumePendingCheckout`, `refreshTenantSubscription`, `cancelTenantSubscription` | ✔ | — |
| `handleSubscriptionWebhook` | ✔ | — |
| `syncSubscriptionByPreapprovalId` | (vía webhook) | (vía reconcile) |
| `reconcileOpenSubscriptions` | — | ✔ |
| `resolveSubscriptionBillingConfig` (core) | ✔ | ✔ |

`packages/db/domain/index.ts`: `export * from "./subscriptions";` y
`export { SubscriptionBillingUnavailableError, type ArziumMercadoPagoGateway } from "./subscriptionsGateway";`
(el factory no se reexporta: solo lo usa `subscriptions.ts`).

### B.5.4 `startTenantSubscription` (algoritmo)

Revisado el 2026-11-27 (B.0 R2, R4): `payer_email` obligatorio y deduplicación propia porque MP
ignora `X-Idempotency-Key`. Constante `CHECKOUT_CREATE_LEASE_MS = 45_000` (en `subscriptions.ts`;
> 2 llamadas de 10 s de timeout + margen).

1. `resolveSubscriptionBillingConfig(env)` ≠ `enabled` → `not_available`.
2. `normalizePayerEmail(input.payerEmail)` → si no es ok, `invalid_payer_email` (sin tocar la base
   ni el gateway).
3. Plan: `findFirst({ id: planId, mode, active: true })` y (`isPublic` o oferta del tenant no vencida)
   → si no, `plan_not_offered`. `validatePlanTerms` debe dar ok (si no, `plan_not_offered` y
   `console.error("[subscriptions] invalid_plan", { planId })`).
4. Si `restart`: si existe la `PENDING` no autorizada del tenant → **abandonarla** (paso 4a) antes
   de seguir; si MP no confirma → `restart_unconfirmed` (nada cambia).
   - 4a. Si su lease está vigente → `checkout_in_progress` (no se abandona algo que otro está
     creando). Con `mercadoPagoPreapprovalId` (o lo que devuelva `searchPreapprovalsByReference`,
     todas las no `cancelled`): `cancelPreapproval` → `getPreapproval` → `status === "cancelled"`
     exigido para cada una. Si en ese `get` alguna está `authorized`, **no** se abandona: se aplica
     el snapshot (§B.5.5) y se devuelve `already_subscribed`. Si la búsqueda falla →
     `restart_unconfirmed`. Sin recurso en MP → se abandona directo. Abandonar = `status CANCELED`,
     `canceledAt`, `cancelOrigin PANEL`, `checkoutUrl null`, `checkoutPayerEmail null`,
     `checkoutCreateLeaseUntil null` (con `authorizedAt` null: HU-030 la distingue de una baja real).
     Evento `PANEL/panel_restart/APPLIED` (reason `restart` o `stale_checkout` si lo llama §B.5.4b).
5. Transacción con `SELECT pg_advisory_xact_lock(hashtextextended('tenant-subscription:' || $tenantId, 0))`:
   - Suscripción no terminada del tenant: `TRIALING`/`ACTIVE`/`PAST_DUE` o `PENDING` autorizada →
     `already_subscribed`. `PENDING` no autorizada con `checkoutUrl` → devolverla (sin crear nada;
     aunque el `planId` o el email sean otros: cambiar de plan o de email es "Empezar de nuevo").
   - `PENDING` sin `checkoutUrl`: si `checkoutCreateLeaseUntil > now` → `checkout_in_progress` (sin
     llamar a MP). Si no, tomar el lease (`checkoutCreateLeaseUntil = now + CHECKOUT_CREATE_LEASE_MS`,
     `checkoutPayerEmail` = el email normalizado de esta llamada) y seguir al paso 6 con esa fila.
   - Si no hay: `priorTrialUsed` = existe `TenantSubscription` con `trialGranted` y `authorizedAt`
     no null y (`tenantId = t` o `startedByUserId = actor.userId`); oferta del tenant para el plan
     (`used` = existe suscripción autorizada con ese `offerId`); `trialGranted = isTrialEligible(…)`.
     `create` con la copia de términos, `externalReference = "sub_" + randomBytes(16).hex`,
     `offerId` (si la oferta existe), `mode`, `startedByUserId`, `checkoutPayerEmail`,
     `checkoutCreateLeaseUntil = now + CHECKOUT_CREATE_LEASE_MS`.
6. Fuera de la transacción (solo el dueño del lease llega acá):
   - 6a. `searchPreapprovalsByReference(externalReference)`. **Si tira → `mp_unavailable` y no se
     crea nada** (sin búsqueda no hay `POST`; el lease vence solo). Se descartan las `cancelled`.
     Si quedan una o más → adoptar (paso 7): la `authorized` si hay, si no la `pending` con
     `date_created` más reciente; las demás vivas se cancelan después del commit (best effort,
     evento `PANEL/panel_start/APPLIED` reason `duplicate_canceled` por cada una). Si alguna está
     `authorized`, el paso 7 aplica el snapshot por §B.5.5 y devuelve `already_subscribed`.
   - 6b. Si no hay ninguna viva: `createPreapproval(body, idempotencyKey = sub.id)` **una sola vez**,
     con `reason = plan.name`, `back_url` (§B.3), `payer_email = checkoutPayerEmail`,
     `auto_recurring` de la copia de términos (`free_trial` solo si `trialGranted`; `end_date`
     nunca mientras `PLAN_BILLING_CYCLES_SUPPORTED = false`).
   - 6c. Si el `POST` tira: `classifyPreapprovalCreateError(err)`:
     - `payer_email_rejected` → bajo `FOR UPDATE`: `checkoutCreateLeaseUntil = null`,
       `checkoutPayerEmail = null`; evento `PANEL/panel_start/REJECTED` reason
       `payer_email_rejected` (sin el email) → `payer_email_rejected`.
     - `payer_email_required` → igual, reason `payer_email_required` → `invalid_payer_email`.
     - `amount_out_of_range` → igual (lease null), `console.error("[subscriptions] invalid_plan",
       { planId })` → `plan_not_offered`.
     - `rejected` → lease null, evento REJECTED reason `mp_rejected` → `mp_unavailable`.
     - `ambiguous` (timeout, red, 5xx): MP pudo haberla creado. **No se reintenta** y **el lease se
       deja** hasta que venza: el próximo intento (paso 5) vuelve a buscar por referencia antes de
       crear. `console.warn("[subscriptions] mp_error", { op: "create" })` → `mp_unavailable`.
7. `parsePreapproval` + `checkPreapprovalAgainstSubscription` (con `preapprovalId: null` y los
   términos de prueba) + exige `initPoint`. Bajo `FOR UPDATE` de la fila: si la fila ya tiene otro
   `mercadoPagoPreapprovalId` (no debería, por el lease) → cancelar la recién creada después del
   commit y devolver el `checkoutUrl` guardado. Si no: guardar `mercadoPagoPreapprovalId`,
   `checkoutUrl`, `mercadoPagoStatus`, `nextPaymentDate` (S9: lo usa §B.5.4b),
   `mercadoPagoLastModified`, `lastSyncedAt`, `checkoutCreateLeaseUntil = null`. Evento
   `PANEL/panel_start/APPLIED`. Si no cierra → evento `REJECTED` con el motivo, `mp_unavailable`
   (la fila queda `PENDING` sin `checkoutUrl`, lease `null`; el recurso inválido no se adopta y
   tampoco se crea otro con esa referencia hasta el próximo intento, que vuelve a buscar y lo
   vuelve a rechazar → la OWNER usa "Empezar de nuevo", que crea otra referencia).
8. Error del SDK en búsqueda o `get` → `mp_unavailable` (sin log del error; solo
   `console.warn("[subscriptions] mp_error", { op })`).

Nota 1: el `P2002` del índice parcial (carrera que escape al advisory lock, p. ej. otra réplica con
otro hash) se atrapa y se vuelve a leer la fila existente (paso 5 de nuevo, una vez).
Nota 2 (variante "MP dentro del advisory lock"): **no se aplica**; G2 se resolvió con S2 confirmado.
Nota 3 (consistencia de la búsqueda): si después de un `ambiguous` MP tarda en indexar la
`preapproval` creada y el próximo intento (≥ 45 s después) no la encuentra, se crearía una segunda
con la **misma** referencia. Red de seguridad: §B.5.5 caso `id_mismatch` (adopta la autorizada y
cancela la otra) y `refreshTenantSubscription`/`reconcileOpenSubscriptions` que buscan por
referencia. No se resuelve con más reintentos.

### B.5.4b `resumePendingCheckout` (algoritmo, S9)

1. Config ≠ `enabled` → `not_available`.
2. Leer la `PENDING` sin autorizar del tenant con `checkoutUrl` → ninguna → `not_found`.
3. `isCheckoutStale({ trialGranted, nextPaymentDate, trialLength, trialUnit, now })`:
   - `false` → `{ ok: true, checkoutUrl }` (sin llamar a MP).
   - `true` (la prueba ya perdió más de 1 h, DP1) y `checkoutPayerEmail` no null →
     `startTenantSubscription(t, actor, { planId, restart: true, payerEmail: checkoutPayerEmail },
     deps)` con reason `stale_checkout` en el evento de abandono. La re-alta recalcula
     `trialGranted` igual que siempre (la vieja no se autorizó, no consume la prueba).
     - `ok` → la URL nueva.
     - `already_subscribed` → `already_subscribed` (la vieja estaba autorizada; ya se aplicó).
     - cualquier otro error (`restart_unconfirmed`, `mp_unavailable`, `checkout_in_progress`,
       `payer_email_rejected`, …) → **devolver la URL vieja** (best effort: la persona puede
       autorizar igual; `trialEndsAt` va a salir de MP y dice la verdad). `console.warn(
       "[subscriptions] stale_checkout_kept", { subscriptionId })`.
   - `true` sin `checkoutPayerEmail` (no debería pasar) → URL vieja.

### B.5.5 `syncSubscriptionByPreapprovalId` (algoritmo)

1. Config ≠ `enabled` → `ignored` (sin consultar MP).
2. `getPreapproval(id)` → `parsePreapproval`. `null` → evento `REJECTED/invalid_resource`.
3. Buscar la suscripción por `mercadoPagoPreapprovalId = id`; si no, por `externalReference =
   snapshot.externalReference` y `mode` actual. Ninguna → evento `IGNORED/unknown_preapproval`
   (sin tenant) y `ignored`.
4. Transacción: `SELECT … FROM "TenantSubscription" WHERE id = $1 FOR UPDATE`.
   - `checkPreapprovalAgainstSubscription` con los términos guardados y `collectorUserId` de la
     config. Caso `id_mismatch` (misma referencia, otro id): si la guardada no está autorizada y la
     nueva sí → adoptar la nueva (actualizar `mercadoPagoPreapprovalId`) y cancelar la vieja en MP
     después del commit (best effort, evento). Si las dos están autorizadas → cancelar la entrante
     en MP (evento `APPLIED/duplicate_canceled`). Cualquier otro mismatch → evento `REJECTED` con el
     motivo, **sin cambios** en la suscripción → `rejected`.
   - `snapshot.lastModified < mercadoPagoLastModified` → evento `UNCHANGED/stale_snapshot`.
   - (B.0 R11, S8 sin verificar) fila `CANCELED` con `authorizedAt` null y `cancelOrigin PANEL`
     (checkout abandonado) y snapshot `authorized` → no se revive: `cancelPreapproval(id)` después
     del commit (best effort) y evento `REJECTED/authorized_after_abandon` → `rejected`. El resto de
     los `CANCELED` sigue por `decideSubscriptionStatus` (`ignore terminated`; incluye el
     `subscription_preapproval updated` que MP manda al cancelar una `pending`, S6).
   - `decideSubscriptionStatus({ current, mpStatus, trialGranted, charges: summary, cancelRequestedRecently })`
     (en 029b `summary = { everApproved: false, latestOutcome: null }`; 029c lo calcula de los cobros).
   - `ignore` → actualizar solo `mercadoPagoStatus`, `lastSyncedAt` y evento `IGNORED` con el
     motivo.
   - `set`: primera vez `authorized` → `authorizedAt = now`, `trialEndsAt =
     resolveTrialEnd({ authorizedAt, nextPaymentDate: snapshot.nextPaymentDate, startDate:
     snapshot.startDate, trialLength, trialUnit })` si `trialGranted` (S9: es el `next_payment_date`
     de MP, no autorización + prueba; se fija una sola vez), `collectorUserId`, `payerUserId`,
     `checkoutUrl = null`, `checkoutPayerEmail = null`, `checkoutCreateLeaseUntil = null` (el CHECK
     `TenantSubscription_payer_email_transient` lo exige). Siempre: `status`, `nextPaymentDate`,
     `mercadoPagoStatus`, `mercadoPagoLastModified`, `lastSyncedAt`; `CANCELED` → `canceledAt = now`,
     `cancelOrigin`, `checkoutUrl = null`, `checkoutPayerEmail = null`, `checkoutCreateLeaseUntil =
     null`. Evento `APPLIED` si algo cambió, si no `UNCHANGED`. Ningún evento ni log lleva el email.
5. Devuelve el resultado del evento. Nunca toca `Payment`, `Appointment` ni `MercadoPagoAccount`.

### B.5.6 `cancelTenantSubscription` (algoritmo)

1. Config ≠ `enabled` → `not_available`. Sin suscripción cancelable → `nothing_to_cancel`.
2. `cancelRequestedAt = now` (update simple).
3. `cancelPreapproval(id)` → `getPreapproval(id)`; `status` debe ser `cancelled` → aplicar con el
   mismo camino de §B.5.5 (origen `PANEL` por `cancelRequestedRecently`) → `{ ok: true }`. Evento
   `PANEL/panel_cancel/APPLIED`.
4. Error del SDK → `mp_unavailable`; `get` sin `cancelled` → `cancel_unconfirmed`. En los dos casos
   la suscripción **no** pasa a `CANCELED` (HU 4.3).

### B.5.7 `packages/db/domain/mercadopagoAccount.ts` (cambio chico sobre 028a)

`resolveMercadoPagoWebhookAccount(notifiedUserId, env)`: si `notifiedUserId` no es null y
`isPlatformMercadoPagoUserId(notifiedUserId, env)` → devolver `null` **antes** de buscar la fila y
antes del respaldo `.env` (el llamador ya loguea `unknown_account`). Firma sin cambios. Test nuevo
en `mercadopagoAccount.test.ts`.

### B.5.8 Script de planes `packages/db/scripts/subscription-plans.ts`

Para Arzium (no lo corre ningún agente salvo pedido del usuario). `npm run subscription-plans
--workspace packages/db -- <cmd>` con `dotenv -e ../../.env`; en producción `docker compose run
--rm <servicio con el código de db> npx tsx packages/db/scripts/subscription-plans.ts <cmd>`
(documentar en `deploy/README.md`).

| Comando | Efecto |
|---|---|
| `list [--mode live\|sandbox]` | Planes y ofertas (sin datos de suscripciones). |
| `create --mode <m> --code <c> --name <n> --amount <a> --frequency <f> --unit days\|months [--trial <n> --trial-unit days\|months] [--cycles <n>] [--private] [--default]` | `validatePlanTerms` (importe fuera de $15–$2.000.000 → `amount_out_of_range`, S16; `--cycles` → `cycles_not_supported` mientras G4 siga sin confirmar); crea. `--default` saca el default anterior del modo en la misma transacción. Un `code` existente → error ("creá un plan nuevo con otro code", X2). |
| `set-default --mode <m> --code <c>` | Mueve el default. |
| `deactivate --mode <m> --code <c>` | `active = false` (no toca suscripciones existentes). |
| `offer --tenant <id> --mode <m> --code <c> [--allow-trial] [--expires YYYY-MM-DD] [--note …]` | Upsert de `SubscriptionPlanOffer`. |
| `revoke-offer --tenant <id> --mode <m> --code <c>` | Borra la oferta si ninguna suscripción la referencia; si la referencia alguna, `expiresAt = now`. |

Ejemplos (se documentan en el script): "1 mes gratis" = `--trial 1 --trial-unit months` con
`--private` + `offer --allow-trial`; "anual con descuento" = `--frequency 12 --unit months
--amount 600000`; "pack 3 meses" = `--frequency 3 --unit months --cycles 1` (solo con G4).

## B.6 Rutas, acciones y pantallas (apps/web)

### B.6.1 `apps/web/src/app/(suscripcion)/ajustes/suscripcion/page.tsx` (server component)

Ruta `/ajustes/suscripcion` en el grupo `(suscripcion)`, **fuera** del layout `(panel)` (§B.6.7: el
layout del panel redirige a `/inicio` a una OWNER en onboarding). En todo §B.6 y §B.10, donde dice
`(panel)/ajustes/suscripcion/` léase `(suscripcion)/ajustes/suscripcion/`.

- `requireSubscriptionPageContext()` (§B.6.7); `isOwner = sctx.isOwner`.
- `getTenantSubscriptionView({ tenantId: sctx.tenantId }, { userId: sctx.userId })`.
- `searchParams.mp === "volver"` → `returning = true` (solo cambia la UI; **no** sincroniza ni lee
  `preapproval_id`).
- Email precargado (G3, D8a), **solo si `isOwner`**: `defaultPayerEmail =
  view.subscription?.checkoutPayerEmail ?? (await auth())?.user?.email ?? ""`. Para STAFF se pasa
  `""` y `view.subscription.checkoutPayerEmail` no se le pasa a la pantalla (se reemplaza por null
  antes de renderizar).
- Renderiza `<SubscriptionScreen view={…} isOwner={…} returning={…} defaultPayerEmail={…} timezone={pro.timezone} />`.
  Las fechas se formatean en el server con `formatDate(…, timezone)`; `timezone = sctx.timeZone`.

### B.6.2 `apps/web/src/app/(suscripcion)/ajustes/suscripcion/actions.ts` (`"use server"`)

```ts
export async function startSubscriptionAction(input: { planId: string; restart?: boolean; payerEmail: string }):
  Promise<{ error: StartSubscriptionError | "forbidden" }>;
// requireSubscriptionOwnerContext() (§B.6.7; TenantAccessError → { error: "forbidden" }); normalizePayerEmail(input.payerEmail) no ok →
// { error: "invalid_payer_email" } sin llamar al dominio; ok → startTenantSubscription(…) → redirect(checkoutUrl)
// (URL de MP, https://www.mercadopago… o sandbox).
// Antes del redirect: valida que checkoutUrl empiece con "https://" y su host termine en "mercadopago.com.ar" o "mercadopago.com" (fail closed → mp_unavailable).

export async function continueCheckoutAction(): Promise<{ error: "not_found" | "not_available" | "already_subscribed" | "forbidden" }>;
// requireSubscriptionOwnerContext(); resumePendingCheckout(…) (§B.5.4b: recrea si la prueba perdió > 1 h) → misma validación de host → redirect.

export async function cancelSubscriptionAction(): Promise<{ ok: true } | { error: "not_available" | "nothing_to_cancel" | "mp_unavailable" | "cancel_unconfirmed" | "forbidden" }>;
// requireSubscriptionOwnerContext(); revalidatePath("/ajustes/suscripcion") si ok.

export async function refreshSubscriptionAction(): Promise<{ status: SubscriptionStatusValue | null; authorized: boolean }>;
// requireSubscriptionReadContext() (STAFF operativa también: solo lectura de hechos, throttled a 3 s).
```

`payerEmail` es obligatorio (G3 refutada, 2026-11-27). Se valida con `normalizePayerEmail` en la
acción (feedback rápido) y otra vez en el dominio (no se confía en la acción). Se guarda **solo** en
`checkoutPayerEmail` mientras el checkout está sin autorizar (X14); nunca en logs, eventos ni en la
respuesta de la acción.

### B.6.3 Pestaña en Ajustes

- `ajustes-tabs.tsx`: `{ value: "suscripcion", label: SUBSCRIPTION_TEXT.tabLabel }` en `AJUSTES_TABS`
  (después de `mercadopago`), ícono `CreditCard` (lucide).
- `ajustes/page.tsx`: pestaña visible para **todos** los miembros; panel = `GroupedList` con una fila
  "Estado" (`SUBSCRIPTION_TEXT.summary[status]` o `SUBSCRIPTION_TEXT.summaryNone` /
  `SUBSCRIPTION_TEXT.unavailableShort`) + `ButtonLink href="/ajustes/suscripcion"`
  (`SUBSCRIPTION_TEXT.openScreen`). `summaries.suscripcion` = el mismo texto corto.
- Ruta para HU-026 (onboarding) y HU-030 ("Mi suscripción"): **`/ajustes/suscripcion`**.

### B.6.4 Pantallas (skill `ui`: estructura y componentes)

Layout común: shell del panel (sidebar) · `PageHeader` con `title = SUBSCRIPTION_TEXT.title` y
`back = { href: "/ajustes?tab=suscripcion", label: "Ajustes" }` · contenido `max-w-3xl` · tarjeta de
estado (mismo patrón visual que `ajustes/whatsapp/page.tsx`: ícono 32 px + `text-title-3` +
`text-callout` secundario) · acciones abajo. Toasts con `sonner`; confirmaciones con `useConfirm`.

| # | Vista | Componentes clave |
|---|---|---|
| P1 | **Sin suscripción** (con prueba elegible o no) | Si hay >1 plan ofrecido: grupo de `PlanOptionCard` (radio cards: nombre, `priceText`, `trialText` si `trialEligible`; preselecciona `isDefault`). Con 1 plan: tarjeta única sin radio. Texto `offerTrial`/`offerNoTrial`. `Field` (label `payerEmailLabel`, ayuda `payerEmailHelp`) + `Input type="email" name="payerEmail" required autoComplete="email"` precargado con `defaultPayerEmail` (G3). Error de acción `invalid_payer_email`/`payer_email_rejected` → mensaje del `Field` (`aria-invalid`, además del toast). `SubmitButton` primario (`startTrial` o `subscribe`), deshabilitado mientras espera. **Sin** aviso de cobro de validación (S9: es de $0, B.0 R6). |
| P2 | **Volviendo / confirmando** (`returning` y PENDING) | Client `SubscriptionConfirming`: spinner + `confirming`. Llama `refreshSubscriptionAction()` cada 3 s hasta 60 s; si `status` ≠ PENDING o `authorized` → `router.replace("/ajustes/suscripcion")`. A los 60 s: texto `confirmDelayed` + `Button` "Actualizar" (`router.refresh()`). |
| P3 | **PENDING sin autorizar** (incluye tarjeta rechazada al autorizar: MP la deja `pending`, S11) | Texto `pendingCheckout`. `Button` primario `continueCheckout` (form → `continueCheckoutAction`; no manda email: usa el guardado) · `Field` email (label `payerEmailLabel`, ayuda `restartEmailHelp`) precargado con `defaultPayerEmail` + `Button` secundario `restart` → `useConfirm({ title: restartConfirmTitle, … })` → `startSubscriptionAction({ planId: view.subscription.planId, restart: true, payerEmail })`. |
| P4 | **PENDING autorizada** (sin prueba, esperando el primer cobro) | Texto `awaitingFirstCharge`. `AutoRefresh seconds={10}` por 2 minutos máximo (client wrapper con tope). Sin acciones salvo `cancel`. |
| P5 | **TRIALING** | Texto `trialing(fin, precio, primerCobro)`. `Button` destructivo-secundario `cancel`. |
| P6 | **ACTIVE** (029c completa la lista de cobros) | Texto `active(precio, fecha)`. `GroupedList` de últimos cobros (029c). `cancel`. |
| P7 | **PAST_DUE** (029c) | `Alert` de advertencia `pastDue(motivo)`. `ButtonLink` externo `goToMercadoPago` (URL de S14). `cancel`. |
| P8 | **CANCELED** | Texto `canceled(fecha)` (+ `paidUntil` en 029c). Lista de planes y campo de email como P1 con `resubscribe` (la prueba según `trialEligible`). |
| P9 | **No disponible** | `EmptyState` con `unavailable`. Sin acciones. |
| P10 | **STAFF** | Mismo estado que P2–P8, **sin** botones, radio ni campo de email, con nota `staffOnly`. `checkoutUrl` nunca se pide; el email de la OWNER nunca aparece en el HTML. |
| M1 | **Modal cancelar** | `useConfirm({ title: cancelConfirmTitle, description: trial ? cancelConfirmTrial(fecha) : cancelConfirmActive(fecha), confirmLabel: cancelYes, cancelLabel: cancelBack, destructive: true })`. |

Errores de acción → toast con `SUBSCRIPTION_TEXT.errors[error]`. Nunca se muestran ids de MP ni datos
de tarjeta.

### B.6.5 Webhook `apps/web/src/app/api/webhooks/mercadopago-suscripciones/route.ts`

```text
POST/GET:
  secret = ARZIUM_MERCADOPAGO_WEBHOOK_SECRET; vacío → 503 { error: "unconfigured" }
  dataId = query "data.id" (S6 confirmado 2026-11-27: viene en la query y la firma valida con ese valor;
           respaldo: si falta y es POST, del cuerpo data.id — leer el cuerpo UNA vez acá)
  más de un data.id, dataId que no cumple /^[A-Za-z0-9_-]{1,64}$/, o firma inválida → 401 { error: "invalid_signature" } (no consulta ni cambia nada)
  topic = query.type ?? query.topic ?? body.type (string) ?? null
  after(async () => { try { await handleSubscriptionWebhook({ topic, resourceId: dataId, requestId }) }
                      catch { console.error("[subscriptions] webhook_failed") } })
  → 200 { ok: true }
```

Nunca loguea el cuerpo ni headers. Config de cobro deshabilitada pero secreto presente → firma
verificada y `handleSubscriptionWebhook` devuelve `ignored` (200). Tópicos que llegan (S6):
`subscription_preapproval` (`updated`, también al cancelar una `pending`),
`subscription_authorized_payment` (`updated`, con cada cobro) y `payment` (`payment.created` /
`payment.updated`, incluido el `card_validation` de $0 al autorizar). En 029b solo el primero se
procesa; los otros dos → `ignored` hasta 029c.

### B.6.6 `apps/web/src/middleware.ts`

Matcher: `api/webhooks/mercadopago$` → `api/webhooks/mercadopago(?:-suscripciones)?$`. Sin esto el
webhook nuevo recibe 401 del gate del panel. `middleware.test.ts`: el matcher **no** matchea
`/api/webhooks/mercadopago-suscripciones` y **sí** `/api/webhooks/mercadopago-suscripciones/x` y
`/api/webhooks/mercadopago-otra`.

`guard-coverage.test.ts`: `api/webhooks` ya está exento. Las acciones nuevas usan las puertas de
§B.6.7: agregar `requireSubscriptionOwnerContext(` y `requireSubscriptionReadContext(` a la lista de
guardas aceptadas **solo** para archivos bajo `app/(suscripcion)/` (en cualquier otro archivo no
cuentan como guarda), y un caso: el source de `(suscripcion)/ajustes/suscripcion/actions.ts` llama
`requireSubscriptionOwnerContext(` en start/continue/cancel y `requireSubscriptionReadContext(` en
refresh. Si HU-026 dejó `onboarding-guard-enforcement.test.ts` con una lista de rutas permitidas en
onboarding, sumar `/ajustes/suscripcion` ahí (única ruta del panel permitida).

### B.6.7 Integración con HU-026 (onboarding) — dependencia de 029b

Origen: revisión del PR #87 (HU-026, rama `feat/HU-026-onboarding`, 2026-11-27). En esa rama:
`panelGate` (`middleware.ts`) resuelve `createOnboardingAccessAdapter(...).resolve()` y, si
`access.kind !== "operational"`, loguea `[auth] access_denied reason=onboarding_pending` y redirige a
`/inicio`; `getTenantAccess()` (`tenant-context.ts`) devuelve `{ ok: false, reason:
"onboarding_pending", clinicName, email }` para la OWNER con el alta completa y la suscripción
pendiente (adapter `kind: "onboarding"`), así que `requirePageContext()` (que usa el layout
`(panel)/layout.tsx`) y `requireOwnerContext()` también la rechazan. La pantalla
`components/onboarding-pending-screen.tsx` enlaza a `/ajustes/suscripcion`: sin esto, el enlace vuelve
a `/inicio` y la titular nunca puede suscribirse.

**Precondición:** 029b arranca con el PR #87 mergeado en `develop` (además de 028a). Si no lo está →
`blocked` antes del paso 1 del checklist (no se encadenan ramas de personas distintas, `AGENTS.md`).

Cambios (todos en `apps/web`, sobre el código de HU-026):

1. `lib/onboarding-access-adapter.ts`: el caso `kind: "onboarding"` suma `tenantId: string` y
   `timeZone: string` (ya los tiene en `grant.tenantId` y `clinic.timeZone`). Actualizar
   `onboarding-access-adapter.test.ts`.
2. `lib/tenant-context.ts`: `TenantAccessResult` caso `onboarding_pending` suma `userId`, `tenantId`
   y `timeZone`. Funciones nuevas (la única puerta de la ruta de suscripción):
   ```ts
   export type SubscriptionContext = {
     userId: string;
     tenantId: string;
     isOwner: boolean;          // member OWNER (operativa u onboarding)
     onboarding: boolean;       // true = OWNER con el alta completa y la suscripción pendiente (HU-026)
     timeZone: string;          // operativa: la del profesional de la agenda principal; onboarding: la del consultorio
   };
   /** HU-029b. Sobre getTenantAccess() (cacheado). ok → contexto operativo (member OWNER/STAFF o soporte, isOwner
    *  solo para member OWNER); reason "onboarding_pending" → { onboarding: true, isOwner: true }; cualquier otro
    *  (incluido "onboarding_setup" y STAFF con suscripción pendiente) → null. */
   export async function getSubscriptionAccess(): Promise<SubscriptionContext | null>;
   /** Server components de (suscripcion): redirect("/inicio") si null. */
   export async function requireSubscriptionPageContext(): Promise<SubscriptionContext>;
   /** Acciones start/continue/cancel: null → TenantAccessError("no_context"); !isOwner o soporte → "owner_only". */
   export async function requireSubscriptionOwnerContext(): Promise<SubscriptionContext>;
   /** Acción refresh: null → TenantAccessError("no_context"). */
   export async function requireSubscriptionReadContext(): Promise<SubscriptionContext>;
   ```
   `requirePageContext`/`requireOwnerContext`/`requireTenantContext` **no** cambian: el resto del
   panel sigue cerrado para la OWNER en onboarding.
3. `middleware.ts` (`panelGate`): antes del `deny()` del caso no operativo,
   `if (access.kind === "onboarding" && pathname === SUBSCRIPTION_PATH) return NextResponse.next();`
   con `const SUBSCRIPTION_PATH = "/ajustes/suscripcion"` (comparación exacta del pathname; la query
   `?mp=volver` no cuenta). Sin `console.warn` en ese caso. `setup`, `denied` (incluida la STAFF con
   `subscription_pending`) y cualquier otra ruta siguen igual. Las server actions de la página ya
   pasan por la rama `isServerAction` y las frena `requireSubscriptionOwnerContext`.
4. Grupo de rutas `app/(suscripcion)/`: `layout.tsx` llama `requireSubscriptionPageContext()`; si
   `onboarding` es `false` renderiza el shell del panel; si es `true`, un layout mínimo (logo, título
   del consultorio, `SignOutButton`, `ConfirmProvider` + `Toaster`, sin sidebar ni datos del bot),
   con el mismo estilo que las pantallas de onboarding de HU-026. Para no duplicar el shell:
   extraer el cuerpo de `(panel)/layout.tsx` a `components/shell/panel-shell.tsx`
   (`async function PanelShell({ tenantId, children })`) y usarlo desde los dos layouts; el layout
   `(panel)` queda con el mismo HTML (su test/snapshot, si existe, no cambia).
5. `lib/onboarding-subscription-gate.ts`: reemplazar el stub que devuelve `"pending"` por el real:
   `export { getTenantSubscriptionGate } from "@nutri-bot/db/domain";` (anexo de esta SDD). Efecto
   esperado y correcto: con el cobro apagado (`not_required`) la OWNER en onboarding pasa a operativa
   (decisión de Joel del anexo); el caso `onboarding` solo existe con el cobro prendido.
6. En la pantalla, la OWNER en onboarding ve los mismos estados P1–P9; `back` del `PageHeader` va a
   `/inicio` en vez de `/ajustes?tab=suscripcion` cuando `onboarding` es `true`. P2 (polling) al ver
   la suscripción autorizada hace `router.replace("/ajustes/suscripcion")`: si el gate pasó a
   `verified`, el layout ya renderiza el shell del panel.

## B.7 Textos exactos (`SUBSCRIPTION_TEXT` en core)

```ts
tabLabel: "Suscripción",
title: "Suscripción",
openScreen: "Ver suscripción",
summaryNone: "Sin suscripción",
unavailableShort: "No disponible",
summary: { PENDING: "Pendiente", TRIALING: "En prueba", ACTIVE: "Activa", PAST_DUE: "Pago pendiente", CANCELED: "Cancelada" },
offerTrial: (trial: string, price: string, trialEnd: string) =>
  `Probá Numa gratis ${trial}. Después, ${price} con Mercado Pago. Si cancelás antes del ${trialEnd}, no se te cobra nada.`,
// trialEnd = computeTrialEnd(ahora, prueba) (estimado, formatDate; MONTHS = 30 días por mes como MP, S16).
// Coincide con el de MP porque el checkout se crea al tocar el botón (S9); el real sale de MP al autorizar.
offerNoTrial: (price: string) => `Suscribite a Numa por ${price}. El primer cobro se hace al autorizar.`,
startTrial: "Empezar prueba gratis",
subscribe: "Suscribirme",
resubscribe: "Volver a suscribirme",
confirming: "Estamos confirmando tu suscripción con Mercado Pago. Puede tardar unos segundos.",
confirmDelayed: "Mercado Pago todavía no nos confirmó la autorización. Si la completaste, se va a ver acá en unos minutos.",
refresh: "Actualizar",
pendingCheckout: "Empezaste la suscripción pero no terminaste de autorizarla en Mercado Pago.",
continueCheckout: "Continuar en Mercado Pago",
restart: "Empezar de nuevo",
restartConfirmTitle: "¿Empezar de nuevo?",
restartConfirmDescription: "Vamos a anular la autorización que quedó a medias en Mercado Pago y crear una nueva.",
awaitingFirstCharge: "Mercado Pago autorizó la suscripción. Estamos esperando la confirmación del primer cobro.",
trialing: (trialEnd: string, price: string, firstCharge: string) =>
  `Estás en la prueba gratis hasta el ${trialEnd}. El primer cobro de ${price} es el ${firstCharge}.`,
active: (price: string, date: string) => `Suscripción activa. Próximo cobro: ${price} el ${date}.`,
pastDue: (reason: string) =>
  `No pudimos cobrar la suscripción (${reason}). Mercado Pago lo vuelve a intentar. Revisá tu medio de pago en tu cuenta de Mercado Pago.`,
goToMercadoPago: "Ir a Mercado Pago",
canceled: (date: string) => `Cancelaste la suscripción el ${date}.`,
canceledByMercadoPago: (date: string) => `La suscripción se canceló en Mercado Pago el ${date}.`,
paidUntil: (date: string) => `Pagado hasta el ${date}.`,
cancel: "Cancelar suscripción",
cancelConfirmTitle: "¿Cancelar la suscripción?",
cancelConfirmTrial: (date: string) => `No se te va a cobrar más. La prueba termina el ${date}.`,
cancelConfirmActive: (date: string) => `No se te va a cobrar más. Tenés acceso pago hasta el ${date}.`,
cancelConfirmPlain: "No se te va a cobrar más.",
cancelYes: "Sí, cancelar",
cancelBack: "Volver",
unavailable: "La suscripción todavía no está disponible. Te avisamos cuando lo esté.",
staffOnly: "Solo la dueña del consultorio puede gestionar la suscripción.",
payerEmailLabel: "Email de tu cuenta de Mercado Pago",          // G3 refutada (2026-11-27)
payerEmailHelp: "Es el email con el que entrás a Mercado Pago. Puede ser distinto del que usás en Numa.",
restartEmailHelp: "Si te equivocaste de email, corregilo y tocá «Empezar de nuevo».",
// validationCharge: eliminado (S9: la validación de tarjeta es un pago de $0, no un cobro).
errors: {
  not_available: "La suscripción todavía no está disponible.",
  plan_not_offered: "Ese plan ya no está disponible. Elegí otro.",
  already_subscribed: "Este consultorio ya tiene una suscripción.",
  mp_unavailable: "No pudimos conectar con Mercado Pago. Probá de nuevo en unos minutos.",
  restart_unconfirmed: "No pudimos anular la autorización anterior en Mercado Pago. Probá de nuevo en unos minutos.",
  cancel_unconfirmed: "No pudimos confirmar la cancelación con Mercado Pago. Probá de nuevo; si sigue, escribinos a soporte.",
  nothing_to_cancel: "No hay una suscripción para cancelar.",
  not_found: "No encontramos un checkout pendiente. Empezá de nuevo.",
  forbidden: "Solo la dueña del consultorio puede gestionar la suscripción.",
  invalid_payer_email: "Revisá el email: no parece válido.",
  payer_email_rejected: "Mercado Pago no reconoce ese email. Usá el email con el que entrás a tu cuenta de Mercado Pago.",
  checkout_in_progress: "Estamos preparando tu suscripción en Mercado Pago. Probá de nuevo en unos segundos.",
},
```

`cancelConfirmActive` usa `paidUntil` (029c); en 029b, `ACTIVE` no puede existir, y para `PENDING`
autorizada se usa `cancelConfirmPlain`. **Mensajes del bot: ninguno** (no interviene WhatsApp; los
avisos son de HU-030).

## B.8 Bot (`apps/bot/src/workers.ts`)

```ts
let subscriptionsRunning = false;
/** HU-029: conciliación de suscripciones de Arzium (respaldo del webhook). No se solapa. */
export async function runSubscriptionReconciliation(): Promise<void> {
  if (subscriptionsRunning) return;
  subscriptionsRunning = true;
  try {
    const r = await reconcileOpenSubscriptions((subscriptionId) =>
      logger.warn({ subscriptionId }, "Error conciliando suscripción"));
    if (r.processed || r.failed) logger.info(r, "Conciliación de suscripciones");
  } catch {
    logger.error("Error en conciliación de suscripciones");
  } finally {
    subscriptionsRunning = false;
  }
}
```

- `startCron()`: `cron.schedule("*/10 * * * *", () => runSubscriptionReconciliation());`
  **inmediatamente después** del `"0 6 * * *"` de `runMercadoPagoRefresh`. Así siguen valiendo los
  invariantes de `workers.test.ts`: el primero es `reconcilePayments`, el último
  `runAfterHoursDigest`, el anteúltimo `"30 4 * * *"`, y el último `"*/5 * * * *"` es la limpieza de
  sesiones.
- `runStartupJobs()`: `await runSubscriptionReconciliation()` después de `reconcilePayments()` (no
  tira: tiene su propio try/catch).
- Nunca loguear errores crudos de MP ni ids de recursos de MP (solo `subscriptionId` interno).
- No usa `getConversationTenant()`: las suscripciones son de todos los consultorios.

## B.9 Tests y verificación (029b)

### B.9.1 `packages/core` — `subscription-billing.test.ts`

- `resolveSubscriptionBillingConfig`: sin `ENABLED` → disabled; `ENABLED=true` con todo → enabled
  (mode y collector); falta token/secret/user/mode → misconfigured con esos nombres; `USER_ID` con
  letras → misconfigured; `live` + `NODE_ENV=development` → misconfigured; `sandbox` +
  `NODE_ENV=production` → misconfigured. Nunca aparece un valor en `missing`.
- `validatePlanTerms`: el mensual sembrado ok en los dos modos; 3, 6 y 12 meses ok; anual de
  `"600000.00"` ok; `0`, `-1`, `"1.005"`, `"abc"` → invalid_amount; `"14.99"` y `"2000000.01"` →
  amount_out_of_range; `"15.00"` y `"2000000.00"` ok (S16); `USD` → invalid_currency; 5 meses →
  invalid_frequency; DAYS en LIVE → days_only_in_sandbox; prueba con un solo campo o 0 →
  invalid_trial; `billingCycles: 1` → cycles_not_supported (`PLAN_BILLING_CYCLES_SUPPORTED` es
  `false`). Constantes: `ALLOWED_MONTH_FREQUENCIES` = `[1, 3, 6, 12]`, `PLAN_BILLING_CYCLES_SUPPORTED`
  = `false`.
- `toCents`: `"60000.00"`, `60000`, `"0.10"`, `"1e3"` (tira o 100000: fijar uno).
- `addBillingPeriod`: 31/01 + 1 mes = 28/02 (29 en bisiesto); + 12 meses; + 7 días = +168 h.
- `computeTrialEnd`: 7 días = +168 h; 1 mes = +30 días (no mes de calendario: 31/01 + 1 mes = 02/03);
  2 meses = +60 días; sin prueba → null.
- `resolveTrialEnd` (S9): creada 14:31:30, autorizada 14:36, `nextPaymentDate` = creación + 7 d →
  devuelve `nextPaymentDate` (no autorización + 7 d); `nextPaymentDate` null → `startDate` + 7 d; sin
  `startDate` → `authorizedAt` + 7 d; `nextPaymentDate` > `authorizedAt` + 7 d + 1 h → respaldo;
  `nextPaymentDate` pasada (autorizó 10 días después de crear) → la devuelve igual; sin prueba → null.
- `isCheckoutStale`: con prueba y pérdida de 59 min → false; 61 min → true; sin prueba → false;
  `nextPaymentDate` null → false.
- `normalizePayerEmail`: `"  Ana@Mail.COM "` → `"ana@mail.com"`; vacío, sin `@`, sin dominio con
  punto, con espacios internos, 255 caracteres, no string → `{ ok: false }`.
- `classifyPreapprovalCreateError`: `{ status: 400, message: "payer_email is required" }` →
  payer_email_required; `{ status: 400, message: "User bad request" }` → payer_email_rejected;
  `{ status: 400, message: "Cannot pay an amount lower than $ 15.00" }` → amount_out_of_range;
  `{ status: 404, message: "x" }` → rejected; `{ status: 500 }`, `new Error("timeout")`, `"x"`,
  `null`, `{}` → ambiguous.
- `isTrialEligible`: tabla de verdad (plan sin prueba; usada sin oferta; usada con oferta
  `allowTrial` no usada; oferta usada; oferta sin `allowTrial`).
- `parsePreapproval`: respuesta completa del SDK (con la forma de la corrida: `free_trial: {
  frequency: 7, frequency_type: "days", first_invoice_offset: 7 }`, `start_date`,
  `next_payment_date`); `collector_id` numérico → string; sin `id` → null; `free_trial` string →
  `freeTrial` null; `payer_email` no aparece en el resultado.
- `checkPreapprovalAgainstSubscription`: ok; cada mismatch por separado; `60000` vs `"60000.00"` ok;
  `collectorId` null aceptado; `trial_mismatch`: con `trialGranted` y `freeTrial` null, con otra
  `frequency` o `frequencyType`; sin `trialGranted` y con `freeTrial`.
- `decideSubscriptionStatus`: todos los casos del doc-comment (incluido `CANCELED` terminal ante
  `authorized`, `paused` → ignore, `pending` con current TRIALING → ignore, origen PANEL vs
  MERCADO_PAGO).
- `formatPlanPrice`/`formatTrialLength`: los ejemplos del doc-comment, exactos.
- `SUBSCRIPTION_TEXT`: snapshot de los textos de §B.7 (un test por función de texto con datos); no
  existe la clave `validationCharge`; existen `payerEmailHelp`, `restartEmailHelp` y los tres errores
  nuevos.

### B.9.2 `packages/db` — vitest con mocks (`subscriptions.test.ts`, `subscriptions-privacy.test.ts`, `mercadopagoAccount.test.ts`)

Gateway mockeado (nunca red). **El mock de `createPreapproval` ignora la idempotency key** (cada
llamada devuelve un id nuevo, como MP en S4): ningún test puede pasar apoyándose en ella. Casos:
- start: config apagada → `not_available` sin tocar la base ni el gateway; email inválido →
  `invalid_payer_email` sin tocar la base ni el gateway; plan privado sin oferta →
  `plan_not_offered`; primera vez → fila PENDING con términos copiados, `trialGranted` true,
  `checkoutPayerEmail` normalizado, `searchPreapprovalsByReference` llamado **antes** de
  `createPreapproval` (orden de llamadas verificado), `createPreapproval` una vez con
  `free_trial` 7 días, `external_reference` de la fila y `payer_email` normalizado; body nunca trae
  datos del navegador además de `planId` y el email; al terminar, lease `null`, `checkoutUrl` y
  `nextPaymentDate` guardados.
- start dos veces: la segunda devuelve el mismo `checkoutUrl` sin llamar a `createPreapproval`.
- lease (G2): fila PENDING sin `checkoutUrl` con lease vigente → `checkout_in_progress` sin llamar al
  gateway; con lease vencido → toma el lease, busca y crea una vez.
- start con PENDING sin `checkoutUrl` y lease vencido: si la búsqueda devuelve una `pending` →
  adopta sin `createPreapproval`; si devuelve solo `cancelled` → crea; si devuelve dos `pending` →
  adopta la de `date_created` más reciente y cancela la otra (evento `duplicate_canceled`); si una
  está `authorized` → aplica y `already_subscribed`.
- búsqueda que tira → `mp_unavailable` y `createPreapproval` **no** se llama.
- `createPreapproval` con error ambiguo (timeout) → `mp_unavailable`, una sola llamada (sin
  reintento), lease **conservado**; un segundo start dentro de los 45 s → `checkout_in_progress` sin
  gateway; con `now` 46 s después → busca primero: si MP la tiene, la adopta sin crear.
- `createPreapproval` 400 "User bad request" → `payer_email_rejected`, lease y `checkoutPayerEmail`
  `null`, evento REJECTED `payer_email_rejected` sin el email; 400 "payer_email is required" →
  `invalid_payer_email`; 400 "Cannot pay an amount…" → `plan_not_offered` + `console.error`
  `invalid_plan`; 404 → `mp_unavailable` con lease `null`.
- resume (§B.5.4b): fresca → URL guardada sin gateway; con prueba y pérdida > 1 h → cancela la vieja
  (verifica `cancelled`), crea fila nueva con otra referencia, mismo plan y `checkoutPayerEmail`,
  evento `panel_restart` reason `stale_checkout`, devuelve la URL nueva; sin prueba y vieja → URL
  guardada sin gateway; cancelación no confirmada → URL vieja y nada cambia; la vieja está
  `authorized` → aplica y `already_subscribed`; sin PENDING → `not_found`.
- start con TRIALING → `already_subscribed`.
- re-alta después de CANCELED autorizada: `trialGranted` false; con oferta `allowTrial` → true; la
  misma OWNER en otro consultorio → false (D7b).
- restart: cancela en MP y verifica; MP no confirma → `restart_unconfirmed` y nada cambia; MP dice
  `authorized` → aplica y `already_subscribed`; la abandonada queda con `checkoutUrl`,
  `checkoutPayerEmail` y lease `null`; restart con lease vigente → `checkout_in_progress`.
- respuesta de MP con otro importe/referencia/cobrador → evento REJECTED y `mp_unavailable`, fila sin
  `checkoutUrl`.
- sync: authorized + trial → TRIALING con `authorizedAt`, `trialEndsAt` = `next_payment_date` de MP
  (creada 5 días antes de autorizar → `trialEndsAt` = creación + 7 d, **no** autorización + 7 d),
  `nextPaymentDate`, `checkoutUrl` y `checkoutPayerEmail` null; authorized sin trial → PENDING con
  `authorizedAt` y `checkoutPayerEmail` null; `trial_mismatch` → REJECTED; abandonada (CANCELED,
  `authorizedAt` null, PANEL) + `authorized` → `cancelPreapproval` y REJECTED
  `authorized_after_abandon`; `cancelled` de una `pending` abandonada → IGNORED/terminated (S6);
  cada mismatch → REJECTED sin
  cambios; snapshot más viejo → UNCHANGED; mismo snapshot dos veces → segunda UNCHANGED; cancelled
  con `cancelRequestedAt` reciente → CANCELED/PANEL, sin él → MERCADO_PAGO; CANCELED + authorized →
  IGNORED/terminated; preapproval desconocida → IGNORED sin tenant; duplicado autorizado → cancela el
  entrante.
- cancel: ok → CANCELED/PANEL; error del gateway → `mp_unavailable` y status igual; `get` no
  cancelada → `cancel_unconfirmed` y status igual.
- refresh: `lastSyncedAt` hace 1 s → no llama al gateway.
- handleSubscriptionWebhook: `subscription_preapproval` → sync; `payment` (incluido el
  `card_validation` de $0, S9), `subscription_authorized_payment` y otro → ignored sin llamar al
  gateway (029b).
- reconcile: config apagada → 0/0/0 sin consultas; un `throw` en una suscripción no frena a las
  otras; `onError` recibe el id interno; PENDING sin preapprovalId → busca por referencia y adopta,
  nunca llama a `createPreapproval`; con lease vigente → skipped.
- privacy: `subscriptions.ts` y `subscriptionsGateway.ts` no importan `mercadopagoAccount` ni
  `payments` (lectura de source); `ARZIUM_MERCADOPAGO_ACCESS_TOKEN` aparece solo en
  `subscriptionsGateway.ts` en todo `packages/` y `apps/` (grep en test); los `console.*` del módulo
  nunca reciben el error del SDK, el snapshot ni el email; `SubscriptionEvent` nunca recibe
  `payer_email` ni `checkoutPayerEmail` (ningún campo del `create` de eventos contiene `@` en los
  casos de prueba).
- `resolveMercadoPagoWebhookAccount` con el `user_id` de Arzium → `null` aunque haya fila o respaldo
  `.env`.

### B.9.3 Probe en Postgres descartable — `test-tenant-subscriptions.sh` + `tenant-subscriptions.integration.ts`

Copiar el esqueleto de `test-mercadopago-per-tenant.sh` (contenedor y red propios, tmpfs,
`127.0.0.1` aleatorio, sin `.env`, `--pull never`, scratch con `mktemp -d`). Pasos:
1. Migraciones anteriores a `tenant_subscriptions` + fixture tipo producción (tenant `legacy-tenant`
   con OWNER, `MercadoPagoAccount` id 1) → aplicar todas → afirmar: filas previas idénticas (hash de
   `MercadoPagoAccount`, `Tenant`, `TenantMembership`), dos planes sembrados con 60000.00/7 días,
   índices parciales presentes (`pg_indexes`).
2. Integración (`tsx --test`, gateway falso inyectado por `deps`):
   - A y B con OWNER cada uno; A empieza → 1 fila; `Promise.all` de 2 starts de A con un gateway
     falso **lento** (200 ms) que ignora la idempotency key → 1 fila y **1** `createPreapproval`; los
     resultados son `ok` con la misma URL o `checkout_in_progress` (G2: el lease, no MP, deduplica).
   - `INSERT` directo de una segunda fila no terminada para A → error de unicidad; una CANCELED más
     para A → ok.
   - Sync de la preapproval de A (authorized) → A TRIALING; foto de B idéntica.
   - Sync concurrente (webhook + reconcile, `Promise.all`) del mismo snapshot → un APPLIED y un
     UNCHANGED, misma fila final.
   - Cancel de A → CANCELED/PANEL; re-alta de A → sin prueba; la OWNER de A como OWNER de C → sin
     prueba; oferta `allowTrial` para A → con prueba, y una segunda re-alta con la misma oferta → sin.
   - CHECK constraints: plan con `trialLength` sin `trialUnit` → error; `UPDATE` a `TRIALING` (o
     `authorizedAt` no null) dejando `checkoutPayerEmail` → error
     (`TenantSubscription_payer_email_transient`); el mismo `UPDATE` con `checkoutPayerEmail = null`
     → ok.
3. Drift: `prisma migrate diff --from-url <contenedor> --to-schema-datamodel <copia de schema>
   --exit-code` → 0. **Nunca** contra `DATABASE_URL` ni con `--from-migrations`/`--shadow-database-url`.
4. `packages/db/package.json`: `"test:subscriptions": "bash scripts/test-tenant-subscriptions.sh"`.

### B.9.4 `apps/web` — vitest

- `ajustes/suscripcion/actions.test.ts`: STAFF → `forbidden` sin llamar al dominio (start, continue,
  cancel); OWNER con email inválido → `invalid_payer_email` sin llamar al dominio; OWNER ok →
  `startTenantSubscription` recibe `payerEmail` y `redirect` con la URL de MP; dominio devuelve
  `payer_email_rejected`/`checkout_in_progress` → se devuelven igual; continue usa
  `resumePendingCheckout`; URL con otro host → `mp_unavailable`; refresh permitido a STAFF.
- `ajustes/suscripcion/page.test.tsx`: P1 (1 y 2 planes) con el campo "Email de tu cuenta de Mercado
  Pago" precargado con el email de la login; P3 con el campo precargado con `checkoutPayerEmail`;
  P5, P8 (con campo), P9, P10 con los textos exactos; STAFF sin botones ni campo y **sin** el email
  de la OWNER en el HTML; no aparece el texto de cobro de validación; `?mp=volver` muestra P2; nunca
  aparece un id de MP en el HTML.
- `api/webhooks/mercadopago-suscripciones/route.test.ts`: sin secreto → 503; firma inválida → 401 y
  `handleSubscriptionWebhook` no llamado; `data.id` duplicado o inválido → 401; firma válida → 200 y
  `after` llama con `{ topic, resourceId, requestId }`; nunca `console` con el cuerpo.
- `api/webhooks/mercadopago/route.test.ts` (señas): regresión — una notificación con el `user_id` de
  Arzium termina `ignored` y no llama a `syncMercadoPagoPayment`.
- `middleware.test.ts`: §B.6.6 (matcher). Integración HU-026 (§B.6.7), con los mocks de
  `loadOnboardedClinic`/`getTenantSubscriptionGate` que ya tiene el test de #87:
  - OWNER en `onboarding` (alta completa, gate `pending`) → `GET /ajustes/suscripcion` y
    `GET /ajustes/suscripcion?mp=volver` → `NextResponse.next()` (sin redirect) y **sin**
    `console.warn`.
  - La misma OWNER → `/ajustes`, `/ajustes/suscripcion/x`, `/ajustes/suscripcionx`, `/agenda` →
    redirect a `/inicio` con `access_denied reason=onboarding_pending` (sin cambios).
  - OWNER en `setup` y STAFF con suscripción pendiente → `/ajustes/suscripcion` → redirect a
    `/inicio`.
  - Usuaria operativa → `/ajustes/suscripcion` → next (regresión).
- `tenant-context.test.ts` (o el test existente de la puerta): `getSubscriptionAccess` con
  `onboarding_pending` → `{ onboarding: true, isOwner: true, tenantId, userId, timeZone }`;
  `onboarding_setup` → null; operativa OWNER/STAFF → `isOwner` true/false; sin sesión → null.
  `requireSubscriptionOwnerContext` con STAFF → `owner_only`; con null → `no_context`.
- `onboarding-access-adapter.test.ts`: el caso `onboarding` trae `tenantId` y `timeZone`.
- `(suscripcion)/layout.test.tsx`: onboarding → layout mínimo (sin sidebar, sin estado del bot);
  operativa → shell del panel. `(panel)/layout`: mismo HTML que antes de extraer `PanelShell`.
- `actions.test.ts` (además de lo de arriba): OWNER en onboarding → start/continue/cancel llegan al
  dominio con su `tenantId`; STAFF con suscripción pendiente → `forbidden`.
- `guard-coverage.test.ts`: §B.6.6.
- `ajustes/page.test.tsx`: la pestaña Suscripción aparece para OWNER y STAFF.

### B.9.5 `apps/bot` — `workers.test.ts`

- `"*/10 * * * *"` registrado; su tick llama `reconcileOpenSubscriptions` una vez; no se solapa
  (dos ticks concurrentes → una llamada); un `throw` → `logger.error` sin el error.
- Invariantes existentes (primero/último/anteúltimo/último `*/5`) siguen verdes.
- `runStartupJobs` llama `runSubscriptionReconciliation`.

### B.9.6 Verificación 029b (comandos exactos, desde la raíz)

```bash
npm run db:generate
npm run typecheck                                    # core, db, web y bot: 0 errores
npm run test                                         # vitest de todo el monorepo
npx vitest run packages/core/src/subscription-billing.test.ts packages/db/domain/subscriptions.test.ts packages/db/domain/subscriptions-privacy.test.ts packages/db/domain/mercadopagoAccount.test.ts apps/web/src/app/api/webhooks "apps/web/src/app/(panel)/ajustes" "apps/web/src/app/(suscripcion)" apps/web/src/middleware.test.ts apps/web/src/guard-coverage.test.ts apps/web/src/lib apps/bot/src/workers.test.ts
grep -rn "validationCharge" packages/core/src apps/web/src ; test $? -eq 1                     # B.0 R6: el aviso no existe
grep -rnE "payer_?[eE]mail|checkoutPayerEmail" packages/db/domain/subscriptions.ts | grep -E "console\.|subscriptionEvent" ; test $? -eq 1   # el email nunca a logs ni eventos
test ! -e "apps/web/src/app/(panel)/ajustes/suscripcion"                                     # la ruta vive en (suscripcion), §B.6.7
npm run test:subscriptions --workspace packages/db   # migración + probe A/B + drift (Postgres descartable)
npm run test:mp-tenants --workspace packages/db      # regresión 028a (Postgres descartable)
bash packages/db/scripts/test-tenant-isolation.sh    # regresión 025b (Postgres descartable)
(cd packages/db && npx dotenv -e ../../.env -- prisma migrate status)   # al día, sin drift
npm run test:confirm-flow --workspace apps/bot       # regresión del flujo sí/no (limpia por id)
npm run build --workspace apps/web
./ops/harness/verify.sh
```

Lectura de solo verificación en dev, después de migrar: `SELECT conname FROM pg_constraint WHERE
conname LIKE 'TenantSubscription_payer_email%';` → 2 filas.

Reglas para el implementer: **ninguna** llamada real a MP ni cobros (gateway mockeado o falso); no
arrancar el bot ni tocar Baileys; en la base de desarrollo solo la migración (con `pg_dump` previo
fuera del repo) y lecturas; nada de `db:seed`/`seed:demo`; no correr `subscription-plans` contra
la base de desarrollo salvo pedido del usuario. La prueba en sandbox con la pantalla real
(`ARZIUM_SUBSCRIPTIONS_ENABLED=true`, modo `sandbox`, túnel) es **verificación manual opcional del
usuario**.

## B.10 Archivos 029b

| Archivo | Acción |
|---|---|
| `packages/db/prisma/schema.prisma` | §B.4.1. |
| `packages/db/prisma/migrations/<ts>_tenant_subscriptions/migration.sql` | Crear (§B.4.2). |
| `packages/core/src/subscription-billing.ts` (+ `.test.ts`) | Crear (§B.5.1, §B.7). |
| `packages/core/src/index.ts` | Export. |
| `packages/db/domain/subscriptionsGateway.ts` | Crear (§B.5.2). |
| `packages/db/domain/subscriptions.ts` (+ `.test.ts`, `subscriptions-privacy.test.ts`) | Crear (§B.5.3–B.5.6). |
| `packages/db/domain/mercadopagoAccount.ts` (+ `.test.ts`) | §B.5.7. |
| `packages/db/domain/index.ts` | Exports. |
| `packages/db/scripts/subscription-plans.ts` | Crear (§B.5.8). |
| `packages/db/scripts/tenant-subscriptions.integration.ts`, `test-tenant-subscriptions.sh` | Crear (§B.9.3). |
| `packages/db/package.json` | `test:subscriptions`, `subscription-plans`. |
| `apps/web/src/app/(suscripcion)/layout.tsx` (+ `layout.test.tsx`) | Crear (§B.6.7 punto 4). |
| `apps/web/src/app/(suscripcion)/ajustes/suscripcion/{page.tsx,page.test.tsx,actions.ts,actions.test.ts,subscription-screen.tsx,subscription-confirming.tsx,plan-option-card.tsx,payer-email-field.tsx,loading.tsx}` | Crear (§B.6; grupo `(suscripcion)`, no `(panel)`). |
| `apps/web/src/components/shell/panel-shell.tsx` | Crear: cuerpo extraído de `(panel)/layout.tsx` (§B.6.7 punto 4). |
| `apps/web/src/app/(panel)/layout.tsx` | Usa `PanelShell` (mismo HTML). |
| `apps/web/src/lib/tenant-context.ts` (+ test) | `onboarding_pending` con `userId`/`tenantId`/`timeZone`; `getSubscriptionAccess` y las tres `requireSubscription*` (§B.6.7 punto 2). |
| `apps/web/src/lib/onboarding-access-adapter.ts` (+ test) | `kind: "onboarding"` con `tenantId` y `timeZone` (§B.6.7 punto 1). |
| `apps/web/src/lib/onboarding-subscription-gate.ts` | Stub → reexport del gate real de `@nutri-bot/db/domain` (§B.6.7 punto 5). |
| `apps/web/src/app/(panel)/ajustes/{ajustes-tabs.tsx,page.tsx,page.test.tsx}` | Pestaña (§B.6.3). |
| `apps/web/src/app/api/webhooks/mercadopago-suscripciones/{route.ts,route.test.ts}` | Crear (§B.6.5). |
| `apps/web/src/app/api/webhooks/mercadopago/route.test.ts` | Caso de regresión (§B.9.4). |
| `apps/web/src/middleware.ts` (+ `middleware.test.ts`) | Matcher (§B.6.6) y excepción de `/ajustes/suscripcion` para la OWNER en onboarding (§B.6.7 punto 3). |
| `apps/web/src/guard-coverage.test.ts` | Caso nuevo. |
| `apps/bot/src/workers.ts` (+ `workers.test.ts`) | §B.8. |
| `.env.example` | Sección "Suscripciones de Arzium (HU-029)" con las variables de §B.3, `ARZIUM_SUBSCRIPTIONS_ENABLED=false`, comentario "nunca la cuenta de un consultorio". |
| `deploy/README.md` | Nota de deploy (§B.12) y uso del script de planes. |

No se tocan: `payments.ts`, `mercadopago-signature.ts`, `secretBox.ts`, `mercadopagoOAuthClient.ts`,
`auth*.ts`, `conversation.ts`, `Payment`/`MercadoPagoAccount` en el esquema. `tenant-context.ts` solo
suma lo de §B.6.7 (las funciones existentes no cambian de comportamiento).

## B.11 Checklist 029b

Antes de empezar: 028a **y HU-026 (PR #87)** mergeadas en `develop` (si #87 no está → `blocked`,
§B.6.7); `git fetch` y rama `feat/HU-029b-suscripcion-alta` desde `develop`; ninguna otra HU con
label `migración` en `implementando`; `docs/mp-suscripciones-sandbox.md` con G1–G4 resueltas
(**hecho el 2026-11-27**: leer §B.0 antes de empezar; las decisiones de la corrida ya están aplicadas
en esta SDD). Si DP1 (§F) sigue sin respuesta, implementar la recomendación (umbral de 1 h).

### packages/db — esquema y migración
- [ ] 1. `docker compose exec -T db pg_dump -U nutri -Fc nutribot > ~/nutribot-dev-pre-029b.dump` (fuera del repo).
- [ ] 2. `npx prisma migrate status` (desde `packages/db`, con el `.env` de la raíz): sin drift; si hay → `blocked`.
- [ ] 3. Editar `schema.prisma` (§B.4.1), incluidas `checkoutPayerEmail` y `checkoutCreateLeaseUntil` (B.0 R3, R4).
- [ ] 4. `npx dotenv -e ../../.env -- prisma migrate dev --create-only --name tenant_subscriptions`.
- [ ] 5. Revisar el SQL (sin `DROP`, sin `ALTER` de tablas existentes) y agregar el bloque de §B.4.2 (con los CHECK `TenantSubscription_payer_email_*`).
- [ ] 6. `npm run db:migrate` y `npm run db:generate`.
- [ ] 7. Lectura en dev: `SELECT code, mode, amount, "trialLength", "trialUnit", "isDefault" FROM "SubscriptionPlan";` → 2 filas.

### packages/core
- [ ] 8. RED: `subscription-billing.test.ts` (§B.9.1).
- [ ] 9. GREEN: `subscription-billing.ts` con los valores de 029a (`ALLOWED_MONTH_FREQUENCIES = [1, 3, 6, 12]`, `PLAN_BILLING_CYCLES_SUPPORTED = false`, `MP_MIN_AMOUNT_ARS`/`MP_MAX_AMOUNT_ARS`, `free_trial` objeto de S15). Export en `index.ts`. `npx vitest run packages/core`.
- [ ] 9b. GREEN de lo nuevo por la corrida: `normalizePayerEmail`, `classifyPreapprovalCreateError`, `resolveTrialEnd`, `isCheckoutStale` + `STALE_CHECKOUT_TRIAL_LOSS_MS`, `computeTrialEnd` con meses de 30 días, `trial_mismatch`, `amount_out_of_range`, textos nuevos y sin `validationCharge` (§B.9.1).

### packages/db — dominio
- [ ] 10. `subscriptionsGateway.ts` (§B.5.2): `payer_email` obligatorio, sin reintentos del SDK en `create`.
- [ ] 11. RED `subscriptions.test.ts` + `subscriptions-privacy.test.ts` (§B.9.2).
- [ ] 12. `subscriptions.ts`: vista y planes ofrecidos.
- [ ] 13. `startTenantSubscription` (§B.5.4: email, lease de 45 s, búsqueda antes de crear, sin `POST` repetido, clasificación de errores, adopción/cancelación de duplicados).
- [ ] 13b. `resumePendingCheckout` (§B.5.4b) — reemplaza a `getPendingCheckoutUrl`.
- [ ] 14. `syncSubscriptionByPreapprovalId` + `refreshTenantSubscription` (§B.5.5: `trialEndsAt` con `resolveTrialEnd`, borrar `checkoutPayerEmail`/lease, `authorized_after_abandon`).
- [ ] 15. `cancelTenantSubscription` (§B.5.6).
- [ ] 16. `handleSubscriptionWebhook` + `reconcileOpenSubscriptions` (adopción por referencia sin crear; `payment`/`card_validation` ignorados).
- [ ] 17. `mercadopagoAccount.ts`: ignorar el `user_id` de Arzium (§B.5.7) + test.
- [ ] 18. Exports en `domain/index.ts`. `npx vitest run packages/db`.
- [ ] 19. `scripts/subscription-plans.ts` (§B.5.8) + script npm.

### packages/db — probe descartable
- [ ] 20. `tenant-subscriptions.integration.ts` + `test-tenant-subscriptions.sh` + script npm (§B.9.3).

### apps/web
- [ ] 20b. Integración HU-026 (§B.6.7): `onboarding-access-adapter.ts` (`tenantId`, `timeZone`) + test; `tenant-context.ts` (`getSubscriptionAccess`, `requireSubscriptionPageContext`, `requireSubscriptionOwnerContext`, `requireSubscriptionReadContext`) + test; stub de `onboarding-subscription-gate.ts` → gate real.
- [ ] 20c. `middleware.ts`: dejar pasar `/ajustes/suscripcion` (y `?mp=volver`) a la OWNER en `onboarding` + los casos de `middleware.test.ts` de §B.9.4 (incluidos los que deben seguir yendo a `/inicio`).
- [ ] 20d. `components/shell/panel-shell.tsx` extraído de `(panel)/layout.tsx` (mismo HTML) + `(suscripcion)/layout.tsx` (shell u onboarding) + test.
- [ ] 21. `(suscripcion)/ajustes/suscripcion/actions.ts` + tests (§B.6.2; puertas de §B.6.7).
- [ ] 22. `(suscripcion)/ajustes/suscripcion/page.tsx` y componentes (§B.6.1, §B.6.4: campo de email en P1/P3/P8, sin aviso de validación) + `page.test.tsx`.
- [ ] 23. Pestaña en Ajustes (§B.6.3) + test.
- [ ] 24. Webhook nuevo (§B.6.5) + test; caso de regresión en el webhook de señas.
- [ ] 25. `middleware.ts` matcher + test; `guard-coverage.test.ts` (puertas `requireSubscription*` solo en `(suscripcion)`).

### apps/bot
- [ ] 26. `workers.ts` (§B.8) + `workers.test.ts` (§B.9.5).

### Cierre
- [ ] 27. `.env.example`, `deploy/README.md`.
- [ ] 28. Verificación completa (§B.9.6). Reporte en `progress/impl_HU-029b.md`.

Commits sugeridos: schema+migración · core · domain · script de planes · probe · integración HU-026
(puerta + middleware + shell) · web · bot · docs.

## B.12 Nota de deploy 029b

- Migración **aditiva** (tablas y enums nuevos + 2 filas de plan): el binario viejo sigue andando
  durante la ventana `migrate` → `up -d`. Sin cambios en tablas existentes.
- Variables en el `.env` de producción: agregar `ARZIUM_SUBSCRIPTIONS_ENABLED=false` (explícito).
  El resto puede quedar vacío; con `ENABLED` distinto de `"true"` la pantalla muestra "todavía no
  está disponible" y el webhook nuevo responde 503 (sin secreto) o 200 ignorado.
- **No** setear `ARZIUM_MERCADOPAGO_USER_ID` en producción hasta que `legacy-tenant` esté conectado a
  la cuenta de MP de **Daiana** para señas (D2; SDD 028a §12). Chequeo de solo lectura antes de
  setearla: `SELECT "tenantId", "userId" FROM "MercadoPagoAccount";` ≠ el `user_id` de Arzium.
- Aplicación de MP de Arzium (D3a): URL de notificaciones
  `https://numa.arzium.com.ar/api/webhooks/mercadopago-suscripciones`, tópicos de suscripciones y
  pagos (S6: `subscription_preapproval`, `subscription_authorized_payment`, `payment`). Caddy sin
  cambios (mismo host).
- Dato personal nuevo: `TenantSubscription.checkoutPayerEmail` (email de MP de la OWNER) solo vive
  mientras el checkout está sin autorizar; el CHECK de la base impide que quede en una suscripción
  autorizada o cancelada.
- Con HU-026 ya en producción: al desplegar 029b el gate de onboarding deja de ser el stub
  `"pending"`; con `ARZIUM_SUBSCRIPTIONS_ENABLED` apagado las titulares en onboarding pasan a
  operativas (`not_required`, anexo). Avisar a Leo antes del deploy.
- Habilitar cobros reales (`ENABLED=true`, `MODE=live`) es de **HU-031**, con aprobación explícita.
- `legacy-tenant` (D13): sin suscripción; HU-030 lo trata como bonificado. Nada que hacer acá.
- Rollback: código y base juntos con el `pg_dump` del deploy. Volver solo el código deja tablas
  nuevas sin uso (inocuo).

---

# Parte C · 029c · Cobros y período pagado

## C.1 Resumen funcional

Cada cobro de la suscripción (`authorized_payment` de MP) se registra una vez en
`SubscriptionCharge`, con su pago subyacente. Un cobro aprobado recibe **una sola vez** su período
(encadenado al anterior) y extiende `paidUntil`; uno rechazado o en reintento pone la suscripción en
`PAST_DUE`; un reintento aprobado la vuelve a `ACTIVE`; una devolución **total** o un contracargo
sacan al cobro del cálculo de `paidUntil`. Webhook (`subscription_authorized_payment`, `payment`) +
conciliación de cobros + chequeo diario de devoluciones.

Resultados de la corrida en sandbox que aplican a 029c (2026-11-27, §B.0): R6 (el `payment` de $0
`card_validation` al autorizar no es un cobro), R7 (sin prueba, primer cobro inmediato con
`subscription_authorized_payment`), R8 (rechazo al autorizar = `preapproval` `pending`; reintentos no
verificables), R9 (devolución parcial = `approved` + `partially_refunded`; total y contracargo sin
verificar), R15 (S14 sin verificar: P7 usa el enlace de respaldo). La migración `subscription_charges`
**no** cambia por la corrida.

## C.2 Workspaces afectados

| Workspace | ¿Se toca? | Qué |
|---|---|---|
| `packages/db` | **Sí** | `schema.prisma` + migración `subscription_charges`; `domain/subscriptions.ts` (cobros, estado con cobros); probe ampliado. |
| `packages/core` | **Sí** | `subscription-billing.ts`: snapshot y mapeo de cobros, período, `paidUntil`, resumen de cobros, textos de cobros. |
| `apps/web` | **Sí** | Pantalla: P6/P7/P8 con cobros y `paidUntil`; modal de cancelación con `paidUntil`. Webhook: sin cambios de código (los tópicos nuevos los rutea el dominio); tests. |
| `apps/bot` | **Sí** | Cron diario de devoluciones. |

## C.3 Esquema

### C.3.1 Prisma

```prisma
/// HU-029c: estado de un cobro de la suscripción (authorized_payment + pago subyacente).
enum SubscriptionChargeStatus {
  SCHEDULED
  APPROVED
  REJECTED
  RECYCLING
  CANCELLED
  REFUNDED
  CHARGED_BACK
}

model TenantSubscription {
  // ... 029b sin cambios ...
  /// HU-029c: máximo periodEnd entre cobros APPROVED (X11). null = nunca pagó o todo devuelto.
  paidUntil DateTime?
  charges   SubscriptionCharge[]
}

/// HU-029c: un cobro de la suscripción. Único por authorized_payment de MP. Sin datos de tarjeta.
model SubscriptionCharge {
  id                             String                   @id @default(cuid())
  tenantId                       String
  tenant                         Tenant                   @relation(fields: [tenantId], references: [id], onDelete: Restrict)
  subscriptionId                 String
  subscription                   TenantSubscription       @relation(fields: [subscriptionId, tenantId], references: [id, tenantId], onDelete: Restrict, onUpdate: Restrict)
  mercadoPagoAuthorizedPaymentId String                   @unique
  mercadoPagoPaymentId           String?                  @unique
  status                         SubscriptionChargeStatus
  /// Crudos de MP (diagnóstico): status del authorized_payment y status/status_detail del pago.
  mercadoPagoStatus              String?
  statusDetail                   String?
  amount                         Decimal                  @db.Decimal(12, 2)
  currency                       String
  retryAttempt                   Int                      @default(0)
  debitDate                      DateTime?
  approvedAt                     DateTime?
  /// Período que cubre. Se asigna UNA vez, al pasar a APPROVED; nunca se recalcula (X11).
  periodStart                    DateTime?
  periodEnd                      DateTime?
  refundedAt                     DateTime?
  lastSyncedAt                   DateTime?
  createdAt                      DateTime                 @default(now())
  updatedAt                      DateTime                 @updatedAt

  @@index([subscriptionId, debitDate])
  @@index([tenantId])
  @@index([status, approvedAt])
}

model Tenant {
  // ... + 
  subscriptionCharges SubscriptionCharge[]
}
```

### C.3.2 Migración `subscription_charges`

Generada con `--create-only`; se agrega a mano:

```sql
-- HU-029c: un período asignado tiene inicio y fin, y solo existe en cobros que se aprobaron alguna vez.
ALTER TABLE "SubscriptionCharge"
  ADD CONSTRAINT "SubscriptionCharge_period_pair" CHECK (("periodStart" IS NULL) = ("periodEnd" IS NULL)),
  ADD CONSTRAINT "SubscriptionCharge_period_order" CHECK ("periodEnd" IS NULL OR "periodEnd" > "periodStart"),
  ADD CONSTRAINT "SubscriptionCharge_period_needs_approval" CHECK ("periodStart" IS NULL OR "approvedAt" IS NOT NULL);
```

Filas existentes: `TenantSubscription.paidUntil` es nullable (sin backfill: en 029b no hay cobros,
por lo que `NULL` es el valor correcto). La FK compuesta usa el `@@unique([id, tenantId])` que dejó
029b. Esperado en el SQL generado: `CREATE TYPE`, `ALTER TABLE "TenantSubscription" ADD COLUMN
"paidUntil"`, `CREATE TABLE "SubscriptionCharge"`, índices y FKs. Cualquier `DROP` → parar.

## C.4 Contrato compartido

### C.4.1 `packages/core/src/subscription-billing.ts` (agregados)

```ts
export type ChargeStatusValue = "SCHEDULED" | "APPROVED" | "REJECTED" | "RECYCLING" | "CANCELLED" | "REFUNDED" | "CHARGED_BACK";

export type AuthorizedPaymentSnapshot = {
  id: string;
  preapprovalId: string | null;
  status: string;                 // crudo del authorized_payment
  paymentId: string | null;
  paymentStatus: string | null;   // approved | rejected | pending | ...
  paymentStatusDetail: string | null;
  amount: number | null;
  currency: string | null;
  retryAttempt: number;
  debitDate: Date | null;
  lastModified: Date | null;
};
export function parseAuthorizedPayment(raw: unknown): AuthorizedPaymentSnapshot | null;

/** processed+approved → APPROVED (S10 confirmado: así llega el primer cobro sin prueba);
 *  processed+rejected → REJECTED; recycling → RECYCLING; scheduled → SCHEDULED; cancelled → CANCELLED;
 *  processed+pending/in_process → SCHEDULED; otro → null. recycling/retry_attempt y processed+rejected
 *  son SUPUESTOS (S11: los reintentos no se pudieron provocar en sandbox); el llamador loguea el null con
 *  console.warn("[subscriptions] unknown_charge_status", { status }) (solo los dos strings crudos de estado). */
export function mapAuthorizedPaymentStatus(s: { status: string; paymentStatus: string | null }): ChargeStatusValue | null;

/** S12: "refunded" → REFUNDED (supuesto: total sin verificar); "charged_back" → CHARGED_BACK (supuesto:
 *  no simulable); parcial → null (CONFIRMADO 2026-11-27: status "approved", status_detail
 *  "partially_refunded", transaction_amount_refunded > 0; D12: solo la devolución total descuenta);
 *  "approved" con transaction_amount_refunded ≥ transaction_amount → REFUNDED (defensa por si MP no
 *  cambia el status en una total); otro → null. */
export function mapPaymentRefundStatus(p: { status: string; statusDetail: string | null; transactionAmountRefunded: number | null; transactionAmount: number | null }): "REFUNDED" | "CHARGED_BACK" | null;

/** B.0 R6 (S9/S10): el pago de $0 que MP hace al autorizar (con y sin prueba). true si
 *  operation_type === "card_validation" o transaction_amount === 0 (un cobro real nunca es $0: S16 mínimo $15).
 *  Nunca es un cobro: no crea SubscriptionCharge, no cuenta para summarizeCharges ni activa nada. */
export function isCardValidationPayment(raw: unknown): boolean;

/** No retrocede: REFUNDED/CHARGED_BACK son finales; APPROVED no vuelve a REJECTED/RECYCLING/SCHEDULED;
 *  REJECTED → RECYCLING → APPROVED sí. Devuelve el estado a guardar. */
export function nextChargeStatus(current: ChargeStatusValue | null, incoming: ChargeStatusValue): ChargeStatusValue;

export function checkAuthorizedPaymentAgainstSubscription(
  p: AuthorizedPaymentSnapshot,
  expected: { preapprovalId: string; amount: string; currency: string },
): { ok: true } | { ok: false; reason: "preapproval_mismatch" | "amount_mismatch" | "currency_mismatch" };

/** X11. periodStart = latestValidPeriodEnd ?? trialEndsAt ?? approvedAt; periodEnd = addBillingPeriod(periodStart, frequency, unit). */
export function assignChargePeriod(input: {
  approvedAt: Date; latestValidPeriodEnd: Date | null; trialEndsAt: Date | null;
  frequency: number; frequencyUnit: BillingPeriodUnit;
}): { periodStart: Date; periodEnd: Date };

/** máx. periodEnd entre APPROVED; null si no hay. */
export function computePaidUntil(charges: { status: ChargeStatusValue; periodEnd: Date | null }[]): Date | null;

/** everApproved: algún approvedAt no null (aunque después se devolviera).
 *  latestOutcome: entre cobros no SCHEDULED/CANCELLED, el de debitDate (o createdAt) más reciente:
 *  APPROVED/REFUNDED/CHARGED_BACK → "approved"; REJECTED/RECYCLING → "failed"; sin cobros → null. */
export function summarizeCharges(charges: { status: ChargeStatusValue; approvedAt: Date | null; debitDate: Date | null; createdAt: Date }[]): ChargeSummary;

// Textos (en SUBSCRIPTION_TEXT):
chargesTitle: "Últimos cobros",
chargeStatus: { SCHEDULED: "Programado", APPROVED: "Aprobado", REJECTED: "Rechazado", RECYCLING: "Reintentando", CANCELLED: "Anulado", REFUNDED: "Devuelto", CHARGED_BACK: "Contracargo" },
rejectionReason: (statusDetail: string | null) => string, // mapa de status_detail comunes de MP a texto llano; default "el medio de pago fue rechazado"
```

Nota de diseño: con `latestOutcome` "approved" para un cobro devuelto, la suscripción sigue
`ACTIVE` y solo baja `paidUntil`; HU-030 decide qué hacer con un `paidUntil` vencido (D12).

### C.4.2 `packages/db/domain/subscriptions.ts` (agregados y cambios)

```ts
/** web (webhook) y bot. Consulta el authorized_payment, lo valida contra su suscripción y lo aplica. */
export async function syncAuthorizedPayment(
  authorizedPaymentId: string, source: SubscriptionSyncSource, meta?: { requestId?: string | null }, deps?: SubscriptionDeps,
): Promise<SubscriptionSyncResult>;

/** web (webhook) y bot. Consulta el pago; si es de un SubscriptionCharge conocido (por mercadoPagoPaymentId),
 *  aplica devolución/contracargo. Desconocido → "ignored" (unknown_payment): la conciliación de cobros lo completa. */
export async function syncSubscriptionPayment(
  paymentId: string, source: SubscriptionSyncSource, meta?: { requestId?: string | null }, deps?: SubscriptionDeps,
): Promise<SubscriptionSyncResult>;

/** bot (diario). Cobros APPROVED con approvedAt en los últimos 180 días: getPayment → refund/contracargo. */
export async function reconcileSubscriptionRefunds(onError?: (chargeId: string) => void, deps?: SubscriptionDeps):
  Promise<{ processed: number; failed: number; skipped: number }>;
```

Cambios:
- `handleSubscriptionWebhook`: `subscription_authorized_payment` → `syncAuthorizedPayment`;
  `payment` → `syncSubscriptionPayment`; `subscription_preapproval` igual; resto → ignored.
  `resourceId` de cobros y pagos debe ser `/^\d{1,20}$/` (si no → ignored).
- `reconcileOpenSubscriptions`: después de sincronizar la preapproval, si tiene
  `mercadoPagoPreapprovalId` → `searchAuthorizedPayments(id)` y `syncAuthorizedPayment` de cada uno
  (dentro del mismo try/catch por suscripción).
- `syncSubscriptionByPreapprovalId`: `charges` = `summarizeCharges(cobros de la suscripción)` leído
  **bajo el mismo `FOR UPDATE`**.
- `TenantSubscriptionView.subscription` suma `paidUntil: Date | null` y `view.recentCharges:
  { date: Date; amountText: string; status: ChargeStatusValue }[]` (últimos 6, `debitDate ??
  createdAt` desc; sin ids de MP), y `pastDueReasonText: string | null`.

Algoritmo de `syncAuthorizedPayment`:
1. Config ≠ enabled → ignored. `getAuthorizedPayment(id)` → `parseAuthorizedPayment`; null →
   REJECTED `invalid_resource`.
2. Suscripción por `mercadoPagoPreapprovalId = snapshot.preapprovalId` (y modo actual); ninguna →
   IGNORED `unknown_preapproval`.
3. Transacción: `FOR UPDATE` de la **suscripción** (serializa cobros y estado de la misma
   suscripción).
   - `checkAuthorizedPaymentAgainstSubscription` → mismatch: REJECTED con motivo, sin cambios.
   - `incoming = mapAuthorizedPaymentStatus(...)`; null → IGNORED `unknown_status`.
   - Cobro existente por `mercadoPagoAuthorizedPaymentId` (o `create` con `tenantId` de la
     suscripción). `status = nextChargeStatus(current, incoming)`; actualizar crudos,
     `paymentId` (si llega), `retryAttempt`, `debitDate`, `lastSyncedAt`.
   - Transición a `APPROVED` por primera vez (`approvedAt` null): `approvedAt = now`;
     `assignChargePeriod({ approvedAt, latestValidPeriodEnd: computePaidUntil(otros cobros),
     trialEndsAt: (es el primer cobro aprobado de la suscripción ? trialEndsAt : null), … })`.
   - Recalcular `paidUntil = computePaidUntil(todos)` y el estado con `decideSubscriptionStatus`
     usando `mercadoPagoStatus` guardado + `summarizeCharges(todos)`. Si la suscripción está
     `CANCELED`, el cobro se registra igual (es plata real) pero el estado no cambia.
   - Evento APPLIED/UNCHANGED con `topic: "authorized_payment"`.

Algoritmo de `syncSubscriptionPayment`: `getPayment(id)`; **`isCardValidationPayment` → evento
IGNORED `card_validation` y `ignored`, sin buscar cobros ni suscripción** (B.0 R6); cobro por
`mercadoPagoPaymentId`; ninguno → IGNORED `unknown_payment`. `FOR UPDATE` de la suscripción; `mapPaymentRefundStatus`; no null y
el cobro está APPROVED → `status` REFUNDED/CHARGED_BACK, `refundedAt = now`; **`periodStart`/
`periodEnd` se conservan** (auditoría) pero dejan de contar porque `computePaidUntil` solo mira
APPROVED; recalcular `paidUntil` y estado. Parcial → evento UNCHANGED `partial_refund` (MP manda
dos `payment.updated` por una parcial, S12: el segundo también es UNCHANGED, idempotente).

Nota S11 (B.0 R8): una tarjeta rechazada **al autorizar** no genera `authorized_payment` (la
`preapproval` queda `pending`), así que nunca produce `PAST_DUE`; `PAST_DUE` solo sale de un cobro
posterior rechazado, cuyo comportamiento de reintentos sigue sin verificar.

### C.4.3 Bot

```ts
export async function runSubscriptionRefundCheck(): Promise<void>; // mismo esqueleto que runSubscriptionReconciliation, sin solaparse
```
`cron.schedule("20 5 * * *", () => runSubscriptionRefundCheck());` inmediatamente después del
`"*/10 * * * *"` de 029b (no rompe los invariantes de `workers.test.ts`). No va en `runStartupJobs`.

## C.5 Pantalla (029c)

- P6 `ACTIVE`: `active(precio, nextPaymentDate)` + `GroupedList` "Últimos cobros" (fecha,
  `formatPrice(amount)`, `chargeStatus[status]` con `Badge`).
- P7 `PAST_DUE`: `pastDue(rejectionReason(statusDetail del último fallido))`, `goToMercadoPago`
  y `cancel`; lista de cobros. S14 sigue sin verificar: `goToMercadoPago` lleva a
  `https://www.mercadopago.com.ar/` (respaldo de §A.5) hasta que una corrida confirme la URL de
  gestión de suscripciones del comprador.
- P8 `CANCELED`: `canceled`/`canceledByMercadoPago` + `paidUntil(fecha)` si `paidUntil > ahora`;
  lista de cobros.
- Modal M1: `ACTIVE`/`PAST_DUE` con `paidUntil` → `cancelConfirmActive(paidUntil)`; sin `paidUntil` →
  `cancelConfirmPlain`; `TRIALING` → `cancelConfirmTrial(trialEndsAt)`.
- La pestaña de Ajustes muestra `summary[status]` como en 029b.

## C.6 Tests y verificación (029c)

### C.6.1 core
- `parseAuthorizedPayment` (con la forma de S10: `status: "processed"`, `payment: { id, status:
  "approved" }`), `mapAuthorizedPaymentStatus` (`processed`+`approved` → APPROVED confirmado; resto
  de la tabla como supuesto; desconocido → null), `mapPaymentRefundStatus` (parcial real de S12:
  `{ status: "approved", statusDetail: "partially_refunded", transactionAmountRefunded: 10000,
  transactionAmount: 60000 }` → null; `refunded` → REFUNDED; `approved` con devuelto = total →
  REFUNDED; `charged_back` → CHARGED_BACK), `nextChargeStatus` (no retrocede),
  `checkAuthorizedPaymentAgainstSubscription`.
- `isCardValidationPayment`: `{ operation_type: "card_validation", transaction_amount: 0, status:
  "approved" }` → true; un cobro de $60.000 `recurring_payment` → false; forma desconocida → false.
- `assignChargePeriod`: primer cobro con prueba (empieza en `trialEndsAt`), primer cobro sin prueba
  (empieza en `approvedAt`), renovación (encadena: +1 mes exacto), reintento aprobado tarde
  (encadena al anterior, no a la fecha de aprobación), trimestral y anual.
- `computePaidUntil`: vacío → null; devuelto el último → baja al anterior; devuelto uno del medio →
  sin cambio.
- `summarizeCharges` + `decideSubscriptionStatus` con cobros: TRIALING→ACTIVE, ACTIVE→PAST_DUE,
  PAST_DUE→ACTIVE, ACTIVE con último devuelto → ACTIVE.

### C.6.2 db (mocks)
- Primer cobro aprobado: una fila, período [trialEndsAt, +1 mes), `paidUntil`, TRIALING → ACTIVE.
- El mismo webhook dos veces y fuera de orden (rejected después de approved del mismo cobro) → una
  fila, sin re-asignar período, estado sin retroceder.
- Renovación: `paidUntil` +1 mes exacto una sola vez.
- Rechazo → PAST_DUE sin extender; reintento aprobado → ACTIVE y +1 período una vez.
- Devolución total → REFUNDED, `paidUntil` baja; parcial (forma real de S12) → sin cambios y dos
  `payment.updated` seguidos → dos UNCHANGED; contracargo → CHARGED_BACK.
- `payment` de $0 `card_validation` (con y sin prueba) → IGNORED `card_validation`, sin
  `SubscriptionCharge`, sin cambio de estado ni de `paidUntil`, sin consultas a cobros.
- Status de `authorized_payment` desconocido → IGNORED `unknown_status` + `console.warn` con los
  strings de estado y nada más.
- Cobro de otra preapproval / otro importe → REJECTED sin filas.
- Cobro de A no toca B.
- Webhook de señas: un `payment` de Arzium nunca crea ni modifica `Payment` (regresión §B.9.4).
- `reconcileOpenSubscriptions` sincroniza cobros; `reconcileSubscriptionRefunds` aísla fallas.
- Privacy: `statusDetail` sí, nunca email/tarjeta del pago.

### C.6.3 Probe descartable
Ampliar `tenant-subscriptions.integration.ts` y `test-tenant-subscriptions.sh` (target
`subscription_charges`, fixture: una suscripción TRIALING de 029b): migración aplica sin tocar la
fila; concurrencia (`Promise.all` de dos `syncAuthorizedPayment` del mismo cobro aprobado → un solo
período, `paidUntil` +1 mes); CHECK de período; drift = 0.

### C.6.4 web y bot
- `page.test.tsx`: P6, P7, P8 con cobros y `paidUntil`; modal con el texto según estado.
- `workers.test.ts`: `"20 5 * * *"` llama `reconcileSubscriptionRefunds`; invariantes existentes.

### C.6.5 Verificación 029c (comandos exactos)

```bash
npm run db:generate
npm run typecheck
npm run test
npx vitest run packages/core/src/subscription-billing.test.ts packages/db/domain/subscriptions.test.ts packages/db/domain/subscriptions-privacy.test.ts apps/web/src/app/api/webhooks "apps/web/src/app/(suscripcion)" apps/web/src/middleware.test.ts apps/bot/src/workers.test.ts
npm run test:subscriptions --workspace packages/db
npm run test:mp-tenants --workspace packages/db
(cd packages/db && npx dotenv -e ../../.env -- prisma migrate status)
npm run test:confirm-flow --workspace apps/bot
npm run build --workspace apps/web
./ops/harness/verify.sh
```

Mismas reglas que §B.9.6: nada de MP real, nada de cobros, base de dev solo migración + lecturas.

## C.7 Archivos 029c

| Archivo | Acción |
|---|---|
| `packages/db/prisma/schema.prisma` | §C.3.1. |
| `packages/db/prisma/migrations/<ts>_subscription_charges/migration.sql` | Crear (§C.3.2). |
| `packages/core/src/subscription-billing.ts` (+ test) | §C.4.1. |
| `packages/db/domain/subscriptions.ts` (+ tests) | §C.4.2. |
| `packages/db/scripts/tenant-subscriptions.integration.ts`, `test-tenant-subscriptions.sh` | §C.6.3. |
| `apps/web/src/app/(suscripcion)/ajustes/suscripcion/*` | §C.5. |
| `apps/bot/src/workers.ts` (+ test) | §C.4.3. |
| `deploy/README.md` | Nota 029c. |

## C.8 Checklist 029c

Antes: 029b en `develop`; rama `feat/HU-029c-suscripcion-cobros`; ninguna otra migración en curso.

- [ ] 1. `pg_dump` fuera del repo; `prisma migrate status` sin drift.
- [ ] 2. `schema.prisma` (§C.3.1); `--create-only --name subscription_charges`; agregar §C.3.2; revisar; `db:migrate` + `db:generate`.
- [ ] 3. RED → GREEN core (§C.6.1), incluidos `isCardValidationPayment` y la forma real de la parcial (S12).
- [ ] 4. RED db: cobros (§C.6.2).
- [ ] 5. `syncAuthorizedPayment` (período una vez, `paidUntil`, estado).
- [ ] 6. `syncSubscriptionPayment` (`card_validation` ignorado primero; devolución/contracargo; parcial idempotente).
- [ ] 7. Estado con cobros en `syncSubscriptionByPreapprovalId`; tópicos en `handleSubscriptionWebhook`; cobros en `reconcileOpenSubscriptions`; `reconcileSubscriptionRefunds`.
- [ ] 8. Vista: `paidUntil`, `recentCharges`, `pastDueReasonText`.
- [ ] 9. Probe descartable (§C.6.3).
- [ ] 10. Pantalla (§C.5) + tests.
- [ ] 11. Bot (§C.4.3) + tests.
- [ ] 12. `deploy/README.md`; verificación (§C.6.5); `progress/impl_HU-029c.md`.

## C.9 Nota de deploy 029c

Migración aditiva (enum, tabla, una columna nullable). Sin variables nuevas. Con
`ARZIUM_SUBSCRIPTIONS_ENABLED` apagado no corre nada nuevo. Cuando HU-031 habilite `live`: mirar en
los logs del bot `Conciliación de suscripciones` y, con el primer cobro real, que `paidUntil` avance
una sola vez (`SELECT status, "paidUntil" FROM "TenantSubscription" WHERE id = …`, solo lectura).

---

## D. Contrato para las HU vecinas

- **HU-030 (acceso):** lee de `TenantSubscription` (la no terminada o la última por `createdAt`):
  `status`, `authorizedAt`, `trialGranted`, `trialEndsAt`, `paidUntil` (029c), `canceledAt`,
  `cancelOrigin`, `mode`. `trialEndsAt` es la fecha del primer cobro que fijó MP (S9: creación +
  prueba), que puede ser **anterior** a `authorizedAt + prueba` y hasta anterior a `authorizedAt`. Agrega `SUSPENDED` al enum con su propia migración. Una `CANCELED` con
  `authorizedAt` null es un checkout abandonado, no una baja. `legacy-tenant` sin suscripción =
  bonificado (D13). La pantalla `/ajustes/suscripcion` es la base de "Mi suscripción": HU-030 la
  deja accesible con el consultorio suspendido.
- **HU-026 (onboarding, Leo):** el paso de pago enlaza a `/ajustes/suscripcion`. El registro no crea
  suscripción ni prueba. 029b deja pasar esa ruta (y `?mp=volver`) a la OWNER en `onboarding`
  (middleware + puerta propia + layout fuera de `(panel)`, §B.6.7) y reemplaza el stub del gate por
  el real. 029b arranca con el PR #87 en `develop`.
- **HU-028 (señas):** sin cambios de contrato; 029b solo hace que el webhook de señas ignore el
  `user_id` de Arzium (§B.5.7).
- **HU-031:** habilita `ARZIUM_SUBSCRIPTIONS_ENABLED=true` + `ARZIUM_MERCADOPAGO_MODE=live` en
  producción con aprobación explícita.

## E. Fuera de alcance (confirmado)

Pantalla de cambio de plan para una suscripción viva (se hace con cancelar + re-alta); prorrateos;
cupones de descuento sobre el importe (un "descuento" es un plan con otro importe); pack como pago
único si G4 se refuta (HU aparte con Checkout Pro); consola de Arzium (025d); facturación fiscal;
devoluciones iniciadas desde Numa; emails propios; retención/purga de `SubscriptionEvent` (volumen
bajo; se evalúa en HU-031); expiración automática de `PENDING` viejas (la conciliación deja de
mirarlas a los 30 días; "Empezar de nuevo" las anula).

## F. Dudas técnicas

Compuertas de §A.5 resueltas el 2026-11-27 (§B.0): G1 abierta, G2 resuelta con deduplicación propia
(§B.5.4), G3 refutada (D8(a)), G4 sin confirmar (`PLAN_BILLING_CYCLES_SUPPORTED = false`). No quedan
dudas técnicas bloqueantes para 029b. Supuestos que siguen sin verificar y ya tienen su respaldo en
el diseño: S8 (`pending` cancelada autorizable → §B.5.5 `authorized_after_abandon`), S11 reintentos
(029c, status desconocido → IGNORED + warn), S12 total/contracargo (029c), S13 `payer_id`, S14 (P7 con
enlace de respaldo), consistencia de la búsqueda por referencia tras un `POST` ambiguo (§B.5.4 nota 3).

### Duda de producto para el usuario

> **Resuelta (2026-11-27): opción A con umbral de 1 hora.** Usuario: "acepto dp1 con el umbral de 1hora".

**DP1 · Desde cuándo corre la prueba gratis (S9).** MP cuenta la prueba desde que se **crea** el
checkout, no desde que la titular lo autoriza: si toca "Empezar prueba gratis" y autoriza dos días
después, MP le cobra a los 5 días de autorizar. La HU validada decía "fin de la prueba (7 días
después)" de la autorización.
- Opción A (**recomendada**, es lo que especifica esta SDD): la fecha de fin de prueba y del primer
  cobro que mostramos es la que fija MP (siempre la verdad, nunca le prometemos un día que MP no
  respeta), y "Continuar en Mercado Pago" recrea el checkout si la prueba ya perdió más de **1 hora**,
  así quien vuelve tarde tiene los 7 días completos. Costo: un checkout abandonado se anula y se crea
  otro (invisible para la titular).
- Opción B: igual que A pero con otro umbral (p. ej. 24 h: menos recreaciones, hasta un día menos de
  prueba).
- Opción C: no recrear nunca; mostrar la fecha de MP y aceptar que quien tarda pierde días.

Si no hay respuesta antes de implementar 029b, el implementer aplica A con 1 h
(`STALE_CHECKOUT_TRIAL_LOSS_MS`); cambiar el umbral después es una constante.

---

## Anexo (2026-11-25) · Contrato con HU-026 (onboarding)

Acordado con Leo (HU-026) y decidido por Joel. Entra en **029b** (módulo `packages/db/domain/subscriptions.ts`, exportado como el resto de `domain`), con tests:

```ts
export type TenantSubscriptionGate = "not_required" | "verified" | "pending";
/** HU-026 la consulta para decidir si un consultorio nuevo puede operar. Solo lectura. */
export async function getTenantSubscriptionGate(tenantId: string, deps?: SubscriptionDeps): Promise<TenantSubscriptionGate>;
/** "verified" en términos booleanos (para quien solo necesita sí/no). */
export async function hasVerifiedSubscriptionAuthorization(tenantId: string, deps?: SubscriptionDeps): Promise<boolean>;
```

- **`not_required`**: el cobro está apagado (`resolveSubscriptionBillingConfig` ≠ `enabled`). **Decisión de Joel:** mientras el cobro esté apagado, los consultorios nuevos se habilitan sin suscripción (como `legacy-tenant`, bonificados). HU-030 decide qué pasa con ellos cuando se prende el cobro.
- **`verified`**: cobro prendido y la última `TenantSubscription` del consultorio en el modo actual tiene `authorizedAt != null` y `status ≠ CANCELED`. `authorizedAt`/`TRIALING` solo los escribe `syncSubscriptionByPreapprovalId` después de consultar la preapproval en MP y validarla (`external_reference`, importe, moneda, frecuencia). La vuelta del checkout (`?mp=volver`) nunca la escribe.
- **`pending`**: cobro prendido y no hay suscripción, no está autorizada o está cancelada. Si la consulta a la base falla, la función tira; HU-026 lo trata como `pending`.
- HU-026 **no** inicia la prueba gratis: la da MP (`free_trial`) y HU-029 la registra (`trialEndsAt`).
- Ruta para mandar a la titular a suscribirse: `/ajustes/suscripcion`.

Checklist 029b: agregar el ítem "`getTenantSubscriptionGate` + `hasVerifiedSubscriptionAuthorization` con tests de los tres casos (cobro apagado, autorizada verificada, pendiente/cancelada) y de que `?mp=volver` no la cambia".
