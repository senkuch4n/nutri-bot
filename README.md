# NutriBot

Sistema de turnos para una nutricionista con dos piezas:

- **Bot de WhatsApp** (`apps/bot`) — atiende a los pacientes con Baileys: sacar turno,
  cancelar turno, ver precios. Respuestas automáticas guiadas por una máquina de estados.
- **Panel web** (`apps/web`) — Next.js con login por Google. La profesional ve el calendario,
  crea/cancela turnos, administra servicios y precios, define su disponibilidad y envía avisos.

La **base de datos es la única fuente de verdad**. El bot y el panel se comunican a través de
ella (tabla `OutboundMessage` como cola de mensajes salientes). Los turnos confirmados se
sincronizan de una vía hacia Google Calendar.

## Estructura

```
apps/
  web/    Panel Next.js (App Router)
  bot/    Proceso Node: Baileys + cola de envíos + cron de recordatorios + sync Google Calendar
packages/
  core/   Lógica de dominio pura (disponibilidad, formato, textos). Con tests.
  db/     Prisma (schema, cliente, migraciones, seed) + `db/domain` (operaciones compartidas)
```

## Requisitos

- Node.js 20+
- Docker (solo para la base de datos en desarrollo)
- Credenciales OAuth de Google (Client ID / Secret). El login pide solo `openid email profile`; el
  scope de Google Calendar se pide aparte, desde Ajustes (HU-028b)

## Puesta en marcha (desarrollo)

```bash
# 1. Dependencias
npm install

# 2. Variables de entorno
cp .env.example .env
#   Completá GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, AUTH_SECRET (string aleatorio)
#   y PROFESSIONAL_JID (opcional, para alertas). El acceso al panel se da por membresía
#   (ver "Acceso al panel" más abajo); SEED_PROFESSIONAL_EMAIL (opcional) es el email de la
#   ficha de la profesional que crea el seed.

# 3. Base de datos
#    Si el puerto 5432 está ocupado, poné otro en .env (DB_PORT) y ajustá DATABASE_URL.
docker compose up -d db
npm run db:generate
npm run db:deploy       # aplica la migración inicial (o `npm run db:migrate` en desarrollo)
npm run db:seed         # crea la ficha de la profesional, servicios y horario de ejemplo
npm run sara2:load      # carga la base de alimentos SARA 2 (idempotente)

# 4. Levantar todo
npm run dev             # panel en http://localhost:3000
npm run dev:bot         # bot de WhatsApp (en otra terminal)
```

En Google Cloud Console, configurá el **redirect URI** de OAuth como
`http://localhost:3000/api/auth/callback/google`.

### Vincular WhatsApp

Con el bot corriendo, abrí **Ajustes → WhatsApp** (`/ajustes/whatsapp`) en el panel y escaneá
el QR (también aparece en la terminal del bot). La sesión se guarda en `WHATSAPP_AUTH_DIR`.

> Baileys es una librería **no oficial**. Usá un número dedicado. Si la sesión se cierra
> (logout), borrá la carpeta de `WHATSAPP_AUTH_DIR` y volvé a escanear.

### El bot no responde a todo

Como el número puede ser el personal/profesional de la nutricionista (con contactos
familiares), el bot **queda en silencio por defecto**: solo se activa cuando alguien escribe
una **palabra clave** (`turno`, `turnos`, `menú`, `reservar`, `agenda`, `cita`). A partir de
ahí atiende la conversación guiada hasta que:

- se completa el flujo, o
- la persona escribe `salir` / `chau` / `listo gracias`, o
- pasan `BOT_SESSION_TIMEOUT_MIN` minutos sin actividad.

Después vuelve a silencio. Cualquier mensaje que no sea palabra clave (ni parte de una
conversación abierta) se ignora sin responder.

Además, en **Ajustes → Bot de WhatsApp** hay un interruptor para **apagar el bot por
completo** (no responde nada, ni siquiera a las palabras clave).

### Google Calendar

Cada consultorio conecta **su** calendario (HU-028b). La responsable (OWNER) entra a **Ajustes →
Google Calendar** y toca "Conectar Google Calendar": es un permiso aparte del login (el login con Google
pide solo `openid email profile` y nunca da acceso al calendario). Google pide el scope
`calendar.events`; el `refresh_token` se guarda **cifrado** (AES-256-GCM) con `INTEGRATION_TOKEN_KEY`
en `GoogleCalendarAccount`. "Opciones avanzadas" permite usar otro calendario (vacío = el principal).
"Desconectar" borra el token y lo revoca en Google; los eventos ya creados quedan.

- Redirect URI a cargar en Google Cloud Console (cliente OAuth web de Numa, además de la del login):
  `<AUTH_URL>/api/google-calendar/oauth/callback` (en desarrollo,
  `http://localhost:3000/api/google-calendar/oauth/callback`).
- El bot sincroniza cada minuto, por consultorio conectado (solo escritura: crea, mueve y borra los
  eventos de los turnos; nunca lee el calendario). Ningún dato de Google llega a la IA.
- Probe sin red: `npm run test:gcal-tenants --workspace packages/db` (Postgres descartable).

## Scripts

| Comando | Qué hace |
|---|---|
| `npm run dev` | Panel Next.js (con Turbopack; si algo falla, `npm run dev:webpack --workspace apps/web` usa el compilador anterior) |
| `npm run dev:bot` | Proceso del bot |
| `npm run db:migrate` | Crea/aplica migraciones (desarrollo) |
| `npm run db:deploy` | Aplica migraciones (producción) |
| `npm run db:seed` | Datos iniciales |
| `npm run db:studio` | Prisma Studio |
| `npm run test` | Tests de `packages/core` |
| `npm run typecheck` | `tsc` en todos los workspaces |
| `npm run build` | Build de `core` + `web` + `bot` |
| `npm run sara2:read` | Lee el PDF de SARA 2 (`pdftotext -bbox`, poppler) y regenera `packages/db/data/sara2/alimentos.json` y `reporte.md`. Solo desarrollo; no toca la base |
| `npm run sara2:load` | Carga `alimentos.json` en la base: upsert por clave de origen, idempotente, no toca los alimentos propios ni borra (desactiva los que salieron). `-- --dry-run` para ver qué haría |
| `npm run test:foods --workspace packages/db` | Prueba contra la base de desarrollo la carga de SARA 2 (en transacción revertida) y los alimentos propios (borra por id lo que crea) |
| `npm run test:confirm-flow --workspace apps/bot` | Simula sin WhatsApp real el flujo de confirmación de turno (sí/no) y las recomendaciones previas a un estudio; crea y borra sus propios datos de prueba |
| `npm run test:bot-ai --workspace apps/bot` | Simula sin WhatsApp real ni API de IA (proveedor falso) la opción 5 del bot (preguntas con IA): tools, límites, errores, derivación con 0 y retención; crea y borra sus propios datos de prueba |
| `npm run test:booking-reason --workspace apps/bot` | Simula sin WhatsApp real el paso del motivo de consulta al reservar (HU-013): salteo, muy corto/largo, comandos, audio, alerta con el motivo recortado, seña, edición y privacidad frente a la IA; crea y borra sus propios datos de prueba |

### Acceso al panel (HU-025)

Al panel entra quien tiene una **membresía vigente** en un consultorio, leída en la base en cada
request; no hay lista de emails. El primer login con Google de una cuenta sin membresía la deja
registrada como **identidad pendiente** (ve "Tu cuenta no tiene acceso a ningún consultorio") y el
operador le da acceso por email con `packages/db/scripts/tenant-access.ts`. Todos los subcomandos
son dry-run salvo `--apply`, y necesitan `DATABASE_URL` explícita (no cargan `.env`):

```bash
npm run tenant-access --workspace packages/db -- pending                     # identidades pendientes
npm run tenant-access --workspace packages/db -- members --tenant legacy-tenant
npm run tenant-access --workspace packages/db -- grant --email <email> --tenant legacy-tenant --role OWNER --apply
npm run tenant-access --workspace packages/db -- revoke --email <email> --tenant legacy-tenant --apply
npm run tenant-access --workspace packages/db -- forget-pending --email <email> --apply
```

Revocar una membresía corta el acceso en la siguiente página, ruta API o server action. Procedimiento
de producción: [`deploy/README.md`](deploy/README.md#acceso-al-panel-por-membresía-hu-025).

### Membresías del consultorio original (HU-024)

Antes de activar la autorización por tenant en el panel: **migrá el esquema → aplicá el padrón revisado → desplegá la web con la nueva autorización**. El esquema solo agrega el identificador de Google; no otorga accesos. Ver [procedimiento y formato del padrón](Refactorizaciones/modelo-multi-tenant.md#membresías-del-consultorio-original-t2e1a).

## Despliegue (VPS con Docker)

```bash
cp .env.example .env         # con los valores de producción y AUTH_URL público
docker compose --profile deploy up -d --build
docker compose run --rm web npx prisma migrate deploy --schema packages/db/prisma/schema.prisma
docker compose run --rm bot npm run sara2:load:prod --workspace packages/db   # base SARA 2 (idempotente)
docker compose run --rm web node -e "require('child_process')"  # (opcional) seed manual
docker compose logs -f bot   # para escanear el QR la primera vez
```

El volumen `whatsapp-auth` conserva la sesión original de WhatsApp. El volumen separado
`whatsapp-auth-sessions` conserva las credenciales de las sesiones vinculadas desde el
panel, en carpetas por consultorio y vinculación. No montes el volumen nuevo dentro
de la carpeta de la sesión original.

La carga de SARA 2 va **después** de `migrate deploy` y se puede repetir en cada deploy: lee
`packages/db/data/sara2/alimentos.json` (versionado), no necesita `pdftotext` y nunca toca los
alimentos propios. Si la imagen del bot no trae `tsx`, correrla desde una máquina de desarrollo
con la `DATABASE_URL` de producción por túnel: `DATABASE_URL=… npx tsx packages/db/scripts/sara2/load.ts`.

(Opcional, HU-018d) Convertir las "Unidad de referencia" legibles (`1 taza ≈ 180 g`) en medidas caseras:
`npm run measures:convert-hints:prod --workspace packages/db` corre en seco e imprime el reporte; si está
bien, repetir con `-- --apply` (una transacción, idempotente, no toca `unitHint` ni los planes).

## Historias de usuario cubiertas

| Historia | Dónde |
|---|---|
| Paciente: activar el bot | Escribir `turno` / `menú` / `reservar` (fuera de eso, silencio) |
| Paciente: ver turnos disponibles | Bot → "Sacar un turno" |
| Paciente: cancelar un turno | Bot → "Cancelar un turno" |
| Paciente: ver precios | Bot → "Ver precios" |
| Profesional: ver calendario | Panel `/` |
| Profesional: cancelar turno | Panel → detalle del turno |
| Profesional: crear/editar servicio | Panel `/servicios` |
| Profesional: enviar avisos | Recordatorios automáticos + "Enviar recordatorio ahora" |
| Profesional: crear turno para un paciente | Panel → "Nuevo turno" |
| Profesional: ficha clínica del paciente (antecedentes/objetivos) | Panel → paciente → "Ficha clínica" |
| Profesional: registrar y graficar evolución del paciente | Panel → paciente → "Evolución" (gráficos con [MUI X Charts](https://mui.com/x/react-charts/)) |
| Profesional: base de alimentos con macros | Panel `/alimentos` |
| Profesional: armar plan alimenticio por comidas | Panel → paciente → "Planes nutricionales" |
| Profesional: plantillas de planes reutilizables | Panel `/plantillas` → "Aplicar plantilla" |
| Profesional: PDF del plan con su logo | Panel → plan → "Generar PDF" (logo en `/ajustes`) |
| Paciente: recibir el plan vigente | Panel → plan → "Enviar por WhatsApp" (como documento) |
| Profesional: registrar medidas antropométricas (talla, cintura, cadera, pliegues) | Panel → paciente → "Evolución" → "Agregar medidas antropométricas" |
| Profesional: ver evolución de las medidas e índices (IMC, ICC) | Panel → paciente → "Evolución" |
| Paciente: pagar una seña para confirmar la reserva | Bot → link de pago de Mercado Pago tras reservar (solo servicios con seña) |
| Profesional: configurar seña por servicio | Panel `/servicios` → "Requiere seña" |
| Profesional: ver pagos pendientes y facturación del mes | Panel `/pagos` |
| Paciente: acceder a un portal web sin instalar nada | Bot → opción 4 del menú ("Ver mi portal") → link mágico |
| Paciente: ver su plan, próximo turno y evolución | Portal `/portal`, `/portal/plan`, `/portal/evolucion` |
| Paciente: diario alimentario con fotos | Portal `/portal/diario` |
| Paciente: descargar el PDF de su plan | Portal → plan → "Descargar PDF" |
| Profesional: pedirle a una IA una propuesta de plan desde la ficha del paciente | Panel → plan vacío → "Generar propuesta con IA" |
| Profesional: consultarle a una IA datos de agenda o de un paciente puntual | Panel `/asistente` |
| Profesional: enviar un aviso a todos los pacientes a la vez | Panel `/avisos` → "Comunicado a todos los pacientes" |
| Paciente: confirmar o avisar que no asiste a un turno 3 días antes | Automático (cron) → WhatsApp pide confirmación; "no" cancela el turno |
| Profesional: marcar antecedentes de riesgo (alergias/enfermedades) | Panel → paciente → "Ficha clínica" → "Marcar como antecedente de riesgo" (banner de alerta en la ficha) |
| Profesional: ver la edad del paciente y la fibra del plan | Panel → paciente → fecha de nacimiento en "Datos"; edad y fibra en "Planes nutricionales" y en el PDF/portal |
| Profesional: ver el diario alimentario del paciente (últimas 24 hs) | Panel → paciente → "Diario alimentario (portal)" |
| Profesional: indicar las obras sociales con las que trabaja | Panel `/ajustes` → "Obras sociales" (el bot lo muestra al listar precios; también visible en el portal) |
| Profesional: mandar recomendaciones automáticas antes de un estudio (antropometría, bioimpedancia) | Panel `/servicios` → "Mandar recomendaciones antes del turno" (se envía por WhatsApp X horas antes) |
| Profesional: registrar datos de bioimpedancia (grasa, masa muscular, agua, grasa visceral, masa ósea, metabolismo basal) | Panel → paciente → "Evolución" → "Agregar datos de bioimpedancia" |
| Profesional: ver gráficos separados por tipo de estudio (antropometría vs. bioimpedancia) y un comparativo peso vs. grasa corporal | Panel → paciente → "Evolución" (solo muestra los grupos que tienen datos cargados) |
| Profesional: personalizar el PDF del plan (color de acento y pie de página) | Panel `/ajustes` → "Color de acento del PDF" / "Pie de página del PDF" |

Queda pendiente reservas por Instagram, bloqueado por no tener todavía una app de Meta for
Developers ni una página de Facebook vinculada.

Con esto se completó el backlog de `docs/historias-usuario-nutridesk.md`.

### Datos de ejemplo para mostrar el sistema

`npm run seed:demo --workspace packages/db` agrega 5 pacientes ficticios con ficha clínica,
evolución (para que los gráficos tengan datos), turnos en distintos estados (confirmado,
completado, cancelado, ausente), un plan activo cada uno y algún pago — para tener algo real que
mostrar sin usar los datos de pacientes de verdad. Usalo solo en una instalación de prueba, con
la agenda, los servicios y los alimentos de ejemplo del consultorio original ya provisionados.
Si alguno de los identificadores de WhatsApp de ejemplo ya está ocupado, el seed aborta sin
modificar pacientes existentes ni duplicar turnos, evoluciones o planes.

### Asistente con IA (DeepSeek)

Usa `deepseek-chat` vía `API_KEY_IA_DEEPSEEK` (formato compatible con la API de OpenAI). Dos usos:

- **Generar plan**: en un plan vacío, arma una propuesta de comidas usando la ficha clínica y la
  base de alimentos — la IA elige alimentos y cantidades, pero los macros los calcula el código
  (no la IA), así que siempre son exactos. Es un borrador: la profesional lo revisa y ajusta antes
  de mandarlo.
- **`/asistente`**: preguntas en lenguaje natural sobre la agenda, un paciente puntual o la
  facturación. Responde solo con datos reales consultados en el momento (nunca inventa turnos,
  pacientes ni montos) y aclara cuando algo está fuera de lo que puede consultar.

Ambos usos mandan datos del consultorio (y, en el resumen de paciente, antecedentes/objetivos
clínicos) a la API de DeepSeek. Tenelo en cuenta para lo que cargues en la ficha clínica.

### IA por consultorio (HU-028c)

- **IA del bot:** cada pregunta (`BotAiQuestion`) queda en el consultorio de su paciente (`tenantId`,
  garantizado por una FK compuesta). El tope diario "global" es **por consultorio** (el uso de uno no consume
  el cupo de otro) y el del paciente se cuenta dentro de su consultorio. Las tools de la IA (servicios,
  disponibilidad, mis turnos, datos del consultorio) leen solo el consultorio de la conversación.
- **Topes:** sin valor propio, cada consultorio usa `BOT_AI_DAILY_PER_PATIENT` / `BOT_AI_DAILY_GLOBAL` del
  `.env`. Arzium los cambia por script (sin UI), con dry-run por defecto:
  ```bash
  DATABASE_URL=... npm run ai-limits --workspace packages/db -- show --tenant <id>
  DATABASE_URL=... npm run ai-limits --workspace packages/db -- set --tenant <id> --per-tenant 50 [--per-patient default] --apply
  ```
  Valores 0..100000 o `default` (vuelve al `.env`).
- **IA del panel** (asistente y "Generar con IA"): cada uso deja una fila en `PanelAiUsage` (consultorio,
  función, fecha, proveedor, modelo, tokens, llamadas, resultado) **sin** la pregunta, la respuesta ni datos de
  pacientes. No bloquea ni se le muestra a la profesional (el tope del panel llega con HU-030).
- Probe en Postgres descartable: `npm run test:ai-tenants --workspace packages/db`.

### Portal del paciente

Acceso sin cuenta ni contraseña: el paciente pide el portal por WhatsApp (opción 4 del menú, o
escribiendo "portal"), el bot manda un link firmado que vale 15 minutos, y al abrirlo queda
logueado en el portal por 30 días (cookie propia, separada del login de la profesional). No usa
Auth.js — es un token HMAC con `AUTH_SECRET` sin estado en el servidor.

### Mercado Pago (cobros)

Las señas se cobran en la cuenta de Mercado Pago que la profesional conecta desde **Ajustes →
Mercado Pago** (HU-023, ver abajo). Sin cuenta conectada, el bot no reserva servicios con seña:
le contesta al paciente que la seña no está disponible y le avisa a la profesional (como mucho un
aviso cada 24 h) — no rompe el resto del bot.

El webhook de Mercado Pago pega contra `${AUTH_URL}/api/webhooks/mercadopago`: en producción
`AUTH_URL` ya es una URL pública, pero en desarrollo local (`localhost`) Mercado Pago no puede
llegar a notificar el pago — para probar el flujo completo en local hace falta exponer el panel
con algo como `ngrok` y setear `AUTH_URL` a esa URL pública mientras se prueba.

Una reserva con seña queda en estado "Esperando pago" (no se confirma ni bloquea el turno en la
agenda visible) y se libera sola a los 15 minutos si no se completa el pago.

### Mercado Pago: vincular la cuenta (HU-023)

1. **Aplicación "Numa"** (Mercado Pago Developers → Tus integraciones → Numa):
   - URL de redireccionamiento exacta: `https://<dominio>/api/mercadopago/oauth/callback` (el origen
     de `AUTH_URL` + esa ruta; hoy `https://numa.arzium.com.ar/api/mercadopago/oauth/callback`).
     Si cambia el dominio, hay que actualizarla en la aplicación.
   - **Habilitar PKCE** (el panel manda `code_challenge` S256).
   - Confirmar que los permisos incluyen `offline_access`: sin eso Mercado Pago no deja renovar el
     permiso y la cuenta queda "Hay que reconectar" a los 180 días.
   - Notificaciones (webhooks) con la clave secreta = `MERCADOPAGO_WEBHOOK_SECRET`.
2. **Variables** (`.env` / `deploy/.env`, en web **y** bot): `MERCADOPAGO_CLIENT_ID`,
   `MERCADOPAGO_CLIENT_SECRET` y `MERCADOPAGO_TOKEN_KEY` (`openssl rand -base64 32`; cifra los tokens
   en la base, así una copia de la base sola no alcanza para usarlos). Cambiar la clave obliga a
   reconectar. El bot también necesita `AUTH_URL` (renueva el permiso una vez por día).
3. **Conectar** desde Ajustes → Mercado Pago con la cuenta que cobra (hoy la de Joel; después la de
   la Lic. Ponce: "Reconectar" con su cuenta).
4. **Pruebas sin plata:** crear usuarios de prueba (vendedor + comprador) desde la cuenta de
   developers dueña de "Numa". En dev se conecta el vendedor de prueba y se paga con el comprador
   (`MERCADOPAGO_SANDBOX=true npm run test:mercadopago-sandbox --workspace apps/bot`). En producción
   solo se aceptan cuentas reales (`live_mode`). Para desarrollo sin OAuth existe el respaldo
   explícito `MERCADOPAGO_ALLOW_ENV_TOKEN=true` + `MERCADOPAGO_ACCESS_TOKEN` (ignorado con
   `NODE_ENV=production`).
5. **Cambiar de cuenta o desconectar** cancela las señas pendientes de la cuenta anterior y les
   avisa a esos pacientes (como cuando vence la seña). La confirmación de "Desconectar" lo advierte.
6. Después de conectar en producción, borrar `MERCADOPAGO_ACCESS_TOKEN` del `.env` del VPS.

Backlog de historias inspiradas en NutriDesk (competencia), con las épicas pendientes:
[`docs/historias-usuario-nutridesk.md`](docs/historias-usuario-nutridesk.md).
