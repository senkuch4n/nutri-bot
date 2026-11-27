# HU-028 · Google Calendar, Mercado Pago de señas e IA por consultorio

**Como** nutricionista dueña de un consultorio en NutriBot,
**quiero** conectar mi propia cuenta de Mercado Pago, mi propio Google Calendar y tener mi propia
configuración y cupo de IA,
**para que** las señas me lleguen a mí, los turnos aparezcan solo en mi calendario y la IA que
atiende a mis pacientes trabaje solo con los datos de mi consultorio.

Origen: issue #71 (backlog SaaS). Depende de #67 (HU-024) y #68 (HU-025), mergeadas. Se coordina
con #70 (HU-027, WhatsApp por consultorio), #72 (HU-029, suscripción de Arzium) y #69 (HU-026,
registro y onboarding). Rama `feat/HU-028-integraciones-por-consultorio`. Lleva migración.

Estado: **afinada, pendiente de validación del usuario.** Nada de lo que sigue está validado.

---

## 1. Contexto

### 1.1 Qué existe hoy (después de HU-023, HU-024 y HU-025b-2)

**Mercado Pago de señas (HU-023, HU-025b-2)**

- `MercadoPagoAccount` es una **fila única** (`id Int @id @default(1)`, `tenantId String? @unique`).
  `packages/db/domain/mercadopagoAccount.ts` usa la constante `ACCOUNT_ID = 1` en todas las
  consultas (`{ id: 1, tenantId }`) y crea la fila de forma perezosa con
  `ensureAccountRow` (`INSERT … ON CONFLICT DO NOTHING`).
- Consecuencia (decisión 1 de `progress/impl_HU-025b2.md`): otro consultorio ve "No conectada", no
  obtiene credenciales y sus escrituras fallan con `MercadoPagoUnavailableError`; **no puede
  conectar su propia cuenta** porque la fila `id = 1` ya es de `legacy-tenant`.
- OAuth con PKCE, `state` de un solo uso (`MercadoPagoOAuthState`, sha256 del state, verifier
  cifrado), tokens cifrados con AES-256-GCM (`secretBox.ts`, clave `MERCADOPAGO_TOKEN_KEY`, AAD por
  campo), renovación antes de los 180 días, marca de errores (`revoked`, `refresh_failed`,
  `decrypt_failed`) y aviso de WhatsApp por incidente. El `state` se ata al **email de la sesión**
  (`sessionEmail`), no al `userId` ni al tenant (la SDD de HU-025, 5.3, lo deja para HU-028).
- `Payment.mercadopagoUserId` registra con qué cuenta de MP se creó cada seña; la conciliación
  consulta cada pago con la cuenta que lo creó.
- **Webhook** (`/api/webhooks/mercadopago`): firma `x-signature` con `MERCADOPAGO_WEBHOOK_SECRET`
  (clave de la aplicación "Numa", compartida por todas las profesionales). El tenant sale de
  `resolveMercadoPagoWebhookTenant()`, que lee **la fila única**: sin fila → `legacy-tenant`.
- Respaldo de desarrollo: sin cuenta vinculada y con `MERCADOPAGO_ACCESS_TOKEN` en el `.env`
  (nunca en producción), `getMercadoPagoCredentials` usa ese token para la instalación original.
- Crons del bot (`apps/bot/src/workers.ts`): conciliación, vencimiento de señas a 15 min y
  renovación del token, todos con `getConversationTenant()` (= `legacy-tenant`).

**Google Calendar**

- El refresh token vive **en texto plano** en `Professional.googleRefreshToken`, junto con
  `googleCalendarId` y `googleSyncError`.
- **No hay un flujo propio de conexión**: el login con Google pide el scope `calendar.events` con
  `prompt: "consent"` (`apps/web/src/auth.config.ts`), y el botón "Conectar" de
  `/ajustes?tab=google` hace un `signIn("google")`. En `auth.ts`, `maybeStoreCalendarToken` guarda
  el refresh token del login **solo** si quien entra es miembro de `legacy-tenant` y, además,
  `shouldStoreCalendarToken` lo permite (`GOOGLE_CALENDAR_OWNER_EMAIL`, o "no hay token / está
  fallando"). Siempre escribe la agenda legacy (`resolveLegacyCalendarScope`): es la excepción
  documentada del test `guard-coverage.test.ts` que HU-028 tiene que retirar.
- `syncGoogleCalendar()` (`packages/db/domain/gcal.ts`) sincroniza en una sola dirección
  (app → Google) los turnos con `needsGoogleSync`, **solo del consultorio original**. El bot lo
  corre en un cron.
- "Desconectar" (`disconnectGoogleAction`) borra el token del `Professional` del contexto; no
  revoca el permiso en Google ni toca los `googleEventId` ya guardados.

**IA**

- **IA del bot (HU-012, preguntas por WhatsApp, opción 5):** proveedor, modelo, clave y límites
  salen de variables de entorno **globales** (`BOT_AI_PROVIDER`, `BOT_AI_MODEL`,
  `API_KEY_IA_DEEPSEEK` / `API_KEY_IA_ANTHROPIC`, `BOT_AI_DAILY_PER_PATIENT`,
  `BOT_AI_DAILY_GLOBAL`, …) leídas por `resolveBotAiEnv` (`packages/core/src/bot-ai.ts`) y
  memoizadas en `apps/bot/src/ai/runtime.ts`. Producción usa DeepSeek.
  - Por consultorio ya existen el interruptor `Professional.botAiEnabled` y el texto
    `Professional.botAiInfo` ("Información para el asistente").
  - `BotAiQuestion` (registro de cada pregunta, con tokens, proveedor y modelo) **no tiene
    `tenantId`**. El tope diario "global" (`countBotAiQuestionsToday`) cuenta las preguntas **de
    todos los consultorios**: con dos consultorios, el uso de uno consume el cupo del otro.
  - Las tools de la IA (`runBotAiTool` en `packages/db/domain/botAi.ts`) leen
    `getProfessional()` (perfil legacy), `activeServices()` **sin filtro de tenant** y la
    disponibilidad de `LEGACY_TENANT_ID` fijo. Pasar estas tools al tenant de la conversación es
    alcance comprometido de **025c** ("IA del bot y `getProfessional()` del bot con el scope de la
    conversación"), que todavía no arrancó.
- **IA del panel:** el asistente (`/asistente`) y la IA de planes
  (`pacientes/[id]/planes/[planId]/ai-actions.ts`) usan `apps/web/src/lib/deepseek.ts` con
  `API_KEY_IA_DEEPSEEK` global. Desde 025b-2 sus tools y el contexto que arma el servidor son solo
  del consultorio del contexto (M8). **No tienen tope ni registro de uso.**

**Candados y hechos de producción (2026-11-25)**

- Un solo tenant (`legacy-tenant`), una fila de `MercadoPagoAccount` (`id = 1`) y una de
  `BotStatus`, ambas de `legacy-tenant`. La IA usa DeepSeek por env global.
- El panel solo deja entrar a `legacy-tenant` (`ENABLED_TENANT_IDS` en
  `apps/web/src/lib/tenant-context.ts`); el candado se retira en 025c. Hasta HU-027 el bot tiene un
  solo número y siempre resuelve `legacy-tenant`.
- Por eso, **en producción ningún segundo consultorio puede usar estas integraciones todavía**: los
  criterios de "dos consultorios" de esta HU se prueban con tests y probes contra una Postgres
  descartable, no con un segundo cliente real.

### 1.2 Por qué hace falta

Para vender NutriBot a otras nutricionistas, cada consultorio tiene que cobrar sus señas en su
cuenta de MP, ver sus turnos en su Google Calendar y tener su IA aislada (datos, configuración y
consumo). Hoy las tres integraciones asumen una sola instalación: la fila única de MP, el token de
calendario enganchado al login de la agenda legacy y los topes y la clave de IA globales.

### 1.3 Qué es lo nuevo

1. **Mercado Pago:** una cuenta de MP de señas **por consultorio** (fila por tenant), con el mismo
   OAuth/PKCE, cifrado, renovación y avisos de HU-023. El webhook, la conciliación, el vencimiento y
   la renovación encuentran la cuenta del consultorio correcto. El `state` del OAuth se ata a la
   persona (`userId`) y al consultorio.
2. **Google Calendar:** un **flujo de conexión propio**, separado del login, que guarda el refresh
   token **cifrado y por consultorio**. El login deja de pedir permiso de calendario. Se retiran
   `GOOGLE_CALENDAR_OWNER_EMAIL`, `maybeStoreCalendarToken` y el uso de
   `resolveLegacyCalendarScope` en `auth.ts`. La sincronización corre por consultorio.
3. **IA:** configuración, topes y registro de consumo **por consultorio**, para el bot y para el
   panel. El tope de un consultorio no se ve afectado por el uso de otro. El proveedor y la clave
   siguen siendo de la plataforma (ver D9).
4. **Separación de las credenciales de cobro de Arzium:** ninguna cuenta de señas representa a
   Arzium; las credenciales de la suscripción (HU-029) quedan en otro lugar.

---

## 2. Criterios de aceptación

```gherkin
Feature: Mercado Pago de señas por consultorio

  Background:
    Given existen los consultorios A (Daiana) y B (Ana), cada uno con su OWNER
    And la aplicación de Mercado Pago "Numa" está configurada en el entorno

  Scenario: Cada consultorio conecta su propia cuenta
    Given ni A ni B tienen cuenta de Mercado Pago conectada
    When Daiana conecta su cuenta desde Ajustes → Mercado Pago
    And Ana conecta otra cuenta desde Ajustes → Mercado Pago
    Then cada consultorio ve "Conectada" con su propio nickname, email y número de usuario
    And ninguno ve los datos de la cuenta del otro

  Scenario: Conectar en B no pisa la cuenta de A
    Given A tiene su cuenta conectada
    When Ana conecta, reconecta o desconecta la cuenta de B
    Then la cuenta de A, sus tokens y su vencimiento no cambian

  Scenario: La seña del paciente de A se acredita en la cuenta de A
    Given A y B tienen cuentas conectadas
    When un paciente de A reserva un servicio con seña
    Then la preferencia se crea con el token de la cuenta de A
    And el Payment guarda el user_id de Mercado Pago de A
    And el pago nunca se crea con la cuenta de B ni con credenciales de Arzium

  Scenario: Sin cuenta conectada, el consultorio no cobra con la de otro
    Given B no tiene cuenta conectada y A sí
    When un paciente de B intenta reservar un servicio con seña
    Then no se crea preferencia
    And el bot responde como hoy cuando falta Mercado Pago (HU-023)
    And el aviso "falta Mercado Pago" se encola para B, con su propio tope de 1 cada 24 h

  Scenario: El webhook confirma la seña en el consultorio correcto
    Given un paciente de A pagó su seña
    When llega la notificación de Mercado Pago con firma válida
    Then el sistema identifica la cuenta y el consultorio sin confiar en datos que pueda inventar quien llama
    And consulta el pago con el token de la cuenta de A
    And solo actualiza un Payment de A cuyo user_id de Mercado Pago coincide
    And confirma el turno de A y encola la confirmación para el paciente de A

  Scenario: Una notificación que no corresponde a ninguna cuenta se ignora
    When llega una notificación firmada de un pago de una cuenta que no está conectada en ningún consultorio
    Then no se actualiza ningún Payment y se responde 200 a Mercado Pago
    And el log registra solo un código ("unknown_account"), sin tokens ni datos del pagador

  Scenario: Conciliación, vencimiento y renovación por consultorio
    Given A y B tienen cuentas conectadas y señas pendientes
    When corren los crons de conciliación, vencimiento de señas y renovación de token
    Then cada consultorio se procesa con su propia cuenta
    And una falla en la cuenta de B (revocada, renovación fallida) no frena ni cambia el proceso de A
    And el aviso de incidente de B se encola solo para B

  Scenario: Desconectar afecta solo a ese consultorio
    Given A y B tienen señas pendientes
    When Ana desconecta la cuenta de B
    Then se cancelan las señas pendientes de B, como en HU-023
    And las señas pendientes de A siguen igual

  Scenario: Cambiar de cuenta afecta solo a ese consultorio
    Given B tiene una seña pendiente creada con la cuenta X
    When Ana reconecta B con otra cuenta Y
    Then la seña pendiente creada con X sigue el comportamiento de HU-023 (se consulta con la cuenta que la creó o queda sin conciliar)
    And las señas nuevas de B se crean con la cuenta Y
    And nada de A cambia

  Scenario: El OAuth queda atado a la persona y al consultorio
    Given Daiana inició la conexión desde A
    When el callback llega con ese state en una sesión de otra persona o con otro consultorio en el contexto
    Then no se canjea el code ni se guarda nada
    And se ve "No pudimos verificar la conexión. Probá de nuevo."

  Scenario: Los tokens no salen del servidor
    When cualquier persona usa Ajustes → Mercado Pago, el bot o el webhook
    Then ningún token, code, code_verifier ni client_secret llega al navegador, al HTML ni a los logs

  Scenario: Regresión de HU-023 en el consultorio original
    Given producción tiene la cuenta de Daiana conectada en la fila actual de legacy-tenant
    When se aplica la migración
    Then la cuenta de Daiana sigue conectada, sin reconectar
    And las señas pendientes y aprobadas conservan su cuenta de origen
    And el flujo turno → seña → pago → webhook → turno confirmado sigue funcionando

  Scenario: Las credenciales de Arzium no son una cuenta de señas
    Then ningún consultorio puede tener como cuenta de señas las credenciales de la suscripción de Arzium
    And el respaldo MERCADOPAGO_ACCESS_TOKEN del .env sigue siendo solo de desarrollo y solo del consultorio original
```

```gherkin
Feature: Google Calendar por consultorio

  Scenario: El login ya no pide permiso de calendario
    When cualquier persona inicia sesión con Google
    Then Google le pide solo identidad (email y perfil), sin el permiso de calendario
    And el login no guarda ni pisa ningún token de calendario

  Scenario: Conectar el calendario del consultorio
    Given Daiana está en A sin calendario conectado
    When toca "Conectar Google Calendar" en Ajustes → Google Calendar
    Then va a Google con un state de un solo uso, atado a su persona y a A, con vencimiento
    And autoriza el permiso de eventos de calendario
    And vuelve a Ajustes → Google Calendar con "Google Calendar conectado"
    And A muestra "Conectado" con el email de la cuenta de Google conectada
    And el refresh token queda guardado cifrado y solo para A

  Scenario: El login o la conexión de otra persona no pisa el calendario de A
    Given A tiene su calendario conectado
    When Ana inicia sesión o conecta el calendario de B
    Then el token del calendario de A no cambia

  Scenario: Los turnos de A van solo al calendario de A
    Given A y B tienen calendarios conectados
    When se confirma, mueve o cancela un turno de A
    Then el cron crea, mueve o borra el evento solo en el calendario de A
    And nunca escribe en el calendario de B
    And los eventos de B nunca aparecen en el calendario de A

  Scenario: Un consultorio sin calendario no sincroniza
    Given B no tiene calendario conectado
    When corre el cron de sincronización
    Then los turnos de B no se envían a ningún calendario

  Scenario: Una falla en B no frena a A
    Given el permiso del calendario de B fue revocado en Google
    When corre el cron de sincronización
    Then B queda con su error de sincronización visible en sus Ajustes
    And A sincroniza normalmente

  Scenario: Desconectar el calendario
    Given A tiene su calendario conectado
    When Daiana toca "Desconectar" y confirma
    Then se borra el token de A y se intenta revocar el permiso en Google (ver D7)
    And los turnos de A dejan de sincronizarse
    And los eventos ya creados quedan en su Google Calendar (ver D8)
    And B no cambia

  Scenario: State inválido, vencido o reutilizado
    When el callback de Google llega con un state que no generó el panel, ya usado o vencido
    Then no se canjea el code ni se guarda nada
    And se ve "No pudimos verificar la conexión. Probá de nuevo."

  Scenario: Regresión: el calendario del consultorio original sigue andando
    Given producción tiene el token de Daiana en Professional(1) de legacy-tenant
    When se aplica la migración (ver D6)
    Then los turnos de A siguen sincronizándose con el mismo calendario y el mismo googleCalendarId
```

```gherkin
Feature: IA por consultorio

  Scenario: El tope diario de la IA del bot es por consultorio
    Given A agotó su tope diario de preguntas a la IA del bot
    When un paciente de B hace una pregunta
    Then la IA responde a B normalmente
    And el registro de la pregunta queda asociado a B

  Scenario: Tope por paciente dentro de su consultorio
    Given un paciente de A llegó a su tope diario
    Then recibe el mismo texto que hoy ("AI_UNAVAILABLE") y no se llama a la IA

  Scenario: La IA que trabaja para A no lee datos de B
    When un paciente de A pregunta por servicios, horarios, turnos o datos del consultorio
    Then las tools devuelven solo servicios, disponibilidad, perfil y "Información para el asistente" de A
    And el pedido al proveedor no lleva ningún dato de B
    And el registro de uso queda en A

  Scenario: La configuración de IA es la del consultorio
    Given A tiene la IA del bot prendida y B apagada
    Then el menú del bot de A ofrece la opción 5 y el de B no
    And los topes que se aplican a cada uno son los de su consultorio

  Scenario: Consumo de IA del panel por consultorio
    When Daiana usa el asistente o la IA de planes en A
    Then se registra el consumo (función, tokens, proveedor y modelo) asociado a A
    And si A superó su tope del período (ver D11), se ve "Llegaste al límite de uso de IA de tu consultorio para este período." y no se llama al proveedor

  Scenario: La clave del proveedor no sale del servidor
    Then ninguna pantalla, respuesta ni log muestra la clave del proveedor de IA
    And los errores del proveedor se loguean solo con su código (D11 de HU-025)

  Scenario: Regresión de la IA del consultorio original
    Given producción usa DeepSeek con la clave del .env
    When se aplica esta HU
    Then la IA del bot y del panel de A siguen respondiendo con la misma configuración efectiva
    And los topes de A arrancan con los valores que hoy da el .env
```

---

## 3. Datos que se registran

| Dato | Obligatorio | Uso |
|---|---|---|
| Cuenta de MP de señas: consultorio (`tenantId`, único) | Sí | Una cuenta por consultorio. Reemplaza la fila única `id = 1`. |
| Cuenta de MP: user_id, nickname, email, live_mode, scope, tokens cifrados, vencimiento, fechas, errores, avisos | Igual que HU-023 | Sin cambios de significado; ahora por consultorio. |
| `MercadoPagoOAuthState`: `userId` de quien inicia y `tenantId` | Sí | El callback exige la misma persona y el mismo consultorio (hoy solo el email). |
| Conexión de Google Calendar del consultorio: `tenantId`, refresh token **cifrado**, email de la cuenta de Google, id de calendario, fecha de conexión, error de sincronización | Sí (salvo id de calendario y error) | Reemplaza `Professional.googleRefreshToken` en texto plano. Ver D5 (dónde vive). |
| State del OAuth de Google: hash del state, `userId`, `tenantId`, vencimiento (y PKCE si aplica) | Sí | Anti-CSRF, un solo uso, 10 min. |
| `BotAiQuestion.tenantId` | Sí (nuevo) | Topes diarios y consumo por consultorio. Backfill desde el paciente. |
| Configuración de IA por consultorio: topes (por paciente/día, por consultorio/día del bot; por período del panel), interruptores | Sí, con valores por defecto | Hoy son variables de entorno globales. Ver D10. |
| Registro de consumo de IA del panel: consultorio, función (`assistant`, `plan_ai`), fecha, proveedor, modelo, tokens de entrada/salida, resultado | Sí | Cupo y costo por consultorio. **Sin texto de la consulta ni datos clínicos** (ver D12). |

No se guarda ningún token, clave ni dato de tarjeta en claro. Las claves de los proveedores de IA
no se guardan en la base (ver D9).

---

## 4. Diseño UX

### 4.1 Panel → Ajustes → Mercado Pago (`/ajustes?tab=mercadopago`)

Igual que HU-023: estado, datos de la cuenta, "Conectar", "Reconectar" y "Desconectar" con el
conteo de señas pendientes. Cambia solo que cada consultorio ve y maneja **su** cuenta. Mensajes
nuevos: ninguno. El error de state usa el texto actual ("No pudimos verificar la conexión. Probá de
nuevo.").

Nuevo error si la cuenta ya está conectada en otro consultorio (solo si D3 = bloquear):
"Esta cuenta de Mercado Pago ya está conectada en otro consultorio. Usá otra cuenta o escribinos a
soporte."

### 4.2 Panel → Ajustes → Google Calendar (`/ajustes?tab=google`)

- **No conectado:** estado "No conectado", explicación corta ("Los turnos confirmados se agregan a
  tu Google Calendar.") y botón primario **"Conectar Google Calendar"**, que ya no es un login.
- **Conectado:** estado "Conectado", fila "Cuenta" con el email de Google conectado (nuevo), fila
  "Calendario" (principal u otro), "Reconectar", "Desconectar" (con la confirmación actual) y
  "Opciones avanzadas" con el id de calendario, como hoy.
- **Error de sincronización:** el aviso actual, con el error del consultorio.
- **Mensajes del callback** (banner en la pestaña, como el de MP):
  - Éxito: "Google Calendar conectado."
  - Cancelado en Google: "No se conectó el calendario: la autorización fue cancelada en Google."
  - State inválido: "No pudimos verificar la conexión. Probá de nuevo."
  - Google no devolvió refresh token o rechazó el canje: "Google rechazó la conexión. Probá de
    nuevo; si se repite, avisá al soporte."
  - Permiso de calendario no otorgado (la persona destildó el permiso): "Para sincronizar los
    turnos hace falta permitir el acceso a los eventos del calendario."
- Confirmación de "Desconectar" (texto actual, con un agregado): "Los turnos nuevos dejan de
  aparecer en tu Google Calendar. Los eventos que ya están ahí no se borran."

### 4.3 Panel → IA

- La configuración del bot ("Responder preguntas con IA" e "Información para el asistente") sigue
  donde está hoy (`bot-ai-form.tsx`). El aviso de "falta la clave" sigue mirando la clave de la
  plataforma.
- **Nuevo (si D13 = sí):** bloque de solo lectura "Uso de IA" con lo consumido en el período y el
  tope: "Preguntas del bot hoy: 12 de 300", "Asistente y planes este mes: 40 de 500". Sin costos en
  dinero.
- Tope del panel alcanzado: en el asistente y en "Generar con IA" del plan, el error
  "Llegaste al límite de uso de IA de tu consultorio para este período." (toast o error del
  formulario, como los errores actuales del asistente).
- Los topes los define Arzium (ver D10); la profesional no los edita.

### 4.4 Bot de WhatsApp

**Sin mensajes nuevos.** El tope del consultorio alcanzado usa el mismo texto que hoy el tope
global (`messages.AI_UNAVAILABLE`). Falta de Mercado Pago, aviso de incidente de MP y confirmación
de seña: textos actuales de HU-023/HU-009, ahora encolados para el consultorio que corresponde.

---

## 5. Fuera de alcance

- **WhatsApp por consultorio** (sesiones de Baileys, `getConversationTenant()` por conexión
  receptora, colas, dedupe, crons que dependen de WhatsApp, `BotStatus` por sesión) → HU-027.
  Mientras tanto, el bot sigue resolviendo `legacy-tenant`.
- **Suscripción SaaS de Arzium** (planes, `preapproval`, modelos `Subscription*`, webhook propio,
  credenciales de Arzium) → HU-029. Esta HU solo garantiza que las señas no usan esas credenciales
  ni sus modelos.
- **Registro y onboarding** (pantalla de requisitos pendientes que invita a conectar MP y
  Calendar) → HU-026. Esta HU deja las conexiones listas para que el onboarding las enlace.
- **Gemini u otro proveedor de IA nuevo.** El usuario lo quiere más adelante: queda como HU aparte
  (ver D9). Esta HU no agrega proveedores.
- **Clave de IA propia de cada consultorio (BYO key)**, salvo que D9 diga lo contrario.
- **Facturar o cobrar el consumo de IA** a los consultorios, y mostrar costos en dinero.
- **Editar topes de IA desde una UI de Arzium** (consola de plataforma); en esta HU se cambian por
  script o base (ver D10).
- **Sincronización de dos vías** con Google Calendar (leer eventos de Google para bloquear
  horarios) y varios calendarios o agendas por consultorio.
- **Retirar el candado `ENABLED_TENANT_IDS`** (es de 025c) y escalar a un segundo cliente real.
- Matriz completa de QA multi-tenant, observabilidad, `tenantId NOT NULL` en todo el esquema →
  HU-031.

---

## 6. Notas de implementación (mínimas; el detalle es del `architect`)

- **MP, migración:** pasar `MercadoPagoAccount` a una fila por tenant (`tenantId` obligatorio y
  único, id generado), conservando la fila de `legacy-tenant` con sus tokens (no hay que
  recifrar: el AAD es por campo, no por id; verificarlo). Retirar `ACCOUNT_ID`, `ensureAccountRow`
  con id fijo y `singletonHasUnverifiedOwner`. Revisar que la migración no rompa el binario viejo
  durante el deploy (bot y web se despliegan juntos: confirmar).
- **MP, webhook:** hoy el tenant sale de la fila única. Con varias cuentas hay que elegir cómo
  identificar la cuenta: `user_id` del cuerpo de la notificación (validado contra
  `MercadoPagoAccount.userId` y re-verificado consultando el pago con ese token), o una
  `notification_url` con un identificador opaco por cuenta. En los dos casos, el `Payment` local
  (por `external_reference`) tiene que ser del mismo tenant y del mismo `mercadopagoUserId`. Verificar
  con la doc vigente de MP qué trae la notificación de pagos de una aplicación con OAuth.
- **MP, `state`:** agregar `userId` (y usar el `tenantId` que ya existe) a `MercadoPagoOAuthState`;
  el callback compara contra el contexto de la sesión.
- **Crons de integraciones:** conciliación, vencimiento, renovación de MP y sincronización de
  Calendar pasan a recorrer los consultorios con cuenta conectada, aislando fallas por consultorio
  (ver D2 para el límite con HU-027).
- **Google Calendar:** flujo OAuth propio (ruta de inicio + callback en `/api`), `access_type=offline`,
  `prompt=consent`, `include_granted_scopes`, state de un solo uso atado a `userId` y tenant; cifrado
  reutilizando `secretBox.ts` (generalizar AAD/clave, ver D6). Quitar el scope de calendario de
  `auth.config.ts`, `maybeStoreCalendarToken`, `calendar-token-owner.ts`,
  `GOOGLE_CALENDAR_OWNER_EMAIL` y la excepción de `auth.ts` en `guard-coverage.test.ts`.
  `syncGoogleCalendar(t)` por consultorio. La nueva `redirect_uri` hay que registrarla en Google
  Cloud Console (paso operativo).
- **IA:** `BotAiQuestion.tenantId` con backfill desde `Patient.tenantId`; `countBotAiQuestionsToday`
  por tenant; topes leídos de la configuración del consultorio con defaults del `.env`; registro de
  consumo del panel. Las tools del bot con el tenant de la conversación dependen de 025c (ver D1).
- **Tests:** dos consultorios en probes con Postgres descartable; regresión de
  `test-mercadopago-sandbox.ts`, `test:confirm-flow`, `test-bot-ai-questions.ts`,
  `test-booking-reason.ts` y `gcal.test.ts`. Sin WhatsApp real ni cobros reales (AGENTS.md).
- **Producción, antes de publicar:** confirmar `SELECT id, "tenantId", "userId" IS NOT NULL FROM
  "MercadoPagoAccount";` y si `Professional(1).googleRefreshToken` existe y si
  `GOOGLE_CALENDAR_OWNER_EMAIL` está seteado (sin leer el token).

---

## 7. Propuesta de corte en entregas

La HU junta tres integraciones independientes, cada una con su migración y sus crons. Como solo
una HU con migración puede estar en `implementando` a la vez, conviene partirla en entregas
secuenciales con sufijos sobre el issue #71 (como HU-025):

| Entrega | Contenido | Por qué así |
|---|---|---|
| **028a · Mercado Pago de señas por consultorio** | Migración de `MercadoPagoAccount` a fila por tenant; `state` con `userId`/tenant; webhook que identifica la cuenta; crons de MP por consultorio; Ajustes; separación de credenciales de Arzium; regresión HU-023. | Es lo que mueve plata y lo que pide HU-029 para no mezclar credenciales. Destraba la suscripción. |
| **028b · Google Calendar por consultorio** | Flujo OAuth propio; token cifrado por consultorio (migración + traslado del token de Daiana); login sin scope de calendario; retiro de `GOOGLE_CALENDAR_OWNER_EMAIL`; sync por consultorio. | Toca el login (`auth.config.ts`), sensible: mejor aislado y revisable solo. |
| **028c · IA por consultorio** | `BotAiQuestion.tenantId`; topes y configuración por consultorio; registro de consumo del panel; tope del panel; vista de uso (si D13). | Depende de que 025c haya pasado las tools del bot al tenant de la conversación (D1). |

Orden recomendado: 028a → 028b → 028c. 028c puede adelantarse si 025c ya está hecho.

---

## 8. Dudas para validar con el usuario

**D1. Relación con 025c (tools de la IA del bot).** Las tools del bot (`servicios`,
`disponibilidad`, `mis_turnos`, `datos_consultorio`) todavía leen el perfil legacy y
`activeServices()` sin tenant; pasarlas al tenant de la conversación es alcance de 025c, que no
arrancó. Opciones: (a) 028c depende de 025c y no lo duplica; (b) HU-028 absorbe esa parte de 025c.
**Recomendación: (a).** 025c ya la tiene comprometida junto con el portal, y así no se pisan.

**D2. ¿Quién hace que los crons de integraciones recorran consultorios: HU-028 o HU-027?** HU-027
dice "cron jobs … recorran tenants activos". Opciones: (a) HU-028 hace los de integraciones
(conciliación/vencimiento/renovación de MP y sync de Calendar), que no dependen de la sesión de
WhatsApp; HU-027 los de WhatsApp (recordatorios, prep, resúmenes, outbox); (b) todo en HU-027 y
HU-028 deja las funciones listas por tenant pero el cron sigue con `legacy-tenant`.
**Recomendación: (a).** Sin esto, los criterios "una falla de B no frena a A" no se pueden cumplir
en esta HU. El gate de licencia (consultorio suspendido) queda para HU-027/HU-030.

**D3. ¿Una misma cuenta de Mercado Pago puede estar conectada en dos consultorios?** (a) No:
`userId` único entre consultorios, con el error de 4.1; (b) sí. **Recomendación: (a).** Con (b), un
webhook de esa cuenta no sabe a qué consultorio va sin mirar el `Payment`, y una desconexión
cancelaría señas de los dos. Si una profesional tiene dos consultorios, usa dos cuentas.

**D4. ¿Quién puede conectar, cambiar y desconectar las integraciones?** En HU-025 (D3) se decidió
que `OWNER` y `STAFF` tienen los mismos permisos, salvo Equipo. Opciones: (a) igual que hoy,
cualquier miembro con acceso de escritura; (b) solo el `OWNER`, porque definen a qué cuenta va la
plata. **Recomendación: (b)** para Mercado Pago y Google Calendar (la IA no tiene acciones de
credenciales). Hoy no hay `STAFF` real, así que no cambia nada para Daiana. El acceso de soporte de
Arzium (025d) no puede conectar ni desconectar cuentas en ningún caso.

**D5. ¿Dónde vive la conexión de Google Calendar?** (a) Tabla nueva `GoogleCalendarAccount` por
consultorio (espejo de `MercadoPagoAccount`); (b) columnas cifradas en `Professional` del
consultorio. **Recomendación: (a).** Deja de mezclar credenciales con el perfil (que se lee en
muchos lados), y separa el email de la cuenta de Google del email de la profesional.

**D6. Traslado del token de calendario de Daiana (texto plano hoy).** (a) Script de deploy
idempotente que lo cifra y lo mueve a la nueva tabla, y una migración posterior borra la columna;
(b) no se traslada: Daiana reconecta una vez después del deploy; (c) se cifra perezosamente en la
primera sincronización. ¿Se usa la misma clave de cifrado que MP (`MERCADOPAGO_TOKEN_KEY`) o una
clave nueva (p. ej. `INTEGRATION_TOKEN_KEY`)? **Recomendación: (a) con clave nueva.** (b) es más
simple pero corta la sincronización hasta que ella entre; si preferís (b), hay que avisarle antes.

**D7. ¿"Desconectar" revoca el permiso en Google (y en Mercado Pago)?** Hoy solo se borra el
token. **Recomendación:** en Google, sí, revocar (best effort: si falla, igual se borra local). En
MP, mantener HU-023 (no revoca, solo borra).

**D8. ¿Qué pasa con los eventos ya creados al desconectar o cambiar de cuenta de Google?** (a) Se
quedan donde están y los turnos olvidan su `googleEventId`; al reconectar (aunque sea la misma
cuenta) los turnos futuros confirmados se vuelven a crear; (b) se quedan y, si se reconecta la
misma cuenta, se siguen usando los mismos eventos; (c) se borran del calendario al desconectar.
**Recomendación: (b) con (a) cuando cambia la cuenta:** misma cuenta → se conservan; otra cuenta →
se olvidan y se recrean los turnos futuros en el calendario nuevo. Nunca se borran eventos al
desconectar.

**D9. ¿De quién es la clave del proveedor de IA?** (a) De la plataforma (Arzium paga DeepSeek y
controla el costo con topes por consultorio); (b) cada consultorio carga su propia clave (BYO key,
cifrada); (c) las dos. **Recomendación: (a).** Proveedor y modelo siguen globales por `.env`.
**Gemini** como proveedor nuevo queda fuera de esta HU (HU aparte cuando se decida), igual que
elegir proveedor por consultorio. ¿Lo confirmás?

**D10. ¿Quién define los topes de IA de cada consultorio y cómo?** (a) Arzium, guardados por
consultorio en la base con valores por defecto del `.env`, cambiables por script (sin UI); (b) la
`OWNER` desde Ajustes, dentro de un máximo de la plataforma; (c) solo valores globales del `.env`
aplicados a cada consultorio por separado (sin configuración propia). **Recomendación: (a)**; es
lo que prepara HU-030 (planes/licencias con distintos cupos). Si querés lo mínimo, (c) cumple el
aislamiento sin tabla nueva.

**D11. ¿La IA del panel (asistente e IA de planes) lleva tope?** Hoy no tiene ninguno. (a) Sí,
tope mensual por consultorio que bloquea con el mensaje de 4.3; (b) solo se registra el consumo, sin
bloquear; (c) nada en esta HU. **Recomendación: (b) ahora y el bloqueo con los planes de HU-030**,
salvo que quieras proteger costos ya: entonces (a) con un tope alto. ¿Qué período: diario o
mensual?

**D12. ¿Qué se guarda del consumo de IA del panel?** **Recomendación:** solo consultorio, función,
fecha, proveedor, modelo, tokens y resultado; nunca la pregunta, la respuesta ni datos del
paciente. El asistente trabaja con datos clínicos y no hace falta guardarlos para medir costo.
¿Hace falta además el usuario que la usó (para ver consumo por persona)?

**D13. ¿La profesional ve su consumo de IA?** (a) Sí, bloque de solo lectura "Uso de IA" en
Ajustes (4.3); (b) no, solo Arzium por consulta a la base. **Recomendación: (b) en esta HU** y
mostrarlo cuando haya planes con cupo (HU-030), para no exponer topes que todavía no son producto.

**D14. ¿La retención y la purga de preguntas de la IA del bot (90 días) pasan a ser por
consultorio?** **Recomendación: no**, queda global; no afecta el aislamiento.

**D15. Verificación de la app de Google.** El permiso `calendar.events` es "sensible": para que
otras profesionales (fuera de una lista de prueba) conecten su calendario, la app de Google tiene
que estar publicada y verificada (las páginas `/acerca` y `/privacidad` se hicieron para eso). ¿En
qué estado está hoy la app en Google Cloud (prueba / publicada / verificada)? No bloquea la HU, pero
sí poder sumar un segundo consultorio real. Lo mismo para la nueva `redirect_uri`, que hay que
agregar en la consola.

**D16. Política de privacidad.** Si cambia qué se pide a Google (el login deja de pedir
calendario) o se registra consumo de IA, ¿se actualiza `/privacidad` en esta HU?
**Recomendación: sí**, en 028b, con un ajuste de texto chico.

---

## Resoluciones (validadas por el usuario, 2026-11-25)

- **D1–D16: se aceptan todas las recomendaciones** de la sección 8.
- **D15 (estado de la app de Google):** la app está **en verificación**. Google (equipo de seguridad de datos de terceros) pidió confirmar el cumplimiento de "uso limitado": que ningún dato obtenido con `calendar.events` llegue a servicios de IA de terceros (DeepSeek, Anthropic), la lista de proveedores y modelos, y un video demostrativo. Verificado en el código (2026-11-25): Calendar se usa solo para escribir (`events.insert/patch/delete` en `packages/db/domain/gcal.ts`, sin `list` ni `freebusy`) y la IA no recibe datos de Google. 028b tiene que conservar eso (Calendar de solo escritura, credencial aislada del login) y D16 tiene que declararlo en `/privacidad`.
