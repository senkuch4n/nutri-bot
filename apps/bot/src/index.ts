import "./env";
import { logger } from "./logger";
import { sendText, sendTyping, startWhatsApp } from "./whatsapp";
import { handleIncoming, handleIncomingMedia } from "./conversation";
import { getBotAiConfig } from "./ai/runtime";
import { runSerialByJid } from "./jid-queue";
import { runStartupJobs, startCron, startOutboxConsumer } from "./workers";

async function main(): Promise<void> {
  logger.info("Iniciando NutriBot (bot de WhatsApp)…");

  // HU-012: estado de la IA del bot (nunca la clave).
  const ai = getBotAiConfig();
  logger.info({ provider: ai.provider, model: ai.model, hasKey: ai.hasKey }, "IA del bot");

  // HU-012 (D14): los mensajes de un mismo contacto se procesan de a uno, en orden.
  await startWhatsApp(
    (jid, text) =>
      runSerialByJid(jid, () =>
        handleIncoming(jid, text, (t) => sendText(jid, t), { typing: () => sendTyping(jid) }),
      ),
    (jid) => runSerialByJid(jid, () => handleIncomingMedia(jid, (t) => sendText(jid, t))),
  );

  startOutboxConsumer();
  startCron();
  void runStartupJobs();

  logger.info("Bot en marcha. Esperando mensajes.");
}

main().catch((err) => {
  logger.error({ err }, "Fallo fatal al iniciar el bot");
  process.exit(1);
});

for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.on(sig, () => {
    logger.info(`Recibido ${sig}, cerrando…`);
    process.exit(0);
  });
}
