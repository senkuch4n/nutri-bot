"use server";

import type OpenAI from "openai";
import { formatInTimeZone } from "@nutri-bot/core";
import { deepseekClient, DEEPSEEK_MODEL } from "@/lib/deepseek";
import { buscarPaciente, resumenPaciente, turnosAgenda, resumenFacturacion } from "@/lib/assistant-tools";
import { getProfessional } from "@/lib/professional";

export type AssistantMessage = { role: "user" | "assistant"; content: string };
export type AssistantState = { ok: boolean; error?: string; messages: AssistantMessage[] };

const tools: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "buscar_paciente",
      description: "Busca pacientes por nombre o teléfono. Devuelve id, nombre y teléfono de las coincidencias.",
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
        "Ficha clínica, sexo, edad, actividad física, objetivo nutricional, último peso registrado, plan activo y próximo turno de un paciente puntual, dado su id.",
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

async function runTool(name: string, args: Record<string, unknown>): Promise<unknown> {
  switch (name) {
    case "buscar_paciente":
      return buscarPaciente(String(args.query ?? ""));
    case "resumen_paciente":
      return resumenPaciente(String(args.patientId ?? ""));
    case "turnos_agenda":
      return turnosAgenda(String(args.desde ?? ""), String(args.hasta ?? ""));
    case "resumen_facturacion":
      return resumenFacturacion(String(args.desde ?? ""), String(args.hasta ?? ""));
    default:
      return { error: `Herramienta desconocida: ${name}` };
  }
}

export async function askAssistantAction(
  history: AssistantMessage[],
  question: string,
): Promise<AssistantState> {
  const trimmed = question.trim();
  if (!trimmed) return { ok: false, error: "Escribí una pregunta", messages: history };

  const pro = await getProfessional();
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
          const result = await runTool(call.function.name, args);
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
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Error consultando al asistente",
      messages: history,
    };
  }
}
