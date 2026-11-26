import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";

vi.mock("@/auth", () => ({ signIn: vi.fn() }));

import { OnboardingSignupForm } from "./onboarding-signup-form";

it("asks for the display name separately from the clinic and sends only setup fields", () => {
  const out = renderToStaticMarkup(createElement(OnboardingSignupForm, { action: vi.fn() }));

  expect(out).toMatch(/<label[^>]*for="onboarding-clinic-name"[^>]*>Nombre del consultorio<\/label>/);
  expect(out).toMatch(/<label[^>]*for="onboarding-professional-name"[^>]*>Nombre profesional que querés mostrar<\/label>/);
  expect(out).toMatch(/<input(?=[^>]*\bname="name")(?=[^>]*\brequired)[^>]*>/);
  expect(out).toMatch(/<input(?=[^>]*\bname="professionalName")(?=[^>]*\brequired)[^>]*>/);
  expect(out).toMatch(/<select(?=[^>]*\bname="timeZone")(?=[^>]*\brequired)[^>]*>/);
  expect(out).not.toMatch(/name="(?:tenantId|userId|email)"/);
  expect(out).not.toContain('role="alert"');
});

it("renders accessible error feedback and preserves entered values for retry", () => {
  const out = renderToStaticMarkup(
    createElement(OnboardingSignupForm, {
      action: vi.fn(),
      initialState: {
        error: "Elegí una zona horaria válida.",
        values: { name: "Consultorio Sur", professionalName: "Dra. Ana Sur", timeZone: "" },
      },
    }),
  );

  expect(out).toMatch(/<p[^>]*role="alert"[^>]*>Elegí una zona horaria válida\.<\/p>/);
  expect(out).toContain('value="Consultorio Sur"');
  expect(out).toContain('value="Dra. Ana Sur"');
});
