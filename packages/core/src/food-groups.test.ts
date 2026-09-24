import { describe, expect, it } from "vitest";
import {
  FOOD_GROUP_LABELS,
  FOOD_GROUP_SHORT_LABELS,
  FOOD_GROUP_VALUES,
  FOOD_SOURCE_LABELS,
  SARA2_TABLE_GROUPS,
  sara2TableGroup,
} from "./food-groups";

describe("grupos de alimentos", () => {
  it("son 27 valores únicos", () => {
    expect(FOOD_GROUP_VALUES).toHaveLength(27);
    expect(new Set(FOOD_GROUP_VALUES).size).toBe(27);
  });

  it("todo grupo tiene etiqueta completa y corta no vacías", () => {
    for (const g of FOOD_GROUP_VALUES) {
      expect(FOOD_GROUP_LABELS[g]).toBeTruthy();
      expect(FOOD_GROUP_SHORT_LABELS[g]).toBeTruthy();
    }
    expect(FOOD_GROUP_LABELS.LEGUMBRES_CEREALES).toBe(
      "Legumbres, cereales, papa, choclo, batata, pan y pastas",
    );
    expect(FOOD_GROUP_SHORT_LABELS.LEGUMBRES_CEREALES).toBe("Cereales, papa, pan y pastas");
  });

  it("mapea las tablas de SARA 2 a su grupo", () => {
    expect(sara2TableGroup(1)).toBe("VERDURAS");
    expect(sara2TableGroup(3)).toBe("LEGUMBRES_CEREALES");
    expect(sara2TableGroup(14)).toBe("GRASAS");
    expect(sara2TableGroup(26)).toBe("SUPLEMENTOS");
    expect(sara2TableGroup(27)).toBeNull();
    expect(sara2TableGroup(0)).toBeNull();
    expect(Object.keys(SARA2_TABLE_GROUPS)).toHaveLength(26);
    expect(Object.values(SARA2_TABLE_GROUPS)).not.toContain("OTROS");
  });

  it("etiquetas de fuente", () => {
    expect(FOOD_SOURCE_LABELS).toEqual({ SARA2: "SARA 2", PROPIO: "Propio" });
  });
});
