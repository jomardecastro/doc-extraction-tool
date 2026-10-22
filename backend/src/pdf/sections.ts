import type { Category } from "@det/shared";
import type { Block, ExtractedDocument, PageContent, PageRole, Section } from "./types.js";

/**
 * Groups blocks under their headings and tags each section with the extraction categories its
 * title suggests. The tags are hints: they tell the model where to look first and let the
 * overflow chunker send only relevant sections when a document is too long for one prompt.
 */

const SECTION_TAGS: Array<[Category, RegExp]> = [
  [
    "goals",
    /\b(?:goals?|objectives?|vision|desired (?:conditions?|outcomes?|future)|targets?|purpose|mission|priorit(?:y|ies)|concerns?|issues?)\b/i,
  ],
  [
    "bmps",
    /\b(?:bmps?|best management|management (?:measures?|practices?|strateg)|conservation practices?|practices|load reductions?|nonpoint source controls?|element [bc]\b|treatment|restoration|structural|nutrient management|sediment control|pollutant reduction|critical areas?)/i,
  ],
  [
    "implementation",
    /\b(?:implementation|schedule|milestones?|action (?:items?|plans?)|strateg(?:y|ies)|tasks?|work plan|budget|costs?|funding|financial|technical (?:and financial )?assistance|element [dfg]\b|partners?|responsib|timeline|phases?)/i,
  ],
  [
    "monitoring",
    /\b(?:monitor(?:ing)?|criteria|indicators?|evaluation|assessment|measur(?:es?|ing) success|water quality (?:data|standards?|status|conditions?)|element [hi]\b|tmdls?|impairments?|sampling|tracking|progress|adaptive management|success)/i,
  ],
  [
    "outreach",
    /\b(?:education(?:al)?|outreach|public (?:participation|involvement|awareness|meetings?|input)|stakeholders?|information(?:al)?|element e\b|communications?|workshops?|awareness|landowner (?:contact|participation)|community)/i,
  ],
  [
    "geographic",
    /\b(?:watershed (?:description|characteri|overview|setting|boundar|location)|location|land ?use|land cover|hucs?|sub-?watersheds?|geograph|physical (?:setting|description|characteristics)|study area|project area|description of the watershed|background|hydrolog|soils?|topograph|climate|demograph|counties|county)/i,
  ],
];

export function tagSectionTitle(title: string): Category[] {
  const tags: Category[] = [];
  for (const [category, re] of SECTION_TAGS) if (re.test(title)) tags.push(category);
  return tags;
}

export function buildSections(pages: PageContent[]): Section[] {
  const sections: Section[] = [];
  let current: Section | null = null;
  const open = (title: string, level: number, page: PageContent, role: PageRole) => {
    current = {
      id: `s${sections.length + 1}`,
      title,
      level,
      pageStart: page.pageNumber,
      pageEnd: page.pageNumber,
      tags: tagSectionTitle(title),
      role,
    };
    sections.push(current);
    return current;
  };

  for (const page of pages) {
    for (const block of page.blocks) {
      const role = block.role ?? page.role;
      if (block.type === "heading") {
        block.sectionId = open(block.text, block.level, page, role).id;
        continue;
      }
      if (!current) open("Front matter", 1, page, role);
      block.sectionId = current!.id;
      current!.pageEnd = page.pageNumber;
    }
  }
  return sections;
}

export interface SerializeOptions {
  /** Page/block roles to include. Defaults to main + supporting (administrative text never reaches the model). */
  roles?: PageRole[];
  /** When set, only sections carrying one of these tags (plus untagged headings for context) are emitted. */
  categories?: Category[];
  /** Only these pages. */
  pages?: Set<number>;
}

/**
 * Renders the document for the model as page-tagged plain text. Headings become `#` lines, bullets
 * keep their nesting as indentation, tables are pipe-separated rows inside `[table]` markers.
 * Each page carries the section it sits in and that section's tags, which is how the model learns
 * page numbers (for provenance) and context (for "what kind of statement is this") at once.
 */
export function serializeDocument(doc: ExtractedDocument, options: SerializeOptions = {}): string {
  const roles = new Set<PageRole>(options.roles ?? ["main", "supporting"]);
  const wanted = options.categories ? new Set(options.categories) : null;
  const sectionById = new Map(doc.sections.map((s) => [s.id, s]));
  const out: string[] = [];

  for (const page of doc.pages) {
    if (options.pages && !options.pages.has(page.pageNumber)) continue;
    const lines: string[] = [];
    let pageSection: Section | undefined;
    for (const block of page.blocks) {
      const role = block.role ?? page.role;
      if (!roles.has(role)) continue;
      const section = block.sectionId ? sectionById.get(block.sectionId) : undefined;
      if (wanted && section && block.type !== "heading" && !section.tags.some((t) => wanted.has(t)))
        continue;
      pageSection ??= section;
      lines.push(renderBlock(block));
    }
    if (lines.length === 0) continue;
    const attrs = [`n="${page.pageNumber}"`];
    if (pageSection) {
      attrs.push(`section="${escapeAttr(pageSection.title)}"`);
      if (pageSection.tags.length) attrs.push(`tags="${pageSection.tags.join(",")}"`);
    }
    if (page.role === "supporting") attrs.push('part="appendix"');
    out.push(`<page ${attrs.join(" ")}>\n${lines.join("\n\n")}\n</page>`);
  }
  return out.join("\n\n");
}

function renderBlock(block: Block): string {
  switch (block.type) {
    case "heading":
      return `${"#".repeat(Math.min(3, Math.max(1, block.level)))} ${block.text}`;
    case "bullet":
      return `${"  ".repeat(block.level)}- ${block.text}`;
    case "table":
      return `[table]\n${block.text}\n[/table]`;
    default:
      return block.text;
  }
}

function escapeAttr(value: string): string {
  return value.replace(/["<>]/g, " ").replace(/\s+/g, " ").trim().slice(0, 100);
}
