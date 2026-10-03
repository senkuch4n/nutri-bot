// HU-018a: estado puro del editor de recetas ("cambios sin guardar" y filas con contenido).
// Aparte de recipe-form.tsx para poder testearlo sin DOM.

export interface RecipeFormDirtyState {
  /** Lo que se manda como "payload" (datos e ingredientes). */
  payload: unknown;
  credit: string;
  /** Foto elegida y todavía no guardada. */
  photo: { name: string; size: number } | null;
  /** "Quitar foto" tocado y todavía no guardado. */
  removePhoto: boolean;
}

/** Huella del formulario: si cambia respecto de la guardada, hay cambios sin guardar. */
export function recipeFormSnapshot(s: RecipeFormDirtyState): string {
  return JSON.stringify({
    payload: s.payload,
    credit: s.credit,
    photo: s.photo ? `${s.photo.name}:${s.photo.size}` : null,
    removePhoto: s.removePhoto,
  });
}

/**
 * Huella de referencia después de un guardado OK (o de una receta guardada cuya foto falló): la foto
 * pendiente y el "Quitar foto" ya no están pendientes, porque el form los limpia al guardar.
 */
export function snapshotAfterSave(s: RecipeFormDirtyState): string {
  return recipeFormSnapshot({ ...s, photo: null, removePhoto: false });
}

/** Una fila de ingrediente cuenta si tiene alimento, texto, gramos, medida casera o c.n. */
export function rowHasContent(r: {
  foodId: string | null;
  label: string;
  grams: string;
  household: string;
  noQuantity: boolean;
}): boolean {
  return Boolean(r.foodId) || r.label.trim() !== "" || r.grams.trim() !== "" || r.household.trim() !== "" || r.noQuantity;
}
