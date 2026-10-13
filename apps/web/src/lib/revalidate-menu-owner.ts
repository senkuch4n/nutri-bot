import "server-only";
import { revalidatePath } from "next/cache";
import { prisma } from "@nutri-bot/db";
import type { MealOwnerKind } from "@nutri-bot/db/domain";

// HU-018c: revalidación de las páginas de un plan o una plantilla después de cambiar sus comidas. La
// comparten las actions del editor semanal (018b) y las del buscador de recetas (018c).

export async function revalidateMenuOwner(kind: MealOwnerKind, ownerId: string): Promise<void> {
  if (kind === "template") {
    revalidatePath(`/plantillas/${ownerId}`);
    return;
  }
  const plan = await prisma.nutritionPlan.findUnique({ where: { id: ownerId }, select: { patientId: true } });
  if (!plan) return;
  revalidatePath(`/pacientes/${plan.patientId}`);
  revalidatePath(`/pacientes/${plan.patientId}/planes/${ownerId}`);
}
