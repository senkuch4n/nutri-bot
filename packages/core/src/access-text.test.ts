import { describe, expect, it } from "vitest";
import { ACCESS_TEXT, noAccessCopy } from "./access-text";
import type { AccessDenial } from "./tenant-access";

describe("noAccessCopy", () => {
  it("identidad pendiente → sin acceso + pedido registrado", () => {
    expect(noAccessCopy("no_membership")).toEqual({
      title: "Tu cuenta no tiene acceso a ningún consultorio.",
      body: "Si trabajás en un consultorio que usa Numa, pedile a la responsable que te dé acceso.",
      pendingNote: "Ya registramos tu pedido; vas a poder entrar cuando te den acceso.",
    });
  });

  it.each<AccessDenial>(["unlinked", "tenant_not_enabled", "support_no_grant", "support_multiple_grants"])(
    "%s → mismo aviso, sin la nota de pedido registrado",
    (reason) => {
      expect(noAccessCopy(reason)).toEqual({
        title: ACCESS_TEXT.noAccessTitle,
        body: ACCESS_TEXT.noAccessBody,
        pendingNote: null,
      });
    },
  );

  it("más de una membresía (D7) → aviso propio, sin nota", () => {
    expect(noAccessCopy("multiple_memberships")).toEqual({
      title: "Tu cuenta tiene acceso a más de un consultorio.",
      body: "Por ahora Numa no permite elegir. Escribinos a soporte para resolverlo.",
      pendingNote: null,
    });
  });

  it("ningún texto menciona la lista de acceso ni otro consultorio", () => {
    const all = JSON.stringify(ACCESS_TEXT);
    expect(all).not.toMatch(/lista de acceso|autorizada/i);
  });
});
