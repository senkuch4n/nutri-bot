// Piezas comunes de los PDFs (plan e informe antropométrico, HU-007): tipografía, estilos base,
// encabezado y pie. Sin "server-only" para poder renderizar en un script de prueba, pero solo lo
// importan módulos de servidor (usa node:fs).
import fs from "node:fs";
import path from "node:path";
import { Font, Image, StyleSheet, Text, View } from "@react-pdf/renderer";
import { pdfColors } from "@/lib/pdf-theme";

// ─── Tipografía ────────────────────────────────────────────────────────────────
// Inter 400/500/600 desde public/fonts (process.cwd() es apps/web en `next dev` y en el
// contenedor, donde server.js hace chdir a su carpeta). Si falta algún archivo, Helvetica:
// el PDF nunca deja de generarse por la fuente. Se registra una sola vez, acá.

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

export const FONT_FAMILY = registerFonts();
// Sin separación de sílabas: react-pdf corta palabras en español con reglas de inglés.
Font.registerHyphenationCallback((word) => [word]);

export type PdfImage = { data: Buffer; mimeType: string };

/** data: URL de una imagen guardada (logo o firma), o null. */
export function pdfImageSrc(img: PdfImage | null): string | null {
  return img ? `data:${img.mimeType};base64,${img.data.toString("base64")}` : null;
}
/** Compatibilidad: plan-pdf.tsx y el informe lo siguen importando con este nombre. */
export const pdfLogoSrc = pdfImageSrc;

// ─── Estilos comunes ───────────────────────────────────────────────────────────

/** Colores neutros de un PDF. El plan usa `pdfColors`; el informe, `reportPdfColors` (HU-017c-4). */
export type PdfPalette = { text: string; muted: string; border: string; subtle: string };

/** `palette` es opcional: sin ella el resultado es idéntico al de antes (el plan no la pasa). */
export function buildCommonStyles(accentColor: string, palette: PdfPalette = pdfColors) {
  return StyleSheet.create({
    // Ojo: `lineHeight` NO va en la página. En react-pdf 4.9 un lineHeight en <Page> hace que el
    // pie `fixed` no se dibuje (verificado en el scratchpad); por eso va en `content`.
    page: {
      padding: 44,
      paddingBottom: 64,
      fontFamily: FONT_FAMILY,
      fontSize: 10,
      color: palette.text,
    },
    content: { lineHeight: 1.45 },
    header: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 16 },
    headerLeft: { flexDirection: "row", alignItems: "center", gap: 12, flex: 1 },
    logo: { width: 40, height: 40, objectFit: "contain" },
    title: { fontSize: 18, fontWeight: 600, lineHeight: 1.2 },
    subtitle: { fontSize: 10, color: palette.muted, marginTop: 2 },
    brand: { alignItems: "flex-end" },
    brandName: { fontSize: 10, fontWeight: 500 },
    brandProduct: { fontSize: 8, color: palette.muted, marginTop: 1 },
    accentRule: { height: 2, backgroundColor: accentColor, marginTop: 14 },
    sectionHeader: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 4 },
    sectionMark: { width: 3, height: 12, backgroundColor: accentColor, borderRadius: 1 },
    sectionTitle: { fontSize: 11, fontWeight: 600 },
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
      borderTopColor: palette.border,
      fontSize: 8,
      color: palette.muted,
    },
    footerText: { flex: 1 },
  });
}

export type CommonStyles = ReturnType<typeof buildCommonStyles>;

// ─── Encabezado y pie ──────────────────────────────────────────────────────────

export function PdfHeader({
  logoSrc,
  title,
  subtitle,
  brandName,
  styles,
  palette,
}: {
  logoSrc: string | null;
  title: string;
  subtitle: string;
  brandName: string;
  styles: CommonStyles;
  /** Opcional: repinta los textos secundarios aunque `styles` se haya armado con otra paleta. */
  palette?: PdfPalette;
}) {
  const muted = palette ? { color: palette.muted } : null;
  return (
    <>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          {/* eslint-disable-next-line jsx-a11y/alt-text -- @react-pdf/renderer Image, not an <img> */}
          {logoSrc ? <Image src={logoSrc} style={styles.logo} /> : null}
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>{title}</Text>
            <Text style={muted ? [styles.subtitle, muted] : styles.subtitle}>{subtitle}</Text>
          </View>
        </View>
        <View style={styles.brand}>
          <Text style={styles.brandName}>{brandName}</Text>
          <Text style={muted ? [styles.brandProduct, muted] : styles.brandProduct}>NutriBot</Text>
        </View>
      </View>
      <View style={styles.accentRule} />
    </>
  );
}

/** Pie fijo, en todas las páginas: texto a la izquierda y número de página a la derecha. */
export function PdfFooter({
  text,
  pageLabel,
  styles,
  pageWidth,
  palette,
}: {
  text: string;
  pageLabel: (pageNumber: number, totalPages: number) => string;
  styles: CommonStyles;
  pageWidth: number;
  /** Opcional: repinta el separador y el texto aunque `styles` se haya armado con otra paleta. */
  palette?: PdfPalette;
}) {
  const override = palette ? { borderTopColor: palette.border, color: palette.muted } : null;
  return (
    <View style={override ? [styles.footer, override] : styles.footer} fixed>
      <Text style={styles.footerText}>{text}</Text>
      <Text
        style={{ width: pageWidth, textAlign: "right" }}
        render={({ pageNumber, totalPages }) => pageLabel(pageNumber, totalPages)}
      />
    </View>
  );
}

// ─── Bloque de firma (HU-016, D7) ─────────────────────────────────────────────

/** HU-016 (D7): datos del bloque de firma. */
export type PdfSignatureInput = {
  image: PdfImage | null; // null → solo línea + aclaración (D8)
  nameLine: string; // professionalSignatureLines(...).nameLine
  licenseLine: string | null;
};

const signatureStyles = StyleSheet.create({
  block: { marginTop: 32, alignSelf: "flex-end", width: 180, alignItems: "center" },
  image: { width: 180, height: 45, objectFit: "contain", marginBottom: 2 },
  rule: { alignSelf: "stretch", borderTopWidth: 0.75, borderTopColor: pdfColors.text, marginBottom: 4 },
  name: { fontSize: 10, fontWeight: 500, textAlign: "center", lineHeight: 1.3 },
  license: { fontSize: 9, textAlign: "center", lineHeight: 1.3 },
});

/**
 * Bloque de firma al final del contenido: imagen (alto máx. 45 pt, proporción), línea y aclaración
 * en dos líneas, alineado a la derecha. wrap={false}: si no entra, pasa entero a la página siguiente.
 * Estilos propios (no depende de buildCommonStyles), así el plan lo reusa sin cambios.
 */
export function PdfSignatureBlock({
  signature,
  palette = pdfColors,
}: {
  signature: PdfSignatureInput;
  /** Opcional (HU-017c-4): color de la línea de firma. Default `pdfColors`, como antes. */
  palette?: PdfPalette;
}) {
  const src = pdfImageSrc(signature.image);
  return (
    <View style={signatureStyles.block} wrap={false}>
      {/* eslint-disable-next-line jsx-a11y/alt-text -- @react-pdf/renderer Image, not an <img> */}
      {src ? <Image src={src} style={signatureStyles.image} /> : null}
      <View style={{ ...signatureStyles.rule, borderTopColor: palette.text }} />
      <Text style={signatureStyles.name}>{signature.nameLine}</Text>
      {signature.licenseLine ? <Text style={signatureStyles.license}>{signature.licenseLine}</Text> : null}
    </View>
  );
}
