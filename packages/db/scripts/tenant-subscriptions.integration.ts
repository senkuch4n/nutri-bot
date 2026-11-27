// HU-029b (§B.9.3): probe de suscripciones contra Postgres real (descartable). Correr solo vía
// test-tenant-subscriptions.sh. El gateway de MP es falso (inyectado por deps) e IGNORA la idempotency key,
// como MP en S4; globalThis.fetch queda bloqueado: nunca hay red real.
import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { prisma } from "../index";
import {
  cancelTenantSubscription,
  getTenantSubscriptionGate,
  startTenantSubscription,
  syncSubscriptionByPreapprovalId,
  type ArziumMercadoPagoGateway,
} from "../domain";

if (process.env.SUBS_DISPOSABLE !== "1" ||
    !/^postgresql:\/\/postgres:[a-f0-9]{36}@127\.0\.0\.1:\d+\/subs_[a-z_]+$/.test(process.env.DATABASE_URL ?? "")) {
  throw new Error("Run test-tenant-subscriptions.sh for disposable PostgreSQL.");
}

globalThis.fetch = (async () => {
  throw new Error("Red real bloqueada en el probe");
}) as typeof fetch;

const COLLECTOR = "424242";
const ENV = {
  ARZIUM_SUBSCRIPTIONS_ENABLED: "true",
  ARZIUM_MERCADOPAGO_MODE: "sandbox",
  ARZIUM_MERCADOPAGO_ACCESS_TOKEN: "TEST-probe-token",
  ARZIUM_MERCADOPAGO_USER_ID: COLLECTOR,
  ARZIUM_MERCADOPAGO_WEBHOOK_SECRET: "probe-secret",
  AUTH_URL: "https://probe.example.test",
  NODE_ENV: "test",
};
const DAY = 86_400_000;
const PLAN = "plan_mensual_sandbox"; // sembrado por la migración
const EMAIL = "owner.mp@example.test";

type Raw = Record<string, any>;

function fakeMercadoPago(prefix: string, delayMs = 0) {
  const store = new Map<string, Raw>();
  let n = 1;
  let creates = 0;
  const wait = () => new Promise((r) => setTimeout(r, delayMs));
  const gateway: ArziumMercadoPagoGateway = {
    async createPreapproval(body) {
      await wait();
      creates++;
      const id = `${prefix}-${n++}`; // la key no deduplica (S4)
      const trial = body.auto_recurring.free_trial;
      const now = Date.now();
      const p: Raw = {
        id,
        status: "pending",
        collector_id: Number(COLLECTOR),
        external_reference: body.external_reference,
        init_point: `https://www.mercadopago.com.ar/subscriptions/checkout?preapproval_id=${id}`,
        date_created: new Date(now).toISOString(),
        last_modified: new Date(now).toISOString(),
        next_payment_date: new Date(now + (trial ? trial.frequency * DAY : 0)).toISOString(),
        auto_recurring: { ...body.auto_recurring, start_date: new Date(now).toISOString(), ...(trial ? { free_trial: { ...trial, first_invoice_offset: trial.frequency } } : {}) },
      };
      store.set(id, p);
      return structuredClone(p);
    },
    async getPreapproval(id) {
      const p = store.get(id);
      if (!p) throw Object.assign(new Error("not found"), { status: 404 });
      return structuredClone(p);
    },
    async cancelPreapproval(id) {
      const p = store.get(id)!;
      p.status = "cancelled";
      p.last_modified = new Date(Date.now() + n++).toISOString();
      return structuredClone(p);
    },
    async searchPreapprovalsByReference(ref) {
      await wait();
      return [...store.values()].filter((p) => p.external_reference === ref).map((p) => structuredClone(p));
    },
    async getAuthorizedPayment() { throw new Error("029c"); },
    async searchAuthorizedPayments() { throw new Error("029c"); },
    async getPayment() { throw new Error("029c"); },
  };
  return {
    gateway,
    store,
    creates: () => creates,
    authorize(id: string) {
      const p = store.get(id)!;
      p.status = "authorized";
      p.payer_id = 987654321;
      p.last_modified = new Date(Date.now() + n++).toISOString();
    },
  };
}

const deps = (mp: ReturnType<typeof fakeMercadoPago>) => ({ gateway: mp.gateway, env: ENV });
const A = { tenantId: "subs-a" };
const B = { tenantId: "subs-b" };
const C = { tenantId: "subs-c" };

async function snapshotOf(tenantId: string) {
  const rows = await prisma.tenantSubscription.findMany({ where: { tenantId }, orderBy: { createdAt: "asc" } });
  return JSON.stringify(rows);
}

before(async () => {
  for (const id of ["subs-a", "subs-b", "subs-c"]) await prisma.tenant.create({ data: { id, name: id, timeZone: "America/Argentina/Buenos_Aires" } });
  await prisma.user.createMany({ data: [{ id: "owner-a", email: "a@example.test" }, { id: "owner-b", email: "b@example.test" }] });
  await prisma.tenantMembership.createMany({
    data: [
      { tenantId: "subs-a", userId: "owner-a", role: "OWNER" },
      { tenantId: "subs-b", userId: "owner-b", role: "OWNER" },
    ],
  });
});
after(() => prisma.$disconnect());

describe("suscripciones con Postgres real (HU-029b)", () => {
  const mp = fakeMercadoPago("slow", 200);

  test("A empieza dos veces en paralelo: 1 fila y 1 createPreapproval (el lease deduplica, no MP)", async () => {
    const [r1, r2] = await Promise.all([
      startTenantSubscription(A, { userId: "owner-a" }, { planId: PLAN, payerEmail: EMAIL }, deps(mp)),
      startTenantSubscription(A, { userId: "owner-a" }, { planId: PLAN, payerEmail: EMAIL }, deps(mp)),
    ]);
    const rows = await prisma.tenantSubscription.findMany({ where: { tenantId: "subs-a" } });
    assert.equal(rows.length, 1);
    assert.equal(mp.creates(), 1);
    const results = [r1, r2];
    const ok = results.filter((r) => r.ok);
    assert.ok(ok.length >= 1, JSON.stringify(results));
    for (const r of results) {
      if (r.ok) assert.equal(r.checkoutUrl, rows[0]!.checkoutUrl);
      else assert.equal(r.error, "checkout_in_progress");
    }
    assert.equal(rows[0]!.trialGranted, true);
    assert.equal(rows[0]!.checkoutPayerEmail, EMAIL);
    assert.equal(rows[0]!.checkoutCreateLeaseUntil, null);
  });

  test("índice parcial: otra fila no terminada para A falla; una CANCELED más entra", async () => {
    const insert = (status: string, ref: string) => prisma.$executeRawUnsafe(
      `INSERT INTO "TenantSubscription" (id, "tenantId", "planId", "startedByUserId", mode, status, "externalReference",
        amount, currency, frequency, "frequencyUnit", "trialGranted", "updatedAt")
       VALUES ($1, 'subs-a', $2, 'owner-a', 'SANDBOX', $3::"SubscriptionStatus", $1, 60000, 'ARS', 1, 'MONTHS', false, now())`,
      ref, PLAN, status);
    await assert.rejects(insert("TRIALING", "probe-open-dup"), /23505|already exists/);
    assert.equal(await insert("CANCELED", "probe-canceled"), 1);
  });

  test("sync authorized de A → TRIALING; B queda idéntico", async () => {
    await startTenantSubscription(B, { userId: "owner-b" }, { planId: PLAN, payerEmail: EMAIL }, deps(mp));
    const beforeB = await snapshotOf("subs-b");
    const a = (await prisma.tenantSubscription.findFirst({ where: { tenantId: "subs-a", status: "PENDING" } }))!;
    mp.authorize(a.mercadoPagoPreapprovalId!);
    assert.equal(await syncSubscriptionByPreapprovalId(a.mercadoPagoPreapprovalId!, "WEBHOOK", {}, deps(mp)), "applied");
    const after = (await prisma.tenantSubscription.findUnique({ where: { id: a.id } }))!;
    assert.equal(after.status, "TRIALING");
    assert.equal(after.checkoutPayerEmail, null);
    assert.ok(after.authorizedAt);
    assert.ok(after.trialEndsAt);
    assert.equal(await snapshotOf("subs-b"), beforeB);
    assert.equal(await getTenantSubscriptionGate("subs-a", { env: ENV }), "verified");
    assert.equal(await getTenantSubscriptionGate("subs-b", { env: ENV }), "pending");
    assert.equal(await getTenantSubscriptionGate("subs-b", { env: {} }), "not_required");
  });

  test("sync concurrente (webhook + conciliación) del mismo snapshot → un APPLIED y un UNCHANGED", async () => {
    const b = (await prisma.tenantSubscription.findFirst({ where: { tenantId: "subs-b", status: "PENDING" } }))!;
    mp.authorize(b.mercadoPagoPreapprovalId!);
    const results = await Promise.all([
      syncSubscriptionByPreapprovalId(b.mercadoPagoPreapprovalId!, "WEBHOOK", {}, deps(mp)),
      syncSubscriptionByPreapprovalId(b.mercadoPagoPreapprovalId!, "RECONCILIATION", {}, deps(mp)),
    ]);
    assert.deepEqual([...results].sort(), ["applied", "unchanged"]);
    const row = (await prisma.tenantSubscription.findUnique({ where: { id: b.id } }))!;
    assert.equal(row.status, "TRIALING");
  });

  test("cancel de A → CANCELED/PANEL; re-alta sin prueba; la OWNER de A en C sin prueba; oferta allowTrial una vez", async () => {
    assert.deepEqual(await cancelTenantSubscription(A, { userId: "owner-a" }, deps(mp)), { ok: true });
    const canceled = (await prisma.tenantSubscription.findFirst({ where: { tenantId: "subs-a", status: "CANCELED", authorizedAt: { not: null } } }))!;
    assert.equal(canceled.cancelOrigin, "PANEL");

    const fast = fakeMercadoPago("fast");
    const r = await startTenantSubscription(A, { userId: "owner-a" }, { planId: PLAN, payerEmail: EMAIL }, deps(fast));
    assert.ok(r.ok);
    const realta = (await prisma.tenantSubscription.findFirst({ where: { tenantId: "subs-a", status: "PENDING" } }))!;
    assert.equal(realta.trialGranted, false);

    await prisma.tenantMembership.create({ data: { tenantId: "subs-c", userId: "owner-a", role: "OWNER" } });
    await startTenantSubscription(C, { userId: "owner-a" }, { planId: PLAN, payerEmail: EMAIL }, deps(fast));
    assert.equal((await prisma.tenantSubscription.findFirst({ where: { tenantId: "subs-c" } }))!.trialGranted, false);

    // Oferta con prueba para A: la re-alta (abandonando la pendiente) tiene prueba…
    await prisma.subscriptionPlanOffer.create({ data: { tenantId: "subs-a", planId: PLAN, allowTrial: true } });
    const withOffer = await startTenantSubscription(A, { userId: "owner-a" }, { planId: PLAN, payerEmail: EMAIL, restart: true }, deps(fast));
    assert.ok(withOffer.ok, JSON.stringify(withOffer));
    const offered = (await prisma.tenantSubscription.findFirst({ where: { tenantId: "subs-a", status: "PENDING" } }))!;
    assert.equal(offered.trialGranted, true);
    // …y una vez usada (autorizada y cancelada), la siguiente re-alta con la misma oferta no.
    fast.authorize(offered.mercadoPagoPreapprovalId!);
    await syncSubscriptionByPreapprovalId(offered.mercadoPagoPreapprovalId!, "WEBHOOK", {}, deps(fast));
    assert.deepEqual(await cancelTenantSubscription(A, { userId: "owner-a" }, deps(fast)), { ok: true });
    await startTenantSubscription(A, { userId: "owner-a" }, { planId: PLAN, payerEmail: EMAIL }, deps(fast));
    const again = (await prisma.tenantSubscription.findFirst({ where: { tenantId: "subs-a", status: "PENDING" } }))!;
    assert.equal(again.trialGranted, false);
  });

  test("CHECK: plan con trialLength sin trialUnit falla; TRIALING con checkoutPayerEmail falla; con null entra", async () => {
    await assert.rejects(
      prisma.$executeRawUnsafe(`INSERT INTO "SubscriptionPlan" (id, code, mode, name, amount, frequency, "frequencyUnit", "trialLength", "updatedAt")
        VALUES ('probe-bad', 'bad', 'SANDBOX', 'Bad', 100, 1, 'MONTHS', 7, now())`),
      /SubscriptionPlan_trial_pair/,
    );
    const pending = (await prisma.tenantSubscription.findFirst({ where: { tenantId: "subs-a", status: "PENDING" } }))!;
    assert.ok(pending.checkoutPayerEmail);
    await assert.rejects(
      prisma.$executeRawUnsafe(`UPDATE "TenantSubscription" SET status = 'TRIALING' WHERE id = $1`, pending.id),
      /TenantSubscription_payer_email_transient/,
    );
    await assert.rejects(
      prisma.$executeRawUnsafe(`UPDATE "TenantSubscription" SET "authorizedAt" = now() WHERE id = $1`, pending.id),
      /TenantSubscription_payer_email_transient/,
    );
    assert.equal(
      await prisma.$executeRawUnsafe(`UPDATE "TenantSubscription" SET status = 'TRIALING', "trialGranted" = false, "checkoutPayerEmail" = NULL WHERE id = $1`, pending.id),
      1,
    );
  });
});
