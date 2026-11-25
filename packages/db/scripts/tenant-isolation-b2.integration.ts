// HU-025 (10.3, 025b-2). Correr solo vía test-tenant-isolation.sh, contra su Postgres descartable, después de
// tenant-isolation.integration.ts (M1–M3). Extiende el probe a M4–M7 con dos consultorios propios (C y D):
// pagos y Mercado Pago, consultas de /mensajes y outbox, activos de la profesional, alimentos y medidas.
// Cada función se llama con { tenantId: C } e ids de D: una lectura da lo mismo que un id inexistente y una
// escritura falla o no hace nada, con una foto de la base idéntica antes y después. Hay controles
// positivos de lectura y de escritura para C. M8 (asistente) vive en apps/web: lo cubren sus tests con mocks
// (cada `where` lleva el tenant del contexto).
import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { prisma } from "../index";
import {
  countInquiriesByStatus, countPendingInquiries, createDepositCheckout, createFoodMeasure, deleteFoodMeasure,
  disconnectMercadoPagoAccount, enqueueAfterHoursDigest, enqueueMessage, expireStalePendingPayments, findFoodNameConflicts,
  getFood, getFoodUsage, getMercadoPagoConnectionView, getMercadoPagoCredentials, getProfessionalPdfAssets,
  getProfessionalSignatureImage, listApprovedPaymentsInRange, listFoodMeasures, listFoods, listInquiries,
  listMeasuresForPicker, listPendingPayments, markInquiryAnswered, recipesForTenant, markMercadoPagoAccountError, moveFoodMeasure,
  notifyMercadoPagoMissingForBooking, reconcilePendingPayments, recordInquiryMessage, registerManualPayment,
  removeProfessionalLogo, removeProfessionalSignature, resolveMeasureItem, setFoodActive, updateFoodMeasure,
  updateOwnFood, updateProfessionalLogo, updateProfessionalSignature,
} from "../domain";

if (process.env.TENANT_ISOLATION_DISPOSABLE !== "1" ||
    !/^postgresql:\/\/postgres:[a-f0-9]{36}@127\.0\.0\.1:\d+\/tenant_isolation$/.test(process.env.DATABASE_URL ?? "")) {
  throw new Error("Run test-tenant-isolation.sh for disposable PostgreSQL.");
}
after(() => prisma.$disconnect());

const C = { tenantId: "iso-c" };
const D = { tenantId: "iso-d" };
const TZ = "America/Argentina/Buenos_Aires";
const DAY = 86_400_000;
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
const OWN_FOOD = {
  group: "LEGUMBRES_CEREALES" as const, reference: null, proteinPer100: 3, carbsPer100: 20, fatPer100: 1, fiberPer100: null,
  alcoholPer100: null, sodiumMgPer100: null, addedSugarPer100: null, saturatedFatPer100: null, cholesterolMgPer100: null,
};

type Fixture = {
  professionalId: number; patientId: string; appointmentId: string; awaitingId: string; pendingPaymentId: string;
  approvedPaymentId: string; inquiryId: string; ownFoodId: string; measureId: string;
};
const fx = {} as Record<"c" | "d", Fixture>;
let saraId = "";

async function seed(key: "c" | "d", tenantId: string, professionalId: number, slot: number): Promise<Fixture> {
  const p = `iso-${key}`;
  const phone = key === "c" ? "5490000000303" : "5490000000404";
  await prisma.tenant.create({ data: { id: tenantId } });
  await prisma.professional.create({
    data: { id: professionalId, tenantId, name: `Prof ${key}`, email: `${p}@example.test`, timezone: TZ, phoneJid: `pro-${key}@s.whatsapp.net` },
  });
  await prisma.agenda.create({ data: { id: `${p}-agenda`, tenantId, professionalId, isPrimary: true } });
  const patient = await prisma.patient.create({
    data: { id: `${p}-patient`, tenantId, whatsappJid: `${phone}@s.whatsapp.net`, phone, name: `Paciente ${key}` },
  });
  const service = await prisma.service.create({
    data: { id: `${p}-service`, tenantId, name: `Consulta ${key}`, price: 1000, durationMin: 30, requiresDeposit: true, depositKind: "FIXED", depositValue: 500 },
  });
  const at = (offsetDays: number) => {
    const d = new Date(Date.now() + offsetDays * DAY);
    d.setUTCHours(12 + slot, 0, 0, 0);
    return d;
  };
  const base = { tenantId, agendaId: `${p}-agenda`, patientId: patient.id, serviceId: service.id, createdBy: "PROFESSIONAL" as const, priceSnapshot: 1000 };
  const appointment = await prisma.appointment.create({
    data: { ...base, id: `${p}-appt`, startsAt: at(2), endsAt: new Date(at(2).getTime() + 30 * 60_000), status: "CONFIRMED" },
  });
  const awaiting = await prisma.appointment.create({
    data: {
      ...base, id: `${p}-awaiting`, startsAt: at(3), endsAt: new Date(at(3).getTime() + 30 * 60_000), status: "AWAITING_PAYMENT",
      createdAt: new Date(Date.now() - 60 * 60_000),
    },
  });
  const pending = await prisma.payment.create({
    data: { id: `${p}-pay-pending`, appointmentId: awaiting.id, kind: "DEPOSIT", amount: 500, status: "PENDING", provider: "mercadopago", mercadopagoUserId: `seller-${key}` },
  });
  const approved = await prisma.payment.create({
    data: { id: `${p}-pay-ok`, appointmentId: appointment.id, kind: "FULL", amount: 1000, status: "APPROVED", provider: "manual", paidAt: new Date() },
  });
  const now = new Date();
  const inquiry = await prisma.patientInquiry.create({
    data: { id: `${p}-inquiry`, patientId: patient.id, body: `consulta ${key}`, receivedAt: now, lastMessageAt: now, receivedAfterHours: true },
  });
  const own = await prisma.food.create({
    data: { id: `${p}-own-food`, tenantId, source: "PROPIO", name: `Propio ${key}`, kcalPer100: 100, ...OWN_FOOD },
  });
  const measure = await prisma.foodMeasure.create({
    data: { id: `${p}-measure`, tenantId, foodId: saraId, name: `taza ${key}`, nameKey: `taza ${key}`, grams: 180, order: 0 },
  });
  return {
    professionalId, patientId: patient.id, appointmentId: appointment.id, awaitingId: awaiting.id,
    pendingPaymentId: pending.id, approvedPaymentId: approved.id, inquiryId: inquiry.id, ownFoodId: own.id, measureId: measure.id,
  };
}

const TABLES = [
  "Professional", "Appointment", "Payment", "MercadoPagoAccount", "OutboundMessage", "PatientInquiry", "Food",
  "FoodMeasure", "FoodVisibilityPreference", "NutritionPlan", "PlanTemplate",
] as const;

async function snapshot(): Promise<string> {
  const parts = await Promise.all(TABLES.map(async (table) => {
    const rows = await prisma.$queryRawUnsafe<{ rows: unknown }[]>(
      `SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text), '[]'::jsonb) AS rows FROM "${table}" t`,
    );
    return [table, rows[0]?.rows] as const;
  }));
  return JSON.stringify(parts);
}

async function unchanged<T>(label: string, fn: () => Promise<T>): Promise<{ value?: T; error?: unknown }> {
  const beforeSnap = await snapshot();
  let out: { value?: T; error?: unknown };
  try {
    out = { value: await fn() };
  } catch (error) {
    out = { error };
  }
  assert.equal(await snapshot(), beforeSnap, `${label}: cambió la base`);
  return out;
}

async function rejectsUnchanged(label: string, fn: () => Promise<unknown>) {
  const { error } = await unchanged(label, fn);
  assert.ok(error, `${label}: tenía que fallar y no falló`);
}

async function sameAsMissing<T>(label: string, foreign: () => Promise<T>, missing: () => Promise<T>) {
  const f = await unchanged(label, foreign);
  const m = await unchanged(`${label} (inexistente)`, missing);
  if (m.error) assert.ok(f.error, `${label}: un id inexistente falla, el de D tiene que fallar igual`);
  else {
    assert.ok(!f.error, `${label}: un id inexistente no falla, el de D tampoco tiene que fallar`);
    assert.deepEqual(f.value, m.value, `${label}: distinto de un id inexistente`);
  }
}

before(async () => {
  const sara = await prisma.food.findFirst({ where: { source: "SARA2" }, select: { id: true } }) ??
    await prisma.food.create({
      data: { id: "iso-b2-sara", name: "Arroz", group: "LEGUMBRES_CEREALES", source: "SARA2", sourceKey: "iso-b2-sara", kcalPer100: 130, proteinPer100: 2, carbsPer100: 28, fatPer100: 0 },
      select: { id: true },
    });
  saraId = sara.id;
  fx.c = await seed("c", C.tenantId, 503, 0);
  fx.d = await seed("d", D.tenantId, 504, 1);
  // Fila única de Mercado Pago (id = 1) del consultorio D, sin tokens: C nunca la ve ni la usa.
  await prisma.mercadoPagoAccount.upsert({
    where: { id: 1 },
    create: { id: 1, tenantId: D.tenantId, userId: "seller-d", nickname: "VENDEDOR D" },
    update: { tenantId: D.tenantId, userId: "seller-d", nickname: "VENDEDOR D" },
  });
});

describe("M4 pagos y Mercado Pago", () => {
  test("listados de C traen solo pagos de C", async () => {
    assert.deepEqual((await listPendingPayments(C)).map((p) => p.id), [fx.c.pendingPaymentId]);
    const approved = await listApprovedPaymentsInRange(C, new Date(Date.now() - DAY), new Date(Date.now() + DAY));
    assert.deepEqual(approved.map((p) => p.id), [fx.c.approvedPaymentId]);
  });

  test("escrituras con turnos de D se rechazan o no hacen nada", async () => {
    await rejectsUnchanged("registerManualPayment turno D", () => registerManualPayment(C, fx.d.appointmentId, { kind: "FULL", amount: 1 }));
    await rejectsUnchanged("createDepositCheckout turno D", () => createDepositCheckout(C, fx.d.awaitingId));
    const reconcile = await unchanged("reconcilePendingPayments pago D", () => reconcilePendingPayments(C, () => {}, [fx.d.pendingPaymentId]));
    assert.deepEqual(reconcile.value, { processed: 0, failed: 0, skipped: 0 });
  });

  test("control positivo: pago manual sobre un turno propio", async () => {
    const created = await registerManualPayment(C, fx.c.appointmentId, { kind: "DEPOSIT", amount: 10 });
    assert.equal((await prisma.payment.findUniqueOrThrow({ where: { id: created.id } })).appointmentId, fx.c.appointmentId);
    await prisma.payment.delete({ where: { id: created.id } });
  });

  test("vencer señas de C no toca la seña vieja de D", async () => {
    const before = await prisma.appointment.findUniqueOrThrow({ where: { id: fx.d.awaitingId } });
    assert.equal(await expireStalePendingPayments(C), 1); // la de C, sí
    assert.deepEqual(await prisma.appointment.findUniqueOrThrow({ where: { id: fx.d.awaitingId } }), before);
    assert.equal((await prisma.payment.findUniqueOrThrow({ where: { id: fx.d.pendingPaymentId } })).status, "PENDING");
  });

  test("la cuenta de Mercado Pago de D no existe para C", async () => {
    const view = await unchanged("getMercadoPagoConnectionView", () => getMercadoPagoConnectionView(C));
    assert.equal(view.value?.userId, null);
    assert.equal(view.value?.nickname, null);
    assert.equal((await unchanged("getMercadoPagoCredentials", () => getMercadoPagoCredentials(C, { kind: "current" }))).value, null);
    await rejectsUnchanged("disconnectMercadoPagoAccount", () => disconnectMercadoPagoAccount(C));
    await rejectsUnchanged("markMercadoPagoAccountError", () => markMercadoPagoAccountError(C, "revoked"));
    const notified = await unchanged("notifyMercadoPagoMissingForBooking", () =>
      notifyMercadoPagoMissingForBooking(C, { patientName: "x", patientPhone: "1", serviceName: "s" }));
    assert.equal(notified.value, false);
  });
});

describe("M5 mensajes y outbox", () => {
  test("consultas: listados y conteos de C solo con lo de C", async () => {
    assert.deepEqual((await listInquiries(C)).map((i) => i.id), [fx.c.inquiryId]);
    assert.equal(await countPendingInquiries(C), 1);
    assert.deepEqual(await countInquiriesByStatus(C), { PENDING: 1, ANSWERED: 0 });
  });

  test("escrituras con ids de D", async () => {
    await sameAsMissing("markInquiryAnswered", () => markInquiryAnswered(C, fx.d.inquiryId), () => markInquiryAnswered(C, "no-existe"));
    await rejectsUnchanged("recordInquiryMessage paciente D", () =>
      recordInquiryMessage(C, { patientId: fx.d.patientId, text: "hola", at: new Date(), afterHours: false, inquiryId: fx.d.inquiryId }));
    await rejectsUnchanged("enqueueMessage turno D", () =>
      enqueueMessage(C, { toJid: "x@s.whatsapp.net", body: "x", kind: "AD_HOC", appointmentId: fx.d.appointmentId }));
    const digest = await unchanged("enqueueAfterHoursDigest pacientes D", () => enqueueAfterHoursDigest(C, {
      now: new Date(Date.now() + DAY), scope: { patientIds: [fx.d.patientId] }, config: { enabled: false, start: "22:00", end: "09:00" }, alertJid: null,
    }));
    assert.deepEqual(digest.value, { digested: 0, outboundId: null });
  });

  test("control positivo: encolar escribe el tenant de C", async () => {
    assert.equal(await enqueueMessage(C, { toJid: "x@s.whatsapp.net", body: "x", kind: "AD_HOC", appointmentId: fx.c.appointmentId, dedupeKey: "iso" }), true);
    const row = await prisma.outboundMessage.findFirstOrThrow({ where: { appointmentId: fx.c.appointmentId, dedupeKey: "iso" } });
    assert.equal(row.tenantId, C.tenantId);
    await prisma.outboundMessage.delete({ where: { id: row.id } });
  });
});

describe("M6 activos de la profesional", () => {
  test("firma y logo se escriben en la profesional de la agenda principal de C, nunca en la de D", async () => {
    const before = await prisma.professional.findUniqueOrThrow({ where: { id: fx.d.professionalId } });
    await updateProfessionalSignature(C, { data: PNG, mimeType: "image/png" });
    await updateProfessionalLogo(C, { logoData: PNG, logoMimeType: "image/png" });
    assert.deepEqual((await getProfessionalSignatureImage(C))?.mimeType, "image/png");
    assert.equal(await getProfessionalSignatureImage(D), null);
    assert.equal((await getProfessionalPdfAssets(D)).signature, null);
    await removeProfessionalSignature(C);
    await removeProfessionalLogo(C);
    assert.deepEqual(await prisma.professional.findUniqueOrThrow({ where: { id: fx.d.professionalId } }), before);
  });
});

describe("M7 alimentos y medidas", () => {
  test("un propio de D es inexistente para C", async () => {
    await sameAsMissing("getFood", () => getFood(C, fx.d.ownFoodId), () => getFood(C, "no-existe"));
    await rejectsUnchanged("updateOwnFood", () => updateOwnFood(C, fx.d.ownFoodId, { name: "x", ...OWN_FOOD }));
    await rejectsUnchanged("setFoodActive propio D", () => setFoodActive(C, fx.d.ownFoodId, false));
    await rejectsUnchanged("createFoodMeasure en propio D", () => createFoodMeasure(C, fx.d.ownFoodId, { name: "taza", plural: null, grams: 100 }));
    const names = (await listFoods(C, { activeOnly: false })).map((f) => f.id);
    assert.ok(names.includes(fx.c.ownFoodId) && !names.includes(fx.d.ownFoodId));
    const conflicts = await findFoodNameConflicts(C, "Propio d");
    assert.equal(conflicts.own, null);
    assert.deepEqual(await getFoodUsage(C, saraId), { plans: 0, templates: 0 });
  });

  test("medidas de D son inexistentes para C", async () => {
    await rejectsUnchanged("updateFoodMeasure", () => updateFoodMeasure(C, fx.d.measureId, { name: "x", plural: null, grams: 10 }));
    await rejectsUnchanged("deleteFoodMeasure", () => deleteFoodMeasure(C, fx.d.measureId));
    await rejectsUnchanged("moveFoodMeasure", () => moveFoodMeasure(C, fx.d.measureId, "up"));
    await rejectsUnchanged("resolveMeasureItem", () => resolveMeasureItem(C, saraId, fx.d.measureId, 1));
    assert.deepEqual((await listFoodMeasures(C, saraId)).map((m) => m.id), [fx.c.measureId]);
    const picker = await listMeasuresForPicker(C);
    assert.deepEqual((picker[saraId] ?? []).map((m) => m.id), [fx.c.measureId]);
  });

  test("ocultar un SARA 2 es preferencia de C: D lo sigue viendo activo", async () => {
    await setFoodActive(C, saraId, false);
    assert.equal((await getFood(C, saraId))?.active, false);
    assert.equal((await getFood(D, saraId))?.active, true);
    assert.equal((await prisma.food.findUniqueOrThrow({ where: { id: saraId } })).active, true);
    await setFoodActive(C, saraId, true);
  });

  test("el catálogo de recetas sigue la misma regla: un SARA 2 oculto por C no aparece en sus recetas", async () => {
    const ids = async (t: typeof C, include: string[] = []) =>
      new Map((await recipesForTenant(t.tenantId).foods(include)).map((f) => [f.id, f.active]));
    await setFoodActive(C, saraId, false);
    try {
      assert.equal((await ids(C)).has(saraId), false, "C lo ocultó: fuera del catálogo de C");
      assert.equal((await ids(D)).get(saraId), true, "la preferencia de C no afecta a D");
      assert.equal((await ids(C, [saraId])).get(saraId), false, "si la receta ya lo usa, entra marcado inactivo");
      const catalogC = await ids(C, [fx.d.ownFoodId]);
      assert.ok(catalogC.has(fx.c.ownFoodId) && !catalogC.has(fx.d.ownFoodId), "un propio de D nunca entra, ni pedido");
    } finally {
      await setFoodActive(C, saraId, true);
    }
    // Columna global `active` en false sin preferencia: para el consultorio manda la preferencia (sigue visible).
    await prisma.food.update({ where: { id: saraId }, data: { active: false } });
    try {
      assert.equal((await ids(C)).get(saraId), true);
    } finally {
      await prisma.food.update({ where: { id: saraId }, data: { active: true } });
    }
  });

  test("control positivo: C carga una medida en un SARA 2 sin tocar las de D", async () => {
    const created = await createFoodMeasure(C, saraId, { name: "cucharada", plural: null, grams: 15 });
    const measuresD = await listFoodMeasures(D, saraId);
    assert.deepEqual(measuresD.map((m) => m.id), [fx.d.measureId]);
    await deleteFoodMeasure(C, created.id);
  });
});
