# SDD HU-025 · Autenticación, permisos y aislamiento entre consultorios

- HU validada: [`docs/hu-autenticacion-permisos-tenant.md`](../docs/hu-autenticacion-permisos-tenant.md) (mandan las
  resoluciones de la sección 9). Issue [#68](https://github.com/senkuch4n/nutri-bot/issues/68), label `migración`.
- Responsable: `senkuch4n`. Rama base: `feat/HU-025-autenticacion-permisos-tenant` (desde `develop`, con HU-024 mergeada).
  Cada entrega sale en su propia rama `feat/HU-025a-…`, `feat/HU-025b1-…`, etc. desde `develop` actualizado y vuelve por PR.
- Base previa obligatoria: HU-024 ([SDD](modelo-multi-tenant.md), migraciones `20261120*`).
- Skills aplicados a la planificación: `migracion-prisma`, `refactor`, `ui`.
- Las decisiones que el usuario tiene que confirmar están marcadas **[CONFIRMAR Cn]** (sección 11). Todas tienen un
  default seguro, así que no bloquean el arranque de 025a.

---

## 0. Resumen funcional

HU-025 cambia la pregunta del panel de "¿tu email está en `ALLOWED_EMAILS`?" a "¿qué consultorio te corresponde según
tu identidad de Google verificada y tu membresía, leída en la base en cada request?". Un login con Google sin
membresía queda registrado como identidad *pendiente* (un `User` con `sub` y email verificados, sin acceso) para que el
operador le otorgue la membresía por email con un script. Todo el panel, las rutas API, los PDF, las descargas, el
asistente y la IA de planes pasan a recibir el consultorio desde un contexto de servidor (`getTenantContext()`), nunca
desde el cliente, y dejan de usar el adaptador legacy y `Professional(1)`. El portal del paciente pasa a un token y
una cookie atados a paciente + consultorio (un paciente archivado sigue entrando). La IA del bot arma su contexto con
el consultorio de la conversación. Se agrega un acceso de plataforma de Arzium separado de `TenantRole`, otorgado solo
por script, con permisos de soporte temporales sobre un consultorio, auditoría append-only y una franja visible de
"modo soporte". Daiana queda `OWNER` de `legacy-tenant`; Joel entra solo como soporte. La entrega va en cuatro cortes
(025a → 025b → 025c → 025d) y cada uno deja `develop` deployable sin ventana de mantenimiento.

---

## 1. Diagnóstico (estado actual, skill `refactor`)

| # | Problema | Dónde | Consecuencia con un segundo consultorio |
|---|---|---|---|
| P1 | La única barrera del panel es `ALLOWED_EMAILS` (`authorized` del middleware y `signIn`). | `apps/web/src/auth.config.ts` | Una cuenta de otro consultorio no entra; si se la agrega a la lista, ve todo lo del original. |
| P2 | `(panel)/layout.tsx` solo exige `session.user`. Ninguna server action ni ruta API (salvo recetas y plantillas) mira la membresía. | panel, `app/api/*` | Revocar una membresía no corta nada. |
| P3 | `resolveLegacySchedulingScope()` fija `legacy-tenant`/`legacy-agenda` dentro de ~22 funciones de `packages/db/domain` (sin parámetro). | `legacySchedulingScope.ts` y sus consumidores | Cualquier sesión opera el consultorio original. |
| P4 | `getProfessional()` y `professionalAssets.ts` leen `Professional` `id: 1`. `shell.ts`, `ajustes/page.tsx`, `ajustes/whatsapp/page.tsx` y `ajustes/actions.ts` consultan `id: 1` directo, también `BotStatus` `id: 1`. | `availability.ts`, `professionalAssets.ts`, `apps/web/src/lib/shell.ts`, `ajustes/*` | Nombre, firma, logo, ajustes, QR de WhatsApp y estado del bot son siempre los del original. **El QR de WhatsApp de otra sesión sería un secuestro del número.** |
| P5 | Funciones de dominio sin ningún filtro de dueño: `getPlan`, `updatePlan`, `deletePlan`, `addMeal`/`updateMeal`/`deleteMeal`/`addMealItem`/…, `listPatientPlans`, `listDiaryEntries`/`deleteDiaryEntry`, `getIsakStudy`/`updateIsakStudy`/`deleteIsakStudy`, `listPendingPayments`, `listApprovedPaymentsInRange`, `registerManualPayment`, `listInquiries`, `countInquiries*`, `markInquiryAnswered`, `getAnthropometricReport*`, `listFoods`/`getFood`, `listServices` (web). | `packages/db/domain/*`, `apps/web/src/lib/services.ts` | Un id adivinado de otro consultorio se lee o se escribe. |
| P6 | Consultas `prisma.*` directas en páginas y acciones sin tenant (p. ej. `assistant-tools.ts`: `patient.findMany({ take: 300 })`; `api/diary/[entryId]/photo` por id solo). | ~20 archivos de `apps/web/src` | El asistente manda a DeepSeek pacientes de otro consultorio. |
| P7 | El token del portal es `patientId.exp.firma`: no lleva tenant y `getPortalPatient()` busca por id sin condición. Descargas del portal por id de entrada sin tenant. | `packages/db/domain/patientAuth.ts`, `apps/web/src/lib/patient-session.ts`, `(portal)/*` | Una sesión de portal no está atada a un consultorio. |
| P8 | La IA del bot (`runBotAiTool`) lee `activeServices()` y turnos **sin tenant** y `getProfessional()` (`id: 1`). | `packages/db/domain/botAi.ts`, `apps/bot/src/conversation.ts`, `booking.ts` | Precios y servicios de otro consultorio en la respuesta del bot. |
| P9 | El callback OAuth de Mercado Pago vuelve a chequear `allowedEmails`. | `api/mercadopago/oauth/callback/route.ts` | Se rompe al retirar la lista. |
| P10 | No hay rol de plataforma ni auditoría; Joel entra como un usuario más. | — | Acceso de soporte invisible para la profesional. |
| P11 | La base de desarrollo de Joel **no tiene aplicadas las 12 migraciones `20261120*` de HU-024** (verificado en solo lectura: `_prisma_migrations` termina en `20261113020849_mercadopago_oauth`, no existe la tabla `Tenant`). | Postgres local (`localhost:5433/nutribot`) | Ver prerrequisito en 2.1. |
| P12 | Los scripts `test-*.sh` de HU-024 tienen el socket de Docker de Leo fijo (`unix:///Users/leonel/.docker/run/docker.sock`). | `packages/db/scripts/test-*.sh` | No corren en la máquina de Joel sin `DOCKER_HOST`. Los scripts nuevos usan el contexto de Docker del entorno. |

---

## 2. Reglas para el implementer (todas las entregas)

Copiar este bloque en el prompt de cada `implementer`:

- **Datos de la base de desarrollo:** no borrar ni modificar datos de negocio preexistentes. Cada prueba que escribe
  limpia **solo por los ids que ella insertó**; nada de `deleteMany` con filtros amplios. Cuando se pueda, la prueba va
  dentro de un `prisma.$transaction` que termina tirando un error a propósito. No correr `db:seed`/`seed:demo`.
- **WhatsApp:** ninguna verificación manda mensajes a números reales. Para el bot, solo scripts de simulación
  (`npm run test:confirm-flow --workspace apps/bot` y similares) que crean y borran sus datos por id y borran por id las
  filas de `OutboundMessage` que encolen antes de que un bot en marcha las despache. No levantar el bot con la sesión
  real.
- **Migraciones:** `pg_dump` de la base de desarrollo **fuera del repo** antes de aplicar cualquier migración. Crear con
  `npx dotenv -e ../../.env -- prisma migrate dev --create-only --name <nombre>` desde `packages/db`, revisar el SQL,
  recién después aplicar. Prohibido: `migrate reset`, aceptar el reset que ofrece `migrate dev` por drift, `db push`,
  pasar `DATABASE_URL` como `--shadow-database-url`, `migrate diff --from-migrations` contra la base de desarrollo,
  editar migraciones ya aplicadas (incluidas las `20261120*`). Si hay drift: `blocked` con la salida de
  `prisma migrate status`. Después de tocar el schema: `npm run db:generate`, typecheck en `apps/web` **y** `apps/bot`.
- **Objetos SQL que Prisma no modela (HU-024), no tocarlos ni recrearlos:** vista, fila de serialización, función y
  triggers de `20261120121300_recipe_reference_ownership` y el esquema `recipe_reference_guard`; índices parciales de
  JID de `20261120121600_jid_scope_contraction`; índice parcial `Agenda_primary_per_tenant_key`; FKs compuestas con
  `SET NULL` por columna de `OutboundMessage`. Si `migrate dev --create-only` genera SQL que los borra o recrea, es
  drift: parar.
- **Un commit por tarea** del checklist (o por grupo atómico marcado), `git add` solo los archivos de la tarea, trailer
  `Co-Authored-By`. Nunca commit directo a `develop`/`main`.
- **Logs (D11):** en las piezas que toca esta HU, los logs registran un código (`[auth] access_denied reason=no_membership`)
  y, como mucho, ids opacos (`userId`, `tenantId`). Nunca email, `sub`, tokens del portal, refresh tokens, `code` de OAuth,
  contenido clínico ni el cuerpo del pedido.
- **Ids ajenos = inexistentes:** toda lectura con id que no sea del tenant del contexto devuelve lo mismo que un id
  inexistente (`notFound()`, 404, `null`, o el error genérico de la acción). Ningún mensaje distingue "existe en otro
  consultorio".
- **El tenant nunca viene del cliente:** ninguna función lee `tenantId`, `agendaId` ni `professionalId` de query, body,
  header, cookie o `FormData`. Si un formulario los manda, se ignoran.

### 2.1 Prerrequisito de la base de desarrollo (antes del primer paso de 025a)

1. `cd packages/db && npx dotenv -e ../../.env -- prisma migrate status` → tiene que listar como pendientes **solo**
   las 12 migraciones `20261120*` y no reportar drift. Si reporta otra cosa: `blocked`.
2. `pg_dump -Fc` de la base a un archivo fuera del repo (p. ej. `~/backups/nutribot-dev-<fecha>.dump`).
3. `npx dotenv -e ../../.env -- prisma migrate deploy` (aplica solo las pendientes; nunca resetea).
4. Si alguna falla (p. ej. la auditoría de recetas con `23514`): `blocked` con el mensaje, sin corregir datos.

---

## 3. Workspaces afectados

| Workspace | ¿Se toca? | Entregas | Qué |
|---|---|---|---|
| `packages/core` | **sí** | 025a, 025b, 025d | Lógica pura de decisión de acceso, normalización de email, reglas de Equipo, ventana de soporte, clasificación de requests, textos de acceso/Equipo/soporte. Tests vitest. |
| `packages/db` | **sí** | 025a, 025b, 025c, 025d | Schema + 2 migraciones; `domain/tenantAccess.ts`, `domain/tenantScope.ts`; firmas de dominio con tenant explícito; token del portal; script `tenant-access.ts`; probes en Postgres descartable. |
| `apps/web` | **sí** | todas | Auth.js, middleware, `getTenantContext()`, `/inicio`, todo el panel y las API, Equipo, portal, franja de soporte. |
| `apps/bot` | **sí** | 025b (mecánico), 025c | Pasar el tenant de la conversación a las funciones de dominio, token del portal nuevo, IA del bot, `BotStatus.tenantId`. Sin mensajes nuevos. |

---

## 4. Contrato compartido

Todas las firmas son exactas. "Consume" indica quién llama. Toda función que cambie firma obliga a typecheck en web
**y** bot.

### 4.1 `packages/core/src/tenant-access.ts` (nuevo, puro; 025a; ampliado en 025d)

```ts
export type MembershipRole = "OWNER" | "STAFF";
export type SupportMode = "READ_ONLY" | "READ_WRITE";

/** Hechos leídos de la base para un User; null = el User no existe. */
export type AccessFacts = {
  linked: boolean;                                   // User.googleSubject no nulo
  memberships: { tenantId: string; role: MembershipRole }[]; // como mucho 2 (take: 2)
  platformOperator: boolean;                         // 025a: siempre false
  activeSupportGrants: { id: string; tenantId: string; mode: SupportMode; expiresAt: Date }[]; // 025a: siempre []
};

export type AccessDenial =
  | "unlinked"                 // sin User o sin googleSubject
  | "no_membership"            // identidad pendiente
  | "multiple_memberships"     // D7
  | "tenant_not_enabled"       // candado transitorio: tenant fuera de enabledTenantIds
  | "support_no_grant"         // operador de plataforma sin permiso vigente
  | "support_multiple_grants"; // defensa: el script impide >1 vigente

export type AccessGrant =
  | { kind: "member"; tenantId: string; role: MembershipRole }
  | { kind: "support"; tenantId: string; grantId: string; mode: SupportMode; expiresAt: Date };

export type AccessDecision = { ok: true; grant: AccessGrant } | { ok: false; reason: AccessDenial };

/** Precedencia: con ≥1 membresía manda la membresía (un permiso de soporte no se suma).
 *  Sin membresía y operador activo: exactamente un permiso vigente. */
export function decideTenantAccess(
  facts: AccessFacts | null,
  opts?: { enabledTenantIds?: readonly string[] },
): AccessDecision;

/** trim + toLowerCase. Misma regla que legacy-memberships.ts (HU-024). */
export function canonicalEmail(email: string): string;

/** 025a: ¿la request modifica algo? Server action (header next-action), método distinto de GET/HEAD,
 *  o una ruta GET que escribe (lista cerrada: "/api/mercadopago/oauth/callback"). */
export function isMutatingPanelRequest(r: { method: string; pathname: string; isServerAction: boolean }): boolean;

/** 025b: reglas de "Quitar acceso" (sección 7.2.1). */
export type RemoveMemberCheck = { ok: true } | { ok: false; reason: "not_owner" | "self" | "last_owner" | "not_member" };
export function canRemoveMember(p: {
  actor: { userId: string; role: MembershipRole | null };      // null = soporte
  target: { userId: string; role: MembershipRole } | null;     // null = no es miembro de este tenant
  ownerCount: number;                                          // OWNER actuales del tenant
}): RemoveMemberCheck;

/** 025d: ventana del permiso de soporte. Default 24 h, máx. 168 h (7 días) [CONFIRMAR C1]. */
export const SUPPORT_GRANT_DEFAULT_HOURS = 24;
export const SUPPORT_GRANT_MAX_HOURS = 168;
export function supportGrantWindow(p: { now: Date; hours: number }):
  { ok: true; startsAt: Date; expiresAt: Date } | { ok: false; reason: "invalid_hours" };

/** 025d: pathname sin query ni fragmento, máx. 300 caracteres. Nunca guarda la query (puede traer token/code). */
export function auditPath(pathnameOrUrl: string): string;

/** 025d: secciones vedadas en modo soporte aunque sea READ_WRITE [CONFIRMAR C2]. */
export const SUPPORT_BLOCKED_PATH_PREFIXES: readonly string[]; // ["/ajustes/whatsapp", "/api/professional/signature", "/api/mercadopago/oauth"]
```

Textos (mismo archivo o `packages/core/src/access-text.ts`, exportado en `index.ts`), ver sección 9.

### 4.2 `packages/db/domain/tenantAccess.ts` (nuevo; 025a; ampliado en 025d)

```ts
export const LEGACY_TENANT_ID = "legacy-tenant";

export type GoogleIdentity = { subject: string; email: string }; // email ya verificado por Google
export type IdentityRegistration = { status: "linked"; userId: string } | { status: "conflict" };

/** Login con Google verificado. Ver tabla de 6.2. Actualiza lastSignInAt. Nunca reasigna sub ni email.
 *  Consume: web (auth.ts, callback jwt). */
export function registerGoogleIdentity(identity: GoogleIdentity, now?: Date, db?: PrismaClientLike): Promise<IdentityRegistration>;

/** Lee los hechos para decideTenantAccess. memberships take 2; grants vigentes (startsAt<=now<expiresAt, revokedAt null) take 2.
 *  Consume: web (middleware, tenant-context, auth.ts). */
export function loadAccessFacts(userId: string, now: Date, db?: PrismaClientLike): Promise<AccessFacts | null>;

/** Equipo (025b). Consume: web. */
export function listTenantMembers(tenantId: string): Promise<{ userId: string; email: string; role: "OWNER" | "STAFF"; createdAt: Date }[]>;
export function removeTenantMember(p: { tenantId: string; actorUserId: string; targetUserId: string }):
  Promise<{ ok: true } | { ok: false; reason: "not_owner" | "self" | "last_owner" | "not_member" }>;

/** 025d. Consume: web (middleware). Inserta una fila; nunca tira hacia el request (captura y loguea código). */
export function recordSupportRequest(p: {
  actorUserId: string; tenantId: string; grantId: string;
  kind: "PAGE" | "ACTION" | "API"; method: string; path: string; outcome: "ALLOWED" | "DENIED_READ_ONLY" | "DENIED_BLOCKED";
}): Promise<void>;
export function listActiveSupportGrants(tenantId: string, now: Date): Promise<{ expiresAt: Date; mode: "READ_ONLY" | "READ_WRITE" }[]>; // Equipo
```

`PrismaClientLike = Pick<Prisma.TransactionClient, "user" | "tenantMembership" | …>` según lo que use cada función
(mismo patrón que `ScopeClient` de `legacySchedulingScope.ts`).

### 4.3 `packages/db/domain/tenantScope.ts` (nuevo; 025b-1)

Generaliza `resolveOriginalAgenda` de `legacySchedulingScope.ts` a cualquier tenant.

```ts
export type TenantRef = { tenantId: string };          // lo que reciben las funciones de dominio
export type TenantScope = { tenantId: string; agendaId: string }; // misma forma que ORIGINAL_SCOPE de HU-024

export type SchedulingContext = { scope: TenantScope; professional: { timezone: string; phoneJid: string | null } };

/** Agenda principal del tenant (isPrimary, índice parcial único) + su profesional del mismo tenant (FK compuesta).
 *  Tira TenantScopeError("tenant_scope_missing") si no hay agenda principal. */
export function resolveTenantSchedulingContext(db: ScopeClient, tenantId: string): Promise<SchedulingContext>;
export function resolveTenantDigestContext(db: ScopeClient, tenantId: string): Promise<…>;   // + afterHours*
export function resolveTenantCalendarContext(db: ScopeClient, tenantId: string): Promise<…>; // + google*, agendaOwner

/** Reemplaza getProfessional(). PROFESSIONAL_SELECT de la profesional de la agenda principal. Consume: web y bot. */
export function getTenantProfessional(tenantId: string, db?: ScopeClient): Promise<TenantProfessional>;
export type TenantProfessional = Prisma.ProfessionalGetPayload<{ select: typeof PROFESSIONAL_SELECT }>;
/** Para el shell: nunca tira (null ante error). */
export function findTenantProfessionalSummary(tenantId: string): Promise<{ name: string; title: string | null; phoneJid: string | null; botPaused: boolean } | null>;
```

`legacySchedulingScope.ts` queda como fachada fina para el bot hasta HU-027:
`resolveLegacySchedulingScope(db) = resolveTenantSchedulingContext(db, LEGACY_TENANT_ID)` (y lo mismo para digest y
calendar), **conservando** la verificación extra de HU-024 (`id: "legacy-agenda"`, `professionalId: 1`) para el tenant
legacy. Ningún archivo de `apps/web` puede importarlo después de 025b (test de guarda, sección 10).

### 4.4 Convención de firmas de dominio (025b)

- **Regla única:** toda función de `packages/db/domain` que lea o escriba datos de un consultorio recibe como **primer
  parámetro posicional** `t: TenantRef` y adentro reemplaza `resolveLegacySchedulingScope(tx)` por
  `resolveTenantSchedulingContext(tx, t.tenantId)` (o filtra por `tenantId` directo). El `TenantContext` de la web
  cumple `TenantRef` estructuralmente; el bot pasa `{ tenantId }` de la conversación.
- Los parámetros `tenantId?: string` opcionales de HU-024 (`planTemplates`, `planSections`, `weeklyMenu`, `recipes`)
  pasan a **obligatorios** en los caminos de plan (los de plantilla y receta ya reciben el del contexto). Los scripts
  CLI que los llamen sin tenant (`packages/db/scripts/**`) pasan `LEGACY_TENANT_ID` explícito.
- Lista exacta de funciones que cambian, por módulo (firma nueva = `fn(t: TenantRef, …params actuales)`):

| Módulo | Funciones | Consume |
|---|---|---|
| `appointments.ts` | `createAppointment`, `updateAppointmentReason`, `rescheduleAppointment`, `cancelAppointment`, `setAppointmentStatus`, `respondToAppointmentAttendance` | web, bot |
| `availability.ts` | `getAvailableSlotsForService`, `getRescheduleSlots`, `checkSlotAvailable`; **se elimina** `getProfessional` al final de 025c | web, bot |
| `patients.ts` | `findOrCreatePatient`, `findOrCreatePatientByJid`, `findLegacyPatientByJidOrThrow` → `findPatientByJidOrThrow`, `updatePatientFormulaData`, `archivePatient`, `unarchivePatient`; se elimina `getLegacySchedulingTenantId` | web, bot |
| `clinical.ts` | `getClinicalRecord`, `upsertClinicalRecord`, `listEvolutionEntries`, `addEvolutionEntryOnDay`, `addEvolutionEntryToConsultation`, `deleteEvolutionEntry`, `getFormulaMeasurementsAsOf`, `getLatestFormulaMeasurements` | web |
| `consultations.ts` | `listPatientConsultations`, `getConsultation`, `listConsultationsOnDay`, `createManualConsultation`, `updateManualConsultationDate`, `saveConsultationNotes`, `setConsultationPlan`, `createPlanForConsultation`, `deleteConsultation`; `findOrCreateConsultationForDay` cambia su tipo de contexto a `SchedulingContext` | web |
| `isak.ts` | `getIsakStudy`, `createIsakStudy`, `updateIsakStudy`, `deleteIsakStudy`, `getPreviousIsakStudy` | web |
| `prescriptions.ts` | `getRequirementContextForConsultation`, `getReferencePrescription`, `saveConsultationPrescription`, `deleteConsultationPrescription`, `listLatestPrescriptions` | web |
| `anthropometricReports.ts` | `getAnthropometricReportMeta`, `saveAnthropometricReportTexts`, `saveAnthropometricReportPdf`, `getAnthropometricReportPdf`, `enqueueAnthropometricReportMessage` | web |
| `diary.ts` | `listDiaryEntries`, `addDiaryEntry`, `deleteDiaryEntry` | web (panel y portal) |
| `nutritionPlans.ts` | `listPatientPlans`, `getPlan`, `createPlan`, `updatePlan`, `deletePlan`, `addMeal`, `updateMeal`, `deleteMeal`, `addMealItem`, `updateMealItem`, `deleteMealItem`, `savePlanPdf`, `enqueuePlanPdfMessage`, `getPlanTarget`, `getPlanConsultationId` | web |
| `weeklyMenu.ts`, `planSections.ts` | `tenantId?` → obligatorio también para `kind: "plan"` | web |
| `recipes.ts` | `listPlanRecipePreviews(t, planId)`, `patientCanSeeRecipePhoto(t, patientId, photoId)` | web (panel, portal) |
| `payments.ts` | `createDepositCheckout`, `syncMercadoPagoPayment`, `reconcilePendingPayments`, `expireStalePendingPayments`, `listPendingPayments`, `listApprovedPaymentsInRange`, `registerManualPayment` (`handleMercadoPagoWebhook` sigue resolviendo el tenant desde el pago/cuenta, sin sesión) | web, bot |
| `mercadopagoAccount.ts` | `getMercadoPagoConnectionView`, `startMercadoPagoOAuth(t, sessionEmail)`, `completeMercadoPagoOAuth(t, input)`, `disconnectMercadoPagoAccount`, `getMercadoPagoCredentials`, `isMercadoPagoCheckoutAvailable`, `notifyMercadoPagoMissingForBooking` | web, bot |
| `inquiries.ts` | `recordInquiryMessage`, `listInquiries`, `countInquiriesByStatus`, `countPendingInquiries`, `markInquiryAnswered`, `enqueueAfterHoursDigest` | web, bot |
| `reminders.ts` | `enqueueReminderNow`, `getAppointmentReminderStatus` (web); `enqueuePrepInstructions`, `enqueueServiceReminders` (bot) | web, bot |
| `conversationState.ts` | `listLegacyPatientLastContacts` → `listPatientLastContacts(t, jids)`; el resto queda con nombre `Legacy*` para el bot hasta HU-027 | web, bot |
| `outbox.ts` | `enqueueMessage(t, params)` (escribe `tenantId`) | web, bot |
| `foods.ts` | `listFoods`, `getFood`, `getFoodUsage`, `findFoodNameConflicts`, `createOwnFood`, `updateOwnFood`, `setFoodActive`, `applyAtwaterKcal` (visibilidad por `tenant_visible_foods(tenantId)`, propios por dueño) | web |
| `foodMeasures.ts` | las que no reciban ya el tenant: `listFoodMeasures`, `listMeasuresForPicker`, `createFoodMeasure`, `updateFoodMeasure`, `deleteFoodMeasure`, `moveFoodMeasure`, `resolveMeasureItem` | web |
| `professionalAssets.ts` | `updateProfessionalLogo(t, data)`, `removeProfessionalLogo(t)`, `getProfessionalSignatureImage(t)`, `updateProfessionalSignature(t, input)`, `removeProfessionalSignature(t)`, `getProfessionalPdfAssets(t)`; resuelven la profesional de la agenda principal, `update` con `where: { id, tenantId }` | web |
| `botAi.ts` | `runBotAiTool({ …, tenantId })`, `countBotAiQuestionsToday`/`recordBotAiQuestion` si no filtran por paciente del tenant | bot (025c) |
| `gcal.ts` | `syncGoogleCalendar(t)`; el bot sigue pasando el legacy (HU-028 generaliza) | bot |

Si al implementar aparece una función exportada que consulta datos de consultorio y no está en la tabla, se le aplica
la misma regla y se anota en `progress/impl_HU-025b*.md`.

### 4.5 `apps/web/src/lib/tenant-context.ts` (nuevo, `server-only`; 025a)

```ts
export type TenantContext = {
  userId: string;
  tenantId: string;
  agendaId: string;
  professionalId: number;
  access: AccessGrant;            // { kind: "member", role } | { kind: "support", grantId, mode, expiresAt }
};
export type TenantAccessResult =
  | { ok: true; ctx: TenantContext }
  | { ok: false; reason: AccessDenial | "unauthenticated"; email: string | null };

/** React cache(): una lectura de membresía por request de servidor. Lee auth() → session.userId → loadAccessFacts
 *  → decideTenantAccess({ enabledTenantIds }) → agenda principal. Nunca lee el cliente. */
export const getTenantAccess: () => Promise<TenantAccessResult>;
export function getTenantContext(): Promise<TenantContext | null>;

export class TenantAccessError extends Error { readonly code: "no_context" | "read_only" | "owner_only" | "blocked_in_support" }
/** Server actions y rutas API. "write" rechaza soporte READ_ONLY (025d; antes es no-op). */
export function requireTenantContext(mode?: "read" | "write"): Promise<TenantContext>;
/** Equipo. Solo kind "member" con role OWNER; soporte nunca. */
export function requireOwnerContext(): Promise<TenantContext>;
/** Server components: redirect("/inicio") si no hay contexto. */
export function requirePageContext(): Promise<TenantContext>;

/** Candado transitorio (025a–025c). Se borra en el último paso de 025c. */
export const ENABLED_TENANT_IDS: readonly string[]; // [LEGACY_TENANT_ID]
```

`resolvePrivateContentAccess(mode: "read" | "write" = "write")` (`private-content-access.ts`) pasa a ser un wrapper de
`getTenantContext()` que conserva su retorno `{ userId, tenantId, role }` (`role` = el de la membresía; para soporte,
`"STAFF"` solo si el modo lo permite). Se elimina en 025b-2 cuando los ~25 consumidores pasan a `requireTenantContext`.

### 4.6 Sesión de Auth.js (025a)

- `token.userId` / `session.userId` reemplazan a `privateContentUserId` (`apps/web/src/types/next-auth.d.ts`). Un JWT
  viejo no tiene `userId` → sin contexto → `/inicio`, hay que volver a entrar (aceptado; ver procedimiento 6.4).
- El JWT **no** guarda rol ni tenant: se leen en cada request.

### 4.7 Portal (025c) — `packages/db/domain/patientAuth.ts`

```ts
export type PatientPortalClaims = { patientId: string; tenantId: string };
/** Formato v2: "p2.<patientId>.<tenantId>.<exp>.<firma>", firma = HMAC-SHA256(clave, "patient-portal:v2|<patientId>|<tenantId>|<exp>") en hex,
 *  clave = HMAC-SHA256(AUTH_SECRET, "nutribot/patient-portal") (separación de dominio). Ids validados con /^[A-Za-z0-9_-]{1,64}$/. */
export function createPatientToken(claims: PatientPortalClaims, ttlMinutes: number): string;
/** null si: no empieza con "p2.", partes ≠ 5, id inválido, vencido, o firma distinta (timingSafeEqual). Nunca tira.
 *  Un token v1 ("<id>.<exp>.<firma>") devuelve null. */
export function verifyPatientToken(token: string): PatientPortalClaims | null;
```

Consumen: bot (`createPatientToken` en la opción 4, con `patient.tenantId`) y web (`portal/login`, `patient-session.ts`).

`apps/web/src/lib/patient-session.ts`:

```ts
export function setPatientSessionCookie(claims: PatientPortalClaims): Promise<void>;
export type PortalSession = { patient: Patient; tenantId: string };
/** verifyPatientToken + prisma.patient.findFirst({ where: { id, tenantId } }). SIN filtro de archivedAt (D9c). */
export function getPortalSession(): Promise<PortalSession | null>;
export function getPortalPatient(): Promise<Patient | null>; // = (await getPortalSession())?.patient ?? null
```

---

## 5. Esquema

### 5.1 Migración 025a: `tenant_access_identity` (aditiva)

`schema.prisma`:

```prisma
model User {
  id            String             @id @default(cuid())
  email         String             @unique
  googleSubject String?            @unique
  /// HU-025: alta de la identidad (login pendiente o script).
  createdAt     DateTime           @default(now())
  /// HU-025: último login con Google verificado. null = nunca entró.
  lastSignInAt  DateTime?
  memberships   TenantMembership[]
}

model TenantMembership {
  // … campos actuales …
  /// HU-025: para Equipo.
  createdAt DateTime   @default(now())
}
```

SQL esperado (revisar que `--create-only` no genere nada más):

```sql
ALTER TABLE "User" ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
                   ADD COLUMN "lastSignInAt" TIMESTAMP(3);
ALTER TABLE "TenantMembership" ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
```

- **Filas existentes:** las dos columnas `NOT NULL` llevan `DEFAULT`, así que se rellenan solas (la fecha queda en el
  momento de la migración; aceptado, es informativa). No hace falta backfill.
- **Compatibilidad con el binario anterior:** el binario de HU-024 no conoce las columnas; sus `INSERT` (p. ej.
  `legacy-memberships.ts`) toman el default. Deploy sin ventana.
- **"Identidad pendiente" no lleva columna:** pendiente = `User` con `googleSubject` y sin membresía ni acceso de
  plataforma. Así no hay un estado que se desincronice.

### 5.2 Migración 025d: `platform_support_access` (aditiva)

```prisma
enum SupportAccessMode { READ_ONLY READ_WRITE }
enum PlatformAuditAction { SUPPORT_REQUEST GRANT_CREATED GRANT_REVOKED OPERATOR_GRANTED OPERATOR_REVOKED }
enum SupportRequestKind { PAGE ACTION API }
enum SupportRequestOutcome { ALLOWED DENIED_READ_ONLY DENIED_BLOCKED }

/// HU-025 (D2): operador de Arzium. Separado de TenantRole: no da acceso a ningún consultorio por sí solo.
/// Solo lo crea scripts/tenant-access.ts.
model PlatformOperator {
  userId    String    @id
  user      User      @relation(fields: [userId], references: [id], onDelete: Restrict)
  createdAt DateTime  @default(now())
  revokedAt DateTime?
  supportGrants SupportGrant[]
}

/// HU-025 (D2): permiso temporal de soporte sobre un consultorio. No se borra: se revoca.
model SupportGrant {
  id        String            @id @default(cuid())
  userId    String
  operator  PlatformOperator  @relation(fields: [userId], references: [userId], onDelete: Restrict)
  tenantId  String
  tenant    Tenant            @relation(fields: [tenantId], references: [id], onDelete: Restrict)
  mode      SupportAccessMode @default(READ_ONLY)
  /// Motivo corto, sin datos de pacientes (lo valida el script: máx. 200, sin saltos de línea).
  reason    String            @db.VarChar(200)
  startsAt  DateTime
  expiresAt DateTime
  revokedAt DateTime?
  createdAt DateTime          @default(now())
  auditEvents PlatformAuditEvent[]

  @@index([userId, expiresAt])
  @@index([tenantId, expiresAt])
}

/// HU-025 (D2): auditoría append-only (trigger SQL). Sin datos clínicos, sin query strings, sin tokens.
model PlatformAuditEvent {
  id          BigInt                 @id @default(autoincrement())
  occurredAt  DateTime               @default(now())
  actorUserId String
  actor       User                   @relation(fields: [actorUserId], references: [id], onDelete: Restrict)
  tenantId    String?
  tenant      Tenant?                @relation(fields: [tenantId], references: [id], onDelete: Restrict)
  grantId     String?
  grant       SupportGrant?          @relation(fields: [grantId], references: [id], onDelete: Restrict)
  action      PlatformAuditAction
  requestKind SupportRequestKind?
  outcome     SupportRequestOutcome?
  method      String?                @db.VarChar(10)
  /// Pathname sin query (auditPath). Puede contener ids opacos (cuid), nunca contenido.
  path        String?                @db.VarChar(300)

  @@index([tenantId, occurredAt])
  @@index([actorUserId, occurredAt])
}
```

(+ relaciones inversas en `User` y `Tenant`.)

SQL: el que genere `--create-only` (CREATE TYPE ×4, CREATE TABLE ×3, índices, FKs) **más**, agregado a mano al final del
mismo `migration.sql` antes de aplicarlo:

```sql
-- Ventana de soporte acotada (CONFIRMAR C1: 7 días).
ALTER TABLE "SupportGrant" ADD CONSTRAINT "SupportGrant_window_check"
  CHECK ("expiresAt" > "startsAt" AND "expiresAt" <= "startsAt" + INTERVAL '7 days');
ALTER TABLE "SupportGrant" ADD CONSTRAINT "SupportGrant_reason_check"
  CHECK (length(btrim("reason")) BETWEEN 3 AND 200 AND "reason" !~ '[\r\n]');

-- Auditoría append-only. Prisma no modela estos objetos: conservarlos en futuras migraciones.
CREATE FUNCTION "platform_audit_append_only"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'PlatformAuditEvent is append-only' USING ERRCODE = '42501';
END $$;
CREATE TRIGGER "PlatformAuditEvent_no_update_delete" BEFORE UPDATE OR DELETE ON "PlatformAuditEvent"
  FOR EACH ROW EXECUTE FUNCTION "platform_audit_append_only"();
CREATE TRIGGER "PlatformAuditEvent_no_truncate" BEFORE TRUNCATE ON "PlatformAuditEvent"
  FOR EACH STATEMENT EXECUTE FUNCTION "platform_audit_append_only"();

-- Un permiso no se borra ni se edita: solo se revoca una vez.
CREATE FUNCTION "support_grant_revoke_only"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'SupportGrant cannot be deleted' USING ERRCODE = '42501'; END IF;
  IF OLD."revokedAt" IS NOT NULL OR NEW."revokedAt" IS NULL
     OR (to_jsonb(NEW) - 'revokedAt') IS DISTINCT FROM (to_jsonb(OLD) - 'revokedAt') THEN
    RAISE EXCEPTION 'SupportGrant can only be revoked once' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "SupportGrant_revoke_only" BEFORE UPDATE OR DELETE ON "SupportGrant"
  FOR EACH ROW EXECUTE FUNCTION "support_grant_revoke_only"();
```

- Tablas nuevas, sin filas existentes: no hay backfill. El binario anterior no las lee. Deploy sin ventana.
- `ON DELETE RESTRICT` en todas las FKs nuevas: borrar un `User` o `Tenant` con auditoría falla (intencional).
- Unicidad "un permiso vigente por operador" no se puede expresar con índice parcial (depende de `now()`): la impone el
  script bajo `LOCK TABLE "SupportGrant" IN SHARE ROW EXCLUSIVE MODE`, y `decideTenantAccess` rechaza si ve dos.
- `PlatformOperator` es tabla aparte (no `User.platformRole`) para que ningún `select` de `User` o de membresía lo
  arrastre por accidente y quede claro que no es un `TenantRole`.

### 5.3 Lo que no cambia en el esquema

- No se endurece ningún `tenantId` a `NOT NULL` ni se retiran índices de compatibilidad de HU-024 (fuera de alcance).
- `Patient.tenantId` sigue nullable: el portal y el panel tratan un paciente sin dueño como inexistente.
- `MercadoPagoOAuthState.sessionEmail` se conserva; el `state` se sigue atando al email de la sesión (HU-028 lo
  generaliza). El tenant del flujo se agrega en `tenantId` (ya existe) desde el contexto.

---

## 6. Login, identidad pendiente y migración en producción (D1)

### 6.1 Flujo nuevo

1. `signIn` (Node, `auth.ts`): acepta solo `account.provider === "google"`, `profile.email_verified === true`,
   `profile.sub === account.providerAccountId` y email no vacío. Cualquier otra cosa → `false` (Auth.js vuelve a
   `/inicio?error=AccessDenied`, aviso genérico). **No** mira ninguna lista.
2. `jwt` con `account` (login): `registerGoogleIdentity({ subject, email: canonicalEmail(profile.email) })`. Si
   `linked` → `token.userId`. Si `conflict` → sin `userId` (log `[auth] identity_conflict`).
3. Google Calendar (D10): se guarda el refresh token solo si `shouldStoreCalendarToken(...)` **y**
   `decideTenantAccess(loadAccessFacts(userId))` da `member` de `LEGACY_TENANT_ID`. Sigue escribiendo la agenda legacy
   (`resolveLegacyCalendarScope`) hasta HU-028.
4. Middleware (6.3): sin `token.userId` → `/inicio`; con `userId`, decisión por request.
5. `/inicio` y `/login`: si `getTenantAccess()` da `ok` → `redirect("/")`; si hay sesión sin acceso → `NoAccessScreen`
   con la razón y el email de la sesión; sin sesión → `LoginScreen`.

### 6.2 `registerGoogleIdentity` (tabla de casos, en una transacción `ReadCommitted` con `pg_advisory_xact_lock(hashtext('user-identity'))`)

| Estado previo | Resultado | Escritura |
|---|---|---|
| Existe `User.googleSubject = sub` | `linked` (ese User) | `lastSignInAt = now`. No toca email aunque Google lo haya cambiado. |
| No existe el `sub`; ningún `User` con `lower(btrim(email)) = email` | `linked` (User nuevo pendiente) | `INSERT User(email, googleSubject, lastSignInAt)` |
| No existe el `sub`; existe User con ese email y **otro** `sub` | `conflict` | ninguna (CA "Email que coincide pero sub distinto") |
| No existe el `sub`; existe User con ese email y `googleSubject NULL` | `conflict` | ninguna. No se vincula por email (decisión S24 de HU-024). El operador lo resuelve con `legacy-memberships` (padrón con `sub`) o borrando ese User con `forget-pending` si no tiene membresía. |

La búsqueda por email usa `lower(btrim(email))` en SQL (hay emails históricos con mayúsculas o espacios, ver
`legacy-memberships.ts`). Una violación `P2002` concurrente se traduce a `conflict`.

### 6.3 Middleware: puerta central por request

**Opción A (la que se implementa):** `apps/web/src/middleware.ts` pasa a runtime Node (`export const config = { runtime:
"nodejs", matcher }`, estable en Next 15.5; el repo tiene 15.5.24 instalado → subir el rango de `apps/web/package.json`
a `"next": "^15.5.0"`). Usa `auth` de `@/auth` (config completa con Prisma) y en cada request del matcher:

1. Sin `req.auth?.userId` → páginas: redirect `/inicio`; `/api/*`: `401 {"error":"unauthorized"}`.
2. `decideTenantAccess(await loadAccessFacts(userId, now), { enabledTenantIds: ENABLED_TENANT_IDS })`.
   - No ok → páginas: redirect `/inicio`; `/api/*`: `401`; server action (header `next-action`): en 025a `401`; desde
     025b, se deja pasar al handler (todas las acciones llaman `requireTenantContext`, verificado por el test de
     guarda) para que la UI muestre el error genérico y mande a `/inicio` (HU 4.2).
   - 025d: `support` + (`isMutatingPanelRequest` y `mode === "READ_ONLY"`, o path en `SUPPORT_BLOCKED_PATH_PREFIXES`)
     → `403` / redirect a `/?soporte=solo-lectura`, y `recordSupportRequest(... outcome DENIED_*)`; si pasa,
     `recordSupportRequest(... ALLOWED)`.
3. El matcher sigue excluyendo `api/webhooks/mercadopago`, `api/auth`, `login`, `inicio`, `acerca`, `privacidad`,
   `portal`, estáticos.

**Verificación obligatoria de A:** `npm run build --workspace apps/web` termina bien y `.next/server/middleware-manifest.json`
no lista el middleware como edge; `docker build -f apps/web/Dockerfile .` termina bien (standalone con Prisma en
middleware). **Si A falla en build** (no por un error propio), aplicar la **opción B** y anotarlo en
`progress/impl_HU-025a.md`: middleware Edge que solo exige `token.userId`, y `await requireTenantContext()` (o
`requirePageContext()`) agregado en 025a a: `(panel)/layout.tsx`; las 8 rutas `app/api/*/route.ts` con sesión
(`appointments`, `slots`, `diary/[entryId]/photo`, `professional/logo`, `professional/signature`, `recetas/fotos/[photoId]`,
`recetas/importacion/[imageId]`, `mercadopago/oauth/callback`); `informe/pdf/route.ts`; y la primera línea de cada
función exportada de los 27 archivos `*actions.ts` de `app/(panel)` (lista en 8.2). En B, la auditoría de 025d va en
`getTenantAccess()` con el pathname que el middleware Edge copia al header `x-nutribot-path`.

### 6.4 Procedimiento de producción (Daiana `OWNER`, Joel solo soporte)

025a sale en **dos deploys** (dos PRs, `025a-1` y `025a-2`) para que nadie quede afuera entre el deploy y la carga.

**Fase 0 · Ensayo (antes de mergear 025a-1 a `main`)**
1. `bash packages/db/scripts/test-tenant-access.sh` en verde (Postgres descartable, migraciones desde cero y upgrade,
   identidades sintéticas; ver 10.3). Cubre: el login sintético del padrón queda pendiente → `grant` → tiene acceso;
   una cuenta fuera del padrón queda pendiente y sin acceso; conflicto de email/sub.
2. Confirmar en el VPS que `deploy/.env` tiene `GOOGLE_CALENDAR_OWNER_EMAIL` = el email de Daiana (D10). Sin eso, el
   token del calendario no se guarda.
3. Verificar que el script corre en la imagen: `cd /opt/nutribot/deploy && docker compose run --rm migrate npx --no-install tsx --version`.

**Fase 1 · Deploy de 025a-1** (develop → main; `deploy.sh` respalda, migra `tenant_access_identity`, reinicia web y bot)
- Código: el acceso **sigue** por `ALLOWED_EMAILS` (sin cambios para Daiana y Joel), pero el `jwt` ya registra la
  identidad (6.2) y guarda `token.userId`. Recetas y plantillas usan `token.userId`.
- Chequeo: `docker compose run --rm migrate npx --no-install tsx packages/db/scripts/tenant-access.ts pending` → vacío.

**Fase 2 · Registro de identidades (minutos, coordinado con Daiana)**
1. Daiana y Joel cierran sesión y vuelven a entrar con Google en `https://numa.arzium.com.ar` (siguen entrando por la
   lista). Eso crea sus `User` pendientes con el `sub` verificado.
2. `tenant-access.ts pending` → muestra 2 filas (`email`, `createdAt`, `lastSignInAt`, `sub` enmascarado `…1234`).
   Confirmar con Daiana que el email listado es el suyo.

**Fase 3 · Carga de la membresía**
1. `tenant-access.ts grant --email <email de Daiana> --tenant legacy-tenant --role OWNER` (dry-run: muestra
   `memberships_created=1`).
2. Mismo comando con `--apply`. Verificar: `tenant-access.ts members --tenant legacy-tenant` → una fila, Daiana, `OWNER`.
3. **Joel no recibe membresía** (D1). Queda pendiente hasta 025d.

**Fase 4 · Deploy de 025a-2** (acceso por membresía; `ALLOWED_EMAILS` deja de leerse)
- Daiana sigue adentro sin volver a entrar: su JWT de la fase 2 ya tiene `userId` y la membresía se lee por request.
- Joel ve "Tu cuenta no tiene acceso a ningún consultorio" **hasta 025d** [CONFIRMAR C3]. Opera producción por SSH y
  scripts como hasta ahora.
- Chequeo con una cuenta de Google de prueba de Joel (no la principal): entra a `/inicio` → aviso de sin acceso con la
  nota de pedido registrado; `pending` la lista. Después: `tenant-access.ts forget-pending --email <cuenta de prueba> --apply`
  (borra solo ese `User`, que no tiene membresía ni auditoría).
- **Rollback:** `deploy.sh <sha de 025a-1>`. La migración es aditiva y el código de 025a-1 sigue entrando por la lista,
  por eso **`ALLOWED_EMAILS` se deja en `deploy/.env` del VPS hasta que 025b-1 esté en producción y estable**; recién
  ahí se borra la línea (el código ya no la lee).

**Fase 5 · 025d (Joel como soporte)** — después del deploy de 025d:
1. `tenant-access.ts operator-grant --email <email de Joel>` → dry-run → `--apply`.
2. `tenant-access.ts support-grant --email <email de Joel> --tenant legacy-tenant --hours 24 --mode read-only --reason "Soporte piloto"`
   → dry-run → `--apply`.
3. Joel recarga el panel → franja de modo soporte; `tenant-access.ts audit --tenant legacy-tenant --since 1h` muestra
   sus requests. Daiana ve el permiso en Ajustes → Equipo [CONFIRMAR C4].

### 6.5 Script `packages/db/scripts/tenant-access.ts` (nuevo) y `legacy-memberships.ts`

**Decisión:** `legacy-memberships.ts` **se conserva sin cambios** (bootstrap con padrón y `sub`, útil en ensayos y en
instalaciones desde cero; su probe de HU-024 sigue valiendo) y **se reemplaza para el procedimiento de producción** por
`tenant-access.ts`. No se extiende porque su semántica (padrón todo-o-nada con `sub` obligatorio, solo `legacy-tenant`)
no encaja con "otorgar por email a una identidad ya verificada". Se deja una nota en su `--help` y en el README:
"Para otorgar acceso a una identidad pendiente, usar `tenant-access`". Se retira en HU-026 si las invitaciones lo
vuelven innecesario.

`package.json` de `packages/db`: `"tenant-access": "tsx scripts/tenant-access.ts"` (sin dotenv: `DATABASE_URL` explícita,
igual que `legacy-memberships`). Producción: `docker compose run --rm migrate npx --no-install tsx packages/db/scripts/tenant-access.ts <subcomando>`.

| Subcomando | Entrega | Qué hace | Rechaza |
|---|---|---|---|
| `pending` | 025a | Lista Users sin membresía y sin operador activo: email, `createdAt`, `lastSignInAt`, `sub` enmascarado (últimos 4). | — |
| `members --tenant <id>` | 025a | Lista membresías: email, rol, `createdAt`. | tenant inexistente |
| `grant --email <e> --tenant <id> --role OWNER\|STAFF [--apply]` | 025a | Crea la membresía para el User con ese email canónico. | sin User; `googleSubject` nulo; ya tiene membresía en **otro** tenant (D7); ya tiene en ese tenant con otro rol; tenant sin agenda principal |
| `revoke --email <e> --tenant <id> [--apply]` | 025a | Borra la membresía. | último `OWNER` del tenant |
| `forget-pending --email <e> [--apply]` | 025a | Borra un User pendiente. | tiene membresía, es operador o tiene auditoría |
| `operator-grant` / `operator-revoke --email <e> [--apply]` | 025d | Crea / revoca (`revokedAt`) `PlatformOperator`; audita `OPERATOR_*`. | User con membresía (un operador no es profesional) [CONFIRMAR C6] |
| `support-grant --email <e> --tenant <id> --hours <n> --mode read-only\|read-write --reason "<texto>" [--apply]` | 025d | Crea `SupportGrant` (ventana de `supportGrantWindow`); audita `GRANT_CREATED`. | no operador; ya tiene un permiso vigente; horas fuera de rango; motivo inválido |
| `support-revoke --grant <id> [--apply]` | 025d | `revokedAt = now`; audita `GRANT_REVOKED`. | ya revocado |
| `audit --tenant <id> [--since 24h]` | 025d | Lista eventos (sin nada más que las columnas de la tabla). | — |

Comunes: dry-run por defecto; `--apply` en una transacción con `LOCK TABLE "User", "TenantMembership" IN SHARE ROW
EXCLUSIVE MODE` (y `"SupportGrant"` en 025d); salida con conteos tipo `applied memberships_created=1`; errores con
mensaje fijo, sin stack; nunca imprime el `sub` completo. Lógica de validación pura (argumentos, email, ventana) en
`packages/core` o en funciones exportadas del script testeadas con vitest; la parte de base, en el probe descartable.

---

## 7. Entregas

Orden estricto: **025a-1 → 025a-2 → 025b-1 → 025b-2 → 025c → 025d**. Cada una es una rama y un PR a `develop`, y cada
una deja `develop` deployable sola (el deploy migra y después reinicia web y bot, sin ventana): toda migración es
aditiva y todo binario nuevo funciona con el esquema anterior más la migración de su entrega. Solo 025a-1 y 025d
tienen migración; durante esas dos el issue #68 está en `implementando` con label `migración` (ninguna otra HU con
migración en `implementando` a la vez, AGENTS.md).

### 7.1 Entrega 025a · Núcleo de sesión y acceso

**Workspaces:** core, db, web (bot no). **Migración:** `tenant_access_identity` (solo en 025a-1).

**Archivos**

| Archivo | Cambio | Parte |
|---|---|---|
| `packages/core/src/tenant-access.ts` (+ `.test.ts`), `packages/core/src/index.ts` | nuevo: `decideTenantAccess`, `canonicalEmail`, `isMutatingPanelRequest`, textos de acceso | a-1 |
| `packages/db/prisma/schema.prisma`, `migrations/<ts>_tenant_access_identity/migration.sql` | 5.1 | a-1 |
| `packages/db/domain/tenantAccess.ts` (+ `.test.ts` con mocks), `domain/index.ts` | `LEGACY_TENANT_ID`, `registerGoogleIdentity`, `loadAccessFacts` | a-1 |
| `packages/db/scripts/tenant-access.ts`, `package.json` (script), `scripts/test-tenant-access.sh`, `scripts/tenant-access.integration.ts` | script + probe | a-1 |
| `apps/web/src/types/next-auth.d.ts` | `userId` | a-1 |
| `apps/web/src/auth.ts` (+ `auth.test.ts`) | registro de identidad en `jwt`; `session.userId`; D10 | a-1 |
| `apps/web/src/lib/private-content-access.ts` (+ test) y tests que mockean `privateContentUserId` (`api/recetas/*/route.test.ts`, `recetas/actions.test.ts`) | leer `session.userId` | a-1 |
| `apps/web/src/lib/tenant-context.ts` (+ `.test.ts`) | 4.5 | a-2 |
| `apps/web/src/auth.config.ts` | `signIn` por identidad verificada; borrar `allowedEmails` | a-2 |
| `apps/web/src/middleware.ts` | 6.3 opción A | a-2 |
| `apps/web/package.json` | `next` `^15.5.0` | a-2 |
| `apps/web/src/app/(panel)/layout.tsx` | `requirePageContext()` | a-2 |
| `apps/web/src/app/inicio/page.tsx`, `apps/web/src/app/login/page.tsx`, `apps/web/src/components/login-screen.tsx`, `apps/web/src/components/no-access-screen.tsx` (nuevo) | 9.1 | a-2 |
| `apps/web/src/app/api/mercadopago/oauth/callback/route.ts` (+ test), `app/(panel)/ajustes/actions.ts` (acción que llama `startMercadoPagoOAuth`) | `requireTenantContext("write")` en lugar de `allowedEmails`; email de la sesión sigue atando el state | a-2 |
| `apps/web/src/lib/private-content-access.ts` | wrapper de `getTenantContext()` (4.5) | a-2 |
| `apps/web/src/lib/calendar-token-owner.ts` | comentario (ya no hay lista) | a-2 |
| `.env.example`, `deploy/.env.example`, `packages/db/prisma/seed.ts` (+ `seed.test.ts`), `README.md`, `deploy/README.md` | retirar `ALLOWED_EMAILS`; seed usa `SEED_PROFESSIONAL_EMAIL ?? "nutricionista@example.com"`; README explica `tenant-access`; deploy/README enlaza 6.4 | a-2 |

**Checklist 025a-1** (rama `feat/HU-025a1-registro-identidad`)

- [ ] 2.1 prerrequisito de la base de desarrollo (sin commit).
- [ ] core: `canonicalEmail` + tests (mayúsculas, espacios, idempotencia).
- [ ] core: tipos `AccessFacts`/`AccessDecision` y `decideTenantAccess` + tests (10.1). Commit.
- [ ] db: editar `schema.prisma` (5.1) → `pg_dump` → `migrate dev --create-only --name tenant_access_identity` → revisar
      que el SQL sea exactamente el de 5.1 → aplicar → `npm run db:generate`. Commit (schema + migración).
- [ ] db: `domain/tenantAccess.ts` con `LEGACY_TENANT_ID`, `registerGoogleIdentity` (tabla 6.2), `loadAccessFacts`;
      exportar en `domain/index.ts`; tests con mocks de Prisma (casos de 6.2). Commit.
- [ ] db: `scripts/tenant-access.ts` con `pending`, `members`, `grant`, `revoke`, `forget-pending`; script en
      `package.json`. Commit.
- [ ] db: `scripts/test-tenant-access.sh` + `tenant-access.integration.ts` (10.3), usando el contexto de Docker del
      entorno (sin socket fijo), `postgres:16-alpine` sin `--pull`, tmpfs, puerto `127.0.0.1` aleatorio, sin `.env`.
      Commit.
- [ ] web: `next-auth.d.ts` → `userId`; `auth.ts`: en `jwt` con `account`, `registerGoogleIdentity` y `token.userId`;
      D10 (calendario solo si es `member` de legacy); `session.userId`. Mantener el `signIn` de `authConfig` con
      `ALLOWED_EMAILS` **en esta parte**. Actualizar `auth.test.ts` (registro, conflicto, sub≠providerAccountId,
      email_verified false, calendario con y sin membresía). Commit.
- [ ] web: `private-content-access.ts` y sus tests leen `session.userId`. Commit.
- [ ] Verificación 7.1.V. PR `025a-1`.

**Checklist 025a-2** (rama `feat/HU-025a2-acceso-por-membresia`, después de la fase 3 de 6.4 en producción — o, si el
usuario lo decide, mergeada a `develop` antes y publicada a `main` recién después de la fase 3)

- [ ] core: `isMutatingPanelRequest` + tests; textos de acceso (9.1) en core. Commit.
- [ ] web: `lib/tenant-context.ts` (4.5) con `ENABLED_TENANT_IDS = [LEGACY_TENANT_ID]`; tests con mocks (10.2). Commit.
- [ ] web: `private-content-access.ts` como wrapper de `getTenantContext()` (mismo retorno; `mode` con default
      `"write"`); tests existentes en verde. Commit.
- [ ] web: `auth.config.ts`: `signIn` por identidad verificada (6.1 paso 1), sin `allowedEmails`; borrar `authorized`
      si la opción A lo vuelve innecesario. Commit.
- [ ] web: `middleware.ts` opción A (6.3) + `next` `^15.5.0` + test del middleware con mocks (sin userId, sin
      membresía, otro tenant, API → 401, página → redirect). Verificar build (6.3). Si falla → opción B. Commit.
- [ ] web: `(panel)/layout.tsx` con `requirePageContext()`. Commit.
- [ ] web: `NoAccessScreen`, `/inicio` y `/login` (9.1); `LoginScreen` sin el texto de "lista de acceso". Tests de
      render por razón. Commit.
- [ ] web: callback OAuth de MP y la acción que inicia el OAuth con `requireTenantContext("write")`; tests
      actualizados (sin contexto → redirect `/inicio`). Commit.
- [ ] Retirar `ALLOWED_EMAILS`/`allowedEmails` de `.env.example`, `deploy/.env.example`, `seed.ts` (+ test),
      `README.md`; procedimiento en `deploy/README.md`. `grep -rn "ALLOWED_EMAILS\|allowedEmails" apps packages
      .env.example deploy README.md` → 0. Commit.
- [ ] Logs de `auth.ts`, middleware, `tenant-context.ts`, callback MP: solo códigos (D11). Commit si hubo cambios.
- [ ] Verificación 7.1.V. PR `025a-2`.

**7.1.V Verificación**

```bash
npm run db:generate
npm run typecheck --workspace apps/web && npm run typecheck --workspace apps/bot && npm run typecheck
npm run test
npm run build --workspace apps/web          # 025a-2: middleware Node
bash packages/db/scripts/test-tenant-access.sh
./ops/harness/verify.sh
```

Más, en 025a-2: `docker build -f apps/web/Dockerfile .` termina bien.

**Hecho 025a** cuando: (1) un login con membresía entra y uno sin membresía ve el aviso, con tests; (2) dos
membresías → aviso de D7; (3) email igual y sub distinto → `conflict` sin escrituras (probe); (4) revocar la membresía
corta la siguiente página, ruta API y server action (test del middleware); (5) no queda `ALLOWED_EMAILS` en el código;
(6) el probe descartable reproduce 6.4 con identidades sintéticas; (7) un tenant distinto de `legacy-tenant` obtiene
`tenant_not_enabled`.

### 7.2 Entrega 025b · Panel y API sobre el contexto (skill `refactor`)

Partida en **025b-1** (agenda, pacientes, clínica, planes) y **025b-2** (pagos, mensajes, ajustes, alimentos,
asistente, resumen, recetas/plantillas, Equipo, cierre). Sin migración. Toca `apps/bot` solo para pasar el tenant a
las firmas nuevas.

#### Estrategia para no romper nada en el medio

1. **Primero la infraestructura, sin cambiar comportamiento:** `tenantScope.ts` y la fachada legacy encima. Todo sigue
   compilando y resolviendo `legacy-tenant`.
2. **Bot como un único punto:** `apps/bot/src/tenant.ts` exporta `getConversationTenant(): Promise<TenantRef>`
   (hoy = `{ tenantId: (await resolveLegacySchedulingScope()).scope.tenantId }`; HU-027 lo cambia por la conexión).
   Cada vez que una firma de dominio cambia, el bot pasa `await getConversationTenant()` (o `{ tenantId: patient.tenantId }`
   cuando ya tiene el paciente de la conversación). Así el bot nunca queda roto entre dos commits.
3. **Un módulo por commit, de adentro hacia afuera:** cambiar las firmas de un módulo de dominio → arreglar todos sus
   consumidores en web y bot en el mismo commit → typecheck de web y bot → tests del módulo. El compilador marca cada
   llamada pendiente porque `t` es obligatorio.
4. **El candado legacy sigue puesto** (`ENABLED_TENANT_IDS`), así un módulo migrado y uno sin migrar conviven sin fuga:
   el único contexto posible sigue siendo `legacy-tenant`.
5. **Recién al final**, el test de guarda (10.2) prohíbe importar el adaptador legacy, `getProfessional` y
   `where: { id: 1 }` desde `apps/web/src/app/(panel)` y `app/api`.

#### Patrón por archivo

- **Server component (`page.tsx`, componentes de servidor):** `const ctx = await requirePageContext();` y pasar `ctx` a
  las funciones de dominio. Un recurso que devuelve `null` → `notFound()`.
- **Server action:** `const ctx = await requireTenantContext("read" | "write")` como primera línea, dentro del `try`
  que ya devuelve el error genérico. `TenantAccessError` → `{ error: <texto genérico existente>, reauth: true }` y la
  UI hace `router.replace("/inicio")` cuando ve `reauth` (agregar a `useActionToast`/`notify` en `lib/notify.ts`).
- **Ruta API:** `getTenantContext()`; `null` → `401 {"error":"unauthorized"}`; recurso ajeno → mismo 404 que
  inexistente, con `Cache-Control: no-store` en las privadas.
- **Consultas `prisma.*` directas en web:** se agregan `tenantId: ctx.tenantId` (o `patient: { tenantId }` para hijos
  clínicos) en el `where`; si la consulta es por id único se cambia `findUnique({ where: { id } })` por
  `findFirst({ where: { id, tenantId } })` o la clave compuesta `id_tenantId` donde exista.

#### Radio de impacto (lista exacta)

**025b-1**

| Módulo | `packages/db/domain` | `apps/web/src` | `apps/bot/src` |
|---|---|---|---|
| M0 infra | `tenantScope.ts` (nuevo, + test), `legacySchedulingScope.ts` (fachada), `index.ts`, `package.json` exports (`./domain/tenantScope`, `./domain/tenantAccess`) | — | `tenant.ts` (nuevo) |
| M1 agenda | `appointments.ts`, `availability.ts` (slots, reschedule, check), `reminders.ts` (`enqueueReminderNow`, `getAppointmentReminderStatus`, y crons con `t`) | `app/(panel)/(calendario)/page.tsx`, `app/(panel)/actions.ts`, `app/(panel)/appointment-cancel.ts`, `app/(panel)/appointment-detail-sheet.tsx` (si consulta), `app/(panel)/new-appointment-modal.tsx` (si llama acciones con ids), `app/(panel)/turnos/page.tsx`, `app/(panel)/turnos/data.ts`, `app/(panel)/disponibilidad/page.tsx`, `app/(panel)/disponibilidad/actions.ts`, `app/(panel)/servicios/page.tsx`, `app/(panel)/servicios/actions.ts`, `lib/services.ts`, `lib/appointments.ts`, `lib/availability.ts`, `app/api/appointments/route.ts`, `app/api/slots/route.ts` | `conversation.ts`, `booking.ts`, `workers.ts`, `scripts/test-*.ts` que llamen esas funciones |
| M2 pacientes y clínica | `patients.ts`, `clinical.ts`, `consultations.ts`, `isak.ts`, `prescriptions.ts`, `anthropometricReports.ts`, `diary.ts` | `app/(panel)/pacientes/(directorio)/page.tsx`, `pacientes/(directorio)/@modal/(.)[id]/page.tsx`, `@modal/(.)[id]/planes/[planId]/page.tsx`, `pacientes/actions.ts`, `pacientes/[id]/page.tsx`, `pacientes/[id]/patient-record.tsx`, `pacientes/[id]/clinical-actions.ts`, `consultation-actions.ts`, `isak-actions.ts`, `prescription-actions.ts`, `report-actions.ts`, `pacientes/[id]/consultas/[consultationId]/page.tsx`, `…/antropometria/page.tsx`, `…/antropometria/informe/page.tsx`, `…/antropometria/informe/pdf/route.ts`, `lib/consultation-guard.ts`, `lib/anthropometric-report.ts`, `lib/patients.ts`, `app/api/diary/[entryId]/photo/route.ts` | `conversation.ts` (`findOrCreatePatientByJid`, `findPatientByJidOrThrow`) |
| M3 planes | `nutritionPlans.ts`, `weeklyMenu.ts`, `planSections.ts`, `recipes.ts` (`listPlanRecipePreviews`), `planTemplates.ts` (`applyTemplateToPatient` sin la sobrecarga sin tenant) | `pacientes/[id]/planes/actions.ts`, `pacientes/[id]/planes/[planId]/page.tsx`, `[planId]/actions.ts`, `[planId]/ai-actions.ts`, `[planId]/plan-detail.tsx`, `app/(panel)/weekly-menu-actions.ts`, `plan-section-actions.ts`, `recipe-picker-actions.ts`, `lib/revalidate-menu-owner.ts`, `lib/professional-pdf.ts`, `lib/outbox.ts` | — |

**025b-2**

| Módulo | `packages/db/domain` | `apps/web/src` | `apps/bot/src` |
|---|---|---|---|
| M4 pagos y MP | `payments.ts`, `mercadopagoAccount.ts` | `app/(panel)/pagos/page.tsx`, `pagos/actions.ts`, `app/(panel)/appointment-payment-modal.tsx` (si llama acciones), `ajustes/mercadopago-section.tsx`/acciones MP de `ajustes/actions.ts`, `api/mercadopago/oauth/callback/route.ts` | `workers.ts`/crons de pagos, `conversation.ts` (seña) |
| M5 mensajes y avisos | `inquiries.ts`, `conversationState.ts` (`listPatientLastContacts`), `outbox.ts` (`enqueueMessage(t, …)`) | `mensajes/page.tsx`, `mensajes/actions.ts`, `avisos/page.tsx`, `avisos/actions.ts` | `conversation.ts`, `workers.ts` |
| M6 ajustes, activos y shell | `professionalAssets.ts` | `ajustes/page.tsx`, `ajustes/actions.ts`, `ajustes/signature-actions.ts`, `ajustes/whatsapp/page.tsx` (QR y `BotStatus` por `tenantId`), `api/professional/logo/route.ts`, `api/professional/signature/route.ts`, `lib/shell.ts` (funciones del panel reciben `tenantId`: `getProfessionalDisplayName(tenantId)`, `getBotShellStatus(tenantId)`, `getPendingInquiryCount(tenantId)`), `(panel)/layout.tsx`, `lib/professional.ts` (exporta `getTenantProfessional`) | `whatsapp.ts`: `setBotStatus` crea con `tenantId` del bot |
| M7 alimentos | `foods.ts`, `foodMeasures.ts` | `alimentos/page.tsx`, `alimentos/[id]/page.tsx`, `alimentos/nuevo/page.tsx`, `alimentos/actions.ts`, `food-measure-actions.ts`, `components/food-picker.tsx` si llama acciones | — |
| M8 asistente | — | `lib/assistant-tools.ts` (cada tool recibe `ctx`; todas las consultas con `tenantId`), `asistente/actions.ts`, `asistente/page.tsx` | — |
| M9 resumen | — | `resumen/page.tsx` | — |
| M10 recetas y plantillas | — | los ~25 consumidores de `resolvePrivateContentAccess` (`recetas/**`, `plantillas/**`, `recipe-picker-actions.ts`, `weekly-menu-actions.ts`, `plan-section-actions.ts`, `food-measure-actions.ts`, `pacientes/[id]/planes/actions.ts`, `patient-record.tsx`, `api/recetas/fotos/[photoId]`, `api/recetas/importacion/[imageId]`) pasan a `requireTenantContext(mode)`/`requirePageContext()`; se borra `private-content-access.ts` (+ test, reubicando sus casos en `tenant-context.test.ts`) | — |
| M11 Equipo | `tenantAccess.ts` (`listTenantMembers`, `removeTenantMember`) | `ajustes/page.tsx`, `ajustes/ajustes-tabs.tsx` (pestaña condicional), `ajustes/team-section.tsx` (nuevo), `ajustes/team-actions.ts` (nuevo, + test) | — |
| M12 cierre | — | `apps/web/src/guard-coverage.test.ts` (nuevo, 10.2); middleware deja pasar `next-action` al handler (6.3) | — |

#### 7.2.1 Reglas de Ajustes → Equipo (D4)

- Pestaña `equipo` solo si `ctx.access.kind === "member" && role === "OWNER"`. `AJUSTES_TABS` pasa a recibir la lista
  de pestañas visibles desde `page.tsx` (prop `tabs`); `?tab=equipo` sin permiso cae en la pestaña por defecto (el
  `isTab` actual ya lo hace con la lista recibida).
- `removeTeamMemberAction(formData)` → `requireOwnerContext()`; lee `userId` objetivo del form y **nada más**; llama
  `removeTenantMember({ tenantId: ctx.tenantId, actorUserId: ctx.userId, targetUserId })`.
- `removeTenantMember`: transacción `ReadCommitted` con `SELECT … FROM "TenantMembership" WHERE "tenantId" = $1 FOR
  UPDATE`; calcula con `canRemoveMember`; si ok, `DELETE` de esa membresía (el `User` queda como pendiente).
- **Quitarse a uno mismo:** rechazado (`self`). La fila propia no muestra el botón; el servidor lo rechaza igual. Texto:
  "No podés quitarte tu propio acceso. Si necesitás dejar el consultorio, escribinos a soporte."
- **Último OWNER:** rechazado (`last_owner`) aunque por la UI no se pueda llegar (quien quita es OWNER y no puede
  quitarse a sí mismo). Defensa en profundidad para el script `revoke` y para concurrencia (dos OWNER quitándose
  mutuamente a la vez: el lock serializa y el segundo ve `ownerCount = 1`).
- **Quitar a otro OWNER:** permitido (D3: mismos permisos) [CONFIRMAR C5].
- Target que no es miembro de este tenant (id de otro consultorio o inventado) → `not_member` → el mismo error
  genérico, sin distinguir.
- Efecto: la persona quitada pierde el acceso en su **siguiente** request (se lee por request).

**Checklist 025b-1** (rama `feat/HU-025b1-agenda-clinica-planes`)

- [ ] M0: `tenantScope.ts` (4.3) + tests con mocks (agenda principal presente, ausente, profesional de otro tenant
      imposible por FK). `legacySchedulingScope.ts` como fachada (mantiene `legacy-agenda`/`professionalId: 1`).
      `getTenantProfessional`. Exports en `index.ts` y `package.json`. Commit.
- [ ] M0: `apps/bot/src/tenant.ts` (`getConversationTenant`). Commit.
- [ ] M1 agenda: firmas (4.4) + todos los consumidores de web y bot + `lib/services.ts` con `tenantId` + API
      `appointments`/`slots` con `getTenantContext()`. Tests existentes adaptados + negativos (10.2). Typecheck web y
      bot. Commit.
- [ ] M2 pacientes y clínica: ídem, incluyendo el PDF del informe y la foto de diario del panel. Commit (si es muy
      grande: un commit por archivo de dominio, cada uno compilando).
- [ ] M3 planes: ídem; `tenantId` obligatorio en caminos de plan de `weeklyMenu`/`planSections`; scripts CLI pasan
      `LEGACY_TENANT_ID`. IA de planes: `getPlan(ctx, planId)` antes de llamar a DeepSeek; `null` → rechazo sin
      llamada (test). Commit.
- [ ] Portal: los call sites del portal que rompan por firmas nuevas pasan `{ tenantId: patient.tenantId }`
      (rechazando si es `null`); el token sigue igual hasta 025c. Commit.
- [ ] `bash packages/db/scripts/test-tenant-isolation.sh` (10.3) cubre M1–M3. Commit del probe.
- [ ] Verificación 7.2.V. PR `025b-1`.

**Checklist 025b-2** (rama `feat/HU-025b2-pagos-ajustes-asistente-equipo`)

- [ ] M4, M5, M6, M7, M8, M9 en ese orden, un commit por módulo, cada uno con typecheck web + bot y sus tests.
      M6 incluye el sidebar con el nombre de la profesional del tenant y el QR de WhatsApp solo para la fila
      `BotStatus` del tenant de la sesión; el bot crea `BotStatus` con `tenantId`.
- [ ] M10 recetas y plantillas a `requireTenantContext(mode)`; borrar `private-content-access.ts`. Commit.
- [ ] M11 Equipo: core `canRemoveMember` + tests; db `listTenantMembers`/`removeTenantMember`; web pestaña, sección y
      acción; textos 9.2; tests (OWNER ve, STAFF no ve, quitarse, último OWNER, target de otro tenant). Commit.
- [ ] M12: `guard-coverage.test.ts`; middleware deja pasar `next-action`; `useActionToast` maneja `reauth`. Commit.
- [ ] Extender `test-tenant-isolation.sh` a M4–M8. Commit.
- [ ] Logs del asistente y de la IA de planes: sin prompt ni contenido (D11). Commit si hubo cambios.
- [ ] Verificación 7.2.V. PR `025b-2`.

**7.2.V Verificación**

```bash
npm run db:generate
npm run typecheck --workspace apps/web && npm run typecheck --workspace apps/bot && npm run typecheck
npm run test
bash packages/db/scripts/test-tenant-access.sh
bash packages/db/scripts/test-tenant-isolation.sh
npm run test:confirm-flow --workspace apps/bot     # simulado, sin WhatsApp; limpia por ids
grep -rn "resolveLegacy\|legacySchedulingScope" apps/web/src | grep -v "\.test\." # 025b-2: 0 (salvo auth.ts → calendario hasta HU-028)
./ops/harness/verify.sh
```

**Hecho 025b** cuando: cada fila del Gherkin "Aislamiento de recursos…" tiene un test negativo (mock en web y probe
en Postgres descartable para las funciones de dominio), los listados de 2.x solo traen filas del tenant, `/api/appointments`
y `/api/slots` solo la agenda del tenant, el asistente no consulta sin `tenantId` (test que inspecciona los `where`
de las tools), ajustes/firma/logo leen la profesional del tenant, el test de guarda pasa y Equipo cumple 7.2.1.

### 7.3 Entrega 025c · Portal, descargas del portal e IA del bot

> **Nota (2026-11-27):** la parte de la IA del bot (`runBotAiTool` con `tenantId` y la profesional del consultorio
> en `handleIncoming`) la hace la **028c** (decisión D-c1 b, `Refactorizaciones/integraciones-por-consultorio.md` §C0).
> Lo demás de 025c y la 025d siguen pendientes en el issue #91 (HU-033).

Sin migración. Toca db, web y bot.

**Archivos:** `packages/db/domain/patientAuth.ts` (+ `patientAuth.test.ts` nuevo), `domain/botAi.ts` (+ test),
`domain/recipes.ts` (`patientCanSeeRecipePhoto` con tenant), `domain/availability.ts` (borrar `getProfessional`),
`apps/web/src/lib/patient-session.ts`, `app/(portal)/portal/login/route.ts`, `portal/page.tsx`, `portal/plan/page.tsx`,
`portal/plan/pdf/route.ts`, `portal/diario/page.tsx`, `portal/diario/actions.ts` (+ test), `portal/diario/photo/[id]/route.ts`,
`portal/evolucion/page.tsx`, `portal/recetas/fotos/[photoId]/route.ts` (+ test), `app/(portal)/layout.tsx`,
`lib/shell.ts` (funciones del portal reciben `tenantId`), `lib/professional.ts`, `apps/bot/src/conversation.ts`,
`apps/bot/src/booking.ts`, `apps/bot/scripts/test-bot-ai-questions.ts` y demás scripts que llamen `getProfessional`,
`packages/db/scripts/test-*.ts` que lo llamen, `packages/db/domain/professionalSelect.test.ts`/`signature-privacy.test.ts`.

**Reglas**

- Token v2 (4.7). Un token v1 o una cookie `patient_session` anterior → `null` → la pantalla actual de
  `/portal?error=invalid` / "sin link" (texto sin cambios, D9b).
- `getPortalSession()` exige `patient.tenantId === claims.tenantId` (con `findFirst({ where: { id, tenantId } })`).
  **No** filtra `archivedAt` (D9c): un paciente archivado sigue entrando. Test explícito.
- Todas las consultas del portal llevan `patientId: session.patient.id` **y** el tenant (`tenantId` directo o
  `patient: { tenantId }`). Diario: `diaryEntry.findFirst({ where: { id, patientId, patient: { tenantId } } })`.
  Plan PDF: plan `ACTIVE` del paciente y del tenant. Receta: `patientCanSeeRecipePhoto(t, patientId, photoId)` exige
  `recipe.tenantId = t.tenantId` y plan activo del paciente con esa receta.
- Portal sin sesión (pantalla de acceso del layout): usa el consultorio de la instalación de WhatsApp,
  `LEGACY_TENANT_ID`, para el nombre y el link de WhatsApp (el único número que manda links hoy; HU-027 lo cambia).
  Con sesión: el tenant de la sesión.
- Bot, opción 4: `createPatientToken({ patientId: patient.id, tenantId: patient.tenantId }, 15)`; si
  `patient.tenantId` es `null`, no manda link y responde el mismo texto de error genérico que ya usa el bot ante una
  falla (sin mensaje nuevo).
- IA del bot: `runBotAiTool({ name, input, patientId, tenantId, now, afterHours })`; `servicios` y `disponibilidad`
  con `service.findMany({ where: { tenantId, active: true } })` y `getAvailableSlotsForService(t, …)`; `mis_turnos`
  con `appointment.findMany({ where: { patientId, tenantId, … } })`; `datos_consultorio` con
  `getTenantProfessional(tenantId)`. El `tenantId` lo pone el bot desde el paciente de la conversación, nunca la IA.
- `conversation.ts`/`booking.ts`: `getProfessional()` → `getTenantProfessional((await getConversationTenant()).tenantId)`.
- Último paso: borrar `getProfessional` de `availability.ts`; `grep -rn "getProfessional()" apps packages` → 0;
  `ENABLED_TENANT_IDS` se elimina (fin del candado legacy) y `decideTenantAccess` se llama sin `enabledTenantIds`.

**Checklist 025c** (rama `feat/HU-025c-portal-ia-bot`)

- [ ] db: `patientAuth.ts` v2 + `patientAuth.test.ts` (válido, vencido, v1 rechazado, patientId cambiado, tenantId
      cambiado, firma cambiada, ids con punto o fuera de regex, `AUTH_SECRET` ausente). Consumidores de web y bot en
      el mismo commit (firma nueva). Typecheck web + bot. Commit.
- [ ] web: `patient-session.ts` (`getPortalSession`), `portal/login/route.ts`; tests (cookie vieja, paciente de otro
      tenant, paciente archivado entra). Commit.
- [ ] web: páginas y descargas del portal con tenant; tests de las tres descargas con id de otro paciente y de otro
      tenant → 404 igual que inexistente. Commit.
- [ ] web: `layout.tsx` del portal y `lib/shell.ts` (portal). Commit.
- [ ] db + bot: `runBotAiTool` con `tenantId`; tests de `botAi.test.ts` con dos tenants (servicios y turnos de B no
      aparecen). `conversation.ts`, `booking.ts`. Commit.
- [ ] Borrar `getProfessional`; ajustar scripts y tests que lo usaban. Commit.
- [ ] Quitar `ENABLED_TENANT_IDS` (fin del candado) + test: un tenant B sintético con membresía obtiene su propio
      contexto y no ve A. Commit.
- [ ] Logs de portal y `runBotAiTool`: solo códigos (D11). Commit si hubo cambios.
- [ ] Verificación 7.3.V. PR `025c`.

**7.3.V Verificación**

```bash
npm run typecheck --workspace apps/web && npm run typecheck --workspace apps/bot && npm run typecheck
npm run test
bash packages/db/scripts/test-tenant-isolation.sh
npm run test:confirm-flow --workspace apps/bot
npm run test:bot-ai --workspace apps/bot          # simulado, sin WhatsApp ni proveedor real; limpia por ids
grep -rn "getProfessional()" apps packages        # 0
./ops/harness/verify.sh
```

**Hecho 025c** cuando: todos los escenarios del Gherkin "Portal del paciente atado a un consultorio" y "La IA del bot
usa el consultorio de la conversación" tienen test; el paciente archivado entra; ya no hay `getProfessional` ni
candado legacy. **Deploy:** al publicar 025c, toda cookie del portal existente deja de valer (aceptado, D9b; en
producción no hay pacientes).

### 7.4 Entrega 025d · Acceso de plataforma, soporte y auditoría

**Workspaces:** core, db, web. **Migración:** `platform_support_access` (5.2).

**Archivos:** `packages/core/src/tenant-access.ts` (`supportGrantWindow`, `auditPath`, `SUPPORT_BLOCKED_PATH_PREFIXES`,
textos de soporte) + tests; `schema.prisma`, `migrations/<ts>_platform_support_access/migration.sql`;
`packages/db/domain/tenantAccess.ts` (`loadAccessFacts` con operador y permisos; `recordSupportRequest`;
`listActiveSupportGrants`); `packages/db/scripts/tenant-access.ts` (subcomandos 025d); `scripts/test-tenant-access.sh`
(+ casos de soporte y triggers); `apps/web/src/middleware.ts` (modo soporte y auditoría); `lib/tenant-context.ts`
(`"write"` y `blocked_in_support`); `(panel)/layout.tsx` (`SupportModeBanner`); `components/shell/support-mode-banner.tsx`
(nuevo); `ajustes/team-section.tsx` (fila de soporte); `inicio` (`NoAccessScreen` razón `support_no_grant`).

**Decisiones propuestas** (todas **[CONFIRMAR]**, sección 11):

- Vencimiento: 24 h por defecto, máximo 7 días (CHECK en la base), renovable solo creando otro permiso por script.
- Solo lectura por defecto; `READ_WRITE` explícito por permiso. Incluso en `READ_WRITE`, el soporte no puede: ver el
  QR ni vincular WhatsApp (`/ajustes/whatsapp`), conectar/desconectar Mercado Pago, ver la firma (`/api/professional/signature`),
  ni usar Equipo. El refresh token de Google nunca se guarda para un operador (D10 ya lo exige por membresía).
- Consentimiento: sin flujo de consentimiento en la app; transparencia por la fila "Soporte de Arzium" en Equipo.
- Un usuario con membresía no puede ser operador (el script lo rechaza) para que la precedencia de
  `decideTenantAccess` no sea ambigua.
- Auditoría: una fila por request de servidor en modo soporte (página, server action o API), con método, pathname,
  tipo y resultado. Sin cuerpo, sin query, sin headers. Consulta por script (`audit`); sin UI de auditoría en esta HU.

**Checklist 025d** (rama `feat/HU-025d-soporte-plataforma`)

- [ ] core: `supportGrantWindow`, `auditPath`, `SUPPORT_BLOCKED_PATH_PREFIXES`, precedencia de soporte en
      `decideTenantAccess`; tests. Commit.
- [ ] db: schema 5.2 → `pg_dump` → `--create-only --name platform_support_access` → agregar a mano el SQL de CHECK y
      triggers de 5.2 → revisar → aplicar → `db:generate`. Commit.
- [ ] db: `loadAccessFacts` lee `PlatformOperator` (no revocado) y `SupportGrant` vigentes (take 2);
      `recordSupportRequest`; `listActiveSupportGrants`; tests con mocks. Commit.
- [ ] db: subcomandos 025d del script; probe con: operador sin permiso → `support_no_grant`; permiso vigente → acceso;
      vencido/revocado → sin acceso; `UPDATE`/`DELETE`/`TRUNCATE` de auditoría → `42501`; `UPDATE` de un permiso que
      no sea revocar → `42501`; ventana de 8 días → CHECK; operador con membresía → rechazo. Commit.
- [ ] web: middleware con modo soporte (6.3 paso 2) + tests (lectura permitida y auditada; server action en
      `READ_ONLY` → 403 y fila `DENIED_READ_ONLY`; `/ajustes/whatsapp` → bloqueado y auditado; la fila guardada no
      contiene query). `requireTenantContext("write")` rechaza `READ_ONLY`. Commit.
- [ ] web: `SupportModeBanner` en el layout; fila de soporte en Equipo; `NoAccessScreen` para `support_no_grant`. Tests
      de render. Commit.
- [ ] Verificación 7.4.V. PR `025d`.

**7.4.V Verificación**

```bash
npm run db:generate
npm run typecheck --workspace apps/web && npm run typecheck --workspace apps/bot && npm run typecheck
npm run test
npm run build --workspace apps/web
bash packages/db/scripts/test-tenant-access.sh
bash packages/db/scripts/test-tenant-isolation.sh
./ops/harness/verify.sh
```

**Hecho 025d** cuando: los dos escenarios del Gherkin "Acceso de plataforma" tienen test; un operador sin permiso no
ve datos; con permiso, cada request queda auditada sin datos clínicos ni tokens; la auditoría no se puede modificar
desde SQL de la aplicación; la franja se ve en todas las páginas del panel; y la fase 5 de 6.4 está documentada en
`deploy/README.md`.

---

## 8. Rutas, server actions y API

### 8.1 Rutas que cambian

| Ruta | Entrega | Cambio |
|---|---|---|
| `/inicio`, `/login` | 025a-2 | Tres estados: sin sesión (login), con sesión sin acceso (`NoAccessScreen` con razón), con acceso (redirect `/`). |
| Middleware (todo el panel y `/api/*` salvo exclusiones) | 025a-2, 025b-2, 025d | 6.3 |
| `/api/mercadopago/oauth/callback` | 025a-2, 025b-2 | contexto en lugar de lista; tenant del contexto |
| `/api/appointments`, `/api/slots` | 025b-1 | agenda del tenant |
| `/api/diary/[entryId]/photo`, `…/informe/pdf` | 025b-1 | recurso del tenant o 404 |
| `/api/professional/logo`, `/api/professional/signature` | 025b-2 | profesional del tenant; firma vedada en soporte (025d) |
| `/api/recetas/fotos/[photoId]`, `/api/recetas/importacion/[imageId]` | 025b-2 | `requireTenantContext("read")` |
| `/ajustes?tab=equipo` | 025b-2 | nueva pestaña (solo OWNER) |
| `/portal/login`, `/portal/*` | 025c | token v2, sesión con tenant |
| `/api/webhooks/mercadopago` | — | sin cambios (pública, firmada; el tenant sale del pago) |

### 8.2 Server actions (archivos `app/(panel)/**/actions.ts` y afines)

Todas, en 025b, empiezan con `requireTenantContext("read"|"write")` (o `requireOwnerContext()` en Equipo): `actions.ts`,
`ajustes/actions.ts`, `ajustes/signature-actions.ts`, `alimentos/actions.ts`, `asistente/actions.ts`, `avisos/actions.ts`,
`disponibilidad/actions.ts`, `food-measure-actions.ts`, `mensajes/actions.ts`, `pacientes/[id]/clinical-actions.ts`,
`consultation-actions.ts`, `isak-actions.ts`, `planes/[planId]/actions.ts`, `planes/[planId]/ai-actions.ts`,
`planes/actions.ts`, `prescription-actions.ts`, `report-actions.ts`, `pacientes/actions.ts`, `pagos/actions.ts`,
`plan-section-actions.ts`, `plantillas/actions.ts`, `plantillas/import-actions.ts`, `recetas/actions.ts`,
`recetas/revisar/actions.ts`, `recipe-picker-actions.ts`, `servicios/actions.ts`, `weekly-menu-actions.ts`,
`appointment-cancel.ts`, `recetas/recipe-save.ts`, y la nueva `ajustes/team-actions.ts`. Nueva acción:
`removeTeamMemberAction(prevState, formData): Promise<{ ok: true } | { error: string; reauth?: true }>`.

---

## 9. UX (skill `ui`)

Design system vigente del panel (rediseño Apple, HU-017): `components/ui.tsx` (`Card`, `PageHeader`, `Button`,
`ButtonLink`, `Badge`, `Alert`, `EmptyState`), `components/grouped-list.tsx` (`GroupedList`, `GroupedListRow`),
`components/confirm.tsx` (`ConfirmProvider` + confirmación), `components/submit-button.tsx`, `components/brand.tsx`
(`Wordmark`, `GoogleG`), `components/public-page.tsx` (`PublicFooterLinks`), tokens `bg-grouped`, `bg-card`,
`shadow-card`, `text-title-1`, `text-body`, `text-footnote`, `bg-warning-muted`/`text-warning`, `lib/notify.ts`.
Textos en `packages/core` (`ACCESS_TEXT`, `TEAM_TEXT`, `SUPPORT_TEXT`), no sueltos en los componentes.

### 9.1 `/inicio` · `NoAccessScreen` (025a-2)

**Objetivo (HU 4.1):** que quien no tiene acceso entienda por qué, con qué cuenta entró y qué hacer, sin revelar
otros consultorios.

- **Estructura:** misma cáscara que `LoginScreen` (`main` `grid min-h-[100dvh] place-items-center bg-grouped`;
  `Wordmark` arriba; tarjeta `rounded-xl bg-card p-8 shadow-card` con la animación `animate-rise-in`;
  `PublicFooterLinks` abajo). Se reutiliza extrayendo la cáscara a `AuthCard` dentro de `login-screen.tsx`.
- **Contenido por razón:**
  - `no_membership`, `tenant_not_enabled`, `unlinked` (con sesión): título **"Tu cuenta no tiene acceso a ningún
    consultorio."**; cuerpo "Iniciaste sesión como `<email>`. Si trabajás en un consultorio que usa Numa, pedile a la
    responsable que te dé acceso." + (solo `no_membership`) "Ya registramos tu pedido; vas a poder entrar cuando te den
    acceso."
  - `identity_conflict` (se muestra como `unlinked`): mismo título y cuerpo, **sin** la línea de pedido registrado.
  - `multiple_memberships`: título **"Tu cuenta tiene acceso a más de un consultorio."**; cuerpo "Por ahora Numa no
    permite elegir. Escribinos a soporte para resolverlo."
  - `support_no_grant` (025d): título **"Tu cuenta de soporte no tiene un acceso vigente."**; cuerpo "Pedí un permiso de
    soporte para el consultorio que tenés que revisar."
- **Acciones:** `SubmitButton` secundario **"Usar otra cuenta"** (server action: `signOut({ redirect: false })` y luego
  `signIn("google", { redirectTo: "/" }, { prompt: "select_account consent" })`); `ButtonLink` plano **"Reintentar"**
  a `/` (después de que le den acceso, sin volver a loguearse).
- **`LoginScreen`:** cambia la nota inferior "Si no podés entrar, pedí que sumen tu correo a la lista de acceso." por
  **"El acceso a cada consultorio lo da su responsable."** y el subtítulo "Usá tu cuenta de Google autorizada…" por
  **"Entrá con tu cuenta de Google."**
- Accesibilidad: el título es `h1`; el email va en `<strong>` con `break-all`; nada depende del color.

### 9.2 Ajustes → Equipo (025b-2)

**Objetivo (HU 4.2, D4):** que la responsable vea quién entra a su consultorio y pueda cortar un acceso sin ayuda.

- **Estructura:** nueva entrada del índice de `AjustesTabs` (`value: "equipo"`, label **"Equipo"**, ícono `Users` de
  lucide), solo para OWNER. Panel con `SectionLabel` "Personas con acceso" y un `GroupedList`.
- **Fila por miembro (`GroupedListRow`):** email (texto principal, `truncate`), debajo "Desde el dd/MM/aaaa"
  (`createdAt`, zona de la profesional); a la derecha `Badge` de rol (**"Responsable"** para OWNER, **"Equipo"** para
  STAFF) y, en la fila propia, `Badge` neutro **"Vos"** en lugar del botón. En las demás, `Button` `variant="ghost"`
  destructivo **"Quitar acceso"**.
- **Confirmación (`ConfirmProvider`, tono destructivo):** título "¿Quitar el acceso de `<email>`?"; cuerpo "Va a dejar de
  poder entrar al consultorio desde su próxima acción. Para volver a darle acceso, escribinos a soporte."; botones
  "Quitar acceso" / "Cancelar".
- **Resultado:** `useActionToast`: éxito "Se quitó el acceso de `<email>`." y la fila desaparece (`revalidatePath`);
  error genérico existente. Mensajes específicos: `self` → "No podés quitarte tu propio acceso. Si necesitás dejar el
  consultorio, escribinos a soporte."; `last_owner` → "El consultorio necesita al menos una responsable."
- **Pie de la sección:** texto `text-footnote text-muted-foreground`: "Para sumar a alguien, escribinos a soporte."
- **025d:** si hay permisos de soporte vigentes, segundo `GroupedList` "Soporte de Arzium" con una fila: "Acceso de
  solo lectura hasta el dd/MM HH:mm" (o "con permiso para editar"), sin acciones [CONFIRMAR C4].
- **Vacío:** no puede estar vacía (siempre está la OWNER que mira).
- Celular: igual que las otras secciones (lista → sección con "‹ Ajustes"); resumen de la lista: "N personas".

### 9.3 Franja de modo soporte (025d)

**Objetivo (HU 4.5):** que nadie use el modo soporte sin darse cuenta y que quede claro que se registra.

- **Componente:** `SupportModeBanner` en `components/shell/`, renderizado por `(panel)/layout.tsx` cuando
  `ctx.access.kind === "support"`, **arriba de todo** (antes de `AppSidebar`), `sticky top-0 z-40`, ancho completo,
  `bg-warning-muted text-warning`, alto mínimo 40 px, `role="status"`, ícono `ShieldAlert` + texto. En celular, por
  encima de `MobileTopbar`.
- **Texto:** **"Estás viendo el consultorio `<nombre de la profesional>` como soporte de Arzium. Cada acción queda
  registrada."** + "Solo lectura · vence el dd/MM HH:mm" (o "Con permiso para editar · vence …").
- No se puede cerrar. Con `more-contrast`, borde `border-warning`.
- Intento de escritura en solo lectura: toast de error "En modo soporte de solo lectura no se pueden hacer cambios."
  (acción) o redirect a `/` con el mismo aviso como `Alert` `warning` (navegación a una sección bloqueada).

### 9.4 Panel con membresía revocada (025a-2/025b-2)

- Navegación: redirect a `/inicio` → `NoAccessScreen`.
- Server action: el error genérico existente ("No se pudo guardar") y `router.replace("/inicio")` (por `reauth`).
- Id de otro consultorio: la `not-found.tsx` del panel que ya existe.

---

## 10. Tests

### 10.1 `packages/core` (vitest, sin base ni red)

`tenant-access.test.ts`:
- `decideTenantAccess`: `null` → `unlinked`; `linked: false` → `unlinked`; 0 membresías sin operador → `no_membership`;
  1 membresía OWNER/STAFF → `member`; 2 → `multiple_memberships`; 1 membresía en tenant fuera de `enabledTenantIds` →
  `tenant_not_enabled`; sin `enabledTenantIds` → cualquier tenant ok; (025d) operador sin permisos → `support_no_grant`;
  operador con 1 permiso → `support` con su modo; 2 permisos → `support_multiple_grants`; membresía + permiso →
  `member` (el permiso se ignora); permiso de un tenant fuera de `enabledTenantIds` → `tenant_not_enabled`.
- `canonicalEmail`: `" Ana@Example.COM "` → `"ana@example.com"`.
- `isMutatingPanelRequest`: GET página → false; HEAD → false; POST con `isServerAction` → true; GET con
  `isServerAction` → true; PUT/DELETE en `/api/*` → true; GET `/api/mercadopago/oauth/callback` → true; GET
  `/api/slots` → false.
- `canRemoveMember`: actor STAFF → `not_owner`; actor soporte → `not_owner`; target null → `not_member`; target = actor
  → `self`; target OWNER con `ownerCount = 1` → `last_owner`; target OWNER con 2 → ok; target STAFF → ok.
- `supportGrantWindow`: 24 → ok; 168 → ok; 0, -1, 169, 1.5, NaN → `invalid_hours`.
- `auditPath`: `/pacientes/abc?token=x#y` → `/pacientes/abc`; URL absoluta → solo pathname; >300 → truncado.

### 10.2 `apps/web` y `packages/db` con mocks (vitest)

- `tenant-context.test.ts`: sin sesión; `session.userId` ausente; membresía revocada entre dos llamadas (sin cache entre
  requests); dos membresías; tenant fuera del candado; agenda principal ausente → sin contexto; `requireTenantContext("write")`
  con soporte `READ_ONLY` → `read_only`; `requireOwnerContext` con STAFF → `owner_only`. **El contexto nunca lee
  `cookies()`/`headers()` propios ni parámetros** (test que mockea un header `x-tenant-id` y verifica que se ignora).
- `middleware.test.ts`: casos de 6.3.
- `auth.test.ts`: 7.1.
- Cada módulo de 025b: test de una acción y una página por módulo con dos tenants simulados: el dominio recibe
  `ctx.tenantId` aunque el form mande `tenantId`/`agendaId`/`professionalId` de B; un id de B → mismo resultado que
  inexistente.
- `assistant-tools.test.ts`: cada tool llama a Prisma con `tenantId` del contexto en el `where`; el prompt armado no
  contiene el nombre de un paciente de B (mock).
- `ai-actions.test.ts`: plan de B → rechazo sin llamar al cliente DeepSeek (mock no invocado).
- `team-actions.test.ts`: 7.2.1.
- `guard-coverage.test.ts` (025b-2): lee con `fs` los archivos de `app/(panel)/**` y `app/api/**` (salvo
  `api/auth`, `api/webhooks`) y falla si: (a) un archivo `"use server"` exporta una función cuyo cuerpo no contiene
  `requireTenantContext(`, `requireOwnerContext(` o `requirePageContext(`; (b) un `route.ts` no contiene
  `getTenantContext(`/`requireTenantContext(`; (c) aparece `resolveLegacy`, `legacySchedulingScope`,
  `getProfessional(` o `where: { id: 1 }` en `app/(panel)`, `app/api` o `lib/` (salvo `auth.ts` para el calendario
  legacy hasta HU-028).
- `patientAuth.test.ts`, `botAi.test.ts`, portal: 7.3.

### 10.3 Postgres descartable (patrón de los `test-*-ownership.sh` de HU-024)

Contenedor `postgres:16-alpine` sin `--pull`, tmpfs, puerto `127.0.0.1` aleatorio, password aleatoria, copia del schema
fuera del repo, sin cargar `.env`, `DATABASE_URL` verificada con regex antes de cualquier escritura, limpieza del
contenedor con `trap`. Usa el contexto de Docker del entorno (`docker` a secas o `DOCKER_HOST` si está definido), **no**
el socket fijo de Leo. Aplica las migraciones con `prisma migrate deploy` desde cero y también sobre un fixture previo
a la migración nueva (upgrade).

- `test-tenant-access.sh` (025a, ampliado en 025d): upgrade con `User` existente preserva filas y pone `createdAt`;
  `registerGoogleIdentity` (4 casos de 6.2, incluido el concurrente); `grant`/`revoke`/`forget-pending`/`pending`/`members`
  con dry-run sin cambios y `--apply`; rechazo por segunda membresía en otro tenant y por último OWNER; ensayo completo
  de 6.4 con `legacy-tenant` y dos identidades sintéticas (una del padrón entra, otra no). 025d: los casos de 7.4.
- `test-tenant-isolation.sh` (025b, ampliado en 025c): crea los tenants sintéticos A y B con su profesional, agenda
  principal, paciente, turno, ficha, consulta, evolución, ISAK, informe, plan con comida e ítem, pago, consulta de
  `/mensajes`, foto de diario y receta. Para cada función de 4.4 llamada con `{ tenantId: A }` y un id de B: lectura →
  `null`/vacío; escritura → error; y una foto del estado (`jsonb_agg` de las tablas tocadas, como el `snapshot` de
  `legacy-memberships.test.ts`) idéntica antes y después. Listados con A → solo filas de A. 025c: token del portal de A
  con paciente de B → sin sesión.

### 10.4 Simulaciones del bot (base de desarrollo, sin WhatsApp)

`npm run test:confirm-flow --workspace apps/bot` y `npm run test:bot-ai --workspace apps/bot` después de 025b y 025c.
Crean sus datos y los borran por id; borran por id las filas de `OutboundMessage` que encolen. Si alguno necesita
cambios por las firmas nuevas, se adapta en el mismo commit del módulo.

---

## 11. Decisiones para confirmar con el usuario

| Id | Propuesta (default con el que se implementa si no se dice otra cosa) | Alternativa |
|---|---|---|
| **C1** | Permiso de soporte: 24 h por defecto, máximo 7 días (CHECK en la base); renovar = otro permiso por script. | Máximo 24 h, o sin máximo. |
| **C2** | Soporte en solo lectura por defecto; `READ_WRITE` explícito por permiso. Nunca, ni en `READ_WRITE`: WhatsApp (QR y vínculo), Mercado Pago (conectar/desconectar), firma, Equipo. | Siempre solo lectura; o `READ_WRITE` por defecto. |
| **C3** | Entre el deploy de 025a-2 y el de 025d, Joel no entra al panel de producción (opera por SSH y scripts). | Publicar 025a-2 a `main` recién junto con 025d (más tiempo con `ALLOWED_EMAILS` en producción), o una membresía `STAFF` temporal para Joel que se revoca en la fase 5 (contradice D1). |
| **C4** | Equipo muestra a la OWNER los permisos de soporte vigentes (solo informativo; no los puede revocar desde la UI). | No mostrarlos; o permitir que la OWNER los revoque. |
| **C5** | Una OWNER puede quitar el acceso a otra OWNER (nunca a sí misma ni a la última). | Solo puede quitar `STAFF`. |
| **C6** | Un operador de plataforma no puede tener membresía en ningún consultorio. | Permitirlo con precedencia de la membresía. |
| **C7** | Las identidades pendientes no se purgan solas; el operador usa `forget-pending`. | Purga automática a los N días (sería un cron nuevo). |

---

**Confirmadas por el usuario el 2026-11-21:** C1 a C7 tal como están en la tabla.

---

## 12. RLS en Postgres (D5: solo análisis, sin implementar)

**Cómo sería.** `ALTER TABLE … ENABLE ROW LEVEL SECURITY` + `FORCE ROW LEVEL SECURITY` en las tablas con `tenantId`
(directo o por join), con políticas `USING ("tenantId" = current_setting('app.tenant_id', true))`, y la aplicación
conectada con un rol sin `BYPASSRLS` que no sea dueño de las tablas.

**Por qué no en esta HU:**

1. **Pool de conexiones de Prisma.** `set_config('app.tenant_id', …, false)` en una conexión del pool se filtra a la
   request siguiente. Habría que usar `set_config(…, true)` (local a la transacción) y envolver **cada** operación en
   `prisma.$transaction` con el `set_config` primero, por ejemplo con una extensión de cliente (`$extends` con
   `query.$allOperations`). Eso cambia la semántica de las ~200 consultas (todas pasan a ser transacciones
   interactivas), suma una ida y vuelta por operación y choca con las transacciones que ya usan `isolationLevel`
   (`legacy-memberships.ts`, recetas).
2. **El bot y los crons recorren varios tenants** (outbox, recordatorios, pagos, sync de calendario). Necesitarían un
   rol con `BYPASSRLS` o un `set_config` por tenant en cada vuelta; con un rol que saltea RLS, la protección del bot
   vuelve a depender del código.
3. **Objetos de HU-024 con `SECURITY DEFINER`** (`recipe_reference_guard`) y triggers que consultan tablas de varios
   tenants a propósito: habría que revisar que sigan viendo lo que necesitan bajo RLS y que la función no se convierta
   en un bypass.
4. **Migraciones y scripts** (`migrate deploy`, `sara2:load`, importadores, `tenant-access`) corren con el dueño de las
   tablas o necesitan un rol aparte.
5. **Tablas con `tenantId` nullable** (expansión de HU-024): la política tendría que decidir qué hacer con `NULL`
   (hoy "indeterminado"), lo que obliga a cerrar antes el endurecimiento a `NOT NULL`.
6. **Catálogo compartido** (`Food` SARA2 visible para todos, preferencias por tenant): políticas distintas por origen.

**Qué deja HU-025 para que RLS sea viable en HU-031:** el tenant se resuelve en un único lugar por proceso
(`getTenantContext()` en web, `getConversationTenant()` en bot), y toda función de dominio recibe `t: TenantRef`; ese
es exactamente el punto donde iría el `set_config` local. Recomendación para HU-031: prueba de concepto en `Patient`
con una extensión `$extends` en una base descartable, medir latencia, y decidir con el endurecimiento a `NOT NULL`.

---

## 13. Riesgos

| # | Riesgo | Mitigación |
|---|---|---|
| R1 | Daiana queda afuera entre el deploy y la carga. | Dos deploys en 025a (6.4): la identidad se registra mientras la lista sigue vigente; la membresía se carga antes de retirar la lista. Rollback a 025a-1 con `ALLOWED_EMAILS` aún en el `.env` del VPS. |
| R2 | Middleware Node con Prisma no compila en el build standalone. | Verificación explícita en 025a-2 y opción B documentada (6.3). |
| R3 | Una server action o ruta queda sin chequeo de contexto. | Middleware como puerta central + `guard-coverage.test.ts` que falla el CI. |
| R4 | Fuga por funciones de dominio sin filtro (P5). | Regla única `t: TenantRef` obligatorio + probe de aislamiento con foto antes/después. |
| R5 | El QR de WhatsApp de la sesión original visible para otro consultorio o para soporte. | M6: `BotStatus` por `tenantId`; `/ajustes/whatsapp` vedado en soporte (C2). |
| R6 | Cualquiera con una cuenta de Google crea filas `User` pendientes (spam). | Una fila por `sub` (único), sin acceso; `pending` + `forget-pending`; purga automática queda en C7/HU-031. |
| R7 | Romper el bot al cambiar firmas de dominio. | `getConversationTenant()` como único punto; typecheck de bot en cada commit; simulaciones del bot. |
| R8 | Cookies del portal y JWT del panel viejos dejan de valer. | Aceptado (D9b; Daiana vuelve a entrar en la fase 2). En producción no hay pacientes. |
| R9 | Drift o pérdida de objetos SQL de HU-024 al generar migraciones. | Revisar el SQL de `--create-only`; si toca objetos de HU-024 → `blocked`. Respaldo `pg_dump` previo. |
| R10 | La base de desarrollo de Joel no tiene HU-024 aplicada (P11). | Prerrequisito 2.1 con `migrate status` y `pg_dump` antes de `migrate deploy`. |
| R11 | Auditoría con volumen alto (una fila por request de soporte, incluidos prefetch RSC). | Aceptado para el piloto; índices por tenant y fecha; HU-031 decide retención. |
| R12 | Concurrencia al quitar OWNER. | `FOR UPDATE` sobre las membresías del tenant + `canRemoveMember` dentro de la transacción. |
| R13 | El email de Google cambia y ya no coincide con `User.email`. | El vínculo es por `sub`; el email no se actualiza solo (evita choques de unicidad). Visible en `pending`/`members`. |
| R14 | Dos HU con migración en `implementando` a la vez. | 025a-1 y 025d son las únicas con migración; coordinar por la label `migración` del issue #68. |
| R15 | `prompt: "consent"` del proveedor y "Usar otra cuenta". | Solo el botón de 9.1 agrega `select_account`; el login normal no cambia (refresh token del calendario intacto). |

---

## 14. Fuera de alcance (pasa a otras HU)

- **HU-026:** registro de consultorios, alta de tenant y `OWNER` desde la web, invitaciones, alta de miembros desde
  Equipo, onboarding; retiro de `legacy-memberships.ts` si ya no hace falta.
- **HU-027:** WhatsApp multi-sesión; `getConversationTenant()` por conexión receptora; colas, crons y `BotStatus` por
  tenant; retirar la fachada `legacySchedulingScope.ts` y los nombres `Legacy*` de `conversationState.ts`; portal sin
  sesión con el tenant del número.
- **HU-028:** token de Google Calendar por tenant (retirar `GOOGLE_CALENDAR_OWNER_EMAIL` y el uso de
  `resolveLegacyCalendarScope` en `auth.ts`), Mercado Pago por tenant (state atado a `userId`/tenant), cuotas de
  DeepSeek por consultorio.
- **HU-029/HU-030:** suscripción, licencia, suspensión y su gate en el login.
- **HU-031:** matriz completa de QA multi-tenant, observabilidad, revisión del resto de los logs, retención de la
  auditoría, UI de auditoría, RLS (sección 12), endurecimiento de `tenantId` a `NOT NULL` y retiro de índices de
  compatibilidad de HU-024.
- También fuera: selector de consultorio (D7), "cerrar todas las sesiones" (D8), revocar el portal antes de 30 días
  (D9a), login sin Google, varias agendas o profesionales por consultorio, mensajes nuevos del bot.

## 15. Mensajes del bot

**Sin mensajes nuevos** (HU 4.4). La opción 4 manda el mismo texto con el link; cambia solo el contenido del token.
Si el paciente de la conversación no tiene dueño, se responde con el texto de error genérico que el bot ya usa ante
una falla. La IA del bot responde igual, con datos del consultorio de la conversación.
