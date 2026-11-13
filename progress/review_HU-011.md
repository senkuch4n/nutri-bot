# Review — HU-011 (mensajes-fuera-de-horario)

**Veredicto:** APPROVED

Revisado contra la HU (`docs/hu-mensajes-fuera-de-horario.md`), la SDD (`Refactorizaciones/mensajes-fuera-de-horario.md`, con la sección 15 como prioridad), `CHECKPOINTS.md` y el diff real del working tree (`git diff HEAD` + archivos nuevos sin trackear). Ignoré los archivos ajenos que indicó el orquestador.

Comandos que corrí yo (2026-10-02):
- `npm run typecheck` → limpio en core, db, bot y web (exit 0, 0 `error TS`).
- `npm run test` → **38 archivos, 780 tests OK** (exit 0).
- `./ops/harness/verify.sh` → **Arnés OK** (exit 0). Hay 2 WARN que son recordatorios manuales: el de migraciones (revisada abajo) y el de WhatsApp (ver punto 5).
- Consultas de solo lectura a la base de desarrollo: 0 pacientes `549000000001_`, 0 `OutboundMessage` a `5490000000099@…`, 0 `PatientInquiry`. `Professional` sigue en `afterHoursEnabled=t`, `22:00`/`09:00` y `botPaused=f`. No quedaron restos.

No corrí `test:after-hours` contra la base (no hacía falta). Lo revisé leyéndolo, ver punto 5.

## Checkpoints

### C1 — El arnés está sano
- [x] `backlog/` es válido y cada responsable tiene como mucho 1 HU activa (verify.sh: "imleticio: HU-010; senkuch4n: HU-011").
- [x] `progress/current-senkuch4n.md` refleja la HU en curso (+1 línea).
- [x] El diff no toca archivos de la HU-010: `git status` no muestra nada con `micronutr`, `planes` ni `seed-hu010`.
- [x] `./ops/harness/verify.sh` termina con exit 0.

### C2 — Cadena de documentos
- [x] Existe `docs/hu-mensajes-fuera-de-horario.md` con Contexto, Gherkin, Datos, UX, Fuera de alcance, Dudas y Resoluciones.
- [x] Existe la SDD con workspaces, checklist atómico, contrato compartido y la sección 15.
- [x] Las firmas coinciden con la sección 4: `after-hours.ts` (`AfterHoursConfig`, `DEFAULT_AFTER_HOURS`, `AFTER_HOURS_TEXT`, `isValidHhmm`, `validateAfterHoursConfig`, `afterHoursConfigFrom`, `isWithinAfterHours`, `formatClock`), `wake.ts` (`isExitCommand`, `isMenuCommand`), `messages.ts` (los 5 textos), `domain/inquiries.ts` (`INQUIRY_MESSAGE_MAX`, `recordInquiryMessage`, `InquiryListItem`, `listInquiries`, `countInquiriesByStatus`, `countPendingInquiries`, `markInquiryAnswered`, `enqueueAfterHoursDigest`), `conversation.ts` (`ConversationOptions`, `handleIncoming(…, opts?)`, `handleIncomingMedia`) y `whatsapp.ts` (`IncomingMediaHandler`, `startWhatsApp(onMessage, onMedia?)`). El renombre de la sección 15 está aplicado: ruta `(panel)/mensajes/`, `mensajes-view.tsx`, ítem y título "Mensajes", tarjeta "Mensajes por WhatsApp", resumen "panel → Mensajes" (`packages/core/src/messages.ts:240`) y `revalidatePath("/mensajes")`.

### C3 — Arquitectura
- [x] La lógica pura está en `packages/core/src/after-hours.ts` y `wake.ts`. Las operaciones de base compartidas están en `packages/db/domain/inquiries.ts`, sin duplicarse en web ni en bot.
- [x] Cambiaron `schema.prisma` y `domain`, y web y bot compilan. Se ajustaron los consumidores: bot (`conversation.ts`, `workers.ts`) y web (`lib/shell.ts`, `mensajes/*`, `ajustes/*`).
- [x] La migración `20261002215039_after_hours_inquiries/migration.sql` es aditiva: `CREATE TYPE`, 3 `ADD COLUMN … NOT NULL DEFAULT` en `Professional` (`true`, `'09:00'`, `'22:00'`), `CREATE TABLE`, 2 índices y una FK `ON DELETE CASCADE`. No tiene ningún `DROP` ni `ALTER … TYPE`. Es idéntica al SQL esperado de la SDD 3.2, coherente con el schema y es la última carpeta de migraciones.
- [x] La ruta nueva `/mensajes` queda protegida por el matcher genérico de `apps/web/src/middleware.ts`, que también cubre los POST de las server actions. Mismo patrón que el resto del panel. El portal no se tocó.
- [x] El bot sigue en silencio fuera de una sesión activa: `DORMANT` sin palabra clave hace `return` (`conversation.ts:142`), y `handleIncomingMedia` no responde sin `AWAIT_INQUIRY` vigente (`conversation.ts:602-603`). Los textos coinciden con la SDD 6 (con "→ Mensajes" por la sección 15).
- [x] No hay `console.log` de debug ni TODOs en el código de producción. Los `console.log` del script de prueba siguen el patrón de `test-confirm-attendance.ts`.

### C4 — Verificación real
- [x] `npm run typecheck` limpio (lo corrí yo).
- [x] La lógica nueva de core tiene tests: `after-hours.test.ts` y casos nuevos en `wake.test.ts`. También hay `inquiries.test.ts` con prisma mockeado y casos nuevos en `workers.test.ts`. `npm run test`: 780/780.
- [x] El flujo del bot se simuló sin WhatsApp real con `apps/bot/scripts/test-after-hours-inquiry.ts`, que limpia por id (ver punto 5). La base quedó sin restos: lo comprobé yo en solo lectura.
- [x] No aplica: no hay PDF ni documento.

### C5 — Cierre
- [x] `progress/impl_HU-011.md` existe y describe archivos, migración, verificación y decisiones.
- [x] `progress/review_HU-011.md` tiene este veredicto.
- [x] No hay scripts sueltos (el script de prueba es parte del alcance, SDD 10.4, con `test:after-hours` en `apps/bot/package.json`). No quedan datos de prueba en la base.

## Verificaciones pedidas por el orquestador

1. **Observaciones del recorrido.**
   - (a) Estado vacío de `/mensajes` (`apps/web/src/app/(panel)/mensajes/mensajes-view.tsx:41-42`): el texto "Las consultas que te dejen fuera de horario por el bot aparecen acá." es **literalmente** el que piden la HU (Diseño UX) y la SDD 7.1, así que el implementer cumplió el contrato. Igual tiene razón la observación: por D4 también entran las consultas de día y el texto queda impreciso. **No es bloqueante.** Ver "Dudas" con la redacción propuesta.
   - (b) El mapeo es correcto en los dos sentidos:
     - **Carga:** `ajustes/page.tsx:72-73` pasa `attendFrom: pro.afterHoursEnd` ("Desde las" = 09:00) y `attendTo: pro.afterHoursStart` ("Hasta las" = 22:00).
     - **Guardado:** `ajustes/actions.ts:142` valida `{ start: attendTo, end: attendFrom }`, y `:148-149` guarda `afterHoursStart: attendTo` y `afterHoursEnd: attendFrom`. La UI muestra el horario de atención (09–22) y la base guarda la franja fuera de horario (22→09), como pide la SDD 5.3 y 7.3.
     - **El "resumen a las 09:00" no está fijo en ningún lado:**
       - UI: `after-hours-form.tsx:44` usa el estado `attendFrom` (el valor del input, inicializado desde `afterHoursEnd`).
       - Bot: `conversation.ts:295` arma `afterHoursHandoff` con `formatClock(config.end)` / `formatClock(config.start)`, y `:583` arma `inquirySavedAfterHours` con `formatClock(config.end)`. `config` sale de `afterHoursConfigFrom(pro)`.
       - Cron: dispara cuando `isWithinAfterHours(now, config)` pasa a false, o sea en `afterHoursEnd` leído de la base (`inquiries.ts:168-171`).
2. **Migración:** aditiva, con DEFAULT en las 3 columnas NOT NULL de `Professional` y sin DROP (ver C3).
3. **Idempotencia y cruce de franja.**
   - **Mismo proceso:** el flag `digestRunning` (`workers.ts:146-159`) evita que se solapen el tick y el arranque. Está cubierto por el test "skips overlapping ticks" y el flag se libera en `finally`.
   - **Reinicios:** `digestedAt` se marca en la misma transacción que el `outboundMessage.create` (`inquiries.ts:173-216`). Una segunda corrida no encuentra filas con `digestedAt: null` y devuelve `{0, null}`.
   - **Dos procesos concurrentes (READ COMMITTED):** el `updateMany … where digestedAt: null` del segundo se bloquea con los locks de fila del primero. Cuando el primero hace commit, el segundo re-evalúa, marca 0 filas, `count !== ids.length` hace `throw` y el rollback se lleva su outbound (`:212-215`).
   - **Arranque:** `runStartupJobs` llama al resumen en un `try/catch` propio (`workers.ts:138-143`).
   - **Cruce de franja:**
     - 0 a las 08:58 y texto a las 09:01: crea una consulta con `receivedAfterHours=false`, encola la alerta inmediata y manda `INQUIRY_SAVED_DAY` (`conversation.ts:564-585`, escenario 8 del script). Cumple el Gherkin.
     - Texto a las 08:59 y agregado a las 09:01: la consulta ya es nocturna (`!inquiry.receivedAfterHours`), así que no hay doble aviso (P6).
4. **Máquina de estados.**
   - **P3:** los comandos estrictos se evalúan solo con `step === AWAIT_INQUIRY` (`conversation.ts:156-168`), antes de `isExitWord` y `isWakeWord && menu`. Los demás pasos siguen igual (`:170-192`).
   - **P4:** un dígito suelto 0–4 en `AWAIT_INQUIRY` va a `handleMenu` (`:560`).
   - **D7:**
     - Dentro de la sesión, los mensajes se agregan por `ctx.inquiryId` y no se reconfirman (`confirmed`).
     - En una sesión nueva la misma noche, se agregan a la consulta nocturna sin resumir (`inquiries.ts:63-72`) y se reconfirma una vez.
     - El append es un UPDATE atómico filtrado por `patientId` y `PENDING` (`inquiries.ts:18-23`).
   - **D8:** `whatsapp.ts:129-136` llama a `onMedia` solo con las 7 claves de medio. La reconexión pasa `onMedia` (`:105`). `handleIncomingMedia` usa `findUnique` (no crea estado) y respeta `botPaused` y el timeout.
   - **Fuera de `AWAIT_INQUIRY`:** nada cambia, salvo la opción 0 de día, que ahora deja el paso en `AWAIT_INQUIRY` por D4 (`:306`).
   - **D9:** los mensajes sin palabra clave en `DORMANT` siguen ignorados (`:142`).
   - **Timeout:** pasa a `DORMANT` también desde `AWAIT_INQUIRY` (`:136-138`).
5. **Script `test-after-hours-inquiry.ts`.**
   - **Limpieza:** solo por ids propios (`finalCleanup`, `:72-85`) o por los JIDs falsos `54900000000{11,12,99}`. El pre-cleanup aborta si un jid de prueba pertenece a un paciente sin "(TEST)" (`:57-70`).
   - **`Professional`:** solo la lee (`:92`), la franja y la hora se inyectan por opciones, y el script aborta si `botPaused`.
   - **`OutboundMessage`:** toda alerta va a `ALERT_JID` vía `opts.alertJid` (`:121`, `:126`, y todas las llamadas a `enqueueAfterHoursDigest` pasan `alertJid`). Nunca usa `phoneJid`. Cada fila se borra por id al verificarse (`takeNewAlerts`) y hay una barrida de seguridad por `toJid = ALERT_JID` y `createdAt >= startedAt`.
   - **WhatsApp real:** no puede mandar nada, porque `send` es un callback que acumula en memoria. Aborta si `BotStatus.connected`.
6. **HU-010 y archivos compartidos.** No se tocó ningún archivo de la HU-010. En los compartidos el cambio es aditivo:
   - +1 línea en `core/index.ts` y en `domain/index.ts`;
   - textos al final de `messages.ts` y funciones al final de `wake.ts`;
   - columnas y modelo nuevos en `schema.prisma`, sin tocar nada existente;
   - cron al final de `startCron`;
   - en la sidebar, ítem nuevo y props opcionales `badges` y `count`. Con count 0 o `undefined`, el render es el de antes.

## Cambios requeridos

Ninguno bloqueante.

## Dudas (no bloqueantes)

- **Texto del estado vacío** (`apps/web/src/app/(panel)/mensajes/mensajes-view.tsx:42`): la HU y la SDD lo fijan así, pero por D4 también aparecen las consultas de día. Propuesta de corrección directa (es un texto, no hace falta otra ronda): "Acá aparecen las consultas que te dejan los pacientes por el bot con la opción “Hablar con la nutricionista”." Que el usuario valide la redacción.
- **Form de `/ajustes` con error de validación** (`apps/web/src/app/(panel)/ajustes/after-hours-form.tsx:22-25`, `:65`, `:70`): con `useActionState` y `<form action>`, React 19 resetea el form después de cada envío, incluso cuando la action devuelve `{ ok:false }`. Los inputs vuelven a los valores guardados (`defaultValue`), pero el estado `attendFrom` de la descripción conserva lo que se tipeó. Resultado: el usuario pierde lo que escribió y la frase "resumen a las …" puede quedar desfasada del input. No lo probé en el navegador. Conviene verificarlo en el recorrido. Si pasa, se arregla con inputs controlados.
- **Script con el bot vivo:** si se corre con `ALLOW_BOT_RUNNING=1`, o con el proceso del bot corriendo pero `BotStatus.connected=false` (desconectado), el cron real del bot (sin `scope`) podría resumir las consultas nocturnas "(TEST)" y encolar un `PROFESSIONAL_ALERT` al `phoneJid` real. Ese mensaje saldría al reconectar. El riesgo hoy es bajo: `phoneJid` es nulo en desarrollo y el script resume él mismo esas consultas en los escenarios 9 y 11. Igual conviene documentar en el script que el bot no puede estar corriendo **como proceso**, no solo conectado.
- **`$executeRaw` con `Date`** (`packages/db/domain/inquiries.ts:21`): `lastMessageAt` y `updatedAt` van como parámetros a columnas `TIMESTAMP(3)` sin zona. Es correcto mientras la sesión de Postgres esté en UTC: la de desarrollo lo está (el escenario 4 del script lo comprobó, según el impl). Conviene confirmar que producción también.
- **Texto fijo "Anoche"** en `afterHoursDigest` (`packages/core/src/messages.ts:235`): lo pide la HU. Con una franja diurna configurada (p. ej. 13:00–15:00) quedaría raro. Es menor.
- **Apagar la franja a mitad de la noche:** `isWithinAfterHours` pasa a dar false y el resumen sale en el siguiente minuto con lo acumulado. Es razonable, pero no está documentado.
- **P7** (configuración de producción, no de código): si `phoneJid` es el mismo número del bot, el resumen se lo manda a sí mismo.
