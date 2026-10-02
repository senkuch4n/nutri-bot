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
