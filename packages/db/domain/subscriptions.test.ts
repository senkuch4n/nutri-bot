// HU-029b (SDD §B.9.2): suscripción de Arzium. Sin base ni red: prisma es un doble en memoria (con el índice
// parcial "una no terminada por consultorio" y el CHECK del email transitorio) y el gateway de MP es falso.
// El falso createPreapproval IGNORA la idempotency key (cada llamada crea otra, como MP en S4): ningún test
// puede pasar apoyándose en ella.
import { beforeEach, describe, expect, it, vi } from "vitest";

type Row = Record<string, any>;

const db = vi.hoisted(() => ({
  plans: [] as Row[],
  offers: [] as Row[],
  subs: [] as Row[],
  events: [] as Row[],
  seq: 1,
  /** createdAt de las filas nuevas = el reloj del test (+ seq para desempatar). */
  clockMs: 0,
}));

const mocks = vi.hoisted(() => {
  const OPEN = ["PENDING", "TRIALING", "ACTIVE", "PAST_DUE"];
  const eq = (a: unknown, b: unknown) =>
    a instanceof Date && b instanceof Date ? a.getTime() === b.getTime() : a === b;
  const cmp = (a: unknown, b: unknown) => {
    const x = a instanceof Date ? a.getTime() : (a as number);
    const y = b instanceof Date ? b.getTime() : (b as number);
    return x - y;
  };
  function matches(row: Row, where: Row | undefined): boolean {
    if (!where) return true;
    return Object.entries(where).every(([k, v]) => {
      if (k === "OR") return (v as Row[]).some((w) => matches(row, w));
      if (k === "AND") return (v as Row[]).every((w) => matches(row, w));
      const value = row[k];
      if (v === null) return value === null || value === undefined;
      if (v instanceof Date || typeof v !== "object") return eq(value, v);
      return Object.entries(v as Row).every(([op, arg]) => {
        switch (op) {
          case "in": return (arg as unknown[]).includes(value);
          case "not": return arg === null ? value !== null && value !== undefined : !eq(value, arg);
          case "gt": return value !== null && value !== undefined && cmp(value, arg) > 0;
          case "gte": return value !== null && value !== undefined && cmp(value, arg) >= 0;
          case "lt": return value !== null && value !== undefined && cmp(value, arg) < 0;
          case "lte": return value !== null && value !== undefined && cmp(value, arg) <= 0;
          default: throw new Error(`operador no soportado en el doble: ${op}`);
        }
      });
    });
  }
  function sortBy(rows: Row[], orderBy: unknown): Row[] {
    const specs = (Array.isArray(orderBy) ? orderBy : orderBy ? [orderBy] : []) as Row[];
    return [...rows].sort((a, b) => {
      for (const spec of specs) {
        const [key, dir] = Object.entries(spec)[0]!;
        const sort = typeof dir === "string" ? dir : (dir as Row).sort;
        const nullsFirst = typeof dir === "object" && (dir as Row).nulls === "first";
        const x = a[key] ?? null;
        const y = b[key] ?? null;
        if (x === null && y === null) continue;
        if (x === null) return nullsFirst ? -1 : 1;
        if (y === null) return nullsFirst ? 1 : -1;
        const c = typeof x === "string" ? String(x).localeCompare(String(y)) : cmp(x, y);
        if (c !== 0) return sort === "desc" ? -c : c;
      }
      return 0;
    });
  }
  const project = (row: Row | undefined, args: Row = {}) => {
    if (!row) return null;
    let out: Row = { ...row };
    if (args.include?.plan) out.plan = { name: db.plans.find((p) => p.id === row.planId)?.name };
    if (args.select) out = Object.fromEntries(Object.keys(args.select).map((k) => [k, row[k]]));
    return out;
  };
  const checkConstraints = (row: Row, self: Row = row) => {
    if (row.checkoutPayerEmail != null && !(row.status === "PENDING" && row.authorizedAt == null)) {
      throw new Error('violates check constraint "TenantSubscription_payer_email_transient"');
    }
    if (OPEN.includes(row.status) && db.subs.some((s) => s !== self && s.tenantId === row.tenantId && OPEN.includes(s.status))) {
      throw Object.assign(new Error("Unique constraint failed (TenantSubscription_open_per_tenant_key)"), { code: "P2002" });
    }
  };
  const subDefaults = () => ({
    offerId: null, status: "PENDING", mercadoPagoPreapprovalId: null, mercadoPagoStatus: null, collectorUserId: null,
    payerUserId: null, checkoutUrl: null, checkoutPayerEmail: null, checkoutCreateLeaseUntil: null, trialLength: null,
    trialUnit: null, billingCycles: null, authorizedAt: null, trialEndsAt: null, nextPaymentDate: null,
    cancelRequestedAt: null, canceledAt: null, cancelOrigin: null, mercadoPagoLastModified: null, lastSyncedAt: null,
  });
  const prisma: any = {
    $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn(prisma)),
    $executeRaw: vi.fn(async () => 1),
    $queryRaw: vi.fn(async () => []),
    subscriptionPlan: {
      findFirst: vi.fn(async (args: Row) => project(db.plans.find((p) => matches(p, args.where)), args)),
      findMany: vi.fn(async (args: Row) => db.plans.filter((p) => matches(p, args.where)).map((p) => ({ ...p }))),
    },
    subscriptionPlanOffer: {
      findFirst: vi.fn(async (args: Row) => project(db.offers.find((o) => matches(o, args.where)), args)),
      findMany: vi.fn(async (args: Row) => db.offers.filter((o) => matches(o, args.where)).map((o) => ({ ...o }))),
    },
    tenantSubscription: {
      findFirst: vi.fn(async (args: Row) => project(sortBy(db.subs.filter((s) => matches(s, args.where)), args.orderBy)[0], args)),
      findUnique: vi.fn(async (args: Row) => project(db.subs.find((s) => matches(s, args.where)), args)),
      findMany: vi.fn(async (args: Row) =>
        sortBy(db.subs.filter((s) => matches(s, args.where)), args.orderBy).slice(0, args.take ?? Infinity).map((s) => ({ ...s }))),
      create: vi.fn(async ({ data }: { data: Row }) => {
        const row = { ...subDefaults(), id: `sub-${db.seq++}`, createdAt: data.createdAt ?? new Date(db.clockMs + db.seq), ...data };
        checkConstraints(row);
        db.subs.push(row);
        return { ...row };
      }),
      update: vi.fn(async ({ where, data }: { where: Row; data: Row }) => {
        const row = db.subs.find((s) => s.id === where.id);
        if (!row) throw new Error("Record to update not found");
        const next = { ...row, ...data };
        checkConstraints(next, row);
        Object.assign(row, data);
        return { ...row };
      }),
    },
    subscriptionEvent: {
      create: vi.fn(async ({ data }: { data: Row }) => {
        db.events.push({ ...data });
        return data;
      }),
    },
  };
  return { prisma };
});

vi.mock("../index", () => ({ prisma: mocks.prisma, Prisma: {} }));

import {
  CHECKOUT_CREATE_LEASE_MS,
  cancelTenantSubscription,
  getTenantSubscriptionGate,
  getTenantSubscriptionView,
  handleSubscriptionWebhook,
  hasVerifiedSubscriptionAuthorization,
  reconcileOpenSubscriptions,
  refreshTenantSubscription,
  resumePendingCheckout,
  startTenantSubscription,
  syncSubscriptionByPreapprovalId,
} from "./subscriptions";
import type { ArziumMercadoPagoGateway } from "./subscriptionsGateway";

const COLLECTOR = "424242";
const ENV = {
  ARZIUM_SUBSCRIPTIONS_ENABLED: "true",
  ARZIUM_MERCADOPAGO_MODE: "sandbox",
  ARZIUM_MERCADOPAGO_ACCESS_TOKEN: "TEST-arzium-token",
  ARZIUM_MERCADOPAGO_USER_ID: COLLECTOR,
  ARZIUM_MERCADOPAGO_WEBHOOK_SECRET: "whsec",
  AUTH_URL: "https://numa.example.test",
  NODE_ENV: "test",
};
const DAY = 24 * 60 * 60 * 1000;
const A = { tenantId: "tenant-a" };
const B = { tenantId: "tenant-b" };
const OWNER_A = { userId: "owner-a" };
const OWNER_B = { userId: "owner-b" };
const EMAIL = "ana.mp@example.test";

let clock: Date;
const now = () => new Date(clock);
const advance = (ms: number) => {
  clock = new Date(clock.getTime() + ms);
  db.clockMs = clock.getTime();
};

/** MP falso: preapproval en memoria, la idempotency key no deduplica (S4). */
function fakeMercadoPago() {
  const store = new Map<string, Row>();
  let n = 1;
  const touch = (p: Row) => {
    p.last_modified = new Date(clock.getTime() + n++).toISOString();
  };
  const g = {
    store,
    createPreapproval: vi.fn(async (body: Row, _key: string) => {
      const id = `pre-${n++}`;
      const trial = body.auto_recurring.free_trial;
      const trialMs = trial ? (trial.frequency_type === "days" ? trial.frequency : trial.frequency * 30) * DAY : 0;
      const p: Row = {
        id,
        status: "pending",
        collector_id: Number(COLLECTOR),
        payer_email: body.payer_email,
        external_reference: body.external_reference,
        init_point: `https://www.mercadopago.com.ar/subscriptions/checkout?preapproval_id=${id}`,
        date_created: clock.toISOString(),
        next_payment_date: new Date(clock.getTime() + trialMs).toISOString(),
        auto_recurring: {
          ...body.auto_recurring,
          start_date: clock.toISOString(),
          ...(trial ? { free_trial: { ...trial, first_invoice_offset: trial.frequency } } : {}),
        },
      };
      touch(p);
      store.set(id, p);
      return structuredClone(p);
    }),
    getPreapproval: vi.fn(async (id: string) => {
      const p = store.get(id);
      if (!p) throw Object.assign(new Error("not found"), { status: 404 });
      return structuredClone(p);
    }),
    cancelPreapproval: vi.fn(async (id: string) => {
      const p = store.get(id);
      if (!p) throw Object.assign(new Error("not found"), { status: 404 });
      p.status = "cancelled";
      touch(p);
      return structuredClone(p);
    }),
    searchPreapprovalsByReference: vi.fn(async (ref: string) =>
      [...store.values()].filter((p) => p.external_reference === ref).map((p) => structuredClone(p))),
    getAuthorizedPayment: vi.fn(),
    searchAuthorizedPayments: vi.fn(),
    getPayment: vi.fn(),
    /** Solo para el test: lo que haría la persona en el checkout. */
    authorize(id: string) {
      const p = store.get(id)!;
      p.status = "authorized";
      p.payer_id = 987654321;
      touch(p);
    },
    /** Una preapproval que "existe en MP" sin pasar por createPreapproval (p. ej. tras un POST ambiguo). */
    seed(p: Row) {
      const full = {
        status: "pending",
        collector_id: Number(COLLECTOR),
        date_created: clock.toISOString(),
        init_point: `https://www.mercadopago.com.ar/subscriptions/checkout?preapproval_id=${p.id}`,
        next_payment_date: new Date(clock.getTime() + 7 * DAY).toISOString(),
        ...p,
      };
      touch(full);
      store.set(p.id, full);
    },
  };
  return g;
}

let mp: ReturnType<typeof fakeMercadoPago>;
const deps = () => ({ gateway: mp as unknown as ArziumMercadoPagoGateway, env: ENV, now });

const monthly = (over: Row = {}) => ({
  id: "plan-mensual",
  code: "mensual",
  mode: "SANDBOX",
  name: "Plan mensual",
  amount: "60000.00",
  currency: "ARS",
  frequency: 1,
  frequencyUnit: "MONTHS",
  trialLength: 7,
  trialUnit: "DAYS",
  billingCycles: null,
  isPublic: true,
  isDefault: true,
  active: true,
  ...over,
});

const subsOf = (tenantId: string) => db.subs.filter((s) => s.tenantId === tenantId);
const lastEvent = () => db.events.at(-1);

beforeEach(() => {
  vi.clearAllMocks();
  clock = new Date("2027-04-01T12:00:00Z");
  db.clockMs = clock.getTime();
  db.plans = [monthly()];
  db.offers = [];
  db.subs = [];
  db.events = [];
  db.seq = 1;
  mp = fakeMercadoPago();
});

async function startA(over: Row = {}) {
  return startTenantSubscription(A, OWNER_A, { planId: "plan-mensual", payerEmail: EMAIL, ...over }, deps());
}

describe("startTenantSubscription (§B.5.4)", () => {
  it("cobro apagado → not_available sin tocar la base ni el gateway", async () => {
    const r = await startTenantSubscription(A, OWNER_A, { planId: "plan-mensual", payerEmail: EMAIL }, { gateway: mp as never, env: {}, now });
    expect(r).toEqual({ ok: false, error: "not_available" });
    expect(mocks.prisma.subscriptionPlan.findFirst).not.toHaveBeenCalled();
    expect(mp.createPreapproval).not.toHaveBeenCalled();
  });

  it("email inválido → invalid_payer_email sin tocar la base ni el gateway", async () => {
    expect(await startA({ payerEmail: "no-es-email" })).toEqual({ ok: false, error: "invalid_payer_email" });
    expect(mocks.prisma.subscriptionPlan.findFirst).not.toHaveBeenCalled();
    expect(mp.searchPreapprovalsByReference).not.toHaveBeenCalled();
  });

  it("plan privado sin oferta → plan_not_offered; con oferta vigente → ok", async () => {
    db.plans = [monthly({ isPublic: false })];
    expect(await startA()).toEqual({ ok: false, error: "plan_not_offered" });
    db.offers = [{ id: "offer-1", tenantId: "tenant-a", planId: "plan-mensual", allowTrial: false, expiresAt: null }];
    expect((await startA()).ok).toBe(true);
  });

  it("plan inactivo, de otro modo o con términos inválidos → plan_not_offered", async () => {
    db.plans = [monthly({ active: false })];
    expect(await startA()).toEqual({ ok: false, error: "plan_not_offered" });
    db.plans = [monthly({ mode: "LIVE" })];
    expect(await startA()).toEqual({ ok: false, error: "plan_not_offered" });
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    db.plans = [monthly({ amount: "10.00" })];
    expect(await startA()).toEqual({ ok: false, error: "plan_not_offered" });
    expect(err).toHaveBeenCalledWith("[subscriptions] invalid_plan", { planId: "plan-mensual" });
    err.mockRestore();
  });

  it("primera vez: fila PENDING con términos copiados, búsqueda ANTES del POST, un solo POST con free_trial y el email", async () => {
    const r = await startA({ payerEmail: "  Ana.MP@Example.TEST " });
    expect(r.ok).toBe(true);
    const [row] = subsOf("tenant-a");
    expect(row).toMatchObject({
      status: "PENDING",
      mode: "SANDBOX",
      startedByUserId: "owner-a",
      amount: "60000.00",
      currency: "ARS",
      frequency: 1,
      frequencyUnit: "MONTHS",
      trialLength: 7,
      trialUnit: "DAYS",
      trialGranted: true,
      checkoutPayerEmail: EMAIL,
      checkoutCreateLeaseUntil: null,
      mercadoPagoStatus: "pending",
    });
    expect(row!.externalReference).toMatch(/^sub_[0-9a-f]{32}$/);
    expect(row!.checkoutUrl).toBe((r as { checkoutUrl: string }).checkoutUrl);
    expect(row!.nextPaymentDate).toEqual(new Date(clock.getTime() + 7 * DAY));

    const searchOrder = mp.searchPreapprovalsByReference.mock.invocationCallOrder[0]!;
    const createOrder = mp.createPreapproval.mock.invocationCallOrder[0]!;
    expect(searchOrder).toBeLessThan(createOrder);
    expect(mp.createPreapproval).toHaveBeenCalledTimes(1);
    const [body, key] = mp.createPreapproval.mock.calls[0]!;
    expect(body).toEqual({
      reason: "Plan mensual",
      external_reference: row!.externalReference,
      back_url: "https://numa.example.test/ajustes/suscripcion?mp=volver",
      status: "pending",
      payer_email: EMAIL,
      auto_recurring: {
        frequency: 1,
        frequency_type: "months",
        transaction_amount: 60000,
        currency_id: "ARS",
        free_trial: { frequency: 7, frequency_type: "days" },
      },
    });
    expect(key).toBe(row!.id);
    expect(lastEvent()).toMatchObject({ source: "PANEL", topic: "panel_start", result: "APPLIED" });
  });

  it("ARZIUM_SUBSCRIPTIONS_BACK_URL reemplaza la vuelta", async () => {
    await startTenantSubscription(A, OWNER_A, { planId: "plan-mensual", payerEmail: EMAIL }, {
      ...deps(), env: { ...ENV, ARZIUM_SUBSCRIPTIONS_BACK_URL: "https://tunel.example.test/ajustes/suscripcion?mp=volver" },
    });
    expect(mp.createPreapproval.mock.calls[0]![0].back_url).toBe("https://tunel.example.test/ajustes/suscripcion?mp=volver");
  });

  it("dos veces: la segunda devuelve el mismo checkoutUrl sin otro POST", async () => {
    const first = await startA();
    const second = await startA({ planId: "plan-mensual", payerEmail: "otra@example.test" });
    expect(second).toEqual(first);
    expect(mp.createPreapproval).toHaveBeenCalledTimes(1);
    expect(subsOf("tenant-a")).toHaveLength(1);
  });

  it("con TRIALING → already_subscribed", async () => {
    await startA();
    mp.authorize(subsOf("tenant-a")[0]!.mercadoPagoPreapprovalId);
    await syncSubscriptionByPreapprovalId(subsOf("tenant-a")[0]!.mercadoPagoPreapprovalId, "WEBHOOK", {}, deps());
    expect(subsOf("tenant-a")[0]!.status).toBe("TRIALING");
    expect(await startA()).toEqual({ ok: false, error: "already_subscribed" });
  });

  describe("lease de creación (G2)", () => {
    const leasedRow = (until: Date) => ({
      id: "sub-leased", tenantId: "tenant-a", planId: "plan-mensual", startedByUserId: "owner-a", mode: "SANDBOX",
      status: "PENDING", externalReference: "sub_leased", amount: "60000.00", currency: "ARS", frequency: 1,
      frequencyUnit: "MONTHS", trialLength: 7, trialUnit: "DAYS", billingCycles: null, trialGranted: true,
      checkoutPayerEmail: EMAIL, checkoutCreateLeaseUntil: until, checkoutUrl: null, mercadoPagoPreapprovalId: null,
      authorizedAt: null, createdAt: new Date(clock.getTime() - 60_000), offerId: null, lastSyncedAt: null,
      mercadoPagoLastModified: null, cancelRequestedAt: null, cancelOrigin: null, canceledAt: null, nextPaymentDate: null,
      mercadoPagoStatus: null, collectorUserId: null, payerUserId: null, trialEndsAt: null,
    });

    it("lease vigente → checkout_in_progress sin llamar al gateway", async () => {
      db.subs = [leasedRow(new Date(clock.getTime() + 10_000))];
      expect(await startA()).toEqual({ ok: false, error: "checkout_in_progress" });
      expect(mp.searchPreapprovalsByReference).not.toHaveBeenCalled();
      expect(mp.createPreapproval).not.toHaveBeenCalled();
    });

    it("lease vencido → toma el lease, busca y crea una vez", async () => {
      db.subs = [leasedRow(new Date(clock.getTime() - 1))];
      const r = await startA();
      expect(r.ok).toBe(true);
      expect(mp.searchPreapprovalsByReference).toHaveBeenCalledWith("sub_leased");
      expect(mp.createPreapproval).toHaveBeenCalledTimes(1);
      expect(db.subs[0]!.checkoutCreateLeaseUntil).toBeNull();
    });

    it("lease vencido y la búsqueda trae una pending → la adopta sin POST", async () => {
      db.subs = [leasedRow(new Date(clock.getTime() - 1))];
      mp.seed({ id: "pre-x", external_reference: "sub_leased", auto_recurring: {
        frequency: 1, frequency_type: "months", transaction_amount: 60000, currency_id: "ARS",
        free_trial: { frequency: 7, frequency_type: "days", first_invoice_offset: 7 } } });
      const r = await startA();
      expect(r).toEqual({ ok: true, checkoutUrl: "https://www.mercadopago.com.ar/subscriptions/checkout?preapproval_id=pre-x" });
      expect(mp.createPreapproval).not.toHaveBeenCalled();
      expect(db.subs[0]!.mercadoPagoPreapprovalId).toBe("pre-x");
    });

    it("la búsqueda trae solo cancelled → crea", async () => {
      db.subs = [leasedRow(new Date(clock.getTime() - 1))];
      mp.seed({ id: "pre-old", status: "cancelled", external_reference: "sub_leased" });
      await startA();
      expect(mp.createPreapproval).toHaveBeenCalledTimes(1);
    });

    it("dos pending → adopta la más reciente y cancela la otra (duplicate_canceled)", async () => {
      db.subs = [leasedRow(new Date(clock.getTime() - 1))];
      const ar = { frequency: 1, frequency_type: "months", transaction_amount: 60000, currency_id: "ARS",
        free_trial: { frequency: 7, frequency_type: "days", first_invoice_offset: 7 } };
      mp.seed({ id: "pre-older", external_reference: "sub_leased", date_created: "2027-04-01T11:00:00Z", auto_recurring: ar });
      mp.seed({ id: "pre-newer", external_reference: "sub_leased", date_created: "2027-04-01T11:30:00Z", auto_recurring: ar });
      const r = await startA();
      expect(r).toMatchObject({ ok: true, checkoutUrl: expect.stringContaining("pre-newer") });
      expect(mp.cancelPreapproval).toHaveBeenCalledWith("pre-older");
      expect(mp.store.get("pre-older")!.status).toBe("cancelled");
      expect(db.events).toContainEqual(expect.objectContaining({ resourceId: "pre-older", reason: "duplicate_canceled", result: "APPLIED" }));
      expect(mp.createPreapproval).not.toHaveBeenCalled();
    });

    it("una authorized en la búsqueda → la aplica y already_subscribed", async () => {
      db.subs = [leasedRow(new Date(clock.getTime() - 1))];
      mp.seed({ id: "pre-auth", status: "authorized", external_reference: "sub_leased", auto_recurring: {
        frequency: 1, frequency_type: "months", transaction_amount: 60000, currency_id: "ARS",
        free_trial: { frequency: 7, frequency_type: "days", first_invoice_offset: 7 } } });
      expect(await startA()).toEqual({ ok: false, error: "already_subscribed" });
      expect(db.subs[0]).toMatchObject({ status: "TRIALING", mercadoPagoPreapprovalId: "pre-auth", checkoutPayerEmail: null, checkoutCreateLeaseUntil: null });
      expect(db.subs[0]!.authorizedAt).toEqual(clock);
    });
  });

  it("búsqueda que tira → mp_unavailable y createPreapproval NO se llama", async () => {
    mp.searchPreapprovalsByReference.mockRejectedValueOnce(new Error("timeout"));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(await startA()).toEqual({ ok: false, error: "mp_unavailable" });
    expect(mp.createPreapproval).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith("[subscriptions] mp_error", { op: "search" });
    warn.mockRestore();
  });

  it("POST ambiguo (timeout): una sola llamada, lease conservado; dentro de 45 s checkout_in_progress; después busca y adopta", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    // MP la creó aunque el cliente vio un timeout.
    mp.createPreapproval.mockImplementationOnce(async (body: Row) => {
      mp.seed({ id: "pre-ghost", external_reference: body.external_reference, auto_recurring: {
        ...body.auto_recurring, free_trial: { ...body.auto_recurring.free_trial, first_invoice_offset: 7 } } });
      throw new Error("The operation was aborted due to timeout");
    });
    expect(await startA()).toEqual({ ok: false, error: "mp_unavailable" });
    expect(mp.createPreapproval).toHaveBeenCalledTimes(1);
    const row = subsOf("tenant-a")[0]!;
    expect(row.checkoutCreateLeaseUntil).toEqual(new Date(clock.getTime() + CHECKOUT_CREATE_LEASE_MS));
    expect(warn).toHaveBeenCalledWith("[subscriptions] mp_error", { op: "create" });

    advance(30_000);
    mp.searchPreapprovalsByReference.mockClear();
    expect(await startA()).toEqual({ ok: false, error: "checkout_in_progress" });
    expect(mp.searchPreapprovalsByReference).not.toHaveBeenCalled();

    advance(16_000); // 46 s después del primer intento
    const r = await startA();
    expect(r).toMatchObject({ ok: true, checkoutUrl: expect.stringContaining("pre-ghost") });
    expect(mp.createPreapproval).toHaveBeenCalledTimes(1);
    expect(subsOf("tenant-a")).toHaveLength(1);
    warn.mockRestore();
  });

  it("400 \"User bad request\" → payer_email_rejected; lease y email null; evento REJECTED sin el email", async () => {
    mp.createPreapproval.mockRejectedValueOnce(Object.assign(new Error("User bad request"), { status: 400 }));
    expect(await startA()).toEqual({ ok: false, error: "payer_email_rejected" });
    expect(subsOf("tenant-a")[0]).toMatchObject({ checkoutCreateLeaseUntil: null, checkoutPayerEmail: null, checkoutUrl: null });
    expect(lastEvent()).toMatchObject({ result: "REJECTED", reason: "payer_email_rejected" });
    expect(JSON.stringify(db.events)).not.toContain("@");
  });

  it("400 \"payer_email is required\" → invalid_payer_email", async () => {
    mp.createPreapproval.mockRejectedValueOnce(Object.assign(new Error("payer_email is required"), { status: 400 }));
    expect(await startA()).toEqual({ ok: false, error: "invalid_payer_email" });
    expect(subsOf("tenant-a")[0]!.checkoutPayerEmail).toBeNull();
  });

  it("400 \"Cannot pay an amount…\" → plan_not_offered + console.error invalid_plan", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    mp.createPreapproval.mockRejectedValueOnce(Object.assign(new Error("Cannot pay an amount lower than $ 15.00"), { status: 400 }));
    expect(await startA()).toEqual({ ok: false, error: "plan_not_offered" });
    expect(err).toHaveBeenCalledWith("[subscriptions] invalid_plan", { planId: "plan-mensual" });
    expect(subsOf("tenant-a")[0]!.checkoutCreateLeaseUntil).toBeNull();
    err.mockRestore();
  });

  it("404 → mp_unavailable con lease null", async () => {
    mp.createPreapproval.mockRejectedValueOnce(Object.assign(new Error("x"), { status: 404 }));
    expect(await startA()).toEqual({ ok: false, error: "mp_unavailable" });
    expect(subsOf("tenant-a")[0]!.checkoutCreateLeaseUntil).toBeNull();
    expect(lastEvent()).toMatchObject({ result: "REJECTED", reason: "mp_rejected" });
  });

  it.each([
    ["importe", { transaction_amount: 59999 }, "amount_mismatch"],
    ["referencia", { __ref: "sub_otra" }, "reference_mismatch"],
    ["cobrador", { __collector: 111 }, "collector_mismatch"],
  ])("respuesta de MP con otro %s → REJECTED y mp_unavailable, fila sin checkoutUrl", async (_n, change: Row, reason) => {
    mp.createPreapproval.mockImplementationOnce(async (body: Row) => {
      const p = {
        id: "pre-bad", status: "pending", collector_id: change.__collector ?? Number(COLLECTOR),
        external_reference: change.__ref ?? body.external_reference,
        init_point: "https://www.mercadopago.com.ar/x", auto_recurring: { ...body.auto_recurring, ...change,
          free_trial: { ...body.auto_recurring.free_trial, first_invoice_offset: 7 } },
      };
      delete (p.auto_recurring as Row).__ref;
      delete (p.auto_recurring as Row).__collector;
      return p;
    });
    expect(await startA()).toEqual({ ok: false, error: "mp_unavailable" });
    expect(subsOf("tenant-a")[0]).toMatchObject({ checkoutUrl: null, checkoutCreateLeaseUntil: null, mercadoPagoPreapprovalId: null });
    expect(lastEvent()).toMatchObject({ result: "REJECTED", reason });
  });

  describe("re-alta y prueba gratis (D7b + ofertas)", () => {
    async function subscribeAndCancel(t = A, actor = OWNER_A) {
      const r = await startTenantSubscription(t, actor, { planId: "plan-mensual", payerEmail: EMAIL }, deps());
      expect(r.ok).toBe(true);
      const row = db.subs.find((s) => s.tenantId === t.tenantId && s.status === "PENDING")!;
      mp.authorize(row.mercadoPagoPreapprovalId);
      await syncSubscriptionByPreapprovalId(row.mercadoPagoPreapprovalId, "WEBHOOK", {}, deps());
      expect(await cancelTenantSubscription(t, actor, deps())).toEqual({ ok: true });
      advance(60_000);
    }

    it("re-alta después de una CANCELED autorizada → sin prueba", async () => {
      await subscribeAndCancel();
      await startA();
      const open = subsOf("tenant-a").find((s) => s.status === "PENDING")!;
      expect(open.trialGranted).toBe(false);
      expect(mp.createPreapproval.mock.calls.at(-1)![0].auto_recurring.free_trial).toBeUndefined();
    });

    it("con oferta allowTrial → con prueba (una vez)", async () => {
      await subscribeAndCancel();
      db.offers = [{ id: "offer-1", tenantId: "tenant-a", planId: "plan-mensual", allowTrial: true, expiresAt: null }];
      await startA();
      const open = subsOf("tenant-a").find((s) => s.status === "PENDING")!;
      expect(open).toMatchObject({ trialGranted: true, offerId: "offer-1" });
    });

    it("la misma OWNER en otro consultorio → sin prueba", async () => {
      await subscribeAndCancel();
      await startTenantSubscription(B, OWNER_A, { planId: "plan-mensual", payerEmail: EMAIL }, deps());
      expect(subsOf("tenant-b")[0]!.trialGranted).toBe(false);
      // Otra OWNER en B sí tendría prueba.
      db.subs = db.subs.filter((s) => s.tenantId !== "tenant-b");
      await startTenantSubscription(B, OWNER_B, { planId: "plan-mensual", payerEmail: EMAIL }, deps());
      expect(subsOf("tenant-b")[0]!.trialGranted).toBe(true);
    });

    it("un checkout abandonado no consume la prueba", async () => {
      await startA();
      advance(60_000);
      await startA({ restart: true });
      expect(subsOf("tenant-a").find((s) => s.status === "PENDING")!.trialGranted).toBe(true);
    });
  });

  describe("restart (Empezar de nuevo)", () => {
    it("cancela en MP, verifica y abandona (checkoutUrl, email y lease null; authorizedAt null)", async () => {
      await startA();
      const old = subsOf("tenant-a")[0]!;
      const oldPre = old.mercadoPagoPreapprovalId;
      advance(60_000);
      const r = await startA({ restart: true, payerEmail: "nuevo@example.test" });
      expect(r.ok).toBe(true);
      expect(mp.cancelPreapproval).toHaveBeenCalledWith(oldPre);
      expect(old).toMatchObject({
        status: "CANCELED", cancelOrigin: "PANEL", authorizedAt: null, checkoutUrl: null, checkoutPayerEmail: null, checkoutCreateLeaseUntil: null,
      });
      const fresh = subsOf("tenant-a").find((s) => s.status === "PENDING")!;
      expect(fresh.externalReference).not.toBe(old.externalReference);
      expect(fresh.checkoutPayerEmail).toBe("nuevo@example.test");
      expect(db.events).toContainEqual(expect.objectContaining({ topic: "panel_restart", result: "APPLIED", reason: "restart" }));
    });

    it("MP no confirma la cancelación → restart_unconfirmed y nada cambia", async () => {
      await startA();
      const old = { ...subsOf("tenant-a")[0]! };
      mp.cancelPreapproval.mockImplementationOnce(async () => ({}));
      expect(await startA({ restart: true })).toEqual({ ok: false, error: "restart_unconfirmed" });
      expect(subsOf("tenant-a")).toHaveLength(1);
      expect(subsOf("tenant-a")[0]).toMatchObject({ status: "PENDING", checkoutUrl: old.checkoutUrl, checkoutPayerEmail: EMAIL });
      expect(mp.createPreapproval).toHaveBeenCalledTimes(1);
    });

    it("MP dice authorized → aplica y already_subscribed", async () => {
      await startA();
      mp.authorize(subsOf("tenant-a")[0]!.mercadoPagoPreapprovalId);
      expect(await startA({ restart: true })).toEqual({ ok: false, error: "already_subscribed" });
      expect(subsOf("tenant-a")[0]!.status).toBe("TRIALING");
      expect(mp.cancelPreapproval).not.toHaveBeenCalled();
    });

    it("restart con lease vigente → checkout_in_progress", async () => {
      mp.searchPreapprovalsByReference.mockImplementationOnce(async () => {
        throw new Error("down");
      });
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      await startA(); // deja la fila con lease vigente (la búsqueda falló)
      expect(await startA({ restart: true })).toEqual({ ok: false, error: "checkout_in_progress" });
      warn.mockRestore();
    });
  });
});

describe("resumePendingCheckout (§B.5.4b, DP1)", () => {
  it("fresca → la URL guardada sin gateway", async () => {
    const { checkoutUrl } = (await startA()) as { checkoutUrl: string };
    vi.clearAllMocks();
    advance(30 * 60 * 1000);
    expect(await resumePendingCheckout(A, OWNER_A, deps())).toEqual({ ok: true, checkoutUrl });
    expect(mp.searchPreapprovalsByReference).not.toHaveBeenCalled();
    expect(mp.getPreapproval).not.toHaveBeenCalled();
  });

  it("con prueba y pérdida > 1 h → cancela la vieja, fila nueva con otra referencia, mismo plan y email; evento stale_checkout", async () => {
    await startA();
    const old = subsOf("tenant-a")[0]!;
    advance(2 * 60 * 60 * 1000);
    const r = await resumePendingCheckout(A, OWNER_A, deps());
    expect(r.ok).toBe(true);
    expect(mp.store.get(old.mercadoPagoPreapprovalId)!.status).toBe("cancelled");
    const fresh = subsOf("tenant-a").find((s) => s.status === "PENDING")!;
    expect(fresh).toMatchObject({ planId: "plan-mensual", checkoutPayerEmail: EMAIL, trialGranted: true });
    expect(fresh.externalReference).not.toBe(old.externalReference);
    expect((r as { checkoutUrl: string }).checkoutUrl).toBe(fresh.checkoutUrl);
    expect(db.events).toContainEqual(expect.objectContaining({ topic: "panel_restart", reason: "stale_checkout" }));
  });

  it("sin prueba y vieja → la URL guardada sin gateway", async () => {
    db.plans = [monthly({ trialLength: null, trialUnit: null })];
    const { checkoutUrl } = (await startA()) as { checkoutUrl: string };
    vi.clearAllMocks();
    advance(3 * DAY);
    expect(await resumePendingCheckout(A, OWNER_A, deps())).toEqual({ ok: true, checkoutUrl });
    expect(mp.getPreapproval).not.toHaveBeenCalled();
  });

  it("cancelación no confirmada → la URL vieja y nada cambia", async () => {
    const { checkoutUrl } = (await startA()) as { checkoutUrl: string };
    advance(2 * 60 * 60 * 1000);
    mp.cancelPreapproval.mockImplementationOnce(async () => ({}));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(await resumePendingCheckout(A, OWNER_A, deps())).toEqual({ ok: true, checkoutUrl });
    expect(subsOf("tenant-a")).toHaveLength(1);
    expect(subsOf("tenant-a")[0]!.status).toBe("PENDING");
    expect(warn).toHaveBeenCalledWith("[subscriptions] stale_checkout_kept", { subscriptionId: subsOf("tenant-a")[0]!.id });
    warn.mockRestore();
  });

  it("la vieja está authorized → aplica y already_subscribed", async () => {
    await startA();
    advance(2 * 60 * 60 * 1000);
    mp.authorize(subsOf("tenant-a")[0]!.mercadoPagoPreapprovalId);
    expect(await resumePendingCheckout(A, OWNER_A, deps())).toEqual({ ok: false, error: "already_subscribed" });
    expect(subsOf("tenant-a")[0]!.status).toBe("TRIALING");
  });

  it("sin PENDING → not_found; cobro apagado → not_available", async () => {
    expect(await resumePendingCheckout(A, OWNER_A, deps())).toEqual({ ok: false, error: "not_found" });
    expect(await resumePendingCheckout(A, OWNER_A, { ...deps(), env: {} })).toEqual({ ok: false, error: "not_available" });
  });
});

describe("syncSubscriptionByPreapprovalId (§B.5.5)", () => {
  async function pendingA() {
    await startA();
    return subsOf("tenant-a")[0]!;
  }

  it("authorized + prueba → TRIALING; trialEndsAt = next_payment_date de MP (creación + 7 d, no autorización + 7 d)", async () => {
    const row = await pendingA();
    const created = new Date(clock);
    advance(5 * DAY);
    mp.authorize(row.mercadoPagoPreapprovalId);
    expect(await syncSubscriptionByPreapprovalId(row.mercadoPagoPreapprovalId, "WEBHOOK", { requestId: "req-1" }, deps())).toBe("applied");
    expect(row).toMatchObject({
      status: "TRIALING", checkoutUrl: null, checkoutPayerEmail: null, checkoutCreateLeaseUntil: null,
      collectorUserId: COLLECTOR, payerUserId: "987654321", mercadoPagoStatus: "authorized",
    });
    expect(row.authorizedAt).toEqual(clock);
    expect(row.trialEndsAt).toEqual(new Date(created.getTime() + 7 * DAY));
    expect(row.nextPaymentDate).toEqual(new Date(created.getTime() + 7 * DAY));
    expect(lastEvent()).toMatchObject({ source: "WEBHOOK", topic: "preapproval", result: "APPLIED", requestId: "req-1", tenantId: "tenant-a" });
  });

  it("authorized sin prueba → PENDING con authorizedAt y sin email", async () => {
    db.plans = [monthly({ trialLength: null, trialUnit: null })];
    const row = await pendingA();
    mp.authorize(row.mercadoPagoPreapprovalId);
    await syncSubscriptionByPreapprovalId(row.mercadoPagoPreapprovalId, "WEBHOOK", {}, deps());
    expect(row).toMatchObject({ status: "PENDING", checkoutPayerEmail: null, checkoutUrl: null, trialEndsAt: null });
    expect(row.authorizedAt).toEqual(clock);
  });

  it("trial_mismatch → REJECTED sin cambios", async () => {
    const row = await pendingA();
    mp.authorize(row.mercadoPagoPreapprovalId);
    delete mp.store.get(row.mercadoPagoPreapprovalId)!.auto_recurring.free_trial;
    expect(await syncSubscriptionByPreapprovalId(row.mercadoPagoPreapprovalId, "WEBHOOK", {}, deps())).toBe("rejected");
    expect(row).toMatchObject({ status: "PENDING", authorizedAt: null });
    expect(lastEvent()).toMatchObject({ result: "REJECTED", reason: "trial_mismatch" });
  });

  it.each([
    ["amount_mismatch", (p: Row) => { p.auto_recurring.transaction_amount = 1; }],
    ["currency_mismatch", (p: Row) => { p.auto_recurring.currency_id = "USD"; }],
    ["frequency_mismatch", (p: Row) => { p.auto_recurring.frequency = 3; }],
    ["collector_mismatch", (p: Row) => { p.collector_id = 1; }],
  ])("%s → REJECTED sin cambios", async (reason, mutate) => {
    const row = await pendingA();
    mp.authorize(row.mercadoPagoPreapprovalId);
    mutate(mp.store.get(row.mercadoPagoPreapprovalId)!);
    expect(await syncSubscriptionByPreapprovalId(row.mercadoPagoPreapprovalId, "WEBHOOK", {}, deps())).toBe("rejected");
    expect(row).toMatchObject({ status: "PENDING", authorizedAt: null, checkoutPayerEmail: EMAIL });
    expect(lastEvent()).toMatchObject({ result: "REJECTED", reason });
  });

  it("abandonada (CANCELED, authorizedAt null, PANEL) + authorized → cancelPreapproval y REJECTED authorized_after_abandon", async () => {
    const row = await pendingA();
    const pre = row.mercadoPagoPreapprovalId;
    advance(60_000);
    await startA({ restart: true });
    mp.store.get(pre)!.status = "authorized"; // S8 sin verificar: la autorizó igual
    mp.store.get(pre)!.last_modified = new Date(clock.getTime() + 999_999).toISOString();
    mp.cancelPreapproval.mockClear();
    expect(await syncSubscriptionByPreapprovalId(pre, "WEBHOOK", {}, deps())).toBe("rejected");
    expect(mp.cancelPreapproval).toHaveBeenCalledWith(pre);
    expect(row).toMatchObject({ status: "CANCELED", authorizedAt: null });
    expect(lastEvent()).toMatchObject({ result: "REJECTED", reason: "authorized_after_abandon" });
  });

  it("el updated de una pending abandonada (cancelled) → IGNORED/terminated (S6)", async () => {
    const row = await pendingA();
    const pre = row.mercadoPagoPreapprovalId;
    advance(60_000);
    await startA({ restart: true });
    expect(await syncSubscriptionByPreapprovalId(pre, "WEBHOOK", {}, deps())).toBe("ignored");
    expect(lastEvent()).toMatchObject({ result: "IGNORED", reason: "terminated" });
  });

  it("snapshot más viejo → UNCHANGED/stale_snapshot; el mismo dos veces → la segunda UNCHANGED", async () => {
    const row = await pendingA();
    mp.authorize(row.mercadoPagoPreapprovalId);
    expect(await syncSubscriptionByPreapprovalId(row.mercadoPagoPreapprovalId, "WEBHOOK", {}, deps())).toBe("applied");
    expect(await syncSubscriptionByPreapprovalId(row.mercadoPagoPreapprovalId, "RECONCILIATION", {}, deps())).toBe("unchanged");
    mp.store.get(row.mercadoPagoPreapprovalId)!.last_modified = "2020-01-01T00:00:00Z";
    expect(await syncSubscriptionByPreapprovalId(row.mercadoPagoPreapprovalId, "WEBHOOK", {}, deps())).toBe("unchanged");
    expect(lastEvent()).toMatchObject({ result: "UNCHANGED", reason: "stale_snapshot" });
  });

  it("cancelled con cancelRequestedAt reciente → CANCELED/PANEL; sin él → MERCADO_PAGO", async () => {
    const row = await pendingA();
    mp.authorize(row.mercadoPagoPreapprovalId);
    await syncSubscriptionByPreapprovalId(row.mercadoPagoPreapprovalId, "WEBHOOK", {}, deps());
    mp.store.get(row.mercadoPagoPreapprovalId)!.status = "cancelled";
    mp.store.get(row.mercadoPagoPreapprovalId)!.last_modified = new Date(clock.getTime() + 10_000_000).toISOString();
    expect(await syncSubscriptionByPreapprovalId(row.mercadoPagoPreapprovalId, "WEBHOOK", {}, deps())).toBe("applied");
    expect(row).toMatchObject({ status: "CANCELED", cancelOrigin: "MERCADO_PAGO" });
    expect(row.canceledAt).toEqual(clock);

    db.subs = [];
    await startTenantSubscription(B, OWNER_B, { planId: "plan-mensual", payerEmail: EMAIL }, deps());
    const b = subsOf("tenant-b")[0]!;
    mp.authorize(b.mercadoPagoPreapprovalId);
    await syncSubscriptionByPreapprovalId(b.mercadoPagoPreapprovalId, "WEBHOOK", {}, deps());
    b.cancelRequestedAt = new Date(clock.getTime() - 60_000);
    mp.store.get(b.mercadoPagoPreapprovalId)!.status = "cancelled";
    mp.store.get(b.mercadoPagoPreapprovalId)!.last_modified = new Date(clock.getTime() + 20_000_000).toISOString();
    await syncSubscriptionByPreapprovalId(b.mercadoPagoPreapprovalId, "WEBHOOK", {}, deps());
    expect(b).toMatchObject({ status: "CANCELED", cancelOrigin: "PANEL" });
  });

  it("CANCELED + authorized (baja real) → IGNORED/terminated", async () => {
    const row = await pendingA();
    mp.authorize(row.mercadoPagoPreapprovalId);
    await syncSubscriptionByPreapprovalId(row.mercadoPagoPreapprovalId, "WEBHOOK", {}, deps());
    await cancelTenantSubscription(A, OWNER_A, deps());
    mp.store.get(row.mercadoPagoPreapprovalId)!.status = "authorized";
    mp.store.get(row.mercadoPagoPreapprovalId)!.last_modified = new Date(clock.getTime() + 10_000_000).toISOString();
    expect(await syncSubscriptionByPreapprovalId(row.mercadoPagoPreapprovalId, "WEBHOOK", {}, deps())).toBe("ignored");
    expect(row.status).toBe("CANCELED");
    expect(lastEvent()).toMatchObject({ result: "IGNORED", reason: "terminated" });
  });

  it("preapproval desconocida → IGNORED sin tenant", async () => {
    mp.seed({ id: "pre-unknown", external_reference: "sub_nadie" });
    expect(await syncSubscriptionByPreapprovalId("pre-unknown", "WEBHOOK", {}, deps())).toBe("ignored");
    expect(lastEvent()).toMatchObject({ result: "IGNORED", reason: "unknown_preapproval", tenantId: null, subscriptionId: null });
  });

  it("duplicado autorizado (misma referencia, otro id) con la guardada autorizada → cancela el entrante", async () => {
    const row = await pendingA();
    mp.authorize(row.mercadoPagoPreapprovalId);
    await syncSubscriptionByPreapprovalId(row.mercadoPagoPreapprovalId, "WEBHOOK", {}, deps());
    const original = mp.store.get(row.mercadoPagoPreapprovalId)!;
    mp.seed({ ...structuredClone(original), id: "pre-dup", status: "authorized" });
    expect(await syncSubscriptionByPreapprovalId("pre-dup", "WEBHOOK", {}, deps())).toBe("applied");
    expect(mp.cancelPreapproval).toHaveBeenCalledWith("pre-dup");
    expect(row.mercadoPagoPreapprovalId).toBe(original.id);
    expect(lastEvent()).toMatchObject({ result: "APPLIED", reason: "duplicate_canceled" });
  });

  it("duplicado autorizado con la guardada sin autorizar → adopta el entrante y cancela la vieja", async () => {
    const row = await pendingA();
    const oldId = row.mercadoPagoPreapprovalId;
    const original = mp.store.get(oldId)!;
    mp.seed({ ...structuredClone(original), id: "pre-dup", status: "authorized" });
    expect(await syncSubscriptionByPreapprovalId("pre-dup", "WEBHOOK", {}, deps())).toBe("applied");
    expect(row).toMatchObject({ mercadoPagoPreapprovalId: "pre-dup", status: "TRIALING" });
    expect(mp.cancelPreapproval).toHaveBeenCalledWith(oldId);
  });

  it("cobro apagado → ignored sin consultar MP; recurso inválido → REJECTED/invalid_resource", async () => {
    expect(await syncSubscriptionByPreapprovalId("pre-1", "WEBHOOK", {}, { ...deps(), env: {} })).toBe("ignored");
    expect(mp.getPreapproval).not.toHaveBeenCalled();
    mp.getPreapproval.mockResolvedValueOnce({ nada: true });
    expect(await syncSubscriptionByPreapprovalId("pre-1", "WEBHOOK", {}, deps())).toBe("rejected");
    expect(lastEvent()).toMatchObject({ result: "REJECTED", reason: "invalid_resource" });
  });

  it("error del SDK → tira un error genérico (sin el del SDK) y loguea solo el código", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    mp.getPreapproval.mockRejectedValueOnce(Object.assign(new Error("Bearer TEST-arzium-token"), { status: 500 }));
    await expect(syncSubscriptionByPreapprovalId("pre-1", "WEBHOOK", {}, deps())).rejects.toThrow("mp_unavailable");
    expect(JSON.stringify(warn.mock.calls)).not.toContain("TEST-arzium-token");
    warn.mockRestore();
  });
});

describe("cancelTenantSubscription (§B.5.6)", () => {
  async function trialingA() {
    await startA();
    const row = subsOf("tenant-a")[0]!;
    mp.authorize(row.mercadoPagoPreapprovalId);
    await syncSubscriptionByPreapprovalId(row.mercadoPagoPreapprovalId, "WEBHOOK", {}, deps());
    return row;
  }

  it("ok → CANCELED/PANEL con evento panel_cancel", async () => {
    const row = await trialingA();
    expect(await cancelTenantSubscription(A, OWNER_A, deps())).toEqual({ ok: true });
    expect(row).toMatchObject({ status: "CANCELED", cancelOrigin: "PANEL" });
    expect(lastEvent()).toMatchObject({ source: "PANEL", topic: "panel_cancel", result: "APPLIED" });
  });

  it("error del gateway → mp_unavailable y el estado no cambia", async () => {
    const row = await trialingA();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    mp.cancelPreapproval.mockRejectedValueOnce(new Error("timeout"));
    expect(await cancelTenantSubscription(A, OWNER_A, deps())).toEqual({ ok: false, error: "mp_unavailable" });
    expect(row.status).toBe("TRIALING");
    warn.mockRestore();
  });

  it("get sin cancelled → cancel_unconfirmed y el estado no cambia", async () => {
    const row = await trialingA();
    mp.cancelPreapproval.mockImplementationOnce(async () => ({}));
    expect(await cancelTenantSubscription(A, OWNER_A, deps())).toEqual({ ok: false, error: "cancel_unconfirmed" });
    expect(row.status).toBe("TRIALING");
  });

  it("PENDING sin autorizar o nada → nothing_to_cancel; cobro apagado → not_available", async () => {
    expect(await cancelTenantSubscription(A, OWNER_A, deps())).toEqual({ ok: false, error: "nothing_to_cancel" });
    await startA();
    expect(await cancelTenantSubscription(A, OWNER_A, deps())).toEqual({ ok: false, error: "nothing_to_cancel" });
    expect(await cancelTenantSubscription(A, OWNER_A, { ...deps(), env: {} })).toEqual({ ok: false, error: "not_available" });
  });

  it("PENDING autorizada (sin prueba, X8) se puede cancelar", async () => {
    db.plans = [monthly({ trialLength: null, trialUnit: null })];
    await startA();
    const row = subsOf("tenant-a")[0]!;
    mp.authorize(row.mercadoPagoPreapprovalId);
    await syncSubscriptionByPreapprovalId(row.mercadoPagoPreapprovalId, "WEBHOOK", {}, deps());
    expect(await cancelTenantSubscription(A, OWNER_A, deps())).toEqual({ ok: true });
    expect(row.status).toBe("CANCELED");
  });
});

describe("refreshTenantSubscription", () => {
  it("lastSyncedAt hace 1 s → no llama al gateway", async () => {
    await startA();
    vi.clearAllMocks();
    advance(1_000);
    expect(await refreshTenantSubscription(A, deps())).toEqual({ result: "unchanged", status: "PENDING", authorized: false });
    expect(mp.getPreapproval).not.toHaveBeenCalled();
  });

  it("pasados 3 s sincroniza y devuelve el estado nuevo", async () => {
    await startA();
    mp.authorize(subsOf("tenant-a")[0]!.mercadoPagoPreapprovalId);
    advance(4_000);
    expect(await refreshTenantSubscription(A, deps())).toEqual({ result: "applied", status: "TRIALING", authorized: true });
  });

  it("sin suscripción → none", async () => {
    expect(await refreshTenantSubscription(A, deps())).toEqual({ result: "none", status: null, authorized: false });
  });
});

describe("handleSubscriptionWebhook", () => {
  it("subscription_preapproval → sync", async () => {
    await startA();
    const pre = subsOf("tenant-a")[0]!.mercadoPagoPreapprovalId;
    mp.authorize(pre);
    expect(await handleSubscriptionWebhook({ topic: "subscription_preapproval", resourceId: pre, requestId: "r" }, deps())).toBe("processed");
    expect(subsOf("tenant-a")[0]!.status).toBe("TRIALING");
  });

  it.each(["payment", "subscription_authorized_payment", "otro", null])("%s → ignored sin llamar al gateway (029b)", async (topic) => {
    expect(await handleSubscriptionWebhook({ topic, resourceId: "123", requestId: null }, deps())).toBe("ignored");
    expect(mp.getPreapproval).not.toHaveBeenCalled();
    expect(mp.getPayment).not.toHaveBeenCalled();
  });

  it("cobro apagado → ignored", async () => {
    expect(await handleSubscriptionWebhook({ topic: "subscription_preapproval", resourceId: "1", requestId: null }, { ...deps(), env: {} })).toBe("ignored");
  });
});

describe("reconcileOpenSubscriptions", () => {
  it("cobro apagado → 0/0/0 sin consultas", async () => {
    expect(await reconcileOpenSubscriptions(undefined, { ...deps(), env: {} })).toEqual({ processed: 0, failed: 0, skipped: 0 });
    expect(mocks.prisma.tenantSubscription.findMany).not.toHaveBeenCalled();
  });

  it("un throw en una suscripción no frena a las otras; onError recibe el id interno", async () => {
    await startA();
    await startTenantSubscription(B, OWNER_B, { planId: "plan-mensual", payerEmail: EMAIL }, deps());
    const [a, b] = [subsOf("tenant-a")[0]!, subsOf("tenant-b")[0]!];
    mp.authorize(b.mercadoPagoPreapprovalId);
    mp.getPreapproval.mockImplementation(async (id: string) => {
      if (id === a.mercadoPagoPreapprovalId) throw new Error("boom");
      return structuredClone(mp.store.get(id)!);
    });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const onError = vi.fn();
    expect(await reconcileOpenSubscriptions(onError, deps())).toEqual({ processed: 1, failed: 1, skipped: 0 });
    expect(onError).toHaveBeenCalledWith(a.id);
    expect(b.status).toBe("TRIALING");
    warn.mockRestore();
  });

  it("PENDING sin preapprovalId → busca por referencia y adopta, nunca crea; con lease vigente → skipped", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    mp.createPreapproval.mockImplementationOnce(async (body: Row) => {
      mp.seed({ id: "pre-ghost", external_reference: body.external_reference, auto_recurring: {
        ...body.auto_recurring, free_trial: { ...body.auto_recurring.free_trial, first_invoice_offset: 7 } } });
      throw new Error("timeout");
    });
    await startA(); // ambiguo: lease vigente, sin preapprovalId
    mp.createPreapproval.mockClear();
    expect(await reconcileOpenSubscriptions(undefined, deps())).toEqual({ processed: 0, failed: 0, skipped: 1 });
    advance(CHECKOUT_CREATE_LEASE_MS + 1_000);
    expect(await reconcileOpenSubscriptions(undefined, deps())).toEqual({ processed: 1, failed: 0, skipped: 0 });
    expect(subsOf("tenant-a")[0]).toMatchObject({ mercadoPagoPreapprovalId: "pre-ghost", checkoutUrl: expect.stringContaining("pre-ghost") });
    expect(mp.createPreapproval).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it("deja afuera las PENDING de más de 30 días y las CANCELED", async () => {
    await startA();
    advance(31 * DAY);
    mp.getPreapproval.mockClear();
    expect(await reconcileOpenSubscriptions(undefined, deps())).toEqual({ processed: 0, failed: 0, skipped: 0 });
    expect(mp.getPreapproval).not.toHaveBeenCalled();
  });
});

describe("getTenantSubscriptionView", () => {
  it("cobro apagado → unavailable sin planes", async () => {
    expect(await getTenantSubscriptionView(A, OWNER_A, { ...deps(), env: {} })).toEqual({
      availability: "unavailable", plans: [], trialUsed: false, subscription: null,
    });
  });

  it("planes ofrecidos: públicos + privados con oferta vigente; default primero y después por importe", async () => {
    db.plans = [
      monthly(),
      monthly({ id: "plan-anual", code: "anual", name: "Plan anual", amount: "600000.00", frequency: 12, isDefault: false, trialLength: null, trialUnit: null }),
      monthly({ id: "plan-promo", code: "promo", name: "Promo", amount: "30000.00", isDefault: false, isPublic: false }),
      monthly({ id: "plan-privado", code: "priv", name: "Privado", amount: "1000.00", isDefault: false, isPublic: false }),
      monthly({ id: "plan-viejo", code: "viejo", name: "Viejo", active: false, isDefault: false }),
      monthly({ id: "plan-live", code: "live", name: "Live", mode: "LIVE", isDefault: false }),
    ];
    db.offers = [
      { id: "o1", tenantId: "tenant-a", planId: "plan-promo", allowTrial: false, expiresAt: null },
      { id: "o2", tenantId: "tenant-a", planId: "plan-privado", allowTrial: false, expiresAt: new Date(clock.getTime() - 1) },
    ];
    const view = await getTenantSubscriptionView(A, OWNER_A, deps());
    expect(view.plans.map((p) => p.planId)).toEqual(["plan-mensual", "plan-promo", "plan-anual"]);
    expect(view.plans[0]).toEqual({
      planId: "plan-mensual", name: "Plan mensual", priceText: "$ 60.000 por mes", trialText: "7 días",
      trialEligible: true, isDefault: true, trialLength: 7, trialUnit: "DAYS",
    });
    expect(view.plans[2]).toMatchObject({ priceText: "$ 600.000 por año", trialText: null, trialEligible: false });
  });

  it("con checkout pendiente: hasCheckout, el email y nunca la URL", async () => {
    await startA();
    const view = await getTenantSubscriptionView(A, OWNER_A, deps());
    expect(view.subscription).toMatchObject({ status: "PENDING", authorized: false, hasCheckout: true, checkoutPayerEmail: EMAIL, planName: "Plan mensual" });
    expect(JSON.stringify(view)).not.toContain("mercadopago.com");
    expect(JSON.stringify(view)).not.toMatch(/pre-\d/);
  });

  it("trialUsed tras una prueba autorizada", async () => {
    await startA();
    mp.authorize(subsOf("tenant-a")[0]!.mercadoPagoPreapprovalId);
    await syncSubscriptionByPreapprovalId(subsOf("tenant-a")[0]!.mercadoPagoPreapprovalId, "WEBHOOK", {}, deps());
    const view = await getTenantSubscriptionView(A, OWNER_A, deps());
    expect(view.trialUsed).toBe(true);
    expect(view.subscription).toMatchObject({ status: "TRIALING", checkoutPayerEmail: null, hasCheckout: false });
  });
});

describe("getTenantSubscriptionGate / hasVerifiedSubscriptionAuthorization (anexo HU-026)", () => {
  it("cobro apagado → not_required (sin consultar la base)", async () => {
    expect(await getTenantSubscriptionGate("tenant-a", { env: {} })).toBe("not_required");
    expect(await hasVerifiedSubscriptionAuthorization("tenant-a", { env: {} })).toBe(false);
    expect(mocks.prisma.tenantSubscription.findFirst).not.toHaveBeenCalled();
  });

  it("autorizada verificada contra MP → verified", async () => {
    await startA();
    mp.authorize(subsOf("tenant-a")[0]!.mercadoPagoPreapprovalId);
    await syncSubscriptionByPreapprovalId(subsOf("tenant-a")[0]!.mercadoPagoPreapprovalId, "WEBHOOK", {}, deps());
    expect(await getTenantSubscriptionGate("tenant-a", deps())).toBe("verified");
    expect(await hasVerifiedSubscriptionAuthorization("tenant-a", deps())).toBe(true);
  });

  it("sin suscripción, pendiente o cancelada → pending", async () => {
    expect(await getTenantSubscriptionGate("tenant-a", deps())).toBe("pending");
    await startA();
    expect(await getTenantSubscriptionGate("tenant-a", deps())).toBe("pending");
    mp.authorize(subsOf("tenant-a")[0]!.mercadoPagoPreapprovalId);
    await syncSubscriptionByPreapprovalId(subsOf("tenant-a")[0]!.mercadoPagoPreapprovalId, "WEBHOOK", {}, deps());
    await cancelTenantSubscription(A, OWNER_A, deps());
    expect(await getTenantSubscriptionGate("tenant-a", deps())).toBe("pending");
  });

  it("la vuelta ?mp=volver no la cambia: sin sync, autorizar en MP no alcanza", async () => {
    await startA();
    mp.authorize(subsOf("tenant-a")[0]!.mercadoPagoPreapprovalId); // la persona autorizó y volvió
    expect(await getTenantSubscriptionGate("tenant-a", deps())).toBe("pending");
    expect(mp.getPreapproval).not.toHaveBeenCalled();
  });

  it("la base falla → tira (HU-026 lo trata como pending)", async () => {
    mocks.prisma.tenantSubscription.findFirst.mockRejectedValueOnce(new Error("db down"));
    await expect(getTenantSubscriptionGate("tenant-a", deps())).rejects.toThrow("db down");
  });
});

describe("privacidad en eventos y logs", () => {
  it("ningún evento lleva el email en un recorrido completo", async () => {
    const spies = (["log", "warn", "error", "info"] as const).map((m) => vi.spyOn(console, m).mockImplementation(() => {}));
    await startA();
    advance(2 * 60 * 60 * 1000);
    await resumePendingCheckout(A, OWNER_A, deps());
    const row = subsOf("tenant-a").find((s) => s.status === "PENDING")!;
    mp.authorize(row.mercadoPagoPreapprovalId);
    await syncSubscriptionByPreapprovalId(row.mercadoPagoPreapprovalId, "WEBHOOK", {}, deps());
    await cancelTenantSubscription(A, OWNER_A, deps());
    expect(db.events.length).toBeGreaterThan(3);
    expect(JSON.stringify(db.events)).not.toContain("@");
    for (const s of spies) {
      expect(JSON.stringify(s.mock.calls)).not.toContain("@");
      s.mockRestore();
    }
  });
});
