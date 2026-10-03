import { describe, expect, it } from "vitest";
import {
  BOT_AI_DEFAULT_LIMITS,
  BOT_AI_INQUIRY_PREFIX,
  BOT_AI_REPLY_MAX_CHARS,
  BOT_AI_SYSTEM_PROMPT,
  buildQuestionMessage,
  classifyAnswer,
  cutAtSentence,
  dayBoundsInTz,
  inquiryBodyFromAiQuestion,
  isBotAiAvailable,
  mergeBotAiLimits,
  resolveBotAiEnv,
  toWhatsAppText,
  trimHistory,
  validateBotAiInfo,
  validateQuestion,
} from "./bot-ai";
import * as messages from "./messages";

const BA = "America/Argentina/Buenos_Aires";

describe("resolveBotAiEnv", () => {
  it("defaults sin variables", () => {
    const c = resolveBotAiEnv({});
    expect(c).toEqual({
      provider: "anthropic",
      model: "claude-haiku-4-5",
      apiKey: null,
      hasKey: false,
      apiKeyEnvName: "API_KEY_IA_ANTHROPIC",
      limits: BOT_AI_DEFAULT_LIMITS,
    });
  });

  it("clave vacía o con espacios no cuenta", () => {
    expect(resolveBotAiEnv({ API_KEY_IA_ANTHROPIC: "  " }).hasKey).toBe(false);
    const c = resolveBotAiEnv({ API_KEY_IA_ANTHROPIC: " sk-x " });
    expect(c.hasKey).toBe(true);
    expect(c.apiKey).toBe("sk-x");
  });

  it("deepseek usa su modelo y su variable de clave", () => {
    const c = resolveBotAiEnv({ BOT_AI_PROVIDER: "deepseek", API_KEY_IA_DEEPSEEK: "k" });
    expect(c.provider).toBe("deepseek");
    expect(c.model).toBe("deepseek-chat");
    expect(c.hasKey).toBe(true);
    expect(c.apiKeyEnvName).toBe("API_KEY_IA_DEEPSEEK");
    // la clave de Anthropic no sirve para deepseek
    expect(resolveBotAiEnv({ BOT_AI_PROVIDER: "deepseek", API_KEY_IA_ANTHROPIC: "x" }).hasKey).toBe(false);
  });

  it("proveedor desconocido → anthropic", () => {
    expect(resolveBotAiEnv({ BOT_AI_PROVIDER: "otro" }).provider).toBe("anthropic");
  });

  it("límites: enteros > 0 se respetan; el resto usa el default", () => {
    expect(resolveBotAiEnv({ BOT_AI_DAILY_PER_PATIENT: "5" }).limits.perPatientDaily).toBe(5);
    for (const bad of ["0", "-3", "abc", "2.5", ""]) {
      expect(resolveBotAiEnv({ BOT_AI_DAILY_PER_PATIENT: bad }).limits.perPatientDaily, bad).toBe(20);
    }
    const c = resolveBotAiEnv({ BOT_AI_TIMEOUT_MS: "15000", BOT_AI_RETENTION_DAYS: "30" });
    expect(c.limits.timeoutMs).toBe(15000);
    expect(c.limits.retentionDays).toBe(30);
    expect(c.limits.globalDaily).toBe(300);
  });

  it("respeta BOT_AI_MODEL", () => {
    expect(resolveBotAiEnv({ BOT_AI_MODEL: "claude-sonnet-x" }).model).toBe("claude-sonnet-x");
  });
});

describe("mergeBotAiLimits", () => {
  it("pisa solo las claves dadas", () => {
    const m = mergeBotAiLimits(BOT_AI_DEFAULT_LIMITS, { globalDaily: 0, perPatientDaily: 3 });
    expect(m).toEqual({ ...BOT_AI_DEFAULT_LIMITS, globalDaily: 0, perPatientDaily: 3 });
    expect(mergeBotAiLimits(BOT_AI_DEFAULT_LIMITS)).toEqual(BOT_AI_DEFAULT_LIMITS);
  });
});

describe("validateQuestion", () => {
  it("cuenta después del trim", () => {
    expect(validateQuestion("a".repeat(500), 500)).toBe("ok");
    expect(validateQuestion("a".repeat(501), 500)).toBe("too_long");
    expect(validateQuestion("   ", 500)).toBe("empty");
    expect(validateQuestion("  hola  ", 4)).toBe("ok");
  });
});

describe("dayBoundsInTz", () => {
  it("día calendario de Buenos Aires", () => {
    const b = dayBoundsInTz(new Date("2026-10-03T02:10:00Z"), BA); // 23:10 del 2/10
    expect(b.from.toISOString()).toBe("2026-10-02T03:00:00.000Z");
    expect(b.to.toISOString()).toBe("2026-10-03T03:00:00.000Z");
    const m = dayBoundsInTz(new Date("2026-10-03T03:00:00Z"), BA); // 00:00 del 3/10
    expect(m.from.toISOString()).toBe("2026-10-03T03:00:00.000Z");
    expect(m.to.toISOString()).toBe("2026-10-04T03:00:00.000Z");
  });

  it("otra tz da otro día", () => {
    const b = dayBoundsInTz(new Date("2026-10-03T02:10:00Z"), "Asia/Tokyo"); // 11:10 del 3/10
    expect(b.from.toISOString()).toBe("2026-10-02T15:00:00.000Z");
    expect(b.to.toISOString()).toBe("2026-10-03T15:00:00.000Z");
  });

  it("fin de mes", () => {
    const b = dayBoundsInTz(new Date("2026-11-01T01:00:00Z"), BA); // 22:00 del 31/10
    expect(b.from.toISOString()).toBe("2026-10-31T03:00:00.000Z");
    expect(b.to.toISOString()).toBe("2026-11-01T03:00:00.000Z");
  });
});

describe("BOT_AI_SYSTEM_PROMPT", () => {
  it("es constante y trae las acciones del menú", () => {
    expect(BOT_AI_SYSTEM_PROMPT).not.toMatch(/20\d\d/);
    expect(BOT_AI_SYSTEM_PROMPT).not.toContain("{");
    expect(BOT_AI_SYSTEM_PROMPT).not.toContain("Daiana");
    expect(BOT_AI_SYSTEM_PROMPT).toContain("*menú* y elegí 1");
    expect(BOT_AI_SYSTEM_PROMPT).toContain("*menú* y elegí 2");
    expect(BOT_AI_SYSTEM_PROMPT).toContain("respondé *0*");
  });
});

describe("buildQuestionMessage", () => {
  it("bloque de contexto con hora local + pregunta", () => {
    const m = buildQuestionMessage({
      question: "¿cuánto sale?",
      now: new Date("2026-10-03T02:10:00Z"),
      tz: BA,
      professionalName: "Lic. Daiana Ponce",
    });
    expect(m.startsWith("[Contexto] Fecha y hora del consultorio: ")).toBe(true);
    expect(m).toContain("viernes 2 de octubre de 2026");
    expect(m).toContain("23:10");
    expect(m).toContain("Nutricionista: Lic. Daiana Ponce.");
    expect(m.endsWith("Pregunta: ¿cuánto sale?")).toBe(true);
  });
});

describe("trimHistory", () => {
  it("deja las últimas en orden y recorta textos", () => {
    const h = Array.from({ length: 8 }, (_, i) => ({ question: `q${i}`, answer: `a${i}` }));
    const t = trimHistory(h, 6);
    expect(t.map((x) => x.question)).toEqual(["q2", "q3", "q4", "q5", "q6", "q7"]);
    const long = trimHistory([{ question: "q".repeat(700), answer: "a".repeat(1500) }], 6);
    expect(long[0]!.question.length).toBe(500);
    expect(long[0]!.answer.length).toBe(1000);
    expect(trimHistory(h, 0)).toEqual([]);
  });
});

describe("toWhatsAppText", () => {
  it("convierte markdown a formato de WhatsApp", () => {
    expect(toWhatsAppText("**Antropometría**")).toBe("*Antropometría*");
    expect(toWhatsAppText("__Antropometría__")).toBe("*Antropometría*");
    expect(toWhatsAppText("## Precios\nx")).toBe("Precios\nx");
    expect(toWhatsAppText("- a\n- b")).toBe("• a\n• b");
    expect(toWhatsAppText("* a\n* b")).toBe("• a\n• b");
    expect(toWhatsAppText("[portal](https://x)")).toBe("portal (https://x)");
    expect(toWhatsAppText("a\n\n\n\nb")).toBe("a\n\nb");
    expect(toWhatsAppText("```\ncodigo\n```")).toBe("codigo");
    expect(toWhatsAppText("Sale *$ 25.000*.")).toBe("Sale *$ 25.000*.");
    expect(toWhatsAppText("*negrita* al inicio")).toBe("*negrita* al inicio");
  });

  it("acota textos largos en un fin de oración", () => {
    const long = Array.from({ length: 60 }, (_, i) => `Oración número ${i} del texto.`).join(" ");
    expect(long.length).toBeGreaterThan(1500);
    const out = toWhatsAppText(long);
    expect(out.length).toBeLessThanOrEqual(BOT_AI_REPLY_MAX_CHARS);
    expect(out).toMatch(/[.!?…]$/);
  });
});

describe("cutAtSentence", () => {
  it("no toca un texto que entra", () => {
    expect(cutAtSentence("Hola.", 10)).toBe("Hola.");
  });

  it("corta en la última oración que entra", () => {
    expect(cutAtSentence("Uno dos. Tres cuatro. Cinco seis siete.", 25)).toBe("Uno dos. Tres cuatro.");
    // "$ 25.000" no es fin de oración
    expect(cutAtSentence("Sale $ 25.000 la consulta completa", 20)).toBe("Sale $ 25.000 la…");
  });

  it("sin puntos corta en espacio y agrega …", () => {
    const out = cutAtSentence("palabra palabra palabra palabra", 18);
    expect(out).toBe("palabra palabra…");
    expect(out.length).toBeLessThanOrEqual(18);
  });
});

describe("classifyAnswer", () => {
  it("detecta el ofrecimiento de la opción 0", () => {
    expect(classifyAnswer("Si querés que se lo pase, respondé *0* y listo.")).toBe("HANDOFF_OFFERED");
    expect(classifyAnswer("elegí la opción 0")).toBe("HANDOFF_OFFERED");
    expect(classifyAnswer("Respondé 0 para hablar con ella")).toBe("HANDOFF_OFFERED");
    expect(classifyAnswer("sale $ 25.000")).toBe("ANSWERED");
    expect(classifyAnswer("10:00")).toBe("ANSWERED");
  });
});

describe("validateBotAiInfo", () => {
  it("máximo 2.000 caracteres sin contar bordes", () => {
    expect(validateBotAiInfo("a".repeat(2000))).toBeNull();
    expect(validateBotAiInfo(`  ${"a".repeat(2000)}  `)).toBeNull();
    expect(validateBotAiInfo("a".repeat(2001))).toBe("Máximo 2.000 caracteres (tenés 2.001).");
    expect(validateBotAiInfo("a".repeat(2345))).toBe("Máximo 2.000 caracteres (tenés 2.345).");
  });
});

describe("isBotAiAvailable", () => {
  it("solo con interruptor y proveedor", () => {
    expect(isBotAiAvailable({ enabled: true, hasProvider: true })).toBe(true);
    expect(isBotAiAvailable({ enabled: true, hasProvider: false })).toBe(false);
    expect(isBotAiAvailable({ enabled: false, hasProvider: true })).toBe(false);
    expect(isBotAiAvailable({ enabled: false, hasProvider: false })).toBe(false);
  });
});

describe("inquiryBodyFromAiQuestion (P6, con prefijo)", () => {
  it("prefija la pregunta", () => {
    expect(BOT_AI_INQUIRY_PREFIX).toBe("Pregunta al asistente: ");
    expect(inquiryBodyFromAiQuestion("hacen factura C?")).toBe("Pregunta al asistente: hacen factura C?");
  });
});

describe("messages (HU-012)", () => {
  it("menu sin preguntas es idéntico a MENU", () => {
    expect(messages.menu({ withQuestions: false })).toBe(messages.MENU);
  });

  it("menu con preguntas suma la opción 5 entre la 4 y la 0", () => {
    const m = messages.menu({ withQuestions: true });
    expect(m).toBe(messages.MENU_WITH_QUESTIONS);
    const lines = m.split("\n");
    const i4 = lines.findIndex((l) => l.startsWith("4️⃣"));
    const i5 = lines.indexOf("5️⃣ Hacer una pregunta");
    const i0 = lines.findIndex((l) => l.startsWith("0️⃣"));
    expect(i5).toBe(i4 + 1);
    expect(i0).toBe(i5 + 1);
  });

  it("greetByName/welcomeBack sin regresión y con el menú nuevo", () => {
    expect(messages.greetByName("Ana")).toBe(messages.greetByName("Ana", messages.MENU));
    expect(messages.greetByName("Ana")).toBe(`¡Gracias, Ana! 🙌\n\n${messages.MENU}`);
    expect(messages.welcomeBack("Ana")).toBe(`¡Hola de nuevo, Ana! 👋\n\n${messages.MENU}`);
    expect(messages.greetByName("Ana", messages.MENU_WITH_QUESTIONS)).toContain("5️⃣");
    expect(messages.welcomeBack("Ana", messages.MENU_WITH_QUESTIONS)).toContain("5️⃣");
  });

  it("QUESTION_MODE_INTRO avisa de la IA, la opción 0 y cómo volver", () => {
    expect(messages.QUESTION_MODE_INTRO).toContain("inteligencia artificial");
    expect(messages.QUESTION_MODE_INTRO).toContain("opción *0*");
    expect(messages.QUESTION_MODE_INTRO).toContain("escribí *menú*");
  });
});
