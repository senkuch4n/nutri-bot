// HU-028a (§11.3): probe de dos consultorios (A y B) con su propia cuenta de Mercado Pago de señas.
// Correr solo vía test-mercadopago-per-tenant.sh, contra su Postgres descartable. El HTTP de Mercado Pago
// (canje, /users/me, refresh) se inyecta con deps.fetch; globalThis.fetch queda bloqueado: nunca hay red real.
// Nada se manda por WhatsApp: los avisos quedan en OutboundMessage de una base que se descarta.
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { after, before, describe, test } from "node:test";
import { MERCADOPAGO_TOKEN_URL, MERCADOPAGO_USERS_ME_URL } from "@nutri-bot/core";
import { prisma } from "../index";
import {
  completeMercadoPagoOAuth,
  disconnectMercadoPagoAccount,
  getMercadoPagoConnectionView,
  getMercadoPagoCredentials,
  isMercadoPagoCheckoutAvailable,
  listConnectedMercadoPagoTenants,
  listTenantsWithPendingMercadoPagoPayments,
  markMercadoPagoAccountError,
  notifyMercadoPagoMissingForBooking,
  refreshMercadoPagoAccountToken,
  resolveMercadoPagoWebhookAccount,
  startMercadoPagoOAuth,
} from "../domain";

if (process.env.MP_TENANTS_DISPOSABLE !== "1" ||
    !/^postgresql:\/\/postgres:[a-f0-9]{36}@127\.0\.0\.1:\d+\/mp_tenants$/.test(process.env.DATABASE_URL ?? "")) {
  throw new Error("Run test-mercadopago-per-tenant.sh for disposable PostgreSQL.");
}

// Ninguna llamada real: cualquier fetch que no venga de deps falla.
globalThis.fetch = (async () => {
  throw new Error("Red real bloqueada en el probe");
}) as typeof fetch;

const ENV = {
  MERCADOPAGO_CLIENT_ID: "probe-client",
  MERCADOPAGO_CLIENT_SECRET: "probe-secret",
  MERCADOPAGO_TOKEN_KEY: randomBytes(32).toString("base64"),
  AUTH_URL: "https://probe.example.test",
  NODE_ENV: "test",
};
// Las funciones sin deps (vista, disconnect, markError) leen process.env.
Object.assign(process.env, ENV);
delete process.env.MERCADOPAGO_ALLOW_ENV_TOKEN;
delete process.env.MERCADOPAGO_ACCESS_TOKEN;
delete process.env.ARZIUM_MERCADOPAGO_USER_ID;

after(() => prisma.$disconnect());

const A = { tenantId: "mp-a" };
const B = { tenantId: "mp-b" };
const OWNER_A = "mp-owner-a";
const OWNER_B = "mp-owner-b";
const USER_A = "1001";
const USER_B = "2002";
const USER_B2 = "2003";
const TZ = "America/Argentina/Buenos_Aires";
const DAY = 86_400_000;

/** MP falso: el code dice qué cuenta se canjea; /users/me responde según el bearer. */
function fakeMercadoPago() {
  let n = 0;
  return async (url: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
    if (String(url) === MERCADOPAGO_TOKEN_URL) {
      const body = JSON.parse(String(init?.body)) as { grant_type: string; code?: string };
      const userId = body.grant_type === "refresh_token" ? undefined : body.code?.split(":")[1];
      n++;
      return json({
        access_token: `APP_USR-access-${userId ?? "refresh"}-${n}`,
        refresh_token: `TG-refresh-${userId ?? "refresh"}-${n}`,
        token_type: "bearer",
        expires_in: 15_552_000,
        scope: "offline_access payments read write",
        ...(userId ? { user_id: Number(userId) } : {}),
        live_mode: true,
      });
    }
    if (String(url) === MERCADOPAGO_USERS_ME_URL) {
      const auth = new Headers(init?.headers).get("Authorization") ?? "";
      const userId = /APP_USR-access-(\d+)-/.exec(auth)?.[1] ?? "0";
      return json({ id: Number(userId), nickname: `VENDEDOR-${userId}`, email: `v${userId}@example.test` });
    }
    throw new Error(`URL inesperada en el probe: ${String(url)}`);
  };
}
const deps = { env: ENV, fetch: fakeMercadoPago() as typeof fetch };

async function connect(t: { tenantId: string }, owner: string, mpUserId: string) {
  const { url } = await startMercadoPagoOAuth(t, { userId: owner }, deps);
  const state = new URL(url).searchParams.get("state")!;
  return completeMercadoPagoOAuth(t, { userId: owner, query: new URLSearchParams({ code: `code:${mpUserId}`, state }) }, deps);
}

const TABLES = ["MercadoPagoAccount", "MercadoPagoOAuthState", "Payment", "Appointment", "OutboundMessage"] as const;
async function snapshot(): Promise<string> {
  const parts = await Promise.all(TABLES.map(async (table) => {
    const rows = await prisma.$queryRawUnsafe<{ rows: unknown }[]>(
      `SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text), '[]'::jsonb) AS rows FROM "${table}" t`,
    );
    return [table, rows[0]?.rows] as const;
  }));
  return JSON.stringify(parts);
}
const accountRow = (t: { tenantId: string }) => prisma.mercadoPagoAccount.findUnique({ where: { tenantId: t.tenantId } });

async function seed(key: "a" | "b", tenantId: string, professionalId: number, owner: string, slot: number) {
  const p = `mp-${key}`;
  const phone = key === "a" ? "5490000000505" : "5490000000606";
  await prisma.tenant.create({ data: { id: tenantId } });
  await prisma.user.create({ data: { id: owner, email: `${owner}@example.test` } });
  await prisma.tenantMembership.create({ data: { tenantId, userId: owner, role: "OWNER" } });
  await prisma.professional.create({
    data: { id: professionalId, tenantId, name: `Prof ${key}`, email: `${p}@example.test`, timezone: TZ, phoneJid: `pro-${key}@s.whatsapp.net` },
  });
  await prisma.agenda.create({ data: { id: `${p}-agenda`, tenantId, professionalId, isPrimary: true } });
  await prisma.patient.create({ data: { id: `${p}-patient`, tenantId, whatsappJid: `${phone}@s.whatsapp.net`, phone, name: `Paciente ${key}` } });
  await prisma.service.create({
    data: { id: `${p}-service`, tenantId, name: `Consulta ${key}`, price: 1000, durationMin: 30, requiresDeposit: true, depositKind: "FIXED", depositValue: 500 },
  });
  return { slot, agendaId: `${p}-agenda`, patientId: `${p}-patient`, serviceId: `${p}-service` };
}

type Seeded = Awaited<ReturnType<typeof seed>>;
const fx = {} as Record<"a" | "b", Seeded>;

async function pendingDeposit(key: "a" | "b", tenantId: string, seller: string, n: number) {
  const f = fx[key];
  const startsAt = new Date(Date.now() + (5 + n) * DAY);
  startsAt.setUTCHours(12 + f.slot, 0, 0, 0);
  const appt = await prisma.appointment.create({
    data: {
      id: `mp-${key}-awaiting-${n}`, tenantId, agendaId: f.agendaId, patientId: f.patientId, serviceId: f.serviceId,
      createdBy: "PATIENT", priceSnapshot: 1000, startsAt, endsAt: new Date(startsAt.getTime() + 30 * 60_000), status: "AWAITING_PAYMENT",
    },
  });
  await prisma.payment.create({
    data: { id: `mp-${key}-pay-${n}`, appointmentId: appt.id, kind: "DEPOSIT", amount: 500, status: "PENDING", provider: "mercadopago", mercadopagoUserId: seller },
  });
  return appt.id;
}

before(async () => {
  fx.a = await seed("a", A.tenantId, 701, OWNER_A, 0);
  fx.b = await seed("b", B.tenantId, 702, OWNER_B, 1);
});

describe("HU-028a: Mercado Pago de señas por consultorio (Postgres descartable)", () => {
  test("1. A y B conectan su propia cuenta: dos filas, cada vista muestra solo lo suyo", async () => {
    assert.equal(await connect(A, OWNER_A, USER_A), "connected");
    assert.equal(await connect(B, OWNER_B, USER_B), "connected");
    assert.equal(await prisma.mercadoPagoAccount.count(), 2);
    const viewA = await getMercadoPagoConnectionView(A);
    const viewB = await getMercadoPagoConnectionView(B);
    assert.deepEqual([viewA.status, viewA.userId, viewA.nickname, viewA.email], ["connected", USER_A, `VENDEDOR-${USER_A}`, `v${USER_A}@example.test`]);
    assert.deepEqual([viewB.status, viewB.userId, viewB.nickname, viewB.email], ["connected", USER_B, `VENDEDOR-${USER_B}`, `v${USER_B}@example.test`]);
    assert.equal(await prisma.mercadoPagoOAuthState.count(), 0);
  });

  test("2. B reconecta (otra cuenta) y desconecta: la fila de A queda idéntica", async () => {
    const rowA = await accountRow(A);
    assert.equal(await connect(B, OWNER_B, USER_B2), "connected");
    assert.equal((await accountRow(B))?.userId, USER_B2);
    assert.deepEqual(await disconnectMercadoPagoAccount(B), { cancelledDeposits: 0 });
    assert.equal((await accountRow(B))?.userId, null);
    assert.deepEqual(await accountRow(A), rowA);
    // B vuelve a su cuenta para el resto del probe.
    assert.equal(await connect(B, OWNER_B, USER_B), "connected");
    assert.deepEqual(await accountRow(A), rowA);
  });

  test("3. B intenta conectar la cuenta de A → account_in_use, base idéntica", async () => {
    const { url } = await startMercadoPagoOAuth(B, { userId: OWNER_B }, deps);
    const state = new URL(url).searchParams.get("state")!;
    const before = await snapshot();
    const result = await completeMercadoPagoOAuth(B, { userId: OWNER_B, query: new URLSearchParams({ code: `code:${USER_A}`, state }) }, deps);
    assert.equal(result, "account_in_use");
    // El único cambio es el state consumido (un solo uso).
    const after = await snapshot();
    const statesBefore = JSON.parse(before)[1][1] as unknown[];
    assert.equal(statesBefore.length, 1);
    const strip = (snap: string) => JSON.stringify((JSON.parse(snap) as [string, unknown][]).filter(([t]) => t !== "MercadoPagoOAuthState"));
    assert.equal(strip(after), strip(before));
    assert.equal(await prisma.mercadoPagoOAuthState.count(), 0);
  });

  test("4. El state de A no se consume con la persona de B ni desde el consultorio B", async () => {
    const { url } = await startMercadoPagoOAuth(A, { userId: OWNER_A }, deps);
    const state = new URL(url).searchParams.get("state")!;
    const query = () => new URLSearchParams({ code: `code:${USER_A}`, state });
    const before = await snapshot();
    assert.equal(await completeMercadoPagoOAuth(A, { userId: OWNER_B, query: query() }, deps), "invalid_state");
    assert.equal(await completeMercadoPagoOAuth(B, { userId: OWNER_A, query: query() }, deps), "invalid_state");
    assert.equal(await snapshot(), before);
    assert.equal(await prisma.mercadoPagoOAuthState.count({ where: { tenantId: A.tenantId, userId: OWNER_A } }), 1);
    // La dueña del state lo usa normalmente.
    assert.equal(await completeMercadoPagoOAuth(A, { userId: OWNER_A, query: query() }, deps), "connected");
  });

  test("5. Credenciales: cada consultorio usa su cuenta", async () => {
    assert.equal((await getMercadoPagoCredentials(A, { kind: "current" }, deps))?.sellerUserId, USER_A);
    assert.equal((await getMercadoPagoCredentials(B, { kind: "current" }, deps))?.sellerUserId, USER_B);
  });

  test("6. B sin cuenta: no cobra con la de A y su aviso tiene su propio tope de 24 h", async () => {
    await disconnectMercadoPagoAccount(B);
    const rowA = await accountRow(A);
    assert.equal(await isMercadoPagoCheckoutAvailable(B, deps), false);
    assert.equal(await isMercadoPagoCheckoutAvailable(A, deps), true);
    const input = { patientName: "x", patientPhone: "1", serviceName: "s" };
    assert.equal(await notifyMercadoPagoMissingForBooking(B, input), true);
    assert.equal(await notifyMercadoPagoMissingForBooking(B, input), false);
    const alerts = await prisma.outboundMessage.findMany({ where: { kind: "PROFESSIONAL_ALERT" } });
    assert.deepEqual(alerts.map((m) => [m.tenantId, m.toJid]), [[B.tenantId, "pro-b@s.whatsapp.net"]]);
    assert.deepEqual(await accountRow(A), rowA);
    await prisma.outboundMessage.deleteMany({ where: { id: { in: alerts.map((m) => m.id) } } });
    assert.equal(await connect(B, OWNER_B, USER_B), "connected");
  });

  test("7. markError(B): aviso solo para B; A sin cambios y su renovación sigue andando", async () => {
    const rowA = await accountRow(A);
    await markMercadoPagoAccountError(B, "revoked");
    assert.equal((await accountRow(B))?.errorCode, "revoked");
    const alerts = await prisma.outboundMessage.findMany({ where: { kind: "PROFESSIONAL_ALERT" } });
    assert.deepEqual(alerts.map((m) => [m.tenantId, m.toJid]), [[B.tenantId, "pro-b@s.whatsapp.net"]]);
    assert.deepEqual(await accountRow(A), rowA);
    assert.ok(["refreshed", "not_needed"].includes(await refreshMercadoPagoAccountToken(A, {}, deps)));
    assert.equal(await refreshMercadoPagoAccountToken(A, { force: true }, deps), "not_needed");
    // Forzar una renovación de A: vencimiento a 10 días.
    await prisma.mercadoPagoAccount.update({ where: { tenantId: A.tenantId }, data: { expiresAt: new Date(Date.now() + 10 * DAY) } });
    assert.equal(await refreshMercadoPagoAccountToken(A, {}, deps), "refreshed");
    assert.equal((await accountRow(A))?.errorCode, null);
    await prisma.outboundMessage.deleteMany({ where: { id: { in: alerts.map((m) => m.id) } } });
    assert.equal(await connect(B, OWNER_B, USER_B), "connected");
  });

  test("8. Desconectar B cancela solo las señas de B", async () => {
    const apptA = await pendingDeposit("a", A.tenantId, USER_A, 1);
    const apptB = await pendingDeposit("b", B.tenantId, USER_B, 1);
    assert.deepEqual(await listTenantsWithPendingMercadoPagoPayments(), [A, B]);
    assert.deepEqual(await disconnectMercadoPagoAccount(B), { cancelledDeposits: 1 });
    assert.equal((await prisma.appointment.findUniqueOrThrow({ where: { id: apptB } })).status, "CANCELLED");
    assert.equal((await prisma.appointment.findUniqueOrThrow({ where: { id: apptA } })).status, "AWAITING_PAYMENT");
    assert.equal((await prisma.payment.findFirstOrThrow({ where: { appointmentId: apptA } })).status, "PENDING");
    const msgs = await prisma.outboundMessage.findMany({ where: { kind: "CANCELLATION" } });
    assert.deepEqual(msgs.map((m) => [m.tenantId, m.appointmentId]), [[B.tenantId, apptB]]);
    await prisma.outboundMessage.deleteMany({ where: { id: { in: msgs.map((m) => m.id) } } });
    assert.deepEqual(await listTenantsWithPendingMercadoPagoPayments(), [A]);
  });

  test("9. Webhook: el user_id notificado resuelve su consultorio; uno desconocido, null", async () => {
    assert.equal(await connect(B, OWNER_B, USER_B), "connected");
    assert.deepEqual(await resolveMercadoPagoWebhookAccount(USER_A, ENV), { tenant: A, sellerUserId: USER_A });
    assert.deepEqual(await resolveMercadoPagoWebhookAccount(USER_B, ENV), { tenant: B, sellerUserId: USER_B });
    assert.equal(await resolveMercadoPagoWebhookAccount("999", ENV), null);
    assert.equal(await resolveMercadoPagoWebhookAccount(null, ENV), null);
  });

  test("10. Listas para los crons del bot", async () => {
    assert.deepEqual(await listConnectedMercadoPagoTenants(), [A, B]);
    await disconnectMercadoPagoAccount(B);
    assert.deepEqual(await listConnectedMercadoPagoTenants(), [A]);
    assert.deepEqual(await listTenantsWithPendingMercadoPagoPayments(), [A]);
  });

  test("11. UNIQUE(userId): una segunda fila con la cuenta de A falla", async () => {
    await prisma.tenant.create({ data: { id: "mp-c" } });
    await assert.rejects(
      prisma.$executeRaw`INSERT INTO "MercadoPagoAccount" ("tenantId", "userId", "updatedAt") VALUES ('mp-c', ${USER_A}, now())`,
      /unique|P2010|23505/i,
    );
    assert.equal(await prisma.mercadoPagoAccount.count({ where: { userId: USER_A } }), 1);
  });
});
