import "server-only";
import { prisma, Prisma } from "@nutri-bot/db";

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

export function createService(
  data: {
    name: string;
    description?: string | null;
    price: number;
    durationMin: number;
    color: string;
  } & DepositFields &
    PrepFields,
) {
  const { depositValue, ...rest } = data;
  return prisma.service.create({
    data: {
      ...rest,
      price: new Prisma.Decimal(data.price),
      depositValue: depositValue != null ? new Prisma.Decimal(depositValue) : null,
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
    PrepFields,
) {
  const { depositValue, ...rest } = data;
  return prisma.service.update({
    where: { id },
    data: {
      ...rest,
      price: new Prisma.Decimal(data.price),
      depositValue: depositValue != null ? new Prisma.Decimal(depositValue) : null,
    },
  });
}

export function setServiceActive(id: string, active: boolean) {
  return prisma.service.update({ where: { id }, data: { active } });
}
