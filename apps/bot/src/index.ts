import "./env";
import { logger } from "./logger";
import { startWhatsAppSessions } from "./whatsapp-sessions";
import { receiveText, receiveMedia } from "./whatsapp-conversation";
import { getBotAiConfig } from "./ai/runtime";
import { runStartupJobs, startCron } from "./workers";

let stopSessions: (() => void) | undefined;

async function main(): Promise<void> {
  logger.info("Iniciando NutriBot (bot de WhatsApp)…");

  // HU-012: estado de la IA del bot (nunca la clave).
  const ai = getBotAiConfig();
  logger.info({ provider: ai.provider, model: ai.model, hasKey: ai.hasKey }, "IA del bot");

  stopSessions = startWhatsAppSessions(receiveText, receiveMedia);
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
    stopSessions?.();
    process.exit(0);
  });
}
