"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { SERVICE_REMINDERS_TEXT, validateServiceReminders, type ServiceReminder, type ServiceReminderError } from "@nutri-bot/core";
import { createService, setServiceActive, updateService } from "@/lib/services";

const schema = z
  .object({
    id: z.string().optional(),
    name: z.string().trim().min(2, "El nombre es muy corto"),
    description: z.string().trim().max(500).optional().or(z.literal("")),
    price: z.coerce.number().nonnegative("El precio no puede ser negativo"),
    durationMin: z.coerce.number().int().positive("La duración debe ser mayor a 0"),
    color: z
      .string()
      .regex(/^#[0-9a-fA-F]{6}$/, "Color inválido")
      .default("#2563eb"),
    // HU-017b-2 (Q17): `active` ya no viene del form (lo cambia solo el switch de la tarjeta), así guardar
    // un servicio pausado no lo reactiva. requiresDeposit llega como "0"/"1" del switch: no
    // z.coerce.boolean(), que con "0" o "false" da true.
    requiresDeposit: z.enum(["0", "1"]).optional(),
    depositKind: z.enum(["FIXED", "PERCENT"]).optional(),
    depositValue: z.coerce.number().positive().optional(),
    prepInstructions: z.string().trim().max(1000).optional().or(z.literal("")),
    prepLeadHours: z.coerce.number().int().min(1).max(168).optional(),
    // HU-013: "0"/"1" del input oculto del switch. No z.coerce.boolean(): con "0" da true.
    asksReason: z.enum(["0", "1"]).optional(),
    // HU-014: JSON del editor de recordatorios. Ausente (cliente viejo) → no se toca.
    reminders: z.string().optional(),
  })
  .refine((v) => v.requiresDeposit !== "1" || (v.depositKind && v.depositValue), {
    message: "Si el servicio requiere seña, indicá el tipo y el monto",
    path: ["depositValue"],
  });

export type ServiceFormState = { ok: boolean; error?: string; reminderErrors?: ServiceReminderError[] };

export async function saveServiceAction(
  _prev: ServiceFormState,
  formData: FormData,
): Promise<ServiceFormState> {
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }
  const {
    id,
    description,
    requiresDeposit: requiresDepositRaw,
    depositKind,
    depositValue,
    prepInstructions,
    prepLeadHours,
    asksReason,
    reminders: remindersRaw,
    ...rest
  } = parsed.data;

  // HU-014: validación de la lista de recordatorios (la misma regla que el editor).
  let reminders: ServiceReminder[] | undefined;
  if (remindersRaw !== undefined) {
    let json: unknown;
    try {
      json = JSON.parse(remindersRaw);
    } catch {
      return { ok: false, error: SERVICE_REMINDERS_TEXT.invalid };
    }
    const r = validateServiceReminders(json);
    if (!r.ok) {
      return { ok: false, error: r.errors[0]?.message ?? SERVICE_REMINDERS_TEXT.invalid, reminderErrors: r.errors };
    }
    reminders = r.reminders;
  }
  const requiresDeposit = requiresDepositRaw === "1";
  const payload = {
    ...rest,
    description: description || null,
    requiresDeposit,
    depositKind: requiresDeposit ? (depositKind ?? null) : null,
    depositValue: requiresDeposit ? (depositValue ?? null) : null,
    prepInstructions: prepInstructions || null,
    prepLeadHours: prepInstructions ? (prepLeadHours ?? null) : null,
    // HU-013 (D4): ausente → true (default).
    asksReason: asksReason !== "0",
    reminders,
  };

  try {
    if (id) {
      // Sin `active`: en edición no se toca (Q17).
      await updateService(id, payload);
    } else {
      await createService(payload);
    }
  } catch {
    return { ok: false, error: "No se pudo guardar el servicio" };
  }

  revalidatePath("/servicios");
  return { ok: true };
}

/** Switch "Lo ofrece el bot" de la tarjeta. "Deshacer" llama a la misma action con `true`. */
export async function toggleServiceAction(id: string, active: boolean): Promise<{ ok: boolean; error?: string }> {
  try {
    await setServiceActive(id, active);
  } catch {
    return { ok: false, error: "No se pudo cambiar. Probá de nuevo." };
  }
  revalidatePath("/servicios");
  return { ok: true };
}
