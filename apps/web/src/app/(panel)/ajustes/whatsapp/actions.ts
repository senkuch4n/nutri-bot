"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { prisma } from "@nutri-bot/db";
import { requireOwnerContext } from "@/lib/tenant-context";

const statusPath = "/ajustes/whatsapp";
const stopped = { sessionKey: null, qr: null, connected: false } as const;

export async function connectWhatsAppAction(): Promise<void> {
  const { tenantId } = await requireOwnerContext();
  const sessionKey = randomUUID();
  const inserted = await prisma.botStatus.createMany({
    data: { tenantId, sessionKey },
    skipDuplicates: true,
  });

  if (inserted.count === 0) {
    // A concurrent link (including legacy) wins without changing its key or observed state.
    await prisma.botStatus.updateMany({
      where: { tenantId, sessionKey: null },
      data: { ...stopped, sessionKey },
    });
  }

  revalidatePath(statusPath);
}

export async function disconnectWhatsAppAction(): Promise<void> {
  const { tenantId } = await requireOwnerContext();
  await prisma.botStatus.updateMany({
    where: { tenantId, OR: [{ sessionKey: { not: null } }, { qr: { not: null } }, { connected: true }] },
    data: stopped,
  });
  revalidatePath(statusPath);
}
