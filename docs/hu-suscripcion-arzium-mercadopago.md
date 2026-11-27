# HU-029 · Suscripción mensual de Mercado Pago de Arzium con 7 días gratis

**Como** profesional dueña (`OWNER`) de un consultorio en Numa,
**quiero** autorizar desde el panel una suscripción mensual con Mercado Pago que empieza con 7 días
gratis,
**para que** pueda probar Numa sin pagar y, si sigo, el cobro mensual se haga solo, sin tener que
acordarme de pagar.

Origen: issue #72 (backlog SaaS). Depende de #67 (HU-024, cerrada) y #69 (HU-026, registro y
onboarding, de `imleticio`, abierta y sin afinar). Se coordina con #71 (HU-028, validada; 028a en
implementación) y #73 (HU-030, licencia y suspensión). Responsable: `senkuch4n`. Lote `lote-1-mp`
junto con HU-028. **Lleva migración** (issue con label `migración`): se implementa después de 028a.

Estado: **afinada, pendiente de validación del usuario.** Nada de lo que sigue está validado.

---

## 1. Contexto

### 1.1 Qué existe hoy

**Mercado Pago, solo para señas de pacientes (HU-009/HU-014, HU-023, HU-028a)**

- `Payment` está atado a un `Appointment` (`appointmentId` obligatorio, `kind` = seña). Es el cobro
  de un paciente a la profesional. No sirve para un cobro de Arzium a un consultorio y el issue pide
  no reutilizarlo.
- `MercadoPagoAccount`: cuenta de **la profesional** conectada por OAuth (aplicación "Numa", PKCE,
  tokens cifrados con `MERCADOPAGO_TOKEN_KEY`). 028a la pasa a una fila por consultorio y agrega
  `isPlatformMercadoPagoUserId()` en `packages/core`: si el `user_id` que vuelve del OAuth es el de
  `ARZIUM_MERCADOPAGO_USER_ID`, la conexión se rechaza. La variable **la define esta HU**; en 028a
  queda vacía en producción (SDD de 028a, §12).
- **Hoy la cuenta de señas conectada en `legacy-tenant` es la de Joel**, no la de Daiana. Si esa
  misma cuenta fuera la de cobro de Arzium, setear `ARZIUM_MERCADOPAGO_USER_ID` impediría a
  `legacy-tenant` reconectarla. Antes de activar la suscripción, `legacy-tenant` tiene que pasar a
  la cuenta de Mercado Pago de Daiana (ver D2).
- Webhook de señas `/api/webhooks/mercadopago`: verifica `x-signature` con
  `MERCADOPAGO_WEBHOOK_SECRET`, solo procesa `type=payment` y, desde 028a, identifica la cuenta por
  el `user_id` del cuerpo (un `user_id` desconocido se ignora como `unknown_account`). La
  verificación de firma vive en `packages/db/domain/mercadopago-signature.ts` y se puede reutilizar.
- Conciliación: el bot corre `reconcilePendingPayments` cada minuto como respaldo del webhook
  (`apps/bot/src/workers.ts`). Es el patrón a copiar para no depender solo de webhooks.
- SDK `mercadopago` ^3.6.1 en `packages/db`: ya trae los clientes `PreApprovalPlan`
  (`/preapproval_plan`), `PreApproval` (`/preapproval`, con `external_reference`, `payer_email`,
  `init_point`, `next_payment_date`, `status`) e `Invoice` (`/authorized_payments`, los cobros
  de cada mes). **Ningún código del repo los usa todavía.**

**Consultorios y acceso (HU-024, HU-025)**

- `Tenant` + `TenantMembership` con `TenantRole` `OWNER`/`STAFF`. El panel solo deja entrar a
  `legacy-tenant` (`ENABLED_TENANT_IDS` en `apps/web/src/lib/tenant-context.ts`); el candado se
  saca en 025c.
- No hay ningún modelo de suscripción, licencia, prueba gratis ni estado de cuenta del consultorio.
  No hay rol de plataforma de Arzium todavía (025d).
- Hoy hay **un solo consultorio en producción** (`legacy-tenant`, Lic. Daiana Ponce, sin pacientes
  reales todavía).

**Lo que hacen las HU vecinas (para marcar límites)**

| HU | Qué hace | Relación con esta HU |
|---|---|---|
| HU-026 (#69, Leo) | Registro, alta del consultorio con `OWNER`, onboarding en estado `PENDING` hasta que MP confirme. | Lleva a la `OWNER` a la pantalla de esta HU. El registro no da prueba ni licencia por sí solo. |
| HU-028 (#71) | Cuenta de MP **de señas** por consultorio; rechaza la cuenta de Arzium como cuenta de señas. | Esta HU define y usa la cuenta de cobro de Arzium, separada. |
| HU-030 (#73) | `getTenantAccess`, gracia, suspensión, reactivación, avisos, pantalla "Mi suscripción". | Consume los hechos verificados que registra esta HU. **Esta HU no bloquea ni habilita el uso del panel o del bot.** |
| HU-031 (#74) | QA de punta a punta, observabilidad, lanzamiento; cobros reales en producción solo con aprobación explícita. | Esta HU deja los cobros de producción apagados por defecto. |

### 1.2 Qué es lo nuevo

1. Una **cuenta y credenciales de Mercado Pago de Arzium**, propias del cobro SaaS, que nunca se
   mezclan con las cuentas de señas de los consultorios.
2. Un **plan mensual** con importe y prueba de 7 días definidos por el servidor (nunca por el
   navegador).
3. Modelos propios: suscripción del consultorio, cobros de la suscripción y log de eventos.
4. La pantalla donde la `OWNER` autoriza la suscripción, vuelve de Mercado Pago y ve el estado.
5. Un **webhook dedicado** a suscripciones y una **conciliación periódica** que consulta MP.
6. El registro de cada cobro mensual (aprobado, rechazado, reintentado, devuelto, contracargo) y del
   período pagado que deriva de él.

### 1.3 Lo que se sabe y lo que no de la API de Mercado Pago

Fuente: tipos del SDK instalado (`node_modules/mercadopago/dist/clients/preApproval*`, `invoice`)
y los enlaces de documentación del issue. **No se pudo consultar la documentación oficial desde
este afinado**; todo lo que no sale del SDK es un **supuesto** y se confirma en la entrega 029a.

| Tema | Lo que se sabe | Estado |
|---|---|---|
| Plan con prueba | `preapproval_plan.auto_recurring.free_trial = { frequency, frequency_type, first_invoice_offset? }`. | Confirmado (SDK). |
| Suscripción sin plan | `preapproval` acepta `auto_recurring`, `external_reference`, `payer_email`, `back_url`, `status` y devuelve `init_point`. El SDK define `AutoRecurringWithFreeTrial`. | Campos confirmados (SDK). Que la prueba gratis funcione **sin plan** es supuesto. |
| `external_reference` con el plan | Con el `init_point` del plan, la persona se suscribe en MP y **no** se puede fijar un `external_reference` por consultorio; para fijarlo hay que crear la `preapproval` por API, y con plan eso requiere `card_token_id` (formulario de tarjeta propio con Bricks). | **Supuesto** (conocimiento previo, no verificado). Decide el flujo (D4). |
| `notification_url` | La `preapproval` no tiene `notification_url` por pedido (el SDK no lo expone): las notificaciones de suscripciones salen de la URL configurada en la **aplicación** ("Tus integraciones"). | Supuesto fuerte. Implica que la URL es por aplicación (D3). |
| Tópicos | `subscription_preapproval`, `subscription_preapproval_plan`, `subscription_authorized_payment` y `payment` para el pago subyacente. | Supuesto. |
| Firma | Mismo esquema `x-signature` (`ts`, `v1`, HMAC con la clave secreta de la aplicación). | Supuesto (igual que señas). |
| Cobros mensuales | `/authorized_payments` con estados como `scheduled`, `processed`, `recycling` (reintento). El pago real tiene `status` `approved`/`rejected`/`pending`. | Confirmado (SDK). Política de reintentos de MP (cuántos, cada cuánto, si cancela sola): supuesto. |
| `payer_email` | MP exige que coincida con la cuenta de MP con la que paga la persona (si no, error). | Supuesto. Afecta la UX (D8). |
| Sandbox | Requiere usuarios de prueba (vendedor y comprador), no se mezclan cuentas reales y de prueba; las renovaciones no se pueden "adelantar" en el tiempo. Se puede probar con un plan de frecuencia en días. | Supuesto. |
| Cobro de validación | Al autorizar con tarjeta durante la prueba, MP podría hacer un cobro de validación chico y devolverlo. | Supuesto. Si pasa, hay que avisarlo en la UX. |

---

## 2. Criterios de aceptación

```gherkin
Feature: Autorizar la suscripción mensual con 7 días gratis

  Background:
    Given el cobro de suscripciones de Arzium está habilitado en este ambiente
    And existe el plan mensual configurado por el servidor con su importe y 7 días de prueba
    And la usuaria es OWNER del consultorio A

  Scenario: La OWNER empieza la suscripción
    Given el consultorio A no tiene suscripción
    When la OWNER toca "Empezar prueba gratis" en la pantalla Suscripción
    Then el servidor crea una suscripción del consultorio A en estado PENDING
    And la redirige al checkout de Mercado Pago de la cuenta de Arzium
    And el importe y la prueba que ve en Mercado Pago son los del plan del servidor, no datos del navegador

  Scenario: Volver de Mercado Pago no habilita nada por sí solo
    Given la OWNER vuelve de Mercado Pago con parámetros en la URL que dicen "authorized"
    When el servidor todavía no confirmó la autorización consultando la API de Mercado Pago
    Then la suscripción sigue en PENDING
    And la pantalla muestra "Estamos confirmando tu suscripción con Mercado Pago"

  Scenario: Autorización verificada inicia la prueba
    Given la suscripción del consultorio A está en PENDING
    When el backend consulta la preapproval en Mercado Pago y está autorizada
    And pertenece a la cuenta de cobro de Arzium, con el importe, la moneda y la frecuencia del plan
    And su referencia corresponde a la suscripción del consultorio A
    Then la suscripción pasa a TRIALING
    And se registran la fecha de autorización, el fin de la prueba (7 días después) y la fecha del primer cobro que informa Mercado Pago

  Scenario: Autorización que no cierra no se acepta
    When la preapproval consultada tiene otro importe, otra moneda, otra frecuencia, otro cobrador o una referencia que no es de A
    Then la suscripción no cambia de estado
    And se registra el evento como rechazado con su motivo, sin datos de tarjeta

  Scenario: Checkout abandonado
    Given la OWNER abrió el checkout y no lo completó
    When vuelve a la pantalla Suscripción
    Then ve la suscripción PENDING con "Continuar en Mercado Pago" y "Empezar de nuevo"
    And no se crea una segunda suscripción activa para el consultorio A

  Scenario: Reintentos y doble clic no duplican
    When la OWNER toca "Empezar prueba gratis" dos veces o desde dos pestañas
    Then el consultorio A tiene como máximo una suscripción no terminada
    And en Mercado Pago no queda más de una autorización vigente para A

  Scenario: Solo la OWNER autoriza
    Given la usuaria es STAFF del consultorio A
    When abre la pantalla Suscripción
    Then ve el estado en modo lectura y no puede iniciar, retomar ni cancelar

  Scenario: Prueba gratis una sola vez
    Given el consultorio A ya usó su prueba gratis y canceló
    When la OWNER vuelve a suscribirse
    Then la nueva suscripción no tiene días gratis y el primer cobro es al autorizar

Feature: Cobros mensuales

  Scenario: Primer cobro aprobado
    Given la suscripción de A está en TRIALING
    When Mercado Pago informa un cobro de la suscripción y el backend lo consulta y está aprobado
    And el cobro es de la preapproval de A, con el importe y la moneda esperados
    Then se registra el cobro una sola vez
    And la suscripción pasa a ACTIVE con período pagado hasta el siguiente vencimiento

  Scenario: Renovación aprobada
    Given la suscripción de A está ACTIVE
    When se aprueba el cobro del mes siguiente
    Then el período pagado de A se extiende exactamente un mes, una sola vez

  Scenario: Cobro rechazado
    When Mercado Pago informa un cobro rechazado o en reintento
    Then se registra el cobro rechazado con el motivo que informa Mercado Pago
    And la suscripción pasa a PAST_DUE
    And el período pagado no se extiende

  Scenario: Cobro aprobado después de un rechazo
    Given la suscripción de A está en PAST_DUE
    When Mercado Pago aprueba un reintento
    Then la suscripción vuelve a ACTIVE y el período se extiende una sola vez

  Scenario: Devolución o contracargo
    Given un cobro aprobado de A extendió el período pagado
    When Mercado Pago informa que ese pago fue devuelto o tuvo un contracargo
    Then el cobro queda marcado como devuelto o en contracargo
    And el período que había dado ese cobro deja de contar como pagado

  Scenario: Un cobro solo afecta a su consultorio
    Given existen los consultorios A y B con suscripción
    When se aprueba un cobro de la suscripción de A
    Then cambia solo la suscripción y el período de A

Feature: Cancelación

  Scenario: La OWNER cancela desde Numa
    Given la suscripción de A está en TRIALING o ACTIVE
    When la OWNER confirma "Cancelar suscripción"
    Then el servidor cancela la preapproval en Mercado Pago y verifica que quedó cancelada
    And la suscripción pasa a CANCELED con la fecha de cancelación y el origen "panel"
    And no se hacen más cobros
    And se conserva hasta qué fecha estaba pagado (lo que hace con eso el acceso es de HU-030)

  Scenario: Cancelación desde Mercado Pago o por Mercado Pago
    When la preapproval de A aparece cancelada en Mercado Pago (la canceló la persona en su cuenta o la canceló MP)
    Then la suscripción de A pasa a CANCELED con origen "mercado_pago"

Feature: Webhook y conciliación

  Scenario: Firma inválida
    When llega una notificación al webhook de suscripciones con firma inválida
    Then responde 401 y no consulta ni cambia nada

  Scenario: Evento duplicado o fuera de orden
    When la misma notificación llega dos veces, o llega una vieja después de una nueva
    Then el resultado final es el que devuelve la API de Mercado Pago al consultar el recurso
    And no se duplica ningún cobro ni extensión de período

  Scenario: Se cae el webhook
    Given Mercado Pago no pudo entregar una notificación
    When corre la conciliación periódica
    Then la suscripción y sus cobros quedan iguales que si la notificación hubiera llegado

  Scenario: Webhooks separados
    When llega una notificación de una seña de paciente
    Then la procesa solo el webhook de señas
    And una notificación de la suscripción de Arzium nunca crea ni modifica un Payment de turno

Feature: Separación y seguridad

  Scenario: Credenciales separadas
    Then la suscripción usa solo las credenciales de Arzium
    And ninguna cuenta de señas de un consultorio puede ser la cuenta de cobro de Arzium
    And ningún cobro de suscripción se crea con la cuenta de señas de un consultorio

  Scenario: Sin datos sensibles
    Then no se guardan ni se loguean números de tarjeta, códigos de seguridad, tokens de tarjeta ni access tokens
    And el navegador nunca recibe credenciales de Arzium

  Scenario: Producción apagada por defecto
    Given el ambiente es producción y el cobro de suscripciones no fue habilitado explícitamente
    Then el botón "Empezar prueba gratis" no aparece y el endpoint responde que no está disponible

  Scenario: Verificación sin cobros reales
    Then autorización, prueba, primer cobro, renovación, rechazo, cancelación y conciliación se prueban en sandbox con usuarios de prueba o con mocks
    And ninguna prueba de desarrollo hace un cobro real
```

---

## 3. Datos que se registran

Nombres orientativos; el modelo exacto lo define el architect.

### 3.1 Plan (configuración del servidor)

| Dato | Obligatorio | Uso |
|---|---|---|
| Id del `preapproval_plan` en MP (si el flujo usa plan, D4) | según D4 | Checkout y validación. |
| Importe mensual y moneda (ARS) | sí | Lo que se cobra; se compara contra lo que devuelve MP. **Valor a definir (D1).** |
| Frecuencia (1 mes) y días de prueba (7) | sí | Validar la autorización; calcular el fin de la prueba. |
| Modo (prueba / producción) | sí | No mezclar recursos de sandbox y de producción. |
| Activo | sí | Permite retirar un plan sin borrarlo. |

### 3.2 Suscripción del consultorio

| Dato | Obligatorio | Uso |
|---|---|---|
| Consultorio | sí | A quién pertenece. Como máximo una suscripción no terminada por consultorio. |
| Usuaria que la inició (OWNER) | sí | Auditoría. |
| Estado (`PENDING`, `TRIALING`, `ACTIVE`, `PAST_DUE`, `CANCELED`) | sí | Hecho verificado contra MP; lo interpreta HU-030. `SUSPENDED` es de HU-030 (D6). |
| Referencia externa | sí | Valor opaco generado por el servidor (no el id del consultorio en claro), único; se manda como `external_reference`. |
| Id de la `preapproval` en MP | al autorizar (o al crear, según D4) | Consultas y deduplicación. Único. |
| `user_id` del cobrador | sí al verificar | Debe ser el de Arzium (`ARZIUM_MERCADOPAGO_USER_ID`). |
| Id del pagador en MP | no | Diagnóstico y control de "una prueba por pagador" si D7 lo pide. **No** el email completo salvo que D8 lo requiera. |
| Importe y moneda autorizados | sí | Comparación con el plan. |
| Con prueba gratis (sí/no) | sí | Una prueba por consultorio (D7). |
| Autorizada el | al autorizar | Inicio de la prueba. |
| Fin de la prueba | si tiene prueba | Autorización + 7 días. HU-030 lo usa para vencer la prueba. |
| Próximo cobro según MP | no | Lo que informa MP (`next_payment_date`); se muestra y se concilia. |
| Pagado hasta | no | Deriva de los cobros aprobados vigentes. HU-030 lo usa. |
| Cancelada el, origen (`panel` / `mercado_pago`) | si se cancela | Auditoría y UX. |
| Última sincronización con MP | sí | Conciliación y diagnóstico. |

### 3.3 Cobros de la suscripción

| Dato | Obligatorio | Uso |
|---|---|---|
| Suscripción y consultorio | sí | Pertenencia. |
| Id del cobro autorizado (`authorized_payment`) en MP | sí | Deduplicación (único). |
| Id del pago en MP | cuando exista | Devoluciones y contracargos. |
| Importe y moneda | sí | Validación contra el plan. |
| Estado (programado, aprobado, rechazado, en reintento, devuelto, contracargo) | sí | Período pagado y estado de la suscripción. |
| Motivo del rechazo (`status_detail`) | no | Diagnóstico y texto en la UX. |
| Fecha del cobro | sí | Historial. |
| Período que cubre (desde/hasta) | si aprobado | Extensión exacta e idempotente del acceso. |

### 3.4 Log de eventos

| Dato | Obligatorio | Uso |
|---|---|---|
| Origen (`webhook` / `conciliacion` / `panel`) | sí | Trazabilidad. |
| Tópico/tipo e id del recurso | sí | Qué se consultó. |
| `x-request-id` (si viene del webhook) | no | Deduplicar entregas repetidas. |
| Resultado (`aplicado`, `sin_cambios`, `ignorado`, `rechazado` + motivo) | sí | Diagnóstico. |
| Consultorio y suscripción (si se resolvieron) | no | Filtrar por consultorio. |
| Fecha | sí | Orden. |

Nunca se guarda: número de tarjeta, CVV, `card_token_id`, access tokens, ni el cuerpo crudo de MP
con datos del pagador. Se guarda un resumen.

---

## 4. Diseño UX

### 4.1 Dónde vive

- **Panel → Ajustes → Suscripción** (`/ajustes/suscripcion`), visible para miembros del
  consultorio; acciones solo para `OWNER`. Es la única pantalla de esta HU. HU-026 la usa como paso
  del onboarding y HU-030 la amplía como "Mi suscripción" (accesible incluso con el consultorio
  suspendido). Ver D9.
- No interviene el bot de WhatsApp. Los avisos de vencimiento, rechazo y suspensión son de HU-030.

### 4.2 Estados de la pantalla

Textos propuestos; `{precio}` y las fechas salen del servidor.

| Estado | Qué ve la OWNER | Acciones |
|---|---|---|
| Sin suscripción | **"Probá Numa gratis 7 días"**. "Después, {precio} por mes con Mercado Pago. Si cancelás antes del {fecha_fin_prueba}, no se te cobra nada." | **Empezar prueba gratis** |
| Sin suscripción, prueba ya usada | "Suscribite a Numa por {precio} por mes. El primer cobro se hace al autorizar." | **Suscribirme** |
| Volviendo de MP / confirmando | Spinner: "Estamos confirmando tu suscripción con Mercado Pago. Puede tardar unos segundos." (la pantalla consulta al servidor cada pocos segundos, hasta 1 minuto) | — |
| Confirmación demorada (pasó el minuto) | "Mercado Pago todavía no nos confirmó la autorización. Si la completaste, se va a ver acá en unos minutos." | **Actualizar** |
| `PENDING` (checkout sin completar) | "Empezaste la suscripción pero no terminaste de autorizarla en Mercado Pago." | **Continuar en Mercado Pago** · **Empezar de nuevo** |
| `TRIALING` | "Estás en la prueba gratis hasta el {fecha_fin_prueba}. El primer cobro de {precio} es el {fecha_primer_cobro}." | **Cancelar suscripción** |
| `ACTIVE` | "Suscripción activa. Próximo cobro: {precio} el {fecha}." + últimos cobros (fecha, importe, estado) | **Cancelar suscripción** |
| `PAST_DUE` | "No pudimos cobrar la suscripción ({motivo}). Mercado Pago lo vuelve a intentar. Revisá tu medio de pago en tu cuenta de Mercado Pago." | **Ir a Mercado Pago** (enlace a la gestión de suscripciones de la cuenta de MP; ver D10) |
| `CANCELED` | "Cancelaste la suscripción el {fecha}." (+ "Pagado hasta el {fecha}" si corresponde) | **Volver a suscribirme** |
| Cobro no habilitado en el ambiente | "La suscripción todavía no está disponible. Te avisamos cuando lo esté." | — |
| `STAFF` | Mismo estado, sin botones: "Solo la dueña del consultorio puede gestionar la suscripción." | — |

**Cancelar:** modal de confirmación: "¿Cancelar la suscripción? No se te va a cobrar más. {Si está
en prueba: 'La prueba termina el {fecha}.' / Si está activa: 'Tenés acceso pago hasta el
{fecha}.'}" → **Sí, cancelar** / **Volver**. (El texto del acceso depende de cómo lo resuelva
HU-030; ver D11.)

### 4.3 Errores y feedback

- MP no responde al crear o cancelar: toast "No pudimos conectar con Mercado Pago. Probá de nuevo en
  unos minutos." Nada cambia de estado.
- Cancelación que MP no confirma: "No pudimos confirmar la cancelación con Mercado Pago. Probá de
  nuevo; si sigue, escribinos a soporte." La suscripción no se marca `CANCELED` hasta que MP lo
  confirme.
- Doble clic: el botón se deshabilita mientras espera; el servidor además reutiliza la suscripción
  `PENDING` existente.
- Si MP hace un cobro de validación al autorizar (supuesto de 1.3), un texto aclaratorio debajo del
  botón; se confirma en 029a.
- Nunca se muestran datos de tarjeta ni ids técnicos de MP a la usuaria.

---

## 5. Fuera de alcance

- **Decidir el acceso** al panel, bot, IA, recordatorios y jobs según el estado; gracia, suspensión,
  reactivación y avisos de vencimiento o rechazo → **HU-030**. Esta HU solo registra hechos
  verificados y no bloquea nada.
- Registro de la profesional, alta del consultorio y onboarding → **HU-026**.
- Cuentas de MP de señas por consultorio → **HU-028**.
- Habilitar los cobros reales en producción y la prueba real controlada → **HU-031**.
- Varios planes, planes anuales, descuentos, cupones, cambio de plan, prorrateos.
- Cambiar el precio a suscripciones existentes (si hace falta, se hace por script con una HU aparte).
- Facturación fiscal (factura electrónica AFIP/ARCA) de los cobros de Arzium.
- Devoluciones iniciadas desde Numa: Arzium devuelve desde el panel de MP; Numa solo registra lo que
  MP informa.
- Consola de Arzium para ver todas las suscripciones (025d o posterior); en esta HU se consulta por
  base o script.
- Medios de pago que no sean los que MP permita para suscripciones (efectivo, transferencia).
- Emails propios de Numa sobre los cobros (MP ya manda los suyos).

---

## 6. Propuesta de corte en entregas

| Entrega | Contenido | Por qué |
|---|---|---|
| **029a · Prueba en sandbox** | Script (en `packages/db/scripts` o `apps/web/scripts`, sin tocar la base) que, con usuarios de prueba de MP, crea el plan, la autorización con prueba gratis, consulta la preapproval y los cobros, prueba la cancelación y captura los webhooks (con un túnel). Resultado: `docs/mp-suscripciones-sandbox.md` con lo que se confirmó y lo que no de la tabla 1.3. | Casi todo el diseño depende de supuestos sin verificar (D4, D8). Sin esto el architect diseña a ciegas. Sin migración. |
| **029b · Alta y autorización** | Migración (plan, suscripción, log); cuenta de Arzium por `.env`; pantalla Ajustes → Suscripción; crear/retomar checkout; verificación contra MP; `PENDING` → `TRIALING`; cancelación; webhook de suscripciones (solo `preapproval`); conciliación del estado en el bot; flag de habilitación. | Es lo que necesita HU-026 para el onboarding. |
| **029c · Cobros** | Modelo de cobros; tópico de cobros autorizados y pagos; primer cobro, renovación, rechazo y reintento (`PAST_DUE`), devolución y contracargo; período pagado; conciliación de cobros. | Es la parte que mueve plata y la que más usa HU-030. Se revisa sola. |

Orden: 029a → 029b → 029c. 029b y 029c tocan `schema.prisma`: van después de 028a (una migración en
`implementando` a la vez).

---

## 7. Notas de implementación

- Lógica pura (mapeo de estados de MP a estados propios, validación de la preapproval contra el
  plan, cálculo del fin de la prueba y del período pagado) → `packages/core`, con tests.
- Operaciones sobre la base usadas por web y bot (crear/retomar, sincronizar una suscripción,
  sincronizar un cobro, conciliar) → módulo nuevo en `packages/db/domain` (p. ej.
  `subscriptions.ts`), separado de `payments.ts` y `mercadopagoAccount.ts`.
- Webhook nuevo en `apps/web/src/app/api/webhooks/` (p. ej. `mercadopago-suscripciones`), con
  secreto propio; reutiliza `verifyMercadoPagoSignature`. Responde rápido y procesa después, como el
  de señas. Siempre consulta el recurso en MP; el cuerpo de la notificación solo dice qué consultar.
- El webhook de señas de 028a ya ignora `user_id` desconocidos: si un pago de la suscripción
  llegara ahí, termina como `unknown_account`. Conviene que además ignore explícitamente el
  `user_id` de Arzium.
- Conciliación en `apps/bot/src/workers.ts` (cron propio, aislado con `try/catch` por suscripción),
  sobre suscripciones no terminadas. Frecuencia: la propone el architect.
- Concurrencia: webhook y conciliación serializados por suscripción (lock de fila o advisory lock),
  como `syncMercadoPagoPayment`.
- Variables nuevas (orientativas): `ARZIUM_MERCADOPAGO_USER_ID` (ya prevista por 028a),
  `ARZIUM_MERCADOPAGO_ACCESS_TOKEN`, `ARZIUM_MERCADOPAGO_WEBHOOK_SECRET`, flag de habilitación del
  cobro. Las credenciales de Arzium no se guardan en la base.
- Pruebas: todo con mocks de MP en `vitest`; sandbox solo como verificación manual del usuario.
  Ninguna verificación del implementer hace llamadas reales a MP ni cobros.
- Antes de setear `ARZIUM_MERCADOPAGO_USER_ID` en producción, `legacy-tenant` tiene que estar
  conectado a una cuenta de señas que no sea la de Arzium (SDD 028a §12, D2).

---

## 8. Dudas para validar con el usuario

**D1. Precio y moneda.** ¿Cuánto cuesta el plan mensual? ¿En ARS? ¿Se cobra con o sin IVA
incluido? **Recomendación:** un único importe en ARS, configurado por variable de entorno o tabla
de plan, sin IVA discriminado en esta HU. **El número lo tenés que definir vos; no se inventa.**

**D2. ¿Qué cuenta de Mercado Pago es la de Arzium y qué pasa con la de `legacy-tenant`?** Hoy la
cuenta de señas de `legacy-tenant` es la de Joel. Opciones: (a) cuenta nueva de Arzium (empresa o
monotributo de Arzium) para cobrar, y Daiana conecta su propia cuenta para señas; (b) la cuenta de
Joel pasa a ser la de cobro de Arzium, y Daiana conecta la suya para señas; (c) por ahora la misma
cuenta para todo. **Recomendación: (a)**, o (b) si no hay cuenta de Arzium todavía. En los dos
casos, Daiana conecta su cuenta para señas **antes** de setear `ARZIUM_MERCADOPAGO_USER_ID` en
producción. (c) contradice HU-028 (la cuenta de Arzium no puede ser cuenta de señas).

**D3. ¿Aplicación de MP propia para el cobro de Arzium o la misma "Numa"?** Las notificaciones de
suscripciones salen de la URL configurada en la aplicación (supuesto de 1.3). Opciones: (a)
aplicación nueva en la cuenta de Arzium, con su access token, su clave secreta de webhook y su URL
apuntando al webhook de suscripciones; (b) la misma aplicación "Numa", con un router en un único
webhook. **Recomendación: (a).** Separa credenciales y webhooks como pide el issue y no cambia la
configuración que ya usan las señas.

**D4. Flujo de autorización.** Opciones (se confirman en 029a):
(a) **plan + `init_point` del plan**: la persona se suscribe en MP; no hay `external_reference` por
consultorio (supuesto) y hay que vincular la autorización al consultorio por otra vía (búsqueda por
plan y pagador), lo que es frágil;
(b) **plan + preapproval por API con tarjeta**: formulario de tarjeta de MP (Bricks) embebido en
Numa, con `external_reference` del consultorio; la tarjeta no pasa por el servidor, pero suma
front;
(c) **preapproval sin plan, `status: pending`, con `init_point`**: el servidor fija importe, prueba
y `external_reference`, y la persona autoriza en MP.
**Recomendación: (c) si 029a confirma que la prueba gratis funciona sin plan; si no, (b).**
Descartar (a) salvo que MP sí deje fijar la referencia.

**D5. ¿Quién puede autorizar y cancelar?** **Recomendación:** solo la `OWNER`; `STAFF` ve el
estado. El soporte de Arzium (025d) no autoriza ni cancela desde el panel del consultorio.

**D6. Límite de estados con HU-030.** **Recomendación:** esta HU mueve `PENDING`, `TRIALING`,
`ACTIVE`, `PAST_DUE` y `CANCELED` solo a partir de lo que confirma MP; los cambios por tiempo (prueba
vencida sin cobro, fin de la gracia, `SUSPENDED`) y lo que se permite en cada estado son de HU-030.
¿De acuerdo?

**D7. ¿Prueba gratis una vez por qué?** (a) Por consultorio; (b) por consultorio y por usuaria
`OWNER`; (c) además por cuenta de MP pagadora. **Recomendación: (b).** (c) solo si 029a confirma
que MP devuelve un id de pagador estable.

**D8. Email del pagador.** Si MP exige que `payer_email` sea el de la cuenta de MP que paga (supuesto),
el email de Google de la login puede no coincidir. Opciones: (a) pedir el email de MP en la pantalla,
precargado con el de la login; (b) usar siempre el de la login; (c) no mandarlo, si 029a confirma que
no es obligatorio. **Recomendación: (c) si se puede; si no, (a).**

**D9. Pantalla: ¿esta HU hace la pantalla y HU-030 la amplía?** **Recomendación: sí.** Ajustes →
Suscripción con lo mínimo de 4.2; HU-030 la convierte en "Mi suscripción" accesible con el
consultorio suspendido. Hay que avisarle a Leo (HU-026) la ruta para el onboarding.

**D10. Cambio de tarjeta en `PAST_DUE`.** (a) La persona la cambia en su cuenta de MP (enlace);
(b) Numa ofrece cambiar el medio de pago (requiere Bricks y `PUT /preapproval`). **Recomendación:
(a)** en esta HU, si 029a confirma que MP lo permite desde la cuenta del pagador.

**D11. ¿Qué pasa al cancelar?** Se corta el cobro. ¿Se conserva el acceso hasta el fin del período
ya pagado (o hasta el fin de la prueba)? **Recomendación: sí**, como propone HU-030; esta HU solo
guarda "pagado hasta" y "fin de la prueba", y HU-030 aplica la regla. Si en la prueba cancela, ¿sigue
la prueba hasta el día 7? Recomendación: sí.

**D12. Devolución o contracargo.** **Recomendación:** el cobro devuelto deja de contar y el período
que había dado se descuenta; HU-030 decide si eso suspende enseguida o entra en gracia. ¿Una
devolución parcial cuenta igual? Recomendación: solo la devolución total descuenta el período.

**D13. `legacy-tenant` (Daiana).** ¿Daiana pasa por la suscripción (y su prueba de 7 días) o queda
exenta/bonificada? **Recomendación:** que quede exenta por ahora (sin suscripción, y HU-030 la trata
como bonificada) hasta que decidas cuándo empieza a pagar. Es decisión comercial tuya.

**D14. Habilitación por ambiente.** **Recomendación:** flag de entorno apagado por defecto; en
desarrollo apunta a sandbox; en producción solo se prende con la aprobación de HU-031. ¿De acuerdo?

**D15. Corte en entregas.** ¿Va el corte 029a → 029b → 029c de la sección 6? En especial: ¿te
parece bien que 029a (prueba en sandbox con usuarios de prueba) la hagas vos o la haga un agente con
credenciales de prueba que le pases? Requiere crear usuarios de prueba en la cuenta de Arzium (D2) y
un túnel para recibir webhooks.

---

## Resoluciones (validadas por el usuario, 2026-11-25)

Palabras del usuario: "el plan sale por defecto 60.000 pesos argentinos, mi idea es que la persona
pueda darse de baja y alta, aunque nos gustaria poder ofrecer el plan por ejemplo de 1 mes gratis y
despues abona, plan anual con cierto descuento, o pack de 3 meses. despues a todas acepto todas las
recomendadas".

- **D1 · Precio:** plan mensual por defecto **$60.000 ARS** (sin IVA discriminado, según la
  recomendación).
- **Baja y alta:** la persona puede cancelar y volver a suscribirse cuando quiera (re-alta sobre el
  mismo consultorio, sin perder datos). La prueba gratis sigue valiendo una sola vez (D7b): una
  re-alta no da otra prueba salvo que Arzium le asigne una promoción.
- **Varios planes (requisito nuevo):** el modelo de planes no puede quedar atado a "mensual con 7
  días". Cada plan define importe en ARS, período de cobro (mensual, trimestral, anual) y días o
  meses de prueba. Ejemplos que Arzium quiere poder ofrecer: **1 mes gratis y después abona**,
  **plan anual con descuento**, **pack de 3 meses**. En esta HU se lanza el mensual de $60.000 con
  7 días gratis; los demás deben poder darse de alta como planes sin cambiar código. 029a confirma
  si MP soporta frecuencia de 3 y 12 meses y pruebas de 1 mes en `preapproval`; si el "pack de 3
  meses" resulta ser un pago único y no una suscripción, se anota como supuesto y se decide en la
  SDD. Quién asigna una promoción a un consultorio (Arzium, por script) y la pantalla para elegir
  plan quedan para el architect/HU-030 si no entran en 029b.
- **D2–D15: se aceptan todas las recomendaciones.**
- **Onboarding (HU-026) con el cobro apagado (Joel, 2026-11-25):** los consultorios nuevos se
  habilitan sin suscripción mientras el cobro esté apagado. Contrato en el anexo de la SDD
  (`getTenantSubscriptionGate`).
