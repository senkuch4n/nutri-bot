import "server-only";
import { Document, Page, View, Text, Image, StyleSheet, renderToBuffer } from "@react-pdf/renderer";
import { sumMacros, type Macros } from "@nutri-bot/core";
import type { MealView } from "@/components/meals-editor";

const styles = StyleSheet.create({
  page: { padding: 32, fontSize: 10, color: "#1a1a1a" },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 16 },
  logo: { width: 48, height: 48, objectFit: "contain" },
  title: { fontSize: 18, fontWeight: 700, marginBottom: 2 },
  subtitle: { fontSize: 10, color: "#555" },
  section: { marginTop: 14 },
  mealTitle: { fontSize: 12, fontWeight: 700, marginBottom: 6, paddingBottom: 3, borderBottomWidth: 1, borderBottomColor: "#ddd" },
  itemRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 3 },
  itemName: { flex: 1 },
  itemQty: { width: 60, textAlign: "right", color: "#555" },
  itemNote: { fontSize: 9, color: "#777", marginTop: 1 },
  totals: { marginTop: 18, paddingTop: 10, borderTopWidth: 1, borderTopColor: "#333", flexDirection: "row", gap: 16 },
  totalItem: { fontSize: 10 },
  notes: { marginTop: 14, fontSize: 9, color: "#555" },
  footer: { position: "absolute", bottom: 24, left: 32, right: 32, fontSize: 8, color: "#999", textAlign: "center" },
});

function macrosLine(m: Macros): string {
  return `${m.kcal} kcal · P ${m.protein}g · C ${m.carbs}g · G ${m.fat}g`;
}

export interface PlanPdfInput {
  planTitle: string;
  planNotes: string | null;
  patientName: string;
  professionalName: string;
  logo: { data: Buffer; mimeType: string } | null;
  meals: MealView[];
  generatedAtLabel: string;
}

export function PlanDocument({ input }: { input: PlanPdfInput }) {
  const allMacros = input.meals.flatMap((m) => m.items.map((i) => i.macros).filter((x): x is Macros => x !== null));
  const totals = sumMacros(allMacros);
  const logoSrc = input.logo
    ? `data:${input.logo.mimeType};base64,${input.logo.data.toString("base64")}`
    : null;

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <View>
            <Text style={styles.title}>{input.planTitle}</Text>
            <Text style={styles.subtitle}>Paciente: {input.patientName}</Text>
            <Text style={styles.subtitle}>{input.professionalName}</Text>
          </View>
          {/* eslint-disable-next-line jsx-a11y/alt-text -- @react-pdf/renderer Image, not an <img> */}
          {logoSrc ? <Image src={logoSrc} style={styles.logo} /> : null}
        </View>

        {input.meals.map((meal) => (
          <View key={meal.id} style={styles.section} wrap={false}>
            <Text style={styles.mealTitle}>{meal.name}</Text>
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

        <View style={styles.totals}>
          <Text style={styles.totalItem}>Total: {macrosLine(totals)}</Text>
        </View>

        {input.planNotes ? <Text style={styles.notes}>{input.planNotes}</Text> : null}

        <Text style={styles.footer}>Generado el {input.generatedAtLabel} · NutriBot</Text>
      </Page>
    </Document>
  );
}

export async function renderPlanPdf(input: PlanPdfInput): Promise<Buffer> {
  return renderToBuffer(<PlanDocument input={input} />);
}
