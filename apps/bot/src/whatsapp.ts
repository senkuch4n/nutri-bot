import makeWASocket, {
  DisconnectReason,
  fetchLatestBaileysVersion,
  normalizeMessageContent,
  useMultiFileAuthState,
  type WAMessage,
  type WASocket,
} from "@whiskeysockets/baileys";
import { readdir, rm } from "node:fs/promises";
import path from "node:path";
import pino from "pino";
import qrcodeTerminal from "qrcode-terminal";
import QRCode from "qrcode";
import { prisma } from "@nutri-bot/db";
import { env } from "./env";
import { logger } from "./logger";
import { isIgnoredJid } from "./jid-filter";
import { getConversationTenant } from "./tenant";

const silentLogger = pino({ level: "silent" });

let sock: WASocket | null = null;

/** HU-025: la fila de estado (y el QR) es la del consultorio de esta instalación de WhatsApp. Se busca
 *  por tenantId (único); una fila de otro consultorio o sin dueño nunca se adopta: el alta choca.
 *  Panel y sidebar leen la fila por el tenant de la sesión. Registrar el estado nunca corta la conexión
 *  ni la reconexión: una falla (tenant no resoluble, fila ajena, base caída) se loguea solo con el código
 *  del error (sin datos personales ni el QR) y el flujo sigue. */
async function setBotStatus(data: {
  connected: boolean;
  qr?: string | null;
  lastConnectedAt?: Date;
}): Promise<void> {
  try {
    const { tenantId } = await getConversationTenant();
    await prisma.botStatus.upsert({
      where: { tenantId },
      create: { tenantId, ...data },
      update: data,
    });
  } catch (err) {
    logger.warn({ code: statusErrorCode(err), connected: data.connected }, "No se pudo registrar el estado del bot");
  }
}

/** Código del error sin el mensaje (puede traer datos de la fila o de la conexión). */
function statusErrorCode(err: unknown): string {
  if (err && typeof err === "object") {
    const { code, name } = err as { code?: unknown; name?: unknown };
    if (typeof code === "string" && code) return code;
    if (typeof name === "string" && name) return name;
  }
  return "unknown";
}

/** Vacía la carpeta de sesión de Baileys sin borrar la carpeta (en producción es un volumen montado). */
async function clearAuthDir(): Promise<void> {
  const entries = await readdir(env.authDir);
  await Promise.all(entries.map((e) => rm(path.join(env.authDir, e), { recursive: true, force: true })));
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
        // La sesión guardada ya no sirve: se borra y se arranca de cero, así el panel muestra un QR
        // nuevo en /ajustes/whatsapp sin entrar al servidor. Si no se puede borrar, no se reintenta
        // (volvería a dar logout en bucle).
        try {
          await clearAuthDir();
        } catch (err) {
          logger.error(
            { code: statusErrorCode(err) },
            "Sesión cerrada (logout) y no se pudo borrar la sesión: hay que borrarla a mano y reiniciar el bot.",
          );
          return;
        }
        logger.error("Sesión cerrada (logout): se borró la sesión y se genera un QR nuevo para volver a vincular.");
        setTimeout(() => void startWhatsApp(onMessage, onMedia), 3000);
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
      if (isIgnoredJid(jid)) continue;
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

/** HU-012: "escribiendo…" sin mandar nada. No lanza (si no hay socket, no hace nada). */
export async function sendTyping(jid: string): Promise<void> {
  if (!sock) return;
  await sock.presenceSubscribe(jid).catch(() => {});
  await sock.sendPresenceUpdate("composing", jid).catch(() => {});
}
