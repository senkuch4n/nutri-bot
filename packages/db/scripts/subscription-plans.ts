// HU-029b (SDD §B.5.8): planes y ofertas de la suscripción de Arzium, por script (sin consola de Arzium).
// Lo corre Arzium; ningún agente lo corre contra una base salvo pedido del usuario.
//
// Uso:  npm run subscription-plans --workspace packages/db -- <comando> [opciones]
// Prod: docker compose run --rm migrate npx --no-install tsx packages/db/scripts/subscription-plans.ts <comando>
//
// Comandos:
//   list [--mode live|sandbox]
//   create --mode <m> --code <c> --name <n> --amount <a> --frequency <f> --unit days|months
//          [--trial <n> --trial-unit days|months] [--cycles <n>] [--private] [--default]
//   set-default --mode <m> --code <c>
//   deactivate --mode <m> --code <c>
//   offer --tenant <id> --mode <m> --code <c> [--allow-trial] [--expires YYYY-MM-DD] [--note <texto>]
//   revoke-offer --tenant <id> --mode <m> --code <c>
//
// Ejemplos:
//   "1 mes gratis" (promo para un consultorio):
//     create --mode live --code mensual-promo --name "Plan mensual" --amount 60000 --frequency 1 --unit months --trial 1 --trial-unit months --private
//     offer --tenant <id> --mode live --code mensual-promo --allow-trial
//   "anual con descuento":
//     create --mode live --code anual-2027 --name "Plan anual" --amount 600000 --frequency 12 --unit months
//   "pack 3 meses" (solo cuando G4 se confirme; hoy --cycles da cycles_not_supported):
//     create --mode live --code pack-3 --name "Pack 3 meses" --amount 150000 --frequency 3 --unit months --cycles 1
//
// Los planes son inmutables en lo económico (X2): para cambiar importe, período o prueba se crea un plan nuevo
// con otro code y se desactiva el viejo. No toca suscripciones existentes.
import { pathToFileURL } from "node:url";
import { formatPlanPrice, validatePlanTerms, type BillingMode, type BillingPeriodUnit, type PlanTerms } from "@nutri-bot/core";
import { PrismaClient } from "@prisma/client";

export class SubscriptionPlansScriptError extends Error {}

export const USAGE = [
  "Uso: subscription-plans <comando> [opciones]",
  "  list [--mode live|sandbox]",
  "  create --mode <m> --code <c> --name <n> --amount <a> --frequency <f> --unit days|months [--trial <n> --trial-unit days|months] [--cycles <n>] [--private] [--default]",
  "  set-default --mode <m> --code <c>",
  "  deactivate --mode <m> --code <c>",
  "  offer --tenant <id> --mode <m> --code <c> [--allow-trial] [--expires YYYY-MM-DD] [--note <texto>]",
  "  revoke-offer --tenant <id> --mode <m> --code <c>",
].join("\n");

export type Command =
  | { name: "list"; mode: BillingMode | null }
  | { name: "create"; mode: BillingMode; code: string; planName: string; terms: PlanTerms; isPublic: boolean; isDefault: boolean }
  | { name: "set-default" | "deactivate"; mode: BillingMode; code: string }
  | { name: "offer"; tenantId: string; mode: BillingMode; code: string; allowTrial: boolean; expiresAt: Date | null; note: string | null }
  | { name: "revoke-offer"; tenantId: string; mode: BillingMode; code: string };

type Spec = { required: string[]; optional: string[]; booleans: string[] };
const SPECS: Record<Command["name"], Spec> = {
  list: { required: [], optional: ["--mode"], booleans: [] },
  create: {
    required: ["--mode", "--code", "--name", "--amount", "--frequency", "--unit"],
    optional: ["--trial", "--trial-unit", "--cycles"],
    booleans: ["--private", "--default"],
  },
  "set-default": { required: ["--mode", "--code"], optional: [], booleans: [] },
  deactivate: { required: ["--mode", "--code"], optional: [], booleans: [] },
  offer: { required: ["--tenant", "--mode", "--code"], optional: ["--expires", "--note"], booleans: ["--allow-trial"] },
  "revoke-offer": { required: ["--tenant", "--mode", "--code"], optional: [], booleans: [] },
};

const CODE = /^[a-z0-9][a-z0-9-]{0,39}$/;
const TENANT_ID = /^[A-Za-z0-9_-]{1,64}$/;
const usage = () => new SubscriptionPlansScriptError(USAGE);

const parseMode = (v: string): BillingMode => {
  if (v === "live") return "LIVE";
  if (v === "sandbox") return "SANDBOX";
  throw new SubscriptionPlansScriptError("--mode tiene que ser live o sandbox.");
};
const parseUnit = (v: string, flag: string): BillingPeriodUnit => {
  if (v === "days") return "DAYS";
  if (v === "months") return "MONTHS";
  throw new SubscriptionPlansScriptError(`${flag} tiene que ser days o months.`);
};
const parseInt10 = (v: string, flag: string): number => {
  if (!/^\d+$/.test(v)) throw new SubscriptionPlansScriptError(`${flag} tiene que ser un entero.`);
  return Number(v);
};
/** "60000" | "60000.5" | "60000.50" → "60000.00" (validatePlanTerms decide si es válido). */
const normalizeAmount = (v: string): string => (/^\d+(\.\d{1,2})?$/.test(v) ? Number(v).toFixed(2) : v);

/** Validación pura de argumentos (sin base). */
export function parseArgs(argv: readonly string[]): Command {
  const [name, ...rest] = argv;
  if (!name || !(name in SPECS)) throw usage();
  const spec = SPECS[name as Command["name"]];
  const values = new Map<string, string>();
  const flags = new Set<string>();
  for (let i = 0; i < rest.length; i++) {
    const flag = rest[i]!;
    if (spec.booleans.includes(flag) && !flags.has(flag)) {
      flags.add(flag);
      continue;
    }
    const value = rest[i + 1];
    if (![...spec.required, ...spec.optional].includes(flag) || values.has(flag) || value === undefined || value.startsWith("--")) {
      throw usage();
    }
    values.set(flag, value);
    i++;
  }
  if (!spec.required.every((f) => values.has(f))) throw usage();

  const get = (f: string) => values.get(f)!;
  if (name === "list") return { name, mode: values.has("--mode") ? parseMode(get("--mode")) : null };

  const mode = parseMode(get("--mode"));
  const code = get("--code");
  if (!CODE.test(code)) throw new SubscriptionPlansScriptError("--code: minúsculas, números y guiones (máx. 40).");

  if (name === "create") {
    const hasTrial = values.has("--trial") || values.has("--trial-unit");
    if (hasTrial && !(values.has("--trial") && values.has("--trial-unit"))) {
      throw new SubscriptionPlansScriptError("--trial y --trial-unit van juntos.");
    }
    const planName = get("--name").trim();
    if (planName.length < 1 || planName.length > 80) throw new SubscriptionPlansScriptError("--name: entre 1 y 80 caracteres.");
    const terms: PlanTerms = {
      amount: normalizeAmount(get("--amount")),
      currency: "ARS",
      frequency: parseInt10(get("--frequency"), "--frequency"),
      frequencyUnit: parseUnit(get("--unit"), "--unit"),
      trialLength: hasTrial ? parseInt10(get("--trial"), "--trial") : null,
      trialUnit: hasTrial ? parseUnit(get("--trial-unit"), "--trial-unit") : null,
      billingCycles: values.has("--cycles") ? parseInt10(get("--cycles"), "--cycles") : null,
    };
    const valid = validatePlanTerms(terms, mode);
    if (!valid.ok) throw new SubscriptionPlansScriptError(`Plan inválido: ${valid.error}.`);
    return { name, mode, code, planName, terms, isPublic: !flags.has("--private"), isDefault: flags.has("--default") };
  }
  if (name === "set-default" || name === "deactivate") return { name, mode, code };

  const tenantId = get("--tenant");
  if (!TENANT_ID.test(tenantId)) throw new SubscriptionPlansScriptError("--tenant inválido.");
  if (name === "revoke-offer") return { name, tenantId, mode, code };

  let expiresAt: Date | null = null;
  if (values.has("--expires")) {
    const raw = get("--expires");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(raw) || Number.isNaN(new Date(`${raw}T23:59:59-03:00`).getTime())) {
      throw new SubscriptionPlansScriptError("--expires: YYYY-MM-DD.");
    }
    expiresAt = new Date(`${raw}T23:59:59-03:00`); // fin del día en Argentina
  }
  const note = values.has("--note") ? get("--note").trim().slice(0, 500) || null : null;
  return { name: "offer", tenantId, mode, code, allowTrial: flags.has("--allow-trial"), expiresAt, note };
}

async function findPlan(prisma: PrismaClient, mode: BillingMode, code: string) {
  const plan = await prisma.subscriptionPlan.findUnique({ where: { mode_code: { mode, code } } });
  if (!plan) throw new SubscriptionPlansScriptError(`No existe el plan ${code} en ${mode}.`);
  return plan;
}

export async function run(prisma: PrismaClient, cmd: Command, out: (line: string) => void = console.log): Promise<void> {
  switch (cmd.name) {
    case "list": {
      const plans = await prisma.subscriptionPlan.findMany({
        where: cmd.mode ? { mode: cmd.mode } : {},
        orderBy: [{ mode: "asc" }, { isDefault: "desc" }, { code: "asc" }],
        include: { offers: { select: { tenantId: true, allowTrial: true, expiresAt: true } } },
      });
      for (const p of plans) {
        const trial = p.trialLength ? ` · prueba ${p.trialLength} ${p.trialUnit}` : "";
        const flags = [p.isDefault && "default", !p.isPublic && "privado", !p.active && "inactivo"].filter(Boolean).join(", ");
        out(`${p.mode} ${p.code} · ${p.name} · ${formatPlanPrice({ amount: p.amount.toFixed(2), currency: p.currency, frequency: p.frequency, frequencyUnit: p.frequencyUnit })}${trial}${flags ? ` [${flags}]` : ""}`);
        for (const o of p.offers) {
          out(`    oferta → ${o.tenantId}${o.allowTrial ? " (con prueba)" : ""}${o.expiresAt ? ` vence ${o.expiresAt.toISOString().slice(0, 10)}` : ""}`);
        }
      }
      if (plans.length === 0) out("Sin planes.");
      return;
    }
    case "create": {
      const existing = await prisma.subscriptionPlan.findUnique({ where: { mode_code: { mode: cmd.mode, code: cmd.code } } });
      if (existing) throw new SubscriptionPlansScriptError("Ese code ya existe: creá un plan nuevo con otro code (los planes no se editan).");
      await prisma.$transaction(async (tx) => {
        if (cmd.isDefault) await tx.subscriptionPlan.updateMany({ where: { mode: cmd.mode, isDefault: true }, data: { isDefault: false } });
        await tx.subscriptionPlan.create({
          data: {
            code: cmd.code,
            mode: cmd.mode,
            name: cmd.planName,
            amount: cmd.terms.amount,
            currency: cmd.terms.currency,
            frequency: cmd.terms.frequency,
            frequencyUnit: cmd.terms.frequencyUnit,
            trialLength: cmd.terms.trialLength,
            trialUnit: cmd.terms.trialUnit,
            billingCycles: cmd.terms.billingCycles,
            isPublic: cmd.isPublic,
            isDefault: cmd.isDefault,
          },
        });
      });
      out(`Plan ${cmd.code} creado en ${cmd.mode}.`);
      return;
    }
    case "set-default": {
      const plan = await findPlan(prisma, cmd.mode, cmd.code);
      if (!plan.active) throw new SubscriptionPlansScriptError("El plan está inactivo.");
      await prisma.$transaction([
        prisma.subscriptionPlan.updateMany({ where: { mode: cmd.mode, isDefault: true }, data: { isDefault: false } }),
        prisma.subscriptionPlan.update({ where: { id: plan.id }, data: { isDefault: true } }),
      ]);
      out(`Default de ${cmd.mode}: ${cmd.code}.`);
      return;
    }
    case "deactivate": {
      const plan = await findPlan(prisma, cmd.mode, cmd.code);
      await prisma.subscriptionPlan.update({ where: { id: plan.id }, data: { active: false, isDefault: false } });
      out(`Plan ${cmd.code} desactivado (las suscripciones existentes no cambian).`);
      return;
    }
    case "offer": {
      const plan = await findPlan(prisma, cmd.mode, cmd.code);
      const tenant = await prisma.tenant.findUnique({ where: { id: cmd.tenantId }, select: { id: true } });
      if (!tenant) throw new SubscriptionPlansScriptError("No existe ese consultorio.");
      await prisma.subscriptionPlanOffer.upsert({
        where: { tenantId_planId: { tenantId: cmd.tenantId, planId: plan.id } },
        create: { tenantId: cmd.tenantId, planId: plan.id, allowTrial: cmd.allowTrial, expiresAt: cmd.expiresAt, note: cmd.note },
        update: { allowTrial: cmd.allowTrial, expiresAt: cmd.expiresAt, note: cmd.note },
      });
      out(`Oferta de ${cmd.code} para ${cmd.tenantId} guardada.`);
      return;
    }
    case "revoke-offer": {
      const plan = await findPlan(prisma, cmd.mode, cmd.code);
      const offer = await prisma.subscriptionPlanOffer.findUnique({
        where: { tenantId_planId: { tenantId: cmd.tenantId, planId: plan.id } },
        select: { id: true, _count: { select: { subscriptions: true } } },
      });
      if (!offer) throw new SubscriptionPlansScriptError("No hay oferta para ese consultorio y plan.");
      if (offer._count.subscriptions === 0) {
        await prisma.subscriptionPlanOffer.delete({ where: { id: offer.id } });
        out("Oferta borrada.");
      } else {
        await prisma.subscriptionPlanOffer.update({ where: { id: offer.id }, data: { expiresAt: new Date() } });
        out("La oferta ya se usó: quedó vencida (no se borra).");
      }
      return;
    }
  }
}

async function main(): Promise<void> {
  let cmd: Command;
  try {
    cmd = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof SubscriptionPlansScriptError ? error.message : USAGE);
    process.exitCode = 1;
    return;
  }
  const prisma = new PrismaClient();
  try {
    await run(prisma, cmd);
  } catch (error) {
    console.error(error instanceof SubscriptionPlansScriptError ? error.message : "Error inesperado (sin detalle).");
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) void main();
