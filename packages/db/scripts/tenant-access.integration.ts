// HU-025 (10.3). Correr solo vía test-tenant-access.sh, contra su Postgres descartable.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";
import { decideTenantAccess } from "@nutri-bot/core";
import { PrismaClient } from "@prisma/client";
import { LEGACY_TENANT_ID, loadAccessFacts, registerGoogleIdentity } from "../domain/tenantAccess";

if (process.env.TENANT_ACCESS_DISPOSABLE !== "1" ||
    !/^postgresql:\/\/postgres:[a-f0-9]{36}@127\.0\.0\.1:\d+\/tenant_access$/.test(process.env.DATABASE_URL ?? "")) {
  throw new Error("Run test-tenant-access.sh for disposable PostgreSQL.");
}

const db = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL });
after(() => db.$disconnect());

const cli = fileURLToPath(new URL("./tenant-access.ts", import.meta.url));
const tsx = import.meta.resolve("tsx");
const enabled = { enabledTenantIds: [LEGACY_TENANT_ID] };
const now = new Date("2026-11-21T12:00:00.000Z");
const later = new Date("2026-11-21T13:00:00.000Z");

const daiana = { subject: "100000000000000004321", email: "Daiana@Example.test" };
const outsider = { subject: "100000000000000009876", email: "otra.cuenta@example.test" };

function run(...args: string[]) {
  const { status, stdout, stderr } = spawnSync(process.execPath, ["--import", tsx, cli, ...args], {
    encoding: "utf8",
    env: { PATH: process.env.PATH, DATABASE_URL: process.env.DATABASE_URL, HOME: process.env.HOME },
  });
  return { status, stdout, stderr };
}
const snapshot = () => db.$queryRaw`SELECT
  (SELECT jsonb_agg(to_jsonb(u) ORDER BY id) FROM "User" u) AS users,
  (SELECT jsonb_agg(to_jsonb(m) ORDER BY "tenantId", "userId") FROM "TenantMembership" m) AS memberships`;
async function unchanged<T>(fn: () => Promise<T> | T): Promise<T> {
  const before = await snapshot();
  const result = await fn();
  assert.deepEqual(await snapshot(), before);
  return result;
}
async function rejects(message: string, ...args: string[]) {
  assert.deepEqual(await unchanged(() => run(...args, "--apply")), { status: 1, stdout: "", stderr: `${message}\n` });
}
const idOf = async (email: string) =>
  (await db.user.findFirstOrThrow({ where: { email }, select: { id: true } })).id;
const access = async (email: string) => decideTenantAccess(await loadAccessFacts(await idOf(email), now, db), enabled);

test("upgrade: preserva las filas existentes y rellena createdAt", async () => {
  const users = await db.user.findMany({ orderBy: { id: "asc" } });
  assert.deepEqual(users.map(({ id, email, googleSubject, lastSignInAt }) => ({ id, email, googleSubject, lastSignInAt })), [
    { id: "bound-b", email: "bound@example.test", googleSubject: "100000000000000000001", lastSignInAt: null },
    { id: "hist", email: " Hist@Example.test ", googleSubject: null, lastSignInAt: null },
  ]);
  assert.ok(users.every((u) => u.createdAt instanceof Date));
  const [membership] = await db.tenantMembership.findMany();
  assert.equal(membership?.role, "STAFF");
  assert.ok(membership?.createdAt instanceof Date);
});

test("registerGoogleIdentity: email igual con otro sub → conflict sin escrituras", async () => {
  assert.deepEqual(await unchanged(() =>
    registerGoogleIdentity({ subject: "100000000000000000999", email: "BOUND@example.test" }, now, db)),
  { status: "conflict" });
});

test("registerGoogleIdentity: email histórico sin sub (con mayúsculas/espacios) → conflict sin escrituras", async () => {
  assert.deepEqual(await unchanged(() =>
    registerGoogleIdentity({ subject: "100000000000000000888", email: "hist@example.test" }, now, db)),
  { status: "conflict" });
});

test("registerGoogleIdentity: sub nuevo → User pendiente; mismo sub → mismo User, solo lastSignInAt", async () => {
  const first = await registerGoogleIdentity({ ...daiana, email: " Daiana@Example.test " }, now, db);
  assert.equal(first.status, "linked");
  const userId = (first as { userId: string }).userId;
  const row = await db.user.findUniqueOrThrow({ where: { id: userId } });
  assert.equal(row.email, "daiana@example.test");
  assert.equal(row.googleSubject, daiana.subject);
  assert.deepEqual(row.lastSignInAt, now);
  assert.deepEqual(await access("daiana@example.test"), { ok: false, reason: "no_membership" });

  const again = await registerGoogleIdentity({ ...daiana, email: "cambiado@example.test" }, later, db);
  assert.deepEqual(again, { status: "linked", userId });
  const updated = await db.user.findUniqueOrThrow({ where: { id: userId } });
  assert.equal(updated.email, "daiana@example.test");
  assert.deepEqual(updated.lastSignInAt, later);
  assert.deepEqual(updated.createdAt, row.createdAt);
});

test("registerGoogleIdentity concurrente: mismo sub → un solo User; mismo email con subs distintos → uno linked", async () => {
  const sameSub = await Promise.all(Array.from({ length: 6 }, () =>
    registerGoogleIdentity({ subject: "100000000000000005555", email: "concurrente@example.test" }, now, db)));
  const ids = new Set(sameSub.map((r) => (r.status === "linked" ? r.userId : "conflict")));
  assert.equal(ids.size, 1);
  assert.ok(!ids.has("conflict"));
  assert.equal(await db.user.count({ where: { googleSubject: "100000000000000005555" } }), 1);

  const sameEmail = await Promise.all(Array.from({ length: 6 }, (_, i) =>
    registerGoogleIdentity({ subject: `10000000000000000700${i}`, email: "carrera@example.test" }, now, db)));
  assert.equal(sameEmail.filter((r) => r.status === "linked").length, 1);
  assert.equal(sameEmail.filter((r) => r.status === "conflict").length, 5);
  assert.equal(await db.user.count({ where: { email: "carrera@example.test" } }), 1);
});

test("pending lista identidades sin membresía con el sub enmascarado", async () => {
  const { status, stdout, stderr } = await unchanged(() => run("pending"));
  assert.equal(status, 0);
  assert.equal(stderr, "");
  const lines = stdout.trimEnd().split("\n");
  assert.equal(lines[0], "pending users=4");
  const daianaLine = lines.find((l) => l.startsWith("daiana@example.test\t"));
  assert.match(daianaLine ?? "", /^daiana@example\.test\t\S+Z\t2026-11-21T13:00:00\.000Z\t…4321$/);
  assert.ok(lines.some((l) => /^ Hist@Example\.test \t\S+Z\t-\t-$/.test(l)), "histórico sin sub ni login");
  assert.ok(!lines.some((l) => l.startsWith("bound@example.test")), "con membresía no es pendiente");
  assert.ok(!stdout.includes(daiana.subject), "nunca imprime el sub completo");
});

test("6.4 ensayo: grant en dry-run no escribe; --apply da acceso a la identidad del padrón", async () => {
  const args = ["grant", "--email", "DAIANA@example.test", "--tenant", LEGACY_TENANT_ID, "--role", "OWNER"];
  assert.deepEqual(await unchanged(() => run(...args)),
    { status: 0, stdout: "dry-run memberships_created=1 memberships_unchanged=0\n", stderr: "" });
  assert.deepEqual(run(...args, "--apply"),
    { status: 0, stdout: "applied memberships_created=1 memberships_unchanged=0\n", stderr: "" });
  assert.deepEqual(await access("daiana@example.test"),
    { ok: true, grant: { kind: "member", tenantId: LEGACY_TENANT_ID, role: "OWNER" } });

  const members = run("members", "--tenant", LEGACY_TENANT_ID);
  assert.equal(members.status, 0);
  assert.match(members.stdout, /^members tenant=legacy-tenant count=1\ndaiana@example\.test\tOWNER\t\S+Z\n$/);

  // Idempotente con el mismo rol; rechaza otro rol.
  assert.deepEqual(await unchanged(() => run(...args, "--apply")),
    { status: 0, stdout: "applied memberships_created=0 memberships_unchanged=1\n", stderr: "" });
  await rejects("User already has a different role in this tenant.",
    "grant", "--email", "daiana@example.test", "--tenant", LEGACY_TENANT_ID, "--role", "STAFF");
});

test("6.4 ensayo: una cuenta fuera del padrón queda pendiente y sin acceso; forget-pending la borra", async () => {
  assert.equal((await registerGoogleIdentity(outsider, now, db)).status, "linked");
  assert.deepEqual(await access(outsider.email), { ok: false, reason: "no_membership" });
  assert.match(run("pending").stdout, /^otra\.cuenta@example\.test\t/m);

  assert.deepEqual(await unchanged(() => run("forget-pending", "--email", outsider.email)),
    { status: 0, stdout: "dry-run users_deleted=1\n", stderr: "" });
  assert.deepEqual(run("forget-pending", "--email", outsider.email, "--apply"),
    { status: 0, stdout: "applied users_deleted=1\n", stderr: "" });
  assert.equal(await db.user.count({ where: { email: outsider.email } }), 0);
});

test("grant rechaza sin escribir: otro tenant (D7), sin sub, sin User, tenant inexistente o sin agenda principal", async () => {
  await rejects("User already has a membership in another tenant.",
    "grant", "--email", "bound@example.test", "--tenant", LEGACY_TENANT_ID, "--role", "STAFF");
  await rejects("User has no verified Google identity.",
    "grant", "--email", "hist@example.test", "--tenant", LEGACY_TENANT_ID, "--role", "STAFF");
  await rejects("User not found.",
    "grant", "--email", "nadie@example.test", "--tenant", LEGACY_TENANT_ID, "--role", "STAFF");
  await rejects("Tenant not found.",
    "grant", "--email", "daiana@example.test", "--tenant", "no-existe", "--role", "STAFF");
  await rejects("Tenant has no primary agenda.",
    "grant", "--email", "concurrente@example.test", "--tenant", "tenant-no-agenda", "--role", "OWNER");
  assert.deepEqual(await unchanged(() => run("members", "--tenant", "no-existe")),
    { status: 1, stdout: "", stderr: "Tenant not found.\n" });
});

test("revoke: rechaza el último OWNER; con dos OWNER permite quitar uno; dry-run no escribe", async () => {
  await rejects("Cannot revoke the last OWNER of the tenant.", "revoke", "--email", "daiana@example.test", "--tenant", LEGACY_TENANT_ID);
  await rejects("User has no membership in this tenant.", "revoke", "--email", "concurrente@example.test", "--tenant", LEGACY_TENANT_ID);

  assert.equal(run("grant", "--email", "concurrente@example.test", "--tenant", LEGACY_TENANT_ID, "--role", "OWNER", "--apply").status, 0);
  const revokeArgs = ["revoke", "--email", "concurrente@example.test", "--tenant", LEGACY_TENANT_ID];
  assert.deepEqual(await unchanged(() => run(...revokeArgs)), { status: 0, stdout: "dry-run memberships_deleted=1\n", stderr: "" });
  assert.deepEqual(run(...revokeArgs, "--apply"), { status: 0, stdout: "applied memberships_deleted=1\n", stderr: "" });
  // El User queda pendiente y pierde el acceso en la siguiente lectura.
  assert.deepEqual(await access("concurrente@example.test"), { ok: false, reason: "no_membership" });
});

test("forget-pending rechaza a un User con membresía", async () => {
  await rejects("User has a membership; revoke it first.", "forget-pending", "--email", "daiana@example.test");
});

test("decideTenantAccess con hechos reales: otro tenant → tenant_not_enabled; dos membresías → multiple_memberships", async () => {
  assert.deepEqual(await access("bound@example.test"), { ok: false, reason: "tenant_not_enabled" });
  // Dos membresías no se pueden crear por script; se arman a mano para el caso D7.
  const id = await idOf("concurrente@example.test");
  await db.tenantMembership.createMany({ data: [
    { tenantId: LEGACY_TENANT_ID, userId: id, role: "STAFF" },
    { tenantId: "tenant-b", userId: id, role: "STAFF" },
  ] });
  assert.deepEqual(await access("concurrente@example.test"), { ok: false, reason: "multiple_memberships" });
  assert.deepEqual(await access(" Hist@Example.test "), { ok: false, reason: "unlinked" });
});
