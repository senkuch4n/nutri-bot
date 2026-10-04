# Sesión actual del arnés

## 2026-09-23

- Ronda 2 de ideas en `docs/historias-usuario-nutridesk.md` (épicas 17–43). La nutricionista
  trabaja sola (Épica 41 descartada) y atiende solo adultos.
- Reglas nuevas del usuario: antes de cada implementer, preguntar modelo + skills; antes de cada
  reviewer, preguntar modelo (CLAUDE.md, AGENTS.md).
- Orden: HU-001 → HU-002 (rediseño UI) → HU-003 (Épica 30) → Épicas 18/19 → Épica 20.
- **HU-001 aprobada**, probada por el usuario en el navegador, commiteada y mergeada a `main`.
- **HU-002** validada (resoluciones al final de docs/hu-rediseno-ui-empresarial.md) y partida en HU-002a/b/c/d. Referencia: Notion, neutro, más aire, shadcn/ui. Gráficos de evolución en barras (se puede cambiar de librería). Sin prototipo previo.
- HU-002a: SDD lista (Refactorizaciones/rediseno-ui-fundaciones.md, skills refactor + ui) → implementer (Fable) `done` → progress/impl_HU-002a.md. Typecheck y tests en verde. **Recorrido visual NO hecho**: el `next dev` del usuario quedó dando 500 porque Tailwind 3.4 en Node 24 no recarga `tailwind.config.ts`. Hay que reiniciar `npm run dev`.
- **Hallazgo O2 (confirmado por el orquestador):** el matcher de `apps/web/src/middleware.ts` no excluye `/portal`, así que el portal exige un email de Google permitido. Un paciente real no puede entrar. **Arreglado** (rama fix-portal-middleware, mergeada a main y a la rama de HU-002).
- **Hallazgo:** el webhook de Mercado Pago (`/api/webhooks/mercadopago`) también queda bloqueado por el middleware (307 a /inicio), y la ruta no valida la firma `x-signature`. Pendiente de decisión del usuario.

## Pendientes fuera de HU

- `apps/bot/scripts/test-confirm-attendance.ts` puede encolar WhatsApp a pacientes reales
  (crons sin filtrar por paciente). Arreglar antes de volver a correrlo.
- `apps/web/src/lib/age.ts` `calculateAge`: desfase de un día por zona horaria.
- Scripts de prueba contra la base: ¿se conservan o se borran? (SDD vs CHECKPOINTS C5).
- `docker-compose.prod.yml` es de otro proyecto: queda sin tocar.
- HU-002a: reviewer (Opus) CHANGES_REQUESTED (2 puntos chicos: espacio duro en `Quantity` y `aria-describedby` de `NumberInput`). Recorrido del orquestador en progress/recorrido_HU-002a.md: la sidebar no entra a 663 px de alto. → `rechazada_reintentando` (intento 1 de 2).
- **HU-002a aprobada** en la 2ª ronda (ver history). El usuario validó el login y el email truncado. Commiteada en la rama `hu-002-rediseno-ui-empresarial`, sin mergear a main (002b sale de esta rama). Siguiente: HU-002b (pacientes).
- **HU-002b** `rediseno-ui-pacientes` → `arquitectura_lista`: SDD en Refactorizaciones/rediseno-ui-pacientes.md. Recomienda Recharts 3 y sacar MUI. Usuario confirmó (acepta D-b1..D-b4) → `implementando` (Fable; ui-ux-pro-max, ui-styling, web-design-guidelines).
- Ronda 3 de épicas (44–55) a partir de los 2 PDF de la nutricionista. Contradicción abierta: ¿atiende desde los 5 años o solo adultos?
- HU-002b: implementer (Fable) `done`. Recorrido en progress/recorrido_HU-002b.md: todo OK salvo **Borrar plan sin diálogo** (probable deadlock de useConfirm dentro de una form action). → `en_revision`.
- HU-002b: reviewer (Opus) CHANGES_REQUESTED: (1) deadlock de useConfirm en delete-plan-button, confirmado; (2) subtítulo falso en peso vs. grasa. → `rechazada_reintentando` (intento 1 de 2).
- **HU-002b aprobada** (2ª ronda). Rutas `prueba-*` borradas. Commiteada en la rama, sin mergear. Siguiente: HU-002c (agenda y gestión).
- Usuario: la nutricionista atiende desde los 5 años (Épica 56, pediatría). InBody: $25.000 provisorio.
- **HU-002c** `rediseno-ui-agenda-gestion` → `en_arquitectura` (refactor + ui).
- HU-002c: SDD lista → usuario confirmó (acepta D-c1..D-c7) → `implementando` (Fable; ui-ux-pro-max, ui-styling, web-design-guidelines).
- El usuario no quiere sacar del historial el PDF de ejemplo con sus datos.
- Pendiente fuera de HU (después de 002c): confirmación con useConfirm para "Cancelar turno" y "Reintentar N fallidos" (O-c1).
- HU-002c: implementer (Fable) `done`. Recorrido en progress/recorrido_HU-002c.md: OK. **Bug anterior encontrado: el calendario muestra los turnos 3 h corridos (FullCalendar sin plugin de zona horaria)**; se arregla directo después de la 002c. → `en_revision`.
- **HU-002c aprobada** y commiteada en la rama. Siguiente: arreglo directo de la zona horaria del calendario, después confirmaciones de Cancelar turno/Reintentar y después HU-002d.
- **Arreglado (directo):** zona horaria del calendario con @fullcalendar/luxon3. Verificado en Chrome: Brenda a las 09:00 en el calendario y en el panel.

## Modo autónomo (autorizado por el usuario, 2026-09-24, solo por esta ocasión)

- El orquestador **valida las HU** en lugar del usuario y resuelve solo lo que surja.
- Elecciones fijas: architect con `refactor` + `ui` (en HU de UI; en otras, lo que aplique del
  catálogo); **implementer en Opus** con `ui-ux-pro-max`, `ui-styling` y `web-design-guidelines`
  cuando haya UI; reviewer en Opus.
- Límites que se mantienen: no push; no merge a `main` (lo revisa el usuario); nada que borre
  datos, mande WhatsApp o escriba datos de negocio en la base; nada de `migrate reset`.
- Orden: (1) confirmación en "Cancelar turno" y "Reintentar"; (2) HU-002d; (3) HU-003 (consulta
  como entidad central), y lo que siga del backlog mientras no dependa de datos que solo tiene la
  nutricionista.
- (1) Confirmación en Cancelar turno / Reintentar: hecha (commit ea8694a). No se probó con un clic real, para no arriesgar una cancelación.
- (2) **HU-002d** → `en_arquitectura` (refactor + ui).

### Ampliación del modo autónomo (pedido del usuario, 2026-09-24)

El usuario pide resolver **sí o sí** también lo que antes quedaba para él. Decisiones del
orquestador, para que las revise a la mañana:
- **SARA 2:** importar desde el PDF (`pdftotext -layout`), con validaciones (macros cerca de 100 g,
  kcal ≈ 4·CHO + 4·P + 9·G + 7·alcohol) y un reporte de las filas que no se pudieron leer.
- **Informe ISAK:** se usan los métodos de **ISAKMetry**, que es lo que ella usa: Kerr (1991),
  Lee (2000), Rocha (1974), residual por diferencia, Durnin-Womersley (1974), Phantom y
  Heath-Carter. ArgoRef queda como alternativa futura. Se valida localmente contra los archivos
  de ISAKMetry, que están en el gitignore; esos datos personales no se commitean.
- **Pediatría (5 a 18 años):** referencia OMS 2007 (IMC para la edad y talla para la edad, puntaje
  Z con tablas LMS públicas de la OMS) y ecuaciones de **Schofield** para la TMB en chicos.
- **Merge a `main` y push:** al final, cuando todas las HU estén aprobadas y `verify.sh` dé OK.
  Antes del push, revisar el remoto.
- **Condición de parada:** ninguna HU pendiente en `backlog.json`, más las épicas priorizadas
  (18/19, 20, 30, 44–46 y 56) convertidas en HU y cerradas.
- HU-002d: SDD lista; el orquestador acepta D-d1..D-d8 (modo autónomo) → aprobada (ver history). Pendiente directo después: confirmación en "Borrar comida" (O-d1).
- Backlog: se sumaron HU-004 (18/19), HU-005 (20), HU-006 (44/45), HU-007 (46) y HU-008 (56).
- **HU-002d aprobada**: el rediseño completo (002a–d) quedó cerrado. Rutas `prueba-*` borradas.
- "Borrar comida" con confirmación (commit d5c87e5).
- **HU-003** → `afinando`, en la rama `hu-003-consulta-entidad-central` (sale de la de la HU-002, encadenada).
- HU-003 afinada; el orquestador valida D1–D11 según las recomendaciones (migración solo aditiva) → `en_arquitectura` (migracion-prisma + ui).
- HU-003: SDD lista → `implementando` (Opus), con respaldo `pg_dump` antes de migrar.
- HU-003 implementada (18 consultas migradas, sin pérdida). El orquestador reinició el `next dev` (proceso nuevo en segundo plano). → `en_revision`.
- **HU-003 aprobada** (épica 30). Siguiente: HU-004 (épicas 18/19).
- HU-004 afinada y validada (D1–D14 según las recomendaciones) → `en_arquitectura`.
- HU-004: SDD lista (formato de kcal unificado con separador de miles) → `implementando` (Opus).
- **HU-004 aprobada** (épicas 18/19). Siguiente: HU-005 (SARA 2, épica 20).
- HU-005 afinada y validada (D1–D16 según las recomendaciones) → `en_arquitectura`.
- HU-005: el architect paró con 2 preguntas; el orquestador resolvió Q1=b (90–110 g) y Q2=5 % (entra la banana) → `implementando` (Opus).
- **HU-005 aprobada** (épica 20). Siguiente: HU-006 (ISAK, épicas 44/45).
- HU-006 afinada y validada (D1–D21 según las recomendaciones) → `en_arquitectura`.
- HU-006: SDD lista → `implementando` (Opus).
- HU-006: reviewer CHANGES_REQUESTED (onDone llamado durante el render en isak-form.tsx) → ronda 1 (Opus).
- **HU-006 aprobada** (épicas 44/45). Siguiente: HU-007 (informe PDF, épica 46).
- HU-007 afinada y validada (D1–D13 según las recomendaciones) → `en_arquitectura`.
- HU-007: SDD lista → `implementando` (Opus). El PDF de ejemplo sigue en el historial por decisión del usuario (repo privado).
- **INCIDENTE HU-007 (2026-09-24 08:11):** el implementer corrió `prisma migrate diff
  --from-migrations --shadow-database-url <DATABASE_URL>` y Prisma vació la base de desarrollo.
  El orquestador verificó que las 23 tablas tenían 0 filas, guardó el estado vacío, recreó el
  esquema `public` y **restauró `backup-antes-HU-007.sql`** (pg_dump de las 08:10). Conteos
  restaurados: 10 pacientes, 18 consultas, 15 mediciones, 4 mensajes, 5 planes, 980 alimentos,
  16 turnos, 1 profesional, 14 migraciones. `migrate status`: solo falta la migración nueva de la
  HU-007. Regla agregada a AGENTS.md y a skills/migracion-prisma.md.
- **HU-007 aprobada** (épica 46). Siguiente: HU-008 (pediatría, épica 56).
- HU-008 afinada y validada (D1–D18 según las recomendaciones) → `en_arquitectura`.
- HU-008: SDD lista (tablas OMS de who.int, con su hash) → `implementando` (Opus).
- **HU-008 aprobada** (épica 56). Todas las HU del objetivo quedaron cerradas. Siguiente: merge a main, verify.sh y push.

## Cierre del objetivo (2026-09-24)

- Las 11 HU del backlog están aprobadas (001, 002a–d, 003, 004, 005, 006, 007, 008). Épicas 17,
  18, 19, 20, 30, 44, 45, 46 y 56 cerradas.
- `main` mergeado con la cadena hu-002…hu-008 (commit e2da8d9): typecheck limpio en los 4
  workspaces, 505 tests en verde, verify.sh OK. **Pusheado a origin/main.**
- Pendientes que quedan para el usuario:
  - ~~carga de servicios y horarios reales~~ **hecha (2026-09-24, con el ok del usuario)**: 6
    servicios reales activos (duraciones estimadas, sin seña mientras el webhook de MP esté
    roto), los 3 de prueba desactivados (tienen turnos), y 9 franjas horarias reales. Respaldo
    previo: `backup-antes-servicios-reales.sql`;
  - ~~arreglar `test-confirm-attendance.ts`~~ **hecho**: los crons aceptan
    `scope.patientIds` y el script los acota al paciente de prueba (5/5 OK, la cola sigue en 4);
  - webhook de Mercado Pago → pasa a la **HU-009** (no_afinada) en backlog.json, con el borrador acordado;
  - cargar título y matrícula en /ajustes;
  - probar a mano los flujos que escriben (completar un turno, guardar una prescripción, generar
    el informe PDF);
  - `docker-compose.prod.yml` es de otro proyecto y no se tocó.

## 2026-10-02 — Arnés para dos personas

- Arnés pasado a dos personas (PR #1 y #2 mergeados a `develop`): `backlog/<id>.json` con
  `responsable`, Notion como lock, ramas `feat/*` desde `develop`, CI en GitHub.
- **HU-011** `mensajes-fuera-de-horario` (de `hus-last-meet.md`) → reservada en Notion a mi nombre,
  rama `feat/hu-011-mensajes-fuera-de-horario` → `afinando`.
- HU-011 afinada (D1–D12) → `afinada_pendiente_validacion`. Hallazgo: hoy, después de la opción 0, el bot contesta "no entendí" durante 20 min (D4).
- HU-011 **validada**: el usuario acepta D1–D12 según las recomendaciones.
- HU-011 → `en_arquitectura` (migracion-prisma + ui). Leo no tiene migraciones abiertas.
- HU-011: SDD lista (Refactorizaciones/mensajes-fuera-de-horario.md, modelo PatientInquiry, 9 preguntas con default) → `arquitectura_lista`.
- HU-011: usuario acepta P1–P4/P6–P9; P5 → la bandeja se llama **Mensajes** (/mensajes). → `implementando` (Opus; migracion-prisma, ui-ux-pro-max, ui-styling, web-design-guidelines).
- HU-011: implementer (Opus) `done` en 2 tramos (el 1º se colgó). 780 tests, test:after-hours 12/12. Recorrido en progress/recorrido_HU-011.md: OK con 2 observaciones (texto del vacío, mapeo Desde/Hasta). → `en_revision`.
- **HU-011 aprobada** (1ª ronda, reviewer Opus). Ver history. Siguiente: commit, PR a develop, Notion → Hecha.
- Directo (fix/hu-011-detalles): texto del vacío de /mensajes y form de /ajustes sin reset de React 19 tras error (probado en Chrome: el error se ve y los inputs conservan lo tipeado; config intacta).
- **HU-012** `preguntas-bot-ia` (de hus-last-meet.md) → reservada en Notion, rama `feat/hu-012-preguntas-bot-ia` → `afinando`. Métodos de pago quedó como Tarea directa en Notion (para después).
- HU-012 afinada (D1–D14) → `afinada_pendiente_validacion`.
- HU-012 **validada**: D1 Claude Haiku 4.5 (fallback DeepSeek por env), D4 a+c (0 desde el modo pregunta precarga la consulta), D7 textos+tokens 90 días, resto según recomendaciones.
- HU-012 → `en_arquitectura` (migracion-prisma + ui; datos del skill claude-api pasados al architect).
- HU-012: SDD lista (Refactorizaciones/preguntas-bot-ia.md, tabla BotAiQuestion, 4 tools de solo lectura, P1–P14 con default) → `arquitectura_lista`.
- HU-012: usuario acepta P1–P5/P7–P14; P6 con prefijo "Pregunta al asistente: ". → `implementando` (Opus; migracion-prisma, claude-api, ui-styling, web-design-guidelines).
- HU-012: implementer (Opus) `done`: 863 tests, test:bot-ai 18/18, sin llamadas reales. Recorrido OK (progress/recorrido_HU-012.md). develop avanzó con un fix de HU-010 (sin solaparse). → `en_revision`.
- **HU-012 aprobada** (1ª ronda, reviewer Opus). Ver history.
- Directo (fix/hu-012-detalles): error de base en el modo pregunta → AI_ERROR sin loguear el texto; cron cada 5 min que limpia el historial de IA de sesiones vencidas (clearExpiredAiSessions). 873 tests, test:bot-ai 18/18.
- **HU-013** `motivo-consulta-reserva` (EP-052) → reservada en Notion, rama `feat/hu-013-motivo-consulta-reserva` → `afinando`. PR #8 (fixes HU-012) abierto aparte; toca conversation.ts, rebasar si hace falta.
- HU-013 afinada (D1–D12) → `afinada_pendiente_validacion`.
- HU-013 **validada**: D1–D12 según recomendaciones (D4 encendido por defecto, D7 en la alerta recortado a 200).
- HU-013 → `en_arquitectura` (migracion-prisma + ui).
- HU-013: SDD lista (Refactorizaciones/motivo-consulta-reserva.md; Appointment.reason, Service.asksReason default true; P1–P10) → `arquitectura_lista`.
- HU-013: usuario acepta P1/P4–P10; P2 lista de salteo ampliada; P3 aparte tras PR #8. → `implementando` (Opus; migracion-prisma, ui-styling, web-design-guidelines, ui-ux-pro-max).
- HU-013: implementer (Opus) `done`: 962 tests, test:booking-reason 17/17, regresiones OK, datos reales intactos. Recorrido OK (progress/recorrido_HU-013.md). → `en_revision`.
- **HU-013 aprobada** (1ª ronda, reviewer Opus). Ver history.
- Pendientes del review HU-013 (en la rama de la HU, PR #10): limpieza de texto de sesiones vencidas generalizada a BOOK_REASON/BOOK_CONFIRM (clearExpiredSessionText); SLOT_TAKEN con motivo ofrece otros días y lo conserva; jids propios en test-booking-reason. Rebase sobre develop (#8, #11). 984 tests, 4 simulaciones OK.
- Directo (fix/confirmacion-asistencia-vence): bug confirmado con la simulación — un sí/no tardío (pasados 20 min) al pedido de confirmación de asistencia se ignoraba. Ahora cuenta si el mensaje ENTERO es un sí/no claro (lateAttendanceAnswer) y el turno no empezó; lo demás sigue en silencio. confirm-flow 8/8, 1007 tests.
- **HU-014** `recordatorios-por-servicio` (EP-050) → reservada en Notion, rama `feat/hu-014-recordatorios-por-servicio` → `afinando`. #10 y #12 mergeados.
- HU-014 afinada (D1–D10) → `afinada_pendiente_validacion`.
- HU-014 **validada**: D1–D10 según recomendaciones (D2 confirmación como recordatorio más; D5 margen 2 h; D7 separados).
- HU-014 → `en_arquitectura` (migracion-prisma + refactor + ui).
- HU-014: SDD lista (Refactorizaciones/recordatorios-por-servicio.md; Service.reminders JSONB, OutboundMessage.dedupeKey, Appointment.bookedAt; un cron */5 reemplaza recordatorio+confirmación; P1–P10) → `arquitectura_lista`.
- HU-014: usuario acepta P1–P10. → `implementando` (Opus; migracion-prisma, ui-styling, web-design-guidelines, ui-ux-pro-max).
- HU-014: implementer (Opus) `done`: 1113 tests, 5 simulaciones OK, dry-run sin turnos futuros. Migración generada con migrate diff --from-schema-datasource (solo lectura) por el prompt no interactivo. Recorrido OK con 1 observación (estado 'no se envió' en turnos pasados). → `en_revision`.
- HU-014: reviewer (Opus) CHANGES_REQUESTED: recordatorio duplicado al cambiar la config de un servicio con avisos ya enviados (hueco de la SDD 5.1; ajuste anotado como sección 15). → `rechazada_reintentando` (intento 1 de 2).
- HU-014 ronda 2 → `implementando` (Opus; ui-styling, web-design-guidelines): cambio requerido 1 + mejora UX de turno pasado.
- HU-014 ronda 2: implementer `done` (cubierto por aviso automático posterior; 'Turno pasado' en el detalle). 1124 tests, test:service-reminders 17 OK. → `en_revision` (ronda 2).
- **HU-014 aprobada** (2ª ronda, reviewer Opus). Ver history.
- **HU-016** `matricula-firma` (EP-047) → reservada en Notion, rama `feat/hu-016-matricula-firma` → `afinando`. HU-009/HU-010 confirmadas cerradas (Notion + PR #16). HU-015 cancelada de mi lado: es de imleticio.
- HU-016 afinada → `afinada_pendiente_validacion`.
- HU-016 **validada**: resto según recomendaciones; D12 sin el PDF del plan (zona HU-015); firma en los dos PDF (D10) y pie del plan con matrícula (D5) quedan decididos para después de la HU-015.
- HU-016 → `en_arquitectura` (migracion-prisma + ui).
- HU-016: SDD lista (Refactorizaciones/matricula-firma.md; signatureData/MimeType, GET /api/professional/signature con sesión, getProfessional sin bytes, PdfSignatureBlock compartido; P1–P5) → `arquitectura_lista`.
- HU-016: usuario acepta P1–P3/P5; P4 se suma (logo solo PNG/JPG + aviso si el actual es WEBP). → `implementando` (Opus; migracion-prisma, ui-styling, web-design-guidelines, ui-ux-pro-max).
- HU-016: implementer `done` (1249 tests; base idéntica). Recorrido OK (progress/recorrido_HU-016.md). Hallazgo ajeno: test:booking-reason escenario 14 falla según la hora (HU-013, arreglar aparte). → `en_revision`.
- HU-016: reviewer (Opus) CHANGES_REQUESTED: report-actions.ts:112 y :134 hacen console.error(err) con el error entero (puede incluir el PDF con la firma); loguear solo el código + test. → `rechazada_reintentando` (intento 1 de 2). **Corrección:** el escenario 14 de test:booking-reason no falla según la hora: falla SIEMPRE desde el PR #17 (checkSlotAvailable rechaza servicios inactivos y el script crea sSena con active:false). Arreglar aparte.
- HU-016 ronda 2 → `implementando` (Opus): log solo con código + select mínimo en updates de Professional; logo queda en 2 MB.
- HU-016 ronda 2: implementer `done`. → `en_revision` (ronda 2).
- **HU-016 aprobada** (2ª ronda, reviewer Opus). Ver history.

## 2026-10-03 · HU-018 (rama feat/hu-018-plan-recetas-buscador, desde develop)
- HU-017a aprobada (PR #20, se mergea después del #7 de imleticio); su bitácora sigue en esa rama.
- HU-018 `plan-recetas-buscador`: Notion En curso, backlog `afinando`. Material local (gitignored en la rama de 017a; acá todavía no): docs/recetarios/, docs/planes-alimentacion/. Afinador con ui-ux-pro-max.
- PR #20 (HU-017a) mergeado a develop por el usuario (#7 de imleticio y #19 también mergeados). Traer develop a la rama de HU-018 cuando termine el afinador.
- HU-018 afinada → `afinada_pendiente_validacion` (docs/hu-plan-recetas-buscador.md, 22 dudas; corte 018a recetario / 018b buscador / 018c medidas caseras). D15/D16 ya resueltas: #7 y #20 mergeados.
- HU-018 resoluciones del usuario: D1 = menú semanal (no la recomendación); D3 = todo con atribución (licencia la confirma Daiana, fuera del sistema); resto aceptado. Afinador integrando (re-corte con menú semanal; coordinación con HU-015 de imleticio).
- HU-018 **validada** (N1 promedio + rango; N2 018b la hacemos nosotros). Partida en 018a–d; orden 018b → 018a → 018c. HU-018b → `en_arquitectura`.
- **HU-017** `rediseno-apple` (pedido del usuario: skill apple-design, rediseño visual completo, auditoría primero, sin la zona de Leo) → rama `feat/hu-017-rediseno-apple` (sale de chore/skill-apple-design, PR #19) → `afinando`. HU-016 en PR #18.
- HU-017 afinada (auditoría + propuesta + partición) → `afinada_pendiente_validacion`.
- HU-017 **validada** como paraguas: acento azul de sistema, Inter, Motion + página demo; resto según recomendaciones. Partida en HU-017a (validada) y 017b–f (no_afinada; 017e de imleticio).
- HU-017a → `en_arquitectura` (apple-design + refactor + ui).
- HU-017a: SDD lista (Refactorizaciones/rediseno-apple-fundaciones.md, 1305 líneas: tokens en design-tokens.ts, Motion 14 con LazyMotion, Inter opsz, 3 componentes nuevos, shell, demo /dev-diseno, 7 fases con commit propio; Q1–Q13 con default) → `arquitectura_lista`.
- HU-017a: usuario acepta Q1–Q13; corte después de la fase 6 para aprobar la demo. → `implementando` (Opus; apple-design, web-design-guidelines) fases 0–6.
- HU-017a: implementer `done-fase6` (6 commits locales f404ed6…637363f; 1341 tests). Sin recorrido en navegador: lo hace el orquestador. Desvíos D-1 destructive-vibrant, D-2 scope data-apple-preview, D-3 theme-portal. Ojo: dice que las pantallas reales cambian en parte antes de la fase 7.
- HU-017a: el orquestador abrió la demo (/dev-diseno carga, 43 pares de contraste AA). Hallazgo: warning de hidratación (useId distinto servidor/cliente) en /dev-diseno, sidebar y demo; /pacientes sin avisos. Pantallas reales ya cambian en parte (ítem activo azul, tipografía). Demo en revisión del usuario.
- HU-017a: **el usuario aprueba la demo** (2026-10-03). Sigue fases 7–9 + arreglo del warning de hidratación en /dev-diseno.
- HU-017a: implementer `done` fases 7–9 (commits f4f53ea, b96d1a4, f8cbc9a, ec3de99; 1341 tests; next build OK). Recorrido del orquestador: 0 errores de hidratación, flip OK, zona de imleticio sin roturas (progress/recorrido_HU-017a.md). → `en_revision`.
- **Foco de usabilidad para HU-017c** (aprobado por el usuario; se afina cuando HU-017a quede aprobada, con `ui-ux-pro-max`):
  - Diagnóstico: la lista mezcla pacientes con contactos de WhatsApp sin nombre e ids largos de grupos; teléfonos crudos; "Próximos turnos" casi siempre "—". La ficha tiene 7 pestañas, lenguaje técnico a la vista ("×1,55", "se asume Mediana", "Requerimiento indicado") y muchas acciones del mismo peso.
  - Propuestas: (1) buscador grande con autofoco, nombre grande y próximo turno en lenguaje común; (2) sección "Por completar" para contactos sin nombre, sin ids de grupos; (3) ficha de 7 a 4 pestañas (Resumen, Consultas, Plan, Historial); (4) Resumen con quién es, próximo turno, última consulta, plan vigente, tendencia de peso y una sola acción principal; (5) lenguaje simple y lo técnico en "Ver detalle"; (6) confirmación + Deshacer, botones grandes con ícono y texto.
  - Antes de afinar: observar a la nutricionista 5 minutos (buscar una paciente, ver su último peso, crear un plan).
- HU-017a: reviewer (Opus) CHANGES_REQUESTED: (1) un toque durante la entrada/salida congela el Sheet (use-dismiss-drag value.stop() sin captura; en la salida nunca llama safeToRemove → scrim + RemoveScroll bloquean la página); (2) el scrim bloquea clics durante la salida (Radix fuerza pointer-events:auto); (3) Toaster: group/toast rompe los estilos group-[.toast]. → `rechazada_reintentando` (intento 1 de 2).
- HU-017a ronda 2 → `implementando` (Opus): sheet congelado, scrim que bloquea en la salida, toaster + medición de peso (SDD §23).
- HU-017a ronda 2: recorrido del orquestador (progress/recorrido_HU-017a-ronda2.md): dialog OK, menú móvil OK salvo **defecto reproducido**: rueda dentro del panel durante la entrada + Esc → el sheet queda montado (closed) con el foco adentro. Sidebar al límite a 1366×768 (656 px vs ~650 útiles). Se devuelve al implementer antes del reviewer.
- HU-017a ronda 2: re-test OK del sheet (0 dialog/0 scrim tras rueda en la entrada + Esc). Observación: el foco queda en 'Saltar al contenido' y no vuelve al disparador. → `en_revision` (ronda 2).
- HU-017a: reviewer ronda 2 CHANGES_REQUESTED: (1) Dialog/AlertDialog reabierto durante la salida queda inert para siempre (ExitFocusGuard); (2) el foco no vuelve al disparador en overlays controlados sin Trigger (Modal, useConfirm, sheet de servicios). Duda: declarar framer-motion en apps/web. → `rechazada_reintentando` (intento 2 de 2: un tercer rechazo la bloquea). Usuario trae una HU más urgente (planes con recetas, zona de imleticio).
- **HU-018** `plan-recetas-buscador` (pedido urgente del usuario; zona de imleticio, la hacemos nosotros avisándole) → reservada en Notion (Alta, Backlog) y en backlog/ como `no_afinada`. Orden: primero el último reintento de HU-017a.
- HU-018: el usuario dejó el material en docs/recetarios/ (34 archivos, 203 MB) y docs/planes-alimentacion/ (plantilla con nombre de paciente). Agregados a .gitignore.
- HU-017a ronda 3 (último reintento) → `implementando` (Opus): inert al reabrir, foco al disparador, framer-motion declarado (SDD §24).
- HU-017a ronda 3: recorrido OK (reabrir durante la salida; foco vuelve a 'Nuevo turno' y 'Editar'). → `en_revision` (ronda 3, última).
- HU-017a **aprobada** (reviewer ronda 3). Historia actualizada; PR a develop (mergear después del #7 de imleticio).
- HU-018b: architect (Opus, skill migracion-prisma) → Refactorizaciones/menu-semanal.md. Comentario a imleticio en la tarjeta de Notion.
- HU-018b SDD lista (Refactorizaciones/menu-semanal.md, 12 dudas técnicas). verify.sh OK → `arquitectura_lista`.
- HU-018b: usuario aprueba SDD (dos PR: 018b-1 modelo → 018b-2 editor; D2–D12 aceptadas). → `implementando` 018b-1 (Opus; migracion-prisma, apple-design, web-design-guidelines, ui-ux-pro-max).
- HU-018b-1 done (migración weekly_menu aplicada, antes/después OK, 1431 tests). Recorrido del orquestador: plan existente 'plan leo' (16 ítems) se ve igual, sin selector, 0 errores de consola (solo lectura; no se creó paciente de prueba). → `en_revision`.
- HU-018b-1 **aprobada** (1ª revisión). HU-018b → `arquitectura_lista` para 018b-2 (después del merge). Pendientes en SDD §16. PR a develop.
- PR #21 (018b-1) mergeado. Rama feat/hu-018b2-editor-semanal desde develop para 018b-2.
- HU-018b-2 → `implementando` (Opus; apple-design, ui-ux-pro-max, web-design-guidelines).
- HU-018b-2 done; recorrido OK con observaciones menores (progress/recorrido_HU-018b.md). next dev reiniciado (cliente Prisma viejo). → `en_revision`.
- HU-018b-2 **aprobada**. HU-018b → `aprobada`. PR a develop. Sigue HU-018a (recetario).
- PR #22 mergeado. HU-018a → `en_arquitectura` (rama feat/hu-018a-recetario; architect Opus con migracion-prisma + ui).
- HU-018a SDD lista (Refactorizaciones/recetario.md; corte 018a-1 manual+migración / 018a-2 carga asistida). Hallazgo: auth.ts guarda el refresh_token de quien se loguea → no revisar recetas en el panel de producción. → `arquitectura_lista`.
- HU-018a: usuario aprueba SDD (018a-1 → 018a-2). Bug auth.ts → tarea directa después. → `implementando` 018a-1 (Opus; migracion-prisma, apple-design, ui-ux-pro-max).
- HU-018a-1 done (migración recipes, 1537 tests). Recorrido OK (progress/recorrido_HU-018a.md; obs.: foto sin sesión 307 vs 401). → `en_revision`.
- HU-018a-1 reviewer: CHANGES_REQUESTED (falso '¿Salir sin guardar?' tras guardar con foto). → `rechazada_reintentando` (intento 1/2). Relanzo implementer (Opus).
- HU-018a-1 ronda 2: recorrido OK (sin falso '¿Salir sin guardar?' tras subir foto). → `en_revision` (ronda 2).
- HU-018a-1 **aprobada** (ronda 2). HU-018a → `arquitectura_lista` para 018a-2. PR a develop.
- PR #23 (018a-1) mergeado. Rama feat/hu-018a2-carga-asistida desde develop.
- HU-018a-2 → `implementando` (Opus; apple-design, ui-ux-pro-max).
- HU-018a-2 done (extractor en seco: 320 borradores, 0 gramos inventados; 1619 tests). Recorrido: **Build Error en Turbopack** (export type re-export en actions.ts 'use server', bc034b7) → devuelto al implementer antes del reviewer.
- HU-018a-2: arreglo Turbopack (cccfd78); recorrido OK. → `en_revision`.
- HU-018a-2 **aprobada**. HU-018a → `aprobada`. PR a develop. Siguen: 018c (buscador) y la tarea directa del bug de auth.ts.
- HU-017c → `afinando` (afinador Opus; rama feat/hu-017c-pacientes desde develop; sin observar a la nutricionista, con el diagnóstico del 2026-10-03).
- HU-017c afinada y validada (D1–D18; D2/D3 confirmados por lectura: 5 @newsletter, 9 @lid). → `en_arquitectura` (architect Opus + ui). Tarea directa nueva: el bot no debe crear Patient desde @newsletter.
- Tarea directa: el bot ignora @newsletter y @broadcast (isIgnoredJid + test) → PR #29 a develop.
- HU-017c SDD lista (Refactorizaciones/017c-pacientes-consultas.md; Q1–Q16 aceptadas salvo Q6: ramas encadenadas). → `implementando` 017c-1 (Opus; ui-ux-pro-max, apple-design, web-design-guidelines).
- HU-017c-1 done; recorrido OK (progress/recorrido_HU-017c.md; idea: guardar pushName para distinguir 'Por completar'). → `en_revision` (reviewer Opus).
- HU-017c-1 **aprobada**. PR a develop. → 017c-2 `implementando` (rama feat/hu-017c2-ficha encadenada; Opus).
- HU-017c-2 done, pero el recorrido encontró que la ficha rompe en runtime (íconos lucide pasados como función a componentes cliente; el build no lo detecta). Devuelto al implementer antes del reviewer.
- HU-017c-2: arreglo de íconos (f5e6e2f, 9c6017b); recorrido OK. → `en_revision` (reviewer Opus). R3 (hidratación del sidebar) y R4 (coma decimal) pasan a 017c-3.
