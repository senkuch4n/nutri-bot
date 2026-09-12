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
- Credenciales OAuth de Google (Client ID / Secret) con el scope de Google Calendar

## Puesta en marcha (desarrollo)

```bash
# 1. Dependencias
npm install

# 2. Variables de entorno
cp .env.example .env
#   Completá GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, AUTH_SECRET (string aleatorio),
#   ALLOWED_EMAILS (tu cuenta de Google) y PROFESSIONAL_JID (opcional, para alertas).

# 3. Base de datos
#    Si el puerto 5432 está ocupado, poné otro en .env (DB_PORT) y ajustá DATABASE_URL.
docker compose up -d db
npm run db:generate
npm run db:deploy       # aplica la migración inicial (o `npm run db:migrate` en desarrollo)
npm run db:seed         # crea la ficha de la profesional, servicios y horario de ejemplo

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

En **Ajustes → Google Calendar**, "Conectar". Se pide el consentimiento con el scope de
calendario y se guarda el `refresh_token`. Definí `googleCalendarId` (`primary` u otro) en
Ajustes. El proceso del bot reconcilia los turnos con el calendario cada minuto.

## Scripts

| Comando | Qué hace |
|---|---|
| `npm run dev` | Panel Next.js |
| `npm run dev:bot` | Proceso del bot |
| `npm run db:migrate` | Crea/aplica migraciones (desarrollo) |
| `npm run db:deploy` | Aplica migraciones (producción) |
| `npm run db:seed` | Datos iniciales |
| `npm run db:studio` | Prisma Studio |
| `npm run test` | Tests de `packages/core` |
| `npm run typecheck` | `tsc` en todos los workspaces |
| `npm run build` | Build de `core` + `web` + `bot` |

## Despliegue (VPS con Docker)

```bash
cp .env.example .env         # con los valores de producción y AUTH_URL público
docker compose --profile deploy up -d --build
docker compose run --rm web npx prisma migrate deploy --schema packages/db/prisma/schema.prisma
docker compose run --rm web node -e "require('child_process')"  # (opcional) seed manual
docker compose logs -f bot   # para escanear el QR la primera vez
```

El volumen `whatsapp-auth` persiste la sesión de WhatsApp entre reinicios.

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
| Profesional: registrar y graficar evolución del paciente | Panel → paciente → "Evolución" |
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

### Portal del paciente

Acceso sin cuenta ni contraseña: el paciente pide el portal por WhatsApp (opción 4 del menú, o
escribiendo "portal"), el bot manda un link firmado que vale 15 minutos, y al abrirlo queda
logueado en el portal por 30 días (cookie propia, separada del login de la profesional). No usa
Auth.js — es un token HMAC con `AUTH_SECRET` sin estado en el servidor.

### Mercado Pago (cobros)

Para que funcione de verdad, completá `MERCADOPAGO_ACCESS_TOKEN` en `.env` (credenciales de prueba
mientras se testea, de producción para cobrar). Con el token vacío, reservar un servicio con seña
por WhatsApp falla al intentar generar el link de pago — no rompe el resto del bot.

El webhook de Mercado Pago pega contra `${AUTH_URL}/api/webhooks/mercadopago`: en producción
`AUTH_URL` ya es una URL pública, pero en desarrollo local (`localhost`) Mercado Pago no puede
llegar a notificar el pago — para probar el flujo completo en local hace falta exponer el panel
con algo como `ngrok` y setear `AUTH_URL` a esa URL pública mientras se prueba.

Una reserva con seña queda en estado "Esperando pago" (no se confirma ni bloquea el turno en la
agenda visible) y se libera sola a los 15 minutos si no se completa el pago.

Backlog de historias inspiradas en NutriDesk (competencia), con las épicas pendientes:
[`docs/historias-usuario-nutridesk.md`](docs/historias-usuario-nutridesk.md).
