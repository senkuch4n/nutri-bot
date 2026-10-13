import { describe, expect, it } from "vitest";
import {
  MESSAGE_KIND_TEXT,
  OUTBOX_STATUS_TEXT,
  OUTBOX_TEXT,
  broadcastRecipients,
  outboxRecipientLabel,
  type MessageKindLike,
} from "./outbox-text";
import { HIDDEN_NUMBER_TEXT } from "./whatsapp-contact";

describe("MESSAGE_KIND_TEXT", () => {
  it("los 10 tipos, con el texto de la HU §4.6", () => {
    const expected: Record<MessageKindLike, string> = {
      CONFIRMATION: "Confirmación de turno",
      CONFIRMATION_REQUEST: "Pedido de confirmación",
      CANCELLATION: "Cancelación de turno",
      REMINDER: "Recordatorio de turno",
      PREP_INSTRUCTIONS: "Recomendaciones antes del turno",
      PAYMENT_LINK: "Link de pago de la seña",
      PLAN_PDF: "Plan de alimentación (PDF)",
      ANTHROPOMETRIC_REPORT_PDF: "Informe antropométrico (PDF)",
      PROFESSIONAL_ALERT: "Aviso para vos",
      AD_HOC: "Comunicado",
    };
    expect(MESSAGE_KIND_TEXT).toEqual(expected);
    expect(Object.keys(MESSAGE_KIND_TEXT)).toHaveLength(10);
    for (const text of Object.values(MESSAGE_KIND_TEXT)) expect(text).not.toMatch(/[A-Z]{2,}_/);
  });

  it("estados en palabras", () => {
    expect(OUTBOX_STATUS_TEXT).toEqual({ PENDING: "Por enviar", SENT: "Enviado", FAILED: "No se envió" });
  });
});

describe("outboxRecipientLabel", () => {
  const pro = "5493515550000@s.whatsapp.net";

  it("'Vos' si es el número de la profesional (aunque tenga nombre)", () => {
    expect(outboxRecipientLabel({ toJid: pro, patientName: "Daiana", professionalJid: pro })).toBe("Vos");
    expect(
      outboxRecipientLabel({ toJid: "5493515550000:7@s.whatsapp.net", patientName: null, professionalJid: pro }),
    ).toBe("Vos");
  });

  it("el nombre del paciente si lo hay", () => {
    expect(
      outboxRecipientLabel({ toJid: "5493510017101@s.whatsapp.net", patientName: "Brenda Yebara", professionalJid: pro }),
    ).toBe("Brenda Yebara");
  });

  it("sin nombre: el teléfono con formato", () => {
    expect(
      outboxRecipientLabel({ toJid: "5491123456789@s.whatsapp.net", patientName: null, professionalJid: pro }),
    ).toBe("+54 9 11 2345-6789");
    expect(outboxRecipientLabel({ toJid: "5491123456789@s.whatsapp.net", patientName: "  ", professionalJid: null })).toBe(
      "+54 9 11 2345-6789",
    );
  });

  it("@lid sin nombre: el número no se ve", () => {
    expect(outboxRecipientLabel({ toJid: "123456789012345@lid", patientName: null, professionalJid: pro })).toBe(
      HIDDEN_NUMBER_TEXT,
    );
  });

  it("sin professionalJid nunca dice 'Vos'", () => {
    expect(outboxRecipientLabel({ toJid: pro, patientName: null, professionalJid: null })).toBe("+54 9 351 555-0000");
  });
});

describe("broadcastRecipients", () => {
  it("descarta canales, grupos y difusiones, y deduplica conservando el orden", () => {
    const jids = [
      "5493510000001@s.whatsapp.net",
      "120363000000000000@newsletter",
      "123456@lid",
      "1203630000-1600000000@g.us",
      "status@broadcast",
      "5493510000001@s.whatsapp.net",
      "5493510000002@c.us",
      "123456@LID",
    ];
    expect(broadcastRecipients(jids)).toEqual([
      "5493510000001@s.whatsapp.net",
      "123456@lid",
      "5493510000002@c.us",
    ]);
  });

  it("vacío → vacío", () => {
    expect(broadcastRecipients([])).toEqual([]);
    expect(broadcastRecipients(["x@newsletter"])).toEqual([]);
  });
});

describe("OUTBOX_TEXT", () => {
  it("textos del comunicado con la cantidad", () => {
    expect(OUTBOX_TEXT.reach(12)).toBe("Le llega a 12 pacientes por WhatsApp");
    expect(OUTBOX_TEXT.send(12)).toBe("Enviar a 12 pacientes");
    expect(OUTBOX_TEXT.scheduled(12)).toBe("Comunicado listo para enviar a 12 pacientes");
    expect(OUTBOX_TEXT.committed(12)).toBe("Comunicado en camino a 12 pacientes");
    expect(OUTBOX_TEXT.committed(1)).toBe("Comunicado en camino a 1 paciente");
    expect(OUTBOX_TEXT.retryAll(2)).toBe("Reintentar los 2");
    expect(OUTBOX_TEXT.undone).toBe("Listo, no se mandó");
    expect(OUTBOX_TEXT.review).toBe("Revisar y enviar");
    expect(OUTBOX_TEXT.backToEdit).toBe("Volver a editar");
    expect(OUTBOX_TEXT.retryDescription).toBe("Se vuelven a mandar por WhatsApp.");
  });
});
