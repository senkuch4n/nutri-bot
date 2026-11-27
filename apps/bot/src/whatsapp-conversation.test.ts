import { expect, it, vi } from "vitest";
import { messages } from "@nutri-bot/core";

const db = vi.hoisted(() => ({
  read: vi.fn(), insert: vi.fn(), update: vi.fn(), patient: vi.fn(), professional: vi.fn(), legacy: vi.fn(),
}));
vi.mock("@nutri-bot/db", () => ({ prisma: {} }));
vi.mock("../../../packages/db/index", () => ({ prisma: { conversationState: {
  findUnique: db.read, createMany: db.insert, updateMany: db.update,
} } }));
vi.mock("@nutri-bot/db/domain", () => ({ findOrCreatePatientByJid: db.patient, getProfessional: db.legacy, getTenantProfessional: db.professional }));
vi.mock("./tenant", () => ({ getConversationTenant: db.legacy }));
vi.mock("./logger", () => ({ logger: { warn: vi.fn() } }));
vi.mock("./ai/runtime", () => ({ getBotAiRuntime: () => null }));

import { receiveText, receiveMedia } from "./whatsapp-conversation";

it("routes same-JID text and attachments through the receiving consultorio and never falls back", async () => {
  const jid = "5491100000000@s.whatsapp.net";
  const states = new Map([
    ["a", { step: "AWAIT_INQUIRY", context: { inquiryId: "only-a" }, updatedAt: new Date() }],
    ["b", { step: "BOOK_REASON", context: { serviceId: "only-b" }, updatedAt: new Date() }],
  ]);
  db.read.mockImplementation(async ({ where: { tenantId_patientJid: key } }) => {
    expect(key.patientJid).toBe(jid);
    return states.get(key.tenantId);
  });
  db.insert.mockResolvedValue({ count: 0 });
  db.update.mockImplementation(async ({ where, data }) => {
    expect(where.patientJid).toBe(jid);
    states.set(where.tenantId, { ...data, updatedAt: new Date() });
    return { count: 1 };
  });
  db.professional.mockResolvedValue({ botPaused: false, botAiEnabled: false });
  db.patient.mockResolvedValue({ id: "patient-a", name: "Paciente A" });
  const connection = (tenantId: string) => ({ tenantId, sendText: vi.fn(), sendTyping: vi.fn(), sendDocument: vi.fn() });
  const a = connection("a");
  const b = connection("b");

  await receiveMedia(jid, a);
  await receiveMedia(jid, b);
  await receiveText(jid, "salir", a);
  await receiveMedia(jid);
  await receiveText(jid, "salir");

  expect(db.professional.mock.calls).toEqual([["a"], ["b"], ["a"]]);
  expect(db.patient.mock.calls).toEqual([[{ tenantId: "a" }, jid]]);
  expect(db.legacy).not.toHaveBeenCalled();
  expect(a.sendText.mock.calls.map(([to]) => to)).toEqual([jid, jid]);
  expect(a.sendText.mock.calls[0]).toEqual([jid, messages.INQUIRY_TEXT_ONLY]);
  expect(b.sendText.mock.calls).toEqual([[jid, messages.BOOKING_REASON_TEXT_ONLY]]);
  expect(states.get("a")).toMatchObject({ step: "DORMANT", context: {} });
  expect(states.get("b")).toMatchObject({ step: "BOOK_REASON", context: { serviceId: "only-b" } });
  expect(db.update.mock.calls.map(([p]) => p.where.tenantId)).toEqual(["a", "b", "a"]);
});
