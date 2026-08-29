import path from "node:path";

export const env = {
  authDir: path.resolve(process.env.WHATSAPP_AUTH_DIR ?? "./.whatsapp-auth"),
  pollIntervalMs: Number(process.env.BOT_POLL_INTERVAL_MS ?? 4000),
  professionalTz: process.env.PROFESSIONAL_TZ ?? "America/Argentina/Buenos_Aires",
};

if (!process.env.DATABASE_URL) {
  console.error("Falta DATABASE_URL. Copiá .env.example a .env y completá los valores.");
  process.exit(1);
}
