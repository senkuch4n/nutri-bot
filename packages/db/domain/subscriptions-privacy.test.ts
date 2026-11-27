// HU-029b (SDD §B.9.2, privacy): el token de Arzium y el email del pagador no se filtran. Lectura de source,
// sin base ni red.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = resolve(__dirname, "../../..");
const DIRS = ["packages", "apps"];
// Los *.integration.ts (probes en Postgres descartable) usan un token falso de prueba: cuentan como tests.
const SKIP = new Set(["node_modules", ".next", "dist", "media", "data"]);

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name) || name.startsWith(".")) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...sourceFiles(full));
    else if (/\.(ts|tsx)$/.test(name) && !/\.(test|integration)\.(ts|tsx)$/.test(name)) out.push(full);
  }
  return out;
}

const files = DIRS.flatMap((d) => sourceFiles(join(ROOT, d))).map((f) => ({ path: relative(ROOT, f), text: readFileSync(f, "utf8") }));
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
/** Sin comentarios de línea ni de bloque (los comentarios explican reglas y nombran cosas prohibidas). */
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const SUBS = "packages/db/domain/subscriptions.ts";
const GATEWAY = "packages/db/domain/subscriptionsGateway.ts";

describe("privacidad de la suscripción de Arzium (HU-029b)", () => {
  it("escanea código real (sanity check)", () => {
    expect(files.some((f) => f.path === SUBS)).toBe(true);
    expect(files.some((f) => f.path.startsWith("apps/web/src/"))).toBe(true);
    expect(files.some((f) => f.path.startsWith("apps/bot/src/"))).toBe(true);
  });

  it("subscriptions.ts y subscriptionsGateway.ts no importan mercadopagoAccount ni payments", () => {
    for (const p of [SUBS, GATEWAY]) {
      expect(code(p)).not.toMatch(/from "\.\/(mercadopagoAccount|payments)"/);
      expect(code(p)).not.toMatch(/getMercadoPagoCredentials/);
    }
  });

  it("ARZIUM_MERCADOPAGO_ACCESS_TOKEN: el valor solo lo lee el gateway; core solo comprueba que no esté vacío", () => {
    const mentioning = files.filter((f) => f.text.includes("ARZIUM_MERCADOPAGO_ACCESS_TOKEN")).map((f) => f.path).sort();
    // El script de la corrida en sandbox (029a) y su guarda usan el token del vendedor de PRUEBA desde
    // .env.mp-sandbox.local (nunca el .env de la raíz).
    expect(mentioning).toEqual([
      "packages/core/src/subscription-billing.ts",
      GATEWAY,
      "packages/db/scripts/lib/mp-sandbox-guard.ts",
      "packages/db/scripts/mp-subscriptions-sandbox.ts",
    ]);
    const coreLines = read("packages/core/src/subscription-billing.ts")
      .split("\n")
      .filter((l) => l.includes("ARZIUM_MERCADOPAGO_ACCESS_TOKEN"));
    expect(coreLines.map((l) => l.trim())).toEqual([
      'if (!env.ARZIUM_MERCADOPAGO_ACCESS_TOKEN?.trim()) missing.push("ARZIUM_MERCADOPAGO_ACCESS_TOKEN");',
    ]);
  });

  it("los console.* de subscriptions.ts solo reciben códigos e ids internos (nunca error, snapshot ni email)", () => {
    const calls = [...code(SUBS).matchAll(/console\.\w+\(([^;]*)\);/g)].map((m) => m[1]!);
    expect(calls.length).toBeGreaterThan(0);
    for (const args of calls) {
      const m = /^\s*"\[subscriptions\] [a-z_]+"(.*)$/s.exec(args);
      expect(m, args).not.toBeNull();
      // Lo que sigue al código: solo { op }, { missing }, { planId } o { subscriptionId }.
      expect(m![1]!.trim()).toMatch(/^(|,\s*\{\s*(op|missing: config\.missing|planId: [\w.]+|subscriptionId: [\w.]+)\s*\})$/);
    }
    expect(code(GATEWAY)).not.toMatch(/console\./);
  });

  it("los eventos nunca reciben el email del pagador", () => {
    const src = code(SUBS);
    const logEvent = src.slice(src.indexOf("async function logEvent"), src.indexOf("const resultOf"));
    expect(logEvent).not.toMatch(/email|payer/i);
    for (const m of src.matchAll(/logEvent\([^)]*\{([\s\S]*?)\}\)/g)) expect(m[1]).not.toMatch(/email|payer/i);
  });
});
