// HU-016: bloque de firma del informe antropométrico. HU-017c-4: paleta y acento del informe.
// Renderiza en memoria, sin base.
// Con HU016_PDF_DIR definida escribe los PDF ahí para revisarlos a ojo (en CI no escribe nada).
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { describe, expect, it } from "vitest";
import { isValidElement, type ReactNode } from "react";
import { Document, Page, renderToBuffer } from "@react-pdf/renderer";
import {
  buildIsakReportDrafts,
  buildIsakReportModel,
  buildIsakStudy,
  professionalSignature,
  professionalSignatureLines,
  type IsakMeasures,
  type IsakReportInput,
} from "@nutri-bot/core";
import { CASE_A, CASE_B } from "../../../../packages/core/src/isak-fixtures.test-data";
import { PdfSignatureBlock, type PdfSignatureInput } from "@/lib/pdf-common";
import {
  AnthropometricReportDocument,
  renderAnthropometricReportPdf,
  type ReportPdfInput,
} from "@/lib/anthropometric-report-pdf";
import { pdfColors, reportPreviousColor, reportTissueColors, reportZoneColors } from "@/lib/pdf-theme";
import { REPORT_DEFAULT_ACCENT, reportPdfColors, reportPdfTissueColors, reportPdfZoneColors } from "@/lib/report-pdf-theme";

// ─── PNG de prueba generado acá (sin binarios en el repo) ───────────────────────

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
/** PNG RGBA con fondo transparente y un trazo tipo firma (onda azul oscura). */
function signaturePng(width = 600, height = 200): Buffer {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let x = 0; x < width; x++) {
    const yc = Math.round(height / 2 + Math.sin(x / 35) * (height / 4) * Math.cos(x / 170));
    for (let dy = -3; dy <= 3; dy++) {
      const y = yc + dy;
      if (y < 0 || y >= height) continue;
      const o = y * (width * 4 + 1) + 1 + x * 4;
      raw[o] = 20;
      raw[o + 1] = 30;
      raw[o + 2] = 90;
      raw[o + 3] = 255;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const PNG = signaturePng();
/** Cabecera PNG válida, cuerpo basura. */
const CORRUPT_PNG = Buffer.concat([PNG.subarray(0, 33), Buffer.from("esto no es un PNG ".repeat(20))]);

// ─── Modelo del informe (mismos fixtures que isak-report.test.ts) ──────────────

const study = (measures: IsakMeasures, ageYears: number, dateLabel: string) => ({
  result: buildIsakStudy({ measures, sex: "MALE", ageYears }),
  dateLabel,
  ageYears,
});
const AB: IsakReportInput = {
  patientName: "Paciente de prueba",
  current: study(CASE_A, 22, "08/05/2026"),
  previous: study(CASE_B, 21, "05/11/2025"),
};
const MODEL = buildIsakReportModel(AB);
const DRAFTS = buildIsakReportDrafts(AB);

const PRO = { title: "Lic.", name: "Daiana Ponce", licenseNumber: "M.P. 852" };

function reportInput(
  over: { image?: Buffer | null; licenseNumber?: string | null; conclusions?: string; accentColor?: string | null } = {},
): ReportPdfInput {
  const pro = { ...PRO, licenseNumber: over.licenseNumber === undefined ? PRO.licenseNumber : over.licenseNumber };
  const lines = professionalSignatureLines(pro);
  const image = over.image === undefined ? PNG : over.image;
  return {
    model: MODEL,
    texts: { ...DRAFTS, conclusions: over.conclusions ?? DRAFTS.conclusions },
    professionalName: "Lic. Daiana Ponce",
    signature: professionalSignature(pro),
    logo: null,
    accentColor: over.accentColor ?? null,
    signatureBlock: { image: image ? { data: image, mimeType: "image/png" } : null, ...lines },
  };
}

const hasImage = (pdf: Buffer) => pdf.toString("latin1").includes("/Subtype /Image");

const OUT_DIR = process.env.HU016_PDF_DIR;
function maybeWrite(name: string, pdf: Buffer) {
  if (!OUT_DIR) return;
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(path.join(OUT_DIR, name), pdf);
}

function blockDoc(signature: PdfSignatureInput) {
  return (
    <Document>
      <Page size="A4">
        <PdfSignatureBlock signature={signature} />
      </Page>
    </Document>
  );
}

describe("PdfSignatureBlock", () => {
  it("no se parte entre páginas (wrap={false})", () => {
    const el = PdfSignatureBlock({ signature: { image: null, nameLine: "Lic. Daiana Ponce", licenseLine: "M.P. 852" } });
    expect(el.props.wrap).toBe(false);
  });

  it("con imagen la incrusta; sin imagen no", async () => {
    const withImg = await renderToBuffer(
      blockDoc({ image: { data: PNG, mimeType: "image/png" }, nameLine: "Lic. Daiana Ponce", licenseLine: "M.P. 852" }),
    );
    expect(hasImage(withImg)).toBe(true);
    const without = await renderToBuffer(blockDoc({ image: null, nameLine: "Lic. Daiana Ponce", licenseLine: "M.P. 852" }));
    expect(hasImage(without)).toBe(false);
  });

  it("sin matrícula renderiza igual", async () => {
    const pdf = await renderToBuffer(blockDoc({ image: null, nameLine: "Daiana Ponce", licenseLine: null }));
    expect(pdf.subarray(0, 4).toString()).toBe("%PDF");
  });
});

describe("renderAnthropometricReportPdf con bloque de firma (HU-016)", () => {
  it("con firma: PDF válido con la imagen incrustada", async () => {
    const pdf = await renderAnthropometricReportPdf(reportInput());
    expect(pdf.subarray(0, 4).toString()).toBe("%PDF");
    expect(hasImage(pdf)).toBe(true);
    maybeWrite("informe-con-firma.pdf", pdf);
  }, 30_000);

  it("sin firma: solo línea y aclaración (sin imagen)", async () => {
    const pdf = await renderAnthropometricReportPdf(reportInput({ image: null }));
    expect(pdf.subarray(0, 4).toString()).toBe("%PDF");
    expect(hasImage(pdf)).toBe(false);
    maybeWrite("informe-sin-firma.pdf", pdf);
  }, 30_000);

  it("sin matrícula: sale igual", async () => {
    const pdf = await renderAnthropometricReportPdf(reportInput({ licenseNumber: null }));
    expect(pdf.subarray(0, 4).toString()).toBe("%PDF");
    maybeWrite("informe-sin-matricula.pdf", pdf);
  }, 30_000);

  it("PNG corrupto: el PDF se genera igual (D8)", async () => {
    const pdf = await renderAnthropometricReportPdf(reportInput({ image: CORRUPT_PNG }));
    expect(pdf.subarray(0, 4).toString()).toBe("%PDF");
  }, 30_000);

  it("conclusiones largas: el bloque pasa entero a la página siguiente", async () => {
    const long = Array.from({ length: 10 }, (_, i) => `Párrafo ${i + 1} de conclusiones de prueba para estirar el informe y empujar el bloque de firma al final de la página.`).join("\n");
    const pdf = await renderAnthropometricReportPdf(reportInput({ conclusions: long }));
    expect(pdf.subarray(0, 4).toString()).toBe("%PDF");
    expect(hasImage(pdf)).toBe(true);
    maybeWrite("informe-conclusiones-largas.pdf", pdf);
  }, 30_000);
});

// ─── HU-017c-4: paleta del informe ──────────────────────────────────────────────

type Node = { type: unknown; props: Record<string, unknown> };

/** Recorre el árbol expandiendo los componentes función (los primitivos de react-pdf son strings). */
function walk(node: ReactNode, visit: (el: Node) => void) {
  if (node === null || node === undefined || typeof node === "boolean") return;
  if (Array.isArray(node)) return node.forEach((n) => walk(n, visit));
  if (!isValidElement(node)) return;
  const el = node as unknown as Node;
  if (typeof el.type === "function") return walk((el.type as (p: unknown) => ReactNode)(el.props), visit);
  visit(el);
  walk(el.props.children as ReactNode, visit);
}

/** Todos los colores del árbol: los de `style` (objeto o array) y los `fill`/`stroke` del SVG. */
function colorsOf(input: ReportPdfInput): Set<string> {
  const out = new Set<string>();
  const add = (v: unknown) => {
    if (typeof v === "string" && v.startsWith("#")) out.add(v.toUpperCase());
  };
  const addStyle = (style: unknown) => {
    if (Array.isArray(style)) return style.forEach(addStyle);
    if (style && typeof style === "object") Object.values(style).forEach(add);
  };
  walk(AnthropometricReportDocument({ input }), (el) => {
    addStyle(el.props.style);
    add(el.props.fill);
    add(el.props.stroke);
  });
  return out;
}

/** El `style` del <Page>. */
function pageStyle(input: ReportPdfInput): Record<string, unknown> {
  let found: Record<string, unknown> = {};
  walk(AnthropometricReportDocument({ input }), (el) => {
    if (el.type === "PAGE") found = el.props.style as Record<string, unknown>;
  });
  return found;
}

describe("PDF del informe con la paleta propia (HU-017c-4)", () => {
  it("el PDF se genera", async () => {
    const pdf = await renderAnthropometricReportPdf(reportInput());
    expect(pdf.subarray(0, 4).toString()).toBe("%PDF");
    maybeWrite("informe-paleta-fria.pdf", pdf);
  }, 30_000);

  it("usa reportPdfColors.text y no pdfColors.text", () => {
    expect(pageStyle(reportInput()).color).toBe(reportPdfColors.text);
    const colors = colorsOf(reportInput());
    expect(colors.has(reportPdfColors.text)).toBe(true);
    expect(colors.has(reportPdfColors.muted)).toBe(true);
    expect(colors.has(reportPdfColors.border)).toBe(true);
    for (const old of Object.values(pdfColors)) expect(colors.has(old.toUpperCase())).toBe(false);
  });

  it("tejidos, zonas y serie anterior salen del tema nuevo", () => {
    const colors = colorsOf(reportInput());
    for (const c of [...Object.values(reportPdfTissueColors), ...Object.values(reportPdfZoneColors)]) {
      expect(colors.has(c.toUpperCase())).toBe(true);
    }
    for (const old of [...Object.values(reportTissueColors), ...Object.values(reportZoneColors), reportPreviousColor]) {
      expect(colors.has(old.toUpperCase())).toBe(false);
    }
  });

  it("sin acento usa REPORT_DEFAULT_ACCENT; con acento, el de Ajustes", () => {
    const accentRuleColor = (input: ReportPdfInput) => {
      let color: unknown;
      walk(AnthropometricReportDocument({ input }), (el) => {
        const st = el.props.style as { height?: number; backgroundColor?: string; marginTop?: number } | undefined;
        if (color === undefined && st && !Array.isArray(st) && st.height === 2 && st.marginTop === 14) color = st.backgroundColor;
      });
      return color;
    };
    expect(accentRuleColor(reportInput())).toBe(REPORT_DEFAULT_ACCENT);
    expect(accentRuleColor(reportInput({ accentColor: "#0A84FF" }))).toBe("#0A84FF");
    expect(colorsOf(reportInput({ accentColor: "#0A84FF" })).has("#0A84FF")).toBe(true);
  });
});
