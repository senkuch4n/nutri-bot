import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/auth", () => ({ signIn: vi.fn() }));

import { OnboardingPendingScreen } from "./onboarding-pending-screen";
import { ARZIUM_CONTACT_EMAIL } from "./public-page";

function renderPendingScreen() {
  return renderToStaticMarkup(createElement(OnboardingPendingScreen, { clinicName: "Consultorio del Sur" }));
}

describe("OnboardingPendingScreen", () => {
  it("shows the saved clinic and what is still pending", () => {
    const out = renderPendingScreen();

    expect(out).toMatch(/<h1[^>]*>Consultorio del Sur<\/h1>/);
    expect(out).toContain('aria-label="Progreso del alta"');
    expect(out).toContain("Configuración guardada");
    expect(out).toContain("Suscripción pendiente");
    expect(out).toContain("Todavía no podés operar el consultorio.");
  });

  it("links to subscription and to the published contact without linking to the panel", () => {
    const out = renderPendingScreen();

    expect(out).toMatch(/<a[^>]*href="\/ajustes\/suscripcion"[^>]*>Ir a la suscripción<\/a>/);
    expect(out).toContain(`href="mailto:${ARZIUM_CONTACT_EMAIL}"`);
    expect(out).not.toContain('href="/"');
  });
});
