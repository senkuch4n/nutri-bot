import "server-only";
import { resolveBotAiEnv, type BotAiProviderName } from "@nutri-bot/core";

/**
 * HU-012: estado de la clave de la IA del bot, leyendo el mismo .env que el bot (P11).
 * No expone la clave: solo si está cargada, el nombre de la variable y el proveedor.
 */
export function getBotAiKeyStatus(): { hasKey: boolean; apiKeyEnvName: string; provider: BotAiProviderName } {
  const { hasKey, apiKeyEnvName, provider } = resolveBotAiEnv(process.env);
  return { hasKey, apiKeyEnvName, provider };
}
