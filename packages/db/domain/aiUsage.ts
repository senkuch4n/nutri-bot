// HU-028c: IA por consultorio. Topes del bot por consultorio (D10a) y registro de consumo de la IA del
// panel (D11b, D12). El registro guarda solo metadata de uso: nunca la pregunta, la respuesta, el prompt ni
// datos del paciente.
import type { PanelAiFeature, PanelAiOutcome } from "@prisma/client";
import type { TenantBotAiLimits } from "@nutri-bot/core";
import { prisma } from "../index";
import type { TenantRef } from "./tenantScope";

/** BOT. Topes guardados del consultorio; sin fila → { botDailyPerPatient: null, botDailyPerTenant: null }.
 *  Puede tirar (error de base): el llamador lo trata como hoy un error de conteo. */
export async function getTenantAiSettings(t: TenantRef): Promise<TenantBotAiLimits> {
  const row = await prisma.tenantAiSettings.findUnique({
    where: { tenantId: t.tenantId },
    select: { botDailyPerPatient: true, botDailyPerTenant: true },
  });
  return {
    botDailyPerPatient: row?.botDailyPerPatient ?? null,
    botDailyPerTenant: row?.botDailyPerTenant ?? null,
  };
}

export type PanelAiUsageInput = {
  feature: PanelAiFeature;
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  calls: number;
  outcome: PanelAiOutcome;
  errorCode?: string | null;
  /** SOLO pruebas; default: DEFAULT now() de la base. */
  at?: Date;
};

const ERROR_CODE_RE = /^[A-Za-z0-9_.:-]{1,64}$/;

function count(n: number): number {
  return Number.isInteger(n) && n >= 0 ? n : 0;
}

function safeErrorCode(code: string | null | undefined): string | null {
  if (code === null || code === undefined) return null;
  return ERROR_CODE_RE.test(code) ? code : "error";
}

/** Código del error para el log: `code` si es un string seguro, si no la clase. Nunca el message. */
function failureCode(err: unknown): string {
  const code = (err as { code?: unknown } | null)?.code;
  if (typeof code === "string" && ERROR_CODE_RE.test(code)) return code;
  if (err instanceof Error && ERROR_CODE_RE.test(err.name)) return err.name;
  return "error";
}

/** WEB. Inserta una fila de PanelAiUsage del consultorio. **Nunca tira** (D11b: registrar no puede romper la
 *  función): ante error loguea solo el código o la clase del error y resuelve. */
export async function recordPanelAiUsage(t: TenantRef, row: PanelAiUsageInput): Promise<void> {
  try {
    await prisma.panelAiUsage.create({
      data: {
        tenantId: t.tenantId,
        feature: row.feature,
        provider: row.provider,
        model: row.model,
        inputTokens: count(row.inputTokens),
        outputTokens: count(row.outputTokens),
        calls: count(row.calls),
        outcome: row.outcome,
        errorCode: safeErrorCode(row.errorCode),
        ...(row.at ? { usedAt: row.at } : {}),
      },
      select: { id: true },
    });
  } catch (err) {
    console.warn("[ai-usage] record_failed", failureCode(err));
  }
}
