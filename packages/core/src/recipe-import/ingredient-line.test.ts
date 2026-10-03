// HU-018a-2: línea de ingrediente y normalización. Todo con texto INVENTADO (D3).
import { describe, expect, it } from "vitest";
import { gramValuesIn, parseIngredientLine } from "./ingredient-line";
import { normalizePdfText, stripBullet } from "./text";

describe("normalizePdfText / stripBullet", () => {
  it("resuelve ligaduras, comillas y guiones tipográficos y colapsa espacios", () => {
    expect(normalizePdfText("Harina ﬁna  “especial” – 2")).toBe('Harina fina "especial" - 2');
  });
  it("deja las fracciones como están y pasa la barra de fracción a /", () => {
    expect(normalizePdfText("¾ de taza")).toBe("¾ de taza");
    expect(normalizePdfText("1⁄2 taza")).toBe("1/2 taza");
  });
  it("saca la viñeta, también pegada; un signo pegado a un número no es viñeta", () => {
    expect(stripBullet("× Mijo 200g")).toEqual({ bullet: "×", text: "Mijo 200g" });
    expect(stripBullet("•Polenta 120g")).toEqual({ bullet: "•", text: "Polenta 120g" });
    expect(stripBullet("॰ Avena")).toEqual({ bullet: "॰", text: "Avena" });
    expect(stripBullet("-1 grado")).toEqual({ bullet: null, text: "-1 grado" });
    expect(stripBullet("Sin viñeta")).toEqual({ bullet: null, text: "Sin viñeta" });
  });
});

describe("parseIngredientLine (SDD 11.1)", () => {
  it("«Lentejas 500g» → 500 g, label «Lentejas»", () => {
    const p = parseIngredientLine("Lentejas 500g");
    expect(p).toMatchObject({ label: "Lentejas", grams: 500, household: null, noQuantity: false, flags: [] });
  });

  it("«Harina integral 100 g (3/4 de taza)» → 100 y medida «3/4 de taza»", () => {
    const p = parseIngredientLine("Harina integral 100 g (3/4 de taza)");
    expect(p).toMatchObject({ label: "Harina integral", grams: 100, household: "3/4 de taza", flags: [] });
  });

  it("«Puré de calabaza una taza (son 300g en crudo aprox.)» → 300, APPROX, «una taza»", () => {
    const p = parseIngredientLine("Puré de calabaza una taza (son 300g en crudo aprox.)");
    expect(p.label).toBe("Puré de calabaza");
    expect(p.grams).toBe(300);
    expect(p.household).toBe("una taza");
    expect(p.flags).toEqual(["APPROX"]);
  });

  it("«Aceite de oliva 50cc (¾ de pocillo de café)» → sin gramos, VOLUME_ONLY (no se convierte)", () => {
    const p = parseIngredientLine("Aceite de oliva 50cc (¾ de pocillo de café)");
    expect(p.grams).toBeNull();
    expect(p.household).toBe("¾ de pocillo de café");
    expect(p.label).toBe("Aceite de oliva");
    expect(p.flags).toEqual(["VOLUME_ONLY"]);
  });

  it("«Huevo una unidad» → HOUSEHOLD_ONLY y gramos vacíos", () => {
    const p = parseIngredientLine("Huevo una unidad");
    expect(p).toMatchObject({ label: "Huevo", grams: null, household: "una unidad", flags: ["HOUSEHOLD_ONLY"] });
  });

  it("«una taza» sin gramos deja el campo vacío (no se inventan gramos)", () => {
    const p = parseIngredientLine("Leche una taza");
    expect(p.grams).toBeNull();
    expect(p.household).toBe("una taza");
    expect(p.flags).toContain("HOUSEHOLD_ONLY");
  });

  it("«Perejil c.n» y «Sal c/n» → sin cantidad", () => {
    expect(parseIngredientLine("Perejil c.n")).toMatchObject({ label: "Perejil", noQuantity: true, grams: null, flags: [] });
    expect(parseIngredientLine("Sal c/n")).toMatchObject({ label: "Sal", noQuantity: true, grams: null, flags: [] });
    expect(parseIngredientLine("Pimienta a gusto").noQuantity).toBe(true);
  });

  it("«Una cebolla y morrón picados» → MULTI_FOOD", () => {
    const p = parseIngredientLine("Una cebolla y morrón picados");
    expect(p.flags).toContain("MULTI_FOOD");
    expect(p.grams).toBeNull();
  });

  it("«Avena 30 g o 40 g» → AMBIGUOUS_GRAMS y gramos vacíos; un rango también", () => {
    const p = parseIngredientLine("Avena 30 g o 40 g");
    expect(p.grams).toBeNull();
    expect(p.flags).toEqual(["AMBIGUOUS_GRAMS"]);
    expect(parseIngredientLine("Acelga 120 a 180g").flags).toEqual(["AMBIGUOUS_GRAMS"]);
    expect(parseIngredientLine("Quinoa 60g (170g cocida)").grams).toBeNull();
  });

  it("«Queso 1,5 kg» → 1500 (y «1.5kg» también)", () => {
    expect(parseIngredientLine("Queso 1,5 kg")).toMatchObject({ label: "Queso", grams: 1500 });
    expect(parseIngredientLine("Queso 1.5kg").grams).toBe(1500);
  });

  it("ligadura «ﬁna» → «fina»", () => {
    const p = parseIngredientLine("× Sal ﬁna 5g");
    expect(p.rawText).toBe("Sal fina 5g");
    expect(p.label).toBe("Sal fina");
    expect(p.grams).toBe(5);
  });

  it("el mismo valor repetido no es ambiguo; el volumen entre paréntesis no tapa la medida casera", () => {
    expect(parseIngredientLine("Pepino 230g, una unidad (230g)").grams).toBe(230);
    const p = parseIngredientLine("Huevo una unidad (o 90cc de bebida de soja)");
    expect(p.flags).toEqual(["HOUSEHOLD_ONLY"]);
  });

  it("no toma como gramos palabras que empiezan con g ni fracciones", () => {
    expect(parseIngredientLine("Papas 2 grandes").grams).toBeNull();
    expect(parseIngredientLine("Harina 1/2 taza").grams).toBeNull();
    expect(gramValuesIn("Molde de 20x20cm")).toEqual([]);
  });

  // Propiedad (SDD 11.1): si hay gramos, el texto tiene ese número seguido de g o kg. Se comprueba con
  // una regex independiente de la del parser.
  // Las primeras 10 son las del SDD (11.1); el resto, inventadas.
  const LINES = [
    "Lentejas 500g", "Harina integral 100 g (3/4 de taza)", "Puré de calabaza una taza (son 300g en crudo aprox.)",
    "Aceite de oliva 50cc (¾ de pocillo de café)", "Huevo una unidad", "Perejil c.n", "Sal c/n",
    "Una cebolla y morrón picados", "Avena 30 g o 40 g", "Queso 1,5 kg",
    "Mijo 200g", "Hinojo rallado 170g, una unidad", "Caldo 350cc", "Levadura de cerveza 7g",
    "Mascabo 35 g. (3 cdas)", "Sal gruesa 6 g (una cdita)", "Comino c/n (opcional)", "Arándanos 45g, 3 cdas",
    "Bebida de avena 140cc (½ vaso)", "Harina de arroz 60g, 4 cdas (o de mandioca)", "Coco 15g (2 cdas soperas)",
    "Ciruelas 70 g (6 unidades)", "Rúcula 80 a 90g (un atado)", "Batatas 650g (3 unidades medianas)", "Jengibre, un trozo",
    "Seitán 120g (½ taza)", "Cacao 85% 25g (1 barrita)", "Claras 3 u.", "Zapallo 2.4 kg", "Requesón 310 gr",
  ];
  it("propiedad: con gramos, el rawText contiene ese número seguido de g/kg (30 líneas)", () => {
    expect(LINES).toHaveLength(30);
    for (const line of LINES) {
      const p = parseIngredientLine(line);
      if (p.grams === null) continue;
      const tokens = [...p.rawText.matchAll(/(\d+(?:[.,]\d+)?)\s*(kg|gr|g)\b/gi)].map((m) => {
        const v = Number(m[1]!.replace(",", "."));
        return m[2]!.toLowerCase() === "kg" ? Math.round(v * 1000) : v;
      });
      expect(tokens, line).toContain(p.grams);
    }
  });
});
