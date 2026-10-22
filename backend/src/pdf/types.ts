import type { Category } from "@det/shared";

/** One positioned text run from pdf.js, in PDF user space (origin bottom-left, y grows upward). */
export interface TextItem {
  str: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize: number;
  /** pdf.js font resource name (e.g. "g_d0_f3"); differs between regular and bold/italic runs. */
  fontName: string;
  hasEOL: boolean;
}

export interface RawPage {
  pageNumber: number;
  width: number;
  height: number;
  items: TextItem[];
}

export type BlockType = "heading" | "paragraph" | "bullet" | "table";

/** Which part of the document a page or block belongs to. Only `main` and `supporting` reach the LLM. */
export type PageRole = "main" | "administrative" | "supporting";

export interface Block {
  type: BlockType;
  text: string;
  /** Heading depth (1 = largest) or bullet nesting depth (0 = top level). */
  level: number;
  fontSize: number;
  /** Set in a font other than the body font (bold or italic in practice). */
  bold: boolean;
  /** Left edge and vertical extent, used by cleaning heuristics (headers/footers, indentation). */
  x0: number;
  yTop: number;
  yBottom: number;
  lineCount: number;
  /** Table cells, rows in reading order. Present only for `table` blocks. */
  rows?: string[][];
  /** Set by the cleaner when a single block (not the whole page) is administrative. */
  role?: PageRole;
  /** Set by the section builder. */
  sectionId?: string;
}

export interface PageContent {
  pageNumber: number;
  role: PageRole;
  roleReason?: string;
  blocks: Block[];
  /** Characters of text on the page before cleaning; drives scanned-PDF detection. */
  chars: number;
}

export interface Section {
  id: string;
  title: string;
  level: number;
  pageStart: number;
  pageEnd: number;
  tags: Category[];
  role: PageRole;
}

export interface DocumentStats {
  pageCount: number;
  textChars: number;
  bodyFontSize: number;
  headings: number;
  bullets: number;
  tables: number;
  administrativePages: number;
  supportingPages: number;
  droppedHeaderFooterLines: number;
  droppedBlocks: number;
}

export interface ExtractedDocument {
  pages: PageContent[];
  sections: Section[];
  stats: DocumentStats;
}
