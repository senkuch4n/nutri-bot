import { describe, expect, it } from "vitest";
import { toastClassNames } from "./sonner";

const classes = (s: string) => s.split(/\s+/);

describe("toastClassNames", () => {
  it("el li del toast tiene las clases que exigen los selectores de descripción, acción, cancelar e íconos", () => {
    const toast = classes(toastClassNames.toast);
    // group-[.toast]:x → `.group.toast .x`
    expect(toast).toContain("group");
    expect(toast).toContain("toast");
    // group-data-[type=…]/toast:x → `.group\/toast[data-type=…] .x`
    expect(toast).toContain("group/toast");
  });

  it("descripción y botones usan el grupo sin nombre `.toast` y los íconos el grupo con nombre", () => {
    for (const key of ["description", "actionButton", "cancelButton"] as const) {
      for (const c of classes(toastClassNames[key])) expect(c.startsWith("group-[.toast]:")).toBe(true);
    }
    for (const c of classes(toastClassNames.icon)) expect(c).toMatch(/^group-data-\[type=\w+\]\/toast:/);
  });
});
