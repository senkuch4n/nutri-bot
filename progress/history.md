# Bitácora histórica del arnés (append-only)

> Cada vez que se cierra una HU (aprobada o bloqueada), su resumen se agrega
> acá. No se editan entradas anteriores, solo se agrega al final.

---

## 2026-09-23 — Bootstrap del arnés RDD/SDD

- **Agente:** Claude Opus 5.5 (orquestador), junto con Joel.
- **Origen:** migrado desde Evidentia-GFD y adaptado a este monorepo
  (`apps/web`, `apps/bot`, `packages/core`, `packages/db`).
- **Diferencias con Evidentia:** sin Codex (todo corre en Claude Opus); un
  solo implementador (`implementer`) para todo el monorepo en vez de
  backend/frontend separados; sin reviewer DeepSeek legado.

---

## 2026-09-23 — HU-001 `datos-paciente-calculos` — APROBADA (1ª ronda)

- **Qué:** sexo (para fórmulas), actividad física, objetivo (4 opciones) y contextura en `Patient`
  (4 enums, columnas nullable). Tarjeta "Datos para cálculos" en la ficha con aviso de faltantes,
  aviso de menor de 18 y resumen de edad/peso/talla/% grasa con fecha. Constantes de dominio y
  lógica de faltantes en `packages/core/src/patient-formula-data.ts` (19 tests).
  `getLatestFormulaMeasurements` en `packages/db/domain`. La IA (plan y asistente) recibe los datos nuevos.
- **Migración:** `20260924022353_patient_formula_data` (solo `CREATE TYPE` + `ADD COLUMN` nullable).
- **Modelos:** implementer Opus; reviewer Fable.
- **Docs:** `docs/hu-datos-paciente-calculos.md`, `Refactorizaciones/datos-paciente-calculos.md`,
  `progress/impl_HU-001.md`, `progress/review_HU-001.md`.
- **Pendientes:** prueba manual en el navegador antes de mergear. `test:confirm-flow` del bot
  llama a crons sin filtrar por paciente: puede encolar WhatsApp a JIDs reales (arreglar aparte).
  `calculateAge` de `apps/web/src/lib/age.ts` con desfase por zona horaria (arreglar aparte).
  Decidir si los scripts de prueba contra la base se conservan o se borran (SDD vs CHECKPOINTS).

---

## 2026-09-24 — HU-002a `rediseno-ui-fundaciones` — APROBADA (2ª ronda)

- **Qué:** sistema de diseño nuevo al estilo Notion (tokens como variables CSS, Inter, acento neutro,
  modo oscuro preparado sin activar), primitivos de shadcn/ui `new-york` v3 sobre Tailwind 3.4 en
  `components/primitives/`, componentes de aplicación (DataTable, NumberInput, AdequacyBar,
  confirmación, toasts, skeletons, callouts), sidebar agrupada colapsable con estado del bot,
  portal con tono cálido y pestañas (suma "Plan"), login sobrio en `/login` e `/inicio`, y páginas
  `loading`/`error`/`not-found`. Las pantallas todavía no están migradas: se ven renovadas por los
  primitivos y los alias LEGACY de los tokens viejos.
- **Ronda 1:** CHANGES_REQUESTED (espacio duro en `Quantity`, `aria-describedby` de `NumberInput`),
  más la sidebar, que no entraba a 663 px de alto (encontrado en el recorrido del orquestador).
- **Modelos:** implementer Fable (en las dos rondas); reviewer Opus (en las dos rondas).
- **Docs:** `docs/hu-rediseno-ui-empresarial.md`, `Refactorizaciones/rediseno-ui-fundaciones.md`,
  `progress/impl_HU-002a.md`, `progress/review_HU-002a.md`, `progress/recorrido_HU-002a.md`.
- **Pendientes para el usuario:** login en ventana privada, portal a 360 px (DevTools), contraste.
  El recorrido de la primera HU que consuma NumberInput, DataTable y `error.tsx` tiene que cubrirlos.
- **Nota operativa:** con Tailwind 3.4 en Node 24, un cambio en `tailwind.config.ts` obliga a
  reiniciar `npm run dev` (no se recarga solo).

---

## 2026-09-24 — HU-002b `rediseno-ui-pacientes` — APROBADA (2ª ronda)

- **Qué:** la ficha del paciente pasa a un encabezado fijo con 6 pestañas (`?tab=`); *Resumen*
  prioriza la evolución y los datos para cálculos (este último, editable en un Sheet); la lista de
  pacientes y las mediciones pasan a DataTable; el detalle del plan tiene una franja de totales y
  una columna lateral; toasts y `useConfirm`. Gráficos de evolución en **barras con Recharts 3.10.1**
  (peso, perímetros y pliegues por estudio, bioimpedancia, peso vs. grasa con doble eje).
  **Se desinstalaron `@mui/*` y `@emotion/*`.** El PDF del plan usa Inter y el estilo nuevo, con
  el nombre de la nutricionista y "NutriBot".
- **Ronda 1:** CHANGES_REQUESTED. (1) Deadlock de `useConfirm` dentro de una form action de React
  19 ("Borrar plan" no abría el diálogo; lo encontró el recorrido del orquestador y el reviewer
  confirmó la causa); venía del fragmento de la SDD. (2) Subtítulo falso en peso vs. grasa. Se
  sumó un JSDoc en `useConfirm` con la regla.
- **Modelos:** implementer Fable (en las dos rondas); reviewer Opus (en las dos rondas).
- **Docs:** `Refactorizaciones/rediseno-ui-pacientes.md`, `progress/impl_HU-002b.md`,
  `progress/review_HU-002b.md`, `progress/recorrido_HU-002b.md`.
- **Pendientes:** formato es-AR del total del PDF (anotado en HU-002d); perímetros en barras
  horizontales anterior vs. actual (evaluar con el informe, épicas 44–46); regla de `useConfirm`
  para las SDD de 002c y 002d (anotada en el backlog).

---

## 2026-09-24 — HU-002c `rediseno-ui-agenda-gestion` — APROBADA (1ª ronda)

- **Qué:**
  - Calendario: franja compacta de contadores y detalle del turno en un panel lateral no modal
    (se puede tocar otro turno sin cerrar); esqueleto con la forma del calendario; la página se
    movió a `(panel)/(calendario)/page.tsx`.
  - Servicios: alta y edición en Sheet.
  - Pagos: tabla con filtros visibles y totales arriba; pago manual en un diálogo.
  - Avisos: cola en tabla; la difusión se confirma con `useConfirm` sin deadlock y **el texto se
    conserva si falla**.
  - Ajustes: pestañas laterales con formulario único; el color por defecto del PDF sale de
    `DEFAULT_PDF_ACCENT`.
  - Toasts en todos los formularios.
- **Modelos:** implementer Fable; reviewer Opus.
- **Recorrido:** OK (`progress/recorrido_HU-002c.md`). `OutboundMessage` sin cambios (4 → 4). No
  verificados: disponibilidad, `/ajustes/whatsapp`, asistente, 768 px, Slow 4G, movimiento
  reducido; el reviewer revisó su código sin encontrar problemas.
- **Hallazgo anterior a la HU:** el calendario muestra los turnos en UTC, 3 horas corridos
  (FullCalendar recibe `timeZone` sin plugin de zonas horarias). Se arregla como cambio directo.
- **Pendientes:** confirmación para "Cancelar turno" y "Reintentar N fallidos" (O-c1); colores
  de COMPLETED/NO_SHOW fuera de los tokens (O-c2); cierre inesperado del panel si se cambia de
  turno mientras corre una acción (duda del reviewer).

---

## 2026-09-24 — HU-002d `rediseno-ui-nutricion-portal` — APROBADA (1ª ronda) · cierra el rediseño

- **Qué:** alimentos en una tabla densa con el encabezado fijo; plantillas en tabla con un diálogo
  de alta y `useConfirm` para borrar; editor de comidas y franja `MacroTotals`; portal completo en
  tono cálido y mobile-first. Formato es-AR del total del PDF (`formatMacrosLine` en
  `packages/core`, con tests). Colores de COMPLETED/NO_SHOW del calendario con tokens (O-c2).
  **Se borraron los alias LEGACY** de `tailwind.config.ts`, `globals.css` y `Badge`: el sistema viejo
  ya no existe.
- **Modelos:** implementer Opus (se cortó por un límite de la API en la fase 10 y se retomó);
  reviewer Opus. Validación de la HU, del orquestador (modo autónomo).
- **Pendiente para el usuario:** reiniciar `npm run dev`, porque el dev no recarga
  `tailwind.config.ts`, y mirar si algo perdió color o borde. También los iframes a 360 px y el
  diario del portal.
- **Pendientes directos:** confirmación en "Borrar comida" (O-d1) y en el borrado del diario del
  portal (O-d2).

---

## 2026-09-24 — HU-003 `consulta-entidad-central` — APROBADA (1ª ronda) · Épica 30

- **Qué:** entidad `Consultation` (una por turno, o "Sin turno"). Agrupa las mediciones
  (`EvolutionEntry.consultationId`), las notas y el plan indicado. Al completar un turno se crea
  su consulta (dominio compartido web/bot en `setAppointmentStatus`); al revertir, se borra si
  está vacía y si tiene contenido se conserva y se pide confirmación. Pestaña **Consultas**
  (segunda) y detalle `/pacientes/[id]/consultas/[consultationId]`. Las mediciones nuevas desde
  Evolución caen en la consulta de ese día o crean una "Sin turno".
- **Migración** `20260924072056_consultation_entity`: aditiva e idempotente. Creó 18 consultas y
  vinculó las 15 mediciones existentes, sin cambiar valores. Respaldo previo (`pg_dump`) en el
  scratchpad de la sesión.
- **Modelos:** implementer Opus; reviewer Opus. Validación de la HU, del orquestador (modo
  autónomo).
- **Pendiente para el usuario:** recorrer en el navegador los flujos que escriben (completar o
  revertir un turno, agregar mediciones, notas, plan, nueva consulta) con un paciente de prueba.
  El orquestador reinició el `next dev` (cliente de Prisma viejo).
- **Pendiente técnico:** `apps/bot/scripts/test-confirm-attendance.ts` borra con
  `deleteMany({ where: { patientId } })`, en contra de la regla de AGENTS.md, y además puede
  encolar WhatsApp real (se vio en la HU-001).

---

## 2026-09-24 — HU-004 `calculadora-requerimiento` — APROBADA (1ª ronda) · Épicas 18 y 19

- **Qué:** diagnóstico antropométrico automático en el detalle de la consulta: IMC con
  clasificación OMS, cintura, ICC por sexo, cintura/talla, conicidad, Deurenberg y peso ideal
  (Devine, Hamwi, Broca, Broca-Brugsch, Lorentz), con sugerencia de peso ajustado arriba del 130 %.
  Calculadora de requerimiento: las 4 TMB lado a lado (Mifflin preseleccionada; la del InBody solo
  como referencia), actividad, objetivo con su %, VCT indicado editable y macros en % del VCT o
  proteína en g/kg. Una `NutritionPrescription` por consulta, con los gramos objetivo guardados
  para la épica 23. Tarjeta "Requerimiento indicado" en el Resumen. Solo adultos: en menores, el
  aviso de siempre.
- **Fórmulas:** puras en `packages/core`, con tests con valores calculados a mano. El orquestador
  las verificó en el navegador con un paciente de prueba (borrado por id).
- **Decisión del orquestador:** kcal con separador de miles (`formatMacroAmount`), para que
  coincidan con el PDF.
- **Modelos:** implementer Opus; reviewer Opus. Validación de la HU, del orquestador (modo
  autónomo).

---

## 2026-09-24 — HU-005 `base-alimentos-sara2` — APROBADA (1ª ronda) · Épica 20

- **Qué:** base de alimentos argentina SARA 2 importada del PDF oficial. El lector
  (`pdftotext -layout`) genera un JSON versionado (`packages/db/data/sara2/`) y un reporte; el
  cargador es idempotente, con upsert por clave de origen. **890 alimentos importados, 16
  rechazados** (inconsistencias de la tabla) y la tabla 26 (suplementos) excluida. Los 90
  alimentos propios se conservan con id y datos (huella igual) como "Propio". Grupos de la Guía
  Alimentaria, nutrientes nuevos (saturadas, azúcar agregado, sodio, colesterol y el resto),
  kcal por Atwater, fuente SARA 2 / Propio, SARA 2 no editable (desactivar o duplicar como
  propio), selector con búsqueda en planes y plantillas, y popover de desglose de kcal.
- **Decisiones del orquestador:** Q1, suma de macros entre 90 y 110 g (la tabla oficial no
  cumple 97–103); Q2, Atwater con tolerancia de 5 % (entra la banana).
- **Verificación:** el reviewer comparó 16 alimentos contra el PDF y todos coinciden.
- **Modelos:** implementer Opus; reviewer Opus. Validación de la HU, del orquestador (modo
  autónomo).
- **Arreglo directo al cierre:** `seed-demo.ts` busca solo alimentos propios (nombres repetidos
  con SARA 2).

---

## 2026-09-24 — HU-006 `antropometria-isak` — APROBADA (2ª ronda) · Épicas 44 y 45

- **Qué:** estudio ISAK completo por consulta: masa, talla, talla sentado, envergadura, 8
  pliegues, 6 perímetros y 3 diámetros. Son columnas nullable en `EvolutionEntry` con
  `study = ISAK`, una por consulta. Se calculan al vuelo:
  - puntuación Z contra el Phantom;
  - fraccionamiento molecular (Durnin-Womersley) y tisular (Kerr, Lee, Rocha, residual);
  - distribución adiposo-muscular;
  - IAM, IMO con categorías;
  - sumatorias, perímetros corregidos, proporcionalidad;
  - somatotipo de Heath-Carter con somatocarta (Recharts);
  - índices de salud, reusando la HU-004.

  Página `.../consultas/[id]/antropometria`, con comparación mínima con el estudio anterior.
- **Validación:** `isak:validate` contra las dos exportaciones de ISAKMetry: 100 OK, 2 tolerados
  y 3 diferencias conocidas (D5, D6, D7). En el navegador, el caso A coincidió en todo. Los
  archivos de ISAKMetry no se versionan y `--check-leaks` no encuentra fugas.
- **Ronda 1:** `onDone` durante el render (reviewer) y la `key` que remontaba el formulario
  (encontrado por el orquestador en el navegador).
- **Modelos:** implementer Opus; reviewer Opus. Validación de la HU, del orquestador (modo
  autónomo).

---

## 2026-09-24 — HU-007 `informe-antropometrico` — APROBADA (1ª ronda) · Épica 46

- **Qué:** informe antropométrico en PDF que compara el estudio ISAK actual con el anterior:
  datos personales, mediciones con diferencia, pliegues, perímetros y corregidos, distribución,
  indicadores de salud, composición y somatotipo. Gráficos SVG en react-pdf: perímetros en barras
  horizontales, composición en barras apiladas, silueta con los % por zona y somatocarta. Textos
  por plantilla y conclusiones editables obligatorias. Página
  `.../antropometria/informe` con Guardar textos, Generar PDF y Enviar por WhatsApp (nuevo
  `MessageKind.ANTHROPOMETRIC_REPORT_PDF`, con un cambio mínimo en el bot). Título y matrícula en
  `Professional` (épica 47, acotada) y en `/ajustes`. Se extrajo `pdf-common.tsx` sin cambiar el
  PDF del plan.
- **Incidente:** el implementer vació la base de desarrollo al usarla como shadow de Prisma. Se
  restauró por completo desde el `pg_dump` previo y se agregó la regla a AGENTS.md y a
  skills/migracion-prisma.md.
- **Verificación:** 407 tests; renders del PDF en 5 variantes revisados en PNG por el implementer.
  En el navegador, solo la página (Chrome en segundo plano no hidrataba).
- **Pendiente para el usuario:** cargar título y matrícula en `/ajustes` ("Lic.", "852"); probar
  "Generar PDF" en el navegador. En el PDF, "→" se reemplaza por "a" porque Inter latin no tiene
  la flecha.
- **Modelos:** implementer Opus; reviewer Opus. Validación de la HU, del orquestador (modo
  autónomo).

---

## 2026-09-24 — HU-008 `pediatria-oms` — APROBADA (1ª ronda) · Épica 56

- **Qué:** pacientes de 5 a 18 años con la referencia OMS 2007: IMC/E y T/E con Z LMS (y la
  extensión OMS para |Z| > 3), percentil y clasificación. Las tablas LMS se bajaron de who.int
  con sha256 verificado y se versionaron con un script reproducible, más la fila del mes 60 de la
  OMS 2006. TMB por Schofield (1985) en sus dos variantes, con reglas para menores en la
  calculadora: sin peso ideal ni ajustado, sin déficit agresivo, VCT mínimo 500 kcal y ayudas de
  macros pediátricas. La página ISAK y el informe muestran la clasificación pediátrica. Los
  menores de 5 quedan sin referencia, con un aviso.
- **Migración** `pediatric_schofield`: 2 valores de enum, 2 columnas y 3 `DROP NOT NULL`, sin
  pérdida de datos.
- **Verificación:** el orquestador comprobó a mano la Z (+1,52) y Schofield (1.168 / 1.185); el
  recorrido coincidió en todo.
- **Modelos:** implementer Opus; reviewer Opus. Validación de la HU, del orquestador (modo
  autónomo).

---

## 2026-10-02 — HU-011 `mensajes-fuera-de-horario` — APROBADA (1ª ronda) · senkuch4n

- **Qué:** franja "fuera de horario" configurable en `/ajustes` → Bot (por defecto 22:00–09:00,
  con interruptor). De noche, la opción 0 no alerta: el bot pide la consulta y la guarda en
  `PatientInquiry` (paso `AWAIT_INQUIRY`, se agrega a la misma consulta por sesión y por noche).
  De día la alerta sigue inmediata y la consulta también se guarda (arregla el "no entendí"
  después del 0). Resumen único a fin de franja por WhatsApp a `phoneJid`, idempotente. Bandeja
  **Mensajes** (`/mensajes`) con Pendientes/Respondidas/Todas y badge en la sidebar. Audios y
  fotos: el bot pide que lo escriba.
- **Migración** `after_hours_inquiries`: aditiva (enum, tabla, 3 columnas con DEFAULT).
  Respaldo `~/nutribot-backups/pre-hu011-20261002-1850.dump`.
- **Verificación:** 780 tests (61 nuevos), `test:after-hours` 12/12, `test:confirm-flow` 5/5,
  base sin restos. Recorrido del orquestador en `progress/recorrido_HU-011.md`.
- **Pendiente (no bloqueante, ver `progress/review_HU-011.md`):** texto del estado vacío de
  `/mensajes` (dice "fuera de horario" pero también entran las de día); el form de `/ajustes`
  puede perder lo tipeado cuando hay error de validación; "Anoche" fijo en el resumen; confirmar
  que Postgres de producción está en UTC; P7 (`phoneJid` ≠ número del bot).
- **Primera HU del arnés para dos personas** (rama `feat/*` desde `develop`, Notion como lock).
- **Modelos:** afinador y architect Opus; implementer Opus (se colgó una vez y se retomó);
  reviewer Opus. Skills: migracion-prisma, ui (SDD); migracion-prisma, ui-ux-pro-max,
  ui-styling, web-design-guidelines (impl).

---

## 2026-10-02 — HU-012 `preguntas-bot-ia` — APROBADA (1ª ronda) · senkuch4n

- **Qué:** opción **5️⃣ Hacer una pregunta** en el menú del bot (solo con el interruptor de
  `/ajustes` prendido y `API_KEY_IA_ANTHROPIC` cargada). Claude Haiku 4.5 (`claude-haiku-4-5`,
  fallback DeepSeek por env) responde con 4 tools de solo lectura (servicios, disponibilidad,
  turnos propios, datos del consultorio + "Información para el asistente"), sin datos clínicos ni
  de otros pacientes y sin sacar/cancelar turnos. "0" desde el modo pregunta crea el
  `PatientInquiry` con "Pregunta al asistente: …" (flujo HU-011). Límites 20/día por paciente, 300
  global, 500 caracteres; cola por contacto; fallback fijo ante errores. Registro en
  `BotAiQuestion` con retención de 90 días.
- **Migración** aditiva (tabla `BotAiQuestion` + columnas en `Professional`), con respaldo previo.
- **Verificación:** 863 tests (83 nuevos), `test:bot-ai` 18/18 con proveedor falso (ninguna
  llamada real a la API), regresión HU-011 12/12 y confirmación 5/5, base sin restos.
- **Pendiente (no bloqueante, ver `progress/review_HU-012.md`):** si falla la base en el modo
  pregunta el paciente no recibe `AI_ERROR`; el historial de la sesión (`ConversationState.context`)
  queda fuera de la retención de 90 días; probar con la clave real (recorrido del usuario).
- **Modelos:** afinador y architect Opus; implementer Opus; reviewer Opus. Skills: migracion-prisma,
  ui (SDD); migracion-prisma, claude-api, ui-styling, web-design-guidelines (impl).

---

## 2026-10-02 — HU-013 `motivo-consulta-reserva` — APROBADA (1ª ronda) · Épica 52 · senkuch4n

- **Qué:** el bot pide el motivo de consulta después de elegir horario y antes del resumen (opcional,
  con salteo ampliado: saltear, no, -, saltar, no gracias, prefiero no decirlo, después…; 500
  caracteres, mínimo 3; audios/fotos → pedir texto, epígrafe de foto se toma). Configurable por
  servicio (`Service.asksReason`, encendido por defecto). Se guarda en `Appointment.reason`, se ve en
  el resumen, en la alerta de turno nuevo (recortado a 200, sin y con seña), en el detalle del turno
  (editable), en la consulta clínica (solo lectura) y en la ficha. No llega a Google Calendar, al
  portal ni a la IA. Opcional en "Nuevo turno" del panel.
- **Migración** `booking_reason`: 2 columnas, aditiva. Respaldo `~/nutribot-backups/pre-hu013-20261002-2217.dump`.
- **Verificación:** 962 tests (94 nuevos), `test:booking-reason` 17/17, regresiones de confirmación,
  HU-011 y HU-012 OK; servicios, turnos, pacientes y `Professional` reales intactos (salvo
  `asksReason` = true por la migración). Recorrido en `progress/recorrido_HU-013.md`.
- **Pendiente:** P3 (motivo en `ConversationState.context` si abandona) tras el PR #8; si el horario
  se ocupa mientras escribe el motivo, lo tiene que reescribir; la limpieza previa del script borra
  `OutboundMessage` a jids de prueba compartidos con otros scripts.
- **Modelos:** afinador, architect, implementer y reviewer Opus. Skills: migracion-prisma, ui (SDD);
  migracion-prisma, ui-styling, web-design-guidelines, ui-ux-pro-max (impl).

---

## 2026-10-03 — HU-014 `recordatorios-por-servicio` — APROBADA (2ª ronda) · Épica 50 · senkuch4n

- **Qué:** cada servicio tiene su lista de recordatorios (hasta 3, en días u horas, 1 h–14 días),
  editable en `/servicios`; uno puede "pedir confirmar (sí/no)" y reemplaza a la confirmación fija de
  72 h. Un solo cron `*/5` (`enqueueServiceReminders`) reemplaza al recordatorio global y a la
  confirmación. Reservas tardías se saltean; con el bot caído sale solo el más cercano si faltan > 2 h;
  los de días que caen entre 22 y 09 se corren a las 09:00. Texto con "mañana / pasado mañana / en una
  semana". Botón "Enviar recordatorio ahora" independiente (freno a doble clic), oculto en turnos
  pasados; el detalle muestra qué salió y qué falta. Se retiró el campo global de `/ajustes`.
- **Migración** `service_reminders`: `Service.reminders` (JSONB), `OutboundMessage.dedupeKey` + unicidad
  `(appointmentId, kind, dedupeKey)`, `Appointment.bookedAt`, con backfill que deja todo como antes
  (3 días con confirmación + 24 h). `reminderLeadHours` queda sin uso. Respaldo
  `~/nutribot-backups/pre-hu014-20261002-2329.dump`. SQL generado con `migrate diff
  --from-schema-datasource` (solo lectura) por el prompt no interactivo; reproducible con `migrate deploy`.
- **Ronda 1 rechazada:** un cambio de configuración con avisos ya enviados podía repetir un recordatorio
  (hueco de la SDD 5.1). Ronda 2: un recordatorio está cubierto si ya salió un aviso automático en o
  después de su momento; además "Turno pasado" en el detalle.
- **Verificación:** 1124 tests, `test:service-reminders` 17 OK, regresiones (confirmación 8/8, motivo,
  IA, fuera de horario) OK; dry-run sobre turnos reales sin envíos; base sin restos.
- **Pendiente:** limpiar `reminderLeadHours`, `REMINDER_LEAD_HOURS` y el seed en una migración futura;
  dudas menores en `progress/review_HU-014.md`.
- **Modelos:** afinador y architect Opus; implementer Opus (2 rondas); reviewer Opus (2 rondas). Skills:
  migracion-prisma, refactor, ui (SDD); migracion-prisma, ui-styling, web-design-guidelines,
  ui-ux-pro-max (impl), ui-styling + web-design-guidelines (ronda 2).

---

## 2026-10-03 — HU-016 `matricula-firma` — APROBADA (2ª ronda) · Épica 47 · senkuch4n

- **Qué:** tarjeta "Firma y matrícula" en `/ajustes` → PDF: título, matrícula e imagen de la firma
  (PNG/JPG ≤ 1 MB, validada en el servidor por magic bytes), vista previa del bloque, reemplazar y
  quitar. El informe antropométrico muestra título + nombre en el encabezado y el bloque de firma
  compartido (`PdfSignatureBlock`) después de "Conclusiones", con aviso en el panel si falta
  matrícula o firma. El portal muestra título + nombre + matrícula (sin la imagen). La vista previa
  de la firma solo con sesión del panel y `no-store`; `getProfessional()` y todas las escrituras de
  `Professional` ya no devuelven los bytes (firma y logo); los logs del informe solo registran el
  código del error. El logo pasa a solo PNG/JPG (tope 2 MB) con aviso si el actual no es dibujable.
- **No se tocó el PDF del plan** (zona de la HU-015 de imleticio). Quedó decidido para cuando se
  rehaga: firma también en el plan, encabezado con título + nombre y pie por defecto "Lic. … · M.P. …".
- **Migración** `professional_signature`: 2 columnas nullable. Respaldo previo en `~/nutribot-backups/`.
- **Ronda 1 rechazada:** dos `console.error` del informe imprimían el error entero (podía incluir el
  PDF con la firma). Ronda 2: log solo con el código + test; `select` mínimo en 16 escrituras.
- **Verificación:** 1252 tests; regresiones del bot OK; base sin cambios (fila de `Professional`
  intacta). Recorrido en `progress/recorrido_HU-016.md`.
- **Pendiente aparte:** `test:booking-reason` escenario 14 falla siempre desde el PR #17 (el servicio
  de prueba con seña es inactivo y ahora se rechazan servicios inactivos).
- **Modelos:** afinador y architect Opus; implementer Opus (2 rondas); reviewer Opus (2 rondas).

## HU-017a · Rediseño Apple: fundaciones (aprobada 2026-10-03, senkuch4n)
- **Qué:** tokens de diseño (azul `#0066CC`, Inter variable con `opsz`, radios, sombras, curvas), Motion 14 con
  `LazyMotion`/`m.*`, primitivos rehechos (Button, Card, Dialog, AlertDialog, Sheet con arrastre para cerrar,
  Tabs, Toaster, scrim), shell del panel y del portal (sidebar, menú táctil) y demos `/dev-diseno` y
  `/dev-diseno-portal` (404 en producción). Las pantallas de Leo no se tocaron (solo heredan los primitivos).
- **Peso:** `/` +38,7 KB y `/portal` +19,7 KB (presupuesto +45 KB), gracias al alias `motion/react` →
  `framer-motion` (desvío D-4) y `framer-motion` 14.0.0 declarado en `apps/web`.
- **Rondas:** 1ª rechazada (sheet congelado al tocar durante la entrada/salida; scrim que bloqueaba en la salida;
  Toaster sin estilos). 2ª rechazada (dialog reabierto a mitad de la salida quedaba `inert`; el foco no volvía
  al disparador en overlays sin `Trigger`). 3ª aprobada. Además: salida del sheet con fallback de 1 s y foco
  fuera del panel al cerrar; reabrir justo después de Esc ya no se cierra solo.
- **Verificación:** 1380 tests; `next build`; recorridos en Chrome en `progress/recorrido_HU-017a*.md`.
- **Dudas no bloqueantes:** overlays con `tailwindcss-animate` sin uso, ref escrito en render en
  `useExitSnapshot`, `Tabs` no controlado → controlado; sidebar a 1366×768 medida en 634 px (confirmar).
- **Merge:** después del PR #7 de imleticio.
- **Modelos:** afinador y architect Opus; implementer Opus (3 rondas); reviewer Opus (3 rondas).

## HU-018b-1 · Menú semanal: modelo (aprobada 2026-10-03, senkuch4n)
- **Qué:** migración aditiva `weekly_menu` (enums `MealMode`/`Weekday`; `mode`/`isOptions` NOT NULL con default en
  comidas de planes y plantillas; `weekday` nullable en ítems). Lógica pura en `packages/core/weekly-menu.ts`
  (totales por día, promedio semanal, opciones con promedio y rango, ±5 %, pesos de micronutrientes) y operaciones
  en `packages/db/domain/weeklyMenu.ts` (copiar día, repetir, modo, deshacer, objetivo del plan). Portal, PDF, IA y
  micronutrientes ya leen el modelo semanal; los planes existentes no cambian.
- **Verificación:** `pg_dump` previo; script de antes/después (solo lectura): 9 planes, 113 ítems y 3 PDF idénticos.
  1431 tests; typecheck web y bot. Aprobada en la primera revisión.
- **Pendiente:** 018b-2 (editor semanal), con dos ajustes de la revisión (SDD §16).
- **Modelos:** afinador y architect Opus; implementer Opus; reviewer Opus.

## HU-018b-2 · Menú semanal: editor (aprobada 2026-10-03, senkuch4n)
- **Qué:** plan y plantilla nuevos con Desayuno/Almuerzo/Merienda/Cena "Cambia cada día" y Colaciones "Todos los
  días · Elegí una"; selector Semana/Lun…Dom (`?dia=`); franja del día contra el objetivo (±5 %); "Copiar este día
  a…", "Repetir en todos los días", cambio de modo con "¿Qué día conservar?", opciones con promedio y rango,
  renombrar/subir/bajar, todo con "Deshacer"; vista Semana; IA relee el plan antes de reemplazar comidas vacías.
- **Verificación:** 1454 tests; `test-weekly-menu.ts` (12 pasos, datos propios borrados por id); recorrido en
  Chrome con paciente de prueba (`progress/recorrido_HU-018b.md`). Aprobada en la primera revisión.
- **Dudas no bloqueantes:** foco al cerrar "Renombrar"/"¿Qué día conservar?" y al Subir/Bajar (probar con
  teclado); promedio semanal duplicado con redondeo distinto en la vista Semana; la franja fija tapa el
  encabezado de la tabla Semana.
- **Ojo al actualizar:** después de `db:migrate`/`db:generate`, reiniciar `npm run dev` (el cliente Prisma viejo
  queda en memoria).
- **Modelos:** implementer Opus; reviewer Opus.

## HU-018a-1 · Recetario manual (aprobada 2026-10-03, senkuch4n)
- **Qué:** migración `recipes` (recetas, ingredientes, foto, imágenes candidatas; `recipeId`/`portions` en los ítems de
  comida para la 018c). Lógica pura en core (macros por porción, porciones de ½, comparación >10 %, búsqueda por
  ingrediente, sin gramos inventados). Pantalla `/recetas`: grilla con buscador y filtros, ficha y editor con foto
  (WebP + miniatura con `sharp` en `@nutri-bot/db/media`, hasta 5 MB). Foto del portal solo con la receta en un plan
  ACTIVE.
- **Rondas:** 1ª rechazada (falso "¿Salir sin guardar?" después de guardar con foto); 2ª aprobada.
- **Verificación:** `pg_dump` previo; 1543 tests; `test:recipes` con datos propios borrados por id; recorrido en Chrome
  (`progress/recorrido_HU-018a.md`). Nada de los recetarios de terceros en el repo.
- **Pendiente:** 018a-2 (extractor + revisión de borradores, export/import a producción). Bug de `auth.ts`
  (`refresh_token` de cualquiera que inicia sesión) como tarea directa aparte.
- **Modelos:** architect Opus; implementer Opus (2 rondas); reviewer Opus (2 rondas).

## HU-018a-2 · Carga asistida de recetas (aprobada 2026-10-03, senkuch4n)
- **Qué:** parser de recetarios en `@nutri-bot/core/recipe-import` (5 formatos, sin gramos inventados), extractor
  `recipes:extract` (en seco por defecto; `--write`/`--images` cargan borradores), `recipes:undo` por corrida, pantalla
  `/recetas/revisar` (original al lado, sugerencias de alimento, fotos candidatas, comparación con la tabla del
  recetario, `⌘↵`/`⌘S`), y `recipes:export` / `recipes:import:prod` (en seco por defecto, idempotente por `importKey`).
- **Extractor en seco sobre los PDF reales:** 320 borradores de 24 archivos, 2450 ingredientes (1098 sin gramos en el
  texto), 0 gramos inventados. Nada de terceros en el repo.
- **Recorrido:** 1ª pasada con Build Error de Turbopack (`export type … from` en un `"use server"`), arreglado antes
  de la revisión. Aprobada en la primera revisión.
- **Modelos:** implementer Opus; reviewer Opus.

## HU-017c-1 — Lista de pacientes simple (aprobada 2026-10-04, senkuch4n)
- Buscador grande sin acentos, próximo turno en lenguaje común, teléfono con formato, canales @newsletter ocultos, "Por completar" para contactos sin nombre con "Poner nombre", helpers de contacto/teléfono/fechas en core.
- Implementer Opus (ui-ux-pro-max, apple-design, web-design-guidelines), reviewer Opus: APPROVED en la 1ª revisión.

## HU-017c-2 — Ficha de 4 pestañas y Resumen (aprobada 2026-10-04, senkuch4n)
- Ficha de 7 a 4 pestañas (Resumen, Consultas, Plan, Historial) con alias de URLs viejas, Resumen con una acción principal y tarjetas en lenguaje común, "Editar datos" en un solo Sheet ($transaction), Historial con segmentado.
- Recorrido encontró un crash en runtime (íconos como función a componentes cliente), arreglado antes de la revisión. Reviewer: CHANGES_REQUESTED en la 1ª (replaceState con el estado de Next pierde la pestaña tras una server action) → APPROVED en la ronda 2.

## HU-017c-3 — Consulta, ISAK y Deshacer (aprobada 2026-10-04, senkuch4n)
- Borrado diferido con "Deshacer" (consulta, estudio, cálculo, medición, quitar plan), destructivas en menú "…" con confirmaciones simples, botones grandes con ícono y texto, columna lateral sticky, ISAK con índice y barras z. Arregla el error de hidratación del sidebar en todo el panel (R3) y la coma decimal (R4).
- Implementer Opus, reviewer Opus: APPROVED en la 1ª revisión. R5–R7 pasan a 017c-4.

## HU-017c-4 — Informe antropométrico y su PDF (aprobada 2026-10-04, senkuch4n) · HU-017c cerrada
- Avisos agrupados en "Antes de enviar" con su acción, marca "Editado", jerarquía de acciones, confirmación de envío; PDF del informe con paleta fría y escala Inter (el PDF del plan no cambia). R5–R7 de la revisión de 017c-3.
- Reviewer: CHANGES_REQUESTED en la 1ª (R5 ocultaba un cálculo nuevo) → APPROVED en la ronda 2. HU-017c completa (4 entregas, PR #30 → #31 → #32 → #33).
- Pendiente del usuario: validar con la nutricionista las 3 tareas de D1.

## HU-017b-1 — Calendario y turno (aprobada 2026-10-04, senkuch4n)
- Barra propia con resumen en palabras, vista Día en el celular, `?fecha=` que abre el día (cierra Q7 de 017c), panel del turno en palabras ("Vino a la consulta"), cancelar con confirmación + Deshacer diferido (no encola durante el plazo) y aviso al cerrar, "Nuevo turno" eligiendo a la paciente y teléfono normalizado en core, "Registrar pago" desde el turno.
- Implementer Opus, reviewer Opus: APPROVED en la 1ª revisión. Bot apagado durante toda la entrega.

## HU-017b-2 — Disponibilidad y servicios (aprobada 2026-10-04, senkuch4n)
- Disponibilidad como lista por día con solo las reglas activas, editar horario, superposición bloqueada, excepciones en palabras con Deshacer; servicios con precio destacado, Activos/Pausados, "Lo ofrece el bot" con Deshacer, formulario por grupos y arreglo de z.coerce.boolean (no reactiva servicios pausados).
- Implementer Opus, reviewer Opus: APPROVED en la 1ª revisión. El reviewer encontró un bug del MVP (excepciones aplicadas el día anterior en el bot) → tarea directa, PR #35.

## HU-017b-3 — Mensajes, pagos y avisos (aprobada 2026-10-04, senkuch4n)
- Mensajes en tarjetas con "Ya respondí" + Deshacer; pagos por mes en la zona de la profesional con glosario y pago manual con monto precargado y turnos que vinieron; comunicado solo a personas (16), con vista previa + Deshacer diferido; cola en palabras con error simple. R4–R6 de 017b-2.
- Reviewer: CHANGES_REQUESTED en la 1ª (doble clic en "Ya respondí" se escapaba al Deshacer) → APPROVED en la ronda 2. Ningún mensaje real; OutboundMessage 12 antes y después.

## HU-017b-4 — Asistente y ajustes (aprobada 2026-10-05, senkuch4n) · HU-017b cerrada
- Ajustes en listas agrupadas con guardado por grupo y "Cambios sin guardar", zona horaria y moneda en listas, textos sin jerga con detalle técnico aparte; Asistente con sugerencias, composer y aviso de IA. Arregla del todo el error de hidratación del sidebar (id estable).
- Implementer Opus, reviewer Opus: APPROVED en la 1ª revisión. Ajustes de la profesional intactos byte a byte. HU-017b completa (PR #34 → #36 → #37 → #38).

## HU-017d-1 — Portal: acceso, inicio y evolución (aprobada 2026-10-05, senkuch4n)
- Link vencido propio, saludo grande, próximo turno destacado (y con seña pendiente), tarjetas tocables, conteo del diario, botón WhatsApp solo con teléfono real; evolución con peso y altura sin juicios de color, historial sin notas. Arregla el gráfico de peso con barras en 0 (animación en pestañas ocultas) y el título del portal.
- Implementer Opus, reviewer Opus: APPROVED en la 1ª revisión.

## HU-017d-2 — Portal: diario (aprobada 2026-10-05, senkuch4n)
- "Anotar comida" en un sheet arrastrable con foto achicada en el celular, lista por día, foto grande, borrar con Deshacer idempotente; los otros gráficos del panel tampoco animan (R1).
- Implementer Opus, reviewer Opus: APPROVED en la 1ª revisión.
