# Suscripciones de Mercado Pago · prueba en sandbox (HU-029 · 029a)

**Estado: pendiente de corrida.** El script y este runbook están listos. Las tablas de resultados
están vacías hasta que alguien haga la corrida manual con usuarios de prueba. Hasta entonces
**029b queda bloqueada** (SDD `Refactorizaciones/suscripcion-arzium-mercadopago.md`, §A.1 y §A.5).

- HU: `docs/hu-suscripcion-arzium-mercadopago.md` · SDD: `Refactorizaciones/suscripcion-arzium-mercadopago.md`, parte A.
- Script: `packages/db/scripts/mp-subscriptions-sandbox.ts` (`npm run mp:subs-sandbox --workspace packages/db -- <subcomando>`).
- Corrida hecha por: _(completar)_ · Fecha: _(completar)_ · Versión del SDK `mercadopago`: 3.6.1.

## Reglas de la corrida

- Solo **usuarios de prueba** de Mercado Pago. El script se niega a operar si `/users/me` no tiene el
  tag `test_user` y si falta `MP_SUBS_SANDBOX=true`. Nunca pongas un token real de Arzium ni de un
  consultorio en `.env.mp-sandbox.local`.
- El script **no toca la base**: no lee `DATABASE_URL` ni el `.env` de la raíz.
- Lo que imprime ya está redactado: sin emails, nombres, documentos, tarjetas ni tokens, y los ids
  de MP acortados a 6 caracteres (`2c9380…`). A este informe solo se copia esa salida.
- Los ids completos quedan **solo en local**, fuera del repo, en `MP_SUBS_CAPTURE_DIR`
  (`state.json` y `init-point-<ref>.txt`). Esos archivos no se copian al informe ni se commitean.
  Los subcomandos aceptan el id acortado que imprimió el script (`get 2c9380…`).
- Nada de la corrida se commitea salvo este informe completado.

## 1. Preparación (una sola vez)

### 1.1 Usuarios de prueba

1. Entrá a <https://www.mercadopago.com.ar/developers/panel/app> con la cuenta de **Arzium**.
2. Abrí (o creá) una aplicación cualquiera de Arzium y andá a **Cuentas de prueba** → **Crear
   cuenta de prueba**. Creá dos, de **Argentina**:
   - **Vendedor** (descripción "Vendedor Numa sandbox"): hace de cuenta de cobro de Arzium.
   - **Comprador** (descripción "Comprador Numa sandbox"), con algo de saldo ficticio.
3. Anotá usuario y contraseña de cada una en tu gestor de contraseñas (no en el repo).

> Según la documentación de MP, las suscripciones se prueban con las **credenciales de producción
> de una aplicación creada dentro del usuario vendedor de prueba** (no con las credenciales
> `TEST-…` de la cuenta real). Si MP cambió esto, anotalo en "Notas de la corrida".

### 1.2 Aplicación de prueba en el vendedor

1. En una ventana privada, iniciá sesión en <https://www.mercadopago.com.ar/developers/panel/app>
   con el **vendedor de prueba** (si pide un código por email, MP lo indica en la pantalla de la
   cuenta de prueba).
2. **Crear aplicación** → "Pagos online" → producto **Suscripciones**.
3. En **Credenciales de producción** copiá el **Access Token** (`APP_USR-…`).
4. En **Webhooks** → **Configurar notificaciones**:
   - URL (modo productivo y de prueba): la URL pública del túnel (paso 1.3), por ejemplo
     `https://<algo>.trycloudflare.com/webhook`.
   - Eventos: **Planes y suscripciones** (`subscription_preapproval`,
     `subscription_authorized_payment`, `subscription_preapproval_plan`) y **Pagos** (`payment`).
   - Guardá y copiá la **clave secreta** que muestra la pantalla.

### 1.3 Túnel

El receptor local escucha en `http://localhost:4010` (o `MP_SUBS_LISTEN_PORT`). MP exige `https`
para el `back_url` y para las notificaciones, así que hace falta un túnel:

```bash
cloudflared tunnel --url http://localhost:4010     # o ngrok http 4010
```

Copiá la URL `https://…` que imprime. Si el túnel cambia de URL (cloudflared rápido cambia en cada
arranque), actualizá la URL de notificaciones de la aplicación y `MP_SUBS_BACK_URL`.

### 1.4 `.env.mp-sandbox.local` (en la raíz del repo; ya está ignorado por git)

```dotenv
MP_SUBS_SANDBOX=true
# Access Token de producción de la aplicación creada en el VENDEDOR de prueba
ARZIUM_MERCADOPAGO_ACCESS_TOKEN=APP_USR-...
# Clave secreta de Webhooks de esa aplicación
ARZIUM_MERCADOPAGO_WEBHOOK_SECRET=...
# Email del COMPRADOR de prueba (solo para los create sin --no-email)
MP_SUBS_BUYER_EMAIL=test_user_...@testuser.com
# URL pública del túnel + /volver
MP_SUBS_BACK_URL=https://<algo>.trycloudflare.com/volver
MP_SUBS_LISTEN_PORT=4010
# Fuera del repo. Por defecto: <tmpdir del sistema>/numa-mp-subs-sandbox
# MP_SUBS_CAPTURE_DIR=/ruta/fuera/del/repo
```

Chequeo: `npm run mp:subs-sandbox --workspace packages/db -- whoami` tiene que mostrar `tags` con
`test_user` y `site_id: "MLA"`. Si dice que la cuenta no es de prueba, **pará**: el token no es del
vendedor de prueba.

## 2. Corrida

Todos los comandos desde la raíz del repo. Abreviatura: `mp` = `npm run mp:subs-sandbox --workspace packages/db --`.

Tarjetas de prueba de Argentina (las vigentes están en la doc de MP, "Tarjetas de prueba"):
Mastercard `5031 7557 3453 0604` o Visa `4509 9535 6623 3704`, CVV `123`, vencimiento `11/30`,
DNI `12345678`. El **nombre del titular** decide el resultado: `APRO` aprueba, `OTHE` rechaza,
`FUND` rechaza por fondos insuficientes.

| Paso | Comando / acción | Supuestos |
|---|---|---|
| 0 | Terminal 1: túnel. Terminal 2: `mp listen` (dejarlo corriendo). | S6, S7 |
| 1 | `mp whoami` | S13, S17 |
| 2 | `mp create --freq 1 --unit months --trial 7 --trial-unit days` (mensual $60.000 con 7 días). Anotar `status`, `init_point` presente, `free_trial_type`, `auto_recurring`, `next_payment_date`, `collector_matches_seller`. | S1, S15, S16 |
| 3 | Abrir el `init_point` (archivo que indica el script, o repetir con `--open`) en una ventana privada **logueado como el comprador de prueba**, pagar con tarjeta `APRO` y autorizar. Ver en `listen` la vuelta a `/volver` y los webhooks. | S7, S6, S9 |
| 4 | `mp get <id>` y `mp invoices <id>` de la del paso 2. ¿`status: authorized`? ¿`next_payment_date` = autorización + 7 días? ¿Hubo cobro de validación (invoice o pago inmediato)? | S8, S9, S13 |
| 5 | `mp search --ref <external_reference del paso 2>` | S2 |
| 6 | Idempotencia: `mp create --no-email --idem prueba-s4-1` dos veces → ¿mismo id? Después `mp create --no-email --idem prueba-s4-2 --ref <ref de la primera>` → ¿otra `preapproval` con la misma referencia, o error? | S4 |
| 7 | `mp create --no-email` y abrir su `init_point` como comprador: ¿deja elegir la cuenta y autorizar sin `payer_email`? | S3 |
| 8 | `mp create --freq 1 --unit days --trial 1 --trial-unit days` y `mp create --freq 1 --unit days` (sin prueba): autorizar las dos. Sin prueba, `mp invoices <id>` a los pocos minutos. Al día siguiente, `invoices` de las dos y `payment <payment.id>`. | S5 (days), S10, S11, S12 |
| 9 | Variantes (solo `create` + `get`, autorizando las que haga falta): `--freq 3`, `--freq 6`, `--freq 12`, `--trial 1 --trial-unit months`, `--freq 1 --unit days --cycles 1` (pack: ¿termina en `finished` después del cobro?). Importes límite: `--amount 1`, `--amount 15`, `--amount 999999999`. | S5, S16 |
| 10 | Rechazo: `mp create --freq 1 --unit days` y autorizar con titular `OTHE` (o `FUND`). `invoices` durante los días siguientes: `status` (`recycling`?), `retry_attempt`, `next_retry_date`; ¿la `preapproval` se cancela sola al agotar reintentos? | S11 |
| 11 | Devoluciones: desde el panel del **vendedor** de prueba (Actividad → el cobro), devolución **total** de un cobro aprobado y **parcial** de otro. `mp payment <id>` de cada uno + webhooks `payment` en `listen`. Contracargo: no se puede simular en sandbox salvo que MP lo ofrezca; si no, "no verificable". | S12 |
| 12 | Cancelación: `mp cancel <id>` sobre una `authorized` y sobre una `pending` (sin autorizar). Abrir después el `init_point` de la `pending` cancelada: ¿se puede autorizar? `mp pause <id>` sobre otra autorizada. | S8 |
| 13 | Cancelación desde el comprador: logueado como comprador, entrar a la sección de suscripciones de su cuenta de MP y cancelar una. Anotar la URL de esa pantalla y si permite cambiar el medio de pago. Ver webhook en `listen` y `mp get <id>`. | S8, S14 |
| 14 | Revisar las capturas de `listen` (`MP_SUBS_CAPTURE_DIR/captures/*.json`, ya redactadas): `type`/`topic`, `action`, si `data.id` vino en la query (`query_data_id`) y en el cuerpo (`body_data_id`), y `signature.valid_with` (`query`, `body` o `none`). | S6 |

## 3. Resultados de los supuestos

Resultado: **confirmado** / **refutado** / **no verificable**. Evidencia: salida redactada del
script (o extracto), con el paso de la corrida.

| # | Supuesto (SDD §A.5) | Paso | Resultado | Evidencia redactada |
|---|---|---|---|---|
| S1 | `POST /preapproval` sin `preapproval_plan_id`, `status: "pending"`, devuelve `init_point` y respeta `auto_recurring.free_trial` (días y meses). | 2, 9 | | |
| S2 | `external_reference` vuelve igual en `GET` y se busca con `/preapproval/search?external_reference=`. | 4, 5 | | |
| S3 | `payer_email` es opcional en `status: "pending"`. | 7 | | |
| S4 | `X-Idempotency-Key` devuelve la misma `preapproval` con la misma key (anotar TTL si se ve); qué pasa con otra key y la misma referencia. | 6 | | |
| S5 | `months` acepta 1, 3, 6 y 12; `days` funciona en sandbox; `end_date` corta después de N cobros y termina en `finished`. | 8, 9 | | |
| S6 | Notificaciones desde la URL de la aplicación; tópicos `subscription_preapproval`, `subscription_authorized_payment`, `payment`; cuerpo `{ type, action, data: { id } }`; `data.id` en la query; `x-signature` valida con el manifiesto de las señas. | 3, 14 | | |
| S7 | `back_url` recibe `?preapproval_id=…`; MP exige `https`. | 3 | | |
| S8 | Estados `pending`, `authorized`, `paused`, `cancelled`, `finished`; `cancelled` inmediato en el `GET`; una `pending` cancelada no se puede autorizar; cancelación del comprador con webhook. | 4, 12, 13 | | |
| S9 | Con prueba, `next_payment_date` = autorización + prueba. ¿Cobro de validación al autorizar? | 3, 4 | | |
| S10 | Sin prueba, primer cobro al autorizar, visible en `/authorized_payments` en minutos. | 8 | | |
| S11 | `authorized_payments`: `status` (`scheduled`/`processed`/`recycling`/`cancelled`), `payment.status`, `retry_attempt`, política de reintentos. | 8, 10 | | |
| S12 | `/v1/payments/{id}` con el token de Arzium; devolución total → `refunded`; parcial → `approved` + `transaction_amount_refunded > 0` (o `partially_refunded`); contracargo → `charged_back`; llega `payment`. | 8, 11 | | |
| S13 | `collector_id` = `user_id` de la cuenta de Arzium (`collector_matches_seller: true`); `payer_id` estable entre suscripciones del mismo comprador. | 1, 2, 4 | | |
| S14 | El comprador cambia el medio de pago desde su cuenta; URL de gestión de suscripciones del comprador. | 13 | | |
| S15 | Forma de `auto_recurring.free_trial` en la respuesta (`free_trial_type`: `object`/`string`/`missing`). | 2, 4 | | |
| S16 | Importes mínimo y máximo de una `preapproval` en ARS. | 9 | | |
| S17 | Los usuarios de prueba tienen `tags: ["test_user", …]` en `/users/me`. | 1 | | |

## 4. Compuertas G1–G4

| Compuerta | Depende de | Resolución | Consecuencia para 029b |
|---|---|---|---|
| **G1** · flujo D4(c) (`preapproval` sin plan + `init_point`) | S1 | _(pendiente)_ | Si S1 se refuta: 029b no arranca y se relanza el architect para D4(b). |
| **G2** · creación fuera de la transacción | S2 (y S4) | _(pendiente)_ | Sin búsqueda por referencia (o S2 y S4 fallan): variante de §B.5.3 nota 2 (llamada a MP dentro del advisory lock). |
| **G3** · `payer_email` opcional | S3 | _(pendiente)_ | Si se refuta: variante D8(a), campo "Email de tu cuenta de Mercado Pago". |
| **G4** · packs con `end_date` | S5 | _(pendiente)_ | Sin `end_date` que corte: `PLAN_BILLING_CYCLES_SUPPORTED = false` y los packs van a otra HU. |

## 5. Valores para 029b/029c

| Valor | Resultado de la corrida |
|---|---|
| `ALLOWED_MONTH_FREQUENCIES` (de 1, 3, 6, 12) | _(pendiente)_ |
| `PLAN_BILLING_CYCLES_SUPPORTED` | _(pendiente)_ |
| Manifiesto de firma del webhook (`data.id` de la query o del cuerpo; minúsculas) | _(pendiente)_ |
| Tópicos/`type` que llegan y su `action` | _(pendiente)_ |
| Estados de `preapproval` vistos (S8) | _(pendiente)_ |
| Estados de `authorized_payments` y `payment.status` (S11) | _(pendiente)_ |
| Política de reintentos (cantidad, intervalo, ¿cancela sola?) (S11) | _(pendiente)_ |
| Estados de pago tras devolución total/parcial y contracargo (S12) | _(pendiente)_ |
| Forma de `free_trial` en la respuesta (S15) | _(pendiente)_ |
| Importe mínimo / máximo en ARS (S16) | _(pendiente)_ |
| ¿Cobro de validación al autorizar con prueba? (S9) | _(pendiente)_ |
| URL de gestión de suscripciones del comprador (S14) | _(pendiente)_ |
| Marca de usuario de prueba en `/users/me` (S17) | _(pendiente)_ |

## 6. Notas de la corrida

_(Diferencias con la documentación de MP, errores inesperados con su salida redactada, pasos que no
se pudieron hacer y por qué.)_

## 7. Al terminar

1. Cortá `listen` y el túnel.
2. Cancelá con `mp cancel <id>` las `preapproval` de prueba que queden `authorized` (para que no
   sigan generando cobros de prueba).
3. Borrá `MP_SUBS_CAPTURE_DIR` (tiene los ids completos en `state.json` e `init-point-*.txt`) cuando
   el informe esté completo.
4. Desactivá o borrá la URL de notificaciones de la aplicación de prueba si el túnel ya no existe.
