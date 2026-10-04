// HU-017c-2 (SDD 4.2 de 017c-2): pestañas de la ficha y alias de los `?tab=` viejos. Puro (sin React),
// para poder testearlo y usarlo en el cliente y en el servidor.

/** "planes" = etiqueta "Plan" (el valor se mantiene por el enlace de la zona de planes). */
export const PATIENT_TABS = ["resumen", "consultas", "planes", "historial"] as const;
export type PatientTab = (typeof PATIENT_TABS)[number];
export const HISTORY_VIEWS = ["medidas", "turnos", "diario"] as const;
export type HistoryView = (typeof HISTORY_VIEWS)[number];

const DEFAULT_VIEW: HistoryView = "medidas";

function isHistoryView(value: string | null): value is HistoryView {
  return (HISTORY_VIEWS as readonly string[]).includes(value ?? "");
}

/** Resuelve ?tab= y ?vista= (incluidos los alias viejos):
 *  null/"resumen" → resumen; "consultas" → consultas; "planes" → planes; "historial" → historial + vista;
 *  "datos" → resumen con focus "datos"; "evolucion" → historial/medidas; "diario" → historial/diario;
 *  "turnos" → historial/turnos; valor desconocido → resumen. vista desconocida o ausente → "medidas". */
export function resolvePatientTab(
  tab: string | null,
  vista: string | null,
): { tab: PatientTab; view: HistoryView; focus: "datos" | null } {
  const view = isHistoryView(vista) ? vista : DEFAULT_VIEW;
  switch (tab) {
    case "consultas":
    case "planes":
    case "historial":
      return { tab, view, focus: null };
    case "datos":
      return { tab: "resumen", view, focus: "datos" };
    case "evolucion":
      return { tab: "historial", view: "medidas", focus: null };
    case "diario":
      return { tab: "historial", view: "diario", focus: null };
    case "turnos":
      return { tab: "historial", view: "turnos", focus: null };
    default:
      return { tab: "resumen", view, focus: null };
  }
}

/** Query canónica para escribir en la URL (replaceState): resumen → sin tab; historial → tab=historial&vista=…
 *  (vista solo si no es "medidas"). */
export function patientTabQuery(tab: PatientTab, view: HistoryView): URLSearchParams {
  const params = new URLSearchParams();
  if (tab === "resumen") return params;
  params.set("tab", tab);
  if (tab === "historial" && view !== DEFAULT_VIEW) params.set("vista", view);
  return params;
}
