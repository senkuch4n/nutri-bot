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
- PR #24 mergeado. Tarea directa: fix login Google (solo GOOGLE_CALENDAR_OWNER_EMAIL guarda el token) → PR #25. HU-018c → `en_arquitectura` (rama feat/hu-018c-buscador-recetas; architect Opus + ui).
- PR #25 (fix login Google) mergeado. Falta definir GOOGLE_CALENDAR_OWNER_EMAIL en producción. Traer develop a la rama de 018c antes de implementar.
- HU-018c SDD lista (Refactorizaciones/buscador-recetas.md; sin migración; corte 018c-1 buscador / 018c-2 detalle de receta; hallazgo: copiar/repetir/deshacer y aplicar plantilla perderían recipeId). → `arquitectura_lista`.
- HU-018c: usuario aprueba SDD (018c-1 → 018c-2; D1–D9 aceptadas). → `implementando` 018c-1 (Opus; apple-design, ui-ux-pro-max).
- 2026-10-03: el usuario activó modo autónomo ("realizá todas las HU que puedas; si no podés avanzar con una, avanzá con otra"). Decisiones que normalmente se preguntan: se toma la recomendada y se anota acá y en backlog.
- Seña con Mercado Pago probada por el usuario: funciona.
- HU-018c-1 done; recorrido OK (progress/recorrido_HU-018c.md); datos de prueba borrados. → `en_revision` (reviewer Opus, recomendado; modo autónomo).
- HU-018c-1 **aprobada**. PR a develop. Sigue 018c-2 en rama encadenada (feat/hu-018c2-detalle-receta desde 018c-1) para no esperar el merge.
- HU-018c-2 → `implementando` (Opus; apple-design, ui-ux-pro-max — recomendados, modo autónomo). Rama feat/hu-018c2-detalle-receta encadenada sobre feat/hu-018c-buscador-recetas (PR #26).

## 2026-10-04 — vuelta del viaje, modo autónomo (/goal: "realizá todas las HU pendientes")
- Decisiones que normalmente se preguntan (modelo, skills, validaciones): se toma la recomendada y se anota acá.
- HU-018c-2: implementer relanzado (Opus; apple-design, ui-ux-pro-max) sobre el WIP de feat/hu-018c2-detalle-receta.
- Orden siguiente: 018d → 017c → 017b → 017d → 017f. PR #26 sigue abierto (lo revisa imleticio).
- HU-018c-2 done (4bcc6ea); recorrido OK (detalle en el buscador). → `en_revision` (reviewer Opus).
- HU-018c-2 **aprobada** (1ª revisión). HU-018c → `aprobada`. PR a develop (encadenado sobre #26).
- HU-018d → `afinando` (afinador Opus; rama feat/hu-018d-medidas-caseras encadenada sobre 018c-2).
- HU-018d afinada (docs/hu-medidas-caseras.md); validada en modo autónomo con todas las recomendaciones (D2 pendiente de preguntarle a la nutricionista; 018d-2 opcional). → `en_arquitectura` (architect Opus; migracion-prisma + ui).
- HU-018d SDD lista (Refactorizaciones/medidas-caseras.md; T1–T17 aceptadas; corte 018d-1a/1b; hallazgo T1: los unitHint están en alimentos PROPIO, ya no usables). → `implementando` 018d-1a (Opus; migracion-prisma, apple-design, ui-ux-pro-max).
- Bloqueo de macOS (EPERM en los archivos del arnés) resuelto por el usuario. Los subagentes del arnés dejaron de estar cargados en la sesión: se lanzan como general-purpose con las instrucciones de .claude/agents/<rol>.md. 018d-1a relanzada (Opus).
- HU-018d-1a done (8 commits, migración food_measures aplicada); recorrido OK (progress/recorrido_HU-018d.md). → `en_revision` (reviewer Opus).
- HU-018d-1a **aprobada** (1ª revisión). PR a develop (encadenado sobre #27). → 018d-1b `implementando` (Opus; apple-design, ui-ux-pro-max; suma R2–R4 de la revisión).
- HU-018d-1b done (stepper, conversión de unitHint en seco: 77 a crear / 2 ilegibles, R2–R4, prellenado de 'Pasar a medida'); recorrido OK. → `en_revision` (reviewer Opus).
- HU-018d-1b **aprobada**. HU-018d → `aprobada`. PR #28 actualizado. Pendiente del usuario: `npm run measures:convert-hints -- --apply` si quiere convertir los unitHint. Sigue HU-017c.
- HU-017c → `afinando` (afinador Opus; rama feat/hu-017c-pacientes desde develop; sin observar a la nutricionista, con el diagnóstico del 2026-10-03).
- HU-017c afinada y validada (D1–D18; D2/D3 confirmados por lectura: 5 @newsletter, 9 @lid). → `en_arquitectura` (architect Opus + ui). Tarea directa nueva: el bot no debe crear Patient desde @newsletter.
- Tarea directa: el bot ignora @newsletter y @broadcast (isIgnoredJid + test) → PR #29 a develop.
- HU-017c SDD lista (Refactorizaciones/017c-pacientes-consultas.md; Q1–Q16 aceptadas salvo Q6: ramas encadenadas). → `implementando` 017c-1 (Opus; ui-ux-pro-max, apple-design, web-design-guidelines).
- HU-017c-1 done; recorrido OK (progress/recorrido_HU-017c.md; idea: guardar pushName para distinguir 'Por completar'). → `en_revision` (reviewer Opus).
- HU-017c-1 **aprobada**. PR a develop. → 017c-2 `implementando` (rama feat/hu-017c2-ficha encadenada; Opus).
- HU-017c-2 done, pero el recorrido encontró que la ficha rompe en runtime (íconos lucide pasados como función a componentes cliente; el build no lo detecta). Devuelto al implementer antes del reviewer.
- HU-017c-2: arreglo de íconos (f5e6e2f, 9c6017b); recorrido OK. → `en_revision` (reviewer Opus). R3 (hidratación del sidebar) y R4 (coma decimal) pasan a 017c-3.
- HU-017c-2 reviewer: CHANGES_REQUESTED (replaceState con window.history.state: Next no sincroniza y la pestaña/Editar datos se pierde tras una server action). → `rechazada_reintentando` (intento 1/2). Relanzo implementer (Opus).
- HU-017c-2 ronda 2 done (9da10e9); re-test: cambiar a Historial deja ?tab=historial. → `en_revision` (ronda 2).
- HU-017c-2 **aprobada** (ronda 2). PR encadenado sobre #30. → 017c-3 `implementando` (rama feat/hu-017c3-consulta; Opus; con R3 y R4).
- HU-017c-3 done (9 commits, R3 y R4 incluidos); recorrido OK. → `en_revision` (reviewer Opus).
- HU-017c-3 **aprobada**. PR encadenado sobre #31. → 017c-4 `implementando` (rama feat/hu-017c4-informe; Opus; con R5–R7).
- HU-017c-4 done; recorrido OK. → `en_revision` (reviewer Opus).
- HU-017c-4 reviewer: CHANGES_REQUESTED (R5: un cálculo nuevo dentro de releaseAfterMs queda oculto). → `rechazada_reintentando` (intento 1/2).
- HU-017c-4 ronda 2 done (46b2b0c). → `en_revision` (ronda 2).
- HU-017c-4 **aprobada** (ronda 2). HU-017c → `aprobada`. PR encadenado sobre #32. Sigue HU-017b.
- HU-017b → `afinando` (afinador Opus; rama feat/hu-017b-agenda encadenada sobre 017c-4).
- HU-017b afinada y validada (D1–D24; D17 vacaciones por rango queda como idea aparte). → `en_arquitectura` (architect Opus + ui).
- HU-017b SDD lista (Refactorizaciones/017b-agenda-gestion.md; Q1–Q24 aceptadas; hallazgos: botPaused no frena la cola, 9 reglas inactivas listadas, z.coerce.boolean en servicios). Bot apagado confirmado. → `implementando` 017b-1 (Opus).
- HU-017b-1 done (8 commits); recorrido OK (progress/recorrido_HU-017b.md). → `en_revision` (reviewer Opus).
- HU-017b-1 **aprobada**. PR encadenado sobre #33. → 017b-2 `implementando` (rama feat/hu-017b2-disponibilidad; Opus; con R1–R3).
- HU-017b-2 done (8 commits); recorrido OK (seña de Antropometría guardada como 19.999,73: avisar al usuario). → `en_revision` (reviewer Opus).
- HU-017b-2 **aprobada**. PR encadenado sobre #34. Tarea directa: excepciones de disponibilidad corridas un día (dayKeyInTz sobre @db.Date) → PR #35 a develop. → 017b-3 `implementando` (rama feat/hu-017b3-bandejas; Opus; con R4–R6).
- HU-017b-3 done (7 commits); recorrido OK (comunicado solo a 16 personas). → `en_revision` (reviewer Opus).
- HU-017b-3 reviewer: CHANGES_REQUESTED (doble clic en 'Ya respondí': el Deshacer no evita el commit). → `rechazada_reintentando` (intento 1/2).
- HU-017b-3 ronda 2 done. → `en_revision` (ronda 2).
- HU-017b-3 **aprobada** (ronda 2). PR encadenado sobre #36. → 017b-4 `implementando` (rama feat/hu-017b4-ajustes; Opus).
- HU-017b-4 done; recorrido: Ajustes y Asistente OK, ajustes intactos (byte a byte), pero reaparece el error de hidratación del sidebar en /ajustes → devuelto al implementer antes del reviewer.
- HU-017b-4: arreglo de hidratación (0aec47b); recorrido OK. → `en_revision` (reviewer Opus).
- HU-017b-4 **aprobada**. HU-017b → `aprobada`. PR encadenado sobre #37. → HU-017d `afinando` (rama feat/hu-017d-portal encadenada).
- HU-017d afinada y validada (D1–D20 salvo D14: 017d-3 mergea la rama de 018d en vez de esperar develop). → `en_arquitectura` (architect Opus + ui).
- HU-017d SDD lista (Refactorizaciones/017d-portal.md; Q1–Q16 aceptadas). → `implementando` 017d-1 (Opus).
- HU-017d-1 done; recorrido del portal OK salvo: gráfico de peso con barras en 0 (bug previo del componente compartido, también en el panel) y título de pestaña 'NutriBot — Panel' → devuelto al implementer antes del reviewer.
- HU-017d-1: arreglos del gráfico (9831216) y título (37cf2ac); recorrido OK. → `en_revision` (reviewer Opus).
- HU-017d-1 **aprobada**. PR encadenado sobre #38. → 017d-2 `implementando` (rama feat/hu-017d2-diario; Opus; con R1).
- HU-017d-2 done (7 commits); recorrido OK. → `en_revision` (reviewer Opus).
- HU-017d-2 **aprobada**. PR encadenado sobre #39. → 017d-3 `implementando` (rama feat/hu-017d3-plan = 017d-2 + merge de feat/hu-018d-medidas-caseras).
- 017d-3: merge de feat/hu-018d-medidas-caseras en feat/hu-017d3-plan (conflicto solo en esta bitácora; se conservaron las dos partes).
- HU-017d-3 done; recorrido OK. → `en_revision` (reviewer Opus).
- HU-017d-3 **aprobada**. HU-017d → `aprobada`. PR encadenado sobre #40 (y después de #28).
- HU-017f → `bloqueada`: depende de HU-017e (imleticio, sin arrancar). Se destraba cuando 017e esté en develop.

## Cierre 2026-10-05 (modo autónomo) — estado
- **Aprobadas en esta tanda:** 018c-2, 018d (1a+1b), 017c (1–4), 017b (1–4), 017d (1–3). Tareas directas: bot ignora
  @newsletter (#29), excepciones de disponibilidad corridas un día (#35).
- **PR abiertos, en orden de merge:** #26 → #27 → #28 (018c/018d, migración food_measures) · #29 · #35 ·
  #30 → #31 → #32 → #33 (017c) → #34 → #36 → #37 → #38 (017b) → #39 → #40 → #41 (017d; #41 después de #28).
- **Sin HU propias pendientes:** 017f bloqueada por 017e (imleticio); 018d-2 opcional (solo si la nutricionista la pide).
- **Pendientes del usuario:** revisar/mergear los PR (o pasárselos a imleticio); `npm run measures:convert-hints
  --workspace packages/db -- --apply` si quiere convertir los unitHint; preguntarle a la nutricionista por una tabla de
  medidas caseras (D2 de 018d) y validar con ella las tareas de usabilidad (D1 de 017c/017b, D19 de 017d); seña de
  Antropometría guardada como $ 19.999,73; `GOOGLE_CALENDAR_OWNER_EMAIL` en producción; número de WhatsApp de la
  profesional en Ajustes (el portal no muestra "Escribile" sin él).
- **Ideas anotadas (no abiertas como HU):** guardar el pushName de WhatsApp para distinguir "Por completar"; vacaciones
  por rango (D17 de 017b).
- **Entorno:** `lsof` se cuelga en esta máquina (usar `ps`/`curl --max-time`); el :3000 lo usa otro proyecto, el panel
  de dev corrió en :3100.

## 2026-10-12 — deploy de la web a Vercel (para que la nutricionista pruebe; sin bot)
- Usuario autorizó mergear la cadena de PR: #26, #29, #35 mergeados a develop; develop traído a feat/hu-017d3-plan
  (conflictos solo en HU-018c.json y esta bitácora: se conservó la versión de la rama). Sigue: #41 a develop (incluye
  #27, #28, #30–#40) y deploy de develop en Vercel + Postgres en Neon (vacía + datos base: ficha profesional,
  servicios, SARA 2).
- #41 mergeado a develop (incluye #27, #28, #30–#40; cerrados con comentario). #42 (foto de receta achicada en el
  navegador, límite 4,5 MB de Vercel) mergeado.
- **Producción en Vercel:** https://nutribot-gold.vercel.app (proyecto `nutribot`, Root `apps/web`, región gru1,
  rama de producción `develop`: cada merge a develop publica). Base Neon `nutribot-db` (sa-east-1) con las 24
  migraciones, SARA 2 (890), seed base (ficha "Nutricionista", 3 servicios, horarios L–V) y 1 receta publicada.
  Login con Google probado por el usuario: OK. Sin bot, sin Mercado Pago.
- Pendiente: mail de la nutricionista en `ALLOWED_EMAILS` (y usuaria de prueba en Google Cloud si la app está en
  modo Prueba); el portal del paciente no tiene cómo recibir el link sin el bot (idea: "Copiar link del portal").

## 2026-10-24 — alta de pacientes y HU-019
- Tarea directa: botón «Nuevo paciente» en /pacientes (PR #44, mergeado a develop por el usuario). Sin recorrido en
  navegador (login de Google); quedó pedido en el PR.
- Respuesta a la nutricionista sobre armado de plan (objetivo de la consulta → barra de cobertura → PDF) y recetas.
- **Lock en GitHub en vez de Notion** (decisión del usuario): el MCP de Notion conectó al workspace personal y no ve el
  tablero. Labels `HU` + `estado: …` creados en el repo (mapeo igual al de Notion en AGENTS.md).
- **HU-019 archivar-pacientes** → issue #45, rama feat/HU-019-archivar-pacientes, `afinando` (afinador, Opus).
- HU-019: HU validada (D1–D12 como recomendadas) y SDD lista (Refactorizaciones/archivar-pacientes.md). → `implementando` (Opus; migracion-prisma, apple-design, ui-ux-pro-max). Migrar Neon a mano antes del merge (10.3).
- **HU-019 aprobada** (reviewer Opus, 1ª ronda). PR a develop con `Closes #45`; migrar Neon antes del merge.

## 2026-10-25 — HU-020 importar planes desde PDF
- La nutricionista pidió mandar planes y recetas listos en PDF en vez de cargarlos a mano. Las recetas ya tienen
  carga asistida (recipes:extract). Para los planes no hay nada.
- PDF de ejemplo (Canva, 15 págs.): cualitativo. Menús por día de la semana en texto libre, porciones generales,
  recomendaciones y opciones; casi sin gramos.
- **HU-020 importar-planes-pdf** → issue #48, rama feat/HU-020-importar-planes-pdf, `afinando` (afinador, Opus).
- HU-020: afinada (D1–D16) → `afinada_pendiente_validacion`. D6 y D14 los tiene que contestar la nutricionista; D9 hay que hablarla con Leo (HU-015).
- HU-020 **validada** (Resoluciones al final de la HU: D7 = dos comidas, D6 provisoria numerada, D9 secciones de texto; D12/D14/D15 pendientes de ella). Aviso a Leo en #48.
- HU-020 → `en_arquitectura` (architect Opus; migracion-prisma + ui).
- HU-020: SDD lista (Refactorizaciones/importar-planes-pdf.md), verify.sh OK → `arquitectura_lista`.
- HU-020 → `implementando` (Opus; migracion-prisma, apple-design, ui-ux-pro-max, web-design-guidelines).
- HU-020: implementer (Opus) `done` → progress/impl_HU-020.md (2526 tests OK, typecheck web+bot OK, prueba real en dev + undo). Sin recorrido visual (login de Google). → `en_revision`.
- **HU-020 aprobada** (reviewer Sonnet, 1ª ronda). Dudas no bloqueantes: frases genéricas de menú del PDF real en fixtures y en la HU. PR a develop con `Closes #48`; migrar Neon antes del merge.

## 2026-11-12 — Migración a VPS + HU-023 Mercado Pago OAuth
- Producción pasó de Vercel + Neon a VPS propio (169.58.151.56, deploy/compose.yml, Caddy, sslip.io). PR #52. Base nueva vacía + seed base. Bot vinculado al WhatsApp de Joel para la prueba. Vercel desconectado del repo; falta `vercel project pause` (interactivo).
- Prueba punta a punta OK: Leo sacó turno con seña $100, pagó con MP real, webhook → turno CONFIRMED y confirmación por WhatsApp.
- **HU-023 mercadopago-oauth** → issue #53, rama feat/HU-023-mercadopago-oauth, `afinando` (afinador, Opus).
- HU-023: afinada (D1–D14) → `afinada_pendiente_validacion`.
- HU-023 **validada** (Resoluciones al final de la HU: app "Numa", PKCE, sin cuenta no hay seña; Joel conecta su cuenta por ahora).
- HU-023 → `en_arquitectura` (architect Opus; migracion-prisma + ui).
- HU-023: SDD lista (Refactorizaciones/mercadopago-oauth.md), verify.sh OK → `arquitectura_lista`.
- HU-023 → `implementando` (Opus; migracion-prisma, apple-design, web-design-guidelines).
- HU-023: implementer (Opus) `done` → progress/impl_HU-023.md (2657 tests OK, typecheck OK, migración aplicada en dev con pg_dump previo). Sin recorrido visual (login Google). → `en_revision`.
- **HU-023 aprobada** (reviewer Opus, 1ª ronda, sin cambios). 4 dudas no bloqueantes en progress/review_HU-023.md (la 1: posible falso 'revocado' si MP responde 401 a un pago de la cuenta vieja, mirar en la prueba). PR a develop con `Closes #53`; migrar el VPS antes del merge.

## 2026-11-21

- HU-024 (Leo, multi-tenant) mergeada a develop (PR #75) y publicada en prod (PR #76, deploy 1a3125b, 12 migraciones OK, base sin pacientes). Arreglé `backlog/HU-022.json` de Leo (→ bloqueada) para destrabar el CI, con su aviso en el PR. Pendiente en prod: correr `legacy-memberships` cuando la nutricionista use recetas y plantillas.
- **HU-025** tomada: issue #68 asignado (estado: en curso), rama `feat/HU-025-autenticacion-permisos-tenant`, backlog en `afinando`. Lanzo el afinador.
- **025a-1 aprobada** (Opus/Opus; review en progress/review_HU-025a1.md). Nota del reviewer para el deploy: si después de la fase 3 `/ajustes` muestra error de calendario, Daiana vuelve a entrar (en la fase 2 el refresh token no se guarda porque todavía no tiene membresía). 025a-2 en curso en el worktree `../Nutri-Bot-HU025a2`, encima de 025a-1.
- 025a-1 en producción (deploy 9bd1495, migración tenant_access_identity OK). Pendiente: fases 2 y 3 de §6.4 (la nutricionista vuelve a entrar y `tenant-access.ts grant ... --role OWNER`).
- **025a-2 aprobada** (Opus/Opus; review en progress/review_HU-025a2.md). **No se publica a `main` hasta la fase 3.** Notas del reviewer para 025b: los tests de recetas mockean `@/lib/tenant-context` sin el candado (mejor mockear `requireTenantContext`); falta el aviso de `/inicio?error=AccessDenied`; `disconnectMercadoPagoAction` sin `requireTenantContext` (M4).
- **025b-1 aprobada** (Opus/Opus; review en progress/review_HU-025b1.md). Antes de publicarla a `main`, en producción (solo lectura): `SELECT count(*) FROM "AnthropometricReport" WHERE "tenantId" IS NULL;` → si da > 0, completar `tenantId` desde `EvolutionEntry` antes del deploy. Para 025b-2: pasar a `getConversationTenant()` los tres puntos del bot que quedan (`conversation.ts` depositUnavailable y handoffAlertTarget, `workers.ts` tick), `weeklyMenu`/`planSections` con tenant obligatorio por tipo en M10, y `professional-pdf.ts` en M6.

### 2026-11-22 — pausa a pedido del usuario (025b-2)
- 025b-2: 1er review CHANGES_REQUESTED (recetas sin visibilidad por tenant + SQL de prod incompleto). Reintento 1 hecho (commits 7df879b, ea1d792 en el worktree `../Nutri-Bot-HU025b2`). La 2da revisión (Opus) se lanzó y se **detuvo** a pedido del usuario antes de terminar.
- Al retomar: backlog en `en_revision`, intentos_revision=1. Relanzar el reviewer (preguntar modelo) sobre `git diff ac42a4d..HEAD`; los reportes `progress/impl_HU-025b2.md` y `review_HU-025b2.md` están sin commitear en el worktree.
- PR #80 (025b-1) sigue abierto. Pendientes de prod: fases 2/3 (Daiana + `pending`/`grant`), chequeo AnthropometricReport NULL y el chequeo SQL de alimentos SARA 2 (decisión 7 del impl) antes de publicar.

## 2026-11-24/25 — demo en prod + 2ª revisión de 025b-2
- Demo: WhatsApp de Daiana desvinculado en prod (respaldo `/root/backups/whatsapp-auth-daiana-20261124-1531.tgz`), bot con el número de Joel; MP conectado con la cuenta de Joel (liveMode). `BOT_AI_PROVIDER=deepseek` en el `.env` del VPS (respaldo en /root/backups/deploy-env-*.bak); hubo que recrear también `web` para que el panel vea la key. A las 20:25 WhatsApp cerró la sesión de Joel (logout); se re-vinculó 20:33.
- Pendiente post-demo: devolverle a Daiana su WhatsApp (restaurar el tgz) y que reconecte su MP. Gemini como proveedor del bot (compatible OpenAI) queda para después.
- 025b-2: review de la ronda 1 movida a `progress/review_HU-025b2-ronda1.md` (worktree). 2ª revisión lanzada (reviewer Opus) sobre `ac42a4d..HEAD`.
- **025b-2 aprobada** (2ª ronda, reviewer Opus) → HU-025 `aprobada`. Commit 7137493 en la rama; PR #81 apilado sobre #80 (base feat/HU-025b1), con `Closes #68`. El issue queda en "estado: en revisión" hasta que se mergee. Leo tiene que revisar #80 y #81.
- 2026-11-25: #81 y #80 mergeados → HU-025 completa en `develop` (8d56cc0). Issue #68 cerrado a mano (Closes no actúa fuera de `main`). Falta publicar a `main`: chequeos de solo lectura + fases 2/3 + legacy-memberships.
- 2026-11-25: chequeos de solo lectura en prod OK (0 / 0 / BotStatus y MP en legacy-tenant). Joel re-logueado → registrado → `grant` OWNER en legacy-tenant aplicado. Daiana se registra y recibe OWNER recién cuando entre (cuando esté todo listo). PR develop→main abierto para publicar HU-025.
- 2026-11-25: fix de auto-recuperación ante logout de WhatsApp (PR #83 → develop, #84 → main). **HU-028** tomada: issue #71 asignado (en curso, label migración), rama `feat/HU-028-integraciones-por-consultorio`, backlog `afinando`. Lanzo el afinador (Opus).
- HU-028 afinada (Opus) → `afinada_pendiente_validacion`: docs/hu-integraciones-por-consultorio.md, D1–D16, corte 028a (MP) → 028b (Calendar) → 028c (IA).
- HU-028 **validada** (acepta D1–D16; D15: app de Google en verificación, Google pidió uso limitado con IA). Se redactó la respuesta a Google.
- 2026-11-25: respuesta a Google (uso limitado con IA) enviada por Joel, sin video. Si el revisor lo pide: grabar turno → Calendar (crear/mover/borrar) + asistente sin acceso al calendario. HU-028 → `en_arquitectura` (architect Opus; migracion-prisma + refactor) para 028a.
- HU-028/028a: SDD lista (Refactorizaciones/integraciones-por-consultorio.md) → `arquitectura_lista`. Pendiente: confirmar arranque y la regla de lotes.
- 2026-11-25: regla del arnés cambiada a pedido de Joel: hasta 10 HU activas por responsable, en lotes (campo `lote`, estado nuevo `implementada`, un reviewer por lote). Migraciones siguen de a una. Avisar a Leo.
- **lote-1-mp** = HU-028 + HU-029. HU-029 tomada (issue #72 asignado, en curso), backlog `afinando`; lanzo el afinador (Opus).
- 028a → `implementando` (implementer Opus; migracion-prisma, web-design-guidelines).
- HU-029 afinada (Opus) → `afinada_pendiente_validacion`.
- HU-029 **validada**: $60.000 ARS mensual por defecto, baja/alta libre, varios planes (1 mes gratis, anual con descuento, pack 3 meses); D2–D15 aceptadas.
- HU-029 → `en_arquitectura` (architect Opus; migracion-prisma + ui).
- HU-029: SDD lista (Refactorizaciones/suscripcion-arzium-mercadopago.md) → `arquitectura_lista`. 029a (sandbox) la corre Joel; 029b depende de la compuerta G1. Pasarle a Leo la ruta /ajustes/suscripcion para HU-026.
- 028a implementer (Opus) `done` → progress/impl_HU-028a.md (8 commits 5299bfd..766c5c3, 3963 tests OK, migración aplicada en dev). → `implementada` esperando al lote. Supuesto sin confirmar: user_id en el cuerpo de la notificación de MP (validar en el primer pago post-deploy).
- Joel: 028a se revisa sola, fuera del lote. 029a → `implementando` (implementer Opus, sin skills).
- 028a → `en_revision` (reviewer Opus, fuera de lote). Tablero: #71 Revision.
- 029a implementer (Opus) `done` → progress/impl_HU-029a.md (4 commits 995e4da..2763420, 4010 tests OK). → `implementada`. Falta la corrida en sandbox de Joel (runbook en docs/mp-suscripciones-sandbox.md); 029b bloqueada hasta entonces.
- **028a aprobada** (reviewer Opus, 1ª ronda). PR desde rama `feat/HU-028a-mp-por-consultorio` (766c5c3 + docs, worktree ../Nutri-Bot-HU028a) a develop. HU-028 → `validada` para 028b. Tablero #71: Lista para dev.
- Contrato HU-026↔HU-029 acordado con Leo (anexo de la SDD 029, comentario en #72): getTenantSubscriptionGate; con el cobro apagado los consultorios nuevos se habilitan sin suscripción.
- 028b → `en_arquitectura` (architect Opus; migracion-prisma + refactor). Tablero #71: En curso.
- PR #85 (028a) mergeado a develop (5900638). 028b: SDD lista (§B1–B16 al final de Refactorizaciones/integraciones-por-consultorio.md) → `arquitectura_lista`; 028b-2 (contracción) aparte.
- 028b → `implementando` (Opus; migracion-prisma, web-design-guidelines) en worktree ../Nutri-Bot-HU028b, rama feat/HU-028b-calendar-por-consultorio desde develop. Sandbox 029a: Joel no puede ahora (fuera de casa).
- 028b implementer (Opus) `done` → ../Nutri-Bot-HU028b/progress/impl_HU-028b.md (11 commits 75e6c89..f0d933d, 4109 tests OK, migración aplicada en dev con pg_dump, traslado solo dry-run). Falta INTEGRATION_TOKEN_KEY en .env local.
- 028b → `en_revision` (reviewer Opus, sola).
- **028b aprobada** (reviewer Opus, 1ª ronda). Commit 61c0a68, PR a develop. HU-028 → `validada` para 028c. Nota del reviewer: revocar en Google anula la cuenta entera (si dos consultorios usan la misma cuenta, desconectar en A corta B).
- PR #86 (028b) mergeado. 028c → `en_arquitectura` (architect Opus; migracion-prisma + refactor), con la dependencia de 025c a resolver.
- 028c: SDD lista (§C0–C16 en ../Nutri-Bot-HU028c) → `arquitectura_lista`. 025c/025d nunca se hicieron (nadie las tiene). Decisión D-c1 pendiente. Issue #71 estaba cerrado (cerrado a mano 2026-11-26 00:11 UTC): reabierto.

## 2026-11-27
- Fix fuera de HU: redirecciones del portal usaban el host interno (0.0.0.0:3000). PR #88 (develop) y hotfix #89 (main), sin publicar: falta OK del usuario.
- Bot prod: Bad MAC continuo tras vincular el número de Joel; se respaldó la sesión (/root/backups/whatsapp-auth-joel-badmac-20261126-1416.tgz), se borró y Joel re-vinculó. Conectó sin errores.
- Leo (mleonel.martinez0098@gmail.com) recibió OWNER en legacy-tenant (prod).
- 028c: D-c1 = (b). Anotado en las dos SDD y en backlog/HU-028.json. Resto de 025c/025d → issue #91 (HU-033).
- 028c no puede pasar a implementando todavía: HU-026 de Leo (migración 20261126013713_tenant_onboarding_profile) está en implementando y no está en develop.
- HU-032 (#90, NutriBot Studio) tomada: worktree ../Nutri-Bot-HU032, afinador (Opus) corriendo → docs/hu-nutribot-studio.md.
- HU-033 (#91) tomada, entrega 025c (sin migración): worktree ../Nutri-Bot-HU033, implementer Opus + skill refactor corriendo → progress/impl_HU-033.md. Excluye runBotAiTool (028c).
- HU-032: afinada (docs/hu-nutribot-studio.md, D1–D20). Usuario pidió diseño Figma de la 032a antes de validar; agente de diseño corriendo → progress/diseno_HU-032a.md. Hotfix #89 publicado y verificado.
- HU-033 025c implementada (7 commits 5e1c4a1..7c7de25, verificación OK; conflicto previsto con #88 en portal/login/route.ts). Lote-3 completo → falta elegir modelo del reviewer.
- HU-033 025c aprobada (reviewer Sonnet) → PR #92 a develop (Refs #91; 025d pendiente). Sandbox 029a: preapproval mensual+7 días creada (5b66cf85…), esperando que Joel la autorice como comprador.
- Sandbox 029a (2026-11-27): S1,S2,S7,S15,S16,S17 confirmados; S3 y S4 refutados (payer_email obligatorio; MP no respeta X-Idempotency-Key en preapproval); S9 next_payment_date desde la creación + validación $0; S5/S6/S13 en parte. Creadas 3 diarias para pasos 8/10: 266d63 (1 día de prueba), 35df7c (sin prueba, APRO), df8a35 (sin prueba, OTHE). Túnel ngrok y listen corriendo en la Mac.
- 029a: compuertas resueltas (G1 abierta). 029b desbloqueada salvo turno de migración. Leo abrió PR #87 (HU-026).
- HU-032 validada (Leo aprobó el diseño; D1–D20 recomendadas; D10 pendiente de confirmación de Leo en #90). Orden de migraciones: 028c → 029b → 032a. Architect (Opus) ajustando SDD 029b con resultados del sandbox.
- PR #87 (HU-026 Leo) revisado (code-review high: 1 importante conocido → 029b, 5 nits comentados), aprobado y mergeado. Turno de migración → 028c: implementer Opus + migracion-prisma corriendo en ../Nutri-Bot-HU028c → progress/impl_HU-028c.md. Issue #71 en curso.
- #88 y #92 mergeados (en #92 se descartó el commit de ENABLED_TENANT_IDS: HU-026 le cambió el sentido). DP1 de 029b aceptada (1 h) → 029b arquitectura_lista. HU-032 SDD lista (Refactorizaciones/nutribot-studio.md en ../Nutri-Bot-HU032; ADR: editor propio dnd-kit + react-pdf, sin Chromium; 032a-1 con migración, 032a-2 galería+editor; Q1–Q9 con recomendación aplicada).
- HU-032: Q1–Q9 aceptadas; SDD commiteada en feat/HU-032-nutribot-studio. arquitectura_lista; 032a-1 espera turno después de 029b.
- 028c implementada y rebasada sobre develop con #92 (12 commits, getProfessional borrado; 4294 tests OK). Lote-1-mp completo (028c + 029a) → falta modelo del reviewer.
- Turno de migraciones acordado con Leo (2026-11-27): 028c → HU-027 (Leo) → 029b → 032a-1. Avisarle a Leo cuando el PR de la 028c esté mergeado en develop.
- 028c aprobada → PR #93 (Refs #71). 029a rechazada (1/2): el código está bien; falla el informe docs/mp-suscripciones-sandbox.md (encabezado, tabla con celdas de más, §5/§6, conclusiones S1/S6/S9/S8/S14) e impl_HU-029a.md desactualizado.
- #93 (028c) mergeado a develop. Turno de migración → HU-027 de Leo (avisado en #70). HU-028 queda con 028b-2 pendiente.
- 029a aprobada en la re-revisión (Sonnet) → PR #94 (Refs #72), rama feat/HU-029a-sandbox-suscripciones. HU-029 queda arquitectura_lista con 029b (espera que entre la migración de la HU-027 de Leo).
- #94 (029a) mergeado a develop.
- Prep publicación develop→main: chequeos de solo lectura en prod OK (028a/028b/028c, 0 huérfanas, 9 preguntas legacy). INTEGRATION_TOKEN_KEY generada en el VPS (respaldo del .env en /root/backups/deploy-env-*.bak) y en el .env local. Falta: Joel copia la clave al gestor, agrega redirect URIs de Calendar en Google Cloud, prueba local opcional, PR develop→main.
- PR #95 develop→main abierto (publicación), sin mergear: espera OK de Joel.
- 2026-11-27 PUBLICADO #95 (0f138c5): 4 migraciones OK, traslado de Calendar transferred=1, MP y Calendar conectados en legacy-tenant, 9 preguntas IA con tenant, bot conectado, web 200. Falta prueba manual en el panel.
- Joel probó prod: todo conectado. Leo abrió PR #97 (follow-ups del review de #87, sin migración).
- Orden de migraciones cambiado con OK de Leo: 029b → HU-027 → 032a-1.
- 025d: SDD actualizada (§16, en ../Nutri-Bot-HU033d), migración platform_support_access en cola; dudas Q1–Q7 pendientes.
- 025d: Q1–Q7 aceptadas; spec commiteada en feat/HU-033-025d-soporte. Migración al final de la cola (029b → HU-027 → 032a-1 → 025d).
- 029b implementada (15 commits en feat/HU-029b-suscripcion, migración 20261127213351_tenant_subscriptions aplicada en dev, §B.9.6 OK). Arreglos chicos (robots/canónica/calculateAge) en ../Nutri-Bot-fixchicos SIN commitear: Joel rechazó el commit/push/PR.
- 029b aprobada (+ test de no reintento del SDK) → PR #98 a develop (Refs #72). Al mergear: avisar a Leo en #70 que tiene el turno para la 027.
- #98 (029b) mergeado a develop. Turno de migración → HU-027 de Leo (avisado en #70). Siguiente en cola: 032a-1, luego 025d.
- Publicación de la 029b: chequeos previos OK (1 tenant, sin migraciones a medias), ARZIUM_SUBSCRIPTIONS_ENABLED=false agregada al .env del VPS (respaldo en /root/backups). PR #99 develop→main abierto, sin mergear. PR #100 (docs) con P-b1..P-b3 en la Parte C.
- Deploy de #99 (85c0b61) FALLÓ en el build de web por OOM de Node; prod sigue con la versión anterior (sin migrar). Fix: PR #101 (NODE_OPTIONS=--max-old-space-size=3072 en la etapa build). El merge de #101 lo bloqueó el modo auto: lo decide Joel. Después: PR develop→main para republicar.
- 2026-11-27 PUBLICADO #102 (c1603ce): build OK con el heap nuevo; migración tenant_subscriptions aplicada; plan mensual 60000/7 días en LIVE y SANDBOX; CHECKs del email; bot conectado; web 200. Cobro apagado.
- 2026-11-27 orden del espacio de trabajo: 11 worktrees mergeados borrados; repo principal pasado a develop; copias viejas de docs borradas (develop tenía iguales o más nuevas); sesiones viejas de WhatsApp movidas a ~/backups/nutribot-whatsapp-viejas.
