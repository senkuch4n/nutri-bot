import "server-only";
import { prisma, Prisma } from "@nutri-bot/db";

export function listServices(opts?: { activeOnly?: boolean }) {
  return prisma.service.findMany({
    where: opts?.activeOnly ? { active: true } : undefined,
    orderBy: [{ active: "desc" }, { name: "asc" }],
  });
}

export function createService(data: {
  name: string;
  description?: string | null;
  price: number;
  durationMin: number;
  color: string;
}) {
  return prisma.service.create({
    data: { ...data, price: new Prisma.Decimal(data.price) },
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
  },
) {
  return prisma.service.update({
    where: { id },
    data: { ...data, price: new Prisma.Decimal(data.price) },
  });
}

export function setServiceActive(id: string, active: boolean) {
  return prisma.service.update({ where: { id }, data: { active } });
}
