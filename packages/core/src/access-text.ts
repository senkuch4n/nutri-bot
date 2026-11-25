// HU-025 (9.1 de la SDD): textos de login y de "sin acceso" del panel. No nombran ningún consultorio
// ni dicen si la cuenta existe en otro (HU 4.1).
import type { AccessDenial } from "./tenant-access";

export const ACCESS_TEXT = {
  loginTitle: "Ingresá al panel",
  loginSubtitle: "Entrá con tu cuenta de Google.",
  loginButton: "Entrar con Google",
  loginPending: "Abriendo Google…",
  loginFootnote: "El acceso a cada consultorio lo da su responsable.",
  signedInAs: "Iniciaste sesión como",
  noAccessTitle: "Tu cuenta no tiene acceso a ningún consultorio.",
  noAccessBody: "Si trabajás en un consultorio que usa Numa, pedile a la responsable que te dé acceso.",
  pendingNote: "Ya registramos tu pedido; vas a poder entrar cuando te den acceso.",
  multipleTitle: "Tu cuenta tiene acceso a más de un consultorio.",
  multipleBody: "Por ahora Numa no permite elegir. Escribinos a soporte para resolverlo.",
  useOtherAccount: "Usar otra cuenta",
  useOtherAccountPending: "Abriendo Google…",
  retry: "Reintentar",
  /** 6.1 paso 1: Auth.js vuelve a /inicio?error=… si rechazó el login (p. ej. email no verificado). Genérico. */
  signInFailed: "No pudimos iniciar sesión con esa cuenta de Google. Probá de nuevo o usá otra cuenta.",
} as const;

export type NoAccessCopy = { title: string; body: string; pendingNote: string | null };

/** Qué ve en /inicio alguien con sesión y sin acceso, según la razón.
 *  - no_membership: identidad pendiente → agrega que el pedido quedó registrado.
 *  - unlinked (conflicto de identidad o JWT viejo), tenant_not_enabled: mismo aviso, sin la nota.
 *  - multiple_memberships (D7): aviso propio.
 *  - support_*: 025d define su texto; hasta entonces, el aviso genérico. */
export function noAccessCopy(reason: AccessDenial): NoAccessCopy {
  switch (reason) {
    case "multiple_memberships":
      return { title: ACCESS_TEXT.multipleTitle, body: ACCESS_TEXT.multipleBody, pendingNote: null };
    case "no_membership":
      return { title: ACCESS_TEXT.noAccessTitle, body: ACCESS_TEXT.noAccessBody, pendingNote: ACCESS_TEXT.pendingNote };
    case "unlinked":
    case "tenant_not_enabled":
    case "support_no_grant":
    case "support_multiple_grants":
      return { title: ACCESS_TEXT.noAccessTitle, body: ACCESS_TEXT.noAccessBody, pendingNote: null };
  }
}
