// HU-023: cuenta de Mercado Pago vinculada. Sin base ni red: prisma es un doble en memoria y
// `fetch` es un vi.fn() inyectado. Ningún test manda WhatsApp (solo se mira lo que se encolaría).
import { createHash, randomBytes } from "node:crypto";
import {
  MERCADOPAGO_ACCOUNT_CHANGED_CANCEL_REASON,
  MERCADOPAGO_TOKEN_URL,
  MERCADOPAGO_USERS_ME_URL,
  messages,
} from "@nutri-bot/core";
import { beforeEach, describe, expect, it, vi } from "vitest";

type Row = Record<string, any>;

const db = vi.hoisted(() => ({
  account: null as Row | null,
  states: [] as Row[],
  pro: { phoneJid: "pro-jid", timezone: "America/Argentina/Buenos_Aires" } as Row | null,
  stalePendingAppointments: [] as Row[],
  pendingCount: 0,
  depositServices: 0,
}));

const mocks = vi.hoisted(() => {
  const sql = (strings: TemplateStringsArray) => strings.join("?").replace(/\s+/g, " ").trim();
  const emptyAccount = () => ({
    id: 1, tenantId: "legacy-tenant", userId: null, nickname: null, email: null, liveMode: null, accessTokenEnc: null, refreshTokenEnc: null,
    scope: null, expiresAt: null, connectedAt: null, refreshedAt: null, errorCode: null, errorAt: null,
    errorNotifiedAt: null, missingAlertAt: null,
  });
  const project = (row: Row | null, select?: Record<string, boolean>) => {
    if (!row) return null;
    if (!select) return { ...row };
    return Object.fromEntries(Object.keys(select).map((k) => [k, row[k]]));
  };
  const prisma: any = {
    $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn(prisma)),
    $executeRaw: vi.fn(async (strings: TemplateStringsArray, ...values: unknown[]) => {
      const q = sql(strings);
      if (q.startsWith('INSERT INTO "MercadoPagoAccount"')) {
        if (!db.account) {
          db.account = { ...emptyAccount(), tenantId: values[2] ?? null };
          return 1;
        }
        return 0;
      }
      throw new Error(`SQL inesperado: ${q}`);
    }),
    $queryRaw: vi.fn(async (strings: TemplateStringsArray, ...values: unknown[]) => {
      const q = sql(strings);
      if (q.startsWith('DELETE FROM "MercadoPagoOAuthState"')) {
        const [hash, email, now] = values as [string, string, Date];
        const idx = db.states.findIndex(
          (s) => s.stateHash === hash && s.sessionEmail === email && s.expiresAt.getTime() > now.getTime(),
        );
        if (idx < 0) return [];
        const [row] = db.states.splice(idx, 1);
        return [{ codeVerifierEnc: row!.codeVerifierEnc }];
      }
      if (q.includes('FROM "MercadoPagoAccount" WHERE id =') && q.endsWith("FOR UPDATE")) {
        return db.account && (!q.includes('"tenantId" =') || db.account.tenantId === values[1])
          ? [{ ...db.account }] : [];
      }
      if (q.startsWith('SELECT id FROM "Payment"')) return [];
      if (q.startsWith('UPDATE "MercadoPagoAccount" SET "missingAlertAt"')) {
        const [now, , , ownerOrCutoff, scopedCutoff] = values as [Date, Date, number, Date | string, Date?];
        const cutoff = scopedCutoff ?? (ownerOrCutoff as Date);
        const last = db.account?.missingAlertAt as Date | null;
        if (!db.account || (scopedCutoff && db.account.tenantId !== ownerOrCutoff) || (last && last.getTime() > cutoff.getTime())) return [];
        db.account.missingAlertAt = now;
        return [{ id: 1 }];
      }
      throw new Error(`SQL inesperado: ${q}`);
    }),
    mercadoPagoAccount: {
      findUnique: vi.fn(async ({ where, select }: { where: Row; select?: Record<string, boolean> }) => {
        const row = db.account;
        return project(row?.id === where.id && (where.tenantId === undefined || row?.tenantId === where.tenantId) ? row : null, select);
      }),
      update: vi.fn(async ({ data }: { data: Row }) => {
        Object.assign(db.account!, data);
        return { ...db.account };
      }),
    },
    mercadoPagoOAuthState: {
      deleteMany: vi.fn(async ({ where }: { where: { expiresAt: { lt: Date } } }) => {
        const before = db.states.length;
        db.states = db.states.filter((s) => !(s.expiresAt.getTime() < where.expiresAt.lt.getTime()));
        return { count: before - db.states.length };
      }),
      create: vi.fn(async ({ data }: { data: Row }) => {
        db.states.push({ id: `st-${db.states.length}`, ...data });
        return data;
      }),
    },
    payment: {
      count: vi.fn(async () => db.pendingCount),
      updateMany: vi.fn(async () => ({ count: 1 })),
    },
    service: { count: vi.fn(async () => db.depositServices) },
    appointment: {
      findMany: vi.fn(async ({ where }: { where: Row }) => db.stalePendingAppointments.filter(
        (appt) => (where.tenantId === undefined || appt.tenantId === where.tenantId)
          && (where.agendaId === undefined || appt.agendaId === where.agendaId),
      )),
      updateMany: vi.fn(async () => ({ count: 1 })),
    },
    agenda: {
      findFirst: vi.fn(async ({ where }: { where: Row }) => (where.tenantId === "legacy-tenant"
        ? { id: "legacy-agenda", tenantId: "legacy-tenant", professionalId: 1, professional: db.pro } : null)),
    },
    professional: { findUnique: vi.fn(async ({ select }: { select?: Record<string, boolean> }) => project(db.pro, select)) },
    outboundMessage: { create: vi.fn(async () => ({})), createMany: vi.fn(async () => ({ count: 1 })) },
  };
  return { prisma, emptyAccount };
});

vi.mock("../index", () => ({ prisma: mocks.prisma }));

import {
  MercadoPagoConfigError,
  completeMercadoPagoOAuth,
  disconnectMercadoPagoAccount,
  getMercadoPagoConnectionView,
  getMercadoPagoCredentials,
  isMercadoPagoCheckoutAvailable,
  markMercadoPagoAccountError,
  notifyMercadoPagoMissingForBooking,
  refreshMercadoPagoAccountToken,
  resolveMercadoPagoWebhookTenant,
  startMercadoPagoOAuth,
} from "./mercadopagoAccount";
import { SECRET_AAD, openSecret, sealSecret } from "./secretBox";

const T = { tenantId: "legacy-tenant" };
const KEY = randomBytes(32);
const NOW = new Date("2026-11-12T12:00:00.000Z");
const DAY = 24 * 60 * 60_000;
const ENV = {
  MERCADOPAGO_CLIENT_ID: "1234",
  MERCADOPAGO_CLIENT_SECRET: "SECRETO-APP",
  MERCADOPAGO_TOKEN_KEY: KEY.toString("base64"),
  AUTH_URL: "https://x.sslip.io",
  NODE_ENV: "test",
};
const TOKEN_RESPONSE = {
  access_token: "APP_USR-access-claro",
  token_type: "bearer",
  expires_in: 15552000,
  scope: "offline_access payments read write",
  user_id: 555,
  refresh_token: "TG-refresh-claro",
  public_key: "APP_USR-pk",
  live_mode: true,
};

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function makeFetch(token: { status: number; body: unknown } = { status: 200, body: TOKEN_RESPONSE }, me?: { status: number; body: unknown }) {
  return vi.fn(async (url: string | URL | Request, _init?: RequestInit) => {
    if (String(url) === MERCADOPAGO_TOKEN_URL) return json(token.status, token.body);
    if (String(url) === MERCADOPAGO_USERS_ME_URL) {
      const m = me ?? { status: 200, body: { id: 555, nickname: "VENDEDOR", email: "v@test.com" } };
      return json(m.status, m.body);
    }
    throw new Error(`URL inesperada ${String(url)}`);
  });
}

function connectedAccount(over: Row = {}): Row {
  return {
    ...mocks.emptyAccount(),
    userId: "555",
    nickname: "VENDEDOR",
    email: "v@test.com",
    liveMode: true,
    accessTokenEnc: sealSecret("APP_USR-access-guardado", KEY, SECRET_AAD.accessToken),
    refreshTokenEnc: sealSecret("TG-refresh-guardado", KEY, SECRET_AAD.refreshToken),
    expiresAt: new Date(NOW.getTime() + 100 * DAY),
    connectedAt: new Date(NOW.getTime() - DAY),
    ...over,
  };
}

function stalePending(id = "appt-1") {
  return {
    id,
    tenantId: "legacy-tenant",
    agendaId: "legacy-agenda",
    startsAt: new Date("2026-11-20T13:00:00.000Z"),
    patient: { whatsappJid: `${id}@s.whatsapp.net` },
    service: { name: "Primera consulta" },
  };
}

async function startAndGetState(fetch = makeFetch()) {
  const { url } = await startMercadoPagoOAuth(T, "Pro@Example.com", { env: ENV, now: () => NOW, fetch });
  return new URL(url).searchParams;
}

beforeEach(() => {
  vi.clearAllMocks();
  db.account = null;
  db.states = [];
  db.pro = { phoneJid: "pro-jid", timezone: "America/Argentina/Buenos_Aires" };
  db.stalePendingAppointments = [];
  db.pendingCount = 0;
  db.depositServices = 0;
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("startMercadoPagoOAuth", () => {
  it("guarda el state hasheado y el verifier cifrado; el challenge es sha256(verifier)", async () => {
    db.states.push({ stateHash: "vieja", codeVerifierEnc: "x", sessionEmail: "a", expiresAt: new Date(NOW.getTime() - 1) });
    const params = await startAndGetState();
    expect(db.states).toHaveLength(1);
    const saved = db.states[0]!;
    const state = params.get("state")!;
    expect(saved.stateHash).not.toBe(state);
    expect(saved.stateHash).toBe(createHash("sha256").update(state).digest("hex"));
    expect(saved.sessionEmail).toBe("pro@example.com");
    expect(saved.expiresAt).toEqual(new Date(NOW.getTime() + 10 * 60_000));
    const verifier = openSecret(saved.codeVerifierEnc, KEY, SECRET_AAD.codeVerifier);
    expect(saved.codeVerifierEnc).not.toContain(verifier);
    expect(verifier).toHaveLength(43);
    expect(params.get("code_challenge")).toBe(createHash("sha256").update(verifier).digest("base64url"));
    expect(params.get("code_challenge_method")).toBe("S256");
    expect(params.get("client_id")).toBe("1234");
    expect(params.get("redirect_uri")).toBe("https://x.sslip.io/api/mercadopago/oauth/callback");
    expect(mocks.prisma.mercadoPagoOAuthState.deleteMany).toHaveBeenCalledWith({ where: { expiresAt: { lt: NOW } } });
  });

  it("sin configuración → MercadoPagoConfigError", async () => {
    await expect(startMercadoPagoOAuth(T, "pro@example.com", { env: { ...ENV, MERCADOPAGO_CLIENT_ID: "" } })).rejects.toBeInstanceOf(
      MercadoPagoConfigError,
    );
    expect(mocks.prisma.mercadoPagoOAuthState.create).not.toHaveBeenCalled();
  });
});

describe("completeMercadoPagoOAuth", () => {
  it.each([null, "foreign-tenant"])("rechaza dueño %s antes de consumir state o hacer HTTP", async (tenantId) => {
    const fetch = makeFetch();
    const params = await startAndGetState(fetch);
    const account = connectedAccount({ tenantId });
    db.account = { ...account };
    const states = [...db.states];
    for (const [name, value] of [["code", "c"], ["error", "access_denied"]]) {
      const query = new URLSearchParams([[name!, value!], ["state", params.get("state")!]]);
      await expect(completeMercadoPagoOAuth(T, { sessionEmail: "pro@example.com", query }, { env: ENV, now: () => NOW, fetch })).resolves.toBe("rejected");
    }
    expect(db.states).toEqual(states);
    expect(db.account).toEqual(account);
    expect(fetch).not.toHaveBeenCalled();
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
  });

  it("sin agenda verificada no consume state ni hace HTTP", async () => {
    const fetch = makeFetch();
    const params = await startAndGetState(fetch);
    const states = [...db.states];
    mocks.prisma.agenda.findFirst.mockResolvedValueOnce(null);
    const query = new URLSearchParams({ code: "c", state: params.get("state")! });
    await expect(completeMercadoPagoOAuth(T, { sessionEmail: "pro@example.com", query }, { env: ENV, now: () => NOW, fetch })).rejects.toThrow("tenant_scope:tenant_scope_missing");
    expect(db.states).toEqual(states);
    expect(db.account).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("revalida el dueño en la transacción si aparece una cuenta ajena durante el canje", async () => {
    const fetch = makeFetch();
    const params = await startAndGetState(fetch);
    const foreign = connectedAccount({ tenantId: "foreign-tenant" });
    fetch.mockImplementationOnce(async () => {
      db.account = { ...foreign };
      return json(200, TOKEN_RESPONSE);
    });
    const query = new URLSearchParams({ code: "c", state: params.get("state")! });
    await expect(completeMercadoPagoOAuth(T, { sessionEmail: "pro@example.com", query }, { env: ENV, now: () => NOW, fetch })).rejects.toThrow("No hay cuenta de Mercado Pago usable");
    expect(db.states).toEqual([]);
    expect(db.account).toEqual(foreign);
    expect(mocks.prisma.mercadoPagoAccount.update).not.toHaveBeenCalled();
    expect(mocks.prisma.appointment.findMany).not.toHaveBeenCalled();
  });
  it("OK: guarda los tokens cifrados, limpia el error y devuelve connected", async () => {
    const fetch = makeFetch();
    const params = await startAndGetState(fetch);
    db.account = connectedAccount({ userId: "555", errorCode: "revoked", errorAt: NOW, errorNotifiedAt: NOW });
    const result = await completeMercadoPagoOAuth(T, 
      { sessionEmail: "pro@example.com", query: new URLSearchParams({ code: "TG-code", state: params.get("state")! }) },
      { env: ENV, now: () => NOW, fetch },
    );
    expect(result).toBe("connected");
    const body = JSON.parse(String(fetch.mock.calls[0]![1]!.body));
    expect(body.code_verifier).toHaveLength(43);
    expect(createHash("sha256").update(body.code_verifier).digest("base64url")).toBe(params.get("code_challenge"));
    const acc = db.account!;
    expect(acc.userId).toBe("555");
    expect(acc.nickname).toBe("VENDEDOR");
    expect(acc.email).toBe("v@test.com");
    expect(acc.liveMode).toBe(true);
    expect(acc.errorCode).toBeNull();
    expect(acc.errorNotifiedAt).toBeNull();
    expect(acc.accessTokenEnc).not.toContain("APP_USR-access-claro");
    expect(acc.refreshTokenEnc).not.toContain("TG-refresh-claro");
    expect(openSecret(acc.accessTokenEnc, KEY, SECRET_AAD.accessToken)).toBe("APP_USR-access-claro");
    expect(openSecret(acc.refreshTokenEnc, KEY, SECRET_AAD.refreshToken)).toBe("TG-refresh-claro");
    expect(acc.expiresAt).toEqual(new Date(NOW.getTime() + 15552000 * 1000));
    expect(db.states).toHaveLength(0);
  });

  it("state ya usado / de otra sesión / inexistente → invalid_state sin llamar a MP", async () => {
    const fetch = makeFetch();
    const params = await startAndGetState(fetch);
    const state = params.get("state")!;
    expect(
      await completeMercadoPagoOAuth(T, 
        { sessionEmail: "otra@example.com", query: new URLSearchParams({ code: "c", state }) },
        { env: ENV, now: () => NOW, fetch },
      ),
    ).toBe("invalid_state");
    expect(
      await completeMercadoPagoOAuth(T, 
        { sessionEmail: "pro@example.com", query: new URLSearchParams({ code: "c", state: "inventado" }) },
        { env: ENV, now: () => NOW, fetch },
      ),
    ).toBe("invalid_state");
    expect(fetch).not.toHaveBeenCalled();
    expect(mocks.prisma.mercadoPagoAccount.update).not.toHaveBeenCalled();
  });

  it("state vencido → invalid_state", async () => {
    const fetch = makeFetch();
    const params = await startAndGetState(fetch);
    const later = new Date(NOW.getTime() + 11 * 60_000);
    expect(
      await completeMercadoPagoOAuth(T, 
        { sessionEmail: "pro@example.com", query: new URLSearchParams({ code: "c", state: params.get("state")! }) },
        { env: ENV, now: () => later, fetch },
      ),
    ).toBe("invalid_state");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("el state es de un solo uso", async () => {
    const fetch = makeFetch();
    const params = await startAndGetState(fetch);
    const query = new URLSearchParams({ code: "TG-code", state: params.get("state")! });
    expect(await completeMercadoPagoOAuth(T, { sessionEmail: "pro@example.com", query }, { env: ENV, now: () => NOW, fetch })).toBe(
      "connected",
    );
    expect(await completeMercadoPagoOAuth(T, { sessionEmail: "pro@example.com", query }, { env: ENV, now: () => NOW, fetch })).toBe(
      "invalid_state",
    );
  });

  it("denied: consume el state, no llama a MP ni escribe la cuenta", async () => {
    const fetch = makeFetch();
    const params = await startAndGetState(fetch);
    expect(
      await completeMercadoPagoOAuth(T, 
        { sessionEmail: "pro@example.com", query: new URLSearchParams({ error: "access_denied", state: params.get("state")! }) },
        { env: ENV, now: () => NOW, fetch },
      ),
    ).toBe("denied");
    expect(fetch).not.toHaveBeenCalled();
    expect(db.states).toHaveLength(0);
    expect(mocks.prisma.mercadoPagoAccount.update).not.toHaveBeenCalled();
  });

  it("code sin state → invalid_state", async () => {
    expect(
      await completeMercadoPagoOAuth(T, 
        { sessionEmail: "pro@example.com", query: new URLSearchParams({ code: "c" }) },
        { env: ENV, now: () => NOW, fetch: makeFetch() },
      ),
    ).toBe("invalid_state");
  });

  it("sin configuración → not_configured", async () => {
    expect(
      await completeMercadoPagoOAuth(T, 
        { sessionEmail: "pro@example.com", query: new URLSearchParams({ code: "c", state: "s" }) },
        { env: { ...ENV, MERCADOPAGO_CLIENT_SECRET: undefined } },
      ),
    ).toBe("not_configured");
  });

  it("canje 400 → rejected, sin escribir la cuenta y con log saneado", async () => {
    const fetch = makeFetch({ status: 400, body: { error: "invalid_grant", message: "TG-code SECRETO-APP" } });
    const params = await startAndGetState(fetch);
    expect(
      await completeMercadoPagoOAuth(T, 
        { sessionEmail: "pro@example.com", query: new URLSearchParams({ code: "TG-code", state: params.get("state")! }) },
        { env: ENV, now: () => NOW, fetch },
      ),
    ).toBe("rejected");
    expect(mocks.prisma.mercadoPagoAccount.update).not.toHaveBeenCalled();
    expect(console.error).toHaveBeenCalledWith("[mercadopago] oauth_exchange_failed", { status: 400, code: "invalid_grant" });
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toMatch(/TG-code|SECRETO-APP/);
  });

  it("producción + live_mode false → wrong_environment sin escribir", async () => {
    const env = { ...ENV, NODE_ENV: "production" };
    const fetch = makeFetch({ status: 200, body: { ...TOKEN_RESPONSE, live_mode: false } });
    const { url } = await startMercadoPagoOAuth(T, "pro@example.com", { env, now: () => NOW, fetch });
    expect(
      await completeMercadoPagoOAuth(T, 
        { sessionEmail: "pro@example.com", query: new URLSearchParams({ code: "c", state: new URL(url).searchParams.get("state")! }) },
        { env, now: () => NOW, fetch },
      ),
    ).toBe("wrong_environment");
    expect(mocks.prisma.mercadoPagoAccount.update).not.toHaveBeenCalled();
  });

  it("/users/me falla → igual connected con nickname null", async () => {
    const fetch = makeFetch(undefined, { status: 500, body: {} });
    const params = await startAndGetState(fetch);
    expect(
      await completeMercadoPagoOAuth(T, 
        { sessionEmail: "pro@example.com", query: new URLSearchParams({ code: "c", state: params.get("state")! }) },
        { env: ENV, now: () => NOW, fetch },
      ),
    ).toBe("connected");
    expect(db.account!.nickname).toBeNull();
    expect(db.account!.email).toBeNull();
    expect(db.account!.userId).toBe("555");
  });

  describe("D6: señas pendientes de la cuenta anterior", () => {
    it("reconectar con OTRA cuenta cancela la seña pendiente y avisa al paciente", async () => {
      db.account = connectedAccount({ userId: "111" });
      db.stalePendingAppointments = [stalePending()];
      const fetch = makeFetch();
      const params = await startAndGetState(fetch);
      await completeMercadoPagoOAuth(T, 
        { sessionEmail: "pro@example.com", query: new URLSearchParams({ code: "c", state: params.get("state")! }) },
        { env: ENV, now: () => NOW, fetch },
      );
      const where = mocks.prisma.appointment.findMany.mock.calls[0]![0].where;
      expect(where.status).toBe("AWAITING_PAYMENT");
      expect(where.payments.some).toEqual({
        status: "PENDING",
        provider: "mercadopago",
        AND: [{ mercadopagoUserId: { not: null } }, { NOT: { mercadopagoUserId: "555" } }],
      });
      expect(mocks.prisma.appointment.updateMany).toHaveBeenCalledWith({
        where: { id: "appt-1", tenantId: "legacy-tenant", agendaId: "legacy-agenda", status: "AWAITING_PAYMENT" },
        data: { status: "CANCELLED", cancelledBy: "PROFESSIONAL", cancelReason: MERCADOPAGO_ACCOUNT_CHANGED_CANCEL_REASON },
      });
      expect(mocks.prisma.payment.updateMany).toHaveBeenCalledWith({
        where: { appointmentId: "appt-1", status: "PENDING", appointment: { tenantId: "legacy-tenant", agendaId: "legacy-agenda" } },
        data: { status: "CANCELLED" },
      });
      expect(mocks.prisma.outboundMessage.createMany).toHaveBeenCalledWith({
        skipDuplicates: true,
        data: [{
          tenantId: "legacy-tenant",
          toJid: "appt-1@s.whatsapp.net",
          kind: "CANCELLATION",
          appointmentId: "appt-1",
          body: messages.depositExpired({
            serviceName: "Primera consulta",
            startsAt: new Date("2026-11-20T13:00:00.000Z"),
            tz: "America/Argentina/Buenos_Aires",
          }),
        }],
      });
    });

    it("misma cuenta (o pagos sin cuenta) → no hay nada para cancelar", async () => {
      db.account = connectedAccount({ userId: "555" });
      db.stalePendingAppointments = [];
      const fetch = makeFetch();
      const params = await startAndGetState(fetch);
      await completeMercadoPagoOAuth(T, 
        { sessionEmail: "pro@example.com", query: new URLSearchParams({ code: "c", state: params.get("state")! }) },
        { env: ENV, now: () => NOW, fetch },
      );
      // El filtro excluye la cuenta que queda y los pagos con mercadopagoUserId null.
      const some = mocks.prisma.appointment.findMany.mock.calls[0]![0].where.payments.some;
      expect(some.AND).toContainEqual({ mercadopagoUserId: { not: null } });
      expect(some.AND).toContainEqual({ NOT: { mercadopagoUserId: "555" } });
      expect(mocks.prisma.appointment.updateMany).not.toHaveBeenCalled();
      expect(mocks.prisma.outboundMessage.createMany).not.toHaveBeenCalled();
    });

    it("si una aprobación concurrente ya confirmó el turno, no cancela ni avisa", async () => {
      db.account = connectedAccount({ userId: "111" });
      db.stalePendingAppointments = [stalePending()];
      mocks.prisma.appointment.updateMany.mockResolvedValueOnce({ count: 0 });
      const fetch = makeFetch();
      const params = await startAndGetState(fetch);
      await completeMercadoPagoOAuth(T, 
        { sessionEmail: "pro@example.com", query: new URLSearchParams({ code: "c", state: params.get("state")! }) },
        { env: ENV, now: () => NOW, fetch },
      );
      expect(mocks.prisma.payment.updateMany).not.toHaveBeenCalled();
      expect(mocks.prisma.outboundMessage.createMany).not.toHaveBeenCalled();
    });
  });
});

describe("disconnectMercadoPagoAccount", () => {
  it("borra tokens y datos, conserva missingAlertAt, cancela D6 y devuelve el conteo", async () => {
    const lastAlert = new Date(NOW.getTime() - DAY);
    db.account = connectedAccount({ missingAlertAt: lastAlert, errorCode: "revoked" });
    db.stalePendingAppointments = [
      stalePending("a1"), stalePending("a2"),
      { ...stalePending("foreign"), tenantId: "foreign-tenant", agendaId: "foreign-agenda" },
      { ...stalePending("other-agenda"), agendaId: "other-agenda" },
      { ...stalePending("unknown"), tenantId: null, agendaId: null },
    ];
    expect(await disconnectMercadoPagoAccount(T)).toEqual({ cancelledDeposits: 2 });
    const acc = db.account!;
    for (const k of ["userId", "nickname", "email", "liveMode", "accessTokenEnc", "refreshTokenEnc", "scope", "expiresAt", "connectedAt", "refreshedAt", "errorCode", "errorAt", "errorNotifiedAt"]) {
      expect(acc[k], k).toBeNull();
    }
    expect(acc.missingAlertAt).toEqual(lastAlert);
    const some = mocks.prisma.appointment.findMany.mock.calls[0]![0].where.payments.some;
    expect(some.AND).toEqual([{ mercadopagoUserId: { not: null } }]);
    expect(mocks.prisma.outboundMessage.createMany.mock.calls.map(([args]: Row[]) => (
      args!.data.map(({ appointmentId, tenantId }: Row) => ({ appointmentId, tenantId }))
    ))).toEqual([[{ appointmentId: "a1", tenantId: "legacy-tenant" }], [{ appointmentId: "a2", tenantId: "legacy-tenant" }]]);
  });

  it("provisiona la cuenta nueva con el dueño verificado", async () => {
    expect(await disconnectMercadoPagoAccount(T)).toEqual({ cancelledDeposits: 0 });
    expect(db.account?.tenantId).toBe("legacy-tenant");
  });

  it("sin agenda legacy verificada no provisiona ni cancela", async () => {
    mocks.prisma.agenda.findFirst.mockResolvedValueOnce(null);
    await expect(disconnectMercadoPagoAccount(T)).rejects.toThrow("tenant_scope:tenant_scope_missing");
    expect(db.account).toBeNull();
    expect(mocks.prisma.$executeRaw).not.toHaveBeenCalled();
    expect(mocks.prisma.appointment.findMany).not.toHaveBeenCalled();
  });

  it.each([null, "foreign-tenant"])("no modifica una cuenta de dueño %s ni llama al proveedor", async (tenantId) => {
    const account = connectedAccount({ tenantId, expiresAt: NOW });
    db.account = { ...account };
    const fetch = makeFetch();
    await expect(refreshMercadoPagoAccountToken(T, {}, { env: ENV, now: () => NOW, fetch })).rejects.toThrow("No hay cuenta de Mercado Pago usable");
    await expect(disconnectMercadoPagoAccount(T)).rejects.toThrow("No hay cuenta de Mercado Pago usable");
    await expect(markMercadoPagoAccountError(T, "revoked")).rejects.toThrow("No hay cuenta de Mercado Pago usable");
    expect(db.account).toEqual(account);
    expect(fetch).not.toHaveBeenCalled();
    expect(mocks.prisma.mercadoPagoAccount.update).not.toHaveBeenCalled();
    expect(mocks.prisma.appointment.findMany).not.toHaveBeenCalled();
    expect(mocks.prisma.outboundMessage.create).not.toHaveBeenCalled();
  });
});

describe("getMercadoPagoCredentials", () => {
  const deps = (over: Partial<typeof ENV> & Record<string, string | undefined> = {}, fetch = makeFetch()) => ({
    env: { ...ENV, ...over },
    now: () => NOW,
    fetch,
  });

  it.each([null, "foreign-tenant"])("no lee tokens de dueño %s ni usa respaldo, aun vencidos", async (tenantId) => {
    const fetch = makeFetch();
    const config = deps({ MERCADOPAGO_ALLOW_ENV_TOKEN: "true", MERCADOPAGO_ACCESS_TOKEN: "TEST-env", NODE_ENV: "development" }, fetch);
    for (const expiresAt of [NOW, new Date(NOW.getTime() + DAY)]) {
      const account = connectedAccount({ tenantId, expiresAt });
      db.account = { ...account };
      await expect(getMercadoPagoCredentials(T, { kind: "current" }, config)).resolves.toBeNull();
      await expect(getMercadoPagoCredentials(T, { kind: "payment", sellerUserId: "555" }, config)).resolves.toBeNull();
      await expect(getMercadoPagoCredentials(T, { kind: "payment", sellerUserId: null }, config)).resolves.toBeNull();
      expect(db.account).toEqual(account);
    }
    expect(fetch).not.toHaveBeenCalled();
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
    expect(mocks.prisma.mercadoPagoAccount.findUnique.mock.calls.every(([{ where, select }]: [Row]) =>
      !select.accessTokenEnc || (where.id === 1 && where.tenantId === "legacy-tenant"))).toBe(true);
  });

  it("sin agenda verificada no lee la cuenta ni usa respaldo", async () => {
    mocks.prisma.agenda.findFirst.mockResolvedValueOnce(null);
    db.account = connectedAccount();
    const fetch = makeFetch();
    const config = deps({ MERCADOPAGO_ALLOW_ENV_TOKEN: "true", MERCADOPAGO_ACCESS_TOKEN: "TEST-env", NODE_ENV: "development" }, fetch);
    await expect(getMercadoPagoCredentials(T, { kind: "current" }, config)).resolves.toBeNull();
    expect(mocks.prisma.mercadoPagoAccount.findUnique).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("conectada → token descifrado y sellerUserId", async () => {
    db.account = connectedAccount();
    expect(await getMercadoPagoCredentials(T, { kind: "current" }, deps())).toEqual({
      accessToken: "APP_USR-access-guardado",
      sellerUserId: "555",
      source: "account",
    });
    expect(await isMercadoPagoCheckoutAvailable(T, deps())).toBe(true);
  });

  it("sin cuenta y sin respaldo → null", async () => {
    expect(await getMercadoPagoCredentials(T, { kind: "current" }, deps())).toBeNull();
    expect(await isMercadoPagoCheckoutAvailable(T, deps())).toBe(false);
  });

  it("con errorCode → null", async () => {
    db.account = connectedAccount({ errorCode: "revoked" });
    expect(await getMercadoPagoCredentials(T, { kind: "current" }, deps())).toBeNull();
  });

  it("scope payment: misma cuenta → token; otra cuenta → null", async () => {
    db.account = connectedAccount();
    expect(await getMercadoPagoCredentials(T, { kind: "payment", sellerUserId: "555" }, deps())).toMatchObject({ sellerUserId: "555" });
    expect(await getMercadoPagoCredentials(T, { kind: "payment", sellerUserId: "111" }, deps())).toBeNull();
  });

  it("no se puede descifrar → marca decrypt_failed, avisa y devuelve null", async () => {
    db.account = connectedAccount({ accessTokenEnc: sealSecret("x", randomBytes(32), SECRET_AAD.accessToken) });
    expect(await getMercadoPagoCredentials(T, { kind: "current" }, deps())).toBeNull();
    expect(db.account!.errorCode).toBe("decrypt_failed");
    expect(mocks.prisma.outboundMessage.create).toHaveBeenCalledWith({
      data: { tenantId: "legacy-tenant", toJid: "pro-jid", kind: "PROFESSIONAL_ALERT", body: messages.MERCADOPAGO_DISCONNECTED_ALERT },
    });
  });

  it("vencido → renueva (force) y devuelve el token nuevo", async () => {
    db.account = connectedAccount({ expiresAt: new Date(NOW.getTime() - 1000) });
    const fetch = makeFetch();
    const creds = await getMercadoPagoCredentials(T, { kind: "current" }, deps({}, fetch));
    expect(creds).toEqual({ accessToken: "APP_USR-access-claro", sellerUserId: "555", source: "account" });
    expect(JSON.parse(String(fetch.mock.calls[0]![1]!.body)).grant_type).toBe("refresh_token");
    const tokenReads = mocks.prisma.mercadoPagoAccount.findUnique.mock.calls.filter(([{ select }]: [Row]) => select.accessTokenEnc);
    expect(tokenReads.map(([{ where }]: [Row]) => where)).toEqual([
      { id: 1, tenantId: "legacy-tenant" }, { id: 1, tenantId: "legacy-tenant" },
    ]);
  });

  it("vencido y la renovación falla por red → null sin marcar", async () => {
    db.account = connectedAccount({ expiresAt: new Date(NOW.getTime() - 1000) });
    expect(await getMercadoPagoCredentials(T, { kind: "current" }, deps({}, makeFetch({ status: 503, body: {} })))).toBeNull();
    expect(db.account!.errorCode).toBeNull();
  });

  it("respaldo de dev (flag + token + no producción) → env_fallback", async () => {
    const env = { MERCADOPAGO_ALLOW_ENV_TOKEN: "true", MERCADOPAGO_ACCESS_TOKEN: "TEST-env", NODE_ENV: "development" };
    expect(await getMercadoPagoCredentials(T, { kind: "current" }, deps(env))).toEqual({
      accessToken: "TEST-env",
      sellerUserId: null,
      source: "env_fallback",
    });
    db.account = connectedAccount();
    expect(await getMercadoPagoCredentials(T, { kind: "payment", sellerUserId: null }, deps(env))).toMatchObject({
      source: "env_fallback",
    });
  });

  it("mismo respaldo con NODE_ENV=production → null", async () => {
    const env = { MERCADOPAGO_ALLOW_ENV_TOKEN: "true", MERCADOPAGO_ACCESS_TOKEN: "TEST-env", NODE_ENV: "production" };
    expect(await getMercadoPagoCredentials(T, { kind: "current" }, deps(env))).toBeNull();
    expect(await getMercadoPagoCredentials(T, { kind: "payment", sellerUserId: null }, deps(env))).toBeNull();
  });

  it("cuenta conectada: el respaldo de dev no la pisa", async () => {
    db.account = connectedAccount();
    const env = { MERCADOPAGO_ALLOW_ENV_TOKEN: "true", MERCADOPAGO_ACCESS_TOKEN: "TEST-env", NODE_ENV: "development" };
    expect(await getMercadoPagoCredentials(T, { kind: "current" }, deps(env))).toMatchObject({ source: "account" });
  });
});

describe("refreshMercadoPagoAccountToken", () => {
  const deps = (fetch = makeFetch(), now = NOW) => ({ env: ENV, now: () => now, fetch });

  it("faltan más de 30 días → not_needed sin llamar a MP", async () => {
    db.account = connectedAccount({ expiresAt: new Date(NOW.getTime() + 31 * DAY) });
    const fetch = makeFetch();
    expect(await refreshMercadoPagoAccountToken(T, {}, deps(fetch))).toBe("not_needed");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("faltan menos de 30 días → bloquea la fila, guarda el refresh NUEVO y el vencimiento", async () => {
    db.account = connectedAccount({ expiresAt: new Date(NOW.getTime() + 29 * DAY) });
    expect(await refreshMercadoPagoAccountToken(T, {}, deps())).toBe("refreshed");
    const lockCall = mocks.prisma.$queryRaw.mock.calls.find((c: any[]) => c[0].join("?").includes("FOR UPDATE"));
    expect(lockCall).toBeDefined();
    expect(openSecret(db.account!.refreshTokenEnc, KEY, SECRET_AAD.refreshToken)).toBe("TG-refresh-claro");
    expect(openSecret(db.account!.accessTokenEnc, KEY, SECRET_AAD.accessToken)).toBe("APP_USR-access-claro");
    expect(db.account!.expiresAt).toEqual(new Date(NOW.getTime() + 15552000 * 1000));
    expect(db.account!.refreshedAt).toEqual(NOW);
    expect(db.account!.userId).toBe("555");
  });

  it("force: si otro proceso ya renovó (no vencido) → not_needed", async () => {
    db.account = connectedAccount({ expiresAt: new Date(NOW.getTime() + 10 * DAY) });
    const fetch = makeFetch();
    expect(await refreshMercadoPagoAccountToken(T, { force: true }, deps(fetch))).toBe("not_needed");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("invalid_grant → revoked + un solo aviso por incidente", async () => {
    db.account = connectedAccount({ expiresAt: new Date(NOW.getTime() + 5 * DAY) });
    const fetch = makeFetch({ status: 400, body: { error: "invalid_grant" } });
    expect(await refreshMercadoPagoAccountToken(T, {}, deps(fetch))).toBe("revoked");
    expect(db.account!.errorCode).toBe("revoked");
    expect(db.account!.errorNotifiedAt).toEqual(NOW);
    expect(mocks.prisma.outboundMessage.create).toHaveBeenCalledTimes(1);
    expect(mocks.prisma.outboundMessage.create).toHaveBeenCalledWith({
      data: { tenantId: "legacy-tenant", toJid: "pro-jid", kind: "PROFESSIONAL_ALERT", body: messages.MERCADOPAGO_DISCONNECTED_ALERT },
    });
    // Segundo intento con el error ya puesto: no hay cuenta usable y no se repite el aviso.
    expect(await refreshMercadoPagoAccountToken(T, {}, deps(fetch))).toBe("not_connected");
    await markMercadoPagoAccountError(T, "revoked");
    expect(mocks.prisma.outboundMessage.create).toHaveBeenCalledTimes(1);
  });

  it("400 invalid_client → refresh_failed", async () => {
    db.account = connectedAccount({ expiresAt: new Date(NOW.getTime() + 5 * DAY) });
    expect(await refreshMercadoPagoAccountToken(T, {}, deps(makeFetch({ status: 400, body: { error: "invalid_client" } })))).toBe(
      "refresh_failed",
    );
    expect(db.account!.errorCode).toBe("refresh_failed");
  });

  it("503 → transient_error sin marcar", async () => {
    db.account = connectedAccount({ expiresAt: new Date(NOW.getTime() + 5 * DAY) });
    expect(await refreshMercadoPagoAccountToken(T, {}, deps(makeFetch({ status: 503, body: {} })))).toBe("transient_error");
    expect(db.account!.errorCode).toBeNull();
    expect(mocks.prisma.outboundMessage.create).not.toHaveBeenCalled();
  });

  it("sin phoneJid → marca sin mensaje", async () => {
    db.pro = { phoneJid: null, timezone: "America/Argentina/Buenos_Aires" };
    db.account = connectedAccount({ expiresAt: new Date(NOW.getTime() + 5 * DAY) });
    expect(await refreshMercadoPagoAccountToken(T, {}, deps(makeFetch({ status: 401, body: {} })))).toBe("revoked");
    expect(db.account!.errorCode).toBe("revoked");
    expect(db.account!.errorNotifiedAt).toBeNull();
    expect(mocks.prisma.outboundMessage.create).not.toHaveBeenCalled();
  });

  it("sin cuenta o sin configuración → not_connected", async () => {
    expect(await refreshMercadoPagoAccountToken(T, {}, deps())).toBe("not_connected");
    db.account = connectedAccount({ expiresAt: new Date(NOW.getTime() + 5 * DAY) });
    expect(await refreshMercadoPagoAccountToken(T, {}, { env: { ...ENV, MERCADOPAGO_CLIENT_ID: undefined } })).toBe("not_connected");
  });

  it("los logs no llevan tokens", async () => {
    db.account = connectedAccount({ expiresAt: new Date(NOW.getTime() + 5 * DAY) });
    await refreshMercadoPagoAccountToken(T, {}, deps(makeFetch({ status: 400, body: { error: "invalid_grant" } })));
    expect(console.error).toHaveBeenCalledWith("[mercadopago] refresh_failed", { status: 400, code: "invalid_grant" });
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toMatch(/TG-refresh|APP_USR|SECRETO-APP/);
  });
});

describe("notifyMercadoPagoMissingForBooking", () => {
  const input = { patientName: "Ana", patientPhone: "+5493515552345", serviceName: "Primera consulta" };

  it("primera vez → encola con el texto exacto; dentro de las 24 h → no", async () => {
    expect(await notifyMercadoPagoMissingForBooking(T, input)).toBe(true);
    expect(mocks.prisma.outboundMessage.create).toHaveBeenCalledWith({
      data: { tenantId: "legacy-tenant", toJid: "pro-jid", kind: "PROFESSIONAL_ALERT", body: messages.professionalDepositUnavailableAlert(input) },
    });
    expect(await notifyMercadoPagoMissingForBooking(T, input)).toBe(false);
    expect(mocks.prisma.outboundMessage.create).toHaveBeenCalledTimes(1);
  });

  it("pasadas 24 h → vuelve a avisar", async () => {
    db.account = { ...mocks.emptyAccount(), tenantId: "legacy-tenant", missingAlertAt: new Date(Date.now() - 25 * 60 * 60_000) };
    expect(await notifyMercadoPagoMissingForBooking(T, input)).toBe(true);
  });

  it.each([null, "foreign-tenant"])("no modifica una cuenta sin dueño confiable (%s)", async (tenantId) => {
    const account = { ...mocks.emptyAccount(), tenantId };
    db.account = { ...account };
    expect(await notifyMercadoPagoMissingForBooking(T, input)).toBe(false);
    expect(db.account).toEqual(account);
    expect(mocks.prisma.outboundMessage.create).not.toHaveBeenCalled();
    expect(mocks.prisma.mercadoPagoAccount.findUnique).not.toHaveBeenCalled();
  });

  it("sin phoneJid → no encola", async () => {
    db.pro = { phoneJid: null, timezone: "America/Argentina/Buenos_Aires" };
    expect(await notifyMercadoPagoMissingForBooking(T, input)).toBe(false);
    expect(mocks.prisma.outboundMessage.create).not.toHaveBeenCalled();
  });
});

describe("getMercadoPagoConnectionView", () => {
  it("no muestra metadatos de una cuenta ajena", async () => {
    db.account = connectedAccount({ tenantId: "foreign-tenant" });
    expect(await getMercadoPagoConnectionView(T)).toMatchObject({
      userId: null, nickname: null, email: null, liveMode: null, connectedAt: null, errorCode: null,
    });
  });

  it("sin agenda verificada no lee metadatos ni cuenta señas o servicios", async () => {
    mocks.prisma.agenda.findFirst.mockResolvedValueOnce(null);
    await expect(getMercadoPagoConnectionView(T)).rejects.toThrow("tenant_scope:tenant_scope_missing");
    expect(mocks.prisma.mercadoPagoAccount.findUnique).not.toHaveBeenCalled();
    expect(mocks.prisma.payment.count).not.toHaveBeenCalled();
    expect(mocks.prisma.service.count).not.toHaveBeenCalled();
  });
  it("no expone tokens aunque prisma los trajera, y no los pide en el select", async () => {
    db.account = connectedAccount();
    db.pendingCount = 2;
    db.depositServices = 1;
    vi.stubEnv("MERCADOPAGO_CLIENT_ID", ENV.MERCADOPAGO_CLIENT_ID);
    vi.stubEnv("MERCADOPAGO_CLIENT_SECRET", ENV.MERCADOPAGO_CLIENT_SECRET);
    vi.stubEnv("MERCADOPAGO_TOKEN_KEY", ENV.MERCADOPAGO_TOKEN_KEY);
    vi.stubEnv("AUTH_URL", ENV.AUTH_URL);
    // Un prisma "descuidado" que devuelve la fila entera.
    mocks.prisma.mercadoPagoAccount.findUnique.mockResolvedValueOnce({ ...db.account });
    const view = await getMercadoPagoConnectionView(T);
    vi.unstubAllEnvs();
    expect(view).toEqual({
      status: "connected",
      userId: "555",
      nickname: "VENDEDOR",
      email: "v@test.com",
      liveMode: true,
      connectedAt: db.account!.connectedAt,
      errorCode: null,
      pendingDepositCount: 2,
      hasActiveDepositServices: true,
    });
    expect(Object.keys(view).some((k) => k.endsWith("Enc"))).toBe(false);
    expect(JSON.stringify(view)).not.toMatch(/v1\.|APP_USR|TG-refresh/);
    const select = mocks.prisma.mercadoPagoAccount.findUnique.mock.calls[0]![0].select;
    expect(Object.keys(select).some((k) => k.endsWith("Enc"))).toBe(false);
    expect(mocks.prisma.service.count).toHaveBeenCalledWith({ where: { tenantId: "legacy-tenant", active: true, requiresDeposit: true } });
    expect(mocks.prisma.payment.count).toHaveBeenCalledWith({ where: {
      status: "PENDING",
      provider: "mercadopago",
      AND: [{ mercadopagoUserId: { not: null } }],
      appointment: { status: "AWAITING_PAYMENT", tenantId: "legacy-tenant", agendaId: "legacy-agenda" },
    } });
  });

  it("sin configuración → not_configured; con error → needs_reconnect", async () => {
    vi.stubEnv("MERCADOPAGO_CLIENT_ID", "");
    expect((await getMercadoPagoConnectionView(T)).status).toBe("not_configured");
    vi.unstubAllEnvs();
    vi.stubEnv("MERCADOPAGO_CLIENT_ID", ENV.MERCADOPAGO_CLIENT_ID);
    vi.stubEnv("MERCADOPAGO_CLIENT_SECRET", ENV.MERCADOPAGO_CLIENT_SECRET);
    vi.stubEnv("MERCADOPAGO_TOKEN_KEY", ENV.MERCADOPAGO_TOKEN_KEY);
    vi.stubEnv("AUTH_URL", ENV.AUTH_URL);
    expect((await getMercadoPagoConnectionView(T)).status).toBe("not_connected");
    db.account = connectedAccount({ errorCode: "refresh_failed" });
    const view = await getMercadoPagoConnectionView(T);
    vi.unstubAllEnvs();
    expect(view.status).toBe("needs_reconnect");
    expect(view.errorCode).toBe("refresh_failed");
  });
});

describe("HU-025: la cuenta solo vale para su consultorio", () => {
  const B = { tenantId: "tenant-b" };
  const agendaB = () => mocks.prisma.agenda.findFirst.mockImplementation(async ({ where }: { where: Row }) => ({
    id: where.tenantId === "tenant-b" ? "agenda-b" : "legacy-agenda", tenantId: where.tenantId, professionalId: 2, professional: db.pro,
  }));

  it("otro consultorio no ve ni usa la cuenta conectada del original", async () => {
    agendaB();
    db.account = connectedAccount();
    expect(await getMercadoPagoConnectionView(B)).toMatchObject({ userId: null, nickname: null, email: null });
    expect(await getMercadoPagoCredentials(B, { kind: "current" }, { env: ENV, now: () => NOW })).toBeNull();
    expect(await isMercadoPagoCheckoutAvailable(B, { env: ENV, now: () => NOW })).toBe(false);
    expect(await getMercadoPagoCredentials(T, { kind: "current" }, { env: ENV, now: () => NOW })).toMatchObject({ sellerUserId: "555" });
  });

  it("otro consultorio no puede desconectar ni marcar error en la cuenta del original", async () => {
    agendaB();
    db.account = connectedAccount();
    const before = structuredClone(db.account);
    await expect(disconnectMercadoPagoAccount(B)).rejects.toThrow("No hay cuenta de Mercado Pago usable");
    await expect(markMercadoPagoAccountError(B, "revoked")).rejects.toThrow("No hay cuenta de Mercado Pago usable");
    expect(db.account).toEqual(before);
    expect(mocks.prisma.mercadoPagoAccount.update).not.toHaveBeenCalled();
    expect(mocks.prisma.outboundMessage.create).not.toHaveBeenCalled();
  });

  it("webhook: el consultorio sale de la fila de la cuenta", async () => {
    db.account = null;
    expect(await resolveMercadoPagoWebhookTenant()).toEqual({ tenantId: "legacy-tenant" });
    db.account = connectedAccount({ tenantId: "tenant-b" });
    expect(await resolveMercadoPagoWebhookTenant()).toEqual({ tenantId: "tenant-b" });
    db.account = connectedAccount({ tenantId: null });
    expect(await resolveMercadoPagoWebhookTenant()).toBeNull();
  });
});
