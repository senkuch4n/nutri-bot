import "server-only";
import { Document, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import { formatMacrosLine, sumMacros, type Macros } from "@nutri-bot/core";
import type { MealView } from "@/components/meals-editor";
import { PdfFooter, PdfHeader, buildCommonStyles, pdfLogoSrc } from "@/lib/pdf-common";
import { DEFAULT_PDF_ACCENT, pdfColors } from "@/lib/pdf-theme";

// ─── Estilos ───────────────────────────────────────────────────────────────────
// Tipografía, encabezado, pie y estilos base en pdf-common.tsx (compartidos con el informe
// antropométrico, HU-007). Acá, lo propio del plan.

function buildStyles(accentColor: string) {
  const common = buildCommonStyles(accentColor);
  return {
    ...common,
    ...StyleSheet.create({
      generated: { fontSize: 8.5, color: pdfColors.muted, marginTop: 6 },
      meal: { marginTop: 18 },
      itemRow: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "flex-start",
        paddingVertical: 4,
        borderBottomWidth: 0.5,
        borderBottomColor: pdfColors.border,
      },
      itemName: { flex: 1, paddingRight: 8 },
      itemNote: { fontSize: 8.5, color: pdfColors.muted, marginTop: 1 },
      itemQty: { width: 64, textAlign: "right", color: pdfColors.muted },
      totals: {
        marginTop: 22,
        padding: 10,
        paddingLeft: 12,
        backgroundColor: pdfColors.subtle,
        borderWidth: 0.5,
        borderColor: pdfColors.border,
        borderLeftWidth: 3,
        borderLeftColor: accentColor,
        borderRadius: 6,
      },
      totalsLabel: { fontSize: 8.5, color: pdfColors.muted, marginBottom: 2 },
      totalsLine: { fontSize: 10, fontWeight: 500 },
      notesTitle: { fontSize: 9, fontWeight: 600, marginTop: 16, marginBottom: 2 },
      notes: { fontSize: 9, color: pdfColors.muted },
    }),
  };
}

export interface PlanPdfInput {
  planTitle: string;
  planNotes: string | null;
  patientName: string;
  professionalName: string;
  logo: { data: Buffer; mimeType: string } | null;
  meals: MealView[];
  generatedAtLabel: string;
  accentColor?: string | null;
  footerText?: string | null;
}

export function PlanDocument({ input }: { input: PlanPdfInput }) {
  const allMacros = input.meals.flatMap((m) => m.items.map((i) => i.macros).filter((x): x is Macros => x !== null));
  const totals = sumMacros(allMacros);
  const styles = buildStyles(input.accentColor || DEFAULT_PDF_ACCENT);
  const footerText = input.footerText || `Generado el ${input.generatedAtLabel} · NutriBot`;

  return (
    <Document title={input.planTitle} author={input.professionalName}>
      <Page size="A4" style={styles.page}>
        <View style={styles.content}>
          <PdfHeader
            logoSrc={pdfLogoSrc(input.logo)}
            title={input.planTitle}
            subtitle={`Paciente: ${input.patientName}`}
            brandName={input.professionalName}
            styles={styles}
          />
          <Text style={styles.generated}>Generado el {input.generatedAtLabel}</Text>

          {input.meals.map((meal) => (
            <View key={meal.id} style={styles.meal} wrap={false}>
              <View style={styles.sectionHeader}>
                <View style={styles.sectionMark} />
                <Text style={styles.sectionTitle}>{meal.name}</Text>
              </View>
              {meal.items.map((item) => (
                <View key={item.id} style={styles.itemRow}>
                  <View style={styles.itemName}>
                    <Text>{item.foodName ?? item.customLabel ?? "—"}</Text>
                    {item.notes ? <Text style={styles.itemNote}>{item.notes}</Text> : null}
                  </View>
                  <Text style={styles.itemQty}>{item.quantityGrams ? `${item.quantityGrams} g` : ""}</Text>
                </View>
              ))}
            </View>
          ))}

          <View style={styles.totals} wrap={false}>
            <Text style={styles.totalsLabel}>Total del plan</Text>
            <Text style={styles.totalsLine}>{formatMacrosLine(totals)}</Text>
          </View>

          {input.planNotes ? (
            <View wrap={false}>
              <Text style={styles.notesTitle}>Notas</Text>
              <Text style={styles.notes}>{input.planNotes}</Text>
            </View>
          ) : null}
        </View>

        {/* En TODAS las páginas: texto del pie (personalizable en /ajustes) y "n / total". */}
        <PdfFooter
          text={footerText}
          pageLabel={(n, total) => `${n} / ${total}`}
          styles={styles}
          pageWidth={40}
        />
      </Page>
    </Document>
  );
}

export async function renderPlanPdf(input: PlanPdfInput): Promise<Buffer> {
  return renderToBuffer(<PlanDocument input={input} />);
}
