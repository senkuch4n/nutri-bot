// HU-018a (review ronda 1): después de guardar bien, el editor no queda "con cambios sin guardar".
import { describe, expect, it } from "vitest";
import { recipeFormSnapshot, rowHasContent, snapshotAfterSave, type RecipeFormDirtyState } from "./recipe-form-state";

const payload = { name: "Albóndigas", ingredients: [{ foodId: "f1", grams: 500 }] };
const base: RecipeFormDirtyState = { payload, credit: "", photo: null, removePhoto: false };

/** Simula el form: huella de referencia al guardar y estado que queda después (foto y quitar, limpios). */
function dirtyAfterSave(before: RecipeFormDirtyState): boolean {
  const baseline = snapshotAfterSave(before);
  const after: RecipeFormDirtyState = { ...before, photo: null, removePhoto: false };
  return recipeFormSnapshot(after) !== baseline;
}

describe("cambios sin guardar del editor de recetas", () => {
  it("antes de guardar, una foto nueva o 'Quitar foto' cuentan como cambio", () => {
    const clean = recipeFormSnapshot(base);
    expect(recipeFormSnapshot({ ...base, photo: { name: "f.jpg", size: 3000 } })).not.toBe(clean);
    expect(recipeFormSnapshot({ ...base, removePhoto: true })).not.toBe(clean);
  });

  it("después de guardar con foto nueva, dirty vuelve a false", () => {
    expect(dirtyAfterSave({ ...base, photo: { name: "f.jpg", size: 3000 }, credit: "Foto: X" })).toBe(false);
  });

  it("después de guardar con 'Quitar foto', dirty vuelve a false", () => {
    expect(dirtyAfterSave({ ...base, removePhoto: true })).toBe(false);
  });

  it("después de guardar sin tocar la foto, dirty vuelve a false", () => {
    expect(dirtyAfterSave({ ...base, payload: { ...payload, name: "Otra" } })).toBe(false);
  });

  it("un cambio posterior al guardado vuelve a marcar dirty", () => {
    const baseline = snapshotAfterSave({ ...base, photo: { name: "f.jpg", size: 1 } });
    expect(recipeFormSnapshot({ ...base, payload: { ...payload, name: "Editada" } })).not.toBe(baseline);
  });
});

describe("rowHasContent", () => {
  const empty = { foodId: null, label: "", grams: "", household: "", noQuantity: false };
  it("una fila con solo medida casera no se descarta", () => {
    expect(rowHasContent(empty)).toBe(false);
    expect(rowHasContent({ ...empty, household: "1 taza" })).toBe(true);
    expect(rowHasContent({ ...empty, label: "  " })).toBe(false);
    expect(rowHasContent({ ...empty, noQuantity: true })).toBe(true);
  });
});
