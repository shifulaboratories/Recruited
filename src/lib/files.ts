/**
 * What an applicant may attach, decided from the file's own first bytes.
 * Pure: tools/rules.test.mjs loads it.
 */

export const MAX_FILE_BYTES = 10 * 1024 * 1024;
export const MAX_TOTAL_BYTES = 25 * 1024 * 1024;

const IMAGE_TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp", "image/heic"];

/** The real type of a file from its magic number, or null when it isn't one we take. */
export function sniffMime(bytes: Uint8Array): string | null {
  const b = (i: number) => bytes[i];
  const ascii = (from: number, len: number) => String.fromCharCode(...bytes.slice(from, from + len));
  if (bytes.length < 12) return null;
  if (b(0) === 0x89 && ascii(1, 3) === "PNG") return "image/png";
  if (b(0) === 0xff && b(1) === 0xd8 && b(2) === 0xff) return "image/jpeg";
  if (ascii(0, 4) === "GIF8") return "image/gif";
  if (ascii(0, 4) === "RIFF" && ascii(8, 4) === "WEBP") return "image/webp";
  if (ascii(4, 4) === "ftyp" && ["heic", "heix", "mif1", "heis"].includes(ascii(8, 4))) return "image/heic";
  if (ascii(0, 5) === "%PDF-") return "application/pdf";
  return null;
}

export function accepts(accept: "image" | "pdf" | "image_or_pdf", mime: string): boolean {
  const image = IMAGE_TYPES.includes(mime);
  const pdf = mime === "application/pdf";
  return accept === "image" ? image : accept === "pdf" ? pdf : image || pdf;
}

export function acceptLabel(accept: "image" | "pdf" | "image_or_pdf") {
  return accept === "image" ? "an image (PNG, JPEG, WebP, GIF or HEIC)" : accept === "pdf" ? "a PDF" : "an image or a PDF";
}

/** For the file input's accept attribute. A hint to the picker; the server decides. */
export function acceptAttr(accept: "image" | "pdf" | "image_or_pdf") {
  return accept === "image" ? "image/*" : accept === "pdf" ? "application/pdf" : "image/*,application/pdf";
}

/** A filename safe to store and to put in a Content-Disposition header. */
export function cleanFilename(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "";
  const cleaned = base.replace(/[^\w.\- ()]+/g, "_").replace(/^\.+/, "").slice(-120).trim();
  return cleaned || "file";
}
