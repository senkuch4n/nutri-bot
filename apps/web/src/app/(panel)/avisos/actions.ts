"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@nutri-bot/db";

export async function retryMessageAction(id: string) {
  await prisma.outboundMessage.update({
    where: { id },
    data: { status: "PENDING", lastError: null },
  });
  revalidatePath("/avisos");
}

export async function retryAllFailedAction() {
  await prisma.outboundMessage.updateMany({
    where: { status: "FAILED" },
    data: { status: "PENDING", lastError: null },
  });
  revalidatePath("/avisos");
}
