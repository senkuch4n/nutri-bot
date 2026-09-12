"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
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
    active: z.coerce.boolean().optional(),
    requiresDeposit: z.coerce.boolean().optional(),
    depositKind: z.enum(["FIXED", "PERCENT"]).optional(),
    depositValue: z.coerce.number().positive().optional(),
  })
  .refine((v) => !v.requiresDeposit || (v.depositKind && v.depositValue), {
    message: "Si el servicio requiere seña, indicá el tipo y el monto",
    path: ["depositValue"],
  });

export type ServiceFormState = { ok: boolean; error?: string };

export async function saveServiceAction(
  _prev: ServiceFormState,
  formData: FormData,
): Promise<ServiceFormState> {
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }
  const { id, description, requiresDeposit, depositKind, depositValue, ...rest } = parsed.data;
  const payload = {
    ...rest,
    description: description || null,
    requiresDeposit: requiresDeposit ?? false,
    depositKind: requiresDeposit ? (depositKind ?? null) : null,
    depositValue: requiresDeposit ? (depositValue ?? null) : null,
  };

  try {
    if (id) {
      await updateService(id, { ...payload, active: parsed.data.active ?? true });
    } else {
      await createService(payload);
    }
  } catch {
    return { ok: false, error: "No se pudo guardar el servicio" };
  }

  revalidatePath("/servicios");
  return { ok: true };
}

export async function toggleServiceAction(id: string, active: boolean) {
  await setServiceActive(id, active);
  revalidatePath("/servicios");
}
