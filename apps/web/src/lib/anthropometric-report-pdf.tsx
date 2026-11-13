// PDF del informe antropométrico (HU-007). Solo dibuja: el modelo, los textos y la geometría de
// los gráficos vienen de packages/core. Sin "server-only" (se renderiza en un script de prueba),
// pero solo lo importan módulos de servidor.
// HU-017c-4 (D15): paleta fría y escala Inter en pt de report-pdf-theme.ts; el acento sale de
// Ajustes o es REPORT_DEFAULT_ACCENT. El PDF del plan sigue con pdf-theme.ts.
import { Document, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import {
  ISAK_REPORT_TEXT,
  buildCompositionBarsLayout,
  buildGirthBarsLayout,
  buildSomatochartLayout,
  type IsakReportModel,
  type IsakReportRow,
  type IsakReportTextKey,
  type IsakReportTexts,
} from "@nutri-bot/core";
import {
  PdfFooter,
  PdfHeader,
  PdfSignatureBlock,
  buildCommonStyles,
  pdfLogoSrc,
  type PdfSignatureInput,
} from "@/lib/pdf-common";
import { REPORT_DEFAULT_ACCENT, reportPdfColors, reportPdfType } from "@/lib/report-pdf-theme";
import { BodyFigure, CompositionBarsChart, GirthBarsChart, SomatochartPdf } from "@/lib/report-pdf-charts";

export interface ReportPdfInput {
  model: IsakReportModel;
  /** Los guardados. */
  texts: IsakReportTexts;
  professionalName: string;
  /** professionalSignature(...) */
  signature: string;
  logo: { data: Buffer; mimeType: string } | null;
  accentColor: string | null;
  /** HU-016 (D7): bloque de firma después de Conclusiones. */
  signatureBlock: PdfSignatureInput;
}

/** Ancho útil de A4 (595,28 pt) con los márgenes de 44 pt. */
const CONTENT_WIDTH = 595.28 - 88;
const GIRTH_CHART_WIDTH = 300;
const SOMATOCHART_WIDTH = 260;

const C = reportPdfColors;
const TYPE = reportPdfType;
/** Tamaño y peso de un paso de la escala (el lineHeight lo pone `content`, ver abajo). */
const type = (t: (typeof TYPE)[keyof typeof TYPE]) => ({
  fontSize: t.fontSize,
  fontWeight: t.fontWeight,
  letterSpacing: t.letterSpacing,
});

function buildStyles(accentColor: string) {
  const common = buildCommonStyles(accentColor, C);
  return {
    ...common,
    ...StyleSheet.create({
      page: { ...common.page, fontSize: TYPE.body.fontSize },
      // En react-pdf 4.9 el lineHeight heredado de `content` (1.45, el del plan) se aplica de más en
      // los textos anidados. El informe tiene muchas filas cortas: usa el de la escala (1.2).
      content: { lineHeight: TYPE.body.lineHeight },
      title: { ...type(TYPE.title), lineHeight: TYPE.title.lineHeight },
      sectionMark: { ...common.sectionMark, height: 13 },
      sectionHeader: { ...common.sectionHeader, marginBottom: 4 },
      sectionTitle: { ...type(TYPE.heading), lineHeight: TYPE.heading.lineHeight },
      section: { marginTop: 16 },
      intro: { ...type(TYPE.caption), color: C.muted, marginBottom: 4 },
      subTitle: { fontSize: TYPE.body.fontSize, fontWeight: 600, marginTop: 8, marginBottom: 2 },
      columnsHead: {
        flexDirection: "row",
        gap: 16,
        paddingBottom: 3,
        marginBottom: 2,
        borderBottomWidth: 0.5,
        borderBottomColor: C.border,
      },
      columnHead: { flex: 1, ...type(TYPE.caption), fontWeight: 600, color: C.muted },
      row: { flexDirection: "row", gap: 16, paddingVertical: 1.5 },
      cell: { flex: 1 },
      cellStrong: { flex: 1, fontWeight: 600 },
      paragraph: { marginTop: 6 },
      note: { ...type(TYPE.caption), color: C.muted, marginBottom: 4 },
      chartsRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginTop: 6 },
      // Compacto, como en HU-007: con la cifra en `metric` el informe pasa de 4 a 5 páginas.
      indicator: { marginTop: 6 },
      indicatorName: { fontWeight: 600 },
      indicatorLine: { fontSize: TYPE.body.fontSize },
      variation: { ...type(TYPE.caption), color: C.muted },
      tableRow: {
        flexDirection: "row",
        paddingVertical: 2,
        borderBottomWidth: 0.5,
        borderBottomColor: C.border,
      },
      tableHead: { ...type(TYPE.caption), fontWeight: 600, color: C.muted },
      tableName: { width: 110 },
      tableValue: { flex: 1 },
      methods: { ...type(TYPE.caption), fontSize: 8, color: C.muted, marginBottom: 4 },
    }),
  };
}

type Styles = ReturnType<typeof buildStyles>;

/** Inter (subset latin) no trae "→" (U+2192): en el PDF va "a" ("Endomorfia 4,95 a 4,03"). */
function pdfGlyphs(text: string): string {
  return text.replaceAll(" → ", " a ");
}

function SectionTitle({ title, styles }: { title: string; styles: Styles }) {
  return (
    <View style={styles.sectionHeader}>
      <View style={styles.sectionMark} />
      <Text style={styles.sectionTitle}>{title}</Text>
    </View>
  );
}

/** Párrafo interpretativo: va después del bloque y se puede partir entre páginas. */
function Paragraph({ texts, textKey, styles }: { texts: IsakReportTexts; textKey: IsakReportTextKey; styles: Styles }) {
  const text = texts[textKey];
  if (text.trim() === "") return null;
  return (
    <Text style={styles.paragraph} orphans={2} widows={2}>
      {text}
    </Text>
  );
}

function Rows({
  rows,
  model,
  styles,
  strong,
  head,
}: {
  rows: IsakReportRow[];
  model: IsakReportModel;
  styles: Styles;
  strong?: boolean;
  head?: boolean;
}) {
  const cellStyle = strong ? styles.cellStrong : styles.cell;
  const current = (r: IsakReportRow) => `${r.label}: ${r.current}${r.change ? ` (${r.change})` : ""}`;
  return (
    <View>
      {head ? (
        <View style={styles.columnsHead}>
          {model.hasPrevious ? <Text style={styles.columnHead}>{model.columns.previous}</Text> : null}
          <Text style={styles.columnHead}>{model.columns.current}</Text>
        </View>
      ) : null}
      {rows.map((r) => (
        <View key={r.key} style={styles.row}>
          {model.hasPrevious ? <Text style={cellStyle}>{`${r.label}: ${r.previous ?? ""}`}</Text> : null}
          <Text style={cellStyle}>{current(r)}</Text>
        </View>
      ))}
    </View>
  );
}

export function AnthropometricReportDocument({ input }: { input: ReportPdfInput }) {
  const { model, texts } = input;
  const accent = input.accentColor || REPORT_DEFAULT_ACCENT;
  const styles = buildStyles(accent);
  const S = ISAK_REPORT_TEXT.sections;

  const girthLayout = buildGirthBarsLayout(model.distribution.bars, {
    width: GIRTH_CHART_WIDTH,
    hasPrevious: model.hasPrevious,
  });
  const somatoLayout = buildSomatochartLayout({
    width: SOMATOCHART_WIDTH,
    current: model.somatotype.chart.current,
    previous: model.somatotype.chart.previous,
  });
  const compositionLayout = model.composition
    ? buildCompositionBarsLayout(model.composition.bars, {
        width: CONTENT_WIDTH,
        hasPrevious: model.hasPrevious,
        previousLabel: model.legend.previous,
        currentLabel: model.legend.current,
      })
    : null;

  return (
    <Document title={ISAK_REPORT_TEXT.title} author={input.professionalName}>
      <Page size="A4" style={styles.page}>
        <View style={styles.content}>
          <PdfHeader
            logoSrc={pdfLogoSrc(input.logo)}
            title={model.title}
            subtitle={model.subtitle}
            brandName={input.professionalName}
            styles={styles}
          />

          {/* 1. Datos personales */}
          <View style={styles.section} wrap={false}>
            <SectionTitle title={S.personal} styles={styles} />
            <Text>{`${ISAK_REPORT_TEXT.personalName}: ${model.personal.name}`}</Text>
            <Text>{`${ISAK_REPORT_TEXT.personalAge}: ${model.personal.age}`}</Text>
            <Text>{`${ISAK_REPORT_TEXT.personalDate}: ${model.personal.date}`}</Text>
          </View>

          {/* 2. Mediciones */}
          <View style={styles.section} wrap={false}>
            <SectionTitle title={S.measurements} styles={styles} />
            {model.measurements.minorNote ? <Text style={styles.note}>{model.measurements.minorNote}</Text> : null}
            <Rows rows={[
              ...model.measurements.rows,
              model.measurements.bmi,
              ...(model.measurements.heightForAge ? [model.measurements.heightForAge] : []),
            ]} model={model} styles={styles} head />
          </View>

          {/* 3. Pliegues */}
          <View style={styles.section} wrap={false}>
            <SectionTitle title={S.skinfolds} styles={styles} />
            <Text style={styles.intro}>{model.skinfolds.intro}</Text>
            <Rows rows={model.skinfolds.rows} model={model} styles={styles} head />
            <Rows rows={[model.skinfolds.sum6]} model={model} styles={styles} strong />
            <Text style={styles.subTitle}>{model.skinfolds.othersTitle}</Text>
            <Rows rows={model.skinfolds.others} model={model} styles={styles} />
          </View>

          {/* 4. Perímetros */}
          <View style={styles.section} wrap={false}>
            <SectionTitle title={S.girths} styles={styles} />
            <Text style={styles.intro}>{model.girths.muscleIntro}</Text>
            <Rows rows={model.girths.muscle} model={model} styles={styles} head />
            <Text style={[styles.intro, { marginTop: 6 }]}>{model.girths.visceralIntro}</Text>
            <Rows rows={model.girths.visceral} model={model} styles={styles} />
            <Text style={[styles.intro, { marginTop: 6 }]}>{model.girths.correctedIntro}</Text>
            <Rows rows={model.girths.corrected} model={model} styles={styles} />
          </View>
          <Paragraph texts={texts} textKey="girths" styles={styles} />

          {/* 5. Distribución */}
          <View style={styles.section} wrap={false}>
            <SectionTitle title={S.distribution} styles={styles} />
            <View style={styles.chartsRow}>
              <GirthBarsChart layout={girthLayout} accent={accent} legend={model.legend} />
              <BodyFigure
                adipose={model.distribution.adipose}
                muscle={model.distribution.muscle}
                labels={{ adipose: ISAK_REPORT_TEXT.adiposeTissue, muscle: ISAK_REPORT_TEXT.muscleTissue }}
              />
            </View>
          </View>
          <Paragraph texts={texts} textKey="distribution" styles={styles} />

          {/* 6. Indicadores de salud */}
          <View style={styles.section} minPresenceAhead={60}>
            <SectionTitle title={S.health} styles={styles} />
          </View>
          {model.health.indicators.map((ind) => (
            <View key={ind.key}>
              <View style={styles.indicator} wrap={false}>
                <Text style={styles.indicatorName}>{ind.label}</Text>
                <Text style={styles.indicatorLine}>{ind.category ? `${ind.value} · ${ind.category}` : ind.value}</Text>
                {ind.variation ? <Text style={styles.variation}>{ind.variation}</Text> : null}
              </View>
              <Paragraph texts={texts} textKey={ind.textKey} styles={styles} />
            </View>
          ))}

          {/* 7. Composición corporal (no en menores) */}
          {model.composition && compositionLayout ? (
            <View style={styles.section} wrap={false}>
              <SectionTitle title={S.composition} styles={styles} />
              <Text style={styles.intro}>{model.composition.intro}</Text>
              <Text style={styles.methods}>{model.composition.methods}</Text>
              <View style={{ marginTop: 4, marginBottom: 8 }}>
                <CompositionBarsChart layout={compositionLayout} />
              </View>
              <View style={styles.tableRow}>
                <Text style={[styles.tableHead, styles.tableName]}>Componente</Text>
                {model.hasPrevious ? <Text style={[styles.tableHead, styles.tableValue]}>Anterior</Text> : null}
                <Text style={[styles.tableHead, styles.tableValue]}>Actual</Text>
              </View>
              {model.composition.rows.map((r) => (
                <View key={r.key} style={styles.tableRow}>
                  <Text style={styles.tableName}>{r.label}</Text>
                  {model.hasPrevious ? <Text style={styles.tableValue}>{r.previous ?? ""}</Text> : null}
                  <Text style={styles.tableValue}>{r.current}</Text>
                </View>
              ))}
            </View>
          ) : null}

          {/* 8. Somatotipo */}
          <View style={styles.section} wrap={false}>
            <SectionTitle title={S.somatotype} styles={styles} />
            <Text style={styles.intro}>{model.somatotype.intro}</Text>
            <Text>{pdfGlyphs(model.somatotype.components)}</Text>
            <Text style={{ fontWeight: 600, marginBottom: 4 }}>{`Categoría: ${model.somatotype.category}`}</Text>
            <SomatochartPdf
              layout={somatoLayout}
              accent={accent}
              legend={model.legend}
              missingNote={model.somatotype.chart.missingNote}
            />
          </View>
          <Paragraph texts={texts} textKey="somatotype" styles={styles} />

          {/* 9. Conclusiones */}
          <View style={styles.section} minPresenceAhead={40}>
            <SectionTitle title={S.conclusions} styles={styles} />
          </View>
          <Text orphans={2} widows={2}>
            {texts.conclusions}
          </Text>
          <PdfSignatureBlock signature={input.signatureBlock} palette={C} />
        </View>

        <PdfFooter
          text={input.signature}
          pageLabel={(n, total) => `Página ${n} de ${total}`}
          styles={styles}
          pageWidth={90}
        />
      </Page>
    </Document>
  );
}

export async function renderAnthropometricReportPdf(input: ReportPdfInput): Promise<Buffer> {
  return renderToBuffer(<AnthropometricReportDocument input={input} />);
}
