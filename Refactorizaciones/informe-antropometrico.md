# SDD: HU-007 `informe-antropometrico` (épica 46)

HU validada: `docs/hu-informe-antropometrico.md`. **Su sección "Resoluciones" manda:** se aceptan
D1 a D13 tal como las recomendó el afinador. Esta SDD las baja a código.

Skills aplicados: `migracion-prisma` (sección 3) y `ui` (sección 7).

Rama: `hu-007-informe-antropometrico` (la actual, sale de la de la HU-006). **No se commitea.** El
orquestador hace el recorrido (sección 12).

> **Aviso para el orquestador (no es tarea del implementer).** La HU dice que
> `docs/EJEMPLO DE INFORME ANTROPOMETRICO.pdf` "no se versiona porque tiene datos de un paciente",
> pero **está versionado**: `git ls-files` lo lista y lo agregó el commit `6016dfe` ("Ronda 3 de
> épicas"), que está en las ramas `hu-002` a `hu-007`. No está en `origin` (ningún remoto lo
> contiene). Antes del merge o push hay que decidir con el usuario si se saca del historial (y se
> suma a `.gitignore`, como `docs/ISAKMetry_*`). Esta SDD no copia ningún dato de ese PDF: solo
> usa la estructura y los textos genéricos que ya están en la HU.

> **Verificación del architect (2026-09-24).**
> - `@react-pdf/renderer` instalado: **4.9.0** (`@react-pdf/primitives` 4.4.0). Exporta `Svg`,
>   `G`, `Rect`, `Line`, `Path`, `Circle`, `Ellipse`, `Polygon`, `Polyline`, `Text`, `Tspan`,
>   `Defs`, `ClipPath` y `LinearGradient`. `Path` normaliza el comando de arco `A` a curvas de
>   Bézier (`normalize-svg-path`). Los atributos `fill`, `fillOpacity`, `stroke`, `strokeWidth`,
>   `strokeDasharray`, `textAnchor` y `transform` están en los tipos.
> - Rendericé en Node un `Svg` con `Rect`, `Path` con tres arcos `A`, `Circle`, `Line` punteada,
>   `G transform`, `Polygon` y `Text x y textAnchor="middle"`: **genera el PDF sin errores**.
> - **Ojo con los tipos:** `TextProps` de react-pdf **no declara** `x`, `y` ni `textAnchor`,
>   aunque el render los soporta dentro de `Svg`. Por eso hay un wrapper tipado `SvgText`
>   (sección 5.5). No usar `@ts-ignore` suelto.
> - Recalculé los casos A y B con `buildIsakStudy`: todos los valores de la tabla de la HU
>   coinciden. En el menor (A a los 12 años), `diagnosis.waistHipRatio` es `null` (la HU-004 no
>   clasifica el ICC en menores); `computeWaistHipRatio(73, 88)` da 0,83. Con el fémur vacío: óseo
>   `"Sin dato (falta fémur)"`, IMO `"Sin dato (falta tejido óseo)"`, mesomorfia
>   `"Sin dato (falta fémur)"` y somatocarta `"Sin dato (falta mesomorfia)"`.
> - Base de desarrollo (solo lectura): 14 migraciones aplicadas, 15 `EvolutionEntry` (0 ISAK), 18
>   `Consultation`, 4 `OutboundMessage`, 10 `Patient` y 1 `Professional`.

---

## 1. Resumen funcional

Desde el estudio ISAK de una consulta (HU-006), la profesional abre la página nueva **"Informe
antropométrico"** (`.../consultas/[consultationId]/antropometria/informe`). Ahí ve, en el orden del
PDF, las 9 secciones con sus números de solo lectura, comparados con el estudio ISAK anterior del
paciente (`getPreviousIsakStudy`). Las secciones interpretativas tienen un área de texto que
arranca con un **borrador determinista** que arma `packages/core` con plantillas y umbrales (D3).
Los textos son 7: perímetros, distribución, un comentario por cada indicador de salud (IAM, IMO e
ICC), somatotipo y conclusiones. Las conclusiones son obligatorias para generar. Los textos y el
último PDF se guardan en una tabla nueva, **`AnthropometricReport`**, 1:1 con la fila ISAK de
`EvolutionEntry`: si se borra el estudio, se borra el informe (cascada). El PDF usa
`@react-pdf/renderer` con el mismo estilo que el PDF del plan (el encabezado, el pie y la
tipografía se extraen a un módulo común) y dibuja 4 gráficos SVG: barras de perímetros,
silueta con los % por zona, barras apiladas de composición y somatocarta con el contorno de
Reuleaux. La geometría de los gráficos sale de `packages/core`. El pie lleva la firma
`<título> <nombre> · <matrícula>`: `Professional` suma dos columnas nullable que se editan en
`/ajustes`. El envío por WhatsApp es igual que el del plan: `OutboundMessage` suma el valor
`ANTHROPOMETRIC_REPORT_PDF` y una FK nullable al informe, y el consumidor de la cola del bot
suma una rama. No cambia el flujo conversacional. Un PDF desactualizado se detecta con una huella
de los datos de entrada que se guarda al generarlo.

---

## 2. Workspaces afectados

| Workspace | ¿Se toca? | Qué |
|---|---|---|
| `packages/core` | **Sí** | **Nuevos:** `isak-report.ts` (modelo del informe, textos fijos, borradores, variaciones, firma, nombre de archivo, huella) e `isak-report-charts.ts` (geometría de barras, somatocarta, silueta y barras apiladas), cada uno con su `*.test.ts`. **Cambian:** `isak-study.ts` (exporta `SOMATOTYPE_MEASURE_KEYS` y lo usa internamente, sin cambio de comportamiento; `ISAK_TEXT` suma 2 textos) e `index.ts` (exports) |
| `packages/db` | **Sí** | `schema.prisma` (modelo `AnthropometricReport`, 2 columnas en `Professional`, valor nuevo en `MessageKind`, FK en `OutboundMessage`, relación inversa en `EvolutionEntry`), 1 migración aditiva, **nuevo** `domain/anthropometricReports.ts` (exportado en `domain/index.ts`), **nuevo** `scripts/test-anthropometric-report.ts` y su script `test:report` |
| `apps/web` | **Sí** | Página nueva del informe (page, loading, editor cliente y route handler del PDF), server actions nuevas, loader server-only, módulo PDF común (extraído de `plan-pdf.tsx`, sin cambio visual), PDF del informe y sus gráficos, hook de cambios sin guardar, `pdf-theme.ts` (paleta del informe), botón "Informe PDF" en la tarjeta ISAK y en la página del estudio, confirm de borrado del estudio, aviso de la consulta y `/ajustes` (título y matrícula) |
| `apps/bot` | **Sí (mínimo)** | **Nuevo** `src/outbound-payload.ts` (elige documento o texto; sin Baileys), `workers.ts` lo usa (una rama más). **Nuevo** `scripts/test-report-outbox.ts` y su script `test:report-outbox`. `conversation.ts`, `whatsapp.ts`, menús y textos **no se tocan** |

El portal (`(portal)`) **no se toca** (D11). `tailwind.config.ts` **no se toca**.

---

## 3. Esquema (Prisma) y migración: skill `migracion-prisma`

### 3.1 Cambios en `packages/db/prisma/schema.prisma`

```prisma
model Professional {
  // … campos actuales sin cambios …
  pdfFooterText      String?
  /// HU-007 (D1): título que va antes del nombre en el pie del informe, p. ej. "Lic.". null = sin título.
  title              String?
  /// HU-007 (D1): matrícula, p. ej. "M.P. 852". null = no cargada (aviso en la página del informe).
  licenseNumber      String?
  // … resto sin cambios …
}

model EvolutionEntry {
  // … sin cambios …
  /// HU-007: informe antropométrico del estudio ISAK (solo filas con study = ISAK).
  anthropometricReport AnthropometricReport?
}

/// HU-007: informe antropométrico de un estudio ISAK (1:1 con la fila ISAK de EvolutionEntry).
/// Guarda los textos que escribió o revisó la profesional y el último PDF. Los números NO se
/// guardan: se calculan con buildIsakStudy al generar (D18 de la HU-006).
/// Texto null = nunca guardado (la pantalla muestra el borrador automático).
/// "" = guardado vacío a propósito (la sección sale sin párrafo).
model AnthropometricReport {
  id                String         @id @default(cuid())
  isakEntryId       String         @unique
  isakEntry         EvolutionEntry @relation(fields: [isakEntryId], references: [id], onDelete: Cascade)
  girthsText        String?
  distributionText  String?
  adiposeMuscleText String?
  muscleBoneText    String?
  waistHipText      String?
  somatotypeText    String?
  conclusionsText   String?
  pdfData           Bytes?
  pdfFileName       String?
  pdfGeneratedAt    DateTime?
  /// Huella de los datos de entrada al generar el PDF (isakReportSourceKey). Si difiere de la
  /// actual, la página avisa que el PDF está desactualizado (D13).
  pdfSourceKey      String?
  createdAt         DateTime       @default(now())
  updatedAt         DateTime       @updatedAt

  messages OutboundMessage[]
}

enum MessageKind {
  // … valores actuales sin cambios, en el mismo orden …
  PREP_INSTRUCTIONS
  ANTHROPOMETRIC_REPORT_PDF
}

model OutboundMessage {
  // … campos actuales sin cambios …
  planId        String?
  /// HU-007: informe que manda un mensaje ANTHROPOMETRIC_REPORT_PDF.
  anthropometricReport   AnthropometricReport? @relation(fields: [anthropometricReportId], references: [id], onDelete: SetNull)
  anthropometricReportId String?
  // … @@unique([appointmentId, kind]) y @@index sin cambios (appointmentId NULL no choca) …
}
```

Decisiones:
- **1:1 con `EvolutionEntry` (la fila ISAK), no con `Consultation`.** El informe existe solo si hay
  estudio, y borrar el estudio lo borra en cascada (escenario "Borrar el estudio ISAK") sin
  código extra en `deleteIsakStudy`. `Consultation → EvolutionEntry` es `SetNull`, así que borrar
  una consulta no toca el informe (igual que hoy con el estudio).
- **No se guarda el estudio anterior.** Se resuelve siempre con `getPreviousIsakStudy` (D12). Para
  detectar el "PDF desactualizado" alcanza con `pdfSourceKey`, que incluye el id y las medidas del
  anterior. `EvolutionEntry` no tiene `updatedAt`, y la huella además detecta un estudio anterior
  que se editó, se borró o se agregó en el medio.
- **`OutboundMessage.anthropometricReportId` con `SetNull`**, igual que `planId`. Si se borra el
  informe con un envío pendiente, el bot falla con "El informe no tiene PDF generado", reintenta
  y lo marca `FAILED`, como pasa hoy con el plan.

### 3.2 Migración

Nombre: **`anthropometric_report`**. Desde `packages/db`:

```bash
pg_dump respaldo primero (ver 3.3)
npx dotenv -e ../../.env -- prisma migrate dev --create-only --name anthropometric_report
```

SQL esperado (el orden puede variar; **solo aditivo**):

```sql
ALTER TYPE "MessageKind" ADD VALUE 'ANTHROPOMETRIC_REPORT_PDF';
ALTER TABLE "OutboundMessage" ADD COLUMN "anthropometricReportId" TEXT;
ALTER TABLE "Professional" ADD COLUMN "licenseNumber" TEXT, ADD COLUMN "title" TEXT;
CREATE TABLE "AnthropometricReport" ( … "updatedAt" TIMESTAMP(3) NOT NULL, … );   -- tabla nueva: NOT NULL sin filas, OK
CREATE UNIQUE INDEX "AnthropometricReport_isakEntryId_key" ON "AnthropometricReport"("isakEntryId");
ALTER TABLE "AnthropometricReport" ADD CONSTRAINT "AnthropometricReport_isakEntryId_fkey" … ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OutboundMessage" ADD CONSTRAINT "OutboundMessage_anthropometricReportId_fkey" … ON DELETE SET NULL ON UPDATE CASCADE;
```

Revisión obligatoria del SQL antes de aplicar:
- `grep -Ei 'drop|alter column|rename|set not null'` → **sin salida**.
- El único `NOT NULL` está dentro del `CREATE TABLE "AnthropometricReport"`, que es una tabla
  nueva y vacía. Las columnas agregadas a tablas con filas (`Professional`, `OutboundMessage`)
  son **nullable**, así que no hace falta default ni backfill.
- `ALTER TYPE … ADD VALUE` es aditivo. El valor no se usa en la misma migración.
- Si aparece cualquier otra cosa (sobre todo en `EvolutionEntry`), **parar** y reportar
  `blocked`.

Aplicar con `npm run db:migrate` (desde la raíz) y después `npm run db:generate`. Si `migrate dev`
detecta drift u ofrece reset: **parar**, correr `npx dotenv -e ../../.env -- prisma migrate status`
y reportar `blocked`. **Prohibido** `migrate reset`, `db push`, aceptar el reset y editar una
migración ya aplicada.

### 3.3 Respaldo

Antes de aplicar la migración, con `SCRATCHPAD` = la carpeta de scratchpad de la sesión:

```bash
docker compose exec -T db pg_dump -U nutri -d nutribot -Fc > "$SCRATCHPAD/nutribot-pre-hu007.dump"
ls -la "$SCRATCHPAD/nutribot-pre-hu007.dump"   # > 0 bytes
```

Anotar en `progress/impl_HU-007.md` los conteos de antes: `EvolutionEntry`, `Consultation`,
`OutboundMessage`, `Patient` y la fila de `Professional` (`select id, name, "pdfAccentColor",
"pdfFooterText" from "Professional"`). Hoy dan 15, 18, 4 y 10.

---

## 4. Contrato compartido

Consumidores: **W** = `apps/web` y **B** = `apps/bot`. Todo lo de `packages/core` se exporta en
`packages/core/src/index.ts` (`export * from "./isak-report"; export * from "./isak-report-charts";`).

### 4.1 `packages/core/src/isak-study.ts` (cambio chico)

```ts
/** Medidas que necesita cada componente del somatotipo (las mismas que usa buildIsakStudy). */
export const SOMATOTYPE_MEASURE_KEYS = {
  endo: ["tricepsSkinfoldMm", "subscapularSkinfoldMm", "supraspinaleSkinfoldMm", "heightCm"],
  meso: ["humerusBreadthCm", "femurBreadthCm", "armFlexedCm", "tricepsSkinfoldMm", "calfCm", "calfSkinfoldMm", "heightCm"],
  ecto: ["heightCm", "weightKg"],
} as const satisfies Record<"endo" | "meso" | "ecto", readonly IsakMeasureKey[]>;
```

`buildIsakStudy` usa `check({ keys: SOMATOTYPE_MEASURE_KEYS.endo })`, etc., en lugar de los
arrays literales. **Sin cambio de comportamiento:** `isak-study.test.ts` sigue en verde sin
tocarlo.

`ISAK_TEXT` suma:
```ts
  deleteWithReportDescription: "También se borra su informe. No se puede deshacer.",
  reportButton: "Informe PDF",
```

### 4.2 `packages/core/src/isak-report.ts` (nuevo): modelo, textos y borradores

#### 4.2.1 Tipos y claves

```ts
export const ISAK_REPORT_TEXT_KEYS = [
  "girths", "distribution", "adiposeMuscle", "muscleBone", "waistHip", "somatotype", "conclusions",
] as const;
export type IsakReportTextKey = (typeof ISAK_REPORT_TEXT_KEYS)[number];
export type IsakReportTexts = Record<IsakReportTextKey, string>;

export interface IsakReportStudy {
  result: IsakStudyResult;
  /** "dd/MM/yyyy" de la consulta, en la zona de la profesional. */
  dateLabel: string;
  /** A la fecha de esa consulta. */
  ageYears: number | null;
}

export interface IsakReportInput {
  /** patient.name ?? patient.phone */
  patientName: string;
  current: IsakReportStudy;
  previous: IsakReportStudy | null;
}

/** Una fila anterior / actual. Todas las cadenas ya formateadas (es-AR). */
export interface IsakReportRow {
  key: string;
  label: string;                 // "Peso"
  previous: string | null;       // "67,6 kg" | "Sin dato" | null (sin estudio anterior)
  current: string;               // "61,0 kg" | "Sin dato"
  /** Con signo, sin unidad, para la columna "Dif." del panel: "−6,6". null si no hay anterior o algún lado no está ok. */
  diff: string | null;
  /** Para el PDF: "6,6 kg menos" / "0,8 cm más". null si diff es null o la diferencia redondeada es 0. */
  change: string | null;
}

export type IsakTissueKey = "adipose" | "muscle" | "bone" | "residual";
export type CompositionShares = Record<IsakTissueKey, number>; // % ya redondeados a 2

export interface IsakReportBar {
  key: "arm" | "correctedArm" | "thigh" | "correctedThigh" | "calf" | "correctedCalf";
  label: string;                 // "Brazo relajado"
  previous: number | null;       // null = sin anterior o sin dato
  current: number | null;
  decimals: 1 | 2;               // 1 medidas, 2 corregidos
}

export interface IsakReportHealthIndicator {
  key: "adiposeMuscle" | "muscleBone" | "waistHip";
  label: string;                 // "Índice adiposo muscular" | "Índice músculo/óseo" | "Índice cintura/cadera"
  value: string;                 // "0,57" | "Sin dato"
  category: string | null;       // "Medio" | "Sin riesgo aumentado" | null
  /** Línea automática, no editable: "Bajó de 0,59 a 0,57 (−0,02)". null sin anterior o sin dato. */
  variation: string | null;
  textKey: IsakReportTextKey;    // = key
}

export interface IsakReportModel {
  title: string;                 // "Informe antropométrico"
  /** "Consulta del 08/05/2026 · comparado con el estudio del 05/11/2025" | "… · primer estudio, sin comparación" */
  subtitle: string;
  hasPrevious: boolean;
  minor: boolean;
  /** true si algún valor ACTUAL que el informe muestra es "Sin dato" o la somatocarta no tiene punto actual. */
  hasMissingData: boolean;
  /** "Medición anterior (05/11/2025)" | null ; "Medición actual (08/05/2026)" */
  columns: { previous: string | null; current: string };
  personal: { name: string; age: string /* "22 años" | "Sin dato" */; date: string /* "08/05/2026" */ };
  measurements: {
    minorNote: string | null;    // ISAK_TEXT.minorWarning si minor
    rows: IsakReportRow[];       // weight (1 dec, kg), height (1 dec, cm)
    bmi: IsakReportRow;          // label "IMC (OMS)"; "25,1 · Sobrepeso" | "22,7" (menor) | "Sin dato"; diff/change null
  };
  skinfolds: {
    intro: string;
    rows: IsakReportRow[];       // tríceps, subescapular, supraespinal, abdominal, muslo, pierna (1 dec, mm)
    sum6: IsakReportRow;         // "Sumatoria de 6 pliegues" (1 dec, mm)
    othersTitle: string;         // "Otros pliegues"
    others: IsakReportRow[];     // bíceps, cresta ilíaca (1 dec, mm)
  };
  girths: {
    muscleIntro: string;
    muscle: IsakReportRow[];     // brazo relajado, brazo flexionado y contraído, muslo medio, pierna (1 dec, cm)
    visceralIntro: string;
    visceral: IsakReportRow[];   // cintura, cadera (1 dec, cm)
    correctedIntro: string;
    corrected: IsakReportRow[];  // brazo, muslo, pierna corregidos (2 dec, cm)
  };
  distribution: {
    bars: IsakReportBar[];       // 6, en el orden de la HU
    adipose: Array<{ key: "upper" | "central" | "lower"; label: string; value: string }>; // "30,99 %"
    muscle: Array<{ key: "arm" | "thigh" | "calf"; label: string; value: string }>;
  };
  health: { indicators: IsakReportHealthIndicator[] }; // adulto: IAM, IMO, ICC ; menor: solo ICC
  /** null en menores (D10). */
  composition: null | {
    intro: string;
    methods: string;
    rows: Array<{ key: IsakTissueKey; label: string; previous: string | null; current: string }>; // "27,02 % (16,48 kg)"
    bars: { previous: CompositionShares | null; current: CompositionShares | null };
  };
  somatotype: {
    intro: string;
    /** "Endomorfia 4,95 → 4,03 · Mesomorfia 5,72 → 5,69 · Ectomorfia 1,01 → 1,92" (sin anterior: "Endomorfia 4,03 · …") */
    components: string;
    category: string;            // "Endo-mesomorfo" | "Sin dato"
    chart: {
      current: { x: number; y: number } | null;
      previous: { x: number; y: number } | null;
      /** "Somatotipo sin dato (falta fémur)" si no hay punto actual. */
      missingNote: string | null;
    };
  };
  /** Los textos que usa este informe, en orden (en menores sin adiposeMuscle ni muscleBone). */
  textKeys: IsakReportTextKey[];
}
```

#### 4.2.2 Textos fijos

```ts
export const ISAK_REPORT_TEXT = {
  title: "Informe antropométrico",
  pageTitle: "Informe antropométrico",
  subtitle: (currentDate: string, previousDate: string | null) =>
    previousDate
      ? `Consulta del ${currentDate} · comparado con el estudio del ${previousDate}`
      : `Consulta del ${currentDate} · primer estudio, sin comparación`,
  columnPrevious: (date: string) => `Medición anterior (${date})`,
  columnCurrent: (date: string) => `Medición actual (${date})`,
  legendPrevious: (date: string) => `Anterior (${date})`,
  legendCurrent: (date: string) => `Actual (${date})`,
  sections: {
    personal: "Datos personales",
    measurements: "Mediciones antropométricas",
    skinfolds: "Pliegues cutáneos",
    girths: "Perímetros y perímetros corregidos",
    distribution: "Distribución adiposo-muscular",
    health: "Indicadores de salud",
    composition: "Composición corporal",
    somatotype: "Somatotipo",
    conclusions: "Conclusiones",
  },
  personalName: "Nombre y apellido",
  personalAge: "Edad",
  personalDate: "Fecha de evaluación",
  skinfoldsIntro: "Los siguientes pliegues son indicadores de grasa corporal subcutánea (externa).",
  otherSkinfolds: "Otros pliegues",
  girthsMuscleIntro: "Los siguientes perímetros son indicadores de masa muscular.",
  girthsVisceralIntro: "Los siguientes perímetros son indicadores de grasa visceral (abdominal).",
  girthsCorrectedIntro:
    "Los perímetros corregidos descuentan el pliegue y estiman la masa muscular: cuando aumentan, aumenta la masa muscular.",
  compositionIntro:
    "La composición corporal es la forma en que se distribuye el peso total del cuerpo en sus distintos componentes. Permite conocer qué parte del peso corresponde a tejido adiposo, muscular, óseo y residual.",
  compositionMethods: "Métodos: Kerr (1991), Lee (2000), Rocha (1974), residual por diferencia",
  somatotypeIntro:
    "El somatotipo clasifica el cuerpo de una persona según sus características físicas predominantes: la forma, la distribución de la masa muscular y de la grasa, y la contextura general.",
  adiposeTissue: "Tejido adiposo",
  muscleTissue: "Tejido muscular",
  noData: "Sin dato",
  // Pantalla
  reviewNotice: "Revisá y editá los textos antes de generar el PDF.",
  missingDataNotice: "Faltan datos en el estudio: el PDF va a mostrar «Sin dato» en algunos valores.",
  editStudy: "Editar estudio",
  licenseMissing: "Tu matrícula no está cargada. Completala en Ajustes para que aparezca en el informe.",
  goToSettings: "Ir a Ajustes",
  stalePdf: "El estudio cambió después de generar este PDF. Generalo de nuevo antes de enviarlo.",
  draftBadge: "Borrador automático",
  editedBadge: "Editado",
  resetDraft: "Volver al borrador",
  resetDraftTitle: "¿Reemplazar tu texto por el borrador automático?",
  resetDraftDescription: "Se pierde lo que escribiste en esta sección.",
  saveTexts: "Guardar textos",
  savingTexts: "Guardando…",
  textsSaved: "Textos del informe guardados",
  generate: "Generar PDF",
  generating: "Generando…",
  generated: "Informe generado",
  download: "Descargar",
  send: "Enviar por WhatsApp",
  sending: "Enviando…",
  sendConfirmTitle: (phone: string) => `¿Enviar el informe a ${phone}?`,
  sendConfirmDescription: "Se genera el PDF con los textos actuales y se encola para WhatsApp.",
  sendConfirmLabel: "Enviar",
  queued: (phone: string) => `Encolado para enviar por WhatsApp a ${phone}.`,
  lastPdf: (label: string) => `Último PDF: ${label}`,
  noPdf: "Todavía no generaste el PDF.",
  cardGenerated: (label: string) => `Informe generado el ${label}`,
  conclusionsRequired: "Escribí las conclusiones antes de generar el informe",
  saveError: "No se pudieron guardar los textos. Probá de nuevo.",
  generateError: "No se pudo generar el informe. Probá de nuevo.",
  sendError: "No se pudo encolar el envío. Probá de nuevo.",
  discardTitle: "¿Descartar los cambios de los textos?",
  discardDescription: "Hay textos del informe sin guardar.",
  discardLabel: "Descartar",
  noStudyNotice: "Primero cargá el estudio ISAK de esta consulta.",
  backToStudy: "Volver al estudio",
  whatsappCaption: (dateLabel: string) =>
    `📄 Te comparto tu informe antropométrico del ${dateLabel}. Cualquier duda lo charlamos en la próxima consulta.`,
  textLabels: {
    girths: "Texto de perímetros",
    distribution: "Texto de distribución adiposo-muscular",
    adiposeMuscle: "Comentario del índice adiposo muscular",
    muscleBone: "Comentario del índice músculo/óseo",
    waistHip: "Comentario del índice cintura/cadera",
    somatotype: "Texto del somatotipo",
    conclusions: "Conclusiones",
  } satisfies Record<IsakReportTextKey, string>,
} as const;
```

#### 4.2.3 Funciones

```ts
/** Arma el modelo del informe. Pura; no recalcula nada: lee de IsakStudyResult. */
export function buildIsakReportModel(input: IsakReportInput): IsakReportModel;

/** Borradores de los 7 textos (D3). Deterministas. Los que no aplican (p. ej. IAM en menores) dan "". */
export function buildIsakReportDrafts(input: IsakReportInput): IsakReportTexts;

/** Texto guardado (si no es null) o borrador, por clave. */
export function resolveIsakReportTexts(
  saved: Record<IsakReportTextKey, string | null> | null,
  drafts: IsakReportTexts,
): IsakReportTexts;

/** "Bajó de 0,59 a 0,57 (−0,02)" | "Subió de 2,80 a 2,95 (+0,15)" | "Se mantuvo en 0,83". null si alguno no está ok. */
export function variationLine(current: IsakValue, previous: IsakValue | null | undefined, decimals: number): string | null;

/** "Lic. Daiana Ponce · M.P. 852" ; sin título: "Daiana Ponce · M.P. 852" ; sin matrícula: "Lic. Daiana Ponce" ; trim a todo. */
export function professionalSignature(p: { title: string | null; name: string; licenseNumber: string | null }): string;

/** "informe-antropometrico-2026-05-08.pdf" a partir del dayKey de la consulta. */
export function isakReportFileName(consultationDayKey: string): string;

/** Huella de los datos de entrada (D13). FNV-1a de 32 bits, en hex de 8 caracteres, sobre el JSON
 *  canónico (claves en orden fijo) de: current.entryId, current.measures, current.dateLabel,
 *  current.ageYears, previous (mismo shape, o null) y sex. No incluye textos ni el nombre. */
export function isakReportSourceKey(input: {
  sex: Sex | null;
  current: { entryId: string; measures: IsakMeasures; dateLabel: string; ageYears: number | null };
  previous: { entryId: string; measures: IsakMeasures; dateLabel: string; ageYears: number | null } | null;
}): string;

/** Umbrales de "estable" de los borradores (D3). Ajustables sin tocar lógica. Inclusivos: |dif| <= umbral → estable. */
export const ISAK_REPORT_STABLE_THRESHOLDS = {
  weightKg: 0.5,
  girthCm: 0.5,          // perímetros y corregidos
  sum6Mm: 2,
  index: 0.02,           // IAM e IMO
  distributionPoints: 1, // puntos porcentuales de la distribución adiposa
  somatotype: 0.5,       // cada componente
} as const;
```

Reglas del modelo:
- **Celdas:** si es `ok`, `formatFixedEs(value, dec)` + `" " + unidad` (`kg`, `cm`, `mm`, `%`; los
  índices sin unidad). Si no es `ok` (`missing` o `not_for_minors`), `"Sin dato"`. Las medidas
  salen de `result.measures` (`value: number | null`), con 1 decimal.
- **`diff`:** `formatSignedFixedEs(roundTo(cur − prev, dec), dec)`. **`change`:** `null` si la
  diferencia redondeada es 0; si no, `"${formatFixedEs(|d|, dec)} ${unidad} ${d < 0 ? "menos" : "más"}"`.
- **IMC:** `diagnosis.bmi`. Si es `classified`: `"25,1 · Sobrepeso"`. Si es `unclassified`
  (menor): `"22,7"`. Si es `missing`: `"Sin dato"`. `diff` y `change` son `null`.
- **ICC:** en adultos, `diagnosis.waistHipRatio` (`classified` da `category = classLabel`;
  `unclassified`, `category = null`). En menores, que no tienen fila en la HU-004, se usa
  `computeWaistHipRatio(waist, hip)` sin categoría (como el IMC del menor). Si da `null`, sale
  `"Sin dato"`. La variación va con 2 decimales.
- **IAM e IMO:** solo adultos. `category` del IAM es siempre `null` (D8 de la HU-006); la del IMO
  es su `classLabel`.
- **Composición:** `null` si `minor`. Las filas dicen `"27,02 % (16,48 kg)"` si `percent` y `kg`
  están ok; si no, `"Sin dato"`. `bars.x` vale `null` si alguno de los 4 `percent` no está ok o
  si `residual.negative`.
- **Somatocarta:** los puntos son `chart.x`/`chart.y` si están ok. Si falta el actual, `missingNote`
  = `"Somatotipo " + lowerFirst(missingMeasuresNote(keysFaltantes))`, donde `keysFaltantes` son las
  claves de `SOMATOTYPE_MEASURE_KEYS.{endo,meso,ecto}` (sin repetir, en el orden de
  `ISAK_MEASURE_KEYS`) cuyo `value` es `null` en `result.measures`. Ejemplo: `"Somatotipo sin dato
  (falta fémur)"`.
- **`hasMissingData`:** se marca si alguna celda **actual** que muestra el informe (secciones 2 a
  8; en menores, sin las que no aplican) da `"Sin dato"`, o si `somatotype.chart.current` es
  `null`.
- **`textKeys`:** en adultos, los 7 en el orden de `ISAK_REPORT_TEXT_KEYS`. En menores, sin
  `adiposeMuscle` ni `muscleBone`.

#### 4.2.4 Borradores (D3): plantillas exactas

Helpers internos: `joinEs(["a"])="a"`, `joinEs(["a","b"])="a y b"`, `joinEs(["a","b","c"])="a, b y c"`;
`capitalize`; `trend(d, umbral)` = `"stable"` si `|d| <= umbral + 1e-9`, si no `"down"` o `"up"`.
Verbo por tendencia: `down` → `"bajó"`, `up` → `"subió"`. Las diferencias se toman de
`isakDifference` con los decimales de la celda. Los números van con `formatFixedEs`. Si una
medida no está ok en algún lado, su parte se omite. Si no queda ninguna oración, el borrador es
`""`.

- **`girths`**
  - Con anterior:
    - O1 = `"Respecto de la evaluación anterior, " + joinEs(partes) + "."`. Hay una parte por cada
      corregido: `"el brazo corregido"`, `"el muslo corregido"` y `"la pierna corregida"`, seguido
      de `" bajó|subió X cm"` o de `" se mantuvo estable"` (umbral `girthCm`, 2 decimales).
    - O2 = `capitalize(joinEs(partes)) + "."`, con `"la cintura"` y `"la cadera"` y la misma forma
      (1 decimal).
    - O3, solo si los 3 corregidos tienen diferencia:
      - todos `down`: `"En conjunto, sugiere una disminución de la masa muscular."`;
      - todos `up`: `"En conjunto, sugiere un aumento de la masa muscular."`;
      - todos `stable`: `"En conjunto, los cambios son mínimos y sugieren una masa muscular estable."`;
      - si son mixtos, no hay O3.
  - Sin anterior: `"Perímetros corregidos: " + joinEs(["brazo 26,74 cm", "muslo 48,54 cm", "pierna 32,62 cm"]) + "."`
    y `capitalize(joinEs(["cintura 73,0 cm", "cadera 88,0 cm"])) + "."`.
  - Las oraciones van separadas por un espacio.
- **`distribution`**
  - O1: `"Respecto de la distribución de la grasa corporal, predomina la zona ${superior|central|inferior} (${%})."`
    (el máximo de los 3; en empate gana el primero en el orden superior, central, inferior).
  - O2: `"En cuanto a la masa muscular, se concentra principalmente en ${el brazo|el muslo|la pierna} (${%})."`
    (mismo criterio).
  - O3, solo con anterior: se toma la zona adiposa con mayor `|dif|` (en empate, la primera). Si
    `|dif| <= distributionPoints`: `"La distribución de la grasa se mantuvo similar a la
    evaluación anterior."`. Si no: `"Frente a la evaluación anterior, la proporción de grasa de
    la zona ${zona} pasó de ${prev} % a ${cur} %."`.
- **`adiposeMuscle`** (solo adultos, con el IAM actual ok)
  - Con anterior ok, según la tendencia (umbral `index`):
    - `down`: `"Refleja una reducción del tejido adiposo en relación con la masa muscular."`;
    - `up`: `"Refleja un aumento del tejido adiposo en relación con la masa muscular."`;
    - `stable`: `"Se mantiene estable la relación entre el tejido adiposo y la masa muscular."`.
  - Sin anterior: `ISAK_TEXT.adiposeMuscleHint`.
- **`muscleBone`** (solo adultos, con el IMO actual ok)
  - Con anterior ok:
    - `down`: `"Muestra una disminución de la masa muscular en relación con la masa ósea."`;
    - `up`: `"Muestra un aumento de la masa muscular en relación con la masa ósea."`;
    - `stable`: `"Se mantiene estable la relación entre la masa muscular y la masa ósea."`.
  - Sin anterior: `` `Se ubica en la categoría ${classLabel.toLowerCase()} de la relación entre masa muscular y masa ósea.` ``.
- **`waistHip`** (solo si el ICC actual es `classified`)
  - `NO_RISK`: `"El resultado indica que la distribución de la grasa corporal no representa un factor de riesgo cardiometabólico aumentado."`.
  - `INCREASED`: `"El resultado indica una distribución de la grasa corporal asociada a un riesgo cardiometabólico aumentado."`.
  - Si es `unclassified` o `missing`, el borrador es `""`.
- **`somatotype`** (solo con la categoría actual ok)
  - O1: `` `El análisis del somatotipo evidencia un perfil ${label.toLowerCase()}.` ``.
  - O2: si la categoría es `CENTRAL`, `"Ningún componente predomina claramente."`. Si no, se toma
    el componente máximo (en empate, el orden es endo, meso, ecto) y se escribe `` `Predomina la
    ${endomorfia|mesomorfia|ectomorfia} (${adiposidad relativa|desarrollo músculo-esquelético
    relativo|linealidad relativa}).` ``. Estos son los textos por componente que la HU-006 dejó
    para esta HU (su D12).
  - O3, solo si la categoría anterior está ok:
    `"Respecto de la evaluación anterior, " + cat + comp + "."`, donde:
    - `cat` = `"se mantiene la categoría"` si coincide la clave; si no, `` `la categoría pasó de
      ${prev.toLowerCase()} a ${cur.toLowerCase()}` ``;
    - `comp` = `"; " + joinEs(partes)`, con una parte por cada componente con `|dif| >
      somatotype`: `` `la ${endomorfia|…} bajó|subió X` ``, con 2 decimales y sin unidad. Si
      ninguno cambia, `comp` = `"; los tres componentes se mantienen estables"`.
- **`conclusions`** (nunca vacío)
  - O1:
    - con anterior: `` `En comparación con la evaluación del ${prevDate}, ` + joinEs(partes) + "." ``,
      con las partes `"el peso bajó|subió X kg"` / `"el peso se mantuvo estable"` (umbral
      `weightKg`, 1 decimal) y `"la sumatoria de 6 pliegues bajó|subió X mm"` / `"… se mantuvo
      estable"` (umbral `sum6Mm`);
    - sin anterior: `"En esta primera evaluación, " + joinEs(["el peso es de 61,0 kg", "la
      sumatoria de 6 pliegues es de 71,0 mm"]) + "."`.
  - O2 (solo adultos):
    - con anterior: `capitalize(joinEs(["el tejido muscular pasó de X % a Y %", "el tejido
      adiposo pasó de X % a Y %"])) + "."`;
    - sin anterior: `capitalize(joinEs(["el tejido muscular representa el X % del peso", "el
      tejido adiposo representa el X % del peso"])) + "."`.
  - O3 (siempre): `"Se sugiere continuar con controles periódicos para monitorear la evolución."`.

### 4.3 `packages/core/src/isak-report-charts.ts` (nuevo): geometría (el PDF solo dibuja)

Todas las coordenadas van en puntos PDF, con origen arriba a la izquierda (y hacia abajo).

```ts
// ── Barras de perímetros (anterior vs actual) ──
export interface GirthBarsLayout {
  width: number;
  height: number;
  axisMax: number;                                   // múltiplo de 10, >= 10
  ticks: Array<{ x: number; label: string }>;        // cada 10 desde 0 ("0", "10", …)
  axisY: number;                                     // y de la línea del eje
  groups: Array<{
    key: IsakReportBar["key"];
    label: string; labelX: number; labelY: number;   // textAnchor "end"
    bars: Array<{
      series: "previous" | "current";
      x: number; y: number; width: number; height: number; // width 0 si value null
      valueLabel: string;                            // "30,2" | "26,74" | "Sin dato"
      valueX: number; valueY: number;                // textAnchor "start"
    }>;
  }>;
}
export const GIRTH_BARS = { labelWidth: 96, valueWidth: 32, barHeight: 7, barGap: 2, groupGap: 7, top: 4, axisHeight: 14 } as const;
export function buildGirthBarsLayout(bars: IsakReportBar[], opts: { width: number; hasPrevious: boolean }): GirthBarsLayout;
```
- La serie es `["previous", "current"]` si `hasPrevious` y `["current"]` si no.
- `plotX = labelWidth`, `plotWidth = width − labelWidth − valueWidth`,
  `axisMax = max(10, ceil(maxValor / 10) × 10)` y `xOf(v) = plotX + v / axisMax × plotWidth`.
- `valueX = xOf(v) + 3`. Si el valor es null: `width 0`, `valueLabel "Sin dato"` y
  `valueX = plotX + 3`.
- Las etiquetas de grupo usan `labelX = labelWidth − 6`.

```ts
// ── Somatocarta (contorno de Reuleaux) ──
/** Punto medio de cada arco, en unidades de la carta (X, Y). El eje de cada vértice pasa por el origen y termina acá. */
export const SOMATOCHART_ARC_MIDPOINTS: {
  oppositeEndomorph: { x: number; y: number };   // ≈ ( 4,392;  4,392)
  oppositeMesomorph: { x: number; y: number };   // ≈ ( 0;     −8,785)
  oppositeEctomorph: { x: number; y: number };   // ≈ (−4,392;  4,392)
};
export interface SomatochartLayout {
  width: number; height: number;
  /** Radio del arco en puntos (= lado del triángulo = 12 unidades X × escala). */
  radius: number;
  /** "M ex ey A r r 0 0 1 mx my A r r 0 0 1 cx cy A r r 0 0 1 ex ey Z" (2 decimales). */
  contourPath: string;
  axes: Array<{ x1: number; y1: number; x2: number; y2: number }>;   // 3: vértice → punto medio opuesto
  gridX: Array<{ x: number; label: string }>;                          // cada 2 unidades
  gridY: Array<{ y: number; label: string }>;
  plot: { left: number; top: number; right: number; bottom: number };
  vertexLabels: Array<{ text: "Mesomorfia" | "Endomorfia" | "Ectomorfia"; x: number; y: number; anchor: "start" | "middle" | "end" }>;
  points: { current: { cx: number; cy: number } | null; previous: { cx: number; cy: number } | null };
}
export function buildSomatochartLayout(opts: {
  width: number;
  current: { x: number; y: number } | null;
  previous: { x: number; y: number } | null;
}): SomatochartLayout;
```
- **Escala:** la geometría de Heath-Carter es un triángulo de Reuleaux en un espacio donde la
  unidad Y mide `1/√3` de la unidad X. Así los vértices `SOMATOCHART_VERTICES` (−6,−6), (0,12) y
  (6,−6) forman un triángulo equilátero de lado 12, y cada arco tiene centro en el vértice opuesto
  y radio igual al lado.
- **Dominio:** se parte de `SOMATOCHART_DOMAIN` (x [−8, 8], y [−10, 16]) y se amplía para
  incluir los puntos, redondeando a pares (el mismo criterio que `domainAndTicks` de la
  somatocarta del panel).
- **Márgenes:** `padLeft 18`, `padRight 6`, `padTop 14`, `padBottom 14`.
  - `s = (width − padLeft − padRight) / (xmax − xmin)`;
  - `px(x) = padLeft + (x − xmin) · s`;
  - `py(y) = padTop + (ymax − y) · s / √3`;
  - `height = padTop + (ymax − ymin) · s / √3 + padBottom`.
- **Contorno:** `radius = 12 · s`. Arcos endo → meso → ecto → endo con banderas `0 0 1`: se
  recorren en sentido horario en pantalla, así que cada arco se curva hacia afuera. **Verificarlo
  en el PNG renderizado** (sección 11). Si se curva hacia adentro, la bandera va en 0 y se
  corrige el test.
- **Etiquetas de los vértices:** "Mesomorfia" arriba del vértice superior (`middle`, `y − 4`);
  "Endomorfia" abajo a la izquierda del vértice izquierdo (`start`, `y + 10`); "Ectomorfia"
  abajo a la derecha del vértice derecho (`end`, `y + 10`). Se pueden retocar a ojo en el
  render.

```ts
// ── Silueta esquemática (D5) ──
export type BodyZone = "upper" | "central" | "lower";
export const REPORT_BODY_FIGURE: {
  viewBox: { width: 100; height: 220 };
  head: { cx: number; cy: number; r: number };
  /** Cada parte se pinta con el color de su zona adiposa. */
  parts: ReadonlyArray<{ key: string; zone: BodyZone; x: number; y: number; width: number; height: number; rx: number }>;
  /** y del rótulo de cada zona adiposa (a la izquierda de la figura). */
  adiposeLabelY: Record<BodyZone, number>;
  /** y del rótulo de cada región muscular (a la derecha) y el punto de la figura al que apunta. */
  muscleLabels: Record<"arm" | "thigh" | "calf", { y: number; targetX: number; targetY: number }>;
};
```
- La asignación de zonas coincide con `adiposeDistribution`:
  - `upper` (tríceps y subescapular): los dos brazos y la parte superior del tronco (el pecho);
  - `central` (supraespinal y abdominal): la parte inferior del tronco (el abdomen);
  - `lower` (muslo y pierna): las dos piernas.
- Valores de partida (el implementer puede ajustarlos a ojo):
  - `head`: (50, 16, r 12);
  - `chest`: x 30, y 32, 40×36, rx 8;
  - `abdomen`: x 30, y 68, 40×42, rx 6;
  - `armL`: x 16, y 34, 12×74, rx 6; `armR`: x 72, y 34, 12×74, rx 6;
  - `legL`: x 32, y 112, 16×100, rx 7; `legR`: x 52, y 112, 16×100, rx 7.

```ts
// ── Barras apiladas de composición al 100 % (D4) ──
export interface CompositionBarsLayout {
  width: number; height: number;
  rows: Array<{
    series: "previous" | "current";
    label: string; labelY: number;                   // "Anterior (05/11/2025)" / "Actual (08/05/2026)"
    /** null → la fila dice "Sin dato" en noDataX/noDataY. */
    segments: Array<{ key: IsakTissueKey; x: number; y: number; width: number; height: number; label: string | null; labelX: number; labelY: number }> | null;
    noDataX: number; noDataY: number;
  }>;
}
export const COMPOSITION_BARS = { labelWidth: 110, barHeight: 16, rowGap: 8, minLabelWidth: 30 } as const;
export function buildCompositionBarsLayout(
  bars: { previous: CompositionShares | null; current: CompositionShares | null },
  opts: { width: number; hasPrevious: boolean; previousLabel: string | null; currentLabel: string },
): CompositionBarsLayout;
```
- Orden de filas: primero "Anterior" (si `hasPrevious`) y después "Actual".
- Orden de segmentos: adiposo, muscular, óseo y residual. El ancho es proporcional a
  `% / Σ%`, así los 4 suman exactamente el ancho útil.
- El `label` es `"27,02 %"` si el segmento mide al menos `minLabelWidth`; si no, `null` (el valor
  está igual en la lista de abajo y en la leyenda).

### 4.4 `packages/db/domain/anthropometricReports.ts` (nuevo), exportado en `domain/index.ts`

```ts
import type { IsakReportTextKey, IsakReportTexts } from "@nutri-bot/core";
import { Prisma, prisma, type OutboundMessage } from "../index";

export interface AnthropometricReportMeta {
  id: string;
  isakEntryId: string;
  /** null = nunca guardado. */
  texts: Record<IsakReportTextKey, string | null>;
  pdfFileName: string | null;
  pdfGeneratedAt: Date | null;
  pdfSourceKey: string | null;
}

/** Mapeo fijo clave → columna (girths → girthsText, …). */
export const REPORT_TEXT_COLUMNS: Record<IsakReportTextKey, "girthsText" | "distributionText" | "adiposeMuscleText" | "muscleBoneText" | "waistHipText" | "somatotypeText" | "conclusionsText">;

/** Sin pdfData (select explícito). null si no hay informe. W */
export function getAnthropometricReportMeta(isakEntryId: string): Promise<AnthropometricReportMeta | null>;

/** Upsert por isakEntryId con los 7 textos tal cual (strings, "" incluido). No toca el PDF. W */
export function saveAnthropometricReportTexts(params: { isakEntryId: string; texts: IsakReportTexts }): Promise<AnthropometricReportMeta>;

/** update por isakEntryId: pdfData, pdfFileName, pdfGeneratedAt = now(), pdfSourceKey. El informe
 *  tiene que existir (la action guarda los textos antes). Devuelve { id }. W */
export function saveAnthropometricReportPdf(params: { isakEntryId: string; data: Buffer; fileName: string; sourceKey: string }): Promise<{ id: string }>;

/** Bytes para el route handler de descarga. null si no hay informe o no tiene PDF. W */
export function getAnthropometricReportPdf(isakEntryId: string): Promise<{ data: Buffer; fileName: string } | null>;

/** Crea el OutboundMessage PENDING de kind ANTHROPOMETRIC_REPORT_PDF. `db` permite usarlo dentro
 *  de una transacción (la prueba del bot la revierte). W (y el script de prueba de B) */
export function enqueueAnthropometricReportMessage(
  params: { reportId: string; toJid: string; caption: string },
  db?: Prisma.TransactionClient,
): Promise<OutboundMessage>;
```

`deleteIsakStudy` **no cambia**: la cascada de la FK borra el informe.

### 4.5 `apps/bot/src/outbound-payload.ts` (nuevo, B; sin importar `whatsapp.ts`)

```ts
import type { Prisma } from "@nutri-bot/db";

export const OUTBOX_INCLUDE = {
  plan: { select: { pdfData: true, pdfFileName: true } },
  anthropometricReport: { select: { pdfData: true, pdfFileName: true } },
} satisfies Prisma.OutboundMessageInclude;

export type OutboxRow = Prisma.OutboundMessageGetPayload<{ include: typeof OUTBOX_INCLUDE }>;

export type OutboundPayload =
  | { type: "document"; buffer: Buffer; fileName: string }
  | { type: "text"; body: string };

/** PLAN_PDF → documento del plan (igual que hoy, default "plan-alimentario.pdf").
 *  ANTHROPOMETRIC_REPORT_PDF → documento del informe (default "informe-antropometrico.pdf").
 *  Cualquier otro kind → texto (body). Sin PDF → throw Error:
 *    `El plan no tiene PDF generado: ${msg.planId ?? msg.id}` (mensaje actual, sin cambios)
 *    `El informe no tiene PDF generado: ${msg.anthropometricReportId ?? msg.id}` */
export function resolveOutboundPayload(msg: OutboxRow): OutboundPayload;
```

`workers.ts`: `include: OUTBOX_INCLUDE`; en el loop, `const payload = resolveOutboundPayload(msg)`,
y si es `document` → `sendDocument(msg.toJid, payload.buffer, payload.fileName)`; si no,
`sendText(msg.toJid, payload.body)`. El resto del `tick()` (SENT, reintentos, `MAX_ATTEMPTS`,
pausa si no está conectado) **no cambia**. El caption no se manda (D7): queda en `body`.

---

## 5. Rutas, server actions y API (apps/web)

### 5.1 Rutas

| Ruta | Tipo | Qué |
|---|---|---|
| `/pacientes/[id]/consultas/[consultationId]/antropometria/informe` | page (server) | Página del informe. Consulta inexistente o de otro paciente: `notFound()`. Sin estudio ISAK: `redirect(consultationHref + "?aviso=sin-isak")` |
| `/pacientes/[id]/consultas/[consultationId]/antropometria/informe/pdf` | route handler `GET` | Devuelve el último PDF: `Content-Type: application/pdf`, `Content-Disposition: inline; filename="<pdfFileName>"`, `Cache-Control: private, no-store`. Chequea `auth()` (401), que la consulta sea del paciente (404) y que haya estudio y PDF (404 `{ error: "sin PDF" }`). Queda cubierto también por el `middleware` |
| `/pacientes/[id]/consultas/[consultationId]?aviso=sin-isak` | page existente | Muestra `Alert` info con `ISAK_REPORT_TEXT.noStudyNotice` arriba de las tarjetas |

### 5.2 Loader server-only: `apps/web/src/lib/anthropometric-report.ts`

```ts
import "server-only";
export type IsakReportContext = {
  patientId: string; consultationId: string;
  consultationHref: string; studyHref: string; reportHref: string;
  patient: Patient; pro: Professional;
  entry: EvolutionEntry;                 // fila ISAK
  input: IsakReportInput;                // para core
  model: IsakReportModel;
  drafts: IsakReportTexts;
  report: AnthropometricReportMeta | null;
  texts: IsakReportTexts;                // resolveIsakReportTexts(report?.texts ?? null, drafts)
  sourceKey: string;
  fileName: string;                      // isakReportFileName(dayKey de la consulta)
  currentDateLabel: string;
  stale: boolean;                        // report?.pdfGeneratedAt != null && report.pdfSourceKey !== sourceKey
};
export async function loadIsakReportContext(patientId: string, consultationId: string):
  Promise<{ status: "ok"; ctx: IsakReportContext } | { status: "not_found" } | { status: "no_study"; consultationHref: string }>;
```
Arma todo igual que la página del estudio de la HU-006: `getConsultation`, `getProfessional`,
`getIsakStudy`, `getPreviousIsakStudy`, `computeAgeYears` a la fecha de **cada** consulta,
`buildIsakStudy` y las fechas con `formatInTimeZone(…, "dd/MM/yyyy")`. **No recalcula** nada por
su cuenta.

### 5.3 Server actions: `apps/web/src/app/(panel)/pacientes/[id]/report-actions.ts` (`"use server"`)

```ts
export type ReportActionState =
  | { ok: true }
  | { ok: false; error?: string; fieldErrors?: Partial<Record<IsakReportTextKey, string>> };

type ReportActionInput = { patientId: string; consultationId: string; texts: IsakReportTexts };

export async function saveIsakReportTextsAction(input: ReportActionInput): Promise<ReportActionState>;
export async function generateIsakReportPdfAction(input: ReportActionInput): Promise<ReportActionState>;
export async function sendIsakReportWhatsAppAction(input: ReportActionInput): Promise<ReportActionState>;
```
- **Validación (zod):** los ids con `min(1)`; `texts` con las 7 claves obligatorias, strings, y
  máximo 4000 caracteres (conclusiones: 6000). Si no pasa: `{ ok: false, error: "Datos
  inválidos" }`. Además `belongsToPatient`, y el contexto tiene que dar `status: "ok"`.
- **save:** `saveAnthropometricReportTexts`, `revalidateReport` y `{ ok: true }`. Si falla:
  `ISAK_REPORT_TEXT.saveError`.
- **generate:**
  1. Si `texts.conclusions.trim() === ""`: `{ ok: false, fieldErrors: { conclusions:
     ISAK_REPORT_TEXT.conclusionsRequired } }`, **sin guardar ni generar**.
  2. Guarda los textos.
  3. `renderAnthropometricReportPdf` con los textos guardados.
  4. `saveAnthropometricReportPdf({ isakEntryId, data, fileName, sourceKey })`.
  5. `revalidateReport`. Si falla: `ISAK_REPORT_TEXT.generateError` (con `console.error`).
- **send:** los mismos pasos de generate (siempre regenera, D13) y después
  `enqueueAnthropometricReportMessage({ reportId, toJid: patient.whatsappJid, caption:
  ISAK_REPORT_TEXT.whatsappCaption(currentDateLabel) })`. Si falla: `ISAK_REPORT_TEXT.sendError`.
- **`revalidateReport(patientId, consultationId)`:** revalida `/pacientes/${id}/consultas/${cid}`,
  `…/antropometria` y `…/antropometria/informe`.
- Se llaman **directo desde el cliente**, no como `<form action>`. El `confirm` se espera en el
  handler **antes** de `startTransition`.

### 5.4 `/ajustes` (`apps/web/src/app/(panel)/ajustes/actions.ts`)

`generalSchema` suma:
```ts
  title: z.string().trim().max(20).optional().or(z.literal("")),
  licenseNumber: z.string().trim().max(40).optional().or(z.literal("")),
```
y el `update` suma `title: parsed.data.title || null` y `licenseNumber: parsed.data.licenseNumber
|| null`. Es el mismo `<form id="ajustes-generales">` compartido: los 4 paneles están montados
(`forceMount`), así que los campos nuevos siempre viajan.

### 5.5 PDF (`apps/web/src/lib/`)

- **`pdf-common.tsx` (nuevo, sin `"server-only"`; lo importan solo módulos de servidor):**
  - se extrae de `plan-pdf.tsx`, sin cambiar valores: `FONT_FAMILY` (la registración de Inter y
    el fallback a Helvetica se hacen **una sola vez**, acá), `Font.registerHyphenationCallback` y
    `pdfLogoSrc(logo)`;
  - `buildCommonStyles(accent)`, con `page`, `content` (y el comentario del bug de `lineHeight`),
    `header*`, `logo`, `title`, `subtitle`, `brand*`, `accentRule`, `footer`, `footerText` y
    `sectionHeader`/`sectionMark`/`sectionTitle` (iguales a `mealHeader`/`mealMark`/`mealTitle`);
  - `<PdfHeader logoSrc title subtitle brandName styles />`;
  - `<PdfFooter text pageLabel styles pageWidth />`, donde `pageLabel` es `(n, total) => string`.
  - **`plan-pdf.tsx`** lo usa y conserva su `import "server-only"`, su pie `${n} / ${total}` de
    ancho 40 y los mismos estilos. **El PDF del plan tiene que verse idéntico** (sección 11).
- **`pdf-theme.ts` (aditivo):**
  ```ts
  /** Informe antropométrico (HU-007). Luminancias distintas: se distinguen impresos en gris. */
  export const reportTissueColors = { adipose: "#EBC77A", muscle: "#2F5D43", bone: "#A3A19B", residual: "#7C69A8" } as const;
  /** Texto dentro de cada segmento (contraste). */
  export const reportTissueTextColors = { adipose: "#37352F", muscle: "#FFFFFF", bone: "#37352F", residual: "#FFFFFF" } as const;
  /** Serie "Anterior" (barras y punto de la somatocarta). La serie "Actual" usa el acento de /ajustes. */
  export const reportPreviousColor = "#B8B6B0";
  /** Zonas adiposas de la silueta (claro → oscuro). */
  export const reportZoneColors = { upper: "#F1E3C2", central: "#E3C27F", lower: "#C9A55A" } as const;
  export const reportGridColor = pdfColors.border;
  ```
  Luminancias relativas: 0,599 / 0,088 / 0,356 / 0,172.
- **`report-pdf-charts.tsx` (nuevo):** `SvgText` es un wrapper tipado sobre el `Text` de react-pdf
  para usar dentro de `Svg`:
  ```ts
  type SvgTextProps = { x: number; y: number; textAnchor?: "start" | "middle" | "end"; fill?: string; style?: Style; children: string };
  export const SvgText = Text as unknown as ComponentType<SvgTextProps>;
  ```
  Los gráficos:
  - `GirthBarsChart({ layout, accent, legend })`: `Rect`, `Line` (eje), `SvgText` y una leyenda
    con `View`.
  - `BodyFigure({ adipose, muscle, labels })`: `Circle` y `Rect` redondeados con
    `REPORT_BODY_FIGURE`, `Line` de guía y `SvgText` con los %. A la izquierda va "Tejido
    adiposo" con superior, central e inferior; a la derecha, "Tejido muscular" con brazo, muslo y
    pierna.
  - `CompositionBarsChart({ layout })`: `Rect` y `SvgText`, con una leyenda de 4 colores.
  - `SomatochartPdf({ layout, accent, legend, missingNote })`: grilla con `Line` y
    `strokeDasharray`, el contorno con `Path`, los ejes con `Line`, los rótulos y los puntos con
    `Circle` (actual en el acento, r 4; anterior en `reportPreviousColor`, r 3,5) y una leyenda.
    Si falta el punto actual, se dibuja la carta sin ese punto y abajo va `missingNote`.
  - Todo sale del layout de `packages/core`. Acá no se hace ninguna cuenta de geometría.
- **`anthropometric-report-pdf.tsx` (nuevo, sin `"server-only"`):**
  ```ts
  export interface ReportPdfInput {
    model: IsakReportModel;
    texts: IsakReportTexts;              // los guardados
    professionalName: string;
    signature: string;                   // professionalSignature(...)
    logo: { data: Buffer; mimeType: string } | null;
    accentColor: string | null;
  }
  export async function renderAnthropometricReportPdf(input: ReportPdfInput): Promise<Buffer>;
  ```
  - A4 vertical, `Document title="Informe antropométrico" author={professionalName}`.
  - `PdfHeader` solo en la primera página: título, `subtitle = model.subtitle` y la marca
    `professionalName`/"NutriBot".
  - `PdfFooter fixed`: `signature` a la izquierda y `` `Página ${n} de ${total}` `` a la derecha
    (ancho 90).
  - Secciones en el orden de la HU:
    - cada una es un `View` con `wrap={false}` que contiene el título con `sectionMark`, los
      textos fijos, las filas y el gráfico;
    - el párrafo interpretativo va **después**, en un `Text` que puede partirse
      (`orphans={2} widows={2}`), y solo si `texts[key].trim() !== ""`;
    - en "Indicadores de salud", cada indicador es un bloque `wrap={false}` con el valor, la
      categoría y la variación, y debajo su comentario.
  - **Filas:** en dos columnas si `hasPrevious` (`columns.previous` | `columns.current`), con
    líneas `` `${label}: ${previous}` `` y `` `${label}: ${current}${change ? ` (${change})` : ""}` ``.
    Sin anterior, una sola columna.
  - **Distribución:** `GirthBarsChart` (ancho ≈ 300) a la izquierda y `BodyFigure` (≈ 190) a la
    derecha.
  - **Composición:** `CompositionBarsChart` (ancho completo) y debajo la lista `Componente |
    Anterior | Actual`.
  - **Somatotipo:** `components`, `category` y `SomatochartPdf` (ancho ≈ 260, centrada).
  - **Menores:** `measurements.minorNote` al principio de "Mediciones" y sin "Composición
    corporal" (el `model` ya la trae `null`).

### 5.6 API

No hay endpoints JSON nuevos. Solo el route handler del PDF (5.1).

---

## 6. Mensajes del bot

No cambia ningún texto ni estado de la conversación (D6). El envío va por la cola:

| Kind | `body` (queda registrado; no se envía, D7) | Documento |
|---|---|---|
| `ANTHROPOMETRIC_REPORT_PDF` | `📄 Te comparto tu informe antropométrico del 08/05/2026. Cualquier duda lo charlamos en la próxima consulta.` (`ISAK_REPORT_TEXT.whatsappCaption(fecha de la consulta)`) | `AnthropometricReport.pdfData`, con el nombre `informe-antropometrico-2026-05-08.pdf` |

Aparece solo cuando la profesional toca "Enviar por WhatsApp" en la página del informe. No
depende de ninguna sesión del paciente ni la abre.

---

## 7. UI (skill `ui`): vistas, estructura y componentes

Sistema actual: `Card`, `PageHeader`, `Alert`, `Badge`, `Button`, `ButtonLink`, `Textarea`,
`FormError`, `Table` (primitives), `useConfirm`, `notify` y los íconos de `lucide-react`. Sin
colores ni tokens nuevos en el panel.

### 7.1 Vista "Informe antropométrico" (nueva): `…/antropometria/informe/page.tsx` (server) + `report-editor.tsx` (cliente)

- **Estructura:**
  - Link de volver: lo dibuja el cliente (`GuardedBackLink`), con las mismas clases que el
    `back` de `PageHeader`, apunta al estudio y dice `ISAK_REPORT_TEXT.backToStudy`.
  - `PageHeader` sin `back`, con `title = "Informe antropométrico"` y `description =
    model.subtitle`.
  - Columna única de `Card` en el orden del PDF y barra de acciones al final.
- **Avisos** (una pila de `Alert` arriba, en este orden):
  1. `info`: `reviewNotice` (siempre).
  2. `warning`: `stalePdf` si `ctx.stale`.
  3. `warning`: `missingDataNotice` + `ButtonLink` secundario sm `editStudy` →
     `${consultationHref}?isak=editar#antropometria-isak`, si `model.hasMissingData`.
  4. `warning`: `licenseMissing` + `ButtonLink` secundario sm `goToSettings` →
     `/ajustes?tab=pdf`, si `!pro.licenseNumber`.
  5. `info`: `ISAK_TEXT.minorWarning` si `model.minor`.
- **Cards** (título = `ISAK_REPORT_TEXT.sections.*`):
  1. **Datos personales:** `dl` con nombre, edad y fecha.
  2. **Mediciones antropométricas:** `ReportRowsTable` (peso, talla, IMC).
  3. **Pliegues cutáneos:** intro en `text-sm text-muted-foreground`, `ReportRowsTable` (6 filas y
     la sumatoria en negrita) y el subtítulo "Otros pliegues" con su tabla.
  4. **Perímetros y perímetros corregidos:** 3 bloques (intro + tabla) y `ReportTextField girths`.
  5. **Distribución adiposo-muscular:** `ReportRowsTable` con las 6 barras (valores
     anterior/actual), dos `dl` (adiposa y muscular, en %) y `ReportTextField distribution`.
  6. **Indicadores de salud:** por indicador, una fila con el nombre, el valor, un `Badge` neutral
     con la categoría (si hay) y la variación en `text-xs text-muted-foreground`; debajo,
     `ReportTextField <key>`.
  7. **Composición corporal** (si `model.composition`): intro, `methods` y una tabla `Componente |
     Anterior | Actual`.
  8. **Somatotipo:** intro, `components`, `category` y `missingNote` si hay; después,
     `ReportTextField somatotype`. Sin vista previa del gráfico (Fuera de alcance).
  9. **Conclusiones:** `ReportTextField conclusions`, con la marca de obligatorio y el `FormError`
     en línea (`fieldErrors.conclusions`).
- **`ReportRowsTable`:**
  - con anterior, las columnas son `Medida | Anterior (dd/MM/yyyy) | Actual (dd/MM/yyyy) | Dif.`;
    sin anterior, `Medida | Actual`;
  - las celdas numéricas usan `numeric`; "Sin dato" va en `text-muted-foreground`.
- **`ReportTextField`:**
  - `Field` con `label = textLabels[key]` y un `Textarea` controlado (`rows` 4; conclusiones, 8);
  - arriba a la derecha, un `Badge` neutral con `draftBadge` si `text === drafts[key]` y
    `editedBadge` si no;
  - el `Button variant="link" size="sm"` `resetDraft` aparece solo si `text !== drafts[key]`. Al
    tocarlo: `await confirm({ title: resetDraftTitle, description: resetDraftDescription,
    confirmLabel: resetDraft })`, y si confirma, `setText(key, drafts[key])`. Las demás secciones
    no cambian.
- **Barra de acciones** (`Card` al final, `flex flex-wrap gap-2`):
  - `Button secondary` `saveTexts` (`savingTexts` mientras corre): llama a
    `saveIsakReportTextsAction`. Si sale bien: `notify.saved(textsSaved)` y el snapshot guardado
    pasa a ser el actual.
  - `Button primary` `generate` (`generating`), con ícono `FileDown`: llama a
    `generateIsakReportPdfAction`. Si sale bien: `notify.saved(generated)` y actualiza el
    snapshot.
  - `ButtonLink secondary` `download`: solo si hay PDF; `href = reportHref + "/pdf"`,
    `target="_blank"`, `rel="noopener"` y `prefetch={false}`.
  - `Button secondary` `send` (`sending`), con ícono `Send`. Primero `await confirm({ title:
    sendConfirmTitle(phone), description: sendConfirmDescription, confirmLabel: sendConfirmLabel,
    destructive: false })` y después `startTransition` → `sendIsakReportWhatsAppAction`. Si sale
    bien: `notify.info(queued(phone))` y actualiza el snapshot.
  - Debajo, en `text-xs text-muted-foreground`, `lastPdf(formatDateTime(pdfGeneratedAt, tz))` o
    `noPdf`.
  - El `FormError` general va con el `error` de la última action.
  - Un solo `useTransition` y un `running: "save" | "generate" | "send" | null`, como
    `PlanPdfActions`. Todos los botones se deshabilitan mientras hay una en curso.
- **Estado del cliente:**
  - `const [texts, setTexts] = useState(initialTexts)` y `const [saved, setSaved] =
    useState(initialTexts)`, con `dirty = ISAK_REPORT_TEXT_KEYS.some(k => texts[k] !== saved[k])`.
  - Los props que cambian al revalidar (`lastPdfLabel`, `hasPdf`, `stale`, `hasMissingData`) se
    leen **siempre de props**.
  - **El componente no lleva `key`**, y ningún padre le pone una que dependa de datos guardados:
    así, al revalidar se conserva el estado (lección de la HU-006).
- **Cambios sin guardar:** `useUnsavedChangesGuard(dirty, { title: discardTitle, description:
  discardDescription, confirmLabel: discardLabel })` (7.6). El `GuardedBackLink` pasa por el
  mismo guard.
- **Props del editor** (serializables): `patientId`, `consultationId`, `model`, `drafts`,
  `initialTexts`, `phone` (`patient.phone`), `hasPdf`, `lastPdfLabel`, `reportHref`, `studyHref`.
- `loading.tsx`: el mismo patrón que el `loading.tsx` del estudio (encabezado y 4 `CardSkeleton`).

### 7.2 Vista "Estudio antropométrico ISAK" (cambia, `…/antropometria/page.tsx`)

- `PageHeader.action` suma, **antes** de "Editar", `ButtonLink variant="secondary" size="sm"`
  con el ícono `FileText` y `ISAK_TEXT.reportButton`, que lleva a `…/antropometria/informe`.
- `DeleteIsakStudyButton` recibe `hasReport` (desde `getAnthropometricReportMeta(entry.id) !==
  null`).

### 7.3 Vista "Tarjeta Antropometría ISAK" (cambia, `isak-card.tsx`)

- `study` suma `report: { generatedAtLabel: string | null; exists: boolean }`, que calcula la
  página de la consulta con `getAnthropometricReportMeta(isakEntry.id)` y
  `formatDateTime(pdfGeneratedAt, tz)`.
- En el modo resumen, junto a "Ver estudio completo", va `ButtonLink variant="secondary"` con el
  ícono `FileText` y `ISAK_TEXT.reportButton`, que lleva al informe. Si `generatedAtLabel`,
  debajo va `<p className="text-xs text-muted-foreground">{cardGenerated(label)}</p>`.
- Sin estudio, el botón no aparece (el estado vacío no cambia).
- Pasa `hasReport={study.report.exists}` al botón de borrar.
- **Sin `key` nuevas.**

### 7.4 `DeleteIsakStudyButton` (cambia)

Prop nueva `hasReport?: boolean`. La descripción del confirm es
`ISAK_TEXT.deleteWithReportDescription` si `hasReport`, y si no, `ISAK_TEXT.deleteDescription`.
El título queda igual. El `confirm` sigue en el handler, fuera de la transición.

### 7.5 Vista "Ajustes": pestaña PDF (cambia)

- `AJUSTES_TABS`: la etiqueta de `pdf` pasa de "PDF del plan" a **"PDF"** (el valor `pdf` y el
  ícono no cambian).
- `SettingsDefaults` suma `title: string` y `licenseNumber: string`, y `page.tsx` los llena con
  `pro.title ?? ""` y `pro.licenseNumber ?? ""`.
- **Card nueva, primera del panel:** "Firma de los informes", con la descripción "Tu título y
  matrícula aparecen al pie del informe antropométrico." y el componente
  `SettingsSignatureFields`:
  - grilla `sm:grid-cols-2`;
  - `Field "Título"` con `Input name="title" form={SETTINGS_FORM_ID} maxLength={20}
    placeholder="Lic."`, hint `Va antes de tu nombre. Ej: "Lic."`;
  - `Field "Matrícula"` con `Input name="licenseNumber" form={SETTINGS_FORM_ID} maxLength={40}
    placeholder="M.P. 852"`;
  - una línea `text-xs text-muted-foreground` con `Pie del informe: ${professionalSignature({
    title, name: pro.name, licenseNumber })}`, con los valores **guardados** (se pasa `name` y el
    texto armado desde el server);
  - `SettingsSubmit`.
- La card "Estilo del PDF" cambia la descripción a "Color y pie de página del PDF del plan." (sin
  cambios) y el hint del color, a "Se usa en los títulos, separadores y gráficos de los PDFs".

### 7.6 Hook `apps/web/src/lib/use-unsaved-changes-guard.ts` (nuevo, cliente)

```ts
export function useUnsavedChangesGuard(
  dirty: boolean,
  confirmOptions: { title: string; description: string; confirmLabel: string },
): { guardNavigation: (href: string) => Promise<void> };
```
- Mientras `dirty`, agrega un `beforeunload` (con `preventDefault` y `returnValue = ""`). Cubre
  cerrar la pestaña y recargar; el texto lo pone el navegador.
- Mientras `dirty`, agrega en `document` un listener de `click` en **captura**. Si el clic es en
  un `<a href>` interno (mismo origen, sin `target="_blank"`, sin `download`, sin teclas
  modificadoras, botón izquierdo) y la ruta es otra, hace `preventDefault()` +
  `stopPropagation()`, espera `confirm(confirmOptions)` y, si confirma, `router.push(href)`.
  Cubre el menú lateral, los breadcrumbs y los links de los avisos.
- `guardNavigation(href)` hace lo mismo para el `GuardedBackLink`.
- El botón "atrás" del navegador no se intercepta (limitación conocida; queda en 14).
- `confirm` nunca se llama dentro de una transición ni de un `<form action>`.

### 7.7 Detalle de la consulta (cambia, `consultas/[consultationId]/page.tsx`)

- `searchParams` suma `aviso?: string | string[]`. Si `aviso === "sin-isak"`, va un
  `<Alert tone="info" className="mb-6">{ISAK_REPORT_TEXT.noStudyNotice}</Alert>` antes de la
  grilla.
- Si hay `isakEntry`, `getAnthropometricReportMeta(isakEntry.id)` alimenta `study.report` (7.3).

---

## 8. Archivos

**Nuevos**
- `packages/core/src/isak-report.ts`, `packages/core/src/isak-report.test.ts`
- `packages/core/src/isak-report-charts.ts`, `packages/core/src/isak-report-charts.test.ts`
- `packages/db/prisma/migrations/<timestamp>_anthropometric_report/migration.sql`
- `packages/db/domain/anthropometricReports.ts`
- `packages/db/scripts/test-anthropometric-report.ts`
- `apps/bot/src/outbound-payload.ts`
- `apps/bot/scripts/test-report-outbox.ts`
- `apps/web/src/lib/pdf-common.tsx`
- `apps/web/src/lib/anthropometric-report-pdf.tsx`
- `apps/web/src/lib/report-pdf-charts.tsx`
- `apps/web/src/lib/anthropometric-report.ts`
- `apps/web/src/lib/use-unsaved-changes-guard.ts`
- `apps/web/src/app/(panel)/pacientes/[id]/report-actions.ts`
- `apps/web/src/app/(panel)/pacientes/[id]/consultas/[consultationId]/antropometria/informe/page.tsx`
- `…/antropometria/informe/loading.tsx`
- `…/antropometria/informe/report-editor.tsx`
- `…/antropometria/informe/pdf/route.ts`

**Cambian**
- `packages/core/src/isak-study.ts` (4.1) y `packages/core/src/index.ts`
- `packages/db/prisma/schema.prisma`, `packages/db/domain/index.ts` y `packages/db/package.json`
  (`"test:report": "dotenv -e ../../.env -- tsx scripts/test-anthropometric-report.ts"`)
- `apps/bot/src/workers.ts` y `apps/bot/package.json`
  (`"test:report-outbox": "dotenv -e ../../.env -- tsx scripts/test-report-outbox.ts"`)
- `apps/web/src/lib/plan-pdf.tsx` y `apps/web/src/lib/pdf-theme.ts`
- `…/consultas/[consultationId]/page.tsx`, `isak-card.tsx`, `delete-isak-study-button.tsx` y
  `antropometria/page.tsx`
- `apps/web/src/app/(panel)/ajustes/actions.ts`, `settings-form.tsx`, `page.tsx` y
  `ajustes-tabs.tsx`

**No se tocan:** `apps/bot/src/conversation.ts`, `apps/bot/src/whatsapp.ts`, `(portal)/*`,
`tailwind.config.ts`, `packages/db/domain/isak.ts` (la cascada es de la FK) y
`docs/EJEMPLO DE INFORME ANTROPOMETRICO.pdf`.

---

## 9. Checklist atómico

### packages/core
- [ ] `isak-study.ts`: exportar `SOMATOTYPE_MEASURE_KEYS` y usarlo en `buildIsakStudy`; sumar
      `deleteWithReportDescription` y `reportButton` a `ISAK_TEXT`. `npm run test` sigue en verde.
- [ ] `isak-report.ts`: tipos (4.2.1) e `ISAK_REPORT_TEXT` (4.2.2), con los textos exactos.
- [ ] Helpers internos: `cell`, `rowOf`, `joinEs`, `capitalize`, `lowerFirst` y `trend`.
- [ ] `variationLine`, `professionalSignature` e `isakReportFileName`.
- [ ] `buildIsakReportModel` (reglas de 4.2.3), incluidos el ICC del menor, `hasMissingData`,
      `missingNote` y `textKeys`.
- [ ] `buildIsakReportDrafts` (plantillas de 4.2.4) y `resolveIsakReportTexts`.
- [ ] `isakReportSourceKey` (FNV-1a 32 sobre el JSON canónico).
- [ ] `isak-report-charts.ts`: `buildGirthBarsLayout`, `SOMATOCHART_ARC_MIDPOINTS`,
      `buildSomatochartLayout`, `REPORT_BODY_FIGURE` y `buildCompositionBarsLayout`.
- [ ] Exports en `index.ts`.
- [ ] Tests (sección 10) en verde.

### packages/db
- [ ] Respaldo `pg_dump` (3.3) y los conteos de antes en `progress/impl_HU-007.md`.
- [ ] `schema.prisma` (3.1).
- [ ] `migrate dev --create-only --name anthropometric_report`, revisar el SQL (3.2) y copiarlo en
      `progress/impl_HU-007.md`.
- [ ] `npm run db:migrate` y después `npm run db:generate`.
- [ ] `domain/anthropometricReports.ts` (4.4) y su export en `domain/index.ts`.
- [ ] `scripts/test-anthropometric-report.ts` (10.3) y su script `test:report`. Correrlo.

### apps/bot
- [ ] `src/outbound-payload.ts` (4.5).
- [ ] `workers.ts`: `OUTBOX_INCLUDE` + `resolveOutboundPayload`, sin otro cambio de
      comportamiento.
- [ ] `scripts/test-report-outbox.ts` (10.4) y su script `test:report-outbox`. Correrlo.
- [ ] `npm run test:confirm-flow --workspace apps/bot` sigue en OK.

### apps/web
- [ ] `pdf-common.tsx`, extraído de `plan-pdf.tsx`. Render del plan antes y después (11.2):
      tiene que salir idéntico.
- [ ] `pdf-theme.ts`: paleta del informe.
- [ ] `report-pdf-charts.tsx` (con `SvgText`) y `anthropometric-report-pdf.tsx`.
- [ ] Render de prueba del informe con los casos A y B, solo A, el menor y sin fémur (11.3).
      Mirar los PNG y ajustar la silueta y los rótulos.
- [ ] `lib/anthropometric-report.ts` (loader).
- [ ] `report-actions.ts` (5.3).
- [ ] `informe/pdf/route.ts`.
- [ ] `use-unsaved-changes-guard.ts`.
- [ ] `informe/page.tsx`, `loading.tsx` y `report-editor.tsx` (7.1).
- [ ] `antropometria/page.tsx`: botón "Informe PDF" y `hasReport`.
- [ ] `isak-card.tsx`, `delete-isak-study-button.tsx` y la página de la consulta (aviso
      `sin-isak` y `report`).
- [ ] `/ajustes`: schema, card "Firma de los informes", defaults y etiqueta de la pestaña.
- [ ] `npm run typecheck` (core, db, web **y** bot) limpio.

---

## 10. Tests

Fixtures: `CASE_A` y `CASE_B` de `isak-fixtures.test-data.ts`, solo con números. En los tests, A
es masculino de 22 años el 08/05/2026 y B, de 21 años el 05/11/2025. El nombre del paciente es
`"Paciente de prueba"`. En los tests de la firma la profesional es `"Ana Pérez"`: **no se usa**
ningún nombre del PDF de ejemplo.

### 10.1 `isak-report.test.ts`

Con `input AB = { patientName, current: {A, "08/05/2026", 22}, previous: {B, "05/11/2025", 21} }`:
- **Encabezado:**
  - `model.subtitle === "Consulta del 08/05/2026 · comparado con el estudio del 05/11/2025"`;
  - `columns = { previous: "Medición anterior (05/11/2025)", current: "Medición actual (08/05/2026)" }`;
  - `personal.age === "22 años"`.
- **Mediciones:**
  - peso: `{ previous: "67,6 kg", current: "61,0 kg", diff: "−6,6", change: "6,6 kg menos" }`;
  - talla: `current "164,0 cm"` y `change null`;
  - IMC: `previous "25,1 · Sobrepeso"` y `current "22,7 · Normal"`.
- **Pliegues:**
  - `sum6`: `previous "80,5 mm"`, `current "71,0 mm"`, `change "9,5 mm menos"`;
  - bíceps: `"4,0 mm"` / `"4,0 mm"` y `change null`;
  - cresta ilíaca: `"30,0 mm"` / `"19,0 mm"`.
- **Perímetros corregidos:** brazo `"28,53 cm"` → `"26,74 cm"`, muslo `"51,49 cm"` → `"48,54 cm"`,
  pierna `"31,80 cm"` → `"32,62 cm"` con `change "0,82 cm más"`.
- **Distribución:** 6 barras en el orden de la HU; `bars[0] = { previous: 32.3, current: 30.2,
  decimals: 1 }`. Adiposa: `"30,99 %"`, `"45,07 %"`, `"23,94 %"`. Muscular: `"24,79 %"`,
  `"44,99 %"`, `"30,23 %"`.
- **Salud:**
  - IAM `value "0,57"`, `category null`, `variation "Bajó de 0,59 a 0,57 (−0,02)"`;
  - IMO `"2,80"`, `"Medio"`, `"Bajó de 2,99 a 2,80 (−0,19)"`;
  - ICC `"0,83"`, `"Sin riesgo aumentado"`, `"Bajó de 0,87 a 0,83 (−0,04)"`.
- **Composición:** adiposo `"26,57 % (17,96 kg)"` → `"27,02 % (16,48 kg)"`, residual
  `"13,68 % (9,25 kg)"` → `"8,54 % (5,21 kg)"`, `methods` exacto y `bars.current.muscle === 47.49`.
- **Somatotipo:**
  - `components === "Endomorfia 4,95 → 4,03 · Mesomorfia 5,72 → 5,69 · Ectomorfia 1,01 → 1,92"`;
  - `category "Endo-mesomorfo"`;
  - `chart.current {x:-2.12, y:5.43}` y `chart.previous {x:-3.94, y:5.48}`.
- **Resto:** `hasMissingData === false` y `textKeys.length === 7`.
- **Borradores AB** (cadenas exactas de 4.2.4):
  - `girths`: `"Respecto de la evaluación anterior, el brazo corregido bajó 1,79 cm, el muslo
    corregido bajó 2,95 cm y la pierna corregida subió 0,82 cm. La cintura bajó 9,1 cm y la
    cadera bajó 6,0 cm."` (sin O3 porque es mixto).
  - `distribution`: `"Respecto de la distribución de la grasa corporal, predomina la zona central
    (45,07 %). En cuanto a la masa muscular, se concentra principalmente en el muslo (44,99 %).
    Frente a la evaluación anterior, la proporción de grasa de la zona inferior pasó de 18,63 % a
    23,94 %."`
  - `adiposeMuscle`: `"Se mantiene estable la relación entre el tejido adiposo y la masa
    muscular."` (−0,02 está dentro del umbral).
  - `muscleBone`: `"Muestra una disminución de la masa muscular en relación con la masa ósea."`
  - `waistHip`: `"El resultado indica que la distribución de la grasa corporal no representa un
    factor de riesgo cardiometabólico aumentado."`
  - `somatotype`: `"El análisis del somatotipo evidencia un perfil endo-mesomorfo. Predomina la
    mesomorfia (desarrollo músculo-esquelético relativo). Respecto de la evaluación anterior, se
    mantiene la categoría; la endomorfia bajó 0,92 y la ectomorfia subió 0,91."`
  - `conclusions`: `"En comparación con la evaluación del 05/11/2025, el peso bajó 6,6 kg y la
    sumatoria de 6 pliegues bajó 9,5 mm. El tejido muscular pasó de 44,76 % a 47,49 % y el tejido
    adiposo pasó de 26,57 % a 27,02 %. Se sugiere continuar con controles periódicos para
    monitorear la evolución."`
- **Sin anterior** (solo A):
  - `subtitle` `"… · primer estudio, sin comparación"`, `columns.previous null`, todas las
    `previous`, `diff`, `change` y `variation` en `null`;
  - `chart.previous null`, `composition.bars.previous null`;
  - ningún borrador contiene `"anterior"` ni `"pasó de"`;
  - `conclusions` empieza con `"En esta primera evaluación, el peso es de 61,0 kg y la sumatoria
    de 6 pliegues es de 71,0 mm."`;
  - `muscleBone === "Se ubica en la categoría medio de la relación entre masa muscular y masa ósea."`.
- **Sin fémur** (A con `femurBreadthCm: null`):
  - óseo y residual `"Sin dato"`, IMO `value "Sin dato"` con `variation null`, `components`
    contiene `"Mesomorfia 5,72 → Sin dato"`;
  - `category "Sin dato"`, `chart.current null`, `missingNote === "Somatotipo sin dato (falta
    fémur)"`, `hasMissingData === true`;
  - el borrador `somatotype` es `""`.
- **Menor** (A a los 12 años, con B a los 11):
  - `minor true`, `measurements.minorNote === "Las fórmulas de composición corporal son para
    adultos."`, `composition null`;
  - en salud solo el ICC, con `{ value "0,83", category null }`; `bmi.current "22,7"`;
  - `textKeys` sin `adiposeMuscle` ni `muscleBone`; esos borradores dan `""`;
  - `conclusions` sin la oración de tejidos.
- **`variationLine`:** `(2.95, 2.80)` → `"Subió de 2,80 a 2,95 (+0,15)"`; iguales → `"Se mantuvo
  en 0,83"`; previous `null` → `null`.
- **`professionalSignature`:**
  - `{ "Lic.", "Ana Pérez", "M.P. 123" }` → `"Lic. Ana Pérez · M.P. 123"`;
  - sin nada → `"Ana Pérez"`;
  - sin título → `"Ana Pérez · M.P. 123"`;
  - con espacios → se hace trim.
- **`isakReportFileName("2026-05-08")`** → `"informe-antropometrico-2026-05-08.pdf"`.
- **`isakReportSourceKey`:**
  - mismo input → misma clave (8 caracteres hex);
  - cambia con: el tríceps del anterior, el sexo, la edad, `previous: null` o el `entryId`
    actual.
- **`resolveIsakReportTexts`:** `null` → borrador; `""` → `""` (se respeta); `"x"` → `"x"`.

### 10.2 `isak-report-charts.test.ts`

- **`buildGirthBarsLayout`** (barras AB, `width 300`, `hasPrevious true`):
  - `axisMax 60`, 7 ticks (`"0"` a `"60"`), 6 grupos de 2 barras;
  - la barra actual del muslo medio (52,0) tiene `width ≈ 52/60 × 174` (±0,01) y `x === 96`;
  - `valueLabel` `"52,0"`; corregido `"48,54"`.
  - Sin anterior: 1 barra por grupo. Un `null` da `width 0` y `"Sin dato"`.
- **`SOMATOCHART_ARC_MIDPOINTS`:** ≈ (4,392; 4,392), (0; −8,785) y (−4,392; 4,392), con una
  tolerancia de 0,001.
- **`buildSomatochartLayout({ width: 240, current: A, previous: B })`:**
  - `radius === 12 × 13.5` (`s = 216/16`);
  - `contourPath` empieza con `M ${px(−6)} ${py(−6)} A 162.00 162.00 0 0 1` y termina en `Z`;
  - los 3 ejes pasan por `px(0), py(0)` (colinealidad ±0,01);
  - `points.current` = `(px(−2.12), py(5.43))`.
  - Un punto fuera del dominio (x 9) amplía `gridX` hasta 10.
  - **Equilátero:** la distancia en puntos entre los 3 vértices es igual (±0,01).
- **`REPORT_BODY_FIGURE`:** cada zona tiene al menos una parte y todas las partes quedan dentro
  del `viewBox`.
- **`buildCompositionBarsLayout`** (AB, `width 500`):
  - 2 filas (anterior primero), 4 segmentos cada una;
  - la suma de anchos = `500 − 110` (±0,01);
  - un segmento de menos de 30 pt tiene `label null`;
  - `previous null` con `hasPrevious true` da `segments null`.

### 10.3 Prueba contra la base: `packages/db/scripts/test-anthropometric-report.ts`

Sigue el patrón de `test-isak.ts`: crea sus propios datos (paciente con jid
`test-hu007-${Date.now()}@test.invalid`, una consulta y un estudio ISAK con `createIsakStudy`),
guarda los ids y en `finally` borra **por id** (primero los mensajes y después el paciente, que
cae en cascada). Casos:
1. `getAnthropometricReportMeta` → `null`.
2. `saveAnthropometricReportTexts` con los 7 textos (uno `""`) crea el informe; el segundo save
   actualiza la misma fila (mismo `id`, sin duplicados) y `""` vuelve como `""`.
3. `saveAnthropometricReportPdf` con `Buffer.from("%PDF-test")` → `getAnthropometricReportPdf`
   devuelve los mismos bytes y el `fileName`; la meta tiene `pdfGeneratedAt` y `pdfSourceKey`.
4. `deleteIsakStudy` → el informe ya no existe (**cascada**) y el estudio tampoco.
5. No se encoló nada: `outboundMessage.count({ where: { toJid: jid } }) === 0`.

No llama a `enqueueAnthropometricReportMessage` fuera de una transacción (eso lo hace 10.4).

### 10.4 Prueba del envío sin WhatsApp: `apps/bot/scripts/test-report-outbox.ts`

**Todo pasa dentro de un `prisma.$transaction(async (tx) => { … })` que termina con `throw new
Rollback()` a propósito**: nada se confirma, así que el bot no puede ver la fila aunque estuviera
corriendo. No importa `src/whatsapp.ts` ni Baileys.
1. Con `tx`, crea el paciente (`test-hu007-outbox-…@test.invalid`), la consulta, la fila ISAK
   (con `tx.evolutionEntry.create`, `study: "ISAK"`) y un `AnthropometricReport` con `pdfData =
   Buffer.from("%PDF-1.4 prueba")` y `pdfFileName = "informe-antropometrico-2026-05-08.pdf"`.
2. `enqueueAnthropometricReportMessage({ reportId, toJid, caption:
   ISAK_REPORT_TEXT.whatsappCaption("08/05/2026") }, tx)` → `kind ANTHROPOMETRIC_REPORT_PDF`,
   `status PENDING` y `appointmentId null`.
3. `tx.outboundMessage.findUniqueOrThrow({ where: { id }, include: OUTBOX_INCLUDE })` →
   `resolveOutboundPayload` → `{ type: "document", fileName:
   "informe-antropometrico-2026-05-08.pdf" }` con los mismos bytes.
4. Una fila `PLAN_PDF` sin plan tira `"El plan no tiene PDF generado: …"` (el comportamiento
   actual se conserva). Un `AD_HOC` da `{ type: "text", body }`. Un informe sin `pdfData` tira
   `"El informe no tiene PDF generado: …"`.
5. `throw new Rollback()`. Afuera: se captura solo `Rollback` y se verifica con `prisma` (fuera de
   la transacción) que `outboundMessage.count({ where: { toJid } }) === 0` y que el paciente no
   existe. Imprime `OK`.

### 10.5 Tests que no cambian

`isak-study.test.ts`, `isak.test.ts`, `anthropometric-diagnosis.test.ts` y el resto de `packages/core`
tienen que seguir en verde sin tocarlos.

---

## 11. Verificación (el implementer la corre antes de declararse `done`)

### 11.1 Comandos (desde la raíz)

```bash
git branch --show-current                                                # hu-007-informe-antropometrico
ls -la "$SCRATCHPAD/nutribot-pre-hu007.dump"                             # existe y > 0
(cd packages/db && npx dotenv -e ../../.env -- prisma migrate status)    # up to date, 15 migraciones
cat packages/db/prisma/migrations/*_anthropometric_report/migration.sql | grep -Ei 'drop|alter column|rename|set not null'   # sin salida
npm run db:generate
npm run test                                                             # vitest core en verde
npm run typecheck                                                        # core, db, web y bot en verde
npm run test:isak --workspace packages/db                                # OK (HU-006 sigue bien)
npm run test:report --workspace packages/db                              # OK
npm run test:report-outbox --workspace apps/bot                          # OK (transacción revertida)
npm run test:confirm-flow --workspace apps/bot                           # OK
docker compose exec -T db psql -U nutri -d nutribot -c 'select count(*) from "EvolutionEntry";'      # igual que antes (15)
docker compose exec -T db psql -U nutri -d nutribot -c 'select count(*) from "Consultation";'        # igual que antes (18)
docker compose exec -T db psql -U nutri -d nutribot -c 'select count(*) from "OutboundMessage";'     # igual que antes (4)
docker compose exec -T db psql -U nutri -d nutribot -c 'select count(*) from "AnthropometricReport";' # 0
docker compose exec -T db psql -U nutri -d nutribot -c 'select id, name, title, "licenseNumber", "pdfAccentColor", "pdfFooterText" from "Professional";'  # igual que antes; title y licenseNumber null
git status --porcelain | grep -v '^??' | grep -i 'EJEMPLO'              # sin salida (no se tocó el PDF de ejemplo)
./ops/harness/verify.sh
```

Si el usuario cargó datos desde el 2026-09-24, se comparan los conteos con los anotados **antes**
de empezar.

### 11.2 El PDF del plan no cambia

En `apps/web/.tmp-pdf-test/`, una carpeta temporal que **se borra al terminar** (el mismo
precedente que la HU-002b):
- un script `tsx` renderiza el PDF del plan con un fixture en memoria (una copia de
  `plan-pdf.tsx` sin la línea `import "server-only"`);
- se renderiza **antes** de extraer `pdf-common.tsx` y **después**;
- se pasa a PNG con `pdftoppm -png -r 72` en el scratchpad;
- `pdftotext` tiene que dar lo mismo, y los PNG tienen que verse iguales (mirarlos con `Read`).

### 11.3 El PDF del informe

Con el mismo esquema temporal, se renderiza `renderAnthropometricReportPdf` (el módulo no
importa `server-only`), con el `model` y los `drafts` de `packages/core`, en 4 variantes: **AB**,
**solo A**, **menor** (A a los 12 años) y **sin fémur**. Todas llevan la firma `"Lic. Ana Pérez ·
M.P. 123"`, el acento `#3c7a24` y `logo null`. Además, una variante **AB sin acento ni
matrícula** (firma `"Ana Pérez"`).
- `pdftotext`: no aparece ningún número con punto decimal (`grep -E '[0-9]\.[0-9]'` sin salida).
  Aparecen `"Peso: 61,0 kg (6,6 kg menos)"`, `"Página 1 de"`, `"Lic. Ana Pérez · M.P. 123"` y
  `"Somatotipo sin dato (falta fémur)"` (en la variante sin fémur).
- `pdffonts`: Inter embebida.
- `pdftoppm -png -r 60` y **mirar cada página** con `Read`. Tiene que cumplirse:
  - ningún gráfico ni tabla cortado entre páginas;
  - el contorno curvo de la somatocarta, que bulge hacia afuera como en el informe de Canva;
  - los ejes que pasan por el origen, los rótulos Mesomorfia, Endomorfia y Ectomorfia, el punto
    actual en el acento y el anterior en gris, con leyenda;
  - las barras de perímetros agrupadas, con valores y eje cada 10;
  - las barras apiladas con los 4 tonos distinguibles;
  - la silueta con los % a los costados;
  - el pie en todas las páginas.
- Copiar a `progress/impl_HU-007.md` el número de páginas de cada variante y una descripción
  corta de lo que se vio (**sin** adjuntar el PDF ni datos reales).
- Borrar `apps/web/.tmp-pdf-test/` y verificar que `git status` no lo muestre.

En `progress/impl_HU-007.md`: el SQL de la migración, las salidas resumidas y el aviso
"**Cambió el schema: hay que reiniciar el `next dev` del usuario**".

**Prohibido en esta HU:**
- `next build` y levantar otro `next dev`;
- `prisma migrate reset`, aceptar el reset por drift, `prisma db push` y editar una migración
  aplicada;
- `db:seed` / `seed:demo`;
- escribir en la base fuera de la migración, de `test-anthropometric-report.ts` (datos propios
  borrados por id) y de `test-report-outbox.ts` (transacción revertida);
- encolar un `OutboundMessage` confirmado;
- cargar datos desde la UI y guardar `/ajustes`;
- copiar datos de `docs/EJEMPLO DE INFORME ANTROPOMETRICO.pdf` a código, tests o `progress/*`;
- commitear y tocar `backlog.json`.

---

## 12. Recorrido en el navegador (lo hace el orquestador, en `localhost:3000`)

**Antes:** reiniciar el `next dev` del usuario (cambió el cliente de Prisma). Confirmar que el bot
**no** está corriendo (`pgrep -fl "apps/bot"` sin salida) y que `select connected from
"BotStatus"` da `false` o no hay fila.

### 12.1 Datos de prueba propios (SQL, ids fijos, sin teléfono real)

```sql
insert into "Patient"(id,"whatsappJid",phone,name,"birthDate",sex,"updatedAt")
values ('hu007_walk_p','hu007-walk@test.invalid','000','Prueba HU-007 Informe','2004-01-15','MALE',now());
insert into "Consultation"(id,"patientId","consultedAt","updatedAt") values
 ('hu007_walk_cb','hu007_walk_p','2025-11-05 15:00:00+00',now()),
 ('hu007_walk_ca','hu007_walk_p','2026-05-08 15:00:00+00',now());
insert into "EvolutionEntry"(id,"patientId","recordedAt","consultationId",study,"weightKg","heightCm","sittingHeightCm","armSpanCm",
 "tricepsSkinfoldMm","subscapularSkinfoldMm","bicepsSkinfoldMm","iliacCrestSkinfoldMm","supraspinaleSkinfoldMm","abdominalSkinfoldMm",
 "thighSkinfoldMm","calfSkinfoldMm","armCm","armFlexedCm","waistCm","hipCm","thighCm","calfCm","humerusBreadthCm","bistyloidBreadthCm","femurBreadthCm") values
 ('hu007_walk_eb','hu007_walk_p','2025-11-05 15:00:00+00','hu007_walk_cb','ISAK',67.6,164,83,166.7,12,14,4,30,21.5,18,8,7,32.3,33.1,82.1,94,54,34,6.5,5.3,9.6),
 ('hu007_walk_ea','hu007_walk_p','2026-05-08 15:00:00+00','hu007_walk_ca','ISAK',61,164,83,166.7,11,11,4,19,16,16,11,6,30.2,32,73,88,52,34.5,6.5,5.4,9.7);
```
(Con esa fecha de nacimiento tiene 21 años en B y 22 en A.)

### 12.2 Recorrido

1. **Consulta del 08/05/2026** (`/pacientes/hu007_walk_p/consultas/hu007_walk_ca`):
   - la tarjeta "Antropometría ISAK" tiene "Ver estudio completo", **"Informe PDF"**, "Editar" y
     "Borrar estudio";
   - todavía no dice "Informe generado el…".
2. **"Informe PDF":**
   - título "Informe antropométrico" y subtítulo "Consulta del 08/05/2026 · comparado con el
     estudio del 05/11/2025";
   - `Alert` "Revisá y editá los textos antes de generar el PDF." y, si la matrícula real está
     vacía, el aviso de matrícula con "Ir a Ajustes";
   - no aparecen los avisos de faltantes ni de PDF desactualizado.
3. **Cards en orden:**
   - Mediciones: peso 67,6 / 61,0 / −6,6, IMC "25,1 · Sobrepeso" / "22,7 · Normal";
   - Pliegues: Σ6 80,5 / 71,0;
   - Perímetros: corregidos 28,53 / 26,74, 51,49 / 48,54, 31,80 / 32,62;
   - Distribución: 30,99 / 45,07 / 23,94 y 24,79 / 44,99 / 30,23;
   - Salud: "Bajó de 0,59 a 0,57 (−0,02)", 2,80 "Medio" y "Bajó de 2,99 a 2,80 (−0,19)", 0,83
     "Sin riesgo aumentado" y "Bajó de 0,87 a 0,83 (−0,04)";
   - Composición: 26,57 % (17,96 kg) → 27,02 % (16,48 kg);
   - Somatotipo: "Endomorfia 4,95 → 4,03 · …" y "Endo-mesomorfo".
   - Cada textarea tiene el borrador de 10.1 y la marca "Borrador automático".
4. **Editar el texto de "Somatotipo":**
   - la marca pasa a "Editado" y aparece "Volver al borrador";
   - al hacer clic en "Volver a la consulta" (menú o link) aparece "¿Descartar los cambios de los
     textos?": **cancelar**;
   - "Guardar textos" → toast "Textos del informe guardados";
   - al recargar, se ve el texto editado.
5. **Editar "Perímetros" y "Volver al borrador":**
   - aparece el confirm "¿Reemplazar tu texto por el borrador automático?" → confirmar;
   - vuelve el borrador y "Somatotipo" sigue editado.
6. **Vaciar "Conclusiones" y "Generar PDF":** aparece el error en línea "Escribí las conclusiones
   antes de generar el informe" y **no** aparece "Último PDF".
7. **Escribir las conclusiones y "Generar PDF":**
   - "Generando…" → toast "Informe generado" → "Último PDF: <fecha y hora>" y el botón
     "Descargar";
   - "Descargar" abre el PDF en otra pestaña. Revisar las secciones, los 4 gráficos, "Edad: 22
     años", las columnas "Medición anterior (05/11/2025)" y "Medición actual (08/05/2026)",
     "Peso: 61,0 kg (6,6 kg menos)", la coma decimal y el pie "<firma> · Página n de N".
8. **Consulta:** la tarjeta dice "Informe generado el …".
9. **PDF desactualizado:**
   - `update "EvolutionEntry" set "tricepsSkinfoldMm"=13 where id='hu007_walk_eb';` (cambia el
     **anterior**) → al recargar el informe aparece "El estudio cambió después de generar este
     PDF…" y los textos guardados se conservan;
   - restaurar con `update "EvolutionEntry" set "tricepsSkinfoldMm"=12 where id='hu007_walk_eb';`
     → al recargar, el aviso desaparece (la huella vuelve a coincidir).
10. **"Enviar por WhatsApp"** → "¿Enviar el informe a 000?" → confirmar → toast "Encolado para
    enviar por WhatsApp a 000.". **Enseguida:**
    `select id, kind, status, "anthropometricReportId" from "OutboundMessage" where "toJid"='hu007-walk@test.invalid';`
    tiene que dar 1 fila `ANTHROPOMETRIC_REPORT_PDF` `PENDING`, que se borra **por ese id**:
    `delete from "OutboundMessage" where id='<id>';`. Si el bot no corre, nadie la despacha.
11. **Primer estudio:** el informe de la consulta del 05/11/2025
    (`…/consultas/hu007_walk_cb/antropometria/informe`):
    - subtítulo "Consulta del 05/11/2025 · primer estudio, sin comparación";
    - tablas sin "Anterior" ni "Dif.";
    - las conclusiones empiezan con "En esta primera evaluación".
12. **Faltantes:** `update "EvolutionEntry" set "femurBreadthCm"=null where id='hu007_walk_ea';` →
    en el informe del 08/05 aparece "Faltan datos en el estudio…" con "Editar estudio"; óseo,
    residual, IMO y mesomorfia dicen "Sin dato". Restaurar el valor con `9.7`.
13. **Menor:** `update "Patient" set "birthDate"='2013-06-01' where id='hu007_walk_p';` → aviso
    de adultos, sin "Composición corporal" ni IAM/IMO, IMC "22,7" sin clasificación y el ICC
    0,83 sin categoría. Restaurar `2004-01-15`.
14. **Sin estudio:** crear una consulta propia sin ISAK
    (`insert into "Consultation"(id,"patientId","consultedAt","updatedAt") values
    ('hu007_walk_cc','hu007_walk_p','2026-06-01 15:00:00+00',now());`) → la tarjeta no tiene
    "Informe PDF". Al entrar por URL a `…/consultas/hu007_walk_cc/antropometria/informe`,
    redirige a la consulta con "Primero cargá el estudio ISAK de esta consulta.".
15. **Borrar el estudio:** en la consulta del 08/05, "Borrar estudio" → el confirm dice "¿Borrar
    el estudio ISAK de esta consulta? También se borra su informe. No se puede deshacer." →
    confirmar → `select count(*) from "AnthropometricReport" where "isakEntryId"='hu007_walk_ea';`
    da 0.
16. **`/ajustes?tab=pdf`:**
    - la pestaña se llama "PDF" y está la card "Firma de los informes" con "Título" y
      "Matrícula" (vacíos si el usuario no los cargó) y la línea "Pie del informe: <nombre>";
    - **no guardar** salvo que el usuario lo autorice. Si lo autoriza: "Lic." + "M.P. 852" →
      "Ajustes guardados" → regenerar el informe (con otro estudio de prueba) → el pie dice
      "Lic. <nombre> · M.P. 852". Después, restaurar con
      `update "Professional" set title=null, "licenseNumber"=null where id=1;` (antes de la HU
      eran columnas inexistentes, o sea `null`).
17. `select count(*) from "OutboundMessage" where "toJid"='hu007-walk@test.invalid';` → 0.

**Limpieza** (por id propio; la cascada se lleva las consultas, las mediciones y el informe de
**ese** paciente):
```sql
delete from "OutboundMessage" where "toJid"='hu007-walk@test.invalid';
delete from "Patient" where id='hu007_walk_p';
```

---

## 13. Restricciones para el implementer (obligatorias)

1. **Datos de desarrollo:** ningún dato de negocio preexistente se borra ni cambia. Solo se
   escribe con la migración (aditiva), `test-anthropometric-report.ts` (limpia por id) y
   `test-report-outbox.ts` (transacción revertida). No se guarda `/ajustes`.
2. **Prisma:**
   - `pg_dump` antes, `--create-only` y revisar el SQL;
   - nada de `migrate reset` ni `db push`, y no aceptar el reset por drift;
   - si hay drift: `blocked` con la salida de `migrate status`.
3. **WhatsApp:** ninguna prueba confirma un `OutboundMessage`. El único enqueue de prueba va dentro
   de la transacción que se revierte. Nada importa `whatsapp.ts` ni Baileys en los scripts. Los
   jids de prueba terminan en `@test.invalid`.
4. **Lógica:**
   - el modelo, los textos, los borradores, los umbrales, la huella y la geometría de los
     gráficos van en `packages/core`, con tests;
   - las lecturas y escrituras van en `packages/db/domain/anthropometricReports.ts`;
   - el PDF solo dibuja;
   - no se recalcula nada fuera de `buildIsakStudy`/`buildAnthropometricDiagnosis`, salvo el ICC
     del menor, con `computeWaistHipRatio`, y siempre en core.
5. **`useConfirm`:** nunca `await confirm()` dentro de `<form action>` ni de `startTransition`.
   Las actions del informe se llaman directo desde handlers.
6. **Sin `key` que cambie con datos guardados** en el editor del informe ni en `IsakCard`/`IsakForm`.
7. **UI:** solo el sistema de diseño actual. `tailwind.config.ts` no se toca. Los colores nuevos
   son solo del PDF (`pdf-theme.ts`).
8. **El PDF del plan** se tiene que ver idéntico después de extraer `pdf-common.tsx` (11.2).
9. **Material de ejemplo:** no se copia nada de `docs/EJEMPLO DE INFORME ANTROPOMETRICO.pdf`
   (nombre, números ni imágenes). No tocar ese archivo.
10. **No** correr `next build` ni levantar otro `next dev`. Avisar en `progress/impl_HU-007.md`
    que hay que reiniciar el `next dev` del usuario.
11. **Rama** `hu-007-informe-antropometrico`, sin commitear y sin tocar `backlog.json`.

## 14. Fuera de alcance (no implementar)

Lo de "Fuera de alcance" de la HU:
- pediatría (HU-008);
- ArgoRef;
- Z del Phantom, proporcionalidad, Σ8, cintura/talla, conicidad e IDG en el PDF;
- firma escaneada y matrícula en el plan y el portal;
- plantilla visual propia y editor de plantillas;
- vista previa de los gráficos en pantalla;
- redacción con IA;
- InBody;
- elegir a mano el estudio de comparación;
- historial de versiones del PDF;
- informe en el portal (D11);
- mandar el `caption` junto al documento (D7).

Además, estas decisiones de esta SDD:
- el guard de cambios sin guardar no intercepta el botón "atrás" del navegador;
- el aviso de "PDF desactualizado" mira solo los datos del estudio: si ella guarda textos nuevos
  sin generar, "Descargar" entrega el PDF anterior hasta que toque "Generar PDF";
- "Enviar por WhatsApp" siempre regenera.
