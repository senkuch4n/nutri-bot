import { describe, expect, it } from "vitest";
import {
  AGENDA_TEXT,
  appointmentDayAtTime,
  appointmentDayTime,
  appointmentEventTitle,
  calendarNavLabels,
  calendarPeriodTitle,
  countAgendaDay,
  firstName,
  nextAppointmentText,
  patientDisplayName,
  todaySummaryText,
  weekSummaryText,
} from "./agenda";

const tz = "America/Argentina/Buenos_Aires";
// Lunes 5 de octubre de 2026, 10:00 en Argentina.
const now = new Date("2026-10-05T13:00:00Z");

const phonePatient = { name: null, phone: "5493515552345", whatsappJid: "5493515552345@s.whatsapp.net" };
const lidPatient = { name: null, phone: "93127792677049", whatsappJid: "93127792677049@lid" };

describe("patientDisplayName", () => {
  it("usa el nombre recortado", () => {
    expect(patientDisplayName({ ...phonePatient, name: "  Brenda Yebara " })).toBe("Brenda Yebara");
  });
  it("sin nombre y con número visible: el teléfono con formato", () => {
    expect(patientDisplayName(phonePatient)).toBe("+54 9 351 555-2345");
    expect(patientDisplayName({ ...phonePatient, name: "   " })).toBe("+54 9 351 555-2345");
  });
  it("sin nombre y sin número visible: Sin nombre", () => {
    expect(patientDisplayName(lidPatient)).toBe("Sin nombre");
    expect(patientDisplayName({ name: null, phone: "120363", whatsappJid: "120363@newsletter" })).toBe("Sin nombre");
  });
});

describe("appointmentEventTitle", () => {
  it("nombre, teléfono o Sin nombre, más el servicio", () => {
    expect(appointmentEventTitle({ ...phonePatient, name: "Brenda Yebara" }, "Control")).toBe("Brenda Yebara · Control");
    expect(appointmentEventTitle(phonePatient, "Control")).toBe("+54 9 351 555-2345 · Control");
    expect(appointmentEventTitle(lidPatient, "Control")).toBe("Sin nombre · Control");
  });
});

describe("firstName", () => {
  it("primera palabra o null", () => {
    expect(firstName("María José Gómez")).toBe("María");
    expect(firstName("  Ana ")).toBe("Ana");
    expect(firstName(null)).toBeNull();
    expect(firstName("  ")).toBeNull();
  });
});

describe("appointmentDayTime", () => {
  it("día en minúscula y hora H:mm; año solo si no es el de hoy", () => {
    expect(appointmentDayTime(new Date("2026-10-08T13:00:00Z"), now, tz)).toBe("jueves 8 de octubre, 10:00");
    expect(appointmentDayTime(new Date("2027-01-04T12:00:00Z"), now, tz)).toBe("lunes 4 de enero de 2027, 9:00");
  });
  it("un turno de hoy se nombra con el día (es para frases absolutas)", () => {
    expect(appointmentDayTime(new Date("2026-10-05T19:30:00Z"), now, tz)).toBe("lunes 5 de octubre, 16:30");
  });
});

describe("appointmentDayAtTime", () => {
  it("a las / a la", () => {
    expect(appointmentDayAtTime(new Date("2026-10-08T13:00:00Z"), now, tz)).toBe("jueves 8 de octubre a las 10:00");
    expect(appointmentDayAtTime(new Date("2026-10-08T04:30:00Z"), now, tz)).toBe("jueves 8 de octubre a la 1:30");
    expect(appointmentDayAtTime(new Date("2026-10-08T03:15:00Z"), now, tz)).toBe("jueves 8 de octubre a las 0:15");
    expect(appointmentDayAtTime(new Date("2026-10-08T16:00:00Z"), now, tz)).toBe("jueves 8 de octubre a las 13:00");
  });
});

describe("countAgendaDay", () => {
  const at = (hhmm: string) => new Date(`2026-10-05T${hhmm}:00-03:00`);
  it("cuenta los del día y los que quedan", () => {
    const appts = [
      { status: "COMPLETED" as const, startsAt: at("08:00") },
      { status: "COMPLETED" as const, startsAt: at("08:45") },
      { status: "COMPLETED" as const, startsAt: at("09:00") },
      { status: "COMPLETED" as const, startsAt: at("09:30") },
      { status: "NO_SHOW" as const, startsAt: at("09:45") },
      { status: "CONFIRMED" as const, startsAt: at("16:30") },
    ];
    expect(countAgendaDay(appts, now)).toEqual({ total: 6, remaining: 1 });
  });
  it("un confirmado que ya pasó cuenta en el total pero no queda", () => {
    expect(countAgendaDay([{ status: "CONFIRMED", startsAt: at("08:00") }], now)).toEqual({ total: 1, remaining: 0 });
  });
  it("cancelados y esperando seña no cuentan", () => {
    expect(
      countAgendaDay(
        [
          { status: "CANCELLED", startsAt: at("16:00") },
          { status: "AWAITING_PAYMENT", startsAt: at("17:00") },
        ],
        now,
      ),
    ).toEqual({ total: 0, remaining: 0 });
  });
  it("un confirmado exactamente ahora ya no queda", () => {
    expect(countAgendaDay([{ status: "CONFIRMED", startsAt: now }], now)).toEqual({ total: 1, remaining: 0 });
  });
});

describe("todaySummaryText / weekSummaryText", () => {
  it("hoy", () => {
    expect(todaySummaryText({ total: 6, remaining: 1 })).toBe("Hoy: 6 turnos · queda 1");
    expect(todaySummaryText({ total: 6, remaining: 2 })).toBe("Hoy: 6 turnos · quedan 2");
    expect(todaySummaryText({ total: 6, remaining: 0 })).toBe("Hoy: 6 turnos · no queda ninguno");
    expect(todaySummaryText({ total: 1, remaining: 1 })).toBe("Hoy: 1 turno · queda 1");
    expect(todaySummaryText({ total: 0, remaining: 0 })).toBe("Hoy: sin turnos");
  });
  it("semana", () => {
    expect(weekSummaryText(18)).toBe("Esta semana: 18 turnos");
    expect(weekSummaryText(1)).toBe("Esta semana: 1 turno");
    expect(weekSummaryText(0)).toBe("Esta semana: sin turnos");
  });
});

describe("nextAppointmentText", () => {
  it("hoy con nombre", () => {
    expect(
      nextAppointmentText(
        {
          startsAt: new Date("2026-10-05T19:30:00Z"),
          patient: { ...phonePatient, name: "Brenda Yebara" },
          serviceName: "Control",
        },
        now,
        tz,
      ),
    ).toBe("Hoy, 16:30 · Brenda Yebara · Control");
  });
  it("mañana sin nombre: el teléfono con formato", () => {
    expect(
      nextAppointmentText({ startsAt: new Date("2026-10-06T13:00:00Z"), patient: phonePatient, serviceName: "Control" }, now, tz),
    ).toBe("Mañana, 10:00 · +54 9 351 555-2345 · Control");
  });
});

describe("calendarPeriodTitle", () => {
  const today = "2026-10-05";
  it("día", () => {
    expect(calendarPeriodTitle("dia", "2026-10-08", "2026-10-09", today)).toBe("Jueves 8 de octubre");
    expect(calendarPeriodTitle("dia", "2027-01-04", "2027-01-05", today)).toBe("Lunes 4 de enero de 2027");
  });
  it("semana", () => {
    expect(calendarPeriodTitle("semana", "2026-10-05", "2026-10-12", today)).toBe("5 – 11 de octubre");
    expect(calendarPeriodTitle("semana", "2026-09-28", "2026-10-05", today)).toBe("28 de septiembre – 4 de octubre");
    expect(calendarPeriodTitle("semana", "2026-12-28", "2027-01-04", today)).toBe(
      "28 de diciembre de 2026 – 3 de enero de 2027",
    );
    expect(calendarPeriodTitle("semana", "2027-10-04", "2027-10-11", today)).toBe("4 – 10 de octubre de 2027");
  });
  it("mes", () => {
    expect(calendarPeriodTitle("mes", "2026-10-01", "2026-11-01", today)).toBe("Octubre 2026");
  });
});

describe("calendarNavLabels", () => {
  it("las tres vistas", () => {
    expect(calendarNavLabels("dia")).toEqual({ prev: "Día anterior", next: "Día siguiente" });
    expect(calendarNavLabels("semana")).toEqual({ prev: "Semana anterior", next: "Semana siguiente" });
    expect(calendarNavLabels("mes")).toEqual({ prev: "Mes anterior", next: "Mes siguiente" });
  });
});

describe("AGENDA_TEXT", () => {
  it("textos exactos", () => {
    expect(AGENDA_TEXT.views).toEqual({ dia: "Día", semana: "Semana", mes: "Mes" });
    expect(AGENDA_TEXT.cancel.title("Brenda Yebara")).toBe("¿Cancelar el turno de Brenda Yebara?");
    expect(AGENDA_TEXT.cancel.description(appointmentDayAtTime(new Date("2026-10-08T13:00:00Z"), now, tz))).toBe(
      "Le avisamos por WhatsApp que se canceló el turno del jueves 8 de octubre a las 10:00.",
    );
    expect(AGENDA_TEXT.cancel.scheduled("Brenda")).toBe("Turno cancelado. Le avisamos a Brenda en unos segundos.");
    expect(AGENDA_TEXT.cancel.scheduled(null)).toBe("Turno cancelado. Le avisamos en unos segundos.");
    expect(
      AGENDA_TEXT.create.created("Brenda Yebara", appointmentDayTime(new Date("2026-10-08T13:00:00Z"), now, tz)),
    ).toBe("Turno creado para Brenda Yebara, jueves 8 de octubre, 10:00");
    expect(AGENDA_TEXT.create.slotNotFree("15:00", "Control")).toBe(
      "A las 15:00 no hay lugar para Control. Elegí otro horario.",
    );
    expect(AGENDA_TEXT.create.noResults("ana")).toBe("No encontramos a «ana»");
    expect(AGENDA_TEXT.create.existing("María José Gómez")).toBe("Ese número es de María José Gómez");
    expect(AGENDA_TEXT.create.chooseExisting("María")).toBe("Elegir a María");
  });
});
