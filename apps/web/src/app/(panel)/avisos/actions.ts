"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@nutri-bot/db";

export type BroadcastState = { ok: boolean; error?: string; sent?: number };

const broadcastSchema = z.object({ body: z.string().trim().min(3, "Escribí un mensaje").max(1000) });

export async function broadcastMessageAction(
  _prev: BroadcastState,
  formData: FormData,
): Promise<BroadcastState> {
  const parsed = broadcastSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }

  const patients = await prisma.patient.findMany({ select: { whatsappJid: true } });
  if (patients.length === 0) return { ok: false, error: "Todavía no hay pacientes cargados" };

  await prisma.outboundMessage.createMany({
    data: patients.map((p) => ({ toJid: p.whatsappJid, body: parsed.data.body, kind: "AD_HOC" as const })),
  });

  revalidatePath("/avisos");
  return { ok: true, sent: patients.length };
}

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
