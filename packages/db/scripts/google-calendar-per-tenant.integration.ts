// HU-028b (§B10.5): probe de dos consultorios con Google Calendar. A = instalación original con el token
// trasladado por google-calendar-transfer.ts; B = consultorio nuevo que conecta con el OAuth propio.
// Correr solo vía test-google-calendar-per-tenant.sh, contra su Postgres descartable. El OAuth de Google se
// inyecta con deps.fetch y la sync con deps.events; globalThis.fetch queda bloqueado: nunca hay red real.
import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { GOOGLE_REVOKE_URL, GOOGLE_TOKEN_URL } from "@nutri-bot/core";
import { prisma } from "../index";
import {
  completeGoogleCalendarOAuth,
  disconnectGoogleCalendar,
  listConnectedGoogleCalendarTenants,
  startGoogleCalendarOAuth,
  syncGoogleCalendar,
  type CalendarEventsWriter,
} from "../domain/googleCalendar";

if (process.env.GCAL_TENANTS_DISPOSABLE !== "1" ||
    !/^postgresql:\/\/postgres:[a-f0-9]{36}@127\.0\.0\.1:\d+\/gc_tenants$/.test(process.env.DATABASE_URL ?? "") ||
    !process.env.PROBE_TOKEN_KEY) {
  throw new Error("Run test-google-calendar-per-tenant.sh for disposable PostgreSQL.");
}

globalThis.fetch = (async () => {
  throw new Error("Red real bloqueada en el probe");
}) as typeof fetch;

const CLIENT_ID = "probe-client.apps.googleusercontent.com";
const ENV = {
  GOOGLE_CLIENT_ID: CLIENT_ID,
  GOOGLE_CLIENT_SECRET: "probe-secret",
  AUTH_URL: "https://probe.example.test",
  // La misma clave con la que el traslado cifró el token de A.
  INTEGRATION_TOKEN_KEY: process.env.PROBE_TOKEN_KEY,
};
Object.assign(process.env, ENV);

after(() => prisma.$disconnect());

const A = { tenantId: "legacy-tenant" };
const B = { tenantId: "gc-b" };
const OWNER_A = "gc-owner-a";
const OWNER_B = "gc-owner-b";
const EVENTS_SCOPE = "openid https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/userinfo.email";
const DAY = 86_400_000;

const b64url = (v: string) => Buffer.from(v, "utf8").toString("base64url");
function idToken(sub: string, email: string): string {
  const claims = { iss: "https://accounts.google.com", aud: CLIENT_ID, sub, email, email_verified: true, exp: Math.floor(Date.now() / 1000) + 3600 };
  return [b64url("{}"), b64url(JSON.stringify(claims)), "firma"].join(".");
}

/** Google falso: el code dice qué cuenta y qué refresh token devuelve ("code:<sub>:<rt>"). */
const revoked: string[] = [];
const fakeGoogle = async (url: string | URL | Request, init?: RequestInit): Promise<Response> => {
  const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
  const form = new URLSearchParams(String(init?.body));
  if (String(url) === GOOGLE_TOKEN_URL) {
    const [, sub, rt] = (form.get("code") ?? "").split(":");
    return json(200, { access_token: "AT-probe", refresh_token: rt, id_token: idToken(sub!, `${sub}@example.test`), scope: EVENTS_SCOPE });
  }
  if (String(url) === GOOGLE_REVOKE_URL) {
    revoked.push(form.get("token")!);
    return json(200, {});
  }
  throw new Error(`URL inesperada en el probe: ${String(url)}`);
};
const deps = { env: ENV, fetch: fakeGoogle as typeof fetch };

async function startState(t: { tenantId: string }, owner: string): Promise<string> {
  const { url } = await startGoogleCalendarOAuth(t, { userId: owner }, deps);
  return new URL(url).searchParams.get("state")!;
}

async function connect(t: { tenantId: string }, owner: string, sub: string, rt: string) {
  const state = await startState(t, owner);
  return completeGoogleCalendarOAuth(t, { userId: owner, query: new URLSearchParams({ code: `code:${sub}:${rt}`, state }) }, deps);
}

type Call = { op: string; refreshToken: string; calendarId: string; eventId?: string };
/** events falso: registra con qué token y calendario se llamó cada operación. */
function recordingEvents(calls: Call[], opts: { failWith?: unknown } = {}) {
  let n = 0;
  return (refreshToken: string): CalendarEventsWriter => ({
    async insert(p) {
      if (opts.failWith) throw opts.failWith;
      calls.push({ op: "insert", refreshToken, calendarId: p.calendarId });
      return { data: { id: `evt-${refreshToken}-${++n}` } };
    },
    async patch(p) {
      if (opts.failWith) throw opts.failWith;
      calls.push({ op: "patch", refreshToken, calendarId: p.calendarId, eventId: p.eventId });
      return {};
    },
    async delete(p) {
      if (opts.failWith) throw opts.failWith;
      calls.push({ op: "delete", refreshToken, calendarId: p.calendarId, eventId: p.eventId });
      return {};
    },
  });
}

const accountRow = (t: { tenantId: string }) =>
  prisma.$queryRaw<{ j: string }[]>`SELECT to_jsonb(g)::text AS j FROM "GoogleCalendarAccount" g WHERE "tenantId" = ${t.tenantId}`
    .then((r) => r[0]?.j ?? null);
const appointmentsOf = (t: { tenantId: string }) =>
  prisma.appointment.findMany({
    where: { tenantId: t.tenantId },
    select: { id: true, googleEventId: true, needsGoogleSync: true, status: true },
    orderBy: { id: "asc" },
  });

before(async () => {
  await prisma.tenant.create({ data: { id: B.tenantId } });
  await prisma.user.create({ data: { id: OWNER_B, email: "owner.b@example.test", googleSubject: "sub-owner-b" } });
  await prisma.tenantMembership.create({ data: { tenantId: B.tenantId, userId: OWNER_B, role: "OWNER" } });
  await prisma.professional.create({
    data: { id: 702, tenantId: B.tenantId, name: "Prof B", email: "pro-b@example.test", timezone: "America/Argentina/Buenos_Aires" },
  });
  await prisma.agenda.create({ data: { id: "gc-b-agenda", tenantId: B.tenantId, professionalId: 702, isPrimary: true } });
  await prisma.patient.create({
    data: { id: "gc-b-patient", tenantId: B.tenantId, whatsappJid: "5490000000909@s.whatsapp.net", phone: "5490000000909", name: "Paciente B" },
  });
  await prisma.service.create({ data: { id: "gc-b-service", tenantId: B.tenantId, name: "Consulta B", price: 1000, durationMin: 30 } });
  for (const [id, days, event, needs] of [
    ["gc-b-future-new", 5, null, true],
    ["gc-b-future-synced", 6, "evt-b-old", false],
  ] as const) {
    const startsAt = new Date(Date.now() + days * DAY);
    startsAt.setUTCMinutes(0, 0, 0);
    await prisma.appointment.create({
      data: {
        id, tenantId: B.tenantId, agendaId: "gc-b-agenda", patientId: "gc-b-patient", serviceId: "gc-b-service",
        createdBy: "PATIENT", priceSnapshot: 1000, startsAt, endsAt: new Date(startsAt.getTime() + 30 * 60_000),
        status: "CONFIRMED", googleEventId: event, needsGoogleSync: needs,
      },
    });
  }
});

describe("HU-028b: Google Calendar por consultorio (Postgres descartable)", () => {
  test("4. B conecta con el OAuth propio; la fila de A (trasladada) no cambia", async () => {
    const aBefore = await accountRow(A);
    assert.ok(aBefore);
    assert.equal(await connect(B, OWNER_B, "sub-b", "rt-b"), "connected");
    assert.equal(await accountRow(A), aBefore);
    const b = await prisma.googleCalendarAccount.findUniqueOrThrow({ where: { tenantId: B.tenantId } });
    assert.equal(b.googleSubject, "sub-b");
    assert.equal(b.googleEmail, "sub-b@example.test");
    assert.ok(b.refreshTokenEnc?.startsWith("v1.") && !b.refreshTokenEnc.includes("rt-b"));
    assert.deepEqual(await listConnectedGoogleCalendarTenants(), [B, A].sort((x, y) => x.tenantId.localeCompare(y.tenantId)));
  });

  test("5. cada consultorio sincroniza solo con su token y su calendario", async () => {
    const calls: Call[] = [];
    const events = recordingEvents(calls);
    assert.deepEqual(await syncGoogleCalendar(A, { env: ENV, events }), { processed: 1 });
    assert.deepEqual(await syncGoogleCalendar(B, { env: ENV, events }), { processed: 1 });
    assert.deepEqual(calls, [
      { op: "insert", refreshToken: "rt-legacy", calendarId: "cal-x" },
      { op: "insert", refreshToken: "rt-b", calendarId: "primary" },
    ]);
    const a = await appointmentsOf(A);
    assert.match(a.find((x) => x.id === "gc-a-future-new")?.googleEventId ?? "", /^evt-rt-legacy-\d+$/);
    const b = await appointmentsOf(B);
    assert.match(b.find((x) => x.id === "gc-b-future-new")?.googleEventId ?? "", /^evt-rt-b-\d+$/);
  });

  test("6. B falla con 401 y A sincroniza normal en la misma corrida (como el cron)", async () => {
    await prisma.appointment.update({ where: { id: "gc-a-future-synced" }, data: { needsGoogleSync: true } });
    await prisma.appointment.update({ where: { id: "gc-b-future-synced" }, data: { needsGoogleSync: true } });
    const calls: Call[] = [];
    const ok = recordingEvents(calls);
    const failing = recordingEvents([], {
      failWith: Object.assign(new Error("Bearer SECRETO"), { response: { status: 401, data: { error: "invalid_grant" } } }),
    });
    const results: Record<string, unknown> = {};
    for (const t of await listConnectedGoogleCalendarTenants()) {
      results[t.tenantId] = await syncGoogleCalendar(t, { env: ENV, events: t.tenantId === B.tenantId ? failing : ok });
    }
    assert.deepEqual(results, {
      [A.tenantId]: { processed: 1 },
      [B.tenantId]: { processed: 0, error: "Google Calendar respondió con error (status 401, invalid_grant)" },
    });
    assert.deepEqual(calls, [{ op: "patch", refreshToken: "rt-legacy", calendarId: "cal-x", eventId: "evt-legacy" }]);
    const a = await prisma.googleCalendarAccount.findUniqueOrThrow({ where: { tenantId: A.tenantId } });
    const b = await prisma.googleCalendarAccount.findUniqueOrThrow({ where: { tenantId: B.tenantId } });
    assert.equal(a.syncError, null);
    assert.equal(b.syncError, "Google Calendar respondió con error (status 401, invalid_grant)");
    assert.ok(!b.syncError?.includes("SECRETO"));
    // B queda pendiente para el próximo tick.
    assert.equal((await appointmentsOf(B)).find((x) => x.id === "gc-b-future-synced")?.needsGoogleSync, true);
  });

  test("7. el state de A no se consume con la persona ni el consultorio de B", async () => {
    const state = await startState(A, OWNER_A);
    const before = await prisma.googleCalendarOAuthState.count();
    const query = new URLSearchParams({ code: "code:sub-x:rt-x", state });
    assert.equal(await completeGoogleCalendarOAuth(A, { userId: OWNER_B, query }, deps), "invalid_state");
    assert.equal(await completeGoogleCalendarOAuth(B, { userId: OWNER_A, query }, deps), "invalid_state");
    assert.equal(await prisma.googleCalendarOAuthState.count(), before);
    // Lo consume quien lo inició (misma cuenta: same, no toca turnos).
    const aAppts = JSON.stringify(await appointmentsOf(A));
    assert.equal(await completeGoogleCalendarOAuth(A, { userId: OWNER_A, query: new URLSearchParams({ code: "code:sub-owner-a:rt-a2", state }) }, deps), "connected");
    assert.equal(await prisma.googleCalendarOAuthState.count(), before - 1);
    assert.equal(JSON.stringify(await appointmentsOf(A)), aAppts);
  });

  test("8. reconectar A con otra cuenta olvida sus eventos y re-encola los futuros; B intacto; misma cuenta no toca turnos", async () => {
    const bAppts = JSON.stringify(await appointmentsOf(B));
    const bRow = await accountRow(B);
    revoked.length = 0;
    assert.equal(await connect(A, OWNER_A, "sub-otra", "rt-otra"), "connected");
    const a = await appointmentsOf(A);
    assert.deepEqual(a.map((x) => [x.id, x.googleEventId, x.needsGoogleSync]), [
      ["gc-a-future-new", null, true],
      ["gc-a-future-synced", null, true],
      ["gc-a-past", null, false],
    ]);
    const row = await prisma.googleCalendarAccount.findUniqueOrThrow({ where: { tenantId: A.tenantId } });
    assert.equal(row.calendarId, null);
    assert.equal(row.googleSubject, "sub-otra");
    assert.deepEqual(revoked, ["rt-a2"]); // el token de la cuenta anterior, después del commit
    assert.equal((await prisma.professional.findUniqueOrThrow({ where: { id: 1 } })).googleRefreshToken, null);
    assert.equal(JSON.stringify(await appointmentsOf(B)), bAppts);
    assert.equal(await accountRow(B), bRow);

    const aBefore = JSON.stringify(await appointmentsOf(A));
    revoked.length = 0;
    assert.equal(await connect(A, OWNER_A, "sub-otra", "rt-otra2"), "connected");
    assert.equal(JSON.stringify(await appointmentsOf(A)), aBefore);
    assert.deepEqual(revoked, []);
  });

  test("9. desconectar A: token null, sub conservado, turnos intactos; B intacto y la lista queda en B", async () => {
    const aAppts = JSON.stringify(await appointmentsOf(A));
    const bRow = await accountRow(B);
    revoked.length = 0;
    assert.deepEqual(await disconnectGoogleCalendar(A, deps), { revoked: true });
    assert.deepEqual(revoked, ["rt-otra2"]);
    const row = await prisma.googleCalendarAccount.findUniqueOrThrow({ where: { tenantId: A.tenantId } });
    assert.equal(row.refreshTokenEnc, null);
    assert.equal(row.googleEmail, null);
    assert.equal(row.googleSubject, "sub-otra");
    assert.ok(row.disconnectedAt);
    assert.equal(JSON.stringify(await appointmentsOf(A)), aAppts);
    assert.equal((await prisma.professional.findUniqueOrThrow({ where: { id: 1 } })).googleRefreshToken, null);
    assert.equal(await accountRow(B), bRow);
    assert.deepEqual(await listConnectedGoogleCalendarTenants(), [B]);
    assert.deepEqual(await syncGoogleCalendar(A, { env: ENV, events: recordingEvents([]) }), { processed: 0 });
  });
});
