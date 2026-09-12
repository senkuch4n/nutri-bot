"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { registerManualPayment } from "@nutri-bot/db/domain";

export type PaymentFormState = { ok: boolean; error?: string };

const manualPaymentSchema = z.object({
  appointmentId: z.string().min(1),
  kind: z.enum(["DEPOSIT", "FULL"]),
  amount: z.coerce.number().positive(),
});

export async function registerManualPaymentAction(
  _prev: PaymentFormState,
  formData: FormData,
): Promise<PaymentFormState> {
  const parsed = manualPaymentSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: "Datos inválidos" };
  await registerManualPayment(parsed.data.appointmentId, {
    kind: parsed.data.kind,
    amount: parsed.data.amount,
  });
  revalidatePath("/pagos");
  return { ok: true };
}
