import { describe, expect, it } from "vitest";
import {
  APPOINTMENT_LIST_TEXT,
  appointmentPaymentText,
  appointmentRowStatus,
  canRegisterAppointmentPayment,
  isUnpaidDepositCancellation,
  summarizeAppointmentPayments,
} from "./appointment-list";
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
