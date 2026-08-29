"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createService, setServiceActive, updateService } from "@/lib/services";

const schema = z.object({
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
  const { id, description, ...rest } = parsed.data;
  const payload = { ...rest, description: description || null };

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
