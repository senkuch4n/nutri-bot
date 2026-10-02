import makeWASocket, {
  DisconnectReason,
  fetchLatestBaileysVersion,
  normalizeMessageContent,
  useMultiFileAuthState,
  type WAMessage,
  type WASocket,
} from "@whiskeysockets/baileys";
import pino from "pino";
import qrcodeTerminal from "qrcode-terminal";
import QRCode from "qrcode";
import { prisma } from "@nutri-bot/db";
import { env } from "./env";
import { logger } from "./logger";

const silentLogger = pino({ level: "silent" });

let sock: WASocket | null = null;

async function setBotStatus(data: {
  connected: boolean;
  qr?: string | null;
  lastConnectedAt?: Date;
}) {
  await prisma.botStatus.upsert({
    where: { id: 1 },
    create: { id: 1, ...data },
    update: data,
  });
}

function extractText(m: WAMessage): string | null {
  // Desenvuelve mensajes temporales, "ver una vez", editados, etc.: si no, el texto no se
  // encuentra y el mensaje se ignora en silencio (pasó con un chat con mensajes temporales).
  const msg = normalizeMessageContent(m.message);
  if (!msg) return null;
  return (
    msg.conversation ??
    msg.extendedTextMessage?.text ??
    msg.imageMessage?.caption ??
    msg.videoMessage?.caption ??
    msg.buttonsResponseMessage?.selectedButtonId ??
    msg.listResponseMessage?.singleSelectReply?.selectedRowId ??
    null
  );
}

export type IncomingHandler = (jid: string, text: string) => Promise<void>;
/** HU-011 (D8): mensaje entrante sin texto (audio, foto sin epígrafe, sticker, documento…). */
export type IncomingMediaHandler = (jid: string) => Promise<void>;

/** Claves de contenido que cuentan como "medio sin texto" (D8). Lo demás se sigue ignorando. */
const MEDIA_KEYS = [
  "audioMessage",
  "imageMessage",
  "videoMessage",
  "documentMessage",
  "documentWithCaptionMessage",
  "stickerMessage",
  "ptvMessage",
];

export async function startWhatsApp(
  onMessage: IncomingHandler,
  onMedia?: IncomingMediaHandler,
): Promise<void> {
  const { state, saveCreds } = await useMultiFileAuthState(env.authDir);
  const { version } = await fetchLatestBaileysVersion();

  sock = makeWASocket({
    version,
    auth: state,
    logger: silentLogger,
    printQRInTerminal: false,
    markOnlineOnConnect: false,
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", async (u) => {
    const { connection, lastDisconnect, qr } = u;

    if (qr) {
      qrcodeTerminal.generate(qr, { small: true });
      const dataUrl = await QRCode.toDataURL(qr);
      await setBotStatus({ connected: false, qr: dataUrl });
      logger.info("QR generado. Escanealo desde WhatsApp o desde /ajustes/whatsapp.");
    }

    if (connection === "open") {
      await setBotStatus({ connected: true, qr: null, lastConnectedAt: new Date() });
      logger.info("WhatsApp conectado.");
    }

    if (connection === "close") {
      await setBotStatus({ connected: false });
      const code = (lastDisconnect?.error as { output?: { statusCode?: number } })?.output
        ?.statusCode;
      if (code === DisconnectReason.loggedOut) {
        logger.error(
          `Sesión cerrada (logout). Borrá la carpeta ${env.authDir} y volvé a escanear el QR.`,
        );
      } else {
        logger.warn(`Conexión cerrada (código ${code ?? "?"}). Reconectando en 3s…`);
        setTimeout(() => void startWhatsApp(onMessage, onMedia), 3000);
      }
    }
  });

  sock.ev.on("messages.upsert", async ({ messages, type }) => {
    // Diagnóstico (LOG_LEVEL=debug): cada evento que entrega WhatsApp, antes de cualquier filtro.
    logger.debug(
      { type, count: messages.length, from: messages.map((x) => x.key.remoteJid), fromMe: messages.map((x) => x.key.fromMe) },
      "Evento de mensajes recibido",
    );
    if (type !== "notify") return;
    for (const m of messages) {
      if (m.key.fromMe) continue;
      const jid = m.key.remoteJid ?? "";
      if (!jid || jid.endsWith("@g.us") || jid === "status@broadcast") continue;
      if (!m.message) {
        // Suele ser un mensaje que no se pudo descifrar (ver "Failed to decrypt" arriba).
        logger.warn({ jid, stubType: m.messageStubType ?? null }, "Mensaje entrante sin contenido: se ignora");
        continue;
      }
      const text = extractText(m);
      if (!text) {
        const kinds = Object.keys(normalizeMessageContent(m.message) ?? {});
        if (onMedia && kinds.some((k) => MEDIA_KEYS.includes(k))) {
          try {
            await onMedia(jid);
          } catch (err) {
            logger.error({ err, jid }, "Error procesando mensaje entrante sin texto");
          }
          continue;
        }
        logger.info({ jid, kinds }, "Mensaje entrante sin texto: se ignora");
        continue;
      }
      try {
        await onMessage(jid, text.trim());
      } catch (err) {
        logger.error({ err, jid }, "Error procesando mensaje entrante");
      }
    }
  });
}

/** Envía un texto por WhatsApp. Lanza si el socket no está listo. */
export async function sendText(jid: string, text: string): Promise<void> {
  if (!sock) throw new Error("WhatsApp no está conectado");
  await sock.presenceSubscribe(jid).catch(() => {});
  await sock.sendPresenceUpdate("composing", jid).catch(() => {});
  await new Promise((r) => setTimeout(r, 600));
  await sock.sendMessage(jid, { text });
  await sock.sendPresenceUpdate("paused", jid).catch(() => {});
}

export async function sendDocument(jid: string, buffer: Buffer, fileName: string): Promise<void> {
  if (!sock) throw new Error("WhatsApp no está conectado");
  await sock.sendMessage(jid, {
    document: buffer,
    fileName,
    mimetype: "application/pdf",
  });
}

export function isConnected(): boolean {
  return sock !== null;
}
