"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@nutri-bot/db";
import { OUTBOX_TEXT, broadcastRecipients } from "@nutri-bot/core";

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
  // HU-017b-3 (D13): solo contactos persona (teléfonos y @lid), sin canales, grupos ni difusiones,
  // y sin repetidos. El mismo criterio y el mismo número que la lista de Pacientes.
  const recipients = broadcastRecipients(patients.map((p) => p.whatsappJid));
  if (recipients.length === 0) return { ok: false, error: OUTBOX_TEXT.noRecipients };

  try {
    await prisma.outboundMessage.createMany({
      data: recipients.map((toJid) => ({ toJid, body: parsed.data.body, kind: "AD_HOC" as const })),
    });
  } catch {
    return { ok: false, error: OUTBOX_TEXT.error };
  }

  revalidatePath("/avisos");
  return { ok: true, sent: recipients.length };
}

export async function retryMessageAction(id: string) {
  // Ronda 2 (017b-3): solo si sigue FAILED; una fila que ya se envió (o ya se reintentó) no se vuelve a mandar.
  await prisma.outboundMessage.updateMany({
    where: { id, status: "FAILED" },
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
