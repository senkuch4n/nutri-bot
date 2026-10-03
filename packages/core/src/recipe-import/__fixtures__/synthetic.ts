import type { BboxPage, BboxWord } from "../../sara2/bbox";

// HU-018a-2: páginas SINTÉTICAS para los tests del parser. Todas las recetas, cantidades y textos son
// INVENTADOS: imitan la geometría de los formatos F1–F5 de los recetarios, pero no copian ningún
// texto de terceros (D3: nada de los recetarios entra al repo).

interface LineSpec {
  text: string;
  x: number;
  y: number;
  /** Alto de la caja de cada palabra (pdftotext incluye el interlineado). */
  h: number;
}

/** Arma las palabras de una línea: cada carácter mide 0,5 × h y el espacio 0,3 × h. */
function words({ text, x, y, h }: LineSpec): BboxWord[] {
  const out: BboxWord[] = [];
  let cx = x;
  for (const t of text.split(" ").filter(Boolean)) {
    const w = t.length * h * 0.5;
    out.push({ x0: cx, y0: y, x1: cx + w, y1: y + h, text: t });
    cx += w + h * 0.3;
  }
  return out;
}

/** Título rotado (F2): una palabra con la caja más alta que ancha. */
function rotatedWord(text: string, x: number, y: number, size: number): BboxWord {
  return { x0: x, y0: y, x1: x + size, y1: y + text.length * size * 0.6, text };
}

function page(pageNumber: number, lines: LineSpec[], extra: BboxWord[] = []): BboxPage {
  return { pageNumber, width: 595, height: 842, words: [...lines.flatMap(words), ...extra] };
}

/** Fila de tabla con palabras separadas (cada una en su columna). */
function row(cells: string[], y: number, h: number): LineSpec[] {
  return cells.map((text, i) => ({ text, x: 30 + i * 110, y, h }));
}

const BODY = 16;

/** F1: nombre en 2 renglones, rinde 8, 6 ingredientes, 4 pasos, tips a la derecha y tabla abajo. */
export const F1_PAGE: BboxPage = page(7, [
  { text: "Bolitas", x: 20, y: 10, h: 90 },
  { text: "de mijo", x: 40, y: 80, h: 90 },
  { text: "Rinde para 8 porciones", x: 25, y: 190, h: 14 },
  { text: "Ingredientes", x: 25, y: 220, h: 36 },
  { text: "× Mijo 200g", x: 28, y: 262, h: BODY },
  { text: "× Zanahoria rallada una taza (son 150g en crudo aprox.)", x: 28, y: 280, h: BODY },
  { text: "× Aceite de girasol 30cc (2 cdas)", x: 28, y: 298, h: BODY },
  { text: "× Una cebolla y ajo picados", x: 28, y: 316, h: BODY },
  { text: "× Orégano c.n", x: 28, y: 334, h: BODY },
  { text: "× Huevo una unidad", x: 28, y: 352, h: BODY },
  { text: "Procedimiento", x: 25, y: 390, h: 36 },
  { text: "> Hervir el mijo 20 minutos.", x: 28, y: 432, h: BODY },
  { text: "> Mezclar con la zanahoria y la cebolla", x: 28, y: 450, h: BODY },
  { text: "rehogada.", x: 28, y: 468, h: BODY },
  { text: "> Formar bolitas con las manos.", x: 28, y: 486, h: BODY },
  { text: "> Hornear 25 minutos.", x: 28, y: 504, h: BODY },
  { text: "Se pueden congelar", x: 400, y: 486, h: BODY },
  { text: "TABLA NUTRICIONAL porción 3 bolitas", x: 25, y: 700, h: 14 },
  ...row(["Calorías", "Hidratos", "Proteínas", "Grasas", "Fibra"], 730, 14),
  ...row(["210", "30.5", "6,2", "7.1", "4.03"], 750, 14),
]);

/** F2: títulos rotados; ingredientes con "•" y pasos con "+". */
export const F2_PAGE: BboxPage = page(
  3,
  [
    { text: "Galletas", x: 44, y: 20, h: 80 },
    { text: "de algarroba", x: 44, y: 90, h: 80 },
    { text: "12 unidades", x: 110, y: 200, h: 24 },
    { text: "• Harina de algarroba 90 g (media taza)", x: 110, y: 240, h: 24 },
    { text: "• Avena 40 g", x: 110, y: 262, h: 24 },
    { text: "• Leche de almendras 60cc", x: 110, y: 284, h: 24 },
    { text: "• Miel una cdita", x: 110, y: 306, h: 24 },
    { text: "+ Mezclar todo en un bowl.", x: 110, y: 420, h: 24 },
    { text: "+ Hornear 12 minutos a fuego", x: 110, y: 442, h: 24 },
    { text: "moderado.", x: 110, y: 464, h: 24 },
  ],
  [rotatedWord("Ingredientes", 30, 230, 20), rotatedWord("Procedimiento", 30, 400, 20)],
);

/** F3: ingredientes agrupados en subtítulos ("Base", "Relleno") que no son ingredientes. */
export const F3_PAGE: BboxPage = page(5, [
  { text: "Tarta de hinojo", x: 20, y: 20, h: 80 },
  { text: "Ingredientes", x: 25, y: 130, h: 36 },
  { text: "Base", x: 28, y: 170, h: BODY },
  { text: "- Harina integral 150 g", x: 28, y: 188, h: BODY },
  { text: "- Agua 80cc", x: 28, y: 206, h: BODY },
  { text: "Relleno", x: 28, y: 224, h: BODY },
  { text: "- Hinojo 300g", x: 28, y: 242, h: BODY },
  { text: "- Queso untable 2 cdas soperas", x: 28, y: 260, h: BODY },
  { text: "Procedimiento", x: 25, y: 300, h: 36 },
  { text: "- Estirar la masa.", x: 28, y: 340, h: BODY },
  { text: "- Rellenar y hornear.", x: 28, y: 358, h: BODY },
]);

/** F4: tres colaciones en párrafo, cada una cerrada por "Porción: …". */
export const F4_PAGE: BboxPage = page(4, [
  { text: "Bastones de jícama: cortar en tiras y", x: 60, y: 100, h: 18 },
  { text: "condimentar con limón.", x: 60, y: 120, h: 18 },
  { text: "Porción: una taza", x: 60, y: 140, h: 18 },
  { text: "Tostada de centeno con tomate: tostar y", x: 60, y: 200, h: 18 },
  { text: "agregar el tomate en rodajas.", x: 60, y: 220, h: 18 },
  { text: "Porción: 2 tostadas", x: 60, y: 240, h: 18 },
  { text: "Uvas congeladas: lavar y freezar.", x: 60, y: 300, h: 18 },
  { text: "Porción: 15 uvas", x: 60, y: 320, h: 18 },
]);

/** F5: introducción (texto corrido, sin recetas). */
export const F5_INTRO_PAGE: BboxPage = page(1, [
  { text: "Bienvenidos a este recetario inventado", x: 30, y: 100, h: 20 },
  { text: "para probar el lector de recetas.", x: 30, y: 124, h: 20 },
  { text: "Acá no hay ingredientes ni pasos.", x: 30, y: 148, h: 20 },
]);

/** F5: índice (renglones con "×" y sin cantidades). */
export const F5_INDEX_PAGE: BboxPage = page(2, [
  { text: "Índice", x: 30, y: 40, h: 40 },
  { text: "× Bolitas de mijo", x: 30, y: 100, h: 18 },
  { text: "× Galletas de algarroba", x: 30, y: 122, h: 18 },
  { text: "× Tarta de hinojo", x: 30, y: 144, h: 18 },
  { text: "× Bastones de jícama", x: 30, y: 166, h: 18 },
  { text: "× Uvas congeladas", x: 30, y: 188, h: 18 },
  { text: "× Tostadas de centeno", x: 30, y: 210, h: 18 },
]);

/** Página vacía (solo imágenes). */
export const EMPTY_PAGE: BboxPage = { pageNumber: 9, width: 595, height: 842, words: [] };
