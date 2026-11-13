import "server-only";
import { revalidatePath } from "next/cache";
import { markTemplateReviewed } from "@nutri-bot/db/domain";

/**
 * HU-020 (T10): un cambio en una plantilla desde el panel. Si es un borrador importado sin revisar,
 * lo marca revisado (desde ahí `plans:import` no lo pisa) y revalida la lista y la plantilla.
 * Abrir la página no marca: solo las acciones que cambian algo llaman a esto.
 */
export async function touchTemplate(templateId: string): Promise<void> {
  await markTemplateReviewed(templateId);
  revalidatePath("/plantillas");
  revalidatePath(`/plantillas/${templateId}`);
}
