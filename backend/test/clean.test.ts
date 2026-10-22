import { describe, expect, it } from "vitest";
import { cleanPages } from "../src/pdf/clean.js";
import type { Block, PageContent } from "../src/pdf/types.js";

function block(text: string, type: Block["type"] = "paragraph", extra: Partial<Block> = {}): Block {
  return {
    type,
    text,
    level: 1,
    fontSize: 12,
    bold: false,
    x0: 72,
    yTop: 0,
    yBottom: 0,
    lineCount: 1,
    ...extra,
  };
}

function page(pageNumber: number, blocks: Block[], chars = 2000): PageContent {
  return { pageNumber, role: "main", blocks, chars };
}

describe("cleanPages", () => {
  it("removes running headers, footers and page numbers that repeat across pages", () => {
    const topics = ["sediment", "nutrients", "pathogens", "monitoring"];
    const pages = [1, 2, 3, 4].map((n) =>
      page(n, [
        block("Yazoo Pass Watershed GY 21"),
        block(`Body text about ${topics[n - 1]} in the watershed.`),
        block(String(n)),
      ]),
    );
    const { pages: cleaned, droppedHeaderFooterLines } = cleanPages(pages, 12);
    expect(droppedHeaderFooterLines).toBe(8);
    for (const p of cleaned)
      expect(p.blocks.map((b) => b.text)).toEqual([expect.stringContaining("Body text")]);
  });

  it("marks cover, contents and reference material as administrative", () => {
    const pages = [
      page(
        1,
        [
          block("STEELE BAYOU WATERSHED", "heading"),
          block("Prepared for: Mississippi Department of Environmental Quality"),
        ],
        300,
      ),
      page(
        2,
        [
          block("TABLE OF CONTENTS", "heading"),
          block("Goal ........................... 15"),
          block("Participants ................... 15"),
          block("Budget ......................... 16"),
        ],
        400,
      ),
      page(3, [
        block("Introduction", "heading"),
        block("Steele Bayou drains approximately 202,617 acres."),
      ]),
      page(4, [
        block("References", "heading"),
        block("Freedman et al. 2003. Some journal."),
        block("Klapproth 2001. Another journal."),
      ]),
    ];
    const { pages: cleaned } = cleanPages(pages, 12);
    expect(cleaned.map((p) => p.role)).toEqual([
      "administrative",
      "administrative",
      "main",
      "main",
    ]);
    expect(cleaned[0]!.roleReason).toBe("cover page");
    expect(cleaned[1]!.roleReason).toBe("table of contents");
    expect(cleaned[3]!.blocks.every((b) => b.role === "administrative")).toBe(true);
  });

  it("marks pages from an Appendix title onward as supporting", () => {
    const pages = [
      page(1, [block("Introduction", "heading"), block("Main plan text.")]),
      page(
        2,
        [block("Appendix B", "heading", { fontSize: 36 }), block("Funded 319 Project Proposal")],
        200,
      ),
      page(3, [block("PROJECT TITLE:", "heading"), block("Proposal details.")]),
    ];
    const { pages: cleaned } = cleanPages(pages, 12);
    expect(cleaned.map((p) => p.role)).toEqual(["main", "supporting", "supporting"]);
  });

  it("drops contact lines inside content pages", () => {
    const pages = [
      page(1, [
        block("Introduction", "heading"),
        block("Contact Trey Cooke at 662-555-0100 or trey@example.org"),
        block("Real content about practices."),
      ]),
    ];
    const { pages: cleaned } = cleanPages(pages, 12);
    expect(cleaned[0]!.blocks[1]!.role).toBe("administrative");
    expect(cleaned[0]!.blocks[2]!.role).toBeUndefined();
  });
});
