// HU-023: los tokens cifrados solo los lee domain/mercadopagoAccount.ts, y el token del .env solo
// existe como respaldo explícito de desarrollo (core/mercadopago-oauth.ts + mercadopagoAccount.ts).
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = resolve(__dirname, "../../..");
const DIRS = ["packages/db/domain", "packages/core/src", "apps/web/src", "apps/bot/src"];
const SKIP = new Set(["node_modules", ".next", "dist"]);

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name)) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...sourceFiles(full));
    else if (/\.(ts|tsx)$/.test(name)) out.push(full);
  }
  return out;
}

const isTest = (file: string) => /\.test\.(ts|tsx)$/.test(file);

const files = DIRS.flatMap((d) => sourceFiles(join(ROOT, d)))
  .filter((f) => !isTest(f))
  .map((f) => ({ path: relative(ROOT, f), text: readFileSync(f, "utf8") }));

function filesMentioning(pattern: RegExp): string[] {
  return files.filter((f) => pattern.test(f.text)).map((f) => f.path).sort();
}

describe("privacidad de los tokens de Mercado Pago (HU-023)", () => {
  it("escanea código real (sanity check)", () => {
    expect(files.some((f) => f.path === "packages/db/domain/payments.ts")).toBe(true);
    expect(files.some((f) => f.path.startsWith("apps/web/src/"))).toBe(true);
    expect(files.some((f) => f.path.startsWith("apps/bot/src/"))).toBe(true);
  });

  it("las columnas cifradas solo aparecen en mercadopagoAccount.ts", () => {
    expect(filesMentioning(/accessTokenEnc|refreshTokenEnc|codeVerifierEnc/)).toEqual([
      "packages/db/domain/mercadopagoAccount.ts",
    ]);
  });

  it("MERCADOPAGO_ACCESS_TOKEN solo como respaldo de desarrollo (ya no en payments.ts)", () => {
    expect(filesMentioning(/MERCADOPAGO_ACCESS_TOKEN/)).toEqual([
      "packages/core/src/mercadopago-oauth.ts",
      "packages/db/domain/mercadopagoAccount.ts",
    ]);
  });

  it("secretBox no se re-exporta desde domain/index.ts", () => {
    const index = files.find((f) => f.path === "packages/db/domain/index.ts")!.text;
    expect(index).not.toMatch(/secretBox|mercadopagoOAuthClient/);
    expect(index).toMatch(/export \* from "\.\/mercadopagoAccount";/);
  });
});
