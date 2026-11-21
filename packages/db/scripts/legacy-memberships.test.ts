// Run via test-legacy-memberships.sh against its disposable database.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";

if (process.env.VITEST) {
  const vitest = await import("vitest");
  vitest.test.skip("Legacy memberships: run test-legacy-memberships.sh for disposable PostgreSQL", () => {});
} else if (process.env.LEGACY_MEMBERSHIPS_DISPOSABLE === "1" &&
    /^postgresql:\/\/postgres:[a-f0-9]{36}@127\.0\.0\.1:\d+\/memberships$/.test(process.env.DATABASE_URL ?? "")) {
  integrationTests();
} else {
  throw new Error("Run test-legacy-memberships.sh for disposable PostgreSQL.");
}

function integrationTests() {
const db = new PrismaClient();
after(() => db.$disconnect());
const cli = fileURLToPath(new URL("./legacy-memberships.ts", import.meta.url));
const rosterPath = "roster.json";
const owner = { googleSubject: "1001", email: "owner@example.test", role: "OWNER" };
const staff = { googleSubject: "1002", email: "staff@example.test", role: "STAFF" };
const candidate = { googleSubject: "1003", email: "candidate@example.test", role: "OWNER" };

function run(roster: unknown, args: string[] = []) {
  writeFileSync(rosterPath, JSON.stringify(roster), { mode: 0o600 });
  const { status, stdout, stderr } = spawnSync(process.execPath, ["--import", tsx, cli, rosterPath, ...args], {
    encoding: "utf8",
    env: { ...process.env, ALLOWED_EMAILS: "unlisted@example.test" },
  });
  return { status, stdout, stderr };
}
const tsx = import.meta.resolve("tsx");
const snapshot = () => db.$queryRaw`SELECT
  (SELECT jsonb_agg(to_jsonb(u) ORDER BY id) FROM "User" u) AS users,
  (SELECT jsonb_agg(to_jsonb(m) ORDER BY "tenantId", "userId") FROM "TenantMembership" m) AS memberships`;

async function reject(roster: unknown, message: string, args = ["--apply"]) {
  const before = await snapshot();
  assert.deepEqual(await snapshotAfterReject(roster, args), {
    result: { status: 1, stdout: "", stderr: `${message}\n` }, state: before,
  });
}
async function snapshotAfterReject(roster: unknown, args: string[]) {
  return { result: run(roster, args), state: await snapshot() };
}

const counts = "users_created=1 identities_bound=2 memberships_created=2 memberships_unchanged=0\n";
test("dry run reports counts without persisting changes", async () => {
  const before = await snapshot();
  assert.deepEqual(run([owner, staff]), { status: 0, stdout: `dry-run ${counts}`, stderr: "" });
  assert.deepEqual(await snapshot(), before);
});

test("apply preserves original email and other tenant, and grants only listed memberships", async () => {
  assert.deepEqual(run([owner, staff], ["--apply"]), { status: 0, stdout: `applied ${counts}`, stderr: "" });
  assert.deepEqual(await db.$queryRaw`SELECT u.email, u."googleSubject", m."tenantId", m.role
    FROM "User" u LEFT JOIN "TenantMembership" m ON m."userId" = u.id
    ORDER BY u.email, m."tenantId"`, [
    { email: " Owner@Example.test ", googleSubject: "1001", tenantId: "legacy-tenant", role: "OWNER" },
    { email: " Owner@Example.test ", googleSubject: "1001", tenantId: "other-tenant", role: "STAFF" },
    { email: "staff@example.test", googleSubject: "1002", tenantId: "legacy-tenant", role: "STAFF" },
    { email: "unlisted@example.test", googleSubject: null, tenantId: null, role: null },
  ]);
});

test("matching rows are idempotent", async () => {
  const before = await snapshot();
  assert.deepEqual(run([owner, staff], ["--apply"]), { status: 0, stderr: "",
    stdout: "applied users_created=0 identities_bound=0 memberships_created=0 memberships_unchanged=2\n" });
  assert.deepEqual(await snapshot(), before);
});

test("at least one OWNER is required", () => reject([staff], "Roster must include an OWNER."));
test("repeated subject is rejected", () => reject([owner, { ...staff, googleSubject: owner.googleSubject }], "Duplicate roster identity or email."));
test("repeated email is rejected", () => reject([owner, { ...staff, email: owner.email }], "Duplicate roster identity or email."));
test("noncanonical email is rejected", () => reject([owner, { ...staff, email: " Staff@example.test " }], "Invalid roster entry."));
test("role outside OWNER or STAFF is rejected", () => reject([owner, { ...staff, role: "ADMIN" }], "Invalid roster entry."));
test("subject cannot be trimmed or coerced", () => reject([owner, { ...staff, googleSubject: " 1002" }], "Invalid roster entry."));
test("tenant selection is not accepted", () => reject([owner], "Usage: legacy-memberships <roster.json> [--apply]", ["--apply", "other-tenant"]));
test("existing subject cannot bind another email; earlier roster writes are rolled back", () =>
  reject([candidate, { ...owner, email: "alias@example.test" }], "Roster conflicts with existing identity."));
test("bound email cannot be rebound to another subject", () =>
  reject([candidate, { ...owner, googleSubject: "1004" }], "Roster conflicts with existing identity."));
test("different membership role is rejected, not changed", () =>
  reject([candidate, { ...staff, role: "OWNER" }], "Roster conflicts with existing membership role."));
test("ambiguous canonical email is rejected", async () => {
  await db.$executeRaw`INSERT INTO "User" (id,email) VALUES ('collision',' OWNER@example.test')`;
  await reject([candidate, owner], "Roster conflicts with existing identity.");
});
test("Google subject uniqueness is enforced in PostgreSQL", async () => {
  const before = await snapshot();
  await assert.rejects(db.$executeRaw`INSERT INTO "User" (id,email,"googleSubject")
    VALUES ('duplicate','duplicate@example.test','1001')`, (error: { meta?: { code?: string; message?: string } }) =>
    error.meta?.code === "23505" && (error.meta.message?.includes('(\"googleSubject\")') ?? false));
  assert.deepEqual(await snapshot(), before);
});
}
