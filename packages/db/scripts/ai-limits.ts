// HU-028c (D10a): topes de la IA del bot por consultorio, por script (sin UI). Dry-run por defecto; --apply escribe.
// Uso: DATABASE_URL=... tsx scripts/ai-limits.ts <subcomando> [opciones]
// No lee las BOT_AI_*: null = "usa el default del .env". Errores con mensaje fijo, sin stacks.
import { pathToFileURL } from "node:url";
import { parseTenantAiLimitArg, type TenantBotAiLimits } from "@nutri-bot/core";
import { PrismaClient, type Prisma } from "@prisma/client";

export const USAGE = [
  "Usage: ai-limits <command> [options]",
  "  show --tenant <id>",
  "  set --tenant <id> [--per-patient <n|default>] [--per-tenant <n|default>] [--apply]",
  'Values: 0..100000, or "default" to use the .env value. Dry run by default; --apply writes.',
].join("\n");

export class AiLimitsScriptError extends Error {}

export type Command =
  | { name: "help" }
  | { name: "show"; tenantId: string }
  | { name: "set"; tenantId: string; values: Partial<TenantBotAiLimits>; apply: boolean };

const FLAGS = {
  show: { required: ["--tenant"], optional: [] as string[], apply: false },
  set: { required: ["--tenant"], optional: ["--per-patient", "--per-tenant"], apply: true },
} as const;

const TENANT_ID = /^[A-Za-z0-9_-]{1,64}$/;
const usageError = () => new AiLimitsScriptError(USAGE);

/** Validación pura de argumentos. Tira AiLimitsScriptError con el uso o un mensaje fijo. */
export function parseArgs(argv: readonly string[]): Command {
  const [name, ...rest] = argv;
  if (name === "--help" && rest.length === 0) return { name: "help" };
  if (name !== "show" && name !== "set") throw usageError();
  const spec = FLAGS[name];
  const allowed: readonly string[] = [...spec.required, ...spec.optional];
  const values = new Map<string, string>();
  let apply = false;
  for (let i = 0; i < rest.length; i++) {
    const flag = rest[i]!;
    if (flag === "--apply" && spec.apply && !apply) {
      apply = true;
      continue;
    }
    const value = rest[i + 1];
    if (!allowed.includes(flag) || values.has(flag) || value === undefined || value.startsWith("--")) {
      throw usageError();
    }
    values.set(flag, value);
    i++;
  }
  if (!spec.required.every((f) => values.has(f))) throw usageError();
  const tenantId = values.get("--tenant")!;
  if (!TENANT_ID.test(tenantId)) throw new AiLimitsScriptError("Invalid tenant id.");
  if (name === "show") return { name, tenantId };

  const limits: Partial<TenantBotAiLimits> = {};
  const pairs = [
    ["--per-patient", "botDailyPerPatient"],
    ["--per-tenant", "botDailyPerTenant"],
  ] as const;
  for (const [flag, key] of pairs) {
    const raw = values.get(flag);
    if (raw === undefined) continue;
    const parsed = parseTenantAiLimitArg(raw);
    if (parsed === undefined) throw new AiLimitsScriptError(`Invalid value for ${flag}: use 0..100000 or "default".`);
    limits[key] = parsed;
  }
  if (Object.keys(limits).length === 0) {
    throw new AiLimitsScriptError("Set at least one of --per-patient or --per-tenant.");
  }
  return { name, tenantId, values: limits, apply };
}

type Tx = Pick<Prisma.TransactionClient, "tenant" | "tenantAiSettings">;
type Db = { $transaction: <T>(fn: (tx: Tx) => Promise<T>) => Promise<T> };

async function current(tx: Tx, tenantId: string): Promise<TenantBotAiLimits> {
  if (!await tx.tenant.findUnique({ where: { id: tenantId }, select: { id: true } })) {
    throw new AiLimitsScriptError("tenant_not_found");
  }
  const row = await tx.tenantAiSettings.findUnique({
    where: { tenantId },
    select: { botDailyPerPatient: true, botDailyPerTenant: true },
  });
  return { botDailyPerPatient: row?.botDailyPerPatient ?? null, botDailyPerTenant: row?.botDailyPerTenant ?? null };
}

export async function run(command: Exclude<Command, { name: "help" }>, db: Db): Promise<string[]> {
  return db.$transaction(async (tx) => {
    const before = await current(tx, command.tenantId);
    if (command.name === "show") return [JSON.stringify({ tenantId: command.tenantId, ...before })];
    const after = { ...before, ...command.values };
    if (command.apply) {
      await tx.tenantAiSettings.upsert({
        where: { tenantId: command.tenantId },
        create: { tenantId: command.tenantId, ...after },
        update: command.values,
      });
    }
    return [JSON.stringify({ mode: command.apply ? "apply" : "dry-run", tenantId: command.tenantId, before, after })];
  });
}

async function main(argv: string[]) {
  const command = parseArgs(argv);
  if (command.name === "help") {
    console.log(USAGE);
    return;
  }
  const datasourceUrl = process.env.DATABASE_URL;
  if (!datasourceUrl) throw new AiLimitsScriptError("Set DATABASE_URL explicitly.");
  const db = new PrismaClient({ datasourceUrl });
  try {
    for (const line of await run(command, db as unknown as Db)) console.log(line);
  } finally {
    await db.$disconnect();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).catch((error: unknown) => {
    console.error(error instanceof AiLimitsScriptError ? error.message : "AI limits command failed.");
    process.exitCode = 1;
  });
}
