// HU-025 (6.5): operación de accesos a consultorios por script. Dry-run por defecto; --apply escribe.
// Uso: DATABASE_URL=... tsx scripts/tenant-access.ts <subcomando> [opciones]
// Nunca imprime el `sub` completo ni stacks. Los errores salen con un mensaje fijo.
import { pathToFileURL } from "node:url";
import { canonicalEmail } from "@nutri-bot/core";
import { PrismaClient, type Prisma, type TenantRole } from "@prisma/client";

export const USAGE = [
  "Usage: tenant-access <command> [options]",
  "  pending",
  "  members --tenant <id>",
  "  grant --email <email> --tenant <id> --role OWNER|STAFF [--apply]",
  "  revoke --email <email> --tenant <id> [--apply]",
  "  forget-pending --email <email> [--apply]",
  "Dry run by default; --apply writes in a locked transaction. DATABASE_URL must be set explicitly.",
].join("\n");

export class TenantAccessScriptError extends Error {}

export type Command =
  | { name: "help" }
  | { name: "pending" }
  | { name: "members"; tenantId: string }
  | { name: "grant"; email: string; tenantId: string; role: TenantRole; apply: boolean }
  | { name: "revoke"; email: string; tenantId: string; apply: boolean }
  | { name: "forget-pending"; email: string; apply: boolean };

const FLAGS: Record<Exclude<Command["name"], "help">, { values: readonly string[]; apply: boolean }> = {
  pending: { values: [], apply: false },
  members: { values: ["--tenant"], apply: false },
  grant: { values: ["--email", "--tenant", "--role"], apply: true },
  revoke: { values: ["--email", "--tenant"], apply: true },
  "forget-pending": { values: ["--email"], apply: true },
};

const TENANT_ID = /^[A-Za-z0-9_-]{1,64}$/;
// Misma forma que valida legacy-memberships.ts para un email canónico.
const EMAIL =
  /^[a-z0-9_!#$%&'*+/=?^`{|}~-]+(?:\.[a-z0-9_!#$%&'*+/=?^`{|}~-]+)*@[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/;

const usageError = () => new TenantAccessScriptError(USAGE);

/** Validación pura de argumentos (testeada con vitest). Tira TenantAccessScriptError con el uso o un mensaje fijo. */
export function parseArgs(argv: readonly string[]): Command {
  const [name, ...rest] = argv;
  if (name === "--help" && rest.length === 0) return { name: "help" };
  if (!name || !(name in FLAGS)) throw usageError();
  const spec = FLAGS[name as keyof typeof FLAGS];
  const values = new Map<string, string>();
  let apply = false;
  for (let i = 0; i < rest.length; i++) {
    const flag = rest[i]!;
    if (flag === "--apply" && spec.apply && !apply) {
      apply = true;
      continue;
    }
    const value = rest[i + 1];
    if (!spec.values.includes(flag) || values.has(flag) || value === undefined || value.startsWith("--")) {
      throw usageError();
    }
    values.set(flag, value);
    i++;
  }
  if (values.size !== spec.values.length) throw usageError();

  const tenant = values.get("--tenant");
  if (tenant !== undefined && !TENANT_ID.test(tenant)) throw new TenantAccessScriptError("Invalid tenant id.");
  const rawEmail = values.get("--email");
  let email: string | undefined;
  if (rawEmail !== undefined) {
    email = canonicalEmail(rawEmail);
    if (email.length > 254 || !EMAIL.test(email)) throw new TenantAccessScriptError("Invalid email.");
  }
  const role = values.get("--role");
  if (role !== undefined && role !== "OWNER" && role !== "STAFF") throw new TenantAccessScriptError("Invalid role.");

  switch (name) {
    case "pending":
      return { name };
    case "members":
      return { name, tenantId: tenant! };
    case "grant":
      return { name, email: email!, tenantId: tenant!, role: role as TenantRole, apply };
    case "revoke":
      return { name, email: email!, tenantId: tenant!, apply };
    default:
      return { name: "forget-pending", email: email!, apply };
  }
}

/** Últimos 4 caracteres del sub, nunca el valor completo. */
export function maskSubject(subject: string | null): string {
  if (!subject) return "-";
  return subject.length > 8 ? `…${subject.slice(-4)}` : "…";
}

const iso = (date: Date | null) => (date ? date.toISOString() : "-");
const counts = (apply: boolean, values: Record<string, number>) =>
  `${apply ? "applied" : "dry-run"} ${Object.entries(values).map(([k, v]) => `${k}=${v}`).join(" ")}`;

type Tx = Prisma.TransactionClient;
type UserRow = { id: string; googleSubject: string | null };

async function findUserByEmail(tx: Tx, email: string): Promise<UserRow> {
  // Emails históricos pueden tener mayúsculas o espacios; se comparan en forma canónica sin reescribirlos.
  const rows = await tx.$queryRaw<UserRow[]>`
    SELECT id, "googleSubject" FROM "User" WHERE lower(btrim(email)) = ${email} LIMIT 2`;
  if (rows.length === 0) throw new TenantAccessScriptError("User not found.");
  if (rows.length > 1) throw new TenantAccessScriptError("Ambiguous email: more than one user matches.");
  return rows[0]!;
}

async function requireTenant(tx: Tx, tenantId: string) {
  if (!await tx.tenant.findUnique({ where: { id: tenantId }, select: { id: true } })) {
    throw new TenantAccessScriptError("Tenant not found.");
  }
}

async function pending(tx: Tx): Promise<string[]> {
  // 025a: todavía no hay acceso de plataforma, así que pendiente = sin membresía.
  const users = await tx.user.findMany({
    where: { memberships: { none: {} } },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: { email: true, createdAt: true, lastSignInAt: true, googleSubject: true },
  });
  return [
    `pending users=${users.length}`,
    ...users.map((u) => [u.email, iso(u.createdAt), iso(u.lastSignInAt), maskSubject(u.googleSubject)].join("\t")),
  ];
}

async function members(tx: Tx, tenantId: string): Promise<string[]> {
  await requireTenant(tx, tenantId);
  const rows = await tx.tenantMembership.findMany({
    where: { tenantId },
    orderBy: [{ createdAt: "asc" }, { userId: "asc" }],
    select: { role: true, createdAt: true, user: { select: { email: true } } },
  });
  return [`members tenant=${tenantId} count=${rows.length}`, ...rows.map((m) => [m.user.email, m.role, iso(m.createdAt)].join("\t"))];
}

async function grant(tx: Tx, c: Extract<Command, { name: "grant" }>): Promise<string[]> {
  await requireTenant(tx, c.tenantId);
  const agenda = await tx.agenda.findFirst({ where: { tenantId: c.tenantId, isPrimary: true }, select: { id: true } });
  if (!agenda) throw new TenantAccessScriptError("Tenant has no primary agenda.");
  const user = await findUserByEmail(tx, c.email);
  if (!user.googleSubject) throw new TenantAccessScriptError("User has no verified Google identity.");
  const existing = await tx.tenantMembership.findMany({ where: { userId: user.id }, select: { tenantId: true, role: true } });
  if (existing.some((m) => m.tenantId !== c.tenantId)) {
    throw new TenantAccessScriptError("User already has a membership in another tenant.");
  }
  const same = existing.find((m) => m.tenantId === c.tenantId);
  if (same && same.role !== c.role) throw new TenantAccessScriptError("User already has a different role in this tenant.");
  if (same) return [counts(c.apply, { memberships_created: 0, memberships_unchanged: 1 })];
  if (c.apply) await tx.tenantMembership.create({ data: { tenantId: c.tenantId, userId: user.id, role: c.role } });
  return [counts(c.apply, { memberships_created: 1, memberships_unchanged: 0 })];
}

async function revoke(tx: Tx, c: Extract<Command, { name: "revoke" }>): Promise<string[]> {
  await requireTenant(tx, c.tenantId);
  const user = await findUserByEmail(tx, c.email);
  const membership = await tx.tenantMembership.findUnique({
    where: { tenantId_userId: { tenantId: c.tenantId, userId: user.id } },
    select: { role: true },
  });
  if (!membership) throw new TenantAccessScriptError("User has no membership in this tenant.");
  if (membership.role === "OWNER") {
    const owners = await tx.tenantMembership.count({ where: { tenantId: c.tenantId, role: "OWNER" } });
    if (owners <= 1) throw new TenantAccessScriptError("Cannot revoke the last OWNER of the tenant.");
  }
  if (c.apply) {
    await tx.tenantMembership.delete({ where: { tenantId_userId: { tenantId: c.tenantId, userId: user.id } } });
  }
  return [counts(c.apply, { memberships_deleted: 1 })];
}

async function forgetPending(tx: Tx, c: Extract<Command, { name: "forget-pending" }>): Promise<string[]> {
  const user = await findUserByEmail(tx, c.email);
  // 025a: sin tablas de operador ni auditoría todavía (025d suma esos rechazos).
  if (await tx.tenantMembership.count({ where: { userId: user.id } }) > 0) {
    throw new TenantAccessScriptError("User has a membership; revoke it first.");
  }
  if (c.apply) await tx.user.delete({ where: { id: user.id } });
  return [counts(c.apply, { users_deleted: 1 })];
}

export async function run(command: Exclude<Command, { name: "help" }>, db: PrismaClient): Promise<string[]> {
  const apply = "apply" in command && command.apply;
  return db.$transaction(async (tx) => {
    // Serializa con otros escritores (legacy-memberships, otro operador) para que chequeo y escritura sean atómicos.
    if (apply) await tx.$executeRaw`LOCK TABLE "User", "TenantMembership" IN SHARE ROW EXCLUSIVE MODE`;
    switch (command.name) {
      case "pending":
        return pending(tx);
      case "members":
        return members(tx, command.tenantId);
      case "grant":
        return grant(tx, command);
      case "revoke":
        return revoke(tx, command);
      case "forget-pending":
        return forgetPending(tx, command);
    }
  }, { isolationLevel: apply ? "ReadCommitted" : "RepeatableRead" });
}

async function main(argv: string[]) {
  const command = parseArgs(argv);
  if (command.name === "help") {
    console.log(USAGE);
    return;
  }
  const datasourceUrl = process.env.DATABASE_URL;
  if (!datasourceUrl) throw new TenantAccessScriptError("Set DATABASE_URL explicitly.");
  const db = new PrismaClient({ datasourceUrl });
  try {
    for (const line of await run(command, db)) console.log(line);
  } finally {
    await db.$disconnect();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).catch((error: unknown) => {
    console.error(error instanceof TenantAccessScriptError ? error.message : "Tenant access command failed.");
    process.exitCode = 1;
  });
}
