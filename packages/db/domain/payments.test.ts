import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ get: vi.fn(), search: vi.fn(), createPreference: vi.fn(),
  getMercadoPagoCredentials: vi.fn(), markMercadoPagoAccountError: vi.fn(), resolveMercadoPagoWebhookTenant: vi.fn(), prisma: {
  $transaction: vi.fn(), $queryRaw: vi.fn(),
  payment: { create: vi.fn(), findUnique: vi.fn(), findMany: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
  appointment: { findUniqueOrThrow: vi.fn(), findUnique: vi.fn(), updateMany: vi.fn(), findMany: vi.fn() },
  agenda: { findFirst: vi.fn() },
  professional: { findUniqueOrThrow: vi.fn(), findUnique: vi.fn() },
  outboundMessage: { createMany: vi.fn() },
} }));
vi.mock("../index", () => ({ prisma: mocks.prisma }));
// HU-023: el token sale de la cuenta vinculada; acá se mockea el resolvedor (sin base ni red).
vi.mock("./mercadopagoAccount", () => ({
  getMercadoPagoCredentials: mocks.getMercadoPagoCredentials,
  markMercadoPagoAccountError: mocks.markMercadoPagoAccountError,
  resolveMercadoPagoWebhookTenant: mocks.resolveMercadoPagoWebhookTenant,
  MercadoPagoUnavailableError: class MercadoPagoUnavailableError extends Error {},
}));
const CREDS = { accessToken: "isolated-test-token", sellerUserId: "seller-1", source: "account" as const };
vi.mock("mercadopago", () => ({
  MercadoPagoConfig: class {}, Preference: class { create = mocks.createPreference; },
  Payment: class { get = mocks.get; search = mocks.search; },
}));
const T = { tenantId: "legacy-tenant" };
/** Agenda principal del consultorio (lo que lee resolveTenantSchedulingContext). */
const primaryAgenda = (professional: unknown) => ({ id: "legacy-agenda", tenantId: "legacy-tenant", professionalId: 1, professional });
import { createDepositCheckout, expireStalePendingPayments, handleMercadoPagoWebhook, reconcilePendingPayments, syncMercadoPagoPayment } from "./payments";

describe("checkout return URL configuration and legacy ownership", () => {
  const scope = { tenantId: "legacy-tenant", agendaId: "legacy-agenda" };
  const reservation = { id: "appointment", ...scope, patientId: "patient", serviceId: "service" };
  const scopedReservation = { ...reservation, tenantPatient: { isNot: null }, tenantService: { isNot: null } };
  const awaiting = { ...scopedReservation, status: "AWAITING_PAYMENT" };
  const verifiedRelations = { tenantPatient: { id: "patient" }, agenda: { professional: { currency: "ARS" } } };
  const fixture = () => {
    const service = { id: "service", name: "Test service", price: 10000, requiresDeposit: true, depositKind: "FIXED", depositValue: 10000 };
    return { ...reservation, status: "AWAITING_PAYMENT", createdAt: new Date("2026-10-02T12:00:00Z"), service, tenantService: service, ...verifiedRelations };
  };
  const expectNoCheckoutSideEffects = () => {
    expect(mocks.getMercadoPagoCredentials).not.toHaveBeenCalled();
    expect(mocks.createPreference).not.toHaveBeenCalled();
    expect(mocks.markMercadoPagoAccountError).not.toHaveBeenCalled();
    expect(mocks.prisma.payment.create).not.toHaveBeenCalled();
    expect(mocks.prisma.payment.update).not.toHaveBeenCalled();
    expect(mocks.prisma.appointment.updateMany).not.toHaveBeenCalled();
    expect(mocks.prisma.payment.updateMany).not.toHaveBeenCalled();
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
    expect(mocks.prisma.outboundMessage.createMany).not.toHaveBeenCalled();
  };

  beforeEach(() => {
    vi.resetAllMocks();
    mocks.getMercadoPagoCredentials.mockResolvedValue(CREDS);
    mocks.markMercadoPagoAccountError.mockResolvedValue(undefined);
    mocks.resolveMercadoPagoWebhookTenant.mockResolvedValue(T);
    vi.stubEnv("AUTH_URL", "http://localhost:3000");
    vi.stubEnv("MERCADOPAGO_RETURN_URL", "https://return.example.test/result");
    vi.stubEnv("MERCADOPAGO_NOTIFICATION_URL", "https://notifications.example.test/api/webhooks/mercadopago");
    const appointment = fixture();
    mocks.prisma.appointment.findUniqueOrThrow.mockResolvedValue(appointment);
    mocks.prisma.appointment.findUnique.mockResolvedValue(appointment);
    mocks.prisma.agenda.findFirst.mockResolvedValue(primaryAgenda({}));
    mocks.prisma.$queryRaw.mockResolvedValue([{ id: "appointment" }]);
    mocks.prisma.professional.findUnique.mockResolvedValue({ currency: "ARS" });
    mocks.prisma.payment.create.mockResolvedValue({ id: "internal" });
    mocks.createPreference.mockResolvedValue({ id: "preference", init_point: "https://checkout.example.test" });
    mocks.prisma.$transaction.mockImplementation((fn) => fn(mocks.prisma));
    mocks.prisma.appointment.updateMany.mockResolvedValue({ count: 1 });
  });
  afterEach(() => vi.unstubAllEnvs());

  it("fails closed if the original agenda cannot be verified", async () => {
    mocks.prisma.agenda.findFirst.mockResolvedValue(null);
    await expect(createDepositCheckout(T, "appointment")).rejects.toThrow("tenant_scope:tenant_scope_missing");
    expect(mocks.prisma.appointment.findUnique).not.toHaveBeenCalled();
    expectNoCheckoutSideEffects();
  });

  it.each([
    null,
    { tenantId: "other-tenant", agendaId: "other-agenda" },
    { agendaId: "other-agenda" },
    { tenantId: null, agendaId: null },
    { tenantPatient: null },
    { tenantService: null },
  ])("rejects unresolved or foreign appointment/relations (%j) without side effects", async (override) => {
    const row = override && { ...fixture(), ...override };
    mocks.prisma.appointment.findUniqueOrThrow.mockResolvedValue(row);
    mocks.prisma.appointment.findUnique.mockImplementation(async ({ where }) =>
      row && row.id === where.id && row.tenantId === where.tenantId && row.agendaId === where.agendaId ? row : null);
    await expect(createDepositCheckout(T, "appointment")).rejects.toThrow("No se pudo verificar el turno del consultorio.");
    expectNoCheckoutSideEffects();
  });

  it("does not create a payment or preference if the appointment cannot be locked after credential resolution", async () => {
    mocks.getMercadoPagoCredentials.mockImplementation(async () => {
      mocks.prisma.$queryRaw.mockResolvedValue([]);
      mocks.prisma.appointment.updateMany.mockResolvedValue({ count: 0 });
      return CREDS;
    });
    await expect(createDepositCheckout(T, "appointment")).rejects.toThrow("No se pudo verificar el turno del consultorio.");
    expect(mocks.prisma.payment.create).not.toHaveBeenCalled();
    expect(mocks.createPreference).not.toHaveBeenCalled();
    expect(mocks.prisma.payment.update).not.toHaveBeenCalled();
    expect(mocks.prisma.appointment.updateMany).not.toHaveBeenCalled();
    expect(mocks.prisma.payment.updateMany).not.toHaveBeenCalled();
  });

  it("does not persist or return a preference if ownership changes during the provider request", async () => {
    mocks.createPreference.mockImplementation(async () => {
      mocks.prisma.$queryRaw.mockResolvedValue([]);
      return { id: "preference", init_point: "https://checkout.example.test" };
    });
    await expect(createDepositCheckout(T, "appointment")).rejects.toThrow("No se pudo verificar el turno del consultorio.");
    expect(mocks.prisma.payment.create).toHaveBeenCalledTimes(1);
    expect(mocks.createPreference).toHaveBeenCalledTimes(1);
    expect(mocks.prisma.payment.update).not.toHaveBeenCalled();
    expect(mocks.prisma.appointment.updateMany).not.toHaveBeenCalled();
    expect(mocks.prisma.payment.updateMany).not.toHaveBeenCalled();
  });

  it("uses the independent return URL and preserves the exact notification URL", async () => {
    await createDepositCheckout(T, "appointment");
    expect(mocks.createPreference).toHaveBeenCalledWith({ body: expect.objectContaining({
      back_urls: {
        success: "https://return.example.test/result",
        pending: "https://return.example.test/result",
        failure: "https://return.example.test/result",
      },
      auto_return: "approved",
      notification_url: "https://notifications.example.test/api/webhooks/mercadopago",
      expires: true,
      expiration_date_to: "2026-10-02T12:15:00.000Z",
    }) });
    expect(mocks.prisma.agenda.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { tenantId: scope.tenantId, isPrimary: true },
    }));
    expect(mocks.createPreference.mock.calls[0]?.[0].body.items[0].currency_id).toBe("ARS");
    expect(mocks.prisma.payment.update).toHaveBeenCalledWith({
      where: { id: "internal", appointmentId: "appointment", status: "PENDING", appointment: awaiting },
      data: { preferenceId: "preference", checkoutUrl: "https://checkout.example.test" },
    });
    expect(process.env.AUTH_URL).toBe("http://localhost:3000");
  });
  it("creates checkout without a notification URL environment variable", async () => {
    vi.stubEnv("MERCADOPAGO_NOTIFICATION_URL", undefined);
    await expect(createDepositCheckout(T, "appointment")).resolves.toEqual({ amount: 10000, paymentId: "internal", checkoutUrl: "https://checkout.example.test" });
    expect(mocks.createPreference.mock.calls[0]?.[0].body).toHaveProperty("notification_url", undefined);
  });
  it.each(["PERCENT", "FIXED"])("uses the configured %s amount", async (depositKind) => {
    const appointment = await mocks.prisma.appointment.findUnique();
    appointment.tenantService.depositKind = depositKind;
    appointment.tenantService.depositValue = depositKind === "PERCENT" ? 30 : 2500;
    const amount = depositKind === "PERCENT" ? 3000 : 2500;
    await expect(createDepositCheckout(T, "appointment")).resolves.toEqual({ amount, paymentId: "internal", checkoutUrl: "https://checkout.example.test" });
    expect(mocks.prisma.payment.create).toHaveBeenCalledWith({ data: { appointmentId: "appointment", kind: "DEPOSIT", status: "PENDING", amount, mercadopagoUserId: "seller-1" } });
  });

  it.each(["api-error", "missing-link", "no-credentials", "invalid-deposit"])("releases the reservation after %s", async (failure) => {
    if (failure === "api-error") mocks.createPreference.mockRejectedValue(new Error("offline"));
    if (failure === "missing-link") mocks.createPreference.mockResolvedValue({ id: "preference" });
    if (failure === "no-credentials") mocks.getMercadoPagoCredentials.mockResolvedValue(null);
    if (failure === "invalid-deposit") {
      const appointment = await mocks.prisma.appointment.findUnique();
      appointment.tenantService.depositValue = NaN;
    }
    await expect(createDepositCheckout(T, "appointment")).rejects.toThrow();
    expect(mocks.prisma.appointment.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: awaiting, data: expect.objectContaining({ status: "CANCELLED" }),
    }));
    expect(mocks.prisma.payment.updateMany).toHaveBeenCalledWith({ where: { appointmentId: "appointment", status: "PENDING", appointment: scopedReservation }, data: { status: "CANCELLED" } });
    if (["no-credentials", "invalid-deposit"].includes(failure)) expect(mocks.prisma.payment.create).not.toHaveBeenCalled();
  });

  it("sin credenciales tira MercadoPagoUnavailableError y no llama a Mercado Pago", async () => {
    mocks.getMercadoPagoCredentials.mockResolvedValue(null);
    const error = await createDepositCheckout(T, "appointment").catch((e: unknown) => e);
    expect((error as Error).message).toBe("No hay cuenta de Mercado Pago usable");
    expect(error?.constructor?.name).toBe("MercadoPagoUnavailableError");
    expect(mocks.createPreference).not.toHaveBeenCalled();
    expect(mocks.getMercadoPagoCredentials).toHaveBeenCalledWith(T, { kind: "current" });
  });

  it("401 de Mercado Pago al crear la preferencia marca la cuenta como revocada y libera la reserva", async () => {
    mocks.createPreference.mockRejectedValue({ status: 401, error: "unauthorized" });
    await expect(createDepositCheckout(T, "appointment")).rejects.toEqual({ status: 401, error: "unauthorized" });
    expect(mocks.markMercadoPagoAccountError).toHaveBeenCalledWith(T, "revoked");
    expect(mocks.prisma.appointment.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: awaiting, data: expect.objectContaining({ status: "CANCELLED" }),
    }));
  });

  it("500 de Mercado Pago no marca la cuenta", async () => {
    mocks.createPreference.mockRejectedValue({ status: 500 });
    await expect(createDepositCheckout(T, "appointment")).rejects.toEqual({ status: 500 });
    expect(mocks.markMercadoPagoAccountError).not.toHaveBeenCalled();
  });

  it("con el token de respaldo de dev no marca la cuenta aunque MP responda 401", async () => {
    mocks.getMercadoPagoCredentials.mockResolvedValue({ accessToken: "env", sellerUserId: null, source: "env_fallback" });
    mocks.createPreference.mockRejectedValue({ status: 401 });
    await expect(createDepositCheckout(T, "appointment")).rejects.toEqual({ status: 401 });
    expect(mocks.markMercadoPagoAccountError).not.toHaveBeenCalled();
    expect(mocks.prisma.payment.create).toHaveBeenCalledWith({ data: expect.objectContaining({ mercadopagoUserId: null }) });
  });

  it("does not cancel payments if concurrent approval already confirmed the appointment", async () => {
    mocks.createPreference.mockRejectedValue(new Error("offline"));
    mocks.prisma.appointment.updateMany.mockResolvedValue({ count: 0 });
    await expect(createDepositCheckout(T, "appointment")).rejects.toThrow("offline");
    expect(mocks.prisma.payment.updateMany).not.toHaveBeenCalled();
  });

  it.each([undefined, "", "   "])("rejects a missing or blank return URL (%s) and releases only the verified reservation", async (value) => {
    vi.stubEnv("MERCADOPAGO_RETURN_URL", value);
    await expect(createDepositCheckout(T, "appointment")).rejects.toThrow("Falta MERCADOPAGO_RETURN_URL");
    expect(mocks.getMercadoPagoCredentials).not.toHaveBeenCalled();
    expect(mocks.prisma.payment.create).not.toHaveBeenCalled();
    expect(mocks.createPreference).not.toHaveBeenCalled();
    expect(mocks.prisma.appointment.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: awaiting }));
  });
});

describe("payment reconciliation without database or network", () => {
  const scope = { tenantId: "legacy-tenant", agendaId: "legacy-agenda" };
  const ownership = { ...scope, tenantPatient: { isNot: null }, tenantService: { isNot: null } };
  const appointmentKey = { id: "appointment", patientId: "patient", serviceId: "service" };
  const awaiting = { ...appointmentKey, ...ownership, status: "AWAITING_PAYMENT" };
  let payment: any;

  function matchesOwnership(where: any, appointment: any) {
    return appointment && (where?.tenantId === undefined || where.tenantId === appointment.tenantId)
      && (where?.agendaId === undefined || where.agendaId === appointment.agendaId)
      && (where?.tenantPatient?.isNot !== null || !!appointment.tenantPatient)
      && (where?.tenantService?.isNot !== null || !!appointment.tenantService);
  }

  function expectNoMutations() {
    expect(mocks.prisma.payment.update).not.toHaveBeenCalled();
    expect(mocks.prisma.payment.updateMany).not.toHaveBeenCalled();
    expect(mocks.prisma.appointment.updateMany).not.toHaveBeenCalled();
    expect(mocks.prisma.outboundMessage.createMany).not.toHaveBeenCalled();
  }
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.getMercadoPagoCredentials.mockResolvedValue(CREDS);
    mocks.markMercadoPagoAccountError.mockResolvedValue(undefined);
    mocks.resolveMercadoPagoWebhookTenant.mockResolvedValue(T);
    payment = { id: "internal", provider: "mercadopago", kind: "DEPOSIT", status: "PENDING", paidAt: null,
      appointment: { ...appointmentKey, ...scope, status: "AWAITING_PAYMENT", startsAt: new Date("2026-10-01T12:00:00Z"),
        patient: { whatsappJid: "fake", name: "Test", phone: "fake" }, service: { name: "Test service" },
        tenantPatient: { whatsappJid: "fake", name: "Test", phone: "fake" }, tenantService: { name: "Test service" } } };
    mocks.prisma.agenda.findFirst.mockResolvedValue(primaryAgenda({ timezone: "America/Argentina/Buenos_Aires", phoneJid: "fake-pro" }));
    mocks.prisma.$queryRaw.mockResolvedValue([{ id: "internal" }]);
    mocks.prisma.$transaction.mockImplementation((fn) => fn(mocks.prisma));
    mocks.prisma.payment.findUnique.mockImplementation(async ({ where }) => matchesOwnership(where.appointment, payment?.appointment) ? payment : null);
    mocks.prisma.payment.update.mockImplementation(async ({ data }) => { Object.assign(payment, data); return payment; });
    mocks.prisma.appointment.updateMany.mockResolvedValue({ count: 1 });
    mocks.prisma.professional.findUniqueOrThrow.mockResolvedValue({ timezone: "America/Argentina/Buenos_Aires", phoneJid: "fake-pro" });
    mocks.prisma.professional.findUnique.mockResolvedValue({ timezone: "America/Argentina/Buenos_Aires" });
    mocks.get.mockResolvedValue({ id: 123, external_reference: "internal", status: "approved", date_approved: "2026-10-01T11:00:00Z" });
  });
  it.each([
    { tenantId: "other-tenant", agendaId: "other-agenda" },
    { agendaId: "other-agenda" },
    { tenantId: null, agendaId: null },
    { tenantPatient: null },
    { tenantService: null },
  ])("leaves ineligible targets untouched across all payment maintenance (%j)", async (override) => {
    Object.assign(payment.appointment, override);
    const snapshot = structuredClone(payment);
    payment.externalId = "123";
    mocks.prisma.payment.findMany.mockImplementation(async ({ where }) => matchesOwnership(where.appointment, payment.appointment) ? [payment] : []);
    mocks.prisma.appointment.findMany.mockImplementation(async ({ where }) => matchesOwnership(where, payment.appointment) ? [payment.appointment] : []);

    await expect(handleMercadoPagoWebhook({ type: "payment", "data.id": "123" })).resolves.toBeUndefined();
    expect(mocks.get).toHaveBeenCalledTimes(1);
    expect(mocks.get).toHaveBeenCalledWith({ id: "123" });
    expectNoMutations();
    const onError = vi.fn();
    await expect(reconcilePendingPayments(T, onError, [payment.id])).resolves.toEqual({ processed: 0, failed: 0, skipped: 0 });
    await expect(expireStalePendingPayments(T)).resolves.toBe(0);
    expect(mocks.get).toHaveBeenCalledTimes(1);
    expect(mocks.search).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
    expectNoMutations();
    expect(payment).toEqual({ ...snapshot, externalId: "123" });
  });

  it("fails closed before payment or provider work when the original agenda is unavailable", async () => {
    mocks.prisma.agenda.findFirst.mockResolvedValue(null);
    const error = "tenant_scope:tenant_scope_missing";
    await expect(handleMercadoPagoWebhook({ type: "payment", "data.id": "123" })).rejects.toThrow(error);
    await expect(reconcilePendingPayments(T)).rejects.toThrow(error);
    await expect(expireStalePendingPayments(T)).rejects.toThrow(error);
    expect(mocks.getMercadoPagoCredentials).not.toHaveBeenCalled();
    expect(mocks.get).not.toHaveBeenCalled();
    expect(mocks.search).not.toHaveBeenCalled();
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
    expectNoMutations();
  });

  it("ignores a provider-verified reference without a local payment", async () => {
    mocks.prisma.$queryRaw.mockResolvedValue([]);
    await expect(handleMercadoPagoWebhook({ type: "payment", "data.id": "123" })).resolves.toBeUndefined();
    expect(mocks.get).toHaveBeenCalledWith({ id: "123" });
    expectNoMutations();
  });

  it("leaves the payment untouched if the appointment no longer matches at lock time", async () => {
    mocks.prisma.$queryRaw.mockResolvedValueOnce([{ id: "internal" }]).mockResolvedValueOnce([]);
    await syncMercadoPagoPayment(T, "123");
    expect(payment.status).toBe("PENDING");
    expectNoMutations();
  });

  it("confirms and enqueues once when webhook and polling repeat approval", async () => {
    await syncMercadoPagoPayment(T, "123");
    await syncMercadoPagoPayment(T, "123");
    expect(payment.status).toBe("APPROVED");
    expect(payment.externalId).toBe("123");
    expect(payment.paidAt).toEqual(new Date("2026-10-01T11:00:00Z"));
    expect(mocks.prisma.appointment.updateMany).toHaveBeenCalledTimes(1);
    expect(mocks.prisma.outboundMessage.createMany).toHaveBeenCalledTimes(2);
    expect(mocks.prisma.$queryRaw).toHaveBeenCalledTimes(4);
    const [paymentLock, appointmentLock] = mocks.prisma.$queryRaw.mock.calls;
    expect(paymentLock?.[0].join("")).toContain('FROM "Payment"');
    expect(appointmentLock?.[0].join("")).toContain('FROM "Appointment"');
    expect(mocks.prisma.appointment.updateMany).toHaveBeenCalledWith({ where: awaiting, data: { status: "CONFIRMED", needsGoogleSync: true, bookedAt: expect.any(Date) } });
    expect(mocks.prisma.outboundMessage.createMany).toHaveBeenNthCalledWith(1, { skipDuplicates: true, data: [expect.objectContaining({ tenantId: scope.tenantId, toJid: "fake", kind: "CONFIRMATION" })] });
    expect(mocks.prisma.outboundMessage.createMany).toHaveBeenNthCalledWith(2, { skipDuplicates: true, data: [expect.objectContaining({ tenantId: scope.tenantId, toJid: "fake-pro", kind: "PROFESSIONAL_ALERT" })] });
  });
  it("does not duplicate messages when a replayed webhook and polling process the same approval", async () => {
    mocks.prisma.payment.findMany.mockResolvedValue([{ id: "internal", externalId: "123" }]);
    await handleMercadoPagoWebhook({ type: "payment", "data.id": "123" });
    await reconcilePendingPayments(T);
    await handleMercadoPagoWebhook({ type: "payment", "data.id": "123" });
    expect(payment.status).toBe("APPROVED");
    expect(mocks.get).toHaveBeenCalledTimes(3);
    expect(mocks.prisma.appointment.updateMany).toHaveBeenCalledTimes(1);
    expect(mocks.prisma.outboundMessage.createMany).toHaveBeenCalledTimes(2);
  });
  it("does not enqueue for a payment already approved", async () => {
    payment.status = "APPROVED";
    await syncMercadoPagoPayment(T, "123");
    expect(mocks.prisma.outboundMessage.createMany).not.toHaveBeenCalled();
  });
  it("does not regress an approved payment due to an older pending response", async () => {
    payment.status = "APPROVED";
    mocks.get.mockResolvedValue({ id: 123, external_reference: "internal", status: "pending" });
    await syncMercadoPagoPayment(T, "123");
    expect(mocks.prisma.payment.update).not.toHaveBeenCalled();
  });
  it("does not confirm a full payment", async () => {
    payment.kind = "FULL";
    await syncMercadoPagoPayment(T, "123");
    expect(payment.status).toBe("APPROVED");
    expect(mocks.prisma.appointment.updateMany).not.toHaveBeenCalled();
  });
  it("keeps pending status without enqueuing", async () => {
    mocks.get.mockResolvedValue({ id: 123, external_reference: "internal", status: "in_process" });
    await syncMercadoPagoPayment(T, "123");
    expect(payment.status).toBe("PENDING");
    expect(payment.paidAt).toBeNull();
    expect(mocks.prisma.outboundMessage.createMany).not.toHaveBeenCalled();
  });
  it("does not confirm a cancelled appointment", async () => {
    payment.appointment.status = "CANCELLED";
    await syncMercadoPagoPayment(T, "123");
    expect(mocks.prisma.appointment.updateMany).not.toHaveBeenCalled();
  });
  it("does not enqueue if another operation changed the appointment", async () => {
    mocks.prisma.appointment.updateMany.mockResolvedValue({ count: 0 });
    await syncMercadoPagoPayment(T, "123");
    expect(mocks.prisma.outboundMessage.createMany).not.toHaveBeenCalled();
  });
  it("rejects a mismatched external reference", async () => {
    await syncMercadoPagoPayment(T, "123", "other");
    expect(mocks.prisma.payment.update).not.toHaveBeenCalled();
  });
  it("confirms through polling when the Webhook is absent and ignores a later approval replay", async () => {
    mocks.prisma.payment.findMany.mockResolvedValue([{ id: "internal", preferenceId: "preference" }]);
    mocks.search.mockResolvedValue({ results: [{ id: 123 }], paging: { total: 1 } });
    expect(await reconcilePendingPayments(T)).toEqual({ processed: 1, failed: 0, skipped: 0 });
    expect(mocks.search.mock.calls[0]?.[0].options.external_reference).toBe("internal");
    expect(mocks.get).toHaveBeenCalledWith({ id: "123" });
    expect(payment.status).toBe("APPROVED");
    expect(mocks.prisma.appointment.updateMany).toHaveBeenCalledWith({ where: awaiting, data: { status: "CONFIRMED", needsGoogleSync: true, bookedAt: expect.any(Date) } });
    expect(mocks.prisma.outboundMessage.createMany).toHaveBeenCalledTimes(2);
    await handleMercadoPagoWebhook({ type: "payment", "data.id": "123" });
    expect(mocks.prisma.appointment.updateMany).toHaveBeenCalledTimes(1);
    expect(mocks.prisma.outboundMessage.createMany).toHaveBeenCalledTimes(2);
  });
  it("continues after one payment fails", async () => {
    mocks.prisma.payment.findMany.mockResolvedValue([{ id: "broken", externalId: "bad" }, { id: "internal", externalId: "123" }]);
    mocks.get.mockRejectedValueOnce(new Error("offline"));
    const onError = vi.fn();
    expect(await reconcilePendingPayments(T, onError)).toEqual({ processed: 1, failed: 1, skipped: 0 });
    expect(onError).toHaveBeenCalledWith("broken");
    expect(payment.status).toBe("APPROVED");
  });
  it("paginates searches and scopes sandbox polling to owned ids", async () => {
    mocks.prisma.payment.findMany.mockResolvedValue([{ id: "internal", preferenceId: "preference" }]);
    mocks.search.mockResolvedValueOnce({ results: [{ id: 122 }], paging: { total: 2 } })
      .mockResolvedValueOnce({ results: [{ id: 123 }], paging: { total: 2 } });
    await reconcilePendingPayments(T, undefined, ["internal"]);
    expect(mocks.search.mock.calls[1]?.[0].options.offset).toBe(1);
    expect(mocks.prisma.payment.findMany.mock.calls[0]?.[0].where.id).toEqual({ in: ["internal"] });
  });
  it("does not expire or notify when a concurrent approval already confirmed the appointment", async () => {
    mocks.prisma.appointment.findMany.mockResolvedValue([payment.appointment]);
    mocks.prisma.appointment.updateMany.mockResolvedValue({ count: 0 });
    expect(await expireStalePendingPayments(T)).toBe(0);
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
    await syncMercadoPagoPayment(T, "123");
    expect(mocks.prisma.outboundMessage.createMany).toHaveBeenCalledTimes(2);
    const { alert, confirmation } = enqueuedBodies();
    expect(alert).toContain("📝 Motivo: Quiero bajar de peso");
    expect(confirmation).toBeDefined();
    expect(confirmation).not.toContain("Motivo");
  });
  it("keeps the professional alert without a reason line when there is no reason", async () => {
    payment.appointment.reason = null;
    await syncMercadoPagoPayment(T, "123");
    const { alert } = enqueuedBodies();
    expect(alert).toBeDefined();
    expect(alert).not.toContain("Motivo");
  });
  it("truncates a long booking reason in the professional alert", async () => {
    payment.appointment.reason = "Necesito un plan. ".repeat(17).slice(0, 300);
    await syncMercadoPagoPayment(T, "123");
    const { alert } = enqueuedBodies();
    expect(alert).toContain("(completo en el panel)");
    expect(alert).not.toContain(payment.appointment.reason);
  });
  // HU-014 (D5): la aprobación de la seña es la reserva en firme.
  it("seals bookedAt when the deposit approval confirms the appointment", async () => {
    const before = Date.now();
    await syncMercadoPagoPayment(T, "123");
    expect(mocks.prisma.appointment.updateMany).toHaveBeenCalledTimes(1);
    const { where, data } = mocks.prisma.appointment.updateMany.mock.calls[0]![0];
    expect(where).toEqual(awaiting);
    expect(data.status).toBe("CONFIRMED");
    expect(data.needsGoogleSync).toBe(true);
    expect(data.bookedAt).toBeInstanceOf(Date);
    expect(data.bookedAt.getTime()).toBeGreaterThanOrEqual(before);
  });
  it("expires pending payments, releases the slot and notifies once", async () => {
    mocks.prisma.appointment.findMany.mockResolvedValue([payment.appointment]);
    expect(await expireStalePendingPayments(T)).toBe(1);
    expect(mocks.prisma.appointment.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { ...awaiting, createdAt: { lt: expect.any(Date) } }, data: expect.objectContaining({ status: "CANCELLED" }),
    }));
    expect(mocks.prisma.payment.updateMany).toHaveBeenCalledWith({ where: { appointmentId: "appointment", status: "PENDING", appointment: { ...appointmentKey, ...ownership } }, data: { status: "EXPIRED" } });
    expect(mocks.prisma.outboundMessage.createMany).toHaveBeenCalledWith(expect.objectContaining({ data: [expect.objectContaining({ tenantId: scope.tenantId, toJid: "fake", kind: "CANCELLATION", appointmentId: "appointment" })] }));
    mocks.prisma.appointment.updateMany.mockResolvedValue({ count: 0 });
    expect(await expireStalePendingPayments(T)).toBe(0);
    expect(mocks.prisma.outboundMessage.createMany).toHaveBeenCalledTimes(1);
  });
  it("serializes concurrent webhook and polling approvals", async () => {
    let previous = Promise.resolve();
    mocks.prisma.$transaction.mockImplementation((fn) => {
      const next = previous.then(() => fn(mocks.prisma));
      previous = next;
      return next;
    });
    await Promise.all([syncMercadoPagoPayment(T, "123"), syncMercadoPagoPayment(T, "123")]);
    expect(mocks.prisma.appointment.updateMany).toHaveBeenCalledTimes(1);
    expect(mocks.prisma.outboundMessage.createMany).toHaveBeenCalledTimes(2);
  });
  // HU-023: credenciales por cuenta.
  it("skips a payment whose seller has no credentials without counting it as failed", async () => {
    mocks.prisma.payment.findMany.mockResolvedValue([{ id: "internal", externalId: "123", preferenceId: "preference", mercadopagoUserId: "old-seller" }]);
    mocks.getMercadoPagoCredentials.mockResolvedValue(null);
    expect(await reconcilePendingPayments(T)).toEqual({ processed: 0, failed: 0, skipped: 1 });
    expect(mocks.getMercadoPagoCredentials).toHaveBeenCalledWith(T, { kind: "payment", sellerUserId: "old-seller" });
    expect(mocks.get).not.toHaveBeenCalled();
    expect(mocks.search).not.toHaveBeenCalled();
  });
  it("resolves credentials once per seller", async () => {
    mocks.prisma.payment.findMany.mockResolvedValue([
      { id: "internal", externalId: "123", mercadopagoUserId: "seller-1" },
      { id: "internal", externalId: "123", mercadopagoUserId: "seller-1" },
    ]);
    expect(await reconcilePendingPayments(T)).toEqual({ processed: 2, failed: 0, skipped: 0 });
    expect(mocks.getMercadoPagoCredentials).toHaveBeenCalledTimes(1);
    expect(mocks.getMercadoPagoCredentials).toHaveBeenCalledWith(T, { kind: "payment", sellerUserId: "seller-1" });
  });
  it("does not confirm a payment created with another Mercado Pago account", async () => {
    payment.mercadopagoUserId = "otro";
    await syncMercadoPagoPayment(T, "123");
    expect(mocks.prisma.payment.update).not.toHaveBeenCalled();
    expect(mocks.prisma.outboundMessage.createMany).not.toHaveBeenCalled();
  });
  it("the webhook without credentials throws MercadoPagoUnavailableError before calling Mercado Pago", async () => {
    mocks.getMercadoPagoCredentials.mockResolvedValue(null);
    await expect(handleMercadoPagoWebhook({ type: "payment", "data.id": "123" })).rejects.toThrow("No hay cuenta de Mercado Pago usable");
    expect(mocks.get).not.toHaveBeenCalled();
  });
  it("a 401 while reconciling marks the account as revoked and counts as failed", async () => {
    mocks.prisma.payment.findMany.mockResolvedValue([{ id: "internal", externalId: "123", mercadopagoUserId: "seller-1" }]);
    mocks.get.mockRejectedValue({ status: 401 });
    expect(await reconcilePendingPayments(T)).toEqual({ processed: 0, failed: 1, skipped: 0 });
    expect(mocks.markMercadoPagoAccountError).toHaveBeenCalledWith(T, "revoked");
  });
});

describe("HU-025: pagos del consultorio del contexto", () => {
  const B = { tenantId: "tenant-b" };
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.prisma.$transaction.mockImplementation((fn) => fn(mocks.prisma));
    mocks.prisma.payment.findMany.mockResolvedValue([]);
  });

  it("los listados filtran por el turno del tenant recibido", async () => {
    const { listApprovedPaymentsInRange, listPendingPayments } = await import("./payments");
    await listPendingPayments(B);
    const from = new Date("2026-11-01T03:00:00Z");
    const to = new Date("2026-12-01T02:59:59Z");
    await listApprovedPaymentsInRange(B, from, to);
    expect(mocks.prisma.payment.findMany.mock.calls[0]?.[0].where).toEqual({ status: "PENDING", appointment: { tenantId: "tenant-b" } });
    expect(mocks.prisma.payment.findMany.mock.calls[1]?.[0].where).toEqual({
      status: "APPROVED", paidAt: { gte: from, lte: to }, appointment: { tenantId: "tenant-b" },
    });
  });

  it("pago manual sobre un turno de otro consultorio: mismo error que inexistente y sin escribir", async () => {
    const { registerManualPayment } = await import("./payments");
    mocks.prisma.$queryRaw.mockResolvedValue([]);
    await expect(registerManualPayment(B, "appt-de-a", { kind: "FULL", amount: 100 })).rejects.toThrow("Turno no encontrado");
    expect(mocks.prisma.payment.create).not.toHaveBeenCalled();
    const [strings, ...values] = mocks.prisma.$queryRaw.mock.calls[0]!;
    expect((strings as string[]).join("?")).toContain('"tenantId" = ?');
    expect(values).toEqual(["appt-de-a", "tenant-b"]);
  });

  it("pago manual del propio consultorio: lo crea aprobado", async () => {
    const { registerManualPayment } = await import("./payments");
    mocks.prisma.$queryRaw.mockResolvedValue([{ id: "appt-b" }]);
    mocks.prisma.payment.create.mockResolvedValue({ id: "pay" });
    await registerManualPayment(B, "appt-b", { kind: "DEPOSIT", amount: 50 });
    expect(mocks.prisma.payment.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      appointmentId: "appt-b", kind: "DEPOSIT", amount: 50, provider: "manual", status: "APPROVED",
    }) });
  });

  it("webhook sin consultorio dueño de la cuenta: no consulta Mercado Pago ni la base", async () => {
    mocks.resolveMercadoPagoWebhookTenant.mockResolvedValue(null);
    await expect(handleMercadoPagoWebhook({ type: "payment", "data.id": "123" })).resolves.toBeUndefined();
    expect(mocks.getMercadoPagoCredentials).not.toHaveBeenCalled();
    expect(mocks.get).not.toHaveBeenCalled();
    expect(mocks.prisma.agenda.findFirst).not.toHaveBeenCalled();
  });

  it("webhook: usa el consultorio de la cuenta, no el del payload", async () => {
    mocks.resolveMercadoPagoWebhookTenant.mockResolvedValue(B);
    mocks.prisma.agenda.findFirst.mockResolvedValue(null);
    await expect(handleMercadoPagoWebhook({ type: "payment", "data.id": "123", tenantId: "legacy-tenant" })).rejects.toThrow("tenant_scope");
    expect(mocks.prisma.agenda.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { tenantId: "tenant-b", isPrimary: true } }));
  });
});
