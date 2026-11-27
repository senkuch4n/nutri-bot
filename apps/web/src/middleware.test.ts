// HU-025a2 (6.3): puerta central por request, sin base ni red.
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  loadAccessFacts: vi.fn(),
  loadOnboardedClinic: vi.fn(),
  getTenantSubscriptionGate: vi.fn(),
}));
// `auth(handler)` de Auth.js decodifica el JWT y deja la sesión en `req.auth`; acá se la pasa el test.
vi.mock("server-only", () => ({}));
vi.mock("@/auth", () => ({ auth: (handler: unknown) => handler }));
vi.mock("@/lib/tenant-context", () => ({ ENABLED_TENANT_IDS: ["legacy-tenant"] }));
vi.mock("@/lib/onboarding-server", () => ({ loadOnboardedClinic: mocks.loadOnboardedClinic }));
vi.mock("@/lib/onboarding-subscription-gate", () => ({ getTenantSubscriptionGate: mocks.getTenantSubscriptionGate }));
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
    mocks.loadOnboardedClinic.mockResolvedValue(null);
    mocks.getTenantSubscriptionGate.mockResolvedValue("pending");
  });

  it("corre en Node y el default es la puerta envuelta por auth()", () => {
    expect(config.runtime).toBe("nodejs");
    expect(middleware).toBe(panelGate);
  });

  it.each([
    ["sin sesión", null],
    ["sesión sin userId (conflicto o JWT viejo)", { user: { email: "ana@example.test" } }],
  ])("%s → página: redirect a /inicio; API: 401; server action: pasa al handler (falla cerrado); sin tocar la base", async (_name, auth) => {
    expectRedirectToInicio(await panelGate(page(auth)));
    await expectUnauthorized(await panelGate(api(auth)));
    passes(await panelGate(action(auth)));
    expect(mocks.loadAccessFacts).not.toHaveBeenCalled();
  });

  it.each([
    ["sin membresía (identidad pendiente)", facts([]), "no_membership"],
    ["User inexistente", null, "unlinked"],
    ["dos membresías", facts([{ tenantId: "legacy-tenant", role: "OWNER" }, { tenantId: "b", role: "STAFF" }]), "multiple_memberships"],
    ["membresía en otro tenant (fuera del candado)", facts([{ tenantId: "tenant-b", role: "OWNER" }]), "tenant_not_enabled"],
  ])("%s → rechazo en página y API; la server action pasa al handler; log solo con código", async (_name, f, reason) => {
    mocks.loadAccessFacts.mockResolvedValue(f);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      expectRedirectToInicio(await panelGate(page()));
      await expectUnauthorized(await panelGate(api()));
      passes(await panelGate(action()));
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

  it("membresía revocada con la sesión abierta: la siguiente página y API se rechazan; la action la rechaza su handler", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      passes(await panelGate(page()));
      mocks.loadAccessFacts.mockResolvedValue(facts([]));
      expectRedirectToInicio(await panelGate(page()));
      await expectUnauthorized(await panelGate(api()));
      passes(await panelGate(action()));
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

  it.each(["not_required", "verified"] as const)("HU-026: consultorio nuevo completo con gate %s deja pasar página, API y action", async (gate) => {
    mocks.loadAccessFacts.mockResolvedValue(facts([{ tenantId: "clinic-new", role: "OWNER" }]));
    mocks.loadOnboardedClinic.mockResolvedValue({ name: "Consultorio Nuevo", setupComplete: true });
    mocks.getTenantSubscriptionGate.mockResolvedValue(gate);
    passes(await panelGate(page()));
    passes(await panelGate(api()));
    passes(await panelGate(action()));
  });

  it.each(["pending", "error"] as const)("HU-026: titular con suscripción %s es bloqueada en página y API sin filtrar PII", async (state) => {
    mocks.loadAccessFacts.mockResolvedValue(facts([{ tenantId: "clinic-new", role: "OWNER" }]));
    mocks.loadOnboardedClinic.mockResolvedValue({ name: "Consultorio Nuevo", setupComplete: true });
    if (state === "error") mocks.getTenantSubscriptionGate.mockRejectedValue(new Error("provider down"));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      expectRedirectToInicio(await panelGate(page()));
      await expectUnauthorized(await panelGate(api()));
      passes(await panelGate(action()));
      expect(warn.mock.calls).toEqual(Array(3).fill(["[auth] access_denied reason=onboarding_pending"]));
      expect(JSON.stringify(warn.mock.calls)).not.toMatch(/ana@example|user-a|Consultorio/);
    } finally {
      warn.mockRestore();
    }
  });

  it("HU-026: titular con alta incompleta es bloqueada en página y API sin consultar suscripción", async () => {
    mocks.loadAccessFacts.mockResolvedValue(facts([{ tenantId: "clinic-new", role: "OWNER" }]));
    mocks.loadOnboardedClinic.mockResolvedValue({ name: "Consultorio Nuevo", setupComplete: false });
    mocks.getTenantSubscriptionGate.mockResolvedValue("verified");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      expectRedirectToInicio(await panelGate(page()));
      await expectUnauthorized(await panelGate(api()));
      expect(mocks.getTenantSubscriptionGate).not.toHaveBeenCalled();
      expect(warn.mock.calls).toEqual(Array(2).fill(["[auth] access_denied reason=onboarding_setup"]));
    } finally {
      warn.mockRestore();
    }
  });
});

// HU-029b (§B.6.7 punto 3): la OWNER en onboarding (alta completa, suscripción pendiente) entra solo a
// /ajustes/suscripcion (y su vuelta ?mp=volver); el resto del panel la sigue mandando a /inicio.
describe("HU-029b: /ajustes/suscripcion para la titular en onboarding", () => {
  const newClinic = { name: "Consultorio Nuevo", timeZone: "America/Montevideo", setupComplete: true };
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.loadAccessFacts.mockResolvedValue(facts([{ tenantId: "clinic-new", role: "OWNER" }]));
    mocks.loadOnboardedClinic.mockResolvedValue(newClinic);
    mocks.getTenantSubscriptionGate.mockResolvedValue("pending");
  });

  it.each(["/ajustes/suscripcion", "/ajustes/suscripcion?mp=volver"])("OWNER en onboarding → GET %s pasa, sin console.warn", async (path) => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      passes(await panelGate(request(path)));
      expect(warn).not.toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });

  it("las server actions de la página pasan (las frena requireSubscriptionOwnerContext)", async () => {
    passes(await panelGate(request("/ajustes/suscripcion", { method: "POST", headers: { "next-action": "abc" } })));
  });

  it.each(["/ajustes", "/ajustes/suscripcion/x", "/ajustes/suscripcionx", "/agenda", "/api/slots"])(
    "la misma OWNER → %s sigue rechazada con access_denied reason=onboarding_pending",
    async (path) => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      try {
        const res = await panelGate(request(path));
        if (path.startsWith("/api/")) await expectUnauthorized(res);
        else expectRedirectToInicio(res);
        expect(warn.mock.calls).toEqual([["[auth] access_denied reason=onboarding_pending"]]);
      } finally {
        warn.mockRestore();
      }
    },
  );

  it("OWNER con el alta incompleta (setup) → /ajustes/suscripcion redirige a /inicio", async () => {
    mocks.loadOnboardedClinic.mockResolvedValue({ ...newClinic, setupComplete: false });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      expectRedirectToInicio(await panelGate(request("/ajustes/suscripcion")));
      expect(warn.mock.calls).toEqual([["[auth] access_denied reason=onboarding_setup"]]);
    } finally {
      warn.mockRestore();
    }
  });

  it("STAFF con la suscripción pendiente → /ajustes/suscripcion redirige a /inicio", async () => {
    mocks.loadAccessFacts.mockResolvedValue(facts([{ tenantId: "clinic-new", role: "STAFF" }]));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      expectRedirectToInicio(await panelGate(request("/ajustes/suscripcion")));
      expect(warn.mock.calls).toEqual([["[auth] access_denied reason=subscription_pending"]]);
    } finally {
      warn.mockRestore();
    }
  });

  it("usuaria operativa → /ajustes/suscripcion pasa (regresión)", async () => {
    mocks.loadAccessFacts.mockResolvedValue(legacyOwner);
    passes(await panelGate(request("/ajustes/suscripcion")));
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
  // HU-029b (§B.6.6): el webhook de suscripciones de Arzium tampoco pasa por la puerta del panel.
  it("excluye el webhook exacto de suscripciones", () => {
    expect(matcher.test("/api/webhooks/mercadopago-suscripciones")).toBe(false);
    expect(matcher.test("/api/webhooks/mercadopago-suscripciones/x")).toBe(true);
    expect(matcher.test("/api/webhooks/mercadopago-otra")).toBe(true);
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
