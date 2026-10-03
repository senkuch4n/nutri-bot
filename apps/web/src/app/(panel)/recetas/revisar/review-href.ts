// HU-018a-2: URL de un borrador de la cola (o de la entrada a la revisión), con el filtro por recetario.
export function reviewHref(id: string | null, file: string | null): string {
  const q = file ? `?archivo=${encodeURIComponent(file)}` : "";
  return id ? `/recetas/revisar/${id}${q}` : `/recetas/revisar${q}`;
}
