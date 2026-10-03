import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ get: vi.fn(), search: vi.fn(), createPreference: vi.fn(), prisma: {
  $transaction: vi.fn(), $queryRaw: vi.fn(),
  payment: { create: vi.fn(), findUnique: vi.fn(), findMany: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
  appointment: { findUniqueOrThrow: vi.fn(), updateMany: vi.fn(), findMany: vi.fn() },
  professional: { findUniqueOrThrow: vi.fn(), findUnique: vi.fn() },
  outboundMessage: { createMany: vi.fn() },
} }));
vi.mock("../index", () => ({ prisma: mocks.prisma }));
vi.mock("mercadopago", () => ({
  MercadoPagoConfig: class {}, Preference: class { create = mocks.createPreference; },
  Payment: class { get = mocks.get; search = mocks.search; },
}));
import { createDepositCheckout, expireStalePendingPayments, handleMercadoPagoWebhook, reconcilePendingPayments, syncMercadoPagoPayment } from "./payments";

describe("checkout return URL configuration", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv("MERCADOPAGO_ACCESS_TOKEN", "isolated-test-token");
    vi.stubEnv("AUTH_URL", "http://localhost:3000");
    vi.stubEnv("MERCADOPAGO_RETURN_URL", "https://return.example.test/result");
    vi.stubEnv("MERCADOPAGO_NOTIFICATION_URL", "https://notifications.example.test/api/webhooks/mercadopago");
    mocks.prisma.appointment.findUniqueOrThrow.mockResolvedValue({
      service: { id: "service", name: "Test service", price: 10000, requiresDeposit: true, depositKind: "FIXED", depositValue: 10000 },
    });
    mocks.prisma.professional.findUnique.mockResolvedValue({ currency: "ARS" });
    mocks.prisma.payment.create.mockResolvedValue({ id: "internal" });
    mocks.createPreference.mockResolvedValue({ id: "preference", init_point: "https://checkout.example.test" });
  });
  afterEach(() => vi.unstubAllEnvs());

  it("uses the independent return URL for every outcome and preserves the notification URL", async () => {
    await createDepositCheckout("appointment");
    expect(mocks.createPreference).toHaveBeenCalledWith({ body: expect.objectContaining({
      back_urls: {
        success: "https://return.example.test/result",
        pending: "https://return.example.test/result",
        failure: "https://return.example.test/result",
      },
      notification_url: "https://notifications.example.test/api/webhooks/mercadopago",
      auto_return: "approved",
    }) });
    expect(process.env.AUTH_URL).toBe("http://localhost:3000");
  });

  it.each([undefined, "", "   "])("rejects a missing or blank return URL (%s) before writing data or calling Mercado Pago", async (value) => {
    vi.stubEnv("MERCADOPAGO_RETURN_URL", value);
    await expect(createDepositCheckout("appointment")).rejects.toThrow("Falta MERCADOPAGO_RETURN_URL");
    expect(mocks.prisma.appointment.findUniqueOrThrow).not.toHaveBeenCalled();
    expect(mocks.prisma.payment.create).not.toHaveBeenCalled();
    expect(mocks.createPreference).not.toHaveBeenCalled();
  });
});

describe("payment reconciliation without database or network", () => {
  let payment: any;
  beforeEach(() => {
    vi.resetAllMocks();
    process.env.MERCADOPAGO_ACCESS_TOKEN = "isolated-test-token";
    payment = { id: "internal", provider: "mercadopago", kind: "DEPOSIT", status: "PENDING", paidAt: null,
      appointment: { id: "appointment", status: "AWAITING_PAYMENT", startsAt: new Date("2026-10-01T12:00:00Z"),
        patient: { whatsappJid: "fake", name: "Test", phone: "fake" }, service: { name: "Test service" } } };
    mocks.prisma.$transaction.mockImplementation((fn) => fn(mocks.prisma));
    mocks.prisma.payment.findUnique.mockImplementation(async () => payment);
    mocks.prisma.payment.update.mockImplementation(async ({ data }) => { Object.assign(payment, data); return payment; });
    mocks.prisma.appointment.updateMany.mockResolvedValue({ count: 1 });
    mocks.prisma.professional.findUniqueOrThrow.mockResolvedValue({ timezone: "America/Argentina/Buenos_Aires", phoneJid: "fake-pro" });
    mocks.prisma.professional.findUnique.mockResolvedValue({ timezone: "America/Argentina/Buenos_Aires" });
    mocks.get.mockResolvedValue({ id: 123, external_reference: "internal", status: "approved", date_approved: "2026-10-01T11:00:00Z" });
  });
  it("confirms and enqueues once when webhook and polling repeat approval", async () => {
    await syncMercadoPagoPayment("123");
    await syncMercadoPagoPayment("123");
    expect(payment.status).toBe("APPROVED");
    expect(payment.externalId).toBe("123");
    expect(payment.paidAt).toEqual(new Date("2026-10-01T11:00:00Z"));
    expect(mocks.prisma.appointment.updateMany).toHaveBeenCalledTimes(1);
    expect(mocks.prisma.outboundMessage.createMany).toHaveBeenCalledTimes(2);
    expect(mocks.prisma.$queryRaw).toHaveBeenCalledTimes(2);
  });
  it("does not duplicate messages when a replayed webhook and polling process the same approval", async () => {
    mocks.prisma.payment.findMany.mockResolvedValue([{ id: "internal", externalId: "123" }]);
    await handleMercadoPagoWebhook({ type: "payment", "data.id": "123" });
    await reconcilePendingPayments();
    await handleMercadoPagoWebhook({ type: "payment", "data.id": "123" });
    expect(payment.status).toBe("APPROVED");
    expect(mocks.get).toHaveBeenCalledTimes(3);
    expect(mocks.prisma.appointment.updateMany).toHaveBeenCalledTimes(1);
    expect(mocks.prisma.outboundMessage.createMany).toHaveBeenCalledTimes(2);
  });
  it("does not enqueue for a payment already approved", async () => {
    payment.status = "APPROVED";
    await syncMercadoPagoPayment("123");
    expect(mocks.prisma.outboundMessage.createMany).not.toHaveBeenCalled();
  });
  it("does not regress an approved payment due to an older pending response", async () => {
    payment.status = "APPROVED";
    mocks.get.mockResolvedValue({ id: 123, external_reference: "internal", status: "pending" });
    await syncMercadoPagoPayment("123");
    expect(mocks.prisma.payment.update).not.toHaveBeenCalled();
  });
  it("does not confirm a full payment", async () => {
    payment.kind = "FULL";
    await syncMercadoPagoPayment("123");
    expect(payment.status).toBe("APPROVED");
    expect(mocks.prisma.appointment.updateMany).not.toHaveBeenCalled();
  });
  it("keeps pending status without enqueuing", async () => {
    mocks.get.mockResolvedValue({ id: 123, external_reference: "internal", status: "in_process" });
    await syncMercadoPagoPayment("123");
    expect(payment.status).toBe("PENDING");
    expect(payment.paidAt).toBeNull();
    expect(mocks.prisma.outboundMessage.createMany).not.toHaveBeenCalled();
  });
  it("does not confirm a cancelled appointment", async () => {
    payment.appointment.status = "CANCELLED";
    await syncMercadoPagoPayment("123");
    expect(mocks.prisma.appointment.updateMany).not.toHaveBeenCalled();
  });
  it("does not enqueue if another operation changed the appointment", async () => {
    mocks.prisma.appointment.updateMany.mockResolvedValue({ count: 0 });
    await syncMercadoPagoPayment("123");
    expect(mocks.prisma.outboundMessage.createMany).not.toHaveBeenCalled();
  });
  it("rejects a mismatched external reference", async () => {
    await syncMercadoPagoPayment("123", "other");
    expect(mocks.prisma.payment.update).not.toHaveBeenCalled();
  });
  it("finds payments by external_reference before externalId is known", async () => {
    mocks.prisma.payment.findMany.mockResolvedValue([{ id: "internal", preferenceId: "preference" }]);
    mocks.search.mockResolvedValue({ results: [{ id: 123 }], paging: { total: 1 } });
    expect(await reconcilePendingPayments()).toEqual({ processed: 1, failed: 0 });
    expect(mocks.search.mock.calls[0]?.[0].options.external_reference).toBe("internal");
    expect(mocks.get).toHaveBeenCalledWith({ id: "123" });
  });
  it("continues after one payment fails", async () => {
    mocks.prisma.payment.findMany.mockResolvedValue([{ id: "broken", externalId: "bad" }, { id: "internal", externalId: "123" }]);
    mocks.get.mockRejectedValueOnce(new Error("offline"));
    const onError = vi.fn();
    expect(await reconcilePendingPayments(onError)).toEqual({ processed: 1, failed: 1 });
    expect(onError).toHaveBeenCalledWith("broken");
    expect(payment.status).toBe("APPROVED");
  });
  it("paginates searches and scopes sandbox polling to owned ids", async () => {
    mocks.prisma.payment.findMany.mockResolvedValue([{ id: "internal", preferenceId: "preference" }]);
    mocks.search.mockResolvedValueOnce({ results: [{ id: 122 }], paging: { total: 2 } })
      .mockResolvedValueOnce({ results: [{ id: 123 }], paging: { total: 2 } });
    await reconcilePendingPayments(undefined, ["internal"]);
    expect(mocks.search.mock.calls[1]?.[0].options.offset).toBe(1);
    expect(mocks.prisma.payment.findMany.mock.calls[0]?.[0].where.id).toEqual({ in: ["internal"] });
  });
  it("does not expire or notify when a concurrent approval already confirmed the appointment", async () => {
    mocks.prisma.appointment.findMany.mockResolvedValue([payment.appointment]);
    mocks.prisma.appointment.updateMany.mockResolvedValue({ count: 0 });
    expect(await expireStalePendingPayments()).toBe(0);
    expect(mocks.prisma.payment.updateMany).not.toHaveBeenCalled();
    expect(mocks.prisma.outboundMessage.createMany).not.toHaveBeenCalled();
  });
  // HU-013 (D7): la alerta del pago aprobado lleva el motivo; la confirmación al paciente no.
  const enqueuedBodies = () => {
    const rows = mocks.prisma.outboundMessage.createMany.mock.calls.flatMap((c: any[]) => c[0].data);
    return {
      alert: rows.find((r: any) => r.kind === "PROFESSIONAL_ALERT")?.body as string,
      confirmation: rows.find((r: any) => r.kind === "CONFIRMATION")?.body as string,
    };
  };
  it("includes the booking reason in the professional alert when the deposit is approved", async () => {
    payment.appointment.reason = "Quiero bajar de peso";
    await syncMercadoPagoPayment("123");
    expect(mocks.prisma.outboundMessage.createMany).toHaveBeenCalledTimes(2);
    const { alert, confirmation } = enqueuedBodies();
    expect(alert).toContain("📝 Motivo: Quiero bajar de peso");
    expect(confirmation).toBeDefined();
    expect(confirmation).not.toContain("Motivo");
  });
  it("keeps the professional alert without a reason line when there is no reason", async () => {
    payment.appointment.reason = null;
    await syncMercadoPagoPayment("123");
    const { alert } = enqueuedBodies();
    expect(alert).toBeDefined();
    expect(alert).not.toContain("Motivo");
  });
  it("truncates a long booking reason in the professional alert", async () => {
    payment.appointment.reason = "Necesito un plan. ".repeat(17).slice(0, 300);
    await syncMercadoPagoPayment("123");
    const { alert } = enqueuedBodies();
    expect(alert).toContain("(completo en el panel)");
    expect(alert).not.toContain(payment.appointment.reason);
  });
});
