import { describe, expect, it } from "vitest";
import { buildBlocks, estimateBodyFont } from "../src/pdf/layout.js";
import type { RawPage, TextItem } from "../src/pdf/types.js";

/** Builds a text run; width approximates a proportional font. */
function run(str: string, x: number, y: number, options: Partial<TextItem> = {}): TextItem {
  const fontSize = options.fontSize ?? 12;
  return { str, x, y, width: str.length * fontSize * 0.5, height: fontSize, fontSize, fontName: options.fontName ?? "body", hasEOL: false, ...options };
}

function page(items: TextItem[]): RawPage {
  return { pageNumber: 1, width: 612, height: 792, items };
}

const body = { size: 12, fontName: "body", share: 0.9 };

describe("buildBlocks", () => {
  it("classifies headings by size, by font resource and by numbering", () => {
    const blocks = buildBlocks(
      page([
        run("Watershed Implementation Plan", 72, 700, { fontSize: 18 }),
        run("Participants", 72, 670, { fontName: "bold" }),
        run("3.2 Management Measures", 72, 640),
        run("The plan proposes several practices for the watershed.", 72, 610),
      ]),
      body,
    );
    expect(blocks.map((b) => b.type)).toEqual(["heading", "heading", "heading", "paragraph"]);
    expect(blocks[0]!.level).toBe(1);
    expect(blocks[2]!.level).toBe(2);
  });

  it("joins wrapped lines into one paragraph and repairs hyphenation", () => {
    const blocks = buildBlocks(
      page([
        run("Silt and soil that choke drainage stress fisheries and imple-", 72, 700),
        run("mentation of practices is needed throughout the area.", 72, 686),
      ]),
      body,
    );
    expect(blocks).toHaveLength(1);
    expect(blocks[0]!.text).toContain("implementation of practices");
  });

  it("recognises bullets and numbered list items, but not numbered headings", () => {
    const blocks = buildBlocks(
      page([
        run("− Trey Cooke, Dan Prevost", 90, 700),
        run("• Structures for Water Control (25 units minimum)", 90, 680),
        run("1. The grantee shall secure commitments from landowners within the priority area", 90, 660),
        run("2. Monitoring", 90, 640),
      ]),
      body,
    );
    expect(blocks.map((b) => b.type)).toEqual(["bullet", "bullet", "bullet", "heading"]);
    expect(blocks[0]!.text).toBe("Trey Cooke, Dan Prevost");
  });

  it("keeps superscripts on their line", () => {
    const blocks = buildBlocks(page([run("tailored for 4", 72, 700), run("th", 156, 704, { fontSize: 8 }), run("and 5", 168, 700), run("th", 198, 704, { fontSize: 8 }), run("grade students.", 210, 700)]), body);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]!.text).toMatch(/4 ?th and 5 ?th grade students/);
  });

  it("detects a table from aligned columns and folds wrapped cells", () => {
    const blocks = buildBlocks(
      page([
        run("Practice", 72, 700),
        run("Units", 300, 700),
        run("Cost", 420, 700),
        run("Water Control Structures", 72, 680),
        run("25", 300, 680),
        run("$37,500", 420, 680),
        run("Water Diversion Pads", 72, 660),
        run("(feet)", 72, 646),
        run("1000", 300, 646),
        run("$3,000", 420, 646),
        run("Rip-Rap Weirs", 72, 626),
        run("5", 300, 626),
        run("$77,000", 420, 626),
      ]),
      body,
    );
    const table = blocks.find((b) => b.type === "table");
    expect(table).toBeDefined();
    expect(table!.rows).toEqual([
      ["Practice", "Units", "Cost"],
      ["Water Control Structures", "25", "$37,500"],
      ["Water Diversion Pads (feet)", "1000", "$3,000"],
      ["Rip-Rap Weirs", "5", "$77,000"],
    ]);
  });

  it("does not turn a figure caption into a heading", () => {
    const blocks = buildBlocks(page([run("Figure 3. BMP locations in the watershed", 72, 700, { fontName: "bold" })]), body);
    expect(blocks[0]!.type).toBe("paragraph");
  });
});

describe("estimateBodyFont", () => {
  it("picks the dominant size and font resource", () => {
    const font = estimateBodyFont([page([run("A heading", 72, 700, { fontSize: 18, fontName: "h" }), run("Lots and lots of body text goes here in the normal font.", 72, 680)])]);
    expect(font.size).toBe(12);
    expect(font.fontName).toBe("body");
    expect(font.share).toBeGreaterThan(0.5);
  });
});
