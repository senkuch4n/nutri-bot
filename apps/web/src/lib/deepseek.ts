import "server-only";
import OpenAI from "openai";

export const DEEPSEEK_MODEL = "deepseek-chat";
/** HU-028c (D9a): proveedor global de la IA del panel; se guarda en PanelAiUsage. */
export const DEEPSEEK_PROVIDER = "deepseek";

let client: OpenAI | null = null;

export function deepseekClient(): OpenAI {
  const apiKey = process.env.API_KEY_IA_DEEPSEEK;
  if (!apiKey) throw new Error("Falta configurar API_KEY_IA_DEEPSEEK.");
  client ??= new OpenAI({ apiKey, baseURL: "https://api.deepseek.com" });
  return client;
}
