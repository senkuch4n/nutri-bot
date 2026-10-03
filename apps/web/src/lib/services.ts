import "server-only";
import { prisma, Prisma } from "@nutri-bot/db";
import type { ServiceReminder } from "@nutri-bot/core";

export function listServices(opts?: { activeOnly?: boolean }) {
  return prisma.service.findMany({
    where: opts?.activeOnly ? { active: true } : undefined,
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

export function createService(
  data: {
    name: string;
    description?: string | null;
    price: number;
    durationMin: number;
    color: string;
  } & DepositFields &
    PrepFields &
    ReasonFields &
    RemindersFields,
) {
  const { depositValue, reminders, ...rest } = data;
  return prisma.service.create({
    data: {
      ...rest,
      price: new Prisma.Decimal(data.price),
      depositValue: depositValue != null ? new Prisma.Decimal(depositValue) : null,
      reminders: remindersJson(reminders),
    },
  });
}

export function updateService(
  id: string,
  data: {
    name: string;
    description?: string | null;
    price: number;
    durationMin: number;
    color: string;
    active: boolean;
  } & DepositFields &
    PrepFields &
    ReasonFields &
    RemindersFields,
) {
  const { depositValue, reminders, ...rest } = data;
  return prisma.service.update({
    where: { id },
    data: {
      ...rest,
      price: new Prisma.Decimal(data.price),
      depositValue: depositValue != null ? new Prisma.Decimal(depositValue) : null,
      reminders: remindersJson(reminders),
    },
  });
}

export function setServiceActive(id: string, active: boolean) {
  return prisma.service.update({ where: { id }, data: { active } });
}
