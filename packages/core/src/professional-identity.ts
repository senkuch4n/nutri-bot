// HU-016: identidad de la profesional en PDF y portal (título, matrícula, firma) y validación de las
// imágenes que van en los PDF (firma y logo). Lógica pura: sin base ni red.

export type ProfessionalIdentity = { title: string | null; name: string; licenseNumber: string | null };

/** Textos de la HU-016 (sección 8.4 de la SDD) y del arreglo del logo (sección 16, P4). */
export const PROFESSIONAL_TEXT = {
  cardDescription:
    "Tu título, matrícula y firma aparecen en el informe antropométrico, y tu título y matrícula en el portal del paciente.",
  uploadTitle: "Imagen de la firma",
  uploadHelp:
    "Firmá en una hoja blanca, sacale una foto o escaneala y recortala dejando solo la firma. Mejor en PNG con fondo transparente.",
  uploadLimits: "PNG o JPG, hasta 1 MB.",
  emptyBox: "Sin firma",
  previewError: "No se pudo cargar la vista previa",
  uploadButton: "Subir firma",
  uploading: "Subiendo…",
  removeButton: "Quitar",
  removing: "Quitando…",
  removeConfirmTitle: "¿Quitar tu firma?",
  removeConfirmDescription: "Los próximos PDF salen sin firma.",
  previewLabel: "Así se ve al final de tus PDF",
  signatureEmpty: "Elegí una imagen",
  signatureInvalidFormat: "Formato inválido (usá PNG o JPG)",
  signatureTooLarge: "La imagen pesa más de 1 MB",
  signatureUploaded: "Firma actualizada",
  signatureRemoved: "Firma quitada",
  signatureSaveError: "No se pudo guardar la firma. Probá de nuevo.",
  signatureRemoveError: "No se pudo quitar la firma. Probá de nuevo.",
  sessionExpired: "Tu sesión venció. Volvé a entrar.",
  noticeLicense: "Tu matrícula no está cargada. Completala en Ajustes para que aparezca en tus PDF.",
  noticeSignature: "Tu firma no está cargada. Subila en Ajustes para que aparezca en tus PDF.",
  noticeBoth:
    "Tu matrícula y tu firma no están cargadas. Completalas en Ajustes para que aparezcan en tus PDF.",
  // Sección 16 (P4): logo solo PNG/JPG.
  logoDescription: "Este logo aparece en los PDFs de los planes e informes que le enviás a tus pacientes.",
  logoLimits: "PNG o JPG, hasta 2 MB.",
  logoTooLarge: "La imagen pesa más de 2 MB",
  logoUnsupportedFormat: "Tu logo está en un formato que no sale en los PDF. Volvé a subirlo en PNG o JPG.",
} as const;

function clean(s: string | null | undefined): string {
  return s?.trim() ?? "";
}

/** "Lic. Daiana Ponce"; sin título (null, "" o espacios) → "Daiana Ponce". Hace trim de cada parte. */
export function professionalDisplayName(p: { title: string | null; name: string }): string {
  return [clean(p.title), clean(p.name)].filter((s) => s !== "").join(" ");
}

/** "Lic. Ana Pérez · M.P. 123"; sin título: "Ana Pérez · M.P. 123"; sin matrícula: "Lic. Ana Pérez". */
export function professionalSignature(p: ProfessionalIdentity): string {
  const who = professionalDisplayName(p);
  const license = clean(p.licenseNumber);
  return license === "" ? who : `${who} · ${license}`;
}

/** Aclaración del bloque de firma (D7): { nameLine: "Lic. Daiana Ponce", licenseLine: "M.P. 852" }.
 *  Matrícula null/""/espacios → licenseLine null. */
export function professionalSignatureLines(p: ProfessionalIdentity): { nameLine: string; licenseLine: string | null } {
  const license = clean(p.licenseNumber);
  return { nameLine: professionalDisplayName(p), licenseLine: license === "" ? null : license };
}

// --- Imágenes de los PDF (firma y logo) ---------------------------------------------------------

export const SIGNATURE_IMAGE_MAX_BYTES = 1024 * 1024; // 1 MB = 1.048.576 bytes (inclusive)
/** Sección 16 (P4): el logo conserva su tope de 2 MB; cambia solo la validación de formato. */
export const LOGO_IMAGE_MAX_BYTES = 2 * 1024 * 1024;

export type SignatureImageMime = "image/png" | "image/jpeg";
/** Formatos que @react-pdf/renderer dibuja. */
export type PdfImageMime = SignatureImageMime;

const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const JPEG_MAGIC = [0xff, 0xd8, 0xff];

function startsWith(bytes: Uint8Array, magic: number[]): boolean {
  return bytes.length >= magic.length && magic.every((b, i) => bytes[i] === b);
}

/** Tipo real por magic bytes. PNG: 89 50 4E 47 0D 0A 1A 0A. JPEG: FF D8 FF. Cualquier otra cosa → null. */
export function detectSignatureImageMime(bytes: Uint8Array): SignatureImageMime | null {
  if (startsWith(bytes, PNG_MAGIC)) return "image/png";
  if (startsWith(bytes, JPEG_MAGIC)) return "image/jpeg";
  return null;
}

/** true si react-pdf puede dibujar una imagen guardada con este MIME (PNG o JPG). */
export function isPdfDrawableImageMime(mime: string | null | undefined): mime is PdfImageMime {
  return mime === "image/png" || mime === "image/jpeg";
}

type ImageRules = { maxBytes: number; tooLarge: string };
const SIGNATURE_RULES: ImageRules = { maxBytes: SIGNATURE_IMAGE_MAX_BYTES, tooLarge: PROFESSIONAL_TEXT.signatureTooLarge };
const LOGO_RULES: ImageRules = { maxBytes: LOGO_IMAGE_MAX_BYTES, tooLarge: PROFESSIONAL_TEXT.logoTooLarge };

function sizeError(size: number, rules: ImageRules): string | null {
  if (size <= 0) return PROFESSIONAL_TEXT.signatureEmpty;
  if (size > rules.maxBytes) return rules.tooLarge;
  return null;
}

/** Validación común de firma y logo. Orden: vacío → tamaño → tipo (por magic bytes). */
function validatePdfImage(
  bytes: Uint8Array,
  rules: ImageRules,
): { ok: true; mimeType: SignatureImageMime } | { ok: false; error: string } {
  const error = sizeError(bytes.length, rules);
  if (error) return { ok: false, error };
  const mimeType = detectSignatureImageMime(bytes);
  if (!mimeType) return { ok: false, error: PROFESSIONAL_TEXT.signatureInvalidFormat };
  return { ok: true, mimeType };
}

/** Orden: vacío → tamaño → tipo. Usa los textos de PROFESSIONAL_TEXT. */
export function validateSignatureImage(
  bytes: Uint8Array,
): { ok: true; mimeType: SignatureImageMime } | { ok: false; error: string } {
  return validatePdfImage(bytes, SIGNATURE_RULES);
}

/** Pre-chequeo sin leer el archivo (lo usan el cliente y la action antes de arrayBuffer()). */
export function signatureImageSizeError(size: number): string | null {
  return sizeError(size, SIGNATURE_RULES);
}

/** Sección 16 (P4): mismo helper que la firma, con el tope de 2 MB del logo. */
export function validateLogoImage(
  bytes: Uint8Array,
): { ok: true; mimeType: SignatureImageMime } | { ok: false; error: string } {
  return validatePdfImage(bytes, LOGO_RULES);
}

/** Pre-chequeo del logo sin leer el archivo. */
export function logoImageSizeError(size: number): string | null {
  return sizeError(size, LOGO_RULES);
}

/** Sección 16 (P4): aviso de la tarjeta del logo si el guardado no sale en los PDF (p. ej. WEBP).
 *  Sin logo (mime null) → null. */
export function professionalLogoNotice(logoMimeType: string | null): string | null {
  if (logoMimeType === null || logoMimeType === "") return null;
  return isPdfDrawableImageMime(logoMimeType) ? null : PROFESSIONAL_TEXT.logoUnsupportedFormat;
}

/** Aviso único de la página del informe (D8). null si no falta nada. */
export function professionalDataMissingNotice(p: { licenseMissing: boolean; signatureMissing: boolean }): string | null {
  if (p.licenseMissing && p.signatureMissing) return PROFESSIONAL_TEXT.noticeBoth;
  if (p.licenseMissing) return PROFESSIONAL_TEXT.noticeLicense;
  if (p.signatureMissing) return PROFESSIONAL_TEXT.noticeSignature;
  return null;
}
