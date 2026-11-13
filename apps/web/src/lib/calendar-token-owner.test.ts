import { describe, expect, it } from "vitest";
import { shouldStoreCalendarToken } from "./calendar-token-owner";

const base = { hasToken: true, hasSyncError: false };

describe("shouldStoreCalendarToken", () => {
  it("con dueña configurada guarda solo el token de esa cuenta", () => {
    expect(shouldStoreCalendarToken({ ...base, email: "Daiana@Gmail.com", ownerEmail: "daiana@gmail.com" })).toBe(true);
    expect(shouldStoreCalendarToken({ ...base, email: "otro@gmail.com", ownerEmail: "daiana@gmail.com" })).toBe(false);
    expect(
      shouldStoreCalendarToken({ email: "otro@gmail.com", ownerEmail: "daiana@gmail.com", hasToken: false, hasSyncError: true }),
    ).toBe(false);
  });

  it("sin dueña configurada no pisa un token que funciona", () => {
    expect(shouldStoreCalendarToken({ ...base, email: "otro@gmail.com", ownerEmail: undefined })).toBe(false);
  });

  it("sin dueña configurada conecta la primera vez o reconecta si la sincronización falla", () => {
    expect(shouldStoreCalendarToken({ email: "a@gmail.com", ownerEmail: "", hasToken: false, hasSyncError: false })).toBe(true);
    expect(shouldStoreCalendarToken({ email: "a@gmail.com", ownerEmail: null, hasToken: true, hasSyncError: true })).toBe(true);
  });

  it("sin email no guarda", () => {
    expect(shouldStoreCalendarToken({ email: undefined, ownerEmail: "daiana@gmail.com", hasToken: false, hasSyncError: true })).toBe(false);
  });
});
