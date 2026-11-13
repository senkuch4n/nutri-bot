// HU-023 (D10): cifrado de los tokens de Mercado Pago en reposo. AES-256-GCM con una clave propia
// (MERCADOPAGO_TOKEN_KEY), IV aleatorio de 12 bytes y AAD por campo (un ciphertext no se puede mover
// de columna). Server-only: no se exporta desde domain/index.ts; lo usa mercadopagoAccount.ts.
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

export class MercadoPagoConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MercadoPagoConfigError";
  }
}

export class SecretDecryptError extends Error {
  constructor(message = "No se pudo descifrar el secreto") {
    super(message);
    this.name = "SecretDecryptError";
  }
}

export const SECRET_AAD = {
  accessToken: "mercadopago:access_token",
  refreshToken: "mercadopago:refresh_token",
  codeVerifier: "mercadopago:code_verifier",
} as const;

const VERSION = "v1";
const IV_BYTES = 12;
const TAG_BYTES = 16;
const KEY_BYTES = 32;

/** Lee MERCADOPAGO_TOKEN_KEY: base64 de exactamente 32 bytes (openssl rand -base64 32).
 *  Falta o largo distinto → MercadoPagoConfigError("MERCADOPAGO_TOKEN_KEY inválida o ausente"). */
export function loadMercadoPagoTokenKey(env: Record<string, string | undefined> = process.env): Buffer {
  const raw = env.MERCADOPAGO_TOKEN_KEY?.trim();
  const key = raw && /^[A-Za-z0-9+/_-]+={0,2}$/.test(raw) ? Buffer.from(raw, "base64") : null;
  if (!key || key.length !== KEY_BYTES) {
    throw new MercadoPagoConfigError("MERCADOPAGO_TOKEN_KEY inválida o ausente");
  }
  return key;
}

/** AES-256-GCM, IV aleatorio de 12 bytes, AAD = `aad` (utf8). Salida "v1.<iv>.<tag>.<ct>" (base64url). */
export function sealSecret(plain: string, key: Buffer, aad: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, iv, { authTagLength: TAG_BYTES });
  cipher.setAAD(Buffer.from(aad, "utf8"));
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString("base64url"), tag.toString("base64url"), ct.toString("base64url")].join(".");
}

/** Inversa. Prefijo distinto de "v1", tag inválido, AAD o clave distintos → SecretDecryptError. */
export function openSecret(sealed: string, key: Buffer, aad: string): string {
  const parts = sealed.split(".");
  if (parts.length !== 4 || parts[0] !== VERSION) throw new SecretDecryptError();
  try {
    const iv = Buffer.from(parts[1]!, "base64url");
    const tag = Buffer.from(parts[2]!, "base64url");
    const ct = Buffer.from(parts[3]!, "base64url");
    if (iv.length !== IV_BYTES || tag.length !== TAG_BYTES) throw new SecretDecryptError();
    const decipher = createDecipheriv("aes-256-gcm", key, iv, { authTagLength: TAG_BYTES });
    decipher.setAAD(Buffer.from(aad, "utf8"));
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
  } catch {
    throw new SecretDecryptError();
  }
}
