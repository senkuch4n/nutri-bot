import { handleIncoming, handleIncomingMedia } from "./conversation";
import { runSerialByTenantAndJid } from "./jid-queue";
import { logger } from "./logger";
import type { WhatsAppConnection } from "./whatsapp";

export async function receiveText(jid: string, text: string, connection?: WhatsAppConnection): Promise<void> {
  if (!connection?.tenantId) {
    logger.warn("Mensaje de WhatsApp sin consultorio vinculado; se ignora.");
    return;
  }
  const { tenantId } = connection;
  await runSerialByTenantAndJid(tenantId, jid, () =>
    handleIncoming(jid, text, (reply) => connection.sendText(jid, reply), {
      typing: () => connection.sendTyping(jid),
    }, { tenantId }),
  );
}

export async function receiveMedia(jid: string, connection?: WhatsAppConnection): Promise<void> {
  if (!connection?.tenantId) {
    logger.warn("Adjunto de WhatsApp sin consultorio vinculado; se ignora.");
    return;
  }
  const { tenantId } = connection;
  await runSerialByTenantAndJid(tenantId, jid, () =>
    handleIncomingMedia(jid, (reply) => connection.sendText(jid, reply), {}, { tenantId }),
  );
}
