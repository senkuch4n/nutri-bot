# impl HU-025b1 · Agenda, pacientes, clínica y planes sobre el contexto del consultorio

- SDD: `Refactorizaciones/autenticacion-permisos-tenant.md`, sección 7.2, "Checklist 025b-1" (M0–M3, portal, probe), más 2, 4.3, 4.4, 4.5, 8 y 10.
- Rama: `feat/HU-025b1-agenda-clinica-planes` (worktree `Nutri-Bot-HU025b1`), encima de 025a-2 (`73de4b2`), sin tocar sus commits.
- Estado: **done**. Sin push ni PR. Sin migración (no se corrió `migrate dev`, `migrate reset` ni `db push`).

## Commits

| Commit | Qué |
|---|---|
| `97ac2ba` | M0 db: `domain/tenantScope.ts` (+ test), fachada `legacySchedulingScope.ts`, exports en `domain/index.ts` y `package.json` (`./domain/tenantAccess`, `./domain/tenantScope`). |
| `f33fa41` | M0 bot: `apps/bot/src/tenant.ts` (`getConversationTenant`). |
| `1cbb277` | M1 agenda: `appointments`, `availability`, `reminders` con `t`; web (calendario, turnos, disponibilidad, servicios, acciones de turno, `/api/appointments`, `/api/slots`, `lib/services.ts`); bot (`conversation`, `booking`, `workers`). |
| `7993458` | M2 pacientes y clínica: `patients`, `clinical`, `consultations`, `isak`, `prescriptions`, `anthropometricReports`, `diary`; web (directorio, ficha, consulta, ISAK, informe + PDF, prescripción, foto de diario del panel, `consultation-guard`, `anthropometric-report`); portal (diario); bot (`findOrCreatePatientByJid`, `findPatientByJidOrThrow`). |
| `9d9062e` | M3 planes: `nutritionPlans`, `weeklyMenu`, `planSections`, `recipes.listPlanRecipePreviews`, `planTemplates.applyTemplateToPatient`; web (planes, IA de planes, menú semanal, textos del plan, stepper de medida, buscador de recetas, `revalidate-menu-owner`); portal (plan activo y recetas). |
| `51070ac` | Scripts CLI de `packages/db/scripts` y simulaciones del bot pasan `LEGACY_TENANT_ID` explícito. |
| `b58e8e3` | Probe `test-tenant-isolation.sh` + `tenant-isolation.integration.ts`; `tsconfig` de db los incluye. |

126 archivos, +3183 / −1227 (incluye tests).

## Archivos tocados (resumen por workspace)

**packages/db**
- Nuevos: `domain/tenantScope.ts`, `domain/tenantScope.test.ts`, `domain/clinical-tenant.test.ts`, `domain/plans-tenant.test.ts`, `scripts/test-tenant-isolation.sh`, `scripts/tenant-isolation.integration.ts`.
- Dominio: `legacySchedulingScope.ts`, `index.ts`, `appointments.ts`, `availability.ts`, `reminders.ts`, `conversationState.ts`, `botAi.ts` (solo el llamado a slots), `patients.ts`, `clinical.ts`, `consultations.ts`, `isak.ts`, `prescriptions.ts`, `anthropometricReports.ts`, `diary.ts`, `nutritionPlans.ts`, `weeklyMenu.ts`, `planSections.ts`, `planTemplates.ts`, `recipes.ts`.
- Tests adaptados: `appointments(-booking)`, `availability`, `reminders`, `patients`, `clinical`, `clinical-consultations`, `consultations`, `isak`, `prescriptions`, `nutritionPlans`, `weeklyMenu`, `planSections`, `planTemplates`, `recipes`, `botAi`.
- `package.json` (exports), `tsconfig.json` (incluye el probe), scripts de prueba en `scripts/` (firmas nuevas + `LEGACY_TENANT_ID`).

**apps/bot**: `src/tenant.ts` (nuevo), `src/conversation.ts`, `src/booking.ts`, `src/workers.ts`; tests `workers`, `conversation-attendance`, `conversation-booking`; scripts `test-confirm-attendance`, `test-service-reminders`, `test-booking-reason`, `test-report-outbox`.

**apps/web**: `app/(panel)/actions.ts`, `(calendario)/page.tsx`, `turnos/{page,data}.ts(x)`, `disponibilidad/{page,actions}`, `servicios/{page,actions}`, `resumen/page.tsx` (solo llamados que rompían), `pacientes/actions.ts`, `pacientes/(directorio)/page.tsx`, `pacientes/[id]/{patient-record,clinical-actions,consultation-actions,isak-actions,prescription-actions,report-actions}`, `pacientes/[id]/consultas/[consultationId]/{page,antropometria/page,antropometria/informe/page,antropometria/informe/pdf/route}`, `pacientes/[id]/planes/{actions,[planId]/actions,[planId]/ai-actions,[planId]/plan-detail}`, `weekly-menu-actions.ts`, `plan-section-actions.ts`, `recipe-picker-actions.ts`, `food-measure-actions.ts` (stepper de plan), `api/appointments/route.ts`, `api/slots/route.ts` (+ test nuevo), `api/diary/[entryId]/photo/route.ts` (+ test nuevo), `informe/pdf/route.test.ts` (nuevo), `lib/{services,consultation-guard,anthropometric-report,revalidate-menu-owner,assistant-tools}.ts`, `(portal)/portal/{diario/actions,plan/page}`; tests adaptados de esas acciones/páginas y `lib/food-policy.test.ts`.

## Contrato compartido (4.3 / 4.4): confirmación

- `tenantScope.ts` exporta exactamente `TenantRef`, `TenantScope`, `SchedulingContext`, `resolveTenantSchedulingContext(db, tenantId)`, `resolveTenantDigestContext`, `resolveTenantCalendarContext` (con `agendaOwner`), `getTenantProfessional(tenantId, db?)`, `TenantProfessional`, `findTenantProfessionalSummary(tenantId)` (nunca tira) y `TenantScopeError("tenant_scope_missing")`. Agregados internos: `ScopeClient`, `DigestContext`, `CalendarContext`, `resolvePrimaryAgenda` y `lockTenantScheduling` (ver desvíos).
- Todas las funciones de la tabla 4.4 de M1–M3 tienen `t: TenantRef` como **primer parámetro posicional**: `createAppointment`, `updateAppointmentReason`, `rescheduleAppointment`, `cancelAppointment`, `setAppointmentStatus`, `respondToAppointmentAttendance`; `getAvailableSlotsForService`, `getRescheduleSlots`, `checkSlotAvailable`; `enqueueReminderNow`, `getAppointmentReminderStatus`, `enqueuePrepInstructions`, `enqueueServiceReminders`; `findOrCreatePatient`, `findOrCreatePatientByJid`, `findPatientByJidOrThrow` (renombrada desde `findLegacyPatientByJidOrThrow`), `updatePatientFormulaData`, `archivePatient`, `unarchivePatient` (se eliminó `getLegacySchedulingTenantId`); las 8 de `clinical`, las 9 de `consultations` (`findOrCreateConsultationForDay` recibe `SchedulingContext`), las 5 de `isak`, `prescriptions`, `anthropometricReports`, `diary` y las 15 de `nutritionPlans`; `listPlanRecipePreviews(t, planId)`.
- `weeklyMenu`/`planSections`: el `tenantId` final de HU-024 se respeta en posición y es **obligatorio para `kind: "plan"`** (ver desvíos). `applyTemplateToPatient(templateId, patientId, tenantId)` sin la sobrecarga sin tenant.
- El `TenantContext` de la web se pasa tal cual (cumple `TenantRef` y `TenantScope` estructuralmente). El bot pasa `await getConversationTenant()`.

## Decisiones no obvias

1. **Lock de agenda por tenant.** Los `SELECT id FROM "Professional" WHERE id = 1 FOR UPDATE` (reservar, reprogramar, archivar, pedir confirmación) pasan a `lockTenantScheduling(tx, tenantId)`: bloquea la profesional de la agenda principal del tenant (`JOIN "Agenda" … FOR UPDATE OF p`). Para el consultorio original es la misma fila Professional(1), así que la serialización de HU-019/022 no cambia.
2. **Fachada legacy más estricta que el genérico.** `resolveLegacy*Scope` sigue con `agenda.findUnique` por la clave compuesta `legacy-agenda` + `isPrimary` + `professionalId: 1` (la verificación de HU-024) y devuelve los tipos `SchedulingContext`/`DigestContext`/`CalendarContext`. El genérico usa `agenda.findFirst({ tenantId, isPrimary: true })`. Mantenerla así evita que los módulos de 025b-2 (pagos, consultas, gcal, etc.) cambien de comportamiento antes de tiempo.
3. **`bindAppointmentConversationState(tx, tenantId)`** se agregó en `conversationState.ts` (el binding legacy queda como envoltorio) porque turnos y recordatorios necesitan limpiar la conversación del tenant del turno. **`listPatientLastContacts(t, jids)`** (M5 en la SDD) se adelantó porque el directorio de pacientes (M2) lo usa; `listLegacyPatientLastContacts` delega en él.
4. **Fallo cerrado de planes sin tenant.** En `weeklyMenu.ts` un plan sin `tenantId` tira `MealOwnershipError` (`planTenant`), y en `planSections.ts` tira `PlanSectionNotFoundError`. Con tenant, el filtro es `plan: { tenantId }`. Las plantillas conservan el camino sin tenant de HU-024 (se cierra en M10/025b-2), por eso el parámetro sigue `tenantId?` en la firma y el chequeo es en runtime. Todos los llamados de plan en web pasan ahora el tenant de `requireTenantContext("write")`, y `copyDay` verifica además el plan del consultorio.
5. **Filtros nuevos donde antes no había ninguno** (P5): `getIsakStudy`/`updateIsakStudy`/`deleteIsakStudy`/`getPreviousIsakStudy` (fila ISAK con `tenantId` y `patient.tenantId`), informe antropométrico (`tenantId` + `isakEntry` del tenant; guardar textos verifica antes el estudio), diario (`patient: { tenantId }`, alta con `connect` por `id_tenantId`), planes/comidas/ítems (`tenantId` + `patient.tenantId`; comidas e ítems vía `plan`). `enqueueAnthropometricReportMessage` y `enqueuePlanPdfMessage` escriben `tenantId` (la FK compuesta rechaza un informe o plan de otro consultorio).
6. **Server actions:** `requireTenantContext("read" | "write")` dentro del `try` existente, así un `TenantAccessError` sale con el error genérico de siempre. El `reauth: true` y el `router.replace("/inicio")` son M12 (025b-2) y no se agregaron. En las acciones con `belongsToPatient`, el patrón es `requireTenantContext("write").catch(() => null)` + `belongsToPatient(ctx, …)` para que cada export siga conteniendo `requireTenantContext(`, como pedirá `guard-coverage.test.ts`.
7. **Rutas API** (`/api/appointments`, `/api/slots`, `/api/diary/[entryId]/photo`, `…/informe/pdf`): `getTenantContext()`, con 401 si es `null` y `Cache-Control: no-store` (`private, no-store` en las binarias). Un recurso de otro consultorio da el mismo 404 que uno inexistente. `/api/appointments` usa `ctx.agendaId` directo.
8. **Portal:** los llamados que rompían con las firmas nuevas (diario: alta y baja; plan: recetas del plan activo) usan `{ tenantId: patient.tenantId }`, y un paciente con `tenantId` null queda sin acceso. Van en los commits de M2 y M3 porque esos commits no compilaban sin ellos. El token y el resto de las consultas del portal siguen igual hasta 025c. No hubo commit "Portal" aparte porque no quedó ningún cambio pendiente.
9. **Llamados fuera de M1–M3 que rompían y se ajustaron al mínimo:** `resumen/page.tsx` (`listServices`/`loadTurnos` con `ctx`), `lib/assistant-tools.ts` (`getLatestFormulaMeasurements({ tenantId: LEGACY_TENANT_ID }, …)`, con comentario: M8 pasa el `ctx`) y `botAi.ts` (slots con `LEGACY_TENANT_ID`; 025c pasa el tenant de la conversación). Con el candado `ENABLED_TENANT_IDS` es equivalente a hoy.
10. **`getProfessional()` / `where: { id: 1 }`:** en los archivos que tocó esta entrega se reemplazaron por `getTenantProfessional(ctx.tenantId)`. El logo del PDF del plan sale de la profesional del tenant (`id_tenantId`). `lib/professional-pdf.ts` (`getProfessionalPdfAssets`) queda para M6 porque su función de dominio es de 025b-2.
11. **`findOrCreatePatient(A, teléfono de B)`** crea un paciente propio de A. Desde `jid_scope_contraction` no hay unicidad global de JID, así que no es una fuga y no toca a B. El probe lo verifica.

## Desvíos de la SDD

- **`weeklyMenu`/`planSections`:** el tenant sigue siendo el último parámetro (como en HU-024) y es obligatorio en runtime para planes, no por tipo (decisión 4). Hacerlo obligatorio por tipo también para plantillas habría cambiado M10 antes de tiempo y reescrito unos 70 tests de plantillas.
- **`addTemplateMeal`/`addTemplateMealItem`** no cambiaron (M10).
- **`lockTenantScheduling` y `bindAppointmentConversationState`** son agregados, no están en 4.3/4.4.
- **`listPatientLastContacts(t, jids)`** adelantado de M5.
- **`lib/professional-pdf.ts`** (listado en M3 web) no se tocó: depende de `getProfessionalPdfAssets(t)` de M6.
- **El probe no incluye pago ni consulta de `/mensajes`** (son M4/M5, 025b-2). Cubre M0–M3 con fixtures de agenda, paciente, servicio, turno, ficha, consulta, medición, ISAK, informe, plan con comida, ítems (texto, receta, medida), texto del plan, receta, diario, plantilla y conversación.

## Verificación (desde el worktree)

```
npm run db:generate                               → OK
npm run typecheck --workspace apps/web            → OK (0 errores)
npm run typecheck --workspace apps/bot            → OK
npm run typecheck                                 → OK (core, db, bot, web)
npm run test                                      → Test Files 216 passed | 1 skipped (217); Tests 3482 passed | 1 skipped
bash packages/db/scripts/test-tenant-access.sh    → 4/4 pasos, 12/12 tests, "test-tenant-access: OK"
bash packages/db/scripts/test-tenant-isolation.sh → migraciones desde cero + 13 tests / 9 suites, 0 fallas, "test-tenant-isolation: OK"
npm run test:confirm-flow --workspace apps/bot    → 8/8 escenarios OK
npm run test:service-reminders --workspace apps/bot → 17 OK, 0 con error
npm run test:booking-reason --workspace apps/bot  → 17/17 escenarios OK
npm run test:report-outbox --workspace apps/bot   → OK (transacción revertida, sin filas)
npm run test:bot-ai --workspace apps/bot          → 18/18 escenarios OK (sin proveedor real)
./ops/harness/verify.sh                           → "Arnés OK" (backlog válido; typecheck salteado: todo commiteado, ya corrido arriba)
grep resolveLegacy|legacySchedulingScope apps/web/src (sin tests) → solo auth.ts (calendario, HU-028) y avisos/* (M5, 025b-2)
```

Los scripts de `packages/db/scripts` y `apps/bot/scripts` (no los cubre el `tsconfig` de sus workspaces) se chequearon con un `tsconfig` temporal que incluía `scripts/**`: 0 errores. El temporal se borró.

`prisma migrate status` (solo lectura) contra la base de desarrollo: 40 migraciones, "Database schema is up to date!".

**Probe de aislamiento:** cada función de dominio de M1–M3 se llama con `{ tenantId: A }` e ids de B. Las lecturas se comparan con un id inexistente (mismo valor, o las dos fallan). Las escrituras tienen que fallar o devolver "no encontrado", 0 o `null`, y la foto (`jsonb_agg` de 22 tablas) tiene que ser idéntica antes y después de cada intento. Hay controles positivos para A, listados de A que solo traen filas de A, y un caso de plan sin tenant rechazado. Los `prisma:error` del log son los errores esperados de los intentos cruzados.

**Datos de desarrollo y WhatsApp:** las simulaciones del bot crean sus propios datos "(TEST)" y los borran por id. `test-report-outbox` corre dentro de una transacción revertida. Ninguna verificación mandó WhatsApp ni arrancó el bot real. Los probes corren solo en Postgres descartable (red y contenedor propios, tmpfs, `127.0.0.1` aleatorio, sin `.env`, sin `--pull`).

## Notas para el reviewer y para 025b-2

- **025a-2 (`tenant-context.ts`):** no se encontró ningún problema en `getTenantContext`, `requireTenantContext` ni el middleware. Una observación: `getTenantAccess` resuelve la agenda principal con `prisma.agenda.findFirst({ tenantId, isPrimary })` por su cuenta. Podría usar `resolveTenantSchedulingContext` ahora que existe, pero no se tocó.
- Las server actions sin `try` previo (`deletePlanAction`, `addPlanMealAction`, `listAppointmentPatientsAction`, etc.) tiran `TenantAccessError` sin contexto. Hasta M12 no hay `reauth`.
- Quedan para 025b-2: M4–M12, `guard-coverage.test.ts`, el `reauth` de `useActionToast` y extender el probe a M4–M8.
