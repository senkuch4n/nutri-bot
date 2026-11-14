import { describe, expect, it } from "vitest";
import {
  AGENDA_TEXT,
  appointmentDayAtTime,
  appointmentDayTime,
  appointmentDurationMinutes,
  appointmentEventTitle,
  appointmentShortDate,
  calendarFilterCount,
  calendarFilterHides,
  calendarNavLabels,
  calendarDayPanelTitle,
  calendarPeriodTitle,
  countAgendaDay,
  dayTimelineBlock,
  dayTimelineRange,
  firstName,
  HOME_TEXT,
  homeDayStatus,
  minutesOfDay,
  nextAppointmentText,
  patientDisplayName,
  readableTextOn,
  toggleCalendarFilter,
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
    expect(calendarPeriodTitle("mes", "2026-10-01", "2026-11-01", today)).toBe("Octubre de 2026");
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

describe("readableTextOn", () => {
  it("texto blanco sobre colores oscuros o saturados", () => {
    expect(readableTextOn("#2563eb")).toBe("#ffffff");
    expect(readableTextOn("#0a0a0a")).toBe("#ffffff");
    expect(readableTextOn("#7c3aed")).toBe("#ffffff");
  });
  it("texto casi negro sobre colores claros", () => {
    expect(readableTextOn("#facc15")).toBe("#0a0a0a");
    expect(readableTextOn("#ffffff")).toBe("#0a0a0a");
    expect(readableTextOn("#a7f3d0")).toBe("#0a0a0a");
  });
  it("acepta #rgb y mayúsculas; un color inválido cae en blanco", () => {
    expect(readableTextOn("#FFF")).toBe("#0a0a0a");
    expect(readableTextOn("azul")).toBe("#ffffff");
  });
});

describe("filtros del calendario", () => {
  const none = { hiddenServices: [], hiddenStatuses: [] };
  const ev = { serviceName: "Control", status: "CONFIRMED" };

  it("sin filtros no oculta nada", () => {
    expect(calendarFilterHides(ev, none)).toBe(false);
    expect(calendarFilterCount(none)).toBe(0);
  });

  it("oculta por servicio o por estado", () => {
    expect(calendarFilterHides(ev, { hiddenServices: ["Control"], hiddenStatuses: [] })).toBe(true);
    expect(calendarFilterHides(ev, { hiddenServices: [], hiddenStatuses: ["CONFIRMED"] })).toBe(true);
    expect(calendarFilterHides(ev, { hiddenServices: ["Antro"], hiddenStatuses: ["NO_SHOW"] })).toBe(false);
    expect(calendarFilterCount({ hiddenServices: ["Antro"], hiddenStatuses: ["NO_SHOW"] })).toBe(2);
  });

  it("toggleCalendarFilter agrega o saca sin mutar la lista", () => {
    const list = ["Antro"];
    expect(toggleCalendarFilter(list, "Control")).toEqual(["Antro", "Control"]);
    expect(toggleCalendarFilter(list, "Antro")).toEqual([]);
    expect(list).toEqual(["Antro"]);
  });
});

describe("panel del día", () => {
  it("título: día de la semana, día y mes; el año solo si no es el actual", () => {
    expect(calendarDayPanelTitle("2026-10-05", "2026-10-31")).toBe("Lunes, 5 de octubre");
    expect(calendarDayPanelTitle("2027-01-04", "2026-10-31")).toBe("Lunes, 4 de enero de 2027");
  });

  it("minutesOfDay lee la hora local del ISO con offset (no la convierte a UTC)", () => {
    expect(minutesOfDay("2026-10-05T08:30:00-03:00")).toBe(510);
    expect(minutesOfDay("2026-10-05T00:00:00Z")).toBe(0);
  });

  it("la agenda va de la franja configurada, ampliada a horas enteras si un turno queda afuera", () => {
    expect(dayTimelineRange("08:00:00", "20:00:00", [{ startMin: 540, endMin: 585 }])).toEqual({ fromMin: 480, toMin: 1200 });
    expect(dayTimelineRange("08:00:00", "20:00:00", [{ startMin: 450, endMin: 1230 }])).toEqual({ fromMin: 420, toMin: 1260 });
  });

  it("cada turno ocupa su porción de la agenda, en porcentaje y recortado al rango", () => {
    const range = { fromMin: 480, toMin: 1080 }; // 10 h
    expect(dayTimelineBlock({ startMin: 540, endMin: 600 }, range)).toEqual({ top: 10, height: 10 });
    expect(dayTimelineBlock({ startMin: 1050, endMin: 1140 }, range)).toEqual({ top: 95, height: 5 });
  });

  it("textos del panel", () => {
    expect(AGENDA_TEXT.dayPanel.list).toBe("Lista");
    expect(AGENDA_TEXT.dayPanel.agenda).toBe("Agenda");
    expect(AGENDA_TEXT.dayPanel.pendingPayment).toBe("Cobro pendiente");
    expect(AGENDA_TEXT.dayPanel.hasNote).toBe("Tiene nota");
  });
});

describe("detalle del turno", () => {
  it("fecha corta en la zona de la profesional: «5 oct 26»", () => {
    expect(appointmentShortDate(new Date("2026-10-05T13:00:00Z"), "America/Argentina/Buenos_Aires")).toBe("5 oct 26");
    // 01:00 UTC del 6 es todavía el 5 en Buenos Aires.
    expect(appointmentShortDate(new Date("2026-10-06T01:00:00Z"), "America/Argentina/Buenos_Aires")).toBe("5 oct 26");
  });

  it("duración en minutos", () => {
    expect(appointmentDurationMinutes("2026-10-05T10:00:00-03:00", "2026-10-05T11:00:00-03:00")).toBe(60);
    expect(appointmentDurationMinutes("2026-10-05T10:00:00-03:00", "2026-10-05T10:45:00-03:00")).toBe(45);
  });

  it("textos de las secciones", () => {
    expect(AGENDA_TEXT.sheet.patient).toBe("Paciente:");
    expect(AGENDA_TEXT.sheet.sections).toEqual({ when: "Fecha y hora", status: "Estado", finance: "Finanzas", more: "Más" });
    expect(AGENDA_TEXT.sheet.minutes(60)).toBe("60 min");
  });
});

describe("Inicio", () => {
  it("estado del día: sin turnos, los que quedan o ya terminaste", () => {
    expect(homeDayStatus({ total: 0, remaining: 0 })).toBe("Sin turnos");
    expect(homeDayStatus({ total: 3, remaining: 2 })).toBe("Quedan 2");
    expect(homeDayStatus({ total: 3, remaining: 1 })).toBe("Queda 1");
    expect(homeDayStatus({ total: 3, remaining: 0 })).toBe("Ya terminaste");
  });

  it("textos del Inicio", () => {
    expect(HOME_TEXT.greeting("Daiana")).toBe("Hola Daiana");
    expect(HOME_TEXT.greeting(null)).toBe("Hola");
    expect(HOME_TEXT.todayCount(1)).toBe("1 turno");
    expect(HOME_TEXT.todayCount(4)).toBe("4 turnos");
    expect(HOME_TEXT.todayCount(0)).toBe("Sin turnos");
    expect(HOME_TEXT.awaitingEmpty).toBe("No hay turnos esperando la seña.");
  });
});
