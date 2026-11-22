import { beforeEach, describe, expect, it, vi } from "vitest";

const { tx, db } = vi.hoisted(() => {
  const tx = {
    $executeRaw: vi.fn(),
    $queryRaw: vi.fn(),
    user: { findUnique: vi.fn(), update: vi.fn(), create: vi.fn() },
  };
  const db = {
    $transaction: vi.fn(async (fn: (client: typeof tx) => unknown) => fn(tx)),
    user: { findUnique: vi.fn() },
  };
  return { tx, db };
});
vi.mock("../index", () => ({ prisma: db }));

import { LEGACY_TENANT_ID, loadAccessFacts, registerGoogleIdentity } from "./tenantAccess";

const now = new Date("2026-11-21T12:00:00Z");
const identity = { subject: "google-sub-1", email: "daiana@example.test" };
const sqlText = (call: unknown[]) => (call[0] as TemplateStringsArray).join("?");

beforeEach(() => {
  vi.clearAllMocks();
  db.$transaction.mockImplementation(async (fn: (client: typeof tx) => unknown) => fn(tx));
  tx.$executeRaw.mockResolvedValue(1);
  tx.$queryRaw.mockResolvedValue([]);
  tx.user.findUnique.mockResolvedValue(null);
  tx.user.update.mockResolvedValue({ id: "u" });
  tx.user.create.mockResolvedValue({ id: "new-user" });
});

describe("registerGoogleIdentity", () => {
  it("usa ReadCommitted y el advisory lock antes de leer", async () => {
    await registerGoogleIdentity(identity, now);
    expect(db.$transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: "ReadCommitted" });
    const [lock] = tx.$executeRaw.mock.calls;
    expect(sqlText(lock!)).toContain("pg_advisory_xact_lock(hashtext(");
    expect(lock![1]).toBe("user-identity");
    expect(tx.$executeRaw.mock.invocationCallOrder[0]).toBeLessThan(tx.user.findUnique.mock.invocationCallOrder[0]!);
  });

  it("sub ya registrado → linked, solo actualiza lastSignInAt (no toca email)", async () => {
    tx.user.findUnique.mockResolvedValue({ id: "user-a" });
    await expect(registerGoogleIdentity({ ...identity, email: "otro@example.test" }, now))
      .resolves.toEqual({ status: "linked", userId: "user-a" });
    expect(tx.user.findUnique).toHaveBeenCalledWith({ where: { googleSubject: identity.subject }, select: { id: true } });
    expect(tx.user.update).toHaveBeenCalledWith({ where: { id: "user-a" }, data: { lastSignInAt: now }, select: { id: true } });
    expect(tx.$queryRaw).not.toHaveBeenCalled();
    expect(tx.user.create).not.toHaveBeenCalled();
  });

  it("sub nuevo y email libre → crea el User pendiente con email canónico", async () => {
    await expect(registerGoogleIdentity({ ...identity, email: " Daiana@Example.TEST " }, now))
      .resolves.toEqual({ status: "linked", userId: "new-user" });
    const [lookup] = tx.$queryRaw.mock.calls;
    expect(sqlText(lookup!)).toContain('lower(btrim(email)) = ?');
    expect(lookup![1]).toBe("daiana@example.test");
    expect(tx.user.create).toHaveBeenCalledWith({
      data: { email: "daiana@example.test", googleSubject: identity.subject, lastSignInAt: now },
      select: { id: true },
    });
    expect(tx.user.update).not.toHaveBeenCalled();
  });

  it.each([
    ["con otro sub", { id: "user-b" }],
    ["sin sub (googleSubject NULL)", { id: "user-c" }],
  ])("sub nuevo y email ya usado %s → conflict sin escrituras", async (_label, row) => {
    tx.$queryRaw.mockResolvedValue([row]);
    await expect(registerGoogleIdentity(identity, now)).resolves.toEqual({ status: "conflict" });
    expect(tx.user.create).not.toHaveBeenCalled();
    expect(tx.user.update).not.toHaveBeenCalled();
  });

  it("violación de unicidad concurrente (P2002) → conflict", async () => {
    tx.user.create.mockRejectedValue(Object.assign(new Error("unique"), { code: "P2002" }));
    await expect(registerGoogleIdentity(identity, now)).resolves.toEqual({ status: "conflict" });
  });

  it("otro error de base se propaga", async () => {
    const error = new Error("database unavailable");
    tx.user.findUnique.mockRejectedValue(error);
    await expect(registerGoogleIdentity(identity, now)).rejects.toBe(error);
  });

  it.each([{ subject: "", email: "a@b.test" }, { subject: "s", email: "   " }])(
    "identidad vacía %j → conflict sin abrir transacción", async (bad) => {
      await expect(registerGoogleIdentity(bad, now)).resolves.toEqual({ status: "conflict" });
      expect(db.$transaction).not.toHaveBeenCalled();
    },
  );

  it("usa el cliente inyectado", async () => {
    const other = { $transaction: vi.fn(async (fn: (c: typeof tx) => unknown) => fn(tx)) };
    await registerGoogleIdentity(identity, now, other as never);
    expect(other.$transaction).toHaveBeenCalledOnce();
    expect(db.$transaction).not.toHaveBeenCalled();
  });
});

describe("loadAccessFacts", () => {
  const select = {
    googleSubject: true,
    memberships: { take: 2, orderBy: { tenantId: "asc" }, select: { tenantId: true, role: true } },
  };

  it("User inexistente → null", async () => {
    db.user.findUnique.mockResolvedValue(null);
    await expect(loadAccessFacts("missing", now)).resolves.toBeNull();
    expect(db.user.findUnique).toHaveBeenCalledWith({ where: { id: "missing" }, select });
  });

  it("userId vacío → null sin consultar", async () => {
    await expect(loadAccessFacts("", now)).resolves.toBeNull();
    expect(db.user.findUnique).not.toHaveBeenCalled();
  });

  it("User pendiente → linked sin membresías", async () => {
    db.user.findUnique.mockResolvedValue({ googleSubject: "s", memberships: [] });
    await expect(loadAccessFacts("u", now)).resolves.toEqual({
      linked: true, memberships: [], platformOperator: false, activeSupportGrants: [],
    });
  });

  it("User sin sub → linked false", async () => {
    db.user.findUnique.mockResolvedValue({ googleSubject: null, memberships: [{ tenantId: LEGACY_TENANT_ID, role: "OWNER" }] });
    await expect(loadAccessFacts("u", now)).resolves.toMatchObject({ linked: false });
  });

  it("devuelve hasta dos membresías tal cual", async () => {
    const memberships = [{ tenantId: "a", role: "OWNER" }, { tenantId: "b", role: "STAFF" }];
    db.user.findUnique.mockResolvedValue({ googleSubject: "s", memberships });
    await expect(loadAccessFacts("u", now)).resolves.toEqual({
      linked: true, memberships, platformOperator: false, activeSupportGrants: [],
    });
  });

  it("usa el cliente inyectado", async () => {
    const other = { user: { findUnique: vi.fn().mockResolvedValue(null) } };
    await loadAccessFacts("u", now, other as never);
    expect(other.user.findUnique).toHaveBeenCalledOnce();
    expect(db.user.findUnique).not.toHaveBeenCalled();
  });
});
