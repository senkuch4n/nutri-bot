// HU-028b: conexión de Google Calendar por consultorio. Sin base ni red: prisma es un doble en memoria
// (una fila por tenantId) y `fetch` es un vi.fn() inyectado. Nada llama a Google de verdad.
import { createHash, randomBytes } from "node:crypto";
import { GOOGLE_REVOKE_URL, GOOGLE_TOKEN_URL } from "@nutri-bot/core";
import { beforeEach, describe, expect, it, vi } from "vitest";

type Row = Record<string, any>;

const db = vi.hoisted(() => ({
  accounts: [] as Row[],
  states: [] as Row[],
}));

const mocks = vi.hoisted(() => {
  const sql = (strings: TemplateStringsArray) => strings.join("?").replace(/\s+/g, " ").trim();
  const byTenant = (tenantId: unknown) => db.accounts.find((a) => a.tenantId === tenantId) ?? null;
  const AGENDAS: Record<string, Row> = {
    "tenant-a": { id: "agenda-a", tenantId: "tenant-a", professionalId: 7 },
    "tenant-b": { id: "agenda-b", tenantId: "tenant-b", professionalId: 8 },
  };
  const project = (row: Row | null, select?: Record<string, boolean>) => {
    if (!row) return null;
    if (!select) return { ...row };
    return Object.fromEntries(Object.keys(select).map((k) => [k, row[k]]));
  };
  const prisma: any = {
    $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn(prisma)),
    agenda: {
      findFirst: vi.fn(async ({ where }: { where: Row }) => {
        const agenda = AGENDAS[where.tenantId];
        return agenda && where.isPrimary === true
          ? { ...agenda, professional: { timezone: "America/Argentina/Buenos_Aires", phoneJid: "pro-jid" } }
          : null;
      }),
    },
    $executeRaw: vi.fn(async (strings: TemplateStringsArray, ...values: unknown[]) => {
      const q = sql(strings);
      if (q.startsWith('INSERT INTO "GoogleCalendarAccount" ("id", "tenantId", "updatedAt")') && q.includes('ON CONFLICT ("tenantId") DO NOTHING')) {
        if (byTenant(values[1])) return 0;
        db.accounts.push({
          id: values[0], tenantId: values[1], googleSubject: null, googleEmail: null, refreshTokenEnc: null, scope: null,
          calendarId: null, connectedAt: null, disconnectedAt: null, syncError: null, syncErrorAt: null,
        });
        return 1;
      }
      throw new Error(`SQL inesperado: ${q}`);
    }),
    $queryRaw: vi.fn(async (strings: TemplateStringsArray, ...values: unknown[]) => {
      const q = sql(strings);
      if (q.startsWith('DELETE FROM "GoogleCalendarOAuthState"')) {
        const [hash, userId, tenantId, now] = values as [string, string, string, Date];
        const idx = db.states.findIndex(
          (s) => s.stateHash === hash && s.userId === userId && s.tenantId === tenantId && s.expiresAt.getTime() > now.getTime(),
        );
        if (idx < 0) return [];
        const [row] = db.states.splice(idx, 1);
        return [{ codeVerifierEnc: row!.codeVerifierEnc }];
      }
      if (q.includes('FROM "GoogleCalendarAccount" WHERE "tenantId" = ? FOR UPDATE')) {
        const row = byTenant(values[0]);
        return row
          ? [{ refreshTokenEnc: row.refreshTokenEnc, googleSubject: row.googleSubject, calendarId: row.calendarId, connectedAt: row.connectedAt }]
          : [];
      }
      throw new Error(`SQL inesperado: ${q}`);
    }),
    googleCalendarAccount: {
      findUnique: vi.fn(async ({ where, select }: { where: Row; select?: Record<string, boolean> }) => project(byTenant(where.tenantId), select)),
      count: vi.fn(async ({ where }: { where: Row }) => {
        const row = byTenant(where.tenantId);
        return row && row.refreshTokenEnc !== null ? 1 : 0;
      }),
      findMany: vi.fn(async () => db.accounts
        .filter((a) => a.refreshTokenEnc !== null)
        .sort((a, b) => String(a.tenantId).localeCompare(String(b.tenantId)))
        .map((a) => ({ tenantId: a.tenantId }))),
      update: vi.fn(async ({ where, data }: { where: Row; data: Row }) => {
        const row = byTenant(where.tenantId);
        if (!row) throw new Error("Record to update not found");
        Object.assign(row, data);
        return { ...row };
      }),
      updateMany: vi.fn(async ({ where, data }: { where: Row; data: Row }) => {
        const row = byTenant(where.tenantId);
        if (!row || row.refreshTokenEnc === null) return { count: 0 };
        Object.assign(row, data);
        return { count: 1 };
      }),
    },
    googleCalendarOAuthState: {
      deleteMany: vi.fn(async ({ where }: { where: { expiresAt: { lt: Date } } }) => {
        const before = db.states.length;
        db.states = db.states.filter((s) => s.expiresAt.getTime() >= where.expiresAt.lt.getTime());
        return { count: before - db.states.length };
      }),
      create: vi.fn(async ({ data }: { data: Row }) => {
        db.states.push({ ...data });
        return { ...data };
      }),
    },
    appointment: { updateMany: vi.fn(async () => ({ count: 0 })) },
    professional: { updateMany: vi.fn(async () => ({ count: 1 })) },
  };
  return { prisma };
});

vi.mock("../index", () => ({ prisma: mocks.prisma }));

import {
  completeGoogleCalendarOAuth,
  disconnectGoogleCalendar,
  getGoogleCalendarConnectionView,
  listConnectedGoogleCalendarTenants,
  setGoogleCalendarId,
  startGoogleCalendarOAuth,
} from "./googleCalendarAccount";
import { GoogleCalendarConfigError } from "./googleOAuthClient";
import { GOOGLE_SECRET_AAD, openSecret, sealSecret } from "./secretBox";

const prisma = mocks.prisma;
const KEY_B64 = randomBytes(32).toString("base64");
const KEY = Buffer.from(KEY_B64, "base64");
const CLIENT_ID = "client-123.apps.googleusercontent.com";
const ENV = {
  GOOGLE_CLIENT_ID: CLIENT_ID,
  GOOGLE_CLIENT_SECRET: "SECRETO-APP",
  AUTH_URL: "https://numa.arzium.com.ar",
  INTEGRATION_TOKEN_KEY: KEY_B64,
};
const NOW = new Date("2026-11-25T12:00:00Z");
const A = { tenantId: "tenant-a" };
const OWNER = "user-owner-a";

function sha256Hex(v: string) {
  return createHash("sha256").update(v).digest("hex");
}

function b64url(v: string) {
  return Buffer.from(v, "utf8").toString("base64url");
}

function idToken(sub: string, email = "Daiana@Example.com", over: Row = {}) {
  const claims = {
    iss: "https://accounts.google.com", aud: CLIENT_ID, sub, email, email_verified: true,
    exp: Math.floor(NOW.getTime() / 1000) + 3600, ...over,
  };
  return [b64url("{}"), b64url(JSON.stringify(claims)), "firma"].join(".");
}

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

const EVENTS_SCOPE = "openid https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/userinfo.email";

/** fetch falso: el canje devuelve `tokenBody`; el revoke, `revokeStatus`. */
function fakeFetch(tokenBody: unknown, opts: { tokenStatus?: number; revokeStatus?: number } = {}) {
  return vi.fn(async (url: string | URL | Request, _init?: RequestInit) => {
    if (String(url) === GOOGLE_TOKEN_URL) return jsonResponse(opts.tokenStatus ?? 200, tokenBody);
    if (String(url) === GOOGLE_REVOKE_URL) return jsonResponse(opts.revokeStatus ?? 200, {});
    throw new Error(`URL inesperada ${String(url)}`);
  });
}

function tokenBody(sub: string, over: Row = {}) {
  return { access_token: "AT-SECRETO", refresh_token: `RT-${sub}`, id_token: idToken(sub), scope: EVENTS_SCOPE, ...over };
}

function revokeCalls(fetch: ReturnType<typeof fakeFetch>) {
  return fetch.mock.calls
    .filter(([url]) => String(url) === GOOGLE_REVOKE_URL)
    .map(([, init]) => new URLSearchParams(String(init?.body)).get("token"));
}

/** Inicia el flujo para (tenant, user) y devuelve el state en claro. */
async function start(t = A, userId = OWNER): Promise<string> {
  const { url } = await startGoogleCalendarOAuth(t, { userId }, { env: ENV, now: () => NOW });
  return new URL(url).searchParams.get("state")!;
}

function query(params: Record<string, string>) {
  return new URLSearchParams(params);
}

let consoleSpies: ReturnType<typeof vi.spyOn>[] = [];

beforeEach(() => {
  vi.clearAllMocks();
  db.accounts = [];
  db.states = [];
  consoleSpies = (["log", "info", "warn", "error"] as const).map((m) => vi.spyOn(console, m).mockImplementation(() => {}));
});

function loggedText(): string {
  return JSON.stringify(consoleSpies.map((s) => s.mock.calls));
}

function existingAccount(over: Row = {}): Row {
  const row = {
    id: "c-existing", tenantId: "tenant-a", googleSubject: "sub-old", googleEmail: "vieja@example.com",
    refreshTokenEnc: sealSecret("RT-old", KEY, GOOGLE_SECRET_AAD.refreshToken("tenant-a")), scope: EVENTS_SCOPE,
    calendarId: "cal-x", connectedAt: new Date("2026-01-01T00:00:00Z"), disconnectedAt: null,
    syncError: "error viejo", syncErrorAt: new Date("2026-02-01T00:00:00Z"), ...over,
  };
  db.accounts.push(row);
  return row;
}

describe("startGoogleCalendarOAuth", () => {
  it("guarda tenantId, userId, el hash del state y el verifier sellado con el AAD del consultorio", async () => {
    const { url } = await startGoogleCalendarOAuth(A, { userId: OWNER }, { env: ENV, now: () => NOW });
    const params = new URL(url).searchParams;
    const state = params.get("state")!;
    expect(db.states).toHaveLength(1);
    const row = db.states[0]!;
    expect(row).toMatchObject({ tenantId: "tenant-a", userId: OWNER, stateHash: sha256Hex(state) });
    expect(JSON.stringify(row)).not.toContain(state);
    expect(row.expiresAt).toEqual(new Date(NOW.getTime() + 10 * 60_000));
    const verifier = openSecret(row.codeVerifierEnc, KEY, GOOGLE_SECRET_AAD.codeVerifier("tenant-a"));
    expect(() => openSecret(row.codeVerifierEnc, KEY, GOOGLE_SECRET_AAD.codeVerifier("tenant-b"))).toThrow();
    expect(params.get("code_challenge")).toBe(createHash("sha256").update(verifier).digest("base64url"));
    expect(params.get("redirect_uri")).toBe("https://numa.arzium.com.ar/api/google-calendar/oauth/callback");
    expect(params.get("client_id")).toBe(CLIENT_ID);
  });

  it("borra los states vencidos antes de crear", async () => {
    db.states.push({ stateHash: "viejo", tenantId: "tenant-a", userId: OWNER, codeVerifierEnc: "x", expiresAt: new Date(NOW.getTime() - 1) });
    await start();
    expect(db.states.map((s) => s.stateHash)).not.toContain("viejo");
  });

  it("sin agenda principal → tira y no crea state", async () => {
    await expect(startGoogleCalendarOAuth({ tenantId: "sin-agenda" }, { userId: OWNER }, { env: ENV, now: () => NOW })).rejects.toThrow();
    expect(db.states).toHaveLength(0);
  });

  it("sin config → GoogleCalendarConfigError", async () => {
    await expect(
      startGoogleCalendarOAuth(A, { userId: OWNER }, { env: { ...ENV, INTEGRATION_TOKEN_KEY: undefined }, now: () => NOW }),
    ).rejects.toBeInstanceOf(GoogleCalendarConfigError);
    expect(db.states).toHaveLength(0);
  });
});

describe("completeGoogleCalendarOAuth", () => {
  it("sin config → not_configured", async () => {
    const fetch = fakeFetch(tokenBody("s"));
    await expect(
      completeGoogleCalendarOAuth(A, { userId: OWNER, query: query({ code: "c", state: "s" }) }, { env: {}, fetch }),
    ).resolves.toBe("not_configured");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("code sin state → invalid_state", async () => {
    const fetch = fakeFetch(tokenBody("s"));
    await expect(
      completeGoogleCalendarOAuth(A, { userId: OWNER, query: query({ code: "c" }) }, { env: ENV, fetch, now: () => NOW }),
    ).resolves.toBe("invalid_state");
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each([
    ["de otra persona", A, "otra-persona"],
    ["de otro consultorio", { tenantId: "tenant-b" }, OWNER],
  ])("state %s → invalid_state, sin canje y el state sigue", async (_name, t, userId) => {
    const state = await start();
    const fetch = fakeFetch(tokenBody("s"));
    await expect(
      completeGoogleCalendarOAuth(t, { userId, query: query({ code: "CODE", state }) }, { env: ENV, fetch, now: () => NOW }),
    ).resolves.toBe("invalid_state");
    expect(fetch).not.toHaveBeenCalled();
    expect(db.states).toHaveLength(1);
  });

  it("state vencido → invalid_state, sin canje, no consumido", async () => {
    const state = await start();
    const fetch = fakeFetch(tokenBody("s"));
    const later = new Date(NOW.getTime() + 11 * 60_000);
    await expect(
      completeGoogleCalendarOAuth(A, { userId: OWNER, query: query({ code: "CODE", state }) }, { env: ENV, fetch, now: () => later }),
    ).resolves.toBe("invalid_state");
    expect(fetch).not.toHaveBeenCalled();
    expect(db.states).toHaveLength(1);
  });

  it("error=access_denied → denied y consume el state propio", async () => {
    const state = await start();
    const fetch = fakeFetch(tokenBody("s"));
    await expect(
      completeGoogleCalendarOAuth(A, { userId: OWNER, query: query({ error: "access_denied", state }) }, { env: ENV, fetch, now: () => NOW }),
    ).resolves.toBe("denied");
    expect(db.states).toHaveLength(0);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("denied con state ajeno → denied y no lo consume", async () => {
    const state = await start(A, "otra-persona");
    await expect(
      completeGoogleCalendarOAuth(A, { userId: OWNER, query: query({ error: "access_denied", state }) }, { env: ENV, now: () => NOW }),
    ).resolves.toBe("denied");
    expect(db.states).toHaveLength(1);
  });

  it("canje falla → rejected, log saneado", async () => {
    const state = await start();
    const fetch = fakeFetch({ error: "invalid_grant", error_description: "SECRETO" }, { tokenStatus: 400 });
    await expect(
      completeGoogleCalendarOAuth(A, { userId: OWNER, query: query({ code: "CODE-SECRETO", state }) }, { env: ENV, fetch, now: () => NOW }),
    ).resolves.toBe("rejected");
    expect(db.accounts).toHaveLength(0);
    expect(loggedText()).toContain("[google-calendar] oauth_exchange_failed");
    expect(loggedText()).not.toContain("SECRETO");
  });

  it("respuesta sin refresh_token → rejected, nada guardado", async () => {
    const state = await start();
    const fetch = fakeFetch(tokenBody("s", { refresh_token: undefined }));
    await expect(
      completeGoogleCalendarOAuth(A, { userId: OWNER, query: query({ code: "c", state }) }, { env: ENV, fetch, now: () => NOW }),
    ).resolves.toBe("rejected");
    expect(db.accounts).toHaveLength(0);
  });

  it("sin calendar.events → scope_denied, revoke una vez, nada guardado", async () => {
    const state = await start();
    const fetch = fakeFetch(tokenBody("s", { scope: "openid email" }));
    await expect(
      completeGoogleCalendarOAuth(A, { userId: OWNER, query: query({ code: "c", state }) }, { env: ENV, fetch, now: () => NOW }),
    ).resolves.toBe("scope_denied");
    expect(revokeCalls(fetch)).toEqual(["RT-s"]);
    expect(db.accounts).toHaveLength(0);
    expect(prisma.appointment.updateMany).not.toHaveBeenCalled();
  });

  it("id_token inválido → rejected, revoke llamado, nada guardado", async () => {
    const state = await start();
    const fetch = fakeFetch(tokenBody("s", { id_token: idToken("s", "x@y.com", { aud: "otro" }) }));
    await expect(
      completeGoogleCalendarOAuth(A, { userId: OWNER, query: query({ code: "c", state }) }, { env: ENV, fetch, now: () => NOW }),
    ).resolves.toBe("rejected");
    expect(revokeCalls(fetch)).toEqual(["RT-s"]);
    expect(db.accounts).toHaveLength(0);
  });

  it("first: guarda la conexión cifrada y deja fuera los turnos pasados sin evento", async () => {
    const state = await start();
    const fetch = fakeFetch(tokenBody("sub-1"));
    await expect(
      completeGoogleCalendarOAuth(A, { userId: OWNER, query: query({ code: "CODE-1", state }) }, { env: ENV, fetch, now: () => NOW }),
    ).resolves.toBe("connected");
    const row = db.accounts[0]!;
    expect(row).toMatchObject({
      tenantId: "tenant-a", googleSubject: "sub-1", googleEmail: "daiana@example.com", scope: EVENTS_SCOPE,
      connectedAt: NOW, disconnectedAt: null, syncError: null, syncErrorAt: null, calendarId: null,
    });
    expect(row.id).toMatch(/^c[0-9a-f]{24}$/);
    expect(openSecret(row.refreshTokenEnc, KEY, GOOGLE_SECRET_AAD.refreshToken("tenant-a"))).toBe("RT-sub-1");
    expect(() => openSecret(row.refreshTokenEnc, KEY, GOOGLE_SECRET_AAD.refreshToken("tenant-b"))).toThrow();
    expect(JSON.stringify(row)).not.toContain("AT-SECRETO");
    expect(prisma.appointment.updateMany.mock.calls).toEqual([[{
      where: { tenantId: "tenant-a", agendaId: "agenda-a", googleEventId: null, startsAt: { lt: NOW }, needsGoogleSync: true },
      data: { needsGoogleSync: false },
    }]]);
    expect(prisma.professional.updateMany.mock.calls).toEqual([[{
      where: { id: 7, tenantId: "tenant-a" }, data: { googleRefreshToken: null, googleSyncError: null },
    }]]);
    expect(revokeCalls(fetch)).toEqual([]);
    expect(db.states).toHaveLength(0);
    // Nada sensible en los logs.
    for (const secret of ["CODE-1", "RT-sub-1", "AT-SECRETO", state]) expect(loggedText()).not.toContain(secret);
  });

  it("same: no toca turnos, conserva calendarId y no revoca el anterior", async () => {
    existingAccount({ googleSubject: "sub-1" });
    const state = await start();
    const fetch = fakeFetch(tokenBody("sub-1"));
    await expect(
      completeGoogleCalendarOAuth(A, { userId: OWNER, query: query({ code: "c", state }) }, { env: ENV, fetch, now: () => NOW }),
    ).resolves.toBe("connected");
    expect(prisma.appointment.updateMany).not.toHaveBeenCalled();
    expect(db.accounts[0]).toMatchObject({ calendarId: "cal-x", googleSubject: "sub-1", syncError: null, connectedAt: NOW });
    expect(revokeCalls(fetch)).toEqual([]);
    expect(prisma.professional.updateMany).toHaveBeenCalledTimes(1);
  });

  it("anterior desconocido (traslado sin identidad) con connectedAt → same", async () => {
    existingAccount({ googleSubject: null });
    const state = await start();
    const fetch = fakeFetch(tokenBody("sub-9"));
    await completeGoogleCalendarOAuth(A, { userId: OWNER, query: query({ code: "c", state }) }, { env: ENV, fetch, now: () => NOW });
    expect(prisma.appointment.updateMany).not.toHaveBeenCalled();
    expect(db.accounts[0]).toMatchObject({ calendarId: "cal-x", googleSubject: "sub-9" });
    expect(revokeCalls(fetch)).toEqual([]);
  });

  it("changed: olvida eventos, re-encola futuros CONFIRMED, calendarId null y revoca el viejo después del commit", async () => {
    existingAccount({ googleSubject: "sub-old" });
    const order: string[] = [];
    prisma.$transaction.mockImplementationOnce(async (fn: (tx: unknown) => unknown) => {
      const out = await fn(prisma);
      order.push("commit");
      return out;
    });
    const state = await start();
    const fetch = fakeFetch(tokenBody("sub-new"));
    fetch.mockImplementation(async (url: string | URL | Request) => {
      if (String(url) === GOOGLE_REVOKE_URL) order.push("revoke");
      return String(url) === GOOGLE_TOKEN_URL ? jsonResponse(200, tokenBody("sub-new")) : jsonResponse(200, {});
    });
    await expect(
      completeGoogleCalendarOAuth(A, { userId: OWNER, query: query({ code: "c", state }) }, { env: ENV, fetch, now: () => NOW }),
    ).resolves.toBe("connected");
    const scope = { tenantId: "tenant-a", agendaId: "agenda-a" };
    expect(prisma.appointment.updateMany.mock.calls).toEqual([
      [{ where: { ...scope, googleEventId: { not: null } }, data: { googleEventId: null, needsGoogleSync: false } }],
      [{ where: { ...scope, status: "CONFIRMED", startsAt: { gte: NOW } }, data: { needsGoogleSync: true } }],
      [{ where: { ...scope, googleEventId: null, startsAt: { lt: NOW }, needsGoogleSync: true }, data: { needsGoogleSync: false } }],
    ]);
    expect(db.accounts[0]).toMatchObject({ calendarId: null, googleSubject: "sub-new" });
    expect(order).toEqual(["commit", "revoke"]);
    const revokeBodies = fetch.mock.calls.filter(([u]) => String(u) === GOOGLE_REVOKE_URL).map(([, i]) => String(i?.body));
    expect(revokeBodies).toEqual(["token=RT-old"]);
  });

  it("excepción fuera del flujo (sin agenda) → tira (la ruta lo convierte en rejected)", async () => {
    const fetch = fakeFetch(tokenBody("s"));
    await expect(
      completeGoogleCalendarOAuth({ tenantId: "sin-agenda" }, { userId: OWNER, query: query({ code: "c", state: "s" }) }, { env: ENV, fetch, now: () => NOW }),
    ).rejects.toThrow();
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe("disconnectGoogleCalendar (D7, D8)", () => {
  it("borra token/email/scope/syncError, conserva sub/calendarId/connectedAt, no toca turnos, revoca después", async () => {
    const before = existingAccount();
    const order: string[] = [];
    prisma.$transaction.mockImplementationOnce(async (fn: (tx: unknown) => unknown) => {
      const out = await fn(prisma);
      order.push("commit");
      return out;
    });
    const fetch = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => {
      order.push("revoke");
      return jsonResponse(200, {});
    });
    await expect(disconnectGoogleCalendar(A, { env: ENV, fetch, now: () => NOW })).resolves.toEqual({ revoked: true });
    expect(db.accounts[0]).toMatchObject({
      refreshTokenEnc: null, googleEmail: null, scope: null, syncError: null, syncErrorAt: null, disconnectedAt: NOW,
      googleSubject: "sub-old", calendarId: "cal-x", connectedAt: before.connectedAt,
    });
    expect(prisma.appointment.updateMany).not.toHaveBeenCalled();
    expect(prisma.professional.updateMany.mock.calls).toEqual([[{
      where: { id: 7, tenantId: "tenant-a" }, data: { googleRefreshToken: null, googleSyncError: null },
    }]]);
    expect(order).toEqual(["commit", "revoke"]);
    expect(new URLSearchParams(String(fetch.mock.calls[0]![1]?.body)).get("token")).toBe("RT-old");
  });

  it("revoke falla → revoked false y warn fijo sin el token", async () => {
    existingAccount();
    const fetch = vi.fn(async () => jsonResponse(400, { error: "invalid_token" }));
    await expect(disconnectGoogleCalendar(A, { env: ENV, fetch, now: () => NOW })).resolves.toEqual({ revoked: false });
    expect(consoleSpies[2]!.mock.calls).toEqual([["[google-calendar] revoke_failed"]]);
    expect(loggedText()).not.toContain("RT-old");
    expect(db.accounts[0]!.refreshTokenEnc).toBeNull();
  });

  it("sin fila → revoked false sin fetch, pero limpia el texto plano de Professional", async () => {
    const fetch = vi.fn();
    await expect(disconnectGoogleCalendar(A, { env: ENV, fetch, now: () => NOW })).resolves.toEqual({ revoked: false });
    expect(fetch).not.toHaveBeenCalled();
    expect(prisma.professional.updateMany).toHaveBeenCalledTimes(1);
    expect(db.accounts).toHaveLength(0);
  });

  it("token que no abre (clave cambiada) → desconecta igual sin revocar", async () => {
    existingAccount({ refreshTokenEnc: sealSecret("RT-old", randomBytes(32), GOOGLE_SECRET_AAD.refreshToken("tenant-a")) });
    const fetch = vi.fn();
    await expect(disconnectGoogleCalendar(A, { env: ENV, fetch, now: () => NOW })).resolves.toEqual({ revoked: false });
    expect(fetch).not.toHaveBeenCalled();
    expect(db.accounts[0]!.refreshTokenEnc).toBeNull();
  });
});

describe("getGoogleCalendarConnectionView", () => {
  it("not_configured sin env", async () => {
    existingAccount();
    await expect(getGoogleCalendarConnectionView(A, {})).resolves.toEqual({
      status: "not_configured", googleEmail: null, calendarId: null, syncError: null, connectedAt: null,
    });
  });

  it("connected: nunca devuelve refreshTokenEnc, googleSubject ni scope", async () => {
    const row = existingAccount();
    const view = await getGoogleCalendarConnectionView(A, ENV);
    expect(view).toEqual({
      status: "connected", googleEmail: "vieja@example.com", calendarId: "cal-x", syncError: "error viejo", connectedAt: row.connectedAt,
    });
    expect(Object.keys(view)).not.toEqual(expect.arrayContaining(["refreshTokenEnc"]));
    expect(JSON.stringify(view)).not.toContain("sub-old");
    // La consulta de la fila no pide la columna cifrada.
    expect(prisma.googleCalendarAccount.findUnique.mock.calls[0]![0].select).toEqual({
      googleEmail: true, calendarId: true, syncError: true, connectedAt: true,
    });
  });

  it("fila desconectada → not_connected con todo null", async () => {
    existingAccount({ refreshTokenEnc: null });
    await expect(getGoogleCalendarConnectionView(A, ENV)).resolves.toEqual({
      status: "not_connected", googleEmail: null, calendarId: null, syncError: null, connectedAt: null,
    });
  });
});

describe("setGoogleCalendarId / listConnectedGoogleCalendarTenants", () => {
  it("no conectado → false sin escribir", async () => {
    existingAccount({ refreshTokenEnc: null, calendarId: "cal-x" });
    await expect(setGoogleCalendarId(A, "otro")).resolves.toBe(false);
    expect(db.accounts[0]!.calendarId).toBe("cal-x");
    expect(prisma.googleCalendarAccount.updateMany.mock.calls[0]![0].where).toEqual({
      tenantId: "tenant-a", refreshTokenEnc: { not: null },
    });
  });

  it("conectado → true y guarda", async () => {
    existingAccount();
    await expect(setGoogleCalendarId(A, null)).resolves.toBe(true);
    expect(db.accounts[0]!.calendarId).toBeNull();
  });

  it("lista solo consultorios con token, ordenados", async () => {
    existingAccount({ tenantId: "tenant-z" });
    existingAccount({ tenantId: "tenant-b" });
    existingAccount({ tenantId: "tenant-c", refreshTokenEnc: null });
    await expect(listConnectedGoogleCalendarTenants()).resolves.toEqual([{ tenantId: "tenant-b" }, { tenantId: "tenant-z" }]);
  });
});
