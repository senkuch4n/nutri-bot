import type { TenantRef } from "@nutri-bot/db/domain/tenantScope";
import { resolveLegacySchedulingScope } from "@nutri-bot/db/domain/legacySchedulingScope";

/**
 * HU-025 (4.3, 7.2 estrategia 2): único punto donde el bot resuelve el consultorio de una
 * conversación. Hoy hay una sola instalación de WhatsApp, la del consultorio original, así que
 * devuelve el tenant legacy verificado (agenda `legacy-agenda` de Professional(1)). HU-027 lo
 * cambia por el tenant de la conexión que recibió el mensaje.
 *
 * Nunca sale del contenido del mensaje ni de la IA.
 */
export async function getConversationTenant(): Promise<TenantRef> {
  const { scope } = await resolveLegacySchedulingScope();
  return { tenantId: scope.tenantId };
}
