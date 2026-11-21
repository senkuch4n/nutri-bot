import "server-only";
import { prisma, Prisma } from "@nutri-bot/db";
import { resolveLegacySchedulingScope } from "@nutri-bot/db/domain/legacySchedulingScope";
import type { ServiceReminder } from "@nutri-bot/core";

export async function listServices(opts?: { activeOnly?: boolean }) {
  const { scope: { tenantId } } = await resolveLegacySchedulingScope();
  return prisma.service.findMany({
    where: { tenantId, ...(opts?.activeOnly ? { active: true } : {}) },
    orderBy: [{ active: "desc" }, { name: "asc" }],
  });
}

interface DepositFields {
  requiresDeposit: boolean;
  depositKind?: "FIXED" | "PERCENT" | null;
  depositValue?: number | null;
}

interface PrepFields {
  prepInstructions?: string | null;
  prepLeadHours?: number | null;
}

/** HU-013 (D4): el bot pide el motivo de consulta al reservar. */
interface ReasonFields {
  asksReason: boolean;
}

/** HU-014: lista ya validada con validateServiceReminders. undefined = no se toca (vale el default al crear). */
interface RemindersFields {
  reminders?: ServiceReminder[];
}

/** Literal plano asignable a Prisma.InputJsonValue; undefined se mantiene (no se toca la columna). */
function remindersJson(list: ServiceReminder[] | undefined) {
  return list?.map((r) => ({ amount: r.amount, unit: r.unit, asksConfirmation: r.asksConfirmation }));
}

type ServiceFields = {
  name: string;
  description?: string | null;
  price: number;
  durationMin: number;
  color: string;
} & DepositFields & PrepFields & ReasonFields & RemindersFields;

function serviceData(data: ServiceFields) {
  return {
    name: data.name,
    description: data.description,
    price: new Prisma.Decimal(data.price),
    durationMin: data.durationMin,
    color: data.color,
    requiresDeposit: data.requiresDeposit,
    depositKind: data.depositKind,
    depositValue: data.depositValue != null ? new Prisma.Decimal(data.depositValue) : null,
    prepInstructions: data.prepInstructions,
    prepLeadHours: data.prepLeadHours,
    asksReason: data.asksReason,
    reminders: remindersJson(data.reminders),
  };
}

export async function createService(data: ServiceFields) {
  const { scope: { tenantId } } = await resolveLegacySchedulingScope();
  return prisma.service.create({ data: { ...serviceData(data), tenantId } });
}

/** HU-017b-2 (Q17): si no viene active, no se toca. El form de edición no lo manda. */
export async function updateService(id: string, data: ServiceFields & { active?: boolean }) {
  const { scope: { tenantId } } = await resolveLegacySchedulingScope();
  return prisma.service.update({ where: { id, tenantId }, data: { ...serviceData(data), active: data.active } });
}

export async function setServiceActive(id: string, active: boolean) {
  const { scope: { tenantId } } = await resolveLegacySchedulingScope();
  return prisma.service.update({ where: { id, tenantId }, data: { active } });
}
