import type { Block, PageContent, PageRole } from "./types.js";

/**
 * Removes text that is not document content and labels pages/blocks that should not be mined:
 *
 * - running headers and footers (the same short line at the top or bottom of many pages),
 * - page numbers, table-of-contents pages, reference lists,
 * - administrative pages: cover, "prepared for/by", acknowledgements, acronym lists, glossary,
 * - contact details and other boilerplate lines inside otherwise useful pages,
 * - appendices, which are kept but labelled `supporting` so the model can weigh them lower.
 *
 * Everything is a heuristic on text and position; each rule is small and documented so a
 * surprising result on a new document can be traced to one line.
 */

export interface CleanResult {
  pages: PageContent[];
  droppedHeaderFooterLines: number;
  droppedBlocks: number;
}

const PAGE_NUMBER_RE = /^\s*(?:page\s+)?\d{1,4}(?:\s+of\s+\d{1,4})?\s*$|^\s*[ivxlc]{1,6}\s*$/i;
const TOC_LEADER_RE = /(?:\.\s?){3,}\s*\d{1,3}\s*$/;
/** "2.4 Water Resources 28": a contents line without leaders ends in a bare page number. */
const TOC_PAGE_NUMBER_RE = /^[A-Z0-9].{2,105}\s\d{1,3}$/;
const TOC_HEADING_RE = /^(?:table of contents|contents|list of (?:figures|tables|appendices|acronyms|abbreviations)|figures|tables)\b/i;
const COVER_MARKERS_RE =
  /\b(?:prepared (?:for|by)|submitted (?:to|by)|developed by|funded (?:by|through)|in cooperation with|grant (?:no|number|agreement)|project (?:no|number)|section 319|with (?:additional )?(?:technical )?assistance from|mississippi department of environmental quality)\b/i;
const ACK_HEADING_RE = /^(?:acknowledg(?:e)?ments?|disclaimer|executive summary disclaimer|preface|foreword|signature page|certification)\b/i;
const ADMIN_SECTION_HEADING_RE =
  /^(?:(?:list of )?(?:acronyms|abbreviations)(?: and (?:acronyms|abbreviations))?|glossary(?: of terms)?|references(?: cited)?|literature cited|bibliography|works cited|citations)\b/i;
const APPENDIX_HEADING_RE = /^(?:appendix|appendices|attachment)\b/i;
const CONTACT_RE =
  /\b(?:\(\d{3}\)\s?\d{3}[-\s]\d{4}|\d{3}[-.]\d{3}[-.]\d{4}|p\.?\s?o\.?\s?box\s+\d+|[\w.+-]+@[\w-]+\.[\w.]+|https?:\/\/\S+|www\.\S+)/i;
const FUNDING_BOILERPLATE_RE =
  /\b(?:this (?:project|document|plan|report) (?:was|has been|is) (?:funded|prepared|developed|produced)|under (?:an? )?(?:grant|agreement|contract)|u\.?s\.? environmental protection agency|section 319\(h\)|the contents of this (?:document|report)|do not necessarily reflect)\b/i;

export function cleanPages(pages: PageContent[], bodyFontSize: number): CleanResult {
  let droppedHeaderFooterLines = 0;
  let droppedBlocks = 0;

  // 1. Running headers/footers: short single-line blocks at the top or bottom of a page whose
  //    digit-insensitive text repeats on at least 30% of pages (and at least 3 pages).
  const repeats = countEdgeLines(pages);
  const threshold = Math.max(3, Math.ceil(0.3 * pages.length));
  const running = new Set([...repeats].filter(([, n]) => n >= threshold).map(([k]) => k));

  for (const page of pages) {
    const edge = edgeBlocks(page.blocks);
    page.blocks = page.blocks.filter((block) => {
      const isEdge = edge.has(block);
      if (isEdge && (running.has(normalizeEdge(block.text)) || PAGE_NUMBER_RE.test(block.text))) {
        droppedHeaderFooterLines++;
        return false;
      }
      if (block.text.replace(/[^A-Za-z0-9]/g, "").length === 0) {
        droppedBlocks++;
        return false;
      }
      return true;
    });
  }

  // 2. Page roles.
  let inAppendix = false;
  let firstMainSeen = false;
  let previousWasToc = false;
  for (const page of pages) {
    const text = page.blocks.map((b) => b.text).join("\n");
    const lines = page.blocks.flatMap((b) => b.text.split("\n"));
    const headings = page.blocks.filter((b) => b.type === "heading");

    // Table of contents: dot leaders, or (no leaders) most lines ending in a page number under a
    // "Contents" heading or continuing from a contents page. Checked before the appendix rule
    // because a TOC lists the appendices too.
    const leaderLines = lines.filter((l) => TOC_LEADER_RE.test(l)).length;
    const numberedEndLines = lines.filter((l) => l.length <= 110 && TOC_PAGE_NUMBER_RE.test(l)).length;
    const hasTocHeading = headings.some((h) => TOC_HEADING_RE.test(h.text));
    const isToc: boolean =
      lines.length > 0 &&
      (leaderLines / lines.length >= 0.4 ||
        (hasTocHeading && (leaderLines + numberedEndLines) / lines.length >= 0.2) ||
        (previousWasToc && (leaderLines + numberedEndLines) / lines.length >= 0.3));
    previousWasToc = isToc;
    if (isToc) {
      setRole(page, "administrative", "table of contents");
      continue;
    }

    // Appendices start at a page whose first heading is "Appendix X", or that carries an
    // "Appendix X" title in display size (a table from the previous page may spill above it).
    const appendixTitle = headings.find((h) => APPENDIX_HEADING_RE.test(h.text) && (h === headings[0] || h.fontSize >= 1.3 * bodyFontSize));
    if (appendixTitle) inAppendix = true;
    if (page.pageNumber === 1 && (page.chars < 1500 || COVER_MARKERS_RE.test(text)) && !hasMainHeading(headings)) {
      setRole(page, "administrative", "cover page");
      continue;
    }
    if (!firstMainSeen && page.pageNumber <= 4 && page.chars < 2500 && (COVER_MARKERS_RE.test(text) || ACK_HEADING_RE.test(headings[0]?.text ?? ""))) {
      setRole(page, "administrative", "front matter");
      continue;
    }
    if (headings.length > 0 && headings.every((h) => ACK_HEADING_RE.test(h.text)) && page.chars < 3000) {
      setRole(page, "administrative", "acknowledgements");
      continue;
    }
    firstMainSeen = true;
    setRole(page, inAppendix ? "supporting" : "main");
  }

  // 3. Block-level roles inside content pages: acronym/glossary/reference sections run from their
  //    heading to the next heading; contact and funding boilerplate lines are dropped individually.
  for (const page of pages) {
    if (page.role === "administrative") continue;
    let adminSection = false;
    for (const block of page.blocks) {
      if (block.type === "heading") {
        adminSection = ADMIN_SECTION_HEADING_RE.test(block.text);
        if (adminSection) block.role = "administrative";
        continue;
      }
      if (adminSection) {
        block.role = "administrative";
        continue;
      }
      if (block.lineCount <= 3 && block.text.length <= 240 && (CONTACT_RE.test(block.text) || FUNDING_BOILERPLATE_RE.test(block.text))) {
        block.role = "administrative";
      }
    }
    // An administrative section that started on this page continues onto the next page only
    // until that page's first heading, which the loop above handles by resetting on headings.
    // Reference lists that span pages are the common case; carry the flag over.
    if (adminSection) {
      const next = pages[pages.indexOf(page) + 1];
      if (next && next.role !== "administrative") {
        for (const block of next.blocks) {
          if (block.type === "heading") break;
          block.role = "administrative";
        }
      }
    }
  }

  return { pages, droppedHeaderFooterLines, droppedBlocks };
}

function setRole(page: PageContent, role: PageRole, reason?: string) {
  page.role = role;
  if (reason) page.roleReason = reason;
  else delete page.roleReason;
}

function hasMainHeading(headings: Block[]): boolean {
  return headings.some((h) => /^(?:\d+\.?\s|introduction|element\s+[a-i]\b|executive summary|goals?|objectives?|background|watershed description)/i.test(h.text));
}

/** The first two and last two single-line blocks on a page, where headers and footers live. */
function edgeBlocks(blocks: Block[]): Set<Block> {
  const singles = blocks.filter((b) => b.lineCount === 1 && b.text.length <= 120);
  return new Set([...singles.slice(0, 2), ...singles.slice(-2)]);
}

function normalizeEdge(text: string): string {
  return text
    .toLowerCase()
    .replace(/\d+/g, "#")
    .replace(/[^a-z#]+/g, " ")
    .trim();
}

function countEdgeLines(pages: PageContent[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const page of pages) {
    const seen = new Set<string>();
    for (const block of edgeBlocks(page.blocks)) {
      const key = normalizeEdge(block.text);
      if (key.length < 3 || seen.has(key)) continue;
      seen.add(key);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  return counts;
}
