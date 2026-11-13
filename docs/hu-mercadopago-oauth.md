# HU-023: Conectar la cuenta de Mercado Pago de la profesional (OAuth)

**Como** nutricionista (Lic. Daiana Ponce),
**quiero** autorizar a NutriBot a cobrar en mi nombre desde mi propia cuenta de Mercado Pago, con
el botón oficial de "vincular cuenta" y sin pasarle a nadie mis credenciales,
**para que** el dinero de las señas que pagan mis pacientes me llegue directamente a mí.

Origen: borrador de Joel: "Necesito que la licenciada nos otorgue el permiso para cobrar en su
nombre así la plata le llega a ella, sin pedirle sus credenciales." Issue #53. Rama
`feat/HU-023-mercadopago-oauth`.

---

## Contexto

### Qué existe hoy

- **Seña por Mercado Pago al reservar por WhatsApp** (commits `d232be6`, `85ae40f`, `51a4cec`,
  PR #17; HU-009/HU-014). Toda la lógica vive en `packages/db/domain/payments.ts`:
  - `mercadoPagoClient()` arma el cliente del SDK con **un único**
    `MERCADOPAGO_ACCESS_TOKEN` del `.env`. Si falta, tira `Falta MERCADOPAGO_ACCESS_TOKEN.`
  - `createDepositCheckout(appointmentId)`: crea el `Payment` (PENDING), crea la `Preference` con
    `external_reference = Payment.id`, `notification_url = MERCADOPAGO_NOTIFICATION_URL`,
    vencimiento a 15 min y `back_urls = MERCADOPAGO_RETURN_URL`. Si algo falla, cancela el turno
    `AWAITING_PAYMENT` y sus pagos pendientes, y relanza el error.
  - `syncMercadoPagoPayment(paymentId)`: consulta el pago en MP (`Payment.get`) con el mismo
    token, actualiza el `Payment` y, si se aprobó la seña, confirma el turno y encola la
    confirmación al paciente y la alerta a la profesional.
  - `reconcilePendingPayments()`: el bot la corre cada minuto (`apps/bot/src/workers.ts`) como
    respaldo del webhook: busca por `external_reference` con `Payment.search`, con el mismo token.
  - `expireStalePendingPayments()`: libera las reservas sin pagar a los 15 min.
- **Quién llama:** solo el bot (`apps/bot/src/conversation.ts`, al confirmar una reserva de un
  servicio con `requiresDeposit`). Si `createDepositCheckout` falla, el paciente recibe "Hubo un
  problema al reservar. Escribí *menú* e intentá de nuevo." y el turno queda cancelado.
- **Webhook:** `apps/web/src/app/api/webhooks/mercadopago/route.ts` valida `x-signature` con
  `MERCADOPAGO_WEBHOOK_SECRET` (clave secreta de **la aplicación** de MP, no del vendedor) y
  después llama a `handleMercadoPagoWebhook` → `syncMercadoPagoPayment`.
- **Modelo `Payment`** (`schema.prisma`): `provider` (`mercadopago` | `manual`), `externalId`,
  `preferenceId`, `checkoutUrl`, `status`, `amount`, `paidAt`. **No registra con qué cuenta de MP
  se creó** el cobro.
- **Modelo `Professional`** (id 1, único): no tiene nada de Mercado Pago. Tiene el antecedente de
  Google Calendar: `googleRefreshToken` / `googleSyncError`, con estado "Conectado / No
  conectado", botón Conectar/Reconectar y "Desconectar" en `/ajustes?tab=google`
  (`page.tsx`, `google-calendar-form.tsx`, `disconnectGoogleAction`). Ese refresh token hoy se
  guarda **en texto plano**.
- **Ajustes** (`apps/web/src/app/(panel)/ajustes/ajustes-tabs.tsx`): secciones `general`,
  `whatsapp`, `google`, `pdf` en `?tab=`. Los textos salen de `SETTINGS_TEXT` en
  `packages/core`.
- **Pantalla Pagos** (`/pagos`): lista pagos pendientes y aprobados (incluye los manuales).
- **Script de prueba** `apps/bot/scripts/test-mercadopago-sandbox.ts`: corre el flujo con el
  token del `.env` y exige `MERCADOPAGO_SANDBOX`.

### El problema

La prueba real del 2026-11-12 en producción (VPS) funcionó de punta a punta (turno → seña de
$100 → pago → webhook → turno CONFIRMED), **pero el dinero lo cobró la cuenta de Leo**, que es la
dueña del `MERCADOPAGO_ACCESS_TOKEN`. Para que la plata le llegue a la Lic. Ponce sin pedirle
sus credenciales, hay que usar el **OAuth oficial de Mercado Pago ("vinculación de cuentas")**:
la aplicación de MP es del equipo y la profesional autoriza a esa aplicación a operar en su
nombre. Con el `access_token` que devuelve MP, las preferencias y los pagos quedan a nombre de
ella.

### Qué es nuevo

1. Una sección "Mercado Pago" en Ajustes para conectar, ver el estado y desconectar la cuenta.
2. El flujo OAuth: redirección a MP, callback con validación de `state`, canje del `code`.
3. Guardar en la base, **cifrados**, los tokens de la profesional (access + refresh), con los
   datos visibles de la cuenta (user_id, nickname, email) y el vencimiento → **migración**.
4. `payments.ts` usa el token de la cuenta vinculada (en lugar del `.env`) para crear
   preferencias, consultar y buscar pagos.
5. Renovación del token antes de que venza (180 días) y avisos si falla o si la profesional
   revoca el permiso desde Mercado Pago.

### Datos de la doc de Mercado Pago (confirmados)

Fuente: https://www.mercadopago.com.ar/developers/es/docs/security/oauth/creation

- Autorización: `https://auth.mercadopago.com/authorization?client_id=…&response_type=code&platform_id=mp&state=<aleatorio>&redirect_uri=<exacta>`.
  PKCE (S256) es opcional si se habilita en la aplicación.
- Canje: `POST https://api.mercadopago.com/oauth/token` con JSON `{client_id, client_secret,
  code, grant_type: "authorization_code", redirect_uri}` (+ `code_verifier` con PKCE). El `code`
  vale 10 minutos.
- El `access_token` vale 180 días. Se renueva con `grant_type: "refresh_token"`.
- La `redirect_uri` tiene que coincidir exactamente con la configurada en la aplicación. Los datos
  extra viajan en `state`.

---

## Criterios de aceptación

```gherkin
Feature: Vincular la cuenta de Mercado Pago de la profesional

  Background:
    Given la aplicación de Mercado Pago del equipo está configurada en el entorno
      (client_id, client_secret, redirect_uri y clave secreta del webhook)
    And la profesional inició sesión en el panel

  # --- Conexión ---

  Scenario: Ver el estado sin cuenta vinculada
    When abre Ajustes en la sección "Mercado Pago"
    Then ve el estado "No conectada"
    And ve una explicación corta de para qué sirve (las señas se cobran en su cuenta)
    And ve el botón "Conectar Mercado Pago"

  Scenario: Conectar la cuenta
    Given no hay cuenta vinculada
    When toca "Conectar Mercado Pago"
    Then el panel genera un state aleatorio de un solo uso, ligado a su sesión, con vencimiento
    And la redirige a la pantalla de autorización de Mercado Pago
    When inicia sesión en Mercado Pago y autoriza
    Then Mercado Pago vuelve al callback del panel con code y state
    And el panel valida el state, canjea el code por access_token y refresh_token
    And guarda los tokens cifrados, el user_id de Mercado Pago, el vencimiento y la fecha de conexión
    And obtiene y guarda el nickname y el email de la cuenta
    And la devuelve a Ajustes → Mercado Pago con el mensaje "Cuenta de Mercado Pago conectada"
    And el estado muestra "Conectada" con el nickname, el email y el número de usuario de Mercado Pago

  Scenario: Solo la profesional logueada puede conectar
    Given una persona sin sesión en el panel
    When abre la URL de inicio de la conexión o la del callback
    Then es redirigida al login y no se guarda nada

  Scenario: State inválido, vencido o reutilizado (anti-CSRF)
    When el callback llega con un state que no generó el panel, ya usado o vencido
    Then no se canjea el code ni se guarda nada
    And vuelve a Ajustes → Mercado Pago con el error "No pudimos verificar la conexión. Probá de nuevo."

  Scenario: La profesional rechaza la autorización
    When en Mercado Pago toca "Cancelar" o no autoriza
    And el callback llega sin code (con error)
    Then no se guarda nada y la cuenta previa (si había) sigue igual
    And ve el aviso "No se conectó la cuenta: la autorización fue cancelada en Mercado Pago."

  Scenario: El code venció o Mercado Pago rechaza el canje
    When el canje del code falla (code vencido, ya usado, o redirect_uri que no coincide)
    Then no se guarda nada y la cuenta previa (si había) sigue igual
    And ve el error "Mercado Pago rechazó la conexión. Probá de nuevo; si se repite, avisá al soporte."
    And en el log del servidor queda el código de error de Mercado Pago, sin tokens ni client_secret

  Scenario: Reconectar o cambiar de cuenta
    Given hay una cuenta vinculada
    When toca "Reconectar" y autoriza (la misma u otra cuenta de Mercado Pago)
    Then los tokens nuevos reemplazan a los anteriores
    And si el user_id cambió, el estado muestra la cuenta nueva
    And las señas pendientes creadas con la cuenta anterior se siguen consultando con esa cuenta (ver D6)

  Scenario: Desconectar
    Given hay una cuenta vinculada
    When toca "Desconectar" y confirma
    Then se borran los tokens de la base
    And el estado pasa a "No conectada"
    And las reservas nuevas de servicios con seña se comportan como "sin cuenta vinculada" (ver D3)

  # --- Cobro con la cuenta vinculada ---

  Scenario: La seña se cobra en la cuenta de la profesional
    Given hay una cuenta vinculada con token vigente
    And un paciente reserva por WhatsApp un servicio con seña
    When el bot genera el link de pago
    Then la preferencia se crea con el access_token de la cuenta vinculada
    And el pago aprobado se acredita en la cuenta de Mercado Pago de la profesional
    And el Payment queda asociado al user_id de Mercado Pago con el que se creó

  Scenario: El webhook confirma la seña cobrada con la cuenta vinculada
    Given una seña PENDING creada con la cuenta vinculada
    When llega la notificación de Mercado Pago con x-signature válida
    Then la firma se valida con la clave secreta de la aplicación (como hoy)
    And el pago se consulta con el access_token de la cuenta con la que se creó ese Payment
    And si está aprobado, el turno pasa a CONFIRMED y se encolan los mensajes de siempre

  Scenario: La conciliación periódica usa la cuenta correcta
    Given hay señas PENDING
    When corre la conciliación del bot (cada minuto)
    Then cada pago se consulta y se busca con el token de la cuenta con la que se creó

  # --- Sin cuenta vinculada ---

  Scenario: Reserva de un servicio con seña sin cuenta vinculada (propuesta, ver D3)
    Given no hay cuenta vinculada
    And no hay token de respaldo habilitado en el entorno
    When un paciente intenta reservar por WhatsApp un servicio con seña
    Then el bot no crea el turno ni el link
    And le responde el mensaje "seña no disponible" (ver Diseño UX)
    And la profesional recibe una alerta por WhatsApp (como máximo una cada 24 h)

  Scenario: Aviso en el panel si hay servicios con seña y no hay cuenta
    Given hay al menos un servicio con seña activo
    And no hay cuenta vinculada (o el token está revocado o vencido)
    When la profesional abre el panel en Ajustes o en Servicios
    Then ve un aviso "Tenés servicios con seña pero Mercado Pago no está conectado" con un botón a Ajustes → Mercado Pago

  # --- Renovación y revocación ---

  Scenario: Renovación automática antes del vencimiento
    Given el access_token vence en menos de 30 días (umbral a definir, D4)
    When corre la tarea de renovación
    Then se pide un token nuevo con grant refresh_token
    And se guardan el access_token, el refresh_token nuevo y el vencimiento nuevo, cifrados
    And la renovación no se ejecuta dos veces a la vez (web y bot no se pisan)

  Scenario: La renovación falla o la profesional revocó el permiso
    Given la renovación o una llamada a Mercado Pago responde que el token es inválido o fue revocado
    Then la cuenta queda marcada con un error de conexión (fecha y motivo, sin datos sensibles)
    And en Ajustes → Mercado Pago el estado muestra "Hay que reconectar" con el motivo y el botón "Reconectar"
    And la profesional recibe por WhatsApp el aviso de reconexión (una sola vez por incidente)
    And las reservas con seña se comportan como "sin cuenta vinculada"

  Scenario: Reconectar limpia el error
    Given la cuenta tiene un error de conexión
    When reconecta con éxito
    Then el error se borra y el estado vuelve a "Conectada"

  # --- Seguridad ---

  Scenario: Los tokens nunca salen del servidor
    Then el access_token y el refresh_token se guardan cifrados con una clave del entorno
    And no se muestran en el panel, no viajan al navegador y no se escriben en logs
    And getProfessional() y las consultas generales de Professional no los leen
```

---

## Datos que se registran

| Dato | Obligatorio | Uso |
|---|---|---|
| user_id de Mercado Pago de la cuenta vinculada | Sí (si hay cuenta) | Identificar la cuenta; mostrarlo en Ajustes; asociar cada `Payment` a la cuenta que lo creó |
| access_token (cifrado) | Sí (si hay cuenta) | Crear preferencias, consultar y buscar pagos |
| refresh_token (cifrado) | Sí (si hay cuenta) | Renovar el access_token |
| Vencimiento del access_token | Sí (si hay cuenta) | Decidir cuándo renovar; mostrar "vence el…" (D9) |
| Nickname y email de la cuenta de MP | No (si MP no los devuelve, se muestra solo el user_id) | Mostrar qué cuenta está conectada |
| Fecha de conexión / última renovación | Sí (si hay cuenta) | Mostrar en Ajustes; diagnóstico |
| Error de conexión (motivo + fecha) | No | Estado "Hay que reconectar"; evitar avisos repetidos |
| Marca de "ya avisé a la profesional" por incidente | No | No mandar el mismo aviso de WhatsApp más de una vez |
| Ambiente (producción / prueba) | A definir (D8) | Evitar mezclar tokens de prueba y productivos |
| Cuenta de MP con la que se creó cada `Payment` (user_id del vendedor) | Sí, en los pagos nuevos de Mercado Pago | Consultar el pago con el token correcto; trazabilidad si se cambia de cuenta |
| Estado temporal del OAuth (`state`, y `code_verifier` si se usa PKCE) | Sí, mientras dura el flujo | Anti-CSRF; se descarta al usarse o a los pocos minutos |

Configuración en el entorno (`.env`, no en la base): `client_id` y `client_secret` de la
aplicación de MP del equipo, `redirect_uri` exacta (derivada del dominio público del panel), la
clave secreta del webhook (ya existe) y la **clave de cifrado** de los tokens. El cómo (clave
nueva o derivada de `AUTH_SECRET`, algoritmo, rotación) lo define el architect; el requisito es
que una copia de la base sola no alcance para usar los tokens.

---

## Diseño UX

### Panel → Ajustes → sección nueva "Mercado Pago" (`/ajustes?tab=mercadopago`)

Va como quinta sección del índice de Ajustes, con el mismo patrón que "Google Calendar"
(`GroupedList` con filas de estado, botón principal y "Desconectar"). Solo accesible con sesión
de la profesional.

**Sin cuenta:**

- Fila "Cuenta": `No conectada` (tono neutro; en tono de alerta si hay servicios con seña).
- Texto de ayuda: "Conectá tu cuenta de Mercado Pago para que las señas que pagan tus pacientes
  se acrediten directamente en tu cuenta. Vas a iniciar sesión en Mercado Pago; NutriBot nunca ve
  tu contraseña."
- Botón primario: **Conectar Mercado Pago**.

**Con cuenta:**

- Fila "Cuenta": `Conectada` (tono ok).
- Fila "Usuario": nickname (y email debajo, si lo hay).
- Fila "N.º de usuario de Mercado Pago": user_id.
- Fila "Conectada el": fecha. (Fila "Vence / se renueva el": D9.)
- Botón secundario **Reconectar** y botón **Desconectar** (con confirmación: "¿Desconectar
  Mercado Pago? Los pacientes no van a poder pagar señas hasta que vuelvas a conectar.").

**Con error (revocado / renovación fallida):**

- `Alert` tono danger arriba de la sección: "Mercado Pago se desconectó: {motivo legible}. Hasta
  que reconectes, los pacientes no pueden pagar señas." + botón **Reconectar**.

**Feedback al volver del callback** (banner en la sección, se descarta solo):

| Resultado | Mensaje |
|---|---|
| OK | "Cuenta de Mercado Pago conectada." |
| Rechazó en MP | "No se conectó la cuenta: la autorización fue cancelada en Mercado Pago." |
| State inválido/vencido | "No pudimos verificar la conexión. Probá de nuevo." |
| Canje rechazado / error de MP | "Mercado Pago rechazó la conexión. Probá de nuevo; si se repite, avisá al soporte." |
| Falta configuración (client_id, etc.) | "La conexión con Mercado Pago no está configurada en el servidor." (botón deshabilitado) |

**Aviso transversal:** si hay servicios con seña activos y no hay cuenta usable, un `Alert` en
`/servicios` (y en Ajustes) con enlace a Ajustes → Mercado Pago. En el formulario de servicio,
al activar "Requiere seña" sin cuenta vinculada, una nota debajo del switch con el mismo enlace
(no bloquea guardar).

### Bot de WhatsApp (mensajes propuestos, textuales)

**Al paciente**, si reserva un servicio con seña y no hay cuenta usable (propuesta de D3):

> No pude generar el link de pago de la seña en este momento. 😕
> Te aviso a la nutricionista para que te contacte y coordinen el turno. También podés escribir *menú* para ver otras opciones.

**A la profesional** (`PROFESSIONAL_ALERT`, a `phoneJid`), cuando un paciente no pudo reservar
por eso (máx. una cada 24 h):

> ⚠️ {nombre o teléfono} quiso reservar *{servicio}* pero no se pudo generar el link de la seña porque Mercado Pago no está conectado. Conectalo en el panel: Ajustes → Mercado Pago.

**A la profesional**, si la renovación falla o se revocó el permiso (una vez por incidente):

> ⚠️ Se desconectó tu cuenta de Mercado Pago en NutriBot, así que por ahora los pacientes no pueden pagar señas. Volvé a conectarla en el panel: Ajustes → Mercado Pago.

Si `phoneJid` no está cargado, solo queda el aviso del panel.

---

## Fuera de alcance

- **Comisión del marketplace** (`marketplace_fee`): no se cobra comisión al equipo. Las
  preferencias se crean sin fee.
- Varias profesionales / varias cuentas de MP a la vez: hay una sola `Professional` (id 1) y una
  sola cuenta vinculada.
- Cobros que no sean la seña de reservas por WhatsApp: links de pago desde el panel, pago del
  saldo, suscripciones, reembolsos y devoluciones desde el panel.
- Migrar o reasignar pagos ya aprobados de la cuenta de Leo: los pagos históricos quedan como
  están.
- Cambiar la validación de `x-signature` del webhook: sigue con la clave secreta de la
  aplicación.
- Crear o administrar la aplicación de MP (alta en el portal de developers, `redirect_uri`,
  PKCE): es configuración manual del equipo, documentada en el README.
- Cifrar retroactivamente el `googleRefreshToken` de Google Calendar (queda como mejora aparte,
  ver D11).
- Point / QR presencial y cualquier medio de cobro que no sea Checkout Pro.

---

## Notas de implementación

- **Migración** (`schema.prisma`): campos o modelo nuevo para la cuenta vinculada y columna
  nueva en `Payment` para la cuenta que lo creó (nullable: los pagos existentes no la tienen).
  Issue con label `migración`. Producción (VPS) aplica con `migrate deploy`.
- `payments.ts` deja de leer `MERCADOPAGO_ACCESS_TOKEN` directo: una función en
  `packages/db/domain` resuelve el token (de la cuenta vinculada, renovándolo si hace falta) y la
  usan web (webhook) y bot (checkout, conciliación). Revisar typecheck en los dos.
- La renovación puede correrla el cron del bot y/o hacerse al usar el token; tiene que ser
  segura frente a concurrencia (web y bot leen la misma fila) — D4.
- Los tokens van en un `select` aparte, como `signatureData` (fuera de `PROFESSIONAL_SELECT`).
- El callback del OAuth es una ruta del panel (`apps/web`), protegida por la sesión de Auth.js.
  La `redirect_uri` sale del dominio público del panel (hoy
  `https://169-58-151-56.sslip.io/...`; puede pasar a dominio propio, y hay que actualizarla en
  la aplicación de MP).
- **Cruce con HU-021 (#50, Leo):** HU-021 toca `payments.ts` (constante
  `DEPOSIT_AUTO_CANCEL_REASONS` en `packages/core`) y está aprobada pero sin PR/merge. Conviene
  que entre a `develop` antes de implementar esta HU, o coordinar el rebase. Poner
  `Depende de #50` en el issue si se decide esperar (D12).
- Pruebas: nunca pagos reales ni mensajes de WhatsApp reales; ver D8 para sandbox.

---

## Dudas para validar con el usuario

- **D1. Cuenta de Mercado Pago de la aplicación.** Hoy la aplicación (client_id/secret) es la de
  Leo. ¿Se queda así o se crea una aplicación a nombre del equipo / de Joel? La que se elija es la
  que figura en la pantalla de autorización de MP ("{app} quiere acceder a tu cuenta") y la dueña
  del webhook. ¿Qué nombre ve la profesional?
- **D2. ¿PKCE sí o no?** Es opcional. Propuesta: sí (S256), es una capa extra barata. Requiere
  habilitarlo en la aplicación de MP.
- **D3. ¿Qué pasa sin cuenta vinculada?** Opciones:
  - (a) **Propuesta:** en producción, sin cuenta no se cobra seña: el bot no crea el turno,
    contesta el mensaje de "seña no disponible" y alerta a la profesional. El
    `MERCADOPAGO_ACCESS_TOKEN` del `.env` queda solo como respaldo **explícito** para desarrollo
    (p. ej. con una variable que lo habilite), nunca implícito en producción, para que no vuelva a
    cobrar la cuenta de otra persona sin que nadie se dé cuenta.
  - (b) Fallback silencioso al token del `.env` (compatibilidad total; riesgo: cobra la cuenta
    equivocada).
  - (c) Sin cuenta, el servicio con seña se reserva **sin seña** (turno CONFIRMED directo).
  - (d) El bot oculta los servicios con seña del menú mientras no haya cuenta.
- **D4. Renovación:** ¿cron del bot (p. ej. una vez por día, renueva si faltan menos de 30 días)
  o al usar el token, o ambos? Propuesta: cron diario en el bot + renovación al usar si ya venció.
  ¿Umbral de 30 días está bien?
- **D5. Avisos por WhatsApp a la profesional:** ¿quiere los dos avisos propuestos (paciente que no
  pudo reservar por falta de cuenta, y cuenta desconectada)? ¿Con el tope de uno cada 24 h / uno
  por incidente alcanza? ¿Aviso preventivo antes del vencimiento si la renovación automática no
  pudo correr?
- **D6. Señas en curso al cambiar o desconectar la cuenta.** Propuesta: cada `Payment` guarda el
  user_id de la cuenta que lo creó. Si se reconecta la misma cuenta, se usa el token nuevo. Si se
  cambia a otra cuenta o se desconecta, el token viejo ya no está, así que las señas PENDING de
  la cuenta anterior (como mucho 15 minutos de ventana) **se cancelan y el paciente recibe el
  aviso de seña vencida**. Alternativa: conservar los tokens viejos hasta que no queden pagos
  pendientes (más complejo). ¿Cuál?
- **D7. ¿Bloquear "Desconectar" si hay señas pendientes?** O solo advertir ("Hay N señas esperando
  pago; si desconectás se cancelan"). Propuesta: solo advertir.
- **D8. Pruebas sin plata real.** MP permite crear **usuarios de prueba** (vendedor y comprador) y
  usar el OAuth con la aplicación en modo prueba. Propuesta: en dev se vincula un usuario de
  prueba vendedor y se paga con un usuario de prueba comprador; el script
  `test-mercadopago-sandbox.ts` pasa a usar la cuenta vinculada. ¿Guardamos el ambiente
  (prueba/producción) de la cuenta vinculada para impedir usar un token de prueba en producción?
  ¿Quién crea los usuarios de prueba (desde qué cuenta de developers)?
- **D9. Qué se muestra en Ajustes:** ¿nickname + email + user_id alcanzan? ¿Mostrar "se renueva
  sola el {fecha}" o es ruido para ella?
- **D10. Clave de cifrado:** ¿variable nueva (p. ej. `MERCADOPAGO_TOKEN_KEY`) o derivada de
  `AUTH_SECRET`? Si se deriva de `AUTH_SECRET`, rotar `AUTH_SECRET` (que cierra sesiones) también
  invalidaría los tokens y obligaría a reconectar. Propuesta: variable nueva, decisión final del
  architect.
- **D11. ¿Cifrar también el `googleRefreshToken`** aprovechando la misma clave? Propuesta: no en
  esta HU (fuera de alcance), anotarlo como mejora.
- **D12. Orden con HU-021 (#50):** ¿esperamos a que Leo mergee HU-021 a `develop` antes de
  implementar (y ponemos `Depende de #50`), o se implementa en paralelo y se resuelve en el
  rebase?
- **D13. Dominio y `redirect_uri`:** la `redirect_uri` registrada en MP tiene que ser exacta.
  ¿Se pasa a dominio propio antes de esta HU? Si cambia el dominio después, hay que actualizarla
  en la aplicación de MP (y `MERCADOPAGO_NOTIFICATION_URL` / `MERCADOPAGO_RETURN_URL`). ¿Hace falta
  registrar también una de desarrollo (ngrok) o se prueba directamente en el VPS?
- **D14. Puesta en marcha con la licenciada:** ¿ella hace la conexión sola desde el panel, o la
  acompañan? ¿Tiene cuenta de Mercado Pago a su nombre (persona física/monotributo) lista para
  recibir cobros? Si no, la HU se puede implementar igual pero no se puede probar en real.

## Resoluciones (validadas por el usuario, 2026-11-12)

- **D1:** la aplicación de Mercado Pago se llama **"Numa"** (es lo que ve la profesional al autorizar).
- **D2:** PKCE sí (S256).
- **D3:** opción (a). En producción, sin cuenta vinculada no se cobra seña; el token del `.env` solo como respaldo explícito para desarrollo.
- **D4:** cron diario del bot (renueva si faltan < 30 días) + renovación al usar si ya venció.
- **D5:** los dos avisos por WhatsApp, con tope de uno cada 24 h / uno por incidente.
- **D6:** las señas PENDING de la cuenta anterior se cancelan con el aviso de seña vencida.
- **D7:** solo advertir, no bloquear "Desconectar".
- **D8:** usuarios de prueba de MP en dev; se guarda el ambiente de la cuenta vinculada para impedir un token de prueba en producción.
- **D9:** nickname + email; sin fecha de renovación.
- **D10:** variable nueva (`MERCADOPAGO_TOKEN_KEY`), decisión final del architect.
- **D11:** fuera de alcance.
- **D12:** en paralelo con HU-021 (#50); se resuelve en el rebase.
- **D13:** el dominio propio no es requisito; si cambia, se actualiza la redirect_uri en la app de MP.
- **D14:** la profesional tiene cuenta para conectar. Por ahora Joel conecta su propia cuenta para cobrar; después se pasa a la de ella.
