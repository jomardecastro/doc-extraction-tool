import path from "node:path";
import { createRequire } from "node:module";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import type { PDFPageProxy } from "pdfjs-dist/types/src/display/api.js";
import { AppError } from "../errors.js";
import type { RawPage, TextItem } from "./types.js";

// pdf.js wants URL-ish directories for its bundled font and CMap data. Without them, text in
// documents that use standard 14 fonts or CID fonts can come back as empty strings in Node.
const require = createRequire(import.meta.url);
const PDFJS_DIR = path.dirname(require.resolve("pdfjs-dist/package.json"));
const STANDARD_FONT_DATA_URL = path.join(PDFJS_DIR, "standard_fonts") + path.sep;
const CMAP_URL = path.join(PDFJS_DIR, "cmaps") + path.sep;

export interface ExtractOptions {
  /** Called after each page; lets the job report progress on long documents. */
  onPage?: (done: number, total: number) => void;
}

/**
 * Pulls positioned text runs out of every page. Pages are processed one at a time and cleaned up
 * immediately, so memory stays bounded by the PDF buffer itself plus one page of text items;
 * images are never decoded because nothing is rendered.
 */
export async function extractRawPages(data: Uint8Array, options: ExtractOptions = {}): Promise<RawPage[]> {
  const task = getDocument({
    data,
    disableFontFace: true,
    useSystemFonts: false,
    standardFontDataUrl: STANDARD_FONT_DATA_URL,
    cMapUrl: CMAP_URL,
    cMapPacked: true,
    verbosity: 0,
  });

  let doc;
  try {
    doc = await task.promise;
  } catch (err) {
    throw mapPdfError(err);
  }

  try {
    const pages: RawPage[] = [];
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n);
      try {
        pages.push(await readPage(page, n));
      } catch (err) {
        throw mapPdfError(err);
      } finally {
        page.cleanup();
      }
      options.onPage?.(n, doc.numPages);
    }
    return pages;
  } finally {
    await task.destroy();
  }
}

async function readPage(page: PDFPageProxy, pageNumber: number): Promise<RawPage> {
  const viewport = page.getViewport({ scale: 1 });
  const content = await page.getTextContent({ includeMarkedContent: false });
  const items: TextItem[] = [];

  for (const item of content.items) {
    if (!("str" in item) || item.str.length === 0) continue;
    const [a, b, , , x, y] = item.transform;
    // For unrotated text the font size is the scale of the text matrix; rotated runs are rare in
    // these reports, so the hypotenuse is a fine approximation for both.
    const fontSize = Math.hypot(a ?? 0, b ?? 0) || item.height || 0;
    items.push({
      str: item.str,
      x: x ?? 0,
      y: y ?? 0,
      width: item.width,
      height: item.height,
      fontSize,
      // Text-only extraction never loads font programs, so weight is unknown here; layout.ts
      // infers emphasis from runs set in a font resource other than the body font.
      fontName: item.fontName,
      hasEOL: item.hasEOL,
    });
  }

  return { pageNumber, width: viewport.width, height: viewport.height, items };
}

function mapPdfError(err: unknown): AppError {
  if (err instanceof AppError) return err;
  const name = err instanceof Error ? err.name : "";
  const message = err instanceof Error ? err.message : String(err);
  if (name === "PasswordException") return new AppError("encrypted_pdf", undefined, { cause: err });
  if (name === "InvalidPDFException" || name === "FormatError" || name === "MissingPDFException") {
    return new AppError("pdf_parse_failed", `The file could not be read as a PDF (${message}).`, { cause: err });
  }
  return new AppError("pdf_parse_failed", `The PDF could not be processed (${message}).`, { cause: err });
}
