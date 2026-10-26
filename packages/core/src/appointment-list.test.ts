import { describe, expect, it } from "vitest";
import {
  activeAppointmentFilterCount,
  APPOINTMENT_LIST_TEXT,
  appointmentListQuery,
  type AppointmentListFilters,
  type AppointmentListInput,
  appointmentPaymentText,
  buildAppointmentListRows,
  countAppointmentCards,
  DEFAULT_APPOINTMENT_LIST_FILTERS,
  matchesAppointmentFilters,
  parseAppointmentListFilters,
  appointmentRowStatus,
  canRegisterAppointmentPayment,
  isUnpaidDepositCancellation,
  summarizeAppointmentPayments,
} from "./appointment-list";
import { patientDisplayName } from "./agenda";
import { DEPOSIT_AUTO_CANCEL_REASONS } from "./deposits";
import { formatPrice } from "./format";

// Martes 27/10/2026 12:00 en Argentina (UTC-3).
const now = new Date("2026-10-27T15:00:00Z");
const future = new Date("2026-10-29T13:00:00Z");
const past = new Date("2026-10-20T13:00:00Z");

describe("isUnpaidDepositCancellation", () => {
  it("recognizes both automatic cancellation reasons", () => {
    expect(isUnpaidDepositCancellation(DEPOSIT_AUTO_CANCEL_REASONS.expired)).toBe(true);
    expect(isUnpaidDepositCancellation(DEPOSIT_AUTO_CANCEL_REASONS.checkoutFailed)).toBe(true);
  });

  it("rejects any other reason, empty or missing values and near matches", () => {
    expect(isUnpaidDepositCancellation("La paciente canceló")).toBe(false);
    expect(isUnpaidDepositCancellation("")).toBe(false);
    expect(isUnpaidDepositCancellation(null)).toBe(false);
    expect(isUnpaidDepositCancellation(undefined)).toBe(false);
    expect(isUnpaidDepositCancellation("venció el tiempo para pagar la seña")).toBe(false);
    expect(isUnpaidDepositCancellation(" Venció el tiempo para pagar la seña ")).toBe(false);
  });
});

describe("appointmentRowStatus", () => {
  const row = (status: Parameters<typeof appointmentRowStatus>[0]["status"], startsAt: Date, cancelReason: string | null = null) =>
    appointmentRowStatus({ status, startsAt, cancelReason }, now);

  it("splits CONFIRMED into upcoming and unclosed with a strict > now", () => {
    expect(row("CONFIRMED", future)).toBe("upcoming");
    expect(row("CONFIRMED", past)).toBe("unclosed");
    expect(row("CONFIRMED", new Date(now.getTime()))).toBe("unclosed");
  });

  it("maps closed and awaiting statuses", () => {
    expect(row("COMPLETED", past)).toBe("completed");
    expect(row("NO_SHOW", past)).toBe("no_show");
    expect(row("AWAITING_PAYMENT", future)).toBe("awaiting_deposit");
    expect(row("AWAITING_PAYMENT", past)).toBe("awaiting_deposit");
  });

  it("separates automatic deposit cancellations from real ones", () => {
    expect(row("CANCELLED", past, "Venció el tiempo para pagar la seña")).toBe("deposit_unpaid");
    expect(row("CANCELLED", past, "No se pudo generar el checkout de la seña")).toBe("deposit_unpaid");
    expect(row("CANCELLED", past, "Reprogramó por trabajo")).toBe("cancelled");
    expect(row("CANCELLED", future, null)).toBe("cancelled");
  });
});

describe("summarizeAppointmentPayments", () => {
  it("returns none when nothing is approved", () => {
    expect(summarizeAppointmentPayments(20000, [])).toEqual({ state: "none", paidTotal: 0, balance: 20000 });
  });

  it("returns partial with the remaining balance", () => {
    expect(summarizeAppointmentPayments(20000, [5000])).toEqual({ state: "partial", paidTotal: 5000, balance: 15000 });
  });

  it("returns paid when payments reach or exceed the price", () => {
    expect(summarizeAppointmentPayments(20000, [5000, 15000])).toEqual({ state: "paid", paidTotal: 20000, balance: 0 });
    expect(summarizeAppointmentPayments(20000, [25000])).toEqual({ state: "paid", paidTotal: 25000, balance: 0 });
  });

  it("returns free for a zero price, whatever was paid", () => {
    expect(summarizeAppointmentPayments(0, [])).toEqual({ state: "free", paidTotal: 0, balance: 0 });
    expect(summarizeAppointmentPayments(0, [100])).toEqual({ state: "free", paidTotal: 100, balance: 0 });
  });

  it("adds in integer cents to avoid float errors", () => {
    expect(summarizeAppointmentPayments(100.1, [0.1, 100])).toEqual({ state: "paid", paidTotal: 100.1, balance: 0 });
    expect(summarizeAppointmentPayments(100, [33.33, 33.33])).toEqual({ state: "partial", paidTotal: 66.66, balance: 33.34 });
  });
});

describe("appointmentPaymentText", () => {
  it("describes only what was recorded", () => {
    expect(appointmentPaymentText(summarizeAppointmentPayments(20000, [20000]), "ARS")).toBe("Pagado");
    expect(appointmentPaymentText(summarizeAppointmentPayments(20000, [5000]), "ARS")).toBe(
      `Seña pagada · ${formatPrice(5000, "ARS")}`,
    );
    expect(appointmentPaymentText(summarizeAppointmentPayments(20000, []), "ARS")).toBe("Sin pagos registrados");
    expect(appointmentPaymentText(summarizeAppointmentPayments(0, []), "ARS")).toBe("—");
  });
});

describe("canRegisterAppointmentPayment", () => {
  const none = summarizeAppointmentPayments(20000, []);
  const partial = summarizeAppointmentPayments(20000, [5000]);
  const paid = summarizeAppointmentPayments(20000, [20000]);
  const free = summarizeAppointmentPayments(0, []);

  it("offers it for confirmed or completed appointments that are not fully paid", () => {
    for (const status of ["CONFIRMED", "COMPLETED"] as const) {
      expect(canRegisterAppointmentPayment(status, none)).toBe(true);
      expect(canRegisterAppointmentPayment(status, partial)).toBe(true);
      expect(canRegisterAppointmentPayment(status, paid)).toBe(false);
      expect(canRegisterAppointmentPayment(status, free)).toBe(false);
    }
  });

  it("never offers it for other statuses", () => {
    for (const status of ["NO_SHOW", "CANCELLED", "AWAITING_PAYMENT"] as const) {
      expect(canRegisterAppointmentPayment(status, none)).toBe(false);
      expect(canRegisterAppointmentPayment(status, partial)).toBe(false);
    }
  });
});

describe("APPOINTMENT_LIST_TEXT", () => {
  it("never talks about debt in the payment texts", () => {
    const texts = [
      APPOINTMENT_LIST_TEXT.payment.paid,
      APPOINTMENT_LIST_TEXT.payment.partial("$ 1"),
      APPOINTMENT_LIST_TEXT.payment.none,
    ].join(" ").toLowerCase();
    expect(texts).not.toMatch(/deuda|pendiente|por cobrar/);
  });
});

const tz = "America/Argentina/Buenos_Aires";

/** 10:00 en Argentina del día dd/10/2026. */
const oct = (day: number, hhmm = "10:00") => new Date(`2026-10-${String(day).padStart(2, "0")}T${hhmm}:00-03:00`);

let seq = 0;
function input(
  name: string | null,
  startsAt: Date,
  status: AppointmentListInput["status"],
  extra: Partial<AppointmentListInput> = {},
): AppointmentListInput {
  seq += 1;
  const phone = `549351555${String(seq).padStart(4, "0")}`;
  return {
    id: extra.id ?? `a-${name ?? "x"}`,
    startsAt,
    status,
    cancelReason: null,
    price: 20000,
    approvedAmounts: [],
    reason: null,
    serviceId: "s1",
    serviceName: "Consulta",
    patient: { id: `p-${name ?? seq}`, name, phone, whatsappJid: `${phone}@s.whatsapp.net`, archived: false },
    ...extra,
  };
}

const scenario: AppointmentListInput[] = [
  input("Eva Ruiz", oct(30), "AWAITING_PAYMENT"),
  input("Dora Paz", oct(29), "CONFIRMED", { serviceId: "s2", serviceName: "Antropometría" }),
  input("Carla López", oct(20), "CONFIRMED", { approvedAmounts: [5000], reason: "Control mensual" }),
  input("Hugo Sosa", oct(16), "CANCELLED", { cancelReason: "Venció el tiempo para pagar la seña" }),
  input("Fabi Gómez", oct(15), "CANCELLED", { cancelReason: "La paciente canceló" }),
  input("Bruno Díaz", oct(13), "NO_SHOW"),
  input("Ana Pérez", oct(6), "COMPLETED", { approvedAmounts: [20000], serviceId: "s2", serviceName: "Antropometría" }),
];

const rows = buildAppointmentListRows(scenario, now, tz, "ARS");
const byName = (first: string) => rows.find((r) => r.patientShortName === first)!;
const visible = (f: Partial<AppointmentListFilters>) =>
  rows.filter((r) => matchesAppointmentFilters(r, { ...DEFAULT_APPOINTMENT_LIST_FILTERS, ...f })).map((r) => r.patientShortName);

describe("buildAppointmentListRows", () => {
  it("keeps every row of the month sorted by start", () => {
    expect(rows.map((r) => r.patientShortName)).toEqual(["Ana", "Bruno", "Fabi", "Hugo", "Carla", "Dora", "Eva"]);
  });

  it("builds an upcoming confirmed row", () => {
    const dora = byName("Dora");
    expect(dora).toMatchObject({
      rowStatus: "upcoming",
      statusLabel: "Pendiente",
      statusNote: null,
      patientLabel: "Dora Paz",
      serviceId: "s2",
      serviceName: "Antropometría",
      dateLabel: "jue 29/10",
      timeLabel: "10:00",
      priceLabel: formatPrice(20000, "ARS"),
      paymentText: "Sin pagos registrados",
      canRegisterPayment: true,
      canClose: false,
    });
  });

  it("marks a past confirmed appointment as unclosed and closable", () => {
    const carla = byName("Carla");
    expect(carla.rowStatus).toBe("unclosed");
    expect(carla.statusLabel).toBe("Sin cerrar");
    expect(carla.canClose).toBe(true);
    expect(carla.paymentText).toBe(`Seña pagada · ${formatPrice(5000, "ARS")}`);
    expect(carla.payment.balance).toBe(15000);
    expect(carla.reason).toBe("Control mensual");
  });

  it("notes the unpaid deposit only on automatic cancellations", () => {
    expect(byName("Hugo")).toMatchObject({ rowStatus: "deposit_unpaid", statusLabel: "Canceló", statusNote: "Seña sin pagar" });
    expect(byName("Fabi")).toMatchObject({ rowStatus: "cancelled", statusLabel: "Canceló", statusNote: null });
    expect(byName("Ana")).toMatchObject({ paymentText: "Pagado", canRegisterPayment: false, canClose: false });
  });

  it("shows free appointments without payment actions", () => {
    const free = buildAppointmentListRows([input("Gala", oct(28), "CONFIRMED", { price: 0 })], now, tz, "ARS")[0]!;
    expect(free).toMatchObject({ priceLabel: "Sin cargo", paymentText: "—", canRegisterPayment: false });
  });

  it("breaks ties at the same time by id", () => {
    const tied = buildAppointmentListRows(
      [input("Zoe", oct(28), "CONFIRMED", { id: "b" }), input("Ana", oct(28), "CONFIRMED", { id: "a" })],
      now,
      tz,
      "ARS",
    );
    expect(tied.map((r) => r.id)).toEqual(["a", "b"]);
  });

  it("derives patient labels, archived flag and searchable phone digits", () => {
    const unnamed = input(null, oct(28), "CONFIRMED", { id: "u" });
    const hidden = input("Lía Mora", oct(28), "CONFIRMED", { id: "h" });
    hidden.patient = { ...hidden.patient, whatsappJid: "123456@lid", archived: true };
    const list = buildAppointmentListRows([unnamed, hidden], now, tz, "ARS");
    const u = list.find((r) => r.id === "u")!;
    const h = list.find((r) => r.id === "h")!;
    expect(u.patientLabel).toBe(patientDisplayName(unnamed.patient));
    expect(u.patientShortName).toBe(u.patientLabel);
    expect(u.phoneDigits).toBe(unnamed.patient.phone);
    expect(u.searchName).toBe("");
    expect(h.patientShortName).toBe("Lía");
    expect(h.searchName).toBe("lia mora");
    expect(h.patientArchived).toBe(true);
    expect(h.phoneDigits).toBeNull();
  });
});

describe("countAppointmentCards", () => {
  it("counts the HU scenario with the default filters", () => {
    const shown = rows.filter((r) => matchesAppointmentFilters(r, DEFAULT_APPOINTMENT_LIST_FILTERS));
    expect(countAppointmentCards(shown)).toEqual({ total: 4, pending: 1, completed: 1, cancelled: 1, unclosed: 1 });
  });

  it("never counts automatic deposit cancellations as cancelled", () => {
    const shown = rows.filter((r) =>
      matchesAppointmentFilters(r, { ...DEFAULT_APPOINTMENT_LIST_FILTERS, status: "cancelled" }),
    );
    expect(countAppointmentCards(shown)).toEqual({ total: 0, pending: 0, completed: 0, cancelled: 1, unclosed: 0 });
  });

  it("returns zeros for an empty month", () => {
    expect(countAppointmentCards([])).toEqual({ total: 0, pending: 0, completed: 0, cancelled: 0, unclosed: 0 });
  });
});

describe("matchesAppointmentFilters", () => {
  it("hides only automatic deposit cancellations by default", () => {
    expect(visible({})).toEqual(["Ana", "Bruno", "Fabi", "Carla", "Dora", "Eva"]);
  });

  it("filters by status", () => {
    expect(visible({ status: "cancelled" })).toEqual(["Fabi", "Hugo"]);
    expect(visible({ status: "unclosed" })).toEqual(["Carla"]);
    expect(visible({ status: "upcoming" })).toEqual(["Dora"]);
    expect(visible({ status: "completed" })).toEqual(["Ana"]);
    expect(visible({ status: "no_show" })).toEqual(["Bruno"]);
    expect(visible({ status: "awaiting_deposit" })).toEqual(["Eva"]);
  });

  it("filters by payment and never lets free rows through a payment filter", () => {
    expect(visible({ payment: "paid" })).toEqual(["Ana"]);
    expect(visible({ payment: "partial" })).toEqual(["Carla"]);
    expect(visible({ payment: "none" })).toEqual(["Bruno", "Fabi", "Dora", "Eva"]);
    const free = buildAppointmentListRows([input("Gala", oct(28), "CONFIRMED", { price: 0 })], now, tz, "ARS")[0]!;
    for (const payment of ["paid", "partial", "none"] as const) {
      expect(matchesAppointmentFilters(free, { ...DEFAULT_APPOINTMENT_LIST_FILTERS, payment })).toBe(false);
    }
    expect(matchesAppointmentFilters(free, DEFAULT_APPOINTMENT_LIST_FILTERS)).toBe(true);
  });

  it("filters by service", () => {
    expect(visible({ serviceId: "s2" })).toEqual(["Ana", "Dora"]);
  });

  it("searches by patient name and phone digits", () => {
    expect(visible({ query: "car" })).toEqual(["Carla"]);
    expect(visible({ query: "  " })).toEqual(["Ana", "Bruno", "Fabi", "Carla", "Dora", "Eva"]);
    const carla = byName("Carla");
    expect(visible({ query: carla.phoneDigits!.slice(-4) })).toEqual(["Carla"]);
  });

  it("combines every filter with AND", () => {
    expect(visible({ serviceId: "s2", status: "upcoming" })).toEqual(["Dora"]);
    expect(visible({ serviceId: "s2", query: "car" })).toEqual([]);
    expect(visible({ status: "cancelled", payment: "none", query: "hugo" })).toEqual(["Hugo"]);
  });
});

describe("filters in the URL", () => {
  it("parses the Spanish URL values", () => {
    expect(parseAppointmentListFilters({ estado: "sin-cerrar", pago: "sin-pagos", servicio: "s1", q: "car" })).toEqual({
      status: "unclosed",
      payment: "none",
      serviceId: "s1",
      query: "car",
    });
  });

  it("falls back to defaults for unknown or missing values", () => {
    expect(parseAppointmentListFilters({ estado: "x", pago: "", servicio: "", q: null })).toEqual(
      DEFAULT_APPOINTMENT_LIST_FILTERS,
    );
    expect(parseAppointmentListFilters({})).toEqual(DEFAULT_APPOINTMENT_LIST_FILTERS);
    expect(DEFAULT_APPOINTMENT_LIST_FILTERS).toEqual({ status: "all", payment: "all", serviceId: null, query: "" });
  });

  it("round-trips every status and payment value", () => {
    const statuses = ["all", "upcoming", "unclosed", "completed", "no_show", "cancelled", "awaiting_deposit"] as const;
    const payments = ["all", "paid", "partial", "none"] as const;
    for (const status of statuses) {
      for (const payment of payments) {
        const f = { ...DEFAULT_APPOINTMENT_LIST_FILTERS, status, payment };
        const params = Object.fromEntries(new URLSearchParams(appointmentListQuery(null, f)));
        expect(parseAppointmentListFilters(params)).toEqual(f);
      }
    }
  });

  it("writes only non-empty params in a fixed order", () => {
    expect(appointmentListQuery(null, DEFAULT_APPOINTMENT_LIST_FILTERS)).toBe("");
    expect(appointmentListQuery("2026-11", DEFAULT_APPOINTMENT_LIST_FILTERS)).toBe("mes=2026-11");
    const q = appointmentListQuery("2026-11", { status: "unclosed", payment: "partial", serviceId: "s1", query: "ana lópez" });
    expect(q).toBe("mes=2026-11&estado=sin-cerrar&pago=con-sena&servicio=s1&q=ana+l%C3%B3pez");
    expect(new URLSearchParams(q).get("q")).toBe("ana lópez");
    expect(appointmentListQuery(null, { ...DEFAULT_APPOINTMENT_LIST_FILTERS, query: "   " })).toBe("");
  });

  it("counts active filters without the search box", () => {
    expect(activeAppointmentFilterCount(DEFAULT_APPOINTMENT_LIST_FILTERS)).toBe(0);
    expect(activeAppointmentFilterCount({ ...DEFAULT_APPOINTMENT_LIST_FILTERS, status: "unclosed", query: "car" })).toBe(1);
    expect(activeAppointmentFilterCount({ status: "cancelled", payment: "none", serviceId: "s1", query: "x" })).toBe(3);
  });
});

describe("APPOINTMENT_LIST_TEXT helpers", () => {
  it("formats the small parametrized texts", () => {
    expect(APPOINTMENT_LIST_TEXT.cards.unclosed(2)).toBe("2 sin cerrar");
    expect(APPOINTMENT_LIST_TEXT.emptyMonth("diciembre")).toBe("No hay turnos en diciembre");
    expect(APPOINTMENT_LIST_TEXT.toast.completed("Carla")).toBe("Turno de Carla marcado como completado");
    expect(APPOINTMENT_LIST_TEXT.filtersLabel(0)).toBe("Filtros");
    expect(APPOINTMENT_LIST_TEXT.filtersLabel(1)).toBe("Filtros, 1 activo");
    expect(APPOINTMENT_LIST_TEXT.filtersLabel(2)).toBe("Filtros, 2 activos");
    expect(APPOINTMENT_LIST_TEXT.count(1)).toBe("1 turno");
    expect(APPOINTMENT_LIST_TEXT.count(12)).toBe("12 turnos");
  });
});
