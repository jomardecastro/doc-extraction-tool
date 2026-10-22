import type { Block, RawPage, TextItem } from "./types.js";

/**
 * Rebuilds lines, paragraphs, bullets, headings and simple tables from pdf.js text runs.
 *
 * pdf.js only gives positioned fragments; document structure has to be inferred from geometry:
 * baseline grouping for lines, font size and font resource for headings, leading glyphs and
 * indentation for bullets, column alignment for tables, and vertical spacing for paragraphs.
 *
 * On font weight: with text-only extraction pdf.js never ships font programs to the caller, so
 * there is no bold flag. What it does give is the font *resource name* per run, and Word/Acrobat
 * exports use a separate resource for bold or italic text. A short line set entirely in a font
 * other than the document's body font is therefore treated as emphasised, which is how the
 * "Goal" / "Participants" / "Budget" subheadings in the older plans are recovered.
 *
 * The thresholds were tuned on the MDEQ watershed plans and kept simple on purpose, so a
 * surprising result on a new document can be traced to one rule.
 */

export interface BodyFont {
  /** Weighted mode of font sizes, rounded to half a point. */
  size: number;
  /** pdf.js resource name carrying most of the document's characters. */
  fontName: string;
  /** Share of characters set in `fontName` (0..1). Emphasis detection needs a clear majority. */
  share: number;
}

interface Cell {
  x: number;
  xEnd: number;
  text: string;
}

interface Line {
  text: string;
  cells: Cell[];
  x0: number;
  x1: number;
  y: number;
  fontSize: number;
  /** Set entirely (>= 80% of characters) in a font other than the body font. */
  emphasized: boolean;
}

/** Leading list markers: typographic bullets, Symbol/Wingdings private-use glyphs, "1." "a)" "iv." */
const BULLET_RE =
  /^(?:[•◦▪●○■□♦➢➤►▶→✓·−\-–—*]|[-]|o(?=\s)|\(?\d{1,3}[.)]|\(?[a-zA-Z][.)]|\(?[ivxIVX]{1,6}[.)])\s+/;
/** "3.2 Management Measures", "Element c:", "Section 4", "B. Monitoring", "IV. Goals" */
const NUMBERED_HEADING_RE =
  /^(?:\d{1,2}(?:\.\d{1,2}){0,3}\.?|[A-Z]\.|[IVX]{1,5}\.|(?:Section|Chapter|Element|Part|Step|Phase|Task|Goal|Objective)\s+[A-Za-z0-9]{1,3}[.:]?)\s+[A-Z(]/;
const TOC_LEADER_RE = /(?:\.\s?){3,}\s*\d{1,3}\s*$/;
/** A line ending in a function word is mid-sentence, not a heading. */
const TRAILING_FUNCTION_WORD_RE =
  /\b(?:shall|will|is|are|was|were|to|of|and|or|the|a|an|in|on|for|with|by|that|which)\s*$/i;
/** Figure/table captions are labels, not section headings, even when set in bold. */
const CAPTION_RE = /^(?:figure|fig\.|table|map|photo|chart|exhibit|plate|graph)\s*\d+[a-z]?\b/i;

export function estimateBodyFont(pages: RawPage[]): BodyFont {
  const sizes = new Map<number, number>();
  const fonts = new Map<string, number>();
  let total = 0;
  for (const page of pages) {
    for (const item of page.items) {
      const chars = item.str.replace(/\s/g, "").length;
      if (chars === 0) continue;
      total += chars;
      fonts.set(item.fontName, (fonts.get(item.fontName) ?? 0) + chars);
      if (item.fontSize > 0) {
        const key = Math.round(item.fontSize * 2) / 2;
        sizes.set(key, (sizes.get(key) ?? 0) + chars);
      }
    }
  }
  const size = argmax(sizes) ?? 11;
  const fontName = argmax(fonts) ?? "";
  return { size, fontName, share: total > 0 ? (fonts.get(fontName) ?? 0) / total : 0 };
}

export function buildBlocks(page: RawPage, body: BodyFont): Block[] {
  const lines = groupLines(page.items, body);
  if (lines.length === 0) return [];
  const leftMargin = percentile(
    lines.map((l) => l.x0),
    0.1,
  );
  // Double-spaced documents are common among the older plans: the typical gap between body
  // lines decides what "the next line of the same paragraph" looks like, not a fixed multiple
  // of the font size.
  const lineGap = typicalLineGap(lines, body);
  // Usable text width comes from the page box, not from the lines on this page: a page holding
  // three short centred lines would otherwise make every line look "full width".
  const textWidth = Math.max(page.width - 2 * leftMargin, 0.5 * page.width);
  const tables = detectTables(lines);
  return assembleBlocks(lines, tables, body, leftMargin, textWidth, lineGap);
}

/** Median baseline distance between consecutive body-size lines on the page, in points. */
export function typicalLineGap(lines: Line[], body: BodyFont): number {
  const gaps: number[] = [];
  for (let i = 1; i < lines.length; i++) {
    const a = lines[i - 1]!;
    const b = lines[i]!;
    if (Math.abs(a.fontSize - body.size) > 1 || Math.abs(b.fontSize - body.size) > 1) continue;
    const gap = a.y - b.y;
    if (gap > 0 && gap < 4 * body.size) gaps.push(gap);
  }
  if (gaps.length < 3) return 1.25 * body.size;
  gaps.sort((x, y) => x - y);
  return gaps[Math.floor(gaps.length / 2)]!;
}

// ---------------------------------------------------------------------------------------------
// Lines

function groupLines(items: TextItem[], body: BodyFont): Line[] {
  const sorted = [...items].sort((a, b) => b.y - a.y || a.x - b.x);
  const groups: TextItem[][] = [];
  for (const item of sorted) {
    const current = groups[groups.length - 1];
    if (current) {
      const ref = current[0]!;
      const dy = Math.abs(item.y - ref.y);
      const tolerance = Math.max(2, 0.35 * Math.max(ref.fontSize, item.fontSize));
      // Superscripts ("4th", footnote marks) sit above the baseline in a smaller size; keep them
      // on the line they belong to instead of spawning a one-glyph line. Items arrive top-down,
      // so the superscript is usually the group's reference and the baseline text follows it.
      const superscript =
        Math.min(item.fontSize, ref.fontSize) < 0.8 * body.size && dy < 0.7 * body.size;
      if (dy <= tolerance || superscript) {
        current.push(item);
        continue;
      }
    }
    groups.push([item]);
  }
  return groups.map((g) => toLine(g, body)).filter((l) => l.text.length > 0);
}

function toLine(items: TextItem[], body: BodyFont): Line {
  items.sort((a, b) => a.x - b.x);
  const fontSize = Math.max(...items.map((i) => i.fontSize));
  let totalChars = 0;
  let otherFontChars = 0;
  for (const item of items) {
    const chars = item.str.replace(/\s/g, "").length;
    totalChars += chars;
    if (item.fontName !== body.fontName) otherFontChars += chars;
  }

  const cells: Cell[] = [];
  let text = "";
  let cellText = "";
  let cellX = items[0]!.x;
  let prevEnd: number | null = null;
  for (const item of items) {
    if (item.str.trim().length === 0) {
      // pdf.js emits whitespace runs that can be as wide as a whole table gap; they must not
      // advance the measured end of the previous word or the column gap disappears.
      if (!text.endsWith(" ")) {
        text += " ";
        cellText += " ";
      }
      continue;
    }
    const gap = prevEnd === null ? 0 : item.x - prevEnd;
    const size = item.fontSize || fontSize;
    if (prevEnd !== null && gap > 1.0 * size && cellText.trim().length > 0) {
      // A gap of a full em or more is a column boundary; word spacing in prose is a fraction of that.
      cells.push({ x: cellX, xEnd: prevEnd, text: cellText.trim() });
      cellText = "";
      cellX = item.x;
      if (!text.endsWith(" ")) text += " ";
    } else if (prevEnd !== null && gap > 0.2 * size && !text.endsWith(" ")) {
      text += " ";
      cellText += " ";
    }
    text += item.str;
    cellText += item.str;
    prevEnd = item.x + item.width;
  }
  if (cellText.trim().length > 0)
    cells.push({ x: cellX, xEnd: prevEnd ?? cellX, text: cellText.trim() });

  return {
    text: text.replace(/\s+/g, " ").trim(),
    cells,
    x0: items[0]!.x,
    x1: prevEnd ?? items[0]!.x,
    y: items[0]!.y,
    fontSize,
    emphasized: body.share >= 0.5 && totalChars > 0 && otherFontChars / totalChars >= 0.8,
  };
}

// ---------------------------------------------------------------------------------------------
// Tables

/** A detected table: which lines it spans and the rows rebuilt column by column. */
interface TableSpan {
  start: number;
  end: number; // exclusive
  rows: string[][];
}

const COLUMN_TOLERANCE = 8;

/**
 * Tables are found by column alignment. Consecutive lines that split into two or more cells whose
 * edges line up with the previous line are "anchor rows"; prose with one wide gap never repeats
 * the same column positions line after line, so alignment is a safe signal. Both edges are
 * compared because numeric columns are right-aligned.
 *
 * Word tables wrap long cell text onto extra lines, which arrive as one-cell lines sitting under
 * a known column. Those are folded back into the cell they belong to, so a milestone table reads
 * "task | outcome | months" per row instead of interleaving three columns of fragments.
 */
function detectTables(lines: Line[]): TableSpan[] {
  const tables: TableSpan[] = [];
  let i = 0;
  while (i < lines.length) {
    const first = lines[i]!;
    if (first.cells.length < 2) {
      i++;
      continue;
    }
    // Columns are seeded from the first candidate line and extended as rows add new cell positions.
    const columns: Cell[] = [...first.cells];
    const rows: string[][] = [first.cells.map((c) => c.text)];
    const rowCols: number[][] = [first.cells.map((_, k) => k)];
    let anchors = 1;
    let wideAnchors = first.cells.length >= 3 ? 1 : 0;
    // A row whose first cell wrapped before its other cells appeared ("Water Diversion Pads" /
    // "(feet) | $3 | 1000 | $3,000"). It is completed by the next anchor line.
    let pendingRow = -1;
    let prev = first;
    let j = i + 1;
    for (; j < lines.length; j++) {
      const line = lines[j]!;
      const gap = prev.y - line.y;
      if (gap > 4 * line.fontSize) break;
      const matches = line.cells.map((c) => columnIndex(columns, c));
      const matched = matches.filter((m) => m >= 0).length;
      const isAnchor = line.cells.length >= 2 && matched >= 2;
      // A continuation line has fewer cells than the table, every cell under a known column and
      // staying inside that column (a paragraph after the table would run across the columns),
      // and sits reasonably tight under the previous line.
      const isContinuation =
        !isAnchor &&
        matched === line.cells.length &&
        line.cells.length < columns.length &&
        gap <= 2.2 * line.fontSize &&
        anchors >= 1 &&
        line.cells.every((c, k) => fitsColumn(columns, matches[k]!, c));
      if (!isAnchor && !isContinuation) break;

      const firstCol = leftmostColumn(columns);
      if (isContinuation) {
        const lastRow = rows[rows.length - 1]!;
        const lastCols = rowCols[rowCols.length - 1]!;
        const cell = line.cells[0]!;
        const prevFirstCell = lastRow[lastCols.indexOf(firstCol)] ?? "";
        if (
          line.cells.length === 1 &&
          matches[0] === firstCol &&
          pendingRow < 0 &&
          !continuesText(prevFirstCell, cell.text)
        ) {
          rows.push([cell.text]);
          rowCols.push([firstCol]);
          pendingRow = rows.length - 1;
        } else {
          line.cells.forEach((c, k) => {
            const col = matches[k]!;
            const at = lastCols.indexOf(col);
            if (at >= 0) lastRow[at] = joinLines(lastRow[at]!, c.text);
            else {
              lastCols.push(col);
              lastRow.push(c.text);
            }
          });
        }
      } else {
        anchors++;
        if (line.cells.length >= 3) wideAnchors++;
        const cols: number[] = [];
        const row: string[] = [];
        line.cells.forEach((cell, k) => {
          let col = matches[k]!;
          if (col < 0) {
            columns.push(cell);
            col = columns.length - 1;
          }
          cols.push(col);
          row.push(cell.text);
        });
        // A one-cell line inside a table is almost always a wrapped first cell ("Chemical Oxygen"
        // / "Demand | <50 mg/l"), so it is completed by the next row's short first cell. A group
        // header ("Education/Outreach") merges too, which only costs a slightly longer label.
        if (
          pendingRow >= 0 &&
          cols[0] === firstCol &&
          (startsLikeContinuation(row[0]!) || wordCount(row[0]!) <= 3)
        ) {
          // The pending first cell's second line arrived together with the rest of the row.
          const target = rows[pendingRow]!;
          const targetCols = rowCols[pendingRow]!;
          target[0] = joinLines(target[0]!, row[0]!);
          for (let k = 1; k < row.length; k++) {
            targetCols.push(cols[k]!);
            target.push(row[k]!);
          }
        } else {
          rows.push(row);
          rowCols.push(cols);
        }
        pendingRow = -1;
      }
      prev = line;
    }
    const confirmed = anchors >= 3 || wideAnchors >= 2;
    if (confirmed) {
      tables.push({ start: i, end: j, rows: orderRows(rows, rowCols, columns) });
      i = j;
    } else {
      i++;
    }
  }
  return tables;
}

/** A cell belongs to its column only if it ends before the next column to the right begins. */
function fitsColumn(columns: Cell[], col: number, cell: Cell): boolean {
  const x = columns[col]!.x;
  let nextX = Infinity;
  for (const c of columns) if (c.x > x + COLUMN_TOLERANCE && c.x < nextX) nextX = c.x;
  return cell.xEnd <= nextX + COLUMN_TOLERANCE;
}

function leftmostColumn(columns: Cell[]): number {
  let best = 0;
  for (let k = 1; k < columns.length; k++) if (columns[k]!.x < columns[best]!.x) best = k;
  return best;
}

/** Does `next` read as the rest of `prev`'s sentence (so it belongs to the same cell)? */
function continuesText(prev: string, next: string): boolean {
  return (
    /[,;:\-–(]$/.test(prev) || TRAILING_FUNCTION_WORD_RE.test(prev) || startsLikeContinuation(next)
  );
}

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function startsLikeContinuation(text: string): boolean {
  return /^[a-z(]/.test(text) || /^(?:and|or|of|the|in|to|for|with|per|from)\b/i.test(text);
}

function columnIndex(columns: Cell[], cell: Cell): number {
  for (let k = 0; k < columns.length; k++) {
    const col = columns[k]!;
    if (
      Math.abs(col.x - cell.x) <= COLUMN_TOLERANCE ||
      Math.abs(col.xEnd - cell.xEnd) <= COLUMN_TOLERANCE
    )
      return k;
  }
  return -1;
}

/** Lays each row out in column order (by x) so every row has the same number of cells. */
function orderRows(rows: string[][], rowCols: number[][], columns: Cell[]): string[][] {
  const order = columns.map((c, k) => ({ k, x: c.x })).sort((a, b) => a.x - b.x);
  return rows.map((row, r) => {
    const cols = rowCols[r]!;
    return order.map(({ k }) => {
      const at = cols.indexOf(k);
      return at >= 0 ? row[at]! : "";
    });
  });
}

// ---------------------------------------------------------------------------------------------
// Blocks

function assembleBlocks(
  lines: Line[],
  tables: TableSpan[],
  body: BodyFont,
  leftMargin: number,
  textWidth: number,
  lineGap: number,
): Block[] {
  // Lines closer than this continue the current paragraph; the floor keeps single-spaced
  // documents on the old rule and the ceiling stops a double-spaced page from swallowing the
  // blank line that separates its paragraphs.
  const maxParagraphGap = Math.min(Math.max(1.7 * body.size, 1.4 * lineGap), 3.2 * body.size);
  const blocks: Block[] = [];
  let current: Block | null = null;
  let currentLine: Line | null = null;
  let tableAt = 0;

  const flush = () => {
    if (current) blocks.push(current);
    current = null;
    currentLine = null;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;

    const table = tables[tableAt];
    if (table && i === table.start) {
      flush();
      const block = makeBlock("table", line, 0);
      block.rows = table.rows;
      block.text = table.rows.map((r) => r.join(" | ")).join("\n");
      block.lineCount = table.end - table.start;
      block.yBottom = lines[table.end - 1]!.y;
      blocks.push(block);
      i = table.end - 1;
      tableAt++;
      continue;
    }

    const kind = classifyLine(lines, i, body, leftMargin, textWidth);

    if (kind.type === "heading") {
      flush();
      current = makeBlock("heading", line, kind.level);
      flush();
      continue;
    }

    if (kind.type === "bullet") {
      flush();
      current = makeBlock("bullet", line, bulletLevel(line.x0, leftMargin, body.size));
      current.text = line.text.slice(kind.markerLength).trim();
      currentLine = line;
      continue;
    }

    // Continuation of the previous paragraph or bullet?
    if (current && currentLine && (current.type === "paragraph" || current.type === "bullet")) {
      const gap = currentLine.y - line.y;
      const sameSize = Math.abs(currentLine.fontSize - line.fontSize) <= 1;
      const indentOk =
        current.type === "bullet"
          ? line.x0 >= current.x0 - 2 && line.x0 <= current.x0 + 4 * body.size
          : Math.abs(line.x0 - current.x0) <= 3 ||
            (current.lineCount === 1 &&
              line.x0 < current.x0 &&
              current.x0 - line.x0 <= 4 * body.size);
      if (
        gap > 0 &&
        gap <= Math.max(maxParagraphGap, 1.7 * line.fontSize) &&
        sameSize &&
        indentOk
      ) {
        current.text = joinLines(current.text, line.text);
        current.lineCount++;
        current.yBottom = line.y;
        // A paragraph's left edge is its body indent, not the first line's indent.
        if (current.type === "paragraph" && line.x0 < current.x0) current.x0 = line.x0;
        currentLine = line;
        continue;
      }
    }

    flush();
    current = makeBlock("paragraph", line, 0);
    currentLine = line;
  }
  flush();
  return blocks;
}

type LineKind =
  { type: "heading"; level: number } | { type: "bullet"; markerLength: number } | { type: "text" };

function classifyLine(
  lines: Line[],
  i: number,
  body: BodyFont,
  leftMargin: number,
  textWidth: number,
): LineKind {
  const line = lines[i]!;
  const text = line.text;
  if (CAPTION_RE.test(text)) return { type: "text" };
  const bullet = BULLET_RE.exec(text);
  const numberedHeading = isNumberedHeading(text);

  // "1. Upon approval of the plan, the grantee shall..." is a list item; "3. Monitoring" is a heading.
  if (bullet && text.length > bullet[0].length && !numberedHeading) {
    return { type: "bullet", markerLength: bullet[0].length };
  }
  if (numberedHeading) return { type: "heading", level: headingLevel(line, body) };

  // A short emphasised line next to a full-width emphasised line is a wrapped line of a bold
  // paragraph (a quoted mission statement, say), not a subheading.
  const fullWidth = (l: Line) => l.x1 - leftMargin >= 0.8 * textWidth;
  const tight = (a: Line, b: Line) => Math.abs(a.y - b.y) <= 1.5 * Math.max(a.fontSize, b.fontSize);
  const prev = lines[i - 1];
  const next = lines[i + 1];
  const inEmphasizedParagraph =
    line.emphasized &&
    (fullWidth(line) ||
      (prev !== undefined && prev.emphasized && fullWidth(prev) && tight(prev, line)) ||
      (next !== undefined && next.emphasized && fullWidth(next) && tight(line, next)));

  if (!inEmphasizedParagraph && looksLikeHeading(line, body))
    return { type: "heading", level: headingLevel(line, body) };
  return { type: "text" };
}

function isNumberedHeading(text: string): boolean {
  if (!NUMBERED_HEADING_RE.test(text)) return false;
  if (text.length > 70 || TOC_LEADER_RE.test(text)) return false;
  // "7. Conduct inspections of BMPs during construction (Months 3-36)" is a list item.
  if (/[,;]/.test(text) || /[.;,)]$/.test(text)) return false;
  if (TRAILING_FUNCTION_WORD_RE.test(text)) return false;
  return text.split(/\s+/).length <= 12;
}

function looksLikeHeading(line: Line, body: BodyFont): boolean {
  const text = line.text;
  if (text.length > 120 || line.cells.length >= 3) return false;
  if (TOC_LEADER_RE.test(text) || /[.;,]$/.test(text)) return false;
  if (TRAILING_FUNCTION_WORD_RE.test(text)) return false;
  const words = text.split(/\s+/).length;
  const letters = text.replace(/[^A-Za-z]/g, "");
  if (letters.length < 3) return false;
  if (line.fontSize >= 1.15 * body.size && words <= 20) return true;
  if (line.emphasized && words <= 14 && text.length <= 90) return true;
  // ALL CAPS short lines ("WATERSHED IMPLEMENTATION PLAN", "ELEMENT C")
  if (letters.length >= 4 && letters === letters.toUpperCase() && words <= 12 && text.length <= 80)
    return true;
  return false;
}

function headingLevel(line: Line, body: BodyFont): number {
  const numbered = /^(\d{1,2}(?:\.\d{1,2}){0,3})\.?\s/.exec(line.text);
  if (numbered) return Math.min(3, numbered[1]!.split(".").length);
  if (line.fontSize >= 1.5 * body.size) return 1;
  if (line.fontSize >= 1.25 * body.size) return 2;
  return 3;
}

function bulletLevel(x0: number, leftMargin: number, bodySize: number): number {
  const indent = Math.max(0, x0 - leftMargin);
  return Math.min(3, Math.round(indent / (1.8 * bodySize)));
}

function makeBlock(type: Block["type"], line: Line, level: number): Block {
  return {
    type,
    text: line.text,
    level,
    fontSize: line.fontSize,
    bold: line.emphasized,
    x0: line.x0,
    yTop: line.y,
    yBottom: line.y,
    lineCount: 1,
  };
}

/** Joins wrapped lines, repairing end-of-line hyphenation ("imple-" + "mentation"). */
function joinLines(a: string, b: string): string {
  if (/[A-Za-z]-$/.test(a) && /^[a-z]/.test(b)) return a.slice(0, -1) + b;
  return `${a} ${b}`;
}

function argmax<K>(counts: Map<K, number>): K | undefined {
  let best: K | undefined;
  let bestWeight = -1;
  for (const [key, weight] of counts) {
    if (weight > bestWeight) {
      best = key;
      bestWeight = weight;
    }
  }
  return best;
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))]!;
}
