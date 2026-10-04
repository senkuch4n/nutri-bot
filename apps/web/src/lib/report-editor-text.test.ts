import { describe, expect, it } from "vitest";
import { isEditedText, professionalIssueText, reportIssues, sendConfirmCopy } from "./report-editor-text";

describe("reportIssues", () => {
  const none = { stale: false, hasMissingData: false, licenseMissing: false, signatureMissing: false };

  it("sin problemas no hay filas (el bloque no se muestra)", () => {
    expect(reportIssues(none)).toEqual([]);
  });

  it("con los tres problemas, una fila por cada uno y en el orden de la HU", () => {
    const issues = reportIssues({ stale: true, hasMissingData: true, licenseMissing: true, signatureMissing: false });
    expect(issues.map((i) => i.key)).toEqual(["stale", "missingData", "professional"]);
    expect(issues[0]!.text).toBe("El estudio cambió después del último PDF");
    expect(issues[1]!.text).toBe("Faltan medidas en el estudio: el PDF va a decir «Sin dato»");
    expect(issues[2]!.text).toBe("Falta tu matrícula o tu firma");
  });

  it("matrícula y firma juntas son una sola fila, con el texto de la HU", () => {
    const issues = reportIssues({ ...none, licenseMissing: true, signatureMissing: true });
    expect(issues).toEqual([{ key: "professional", text: "Falta tu matrícula o tu firma" }]);
  });
});

describe("professionalIssueText", () => {
  it("un solo texto (HU §4.5) para matrícula, firma o ambas; null si no falta nada", () => {
    expect(professionalIssueText({ licenseMissing: false, signatureMissing: true })).toBe("Falta tu matrícula o tu firma");
    expect(professionalIssueText({ licenseMissing: true, signatureMissing: false })).toBe("Falta tu matrícula o tu firma");
    expect(professionalIssueText({ licenseMissing: false, signatureMissing: false })).toBeNull();
  });
});

describe("isEditedText", () => {
  it("marca solo los que difieren del borrador", () => {
    expect(isEditedText("Texto", "Texto")).toBe(false);
    expect(isEditedText("Texto editado", "Texto")).toBe(true);
    expect(isEditedText("", "Texto")).toBe(true);
  });
});

describe("sendConfirmCopy", () => {
  it("con número: nombre y teléfono con formato", () => {
    expect(
      sendConfirmCopy({ patientName: "Brenda Yebara", whatsappJid: "5493515552345@s.whatsapp.net", phone: "5493515552345" }),
    ).toEqual({
      title: "¿Enviar el informe a Brenda Yebara?",
      description: "Le llega por WhatsApp al +54 9 351 555-2345.",
      recipient: "+54 9 351 555-2345",
    });
  });

  it("@lid: sin número", () => {
    const copy = sendConfirmCopy({ patientName: "Ana", whatsappJid: "123456789012345@lid", phone: "123456789012345" });
    expect(copy.description).toBe("Le llega por WhatsApp.");
    expect(copy.recipient).toBe("Ana");
  });

  it("sin nombre: título genérico", () => {
    const copy = sendConfirmCopy({ patientName: "  ", whatsappJid: "5493515552345@s.whatsapp.net", phone: "5493515552345" });
    expect(copy.title).toBe("¿Enviar el informe por WhatsApp?");
  });
});
