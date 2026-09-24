import "server-only";
import fs from "node:fs";
import path from "node:path";
import { Document, Font, Image, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import { formatMacrosLine, sumMacros, type Macros } from "@nutri-bot/core";
import type { MealView } from "@/components/meals-editor";
import { DEFAULT_PDF_ACCENT, pdfColors } from "@/lib/pdf-theme";

// ─── Tipografía ────────────────────────────────────────────────────────────────
// Inter 400/500/600 desde public/fonts (process.cwd() es apps/web en `next dev` y en el
// contenedor, donde server.js hace chdir a su carpeta). Si falta algún archivo, Helvetica:
// el PDF nunca deja de generarse por la fuente.

const FONT_DIR = path.join(process.cwd(), "public/fonts");
const INTER_FILES = [
  { weight: 400, file: "inter-latin-400-normal.woff" },
  { weight: 500, file: "inter-latin-500-normal.woff" },
  { weight: 600, file: "inter-latin-600-normal.woff" },
] as const;

function registerFonts(): string {
  const sources = INTER_FILES.map((f) => ({ src: path.join(FONT_DIR, f.file), fontWeight: f.weight }));
  if (!sources.every((s) => fs.existsSync(s.src))) return "Helvetica";
  Font.register({ family: "Inter", fonts: sources });
  return "Inter";
}

const FONT_FAMILY = registerFonts();
// Sin separación de sílabas: react-pdf corta palabras en español con reglas de inglés.
Font.registerHyphenationCallback((word) => [word]);

// ─── Estilos ───────────────────────────────────────────────────────────────────

function buildStyles(accentColor: string) {
  return StyleSheet.create({
    // Ojo: `lineHeight` NO va en la página. En react-pdf 4.9 un lineHeight en <Page> hace que el
    // pie `fixed` no se dibuje (verificado en el scratchpad); por eso va en `content`.
    page: {
      padding: 44,
      paddingBottom: 64,
      fontFamily: FONT_FAMILY,
      fontSize: 10,
      color: pdfColors.text,
    },
    content: { lineHeight: 1.45 },
    header: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 16 },
    headerLeft: { flexDirection: "row", alignItems: "center", gap: 12, flex: 1 },
    logo: { width: 40, height: 40, objectFit: "contain" },
    title: { fontSize: 18, fontWeight: 600, lineHeight: 1.2 },
    subtitle: { fontSize: 10, color: pdfColors.muted, marginTop: 2 },
    brand: { alignItems: "flex-end" },
    brandName: { fontSize: 10, fontWeight: 500 },
    brandProduct: { fontSize: 8, color: pdfColors.muted, marginTop: 1 },
    accentRule: { height: 2, backgroundColor: accentColor, marginTop: 14 },
    generated: { fontSize: 8.5, color: pdfColors.muted, marginTop: 6 },
    meal: { marginTop: 18 },
    mealHeader: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 4 },
    mealMark: { width: 3, height: 12, backgroundColor: accentColor, borderRadius: 1 },
    mealTitle: { fontSize: 11, fontWeight: 600 },
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
    footer: {
      position: "absolute",
      left: 44,
      right: 44,
      bottom: 28,
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      gap: 12,
      paddingTop: 6,
      borderTopWidth: 0.5,
      borderTopColor: pdfColors.border,
      fontSize: 8,
      color: pdfColors.muted,
    },
    footerText: { flex: 1 },
    footerPage: { width: 40, textAlign: "right" },
  });
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
  const logoSrc = input.logo
    ? `data:${input.logo.mimeType};base64,${input.logo.data.toString("base64")}`
    : null;
  const styles = buildStyles(input.accentColor || DEFAULT_PDF_ACCENT);
  const footerText = input.footerText || `Generado el ${input.generatedAtLabel} · NutriBot`;

  return (
    <Document title={input.planTitle} author={input.professionalName}>
      <Page size="A4" style={styles.page}>
        <View style={styles.content}>
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              {/* eslint-disable-next-line jsx-a11y/alt-text -- @react-pdf/renderer Image, not an <img> */}
              {logoSrc ? <Image src={logoSrc} style={styles.logo} /> : null}
              <View style={{ flex: 1 }}>
                <Text style={styles.title}>{input.planTitle}</Text>
                <Text style={styles.subtitle}>Paciente: {input.patientName}</Text>
              </View>
            </View>
            <View style={styles.brand}>
              <Text style={styles.brandName}>{input.professionalName}</Text>
              <Text style={styles.brandProduct}>NutriBot</Text>
            </View>
          </View>
          <View style={styles.accentRule} />
          <Text style={styles.generated}>Generado el {input.generatedAtLabel}</Text>

          {input.meals.map((meal) => (
            <View key={meal.id} style={styles.meal} wrap={false}>
              <View style={styles.mealHeader}>
                <View style={styles.mealMark} />
                <Text style={styles.mealTitle}>{meal.name}</Text>
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
        <View style={styles.footer} fixed>
          <Text style={styles.footerText}>{footerText}</Text>
          <Text
            style={styles.footerPage}
            render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`}
          />
        </View>
      </Page>
    </Document>
  );
}

export async function renderPlanPdf(input: PlanPdfInput): Promise<Buffer> {
  return renderToBuffer(<PlanDocument input={input} />);
}
