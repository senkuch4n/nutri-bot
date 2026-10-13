import { describe, expect, it } from "vitest";
import { HIDDEN_NUMBER_TEXT, classifyWhatsappJid, isPersonJid, whatsappChatUrl } from "./whatsapp-contact";

describe("classifyWhatsappJid", () => {
  it.each([
    ["5493515552345@s.whatsapp.net", "phone"],
    ["5493515552345@c.us", "phone"],
    ["93127792677049@lid", "hidden"],
    ["93127792677049@LID", "hidden"],
    ["120363000000000000@newsletter", "not_person"],
    ["5493515552345-1600000000@g.us", "not_person"],
    ["status@broadcast", "not_person"],
    ["123@broadcast", "not_person"],
    ["5493515552345", "hidden"],
    ["x@desconocido", "hidden"],
    ["5493515552345@S.WHATSAPP.NET", "phone"],
  ] as const)("%s → %s", (jid, kind) => {
    expect(classifyWhatsappJid(jid)).toBe(kind);
  });
});

describe("isPersonJid", () => {
  it("es falso solo para grupos, canales y difusiones", () => {
    expect(isPersonJid("5493515552345@s.whatsapp.net")).toBe(true);
    expect(isPersonJid("5493515552345@c.us")).toBe(true);
    expect(isPersonJid("93127792677049@lid")).toBe(true);
    expect(isPersonJid("x@desconocido")).toBe(true);
    expect(isPersonJid("5493515552345")).toBe(true);
    expect(isPersonJid("120363000000000000@newsletter")).toBe(false);
    expect(isPersonJid("5493515552345-1600000000@g.us")).toBe(false);
    expect(isPersonJid("status@broadcast")).toBe(false);
    expect(isPersonJid("123@broadcast")).toBe(false);
  });
});

describe("whatsappChatUrl", () => {
  it("arma el enlace con los dígitos del teléfono para un JID con número", () => {
    expect(whatsappChatUrl({ whatsappJid: "5493515552345@s.whatsapp.net", phone: "5493515552345" })).toBe(
      "https://wa.me/5493515552345",
    );
    expect(whatsappChatUrl({ whatsappJid: "5493515552345@s.whatsapp.net", phone: "+54 9 351 555-2345" })).toBe(
      "https://wa.me/5493515552345",
    );
  });
  it("devuelve null para @lid, para no personas y sin dígitos", () => {
    expect(whatsappChatUrl({ whatsappJid: "93127792677049@lid", phone: "93127792677049" })).toBeNull();
    expect(whatsappChatUrl({ whatsappJid: "120363000000000000@newsletter", phone: "120363000000000000" })).toBeNull();
    expect(whatsappChatUrl({ whatsappJid: "5493515552345@s.whatsapp.net", phone: "" })).toBeNull();
  });
});

it("HIDDEN_NUMBER_TEXT es el texto exacto", () => {
  expect(HIDDEN_NUMBER_TEXT).toBe("WhatsApp no muestra el número");
});
