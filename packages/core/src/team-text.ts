// HU-025 (9.2 de la SDD): textos de Ajustes → Equipo. Solo los ve la responsable (OWNER).
import type { MembershipRole, RemoveMemberCheck } from "./tenant-access";

export const TEAM_TEXT = {
  tabLabel: "Equipo",
  sectionLabel: "Personas con acceso",
  roleLabel: { OWNER: "Responsable", STAFF: "Equipo" } as const satisfies Record<MembershipRole, string>,
  you: "Vos",
  since: (date: string) => `Desde el ${date}`,
  remove: "Quitar acceso",
  removePending: "Quitando…",
  confirmTitle: (email: string) => `¿Quitar el acceso de ${email}?`,
  confirmBody: "Va a dejar de poder entrar al consultorio desde su próxima acción. Para volver a darle acceso, escribinos a soporte.",
  cancel: "Cancelar",
  removed: (email: string) => `Se quitó el acceso de ${email}.`,
  selfError: "No podés quitarte tu propio acceso. Si necesitás dejar el consultorio, escribinos a soporte.",
  lastOwnerError: "El consultorio necesita al menos una responsable.",
  genericError: "No se pudo guardar. Probá de nuevo.",
  footer: "Para sumar a alguien, escribinos a soporte.",
  summary: (n: number) => (n === 1 ? "1 persona" : `${n} personas`),
} as const;

/** Mensaje de error de "Quitar acceso" (9.2). not_owner y not_member dan el genérico: no se distingue
 *  "existe en otro consultorio" de "no existe". */
export function teamRemoveErrorText(reason: Exclude<RemoveMemberCheck, { ok: true }>["reason"]): string {
  switch (reason) {
    case "self":
      return TEAM_TEXT.selfError;
    case "last_owner":
      return TEAM_TEXT.lastOwnerError;
    case "not_owner":
    case "not_member":
      return TEAM_TEXT.genericError;
  }
}
