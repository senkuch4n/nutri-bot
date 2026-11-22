// HU-025a2 (6.3): puerta central por request, sin base ni red.
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ loadAccessFacts: vi.fn() }));
// `auth(handler)` de Auth.js decodifica el JWT y deja la sesión en `req.auth`; acá se la pasa el test.
vi.mock("@/auth", () => ({ auth: (handler: unknown) => handler }));
vi.mock("@/lib/tenant-context", () => ({ ENABLED_TENANT_IDS: ["legacy-tenant"] }));
vi.mock("@nutri-bot/db/domain", () => ({ loadAccessFacts: mocks.loadAccessFacts }));

import middleware, { config, panelGate } from "./middleware";

type Role = "OWNER" | "STAFF";
const facts = (memberships: { tenantId: string; role: Role }[]) =>
  ({ linked: true, memberships, platformOperator: false, activeSupportGrants: [] });
const legacyOwner = facts([{ tenantId: "legacy-tenant", role: "OWNER" }]);
const session = { userId: "user-a", user: { email: "ana@example.test" }, expires: "2030-01-01" };

function request(path: string, opts: { auth?: unknown; method?: string; headers?: Record<string, string> } = {}) {
  const req = new NextRequest(new URL(path, "https://panel.example.test"), {
    method: opts.method ?? "GET",
    headers: opts.headers,
  });
  return Object.assign(req, { auth: (opts.auth === undefined ? session : opts.auth) as never });
}

const page = (auth?: unknown) => request("/pacientes", { auth });
const api = (auth?: unknown) => request("/api/slots?date=2030-01-01", { auth });
const action = (auth?: unknown) =>
  request("/pacientes", { auth, method: "POST", headers: { "next-action": "abc123" } });

function expectRedirectToInicio(res: Response) {
  expect(res.status).toBe(307);
  expect(res.headers.get("location")).toBe("https://panel.example.test/inicio");
}
async function expectUnauthorized(res: Response) {
  expect(res.status).toBe(401);
  expect(await res.json()).toEqual({ error: "unauthorized" });
}
const passes = (res: Response) => expect(res.headers.get("x-middleware-next")).toBe("1");

describe("middleware (opción A, runtime Node)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.loadAccessFacts.mockResolvedValue(legacyOwner);
  });

  it("corre en Node y el default es la puerta envuelta por auth()", () => {
    expect(config.runtime).toBe("nodejs");
    expect(middleware).toBe(panelGate);
  });

  it.each([
    ["sin sesión", null],
    ["sesión sin userId (conflicto o JWT viejo)", { user: { email: "ana@example.test" } }],
  ])("%s → página: redirect a /inicio; API y server action: 401; sin tocar la base", async (_name, auth) => {
    expectRedirectToInicio(await panelGate(page(auth)));
    await expectUnauthorized(await panelGate(api(auth)));
    await expectUnauthorized(await panelGate(action(auth)));
    expect(mocks.loadAccessFacts).not.toHaveBeenCalled();
  });

  it.each([
    ["sin membresía (identidad pendiente)", facts([]), "no_membership"],
    ["User inexistente", null, "unlinked"],
    ["dos membresías", facts([{ tenantId: "legacy-tenant", role: "OWNER" }, { tenantId: "b", role: "STAFF" }]), "multiple_memberships"],
    ["membresía en otro tenant (fuera del candado)", facts([{ tenantId: "tenant-b", role: "OWNER" }]), "tenant_not_enabled"],
  ])("%s → rechazo en página, API y server action, log solo con código", async (_name, f, reason) => {
    mocks.loadAccessFacts.mockResolvedValue(f);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      expectRedirectToInicio(await panelGate(page()));
      await expectUnauthorized(await panelGate(api()));
      await expectUnauthorized(await panelGate(action()));
      expect(warn.mock.calls).toEqual(Array(3).fill([`[auth] access_denied reason=${reason}`]));
      expect(JSON.stringify(warn.mock.calls)).not.toMatch(/ana@example|user-a/);
    } finally {
      warn.mockRestore();
    }
  });

  it.each([
    ["página", page],
    ["API", api],
    ["server action", action],
  ] as const)("con membresía vigente deja pasar la %s", async (_name, make) => {
    passes(await panelGate(make()));
    expect(mocks.loadAccessFacts).toHaveBeenCalledWith("user-a", expect.any(Date));
  });

  it("STAFF del consultorio original también pasa", async () => {
    mocks.loadAccessFacts.mockResolvedValue(facts([{ tenantId: "legacy-tenant", role: "STAFF" }]));
    passes(await panelGate(page()));
  });

  it("membresía revocada con la sesión abierta: la siguiente página, API y server action se rechazan", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      passes(await panelGate(page()));
      mocks.loadAccessFacts.mockResolvedValue(facts([]));
      expectRedirectToInicio(await panelGate(page()));
      await expectUnauthorized(await panelGate(api()));
      await expectUnauthorized(await panelGate(action()));
      expect(mocks.loadAccessFacts).toHaveBeenCalledTimes(4); // se lee en cada request
    } finally {
      warn.mockRestore();
    }
  });

  it("un header x-tenant-id o campos forjados en la sesión no cambian la decisión", async () => {
    mocks.loadAccessFacts.mockResolvedValue(facts([{ tenantId: "tenant-b", role: "OWNER" }]));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const forged = request("/pacientes", {
        auth: { ...session, tenantId: "legacy-tenant", role: "OWNER" },
        headers: { "x-tenant-id": "legacy-tenant" },
      });
      expectRedirectToInicio(await panelGate(forged));
    } finally {
      warn.mockRestore();
    }
  });
});

describe("matcher", () => {
  const matcher = new RegExp(`^${config.matcher[0]}$`);
  it("excludes the exact webhook", () => {
    expect(matcher.test("/api/webhooks/mercadopago")).toBe(false);
  });
  it("serves the Numa logo without authentication", () => {
    expect(matcher.test("/numa-logo.png")).toBe(false);
    expect(matcher.test("/numa-logo.png/private")).toBe(true);
  });
  it.each(["/opengraph-image.png", "/icon.png", "/apple-icon.png"])("serves %s for link previews without authentication", (pathname) => {
    expect(matcher.test(pathname)).toBe(false);
  });
  it.each(["/api/webhooks/other", "/api/webhooks/mercadopago-private", "/api/webhooks/mercadopago/other", "/agenda", "/api/professional/signature", "/api/professional/logo", "/api/mercadopago/oauth/callback"])("keeps %s protected", (pathname) => {
    expect(matcher.test(pathname)).toBe(true);
  });
  it.each(["/inicio", "/login", "/portal", "/api/auth/session", "/acerca", "/privacidad"])(
    "deja %s fuera de la puerta (públicas o con su propia sesión)",
    (pathname) => {
      expect(matcher.test(pathname)).toBe(false);
    },
  );
});
