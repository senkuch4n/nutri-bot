import type { BboxPage, BboxWord } from "../../sara2/bbox";
import { page, type LineSpec } from "../../recipe-import/__fixtures__/synthetic";

// HU-020: plan alimentario SINTÉTICO para los tests del importador. Todo es INVENTADO (paciente,
// profesional, matrícula, fecha, comidas y textos): imita la geometría del formato de los planes de
// Canva (encabezados con letras espaciadas, pie de la profesional al lado del encabezado, dos
// columnas, días en mayúsculas, línea de macros), pero no copia ningún texto de un plan real (D12).

const BODY = 12;
const STEP = 14;

/** Encabezado con letras espaciadas: letras separadas por 0,1 × h y palabras (doble espacio) por 0,45 × h. */
export function spaced(text: string, x: number, y: number, h: number): BboxWord[] {
  const out: BboxWord[] = [];
  let cx = x;
  for (const [wi, word] of text.split("  ").entries()) {
    if (wi > 0) cx += h * 0.35;
    for (const token of word.split(" ").filter(Boolean)) {
      const w = token.length * h * 0.5;
      out.push({ x0: cx, y0: y, x1: cx + w, y1: y + h, text: token });
      cx += w + h * 0.1;
    }
  }
  return out;
}

const FOOTER = "Lic. Profesional Inventada M.P 0000";
/** Pie de la profesional a la derecha del encabezado (mismo renglón, hueco grande). */
const footerTop = (y: number): LineSpec => ({ text: FOOTER, x: 400, y: y + 3, h: 10 });

/** Renglones de cuerpo uno debajo del otro desde `y`. */
function stack(texts: readonly string[], x: number, y: number, step = STEP, h = BODY): LineSpec[] {
  return texts.map((text, i) => ({ text, x, y: y + i * step, h }));
}

export const PATIENT_FIRST_NAME = "Marta";
export const COVER_NAME_LINE = "Marta, Ejemplar 03/04/25";

const coverPage = page(
  1,
  [
    { text: "PLAN NUTRICIONAL", x: 40, y: 60, h: 30 },
    { text: COVER_NAME_LINE, x: 380, y: 68, h: 14 },
    { text: "Para comer más verduras", x: 40, y: 130, h: 18 },
    { text: "y moverse más", x: 40, y: 150, h: 18 },
    ...stack(
      [
        "Hacer cuatro comidas al día con horarios parecidos y sin saltear",
        "ninguna para llegar con menos hambre a la cena.",
      ],
      30,
      300,
    ),
    ...stack(["Marta puede sumar una fruta a media tarde si tiene hambre", "entre comidas."], 30, 350),
    ...stack(["Tomar dos litros de agua por día, de a poco y sin esperar a", "tener sed."], 30, 400),
    { text: FOOTER, x: 380, y: 810, h: 10 },
  ],
  spaced("R E C O M E N DAC I O N E S", 30, 250, 20),
);

const dailyFoodsPage = page(
  2,
  [
    footerTop(20),
    ...stack(["Leche o yogur descremado en el desayuno", "o en la merienda."], 30, 110),
    ...stack(["Queso fresco de bajo tenor graso."], 30, 160),
    ...stack(["Fruta de estación entera, con cáscara", "cuando se pueda."], 320, 110),
    ...stack(["Una porción es del tamaño de un puño."], 320, 160),
  ],
  [...spaced("A L I M E N TO S  D E  C O N S U M O  D I A R I O", 20, 20, 17), ...spaced("L Á C T E O S", 30, 85, 14), ...spaced("F R U TA S", 320, 85, 14)],
);

const occasionalPage = page(3, [
  { text: "ALIMENTOS DE CONSUMO OCASIONAL", x: 20, y: 20, h: 17 },
  footerTop(20),
  ...stack(["Golosinas, galletitas dulces y bebidas con azúcar.", "Fiambres grasos y embutidos."], 30, 90),
]);

interface DaySpec {
  day: string;
  combo: string[];
  macros?: string[];
}

const MACROS = ["Hidratos de carbono (fibra),", "proteínas y grasas saludables"];

function dayLines(days: readonly DaySpec[], y0: number): LineSpec[] {
  const out: LineSpec[] = [];
  let y = y0;
  for (const d of days) {
    out.push({ text: d.day, x: 30, y, h: BODY });
    y += STEP;
    for (const c of d.combo) {
      out.push({ text: c, x: 30, y, h: BODY });
      y += STEP;
    }
    for (const m of d.macros ?? MACROS) {
      out.push({ text: m, x: 30, y, h: BODY });
      y += STEP;
    }
    y += 16;
  }
  return out;
}

const BREAKFAST_RULE = [
  "Infusión (1 taza) + pan integral o avena (hidratos) + lácteo",
  "descremado o huevo (proteínas) + fruta",
];

export const BREAKFAST_T1: DaySpec[] = [
  { day: "LUNES", combo: ["Café con leche + pan de centeno +ricota + kiwi"] },
  { day: "MARTES", combo: ["Mate + galletas de arroz + queso fresco"] },
  { day: "MIERCOLES", combo: ["Té verde + avena cocida + manzana"] },
  { day: "JUEVES", combo: ["Café + tostadas de centeno + huevo duro"] },
  { day: "VIERNES", combo: ["Mate + yogur descremado + granola sin azúcar"] },
  { day: "SÁBADO", combo: ["Té + pan integral + palta +", "tomate cherry"] },
  { day: "DOMINGO", combo: ["Licuado de leche y frutilla + tostada"] },
];

export const BREAKFAST_T2: DaySpec[] = [
  { day: "LUNES", combo: ["Té + bizcochuelo casero + mandarina"] },
  { day: "Miércoles", combo: ["Mate + tostadas + ricota + durazno"] },
  { day: "JUEVES", combo: ["Café + yogur + copos sin azúcar"] },
  { day: "VIERNES", combo: ["Té + panqueque de avena + pera"] },
  { day: "SABADO", combo: ["Mate + pan de salvado + queso fresco"] },
  { day: "DOMINGO", combo: ["Café con leche + tostada + mermelada light"] },
];

function breakfastPage(n: number, days: readonly DaySpec[], withRule: boolean): BboxPage {
  const rule = withRule ? stack(BREAKFAST_RULE, 30, 70) : [];
  return page(n, [footerTop(20), ...rule, ...dayLines(days, withRule ? 120 : 70)], spaced("D E S AY U N O  Y  M E R I E N DA", 20, 20, 17));
}

const LD_MACROS = ["Hidratos de carbono", "Proteínas y grasas saludables"];

export const LUNCH_DINNER_DAYS: DaySpec[] = [
  { day: "LUNES", combo: ["Almuerzo: Merluza al vapor + quinoa + zapallo", "Cena: Merluza al vapor + zapallo"], macros: LD_MACROS },
  { day: "MARTES", combo: ["Almuerzo y Cena: Wok de tofu + vegetales salteados"], macros: LD_MACROS },
  {
    day: "MIERCOLES",
    combo: ["Almuerzo: Cerdo magro + batata + ensalada ( pepino +", "rúcula)", "Cena:Pollo al limón + ensalada ( pepino + rúcula)"],
    macros: LD_MACROS,
  },
  { day: "JUEVES", combo: ["Almuerzo : Lentejas guisadas + arroz", "Cena: Omelette de acelga"], macros: LD_MACROS },
  { day: "VIERNES", combo: ["Almuerzo: Pescado al horno + puré mixto", "Cena: Pescado al horno + chauchas"], macros: LD_MACROS },
  { day: "SABADO", combo: ["Almuerzo y Cena: Pastel de calabaza + ensalada verde"], macros: LD_MACROS },
  { day: "DOMINGO", combo: ["Almuerzo: Pollo a la parrilla + papa", "Cena: Sopa de verduras + huevo"], macros: LD_MACROS },
];

const LD_RULE = ["Plato de almuerzo : mitad vegetales, un cuarto proteínas", "y un cuarto cereales o papa + agua."];

function lunchDinnerPage(n: number, days: readonly DaySpec[]): BboxPage {
  return page(n, [
    { text: "ALMUERZO Y CENA", x: 20, y: 20, h: 17 },
    footerTop(20),
    ...stack(LD_RULE, 30, 60),
    ...dayLines(days, 100),
  ]);
}

export const SNACK_OPTIONS = [
  "Frutas",
  "Budín de prueba (1 porción)",
  "Tarta dulce (2 unidades)",
  "Galletas de avena (½ porción)",
  "Panqueques (2 unidades) con fruta",
];

const snacksPage = page(7, [
  { text: "COLACIONES OPCIONALES", x: 20, y: 20, h: 17 },
  footerTop(20),
  { text: "OPCIONES", x: 30, y: 70, h: 20 },
  { text: "DE COLACIONES", x: 30, y: 92, h: 20 },
  ...stack(SNACK_OPTIONS, 30, 130),
]);

const replacementsPage1 = page(8, [
  { text: "REEMPLAZO (Alimentos ricos en proteínas)", x: 20, y: 20, h: 17 },
  footerTop(20),
  ...stack(["1 huevo equivale a 2 cucharadas de legumbres cocidas.", "Media porción de carne equivale a 3/4 taza de legumbres."], 30, 80),
]);

const replacementsPage2 = page(9, [
  { text: "REEMPLAZO (Alimentos ricos en grasas buenas)", x: 20, y: 20, h: 17 },
  footerTop(20),
  ...stack(["2 cucharadas de aceite equivalen a 5 cucharadas de semillas."], 30, 80),
]);

export const UNKNOWN_PAGE_NUMBER = 10;
export const UNKNOWN_LINES = ["Verduras de estación para la semana", "Huevos de campo"];

const unknownPage = page(UNKNOWN_PAGE_NUMBER, [footerTop(20), ...stack(UNKNOWN_LINES, 30, 80)], spaced("L I S TA  D E  C O M P R A S", 20, 20, 17));

function buildPlan(opts: { longCombo?: boolean; singleTanda?: boolean } = {}): BboxPage[] {
  const t1 = opts.longCombo
    ? [
        ...BREAKFAST_T1.slice(0, 1),
        {
          day: "MARTES",
          // 9 renglones de 60 caracteres + 8 espacios = 548 caracteres (> PLAN_IMPORT_LABEL_MAX).
          combo: Array.from({ length: 9 }, (_, i) => `Renglón ${i} de una combinación demasiado larga para un ítem xx`),
        },
        ...BREAKFAST_T1.slice(2),
      ]
    : BREAKFAST_T1;
  const breakfast = opts.singleTanda ? [breakfastPage(4, t1, true)] : [breakfastPage(4, t1, true), breakfastPage(5, BREAKFAST_T2, false)];
  return [
    coverPage,
    dailyFoodsPage,
    occasionalPage,
    ...breakfast,
    lunchDinnerPage(6, LUNCH_DINNER_DAYS),
    snacksPage,
    replacementsPage1,
    replacementsPage2,
    unknownPage,
  ];
}

/** Plan completo: 2 tandas de desayuno y merienda (la segunda sin martes), 1 de almuerzo y cena. */
export const syntheticPlan: BboxPage[] = buildPlan();
/** Igual pero con una sola tanda de desayuno y merienda. */
export const singleTandaPlan: BboxPage[] = buildPlan({ singleTanda: true });
/** Martes de la tanda 1 con una combinación de más de 500 caracteres. */
export const longComboPlan: BboxPage[] = buildPlan({ longCombo: true });
/** PDF escaneado: páginas sin palabras. */
export const scannedPlan: BboxPage[] = [
  { pageNumber: 1, width: 595, height: 842, words: [] },
  { pageNumber: 2, width: 595, height: 842, words: [] },
];
/** Solo portada y recomendaciones: no hay menú. */
export const noMenuPlan: BboxPage[] = [coverPage, dailyFoodsPage];

