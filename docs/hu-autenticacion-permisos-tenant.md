# HU-025 · Autenticación, permisos y aislamiento entre consultorios

**Validada por el usuario el 2026-11-21** (resoluciones en la sección 9). [Issue #68](https://github.com/senkuch4n/nutri-bot/issues/68).
Depende de HU-024 (#67, mergeada y en producción desde 2026-11-21). Bloquea HU-026, HU-030 y HU-031.

**Como** nutricionista que usa NutriBot,
**quiero** entrar solamente al espacio de mi consultorio y que nadie de otro consultorio pueda ver,
editar ni deducir los datos de mis pacientes,
**para que** la información clínica de mis pacientes siga siendo privada cuando NutriBot aloje a
otras profesionales.

---

## 1. Contexto

### 1.1 Qué existe hoy (después de HU-024)

**Modelo de datos** (`packages/db/prisma/schema.prisma`):

- `Tenant` (consultorio), `User` (identidad de acceso, `email` único y `googleSubject` único y
  opcional), `TenantMembership` (par `tenantId`/`userId`, con `role` `OWNER` o `STAFF`; enum
  `TenantRole`), `Agenda` (de un tenant, con su profesional y `isPrimary`).
- Casi todos los modelos de negocio tienen dueño por tenant, directo o heredado (ver el inventario
  de la [SDD de HU-024](../Refactorizaciones/modelo-multi-tenant.md), sección 2). El JID del
  paciente ya es único por tenant, no global.
- **No existe** ningún rol de plataforma (`PLATFORM_ADMIN` o similar), ni tabla de auditoría, ni
  marca de usuario deshabilitado.

**Login del panel** (`apps/web/src/auth.config.ts`, `apps/web/src/auth.ts`, `apps/web/src/middleware.ts`):

- Auth.js con Google. El callback `signIn` y el `authorized` del middleware dejan pasar a
  cualquier email que esté en `ALLOWED_EMAILS` (variable de entorno, lista separada por comas).
  **Hoy esa lista es la única barrera de acceso al panel.**
- En el `jwt`, si el `sub` verificado de Google coincide con un `User.googleSubject`, el token
  guarda `privateContentUserId`. Si no hay `User`, el login igual funciona (por `ALLOWED_EMAILS`).
- `apps/web/src/app/(panel)/layout.tsx` solo comprueba `session.user`.
- El callback OAuth de Mercado Pago (`apps/web/src/app/api/mercadopago/oauth/callback/route.ts`)
  vuelve a chequear `allowedEmails` como segunda barrera.
- El token de Google Calendar se guarda solo si el email coincide con
  `GOOGLE_CALENDAR_OWNER_EMAIL` (`apps/web/src/lib/calendar-token-owner.ts`) y siempre sobre la
  agenda del consultorio original.

**Autorización por membresía, solo en recetas y plantillas:**
`apps/web/src/lib/private-content-access.ts` (`resolvePrivateContentAccess()`) lee la membresía en
cada operación y devuelve `{ userId, tenantId, role }`. Sin usuario vinculado, sin membresía o con
más de una, devuelve `null`. Se usa en unas 20 piezas del panel (recetas, plantillas, picker de
recetas, medios de recetas). `OWNER` y `STAFF` pueden lo mismo.

**El resto del panel usa el adaptador del consultorio original:**

- `packages/db/domain/legacySchedulingScope.ts` (`resolveLegacySchedulingScope`,
  `resolveLegacyDigestScope`, `resolveLegacyCalendarScope`) resuelve siempre
  `legacy-tenant` / `legacy-agenda`. Lo consumen ~33 archivos: dominio (`appointments`,
  `availability`, `patients`, `clinical`, `consultations`, `isak`, `prescriptions`,
  `nutritionPlans`, `payments`, `mercadopagoAccount`, `inquiries`, `reminders`,
  `conversationState`, `gcal`), páginas y acciones del panel (calendario, pacientes, avisos,
  disponibilidad, servicios) y el bot (`conversation.ts`, `workers.ts`).
- `getProfessional()` (`packages/db/domain/availability.ts`) sigue leyendo `Professional` con
  `id: 1`. Lo usan ~28 archivos del panel, del portal, del asistente y de la IA del bot.
  `professionalAssets.ts` (firma y logo) también va por `id: 1`.
- Hay consultas sin filtro de tenant, p. ej. `apps/web/src/lib/assistant-tools.ts`
  (`prisma.patient.findMany({ take: 300 })`, búsquedas por `patientId` sin dueño).

**Rutas API** (`apps/web/src/app/api/*`): `appointments`, `slots` (solo exigen `session.user`),
`diary/[entryId]/photo`, `professional/logo`, `professional/signature`,
`recetas/fotos/[photoId]`, `recetas/importacion/[imageId]`, `mercadopago/oauth/callback`,
`webhooks/mercadopago` (pública, firmada) y `auth`. En el panel además:
`pacientes/[id]/consultas/[consultationId]/antropometria/informe/pdf/route.ts`.

**Portal del paciente** (`apps/web/src/app/(portal)`, `apps/web/src/lib/patient-session.ts`,
`packages/db/domain/patientAuth.ts`):

- El bot (opción 4 del menú, `apps/bot/src/conversation.ts`) genera un token HMAC de 15 minutos
  con `createPatientToken(patient.id, 15)`. `/portal/login?token=…` lo cambia por una cookie
  `patient_session` de 30 días con el mismo formato (`patientId.expira.firma`, firmado con
  `AUTH_SECRET`).
- **El token solo lleva `patientId`.** No lleva tenant y no se puede revocar antes de que expire.
  `getPortalPatient()` busca el paciente por id sin más condición.
- Rutas del portal que entregan archivos: `portal/plan/pdf`, `portal/diario/photo/[id]`,
  `portal/recetas/fotos/[photoId]`. El portal también lee `getProfessional()` (id 1).
- El middleware excluye `/portal`: cada página valida la sesión del paciente.

**IA (DeepSeek):**

- Panel: `/asistente` (tools en `assistant-tools.ts`) y la IA de planes
  (`pacientes/[id]/planes/[planId]/ai-actions.ts`). Ambas arman contexto con `getProfessional()` y
  consultas sin tenant.
- Bot: preguntas de pacientes con IA (HU-012, `packages/db/domain/botAi.ts`), que arma el contexto
  con `getProfessional()` y los servicios activos.

**Membresías:** solo se crean con `packages/db/scripts/legacy-memberships.ts`, a mano, con un
padrón JSON que trae el `sub` de Google exacto de cada persona y solo apunta a `legacy-tenant`.
HU-024 dejó explícito (decisión S24/L23) que `ALLOWED_EMAILS` **no** otorga membresía.

### 1.2 Estado real del producto

- Producción (VPS) tiene un solo consultorio, el original (`legacy-tenant`), de la Lic. Daiana
  Ponce. Ella empieza a probar la app el 2026-11-22, todavía sin pacientes cargados.
- Joel (desarrollador) también entra al panel de producción.
- **Ninguno de los dos tiene membresía en producción hoy**: entran solo por `ALLOWED_EMAILS`. El
  pendiente "correr `legacy-memberships` en prod" está anotado en la bitácora.
- El bot está vinculado a un único número de WhatsApp y atiende solo al consultorio original
  (multi-sesión es HU-027).

### 1.3 Por qué hace falta

Mientras haya un solo consultorio, el adaptador legacy no filtra mal: todo es de `legacy-tenant`.
Pero en cuanto HU-026 permita dar de alta un segundo consultorio, cualquier persona con acceso al
panel vería los pacientes, turnos y planes del original, porque el panel no pregunta "¿de qué
consultorio sos?", sino que asume uno. Y una cuenta que no esté en `ALLOWED_EMAILS` no podría
entrar aunque tenga su consultorio. HU-025 cambia la pregunta de "¿tu email está en la lista?" a
"¿qué consultorio te corresponde según tu identidad y tu membresía?", y hace que cada lectura,
escritura, descarga e IA responda a esa pregunta del lado servidor.

### 1.4 Qué es lo nuevo

1. **Contexto de tenant confiable** (`getTenantContext()` o equivalente, `server-only`): sale de la
   sesión autenticada y de la membresía leída en la base en cada operación, nunca de query params,
   cookies propias, campos de formulario ni ids que mande el frontend. Generaliza lo que hoy es
   `resolvePrivateContentAccess()`.
2. **Acceso al panel por membresía**, no por lista de emails, con un camino de migración para
   Daiana y Joel que no los deje afuera.
3. **Todo el panel, las rutas API, los PDF y descargas, y la IA del panel** pasan a usar ese
   contexto en lugar del adaptador legacy y de `getProfessional()` con `id: 1`.
4. **Portal del paciente atado a un tenant concreto**: el token y la cookie identifican paciente y
   consultorio, y la validación lo comprueba.
5. **IA del bot** construye su contexto con el tenant de la conversación, no con `id: 1`.
6. **Acceso de plataforma (Arzium)** explícito, separado del rol profesional y auditado (sujeto a
   D2 y al corte de D6).
7. **Tests negativos** de ids cruzados, inputs manipulados y sesiones/membresías revocadas, con dos
   consultorios de prueba.

---

## 2. Criterios de aceptación

```gherkin
Feature: Login al panel por identidad y membresía

  Background:
    Given existen los consultorios A y B
    And la usuaria "Ana" tiene membresía OWNER en A, vinculada por su sub de Google
    And el usuario "Beto" tiene membresía en B

  Scenario: Entra quien tiene una membresía
    When Ana inicia sesión con Google (email verificado, sub coincide con User.googleSubject)
    Then entra al panel y ve solo los datos del consultorio A

  Scenario: Una cuenta de Google sin membresía no entra
    Given la cuenta "carla@…" no tiene User o no tiene membresía
    When inicia sesión con Google
    Then no entra al panel
    And vuelve a /inicio con el mensaje de "sin acceso"
    And estar en ALLOWED_EMAILS no cambia este resultado (sujeto a D1)

  Scenario: Email que coincide pero sub distinto
    Given existe un User con el email de Ana pero otro googleSubject
    When alguien inicia sesión con una cuenta de Google con ese email y otro sub
    Then no se le otorga el contexto de Ana ni se reasigna la identidad

  Scenario: Más de una membresía
    Given el usuario "Dani" tiene membresía en A y en B
    When inicia sesión
    Then no obtiene contexto de tenant y ve el mensaje correspondiente (sujeto a D7)

  Scenario: Membresía revocada con la sesión abierta
    Given Ana tiene el panel abierto
    When se borra su membresía en A
    Then su siguiente request al panel, a una server action o a una ruta API se rechaza
    And no se lee ni se escribe ningún dato de A en esa request
```

```gherkin
Feature: Aislamiento de recursos entre consultorios en el panel y las API

  Background:
    Given Ana tiene sesión con contexto del consultorio A
    And existe el paciente P_B del consultorio B, con turno, ficha, consulta, plan, informe, pagos y fotos de diario

  Scenario Outline: Ana no puede abrir un recurso de B adivinando el id
    When Ana pide <recurso> con el id de B
    Then recibe la misma respuesta que para un id inexistente (404 / "no encontrado")
    And la respuesta no revela que el recurso existe en otro consultorio

    Examples:
      | recurso                                              |
      | la ficha /pacientes/<id de P_B>                       |
      | una consulta o el informe antropométrico en PDF       |
      | un plan de alimentación                              |
      | la foto de diario /api/diary/<entryId>/photo          |
      | la foto de una receta o una imagen de importación     |
      | el detalle de un turno                               |

  Scenario Outline: Ana no puede modificar recursos de B
    When Ana invoca <acción> pasando ids de B (o ids de A mezclados con uno de B)
    Then la acción se rechaza
    And no cambia ninguna fila en la base

    Examples:
      | acción                                              |
      | editar o archivar un paciente                        |
      | crear un turno para un paciente de B                 |
      | registrar un pago sobre un turno de B                |
      | cargar evolución o antropometría en una consulta de B|
      | aplicar una plantilla a un paciente de B             |
      | responder o marcar una consulta (/mensajes) de B     |

  Scenario: Listados acotados al tenant
    When Ana abre el calendario, /turnos, /pacientes, /pagos, /mensajes, /resumen o /servicios
    Then solo ve filas de A
    And /api/appointments y /api/slots devuelven solo datos de la agenda de A

  Scenario: El tenant no se puede elegir desde el cliente
    When una request incluye un tenantId, agendaId o professionalId en query, body, header o cookie
    Then el servidor lo ignora y usa el contexto de la sesión

  Scenario: Ajustes y activos del consultorio
    When Ana guarda ajustes, firma o logo, o descarga /api/professional/logo o /signature
    Then se lee y escribe la profesional del consultorio A, no Professional(1)
```

```gherkin
Feature: IA sin cruce de datos

  Scenario: El asistente del panel solo ve el consultorio de la sesión
    Given Ana tiene contexto de A
    When le pregunta al asistente "¿qué pacientes tengo con turno mañana?" o por un paciente de B por nombre
    Then las tools solo consultan datos de A
    And el prompt enviado a DeepSeek no contiene datos de B

  Scenario: La IA de planes usa el plan y el paciente del tenant
    When Ana pide una propuesta con IA para un plan con id de B
    Then se rechaza como inexistente y no se llama a DeepSeek

  Scenario: La IA del bot usa el consultorio de la conversación
    Given un paciente le pregunta algo al bot con IA habilitada
    Then el contexto (servicios, precios, obras sociales, info del consultorio, turnos del paciente) sale del tenant de esa conversación
    And no de Professional(1) ni de otro tenant
```

```gherkin
Feature: Portal del paciente atado a un consultorio

  Scenario: Link del bot válido
    Given el paciente P_A pide el link del portal por WhatsApp (opción 4)
    When abre /portal/login?token=… dentro de los 15 minutos
    Then queda con una sesión del portal que identifica a P_A y al consultorio A
    And ve solo su plan, evolución, diario y recetas de A

  Scenario: Token manipulado
    When alguien cambia el patientId o el tenant dentro del token
    Then la firma no valida y ve el error de link inválido

  Scenario: El paciente ya no pertenece al tenant del token
    Given la cookie dice paciente P y consultorio A
    And P no existe en A (borrado, o el id corresponde a otro consultorio)
    Then la sesión del portal no es válida y se le pide un link nuevo

  Scenario: Descargas del portal
    When P_A pide /portal/plan/pdf, una foto de su diario o una foto de receta
    Then solo obtiene archivos de su paciente y de su consultorio
    And un id de otro paciente o de otro consultorio responde como inexistente

  Scenario: Cookies anteriores al cambio
    Given una cookie patient_session emitida antes de esta HU (sin tenant)
    Then no se acepta y el paciente ve cómo pedir un link nuevo (sujeto a D9)
```

```gherkin
Feature: Acceso de plataforma (Arzium), si entra en el alcance (D2/D6)

  Scenario: El acceso de plataforma no es un rol profesional
    Given un usuario con acceso de plataforma y sin membresía en A
    When entra al panel
    Then no ve datos clínicos de A por el solo hecho de ser de plataforma

  Scenario: Acceso de soporte auditado
    When un usuario de plataforma accede a un consultorio según el mecanismo que se valide en D2
    Then queda un registro de auditoría con quién, a qué consultorio, cuándo y qué tipo de acción
    And el registro no guarda datos clínicos ni tokens
```

```gherkin
Feature: Migración del login actual sin perder acceso

  Scenario: Daiana y Joel siguen entrando después del deploy
    Given en producción Daiana y Joel entran hoy solo por ALLOWED_EMAILS
    When se despliega HU-025 siguiendo el procedimiento documentado
    Then los dos pueden iniciar sesión y operar el consultorio original con el rol acordado en D1/D3
    And nadie más obtiene acceso por estar en ALLOWED_EMAILS

  Scenario: El procedimiento se puede ensayar antes de producción
    Given una Postgres descartable con legacy-tenant
    When se sigue el procedimiento de migración con identidades sintéticas
    Then queda verificado que las cuentas del padrón entran y una cuenta fuera del padrón no
```

```gherkin
Feature: Logs y mínimo privilegio

  Scenario: Errores de autorización sin datos sensibles
    When se rechaza un acceso cruzado o una sesión inválida
    Then el log (si lo hay) registra un código de error y, como mucho, ids opacos
    And nunca tokens del portal, refresh tokens, contenido clínico ni el cuerpo del pedido
```

---

## 3. Datos que se registran

Propuesta; el esquema final lo decide el `architect`. Varias filas dependen de las dudas.

| Dato | Obligatorio | Uso |
|---|---|---|
| `User.email`, `User.googleSubject` (existen) | sí (el `sub` pasa a ser lo que vincula el login) | Identidad. El login se vincula por `sub` verificado; el email es informativo. |
| `TenantMembership` (existe) | sí, una por usuario y consultorio | Determina el consultorio y el rol. Sin membresía no hay acceso. |
| Acceso de plataforma (nuevo, p. ej. `User.platformRole` o tabla aparte) | no | Solo para cuentas de Arzium. Separado de `TenantRole` (D2). |
| Registro de auditoría de acceso de plataforma (nuevo) | sí, si hay acceso de plataforma | Quién, consultorio, cuándo, tipo de acción. Sin datos clínicos ni tokens (D2). |
| Identidad "pendiente" de un login sin membresía (opcional, nuevo) | no | Solo si se elige esa variante en D1: guardar `sub` y email verificados para que el operador otorgue la membresía sin pedirle a la persona su `sub`. |
| Tenant en el token y la cookie del portal (sin tabla) | sí | Atar la sesión del portal a un consultorio. Cambia el formato del token. |
| Revocación de sesiones del portal (opcional, nuevo, p. ej. versión de sesión en `Patient`) | no | Solo si D9 pide poder invalidar el portal de un paciente antes de los 30 días. |

---

## 4. Diseño UX

### 4.1 Login (`/inicio`)

- Sin cambios visuales para quien tiene acceso: botón de Google, entra al panel.
- Sin membresía (o identidad que no coincide): vuelve a `/inicio` con un aviso, propuesta de texto:
  > **Tu cuenta no tiene acceso a ningún consultorio.**
  > Iniciaste sesión como `<email>`. Si trabajás en un consultorio que usa Numa, pedile a la
  > responsable que te dé acceso. [Usar otra cuenta]
- Más de una membresía (si D7 decide no ofrecer selector en el MVP):
  > **Tu cuenta tiene acceso a más de un consultorio.**
  > Por ahora Numa no permite elegir. Escribinos a soporte para resolverlo.
- Si se elige la variante "identidad pendiente" de D1, el aviso agrega: "Ya registramos tu pedido;
  vas a poder entrar cuando te den acceso."
- No se muestra si la cuenta existe en otro consultorio, ni el nombre de otro consultorio.

### 4.2 Panel

- Sin cambios de navegación. El nombre de la profesional en la barra lateral sale del consultorio
  de la sesión, no de `Professional(1)`.
- Membresía revocada a mitad de sesión: la siguiente navegación redirige a `/inicio` con el aviso
  de 4.1; una server action devuelve el error genérico existente ("No se pudo guardar") y la UI
  manda a `/inicio`.
- Id de otro consultorio: la misma página de "no encontrado" que ya existe (`not-found.tsx`).
- Si D3 define diferencias para `STAFF`: las secciones no permitidas no aparecen en la barra
  lateral, y entrar por URL muestra "No tenés permiso para ver esta sección."
- Si D4 incluye una UI mínima de miembros: pestaña **Ajustes → Equipo** (solo `OWNER`), lista de
  miembros (email, rol) y, según lo que se valide, alta por email o quitar acceso. Sin esto, el
  alta sigue por script.

### 4.3 Portal

- Link válido: igual que hoy.
- Link inválido, vencido, manipulado o de una cookie vieja: el aviso actual de `/portal?error=invalid`
  ("pedí un link nuevo por WhatsApp" o el texto vigente en el portal; no se cambia el texto salvo
  que D9 lo pida).

### 4.4 Bot de WhatsApp

- **Sin mensajes nuevos.** La opción 4 del menú sigue mandando el mismo texto con el link; cambia
  solo el contenido del token. La IA del bot responde igual, con datos del consultorio de la
  conversación.

### 4.5 Acceso de plataforma

- Depende de D2. Propuesta mínima: no hay pantalla nueva; el acceso de soporte es una membresía
  explícita y temporal otorgada por script, que queda auditada. Si se quiere un modo "soporte"
  visible, el panel muestra una franja fija: "Estás viendo el consultorio <nombre> como soporte de
  Arzium. Cada acción queda registrada."

---

## 5. Fuera de alcance

- **Registro de consultorios nuevos, creación de tenant y cuenta `OWNER` desde la web,
  onboarding, invitaciones completas** → HU-026 (salvo lo mínimo que se decida en D4).
- **WhatsApp multi-sesión**: resolver tenant por conexión receptora, colas y crons por tenant →
  HU-027. En HU-025 el bot sigue con un solo número y un solo consultorio; solo se cambia la IA del
  bot (y lo que lea `getProfessional()` en el bot) para que use el tenant de la conversación.
- **Google Calendar, Mercado Pago de señas y configuración de IA por consultorio** (token del
  calendario por tenant, cuenta MP por tenant, cuotas de DeepSeek) → HU-028. HU-025 sí reemplaza el
  chequeo de `allowedEmails` del callback OAuth de Mercado Pago por el contexto de tenant, pero no
  generaliza las credenciales.
- **Suscripción, licencia, suspensión** y el gate de licencia en el login → HU-029/HU-030.
- **Matriz completa de QA multi-tenant, observabilidad y runbooks de lanzamiento** → HU-031.
  HU-025 deja sus tests negativos propios, no la matriz entera.
- Selector de consultorio para usuarios con varias membresías (salvo que D7 lo pida).
- Login con algo que no sea Google (email y contraseña, magic link).
- Múltiples agendas o profesionales dentro de un consultorio.
- Retirar los índices y columnas de compatibilidad legacy de HU-024 en la base (endurecer
  `tenantId` a `NOT NULL`, etc.), salvo que el `architect` muestre que hace falta acá.
- RLS en Postgres implementado (ver D5; la propuesta es dejarlo evaluado y documentado).

---

## 6. Notas de implementación (mínimas; el detalle lo escribe el `architect`)

- `getTenantContext()` generaliza `resolvePrivateContentAccess()`: misma lectura de membresía por
  operación, más la agenda primaria y la profesional del tenant. Lugar natural: `apps/web/src/lib`
  (server-only) y, para lo que comparten web y bot, una función de `packages/db/domain` que reciba
  el scope explícito. El bot no tiene sesión: su scope sale de la conexión de WhatsApp (hoy, el
  consultorio original configurado).
- Las funciones de dominio que hoy llaman al adaptador legacy por dentro deberían recibir el scope
  por parámetro, para que web y bot lo pasen. Impacta las firmas de `packages/db/domain` → typecheck
  en `apps/web` **y** `apps/bot` (ver `AGENTS.md`, "El contrato de este repo").
- `getProfessional()` con `id: 1` y `professionalAssets.ts` deberían pasar a resolver la profesional
  principal del tenant recibido.
- El middleware corre en Edge sin Prisma: solo puede comprobar que el JWT tenga un usuario
  vinculado. La comprobación de membresía vive en el layout del panel, cada server action y cada
  ruta API.
- Un id ajeno se trata igual que uno inexistente (como ya hacen recetas y plantillas).
- Cambiar el formato del token del portal invalida las cookies existentes. En producción no hay
  pacientes cargados, así que el impacto hoy es nulo; conviene salir antes de que haya.
- Si se agrega rol de plataforma, auditoría o identidad pendiente, la HU toca `schema.prisma` → label
  `migración` en el issue #68 y respetar las reglas de migraciones de `AGENTS.md`.
- Tests negativos: dos tenants sintéticos, en el patrón de los tests mockeados actuales y, para lo
  que dependa de la base, en Postgres descartable (como los `test-*-ownership.sh` de HU-024).

---

## 7. Propuesta de corte en entregas

La HU es grande: toca la autenticación, ~60 archivos del panel y el dominio, el portal, la IA y
posiblemente el schema. Propuesta (a validar en D6):

| Entrega | Contenido | Por qué así |
|---|---|---|
| **025a · Núcleo de sesión y acceso** | `getTenantContext()`; login por membresía en `signIn`/`jwt`/middleware/layout; reemplazo de `allowedEmails` en el callback OAuth de MP; procedimiento y ensayo de migración de Daiana y Joel; mensajes de "sin acceso". Mientras haya un solo consultorio en producción, el panel exige que el contexto sea `legacy-tenant` para usar los módulos que todavía usan el adaptador (y rechaza cualquier otro), así no hay fuga aunque se cree un segundo tenant antes de 025b. | Cierra la puerta principal primero y destraba la migración del login, que es lo urgente con Daiana entrando el 22/11. Es chica y revisable. |
| **025b · Panel y API sobre el contexto** | Migrar todos los módulos del panel, las rutas `/api/*`, el PDF de antropometría, ajustes/firma/logo, `/asistente` y la IA de planes al contexto de tenant; firmas de dominio con scope explícito; retirar el adaptador legacy del lado web; tests negativos de ids cruzados. | Es el grueso mecánico. Se puede revisar por módulos (agenda, clínica, planes, pagos, avisos, ajustes) dentro de la misma entrega o partirse en 025b-1/025b-2 si el `architect` lo ve grande. |
| **025c · Portal, descargas del portal e IA del bot** | Token/cookie del portal con tenant y validación; descargas del portal; IA del bot y `getProfessional()` del bot con el scope de la conversación; tests de manipulación de token. | Independiente del panel; toca el bot (cuidado con WhatsApp real, ver `AGENTS.md`). |
| **025d · Acceso de plataforma (opcional)** | Rol de plataforma, mecanismo de acceso de soporte y auditoría. | Hoy no hay clientes externos. Se puede postergar hasta antes de HU-030/HU-031 sin riesgo, si D2 lo decide. |

Orden: 025a → 025b → 025c (025c puede ir en paralelo con 025b si no se pisan firmas de dominio);
025d cuando D2 lo defina. La evaluación de RLS (D5) puede ir como apartado de la SDD de 025b.

---

## 8. Dudas para validar con el usuario

**D1. `ALLOWED_EMAILS` y migración del login de Daiana y Joel.** Hoy los dos entran solo por la
lista y no tienen membresía en producción. HU-024 prohibió que la lista otorgue membresía. Opciones:

- (a) **Retirar `ALLOWED_EMAILS` del todo.** Antes del deploy, correr `legacy-memberships` en
  producción con un padrón con el `sub` de Google de cada uno. Problema: hay que conseguir el `sub`
  (se puede sacar de un login de prueba, del JWT o de la consola de Google; ninguno es cómodo para
  Daiana).
- (b) **Retirarla, con "identidad pendiente".** Un login con Google sin membresía guarda `sub` y
  email verificados como `User` sin membresía (no entra). El operador corre un script que otorga la
  membresía a ese `User` por email. Sin pedirle nada técnico a Daiana. Requiere una pequeña
  migración o reutiliza `User` tal como está.
- (c) **Dejarla como respaldo temporal**: la lista ya no da acceso por sí sola, pero mientras exista
  un email en la lista sin `User`, el primer login con email verificado crea el `User` y la
  membresía en `legacy-tenant`. Es más cómodo pero contradice la decisión S24 de HU-024 y abre una
  puerta si alguien edita la variable.

¿Cuál preferís? (Recomendación del afinador: b, y borrar `ALLOWED_EMAILS` del `.env.example`, de
`deploy/.env.example`, del seed y del README en la misma entrega). ¿Y qué rol lleva cada uno:
Daiana `OWNER`? ¿Joel `OWNER`, `STAFF` o acceso de plataforma (D2)?

**D2. `PLATFORM_ADMIN` (acceso de Arzium).** ¿Entra en esta HU o se posterga (ver 025d)? Si entra:

- ¿Qué puede hacer? (a) Solo operaciones de plataforma sin ver datos clínicos (listar
  consultorios, estado); (b) además entrar a un consultorio como soporte.
- ¿Cómo se otorga? Propuesta: solo por script contra la base, nunca desde la UI ni por variable de
  entorno.
- Si hay acceso de soporte a un consultorio: ¿requiere consentimiento del consultorio, tiene
  vencimiento, es solo lectura?
- ¿Cómo se audita? Propuesta: tabla append-only con usuario, consultorio, momento y tipo de acción
  (sin contenido). ¿Alguien la revisa desde la UI o alcanza con consultarla en la base?
- Relacionado: hoy Joel ve el panel de producción de Daiana. Cuando haya pacientes reales, ¿Joel
  debería seguir teniendo membresía en su consultorio, o pasar a acceso de soporte auditado?
  ¿Daiana está al tanto y de acuerdo?

**D3. Diferencias entre `OWNER` y `STAFF` en el MVP.** Hoy son iguales en recetas y plantillas, y
no hay ningún `STAFF` real. Opciones: (a) iguales en todo; (b) `STAFF` igual que `OWNER` salvo
ajustes sensibles (Mercado Pago, WhatsApp, Google Calendar, pausa del bot, IA del bot, firma) y la
gestión de miembros; (c) otra cosa (p. ej. `STAFF` sin acceso a datos clínicos, tipo secretaria que
solo maneja turnos y pagos). ¿Hay hoy un caso real de secretaria o colaboradora en el consultorio
de Daiana? Recomendación: (b) si hay UI de miembros (D4); (a) si no.

**D4. ¿UI mínima para dar de alta o quitar usuarios del consultorio?** (a) No: sigue por script y
todo queda para HU-026. (b) Mínima: **Ajustes → Equipo** para el `OWNER`, con lista de miembros y
quitar acceso. (c) (b) + alta por email (la persona entra con Google y queda vinculada si su email
verificado coincide). Ojo: (c) es una invitación, y HU-026 ya plantea "proceso seguro de
invitación". Recomendación: (a) o (b), dejando la invitación para HU-026.

**D5. RLS en Postgres.** El issue pide investigarlo. Complicaciones: Prisma usa un pool de
conexiones y no tiene soporte nativo de RLS (habría que hacer `set_config('app.tenant_id', …)`
dentro de cada transacción); el bot y los crons recorren varios tenants y necesitarían un rol que
lo saltee; las migraciones de HU-024 ya tienen triggers y funciones `SECURITY DEFINER`. ¿Se
(a) implementa RLS en esta HU, (b) se hace una prueba de concepto en una tabla (p. ej. `Patient`)
y se documenta, o (c) se deja solo documentado con el análisis para HU-031? Recomendación: (c) o
(b); la barrera de esta HU es el contexto del lado servidor más los tests negativos.

**D6. Corte de la HU.** ¿Aceptás el corte 025a/025b/025c/025d de la sección 7, o preferís otro
(p. ej. 025b partido por módulos, o 025d fuera de HU-025 y adentro de HU-030)? ¿Se mantiene el
número HU-025 con sufijos o se reservan issues nuevos?

**D7. Usuario con más de una membresía.** En el MVP nadie la tiene. ¿Se rechaza el login (como hace
hoy `resolvePrivateContentAccess()`) o se agrega un selector de consultorio? Si es selector, ¿el
consultorio elegido se guarda en la sesión (firmada) o se elige en cada login? Recomendación:
rechazar en esta HU, con el mensaje de 4.1.

**D8. Revocación de sesiones del panel.** La propuesta es que la membresía se lea en cada request,
así que quitarla corta el acceso enseguida. ¿Hace falta además poder "cerrar todas las sesiones"
de un usuario sin quitarle la membresía (p. ej. si pierde el celular)? Si sí, hace falta un campo
de versión de sesión en `User` (migración).

**D9. Sesión del portal.** (a) ¿Alcanza con atar token y cookie a un tenant, o también hace falta
poder invalidar el portal de un paciente antes de los 30 días (p. ej. al archivarlo o si cambió de
teléfono)? (b) ¿Se acepta que, al salir esta entrega, toda cookie `patient_session` existente deje
de valer y el paciente tenga que pedir un link nuevo? (Hoy no hay pacientes en producción.)
(c) ¿Un paciente archivado (HU-019) puede seguir entrando al portal?

**D10. Google Calendar durante la transición.** El token del calendario se guarda por
`GOOGLE_CALENDAR_OWNER_EMAIL` sobre la agenda original. ¿Se deja así hasta HU-028, o en HU-025 se
pasa a "solo el `OWNER` del tenant de la sesión puede guardar el token de su agenda"? Recomendación:
dejarlo hasta HU-028, pero exigiendo que quien inicia sesión tenga membresía en `legacy-tenant`.

**D11. Logs.** Hay ~26 `console.log/error/warn` en web, bot y dominio. ¿La HU incluye revisarlos
todos para garantizar que no salgan tokens ni datos clínicos, o solo los que tocan autenticación,
portal e IA? Recomendación: solo los que tocan las piezas de esta HU; el resto, HU-031
(observabilidad).

---

## 9. Resoluciones del usuario (2026-11-21)

| Duda | Decisión |
|---|---|
| **D1** | **(b)** Se retira `ALLOWED_EMAILS` (también de `.env.example`, `deploy/.env.example`, seed y README). Un login con Google sin membresía queda como `User` "pendiente" con `sub` y email verificados, sin acceso. El operador le otorga la membresía con un script que lo busca por email. Roles: **Daiana `OWNER`** del consultorio original. **Joel no lleva membresía**: entra con acceso de soporte (D2). |
| **D2** | **Entra en esta HU.** Acceso de plataforma de Arzium separado de `TenantRole`. Se otorga solo por script, nunca desde la UI ni por variable de entorno. El acceso de soporte a un consultorio queda **registrado en una auditoría append-only** (quién, consultorio, cuándo, tipo de acción, sin datos clínicos ni tokens), con la franja visible de "modo soporte" de 4.5. El architect propone vencimiento y si es solo lectura. |
| **D3** | **(a)** `OWNER` y `STAFF` tienen los mismos permisos sobre los datos. Daiana no tiene secretaria. La única diferencia es que la pantalla Equipo (D4) solo la ve el `OWNER`. |
| **D4** | **(b)** Pantalla **Ajustes → Equipo**, solo para el `OWNER`: lista de miembros (email y rol) y quitar acceso. Dar de alta sigue por script; las invitaciones quedan para HU-026. |
| **D5** | **(c)** RLS queda analizado y documentado en la SDD, sin implementarlo. La barrera es el contexto del lado servidor más los tests negativos. |
| **D6** | Se acepta el corte **025a → 025b → 025c → 025d**, numerado con sufijos sobre el issue #68. Como D2 entra, 025d deja de ser opcional. |
| **D7** | Se rechaza el login con más de una membresía, con el mensaje de 4.1. Sin selector. |
| **D8** | No hace falta "cerrar todas las sesiones": la membresía se lee en cada request. |
| **D9** | (a) Alcanza con atar token y cookie a un tenant; no hace falta revocar antes de los 30 días. (b) Se acepta que las cookies `patient_session` existentes dejen de valer (en producción no hay pacientes). (c) **Un paciente archivado sí puede seguir entrando al portal.** |
| **D10** | El token de Google Calendar sigue por `GOOGLE_CALENDAR_OWNER_EMAIL` hasta HU-028, pero quien inicia sesión tiene que tener membresía en `legacy-tenant`. |
| **D11** | Se revisan solo los logs de las piezas que toca esta HU; el resto, en HU-031. |

**Consecuencia:** la HU toca `schema.prisma` (rol de plataforma, auditoría, identidad pendiente), así que el issue #68 lleva la label `migración`.
