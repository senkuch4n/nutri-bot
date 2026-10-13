import "server-only";
import { Document, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import {
  WEEKDAYS,
  WEEKDAY_LABELS,
  computeWeeklyTotals,
  formatMacrosLine,
  itemsForDay,
  recipePortionText,
} from "@nutri-bot/core";
import type { MealItemView, MealView } from "@/components/meals-editor";
import type { RecipeItemView } from "@/components/recipe-picker/types";
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
      // HU-018b: "Elegí una:" en comidas de opciones y subtítulo de cada día (provisional, HU-015).
      optionsHint: { fontSize: 8.5, color: pdfColors.muted, marginTop: 4, marginBottom: 2 },
      day: { marginTop: 8 },
      dayTitle: { fontSize: 9.5, fontWeight: 600, marginBottom: 2 },
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

type PlanStyles = ReturnType<typeof buildStyles>;

/**
 * HU-018c: una receta es una línea con su nombre y, debajo, la porción casera y "Fuente: …". La
 * columna de cantidad va vacía. Provisional: el anexo de recetas, las fotos y el diseño definitivo
 * son de la HU-015.
 */
function RecipeRow({ item, recipe, styles }: { item: MealItemView; recipe: RecipeItemView; styles: PlanStyles }) {
  const detail = [recipePortionText(recipe.portions, recipe.portionHousehold), recipe.sourceName ? `Fuente: ${recipe.sourceName}` : null]
    .filter(Boolean)
    .join(" · ");
  return (
    <View style={styles.itemRow}>
      <View style={styles.itemName}>
        <Text>{recipe.name}</Text>
        <Text style={styles.itemNote}>{detail}</Text>
        {item.notes ? <Text style={styles.itemNote}>{item.notes}</Text> : null}
      </View>
    </View>
  );
}

function ItemRows({ items, styles }: { items: MealItemView[]; styles: PlanStyles }) {
  return (
    <>
      {items.map((item) =>
        item.recipe ? (
          <RecipeRow key={item.id} item={item} recipe={item.recipe} styles={styles} />
        ) : (
          <View key={item.id} style={styles.itemRow}>
            <View style={styles.itemName}>
              <Text>{item.foodName ?? item.customLabel ?? "—"}</Text>
              {item.notes ? <Text style={styles.itemNote}>{item.notes}</Text> : null}
            </View>
            <Text style={styles.itemQty}>{item.quantityGrams ? `${item.quantityGrams} g` : ""}</Text>
          </View>
        ),
      )}
    </>
  );
}

function MealTitle({ title, styles }: { title: string; styles: PlanStyles }) {
  return (
    <View style={styles.sectionHeader}>
      <View style={styles.sectionMark} />
      <Text style={styles.sectionTitle}>{title}</Text>
    </View>
  );
}

/** Comida "Igual todos los días" (o cualquier comida de un plan no semanal): un solo bloque. */
function WholeMeal({ meal, title, styles }: { meal: MealView; title: string; styles: PlanStyles }) {
  return (
    <View style={styles.meal} wrap={false}>
      <MealTitle title={title} styles={styles} />
      {meal.isOptions ? <Text style={styles.optionsHint}>Elegí una:</Text> : null}
      <ItemRows items={meal.items} styles={styles} />
    </View>
  );
}

/**
 * HU-018b: comida "Cambia cada día". El bloque que no se corta entre páginas es el día (D10), no
 * la comida. Se omiten los días sin ítems y la comida si no tiene ninguno.
 */
function PerDayMeal({ meal, styles }: { meal: MealView; styles: PlanStyles }) {
  const days = WEEKDAYS.map((day) => ({ day, items: itemsForDay(meal, day) })).filter((d) => d.items.length > 0);
  if (days.length === 0) return null;
  return (
    <View style={styles.meal}>
      <MealTitle title={meal.name} styles={styles} />
      {days.map(({ day, items }) => (
        <View key={day} style={styles.day} wrap={false}>
          <Text style={styles.dayTitle}>{WEEKDAY_LABELS[day].long}</Text>
          <ItemRows items={items} styles={styles} />
        </View>
      ))}
    </View>
  );
}

/**
 * PDF del plan. Provisional hasta la HU-015 (HU-018b, 7.8): un plan no semanal sale igual que antes
 * ("Total del plan"); uno semanal lista primero las comidas de todos los días y después cada comida
 * por día, con el "Promedio diario" de los días cargados.
 */
export function PlanDocument({ input }: { input: PlanPdfInput }) {
  const weekly = computeWeeklyTotals(input.meals);
  const totals = weekly.isWeekly
    ? { label: "Promedio diario", macros: weekly.weeklyAverage }
    : { label: "Total del plan", macros: weekly.days.MON.macros };
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

          {weekly.isWeekly ? (
            <>
              {input.meals.filter((meal) => meal.mode === "EVERY_DAY").map((meal) => (
                <WholeMeal key={meal.id} meal={meal} title={`${meal.name} · Todos los días`} styles={styles} />
              ))}
              {input.meals.filter((meal) => meal.mode === "PER_DAY").map((meal) => (
                <PerDayMeal key={meal.id} meal={meal} styles={styles} />
              ))}
            </>
          ) : (
            input.meals.map((meal) => <WholeMeal key={meal.id} meal={meal} title={meal.name} styles={styles} />)
          )}

          {totals.macros ? (
            <View style={styles.totals} wrap={false}>
              <Text style={styles.totalsLabel}>{totals.label}</Text>
              <Text style={styles.totalsLine}>{formatMacrosLine(totals.macros)}</Text>
            </View>
          ) : null}

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
