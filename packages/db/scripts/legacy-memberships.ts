import { readFileSync } from "node:fs";
import { PrismaClient, type TenantRole } from "@prisma/client";

const tenantId = "legacy-tenant";
const usage = "Usage: legacy-memberships <roster.json> [--apply]";
const identityConflict = "Roster conflicts with existing identity.";
const canonical = (email: string) => email.trim().toLowerCase();
class BootstrapError extends Error {}

type Entry = { googleSubject: string; email: string; role: TenantRole };

function readRoster(path: string): Entry[] {
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(path, "utf8"));
  } catch {
    throw new BootstrapError("Cannot read roster JSON.");
  }
  if (!Array.isArray(raw)) throw new BootstrapError("Roster must be a JSON array.");
  const subjects = new Set<string>();
  const emails = new Set<string>();
  const entries: Entry[] = raw.map((row: unknown) => {
    if (!row || typeof row !== "object" || Object.keys(row).length !== 3) {
      throw new BootstrapError("Invalid roster entry.");
    }
    const { googleSubject, email, role } = row as Partial<Entry>;
    if (typeof googleSubject !== "string" || !/^[!-~]{1,255}$/.test(googleSubject) ||
        googleSubject !== googleSubject.trim() || typeof email !== "string" ||
        email !== canonical(email) || email.length > 254 ||
        !/^[a-z0-9_!#$%&'*+/=?^`{|}~-]+(?:\.[a-z0-9_!#$%&'*+/=?^`{|}~-]+)*@[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/.test(email) ||
        (role !== "OWNER" && role !== "STAFF")) {
      throw new BootstrapError("Invalid roster entry.");
    }
    if (subjects.has(googleSubject) || emails.has(email)) {
      throw new BootstrapError("Duplicate roster identity or email.");
    }
    subjects.add(googleSubject);
    emails.add(email);
    return { googleSubject, email, role };
  });
  if (!entries.some(({ role }) => role === "OWNER")) throw new BootstrapError("Roster must include an OWNER.");
  return entries;
}

async function main(args: string[]) {
  if (args.length === 1 && args[0] === "--help") {
    console.log(`${usage}\nDry run by default; --apply writes reviewed memberships for legacy-tenant only.`);
    return;
  }
  const [path, flag] = args;
  if (!path || path.startsWith("-") || (args.length !== 1 && (args.length !== 2 || flag !== "--apply"))) {
    throw new BootstrapError(usage);
  }
  const entries = readRoster(path);
  const apply = flag === "--apply";
  const datasourceUrl = process.env.DATABASE_URL;
  if (!datasourceUrl) throw new BootstrapError("Set DATABASE_URL explicitly.");
  const db = new PrismaClient({ datasourceUrl });
  try {
    const result = await db.$transaction(async (tx) => {
      // Serialize bootstrap writes with other writers so alias checks and inserts are atomic.
      if (apply) await tx.$executeRaw`LOCK TABLE "User", "TenantMembership" IN SHARE ROW EXCLUSIVE MODE`;
      if (!await tx.tenant.findUnique({ where: { id: tenantId }, select: { id: true } })) {
        throw new BootstrapError("Original tenant not found.");
      }
      // Read even case/space variants of historical emails without rewriting them.
      const users = await tx.$queryRaw<{ id: string; email: string; googleSubject: string | null }[]>`
        SELECT id, email, "googleSubject" FROM "User"`;
      const counts = { users_created: 0, identities_bound: 0, memberships_created: 0, memberships_unchanged: 0 };
      for (const { googleSubject, email, role } of entries) {
        const hits = users.filter((user) => user.googleSubject === googleSubject || canonical(user.email) === email);
        const [user] = hits;
        if (hits.length > 1 || (user && (canonical(user.email) !== email ||
            (user.googleSubject !== null && user.googleSubject !== googleSubject)))) {
          throw new BootstrapError(identityConflict);
        }
        let userId = user?.id;
        const membership = userId && await tx.tenantMembership.findUnique({
          where: { tenantId_userId: { tenantId, userId } }, select: { role: true },
        });
        if (membership && membership.role !== role) throw new BootstrapError("Roster conflicts with existing membership role.");
        if (!userId) {
          counts.users_created++;
          if (apply) ({ id: userId } = await tx.user.create({ data: { email }, select: { id: true } }));
        }
        if (!user?.googleSubject) {
          counts.identities_bound++;
          if (apply) await tx.$executeRaw`UPDATE "User" SET "googleSubject" = ${googleSubject}
            WHERE id = ${userId} AND "googleSubject" IS NULL`;
        }
        if (membership) counts.memberships_unchanged++;
        else {
          counts.memberships_created++;
          if (apply && userId) await tx.tenantMembership.create({ data: { tenantId, userId, role } });
        }
      }
      return counts;
    }, { isolationLevel: apply ? "ReadCommitted" : "RepeatableRead" });
    console.log(`${apply ? "applied" : "dry-run"} ${Object.entries(result).map(([key, value]) => `${key}=${value}`).join(" ")}`);
  } finally {
    await db.$disconnect();
  }
}

main(process.argv.slice(2)).catch((error: unknown) => {
  console.error(error instanceof BootstrapError ? error.message : "Membership bootstrap failed.");
  process.exitCode = 1;
});
