import { expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { createOnboardingSignupAction } from "./onboarding-signup-action";

const userId = "verified-user";
const tenantId = "clinic-from-domain";
const fields = { name: "Consultorio del Sur", professionalName: "Ana Sur", timeZone: "America/Montevideo" };

function signupForm() {
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) form.set(key, ` ${value} `);
  form.set("userId", "user-from-browser");
  form.set("tenantId", "clinic-from-browser");
  form.set("email", "browser@example.test");
  return form;
}

function setup() {
  const readSession = vi.fn().mockResolvedValue({ userId, tenantId: "ignored-session-tenant" });
  const createOrResumeClinic = vi.fn().mockResolvedValue({ tenantId });
  const provisionClinic = vi.fn().mockResolvedValue(undefined);
  const onComplete = vi.fn();
  const submit = createOnboardingSignupAction({ readSession, createOrResumeClinic, provisionClinic, onComplete });
  return { submit, readSession, createOrResumeClinic, provisionClinic, onComplete };
}

it("uses the session identity and the clinic returned by the domain, not form IDs or email", async () => {
  const { submit, createOrResumeClinic, provisionClinic, onComplete } = setup();

  await submit(signupForm());

  expect(createOrResumeClinic.mock.calls).toEqual([[{ userId, name: fields.name, timeZone: fields.timeZone }]]);
  expect(provisionClinic.mock.calls).toEqual([[{ userId, expectedTenantId: tenantId, professionalName: fields.professionalName }]]);
  expect(onComplete).toHaveBeenCalledOnce();
});

it("rejects a submission without a linked session before calling any writer", async () => {
  const { submit, readSession, createOrResumeClinic, provisionClinic, onComplete } = setup();
  readSession.mockResolvedValue({});

  await expect(submit(signupForm())).rejects.toThrow("Verified identity is required");
  expect(createOrResumeClinic).not.toHaveBeenCalled();
  expect(provisionClinic).not.toHaveBeenCalled();
  expect(onComplete).not.toHaveBeenCalled();
});

it.each(["name", "professionalName", "timeZone"] as const)("checks required %s before the first write", async (field) => {
  const { submit, createOrResumeClinic, provisionClinic, onComplete } = setup();
  const form = signupForm();
  form.set(field, "  ");

  await expect(submit(form)).rejects.toThrow(`Required setup field: ${field}`);
  expect(createOrResumeClinic).not.toHaveBeenCalled();
  expect(provisionClinic).not.toHaveBeenCalled();
  expect(onComplete).not.toHaveBeenCalled();
});

it("does not finish after provisioning fails and retries with the same verified clinic", async () => {
  const { submit, createOrResumeClinic, provisionClinic, onComplete } = setup();
  provisionClinic.mockRejectedValueOnce(new Error("Agenda unavailable"));

  await expect(submit(signupForm())).rejects.toThrow("Agenda unavailable");
  expect(onComplete).not.toHaveBeenCalled();
  await submit(signupForm());

  expect(createOrResumeClinic.mock.calls).toEqual(Array(2).fill([{ userId, name: fields.name, timeZone: fields.timeZone }]));
  expect(provisionClinic.mock.calls).toEqual(Array(2).fill([{ userId, expectedTenantId: tenantId, professionalName: fields.professionalName }]));
  expect(onComplete).toHaveBeenCalledOnce();
});
