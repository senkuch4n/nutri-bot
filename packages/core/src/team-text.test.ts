import { describe, expect, it } from "vitest";
import { TEAM_TEXT, teamRemoveErrorText } from "./team-text";

describe("TEAM_TEXT (9.2)", () => {
  it("roles y resumen", () => {
    expect(TEAM_TEXT.roleLabel).toEqual({ OWNER: "Responsable", STAFF: "Equipo" });
    expect(TEAM_TEXT.summary(1)).toBe("1 persona");
    expect(TEAM_TEXT.summary(3)).toBe("3 personas");
    expect(TEAM_TEXT.confirmTitle("ana@example.com")).toBe("¿Quitar el acceso de ana@example.com?");
    expect(TEAM_TEXT.removed("ana@example.com")).toBe("Se quitó el acceso de ana@example.com.");
  });

  it("errores: self y last_owner tienen texto propio; not_owner y not_member dan el genérico", () => {
    expect(teamRemoveErrorText("self")).toBe("No podés quitarte tu propio acceso. Si necesitás dejar el consultorio, escribinos a soporte.");
    expect(teamRemoveErrorText("last_owner")).toBe("El consultorio necesita al menos una responsable.");
    expect(teamRemoveErrorText("not_member")).toBe(TEAM_TEXT.genericError);
    expect(teamRemoveErrorText("not_owner")).toBe(TEAM_TEXT.genericError);
  });
});
