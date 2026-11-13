// HU-012: proveedor de IA del bot según el .env (memoizado). Sin clave → null (la opción 5 no aparece).
import { resolveBotAiEnv, type BotAiEnvConfig } from "@nutri-bot/core";
import { createAnthropicProvider } from "./anthropic-provider";
import { createDeepSeekProvider } from "./deepseek-provider";
import type { BotAiProvider } from "./provider";

export type BotAiRuntime = { provider: BotAiProvider; config: BotAiEnvConfig };

let config: BotAiEnvConfig | undefined;
let runtime: BotAiRuntime | null | undefined;

/** Config (con o sin clave), para límites y log de arranque. Memoizado. */
export function getBotAiConfig(): BotAiEnvConfig {
  config ??= resolveBotAiEnv(process.env);
  return config;
}

/** Memoizado. Sin clave → null. Crea el provider según config.provider. */
export function getBotAiRuntime(): BotAiRuntime | null {
  if (runtime !== undefined) return runtime;
  const cfg = getBotAiConfig();
  if (!cfg.apiKey) {
    runtime = null;
    return runtime;
  }
  const provider =
    cfg.provider === "deepseek"
      ? createDeepSeekProvider({ apiKey: cfg.apiKey, model: cfg.model })
      : createAnthropicProvider({ apiKey: cfg.apiKey, model: cfg.model });
  runtime = { provider, config: cfg };
  return runtime;
}
