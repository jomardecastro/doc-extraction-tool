import type { Confidence } from "@det/shared";
import type { ExtractedDocument } from "../pdf/index.js";
import { containsNumber, normalizeText, squash } from "./normalize.js";

/**
 * The zero-false-positive guarantee, implemented without the model's help.
 *
 * Every item the model returns carries a verbatim quote and a page. Here that claim is checked
 * against the text actually extracted from the PDF:
 *  - the quote must be found on the claimed page (or a neighbour; page breaks are fuzzy), else
 *    anywhere in the document (the page is then corrected), else the item is dropped;
 *  - every number in the item must be written in the quote or on its page, else that number is
 *    nulled (the item stays: the practice is real, the figure was not);
 *  - the item's name should appear on the page; a weak match only lowers the confidence.
 *
 * Quotes are compared after normalisation (quotes, dashes, whitespace) and, failing that, with
 * punctuation stripped, which forgives hyphenated line breaks and stray spacing from the PDF.
 */

export interface PageText {
  pageNumber: number;
  norm: string;
  squashed: string;
}

export interface VerifyStats {
  kept: number;
  dropped: number;
  pageCorrected: number;
  numbersNulled: number;
  downgraded: number;
}

interface ProvenanceLike {
  name: string;
  page: number;
  sourceQuote: string;
  confidence: Confidence;
}

/** Text of every page, including administrative ones: a quote from a cover page is still a real quote. */
export function pageTexts(doc: ExtractedDocument): PageText[] {
  return doc.pages.map((page) => {
    const raw = page.blocks
      .map((b) => (b.rows ? b.rows.map((r) => r.join(" ")).join(" ") : b.text))
      .join(" ");
    return { pageNumber: page.pageNumber, norm: normalizeText(raw), squashed: squash(raw) };
  });
}

export function verifyItems<T extends ProvenanceLike>(
  items: T[],
  pages: PageText[],
  numericFields: string[],
): { items: Array<T & { verified: true }>; stats: VerifyStats } {
  const stats: VerifyStats = {
    kept: 0,
    dropped: 0,
    pageCorrected: 0,
    numbersNulled: 0,
    downgraded: 0,
  };
  const byNumber = new Map(pages.map((p) => [p.pageNumber, p]));
  const kept: Array<T & { verified: true }> = [];

  for (const item of items) {
    const quote = cleanQuote(item.sourceQuote);
    if (quote.length < 8) {
      stats.dropped++;
      continue;
    }
    const located = locateQuote(quote, item.page, pages, byNumber);
    if (!located) {
      stats.dropped++;
      continue;
    }
    if (located.pageNumber !== item.page) stats.pageCorrected++;

    const verified = { ...item, page: located.pageNumber, verified: true as const };
    for (const field of numericFields) {
      const value = getPath(verified, field);
      if (typeof value !== "number") continue;
      if (!containsNumber(quote, value) && !containsNumber(located.norm, value)) {
        setPath(verified, field, null);
        stats.numbersNulled++;
      }
    }

    const nameMatch = nameSupport(item.name, quote, located);
    if (nameMatch < 1) {
      verified.confidence = nameMatch >= 0.6 ? downgrade(verified.confidence) : "low";
      stats.downgraded++;
    }

    kept.push(verified);
    stats.kept++;
  }
  return { items: kept, stats };
}

/** Strip wrapping quotes, bullets and ellipses the model sometimes adds around a quote. */
function cleanQuote(quote: string): string {
  return normalizeText(quote)
    .replace(/^["'“”‘’\s.…-]+/, "")
    .replace(/["'“”‘’\s.…-]+$/, "")
    .trim();
}

function locateQuote(
  quote: string,
  claimedPage: number,
  pages: PageText[],
  byNumber: Map<number, PageText>,
): PageText | null {
  const squashed = squash(quote);
  const nearby = [claimedPage, claimedPage - 1, claimedPage + 1]
    .map((n) => byNumber.get(n))
    .filter((p): p is PageText => p !== undefined);
  for (const page of nearby) if (page.norm.includes(quote)) return page;
  for (const page of nearby)
    if (squashed.length >= 12 && page.squashed.includes(squashed)) return page;
  for (const page of pages) if (page.norm.includes(quote)) return page;
  for (const page of pages)
    if (squashed.length >= 12 && page.squashed.includes(squashed)) return page;
  return null;
}

/** 1 when the name appears verbatim; otherwise the share of its content words found on the page. */
function nameSupport(name: string, quote: string, page: PageText): number {
  const norm = normalizeText(name);
  if (norm.length === 0) return 0;
  if (quote.includes(norm) || page.norm.includes(norm) || page.squashed.includes(squash(name)))
    return 1;
  const words = norm.split(" ").filter((w) => w.length >= 3);
  if (words.length === 0) return 0;
  const found = words.filter((w) => page.norm.includes(w)).length;
  return found / words.length;
}

function downgrade(confidence: Confidence): Confidence {
  return confidence === "high" ? "medium" : "low";
}

function getPath(obj: unknown, path: string): unknown {
  return path
    .split(".")
    .reduce<unknown>(
      (o, key) => (o && typeof o === "object" ? (o as Record<string, unknown>)[key] : undefined),
      obj,
    );
}

function setPath(obj: unknown, path: string, value: unknown): void {
  const keys = path.split(".");
  const last = keys.pop()!;
  const target = keys.reduce<unknown>(
    (o, key) => (o && typeof o === "object" ? (o as Record<string, unknown>)[key] : undefined),
    obj,
  );
  if (target && typeof target === "object") (target as Record<string, unknown>)[last] = value;
}
