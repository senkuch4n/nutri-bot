import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  GOOGLE_SECRET_AAD,
  IntegrationConfigError,
  MercadoPagoConfigError,
  SECRET_AAD,
  SecretDecryptError,
  loadIntegrationTokenKey,
  loadMercadoPagoTokenKey,
  openSecret,
  sealSecret,
} from "./secretBox";

const KEY_B64 = randomBytes(32).toString("base64");
const key = Buffer.from(KEY_B64, "base64");
const TOKEN = "APP_USR-1234567890-abcdef";

describe("secretBox (HU-023)", () => {
  it("ida y vuelta con formato v1.<iv>.<tag>.<ct>", () => {
    const sealed = sealSecret(TOKEN, key, SECRET_AAD.accessToken);
    expect(sealed.split(".")).toHaveLength(4);
    expect(sealed.startsWith("v1.")).toBe(true);
    expect(sealed).not.toContain(TOKEN);
    expect(openSecret(sealed, key, SECRET_AAD.accessToken)).toBe(TOKEN);
  });

  it("dos seal del mismo texto dan ciphertexts distintos (IV aleatorio)", () => {
    expect(sealSecret(TOKEN, key, SECRET_AAD.accessToken)).not.toBe(sealSecret(TOKEN, key, SECRET_AAD.accessToken));
  });

  it("AAD distinta → SecretDecryptError (no se puede mover un ciphertext de columna)", () => {
    const sealed = sealSecret(TOKEN, key, SECRET_AAD.accessToken);
    expect(() => openSecret(sealed, key, SECRET_AAD.refreshToken)).toThrow(SecretDecryptError);
  });

  it("tag alterado → SecretDecryptError", () => {
    const [v, iv, tag, ct] = sealSecret(TOKEN, key, SECRET_AAD.accessToken).split(".");
    const badTag = Buffer.from(tag!, "base64url");
    badTag[0] = badTag[0]! ^ 0xff;
    expect(() => openSecret([v, iv, badTag.toString("base64url"), ct].join("."), key, SECRET_AAD.accessToken)).toThrow(
      SecretDecryptError,
    );
  });

  it("clave distinta → SecretDecryptError", () => {
    const sealed = sealSecret(TOKEN, key, SECRET_AAD.accessToken);
    expect(() => openSecret(sealed, randomBytes(32), SECRET_AAD.accessToken)).toThrow(SecretDecryptError);
  });

  it("prefijo distinto de v1 → SecretDecryptError", () => {
    const sealed = sealSecret(TOKEN, key, SECRET_AAD.accessToken);
    expect(() => openSecret(sealed.replace(/^v1\./, "v2."), key, SECRET_AAD.accessToken)).toThrow(SecretDecryptError);
    expect(() => openSecret("basura", key, SECRET_AAD.accessToken)).toThrow(SecretDecryptError);
  });

  it("loadMercadoPagoTokenKey acepta 32 bytes en base64", () => {
    expect(loadMercadoPagoTokenKey({ MERCADOPAGO_TOKEN_KEY: KEY_B64 }).equals(key)).toBe(true);
  });

  it("loadMercadoPagoTokenKey con 16 bytes o vacía → MercadoPagoConfigError sin el valor", () => {
    const short = randomBytes(16).toString("base64");
    let error: unknown;
    try {
      loadMercadoPagoTokenKey({ MERCADOPAGO_TOKEN_KEY: short });
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(MercadoPagoConfigError);
    expect((error as Error).message).toBe("MERCADOPAGO_TOKEN_KEY inválida o ausente");
    expect((error as Error).message).not.toContain(short);
    expect(() => loadMercadoPagoTokenKey({ MERCADOPAGO_TOKEN_KEY: "" })).toThrow(MercadoPagoConfigError);
    expect(() => loadMercadoPagoTokenKey({})).toThrow(MercadoPagoConfigError);
  });
});

describe("secretBox (HU-028b): INTEGRATION_TOKEN_KEY y AAD de Google por consultorio", () => {
  it("loadIntegrationTokenKey acepta una clave válida de 32 bytes", () => {
    expect(loadIntegrationTokenKey({ INTEGRATION_TOKEN_KEY: KEY_B64 }).equals(key)).toBe(true);
  });

  it.each([
    ["corta", randomBytes(16).toString("base64")],
    ["vacía", ""],
    ["ausente", undefined],
    ["no base64", "no es base64!!"],
  ])("clave %s → IntegrationConfigError con el mensaje exacto", (_name, value) => {
    let caught: unknown;
    try {
      loadIntegrationTokenKey({ INTEGRATION_TOKEN_KEY: value });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(IntegrationConfigError);
    expect((caught as Error).name).toBe("IntegrationConfigError");
    expect((caught as Error).message).toBe("INTEGRATION_TOKEN_KEY inválida o ausente");
  });

  it("no lee MERCADOPAGO_TOKEN_KEY ni MP lee INTEGRATION_TOKEN_KEY", () => {
    expect(() => loadIntegrationTokenKey({ MERCADOPAGO_TOKEN_KEY: KEY_B64 })).toThrow(IntegrationConfigError);
    expect(() => loadMercadoPagoTokenKey({ INTEGRATION_TOKEN_KEY: KEY_B64 })).toThrow(MercadoPagoConfigError);
    expect(() => loadMercadoPagoTokenKey({})).toThrow("MERCADOPAGO_TOKEN_KEY inválida o ausente");
  });

  it("AAD: lo sellado para el consultorio A no abre con B ni con el AAD de MP", () => {
    expect(GOOGLE_SECRET_AAD.refreshToken("A")).toBe("google:refresh_token:A");
    expect(GOOGLE_SECRET_AAD.codeVerifier("A")).toBe("google:code_verifier:A");
    const sealed = sealSecret("1//rt-google", key, GOOGLE_SECRET_AAD.refreshToken("A"));
    expect(openSecret(sealed, key, GOOGLE_SECRET_AAD.refreshToken("A"))).toBe("1//rt-google");
    expect(() => openSecret(sealed, key, GOOGLE_SECRET_AAD.refreshToken("B"))).toThrow(SecretDecryptError);
    expect(() => openSecret(sealed, key, GOOGLE_SECRET_AAD.codeVerifier("A"))).toThrow(SecretDecryptError);
    expect(() => openSecret(sealed, key, SECRET_AAD.refreshToken)).toThrow(SecretDecryptError);
  });
});
