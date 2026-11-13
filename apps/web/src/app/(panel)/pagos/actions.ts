"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { registerManualPayment } from "@nutri-bot/db/domain";

export type PaymentFormState = { ok: boolean; error?: string; kind?: "DEPOSIT" | "FULL"; amount?: number };

const manualPaymentSchema = z.object({
  appointmentId: z.string().min(1),
  kind: z.enum(["DEPOSIT", "FULL"]),
  amount: z.coerce.number().positive(),
});

/** HU-017b-1 (SDD 4.6): en éxito devuelve kind y amount (para el toast con monto) y revalida también
 *  el calendario ("Registrar pago" desde el panel del turno). Si el dominio falla, mensaje claro. */
export async function registerManualPaymentAction(
  _prev: PaymentFormState,
  formData: FormData,
): Promise<PaymentFormState> {
  const parsed = manualPaymentSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: "Datos inválidos" };
  try {
    await registerManualPayment(parsed.data.appointmentId, {
      kind: parsed.data.kind,
      amount: parsed.data.amount,
    });
  } catch {
    return { ok: false, error: "No se pudo registrar el pago. Probá de nuevo." };
  }
  revalidatePath("/pagos");
  revalidatePath("/");
  return { ok: true, kind: parsed.data.kind, amount: parsed.data.amount };
}
