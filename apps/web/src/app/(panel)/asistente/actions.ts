"use server";

import type OpenAI from "openai";
import { formatInTimeZone } from "@nutri-bot/core";
import { deepseekClient, DEEPSEEK_MODEL } from "@/lib/deepseek";
import { buscarPaciente, resumenPaciente, turnosAgenda, resumenFacturacion } from "@/lib/assistant-tools";
import { errorCode } from "@/lib/error-code";
import { getTenantProfessional } from "@/lib/professional";
import { requireTenantContext, type TenantContext } from "@/lib/tenant-context";

export type AssistantMessage = { role: "user" | "assistant"; content: string };
export type AssistantState = { ok: boolean; error?: string; messages: AssistantMessage[] };

const tools: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "buscar_paciente",
      description: "Busca pacientes por nombre o teléfono, incluidas las archivadas. Devuelve id, nombre, teléfono y si está archivada.",
      parameters: {
        type: "object",
        properties: { query: { type: "string", description: "Nombre o teléfono a buscar" } },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "resumen_paciente",
      description:
        "Ficha clínica, sexo, edad, actividad física, objetivo nutricional, último peso registrado, plan activo y próximo turno de un paciente puntual, dado su id. Informa también archivada_el: la fecha en que se archivó, o null si está activa.",
      parameters: {
        type: "object",
        properties: { patientId: { type: "string" } },
        required: ["patientId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "turnos_agenda",
      description: "Lista los turnos confirmados o esperando pago entre dos fechas.",
      parameters: {
        type: "object",
        properties: {
          desde: { type: "string", description: "Fecha/hora ISO 8601 de inicio" },
          hasta: { type: "string", description: "Fecha/hora ISO 8601 de fin" },
        },
        required: ["desde", "hasta"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "resumen_facturacion",
      description: "Total cobrado y cantidad de pagos acreditados entre dos fechas.",
      parameters: {
        type: "object",
        properties: {
          desde: { type: "string", description: "Fecha/hora ISO 8601 de inicio" },
          hasta: { type: "string", description: "Fecha/hora ISO 8601 de fin" },
        },
        required: ["desde", "hasta"],
      },
    },
  },
];

/** HU-025: el consultorio de cada herramienta es el del contexto de la sesión, nunca un argumento del
 *  modelo (los `args` vienen de la IA y solo traen texto, ids y fechas). */
async function runTool(ctx: TenantContext, name: string, args: Record<string, unknown>): Promise<unknown> {
  switch (name) {
    case "buscar_paciente":
      return buscarPaciente(ctx, String(args.query ?? ""));
    case "resumen_paciente":
      return resumenPaciente(ctx, String(args.patientId ?? ""));
    case "turnos_agenda":
      return turnosAgenda(ctx, String(args.desde ?? ""), String(args.hasta ?? ""));
    case "resumen_facturacion":
      return resumenFacturacion(ctx, String(args.desde ?? ""), String(args.hasta ?? ""));
    default:
      return { error: "Herramienta desconocida" };
  }
}

const ASSISTANT_ERROR = "Error consultando al asistente";

export async function askAssistantAction(
  history: AssistantMessage[],
  question: string,
): Promise<AssistantState> {
  const trimmed = question.trim();
  if (!trimmed) return { ok: false, error: "Escribí una pregunta", messages: history };

  let ctx: TenantContext;
  try {
    ctx = await requireTenantContext("read");
  } catch {
    return { ok: false, error: ASSISTANT_ERROR, messages: history };
  }
  const pro = await getTenantProfessional(ctx.tenantId);
  const now = formatInTimeZone(new Date(), pro.timezone, "EEEE d 'de' MMMM 'de' yyyy, HH:mm");

  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    {
      role: "system",
      content:
        `Sos el asistente del panel de ${pro.name}, una nutricionista que usa NutriBot. ` +
        `Hoy es ${now} (zona horaria ${pro.timezone}). ` +
        "Respondé en español, corto y directo. Usá siempre las herramientas para consultar datos reales — " +
        "nunca inventes turnos, pacientes ni montos. Si la pregunta no tiene que ver con la agenda, " +
        "los pacientes o la facturación del consultorio, decí que solo podés ayudar con eso.",
    },
    ...history.map(
      (m): OpenAI.Chat.Completions.ChatCompletionMessageParam => ({ role: m.role, content: m.content }),
    ),
    { role: "user", content: trimmed },
  ];

  try {
    for (let i = 0; i < 4; i++) {
      const completion = await deepseekClient().chat.completions.create({
        model: DEEPSEEK_MODEL,
        messages,
        tools,
      });
      const msg = completion.choices[0]?.message;
      if (!msg) break;

      const toolCalls = msg.tool_calls?.filter((c) => c.type === "function") ?? [];
      if (toolCalls.length > 0) {
        messages.push({ role: "assistant", content: msg.content, tool_calls: toolCalls });
        for (const call of toolCalls) {
          let args: Record<string, unknown> = {};
          try {
            args = call.function.arguments ? JSON.parse(call.function.arguments) : {};
          } catch {
            args = {};
          }
          const result = await runTool(ctx, call.function.name, args);
          messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(result) });
        }
        continue;
      }

      const answer = msg.content ?? "No pude generar una respuesta.";
      return {
        ok: true,
        messages: [...history, { role: "user", content: trimmed }, { role: "assistant", content: answer }],
      };
    }
    return { ok: false, error: "El asistente no pudo resolver la consulta.", messages: history };
  } catch (err) {
    // D11: solo el código o la clase del error. Ni el prompt, ni la respuesta, ni el mensaje del
    // proveedor (puede traer datos del pedido) van al log ni al cliente.
    console.error("[assistant] provider_error", errorCode(err));
    return { ok: false, error: ASSISTANT_ERROR, messages: history };
  }
}
