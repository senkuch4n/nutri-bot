# Implementación HU-011: mensajes fuera de horario

- **Estado:** `done`
- **SDD:** `Refactorizaciones/mensajes-fuera-de-horario.md` (la sección 15 tiene prioridad: la bandeja se llama **"Mensajes"**, ruta `(panel)/mensajes/`).
- **HU:** `docs/hu-mensajes-fuera-de-horario.md`
- **Rama:** `feat/hu-011-mensajes-fuera-de-horario`. Sin commits: lo decide el orquestador.
- **Skills:** `migracion-prisma` (al pie de la letra), `ui-ux-pro-max`, `ui-styling`, `web-design-guidelines` (autochequeo).
- **Corte a mitad:** la primera corrida se colgó (watchdog) al llegar a `inquiries.test.ts`. La segunda retomó desde el estado en disco. La migración y el respaldo **no** se repitieron.

## Preparación

- `git fetch origin && git diff --name-only HEAD origin/develop -- packages/db/prisma` → vacío (`develop` no trae cambios de schema ni migraciones). `git log HEAD..origin/develop` → vacío.
- `git diff --name-only HEAD...origin/feat/hu-010-recomen-micronut` → vacío (hoy la rama de la HU-010 no trae cambios respecto de esta).
- No toqué ningún archivo de la HU-010 (`plan-micronutrients*`, `micronutrient-recommendations*`, `plan-micronutrients.tsx`, `pacientes/[id]/planes/**`, `seed-hu010.ts`).

## Migración (skill `migracion-prisma`)

1. **Respaldo antes de aplicar:** `docker compose exec -T db pg_dump -U nutri -d nutribot -Fc > ~/nutribot-backups/pre-hu011-20261002-1850.dump` → **275K** (no pesa 0 bytes).
2. `prisma migrate status` previo → "Database schema is up to date!" (16 migraciones). Sin drift.
3. `npx dotenv -e ../../.env -- prisma migrate dev --create-only --name after_hours_inquiries` → `20261002215039_after_hours_inquiries`. No hubo drift ni ofrecimiento de reset.
4. Revisión del SQL: **idéntico** al esperado en la sección 3.2. Las 3 columnas de `Professional` son `NOT NULL` **con `DEFAULT`**. No hay ningún `DROP` ni `ALTER COLUMN ... TYPE`. SQL final:

```sql
-- CreateEnum
CREATE TYPE "InquiryStatus" AS ENUM ('PENDING', 'ANSWERED');

-- AlterTable
ALTER TABLE "Professional" ADD COLUMN     "afterHoursEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "afterHoursEnd" TEXT NOT NULL DEFAULT '09:00',
ADD COLUMN     "afterHoursStart" TEXT NOT NULL DEFAULT '22:00';

-- CreateTable
CREATE TABLE "PatientInquiry" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL,
    "lastMessageAt" TIMESTAMP(3) NOT NULL,
    "receivedAfterHours" BOOLEAN NOT NULL,
    "status" "InquiryStatus" NOT NULL DEFAULT 'PENDING',
    "answeredAt" TIMESTAMP(3),
    "digestedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PatientInquiry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PatientInquiry_status_receivedAt_idx" ON "PatientInquiry"("status", "receivedAt");

-- CreateIndex
CREATE INDEX "PatientInquiry_patientId_status_idx" ON "PatientInquiry"("patientId", "status");

-- AddForeignKey
ALTER TABLE "PatientInquiry" ADD CONSTRAINT "PatientInquiry_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;
```

5. `npm run db:migrate` → "Applying migration `20261002215039_after_hours_inquiries` … Your database is now in sync with your schema." Después, `npm run db:generate`.
6. No usé `migrate reset`, `db push`, `--shadow-database-url` con la base de desarrollo ni `migrate diff --from-migrations`.

## Archivos

**Nuevos**
- `packages/core/src/after-hours.ts`, `packages/core/src/after-hours.test.ts`
- `packages/db/prisma/migrations/20261002215039_after_hours_inquiries/migration.sql`
- `packages/db/domain/inquiries.ts`, `packages/db/domain/inquiries.test.ts`
- `apps/bot/scripts/test-after-hours-inquiry.ts`. **Se conserva a propósito:** la SDD lo pide como script del repo, con su entrada `test:after-hours`.
- `apps/web/src/app/(panel)/mensajes/{page.tsx,loading.tsx,mensajes-view.tsx,actions.ts}`
- `apps/web/src/app/(panel)/ajustes/after-hours-form.tsx`

**Modificados (en los compartidos, cambios mínimos y aditivos)**
- `packages/core/src/index.ts`: +1 línea al final.
- `packages/core/src/messages.ts`: 5 textos al final.
- `packages/core/src/wake.ts`: `isExitCommand` e `isMenuCommand` al final. Las funciones existentes no cambiaron.
- `packages/core/src/wake.test.ts`: import ampliado y casos nuevos al final.
- `packages/db/prisma/schema.prisma`: 3 columnas en `Professional` (después de `botPaused`), `inquiries` en `Patient`, y enum y modelo al final.
- `packages/db/domain/index.ts`: +1 línea al final.
- `apps/bot/src/conversation.ts`, `whatsapp.ts`, `index.ts`, `workers.ts` (el cron nuevo va al final de `startCron`), `workers.test.ts`, `apps/bot/package.json` (script `test:after-hours`).
- `apps/web/src/components/shell/{nav-config.ts,sidebar-content.tsx,app-sidebar.tsx,mobile-topbar.tsx}`, `apps/web/src/app/(panel)/layout.tsx`, `apps/web/src/lib/shell.ts`.
- `apps/web/src/app/(panel)/ajustes/page.tsx` (bloque dentro de la tarjeta "Bot de WhatsApp") y `actions.ts` (`saveAfterHoursAction` al final). No toqué `saveSettingsAction` ni `generalSchema`.

## Contrato compartido: firmas confirmadas

Todas coinciden con la sección 4 de la SDD, nombre por nombre:
- **core:** `AfterHoursConfig`, `DEFAULT_AFTER_HOURS`, `AFTER_HOURS_TEXT`, `isValidHhmm`, `validateAfterHoursConfig`, `afterHoursConfigFrom`, `isWithinAfterHours`, `formatClock`, `isExitCommand`, `isMenuCommand`, y `messages.{afterHoursHandoff, inquirySavedAfterHours, INQUIRY_SAVED_DAY, INQUIRY_TEXT_ONLY, afterHoursDigest}`.
- **db/domain:** `INQUIRY_MESSAGE_MAX`, `recordInquiryMessage`, `InquiryListItem`, `listInquiries`, `countInquiriesByStatus`, `countPendingInquiries`, `markInquiryAnswered`, `enqueueAfterHoursDigest`. Las funciones de dominio conservan su nombre (sección 15).
- **bot:** `ConversationOptions`, `handleIncoming(jid, text, send, opts?)`, `handleIncomingMedia(jid, send, opts?)`, `IncomingMediaHandler`, `startWhatsApp(onMessage, onMedia?)`. `test-confirm-attendance.ts` compila y corre sin cambios.
- **web:** `InquiryActionState`, `markInquiryAnsweredAction(id)`, `saveAfterHoursAction(_prev, formData)`, `getPendingInquiryCount()`, `NavBadges`, `NavItem.badge`.
- **Campos Prisma:** son exactamente los de la SDD.

**Renombre de la sección 15 aplicado:** ruta `/mensajes`, archivo `mensajes-view.tsx` (componente `MensajesView`), ítem "Mensajes" en la sidebar (ícono `Inbox`, grupo "Pacientes", con el badge de pendientes), título "Mensajes", tarjeta "Mensajes por WhatsApp" y resumen que cierra con "Las ves completas en el panel → Mensajes.". En el `revalidatePath` va `/mensajes`.

## Decisiones no obvias

- **Agregado atómico en `recordInquiryMessage`:** el texto viaja como **un solo parámetro** `"\n" + text` (`"body" = "body" || $1`), no como `E'\n' || $text`. El resultado es el mismo y no depende de cómo maneja el tagged template el `\n` literal. El `WHERE` también filtra por `"patientId"`, así un `inquiryId` viejo de la sesión no puede agregar texto a la consulta de otro paciente. `updatedAt` se escribe con `${new Date()}` en lugar de `NOW()`, para no depender de la zona horaria de la sesión de Postgres. El escenario 4 del script comprueba contra la base que `lastMessageAt` queda exacto.
- **`conversation.ts`:** `AWAIT_INQUIRY` se resuelve **antes** de `isExitWord` y `isWakeWord && /menu/`, con los comandos estrictos (P3). Los demás pasos quedan como estaban. `handleMenu` ahora recibe `pro`, `opts` y `now`, y ya no vuelve a llamar a `getProfessional()`. Para la opción 0 de día (D4) el estado queda en `AWAIT_INQUIRY`, no en `MENU`. Un dígito 0–4 suelto en `AWAIT_INQUIRY` se trata como opción del menú (P4).
- **`handleIncomingMedia`:** usa `conversationState.findUnique` y no `loadState`, así que no crea pacientes ni estado. Si el bot está pausado, la sesión no está en `AWAIT_INQUIRY` o la sesión venció, no responde nada.
- **`whatsapp.ts`:** solo llama a `onMedia` si el contenido normalizado tiene alguna de las 7 claves de medio de la SDD. El resto se sigue ignorando con el log de siempre. La reconexión pasa `onMedia`.
- **Badge de la sidebar:** el nombre accesible del link es "Mensajes (N pendientes)" (pauta de `ui-ux-pro-max`: anunciar el conteo con contexto, no un número suelto). El pill es `aria-hidden` y va dentro de `panel-sidebar-label`, así se oculta al colapsar. En el rail se ve el punto (`collapsed`). Con 0 o `undefined` no se renderiza nada. Más de 99 se muestra como "99+".
- **`PageHeader.description` solo acepta `string`**, así que "Hablar con la nutricionista" va entre comillas tipográficas y no en cursiva. En el form de `/ajustes` sí va con `<em>`.
- **`AfterHoursForm`:** la descripción del switch muestra la hora "Desde las" que está escrita en el input en ese momento (estado local). Los inputs son `type="time"` con `autoComplete="off"`, que salió del autochequeo `web-design-guidelines`. No hay `await confirm()` en ningún lado: "Marcar como respondida" no pide confirmación, como dice la SDD.
- **Filtro de `/mensajes`:** queda en `useState` local, como en `/avisos` y como pide la SDD. La pauta "estado en la URL" no se aplicó por coherencia con el resto del panel.
- **El script de prueba conserva el pre-cleanup previsto en la SDD.** Solo borra pacientes con los jids de prueba **y** nombre terminado en "(TEST)". Si encuentra otro nombre, aborta sin borrar. En ese caso tampoco borra el `ConversationState` de esos jids: el `finally` solo lo hace si el script creó los pacientes. Además, aborta si `Professional.botPaused` está en true, en vez de tocarlo.

## Verificación (sección 11 y extras), con el bot detenido

`BotStatus.connected = false`, y no hay ningún proceso del bot corriendo.

| Comando | Resultado |
|---|---|
| `npm run db:generate` | ✔ Generated Prisma Client (v5.22.0) |
| `npm run typecheck` | `core`, `db`, `bot` y `web`: `tsc --noEmit` limpio en los 4 |
| `npm run test` | **Test Files 38 passed (38) · Tests 780 passed (780)**: los 719 existentes más 61 nuevos (37 de `after-hours.test.ts`, 4 casos nuevos en `wake.test.ts`, 17 de `inquiries.test.ts`, 3 en `workers.test.ts`) |
| `prisma migrate status` | 17 migrations found · **Database schema is up to date!** |
| `npm run test:after-hours --workspace apps/bot` | **12/12 escenarios OK** · "Datos de prueba borrados (por id)." |
| `npm run test:confirm-flow --workspace apps/bot` | **5/5 escenarios OK** (regresión) |
| `./ops/harness/verify.sh` | **Arnés OK.** `backlog/` válido; schema válido; typecheck limpio en los 4 workspaces; tests OK. Hay 2 WARN que son recordatorios manuales: "migraciones nuevas: revisar el SQL" (revisado arriba) y "se tocó el bot: confirmar que no hubo WhatsApp real ni restos en OutboundMessage" (ver la tabla siguiente) |
| `npm run lint --workspace apps/web` | Sin errores. El único warning es de antes y está en `ajustes/logo-form.tsx` (alt de img), que esta HU no tocó |

**Restos en la base, comprobados en solo lectura después de todas las pruebas:**

| Chequeo | Valor | Antes de la HU (verificación del architect) |
|---|---|---|
| Pacientes `549000000001_@s.whatsapp.net` | 0 | — |
| `OutboundMessage` a `5490000000099@s.whatsapp.net` | 0 | — |
| `PatientInquiry` | 0 | (tabla nueva) |
| `Patient` | 14 | 14 |
| `OutboundMessage` | SENT=5, FAILED=1 | 5 SENT, 1 FAILED |
| `ConversationState` | MENU=3, DORMANT=4 | 3 MENU, 4 DORMANT |
| `Professional` | `botPaused=f`, `phoneJid` nulo, `afterHoursEnabled=t`, `22:00`/`09:00` (los defaults) | sin cambios |

- **WhatsApp:** no se mandó nada. Las alertas de prueba fueron a `5490000000099@s.whatsapp.net`, inyectado con `opts.alertJid`, y cada fila se borró por id apenas se verificó. El script nunca lee ni usa `Professional.phoneJid`. No arranqué el bot.
- **Datos:** no modifiqué la fila de `Professional`: las franjas de prueba se inyectaron por opciones. Las limpiezas fueron solo por los ids insertados. No corrí `db:seed` ni `seed:demo`.

## Pendiente para el orquestador

- **No hice el recorrido visual del panel** (`npm run dev`). La sección 11 lo deja como chequeo manual:
  - `/ajustes?tab=whatsapp`: guardar con dos horas iguales tiene que mostrar "Elegí dos horarios distintos." inline; guardar 08:30/21:00 tiene que mostrar el toast. **Después hay que volver a dejar 09:00/22:00.**
  - `/mensajes` con y sin datos, con datos propios creados con `recordInquiryMessage` sobre un paciente "(TEST)" y borrados por id.
  - El badge, el punto en el rail y el ítem dentro del Sheet móvil.
- **P7 (configuración de producción):** si `phoneJid` es el mismo número vinculado al bot, el resumen se lo manda a sí mismo. No es un tema de código.
- **Avisar a imleticio en el PR (HU-010):** esta HU tocó `schema.prisma` (y trae una migración nueva), `core/index.ts`, `messages.ts`, `domain/index.ts`, la sidebar y `workers.ts`.

## Bloqueos

Ninguno.
