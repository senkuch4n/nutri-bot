import { describe, expect, it } from "vitest";
import {
  PATIENT_DIRECTORY_TEXT,
  buildPatientDirectory,
  matchesPatientQuery,
  patientCountLabel,
  type PatientDirectoryInput,
} from "./patient-directory";

const TZ = "America/Argentina/Buenos_Aires";
// Lunes 5 de octubre de 2026, 10:00 en Argentina.
const NOW = new Date("2026-10-05T13:00:00Z");
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 86_400_000);

let seq = 0;
function input(over: Partial<PatientDirectoryInput> = {}): PatientDirectoryInput {
  seq += 1;
  const phone = over.phone ?? "5493515552345";
  return {
    id: `p${String(seq).padStart(3, "0")}`,
    name: "Paciente",
    phone,
    whatsappJid: `${phone}@s.whatsapp.net`,
    createdAt: daysAgo(100),
    nextAppointment: null,
    lastConsultationAt: null,
    lastContactAt: null,
    ...over,
  };
}

describe("buildPatientDirectory", () => {
  it("descarta canales, grupos y difusiones; deja personas con número y @lid", () => {
    const dir = buildPatientDirectory(
      [
        input({ id: "tel", name: "Ana" }),
        input({ id: "lid", name: "Beto", whatsappJid: "93127792677049@lid", phone: "93127792677049" }),
        input({ id: "canal", name: null, whatsappJid: "120363000000000000@newsletter", phone: "120363000000000000" }),
        input({ id: "grupo", name: "Familia", whatsappJid: "5493515552345-1600000000@g.us" }),
        input({ id: "difusion", name: null, whatsappJid: "status@broadcast" }),
        input({ id: "lid-sin", name: null, whatsappJid: "900000017002@lid", phone: "900000017002" }),
      ],
      NOW,
      TZ,
    );
    expect(dir.named.map((r) => r.id)).toEqual(["tel", "lid"]);
    expect(dir.unnamed.map((r) => r.id)).toEqual(["lid-sin"]);
  });

  it("ordena los nombres como en español: sin importar tildes ni mayúsculas, la ñ después de la n", () => {
    const names = ["Oscar", "Ñandú", "Beto", "Ana", "álvaro", "Nzeta"];
    const dir = buildPatientDirectory(names.map((name) => input({ name })), NOW, TZ);
    expect(dir.named.map((r) => r.name)).toEqual(["álvaro", "Ana", "Beto", "Nzeta", "Ñandú", "Oscar"]);
  });

  it("desempata por id con nombres iguales", () => {
    const dir = buildPatientDirectory([input({ id: "b", name: "Ana" }), input({ id: "a", name: "ana" })], NOW, TZ);
    expect(dir.named.map((r) => r.id)).toEqual(["a", "b"]);
  });

  it("recorta el nombre y manda los nombres en blanco a unnamed con name null", () => {
    const dir = buildPatientDirectory([input({ id: "x", name: "  Lucía  " }), input({ id: "y", name: "   " })], NOW, TZ);
    expect(dir.named[0]).toMatchObject({ id: "x", name: "Lucía", searchName: "lucia" });
    expect(dir.unnamed[0]).toMatchObject({ id: "y", name: null, searchName: "", statusLine: "" });
  });

  it("ordena unnamed por último contacto (o alta) del más reciente al más viejo", () => {
    const dir = buildPatientDirectory(
      [
        input({ id: "viejo", name: null, createdAt: daysAgo(40) }),
        input({ id: "contacto-ayer", name: null, createdAt: daysAgo(90), lastContactAt: daysAgo(1) }),
        input({ id: "alta-hoy", name: null, createdAt: daysAgo(0) }),
        input({ id: "contacto-10", name: null, createdAt: daysAgo(2), lastContactAt: daysAgo(10) }),
      ],
      NOW,
      TZ,
    );
    expect(dir.unnamed.map((r) => r.id)).toEqual(["alta-hoy", "contacto-ayer", "contacto-10", "viejo"]);
  });

  describe("statusLine", () => {
    const line = (over: Partial<PatientDirectoryInput>) => buildPatientDirectory([input(over)], NOW, TZ).named[0]!.statusLine;

    it("con turno hoy", () => {
      expect(line({ nextAppointment: { startsAt: new Date("2026-10-05T19:30:00Z"), status: "CONFIRMED" } })).toBe("Hoy, 16:30");
    });
    it("con turno esperando la seña", () => {
      expect(line({ nextAppointment: { startsAt: new Date("2026-10-08T13:00:00Z"), status: "AWAITING_PAYMENT" } })).toBe(
        "Jueves 8 de octubre, 10:00 · Falta la seña",
      );
    });
    it("el turno manda sobre la consulta", () => {
      expect(
        line({
          nextAppointment: { startsAt: new Date("2026-10-06T13:00:00Z"), status: "CONFIRMED" },
          lastConsultationAt: daysAgo(21),
        }),
      ).toBe("Mañana, 10:00");
    });
    it("sin turno con consulta", () => {
      expect(line({ lastConsultationAt: daysAgo(21), lastContactAt: daysAgo(1) })).toBe("Sin turno · Última consulta hace 3 semanas");
      expect(line({ lastConsultationAt: daysAgo(0) })).toBe("Sin turno · Última consulta hoy");
    });
    it("sin turno ni consulta, con contacto", () => {
      expect(line({ lastContactAt: daysAgo(2) })).toBe("Sin turno · Te escribió hace 2 días");
    });
    it("sin nada", () => {
      expect(line({})).toBe("Sin turno");
    });
    it("nunca tiene un guion largo", () => {
      const dir = buildPatientDirectory(
        [input({}), input({ lastContactAt: daysAgo(3) }), input({ lastConsultationAt: daysAgo(400) })],
        NOW,
        TZ,
      );
      for (const r of dir.named) {
        expect(r.statusLine).not.toContain("—");
        expect(r.lastContactLabel).toBe("");
      }
    });
  });

  it("lastContactLabel usa createdAt si no hay ConversationState", () => {
    const dir = buildPatientDirectory(
      [input({ id: "a", name: null, createdAt: daysAgo(3) }), input({ id: "b", name: null, createdAt: daysAgo(30), lastContactAt: daysAgo(1) })],
      NOW,
      TZ,
    );
    expect(dir.unnamed.find((r) => r.id === "a")!.lastContactLabel).toBe("escribió hace 3 días");
    expect(dir.unnamed.find((r) => r.id === "b")!.lastContactLabel).toBe("escribió ayer");
  });

  it("formatea el teléfono y guarda sus dígitos solo para los contactos con número", () => {
    const dir = buildPatientDirectory(
      [
        input({ id: "tel", name: "Ana", phone: "5493515552345" }),
        input({ id: "lid", name: "Beto", whatsappJid: "93127792677049@lid", phone: "93127792677049" }),
      ],
      NOW,
      TZ,
    );
    expect(dir.named[0]).toMatchObject({ contactKind: "phone", phoneLabel: "+54 9 351 555-2345", phoneDigits: "5493515552345" });
    expect(dir.named[1]).toMatchObject({ contactKind: "hidden", phoneLabel: null, phoneDigits: null });
  });
});

describe("matchesPatientQuery", () => {
  const maria = { searchName: "maria jose gomez", phoneDigits: "5493515552345" };

  it.each([
    "maria jose",
    "jose gomez",
    "GÓMEZ maría",
    "555 2345",
    "3515552345",
    "+54 9 351 555-2345",
    "0351 555 2345",
    "maria 555",
    "",
    "   ",
  ])("«%s» coincide", (q) => {
    expect(matchesPatientQuery(maria, q)).toBe(true);
  });

  it.each(["maria 999", "pedro", "999", "maria pedro"])("«%s» no coincide", (q) => {
    expect(matchesPatientQuery(maria, q)).toBe(false);
  });

  it("los dígitos de un @lid no se buscan", () => {
    expect(matchesPatientQuery({ searchName: "", phoneDigits: null }, "9312")).toBe(false);
    expect(matchesPatientQuery({ searchName: "beto", phoneDigits: null }, "beto 9312")).toBe(false);
    expect(matchesPatientQuery({ searchName: "beto", phoneDigits: null }, "beto")).toBe(true);
  });
});

describe("patientCountLabel", () => {
  it("cuenta en singular, plural y buscando", () => {
    expect(patientCountLabel(12, 12, false)).toBe("12 pacientes");
    expect(patientCountLabel(1, 1, false)).toBe("1 paciente");
    expect(patientCountLabel(0, 0, false)).toBe("0 pacientes");
    expect(patientCountLabel(3, 12, true)).toBe("3 de 12");
  });
});

it("PATIENT_DIRECTORY_TEXT compone los textos dinámicos", () => {
  expect(PATIENT_DIRECTORY_TEXT.noResultsTitle("zzzz")).toBe("No encontramos a «zzzz»");
  expect(PATIENT_DIRECTORY_TEXT.incompleteTitle(4)).toBe("Por completar (4)");
  expect(PATIENT_DIRECTORY_TEXT.setNameDone("Lucía Pérez")).toBe("Listo, Lucía Pérez ya está en tus pacientes");
});
