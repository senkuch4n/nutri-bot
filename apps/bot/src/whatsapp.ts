import makeWASocket, {
  DisconnectReason,
  fetchLatestBaileysVersion,
  normalizeMessageContent,
  useMultiFileAuthState,
  type ConnectionState,
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
async function setBotStatus(tenant: { tenantId: string } | undefined, data: {
  connected: boolean;
  qr?: string | null;
  lastConnectedAt?: Date;
}): Promise<void> {
  try {
    const { tenantId } = tenant ?? await getConversationTenant();
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
async function clearAuthDir(authDir: string): Promise<void> {
  const entries = await readdir(authDir);
  await Promise.all(entries.map((e) => rm(path.join(authDir, e), { recursive: true, force: true })));
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

export type WhatsAppConnection = {
  readonly tenantId: string;
  sendText: typeof sendText;
  sendDocument: typeof sendDocument;
  sendTyping: typeof sendTyping;
};

export type IncomingHandler = (jid: string, text: string, connection?: WhatsAppConnection) => Promise<void>;
/** HU-011 (D8): mensaje entrante sin texto (audio, foto sin epígrafe, sticker, documento…). */
export type IncomingMediaHandler = (jid: string, connection?: WhatsAppConnection) => Promise<void>;

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

export type ManagedWhatsApp = {
  sessionKey: string;
  signal: AbortSignal;
  isDesired: () => Promise<boolean>;
  validateAuthDir?: () => Promise<void>;
  onOpen: (connection: WhatsAppConnection) => void;
  onClose: () => void;
};

export async function startWhatsApp(
  onMessage: IncomingHandler,
  onMedia?: IncomingMediaHandler,
  tenant?: { tenantId: string; authDir?: string },
  managed?: ManagedWhatsApp,
): Promise<WhatsAppConnection | undefined> {
  const statusTenant = tenant && { tenantId: tenant.tenantId };
  // Provisioning must supply a distinct, owned directory for every scoped session.
  const explicitAuthDir = tenant?.authDir;
  if (explicitAuthDir !== undefined && !explicitAuthDir.trim()) {
    throw new Error("El directorio de sesión de WhatsApp no puede estar vacío");
  }
  const scoped = explicitAuthDir !== undefined;
  const authDir = explicitAuthDir === undefined ? env.authDir : path.resolve(explicitAuthDir);
  if (managed && !statusTenant) throw new Error("La sesión administrada requiere un consultorio");
  let reconnect: ReturnType<typeof setTimeout> | undefined;
  let invalidate: (() => void) | undefined;
  let active: WASocket | null = null;
  const binding: WhatsAppConnection | undefined = statusTenant && {
    tenantId: statusTenant.tenantId,
    sendText: (jid, text) => sendTextOn(() => active, jid, text),
    sendDocument: (jid, buffer, fileName) => sendDocumentOn(active, jid, buffer, fileName),
    sendTyping: (jid) => sendTypingOn(active, jid),
  };
  function stop() {
    clearTimeout(reconnect);
    const socket = active;
    invalidate?.();
    try {
      socket?.end(undefined);
    } catch (err) {
      logger.warn({ code: statusErrorCode(err) }, "No se pudo cerrar el socket de WhatsApp");
    }
  }

  managed?.signal.addEventListener("abort", stop, { once: true });
  try {
    await connect();
  } catch (err) {
    managed?.signal.removeEventListener("abort", stop);
    stop();
    throw err;
  }
  return binding;

  async function updateStatus(data: { connected: boolean; qr?: string | null; lastConnectedAt?: Date }) {
    if (!managed || !statusTenant) return setBotStatus(statusTenant, data).then(() => true);
    if (managed.signal.aborted) return false;
    try {
      const result = await prisma.botStatus.updateMany({
        where: { tenantId: statusTenant.tenantId, sessionKey: managed.sessionKey },
        data,
      });
      return result.count === 1;
    } catch (err) {
      logger.warn({ code: statusErrorCode(err), connected: data.connected }, "No se pudo registrar el estado del bot");
      // A transport still checks durable intent before delivery.
      return true;
    }
  }

  function scheduleReconnect() {
    if (managed?.signal.aborted) return;
    reconnect = setTimeout(() => {
      void connect().catch((err: unknown) => {
        logger.error({ code: statusErrorCode(err) }, "No se pudo reconectar WhatsApp");
        if (managed) scheduleReconnect();
      });
    }, 3000);
  }

  async function connect(): Promise<void> {
    if (managed) {
      if (managed.signal.aborted || !await managed.isDesired()) return;
      await managed.validateAuthDir?.();
      if (managed.signal.aborted) return;
    }
    const { state, saveCreds } = await useMultiFileAuthState(authDir);
    if (managed?.signal.aborted) return;
    const { version } = await fetchLatestBaileysVersion();
    if (managed && (!await managed.isDesired() || managed.signal.aborted)) return;
    let closed = false;
    let authWrites = Promise.resolve();
    let updates = Promise.resolve();

    function writeAuth(write: () => void | Promise<void>): Promise<void> {
      if (closed) return Promise.resolve();
      const writeDone = authWrites.then(() => {
        if (!managed?.signal.aborted) return write();
      });
      authWrites = writeDone.catch((err: unknown) => {
        logger.warn({ code: statusErrorCode(err) }, "No se pudo guardar la sesión de WhatsApp");
      });
      return writeDone;
    }

    const socket = makeWASocket({
      version,
      auth: { ...state, keys: { ...state.keys, set: (data) => writeAuth(() => state.keys.set(data)) } },
      logger: silentLogger,
      printQRInTerminal: false,
      markOnlineOnConnect: false,
    });

    let opened = false;
    function closeBinding() {
      if (closed) return;
      closed = true;
      active = null;
      if (sock === socket) sock = null;
      if (opened) managed?.onClose();
    }

    const socketBinding: WhatsAppConnection | undefined = managed && statusTenant ? {
      tenantId: statusTenant.tenantId,
      sendText: (jid, text) => sendTextOn(() => closed || !opened ? null : socket, jid, text, assertDesired),
      sendDocument: async (jid, buffer, fileName) => {
        await assertDesired();
        return sendDocumentOn(closed || !opened ? null : socket, jid, buffer, fileName);
      },
      sendTyping: async (jid) => {
        await assertDesired();
        return sendTypingOn(closed || !opened ? null : socket, jid);
      },
    } : binding;

    async function assertDesired() {
      if (!managed) return;
      const desired = !closed && await managed.isDesired().catch(() => false);
      if (!desired || closed) throw new Error("WhatsApp no está conectado");
    }

    invalidate = closeBinding;
    active = socket;
    if (!statusTenant) sock = socket;
    socket.ev.on("creds.update", () => {
      void writeAuth(saveCreds); // The queue handles failures; Baileys does not await this listener.
      return authWrites;
    });

    socket.ev.on("connection.update", (u) => {
      if (closed) return;
      if (u.connection === "close") {
        // Invalidate immediately, even if a previous QR is still being encoded or persisted.
        closeBinding();
      }
      updates = updates.then(() => handleUpdate(u)).catch((err: unknown) => {
        logger.warn({ code: statusErrorCode(err) }, "No se pudo procesar el estado de WhatsApp");
      });
      return updates;
    });

    async function handleUpdate({ connection, lastDisconnect, qr }: Partial<ConnectionState>): Promise<void> {
      if (managed?.signal.aborted) return;
      if (connection === "close") {
        const current = await updateStatus(scoped || managed ? { connected: false, qr: null } : { connected: false });
        await authWrites;
        if (!current || managed?.signal.aborted) return;
        const code = (lastDisconnect?.error as { output?: { statusCode?: number } })?.output
          ?.statusCode;
        if (code === DisconnectReason.loggedOut) {
          // La sesión guardada ya no sirve: se borra y se arranca de cero, así el panel muestra un QR
          // nuevo en /ajustes/whatsapp sin entrar al servidor. Si no se puede borrar, no se reintenta
          // (volvería a dar logout en bucle).
          try {
            if (managed) {
              if (!await managed.isDesired()) return;
              await managed.validateAuthDir?.();
              if (managed.signal.aborted) return;
            }
            await clearAuthDir(authDir);
          } catch (err) {
            logger.error(
              { code: statusErrorCode(err) },
              "Sesión cerrada (logout) y no se pudo borrar la sesión: hay que borrarla a mano y reiniciar el bot.",
            );
            return;
          }
          logger.error("Sesión cerrada (logout): se borró la sesión y se genera un QR nuevo para volver a vincular.");
        } else {
          logger.warn(`Conexión cerrada (código ${code ?? "?"}). Reconectando en 3s…`);
        }
        // Only the first close per socket reaches here, so it owns the only reconnect timer.
        scheduleReconnect();
        return;
      }

      if (closed) return;
      if (qr) {
        if (!scoped && !managed) qrcodeTerminal.generate(qr, { small: true });
        const dataUrl = await QRCode.toDataURL(qr);
        if (closed) return;
        const current = await updateStatus({ connected: false, qr: dataUrl });
        if (!scoped && !closed && current) {
          if (managed) {
            if (!await managed.isDesired() || closed) return;
            qrcodeTerminal.generate(qr, { small: true });
          }
          logger.info("QR generado. Escanealo desde WhatsApp o desde /ajustes/whatsapp.");
        }
      }

      if (!closed && connection === "open") {
        const current = await updateStatus({ connected: true, qr: null, lastConnectedAt: new Date() });
        if (closed || !current) return;
        if (managed && !opened && socketBinding) {
          opened = true;
          managed.onOpen(socketBinding);
        }
        logger.info("WhatsApp conectado.");
      }
    }

    socket.ev.on("messages.upsert", async ({ messages, type }) => {
      if (closed) return;
      // Diagnóstico (LOG_LEVEL=debug): cada evento que entrega WhatsApp, antes de cualquier filtro.
      logger.debug(
        { type, count: messages.length, from: messages.map((x) => x.key.remoteJid), fromMe: messages.map((x) => x.key.fromMe) },
        "Evento de mensajes recibido",
      );
      if (type !== "notify") return;
      for (const m of messages) {
        if (closed) return;
        if (m.key.fromMe) continue;
        const jid = m.key.remoteJid ?? "";
        if (isIgnoredJid(jid)) continue;
        if (!m.message) {
          // Suele ser un mensaje que no se pudo descifrar (ver "Failed to decrypt" arriba).
          logger.warn({ jid, stubType: m.messageStubType ?? null }, "Mensaje entrante sin contenido: se ignora");
          continue;
        }
        if (managed) {
          if (!opened) return;
          try { await assertDesired(); } catch { return; }
        }
        const text = extractText(m);
        if (!text) {
          const kinds = Object.keys(normalizeMessageContent(m.message) ?? {});
          if (onMedia && kinds.some((k) => MEDIA_KEYS.includes(k))) {
            try {
              await onMedia(jid, socketBinding);
            } catch (err) {
              logger.error({ err, jid }, "Error procesando mensaje entrante sin texto");
            }
            continue;
          }
          logger.info({ jid, kinds }, "Mensaje entrante sin texto: se ignora");
          continue;
        }
        try {
          await onMessage(jid, text.trim(), socketBinding);
        } catch (err) {
          logger.error({ err, jid }, "Error procesando mensaje entrante");
        }
      }
    });
  }
}

/** Envía un texto por WhatsApp. Lanza si el socket no está listo. */
export async function sendText(jid: string, text: string): Promise<void> {
  await sendTextOn(() => sock, jid, text);
}

async function sendTextOn(getSocket: () => WASocket | null, jid: string, text: string, verify?: () => Promise<void>): Promise<void> {
  if (verify) await verify();
  const sock = getSocket();
  if (!sock) throw new Error("WhatsApp no está conectado");
  await sock.presenceSubscribe(jid).catch(() => {});
  await sock.sendPresenceUpdate("composing", jid).catch(() => {});
  await new Promise((r) => setTimeout(r, 600));
  if (verify) await verify();
  if (getSocket() !== sock) throw new Error("WhatsApp no está conectado");
  await sock.sendMessage(jid, { text });
  await sock.sendPresenceUpdate("paused", jid).catch(() => {});
}

export async function sendDocument(jid: string, buffer: Buffer, fileName: string): Promise<void> {
  await sendDocumentOn(sock, jid, buffer, fileName);
}

async function sendDocumentOn(sock: WASocket | null, jid: string, buffer: Buffer, fileName: string): Promise<void> {
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
  await sendTypingOn(sock, jid);
}

async function sendTypingOn(sock: WASocket | null, jid: string): Promise<void> {
  if (!sock) return;
  await sock.presenceSubscribe(jid).catch(() => {});
  await sock.sendPresenceUpdate("composing", jid).catch(() => {});
}
