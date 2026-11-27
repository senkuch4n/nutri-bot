// HU-029b (SDD §B.5.3–§B.5.6 y anexo HU-026): suscripción del consultorio a Arzium con Mercado Pago.
// Lo usan web (pantalla, acciones, webhook, gate de onboarding) y bot (conciliación).
//
// Reglas:
// - El estado sale SIEMPRE de consultar la preapproval en MP con el token de Arzium (gateway); la vuelta del
//   checkout y el cuerpo del webhook solo dicen qué consultar.
// - MP ignora X-Idempotency-Key (S4): un solo proceso crea (lease en la fila bajo advisory lock), se busca
//   por external_reference antes de cada POST y un error ambiguo del POST nunca se reintenta a ciegas.
// - checkoutPayerEmail (email de MP de la OWNER) solo vive mientras el checkout está sin autorizar y nunca
//   va a SubscriptionEvent ni a logs. Los console.* solo reciben códigos e ids internos.
// - Nunca toca Payment, Appointment ni MercadoPagoAccount.
import { randomBytes } from "node:crypto";
import {
  checkPreapprovalAgainstSubscription,
  classifyPreapprovalCreateError,
  decideSubscriptionStatus,
  formatPlanPrice,
  formatTrialLength,
  isCheckoutStale,
  isTrialEligible,
  normalizePayerEmail,
  parseMercadoPagoDate,
  parsePreapproval,
  resolveSubscriptionBillingConfig,
  resolveTrialEnd,
  toCents,
  validatePlanTerms,
  type BillingMode,
  type BillingPeriodUnit,
  type PlanTerms,
  type PreapprovalSnapshot,
  type SubscriptionBillingConfig,
  type SubscriptionCancelOriginValue,
  type SubscriptionStatusValue,
} from "@nutri-bot/core";
import { Prisma, prisma, type SubscriptionPlan, type TenantSubscription } from "../index";
import { createArziumMercadoPagoGateway, type ArziumMercadoPagoGateway, type ArziumPreapprovalCreate } from "./subscriptionsGateway";
import type { TenantRef } from "./tenantScope";

// ---------------------------------------------------------------------------
// Tipos del contrato (§B.5.3)
// ---------------------------------------------------------------------------

export type SubscriptionDeps = {
  gateway?: ArziumMercadoPagoGateway; // default: createArziumMercadoPagoGateway()
  env?: Record<string, string | undefined>; // default: process.env
  now?: () => Date;
};

export type OfferedPlanView = {
  planId: string;
  name: string;
  priceText: string;
  trialText: string | null;
  trialEligible: boolean;
  isDefault: boolean;
  /** Para el estimado de fin de prueba de P1 (computeTrialEnd en web). null = sin prueba. */
  trialLength: number | null;
  trialUnit: BillingPeriodUnit | null;
};

export type TenantSubscriptionView = {
  availability: "enabled" | "unavailable";
  plans: OfferedPlanView[];
  trialUsed: boolean;
  subscription: null | {
    id: string;
    status: SubscriptionStatusValue;
    planName: string;
    priceText: string;
    authorized: boolean;
    trialEndsAt: Date | null;
    nextPaymentDate: Date | null;
    canceledAt: Date | null;
    cancelOrigin: SubscriptionCancelOriginValue | null;
    hasCheckout: boolean;
    planId: string;
    /** Solo PENDING sin autorizar (X14). La página lo pasa a la pantalla SOLO si isOwner. */
    checkoutPayerEmail: string | null;
  };
};

export type StartSubscriptionError =
  | "not_available"
  | "plan_not_offered"
  | "already_subscribed"
  | "mp_unavailable"
  | "restart_unconfirmed"
  | "invalid_payer_email"
  | "payer_email_rejected"
  | "checkout_in_progress";
export type StartSubscriptionResult = { ok: true; checkoutUrl: string } | { ok: false; error: StartSubscriptionError };

export type SubscriptionSyncResult = "applied" | "unchanged" | "ignored" | "rejected";
export type SubscriptionSyncSource = "WEBHOOK" | "RECONCILIATION" | "PANEL";

export type CancelSubscriptionResult =
  | { ok: true }
  | { ok: false; error: "not_available" | "nothing_to_cancel" | "mp_unavailable" | "cancel_unconfirmed" };

/** Anexo (HU-026). */
export type TenantSubscriptionGate = "not_required" | "verified" | "pending";

// ---------------------------------------------------------------------------
// Constantes y utilidades internas
// ---------------------------------------------------------------------------

/** > 2 llamadas de 10 s de timeout + margen (§B.5.4). */
export const CHECKOUT_CREATE_LEASE_MS = 45_000;
const CANCEL_RECENT_MS = 15 * 60 * 1000;
const REFRESH_THROTTLE_MS = 3_000;
const RECONCILE_PENDING_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const RECONCILE_BATCH = 200;
const OPEN_STATUSES: SubscriptionStatusValue[] = ["PENDING", "TRIALING", "ACTIVE", "PAST_DUE"];

type Row = TenantSubscription;
type Tx = Prisma.TransactionClient;
type EventSource = "WEBHOOK" | "RECONCILIATION" | "PANEL";
type EventResult = "APPLIED" | "UNCHANGED" | "IGNORED" | "REJECTED";

type Ctx = {
  env: Record<string, string | undefined>;
  now: () => Date;
  config: Extract<SubscriptionBillingConfig, { status: "enabled" }>;
  gateway: () => ArziumMercadoPagoGateway;
};

let misconfiguredWarned = false;

/** Config + log único por proceso si está mal configurada (solo nombres de variables). */
function billingConfig(env: Record<string, string | undefined>): SubscriptionBillingConfig {
  const config = resolveSubscriptionBillingConfig(env);
  if (config.status === "misconfigured" && !misconfiguredWarned) {
    misconfiguredWarned = true;
    console.warn("[subscriptions] misconfigured", { missing: config.missing });
  }
  return config;
}

/** null si el cobro no está habilitado. El gateway se crea recién cuando hace falta. */
function context(deps?: SubscriptionDeps): Ctx | null {
  const env = deps?.env ?? process.env;
  const config = billingConfig(env);
  if (config.status !== "enabled") return null;
  let gateway = deps?.gateway;
  return {
    env,
    now: deps?.now ?? (() => new Date()),
    config,
    gateway: () => (gateway ??= createArziumMercadoPagoGateway(env)),
  };
}

const decimalString = (v: unknown): string => {
  if (typeof v === "string") return v;
  if (typeof v === "number") return v.toFixed(2);
  if (v && typeof (v as { toFixed?: unknown }).toFixed === "function") return (v as { toFixed: (n: number) => string }).toFixed(2);
  return String(v);
};

function termsOf(row: {
  amount: unknown;
  currency: string;
  frequency: number;
  frequencyUnit: BillingPeriodUnit;
  trialLength: number | null;
  trialUnit: BillingPeriodUnit | null;
  billingCycles: number | null;
}): PlanTerms {
  return {
    amount: decimalString(row.amount),
    currency: row.currency,
    frequency: row.frequency,
    frequencyUnit: row.frequencyUnit,
    trialLength: row.trialLength,
    trialUnit: row.trialUnit,
    billingCycles: row.billingCycles,
  };
}

function expectedFor(row: Row, collectorUserId: string, preapprovalId: string | null) {
  return {
    preapprovalId,
    externalReference: row.externalReference,
    collectorUserId,
    amount: decimalString(row.amount),
    currency: row.currency,
    frequency: row.frequency,
    frequencyUnit: row.frequencyUnit,
    trialGranted: row.trialGranted,
    trialLength: row.trialLength,
    trialUnit: row.trialUnit,
  };
}

const isAuthorized = (row: { authorizedAt: Date | null }) => row.authorizedAt !== null;

const mpWarn = (op: string) => console.warn("[subscriptions] mp_error", { op });

async function logEvent(
  client: Pick<Tx, "subscriptionEvent">,
  e: {
    source: EventSource;
    topic: string;
    resourceId: string;
    result: EventResult;
    reason?: string | null;
    requestId?: string | null;
    tenantId?: string | null;
    subscriptionId?: string | null;
  },
): Promise<void> {
  // Solo códigos e ids: nunca el snapshot de MP, el email ni el error del SDK.
  await client.subscriptionEvent.create({
    data: {
      source: e.source,
      topic: e.topic,
      resourceId: e.resourceId,
      result: e.result,
      reason: e.reason ?? null,
      requestId: e.requestId ?? null,
      tenantId: e.tenantId ?? null,
      subscriptionId: e.subscriptionId ?? null,
    },
  });
}

const resultOf = (r: EventResult): SubscriptionSyncResult => r.toLowerCase() as SubscriptionSyncResult;

async function lockTenant(tx: Tx, tenantId: string): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`tenant-subscription:${tenantId}`}::text, 0))`;
}

async function lockRow(tx: Tx, id: string): Promise<Row | null> {
  await tx.$queryRaw`SELECT id FROM "TenantSubscription" WHERE id = ${id} FOR UPDATE`;
  return tx.tenantSubscription.findUnique({ where: { id } });
}

const isUniqueViolation = (e: unknown) =>
  typeof e === "object" && e !== null && (e as { code?: unknown }).code === "P2002";

/** Una preapproval de la búsqueda, con su date_created (para elegir la más reciente). */
type Found = { snapshot: PreapprovalSnapshot; createdAt: number };

function parseFound(raw: unknown): Found | null {
  const snapshot = parsePreapproval(raw);
  if (!snapshot) return null;
  const created = parseMercadoPagoDate((raw as Record<string, unknown>).date_created);
  return { snapshot, createdAt: created?.getTime() ?? 0 };
}

/** §B.5.4 paso 6a: la authorized si hay; si no, la pending más reciente. El resto de las vivas, a cancelar. */
function pickLive(found: Found[]): { chosen: Found; others: Found[] } | null {
  const live = found.filter((f) => f.snapshot.status !== "cancelled");
  if (live.length === 0) return null;
  const sorted = [...live].sort((a, b) => b.createdAt - a.createdAt);
  const chosen = sorted.find((f) => f.snapshot.status === "authorized") ?? sorted[0]!;
  return { chosen, others: sorted.filter((f) => f !== chosen) };
}

/** Cancelación best effort de duplicados después del commit (evento por cada una). */
async function cancelDuplicates(
  ctx: Ctx,
  row: { id: string; tenantId: string },
  ids: string[],
  source: EventSource,
  topic: string,
): Promise<void> {
  for (const id of ids) {
    let result: EventResult = "APPLIED";
    try {
      await ctx.gateway().cancelPreapproval(id);
    } catch {
      mpWarn("cancel_duplicate");
      result = "REJECTED";
    }
    await logEvent(prisma, {
      source,
      topic,
      resourceId: id,
      result,
      reason: result === "APPLIED" ? "duplicate_canceled" : "duplicate_cancel_failed",
      tenantId: row.tenantId,
      subscriptionId: row.id,
    });
  }
}

/** Cancelación best effort sin evento propio (el llamador ya registró el suyo). */
async function cancelQuietly(ctx: Ctx, id: string): Promise<void> {
  try {
    await ctx.gateway().cancelPreapproval(id);
  } catch {
    mpWarn("cancel");
  }
}

// ---------------------------------------------------------------------------
// Vista (web)
// ---------------------------------------------------------------------------

async function priorTrialUsed(tenantId: string, userId: string, mode: BillingMode): Promise<boolean> {
  const used = await prisma.tenantSubscription.findFirst({
    where: {
      mode,
      trialGranted: true,
      authorizedAt: { not: null },
      OR: [{ tenantId }, { startedByUserId: userId }],
    },
    select: { id: true },
  });
  return used !== null;
}

async function offerUsed(offerId: string): Promise<boolean> {
  const used = await prisma.tenantSubscription.findFirst({
    where: { offerId, authorizedAt: { not: null } },
    select: { id: true },
  });
  return used !== null;
}

async function liveOffer(tenantId: string, planId: string, now: Date) {
  return prisma.subscriptionPlanOffer.findFirst({
    where: { tenantId, planId, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
  });
}

/** web. La última suscripción del consultorio en el modo actual + los planes que se le ofrecen. */
export async function getTenantSubscriptionView(
  t: TenantRef,
  actor: { userId: string },
  deps?: SubscriptionDeps,
): Promise<TenantSubscriptionView> {
  const ctx = context(deps);
  if (!ctx) return { availability: "unavailable", plans: [], trialUsed: false, subscription: null };
  const { mode } = ctx.config;
  const now = ctx.now();

  const [latest, trialUsed, plans, offers] = await Promise.all([
    prisma.tenantSubscription.findFirst({
      where: { tenantId: t.tenantId, mode },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      include: { plan: { select: { name: true } } },
    }),
    priorTrialUsed(t.tenantId, actor.userId, mode),
    prisma.subscriptionPlan.findMany({ where: { mode, active: true } }),
    prisma.subscriptionPlanOffer.findMany({
      where: { tenantId: t.tenantId, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
    }),
  ]);

  const offerByPlan = new Map(offers.map((o) => [o.planId, o]));
  const offered = plans
    .filter((p) => p.isPublic || offerByPlan.has(p.id))
    .filter((p) => validatePlanTerms(termsOf(p), mode).ok)
    .sort((a, b) => Number(b.isDefault) - Number(a.isDefault) || toCents(decimalString(a.amount)) - toCents(decimalString(b.amount)));

  const views: OfferedPlanView[] = [];
  for (const p of offered) {
    const offer = offerByPlan.get(p.id) ?? null;
    const hasTrial = p.trialLength !== null && p.trialUnit !== null;
    const eligible = isTrialEligible({
      planHasTrial: hasTrial,
      priorTrialUsed: trialUsed,
      offer: offer ? { allowTrial: offer.allowTrial, used: offer.allowTrial && trialUsed ? await offerUsed(offer.id) : false } : null,
    });
    views.push({
      planId: p.id,
      name: p.name,
      priceText: formatPlanPrice(termsOf(p)),
      trialText: hasTrial ? formatTrialLength(p.trialLength!, p.trialUnit!) : null,
      trialEligible: eligible,
      isDefault: p.isDefault,
      trialLength: p.trialLength,
      trialUnit: p.trialUnit,
    });
  }

  return {
    availability: "enabled",
    plans: views,
    trialUsed,
    subscription: latest
      ? {
          id: latest.id,
          status: latest.status,
          planName: latest.plan.name,
          priceText: formatPlanPrice(termsOf(latest)),
          authorized: isAuthorized(latest),
          trialEndsAt: latest.trialEndsAt,
          nextPaymentDate: latest.nextPaymentDate,
          canceledAt: latest.canceledAt,
          cancelOrigin: latest.cancelOrigin,
          hasCheckout: latest.checkoutUrl !== null,
          planId: latest.planId,
          checkoutPayerEmail: latest.status === "PENDING" && !isAuthorized(latest) ? latest.checkoutPayerEmail : null,
        }
      : null,
  };
}

// ---------------------------------------------------------------------------
// Alta (§B.5.4)
// ---------------------------------------------------------------------------

type Plan = SubscriptionPlan;

/** web (OWNER). payerEmail obligatorio (G3). */
export async function startTenantSubscription(
  t: TenantRef,
  actor: { userId: string },
  input: { planId: string; restart?: boolean; payerEmail: string },
  deps?: SubscriptionDeps,
): Promise<StartSubscriptionResult> {
  const ctx = context(deps);
  if (!ctx) return { ok: false, error: "not_available" };
  return startWithContext(ctx, t, actor, input, "restart");
}

async function startWithContext(
  ctx: Ctx,
  t: TenantRef,
  actor: { userId: string },
  input: { planId: string; restart?: boolean; payerEmail: string },
  restartReason: "restart" | "stale_checkout",
): Promise<StartSubscriptionResult> {
  // 2. Email (G3): sin tocar la base ni el gateway si no es válido.
  const email = normalizePayerEmail(input.payerEmail);
  if (!email.ok) return { ok: false, error: "invalid_payer_email" };

  // 3. Plan ofrecido y válido.
  const { mode } = ctx.config;
  const now = ctx.now();
  const plan = await prisma.subscriptionPlan.findFirst({ where: { id: input.planId, mode, active: true } });
  if (!plan) return { ok: false, error: "plan_not_offered" };
  const offer = await liveOffer(t.tenantId, plan.id, now);
  if (!plan.isPublic && !offer) return { ok: false, error: "plan_not_offered" };
  if (!validatePlanTerms(termsOf(plan), mode).ok) {
    console.error("[subscriptions] invalid_plan", { planId: plan.id });
    return { ok: false, error: "plan_not_offered" };
  }

  // 4. Empezar de nuevo: abandonar la PENDING sin autorizar antes de seguir.
  if (input.restart) {
    const pending = await prisma.tenantSubscription.findFirst({
      where: { tenantId: t.tenantId, status: "PENDING", authorizedAt: null },
    });
    if (pending) {
      const abandoned = await abandonPending(ctx, pending, restartReason);
      if (abandoned !== "ok") return { ok: false, error: abandoned };
    }
  }

  // 5. Bajo el advisory lock del consultorio: devolver, esperar o tomar el lease de creación.
  type Step = { kind: "done"; result: StartSubscriptionResult } | { kind: "create"; row: Row };
  const step5 = () =>
    prisma.$transaction(async (tx): Promise<Step> => {
      await lockTenant(tx, t.tenantId);
      const leaseUntil = new Date(now.getTime() + CHECKOUT_CREATE_LEASE_MS);
      const open = await tx.tenantSubscription.findFirst({
        where: { tenantId: t.tenantId, status: { in: OPEN_STATUSES } },
      });
      if (open) {
        if (open.status !== "PENDING" || isAuthorized(open)) return { kind: "done", result: { ok: false, error: "already_subscribed" } };
        if (open.checkoutUrl) return { kind: "done", result: { ok: true, checkoutUrl: open.checkoutUrl } };
        if (open.checkoutCreateLeaseUntil && open.checkoutCreateLeaseUntil.getTime() > now.getTime()) {
          return { kind: "done", result: { ok: false, error: "checkout_in_progress" } };
        }
        const row = await tx.tenantSubscription.update({
          where: { id: open.id },
          data: { checkoutCreateLeaseUntil: leaseUntil, checkoutPayerEmail: email.email },
        });
        return { kind: "create", row };
      }

      const trialUsed = await priorTrialUsed(t.tenantId, actor.userId, mode);
      const trialGranted = isTrialEligible({
        planHasTrial: plan.trialLength !== null && plan.trialUnit !== null,
        priorTrialUsed: trialUsed,
        offer: offer ? { allowTrial: offer.allowTrial, used: await offerUsed(offer.id) } : null,
      });
      const row = await tx.tenantSubscription.create({
        data: {
          tenantId: t.tenantId,
          planId: plan.id,
          offerId: offer?.id ?? null,
          startedByUserId: actor.userId,
          mode,
          status: "PENDING",
          externalReference: `sub_${randomBytes(16).toString("hex")}`,
          checkoutPayerEmail: email.email,
          checkoutCreateLeaseUntil: leaseUntil,
          amount: plan.amount,
          currency: plan.currency,
          frequency: plan.frequency,
          frequencyUnit: plan.frequencyUnit,
          trialLength: plan.trialLength,
          trialUnit: plan.trialUnit,
          billingCycles: plan.billingCycles,
          trialGranted,
        },
      });
      return { kind: "create", row };
    });

  let step: Step;
  try {
    step = await step5();
  } catch (error) {
    // Nota 1: una carrera que escape al advisory lock choca con el índice parcial; se relee una vez.
    if (!isUniqueViolation(error)) throw error;
    step = await step5();
  }
  if (step.kind === "done") return step.result;

  // 6. Fuera de la transacción: solo el dueño del lease llega acá.
  return createOrAdoptCheckout(ctx, step.row, plan, "PANEL");
}

/** §B.5.4 pasos 6–7. `row` tiene el lease tomado por este proceso. */
async function createOrAdoptCheckout(ctx: Ctx, row: Row, plan: Pick<Plan, "id" | "name">, source: EventSource): Promise<StartSubscriptionResult> {
  // 6a. Búsqueda por referencia antes de cualquier POST. Si falla, no se crea (el lease vence solo).
  let found: Found[];
  try {
    const raw = await ctx.gateway().searchPreapprovalsByReference(row.externalReference);
    found = raw.map(parseFound).filter((f): f is Found => f !== null);
  } catch {
    mpWarn("search");
    return { ok: false, error: "mp_unavailable" };
  }
  const picked = pickLive(found);
  if (picked) {
    const result = await finalizeCheckout(ctx, row, picked.chosen.snapshot, source);
    if (picked.others.length > 0) {
      await cancelDuplicates(ctx, row, picked.others.map((f) => f.snapshot.id), source, "panel_start");
    }
    return result;
  }

  // 6b. Ninguna viva: un solo POST, nunca repetido.
  if (!row.checkoutPayerEmail) {
    // No debería pasar: el lease se toma siempre junto con el email.
    await releaseLease(row.id);
    return { ok: false, error: "invalid_payer_email" };
  }
  const body: ArziumPreapprovalCreate = {
    reason: plan.name,
    external_reference: row.externalReference,
    back_url: backUrl(ctx.env),
    status: "pending",
    payer_email: row.checkoutPayerEmail,
    auto_recurring: {
      frequency: row.frequency,
      frequency_type: row.frequencyUnit === "DAYS" ? "days" : "months",
      transaction_amount: toCents(decimalString(row.amount)) / 100,
      currency_id: row.currency,
      // end_date nunca mientras PLAN_BILLING_CYCLES_SUPPORTED = false (validatePlanTerms ya lo rechaza).
      ...(row.trialGranted && row.trialLength !== null && row.trialUnit !== null
        ? { free_trial: { frequency: row.trialLength, frequency_type: row.trialUnit === "DAYS" ? "days" : "months" } }
        : {}),
    },
  };

  let created: unknown;
  try {
    created = await ctx.gateway().createPreapproval(body, row.id);
  } catch (error) {
    return handleCreateError(row, plan, classifyPreapprovalCreateError(error), source);
  }

  const snapshot = parsePreapproval(created);
  if (!snapshot) {
    await releaseLease(row.id);
    await logEvent(prisma, {
      source, topic: "panel_start", resourceId: row.id, result: "REJECTED", reason: "invalid_resource",
      tenantId: row.tenantId, subscriptionId: row.id,
    });
    return { ok: false, error: "mp_unavailable" };
  }
  return finalizeCheckout(ctx, row, snapshot, source);
}

function backUrl(env: Record<string, string | undefined>): string {
  const override = env.ARZIUM_SUBSCRIPTIONS_BACK_URL?.trim();
  if (override) return override;
  const base = (env.AUTH_URL ?? "").trim().replace(/\/+$/, "");
  return `${base}/ajustes/suscripcion?mp=volver`;
}

async function releaseLease(id: string, clearEmail = false): Promise<void> {
  await prisma.tenantSubscription.update({
    where: { id },
    data: clearEmail ? { checkoutCreateLeaseUntil: null, checkoutPayerEmail: null } : { checkoutCreateLeaseUntil: null },
  });
}

/** §B.5.4 paso 6c. */
async function handleCreateError(
  row: Row,
  plan: Pick<Plan, "id">,
  kind: ReturnType<typeof classifyPreapprovalCreateError>,
  source: EventSource,
): Promise<StartSubscriptionResult> {
  const reject = async (reason: string, clearEmail: boolean) => {
    await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "TenantSubscription" WHERE id = ${row.id} FOR UPDATE`;
      await tx.tenantSubscription.update({
        where: { id: row.id },
        data: clearEmail ? { checkoutCreateLeaseUntil: null, checkoutPayerEmail: null } : { checkoutCreateLeaseUntil: null },
      });
      await logEvent(tx, {
        source, topic: "panel_start", resourceId: row.id, result: "REJECTED", reason,
        tenantId: row.tenantId, subscriptionId: row.id,
      });
    });
  };
  switch (kind) {
    case "payer_email_rejected":
      await reject("payer_email_rejected", true);
      return { ok: false, error: "payer_email_rejected" };
    case "payer_email_required":
      await reject("payer_email_required", true);
      return { ok: false, error: "invalid_payer_email" };
    case "amount_out_of_range":
      await reject("amount_out_of_range", false);
      console.error("[subscriptions] invalid_plan", { planId: plan.id });
      return { ok: false, error: "plan_not_offered" };
    case "rejected":
      await reject("mp_rejected", false);
      return { ok: false, error: "mp_unavailable" };
    case "ambiguous":
    default:
      // MP pudo haberla creado: no se reintenta y el lease queda hasta que venza; el próximo intento busca
      // por referencia antes de crear (§B.5.4 nota 3).
      mpWarn("create");
      return { ok: false, error: "mp_unavailable" };
  }
}

/** §B.5.4 paso 7: validar la preapproval creada o adoptada y guardar el checkout. */
async function finalizeCheckout(ctx: Ctx, row: Row, snapshot: PreapprovalSnapshot, source: EventSource): Promise<StartSubscriptionResult> {
  if (snapshot.status === "authorized") {
    // Adopción de una ya autorizada: se aplica como un sync (§B.5.5).
    await applySnapshot(ctx, row.id, snapshot, source, "panel_start", null);
    return { ok: false, error: "already_subscribed" };
  }

  const check = checkPreapprovalAgainstSubscription(snapshot, expectedFor(row, ctx.config.collectorUserId, null));
  const reason = !check.ok ? check.reason : !snapshot.initPoint ? "missing_init_point" : null;
  if (reason) {
    await prisma.$transaction(async (tx) => {
      await lockRow(tx, row.id);
      await tx.tenantSubscription.update({ where: { id: row.id }, data: { checkoutCreateLeaseUntil: null } });
      await logEvent(tx, {
        source, topic: "panel_start", resourceId: snapshot.id, result: "REJECTED", reason,
        tenantId: row.tenantId, subscriptionId: row.id,
      });
    });
    return { ok: false, error: "mp_unavailable" };
  }

  const now = ctx.now();
  const outcome = await prisma.$transaction(async (tx) => {
    const current = await lockRow(tx, row.id);
    if (!current || current.status !== "PENDING" || isAuthorized(current)) {
      return { kind: "gone" as const };
    }
    if (current.mercadoPagoPreapprovalId && current.mercadoPagoPreapprovalId !== snapshot.id) {
      return { kind: "other" as const, checkoutUrl: current.checkoutUrl };
    }
    await tx.tenantSubscription.update({
      where: { id: row.id },
      data: {
        mercadoPagoPreapprovalId: snapshot.id,
        checkoutUrl: snapshot.initPoint,
        mercadoPagoStatus: snapshot.status,
        nextPaymentDate: snapshot.nextPaymentDate,
        mercadoPagoLastModified: snapshot.lastModified,
        lastSyncedAt: now,
        checkoutCreateLeaseUntil: null,
      },
    });
    await logEvent(tx, {
      source, topic: "panel_start", resourceId: snapshot.id, result: "APPLIED",
      tenantId: row.tenantId, subscriptionId: row.id,
    });
    return { kind: "saved" as const };
  });

  if (outcome.kind === "saved") return { ok: true, checkoutUrl: snapshot.initPoint! };
  // La fila ya tiene otra preapproval (no debería, por el lease) o dejó de estar pendiente: se cancela la
  // recién creada/adoptada para no dejar un checkout vivo sin fila.
  await cancelQuietly(ctx, snapshot.id);
  if (outcome.kind === "other" && outcome.checkoutUrl) return { ok: true, checkoutUrl: outcome.checkoutUrl };
  return { ok: false, error: "mp_unavailable" };
}

/** §B.5.4 paso 4a. Abandonar la PENDING sin autorizar ("Empezar de nuevo" o checkout viejo). */
async function abandonPending(
  ctx: Ctx,
  row: Row,
  reason: "restart" | "stale_checkout",
): Promise<"ok" | "checkout_in_progress" | "restart_unconfirmed" | "already_subscribed"> {
  const now = ctx.now();
  if (row.checkoutCreateLeaseUntil && row.checkoutCreateLeaseUntil.getTime() > now.getTime()) return "checkout_in_progress";

  let ids: string[];
  if (row.mercadoPagoPreapprovalId) {
    ids = [row.mercadoPagoPreapprovalId];
  } else {
    try {
      const raw = await ctx.gateway().searchPreapprovalsByReference(row.externalReference);
      ids = raw
        .map(parseFound)
        .filter((f): f is Found => f !== null && f.snapshot.status !== "cancelled")
        .map((f) => f.snapshot.id);
    } catch {
      mpWarn("search");
      return "restart_unconfirmed";
    }
  }

  // Para que un webhook "cancelled" que llegue antes atribuya el origen al panel.
  await prisma.tenantSubscription.update({ where: { id: row.id }, data: { cancelRequestedAt: now } });

  for (const id of ids) {
    try {
      // Primero se mira: si ya está autorizada no se cancela (se aplica y no se abandona).
      const before = parsePreapproval(await ctx.gateway().getPreapproval(id));
      if (before?.status === "authorized") {
        await applySnapshot(ctx, row.id, before, "PANEL", "panel_restart", null);
        return "already_subscribed";
      }
      if (before?.status !== "cancelled") await ctx.gateway().cancelPreapproval(id);
      const after = parsePreapproval(await ctx.gateway().getPreapproval(id));
      if (after?.status === "authorized") {
        await applySnapshot(ctx, row.id, after, "PANEL", "panel_restart", null);
        return "already_subscribed";
      }
      if (after?.status !== "cancelled") return "restart_unconfirmed";
    } catch {
      mpWarn("cancel");
      return "restart_unconfirmed";
    }
  }

  await prisma.$transaction(async (tx) => {
    const current = await lockRow(tx, row.id);
    // Un webhook pudo haberla cancelado ya (CANCELED/PANEL, sin autorizar): mismo resultado.
    if (!current || current.status !== "PENDING" || isAuthorized(current)) return;
    await tx.tenantSubscription.update({
      where: { id: row.id },
      data: {
        status: "CANCELED",
        canceledAt: now,
        cancelOrigin: "PANEL",
        checkoutUrl: null,
        checkoutPayerEmail: null,
        checkoutCreateLeaseUntil: null,
      },
    });
    await logEvent(tx, {
      source: "PANEL", topic: "panel_restart", resourceId: row.mercadoPagoPreapprovalId ?? row.id, result: "APPLIED", reason,
      tenantId: row.tenantId, subscriptionId: row.id,
    });
  });
  return "ok";
}

// ---------------------------------------------------------------------------
// Continuar el checkout (§B.5.4b)
// ---------------------------------------------------------------------------

/** web (OWNER): "Continuar en Mercado Pago". Recrea el checkout si la prueba ya perdió más de 1 h (DP1). */
export async function resumePendingCheckout(
  t: TenantRef,
  actor: { userId: string },
  deps?: SubscriptionDeps,
): Promise<{ ok: true; checkoutUrl: string } | { ok: false; error: "not_found" | "not_available" | "already_subscribed" }> {
  const ctx = context(deps);
  if (!ctx) return { ok: false, error: "not_available" };
  const row = await prisma.tenantSubscription.findFirst({
    where: { tenantId: t.tenantId, mode: ctx.config.mode, status: "PENDING", authorizedAt: null, checkoutUrl: { not: null } },
  });
  if (!row || !row.checkoutUrl) return { ok: false, error: "not_found" };

  const stale = isCheckoutStale({
    trialGranted: row.trialGranted,
    nextPaymentDate: row.nextPaymentDate,
    trialLength: row.trialLength,
    trialUnit: row.trialUnit,
    now: ctx.now(),
  });
  if (!stale || !row.checkoutPayerEmail) return { ok: true, checkoutUrl: row.checkoutUrl };

  const restarted = await startWithContext(
    ctx,
    t,
    actor,
    { planId: row.planId, restart: true, payerEmail: row.checkoutPayerEmail },
    "stale_checkout",
  );
  if (restarted.ok) return restarted;
  if (restarted.error === "already_subscribed") return { ok: false, error: "already_subscribed" };

  // Best effort: si la vieja sigue viva, la persona puede autorizarla igual (trialEndsAt va a salir de MP).
  // Si ya se abandonó (y falló la creación de la nueva), su URL no sirve: que empiece de nuevo.
  const current = await prisma.tenantSubscription.findUnique({ where: { id: row.id }, select: { status: true, checkoutUrl: true } });
  if (current?.status === "PENDING" && current.checkoutUrl) {
    console.warn("[subscriptions] stale_checkout_kept", { subscriptionId: row.id });
    return { ok: true, checkoutUrl: current.checkoutUrl };
  }
  return { ok: false, error: "not_found" };
}

// ---------------------------------------------------------------------------
// Sincronización (§B.5.5)
// ---------------------------------------------------------------------------

/** web (webhook) y bot. Consulta la preapproval en MP y la aplica. */
export async function syncSubscriptionByPreapprovalId(
  preapprovalId: string,
  source: SubscriptionSyncSource,
  meta?: { requestId?: string | null },
  deps?: SubscriptionDeps,
): Promise<SubscriptionSyncResult> {
  const ctx = context(deps);
  if (!ctx) return "ignored";
  return syncWithContext(ctx, preapprovalId, source, meta?.requestId ?? null);
}

async function syncWithContext(ctx: Ctx, preapprovalId: string, source: EventSource, requestId: string | null): Promise<SubscriptionSyncResult> {
  let raw: unknown;
  try {
    raw = await ctx.gateway().getPreapproval(preapprovalId);
  } catch {
    mpWarn("get");
    throw new Error("mp_unavailable");
  }
  const snapshot = parsePreapproval(raw);
  if (!snapshot) {
    await logEvent(prisma, { source, topic: "preapproval", resourceId: preapprovalId, result: "REJECTED", reason: "invalid_resource", requestId });
    return "rejected";
  }

  const row =
    (await prisma.tenantSubscription.findUnique({ where: { mercadoPagoPreapprovalId: snapshot.id } })) ??
    (snapshot.externalReference
      ? await prisma.tenantSubscription.findFirst({ where: { externalReference: snapshot.externalReference, mode: ctx.config.mode } })
      : null);
  if (!row) {
    await logEvent(prisma, { source, topic: "preapproval", resourceId: snapshot.id, result: "IGNORED", reason: "unknown_preapproval", requestId });
    return "ignored";
  }
  return applySnapshot(ctx, row.id, snapshot, source, "preapproval", requestId);
}

/** §B.5.5 paso 4: aplicar un snapshot verificado a la fila, bajo FOR UPDATE. */
async function applySnapshot(
  ctx: Ctx,
  subscriptionId: string,
  snapshot: PreapprovalSnapshot,
  source: EventSource,
  topic: string,
  requestId: string | null,
): Promise<SubscriptionSyncResult> {
  const now = ctx.now();
  const afterCommit: { cancel: string[]; duplicateCancel: string[] } = { cancel: [], duplicateCancel: [] };
  let tenantId = "";

  const result = await prisma.$transaction(async (tx): Promise<EventResult> => {
    const row = await lockRow(tx, subscriptionId);
    if (!row) return "IGNORED";
    tenantId = row.tenantId;
    const event = (result: EventResult, reason: string | null) =>
      logEvent(tx, { source, topic, resourceId: snapshot.id, result, reason, requestId, tenantId: row.tenantId, subscriptionId: row.id });

    let adoptId = false;
    const check = checkPreapprovalAgainstSubscription(snapshot, expectedFor(row, ctx.config.collectorUserId, row.mercadoPagoPreapprovalId));
    if (!check.ok) {
      if (check.reason !== "id_mismatch") {
        await event("REJECTED", check.reason);
        return "REJECTED";
      }
      // Misma referencia, otro id (§B.5.4 nota 3).
      const rest = checkPreapprovalAgainstSubscription(snapshot, expectedFor(row, ctx.config.collectorUserId, null));
      if (!rest.ok) {
        await event("REJECTED", rest.reason);
        return "REJECTED";
      }
      const incomingAuthorized = snapshot.status === "authorized";
      if (incomingAuthorized && row.status === "CANCELED" && !isAuthorized(row) && row.cancelOrigin === "PANEL") {
        afterCommit.cancel.push(snapshot.id); // B.0 R11 también con otro id
        await event("REJECTED", "authorized_after_abandon");
        return "REJECTED";
      }
      if (incomingAuthorized && !isAuthorized(row) && row.status !== "CANCELED") {
        adoptId = true; // la autorizada gana; la vieja se cancela después del commit
        if (row.mercadoPagoPreapprovalId) afterCommit.duplicateCancel.push(row.mercadoPagoPreapprovalId);
      } else if (incomingAuthorized && isAuthorized(row)) {
        afterCommit.cancel.push(snapshot.id);
        await event("APPLIED", "duplicate_canceled");
        return "APPLIED";
      } else {
        await event("REJECTED", "id_mismatch");
        return "REJECTED";
      }
    }

    if (!adoptId && snapshot.lastModified && row.mercadoPagoLastModified && snapshot.lastModified.getTime() < row.mercadoPagoLastModified.getTime()) {
      await event("UNCHANGED", "stale_snapshot");
      return "UNCHANGED";
    }

    // B.0 R11 (S8 sin verificar): un checkout abandonado no se revive.
    if (row.status === "CANCELED" && !isAuthorized(row) && row.cancelOrigin === "PANEL" && snapshot.status === "authorized") {
      afterCommit.cancel.push(snapshot.id);
      await event("REJECTED", "authorized_after_abandon");
      return "REJECTED";
    }

    const cancelRequestedRecently =
      row.cancelRequestedAt !== null && now.getTime() - row.cancelRequestedAt.getTime() <= CANCEL_RECENT_MS;
    const decision = decideSubscriptionStatus({
      current: row.status,
      mpStatus: snapshot.status,
      trialGranted: row.trialGranted,
      charges: { everApproved: false, latestOutcome: null }, // 029c lo calcula de los cobros
      cancelRequestedRecently,
    });

    if (decision.kind === "ignore") {
      await tx.tenantSubscription.update({
        where: { id: row.id },
        data: { mercadoPagoStatus: snapshot.status, lastSyncedAt: now },
      });
      await event("IGNORED", decision.reason);
      return "IGNORED";
    }

    const data: Prisma.TenantSubscriptionUpdateInput = {
      status: decision.status,
      nextPaymentDate: snapshot.nextPaymentDate,
      mercadoPagoStatus: snapshot.status,
      mercadoPagoLastModified: snapshot.lastModified ?? row.mercadoPagoLastModified,
      lastSyncedAt: now,
    };
    const preapprovalId = adoptId || !row.mercadoPagoPreapprovalId ? snapshot.id : row.mercadoPagoPreapprovalId;
    if (preapprovalId !== row.mercadoPagoPreapprovalId) data.mercadoPagoPreapprovalId = preapprovalId;

    const firstAuthorization = snapshot.status === "authorized" && !isAuthorized(row);
    if (firstAuthorization) {
      data.authorizedAt = now;
      data.trialEndsAt = row.trialGranted
        ? resolveTrialEnd({
            authorizedAt: now,
            nextPaymentDate: snapshot.nextPaymentDate,
            startDate: snapshot.startDate,
            trialLength: row.trialLength,
            trialUnit: row.trialUnit,
          })
        : null;
      data.collectorUserId = snapshot.collectorId ?? ctx.config.collectorUserId;
      data.payerUserId = snapshot.payerId;
    }
    if (firstAuthorization || decision.status !== "PENDING") {
      // El CHECK TenantSubscription_payer_email_transient lo exige fuera de PENDING sin autorizar.
      data.checkoutUrl = null;
      data.checkoutPayerEmail = null;
      data.checkoutCreateLeaseUntil = null;
    }
    if (decision.status === "CANCELED") {
      data.canceledAt = now;
      data.cancelOrigin = decision.cancelOrigin;
    }

    const changed =
      decision.status !== row.status ||
      firstAuthorization ||
      preapprovalId !== row.mercadoPagoPreapprovalId ||
      snapshot.status !== row.mercadoPagoStatus ||
      (snapshot.nextPaymentDate?.getTime() ?? null) !== (row.nextPaymentDate?.getTime() ?? null);

    await tx.tenantSubscription.update({ where: { id: row.id }, data });
    await event(changed ? "APPLIED" : "UNCHANGED", null);
    return changed ? "APPLIED" : "UNCHANGED";
  });

  for (const id of afterCommit.cancel) await cancelQuietly(ctx, id);
  if (afterCommit.duplicateCancel.length > 0) {
    await cancelDuplicates(ctx, { id: subscriptionId, tenantId }, afterCommit.duplicateCancel, source, topic);
  }
  return resultOf(result);
}

/** Adopción por referencia sin crear nada (refresh y conciliación de una PENDING sin preapprovalId). */
async function adoptByReference(ctx: Ctx, row: Row, source: EventSource): Promise<SubscriptionSyncResult> {
  let found: Found[];
  try {
    const raw = await ctx.gateway().searchPreapprovalsByReference(row.externalReference);
    found = raw.map(parseFound).filter((f): f is Found => f !== null);
  } catch {
    mpWarn("search");
    throw new Error("mp_unavailable");
  }
  const picked = pickLive(found);
  if (!picked) {
    await prisma.tenantSubscription.update({ where: { id: row.id }, data: { lastSyncedAt: ctx.now() } });
    return "unchanged";
  }
  let result: SubscriptionSyncResult;
  if (picked.chosen.snapshot.status === "authorized") {
    result = await applySnapshot(ctx, row.id, picked.chosen.snapshot, source, "preapproval", null);
  } else {
    const saved = await finalizeCheckout(ctx, row, picked.chosen.snapshot, source);
    result = saved.ok ? "applied" : "rejected";
  }
  if (picked.others.length > 0) {
    await cancelDuplicates(ctx, row, picked.others.map((f) => f.snapshot.id), source, "preapproval");
  }
  return result;
}

/** web (polling). Sincroniza la no terminada si lastSyncedAt tiene más de 3 s. "none" = no hay. */
export async function refreshTenantSubscription(
  t: TenantRef,
  deps?: SubscriptionDeps,
): Promise<{ result: SubscriptionSyncResult | "none"; status: SubscriptionStatusValue | null; authorized: boolean }> {
  const ctx = context(deps);
  if (!ctx) return { result: "none", status: null, authorized: false };
  const row = await prisma.tenantSubscription.findFirst({
    where: { tenantId: t.tenantId, mode: ctx.config.mode, status: { in: OPEN_STATUSES } },
  });
  if (!row) return { result: "none", status: null, authorized: false };

  const now = ctx.now();
  const fresh = row.lastSyncedAt !== null && now.getTime() - row.lastSyncedAt.getTime() < REFRESH_THROTTLE_MS;
  const leased = row.checkoutCreateLeaseUntil !== null && row.checkoutCreateLeaseUntil.getTime() > now.getTime();
  if (fresh || (!row.mercadoPagoPreapprovalId && leased)) {
    return { result: "unchanged", status: row.status, authorized: isAuthorized(row) };
  }

  let result: SubscriptionSyncResult;
  try {
    result = row.mercadoPagoPreapprovalId
      ? await syncWithContext(ctx, row.mercadoPagoPreapprovalId, "PANEL", null)
      : await adoptByReference(ctx, row, "PANEL");
  } catch {
    // mp_error ya logueado; la pantalla sigue con el estado guardado.
    return { result: "ignored", status: row.status, authorized: isAuthorized(row) };
  }
  const after = await prisma.tenantSubscription.findUnique({ where: { id: row.id }, select: { status: true, authorizedAt: true } });
  return { result, status: after?.status ?? row.status, authorized: after ? isAuthorized(after) : isAuthorized(row) };
}

// ---------------------------------------------------------------------------
// Cancelación (§B.5.6)
// ---------------------------------------------------------------------------

/** web (OWNER). TRIALING/ACTIVE/PAST_DUE o PENDING autorizada (X8). */
export async function cancelTenantSubscription(
  t: TenantRef,
  _actor: { userId: string },
  deps?: SubscriptionDeps,
): Promise<CancelSubscriptionResult> {
  const ctx = context(deps);
  if (!ctx) return { ok: false, error: "not_available" };
  const row = await prisma.tenantSubscription.findFirst({
    where: {
      tenantId: t.tenantId,
      mode: ctx.config.mode,
      OR: [{ status: { in: ["TRIALING", "ACTIVE", "PAST_DUE"] } }, { status: "PENDING", authorizedAt: { not: null } }],
    },
  });
  if (!row || !row.mercadoPagoPreapprovalId) return { ok: false, error: "nothing_to_cancel" };
  const preapprovalId = row.mercadoPagoPreapprovalId;

  await prisma.tenantSubscription.update({ where: { id: row.id }, data: { cancelRequestedAt: ctx.now() } });

  let snapshot: PreapprovalSnapshot | null;
  try {
    await ctx.gateway().cancelPreapproval(preapprovalId);
    snapshot = parsePreapproval(await ctx.gateway().getPreapproval(preapprovalId));
  } catch {
    mpWarn("cancel");
    return { ok: false, error: "mp_unavailable" };
  }
  if (!snapshot || snapshot.status !== "cancelled") return { ok: false, error: "cancel_unconfirmed" };

  await applySnapshot(ctx, row.id, snapshot, "PANEL", "panel_cancel", null);
  const after = await prisma.tenantSubscription.findUnique({ where: { id: row.id }, select: { status: true } });
  return after?.status === "CANCELED" ? { ok: true } : { ok: false, error: "cancel_unconfirmed" };
}

// ---------------------------------------------------------------------------
// Webhook y conciliación
// ---------------------------------------------------------------------------

/** web (webhook). topic "subscription_preapproval" → sync; el resto → "ignored" (029c suma tópicos; el
 *  payment de $0 card_validation de la autorización nunca es un cobro, S9). */
export async function handleSubscriptionWebhook(
  n: { topic: string | null; resourceId: string; requestId: string | null },
  deps?: SubscriptionDeps,
): Promise<"processed" | "ignored"> {
  const ctx = context(deps);
  if (!ctx) return "ignored";
  if (n.topic !== "subscription_preapproval") return "ignored";
  await syncWithContext(ctx, n.resourceId, "WEBHOOK", n.requestId);
  return "processed";
}

/** bot. Suscripciones del modo actual en PENDING (≤ 30 días), TRIALING, ACTIVE, PAST_DUE; las menos
 *  recientemente sincronizadas primero; máx. 200 por corrida; un error no frena a las demás. Nunca crea. */
export async function reconcileOpenSubscriptions(
  onError?: (subscriptionId: string) => void,
  deps?: SubscriptionDeps,
): Promise<{ processed: number; failed: number; skipped: number }> {
  const ctx = context(deps);
  const counts = { processed: 0, failed: 0, skipped: 0 };
  if (!ctx) return counts;
  const now = ctx.now();
  const rows = await prisma.tenantSubscription.findMany({
    where: {
      mode: ctx.config.mode,
      OR: [
        { status: { in: ["TRIALING", "ACTIVE", "PAST_DUE"] } },
        { status: "PENDING", createdAt: { gte: new Date(now.getTime() - RECONCILE_PENDING_MAX_AGE_MS) } },
      ],
    },
    orderBy: [{ lastSyncedAt: { sort: "asc", nulls: "first" } }, { id: "asc" }],
    take: RECONCILE_BATCH,
  });

  for (const row of rows) {
    try {
      if (row.mercadoPagoPreapprovalId) {
        await syncWithContext(ctx, row.mercadoPagoPreapprovalId, "RECONCILIATION", null);
      } else if (row.checkoutCreateLeaseUntil && row.checkoutCreateLeaseUntil.getTime() > now.getTime()) {
        counts.skipped++;
        continue;
      } else {
        await adoptByReference(ctx, row, "RECONCILIATION");
      }
      counts.processed++;
    } catch {
      counts.failed++;
      onError?.(row.id);
    }
  }
  return counts;
}

// ---------------------------------------------------------------------------
// Gate de onboarding (anexo, HU-026)
// ---------------------------------------------------------------------------

/** HU-026 la consulta para decidir si un consultorio nuevo puede operar. Solo lectura.
 *  not_required: cobro apagado. verified: la última del modo actual está autorizada (verificada contra MP por
 *  syncSubscriptionByPreapprovalId) y no está CANCELED. pending: el resto. Si la base falla, tira. */
export async function getTenantSubscriptionGate(tenantId: string, deps?: SubscriptionDeps): Promise<TenantSubscriptionGate> {
  const config = billingConfig(deps?.env ?? process.env);
  if (config.status !== "enabled") return "not_required";
  const latest = await prisma.tenantSubscription.findFirst({
    where: { tenantId, mode: config.mode },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: { status: true, authorizedAt: true },
  });
  return latest && latest.authorizedAt !== null && latest.status !== "CANCELED" ? "verified" : "pending";
}

/** "verified" en términos booleanos. */
export async function hasVerifiedSubscriptionAuthorization(tenantId: string, deps?: SubscriptionDeps): Promise<boolean> {
  return (await getTenantSubscriptionGate(tenantId, deps)) === "verified";
}
