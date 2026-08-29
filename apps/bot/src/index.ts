import "./env";
import { logger } from "./logger";
import { sendText, startWhatsApp } from "./whatsapp";
import { handleIncoming } from "./conversation";
import { runStartupJobs, startCron, startOutboxConsumer } from "./workers";

async function main(): Promise<void> {
  logger.info("Iniciando NutriBot (bot de WhatsApp)…");

  await startWhatsApp((jid, text) => handleIncoming(jid, text, (t) => sendText(jid, t)));

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
