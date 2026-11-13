import { describe, expect, it } from "vitest";
import { isIgnoredJid } from "./jid-filter";

describe("isIgnoredJid", () => {
  it("ignora grupos, estados, difusiones y canales", () => {
    expect(isIgnoredJid("120363025246125486@g.us")).toBe(true);
    expect(isIgnoredJid("status@broadcast")).toBe(true);
    expect(isIgnoredJid("1234567890@broadcast")).toBe(true);
    expect(isIgnoredJid("120363419876543210@newsletter")).toBe(true);
    expect(isIgnoredJid("")).toBe(true);
  });

  it("atiende chats de personas, con número o con @lid", () => {
    expect(isIgnoredJid("5493515552345@s.whatsapp.net")).toBe(false);
    expect(isIgnoredJid("93127792677049@lid")).toBe(false);
  });
});
