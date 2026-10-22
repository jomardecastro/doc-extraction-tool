import { AppError } from "../errors.js";
import { cleanPages } from "./clean.js";
import { extractRawPages, type ExtractOptions } from "./extract.js";
import { buildBlocks, estimateBodyFont } from "./layout.js";
import { buildSections } from "./sections.js";
import type { DocumentStats, ExtractedDocument, PageContent } from "./types.js";

export type { ExtractedDocument, PageContent, Section, Block, DocumentStats } from "./types.js";
export { serializeDocument, type SerializeOptions } from "./sections.js";

/**
 * PDF bytes -> structured, cleaned, sectioned document. Throws `AppError` with a user-facing code
 * for encrypted, unreadable, scanned or malformed files.
 */
export async function extractDocument(data: Uint8Array, options: ExtractOptions = {}): Promise<ExtractedDocument> {
  const raw = await extractRawPages(data, options);
  const body = estimateBodyFont(raw);

  const pages: PageContent[] = raw.map((page) => ({
    pageNumber: page.pageNumber,
    role: "main",
    blocks: buildBlocks(page, body),
    chars: page.items.reduce((n, item) => n + item.str.length, 0),
  }));

  assertReadable(pages);

  const cleaned = cleanPages(pages, body.size);
  const sections = buildSections(cleaned.pages);

  const stats: DocumentStats = {
    pageCount: pages.length,
    textChars: pages.reduce((n, p) => n + p.chars, 0),
    bodyFontSize: body.size,
    headings: countBlocks(cleaned.pages, "heading"),
    bullets: countBlocks(cleaned.pages, "bullet"),
    tables: countBlocks(cleaned.pages, "table"),
    administrativePages: cleaned.pages.filter((p) => p.role === "administrative").length,
    supportingPages: cleaned.pages.filter((p) => p.role === "supporting").length,
    droppedHeaderFooterLines: cleaned.droppedHeaderFooterLines,
    droppedBlocks: cleaned.droppedBlocks,
  };

  return { pages: cleaned.pages, sections, stats };
}

/**
 * Scanned PDFs have no text layer (near-zero characters per page); PDFs with broken font
 * encodings produce text that is mostly symbols. Both are rejected with a specific message
 * rather than sent to the model, which would otherwise invent content.
 */
function assertReadable(pages: PageContent[]): void {
  const totalChars = pages.reduce((n, p) => n + p.chars, 0);
  if (pages.length >= 3 && totalChars / pages.length < 50) throw new AppError("no_text_layer");
  if (pages.length < 3 && totalChars < 100) throw new AppError("no_text_layer");

  const sample = pages
    .map((p) => p.blocks.map((b) => b.text).join(" "))
    .join(" ")
    .slice(0, 20000);
  const alnum = (sample.match(/[A-Za-z0-9]/g) ?? []).length;
  const nonSpace = sample.replace(/\s/g, "").length;
  if (nonSpace > 200 && alnum / nonSpace < 0.6) throw new AppError("unreadable_text");
}

function countBlocks(pages: PageContent[], type: PageContent["blocks"][number]["type"]): number {
  return pages.reduce((n, p) => n + p.blocks.filter((b) => b.type === type).length, 0);
}
