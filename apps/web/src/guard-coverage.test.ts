// HU-025 (025b-2 M12, 10.2 de la SDD): test de guarda. Lee el código con `fs` y falla el CI si:
//   (a) un archivo "use server" del panel o de /api exporta una función que no pasa por
//       requireTenantContext( / requireOwnerContext( / requirePageContext( (directo o vía un helper local);
//   (b) un route.ts de /api (salvo api/auth y api/webhooks) o del panel no lee el contexto;
//   (c) aparece el adaptador legacy, getProfessional( o `where: { id: 1 }` en el panel, /api o lib/.
// Con el middleware dejando pasar las server actions al handler (6.3), (a) es la barrera de las acciones.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const SRC = fileURLToPath(new URL(".", import.meta.url));
const APP = join(SRC, "app");
const PANEL = join(APP, "(panel)");
const API = join(APP, "api");
const LIB = join(SRC, "lib");

const ACTION_GUARDS = ["requireTenantContext(", "requireOwnerContext(", "requirePageContext("];
const ROUTE_GUARDS = ["getTenantContext(", "requireTenantContext("];
/** Rutas API sin sesión del panel: Auth.js y el webhook firmado de Mercado Pago (el tenant sale del pago). */
const API_EXEMPT = [join(API, "auth"), join(API, "webhooks")];

/** Excepciones de (c), cada una con su motivo y la entrega que la cierra. */
const LEGACY_EXEMPT: Record<string, string> = {
  // Google Calendar sigue escribiendo la agenda legacy hasta HU-028 (D10).
  "auth.ts": "calendario legacy hasta HU-028",
  // Funciones del PORTAL (getProfessionalPortalName/Contact, getPortalDocumentTitle): 025c las pasa al tenant
  // del paciente. Las del panel (nombre, estado del bot, consultas) ya reciben tenantId.
  "lib/shell.ts": "funciones del portal hasta 025c",
  // Reexporta getProfessional para el portal (025c lo elimina); no lo llama.
  "lib/professional.ts": "reexport para el portal hasta 025c",
};

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

const isSource = (p: string) => /\.(ts|tsx)$/.test(p) && !/\.test\.(ts|tsx)$/.test(p);
const rel = (p: string) => relative(SRC, p).split(sep).join("/");

function isUseServer(source: string): boolean {
  const file = ts.createSourceFile("x.ts", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const first = file.statements[0];
  return Boolean(
    first && ts.isExpressionStatement(first) && ts.isStringLiteral(first.expression) && first.expression.text === "use server",
  );
}

type Fn = { name: string; exported: boolean; body: string };

/** Funciones de nivel superior: `function f() {}` y `const f = async () => {}` / `function` expressions. */
function topLevelFunctions(source: string): Fn[] {
  const file = ts.createSourceFile("x.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const exported = (node: ts.Node) =>
    ts.canHaveModifiers(node) && (ts.getModifiers(node) ?? []).some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
  const out: Fn[] = [];
  for (const stmt of file.statements) {
    if (ts.isFunctionDeclaration(stmt) && stmt.name && stmt.body) {
      out.push({ name: stmt.name.text, exported: exported(stmt), body: stmt.body.getText(file) });
    } else if (ts.isVariableStatement(stmt)) {
      for (const decl of stmt.declarationList.declarations) {
        const init = decl.initializer;
        if (ts.isIdentifier(decl.name) && init && (ts.isArrowFunction(init) || ts.isFunctionExpression(init))) {
          out.push({ name: decl.name.text, exported: exported(stmt), body: init.body.getText(file) });
        }
      }
    }
  }
  return out;
}

/** ¿El cuerpo pasa por una guarda, directo o llamando a un helper local que la tenga? */
function guarded(fn: Fn, all: Map<string, Fn>, guards: string[], seen = new Set<string>()): boolean {
  if (guards.some((g) => fn.body.includes(g))) return true;
  seen.add(fn.name);
  for (const [name, helper] of all) {
    if (seen.has(name) || !new RegExp(`\\b${name}\\(`).test(fn.body)) continue;
    if (guarded(helper, all, guards, seen)) return true;
  }
  return false;
}

const scope = [...walk(PANEL), ...walk(API)].filter(isSource);

describe("detector de guardas (autoprueba)", () => {
  const check = (source: string) => {
    const fns = topLevelFunctions(source);
    const all = new Map(fns.map((f) => [f.name, f]));
    return fns.filter((f) => f.exported && !guarded(f, all, ACTION_GUARDS)).map((f) => f.name);
  };
  it("marca una acción exportada sin guarda y acepta la guarda directa o vía helper local", () => {
    expect(isUseServer(`"use server";\nexport async function a() {}`)).toBe(true);
    expect(isUseServer(`import x from "y";\n"use server";`)).toBe(false);
    expect(check(`
      async function helper() { return requireTenantContext("write"); }
      export async function direct() { await requireOwnerContext(); }
      export async function viaHelper() { await helper(); }
      export const arrow = async () => { await requireTenantContext("read").catch(() => null); };
      export async function naked(id: string) { await prisma.x.delete({ where: { id } }); }
      export const nakedArrow = async () => helperless();
    `)).toEqual(["naked", "nakedArrow"]);
  });
});

describe("guard-coverage (HU-025, 10.2)", () => {
  const serverFiles = scope.filter((p) => isUseServer(readFileSync(p, "utf8")));

  it("encuentra los archivos de server actions del panel (sanidad del test)", () => {
    expect(serverFiles.length).toBeGreaterThan(25);
    expect(serverFiles.map(rel)).toContain("app/(panel)/ajustes/team-actions.ts");
  });

  it.each(serverFiles.map((p) => [rel(p), p]))("(a) %s: toda función exportada exige el contexto", (_name, path) => {
    const fns = topLevelFunctions(readFileSync(path, "utf8"));
    const all = new Map(fns.map((f) => [f.name, f]));
    const exported = fns.filter((f) => f.exported);
    expect(exported.length).toBeGreaterThan(0);
    const unguarded = exported.filter((f) => !guarded(f, all, ACTION_GUARDS)).map((f) => f.name);
    expect(unguarded).toEqual([]);
  });

  const routes = scope.filter((p) => /[\\/]route\.ts$/.test(p) && !API_EXEMPT.some((dir) => p.startsWith(dir)));

  it("encuentra las rutas con sesión del panel (sanidad del test)", () => {
    expect(routes.map(rel)).toEqual(expect.arrayContaining([
      "app/api/appointments/route.ts",
      "app/api/slots/route.ts",
      "app/api/professional/logo/route.ts",
      "app/api/professional/signature/route.ts",
      "app/api/mercadopago/oauth/callback/route.ts",
    ]));
  });

  it.each(routes.map((p) => [rel(p), p]))("(b) %s lee el contexto del consultorio", (_name, path) => {
    const source = readFileSync(path, "utf8");
    expect(ROUTE_GUARDS.some((g) => source.includes(g))).toBe(true);
  });

  const legacyScope = [...scope, ...walk(LIB).filter(isSource), join(SRC, "auth.ts")];
  const FORBIDDEN: [string, RegExp][] = [
    ["resolveLegacy", /resolveLegacy/],
    ["legacySchedulingScope", /legacySchedulingScope/],
    ["getProfessional(", /\bgetProfessional\(/],
    ["where: { id: 1 }", /where:\s*\{\s*id:\s*1\s*\}/],
  ];

  it.each(legacyScope.map((p) => [rel(p), p]))("(c) %s no usa el adaptador legacy ni Professional(1)", (name, path) => {
    if (LEGACY_EXEMPT[name]) return;
    const source = readFileSync(path, "utf8");
    const hits = FORBIDDEN.filter(([, re]) => re.test(source)).map(([label]) => label);
    expect(hits).toEqual([]);
  });

  it("las excepciones de (c) siguen existiendo (si se arreglan, se sacan de la lista)", () => {
    for (const name of Object.keys(LEGACY_EXEMPT)) {
      const source = readFileSync(join(SRC, name), "utf8");
      expect(FORBIDDEN.some(([, re]) => re.test(source)) || /getProfessional\b/.test(source), name).toBe(true);
    }
  });
});
