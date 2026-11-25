# Review — HU-025b1 (entrega 025b-1: agenda, pacientes, clínica y planes sobre el contexto del consultorio)

**Veredicto:** APPROVED

Revisado contra `Refactorizaciones/autenticacion-permisos-tenant.md` (7.2 "Checklist 025b-1", y 2, 4.3, 4.4, 4.5, 8 y 10),
la sección 9 de `docs/hu-autenticacion-permisos-tenant.md` y C1–C7. El diff es `git diff origin/develop..HEAD`: 7 commits
y 126 archivos en `feat/HU-025b1-agenda-clinica-planes`.

## Verificación propia (corrida desde el worktree)

| Comando | Resultado |
|---|---|
| `npm run typecheck` (core, db, bot, web) | OK, exit 0, sin errores TS |
| `npm run test` | 216 archivos pasan y 1 se saltea; 3482 tests pasan y 1 se saltea |
| `bash packages/db/scripts/test-tenant-isolation.sh` | migraciones desde cero; 13 tests en 9 suites, 0 fallas, "test-tenant-isolation: OK" |
| `bash packages/db/scripts/test-tenant-access.sh` | 12/12, "test-tenant-access: OK" |
| `npm run test:confirm-flow --workspace apps/bot` | 8/8 escenarios OK, sin WhatsApp |
| `./ops/harness/verify.sh` | "Arnés OK", exit 0 |
| Conteo de filas en la base de desarrollo antes y después de confirm-flow (solo SELECT, 7 tablas) | sin cambios: la simulación limpió lo suyo |
| `docker ps` con la label del probe al terminar | 0 contenedores |

## Checkpoints

### C1 — El arnés está sano
- [x] `backlog/` válido; una HU activa por responsable (verify.sh: "imleticio: HU-024; senkuch4n: HU-025").
- [x] `progress/current-senkuch4n.md` existe (verify.sh).
- [x] El diff toca solo `apps/` y `packages/`, ningún archivo de HU de Leo.
- [x] `./ops/harness/verify.sh` exit 0.

### C2 — Cadena de documentos
- [x] `docs/hu-autenticacion-permisos-tenant.md` con la sección 9 validada.
- [x] `Refactorizaciones/autenticacion-permisos-tenant.md` con workspaces, checklist 025b-1 y contrato (4.3/4.4).
- [x] Firmas contra el contrato:
  - `tenantScope.ts` exporta `TenantRef`, `TenantScope`, `SchedulingContext`, `resolveTenantSchedulingContext/Digest/Calendar`,
    `getTenantProfessional(tenantId, db?)`, `TenantProfessional`, `findTenantProfessionalSummary` (nunca tira) y
    `TenantScopeError("tenant_scope_missing")`.
  - Todas las funciones de la tabla 4.4 para M1–M3 reciben `t: TenantRef` como primer parámetro posicional (revisé el diff
    de appointments, availability, reminders, patients, clinical, consultations, isak, prescriptions, anthropometricReports,
    diary y nutritionPlans).
  - `findLegacyPatientByJidOrThrow` pasa a `findPatientByJidOrThrow` y se elimina `getLegacySchedulingTenantId`.
  - `applyTemplateToPatient` queda sin la sobrecarga sin tenant.
  - Desvíos aceptados, ver Dudas: `weeklyMenu`/`planSections` validan en runtime, y la fachada legacy no delega en el genérico.

### C3 — Arquitectura
- [x] Las operaciones de base siguen en `packages/db/domain`. Web y bot consumen las mismas funciones, sin duplicarlas.
- [x] Cambió `packages/db/domain`: web **y** bot compilan y se ajustaron todos los consumidores.
  - El bot pasa `await getConversationTenant()` en `conversation.ts`, `booking.ts` y `workers.ts`.
  - Los scripts de `packages/db/scripts` y `apps/bot/scripts` pasan `LEGACY_TENANT_ID`.
- [x] Migraciones: no hay. El diff no toca `schema.prisma` ni `migrations/`.
- [x] Rutas protegidas y aislamiento:
  - `/api/appointments`, `/api/slots`, `/api/diary/[entryId]/photo` y `…/informe/pdf` usan `getTenantContext()`. Sin
    contexto devuelven 401 con `no-store`. Un recurso ajeno da el mismo 404 que uno inexistente.
  - Las páginas usan `requirePageContext()`, y las server actions `requireTenantContext("read"|"write")`.
  - Portal: diario y plan usan `{ tenantId: patient.tenantId }` y rechazan un `tenantId` null. La única ruta que crea
    pacientes (`patients.ts` `upsertTenantPatient`) siempre escribe el `tenantId`, y HU-024 completó todos los pacientes
    con `legacy-tenant`, así que en producción no puede haber un paciente con tenant null. En la base de desarrollo hay
    0 de 21.
- [x] Bot: no hay mensajes nuevos ni cambios de flujo. El silencio fuera de sesión se mantiene (confirm-flow:
  "un mensaje común no dispara nada").
- [x] Sin `console.log` de debug ni TODOs en las líneas agregadas.

### C4 — La verificación es real
- [x] `npm run typecheck` limpio.
- [x] `npm run test` pasa. No hay lógica nueva en `packages/core` en esta entrega.
- [x] Bot simulado sin WhatsApp, y limpió por id (los conteos de la base no cambiaron).
- [x] PDF: no cambia la generación. El informe PDF y el del plan solo cambian de dónde leen la profesional y el logo. Cubierto
      por `informe/pdf/route.test.ts` y el probe (`getAnthropometricReportPdf`, `savePlanPdf`).

### C5 — Cierre
- [x] `progress/impl_HU-025b1.md` existe y describe lo tocado. Los hashes de commit del reporte son anteriores al rebase: no importa.
- [x] `progress/review_HU-025b1.md` (este archivo).
- [x] No quedan scripts sueltos ni datos de prueba: el worktree solo tiene `progress/impl_HU-025b1.md` sin trackear, y no
      quedaron contenedores.

## Puntos de atención pedidos

1. **Fugas entre consultorios.** Revisé uno por uno los `findUnique`/`update`/`delete` por id, los `include`, las
   relaciones anidadas y los `connect`/`create` en los módulos de M1–M3 y en sus consumidores web. Todos filtran por
   alguna de estas vías:
   - `tenantId` directo;
   - `id_tenantId`;
   - `patient: { tenantId }` para `DiaryEntry` y `ClinicalRecord`, que no tienen columna;
   - `plan: { tenantId, patient: { tenantId } }` para comidas, ítems y textos;
   - `ownedReportWhere` para el informe;
   - FK compuesta en `enqueue*Message`, que ahora escribe `tenantId`.

   Las consultas `prisma.*` directas de web también llevan tenant: `actions.ts`, `turnos/data.ts`, `disponibilidad/*`,
   `pacientes/*`, `patient-record.tsx` (incluso los `include` de turnos y mediciones), `plan-detail.tsx`,
   `[planId]/actions.ts` (el logo pasa de `id: 1` a `id_tenantId` de la profesional del tenant), `ai-actions.ts`,
   `revalidate-menu-owner.ts`, `consultation-guard.ts` y el portal.

   El probe confirma en Postgres real que un id de B se comporta como uno inexistente (lecturas) y que una escritura falla
   sin cambiar ninguna fila (escrituras).
2. **Contrato compartido.** `TenantRef` es obligatorio por tipo en toda la tabla 4.4 de M1–M3, salvo `weeklyMenu` y
   `planSections` (ver Dudas). Typecheck de web y bot OK. El bot sigue funcionando para el consultorio original:
   confirm-flow 8/8.
3. **Concurrencia.** `lockTenantScheduling` hace `JOIN "Agenda" … WHERE a."tenantId"=$1 AND a."isPrimary" FOR UPDATE OF p`.
   Para `legacy-tenant` bloquea la misma fila `Professional(1)`, porque la agenda principal legacy es de la profesional 1.
   El orden se mantiene en todos los casos:
   - `createAppointment`, `rescheduleAppointment` y `archivePatient`: lock y después la lectura de la agenda o del
     binding, en la misma transacción.
   - `enqueueServiceReminders` (confirmaciones de HU-022): lock con chequeo de resultado, después el binding y después
     la relectura.

   `respondToAppointmentAttendance`, `setAppointmentStatus` y `enqueueReminderNow` no tomaban el lock de `Professional`
   antes y siguen sin tomarlo (`enqueueReminderNow` sigue con su `FOR UPDATE` sobre el turno). La serialización de HU-019 y
   HU-022 para el consultorio original no cambia.
4. **Portal.** Ver C3. Un paciente con `tenantId` null no puede aparecer con los datos actuales.
5. **Probe.** `snapshot()` toma un `jsonb_agg` ordenado de 22 tablas antes y después de **cada** intento cruzado
   (`unchanged`/`rejectsUnchanged`/`sameAsMissing`). Cubre M0–M3 función por función, con controles positivos de lectura
   y listados de A. El Postgres es descartable (tmpfs, 127.0.0.1, password aleatoria, `--pull never`, regex de la URL,
   `trap`). Lo corrí yo: OK.
6. **Desvíos.** Los evalué uno por uno en Dudas. Ninguno bloquea.

## Cambios requeridos

Ninguno.

## Dudas (no bloqueantes)

- **Informes antropométricos con `tenantId` NULL creados después del deploy de HU-024.**
  - En `develop` y en `main`, `saveAnthropometricReportTexts` creaba el informe sin `tenantId` (`create: { isakEntryId, ...data }`).
  - Con `ownedReportWhere` (`packages/db/domain/anthropometricReports.ts:72-74`) esa fila quedaría:
    - invisible (`getAnthropometricReportMeta`/`getAnthropometricReportPdf` → null/404);
    - imposible de editar: el `upsert` (`:99-104`) no la encuentra, intenta crear y choca con `isakEntryId @unique` (P2002).
  - Hoy no tiene impacto: la base de desarrollo tiene 0 de 2 informes con tenant null, y D9(b) dice que en producción no
    hay pacientes.
  - **Antes de publicar 025b-1 a `main`:** correr en producción (solo lectura)
    `SELECT count(*) FROM "AnthropometricReport" WHERE "tenantId" IS NULL;`. Si da más de 0, completar el `tenantId`
    desde `EvolutionEntry` antes del deploy.
  - El mismo caso deja trabado en el outbox un `ANTHROPOMETRIC_REPORT_PDF` encolado sobre esos informes (`outboxOwnershipWhere`).
    Viene de HU-024.
- **El bot todavía resuelve el tenant fuera de `getConversationTenant()` en tres lugares**, sin cambios en este diff:
  `apps/bot/src/conversation.ts:626` (`depositUnavailable`, M4), `:736` (`handoffAlertTarget`, M5) y
  `apps/bot/src/workers.ts:43` (`tick` del outbox, M5). Hoy devuelven el mismo `legacy-tenant`. Conviene pasarlos a
  `getConversationTenant()` en 025b-2 (M4/M5) para que sea de verdad el único punto antes de HU-027.
- **`weeklyMenu` y `planSections`:** el tenant sigue como último parámetro opcional y es obligatorio para `kind: "plan"`
  solo en runtime (`planTenant` en `weeklyMenu.ts`, `sectionScope` en `planSections.ts`). Falla cerrado: el probe prueba
  `setMealMode` sin tenant. Todos los llamados web de plan pasan el tenant del contexto. Aceptable hasta M10; ahí conviene
  pasarlo a obligatorio por tipo.
- **Fachada legacy:** `resolveLegacy*Scope` conserva su propia consulta (`findUnique` por `legacy-agenda` + `isPrimary` +
  `professionalId: 1`) en vez de delegar en `resolveTenant*Context(db, LEGACY_TENANT_ID)` como dice 4.3. Es igual de
  estricta o más y devuelve los tipos nuevos: sin efecto práctico.
- **`listPatientLastContacts` adelantado de M5:** justificado, porque el directorio de M2 lo usa. `listLegacyPatientLastContacts` delega en él.
- **`lib/professional-pdf.ts` sin tocar:** el branding del PDF del informe (`report-actions.ts` → `loadProfessionalPdfBranding()`)
  sigue leyendo la profesional legacy. Con el candado `ENABLED_TENANT_IDS` es la misma. M6 (025b-2) tiene que cerrarlo
  antes de quitar el candado.
- **Fuera de M1–M3 con el tenant legacy fijo**, sin fuga mientras esté el candado: `lib/assistant-tools.ts`
  (`getLatestFormulaMeasurements({ tenantId: LEGACY_TENANT_ID }, …)`, M8) y `botAi.ts` (slots con `LEGACY_TENANT_ID`, 025c).
- **Medidas caseras:** `resolveFormMeasure` → `resolveMeasureItem(foodId, measureId)` (`packages/db/domain/foodMeasures.ts:200`)
  todavía busca la medida por id sin tenant: podría copiar al plan el nombre y los gramos de una medida propia de otro
  consultorio. Está listado en M7 (025b-2).
- **Server actions sin `try` que tiran `TenantAccessError`:** `deletePlanAction`, `addPlanMealAction`,
  `deletePlanMealAction`, `addPlanMealItemAction`, `deletePlanMealItemAction`, `listAppointmentPatientsAction` y
  `createPlanForConsultationAction` vía `createPlanForConsultation`. Sin contexto terminan en el error boundary en lugar del
  error genérico. Solo pasa con una membresía revocada a mitad de la sesión, el middleware ya la frena en la navegación y
  M12 agrega `reauth`. No bloquea. El patrón `requireTenantContext(...).catch(() => null)` también traga errores de base
  como "Datos inválidos": aceptable.
- **Probe sin pagos ni `/mensajes`:** es lo esperado, porque son M4/M5 y el checklist de 025b-2 lo extiende.
- **El probe no tiene controles positivos de escritura para A:** solo de lectura. Una escritura que fallara siempre pasaría
  como "rechazo". Lo cubren los tests con mocks (que inspeccionan los `where`) y confirm-flow para el consultorio original.
  Conviene sumar 2 o 3 escrituras propias de A en la extensión de 025b-2.
