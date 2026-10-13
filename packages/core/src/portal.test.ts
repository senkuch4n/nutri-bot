import { describe, expect, it } from "vitest";
import {
  PORTAL_DIARY_TEXT,
  PORTAL_TEXT,
  groupDiaryByDay,
  diaryTodayText,
  formatHeightMeters,
  formatPortalDate,
  formatWeightKg,
  isMinorOn,
  portalEvolutionRows,
  portalDocumentTitle,
  portalGreeting,
  portalHeightSummary,
  portalProfessionalLine,
  portalWeightSummary,
  professionalWhatsappUrl,
  startOfTodayInTz,
} from "./portal";

const TZ = "America/Argentina/Buenos_Aires";
// Martes 7/10/2026 12:00 en Argentina.
const NOW = new Date("2026-10-07T15:00:00Z");
const d = (iso: string) => new Date(iso);

describe("portalGreeting", () => {
  it("usa el nombre de pila", () => {
    expect(portalGreeting("María Laura López")).toBe("Hola, María 👋");
    expect(portalGreeting("  ana  ")).toBe("Hola, ana 👋");
  });
  it("sin nombre dice solo Hola", () => {
    expect(portalGreeting(null)).toBe("Hola 👋");
    expect(portalGreeting("")).toBe("Hola 👋");
    expect(portalGreeting("   ")).toBe("Hola 👋");
  });
});

describe("portalProfessionalLine", () => {
  it("firma con título y matrícula", () => {
    expect(portalProfessionalLine({ title: "Lic.", name: "Daiana Ponce", licenseNumber: "M.P. 852" })).toBe(
      "Tu espacio con Lic. Daiana Ponce · M.P. 852",
    );
  });
  it("sin matrícula", () => {
    expect(portalProfessionalLine({ title: "Lic.", name: "Daiana Ponce", licenseNumber: null })).toBe(
      "Tu espacio con Lic. Daiana Ponce",
    );
  });
  it("sin nombre o con el nombre del seed sin título (Q1)", () => {
    const generic = "Tu espacio con tu nutricionista";
    expect(portalProfessionalLine({ title: null, name: "", licenseNumber: null })).toBe(generic);
    expect(portalProfessionalLine({ title: null, name: "Nutricionista", licenseNumber: null })).toBe(generic);
    expect(portalProfessionalLine({ title: "  ", name: " nutricionista ", licenseNumber: null })).toBe(generic);
    expect(portalProfessionalLine({ title: null, name: "NUTRICIONÍSTA", licenseNumber: null })).toBe(generic);
  });
  it("con título, 'Nutricionista' no se considera el valor del seed", () => {
    expect(portalProfessionalLine({ title: "Lic.", name: "Nutricionista", licenseNumber: null })).toBe(
      "Tu espacio con Lic. Nutricionista",
    );
  });
});

describe("portalDocumentTitle", () => {
  it("con el nombre de la profesional", () => {
    expect(portalDocumentTitle({ title: "Lic.", name: "Daiana Ponce" })).toBe("Tu espacio — Lic. Daiana Ponce");
  });
  it("sin nombre o con el del seed (Q1)", () => {
    expect(portalDocumentTitle({ title: null, name: "" })).toBe("Tu espacio");
    expect(portalDocumentTitle({ title: null, name: "Nutricionista" })).toBe("Tu espacio");
  });
});

describe("professionalWhatsappUrl", () => {
  it("arma el link con los dígitos del teléfono", () => {
    const url = "https://wa.me/5493515552345";
    expect(professionalWhatsappUrl("5493515552345@s.whatsapp.net")).toBe(url);
    expect(professionalWhatsappUrl("5493515552345:12@s.whatsapp.net")).toBe(url);
    expect(professionalWhatsappUrl("5493515552345@c.us")).toBe(url);
  });
  it("null si no es un teléfono o no tiene dígitos", () => {
    for (const jid of ["12345@lid", null, "", "123@g.us", "status@broadcast", "@s.whatsapp.net"]) {
      expect(professionalWhatsappUrl(jid)).toBeNull();
    }
  });
});

describe("diaryTodayText", () => {
  it("singular, plural y vacío", () => {
    expect(diaryTodayText(0)).toBeNull();
    expect(diaryTodayText(1)).toBe("Hoy anotaste 1 comida");
    expect(diaryTodayText(2)).toBe("Hoy anotaste 2 comidas");
  });
});

describe("startOfTodayInTz", () => {
  it("medianoche de hoy en la zona, no en UTC", () => {
    expect(startOfTodayInTz(d("2026-10-07T02:30:00Z"), TZ).toISOString()).toBe("2026-10-06T03:00:00.000Z");
    expect(startOfTodayInTz(NOW, TZ).toISOString()).toBe("2026-10-07T03:00:00.000Z");
  });
});

describe("isMinorOn", () => {
  it("cumple 18 hoy → no es menor", () => {
    expect(isMinorOn(d("2008-10-07T00:00:00Z"), NOW, TZ)).toBe(false);
  });
  it("cumple 18 mañana → es menor", () => {
    expect(isMinorOn(d("2008-10-08T00:00:00Z"), NOW, TZ)).toBe(true);
  });
  it("usa el día de la zona, no el de UTC", () => {
    expect(isMinorOn(d("2008-10-08T00:00:00Z"), d("2026-10-08T01:00:00Z"), TZ)).toBe(true);
  });
  it("sin fecha → false; 5 años → true", () => {
    expect(isMinorOn(null, NOW, TZ)).toBe(false);
    expect(isMinorOn(d("2021-03-01T00:00:00Z"), NOW, TZ)).toBe(true);
  });
});

describe("formatPortalDate", () => {
  it("sin año si es el mismo año", () => {
    expect(formatPortalDate(d("2026-09-12T15:00:00Z"), NOW, TZ)).toBe("12 de septiembre");
  });
  it("con año si es otro", () => {
    expect(formatPortalDate(d("2025-09-12T15:00:00Z"), NOW, TZ)).toBe("12 de septiembre de 2025");
  });
  it("en la zona de la profesional", () => {
    expect(formatPortalDate(d("2026-10-01T02:00:00Z"), NOW, TZ)).toBe("30 de septiembre");
  });
});

describe("formatWeightKg / formatHeightMeters", () => {
  it("peso con hasta un decimal", () => {
    expect(formatWeightKg(62.4)).toBe("62,4 kg");
    expect(formatWeightKg(62)).toBe("62 kg");
    expect(formatWeightKg(62.45)).toBe("62,5 kg");
  });
  it("altura en metros con dos decimales", () => {
    expect(formatHeightMeters(132)).toBe("1,32 m");
    expect(formatHeightMeters(165.5)).toBe("1,66 m");
    expect(formatHeightMeters(100)).toBe("1,00 m");
  });
});

describe("portalWeightSummary", () => {
  const AUG3 = d("2026-08-03T15:00:00Z");
  const SEP16 = d("2026-09-16T15:00:00Z");

  it("null sin pesos", () => {
    expect(portalWeightSummary([], NOW, TZ, { hideChange: false })).toBeNull();
    expect(portalWeightSummary([{ weightKg: null, recordedAt: SEP16 }], NOW, TZ, { hideChange: false })).toBeNull();
  });

  it("un solo peso: sin cambio", () => {
    expect(portalWeightSummary([{ weightKg: 62.4, recordedAt: SEP16 }], NOW, TZ, { hideChange: false })).toEqual({
      latestKg: 62.4,
      latestAgoText: "Último registro: hace 3 semanas",
      latestAgo: "hace 3 semanas",
      changeText: null,
    });
  });

  it("baja, sube o igual, en palabras neutras", () => {
    const down = portalWeightSummary(
      [{ weightKg: 64.4, recordedAt: AUG3 }, { weightKg: 62.4, recordedAt: SEP16 }],
      NOW, TZ, { hideChange: false },
    );
    expect(down?.changeText).toBe("2 kg menos que el 3 de agosto");
    const up = portalWeightSummary(
      [{ weightKg: 61.2, recordedAt: AUG3 }, { weightKg: 62.4, recordedAt: SEP16 }],
      NOW, TZ, { hideChange: false },
    );
    expect(up?.changeText).toBe("1,2 kg más que el 3 de agosto");
    const same = portalWeightSummary(
      [{ weightKg: 62.4, recordedAt: AUG3 }, { weightKg: 62.4, recordedAt: SEP16 }],
      NOW, TZ, { hideChange: false },
    );
    expect(same?.changeText).toBe("Igual que el 3 de agosto");
  });

  it("el orden de entrada no importa", () => {
    const s = portalWeightSummary(
      [{ weightKg: 62.4, recordedAt: SEP16 }, { weightKg: 64.4, recordedAt: AUG3 }],
      NOW, TZ, { hideChange: false },
    );
    expect(s?.latestKg).toBe(62.4);
    expect(s?.changeText).toBe("2 kg menos que el 3 de agosto");
  });

  it("hideChange (menores) solo saca el cambio", () => {
    const s = portalWeightSummary(
      [{ weightKg: 64.4, recordedAt: AUG3 }, { weightKg: 62.4, recordedAt: SEP16 }],
      NOW, TZ, { hideChange: true },
    );
    expect(s).toEqual({
      latestKg: 62.4,
      latestAgoText: "Último registro: hace 3 semanas",
      latestAgo: "hace 3 semanas",
      changeText: null,
    });
  });

  it("ignora los puntos sin peso al buscar el anterior", () => {
    const s = portalWeightSummary(
      [
        { weightKg: 64.4, recordedAt: AUG3 },
        { weightKg: null, recordedAt: d("2026-09-01T15:00:00Z") },
        { weightKg: 62.4, recordedAt: SEP16 },
      ],
      NOW, TZ, { hideChange: false },
    );
    expect(s?.changeText).toBe("2 kg menos que el 3 de agosto");
  });

  it("un peso anterior de otro año lleva el año", () => {
    const s = portalWeightSummary(
      [{ weightKg: 64.4, recordedAt: d("2025-08-03T15:00:00Z") }, { weightKg: 62.4, recordedAt: SEP16 }],
      NOW, TZ, { hideChange: false },
    );
    expect(s?.changeText).toBe("2 kg menos que el 3 de agosto de 2025");
  });
});

describe("portalHeightSummary", () => {
  it("null sin alturas", () => {
    expect(portalHeightSummary([{ heightCm: null, recordedAt: NOW }], NOW, TZ)).toBeNull();
  });
  it("toma la más reciente aunque venga desordenada", () => {
    const s = portalHeightSummary(
      [
        { heightCm: 132, recordedAt: d("2026-08-07T15:00:00Z") },
        { heightCm: 128, recordedAt: d("2026-05-07T15:00:00Z") },
        { heightCm: null, recordedAt: d("2026-10-01T15:00:00Z") },
      ],
      NOW, TZ,
    );
    expect(s).toEqual({ cm: 132, text: "1,32 m", agoText: "Medida hace 2 meses" });
  });
  it("medida hoy", () => {
    expect(portalHeightSummary([{ heightCm: 130, recordedAt: NOW }], NOW, TZ)?.agoText).toBe("Medida hoy");
  });
});

describe("portalEvolutionRows", () => {
  const entries = [
    { id: "a", recordedAt: d("2026-08-03T15:00:00Z"), weightKg: 64.4, heightCm: 130 },
    { id: "b", recordedAt: d("2026-09-20T15:00:00Z"), weightKg: null, heightCm: null },
    { id: "c", recordedAt: d("2026-09-16T15:00:00Z"), weightKg: 62.4, heightCm: null },
    { id: "e", recordedAt: d("2026-09-01T15:00:00Z"), weightKg: null, heightCm: 131 },
  ];

  it("saca las filas vacías y ordena de la más nueva a la más vieja", () => {
    expect(portalEvolutionRows(entries, NOW, TZ)).toEqual([
      { id: "c", dateLabel: "16 de septiembre", weightText: "62,4 kg", heightText: null },
      { id: "e", dateLabel: "1 de septiembre", weightText: null, heightText: "1,31 m" },
      { id: "a", dateLabel: "3 de agosto", weightText: "64,4 kg", heightText: "1,30 m" },
    ]);
  });

  it("no deja pasar otros campos (sin notas, D2)", () => {
    const withNote = [{ ...entries[0]!, note: "NOTA-CLINICA" }];
    const rows = portalEvolutionRows(withNote, NOW, TZ);
    expect(Object.keys(rows[0]!).sort()).toEqual(["dateLabel", "heightText", "id", "weightText"]);
    expect(JSON.stringify(rows)).not.toContain("NOTA-CLINICA");
  });
});

describe("PORTAL_TEXT", () => {
  it("no usa palabras de sistema", () => {
    const banned = ["sesión", "token", "inválido", "kcal", "macros", "registro guardado"];
    for (const value of Object.values(PORTAL_TEXT)) {
      for (const word of banned) expect(value.toLowerCase()).not.toContain(word);
    }
  });
});

describe("groupDiaryByDay (017d-2)", () => {
  it("agrupa en Hoy, Ayer y el día con nombre", () => {
    const groups = groupDiaryByDay(
      [
        { id: "a", createdAt: d("2026-10-07T13:00:00Z") }, // hoy 10:00
        { id: "b", createdAt: d("2026-10-06T16:40:00Z") }, // ayer 13:40
        { id: "c", createdAt: d("2026-10-02T12:05:00Z") }, // 2/10 9:05
      ],
      NOW,
      TZ,
    );
    // El 2/10/2026 es viernes (el ejemplo de la HU, "Jueves 2 de octubre", es de 2025).
    expect(groups.map((g) => g.label)).toEqual(["Hoy", "Ayer", "Viernes 2 de octubre"]);
    expect(groups.map((g) => g.dayKey)).toEqual(["2026-10-07", "2026-10-06", "2026-10-02"]);
  });

  it("un registro de otro año lleva el año", () => {
    const [g] = groupDiaryByDay([{ createdAt: d("2025-10-02T15:00:00Z") }], NOW, TZ);
    expect(g?.label).toBe("Jueves 2 de octubre de 2025");
  });

  it("las 23:30 de ayer en Argentina (02:30Z de hoy) caen en Ayer", () => {
    const [g] = groupDiaryByDay([{ createdAt: d("2026-10-07T02:30:00Z") }], NOW, TZ);
    expect(g?.label).toBe("Ayer");
    expect(g?.dayKey).toBe("2026-10-06");
    expect(g?.entries[0]?.timeLabel).toBe("23:30");
  });

  it("ordena grupos y entradas de lo más nuevo a lo más viejo, con la hora H:mm", () => {
    const groups = groupDiaryByDay(
      [
        { id: "temprano", createdAt: d("2026-10-07T12:05:00Z") }, // 9:05
        { id: "ayer", createdAt: d("2026-10-06T20:00:00Z") },
        { id: "tarde", createdAt: d("2026-10-07T16:40:00Z") }, // 13:40
      ],
      NOW,
      TZ,
    );
    expect(groups).toHaveLength(2);
    expect(groups[0]?.entries.map((e) => [e.id, e.timeLabel])).toEqual([
      ["tarde", "13:40"],
      ["temprano", "9:05"],
    ]);
    expect(groups[1]?.entries.map((e) => e.id)).toEqual(["ayer"]);
  });

  it("conserva los campos extra y no cambia la entrada", () => {
    const input = [{ id: "x", note: "Milanesa", hasPhoto: true, createdAt: d("2026-10-07T14:00:00Z") }];
    const [g] = groupDiaryByDay(input, NOW, TZ);
    expect(g?.entries[0]).toEqual({ ...input[0], timeLabel: "11:00" });
    expect(input[0]).not.toHaveProperty("timeLabel");
  });

  it("sin registros devuelve []", () => {
    expect(groupDiaryByDay([], NOW, TZ)).toEqual([]);
  });
});

describe("PORTAL_DIARY_TEXT (017d-2)", () => {
  it("no usa lenguaje técnico", () => {
    const all = Object.values(PORTAL_DIARY_TEXT).join(" ").toLowerCase();
    for (const word of ["registro guardado", "sesión", "token", "inválido", "kcal", "macros"]) {
      expect(all).not.toContain(word);
    }
  });
});
