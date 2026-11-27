// HU-028c (§C8.5): probe de dos consultorios para la IA. A = instalación original (legacy-tenant, migrada con
// datos tipo producción); B = consultorio sintético que crea test-bot-ai-per-tenant.sh. Correr solo vía ese
// script, contra su Postgres descartable. Nunca llama a un proveedor de IA: prueba el dominio que usa el bot
// (conteo, registro, tools, topes) y el registro de consumo del panel.
import assert from "node:assert/strict";
import { after, describe, test } from "node:test";
import { prisma } from "../index";
import { countBotAiQuestionsToday, recordBotAiQuestion, runBotAiTool } from "../domain/botAi";
import { getTenantAiSettings, recordPanelAiUsage } from "../domain/aiUsage";

if (process.env.AI_TENANTS_DISPOSABLE !== "1" ||
    !/^postgresql:\/\/postgres:[a-f0-9]{36}@127\.0\.0\.1:\d+\/ai_tenants$/.test(process.env.DATABASE_URL ?? "")) {
  throw new Error("Run test-bot-ai-per-tenant.sh for disposable PostgreSQL.");
}

globalThis.fetch = (async () => {
  throw new Error("Red real bloqueada en el probe");
}) as typeof fetch;

after(() => prisma.$disconnect());

const A = { tenantId: "legacy-tenant" };
const B = { tenantId: "ai-b" };
const PATIENT_A = "ai-a-patient";
const PATIENT_B = "ai-b-patient";
const TZ = "America/Argentina/Buenos_Aires";
const NOW = new Date();

const question = (tenantId: string, patientId: string) => ({
  tenantId,
  patientId,
  askedAt: NOW,
  question: "¿Cuánto sale la consulta?",
  answer: "Sale $ 1.000.",
  outcome: "ANSWERED" as const,
  provider: "fake",
  model: "fake-model",
});

describe("HU-028c: IA por consultorio en Postgres", () => {
  test("una pregunta no puede quedar en otro consultorio que su paciente (FK compuesta)", async () => {
    await assert.rejects(recordBotAiQuestion(question(B.tenantId, PATIENT_A)));
    assert.equal(await prisma.botAiQuestion.count({ where: { patientId: PATIENT_A, tenantId: B.tenantId } }), 0);
  });

  test("el uso de A no consume el cupo diario de B", async () => {
    const before = await countBotAiQuestionsToday({ ...A, patientId: PATIENT_A, now: NOW, tz: TZ });
    for (let i = 0; i < 3; i++) await recordBotAiQuestion(question(A.tenantId, PATIENT_A));
    const a = await countBotAiQuestionsToday({ ...A, patientId: PATIENT_A, now: NOW, tz: TZ });
    assert.equal(a.tenant, before.tenant + 3);
    assert.equal(a.patient, before.patient + 3);
    assert.deepEqual(await countBotAiQuestionsToday({ ...B, patientId: PATIENT_B, now: NOW, tz: TZ }), { patient: 0, tenant: 0 });
    await recordBotAiQuestion(question(B.tenantId, PATIENT_B));
    assert.deepEqual(await countBotAiQuestionsToday({ ...B, patientId: PATIENT_B, now: NOW, tz: TZ }), { patient: 1, tenant: 1 });
    assert.equal((await countBotAiQuestionsToday({ ...A, patientId: PATIENT_A, now: NOW, tz: TZ })).tenant, a.tenant);
  });

  test("servicios: cada consultorio ve solo los suyos", async () => {
    const svcA = await runBotAiTool({ name: "servicios", input: {}, patientId: PATIENT_A, ...A, now: NOW });
    const svcB = await runBotAiTool({ name: "servicios", input: { tenantId: A.tenantId }, patientId: PATIENT_B, ...B, now: NOW });
    assert.equal(svcA.isError, false);
    assert.equal(svcB.isError, false);
    assert.match(svcA.content, /Servicio A/);
    assert.doesNotMatch(svcA.content, /Servicio B/);
    assert.match(svcB.content, /Servicio B/);
    assert.doesNotMatch(svcB.content, /Servicio A/);
  });

  test("disponibilidad: un servicio de B no existe para A", async () => {
    const r = await runBotAiTool({ name: "disponibilidad", input: { servicio: "Servicio B" }, patientId: PATIENT_A, ...A, now: NOW });
    assert.equal(r.isError, true);
    assert.match(r.content, /No hay un servicio activo/);
  });

  test("mis_turnos: A no ve turnos de B", async () => {
    const mineA = await runBotAiTool({ name: "mis_turnos", input: {}, patientId: PATIENT_A, ...A, now: NOW });
    assert.equal(mineA.isError, false);
    const turnosA = JSON.parse(mineA.content) as { servicio: string }[];
    assert.ok(turnosA.length >= 1);
    assert.ok(turnosA.every((t) => t.servicio === "Servicio A"));
    // Aunque el paciente fuera de B, con el consultorio A de la conversación no aparece nada de B.
    const crossed = await runBotAiTool({ name: "mis_turnos", input: {}, patientId: PATIENT_B, ...A, now: NOW });
    assert.deepEqual(JSON.parse(crossed.content), []);
  });

  test("datos_consultorio: B devuelve la profesional de B", async () => {
    const r = await runBotAiTool({ name: "datos_consultorio", input: { tenantId: A.tenantId }, patientId: PATIENT_B, ...B, now: NOW });
    assert.equal(r.isError, false);
    const info = JSON.parse(r.content) as { nutricionista: string; informacionAdicional: string | null };
    assert.match(info.nutricionista, /Prof B/);
    assert.equal(info.informacionAdicional, "Info de B");
    const a = JSON.parse((await runBotAiTool({ name: "datos_consultorio", input: {}, patientId: PATIENT_A, ...A, now: NOW })).content);
    assert.match(a.nutricionista, /Prof A/);
  });

  test("topes: B con el valor del script, A sin fila (default del .env); el CHECK rechaza negativos", async () => {
    assert.deepEqual(await getTenantAiSettings(B), { botDailyPerPatient: null, botDailyPerTenant: 5 });
    assert.deepEqual(await getTenantAiSettings(A), { botDailyPerPatient: null, botDailyPerTenant: null });
    await assert.rejects(
      prisma.$executeRaw`UPDATE "TenantAiSettings" SET "botDailyPerTenant" = -1 WHERE "tenantId" = ${B.tenantId}`,
      /TenantAiSettings_limits_check/,
    );
    assert.deepEqual(await getTenantAiSettings(B), { botDailyPerPatient: null, botDailyPerTenant: 5 });
  });

  test("consumo del panel: la fila es de A y B no la ve", async () => {
    await recordPanelAiUsage(A, {
      feature: "ASSISTANT", provider: "deepseek", model: "deepseek-chat",
      inputTokens: 120, outputTokens: 30, calls: 2, outcome: "OK",
    });
    const rowsA = await prisma.panelAiUsage.findMany({ where: { tenantId: A.tenantId } });
    assert.equal(rowsA.length, 1);
    assert.deepEqual(
      { feature: rowsA[0]!.feature, outcome: rowsA[0]!.outcome, calls: rowsA[0]!.calls, inputTokens: rowsA[0]!.inputTokens, errorCode: rowsA[0]!.errorCode },
      { feature: "ASSISTANT", outcome: "OK", calls: 2, inputTokens: 120, errorCode: null },
    );
    assert.equal(await prisma.panelAiUsage.count({ where: { tenantId: B.tenantId } }), 0);
    // Un consultorio inexistente no rompe: nunca tira (D11b).
    await recordPanelAiUsage({ tenantId: "no-existe" }, {
      feature: "PLAN_AI", provider: "deepseek", model: "deepseek-chat", inputTokens: 0, outputTokens: 0, calls: 0, outcome: "ERROR",
    });
    assert.equal(await prisma.panelAiUsage.count(), 1);
  });
});
